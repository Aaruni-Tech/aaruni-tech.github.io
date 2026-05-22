const APP_VERSION = "2026.05.22.2";
const CACHE_NAME = `aaruni-tech-${APP_VERSION}`;

const APP_SHELL = [
  "/",
  "/index.html",
  "/track-order.html",
  "/my-orders.html",
  "/about-us.html",
  "/contact-us.html",
  "/privacy-policy.html",
  "/refund-policy.html",
  "/shipping-policy.html",
  "/terms-and-conditions.html",
  "/styles.css",
  "/aaruni-config.js",
  "/script.js",
  "/order.js",
  "/email.js",
  "/my-orders.js",
  "/emailjs-config.js",
  "/supabase-config.js",
  "/supabase-backend.js",
  "/whatsapp.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/version.json",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
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

  // Hard-block any accidental localhost image requests (stale scripts/extensions/etc.).
  // This prevents infinite `net::ERR_CONNECTION_REFUSED` spam from ports used by dev tools.
  if (url.hostname === "localhost" && (url.port === "7071" || url.port === "37857")) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6b7280" font-family="Arial" font-size="20">No Image</text></svg>`;
    event.respondWith(
      Promise.resolve(
        new Response(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "no-store",
          },
        })
      )
    );
    return;
  }

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
