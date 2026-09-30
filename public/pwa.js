'use strict';
(()=>{
  const CURRENT='4.5.8';
  const VERSION_URL='./version.json';
  let registration=null,checking=false,lastCheck=0;
  const qs=s=>document.querySelector(s);
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
        // 安全发布标准：只后台下载，不在当前页面自动 reload，不打断任何业务表单。
        return true;
      }
      await registration.update();
      return false;
    }catch(e){console.warn('[v4.5.8 update]',e);return false;}finally{checking=false;}
  }
  async function repairAppCache(){
    // 仅供用户明确点击“修复缓存”时调用；这是主动操作，因此允许刷新。
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
      // 绝不在 controllerchange / updatefound / pageshow / visibilitychange 中主动刷新页面。
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
