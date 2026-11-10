/* Service worker: caches the app shell only.
 * It never touches POST requests, and never caches or replays anything sent to n8n.
 * A receipt is an inventory transaction and must not be queued or repeated offline. */

const VERSION = "gr-v2";
const QR_LIB = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
const SHELL = [
  "./", "./index.html", "./styles.css", "./config.js", "./manifest.webmanifest",
  "./js/main.js", "./js/api.js", "./js/state.js", "./js/nav.js", "./js/ui.js",
  "./js/history.js", "./js/image.js", "./js/scanner.js",
  "./js/screens/login.js", "./js/screens/home.js", "./js/screens/capture.js",
  "./js/screens/review.js", "./js/screens/lines.js", "./js/screens/final.js", "./js/screens/result.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    try { await cache.add(new Request(QR_LIB, { mode: "cors" })); } catch (_) { /* cached on first online use */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(req)) || (await cache.match("./index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await fresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POSTs always go straight to the network
  const url = new URL(req.url);
  if (url.pathname.includes("/webhook")) return;

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || url.pathname.endsWith("/config.js")) {
      event.respondWith(networkFirst(req));
    } else {
      event.respondWith(staleWhileRevalidate(req));
    }
  } else if (url.href === QR_LIB) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    })));
  }
});
