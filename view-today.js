'use strict';
// Today: what to eat next, the morning's numbers, and the meals.

// One concrete suggestion, built from what is actually left today.
function coach(T, t) {
  const pLeft = T.protein - t.p, kLeft = T.kcal - t.k, isToday = day === todayKey(), hour = new Date().getHours();
  if (!t.n) return isToday && hour < 11 ? `Start with protein: about ${T.perMeal} g at breakfast. A scoop of whey, or dahi with chilla, covers most of it.` : `Start with protein. Whey, usal or dahi at each meal covers most of ${T.protein} g.`;
  if (kLeft < -100) return `${fmt(-kLeft)} kcal over. One day does not move the trend; the 7-day average does. Log it and carry on.`;
  if (pLeft <= 8) return t.fb < T.fibre - 8 ? 'Protein done. Fibre is short: a peru, koshimbir, or bhakri instead of poli closes it.' : 'Protein done. Whatever calories remain are yours to spend.';
  const low = isToday ? MEALS.filter(([m]) => m !== 'snack' && totals(day, m).n && totals(day, m).p < T.perMeal * 0.6).map(m => m[1].toLowerCase()) : [];
  const wheyToday = (S.food[day] || []).filter(e => e.id === 'whey').reduce((a, e) => a + e.q, 0);
  const pick = []; let p = 0, k = 0;
  for (const id of GAP) {
    const f = food(id);
    if (pick.length >= 3 || pLeft - p <= 8) break;
    if ((id === 'whey' && wheyToday >= 2) || k + f.k > kLeft) continue;
    pick.push(f); p += f.p; k += f.k;
  }
  const lead = low.length ? `${low.join(' and ').replace(/^./, c => c.toUpperCase())} ${low.length > 1 ? 'were' : 'was'} light on protein. ` : '';
  if (!pick.length) return `${lead}${Math.round(pLeft)} g protein short with ${fmt(Math.max(0, kLeft))} kcal left. Whey in water is the leanest fix: 24 g for 120 kcal.`;
  return `${lead}${Math.round(pLeft)} g protein to go. ${pick.map(f => `${f.u.replace(/ \(.*/, '')} ${f.n.toLowerCase()}`).join(' + ')} gives ${Math.round(p)} g for ${fmt(k)} kcal.`;
}
function gauge(T, t) {
  const kp = Math.min(100, t.k / T.kcal * 100), pp = Math.min(100, t.p / T.protein * 100), over = t.k > T.kcal * 1.05, left = Math.round(T.kcal - t.k);
  // Arcs and the number ease from what was on screen last time, so adding food visibly moves them.
  const L = last.g?.day === day ? last.g : { kp: 0, pp: 0, left: T.kcal };
  last.g = { day, kp, pp, left };
  return `<svg class="gauge" viewBox="0 0 300 168" role="img" aria-label="${Math.round(t.k)} of ${T.kcal} kcal, ${Math.round(t.p)} of ${T.protein} g protein">
    <path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="track"/>
    ${kp > 0 ? `<path d="M26 152A124 124 0 0 1 274 152" pathLength="100" class="arc kc ${over ? 'over' : ''}" stroke-dasharray="${L.kp} 100" data-dash="${kp.toFixed(2)}"/>` : ''}
    <path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="track thin"/>
    ${pp > 0 ? `<path d="M50 152A100 100 0 0 1 250 152" pathLength="100" class="arc pr" stroke-dasharray="${L.pp} 100" data-dash="${pp.toFixed(2)}"/>` : ''}
    <text x="150" y="118" class="gnum" data-from="${Math.abs(L.left)}" data-to="${Math.abs(left)}" data-fmt="int">${fmt(Math.abs(left))}</text>
    <text x="150" y="144" class="gsub">kcal ${left < 0 ? 'over' : 'left'} of ${fmt(T.kcal)}</text></svg>`;
}
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
// ---------- the top of Today ----------
// The day in one look: the verdict as a ring, and the three things behind it, each against your own normal.
function briefCard() {
  const R = readiness(), V = R.V, rt = R.R, sl = S.sleep[day], L = sleepStats(14, shift(day, -1));
  const word = { go: 'Train as planned', care: 'Train, but listen to your body', easy: 'Keep today easy', unknown: 'Building your baseline' }[R.level];
  const h = new Date().getHours(), greet = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  // Each signal: value, a 0–1 position against your normal (the band is the middle), and a short reading.
  const sig = [];
  if (V.now || V.roll) {
    const v = V.now ? V.now.rmssd : V.roll, pos = V.lo ? clamp((Math.log(v) - Math.log(V.lo * 0.75)) / (Math.log(V.hi * 1.3) - Math.log(V.lo * 0.75)), 0.03, 0.97) : null;
    sig.push(['HRV', `${Math.round(v)}<i> ms</i>`, pos, V.lo ? `${V.now ? 'today' : '7-day avg'} ${{ low: 'below', high: 'above' }[V.now ? V.day : V.state] || 'in'} ${Math.round(V.lo)}–${Math.round(V.hi)}` : `${V.need ?? 0} more for your range`, (V.now ? V.day : V.state) === 'low' ? 'bad' : 'good', V.lo ? [(Math.log(V.lo) - Math.log(V.lo * 0.75)) / (Math.log(V.hi * 1.3) - Math.log(V.lo * 0.75)), (Math.log(V.hi) - Math.log(V.lo * 0.75)) / (Math.log(V.hi * 1.3) - Math.log(V.lo * 0.75))] : null]);
  }
  const r = restingHR(day);
  if (r) sig.push(['Resting', `${Math.round(r.v)}<i> bpm</i>`, rt.delta != null ? clamp(0.5 + rt.delta / 16, 0.03, 0.97) : null, rt.delta != null ? `${sign(rt.delta, 1)} vs 3 weeks` : 'from the ' + (r.src === 'strap' ? 'strap' : 'watch'), rt.delta != null && rt.delta >= 3 ? 'bad' : 'good', [0.5 - 3 / 16, 0.5 + 3 / 16]]);
  if (sl != null) sig.push(['Sleep', `${r1(sl)}<i> h</i>`, clamp((sl - 4) / 6, 0.03, 0.97), L.avg ? `usually ${r1(L.avg)} h` : 'last night', sl < 6 ? 'bad' : 'good', [0.5, 5 / 6]]);
  const frac = { go: 1, care: 0.66, easy: 0.33, unknown: 0.12 }[R.level];
  return `<a class="brief lv-${R.level}" href="#recovery">
    <div class="ring"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="19" pathLength="100"/><circle class="fg" cx="22" cy="22" r="19" pathLength="100" stroke-dasharray="0 100" data-dash="${(frac * 100).toFixed(0)}"/></svg><span>${{ go: 'Go', care: 'Care', easy: 'Easy', unknown: '·' }[R.level]}</span></div>
    <div class="grow"><div class="eyebrow">${greet}${basis(R, true) ? ` · ${basis(R, true)}` : ''}</div><b class="bw">${word}</b>
      ${sig.length ? `<div class="sigs">${sig.map(([n, v, p, t, c, band]) => `<div class="sg"><span class="sn">${n}</span><b class="num">${v}</b><span class="meter">${band ? `<i class="bd" style="left:${(band[0] * 100).toFixed(0)}%;width:${((band[1] - band[0]) * 100).toFixed(0)}%"></i>` : ''}${p != null ? `<i class="pt ${c}" style="left:${(p * 100).toFixed(0)}%"></i>` : ''}</span><span class="st">${t}</span></div>`).join('')}</div>`
        : '<span class="sub">A morning check with the H9, or a synced night from the watch, and this fills in.</span>'}
      ${R.why[0] ? `<span class="sub why1">${esc(R.why[0][1])}</span>` : ''}</div></a>`;
}
// One tap to whatever is most often done next.
function nextMeal() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner'; }
const QICON = {
  food: '<svg viewBox="0 0 24 24"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 3c-2 2-2 6 0 8v10"/></svg>',
  weigh: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M9 9a3 3 0 0 1 6 0M12 9l1.5-1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 3 10 2.5-7 1.5 2H21"/></svg>',
  breathe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity=".55"/><circle cx="12" cy="12" r="10.5" opacity=".25"/></svg>',
  cardio: '<svg viewBox="0 0 24 24"><circle cx="15" cy="4.5" r="2"/><path d="M8 21l3-6 3 2v5M6 12l3-4 4 1 3 4h3"/></svg>',
  day: '<svg viewBox="0 0 24 24"><path d="M3 15c3 0 3-6 6-6s3 9 6 9 3-12 6-12"/></svg>',
};
function quickDock() {
  const m = nextMeal(), strap = S.meta.h9 || Object.keys(S.hrv).length, needCheck = strap && !S.hrv[todayKey()] && new Date().getHours() < 12;
  const items = [
    ['food', `Log ${MEALS.find(x => x[0] === m)[1].toLowerCase()}`, `href="#add-${m}"`],
    ['weigh', S.weights[todayKey()] != null ? `${kg(S.weights[todayKey()])} kg` : 'Weigh in', 'data-act="qweigh"'],
    needCheck ? ['check', 'Morning check', 'href="#recovery"'] : ['breathe', 'Breathe', 'href="#lab-breathe"'],
    needCheck ? ['breathe', 'Breathe', 'href="#lab-breathe"'] : ['check', 'Spot check', 'href="#lab-spot"'],
    ['cardio', 'Cardio', 'data-act="cardioadd"'],
    ['day', 'Your day', `data-act="dayx" data-k="${todayKey()}"`],
  ];
  return `<nav class="dock" aria-label="Quick actions">${items.map(([ic, l, at]) => `<${at.startsWith('href') ? 'a' : 'button'} class="qa q-${ic}" ${at}><span class="qi">${QICON[ic]}</span><span class="ql">${l}</span></${at.startsWith('href') ? 'a' : 'button'}>`).join('')}</nav>`;
}
// Sideways cards: last night, movement, body and the next session. Each opens its detail.
function cardRow() {
  const k = todayKey(), cards = [], sx = S.sleepx[k], sl = S.sleep[k];
  if (sl != null || sx) {
    const prev = range(28, shift(k, -1)), V = versus(sl, prev.map(d => S.sleep[d])), H = versus(sx?.hr, prev.map(d => S.sleepx[d]?.hr));
    cards.push(`<button class="hc c-sleep" data-act="dayx" data-k="${k}"><span class="eyebrow">Last night</span><b class="num big">${sl != null ? `${Math.floor(sl)}<i>h</i> ${Math.round((sl % 1) * 60)}<i>m</i>` : DASH}</b>
      ${sx ? miniStages(sx) : ''}<span class="sub">${[sx?.hr ? `sleeping ${Math.round(sx.hr)} bpm${H.word && H.word !== 'usual' ? `, ${H.word}` : ''}` : '', V.word && V.word !== 'usual' ? `${V.word.replace('low', 'short').replace('high', 'long')} night for you` : ''].filter(Boolean).join(' · ') || 'From the watch'}</span></button>`);
  }
  const T = targets(), st = S.steps[k] || 0, A = activityWeek();
  cards.push(`<a class="hc c-move" href="#training"><span class="eyebrow">Move</span>${ringSvg(st / T.stepGoal, 'leaf')}<b class="num">${fmt(st)}<i> / ${fmt(T.stepGoal)}</i></b><span class="sub">${Math.round(A.who)} of 150 active minutes this week</span></a>`);
  const ser = series().filter(x => gapDays(x.k, k) < 30);
  if (ser.length >= 2) {
    const wk = T.slope == null ? null : T.slope * 7, v = ser.map(x => x.t), lo = Math.min(...v), hi = Math.max(...v);
    const d = ser.map((x, i) => `${i ? 'L' : 'M'}${(gapDays(ser[0].k, x.k) / Math.max(1, gapDays(ser[0].k, k)) * 120).toFixed(1)},${(36 - (x.t - lo) / (hi - lo || 1) * 30).toFixed(1)}`).join('');
    cards.push(`<a class="hc c-body" href="#review"><span class="eyebrow">Body</span><b class="num big">${r1(T.wt)}<i> kg</i></b><svg class="mspark" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg><span class="sub">${wk != null ? `${sign(wk, 2)} kg a week` : 'trend, 30 days'}</span></a>`);
  }
  const did = nextDay(shift(k, 1)), plan = sessionPlan(shift(k, 1), did);
  if (plan.lifts.length) cards.push(`<a class="hc c-train" href="#training"><span class="eyebrow">${S.lifts[k] ? 'Done today · next' : 'Next in openGym'}</span><b>${esc(plan.name)}</b><span class="sub">${esc(plan.focus)}</span><span class="sub ease lv-${readiness().level}"><span class="dot"></span>${EASE[readiness().level][0]}</span></a>`);
  return `<div class="cards" role="list">${cards.join('')}</div>`;
}
function ringSvg(f, cls) { return `<svg class="mring2 ${cls}" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15" pathLength="100"/><circle class="fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="0 100" data-dash="${clamp(f * 100, 0, 100).toFixed(1)}"/></svg>`; }
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
  const D = shoulderDue();
  if (D) out.push({ id: 'sx', t: 'Shoulder check', s: `How did ${D.ids.length > 1 ? `${D.ids.length} exercises` : esc(exName(D.ids[0]))} feel on ${dateLabel(D.k, { weekday: 'long' })}? It decides the next loads.`, href: '#training' });
  if (ogPlanStale()) out.push({ id: 'plan', t: 'Send your plan to openGym', s: 'It changed since the last file: a swap, an exercise out after pain, or a new programme.', href: '#set-train' });
  if (NATIVE && BACKUP.folder && S.meta.backup && gapDays(S.meta.backup, k) >= 3) out.push({ id: 'bk', t: 'Backup has stopped', s: `Last written ${dateLabel(S.meta.backup)}. Choose the folder again.`, href: '#set-data' });
  return out;
}
function checkins() {
  if (day !== todayKey()) return '';
  const D = dueList();
  if (!D.length) return '';
  return `<section class="checkins"><div class="eyebrow">Due today · ${D.length}</div><ul>${D.map(x => x.field
    ? `<li class="ci"><span class="grow"><b>${x.t}</b><span class="sub">${x.s}</span></span><label class="ciin"><input type="number" inputmode="decimal" step="${x.field === 'waist' ? 0.5 : 0.1}" data-log="${x.field}" placeholder="${x.field === 'waist' ? kg(projection().waistNow) : r1(targets().wt)}" aria-label="${x.t}"><i>${x.field === 'waist' ? 'cm' : 'kg'}</i></label></li>`
    : `<li class="ci"><a href="${x.href}"><span class="grow"><b>${x.t}</b><span class="sub">${x.s}</span></span><span class="chev">›</span></a></li>`).join('')}</ul></section>`;
}
function vitalInput(stream, label, whyKey, unit, attrs, placeholder) {
  const v = S[stream][day], fromWatch = v != null && !S.manual[stream]?.[day] && stream !== 'waist';
  return `<label>${why(whyKey, label)}<span class="f"><input type="number" ${attrs} data-log="${stream}" value="${v ?? ''}" placeholder="${placeholder}"><i>${unit}</i></span>${fromWatch ? src('watch') : ''}</label>`;
}
function vToday() {
  const T = targets(), t = totals(day), isToday = day === todayKey(), y = shift(day, -1);
  const meals = MEALS.map(([m, label]) => {
    const mt = totals(day, m), main = m !== 'snack';
    const items = (S.food[day] || []).map((e, i) => [e, i]).filter(([e]) => e.m === m).map(([e, i]) => `<li data-flash="${esc(m + e.id)}" data-swipe="fdelrow" data-i="${i}"><button class="grow rowbtn" data-act="fedit" data-i="${i}"><span class="nm">${esc(e.n)}</span><span class="sub">${esc(portion(e))} · ${fmt(e.k * e.q)} kcal · ${r1(e.p * e.q)} g protein</span></button>
        <button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="-0.5" aria-label="Less ${esc(e.n)}">−</button><button class="step" data-act="q" data-m="${m}" data-id="${esc(e.id)}" data-d="0.5" aria-label="More ${esc(e.n)}">+</button></li>`).join('');
    const canCopy = !mt.n && totals(y, m).n;
    const pOk = main && mt.p >= T.perMeal * 0.8;
    return `<section class="meal"><div class="mh"><h2>${label}</h2><span class="num sub">${mt.n ? `${fmt(mt.k)} kcal · <span class="${pOk ? 'ok' : ''}">${Math.round(mt.p)} g protein</span>` : ''}</span><a class="plus" href="#add-${m}" aria-label="Add to ${label}"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></a></div>
      ${items ? `<ul>${items}</ul>` : canCopy ? `<button class="ghost" data-act="copy" data-m="${m}">Same as yesterday</button>` : ''}</section>`;
  }).join('');
  const done = S.food[day] ? isComplete(day) : null;
  const full = done == null ? '' : `<p class="fullline">${done ? 'Counts toward your burn estimate.' : 'Looks incomplete, so it is left out of your burn estimate.'} <button class="link" data-act="full">${done ? 'Mark incomplete' : 'Mark complete'}</button> ${why('logging', 'Why')}</p>`;
  const nav = d => `<button class="nav" data-act="day" data-d="${d}" ${d > 0 && isToday ? 'disabled' : ''} aria-label="${d < 0 ? 'Previous' : 'Next'} day">${d < 0 ? '‹' : '›'}</button>`;
  const title = isToday ? 'Today' : day === shift(todayKey(), -1) ? 'Yesterday' : dateLabel(day);
  return `${masthead(title, dateLabel(day, { weekday: 'long', day: 'numeric', month: 'long' }), { center: true, before: nav(-1), after: nav(1), h1: isToday ? '' : 'data-act="today" class="tap"' })}
    ${isToday ? welcome() + syncLine() + part(briefCard) + part(quickDock) + part(checkins) + part(cardRow) : ''}
    <section class="hero">${gauge(T, t)}
      <div class="legend"><div>${why('kcal', 'Calories')}<b class="num">${fmt(t.k)}<i> / ${fmt(T.kcal)}</i></b></div>
        <div>${why('protein', 'Protein')}<b class="num pr">${Math.round(t.p)}<i> / ${T.protein} g</i></b></div>
        <div>${why('fibre', 'Fibre')}<b class="num">${Math.round(t.fb)}<i> / ${T.fibre} g</i></b></div></div>
      ${macroLine(t)}<p class="coach">${coach(T, t)}</p></section>
    <section class="vitals">
      ${vitalInput('weights', 'Weight', 'rate', 'kg', 'inputmode="decimal" step="0.1"', r1(T.wt))}
      ${vitalInput('steps', 'Steps', 'steps', `/&nbsp;${fmt(T.stepGoal)}`, 'inputmode="numeric"', '0')}
      ${vitalInput('sleep', 'Sleep', 'sleep', 'h', 'inputmode="decimal" step="0.1"', '7–9')}
    </section>
    ${S.profile.shoulder ? `<label class="check"><input type="checkbox" data-act="prehab" ${S.prehab[day] ? 'checked' : ''}><span>Shoulder routine: stretch and band work</span></label>` : ''}
    ${meals}${full}`;
}

