'use strict';
// Me: your numbers, where the data comes from, your profile, backups and the evidence.

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
        ${para('In Zepp: Profile → Health Connect (under third-party access). Turn on every type, so steps, sleep, heart rate, workouts and weight all flow through.')}`;
  } else {
    hc = `${para('Inside the Android app, steps, sleep, heart rate, workouts and weight arrive by themselves from Health Connect, and the H9 reconnects on its own. In Chrome, use the Zepp export below.')}
      <div class="rowb"><a class="solid link" href="${APK}" download>Get the Android app</a><button class="ghost" data-act="move">Move my data to the app</button></div>
      ${para('Install the app first, then tap Move. Everything here is handed over in one step, and nothing is deleted from Chrome.')}`;
  }
  const strap = S.meta.h9 && NATIVE ? `${para(`${esc(S.meta.h9.name)} is remembered and reconnects with one tap${HR.battery != null ? `; battery ${HR.battery}%` : ''}.`)}<button class="ghost" data-act="hrforget">Forget this strap</button>`
    : para(`Connect from Train or Recovery. ${NATIVE ? 'The app remembers it after the first time.' : ''}`);
  const zepp = watchPreview ? watchPreviewBlock() : `<details class="inner"><summary>Import a Zepp export instead</summary><ol class="sub steps"><li>Zepp → Profile → Settings → Account → Export data. Pick activity, sleep and heart rate.</li><li>Zepp emails a zip with a password. Unzip it in your Files app.</li><li>Tap below and select the CSV files together.</li></ol>
      <button class="ghost" data-act="wpick">Choose Zepp files</button></details>`;
  return sec('Data sources', `<h3>Health Connect ${NATIVE ? '' : '<span class="src">in the app</span>'}</h3>${hc}<h3>Polar H9</h3>${strap}<h3>Amazfit files</h3>${zepp}
    <input type="file" id="wfile" accept=".csv,text/csv,text/comma-separated-values" multiple hidden>`);
}
function profileSection() {
  const p = S.profile, field = (label, id, v, attrs = 'type="number" inputmode="decimal"') => `<label>${label}<input id="${id}" ${attrs} value="${v}"></label>`;
  return `<details><summary>Profile</summary><div class="fgrid">
      <label>Sex<select id="p_sex"><option value="m" ${p.sex === 'm' ? 'selected' : ''}>Male</option><option value="f" ${p.sex === 'f' ? 'selected' : ''}>Female</option></select></label>
      ${field('Date of birth', 'p_dob', p.dob, 'type="date"')}
      ${field('Height, cm', 'p_h', p.h)}
      ${field('Start weight, kg', 'p_w0', p.w0)}
      ${field('Start waist, cm', 'p_waist0', p.waist0)}
      <label>Training days<select id="p_days">${[2, 3, 4].map(n => `<option ${p.days == n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="span2">Equipment<select id="p_equip"><option value="gym" ${p.equip === 'gym' ? 'selected' : ''}>Gym</option><option value="home" ${p.equip === 'home' ? 'selected' : ''}>Dumbbells at home</option></select></label></div>
      <label class="check"><input type="checkbox" id="p_sh" ${p.shoulder ? 'checked' : ''}><span>Daily shoulder routine</span></label>
      <button class="solid" data-act="profile">Save</button></details>`;
}
function backupSection() {
  const auto = NATIVE ? (BACKUP.folder ? para(`A copy goes to <b>${esc(BACKUP.folder)}</b> once a day${S.meta.backup ? `; last on ${dateLabel(S.meta.backup)}` : ''}. It survives uninstalling the app.`) + '<div class="rowb"><button class="ghost" data-act="bkpick">Change folder</button></div>'
    : para('Choose a folder, say Documents, and the app writes a copy there every day. If the phone or the app is ever replaced, Import that file and nothing is lost.') + '<div class="rowb"><button class="solid" data-act="bkpick">Choose backup folder</button></div>') : '';
  return `<details><summary>Backup</summary>${auto}${para(`Everything lives on this phone${NATIVE ? '' : ' in this browser'}, with an automatic copy of the day before. ${S.meta.exported ? `Last export ${dateLabel(S.meta.exported)}.` : 'Never exported.'}`)}
    <div class="rowb"><button class="ghost" data-act="export">Export</button><button class="ghost" data-act="import">Import</button><input type="file" id="imp" accept="application/json,.json" hidden></div></details>`;
}
function vMe() {
  const p = S.profile, T = targets(), H = hrProfile();
  const cls = T.bmi >= 25 ? 'obese' : T.bmi >= 23 ? 'overweight' : T.bmi >= 18.5 ? 'normal' : 'underweight';
  const standalone = NATIVE || matchMedia('(display-mode: standalone)').matches;
  return `${masthead('Me', `${Math.floor(ageYears())} years · ${p.h} cm · ${r1(T.wt)} kg`)}
    ${sec('Your numbers', table([
      trow(why('kcal', 'Resting energy'), `${fmt(T.bmr)} kcal`),
      trow(why('kcal', `Daily burn, ${Math.round(T.trust * 100)}% from your data`), `${fmt(T.tdee)} kcal`),
      trow(why('rate', 'Deficit'), `−${fmt(T.deficit)} kcal`),
      trow(why('kcal', 'Calories'), `${fmt(T.kcal)} kcal`, 'strong'),
      trow(why('protein', 'Protein'), `${T.protein} g`, 'strong'),
      trow(why('spread', 'Protein per main meal'), `${T.perMeal} g`),
      trow(why('fibre', 'Fibre'), `${T.fibre} g`),
      trow(why('steps', 'Steps'), fmt(T.stepGoal)),
      trow(why('zones', 'Heart-rate zones'), `${H.zones[0]} / ${H.zones[1]} / ${H.zones[2]}`),
      trow(why('waist', 'BMI, Indian cut-offs'), `${r1(T.bmi)}, ${cls}`)]))}
    ${sourcesSection()}
    ${standalone ? '' : sec('Use as an app in Chrome', installEvt ? '<button class="solid" data-act="install">Install</button>' : para('Open this page in Chrome itself, not inside another app. Tap ⋮ at the top right, then <b>Add to Home screen</b>.'))}
    ${profileSection()}${backupSection()}
    <details><summary>The evidence</summary><ul class="list evid">${Object.entries(EVID).map(([k, e]) => `<li><a href="#why-${k}"><span class="nm">${e.t} ${pill(e.lv)}</span><span class="sub">${e.g}</span></a></li>`).join('')}</ul></details>
    <p class="note">${NATIVE ? `Health ${esc(APP.version || '')}. The app has no internet permission: nothing you log, and nothing from the watch, can leave this phone.` : 'Everything stays in this browser on this device. Nothing is sent anywhere.'}</p>`;
}
function vWhy(key) {
  const e = EVID[key];
  if (!e) return '';
  return `<div class="scrim" data-act="close"></div><aside class="sheet" role="dialog" aria-label="${e.t}"><div class="grab"></div>
    <div class="eyebrow">${pill(e.lv)} ${e.g}</div><h1>${e.t}</h1><p>${e.b()}</p>
    <ol class="refs">${e.s.map(s => `<li>${s}</li>`).join('')}</ol><button class="solid wide" data-act="close">Close</button></aside>`;
}
function vImport(P) {
  return `<div class="scrim"></div><aside class="sheet" role="dialog" aria-label="Bring in data"><div class="grab"></div>
    <div class="eyebrow">From ${esc(P.from)}</div><h1>Bring in your data?</h1>
    <p>${importSummary(P.data)}. This replaces what is in the app now; watch data refills on the next sync. Today's state is kept as the automatic backup first.</p>
    <div class="rowb"><button class="solid" data-act="importok">Replace</button><button class="ghost" data-act="importno">Cancel</button></div></aside>`;
}
