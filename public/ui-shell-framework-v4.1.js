'use strict';
(()=>{
  const VERSION='4.1.0', MOBILE='(max-width:759px)';
  let raf=0;
  function important(el,name,value){if(el)el.style.setProperty(name,value,'important')}
  function lock(){
    raf=0;
    if(!matchMedia(MOBILE).matches)return;
    const app=document.querySelector('#app'),
          top=document.querySelector('#app>.topbar'),
          main=document.querySelector('#app>#main.main'),
          nav=document.querySelector('#app>.bottom-nav');
    if(!app||!top||!main||!nav)return;

    important(app,'position','fixed');
    important(app,'inset','0');
    important(app,'width','100%');
    important(app,'height','100dvh');
    important(app,'min-height','100dvh');
    important(app,'max-height','100dvh');
    important(app,'display','flex');
    important(app,'flex-direction','column');
    important(app,'overflow','hidden');

    important(top,'position','relative');
    important(top,'inset','auto');
    important(top,'flex','0 0 auto');
    important(top,'width','100%');

    important(main,'position','relative');
    important(main,'flex','1 1 0%');
    important(main,'min-height','0');
    important(main,'width','100%');
    important(main,'overflow-y','auto');
    important(main,'overflow-x','hidden');

    important(nav,'position','relative');
    important(nav,'inset','auto');
    important(nav,'flex','0 0 78px');
    important(nav,'width','100%');
    important(nav,'height','78px');
    important(nav,'min-height','78px');
    important(nav,'max-height','78px');
    important(nav,'margin','0');
    important(nav,'transform','none');

    document.body.dataset.shellFramework=VERSION;
  }
  function schedule(){if(raf)cancelAnimationFrame(raf);raf=requestAnimationFrame(lock)}
  function verify(){
    const app=document.querySelector('#app'),nav=document.querySelector('#app>.bottom-nav');
    if(!app||!nav)return {ok:false,reason:'missing-shell'};
    const ar=app.getBoundingClientRect(),nr=nav.getBoundingClientRect();
    const vb=Math.round(document.documentElement.clientHeight);
    const navGap=Math.round(vb-nr.bottom),appGap=Math.round(vb-ar.bottom);
    const ok=Math.abs(navGap)<=3&&Math.abs(appGap)<=3&&nr.height>40;
    if(!ok)schedule();
    return {ok,navGap,appGap,viewportBottom:vb,appBottom:Math.round(ar.bottom),navBottom:Math.round(nr.bottom),navHeight:Math.round(nr.height)};
  }
  function start(){
    lock();
    const app=document.querySelector('#app')||document.body;
    new MutationObserver(schedule).observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()},{passive:true});
    setTimeout(schedule,100);setTimeout(schedule,400);setTimeout(schedule,1000);
  }
  window.MocuiShellFramework={version:VERSION,lock:schedule,verify};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();