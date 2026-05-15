const CACHE_NAME = "markez-cache-v15";

// Default PWABuilder Service Worker functionality
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

if (workbox) {
  console.log('Workbox is loaded');
  
  // Cache page navigations (html) with a Network First strategy
  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: 'pages',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200]
        })
      ]
    })
  );

  // Cache CSS, JS, and Web Worker requests with a Stale While Revalidate strategy
  workbox.routing.registerRoute(
    ({ request }) =>
      request.destination === 'style' ||
      request.destination === 'script' ||
      request.destination === 'worker',
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'assets',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200]
        })
      ]
    })
  );

  // Cache images with a Cache First strategy
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'images',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [200]
        }),
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 30 // 30 Days
        })
      ]
    })
  );

  self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
      self.skipWaiting();
    }
  });
} else {
  console.log('Workbox could not be loaded. No offline support.');
}
