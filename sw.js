const CACHE_VERSION = 'development-v4';
const CACHE_PREFIX = 'fire-drill-2026:' + self.registration.scope + ':';
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const SHELL = [
  './', './index.html', './app.css', './app.js', './bank.js', './store.js',
  './banks/2026.json', './banks/template.csv', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './vendor/xlsx.full.min.js', './upstream/src/js/00-core.js',
  './upstream/src/js/20-types.js', './upstream/src/js/35-scoring.js'
];
const assets = new Set(SHELL.map(path => new URL(path, self.registration.scope).href));
const index = new URL('./index.html', self.registration.scope);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(SHELL.map(path => new Request(path, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const navigation = request.mode === 'navigate' && url.origin === index.origin &&
    (url.pathname === index.pathname || url.pathname === new URL('./', index).pathname);
  if (request.method !== 'GET' || (!navigation && !assets.has(request.url))) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const key = navigation ? index.href : request;
    return await cache.match(key) || fetch(request);
  }));
});
