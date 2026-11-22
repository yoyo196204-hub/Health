'use strict';
// A Gadgetbridge database. Gadgetbridge is the open-source app that runs an Amazfit watch without Zepp; it keeps
// everything the watch sends in one SQLite file, which it writes out from Data management (Export Data, or Auto
// export every day), and inside its "Export zip" as database/Gadgetbridge.
//
// The rows become days exactly as the daily sync makes them, through the same code as a Health Connect backup
// (hcbNight, hcbSleep, hcbHeart), so an imported day and a synced day never disagree. A Zepp OS watch (Bip 5, Bip 6,
// Balance, Active and the rest) sends:
//   - a row every minute with its steps and heart rate (HUAMI_EXTENDED_ACTIVITY_SAMPLE; older Amazfit and Mi Band
//     watches write MI_BAND_ACTIVITY_SAMPLE, read the same way for steps and heart rate);
//   - each night as the watch scored it, a binary report with its stages, decoded as Gadgetbridge decodes it; a later
//     report of the same night replaces the earlier one;
//   - the day's resting heart rate, and HRV, blood oxygen and breathing-rate readings;
//   - each workout's summary.
// When two watches cover one day, the one worn more of it is that day's watch, so steps are never counted twice.

const GB_ACT = ['HUAMI_EXTENDED_ACTIVITY_SAMPLE', 'MI_BAND_ACTIVITY_SAMPLE'];
// Workout kinds as Gadgetbridge stores them (its ActivityKind codes), with the names the sync gives them.
const GB_KIND = { 0x10: 'Run', 0x20: 'Walk', 0x40: 'Swim', 0x80: 'Cycle', 0x100: 'Run', 0x400: 'Swim', 0x800: 'Cycle', 0x1000: 'Elliptical',
  0x4000: 'Yoga', 0x8000: 'Football', 0x10000: 'Rowing', 0x20000: 'Cricket', 0x40000: 'Basketball', 0x80000: 'Table tennis', 0x100000: 'Badminton',
  0x200000: 'Strength training', 0x400000: 'Hike', 0x04000001: 'Run', 0x04000008: 'Stairs', 0x04000009: 'Pilates', 0x0400000a: 'Swim', 0x0400000b: 'Tennis',
  0x0400000d: 'Table tennis', 0x04000011: 'Breathing', 0x04000012: 'Walk', 0x04000016: 'Rowing', 0x0400003a: 'Martial arts', 0x0400003b: 'Stairs',
  0x04000045: 'HIIT', 0x0400004a: 'Squash', 0x04000050: 'Meditation', 0x04000058: 'Volleyball', 0x0400005b: 'Martial arts', 0x0400005c: 'Dance',
  0x04000060: 'Martial arts', 0x04000062: 'HIIT', 0x04000065: 'Martial arts', 0x04000067: 'Run', 0x04000068: 'Martial arts', 0x0400006a: 'Strength training',
  0x04000074: 'Stretching', 0x04000077: 'Calisthenics', 0x0400007a: 'Calisthenics', 0x040000e2: 'Hike' };
// Sleep stages in a Zepp OS night report: 4 light, 5 deep, 7 awake, 8 REM; anything else is counted as light.
const GB_STAGE = { 4: 2, 5: 3, 7: 1, 8: 4 };
const GB_STEP = { HUAMI_EXTENDED_ACTIVITY_SAMPLE: 'minutes', MI_BAND_ACTIVITY_SAMPLE: 'minutes', HUAMI_SLEEP_SESSION_SAMPLE: 'nights',
  HUAMI_HEART_RATE_RESTING_SAMPLE: 'resting heart rate', GENERIC_HRV_VALUE_SAMPLE: 'HRV', HUAMI_SPO2_SAMPLE: 'blood oxygen', GENERIC_SPO2_SAMPLE: 'blood oxygen',
  HUAMI_SLEEP_RESPIRATORY_RATE_SAMPLE: 'breathing rate', GENERIC_RESPIRATORY_RATE_SAMPLE: 'breathing rate', GENERIC_WEIGHT_SAMPLE: 'weight', BASE_ACTIVITY_SUMMARY: 'workouts' };

function gbIs(db) { return db.has('DEVICE') && GB_ACT.some(t => db.has(t)); }

