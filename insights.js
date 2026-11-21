'use strict';
// What your own data says about you: links between one thing and another, the regularity of your sleep, one recovery
// number, and the patterns in how you eat. All of it worked out on the phone, from nothing but what is stored here.
//
// Links (n-of-1). Each pair is read the way a single-person study should be read:
//  • Within-person and detrended: each series is taken as its deviation from its own 15-day running mean, so two
//    things that both drift over a fat-loss phase (weight down, HRV up) are not mistaken for one causing the other.
//  • Lagged the way the physiology runs: last night's sleep against this morning's HRV, today's food against tomorrow
//    morning's scale.
//  • Honest about time: daily data are autocorrelated, so 40 days are not 40 independent observations. The effective
//    sample size is cut by the lag-1 autocorrelation of both series (Bartlett), and the interval widens with it.
//  • In real units with a 95% interval ("per extra hour of sleep, +4% HRV, 1 to 7%"), and checked against the
//    direction the research expects. A link is "clear" only when its interval leaves out zero.
// Associations are not proof of cause; the screens say so, and say what would test it.

// ---------- small statistics ----------
// Two-sided 97.5% point of Student's t (Cornish–Fisher expansion around the normal; exact enough above 3 df).
function t975(df) {
  const z = 1.959964, d = Math.max(1, df);
  return z + (z ** 3 + z) / (4 * d) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * d * d) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * d ** 3);
}
// Standard normal CDF (Abramowitz–Stegun 7.1.26).
function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2), y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + (x < 0 ? -y : y));
}
// A day-keyed series as its deviation from its own centred running mean (±7 days, at least 5 values in the window).
function detrend(map, half = 7) {
  const ks = Object.keys(map).sort(), d = ks.map(k => Math.round(Date.parse(k + 'T12:00') / DAY)), v = ks.map(k => map[k]), out = {};
  let a = 0, b = 0, sum = 0;
  for (let i = 0; i < ks.length; i++) {
    while (b < ks.length && d[b] <= d[i] + half) sum += v[b++];
    while (d[a] < d[i] - half) sum -= v[a++];
    if (b - a >= 5) out[ks[i]] = v[i] - sum / (b - a);
  }
  return out;
}
// Lag-1 autocorrelation from consecutive days that both have a value.
function lag1(map) {
  const ks = Object.keys(map).sort(), m = mean(ks.map(k => map[k])), pr = [];
  for (const k of ks) { const n = shift(k, 1); if (map[n] != null) pr.push([map[k] - m, map[n] - m]); }
  if (pr.length < 6) return 0;
  const v = ks.reduce((a, k) => a + (map[k] - m) ** 2, 0) / ks.length;
  return v ? clamp(pr.reduce((a, [x, y]) => a + x * y, 0) / pr.length / v, -0.9, 0.9) : 0;
}
// x and y are { day: value }; pairs are matched on the same key (the lag is built into the series).
function assoc(X, Y) {
  const dx = detrend(X), dy = detrend(Y), ks = Object.keys(dx).filter(k => dy[k] != null).sort();
  const n = ks.length;
  if (n < 6) return { n };
  const xs = ks.map(k => dx[k]), ys = ks.map(k => dy[k]), mx = mean(xs), my = mean(ys);
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  if (!sxx || !syy) return { n };
  const r = sxy / Math.sqrt(sxx * syy), b = sxy / sxx;
  const sub = o => Object.fromEntries(ks.map((k, i) => [k, o[i]])), ax = lag1(sub(xs)), ay = lag1(sub(ys));
  const neff = clamp(n * (1 - ax * ay) / (1 + ax * ay), 4, n);
  const res = ys.reduce((a, y, i) => a + (y - my - b * (xs[i] - mx)) ** 2, 0);
  const se = Math.sqrt(res / Math.max(1, n - 2) / sxx) * Math.sqrt((n - 2) / Math.max(1, neff - 2)), tc = t975(neff - 2);
  const z = Math.atanh(clamp(r, -0.999, 0.999)), zs = 1 / Math.sqrt(Math.max(1, neff - 3));
  return { n, neff, r, rlo: Math.tanh(z - 1.96 * zs), rhi: Math.tanh(z + 1.96 * zs), b, lo: b - tc * se, hi: b + tc * se, sdx: Math.sqrt(sxx / n) };
}

