'use strict';
(()=>{
  const CURRENT='4.6.1';
  const VERSION_URL='./version.json';
  let registration=null,checking=false,lastCheck=0;
  const qs=s=>document.querySelector(s);

  // v4.6.1: 本机优先极速启动。
  // app-core 仍会先渲染 IndexedDB 本机数据；这里把云端登录验证移到后台，
  // 不再让 /api/auth/me 的网络耗时挡住首页显示。
  function installFastCloudStart(CloudSync){
    if(!CloudSync||CloudSync.__mocuiFastStartV461)return;
    const originalBootstrap=CloudSync.bootstrap?.bind(CloudSync);
    const originalPull=CloudSync.pull?.bind(CloudSync);
    const originalSchedule=CloudSync.schedule?.bind(CloudSync);
    if(!originalBootstrap||!originalPull)return;

    let authGate=null;
    let queuedSchedule=false;
    let queuedDelay=1000;

    CloudSync.bootstrap=(options={})=>{
      if(!authGate){
        authGate=Promise.resolve()
          .then(()=>originalBootstrap({...options,deferPull:true}))
          .then(value=>({ok:true,value}),error=>({ok:false,error}));
      }
      // 立即放行 app-core 的 finishBoot()，首页先显示本机缓存。
      return Promise.resolve({mode:'local-first',deferred:true});
    };

    CloudSync.pull=async(...args)=>{
      if(authGate){
        const gate=authGate;
        const result=await gate;
        if(authGate===gate)authGate=null;
        if(!result.ok)throw result.error;
        if(queuedSchedule&&originalSchedule){
          const d=queuedDelay;
          queuedSchedule=false;queuedDelay=1000;
          setTimeout(()=>originalSchedule(d),0);
        }
      }
      return originalPull(...args);
    };

    if(originalSchedule){
      CloudSync.schedule=(delay=1000)=>{
        if(authGate){
          queuedSchedule=true;
          queuedDelay=Math.min(queuedDelay,Number(delay)||1000);
          return;
        }
        return originalSchedule(delay);
      };
    }

    Object.defineProperty(CloudSync,'__mocuiFastStartV461',{value:true,configurable:false});
  }

  // pwa.js 比 cloud.js 更早加载，用 setter 在 CloudSync 刚导出时立即安装极速启动包装。
  try{
    if(window.CloudSync){
      installFastCloudStart(window.CloudSync);
    }else{
      let cloudValue;
      Object.defineProperty(window,'CloudSync',{
        configurable:true,
        enumerable:true,
        get(){return cloudValue;},
        set(value){
          cloudValue=value;
          try{installFastCloudStart(value);}catch(e){console.warn('[fast-start] install failed',e);}
          Object.defineProperty(window,'CloudSync',{configurable:true,enumerable:true,writable:true,value});
        }
      });
    }
  }catch(e){console.warn('[fast-start] hook failed',e);}

  function notify(msg){const t=qs('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),1800);}
  function updateOnlineState(){document.documentElement.dataset.online=navigator.onLine?'yes':'no';let bar=qs('#pwaOfflineBar');if(!navigator.onLine){if(!bar){bar=document.createElement('div');bar.id='pwaOfflineBar';bar.className='pwa-offline-bar';bar.textContent='当前离线：本机数据仍可使用，联网后再同步';document.body.appendChild(bar);}}else if(bar)bar.remove();}
  async function remoteVersion(){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return '';const j=await r.json();return String(j.version||'');}catch{return '';}}
  async function checkForUpdate({force=false}={}){
    if(!('serviceWorker' in navigator)||!navigator.onLine||checking)return false;
    const now=Date.now();if(!force&&now-lastCheck<60000)return false;lastCheck=now;checking=true;
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const rv=await remoteVersion();
      if(rv&&rv!==CURRENT){
        localStorage.setItem('mocui_downloaded_update_target',rv);
        await registration.update();
        return true;
      }
      await registration.update();
      return false;
    }catch(e){console.warn('[v4.6.1 update]',e);return false;}finally{checking=false;}
  }
  async function repairAppCache(){
    if(!navigator.onLine){notify('当前离线，不能刷新应用代码');return;}
    try{
      const keys=await caches.keys();
      await Promise.all(keys.filter(k=>k.startsWith('mocui-')).map(k=>caches.delete(k)));
      registration=registration||await navigator.serviceWorker.getRegistration('./');
      await registration?.update();
      setTimeout(()=>location.reload(),350);
    }catch(e){notify('刷新失败，请稍后再试');}
  }
  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      // 只后台下载更新，绝不在当前业务页面自动 reload。
      setTimeout(()=>checkForUpdate({force:true}),800);
    }catch(e){console.warn('PWA service worker registration failed',e);}
  }
  function announceVersion(){
    localStorage.setItem('mocui_last_ui_version',CURRENT);
    localStorage.removeItem('mocui_pending_app_update');
    sessionStorage.removeItem('mocui_update_target');
    sessionStorage.removeItem('mocui_update_ready');
    sessionStorage.removeItem('mocui_update_reload_once');
  }
  window.addEventListener('online',()=>{updateOnlineState();checkForUpdate({force:true});});
  window.addEventListener('offline',updateOnlineState);
  window.addEventListener('pageshow',()=>checkForUpdate());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdate();});
  window.MocuiPWA={version:CURRENT,checkForUpdate:()=>checkForUpdate({force:true}),repairAppCache};
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();registerSW();});
})();
