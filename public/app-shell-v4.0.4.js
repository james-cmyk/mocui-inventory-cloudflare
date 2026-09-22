'use strict';
(()=>{
  const VERSION='4.0.4';
  const root=document.documentElement;
  const standalone=()=>!!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);
  function screenCssHeight(){
    const vals=[
      Number(window.screen?.height)||0,
      Number(window.screen?.availHeight)||0,
      Number(window.innerHeight)||0,
      Number(document.documentElement?.clientHeight)||0,
      Number(window.visualViewport?.height)||0
    ].filter(v=>Number.isFinite(v)&&v>0);
    /* On iOS standalone the screenshot surface follows screen.height while
       innerHeight may expose a shorter legacy layout viewport. */
    return Math.round(Math.max(...vals));
  }
  function calibrate(){
    const h=screenCssHeight();
    if(h>0)root.style.setProperty('--mocui-physical-h',`${h}px`);
    root.style.removeProperty('--dock-top');
    root.style.removeProperty('--mocui-ios-canvas-tail');
    document.body?.classList.remove('dock-js-fixed');
    if(document.body)document.body.dataset.shellFramework=VERSION;
    return h;
  }
  function verify(){
    const app=document.querySelector('#app'),main=document.querySelector('#app>#main.main'),nav=document.querySelector('#app>.bottom-nav');
    if(!app||!main||!nav)return {ok:false,reason:'missing-shell',version:VERSION};
    const ar=app.getBoundingClientRect(),mr=main.getBoundingClientRect(),nr=nav.getBoundingClientRect();
    return {
      ok:Math.round(ar.height)>=screenCssHeight()-1 && nr.bottom<=ar.bottom+1,
      version:VERSION,standalone:standalone(),screenHeight:screen.height,screenAvailHeight:screen.availHeight,
      innerHeight,clientHeight:document.documentElement.clientHeight,visualViewportHeight:visualViewport?.height??null,
      physicalHeight:screenCssHeight(),appTop:Math.round(ar.top),appBottom:Math.round(ar.bottom),appHeight:Math.round(ar.height),
      mainBottom:Math.round(mr.bottom),navTop:Math.round(nr.top),navBottom:Math.round(nr.bottom),navHeight:Math.round(nr.height),
      layout:'physical-screen-absolute-canvas'
    };
  }
  function start(){
    calibrate();
    requestAnimationFrame(calibrate);
    setTimeout(calibrate,120);
    window.addEventListener('pageshow',calibrate,{passive:true});
    window.addEventListener('orientationchange',()=>setTimeout(calibrate,80),{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(calibrate,40)},{passive:true});
    window.MocuiShellFramework={version:VERSION,verify,calibrate};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
