'use strict';
(()=>{
  const VERSION='4.9.2', MOBILE='(max-width:759px)';
  function standalone(){return !!(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true)}
  function verify(){
    const app=document.querySelector('#app'),nav=document.querySelector('#app>.bottom-nav');
    if(!app||!nav)return {ok:false,reason:'missing-shell',version:VERSION};
    const ar=app.getBoundingClientRect(),nr=nav.getBoundingClientRect(),cs=getComputedStyle(nav);
    return {version:VERSION,standalone:standalone(),innerHeight,clientHeight:document.documentElement.clientHeight,visualViewportHeight:visualViewport?.height??null,appBottom:ar.bottom,navTop:nr.top,navBottom:nr.bottom,navHeight:nr.height,navWidth:nr.width,navRadius:cs.borderRadius,layout:'viewport-fixed-capsule-overlay'};
  }
  function calibrate(){
    document.documentElement.style.setProperty('--mocui-ios-canvas-tail','0px');
    document.documentElement.style.removeProperty('--dock-top');
    document.body?.classList.remove('dock-js-fixed');
    if(document.body)document.body.dataset.shellFramework=VERSION;
  }
  function start(){calibrate();window.MocuiShellFramework={version:VERSION,verify,calibrate};}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
