'use strict';

(function(){
  const VERSION='4.4.7';
  const EPS=0.005;
  const $q=(s,r=document)=>r.querySelector(s);
  const $$q=(s,r=document)=>[...r.querySelectorAll(s)];
  const n=v=>Number(v||0);
  const money=v=>typeof fmtMoney==='function'?fmtMoney(n(v)):`¥${n(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const qty=v=>typeof fmtInt==='function'?fmtInt(n(v)):n(v).toLocaleString('zh-CN',{maximumFractionDigits:2});

  // ---------- 1. 新销售：禁止“实收 > 应收” ----------
  // 包在现有 v4.4.6/XHS 销售逻辑外层，不改库存扣减和销售落账实现。
  const baseSaveSale=typeof saveSale==='function'?saveSale:null;
  if(baseSaveSale){
    saveSale=async function(){
      try{ if(typeof syncSaleFormToDraft==='function')syncSaleFormToDraft(); }catch(_){/* 交给原逻辑处理 */}
      const draft=typeof appState!=='undefined'?appState?.saleDraft:null;
      const receivedInput=$q('#received');
      if(draft&&receivedInput&&typeof calcSaleTotals==='function'){
        const totals=calcSaleTotals(draft);
        const due=Math.max(0,n(totals?.finalAmount));
        const received=n(receivedInput.value);
        if(received>due+EPS){
          const msg=`本次实收 ${money(received)} 高于应收 ${money(due)}，请核对后再保存。`;
          if(typeof showFieldValidation==='function')showFieldValidation(msg,receivedInput);
          else if(typeof showToast==='function'){showToast(msg);try{receivedInput.focus();}catch(_){}}
          return;
        }
      }
      return baseSaveSale.apply(this,arguments);
    };
  }

  // ---------- 2. 报表：库存改读正式商品库；负应收拆成待收/多收 ----------
  function isHistoricalSale(s){
    return Boolean(s?.importedHistorical||s?.sourceType==='qinsilk_history'||(s?.source==='qinsilk'&&String(s?.sourceKey||'').startsWith('qinsilk:')));
  }
  function saleDate(s){
    const raw=String(s?.businessDate||s?.createdAt||'').trim();
    if(!raw)return null;
    const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00'):new Date(raw);
    return Number.isNaN(d.getTime())?null:d;
  }
  function dayStart(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
  function dayEnd(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);}
  function activeRange(){
    const btn=$q('#v316range button.active, #reportRange button.active');
    const key=btn?.dataset?.k||btn?.dataset?.range||'30d';
    const now=new Date();let start,end=dayEnd(now);
    if(key==='today')start=dayStart(now);
    else if(key==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);start=dayStart(d);end=dayEnd(d);}
    else if(key==='7d'){const d=new Date(now);d.setDate(d.getDate()-6);start=dayStart(d);}
    else if(key==='30d'){const d=new Date(now);d.setDate(d.getDate()-29);start=dayStart(d);}
    else if(key==='month')start=new Date(now.getFullYear(),now.getMonth(),1);
    else if(key==='year')start=new Date(now.getFullYear(),0,1);
    else if(key==='all'){start=new Date(0);end=new Date(8640000000000000);}
    else if(key==='custom'){
      // 旧报表自定义日期由内部状态维护，DOM 没有稳定字段；不猜日期。
      // 这种情况下只修实时库存，结算保持原报表值。
      return {key,custom:true,start:null,end:null};
    }else{start=new Date(0);end=new Date(8640000000000000);}
    return {key,custom:false,start,end};
  }
  function findMetricByLabel(label){
    for(const el of $$q('#main .metric')){
      const l=$q('.label',el);
      if(String(l?.textContent||'').trim()===label)return el;
    }
    return null;
  }
  function setMetricValue(label,value){
    const card=findMetricByLabel(label);if(!card)return;
    const el=$q('.value',card);if(el&&el.textContent!==String(value))el.textContent=String(value);
  }
  function setMetricHint(label,hint){
    const card=findMetricByLabel(label);if(!card)return;
    let el=$q('.hint',card);
    if(!el){el=document.createElement('div');el.className='hint';card.appendChild(el);}
    if(el.textContent!==hint)el.textContent=hint;
  }
  async function authoritativeInventory(){
    const products=await dbAll('products');
    const rows=(products||[]).filter(p=>!p.historicalOnly);
    return {
      count:rows.length,
      qty:rows.reduce((a,p)=>a+n(p.stock),0),
      cost:rows.reduce((a,p)=>a+n(p.stock)*n(p.costPrice),0)
    };
  }
  async function authoritativeSettlement(range){
    const sales=await dbAll('sales');
    const rows=(sales||[]).filter(s=>s?.status==='active'&&!s?.excludedFromReports).filter(s=>{
      if(range.custom)return false;
      const d=saleDate(s);return d&&d>=range.start&&d<=range.end;
    });
    let received=0,due=0,over=0;
    for(const s of rows){
      const finalAmount=Math.max(0,n(s.finalAmount));
      if(isHistoricalSale(s)){received+=finalAmount;continue;}
      const got=Math.max(0,n(s.received));
      received+=got;
      due+=Math.max(0,finalAmount-got);
      over+=Math.max(0,got-finalAmount);
    }
    return {received,due,over};
  }

  let patching=false,queued=false;
  async function patchReportAccuracy(){
    if(patching||typeof appState==='undefined'||appState?.route!=='reports')return;
    patching=true;
    try{
      const inv=await authoritativeInventory();
      setMetricValue('商品数量',qty(inv.count));
      setMetricValue('库存总数',qty(inv.qty));
      setMetricValue('库存成本',money(inv.cost));

      const range=activeRange();
      if(!range.custom&&findMetricByLabel('本期实收')){
        const st=await authoritativeSettlement(range);
        setMetricValue('本期实收',money(st.received));
        const parts=[`待收 ${money(st.due)}`];
        if(st.over>EPS)parts.push(`多收 ${money(st.over)}`);
        setMetricHint('本期实收',parts.join(' · '));
      }

      const note=$q('#v316body .notice, #reportBody .notice');
      if(note&&/统计口径/.test(note.textContent||'')&&!/实时商品库/.test(note.textContent||'')){
        note.innerHTML='<strong>统计口径：</strong>销售统计可使用可重建缓存；库存汇总与收款差额实时读取正式账本。';
      }
    }catch(e){console.warn('[v4.4.7 data accuracy]',e);}
    finally{patching=false;}
  }
  function queuePatch(){
    if(queued)return;queued=true;
    setTimeout(()=>{queued=false;patchReportAccuracy();},30);
  }
  function installObserver(){
    const main=$q('#main');if(!main||main.dataset.v447AccuracyObserver==='1')return;
    main.dataset.v447AccuracyObserver='1';
    new MutationObserver(queuePatch).observe(main,{childList:true,subtree:true,characterData:true});
    main.addEventListener('click',e=>{
      if(e.target.closest('#v316range button, #reportRange button'))setTimeout(queuePatch,90);
    },true);
  }

  const baseRenderReports=typeof renderReports==='function'?renderReports:null;
  if(baseRenderReports){
    renderReports=async function(){
      const result=await baseRenderReports.apply(this,arguments);
      installObserver();
      await patchReportAccuracy();
      return result;
    };
  }

  // 首页/其它页面进入报表后再兜底安装，避免加载顺序变化影响补丁。
  setTimeout(()=>{if(typeof appState!=='undefined'&&appState?.route==='reports'){installObserver();queuePatch();}},250);
  window.MocuiDataAccuracy447={version:VERSION,patchReportAccuracy};
})();
