// Sylvanus Spielleiter-Codex - Service Worker (PWA Offline Support)
const CACHE_NAME = 'sylvanus-codex-v23.2';

const STATIC_ASSETS = [
    './',
    './index.html',
    './DM-assist_23.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
    './icons/icon.svg'
];

// Pre-cache core shell during install (bypassing browser HTTP disk cache)
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Sofort aktiv werden, nicht im Hintergrund warten
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching static assets with cache: reload');
            const cachePromises = STATIC_ASSETS.map((url) => {
                return fetch(new Request(url, { cache: 'reload' }))
                    .then((response) => {
                        if (response.ok) return cache.put(url, response);
                    })
                    .catch((err) => console.warn('[SW] Pre-cache skip:', url, err));
            });
            return Promise.all(cachePromises);
        })
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

// Fetch interceptor: Network-First for HTML (always fresh), Cache-First for static assets
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Only handle GET requests
    if (request.method !== 'GET') return;

    // Ignore Supabase and backend sync API requests (handled by app sync layer)
    if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/')) {
        return;
    }

    // 1. Network-First für HTML-Seiten: Immer frische Version vom Server holen, Disk-Cache umgehen!
    const isHtml = request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
    if (isHtml) {
        event.respondWith(
            fetch(new Request(request.url, { cache: 'reload' })).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request).then((cached) => cached || caches.match('./DM-assist_23.html') || caches.match('./index.html') || caches.match('./'));
            })
        );
        return;
    }

    // 2. Cache-First with Network fallback for static assets (icons, fonts, scripts)
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            }).catch((err) => {
                console.warn('[SW] Asset fetch failed offline:', request.url, err);
            });
        })
    );
});
