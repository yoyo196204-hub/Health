'use strict';
// One strap recording, read the way dedicated HRV software reads it. Pure functions: nothing here touches app data,
// so every number is tested on its own (test/run.js).
//
// A recording keeps the beats exactly as the strap sent them (RR in its own 1/1024 s units) and, for each Bluetooth
// packet, which beat it ended on and when the phone received it. From those:
//  - the clock: beat times come from the intervals themselves (the heart's own clock, exact to the strap's 1 ms
//    resolution); the packet times only find where beats were lost in transit (time moved on with no beats), which
//    becomes a gap that no beat-to-beat difference is ever taken across;
//  - the corrected series: artefacts corrected as hrv.js does (Lipponen & Tarvainen 2019), then your edits on top,
//    which never change what was recorded: a trim, stretches excluded, a single beat dropped or kept as recorded;
//  - runs: the stretches of included, contiguous beats. Every measure is worked out over runs, so an excluded stretch
//    or a gap is never bridged by a fake successive difference.
// Measures and minimum lengths follow the Task Force (1996) and Shaffer & Ginsberg (2017); DFA follows Peng (1995),
// with α1 thresholds from Rogers (2021); the 30:15 ratio from Ewing (1978, 1985); TRIMP from Edwards (1993).

const SX_GAP = 0.7;   // seconds the packet clock may run ahead of the beats before it counts as beats lost

// ---------- the recording as beats on a clock ----------
function recRaw(r) {
  if (Array.isArray(r?.ru) && r.ru.length) return r.ru.map(u => u * 1000 / 1024);
  return Array.isArray(r?.rr) ? r.rr.slice() : [];
}
// End time of every raw beat, in seconds from the recording's start, and the gaps where beats were lost.
function recClock(r, raw) {
  const n = raw.length, E = new Float64Array(n), gaps = [];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += raw[i] / 1000; E[i] = acc; }
  const pk = Array.isArray(r?.pk) ? r.pk.filter(p => Array.isArray(p) && p[0] >= 0 && p[0] < n && Number.isFinite(p[1])) : [];
  if (pk.length < 2) return { E, gaps };
  // offset: how far the packet clock runs ahead of the beat clock. It starts where the first packet puts it; a jump
  // of more than SX_GAP that the next packet confirms is beats that never arrived.
  // A late packet alone (the phone was busy) is not a gap: the lead must hold for this packet and the next two
  // (or as many as remain), and the gap is the smallest lead among them, so jitter never adds time.
  // off follows the two clocks slowly (a strap's crystal and the phone's differ by a few seconds a day at most).
  let off = pk[0][1] / 1000 - E[pk[0][0]], lastI = pk[0][0];
  const lead = j => pk[j][1] / 1000 - E[pk[j][0]] - off;
  for (let j = 1; j < pk.length; j++) {
    const i = pk[j][0];
    if (i <= lastI) continue;
    let jump = Infinity;
    for (let q = j; q < Math.min(pk.length, j + 3); q++) if (pk[q][0] > lastI) jump = Math.min(jump, lead(q));
    if (jump > SX_GAP && jump < Infinity) {
      // Everything from the first beat of this packet on moves later by the jump. E is shifted in place, so the
      // leads read after this already include it.
      const g0 = E[lastI];
      gaps.push([g0, g0 + jump]);
      for (let k = lastI + 1; k < n; k++) E[k] += jump;
    } else { const l = lead(j); if (Math.abs(l) < SX_GAP) off += 0.02 * l; }
    lastI = i;
  }
  return { E, gaps };
}
function inSpans(t, spans) { for (const [a, b] of spans) if (t >= a && t < b) return true; return false; }
function lowerBound(T, v) { let lo = 0, hi = T.length; while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < v) lo = m + 1; else hi = m; } return lo; }

