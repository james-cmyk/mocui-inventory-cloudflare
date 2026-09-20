'use strict';
(() => {
  const VERSION='3.0.3';
  const originalNavigate=window.navigate;
  if(typeof originalNavigate!=='function') return;

  let running=false;
  let queued=null;

  const routeNames={dashboard:'概况',products:'商品',loans:'调借',reports:'报表',more:'更多'};
  function mainEl(){ return document.getElementById('main'); }

  function clearTransitionState(){
    const main=mainEl();
    if(!main)return;
    main.classList.remove('route-changing');
    main.removeAttribute('aria-busy');
  }

  function showImmediateLoading(route){
    const main=mainEl();
    if(!main)return;
    const label=routeNames[route]||'页面';
    main.classList.remove('route-changing');
    main.setAttribute('aria-busy','true');
    main.innerHTML=`<section class="mocui-route-loading" aria-label="正在打开${label}">
      <div class="mocui-route-loading-title">${label}</div>
      <div class="mocui-route-loading-grid"><i></i><i></i><i></i><i></i></div>
      <div class="mocui-route-loading-row"></div><div class="mocui-route-loading-row short"></div>
    </section>`;
  }

  async function stableNavigate(route,params={},options={}){
    if(running){
      queued={route,params,options};
      return {queued:true};
    }

    running=true;
    document.documentElement.classList.add('mocui-nav-busy');
    showImmediateLoading(route);
    try{
      const result=await originalNavigate(route,params,options);
      // 页面已经完整渲染后只整理一次 UI，禁止 MutationObserver 持续搬动按钮。
      window.MocuiUIRefine?.run?.();
      return result;
    }finally{
      running=false;
      clearTransitionState();
      document.documentElement.classList.remove('mocui-nav-busy');

      const next=queued;
      queued=null;
      if(next){
        requestAnimationFrame(()=>{
          stableNavigate(next.route,next.params,next.options).catch(err=>{
            console.error('[mocui nav]',err);
            clearTransitionState();
          });
        });
      }
    }
  }

  window.navigate=stableNavigate;

  const recover=()=>{ if(!running) clearTransitionState(); };
  window.addEventListener('pageshow',recover,{passive:true});
  window.addEventListener('focus',recover,{passive:true});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(recover,60); },{passive:true});

  window.MocuiNavigationStability={version:VERSION};
})();
