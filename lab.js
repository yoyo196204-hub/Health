'use strict';
// The Lab: what else the strap can tell you, each as a short guided session with a result that is kept.
//  - Breathe: a pacer for slow breathing, with or without the strap. With it, your heart rate rises with each
//    breath in and falls with each breath out (respiratory sinus arrhythmia); the app measures that swing live.
//  - Resonance finder: five rates, two minutes each; the rate at which your heart rate swings most is your own
//    resonance frequency, and Breathe uses it from then on.
//  - Orthostatic test: lying, then standing. How much heart rate rises and how HRV changes on standing, against
//    your own previous tests.
//  - Spot check: a reading at any time of day, in any position, with every measure; kept apart from the morning
//    check, which needs the same conditions every day to mean anything.
//  - Live: open-ended. Every measure moves as you watch, for as long as you like; you mark what you are doing and
//    each marked stretch is read on its own and against your earlier stretches with the same mark. The beats can be
//    saved as a file for other software.
// Each session runs on the strap's timeline (h9.js) and is analysed by hrv.js. Nothing here changes the day's verdict.

const LABS = {
  breathe: { n: 'Breathe', d: 'Paced slow breathing, with live heart-rate feedback when the strap is on', ev: 'breathe', strap: false },
  rf: { n: 'Resonance finder', d: 'Five breathing rates, two minutes each: find the one that moves your heart most', ev: 'rf', strap: true },
  ortho: { n: 'Orthostatic test', d: 'Lie still, then stand: heart rate and HRV in both, against your own', ev: 'ortho', strap: true },
  spot: { n: 'Spot check', d: 'Every HRV measure at any time of day, in any position', ev: 'metrics', strap: true },
  live: { n: 'Live', d: 'Open-ended: every measure as it happens, for as long as you like. Mark what you are doing, then compare the stretches', ev: 'live', strap: true },
};
// Breathing patterns: phases of [what, seconds]. Resonance follows the rate you choose (breath in 40%, out 60%).
const BREATHS = {
  rf: { n: 'Resonance', d: 'Smooth, slow breaths at your rate, out a little longer than in', ev: 'breathe' },
  sigh: { n: 'Cyclic sighing', d: 'Two breaths in through the nose, the second a short top-up, then a long slow breath out', ev: 'sigh' },
  box: { n: 'Box', d: 'In, hold, out, hold, four seconds each', ev: 'sigh' },
};
const RF_RATES = [6.5, 6, 5.5, 5, 4.5], RF_SEG = 120;
const ORTHO_LIE = 150, ORTHO_STAND = 150, SPOT_SETTLE = 30;
const LIVE_MAX = 4 * 3600, LIVE_MIN = 60, LIVE_WIN = 300;   // longest session, shortest worth saving, the window a stretch is read from
const LAB = { kind: null, phases: null, cycle: 10, segT0: 0, ph: -1, raf: 0, cue: '', tag0: 'rest', tag: 'rest', marks: [], ser: [], serAt: 0, step: 5, a1: null, a1At: 0, exp: null };

function breathPhases(pat, rate) {
  if (pat === 'sigh') return [['in', 2.6], ['top', 1.2], ['out', 6.2]];
  if (pat === 'box') return [['in', 4], ['hold', 4], ['out', 4], ['hold2', 4]];
  const P = 60 / rate;
  return [['in', r1(P * 0.4)], ['out', r1(P * 0.6)]];
}
function labRate() { return S.settings.brRate; }
// Where in the breath we are at time t: phase index, its name, progress through it 0–1, and the orb's size 0–1.
function breathAt(t) {
  const ph = LAB.phases, cyc = LAB.cycle;
  let x = ((t - LAB.segT0) / 1000) % cyc;
  if (x < 0) x += cyc;
  for (let i = 0; i < ph.length; i++) {
    const [name, s] = ph[i];
    if (x < s || i === ph.length - 1) {
      const p = clamp(x / s, 0, 1), e = 0.5 - 0.5 * Math.cos(Math.PI * p);
      const prevSize = i === 0 ? 0 : sizeAfter(i - 1);
      const size = name === 'in' ? e * (ph.some(q => q[0] === 'top') ? 0.82 : 1) : name === 'top' ? 0.82 + 0.18 * e : name === 'out' ? 1 - e : prevSize;
      return { i, name, p, size, left: s - x };
    }
    x -= s;
  }
  return { i: 0, name: 'in', p: 0, size: 0, left: 0 };
}
function sizeAfter(i) { const n = LAB.phases[i][0]; return n === 'in' ? (LAB.phases.some(q => q[0] === 'top') ? 0.82 : 1) : n === 'top' ? 1 : n === 'out' ? 0 : n === 'hold' ? 1 : 0; }
const CUE = { in: 'Breathe in', top: 'In a little more', out: 'Breathe out', hold: 'Hold', hold2: 'Hold' };

