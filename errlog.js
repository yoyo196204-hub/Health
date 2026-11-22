'use strict';
// The error log: the last 50 things that went wrong on this phone, each with its message, where in the code
// (file:line), the screen that was open, when, and the app version. Kept in this phone's storage, apart from your
// data, and never sent anywhere; Me › Data checks shows it with a Copy button. Loaded right after lib.js so that an
// error while the other files load is caught too. The same error again straight after is counted, not repeated.

const ERRKEY = 'health.errors', ERRMAX = 50;
function errList() {
  try { const a = JSON.parse(localStorage.getItem(ERRKEY) || '[]'); return Array.isArray(a) ? a.filter(e => e && typeof e.m === 'string') : []; } catch (e) { return []; }
}
// file:line of the first frame from the app's own files ("view-today.js:120"), without the version stamp.
function errWhere(stack, file, line) {
  const own = f => String(f || '').split(/[?#]/)[0].split('/').pop();
  if (file && own(file)) return `${own(file)}${line ? ':' + line : ''}`;
  const m = String(stack || '').match(/([A-Za-z0-9_-]+\.(?:js|kt))(?:\?v=[a-z0-9]+)?:(\d+)/);
  return m ? `${m[1]}:${m[2]}` : '';
}
// The screen open now; during loading the app's state does not exist yet.
function errScreen() {
  try {
    const p = typeof pop !== 'undefined' && pop?.kind ? ` › ${pop.kind}` : '';
    return (overlay ? `${overlay.type}${overlay.key ? '-' + overlay.key : ''}` : tab) + p;
  } catch (e) { return 'loading'; }
}
function errVersion() {
  let v = '';
  try { if (typeof APP !== 'undefined' && APP?.version) v = APP.version + ' · '; } catch (e) { /* not native */ }
  try { v += typeof BUILD !== 'undefined' ? BUILD : (document.querySelector('script[src*="app.js"]')?.getAttribute('src') || '').split('v=')[1] || 'dev'; } catch (e) { v += 'dev'; }
  return v;
}
// err: an Error, an ErrorEvent-like {message, filename, lineno} or a string. Never throws.
function logError(err, o = {}) {
  try {
    const m = String(err?.message ?? err?.reason ?? err ?? 'Unknown error').slice(0, 300) || 'Unknown error';
    const at = o.at || errWhere(err?.stack, o.file, o.line), now = o.t || Date.now();
    const list = errList(), last = list[0];
    if (last && last.m === m && last.at === at && now - last.t < 60e3) { last.n = (last.n || 1) + 1; last.t = now; }
    else list.unshift({ m, at, s: o.s || errScreen(), t: now, v: o.v || errVersion() });
    localStorage.setItem(ERRKEY, JSON.stringify(list.slice(0, ERRMAX)));
  } catch (e) { /* storage full or blocked: nothing more can be done */ }
}
function errClear() { try { localStorage.removeItem(ERRKEY); } catch (e) { /* nothing */ } }
// Plain text for Copy: newest first, one error to a line.
function errText(list = errList()) {
  return list.map(e => `${new Date(e.t).toISOString()} | ${e.v} | ${e.s} | ${e.at || '?'} | ${e.m}${e.n > 1 ? ` (×${e.n})` : ''}`).join('\n');
}
if (typeof addEventListener === 'function') {
  addEventListener('error', e => {
    // A file that failed to load fires here too, with no message: name the file.
    if (!e.message && e.target?.src) return logError(`Could not load ${errWhere('', e.target.src)}`, { at: errWhere('', e.target.src) });
    logError(e.error?.message ? e.error : e.message, { file: e.filename, line: e.lineno });
  }, true);
  addEventListener('unhandledrejection', e => logError(e.reason?.message ? e.reason : `Unhandled: ${String(e.reason)}`));
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('errlog.js');