// ---------- add food ----------
const CUSTOM = { basis: '100' };
// "1 katori · about 150 g" when a unit's weight is known and not already written in it.
function unitText(f) { return f.g && !/\d\s*(g|ml)\b/.test(f.u) ? `${f.u} · about ${Math.round(f.g)} ${/glass|cup|ml/.test(f.u) ? 'ml' : 'g'}` : f.u; }
// Where a packaged or raw food's numbers come from, in a word; home dishes are recipe estimates and say nothing.
function srcTag(f) { const L = { label: 'pack label', brand: 'maker', derived: 'maker', ifct: 'IFCT', usda: 'USDA' }; return L[f.src] ? ` · <i class="srct">${L[f.src]}</i>` : ''; }
// The day's carbs and fat, and how the energy splits, only as far as the logged foods know them.
function macroLine(t) {
  if (!t.n || !t.kn) return '';
  const share = t.kn / t.k, kc = 4 * t.p + 4 * t.c + 9 * t.ft || 1;
  const pc = x => Math.round(x / kc * 100);
  return `<div class="macros"><div class="mbar" role="img" aria-label="Energy from protein, carbs and fat"><i class="mp" style="flex:${4 * t.p}"></i><i class="mc" style="flex:${4 * t.c}"></i><i class="mf" style="flex:${9 * t.ft}"></i></div>
    <p class="sub num"><i class="k mp"></i>Protein ${pc(4 * t.p)}% <i class="k mc"></i>Carbs ${Math.round(t.c)} g · ${pc(4 * t.c)}% <i class="k mf"></i>Fat ${Math.round(t.ft)} g · ${pc(9 * t.ft)}%${share < 0.97 ? ` <span class="small">· split known for ${Math.round(share * 100)}% of the day's kcal</span>` : ''}</p></div>`;
}
function addRows(meal) {
  const q = query.trim().toLowerCase(), list = S.food[day] || [];
  const row = (f, del) => {
    const e = list.find(x => x.m === meal && x.id === f.id);
    return `<li class="${e ? 'on' : ''}" data-flash="${esc(meal + f.id)}"><div class="grow" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1"><span class="nm">${esc(f.n)}</span><span class="sub">${esc(unitText(f))} · ${fmt(f.k)} kcal · ${f.p} g protein${srcTag(f)}</span></div>
      ${e ? `<button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="-0.5" aria-label="Less">−</button><b class="qty num">${e.q}</b><button class="step" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="0.5" aria-label="More">+</button>`
        : `${del ? `<button class="x" data-act="delcustom" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.n)}">×</button>` : ''}<span class="add" data-act="q" data-m="${meal}" data-id="${esc(f.id)}" data-d="1">+</span>`}</li>`;
  };
  if (q) {
    const words = q.split(/\s+/);
    return allFoods().filter(f => words.every(w => f.n.toLowerCase().includes(w))).map(f => row(f)).join('') || '<li class="sub">Nothing by that name. Add it under Mine.</li>';
  }
  if (cat === 'thali') return THALI.map(([name, parts], i) => {
    const s = parts.reduce((a, [id, n]) => { const f = food(id); a.k += f.k * n; a.p += f.p * n; return a; }, { k: 0, p: 0 });
    return `<li data-act="thali" data-m="${meal}" data-i="${i}"><div class="grow"><span class="nm">${name}</span><span class="sub">${parts.map(([id, n]) => `${n} ${food(id).n.toLowerCase()}`).join(', ')}</span><span class="sub">${fmt(s.k)} kcal · ${Math.round(s.p)} g protein</span></div><span class="add">+</span></li>`;
  }).join('');
  if (cat === 'quick') return `<li class="form"><div class="grow"><span class="nm">Quick add</span><span class="sub">For a meal out or a label you can read: just the numbers.</span>
      <div class="fgrid"><input id="k_n" placeholder="What, optional" class="span2"><input id="k_k" type="number" inputmode="numeric" placeholder="kcal"><input id="k_p" type="number" inputmode="decimal" placeholder="Protein g"></div>
      <button class="solid" data-act="quick" data-m="${meal}">Add</button></div></li>` + (S.food[day] || []).filter(e => e.m === meal && e.cat === 'quick').map(e => row(e)).join('');
  if (cat === 'mine') return S.custom.map(f => row(f, true)).join('') + `<li class="form"><div class="grow"><span class="nm">Add your own</span>
      <span class="sub">Copy the pack's panel exactly as printed. Most Indian labels give values per 100 g: choose that and enter the serving size in grams, and the serving is worked out for you.</span>
      ${seg('cbasis', [['serving', 'Per serving'], ['100', 'Per 100 g / ml']], CUSTOM.basis, 'tight')}
      <div class="fgrid"><input id="c_n" placeholder="Name" class="span2"><input id="c_u" placeholder="Serving, e.g. 1 bar"><input id="c_g" type="number" inputmode="decimal" placeholder="Serving g / ml">
      <input id="c_k" type="number" inputmode="decimal" placeholder="kcal"><input id="c_p" type="number" inputmode="decimal" placeholder="Protein g">
      <input id="c_c" type="number" inputmode="decimal" placeholder="Carbs g"><input id="c_ft" type="number" inputmode="decimal" placeholder="Fat g">
      <input id="c_fb" type="number" inputmode="decimal" placeholder="Fibre g" class="span2"></div>
      <p class="sub small" id="c_chk" aria-live="polite"></p>
      <button class="solid" data-act="custom" data-m="${meal}">Save and add</button></div></li>`;
  if (cat === 'usual') {
    const fr = S.freq[meal] || {}, ids = Object.keys(fr).sort((a, b) => fr[b] - fr[a]);
    return [...new Set([...ids, ...USUAL[meal]])].slice(0, 14).map(food).filter(Boolean).map(f => row(f)).join('');
  }
  return allFoods().filter(f => f.cat === cat).map(f => row(f)).join('');
}
function addFoot(meal) {
  const t = totals(day, meal), T = targets(), all = totals(day);
  return `<div><b class="num">${fmt(t.k)} kcal · ${Math.round(t.p)} g protein</b><span class="sub num">Day: ${fmt(all.k)} / ${fmt(T.kcal)} · ${Math.round(all.p)} / ${T.protein} g</span></div><button class="solid" data-act="close">Done</button>`;
}
function vAdd(meal) {
  return `${masthead(MEALS.find(m => m[0] === meal)[1], `Add to · ${dateLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}`, { before: '<button class="nav" data-act="close" aria-label="Back">‹</button>' })}
    <input id="q" type="search" placeholder="Search: poli, usal, pohe, whey" value="${esc(query)}" autocomplete="off">
    <div class="chips">${CATS.map(([c, l]) => `<button class="${c === cat && !query ? 'on' : ''}" data-act="cat" data-c="${c}">${l}</button>`).join('')}</div>
    <ul class="foods" id="rows">${addRows(meal)}</ul>
    <footer class="addfoot" id="foot">${addFoot(meal)}</footer>`;
}
function bump(meal, f, d) {
  if (!f) return;
  const list = S.food[day] ||= [];
  let e = list.find(x => x.m === meal && x.id === f.id);
  if (!e) {
    if (d <= 0) return;
    e = { id: f.id, n: f.n, u: f.u, k: f.k, p: f.p, fb: f.fb, cat: f.cat, m: meal, q: 0 };
    if (f.c != null && f.ft != null) Object.assign(e, { c: f.c, ft: f.ft });
    if (f.g) e.g = f.g;
    if (f.src) e.src = f.src;
    list.push(e);
  }
  e.q = r1(e.q + d);
  if (e.q <= 0) list.splice(list.indexOf(e), 1);
  if (!list.length) delete S.food[day];
  if (d >= 1 && f.cat !== 'quick') { const fr = S.freq[meal] ||= {}; fr[f.id] = (fr[f.id] || 0) + 1; }
  if (d > 0) flash(meal + f.id);
  buzz('tick');
  save();
}

