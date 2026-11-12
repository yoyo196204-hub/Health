// Network first, so updates show up immediately; the cache is the offline fallback.
// The Android app bundles these files itself and does not use this worker.
const CACHE = 'health-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'lib.js', 'data.js', 'store.js', 'model.js', 'native.js', 'ui.js', 'h9.js', 'watch.js',
  'view-today.js', 'view-train.js', 'view-recovery.js', 'view-review.js', 'view-me.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (!r.ok || new URL(e.request.url).origin !== location.origin || e.request.url.endsWith('.apk')) return r;
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
