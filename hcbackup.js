'use strict';
// A Health Connect backup: the "Health Connect.zip" Android writes when you turn on Export in Health Connect's own
// settings. Inside is one SQLite database with every record every app ever wrote, so it reaches back far further than
// a sync (which reads at most 120 days, and only what Health Connect lets an app see).
//
// The records become days exactly as the app's own sync makes them (HealthReader.kt), so an imported day and a synced
// day can never disagree: the watch app's own figures win where another app wrote the same kind of data (and when two
// watch apps wrote one day, as on the day you move from Zepp to Gadgetbridge, the one with more of it); a night is
// filed under the morning it ends, its longest session is the main sleep and the others naps; point readings are the
// day's average (the watch's alone on days it wrote any); weight is the morning's first; heart rate gives a resting
// estimate, the heart rate asleep and its low point, the 24-hour curve, and each workout's seconds at each bpm.

const HCB_WATCH = ['com.huami.watch.hmwatchmanager', 'nodomain.freeyourgadget.gadgetbridge', 'nodomain.freeyourgadget.gadgetbridge.nightly', 'com.mi.health', 'com.xiaomi.wearable', 'fi.polar.polarflow', 'com.garmin.android.apps.connectmobile', 'com.fitbit.FitbitMobile', 'com.samsung.android.wear.shealth'];
const HCB_NAMES = { 'com.huami.watch.hmwatchmanager': 'Zepp', 'nodomain.freeyourgadget.gadgetbridge': 'Gadgetbridge', 'nodomain.freeyourgadget.gadgetbridge.nightly': 'Gadgetbridge', 'com.google.android.apps.fitness': 'Google Fit', 'com.sec.android.app.shealth': 'Samsung Health', 'com.mi.health': 'Mi Fitness', 'com.xiaomi.wearable': 'Mi Fitness',
  'fi.polar.polarflow': 'Polar Flow', 'com.google.android.apps.healthdata': 'Health Connect', 'ch.duartesantos.opengym': 'openGym', 'com.inbody2014.inbody': 'InBody' };
const hcbApp = p => HCB_NAMES[p] || (p ? p.split('.').pop().replace(/^./, c => c.toUpperCase()) : 'App');
// Exercise types as Android stores them in the database (android.health.connect ExerciseSessionType), with the same
// names the sync gives them.
const HCB_KIND = { 53: 'Walk', 33: 'Run', 34: 'Run', 4: 'Cycle', 5: 'Cycle', 21: 'Hike', 48: 'Swim', 49: 'Swim', 60: 'Elliptical', 31: 'Rowing', 61: 'Rowing',
  44: 'Stairs', 59: 'Stairs', 45: 'Strength training', 55: 'Strength training', 8: 'Calisthenics', 20: 'HIIT', 57: 'Yoga', 27: 'Pilates', 46: 'Stretching',
  17: 'Breathing', 1: 'Badminton', 9: 'Cricket', 41: 'Football', 50: 'Table tennis', 51: 'Tennis', 43: 'Squash', 3: 'Basketball', 52: 'Volleyball', 10: 'Dance', 24: 'Martial arts', 7: 'Martial arts' };

// The calendar day a moment falls on: in the zone it was recorded in when that is known, else this phone's.
function hcbDay(ms, off) { return off == null ? dk(new Date(ms)) : new Date(ms + off * 1000).toISOString().slice(0, 10); }
// The same on this phone for many moments in a row: the day's bounds are kept, so a run of moments in one day costs
// one comparison each rather than a date to build.
function hcbDayer() {
  let lo = Infinity, hi = -Infinity, key = '';
  return ms => {
    if (ms < lo || ms >= hi) { const d = new Date(ms), a = new Date(d.getFullYear(), d.getMonth(), d.getDate()); key = dk(d); lo = a.getTime(); a.setDate(a.getDate() + 1); hi = a.getTime(); }
    return key;
  };
}

