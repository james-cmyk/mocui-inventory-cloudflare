const CACHE='mocui-v4.4.0-lite';
const SHELL=[
  './','./index.html','./offline.html','./app.css','./core-v4.css?v=4.0.1',
  './app-core-v4.1.4.js?v=4.1.4','./mocui-lite-v4.4.0.js?v=4.4.0',
  './mocui-lite-v4.4.0.css?v=4.4.0','./pwa.js?v=4.4.0','./manifest.webmanifest','./version.json'
];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.allSettled(SHELL.map(async u=>{try{const r=await fetch(u,{cache:'no-store'});if(r.ok)await cache.put(u,r.clone());}catch{}}));await self.skipWaiting();})());});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mocui-')&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
async function networkFirst(request,fallback){try{const r=await fetch(request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE);c.put(request,r.clone()).catch(()=>{});}return r;}catch{return (await caches.match(request))||(fallback?await caches.match(fallback):null)||Response.error();}}
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(req.mode==='navigate'){event.respondWith(networkFirst(req,'./offline.html'));return;}if(/\.(?:js|css|webmanifest|json)$/i.test(url.pathname)){event.respondWith(networkFirst(req));return;}event.respondWith(caches.match(req).then(c=>c||fetch(req).catch(()=>Response.error())));});
