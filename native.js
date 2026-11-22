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
const SYNC = { busy: false, err: '', status: null, got: null, at: 0, zepp: 0, timer: null };
// How long Health Connect may take before the read counts as failed: a read that never answers must not leave the
// app saying "Syncing…" forever and refusing every later sync.
const SYNC_WAIT = 45000;
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
  Object.assign(SYNC, { busy: true, err: '', at: Date.now() });
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(() => { if (SYNC.busy) { SYNC.busy = false; SYNC.err = 'Health Connect did not answer. Pull down to try again.'; renderSoft(); } }, SYNC_WAIT);
  nat('hcRead', JSON.stringify({ days, windows }));
  paintSync();
}
// Reading the last few days costs well under a second, so the app reads again whenever it comes back to the front
// after two minutes, and every five minutes while it stays open on screen. The watch's app (Zepp or Gadgetbridge)
// only passes data to Health Connect when it syncs with the watch, so after "Open Zepp" the next return reads at once,
// and again a little later, because the watch app writes to Health Connect a few seconds after its own sync.
function autoSync(force) {
  if (!NATIVE || !SYNC.status?.granted?.length) return;
  if (force || !S.meta.sync || Date.now() - S.meta.sync > 2 * 6e4) syncNow();
}
// The watch's own app: the one that last passed data to Health Connect, else whichever is on this phone.
function watchApp() {
  const w = S.meta.fresh?.watch;
  if (w === 'Gadgetbridge' || w === 'Zepp') return w;
  return APP?.gb && !APP?.zepp ? 'Gadgetbridge' : 'Zepp';
}
const watchAppHere = () => !!(watchApp() === 'Gadgetbridge' ? APP?.gb : APP?.zepp);
function openZepp() { SYNC.zepp = Date.now(); nat(watchApp() === 'Gadgetbridge' ? 'openGadgetbridge' : 'openZepp'); }
function zeppBack() {
  if (!SYNC.zepp || Date.now() - SYNC.zepp > 30 * 6e4) return false;
  SYNC.zepp = 0;
  autoSync(true);
  setTimeout(() => { if (!document.hidden) autoSync(true); }, 25000);
  return true;
}
if (NATIVE) setInterval(() => { if (!document.hidden && !SYNC.busy && S.meta.sync && Date.now() - S.meta.sync > 5 * 6e4) syncNow(3); }, 30000);
NEV['hc-status'] = st => { SYNC.status = st; autoSync(); renderSoft(); };
NEV['hc-data'] = P => {
  SYNC.busy = false; clearTimeout(SYNC.timer);
  if (!P || P.error) SYNC.err = P?.error || 'Health Connect did not answer.';
  else {
    SYNC.got = mergeSync(P); S.meta.sync = Date.now();
    // Kept with the data, so the app can always say how old the newest watch data is, not just when it last asked.
    const f = cleanFresh(Object.assign({}, obj(P.fresh) || {}, { read: num(P.read, 1e12, 1e13) || Date.now(), err: Array.isArray(P.errors) ? P.errors : [] }));
    if (f) S.meta.fresh = f;
    save();
  }
  renderSoft();
};
NEV.resume = () => { rollDay(); strapAuto(); if (!zeppBack()) autoSync(); autoBackup(); ogAuto(); renderSoft(); };
NEV.pause = () => { remindPlan(); flushMirror(); };
// ---------- how fresh the watch data really is ----------
// The newest moment any record from the watch app was written into Health Connect. That, not when this app last
// read, says whether the watch's data has come through yet.
function watchWrote() {
  const F = S.meta.fresh;
  if (!F) return null;
  let best = null;
  for (const [k, x] of Object.entries(F.k)) if (x.w && (!F.watch || x.src === F.watch) && (!best || x.w > best.w)) best = { k, ...x };
  return best;
}
// Plain words for the freshness of each stream: "steps up to 14:05", "last night", "heart rate up to 13:58".
function freshParts() {
  const F = S.meta.fresh;
  if (!F) return [];
  const t = ms => { const d = new Date(ms), k = dk(d), h = hm(d.getHours() * 60 + d.getMinutes()); return k === todayKey() ? h : `${dateLabel(k)} ${h}`; };
  const out = [];
  if (F.k.steps?.e) out.push(`steps to ${t(F.k.steps.e)}`);
  if (F.k.heart?.e) out.push(`heart rate to ${t(F.k.heart.e)}`);
  if (F.k.sleep?.e) { const k = dk(new Date(F.k.sleep.e)); out.push(k === todayKey() ? 'last night in' : `sleep to ${dateLabel(k)}`); }
  return out;
}
// The watch app has passed nothing new for a while, during waking hours: worth saying, with the way to fix it.
function watchLagging() {
  const W = watchWrote(), h = new Date().getHours();
  return !!W && h >= 8 && h < 23 && Date.now() - W.w > 3 * 36e5;
}
// Update the sync line in place, so a sync never steals focus from a field being typed in.
function paintSync() { const el = $('#syncline'); if (el) el.outerHTML = syncLine(); }

