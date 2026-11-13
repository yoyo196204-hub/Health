'use strict';
// Polar H9 (or any strap with the standard Bluetooth heart-rate service). Inside the Android app the phone's
// own Bluetooth is used and the strap is remembered; in Chrome, Web Bluetooth. Both deliver the same packets:
// heart rate and the beat-to-beat (RR) intervals the strap measures from the ECG.
//
// Two uses, each with clear stages and a result that stays on screen until you are done with it:
//  - the morning check: one minute to settle, one minute of beats recorded, then RMSSD, heart rate and SDNN, the beats
//    themselves kept with the reading;
//  - a cardio session: heart rate every second on a live trace, time in each zone, and every 30 seconds the α1 of the
//    last two minutes of beats (detrended fluctuation analysis), from which the session estimates the heart rate of
//    your aerobic threshold. The trace (every 5 seconds) and the α1 windows are saved with the session.

const HR = { conn: 'idle', name: '', battery: null, bpm: null, mode: null, kind: 'walk', t0: 0, last: 0, z: [0, 0, 0, 0], sum: 0, n: 0, max: 0,
  rr: [], rrAll: [], wrr: [], wave: [], tr: [], bin: [], a1: [], a1At: 0, msg: '', tick: null, lock: null, gatt: null, result: null, painted: 0 };
const ZONES = ['Light', 'Moderate', 'Vigorous', 'Near max'];
const SETTLE = 60, RECORD = 60;   // morning check: one minute to settle, one minute recorded
const WAVE_S = 90;                // seconds of heart rate on the live trace

function strapSupported() { return !!NATIVE || !!navigator.bluetooth; }
function setMsg(m) { HR.msg = m; }

