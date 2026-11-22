'use strict';
// Everything the app concludes from your data. Each function says what it uses; the evidence
// behind each choice is in EVID (data.js) and is one tap away wherever the number is shown.

function ageYears() { return (Date.now() - Date.parse(S.profile.dob)) / (365.25 * DAY); }

// ---------- food ----------
// Totals for a day or one meal. Carbs and fat are summed only over entries that know them (a maker that states just
// energy and protein, or an old entry); kn is the energy those entries cover, so a split is never shown as complete
// when part of the day is unknown.
function totals(key, meal) { return cached(`TT${key}${meal || ''}`, () => totalsOf(key, meal)); }
function totalsOf(key, meal) {
  const t = { k: 0, p: 0, fb: 0, c: 0, ft: 0, kn: 0, n: 0 };
  for (const e of S.food[key] || []) if (!meal || e.m === meal) {
    t.k += e.k * e.q; t.p += e.p * e.q; t.fb += e.fb * e.q; t.n++;
    if (e.c != null && e.ft != null) { t.c += e.c * e.q; t.ft += e.ft * e.q; t.kn += e.k * e.q; }
  }
  return t;
}
// Every built-in food as one shape: { id, n, u, k, p, c, ft, fb, cat, g (grams in one unit, if known), src, ref }.
// Home dishes carry src 'recipe' (an estimate from typical recipes); see data.js for the packaged and raw sources.
const FOODIDX = new Map();
for (const f of FOODS) FOODIDX.set(f[0], { id: f[0], n: f[1], u: f[2], k: f[3], p: f[4], c: f[5], ft: f[6], fb: f[7], cat: f[8], g: GRAMS[f[0]] || unitGrams(f[2]), src: 'recipe' });
for (const f of PANEL_FOODS) FOODIDX.set(f.id, f);
// "100 g", "50 g dry", "1 glass (250 ml)": the grams written in the unit itself.
function unitGrams(u) { const m = /(\d+(?:\.\d+)?)\s*(g|ml)\b/.exec(u || ''); return m ? +m[1] : null; }
function food(id) { return FOODIDX.get(id) || S.custom.find(x => x.id === id) || offFood(id) || wholeFood(id); }
function allFoods() { return [...FOODIDX.values()].concat(S.custom); }
// Energy that the macros themselves account for: 4 kcal/g protein and carbs, 9 fat, 2 fibre (FAO). A panel or an
// entry that disagrees with its own macros by more than about a fifth has a typo somewhere.
function atwater(f) { return f.c == null || f.ft == null ? null : 4 * f.p + 4 * f.c + 9 * f.ft + 2 * (f.fb || 0); }
function atwaterOff(f) { const a = atwater(f); return a == null || !f.k ? null : (f.k - a) / Math.max(f.k, a); }
// Entries logged before carbs and fat were kept: filled in from the food they came from, only where the stored
// energy and protein still match it exactly (so an entry from a food that has since changed is left alone).
function backfillMacros() {
  let n = 0;
  for (const list of Object.values(S.food)) for (const e of list) {
    if (e.c != null) continue;
    const f = FOODIDX.get(e.id);
    if (!f || f.c == null || f.k !== e.k || f.p !== e.p) continue;
    Object.assign(e, { c: f.c, ft: f.ft }); if (f.g && !e.g) e.g = f.g; if (f.src && !e.src) e.src = f.src; n++;
  }
  return n;
}
// One portion in words: "1½ × 1 katori · about 225 g", or "65 g" for something weighed by the gram.
function qtxt(q) { const w = Math.floor(q), f = { 25: '¼', 50: '½', 75: '¾' }[Math.round((q - w) * 100)]; return f && w < 10 && Math.abs((q - w) * 100 - Math.round((q - w) * 100)) < 1e-6 ? (w || '') + f : String(+q.toFixed(2)); }
function portion(e) {
  const g = e.g ? e.q * e.g : null;
  if (g != null && /^100 (g|ml)$/.test(e.u)) return `${Math.round(g)} ${e.u.slice(4)}`;
  const ml = / ml\b/.test(e.u) ? 'ml' : 'g', u = e.q === 1 ? e.u : /^1 [a-z]/i.test(e.u) ? e.u.slice(2) : e.u;
  return `${e.q === 1 && /^1 /.test(e.u) ? '' : `${qtxt(e.q)} × `}${u}${g != null && !/\(\d/.test(e.u) ? ` · about ${Math.round(g)} ${ml}` : g != null && e.q !== 1 ? ` · ${Math.round(g)} ${ml}` : ''}`;
}
function mainMeals(k) { return ['breakfast', 'lunch', 'dinner'].filter(m => (S.food[k] || []).some(e => e.m === m)).length; }
// A day counts toward the burn estimate only if it looks complete, unless you say otherwise.
function isComplete(k) {
  if (S.full[k] != null) return S.full[k];
  return cached('IC' + k, () => totals(k).k >= 1000 && mainMeals(k) >= 2);
}

