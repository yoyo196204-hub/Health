'use strict';
// Polar H9 (or any strap using the standard Bluetooth heart-rate service) over Web Bluetooth.
// Runs in Chrome on Android. The strap sends heart rate and beat-to-beat (RR) intervals about once a second.

const HR = { dev: null, bpm: null, mode: null, t0: 0, last: 0, z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, rr: [], msg: '', lock: null };
const ZONES = ['Light', 'Moderate', 'Vigorous', 'Near max'];
const SETTLE = 60, RECORD = 60; // morning check: seconds to settle, then seconds recorded

function hrLimits() {
  const last = latest(S.hrv);
  return { max: Math.round(208 - 0.7 * ageYears()), rest: last ? Math.round(last.hr) : 70 };
}
function zoneOf(bpm) {
  const { max, rest } = hrLimits(), r = (bpm - rest) / (max - rest);
  return r < 0.4 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
}
function clock(s) { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

async function hrConnect() {
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
    dev.addEventListener('gattserverdisconnected', () => {
      if (HR.mode === 'workout') hrStop();
      Object.assign(HR, { dev: null, bpm: null, mode: null, msg: 'Strap disconnected.' });
      if (tab === 'heart') render();
    });
    const svc = await (await dev.gatt.connect()).getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', e => hrData(e.target.value));
    await ch.startNotifications();
    Object.assign(HR, { dev, msg: '' });
  } catch (e) {
    HR.msg = e.name === 'NotFoundError' ? '' : `Could not connect: ${e.message}`;
  }
  render();
}

// Heart Rate Measurement characteristic (0x2A37): flags, bpm, optional energy, optional RR in 1/1024 s.
function hrData(v) {
  const flags = v.getUint8(0);
  let i = 1;
  const bpm = flags & 1 ? v.getUint16(i, true) : v.getUint8(i);
  i += flags & 1 ? 2 : 1;
  if (flags & 8) i += 2;
  const rr = [];
  if (flags & 16) for (; i + 1 < v.byteLength; i += 2) rr.push(v.getUint16(i, true) / 1024 * 1000);
  const now = Date.now(), first = HR.bpm == null;
  HR.bpm = bpm;
  if (HR.mode === 'workout') {
    HR.z[zoneOf(bpm)] += Math.min(5, (now - HR.last) / 1000);
    HR.sum += bpm; HR.n++; HR.max = Math.max(HR.max, bpm);
  } else if (HR.mode === 'morning') {
    const el = (now - HR.t0) / 1000;
    if (el >= SETTLE) HR.rr.push(...rr);
    if (el >= SETTLE + RECORD) return hrMorningDone();
  }
  HR.last = now;
  if (first && tab === 'heart' && !overlay) return render();
  hrPaint();
}
function hrPaint() {
  const b = document.getElementById('bpm');
  if (!b) return;
  b.textContent = HR.bpm;
  document.getElementById('zone').textContent = ZONES[zoneOf(HR.bpm)];
  const c = document.getElementById('clock'), el = (Date.now() - HR.t0) / 1000;
  if (c) c.textContent = HR.mode === 'morning' ? clock(SETTLE + RECORD - el) : clock(el);
  if (HR.mode === 'workout') HR.z.forEach((s, i) => { const z = document.getElementById('z' + i); if (z) z.textContent = clock(s); });
}

async function hrStart(mode) {
  Object.assign(HR, { mode, t0: Date.now(), last: Date.now(), z: [0, 0, 0, 0], sum: 0, n: 0, max: 0, rr: [], msg: '' });
  try { HR.lock = await navigator.wakeLock?.request('screen'); } catch (e) { /* screen may sleep */ }
  render();
}
function hrEnd() { HR.mode = null; HR.lock?.release?.(); HR.lock = null; }
function hrStop() {
  const dur = (Date.now() - HR.t0) / 1000;
  if (dur >= 60 && HR.n) {
    (S.cardio[dk(new Date())] ||= []).push({ dur: Math.round(dur), avg: Math.round(HR.sum / HR.n), max: HR.max, z: HR.z.map(Math.round) });
    save(); HR.msg = `Saved: ${clock(dur)}, average ${Math.round(HR.sum / HR.n)} bpm.`;
  } else HR.msg = 'Under a minute, not saved.';
  hrEnd();
}

