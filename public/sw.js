const CACHE='mocui-v4.7.9.6-safe-readonly';
const SHELL=[
  './','./index.html','./repair.html','./offline.html','./app.css','./core-v4.css?v=4.0.1',
  './ui-icons.css?v=1.4.0','./ui-shell-stable.css','./business-ux-v2.css?v=2.2.0','./ui-refine-v2.4.css?v=2.4.0',
  './performance-v3.css?v=3.0.0','./navigation-stability-v3.0.3.css?v=3.0.3','./product-fast-index-v3.1.css?v=3.1.0',
  './detail-more-fix-v3.1.1.css?v=3.1.7','./loan-order-v3.1.2.css?v=3.1.2','./iphone-ux-v3.19.css?v=3.19.0',
  './iphone-pages-v3.20.css?v=3.20.0','./iphone-hotfix-v3.20.1.css?v=3.20.1','./iphone-hotfix-v3.20.2.css?v=3.20.2',
  './ui-shell-framework-v4.10.css?v=4.0.2','./app-shell-v4.0.4.css?v=4.0.5','./core-safety-v4.1.css?v=4.1.4',
  './mocui-lite-v4.5.3.css?v=4.5.3','./media-multi-v4.4.5.css?v=4.5.9','./ios-input-zoom-fix-v4.5.4.css?v=4.5.4',
  './trade-picker-v4.5.8.css?v=4.5.8','./loan-return-undo-v4.6.0.css?v=4.6.0',
  './db-schema-guard-v4.7.9.4.js?v=4.7.9.4','./pwa.js?v=4.7.9.4','./cloud.js','./sync-v3.js?v=4.7.9.4','./qinsilk-import.js','./content-workbench.js',
  './app-core-v4.1.4.js?v=4.7.9.4','./atomic-ledger-v4.7.9.js?v=4.7.9.4','./sales-cost-v3.js?v=3.13.0','./performance-v3.js?v=3.0.0',
  './navigation-stability-v3.0.3.js?v=4.7.9.3','./trade-gallery-queue.js?v=1.6.0','./business-ux-v2.js?v=2.2.0',
  './ui-refine-v2.4.1.js?v=2.4.2','./ui-icons.js?v=1.4.1','./ui-shell-guard.js','./product-fast-index-v3.1.js?v=4.7.9.2',
  './large-data-lists-v3.14.js?v=4.0.0','./analytics-precompute-v3.15.js?v=4.7.9.4','./analytics-incremental-v3.17.js?v=3.17.0',
  './analytics-dashboard-v3.15.js?v=3.17.0','./stability-safety-v3.18.js?v=4.7.9.4','./stability-diagnostics-v3.18.js?v=3.18.0',
  './detail-more-fix-v3.1.1.js?v=3.1.7','./loan-order-v3.1.2.js?v=3.1.2','./iphone-ux-v3.19.js?v=3.19.0',
  './iphone-pages-v3.20.js?v=3.20.0','./iphone-hotfix-v3.20.1.js?v=3.20.1','./iphone-hotfix-v3.20.2.js?v=3.20.2',
  './ui-shell-framework-v4.10.js?v=4.0.2','./app-shell-v4.0.4.js?v=4.0.5','./core-safety-v4.1.js?v=4.7.9.4',
  './mocui-lite-v4.5.3.js?v=4.5.9','./sales-stock-hotfix-v4.4.4.js?v=4.7.9.1','./media-multi-v4.4.5.js?v=4.5.9',
  './ios-input-zoom-fix-v4.5.4.js?v=4.5.4','./trade-picker-v4.5.8.js?v=4.7.7','./loan-return-undo-v4.6.0.js?v=4.7.9.1',
  './manifest.webmanifest','./version.json'
];

// Emergency release: pre-cache only the entry pages. Do not download the full
// ERP script bundle in the background on already unstable iPhone devices.
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    for(const path of ['./','./index.html','./safe.html']){
      const response=await fetch(path,{cache:'no-store'});
      if(!response.ok)throw new Error('安全入口资源不可用：'+path);
      await cache.put(path,response.clone());
    }
  })());
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING_MANUAL')self.skipWaiting();});
// Keep previous caches intact during emergency read-only verification.
self.addEventListener('activate',event=>{event.waitUntil(self.clients.claim());});
async function networkFallback(request,fallback){
  try{const r=await fetch(request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE);c.put(request,r.clone()).catch(()=>{});}return r;}
  catch{return (await caches.match(request))||(fallback?await caches.match(fallback):null)||Response.error();}
}
async function cacheFirst(request,fallback){
  const cache=await caches.open(CACHE),cached=(await cache.match(request))||(await caches.match(request));if(cached)return cached;
  try{const r=await fetch(request,{cache:'no-store'});if(r.ok)await cache.put(request,r.clone());return r;}catch{return fallback?(await cache.match(fallback))||Response.error():Response.error();}
}
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  // App 壳与静态资源本机优先，保证重复打开接近原生 App 的速度。
  if(req.mode==='navigate'){event.respondWith(cacheFirst(req,'./index.html'));return;}
  if(/\.(?:js|css|webmanifest)$/i.test(url.pathname)){event.respondWith(cacheFirst(req));return;}
  if(/version\.json$/i.test(url.pathname)){event.respondWith(networkFallback(req));return;}
  event.respondWith(caches.match(req).then(c=>c||fetch(req).catch(()=>Response.error())));
});