// ---------- weight ----------
// Smoothed weight: scale readings swing 1–2 kg on water and gut contents alone.
function series() {
  return cached('series', () => {
    let t = null, prev = null;
    return Object.keys(S.weights).sort().map(k => {
      const w = S.weights[k], gap = prev ? gapDays(prev, k) : 1;
      t = t == null ? w : t + (1 - Math.pow(0.9, gap)) * (w - t);
      prev = k;
      return { k, w, t };
    });
  });
}
function trendOn(k) { let t = null; for (const s of series()) { if (s.k <= k) t = s.t; else break; } return t; }
// kg per day over the last 21 days: Theil–Sen through the raw weigh-ins; null until there is enough.
function slope() {
  return cached('slope', () => {
    const from = shift(todayKey(), -21);
    const pts = Object.keys(S.weights).filter(k => k >= from).map(k => [Date.parse(k + 'T12:00') / DAY, S.weights[k]]);
    if (pts.length < 6) return null;
    const xs = pts.map(p => p[0]);
    if (Math.max(...xs) - Math.min(...xs) < 10) return null;
    return theilSen(pts).m;
  });
}
// The same slope with its 95% interval, kg per day, for how sure a projected date is.
function slopeCI() {
  return cached('slopeCI', () => {
    const from = shift(todayKey(), -21);
    const pts = Object.keys(S.weights).filter(k => k >= from).map(k => [Date.parse(k + 'T12:00') / DAY, S.weights[k]]);
    return pts.length >= 6 ? theilSenCI(pts) : null;
  });
}
// A weigh-in far from the trend is usually a typo or a heavy meal; ask before trusting it.
function weighCheck(k, v) {
  const t = trendOn(shift(k, -1));
  if (t == null) return null;
  const d = v - t;
  return Math.abs(d) > Math.max(2.5, t * 0.03) ? d : null;
}

