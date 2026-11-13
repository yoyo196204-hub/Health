'use strict';
// Train: today's session one exercise at a time, the rest timer, cardio, and what the week added up to.

let openEx = null;          // the exercise card that is open
const wk = {};              // working weight per exercise for today, before any set is logged
let liteOff = {};           // days where you turned the lighter session off
const extra = {};           // sets added beyond the plan, per day and exercise

function isLite(k = day) {
  if (k !== todayKey() || liteOff[k]) return false;
  return readiness(k).level === 'easy';
}
// Seven days at a glance: the letter of a lifting day, a heart for cardio, the day you are viewing ringed.
function weekStrip(end) {
  return `<div class="week">${range(7, end).map(k => {
    const ss = sessions(k), L = S.lifts[k], mark = L ? L.day : ss.length ? '♥' : '';
    return `<button class="wd ${k === day ? 'cur' : ''} ${mark ? 'did' : ''} ${k === todayKey() ? 'now' : ''}" data-act="goday" data-k="${k}"><span>${weekday(k)}</span><b>${esc(mark) || '·'}</b></button>`;
  }).join('')}</div>`;
}
function thumb(id, cls = 'thumb') {
  return EXD[id]?.media ? `<span class="${cls}"><img src="media/${id}.gif" alt="" loading="lazy" decoding="async"></span>` : `<span class="${cls} none">${musclesGlyph(id)}</span>`;
}
function liftPlan(L, lite) { return lite ? Object.assign({}, L, { sets: Math.max(1, L.sets - 1) }) : L; }

