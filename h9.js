'use strict';
// Polar H9 (or any strap with the standard Bluetooth heart-rate service). Inside the Android app the phone's
// own Bluetooth is used and the strap is remembered; in Chrome, Web Bluetooth. Both deliver the same packets:
// heart rate, whether the electrodes touch skin, and the beat-to-beat (RR) intervals the strap times from the ECG.
//
// Every beat is kept on one timeline for as long as the strap is connected (HR.beats: [time, RR ms]). Times come
// from the intervals themselves, anchored to the moment each packet left the phone's Bluetooth stack, so they do not
// drift with the page. Each use reads the stretch of that timeline it needs:
//  - the morning check: one minute to settle, then 1–5 minutes recorded (your choice), analysed in full (hrv.js);
//  - a cardio session: zones, a live trace, α1 every 30 seconds, then optionally your one-minute heart-rate recovery;
//  - the Lab (lab.js): spot checks, paced breathing with biofeedback, the resonance finder, the orthostatic test.
// A cardio session is saved as it runs, so a crash or a killed app never loses it.

const HR = { conn: 'idle', name: '', battery: null, bpm: null, ibpm: null, contact: null, offSkin: 0, mode: null, kind: 'walk', t0: 0, last: 0,
  z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, beats: [], wave: [], tr: [], bin: [], a1: [], a1At: 0, msg: '', tick: null, lock: null, gatt: null,
  result: null, painted: 0, live: null, liveAt: 0, nextBeat: 0, stopHr: null, hrrFor: null, scale: null, raf: 0, pk: [], draftAt: 0 };
// Who is wearing the strap. Anyone but you: their recordings are kept apart (rec.js) and never reach your verdict,
// baselines, calibration or training load. Back to you whenever the strap disconnects, so a friend's check can never
// run on into your morning.
const WEAR = { who: 'me' };
const ZONES = ['Light', 'Moderate', 'Vigorous', 'Near max'];
const SETTLE = 60;                // morning check: one minute to settle before recording
const WAVE_S = 90;                // seconds of heart rate on the workout trace
const BEAT_S = 60;                // seconds of beat-to-beat heart rate on every other trace
const DRAFT = 'health.v1.live';   // the cardio session in progress, written every 15 seconds

function strapSupported() { return !!NATIVE || !!navigator.bluetooth; }
function setMsg(m) { HR.msg = m; }

async function strapConnect() {
  setMsg(''); HR.result = HR.result?.type === 'draft' ? HR.result : null;
  if (NATIVE) { HR.conn = 'connecting'; render(); nat('bleConnect', S.meta.h9?.id || ''); return; }
  try {
    HR.conn = 'connecting'; render();
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
    dev.addEventListener('gattserverdisconnected', () => strapLost('The strap disconnected.'));
    const gatt = await dev.gatt.connect(), svc = await gatt.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', e => hrData(e.target.value, Date.now()));
    await ch.startNotifications();
    Object.assign(HR, { conn: 'on', name: dev.name || 'Strap', gatt });
    buzz('ok');
    try { HR.battery = (await (await (await gatt.getPrimaryService('battery_service')).getCharacteristic('battery_level')).readValue()).getUint8(0); } catch (e) { /* no battery service */ }
  } catch (e) {
    HR.conn = 'idle';
    setMsg(e.name === 'NotFoundError' ? '' : `Could not connect: ${e.message}`);
  }
  render();
}
// The remembered strap connects by itself when the app opens with it on your chest: no dialogs and no errors.
function strapAuto() {
  if (!NATIVE || typeof NATIVE.bleAuto !== 'function' || S.settings.strapAuto === 'off' || !S.meta.h9?.id) return;
  if (HR.conn !== 'idle' || HR.noAuto || Date.now() - (HR.autoAt || 0) < 30000) return;
  HR.autoAt = Date.now(); nat('bleAuto', S.meta.h9.id);
}
// Before 11, with no check yet today, the morning check starts by itself once the strap is on and beating: the
// settling minute covers putting the phone down. Only from Today or Recovery, and only at a resting heart rate.
function amAuto() {
  const fresh = Date.now() - HR.amTry < 20000, h = new Date().getHours();
  HR.amTry = 0;
  if (!fresh || S.settings.amAuto === 'off' || HR.mode || WEAR.who !== 'me' || S.hrv[todayKey()] || h < 3 || h >= 11) return;
  if (HR.contact === false || overlay || !['today', 'recovery'].includes(tab) || HR.bpm > hrProfile().rest + 30) return;
  if (tab !== 'recovery' || SUB.recovery !== 'rec') { SUB.recovery = 'rec'; location.hash = 'recovery-rec'; }
  hrStart('morning');
  toast('Morning check started. Lie still.');
}
function strapDisconnect() { if (NATIVE) nat('bleDisconnect'); else HR.gatt?.disconnect?.(); }
function strapForget() { S.meta.h9 = null; save(); if (NATIVE) nat('bleForget'); strapDisconnect(); }
function strapLost(msg) {
  if (HR.conn === 'on') sfx('lost');
  if (HR.mode === 'workout') hrStop();
  else if (HR.mode && HR.mode !== 'breathe') { const m = HR.mode, kept = recKeepFailed(m); hrEnd(); HR.result = { type: m === 'morning' ? 'morning' : m, ok: false, why: `The strap disconnected during the recording, so no result was saved.${kept}` }; msg = ''; }
  Object.assign(HR, { conn: 'idle', bpm: null, ibpm: null, contact: null, gatt: null, live: null });
  WEAR.who = 'me';
  setMsg(msg || '');
  if (msg) buzz('warn');
  render();
}
NEV.ble = e => {
  if (!e) return;
  if (e.battery != null) HR.battery = e.battery;
  if (e.state === 'connected') {
    if (HR.conn !== 'on') { buzz('ok'); sfx('connect'); HR.amTry = Date.now(); }
    Object.assign(HR, { conn: 'on', name: e.name || 'Strap' });
    if (e.id && S.meta.h9?.id !== e.id) { S.meta.h9 = { id: e.id, name: e.name || 'Strap' }; save(); }
  } else if (e.state === 'connecting' || e.state === 'scanning') HR.conn = 'connecting';
  else if (e.state === 'disconnected') return strapLost(e.msg);
  else if (e.state === 'error') { HR.conn = 'idle'; setMsg(e.msg || 'Bluetooth error'); buzz('warn'); }
  renderSoft();
};
// The app sends { t: when the phone received it, v: the packet's bytes }; older builds sent the bytes alone.
NEV.hr = p => {
  const bytes = Array.isArray(p) ? p : p?.v, t = Number.isFinite(p?.t) && Math.abs(p.t - Date.now()) < 5000 ? p.t : Date.now();
  if (Array.isArray(bytes) && bytes.length >= 2) hrData(new DataView(Uint8Array.from(bytes).buffer), t);
};

