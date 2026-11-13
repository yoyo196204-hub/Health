'use strict';
// Training: you lift in openGym; this is where Health plans it and reads it back. What is next and how hard to go
// today, the shoulder check after an openGym session, what you lifted and what it did to strength and to each muscle,
// and cardio with the strap: zones, the live trace and the aerobic threshold from your own beats.

let mapSel = null;          // the muscle tapped on the map

// ---------- next in openGym ----------
// The guidance openGym cannot know: recovery decides how hard today's session should be.
const EASE = {
  go: ['Train as planned', 'Recovery is normal. openGym’s loads are Health’s progression; go by them.'],
  care: ['Train as planned, nothing extra', 'One recovery signal is off. Do the session as written and skip added sets.'],
  easy: ['Keep it easy if you train', 'In openGym: leave out the last set of each exercise and keep last time’s weights, or walk instead. In the HRV-guided trials, easy days on a low week were what made the difference.'],
  unknown: ['Train as planned', 'Recovery has too little data to adjust anything yet.'],
};
function nextCard() {
  const P = prog(), k = todayKey(), L = S.lifts[k], did = nextDay(shift(k, 1)), plan = sessionPlan(shift(k, 1), did), R = readiness();
  const [head, sub] = EASE[R.level], today = L && L.prog === S.settings.prog ? P.days[L.day] : null;
  const rows = plan.lifts.map(x => {
    const G = progression(x, shift(k, 1)), what = isHold(x.id) ? `${x.sets} × ${G.reps[0] || x.lo} s` : `${x.sets} × ${x.lo}–${x.hi}${G.kg ? ` · ${kg(G.kg)} kg` : ''}`;
    return `<li><span class="grow"><span class="nm">${esc(exName(x.id))}</span><span class="sub">${what}${G.kind === 'raise' ? ' · <b class="up">load up</b>' : G.kind === 'deload' ? ' · <b class="down">step back</b>' : ''}</span></span></li>`;
  }).join('');
  return `<section class="nextog card lv-${R.level}">
    <div class="eyebrow">${today ? `Today: ${esc(today.n)} done · next` : 'Next session'} in openGym</div>
    <h2>${esc(plan.name)} <span class="sub">${esc(plan.focus)}</span></h2>
    <div class="ease"><span class="dot"></span><span class="grow"><b>${head}</b><span class="sub">${sub}${R.why[0] ? ` <a href="#recovery">${esc(R.why[0][1])}</a>.` : ''}</span></span></div>
    <ul class="list">${rows}</ul>
    ${S.profile.shoulder && plan.lifts.filter(x => shoulderLoads(x.id)).length >= 2 ? `<details class="inner prehab"><summary>Shoulder warm-up before it · 5 min${S.prehab[k] ? ' · done today' : ''}</summary><ol>${PREHAB.map(([n, dose, w]) => `<li><b>${n}</b>, ${dose}<span class="sub">${w}</span></li>`).join('')}</ol>
      <label class="check"><input type="checkbox" data-act="prehab" ${S.prehab[k] ? 'checked' : ''}><span>Done today</span></label></details>` : ''}
    ${plan.retired.length ? `<p class="flag">Out of the plan after pain twice: ${plan.retired.map(id => `${esc(exName(id))} <button class="link" data-act="clear" data-id="${esc(id)}">Bring back</button>`).join(', ')}</p>` : ''}
    <div class="rowb">${NATIVE && OGF.app ? '<button class="solid" data-act="ogopen">Open openGym</button>' : ''}<a class="ghost link" href="#set-train">The plan</a></div></section>`;
}
function staleStrip() {
  if (!ogPlanStale() && S.meta.ogplan) return '';
  const never = !S.meta.ogplan;
  return `<a class="strip lv-care" href="#set-train"><span class="dot"></span><span class="grow"><b>${never ? 'Put your plan in openGym' : 'Your plan changed: send it to openGym again'}</b>
    <span class="sub">${never ? 'One file with your programme, the next loads, backups for every exercise and the training block.' : 'An exercise was swapped or left out, or the programme changed.'}</span></span><span class="chev">›</span></a>`;
}