function setRow(L, i, cur, G, pr) {
  const s = cur[i] || [null, null], done = s[1] > 0, id = L.id, hold = isHold(id), bw = isBw(id);
  const kgPh = G.kg != null ? kg(wk[id] ?? G.kg) : 'kg', repPh = G.reps[i] ?? L.hi;
  return `<div class="set ${done ? 'done' : ''}" data-flash="${id}:${i}">
    <span class="n">${i + 1}</span>
    <label class="cell"><input type="number" inputmode="decimal" step="0.5" ${bw && !s[0] ? 'placeholder="BW"' : `placeholder="${kgPh}"`} value="${s[0] ?? ''}" data-lift="${esc(id)}" data-set="${i}" data-f="0" aria-label="Set ${i + 1} kg"><i>kg</i></label>
    <label class="cell"><input type="number" inputmode="numeric" placeholder="${repPh}" value="${s[1] ?? ''}" data-lift="${esc(id)}" data-set="${i}" data-f="1" aria-label="Set ${i + 1} ${hold ? 'seconds' : 'reps'}"><i>${hold ? 's' : 'reps'}</i></label>
    <button class="tick" data-act="settick" data-id="${esc(id)}" data-i="${i}" aria-label="${done ? 'Undo' : 'Done'} set ${i + 1}" aria-pressed="${done}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg></button>
    ${pr ? '<span class="prb">New best</span>' : ''}</div>`;
}
function exCard(L, i, plan, lite) {
  const id = L.id, e = EXD[id] || {}, open = openEx === id, cur = S.lifts[day]?.ex[id] || [], G = progression(L, day, lite);
  const n = Math.max(L.sets + (extra[day + id] || 0), cur.length), done = Math.min(n, setsDone(day, id)), complete = done >= L.sets;
  const best = bestBefore(id, day), hold = isHold(id);
  const what = G.kg ? `${kg(G.kg)} kg` : isBw(id) ? 'bodyweight' : 'pick a load';
  const dots = Array.from({ length: n }, (_, j) => `<i class="${(cur[j]?.[1] > 0) ? 'on' : ''}"></i>`).join('');
  const head = `<button class="exhead" data-act="exopen" data-id="${esc(id)}" aria-expanded="${open}">${thumb(id)}
      <span class="grow"><span class="nm">${esc(exName(id))}</span><span class="sub">${L.sets} × ${L.lo}–${L.hi}${hold ? ' s' : ''} · ${what}${G.kind === 'raise' ? ' <b class="up">↑</b>' : G.kind === 'deload' ? ' <b class="down">↓</b>' : ''}</span></span>
      <span class="dots ${complete ? 'all' : ''}">${complete ? '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7"/></svg>' : dots}</span></button>`;
  if (!open) return `<section class="ex card ${complete ? 'complete' : ''}" id="ex-${esc(id)}">${head}</section>`;
  let rows = '';
  for (let s = 0; s < n; s++) rows += setRow(L, s, cur, G, cur[s]?.[1] > 0 && best && e1rm([cur[s]]) > best * 1.001);
  const P = G.kg && isBarbell(id) ? plates(wk[id] ?? G.kg) : null;
  const plateLine = P ? `<p class="plates">${P.bar} kg bar + each side ${P.side.length ? Object.entries(P.side.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {})).sort((a, b) => b[0] - a[0]).map(([p, c]) => `${c} × ${kg(+p)}`).join(', ') : 'nothing'}${P.short > 0.01 ? ` <i>(${kg(P.short)} kg short)</i>` : ''}</p>` : '';
  const stepper = G.kg != null && !isBw(id) ? `<div class="wstep"><button class="step" data-act="wk" data-id="${esc(id)}" data-d="-1" data-repeat="wk-${esc(id)}" aria-label="Lighter">−</button>
      <span class="grow"><b class="num" id="wk-${esc(id)}">${kg(wk[id] ?? G.kg)}</b> kg <span class="sub">working weight</span></span>
      <button class="step" data-act="wk" data-id="${esc(id)}" data-d="1" data-repeat="wk+${esc(id)}" aria-label="Heavier">+</button></div>` : '';
  const sxOn = S.profile.shoulder && shoulderLoads(id) && done > 0, sx = S.lifts[day]?.sx?.[id];
  const sxBlock = sxOn ? `<div class="sx"><span class="sub">How did the shoulder feel?</span><div class="seg">${Object.entries(SX).map(([k, [label]]) =>
    `<button class="${sx === k ? 'on ' + k : ''}" data-act="sx" data-id="${esc(id)}" data-v="${k}">${label}</button>`).join('')}</div>${sx ? `<p class="sub">${SX[sx][1]} ${why('shoulder', 'Why')}</p>` : ''}</div>` : '';
  const cue = SHOULDER_CUE[id] && S.profile.shoulder ? SHOULDER_CUE[id] : e.error ? `Avoid: ${e.error.replace(/^./, c => c.toLowerCase())}` : '';
  return `<section class="ex card open ${complete ? 'complete' : ''}" id="ex-${esc(id)}">${head}
    <div class="exbody">
      ${e.media ? `<figure class="demo"><img src="media/${id}.gif" alt="${esc(e.n)} demonstration" decoding="async"></figure>` : ''}
      ${L.from ? `<p class="swapnote">Instead of ${esc(exName(L.from))}. ${esc(L.why)}${L.why === 'Swapped for today.' ? ` <button class="link" data-act="unswap" data-id="${esc(L.base)}">Undo swap</button>` : ''}</p>` : ''}
      ${L.note ? `<p class="sub">${esc(L.note)}</p>` : ''}
      <p class="next k-${G.kind}"><b>${G.kind === 'first' ? 'First time' : G.kind === 'raise' ? 'Add weight' : G.kind === 'deload' ? 'Step back' : G.kind === 'hold' ? 'Hold the load' : G.kind === 'lite' ? 'Easy day' : 'Add reps'}</b> ${esc(G.why)} ${why('progress', 'How')}</p>
      ${stepper}${plateLine}
      <div class="sets"><span></span><span class="sub">kg</span><span class="sub">${hold ? 'seconds' : 'reps'}</span><span></span>${rows}</div>
      <div class="rowb tight"><button class="mini" data-act="addset" data-id="${esc(id)}">+ Set</button>
        <button class="mini" data-act="swap" data-id="${esc(id)}">Swap</button><button class="mini" data-act="exinfo" data-id="${esc(id)}">How to</button>
        <span class="grow"></span><span class="sub">Rest ${clock(restFor(id))}</span></div>
      ${cue ? `<p class="cue">${esc(cue)}</p>` : ''}${sxBlock}
    </div></section>`;
}
function vTrain() {
  const P = prog(), d = trainLetter(), plan = sessionPlan(day, d), lite = isLite(), lifts = plan.lifts.map(L => liftPlan(L, lite));
  const A = activityWeek(day), St = sessionStats(day, { lifts }), R = readiness(), isToday = day === todayKey();
  if (openEx && !lifts.some(L => L.id === openEx)) openEx = null;
  if (openEx === null) openEx = (lifts.find(L => setsDone(day, L.id) < L.sets) || lifts[0])?.id || '';
  const next = nextDay(), mins = Math.round(lifts.reduce((a, L) => a + L.sets * (restFor(L.id) + 40), 0) / 60);
  const upper = lifts.filter(L => shoulderLoads(L.id)).length >= 2;
  const liteBar = isToday && R.level === 'easy' ? `<div class="callout lite"><b>Recovery says keep today easy</b><span class="sub">${esc(R.why[0]?.[1] || '')}. ${lite ? 'Lighter session: one set fewer and no load increases.' : 'Full session as planned.'}</span>
      <div class="rowb"><button class="${lite ? 'ghost' : 'solid'}" data-act="lite">${lite ? 'Train as planned instead' : 'Use the lighter session'}</button></div></div>`
    : isToday && R.level === 'care' ? `<a class="strip lv-care" href="#recovery"><span class="dot"></span><span class="grow"><b>One recovery signal is off</b><span class="sub">Train as planned and skip anything extra.</span></span><span class="chev">›</span></a>` : '';
  const done = St.complete ? `<section class="finish"><svg viewBox="0 0 48 48" class="stamp"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>
      <div><b>${esc(plan.name)} done</b><span class="sub">${plural(St.done, 'set')} · ${fmt(St.load)} kg lifted${St.prs ? ` · ${plural(St.prs, 'new best', 'new bests')}` : ''}${S.lifts[day]?.t0 && S.lifts[day]?.t1 ? ` · ${dur((S.lifts[day].t1 - S.lifts[day].t0) / 6e4)}` : ''}</span></div></section>` : '';
  const retired = plan.retired.length ? `<p class="flag">Out of the plan after pain twice: ${plan.retired.map(id => `${esc(exName(id))} <button class="link" data-act="clear" data-id="${esc(id)}">Bring back</button>`).join(', ')}</p>` : '';
  const cardio = range(7, day).flatMap(k => sessions(k).map(s => ({ ...s, k }))).reverse();
  const sess = cardio.length ? `<ul class="list">${cardio.map(s => `<li><button class="rowbtn" data-act="cardioinfo" data-k="${s.k}" data-t="${s.t || ''}" data-src="${s.src}" data-i="${s.i ?? ''}"><span class="grow"><span class="nm">${esc(s.kind)} ${src(s.src === 'strap' ? 'strap' : s.src === 'manual' ? 'typed' : s.corrected ? 'adj' : 'watch')}</span>
      <span class="sub">${dateLabel(s.k, { weekday: 'short', day: 'numeric', month: 'short' })}${s.t ? ` · ${hm(new Date(s.t).getHours() * 60 + new Date(s.t).getMinutes())}` : ''} · ${dur(s.dur / 60)}${s.avg ? ` · avg ${Math.round(s.avg)}, max ${Math.round(s.max)} bpm` : ''}${s.noHr ? ' · no heart rate, counted as moderate' : ''}</span></span>
      <b class="num side">${Math.round((s.z[1] + 2 * (s.z[2] + s.z[3])) / 60)}<i>min</i></b></button></li>`).join('')}</ul>` : para('No cardio in the last 7 days. Workouts the watch records arrive here by themselves.');
  return `${masthead('Train', `${esc(P.short)} · ${S.profile.equip === 'home' ? 'Dumbbells at home' : 'Gym'}`, { after: `<a class="mini icon" href="#set-train" aria-label="Training settings">${ICON.gear}</a>` })}
    ${weekStrip(day >= shift(todayKey(), -6) ? todayKey() : shift(day, 3))}
    ${liteBar}
    <div class="chips">${Object.entries(P.days).map(([x, D]) => `<button class="${x === d ? 'on' : ''}" data-act="tday" data-d="${x}">${esc(D.n)}${x === next && !S.lifts[day] ? '<i class="nextdot" aria-label="next"></i>' : ''}</button>`).join('')}</div>
    <section class="session"><div class="mh"><h2>${esc(plan.name)}<span class="sub">${esc(plan.focus)} · ${plural(lifts.length, 'exercise')} · about ${mins} min</span></h2><b class="num big">${St.done}<i>/${St.total} sets</i></b></div>${meter(St.done, St.total || 1, St.complete ? 'ok' : '')}</section>
    ${retired}
    ${S.profile.shoulder && upper ? `<details class="prehab"><summary>Shoulder warm-up · 5 min ${S.prehab[day] ? '<span class="src s-ok">done</span>' : ''}</summary><ol>${PREHAB.map(([n, dose, w]) => `<li><b>${n}</b>, ${dose}<span class="sub">${w}</span></li>`).join('')}</ol>
      <label class="check"><input type="checkbox" data-act="prehab" ${S.prehab[day] ? 'checked' : ''}><span>Done today</span></label></details>` : ''}
    <div class="exlist">${lifts.map((L, i) => exCard(L, i, plan, lite)).join('')}</div>
    ${done}
    ${S.lifts[day] ? `<p class="note"><button class="link" data-act="clearsession">Clear this day’s sets</button></p>` : ''}
    ${sec('This week', `<div class="pair">
        <div><span class="sub">Active minutes</span><b class="num">${Math.round(A.who)}<i> / 150</i></b>${meter(A.who, 150, A.who >= 150 ? 'ok' : '')}</div>
        <div><span class="sub">Strength days</span><b class="num">${A.strengthDays}<i> / ${P.per}</i></b>${meter(A.strengthDays, P.per, A.strengthDays >= P.per ? 'ok' : '')}</div></div>
        ${para(`WHO: 150–300 moderate minutes, vigorous counting double, and muscle-strengthening on 2 or more days.${A.vig >= 1 ? ` ${Math.round(A.vig)} vigorous minutes so far.` : ''}`)}`, { why: ['zones', 'How it counts'] })}
    ${sec('Muscles, last 7 days', muscleBlock(), { why: ['volume', 'How sets count'] })}
    ${sec('Cardio with the H9', strapBlock('workout') + strapMsg() + '<div class="rowb"><button class="ghost" data-act="cardioadd">Log cardio by hand</button></div>', { why: ['zones', 'Zones'] })}
    ${sec('Cardio, last 7 days', sess, { why: ['devices', 'Watch vs strap'] })}
    <p class="note">${why('lift', 'Why this plan')} · ${why('progress', 'When weight goes up')} · ${why('rest', 'Rest')} · ${why('e1rm', 'Best estimates')}</p>`;
}

