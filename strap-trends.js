'use strict';
// Two parts of the strap's page (view-strap.js): Trends, what the strap says over weeks, and Calibrate, how far the
// watch can be trusted against it and when to check again.
//
// Trends read each measure the way the studies behind it do:
//  - Morning HRV as ln RMSSD: its 7-day mean against your own 60-day normal (mean ± half an SD, the smallest worthwhile
//    change; Plews 2012, Buchheit 2014), and its 7-day coefficient of variation, which rises when something is
//    disturbing you before the mean moves (Plews 2012). A week's mean needs 3 or more mornings (Plews 2014).
//  - The aerobic threshold from α1 (Rogers 2021) and heart-rate recovery in the first minute (Cole 1999), each with a
//    Theil–Sen direction and its 95% interval. Recovery is compared only between sessions stopped at a similar heart
//    rate (within 10 bpm of your usual), since it depends on how hard you were going (Buchheit 2009).
// Calibrate keeps the watch honest: Bland–Altman agreement (bias and 95% limits) for resting mornings and shared
// workouts, a check every 6 weeks, and a drift test after each new pair (the latest three against the line so far: their mean outside 1.96·σ/√3 and two of the three each outside the 95% limits, on the same side),
// because watch firmware, strap fit and season change the wrist's error (Bent 2020).