async function strapConnect() {
  setMsg(''); HR.result = null;
  if (NATIVE) { HR.conn = 'connecting'; render(); nat('bleConnect', S.meta.h9?.id || ''); return; }
  try {
    HR.conn = 'connecting'; render();
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
    dev.addEventListener('gattserverdisconnected', () => strapLost('The strap disconnected.'));
    const gatt = await dev.gatt.connect(), svc = await gatt.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', e => hrData(e.target.value));
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
function strapDisconnect() { if (NATIVE) nat('bleDisconnect'); else HR.gatt?.disconnect?.(); }
function strapForget() { S.meta.h9 = null; save(); if (NATIVE) nat('bleForget'); strapDisconnect(); }
function strapLost(msg) {
  if (HR.mode === 'workout') hrStop();
  else if (HR.mode === 'morning') { hrEnd(); HR.result = { type: 'morning', ok: false, why: 'The strap disconnected during the check, so nothing was saved.' }; msg = ''; }
  Object.assign(HR, { conn: 'idle', bpm: null, gatt: null });
  setMsg(msg || '');
  if (msg) buzz('warn');
  render();
}
NEV.ble = e => {
  if (!e) return;
  if (e.battery != null) HR.battery = e.battery;
  if (e.state === 'connected') {
    if (HR.conn !== 'on') buzz('ok');
    Object.assign(HR, { conn: 'on', name: e.name || 'Strap' });
    if (e.id && S.meta.h9?.id !== e.id) { S.meta.h9 = { id: e.id, name: e.name || 'Strap' }; save(); }
  } else if (e.state === 'connecting' || e.state === 'scanning') HR.conn = 'connecting';
  else if (e.state === 'disconnected') return strapLost(e.msg);
  else if (e.state === 'error') { HR.conn = 'idle'; setMsg(e.msg || 'Bluetooth error'); buzz('warn'); }
  renderSoft();
};
NEV.hr = bytes => { if (Array.isArray(bytes) && bytes.length >= 2) hrData(new DataView(Uint8Array.from(bytes).buffer)); };

// Heart Rate Measurement (0x2A37): flags, bpm (8 or 16 bit), optional energy, optional RR in 1/1024 s.
function hrData(v) {
  const flags = v.getUint8(0);
  let i = 1;
  const bpm = flags & 1 ? v.getUint16(i, true) : v.getUint8(i);
  i += flags & 1 ? 2 : 1;
  if (flags & 8) i += 2;
  const rr = [];
  if (flags & 16) for (; i + 1 < v.byteLength; i += 2) rr.push(v.getUint16(i, true) / 1024 * 1000);
  const now = Date.now(), first = HR.bpm == null;
  if (bpm < 25 || bpm > 240) return;
  HR.bpm = bpm;
  HR.wave.push([now, bpm]);
  while (HR.wave.length && now - HR.wave[0][0] > WAVE_S * 1000) HR.wave.shift();
  if (HR.mode === 'workout') {
    HR.z[zoneOf(bpm)] += Math.min(5, (now - HR.last) / 1000);
    HR.sum += bpm; HR.n++; HR.max = Math.max(HR.max, bpm);
    for (const x of rr) HR.wrr.push([now, x]);
    while (HR.wrr.length && now - HR.wrr[0][0] > 130000) HR.wrr.shift();
  } else if (HR.mode === 'morning') {
    HR.rrAll.push(...rr);
    if ((now - HR.t0) / 1000 >= SETTLE) HR.rr.push(...rr);
  }
  HR.last = now;
  if (first && !overlay) return renderSoft();
  if (now - HR.painted > 180) hrPaint();
}

// ---------- the live trace ----------
// Heart rate over the last 90 seconds (a workout), or the beats themselves as RR intervals (the morning check: the
// rise and fall with each breath is the variability being measured).
function wavePath(vals, W, H, lo, hi) {
  if (vals.length < 2) return '';
  const Y = v => H - 4 - (v - lo) / (hi - lo || 1) * (H - 8);
  return vals.map(([x, v], i) => `${i ? 'L' : 'M'}${(x * W).toFixed(1)},${Y(v).toFixed(1)}`).join('');
}
function waveData() {
  const W = 300, H = 84;
  if (HR.mode === 'morning') {
    const r = HR.rrAll.filter(x => x > 300 && x < 2000).slice(-70);
    if (r.length < 2) return { d: '', lines: [] };
    let lo = Math.min(...r), hi = Math.max(...r);
    if (hi - lo < 80) { const m = (hi + lo) / 2; lo = m - 40; hi = m + 40; }
    return { d: wavePath(r.map((v, i) => [i / 69, v]), W, H, lo, hi), lines: [] };
  }
  const now = Date.now(), pts = HR.wave.map(([t, b]) => [1 - (now - t) / (WAVE_S * 1000), b]);
  if (pts.length < 2) return { d: '', lines: [] };
  const H9 = hrProfile();
  let lo = Math.min(...pts.map(p => p[1])) - 4, hi = Math.max(...pts.map(p => p[1])) + 4;
  if (hi - lo < 24) { const m = (hi + lo) / 2; lo = m - 12; hi = m + 12; }
  const lines = H9.zones.filter(z => z > lo && z < hi).map(z => (H - 4 - (z - lo) / (hi - lo) * (H - 8)).toFixed(1));
  return { d: wavePath(pts, W, H, lo, hi), lines };
}
function waveSvg() {
  const { d, lines } = waveData();
  return `<svg class="wave ${HR.mode || ''}" viewBox="0 0 300 84" preserveAspectRatio="none" aria-hidden="true">${lines.map(y => `<line x1="0" x2="300" y1="${y}" y2="${y}"/>`).join('')}<path id="wave" d="${d}"/></svg>`;
}
function hrPaint() {
  HR.painted = Date.now();
  const b = document.getElementById('bpm');
  if (!b || HR.bpm == null) return;
  b.textContent = HR.bpm;
  const beat = document.getElementById('beat'); if (beat) beat.style.animationDuration = `${(60 / HR.bpm).toFixed(2)}s`;
  const zEl = document.getElementById('zone'); if (zEl) zEl.textContent = HR.mode === 'morning' ? 'lying still' : ZONES[zoneOf(HR.bpm)];
  const w = document.getElementById('wave');
  if (w) { const { d } = waveData(); w.setAttribute('d', d); }
  const el = (Date.now() - HR.t0) / 1000, c = document.getElementById('clock');
  if (HR.mode === 'morning') {
    if (c) c.textContent = el < SETTLE ? `Settling · ${clock(SETTLE - el)}` : `Recording · ${clock(SETTLE + RECORD - el)}`;
    const ring = document.getElementById('ring'); if (ring) ring.setAttribute('stroke-dasharray', `${clamp(el / (SETTLE + RECORD) * 100, 0, 100).toFixed(1)} 100`);
    const st = document.querySelector('.strap'); if (st) { st.classList.toggle('st-settle', el < SETTLE); st.classList.toggle('st-record', el >= SETTLE); }
    const n = document.getElementById('beats'); if (n) n.textContent = HR.rr.length;
  } else if (HR.mode === 'workout') {
    if (c) c.textContent = clock(el);
    HR.z.forEach((s, i) => { const z = document.getElementById('z' + i); if (z) z.textContent = clock(s); });
    const a = document.getElementById('a1'), last = HR.a1[HR.a1.length - 1];
    if (a) a.innerHTML = a1Line(last);
  }
}
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
  Object.assign(HR, { mode, t0: Date.now(), last: Date.now(), z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, rr: [], rrAll: [], wrr: [], tr: [], bin: [], a1: [], a1At: 0, msg: '', result: null });
  clearInterval(HR.tick);
  HR.tick = setInterval(hrTick, 1000);
  keepAwake(true);
  buzz('ok');
  render();
}
// The clock runs on its own, so a strap that stops sending is noticed instead of freezing the screen. Each second
// also samples heart rate for the saved trace (an even 1 Hz whatever the strap's packet rate), and every 30 seconds
// of a workout the last two minutes of beats give a new α1.
function hrTick() {
  const now = Date.now(), el = (now - HR.t0) / 1000;
  if (HR.mode === 'morning') {
    if (now - HR.last > 15000) { hrEnd(); HR.result = { type: 'morning', ok: false, why: 'Lost contact with the strap. Wet the electrodes and start again.' }; buzz('warn'); return render(); }
    if (Math.floor(el) === SETTLE) buzz('tick');   // the recorded minute starts
    if (el >= SETTLE + RECORD) return hrMorningDone();
  } else if (HR.mode === 'workout') {
    HR.bin.push(now - HR.last < 5000 ? HR.bpm : 0);
    if (HR.bin.length >= 5) { const ok = HR.bin.filter(Boolean); HR.tr.push(ok.length ? Math.round(mean(ok)) : 0); HR.bin = []; if (HR.tr.length > 1440) HR.tr.shift(); }
    if (el >= 120 && now - HR.a1At >= 30000) {
      HR.a1At = now;
      const raw = HR.wrr.filter(([t]) => now - t <= 120000).map(x => x[1]), C = cleanRR(raw);
      if (raw.length >= 100 && C.bad <= 0.05) {
        const a = dfaA1(C.rr);
        if (a != null && a > 0.1 && a < 2.5) { HR.a1.push([Math.round(el), Math.round(a * 1000) / 1000, Math.round(60000 / mean(C.rr))]); if (HR.a1.length > 300) HR.a1.shift(); }
      }
    }
  }
  hrPaint();
}
function hrEnd() { HR.mode = null; clearInterval(HR.tick); HR.tick = null; keepAwake(false); }
function hrStop() {
  const dur = (Date.now() - HR.t0) / 1000, k = dk(new Date(HR.t0));
  if (dur >= 60 && HR.n) {
    const th = hrvThreshold(HR.a1);
    const c = cleanCardio({ t: HR.t0, kind: HR.kind, dur: Math.round(dur), avg: Math.round(HR.sum / HR.n), max: HR.max, z: HR.z.map(Math.round), tr: HR.tr, a1: HR.a1, vt1: th?.hr });
    if (c) { (S.cardio[k] ||= []).push(c); S.cardio[k] = S.cardio[k].slice(-10); save(); buzz('done'); }
    HR.result = { type: 'workout', ok: !!c, k, c, th };
    setMsg('');
  } else { HR.result = { type: 'workout', ok: false, why: 'Under a minute, so it was not saved.' }; buzz('warn'); }
  hrEnd();
}
// RMSSD from RR intervals. Beats outside 300–2000 ms, or more than 20% from the one before, are artefact and the
// differences they take part in are left out. SDNN over the same clean beats.
function rmssd(rr) {
  const ok = rr.filter(x => x > 300 && x < 2000);
  let s = 0, n = 0;
  for (let i = 1; i < ok.length; i++) { const d = ok[i] - ok[i - 1]; if (Math.abs(d) > 0.2 * ok[i - 1]) continue; s += d * d; n++; }
  return n >= 30 ? { rmssd: Math.sqrt(s / n), hr: 60000 / mean(ok), sd: sd(ok), q: Math.round(n / Math.max(1, rr.length - 1) * 100) } : null;
}
function hrMorningDone() {
  const r = rmssd(HR.rr), k = todayKey(), before = S.hrv[k];
  hrEnd();
  if (r && r.q >= 80) {
    S.hrv[k] = cleanHrv({ rmssd: r1(r.rmssd), hr: r1(r.hr), q: r.q, sd: r1(r.sd), t: Date.now(), rr: HR.rr.filter(x => x > 300 && x < 2000).slice(0, 240) });
    save(); buzz('done');
    HR.result = { type: 'morning', ok: true, k, r, replaced: !!before };
  } else {
    buzz('warn');
    HR.result = { type: 'morning', ok: false, why: r ? `Only ${r.q}% of beats were clean, so nothing was saved. Lie still, wet the electrodes and try again.` : 'The signal was too noisy. Wet the strap electrodes, lie still and try again.' };
  }
  render();
}
function hrAct(a, el) {
  if (a === 'hrconnect') { buzz('tick'); return strapConnect(); }
  if (a === 'hrdisconnect') { buzz('tick'); return strapDisconnect(); }
  if (a === 'hrforget') { strapForget(); buzz('heavy'); return render(); }
  if (a === 'hrworkout') return hrStart('workout');
  if (a === 'hrmorning') return hrStart('morning');
  if (a === 'hrkind') { HR.kind = el.dataset.k; buzz('tick'); return render(); }
  if (a === 'hrstop') { hrStop(); return render(); }
  if (a === 'hrcancel') { hrEnd(); setMsg(''); buzz('tick'); return render(); }
  if (a === 'hrresdone') { HR.result = null; buzz('tick'); return render(); }
}

// ---------- the block, shared by Training (cardio) and Recovery (morning check) ----------
function liveHead() {
  return `<div class="bpm"><span class="beat" id="beat" style="animation-duration:${(60 / (HR.bpm || 60)).toFixed(2)}s"></span><b class="num" id="bpm">${HR.bpm}</b>
    <span>bpm · <span id="zone">${HR.mode === 'morning' ? 'lying still' : ZONES[zoneOf(HR.bpm)]}</span>${HR.battery != null ? ` · battery ${HR.battery}%` : ''}</span></div>${waveSvg()}`;
}
function strapBlock(purpose) {
  const H = hrProfile(), res = HR.result;
  if (res && (res.type === 'morning') === (purpose === 'morning')) return `<div class="strap st-done">${resultCard(res)}</div>`;
  if (!strapSupported()) return `<p class="sub">Bluetooth is not available here. Use the Android app, or Chrome on Android.</p>`;
  if (HR.conn === 'connecting') return `<div class="strap st-connecting"><div class="seek" aria-hidden="true"><i></i><i></i><i></i></div>
    <p class="sub center">Connecting${S.meta.h9 ? ` to ${esc(S.meta.h9.name)}` : ''}… Wet the electrodes and wear the strap; it only wakes up on skin.</p><button class="ghost wide" data-act="hrdisconnect">Cancel</button></div>`;
  if (HR.conn !== 'on') return `<div class="strap st-idle"><p class="sub">${purpose === 'morning' ? 'On waking, before getting up: wet the strap, put it on, connect, then lie still for two minutes.' : 'Wet the electrodes, put the strap on, then connect.'} Close Polar Beat or Zepp first if either is holding the strap.</p>
    <button class="solid" data-act="hrconnect">${S.meta.h9 && NATIVE ? `Connect ${esc(S.meta.h9.name)}` : 'Connect Polar H9'}</button></div>`;
  if (HR.bpm == null) return '<div class="strap st-connecting"><div class="seek" aria-hidden="true"><i></i><i></i><i></i></div><p class="sub center">Connected. Waiting for the first beat…</p></div>';
  if (HR.mode === 'workout') return `<div class="strap st-live">${liveHead()}<div class="eyebrow center" id="clock">${clock((Date.now() - HR.t0) / 1000)}</div>
    <p class="a1 center" id="a1">${a1Line(HR.a1[HR.a1.length - 1])}</p>
    <div class="stats four">${ZONES.map((z, i) => `<div><b class="num" id="z${i}">${clock(HR.z[i])}</b><span class="sub">${z}</span></div>`).join('')}</div>
    <button class="solid wide" data-act="hrstop">Stop and save</button></div>`;
  if (HR.mode === 'morning') {
    const el = (Date.now() - HR.t0) / 1000;
    return `<div class="strap ${el < SETTLE ? 'st-settle' : 'st-record'}"><div class="mring"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="16" pathLength="100"/><circle id="ring" class="fg" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${clamp(el / (SETTLE + RECORD) * 100, 0, 100).toFixed(1)} 100"/></svg>
      <div>${liveHead()}</div></div>
      <div class="eyebrow center" id="clock">${el < SETTLE ? `Settling · ${clock(SETTLE - el)}` : `Recording · ${clock(SETTLE + RECORD - el)}`}</div>
      <p class="sub center">Lie still, breathe normally, don't talk. The first minute settles, the second is recorded: <b id="beats">${HR.rr.length}</b> beats so far.</p><button class="ghost wide" data-act="hrcancel">Cancel</button></div>`;
  }
  if (purpose === 'morning') return `<div class="strap st-live">${liveHead()}<button class="solid wide" data-act="hrmorning">Start morning check · 2 min</button></div>`;
  return `<div class="strap st-live">${liveHead()}<p class="sub">Zones today: moderate ${H.zones[0]}–${H.zones[1] - 1}, vigorous ${H.zones[1]}–${H.zones[2] - 1} bpm. For an aerobic-threshold estimate, start easy and build gradually over 15–20 minutes.</p>
    <div class="chips tight">${KINDS.map(([k, l]) => `<button class="${HR.kind === k ? 'on' : ''}" data-act="hrkind" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="solid wide" data-act="hrworkout">Start ${(KINDS.find(x => x[0] === HR.kind) || KINDS[KINDS.length - 1])[1].toLowerCase()}</button></div>`;
}
// What just happened, in full, until you tap Done.
function resultCard(res) {
  const done = '<button class="solid wide" data-act="hrresdone">Done</button>';
  if (!res.ok) return `<div class="result bad"><b>Not saved</b><p class="sub">${esc(res.why || '')}</p>${done}</div>`;
  if (res.type === 'morning') {
    const V = hrvState(res.k), x = S.hrv[res.k], R = readiness(res.k);
    const pos = V.lo ? clamp((Math.log(x.rmssd) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100, 2, 98) : null;
    const band = V.lo ? `<div class="rangebar" role="img" aria-label="Today against your normal range"><i class="band" style="left:${((Math.log(V.lo) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100).toFixed(1)}%;right:${(100 - (Math.log(V.hi) - Math.log(V.lo * 0.8)) / (Math.log(V.hi * 1.25) - Math.log(V.lo * 0.8)) * 100).toFixed(1)}%"></i><i class="mark" style="left:${pos.toFixed(1)}%"></i></div>
      <p class="sub center">Your normal range ${Math.round(V.lo)}–${Math.round(V.hi)} ms${V.provisional ? ', provisional' : ''}. Today is ${V.day === 'low' ? 'below it' : V.day === 'high' ? 'above it' : 'inside it'}; it is the 7-day average that decides.</p>` : para(`${plural(V.n, 'reading')} so far; your normal range appears after ${V.need ?? 0} more.`, 'sub center');
    return `<div class="result ok"><svg viewBox="0 0 48 48" class="stamp" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>
      <b>Morning check saved${res.replaced ? ', replacing this morning’s earlier one' : ''}</b>
      ${stats([[r1(x.rmssd), 'RMSSD, ms'], [Math.round(x.hr), 'bpm'], [`${x.q}%`, 'clean beats']])}${band}
      <p class="sub">SDNN ${x.sd ?? DASH} ms · ${x.rr?.length || 0} beats recorded. ${V.roll ? `7-day average now ${r1(V.roll)} ms.` : ''} Today’s verdict: <b>${VERDICT[R.level][0].toLowerCase()}</b>.</p>${done}</div>`;
  }
  const c = res.c, th = res.th;
  return `<div class="result ok"><svg viewBox="0 0 48 48" class="stamp" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 25l7 7 13-15"/></svg>
    <b>${esc((KINDS.find(x => x[0] === c.kind) || KINDS[KINDS.length - 1])[1])} saved</b>
    ${stats([[dur(c.dur / 60), 'duration'], [`${c.avg} / ${c.max}`, 'avg / max bpm'], [Math.round((c.z[1] + 2 * (c.z[2] + c.z[3])) / 60), 'WHO minutes']])}
    ${traceChart(c)}${zoneBar(c.z)}
    <p class="sub">${th ? `Aerobic threshold estimate: <b>${th.hr} bpm</b>, where α1 crossed 0.75 (${th.n} windows). ${why('dfa', 'How')}` : c.a1?.length ? `α1 was measured in ${c.a1.length} windows but did not cross 0.75 cleanly, so there is no threshold estimate from this one. ${why('dfa', 'Why')}` : `No α1: it needs two minutes of clean beats. ${why('dfa', 'Why')}`}</p>${done}</div>`;
}
// A saved session's heart rate over time, with its α1 windows marked where they fell.
function traceChart(c) {
  const tr = c.tr || [];
  if (tr.filter(Boolean).length < 4) return '';
  const W = 300, H = 90, ok = tr.filter(Boolean), H9 = hrProfile();
  let lo = Math.min(...ok) - 5, hi = Math.max(...ok) + 5;
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
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('h9.js');