// ---------- the shoulder check ----------
// openGym does not ask how the shoulder felt, so Health asks once the session arrives. A niggle holds the load next time,
// pain swaps the exercise, pain twice takes it out of the plan: the plan file then changes and says so.
function shoulderDue() {
  if (!S.profile.shoulder) return null;
  for (const k of range(4).reverse()) {
    const L = S.lifts[k];
    if (!L) continue;
    const ids = Object.keys(L.ex).filter(id => shoulderLoads(id) && L.ex[id].some(s => s[1] > 0));
    if (ids.length && ids.some(id => !L.sx?.[id])) return { k, ids };
  }
  return null;
}
function shoulderCard() {
  const D = shoulderDue();
  if (!D) return '';
  const L = S.lifts[D.k];
  return `<section class="card sxcard"><div class="eyebrow">${dateLabel(D.k, { weekday: 'long', day: 'numeric', month: 'short' })}${L.src === 'og' ? ' · from openGym' : ''}</div>
    <h2>How did the shoulder feel?</h2>
    ${D.ids.map(id => `<div class="sx"><span class="nm">${esc(exName(id))}</span><div class="seg tight">${Object.entries(SX).map(([v, [label]]) =>
      `<button class="${L.sx?.[id] === v ? 'on ' + v : ''}" data-act="sxk" data-k="${D.k}" data-id="${esc(id)}" data-v="${v}">${label}</button>`).join('')}</div></div>`).join('')}
    <p class="sub">${why('shoulder', 'What each answer does')}</p></section>`;
}

