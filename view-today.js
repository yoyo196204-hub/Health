'use strict';
// Today: the day in one screen. Three rings (how recovered you are, what is left to eat, how you slept), what is due,
// the day's food with every meal one tap from adding, the one thing your data most wants you to know, and the body.
// The log button lives here too: everything you might log, from any screen.

// The app's link to the watch: status, one tap to sync, or the one-time connect step.
function syncLine() {
  if (!NATIVE) return '';
  const st = SYNC.status;
  if (st && st.sdk !== 'ok') return `<p class="syncline flag" id="syncline">${st.sdk === 'update' ? 'Health Connect needs an update from the Play Store.' : 'Health Connect is not available on this phone.'}</p>`;
  if (st && !st.granted?.length) return `<div class="callout" id="syncline"><b>Bring in your watch data</b><span class="sub">Steps, sleep, heart rate, workouts and weight arrive by themselves from Health Connect. Nothing leaves the phone.</span><button class="solid" data-act="hcask">Allow access</button></div>`;
  // Two different times, said apart: when the watch app last passed data to Health Connect (how fresh the numbers
  // really are), and when this app last read it. "Synced 1 min ago" alone would look fresh while showing old data.
  const W = watchWrote(), lag = watchLagging(), F = S.meta.fresh;
  const wrote = W ? `${esc(W.src || 'The watch')} passed data on ${ago(W.w)}` : '';
  const text = SYNC.busy ? 'Reading Health Connect…' : SYNC.err ? esc(SYNC.err)
    : !S.meta.sync ? 'Not read yet'
    : W ? `${wrote}${freshParts().length ? ` · ${freshParts().join(', ')}` : ''}` : `Read ${ago(S.meta.sync)}`;
  const sub = SYNC.busy || SYNC.err || !S.meta.sync ? '' : lag
    ? `Nothing new from ${esc(W.src || 'the watch')} for ${ago(W.w).replace(/ ago$/, '')}. ${esc(W.src || 'The watch app')} only passes data on when it syncs with the watch: open it, let it sync, and come back.`
    : `Health read it ${ago(F?.read || S.meta.sync)}${F?.err?.length ? ` · ${plural(F.err.length, 'kind')} could not be read` : ''}`;
  return `<div class="syncline ${SYNC.err ? 'err' : lag ? 'lag' : ''}" id="syncline"><span class="grow"><span>${text}</span>${sub ? `<span class="sub small">${sub}</span>` : ''}</span>${APP?.zepp && (lag || !W) ? '<button class="mini" data-act="zepp">Open Zepp</button>' : ''}<button class="mini" data-act="sync" ${SYNC.busy ? 'disabled' : ''} aria-label="Read Health Connect now">${SYNC.busy ? '…' : '↻'}</button></div>`;
}
// A fresh install or a reinstall: offer the backup once. It goes for good when you dismiss it, choose a backup
// folder, import, or once there is anything in the app at all, including watch data.
function welcome() {
  if (!NATIVE || S.meta.welcomed || BACKUP.folder) return '';
  if (['food', 'weights', 'lifts', 'steps', 'sleep', 'hrv', 'cardio'].some(k => Object.keys(S[k]).length)) return '';
  return `<div class="callout"><button class="x" data-act="welcomed" aria-label="Dismiss">×</button><b>New here, or reinstalled?</b><span class="sub">If you have a backup from before, bring it in first. Otherwise choose a folder and the app keeps a copy there every day.</span>
    <div class="rowb"><button class="solid" data-act="import">Import a backup</button><button class="ghost" data-act="bkpick">Choose backup folder</button></div><input type="file" id="imp" accept="application/json,.json" hidden></div>`;
}
function miniStages(sx) {
  if (sx.seg?.length) {
    const end = Math.max(...sx.seg.map(([o, l]) => o + l));
    return `<svg class="mhyp" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">${sx.seg.map(([o, l, c]) => `<rect class="st${c}" x="${(o / end * 120).toFixed(2)}" y="${STAGE[c][1] * 6}" width="${Math.max(0.5, l / end * 120).toFixed(2)}" height="5" rx="1"/>`).join('')}</svg>`;
  }
  const t = sx.d + sx.l + sx.r + sx.w;
  return t ? `<div class="zbar thin">${[['st1', sx.w], ['st2', sx.l], ['st3', sx.d], ['st4', sx.r]].map(([c, v]) => v ? `<i class="${c}" style="flex:${v}"></i>` : '').join('')}</div>` : '';
}
// The measurements the app relies on that are due today and not done yet, each one tap away. Nothing here is
// nagging for its own sake: each one feeds a number elsewhere (the HRV range, the weight trend, the waist line).
function dueList() {
  const k = todayKey(), h = new Date().getHours(), out = [];
  const strap = S.meta.h9 || Object.keys(S.hrv).length;
  if (strap && !S.hrv[k] && h >= 4 && h < 12) out.push({ id: 'hrv', t: 'Morning check', s: 'Two minutes lying down with the H9, before getting up. Your HRV range is built from these.', href: '#recovery' });
  // A scale that writes to Health Connect fills this in; ask only when nothing has come in today.
  if (S.weights[k] == null && h >= 5) out.push({ id: 'weight', t: 'Weigh in', s: 'After the toilet, before food or water: the same conditions each day are what make the trend honest.', field: 'weights' });
  const lastWaist = Object.keys(S.waist).sort().pop();
  if (!lastWaist || gapDays(lastWaist, k) >= 7) out.push({ id: 'waist', t: 'Waist, once a week', s: 'Tape level, midway between the lowest rib and the top of the hip bone, after breathing out. Same spot every time.', field: 'waist' });
  // The shoulder check and a stale openGym plan are cards of their own on Today, not items here.
  if (NATIVE && BACKUP.folder && S.meta.backup && gapDays(S.meta.backup, k) >= 3) out.push({ id: 'bk', t: 'Backup has stopped', s: `Last written ${dateLabel(S.meta.backup)}. Choose the folder again.`, href: '#set-data' });
  return out;
}