// Heart Rate Measurement (0x2A37): flags; bpm, 8 or 16 bit; optional energy; optional RR in 1/1024 s.
// Flags bit 2 says the strap can tell whether it touches skin, bit 1 whether it does.
function hrData(v, now = Date.now()) {
  const flags = v.getUint8(0);
  let i = 1;
  const bpm = flags & 1 ? v.getUint16(i, true) : v.getUint8(i);
  i += flags & 1 ? 2 : 1;
  if (flags & 8) i += 2;
  const rr = [];
  if (flags & 16) for (; i + 1 < v.byteLength; i += 2) rr.push(v.getUint16(i, true) * 1000 / 1024);
  const first = HR.bpm == null;
  HR.contact = flags & 4 ? !!(flags & 2) : null;
  if (HR.contact === false) { if (!HR.offSkin) HR.offSkin = now; } else HR.offSkin = 0;
  if (bpm < 25 || bpm > 240) { HR.last = now; HR.pk.push([now, 0, HR.contact === false ? 0 : 2, []]); return; }
  HR.bpm = bpm;
  HR.wave.push([now, bpm]);
  while (HR.wave.length && now - HR.wave[0][0] > WAVE_S * 1000) HR.wave.shift();
  // The packet as it came: time, bpm, contact (0 off, 1 on, 2 not reported) and the RR in the strap's own 1/1024 s.
  const ru = [];
  if (flags & 16) for (let j = flags & 1 ? 3 : 2, k = j + (flags & 8 ? 2 : 0); k + 1 < v.byteLength; k += 2) ru.push(v.getUint16(k, true));
  HR.pk.push([now, bpm, HR.contact === false ? 0 : HR.contact ? 1 : 2, ru]);
  if (HR.pk.length > 24000) HR.pk.splice(0, HR.pk.length - 20000);
  if (rr.length) {
    // beatTimes gives [time, bpm]; the timeline keeps [time, RR].
    beatTimes(rr, now).forEach((b, j) => HR.beats.push([b[0], rr[j]]));
    // About five hours of beats at rest: enough for a long Live session to be analysed and exported whole.
    if (HR.beats.length > 24000) HR.beats.splice(0, HR.beats.length - 20000);
    const lr = rr[rr.length - 1];
    if (lr > 270 && lr < 2200) { HR.ibpm = 60000 / lr; HR.nextBeat = now + lr; }
  }
  if (HR.mode === 'workout') {
    HR.z[zoneOf(bpm)] += Math.min(5, (now - HR.last) / 1000);
    HR.sum += bpm; HR.n++; HR.max = Math.max(HR.max, bpm);
  }
  HR.last = now;
  if (HR.amTry) amAuto();
  if (first && !overlay?.type?.match?.(/add|set/)) return renderSoft();
  if (now - HR.painted > 180) hrPaint();
}
// The stretch of the timeline from t on: RR intervals, or [time, RR] pairs.
// The timeline is in time order, so the start is found by stepping back from the end: reading the last minute costs
// a minute of beats, however long the strap has been connected. (This runs on every frame of the live trace.)
function beatsSince(t, until = Infinity) {
  const B = HR.beats;
  let i = B.length;
  while (i > 0 && B[i - 1][0] >= t) i--;
  if (until === Infinity) return B.slice(i);
  let j = B.length;
  while (j > i && B[j - 1][0] >= until) j--;
  return B.slice(i, j);
}
function rrSince(t, until) { return beatsSince(t, until).map(b => b[1]); }
// Once a second while connected: RMSSD, signal quality and breathing rate over the last minute of beats.
function liveMetrics() {
  const now = Date.now();
  if (now - HR.liveAt < 900) return HR.live;
  HR.liveAt = now;
  const rr = rrSince(now - 60000), C = rr.length >= 10 ? rrClean(rr) : null;
  if (!C) return (HR.live = null);
  const m = C.rr.length >= 30 ? hrvMetrics(rr) : null;
  return (HR.live = { q: Math.round((1 - C.bad) * 100), rmssd: m?.rmssd ?? null, br: m?.br ?? null, sd: m?.sdnn ?? null, hr: m?.hr ?? null, sd1: m?.sd1 ?? null, sd2: m?.sd2 ?? null, pnn: m?.pnn50 ?? null, n: rr.length });
}