// ---------- what you lifted ----------
function liftDays(n = 21) { return Object.keys(S.lifts).filter(k => gapDays(k, todayKey()) < n).sort().reverse(); }
function dayName(k) {
  const L = S.lifts[k], D = PROGRAMS[L.prog]?.days[L.day], h = L.src === 'og' ? liftHr(k) : null;
  return h?.og && h.kind && h.kind !== 'openGym workout' ? h.kind : D ? D.n : 'Session';
}
function dayStats(k) {
  const L = S.lifts[k];
  let sets = 0, load = 0, prs = 0;
  for (const [id, ss] of Object.entries(L.ex)) {
    for (const s of ss) if (s[1] > 0) { sets++; load += (s[0] || 0) * s[1]; }
    const b = bestBefore(id, k);
    if (b && e1rm(ss) > b * 1.001) prs++;
  }
  const h = liftHr(k), mins = L.t0 && L.t1 ? (L.t1 - L.t0) / 6e4 : h ? h.dur / 60 : null;
  return { sets, load, prs, mins, h };
}
function weekStrip() {
  return `<div class="week">${range(7).map(k => {
    const L = S.lifts[k], ss = sessions(k).filter(s => !s.strength), mark = L ? L.day : ss.length ? '♥' : '';
    return `<button class="wd ${mark ? 'did' : ''} ${k === todayKey() ? 'now' : ''}" ${L ? `data-act="sessinfo" data-k="${k}"` : 'disabled'}><span>${weekday(k)}</span><b>${esc(mark) || '·'}</b></button>`;
  }).join('')}</div>`;
}
function sessionList() {
  const ks = liftDays(21);
  // openGym sessions Health Connect already has, whose sets have not arrived yet (openGym's backup comes later).
  const pending = range(7).filter(k => !S.lifts[k]).flatMap(k => sessions(k).filter(s => s.og).map(s => ({ k, s })));
  if (!ks.length && !pending.length) return para(S.meta.og || OGF.folder ? 'No lifting in the last three weeks.' : 'Sessions you log in openGym appear here with every set. Link openGym in Me › Data sources.');
  return `<ul class="list">${pending.map(({ k, s }) => `<li><span class="grow"><span class="nm">${esc(s.kind)} ${src('watch')}</span><span class="sub">${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })} · ${dur(s.dur / 60)}${s.avg ? ` · avg ${Math.round(s.avg)} bpm` : ''} · sets arrive with openGym’s next backup</span></span></li>`).join('')}
    ${ks.map(k => { const St = dayStats(k), L = S.lifts[k];
      return `<li><button class="rowbtn" data-act="sessinfo" data-k="${k}"><span class="grow"><span class="nm">${esc(dayName(k))} ${L.src === 'og' ? '<span class="src s-og">openGym</span>' : ''}</span>
        <span class="sub">${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })} · ${plural(St.sets, 'set')} · ${fmt(St.load)} kg${St.mins ? ` · ${dur(St.mins)}` : ''}${St.h?.avg ? ` · ${Math.round(St.h.avg)} bpm avg` : ''}${St.prs ? ` · <b class="up">${plural(St.prs, 'best')}</b>` : ''}</span></span><span class="chev">›</span></button></li>`; }).join('')}</ul>`;
}
function vSession(p) {
  const k = p.k, L = S.lifts[k];
  if (!L) return '';
  const St = dayStats(k), h = St.h;
  const rows = Object.entries(L.ex).map(([id, ss]) => {
    const b = bestBefore(id, k), now = e1rm(ss), best = b && now > b * 1.001;
    return `<li><span class="grow"><span class="nm">${esc(exName(id))}${best ? ' <b class="up">★ best</b>' : ''}${L.sx?.[id] ? ` <span class="src s-${L.sx[id] === 'ok' ? 'ok' : 'adj'}">${SX[L.sx[id]][0]}</span>` : ''}</span>
      <span class="sub num">${ss.filter(s => s[1] > 0).map(s => `${s[0] ? kg(s[0]) + '×' : ''}${s[1]}${isHold(id) ? 's' : ''}`).join('  ')}${now ? ` · est. 1RM ${Math.round(now)} kg` : ''}</span></span></li>`;
  }).join('');
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(dayName(k))}" data-key="sess-${k}"><div class="grab"></div>
    <div class="eyebrow">${dateLabel(k, { weekday: 'long', day: 'numeric', month: 'long' })}${L.src === 'og' ? ' · logged in openGym' : ''}</div><h1>${esc(dayName(k))}</h1>
    ${stats([[St.sets, 'sets'], [fmt(St.load), 'kg lifted'], [St.mins ? dur(St.mins) : DASH, 'duration']])}
    ${h?.avg ? para(`Heart rate from ${esc(h.app || 'the watch')}: average ${Math.round(h.avg)}, max ${Math.round(h.max)} bpm${h.corrected ? ', corrected to the strap' : ''}. Wrist readings drift during lifting, so this is a rough guide. ${why('devices', 'Why')}`) : ''}
    <ul class="list">${rows}</ul>
    ${L.src === 'og' ? para('Edits made in openGym come through on the next read; change it there.') : ''}
    <div class="rowb">${L.src === 'og' ? '' : `<button class="danger" data-hold="sessdel" data-k="${k}">Hold to delete</button>`}<button class="ghost" data-act="popclose">Close</button></div></aside>`;
}

// ---------- strength ----------
function strengthBlock() {
  const H = liftHistory(), from = shift(todayKey(), -84);
  const lifts = Object.entries(H).map(([id, a]) => [id, a.filter(x => x.k >= from)]).filter(([, a]) => a.length >= 3)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const St = strength();
  if (!lifts.length) return para('Each lift needs three sessions in the last 12 weeks before its trend shows.');
  const spark = a => {
    const v = a.map(x => x.v), lo = Math.min(...v), hi = Math.max(...v), W = 80, Hh = 24;
    return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" aria-hidden="true"><path d="${v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * W).toFixed(1)},${(Hh - 3 - (y - lo) / (hi - lo || 1) * (Hh - 6)).toFixed(1)}`).join('')}"/></svg>`;
  };
  return `${St ? para(`Across ${plural(St.n, 'lift')}, the best estimates of the last two sessions are <b>${sign(St.pct, 0)}%</b> against the first two in 12 weeks.${S.settings.pace !== 'maintain' ? ' Holding strength while the weight falls is the sign the loss is fat.' : ''}`) : ''}
    <ul class="list">${lifts.map(([id, a]) => { const ch = (mean(a.slice(-2).map(x => x.v)) / mean(a.slice(0, 2).map(x => x.v)) - 1) * 100;
      return `<li><span class="grow"><span class="nm">${esc(exName(id))}</span><span class="sub">${plural(a.length, 'session')} · now ${Math.round(a[a.length - 1].v)} kg est. 1RM</span></span>${spark(a)}<b class="num side ${ch >= 0 ? 'up' : 'down'}">${sign(ch, 0)}<i>%</i></b></li>`; }).join('')}</ul>`;
}