// ---------- running ----------
function labStart(kind) {
  const s = S.settings;
  LAB.kind = kind; LAB.ph = -1; LAB.cue = '';
  if (kind === 'breathe') { LAB.phases = breathPhases(s.brPat, s.brRate); LAB.total = s.brMin * 60; }
  else if (kind === 'rf') { LAB.phases = breathPhases('rf', RF_RATES[0]); LAB.total = RF_RATES.length * RF_SEG; LAB.seg = 0; }
  else if (kind === 'ortho') { LAB.phases = null; LAB.total = ORTHO_LIE + ORTHO_STAND; LAB.stood = false; }
  else if (kind === 'spot') { LAB.phases = null; LAB.total = SPOT_SETTLE + s.spDur; }
  else if (kind === 'live') Object.assign(LAB, { phases: null, total: LIVE_MAX, tag: LAB.tag0, marks: [[0, LAB.tag0]], ser: [], serAt: 0, step: 5, a1: null, a1At: 0, exp: null });
  LAB.cycle = LAB.phases ? LAB.phases.reduce((a, p) => a + p[1], 0) : 0;
  hrStart(kind);
  LAB.segT0 = HR.t0;
}
function labTick(now, el, silent, off) {
  const K = LAB.kind, needStrap = LABS[K]?.strap;
  // A Live session that loses the strap keeps what it has.
  if (K === 'live' && (silent || off) && el >= LIVE_MIN + 15) return labDone();
  if (K === 'live') liveStep(now, el);
  if (needStrap && (silent || off)) { hrEnd(); HR.result = { type: K, ok: false, why: off ? 'The strap lost skin contact. Wet the electrodes and try again.' : 'Lost contact with the strap.' }; buzz('warn'); return render(); }
  if (K === 'rf') {
    const seg = Math.min(RF_RATES.length - 1, Math.floor(el / RF_SEG));
    if (seg !== LAB.seg) { LAB.seg = seg; LAB.phases = breathPhases('rf', RF_RATES[seg]); LAB.cycle = LAB.phases.reduce((a, p) => a + p[1], 0); LAB.segT0 = HR.t0 + seg * RF_SEG * 1000; buzz('ok'); toast(`Now ${RF_RATES[seg]} breaths a minute`, 2200); }
  }
  if (K === 'ortho' && !LAB.stood && el >= ORTHO_LIE) { LAB.stood = true; buzz('done'); setTimeout(() => buzz('warn'), 500); }
  if (K === 'spot' && Math.floor(el) === SPOT_SETTLE) buzz('tick');
  if (el >= LAB.total) return labDone();
}
// Keeps the orb, the cue and the counters moving every frame while a breathing page is open.
function labFrame() {
  const orb = document.getElementById('orb');
  if (!orb || !LAB.phases) { LAB.raf = 0; return; }
  const running = HR.mode === LAB.kind && (LAB.kind === 'breathe' || LAB.kind === 'rf');
  const now = Date.now();
  if (!running) LAB.segT0 = LAB.segT0 || now;
  const b = breathAt(running ? now : now);
  orb.style.setProperty('--s', (0.42 + 0.58 * b.size).toFixed(4));
  orb.dataset.ph = b.name;
  const cue = document.getElementById('cue');
  if (running) {
    if (b.i !== LAB.ph) {
      LAB.ph = b.i;
      if (S.settings.brHaptic !== 'off') buzz(b.name === 'in' ? 'inhale' : b.name === 'out' ? 'exhale' : b.name === 'top' ? 'tick' : 'hold');
    }
    if (cue) cue.textContent = `${CUE[b.name]} · ${Math.ceil(b.left)}`;
  } else if (cue) cue.textContent = 'Follow the circle';
  LAB.raf = requestAnimationFrame(labFrame);
}
function labKick() { if (!LAB.raf && document.getElementById('orb')) { if (!LAB.phases) { LAB.phases = breathPhases(S.settings.brPat, S.settings.brRate); LAB.cycle = LAB.phases.reduce((a, p) => a + p[1], 0); LAB.segT0 = Date.now(); } LAB.raf = requestAnimationFrame(labFrame); } }
function labPaint() {
  const el = (Date.now() - HR.t0) / 1000, c = document.getElementById('labclock');
  if (!c || !HR.mode) return;
  const K = HR.mode;
  if (K === 'ortho') {
    c.textContent = el < ORTHO_LIE ? `Lying still · stand up in ${clock(ORTHO_LIE - el)}` : `Standing still · ${clock(LAB.total - el)}`;
    const st = document.getElementById('labstage'); if (st) st.textContent = el < ORTHO_LIE ? 'Lie still and breathe normally.' : 'Stand up now, then stay still, arms relaxed.';
  } else if (K === 'spot') c.textContent = el < SPOT_SETTLE ? `Settling · ${clock(SPOT_SETTLE - el)}` : `Recording · ${clock(LAB.total - el)}`;
  else if (K === 'live') { c.textContent = `${clock(el)} · ${LIVETAGS[LAB.tag]}`; livePaint(); }
  else if (K === 'rf') c.textContent = `${RF_RATES[LAB.seg]} a minute · ${clock(RF_SEG - (el % RF_SEG))} · rate ${LAB.seg + 1} of ${RF_RATES.length}`;
  else c.textContent = `${clock(LAB.total - el)} left`;
  const ring = document.getElementById('labring'); if (ring) ring.setAttribute('stroke-dasharray', `${clamp(el / LAB.total * 100, 0, 100).toFixed(1)} 100`);
  const rs = document.getElementById('rsalive');
  if (rs && (K === 'breathe' || K === 'rf') && HR.conn === 'on') {
    const bs = cleanBeats(Date.now() - 4 * LAB.cycle * 1000), R = bs.length > 10 ? rsaCycles(bs, LAB.segT0, LAB.cycle * 1000) : null;
    rs.textContent = R ? `Heart rate swing ${r1(R.amp)} bpm a breath` : 'Heart rate swing: after a few breaths';
  }
}
// Beat times and heart rates from t on, after artefact correction, for measures that follow each breath.
function cleanBeats(t, until = Infinity) {
  const raw = beatsSince(t, until);
  if (raw.length < 3) return [];
  const C = rrClean(raw.map(b => b[1]));
  let at = raw[0][0] - raw[0][1];
  return C.rr.map(r => { at += r; return [at, 60000 / r]; });
}
function labDone() {
  const K = HR.mode, t0 = HR.t0, end = Date.now(), el = (end - t0) / 1000, k = dk(new Date(t0)), s = S.settings;
  hrEnd();
  let rec = null, why = '';
  const all = rrSince(t0), strap = all.length >= 30;
  if (K === 'breathe') {
    rec = { kind: 'breathe', t: t0, dur: Math.round(el), pat: s.brPat, rate: s.brPat === 'rf' ? s.brRate : r1(60 / LAB.cycle), cyc: Math.floor(el / LAB.cycle) };
    if (strap) {
      const m = hrvMetrics(all), R = rsaCycles(cleanBeats(t0), t0, LAB.cycle * 1000);
      const h1 = cleanBeats(t0, t0 + 60000).map(b => b[1]), h2 = cleanBeats(end - 60000).map(b => b[1]);
      Object.assign(rec, { q: m?.q, hr: m ? r1(m.hr) : null, rmssd: m ? r1(m.rmssd) : null, rsa: R ? r1(R.amp) : null,
        hr1: h1.length ? r1(mean(h1)) : null, hr2: h2.length ? r1(mean(h2)) : null, share: el >= 110 ? r1((rhythmShare(all, 1 / LAB.cycle) || 0) * 100) : null });
    }
  } else if (K === 'rf') {
    const seg = RF_RATES.map((rate, i) => {
      const a = t0 + i * RF_SEG * 1000, b = a + RF_SEG * 1000, P = 60 / rate * 1000;
      const R = rsaCycles(cleanBeats(a + P, b), a, P), C = rrClean(rrSince(a + P, b)).rr, Sx = C.length > 40 ? lombScargle(C, 0.2, 0.002) : null;
      let lfp = null; if (Sx) for (let j = 0; j < Sx.f.length; j++) if (Sx.f[j] >= 0.04 && Sx.f[j] <= 0.15) lfp = Math.max(lfp || 0, Sx.p[j]);
      return [rate, R ? r1(R.amp) : null, lfp != null ? Math.round(lfp) : null];
    });
    const ok = seg.filter(x => x[1] != null);
    if (ok.length >= 3) {
      // The largest heart-rate swing per breath decides; a near tie (within 1 bpm) goes to the stronger LF peak.
      const top = Math.max(...ok.map(x => x[1])), best = ok.filter(x => x[1] >= top - 1).sort((a, b) => (b[2] || 0) - (a[2] || 0))[0];
      rec = { kind: 'rf', t: t0, dur: Math.round(el), seg, best: best[0] };
      S.meta.rf = { rate: best[0], at: k };
      S.settings.brRate = best[0];
    } else why = 'Too few clean breaths at enough of the rates to compare them. Try again lying or sitting very still.';
  } else if (K === 'ortho') {
    const sup = hrvMetrics(rrSince(t0 + 30000, t0 + ORTHO_LIE * 1000)), std = hrvMetrics(rrSince(t0 + (ORTHO_LIE + 30) * 1000, end));
    const stand = cleanBeats(t0 + ORTHO_LIE * 1000, t0 + (ORTHO_LIE + 45) * 1000).map(b => b[1]);
    let peak = null; for (let i = 4; i < stand.length; i++) peak = Math.max(peak || 0, mean(stand.slice(i - 4, i + 1)));
    const last = cleanBeats(end - 60000).map(b => b[1]);
    if (sup && std && sup.q >= 80 && std.q >= 80) rec = { kind: 'ortho', t: t0, dur: Math.round(el), hrSup: r1(sup.hr), rmSup: r1(sup.rmssd), hrPeak: peak ? r1(peak) : null, hrStd: last.length ? r1(mean(last)) : r1(std.hr), rmStd: r1(std.rmssd), q: Math.min(sup.q, std.q) };
    else why = 'The beats were too noisy in one of the two positions. Keep still and try again.';
  } else if (K === 'spot') {
    const rr = rrSince(t0 + SPOT_SETTLE * 1000), m = hrvMetrics(rr);
    if (m && m.q >= 80) rec = Object.assign({ kind: 'spot', t: t0, pos: s.spPos }, hrvRecord(m), { rr: rr.filter(x => x > 270 && x < 2200).slice(0, 600) });
    else why = m ? `Only ${m.q}% of beats were clean. Sit still and try again.` : 'The signal was too noisy.';
  }
  else if (K === 'live') {
    const r = liveRecord(t0, end);
    if (r.rec) rec = r.rec; else why = r.why;
  }
  if (rec) {
    const c = cleanLab(rec);
    if (c) { (S.lab[k] ||= []).push(c); S.lab[k] = S.lab[k].slice(-30); save(); buzz('done'); HR.result = { type: K, ok: true, k, i: S.lab[k].length - 1 }; }
    else { HR.result = { type: K, ok: false, why: 'The session could not be saved.' }; buzz('warn'); }
  } else { HR.result = { type: K, ok: false, why: why || 'Not enough data.' }; buzz('warn'); }
  render();
}
function labCancel() { hrEnd(); HR.result = null; buzz('tick'); render(); }

