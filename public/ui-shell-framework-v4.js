'use strict';
(()=>{
  const VERSION='4.0.0';
  const MOBILE='(max-width:759px)';
  const root=document.documentElement;
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let raf=0,lastHeight=0;

  function important(el,name,value){
    if(el) el.style.setProperty(name,value,'important');
  }
  function clear(el,name){
    if(el) el.style.removeProperty(name);
  }

  function physicalPortraitHeight(){
    const sw=Number(screen?.width)||0, sh=Number(screen?.height)||0;
    if(!sw||!sh) return 0;
    const portrait=window.innerWidth<=window.innerHeight;
    return portrait?Math.max(sw,sh):Math.min(sw,sh);
  }

  function shellHeight(){
    // iOS Home Screen PWA may report innerHeight/clientHeight shorter than the
    // actually captured physical screen. In standalone mode, screen.height is
    // the stable geometry source; keyboard must not shrink the app framework.
    if(standalone()){
      const physical=physicalPortraitHeight();
      if(physical>0) return physical;
    }
    const vv=window.visualViewport;
    const values=[
      window.innerHeight,
      document.documentElement.clientHeight,
      vv ? vv.height + vv.offsetTop : 0
    ].filter(v=>Number.isFinite(v)&&v>0);
    return values.length?Math.max(...values):window.innerHeight;
  }

  function lock(){
    raf=0;
    if(!matchMedia(MOBILE).matches) return;
    const app=document.querySelector('#app');
    const top=document.querySelector('#app>.topbar');
    const main=document.querySelector('#app>#main.main');
    const nav=document.querySelector('#app>.bottom-nav');
    if(!app||!top||!main||!nav) return;

    const h=Math.round(shellHeight());
    if(h>0) lastHeight=h;
    const H=lastHeight||h||window.innerHeight;

    // FRAME: only geometry. Visual design remains free.
    important(app,'position','fixed');
    important(app,'left','0');
    important(app,'top','0');
    important(app,'right','0');
    important(app,'bottom','auto');
    important(app,'width','100%');
    important(app,'height',`${H}px`);
    important(app,'min-height',`${H}px`);
    important(app,'max-height',`${H}px`);
    important(app,'display','flex');
    important(app,'flex-direction','column');
    important(app,'overflow','hidden');
    important(app,'padding','0');
    important(app,'margin','0');

    important(top,'position','relative');
    important(top,'top','auto');
    important(top,'left','auto');
    important(top,'right','auto');
    important(top,'bottom','auto');
    important(top,'flex','0 0 auto');
    important(top,'width','100%');

    important(main,'position','relative');
    important(main,'flex','1 1 auto');
    important(main,'min-height','0');
    important(main,'width','100%');
    important(main,'overflow-y','auto');
    important(main,'overflow-x','hidden');
    // Dock is a sibling flex row, so main must NOT reserve another dock height.
    important(main,'padding-bottom','24px');
    important(main,'scroll-padding-bottom','24px');

    important(nav,'position','relative');
    important(nav,'left','auto');
    important(nav,'right','auto');
    important(nav,'top','auto');
    important(nav,'bottom','auto');
    important(nav,'inset','auto');
    important(nav,'flex','0 0 78px');
    important(nav,'width','100%');
    important(nav,'height','78px');
    important(nav,'min-height','78px');
    important(nav,'max-height','78px');
    important(nav,'margin','0');
    important(nav,'transform','none');

    root.style.setProperty('--mocui-shell-height',`${H}px`);
    document.body.dataset.shellFramework=VERSION;
  }

  function schedule(){
    if(raf) cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>requestAnimationFrame(lock));
  }

  function verify(){
    const app=document.querySelector('#app'),nav=document.querySelector('#app>.bottom-nav');
    if(!app||!nav)return {ok:false,reason:'missing-shell'};
    const ar=app.getBoundingClientRect(), nr=nav.getBoundingClientRect();
    const gap=Math.round(ar.bottom-nr.bottom);
    const ok=Math.abs(gap)<=2;
    if(!ok) schedule();
    return {ok,gap,appBottom:Math.round(ar.bottom),navBottom:Math.round(nr.bottom),height:lastHeight};
  }

  function start(){
    lock();
    // Re-lock after route/UI render. This protects geometry from future visual CSS/JS.
    new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{
      subtree:true,childList:true,attributes:true,attributeFilter:['class']
    });
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('orientationchange',()=>{lastHeight=0;schedule();},{passive:true});
    window.addEventListener('pageshow',schedule,{passive:true});
    window.addEventListener('focus',schedule,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();},{passive:true});
    // visualViewport resize is keyboard-sensitive; framework height intentionally
    // remains physical screen height in standalone mode.
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    setTimeout(schedule,120);
    setTimeout(schedule,500);
    setTimeout(schedule,1200);
  }

  window.MocuiShellFramework={version:VERSION,lock:schedule,verify};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();