// ---------- the muscle map ----------
function muscleBlock() {
  const v = volume(), g = groupVolume(), sel = mapSel && MUS[mapSel] ? mapSel : null;
  const info = sel ? `<p class="mapinfo"><b>${MUS[sel][0]}</b> ${r1(v[sel])} sets · ${v[sel] >= 10 ? 'enough to build' : v[sel] >= 4 ? 'enough to keep' : v[sel] > 0 ? 'below the 4 that keep muscle in a deficit' : 'not trained this week'}<span class="sub">${MUS[sel][1]}. ${exFor(sel)}</span></p>` : '<p class="sub mapinfo">Tap a muscle for its sets. 4 a week keeps muscle in a deficit; about 10 builds it.</p>';
  return `<div class="bodymap">${bodySvg('anterior', v, sel)}${bodySvg('posterior', v, sel)}</div>
    ${legend([['m l1', 'under 4'], ['m l3', '4–10'], ['m l4', '10+']])}${info}
    <div class="vol">${GROUPS.map(x => `<span>${x}</span>${meter(g[x], 10, g[x] >= 10 ? 'ok' : g[x] >= 4 ? '' : 'low')}<b class="num">${r1(g[x])}</b>`).join('')}</div>`;
}
function exFor(m) {
  const ids = sessionPlan(shift(todayKey(), 1), nextDay(shift(todayKey(), 1))).lifts.map(L => L.id).filter(id => hitsOf(id)[m]);
  return ids.length ? `In the next session: ${ids.map(exName).join(', ')}.` : 'Not in the next session.';
}

// ---------- cardio and the aerobic threshold ----------
function cardioList() {
  const list = range(14).flatMap(k => sessions(k).filter(s => !s.strength).map(s => ({ ...s, k }))).reverse();
  if (!list.length) return para('No cardio in the last 14 days. Workouts the watch records arrive here by themselves.');
  return `<ul class="list">${list.map(s => `<li><button class="rowbtn" data-act="cardioinfo" data-k="${s.k}" data-t="${s.t || ''}" data-src="${s.src}"><span class="grow"><span class="nm">${esc(s.kind)} ${src(s.src === 'strap' ? 'strap' : s.src === 'manual' ? 'typed' : s.corrected ? 'adj' : 'watch')}</span>
    <span class="sub">${dateLabel(s.k, { weekday: 'short', day: 'numeric', month: 'short' })}${s.t ? ` · ${hm(new Date(s.t).getHours() * 60 + new Date(s.t).getMinutes())}` : ''} · ${dur(s.dur / 60)}${s.avg ? ` · avg ${Math.round(s.avg)}, max ${Math.round(s.max)} bpm` : ''}${s.noHr ? ' · no heart rate, counted as moderate' : ''}</span></span>
    <b class="num side">${Math.round((s.z[1] + 2 * (s.z[2] + s.z[3])) / 60)}<i>min</i></b></button></li>`).join('')}</ul>`;
}
// Every strap session that crossed α1 0.75, newest first, and the median of the last three.
function thresholds() {
  const out = [];
  for (const k of Object.keys(S.cardio).sort().reverse()) for (const c of S.cardio[k]) if (c.vt1) out.push({ k, hr: c.vt1 });
  return out.slice(0, 12);
}
function thresholdBlock() {
  const T = thresholds(), H = hrProfile();
  if (!T.length) return para(`Wear the H9 for a cardio session that starts easy and builds steadily for 15–20 minutes. Every 30 seconds the app works out α1 from the last two minutes of your beats; where it crosses 0.75 is your aerobic threshold. ${why('dfa', 'How it works')}`);
  const m = Math.round(median(T.slice(0, 3).map(x => x.hr))), pct = Math.round((m - H.rest) / (H.max - H.rest) * 100);
  return `${stats([[m, 'bpm, aerobic threshold'], [`${pct}%`, 'of heart-rate reserve'], [T.length, plural(T.length, 'session').replace(/^\d+ /, '')]])}
    ${para(`Below about ${m} bpm is easy aerobic work you can do a lot of; above it, effort and fatigue climb faster. The WHO zones still count your minutes (moderate from ${H.zones[0]}, vigorous from ${H.zones[1]}). ${T.length < 3 ? 'One estimate can be off by several beats; three that agree are worth trusting.' : ''} ${why('dfa', 'How it works')}`)}
    ${T.length > 1 ? `<details class="inner hist"><summary>Every estimate · ${T.length}</summary><ul class="list">${T.map(x => `<li><span class="grow"><span class="nm">${dateLabel(x.k, { weekday: 'short', day: 'numeric', month: 'short' })}</span></span><b class="num side">${x.hr}<i>bpm</i></b></li>`).join('')}</ul></details>` : ''}`;
}

