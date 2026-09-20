'use strict';
(() => {
  const VERSION='3.1.5';

  function cleanProductRelations(){
    if(window.appState?.route!=='product-detail') return;
    const main=document.querySelector('#main'); if(!main)return;
    const sections=[...main.querySelectorAll('.mocui-product-relations')];
    if(sections.length<=1)return;
    const keep=sections[0];
    sections.slice(1).forEach(el=>el.remove());
    const seen=new Set();
    keep.querySelectorAll('[data-loan-id]').forEach(row=>{
      const id=String(row.dataset.loanId||'').trim();
      if(id&&seen.has(id))row.remove(); else if(id)seen.add(id);
    });
  }

  function renderCompactMore(){
    if(window.appState?.route!=='more')return false;
    const main=document.querySelector('#main'); if(!main)return false;
    if(main.dataset.moreV315==='1')return true;

    if(typeof setHeader==='function')setHeader('更多','常用工具');
    main.innerHTML=`
      <section class="mocui-more-v315">
        <div class="mocui-more-v315-grid">
          <button data-route="customers"><span>客</span><b>客户</b></button>
          <button data-route="sales"><span>单</span><b>销售单</b></button>
          <button data-route="stocktake"><span>盘</span><b>盘点</b></button>
          <button data-route="ledger"><span>流</span><b>流水</b></button>
          <button data-route="trade-gallery"><span>货</span><b>货源</b></button>
          <button data-route="settings"><span>设</span><b>设置</b></button>
        </div>
      </section>`;
    main.dataset.moreV315='1';
    main.querySelectorAll('[data-route]').forEach(el=>el.onclick=()=>navigate(el.dataset.route));
    return true;
  }

  function settleMore(){
    [0,80,180,350,700].forEach(ms=>setTimeout(()=>{
      if(window.appState?.route==='more')renderCompactMore();
    },ms));
  }

  // 直接监听“更多”主导航。这样不依赖 renderMore 是否被其他稳定层包装。
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('.bottom-nav [data-route="more"]');
    if(btn)settleMore();
  },true);

  // 从后台恢复或刷新时恰好停留在更多页，也执行一次。
  window.addEventListener('pageshow',settleMore,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)settleMore();},{passive:true});

  // 保留已经生效的商品详情去重。
  const oldDetail=window.renderProductDetail;
  if(typeof oldDetail==='function'&&!oldDetail.__v315){
    const wrapped=async function(...args){
      const r=await oldDetail.apply(this,args);
      cleanProductRelations();
      requestAnimationFrame(cleanProductRelations);
      setTimeout(cleanProductRelations,80);
      return r;
    };
    wrapped.__v315=true; window.renderProductDetail=wrapped;
  }

  // 首次载入
  settleMore();
  window.MocuiV315={version:VERSION,renderCompactMore,cleanProductRelations};
})();