// ---------- the muscle map ----------
let mapSel = null;
function muscleBlock() {
  const v = volume(day), g = groupVolume(day), sel = mapSel && MUS[mapSel] ? mapSel : null;
  const info = sel ? `<p class="mapinfo"><b>${MUS[sel][0]}</b> ${r1(v[sel])} sets · ${v[sel] >= 10 ? 'enough to build' : v[sel] >= 4 ? 'enough to keep' : v[sel] > 0 ? 'below the 4 that keep muscle in a deficit' : 'not trained this week'}<span class="sub">${MUS[sel][1]}. ${exFor(sel)}</span></p>` : '<p class="sub mapinfo">Tap a muscle for its sets. 4 a week keeps muscle in a deficit; about 10 builds it.</p>';
  return `<div class="bodymap">${bodySvg('anterior', v, sel)}${bodySvg('posterior', v, sel)}</div>
    ${legend([['m l1', 'under 4'], ['m l3', '4–10'], ['m l4', '10+']])}${info}
    <div class="vol">${GROUPS.map(x => `<span>${x}</span>${meter(g[x], 10, g[x] >= 10 ? 'ok' : g[x] >= 4 ? '' : 'low')}<b class="num">${r1(g[x])}</b>`).join('')}</div>`;
}
function exFor(m) {
  const ids = sessionPlan(day, trainLetter()).lifts.map(L => L.id).filter(id => EXD[id].hits[m]);
  return ids.length ? `In today’s session: ${ids.map(exName).join(', ')}.` : 'Not in today’s session.';
}

