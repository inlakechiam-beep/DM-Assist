// Sylvanus Spielleiter-Codex - Service Worker (PWA Offline Support)
const CACHE_NAME = 'sylvanus-codex-v23.0';

const STATIC_ASSETS = [
    './',
    './DM-assist_23.html',
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

    // 1. Network-First for HTML navigation / document requests (guarantees latest release when online)
    const isHtml = request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
    if (isHtml) {
        event.respondWith(
            fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return networkResponse;
            }).catch(() => {
                return caches.match(request).then((cached) => cached || caches.match('./DM-assist_23.html') || caches.match('./'));
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
