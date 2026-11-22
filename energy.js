'use strict';
// How much you actually burn, worked out from your own scale and your own food log.
//
// The method is intake-balance: energy in, minus the energy stored or released as the body changes, is energy out.
// Done with a laboratory it needs doubly labelled water and DXA scans; done with a model of human metabolism it needs
// only repeated weigh-ins, and in the CALERIE trial that model came within 40 kcal/d of the DLW/DXA method on average
// (Sanghvi 2015). Health runs the same idea as a Kalman filter over two hidden quantities, your true weight and your
// daily burn, and lets every weigh-in and every completely logged day pull on both:
//
//   weight tomorrow = weight today + (eaten − burned − the steps that day above your usual) / ρ
//   burn tomorrow   = burn today + a small random drift (adaptation, a new job, more walking)
//
// ρ, the energy in a kilogram of body change, is not the folklore 7,700 kcal: the share of a change that is fat
// depends on how much fat there is (Forbes: dFFM/dFM = 10.4/FM), and fat holds 9,440 kcal/kg against 1,816 for lean
// tissue with its water (Hall 2008). Body fat comes from the waist and height (Relative Fat Mass, DXA-calibrated,
// Woolcott 2018), or from the BMI equation when there is no waist.
//
// The burn is "what your log implies": if your entries run low, the burn comes out low by the same amount, so the
// target built on it still lands where it should. Days not logged completely carry no intake, only uncertainty, so
// they slow the learning down rather than bias it. The 95% interval narrows with every honest week of data.

const RHO_FAT = 9440, RHO_LEAN = 1816, FORBES_C = 10.4;

// Body fat %, with where it came from. RFM = 64 − 20 × height/waist (+12 for women).
function bodyFat(k = todayKey()) {
  return cached('BF' + k, () => {
    const p = S.profile, wk = Object.keys(S.waist).filter(d => d <= k).sort().pop();
    const waist = wk ? S.waist[wk] : p.waist0;
    if (waist) {
      const v = 64 - 20 * p.h / waist + (p.sex === 'f' ? 12 : 0);
      if (v > 3 && v < 65) return { pct: v, src: 'rfm', waist, at: wk || null };
    }
    const wt = trendOn(k) ?? p.w0, bmi = wt / (p.h / 100) ** 2;
    return { pct: clamp(1.2 * bmi + 0.23 * ageYears() - 10.8 * (p.sex === 'm' ? 1 : 0) - 5.4, 5, 60), src: 'bmi' };
  });
}
// kcal in one kilogram of change at this weight and fat mass, and the share of it that is fat.
function rhoOf(wt, pct) {
  const fm = Math.max(2, wt * pct / 100), fat = fm / (fm + FORBES_C);
  return { rho: fat * RHO_FAT + (1 - fat) * RHO_LEAN, fat, fm };
}
// The textbook burn: Mifflin-St Jeor × 1.2 for the day, the steps you take, and the training you do.
function formulaBurn(wt, steps, perWk) {
  const p = S.profile, bmr = 10 * wt + 6.25 * p.h - 5 * ageYears() + (p.sex === 'm' ? 5 : -161);
  return { bmr, tdee: bmr * 1.2 + steps * 0.0004 * wt + perWk * 250 / 7 };
}

// Scale noise: how far single weigh-ins sit from their own running median, as an SD (from the median absolute
// deviation, so a few wild readings cannot inflate it). Water, salt and gut contents, mostly.
function scaleNoise(keys) {
  if (keys.length < 8) return 0.7;
  const res = keys.map((k, i) => {
    const win = keys.filter(d => Math.abs(gapDays(d, k)) <= 3).map(d => S.weights[d]);
    return win.length >= 3 ? S.weights[k] - median(win) : null;
  }).filter(v => v != null);
  if (res.length < 6) return 0.7;
  const mad = median(res.map(Math.abs));
  // The running median absorbs part of each reading's own deviation, so the raw MAD under-reads the noise a little.
  return clamp(mad * 1.4826 * 1.25, 0.3, 1.4);
}

