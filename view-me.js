'use strict';
// Me: your numbers, and every setting, each on its own page: goal, training, profile, data sources,
// backup and data, and how the app feels.

const SETPAGES = {
  goal: ['Goal and targets', () => vSetGoal()], train: ['Training', () => vSetTrain()], profile: ['Profile', () => vSetProfile()],
  sources: ['Data sources', () => sourcesSection()], data: ['Backup and data', () => vSetData()], feel: ['Feel', () => vSetFeel()],
  evid: ['The evidence', () => `<ul class="list evid">${Object.entries(EVID).map(([k, e]) => `<li><a href="#why-${k}"><span class="nm">${e.t} ${pill(e.lv)}</span><span class="sub">${e.g}</span></a></li>`).join('')}</ul>`],
};
function vMe() {
  const p = S.profile, T = targets(), H = hrProfile(), P = prog();
  const cls = T.bmi >= 25 ? 'obese' : T.bmi >= 23 ? 'overweight' : T.bmi >= 18.5 ? 'normal' : 'underweight';
  const standalone = NATIVE || matchMedia('(display-mode: standalone)').matches;
  const bk = !NATIVE ? (S.meta.exported ? `Last export ${dateLabel(S.meta.exported)}` : 'Never exported') : BACKUP.folder ? `Daily to ${esc(BACKUP.folder)}${S.meta.backup ? `, last ${dateLabel(S.meta.backup)}` : ''}` : 'No backup folder yet';
  const stale = NATIVE && BACKUP.folder && S.meta.backup && gapDays(S.meta.backup, todayKey()) >= 3;
  return `${masthead('Me', `${Math.floor(ageYears())} years · ${p.h} cm · ${r1(T.wt)} kg`)}
    ${stale ? `<p class="flag banner">The daily backup has not been written since ${dateLabel(S.meta.backup)}. Open Backup and data and choose the folder again.</p>` : ''}
    ${sec('Your numbers', table([
      trow(why('kcal', 'Calories'), `${fmt(T.kcal)} kcal`, 'strong'),
      trow(why('protein', 'Protein'), `${T.protein} g`, 'strong'),
      trow(why('spread', 'Protein per main meal'), `${T.perMeal} g`),
      trow(why('fibre', 'Fibre'), `${T.fibre} g`),
      trow(why('steps', 'Steps'), fmt(T.stepGoal)),
      trow(why('kcal', `Daily burn, ${Math.round(T.trust * 100)}% from your data`), `${fmt(T.tdee)} kcal`),
      trow(why('zones', 'Heart-rate zones'), `${H.zones[0]} / ${H.zones[1]} / ${H.zones[2]}`),
      trow(why('waist', 'BMI, Indian cut-offs'), `${r1(T.bmi)}, ${cls}`)]) + (T.locked ? para(`Targets hold until ${dateLabel(T.next, { weekday: 'long', day: 'numeric', month: 'short' })}. ${why('lock', 'Why')}`) : ''))}
    <nav class="group">
      ${navrow('#set-goal', 'Goal and targets', `${PACE[S.settings.pace][0]}${PACE[S.settings.pace][1] ? ` · ${PACE[S.settings.pace][1]}% a week` : ''} · protein ${S.settings.protein === 'high' ? 'higher' : 'standard'}`, ICON.goal)}
      ${navrow('#set-train', 'Training', `${esc(P.short)} · ${p.equip === 'home' ? 'home' : 'gym'}${p.shoulder ? ' · shoulder care' : ''}`, ICON.lift)}
      ${navrow('#set-profile', 'Profile', `${p.sex === 'm' ? 'Male' : 'Female'} · ${p.h} cm · started at ${p.w0} kg`, ICON.person)}
      ${navrow('#set-sources', 'Data sources', NATIVE ? (SYNC.status?.granted?.length ? `Health Connect · synced ${S.meta.sync ? ago(S.meta.sync) : 'not yet'}` : 'Health Connect not connected') : 'Zepp files, H9', ICON.link)}
      ${navrow('#set-data', 'Backup and data', bk, ICON.box)}
      ${navrow('#set-feel', 'Feel', `Haptics ${S.settings.haptics} · motion ${S.settings.motion} · ${S.settings.theme} theme`, ICON.hand)}
      ${navrow('#set-evid', 'The evidence', `${Object.keys(EVID).length} topics, each with its sources`, ICON.book)}
    </nav>
    ${standalone ? '' : sec('Use as an app in Chrome', installEvt ? '<button class="solid" data-act="install">Install</button>' : para('Open this page in Chrome itself, not inside another app. Tap ⋮ at the top right, then <b>Add to Home screen</b>.'))}
    <p class="note">${NATIVE ? `Health ${esc(APP.version || '')}. The app has no internet permission: nothing you log, and nothing from the watch, can leave this phone.` : 'Everything stays in this browser on this device. Nothing is sent anywhere.'}</p>`;
}
function vSet(key) {
  const P = SETPAGES[key];
  if (!P) return vMe();
  return `${masthead(P[0], 'Me', { before: '<button class="nav" data-act="close" aria-label="Back">‹</button>' })}<div class="setpage">${part(P[1])}</div>`;
}

