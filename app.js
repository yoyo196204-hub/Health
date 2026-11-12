'use strict';
// State, routing and events. Screens are in view-*.js; the maths in model.js; storage in store.js.

let S = load();
let tab = 'today', overlay = null, pending = null, day = todayKey(), lastToday = day;
let trainDay = null, cat = 'usual', query = '', installEvt = null, softQueued = false;

const VIEWS = { today: vToday, train: vTrain, recovery: vRecovery, review: vReview, me: vMe };
const ALIAS = { heart: 'recovery', trend: 'review' };

// A failure in one screen must never blank the app or touch stored data.
function render() {
  memo.clear(); softQueued = false;
  const adding = overlay?.type === 'add' && MEALS.some(m => m[0] === overlay.key);
  try {
    $('#view').innerHTML = (loadNote ? `<p class="flag banner">${loadNote}</p>` : '') + (adding ? vAdd(overlay.key) : VIEWS[tab]());
    $('#sheet').innerHTML = pending ? vImport(pending) : overlay?.type === 'why' ? vWhy(overlay.key) : '';
  } catch (err) {
    console.error(err);
    $('#sheet').innerHTML = '';
    $('#view').innerHTML = `${masthead('This screen failed', 'Your data is untouched')}${para(esc(err.message))}
      <div class="rowb"><button class="solid" data-act="export">Export backup</button><a class="ghost link" href="#today">Go to Today</a></div>`;
  }
  document.body.classList.toggle('adding', adding);
  document.body.classList.toggle('sheet-open', !!$('#sheet').innerHTML);
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.hash === '#' + tab));
}
// Renders caused by the watch or the strap wait until you have finished typing in a field.
function renderSoft() {
  if (document.activeElement?.matches?.('input:not([type=checkbox]), select, textarea')) { softQueued = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (softQueued && !document.activeElement?.matches?.('input, select, textarea')) render(); }, 250));

function route() {
  if (location.hash.startsWith('#sync=')) { hcReceive(location.hash.slice(6)); history.replaceState(null, '', '#me'); }
  let [a, b] = (location.hash.slice(1) || 'today').split('-');
  a = ALIAS[a] || a;
  const was = overlay;
  if (a === 'add' || a === 'why') overlay = { type: a, key: b };
  else { overlay = null; if (VIEWS[a]) tab = a; }
  if (overlay?.type === 'add' && was?.type !== 'add') { query = ''; cat = 'usual'; }
  render();
  if (!was && !overlay) window.scrollTo(0, 0);
}
function close() { if (history.length > 1) history.back(); else location.hash = tab; }
function refreshAdd() { const m = overlay.key; $('#rows').innerHTML = addRows(m); $('#foot').innerHTML = addFoot(m); }
// The app may stay open past midnight: the view moves on with the date if you were looking at today.
function rollDay() { const t = todayKey(); if (t !== lastToday) { if (day === lastToday) day = t; lastToday = t; return true; } return false; }