// The series every measure reads: corrected beats with their times, what was done to each, and which are included.
// fix: 0 as recorded, 1 missed, 2 extra, 3 ectopic, 4 irregular, 5 out of range, 6 kept as recorded by you.
function recSeries(r) {
  const raw = recRaw(r), n0 = raw.length;
  if (n0 < 3) return null;
  const { E, gaps } = recClock(r, raw), C = rrClean(raw), ed = r.edits || {}, ov = ed.beat || {};
  // Groups: the corrected beats that came from one raw beat, and the raw beats each group covers.
  const G = [];
  for (let k = 0; k < C.rr.length; k++) {
    if (k && C.src[k] === C.src[k - 1]) { G[G.length - 1].k1 = k + 1; continue; }
    G.push({ s: C.src[k], k0: k, k1: k + 1 });
  }
  G.forEach((g, j) => { g.e = j + 1 < G.length ? G[j + 1].s : n0; });
  const rr = [], fix = [], src = [], T = [], drop = [];
  for (const g of G) {
    const keep = [], dr = [];
    for (let i = g.s; i < g.e; i++) { if (ov[i] === 'keep') keep.push(i); if (ov[i] === 'drop') dr.push(i); }
    const fixed = C.fix.slice(g.k0, g.k1).some(Boolean);
    if (keep.length && fixed) {
      for (let i = g.s; i < g.e; i++) { rr.push(raw[i]); fix.push(6); src.push(i); T.push(E[i]); drop.push(dr.length ? 1 : 0); }
      continue;
    }
    let t = E[g.s] - raw[g.s] / 1000;
    for (let k = g.k0; k < g.k1; k++) { t += C.rr[k] / 1000; rr.push(C.rr[k]); fix.push(C.fix[k]); src.push(g.s); T.push(t); drop.push(dr.length ? 1 : 0); }
  }
  const n = rr.length, dur = Math.max(E[n0 - 1], T[n - 1] || 0);
  const trim = Array.isArray(ed.trim) ? ed.trim : null, ex = Array.isArray(ed.ex) ? ed.ex : [];
  const inc = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const c = T[k] - rr[k] / 2000;
    inc[k] = drop[k] || (trim && (c < trim[0] || c > trim[1])) || inSpans(c, ex) ? 0 : 1;
  }
  // Runs of included beats that follow each other with no time between them.
  const runs = [];
  let a = -1;
  for (let k = 0; k <= n; k++) {
    const cont = k < n && inc[k] && a >= 0 && Math.abs(T[k] - rr[k] / 1000 - T[k - 1]) < 0.25;
    if (k < n && inc[k] && a < 0) { a = k; continue; }
    if (cont) continue;
    if (a >= 0) runs.push([a, k]);
    a = k < n && inc[k] ? k : -1;
  }
  return { raw, E, rr, T: Float64Array.from(T), fix: Uint8Array.from(fix), src, inc, runs, gaps, dur, C, n };
}
function runsIn(X, a = 0, b = X.n) {
  const out = [];
  for (const [i0, i1] of X.runs) { const x = Math.max(a, i0), y = Math.min(b, i1); if (y > x) out.push([x, y]); }
  return out;
}
// Corrected-beat index range whose beat centres fall in [t0, t1) seconds.
function idxAt(X, t0, t1) {
  const c = k => X.T[k] - X.rr[k] / 2000;
  let lo = 0, hi = X.n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (c(m) < t0) lo = m + 1; else hi = m; }
  let lo2 = lo, hi2 = X.n;
  while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (c(m) < t1) lo2 = m + 1; else hi2 = m; }
  return [lo, lo2];
}