async function hcBackup(db, onStep = () => {}) {
  const pkgOf = {}, origins = new Set(), seen = {};
  db.each('application_info_table', r => { pkgOf[r.row_id] = r.package_name; });
  const pkg = r => pkgOf[r.app_info_id] || '';
  const days = {}, day = k => (DATE.test(k) && k <= todayKey() && k >= '2000-01-01' ? (days[k] ||= {}) : null);
  // Every app that wrote anything, and when it last wrote: the watch app named in the preview is the one still writing.
  const t = async (name, fn) => { onStep(name); await zipTick(); return db.each(name, r => { if (r.app_info_id != null) { const p = pkg(r); origins.add(p); if (r.last_modified_time > (seen[p] || 0)) seen[p] = r.last_modified_time; } fn(r); }); };

  // Totals per app per day; a record that crosses midnight is shared between the days by time.
  const per = async (name, field, scale = 1) => {
    const by = {};
    await t(name, r => {
      const v = (r[field] || 0) * scale, s = r.start_time, e = r.end_time, p = pkg(r);
      if (!(v > 0) || s == null) return;
      if (!(e > s)) { const k = hcbDay(s, r.start_zone_offset); ((by[k] ||= {})[p] = (by[k][p] || 0) + v); return; }
      for (let a = s; a < e;) {
        const k = hcbDay(a, r.start_zone_offset), next = Math.min(e, Date.parse(shift(k, 1) + 'T00:00:00Z') - (r.start_zone_offset ?? -new Date(a).getTimezoneOffset() * 60) * 1000);
        if (!(next > a)) break;
        (by[k] ||= {})[p] = (by[k][p] || 0) + v * (next - a) / (e - s);
        a = next;
      }
    });
    return by;
  };
  const steps = await per('steps_record_table', 'count'), dist = await per('distance_record_table', 'distance'), act = await per('active_calories_burned_record_table', 'energy', 1 / 1000), tot = await per('total_calories_burned_record_table', 'energy', 1 / 1000);
  const watches = new Set(HCB_WATCH.filter(p => origins.has(p))), isW = p => watches.has(p);
  const watch = [...watches].sort((a, b) => (seen[b] || 0) - (seen[a] || 0))[0] || null;
  // The watch's own figure for a day when it wrote one; otherwise the largest single app's, never a sum of two
  // devices counting the same steps.
  const pick = by => { const w = Object.keys(by).filter(isW); return Math.max(...(w.length ? w : Object.keys(by)).map(p => by[p])); };
  for (const [k, by] of Object.entries(steps)) { const d = day(k), v = pick(by); if (d && v >= 1) d.st = Math.round(v); }
  for (const [k, by] of Object.entries(dist)) { const d = day(k), v = pick(by); if (d && v > 0) d.di = Math.round(v * 10) / 10; }
  // Energy: the fullest app's figure. A watch app often writes only part of the day's energy (its workouts), so its
  // number is not the day's, which is what Health Connect's own total gives the sync.
  const most = by => Math.max(...Object.values(by));
  for (const [k, by] of Object.entries(act)) { const d = day(k), v = most(by); if (d && v > 0) d.ak = Math.round(v * 10) / 10; }
  for (const [k, by] of Object.entries(tot)) { const d = day(k), v = most(by); if (d && v > 0) d.tk = Math.round(v * 10) / 10; }

  // Sleep: each session with its stages, filed under the morning it ends.
  const stages = {};
  onStep('sleep_stages_table'); await zipTick();
  db.each('sleep_stages_table', r => (stages[r.parent_key] ||= []).push(r));
  const CODE = { 5: 3, 6: 4, 4: 2, 2: 2, 1: 1, 7: 1, 3: 1 }, nights = {};
  await t('sleep_session_record_table', s => {
    const st = (stages[s.row_id] || []).filter(x => CODE[x.stage_type]).sort((a, b) => a.stage_start_time - b.stage_start_time).map(x => [x.stage_start_time, x.stage_end_time, CODE[x.stage_type]]);
    const n = hcbNight(st, s.start_time, s.end_time, pkg(s));
    if (n) (nights[hcbDay(s.end_time, s.end_zone_offset)] ||= []).push(n);
  });
  const main = hcbSleep(nights, day, n => isW(n.p));

  // Point readings: the day's average, the watch's alone on days it wrote any.
  const avg = async (name, field, key, round, ok = v => true) => {
    const all = {}, mine = {};
    await t(name, r => {
      const v = r[field], k = hcbDay(r.time, r.zone_offset);
      if (v == null || r.time < 946684800000 || !ok(v)) return;
      const a = all[k] ||= [0, 0]; a[0] += v; a[1]++;
      if (isW(pkg(r))) { const m = mine[k] ||= [0, 0]; m[0] += v; m[1]++; }
    });
    for (const [k, a] of Object.entries(all)) { const o = day(k), m = mine[k] || a; if (o) o[key] = round(m[0] / m[1]); }
  };
  await avg('resting_heart_rate_record_table', 'beats_per_minute', 'rh', Math.round, v => v >= 25 && v <= 150);
  await avg('heart_rate_variability_rmssd_record_table', 'heart_rate_variability_millis', 'hv', r1, v => v > 0 && v <= 300);
  await avg('oxygen_saturation_record_table', 'percentage', 'o2', r1, v => v >= 70 && v <= 100);
  // Blood oxygen in the night's main sleep, the watch's own readings where it wrote any.
  const o2 = [];
  await t('oxygen_saturation_record_table', r => { const v = r.percentage; if (v >= 70 && v <= 100 && r.time > 946684800000) o2.push([r.time, v, isW(pkg(r))]); });
  hcbNightO2(main, o2, day);
  await avg('respiratory_rate_record_table', 'rate', 'br', r1, v => v >= 4 && v <= 40);
  // The day's first weight and body fat (a morning weigh-in), and the day's latest VO2max estimate.
  const firstOf = async (name, field, key, conv, latest = false) => {
    const best = {};
    await t(name, r => { const k = hcbDay(r.time, r.zone_offset); if (r[field] == null || r.time < 946684800000) return; const b = best[k]; if (!b || (latest ? r.time > b.time : r.time < b.time)) best[k] = r; });
    for (const [k, r] of Object.entries(best)) { const o = day(k); if (o) o[key] = conv(r[field]); }
  };
  await firstOf('weight_record_table', 'weight', 'wt', g => r1(g / 1000));
  await firstOf('body_fat_record_table', 'percentage', 'bf', r1);
  await firstOf('vo2_max_record_table', 'vo2_milliliters_per_minute_kilogram', 'vo', r1, true);

  // Workouts, from any app but this one.
  const ex = [];
  await t('exercise_session_record_table', r => {
    const p = pkg(r);
    if (p === 'app.health.personal' || r.start_time == null || !(r.end_time > r.start_time)) return;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const w = { s: r.start_time, e: r.end_time, k: HCB_KIND[r.exercise_type] || (title ? title.slice(0, 24) : 'Workout'), src: hcbApp(p), h: [] };
    if (p === 'ch.duartesantos.opengym') { w.og = true; if (title) w.ti = title.slice(0, 60); }
    ex.push(w);
  });

  // Heart rate: every sample with the app that wrote it. On a day a watch app covered, only the samples of the watch
  // app with the most of them that day are kept, so two sensors are never mixed.
  const parent = {};
  await t('heart_rate_record_table', r => { parent[r.row_id] = pkg(r); });
  const T = [], B = [], P = [];
  onStep('heart_rate_record_series_table'); await zipTick();
  db.each('heart_rate_record_series_table', r => {
    const b = r.beats_per_minute;
    if (b >= 30 && b <= 230 && r.epoch_millis > 946684800000 && T.length < 3e6) { T.push(r.epoch_millis); B.push(b); P.push(parent[r.parent_key] || ''); }
  });
  const dayOf = hcbDayer(), K = T.map(dayOf), count = {}, dayW = {};
  for (let i = 0; i < T.length; i++) if (isW(P[i])) { const c = count[K[i]] ||= {}; c[P[i]] = (c[P[i]] || 0) + 1; }
  for (const [k, c] of Object.entries(count)) dayW[k] = Object.keys(c).reduce((a, b) => (c[b] > c[a] ? b : a));
  const idx = [];
  for (let i = 0; i < T.length; i++) if (!dayW[K[i]] || P[i] === dayW[K[i]]) idx.push(i);
  idx.sort((a, b) => T[a] - T[b]);
  hcbHeart(Float64Array.from(idx, i => T[i]), Uint8Array.from(idx, i => B[i]), days, day, main, ex);
  return { days, ex, watch: watch ? hcbApp(watch) : null, apps: [...origins].filter(p => p && p !== 'app.health.personal').map(hcbApp).sort() };
}
// One sleep session as the app keeps it: minutes in each stage, and the night as it happened, in runs of [minutes after
// the start, length, stage 1 awake 2 light 3 deep 4 REM], neighbouring pieces of one stage joined. stages: [start ms,
// end ms, stage], in order. A session with no stages counts as light sleep; one under 15 minutes asleep is not kept.
function hcbNight(stages, s, e, p) {
  let d = 0, l = 0, r = 0, w = 0, last = null;
  const seg = [];
  for (const [a, b, c] of stages) {
    const off = Math.max(0, Math.floor((a - s) / 6e4)), len = Math.floor((b - a) / 6e4);
    if (len <= 0) continue;
    if (c === 3) d += len; else if (c === 4) r += len; else if (c === 2) l += len; else w += len;
    if (last && last[2] === c && last[0] + last[1] >= off - 1) last[1] = off + len - last[0];
    else { if (last && seg.length < 200) seg.push(last); last = [off, len, c]; }
  }
  if (last && seg.length < 200) seg.push(last);
  if (d + l + r === 0) l = Math.floor((e - s) / 6e4) - w;
  return d + l + r >= 15 ? { s, e, d, l, r, w, seg, p } : null;
}
// Readings [time, value, from a watch] that fall inside a main sleep (main[k] = { s, e }, filed under the morning
// it ends), kept per night as their mean, how many, and the lowest (keys [mean, count, lowest]; lowest optional).
// The watch's own wherever it wrote any. Blood oxygen: o2n, o2c, o2l; skin temperature: sk, skc.
function hcbNightly(main, pts, day, [km, kc, kl], round = r1) {
  const by = {}, mine = {};
  for (const [t, v, w] of pts) {
    const k0 = dk(new Date(t)), k = [k0, shift(k0, 1)].find(n => main[n] && t >= main[n].s && t <= main[n].e);
    if (!k) continue;
    (by[k] ||= []).push(v); if (w) (mine[k] ||= []).push(v);
  }
  for (const k of Object.keys(by)) {
    const v = mine[k] || by[k], o = day(k);
    if (o) Object.assign(o, { [km]: round(mean(v)), [kc]: v.length }, kl ? { [kl]: round(Math.min(...v)) } : {});
  }
}
const hcbNightO2 = (main, pts, day) => hcbNightly(main, pts, day, ['o2n', 'o2c', 'o2l']);
// The nights of each morning: the longest of the preferred source's is the main sleep (the others' only when it has
// none), and the others that do not overlap it are naps. Returns each day's main night.
function hcbSleep(nights, day, prefer) {
  const main = {}, at = ms => { const x = new Date(ms); return x.getHours() * 60 + x.getMinutes(); };
  for (const [k, all] of Object.entries(nights)) {
    const mine = all.filter(n => prefer(n, k)), list = mine.length ? mine : all, m = list.reduce((a, b) => (b.d + b.l + b.r > a.d + a.l + a.r ? b : a));
    const o = day(k); if (!o) continue;
    main[k] = m;
    let on = at(m.s); if (on > 720) on -= 1440;
    const naps = list.filter(n => n !== m && (n.e <= m.s || n.s >= m.e)).reduce((a, n) => a + n.d + n.l + n.r, 0);
    o.sl = { d: m.d, l: m.l, r: m.r, w: m.w, on, off: at(m.e), bed: Math.round((m.e - m.s) / 6e4), nap: naps, ...(m.seg.length ? { seg: m.seg } : {}) };
  }
  return main;
}
// Heart rate, every sample in time order (hT ms, hB bpm), four ways: a resting estimate on days with no resting figure
// (the 5th percentile of the day's readings), the heart rate asleep and its low point, the 24-hour curve in 5-minute
// medians for the last 45 days, and each workout's seconds at each bpm (a gap counts up to two minutes).
function hcbHeart(hT, hB, days, day, main, ex) {
  if (!hT.length) return;
  const lower = x => { let a = 0, b = hT.length; while (a < b) { const m = (a + b) >> 1; if (hT[m] < x) a = m + 1; else b = m; } return a; };
  const byDay = {}, bins = {}, seen = {}, recent = shift(todayKey(), -45);
  for (let i = 0; i < hT.length; i++) {
    const dt = new Date(hT[i]), k = dk(dt);
    (byDay[k] ||= []).push(hB[i]);
    const slot = Math.floor((dt.getHours() * 60 + dt.getMinutes()) / 5);
    (seen[k] ||= new Uint8Array(288))[slot] = 1;
    if (k >= recent) { const b = bins[k] ||= []; (b[slot] ||= []).push(hB[i]); }
  }
  // Minutes worn each day, from which 5-minute bins have a reading (model.js wornMin), for every day of the file.
  for (const [k, b] of Object.entries(seen)) { const o = day(k); if (o && o.wm == null) o.wm = wornMin(b); }
  for (const [k, v] of Object.entries(byDay)) { const o = day(k); if (o && o.rh == null && v.length >= 30) o.rp = v.sort((a, b) => a - b)[Math.floor(v.length * 0.05)]; }
  for (const [k, m] of Object.entries(main)) {
    const a = lower(m.s), b = lower(m.e + 1) - 1;
    if (b - a >= 20 && days[k]?.sl) { const v = Array.from(hB.subarray(a, b + 1)); days[k].sl.hr = r1(mean(v)); days[k].sl.lo = v.sort((x, y) => x - y)[Math.floor(v.length * 0.05)]; }
  }
  for (const [k, b] of Object.entries(bins)) {
    const hd = Array.from({ length: 288 }, (_, i) => b[i] ? b[i].sort((x, y) => x - y)[b[i].length >> 1] : 0);
    if (hd.filter(Boolean).length >= 12 && day(k)) days[k].hd = hd;
  }
  for (const w of ex) { const a = lower(w.s), b = lower(w.e + 1); w.h = hcbHist(hT.subarray(a, b), hB.subarray(a, b), w.e); }
}
// A workout's heart rate as seconds at each bpm: each reading lasts until the next, or the end, at most two minutes.
function hcbHist(t, b, end) {
  const hist = {};
  for (let i = 0; i < t.length; i++) { const next = i + 1 < t.length ? t[i + 1] : end; hist[b[i]] = (hist[b[i]] || 0) + Math.min((next - t[i]) / 1000, 120); }
  return Object.entries(hist).filter(([, s]) => s >= 1).map(([bpm, s]) => [+bpm, Math.round(s)]);
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('hcbackup.js');