// ---------- daily targets ----------
// The live figures move a little every day; the target you see is held for the week (settleTargets).
function liveTargets() {
  return cached('TL', () => {
    const p = S.profile, set = S.settings, ser = series(), wt = ser.length ? ser[ser.length - 1].t : p.w0;
    // Steps: the last week's days worn 10 h or more (or not known), once there are 4; else the last four weeks'.
    const s7 = stepRun(range(7)).vals, s28 = stepRun(range(28)).vals, st = s7.length >= WEAR_WEEK ? s7 : s28;
    const steps = st.length ? mean(st) : 2000;
    // Lifting sessions a week: what you actually did over the last four weeks once there is that much history,
    // otherwise the days you said you train.
    const firstLift = Object.keys(S.lifts).sort()[0], perWk = firstLift && gapDays(firstLift, todayKey()) >= 28 ? range(28).filter(liftedOn).length / 4 : p.days;
    const F = formulaBurn(wt, steps, perWk), bmr = F.bmr, formula = F.tdee;
    // Your own burn, from the energy model (energy.js): the scale and the complete days of food, together.
    const full = range(21).filter(k => S.food[k] && isComplete(k));
    const intake = full.length ? mean(full.map(k => totals(k).k)) : null, sl = slope(), M = energyModel();
    const measured = M.E != null && M.conf !== 'calibrating' ? M.E : null;
    // Lean on your data as its interval narrows: none at ±300 kcal (the formula's own error), fully at ±150; and never
    // further than 25% from the formula, whatever the data says.
    const trust = measured == null ? 0 : clamp((300 - M.sd) / 150, 0, 1);
    const tdee = formula + trust * (clamp(measured ?? formula, formula * 0.75, formula * 1.25) - formula);
    const pace = PACE[set.pace][1], rho = rhoOf(wt, bodyFat().pct).rho;
    const deficit = Math.min(pace / 100 * wt * rho / 7, 0.25 * tdee);
    const live = Math.max(p.sex === 'm' ? 1600 : 1400, Math.round((tdee - deficit) / 50) * 50);
    const ref = 25 * (p.h / 100) ** 2, adj = wt > ref ? ref + 0.25 * (wt - ref) : wt, pf = set.protein === 'high' ? 2.0 : 1.6;
    const base = Math.round((steps + 1000) / 500) * 500;
    return {
      wt, bmr, formula, tdee, perWk, measured, trust, complete: full.length, intake, deficit, live, adj, slope: sl, steps, pf, rho, model: M,
      liveProtein: Math.round(pf * adj / 5) * 5, perMeal: Math.round(0.4 * adj / 5) * 5,
      stepGoal: steps >= 8000 ? clamp(Math.round(steps / 500) * 500, 8000, 10000) : clamp(base, 3000, 8000),
      bmi: wt / (p.h / 100) ** 2,
    };
  });
}
function targetSig() { const p = S.profile, s = S.settings; return [s.pace, s.protein, p.sex, p.dob, p.h, p.days].join('|'); }
function weekStart(k = todayKey()) { const d = new Date(k + 'T12:00'); return shift(k, -((d.getDay() + 6) % 7)); }
// Recalculated on Mondays; one update moves calories by 150 kcal at most. A changed profile or goal applies at once.
function settleTargets() {
  const t = S.meta.tgt, sig = targetSig();
  if (t && t.sig === sig && t.at >= weekStart()) return false;
  const L = liveTargets();
  const k = t && t.sig === sig ? Math.round(clamp(L.live, t.k - 150, t.k + 150) / 50) * 50 : L.live;
  S.meta.tgt = { k, p: L.liveProtein, at: todayKey(), sig };
  save();
  return true;
}
function targets() {
  return cached('T', () => {
    const L = liveTargets(), t = S.meta.tgt, locked = !!t && t.sig === targetSig();
    const kcal = locked ? t.k : L.live, protein = locked ? t.p : L.liveProtein;
    return Object.assign({}, L, { kcal, protein, locked, next: shift(weekStart(), 7), fibre: Math.max(30, Math.round(15 * kcal / 1000)) });
  });
}

// ---------- heart: personal zones and calibration ----------
// Watch against strap, paired on the same mornings and the same workouts.
function calibration() {
  return cached('C', () => {
    const now = todayKey();
    const rest = Object.keys(S.hrv).filter(k => S.rhr[k] != null && gapDays(k, now) <= 180).map(k => [S.rhr[k], S.hrv[k].hr]);
    const ex = [];
    for (const k in S.cardio) for (const c of S.cardio[k]) { const p = c.t && S.pairs[c.t]; if (p && p.n >= 20) ex.push([p.a, c.avg]); }
    const R = agreement(rest), E = agreement(ex);
    return { rest: R, ex: E, restOn: R.n >= 5, exOn: E.n >= 3 };
  });
}
// One consistent resting-HR series. Until the watch is calibrated, mixing sources would show jumps that are
// only the change of device, so the source with more days in the last 4 weeks is used alone.
function rhrMode() {
  return cached('rhrMode', () => {
    if (calibration().restOn) return 'both';
    const d = range(28), strap = d.filter(k => S.hrv[k]).length, watch = d.filter(k => S.rhr[k] != null).length;
    return watch > strap ? 'watch' : 'strap';
  });
}
function restingHR(k) {
  const mode = rhrMode(), C = calibration();
  if (mode !== 'watch' && S.hrv[k]) return { v: S.hrv[k].hr, src: 'strap' };
  // The watch's figure only from a day it was worn long enough to know your resting rate (or not known).
  if (mode !== 'strap' && S.rhr[k] != null && validDay(k) !== false) return mode === 'both' ? { v: S.rhr[k] - C.rest.bias, src: 'watch', adj: true } : { v: S.rhr[k], src: 'watch' };
  return null;
}
function hrProfile() {
  return cached('H', () => {
    const est = Math.round(208 - 0.7 * ageYears()), now = todayKey(), peaks = [];
    for (const k in S.cardio) if (gapDays(k, now) <= 365) for (const c of S.cardio[k]) if (c.max) peaks.push(c.max);
    const seen = peaks.length ? Math.max(...peaks) : null, useSeen = seen != null && seen > est;
    const strap = range(21).map(k => S.hrv[k]?.hr).filter(Boolean), C = calibration();
    let rest = 70, restSrc = 'a default until there are 3 morning checks';
    if (strap.length >= 3) { rest = median(strap); restSrc = `median of ${strap.length} morning checks with the strap`; }
    else {
      const w = range(21).map(k => S.rhr[k]).filter(v => v != null);
      if (w.length >= 3) { rest = median(w) - (C.restOn ? C.rest.bias : 0); restSrc = C.restOn ? 'from the watch, corrected to the strap' : 'from the watch'; }
    }
    rest = Math.round(rest);
    const max = useSeen ? seen : est;
    return { est, max, maxSrc: useSeen ? 'seen' : 'formula', rest, restSrc, zones: [0.4, 0.6, 0.9].map(f => Math.round(rest + f * (max - rest))) };
  });
}
function zoneOf(bpm, H = hrProfile()) { return bpm < H.zones[0] ? 0 : bpm < H.zones[1] ? 1 : bpm < H.zones[2] ? 2 : 3; }

