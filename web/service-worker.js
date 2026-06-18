const CACHE_NAME = 'plotfoam-v6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './icon.svg',
    './manifest.json',
    'https://cdn.plot.ly/plotly-2.35.2.min.js',
    'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Same-origin requests (our HTML, JS, CSS): network-first.
    // This ensures users always get the latest code and never get
    // stuck on a stale cached app.js that lacks new features/fixes.
    // The cache is only used as an offline fallback.
    if (url.origin === self.location.origin) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Update the cache with the fresh response for offline use
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Third-party CDN resources (Plotly, fonts): cache-first.
    // These are versioned URLs that rarely change, so serving from
    // cache is safe and makes the app load faster.
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchRes => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, fetchRes.clone());
                    return fetchRes;
                });
            });
        }).catch(() => {
            // Offline and not cached — nothing we can do
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
        }).then(() => self.clients.claim())
    );
});
