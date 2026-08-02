const CACHE='mocui-inventory-pwa-v2-4-0';
const CORE=['./','./index.html','./offline.html','./app.css','./cloud.js','./app.js','./pwa.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
  ]));
});

async function networkFirst(request,fallback){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch{
    return (await caches.match(request))||(fallback?await caches.match(fallback):Response.error());
  }
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')) return;

  if(event.request.mode==='navigate'){
    event.respondWith(networkFirst(event.request,'./offline.html'));
    return;
  }

  if(/\.(?:js|css|webmanifest)$/i.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(async response=>{
    if(response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(event.request,response.clone());
    }
    return response;
  })));
});
