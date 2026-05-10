// Service Worker para Markez Manager Pro
// Versión: 1.0.0

const CACHE_NAME = 'markez-v1';
const RUNTIME_CACHE = 'markez-runtime';
const IMAGE_CACHE = 'markez-images';

// Archivos que se deben cachear durante la instalación
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/extracted_icons/ios/192.png',
  '/extracted_icons/ios/512.png',
  '/src/main.tsx',
];

// Evento: Instalación del Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Cacheando archivos de precarga');
      return cache.addAll(PRECACHE_URLS).catch((error) => {
        console.warn('[Service Worker] Algunos archivos no se pudieron cachear:', error);
        // No fallar la instalación si algunos archivos no se pueden cachear
        return Promise.resolve();
      });
    })
  );
  
  self.skipWaiting();
});

// Evento: Activación del Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Eliminar cachés antiguas
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE && cacheName !== IMAGE_CACHE) {
            console.log('[Service Worker] Eliminando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
    })
  );
  
  self.clients.claim();
});

// Evento: Fetch (peticiones de red)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar peticiones no-GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorar peticiones a origen diferente
  if (url.origin !== location.origin) {
    return;
  }
  
  // Estrategia para imágenes: Cache first, network fallback
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            return response;
          }
          
          return fetch(request).then((response) => {
            // Cachear imágenes nuevas
            if (response && response.status === 200 && response.type !== 'error') {
              cache.put(request, response.clone());
            }
            return response;
          });
        });
      }).catch(() => {
        // Fallback offline para imágenes
        return new Response('Imagen no disponible offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
    );
    return;
  }
  
  // Estrategia para documentos HTML, CSS, JS: Network first, cache fallback
  if (request.destination === 'document' || 
      request.destination === 'style' || 
      request.destination === 'script') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Cachear respuestas exitosas
          const cache = request.destination === 'image' ? IMAGE_CACHE : RUNTIME_CACHE;
          caches.open(cache).then((cache) => {
            cache.put(request, response.clone());
          });
          
          return response;
        })
        .catch(() => {
          // Fallback a caché si la red falla
          return caches.match(request).then((response) => {
            if (response) {
              return response;
            }
            
            // Fallback final para documentos
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
            
            return new Response('Recurso no disponible offline', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
        })
    );
    return;
  }
  
  // Estrategia por defecto: Stale while revalidate
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) => {
      return cache.match(request).then((response) => {
        const fetchPromise = fetch(request).then((fetchResponse) => {
          if (fetchResponse && fetchResponse.status === 200) {
            cache.put(request, fetchResponse.clone());
          }
          return fetchResponse;
        });
        
        return response || fetchPromise;
      });
    }).catch(() => fetch(request))
  );
});

// Evento: Sincronización en background (Background Sync API)
self.addEventListener('sync', (event) => {
  console.log('[Service Worker] Evento de sincronización:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(
      // Aquí puedes implementar la lógica de sincronización
      Promise.resolve()
    );
  }
});

// Evento: Notificaciones push
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push recibido');
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Nuevo mensaje de Markez Manager Pro',
      icon: '/extracted_icons/ios/192.png',
      badge: '/extracted_icons/ios/192.png',
      data: data
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Markez Manager Pro', options)
    );
  }
});

// Evento: Click en notificación
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notificación clickeada');
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocarse en ella
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

console.log('[Service Worker] Cargado correctamente');