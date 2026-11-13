// Network first for the app itself, so updates show up immediately; the cache is the offline fallback.
// Exercise demos never change, so they come from the cache once seen. The Android app bundles every file and
// does not use this worker.
const CACHE = 'health-v6', MEDIA = 'health-media-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'lib.js', 'data.js', 'exercises.js', 'body-data.js', 'store.js', 'model.js', 'train.js', 'native.js',
  'feel.js', 'ui.js', 'h9.js', 'watch.js', 'view-today.js', 'view-train.js', 'view-recovery.js', 'view-review.js', 'view-me.js', 'app.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
    fetch(e.request)
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
