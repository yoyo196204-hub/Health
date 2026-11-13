'use strict';
// The bridge to the Android app. Inside the app, window.HealthNative is injected and the phone's
// Health Connect, Bluetooth and file pickers are used directly. In Chrome it is absent and web fallbacks run.
const NATIVE = window.HealthNative || null;
const NEV = {};
window.__fromNative = (ev, data) => { try { NEV[ev]?.(data); } catch (e) { console.error(e); } };
function nat(method, ...args) { try { return NATIVE?.[method]?.(...args) ?? null; } catch (e) { console.error(e); return null; } }
function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
const APP = NATIVE ? parse(nat('info')) || {} : null;
const HERE = location.origin + location.pathname.replace(/[^/]*$/, '');
// Every build is published, signed with the app's permanent key, on the repository's Releases page.
const APK = 'https://github.com/yoyo196204-hub/Health/releases/latest/download/health.apk';

// ---------- the app's private copy ----------
// Inside the app every save is also written, a moment later, to a file only this app can read. If the WebView's
// storage is ever lost or damaged, the app starts from that copy instead of from nothing.
function mirrorRead() {
  if (!NATIVE || typeof NATIVE.mirrorRead !== 'function') return null;
  try { const t = nat('mirrorRead'); return t ? sanitize(JSON.parse(t)) : null; } catch (e) { return null; }
}
function mirrorWrite(text) { if (NATIVE && typeof NATIVE.mirrorWrite === 'function') nat('mirrorWrite', text); }

// ---------- Health Connect ----------
const SYNC = { busy: false, err: '', status: null, got: null };
function hcCheck() { if (NATIVE) nat('hcStatus'); }
function hcAsk() { if (NATIVE) nat('hcRequest'); }
// Reads only what is new since the last sync (plus two days, since the watch fills in late), up to 30 days.
// Strap workouts in the range are sent along so the app can read the watch's heart rate inside them.
function syncNow(days) {
  if (!NATIVE || SYNC.busy) return;
  const last = S.meta.sync;
  days = days || (last ? clamp(Math.ceil((Date.now() - last) / DAY) + 2, 3, 30) : 30);
  const windows = [];
  for (const k of range(Math.min(days, 60))) for (const c of S.cardio[k] || []) if (c.t) windows.push([c.t, Math.round(c.t + c.dur * 1000)]);
  Object.assign(SYNC, { busy: true, err: '' });
  nat('hcRead', JSON.stringify({ days, windows }));
  paintSync();
}
function autoSync() {
  if (NATIVE && SYNC.status?.granted?.length && (!S.meta.sync || Date.now() - S.meta.sync > 15 * 6e4)) syncNow();
}
NEV['hc-status'] = st => { SYNC.status = st; autoSync(); renderSoft(); };
NEV['hc-data'] = P => {
  SYNC.busy = false;
  if (!P || P.error) SYNC.err = P?.error || 'Health Connect did not answer.';
  else { SYNC.got = mergeSync(P); S.meta.sync = Date.now(); save(); }
  renderSoft();
};
NEV.resume = () => { rollDay(); autoSync(); autoBackup(); ogAuto(); restTick(); renderSoft(); };
NEV.pause = () => flushMirror();
// Update the sync line in place, so a sync never steals focus from a field being typed in.
function paintSync() { const el = $('#syncline'); if (el) el.outerHTML = syncLine(); }

// One merge for every outside source: Health Connect, a Zepp export, or the old sync app.
// Days you typed by hand are never overwritten; clearing your entry hands the day back to the watch.
function mergeSync(P) {
  const today = todayKey(), got = { days: 0, steps: 0, sleep: 0, rhr: 0, weight: 0, workouts: 0, pairs: 0 };
  let last = S.meta.watch || '';
  const days = obj(P.days) || {};
  for (const k of Object.keys(days).slice(0, 400)) {
    const d = obj(days[k]);
    if (!DATE.test(k) || k > today || !d) continue;
    let any = false;
    const st = num(d.st, ...LIMITS.steps);
    if (st != null) { any = true; got.steps++; if (!S.manual.steps[k]) S.steps[k] = Math.round(st); }
    const sx = cleanSleepx(d.sl), tot = sx ? sx.d + sx.l + sx.r + (sx.nap || 0) : 0;
    if (sx && tot >= 30 && tot <= 1440) { any = true; got.sleep++; S.sleepx[k] = sx; if (!S.manual.sleep[k]) S.sleep[k] = Math.round(tot / 6) / 10; }
    const rh = num(d.rh ?? d.rp, ...LIMITS.rhr);
    if (rh != null) { any = true; got.rhr++; S.rhr[k] = Math.round(rh); }
    const w = num(d.wt, ...LIMITS.weights);
    if (w != null) { got.weight++; if (!S.manual.weights[k]) S.weights[k] = r1(w); }
    const x = cleanWx(Object.assign({}, d, { rp: d.rh == null && d.rp != null }));
    if (x) S.wx[k] = x;
    if (any) { got.days++; if (k > last) last = k; }
  }
  // Workouts: the synced range is replaced as a whole, so a workout deleted in Zepp disappears here too.
  if (Array.isArray(P.ex) && DATE.test(P.from)) {
    const by = {};
    for (const e of P.ex.slice(0, 600)) { const c = cleanEx(e); if (c) (by[dk(new Date(c.s))] ||= []).push(c); }
    for (let k = P.from; k <= today; k = shift(k, 1)) { if (by[k]) { S.ex[k] = by[k].slice(0, 20); got.workouts += by[k].length; } else delete S.ex[k]; }
  }
  if (Array.isArray(P.win)) for (const w of P.win.slice(0, 200)) {
    const s = num(w?.s, 1e12, 1e13), a = num(w?.a, 30, 230), n = num(w?.n, 1, 1e6);
    if (s != null && a != null && n != null) { S.pairs[String(Math.round(s))] = { a: r1(a), n }; got.pairs++; }
  }
  S.meta.watch = last || null;
  return got;
}

