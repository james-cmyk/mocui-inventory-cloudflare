'use strict';
(()=>{
  const CURRENT='4.5.6';
  const VERSION_URL='./version.json';
  const PENDING_KEY='mocui_pending_app_update';
  const APPLIED_KEY='mocui_applied_app_update';
  let registration=null,checking=false,lastCheck=0,hiddenAt=0;
  const qs=s=>document.querySelector(s);
  function notify(msg){const t=qs('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),1800);}
  function updateOnlineState(){document.documentElement.dataset.online=navigator.onLine?'yes':'no';let bar=qs('#pwaOfflineBar');if(!navigator.onLine){if(!bar){bar=document.createElement('div');bar.id='pwaOfflineBar';bar.className='pwa-offline-bar';bar.textContent='当前离线：本机数据仍可使用，联网后再同步';document.body.appendChild(bar);}}else if(bar)bar.remove();}
  async function remoteVersion(){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return '';const j=await r.json();return String(j.version||'');}catch{return '';}}
  async function activateWaiting(){if(registration?.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});return true;}return false;}
  function editingNow(){
    const modal=!!document.querySelector('#modalRoot .modal-backdrop');
    const route=window.appState?.route||'';
    const active=document.activeElement;
    const typing=!!active?.matches?.('input,textarea,select,[contenteditable="true"]');
    return modal||typing||['sale-new','pass-deal-new'].includes(route);
  }
  function markPending(v){if(v&&v!==CURRENT)localStorage.setItem(PENDING_KEY,v);}
  function clearCurrentPending(){
    const p=localStorage.getItem(PENDING_KEY);
    if(p===CURRENT){localStorage.removeItem(PENDING_KEY);sessionStorage.removeItem('mocui_update_target');sessionStorage.removeItem('mocui_update_ready');}
    localStorage.setItem(APPLIED_KEY,CURRENT);
  }
  function applyPendingIfSafe(){
    const target=localStorage.getItem(PENDING_KEY)||sessionStorage.getItem('mocui_update_target')||'';
    if(!target||target===CURRENT){clearCurrentPending();return false;}
    if(editingNow())return false;
    const once=`${CURRENT}->${target}`;
    if(sessionStorage.getItem('mocui_update_reload_once')===once)return false;
    sessionStorage.setItem('mocui_update_reload_once',once);
    location.reload();
    return true;
  }
  async function checkForUpdate({force=false}={}){
    if(!('serviceWorker'in navigator)||!navigator.onLine||checking)return false;
    const now=Date.now();if(!force&&now-lastCheck<45000)return false;lastCheck=now;checking=true;
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const rv=await remoteVersion();
      if(rv&&rv!==CURRENT){markPending(rv);sessionStorage.setItem('mocui_update_target',rv);await registration.update();await new Promise(r=>setTimeout(r,350));await activateWaiting();return true;}
      await registration.update();await new Promise(r=>setTimeout(r,250));await activateWaiting();return false;
    }catch(e){console.warn('[v4.5.6 update]',e);return false;}finally{checking=false;}
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
        const target=sessionStorage.getItem('mocui_update_target')||localStorage.getItem(PENDING_KEY)||'';
        if(target&&target!==CURRENT)markPending(target);
      });
      registration.addEventListener('updatefound',()=>{const w=registration.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){const target=sessionStorage.getItem('mocui_update_target')||localStorage.getItem(PENDING_KEY)||'';if(target)markPending(target);w.postMessage({type:'SKIP_WAITING'});}});});
      if(registration.waiting)await activateWaiting();
      setTimeout(()=>checkForUpdate({force:true}),500);
    }catch(e){console.warn('PWA service worker registration failed',e);}
  }
  function announceVersion(){localStorage.setItem('mocui_last_ui_version',CURRENT);clearCurrentPending();}
  window.addEventListener('online',()=>{updateOnlineState();checkForUpdate({force:true});});
  window.addEventListener('offline',updateOnlineState);
  window.addEventListener('pageshow',()=>{setTimeout(()=>{if(!applyPendingIfSafe())checkForUpdate();},120);});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){hiddenAt=Date.now();return;}
    const wasAway=Date.now()-hiddenAt>1200;
    if(wasAway)setTimeout(()=>{if(!applyPendingIfSafe())checkForUpdate();},120);
    else checkForUpdate();
  });
  window.MocuiPWA={version:CURRENT,checkForUpdate:()=>checkForUpdate({force:true}),repairAppCache};
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();registerSW();});
})();