// ---------- Live: an open-ended session ----------
// Every 5 seconds a point for the chart (heart rate over those seconds, RMSSD of the last minute); every 10 seconds,
// once there are two minutes of beats, α1. Past 720 points the chart keeps every other one and the step doubles.
function liveStep(now, el) {
  if (el - LAB.serAt >= LAB.step) {
    LAB.serAt = el;
    const b = beatsSince(now - LAB.step * 1000).map(x => 60000 / x[1]).filter(x => x > 27 && x < 222), L = liveMetrics();
    const hr = b.length ? mean(b) : HR.bpm;
    if (hr) LAB.ser.push([Math.round(el), Math.round(hr), L?.rmssd != null && L.q >= 80 ? r1(L.rmssd) : null]);
    if (LAB.ser.length > 720) { LAB.ser = LAB.ser.filter((_, i) => i % 2 === 0); LAB.step *= 2; }
  }
  if (el >= 120 && now - LAB.a1At >= 10000) {
    LAB.a1At = now;
    const raw = rrSince(now - 120000), C = rrClean(raw), a = raw.length >= 100 && C.bad <= 0.05 ? dfaA1(C.rr) : null;
    LAB.a1 = a != null && a > 0.1 && a < 2.5 ? a : null;
  }
}
function liveTag(tag) {
  if (!LIVETAGS[tag]) return;
  if (HR.mode !== 'live') { LAB.tag0 = tag; buzz('tick'); return render(); }
  if (tag === LAB.tag) return;
  LAB.tag = tag; LAB.marks.push([Math.round((Date.now() - HR.t0) / 1000), tag]);
  if (LAB.marks.length > 16) LAB.marks.splice(1, 1);
  buzz('ok'); render();
}
function liveGrid() {
  const cell = (id, l) => `<div><b class="num" id="lv_${id}">${DASH}</b><span class="sub">${l}</span></div>`;
  return `<div class="stats four lv">${cell('rm', 'RMSSD, ms')}${cell('sd', 'SDNN, ms')}${cell('pn', 'pNN50, %')}${cell('br', 'breaths/min')}</div>
    <div class="stats four lv">${cell('ln', 'ln RMSSD')}${cell('s1', 'SD1/SD2')}${cell('a1', 'α1, 2 min')}${cell('n', 'beats')}</div>`;
}
function livePaint() {
  const L = HR.live, set = (id, v) => { const e = document.getElementById('lv_' + id); if (e) e.textContent = v == null ? DASH : v; };
  set('rm', L?.rmssd != null ? Math.round(L.rmssd) : null); set('sd', L?.sd != null ? Math.round(L.sd) : null);
  set('pn', L?.pnn != null ? Math.round(L.pnn) : null); set('br', L?.br != null ? r1(L.br) : null);
  set('ln', L?.rmssd ? Math.log(L.rmssd).toFixed(2) : null); set('s1', L?.sd1 != null && L.sd2 ? (L.sd1 / L.sd2).toFixed(2) : null);
  set('a1', LAB.a1 != null ? LAB.a1.toFixed(2) : null); set('n', beatsSince(HR.t0).length);
  const ch = document.getElementById('livech'); if (ch) ch.innerHTML = liveSeries(LAB.ser, LAB.marks, (Date.now() - HR.t0) / 1000);
}
// Heart rate and RMSSD through a session, each on its own scale, with a line at every mark.
function liveSeries(ser, marks, total) {
  if (!ser || ser.length < 2) return '';
  const W = 300, H = 90, T = Math.max(total || 0, ser[ser.length - 1][0], 1), X = t => t / T * W;
  const path = (i, cls) => {
    const v = ser.filter(p => p[i] != null);
    if (v.length < 2) return '';
    const lo = Math.min(...v.map(p => p[i])), hi = Math.max(...v.map(p => p[i])), pad = (hi - lo) * 0.1 || 2;
    return `<path class="${cls}" d="${v.map((p, j) => `${j ? 'L' : 'M'}${X(p[0]).toFixed(1)},${(H - 4 - (p[i] - lo + pad) / (hi - lo + 2 * pad) * (H - 8)).toFixed(1)}`).join('')}"/>`;
  };
  return (marks || []).filter(m => m[0] > 0).map(m => `<line class="mk" x1="${X(m[0]).toFixed(1)}" x2="${X(m[0]).toFixed(1)}" y1="0" y2="${H}"/>`).join('') + path(2, 'rm') + path(1, 'hr');
}
// The session as a record: the whole of it in the time-domain measures, and each marked stretch from its last five
// minutes (or all of it, when shorter), the first 10 seconds after the mark left out as the change-over.
function liveRecord(t0, end) {
  const el = (end - t0) / 1000, beats = beatsSince(t0), all = beats.map(b => b[1]), m = hrvMetrics(all, false);
  if (el < LIVE_MIN || !m) return { why: el < LIVE_MIN ? 'Under a minute, so it was not saved.' : 'Too few clean beats arrived to say anything. Wet the electrodes and tighten the strap.' };
  const seg = LAB.marks.map(([s, tag], i) => {
    const e = i + 1 < LAB.marks.length ? LAB.marks[i + 1][0] : el, len = e - s;
    if (len < 20) return null;
    const from = Math.max(s + (len > 40 ? 10 : 0), e - LIVE_WIN), rr = rrSince(t0 + from * 1000, t0 + e * 1000), x = rr.length >= 30 ? hrvMetrics(rr) : null;
    const C = rr.length >= 100 ? rrClean(rr) : null, a = C && C.bad <= 0.05 ? dfaA1(C.rr) : null;
    return [tag, Math.round(s), Math.round(len), x ? r1(x.hr) : null, x ? r1(x.rmssd) : null, x?.br != null ? r1(x.br) : null, x ? x.q : null, a != null && a > 0.1 && a < 2.5 ? Math.round(a * 100) / 100 : null];
  }).filter(Boolean);
  // Kept for the file while the result is on screen: every beat with its time, however long the session was.
  LAB.exp = { t: t0, beats, marks: LAB.marks.slice() };
  return { rec: Object.assign({ kind: 'live', t: t0 }, hrvRecord(m), { dur: Math.round(el), ser: LAB.ser, seg, rr: all.filter(x => x > 270 && x < 2200).slice(0, RR_KEEP_LIVE) }) };
}
function liveBody(rec, prev) {
  const seg = rec.seg || [], ok = seg.filter(x => x[4] != null);
  const same = tag => (prev || []).flatMap(p => (p.seg || []).filter(x => x[0] === tag && x[4] != null).map(x => Math.log(x[4])));
  const rows = seg.map(x => {
    const V = x[4] != null ? versus(Math.log(x[4]), same(x[0])) : { word: null };
    return `<tr><td>${LIVETAGS[x[0]]}<i>${dur(x[2] / 60)}${x[6] != null ? ` · ${x[6]}% clean` : ''}</i></td><td>${x[3] != null ? Math.round(x[3]) : DASH}</td><td>${x[4] != null ? Math.round(x[4]) : DASH}${V.word && V.word !== 'usual' ? ` <span class="vw ${V.z < 0 ? 'bad' : 'good'}">${V.word}</span>` : ''}</td><td>${x[5] != null ? r1(x[5]) : DASH}</td><td>${x[7] != null ? x[7].toFixed(2) : DASH}</td></tr>`;
  }).join('');
  // The plainest finding: how the body changed from the first readable stretch to each later one.
  const a = ok[0], moves = ok.slice(1).map(b => `${LIVETAGS[a[0]]} → ${LIVETAGS[b[0]].toLowerCase()}: RMSSD ${Math.round(a[4])} → ${Math.round(b[4])} ms (${sign((b[4] / a[4] - 1) * 100)}%), heart rate ${Math.round(a[3])} → ${Math.round(b[3])} bpm`);
  const n7 = ok.filter(x => same(x[0]).length >= 7).length;
  return `${stats([[r1(rec.rmssd), 'RMSSD, ms'], [Math.round(rec.hr), 'bpm'], [rec.q != null ? `${rec.q}%` : DASH, 'clean beats']])}
    ${rec.ser?.length > 1 ? `<svg class="livech" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="Heart rate and RMSSD through the session">${liveSeries(rec.ser, seg.map(x => [x[1], x[0]]), rec.dur)}</svg>
      <p class="key"><i class="k tl"></i>heart rate<i class="k rm"></i>RMSSD, last minute${seg.length > 1 ? '<i class="k mk"></i>your marks' : ''}</p>` : ''}
    ${rows ? `<table class="segt"><tr><th>Stretch</th><th>bpm</th><th>RMSSD</th><th>Breaths</th><th>α1</th></tr>${rows}</table>` : ''}
    ${moves.length ? `<ul class="reasons">${moves.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
    ${rec.q != null && rec.q < 90 ? para(`${100 - rec.q}% of beats needed correcting: movement, a dry strap or a loose fit. Read the numbers of this session loosely.`, 'flag') : ''}
    ${metricsTable({ ln: Math.log(rec.rmssd), sdnn: rec.sd, pnn50: rec.pnn, sd1: rec.sd1, sd2: rec.sd2 })}
    ${para(`Each stretch is read from its last five minutes. ${n7 ? 'A word beside RMSSD compares it with your earlier stretches under the same mark.' : 'From the seventh stretch under the same mark, each is compared with your own.'} Not used for the day's verdict: posture, breathing, food and caffeine all move HRV within minutes. ${why('live', 'How to read it')}`)}`;
}
// The beats of a saved reading as a file other HRV software opens: one beat a line, seconds from the start and the
// interval in ms. Right after a Live session the file has every beat with its true time; later, the beats kept with
// the record (the first hour or so).
function rrExport(k, t) {
  const fresh = LAB.exp && String(LAB.exp.t) === String(t) ? LAB.exp : null;
  const x = t ? (S.lab[k] || []).find(y => String(y.t) === String(t)) : S.hrv[k];
  const rr = fresh ? fresh.beats.map(b => b[1]) : x?.rr;
  if (!rr || rr.length < 20) { buzz('warn'); return toast('No beats were kept with this reading'); }
  const at = new Date(x?.t || fresh?.t || Date.parse(k + 'T00:00')), pad = n => String(n).padStart(2, '0');
  const head = [`# Health · ${t ? LABS[x?.kind]?.n || 'Live' : 'Morning check'} · ${k} ${pad(at.getHours())}:${pad(at.getMinutes())}`, '# Polar H9, RR intervals as sent by the strap (1/1024 s resolution), uncorrected',
    ...(fresh?.marks || (x?.seg || []).map(s => [s[1], s[0]])).map(m => `# mark at ${m[0]} s: ${LIVETAGS[m[1]]}`), 'time_s,rr_ms'];
  let acc = 0;
  const t0 = fresh ? fresh.beats[0][0] - fresh.beats[0][1] : 0;
  const lines = rr.map((r, i) => { acc += r; return `${((fresh ? fresh.beats[i][0] - t0 : acc) / 1000).toFixed(3)},${fresh ? r.toFixed(1) : Math.round(r)}`; });
  saveText(`health-beats-${k}-${pad(at.getHours())}${pad(at.getMinutes())}.csv`, head.concat(lines).join('\n') + '\n', 'text/csv');
  buzz('ok');
}