// ---------- the live trace ----------
// Drawn every animation frame while a trace is on screen, so it scrolls smoothly instead of jumping once a second.
// A workout shows the strap's heart rate over 90 seconds; everything else the beat-to-beat heart rate over a minute,
// where the rise and fall with each breath is visible. The scale eases to new limits instead of snapping.
function wavePts(now) {
  if (HR.mode === 'workout' || HR.mode === 'hrr') return { pts: HR.wave.filter(w => now - w[0] <= WAVE_S * 1000).map(([t, b]) => [1 - (now - t) / (WAVE_S * 1000), b]), span: WAVE_S };
  const bs = beatsSince(now - BEAT_S * 1000 - 2000).filter(b => b[1] > 270 && b[1] < 2200);
  return { pts: bs.map(([t, r]) => [1 - (now - t) / (BEAT_S * 1000), 60000 / r]), span: BEAT_S };
}
function waveFrame() {
  const w = document.getElementById('wave');
  if (!w || HR.conn !== 'on') { HR.raf = 0; return; }
  const now = Date.now(), { pts } = wavePts(now), W = 300, H = 84;
  if (pts.length >= 2) {
    const vals = pts.map(p => p[1]);
    let lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3;
    if (hi - lo < 16) { const m = (hi + lo) / 2; lo = m - 8; hi = m + 8; }
    const sc = HR.scale || [lo, hi];
    HR.scale = [sc[0] + (lo - sc[0]) * 0.08, sc[1] + (hi - sc[1]) * 0.08];
    const [a, b] = HR.scale, Y = v => H - 4 - (v - a) / (b - a || 1) * (H - 8);
    w.setAttribute('d', pts.map(([x, v], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(1)},${Y(v).toFixed(1)}`).join(''));
    const g = document.getElementById('wavelines');
    if (g && (HR.mode === 'workout' || HR.mode === 'hrr')) g.innerHTML = hrProfile().zones.filter(z => z > a && z < b).map(z => `<line x1="0" x2="300" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}"/>`).join('');
    const end = document.getElementById('wavedot');
    if (end) { const p = pts[pts.length - 1]; end.setAttribute('cx', (p[0] * W).toFixed(1)); end.setAttribute('cy', Y(p[1]).toFixed(1)); }
  }
  // A pulse on each beat, predicted from the last interval and corrected by every packet.
  if (HR.nextBeat && now >= HR.nextBeat) {
    const lr = HR.beats.length ? HR.beats[HR.beats.length - 1][1] : 1000;
    HR.nextBeat += lr > 270 && lr < 2200 ? lr : 1000;
    if (HR.nextBeat < now) HR.nextBeat = now + 400;
    const beat = document.getElementById('beat');
    if (beat) { beat.classList.remove('pulse'); void beat.offsetWidth; beat.classList.add('pulse'); }
  }
  HR.raf = requestAnimationFrame(waveFrame);
}
function liveKick() { if (!HR.raf && HR.conn === 'on' && document.getElementById('wave')) HR.raf = requestAnimationFrame(waveFrame); }
function waveSvg() {
  return `<svg class="wave ${HR.mode || 'idle'}" viewBox="0 0 300 84" preserveAspectRatio="none" aria-hidden="true"><g id="wavelines"></g><path id="wave" d=""/><circle id="wavedot" r="3.2" cx="-10" cy="-10"/></svg>`;
}
// The numbers under the big one: contact, signal quality, beat-to-beat heart rate, RMSSD and breathing over the last minute.
function liveChips() {
  const L = liveMetrics(), c = HR.contact;
  const chip = (cls, t) => `<span class="lchip ${cls}">${t}</span>`;
  return [c === false ? chip('bad', 'No skin contact: wet the electrodes') : c ? chip('good', 'Skin contact') : '',
    L ? chip(L.q >= 95 ? 'good' : L.q >= 85 ? '' : 'bad', `Signal ${L.q}%`) : chip('', 'Signal…'),
    HR.ibpm ? chip('', `Beat ${Math.round(HR.ibpm)} bpm`) : '',
    L?.rmssd != null ? chip('', `RMSSD ${Math.round(L.rmssd)} ms`) : '',
    L?.br != null ? chip('', `Breathing ${r1(L.br)}/min`) : ''].join('');
}
function hrPaint() {
  HR.painted = Date.now();
  const b = document.getElementById('bpm');
  if (!b || HR.bpm == null) return;
  b.textContent = HR.bpm;
  const zEl = document.getElementById('zone'); if (zEl) zEl.textContent = zoneWord();
  const ch = document.getElementById('lchips'); if (ch) ch.innerHTML = liveChips();
  const el = (Date.now() - HR.t0) / 1000, c = document.getElementById('clock');
  if (HR.mode === 'morning') {
    const rec = S.settings.hrvDur;
    if (c) c.textContent = el < SETTLE ? `Settling · ${clock(SETTLE - el)}` : `Recording · ${clock(SETTLE + rec - el)}`;
    const ring = document.getElementById('ring'); if (ring) ring.setAttribute('stroke-dasharray', `${clamp(el / (SETTLE + rec) * 100, 0, 100).toFixed(1)} 100`);
    const st = document.querySelector('.strap'); if (st) { st.classList.toggle('st-settle', el < SETTLE); st.classList.toggle('st-record', el >= SETTLE); }
    const n = document.getElementById('beats'); if (n) n.textContent = el < SETTLE ? 0 : beatsSince(HR.t0 + SETTLE * 1000).length;
  } else if (HR.mode === 'workout') {
    if (c) c.textContent = clock(el);
    HR.z.forEach((s, i) => { const z = document.getElementById('z' + i); if (z) z.textContent = clock(s); });
    const a = document.getElementById('a1'); if (a) a.innerHTML = a1Line(HR.a1[HR.a1.length - 1]);
  } else if (HR.mode === 'hrr') {
    if (c) c.textContent = `Stay still · ${clock(60 - el)}`;
    const d = document.getElementById('hrrdrop'); if (d && HR.stopHr) d.textContent = sign(HR.bpm - HR.stopHr);
  }
  if (typeof labPaint === 'function') labPaint();
  if (typeof stuPaint === 'function') stuPaint();
}
function zoneWord() { return HR.mode === 'morning' ? (S.settings.hrvPos === 'sitting' ? 'sitting still' : 'lying still') : HR.mode && HR.mode !== 'workout' ? 'live' : ZONES[zoneOf(HR.bpm)]; }
function a1Line(last) {
  if (!last) return HR.mode === 'workout' && (Date.now() - HR.t0) / 1000 < 120 ? 'α1 appears after two minutes of beats' : 'α1: waiting for two clean minutes of beats';
  const [, a, hr] = last, side = a > 0.8 ? 'below your aerobic threshold' : a < 0.7 ? 'above your aerobic threshold' : 'right at your aerobic threshold';
  return `α1 <b>${a.toFixed(2)}</b> at ${hr} bpm · ${side}`;
}
function keepAwake(on) {
  if (NATIVE) return nat('keepAwake', !!on);
  if (on) navigator.wakeLock?.request('screen').then(l => { HR.lock = l; }).catch(() => {});
  else { HR.lock?.release?.(); HR.lock = null; }
}
function hrStart(mode) {
  Object.assign(HR, { mode, t0: Date.now(), last: Date.now(), z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, tr: [], bin: [], a1: [], a1At: 0, msg: '', result: null, started: 0 });
  clearInterval(HR.tick);
  HR.tick = setInterval(hrTick, 1000);
  keepAwake(true);
  buzz('ok');
  render();
}
// The clock runs on its own, so a strap that stops sending is noticed instead of freezing the screen.
function hrTick() {
  const now = Date.now(), el = (now - HR.t0) / 1000;
  const silent = now - HR.last > 15000, off = HR.offSkin && now - HR.offSkin > 12000;
  if (HR.mode === 'morning') {
    if (silent || off) { const kept = recKeepFailed('morning'); hrEnd(); HR.result = { type: 'morning', ok: false, why: (off ? 'The strap lost skin contact for over 12 seconds. Wet the electrodes, tighten the strap and start again.' : 'Lost contact with the strap. Wet the electrodes and start again.') + kept }; buzz('warn'); return render(); }
    if (Math.floor(el) === SETTLE && !HR.started) { HR.started = 1; buzz('tick'); sfx('start'); }
    if (el >= SETTLE + S.settings.hrvDur) return hrMorningDone();
  } else if (HR.mode === 'workout') {
    HR.bin.push(now - HR.last < 5000 && !off ? HR.bpm : 0);
    if (HR.bin.length >= 5) { const ok = HR.bin.filter(Boolean); HR.tr.push(ok.length ? Math.round(mean(ok)) : 0); HR.bin = []; if (HR.tr.length > 1440) HR.tr.shift(); }
    if (el >= 120 && now - HR.a1At >= 30000) {
      HR.a1At = now;
      const raw = rrSince(now - 120000), C = rrClean(raw);
      if (raw.length >= 100 && C.bad <= 0.05) {
        const a = dfaA1(C.rr);
        if (a != null && a > 0.1 && a < 2.5) { HR.a1.push([Math.round(el), Math.round(a * 1000) / 1000, Math.round(60000 / mean(C.rr))]); if (HR.a1.length > 300) HR.a1.shift(); }
      }
    }
    if (Math.floor(el) % 15 === 0 && WEAR.who === 'me') draftWrite();
  } else if (HR.mode === 'hrr') {
    if (silent) { recDrop(); hrEnd(); HR.result = { type: 'hrr', ok: false, why: 'Lost contact with the strap.' }; return render(); }
    if (el >= 60) return hrrDone();
  } else if (typeof labTick === 'function') labTick(now, el, silent, off);
  if (HR.mode) recDraft();
  hrPaint();
}
function hrEnd() { HR.started = 0; HR.mode = null; clearInterval(HR.tick); HR.tick = null; keepAwake(false); }

// ---------- the recording behind every session ----------
// Every session, of every kind, is kept whole in the recording store (rec.js): the packets from its start, each beat
// in the strap's own units, each packet's time, heart rate and contact. A draft is written every 10 seconds while it
// runs, so a crash, a killed app or a flat phone keeps all but the last few seconds.
const REC_MODE = { morning: 'morning', workout: 'cardio', hrr: 'hrr', breathe: 'breathe', rf: 'rf', ortho: 'ortho', spot: 'spot', live: 'live' };
function strapRec(t, until = Infinity) {
  // Packets arrive in time order; sorting what is taken costs nothing and keeps a reordered one from ever
  // putting a beat before the start.
  let i = HR.pk.length;
  while (i > 0 && HR.pk[i - 1][0] >= t) i--;
  const P = HR.pk.slice(i).filter(p => p[0] >= t).sort((a, b) => a[0] - b[0]);
  i = 0;
  const ru = [], pk = [], nc = [];
  let first = null, ncAt = null, endAt = t;
  for (let j = i; j < P.length && P[j][0] < until; j++) {
    const [ms, bpm, c, u] = P[j];
    endAt = ms;
    if (c === 0) { if (ncAt == null) ncAt = ms; } else if (ncAt != null) { nc.push([ncAt, ms]); ncAt = null; }
    if (!u.length) continue;
    if (first == null) first = ms - u.reduce((a, b) => a + b, 0) * 1000 / 1024;
    for (const x of u) ru.push(x);
    pk.push([ru.length - 1, ms, bpm, c]);
  }
  if (ncAt != null) nc.push([ncAt, endAt]);
  if (!ru.length) return null;
  const t0 = Math.round(first);
  return { t0, ru, pk: pk.map(p => [p[0], p[1] - t0, p[2], p[3]]), dev: HR.name || 'Strap', nc: nc.map(([a, b]) => [r1((a - t0) / 1000), r1((b - t0) / 1000)]) };
}
function recPos(mode) {
  const s = S.settings;
  return mode === 'morning' ? s.hrvPos : mode === 'spot' ? s.spPos : mode === 'ortho' ? 'lying' : mode === 'workout' ? 'moving' : mode === 'breathe' || mode === 'rf' ? 'sitting' : undefined;
}
// Marks at the moments a session changes phase, in seconds from the recording's first beat.
function recMarks(mode, off) {
  const at = s => r1(off + s);
  if (mode === 'morning') return [[at(0), 'Settling'], [at(SETTLE), 'Recording']];
  if (mode === 'spot') return [[at(0), 'Settling'], [at(SPOT_SETTLE), 'Recording']];
  if (mode === 'ortho') return [[at(0), 'Lying'], [at(ORTHO_LIE), 'Standing']];
  if (mode === 'rf') return RF_RATES.map((r, i) => [at(i * RF_SEG), `${r} a minute`]);
  if (mode === 'live') return (LAB.marks || []).map(([s, tag]) => [at(s), LIVETAGS[tag] || tag]);
  return [];
}
// The recording of the session now running (or just ended), with whatever it adds.
function recBuild(extra = {}) {
  const mode = extra.mode || HR.mode, b = strapRec(HR.t0 - 1500);
  if (!b) return null;
  const off = (HR.t0 - b.t0) / 1000, nc = b.nc; delete b.nc;
  const r = Object.assign(b, { id: 'r' + HR.t0, kind: REC_MODE[mode] || 'raw', who: WEAR.who, pos: recPos(mode), marks: recMarks(mode, off) }, extra);
  delete r.mode;
  if (nc.length) r.x = Object.assign({ nc }, r.x || {});
  // The settling part is left out the way the session itself leaves it out; that trim is the recording's own, not an
  // edit (x.trim0), and "Undo your edits" goes back to it.
  if (mode === 'morning' || mode === 'spot') { const tr = [r1(off + (mode === 'morning' ? SETTLE : SPOT_SETTLE)), r1(off + (Date.now() - HR.t0) / 1000 + 5)]; r.edits = { trim: tr }; r.x = Object.assign({}, r.x, { trim0: tr }); }
  return r;
}
function recDraft() {
  if (!HR.mode || Date.now() - HR.draftAt < 10000) return;
  HR.draftAt = Date.now();
  const r = recBuild({ live: true });
  if (r && r.ru.length >= 5) recPut(r, true);
}
// The session ended: kept as it was, with its place in your data when it is yours.
function recFinish(extra) {
  const r = recBuild(Object.assign({ live: false }, extra));
  HR.draftAt = 0;
  return r && r.ru.length >= 20 ? recPut(r) : (recDel('r' + HR.t0), null);
}
// A session that failed is still kept when it has beats in it: incomplete, and yours to look at or delete.
function recKeepFailed(mode) {
  const r = recBuild({ live: false, inc: true, mode });
  HR.draftAt = 0;
  if (r && r.ru.length >= 30) { recPut(r); return ' The beats it did get are kept in Strap › Sessions, marked incomplete.'; }
  recDel('r' + HR.t0);
  return '';
}
function recDrop() { HR.draftAt = 0; recDel('r' + HR.t0); }

// ---------- cardio ----------
function cardioNow() {
  const dur = (Date.now() - HR.t0) / 1000;
  return { t: HR.t0, kind: HR.kind, dur: Math.round(dur), avg: HR.n ? Math.round(HR.sum / HR.n) : null, max: HR.max, z: HR.z.map(Math.round), tr: HR.tr, a1: HR.a1 };
}
function draftWrite() { try { localStorage.setItem(DRAFT, JSON.stringify(Object.assign(cardioNow(), { at: Date.now() }))); } catch (e) { /* best effort */ } }
function draftDrop() { try { localStorage.removeItem(DRAFT); } catch (e) { /* nothing */ } }
// A session interrupted by a crash or a killed app, still unsaved: offered back once.
function draftFound() {
  if (HR.mode === 'workout') return null;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
    if (!d || !(d.dur >= 60) || !d.avg || Date.now() - d.at > 36 * 36e5) return null;
    return d;
  } catch (e) { return null; }
}
function cardioSave(x) {
  const th = hrvThreshold(x.a1), k = dk(new Date(x.t));
  const c = cleanCardio(Object.assign({}, x, { vt1: th?.hr }));
  if (c) { (S.cardio[k] ||= []).push(c); S.cardio[k] = S.cardio[k].slice(-10); save(); }
  return { c, k, th };
}
function hrStop() {
  const x = cardioNow();
  // Heart rate at the moment of stopping: the average of the last 10 seconds, the start of the recovery measurement.
  const end = HR.wave.filter(w => Date.now() - w[0] <= 10000).map(w => w[1]);
  HR.stopHr = end.length ? mean(end) : HR.bpm;
  if (x.dur >= 60 && HR.n) {
    const me = WEAR.who === 'me', { c, k, th } = me ? cardioSave(x) : { c: cleanCardio(Object.assign({}, x, { vt1: hrvThreshold(x.a1)?.hr })), k: dk(new Date(x.t)), th: hrvThreshold(x.a1) };
    const rec = recFinish({ mode: 'workout', x: { kind: x.kind, avg: x.avg, max: x.max, z: x.z, a1: x.a1, vt1: th?.hr ?? null }, ...(me && c ? { ref: { s: 'cardio', k, t: x.t } } : {}) });
    if (c) buzz('done');
    HR.result = { type: 'workout', ok: !!c, k, c, i: c && me ? S.cardio[k].length - 1 : null, th, hrrOk: !!c && HR.conn === 'on', rid: rec?.id, who: WEAR.who };
    setMsg('');
  } else { recDrop(); HR.result = { type: 'workout', ok: false, why: 'Under a minute, so it was not saved.' }; buzz('warn'); }
  draftDrop();
  hrEnd();
}
// Heart-rate recovery: how far heart rate falls in the first minute after stopping, standing or sitting still.
function hrrStart() {
  const r = HR.result;
  HR.hrrFor = { k: r.k, t: r.c.t, hr0: HR.stopHr, rid: r.rid, who: r.who || 'me', c: r.c };
  hrStart('hrr');
}
function hrrDone() {
  const F = HR.hrrFor, end = beatsSince(HR.t0 + 55000).map(b => 60000 / b[1]).filter(x => x > 27 && x < 222);
  const hr60 = end.length >= 3 ? median(end) : HR.bpm;
  const c = F.who === 'me' ? (S.cardio[F.k] || []).find(x => x.t === F.t) : F.c;
  const hrr = c && F.hr0 && hr60 != null ? Math.round(F.hr0 - hr60) : null;
  const rec = hrr != null ? recFinish({ mode: 'hrr', x: { hr0: Math.round(F.hr0), hrr, of: F.rid || null } }) : (recDrop(), null);
  hrEnd();
  if (hrr == null) { HR.result = { type: 'hrr', ok: false, why: 'The session or its stopping heart rate was not found.' }; return render(); }
  c.hr0 = Math.round(F.hr0); c.hrr = hrr;
  // The cardio recording carries its recovery too.
  const cr = F.rid && recGet(F.rid);
  if (cr) recPut(Object.assign({}, cr, { x: Object.assign({}, cr.x, { hr0: c.hr0, hrr }) }), true);
  if (F.who === 'me') save();
  buzz('done');
  HR.result = { type: 'hrr', ok: true, k: F.k, c, rid: rec?.id, who: F.who };
  render();
}
// Your heart-rate recoveries over time, newest first, from strap sessions.
function hrrHistory() {
  const out = [];
  for (const k of Object.keys(S.cardio).sort().reverse()) for (const c of S.cardio[k]) if (c.hrr != null) out.push({ k, hrr: c.hrr, hr0: c.hr0 });
  return out;
}