// ---------- HRV, the way the trials used it ----------
// Normal range = baseline mean ± 0.5 SD of ln RMSSD; the 7-day rolling mean is what gets compared.
function hrvState(k = todayKey()) {
  return cached('V' + k, () => {
    const ln = d => Math.log(S.hrv[d].rmssd);
    const keys = Object.keys(S.hrv).filter(d => d <= k && gapDays(d, k) < 60).sort();
    const week = keys.filter(d => gapDays(d, k) < 7).map(ln), now = S.hrv[k] || null;
    let base = keys.filter(d => gapDays(d, k) >= 7).slice(-28).map(ln), provisional = false;
    if (base.length < 10) { base = keys.slice(-35).map(ln); provisional = true; }
    const out = { now, n: keys.length, week: week.length };
    if (base.length < 7) return Object.assign(out, { need: 7 - base.length });
    const m = mean(base), s = sd(base), swc = Math.max(0.5 * s, 0.03);
    const lo = m - swc, hi = m + swc, at = x => x < lo ? 'low' : x > hi ? 'high' : 'normal';
    Object.assign(out, { provisional, base: Math.exp(m), lo: Math.exp(lo), hi: Math.exp(hi), baseCv: s / m * 100 });
    if (now) out.day = at(Math.log(now.rmssd));
    if (week.length >= 3) { const r = mean(week); Object.assign(out, { roll: Math.exp(r), state: at(r), cv: week.length >= 4 ? sd(week) / r * 100 : null }); }
    // Morning heart rate from the same checks, this week against the baseline weeks: read with HRV, it tells the
    // common pattern (HRV down, heart rate up) from the less common one (both down).
    const hrOf = ds => ds.map(d => S.hrv[d].hr), bk = keys.filter(d => gapDays(d, k) >= 7).slice(-28), wk = keys.filter(d => gapDays(d, k) < 7);
    if (bk.length >= 7 && wk.length >= 3) out.hrDelta = mean(hrOf(wk)) - mean(hrOf(bk));
    return out;
  });
}
// ---------- what the watch measures overnight ----------
// The Bip's own overnight HRV and breathing rate, each against its own baseline: never mixed with the strap's
// morning check, which is a different measurement (asleep, wrist light, the watch's own algorithm, against two
// minutes lying awake with an ECG strap). Amazfit's overnight HRV has no published validation, so it can only
// ever turn the day to "listen to your body", never to "keep it easy", and only on days without a strap reading.
function nightly(field, k = todayKey(), log = false) {
  return cached(`N${field}${k}`, () => {
    const f = d => { const v = S.wx[d]?.[field]; return v == null ? null : log ? Math.log(v) : v; };
    const keys = Object.keys(S.wx).filter(d => d <= k && gapDays(d, k) < 45 && f(d) != null).sort();
    const week = keys.filter(d => gapDays(d, k) < 7).map(f), base = keys.filter(d => gapDays(d, k) >= 7).slice(-28).map(f);
    const back = x => log ? Math.exp(x) : x, out = { n: keys.length, now: S.wx[k]?.[field] ?? null };
    if (base.length < 10) return Object.assign(out, { need: 10 - base.length });
    const m = mean(base), s = sd(base);
    Object.assign(out, { base: back(m), sd: s, lo: back(m - Math.max(0.5 * s, log ? 0.03 : 0.2)), hi: back(m + Math.max(0.5 * s, log ? 0.03 : 0.2)) });
    if (week.length >= 3) { const r = mean(week); out.roll = back(r); out.state = r < m - Math.max(0.5 * s, log ? 0.03 : 0.2) ? 'low' : r > m + Math.max(0.5 * s, log ? 0.03 : 0.2) ? 'high' : 'normal'; }
    if (out.now != null) out.z = s ? ((log ? Math.log(out.now) : out.now) - m) / s : 0;
    return out;
  });
}
// Resting heart rate this week against the three weeks before.
function rhrTrend(k = todayKey()) {
  const vals = ks => ks.map(d => restingHR(d)?.v).filter(v => v != null);
  const now = vals(range(7, k)), base = vals(range(21, shift(k, -7)));
  return { now: now.length ? mean(now) : null, delta: now.length >= 3 && base.length >= 7 ? mean(now) - mean(base) : null, n: now.length };
}
// One verdict for the day from everything that bears on recovery. Each reason carries its weight and evidence.
function readiness(k = todayKey()) {
  return cached('R' + k, () => {
    const V = hrvState(k), R = rhrTrend(k), sl = sleepOn(k), why = [];
    if (V.state === 'low') why.push([3, `HRV 7-day average ${Math.round(V.roll)} ms, below your range of ${Math.round(V.lo)}–${Math.round(V.hi)}${V.hrDelta == null ? '' : V.hrDelta >= 3 ? `, with morning heart rate ${sign(V.hrDelta)} bpm: the usual pattern of fatigue, illness, short sleep or alcohol` : `; morning heart rate is not raised (${sign(V.hrDelta)} bpm), so this is the weaker pattern`}`, 'hrv']);
    else if (V.day === 'low') why.push([1, `This morning's HRV ${r1(V.now.rmssd)} ms is below your range; the weekly average is still normal`, 'hrv']);
    if (R.delta != null && R.delta >= 5) why.push([2, `Resting heart rate ${sign(R.delta)} bpm above the previous three weeks`, 'rhr']);
    else if (R.delta != null && R.delta >= 3) why.push([1, `Resting heart rate ${sign(R.delta)} bpm above the previous three weeks`, 'rhr']);
    if (sl != null && sl < 6) why.push([1, `${r1(sl)} h of sleep last night`, 'sleep']);
    else { const n3 = range(3, k).map(sleepOn).filter(v => v != null); if (n3.length === 3 && mean(n3) < 6.5) why.push([1, `${r1(mean(n3))} h of sleep a night over the last three`, 'sleep']); }
    const sx = S.sleepx[k], sh = sleepStats(28, shift(k, -1));
    if (sx?.hr && sh.hr && sx.hr - sh.hr >= 4) why.push([1, `Sleeping heart rate ${Math.round(sx.hr)}, ${Math.round(sx.hr - sh.hr)} above your 4-week average`, 'rhr']);
    // The watch overnight: only when the strap has no verdict of its own this week, and never more than a nudge.
    const WH = nightly('hv', k, true), BR = nightly('br', k);
    if (!V.state && WH.state === 'low') why.push([1, `The watch's overnight HRV, 7-day average ${Math.round(WH.roll)} ms, is below its own range of ${Math.round(WH.lo)}–${Math.round(WH.hi)}`, 'night']);
    // A day without a morning check: last night stands in, read against the watch's own nights, and still only a nudge.
    else if (!V.now && WH.z != null && WH.z <= -1.5) why.push([1, `No morning check today, and the watch's overnight HRV last night (${Math.round(WH.now)} ms) is well below its usual ${Math.round(WH.base)}`, 'night']);
    // Breathing rate during sleep rises with fever and infection, often before you feel it (Natarajan 2020).
    if (BR.now != null && BR.base != null && BR.now - BR.base >= Math.max(1, 2 * BR.sd)) why.push([1, `Breathing rate in sleep ${r1(BR.now)} a minute, ${r1(BR.now - BR.base)} above your usual ${r1(BR.base)}`, 'night']);
    const score = why.reduce((a, w) => a + w[0], 0), known = V.state || WH.state || R.delta != null || sl != null;
    const level = !known ? 'unknown' : score >= 3 ? 'easy' : score >= 1 ? 'care' : 'go';
    const src = { strap: !!V.now, week: !!V.state, night: sl != null || !!sx || !!S.wx[k] };
    return { level, why: why.sort((a, b) => b[0] - a[0]), V, R, WH, BR, src };
  });
}