// ---------- sheets ----------
function vExInfo(id) {
  const e = EXD[id], h = liftLog(id, shift(todayKey(), 1), 6), best = (liftHistory()[id] || []).reduce((a, x) => Math.max(a, x.v), 0);
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(e.n)}" data-key="ex-${esc(id)}"><div class="grab"></div>
    <div class="eyebrow">${esc(e.eq)}${e.sh === 'caution' ? ' · <span class="flag">shoulder caution</span>' : ''}</div><h1>${esc(e.n)}</h1>
    ${e.media ? `<figure class="demo"><img src="media/${id}.gif" alt="" decoding="async"></figure>` : ''}
    <div class="exmus"><div class="bodymap small">${bodySvg('anterior', e.hits, null, true)}${bodySvg('posterior', e.hits, null, true)}</div>
      <p class="sub">${Object.entries(e.hits).sort((a, b) => b[1] - a[1]).map(([m, f]) => `${f === 1 ? '<b>' : ''}${MUS[m][0]}${f === 1 ? '</b>' : ''}`).join(' · ')}</p></div>
    <h3>Set up</h3><ul class="steps">${e.setup.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Do</h3><ul class="steps">${e.exec.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <h3>The usual mistake</h3><p>${esc(e.error)}</p><h3>Why it is here</h3><p>${esc(e.why)}</p>
    ${h.length ? `<h3>Your last sessions${best ? ` · best estimate ${Math.round(best)} kg` : ''}</h3>${table(h.map(x => trow(dateLabel(x.k, { weekday: 'short', day: 'numeric', month: 'short' }), x.sets.map(s => `${s[0] ? kg(s[0]) + '×' : ''}${s[1]}`).join('  '))))}` : ''}
    <button class="solid wide" data-act="popclose">Close</button></aside>`;
}
function vSwap(id) {
  const plan = sessionPlan(day, trainLetter()), L = plan.lifts.find(x => x.id === id), used = new Set(plan.lifts.map(x => x.id));
  const prim = primaryOf(id), alts = altPool(id, { busy: used, free: S.profile.equip === 'home' }).slice(0, 7);
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="Swap ${esc(exName(id))}" data-key="swap-${esc(id)}"><div class="grab"></div>
    <div class="eyebrow">For today only · trains ${MUS[prim]?.[0].toLowerCase() || 'the same muscle'}</div><h1>Swap ${esc(exName(id))}</h1>
    ${alts.length ? `<ul class="list picks">${alts.map(a => `<li><button class="rowbtn" data-act="swapto" data-id="${esc(L?.base || id)}" data-to="${a}">${thumb(a)}<span class="grow"><span class="nm">${esc(EXD[a].n)}</span>
      <span class="sub">${EXD[a].hits[prim] === 1 ? 'Direct substitute' : 'Partial: trains it on the way'} · ${esc(EXD[a].eq)}</span></span><span class="chev">›</span></button></li>`).join('')}</ul>`
      : para('Nothing else in the library trains this without clashing with today’s session.')}
    ${para('Tomorrow the programme is back as written. To change it for good, choose a different programme in Me › Training.')}
    <button class="ghost wide" data-act="popclose">Keep ${esc(exName(id))}</button></aside>`;
}
function vCardioAdd() {
  const c = pop.c ||= { kind: 'walk', min: 30, eff: 'mod' };
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="Log cardio" data-key="cardioadd"><div class="grab"></div>
    <div class="eyebrow">${dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}</div><h1>Log cardio</h1>
    <div class="chips wrap">${KINDS.map(([k, l]) => `<button class="${c.kind === k ? 'on' : ''}" data-act="ckind" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="wstep big"><button class="step" data-act="cmin" data-d="-5" data-repeat="cmin-">−</button><span class="grow"><b class="num" id="cmin">${c.min}</b> min</span><button class="step" data-act="cmin" data-d="5" data-repeat="cmin+">+</button></div>
    <div class="seg">${[['mod', 'Moderate · can talk'], ['vig', 'Vigorous · few words']].map(([k, l]) => `<button class="${c.eff === k ? 'on' : ''}" data-act="ceff" data-v="${k}">${l}</button>`).join('')}</div>
    ${para('Without a strap or watch the app cannot see your heart rate, so effort decides how it counts: vigorous minutes count double toward the WHO 150.')}
    <button class="solid wide" data-act="csave">Save</button></aside>`;
}
function vCardioInfo(p) {
  const s = sessions(p.k).find(x => String(x.t || '') === p.t && x.src === p.src);
  if (!s) return '';
  const del = s.src !== 'watch';
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(s.kind)}" data-key="cardio-${p.k}-${p.t}"><div class="grab"></div>
    <div class="eyebrow">${dateLabel(p.k, { weekday: 'long', day: 'numeric', month: 'long' })}${s.t ? ` · ${hm(new Date(s.t).getHours() * 60 + new Date(s.t).getMinutes())}` : ''}</div><h1>${esc(s.kind)}</h1>
    ${stats([[dur(s.dur / 60), 'duration'], [s.avg ? Math.round(s.avg) : DASH, 'avg bpm'], [Math.round((s.z[1] + 2 * (s.z[2] + s.z[3])) / 60), 'WHO minutes']])}
    ${s.src === 'watch' ? para(`Recorded by ${esc(s.app || 'the watch')}. Delete it there; the next sync removes it here too.`) : s.src === 'manual' ? para(`Typed in, ${s.eff === 'vig' ? 'vigorous' : 'moderate'}.`) : para(ZONES.map((z, i) => `${z} ${clock(s.z[i])}`).join(' · '))}
    <div class="rowb">${del ? `<button class="danger" data-hold="cardiodel" data-k="${p.k}" data-i="${s.i}">Hold to delete</button>` : ''}<button class="ghost" data-act="popclose">Close</button></div></aside>`;
}

// ---------- actions ----------
// Saved without re-rendering, so the keyboard stays in the next field.
function logLift(el) {
  const id = el.dataset.lift, si = +el.dataset.set, f = +el.dataset.f;
  const v = num(el.value, 0, f ? 600 : 500);
  if (el.value !== '' && v == null) { el.value = ''; buzz('warn'); toast('That value is out of range'); }
  writeSet(id, si, f, v);
  el.closest('.set')?.classList.toggle('done', (S.lifts[day]?.ex[id]?.[si]?.[1] || 0) > 0);
  save();
}
function writeSet(id, si, f, v) {
  const entry = S.lifts[day] ||= { prog: S.settings.prog, day: trainLetter(), ex: {}, t0: Date.now() };
  entry.prog = S.settings.prog; entry.day = trainLetter();
  const sets = entry.ex[id] ||= [];
  while (sets.length <= si) sets.push([null, null]);
  sets[si][f] = v;
  // An emptied exercise, or an emptied session, is removed rather than counted.
  if (sets.every(s => s[0] == null && s[1] == null)) delete entry.ex[id];
  if (!Object.keys(entry.ex).length) delete S.lifts[day];
}
function trainAct(a, el) {
  const id = el.dataset.id, plan = () => sessionPlan(day, trainLetter()), L = () => liftPlan(plan().lifts.find(x => x.id === id), isLite());
  if (a === 'exopen') { openEx = openEx === id ? '' : id; buzz('tick'); render(); if (openEx) scrollToEx(id); return true; }
  if (a === 'settick') {
    const i = +el.dataset.i, P = L(), cur = S.lifts[day]?.ex[id]?.[i];
    if (cur && cur[1] > 0) { writeSet(id, i, 1, null); save(); buzz('tick'); render(); return true; }
    const G = progression(P, day, isLite()), row = el.closest('.set'), ins = row ? row.querySelectorAll('input') : [];
    const kgv = num(ins[0]?.value, 0, 500) ?? (isBw(id) ? null : wk[id] ?? G.kg), reps = num(ins[1]?.value, 1, 600) ?? G.reps[i] ?? P.hi;
    if (kgv == null && !isBw(id)) { buzz('warn'); toast('Enter the weight for this set first'); ins[0]?.focus(); return true; }
    writeSet(id, i, 0, kgv); writeSet(id, i, 1, reps);
    const before = bestBefore(id, day), isPr = before && kgv && e1rm([[kgv, reps]]) > before * 1.001;
    const nDone = setsDone(day, id), all = nDone >= P.sets, St = sessionStats(day, { lifts: plan().lifts.map(x => liftPlan(x, isLite())) });
    if (St.complete) S.lifts[day].t1 = Date.now();
    save(); flash(`${id}:${i}`);
    if (St.complete) { buzz('done'); restStop(); toast('Session complete'); }
    else { buzz('ok'); restStart(restFor(id), id); if (isPr) toast('New best estimate for this lift'); }
    if (all && !St.complete) {
      const nxt = plan().lifts.find(x => setsDone(day, x.id) < liftPlan(x, isLite()).sets);
      if (nxt) { openEx = nxt.id; render(); setTimeout(() => scrollToEx(nxt.id), 60); return true; }
    }
    render(); return true;
  }
  if (a === 'wk') {
    const G = progression(L(), day, isLite()), step = stepFor(id), v = Math.max(0, roundTo((wk[id] ?? G.kg ?? 0) + step * +el.dataset.d, step));
    wk[id] = v; buzz('tick');
    const b = document.getElementById('wk-' + id); if (b) b.textContent = kg(v);
    $$(`#ex-${CSS.escape(id)} .set:not(.done) input[data-f="0"]`).forEach(x => { x.placeholder = kg(v); });
    const pl = $(`#ex-${CSS.escape(id)} .plates`); if (pl && isBarbell(id)) render();
    return true;
  }
  if (a === 'addset') {
    const P = L(), n = Math.max(P.sets + (extra[day + id] || 0), (S.lifts[day]?.ex[id] || []).length);
    if (n >= 12) { buzz('warn'); return true; }
    extra[day + id] = n + 1 - P.sets; buzz('tick'); render(); return true;
  }
  if (a === 'swap') { openPop({ kind: 'swap', id }); return true; }
  if (a === 'swapto') { (S.swaps[day] ||= {})[id] = el.dataset.to; openEx = el.dataset.to; save(); buzz('ok'); closePop(); toast(`Swapped to ${EXD[el.dataset.to].n} for today`); return true; }
  if (a === 'unswap') { if (S.swaps[day]) { delete S.swaps[day][id]; if (!Object.keys(S.swaps[day]).length) delete S.swaps[day]; } openEx = id; save(); buzz('tick'); render(); return true; }
  if (a === 'exinfo') { openPop({ kind: 'exinfo', id }); return true; }
  if (a === 'sx') {
    const e = S.lifts[day]; if (!e) return true;
    e.sx ||= {};
    if (e.sx[id] === el.dataset.v) delete e.sx[id]; else e.sx[id] = el.dataset.v;
    save(); buzz(el.dataset.v === 'pain' ? 'warn' : 'tick'); render(); return true;
  }
  if (a === 'clear') { S.cleared[id] = todayKey(); save(); buzz('ok'); toast(`${exName(id)} is back in the plan`); render(); return true; }
  if (a === 'lite') { liteOff[day] = isLite(); buzz('tick'); render(); return true; }
  if (a === 'clearsession') {
    const was = S.lifts[day], k = day;
    if (!was) return true;
    delete S.lifts[k]; save(); render();
    undoable('Cleared this day’s sets', () => { S.lifts[k] = was; });
    return true;
  }
  if (a === 'cardioadd') { openPop({ kind: 'cardioadd' }); return true; }
  if (a === 'ckind') { pop.c.kind = el.dataset.v; buzz('tick'); render(); return true; }
  if (a === 'ceff') { pop.c.eff = el.dataset.v; buzz('tick'); render(); return true; }
  if (a === 'cmin') { pop.c.min = clamp(pop.c.min + +el.dataset.d, 5, 300); buzz('tick'); const b = $('#cmin'); if (b) b.textContent = pop.c.min; return true; }
  if (a === 'csave') {
    const c = pop.c, end = day === todayKey() ? Date.now() : Date.parse(day + 'T18:00');
    (S.cardio[day] ||= []).push(cleanCardio({ t: end - c.min * 6e4, kind: c.kind, dur: c.min * 60, m: 1, eff: c.eff }));
    S.cardio[day] = S.cardio[day].slice(-10); save(); buzz('ok'); closePop(); toast(`${c.min} min logged`); return true;
  }
  if (a === 'cardioinfo') { openPop({ kind: 'cardioinfo', k: el.dataset.k, t: el.dataset.t, src: el.dataset.src }); return true; }
  return false;
}
ACT_HOLD.cardiodel = el => {
  const k = el.dataset.k, i = +el.dataset.i, list = S.cardio[k], was = list?.[i];
  if (!was) return;
  list.splice(i, 1); if (!list.length) delete S.cardio[k];
  save(); closePop();
  undoable('Cardio session deleted', () => { (S.cardio[k] ||= []).splice(i, 0, was); });
};
function scrollToEx(id) {
  const el = document.getElementById('ex-' + id);
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 70 || r.top > innerHeight * 0.45) scrollTo({ top: scrollY + r.top - 76, behavior: motionOK() ? 'smooth' : 'auto' });
}

