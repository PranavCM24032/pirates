const CACHE_VERSION = 'pirates-v1.1.0';
const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_PATHS = [
    '',
    'index.html',
    'displaycrew.html',
    'login.html',
    'qr.html',
    'verification.html',
    'logical.html',
    'location.html',
    'celebration.html',
    'admin.html',
    'meme.html',
    'timer.html',
    'style.css',
    'global.js',
    'sound.js',
    'crew.json',
    'meme.json',
    'logical.json',
    'graph.json',
    'images/logo.png',
    'images/loading.jpeg',
    'images/display.jpeg',
    'images/login.jpeg',
    'images/qr.jpeg',
    'images/door.jpeg',
    'images/location.jpg',
    'images/celebration.jpeg'
];

function resolveScopeUrl(path) {
    return new URL(path, self.registration.scope).toString();
}

function isStaticAsset(urlObj) {
    return /\.(?:css|js|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4)$/i.test(urlObj.pathname);
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CORE_CACHE);
        await cache.addAll(PRECACHE_PATHS.map(resolveScopeUrl));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k !== CORE_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

async function networkFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
    } catch (e) {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw e;
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);

    return cached || networkPromise || fetch(request);
}

async function cacheFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const urlObj = new URL(request.url);
    if (urlObj.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    if (/\.(?:html|css|js|json)$/i.test(urlObj.pathname)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    if (isStaticAsset(urlObj)) {
        event.respondWith(cacheFirst(request));
    }
});
