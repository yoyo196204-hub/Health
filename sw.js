// Offline copy of the web app. The Android app bundles every file and does not use this worker.
// Every request for the app's own files asks GitHub for the current version first (a quick "has it changed?"
// check), so a stale file can never be mixed with a new one; the saved copy is used only when offline.
// STAMP is written by test/stamp.js and matches the ?v= on every file in index.html.
// Exercise demos never change, so they come from the saved copy once seen.
const STAMP = 'f6ccfc4fab';
const CACHE = 'health-' + STAMP, MEDIA = 'health-media-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'lib.js', 'data.js', 'exercises.js', 'body-data.js', 'store.js', 'model.js', 'train.js', 'native.js',
  'feel.js', 'ui.js', 'h9.js', 'watch.js', 'view-today.js', 'view-train.js', 'view-recovery.js', 'view-review.js', 'view-me.js', 'app.js',
  'manifest.webmanifest'].map(f => /\.(js|css|webmanifest)$/.test(f) ? `${f}?v=${STAMP}` : f).concat(['icon-192.png', 'icon-512.png']);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== MEDIA).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.endsWith('.apk')) return;
  if (url.pathname.includes('/media/')) {
    e.respondWith(caches.open(MEDIA).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request).then(hit => hit || caches.match(e.request, { ignoreSearch: true })))
  );
});