// ---------- the morning check ----------
function hrMorningDone() {
  const rr = rrSince(HR.t0 + SETTLE * 1000), m = hrvMetrics(rr), k = todayKey(), before = S.hrv[k], want = S.settings.hrvDur, me = WEAR.who === 'me';
  if (m && m.q >= 80 && m.dur >= want * 0.75) {
    if (me) recUnref({ s: 'hrv', k });
    const rec = recFinish({ mode: 'morning', ...(me ? { ref: { s: 'hrv', k } } : {}) });
    hrEnd();
    if (me) { S.hrv[k] = cleanHrv(Object.assign(hrvRecord(m), { t: Date.now(), pos: S.settings.hrvPos, rr: rr.filter(x => x > 270 && x < 2200).slice(0, 600) })); save(); }
    buzz('done');
    HR.result = { type: 'morning', ok: true, k, m, replaced: me && !!before, rid: rec?.id, who: WEAR.who };
  } else {
    const kept = recKeepFailed('morning');
    hrEnd();
    buzz('warn');
    HR.result = { type: 'morning', ok: false, why: (m ? (m.q < 80 ? `Only ${m.q}% of beats were clean, so no result was saved. Lie still, wet the electrodes and try again.` : `Only ${Math.round(m.dur)} seconds of beats arrived. Keep the phone near and try again.`) : 'The signal was too noisy. Wet the strap electrodes, lie still and try again.') + kept };
  }
  render();
}
// A recording that stops being the source of a summary (a morning check done again replaces the first) keeps its
// beats but loses the link, so editing it later cannot overwrite the newer one.
function recUnref(ref) {
  for (const r of recAll()) if (r.ref && r.ref.s === ref.s && r.ref.k === ref.k && (r.ref.t || 0) === (ref.t || 0)) { const x = Object.assign({}, r); delete x.ref; x.title = `${recTitle(r)}, replaced`; recPut(x, true); }
}
// The measures kept with a reading, rounded to what they can honestly resolve.
function hrvRecord(m) {
  const o = { rmssd: r1(m.rmssd), hr: r1(m.hr), q: m.q, sd: r1(m.sdnn), pnn: r1(m.pnn50), sd1: r1(m.sd1), sd2: r1(m.sd2), dur: Math.round(m.dur) };
  if (m.hf != null) o.hf = Math.round(m.hf);
  if (m.lf != null) o.lf = Math.round(m.lf);
  if (m.br != null) o.br = r1(m.br);
  return o;
}

