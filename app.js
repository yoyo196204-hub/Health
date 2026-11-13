'use strict';
// State, routing and events. Screens are in view-*.js; the maths in model.js and train.js; storage in store.js;
// haptics, motion and sheets in feel.js.

// Every script ends by adding itself to LOADED. If any is missing, the files on this phone are from two
// different versions (an update that arrived halfway, or a file that failed to load). Starting anyway would
// show broken screens, so the app stops here, says why, and offers a clean reload. Stored data is not touched.
(function boot() {
  const want = [...document.scripts].map(s => (s.getAttribute('src') || '').split('?')[0]).filter(Boolean);
  const missing = want.filter(f => f !== 'app.js' && !(self.LOADED || []).includes(f));
  if (!missing.length) return;
  document.body.className = '';
  document.getElementById('view').innerHTML = '<div style="max-width:30rem;margin:18vh auto 0;padding:0 20px;font:16px/1.5 system-ui,sans-serif;color:#1f1a14;text-align:center">' +
    '<h1 style="font:600 26px Georgia,serif;margin:0 0 10px">Health didn’t load completely</h1>' +
    '<p style="color:#6f6557">An update arrived halfway, so some files on this phone are from the old version. Your data is safe; nothing has been changed.</p>' +
    '<button id="reboot" style="font:600 16px system-ui,sans-serif;border:0;border-radius:999px;padding:14px 26px;background:#1f1a14;color:#f5efe3;margin-top:10px">Reload</button>' +
    '<p style="color:#6f6557;font-size:13px;margin-top:18px">Not loaded: ' + missing.join(', ') + '</p></div>';
  document.getElementById('reboot').onclick = () => {
    const go = () => location.replace(location.pathname + '?r=' + Date.now() + location.hash);
    (self.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()).then(go, go);
  };
  throw new Error('Health stopped: not loaded ' + missing.join(', '));
})();

let S = load();
let tab = 'today', overlay = null, pending = null, day = todayKey(), lastToday = day;
let cat = 'usual', query = '', installEvt = null, softQueued = false;

const VIEWS = { today: vToday, recovery: vRecovery, training: vTraining, review: vReview, me: vMe };
const TABS = Object.keys(VIEWS);
const ALIAS = { heart: 'recovery', trend: 'review', train: 'training' };
const POPS = { fedit: p => vFoodEdit(p.i), exinfo: p => vExInfo(p.id), cardioadd: () => vCardioAdd(), cardioinfo: p => vCardioInfo(p), sess: p => vSession(p) };
const scrollMem = {};
const BUILD = (document.querySelector('script[src^="app.js"]')?.getAttribute('src').split('v=')[1]) || 'dev';

// A failure in one screen must never blank the app or touch stored data.
function render() {
  memo.clear(); softQueued = false;
  settleTargets();
  const adding = overlay?.type === 'add' && MEALS.some(m => m[0] === overlay.key), setting = overlay?.type === 'set';
  try {
    const banner = (loadNote ? `<p class="flag banner">${loadNote} <button class="link" data-act="dismissnote">OK</button></p>` : '') + (saveFailed ? '<p class="flag banner">Storage is full or blocked: changes are not being kept. Export a backup from Me › Backup and data.</p>' : '');
    $('#view').innerHTML = banner + (adding ? vAdd(overlay.key) : setting ? vSet(overlay.key) : VIEWS[tab]());
    $('#sheet').innerHTML = pending ? (pending.type === 'halftone' ? vHalftone(pending) : pending.type === 'opengym' ? vOpenGym(pending) : vImport(pending)) : pop && POPS[pop.kind] ? part(POPS[pop.kind], pop) : overlay?.type === 'why' ? vWhy(overlay.key) : '';
  } catch (err) {
    console.error(err);
    $('#sheet').innerHTML = '';
    $('#view').innerHTML = `${masthead('This screen failed', 'Your data is untouched')}${para(esc(err.message))}
      <div class="rowb"><button class="solid" data-act="export">Export backup</button><a class="ghost link" href="#today">Go to Today</a></div>`;
  }
  document.body.classList.toggle('adding', adding);
  document.body.classList.toggle('setting', setting);
  document.body.classList.toggle('sheet-open', !!$('#sheet').innerHTML);
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.hash === '#' + tab));
  $('#tabs').style.setProperty('--i', TABS.indexOf(tab));
  document.documentElement.classList.toggle('still', !motionOK());
  sheetEntered(); settle();
}
// Renders caused by the watch or the strap wait until you have finished typing in a field.
function renderSoft() {
  if (document.activeElement?.matches?.('input:not([type=checkbox]), select, textarea')) { softQueued = true; return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (softQueued && !document.activeElement?.matches?.('input, select, textarea')) render(); }, 250));

