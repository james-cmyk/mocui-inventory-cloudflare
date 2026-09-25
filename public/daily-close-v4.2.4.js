'use strict';

(function(){
  const VERSION='4.2.4';
  const LEDGER_ID='dailyCloseLedgerV1';
  const originalRenderDashboard424=renderDashboard;
  const originalRenderMore424=renderMore;

  function localDay424(value=new Date()){
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
    const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function addDays424(day,days){const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()+days);return localDay424(d);}
  function businessDay424(row,kind=''){
    if(row?.businessDate&&/^\d{4}-\d{2}-\d{2}$/.test(String(row.businessDate)))return String(row.businessDate);
    if(kind==='external')return localDay424(row?.soldAt||row?.updatedAt||row?.createdAt);
    return localDay424(row?.createdAt||row?.date||row?.updatedAt);
  }
  function settlementEvents424(row){return Array.isArray(row?.settlementEvents)?row.settlementEvents:[];}
  function eventSum424(row,type){return settlementEvents424(row).filter(e=>(e.type==='pay'?'pay':'receive')===type).reduce((s,e)=>s+n(e.amount),0);}
  function initialReceived424(row,field){return Math.max(0,n(row?.[field])-eventSum424(row,'receive'));}
  function initialPaid424(row,field){return Math.max(0,n(row?.[field])-eventSum424(row,'pay'));}
  function activeSale424(s){if(typeof saleIsHistorical==='function'&&saleIsHistorical(s))return false;return typeof saleIsReportActive==='function'?saleIsReportActive(s):s?.status==='active';}
  function activePass424(r){return typeof passDealIsActive==='function'?passDealIsActive(r):r?.status!=='cancelled';}
  function openQuote424(q){return (q?.status||'open')==='open';}
  function qtyOfItems424(items,key='qty'){return (items||[]).reduce((s,i)=>s+n(i?.[key]??i?.qty),0);}
  function dayDiff424(dayA,dayB){if(!dayA||!dayB)return 9999;return Math.round((new Date(`${dayB}T12:00:00`)-new Date(`${dayA}T12:00:00`))/86400000);}

  async function getLedger424(){const row=await dbGet('settings',LEDGER_ID);return row&&row.days?row:{id:LEDGER_ID,version:1,days:{},updatedAt:''};}
  async function putClose424(day,entry){const ledger=await getLedger424();ledger.days=ledger.days||{};ledger.days[day]=entry;const keys=Object.keys(ledger.days).sort();while(keys.length>400){const k=keys.shift();delete ledger.days[k];}ledger.updatedAt=nowISO();await dbPut('settings',ledger);return entry;}

  async function collect424(day=localDay424()){
    const tomorrow=addDays424(day,1),soon=addDays424(day,3);
    const [products,sales,loans,passes,external,settlement,ledger]=await Promise.all([
      dbAll('products'),dbAll('sales'),dbAll('loans'),
      typeof getPassDeals==='function'?getPassDeals():Promise.resolve([]),
      typeof getExternalGoods==='function'?getExternalGoods():Promise.resolve([]),
      window.MocuiSettlement423?.collect?window.MocuiSettlement423.collect():Promise.resolve({receivables:[],payables:[],events:[]}),
      getLedger424()
    ]);
    const catalog=products.filter(p=>!p.historicalOnly);
    const todaySales=sales.filter(s=>activeSale424(s)&&businessDay424(s,'sale')===day);
    const todayPass=(passes||[]).filter(r=>activePass424(r)&&businessDay424(r,'pass')===day);
    const todayExternal=(external||[]).filter(r=>r.status==='sold'&&businessDay424(r,'external')===day);

    const formalTurnover=todaySales.reduce((s,r)=>s+n(r.finalAmount),0);
    const formalProfit=todaySales.reduce((s,r)=>s+(typeof saleGrossProfit==='function'?saleGrossProfit(r):n(r.finalAmount)-(r.items||[]).reduce((a,i)=>a+n(i.costPrice)*n(i.qty),0)),0);
    const passTurnover=todayPass.reduce((s,r)=>s+n(r.saleAmount),0);
    const passProfit=todayPass.reduce((s,r)=>s+(typeof passDealProfit==='function'?passDealProfit(r):n(r.saleAmount)-n(r.costAmount)),0);
    const externalTurnover=todayExternal.reduce((s,r)=>s+n(r.saleAmount),0);
    const externalProfitTotal=todayExternal.reduce((s,r)=>s+(typeof externalProfit==='function'?externalProfit(r):n(r.saleAmount)-n(r.ownerCostAmount)),0);

    const todayEvents=(settlement.events||[]).filter(e=>localDay424(e.date||e.createdAt)===day);
    let cashReceived=todayEvents.filter(e=>(e.type==='pay'?'pay':'receive')==='receive').reduce((s,e)=>s+n(e.amount),0);
    let cashPaid=todayEvents.filter(e=>e.type==='pay').reduce((s,e)=>s+n(e.amount),0);
    cashReceived+=todaySales.reduce((s,r)=>s+initialReceived424(r,'received'),0);
    cashReceived+=todayPass.reduce((s,r)=>s+initialReceived424(r,'receivedAmount'),0);
    cashReceived+=todayExternal.reduce((s,r)=>s+initialReceived424(r,'receivedAmount'),0);
    cashPaid+=todayPass.reduce((s,r)=>s+initialPaid424(r,'sourcePaidAmount'),0);
    cashPaid+=todayExternal.reduce((s,r)=>s+initialPaid424(r,'ownerPaidAmount'),0);

    const openLends=loans.filter(l=>typeof loanIsOpen==='function'?loanIsOpen(l):l.status!=='returned');
    const overdueLoans=openLends.filter(l=>typeof loanOverdueDays==='function'?loanOverdueDays(l)>0:false);
    const soonLoans=openLends.filter(l=>{if(typeof loanDaysToDue!=='function')return false;const d=loanDaysToDue(l);return d>=0&&d<=3;});
    const loansCreated=loans.filter(l=>localDay424(l.date||l.createdAt)===day);
    const loanReturns=[];for(const l of loans)for(const e of (l.returns||[]))if(localDay424(e.date||e.createdAt)===day)loanReturns.push({loan:l,event:e});

    const externalOut=(external||[]).filter(r=>r.status==='out');
    const externalOverdue=externalOut.filter(r=>r.expectedReturnDate&&r.expectedReturnDate<day);
    const externalDueSoon=externalOut.filter(r=>r.expectedReturnDate&&r.expectedReturnDate>=day&&r.expectedReturnDate<=soon);
    const externalEvents=[];for(const r of external||[])for(const e of (r.events||[]))if(localDay424(e.date||e.createdAt)===day)externalEvents.push({row:r,event:e});

    const quotes=[];for(const p of catalog)for(const q of (Array.isArray(p.workflowQuotes)?p.workflowQuotes:[]))if(openQuote424(q)&&q.nextFollowupDate)quotes.push({product:p,quote:q});
    const followDue=quotes.filter(x=>x.quote.nextFollowupDate<=day).sort((a,b)=>String(a.quote.nextFollowupDate).localeCompare(String(b.quote.nextFollowupDate)));
    const followTomorrow=quotes.filter(x=>x.quote.nextFollowupDate===tomorrow);
    const missingCost=catalog.filter(p=>n(p.stock)>0&&n(p.costPrice)<=0);
    const missingImage=catalog.filter(p=>n(p.stock)>0&&!p.image);

    const oldReceivables=(settlement.receivables||[]).filter(r=>n(r.age)>=7);
    const oldPayables=(settlement.payables||[]).filter(r=>n(r.age)>=7);
    const currentClose=ledger.days?.[day]||null;

    return {
      day,tomorrow,
      turnover:{formal:formalTurnover,pass:passTurnover,external:externalTurnover,total:formalTurnover+passTurnover+externalTurnover},
      profit:{formal:formalProfit,pass:passProfit,external:externalProfitTotal,total:formalProfit+passProfit+externalProfitTotal},
      transactions:{formal:todaySales.length,pass:todayPass.length,external:todayExternal.length,total:todaySales.length+todayPass.length+todayExternal.length},
      cash:{received:cashReceived,paid:cashPaid,net:cashReceived-cashPaid,events:todayEvents.length},
      settlement,
      goods:{loansCreated,loanReturns,overdueLoans,soonLoans,externalEvents,externalOverdue,externalDueSoon},
      follow:{due:followDue,tomorrow:followTomorrow},
      data:{missingCost,missingImage},
      aging:{receivables:oldReceivables,payables:oldPayables},
      currentClose
    };
  }

  function summaryText424(d){
    const recv=(d.settlement.receivables||[]).reduce((s,r)=>s+n(r.amount),0),pay=(d.settlement.payables||[]).reduce((s,r)=>s+n(r.amount),0);
    return [
      `漠翠进销存｜${d.day} 日结`,
      `今日成交：${d.transactions.total} 笔｜成交额 ${fmtMoney(d.turnover.total)}｜毛利润 ${fmtMoney(d.profit.total)}`,
      `今日现金：收 ${fmtMoney(d.cash.received)}｜付 ${fmtMoney(d.cash.paid)}｜净流入 ${fmtMoney(d.cash.net)}`,
      `当前待结：待收 ${fmtMoney(recv)}｜待付 ${fmtMoney(pay)}`,
      `货品：新调借 ${d.goods.loansCreated.length} 单｜今日归还 ${d.goods.loanReturns.length} 次｜超期调借 ${d.goods.overdueLoans.length} 单｜外部货超期 ${d.goods.externalOverdue.length} 件`,
      `跟进：今日/逾期 ${d.follow.due.length} 条｜明日 ${d.follow.tomorrow.length} 条`,
      `资料：成本待补 ${d.data.missingCost.length} 件｜图片待补 ${d.data.missingImage.length} 件`
    ].join('\n');
  }

  function issueCount424(d){return (d.settlement.receivables||[]).length+(d.settlement.payables||[]).length+d.goods.overdueLoans.length+d.goods.externalOverdue.length+d.follow.due.length+d.data.missingCost.length;}

  function compactIssue424(label,count,text,action,level=''){
    return `<button class="daily424-issue ${level}" type="button" data-action="${action}"><div><span>${esc(label)}</span><strong>${fmtInt(count)}</strong></div><small>${esc(text)}</small><b>›</b></button>`;
  }

  function closeForm424(data){const saved=data.currentClose||{},checks=saved.checks||{};return `<div class="daily424-close-form"><label><input id="daily424CheckMoney" type="checkbox" ${checks.money?'checked':''}><span><strong>资金已核对</strong><small>微信 / 现金 / 转账与系统记录已对过</small></span></label><label><input id="daily424CheckGoods" type="checkbox" ${checks.goods?'checked':''}><span><strong>货品去向已核对</strong><small>今天调出、归还和外部货位置没有遗漏</small></span></label><label><input id="daily424CheckFollow" type="checkbox" ${checks.follow?'checked':''}><span><strong>明日重点已确认</strong><small>到期调借、报价跟进、待收待付已看过</small></span></label><div class="daily424-note-wrap"><label for="daily424Note">今日备注</label><textarea id="daily424Note" class="textarea" placeholder="例如：老李明天确认碧玉；张总还有 5000 待收">${esc(saved.note||'')}</textarea></div><button id="daily424SaveClose" class="btn block ${saved.closedAt?'secondary':''}" type="button">${saved.closedAt?'更新今日收尾':'完成今日收尾'}</button>${saved.closedAt?`<div class="daily424-closed-at">已于 ${fmtDateTime(saved.closedAt)} 完成收尾</div>`:''}</div>`;}

  async function saveClose424(data){
    const checks={money:$('#daily424CheckMoney')?.checked,goods:$('#daily424CheckGoods')?.checked,follow:$('#daily424CheckFollow')?.checked};
    if(!checks.money||!checks.goods||!checks.follow){showToast('请先确认资金、货品和明日重点都已核对');return;}
    const note=$('#daily424Note')?.value.trim()||'',snapshot={turnover:data.turnover.total,profit:data.profit.total,cashReceived:data.cash.received,cashPaid:data.cash.paid,receivable:(data.settlement.receivables||[]).reduce((s,r)=>s+n(r.amount),0),payable:(data.settlement.payables||[]).reduce((s,r)=>s+n(r.amount),0),issues:issueCount424(data),transactionCount:data.transactions.total};
    const previous=data.currentClose;const entry={day:data.day,closedAt:nowISO(),checks,note,snapshot,updatedAt:nowISO()};await putClose424(data.day,entry);await writeAudit('daily.close','system',data.day,`${data.day} 日结完成 · 成交 ${fmtMoney(snapshot.turnover)} · 毛利 ${fmtMoney(snapshot.profit)}`,previous,entry);showToast('今日收尾已保存');closeModal();setTimeout(()=>openDailyClose424(),180);
  }

  function tomorrowRows424(data){
    const rows=[];
    data.follow.tomorrow.forEach(x=>rows.push({type:'跟进',title:`${x.product.name} · ${x.quote.person||'未填写对象'}`,meta:`报价 ${fmtMoney(x.quote.amount)}`,action:'follow'}));
    data.goods.soonLoans.forEach(l=>rows.push({type:'调借',title:`${l.person} · ${l.loanNo||'调借单'}`,meta:`预计归还 ${typeof loanDueDate==='function'?fmtDate(loanDueDate(l)):''}`,action:'loans'}));
    data.goods.externalDueSoon.forEach(r=>rows.push({type:'外部货',title:`${r.itemName} · ${r.currentHolderName||'同行'}`,meta:`预计 ${fmtDate(r.expectedReturnDate)} 前处理`,action:'external'}));
    data.aging.receivables.slice(0,6).forEach(r=>rows.push({type:'待收',title:`${r.person} · ${r.ref}`,meta:`${fmtMoney(r.amount)} · 已挂 ${r.age} 天`,action:'settle'}));
    data.aging.payables.slice(0,6).forEach(r=>rows.push({type:'待付',title:`${r.person} · ${r.ref}`,meta:`${fmtMoney(r.amount)} · 已挂 ${r.age} 天`,action:'settle'}));
    return rows;
  }

  function historyRow424(day,row){return `<button class="daily424-history-row" type="button" data-day="${esc(day)}"><div><strong>${esc(day)}</strong><small>${fmtDateTime(row.closedAt)}${row.note?` · ${esc(row.note)}`:''}</small></div><div><span>${fmtMoney(row.snapshot?.turnover||0)}</span><small>毛利 ${fmtMoney(row.snapshot?.profit||0)}</small></div></button>`;}

  async function openHistoryDetail424(day){const ledger=await getLedger424(),row=ledger.days?.[day];if(!row)return;const s=row.snapshot||{};openModal(`${day} 日结`, `<div class="daily424-history-detail"><div class="daily424-summary-grid"><div><span>成交额</span><strong>${fmtMoney(s.turnover||0)}</strong></div><div><span>毛利润</span><strong>${fmtMoney(s.profit||0)}</strong></div><div><span>实际收款</span><strong>${fmtMoney(s.cashReceived||0)}</strong></div><div><span>实际付款</span><strong>${fmtMoney(s.cashPaid||0)}</strong></div></div><div class="total-box"><div class="total-row"><span>当时待收</span><strong>${fmtMoney(s.receivable||0)}</strong></div><div class="total-row"><span>当时待付</span><strong>${fmtMoney(s.payable||0)}</strong></div><div class="total-row"><span>待处理项</span><strong>${fmtInt(s.issues||0)}</strong></div></div><div class="notice">完成时间：${fmtDateTime(row.closedAt)}<br>备注：${esc(row.note||'无')}</div></div>`);}

  async function openDailyClose424(initial='today'){
    const data=await collect424(),ledger=await getLedger424();let tab=initial;
    const recv=(data.settlement.receivables||[]).reduce((s,r)=>s+n(r.amount),0),pay=(data.settlement.payables||[]).reduce((s,r)=>s+n(r.amount),0),tomorrow=tomorrowRows424(data);
    const history=Object.entries(ledger.days||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,60);
    openModal('每日收尾与复盘',`<div class="daily424"><div class="daily424-tabs"><button data-tab="today" class="${tab==='today'?'active':''}">今日收尾</button><button data-tab="tomorrow" class="${tab==='tomorrow'?'active':''}">明日重点 ${tomorrow.length||''}</button><button data-tab="history" class="${tab==='history'?'active':''}">历史</button></div><div id="daily424Body"></div></div>`,{full:true,onOpen:()=>{
      const body=$('#daily424Body');
      const bindCommon=()=>{$$('[data-action="settle"]',body).forEach(b=>b.onclick=()=>window.MocuiSettlement423?.open?.('receive'));$$('[data-action="loans"]',body).forEach(b=>b.onclick=()=>{closeModal();navigate('loans');});$$('[data-action="external"]',body).forEach(b=>b.onclick=()=>{closeModal();navigate('external-goods');});$$('[data-action="follow"]',body).forEach(b=>b.onclick=()=>{closeModal();navigate('products');});};
      const draw=()=>{
        if(tab==='today'){
          body.innerHTML=`<div class="daily424-date">${esc(data.day)}${data.currentClose?'<span>已收尾</span>':'<span class="pending">未收尾</span>'}</div><div class="daily424-summary-grid"><div><span>今日成交额</span><strong>${fmtMoney(data.turnover.total)}</strong><small>${data.transactions.total} 笔</small></div><div><span>今日毛利润</span><strong>${fmtMoney(data.profit.total)}</strong><small>正式/过手/外部货</small></div><div><span>实际收款</span><strong>${fmtMoney(data.cash.received)}</strong><small>成交首款 + 今日补收</small></div><div><span>实际付款</span><strong>${fmtMoney(data.cash.paid)}</strong><small>货主首付 + 今日补付</small></div></div><div class="daily424-breakdown"><div><span>正式销售</span><b>${fmtMoney(data.turnover.formal)}</b><small>毛利 ${fmtMoney(data.profit.formal)}</small></div><div><span>过手差价</span><b>${fmtMoney(data.turnover.pass)}</b><small>毛利 ${fmtMoney(data.profit.pass)}</small></div><div><span>外部同行货</span><b>${fmtMoney(data.turnover.external)}</b><small>毛利 ${fmtMoney(data.profit.external)}</small></div><div><span>现金净流入</span><b>${fmtMoney(data.cash.net)}</b><small>收款 - 付款</small></div></div><div class="section-title">还没处理完的事</div><div class="daily424-issues">${compactIssue424('待收',data.settlement.receivables.length,`合计 ${fmtMoney(recv)}`,'settle',recv?'warn':'')}${compactIssue424('待付',data.settlement.payables.length,`合计 ${fmtMoney(pay)}`,'settle',pay?'warn':'')}${compactIssue424('超期调借',data.goods.overdueLoans.length,`${data.goods.soonLoans.length} 单3天内到期`,'loans',data.goods.overdueLoans.length?'danger':'')}${compactIssue424('外部货超期',data.goods.externalOverdue.length,`${data.goods.externalDueSoon.length} 件3天内到期`,'external',data.goods.externalOverdue.length?'danger':'')}${compactIssue424('报价跟进',data.follow.due.length,`明日 ${data.follow.tomorrow.length} 条`,'follow',data.follow.due.length?'warn':'')}${compactIssue424('成本待补',data.data.missingCost.length,`另有 ${data.data.missingImage.length} 件在手货无图片`,'follow',data.data.missingCost.length?'warn':'')}</div><div class="section-title">今天货品流转</div><div class="daily424-flow-strip"><span>新调借 <strong>${data.goods.loansCreated.length}</strong></span><span>归还 <strong>${data.goods.loanReturns.length}</strong></span><span>外部货动作 <strong>${data.goods.externalEvents.length}</strong></span><span>后续结算 <strong>${data.cash.events}</strong></span></div>${closeForm424(data)}<div class="daily424-bottom-actions"><button id="daily424Copy" class="btn secondary" type="button">复制今日简报</button><button id="daily424Settle" class="btn secondary" type="button">打开结算中心</button></div>`;
          bindCommon();$('#daily424SaveClose').onclick=()=>saveClose424(data);$('#daily424Copy').onclick=async()=>{try{if(typeof copyText==='function')await copyText(summaryText424(data));else await navigator.clipboard.writeText(summaryText424(data));showToast('今日简报已复制');}catch(_){showToast('复制失败');}};$('#daily424Settle').onclick=()=>window.MocuiSettlement423?.open?.('receive');
        }else if(tab==='tomorrow'){
          body.innerHTML=`<div class="daily424-tomorrow-head"><strong>${esc(data.tomorrow)}</strong><span>系统按当前记录整理，不代表业务已经确认。</span></div>${tomorrow.length?`<div class="daily424-tomorrow-list">${tomorrow.map(r=>`<button type="button" data-action="${r.action}"><span>${esc(r.type)}</span><div><strong>${esc(r.title)}</strong><small>${esc(r.meta)}</small></div><b>›</b></button>`).join('')}</div>`:`<div class="daily424-empty"><strong>暂时没有明确的明日重点</strong><span>后续新增到期调借、报价跟进或账款后会自动出现。</span></div>`}`;bindCommon();
        }else{
          body.innerHTML=history.length?`<div class="daily424-history-list">${history.map(([day,row])=>historyRow424(day,row)).join('')}</div>`:`<div class="daily424-empty"><strong>还没有日结记录</strong><span>完成一次“今日收尾”后，这里会留下历史快照。</span></div>`;$$('.daily424-history-row',body).forEach(b=>b.onclick=()=>openHistoryDetail424(b.dataset.day));
        }
      };
      $$('.daily424-tabs button').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;$$('.daily424-tabs button').forEach(x=>x.classList.toggle('active',x===btn));draw();});draw();
    }});
  }

  async function enhanceDashboard424(){
    if(appState.route!=='dashboard'||document.querySelector('#daily424Dashboard'))return;const data=await collect424(),main=$('#main');if(!main)return;
    const card=document.createElement('button');card.id='daily424Dashboard';card.className=`daily424-dashboard ${data.currentClose?'done':''}`;card.type='button';card.innerHTML=`<div><span>每日收尾</span><strong>${data.currentClose?'今天已完成':'今天还没收尾'}</strong><small>成交 ${fmtMoney(data.turnover.total)} · 实收 ${fmtMoney(data.cash.received)} · 待处理 ${issueCount424(data)} 项</small></div><div><b>${data.currentClose?'已完成':'去核对'}</b><span>›</span></div>`;const panel=$('#workflow42DailyPanel');if(panel)panel.insertAdjacentElement('afterend',card);else main.prepend(card);card.onclick=()=>openDailyClose424();
  }

  async function enhanceMore424(){
    if(appState.route!=='more'||document.querySelector('#daily424MoreEntry'))return;const main=$('#main');if(!main)return;const sec=document.createElement('section');sec.id='daily424MoreEntry';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">经营收尾</div><div class="list"><div id="daily424MoreOpen" class="list-item clickable"><div class="thumb placeholder">日</div><div class="item-main"><div class="item-title">每日收尾与复盘</div><div class="item-meta">成交、现金、调货、待结、明日重点一次核对</div></div><div>›</div></div></div>`;const anchor=document.querySelector('#settle423MoreEntry')||main.firstElementChild;anchor?.insertAdjacentElement('afterend',sec);$('#daily424MoreOpen').onclick=()=>openDailyClose424();
  }

  renderDashboard=async function(){const r=await originalRenderDashboard424.apply(this,arguments);try{await enhanceDashboard424();}catch(e){console.warn('[v4.2.4 dashboard]',e);}return r;};
  renderMore=async function(){const r=await originalRenderMore424.apply(this,arguments);try{await enhanceMore424();}catch(e){console.warn('[v4.2.4 more]',e);}return r;};

  window.MocuiDailyClose424={version:VERSION,collect:collect424,open:openDailyClose424,summary:summaryText424};
})();