function energyModel(end = todayKey()) {
  return cached('EM' + end, () => {
    const p = S.profile, wkeys = Object.keys(S.weights).filter(k => k <= end).sort();
    const startCap = shift(end, -180), first = wkeys.find(k => k >= startCap);
    const stepsAll = stepRun(range(28, end)).vals, stepMean = stepsAll.length ? mean(stepsAll) : 4000;
    const firstLift = Object.keys(S.lifts).sort()[0], perWk = firstLift && gapDays(firstLift, end) >= 28 ? range(28, end).filter(liftedOn).length / 4 : p.days;
    const wNow = trendOn(end) ?? p.w0, F = formulaBurn(wNow, stepMean, perWk);
    const out = { formula: F.tdee, bmr: F.bmr, perWk, stepMean, hist: [], nW: 0, nI: 0, days: 0 };
    if (!first) return Object.assign(out, { E: null, conf: 'none' });

    const recent = wkeys.filter(k => k >= first), R = scaleNoise(recent) ** 2;
    // Start: the first weigh-in, and the formula's burn with the equation's own error (about 300 kcal in individuals).
    let W = S.weights[first], E = formulaBurn(W, stepMean, perWk).tdee;
    let P = [[R, 0], [0, 300 ** 2]];
    const QE = 22 ** 2, SIG_LOG = 320, SIG_UNK = 750;
    const known = [];
    for (let k = first; k <= end; k = shift(k, 1)) {
      // Morning: the scale, if you stood on it. A reading more than four standard errors out counts for a tenth.
      const y = S.weights[k];
      if (y != null) {
        const inn = y - W, Sv = P[0][0] + R, big = Math.abs(inn) > 4 * Math.sqrt(Sv), Sx = big ? P[0][0] + R * 10 : Sv;
        const K0 = P[0][0] / Sx, K1 = P[1][0] / Sx;
        W += K0 * inn; E += K1 * inn;
        P = [[P[0][0] - K0 * P[0][0], P[0][1] - K0 * P[0][1]], [P[1][0] - K1 * P[0][0], P[1][1] - K1 * P[0][1]]];
        out.nW++;
      }
      const bf = bodyFat(k), r = rhoOf(W, bf.pct);
      out.hist.push({ k, W, E, sdE: Math.sqrt(Math.max(0, P[1][1])), sdW: Math.sqrt(Math.max(0, P[0][0])) });
      if (k === end) { out.rho = r.rho; out.fatShare = r.fat; out.fm = r.fm; out.bf = bf; break; }
      // The day: what you ate (complete days only), and the steps above or below your usual.
      const full = S.food[k] && isComplete(k), I = full ? totals(k).k : null;
      if (I != null) { known.push(I); out.nI++; }
      const fill = known.length ? mean(known.slice(-28)) : E;
      // A day worn under 10 h says nothing about its steps: it moves the burn by nothing, like a day without steps.
      const st = stepsOn(k), stepAdj = st != null ? 0.0004 * W * (st - stepMean) : 0;
      const ink = I ?? fill, sig = I != null ? SIG_LOG : SIG_UNK;
      W += (ink - E - stepAdj) / r.rho;
      const a = -1 / r.rho;
      // P ← F P Fᵀ + Q, with F = [[1, a], [0, 1]].
      const p00 = P[0][0] + 2 * a * P[0][1] + a * a * P[1][1], p01 = P[0][1] + a * P[1][1], p11 = P[1][1];
      P = [[p00 + (sig / r.rho) ** 2, p01], [p01, p11 + QE]];
      out.days++;
    }
    const last = out.hist[out.hist.length - 1], sd = last.sdE;
    Object.assign(out, {
      E: last.E, sd, lo: last.E - 1.96 * sd, hi: last.E + 1.96 * sd, W: last.W, sdW: last.sdW, noise: Math.sqrt(R),
      conf: out.nI < 7 || out.nW < 6 ? 'calibrating' : sd > 200 ? 'rough' : sd > 120 ? 'good' : 'tight',
      gap: (last.E - F.tdee) / F.tdee * 100,
    });
    // The trend's own rate, from the filter's weight 14 days apart.
    const back = out.hist.find(h => gapDays(h.k, end) <= 14);
    if (back && back !== last && gapDays(back.k, end) >= 7) out.rate = (last.W - back.W) / gapDays(back.k, end) * 7;
    // Energy balance over the last 7 complete days, at today's burn.
    const wk = range(7, end).filter(k => S.food[k] && isComplete(k));
    if (wk.length >= 3) { out.week = { n: wk.length, intake: mean(wk.map(k => totals(k).k)) }; out.week.bal = out.week.intake - out.E; }
    return out;
  });
}
// One sentence on how sure the burn is, for the screens.
function burnWords(M) {
  if (!M || M.E == null) return 'Weigh in and log full days: the burn is learned from both.';
  if (M.conf === 'calibrating') return `Learning: ${plural(M.nW, 'weigh-in')} and ${plural(M.nI, 'complete day')} so far. Until about 2 weeks of both, it leans on the formula.`;
  return `Within ±${fmt(1.96 * M.sd)} kcal (95%), from ${plural(M.nW, 'weigh-in')} and ${plural(M.nI, 'complete day')} of food.`;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('energy.js');
