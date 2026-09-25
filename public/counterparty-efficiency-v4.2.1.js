'use strict';

(function(){
  const VERSION='4.2.1';
  const originalRenderCustomers=renderCustomers;
  const originalRenderLoans=renderLoans;
  const originalRenderMore=renderMore;
  const originalRenderExternalGoods=renderExternalGoods;
  const originalRenderDashboard=renderDashboard;

  function normName(value){return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();}
  function displayName(value){return String(value||'').trim()||'未命名';}
  function safeDate(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?0:d.getTime();}
  function currentDateKey(){
    if(typeof localDateKey==='function')return localDateKey();
    const d=new Date(),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function isFormalReceivableSale(s){
    if(typeof saleIsReportActive==='function'&&!saleIsReportActive(s))return false;
    if(typeof saleIsHistorical==='function'&&saleIsHistorical(s))return false;
    return Math.max(0,n(s?.finalAmount)-n(s?.received))>0;
  }
  function saleDue(s){return isFormalReceivableSale(s)?Math.max(0,n(s.finalAmount)-n(s.received)):0;}
  function quoteOpen(q){return (q?.status||'open')==='open';}
  function quoteDue(q){return quoteOpen(q)&&q?.nextFollowupDate&&q.nextFollowupDate<=currentDateKey();}
  function quoteRows(p){return Array.isArray(p?.workflowQuotes)?p.workflowQuotes:[];}
  function activePassDeal(row){return typeof passDealIsActive==='function'?passDealIsActive(row):row?.status!=='cancelled';}
  function personKey(name){return normName(name);}

  function makePerson(name){
    return {
      key:personKey(name),name:displayName(name),customer:null,
      sales:[],loans:[],externalOwner:[],externalHolder:[],externalBuyer:[],passSource:[],passBuyer:[],quotes:[],
      currentHoldingRows:[],sourceOpenRows:[],settlementRows:[],recentEvents:[],
      currentHoldingQty:0,currentHoldingValue:0,sourceOpenValue:0,
      openQuoteCount:0,dueQuoteCount:0,receivable:0,payable:0,salesAmount:0,salesOrders:0,lastAt:0,overdueCount:0
    };
  }

  async function buildPeople(){
    const [customers,sales,loans,external,passDeals,products]=await Promise.all([
      dbAll('customers'),dbAll('sales'),dbAll('loans'),getExternalGoods(),getPassDeals(),dbAll('products')
    ]);
    const map=new Map();
    const ensure=name=>{
      const key=personKey(name);if(!key||key==='散客')return null;
      if(!map.has(key))map.set(key,makePerson(name));
      const p=map.get(key);if(String(name||'').trim().length>p.name.length)p.name=String(name).trim();return p;
    };
    customers.forEach(c=>{const p=ensure(c.name);if(p)p.customer=c;});
    sales.forEach(s=>{if(typeof saleIsReportActive==='function'&&!saleIsReportActive(s))return;const p=ensure(s.customerName);if(p)p.sales.push(s);});
    loans.forEach(l=>{const p=ensure(l.person);if(p)p.loans.push(l);});
    external.forEach(r=>{
      let p=ensure(r.ownerName);if(p)p.externalOwner.push(r);
      if(r.currentHolderName&&normName(r.currentHolderName)!==normName('本店')){p=ensure(r.currentHolderName);if(p)p.externalHolder.push(r);}
      if(r.buyerName){p=ensure(r.buyerName);if(p)p.externalBuyer.push(r);}
    });
    passDeals.filter(activePassDeal).forEach(d=>{
      let p=ensure(d.sourceName);if(p)p.passSource.push(d);
      p=ensure(d.buyerName);if(p)p.passBuyer.push(d);
    });
    products.filter(p=>!p.historicalOnly).forEach(product=>quoteRows(product).forEach(q=>{const p=ensure(q.person);if(p)p.quotes.push({product,quote:q});}));

    for(const p of map.values()){
      p.salesAmount=p.sales.reduce((s,row)=>s+n(row.finalAmount),0);p.salesOrders=p.sales.length;
      p.receivable+=p.sales.reduce((s,row)=>s+saleDue(row),0);
      p.loans.forEach(l=>{
        p.lastAt=Math.max(p.lastAt,safeDate(l.updatedAt||l.date||l.createdAt));
        if(l.type==='lend'&&loanIsOpen(l)){
          if(loanOverdueDays(l)>0)p.overdueCount++;
          (l.items||[]).forEach(i=>{const remain=Math.max(0,loanItemRemaining(l,i));if(!remain)return;const value=remain*n(i.costPrice);p.currentHoldingQty+=remain;p.currentHoldingValue+=value;p.currentHoldingRows.push({kind:'loan',loan:l,item:i,qty:remain,value});});
        }
      });
      p.externalHolder.forEach(r=>{
        p.lastAt=Math.max(p.lastAt,safeDate(r.updatedAt||r.createdAt));
        if(r.status==='out'){
          const value=n(r.ownerCostAmount);p.currentHoldingQty+=n(r.qty);p.currentHoldingValue+=value;p.currentHoldingRows.push({kind:'external',row:r,qty:n(r.qty),value});
          if(r.expectedReturnDate&&r.expectedReturnDate<currentDateKey())p.overdueCount++;
        }
      });
      p.externalBuyer.forEach(r=>{p.lastAt=Math.max(p.lastAt,safeDate(r.updatedAt||r.soldAt||r.createdAt));if(r.status==='sold')p.receivable+=typeof externalBuyerDue==='function'?externalBuyerDue(r):Math.max(0,n(r.saleAmount)-n(r.receivedAmount));});
      p.externalOwner.forEach(r=>{
        p.lastAt=Math.max(p.lastAt,safeDate(r.updatedAt||r.createdAt));
        if(r.status==='held'||r.status==='out'){p.sourceOpenValue+=n(r.ownerCostAmount);p.sourceOpenRows.push({kind:'external-owner',row:r,value:n(r.ownerCostAmount)});}
        if(r.status==='sold')p.payable+=typeof externalOwnerDue==='function'?externalOwnerDue(r):Math.max(0,n(r.ownerCostAmount)-n(r.ownerPaidAmount));
      });
      p.passBuyer.forEach(d=>{p.lastAt=Math.max(p.lastAt,safeDate(d.updatedAt||d.createdAt));p.receivable+=typeof passDealBuyerDue==='function'?passDealBuyerDue(d):Math.max(0,n(d.saleAmount)-n(d.receivedAmount));});
      p.passSource.forEach(d=>{p.lastAt=Math.max(p.lastAt,safeDate(d.updatedAt||d.createdAt));p.payable+=typeof passDealSourceDue==='function'?passDealSourceDue(d):Math.max(0,n(d.costAmount)-n(d.sourcePaidAmount));});
      p.quotes.forEach(x=>{p.lastAt=Math.max(p.lastAt,safeDate(x.quote.updatedAt||x.quote.createdAt));if(quoteOpen(x.quote))p.openQuoteCount++;if(quoteDue(x.quote))p.dueQuoteCount++;});
      p.sales.forEach(s=>p.lastAt=Math.max(p.lastAt,safeDate(s.updatedAt||s.createdAt)));
      if(p.customer)p.lastAt=Math.max(p.lastAt,safeDate(p.customer.updatedAt||p.customer.createdAt));
      p.roles=[];
      if(p.currentHoldingQty>0)p.roles.push('拿货同行');
      if(p.sourceOpenValue>0||p.externalOwner.length||p.passSource.length)p.roles.push('货主');
      if(p.sales.length||p.externalBuyer.length||p.passBuyer.length)p.roles.push('客户/买家');
      if(!p.roles.length)p.roles.push('联系人');
      p.priority=(p.overdueCount?100000:0)+(p.dueQuoteCount?50000:0)+(p.receivable>0?20000:0)+(p.payable>0?10000:0)+(p.currentHoldingValue>0?5000:0)+(p.sourceOpenValue>0?2500:0)+Math.min(2000,Math.floor(p.lastAt/1e10));
    }
    return [...map.values()].sort((a,b)=>b.priority-a.priority||b.lastAt-a.lastAt||a.name.localeCompare(b.name,'zh-CN'));
  }

  function peopleSummary(people){
    return {
      currentValue:people.reduce((s,p)=>s+p.currentHoldingValue,0),
      currentQty:people.reduce((s,p)=>s+p.currentHoldingQty,0),
      duePeople:people.filter(p=>p.dueQuoteCount>0).length,
      dueQuotes:people.reduce((s,p)=>s+p.dueQuoteCount,0),
      receivable:people.reduce((s,p)=>s+p.receivable,0),
      payable:people.reduce((s,p)=>s+p.payable,0)
    };
  }

  function roleTags(p){return p.roles.slice(0,3).map(x=>`<span>${esc(x)}</span>`).join('');}
  function personRow(p){
    const phone=p.customer?.phone||'';
    const attention=[];
    if(p.overdueCount)attention.push(`${p.overdueCount}笔超期`);
    if(p.dueQuoteCount)attention.push(`${p.dueQuoteCount}条待跟进`);
    if(p.receivable)attention.push(`待收 ${fmtMoney(p.receivable)}`);
    if(p.payable)attention.push(`待付 ${fmtMoney(p.payable)}`);
    return `<button type="button" class="counterparty-row" data-person-key="${esc(p.key)}">
      <div class="counterparty-avatar">${esc(p.name.slice(0,1))}</div>
      <div class="counterparty-main"><div class="counterparty-name-line"><strong>${esc(p.name)}</strong><div class="counterparty-tags">${roleTags(p)}</div></div><div class="counterparty-meta">${phone?esc(phone)+' · ':''}${p.currentHoldingQty?`在外 ${fmtInt(p.currentHoldingQty)}件 / ${fmtMoney(p.currentHoldingValue)}`:p.sourceOpenValue?`你的在手货源 ${fmtMoney(p.sourceOpenValue)}`:`历史成交 ${p.salesOrders}单 / ${fmtMoney(p.salesAmount)}`}</div>${attention.length?`<div class="counterparty-alert">${attention.map(esc).join(' · ')}</div>`:''}</div>
      <div class="counterparty-chevron">›</div>
    </button>`;
  }

  renderCustomers=async function(){
    setHeader('往来管理','同行 / 客户 / 货主 · 货、跟进和结算放在一起',{label:'＋',onClick:()=>openContactEditor('')});
    try{
      const people=await buildPeople(),sum=peopleSummary(people);
      $('#main').innerHTML=`
        <section class="counterparty-summary"><div class="counterparty-summary-head"><div><small>当前业务关系</small><strong>${people.length} 人</strong></div><span>同一姓名自动归集</span></div><div class="counterparty-metrics">
          <div><span>货在同行手里</span><strong>${fmtMoney(sum.currentValue)}</strong><small>${fmtInt(sum.currentQty)} 件</small></div>
          <div><span>今天待跟进</span><strong>${sum.dueQuotes}</strong><small>${sum.duePeople} 人</small></div>
          <div><span>待收</span><strong>${fmtMoney(sum.receivable)}</strong><small>未结销售/过手</small></div>
          <div><span>待付</span><strong>${fmtMoney(sum.payable)}</strong><small>货主未结</small></div>
        </div></section>
        <div class="counterparty-search"><input id="counterpartySearch" placeholder="搜姓名 / 电话 / 备注 / 货品"><button id="counterpartyAdd" type="button">＋</button></div>
        <div class="segment counterparty-filter" id="counterpartyFilter"><button class="active" data-filter="focus">重点</button><button data-filter="all">全部</button><button data-filter="holding">货在外</button><button data-filter="followup">待跟进</button><button data-filter="settlement">待结算</button><button data-filter="source">货主</button></div>
        <div class="counterparty-hint">同一个人如果用了不同名字（例如“老李”和“李总”）会暂时分开；本轮不自动合并，避免错并账。</div>
        <div id="counterpartyList" class="counterparty-list"></div>`;
      let filter='focus';
      const draw=()=>{
        const q=normName($('#counterpartySearch')?.value||'');
        let rows=people.filter(p=>{
          const text=normName([p.name,p.customer?.phone,p.customer?.note,...p.currentHoldingRows.map(x=>x.item?.productName||x.row?.itemName||'')].join(' '));
          if(q&&!text.includes(q))return false;
          if(filter==='all')return true;
          if(filter==='holding')return p.currentHoldingQty>0;
          if(filter==='followup')return p.dueQuoteCount>0||p.openQuoteCount>0;
          if(filter==='settlement')return p.receivable>0||p.payable>0;
          if(filter==='source')return p.sourceOpenValue>0||p.payable>0||p.roles.includes('货主');
          return p.currentHoldingQty>0||p.dueQuoteCount>0||p.receivable>0||p.payable>0||p.sourceOpenValue>0;
        });
        $('#counterpartyList').innerHTML=rows.length?rows.map(personRow).join(''):emptyState('往','这里暂时没有需要处理的往来','切换“全部”可查看历史联系人');
        $$('.counterparty-row').forEach(el=>el.onclick=()=>openPersonDetail(el.dataset.personKey));
      };
      draw();
      $('#counterpartySearch').oninput=draw;$('#counterpartyAdd').onclick=()=>openContactEditor('');
      $$('#counterpartyFilter button').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;$$('#counterpartyFilter button').forEach(x=>x.classList.toggle('active',x===btn));draw();});
    }catch(err){console.warn('[counterparty 4.2.1]',err);await originalRenderCustomers();}
  };

  async function openPersonDetail(key){
    const people=await buildPeople(),p=people.find(x=>x.key===key);if(!p)return;
    const current=p.currentHoldingRows.slice().sort((a,b)=>safeDate(b.loan?.date||b.row?.updatedAt)-safeDate(a.loan?.date||a.row?.updatedAt));
    const quoteList=p.quotes.filter(x=>quoteOpen(x.quote)).sort((a,b)=>(quoteDue(b.quote)?1:0)-(quoteDue(a.quote)?1:0)||safeDate(b.quote.updatedAt||b.quote.createdAt)-safeDate(a.quote.updatedAt||a.quote.createdAt));
    const settlements=[];
    p.sales.filter(isFormalReceivableSale).forEach(s=>settlements.push({type:'待收',title:`${s.orderNo||'销售单'} · ${s.customerName||p.name}`,amount:saleDue(s),kind:'sale',id:s.id,date:s.createdAt}));
    p.externalBuyer.filter(r=>r.status==='sold'&&(typeof externalBuyerDue==='function'?externalBuyerDue(r):0)>0).forEach(r=>settlements.push({type:'待收',title:`外部货 ${r.tempNo||''}`,amount:externalBuyerDue(r),kind:'external',id:r.id,date:r.soldAt||r.updatedAt}));
    p.passBuyer.filter(d=>passDealBuyerDue(d)>0).forEach(d=>settlements.push({type:'待收',title:`过手 ${d.dealNo||d.itemName||''}`,amount:passDealBuyerDue(d),kind:'pass',date:d.updatedAt||d.createdAt}));
    p.externalOwner.filter(r=>r.status==='sold'&&externalOwnerDue(r)>0).forEach(r=>settlements.push({type:'待付',title:`外部货 ${r.tempNo||''}`,amount:externalOwnerDue(r),kind:'external',id:r.id,date:r.soldAt||r.updatedAt}));
    p.passSource.filter(d=>passDealSourceDue(d)>0).forEach(d=>settlements.push({type:'待付',title:`过手 ${d.dealNo||d.itemName||''}`,amount:passDealSourceDue(d),kind:'pass',date:d.updatedAt||d.createdAt}));
    settlements.sort((a,b)=>safeDate(b.date)-safeDate(a.date));
    const recent=[];
    p.loans.forEach(l=>recent.push({date:l.updatedAt||l.date||l.createdAt,text:`${l.type==='lend'?'调出':'调入'} · ${l.loanNo||''}`,sub:`${(l.items||[]).length}种货 · ${loanIsOpen(l)?'未完成':'已完成'}`}));
    p.sales.forEach(s=>recent.push({date:s.updatedAt||s.createdAt,text:`成交 · ${s.orderNo||''}`,sub:`${fmtMoney(s.finalAmount)} · ${s.items?.length||0}种货`}));
    p.externalHolder.forEach(r=>recent.push({date:r.updatedAt||r.createdAt,text:`外部货 · ${r.tempNo||''}`,sub:`${r.itemName||''} · ${typeof externalStatusName==='function'?externalStatusName(r):r.status}`}));
    p.passBuyer.forEach(d=>recent.push({date:d.updatedAt||d.createdAt,text:`过手买家 · ${d.dealNo||''}`,sub:`${d.itemName||''} · ${fmtMoney(d.saleAmount)}`}));
    recent.sort((a,b)=>safeDate(b.date)-safeDate(a.date));

    openModal(p.name,`<div class="counterparty-detail">
      <section class="counterparty-profile"><div class="counterparty-profile-avatar">${esc(p.name.slice(0,1))}</div><div><h3>${esc(p.name)}</h3><div class="counterparty-tags">${roleTags(p)}</div><small>${esc(p.customer?.phone||'未填写电话')}${p.customer?.note?` · ${esc(p.customer.note)}`:''}</small></div><button id="cpEditContact" type="button">编辑</button></section>
      <div class="counterparty-detail-metrics"><div><span>在外货值</span><strong>${fmtMoney(p.currentHoldingValue)}</strong><small>${fmtInt(p.currentHoldingQty)} 件${p.overdueCount?` · ${p.overdueCount}笔超期`:''}</small></div><div><span>报价跟进</span><strong>${p.openQuoteCount}</strong><small>${p.dueQuoteCount} 条到期</small></div><div><span>待收</span><strong>${fmtMoney(p.receivable)}</strong></div><div><span>待付</span><strong>${fmtMoney(p.payable)}</strong></div></div>
      ${p.sourceOpenValue?`<div class="counterparty-source-note">你目前还经手着此人来源的外部货：<strong>${fmtMoney(p.sourceOpenValue)}</strong></div>`:''}
      <div class="counterparty-section"><div class="counterparty-section-head"><strong>现在在对方手里的货</strong><span>${current.length} 条</span></div>${current.length?current.map(currentGoodRow).join(''):`<div class="counterparty-empty">目前没有货压在对方手里。</div>`}</div>
      <div class="counterparty-section"><div class="counterparty-section-head"><strong>报价 / 跟进</strong><span>${quoteList.length} 条进行中</span></div>${quoteList.length?quoteList.slice(0,8).map(quoteDetailRow).join(''):`<div class="counterparty-empty">没有进行中的报价。</div>`}</div>
      <div class="counterparty-section"><div class="counterparty-section-head"><strong>待结算</strong><span>${settlements.length} 笔</span></div>${settlements.length?settlements.slice(0,10).map(settlementRow).join(''):`<div class="counterparty-empty">没有未结清款项。</div>`}</div>
      <div class="counterparty-section"><div class="counterparty-section-head"><strong>最近往来</strong><span>最近 8 条</span></div>${recent.length?recent.slice(0,8).map(x=>`<div class="counterparty-history"><time>${fmtDateTime(x.date)}</time><div><strong>${esc(x.text)}</strong><small>${esc(x.sub)}</small></div></div>`).join(''):`<div class="counterparty-empty">暂无历史往来。</div>`}</div>
      <div class="counterparty-sticky-actions"><button id="cpNewLend" class="btn block" type="button">＋ 调货给他</button><button id="cpEditContact2" class="btn secondary block" type="button">联系人资料</button></div>
    </div>`,{full:true,onOpen:()=>{
      const edit=()=>openContactEditor(p.name,()=>openPersonDetail(p.key));
      $('#cpEditContact').onclick=edit;$('#cpEditContact2').onclick=edit;
      $('#cpNewLend').onclick=()=>{closeModal();startLendForPerson(p.name);};
      $$('.cp-open-loan').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.id;closeModal();openLoanDetail(id);});
      $$('.cp-open-external').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.id;closeModal();openExternalGoodDetail(id);});
      $$('.cp-open-product').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.id;closeModal();navigate('product-detail',{id});});
      $$('.cp-open-sale').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.id;closeModal();navigate('sales',{highlight:id});});
    }});
  }

  function currentGoodRow(x){
    if(x.kind==='loan')return `<button class="counterparty-good-row cp-open-loan" data-id="${esc(x.loan.id)}" type="button">${x.item.image?`<img src="${esc(x.item.image)}" alt="">`:`<span class="counterparty-good-placeholder">玉</span>`}<div><strong>${esc(x.item.productName||'商品')}</strong><small>${esc(x.item.productCode||'')} · ${fmtInt(x.qty)}件 · 成本货值 ${fmtMoney(x.value)}</small><small>${esc(x.loan.loanNo||'')} · ${loanOverdueDays(x.loan)>0?`已超期 ${loanOverdueDays(x.loan)} 天`:`预计 ${fmtDate(typeof loanDueDate==='function'?loanDueDate(x.loan):x.loan.expectedReturnDate)}`}</small></div><b>›</b></button>`;
    return `<button class="counterparty-good-row cp-open-external" data-id="${esc(x.row.id)}" type="button">${x.row.image?`<img src="${esc(x.row.image)}" alt="">`:`<span class="counterparty-good-placeholder">玉</span>`}<div><strong>${esc(x.row.itemName||'外部货')}</strong><small>${esc(x.row.tempNo||'')} · ${fmtInt(x.qty)}件 · 责任货值 ${fmtMoney(x.value)}</small><small>${x.row.expectedReturnDate?`预计 ${fmtDate(x.row.expectedReturnDate)} 前处理`:'未设归还日期'}</small></div><b>›</b></button>`;
  }
  function quoteDetailRow(x){const q=x.quote;return `<button class="counterparty-quote-row cp-open-product" data-id="${esc(x.product.id)}" type="button"><div><strong>${esc(x.product.name)}</strong><small>${esc(q.person||'')} · ${fmtMoney(q.amount)}${q.nextFollowupDate?` · 下次 ${esc(q.nextFollowupDate)}`:''}</small>${q.note?`<small>${esc(q.note)}</small>`:''}</div><span class="${quoteDue(q)?'due':''}">${quoteDue(q)?'该跟进':'进行中'}</span></button>`;}
  function settlementRow(x){const cls=x.type==='待收'?'receive':'pay';const action=x.kind==='sale'?'cp-open-sale':x.kind==='external'?'cp-open-external':'';return `<button class="counterparty-settle-row ${action}" ${x.id?`data-id="${esc(x.id)}"`:''} type="button" ${action?'':'disabled'}><div><span class="${cls}">${x.type}</span><strong>${esc(x.title)}</strong><small>${fmtDateTime(x.date)}</small></div><b>${fmtMoney(x.amount)}</b></button>`;}

  async function openContactEditor(name='',afterSave=null){
    const customers=await dbAll('customers'),key=personKey(name),existing=customers.find(c=>personKey(c.name)===key)||null;
    openModal(existing?'编辑联系人':'新增联系人',`<form id="cpContactForm"><div class="form-group"><label class="form-label">姓名 *</label><input id="cpContactName" class="input" value="${esc(existing?.name||name)}" required></div><div class="form-group"><label class="form-label">电话</label><input id="cpContactPhone" class="input" inputmode="tel" value="${esc(existing?.phone||'')}"></div><div class="form-group"><label class="form-label">备注</label><textarea id="cpContactNote" class="textarea" placeholder="例如：广州同行、主做高端手镯、结算及时">${esc(existing?.note||'')}</textarea></div><div class="notice">联系人资料继续存放在现有客户库，不新增数据库表；不会影响库存。</div><button class="btn block" type="submit">保存联系人</button></form>`,{onOpen:()=>{$('#cpContactForm').onsubmit=async e=>{e.preventDefault();const newName=$('#cpContactName').value.trim();if(!newName){showToast('请填写姓名');return;}const row={id:existing?.id||uid('cust'),name:newName,phone:$('#cpContactPhone').value.trim(),note:$('#cpContactNote').value.trim(),businessContact:true,createdAt:existing?.createdAt||nowISO(),updatedAt:nowISO()};await dbPut('customers',row);await writeAudit('contact.save','customer',row.id,`${newName} 联系人资料已保存`,existing,row);closeModal();showToast('联系人已保存');if(afterSave)await afterSave();else if(appState.route==='customers')await renderCustomers();};}});
  }

  async function startLendForPerson(name){
    appState.loanDraft={type:'lend',person:name,date:localInputDateTime(),expectedReturnDate:addDaysLocal(nowISO(),30),note:'',images:[],items:[]};clearLocalDraft('mocui_loan_draft_v1');await openLoanForm();
  }

  renderLoans=async function(){
    const result=await originalRenderLoans.apply(this,arguments);
    try{
      if(appState.route!=='loans'||document.querySelector('#counterpartyLoanEntry'))return result;
      const people=await buildPeople(),active=people.filter(p=>p.currentHoldingQty>0),overdue=active.filter(p=>p.overdueCount>0);
      const host=$('#main .notice')||$('#main')?.firstElementChild;if(!host)return result;
      const card=document.createElement('section');card.id='counterpartyLoanEntry';card.className='counterparty-loan-entry';card.innerHTML=`<button id="counterpartyLoanOverview" type="button"><div><small>按人看调货</small><strong>${active.length} 个同行手里有货</strong><span>${overdue.length?`${overdue.length} 人存在超期 · `:''}点开直接看每个人压着哪些货</span></div><b>›</b></button>`;host.insertAdjacentElement('afterend',card);$('#counterpartyLoanOverview').onclick=()=>navigate('customers');
    }catch(err){console.warn('[counterparty loans]',err);}return result;
  };

  renderExternalGoods=async function(){
    const result=await originalRenderExternalGoods.apply(this,arguments);
    try{if(appState.route==='external-goods'&&!document.querySelector('#counterpartyExternalEntry')){const main=$('#main'),notice=main?.querySelector('.notice');if(notice){const el=document.createElement('button');el.id='counterpartyExternalEntry';el.className='counterparty-inline-entry';el.type='button';el.innerHTML='<span><strong>按同行 / 货主查看往来</strong><small>把外部货、调借、结算放到同一个人下面</small></span><b>›</b>';notice.insertAdjacentElement('afterend',el);el.onclick=()=>navigate('customers');}}}catch(err){console.warn(err);}return result;
  };

  renderMore=async function(){
    const result=await originalRenderMore.apply(this,arguments);
    try{const row=document.querySelector('.more-item[data-route="customers"]');if(row){const title=row.querySelector('.item-title'),meta=row.querySelector('.item-meta');if(title)title.textContent='往来管理';if(meta)meta.textContent='同行 / 客户 / 货主 · 在外货、跟进、结算';}}catch(_){}return result;
  };

  renderDashboard=async function(){
    const result=await originalRenderDashboard.apply(this,arguments);
    try{
      if(appState.route==='dashboard'&&!document.querySelector('#counterpartyDashboardLink')){
        const panel=document.querySelector('#workflow42DailyPanel');if(panel){const btn=document.createElement('button');btn.id='counterpartyDashboardLink';btn.className='counterparty-dashboard-link';btn.type='button';btn.innerHTML='<span>往来总览</span><small>按同行查看在外货、跟进与结算</small><b>›</b>';panel.appendChild(btn);btn.onclick=()=>navigate('customers');}
      }
    }catch(_){}return result;
  };

  window.MocuiCounterparty421={version:VERSION,buildPeople,openPerson:key=>openPersonDetail(key),openContact:openContactEditor};
})();