// One night report, as Gadgetbridge decodes it (HuamiSleepSessionSampleProvider): little-endian, the midnight the
// night is counted from at 0x04 (seconds), the number of stages at 0x54, then each stage in 5 bytes from 0x56: its
// first and last minute (both included) after the midnight before that one, and its type.
function gbNight(b) {
  if (!(b instanceof Uint8Array) || b.length < 0x56) return null;
  const u16 = o => b[o] | b[o + 1] << 8, mid = (b[4] | b[5] << 8 | b[6] << 16 | b[7] << 24) >>> 0, base = (mid - 86400) * 1000, st = [];
  if (mid < 946684800) return null;
  for (let i = 0, n = b[0x54]; i < n && 0x56 + 5 * i + 5 <= b.length; i++) {
    const o = 0x56 + 5 * i, s = u16(o), e = u16(o + 2);
    if (e >= s && e < 2880) st.push([base + s * 6e4, base + (e + 1) * 6e4, GB_STAGE[b[o + 4]] || 2]);
  }
  if (!st.length) return null;
  st.sort((x, y) => x[0] - y[0]);
  return { s: st[0][0], e: Math.max(...st.map(x => x[1])), st };
}

async function gbRead(db, onStep = () => {}) {
  const dev = {}, days = {}, day = k => (DATE.test(k) && k <= todayKey() && k >= '2000-01-01' ? (days[k] ||= {}) : null), dayOf = hcbDayer();
  const step = async name => { onStep(name); await zipTick(); };
  db.each('DEVICE', r => { dev[r._id] = { name: String(r.alias || r.name || 'Watch').trim().slice(0, 40), worn: 0 }; });

  // Minutes: worn minutes (a step or a heart rate) and steps, per day and watch; every heart rate with its watch.
  const per = {}, T = [], B = [], D = [];
  for (const name of GB_ACT) {
    await step(name);
    db.each(name, r => {
      const ms = r.timestamp * 1000, id = r.device_id, hr = r.heart_rate, s = r.steps > 0 && r.steps <= 300 ? r.steps : 0, beat = hr >= 30 && hr <= 230;
      if (!(ms > 946684800000) || !(s || beat)) return;
      const a = (per[dayOf(ms)] ||= {})[id] ||= [0, 0, new Uint8Array(288)], t = new Date(ms);
      a[0]++; a[1] += s; a[2][Math.floor((t.getHours() * 60 + t.getMinutes()) / 5)] = 1;
      if (dev[id]) dev[id].worn++;
      if (beat && T.length < 3e6) { T.push(ms); B.push(hr); D.push(id); }
    });
  }
  // Each day's watch: the one worn more of it. Its steps are the day's.
  const mainDev = {};
  for (const [k, by] of Object.entries(per)) {
    const [id, [, st, bins]] = Object.entries(by).reduce((a, b) => (b[1][0] > a[1][0] ? b : a));
    mainDev[k] = +id;
    const o = day(k); if (o && st >= 1) o.st = st;
    // Minutes worn: that watch's 5-minute bins with a step or a heart rate, less any hour or more with neither.
    if (o) o.wm = wornMin(bins);
  }
  const own = (id, ms) => { const m = mainDev[dayOf(ms)]; return m == null || m === id; };

  // Nights: per watch, in the order they were reported; a report overlapping an earlier one is its revision.
  await step('HUAMI_SLEEP_SESSION_SAMPLE');
  const reports = {};
  db.each('HUAMI_SLEEP_SESSION_SAMPLE', r => {
    const n = gbNight(r.data); if (!n) return;
    const list = reports[r.device_id] ||= [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].s < n.e && n.s < list[i].e) list.splice(i, 1);
    list.push(n);
  });
  const nights = {};
  for (const [id, list] of Object.entries(reports)) for (const x of list) { const n = hcbNight(x.st, x.s, x.e, +id); if (n) (nights[dayOf(x.e)] ||= []).push(n); }
  const main = hcbSleep(nights, day, (n, k) => n.p === mainDev[k]);

  // Point readings: the day's average from that day's watch. A table that is not there gives nothing.
  const avg = async (names, field, key, round, ok, when = r => dayOf(r.timestamp)) => {
    const all = {};
    for (const name of names) {
      await step(name);
      db.each(name, r => {
        const v = r[field];
        if (typeof v !== 'number' || !(r.timestamp > 946684800000) || !ok(v) || !own(r.device_id, r.timestamp)) return;
        const a = all[when(r)] ||= [0, 0]; a[0] += v; a[1]++;
      });
    }
    for (const [k, a] of Object.entries(all)) { const o = day(k); if (o) o[key] = round(a[0] / a[1]); }
  };
  // Resting heart rate is one figure a day, stamped with the zone the watch was in.
  await avg(['HUAMI_HEART_RATE_RESTING_SAMPLE'], 'heart_rate', 'rh', Math.round, v => v >= 25 && v <= 150, r => hcbDay(r.timestamp, (r.utc_offset || 0) / 1000));
  await avg(['HUAMI_SPO2_SAMPLE', 'GENERIC_SPO2_SAMPLE'], 'spo2', 'o2', r1, v => v >= 70 && v <= 100);
  const o2 = [];
  for (const name of ['HUAMI_SPO2_SAMPLE', 'GENERIC_SPO2_SAMPLE']) db.each(name, r => { const v = r.spo2; if (v >= 70 && v <= 100 && r.timestamp > 946684800000 && own(r.device_id, r.timestamp)) o2.push([r.timestamp, v, true]); });
  hcbNightO2(main, o2, day);
  await avg(['HUAMI_SLEEP_RESPIRATORY_RATE_SAMPLE'], 'rate', 'br', r1, v => v >= 4 && v <= 40);
  await avg(['GENERIC_RESPIRATORY_RATE_SAMPLE'], 'respiratory_rate', 'br', r1, v => v >= 4 && v <= 40);
  // HRV: the readings taken during the night's main sleep, so a daytime reading cannot pull the figure down; the
  // day's readings only when none fell in a sleep the watch recorded.
  await step('GENERIC_HRV_VALUE_SAMPLE');
  const hvAll = {}, hvNight = {};
  db.each('GENERIC_HRV_VALUE_SAMPLE', r => {
    const t = r.timestamp, v = r.value;
    if (!(v >= 1 && v <= 300) || !(t > 946684800000) || !own(r.device_id, t)) return;
    const k = dayOf(t), n = [k, shift(k, 1)].find(n => main[n] && t >= main[n].s && t <= main[n].e);
    if (n) (hvNight[n] ||= []).push(v); else (hvAll[k] ||= []).push(v);
  });
  for (const k of new Set([...Object.keys(hvAll), ...Object.keys(hvNight)])) { const o = day(k), v = hvNight[k] || hvAll[k]; if (o && v) o.hv = r1(mean(v)); }
  // Weight from a scale paired with Gadgetbridge: the day's first.
  await step('GENERIC_WEIGHT_SAMPLE');
  const wt = {};
  db.each('GENERIC_WEIGHT_SAMPLE', r => { const k = dayOf(r.timestamp), v = num(r.weight_kg, ...LIMITS.weights); if (v != null && r.timestamp > 946684800000 && (!wt[k] || r.timestamp < wt[k][0])) wt[k] = [r.timestamp, v]; });
  for (const [k, [, v]] of Object.entries(wt)) { const o = day(k); if (o) o.wt = r1(v); }

  // Workouts, from every watch, each with its own watch's heart rate.
  await step('BASE_ACTIVITY_SUMMARY');
  const ex = [], order = Array.from(T.keys()).sort((a, b) => T[a] - T[b]);
  const aT = Float64Array.from(order, i => T[i]), aB = Uint8Array.from(order, i => B[i]), aD = Float64Array.from(order, i => D[i]);
  const lower = x => { let a = 0, b = aT.length; while (a < b) { const m = (a + b) >> 1; if (aT[m] < x) a = m + 1; else b = m; } return a; };
  db.each('BASE_ACTIVITY_SUMMARY', r => {
    const s = r.start_time, e = r.end_time;
    if (!(s > 946684800000) || !(e > s)) return;
    let sum = null;
    try { sum = typeof r.summary_data === 'string' ? JSON.parse(r.summary_data) : null; } catch (err) { sum = null; }
    const v = k => { const x = sum?.[k]; return typeof x === 'number' ? x : typeof x?.value === 'number' ? x.value : null; };
    const name = typeof r.name === 'string' ? r.name.trim() : '', kcal = v('active_calories') ?? v('caloriesBurnt');
    const t = [], b = [];
    for (let i = lower(s), end = lower(e + 1); i < end; i++) if (aD[i] === r.device_id) { t.push(aT[i]); b.push(aB[i]); }
    const w = { s, e, k: GB_KIND[r.activity_kind] || (name ? name.slice(0, 24) : 'Workout'), src: 'Gadgetbridge', h: hcbHist(t, b, e) };
    if (kcal > 0) w.kcal = Math.round(kcal);
    ex.push(w);
  });

  // The rest of the heart rate from each day's watch alone, so two sensors are never mixed.
  const idx = [];
  for (let i = 0; i < aT.length; i++) if (own(aD[i], aT[i])) idx.push(i);
  hcbHeart(Float64Array.from(idx, i => aT[i]), Uint8Array.from(idx, i => aB[i]), days, day, main, []);
  const worn = Object.values(dev).filter(d => d.worn).sort((a, b) => b.worn - a.worn);
  return { days, ex, watch: worn[0]?.name || null, apps: [...new Set(worn.map(d => d.name))] };
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('gadgetbridge.js');