// ---------- the measures ----------
// Time domain and Poincaré over runs. Successive differences only inside a run.
function statsRuns(rr, runs) {
  let n = 0, s = 0, ss = 0, nd = 0, d2 = 0, dsum = 0, n50 = 0, n20 = 0, lo = Infinity, hi = -Infinity;
  for (const [a, b] of runs) for (let i = a; i < b; i++) {
    const x = rr[i]; n++; s += x; ss += x * x; if (x < lo) lo = x; if (x > hi) hi = x;
    if (i > a) { const d = x - rr[i - 1]; nd++; d2 += d * d; dsum += d; const ad = Math.abs(d); if (ad > 50) n50++; if (ad > 20) n20++; }
  }
  if (n < 10 || nd < 5) return null;
  const m = s / n, sdnn = Math.sqrt(Math.max(0, (ss - n * m * m) / (n - 1))), rmssd = Math.sqrt(d2 / nd);
  const sdsd = Math.sqrt(Math.max(0, (d2 - dsum * dsum / nd) / Math.max(1, nd - 1)));
  const sd1 = Math.SQRT1_2 * sdsd, sd2 = Math.sqrt(Math.max(0, 2 * sdnn * sdnn - 0.5 * sdsd * sdsd));
  return { n, nd, dur: s / 1000, rr: m, hr: 60000 / m, rmssd, ln: Math.log(rmssd), sdnn, sdsd, pnn50: n50 / nd * 100, pnn20: n20 / nd * 100,
    sd1, sd2, ratio: sd2 ? sd1 / sd2 : null, cv: sdnn / m * 100, minHr: 60000 / hi, maxHr: 60000 / lo };
}
// HRV triangular index: all beats over the height of their histogram's tallest bin (1/128 s bins, Task Force).
function triIndex(rr, runs) {
  const h = new Map();
  let n = 0;
  for (const [a, b] of runs) for (let i = a; i < b; i++) { const bin = Math.floor(rr[i] / 7.8125); h.set(bin, (h.get(bin) || 0) + 1); n++; }
  const top = Math.max(0, ...h.values());
  return top ? n / top : null;
}
// Lomb–Scargle periodogram of values y sampled at times t (s), linear trend removed, scaled so the bands add up to
// the variance: no resampling, and gaps are simply time with no samples.
function lombScargleT(t, y0, fmax = 0.5, df = 0.002) {
  const n = t.length;
  if (n < 20) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += t[i]; sy += y0[i]; sxx += t[i] * t[i]; sxy += t[i] * y0[i]; }
  const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), ic = (sy - sl * sx) / n;
  const y = new Float64Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) { y[i] = y0[i] - (ic + sl * t[i]); v += y[i] * y[i]; }
  v /= Math.max(1, n - 1);
  const fs = [], P = [];
  for (let f = df; f <= fmax + 1e-9; f += df) {
    const w = 2 * Math.PI * f;
    let s2 = 0, c2 = 0;
    for (let i = 0; i < n; i++) { s2 += Math.sin(2 * w * t[i]); c2 += Math.cos(2 * w * t[i]); }
    const tau = Math.atan2(s2, c2) / (2 * w);
    let yc = 0, ys = 0, cc = 0, ss = 0;
    for (let i = 0; i < n; i++) { const a = w * (t[i] - tau), c = Math.cos(a), s = Math.sin(a); yc += y[i] * c; ys += y[i] * s; cc += c * c; ss += s * s; }
    fs.push(f); P.push(0.5 * (yc * yc / (cc || 1) + ys * ys / (ss || 1)));
  }
  const tot = P.reduce((a, b) => a + b, 0) * df, k = tot ? v / tot : 0;
  return { f: fs, p: P.map(x => x * k), df, dur: t[n - 1] - t[0] };
}
function specOf(X, runs, fmax = 0.45, df = 0.002) {
  const t = [], y = [];
  for (const [a, b] of runs) for (let i = a; i < b; i++) { t.push(X.T[i]); y.push(X.rr[i]); }
  return lombScargleT(t, y, fmax, df);
}
// Detrended fluctuation analysis: the scaling exponent over box sizes lo..hi beats.
function dfaAlpha(rr, lo, hi) {
  const n = rr.length;
  if (n < hi * 4 || n < 60) return null;
  const m = mean(rr);
  let acc = 0;
  const Y = rr.map(x => (acc += x - m)), pts = [];
  for (let s = lo; s <= hi; s++) {
    const boxes = Math.floor(n / s);
    if (boxes < 4) continue;
    let f = 0;
    const sx = s * (s - 1) / 2, sxx = (s - 1) * s * (2 * s - 1) / 6, d = s * sxx - sx * sx;
    for (let b = 0; b < boxes; b++) {
      let sy = 0, sxy = 0;
      for (let i = 0; i < s; i++) { const v = Y[b * s + i]; sy += v; sxy += i * v; }
      const sl = (s * sxy - sx * sy) / d, ic = (sy - sl * sx) / s;
      for (let i = 0; i < s; i++) { const r = Y[b * s + i] - (ic + sl * i); f += r * r; }
    }
    pts.push([Math.log10(s), Math.log10(Math.sqrt(f / (boxes * s)))]);
  }
  const fit = pts.length >= 3 ? linfit(pts) : null;
  return fit && Number.isFinite(fit.m) ? fit.m : null;
}
function concat(rr, runs) { const o = []; for (const [a, b] of runs) for (let i = a; i < b; i++) o.push(rr[i]); return o; }
function fixedIn(X, runs) { let f = 0, n = 0; for (const [a, b] of runs) for (let i = a; i < b; i++) { n++; if (X.fix[i] && X.fix[i] !== 6) f++; } return { f, n, share: n ? f / n : 0 }; }