// ---------- files, sharing and backup ----------
function saveText(name, text, mime = 'application/json') {
  if (NATIVE) return nat('saveFile', name, mime, text);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
NEV['file-saved'] = r => toast(r?.ok ? `Saved ${r.name || ''}`.trim() : r?.msg || 'Not saved');
function shareText(title, text) {
  if (NATIVE) return nat('share', title, text);
  if (navigator.share) return navigator.share({ title, text }).catch(() => {});
  navigator.clipboard?.writeText(text).then(() => toast('Copied to clipboard'), () => toast('Could not copy'));
}
// The app writes a copy of everything to a folder you choose, once a day. It survives uninstalling the app.
const BACKUP = { folder: null };
function backupInfo() { if (NATIVE) BACKUP.folder = parse(nat('backupStatus'))?.folder || null; }
function autoBackup(force) {
  if (!NATIVE || !BACKUP.folder || (!force && S.meta.backup === todayKey())) return;
  nat('backupWrite', JSON.stringify(S), !!force);
}
NEV.backup = r => {
  if (r?.folder !== undefined) BACKUP.folder = r.folder;
  if (r?.written) { S.meta.backup = todayKey(); save(); if (r.manual) toast('Backed up'); }
  if (r?.msg) toast(r.msg);
  if (r?.picked) { S.meta.welcomed = true; save(); autoBackup(true); }
  renderSoft();
};

// ---------- moving data from Chrome into the app ----------
function b64url(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(bin, c => c.charCodeAt(0)); }
async function moveToApp() {
  try {
    const gz = await new Response(new Blob([JSON.stringify(S)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const d = b64url(gz);
    if (d.length > 450000) return toast('Too much to hand over in one step. Export here, then Import inside the app.', 5000);
    location.href = `intent://import?d=${d}#Intent;scheme=app.health;package=app.health.personal;S.browser_fallback_url=${encodeURIComponent(APK)};end`;
  } catch (e) { toast('This browser cannot hand over data. Export here, then Import inside the app.', 5000); }
}
// The app received data handed over from Chrome. Nothing is replaced until you confirm.
NEV.import = async r => {
  try {
    const raw = await new Response(new Blob([unb64url(r.d)]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const data = JSON.parse(raw);
    if (!obj(data) || !data.profile) throw new Error('bad');
    pending = { type: 'import', data: sanitize(data), from: 'Chrome' };
    render();
  } catch (e) { toast('The handed-over data could not be read. Use Export and Import instead.', 5000); }
};
function importSummary(D) {
  const n = o => Object.keys(o).length;
  return `${plural(n(D.food), 'day')} of food, ${plural(n(D.weights), 'weigh-in')}, ${plural(n(D.lifts), 'lifting session')}, ${plural(n(D.hrv), 'morning check')}`;
}

// Data from the original Health Sync app in Chrome: {v:1, d:{date:[steps, deep, light, rem, awake, onset, restingHr]}}.
function hcReceive(b64) {
  try {
    if (b64.length > 200000) throw new Error('too large');
    const data = JSON.parse(new TextDecoder().decode(unb64url(b64)));
    if (!obj(data) || !obj(data.d)) throw new Error('bad shape');
    const days = {};
    for (const [k, a] of Object.entries(data.d)) if (Array.isArray(a)) days[k] = { st: a[0], sl: { d: a[1], l: a[2], r: a[3], w: a[4], on: a[5] }, rp: a[6] };
    watchPreview = [{ name: 'Health Connect', kind: 'health connect', P: { days }, counts: countDays(days) }];
  } catch (e) { watchPreview = null; toast('The sync data could not be read'); }
}
function countDays(days) {
  const c = { steps: 0, sleep: 0, hr: 0 };
  for (const d of Object.values(days)) { if (d.st != null) c.steps++; if (d.sl) c.sleep++; if (d.rp != null || d.rh != null) c.hr++; }
  return c;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('native.js');