// ---------- goal ----------
function vSetGoal() {
  const T = targets(), L = liveTargets();
  return `${sec('Pace', `${seg('pace', Object.entries(PACE).map(([k, v]) => [k, v[0]]), S.settings.pace)}
      ${para(`${PACE[S.settings.pace][2]}${PACE[S.settings.pace][1] ? ` Asked for: about ${r1(PACE[S.settings.pace][1] / 100 * T.wt)} kg a week.` : ''}`)}
      ${PACE[S.settings.pace][1] ? para(`Your deficit is <b>${fmt(L.deficit)} kcal a day</b>, about ${r1(L.deficit * 7 / 7700)} kg a week${PACE[S.settings.pace][1] / 100 * T.wt * 1100 > 0.25 * L.tdee + 1 ? ', held to a quarter of your daily burn so it stays sustainable' : ''}${L.live <= (S.profile.sex === 'm' ? 1600 : 1400) ? `, and calories never go below ${S.profile.sex === 'm' ? '1,600' : '1,400'}` : ''}.`) : ''}`, { why: ['rate', 'Why these'] })}
    ${sec('Protein', `${seg('protein', [['std', 'Standard · 1.6 g/kg'], ['high', 'Higher · 2.0 g/kg']], S.settings.protein)}
      ${para(S.settings.protein === 'high' ? 'Upper end of the range, worth it when the deficit is large or appetite is the struggle: protein is the most filling thing you can eat.' : 'Where the benefit for muscle levels off in the meta-analysis. Plenty for most.')}`, { why: ['protein', 'The evidence'] })}
    ${sec('This week', table([
      trow('Calories', `${fmt(T.kcal)} kcal`, 'strong'), trow('Protein', `${T.protein} g`, 'strong'),
      trow('Live estimate today', `${fmt(L.live)} kcal · ${L.liveProtein} g`, 'muted'),
      trow('Next update', dateLabel(T.next, { weekday: 'long', day: 'numeric', month: 'short' }))]) +
      para(`The target holds for the week so it does not move with each day’s steps. ${why('lock', 'Why')}`) +
      `<div class="rowb"><button class="ghost" data-act="retarget">Recalculate now</button></div>`)}`;
}