// ---------- rest timer ----------
// Kept as an end time, so a phone that sleeps or a page that is paused still shows the right number.
const REST = { end: 0, total: 0, id: '', t: null };
function restStart(sec, id) {
  Object.assign(REST, { end: Date.now() + sec * 1000, total: sec, id });
  nat('restAlarm', sec * 1000);
  clearInterval(REST.t); REST.t = setInterval(restTick, 250);
  restTick();
}
function restStop() { clearInterval(REST.t); REST.t = null; REST.end = 0; nat('restCancel'); const r = $('#rest'); if (r) r.classList.remove('show'); }
function restAdd(s) { if (!REST.end) return; REST.end += s * 1000; REST.total += s; nat('restAlarm', REST.end - Date.now()); buzz('tick'); restTick(); }
function restTick() {
  const r = $('#rest');
  if (!r || !REST.end) return;
  const left = (REST.end - Date.now()) / 1000;
  if (left <= 0) { restStop(); buzz('done'); toast('Rest over · next set'); return; }
  r.classList.add('show');
  r.querySelector('b').textContent = clock(Math.ceil(left));
  r.querySelector('circle.fg').setAttribute('stroke-dasharray', `${(left / REST.total * 100).toFixed(2)} 100`);
  r.querySelector('.what').textContent = exName(REST.id);
}
