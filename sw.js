// Self-destructing service worker.
// Replaces any old cached sw.js — on activation, clears caches and unregisters itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  const clients = await self.clients.matchAll({ type: 'window' });
  await self.registration.unregister();
  clients.forEach(c => c.navigate(c.url));
});
