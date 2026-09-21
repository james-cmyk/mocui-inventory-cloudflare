'use strict';
(()=>{
  const VERSION='4.4.0', MOBILE='(max-width:759px)';
  let raf=0;
  function imp(el,k,v){if(el)el.style.setProperty(k,v,'important')}
  function lock(){
    raf=0;
    if(!matchMedia(MOBILE).matches)return;
    const app=document.querySelector('#app'),
          top=document.querySelector('#app>.topbar'),
          main=document.querySelector('#app>#main.main'),
          nav=document.querySelector('#app>.bottom-nav');
    if(!app||!top||!main||!nav)return;

    imp(app,'position','fixed'); imp(app,'inset','0'); imp(app,'width','100%');
    imp(app,'height','100dvh'); imp(app,'min-height','100dvh'); imp(app,'max-height','100dvh');
    imp(app,'display','flex'); imp(app,'flex-direction','column'); imp(app,'overflow','hidden');

    imp(top,'position','relative'); imp(top,'inset','auto'); imp(top,'flex','0 0 auto');

    imp(main,'position','relative'); imp(main,'flex','1 1 0%'); imp(main,'min-height','0');
    imp(main,'overflow-y','auto'); imp(main,'overflow-x','hidden');

    /* Hard lock: compact 50px CSS dock, with no extra bottom safe-area added. */
    imp(nav,'position','fixed'); imp(nav,'left','0'); imp(nav,'right','0');
    imp(nav,'bottom','0'); imp(nav,'top','auto'); imp(nav,'inset','auto 0 0 0');
    imp(nav,'width','100%'); imp(nav,'height','50px'); imp(nav,'min-height','50px');
    imp(nav,'max-height','50px'); imp(nav,'flex','0 0 50px');
    imp(nav,'margin','0'); imp(nav,'padding','0 8px'); imp(nav,'transform','none');

    document.body.dataset.shellFramework=VERSION;
  }
  function schedule(){
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(lock);
  }
  function verify(){
    const nav=document.querySelector('#app>.bottom-nav');
    if(!nav)return {ok:false,reason:'missing-nav'};
    const r=nav.getBoundingClientRect(), expected=50;
    const ok=Math.abs(r.height-expected)<=2;
    if(!ok)schedule();
    return {
      ok,navHeight:Math.round(r.height),expectedHeight:expected,
      top:Math.round(r.top),bottom:Math.round(r.bottom),
      innerHeight:Math.round(window.innerHeight),
      clientHeight:Math.round(document.documentElement.clientHeight),
      visualViewportHeight:window.visualViewport?Math.round(window.visualViewport.height):null
    };
  }
  function start(){
    lock();
    const app=document.querySelector('#app')||document.body;
    new MutationObserver(schedule).observe(app,{
      subtree:true,childList:true,attributes:true,attributeFilter:['class']
    });
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',schedule,{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()},{passive:true});
    setTimeout(schedule,100);setTimeout(schedule,400);setTimeout(schedule,1000);
  }
  window.MocuiShellFramework={version:VERSION,lock:schedule,verify};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();