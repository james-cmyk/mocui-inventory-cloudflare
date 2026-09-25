'use strict';

(function(){
  const VERSION='4.2.3';
  const originalRenderDashboard423=renderDashboard;
  const originalRenderMore423=renderMore;
  const originalRenderSales423=renderSales;
  const originalRenderPassDeals423=renderPassDeals;
  const originalRenderExternalGoods423=renderExternalGoods;

  function activeFormalSale423(s){
    if(typeof saleIsHistorical==='function'&&saleIsHistorical(s))return false;
    if(typeof saleIsReportActive==='function')return saleIsReportActive(s);
    return s?.status==='active'&&!s?.excludedFromReports;
  }
  function saleDue423(s){return activeFormalSale423(s)?Math.max(0,n(s?.finalAmount)-n(s?.received)):0;}
  function dayAge423(value){
    const d=new Date(value||0);if(Number.isNaN(d.getTime()))return 0;
    const a=new Date(d.getFullYear(),d.getMonth(),d.getDate());const now=new Date(),b=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    return Math.max(0,Math.floor((b-a)/86400000));
  }
  function localDay423(value=new Date()){
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
    const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function settlementEvents423(row){return Array.isArray(row?.settlementEvents)?row.settlementEvents:[];}
  function itemNames423(items){return (items||[]).slice(0,2).map(i=>i.productName||i.name).filter(Boolean).join('、')+((items||[]).length>2?'…':'');}

  async function collectSettlement423(){
    const [sales,passes,external]=await Promise.all([
      dbAll('sales'),
      typeof getPassDeals==='function'?getPassDeals():Promise.resolve([]),
      typeof getExternalGoods==='function'?getExternalGoods():Promise.resolve([])
    ]);
    const receivables=[],payables=[],events=[];
    for(const s of sales){
      const due=saleDue423(s);
      if(due>0.005)receivables.push({kind:'sale',id:s.id,direction:'receive',person:String(s.customerName||'散客').trim()||'散客',amount:due,total:n(s.finalAmount),settled:n(s.received),ref:s.orderNo||'销售单',title:itemNames423(s.items)||'正式销售',date:s.createdAt||s.updatedAt||'',age:dayAge423(s.createdAt),raw:s});
      for(const e of settlementEvents423(s))events.push({...e,kind:'sale',recordId:s.id,ref:s.orderNo||'销售单',person:e.person||s.customerName||'散客',title:itemNames423(s.items)||'正式销售'});
    }
    for(const r of passes||[]){
      if(typeof passDealIsActive==='function'&&!passDealIsActive(r))continue;
      const recv=typeof passDealBuyerDue==='function'?passDealBuyerDue(r):Math.max(0,n(r.saleAmount)-n(r.receivedAmount));
      const pay=typeof passDealSourceDue==='function'?passDealSourceDue(r):Math.max(0,n(r.costAmount)-n(r.sourcePaidAmount));
      if(recv>0.005)receivables.push({kind:'pass',id:r.id,direction:'receive',person:String(r.buyerName||'未填写买家').trim(),amount:recv,total:n(r.saleAmount),settled:n(r.receivedAmount),ref:r.dealNo||'过手单',title:r.itemName||'过手货',date:r.createdAt||r.updatedAt||'',age:dayAge423(r.createdAt),raw:r});
      if(pay>0.005)payables.push({kind:'pass',id:r.id,direction:'pay',person:String(r.sourceName||'未填写货主').trim(),amount:pay,total:n(r.costAmount),settled:n(r.sourcePaidAmount),ref:r.dealNo||'过手单',title:r.itemName||'过手货',date:r.createdAt||r.updatedAt||'',age:dayAge423(r.createdAt),raw:r});
      for(const e of settlementEvents423(r))events.push({...e,kind:'pass',recordId:r.id,ref:r.dealNo||'过手单',person:e.person||(e.type==='pay'?r.sourceName:r.buyerName)||'',title:r.itemName||'过手货'});
    }
    for(const r of external||[]){
      if(r.status!=='sold'){
        for(const e of settlementEvents423(r))events.push({...e,kind:'external',recordId:r.id,ref:r.tempNo||'外部货',person:e.person||'',title:r.itemName||'外部货'});
        continue;
      }
      const recv=typeof externalBuyerDue==='function'?externalBuyerDue(r):Math.max(0,n(r.saleAmount)-n(r.receivedAmount));
      const pay=typeof externalOwnerDue==='function'?externalOwnerDue(r):Math.max(0,n(r.ownerCostAmount)-n(r.ownerPaidAmount));
      if(recv>0.005)receivables.push({kind:'external',id:r.id,direction:'receive',person:String(r.buyerName||r.currentHolderName||'未填写买家').trim(),amount:recv,total:n(r.saleAmount),settled:n(r.receivedAmount),ref:r.tempNo||'外部货',title:r.itemName||'外部货',date:r.soldAt||r.updatedAt||r.createdAt||'',age:dayAge423(r.soldAt||r.updatedAt||r.createdAt),raw:r});
      if(pay>0.005)payables.push({kind:'external',id:r.id,direction:'pay',person:String(r.ownerName||'未填写货主').trim(),amount:pay,total:n(r.ownerCostAmount),settled:n(r.ownerPaidAmount),ref:r.tempNo||'外部货',title:r.itemName||'外部货',date:r.soldAt||r.updatedAt||r.createdAt||'',age:dayAge423(r.soldAt||r.updatedAt||r.createdAt),raw:r});
      for(const e of settlementEvents423(r))events.push({...e,kind:'external',recordId:r.id,ref:r.tempNo||'外部货',person:e.person||(e.type==='pay'?r.ownerName:r.buyerName)||'',title:r.itemName||'外部货'});
    }
    receivables.sort((a,b)=>b.age-a.age||new Date(a.date)-new Date(b.date));
    payables.sort((a,b)=>b.age-a.age||new Date(a.date)-new Date(b.date));
    events.sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0));
    return {receivables,payables,events};
  }

  function sourceName423(kind){return ({sale:'销售',pass:'过手',external:'外部货'}[kind]||kind);}
  function dueRow423(r){
    return `<div class="settle423-row" data-kind="${esc(r.kind)}" data-id="${esc(r.id)}" data-direction="${r.direction}"><div class="settle423-row-main"><div class="settle423-row-top"><span class="settle423-source">${sourceName423(r.kind)}</span><strong>${esc(r.person)}</strong><em>${r.age?`未结 ${r.age} 天`:'今日成交'}</em></div><div class="settle423-row-title">${esc(r.title)} · ${esc(r.ref)}</div><small>总额 ${fmtMoney(r.total)} · 已${r.direction==='receive'?'收':'付'} ${fmtMoney(r.settled)}</small></div><div class="settle423-row-side"><b>${fmtMoney(r.amount)}</b><button class="settle423-action ${r.direction==='pay'?'pay':''}" type="button">${r.direction==='receive'?'收款':'付款'}</button></div></div>`;
  }

  function groupPeople423(receivables,payables){
    const map=new Map();
    const add=(r,key)=>{const name=r.person||'未填写';let p=map.get(name);if(!p){p={name,receive:0,pay:0,receiveCount:0,payCount:0,rows:[]};map.set(name,p);}p[key]+=r.amount;p[key+'Count']++;p.rows.push(r);};
    receivables.forEach(r=>add(r,'receive'));payables.forEach(r=>add(r,'pay'));
    return [...map.values()].sort((a,b)=>(b.receive+b.pay)-(a.receive+a.pay));
  }

  function peopleRow423(p){
    return `<button class="settle423-person" type="button" data-person="${esc(p.name)}"><div><strong>${esc(p.name)}</strong><small>${p.receiveCount} 笔待收 · ${p.payCount} 笔待付</small></div><div><span>待收 <b>${fmtMoney(p.receive)}</b></span><span>待付 <b>${fmtMoney(p.pay)}</b></span><em>›</em></div></button>`;
  }

  function eventRow423(e){
    const isPay=e.type==='pay';return `<div class="settle423-event"><span class="${isPay?'pay':'receive'}">${isPay?'付款':'收款'}</span><div><strong>${esc(e.person||'未填写')} · ${esc(e.ref||'')}</strong><small>${esc(e.title||'')} · ${fmtDateTime(e.date||e.createdAt)}${e.note?` · ${esc(e.note)}`:''}</small></div><b>${isPay?'-':'+'}${fmtMoney(e.amount)}</b></div>`;
  }

  async function openSettlementCenter423(initialMode='receive',personFilter=''){
    const data=await collectSettlement423(),people=groupPeople423(data.receivables,data.payables);let mode=initialMode,query=personFilter||'';
    const recvTotal=data.receivables.reduce((s,r)=>s+r.amount,0),payTotal=data.payables.reduce((s,r)=>s+r.amount,0),today=localDay423();
    const todayEvents=data.events.filter(e=>localDay423(e.date||e.createdAt)===today),todayReceived=todayEvents.filter(e=>e.type!=='pay').reduce((s,e)=>s+n(e.amount),0),todayPaid=todayEvents.filter(e=>e.type==='pay').reduce((s,e)=>s+n(e.amount),0);
    openModal('收付款与对账',`<div class="settle423-center"><div class="settle423-summary"><div><span>待收</span><strong>${fmtMoney(recvTotal)}</strong><small>${data.receivables.length} 笔</small></div><div><span>待付</span><strong>${fmtMoney(payTotal)}</strong><small>${data.payables.length} 笔</small></div><div><span>今日补收</span><strong>${fmtMoney(todayReceived)}</strong></div><div><span>今日补付</span><strong>${fmtMoney(todayPaid)}</strong></div></div><div class="settle423-note">应收和应付分别保留，不自动互相冲抵。即使是同一个同行，只有双方明确同意抵账时才应另行记录。</div><div class="settle423-search"><span>⌕</span><input id="settle423Search" value="${esc(query)}" placeholder="姓名 / 单号 / 货品"><button id="settle423Clear" type="button">×</button></div><div class="settle423-tabs"><button data-mode="receive" class="${mode==='receive'?'active':''}">待收 ${data.receivables.length}</button><button data-mode="pay" class="${mode==='pay'?'active':''}">待付 ${data.payables.length}</button><button data-mode="people" class="${mode==='people'?'active':''}">按人对账</button><button data-mode="history" class="${mode==='history'?'active':''}">结算记录</button></div><div id="settle423Body"></div></div>`,{full:true,onOpen:()=>{
      const input=$('#settle423Search'),body=$('#settle423Body');
      const draw=()=>{query=input.value.trim();const match=r=>!query||searchable423(query,r.person,r.ref,r.title,sourceName423(r.kind));
        if(mode==='receive'){const rows=data.receivables.filter(match);body.innerHTML=rows.length?rows.map(dueRow423).join(''):`<div class="settle423-empty">没有待收款。</div>`;}
        else if(mode==='pay'){const rows=data.payables.filter(match);body.innerHTML=rows.length?rows.map(dueRow423).join(''):`<div class="settle423-empty">没有待付款。</div>`;}
        else if(mode==='people'){const rows=people.filter(p=>!query||searchable423(query,p.name));body.innerHTML=rows.length?rows.map(peopleRow423).join(''):`<div class="settle423-empty">没有匹配的往来人。</div>`;}
        else {const rows=data.events.filter(e=>!query||searchable423(query,e.person,e.ref,e.title,e.note)).slice(0,120);body.innerHTML=rows.length?rows.map(eventRow423).join(''):`<div class="settle423-empty"><strong>暂无补收/补付记录</strong><span>旧数据的开单时实收仍保留在原业务单，本页从 v4.2.3 开始记录后续收付款明细。</span></div>`;}
        $$('.settle423-action',body).forEach(btn=>btn.onclick=()=>{const row=btn.closest('.settle423-row');openSettlementEntry423(row.dataset.kind,row.dataset.id,row.dataset.direction);});
        $$('.settle423-person',body).forEach(btn=>btn.onclick=()=>openPersonStatement423(btn.dataset.person));
      };
      input.oninput=draw;$('#settle423Clear').onclick=()=>{input.value='';draw();input.focus();};$$('.settle423-tabs button').forEach(btn=>btn.onclick=()=>{mode=btn.dataset.mode;$$('.settle423-tabs button').forEach(x=>x.classList.toggle('active',x===btn));draw();});draw();
    }});
  }

  function searchable423(q,...fields){
    if(typeof mocuiFuzzyMatch==='function')return mocuiFuzzyMatch(q,...fields);
    const x=String(q||'').toLowerCase();return fields.some(v=>String(v||'').toLowerCase().includes(x));
  }

  async function currentSettlementRow423(kind,id,direction){
    if(kind==='sale'){
      const r=await dbGet('sales',id);if(!r)return null;return {kind,id,direction,person:r.customerName||'散客',ref:r.orderNo||'销售单',title:itemNames423(r.items)||'正式销售',due:saleDue423(r),row:r};
    }
    if(kind==='pass'){
      const r=await getPassDeal(id);if(!r)return null;return {kind,id,direction,person:direction==='pay'?r.sourceName:r.buyerName,ref:r.dealNo||'过手单',title:r.itemName||'过手货',due:direction==='pay'?passDealSourceDue(r):passDealBuyerDue(r),row:r};
    }
    if(kind==='external'){
      const r=await getExternalGood(id);if(!r)return null;return {kind,id,direction,person:direction==='pay'?r.ownerName:(r.buyerName||r.currentHolderName),ref:r.tempNo||'外部货',title:r.itemName||'外部货',due:direction==='pay'?externalOwnerDue(r):externalBuyerDue(r),row:r};
    }
    return null;
  }

  async function openSettlementEntry423(kind,id,direction){
    const current=await currentSettlementRow423(kind,id,direction);if(!current||current.due<=0.005){showToast('这笔已经结清');openSettlementCenter423(direction==='pay'?'pay':'receive');return;}
    const verb=direction==='pay'?'付款':'收款';
    openModal(`${verb} · ${current.ref}`,`<form id="settle423EntryForm"><div class="notice">${esc(current.person)} · ${esc(current.title)}<br>当前待${direction==='pay'?'付':'收'} <strong>${fmtMoney(current.due)}</strong>。本操作只更新结算金额和留痕，不改变库存。</div><div class="form-group"><label class="form-label">本次${verb}金额 *</label><input id="settle423Amount" class="input" type="number" inputmode="decimal" min="0.01" step="0.01" max="${current.due}" value="${current.due.toFixed(2)}" required></div><div class="form-group"><label class="form-label">${verb}时间</label><input id="settle423Date" class="input" type="datetime-local" value="${localInputDateTime()}"></div><div class="form-group"><label class="form-label">备注</label><textarea id="settle423Note" class="textarea" placeholder="如：微信转账、现金、分两次结清"></textarea></div><div class="settle423-entry-actions"><button id="settle423FillAll" class="btn secondary" type="button">填入全部待${direction==='pay'?'付':'收'}</button><button class="btn" type="submit">确认${verb}</button></div></form>`,{onOpen:()=>{
      $('#settle423FillAll').onclick=()=>{$('#settle423Amount').value=current.due.toFixed(2);};
      $('#settle423EntryForm').onsubmit=async e=>{e.preventDefault();const amount=n($('#settle423Amount').value),date=$('#settle423Date').value,note=$('#settle423Note').value.trim();if(amount<=0){showToast('金额必须大于 0');return;}const fresh=await currentSettlementRow423(kind,id,direction);if(!fresh){showToast('原业务单不存在');return;}if(amount-fresh.due>0.005){showToast(`本次金额不能超过当前待${direction==='pay'?'付':'收'} ${fmtMoney(fresh.due)}`);return;}if(!date||Number.isNaN(new Date(date).getTime())){showToast('请选择有效时间');return;}const btn=e.submitter;if(btn?.dataset.submitting==='1')return;setCoreButtonBusy(btn,true,'正在保存…',`确认${verb}`);try{await applySettlement423(fresh,amount,new Date(date).toISOString(),note);closeModal();showToast(`${verb}已记录：${fmtMoney(amount)}`);setTimeout(()=>openSettlementCenter423(direction==='pay'?'pay':'receive',fresh.person),220);}catch(err){showToast(err?.message||'保存失败');if(btn&&document.body.contains(btn))setCoreButtonBusy(btn,false,'',`确认${verb}`);}};
    }});
  }

  async function applySettlement423(current,amount,date,note){
    const event={id:uid('settle'),type:current.direction==='pay'?'pay':'receive',amount:n(amount),date,note:note||'',person:current.person,createdAt:nowISO(),version:VERSION};
    if(current.kind==='sale'){
      const row=await dbGet('sales',current.id);if(!row||!activeFormalSale423(row))throw new Error('销售单当前不可结算');const due=saleDue423(row);if(amount-due>0.005)throw new Error('待收金额已经变化，请重新确认');const before={received:n(row.received),due};row.received=n(row.received)+n(amount);row.settlementEvents=[...settlementEvents423(row),event];row.updatedAt=nowISO();await dbPut('sales',row);await writeAudit('sale.receive','sale',row.id,`${row.orderNo} 补收 ${fmtMoney(amount)}`,before,{received:row.received,due:saleDue423(row),event});return;
    }
    if(current.kind==='pass'){
      const row=await getPassDeal(current.id);if(!row||!passDealIsActive(row))throw new Error('过手单当前不可结算');const due=current.direction==='pay'?passDealSourceDue(row):passDealBuyerDue(row);if(amount-due>0.005)throw new Error('待结金额已经变化，请重新确认');const before={receivedAmount:n(row.receivedAmount),sourcePaidAmount:n(row.sourcePaidAmount)};if(current.direction==='pay')row.sourcePaidAmount=n(row.sourcePaidAmount)+n(amount);else row.receivedAmount=n(row.receivedAmount)+n(amount);row.settlementEvents=[...settlementEvents423(row),event];row.updatedAt=nowISO();await putPassDeal(row);await writeAudit(current.direction==='pay'?'passdeal.pay':'passdeal.receive','passDeal',row.id,`${row.dealNo} ${current.direction==='pay'?'付货主':'收买家'} ${fmtMoney(amount)}`,before,{receivedAmount:row.receivedAmount,sourcePaidAmount:row.sourcePaidAmount,event});return;
    }
    if(current.kind==='external'){
      const row=await getExternalGood(current.id);if(!row||row.status!=='sold')throw new Error('外部货当前不可结算');const due=current.direction==='pay'?externalOwnerDue(row):externalBuyerDue(row);if(amount-due>0.005)throw new Error('待结金额已经变化，请重新确认');const before={receivedAmount:n(row.receivedAmount),ownerPaidAmount:n(row.ownerPaidAmount)};if(current.direction==='pay')row.ownerPaidAmount=n(row.ownerPaidAmount)+n(amount);else row.receivedAmount=n(row.receivedAmount)+n(amount);row.settlementEvents=[...settlementEvents423(row),event];row.updatedAt=nowISO();await putExternalGood(row);await writeAudit(current.direction==='pay'?'external.pay_owner':'external.receive','externalGood',row.id,`${row.tempNo} ${current.direction==='pay'?'付货主':'收买家'} ${fmtMoney(amount)}`,before,{receivedAmount:row.receivedAmount,ownerPaidAmount:row.ownerPaidAmount,event});return;
    }
    throw new Error('暂不支持这类结算');
  }

  async function openPersonStatement423(name){
    const data=await collectSettlement423(),recv=data.receivables.filter(r=>r.person===name),pay=data.payables.filter(r=>r.person===name),events=data.events.filter(e=>String(e.person||'')===name).slice(0,40),recvTotal=recv.reduce((s,r)=>s+r.amount,0),payTotal=pay.reduce((s,r)=>s+r.amount,0),net=recvTotal-payTotal;
    const summary=`${name} 对账摘要\n待收：${fmtMoney(recvTotal)}（${recv.length}笔）\n待付：${fmtMoney(payTotal)}（${pay.length}笔）\n净额参考：${net>=0?'对方净应付你 ':'你净应付对方 '}${fmtMoney(Math.abs(net))}\n注意：应收应付未自动冲抵，请以双方实际确认的单据和转账为准。`;
    openModal(`${name} · 对账`,`<div class="settle423-statement"><div class="settle423-statement-summary"><div><span>待收</span><strong>${fmtMoney(recvTotal)}</strong><small>${recv.length} 笔</small></div><div><span>待付</span><strong>${fmtMoney(payTotal)}</strong><small>${pay.length} 笔</small></div><div><span>净额参考</span><strong class="${net>=0?'receive':'pay'}">${net>=0?'+':'-'}${fmtMoney(Math.abs(net))}</strong><small>仅参考，不自动抵账</small></div></div><div class="settle423-note">同一人的待收和待付仍是两类独立款项。除非双方明确确认抵账，否则不要直接按净额结算。</div><div class="settle423-section-title">待收明细</div>${recv.length?recv.map(dueRow423).join(''):'<div class="settle423-empty">无待收。</div>'}<div class="settle423-section-title">待付明细</div>${pay.length?pay.map(dueRow423).join(''):'<div class="settle423-empty">无待付。</div>'}<div class="settle423-section-title">最近结算记录</div>${events.length?events.map(eventRow423).join(''):'<div class="settle423-empty">暂无 v4.2.3 之后的补收/补付记录。</div>'}<button id="settle423CopyStatement" class="btn secondary block" type="button">复制对账摘要</button></div>`,{full:true,onOpen:()=>{
      $$('.settle423-action').forEach(btn=>btn.onclick=()=>{const row=btn.closest('.settle423-row');openSettlementEntry423(row.dataset.kind,row.dataset.id,row.dataset.direction);});
      $('#settle423CopyStatement').onclick=async()=>{try{if(typeof copyText==='function')await copyText(summary);else await navigator.clipboard.writeText(summary);showToast('对账摘要已复制');}catch(_){showToast('复制失败，请手动选择文本');}};
    }});
  }

  async function enhanceDashboard423(){
    if(appState.route!=='dashboard')return;const card=$('#workflow42Receivables');if(!card)return;const data=await collectSettlement423(),recv=data.receivables.reduce((s,r)=>s+r.amount,0),pay=data.payables.reduce((s,r)=>s+r.amount,0);card.innerHTML=`<span class="workflow42-task-label">待结算</span><strong>${data.receivables.length+data.payables.length}</strong><small>待收 ${fmtMoney(recv)} · 待付 ${fmtMoney(pay)}</small>`;card.onclick=()=>openSettlementCenter423(recv>0?'receive':pay>0?'pay':'people');
  }

  async function enhanceMore423(){
    if(appState.route!=='more'||document.querySelector('#settle423MoreEntry'))return;const main=$('#main');if(!main)return;const sec=document.createElement('section');sec.id='settle423MoreEntry';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">收付款</div><div class="list"><div id="settle423MoreOpen" class="list-item clickable"><div class="thumb placeholder">¥</div><div class="item-main"><div class="item-title">收付款与对账</div><div class="item-meta">正式销售、过手、外部同行货的待收待付统一处理</div></div><div>›</div></div></div>`;const target=document.querySelector('#quick422MoreTools')||main.firstElementChild;target?.insertAdjacentElement('afterend',sec);$('#settle423MoreOpen').onclick=()=>openSettlementCenter423();
  }

  async function enhanceSales423(){
    if(appState.route!=='sales'||document.querySelector('#settle423SalesBar'))return;const sales=(await dbAll('sales')).filter(activeFormalSale423),due=sales.filter(s=>saleDue423(s)>0.005),total=due.reduce((a,s)=>a+saleDue423(s),0),main=$('#main');if(!main)return;const bar=document.createElement('button');bar.id='settle423SalesBar';bar.className='settle423-inline-bar';bar.type='button';bar.innerHTML=`<div><span>正式销售待收</span><strong>${fmtMoney(total)}</strong><small>${due.length} 笔未结清</small></div><b>进入结算中心 ›</b>`;const segment=$('#saleStatus');segment?.insertAdjacentElement('beforebegin',bar);bar.onclick=()=>openSettlementCenter423('receive');
    const map=new Map(sales.map(s=>[String(s.id),s]));$$('.sale-card[data-id]').forEach(card=>{const s=map.get(card.dataset.id),d=s?saleDue423(s):0;if(d<=0.005)return;const row=document.createElement('div');row.className='settle423-sale-due';row.innerHTML=`<span>待收 <strong>${fmtMoney(d)}</strong></span><button type="button">补收款</button>`;card.appendChild(row);$('button',row).onclick=e=>{e.stopPropagation();openSettlementEntry423('sale',s.id,'receive');};});
  }

  async function enhancePass423(){
    if(appState.route!=='pass-deals'||document.querySelector('#settle423PassBar'))return;const rows=(await getPassDeals()).filter(passDealIsActive),recv=rows.reduce((s,r)=>s+passDealBuyerDue(r),0),pay=rows.reduce((s,r)=>s+passDealSourceDue(r),0),main=$('#main');if(!main)return;const bar=document.createElement('button');bar.id='settle423PassBar';bar.className='settle423-inline-bar';bar.type='button';bar.innerHTML=`<div><span>过手待结算</span><strong>待收 ${fmtMoney(recv)}</strong><small>待付货主 ${fmtMoney(pay)}</small></div><b>处理 ›</b>`;const notice=main.querySelector('.notice');notice?.insertAdjacentElement('afterend',bar);bar.onclick=()=>openSettlementCenter423(recv>0?'receive':'pay');
  }

  async function enhanceExternal423(){
    if(appState.route!=='external-goods'||document.querySelector('#settle423ExternalBar'))return;const rows=(await getExternalGoods()).filter(r=>r.status==='sold'),recv=rows.reduce((s,r)=>s+externalBuyerDue(r),0),pay=rows.reduce((s,r)=>s+externalOwnerDue(r),0),main=$('#main');if(!main)return;const bar=document.createElement('button');bar.id='settle423ExternalBar';bar.className='settle423-inline-bar';bar.type='button';bar.innerHTML=`<div><span>已售外部货结算</span><strong>待收 ${fmtMoney(recv)}</strong><small>待付货主 ${fmtMoney(pay)}</small></div><b>处理 ›</b>`;const notice=main.querySelector('.notice');notice?.insertAdjacentElement('afterend',bar);bar.onclick=()=>openSettlementCenter423(recv>0?'receive':'pay');
  }

  renderDashboard=async function(){const r=await originalRenderDashboard423.apply(this,arguments);try{await enhanceDashboard423();}catch(e){console.warn('[v4.2.3 dashboard]',e);}return r;};
  renderMore=async function(){const r=await originalRenderMore423.apply(this,arguments);try{await enhanceMore423();}catch(e){console.warn('[v4.2.3 more]',e);}return r;};
  renderSales=async function(){const r=await originalRenderSales423.apply(this,arguments);try{await enhanceSales423();}catch(e){console.warn('[v4.2.3 sales]',e);}return r;};
  renderPassDeals=async function(){const r=await originalRenderPassDeals423.apply(this,arguments);try{await enhancePass423();}catch(e){console.warn('[v4.2.3 pass]',e);}return r;};
  renderExternalGoods=async function(){const r=await originalRenderExternalGoods423.apply(this,arguments);try{await enhanceExternal423();}catch(e){console.warn('[v4.2.3 external]',e);}return r;};

  window.MocuiSettlement423={version:VERSION,collect:collectSettlement423,open:openSettlementCenter423,openEntry:openSettlementEntry423,statement:openPersonStatement423};
})();
