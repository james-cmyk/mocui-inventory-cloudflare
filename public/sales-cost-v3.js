'use strict';
(() => {
  const VERSION='3.0.0';
  let installed=false;

  function money(v){return Number(v||0)}
  function draft(){
    if(!window.appState?.saleDraft)return null;
    const d=window.appState.saleDraft;
    if(d.accessoryCost==null)d.accessoryCost=0;
    if(d.otherDirectCost==null)d.otherDirectCost=0;
    return d;
  }
  function readFields(){
    const d=draft();if(!d)return;
    const a=document.querySelector('#saleAccessoryCost'),o=document.querySelector('#saleOtherCost');
    if(a)d.accessoryCost=Math.max(0,money(a.value));
    if(o)d.otherDirectCost=Math.max(0,money(o.value));
  }
  function saleProductCost(d){
    return (d?.items||[]).reduce((s,i)=>s+money(i.costPrice)*money(i.qty),0);
  }
  function injectSaleCostFields(){
    if(window.appState?.route!=='sale-new')return;
    const d=draft(),note=document.querySelector('#saleNote');
    if(!d||!note||document.querySelector('#mocuiSaleCostBlock'))return;
    const group=note.closest('.form-group');
    const box=document.createElement('div');
    box.id='mocuiSaleCostBlock';box.className='mocui-sale-cost-card';
    box.innerHTML=`
      <div class="mocui-sale-cost-title">本单附加成本</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">配饰成本</label><input id="saleAccessoryCost" class="input" type="number" min="0" step="0.01" value="${money(d.accessoryCost)}" placeholder="金扣、绳、珠子等"></div>
        <div class="form-group"><label class="form-label">其他直接成本</label><input id="saleOtherCost" class="input" type="number" min="0" step="0.01" value="${money(d.otherDirectCost)}" placeholder="加工、证书等"></div>
      </div>
      <div id="mocuiSaleProfitPreview" class="mocui-profit-preview"></div>`;
    group.insertAdjacentElement('beforebegin',box);
    const update=()=>{
      readFields();
      const totals=typeof calcSaleTotals==='function'?calcSaleTotals(d):{finalAmount:0};
      const product=saleProductCost(d),extra=money(d.accessoryCost)+money(d.otherDirectCost),profit=money(totals.finalAmount)-product-extra;
      document.querySelector('#mocuiSaleProfitPreview').innerHTML=`商品成本 <b>${fmtMoney(product)}</b>　附加成本 <b>${fmtMoney(extra)}</b>　预计毛利 <strong>${fmtMoney(profit)}</strong>`;
    };
    ['saleAccessoryCost','saleOtherCost'].forEach(id=>document.querySelector('#'+id).addEventListener('input',update));
    update();
  }

  function install(){
    if(installed||typeof window.renderSaleNew!=='function'||typeof window.dbPut!=='function')return false;
    installed=true;

    const oldRender=window.renderSaleNew;
    window.renderSaleNew=async function(...args){
      const result=await oldRender.apply(this,args);
      injectSaleCostFields();
      return result;
    };

    if(typeof window.syncSaleFormToDraft==='function'){
      const oldSync=window.syncSaleFormToDraft;
      window.syncSaleFormToDraft=function(...args){readFields();const r=oldSync.apply(this,args);readFields();return r};
    }

    const oldPut=window.dbPut;
    window.dbPut=async function(store,value,...rest){
      if(store==='sales'&&value&&value.status==='active'&&!value.importedHistorical){
        const d=draft();
        if(d){
          value.accessoryCost=Math.max(0,money(d.accessoryCost));
          value.otherDirectCost=Math.max(0,money(d.otherDirectCost));
          value.directExtraCost=value.accessoryCost+value.otherDirectCost;
        }else{
          value.accessoryCost=Math.max(0,money(value.accessoryCost));
          value.otherDirectCost=Math.max(0,money(value.otherDirectCost));
          value.directExtraCost=value.accessoryCost+value.otherDirectCost;
        }
      }
      return oldPut.call(this,store,value,...rest);
    };

    if(typeof window.saleCostTotal==='function'){
      const oldCost=window.saleCostTotal;
      window.saleCostTotal=function(sale){
        return oldCost(sale)+money(sale?.accessoryCost)+money(sale?.otherDirectCost);
      };
    }

    if(typeof window.openSaleDetail==='function'){
      const oldDetail=window.openSaleDetail;
      window.openSaleDetail=function(sale,...args){
        const result=oldDetail.call(this,sale,...args);
        setTimeout(()=>{
          const modal=document.querySelector('#modalRoot .modal-backdrop');
          if(!modal||modal.querySelector('#mocuiSaleCostDetail'))return;
          const total=modal.querySelector('.total-box');
          if(!total)return;
          const extra=money(sale?.accessoryCost)+money(sale?.otherDirectCost);
          const product=(sale?.items||[]).reduce((s,i)=>s+money(i.costPrice)*money(i.qty),0);
          const profit=money(sale?.finalAmount)-product-extra;
          const row=document.createElement('div');row.id='mocuiSaleCostDetail';row.className='mocui-sale-cost-detail';
          row.innerHTML=`<div><span>商品成本</span><b>${fmtMoney(product)}</b></div><div><span>配饰成本</span><b>${fmtMoney(sale?.accessoryCost)}</b></div><div><span>其他成本</span><b>${fmtMoney(sale?.otherDirectCost)}</b></div><div class="profit"><span>实际毛利</span><strong>${fmtMoney(profit)}</strong></div>`;
          total.insertAdjacentElement('afterend',row);
        },0);
        return result;
      };
    }

    if(window.appState?.route==='sale-new')injectSaleCostFields();
    return true;
  }
  const t=setInterval(()=>{if(install())clearInterval(t)},25);
  setTimeout(()=>clearInterval(t),10000);
})();