// ---------- what a session says ----------
function labHist(kind, before) { const out = []; for (const k of Object.keys(S.lab).sort().reverse()) S.lab[k].slice().reverse().forEach(x => { if (x.kind === kind && (!before || x.t < before)) out.push(Object.assign({ k }, x)); }); return out; }
function labSummary(x) {
  if (x.kind === 'breathe') return `${dur(x.dur / 60)} · ${BREATHS[x.pat]?.n || 'Breathing'}${x.pat === 'rf' ? ` ${x.rate}/min` : ''}${x.rsa != null ? ` · swing ${r1(x.rsa)} bpm` : ''}${x.hr1 != null && x.hr2 != null ? ` · ${Math.round(x.hr1)}→${Math.round(x.hr2)} bpm` : ''}`;
  if (x.kind === 'rf') return `Best ${x.best} breaths a minute`;
  if (x.kind === 'live') return `${dur(x.dur / 60)} · ${Math.round(x.rmssd)} ms · ${Math.round(x.hr)} bpm${x.seg?.length > 1 ? ` · ${x.seg.length} stretches` : x.seg?.[0] ? ` · ${LIVETAGS[x.seg[0][0]].toLowerCase()}` : ''}`;
  if (x.kind === 'ortho') return `${Math.round(x.hrSup)}→${Math.round(x.hrStd)} bpm (${sign(x.hrStd - x.hrSup)}) · RMSSD ${Math.round(x.rmSup)}→${Math.round(x.rmStd)} ms`;
  return `${Math.round(x.rmssd)} ms · ${Math.round(x.hr)} bpm · ${x.pos || ''}${x.br ? ` · breathing ${r1(x.br)}/min` : ''}`;
}
function labResult(K, rec) {
  const stampSvg = '<svg viewBox="0 0 48 48" class="stamp" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>';
  const prev = labHist(K, rec.t), done = '<button class="solid wide" data-act="hrresdone">Done</button>';
  if (K === 'breathe') {
    const V = rec.rsa != null ? versus(rec.rsa, prev.filter(x => x.rsa != null && x.pat === rec.pat).map(x => x.rsa)) : null;
    return `<div class="result ok">${stampSvg}<b>${dur(rec.dur / 60)} of ${BREATHS[rec.pat]?.n.toLowerCase() || 'breathing'} saved</b>
      ${rec.rsa != null ? stats([[r1(rec.rsa), 'bpm swing a breath'], [rec.hr1 != null ? `${Math.round(rec.hr1)}→${Math.round(rec.hr2)}` : DASH, 'bpm, first → last min'], [rec.share != null ? `${Math.round(rec.share)}%` : DASH, 'power at your breath']])
        : stats([[rec.cyc, 'breaths'], [r1(60 / LAB.cycle), 'a minute'], [dur(rec.dur / 60), 'in all']])}
      ${para(rec.rsa != null ? `The swing is how far your heart rate rises on each breath in and falls on each breath out, the reflex slow breathing trains. ${V?.word ? `Against your last ${V.n} sessions it was <b>${V.word}</b>.` : ''} ${rec.share != null ? `${Math.round(rec.share)}% of all variability sat at your breathing rate: ${rec.share >= 60 ? 'heart and breath in step' : rec.share >= 35 ? 'partly in step' : 'not yet in step; smoother, slower breaths help'}.` : ''}` : 'Wear the strap next time to see your heart follow your breath.')} ${why(BREATHS[rec.pat]?.ev || 'breathe', 'Evidence')}${done}</div>`;
  }
  if (K === 'rf') {
    const mx = Math.max(...rec.seg.map(x => x[1] || 0));
    return `<div class="result ok">${stampSvg}<b>Your resonance: ${rec.best} breaths a minute</b>
      <div class="rfbars">${rec.seg.map(([r, a]) => `<div class="${r === rec.best ? 'best' : ''}"><i style="height:${a ? (a / mx * 100).toFixed(0) : 2}%"></i><b>${a != null ? r1(a) : DASH}</b><span>${r}</span></div>`).join('')}</div>
      <p class="key center">Heart-rate swing per breath (bpm) at each rate</p>
      ${para(`Breathe now uses ${rec.best} a minute. The resonance frequency is personal and stable over months, mostly set by blood volume and height; repeat in a few months or after a big change in fitness. ${why('rf', 'How it is found')}`)}${done}</div>`;
  }
  if (K === 'ortho') {
    const d = rec.hrStd - rec.hrSup, hist = prev.map(x => x.hrStd - x.hrSup), V = versus(d, hist), Vs = versus(Math.log(rec.rmSup), prev.map(x => Math.log(x.rmSup)));
    return `<div class="result ok">${stampSvg}<b>Orthostatic test saved</b>
      ${stats([[`${Math.round(rec.hrSup)}→${Math.round(rec.hrStd)}`, 'bpm lying → standing'], [rec.hrPeak ? Math.round(rec.hrPeak) : DASH, 'bpm peak on standing'], [`${Math.round(rec.rmSup)}→${Math.round(rec.rmStd)}`, 'RMSSD, ms']])}
      ${para(`Heart rate rose ${Math.round(d)} bpm on standing${V.word ? `, <b>${V.word}</b> for you (usually ${Math.round(V.m)})` : ''}. ${Vs.word ? `Lying RMSSD was <b>${Vs.word}</b> against your previous tests.` : 'From the seventh test on, each one is read against your own.'} A bigger rise than your usual, or lower HRV in both positions, goes with accumulated fatigue; read it with the morning check, not alone. ${why('ortho', 'Evidence')}`)}${done}</div>`;
  }
  if (K === 'live') return `<div class="result ok">${stampSvg}<b>${dur(rec.dur / 60)} live saved</b>${liveBody(rec, prev)}
    <div class="rowb">${rec.rr?.length >= 20 ? `<a class="ghost link" href="#beats-l${rec.t}">Explore beat by beat</a>` : ''}<button class="ghost" data-act="rrexp" data-k="${dk(new Date(rec.t))}" data-t="${rec.t}">Save as a file</button><span class="grow"></span><button class="solid" data-act="hrresdone">Done</button></div></div>`;
  const V = versus(Math.log(rec.rmssd), prev.filter(x => x.pos === rec.pos).map(x => Math.log(x.rmssd)));
  return `<div class="result ok">${stampSvg}<b>Spot check saved</b>
    ${stats([[r1(rec.rmssd), 'RMSSD, ms'], [Math.round(rec.hr), 'bpm'], [`${rec.q}%`, 'clean beats']])}
    ${beatsViz(rec.rr)}${metricsTable(hrvMetrics(rec.rr))}
    ${para(`${V.word ? `Against your previous ${V.n} spot checks ${rec.pos}: <b>${V.word}</b>.` : `Spot checks ${rec.pos} are compared with each other from the seventh on.`} Not used for the day's verdict: time of day, food, coffee and posture all move HRV, so only the morning check, under the same conditions daily, can track recovery.`)}${done}</div>`;
}

