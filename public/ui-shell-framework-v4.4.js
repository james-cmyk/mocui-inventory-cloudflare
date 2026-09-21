'use strict';
(()=>{
  const VERSION='4.4.0', MOBILE='(max-width:759px)', DOCK=54;
  let raf=0;
  const imp=(el,k,v)=>el&&el.style.setProperty(k,v,'important');

  function lock(){
    raf=0;
    if(!matchMedia(MOBILE).matches)return;
    const app=document.querySelector('#app');
    const top=document.querySelector('#app>.topbar');
    const main=document.querySelector('#app>#main.main');
    const nav=document.querySelector('#app>.bottom-nav');
    if(!app||!top||!main||!nav)return;

    imp(app,'position','fixed');imp(app,'inset','0');imp(app,'width','100%');
    imp(app,'height','100dvh');imp(app,'min-height','100dvh');imp(app,'max-height','100dvh');
    imp(app,'display','flex');imp(app,'flex-direction','column');imp(app,'overflow','hidden');

    imp(top,'position','relative');imp(top,'inset','auto');imp(top,'flex','0 0 auto');
    imp(top,'transform','none');imp(top,'filter','none');imp(top,'backdrop-filter','none');
    imp(top,'-webkit-backdrop-filter','none');

    imp(main,'position','relative');imp(main,'flex','1 1 0%');imp(main,'min-height','0');
    imp(main,'overflow-y','auto');imp(main,'overflow-x','hidden');

    imp(nav,'position','fixed');imp(nav,'left','0');imp(nav,'right','0');
    imp(nav,'bottom','0');imp(nav,'top','auto');imp(nav,'inset','auto 0 0 0');
    imp(nav,'width','100%');imp(nav,'height',DOCK+'px');imp(nav,'min-height',DOCK+'px');
    imp(nav,'max-height',DOCK+'px');imp(nav,'flex','0 0 '+DOCK+'px');
    imp(nav,'margin','0');imp(nav,'padding','1px 8px 0');imp(nav,'transform','none');

    document.body.dataset.shellFramework=VERSION;
  }

  function schedule(){
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(lock);
  }

  function verify(){
    const nav=document.querySelector('#app>.bottom-nav');
    if(!nav)return {ok:false,reason:'missing-nav'};
    const r=nav.getBoundingClientRect();
    const ok=Math.abs(r.height-DOCK)<=2;
    if(!ok)schedule();
    return {
      ok,version:VERSION,navHeight:Math.round(r.height),expectedHeight:DOCK,
      navTop:Math.round(r.top),navBottom:Math.round(r.bottom),
      innerHeight:Math.round(innerHeight),
      clientHeight:Math.round(document.documentElement.clientHeight),
      visualViewportHeight:visualViewport?Math.round(visualViewport.height):null
    };
  }

  function start(){
    lock();
    const root=document.querySelector('#app')||document.body;
    new MutationObserver(schedule).observe(root,{
      subtree:true,childList:true,attributes:true,attributeFilter:['class']
    });
    addEventListener('resize',schedule,{passive:true});
    addEventListener('orientationchange',schedule,{passive:true});
    addEventListener('pageshow',schedule,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()},{passive:true});
    setTimeout(schedule,100);setTimeout(schedule,400);setTimeout(schedule,1000);
  }

  window.MocuiShellFramework={version:VERSION,lock:schedule,verify};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();