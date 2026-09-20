'use strict';
(() => {
  const VERSION='3.1.1';

  function dedupeProductDetail(){
    if(window.appState?.route!=='product-detail')return;
    const main=document.querySelector('#main');
    if(!main)return;

    // v2.3 的关系模块是唯一保留版本。旧详情页原生销售/调借块若存在则移除，
    // 同时处理历史增强脚本重复插入造成的多个“商品往来”。
    const rel=[...main.querySelectorAll('#mocuiProductRelations,.mocui-product-relations')];
    rel.slice(1).forEach(el=>el.remove());

    const keep=rel[0];
    if(!keep)return;

    // 只保留关系模块中的销售/调借；清除它后面、库存流水前重复的旧块。
    const children=[...main.children];
    const keepIndex=children.indexOf(keep);
    const inventoryIndex=children.findIndex((el,i)=>i>keepIndex && (
      (el.classList?.contains('section-title') && el.textContent.includes('库存流水')) ||
      el.querySelector?.('.section-title')?.textContent.includes('库存流水')
    ));
    const end=inventoryIndex>=0?inventoryIndex:children.length;

    for(let i=keepIndex+1;i<end;i++){
      const el=children[i];
      const txt=(el.textContent||'').trim();
      if(
        txt.includes('商品往来') ||
        txt.includes('销售记录') ||
        txt.includes('调借记录')
      ) el.remove();
    }

    // 商品详情不显示逾期红色；逾期提醒只属于调借页面。
    keep.querySelectorAll('.overdue').forEach(el=>el.classList.remove('overdue'));
  }

  function compactMore(){
    if(window.appState?.route!=='more')return;
    const main=document.querySelector('#main');
    if(!main||main.dataset.compactMore==='1')return;
    main.dataset.compactMore='1';

    if(typeof setHeader==='function')setHeader('更多','常用工具');

    const wanted=[
      ['pass-deals','过手'],
      ['trade-gallery','货源'],
      ['customers','客户'],
      ['sales','销售单'],
      ['stocktake','盘点'],
      ['ledger','流水'],
      ['content','内容'],
      ['shortcut-setup','快捷保存'],
      ['qinsilk-import','秦丝导入'],
      ['settings','设置']
    ];

    main.innerHTML=`
      <section class="mocui-more-compact">
        <div class="mocui-more-grid">
          ${wanted.map(([route,label])=>`<button class="mocui-more-tile" type="button" data-route="${route}"><span>${label}</span></button>`).join('')}
        </div>
        <button class="mocui-more-maintenance-toggle" type="button" id="mocuiMoreMaintenance">维护工具 <span>›</span></button>
      </section>`;

    main.querySelectorAll('[data-route]').forEach(el=>el.onclick=()=>navigate(el.dataset.route));
    document.querySelector('#mocuiMoreMaintenance').onclick=()=>{
      openModal('维护工具',`
        <div class="mocui-maintenance-menu">
          <button class="mocui-maintenance-route" data-route="health" type="button">库存体检 <span>›</span></button>
          <button class="mocui-maintenance-route" data-route="audit" type="button">操作日志 <span>›</span></button>
        </div>`,{
          onOpen:()=>document.querySelectorAll('.mocui-maintenance-route').forEach(el=>el.onclick=()=>{closeModal();navigate(el.dataset.route);})
        });
    };
  }

  function run(){
    dedupeProductDetail();
    compactMore();
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(run));
  const start=()=>{
    const main=document.querySelector('#main');
    if(main)observer.observe(main,{childList:true,subtree:false});
    run();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.MocuiDetailMoreFix={version:VERSION,run};
})();