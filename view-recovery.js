'use strict';
// Recovery: one verdict for today, the morning check, and the trends behind it.

const VERDICT = {
  go: ['Train as planned', 'Nothing in your recovery data argues against it.'],
  care: ['Train, but listen to your body', 'One signal is off. Keep the plan, skip anything extra.'],
  easy: ['Keep today easy', 'Walk, mobility or a light session. Rule out illness if it lasts.'],
  unknown: ['Not enough data yet', 'A week of morning checks with the H9, or a few synced nights, and this fills in.'],
};
// What today's verdict rests on, and what would sharpen it: the strap leads, the watch fills the days it misses.
function basis(R, short) {
  const s = R.src, strap = s.strap ? "this morning's strap check" : s.week ? "the strap's 7-day average" : '', watch = s.night ? 'last night from the watch' : '';
  if (short) return s.strap && s.night ? 'strap + watch' : s.strap ? 'strap' : s.night ? (s.week ? 'watch + strap week' : 'watch standing in') : s.week ? 'strap week' : '';
  if (!strap && !watch) return '';
  const am = new Date().getHours() < 11;
  return `Based on ${[strap, watch].filter(Boolean).join(' and ')}.${s.strap ? '' : s.night ? ` No morning check today, so the watch stands in: it can advise care, and a strap reading is what settles it.${am ? ' There is still time for one.' : ''}` : ''}${s.night ? '' : ` No night from the watch yet: open ${watchApp()} so it syncs.`}`;
}
// Recovery as one number, in its zone, with every part it is made of: each part against your own normal, the dot
// left of centre when it counts against today. Tap a part for its section.
function recoveryHero() {
  const RS = recoveryScore(), R = RS.R, [head, sub] = VERDICT[R.level], [zw, zc] = ZONE[R.level];
  const sec = { hrv: 'rc-hrv', whrv: 'rc-night', rhr: 'rc-rhr', sleep: 'rc-sleep', br: 'rc-night' };
  const parts = RS.parts.map(p => {
    const z = clamp(p.z, -2.5, 2.5), c = z <= -1 ? 'var(--bad)' : z <= -0.5 ? 'var(--mid)' : 'var(--good)';
    return `<button class="part rowbtn" data-act="jump" data-to="${sec[p.id]}"><span class="pl">${p.label}<i>${esc(p.note)}</i></span><span class="zmeter" style="--c:${c}"><i style="left:${(50 + z * 20).toFixed(1)}%"></i></span><b>${p.val}</b></button>`;
  }).join('');
  const missing = [!RS.parts.some(p => p.id === 'hrv' || p.id === 'whrv') && 'HRV', !RS.parts.some(p => p.id === 'sleep') && 'sleep', !RS.parts.some(p => p.id === 'rhr') && 'resting heart rate'].filter(Boolean);
  return `<section class="card rhero lv-${R.level}" style="--c:${zc}">
    <div class="rh-top">${ring('rec', RS.score != null ? RS.score / 100 : 0, { c: zc, size: 132, stroke: 10, glow: RS.score != null, inner: RS.score != null ? `<b class="num">${RS.score}<small>%</small></b><span>recovery</span>` : `<b>${DASH}</b><span>learning</span>` })}
      <div><span class="zone">${RS.score != null ? zw : R.level === 'unknown' ? 'Calibrating' : zw}</span><h2>${head}</h2><p class="sub">${sub}</p></div></div>
    ${parts ? `<div class="parts">${parts}</div>` : ''}
    ${R.why.length ? `<ul class="reasons">${R.why.map(([, t, ev]) => `<li><a href="#why-${ev}">${t}</a></li>`).join('')}</ul>` : ''}
    <p class="sub small" style="margin:10px 0 0">${basis(R) || ''}${missing.length && R.level !== 'unknown' ? ` Not in today's number: ${missing.join(', ')}.` : ''} ${why('score', 'How the number is made')}</p></section>`;
}
function hrvSection() {
  const V = hrvState(), days = range(30), dots = {}, line = {};
  for (const k of days) {
    if (S.hrv[k]) dots[k] = S.hrv[k].rmssd;
    const W = hrvState(k); if (W.roll && W.week >= 3) line[k] = W.roll;
  }
  const c = chart({ days, dots, line, band: V.lo ? [V.lo, V.hi] : null, fy: v => Math.round(v) });
  const status = !V.lo ? `${plural(V.n, 'reading')} so far. ${V.need} more and your normal range appears.`
    : !V.state ? `Your normal range is ${Math.round(V.lo)}–${Math.round(V.hi)} ms${V.provisional ? ' (provisional until 2 weeks of readings)' : ''}. Three readings this week give a 7-day average to compare with it.`
    : `7-day average ${r1(V.roll)} ms is ${V.state === 'low' ? 'below' : V.state === 'high' ? 'above' : 'inside'} your range of ${Math.round(V.lo)}–${Math.round(V.hi)} ms${V.provisional ? ' (provisional)' : ''}.${V.state === 'high' ? ' Usually good; persistently high after hard training can mean saturation.' : ''}`;
  const pat = V.state && V.hrDelta != null ? ` Morning heart rate over the same days: ${sign(V.hrDelta, 1)} bpm against the baseline weeks${V.state === 'low' ? (V.hrDelta >= 3 ? ', the pattern that usually means fatigue, illness, short sleep or alcohol.' : ', so the fall in HRV is the weaker kind of signal.') : '.'}` : '';
  return sec('Morning HRV', `${stats([[V.now ? r1(V.now.rmssd) : DASH, 'today, ms'], [V.roll ? r1(V.roll) : DASH, '7-day average'], [V.lo ? `${Math.round(V.lo)}–${Math.round(V.hi)}` : DASH, 'normal range']])}
    ${c}${c ? legend([['dot', 'daily'], ['line', '7-day average'], ['band', 'your normal range']]) : ''}
    ${para(status + (V.state === 'low' ? pat : ''), V.state === 'low' ? 'flag' : 'sub')}
    ${historyList('Every morning check', Object.keys(S.hrv).sort().reverse().slice(0, 60).map(k => [k, `${r1(S.hrv[k].rmssd)} ms · ${Math.round(S.hrv[k].hr)} bpm${S.hrv[k].q ? ` · ${S.hrv[k].q}% clean` : ''}`]), 'hrv')}`, { why: ['hrv', 'How it is read'], id: 'rc-hrv' });
}
function rhrSection() {
  const days = range(30), dots = {}, R = rhrTrend(), C = calibration();
  for (const k of days) { const r = restingHR(k); if (r) dots[k] = { v: r.v, hollow: r.src === 'watch' }; }
  const sleepHr = {}; for (const k of days) if (S.sleepx[k]?.hr) sleepHr[k] = S.sleepx[k].hr;
  const c = chart({ days, dots, line: sleepHr, fy: v => Math.round(v) });
  const mode = rhrMode(), note = mode === 'both' ? `Strap mornings are used as they are; watch days are shifted by ${sign(-C.rest.bias, 1)} bpm to match the strap.`
    : mode === 'watch' ? 'From the watch alone until 5 mornings have both a morning check and a watch reading; mixing them earlier would show the change of device as a change in you.'
    : 'From morning checks with the strap.';
  return sec('Resting heart rate', `${stats([[R.now ? Math.round(R.now) : DASH, 'resting, 7 days'], [R.delta != null ? sign(R.delta, 1) : DASH, 'bpm vs 3 weeks before'], [sleepStats(7).hr ? Math.round(sleepStats(7).hr) : DASH, 'sleeping, 7 days']])}
    ${c}${c ? legend([['dot', 'resting, strap'], ['dot hollow', 'resting, watch'], ['line', 'sleeping, watch']]) : ''}${mode === 'both' ? '' : para(note)}`, { why: ['rhr', 'What moves it'], id: 'rc-rhr' });
}
function sleepSection() {
  const L = sleepStats(14), days = range(14), bars = {};
  for (const k of days) if (S.sleep[k] != null) bars[k] = { v: S.sleep[k], cls: S.sleep[k] < 6 ? 'low' : S.sleep[k] >= 7 ? 'ok' : '' };
  const c = chart({ days, bars, goal: 7, zero: true, fy: v => r1(v), h: 130 });
  const Q = sri(), J = socialJetlag();
  // One line: how long, how regular, and the one thing to change if there is one.
  const reg = Q.v != null ? `regularity ${Math.round(Q.v)} (${{ high: 'more regular than most', typical: 'typical', low: 'less regular than most', verylow: 'among the least regular' }[Q.band]})`
    : L.midSd != null ? `timing ±${Math.round(L.midSd)} min` : '';
  const fix = J.v != null && J.v >= 1 ? `Weekends run ${r1(J.v)} h later: wake within an hour of your weekday time.`
    : L.avg != null && L.avg < 6.5 ? 'Short: protect sleep before cutting calories.'
    : (Q.band === 'low' || Q.band === 'verylow' || (L.midSd ?? 0) > 60) ? 'A fixed wake time, days off included, is the lever.' : '';
  const left = L.out ? ` ${plural(L.out, 'night')} left out: watch off during it.` : '';
  const line = L.avg != null ? `${r1(L.avg)} h a night${reg ? ` · ${reg}` : ''}.${left} ${fix} ${why('sleep', 'Why it matters')}` : `Bars under 6 h are marked. ${why('sleep', 'Why sleep matters here')}`;
  const nights = range(7).reverse().filter(k => S.sleep[k] != null || S.sleepx[k]).map(k => {
    const x = S.sleepx[k], V = versus(S.sleep[k], range(28, shift(k, -1)).map(d => S.sleep[d]));
    return `<li><button class="rowbtn" data-act="dayx" data-k="${k}"><span class="grow"><span class="nm">${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })} · ${S.sleep[k] != null ? `${r1(S.sleep[k])} h` : DASH}${V.word && V.word !== 'usual' ? ` <span class="vw ${V.z < 0 ? 'bad' : 'good'}">${V.word}</span>` : ''}</span>
      ${x ? miniStages(x) : ''}<span class="sub">${[x?.on != null ? `${hm(x.on)}–${hm(x.off ?? x.on + (x.bed || x.d + x.l + x.r + x.w))}` : '', x?.hr ? `sleeping ${Math.round(x.hr)} bpm` : ''].filter(Boolean).join(' · ')}</span></span><span class="chev">›</span></button></li>`;
  }).join('');
  return sec('Sleep, 14 nights', `${c}${para(line)}
    ${nights ? `<h3>Night by night</h3><ul class="list nights">${nights}</ul>` : ''}`, { why: ['regular', 'Timing'], id: 'rc-sleep' });
}
// What the Bip measures while you sleep, each against its own normal: overnight HRV, breathing rate, blood oxygen in
// sleep (read only for repeated low nights), and for interest the VO2max estimate.
function nightSection() {
  const days = range(30), WH = nightly('hv', todayKey(), true), BR = nightly('br'), O = spo2Nights(), o2 = {}, hv = {}, br = {};
  for (const k of days) { const x = S.wx[k]; if (x?.hv) hv[k] = x.hv; if (x?.br) br[k] = x.br; if (x?.o2) o2[k] = x.o2; }
  if (Object.keys(hv).length + Object.keys(br).length + Object.keys(o2).length < 2 && !O.nights.length && !O.left.length) return '';
  const vo = Object.keys(S.wx).sort().reverse().find(k => S.wx[k].vo);
  const c1 = chart({ days, dots: hv, band: WH.lo ? [WH.lo, WH.hi] : null, fy: v => Math.round(v) });
  const c2 = chart({ days, dots: br, band: BR.base != null ? [BR.base - Math.max(1, 2 * BR.sd), BR.base + Math.max(1, 2 * BR.sd)] : null, fy: v => r1(v), h: 110 });
  const o2v = Object.values(o2);
  const lastK = Object.keys(S.wx).sort().pop(), prev = lastK ? range(28, shift(lastK, -1)) : [];
  const word = (f, v) => { const V = versus(v, prev.map(d => S.wx[d]?.[f])); return V.word ? ` Last night: <b>${V.word}</b> for you (z ${sign(V.z, 1)}).` : ''; };
  return sec('Overnight, from the watch', `${c1 ? `<h3>Overnight HRV</h3>${c1}${para(WH.lo ? `7-day average ${WH.roll ? Math.round(WH.roll) + ' ms' : DASH} against its own range of ${Math.round(WH.lo)}–${Math.round(WH.hi)} ms. ${V7(WH)} Kept apart from the strap's morning check: a different measurement, and one Amazfit has not published a validation for.${lastK && S.wx[lastK].hv ? word('hv', S.wx[lastK].hv) : ''}` : `${plural(WH.n, 'night')} so far; its own range appears after ${WH.need} more.`)}` : ''}
    ${c2 ? `<h3>Breathing rate in sleep</h3>${c2}${para(BR.base != null ? `Usually ${r1(BR.base)} breaths a minute${BR.now != null ? `; last night ${r1(BR.now)}` : ''}. A rise of 1 or more above your usual, beyond the shaded spread, often comes with infection or fever before you feel it, so it nudges the day's verdict.` : `${plural(BR.n, 'night')} so far; a baseline needs ${BR.need} more.`)}` : ''}
    ${o2v.length || O.nights.length || O.left.length || vo ? para(`${o2v.length || O.nights.length || O.left.length ? o2Line(O) : ''} ${vo ? `VO2max estimate ${r1(S.wx[vo].vo)} (${dateLabel(vo)}): a watch estimate, useful as a trend over months.` : ''}`) : ''}`, { why: ['night', 'How these are read'], id: 'rc-night' });
}
// Blood oxygen in sleep, in one sentence: what it was over the last two weeks, or what it still needs.
function o2Line(O) {
  const left = O.left.length ? ` ${plural(O.left.length, 'night')} left out: under ${O2_READS} readings in the sleep or the watch off.` : '';
  if (!O.nights.length) return `Blood oxygen in sleep: no night has ${O2_READS} or more readings inside the sleep yet; turn on all-day blood-oxygen monitoring for the watch.${left} ${why('spo2', 'How')}`;
  const avg = r1(mean(O.nights.map(n => n.v)));
  const head = O.on ? `<b>Blood oxygen in sleep under ${O2_LOW}% on ${O.low.length} of ${plural(O.nights.length, 'night')}</b> in the last two weeks: worth mentioning to a doctor.`
    : `Blood oxygen in sleep: ${avg}% on average over ${plural(O.nights.length, 'night')} in the last two weeks${O.low.length ? `, under ${O2_LOW}% on ${O.low.length}` : ''}.${O.ready ? '' : ` ${plural(O.need, 'more night')} before it is read for low nights.`}`;
  return `${head} Wrist SpO2 is not medical grade.${left} ${why('spo2', 'How')}`;
}
function V7(W) { return W.state === 'low' ? 'Below range: a nudge toward an easier day when there is no strap reading.' : W.state === 'high' ? 'Above range.' : W.state ? 'Inside range.' : ''; }
function devicesSection() {
  const C = calibration(), fmtA = (A, need) => A.bias == null ? `${need - A.n} more` : `${sign(A.bias, 1)} bpm`, lim = A => A.lo == null ? DASH : `${sign(A.lo, 0)} to ${sign(A.hi, 0)}`;
  const used = [C.restOn ? `Watch resting heart rate is shifted by ${sign(-C.rest.bias, 1)} bpm on days without a morning check.` : `Resting correction starts at 5 paired mornings (${C.rest.n} so far).`,
    C.lineOn ? `Watch workout heart rate is put on the strap's scale by effort: strap = ${C.line.m.toFixed(2)} × watch ${C.line.b < 0 ? '−' : '+'} ${Math.round(Math.abs(C.line.b))}, within ±${Math.round(1.96 * C.line.se)} bpm (95%).`
    : C.exOn ? `Watch workout heart rate is shifted by ${sign(-C.ex.bias, 1)} bpm before zones are counted. ${C.line.n >= 6 && C.line.m != null ? 'The pairs do not yet show a steady line, so the fixed shift stays.' : `A correction by effort needs ${C.line.n < 6 ? `${6 - C.line.n} more shared workouts` : 'workouts'}${C.line.span < 30 ? ` spread over 30 bpm (now ${Math.round(C.line.span)})` : ''}.`}`
    : `Workout correction starts at 3 shared workouts (${C.ex.n} so far): wear both, start a workout on the watch and in this app.`];
  const proto = `<details class="inner"><summary>Calibrate the watch to the strap</summary>${para('Wear both, the watch snug two fingers above the wrist bone. Start a workout on the watch and cardio in this app at the same moment, then: 5 min resting, 10 min easy, 10 min moderate, 3–5 min hard. Three such sessions cover the range a line needs; keep the watch in the same place each time.')}</details>`;
  return sec('Watch against strap', `<table class="cal"><tr><th></th><th>Pairs</th><th>Watch reads</th><th>95% within</th></tr>
      <tr><td>Resting</td><td>${C.rest.n}</td><td>${fmtA(C.rest, 5)}</td><td>${lim(C.rest)}</td></tr>
      <tr><td>Workouts</td><td>${C.ex.n}</td><td>${fmtA(C.ex, 3)}</td><td>${lim(C.ex)}</td></tr></table>
    ${para(used.join(' '))}${proto}`, { why: ['devices', 'How this works'] });
}
// One line under the heart rate: whether the early-illness pattern can be read yet, and what it found.
function illLine() {
  const I = illness();
  const t = I.on ? `<b>Seen two nights in a row.</b> ${illReasons(I).map(esc).join('. ')}.`
    : I.ready ? 'Not seen: resting heart rate and HRV were not both off your normal on the last two nights.'
    : `Not read yet: ${esc(I.missing.join('; '))}.`;
  return `<p class="sub illline">Early sign of illness: ${t} ${why('ill', 'How')}</p>`;
}
function vRecovery() {
  const H = hrProfile(), nav = subnav('recovery', [['rec', 'Recovery'], ['sleep', 'Sleep'], ['cardio', 'Cardio']]), on = SUB.recovery;
  const body = on === 'sleep' ? part(sleepSection) + part(nightSection)
    : on === 'cardio' ? part(cardioHeart) + part(devicesSection)
    : `${part(recoveryHero)}${sec('Morning check', strapBlock('morning') + strapMsg() + `<a class="navrow strapnav" href="#strap-sessions"><span class="ic" style="--c:var(--heart)">${ic('strap')}</span><span class="grow"><span class="nm">Every strap session</span><span class="sub">${plural(recList().length, 'recording')}, beat by beat, for you and anyone else</span></span><span class="chev">›</span></a>`, { why: ['hrv', 'Why mornings'] })}${part(hrvSection)}${part(rhrSection)}${part(illLine)}`;
  return `${appbar('Heart', `Resting ${H.rest} · max ${H.max} bpm`, `${strapPill()}${NATIVE ? syncPill() : ''}`)}${nav}${body}${watchRow()}`;
}
// The watch's own page, next to the strap's.
function watchRow() {
  const n = Object.keys(S.wx).length + Object.keys(S.steps).length ? Math.max(Object.keys(S.wx).length, Object.keys(S.steps).length) : 0;
  return `<section class="card wvnav"><a class="navrow strapnav watchnav" href="#watch"><span class="ic" style="--c:var(--move)">${ic('watch')}</span><span class="grow"><span class="nm">Everything the watch recorded</span><span class="sub">${n ? `${plural(n, 'day')} · by week, month and year` : 'Every figure by week, month and year, once the watch syncs'}</span></span><span class="chev">›</span></a></section>`;
}
// The strap at the top of Heart: its state at a glance, and the way into its own page.
function strapPill() {
  const on = HR.conn === 'on';
  return `<a class="strappill ${on ? 'on' : ''}${HR.mode ? ' rec' : ''}" href="#strap-live" aria-label="The strap">${ic('strap')}<span class="num">${on ? `${HR.bpm ?? DASH}` : 'Strap'}</span></a>`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-recovery.js');
