'use strict';

(function(){
  const VERSION='4.2.5';
  const REVIEW_LEDGER_ID='weeklyReviewLedgerV1';
  const originalRenderDashboard425=renderDashboard;
  const originalRenderMore425=renderMore;
  const originalRenderReports425=renderReports;

  const DAY=86400000;
  const RULES={
    receivableAttentionDays:14,
    receivableCriticalDays:30,
    payableAttentionDays:14,
    lendAttentionDays:30,
    externalAttentionDays:30,
    slowInventoryDays:90,
    marginDropPoints:5,
    concentrationPct:50,
    minTrendTransactions:3
  };

  function dayKey425(value=new Date()){
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
    const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function noon425(day){return new Date(`${day}T12:00:00`);}
  function addDays425(day,delta){const d=noon425(day);d.setDate(d.getDate()+delta);return dayKey425(d);}
  function ageDays425(value,today=dayKey425()){
    const d=dayKey425(value);if(!d)return 0;return Math.max(0,Math.floor((noon425(today)-noon425(d))/DAY));
  }
  function percent425(v){return `${(Number(v)||0).toFixed(1)}%`;}
  function dateInRange425(value,start,endExclusive){const d=dayKey425(value);return !!d&&d>=start&&d<endExclusive;}
  function safeMoney425(v){return fmtMoney(Number(v)||0);}
  function activeSale425(s){if(typeof saleIsHistorical==='function'&&saleIsHistorical(s))return false;return typeof saleIsReportActive==='function'?saleIsReportActive(s):s?.status==='active';}
  function saleDate425(s){return String(s?.businessDate||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||dayKey425(s?.createdAt||s?.updatedAt);}
  function passDate425(r){return String(r?.businessDate||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||dayKey425(r?.createdAt||r?.updatedAt);}
  function externalDate425(r){return String(r?.businessDate||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||dayKey425(r?.soldAt||r?.updatedAt||r?.createdAt);}
  function saleProfit425(s){return typeof saleGrossProfit==='function'?saleGrossProfit(s):n(s.finalAmount)-(s.items||[]).reduce((a,i)=>a+n(i.costPrice)*n(i.qty),0);}
  function passProfit425(r){return typeof passDealProfit==='function'?passDealProfit(r):n(r.saleAmount)-n(r.costAmount);}
  function externalProfit425(r){return typeof externalProfit==='function'?externalProfit(r):n(r.saleAmount)-n(r.ownerCostAmount);}
  function loanOpen425(l){return typeof loanIsOpen==='function'?loanIsOpen(l):l?.status!=='returned';}
  function loanRemaining425(l,i){return typeof loanItemRemaining==='function'?Math.max(0,n(loanItemRemaining(l,i))):Math.max(0,n(i.qty)-n(i.returnedQty)-n(i.soldQty));}
  function loanDue425(l){return typeof loanDueDate==='function'?loanDueDate(l):String(l?.expectedReturnDate||'').slice(0,10);}
  function loanAge425(l){return ageDays425(l?.date||l?.createdAt);}
  function passActive425(r){return typeof passDealIsActive==='function'?passDealIsActive(r):r?.status!=='cancelled';}

  function periodSummary425({sales,passes,external},start,end){
    const ss=sales.filter(s=>activeSale425(s)&&dateInRange425(saleDate425(s),start,end));
    const pp=(passes||[]).filter(r=>passActive425(r)&&dateInRange425(passDate425(r),start,end));
    const ee=(external||[]).filter(r=>r.status==='sold'&&dateInRange425(externalDate425(r),start,end));
    const revenue=ss.reduce((a,s)=>a+n(s.finalAmount),0)+pp.reduce((a,r)=>a+n(r.saleAmount),0)+ee.reduce((a,r)=>a+n(r.saleAmount),0);
    const profit=ss.reduce((a,s)=>a+saleProfit425(s),0)+pp.reduce((a,r)=>a+passProfit425(r),0)+ee.reduce((a,r)=>a+externalProfit425(r),0);
    const count=ss.length+pp.length+ee.length;
    const qty=ss.reduce((a,s)=>a+(s.items||[]).reduce((b,i)=>b+n(i.qty),0),0)+pp.reduce((a,r)=>a+n(r.qty),0)+ee.reduce((a,r)=>a+n(r.qty),0);
    return {start,end,revenue,profit,count,qty,margin:revenue>0?profit/revenue*100:null,formal:ss,passes:pp,external:ee};
  }

  function trend425(current,previous){
    const delta=(a,b)=>b!==0?(a-b)/Math.abs(b)*100:(a?null:0);
    const marginDelta=current.margin!==null&&previous.margin!==null?current.margin-previous.margin:null;
    return {revenuePct:delta(current.revenue,previous.revenue),profitPct:delta(current.profit,previous.profit),countPct:delta(current.count,previous.count),marginPoints:marginDelta};
  }

  function productLastSales425(products,sales){
    const map=new Map(products.map(p=>[p.id,{product:p,lastSaleAt:'',soldQty:0,soldAmount:0}]));
    for(const s of sales){
      if(!activeSale425(s))continue;
      for(const i of s.items||[]){const x=map.get(i.productId);if(!x)continue;const date=s.createdAt||s.businessDate||'';if(!x.lastSaleAt||new Date(date)>new Date(x.lastSaleAt))x.lastSaleAt=date;x.soldQty+=n(i.qty);x.soldAmount+=n(i.price)*n(i.qty);}
    }
    return map;
  }

  function slowInventory425(products,sales,today){
    const map=productLastSales425(products,sales),rows=[];
    for(const p of products.filter(x=>!x.historicalOnly&&n(x.stock)>0)){
      const x=map.get(p.id)||{lastSaleAt:'',soldQty:0};
      const ref=x.lastSaleAt||p.createdAt||p.updatedAt||'';
      const days=ageDays425(ref,today);
      if(days<RULES.slowInventoryDays)continue;
      rows.push({product:p,days,value:n(p.stock)*n(p.costPrice),stock:n(p.stock),lastSaleAt:x.lastSaleAt,soldQty:x.soldQty});
    }
    return rows.sort((a,b)=>b.value-a.value||b.days-a.days);
  }

  function currentLoanExposure425(loans,today){
    const rows=[];
    for(const l of loans){if(!loanOpen425(l)||l.type!=='lend')continue;let qty=0,value=0;for(const i of l.items||[]){const remain=loanRemaining425(l,i);qty+=remain;value+=remain*n(i.costPrice);}if(qty<=0)continue;const due=loanDue425(l),overdue=!!due&&due<today,age=loanAge425(l);rows.push({loan:l,person:l.person||'未填写',qty,value,due,age,overdue});}
    return rows.sort((a,b)=>(b.overdue?1:0)-(a.overdue?1:0)||b.age-a.age||b.value-a.value);
  }

  function externalExposure425(rows,today){
    return (rows||[]).filter(r=>r.status==='out').map(r=>({row:r,person:r.currentHolderName||'未填写',owner:r.ownerName||'未填写',qty:n(r.qty),value:n(r.ownerCostAmount),age:ageDays425((r.events||[]).filter(e=>e.type==='transfer_out').slice(-1)[0]?.date||r.updatedAt||r.createdAt,today),due:String(r.expectedReturnDate||'').slice(0,10),overdue:!!r.expectedReturnDate&&String(r.expectedReturnDate).slice(0,10)<today})).sort((a,b)=>(b.overdue?1:0)-(a.overdue?1:0)||b.age-a.age||b.value-a.value);
  }

  function agingBuckets425(rows){
    const b={d0_7:{count:0,amount:0},d8_14:{count:0,amount:0},d15_30:{count:0,amount:0},d31:{count:0,amount:0}};
    for(const r of rows||[]){const age=n(r.age),k=age<=7?'d0_7':age<=14?'d8_14':age<=30?'d15_30':'d31';b[k].count++;b[k].amount+=n(r.amount);}
    return b;
  }

  function concentration425(people){
    const holders=(people||[]).filter(p=>n(p.currentHoldingValue)>0).sort((a,b)=>n(b.currentHoldingValue)-n(a.currentHoldingValue));
    const total=holders.reduce((s,p)=>s+n(p.currentHoldingValue),0),top=holders[0]||null,top3=holders.slice(0,3).reduce((s,p)=>s+n(p.currentHoldingValue),0);
    return {holders,total,top,topPct:total&&top?n(top.currentHoldingValue)/total*100:0,top3Pct:total?top3/total*100:0};
  }

  function addAlert425(list,level,type,title,detail,data={}){list.push({id:`${type}_${list.length}`,level,type,title,detail,...data});}

  function buildAlerts425(data){
    const a=[];
    const recv30=data.settlement.receivables.filter(r=>n(r.age)>RULES.receivableCriticalDays),recv14=data.settlement.receivables.filter(r=>n(r.age)>RULES.receivableAttentionDays&&n(r.age)<=RULES.receivableCriticalDays);
    const pay14=data.settlement.payables.filter(r=>n(r.age)>RULES.payableAttentionDays);
    if(recv30.length)addAlert425(a,'critical','receivable30',`有 ${recv30.length} 笔应收超过 ${RULES.receivableCriticalDays} 天`,`合计 ${safeMoney425(recv30.reduce((s,r)=>s+n(r.amount),0))}，最久 ${Math.max(...recv30.map(r=>n(r.age)))} 天。`,{action:'settlement-receive'});
    if(recv14.length)addAlert425(a,'attention','receivable14',`有 ${recv14.length} 笔应收超过 ${RULES.receivableAttentionDays} 天`,`合计 ${safeMoney425(recv14.reduce((s,r)=>s+n(r.amount),0))}。`,{action:'settlement-receive'});
    if(pay14.length)addAlert425(a,'attention','payable14',`有 ${pay14.length} 笔应付超过 ${RULES.payableAttentionDays} 天`,`合计 ${safeMoney425(pay14.reduce((s,r)=>s+n(r.amount),0))}，建议先确认是否已经线下结算但未录入。`,{action:'settlement-pay'});

    const oldLoans=data.loanExposure.filter(x=>x.overdue||x.age>RULES.lendAttentionDays);
    if(oldLoans.length)addAlert425(a,oldLoans.some(x=>x.overdue)?'critical':'attention','old-loans',`有 ${oldLoans.length} 单自有货调出时间偏长`,`涉及 ${safeMoney425(oldLoans.reduce((s,x)=>s+x.value,0))} 成本货值；${oldLoans.filter(x=>x.overdue).length} 单已超过预计归还日期。`,{action:'loans'});
    const oldExternal=data.externalExposure.filter(x=>x.overdue||x.age>RULES.externalAttentionDays);
    if(oldExternal.length)addAlert425(a,oldExternal.some(x=>x.overdue)?'critical':'attention','old-external',`有 ${oldExternal.length} 件外部货在同行处时间偏长`,`货主底价合计 ${safeMoney425(oldExternal.reduce((s,x)=>s+x.value,0))}；${oldExternal.filter(x=>x.overdue).length} 件已超过预计日期。`,{action:'external'});

    if(data.slowInventory.length){const value=data.slowInventory.reduce((s,x)=>s+x.value,0);addAlert425(a,'attention','slow-inventory',`${data.slowInventory.length} 个在手商品 ${RULES.slowInventoryDays} 天以上无成交`,`按当前成本合计 ${safeMoney425(value)}。这只是“无成交时长”提醒，不等于货品本身不好。`,{action:'products'});}

    const t=data.trend;
    const enough=data.current.count>=RULES.minTrendTransactions&&data.previous.count>=RULES.minTrendTransactions;
    if(enough&&t.marginPoints!==null&&t.marginPoints<=-RULES.marginDropPoints)addAlert425(a,'attention','margin-drop','近7天毛利率较前7天下降',`从 ${percent425(data.previous.margin)} 变为 ${percent425(data.current.margin)}，下降 ${Math.abs(t.marginPoints).toFixed(1)} 个百分点；两期均至少 ${RULES.minTrendTransactions} 笔成交。`,{action:'reports'});

    if(data.concentration.holders.length>=3&&data.concentration.topPct>=RULES.concentrationPct){const p=data.concentration.top;addAlert425(a,'attention','concentration',`在外货值对单一同行较集中`,`${p.name} 当前拿货成本货值 ${safeMoney425(p.currentHoldingValue)}，占全部同行在外货值 ${percent425(data.concentration.topPct)}。`,{action:'counterparty',personKey:p.key});}

    if(data.missingCost.length)addAlert425(a,'data','missing-cost',`${data.missingCost.length} 个在手商品缺少成本`,`这会影响库存货值、毛利润和周转分析的准确性。`,{action:'products'});
    if(!enough)addAlert425(a,'data','sample','趋势样本暂时不足',`近7天 ${data.current.count} 笔、前7天 ${data.previous.count} 笔；至少各 ${RULES.minTrendTransactions} 笔后才触发毛利率变化提醒。`);
    return a;
  }

  async function collect425(){
    const today=dayKey425(),currentStart=addDays425(today,-6),currentEnd=addDays425(today,1),previousStart=addDays425(today,-13),previousEnd=currentStart;
    const [products,sales,loans,passes,external,settlement,people]=await Promise.all([
      dbAll('products'),dbAll('sales'),dbAll('loans'),
      typeof getPassDeals==='function'?getPassDeals():Promise.resolve([]),
      typeof getExternalGoods==='function'?getExternalGoods():Promise.resolve([]),
      window.MocuiSettlement423?.collect?window.MocuiSettlement423.collect():Promise.resolve({receivables:[],payables:[],events:[]}),
      window.MocuiCounterparty421?.buildPeople?window.MocuiCounterparty421.buildPeople():Promise.resolve([])
    ]);
    const source={sales,passes,external};
    const current=periodSummary425(source,currentStart,currentEnd),previous=periodSummary425(source,previousStart,previousEnd),trend=trend425(current,previous);
    const catalog=products.filter(p=>!p.historicalOnly),slowInventory=slowInventory425(catalog,sales,today),loanExposure=currentLoanExposure425(loans,today),externalExposure=externalExposure425(external,today),concentration=concentration425(people),missingCost=catalog.filter(p=>n(p.stock)>0&&n(p.costPrice)<=0),missingImage=catalog.filter(p=>n(p.stock)>0&&!p.image);
    const data={today,currentStart,currentEnd,previousStart,previousEnd,products:catalog,sales,loans,passes,external,settlement,people,current,previous,trend,slowInventory,loanExposure,externalExposure,concentration,missingCost,missingImage,receivableAging:agingBuckets425(settlement.receivables),payableAging:agingBuckets425(settlement.payables)};
    data.alerts=buildAlerts425(data);return data;
  }

  function changeText425(v){if(v===null)return '上期为 0';if(Math.abs(v)<0.05)return '基本持平';return `${v>0?'↑':'↓'} ${Math.abs(v).toFixed(1)}%`;}
  function trendClass425(v,invert=false){if(v===null||Math.abs(v)<0.05)return '';const good=invert?v<0:v>0;return good?'good':'warn';}
  function marginText425(v){return v===null?'—':percent425(v);}

  function overview425(d){
    const recv=d.settlement.receivables.reduce((s,r)=>s+n(r.amount),0),pay=d.settlement.payables.reduce((s,r)=>s+n(r.amount),0),outside=d.concentration.total,slowValue=d.slowInventory.reduce((s,r)=>s+r.value,0);
    return `<div class="weekly425-period"><strong>近7天</strong><span>${esc(d.currentStart)} — ${esc(addDays425(d.currentEnd,-1))}</span><small>对比 ${esc(d.previousStart)} — ${esc(addDays425(d.previousEnd,-1))}</small></div>
      <div class="weekly425-metrics">
        <div><span>成交额</span><strong>${safeMoney425(d.current.revenue)}</strong><small class="${trendClass425(d.trend.revenuePct)}">${changeText425(d.trend.revenuePct)}</small></div>
        <div><span>毛利润</span><strong>${safeMoney425(d.current.profit)}</strong><small class="${trendClass425(d.trend.profitPct)}">${changeText425(d.trend.profitPct)}</small></div>
        <div><span>毛利率</span><strong>${marginText425(d.current.margin)}</strong><small class="${d.trend.marginPoints!==null&&d.trend.marginPoints<-RULES.marginDropPoints?'warn':''}">${d.trend.marginPoints===null?'无可比':`${d.trend.marginPoints>=0?'+':''}${d.trend.marginPoints.toFixed(1)}pp`}</small></div>
        <div><span>成交笔数</span><strong>${fmtInt(d.current.count)}</strong><small>${changeText425(d.trend.countPct)}</small></div>
      </div>
      <div class="weekly425-state-grid">
        <button data-weekly-action="settlement-receive"><span>当前待收</span><strong>${safeMoney425(recv)}</strong><small>${d.settlement.receivables.length} 笔</small></button>
        <button data-weekly-action="settlement-pay"><span>当前待付</span><strong>${safeMoney425(pay)}</strong><small>${d.settlement.payables.length} 笔</small></button>
        <button data-weekly-action="loans"><span>同行在外货值</span><strong>${safeMoney425(outside)}</strong><small>${d.concentration.holders.length} 人</small></button>
        <button data-weekly-action="products"><span>90天慢动库存</span><strong>${safeMoney425(slowValue)}</strong><small>${d.slowInventory.length} 个商品</small></button>
      </div>`;
  }

  function alerts425(d){
    if(!d.alerts.length)return `<div class="weekly425-empty"><strong>当前没有触发异常规则</strong><span>这不代表所有经营问题都不存在，只表示现有数据没有触发本轮规则。</span></div>`;
    return `<div class="weekly425-alert-list">${d.alerts.map(a=>`<button type="button" class="weekly425-alert ${a.level}" data-alert-id="${esc(a.id)}"><span class="weekly425-dot"></span><div><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></div>${a.action?'<b>›</b>':''}</button>`).join('')}</div><div class="weekly425-rule-note">当前规则：应收 >14/30天 · 调出 >30天或超期 · 慢动库存 ≥90天 · 毛利率下降 ≥5pp（且两期各≥3笔） · 单一同行在外货值 ≥50%（至少3个持货人）。</div>`;
  }

  function goods425(d){
    const oldLoans=d.loanExposure.filter(x=>x.overdue||x.age>RULES.lendAttentionDays).slice(0,12),oldExt=d.externalExposure.filter(x=>x.overdue||x.age>RULES.externalAttentionDays).slice(0,12),slow=d.slowInventory.slice(0,15);
    const exposureRows=[...oldLoans.map(x=>({kind:'自有货调出',person:x.person,title:x.loan.loanNo||'调借单',days:x.age,value:x.value,overdue:x.overdue,due:x.due})),...oldExt.map(x=>({kind:'外部货',person:x.person,title:x.row.tempNo||x.row.itemName,days:x.age,value:x.value,overdue:x.overdue,due:x.due}))].sort((a,b)=>(b.overdue?1:0)-(a.overdue?1:0)||b.days-a.days);
    return `<div class="weekly425-section-title"><strong>调出时间偏长</strong><span>${exposureRows.length} 条</span></div>${exposureRows.length?`<div class="weekly425-table">${exposureRows.map(r=>`<div><span>${esc(r.kind)}</span><div><strong>${esc(r.person)} · ${esc(r.title)}</strong><small>已在外 ${r.days} 天${r.due?` · 预计 ${esc(r.due)}`:''}</small></div><b>${safeMoney425(r.value)}</b><em class="${r.overdue?'critical':''}">${r.overdue?'已超期':'关注'}</em></div>`).join('')}</div>`:`<div class="weekly425-empty"><span>没有超过30天或超期的在外货。</span></div>`}
      <div class="weekly425-section-title"><strong>慢动库存</strong><span>${d.slowInventory.length} 个</span></div>${slow.length?`<div class="weekly425-table">${slow.map(r=>`<button type="button" data-product-id="${esc(r.product.id)}"><span>正式商品</span><div><strong>${esc(r.product.name)}</strong><small>${esc(r.product.code||'无编码')} · ${r.days} 天无成交 · 库存 ${fmtInt(r.stock)}</small></div><b>${safeMoney425(r.value)}</b><em>查看</em></button>`).join('')}</div>`:`<div class="weekly425-empty"><span>没有达到90天阈值的在手商品。</span></div>`}
      <div class="weekly425-section-title"><strong>同行在外货值集中度</strong></div>${d.concentration.holders.length?`<div class="weekly425-concentration"><div><span>第一持货人</span><strong>${esc(d.concentration.top?.name||'-')}</strong><small>${safeMoney425(d.concentration.top?.currentHoldingValue||0)} · ${percent425(d.concentration.topPct)}</small></div><div><span>前三持货人</span><strong>${percent425(d.concentration.top3Pct)}</strong><small>占全部在外货值</small></div></div><div class="weekly425-people">${d.concentration.holders.slice(0,8).map(p=>`<button data-person-key="${esc(p.key)}"><span>${esc(p.name)}</span><strong>${safeMoney425(p.currentHoldingValue)}</strong><small>${fmtInt(p.currentHoldingQty)} 件 · ${percent425(d.concentration.total?p.currentHoldingValue/d.concentration.total*100:0)}</small></button>`).join('')}</div>`:`<div class="weekly425-empty"><span>当前没有自有货在同行手里。</span></div>`}`;
  }

  function bucket425(label,b){return `<div><span>${esc(label)}</span><strong>${safeMoney425(b.amount)}</strong><small>${b.count} 笔</small></div>`;}
  function money425(d){
    const r=d.receivableAging,p=d.payableAging;
    const oldRecv=d.settlement.receivables.filter(x=>x.age>14).slice(0,12),oldPay=d.settlement.payables.filter(x=>x.age>14).slice(0,12);
    return `<div class="weekly425-section-title"><strong>应收账龄</strong><button data-weekly-action="settlement-receive">进入收款 ›</button></div><div class="weekly425-aging">${bucket425('0–7天',r.d0_7)}${bucket425('8–14天',r.d8_14)}${bucket425('15–30天',r.d15_30)}${bucket425('31天以上',r.d31)}</div>
      <div class="weekly425-section-title"><strong>应付账龄</strong><button data-weekly-action="settlement-pay">进入付款 ›</button></div><div class="weekly425-aging">${bucket425('0–7天',p.d0_7)}${bucket425('8–14天',p.d8_14)}${bucket425('15–30天',p.d15_30)}${bucket425('31天以上',p.d31)}</div>
      <div class="weekly425-section-title"><strong>超过14天的待结</strong></div>${oldRecv.length||oldPay.length?`<div class="weekly425-table">${[...oldRecv.map(x=>({...x,label:'待收'})),...oldPay.map(x=>({...x,label:'待付'}))].sort((a,b)=>b.age-a.age).map(x=>`<button data-settlement-kind="${esc(x.kind)}" data-settlement-id="${esc(x.id)}" data-settlement-direction="${x.direction}"><span>${x.label}</span><div><strong>${esc(x.person)} · ${esc(x.ref)}</strong><small>${esc(x.title)} · 未结 ${fmtInt(x.age)} 天</small></div><b>${safeMoney425(x.amount)}</b><em>处理</em></button>`).join('')}</div>`:`<div class="weekly425-empty"><span>没有超过14天的待收或待付。</span></div>`}`;
  }

  function weeklySummaryText425(d){
    const recv=d.settlement.receivables.reduce((s,r)=>s+n(r.amount),0),pay=d.settlement.payables.reduce((s,r)=>s+n(r.amount),0),topAlerts=d.alerts.filter(a=>a.level!=='data').slice(0,5);
    return [`漠翠进销存｜近7天经营复盘`,`周期：${d.currentStart} 至 ${addDays425(d.currentEnd,-1)}`,`成交：${d.current.count} 笔｜${safeMoney425(d.current.revenue)}｜毛利 ${safeMoney425(d.current.profit)}｜毛利率 ${marginText425(d.current.margin)}`,`对比前7天：成交额 ${changeText425(d.trend.revenuePct)}｜毛利 ${changeText425(d.trend.profitPct)}｜毛利率 ${d.trend.marginPoints===null?'无可比':`${d.trend.marginPoints>=0?'+':''}${d.trend.marginPoints.toFixed(1)}pp`}`,`当前待收 ${safeMoney425(recv)}｜待付 ${safeMoney425(pay)}｜同行在外货值 ${safeMoney425(d.concentration.total)}｜90天慢动库存 ${safeMoney425(d.slowInventory.reduce((s,x)=>s+x.value,0))}`,topAlerts.length?'需关注：'+topAlerts.map(x=>x.title).join('；'):'当前未触发主要异常规则'].join('\n');
  }

  async function getReviewLedger425(){const x=await dbGet('settings',REVIEW_LEDGER_ID);return x&&x.entries?x:{id:REVIEW_LEDGER_ID,version:1,entries:[],updatedAt:''};}
  async function saveReview425(d){const note=$('#weekly425Note')?.value.trim()||'';const ledger=await getReviewLedger425();const key=`${d.currentStart}_${addDays425(d.currentEnd,-1)}`;const entry={key,start:d.currentStart,end:addDays425(d.currentEnd,-1),savedAt:nowISO(),note,snapshot:{revenue:d.current.revenue,profit:d.current.profit,margin:d.current.margin,count:d.current.count,receivable:d.settlement.receivables.reduce((s,r)=>s+n(r.amount),0),payable:d.settlement.payables.reduce((s,r)=>s+n(r.amount),0),outsideValue:d.concentration.total,slowInventoryValue:d.slowInventory.reduce((s,x)=>s+x.value,0),alerts:d.alerts.map(a=>({level:a.level,type:a.type,title:a.title,detail:a.detail}))}};const i=ledger.entries.findIndex(x=>x.key===key);if(i>=0)ledger.entries[i]=entry;else ledger.entries.unshift(entry);ledger.entries=ledger.entries.sort((a,b)=>String(b.start).localeCompare(String(a.start))).slice(0,80);ledger.updatedAt=nowISO();await dbPut('settings',ledger);await writeAudit('weekly.review.save','system',key,`周复盘 ${entry.start} 至 ${entry.end} 已保存`,null,{note,alerts:entry.snapshot.alerts.length});showToast('本周复盘已保存');return entry;}

  async function history425(){const l=await getReviewLedger425();return l.entries||[];}
  function historyHtml425(rows){return rows.length?`<div class="weekly425-history">${rows.map(r=>`<button type="button" data-week-key="${esc(r.key)}"><div><strong>${esc(r.start)} — ${esc(r.end)}</strong><small>${fmtDateTime(r.savedAt)}${r.note?` · ${esc(r.note)}`:''}</small></div><div><span>${safeMoney425(r.snapshot?.revenue)}</span><small>${r.snapshot?.alerts?.length||0} 条提醒</small></div></button>`).join('')}</div>`:`<div class="weekly425-empty"><strong>还没有保存周复盘</strong><span>保存后这里只保留轻量快照，不复制业务账。</span></div>`;}
  async function openHistory425(key){const rows=await history425(),r=rows.find(x=>x.key===key);if(!r)return;openModal('历史周复盘',`<div class="weekly425-history-detail"><div class="weekly425-period"><strong>${esc(r.start)} — ${esc(r.end)}</strong><small>保存于 ${fmtDateTime(r.savedAt)}</small></div><div class="weekly425-metrics"><div><span>成交额</span><strong>${safeMoney425(r.snapshot?.revenue)}</strong></div><div><span>毛利润</span><strong>${safeMoney425(r.snapshot?.profit)}</strong></div><div><span>毛利率</span><strong>${r.snapshot?.margin===null?'—':percent425(r.snapshot?.margin)}</strong></div><div><span>成交笔数</span><strong>${fmtInt(r.snapshot?.count)}</strong></div></div><div class="weekly425-section-title"><strong>保存时提醒</strong></div>${r.snapshot?.alerts?.length?`<div class="weekly425-alert-list">${r.snapshot.alerts.map(a=>`<div class="weekly425-alert ${a.level}"><span class="weekly425-dot"></span><div><strong>${esc(a.title)}</strong><small>${esc(a.detail)}</small></div></div>`).join('')}</div>`:`<div class="weekly425-empty"><span>保存时没有提醒。</span></div>`}${r.note?`<div class="notice" style="margin-top:12px">复盘备注：${esc(r.note)}</div>`:''}</div>`,{full:true});}

  function bindActions425(d,root=document){
    $$('[data-weekly-action]',root).forEach(btn=>btn.onclick=()=>{const x=btn.dataset.weeklyAction;if(x==='settlement-receive')window.MocuiSettlement423?.open?.('receive');else if(x==='settlement-pay')window.MocuiSettlement423?.open?.('pay');else if(x==='loans')navigate('loans');else if(x==='external')navigate('external-goods');else if(x==='products')navigate('products');else if(x==='reports')navigate('reports');else if(x==='counterparty')window.MocuiCounterparty421?.openPerson?.(btn.dataset.personKey||'');});
    $$('[data-product-id]',root).forEach(btn=>btn.onclick=()=>{closeModal();navigate('product-detail',{id:btn.dataset.productId});});
    $$('[data-person-key]',root).forEach(btn=>btn.onclick=()=>window.MocuiCounterparty421?.openPerson?.(btn.dataset.personKey));
    $$('[data-settlement-kind]',root).forEach(btn=>btn.onclick=()=>window.MocuiSettlement423?.openEntry?.(btn.dataset.settlementKind,btn.dataset.settlementId,btn.dataset.settlementDirection));
    $$('.weekly425-alert[data-alert-id]',root).forEach(btn=>{const a=d.alerts.find(x=>x.id===btn.dataset.alertId);if(!a?.action)return;btn.onclick=()=>{if(a.action==='settlement-receive')window.MocuiSettlement423?.open?.('receive');else if(a.action==='settlement-pay')window.MocuiSettlement423?.open?.('pay');else if(a.action==='loans'){closeModal();navigate('loans');}else if(a.action==='external'){closeModal();navigate('external-goods');}else if(a.action==='products'){closeModal();navigate('products');}else if(a.action==='reports'){closeModal();navigate('reports');}else if(a.action==='counterparty')window.MocuiCounterparty421?.openPerson?.(a.personKey);};});
  }

  async function openWeeklyReview425(initial='overview'){
    const [d,hist]=await Promise.all([collect425(),history425()]);let tab=initial;
    openModal('周复盘与异常提醒',`<div class="weekly425-wrap"><div class="weekly425-top"><div><span>经营助手</span><strong>近7天复盘</strong><small>只提示数据异常，不替你做经营判断</small></div><button id="weekly425Copy" type="button">复制简报</button></div><div class="weekly425-tabs"><button data-tab="overview" class="${tab==='overview'?'active':''}">概览</button><button data-tab="alerts" class="${tab==='alerts'?'active':''}">提醒 ${d.alerts.filter(a=>a.level!=='data').length}</button><button data-tab="goods" class="${tab==='goods'?'active':''}">货与同行</button><button data-tab="money" class="${tab==='money'?'active':''}">账款</button><button data-tab="history" class="${tab==='history'?'active':''}">历史</button></div><div id="weekly425Body"></div></div>`,{full:true,onOpen:()=>{
      const body=$('#weekly425Body');
      const draw=()=>{
        if(tab==='overview')body.innerHTML=`${overview425(d)}<div class="weekly425-section-title"><strong>本周需关注</strong><button id="weekly425SeeAlerts" type="button">全部提醒 ›</button></div>${alerts425({...d,alerts:d.alerts.slice(0,4)})}<div class="weekly425-save"><label>本周复盘备注</label><textarea id="weekly425Note" class="textarea" placeholder="例如：碧玉补货先暂停；老李下周一结算；两只慢动白镯准备重新拍图"></textarea><button id="weekly425Save" class="btn block" type="button">保存本周复盘快照</button></div>`;
        else if(tab==='alerts')body.innerHTML=alerts425(d);
        else if(tab==='goods')body.innerHTML=goods425(d);
        else if(tab==='money')body.innerHTML=money425(d);
        else body.innerHTML=historyHtml425(hist);
        bindActions425(d,body);
        if($('#weekly425SeeAlerts'))$('#weekly425SeeAlerts').onclick=()=>{tab='alerts';$$('.weekly425-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));draw();};
        if($('#weekly425Save'))$('#weekly425Save').onclick=async()=>{await saveReview425(d);};
        $$('.weekly425-history [data-week-key]',body).forEach(b=>b.onclick=()=>openHistory425(b.dataset.weekKey));
      };
      $$('.weekly425-tabs button').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;$$('.weekly425-tabs button').forEach(x=>x.classList.toggle('active',x===btn));draw();});
      $('#weekly425Copy').onclick=async()=>{const txt=weeklySummaryText425(d);try{if(typeof copyText==='function')await copyText(txt);else await navigator.clipboard.writeText(txt);showToast('周复盘简报已复制');}catch(_){showToast('复制失败');}};draw();
    }});
  }

  async function enhanceDashboard425(){
    if(appState.route!=='dashboard'||document.querySelector('#weekly425Dashboard'))return;const d=await collect425(),main=$('#main');if(!main)return;const meaningful=d.alerts.filter(a=>a.level!=='data'),critical=meaningful.filter(a=>a.level==='critical').length;
    const card=document.createElement('button');card.id='weekly425Dashboard';card.className=`weekly425-dashboard ${critical?'critical':meaningful.length?'attention':''}`;card.type='button';card.innerHTML=`<div><span>经营提醒 · 近7天</span><strong>${meaningful.length?`${meaningful.length} 项需要看`:'当前无主要异常'}</strong><small>${meaningful.length?esc(meaningful.slice(0,2).map(x=>x.title).join(' · ')):`成交 ${safeMoney425(d.current.revenue)} · 毛利率 ${marginText425(d.current.margin)}`}</small></div><div><b>${critical?`${critical} 项优先`:meaningful.length?'查看':'复盘'}</b><span>›</span></div>`;
    const anchor=document.querySelector('#daily424Dashboard')||document.querySelector('#workflow42DailyPanel');if(anchor)anchor.insertAdjacentElement('afterend',card);else main.prepend(card);card.onclick=()=>openWeeklyReview425(meaningful.length?'alerts':'overview');
  }

  async function enhanceMore425(){
    if(appState.route!=='more'||document.querySelector('#weekly425More'))return;const main=$('#main');if(!main)return;const sec=document.createElement('section');sec.id='weekly425More';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">经营复盘</div><div class="list"><div id="weekly425MoreOpen" class="list-item clickable"><div class="thumb placeholder">周</div><div class="item-main"><div class="item-title">周复盘与异常提醒</div><div class="item-meta">趋势、慢动库存、账龄、同行在外货值集中度</div></div><div>›</div></div></div>`;const anchor=document.querySelector('#daily424MoreEntry')||document.querySelector('#settle423MoreEntry')||main.firstElementChild;anchor?.insertAdjacentElement('afterend',sec);$('#weekly425MoreOpen').onclick=()=>openWeeklyReview425();
  }

  async function enhanceReports425(){
    if(appState.route!=='reports'||document.querySelector('#weekly425ReportEntry'))return;const main=$('#main');if(!main)return;const btn=document.createElement('button');btn.id='weekly425ReportEntry';btn.className='weekly425-report-entry';btn.type='button';btn.innerHTML='<span><strong>近7天经营复盘</strong><small>对比前7天 · 查看异常提醒</small></span><b>›</b>';const anchor=$('#reportMode')||main.firstElementChild;anchor?.insertAdjacentElement('beforebegin',btn);btn.onclick=()=>openWeeklyReview425();
  }

  renderDashboard=async function(){const r=await originalRenderDashboard425.apply(this,arguments);try{await enhanceDashboard425();}catch(e){console.warn('[v4.2.5 dashboard]',e);}return r;};
  renderMore=async function(){const r=await originalRenderMore425.apply(this,arguments);try{await enhanceMore425();}catch(e){console.warn('[v4.2.5 more]',e);}return r;};
  renderReports=async function(){const r=await originalRenderReports425.apply(this,arguments);try{await enhanceReports425();}catch(e){console.warn('[v4.2.5 reports]',e);}return r;};

  window.MocuiWeeklyReview425={version:VERSION,collect:collect425,open:openWeeklyReview425,rules:{...RULES},summary:weeklySummaryText425};
})();
