'use strict';
// Beat-to-beat analysis for every strap reading: artefact correction, the standard HRV measures, the spectrum, the
// breathing rate hidden in the beats, and the measures each guided session needs. Pure functions: nothing here
// reads or writes app data, so it is tested on its own (test/run.js).
//
// Standards followed: Task Force of the ESC and NASPE 1996 (definitions, band edges, minimum durations); Shaffer &
// Ginsberg 2017 (metrics and norms); Lipponen & Tarvainen 2019 (artefact classes and adaptive thresholds); Laguna et
// al. 1998 (the Lomb–Scargle periodogram for unevenly spaced beats, so no resampling is needed); Schäfer & Kratky 2008
// (breathing rate from respiratory sinus arrhythmia); Brennan et al. 2001 (Poincaré SD1/SD2).

const RR_LO = 270, RR_HI = 2200;       // 27–222 bpm: anything outside is not a heartbeat
const BAND = { vlf: [0.0033, 0.04], lf: [0.04, 0.15], hf: [0.15, 0.4] };

// ---------- small robust statistics ----------
function sortedCopy(a) { return Float64Array.from(a).sort(); }
function qOf(s, q) { if (!s.length) return null; const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); }
// Median of the w values centred on each index (shrinking at the ends).
function rollMedian(a, w) {
  const h = w >> 1, out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = qOf(sortedCopy(a.slice(Math.max(0, i - h), Math.min(a.length, i + h + 1))), 0.5);
  return out;
}
// Quartile deviation, (Q3 − Q1) / 2, of the values in a w-wide window around each index.
function rollQD(a, w) {
  const h = w >> 1, out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) { const s = sortedCopy(a.slice(Math.max(0, i - h), Math.min(a.length, i + h + 1))); out[i] = (qOf(s, 0.75) - qOf(s, 0.25)) / 2; }
  return out;
}

// ---------- artefact correction ----------
// Each beat is compared with the median of the 11 around it. The allowed distance adapts to how variable the beats
// around it really are (5.2 quartile deviations over 91 beats, as Lipponen & Tarvainen), never tighter than 12% of
// the local median. (The spread is of the signed distances: during slow breathing the local median sits off-centre,
// and the spread of plain distances would then be too tight.) A fixed 20% rule would "correct" real beats during slow breathing, where heart rate swings by
// 20–30 bpm with every breath; this does not. A beat that is out:
//  - and about twice the local median is a missed beat: split in two, so the timeline stays true;
//  - and, added to the next one, makes about one normal beat is an extra beat: the two are merged;
//  - a short beat followed by a long one (an ectopic beat and its pause) is evened out across the pair;
//  - anything else is replaced by the local median.
// Returns the corrected beats, the share of beats that needed correction, and the count of each kind.
function rrClean(raw) {
  const rr = (raw || []).filter(x => Number.isFinite(x));
  const n0 = rr.length, kinds = { missed: 0, extra: 0, ectopic: 0, other: 0, range: 0 };
  if (n0 < 3) return { rr: rr.filter(x => x > RR_LO && x < RR_HI), bad: 0, n: n0, kinds };
  // Out of physiological range: replaced by the median of the in-range beats around it, before anything else.
  const inr = rr.map(x => x > RR_LO && x < RR_HI);
  const base = rr.map((x, i) => {
    if (inr[i]) return x;
    kinds.range++;
    const nb = [];
    for (let j = Math.max(0, i - 5); j <= Math.min(n0 - 1, i + 5); j++) if (j !== i && inr[j]) nb.push(rr[j]);
    return nb.length ? qOf(sortedCopy(nb), 0.5) : null;
  });
  const a = base.filter(x => x != null);
  const med = rollMedian(a, 11), dev = a.map((x, i) => x - med[i]), qd = rollQD(dev, 91);
  const out = [];
  let fixed = kinds.range;
  for (let i = 0; i < a.length; i++) {
    const m = med[i], thr = Math.max(0.12 * m, 5.2 * qd[i]), x = a[i];
    if (Math.abs(x - m) <= thr) { out.push(x); continue; }
    fixed++;
    if (Math.abs(x / 2 - m) <= thr && x > m) { kinds.missed++; out.push(x / 2, x / 2); continue; }
    const nx = a[i + 1];
    if (nx != null && x < m && Math.abs(x + nx - m) <= thr) { kinds.extra++; out.push(x + nx); i++; continue; }
    if (nx != null && x < m && nx > med[i + 1] && Math.abs(nx - med[i + 1]) > Math.max(0.12 * med[i + 1], 5.2 * qd[i + 1])) {
      kinds.ectopic++; fixed++; const e = (x + nx) / 2; out.push(e, e); i++; continue;
    }
    kinds.other++; out.push(m);
  }
  return { rr: out, bad: n0 ? fixed / n0 : 0, n: n0, kinds };
}

