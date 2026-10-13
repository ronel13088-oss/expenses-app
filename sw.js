const V = 'exp-2de1b657a438'; // auto-set by scripts/build-version.mjs (pre-commit)
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'js/app.js', 'js/core.js', 'js/db.js', 'js/backup.js', 'js/importers.js', 'vendor/xlsx.full.min.js', 'fonts/Heebo-VariableFont_wght.ttf', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/icon-180.png', 'icons/icon-32.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(ASSETS)))); // waits until user taps refresh
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => { if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request))); });
