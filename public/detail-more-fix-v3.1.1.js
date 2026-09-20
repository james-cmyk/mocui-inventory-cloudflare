'use strict';
(() => {
  const VERSION='3.1.3';

  function cleanProductRelations(){
    if(window.appState?.route!=='product-detail') return;
    const main=document.querySelector('#main');
    if(!main) return;

    // business-flow 可能被多次增强：只保留第一份商品往来。
    const sections=[...main.querySelectorAll('#mocuiProductRelations,.mocui-product-relations')];
    const keep=sections[0];
    sections.slice(1).forEach(el=>el.remove());
    if(!keep) return;

    // 即使历史数据/增强脚本造成同一调借行重复，也按调借单 ID 再去重一次。
    const seen=new Set();
    keep.querySelectorAll('[data-loan-id]').forEach(row=>{
      const id=String(row.dataset.loanId||'').trim();
      if(!id) return;
      if(seen.has(id)) row.remove();
      else seen.add(id);
    });

    // 商品详情不做逾期红色；逾期状态只在调借页体现。
    keep.querySelectorAll('.overdue').forEach(el=>el.classList.remove('overdue'));

    // 清掉关系模块之后、库存流水之前可能残留的重复“商品往来/调借记录”增强块。
    const children=[...main.children];
    const k=children.indexOf(keep);
    const inv=children.findIndex((el,i)=>i>k && el.classList?.contains('section-title') && el.textContent.includes('库存流水'));
    const end=inv>=0?inv:children.length;
    for(let i=end-1;i>k;i--){
      const el=children[i], txt=(el.textContent||'').trim();
      if(el!==keep && (txt.startsWith('商品往来') || (txt.includes('调借记录')&&txt.includes('销售记录')))) el.remove();
    }
  }

  function renderCompactMore(){
    if(window.appState?.route!=='more') return;
    if(typeof setHeader==='function') setHeader('更多','常用工具');
    const main=document.querySelector('#main');
    if(!main) return;

    const items=[
      ['pass-deals','过手'],['trade-gallery','货源'],['customers','客户'],
      ['sales','销售单'],['stocktake','盘点'],['ledger','流水'],
      ['content','内容'],['shortcut-setup','快捷保存'],['qinsilk-import','秦丝导入'],
      ['settings','设置']
    ];

    main.innerHTML=`
      <section class="mocui-more-v313">
        <div class="mocui-more-v313-grid">
          ${items.map(([route,label])=>`<button type="button" class="mocui-more-v313-btn" data-v313-route="${route}">${label}</button>`).join('')}
        </div>
        <button type="button" id="mocuiMoreMaintenanceV313" class="mocui-more-v313-maint">维护工具 <span>›</span></button>
      </section>`;

    main.querySelectorAll('[data-v313-route]').forEach(el=>{
      el.onclick=()=>navigate(el.dataset.v313Route);
    });
    const maintenance=main.querySelector('#mocuiMoreMaintenanceV313');
    if(maintenance) maintenance.onclick=()=>{
      openModal('维护工具',`
        <div class="list">
          <div class="list-item clickable v313-maint-route" data-route="health"><div class="item-main"><div class="item-title">库存体检</div></div><div>›</div></div>
          <div class="list-item clickable v313-maint-route" data-route="audit"><div class="item-main"><div class="item-title">操作日志</div></div><div>›</div></div>
        </div>`,{onOpen:()=>document.querySelectorAll('.v313-maint-route').forEach(el=>el.onclick=()=>{closeModal();navigate(el.dataset.route);})});
    };
  }

  function patch(){
    if(typeof window.renderProductDetail==='function' && !window.renderProductDetail.__v313){
      const original=window.renderProductDetail;
      const wrapped=async function(...args){
        const result=await original.apply(this,args);
        cleanProductRelations();
        requestAnimationFrame(cleanProductRelations);
        setTimeout(cleanProductRelations,50);
        return result;
      };
      wrapped.__v313=true;
      window.renderProductDetail=wrapped;
    }

    if(typeof window.renderMore==='function' && !window.renderMore.__v313){
      const original=window.renderMore;
      const wrapped=async function(...args){
        const result=await original.apply(this,args);
        renderCompactMore();
        return result;
      };
      wrapped.__v313=true;
      window.renderMore=wrapped;
    }
  }

  patch();
  // 兼容脚本初始化顺序，同时不持续观察 DOM，避免之前按钮跳动问题。
  let tries=0;
  const timer=setInterval(()=>{
    patch();
    tries++;
    if(tries>40) clearInterval(timer);
  },50);

  window.MocuiV313={version:VERSION,cleanProductRelations,renderCompactMore};
})();