// ---------- the spectrum ----------
// Lomb–Scargle periodogram of the beats against their own times, linear trend removed. Scaled so the bands add up to
// the variance of the series, giving band powers in ms² comparable with the usual software.
function lombScargle(rr, fmax = 0.5, df = 0.002) {
  const n = rr.length;
  if (n < 20) return null;
  const t = new Float64Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += rr[i] / 1000; t[i] = acc; }
  // detrend
  const mt = acc / 2;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += t[i]; sy += rr[i]; sxx += t[i] * t[i]; sxy += t[i] * rr[i]; }
  const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1), ic = (sy - sl * sx) / n;
  const y = new Float64Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) { y[i] = rr[i] - (ic + sl * t[i]); v += y[i] * y[i]; }
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
  return { f: fs, p: P.map(x => x * k), df, dur: mt * 2 };
}
function bandPower(S, [a, b]) { let s = 0; for (let i = 0; i < S.f.length; i++) if (S.f[i] >= a && S.f[i] < b) s += S.p[i] * S.df; return s; }
// The dominant frequency between a and b Hz, refined between grid points, and how clearly it stands out
// (its power over the median in that range). null when there is no clear peak.
function peakFreq(S, a, b, minProm = 2.5) {
  let bi = -1, bp = -1;
  const inr = [];
  for (let i = 0; i < S.f.length; i++) if (S.f[i] >= a && S.f[i] <= b) { inr.push(S.p[i]); if (S.p[i] > bp) { bp = S.p[i]; bi = i; } }
  if (bi < 1 || bi >= S.f.length - 1 || !inr.length) return null;
  const md = qOf(sortedCopy(inr), 0.5), prom = md ? bp / md : Infinity;
  if (prom < minProm) return null;
  const y0 = S.p[bi - 1], y1 = S.p[bi], y2 = S.p[bi + 1], den = y0 - 2 * y1 + y2;
  const off = den ? clamp(0.5 * (y0 - y2) / den, -0.5, 0.5) : 0;
  return { f: S.f[bi] + off * S.df, prom };
}