// ---------- wear time ----------
// How long the watch was on the wrist each day. A day's steps, or a night's sleep, from a watch that spent half of it
// on the table is not that day; accelerometer studies count a day only at 10 hours worn and a week only with 4 such
// days, with non-wear as any hour or more with nothing recorded (Troiano 2008). Here "nothing" is no heart rate in a
// 5-minute bin (S.hrd, the last 45 days), or, for older days, the worn minutes a history file gave (wx.wm: a minute
// with a step or a heart rate). A day with neither is unknown: kept, never called valid.
const WEAR_H = 10, WEAR_WEEK = 4, NONWEAR_BINS = 12;
// Minutes worn in a day of 288 five-minute bins: all of it except runs of an hour or more without a reading.
function wornMin(bins, upTo = 288) {
  let off = 0, gap = 0;
  for (let i = 0; i <= upTo; i++) {
    if (i < upTo && !bins[i]) gap++;
    else { if (gap >= NONWEAR_BINS) off += gap; gap = 0; }
  }
  return (upTo - off) * 5;
}
function wear(k) {
  return cached('WR' + k, () => {
    const now = new Date(), today = k === todayKey(), upTo = today ? Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) : 288;
    if (S.hrd[k]) return { min: wornMin(S.hrd[k], upTo), src: 'hr', today };
    const wm = S.wx[k]?.wm;
    return wm != null ? { min: wm, src: 'file', today } : null;
  });
}
// true: worn 10 h or more. false: worn less (today only once the day is over). null: not known.
function validDay(k) {
  const w = wear(k);
  if (!w) return null;
  return w.min >= WEAR_H * 60 ? true : w.today ? null : false;
}
// The day's steps for any trend or model: none from a day the watch was worn under 10 h. A count you typed stands.
function stepsOn(k) { const v = S.steps[k]; return v == null ? null : S.manual.steps[k] || validDay(k) !== false ? v : null; }
// A run of days read for steps: the values that count, and how many were left out for wear.
function stepRun(days) {
  const vals = [], out = [];
  for (const k of days) if (S.steps[k] != null) { const v = stepsOn(k); if (v == null) out.push(k); else vals.push(v); }
  return { vals, out, valid: days.filter(k => S.steps[k] != null && validDay(k) === true).length };
}
// Was the watch on through the night? A gap of an hour or more without heart rate inside the sleep window means the
// "sleep" may be a watch lying still; the night is then left out. Unknown (no 5-minute data for it) keeps the night.
function nightWorn(k) {
  return cached('NW' + k, () => {
    const x = S.sleepx[k];
    if (!x || x.on == null) return null;
    const len = x.off != null && x.off > x.on ? x.off - x.on : x.bed || x.d + x.l + x.r + x.w;
    if (!len) return null;
    const a = S.hrd[shift(k, -1)], b = S.hrd[k];
    let gap = 0, worst = 0;
    for (let m = Math.floor(x.on / 5) * 5; m < x.on + len; m += 5) {
      const bins = m < 0 ? a : b, i = m < 0 ? 288 + m / 5 : m / 5;
      if (!bins || i < 0 || i >= 288) return null;
      gap = bins[i] ? 0 : gap + 1; worst = Math.max(worst, gap);
    }
    return worst < NONWEAR_BINS;
  });
}
// The night's sleep for any conclusion: none from a night the watch was off for an hour or more. Typed sleep stands.
function sleepOn(k) { const v = S.sleep[k]; return v == null ? null : S.manual.sleep[k] || nightWorn(k) !== false ? v : null; }
// Days and nights left out for wear in a run of days, in words: "3 days left out: watch worn under 10 h".
function wearNote(days, nights = false) {
  const d = days.filter(k => S.steps[k] != null && stepsOn(k) == null).length, n = nights ? days.filter(k => S.sleep[k] != null && sleepOn(k) == null).length : 0;
  return [d ? `${plural(d, 'day')} left out: watch worn under ${WEAR_H} h` : '', n ? `${plural(n, 'night')} left out: watch off during it` : ''].filter(Boolean).join('; ');
}