// ---------- the pairs worth asking about ----------
// x, y: day → value (with the lag built in). per: the step of x the effect is quoted for. fy: how the slope is read
// out; pct: y is a log, so the slope is a percentage change. exp: the direction the research expects; ev: its evidence.
const kcalOf = k => S.food[k] && isComplete(k) ? totals(k).k : null;
const lnHrv = k => S.hrv[k] ? Math.log(S.hrv[k].rmssd) : null;
const setsOn = k => S.lifts[k] ? Object.values(S.lifts[k].ex).reduce((a, x) => a + x.filter(s => s[1] > 0).length, 0) : (S.hrv[k] || S.sleep[k] != null ? 0 : null);
// The clock time of the day's last logged food, in hours (after midnight counts as 24+), from logs made on the day.
function lastMealHour(k) {
  const ts = (S.food[k] || []).map(e => e.t).filter(Boolean);
  if (ts.length < 2 || !isComplete(k)) return null;
  const d = new Date(Math.max(...ts)), h = d.getHours() + d.getMinutes() / 60;
  return dk(d) === k ? h : h + 24;
}
function onsetDev(k) {
  const on = S.sleepx[k]?.on;
  if (on == null) return null;
  const base = cached('ON' + k, () => range(28, shift(k, -1)).map(d => S.sleepx[d]?.on).filter(v => v != null));
  return base.length >= 7 ? Math.abs(on - median(base)) / 60 : null;
}
const LINKS = [
  { id: 'sl-hrv', dom: ['sleep', 'heart'], x: 'Sleep', y: 'morning HRV', per: 1, xu: 'hour of sleep', fx: k => S.sleep[k], fy: lnHrv, pct: true, exp: 1, ev: 'sleep',
    test: 'Go to bed 45 minutes earlier for a week and watch the morning checks.' },
  { id: 'reg-hrv', dom: ['sleep', 'heart'], x: 'Bedtime off your usual', y: 'morning HRV', per: 1, xu: 'hour off your usual bedtime', fx: onsetDev, fy: lnHrv, pct: true, exp: -1, ev: 'regular',
    test: 'Keep lights-out within 30 minutes of your usual for two weeks.' },
  { id: 'sets-hrv', dom: ['train', 'heart'], x: 'Hard sets', y: 'next morning HRV', per: 10, xu: '10 hard sets', fx: setsOn, fy: k => lnHrv(shift(k, 1)), pct: true, exp: -1, ev: 'hrv',
    test: 'Normal after hard sessions; a run of low mornings is the signal to look at, not one.' },
  { id: 'sl-kcal', dom: ['sleep', 'food'], x: 'Sleep', y: 'calories eaten that day', per: 1, xu: 'hour of sleep', fx: k => S.sleep[k], fy: kcalOf, unit: 'kcal', dp: 0, exp: -1, ev: 'sleep',
    test: 'Short sleep raises appetite; on short-sleep days, plan protein early.' },
  { id: 'st-kcal', dom: ['move', 'food'], x: 'Steps', y: 'calories eaten', per: 2000, xu: '2,000 steps', fx: k => S.steps[k], fy: kcalOf, unit: 'kcal', dp: 0, exp: 1, ev: 'steps',
    test: 'Some of the energy that walking burns comes back as appetite; the energy model counts both.' },
  { id: 'kcal-wt', dom: ['food', 'body'], x: 'Calories', y: 'next morning’s weight', per: 500, xu: '500 kcal', fx: kcalOf, fy: k => S.weights[shift(k, 1)] ?? null, unit: 'kg', dp: 2, exp: 1, ev: 'trend',
    test: 'Mostly food mass, glycogen and water, not fat: it is why the trend, not one weigh-in, is what counts.' },
  { id: 'carb-wt', dom: ['food', 'body'], x: 'Carbs', y: 'next morning’s weight', per: 100, xu: '100 g of carbs', fx: k => { const t = totals(k); return S.food[k] && isComplete(k) && t.kn >= 0.9 * t.k ? t.c : null; }, fy: k => S.weights[shift(k, 1)] ?? null, unit: 'kg', dp: 2, exp: 1, ev: 'trend',
    test: 'Each gram of stored glycogen holds about three of water: a carb-heavy day shows on the scale and leaves again.' },
  { id: 'kcal-shr', dom: ['food', 'sleep'], x: 'Calories', y: 'heart rate asleep that night', per: 500, xu: '500 kcal', fx: kcalOf, fy: k => S.sleepx[shift(k, 1)]?.hr ?? null, unit: 'bpm', dp: 1, exp: 1, ev: 'rhr',
    test: 'Digesting a big meal keeps the heart working; try the largest meal earlier on a few days.' },
  { id: 'late-shr', dom: ['food', 'sleep'], x: 'Last meal later', y: 'heart rate asleep that night', per: 1, xu: 'hour later', fx: lastMealHour, fy: k => S.sleepx[shift(k, 1)]?.hr ?? null, unit: 'bpm', dp: 1, exp: 1, ev: 'rhr',
    test: 'Finish dinner three hours before bed on a few nights and compare the nights after.' },
  { id: 'st-sl', dom: ['move', 'sleep'], x: 'Steps', y: 'sleep that night', per: 2000, xu: '2,000 steps', fx: k => S.steps[k], fy: k => S.sleep[shift(k, 1)] ?? null, unit: 'min', scale: 60, dp: 0, exp: 1, ev: 'steps',
    test: 'Daytime activity helps sleep pressure build; a walk after dinner is an easy test.' },
  { id: 'sl-st', dom: ['sleep', 'move'], x: 'Sleep', y: 'steps that day', per: 1, xu: 'hour of sleep', fx: k => S.sleep[k], fy: k => S.steps[k] ?? null, unit: 'steps', dp: 0, exp: 1, ev: 'sleep',
    test: 'Tired days are quieter days; the burn model sees it in the steps.' },
];
function seriesOf(fn, days) { const o = {}; for (const k of days) { const v = fn(k); if (v != null && Number.isFinite(v)) o[k] = v; } return o; }
const LINK_MIN = 14;
function linkRead(L, days = range(120)) {
  const A = assoc(seriesOf(L.fx, days), seriesOf(L.fy, days));
  const out = { ...L, n: A.n || 0 };
  if (A.n >= LINK_MIN && !A.neff) return Object.assign(out, { status: 'flat' });
  if (!A.neff || A.n < LINK_MIN) return Object.assign(out, { status: 'need', need: LINK_MIN - (A.n || 0) });
  const k = L.per * (L.scale || 1), conv = v => L.pct ? (Math.exp(v * L.per) - 1) * 100 : v * k;
  Object.assign(out, A, { eff: conv(A.b), elo: conv(A.lo), ehi: conv(A.hi) });
  out.status = A.lo > 0 || A.hi < 0 ? 'clear' : Math.abs(A.r) >= 0.2 ? 'hint' : 'none';
  out.agrees = Math.sign(A.b) === L.exp;
  return out;
}
function allLinks() { return cached('links2', () => LINKS.map(L => linkRead(L))); }
// The effect in words: "+4% per hour of sleep (1 to 7%)".
function effText(L, ci = true) {
  if (L.eff == null) return '';
  const u = L.pct ? '%' : ` ${L.unit}`, d = L.pct ? 0 : L.dp ?? 1, f = v => sign(v, d);
  return `${f(L.eff)}${u}${ci ? ` <span class="ci">(${f(L.elo)} to ${f(L.ehi)}${u})</span>` : ''}`;
}