function route() {
  let [a, b] = (location.hash.slice(1) || 'today').split('-');
  a = ALIAS[a] || a;
  const was = overlay, wasTab = tab;
  let next = null, nextTab = tab;
  if (a === 'add' || a === 'why' || a === 'set') next = { type: a, key: b };
  else if (VIEWS[a]) nextTab = a;
  if (next?.type === 'add' && was?.type !== 'add') { query = ''; cat = 'usual'; }
  const page = o => o && (o.type === 'add' || o.type === 'set');
  let dir = null, top = false;
  if (page(next) && !(page(was) && was.key === next.key)) { dir = 'push'; top = true; if (!page(was)) scrollMem[wasTab] = scrollY; }
  else if (!page(next) && page(was)) dir = 'pop';
  else if (!next && !was && nextTab !== wasTab) { dir = TABS.indexOf(nextTab) > TABS.indexOf(wasTab) ? 'fwd' : 'back'; top = true; buzz('tick'); }
  const go = () => {
    overlay = next; tab = nextTab; pop = null;
    render();
    if (top) scrollTo(0, 0);
    else if (dir === 'pop') scrollTo(0, scrollMem[tab] || 0);
  };
  dir ? transition(dir, go) : go();
}
function goBack() { if (history.length > 1) history.back(); else location.hash = tab; }
function refreshAdd() { const m = overlay.key; $('#rows').innerHTML = addRows(m); $('#foot').innerHTML = addFoot(m); settle(); }
// The app may stay open past midnight: the view moves on with the date if you were looking at today.
function rollDay() { const t = todayKey(); if (t !== lastToday) { if (day === lastToday) day = t; lastToday = t; return true; } return false; }
function applyTheme() {
  const t = S.settings.theme, root = document.documentElement;
  if (t === 'system') delete root.dataset.theme; else root.dataset.theme = t;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  nat('setTheme', dark);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

const ACT = {
  close: () => goBack(),
  popclose: () => closePop(),
  dismissnote: () => { loadNote = ''; render(); },
  q: el => {
    bump(el.dataset.m, food(el.dataset.id) || (S.food[day] || []).find(x => x.id === el.dataset.id), +el.dataset.d);
    return overlay?.type === 'add' ? refreshAdd() : render();
  },
  thali: el => { const [name, parts] = THALI[+el.dataset.i]; for (const [id, n] of parts) bump(el.dataset.m, food(id), n); buzz('ok'); toast(`${name} added`); refreshAdd(); },
  cat: el => { cat = el.dataset.c; query = ''; buzz('tick'); render(); },
  custom: el => {
    const f = cleanFood({ id: 'x' + Date.now(), n: $('#c_n').value, u: $('#c_u').value.trim(), k: $('#c_k').value, p: $('#c_p').value, fb: $('#c_fb').value, cat: 'mine' }, false);
    if (!f) { buzz('warn'); return toast('Name and kcal are needed'); }
    if (S.custom.length >= 300) { buzz('warn'); return toast('Limit of 300 own foods reached'); }
    S.custom.push(f); bump(el.dataset.m, f, 1); buzz('ok'); render();
  },
  quick: el => {
    const k = num($('#k_k').value, 1, 5000), p = num($('#k_p').value, 0, 500) ?? 0;
    if (k == null) { buzz('warn'); return toast('Enter the calories'); }
    const f = { id: 'q' + Date.now(), n: $('#k_n').value.trim().slice(0, 60) || 'Quick add', u: 'entry', k, p, fb: 0, cat: 'quick' };
    bump(el.dataset.m, f, 1); buzz('ok'); toast(`${fmt(k)} kcal added`); render();
  },
  delcustom: el => {
    const f = S.custom.find(x => x.id === el.dataset.id);
    if (!f) return;
    const i = S.custom.indexOf(f), fr = Object.fromEntries(Object.keys(S.freq).map(m => [m, S.freq[m][f.id]]));
    S.custom.splice(i, 1);
    for (const m in S.freq) delete S.freq[m][f.id];
    save(); refreshAdd();
    undoable(`${f.n} removed from your foods`, () => { S.custom.splice(i, 0, f); for (const m in fr) if (fr[m]) S.freq[m][f.id] = fr[m]; });
  },
  copy: el => { for (const x of S.food[shift(day, -1)].filter(x => x.m === el.dataset.m)) (S.food[day] ||= []).push({ ...x }); save(); buzz('ok'); render(); },
  day: el => { const d = +el.dataset.d; transition(d < 0 ? 'back' : 'fwd', () => { day = shift(day, d); if (day > todayKey()) day = todayKey(); buzz('tick'); render(); }); },
  today: () => transition('fwd', () => { day = todayKey(); buzz('tick'); render(); }),
  full: () => { S.full[day] = !isComplete(day); save(); buzz('tick'); render(); },
  profile: () => {
    const dob = $('#p_dob').value, age = (Date.now() - Date.parse(dob)) / (365.25 * DAY);
    Object.assign(S.profile, {
      sex: $('#p_sex').value, dob: DATE.test(dob) && age >= 12 && age <= 100 ? dob : S.profile.dob,
      h: num($('#p_h').value, 120, 230) ?? S.profile.h, w0: num($('#p_w0').value, 30, 250) ?? S.profile.w0,
      waist0: num($('#p_waist0').value, 40, 200) ?? S.profile.waist0, days: +$('#p_days').value,
    });
    save(); buzz('ok'); render(); toast('Profile saved');
  },
  muscle: el => { mapSel = mapSel === el.dataset.m ? null : el.dataset.m; buzz('tick'); render(); },
  rmread: el => {
    const s = el.dataset.s, k = el.dataset.k, was = S[s][k], man = S.manual[s]?.[k];
    if (was == null) return;
    delete S[s][k]; if (S.manual[s]) delete S.manual[s][k];
    save(); render();
    undoable(`${dateLabel(k)} removed`, () => { S[s][k] = was; if (man) S.manual[s][k] = man; });
  },
  refresh: () => refreshAll(),
  install: () => { installEvt?.prompt(); installEvt = null; },
  export: () => { S.meta.exported = todayKey(); save(); saveText(`health-${todayKey()}.json`, JSON.stringify(S)); render(); },
  import: () => $('#imp').click(),
  importok: () => {
    snapshot('Before importing a backup');
    S = sanitize(pending.data); S.meta.welcomed = true; pending = null; save(); applyTheme(); buzz('done'); render();
    toast('Imported', 7000, { label: 'Undo', fn: () => { restoreSnapshot(); applyTheme(); render(); toast('Import undone'); } });
    syncNow();
  },
  importno: () => { pending = null; render(); },
  move: () => moveToApp(),
  sync: () => { buzz('tick'); syncNow(); },
  fullsync: () => syncNow(90),
  hcask: () => hcAsk(),
  zepp: () => nat('openZepp'),
  bkpick: () => { S.meta.welcomed = true; save(); nat('backupPick'); },
  shareweek: () => { const T = targets(); shareText('Health · week', shareWeek(T, range(7).map(k => dayCells(k, T)), energy())); },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  // The click that ends a press-and-repeat has already been counted.
  if (el.dataset.repeat && e.isTrusted && repeated === el.dataset.repeat) { repeated = ''; return; }
  const a = el.dataset.act;
  if (ACT[a]) return ACT[a](el);
  if (trainAct(a, el) || foodAct(a, el) || setAct(a, el) || ogAct(a, el)) return;
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
    const stream = el.dataset.log, v = num(el.value, ...LIMITS[stream]), prev = S[stream][day], prevMan = S.manual[stream]?.[day];
    if (MANUAL.includes(stream)) setManual(stream, day, v);
    else if (v == null) delete S[stream][day]; else S[stream][day] = v;
    if (v == null && el.value !== '') { el.value = ''; buzz('warn'); toast('That value is out of range'); }
    el.closest('label')?.querySelector('.src')?.remove();
    save();
    const off = stream === 'weights' && v != null ? weighCheck(day, v) : null;
    if (off != null) {
      buzz('warn');
      toast(`${sign(off, 1)} kg from your trend. A typo?`, 7000, { label: 'Undo', fn: () => { if (prev == null) setManual(stream, day, null); else { S[stream][day] = prev; if (!prevMan) delete S.manual[stream][day]; } save(); render(); } });
    } else if (v != null) buzz('ok');
    // A check-in on Today is done once it has a value: redraw when you leave the field, so it drops off the list.
    if (el.closest('.ci') && v != null) softQueued = true;
  }
  else if (el.dataset.lift) logLift(el);
  else if (el.dataset.act === 'prehab') { if (el.checked) S.prehab[day] = true; else delete S.prehab[day]; save(); buzz(el.checked ? 'ok' : 'tick'); render(); }
  else if (el.dataset.act === 'shoulder') { S.profile.shoulder = el.checked; save(); buzz('tick'); render(); }
  else if (el.dataset.act === 'cutg') { CUT.groups[el.dataset.v] = el.checked; buzz('tick'); render(); }
  else if (el.id === 'wfile' && el.files.length) { watchRead(el.files); el.value = ''; }
  else if (el.id === 'ogimp' && el.files[0]) { const f = el.files[0]; el.value = ''; ogFile(f); }
  else if ((el.id === 'imp' || el.id === 'htimp') && el.files[0]) {
    const f = el.files[0]; el.value = '';
    if (f.size > 30e6) { buzz('warn'); return toast('That file is too large to be a backup'); }
    f.text().then(txt => {
      // An openGym backup or spreadsheet picked here goes the openGym way: added, never replacing anything.
      const og = ogParse(txt);
      if (og && !og.error) return ogReceive(txt, f.name, '', false);
      const data = JSON.parse(txt), ht = halftoneProfiles(data);
      if (ht) {
        if (!ht.length) throw new Error('empty');
        const pick = ht.reduce((b, x, i) => x.conv.days > ht[b].conv.days ? i : b, 0);
        pending = { type: 'halftone', profiles: ht, pick, from: f.name };
      } else {
        if (!obj(data) || !data.profile || !data.food) throw new Error('bad file');
        pending = { type: 'import', data: sanitize(data), from: f.name };
      }
      render();
    }).catch(() => { buzz('warn'); toast('That file is not a Health, Halftone or openGym backup'); });
  }
});

addEventListener('hashchange', route);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (tab === 'me' && !overlay) render(); });
// Another tab changed the data: reload it rather than overwrite it.
addEventListener('storage', e => { if (e.key === KEY) { S = load(); render(); } });
addEventListener('error', () => toast('Something went wrong. Your data is safe.'));
addEventListener('unhandledrejection', () => toast('Something went wrong. Your data is safe.'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { remindPlan(); return flushMirror(); }
  if (!NATIVE && rollDay()) render();
});

applyTheme();
dailyBackup();
navigator.storage?.persist?.().catch(() => {});
if (NATIVE) { document.documentElement.classList.add('native'); hcCheck(); backupInfo(); autoBackup(); ogInfo(); ogAuto(); remindStatus(); remindPlan(); }
if (recovered === 'mirror') save();
route();
if (!NATIVE && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('app.js');
