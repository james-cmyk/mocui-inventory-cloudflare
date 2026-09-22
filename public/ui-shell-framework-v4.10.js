'use strict';
(()=>{
  const VERSION='4.0.0';
  function standalone(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true)}
  function normalize(){
    /* Retire every historical JS dock coordinate. CSS is the sole geometry owner. */
    document.documentElement.style.removeProperty('--dock-top');
    document.documentElement.style.removeProperty('--mocui-ios-canvas-tail');
    document.body?.classList.remove('dock-js-fixed');
    if(document.body)document.body.dataset.shellFramework=VERSION;
  }
  function verify(){
    const app=document.querySelector('#app'),main=document.querySelector('#app>#main.main'),nav=document.querySelector('#app>.bottom-nav');
    if(!app||!main||!nav)return {ok:false,reason:'missing-shell',version:VERSION};
    const ar=app.getBoundingClientRect(),mr=main.getBoundingClientRect(),nr=nav.getBoundingClientRect();
    const root=getComputedStyle(document.documentElement);
    return {
      ok:nr.height>=43&&nr.height<=45&&nr.bottom<=Math.max(innerHeight,document.documentElement.clientHeight)+1,
      version:VERSION,standalone:standalone(),innerHeight,
      clientHeight:document.documentElement.clientHeight,
      visualViewportHeight:window.visualViewport?.height??null,
      appBottom:Math.round(ar.bottom),mainBottom:Math.round(mr.bottom),
      navTop:Math.round(nr.top),navBottom:Math.round(nr.bottom),navHeight:Math.round(nr.height),
      dockBottom:root.getPropertyValue('--mocui-dock-bottom').trim(),
      dockTail:root.getPropertyValue('--mocui-dock-tail').trim(),
      layout:'v4-alipay-canonical-overlay'
    };
  }
  function start(){
    normalize();
    window.addEventListener('pageshow',normalize,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)normalize();},{passive:true});
    window.MocuiShellFramework={version:VERSION,verify,calibrate:normalize};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
