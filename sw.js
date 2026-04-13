const SHELL_CACHE_NAME = "bozisoda-shell-v20260413-6";
const RUNTIME_CACHE_NAME = "bozisoda-runtime-v20260413-6";
const APP_SHELL_URLS = [
    "./",
    "./index.html",
    "./home.css?v=20260413-4",
    "./home.js?v=20260413-2",
    "./bus.html",
    "./style.css?v=20260413-4",
    "./script.js?v=20260401-1605",
    "./stable-overrides.js?v=20260401-1605",
    "./manifest.json",
    "./bus-manifest.json",
    "./pwa-register.js?v=20260413-1"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(SHELL_CACHE_NAME)
            .then((cache) => cache.addAll(APP_SHELL_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames.map((cacheName) => {
                    const isCurrentCache =
                        cacheName === SHELL_CACHE_NAME || cacheName === RUNTIME_CACHE_NAME;
                    return isCurrentCache ? Promise.resolve() : caches.delete(cacheName);
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    if (/\.(?:css|js|json|html)$/.test(requestUrl.pathname)) {
        event.respondWith(handleStaticAssetRequest(request));
    }
});

async function handleNavigationRequest(request) {
    const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);

    try {
        const response = await fetch(request);
        runtimeCache.put(request, response.clone());
        return response;
    } catch (error) {
        const cachedResponse =
            (await runtimeCache.match(request, { ignoreSearch: true })) ||
            (await caches.match(request, { ignoreSearch: true }));
        if (cachedResponse) {
            return cachedResponse;
        }

        const fallbackPath = new URL(request.url).pathname.includes("bus.html")
            ? "./bus.html"
            : "./index.html";
        return caches.match(fallbackPath, { ignoreSearch: true });
    }
}

async function handleStaticAssetRequest(request) {
    const cachedResponse =
        (await caches.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    const fetchPromise = fetch(request)
        .then(async (response) => {
            if (response.ok) {
                const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
                runtimeCache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    return cachedResponse || fetchPromise || Response.error();
}