// Everything for beats [a, b) of a series: time domain, Poincaré, spectrum, DFA and the signal behind them. Each
// measure appears only when the stretch is long enough for it to mean something.
function analyse(X, a = 0, b = X.n, spectrum = true) {
  const runs = runsIn(X, a, b), M = statsRuns(X.rr, runs);
  if (!M) return null;
  const F = fixedIn(X, runs), span = b > a ? X.T[b - 1] - (X.T[a] - X.rr[a] / 1000) : 0;
  const out = Object.assign(M, { span, q: Math.round((1 - F.share) * 100), fixed: F.f, runs: runs.length });
  if (M.dur >= 240) out.tri = triIndex(X.rr, runs);
  const flat = concat(X.rr, runs);
  if (flat.length >= 100) { const a1 = dfaAlpha(flat, 4, 16); if (a1 != null) out.a1 = a1; }
  if (flat.length >= 300) { const a2 = dfaAlpha(flat, 16, 64); if (a2 != null) out.a2 = a2; }
  if (spectrum && M.dur >= 55) {
    const S = specOf(X, runs);
    if (S) {
      out.spec = S;
      out.hf = bandPower(S, BAND.hf);
      if (M.dur >= 110) { out.lf = bandPower(S, BAND.lf); out.lfhf = out.hf ? out.lf / out.hf : null; out.lfnu = out.lf + out.hf ? out.lf / (out.lf + out.hf) * 100 : null; out.hfnu = out.lfnu != null ? 100 - out.lfnu : null; }
      if (M.dur >= 290) { out.vlf = bandPower(S, BAND.vlf); out.tp = out.vlf + (out.lf || 0) + out.hf; }
      const pk = peakFreq(S, 0.1, 0.45);
      if (pk) { out.br = pk.f * 60; out.hfPeak = pk.f; }
      const lp = M.dur >= 110 ? peakFreq(S, 0.04, 0.15, 2) : null;
      if (lp) out.lfPeak = lp.f;
    }
  }
  return out;
}

// ---------- through the recording ----------
// Minute by minute: heart rate, its range, RMSSD, SDNN, pNN50 and how many beats needed correcting.
function perMinute(X) {
  const out = [], mins = Math.ceil(X.dur / 60 - 1e-6);
  for (let m = 0; m < mins; m++) {
    const [a, b] = idxAt(X, m * 60, (m + 1) * 60), runs = runsIn(X, a, b), M = statsRuns(X.rr, runs), F = fixedIn(X, runs);
    let all = 0; for (let k = a; k < b; k++) all++;
    out.push({ m, a, b, n: F.n, out: all - F.n, hr: M?.hr ?? null, minHr: M?.minHr ?? null, maxHr: M?.maxHr ?? null, rmssd: M?.rmssd ?? null, sdnn: M?.sdnn ?? null, pnn50: M?.pnn50 ?? null, q: F.n ? Math.round((1 - F.share) * 100) : null });
  }
  return out;
}
// A point every `step` seconds: heart rate and RMSSD over the last `win` seconds, the share of clean beats, α1 over
// the last two minutes (dropped when over 5% of its beats needed correcting, as in the exercise studies) and, at rest,
// the breathing rate over the last minute.
function timeline(X, { step = 15, win = 60, a1 = true, br = true } = {}) {
  const out = [];
  if (X.dur > 7200) step = Math.max(step, Math.ceil(X.dur / 480));
  for (let t = Math.min(win, X.dur); t <= X.dur + 1e-6; t += step) {
    const [a, b] = idxAt(X, t - win, t), runs = runsIn(X, a, b), M = statsRuns(X.rr, runs), F = fixedIn(X, runs);
    const p = { t, hr: M?.hr ?? null, rmssd: M?.rmssd ?? null, q: F.n ? Math.round((1 - F.share) * 100) : null, a1: null, br: null };
    if (a1 && t >= 120) {
      const [c, d] = idxAt(X, t - 120, t), r2 = runsIn(X, c, d), F2 = fixedIn(X, r2);
      if (F2.n >= 100 && F2.share <= 0.05) { const v = dfaAlpha(concat(X.rr, r2), 4, 16); if (v != null && v > 0.1 && v < 2.5) p.a1 = v; }
    }
    if (br && M && M.dur >= 50) { const S = specOf(X, runs, 0.5, 0.004), pk = S && peakFreq(S, 0.1, 0.5); if (pk) p.br = pk.f * 60; }
    out.push(p);
  }
  return out;
}