// ---------- sleep ----------
function midpoint(k) {
  if (nightWorn(k) === false && !S.manual.sleep[k]) return null;
  const x = S.sleepx[k];
  if (!x || x.on == null) return null;
  return x.on + (x.bed || x.d + x.l + x.r + x.w || (S.sleep[k] || 0) * 60) / 2;
}
function sleepStats(n = 14, end = todayKey()) {
  return cached(`L${n}${end}`, () => {
    const ks = range(n, end).filter(k => sleepOn(k) != null), X = ks.map(k => S.sleepx[k]).filter(Boolean);
    const mids = ks.map(midpoint).filter(v => v != null), ons = X.map(x => x.on).filter(v => v != null);
    const effs = X.filter(x => x.bed || x.w).map(x => (x.d + x.l + x.r) / (x.bed || x.d + x.l + x.r + x.w) * 100).filter(v => v > 0 && v <= 100);
    const staged = X.filter(x => x.d + x.r > 0), st = staged.reduce((a, x) => { a.d += x.d; a.l += x.l; a.r += x.r; return a; }, { d: 0, l: 0, r: 0 });
    const tot = st.d + st.l + st.r, hrs = ks.map(k => S.sleepx[k]?.hr).filter(Boolean);
    return {
      n: ks.length, avg: ks.length ? mean(ks.map(sleepOn)) : null, out: range(n, end).filter(k => S.sleep[k] != null && sleepOn(k) == null).length,
      eff: effs.length >= 3 ? mean(effs) : null, mid: mids.length >= 3 ? mean(mids) : null,
      midSd: mids.length >= 5 ? sd(mids) : null, onSd: ons.length >= 5 ? sd(ons) : null,
      stages: staged.length >= 3 ? { d: st.d / tot * 100, l: st.l / tot * 100, r: st.r / tot * 100, n: staged.length } : null,
      hr: hrs.length >= 3 ? mean(hrs) : null,
    };
  });
}

