const APP_VERSION = "2026.05.16.2";
const CACHE_NAME = `aaruni-tech-${APP_VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/track-order.html",
  "/about-us.html",
  "/contact-us.html",
  "/privacy-policy.html",
  "/refund-policy.html",
  "/shipping-policy.html",
  "/terms-and-conditions.html",
  "/styles.css",
  "/script.js",
  "/order.js",
  "/email.js",
  "/whatsapp.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/version.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("aaruni-tech-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

function networkFirst(request) {
  return caches.open(CACHE_NAME).then((cache) => (
    fetch(request)
      .then((response) => {
        cache.put(request, response.clone());
        return response;
      })
      .catch(() => cache.match(request).then((cachedResponse) => cachedResponse || cache.match("/index.html")))
  ));
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) => (
    cache.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          cache.put(request, response.clone());
          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    })
  ));
}
