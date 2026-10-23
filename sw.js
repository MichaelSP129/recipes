/* Service worker: cache-first app shell, network-first recipes.json.
   Bump VERSION whenever app.js / app.css / index.html / icons change. */
var VERSION = "v14";
var CACHE = "recipes-" + VERSION;
var SHELL = ["./", "index.html", "app.js", "app.css", "manifest.webmanifest", "recipes.json",
  "apple-touch-icon.png", "favicon.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("recipes-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/recipes.json")) {
    // network-first so new recipes appear as soon as you're online; cached copy when offline
    e.respondWith(fetch(req, { cache: "no-cache" }).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put("recipes.json", copy); }); }
      return res;
    }).catch(function () { return caches.match("recipes.json"); }));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then(function (hit) {
      return hit || fetch(req);
    }).catch(function () { return fetch(req); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
  }));
});
