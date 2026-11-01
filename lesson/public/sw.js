const BASE = new URL("./", self.location.href);
const CACHE_PREFIX = `coaching-author:${BASE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const INDEX = new URL("index.html", BASE).href;
const APP_SHELL = [BASE.href, INDEX, new URL("manifest.webmanifest",BASE).href];

async function addResources(cache, urls) {
  const results = await Promise.allSettled(urls.map((url) => cache.add(url)));
  return results.length > 0 && results.every((result) => result.status === "fulfilled");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => addResources(cache, APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_URLS" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => {
    try {
      const candidate=new URL(url,self.location.origin);
      return candidate.origin===self.location.origin && candidate.pathname.startsWith(BASE.pathname);
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => addResources(cache, urls))
      .then((ready) => event.ports[0]?.postMessage({ ready }))
      .catch(() => event.ports[0]?.postMessage({ ready: false })),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE.pathname)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && response.headers.get("content-type")?.includes("text/html")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(INDEX, copy));
          }
          return response;
        })
        .catch(() => caches.open(CACHE_NAME).then(cache => cache.match(INDEX))),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then((cached) => cached ?? fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    })),
  );
});