// ---------- sleep regularity ----------
// Sleep Regularity Index (Phillips 2017): the chance of being in the same state (asleep or awake) at any two moments
// 24 hours apart, scaled to −100…100. 100 is the same sleep every day. Computed minute by minute from the onset and
// wake time of each main sleep, over consecutive nights. In 60,977 UK Biobank adults the median was 81 (IQR 74–86),
// and the least regular fifth died earlier, more strongly than short sleep predicted (Windred 2024).
function sleepWindow(k) {
  const x = S.sleepx[k];
  if (!x || x.on == null) return null;
  const len = x.off != null && x.off > x.on ? x.off - x.on : x.bed || x.d + x.l + x.r + x.w || (S.sleep[k] || 0) * 60;
  return len >= 120 ? [x.on, x.on + len] : null;
}
function sri(n = 14, end = todayKey()) {
  return cached(`SRI${n}${end}`, () => {
    const vals = [];
    for (const k of range(n, end)) {
      const a = sleepWindow(shift(k, -1)), b = sleepWindow(k);
      if (!a || !b) continue;
      // Each window is minutes from the midnight of its own morning, over the 24 hours from noon to noon.
      let same = 0;
      for (let m = -720; m < 720; m++) same += ((m >= a[0] && m < a[1]) === (m >= b[0] && m < b[1])) ? 1 : 0;
      vals.push(-100 + 200 * same / 1440);
    }
    if (vals.length < 5) return { n: vals.length, need: 5 - vals.length };
    const v = mean(vals);
    return { n: vals.length, v, band: v >= 86 ? 'high' : v >= 74 ? 'typical' : v >= 65 ? 'low' : 'verylow' };
  });
}

