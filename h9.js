'use strict';
// Polar H9 (or any strap with the standard Bluetooth heart-rate service). Inside the Android app the phone's
// own Bluetooth is used and the strap is remembered; in Chrome, Web Bluetooth. Both deliver the same packets.

const HR = { conn: 'idle', name: '', battery: null, bpm: null, mode: null, kind: 'walk', t0: 0, last: 0, z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, rr: [], beats: 0, msg: '', tick: null, lock: null, gatt: null };
const ZONES = ['Light', 'Moderate', 'Vigorous', 'Near max'];
const SETTLE = 60, RECORD = 60;   // morning check: one minute to settle, one minute recorded

function strapSupported() { return !!NATIVE || !!navigator.bluetooth; }
function setMsg(m) { HR.msg = m; }

async function strapConnect() {
  setMsg('');
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
  else if (HR.mode === 'morning') { hrEnd(); msg = 'The strap disconnected during the morning check. Nothing was saved.'; }
  Object.assign(HR, { conn: 'idle', bpm: null, gatt: null });
  setMsg(msg || '');
  render();
}
NEV.ble = e => {
  if (!e) return;
  if (e.battery != null) HR.battery = e.battery;
  if (e.state === 'connected') {
    Object.assign(HR, { conn: 'on', name: e.name || 'Strap' });
    if (e.id && S.meta.h9?.id !== e.id) { S.meta.h9 = { id: e.id, name: e.name || 'Strap' }; save(); }
  } else if (e.state === 'connecting' || e.state === 'scanning') HR.conn = 'connecting';
  else if (e.state === 'disconnected') return strapLost(e.msg);
  else if (e.state === 'error') { HR.conn = 'idle'; setMsg(e.msg || 'Bluetooth error'); }
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
  if (HR.mode === 'workout') {
    HR.z[zoneOf(bpm)] += Math.min(5, (now - HR.last) / 1000);
    HR.sum += bpm; HR.n++; HR.max = Math.max(HR.max, bpm);
  } else if (HR.mode === 'morning' && (now - HR.t0) / 1000 >= SETTLE) HR.rr.push(...rr);
  HR.last = now;
  if (first && !overlay) return renderSoft();
  hrPaint();
}
function hrPaint() {
  const b = document.getElementById('bpm');
  if (!b || HR.bpm == null) return;
  b.textContent = HR.bpm;
  const zEl = document.getElementById('zone'); if (zEl) zEl.textContent = ZONES[zoneOf(HR.bpm)];
  const c = document.getElementById('clock'), el = (Date.now() - HR.t0) / 1000;
  if (c) c.textContent = HR.mode === 'morning' ? (el < SETTLE ? `Settling · ${clock(SETTLE - el)}` : `Recording · ${clock(SETTLE + RECORD - el)}`) : clock(el);
  if (HR.mode === 'workout') HR.z.forEach((s, i) => { const z = document.getElementById('z' + i); if (z) z.textContent = clock(s); });
}
function keepAwake(on) {
  if (NATIVE) return nat('keepAwake', !!on);
  if (on) navigator.wakeLock?.request('screen').then(l => { HR.lock = l; }).catch(() => {});
  else { HR.lock?.release?.(); HR.lock = null; }
}
function hrStart(mode) {
  Object.assign(HR, { mode, t0: Date.now(), last: Date.now(), z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, rr: [], msg: '' });
  clearInterval(HR.tick);
  HR.tick = setInterval(hrTick, 1000);
  keepAwake(true);
  render();
}
// The clock runs on its own, so a strap that stops sending is noticed instead of freezing the screen.
function hrTick() {
  const now = Date.now(), el = (now - HR.t0) / 1000;
  if (HR.mode === 'morning') {
    if (now - HR.last > 15000) { hrEnd(); setMsg('Lost contact with the strap. Wet the electrodes and start again.'); return render(); }
    if (el >= SETTLE + RECORD) return hrMorningDone();
  }
  hrPaint();
}
function hrEnd() { HR.mode = null; clearInterval(HR.tick); HR.tick = null; keepAwake(false); }
function hrStop() {
  const dur = (Date.now() - HR.t0) / 1000, k = dk(new Date(HR.t0));
  if (dur >= 60 && HR.n) {
    (S.cardio[k] ||= []).push({ t: HR.t0, kind: HR.kind, dur: Math.round(dur), avg: Math.round(HR.sum / HR.n), max: HR.max, z: HR.z.map(Math.round) });
    save(); setMsg(`Saved: ${clock(dur)}, average ${Math.round(HR.sum / HR.n)} bpm.`);
  } else setMsg('Under a minute, not saved.');
  hrEnd();
}
// RMSSD from RR intervals. Beats outside 300–2000 ms, or more than 20% from the one before, are artefact.
function rmssd(rr) {
  const ok = rr.filter(x => x > 300 && x < 2000);
  let s = 0, n = 0;
  for (let i = 1; i < ok.length; i++) { const d = ok[i] - ok[i - 1]; if (Math.abs(d) > 0.2 * ok[i - 1]) continue; s += d * d; n++; }
  return n >= 30 ? { rmssd: Math.sqrt(s / n), hr: 60000 / mean(ok), q: Math.round(n / Math.max(1, rr.length - 1) * 100) } : null;
}
function hrMorningDone() {
  const r = rmssd(HR.rr);
  hrEnd();
  if (r && r.q >= 80) { S.hrv[todayKey()] = { rmssd: r1(r.rmssd), hr: r1(r.hr), q: r.q }; save(); setMsg(''); }
  else setMsg(r ? `Only ${r.q}% of beats were clean, so nothing was saved. Lie still, wet the electrodes and try again.` : 'Signal too noisy. Wet the strap electrodes, lie still and try again.');
  render();
}
function hrAct(a, el) {
  if (a === 'hrconnect') return strapConnect();
  if (a === 'hrdisconnect') return strapDisconnect();
  if (a === 'hrforget') { strapForget(); return render(); }
  if (a === 'hrworkout') return hrStart('workout');
  if (a === 'hrmorning') return hrStart('morning');
  if (a === 'hrkind') { HR.kind = el.dataset.k; return render(); }
  if (a === 'hrstop') { hrStop(); return render(); }
  if (a === 'hrcancel') { hrEnd(); setMsg(''); return render(); }
}

