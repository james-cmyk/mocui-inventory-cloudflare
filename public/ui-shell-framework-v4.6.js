'use strict';
(()=>{
  const VERSION='4.6.0', MOBILE='(max-width:759px)', DOCK=54;

  /* v4.6 deliberately does NOT write viewport geometry.
     Previous shell versions repeatedly wrote 100dvh/fixed/bottom values from JS,
     creating a second geometry owner on iOS standalone. CSS now owns geometry. */
  function verify(){
    const app=document.querySelector('#app');
    const nav=document.querySelector('#app>.bottom-nav');
    if(!app||!nav)return {ok:false,reason:'missing-shell'};
    const ar=app.getBoundingClientRect(), nr=nav.getBoundingClientRect();
    const rootBottomGap=Math.round(Math.max(0,innerHeight-ar.bottom));
    const dockBottomGap=Math.round(Math.max(0,ar.bottom-nr.bottom));
    const ok=Math.abs(nr.height-DOCK)<=2 && rootBottomGap<=2 && dockBottomGap<=2;
    return {
      ok,version:VERSION,
      appTop:Math.round(ar.top),appBottom:Math.round(ar.bottom),appHeight:Math.round(ar.height),
      navTop:Math.round(nr.top),navBottom:Math.round(nr.bottom),navHeight:Math.round(nr.height),
      expectedDockHeight:DOCK,rootBottomGap,dockBottomGap,
      innerHeight:Math.round(innerHeight),clientHeight:Math.round(document.documentElement.clientHeight),
      visualViewportHeight:window.visualViewport?Math.round(window.visualViewport.height):null
    };
  }

  function start(){
    document.body.dataset.shellFramework=VERSION;
    document.body.classList.remove('dock-js-fixed');
    document.documentElement.style.removeProperty('--dock-top');
    window.MocuiShellFramework={version:VERSION,verify};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