// ---------- recovery as one number ----------
// The verdict (readiness() in model.js) decides the zone, by the rules the trials used: green 67–99 "train as planned",
// yellow 34–66 "train, but listen", red 1–33 "keep it easy". Where in the zone the day sits comes from how far each
// signal is from your own normal, in standard deviations, weighted by how much evidence stands behind it: HRV most
// (HRV-guided training trials), then sleep, resting heart rate, and breathing in sleep. It is a summary for the eye,
// not a new measurement; every part of it is shown beside it.
function zOf(v, base) { const m = mean(base), s = sd(base); return v == null || base.length < 7 || !s ? null : (v - m) / s; }
function recoveryScore(k = todayKey()) {
  return cached('RS' + k, () => {
    const R = readiness(k), parts = [];
    const hrvBase = Object.keys(S.hrv).filter(d => d < shift(k, -6) && gapDays(d, k) < 60).map(d => Math.log(S.hrv[d].rmssd));
    const hrvNow = S.hrv[k] ? Math.log(S.hrv[k].rmssd) : R.V.roll ? Math.log(R.V.roll) : null;
    const zh = zOf(hrvNow, hrvBase);
    if (zh != null) parts.push({ id: 'hrv', label: 'HRV', w: 0.45, z: zh, val: `${Math.round(Math.exp(hrvNow))} ms`, note: S.hrv[k] ? 'this morning' : '7-day average' });
    else {
      const W = nightly('hv', k, true);
      if (W.now != null && W.z != null) parts.push({ id: 'whrv', label: 'Overnight HRV', w: 0.2, z: W.z, val: `${Math.round(W.now)} ms`, note: 'watch, last night' });
    }
    const rh = restingHR(k), rhBase = range(28, shift(k, -7)).map(d => restingHR(d)?.v).filter(v => v != null);
    const zr = rh ? zOf(rh.v, rhBase) : null;
    if (zr != null) parts.push({ id: 'rhr', label: 'Resting HR', w: 0.2, z: -zr, val: `${Math.round(rh.v)} bpm`, note: rh.src === 'strap' ? 'strap' : 'watch' });
    const sl = S.sleep[k];
    if (sl != null) {
      const usual = mean(range(28, shift(k, -1)).map(d => S.sleep[d]).filter(v => v != null)) ?? 7.5, need = clamp(usual, 7, 9);
      parts.push({ id: 'sleep', label: 'Sleep', w: 0.25, z: clamp((sl - need) / 0.9, -3, 1), val: `${Math.floor(sl)}h ${Math.round((sl % 1) * 60)}m`, note: `need about ${r1(need)} h` });
    }
    const B = R.BR;
    if (B.now != null && B.base != null && B.sd) parts.push({ id: 'br', label: 'Breathing', w: 0.1, z: Math.min(0.5, -(B.now - B.base) / Math.max(0.4, B.sd)), val: `${r1(B.now)} /min`, note: 'asleep' });
    if (R.level === 'unknown' || !parts.length) return { level: R.level, parts, score: null, R };
    const W = parts.reduce((a, p) => a + p.w, 0), Z = parts.reduce((a, p) => a + p.w * clamp(p.z, -3, 3), 0) / W;
    const [lo, hi] = { easy: [5, 33], care: [34, 66], go: [67, 99] }[R.level];
    const score = Math.round(lo + phi(Z * 1.1) * (hi - lo));
    for (const p of parts) p.share = p.w / W;
    return { level: R.level, score, Z, parts, R };
  });
}
const ZONE = { go: ['Recovered', 'var(--good)'], care: ['Moderate', 'var(--mid)'], easy: ['Low', 'var(--bad)'], unknown: ['Calibrating', 'var(--soft)'] };

