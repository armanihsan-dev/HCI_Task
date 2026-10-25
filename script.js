/* ---------- helpers and localStorage "database" ---------- */
const $ = (s, r = document) => r.querySelector(s);
const db = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'A' + Date.now().toString(36).toUpperCase().slice(-5) + Math.floor(Math.random() * 90 + 10);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const t12 = t => { const [h, m] = t.split(':'); return ((h % 12) || 12) + ':' + m + (h < 12 ? ' AM' : ' PM'); };
const fmtD = d => new Date(d + 'T00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const SLOTS = []; for (let h = 9; h < 17; h++) for (const m of ['00', '30']) SLOTS.push(String(h).padStart(2, '0') + ':' + m);

if (localStorage.getItem('das_doctors') === null) db.set('das_doctors', [
  { id: 'd1', name: 'Dr. Arman', spec: 'Cardiology', exp: 12 },
  { id: 'd2', name: 'Dr. Alyan', spec: 'Dermatology', exp: 8 },
  { id: 'd3', name: 'Dr. Khalfan', spec: 'Pediatrics', exp: 10 },
]);
const getDocs = () => db.get('das_doctors', []);
const getApps = () => db.get('das_appointments', []);
const saveDocs = v => db.set('das_doctors', v);
const saveApps = v => db.set('das_appointments', v);
const docOf = a => (getDocs().find(d => d.id === a.doctorId) || { name: a.doctorName + ' (removed)' }).name;

/* ---------- validation ---------- */
const R = {
  name: v => /^[A-Za-z][A-Za-z .'-]{2,39}$/.test(v) ? '' : 'Enter 3–40 letters (spaces, . - and apostrophe allowed).',
  email: v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Enter a valid email address.',
  phone: v => /^\+?\d{10,14}$/.test(v.replace(/[\s-]/g, '')) ? '' : 'Enter 10–14 digits, optional leading +.',
  age: v => /^\d{1,3}$/.test(v) && +v >= 1 && +v <= 120 ? '' : 'Age must be a whole number from 1 to 120.',
  doctor: v => v ? '' : 'Please select a doctor.',
  date: v => !v ? 'Please choose a date.' : v < today() ? 'Date cannot be in the past.' : (new Date(v) - new Date(today())) / 864e5 > 90 ? 'Book within the next 90 days.' : '',
  time: v => v ? '' : 'Please select a time slot.',
  reason: v => v.length >= 10 && v.length <= 200 ? '' : 'Describe the reason in 10–200 characters.',
  spec: v => /^[A-Za-z][A-Za-z &-]{2,29}$/.test(v) ? '' : 'Enter 3–30 letters.',
  exp: v => /^\d{1,2}$/.test(v) && +v <= 60 ? '' : 'Enter whole years from 0 to 60.',
  user: v => v ? '' : 'Enter your username.',
  pass: v => v ? '' : 'Enter your password.',
};
function setErr(f, n, m) { f.querySelector(`[data-for="${n}"]`).textContent = m; f.elements[n].classList.toggle('bad', !!m); }
function valid(f, names) {
  let ok = true, first = null;
  names.forEach(n => { const m = R[n](f.elements[n].value.trim()); setErr(f, n, m); if (m) { ok = false; first = first || f.elements[n]; } });
  if (first) first.focus();
  return ok;
}
function live(f, names) { f.addEventListener('input', e => { if (names.includes(e.target.name)) setErr(f, e.target.name, R[e.target.name](e.target.value.trim())); }); }

/* ---------- time slots (only free ones are offered) ---------- */
function freeSlots(docId, date, skipId) {
  const used = getApps().filter(a => a.doctorId === docId && a.date === date && a.status !== 'Cancelled' && a.id !== skipId).map(a => a.time);
  const n = new Date(), now = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0');
  return SLOTS.filter(t => !used.includes(t) && !(date === today() && t <= now));
}
function fillSlots(sel, docId, date, skipId) {
  if (!docId || !date) { sel.innerHTML = '<option value="">Select doctor and date first</option>'; return; }
  const f = freeSlots(docId, date, skipId);
  sel.innerHTML = f.length ? '<option value="">Select a time</option>' + f.map(t => `<option value="${t}">${t12(t)}</option>`).join('') : '<option value="">No free slots</option>';
}

/* ---------- user side ---------- */
function initUser() {
  const f = $('#appForm'), N = ['name', 'email', 'phone', 'age', 'doctor', 'date', 'time', 'reason'];
  const E = f.elements;
  E.doctor.innerHTML = '<option value="">Select a doctor</option>' + getDocs().map(d => `<option value="${d.id}">${esc(d.name)} – ${esc(d.spec)}</option>`).join('');
  E.date.min = today();
  fillSlots(E.time);
  live(f, N);
  f.addEventListener('input', e => { if (e.target.name === 'doctor' || e.target.name === 'date') fillSlots(E.time, E.doctor.value, E.date.value); });
  f.addEventListener('submit', e => {
    e.preventDefault();
    if (!valid(f, N)) return;
    const v = n => E[n].value.trim();
    if (!freeSlots(v('doctor'), v('date')).includes(v('time'))) {
      fillSlots(E.time, v('doctor'), v('date')); setErr(f, 'time', 'That slot was just taken. Please pick another.'); return;
    }
    const a = {
      id: uid(), name: v('name'), email: v('email').toLowerCase(), phone: v('phone'), age: +v('age'), doctorId: v('doctor'),
      doctorName: getDocs().find(d => d.id === v('doctor')).name, date: v('date'), time: v('time'), reason: v('reason'), status: 'Pending', created: Date.now()
    };
    saveApps([...getApps(), a]);
    const box = $('#done'); box.hidden = false;
    box.innerHTML = `Appointment requested! Your ID is <b>${a.id}</b>.<br>${esc(a.doctorName)} · ${fmtD(a.date)} at ${t12(a.time)}. Status: Pending.`;
    f.reset(); fillSlots(E.time);
  });

  const mine = $('#mine');
  function showMine() {
    const em = $('#lookEmail').value.trim().toLowerCase();
    const msg = R.email(em); $('#lookErr').textContent = msg; if (msg) { mine.innerHTML = ''; return; }
    const list = getApps().filter(a => a.email === em).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    mine.innerHTML = list.length ? list.map(a => `<div class="item"><div><b>${esc(docOf(a))}</b><br><span class="mute">${fmtD(a.date)} · ${t12(a.time)} · ${a.id}</span></div>
      <div style="text-align:right"><span class="badge b-${a.status.toLowerCase()}">${a.status}</span>${a.status !== 'Cancelled' ? `<br><button class="btn danger sm" data-id="${a.id}" style="margin-top:.4rem">Cancel</button>` : ''}</div></div>`).join('')
      : '<p class="mute" style="margin-top:1rem">No appointments found for this email.</p>';
  }
  $('#lookBtn').addEventListener('click', showMine);
  mine.addEventListener('click', e => {
    const id = e.target.dataset.id; if (!id || !confirm('Cancel this appointment?')) return;
    saveApps(getApps().map(a => a.id === id ? { ...a, status: 'Cancelled' } : a)); showMine();
  });
}

/* ---------- admin side ---------- */
function initAdmin() {
  const gate = $('#login'), panel = $('#panel'), logout = $('#logout');
  const lf = $('#loginForm'), df = $('#docForm'), dlg = $('#dlg'), sf = $('#dlgForm');
  let cur = null;

  function show() {
    const on = sessionStorage.getItem('das_admin') === '1';
    gate.hidden = on; panel.hidden = !on; logout.hidden = !on;
    if (on) render();
  }
  live(lf, ['user', 'pass']);
  lf.addEventListener('submit', e => {
    e.preventDefault();
    if (!valid(lf, ['user', 'pass'])) return;
    if (lf.elements.user.value.trim() === 'admin' && lf.elements.pass.value === 'admin123') { sessionStorage.setItem('das_admin', '1'); lf.reset(); show(); }
    else setErr(lf, 'pass', 'Incorrect username or password.');
  });
  logout.addEventListener('click', () => { sessionStorage.removeItem('das_admin'); show(); });

  function render() {
    const apps = getApps(), c = s => apps.filter(a => a.status === s).length;
    $('#stats').innerHTML = [['Total', apps.length], ['Pending', c('Pending')], ['Scheduled', c('Scheduled')], ['Cancelled', c('Cancelled')], ['Doctors', getDocs().length]]
      .map(([k, v]) => `<div><b>${v}</b><span class="mute">${k}</span></div>`).join('');
    const q = $('#fSearch').value.trim().toLowerCase(), st = $('#fStatus').value;
    const list = apps.filter(a => (!st || a.status === st) && (!q || [a.name, a.email, a.id, docOf(a)].some(x => x.toLowerCase().includes(q))))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    $('#tbody').innerHTML = list.length ? list.map(a => `<tr><td>${a.id}</td>
      <td><b>${esc(a.name)}</b>, ${a.age}<br><span class="mute">${esc(a.phone)}<br>${esc(a.email)}</span></td>
      <td>${esc(docOf(a))}</td><td>${fmtD(a.date)}<br><span class="mute">${t12(a.time)}</span></td>
      <td class="reason">${esc(a.reason)}</td><td><span class="badge b-${a.status.toLowerCase()}">${a.status}</span></td>
      <td><div class="acts">${a.status !== 'Cancelled' ? `<button class="btn sm" data-act="schedule" data-id="${a.id}">${a.status === 'Scheduled' ? 'Reschedule' : 'Schedule'}</button><button class="btn danger sm" data-act="cancel" data-id="${a.id}">Cancel</button>` : ''}
      <button class="btn ghost sm" data-act="delete" data-id="${a.id}">Delete</button></div></td></tr>`).join('')
      : '<tr><td colspan="7" class="mute">No appointments match.</td></tr>';
    const docs = getDocs();
    $('#docs').innerHTML = docs.length ? docs.map(d => `<div class="item"><div><b>${esc(d.name)}</b><br><span class="mute">${esc(d.spec)} · ${d.exp} yrs · ${apps.filter(a => a.doctorId === d.id && a.status !== 'Cancelled').length} active appointments</span></div>
      <button class="btn danger sm" data-doc="${d.id}">Delete</button></div>`).join('') : '<p class="mute">No doctors yet. Add one above.</p>';
  }
  $('#fSearch').addEventListener('input', render);
  $('#fStatus').addEventListener('change', render);

  $('#tbody').addEventListener('click', e => {
    const { act, id } = e.target.dataset; if (!act) return;
    const a = getApps().find(x => x.id === id); if (!a) return;
    if (act === 'schedule') {
      cur = a; sf.elements.date.min = today(); sf.elements.date.value = a.date >= today() ? a.date : today();
      $('#dlgInfo').textContent = `${a.name} with ${docOf(a)}`;
      fillSlots(sf.elements.time, a.doctorId, sf.elements.date.value, a.id); sf.elements.time.value = a.time;
      ['date', 'time'].forEach(n => setErr(sf, n, '')); dlg.showModal();
    } else if (act === 'cancel' && confirm('Cancel this appointment?')) {
      saveApps(getApps().map(x => x.id === id ? { ...x, status: 'Cancelled' } : x)); render();
    } else if (act === 'delete' && confirm('Delete this appointment permanently?')) {
      saveApps(getApps().filter(x => x.id !== id)); render();
    }
  });
  live(sf, ['date', 'time']);
  sf.addEventListener('input', e => { if (e.target.name === 'date') fillSlots(sf.elements.time, cur.doctorId, e.target.value, cur.id); });
  $('#dlgCancel').addEventListener('click', () => dlg.close());
  sf.addEventListener('submit', e => {
    e.preventDefault();
    if (!valid(sf, ['date', 'time'])) return;
    const date = sf.elements.date.value, time = sf.elements.time.value;
    if (!freeSlots(cur.doctorId, date, cur.id).includes(time)) { setErr(sf, 'time', 'That slot is not available.'); return; }
    saveApps(getApps().map(x => x.id === cur.id ? { ...x, date, time, status: 'Scheduled' } : x));
    dlg.close(); render();
  });

  live(df, ['name', 'spec', 'exp']);
  df.addEventListener('submit', e => {
    e.preventDefault();
    if (!valid(df, ['name', 'spec', 'exp'])) return;
    const name = df.elements.name.value.trim();
    if (getDocs().some(d => d.name.toLowerCase() === name.toLowerCase())) { setErr(df, 'name', 'A doctor with this name already exists.'); return; }
    saveDocs([...getDocs(), { id: 'd' + Date.now().toString(36), name, spec: df.elements.spec.value.trim(), exp: +df.elements.exp.value }]);
    df.reset(); render();
  });
  $('#docs').addEventListener('click', e => {
    const id = e.target.dataset.doc; if (!id) return;
    const active = getApps().filter(a => a.doctorId === id && a.status !== 'Cancelled').length;
    if (!confirm(active ? `This doctor has ${active} active appointment(s). Deleting will cancel them. Continue?` : 'Delete this doctor?')) return;
    saveApps(getApps().map(a => a.doctorId === id && a.status !== 'Cancelled' ? { ...a, status: 'Cancelled' } : a));
    saveDocs(getDocs().filter(d => d.id !== id)); render();
  });
  show();
}

document.body.dataset.page === 'admin' ? initAdmin() : initUser();