// ---------- activity ----------
const STRENGTH = /strength|weight|lift|calisthenics|crossfit/i, CALM = /yoga|stretch|breath|pilates|meditat/i;
function overlapMs(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }
// Strap sessions and watch workouts for a day. A watch workout recorded alongside a strap session is dropped:
// the strap is the better instrument. Watch heart rate is corrected by the learned offset once there are 3 paired workouts.
function sessions(k) {
  return cached('X' + k, () => {
    const H = hrProfile(), C = calibration(), bias = C.exOn ? C.ex.bias : 0;
    const strap = (S.cardio[k] || []).map((c, i) => ({ src: c.m ? 'manual' : 'strap', i, kind: (KINDS.find(x => x[0] === c.kind) || KINDS[KINDS.length - 1])[1], t: c.t, dur: c.dur, avg: c.avg ?? null, max: c.max ?? null, z: c.z, eff: c.eff }));
    const watch = (S.ex[k] || []).filter(w => !strap.some(c => c.t && overlapMs(c.t, c.t + c.dur * 1000, w.s, w.e) > 0.5 * Math.min(c.dur * 1000, w.e - w.s))).map(w => {
      const z = [0, 0, 0, 0], d = (w.e - w.s) / 1000;
      let sum = 0, secs = 0, max = 0;
      for (const [b, s] of w.h) { const c = b - bias; z[zoneOf(c, H)] += s; sum += c * s; secs += s; max = Math.max(max, c); }
      const noHr = secs < 60;
      if (noHr && !STRENGTH.test(w.k) && !CALM.test(w.k)) z[1] = d;   // a deliberate workout with no heart rate counts as moderate
      return { src: 'watch', kind: w.og ? w.ti || 'openGym workout' : w.k, app: w.src, og: !!w.og, t: w.s, dur: d, avg: secs ? sum / secs : null, max: max || null, z, noHr, corrected: !!bias && !noHr, strength: w.og || STRENGTH.test(w.k) };
    });
    return [...strap, ...watch].sort((a, b) => (a.t || 0) - (b.t || 0));
  });
}
// The heart rate the watch saw during a lifting day's session: the openGym workout Health Connect has for that day,
// or failing that any strength workout the watch recorded.
function liftHr(k) {
  const ss = sessions(k).filter(x => x.src === 'watch' && x.strength && !x.noHr);
  const L = S.lifts[k], near = L?.t0 ? ss.find(x => overlapMs(x.t, x.t + x.dur * 1000, L.t0, L.t1 || L.t0 + 36e5) > 0) : null;
  return near || ss.find(x => x.og) || ss[0] || null;
}
function liftedOn(k) { return !!S.lifts[k] || sessions(k).some(s => s.strength); }
// WHO: moderate minutes plus twice the vigorous, and muscle-strengthening days.
function activityWeek(end = todayKey()) {
  return cached('A' + end, () => {
    let mod = 0, vig = 0, n = 0;
    for (const k of range(7, end)) for (const s of sessions(k)) { mod += s.z[1] / 60; vig += (s.z[2] + s.z[3]) / 60; n++; }
    return { mod, vig, who: mod + 2 * vig, n, strengthDays: range(7, end).filter(liftedOn).length };
  });
}
// ---------- energy ledger ----------
function energy() {
  const T = targets(), M = T.model, full = range(21).filter(k => S.food[k] && isComplete(k));
  const delta = T.slope == null ? null : T.slope * T.rho, implied = M.E != null && M.conf !== 'calibrating' ? M.E : null;
  const watch = range(21).map(k => S.wx[k]?.tk).filter(v => v != null);
  return { n: full.length, intake: T.intake, delta, implied, sd: M.sd, gap: implied == null ? null : (implied - T.formula) / T.formula * 100, watch: watch.length >= 7 ? mean(watch) : null, M };
}