// ---------- how you eat ----------
function intakePatterns(end = todayKey()) {
  return cached('IP' + end, () => {
    const T = targets(), days = range(28, end), logged = days.filter(k => S.food[k]), full = days.filter(k => S.food[k] && isComplete(k));
    const kc = full.map(k => totals(k).k), on = full.filter(k => Math.abs(totals(k).k - T.kcal) <= T.kcal * 0.1).length;
    const out = { days: days.length, logged: logged.length, full: full.length, avg: kc.length ? mean(kc) : null, sd: kc.length >= 3 ? sd(kc) : null, on };
    // Weekend against weekdays, over eight weeks of complete days, with a Welch interval.
    const w8 = range(56, end).filter(k => S.food[k] && isComplete(k)), we = w8.filter(k => [0, 6].includes(new Date(k + 'T12:00').getDay())).map(k => totals(k).k), wd = w8.filter(k => ![0, 6].includes(new Date(k + 'T12:00').getDay())).map(k => totals(k).k);
    if (we.length >= 3 && wd.length >= 6) {
      const d = mean(we) - mean(wd), se = Math.sqrt(sd(we) ** 2 / we.length + sd(wd) ** 2 / wd.length);
      out.weekend = { d, lo: d - 1.96 * se, hi: d + 1.96 * se, n: we.length + wd.length };
    }
    // Weekday profile: mean intake for each day of the week (Monday first).
    const byWd = [1, 2, 3, 4, 5, 6, 0].map(w => { const v = w8.filter(k => new Date(k + 'T12:00').getDay() === w).map(k => totals(k).k); return v.length ? mean(v) : null; });
    out.byWd = byWd;
    // Protein at the main meals against 0.4 g/kg (Schoenfeld & Aragon 2018), over two weeks.
    let hit = 0, tot = 0;
    for (const k of range(14, end)) for (const m of ['breakfast', 'lunch', 'dinner']) { const t = totals(k, m); if (t.n) { tot++; if (t.p >= T.perMeal * 0.9) hit++; } }
    out.protein = tot >= 6 ? { hit, tot, pct: hit / tot * 100 } : null;
    const pd = full.slice(-14).map(k => totals(k).p);
    out.pAvg = pd.length ? mean(pd) : null;
    return out;
  });
}

// ---------- the one thing worth knowing today ----------
// Picked in order of how much it matters and how sure it is: a clear link that disagrees with your plan, a weekend
// pattern, regularity, then the burn the model has learned.
function headline() {
  return cached('headline', () => {
    const out = [], M = energyModel(), P = intakePatterns(), T = targets(), L = allLinks().filter(l => l.status === 'clear');
    if (M.E != null && M.conf !== 'calibrating' && Math.abs(M.gap) >= 8) out.push({ dom: 'food', t: `You burn about ${fmt(M.E)} kcal a day`, s: `${sign(M.gap)}% from the textbook ${fmt(M.formula)}, learned from your scale and your log. ${burnWords(M)}`, href: '#review' });
    if (P.weekend && P.weekend.lo > 100) out.push({ dom: 'food', t: `Weekends run ${fmt(P.weekend.d)} kcal higher`, s: `Over ${P.weekend.n} complete days (95% interval ${fmt(P.weekend.lo)} to ${fmt(P.weekend.hi)}). Two such days a week take back about ${fmt(P.weekend.d * 2 / 7)} kcal a day of the deficit.`, href: '#review' });
    for (const l of L.slice(0, 2)) out.push({ dom: l.dom[1] === 'heart' ? 'heart' : l.dom[1], t: `${l.x} → ${l.y}`, s: `${effText(l, false)} per ${l.xu}, across ${l.n} days. ${l.agrees ? 'Matches the research.' : 'Opposite to what the research expects; worth a closer look.'}`, href: '#review' });
    const Q = sri();
    if (Q.v != null && Q.v < 74) out.push({ dom: 'sleep', t: `Sleep regularity ${Math.round(Q.v)}`, s: `Below the typical 74–86. Regularity predicted survival more strongly than sleep length in 61,000 adults.`, href: '#recovery' });
    if (P.protein && P.protein.pct < 50) out.push({ dom: 'food', t: `${P.protein.hit} of ${P.protein.tot} main meals reached ${T.perMeal} g protein`, s: 'Spreading protein across meals (about 0.4 g/kg each) supports muscle better than one large serving.', href: '#food' });
    return out;
  });
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('insights.js');