// ---------- editing an entry ----------
function vFoodEdit(i) {
  const e = (S.food[day] || [])[i];
  if (!e) return '';
  const src = { label: 'From the pack’s nutrition panel', brand: 'Energy and protein as the maker states them; carbs and fat are not published', derived: 'The maker’s energy, protein and fat; carbs are the energy left over', ifct: 'Indian Food Composition Tables 2017 (ICMR-NIN)', usda: 'USDA FoodData Central', recipe: 'Estimate from typical home recipes: oil and portion move it by about a fifth', mine: 'Your own entry' }[e.src];
  const ref = FOODIDX.get(e.id)?.ref, unit = / ml\b|glass|cup/.test(e.u) ? 'ml' : 'g';
  return `${sheetTop(`${esc(e.u)} · ${fmt(e.k)} kcal · ${e.p} g protein each`, esc(e.n), `fedit-${i}`)}
    <div class="wstep big"><button class="step" data-act="fq" data-d="-0.5" data-repeat="fq-">−</button><span class="grow"><b class="num" id="fq">${qtxt(e.q)}</b> × ${esc(e.u)}</span><button class="step" data-act="fq" data-d="0.5" data-repeat="fq+">+</button></div>
    ${seg('fqset', [0.25, 0.5, 1, 1.5, 2, 3].map(q => [q, qtxt(q)]), e.q, 'tight')}
    ${e.g ? `<label class="weigh"><span>Weighed it?</span><span class="f"><input type="number" id="fg" data-act="fg" inputmode="decimal" step="1" min="1" value="${Math.round(e.q * e.g)}"><i>${unit}</i></span><span class="sub small">one ${esc(e.u)} is ${/\(\d/.test(e.u) ? '' : 'about '}${Math.round(e.g)} ${unit}</span></label>` : ''}
    <div id="fsum">${foodSum(e)}</div>
    ${src ? `<p class="sub small">${src}${ref ? ` · ${esc(ref)}` : ''}.</p>` : ''}
    <h3>Meal</h3>${seg('fmeal', MEALS, e.m)}
    <div class="rowb"><button class="danger" data-act="fdel">Remove</button><span class="grow"></span><button class="solid" data-act="popclose">Done</button></div></aside>`;
}
// What this portion holds, and the food per 100 g when its weight is known.
function foodSum(e) {
  const q = e.q, has = e.c != null, unit = / ml\b|glass|cup/.test(e.u) ? 'ml' : 'g';
  const row = [[fmt(e.k * q), 'kcal'], [r1(e.p * q), 'g protein'], [has ? r1(e.c * q) : DASH, 'g carbs'], [has ? r1(e.ft * q) : DASH, 'g fat']];
  const per = e.g ? `Per 100 ${unit}: ${Math.round(e.k / e.g * 100)} kcal · ${r1(e.p / e.g * 100)} g protein${has ? ` · ${r1(e.c / e.g * 100)} g carbs · ${r1(e.ft / e.g * 100)} g fat` : ''} · ${r1(e.fb / e.g * 100)} g fibre` : `${r1(e.fb * q)} g fibre`;
  const off = atwaterOff(e);
  const chk = off != null && e.k >= 20 && Math.abs(off) > 0.2 ? `<p class="flag small">The energy and the macros of this food disagree by ${Math.round(Math.abs(off) * 100)}%: one of the numbers is probably mistyped.</p>` : '';
  return `${stats(row, 'tight')}<p class="sub small num center">${per}</p>${chk}`;
}
SWIPE.fdelrow = el => {
  const k = day, list = S.food[k] || [], i = +el.dataset.i, e = list[i];
  if (!e) return render();
  list.splice(i, 1); if (!list.length) delete S.food[k];
  save(); render();
  undoable(`${e.n} removed`, () => { (S.food[k] ||= []).splice(i, 0, e); });
};
function foodAct(a, el) {
  if (a === 'qweigh') { const i = document.querySelector('input[data-log="weights"]'); if (i) { i.scrollIntoView({ block: 'center', behavior: motionOK() ? 'smooth' : 'auto' }); setTimeout(() => i.focus(), motionOK() ? 350 : 0); } return true; }
  if (a === 'fedit') { openPop({ kind: 'fedit', i: +el.dataset.i }); return true; }
  if (!['fq', 'fqset', 'fmeal', 'fdel', 'fg'].includes(a)) return false;
  const list = S.food[day] || [], i = pop?.i, e = list[i];
  if (!e) return true;
  const paint = () => {
    const q = $('#fq'); if (q) q.textContent = qtxt(e.q);
    const t = $('#fsum'); if (t) t.innerHTML = foodSum(e);
    const g = $('#fg'); if (g && document.activeElement !== g) g.value = Math.round(e.q * e.g);
    $$('.seg button[data-act="fqset"]').forEach(b => b.classList.toggle('on', +b.dataset.v === e.q));
  };
  if (a === 'fg') { const g = num(el.value, 1, 5000); if (g == null || !e.g) return true; e.q = clamp(Math.round(g / e.g * 100) / 100, 0.01, 50); save(); paint(); return true; }
  if (a === 'fq') { e.q = clamp(Math.round((e.q + +el.dataset.d) * 2) / 2, 0.5, 50); save(); buzz('tick'); paint(); return true; }
  if (a === 'fqset') { e.q = +el.dataset.v; save(); buzz('tick'); paint(); return true; }
  if (a === 'fmeal') { e.m = el.dataset.v; save(); buzz('tick'); render(); return true; }
  const k = day;
  list.splice(i, 1); if (!list.length) delete S.food[k];
  save(); closePop();
  undoable(`${e.n} removed`, () => { (S.food[k] ||= []).splice(i, 0, e); });
  return true;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-today.js');