const CAL_DUE = 42;
// ---------- trends ----------
function hrvSeries(days) {
  const ln = {}; for (const k of days) { const h = S.hrv[k]; if (h?.rmssd) ln[k] = Math.log(h.rmssd); }
  return ln;
}
function stuTrends() {
  const now = todayKey(), d60 = range(60), ln = hrvSeries(range(120)), got = d60.filter(k => ln[k] != null);
  let hrvBody;
  if (got.length < 7) hrvBody = para(`${plural(got.length, 'morning check')} in the last 60 days. The trend needs 7; the normal range 14. Take one most mornings on waking, lying still.`);
  else {
    const vals = got.map(k => ln[k]), m = mean(vals), s = sd(vals) || 0, lo = Math.exp(m - 0.5 * s), hi = Math.exp(m + 0.5 * s);
    const roll = {}, cvs = {};
    for (const k of d60) {
      const w = range(7, k).filter(x => ln[x] != null).map(x => ln[x]);
      if (w.length >= 3) roll[k] = Math.exp(mean(w));
      if (w.length >= 4) cvs[k] = sd(w) / mean(w) * 100;
    }
    const dots = Object.fromEntries(got.map(k => [k, Math.exp(ln[k])]));
    const last7 = range(7).filter(k => ln[k] != null), wk = last7.length >= 3 ? Math.exp(mean(last7.map(k => ln[k]))) : null;
    const cvNow = cvs[now] ?? cvs[shift(now, -1)], cvUsual = median(Object.values(cvs));
    const where = wk == null ? null : wk < lo ? 'below' : wk > hi ? 'above' : 'inside';
    const verdict = wk == null ? `Only ${plural(last7.length, 'morning')} this week: a weekly mean needs 3 or more.`
      : `This week's mean <b>${Math.round(wk)} ms</b> is <b>${where}</b> your normal of ${Math.round(lo)}–${Math.round(hi)} ms.`
        + (cvNow != null && cvUsual != null ? ` Its day-to-day variation is ${r1(cvNow)}% (usually ${r1(cvUsual)}%)${cvNow > cvUsual * 1.5 ? ': <b>unsettled</b>, often the first sign of strain, poor sleep or illness' : ''}.` : '');
    hrvBody = `${chart({ days: d60, dots, line: roll, band: [lo, hi], fy: v => Math.round(v), c: 'var(--heart)', now: true })}
      ${legend([['dot', 'each morning'], ['line', '7-day mean'], ['band', 'your normal (±½ SD)']])}${para(verdict)}
      ${stats([[`${last7.length}/7`, 'mornings this week'], [`${got.length}`, 'in 60 days'], [cvNow != null ? `${r1(cvNow)}%` : DASH, 'variation, 7 days']], 'three')}`;
  }
  // Cardio: threshold and recovery, each with a direction once there are enough sessions.
  const ses = [];
  for (const k of Object.keys(S.cardio).sort()) for (const c of S.cardio[k]) if (!c.m) ses.push({ k, ...c });
  const yr = ses.filter(x => gapDays(x.k, now) <= 365);
  const dir = (pts, unit, better) => {
    if (pts.length < 5) return `${plural(pts.length, 'session')}; a direction needs 5.`;
    const T = theilSenCI(pts.map(([k, v]) => [gapDays(pts[0][0], k) / 30.4, v]));
    if (!T) return '';
    const clear = T.lo > 0 || T.hi < 0;
    return clear ? `<b>${T.m > 0 ? 'Rising' : 'Falling'}</b> ${r1(Math.abs(T.m))} ${unit} a month (95% interval ${sign(T.lo, 1)} to ${sign(T.hi, 1)})${Math.sign(T.m) === better ? ', the direction fitness takes' : ''}.`
      : `<b>No clear direction</b> yet (95% interval ${sign(T.lo, 1)} to ${sign(T.hi, 1)} ${unit} a month).`;
  };
  const vt = yr.filter(x => x.vt1).map(x => [x.k, x.vt1]);
  const hr0s = yr.filter(x => x.hrr != null).map(x => x.hr0), mid = median(hr0s);
  const hrr = yr.filter(x => x.hrr != null && Math.abs(x.hr0 - mid) <= 10).map(x => [x.k, x.hrr]);
  const sparkDays = yr.length ? range(Math.min(365, gapDays(yr[0].k, now) + 1)) : [];
  const vtBody = vt.length ? `${vt.length >= 2 ? chart({ days: sparkDays, dots: Object.fromEntries(vt), fy: v => Math.round(v), c: 'var(--move)', h: 120 }) : ''}${para(`Latest <b>${vt[vt.length - 1][1]} bpm</b>. ${dir(vt, 'bpm', 1)}`)}`
    : para('Not found yet. A cardio session that starts easy and climbs steadily past moderate (20 minutes or more) lets α1 cross 0.75.');
  const hrrBody = hrr.length ? `${hrr.length >= 2 ? chart({ days: sparkDays, dots: Object.fromEntries(hrr), fy: v => Math.round(v), c: 'var(--move)', h: 120 }) : ''}${para(`Latest <b>${hrr[hrr.length - 1][1]} bpm</b> in the first minute, from sessions stopped near ${Math.round(mid)} bpm. ${dir(hrr, 'bpm', 1)} Under 12 bpm after hard effort is worth mentioning to a doctor (Cole 1999).`)}`
    : para('End a cardio session with the Recovery minute, standing still, to measure it.');
  return `${sec('Morning HRV', hrvBody, { why: ['hrv', 'How it is read'] })}
    ${sec('Aerobic threshold', vtBody, { why: ['dfa', 'The method'] })}
    ${sec('Heart-rate recovery', hrrBody, { why: ['hrr', 'Why it matters'] })}`;
}

