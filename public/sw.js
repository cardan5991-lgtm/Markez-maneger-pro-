const CACHE_NAME = 'markez-pro-v35';

const ASSETS_TO_CACHE = [
  '/',
  '/?source=pwa',
  '/index.html',
  '/manifest.json',
  '/icon-192-v6.png',
  '/icon-512-v6.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  if (url.hostname.includes('firestore') || url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// Firebase scripts loaded only if needed to avoid blocking PWA scan
try {
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

  const firebaseConfig = {
    projectId: "gen-lang-client-0273028698",
    appId: "1:653980593713:web:24287930b9990208376f10",
    apiKey: "AIzaSyCfHV5sYYzfatZ9LzhKFhP66P1HeyIc-dE",
    authDomain: "gen-lang-client-0273028698.firebaseapp.com",
    storageBucket: "gen-lang-client-0273028698.firebasestorage.app",
    messagingSenderId: "653980593713",
    measurementId: ""
  };

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notificationTitle = payload.notification?.title || 'Nueva notificación';
    const notificationOptions = {
      body: payload.notification?.body || 'Tienes un nuevo mensaje.',
      icon: '/icon-192-v6.png',
      badge: '/icon-192-v6.png',
      data: payload.data
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} catch (e) {
  console.log('Firebase messaging not supported in this environment');
}