// ---------- the screen ----------
function vTraining() {
  const P = prog(), A = activityWeek();
  return `${masthead('Training', `${esc(P.short)} · ${S.profile.equip === 'home' ? 'dumbbells at home' : 'gym'}${S.profile.shoulder ? ' · shoulder care' : ''}`, { after: `<a class="mini icon" href="#set-train" aria-label="Plan settings">${ICON.gear}</a>` })}
    ${part(staleStrip)}${part(nextCard)}${part(shoulderCard)}
    ${sec('Last three weeks', weekStrip() + part(sessionList), { why: ['lift', 'Why this plan'] })}
    ${sec('This week', `<div class="pair">
        <div><span class="sub">Active minutes</span><b class="num">${Math.round(A.who)}<i> / 150</i></b>${meter(A.who, 150, A.who >= 150 ? 'ok' : '')}</div>
        <div><span class="sub">Strength days</span><b class="num">${A.strengthDays}<i> / ${P.per}</i></b>${meter(A.strengthDays, P.per, A.strengthDays >= P.per ? 'ok' : '')}</div></div>
        ${para(`WHO: 150–300 moderate minutes, vigorous counting double, and muscle-strengthening on 2 or more days.${A.vig >= 1 ? ` ${Math.round(A.vig)} vigorous minutes so far.` : ''}`)}`, { why: ['zones', 'How it counts'] })}
    ${sec('Muscles, last 7 days', muscleBlock(), { why: ['volume', 'How sets count'] })}
    ${sec('Strength, 12 weeks', part(strengthBlock), { why: ['e1rm', 'Best estimates'] })}
    ${sec('Cardio with the H9', strapBlock('workout') + strapMsg() + '<div class="rowb"><button class="ghost" data-act="cardioadd">Log cardio by hand</button></div>', { why: ['zones', 'Zones'] })}
    ${sec('Aerobic threshold', part(thresholdBlock), { why: ['dfa', 'From your beats'] })}
    ${sec('Cardio, last 14 days', part(cardioList), { why: ['devices', 'Watch vs strap'] })}`;
}

// ---------- sheets ----------
function vExInfo(id) {
  const e = EXD[id];
  if (!e) return '';
  const h = liftLog(id, shift(todayKey(), 1), 6), best = (liftHistory()[id] || []).reduce((a, x) => Math.max(a, x.v), 0);
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(e.n)}" data-key="ex-${esc(id)}"><div class="grab"></div>
    <div class="eyebrow">${esc(e.eq)}${e.sh === 'caution' ? ' · <span class="flag">shoulder caution</span>' : ''}</div><h1>${esc(e.n)}</h1>
    <div class="exmus"><div class="bodymap small">${bodySvg('anterior', e.hits, null, true)}${bodySvg('posterior', e.hits, null, true)}</div>
      <p class="sub">${Object.entries(e.hits).sort((a, b) => b[1] - a[1]).map(([m, f]) => `${f === 1 ? '<b>' : ''}${MUS[m][0]}${f === 1 ? '</b>' : ''}`).join(' · ')}</p></div>
    <h3>Why it is in the plan</h3><p>${esc(e.why)}</p><h3>The usual mistake</h3><p>${esc(e.error)}</p>
    ${SHOULDER_CUE[id] ? `<h3>Shoulder</h3><p>${esc(SHOULDER_CUE[id])}</p>` : ''}
    ${h.length ? `<h3>Your last sessions${best ? ` · best estimate ${Math.round(best)} kg` : ''}</h3>${table(h.map(x => trow(dateLabel(x.k, { weekday: 'short', day: 'numeric', month: 'short' }), x.sets.map(s => `${s[0] ? kg(s[0]) + '×' : ''}${s[1]}`).join('  '))))}` : ''}
    ${para('openGym has the animation and step-by-step instructions.')}
    <button class="solid wide" data-act="popclose">Close</button></aside>`;
}
function vCardioAdd() {
  const c = pop.c ||= { kind: 'walk', min: 30, eff: 'mod' };
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="Log cardio" data-key="cardioadd"><div class="grab"></div>
    <div class="eyebrow">${dateLabel(day, { weekday: 'long', day: 'numeric', month: 'short' })}</div><h1>Log cardio</h1>
    <div class="chips wrap">${KINDS.map(([k, l]) => `<button class="${c.kind === k ? 'on' : ''}" data-act="ckind" data-v="${k}">${l}</button>`).join('')}</div>
    <div class="wstep big"><button class="step" data-act="cmin" data-d="-5" data-repeat="cmin-" aria-label="5 minutes less">−</button><span class="grow"><b class="num" id="cmin">${c.min}</b> min</span><button class="step" data-act="cmin" data-d="5" data-repeat="cmin+" aria-label="5 minutes more">+</button></div>
    ${seg('ceff', [['mod', 'Moderate · can talk'], ['vig', 'Vigorous · few words']], c.eff)}
    ${para('Without a strap or watch the app cannot see your heart rate, so effort decides how it counts: vigorous minutes count double toward the WHO 150.')}
    <button class="solid wide" data-act="csave">Save</button></aside>`;
}
function vCardioInfo(p) {
  const s = sessions(p.k).find(x => String(x.t || '') === p.t && x.src === p.src);
  if (!s) return '';
  const c = s.src === 'strap' ? S.cardio[p.k]?.[s.i] : null, del = s.src !== 'watch';
  return `<div class="scrim" data-act="popclose"></div><aside class="sheet" role="dialog" aria-label="${esc(s.kind)}" data-key="cardio-${p.k}-${p.t}"><div class="grab"></div>
    <div class="eyebrow">${dateLabel(p.k, { weekday: 'long', day: 'numeric', month: 'long' })}${s.t ? ` · ${hm(new Date(s.t).getHours() * 60 + new Date(s.t).getMinutes())}` : ''}</div><h1>${esc(s.kind)}</h1>
    ${stats([[dur(s.dur / 60), 'duration'], [s.avg ? `${Math.round(s.avg)} / ${Math.round(s.max)}` : DASH, 'avg / max bpm'], [Math.round((s.z[1] + 2 * (s.z[2] + s.z[3])) / 60), 'WHO minutes']])}
    ${c ? traceChart(c) : ''}${s.src !== 'manual' ? zoneBar(s.z) : ''}
    ${c?.vt1 ? para(`Aerobic threshold estimate from this session: <b>${c.vt1} bpm</b>. ${why('dfa', 'How')}`) : c?.a1?.length ? para(`α1 in ${c.a1.length} windows, from ${Math.min(...c.a1.map(x => x[1])).toFixed(2)} to ${Math.max(...c.a1.map(x => x[1])).toFixed(2)}: it did not cross 0.75 cleanly, so no threshold from this one.`) : ''}
    ${s.src === 'watch' ? para(`Recorded by ${esc(s.app || 'the watch')}. Delete it there; the next sync removes it here too.`) : s.src === 'manual' ? para(`Typed in, ${s.eff === 'vig' ? 'vigorous' : 'moderate'}.`) : ''}
    <div class="rowb">${del ? `<button class="danger" data-hold="cardiodel" data-k="${p.k}" data-i="${s.i}">Hold to delete</button>` : ''}<button class="ghost" data-act="popclose">Close</button></div></aside>`;
}

