'use strict';
(() => {
  const VERSION='3.1.4';

  function cleanProductRelations(){
    if(window.appState?.route!=='product-detail') return;
    const main=document.querySelector('#main');
    if(!main) return;
    const sections=[...main.querySelectorAll('.mocui-product-relations')];
    if(sections.length<=1) return;
    const keep=sections[0];
    sections.slice(1).forEach(el=>el.remove());
    const seen=new Set();
    keep.querySelectorAll('[data-loan-id]').forEach(row=>{
      const id=String(row.dataset.loanId||'').trim();
      if(id&&seen.has(id)) row.remove(); else if(id) seen.add(id);
    });
    keep.querySelectorAll('.overdue').forEach(el=>el.classList.remove('overdue'));
  }

  function renderCompactMore(){
    if(window.appState?.route!=='more') return;
    if(typeof setHeader==='function') setHeader('更多','常用工具');
    const main=document.querySelector('#main'); if(!main)return;
    const items=[
      ['customers','客户','客'],['sales','销售单','单'],['stocktake','盘点','盘'],
      ['ledger','流水','流'],['trade-gallery','货源','货'],['settings','设置','设']
    ];
    main.innerHTML=`<section class="mocui-more-v313"><div class="mocui-more-v313-grid">${
      items.map(([route,label,icon])=>`<button type="button" class="mocui-more-v313-btn" data-v313-route="${route}"><span class="mocui-more-v313-icon">${icon}</span><b>${label}</b></button>`).join('')
    }</div></section>`;
    main.querySelectorAll('[data-v313-route]').forEach(el=>el.onclick=()=>navigate(el.dataset.v313Route));
  }

  function install(){
    const original=window.render;
    if(typeof original!=='function'||original.__v314)return;
    const wrapped=async function(...args){
      const result=await original.apply(this,args);
      if(window.appState?.route==='product-detail')cleanProductRelations();
      if(window.appState?.route==='more')renderCompactMore();
      return result;
    };
    wrapped.__v314=true; window.render=wrapped;
  }
  install();
  window.MocuiV314={version:VERSION,cleanProductRelations,renderCompactMore};
})();