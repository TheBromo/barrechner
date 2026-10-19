// Bumping the version drops caches written by earlier workers, which cached every same-origin GET.
const CACHE = "barrechner-shell-v2";
// On flaky event Wi-Fi, fall back to the cached calculator instead of waiting for a stalled request.
const NAVIGATION_TIMEOUT_MS = 3500;

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("barrechner-") && key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

/** Immutable build assets, icons and images are safe to serve from cache; nothing else is. */
function isCacheable(url, destination) {
  if (destination === "image") return true;
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith("/_next/static/") || /^\/(?:icon-\d+\.png|apple-icon\.png|icon\.png)$/.test(url.pathname);
}

async function putIfOk(cache, key, response) {
  if (response.ok || response.type === "opaque") await cache.put(key, response);
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_PAGE" || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(event.data.urls.map(async (value) => {
      try {
        const url = new URL(value, self.location.origin);
        const isShell = url.origin === self.location.origin && url.pathname === "/" && !url.search;
        if (!isShell && !isCacheable(url, /\.(?:png|jpe?g|webp|gif|svg)$/i.test(url.pathname) ? "image" : "")) return;
        const response = await fetch(url, { cache: "reload", mode: url.origin === self.location.origin ? "same-origin" : "no-cors" });
        await putIfOk(cache, isShell ? "/" : url.href, response);
      } catch { /* A single optional asset must not prevent offline setup. */ }
    }));
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    if (url.pathname !== "/") return;
    event.respondWith((async () => {
      const network = fetch(event.request).then(async (response) => {
        if (response.ok && !response.redirected) await (await caches.open(CACHE)).put("/", response.clone());
        return response;
      });
      const cached = await caches.match("/");
      if (!cached) return network;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NAVIGATION_TIMEOUT_MS));
      return Promise.race([network.catch(() => cached), timeout]);
    })());
    return;
  }
  if (!isCacheable(url, event.request.destination)) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok || response.type === "opaque") {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
    }
    return response;
  })());
});
