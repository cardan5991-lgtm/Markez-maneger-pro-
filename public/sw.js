self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("markez-cache").then(cache => {
      return cache.addAll([
        "/",
        "/index.html",
        "/icon-192-v2.png",
        "/icon-512-final.png"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