// ---------- body: where the trend is heading ----------
function projection() {
  return cached('P', () => {
    const p = S.profile, T = targets(), cut = p.sex === 'm' ? 90 : 80;
    const pts = [[p.w0, p.waist0], ...Object.keys(S.waist).sort().map(k => [trendOn(k), S.waist[k]]).filter(x => x[0] != null)];
    const spread = Math.max(...pts.map(x => x[0])) - Math.min(...pts.map(x => x[0]));
    const fit = pts.length >= 3 && spread >= 2 ? linfit(pts) : null, perKg = fit && fit.m > 0.2 && fit.m < 3 ? fit.m : null;
    const waistNow = S.waist[Object.keys(S.waist).sort().pop()] ?? p.waist0, rate = T.slope == null ? null : T.slope * 7;
    const h2 = (p.h / 100) ** 2, goals = [];
    const next = Math.floor(T.wt / 5) * 5; if (T.wt - next >= 0.5) goals.push([`${next} kg`, next]);
    if (perKg && waistNow > cut) goals.push([`Waist ${cut} cm`, T.wt - (waistNow - cut) / perKg]);
    for (const b of [25, 23]) if (T.bmi > b) goals.push([`BMI ${b}`, b * h2]);
    const items = goals.filter(g => g[1] < T.wt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label, kg]) => {
      const weeks = rate != null && rate < -0.05 ? (T.wt - kg) / -rate : null, CI = slopeCI();
      // The range: the faster and slower ends of the slope's interval. A slow end that is not falling has no date.
      const wFast = CI && CI.lo < -0.05 / 7 ? (T.wt - kg) / (-CI.lo * 7) : null, wSlow = CI && CI.hi < -0.05 / 7 ? (T.wt - kg) / (-CI.hi * 7) : null;
      const at = w => w != null && w < 260 ? shift(todayKey(), Math.round(w * 7)) : null;
      return { label, kg, togo: T.wt - kg, weeks, date: at(weeks), early: weeks != null ? at(wFast) : null, late: weeks != null ? at(wSlow) : null, open: weeks != null && wSlow == null };
    });
    return { perKg, n: pts.length, rate, waistNow, cut, items };
  });
}

// Loaded: this file ran to the end.
(self.LOADED ||= []).push('model.js');