// ---------- actions ----------
function trainAct(a, el) {
  const id = el.dataset.id;
  if (a === 'sxk') {
    const L = S.lifts[el.dataset.k];
    if (!L) return true;
    L.sx ||= {};
    if (L.sx[id] === el.dataset.v) delete L.sx[id]; else L.sx[id] = el.dataset.v;
    if (!Object.keys(L.sx).length) delete L.sx;
    save(); buzz(el.dataset.v === 'pain' ? 'warn' : 'ok');
    if (el.dataset.v === 'pain' || el.dataset.v === 'niggle') toast(el.dataset.v === 'pain' ? `${exName(id)}: swapped for a gentler one next time` : `${exName(id)}: same load next time`, 3500);
    render(); return true;
  }
  if (a === 'sessinfo') { openPop({ kind: 'sess', k: el.dataset.k }); return true; }
  if (a === 'exinfo') { openPop({ kind: 'exinfo', id }); return true; }
  if (a === 'clear') { S.cleared[id] = todayKey(); save(); buzz('ok'); toast(`${exName(id)} is back in the plan`); render(); return true; }
  if (a === 'cardioadd') { openPop({ kind: 'cardioadd' }); return true; }
  if (a === 'ckind') { pop.c.kind = el.dataset.v; buzz('tick'); render(); return true; }
  if (a === 'ceff') { pop.c.eff = el.dataset.v; buzz('tick'); render(); return true; }
  if (a === 'cmin') { const was = pop.c.min; pop.c.min = clamp(pop.c.min + +el.dataset.d, 5, 300); if (pop.c.min !== was) buzz('tick'); const b = $('#cmin'); if (b) b.textContent = pop.c.min; return true; }
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
ACT_HOLD.sessdel = el => {
  const k = el.dataset.k, was = S.lifts[k];
  if (!was) return;
  delete S.lifts[k]; save(); closePop();
  undoable('Session deleted', () => { S.lifts[k] = was; });
};
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-training.js');
