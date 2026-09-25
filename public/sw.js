const CACHE='mocui-v4.2.4-daily-close-review';
const CORE=['./','./index.html','./offline.html','./app.css','./core-v4.css?v=4.0.1','./ui-shell-stable.css','./ui-shell-framework-v4.10.css?v=4.0.2','./ui-shell-framework-v4.10.js?v=4.0.2','./app-shell-v4.0.4.css?v=4.0.5','./cloud.js','./qinsilk-import.js','./content-workbench.js','./share.css','./share.js','./app-core-v4.1.4.js?v=4.1.4','./sales-cost-v3.js?v=3.13.0','./product-fast-index-v3.1.js?v=4.0.0','./large-data-lists-v3.14.js?v=4.0.0','./analytics-precompute-v3.15.js?v=3.17.0','./analytics-incremental-v3.17.js?v=3.17.0','./analytics-dashboard-v3.15.js?v=3.17.0','./analytics-reports-v3.16.js?v=3.16.0','./stability-safety-v3.18.js?v=3.18.0','./stability-diagnostics-v3.18.js?v=3.18.0','./ui-shell-guard.js','./pwa.js','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png',
  './core-safety-v4.1.js?v=4.1.4','./core-safety-v4.1.css?v=4.1.4',
  './workflow-efficiency-v4.2.js?v=4.2.0','./workflow-efficiency-v4.2.css?v=4.2.0','./counterparty-efficiency-v4.2.1.js?v=4.2.1','./counterparty-efficiency-v4.2.1.css?v=4.2.1','./quick-capture-v4.2.2.js?v=4.2.2','./quick-capture-v4.2.2.css?v=4.2.2','./settlement-center-v4.2.3.js?v=4.2.3','./settlement-center-v4.2.3.css?v=4.2.3','./daily-close-v4.2.4.js?v=4.2.4','./daily-close-v4.2.4.css?v=4.2.4'
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

// v4.2.1：调货与同行管理效率优化。复用 customers 路由作为往来总览，聚合正式销售、调借、外部货、过手差价和报价；仅展示聚合与联系人资料，不迁移业务数据库。

// v4.2.2：快速建档与找货效率优化。新增“拍照 + 一句话”商品草稿、可选网页语音识别、全局货品搜索；复用原商品保存核心，不升级 IndexedDB schema，不迁移业务数据。

// v4.2.3：成交、收款、付款与对账效率优化。正式销售、过手差价、外部同行货统一展示待收待付；支持分次补收/补付、结算留痕、按人对账；不修改库存，不升级 IndexedDB schema。

// v4.2.4：每日收尾与经营复盘。区分成交口径与现金口径，汇总调借、外部货、报价跟进和待结事项；保存日结核对快照，不改变原业务账和库存。