// ---------- training ----------
function vSetTrain() {
  const s = S.settings, p = S.profile;
  return `${sec('Programme', `<ul class="list picks">${Object.entries(PROGRAMS).map(([k, P]) => `<li><button class="rowbtn ${s.prog === k ? 'on' : ''}" data-act="prog" data-v="${k}"><span class="radio"></span><span class="grow"><span class="nm">${esc(P.n)}</span><span class="sub">${esc(P.blurb)}</span></span></button></li>`).join('')}</ul>
      ${para('Changing programme keeps every session you have logged; the next session starts at the first day of the new one.')}`, { why: ['lift', 'Why this plan'] })}
    ${sec('Where you train', seg('equip', [['gym', 'Gym'], ['home', 'Dumbbells at home']], p.equip) + para(p.equip === 'home' ? 'Gym exercises are replaced by the closest dumbbell, band or bodyweight version.' : 'The programme as written.'))}
    ${sec('Shoulder care', `<label class="toggle"><input type="checkbox" data-act="shoulder" ${p.shoulder ? 'checked' : ''}><span class="grow"><b>Protect a sore shoulder</b><span class="sub">No loaded overhead end range or flyes, laterals to shoulder height, a five-minute warm-up, and a quick “how did it feel” after shoulder exercises.</span></span><i class="sw"></i></label>`, { why: ['shoulder', 'How it works'] })}
    ${sec('Rest timer', seg('rest', [[0, 'Auto'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [150, '2:30'], [180, '3:00'], [240, '4:00']], s.rest, 'scroll') + para(s.rest ? 'The same rest after every set.' : 'Auto: 2:30 after exercises that use several big muscles, 1:30 after small ones, 1:00 after holds.'), { why: ['rest', 'Why'] })}
    ${sec('Equipment', `<h3>Barbell</h3>${seg('bar', [[20, '20 kg'], [15, '15 kg'], [10, '10 kg'], [0, 'No plate maths']], s.bar)}
      <h3>Smallest dumbbell step</h3>${seg('dbstep', [[1, '1 kg'], [2, '2 kg'], [2.5, '2.5 kg']], s.dbStep)}${para('When a dumbbell exercise earns more weight, it goes up by this much.')}`)}`;
}