// ---------- the top of Today ----------
// A small pill for how fresh the watch data is; tap it to read Health Connect now. The full line (with what to do
// about it) appears under the title only when something needs you.
function syncPill() {
  if (!NATIVE) return '';
  const st = SYNC.status, W = watchWrote(), lag = watchLagging();
  const cls = SYNC.busy ? 'busy' : SYNC.err || (st && st.sdk !== 'ok') ? 'err' : lag ? 'lag' : '';
  const txt = SYNC.busy ? 'Syncing' : !S.meta.sync ? 'Not synced' : W ? ago(W.w).replace(/ ago$/, '') : ago(S.meta.sync).replace(/ ago$/, '');
  return `<button class="syncdot ${cls}" data-act="sync" aria-label="Read Health Connect now"><i></i>${esc(txt)}</button>`;
}
function needsSyncLine() {
  if (!NATIVE) return false;
  const st = SYNC.status;
  return (st && (st.sdk !== 'ok' || !st.granted?.length)) || !!SYNC.err || watchLagging();
}
// The three numbers the day turns on: how recovered you are, what is left to eat, and how you slept.
function trio() {
  const k = todayKey(), RS = recoveryScore(k), T = targets(), t = totals(k), [zw, zc] = ZONE[RS.level];
  const left = T.kcal - t.k, sl = S.sleep[k], usual = mean(range(28, shift(k, -1)).map(d => S.sleep[d]).filter(v => v != null)), need = clamp(usual ?? 7.5, 7, 9);
  const rec = ring('t-rec', RS.score != null ? RS.score / 100 : 0, { c: zc, size: 104, stroke: 9, glow: RS.score != null,
    inner: RS.score != null ? `<b class="num">${RS.score}</b><span>%</span>` : `<b>${DASH}</b><span>${RS.level === 'unknown' ? 'learning' : ''}</span>` });
  const fuel = ring('t-fuel', t.k / T.kcal, { c: left < 0 ? 'var(--bad)' : 'var(--fuel)', size: 104, stroke: 9, glow: true, over: t.k > T.kcal,
    inner: `<b class="num">${fmt(Math.abs(left))}</b><span>${left < 0 ? 'over' : 'left'}</span>` });
  const slp = ring('t-sleep', sl != null ? sl / need : 0, { c: 'var(--sleep)', size: 104, stroke: 9, glow: sl != null,
    inner: sl != null ? `<b class="num">${Math.floor(sl)}:${String(Math.round((sl % 1) * 60)).padStart(2, '0')}</b><span>hours</span>` : `<b>${DASH}</b><span>no night</span>` });
  const sleepWord = sl == null ? 'Not synced' : sl >= need - 0.25 ? 'Enough' : sl >= need - 1 ? 'A little short' : 'Short';
  return `<section class="card trio" style="--tint:${zc}">
    <a class="tri" href="#recovery" style="--c:${zc}">${rec}<span class="tl">Recovery</span><span class="ts">${RS.score != null ? zw : RS.level === 'unknown' ? 'Calibrating' : zw}</span></a>
    <a class="tri" href="#food" data-act="gotoday" style="--c:var(--fuel)">${fuel}<span class="tl">kcal</span><span class="ts" style="color:var(--soft)">${fmt(t.k)} of ${fmt(T.kcal)}</span></a>
    <a class="tri" href="#recovery" style="--c:var(--sleep)">${slp}<span class="tl">Sleep</span><span class="ts">${sleepWord}</span></a></section>`;
}
// What is due today, each one tap from being done.
function todoStrip() {
  const k = todayKey(), D = dueList(), items = [], T = targets();
  const m = nextMeal(), mt = totals(k, m);
  for (const x of D) {
    if (x.id === 'weight') items.push(['body', 'var(--body)', 'Weigh in', 'Before food or water', 'data-act="weigh" data-s="weights"']);
    else if (x.id === 'waist') items.push(['tape', 'var(--body)', 'Waist', 'Once a week', 'data-act="weigh" data-s="waist"']);
    else if (x.id === 'hrv') items.push(['heart', 'var(--heart)', 'Morning check', '1–5 min with the strap', `href="${x.href}"`]);
    else items.push(['check', x.id === 'bk' ? 'var(--bad)' : 'var(--move)', x.t, x.s.replace(/<[^>]+>/g, '').slice(0, 40), `href="${x.href}"`]);
  }
  if (!mt.n) items.splice(D[0]?.id === 'hrv' ? 1 : 0, 0, [MEAL_IC[m], 'var(--fuel)', `Log ${mealName(m).toLowerCase()}`, `${Math.max(0, Math.round(T.protein - totals(k).p))} g protein to go`, `data-act="addto" data-m="${m}"`]);
  if (!items.length) return '';
  return `<div class="todo" aria-label="Due today">${items.map(([icn, c, t, s, at]) => `<${at.startsWith('href') ? 'a' : 'button'} class="td" ${at} style="--c:${c}"><span class="ti">${ic(icn)}</span><span><b>${esc(t)}</b><span class="sub">${esc(s)}</span></span></${at.startsWith('href') ? 'a' : 'button'}>`).join('')}</div>`;
}
// Today's food in one card: eaten against the target, the macros, each meal one tap from adding, and what to eat next.
function fuelCard() {
  const k = todayKey(), T = targets(), t = totals(k), left = T.kcal - t.k;
  const carbRef = Math.max(50, (T.kcal - 4 * T.protein - 0.3 * T.kcal) / 4), fatRef = 0.3 * T.kcal / 9;
  const mac = (label, c, v, of, unit, ref) => `<div class="mac" style="--c:${c}"><span class="ml">${label}</span><b class="num">${Math.round(v)}<i>${of ? ` / ${of}` : ''} ${unit}</i></b>${meter2(v / (ref || of), c)}</div>`;
  // The four meals as tiles: what each holds in kcal and protein, the one due now marked, one tap to add to it.
  const due = nextMeal();
  const rows = MEALS.map(([m, l]) => {
    const mt = totals(k, m);
    return `<button class="mtile ${mt.n ? 'has' : ''} ${m === due && !mt.n ? 'due' : ''}" data-act="addto" data-m="${m}" aria-label="Add to ${l}"><span class="mi">${ic(MEAL_IC[m])}</span><span class="ml">${l}</span>${mt.n ? `<b class="num">${fmt(mt.k)}</b><span class="msub">${Math.round(mt.p)} g protein</span>` : `<b class="add">${ic('plus')}</b><span class="msub">${m === due ? 'due now' : 'empty'}</span>`}</button>`;
  }).join('');
  return `<section class="card" id="fuel">${cardHead('Fuel', 'food', 'var(--fuel)', '<a class="more-link" href="#food" data-act="gotoday">Diary ›</a>')}
    <div class="eatline"><b class="num">${fmt(t.k)}</b><i>of ${fmt(T.kcal)} kcal</i><span class="grow ${left < 0 ? 'over' : ''}">${fmt(Math.abs(left))} ${left < 0 ? 'over' : 'left'}</span></div>
    ${meter2(t.k / T.kcal, left < 0 ? 'var(--bad)' : 'var(--fuel)', null, true)}
    <div class="macs">${mac('Protein', 'var(--pro)', t.p, T.protein, 'g')}${mac('Carbs', 'var(--carb)', t.c, null, 'g', carbRef)}${mac('Fat', 'var(--fat)', t.ft, null, 'g', fatRef)}${mac('Fibre', 'var(--fibre)', t.fb, T.fibre, 'g')}</div>
    <div class="mtiles">${rows}</div>
    <p class="coach">${coach(T, t, k)}</p></section>`;
}
// The one thing your data says that is most worth knowing today.
function insightCard() {
  const H = headline();
  if (!H.length) return '';
  // A deck: today's starts where the date puts it, and a fling brings up the next (motion.js).
  const start = new Date().getDate() % H.length, i = (start + (deckI ?? 0)) % H.length, h = H[i];
  const c = { food: 'var(--fuel)', heart: 'var(--heart)', sleep: 'var(--sleep)', body: 'var(--body)', move: 'var(--move)', train: 'var(--move)' }[h.dom] || 'var(--accent)';
  const many = H.length > 1;
  return `<a class="card tap insight ${many ? 'deck' : ''} ${deckI ? 'enter' : ''}" href="${h.href}" ${many ? 'data-fling="deck"' : ''} data-k="ins${i}"><span class="ico" style="--c:${c}">${ic('spark')}</span><span><span class="eyebrow">From your data${many ? ` · ${(i - start + H.length) % H.length + 1} of ${H.length}` : ''}</span><b>${esc(h.t)}</b><span class="sub">${h.s}</span></span><span class="chev">›</span>${many ? `<span class="deckdots">${H.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</span>` : ''}</a>`;
}
// The body and movement side by side: the weight trend with its rate, and today's steps against the goal.
function bodyMove() {
  const k = todayKey(), T = targets(), M = T.model, st = S.steps[k] || 0, A = activityWeek();
  const ser = series().filter(x => gapDays(x.k, k) < 30), w = S.weights[k];
  let spark = '';
  if (ser.length >= 2) {
    const v = ser.map(x => x.t), lo = Math.min(...v), hi = Math.max(...v), span = Math.max(1, gapDays(ser[0].k, k));
    const pts = ser.map(x => [(gapDays(ser[0].k, x.k) / span * 120).toFixed(1), (34 - (x.t - lo) / (hi - lo || 1) * 28).toFixed(1)]);
    spark = `<svg class="mspark" viewBox="0 0 120 38" preserveAspectRatio="none" style="--c:var(--body)" aria-hidden="true"><path class="fill" d="M${pts.map(p => p.join(',')).join('L')}L120,38L0,38Z"/><path d="M${pts.map(p => p.join(',')).join('L')}"/></svg>`;
  }
  const rate = M.rate ?? (T.slope != null ? T.slope * 7 : null);
  return `<div class="duo">
    <button class="card tap" data-act="weigh" data-s="weights" style="text-align:left;font:inherit;color:inherit;border:0">
      <span class="eyebrow">Weight ${w != null ? '· today' : '· trend'}</span>
      <span class="kpi"><b class="num">${r1(w ?? M.W ?? T.wt)}<i>kg</i></b><span class="sub">${rate != null ? `${sign(rate, 2)} kg a week` : 'trend after a week'}</span></span>${spark}
      <span class="sub">${w == null ? 'Tap to weigh in' : `Trend ${r1(M.W ?? T.wt)} kg`}</span></button>
    <a class="card tap" href="#review">
      <span class="eyebrow">Move</span>
      <div class="dualrow">${ring('t-steps', st / T.stepGoal, { c: 'var(--move)', size: 58, stroke: 10, inner: `<b class="num">${Math.round(Math.min(999, st / T.stepGoal * 100))}</b>` })}<span class="kpi"><b class="num" style="font-size:22px">${fmt(st)}</b><span class="sub">of ${fmt(T.stepGoal)}</span></span></div>
      <span class="sub">${Math.round(A.who)} of 150 active min this week</span></a></div>`;
}
// Last night: length, stages, heart rate asleep, and how regular the week's sleep has been.
function nightCard() {
  const k = todayKey(), sx = S.sleepx[k], sl = S.sleep[k], Q = sri();
  if (sl == null && !sx) return '';
  const prev = range(28, shift(k, -1)), H = versus(sx?.hr, prev.map(d => S.sleepx[d]?.hr));
  return `<button class="card tap" data-act="dayx" data-k="${k}" style="display:block;width:100%;text-align:left;font:inherit;color:inherit;border:0">${cardHead('Last night', 'sleep', 'var(--sleep)', '<span class="chev">›</span>')}
    ${stats([[sl != null ? `${Math.floor(sl)}<i>h</i> ${Math.round((sl % 1) * 60)}<i>m</i>` : DASH, 'asleep'], [sx?.hr ? `${Math.round(sx.hr)}<i>bpm</i>` : DASH, `heart rate asleep${H.word && H.word !== 'usual' ? `, ${H.word}` : ''}`], [Q.v != null ? Math.round(Q.v) : DASH, Q.v != null ? 'regularity (SRI)' : 'regularity after 5 nights']])}
    ${sx ? miniStages(sx) : ''}</button>`;
}
function trainCard() {
  const k = todayKey(), did = nextDay(shift(k, 1)), plan = sessionPlan(shift(k, 1), did), R = readiness();
  if (!plan.lifts.length) return '';
  return `<button class="card tap" data-act="nextgo" style="display:block;width:100%;text-align:left;font:inherit;color:inherit;border:0">${cardHead(S.lifts[k] ? 'Done today · next' : 'Next in openGym', 'train', 'var(--move)', '<span class="chev">›</span>')}
    <b style="display:block;font-size:17px;margin-top:2px">${esc(plan.name)}</b><span class="sub">${esc(plan.focus)}</span>
    <p class="sub ease lv-${R.level}" style="margin:10px 0 0"><span class="dot"></span>${EASE[R.level][0]}</p></button>`;
}
function vToday() {
  const h = new Date().getHours(), greet = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${appbar(greet, dateLabel(todayKey(), { weekday: 'long', day: 'numeric', month: 'long' }), syncPill())}
    ${welcome()}${needsSyncLine() ? syncLine() : ''}
    ${part(trio)}${part(todoStrip)}${part(insightCard)}${part(fuelCard)}${part(bodyMove)}${part(nightCard)}${part(staleStrip)}${part(shoulderCard)}${part(trainCard)}
    ${S.profile.shoulder ? `<label class="card check" style="padding:12px 16px"><input type="checkbox" data-act="prehab" ${S.prehab[todayKey()] ? 'checked' : ''}><span>Shoulder routine: stretch and band work</span></label>` : ''}`;
}

// ---------- the log button ----------
// Everything that can be logged, from any screen: the meals (the one that is due first), a quick number, the scale,
// the tape, and the strap.
function vLog() {
  const k = overlay ? day : tab === 'food' ? day : todayKey(), m = nextMeal(), when = k === todayKey() ? 'today' : dateLabel(k, { weekday: 'long', day: 'numeric', month: 'short' });
  const tile = (icn, c, l, s, at, next) => `<${at.startsWith('href') ? 'a' : 'button'} class="qa ${next ? 'next' : ''}" ${at} style="--c:${c}"><span class="qi">${ic(icn)}</span><span class="ql">${l}</span>${s ? `<span class="qs">${s}</span>` : ''}</${at.startsWith('href') ? 'a' : 'button'}>`;
  const meals = MEALS.map(([mm, l]) => { const t = totals(k, mm); return tile(MEAL_IC[mm], 'var(--fuel)', l, t.n ? `${fmt(t.k)} kcal` : '', `data-act="addto" data-m="${mm}" data-k="${k}"`, mm === m && k === todayKey()); }).join('');
  const strap = S.meta.h9 || Object.keys(S.hrv).length;
  return `${sheetTop(`Log · ${when}`, 'What happened?', 'log')}
    <div class="eyebrow qlabel">Food</div>
    <div class="qgrid">${meals}${tile('bolt', 'var(--fuel)', 'Quick kcal', 'a meal out', `data-act="addto" data-m="${m}" data-k="${k}" data-c="quick"`)}${tile('copy', 'var(--fuel)', 'Plates', `${S.plates.length + THALI.length}`, `data-act="addto" data-m="${m}" data-k="${k}" data-c="thali"`)}${tile('search', 'var(--fuel)', 'Search', 'any food', `data-act="addto" data-m="${m}" data-k="${k}" data-c="find"`)}${tile('scan', 'var(--fuel)', 'Barcode', 'a pack', `data-act="scango" data-m="${m}" data-k="${k}"`)}</div>
    <div class="eyebrow qlabel">Body and heart</div>
    <div class="qgrid">${tile('body', 'var(--body)', 'Weight', S.weights[todayKey()] != null ? `${kg(S.weights[todayKey()])} kg` : '', 'data-act="weigh" data-s="weights"')}${tile('tape', 'var(--body)', 'Waist', '', 'data-act="weigh" data-s="waist"')}${tile('heart', 'var(--heart)', strap ? 'Morning check' : 'Strap', S.hrv[todayKey()] ? 'done' : '', 'href="#recovery" data-act="popnav"')}${tile('breathe', 'var(--pro)', 'Breathe', '', 'href="#lab-breathe" data-act="popnav"')}${tile('pulse', 'var(--heart)', 'Spot check', '', 'href="#lab-spot" data-act="popnav"')}${tile('move', 'var(--move)', 'Cardio', '', 'data-act="cardioadd"')}${tile('insight', 'var(--heart)', 'Live', '', 'href="#lab-live" data-act="popnav"')}${tile('sleep', 'var(--sleep)', 'Your day', '', `data-act="dayx" data-k="${todayKey()}"`)}</div></aside>`;
}

// ---------- the scale and the tape ----------
// A number that is easy to set with a thumb: steppers, a ruler, and the field itself. It starts at your trend, says
// how far from it you are, and asks before keeping a reading far off it.
const WG = { s: 'weights', v: null, k: null };
function wgBase(s) {
  if (s === 'waist') { const wk = Object.keys(S.waist).sort().pop(); return wk ? S.waist[wk] : S.profile.waist0; }
  return r1(energyModel().W ?? trendOn(todayKey()) ?? S.profile.w0);
}
function vWeigh() {
  const s = WG.s, isW = s === 'weights', k = WG.k || todayKey(), base = wgBase(s), v = WG.v ?? S[s][k] ?? base, step = isW ? 0.1 : 0.5;
  const lo = Math.floor(base - (isW ? 8 : 12)), hi = Math.ceil(base + (isW ? 8 : 12));
  const d = v - base, last = Object.keys(S[s]).filter(x => x < k).sort().pop();
  return `${sheetTop(isW ? 'After the toilet, before food or water' : 'Midway between the lowest rib and the hip bone, after breathing out', isW ? 'Weigh in' : 'Waist', `weigh-${s}`)}
    ${seg('wgday', [[todayKey(), 'Today'], [shift(todayKey(), -1), 'Yesterday']], k, 'tight')}
    <div class="amount"><button class="step" data-act="wg" data-d="-1" data-repeat="wg-" aria-label="Less">−</button><label class="qbox"><input id="wgin" class="qin num" type="number" inputmode="decimal" step="${step}" value="${r1(v)}" aria-label="${isW ? 'Weight in kg' : 'Waist in cm'}"><span>${isW ? 'kg' : 'cm'}</span></label><button class="step" data-act="wg" data-d="1" data-repeat="wg+" aria-label="More">+</button></div>
    ${scrubber('wg', clamp(r1(v), lo, hi), { step, min: lo, max: hi, px: isW ? 12 : 16, major: isW ? 10 : 4, label: x => Math.round(x) })}
    <p class="sub center num" id="wgnote">${isW ? `${Math.abs(d) < 0.05 ? 'On' : `${sign(d, 1)} kg from`} your trend of ${r1(base)} kg` : `${Math.abs(d) < 0.25 ? 'Same as' : `${sign(d, 1)} cm from`} the last, ${r1(base)} cm`}${last ? ` · last ${dateLabel(last, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}</p>
    <div class="rowb">${S[s][k] != null ? '<button class="ghost" data-act="wgdel">Remove</button>' : ''}<span class="grow"></span><button class="solid" data-act="wgsave">Save ${isW ? 'weight' : 'waist'}</button></div></aside>`;
}
SCRUB.wg = v => { WG.v = v; const i = $('#wgin'); if (i && document.activeElement !== i) i.value = r1(v); wgNote(); };
function wgNote() {
  const el = $('#wgnote'), base = wgBase(WG.s), d = WG.v - base;
  if (el) el.firstChild.textContent = WG.s === 'weights' ? `${Math.abs(d) < 0.05 ? 'On' : `${sign(d, 1)} kg from`} your trend of ${r1(base)} kg` : `${Math.abs(d) < 0.25 ? 'Same as' : `${sign(d, 1)} cm from`} the last, ${r1(base)} cm`;
}
function todayAct(a, el) {
  if (a === 'gotoday') { if (tab !== 'food') day = todayKey(); return false; }
  if (a === 'popnav') { const h = el.getAttribute('href'); if (!h) return false; navTo(h.slice(1)); return 'nav'; }
  if (a === 'addto') {
    day = el.dataset.k || todayKey(); addNext = el.dataset.c || null;
    navTo(`add-${el.dataset.m}`);
    return true;
  }
  if (a === 'weigh') { WG.s = el.dataset.s || 'weights'; WG.v = null; WG.k = todayKey(); if (pop) { pop = { kind: 'weigh' }; render(); buzz('tick'); } else openPop({ kind: 'weigh' }); return true; }
  if (a === 'wgday') { WG.k = el.dataset.v; WG.v = null; buzz('tick'); render(); return true; }
  if (a === 'wg') {
    const step = WG.s === 'weights' ? 0.1 : 0.5, cur = WG.v ?? S[WG.s][WG.k || todayKey()] ?? wgBase(WG.s);
    WG.v = Math.round((cur + step * +el.dataset.d) / step) * step; buzz('tick');
    const i = $('#wgin'); if (i) i.value = r1(WG.v);
    scrubTo('wg', r1(WG.v)); wgNote(); return true;
  }
  if (a === 'wgin') { const v = num(el.value, ...LIMITS[WG.s]); if (v != null) { WG.v = v; scrubTo('wg', v); wgNote(); } return true; }
  if (a === 'wgsave' || a === 'wgdel') {
    const s = WG.s, k = WG.k || todayKey(), prev = S[s][k], prevMan = S.manual[s]?.[k];
    const v = a === 'wgdel' ? null : num(WG.v ?? $('#wgin')?.value ?? prev ?? wgBase(s), ...LIMITS[s]);
    if (a === 'wgsave' && v == null) { buzz('warn'); toast('That value is out of range'); return true; }
    if (MANUAL.includes(s)) setManual(s, k, v); else if (v == null) delete S[s][k]; else S[s][k] = r1(v);
    save(); closePop();
    const off = s === 'weights' && v != null ? weighCheck(k, v) : null, undo = { label: 'Undo', fn: () => { if (prev == null) { if (MANUAL.includes(s)) setManual(s, k, null); else delete S[s][k]; } else { S[s][k] = prev; if (MANUAL.includes(s) && !prevMan) delete S.manual[s][k]; } save(); render(); } };
    if (off != null) { buzz('warn'); toast(`${sign(off, 1)} kg from your trend. A typo?`, 7000, undo); }
    else { buzz(v == null ? 'heavy' : 'ok'); toast(v == null ? 'Removed' : `${r1(v)} ${s === 'weights' ? 'kg' : 'cm'} saved`, 5000, undo); }
    return true;
  }
  return false;
}
// Out of an open sheet to another screen: the sheet's own history entry becomes the new screen, so one back
// gesture returns to where you were, not to a screen with a closed sheet.
let addNext = null;
function navTo(hash) {
  if (pop && history.state?.pop) { pop = null; history.replaceState(null, '', '#' + hash); route(); }
  else { pop = null; location.hash = hash; }
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-today.js');