// ---------- calibrate ----------
// Every pair of a strap reading and the watch's for the same thing, with its date.
function calPairs() {
  return cached('calPairs', () => {
    const now = todayKey();
    const rest = Object.keys(S.hrv).filter(k => S.rhr[k] != null && gapDays(k, now) <= 180).sort().map(k => ({ k, w: S.rhr[k], s: S.hrv[k].hr }));
    const ex = [];
    for (const k of Object.keys(S.cardio).sort()) for (const c of S.cardio[k]) { const p = c.t && S.pairs[c.t]; if (p && p.n >= 20) ex.push({ k, w: p.a, s: c.avg }); }
    return { rest, ex };
  });
}
// When to check again, and whether the latest pairs have moved away from the correction in use.
function calState() {
  const C = calibration(), P = calPairs(), now = todayKey();
  const last = a => a.length ? a[a.length - 1].k : null, lastEx = last(P.ex), lastRest = last(P.rest);
  const age = lastEx ? gapDays(lastEx, now) : null;
  let drift = null;
  if (P.ex.length >= LINE_N + 3) {
    // The latest three against the correction made from the pairs before them.
    const old = P.ex.slice(0, -3), L = exLine(old.map(x => [x.w, x.s])), E = agreement(old.map(x => [x.w, x.s]));
    const fix = w => L.on ? L.m * w + L.b : w - E.bias, res = P.ex.slice(-3).map(x => x.s - fix(x.w)), off = mean(res);
    // Drift needs both, so one odd session (a loose band, a cold wrist) never flags it:
    //  1. the three together sit outside what chance allows for a mean of three: |mean| > 1.96·σ/√3;
    //  2. at least two of the three are each outside the 95% limits, on the same side.
    const sd = L.on ? L.se : (E.sd || 0), lim = 1.96 * sd;
    if (sd > 0) {
      const side = Math.sign(off), beyond = res.filter(r => Math.abs(r) > lim && Math.sign(r) === side).length;
      drift = { off, lim, meanLim: 1.96 * sd / Math.sqrt(3), beyond, out: Math.abs(off) > 1.96 * sd / Math.sqrt(3) && beyond >= 2 };
    }
  }
  const due = !P.ex.length ? 'never' : drift?.out ? 'drift' : age > CAL_DUE ? 'due' : 'ok';
  return { C, P, lastEx, lastRest, age, drift, due };
}
// Bland–Altman: the difference (watch − strap) against the mean of the two, with the bias and its 95% limits.
function baPlot(P, C) {
  const pts = P.rest.map(x => ({ ...x, r: 1 })).concat(P.ex);
  if (pts.length < 3) return '';
  const xs = pts.map(p => (p.w + p.s) / 2), ys = pts.map(p => p.w - p.s);
  // Each kind has its own bias and limits, drawn only across the heart rates it covers.
  const span = a => a.length ? [Math.min(...a.map(p => (p.w + p.s) / 2)) - 3, Math.max(...a.map(p => (p.w + p.s) / 2)) + 3] : null;
  const groups = [[C.rest, span(P.rest)], [C.ex, span(P.ex)]].filter(([A, sp]) => A.bias != null && sp);
  const lines = groups.flatMap(([A]) => [A.bias, A.lo, A.hi]);
  let x0 = Math.min(...xs) - 5, x1 = Math.max(...xs) + 5, y0 = Math.min(...ys, ...lines, -5) - 2, y1 = Math.max(...ys, ...lines, 5) + 2;
  const W = 340, H = 180, L = 30, R = 8, T = 8, B = 22, X = v => L + (v - x0) / (x1 - x0) * (W - L - R), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  let s = `<svg class="chart baplot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Watch minus strap against their mean">`;
  s += niceTicks(y0, y1).map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="0" y="${(Y(v) + 3.5).toFixed(1)}">${v > 0 ? '+' : ''}${v}</text>`).join('');
  s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
  for (const [A, [a, b]] of groups) s += [[A.bias, 'bias'], [A.lo, 'loa'], [A.hi, 'loa']].map(([v, c]) => `<line class="${c}" x1="${X(a).toFixed(1)}" x2="${X(b).toFixed(1)}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/>`).join('');
  s += pts.map((p, i) => `<circle class="${p.r ? 'hollow' : ''}" style="--d:${Math.min(i, 30) * 20}ms" cx="${X(xs[i]).toFixed(1)}" cy="${Y(ys[i]).toFixed(1)}" r="3.2"><title>${dateLabel(p.k)}: watch ${Math.round(p.w)}, strap ${Math.round(p.s)}</title></circle>`).join('');
  s += niceTicks(x0, x1).map(v => `<text class="x" x="${X(v).toFixed(1)}" y="${H - 5}" text-anchor="middle">${v}</text>`).join('');
  return s + '</svg>' + legend([['dot hollow', 'resting mornings'], ['dot', 'shared workouts'], ['line', 'bias'], ['dash', '95% limits']]) + para('Each dot is one reading taken with both: how far the watch was from the strap (up: watch higher) at that heart rate. A cloud that tilts means the watch errs more as effort rises.', 'sub small');
}
function stuCal() {
  const K = calState(), { C, P } = K;
  const status = ({ never: () => ['Not calibrated', 'No workout worn with both yet. Until then, watch workout heart rate is used as it reads.', 'bad'],
    due: () => ['Check overdue', `Last checked ${plural(K.age, 'day')} ago; the rule is every ${CAL_DUE / 7} weeks, because wrist error shifts with firmware, band fit and season. One paired cardio session.`, 'mid'],
    drift: () => ['The watch has drifted', `The last three shared workouts average ${sign(K.drift.off, 1)} bpm off the correction (chance allows ±${r1(K.drift.meanLim)} for three), and ${K.drift.beyond} of them are each outside its ±${Math.round(K.drift.lim)} bpm limits. Two or three more paired sessions re-fit it.`, 'bad'],
    ok: () => ['Calibrated', `Last checked ${dateLabel(K.lastEx, { day: 'numeric', month: 'long' })}; due again around ${dateLabel(shift(K.lastEx, CAL_DUE), { day: 'numeric', month: 'long' })}.`, 'good'] })[K.due]();
  const row = (label, A, need) => `<tr><td>${label}</td><td>${A.n}</td><td>${A.bias == null ? `${need - A.n} more` : `${sign(A.bias, 1)} bpm`}</td><td>${A.lo == null ? DASH : `${sign(A.lo, 0)} to ${sign(A.hi, 0)}`}</td></tr>`;
  const steps = [['5 min', 'Stand or sit still'], ['10 min', 'Easy: you could sing'], ['10 min', 'Moderate: you can talk in sentences'], ['5 min', 'Hard: a few words at a time'], ['3 min', 'Stand still to recover']];
  return `<section class="card calstat ${status[2]}"><div class="eyebrow">Amazfit against the H9</div><h2>${status[0]}</h2>${para(status[1])}</section>
    ${sec('How far the watch is off', `<table class="cal"><tr><th></th><th>Pairs</th><th>Watch reads</th><th>95% within</th></tr>${row('Resting', C.rest, 5)}${row('Workouts', C.ex, 3)}</table>
      ${C.lineOn ? para(`In use: strap = ${C.line.m.toFixed(2)} × watch ${C.line.b < 0 ? '−' : '+'} ${Math.round(Math.abs(C.line.b))}, within ±${Math.round(1.96 * C.line.se)} bpm (95%).`) : C.exOn ? para(`In use: watch workout heart rate shifted by ${sign(-C.ex.bias, 1)} bpm.`) : ''}
      ${baPlot(P, C)}`, { why: ['devices', 'How this works'] })}
    ${sec('A calibration session', `<ol class="calsteps">${steps.map(([t, d], i) => `<li style="--d:${i * 50}ms"><b class="num">${t}</b><span>${d}</span></li>`).join('')}</ol>
      ${para('Watch snug, two fingers above the wrist bone; strap wet and centred. Start a workout on the watch and Cardio here at the same moment. One session gives a pair for every stretch of effort; three spread the line across your range.')}
      <div class="rowb"><button class="solid" data-act="stucal">Start the paired session</button></div>`)}`;
}
// One line on the strap's Live part when a check is due, so it is not forgotten.
function calNudge() {
  const K = calState();
  if (K.due === 'ok' || (K.due === 'never' && !Object.keys(S.rhr).length)) return '';
  return `<a class="callout lite2 calnudge" href="#strap-cal" data-act="stupart" data-v="cal"><span><b>${K.due === 'drift' ? 'The watch has drifted from the strap.' : K.due === 'never' ? 'Calibrate the watch to the strap.' : 'Time to check the watch against the strap.'}</b> One paired cardio session ›</span></a>`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('strap-trends.js');