// ---------- what particular tests measure ----------
// The 30:15 ratio after standing up (Ewing 1978): the longest interval around the 30th beat over the shortest
// around the 15th, counted from the moment of standing. Ewing 1985: 1.04 or more normal, 1.01–1.03 borderline,
// 1.00 or less abnormal, in a supervised lying-to-standing test; it falls with age.
function ratio3015(X, standS) {
  const [k0] = idxAt(X, standS, X.dur + 1);
  const pick = (i0, i1) => { const v = []; for (let k = k0 + i0; k <= Math.min(X.n - 1, k0 + i1); k++) if (X.inc[k]) v.push(X.rr[k]); return v; };
  const s15 = pick(10, 20), l30 = pick(25, 35);
  if (s15.length < 5 || l30.length < 5) return null;
  return { r: Math.max(...l30) / Math.min(...s15), short: Math.min(...s15), long: Math.max(...l30) };
}
// Time in each tenth of maximum heart rate from 50% up, and Edwards' TRIMP (minutes × 1 to 5 by zone).
function hrLoad(X, hrMax) {
  const z = [0, 0, 0, 0, 0];
  for (const [a, b] of X.runs) for (let k = a; k < b; k++) {
    const f = 60000 / X.rr[k] / hrMax;
    if (f >= 0.5) z[Math.min(4, Math.floor((f - 0.5) * 10))] += X.rr[k] / 1000;
  }
  return { z, trimp: z.reduce((s, v, i) => s + v / 60 * (i + 1), 0) };
}
// Heart rate where α1 crosses a level (0.75 for the first threshold, 0.5 for the second), from timeline points:
// a straight line of α1 on heart rate through the points around it, only when the session crossed it.
function a1Cross(pts, level) {
  const w = pts.filter(p => p.a1 != null && p.hr != null && p.a1 >= level - 0.35 && p.a1 <= level + 0.35).map(p => [p.hr, p.a1]);
  if (w.length < 6 || !w.some(x => x[1] > level + 0.05) || !w.some(x => x[1] < level - 0.05)) return null;
  const hrs = w.map(x => x[0]);
  if (Math.max(...hrs) - Math.min(...hrs) < 10) return null;
  const r = pearson(w), fit = linfit(w);
  if (r == null || r > -0.6 || !fit || fit.m >= 0) return null;
  const hr = (level - fit.b) / fit.m;
  return hr >= Math.min(...hrs) - 5 && hr <= Math.max(...hrs) + 5 ? { hr: Math.round(hr), r, n: w.length } : null;
}

// ---------- reading a value against your own ----------
// ln RMSSD against the person's earlier readings of the same kind and position: their mean, its SD, the smallest
// worthwhile change (half an SD: Plews 2012, Buchheit 2014) and where today falls.
function ownRef(v, hist) {
  const h = (hist || []).filter(Number.isFinite);
  if (v == null || h.length < 5) return { n: h.length };
  const m = mean(h), s = sd(h) || 0, swc = 0.5 * s, z = s ? (v - m) / s : 0;
  return { n: h.length, m, s, swc, z, lo: m - swc, hi: m + swc, word: v < m - swc ? 'below' : v > m + swc ? 'above' : 'within', cv: s / Math.abs(m) * 100 };
}
// Short-term (about 5 minutes, lying) values in healthy adults, pooled across 44 studies (Nunan 2010). A population
// reference only: people differ widely, and age lowers them (Voss 2015). Your own baseline says more.
const NORMS = { rmssd: [42, 15], sdnn: [50, 16], lf: [519, 291], hf: [657, 777], lfhf: [2.8, 2.6] };
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('analysis.js');