// ---------- one reading, in full ----------
// From the raw beats of a recording: time-domain, Poincaré and, when long enough, frequency-domain measures and the
// breathing rate. Durations follow the Task Force: HF needs about a minute, LF two. Returns null under 30 clean beats.
// spectrum = false leaves the frequency measures out: for a long session in mixed states they mean nothing.
function hrvMetrics(raw, spectrum = true) {
  const C = rrClean(raw), rr = C.rr, n = rr.length;
  if (n < 30) return null;
  const m = mean(rr), dur = rr.reduce((a, b) => a + b, 0) / 1000;
  let ss = 0, n50 = 0;
  const d = [];
  for (let i = 1; i < n; i++) { const x = rr[i] - rr[i - 1]; d.push(x); ss += x * x; if (Math.abs(x) > 50) n50++; }
  const rm = Math.sqrt(ss / d.length), sdnn = sd(rr), sdsd = sd(d) || 0;
  const sd1 = Math.sqrt(0.5) * sdsd, sd2 = Math.sqrt(Math.max(0, 2 * sdnn * sdnn - 0.5 * sdsd * sdsd));
  const out = { n: C.n, beats: n, dur, rr: m, hr: 60000 / m, rmssd: rm, ln: Math.log(rm), sdnn, pnn50: n50 / d.length * 100, sd1, sd2, ratio: sd2 ? sd1 / sd2 : null,
    q: Math.round((1 - C.bad) * 100), kinds: C.kinds, minHr: 60000 / Math.max(...rr), maxHr: 60000 / Math.min(...rr) };
  if (spectrum && dur >= 55) {
    const S = lombScargle(rr);
    if (S) {
      out.hf = bandPower(S, BAND.hf);
      if (dur >= 110) { out.lf = bandPower(S, BAND.lf); out.lfhf = out.hf ? out.lf / out.hf : null; out.lfnu = out.lf + out.hf ? out.lf / (out.lf + out.hf) * 100 : null; }
      // Breathing shows as the strongest rhythm between 6 and 30 breaths a minute.
      const pk = peakFreq(S, 0.1, 0.5);
      if (pk) { out.br = pk.f * 60; out.brProm = pk.prom; }
    }
  }
  return out;
}

// ---------- live helpers ----------
// Beat-to-beat heart rate with a time for each beat, from the strap's intervals: times come from the intervals
// themselves (the heart's own clock), anchored to the moment the last one arrived, so they never drift.
function beatTimes(rr, endMs) {
  const out = new Array(rr.length);
  let t = endMs;
  for (let i = rr.length - 1; i >= 0; i--) { out[i] = [t, 60000 / rr[i]]; t -= rr[i]; }
  return out;
}
// Respiratory sinus arrhythmia during paced breathing: in each breath (start times from the pacer), the highest
// minus the lowest beat-to-beat heart rate. The mean over full breaths is the classic biofeedback amplitude.
function rsaCycles(beats, t0, period) {
  const by = new Map();
  for (const [t, h] of beats) { const c = Math.floor((t - t0) / period); if (c < 0) continue; const x = by.get(c) || [Infinity, -Infinity, 0]; x[0] = Math.min(x[0], h); x[1] = Math.max(x[1], h); x[2]++; by.set(c, x); }
  const last = Math.floor((Math.max(...beats.map(b => b[0])) - t0) / period);
  const amps = [...by.entries()].filter(([c, x]) => c < last && x[2] >= 3).map(([, x]) => x[1] - x[0]);
  return amps.length ? { amp: mean(amps), n: amps.length, all: amps } : null;
}
// How much of the variability sits at the breathing rate: power within ±0.015 Hz of it, over all power from
// 0.0033 to 0.4 Hz. Near 1 when heart rate rises and falls smoothly with each slow breath (resonance).
function rhythmShare(rr, fBreath) {
  const S = lombScargle(rrClean(rr).rr, 0.4, 0.002);
  if (!S || !fBreath) return null;
  const tot = bandPower(S, [0.0033, 0.4]), at = bandPower(S, [fBreath - 0.015, fBreath + 0.015]);
  return tot ? at / tot : null;
}

// ---------- reading a number against your own history ----------
// z against your own values, where today sits among them, and a plain word for it. Under 7 values there is no
// usual yet. |z| < 1 is your normal day-to-day spread; beyond 2 is unusual for you.
function versus(v, hist) {
  const h = (hist || []).filter(Number.isFinite);
  if (v == null || h.length < 7) return { n: h.length, word: null };
  const m = mean(h), s = sd(h) || 0, z = s ? (v - m) / s : 0, below = h.filter(x => x < v).length;
  const word = Math.abs(z) < 1 ? 'usual' : z >= 2 ? 'very high' : z > 0 ? 'high' : z <= -2 ? 'very low' : 'low';
  const lo = Math.min(...h), hi = Math.max(...h);
  return { n: h.length, m, s, z, pct: Math.round(below / h.length * 100), word, lo, hi, rec: v > hi ? 'highest' : v < lo ? 'lowest' : null };
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('hrv.js');
