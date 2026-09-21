const CACHE='mocui-v3.21.4-iphone-shell-final';
const CORE=['./ui-shell-framework-v4.4.css?v=4.4.0','./ui-shell-framework-v4.4.js?v=4.4.0','./','./index.html','./iphone-hotfix-v3.20.1.css?v=3.20.1','./iphone-hotfix-v3.20.1.js?v=3.20.1','./iphone-pages-v3.20.css?v=3.20.0','./iphone-pages-v3.20.js?v=3.20.0','./iphone-ux-v3.19.css?v=3.19.0','./iphone-ux-v3.19.js?v=3.19.0','./offline.html','./app.css','./ui-shell-stable.css','./cloud.js','./qinsilk-import.js','./content-workbench.js','./share.css','./share.js','./app.js','./sales-cost-v3.js?v=3.13.0','./product-fast-index-v3.1.js?v=3.13.0','./large-data-lists-v3.14.js?v=3.14.0','./analytics-precompute-v3.15.js?v=3.17.0','./analytics-incremental-v3.17.js?v=3.17.0','./analytics-dashboard-v3.15.js?v=3.17.0','./analytics-reports-v3.16.js?v=3.16.0','./stability-safety-v3.18.js?v=3.18.0','./stability-diagnostics-v3.18.js?v=3.18.0','./ui-shell-guard.js','./pwa.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png'];

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
  // Navigation is network-first so a newly deployed shell framework is not
  // hidden behind an old cached index.html. Offline still falls back safely.
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
  if(/\.(?:js|css|webmanifest)$/i.test(url.pathname)){event.respondWith(staleWhileRevalidate(event.request,event));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||updateCache(event.request).then(response=>response||Response.error())));
});

// v3.12.0：新增高价值配饰独立库存；销售自动扣减/撤销退回/恢复重扣；低价值配饰与其他直接成本并入核心毛利；不升级 IndexedDB schema，不迁移旧数据

// v3.13.0：R2 320px 商品缩略图；原图永久保留，失败自动回退原图。

// v3.14.0：销售/调借/库存流水/客户使用可重建轻量索引 + Cursor 分页；业务数据库 schema 不变。

// v3.15.0：销售统计预计算缓存；独立 analytics DB，可重建，不作为业务账本。

// v3.16.0 analytics reports

// v3.17.0 incremental analytics + customer cumulative stats

// v3.18.0 stability/data-safety guard; formal DB is never auto-repaired or deleted.

// v3.19.0 iPhone/PWA safe-area, keyboard, bottom-sheet and touch UX overlay.

// v3.20.0 page-level iPhone polish; visual/interaction only.

// v3.20.1 real-device hotfix: restore frozen shell, report flow, single more icon.

// v3.20.2: iPhone safe-area header + dashboard icon consistency.

// v3.20.3: anchor the five-tab dock to the physical viewport bottom.

// v3.21.0: frozen shell framework v4; navigation network-first; future UI must not own shell geometry.

// v3.21.1: viewport-native shell geometry.

// v3.21.2: viewport-fixed iPhone dock; 56px content + Home Indicator safe-area.

// v3.21.3: fixed 60px dock; no duplicated bottom safe-area in dock itself.

// v3.21.4: final iPhone shell — 54px dock + top text compositing cleanup.
