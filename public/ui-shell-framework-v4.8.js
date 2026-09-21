'use strict';
(()=>{
  const VERSION='4.8.1', MOBILE='(max-width:759px)';
  let raf=0;
  function safeInsets(){
    const el=document.createElement('div');
    el.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.documentElement.appendChild(el);
    const cs=getComputedStyle(el),top=parseFloat(cs.paddingTop)||0,bottom=parseFloat(cs.paddingBottom)||0;
    el.remove();return {top,bottom};
  }
  function standalone(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true)}
  function calibrate(){
    raf=0;
    if(!matchMedia(MOBILE).matches){document.documentElement.style.removeProperty('--mocui-ios-canvas-tail');return}
    const s=safeInsets();
    const raw=standalone()?Number(screen.height||0)-Number(innerHeight||0)-s.top:0;
    const tail=Math.max(0,Math.min(s.bottom||80,Number.isFinite(raw)?raw:0));
    document.documentElement.style.setProperty('--mocui-ios-canvas-tail',`${Math.round(tail*100)/100}px`);
    document.body.dataset.shellFramework=VERSION;
    document.body.classList.remove('dock-js-fixed');
    document.documentElement.style.removeProperty('--dock-top');
  }
  function schedule(){if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>requestAnimationFrame(calibrate))}
  function verify(){
    const app=document.querySelector('#app'),nav=document.querySelector('#app>.bottom-nav'),s=safeInsets();
    if(!app||!nav)return {ok:false,reason:'missing-shell',version:VERSION};
    const ar=app.getBoundingClientRect(),nr=nav.getBoundingClientRect(),cs=getComputedStyle(nav);
    return {version:VERSION,standalone:standalone(),screenHeight:screen.height,innerHeight,clientHeight:document.documentElement.clientHeight,visualViewportHeight:visualViewport?.height??null,safeTop:s.top,safeBottom:s.bottom,canvasTail:getComputedStyle(document.documentElement).getPropertyValue('--mocui-ios-canvas-tail').trim(),appBottom:ar.bottom,navTop:nr.top,navBottom:nr.bottom,navHeight:nr.height,navWidth:nr.width,navRadius:cs.borderRadius,layout:'floating-capsule-flow'};
  }
  function start(){
    calibrate();window.MocuiShellFramework={version:VERSION,verify,calibrate};
    window.addEventListener('resize',schedule,{passive:true});window.addEventListener('orientationchange',schedule,{passive:true});window.addEventListener('pageshow',schedule,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
