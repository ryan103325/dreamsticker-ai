/**
 * DreamSticker AI Service Worker — offline app shell + asset cache.
 *
 * Strategy (Roadmap §3 "Service Worker / PWA 完成"):
 * - Navigations: network-first so new deploys show up immediately, falling
 *   back to the cached shell when offline ("加入主畫面" still opens the app).
 * - Same-origin static assets (hashed js/css/wasm, fonts, images):
 *   cache-first — Vite hashes filenames, so a cached asset is immutable.
 * - Cross-origin requests (Gemini/OpenAI/HF APIs, Google Fonts CSS) are
 *   never intercepted: generation is meaningless offline and API responses
 *   must never be cached.
 */

const CACHE = 'dreamsticker-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './logo.png', './favicon.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // never touch API calls

    // vendor/ holds opencv.js (10.8MB). Tee-ing a body that large for
    // cache.put can stall the original stream (backpressure) and the script
    // never finishes loading — let the browser fetch it directly and rely on
    // normal HTTP caching instead.
    if (url.pathname.includes('/vendor/')) return;

    // opencv-worker.js has a STABLE filename: cache-first here once pinned a
    // user to an outdated slicing engine across deploys. Its URL now carries
    // a per-build ?v= query, but bypass it entirely as belt-and-braces.
    if (url.pathname.endsWith('/opencv-worker.js')) return;

    // App navigations: network-first, offline fallback to the cached shell.
    // cache:'no-cache' forces conditional revalidation past the HTTP cache —
    // GitHub Pages serves index.html with max-age=600, which otherwise keeps
    // users on a stale build for up to 10 minutes after every deploy (a 304
    // when unchanged, so the cost is one cheap roundtrip). Fetch by URL:
    // passing init alongside a mode:'navigate' Request throws.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request.url, { cache: 'no-cache' })
                .then((res) => {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
                    return res;
                })
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    // Static assets: cache-first (Vite content-hashes filenames)
    event.respondWith(
        caches.match(request).then((hit) =>
            hit || fetch(request).then((res) => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return res;
            })
        )
    );
});