// ---------- profile ----------
function vSetProfile() {
  const p = S.profile, field = (label, id, v, attrs = 'type="number" inputmode="decimal"') => `<label>${label}<input id="${id}" ${attrs} value="${v}"></label>`;
  return `<div class="fgrid">
      <label>Sex<select id="p_sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      ${field('Date of birth', 'p_dob', p.dob, 'type="date"')}
      ${field('Height, cm', 'p_h', p.h)}
      <label>Training days a week<select id="p_days">${[2, 3, 4, 5, 6].map(n => `<option ${p.days == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${field('Start weight, kg', 'p_w0', p.w0)}
      ${field('Start waist, cm', 'p_waist0', p.waist0)}</div>
    ${para('Start weight and waist are where the progress lines begin. Training days feed the burn estimate.')}
    <button class="solid wide" data-act="profile">Save profile</button>`;
}

// ---------- feel ----------
function vSetFeel() {
  const s = S.settings;
  return `${sec('Haptics', seg('haptics', [['full', 'Full'], ['subtle', 'Subtle'], ['off', 'Off']], s.haptics) + para(s.haptics === 'off' ? 'No vibration at all.' : s.haptics === 'subtle' ? 'Only for finished sets, saves and warnings.' : 'A light tick for every change, a firmer pulse for a finished set, a pattern for a finished session.') +
      `<div class="rowb tight">${['tick', 'ok', 'done', 'warn'].map(k => `<button class="mini" data-act="trybuzz" data-v="${k}">${{ tick: 'Tick', ok: 'Set done', done: 'Session done', warn: 'Warning' }[k]}</button>`).join('')}</div>`)}
    ${sec('Motion', seg('motion', [['system', 'As the phone'], ['full', 'Full'], ['reduced', 'Reduced']], s.motion) + para('Screens slide and numbers count up. Reduced switches all of it off.'))}
    ${sec('Theme', seg('theme', [['system', 'As the phone'], ['light', 'Light'], ['dark', 'Dark']], s.theme))}`;
}

// ---------- data sources ----------
function sourcesSection() {
  const n = o => Object.keys(o).filter(k => gapDays(k, todayKey()) < 30).length;
  const got = `Last 30 days in the app: steps ${n(S.steps)} · sleep ${n(S.sleep)} · resting heart rate ${n(S.rhr)} · watch workouts ${n(S.ex)} · weigh-ins ${n(S.weights)}`;
  let hc;
  if (NATIVE) {
    const st = SYNC.status, granted = st?.granted?.length || 0;
    hc = !st ? para('Checking Health Connect…')
      : st.sdk !== 'ok' ? para(st.sdk === 'update' ? 'Health Connect needs an update from the Play Store.' : 'Health Connect is not available on this phone.', 'flag')
      : `${para(granted ? `${granted} of ${st.all} data types allowed${st.history ? ', including history older than 30 days' : ''}. ${S.meta.sync ? `Synced ${ago(S.meta.sync)}.` : 'Not synced yet.'} The app syncs by itself each time you open it.` : 'Not connected yet. Allow access and the app fills itself in each time you open it.')}
        ${para(got)}
        <div class="rowb">${granted ? `<button class="solid" data-act="sync" ${SYNC.busy ? 'disabled' : ''}>${SYNC.busy ? 'Syncing…' : 'Sync now'}</button><button class="ghost" data-act="fullsync">Re-read 90 days</button>` : ''}<button class="${granted ? 'ghost' : 'solid'}" data-act="hcask">${granted ? 'Permissions' : 'Allow access'}</button></div>
        ${para('In Zepp: Profile › Health Connect (under third-party access). Turn on every type, so steps, sleep, heart rate, workouts and weight all flow through.')}`;
  } else {
    hc = `${para('Inside the Android app, steps, sleep, heart rate, workouts and weight arrive by themselves from Health Connect, and the H9 reconnects on its own. In Chrome, use the Zepp export below.')}
      <div class="rowb"><a class="solid link" href="${APK}" download>Get the Android app</a><button class="ghost" data-act="move">Move my data to the app</button></div>
      ${para('Install the app first, then tap Move. Everything here is handed over in one step, and nothing is deleted from Chrome.')}`;
  }
  const strap = S.meta.h9 && NATIVE ? `${para(`${esc(S.meta.h9.name)} is remembered and reconnects with one tap${HR.battery != null ? `; battery ${HR.battery}%` : ''}.`)}<button class="ghost" data-act="hrforget">Forget this strap</button>`
    : para(`Connect from Train or Recovery. ${NATIVE ? 'The app remembers it after the first time.' : ''}`);
  const zepp = watchPreview ? watchPreviewBlock() : `<details class="inner"><summary>Import a Zepp export instead</summary><ol class="sub steps"><li>Zepp › Profile › Settings › Account › Export data. Pick activity, sleep and heart rate.</li><li>Zepp emails a zip with a password. Unzip it in your Files app.</li><li>Tap below and select the CSV files together.</li></ol>
      <button class="ghost" data-act="wpick">Choose Zepp files</button></details>`;
  return `<h3>Health Connect ${NATIVE ? '' : '<span class="src">in the app</span>'}</h3>${hc}<h3>Polar H9</h3>${strap}<h3>Amazfit files</h3>${zepp}
    <input type="file" id="wfile" accept=".csv,text/csv,text/comma-separated-values" multiple hidden>`;
}

// ---------- backup and data ----------
const CUT = { months: 12, groups: { food: true, activity: true, body: false, training: false } };
function cutDate() { const d = new Date(); d.setMonth(d.getMonth() - CUT.months); return dk(d); }
function vSetData() {
  const U = usage(), snap = snapInfo(), groups = Object.keys(CUT.groups).filter(g => CUT.groups[g]);
  const pre = groups.length ? prune(cutDate(), groups, true) : { days: 0, n: {} };
  const auto = NATIVE ? (BACKUP.folder ? para(`A copy goes to <b>${esc(BACKUP.folder)}</b> once a day${S.meta.backup ? `; last on ${dateLabel(S.meta.backup)}` : ''}, plus one kept for each month. It survives uninstalling the app.`) + '<div class="rowb"><button class="ghost" data-act="bkpick">Change folder</button><button class="ghost" data-act="bknow">Back up now</button></div>'
    : para('Choose a folder, say Documents, and the app writes a copy there every day. If the phone or the app is ever replaced, import that file and nothing is lost.') + '<div class="rowb"><button class="solid" data-act="bkpick">Choose backup folder</button></div>') : '';
  const fmtN = n => Object.entries(n).filter(([, c]) => c).map(([k, c]) => `${c} ${({ food: 'food days', full: 'day flags', weights: 'weigh-ins', waist: 'waist readings', steps: 'step days', sleep: 'nights', sleepx: 'sleep details', rhr: 'resting HR days', wx: 'watch extras', ex: 'watch workout days', hrv: 'morning checks', lifts: 'lifting sessions', cardio: 'cardio days', prehab: 'warm-ups', swaps: 'swaps' })[k] || k}`).join(', ');
  return `${sec('Backup', `${auto}${para(`Everything lives on this phone${NATIVE ? ', with a second private copy the app keeps for itself' : ' in this browser'}, and an automatic copy of the day before. ${S.meta.exported ? `Last export ${dateLabel(S.meta.exported)}.` : 'Never exported.'}`)}
      <div class="rowb"><button class="ghost" data-act="export">Export a file</button><button class="ghost" data-act="import">Import a file</button><input type="file" id="imp" accept="application/json,.json" hidden></div>`)}
    ${snap && Date.now() - snap.at < 14 * DAY ? sec('Undo', `${para(`A copy was kept ${ago(snap.at)}: ${esc(snap.why)}.`)}<button class="ghost" data-hold="snaprestore">Hold to go back to it</button>`) : ''}
    ${sec('Bring in Halftone', `${para('Your lifting history from Halftone: every completed set, shoulder reports, bodyweight and logged cardio. Halftone’s five demonstration sessions are recognised and left out. Days already in Health are kept as they are.')}
      <div class="rowb"><button class="ghost" data-act="htpick">Choose a Halftone backup</button><input type="file" id="htimp" accept="application/json,.json" hidden></div>`)}
    ${sec('What is stored', `${table(U.groups.map(g => trow(g.label, g.days ? `${fmt(g.days)} days${g.first ? ` <i>since ${dateLabel(g.first, { month: 'short', year: 'numeric' })}</i>` : ''}` : DASH)))}
      ${para(`${bytes(U.bytes)} in all. ${U.bytes > 3e6 ? 'Getting large for browser storage: consider removing old watch data below.' : 'Well within what the phone allows.'}`)}`)}
    ${sec('Remove old data', `${para('Clears everything older than a date, for the kinds you choose. Your profile, targets, own foods and settings stay. A copy is kept first so it can be undone.')}
      <h3>Older than</h3>${seg('cutm', [[3, '3 months'], [6, '6 months'], [12, '1 year'], [24, '2 years']], CUT.months)}
      <h3>Which</h3><div class="checks">${Object.entries(STREAMS).map(([g, [label]]) => `<label class="check"><input type="checkbox" data-act="cutg" data-v="${g}" ${CUT.groups[g] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <p class="sub cutsum">${pre.days ? `Before ${dateLabel(cutDate(), { day: 'numeric', month: 'long', year: 'numeric' })}: ${fmtN(pre.n)}.` : `Nothing older than ${dateLabel(cutDate(), { day: 'numeric', month: 'long', year: 'numeric' })} in what you picked.`}</p>
      ${CUT.groups.body ? para('Removing old weigh-ins shortens the weight trend chart; the trend itself uses the last three weeks.', 'flag') : ''}
      <button class="danger wide" data-hold="cut" ${pre.days ? '' : 'disabled'}>Hold to remove ${pre.days ? plural(pre.days, 'day') : ''}</button>`)}
    ${sec('Start again', `${para('Erases every log and setting on this phone. A copy is kept first, and the backup folder is left alone.')}<button class="danger wide" data-hold="erase">Hold to erase everything</button>`)}`;
}
function vHalftone(P) {
  const pr = P.profiles[P.pick], c = pr.conv;
  return `<div class="scrim"></div><aside class="sheet" role="dialog" aria-label="Bring in Halftone" data-key="halftone"><div class="grab"></div>
    <div class="eyebrow">From ${esc(P.from)}</div><h1>Bring in Halftone?</h1>
    ${P.profiles.length > 1 ? `<h3>Whose training</h3>${seg('htpick2', P.profiles.map((x, i) => [i, esc(x.name)]), P.pick)}` : ''}
    ${table([trow('Lifting sessions', fmt(c.days)), trow('Sets', fmt(c.sets)), trow('Bodyweight readings', fmt(Object.keys(c.weights).length)), trow('Cardio days', fmt(Object.keys(c.cardio).length)), c.seeded ? trow('Demonstration sessions left out', c.seeded, 'muted') : ''])}
    ${para('These are added to what is here; any day already logged in Health keeps Health’s version. A copy is kept first, so this can be undone.')}
    <div class="rowb"><button class="solid" data-act="htok" ${c.days || Object.keys(c.weights).length ? '' : 'disabled'}>Add to Health</button><button class="ghost" data-act="importno">Cancel</button></div></aside>`;
}
function vWhy(key) {
  const e = EVID[key];
  if (!e) return '';
  return `<div class="scrim" data-act="close"></div><aside class="sheet" role="dialog" aria-label="${e.t}" data-key="why-${key}"><div class="grab"></div>
    <div class="eyebrow">${pill(e.lv)} ${e.g}</div><h1>${e.t}</h1><p>${part(e.b)}</p>
    <ol class="refs">${e.s.map(s => `<li>${s}</li>`).join('')}</ol><button class="solid wide" data-act="close">Close</button></aside>`;
}
function vImport(P) {
  return `<div class="scrim"></div><aside class="sheet" role="dialog" aria-label="Bring in data" data-key="import"><div class="grab"></div>
    <div class="eyebrow">From ${esc(P.from)}</div><h1>Replace with this backup?</h1>
    <p>${importSummary(P.data)}. This replaces what is in the app now; watch data refills on the next sync. A copy of what is here now is kept first, so this can be undone.</p>
    <div class="rowb"><button class="solid" data-act="importok">Replace</button><button class="ghost" data-act="importno">Cancel</button></div></aside>`;
}

// ---------- actions ----------
function setAct(a, el) {
  const v = el.dataset.v, s = S.settings, p = S.profile;
  const set = (k, val, msg) => { s[k] = val; save(); buzz('tick'); render(); if (msg) toast(msg); return true; };
  switch (a) {
    case 'pace': return set('pace', v, `Pace: ${PACE[v][0].toLowerCase()}. Targets recalculated.`);
    case 'protein': return set('protein', v);
    case 'retarget': S.meta.tgt = null; settleTargets(); buzz('ok'); render(); toast(`Target now ${fmt(targets().kcal)} kcal`); return true;
    case 'prog': if (s.prog !== v) { s.prog = v; p.days = PROGRAMS[v].per; trainDay = null; openEx = null; } return set('prog', v, `${PROGRAMS[v].short}: ${PROGRAMS[v].per} days a week`);
    case 'equip': p.equip = v; save(); buzz('tick'); render(); return true;
    case 'rest': return set('rest', +v);
    case 'bar': return set('bar', +v);
    case 'dbstep': return set('dbStep', +v);
    case 'haptics': s.haptics = v; save(); buzz('ok'); render(); return true;
    case 'trybuzz': { const was = s.haptics; if (was === 'off') toast('Haptics are off'); buzz(v); return true; }
    case 'motion': return set('motion', v);
    case 'theme': s.theme = v; save(); applyTheme(); buzz('tick'); render(); return true;
    case 'cutm': CUT.months = +v; buzz('tick'); render(); return true;
    case 'welcomed': S.meta.welcomed = true; save(); buzz('tick'); render(); return true;
    case 'bknow': if (NATIVE) { S.meta.backup = null; autoBackup(true); toast('Backing up…'); } return true;
    case 'htpick': $('#htimp').click(); return true;
    case 'htpick2': pending.pick = +v; buzz('tick'); render(); return true;
    case 'htok': {
      const pr = pending.profiles[pending.pick];
      snapshot('Before bringing in Halftone');
      const got = halftoneMerge(pr.conv);
      S.meta.imported = 'halftone'; pending = null; save(); buzz('done'); render();
      toast(`Added ${plural(got.days, 'session')}, ${plural(got.weights, 'weigh-in')}`, 6000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('Halftone import undone'); } });
      return true;
    }
  }
  return false;
}
ACT_HOLD.cut = () => {
  const groups = Object.keys(CUT.groups).filter(g => CUT.groups[g]);
  if (!groups.length) return;
  snapshot(`Before removing data older than ${dateLabel(cutDate(), { day: 'numeric', month: 'short', year: 'numeric' })}`);
  const r = prune(cutDate(), groups);
  save(); render();
  toast(`Removed ${plural(r.days, 'day')} of old data`, 7000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('Put back'); } });
};
ACT_HOLD.erase = () => {
  snapshot('Before erasing everything');
  const keep = { meta: { h9: S.meta.h9, welcomed: true, backup: S.meta.backup } };
  S = sanitize(keep); save(); location.hash = 'today'; render();
  toast('Everything erased', 8000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('Put back'); } });
};
ACT_HOLD.snaprestore = () => { if (restoreSnapshot()) { render(); buzz('ok'); toast('Restored the copy'); } else toast('That copy could not be read'); };
