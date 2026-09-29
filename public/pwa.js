'use strict';
(()=>{
  const CURRENT='4.5.5';
  const VERSION_URL='./version.json';
  let registration=null,checking=false,lastCheck=0;
  const qs=s=>document.querySelector(s);
  function notify(msg){const t=qs('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),1800);}
  function updateOnlineState(){document.documentElement.dataset.online=navigator.onLine?'yes':'no';let bar=qs('#pwaOfflineBar');if(!navigator.onLine){if(!bar){bar=document.createElement('div');bar.id='pwaOfflineBar';bar.className='pwa-offline-bar';bar.textContent='当前离线：本机数据仍可使用，联网后再同步';document.body.appendChild(bar);}}else if(bar)bar.remove();}
  async function remoteVersion(){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return '';const j=await r.json();return String(j.version||'');}catch{return '';}}
  async function activateWaiting(){if(registration?.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});return true;}return false;}
  async function checkForUpdate({force=false}={}){
    if(!('serviceWorker'in navigator)||!navigator.onLine||checking)return false;
    const now=Date.now();if(!force&&now-lastCheck<45000)return false;lastCheck=now;checking=true;
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const rv=await remoteVersion();
      if(rv&&rv!==CURRENT){sessionStorage.setItem('mocui_update_target',rv);await registration.update();await new Promise(r=>setTimeout(r,350));await activateWaiting();return true;}
      await registration.update();await new Promise(r=>setTimeout(r,250));await activateWaiting();return false;
    }catch(e){console.warn('[v4.5.5 update]',e);return false;}finally{checking=false;}
  }
  async function repairAppCache(){
    if(!navigator.onLine){notify('当前离线，不能刷新应用代码');return;}
    try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mocui-')).map(k=>caches.delete(k)));registration=registration||await navigator.serviceWorker.getRegistration('./');await registration?.update();await activateWaiting();setTimeout(()=>location.reload(),350);}catch(e){notify('刷新失败，请稍后再试');}
  }
  async function registerSW(){
    if(!('serviceWorker'in navigator))return;
    try{
      registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        // v4.5.0: 后台更新只切换 Service Worker，不强制刷新当前页面。
        // 旧页面继续稳定使用；下次重新进入自然加载新版本。
        sessionStorage.setItem('mocui_update_ready',sessionStorage.getItem('mocui_update_target')||CURRENT);
      });
      registration.addEventListener('updatefound',()=>{const w=registration.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){sessionStorage.setItem('mocui_update_target',(sessionStorage.getItem('mocui_update_target')||CURRENT));w.postMessage({type:'SKIP_WAITING'});}});});
      if(registration.waiting)await activateWaiting();
      setTimeout(()=>checkForUpdate({force:true}),500);
    }catch(e){console.warn('PWA service worker registration failed',e);}
  }
  function announceVersion(){
    // 静默记录版本，不在前台弹“已更新”提示。
    localStorage.setItem('mocui_last_ui_version',CURRENT);
  }
  window.addEventListener('online',()=>{updateOnlineState();checkForUpdate({force:true});});
  window.addEventListener('offline',updateOnlineState);
  window.addEventListener('pageshow',()=>checkForUpdate());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdate();});
  window.MocuiPWA={version:CURRENT,checkForUpdate:()=>checkForUpdate({force:true}),repairAppCache};
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();registerSW();});
})();