function hrAct(a, el) {
  if (a === 'hrconnect') { buzz('tick'); HR.noAuto = false; return strapConnect(); }
  if (a === 'hrdisconnect') { buzz('tick'); HR.noAuto = true; return strapDisconnect(); }
  if (a === 'hrforget') { strapForget(); buzz('heavy'); return render(); }
  if (a === 'hrworkout') return hrStart('workout');
  if (a === 'hrmorning') return hrStart('morning');
  if (a === 'strapauto' || a === 'amauto') { S.settings[a === 'amauto' ? 'amAuto' : 'strapAuto'] = el.dataset.v; save(); buzz('ok'); return render(); }
  if (a === 'hrkind') { HR.kind = el.dataset.k; buzz('tick'); return render(); }
  if (a === 'hrdur') { S.settings.hrvDur = +el.dataset.v; save(); buzz('tick'); return render(); }
  if (a === 'hrpos') { S.settings.hrvPos = el.dataset.v; save(); buzz('tick'); return render(); }
  if (a === 'hrstop') { hrStop(); return render(); }
  if (a === 'hrcancel') { if (HR.mode === 'workout') draftDrop(); if (HR.mode) recDrop(); hrEnd(); setMsg(''); buzz('tick'); return render(); }
  if (a === 'hrresdone') { HR.result = null; buzz('tick'); return render(); }
  if (a === 'hrhrr') return hrrStart();
  if (a === 'hrdraftsave') { const d = draftFound(); if (d) { const r = cardioSave(d); draftDrop(); buzz('done'); HR.result = { type: 'workout', ok: !!r.c, k: r.k, c: r.c, th: r.th }; toast('Interrupted session saved'); } return render(); }
  if (a === 'hrdraftdrop') { draftDrop(); buzz('heavy'); return render(); }
  if (a === 'hrinfo') return openPop({ kind: 'hrvinfo', k: el.dataset.k });
}

