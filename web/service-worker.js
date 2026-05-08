const CACHE_NAME = 'plotfoam-v3';
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
    // Skip waiting so the new SW activates immediately
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', event => {
    // For navigation requests (HTML pages), use network-first so we never
    // serve a stale index.html from cache.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            // Return cached version or fetch from network
            return response || fetch(event.request).then(fetchRes => {
                return caches.open(CACHE_NAME).then(cache => {
                    // Cache new resources dynamically if it's from our origin or CDNs
                    if (event.request.url.startsWith('http')) {
                        cache.put(event.request.url, fetchRes.clone());
                    }
                    return fetchRes;
                });
            });
        }).catch(() => {
            // Fallback if offline
        })
    );
});

self.addEventListener('activate', event => {
    // Claim all clients immediately so the new SW takes over right away
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
        }).then(() => self.clients.claim())
    );
});
