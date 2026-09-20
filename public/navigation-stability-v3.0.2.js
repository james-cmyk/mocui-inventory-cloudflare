'use strict';
(() => {
  const VERSION='3.0.2';
  const originalNavigate=window.navigate;
  if(typeof originalNavigate!=='function') return;

  let running=false;
  let queued=null;

  function mainEl(){ return document.getElementById('main'); }

  function clearTransitionState(){
    const main=mainEl();
    if(!main)return;
    main.classList.remove('route-changing');
    main.removeAttribute('aria-busy');
  }

  async function stableNavigate(route,params={},options={}){
    // iPhone 上快速连续点击底部导航时，不允许多个异步 render 同时修改同一个 #main。
    // 正在切页时只保留“最后一次”点击，当前页面完成后再执行它。
    if(running){
      queued={route,params,options};
      return {queued:true};
    }

    running=true;
    document.documentElement.classList.add('mocui-nav-busy');
    try{
      return await originalNavigate(route,params,options);
    }finally{
      running=false;
      clearTransitionState();
      document.documentElement.classList.remove('mocui-nav-busy');

      const next=queued;
      queued=null;
      if(next){
        // 让 WebKit 先完成当前一帧布局/绘制，再进入下一页。
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
          stableNavigate(next.route,next.params,next.options).catch(err=>{
            console.error('[mocui nav]',err);
            clearTransitionState();
          });
        }));
      }
    }
  }

  window.navigate=stableNavigate;

  // PWA 从后台恢复、异常中断或旧版导航遗留状态时，不能让页面永久停留在半透明状态。
  const recover=()=>{
    if(!running) clearTransitionState();
  };
  window.addEventListener('pageshow',recover,{passive:true});
  window.addEventListener('focus',recover,{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden) setTimeout(recover,60);
  },{passive:true});

  window.MocuiNavigationStability={version:VERSION};
})();