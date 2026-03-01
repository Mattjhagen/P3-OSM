/* eslint-disable no-restricted-globals */

const CACHE_NAME = 'p3-admin-pwa-v2';
const CORE_ASSETS = ['/logo.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key)))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-first for HTML and hashed assets - prevents 404 hang after deploys.
  // Old cached index.html can reference stale asset hashes (e.g. index-BKnzbNPH.js)
  // that no longer exist after a new build.
  const isHtml = event.request.destination === 'document' || requestUrl.pathname === '/' || requestUrl.pathname.endsWith('.html');
  const isAsset = requestUrl.pathname.startsWith('/assets/');

  if (isHtml || isAsset) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for static assets (logo, manifest) that don't change per deploy
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = payload.title || 'P3 Support';
  const options = {
    body: payload.body || 'New customer support message.',
    icon: '/logo.svg',
    badge: '/logo.svg',
    data: {
      url: payload.url || '/?tab=OPERATIONS',
      threadId: payload.threadId || '',
      messageId: payload.messageId || '',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/?tab=OPERATIONS';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
