const CACHE='mocui-v4.2.0-daily-efficiency';
const CORE=['./','./index.html','./offline.html','./app.css','./core-v4.css?v=4.0.1','./ui-shell-stable.css','./ui-shell-framework-v4.10.css?v=4.0.2','./ui-shell-framework-v4.10.js?v=4.0.2','./app-shell-v4.0.4.css?v=4.0.5','./cloud.js','./qinsilk-import.js','./content-workbench.js','./share.css','./share.js','./app-core-v4.1.4.js?v=4.1.4','./sales-cost-v3.js?v=3.13.0','./product-fast-index-v3.1.js?v=4.0.0','./large-data-lists-v3.14.js?v=4.0.0','./analytics-precompute-v3.15.js?v=3.17.0','./analytics-incremental-v3.17.js?v=3.17.0','./analytics-dashboard-v3.15.js?v=3.17.0','./analytics-reports-v3.16.js?v=3.16.0','./stability-safety-v3.18.js?v=3.18.0','./stability-diagnostics-v3.18.js?v=3.18.0','./ui-shell-guard.js','./pwa.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png',
  './core-safety-v4.1.js?v=4.1.4','./core-safety-v4.1.css?v=4.1.4',
  './workflow-efficiency-v4.2.js?v=4.2.0','./workflow-efficiency-v4.2.css?v=4.2.0'
];

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
  const fresh=await updateCache(request,'./index.html');
  if(fresh)return fresh;
  return (await caches.match(request))||(await caches.match('./index.html'))||(await caches.match('./'))||(await caches.match('./offline.html'))||Response.error();
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
  if(/\.(?:js|css|webmanifest)$/i.test(url.pathname)){event.respondWith(updateCache(event.request,event.request).then(response=>response||caches.match(event.request)||Response.error()));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||updateCache(event.request).then(response=>response||Response.error())));
});

// v4.2.0：日常业务效率优化第一轮。新增今日工作台、商品报价/跟进、商品详情统一“报价→调出→成交→内容”动作入口；不升级 IndexedDB schema，不迁移现有业务数据。