// ---------- the pages ----------
function vLab(kind) {
  const L = LABS[kind];
  if (!L) return vRecovery();
  const res = HR.result && HR.result.type === kind ? HR.result : null, running = HR.mode === kind, s = S.settings;
  const strapLine = HR.conn === 'on' && HR.bpm != null ? '' : L.strap ? strapIdle('lab') || '' : HR.conn === 'on' ? '' : `<div class="callout lite2"><span class="sub">The pacer works on its own. With the strap on, you also see your heart rate follow each breath.</span>${strapSupported() ? `<button class="ghost" data-act="hrconnect">${HR.conn === 'connecting' ? 'Connecting…' : 'Connect the strap'}</button>` : ''}</div>`;
  let body = '';
  if (res) body = `<div data-swipe="hrresdone">${res.ok ? labResult(kind, S.lab[res.k][res.i]) : `<div class="result bad"><b>Not saved</b><p class="sub">${esc(res.why)}</p><button class="solid wide" data-act="hrresdone">Done</button></div>`}</div>`;
  else if (kind === 'breathe' || kind === 'rf') {
    const ring = `<svg class="labring" viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="17" pathLength="100"/><circle id="labring" class="fg" cx="18" cy="18" r="17" pathLength="100" stroke-dasharray="0 100"/></svg>`;
    body = `<div class="pacer ${running ? 'run' : ''}">${running ? ring : ''}<div class="orb" id="orb" data-ph="in"><i></i><i></i><i></i></div><p class="cue" id="cue">Follow the circle</p></div>
      ${running ? `<p class="eyebrow center" id="labclock"></p>${HR.conn === 'on' ? `<div class="labhr">${liveHead()}<p class="sub center" id="rsalive">Heart rate swing: after a few breaths</p></div>` : ''}
        <button class="ghost wide" data-act="labstop">${kind === 'breathe' ? 'End now' : 'Cancel'}</button>`
      : kind === 'breathe' ? `${seg('brpat', Object.entries(BREATHS).map(([k, b]) => [k, b.n]), s.brPat)}<p class="sub center">${BREATHS[s.brPat].d}.</p>
        ${s.brPat === 'rf' ? `<h3>Breaths a minute${S.meta.rf ? ` <span class="src s-ok">yours: ${S.meta.rf.rate}</span>` : ''}</h3>${seg('brrate', [4.5, 5, 5.5, 6, 6.5, 7].map(r => [r, String(r)]), s.brRate, 'tight')}` : ''}
        <h3>How long</h3>${seg('brmin', [2, 3, 5, 10, 15, 20].map(m => [m, `${m} min`]), s.brMin, 'tight')}
        <h3>Feel each breath</h3>${seg('brhap', [['on', 'Vibrate'], ['off', 'Silent']], s.brHaptic, 'tight')}
        <button class="solid wide" data-act="labgo" data-k="breathe">Start · ${s.brMin} min</button>`
      : `${para('Lie or sit very still with the strap on. Follow the circle at 6.5, 6, 5.5, 5 and 4.5 breaths a minute, two minutes each. Breathe smoothly and not too deep: comfortable, never forced.')}
        <button class="solid wide" data-act="labgo" data-k="rf" ${HR.conn === 'on' ? '' : 'disabled'}>Start · 10 min</button>`}`;
  } else if (kind === 'ortho') {
    body = running ? `<div class="strap st-live">${liveHead()}<p class="eyebrow center" id="labclock"></p><p class="sub center big" id="labstage"></p><button class="ghost wide" data-act="labstop">Cancel</button></div>`
      : `${para('Lie down with the strap on, phone beside you. After 2½ minutes the phone vibrates: stand up straight away and stay still, arms relaxed, for 2½ minutes more. Best done in the morning, the same way each time.')}
        ${HR.conn === 'on' && HR.bpm != null ? `<div class="strap st-live">${liveHead()}</div>` : ''}<button class="solid wide" data-act="labgo" data-k="ortho" ${HR.conn === 'on' ? '' : 'disabled'}>Start · 5 min</button>`;
  } else if (kind === 'live') {
    const tags = cur => `<div class="chips wrap tight">${Object.entries(LIVETAGS).map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-act="livetag" data-v="${k}">${n}</button>`).join('')}</div>`;
    body = running ? `<div class="strap st-live">${liveHead()}<p class="eyebrow center" id="labclock"></p>${liveGrid()}
        <svg class="livech" id="livech" viewBox="0 0 300 90" preserveAspectRatio="none" role="img" aria-label="Heart rate and RMSSD through the session"></svg>
        <p class="key"><i class="k tl"></i>heart rate<i class="k rm"></i>RMSSD, last minute<i class="k mk"></i>your marks</p>
        <h3>Now I am</h3>${tags(LAB.tag)}<p class="sub small">Tap when what you are doing changes: each stretch is read on its own.</p>
        <button class="solid wide" data-act="labstop">Stop and save</button></div>`
      : `${HR.conn === 'on' && HR.bpm != null ? `<div class="strap st-live">${liveHead()}</div>` : ''}<h3>Starting with</h3>${tags(LAB.tag0)}
        <button class="solid wide" data-act="labgo" data-k="live" ${HR.conn === 'on' ? '' : 'disabled'}>Start</button>
        ${para('No protocol and no time limit under four hours: sit with it during work, a breathing practice, a cold shower, a difficult call, or falling asleep. Under a minute is not saved. Phone screen stays on while it runs.')}`;
  } else {
    body = running ? `<div class="strap st-live">${liveHead()}<p class="eyebrow center" id="labclock"></p><button class="ghost wide" data-act="labstop">Cancel</button></div>`
      : `<h3>Record</h3>${seg('spdur', [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']], s.spDur, 'tight')}
        <h3>Position</h3>${seg('sppos', [['sitting', 'Sitting'], ['lying', 'Lying'], ['standing', 'Standing']], s.spPos, 'tight')}
        ${HR.conn === 'on' && HR.bpm != null ? `<div class="strap st-live">${liveHead()}</div>` : ''}<button class="solid wide" data-act="labgo" data-k="spot" ${HR.conn === 'on' ? '' : 'disabled'}>Start · ${dur((SPOT_SETTLE + s.spDur) / 60)}</button>
        ${para('30 seconds settle, then the recording. Five minutes is the length the standards use for comparing frequency measures.')}`;
  }
  const hist = labHist(kind);
  return `${masthead(L.n, 'Strap lab', { before: '<button class="nav" data-act="close" aria-label="Back">‹</button>', after: why(L.ev, 'Evidence') })}
    <div class="lab lab-${kind}">${running || res ? '' : `<p class="sub">${L.d}.</p>`}${running || res ? '' : strapLine}${body}${strapMsg()}
    ${hist.length && !running ? sec(`Your sessions · ${hist.length}`, `<ul class="list swipelist">${hist.slice(0, 40).map(x => `<li data-swipe="labdel" data-k="${x.k}" data-t="${x.t}"><button class="rowbtn" data-act="labinfo" data-k="${x.k}" data-t="${x.t}"><span class="grow"><span class="nm">${dateLabel(x.k, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(new Date(x.t).getHours() * 60 + new Date(x.t).getMinutes())}</span><span class="sub">${labSummary(x)}</span></span><span class="chev">›</span></button></li>`).join('')}</ul>`) : ''}</div>`;
}
// The Lab on Recovery: one tile per session kind, each with its latest result.
function labTiles() {
  return `<div class="tiles">${Object.entries(LABS).map(([k, L]) => {
    const h = labHist(k)[0];
    return `<a class="tile t-${k}" href="#lab-${k}"><span class="tic">${LABICON[k]}</span><b>${L.n}</b><span class="sub">${HR.mode === k ? 'Running now' : h ? `${dateLabel(h.k)}: ${k === 'rf' ? `${h.best}/min` : k === 'breathe' ? dur(h.dur / 60) : k === 'live' ? `${dur(h.dur / 60)}, ${Math.round(h.rmssd)} ms` : k === 'ortho' ? `${sign(h.hrStd - h.hrSup)} bpm` : `${Math.round(h.rmssd)} ms`}` : L.strap ? 'Needs the strap' : 'Strap optional'}</span></a>`;
  }).join('')}</div>`;
}
const LABICON = {
  breathe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" opacity=".6"/><circle cx="12" cy="12" r="10" opacity=".3"/></svg>',
  rf: '<svg viewBox="0 0 24 24"><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/><path d="M4 20v-3M9 20v-5M14 20v-7M19 20v-4"/></svg>',
  ortho: '<svg viewBox="0 0 24 24"><path d="M3 18h7"/><path d="M15 21V9"/><circle cx="15" cy="5" r="2"/><path d="M12 13l3-3 3 3"/></svg>',
  spot: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 3 10 2.5-7 1.5 2H21"/></svg>',
  live: '<svg viewBox="0 0 24 24"><path d="M2 12h3l2-6 3 12 3-9 2 3h7"/><circle cx="20" cy="5" r="2" fill="currentColor" stroke="none"/></svg>',
};
function vLabInfo(p) {
  const list = S.lab[p.k] || [], x = list.find(y => String(y.t) === String(p.t));
  if (!x) return '';
  const L = LABS[x.kind] || { n: 'Session' };
  let body = '';
  if (x.kind === 'spot') body = stats([[r1(x.rmssd), 'RMSSD, ms'], [Math.round(x.hr), 'bpm'], [`${x.q}%`, 'clean beats']]) + beatsViz(x.rr) + metricsTable(x.rr?.length >= 30 ? hrvMetrics(x.rr) : null);
  else if (x.kind === 'live') body = liveBody(x, labHist('live', x.t));
  else if (x.kind === 'rf') body = `<div class="rfbars">${x.seg.map(([r, a]) => `<div class="${r === x.best ? 'best' : ''}"><i style="height:${a ? (a / Math.max(...x.seg.map(s => s[1] || 0)) * 100).toFixed(0) : 2}%"></i><b>${a != null ? r1(a) : DASH}</b><span>${r}</span></div>`).join('')}</div>`;
  else if (x.kind === 'ortho') body = table([trow('Lying heart rate', `${r1(x.hrSup)} bpm`), trow('Peak on standing', x.hrPeak ? `${r1(x.hrPeak)} bpm` : DASH), trow('Standing heart rate', `${r1(x.hrStd)} bpm`), trow('Rise', `${sign(x.hrStd - x.hrSup, 1)} bpm`), trow('RMSSD lying', `${r1(x.rmSup)} ms`), trow('RMSSD standing', `${r1(x.rmStd)} ms`)]);
  else body = table([trow('Pattern', BREATHS[x.pat]?.n || DASH), trow('Rate', `${x.rate} a minute`), trow('Breaths', x.cyc), x.rsa != null ? trow('Heart-rate swing', `${r1(x.rsa)} bpm`) : '', x.hr1 != null ? trow('First → last minute', `${Math.round(x.hr1)} → ${Math.round(x.hr2)} bpm`) : '', x.share != null ? trow('Power at your breath', `${Math.round(x.share)}%`) : '']);
  return `${sheetTop(`${dateLabel(p.k, { weekday: 'long', day: 'numeric', month: 'long' })} · ${hm(new Date(x.t).getHours() * 60 + new Date(x.t).getMinutes())}`, L.n, `lab-${x.t}`)}${body}
    <div class="rowb">${x.rr ? `<a class="solid link" href="#beats-l${x.t}">Explore beat by beat</a><button class="ghost" data-act="rrexp" data-k="${p.k}" data-t="${x.t}">Save as a file</button>` : ''}<span class="grow"></span><button class="danger" data-hold="labdelh" data-k="${p.k}" data-t="${x.t}">Hold to delete</button></div></aside>`;
}
function labRemove(k, t) {
  const list = S.lab[k] || [], i = list.findIndex(y => String(y.t) === String(t));
  if (i < 0) return;
  const was = list[i];
  list.splice(i, 1); if (!list.length) delete S.lab[k];
  save(); if (pop) closePop(); else render();
  undoable(`${LABS[was.kind]?.n || 'Session'} deleted`, () => { (S.lab[k] ||= []).splice(i, 0, was); });
}
ACT_HOLD.labdelh = el => labRemove(el.dataset.k, el.dataset.t);
SWIPE.labdel = el => labRemove(el.dataset.k, el.dataset.t);
function labAct(a, el) {
  const s = S.settings, v = el.dataset.v, set = (k, val) => { s[k] = val; save(); buzz('tick'); if (LAB.kind === 'breathe' || !HR.mode) { LAB.phases = null; LAB.raf && cancelAnimationFrame(LAB.raf); LAB.raf = 0; } render(); return true; };
  switch (a) {
    case 'labgo': labStart(el.dataset.k); return true;
    case 'labstop': if ((HR.mode === 'breathe' || HR.mode === 'live') && (Date.now() - HR.t0) / 1000 >= LIVE_MIN) labDone(); else labCancel(); return true;
    case 'livetag': liveTag(v); return true;
    case 'rrexp': rrExport(el.dataset.k, el.dataset.t); return true;
    case 'labinfo': openPop({ kind: 'labinfo', k: el.dataset.k, t: el.dataset.t }); return true;
    case 'brpat': return set('brPat', v);
    case 'brrate': return set('brRate', +v);
    case 'brmin': return set('brMin', +v);
    case 'brhap': return set('brHaptic', v);
    case 'spdur': return set('spDur', +v);
    case 'sppos': return set('spPos', v);
  }
  return false;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('lab.js');
