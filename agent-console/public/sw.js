'use strict';
// Older shells used CacheStorage. Never cache authenticated chat or task responses.
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  await caches.delete('ayk-agent-shell-v1'); await self.clients.claim();
})()));
self.addEventListener('push',e=>{
  let tag='agent-task';
  try {const id=e.data.json().tag;if(typeof id==='string')tag=id;} catch {}
  e.waitUntil(self.registration.showNotification('وكيل التطوير',{
    body:'تغيّرت حالة إحدى مهامك. افتح الواجهة للاطلاع عليها.',tag,icon:'/icon.svg'
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const pages=await self.clients.matchAll({type:'window'});
    for(const page of pages) if(new URL(page.url).origin===self.location.origin)return page.focus();
    return self.clients.openWindow('/');
  })());
});
