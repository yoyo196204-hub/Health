'use strict';
// Me: your numbers, and every setting, each on its own page: goal, training, profile, data sources,
// backup and data, and how the app feels.

const SETPAGES = {
  goal: ['Goal and targets', () => vSetGoal()], train: ['Training', () => vSetTrain()], profile: ['Profile', () => vSetProfile()],
  sources: ['Data sources', () => sourcesSection()], data: ['Backup and data', () => vSetData()], remind: ['Reminders', () => vSetRemind()], feel: ['Feel', () => vSetFeel()],
  records: ['All your data', () => vRecords()], update: ['Updates', () => vSetUpdate()],
  evid: ['The evidence', () => `<ul class="list evid">${Object.entries(EVID).map(([k, e]) => `<li><a href="#why-${k}"><span class="nm">${e.t} ${pill(e.lv)}</span><span class="sub">${e.g}</span></a></li>`).join('')}</ul>`],
};
function vMe() {
  const p = S.profile, T = targets(), H = hrProfile(), P = prog();
  const cls = T.bmi >= 25 ? 'obese' : T.bmi >= 23 ? 'overweight' : T.bmi >= 18.5 ? 'normal' : 'underweight';
  const standalone = NATIVE || matchMedia('(display-mode: standalone)').matches;
  const bk = !NATIVE ? (S.meta.exported ? `Last export ${dateLabel(S.meta.exported)}` : 'Never exported') : BACKUP.folder ? `Daily to ${esc(BACKUP.folder)}${S.meta.backup ? `, last ${dateLabel(S.meta.backup)}` : ''}` : 'No backup folder yet';
  const stale = NATIVE && BACKUP.folder && S.meta.backup && gapDays(S.meta.backup, todayKey()) >= 3;
  return `${masthead('You', `${Math.floor(ageYears())} years · ${p.h} cm · ${r1(T.wt)} kg`, { before: `<button class="nav" data-act="meback" aria-label="Back">${ic('back')}</button>` })}
    ${stale ? `<p class="flag banner">The daily backup has not been written since ${dateLabel(S.meta.backup)}. Open Backup and data and choose the folder again.</p>` : ''}
    ${sec('Your numbers', table([
      trow(why('kcal', 'Calories'), `${fmt(T.kcal)} kcal`, 'strong'),
      trow(why('protein', 'Protein'), `${T.protein} g`, 'strong'),
      trow(why('spread', 'Protein per main meal'), `${T.perMeal} g`),
      trow(why('fibre', 'Fibre'), `${T.fibre} g`),
      trow(why('steps', 'Steps'), fmt(T.stepGoal)),
      trow(why('burn', T.trust ? `Daily burn the target uses, ${Math.round(T.trust * 100)}% from your data` : 'Daily burn, from the formula'), `${fmt(T.tdee)} kcal`),
      ...(T.measured != null && Math.abs(T.measured - T.tdee) >= 25 ? [trow(why('burn', 'Measured from your scale and log'), `${fmt(T.measured)} kcal`, 'muted')] : []),
      trow(why('zones', 'Heart-rate zones'), `${H.zones[0]} / ${H.zones[1]} / ${H.zones[2]}`),
      trow(why('waist', 'BMI, Indian cut-offs'), `${r1(T.bmi)}, ${cls}`)]) +
      (T.measured != null && Math.abs(T.measured - T.tdee) >= 25 ? para(`Measured is ${fmt(Math.abs(T.measured - T.formula))} kcal ${T.measured < T.formula ? 'below' : 'above'} the formula; the target moves at most 25% from it, since a gap that large is usually unlogged food. ${why('burn', 'Why')}`) : '') + (T.locked ? para(`Targets hold until ${dateLabel(T.next, { weekday: 'long', day: 'numeric', month: 'short' })}. ${why('lock', 'Why')}`) : ''))}
    <nav class="group" aria-label="Settings">
      ${navrow('#set-goal', 'Goal and targets', `${PACE[S.settings.pace][0]}${PACE[S.settings.pace][1] ? ` · ${PACE[S.settings.pace][1]}% a week` : ''} · protein ${S.settings.protein === 'high' ? 'higher' : 'standard'}`, ICON.goal)}
      ${navrow('#set-train', 'Training', `${esc(P.short)} · ${p.equip === 'home' ? 'home' : 'gym'}${p.shoulder ? ' · shoulder care' : ''}${ogPlanStale() ? ' · plan changed: send it to openGym' : ''}`, ICON.lift)}
      ${navrow('#set-profile', 'Profile', `${p.sex === 'm' ? 'Male' : 'Female'} · ${p.h} cm · started at ${p.w0} kg`, ICON.person)}
      ${navrow('#set-sources', 'Data sources', (NATIVE ? (SYNC.status?.granted?.length ? `Health Connect · synced ${S.meta.sync ? ago(S.meta.sync) : 'not yet'}` : 'Health Connect not connected') : 'Watch files, H9') + (OGF.folder || S.meta.og ? ' · openGym' : ''), ICON.link)}
      ${navrow('#watch', 'Watch history', 'Every figure by week, month, year', `<svg viewBox="0 0 24 24">${IC.watch}</svg>`)}
      ${navrow('#set-records', 'All your data', 'See, change or delete any record', ICON.list)}
      ${navrow('#set-checks', 'Data checks', checkLine(), ICON.check)}
      ${navrow('#set-data', 'Backup and data', bk, ICON.box)}
      ${navrow('#set-remind', 'Reminders', !NATIVE ? 'In the Android app' : remindOn() ? [S.settings.remAm !== 'off' && `morning ${S.settings.remAm}`, S.settings.remWk !== 'off' && `waist ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][+S.settings.remWk]}`, S.settings.remPm !== 'off' && `food ${S.settings.remPm}`].filter(Boolean).join(' · ') : 'Off', ICON.bell)}
      ${navrow('#set-feel', 'Feel', `Haptics ${S.settings.haptics} · sound ${({ key: 'key moments', all: 'every touch', off: 'off' })[S.settings.sound]} · motion ${S.settings.motion} · ${S.settings.theme} theme`, ICON.hand)}
      ${navrow('#set-update', 'Updates', updateLine(), ICON.box)}
      ${navrow('#set-evid', 'The evidence', `${Object.keys(EVID).length} topics, each with its sources`, ICON.book)}
    </nav>
    ${standalone ? '' : sec('Use as an app in Chrome', installEvt ? '<button class="solid" data-act="install">Install</button>' : para('Open this page in Chrome itself, not inside another app. Tap ⋮ at the top right, then <b>Add to Home screen</b>.'))}
    <p class="note">${NATIVE ? `Health ${esc(APP.version || '')}, build ${esc(BUILD)}. The app has no internet permission: nothing you log, and nothing from the watch, can leave this phone.` : `Build ${esc(BUILD)}. Everything stays in this browser on this device. Nothing is sent anywhere.`}</p>`;
}
function vSet(key) {
  const P = SETPAGES[key];
  if (!P) return vMe();
  return `${masthead(P[0], 'You', { before: `<button class="nav" data-act="close" aria-label="Back">${ic('back')}</button>` })}<div class="setpage">${part(P[1])}</div>`;
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
  return `${sec('Train in openGym', part(ogPlanBlock), { why: ['block', 'How the block is set up'] })}
    ${sec('Programme', `<ul class="list picks">${Object.entries(PROGRAMS).map(([k, P]) => `<li><button class="rowbtn ${s.prog === k ? 'on' : ''}" data-act="prog" data-v="${k}"><span class="radio"></span><span class="grow"><span class="nm">${esc(P.n)}</span><span class="sub">${esc(P.blurb)}</span></span></button></li>`).join('')}</ul>
      ${para('Changing programme keeps every session you have logged; the next session starts at the first day of the new one.')}`, { why: ['lift', 'Why this plan'] })}
    ${sec('Where you train', seg('equip', [['gym', 'Gym'], ['home', 'Dumbbells at home']], p.equip) + para(p.equip === 'home' ? 'Gym exercises are replaced by the closest dumbbell, band or bodyweight version.' : 'The programme as written.'))}
    ${sec('Shoulder care', `<label class="toggle"><input type="checkbox" data-act="shoulder" ${p.shoulder ? 'checked' : ''}><span class="grow"><b>Protect a sore shoulder</b><span class="sub">No loaded overhead end range or flyes, laterals to shoulder height, a five-minute warm-up, and a quick “how did it feel” after shoulder exercises.</span></span><i class="sw"></i></label>`, { why: ['shoulder', 'How it works'] })}
    ${sec('Rest between sets', seg('rest', [[0, 'Auto'], [60, '1:00'], [90, '1:30'], [120, '2:00'], [150, '2:30'], [180, '3:00'], [240, '4:00']], s.rest, 'scroll') + para(`Goes into the plan file as each exercise's rest in openGym. ${s.rest ? 'The same rest after every set.' : 'Auto: 2:30 after exercises that use several big muscles, 1:30 after small ones, 1:00 after holds.'}`), { why: ['rest', 'Why'] })}
    ${sec('Smallest dumbbell step', `${seg('dbstep', [[1, '1 kg'], [2, '2 kg'], [2.5, '2.5 kg']], s.dbStep)}${para('When a dumbbell exercise earns more weight, it goes up by this much, in openGym too.')}`)}`;
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

// ---------- reminders ----------
function vSetRemind() {
  const s = S.settings;
  if (!NATIVE) return para('Reminders come from the Android app, which can notify you even when it is closed. In Chrome, Today lists what is due each time you open it.');
  const off = REMIND.allowed === false;
  const times = (k, list) => seg(k, [['off', 'Off'], ...list.map(t => [t, t])], s[k], 'scroll');
  return `${para('Each reminder is only sent if the thing is still undone: a morning check already done, or a waist measured this week, is not reminded about. Today also lists everything due.')}
    ${batteryBlock('Reminders are set as alarms.')}
    ${off ? `<p class="flag">Notifications for Health are switched off on this phone.</p><div class="rowb"><button class="solid" data-act="remask">Allow notifications</button></div>` : ''}
    ${sec('Morning check and weigh-in', times('remAm', ['05:30', '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00']) + para('At your usual waking time. The HRV range is built from these mornings, and the weight trend from the weigh-ins.'), { why: ['checkin', 'Why regularly'] })}
    ${sec('Waist, once a week', seg('remWk', [['off', 'Off'], ['1', 'Mon'], ['3', 'Wed'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']], s.remWk, 'scroll') + para('Fifteen minutes after the morning reminder on that day, or at 08:15.'), { why: ['waist', 'Why the waist'] })}
    ${sec('Food log, evening', times('remPm', ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30']) + para('Says what is logged so far, and skips days with all three meals in. Whole days are what the burn estimate learns from.'), { why: ['logging', 'Why whole days'] })}
    <p class="note">Android may deliver a reminder a few minutes late to save battery.</p>`;
}

// ---------- feel ----------
function vSetFeel() {
  const s = S.settings;
  return `${sec('Haptics', seg('haptics', [['full', 'Full'], ['subtle', 'Subtle'], ['off', 'Off']], s.haptics) + para(s.haptics === 'off' ? 'No vibration at all.' : s.haptics === 'subtle' ? 'Only for finished sets, saves and warnings.' : 'A light tick for every change and each gesture threshold, a click when something is saved, a triple click when a check or session is finished, a double for a refusal.') +
      `<div class="rowb tight">${['tick', 'ok', 'done', 'warn'].map(k => `<button class="mini" data-act="trybuzz" data-v="${k}">${{ tick: 'Tick', ok: 'Saved', done: 'Finished', warn: 'Refused' }[k]}</button>`).join('')}</div>`)}
    ${sec('Sound', seg('sound', [['key', 'Key moments'], ['all', 'Every touch'], ['off', 'Off']], s.sound) + para(s.sound === 'off' ? 'No sounds.' : `Soft tones for saved, finished and refused, the strap connecting or dropping out, a measurement starting, and breathing in and out on the pacer${s.sound === 'all' ? ', plus a faint tick for every change' : ''}. ${NATIVE ? 'Only when the phone is on ring.' : ''}`) +
      `<div class="rowb tight">${[['ok', 'Saved'], ['done', 'Finished'], ['connect', 'Strap'], ['start', 'Start'], ['inhale', 'Breathe']].map(([k, l]) => `<button class="mini" data-act="trysound" data-v="${k}">${l}</button>`).join('')}</div>`)}
    ${sec('Motion', seg('motion', [['system', 'As the phone'], ['full', 'Full'], ['reduced', 'Reduced']], s.motion) + para('Screens slide and numbers count up. Reduced switches all of it off.'))}
    ${sec('Theme', seg('theme', [['system', 'As the phone'], ['light', 'Light'], ['dark', 'Dark']], s.theme))}`;
}

// ---------- updates ----------
// The app has no internet permission, so it cannot look for a newer version by itself. Each build carries its own
// number, date and what changed (release.js, written by the GitHub build); the newest is one tap away on GitHub, and
// Android installs it over this one, keeping everything.
const RELEASES = 'https://github.com/yoyo196204-hub/Health/releases';
function buildAge() { return RELEASE?.at ? gapDays(RELEASE.at, todayKey()) : null; }
function updateLine() {
  const v = NATIVE ? APP.version : RELEASE?.name, age = buildAge();
  return `${v ? `Version ${esc(v)}` : 'This version'}${RELEASE?.at ? ` · built ${dateLabel(RELEASE.at)}` : ''}${age != null && age >= 21 ? ' · likely a newer one' : ''}`;
}
function vSetUpdate() {
  const R = RELEASE, age = buildAge();
  const notes = R?.notes?.length ? `<ul class="list notes">${R.notes.map(n => { const [h, ...t] = n.split(': '); return `<li><span class="nm">${esc(t.length ? h : n)}</span>${t.length ? `<span class="sub">${esc(t.join(': '))}</span>` : ''}</li>`; }).join('')}</ul>` : para('This copy was not built by GitHub, so it has no list of changes.');
  return `${sec('This version', table([trow('Version', esc((NATIVE ? APP.version : R?.name) || DASH)), trow('Built', R?.at ? dateLabel(R.at, { day: 'numeric', month: 'long', year: 'numeric' }) : DASH), ...(NATIVE && APP.installed ? [trow('Installed', dateLabel(dk(new Date(APP.installed)), { day: 'numeric', month: 'long', year: 'numeric' }))] : [])])
      + (age != null && age >= 21 ? para(`Built ${plural(age, 'day')} ago: there is probably a newer version.`, 'flag') : ''))}
    ${sec('What changed', notes)}
    ${sec('Get the newest', `${para(NATIVE ? 'The app has no internet permission, so it never checks on its own. This opens the newest version in your browser; open the downloaded file and Android installs it over this one, keeping all your data. It is signed with the same key, so nothing else will install over it.' : 'In Chrome the app updates itself the next time it is opened online.')}
      <div class="rowb"><a class="solid link" href="${APK}">Download the newest</a><a class="ghost link" href="${RELEASES}">All versions</a></div>`)}`;
}
// After an update: once, what changed.
function updatedNotice() {
  if (!RELEASE?.name || !NATIVE) return;
  const was = S.meta.ver;
  if (was === RELEASE.name) return;
  S.meta.ver = RELEASE.name; save();
  if (was) setTimeout(() => toast(`Updated to ${RELEASE.name}`, 7000, { label: 'What changed', fn: () => { location.hash = 'set-update'; } }), 1200);
}

// ---------- data sources ----------
// Where each watch app turns on its Health Connect link: the apps on this phone, or both when neither is.
function watchSetup() {
  const gb = para('In Gadgetbridge: Settings › External integrations › Health Connect. Turn it on, allow every type, and turn on Sync after device sync.');
  const zepp = para('In Zepp: Profile › Health Connect (under third-party access). Turn on every type, so steps, sleep, heart rate, workouts and weight all flow through.');
  return APP?.gb && !APP?.zepp ? gb : APP?.zepp && !APP?.gb ? zepp : watchApp() === 'Gadgetbridge' ? gb + zepp : zepp + gb;
}
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
        ${watchSetup()}`;
  } else {
    hc = `${para('Inside the Android app, steps, sleep, heart rate, workouts and weight arrive by themselves from Health Connect, and the H9 reconnects on its own. In Chrome, import a file below.')}
      <div class="rowb"><a class="solid link" href="${APK}" download>Get the Android app</a><button class="ghost" data-act="move">Move my data to the app</button></div>
      ${para('Install the app first, then tap Move. Everything here is handed over in one step, and nothing is deleted from Chrome.')}`;
  }
  const strap = S.meta.h9 && NATIVE ? `${para(`${esc(S.meta.h9.name)} is remembered and reconnects with one tap${HR.battery != null ? `; battery ${HR.battery}%` : ''}.`)}<button class="ghost" data-act="hrforget">Forget this strap</button>`
    : para(`Connect it from any strap tool: the log button’s “Heart, with the strap”, or the morning check.${NATIVE ? ' The app remembers it after the first time.' : ''}`);
  // History from files, read on this phone: Gadgetbridge's database or its export zip, Zepp's export (the zip as it
  // arrives, password and all, or the CSV files inside it), or a Health Connect backup. In the app, Health Connect
  // covers the recent weeks; these bring the history before them.
  const how = {
    Gadgetbridge: '<b>Gadgetbridge.</b> Data management › Export zip, or Export Data for the database alone. Every minute it kept comes in: steps, nights in stages, heart rate, HRV, blood oxygen and workouts.',
    Zepp: '<b>Zepp.</b> Profile › Settings › Account › Export data. Zepp emails a zip and shows its password: pick the zip as it is, and type the password here.',
  };
  const order = watchApp() === 'Gadgetbridge' ? ['Gadgetbridge', 'Zepp'] : ['Zepp', 'Gadgetbridge'];
  const files = watchPreview ? watchPreviewBlock() : WZIP.busy || WZIP.need || WZIP.err ? watchZipBlock() : `<details class="inner" ${NATIVE ? '' : 'open'}><summary>${NATIVE ? 'Bring in your older history' : 'Import from Gadgetbridge, Zepp or a Health Connect backup'}</summary>
      ${order.map(k => para(how[k])).join('')}
      ${para('<b>Health Connect backup.</b> Health Connect’s own settings › Export: the “Health Connect.zip” holds every app’s data, as far back as Health Connect has it.')}
      ${para(`${NATIVE ? 'The daily sync reads at most 120 days; these fill in everything before, for longer baselines and more days for the links in your data. ' : ''}Everything is read on this phone, and days you typed yourself are kept.`)}
      <button class="ghost" data-act="wpick">Choose a file</button></details>`;
  return `<h3>Health Connect ${NATIVE ? '' : '<span class="src">in the app</span>'}</h3>${hc}<h3>openGym</h3>${part(ogSourcesBlock)}<h3>Polar H9</h3>${strap}<h3>History files</h3>${files}
    <input type="file" id="wfile" multiple hidden>`;
}

// ---------- backup and data ----------
const CUT = { months: 12, groups: { food: true, activity: true, body: false, training: false } };
function cutDate() { const d = new Date(); d.setMonth(d.getMonth() - CUT.months); return dk(d); }
// Persisted: whether the browser promised not to clear this site's storage under pressure (asked for at start).
let persisted = null;
navigator.storage?.persisted?.().then(v => { persisted = v; }).catch(() => {});
function vSetData() {
  const U = usage(), snap = snapInfo(), groups = Object.keys(CUT.groups).filter(g => CUT.groups[g]);
  const pre = groups.length ? prune(cutDate(), groups, true) : { days: 0, n: {} };
  const V = VH ? vaultStats() : null, recN = RSTORE.map.size;
  // ---- where it is ----
  const saved = VH ? (VAULT.ok === false ? `<span class="bad">Last write failed: ${esc(VAULT.err)}. Retrying.</span>` : V?.saved ? `Saved ${ago(V.saved)}${VAULT.ok ? ', read back and checked' : ''}` : 'Not written yet')
    : saveFailed ? '<span class="bad">Not being saved: storage is full or blocked</span>' : `Saved in this browser${IDBS.ok ? ', with a second copy in its database' : ''}`;
  const where = VH ? table([
      trow('Logs, settings and targets', bytes(V?.state || U.bytes)),
      trow('Strap recordings', (V?.recN ?? recN) ? `${plural(V?.recN ?? recN, 'recording')} · ${bytes(V?.recs || 0)}` : 'None yet'),
      trow('Restore points', bytes(V?.points || 0)),
      ...(V?.binN ? [trow('Deleted recordings, kept 30 days', `${V.binN} · ${bytes(V.bin)}`, 'muted')] : []),
      trow('Free on this phone', V?.free ? bytes(V.free) : DASH, 'muted')])
    + para('Stored as files in the app’s own private storage, limited only by the phone’s free space. Android removes them only if you uninstall the app or press <b>Clear storage</b> in its settings; clearing the cache, the phone’s cleaner and low-storage clean-ups do not touch them. The backup folder below covers uninstalling.')
    : table([trow('Logs and settings', bytes(U.bytes)), trow('Strap recordings', plural(recN, 'recording')), trow('Kept when space runs low', persisted ? 'Yes, the browser promised' : persisted === false ? 'Not promised: export backups' : DASH, persisted ? '' : 'muted')])
      + para('Everything stays in this browser on this device. The Android app keeps it in files with no size limit.');
  // ---- backups ----
  const auto = NATIVE ? (BACKUP.folder ? para(`A copy goes to <b>${esc(BACKUP.folder)}</b> once a day${S.meta.backup ? `, last on ${dateLabel(S.meta.backup)}` : ''}, plus one kept for each month. It survives uninstalling the app.`) + '<div class="rowb"><button class="ghost" data-act="bkpick">Change folder</button><button class="ghost" data-act="bknow">Back up now</button></div>'
    : para('<b>Choose a folder, say Documents.</b> The app writes a copy there every day, outside the app, so even uninstalling or replacing the phone loses nothing.', 'flag') + '<div class="rowb"><button class="solid" data-act="bkpick">Choose backup folder</button></div>') : '';
  // ---- restore points ----
  const pts = VH ? vaultPoints() : [], KIND = { day: 'End of day', month: 'Start of month', guard: 'Before a large removal' };
  const ptList = pts.length ? `<ul class="list points">${pts.slice(0, 20).map(x => `<li><div class="row"><span class="grow"><span class="nm">${KIND[x.kind]} · ${new Date(x.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span class="sub">${bytes(x.bytes)}</span></span><button class="ghost sm" data-hold="ptrestore" data-v="${x.kind}|${esc(x.name)}">Hold to restore</button></div></li>`).join('')}</ul>`
    : para('The first appears tomorrow: the app keeps how your data stood at the end of each of the last 14 days, and at the start of each month for two years.');
  const binRecs = VH && V?.binN ? (() => { try { return JSON.parse(VH.recBin()).filter(x => x && !RSTORE.map.has(x.id)); } catch (e) { return []; } })() : [];
  const fmtN = n => Object.entries(n).filter(([, c]) => c).map(([k, c]) => `${c} ${({ food: 'food days', full: 'day flags', weights: 'weigh-ins', waist: 'waist readings', steps: 'step days', sleep: 'nights', sleepx: 'sleep details', rhr: 'resting HR days', wx: 'watch extras', ex: 'watch workout days', hrv: 'morning checks', hrd: 'heart-rate days', lab: 'lab sessions', lifts: 'lifting sessions', cardio: 'cardio days', prehab: 'warm-ups', swaps: 'swaps' })[k] || k}`).join(', ');
  return `<nav class="jumps" aria-label="Sections">${['Storage', 'Backups', 'Restore', 'Bring in', 'Clean up'].map((t, i) => `<button class="chip" data-act="dsjump" data-v="dsec${i}">${t}</button>`).join('')}</nav>
    ${sec('Where your data is', `<p class="savedline">${ic('check')} ${saved}</p>${where}`, { id: 'dsec0' })}
    ${sec('Backups', `${auto}${para(S.meta.exported ? `Last exported to a file ${dateLabel(S.meta.exported)}.` : 'Never exported to a file.')}
      <div class="rowb"><button class="ghost" data-act="export">Export a file</button><button class="ghost" data-act="import">Import a file</button><input type="file" id="imp" accept="application/json,.json" hidden></div>`, { id: 'dsec1' })}
    ${sec('Restore', `${snap && Date.now() - snap.at < 14 * DAY ? `<h3>Undo the last big change</h3>${para(`A copy was kept ${ago(snap.at)}: ${esc(snap.why)}.`)}<button class="ghost" data-hold="snaprestore">Hold to go back to it</button>` : ''}
      ${VH ? `<h3>Restore points</h3>${ptList}${para('Restoring keeps how things stand now as the undo copy, so it can be reversed. Strap recordings are kept separately and are not changed.')}` : ''}
      ${binRecs.length ? `<h3>Deleted recordings</h3><ul class="list">${binRecs.slice(0, 15).map(r => `<li><div class="row"><span class="grow"><span class="nm">${esc(REC_KINDS[r.kind]?.[0] || 'Recording')}</span><span class="sub">${r.t0 ? new Date(r.t0).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span></span><button class="ghost sm" data-act="recundel" data-v="${esc(r.id)}">Put back</button></div></li>`).join('')}</ul>` : ''}`, { id: 'dsec2' })}
    ${sec('Bring in Halftone', `${para('Your lifting history from Halftone: every completed set, shoulder reports, bodyweight and logged cardio. Halftone’s five demonstration sessions are recognised and left out. Days already in Health are kept as they are.')}
      <div class="rowb"><button class="ghost" data-act="htpick">Choose a Halftone backup</button><input type="file" id="htimp" accept="application/json,.json" hidden></div>`, { id: 'dsec3' })}
    ${sec('What is stored', table(U.groups.map(g => trow(g.label, g.days ? `${fmt(g.days)} days${g.first ? ` <i>since ${dateLabel(g.first, { month: 'short', year: 'numeric' })}</i>` : ''}` : DASH))), { id: 'dsec4' })}
    ${sec('Remove old data', `${para('Nothing is ever removed on its own. This clears everything older than a date, for the kinds you choose; profile, targets, own foods and settings stay. A copy is kept first so it can be undone.')}
      <h3>Older than</h3>${seg('cutm', [[3, '3 months'], [6, '6 months'], [12, '1 year'], [24, '2 years']], CUT.months)}
      <h3>Which</h3><div class="checks">${Object.entries(STREAMS).map(([g, [label]]) => `<label class="check"><input type="checkbox" data-act="cutg" data-v="${g}" ${CUT.groups[g] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <p class="sub cutsum">${pre.days ? `Before ${dateLabel(cutDate(), { day: 'numeric', month: 'long', year: 'numeric' })}: ${fmtN(pre.n)}.` : `Nothing older than ${dateLabel(cutDate(), { day: 'numeric', month: 'long', year: 'numeric' })} in what you picked.`}</p>
      ${CUT.groups.body ? para('Removing old weigh-ins shortens the weight trend chart; the trend itself uses the last three weeks.', 'flag') : ''}
      <button class="danger wide" data-hold="cut" ${pre.days ? '' : 'disabled'}>Hold to remove ${pre.days ? plural(pre.days, 'day') : ''}</button>`)}
    ${sec('Start again', `${para('Erases every log and setting. A copy is kept first, the restore points stay, and the backup folder is left alone.')}<button class="danger wide" data-hold="erase">Hold to erase everything</button>`)}`;
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
  return `${sheetTop(`${pill(e.lv)} ${e.g}`, e.t, `why-${key}`, 'close')}<p>${part(e.b)}</p>
    <ol class="refs">${e.s.map(s => `<li>${s}</li>`).join('')}</ol></aside>`;
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
    case 'prog': if (s.prog !== v) { s.prog = v; p.days = PROGRAMS[v].per; } return set('prog', v, `${PROGRAMS[v].short}: ${PROGRAMS[v].per} days a week`);
    case 'equip': p.equip = v; save(); buzz('tick'); render(); return true;
    case 'rest': return set('rest', +v);
    case 'dbstep': return set('dbStep', +v);
    case 'haptics': s.haptics = v; save(); buzz('ok'); render(); return true;
    case 'remAm': case 'remWk': case 'remPm': {
      s[a] = v; save(); buzz('tick');
      if (v !== 'off' && NATIVE && REMIND.allowed !== true) nat('remindAsk');
      remindPlan(); render(); return true;
    }
    case 'remask': nat('remindAsk'); return true;
    case 'battask': nat('batteryAsk'); buzz('tick'); return true;
    case 'trybuzz': { const was = s.haptics; if (was === 'off') toast('Haptics are off'); buzz(v); return true; }
    case 'motion': return set('motion', v);
    case 'sound': return set('sound', v);
    case 'trysound': { const was = s.sound; if (was === 'off') toast('Sound is off'); else { if (v === 'inhale') setTimeout(() => sfx('exhale'), 1400); sfx(v); } return true; }
    case 'theme': s.theme = v; save(); applyTheme(); buzz('tick'); render(); return true;
    case 'cutm': CUT.months = +v; buzz('tick'); render(); return true;
    case 'welcomed': S.meta.welcomed = true; save(); buzz('tick'); render(); return true;
    case 'bknow': if (NATIVE) { S.meta.backup = null; autoBackup(true); toast('Backing up…'); } return true;
    case 'htpick': $('#htimp').click(); return true;
    case 'dsjump': document.getElementById(v)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); buzz('tick'); return true;
    case 'recundel': {
      let r = null; try { r = JSON.parse(VH.recBin()).find(x => x?.id === v); } catch (e) { /* unreadable */ }
      if (r && recPut(r)) { buzz('ok'); toast('Recording put back'); } else toast('That recording could not be read');
      render(); return true;
    }
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
ACT_HOLD.ptrestore = b => {
  const [kind, name] = String(b.dataset.v || '').split('|'), D = vaultPoint(kind, name);
  if (!D) { buzz('warn'); toast('That restore point could not be read'); return; }
  snapshot(`Before restoring the point of ${name.replace('.json', '')}`);
  const seq = S.meta.seq; S = D; S.meta.seq = seq; save(); buzz('done'); render();
  toast(`Restored: ${importSummary(D)}`, 7000, { label: 'Undo', fn: () => { restoreSnapshot(); render(); toast('Back as it was'); } });
};
ACT_HOLD.snaprestore = () => { if (restoreSnapshot()) { render(); buzz('ok'); toast('Restored the copy'); } else toast('That copy could not be read'); };
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-me.js');