// RMSSD from RR intervals. Beats outside 300–2000 ms or jumping more than 20% are treated as artefact.
function rmssd(rr) {
  const ok = rr.filter(x => x > 300 && x < 2000);
  let s = 0, n = 0;
  for (let i = 1; i < ok.length; i++) { const d = ok[i] - ok[i - 1]; if (Math.abs(d) > 0.2 * ok[i - 1]) continue; s += d * d; n++; }
  return n >= 30 ? { rmssd: Math.sqrt(s / n), hr: 60000 / mean(ok) } : null;
}
function hrMorningDone() {
  const r = rmssd(HR.rr);
  if (r) { S.hrv[dk(new Date())] = { rmssd: r1(r.rmssd), hr: r1(r.hr) }; save(); HR.msg = ''; }
  else HR.msg = 'Signal too noisy. Wet the strap electrodes, lie still and try again.';
  hrEnd(); render();
}
// Today against the rolling baseline of up to 7 earlier readings, on the log scale.
function readiness() {
  const today = dk(new Date()), now = S.hrv[today];
  const prev = Object.keys(S.hrv).filter(k => k < today).sort().slice(-7).map(k => Math.log(S.hrv[k].rmssd));
  if (!now) return { now: null, n: prev.length };
  if (prev.length < 5) return { now, n: prev.length };
  const m = mean(prev), sd = Math.sqrt(mean(prev.map(x => (x - m) ** 2))), x = Math.log(now.rmssd), band = Math.max(0.5 * sd, 0.05);
  return { now, n: prev.length, base: Math.exp(m), state: x < m - band ? 'low' : x > m + band ? 'high' : 'normal' };
}

function hrAct(a) {
  if (a === 'hrconnect') return hrConnect();
  if (a === 'hrworkout') return hrStart('workout');
  if (a === 'hrmorning') return hrStart('morning');
  if (a === 'hrstop') { hrStop(); return render(); }
  if (a === 'hrcancel') { hrEnd(); return render(); }
}

function vHeart() {
  const week = lastDays(7).flatMap(k => S.cardio[k] || []);
  const mins = Math.round(week.reduce((a, c) => a + c.z[1] + 2 * (c.z[2] + c.z[3]), 0) / 60);
  const R = readiness(), lim = hrLimits();
  let live;
  if (!navigator.bluetooth) live = '<p class="sub">Bluetooth is not available in this browser. Open the app in Chrome on your Android phone or tablet.</p>';
  else if (!HR.dev) live = `<p class="sub">Wet the strap electrodes, put the H9 on, then connect. Close Polar Beat or Zepp first if either is holding the strap.</p><button class="solid" data-act="hrconnect">Connect Polar H9</button>`;
  else if (HR.bpm == null) live = '<p class="sub">Connected. Waiting for the first beat.</p>';
  else {
    const head = `<div class="bpm"><b class="num" id="bpm">${HR.bpm}</b><span>bpm · <span id="zone">${ZONES[zoneOf(HR.bpm)]}</span></span></div>`;
    if (HR.mode === 'workout') live = `${head}<div class="eyebrow center" id="clock">0:00</div>
      <div class="stats four">${ZONES.map((z, i) => `<div><b class="num" id="z${i}">${clock(HR.z[i])}</b><span class="sub">${z}</span></div>`).join('')}</div>
      <button class="solid" data-act="hrstop">Stop and save</button>`;
    else if (HR.mode === 'morning') live = `${head}<div class="eyebrow center" id="clock">${clock(SETTLE + RECORD)}</div>
      <p class="sub center">Lie still and breathe normally. The first minute settles, the second is recorded.</p><button class="ghost" data-act="hrcancel">Cancel</button>`;
    else live = `${head}<div class="rowb"><button class="solid" data-act="hrworkout">Start workout</button><button class="ghost" data-act="hrmorning">Morning check, 2 min</button></div>`;
  }
  const verdict = !R.now ? `No reading today. ${R.n} of 5 earlier readings toward a baseline.`
    : !R.state ? `Today ${R.now.rmssd} ms. ${R.n} of 5 earlier readings toward a baseline; until then this is only a number.`
    : R.state === 'low' ? 'Below your normal range. Keep today easy: walk, or lift lighter.'
    : R.state === 'high' ? 'Above your normal range. Fine to train as planned.' : 'Within your normal range. Train as planned.';
  return `<header class="top left"><div><div class="eyebrow">Polar H9 · resting ${lim.rest}, max about ${lim.max} bpm</div><h1>Heart</h1></div></header>
    <section class="block">${live}${HR.msg ? `<p class="${/^Saved/.test(HR.msg) ? 'sub' : 'flag'}" style="margin-top:10px">${HR.msg}</p>` : ''}</section>
    <section class="block"><div class="mh"><h2>Active minutes, 7 days</h2>${why('zones', 'How it counts')}</div>
      <div class="bar"><i style="width:${Math.min(100, mins / 150 * 100)}%"></i></div>
      <p class="sub"><b class="num">${mins}</b> of 150. Vigorous minutes count double. ${week.length} recorded session${week.length === 1 ? '' : 's'}.</p></section>
    <section class="block"><div class="mh"><h2>Morning HRV</h2>${why('hrv', 'What it means')}</div>
      <div class="stats">${[[R.now ? R.now.rmssd : '–', 'RMSSD today, ms'], [R.base ? r1(R.base) : '–', '7-day baseline'], [R.now ? Math.round(R.now.hr) : '–', 'resting bpm']].map(([v, l]) => `<div><b class="num">${v}</b><span class="sub">${l}</span></div>`).join('')}</div>
      <p class="${R.state === 'low' ? 'flag' : 'sub'}">${verdict}</p></section>`;
}
