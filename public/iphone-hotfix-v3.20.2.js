'use strict';
(()=>{
  const VERSION='3.20.2';
  const map={dashboard:'dashboard',products:'products',loans:'loans',reports:'reports',more:'more'};
  function sync(){
    const active=document.querySelector('.bottom-nav .nav-item.active');
    const route=active?.dataset?.route||'';
    if(route) document.body.dataset.mocuiPage=map[route]||route;
  }
  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;sync();});
  }
  function start(){
    sync();
    const nav=document.querySelector('.bottom-nav');
    if(nav)new MutationObserver(schedule).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
  window.MocuiIphoneHotfixV3202={version:VERSION,sync};
})();