const CACHE = "barrechner-shell-v1";
self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("barrechner-") && key !== CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_PAGE" || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(event.data.urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok || response.type === "opaque") await cache.put(url, response);
      } catch { /* A single optional asset must not prevent offline setup. */ }
    }));
  })());
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) (await caches.open(CACHE)).put("/", response.clone());
        return response;
      } catch {
        return (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }
  if (url.origin === self.location.origin || event.request.destination === "image") {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok || response.type === "opaque") (await caches.open(CACHE)).put(event.request, response.clone());
      return response;
    })());
  }
});