// ---------- the block, shared by Training (cardio) and Recovery (morning check) ----------
// lean: the strap's own page already shows contact, signal and battery, so its monitor leaves them out.
function liveHead(lean) {
  return `<div class="bpm"><span class="beat" id="beat"></span><b class="num" id="bpm">${HR.bpm}</b>
    <span>bpm · <span id="zone">${zoneWord()}</span>${HR.battery != null && !lean ? ` · battery ${HR.battery}%` : ''}</span></div>${waveSvg()}${lean ? '' : `<div class="lchips" id="lchips">${liveChips()}</div>`}`;
}
function strapIdle(purpose) {
  if (!strapSupported() && HR.conn !== 'on') return `<p class="sub">Bluetooth is not available here. Use the Android app, or Chrome on Android.</p>`;
  if (HR.conn === 'connecting') return `<div class="strap st-connecting"><div class="seek" aria-hidden="true"><i></i><i></i><i></i></div>
    <p class="sub center">Connecting${S.meta.h9 ? ` to ${esc(S.meta.h9.name)}` : ''}… Wet the electrodes and wear the strap; it only wakes up on skin.</p><button class="ghost wide" data-act="hrdisconnect">Cancel</button></div>`;
  if (HR.conn !== 'on') return `<div class="strap st-idle"><p class="sub">${purpose === 'morning' ? 'On waking, before getting up: wet the strap, put it on, connect, then lie still.' : purpose === 'lab' ? 'Wet the electrodes, put the strap on, then connect.' : 'Wet the electrodes, put the strap on, then connect.'} Close Polar Beat or Zepp first if either is holding the strap.</p>
    <button class="solid" data-act="hrconnect">${S.meta.h9 && NATIVE ? `Connect ${esc(S.meta.h9.name)}` : 'Connect Polar H9'}</button></div>`;
  if (HR.bpm == null) return '<div class="strap st-connecting"><div class="seek" aria-hidden="true"><i></i><i></i><i></i></div><p class="sub center">Connected. Waiting for the first beat…</p></div>';
  return null;
}
function autoOpts() {
  if (!NATIVE || typeof NATIVE.bleAuto !== 'function') return '';
  const s = S.settings;
  return `<div class="opts"><span class="sub">Connect by itself</span>${seg('strapauto', [['on', 'On'], ['off', 'Off']], s.strapAuto, 'tight')}
    <span class="sub">Start before 11</span>${seg('amauto', [['on', 'By itself'], ['off', 'By hand']], s.amAuto, 'tight')}</div>`;
}
function strapBlock(purpose) {
  const H = hrProfile(), res = HR.result;
  if (res && ((purpose === 'morning') === (res.type === 'morning')) && ['morning', 'workout', 'hrr'].includes(res.type)) return `<div class="strap st-done" data-swipe="hrresdone">${resultCard(res)}</div>`;
  if (purpose === 'workout') { const d = draftFound(); if (d) return draftCard(d); }
  const idle = strapIdle(purpose);
  if (idle) return idle;
  if (HR.mode === 'workout' && purpose === 'workout') return `<div class="strap st-live">${liveHead()}<div class="eyebrow center" id="clock">${clock((Date.now() - HR.t0) / 1000)}</div>
    <p class="a1 center" id="a1">${a1Line(HR.a1[HR.a1.length - 1])}</p>
    <div class="stats four">${ZONES.map((z, i) => `<div><b class="num" id="z${i}">${clock(HR.z[i])}</b><span class="sub">${z}</span></div>`).join('')}</div>
    <button class="solid wide" data-act="hrstop">Stop and save</button></div>`;
  if (HR.mode === 'hrr' && purpose === 'workout') return `<div class="strap st-live">${liveHead()}<div class="eyebrow center" id="clock">Stay still · ${clock(60 - (Date.now() - HR.t0) / 1000)}</div>
    <p class="sub center">Stand or sit still and breathe normally. Stopped at <b>${Math.round(HR.stopHr)}</b> bpm; since then <b id="hrrdrop">${sign(HR.bpm - HR.stopHr)}</b>.</p><button class="ghost wide" data-act="hrcancel">Skip</button></div>`;
  if (HR.mode === 'morning' && purpose === 'morning') {
    const el = (Date.now() - HR.t0) / 1000, rec = S.settings.hrvDur;
    return `<div class="strap ${el < SETTLE ? 'st-settle' : 'st-record'}"><div class="mring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="16" pathLength="100"/><circle id="ring" class="fg" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${clamp(el / (SETTLE + rec) * 100, 0, 100).toFixed(1)} 100"/></svg>
      <div>${liveHead()}</div></div>
      <div class="eyebrow center" id="clock">${el < SETTLE ? `Settling · ${clock(SETTLE - el)}` : `Recording · ${clock(SETTLE + rec - el)}`}</div>
      <p class="sub center">Stay still, breathe normally, don't talk. The first minute settles, then ${dur(rec / 60)} is recorded: <b id="beats">0</b> beats so far.</p><button class="ghost wide" data-act="hrcancel">Cancel</button></div>`;
  }
  if (HR.mode && HR.mode !== 'workout' && HR.mode !== 'morning') return `<div class="strap st-live">${liveHead()}<p class="sub center">${HR.mode === 'hrr' ? 'Measuring heart-rate recovery on Heart.' : 'A Lab session is running.'} <a href="#${HR.mode === 'hrr' ? 'recovery' : 'lab-' + HR.mode}">Go to it</a></p></div>`;
  if (purpose === 'morning') {
    const s = S.settings;
    return `<div class="strap st-live">${liveHead()}
      <div class="opts"><span class="sub">Record</span>${seg('hrdur', [[60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min']], s.hrvDur, 'tight')}
      <span class="sub">Position</span>${seg('hrpos', [['lying', 'Lying'], ['sitting', 'Sitting']], s.hrvPos, 'tight')}</div>
      <button class="solid wide" data-act="hrmorning">Start morning check · ${dur((SETTLE + s.hrvDur) / 60)}</button>
      ${autoOpts()}
      <p class="sub center small">${s.hrvDur >= 120 ? 'Two minutes or more adds the low-frequency band and a steadier breathing rate.' : 'One minute agrees closely with longer recordings for RMSSD.'} Keep the same length and position every morning. ${why('hrv', 'Why')}</p></div>`;
  }
  return `<div class="strap st-live">${liveHead()}<p class="sub">Zones today: moderate ${H.zones[0]}–${H.zones[1] - 1}, vigorous ${H.zones[1]}–${H.zones[2] - 1} bpm. For an aerobic-threshold estimate, start easy and build gradually over 15–20 minutes.</p>
    <div class="chips tight">${KINDS.map(([k, l]) => `<button class="${HR.kind === k ? 'on' : ''}" data-act="hrkind" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="solid wide" data-act="hrworkout">Start ${(KINDS.find(x => x[0] === HR.kind) || KINDS[KINDS.length - 1])[1].toLowerCase()}</button></div>`;
}
function draftCard(d) {
  return `<div class="result warnc"><b>A session was interrupted</b><p class="sub">${esc((KINDS.find(x => x[0] === d.kind) || KINDS[KINDS.length - 1])[1])} from ${hm(new Date(d.t).getHours() * 60 + new Date(d.t).getMinutes())} on ${dateLabel(dk(new Date(d.t)), { weekday: 'short', day: 'numeric', month: 'short' })}: ${dur(d.dur / 60)}, average ${d.avg} bpm. It was kept as it ran.</p>
    <div class="rowb"><button class="solid" data-act="hrdraftsave">Save it</button><button class="ghost" data-hold="hrdraftdrop">Hold to discard</button></div></div>`;
}
ACT_HOLD.hrdraftdrop = () => hrAct('hrdraftdrop');
// What just happened, in full. Swipe it away or tap Done.
function resultCard(res) {
  const done = '<button class="solid wide" data-act="hrresdone">Done</button>';
  if (!res.ok) return `<div class="result bad"><b>Not saved</b><p class="sub">${esc(res.why || '')}</p>${done}</div>`;
  if (res.who && res.who !== 'me') return recResultCard(res);
  const full = res.rid && recGet(res.rid) ? `<a class="ghost link nextstep" href="#rec-${res.rid}">Full analysis ›</a>` : '';
  const stampSvg = '<svg viewBox="0 0 48 48" class="stamp" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>';
  if (res.type === 'morning') {
    const V = hrvState(res.k), x = S.hrv[res.k], R = readiness(res.k), m = res.m;
    const pos = V.lo ? clamp((Math.log(x.rmssd) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100, 2, 98) : null;
    const band = V.lo ? `<div class="rangebar" role="img" aria-label="Today against your normal range"><i class="band" style="left:${((Math.log(V.lo) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100).toFixed(1)}%;right:${(100 - (Math.log(V.hi) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100).toFixed(1)}%"></i><i class="mark" style="left:${pos.toFixed(1)}%"></i></div>
      <p class="sub center">Your normal range ${Math.round(V.lo)}–${Math.round(V.hi)} ms${V.provisional ? ', provisional' : ''}. Today is ${V.day === 'low' ? 'below it' : V.day === 'high' ? 'above it' : 'inside it'}; it is the 7-day average that decides.</p>` : para(`${plural(V.n, 'reading')} so far; your normal range appears after ${V.need ?? 0} more.`, 'sub center');
    const next = S.weights[res.k] == null ? '<a class="ghost link nextstep" href="#today">Next: weigh in ›</a>' : '';
    return `<div class="result ok">${stampSvg}
      <b>Morning check saved${res.replaced ? ', replacing this morning’s earlier one' : ''}</b>
      ${stats([[r1(x.rmssd), 'RMSSD, ms'], [Math.round(x.hr), 'bpm'], [`${x.q}%`, 'clean beats']])}${band}
      ${beatsViz(x.rr, res.rid ? `#rec-${res.rid}` : `#beats-h${res.k.replace(/-/g, '')}`)}
      <p class="sub">Verdict today: <b>${VERDICT[R.level][0].toLowerCase()}</b>.${V.roll ? ` 7-day average now ${r1(V.roll)} ms.` : ''}</p>
      ${metricsTable(m)}
      <div class="rowb">${next}${full}<span class="grow"></span><button class="solid" data-act="hrresdone">Done</button></div></div>`;
  }
  if (res.type === 'hrr') {
    const H = hrrHistory(), prev = H.slice(1, 6).map(x => x.hrr), V = versus(res.c.hrr, H.slice(1, 30).map(x => x.hrr));
    return `<div class="result ok">${stampSvg}<b>Heart-rate recovery saved</b>
      ${stats([[res.c.hrr, 'bpm drop in 60 s'], [res.c.hr0, 'bpm at stop'], [res.c.hr0 - res.c.hrr, 'bpm after 1 min']])}
      <p class="sub">${V.word ? `Against your last ${V.n}: <b>${V.word}</b> (usually ${Math.round(V.m)} bpm).` : prev.length ? `Previous: ${prev.join(', ')} bpm.` : 'The first one: from three on, each is read against your own.'} A faster fall than your usual, at the same effort, goes with better fitness and freshness; a slower one, with fatigue. ${why('hrr', 'Why')}</p><div class="rowb">${full}<span class="grow"></span><button class="solid" data-act="hrresdone">Done</button></div></div>`;
  }
  const c = res.c, th = res.th;
  return `<div class="result ok">${stampSvg}
    <b>${esc((KINDS.find(x => x[0] === c.kind) || KINDS[KINDS.length - 1])[1])} saved</b>
    ${stats([[dur(c.dur / 60), 'duration'], [`${c.avg} / ${c.max}`, 'avg / max bpm'], [Math.round((c.z[1] + 2 * (c.z[2] + c.z[3])) / 60), 'WHO minutes']])}
    ${traceChart(c)}${zoneBar(c.z)}
    <p class="sub">${th ? `Aerobic threshold estimate: <b>${th.hr} bpm</b>, where α1 crossed 0.75 (${th.n} windows). ${why('dfa', 'How')}` : c.a1?.length ? `α1 was measured in ${c.a1.length} windows but did not cross 0.75 cleanly, so there is no threshold estimate from this one. ${why('dfa', 'Why')}` : `No α1: it needs two minutes of clean beats. ${why('dfa', 'Why')}`}</p>
    ${full ? `<div class="rowb">${full}</div>` : ''}${res.hrrOk && HR.conn === 'on' ? `<div class="rowb"><button class="solid" data-act="hrhrr">Measure recovery · 1 min</button><button class="ghost" data-act="hrresdone">Done</button></div><p class="sub small">Stand still with the strap on: how far your heart rate falls in a minute is a fitness and fatigue signal. ${why('hrr', 'Why')}</p>` : done}</div>`;
}
// Every measure of a reading, each with what it means.
function metricsTable(m) {
  if (!m) return '';
  const row = (k, v, d) => v == null ? '' : `<tr><td>${k}<i>${d}</i></td><td>${v}</td></tr>`;
  const K = m.kinds || {}, fixed = Object.entries(K).filter(([, n]) => n).map(([k, n]) => `${n} ${{ missed: 'missed', extra: 'extra', ectopic: 'ectopic', other: 'irregular', range: 'out of range' }[k]}`).join(', ');
  return `<details class="inner more"><summary>All measures</summary><table class="mt">
    ${row('ln RMSSD', m.ln != null ? m.ln.toFixed(2) : m.rmssd ? Math.log(m.rmssd).toFixed(2) : null, 'the log scale the trials compare')}
    ${row('SDNN', m.sdnn != null ? `${r1(m.sdnn)} ms` : null, 'overall variability, all rhythms')}
    ${row('pNN50', m.pnn50 != null ? `${r1(m.pnn50)}%` : null, 'beats differing from the last by over 50 ms')}
    ${row('SD1 / SD2', m.sd1 != null ? `${r1(m.sd1)} / ${r1(m.sd2)} ms` : null, 'Poincaré: beat-to-beat / longer-term')}
    ${row('HF power', m.hf != null ? `${fmt(m.hf)} ms²` : null, '0.15–0.4 Hz: breathing-linked, vagal')}
    ${row('LF power', m.lf != null ? `${fmt(m.lf)} ms²` : null, '0.04–0.15 Hz: from 2-minute recordings')}
    ${row('LF / HF', m.lfhf != null ? r1(m.lfhf) : null, 'not a "balance": shifts with breathing rate')}
    ${row('Breathing', m.br != null ? `${r1(m.br)} /min` : null, 'from the rhythm in your beats')}
    ${row('Heart rate range', m.minHr != null ? `${Math.round(m.minHr)}–${Math.round(m.maxHr)} bpm` : null, 'lowest to highest beat')}
    ${row('Beats', m.beats != null ? `${m.beats} in ${Math.round(m.dur)} s` : null, fixed ? `corrected: ${fixed}` : 'none needed correcting')}
  </table>${why('metrics', 'What each measure is')}</details>`;
}
// The recording itself: heart rate beat by beat (the breathing is the wave in it), and the Poincaré plot of each
// interval against the next (its width is beat-to-beat variability, its length the slower swings).
function beatsViz(raw, href) {
  if (!raw || raw.length < 20) return '';
  const rr = rrClean(raw).rr, W = 300, H = 70, hr = rr.map(x => 60000 / x), lo = Math.min(...hr) - 1, hi = Math.max(...hr) + 1;
  let t = 0;
  const T = rr.reduce((a, b) => a + b, 0);
  const d = hr.map((h, i) => { const x = t / T * W; t += rr[i]; return `${i ? 'L' : 'M'}${x.toFixed(1)},${(H - 3 - (h - lo) / (hi - lo || 1) * (H - 6)).toFixed(1)}`; }).join('');
  const a = Math.min(...rr), b = Math.max(...rr), pad = (b - a) * 0.08 || 20, P = 120, S2 = v => ((v - a + pad) / (b - a + 2 * pad) * P);
  const dots = rr.slice(1).map((x, i) => `<circle cx="${S2(rr[i]).toFixed(1)}" cy="${(P - S2(x)).toFixed(1)}" r="1.6"/>`).join('');
  return `<div class="beatsviz"><div><svg class="tacho" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Heart rate beat by beat"><path d="${d}"/></svg>
      <p class="key">Beat by beat, ${Math.round(lo + 1)}–${Math.round(hi - 1)} bpm over ${Math.round(T / 1000)} s</p></div>
    <div><svg class="poincare" viewBox="0 0 ${P} ${P}" role="img" aria-label="Poincaré plot"><line x1="0" y1="${P}" x2="${P}" y2="0"/>${dots}</svg><p class="key">Each beat against the next</p></div>${href ? `<a class="bxopen" href="${href}">Explore beat by beat ›</a>` : ''}</div>`;
}
// A saved session's heart rate over time, with its α1 windows marked where they fell.
function traceChart(c) {
  const tr = c.tr || [];
  if (tr.filter(Boolean).length < 4) return '';
  const W = 300, H = 90, ok = tr.filter(Boolean), H9 = hrProfile();
  const lo = Math.min(...ok) - 5, hi = Math.max(...ok) + 5;
  const X = i => i / Math.max(1, tr.length - 1) * W, Y = v => H - 4 - (v - lo) / (hi - lo) * (H - 8);
  let d = '', pen = false;
  tr.forEach((v, i) => { if (!v) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; });
  const zl = H9.zones.filter(z => z > lo && z < hi).map(z => `<line class="zl" x1="0" x2="${W}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}"/>`).join('');
  const a1 = (c.a1 || []).map(([t, a]) => `<circle class="${a < 0.75 ? 'hi' : 'lo'}" cx="${(t / 5 / Math.max(1, tr.length - 1) * W).toFixed(1)}" cy="${(H - 2).toFixed(1)}" r="2.2"/>`).join('');
  const vt = c.vt1 && c.vt1 > lo && c.vt1 < hi ? `<line class="vt" x1="0" x2="${W}" y1="${Y(c.vt1).toFixed(1)}" y2="${Y(c.vt1).toFixed(1)}"/>` : '';
  return `<svg class="trace" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Heart rate through the session">${zl}${vt}<path d="${d}"/>${a1}</svg>
    <p class="key"><i class="k tl"></i>heart rate<i class="k zl"></i>zone edges${vt ? '<i class="k vt"></i>aerobic threshold' : ''}${a1 ? '<i class="k a1lo"></i>α1 above 0.75<i class="k a1hi"></i>below' : ''}</p>`;
}
function zoneBar(z) {
  const tot = z.reduce((a, b) => a + b, 0);
  if (!tot) return '';
  return `<div class="zbar" role="img" aria-label="Time in zones">${z.map((s, i) => s ? `<i class="z${i}" style="flex:${s}"></i>` : '').join('')}</div>
    <p class="key">${ZONES.map((n, i) => z[i] ? `<i class="k z${i}"></i>${n} ${clock(z[i])}` : '').join('')}</p>`;
}
function strapMsg() { return HR.msg ? `<p class="${/^Saved/.test(HR.msg) ? 'sub' : 'flag'} msg">${esc(HR.msg)}</p>` : ''; }
// A saved morning check, opened from the list: its beats and every measure, recomputed from the beats kept with it.
function vHrvInfo(p) {
  const x = S.hrv[p.k];
  if (!x) return '';
  const m = x.rr?.length >= 30 ? hrvMetrics(x.rr) : null, V = hrvState(p.k);
  return `${sheetTop(`Morning check · ${dateLabel(p.k, { weekday: 'long', day: 'numeric', month: 'long' })}${x.t ? ` · ${hm(new Date(x.t).getHours() * 60 + new Date(x.t).getMinutes())}` : ''}`, `${r1(x.rmssd)} ms`, `hrv-${p.k}`)}
    ${stats([[Math.round(x.hr), 'bpm'], [x.q != null ? `${x.q}%` : DASH, 'clean beats'], [V.lo ? `${Math.round(V.lo)}–${Math.round(V.hi)}` : DASH, 'your range, ms']])}
    ${beatsViz(x.rr, `#beats-h${p.k.replace(/-/g, '')}`)}${metricsTable(m || { sdnn: x.sd, pnn50: x.pnn, sd1: x.sd1, sd2: x.sd2, hf: x.hf, lf: x.lf, br: x.br })}
    ${x.pos ? para(`Recorded ${x.pos}${x.dur ? `, ${dur(x.dur / 60)}` : ''}.`) : ''}
    <div class="rowb">${x.rr ? `<a class="solid link" href="#beats-h${p.k.replace(/-/g, '')}">Explore beat by beat</a><button class="ghost" data-act="rrexp" data-k="${p.k}">Save as a file</button>` : ''}<span class="grow"></span><button class="danger" data-hold="hrvdel" data-k="${p.k}">Hold to delete</button></div></aside>`;
}
ACT_HOLD.hrvdel = el => { const k = el.dataset.k, was = S.hrv[k]; if (!was) return; delete S.hrv[k]; save(); closePop(); undoable(`Morning check of ${dateLabel(k)} deleted`, () => { S.hrv[k] = was; }); };
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('h9.js');
