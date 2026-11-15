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
  return `Based on ${[strap, watch].filter(Boolean).join(' and ')}.${s.strap ? '' : s.night ? ` No morning check today, so the watch stands in: it can advise care, and a strap reading is what settles it.${am ? ' There is still time for one.' : ''}` : ''}${s.night ? '' : ' No night from the watch yet: open Zepp so it syncs.'}`;
}
function verdictCard() {
  const R = readiness(), [head, sub] = VERDICT[R.level];
  return `<section class="verdict lv-${R.level}"><div class="eyebrow">Today</div><h2>${head}</h2><p class="sub">${sub}</p>
    ${R.why.length ? `<ul class="reasons">${R.why.map(([, t, ev]) => `<li><a href="#why-${ev}">${t}</a></li>`).join('')}</ul>` : ''}${basis(R) ? `<p class="sub small">${basis(R)}</p>` : ''}</section>`;
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
  const cv = V.cv != null ? ` Day-to-day wobble ${r1(V.cv)}%${V.baseCv ? ` against ${r1(V.baseCv)}% usually` : ''}${V.baseCv && V.cv > V.baseCv * 1.5 ? ', higher than usual' : ''}.` : '';
  return sec('Morning HRV', `${stats([[V.now ? r1(V.now.rmssd) : DASH, 'today, ms'], [V.roll ? r1(V.roll) : DASH, '7-day average'], [V.lo ? `${Math.round(V.lo)}–${Math.round(V.hi)}` : DASH, 'normal range']])}
    ${c}${c ? legend([['dot', 'daily'], ['line', '7-day average'], ['band', 'your normal range']]) : ''}
    ${para(status + pat + cv, V.state === 'low' ? 'flag' : 'sub')}${hrvBreath()}
    ${historyList('Every morning check', Object.keys(S.hrv).sort().reverse().slice(0, 60).map(k => [k, `${r1(S.hrv[k].rmssd)} ms · ${Math.round(S.hrv[k].hr)} bpm${S.hrv[k].q ? ` · ${S.hrv[k].q}% clean` : ''}`]), 'hrv')}`, { why: ['hrv', 'How it is read'] });
}
// Breathing rate read from the beats of each morning check (the rhythm hidden in them), next to the watch's in sleep.
function hrvBreath() {
  const ks = Object.keys(S.hrv).sort().slice(-14).filter(k => S.hrv[k].br), wk = ks.slice(-7);
  if (wk.length < 3) return '';
  const w = range(7).map(k => S.wx[k]?.br).filter(Boolean);
  return para(`Breathing during your morning checks: about ${r1(median(wk.map(k => S.hrv[k].br)))} a minute${w.length >= 3 ? `; the watch measured ${r1(median(w))} in sleep` : ''}. Read from the rise and fall of your heart rate with each breath. ${why('metrics', 'How')}`);
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
    ${c}${c ? legend([['dot', 'resting, strap'], ['dot hollow', 'resting, watch'], ['line', 'sleeping, watch']]) : ''}${para(note)}`, { why: ['rhr', 'What moves it'] });
}
function sleepSection() {
  const L = sleepStats(14), days = range(14), bars = {};
  for (const k of days) if (S.sleep[k] != null) bars[k] = { v: S.sleep[k], cls: S.sleep[k] < 6 ? 'low' : S.sleep[k] >= 7 ? 'ok' : '' };
  const c = chart({ days, bars, goal: 7, zero: true, fy: v => r1(v), h: 130 });
  const spread = L.midSd == null ? DASH : `±${Math.round(L.midSd)}`;
  const st = L.stages ? para(`Stages across ${L.stages.n} nights: deep ${Math.round(L.stages.d)}%, REM ${Math.round(L.stages.r)}%, light ${Math.round(L.stages.l)}%. For interest only. ${why('stages', 'Why')}`) : '';
  const nights = range(7).reverse().filter(k => S.sleep[k] != null || S.sleepx[k]).map(k => {
    const x = S.sleepx[k], V = versus(S.sleep[k], range(28, shift(k, -1)).map(d => S.sleep[d]));
    return `<li><button class="rowbtn" data-act="dayx" data-k="${k}"><span class="grow"><span class="nm">${dateLabel(k, { weekday: 'short', day: 'numeric', month: 'short' })} · ${S.sleep[k] != null ? `${r1(S.sleep[k])} h` : DASH}${V.word && V.word !== 'usual' ? ` <span class="vw ${V.z < 0 ? 'bad' : 'good'}">${V.word}</span>` : ''}</span>
      ${x ? miniStages(x) : ''}<span class="sub">${[x?.on != null ? `${hm(x.on)}–${hm(x.off ?? x.on + (x.bed || 0))}` : '', x?.hr ? `sleeping ${Math.round(x.hr)} bpm` : '', x?.lo ? `low ${x.lo}` : '', S.wx[k]?.br ? `breathing ${r1(S.wx[k].br)}` : ''].filter(Boolean).join(' · ')}</span></span><span class="chev">›</span></button></li>`;
  }).join('');
  return sec('Sleep, 14 nights', `${stats([[L.avg != null ? r1(L.avg) : DASH, 'h a night'], [spread, `min timing spread${L.mid != null ? `, midpoint ${hm(L.mid)}` : ''}`], [L.eff != null ? Math.round(L.eff) + '%' : DASH, 'asleep while in bed']])}
    ${c}${para(L.midSd != null ? (L.midSd <= 30 ? 'Regular timing.' : L.midSd <= 60 ? 'Timing moderately irregular.' : 'Timing irregular. A fixed wake time on off days is the lever.') + ` ${why('regular', 'Why timing matters')}` : `Bars under 6 h are marked. ${why('sleep', 'Why sleep matters here')}`)}${st}
    ${nights ? `<h3>Night by night</h3><p class="sub small">Tap a night for its heart rate across the day, the stages hour by hour, and each number against your usual.</p><ul class="list nights">${nights}</ul>` : ''}`, { why: ['sleep', 'Sleep and fat loss'] });
}
// What the Bip measures while you sleep, each against its own normal: overnight HRV, breathing rate, and for interest
// only SpO2 and the VO2max estimate.
function nightSection() {
  const days = range(30), WH = nightly('hv', todayKey(), true), BR = nightly('br'), o2 = {}, hv = {}, br = {};
  for (const k of days) { const x = S.wx[k]; if (x?.hv) hv[k] = x.hv; if (x?.br) br[k] = x.br; if (x?.o2) o2[k] = x.o2; }
  if (Object.keys(hv).length + Object.keys(br).length + Object.keys(o2).length < 2) return '';
  const vo = Object.keys(S.wx).sort().reverse().find(k => S.wx[k].vo);
  const c1 = chart({ days, dots: hv, band: WH.lo ? [WH.lo, WH.hi] : null, fy: v => Math.round(v) });
  const c2 = chart({ days, dots: br, band: BR.base != null ? [BR.base - Math.max(1, 2 * BR.sd), BR.base + Math.max(1, 2 * BR.sd)] : null, fy: v => r1(v), h: 110 });
  const o2v = Object.values(o2);
  const lastK = Object.keys(S.wx).sort().pop(), prev = lastK ? range(28, shift(lastK, -1)) : [];
  const word = (f, v) => { const V = versus(v, prev.map(d => S.wx[d]?.[f])); return V.word ? ` Last night: <b>${V.word}</b> for you (z ${sign(V.z, 1)}).` : ''; };
  return sec('Overnight, from the watch', `${c1 ? `<h3>Overnight HRV</h3>${c1}${para(WH.lo ? `7-day average ${WH.roll ? Math.round(WH.roll) + ' ms' : DASH} against its own range of ${Math.round(WH.lo)}–${Math.round(WH.hi)} ms. ${V7(WH)} Kept apart from the strap's morning check: a different measurement, and one Amazfit has not published a validation for.${lastK && S.wx[lastK].hv ? word('hv', S.wx[lastK].hv) : ''}` : `${plural(WH.n, 'night')} so far; its own range appears after ${WH.need} more.`)}` : ''}
    ${c2 ? `<h3>Breathing rate in sleep</h3>${c2}${para(BR.base != null ? `Usually ${r1(BR.base)} breaths a minute${BR.now != null ? `; last night ${r1(BR.now)}` : ''}. A rise of 1 or more above your usual, beyond the shaded spread, often comes with infection or fever before you feel it, so it nudges the day's verdict.` : `${plural(BR.n, 'night')} so far; a baseline needs ${BR.need} more.`)}` : ''}
    ${o2v.length || vo ? para(`${o2v.length ? `Blood oxygen in sleep: ${r1(mean(o2v.slice(-7)))}% on average this week. Wrist SpO2 misses by several points, so it is shown and never used.` : ''} ${vo ? `VO2max estimate ${r1(S.wx[vo].vo)} (${dateLabel(vo)}): a watch estimate, useful as a trend over months.` : ''}`) : ''}`, { why: ['night', 'How these are read'] });
}
function V7(W) { return W.state === 'low' ? 'Below range: a nudge toward an easier day when there is no strap reading.' : W.state === 'high' ? 'Above range.' : W.state ? 'Inside range.' : ''; }
function devicesSection() {
  const C = calibration(), fmtA = (A, need) => A.bias == null ? `${need - A.n} more` : `${sign(A.bias, 1)} bpm`, lim = A => A.lo == null ? DASH : `${sign(A.lo, 0)} to ${sign(A.hi, 0)}`;
  const used = [C.restOn ? `Watch resting heart rate is shifted by ${sign(-C.rest.bias, 1)} bpm on days without a morning check.` : `Resting correction starts at 5 paired mornings (${C.rest.n} so far).`,
    C.exOn ? `Watch workout heart rate is shifted by ${sign(-C.ex.bias, 1)} bpm before zones are counted.` : `Workout correction starts at 3 shared workouts (${C.ex.n} so far): wear both, start a workout on the watch and in this app.`];
  return sec('Watch against strap', `<table class="cal"><tr><th></th><th>Pairs</th><th>Watch reads</th><th>95% within</th></tr>
      <tr><td>Resting</td><td>${C.rest.n}</td><td>${fmtA(C.rest, 5)}</td><td>${lim(C.rest)}</td></tr>
      <tr><td>Workouts</td><td>${C.ex.n}</td><td>${fmtA(C.ex, 3)}</td><td>${lim(C.ex)}</td></tr></table>
    ${para(used.join(' '))}`, { why: ['devices', 'How this works'] });
}
function vRecovery() {
  const H = hrProfile();
  return `${masthead('Recovery', `Resting ${H.rest} · max ${H.max} bpm${H.maxSrc === 'seen' ? ' (seen)' : ''}`)}
    ${verdictCard()}
    ${sec('Morning check', strapBlock('morning') + strapMsg(), { why: ['hrv', 'Why mornings'] })}
    ${sec('Strap lab', `<p class="sub">More from the strap: breathing that trains the heart-rate reflex, your own resonance rate, how you handle standing up, and a full reading any time.</p>${labTiles()}`, { why: ['breathe', 'The evidence'] })}
    ${hrvSection()}${rhrSection()}${sleepSection()}${part(nightSection)}${devicesSection()}`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('view-recovery.js');
