'use strict';
(()=>{
  const VERSION='4.5.6';
  const compact=s=>String(s||'').replace(/\s+/g,'');
  function onDashboard(){
    const r=window.appState?.route;
    return !r||r==='dashboard';
  }
  function cleanupDashboard(){
    const main=document.querySelector('#main');
    if(!main||!onDashboard())return;
    for(const child of [...main.children]){
      const txt=compact(child.textContent);
      if(!txt.includes('今日成交构成'))continue;
      if(child.classList?.contains('v44-home'))continue;
      if(child.id==='v446TodayMix'||child.querySelector?.('#v446TodayMix'))continue;
      child.remove();
    }
  }
  function syncVersionLabels(){
    const home=document.querySelector('.v44-home-foot');
    if(home)home.textContent=`v${VERSION} · 首页融合版`;
    const more=document.querySelector('#v44MoreVersion strong');
    if(more)more.textContent=`v${VERSION}`;
  }
  function installGuard(){
    const main=document.querySelector('#main');
    if(!main||main.dataset.v456Guard==='1')return;
    main.dataset.v456Guard='1';
    const observer=new MutationObserver(()=>{
      cleanupDashboard();
      syncVersionLabels();
    });
    observer.observe(main,{childList:true,subtree:true});
    cleanupDashboard();
    syncVersionLabels();
  }
  function wrapDashboard(){
    try{
      if(typeof window.renderDashboard!=='function' || window.renderDashboard.__v456Stable)return;
      const base=window.renderDashboard;
      const wrapped=async function(...args){
        installGuard();
        const result=await base.apply(this,args);
        cleanupDashboard();
        syncVersionLabels();
        return result;
      };
      wrapped.__v456Stable=true;
      window.renderDashboard=wrapped;
      try{renderDashboard=wrapped;}catch(_){/* global binding may be read-only in some shells */}
    }catch(err){console.warn('[v4.5.6 dashboard guard]',err);}
  }
  function boot(){
    installGuard();
    wrapDashboard();
    syncVersionLabels();
    setTimeout(()=>{installGuard();wrapDashboard();cleanupDashboard();syncVersionLabels();},0);
    setTimeout(()=>{cleanupDashboard();syncVersionLabels();},300);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('mocui-analytics-ready',()=>{cleanupDashboard();syncVersionLabels();});
  window.addEventListener('mocui-analytics-updated',()=>{cleanupDashboard();syncVersionLabels();});
  window.MocuiDashboardStabilityV456={version:VERSION,cleanup:cleanupDashboard};
})();