const ACT = {
  close: () => close(),
  q: el => {
    bump(el.dataset.m, food(el.dataset.id) || (S.food[day] || []).find(x => x.id === el.dataset.id), +el.dataset.d);
    return overlay?.type === 'add' ? refreshAdd() : render();
  },
  thali: el => { const [name, parts] = THALI[+el.dataset.i]; for (const [id, n] of parts) bump(el.dataset.m, food(id), n); toast(`${name} added`); refreshAdd(); },
  cat: el => { cat = el.dataset.c; query = ''; render(); },
  custom: el => {
    const f = cleanFood({ id: 'x' + Date.now(), n: $('#c_n').value, u: $('#c_u').value.trim(), k: $('#c_k').value, p: $('#c_p').value, fb: $('#c_fb').value, cat: 'mine' }, false);
    if (!f) return toast('Name and kcal are needed');
    if (S.custom.length >= 300) return toast('Limit of 300 own foods reached');
    S.custom.push(f); bump(el.dataset.m, f, 1); render();
  },
  delcustom: el => {
    const f = S.custom.find(x => x.id === el.dataset.id);
    if (!f) return;
    S.custom = S.custom.filter(x => x !== f);
    for (const m in S.freq) delete S.freq[m][f.id];
    save(); refreshAdd(); toast(`${f.n} removed from your foods. Days already logged keep it.`, 3000);
  },
  copy: el => { for (const x of S.food[shift(day, -1)].filter(x => x.m === el.dataset.m)) (S.food[day] ||= []).push({ ...x }); save(); render(); },
  day: el => { day = shift(day, +el.dataset.d); if (day > todayKey()) day = todayKey(); trainDay = null; render(); },
  today: () => { day = todayKey(); trainDay = null; render(); },
  goday: el => { day = el.dataset.k; trainDay = null; render(); },
  // Switching the session letter carries already-logged sets with it; they still count toward the week.
  tday: el => { trainDay = el.dataset.d; if (S.lifts[day]) { S.lifts[day].day = trainDay; save(); } render(); },
  full: () => { S.full[day] = !isComplete(day); save(); render(); },
  profile: () => {
    const dob = $('#p_dob').value, age = (Date.now() - Date.parse(dob)) / (365.25 * DAY);
    Object.assign(S.profile, {
      sex: $('#p_sex').value, dob: DATE.test(dob) && age >= 12 && age <= 100 ? dob : S.profile.dob,
      h: num($('#p_h').value, 120, 230) ?? S.profile.h, w0: num($('#p_w0').value, 30, 250) ?? S.profile.w0,
      waist0: num($('#p_waist0').value, 40, 200) ?? S.profile.waist0, days: +$('#p_days').value, equip: $('#p_equip').value, shoulder: $('#p_sh').checked,
    });
    save(); render(); toast('Saved');
  },
  install: () => { installEvt?.prompt(); installEvt = null; },
  export: () => { S.meta.exported = todayKey(); save(); saveText(`health-${todayKey()}.json`, JSON.stringify(S)); render(); },
  import: () => $('#imp').click(),
  importok: () => {
    try { localStorage.setItem(KEY + '.bak', JSON.stringify(S)); } catch (e) { /* best effort */ }
    S = pending.data; pending = null; save(); render(); toast('Imported'); syncNow();
  },
  importno: () => { pending = null; render(); },
  move: () => moveToApp(),
  sync: () => syncNow(),
  fullsync: () => syncNow(90),
  hcask: () => hcAsk(),
  zepp: () => nat('openZepp'),
  bkpick: () => nat('backupPick'),
  shareweek: () => { const T = targets(); shareText('Health · week', shareWeek(T, range(7).map(k => dayCells(k, T)), energy())); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.act;
  if (ACT[a]) return ACT[a](el);
  if (a.startsWith('hr')) return hrAct(a, el);
  if (a.startsWith('w')) return watchAct(a);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  query = e.target.value;
  $('#rows').innerHTML = addRows(overlay.key);
  $$('.chips button').forEach(b => b.classList.toggle('on', !query && b.dataset.c === cat));
});
// Saved without re-rendering, so the keyboard and focus stay put between fields.
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.log) {
    const stream = el.dataset.log, v = num(el.value, ...LIMITS[stream]);
    if (MANUAL.includes(stream)) setManual(stream, day, v);
    else if (v == null) delete S[stream][day]; else S[stream][day] = v;
    if (v == null && el.value !== '') { el.value = ''; toast('That value is out of range'); }
    el.closest('label')?.querySelector('.src')?.remove();
    save();
  }
  else if (el.dataset.lift) logLift(el);
  else if (el.dataset.act === 'prehab') { if (el.checked) S.prehab[day] = true; else delete S.prehab[day]; save(); }
  else if (el.id === 'wfile' && el.files.length) { watchRead(el.files); el.value = ''; }
  else if (el.id === 'imp' && el.files[0]) {
    const f = el.files[0]; el.value = '';
    if (f.size > 20e6) return toast('That file is too large to be a Health backup');
    f.text().then(txt => {
      const data = JSON.parse(txt);
      if (!obj(data) || !data.profile || !data.food) throw new Error('bad file');
      pending = { type: 'import', data: sanitize(data), from: f.name }; render();
    }).catch(() => toast('That file is not a Health backup'));
  }
});

addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (tab === 'me' && !overlay) render(); });
// Another tab changed the data: reload it rather than overwrite it.
addEventListener('storage', e => { if (e.key === KEY) { S = load(); render(); } });
addEventListener('error', () => toast('Something went wrong. Your data is safe.'));
addEventListener('unhandledrejection', () => toast('Something went wrong. Your data is safe.'));
document.addEventListener('visibilitychange', () => { if (!document.hidden && !NATIVE && rollDay()) render(); });

dailyBackup();
navigator.storage?.persist?.().catch(() => {});
if (NATIVE) { document.documentElement.classList.add('native'); hcCheck(); backupInfo(); autoBackup(); }
route();
if (!NATIVE && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
