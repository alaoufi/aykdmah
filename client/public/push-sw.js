// Web Push handlers, loaded into the generated service worker (workbox importScripts).
// An incoming call shows a persistent, vibrating notification even when the site is
// closed; tapping it opens the conversation, where the call screen offers "Answer".
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = {}; }
  event.waitUntil((async () => {
    const tag = typeof data.tag === 'string' ? data.tag : 'ayk';
    if (data.kind === 'call_end') {
      const shown = await self.registration.getNotifications({ tag });
      shown.forEach(n => n.close());
      return;
    }
    // An open, visible tab already rings with the in-app call screen.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (data.kind === 'call' && windows.some(w => w.visibilityState === 'visible')) return;
    const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
    // A message for the conversation already open on screen needs no notification.
    if (data.kind === 'message' && windows.some(w => w.visibilityState === 'visible' && new URL(w.url).pathname === url)) return;
    await self.registration.showNotification(String(data.title || 'أي خدمة'), {
      body: String(data.body || ''),
      tag,
      renotify: true,
      requireInteraction: data.kind === 'call',
      vibrate: data.kind === 'call' ? [800, 400, 800, 400, 800, 400, 800, 400, 800] : [200],
      icon: '/icons/android-chrome-192x192.png',
      badge: '/icons/android-chrome-192x192.png',
      data: { url },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = windows.find(w => new URL(w.url).origin === self.location.origin);
    if (same) {
      await same.focus();
      if ('navigate' in same) await same.navigate(target).catch(() => {});
      return;
    }
    await self.clients.openWindow(target);
  })());
});
