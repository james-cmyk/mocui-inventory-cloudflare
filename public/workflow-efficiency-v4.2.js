'use strict';

(function(){
  const VERSION='4.2.0';
  const QUOTE_LIMIT=120;

  const originalRenderDashboard=renderDashboard;
  const originalRenderProductDetail=renderProductDetail;

  renderDashboard=async function(){
    const result=await originalRenderDashboard.apply(this,arguments);
    await workflow42EnhanceDashboard();
    return result;
  };

  renderProductDetail=async function(){
    const result=await originalRenderProductDetail.apply(this,arguments);
    await workflow42EnhanceProductDetail();
    return result;
  };

  function quoteRows(product){
    return Array.isArray(product?.workflowQuotes)?product.workflowQuotes:[];
  }
  function todayKey(){
    if(typeof localDateKey==='function')return localDateKey();
    const d=new Date(),off=d.getTimezoneOffset();
    return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function money0(v){
    return `¥${n(v).toLocaleString('zh-CN',{maximumFractionDigits:0})}`;
  }
  function quoteIsOpen(q){return (q?.status||'open')==='open';}
  function quoteFollowupDue(q){return quoteIsOpen(q)&&q?.nextFollowupDate&&q.nextFollowupDate<=todayKey();}
  function saleReceivable(s){return Math.max(0,n(s?.finalAmount)-n(s?.received));}
  function activeSale(s){return typeof saleIsReportActive==='function'?saleIsReportActive(s):s?.status!=='cancelled';}

  async function workflow42EnhanceDashboard(){
    if(appState.route!=='dashboard'||document.querySelector('#workflow42DailyPanel'))return;
    const main=$('#main');if(!main)return;
    const [products,sales,loans]=await Promise.all([dbAll('products'),dbAll('sales'),dbAll('loans')]);
    if(appState.route!=='dashboard'||document.querySelector('#workflow42DailyPanel'))return;

    const catalog=products.filter(p=>!p.historicalOnly);
    const openLends=loans.filter(l=>loanIsOpen(l)&&l.type==='lend');
    const overdue=openLends.filter(l=>loanOverdueDays(l)>0);
    const lendValue=openLends.reduce((sum,l)=>sum+(l.items||[]).reduce((s,i)=>s+n(i.costPrice)*Math.max(0,loanItemRemaining(l,i)),0),0);
    const dueQuotes=[];
    let openQuoteCount=0;
    catalog.forEach(p=>quoteRows(p).forEach(q=>{if(quoteIsOpen(q))openQuoteCount++;if(quoteFollowupDue(q))dueQuotes.push({product:p,quote:q});}));
    dueQuotes.sort((a,b)=>String(a.quote.nextFollowupDate).localeCompare(String(b.quote.nextFollowupDate))||new Date(a.quote.createdAt)-new Date(b.quote.createdAt));
    const receivables=sales.filter(s=>activeSale(s)&&saleReceivable(s)>0).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const receivableAmount=receivables.reduce((s,r)=>s+saleReceivable(r),0);
    const missingCost=catalog.filter(p=>n(p.stock)>0&&n(p.costPrice)<=0);

    const panel=document.createElement('section');
    panel.id='workflow42DailyPanel';panel.className='workflow42-panel';
    panel.innerHTML=`
      <div class="workflow42-panel-head"><div><div class="workflow42-kicker">今日工作台</div><h2>先处理该处理的事</h2></div><span>${esc(todayKey())}</span></div>
      <div class="workflow42-task-grid">
        <button class="workflow42-task" id="workflow42OpenLends" type="button"><span class="workflow42-task-label">已调出</span><strong>${openLends.length}</strong><small>${overdue.length?`${overdue.length} 单已超期 · `:''}货值 ${money0(lendValue)}</small></button>
        <button class="workflow42-task" id="workflow42DueQuotes" type="button"><span class="workflow42-task-label">待跟进</span><strong>${dueQuotes.length}</strong><small>${openQuoteCount} 条进行中报价</small></button>
        <button class="workflow42-task" id="workflow42Receivables" type="button"><span class="workflow42-task-label">待结算</span><strong>${receivables.length}</strong><small>待收 ${money0(receivableAmount)}</small></button>
        <button class="workflow42-task" id="workflow42MissingCost" type="button"><span class="workflow42-task-label">资料待补</span><strong>${missingCost.length}</strong><small>在手货成本未完整</small></button>
      </div>`;
    main.prepend(panel);
    $('#workflow42OpenLends').onclick=()=>navigate('loans');
    $('#workflow42DueQuotes').onclick=()=>workflow42OpenFollowups(dueQuotes);
    $('#workflow42Receivables').onclick=()=>workflow42OpenReceivables(receivables);
    $('#workflow42MissingCost').onclick=()=>workflow42OpenMissingCost(missingCost);
  }

  async function workflow42EnhanceProductDetail(){
    if(appState.route!=='product-detail'||document.querySelector('#workflow42ProductFlow'))return;
    const productId=appState.params.id;
    const [p,loans]=await Promise.all([dbGet('products',productId),dbAll('loans')]);
    if(!p||appState.route!=='product-detail'||appState.params.id!==productId)return;
    const main=$('#main'),firstCard=main?.querySelector('.card');if(!main||!firstCard)return;
    const activeProductLoans=loans.filter(l=>loanIsOpen(l)&&(l.items||[]).some(i=>i.productId===p.id&&loanItemRemaining(l,i)>0));
    const lendLoans=activeProductLoans.filter(l=>l.type==='lend');
    const quotes=quoteRows(p).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const latestQuote=quotes[0];
    const state=lendLoans.length?'已调出':n(p.stock)>0?'在手':'无库存';
    const stateHint=lendLoans.length?`${lendLoans.map(l=>l.person).filter(Boolean).slice(0,2).join('、')}${lendLoans.length>2?` 等${lendLoans.length}单`:''}`:n(p.stock)>0?`当前库存 ${fmtInt(p.stock)}`:'可查历史销售与流转';

    const flow=document.createElement('section');
    flow.id='workflow42ProductFlow';flow.className='workflow42-product-flow';
    flow.innerHTML=`
      <div class="workflow42-state-row"><div><span>当前状态</span><strong>${esc(state)}</strong><small>${esc(stateHint)}</small></div>${latestQuote?`<div class="workflow42-last-quote"><span>最近报价</span><strong>${fmtMoney(latestQuote.amount)}</strong><small>${esc(latestQuote.person||'未填写对象')} · ${fmtDateTime(latestQuote.createdAt)}</small></div>`:''}</div>
      <div class="workflow42-action-grid">
        <button id="workflow42Quote" type="button"><span>报价</span><small>记录对象与跟进</small></button>
        <button id="workflow42Lend" type="button" ${n(p.stock)<=0?'disabled':''}><span>调出</span><small>${n(p.stock)>0?'直接带入这件货':'当前无库存'}</small></button>
        <button id="workflow42Sell" class="primary" type="button"><span>成交</span><small>进入正式销售</small></button>
        <button id="workflow42Content" type="button"><span>内容</span><small>图片 / 发布素材</small></button>
      </div>
      <div class="workflow42-quote-block"><div class="workflow42-section-head"><strong>报价与跟进</strong><button id="workflow42AllQuotes" type="button">${quotes.length?`查看全部 ${quotes.length}`:'暂无记录'} ›</button></div>${workflow42QuotePreview(quotes)}</div>`;
    firstCard.insertAdjacentElement('afterend',flow);

    const oldSale=$('#productSale'),oldContent=$('#productContent');
    if(oldSale){oldSale.classList.add('workflow42-hidden-core-action');const parent=oldSale.parentElement;if(parent)parent.classList.add('workflow42-secondary-actions');}
    if(oldContent)oldContent.classList.add('workflow42-hidden-core-action');
    $('#workflow42Quote').onclick=()=>workflow42OpenQuote(p.id);
    $('#workflow42Lend').onclick=()=>workflow42StartLend(p.id);
    $('#workflow42Sell').onclick=()=>oldSale?oldSale.click():(()=>{appState.saleDraft=null;navigate('sale-new',{productId:p.id});})();
    $('#workflow42Content').onclick=()=>oldContent?oldContent.click():navigate('product-content',{id:p.id});
    $('#workflow42AllQuotes').onclick=()=>workflow42OpenProductQuotes(p.id);
  }

  function workflow42QuotePreview(quotes){
    if(!quotes.length)return '<div class="workflow42-empty">记录过一次报价后，这里会自动保留对象、金额和下次跟进日期。</div>';
    return quotes.slice(0,3).map(q=>`<div class="workflow42-quote-row"><div><strong>${esc(q.person||'未填写对象')}</strong><small>${fmtDateTime(q.createdAt)}${q.nextFollowupDate?` · 跟进 ${esc(q.nextFollowupDate)}`:''}</small></div><div><b>${fmtMoney(q.amount)}</b><span class="${quoteIsOpen(q)?'open':'done'}">${quoteIsOpen(q)?'跟进中':'已结束'}</span></div></div>`).join('');
  }

  async function workflow42OpenQuote(productId){
    const p=await dbGet('products',productId);if(!p)return;
    openModal('记录报价',`<form id="workflow42QuoteForm">
      <div class="notice">${esc(p.name)} · ${esc(p.code||'无编码')}<br>报价只做业务记录，不改变库存状态。</div>
      <div class="form-group"><label class="form-label">报价对象 *</label><input id="workflow42QuotePerson" class="input" placeholder="同行 / 客户姓名" required></div>
      <div class="form-row"><div class="form-group"><label class="form-label">报价金额 *</label><input id="workflow42QuoteAmount" class="input" type="number" inputmode="decimal" min="0" step="0.01" value="${n(p.salePrice)}" required></div><div class="form-group"><label class="form-label">下次跟进</label><input id="workflow42QuoteFollowup" class="input" type="date"></div></div>
      <div class="form-group"><label class="form-label">备注</label><textarea id="workflow42QuoteNote" class="textarea" placeholder="例如：对方觉得颜色合适，等圈口确认"></textarea></div>
      <button class="btn block" type="submit">保存报价记录</button>
    </form>`,{full:true,onOpen:()=>{
      $('#workflow42QuoteForm').onsubmit=async e=>{e.preventDefault();const person=$('#workflow42QuotePerson').value.trim(),amount=n($('#workflow42QuoteAmount').value);if(!person){showToast('请填写报价对象');return;}const current=await dbGet('products',productId);if(!current)return;const record={id:uid('quote'),person,amount,nextFollowupDate:$('#workflow42QuoteFollowup').value||'',note:$('#workflow42QuoteNote').value.trim(),status:'open',createdAt:nowISO(),updatedAt:nowISO()};current.workflowQuotes=[record,...quoteRows(current)].slice(0,QUOTE_LIMIT);current.updatedAt=nowISO();await dbPut('products',current);await writeAudit('product.quote','product',current.id,`${current.code||current.name} · ${person} · ${fmtMoney(amount)}`,null,record);closeModal();showToast('报价已记录');await renderProductDetail();};
    }});
  }

  async function workflow42StartLend(productId){
    const p=await dbGet('products',productId);if(!p)return;if(n(p.stock)<=0){showToast('当前没有可调出的库存');return;}
    appState.loanDraft={type:'lend',person:'',date:localInputDateTime(),expectedReturnDate:addDaysLocal(nowISO(),30),note:'',images:[],items:[{productId:p.id,productName:p.name,productCode:p.code,color:p.color||'',qty:1,stock:n(p.stock),image:p.image||'',salePrice:n(p.salePrice),costPrice:n(p.costPrice),productNote:p.note||''}]};
    clearLocalDraft('mocui_loan_draft_v1');
    await openLoanForm();
  }

  async function workflow42OpenProductQuotes(productId){
    const p=await dbGet('products',productId);if(!p)return;const quotes=quoteRows(p).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    openModal('报价与跟进',`<div class="workflow42-modal-list">${quotes.length?quotes.map(q=>workflow42QuoteModalRow(p,q)).join(''):emptyState('报','暂无报价记录','从商品详情点击“报价”开始记录')}</div>`,{full:true,onOpen:()=>workflow42BindQuoteActions(productId)});
  }

  function workflow42QuoteModalRow(product,q){
    return `<div class="workflow42-follow-row" data-quote-id="${esc(q.id)}"><div class="item-main"><div class="item-title">${esc(q.person||'未填写对象')} · ${fmtMoney(q.amount)}</div><div class="item-meta">${fmtDateTime(q.createdAt)}${q.nextFollowupDate?` · 跟进 ${esc(q.nextFollowupDate)}`:''}</div>${q.note?`<div class="item-meta">${esc(q.note)}</div>`:''}</div><div class="workflow42-row-actions">${quoteIsOpen(q)?'<button class="btn secondary small workflow42CloseQuote" type="button">结束</button>':'<span class="badge success">已结束</span>'}</div></div>`;
  }

  function workflow42BindQuoteActions(productId){
    $$('.workflow42CloseQuote').forEach(btn=>btn.onclick=async()=>{const row=btn.closest('[data-quote-id]'),quoteId=row?.dataset.quoteId,current=await dbGet('products',productId);if(!current)return;const q=quoteRows(current).find(x=>x.id===quoteId);if(!q)return;q.status='closed';q.closedAt=nowISO();q.updatedAt=nowISO();current.updatedAt=nowISO();await dbPut('products',current);await writeAudit('product.quote.close','product',current.id,`${current.code||current.name} 报价跟进已结束`,null,{quoteId});closeModal();showToast('已结束本次跟进');if(appState.route==='product-detail'&&appState.params.id===productId)await renderProductDetail();});
  }

  function workflow42OpenFollowups(rows){
    openModal('待跟进报价',`<div class="workflow42-modal-list">${rows.length?rows.map(({product,quote})=>`<div class="workflow42-follow-row" data-product-id="${esc(product.id)}"><div class="item-main"><div class="item-title">${esc(product.name)} · ${fmtMoney(quote.amount)}</div><div class="item-meta">${esc(quote.person||'未填写对象')} · 跟进 ${esc(quote.nextFollowupDate)}</div>${quote.note?`<div class="item-meta">${esc(quote.note)}</div>`:''}</div><button class="btn secondary small workflow42ViewProduct" type="button">查看</button></div>`).join(''):emptyState('✓','今天没有到期跟进','报价时填写“下次跟进”后会自动出现在这里')}</div>`,{full:true,onOpen:()=>$$('.workflow42ViewProduct').forEach(btn=>btn.onclick=()=>{const id=btn.closest('[data-product-id]')?.dataset.productId;closeModal();if(id)navigate('product-detail',{id});})});
  }

  function workflow42OpenReceivables(rows){
    const amount=rows.reduce((s,r)=>s+saleReceivable(r),0);
    openModal('待结算',`<div class="notice warn">${rows.length} 笔未结清 · 待收 ${fmtMoney(amount)}</div><div class="workflow42-modal-list">${rows.length?rows.map(s=>`<button class="workflow42-follow-row workflow42-sale-row" data-sale-id="${esc(s.id)}" type="button"><div class="item-main"><div class="item-title">${esc(s.customerName||'散客')} · ${esc(s.orderNo||'销售单')}</div><div class="item-meta">${fmtDateTime(s.createdAt)} · 成交 ${fmtMoney(s.finalAmount)} · 已收 ${fmtMoney(s.received)}</div></div><strong>${fmtMoney(saleReceivable(s))}</strong></button>`).join(''):emptyState('✓','没有待结算销售')}</div>`,{full:true,onOpen:()=>$$('.workflow42-sale-row').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.saleId;closeModal();navigate('sales',{highlight:id});})});
  }

  function workflow42OpenMissingCost(rows){
    openModal('资料待补',`<div class="notice">仅列出“有库存但成本为 0”的正式商品，避免利润统计失真。</div><div class="workflow42-modal-list">${rows.length?rows.map(p=>`<button class="workflow42-follow-row workflow42-product-row" data-product-id="${esc(p.id)}" type="button"><div class="item-main"><div class="item-title">${esc(p.name)}</div><div class="item-meta">${esc(p.code||'无编码')} · 库存 ${fmtInt(p.stock)}</div></div><span class="badge warn">补成本</span></button>`).join(''):emptyState('✓','没有成本待补商品')}</div>`,{full:true,onOpen:()=>$$('.workflow42-product-row').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.productId;closeModal();navigate('product-detail',{id});})});
  }

  async function enhanceCurrentRoute(){
    try{
      if(appState?.route==='dashboard')await workflow42EnhanceDashboard();
      else if(appState?.route==='product-detail')await workflow42EnhanceProductDetail();
    }catch(err){console.warn('[workflow42]',err);}
  }

  window.MocuiWorkflow42={version:VERSION,openQuote:workflow42OpenQuote,startLend:workflow42StartLend,refresh:enhanceCurrentRoute};
  setTimeout(enhanceCurrentRoute,120);
  window.addEventListener('pageshow',()=>setTimeout(enhanceCurrentRoute,80),{passive:true});
})();