// One merge for every outside source: Health Connect, a Zepp export, or the old sync app.
// Days you typed by hand are never overwritten; clearing your entry hands the day back to the watch.
function mergeSync(P) {
  const today = todayKey(), got = { days: 0, steps: 0, sleep: 0, rhr: 0, weight: 0, workouts: 0, pairs: 0 };
  let last = S.meta.watch || '';
  const days = obj(P.days) || {}, G = S.gone, no = (s, k) => !!G[s]?.[k];
  for (const k of Object.keys(days).slice(0, 400)) {
    const d = obj(days[k]);
    if (!DATE.test(k) || k > today || !d) continue;
    let any = false;
    const st = num(d.st, ...LIMITS.steps);
    if (st != null) { any = true; got.steps++; if (!S.manual.steps[k] && !no('steps', k)) S.steps[k] = Math.round(st); }
    const sx = cleanSleepx(d.sl), tot = sx ? sx.d + sx.l + sx.r + (sx.nap || 0) : 0;
    if (sx && tot >= 30 && tot <= 1440) { any = true; got.sleep++; if (!no('sleepx', k)) S.sleepx[k] = sx; if (!S.manual.sleep[k] && !no('sleep', k)) S.sleep[k] = Math.round(tot / 6) / 10; }
    const rh = num(d.rh ?? d.rp, ...LIMITS.rhr);
    if (rh != null) { any = true; got.rhr++; if (!no('rhr', k)) S.rhr[k] = Math.round(rh); }
    const w = num(d.wt, ...LIMITS.weights);
    if (w != null) { got.weight++; if (!S.manual.weights[k] && !no('weights', k)) S.weights[k] = r1(w); }
    // Minutes worn, from the day's 5-minute heart rate, kept after the curve itself is let go at 45 days.
    const wm = d.wm ?? (Array.isArray(d.hd) && d.hd.length === 288 ? wornMin(d.hd.map(v => num(v, 25, 230) || 0)) : null);
    const x = cleanWx(Object.assign({}, d, { rp: d.rh == null && d.rp != null, wm }));
    if (x && !no('wx', k)) S.wx[k] = x;
    // The day's heart rate in 5-minute steps, for the 24-hour curve.
    if (Array.isArray(d.hd) && d.hd.length === 288 && !no('hrd', k)) { const h = d.hd.map(v => Math.round(num(v, 25, 230) || 0)); if (h.filter(Boolean).length >= 12) S.hrd[k] = h; }
    if (any) { got.days++; if (k > last) last = k; }
  }
  // Workouts: the synced range is replaced as a whole, so a workout deleted in Zepp disappears here too.
  if (Array.isArray(P.ex) && DATE.test(P.from)) {
    const by = {};
    for (const e of P.ex.slice(0, 600)) { const c = cleanEx(e); if (c && !no('ex', String(c.s))) (by[dk(new Date(c.s))] ||= []).push(c); }
    for (let k = P.from; k <= today; k = shift(k, 1)) { if (by[k]) { S.ex[k] = by[k].slice(0, 20); got.workouts += by[k].length; } else delete S.ex[k]; }
  }
  if (Array.isArray(P.win)) for (const w of P.win.slice(0, 200)) {
    const s = num(w?.s, 1e12, 1e13), a = num(w?.a, 30, 230), n = num(w?.n, 1, 1e6);
    if (s != null && a != null && n != null) { S.pairs[String(Math.round(s))] = { a: r1(a), n }; got.pairs++; }
  }
  S.meta.watch = last || null;
  // Only the last 45 days of 24-hour curves are kept: they are for looking at days, not for long trends.
  for (const k of Object.keys(S.hrd)) if (gapDays(k, today) > 45) delete S.hrd[k];
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

// ---------- pull to refresh: everything that can be fetched, at once ----------
// Health Connect, openGym's folder and the daily backup, then one line saying what actually came in.
const REFRESH = { on: false, t: 0, before: null };
function dataCounts() {
  const n = o => Object.keys(o).length;
  return { nights: n(S.sleep), steps: n(S.steps), hr: n(S.rhr), workouts: Object.values(S.ex).reduce((a, x) => a + x.length, 0), lifts: n(S.lifts), weights: n(S.weights) };
}
function refreshLine(a, b) {
  const d = k => b[k] - a[k];
  const parts = [d('nights') > 0 && plural(d('nights'), 'night'), d('steps') > 0 && plural(d('steps'), 'day') + ' of steps', d('workouts') > 0 && plural(d('workouts'), 'workout'),
    d('lifts') > 0 && plural(d('lifts'), 'lifting session'), d('weights') > 0 && plural(d('weights'), 'weigh-in')].filter(Boolean);
  if (SYNC.err) return SYNC.err;
  return parts.length ? `New: ${parts.join(', ')}` : NATIVE ? `Up to date${S.meta.sync ? ` · synced ${ago(S.meta.sync)}` : ''}` : 'Up to date. In Chrome, everything here is already on this phone.';
}
function refreshAll() {
  if (REFRESH.on) return;
  Object.assign(REFRESH, { on: true, t: Date.now(), before: dataCounts() });
  rollDay();
  ptrSpin(true);
  if (NATIVE) {
    SYNC.err = '';
    if (SYNC.status?.granted?.length) syncNow(); else hcCheck();
    ogAuto(true); autoBackup();
  }
  const finish = () => {
    if (NATIVE && (SYNC.busy || OGF.busy) && Date.now() - REFRESH.t < 15000) return setTimeout(finish, 250);
    REFRESH.on = false; ptrSpin(false); render();
    const line = refreshLine(REFRESH.before, dataCounts());
    buzz(SYNC.err ? 'warn' : 'ok'); toast(line, 3200);
  };
  setTimeout(finish, 650);
}

// ---------- reminders on the phone ----------
// The app works out what is due over the next week and hands the phone a list of notifications; each time it is
// opened or left, the list is worked out again, so a check already done today is not reminded about.
function remindItems() {
  const s = S.settings, out = [], now = Date.now(), at = (k, t) => Date.parse(`${k}T${t}`);
  const strap = S.meta.h9 || Object.keys(S.hrv).length;
  for (const k of range(8, shift(todayKey(), 7))) {
    const today = k === todayKey();
    if (s.remAm !== 'off') {
      const hrv = strap && !(today && S.hrv[k]), wt = !(today && S.weights[k] != null);
      if (hrv || wt) out.push({ id: 'am' + k, at: at(k, s.remAm), title: hrv ? 'Morning check' : 'Weigh in',
        text: hrv ? `Before getting up: wet the H9, two minutes lying still.${wt ? ' Then weigh in.' : ''}` : 'After the toilet, before food or water.', hash: hrv ? 'recovery' : 'today' });
    }
    if (s.remWk !== 'off' && new Date(k + 'T12:00').getDay() === +s.remWk) {
      const last = Object.keys(S.waist).sort().pop();
      if (!last || gapDays(last, k) >= 6) out.push({ id: 'wk' + k, at: at(k, s.remAm !== 'off' ? s.remAm : '08:00') + 15 * 6e4, title: 'Waist, once a week', text: 'Midway between the lowest rib and the hip bone, after breathing out.', hash: 'today' });
    }
    if (s.remPm !== 'off' && !(today && mainMeals(k) >= 3)) {
      const t = today ? totals(k) : null;
      out.push({ id: 'pm' + k, at: at(k, s.remPm), title: 'Food log', text: t && t.n ? `${fmt(t.k)} kcal and ${Math.round(t.p)} g protein logged today. Anything missing?` : 'Log today’s meals while you remember them: whole days are what the burn estimate learns from.', hash: 'today' });
    }
  }
  return out.filter(x => x.at > now + 6e4).slice(0, 24);
}
function remindPlan() { if (NATIVE && typeof NATIVE.remind === 'function') nat('remind', JSON.stringify(remindItems())); }
function remindOn() { return ['remAm', 'remWk', 'remPm'].some(k => S.settings[k] !== 'off'); }
const REMIND = { allowed: null };
function remindStatus() { if (NATIVE && typeof NATIVE.remindAllowed === 'function') REMIND.allowed = nat('remindAllowed') === true; }
NEV.remind = r => { REMIND.allowed = !!r?.allowed; if (!REMIND.allowed) toast('Notifications are off for Health in the phone’s settings', 5000); remindPlan(); renderSoft(); };
NEV.goto = r => { if (r?.hash && /^[a-z-]+$/.test(r.hash)) location.hash = r.hash; };

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

function countDays(days) {
  const c = { steps: 0, sleep: 0, hr: 0 };
  for (const d of Object.values(days)) { if (d.st != null) c.steps++; if (d.sl) c.sleep++; if (d.rp != null || d.rh != null) c.hr++; }
  return c;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('native.js');