// The live block, shared by Train (workouts) and Recovery (morning check).
function strapBlock(purpose) {
  const H = hrProfile();
  if (!strapSupported()) return `<p class="sub">Bluetooth is not available here. Use the Android app, or Chrome on Android.</p>`;
  if (HR.conn === 'connecting') return `<p class="sub">Connecting${S.meta.h9 ? ` to ${esc(S.meta.h9.name)}` : ''}… Wet the electrodes and wear the strap; it only wakes up on skin.</p><button class="ghost" data-act="hrdisconnect">Cancel</button>`;
  if (HR.conn !== 'on') return `<p class="sub">${purpose === 'morning' ? 'On waking, before getting up: wet the strap, put it on, connect, lie still for two minutes.' : 'Wet the electrodes, put the strap on, then connect.'} Close Polar Beat or Zepp first if either is holding the strap.</p>
    <button class="solid" data-act="hrconnect">${S.meta.h9 && NATIVE ? `Connect ${esc(S.meta.h9.name)}` : 'Connect Polar H9'}</button>`;
  if (HR.bpm == null) return '<p class="sub">Connected. Waiting for the first beat…</p>';
  const head = `<div class="bpm"><b class="num" id="bpm">${HR.bpm}</b><span>bpm · <span id="zone">${ZONES[zoneOf(HR.bpm)]}</span>${HR.battery != null ? ` · battery ${HR.battery}%` : ''}</span></div>`;
  if (HR.mode === 'workout') return `${head}<div class="eyebrow center" id="clock">0:00</div>
    <div class="stats four">${ZONES.map((z, i) => `<div><b class="num" id="z${i}">${clock(HR.z[i])}</b><span class="sub">${z}</span></div>`).join('')}</div>
    <button class="solid wide" data-act="hrstop">Stop and save</button>`;
  if (HR.mode === 'morning') return `${head}<div class="eyebrow center" id="clock">Settling · ${clock(SETTLE)}</div>
    <p class="sub center">Lie still, breathe normally, don't talk. The first minute settles, the second is recorded.</p><button class="ghost" data-act="hrcancel">Cancel</button>`;
  if (purpose === 'morning') return `${head}<button class="solid wide" data-act="hrmorning">Start morning check · 2 min</button>`;
  return `${head}<p class="sub">Zones today: moderate ${H.zones[0]}–${H.zones[1] - 1}, vigorous ${H.zones[1]}–${H.zones[2] - 1} bpm.</p>
    <div class="chips tight">${KINDS.map(([k, l]) => `<button class="${HR.kind === k ? 'on' : ''}" data-act="hrkind" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="solid wide" data-act="hrworkout">Start ${(KINDS.find(x => x[0] === HR.kind) || KINDS[4])[1].toLowerCase()}</button>`;
}
function strapMsg() { return HR.msg ? `<p class="${/^Saved/.test(HR.msg) ? 'sub' : 'flag'} msg">${esc(HR.msg)}</p>` : ''; }
