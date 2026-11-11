// Sylvanus Spielleiter-Codex - Service Worker (PWA Offline Support)
const CACHE_NAME = 'sylvanus-codex-v22.0';

const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './icons/icon.svg'
];

// Pre-cache core shell during install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Clean up older caches during activate
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch interceptor with Cache-First strategy for assets & Stale-While-Revalidate for CDNs
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Ignore Supabase and backend sync API requests (handled by app sync layer)
    if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/')) {
        return;
    }

    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached asset immediately
                return cachedResponse;
            }

            // Otherwise fetch from network and dynamically cache
            return fetch(request).then((networkResponse) => {
                // Only cache successful or opaque (cross-origin CDN) responses
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch((err) => {
                console.warn('[SW] Fetch failed offline:', request.url, err);
                // If offline and requesting an HTML document, return index.html
                if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
