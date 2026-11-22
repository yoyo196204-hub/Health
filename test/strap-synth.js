// Synthetic strap recordings for the tests: beats with breathing in them (respiratory sinus arrhythmia), one ectopic
// beat and its pause, one missed beat, and packets as the strap sends them, one a second, with a stretch lost in
// transit. A cardio ramp whose beats go from correlated (α1 high, easy) to uncorrelated (α1 low, hard). Seeded, so
// every run is the same. Runs in node and, as a string, in the page.
function strapSynth(kind, t0, seed = 7) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return u - 3; };
  const rr = [];
  if (kind === 'cardio') {
    let walk = 0;
    for (let t = 0; t < 1500;) {
      const f = t / 1500, base = 60000 / (92 + 72 * f), w = 1 - f;   // 92 → 164 bpm
      walk = walk * 0.97 + gauss() * 6;
      const x = base + w * walk + (1 - w * 0.8) * gauss() * 4 + 4 * w * Math.sin(2 * Math.PI * 0.3 * t);
      rr.push(x); t += x / 1000;
    }
  } else {
    for (let t = 0; t < (kind === 'ortho' ? 300 : 360);) {
      const stand = kind === 'ortho' && t > 150, base = stand ? 760 - 120 * Math.exp(-(t - 150) / 12) * Math.sin(Math.min(1, (t - 150) / 8) * Math.PI) : 1030;
      const x = base + (stand ? 18 : 58) * Math.sin(2 * Math.PI * 0.24 * t) + gauss() * (stand ? 5 : 11);
      rr.push(x); t += x / 1000;
    }
    if (kind !== 'ortho') { rr[150] = rr[150] * 0.62; rr[151] = rr[151] * 1.4; rr[260] = rr[260] + rr[261]; rr.splice(261, 1); }
  }
  // Packets: the beats that ended in each second, received 40–120 ms later; 4 seconds of them lost at the middle.
  const ru = [], pk = [];
  let acc = 0, sec = 1, buf = [];
  const lostAt = rr.reduce((a, b) => a + b, 0) / 2000;
  for (const x of rr) {
    acc += x;
    if (acc / 1000 >= sec) {
      if (buf.length && !(sec > lostAt && sec <= lostAt + 4)) { for (const u of buf) ru.push(u); pk.push([ru.length - 1, Math.round(acc - x + 40 + rnd() * 80), Math.round(60000 / x), 1]); }
      buf = []; sec = Math.floor(acc / 1000) + 1;
    }
    buf.push(Math.round(x * 1.024));
  }
  return { id: `r${t0}`, kind: kind === 'cardio' ? 'cardio' : kind, t0, ru, pk, dev: 'Polar H9 A1B2C3D4', who: 'me' };
}
if (typeof module !== 'undefined') module.exports = { strapSynth };
