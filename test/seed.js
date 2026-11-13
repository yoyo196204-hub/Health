// Builds a realistic v3 (old-format) state: 45 days of weigh-ins, steps, sleep, food, HRV and lifting sessions
// stored by exercise name, the way Health saved them before the training library. Used by the tests and screenshots.
function seedV3(today = new Date()) {
  const dk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = n => { const d = new Date(today); d.setHours(12); d.setDate(d.getDate() - n); return dk(d); };
  let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const S = { v: 3, profile: { sex: 'm', dob: '1999-12-18', h: 183, w0: 94.5, waist0: 110, days: 3, equip: 'gym', shoulder: true },
    weights: {}, waist: {}, steps: {}, sleep: {}, rhr: {}, sleepx: {}, manual: { weights: {}, steps: {}, sleep: {} }, wx: {}, ex: {}, food: {}, full: {},
    lifts: {}, prehab: {}, hrv: {}, cardio: {}, pairs: {}, custom: [], freq: {}, meta: {} };
  const meals = [['breakfast', [['poha', 'Pohe', '1 plate', 270, 6, 3], ['whey', 'Whey protein', '1 scoop', 120, 24, 0]]],
    ['lunch', [['chapati', 'Chapati / poli', '1 medium', 100, 3, 3, 3], ['bhaji', 'Bhaji', '1 katori', 120, 3, 4], ['varan', 'Varan', '1 katori', 140, 7, 3]]],
    ['dinner', [['chapati', 'Chapati / poli', '1 medium', 100, 3, 3, 2], ['usal', 'Usal', '1 katori', 200, 11, 7]]]];
  const order = ['A', 'B', 'C'], plan = {
    A: [['Leg press', 100], ['DB bench press, neutral grip', 22], ['Seated cable row', 45], ['Romanian deadlift', 60], ['Cable face pull', 15], ['Plank', 0]],
    B: [['DB split squat', 14], ['Lat pulldown, neutral grip', 50], ['Incline DB press, 30°', 20], ['Hip thrust', 70], ['DB lateral raise, scapular plane', 6], ['Dead bug', 0]],
    C: [['Hack squat', 80], ['Landmine press', 25], ['Chest-supported row', 40], ['Leg curl', 35], ['DB curl', 10], ['Triceps pushdown', 25]] };
  let li = 0;
  for (let n = 44; n >= 1; n--) {
    const k = day(n);
    S.weights[k] = Math.round((94.2 - (44 - n) * 0.075 + (rnd() - 0.5) * 1.2) * 10) / 10; S.manual.weights[k] = 1;
    S.steps[k] = Math.round(5000 + rnd() * 5000);
    S.sleep[k] = Math.round((6 + rnd() * 2.2) * 10) / 10;
    S.sleepx[k] = { d: 70, l: 220, r: 90, w: 20, on: -60 + Math.round(rnd() * 60), hr: 56 + Math.round(rnd() * 4) };
    S.rhr[k] = 58 + Math.round(rnd() * 5);
    if (n % 3 !== 0) {
      S.food[k] = [];
      for (const [m, items] of meals) for (const [id, nm, u, kc, p, fb, q] of items) S.food[k].push({ id, n: nm, u, k: kc, p, fb, cat: 'roti', q: q || 1, m });
    }
    if (rnd() > 0.35) S.hrv[k] = { rmssd: Math.round((42 + (rnd() - 0.5) * 14) * 10) / 10, hr: 57 + Math.round(rnd() * 4), q: 92 };
    if (n % 2 === 0 && n > 2) {
      const L = order[li++ % 3], prog = Math.floor(li / 3);
      const ex = {};
      for (const [name, w] of plan[L]) ex[name] = [0, 1, 2].map(s => [w ? w + prog * 2.5 : null, (name === 'Plank' ? 40 : 9) + Math.min(3, prog) - (s === 2 ? 1 : 0)]);
      S.lifts[k] = { day: L, ex };
    }
  }
  S.waist[day(30)] = 108; S.waist[day(10)] = 106.5;
  S.cardio[day(5)] = [{ t: Date.now() - 5 * 864e5, kind: 'walk', dur: 1800, avg: 118, max: 131, z: [300, 1500, 0, 0] }];
  return S;
}
if (typeof module !== 'undefined') module.exports = { seedV3 };
