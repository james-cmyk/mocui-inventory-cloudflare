const CACHE='mocui-v3.4-phase5';
const CORE=['./','./index.html','./offline.html','./app.css','./cloud.js','./qinsilk-import.js','./content-workbench.js','./share.css','./share.js','./app.js','./pwa.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];

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

async function updateCache(request,cacheKey=request){
  try{
    const response=await fetch(request,{cache:'no-store'});
    if(response.ok){const cache=await caches.open(CACHE);await cache.put(cacheKey,response.clone());}
    return response;
  }catch{return null;}
}

async function appShell(request,event){
  const cached=(await caches.match(request))||(await caches.match('./index.html'))||(await caches.match('./'));
  if(cached){event.waitUntil(updateCache(request,'./index.html'));return cached;}
  return (await updateCache(request,'./index.html'))||(await caches.match('./offline.html'))||Response.error();
}

async function staleWhileRevalidate(request,event){
  const cached=await caches.match(request);
  const network=updateCache(request);
  if(cached){event.waitUntil(network);return cached;}
  return (await network)||Response.error();
}

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')) return;
  if(event.request.mode==='navigate'&&url.pathname==='/share.html'){event.respondWith(updateCache(event.request,event.request).then(response=>response||caches.match('./share.html')||Response.error()));return;}
  if(event.request.mode==='navigate'){event.respondWith(appShell(event.request,event));return;}
  if(/\.(?:js|css|webmanifest)$/i.test(url.pathname)){event.respondWith(staleWhileRevalidate(event.request,event));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||updateCache(event.request).then(response=>response||Response.error())));
});

// v3.4 朋友圈母稿生成平台文案、多图一次保存、店铺1:1全部图片
