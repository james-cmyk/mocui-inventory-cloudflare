'use strict';
(() => {
  const VERSION='3.1.6';

  function fixProductRelations(){
    if(window.appState?.route!=='product-detail') return;
    const main=document.querySelector('#main');
    if(!main) return;
    const sections=[...main.querySelectorAll('.mocui-product-relations')];
    if(sections.length<=1) return;
    sections.slice(1).forEach(el=>el.remove());
  }

  function compactMore(){
    if(window.appState?.route!=='more') return;
    const main=document.querySelector('#main');
    if(!main) return;

    // 只有旧“更多”长列表真正出现后才替换，避免和 renderMore 抢执行顺序。
    if(!main.querySelector('.more-group')) return;

    if(typeof setHeader==='function') setHeader('更多','常用工具');
    main.innerHTML=`
      <section class="mocui-more-v316">
        <div class="mocui-more-v316-grid">
          <button type="button" data-route="customers"><span>客</span><b>客户</b></button>
          <button type="button" data-route="sales"><span>单</span><b>销售单</b></button>
          <button type="button" data-route="stocktake"><span>盘</span><b>盘点</b></button>
          <button type="button" data-route="ledger"><span>流</span><b>流水</b></button>
          <button type="button" data-route="trade-gallery"><span>货</span><b>货源</b></button>
          <button type="button" data-route="settings"><span>设</span><b>设置</b></button>
        </div>
      </section>`;
    main.querySelectorAll('[data-route]').forEach(el=>{
      el.onclick=()=>navigate(el.dataset.route);
    });
  }

  function apply(){
    fixProductRelations();
    compactMore();
  }

  function start(){
    const main=document.querySelector('#main');
    if(!main) return;

    // 关键修复：观察“原页面完成渲染”这个事实，而不是猜 80/180/700ms。
    // 替换成长列表后 observer 会再触发一次，但此时没有 .more-group，因此不会循环。
    const observer=new MutationObserver(()=>requestAnimationFrame(apply));
    observer.observe(main,{childList:true,subtree:false});
    apply();

    window.addEventListener('pageshow',apply,{passive:true});
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden) requestAnimationFrame(apply);
    },{passive:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }

  window.MocuiV316={version:VERSION,apply};
})();