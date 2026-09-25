'use strict';

(function(){
  const VERSION='4.2.6';
  const SNAPSHOT_ID='capitalReviewLedgerV1';
  const ACTION_ID='capitalCategoryActionsV1';
  const originalRenderDashboard426=renderDashboard;
  const originalRenderMore426=renderMore;
  const originalRenderReports426=renderReports;
  const originalRenderProducts426=renderProducts;
  const DAY=86400000;

  function dayKey426(value=new Date()){
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
    const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function noon426(day){return new Date(`${day}T12:00:00`);}
  function addDays426(day,delta){const d=noon426(day);d.setDate(d.getDate()+delta);return dayKey426(d);}
  function ageDays426(value,today=dayKey426()){
    const d=dayKey426(value);if(!d)return 0;return Math.max(0,Math.floor((noon426(today)-noon426(d))/DAY));
  }
  function pct426(v){return `${((Number(v)||0)*100).toFixed(1)}%`;}
  function money426(v){return fmtMoney(Number(v)||0);}
  function activeSale426(s){if(typeof saleIsHistorical==='function'&&saleIsHistorical(s))return false;return typeof saleIsReportActive==='function'?saleIsReportActive(s):s?.status==='active';}
  function saleDate426(s){return String(s?.businessDate||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||dayKey426(s?.createdAt||s?.updatedAt);}
  function loanOpen426(l){return typeof loanIsOpen==='function'?loanIsOpen(l):l?.status!=='returned';}
  function loanRemaining426(l,i){return typeof loanItemRemaining==='function'?Math.max(0,n(loanItemRemaining(l,i))):Math.max(0,n(i.qty)-n(i.returnedQty)-n(i.soldQty));}
  function saleProfit426(s){return typeof saleGrossProfit==='function'?saleGrossProfit(s):n(s.finalAmount)-(s.items||[]).reduce((a,i)=>a+n(i.costPrice)*n(i.qty),0);}
  function root426(value){return typeof categoryRootLabel==='function'?categoryRootLabel(value||''):(String(value||'未分类').split('/')[0]||'未分类');}

  async function getActions426(){const x=await dbGet('settings',ACTION_ID);return x&&x.rows?x:{id:ACTION_ID,version:1,rows:{},updatedAt:''};}
  async function setAction426(category,state,note=''){
    const ledger=await getActions426();
    if(!state){delete ledger.rows[category];}
    else ledger.rows[category]={state,note:String(note||'').trim(),updatedAt:nowISO()};
    ledger.updatedAt=nowISO();await dbPut('settings',ledger);
    await writeAudit('capital.category_action','system',category,`${category} · ${state||'清除动作'}`,null,{state,note});
    return ledger;
  }
  function actionName426(state){return ({pause:'暂缓补货',observe:'保持观察',watch:'重点看货'}[state]||'未设置');}

  function slowFallback426(products,sales,today){
    const last=new Map();
    for(const s of sales.filter(activeSale426))for(const i of s.items||[]){const d=s.createdAt||s.businessDate||'';const old=last.get(i.productId);if(!old||new Date(d)>new Date(old))last.set(i.productId,d);}
    return products.filter(p=>!p.historicalOnly&&n(p.stock)>0).map(p=>{const ref=last.get(p.id)||p.createdAt||p.updatedAt||'';return {product:p,days:ageDays426(ref,today),value:n(p.stock)*n(p.costPrice),stock:n(p.stock),lastSaleAt:last.get(p.id)||''};}).filter(x=>x.days>=90).sort((a,b)=>b.value-a.value);
  }

  function bucketProductAges426(products,sales,today){
    const last=new Map();
    for(const s of sales.filter(activeSale426))for(const i of s.items||[]){const d=s.createdAt||s.businessDate||'';const old=last.get(i.productId);if(!old||new Date(d)>new Date(old))last.set(i.productId,d);}
    const buckets={d0_30:{label:'0–30天',value:0,count:0},d31_90:{label:'31–90天',value:0,count:0},d91_180:{label:'91–180天',value:0,count:0},d181:{label:'181天以上',value:0,count:0}};
    for(const p of products.filter(x=>!x.historicalOnly&&n(x.stock)>0)){
      const days=ageDays426(last.get(p.id)||p.createdAt||p.updatedAt||'',today),value=n(p.stock)*n(p.costPrice);let b=days<=30?buckets.d0_30:days<=90?buckets.d31_90:days<=180?buckets.d91_180:buckets.d181;b.value+=value;b.count++;
    }
    return buckets;
  }

  async function collect426(){
    const today=dayKey426(),start90=addDays426(today,-89),end=addDays426(today,1);
    const [products,sales,loans,external,settlement,weekly,actions]=await Promise.all([
      dbAll('products'),dbAll('sales'),dbAll('loans'),
      typeof getExternalGoods==='function'?getExternalGoods():Promise.resolve([]),
      window.MocuiSettlement423?.collect?window.MocuiSettlement423.collect():Promise.resolve({receivables:[],payables:[]}),
      window.MocuiWeeklyReview425?.collect?window.MocuiWeeklyReview425.collect():Promise.resolve(null),
      getActions426()
    ]);
    const productById=new Map(products.map(p=>[p.id,p]));
    const catalog=products.filter(p=>!p.historicalOnly&&n(p.stock)>0);
    const inStockCost=catalog.reduce((a,p)=>a+n(p.stock)*n(p.costPrice),0);
    let outsideOwnedCost=0,outsideOwnedQty=0;
    const loanExposure=[];
    for(const l of loans){if(!loanOpen426(l)||l.type!=='lend')continue;let value=0,qty=0;for(const i of l.items||[]){const remain=loanRemaining426(l,i);value+=remain*n(i.costPrice);qty+=remain;}if(value||qty){outsideOwnedCost+=value;outsideOwnedQty+=qty;loanExposure.push({loan:l,value,qty,days:ageDays426(l.date||l.createdAt,today)});}}
    const externalOpen=(external||[]).filter(r=>r.status==='held'||r.status==='out');
    const externalResponsibility=externalOpen.reduce((a,r)=>a+n(r.ownerCostAmount),0);
    const receivable=(settlement.receivables||[]).reduce((a,r)=>a+n(r.amount),0),payable=(settlement.payables||[]).reduce((a,r)=>a+n(r.amount),0);
    const operationalExposure=inStockCost+outsideOwnedCost+receivable;
    const slow=weekly?.slowInventory||slowFallback426(products,sales,today);
    const slowValue=slow.reduce((a,r)=>a+n(r.value),0);
    const ageBuckets=bucketProductAges426(products,sales,today);

    const recentSales=sales.filter(s=>activeSale426(s)&&saleDate426(s)>=start90&&saleDate426(s)<end);
    const categories=new Map();
    const ensure=(name)=>{if(!categories.has(name))categories.set(name,{name,stockValue:0,outsideValue:0,ownedValue:0,stockQty:0,outsideQty:0,sku:0,revenue90:0,profit90:0,qty90:0,orders:new Set(),slowValue:0,slowSku:0,products:[]});return categories.get(name);};
    for(const p of catalog){const c=ensure(root426(p.category));const value=n(p.stock)*n(p.costPrice);c.stockValue+=value;c.stockQty+=n(p.stock);c.sku++;c.products.push(p);}
    for(const l of loans){if(!loanOpen426(l)||l.type!=='lend')continue;for(const i of l.items||[]){const remain=loanRemaining426(l,i);if(remain<=0)continue;const p=productById.get(i.productId)||{},c=ensure(root426(p.category||i.category));c.outsideValue+=remain*n(i.costPrice);c.outsideQty+=remain;}}
    for(const s of recentSales){for(const i of s.items||[]){const p=productById.get(i.productId)||{},c=ensure(root426(p.category||i.category));const gross=n(i.price)*n(i.qty),subtotal=n(s.subtotal)||((s.items||[]).reduce((a,x)=>a+n(x.price)*n(x.qty),0));const net=subtotal>0?gross*(n(s.finalAmount)/subtotal):gross;c.revenue90+=net;c.profit90+=net-n(i.costPrice)*n(i.qty);c.qty90+=n(i.qty);c.orders.add(s.id);}}
    for(const row of slow){const p=row.product||productById.get(row.productId);if(!p)continue;const c=ensure(root426(p.category));c.slowValue+=n(row.value);c.slowSku++;}
    const rows=[...categories.values()];rows.forEach(c=>{c.ownedValue=c.stockValue+c.outsideValue;c.orders90=c.orders.size;delete c.orders;});
    const totalOwned=rows.reduce((a,c)=>a+c.ownedValue,0),totalRevenue90=rows.reduce((a,c)=>a+c.revenue90,0),totalOrders90=recentSales.length;
    rows.forEach(c=>{
      c.inventoryShare=totalOwned?c.ownedValue/totalOwned:0;c.salesShare=totalRevenue90?c.revenue90/totalRevenue90:0;c.slowRatio=c.stockValue?c.slowValue/c.stockValue:0;c.activityRef=c.ownedValue?c.revenue90/c.ownedValue:null;
      c.signal='样本不足';c.signalClass='muted';c.signalDetail='近90天成交样本不足，先看原始数据。';
      if(totalOrders90>=5){
        if(c.inventoryShare>=.15&&(c.revenue90===0||c.salesShare<c.inventoryShare*.4)){c.signal='资金偏重';c.signalClass='attention';c.signalDetail=`自有货值占 ${pct426(c.inventoryShare)}，近90天成交占 ${pct426(c.salesShare)}。`;}
        else if(c.orders90>=3&&c.salesShare>=.15&&c.inventoryShare<c.salesShare*.5){c.signal='供给偏轻';c.signalClass='watch';c.signalDetail=`近90天成交占 ${pct426(c.salesShare)}，自有货值占 ${pct426(c.inventoryShare)}。`;}
        else if(c.stockValue>0&&c.slowRatio>=.5&&c.inventoryShare>=.05){c.signal='慢动偏高';c.signalClass='attention';c.signalDetail=`当前在库中 ${pct426(c.slowRatio)} 的成本货值已90天无成交。`;}
        else {c.signal='结构接近';c.signalClass='ok';c.signalDetail='库存占比与近90天成交占比暂未出现明显背离。';}
      }
      c.userAction=actions.rows?.[c.name]||null;
    });
    rows.sort((a,b)=>b.ownedValue-a.ownedValue||b.revenue90-a.revenue90);

    const release=[];
    for(const r of (settlement.receivables||[]).filter(x=>n(x.age)>=30))release.push({type:'待收',title:`${r.person} · ${r.ref}`,detail:`${r.title} · ${r.age}天`,value:n(r.amount),action:'receive',kind:r.kind,id:r.id,direction:r.direction});
    for(const r of slow)release.push({type:'慢动',title:r.product?.name||'商品',detail:`${r.days}天无成交 · ${r.product?.code||''}`,value:n(r.value),action:'product',productId:r.product?.id});
    for(const r of loanExposure.filter(x=>x.days>=30))release.push({type:'在外',title:`${r.loan.person} · ${r.loan.loanNo||'调借'}`,detail:`已在外 ${r.days} 天 · ${fmtInt(r.qty)}件`,value:r.value,action:'loans'});
    release.sort((a,b)=>b.value-a.value);

    return {today,start90,end,products,sales,loans,external,settlement,weekly,actions,inStockCost,outsideOwnedCost,outsideOwnedQty,totalOwnedCost:inStockCost+outsideOwnedCost,externalResponsibility,receivable,payable,operationalExposure,slow,slowValue,ageBuckets,categories:rows,totalOwned,totalRevenue90,totalOrders90,recentSales,release};
  }

  function metric426(label,value,help=''){return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong>${help?`<small>${esc(help)}</small>`:''}</div>`;}
  function overview426(d){
    return `<div class="capital426-note"><strong>这里看的是经营资金占用，不是会计资产负债表。</strong><span>自有货与外部同行货分开；待收与待付也不会自动冲抵。</span></div>
      <div class="capital426-metrics">${metric426('自有货总成本',money426(d.totalOwnedCost),`在库 ${money426(d.inStockCost)} · 在同行 ${money426(d.outsideOwnedCost)}`)}${metric426('当前待收',money426(d.receivable),'卖出但尚未实际收齐')}${metric426('当前待付',money426(d.payable),'尚未付给货主/来源')}${metric426('经营占用参考',money426(d.operationalExposure),'自有货成本 + 待收，非会计口径')}${metric426('90天慢动货值',money426(d.slowValue),`${d.slow.length} 个在手商品`)}${metric426('外部责任货值',money426(d.externalResponsibility),'别人货的底价，不计入你的自有库存')}</div>
      <div class="capital426-section-title"><strong>在库未成交时间结构</strong><span>按商品最近成交/建档时间参考</span></div><div class="capital426-age">${Object.values(d.ageBuckets).map(b=>`<div><span>${b.label}</span><strong>${money426(b.value)}</strong><small>${b.count} 个商品</small></div>`).join('')}</div>
      <div class="capital426-section-title"><strong>品类资金结构</strong><button data-cap-tab="categories">查看全部 ›</button></div>${categoryTable426(d,d.categories.slice(0,6))}
      <div class="capital426-section-title"><strong>资金释放观察</strong><span>按金额排序，不代表优先级结论</span></div>${release426(d,d.release.slice(0,6))}`;
  }

  function categoryTable426(d,rows){
    if(!rows.length)return '<div class="capital426-empty">暂无可分析品类。</div>';
    return `<div class="capital426-category-list">${rows.map(c=>`<button type="button" data-category="${esc(c.name)}"><div class="capital426-cat-head"><div><strong>${esc(c.name)}</strong>${c.userAction?`<em>${esc(actionName426(c.userAction.state))}</em>`:''}</div><span class="${c.signalClass}">${esc(c.signal)}</span></div><div class="capital426-cat-grid"><span>自有货值 <b>${money426(c.ownedValue)}</b></span><span>近90天成交 <b>${money426(c.revenue90)}</b></span><span>库存占比 <b>${pct426(c.inventoryShare)}</b></span><span>成交占比 <b>${pct426(c.salesShare)}</b></span></div><small>${esc(c.signalDetail)}</small></button>`).join('')}</div>`;
  }

  function categories426(d){
    return `<div class="capital426-note"><strong>不要把“供给偏轻”直接理解成应该补货。</strong><span>它只说明近90天成交占比高于当前自有货值占比，品质、价格带、货源机会仍需你自己判断。</span></div>${categoryTable426(d,d.categories)}`;
  }

  function slow426(d){
    const rows=d.slow.slice(0,40);return `<div class="capital426-section-title"><strong>90天慢动库存</strong><span>${d.slow.length} 个 · ${money426(d.slowValue)}</span></div>${rows.length?`<div class="capital426-table">${rows.map(r=>`<button data-product-id="${esc(r.product?.id||'')}"><span>慢动</span><div><strong>${esc(r.product?.name||'未命名')}</strong><small>${esc(r.product?.code||'')} · ${r.days}天无成交 · 库存 ${fmtInt(r.stock)}</small></div><b>${money426(r.value)}</b><em>查看</em></button>`).join('')}</div>`:'<div class="capital426-empty">当前没有达到90天阈值的在手商品。</div>'}`;
  }

  function release426(d,rows=d.release){
    if(!rows.length)return '<div class="capital426-empty">当前没有达到观察阈值的资金项。</div>';
    return `<div class="capital426-table">${rows.map((r,idx)=>`<button data-release-index="${idx}" data-release-title="${esc(r.title)}"><span>${esc(r.type)}</span><div><strong>${esc(r.title)}</strong><small>${esc(r.detail)}</small></div><b>${money426(r.value)}</b><em>处理</em></button>`).join('')}</div>`;
  }

  function actions426(d){
    const rows=d.categories.filter(c=>c.userAction);return `<div class="capital426-note"><strong>这些动作全部由你手工设置。</strong><span>系统不会因为“资金偏重/供给偏轻”自动替你改成暂停或补货。</span></div>${rows.length?`<div class="capital426-action-list">${rows.map(c=>`<button data-category="${esc(c.name)}"><div><strong>${esc(c.name)}</strong><span>${esc(actionName426(c.userAction.state))}</span></div><small>${esc(c.userAction.note||'无备注')} · ${fmtDateTime(c.userAction.updatedAt)}</small></button>`).join('')}</div>`:'<div class="capital426-empty">还没有设置品类动作。可在“品类结构”里点开某个品类设置。</div>'}`;
  }

  async function snapshotLedger426(){const x=await dbGet('settings',SNAPSHOT_ID);return x&&x.entries?x:{id:SNAPSHOT_ID,version:1,entries:[],updatedAt:''};}
  async function saveSnapshot426(d){
    const ledger=await snapshotLedger426(),month=d.today.slice(0,7),note=$('#capital426Note')?.value.trim()||'';
    const entry={month,savedAt:nowISO(),note,snapshot:{inStockCost:d.inStockCost,outsideOwnedCost:d.outsideOwnedCost,totalOwnedCost:d.totalOwnedCost,receivable:d.receivable,payable:d.payable,slowValue:d.slowValue,externalResponsibility:d.externalResponsibility,categories:d.categories.map(c=>({name:c.name,ownedValue:c.ownedValue,revenue90:c.revenue90,inventoryShare:c.inventoryShare,salesShare:c.salesShare,signal:c.signal,userAction:c.userAction?.state||''}))}};
    const i=ledger.entries.findIndex(x=>x.month===month);if(i>=0)ledger.entries[i]=entry;else ledger.entries.unshift(entry);ledger.entries=ledger.entries.sort((a,b)=>b.month.localeCompare(a.month)).slice(0,36);ledger.updatedAt=nowISO();await dbPut('settings',ledger);await writeAudit('capital.review.save','system',month,`${month} 资金结构快照已保存`,null,{note,totalOwnedCost:d.totalOwnedCost,receivable:d.receivable,payable:d.payable});showToast('本月资金快照已保存');return entry;
  }
  async function history426(){return (await snapshotLedger426()).entries||[];}
  function historyHtml426(rows){return rows.length?`<div class="capital426-history">${rows.map(r=>`<button data-cap-history="${esc(r.month)}"><div><strong>${esc(r.month)}</strong><small>${fmtDateTime(r.savedAt)}${r.note?` · ${esc(r.note)}`:''}</small></div><div><span>${money426(r.snapshot?.totalOwnedCost)}</span><small>自有货成本</small></div></button>`).join('')}</div>`:'<div class="capital426-empty">还没有保存月度资金快照。</div>';}
  async function openHistory426(month){const rows=await history426(),r=rows.find(x=>x.month===month);if(!r)return;openModal(`${month} · 资金快照`,`<div class="capital426-history-detail"><div class="capital426-metrics">${metric426('自有货成本',money426(r.snapshot?.totalOwnedCost))}${metric426('待收',money426(r.snapshot?.receivable))}${metric426('待付',money426(r.snapshot?.payable))}${metric426('慢动货值',money426(r.snapshot?.slowValue))}</div><div class="capital426-section-title"><strong>当时品类结构</strong></div>${r.snapshot?.categories?.length?`<div class="capital426-table">${r.snapshot.categories.slice(0,20).map(c=>`<div><span>${esc(c.signal||'')}</span><div><strong>${esc(c.name)}</strong><small>库存占 ${pct426(c.inventoryShare)} · 成交占 ${pct426(c.salesShare)}</small></div><b>${money426(c.ownedValue)}</b><em>${esc(c.userAction?actionName426(c.userAction):'')}</em></div>`).join('')}</div>`:'<div class="capital426-empty">无品类快照。</div>'}${r.note?`<div class="notice" style="margin-top:12px">备注：${esc(r.note)}</div>`:''}</div>`,{full:true});}

  async function openCategory426(d,name){
    const c=d.categories.find(x=>x.name===name);if(!c)return;
    const productRows=c.products.sort((a,b)=>n(b.stock)*n(b.costPrice)-n(a.stock)*n(a.costPrice)).slice(0,20);
    openModal(`${name} · 资金结构`,`<div class="capital426-category-detail"><div class="capital426-metrics">${metric426('自有货值',money426(c.ownedValue),`在库 ${money426(c.stockValue)} · 在外 ${money426(c.outsideValue)}`)}${metric426('近90天成交',money426(c.revenue90),`${c.orders90} 笔 · ${fmtInt(c.qty90)} 件`)}${metric426('近90天毛利',money426(c.profit90))}${metric426('90天慢动',money426(c.slowValue),c.stockValue?`占在库 ${pct426(c.slowRatio)}`:'无在库')}</div><div class="capital426-signal ${c.signalClass}"><strong>${esc(c.signal)}</strong><span>${esc(c.signalDetail)}</span></div><div class="capital426-section-title"><strong>我的动作</strong><span>手工设置，不由系统决定</span></div><div class="capital426-action-buttons"><button data-cap-state="pause" class="${c.userAction?.state==='pause'?'active':''}">暂缓补货</button><button data-cap-state="observe" class="${c.userAction?.state==='observe'?'active':''}">保持观察</button><button data-cap-state="watch" class="${c.userAction?.state==='watch'?'active':''}">重点看货</button><button data-cap-state="">清除</button></div><textarea id="capital426ActionNote" class="textarea" placeholder="例如：颜色断档才补；只看高品质；先消化旧货">${esc(c.userAction?.note||'')}</textarea><div class="capital426-section-title"><strong>当前在库商品</strong><span>${c.sku} 个SKU</span></div>${productRows.length?`<div class="capital426-table">${productRows.map(p=>`<button data-product-id="${esc(p.id)}"><span>商品</span><div><strong>${esc(p.name)}</strong><small>${esc(p.code||'')} · 库存 ${fmtInt(p.stock)}</small></div><b>${money426(n(p.stock)*n(p.costPrice))}</b><em>查看</em></button>`).join('')}</div>`:'<div class="capital426-empty">当前没有在手商品。</div>'}</div>`,{full:true,onOpen:()=>{
      $$('[data-cap-state]').forEach(btn=>btn.onclick=async()=>{const state=btn.dataset.capState,note=$('#capital426ActionNote').value;await setAction426(c.name,state,note);c.userAction=state?{state,note,updatedAt:nowISO()}:null;$$('[data-cap-state]').forEach(x=>x.classList.toggle('active',x.dataset.capState===state&&!!state));showToast(state?`已设置：${actionName426(state)}`:'已清除品类动作');});
      $$('[data-product-id]').forEach(btn=>btn.onclick=()=>{closeModal();navigate('product-detail',{id:btn.dataset.productId});});
    }});
  }

  function summary426(d){
    const top=d.categories.slice(0,5).map(c=>`${c.name} ${money426(c.ownedValue)}（库存占${pct426(c.inventoryShare)} / 90天成交占${pct426(c.salesShare)}）`).join('；');
    return [`漠翠进销存｜资金占用与补货观察`,`日期：${d.today}`,`自有货成本 ${money426(d.totalOwnedCost)}｜在库 ${money426(d.inStockCost)}｜同行在外 ${money426(d.outsideOwnedCost)}`,`待收 ${money426(d.receivable)}｜待付 ${money426(d.payable)}｜90天慢动 ${money426(d.slowValue)}`,`外部责任货值 ${money426(d.externalResponsibility)}（不计入自有库存）`,top?`品类前五：${top}`:'暂无品类数据'].join('\n');
  }

  function bind426(d,root=document){
    $$('[data-category]',root).forEach(b=>b.onclick=()=>openCategory426(d,b.dataset.category));
    $$('[data-product-id]',root).forEach(b=>b.onclick=()=>{closeModal();navigate('product-detail',{id:b.dataset.productId});});
    $$('[data-release-index]',root).forEach((b,idx)=>b.onclick=()=>{const r=d.release[idx];if(!r)return;if(r.action==='receive')window.MocuiSettlement423?.openEntry?.(r.kind,r.id,r.direction);else if(r.action==='product'){closeModal();navigate('product-detail',{id:r.productId});}else if(r.action==='loans'){closeModal();navigate('loans');}});
  }

  async function openCapital426(initial='overview'){
    const [d,hist]=await Promise.all([collect426(),history426()]);let tab=initial;
    openModal('资金占用与补货观察',`<div class="capital426-wrap"><div class="capital426-top"><div><span>经营助手</span><strong>资金结构</strong><small>把钱压在哪里讲清楚，不自动替你进货</small></div><button id="capital426Copy" type="button">复制摘要</button></div><div class="capital426-tabs"><button data-tab="overview" class="active">总览</button><button data-tab="categories">品类</button><button data-tab="slow">慢动</button><button data-tab="actions">我的动作</button><button data-tab="history">历史</button></div><div id="capital426Body"></div></div>`,{full:true,onOpen:()=>{
      const body=$('#capital426Body');
      const draw=()=>{
        $$('.capital426-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
        if(tab==='overview')body.innerHTML=`${overview426(d)}<div class="capital426-save"><label>本月资金备注</label><textarea id="capital426Note" class="textarea" placeholder="例如：本月不增加普通碧玉库存；白玉只补明确缺口；先收回两笔30天以上应收"></textarea><button id="capital426Save" class="btn block" type="button">保存本月资金快照</button></div>`;
        else if(tab==='categories')body.innerHTML=categories426(d);
        else if(tab==='slow')body.innerHTML=slow426(d);
        else if(tab==='actions')body.innerHTML=actions426(d);
        else body.innerHTML=historyHtml426(hist);
        bind426(d,body);
        $$('[data-cap-tab]',body).forEach(b=>b.onclick=()=>{tab=b.dataset.capTab;draw();});
        if($('#capital426Save'))$('#capital426Save').onclick=()=>saveSnapshot426(d);
        $$('[data-cap-history]',body).forEach(b=>b.onclick=()=>openHistory426(b.dataset.capHistory));
      };
      $$('.capital426-tabs button').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;draw();});
      $('#capital426Copy').onclick=async()=>{try{const txt=summary426(d);if(typeof copyText==='function')await copyText(txt);else await navigator.clipboard.writeText(txt);showToast('资金摘要已复制');}catch(_){showToast('复制失败');}};
      draw();
    }});
  }

  async function enhanceDashboard426(){
    if(appState.route!=='dashboard'||document.querySelector('#capital426Dashboard'))return;const d=await collect426(),main=$('#main');if(!main)return;
    const card=document.createElement('button');card.id='capital426Dashboard';card.className='capital426-dashboard';card.type='button';card.innerHTML=`<div><span>资金占用</span><strong>自有货 ${money426(d.totalOwnedCost)}</strong><small>待收 ${money426(d.receivable)} · 90天慢动 ${money426(d.slowValue)}</small></div><div><b>看结构</b><span>›</span></div>`;
    const anchor=document.querySelector('#weekly425Dashboard')||document.querySelector('#daily424Dashboard');if(anchor)anchor.insertAdjacentElement('afterend',card);else main.prepend(card);card.onclick=()=>openCapital426();
  }
  async function enhanceMore426(){
    if(appState.route!=='more'||document.querySelector('#capital426More'))return;const main=$('#main');if(!main)return;const sec=document.createElement('section');sec.id='capital426More';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">资金与补货</div><div class="list"><div id="capital426MoreOpen" class="list-item clickable"><div class="thumb placeholder">资</div><div class="item-main"><div class="item-title">资金占用与补货观察</div><div class="item-meta">自有货成本、慢动库存、90天品类动销、手工补货动作</div></div><div>›</div></div></div>`;const anchor=document.querySelector('#weekly425More')||main.firstElementChild;anchor?.insertAdjacentElement('afterend',sec);$('#capital426MoreOpen').onclick=()=>openCapital426();
  }
  async function enhanceReports426(){
    if(appState.route!=='reports'||document.querySelector('#capital426ReportEntry'))return;const main=$('#main');if(!main)return;const btn=document.createElement('button');btn.id='capital426ReportEntry';btn.className='capital426-report-entry';btn.type='button';btn.innerHTML='<span><strong>资金结构与补货观察</strong><small>90天品类成交 × 当前自有货值</small></span><b>›</b>';const anchor=document.querySelector('#weekly425ReportEntry')||$('#reportMode')||main.firstElementChild;anchor?.insertAdjacentElement('afterend',btn);btn.onclick=()=>openCapital426();
  }
  async function enhanceProducts426(){
    if(appState.route!=='products'||document.querySelector('#capital426ProductsEntry'))return;const main=$('#main');if(!main)return;const btn=document.createElement('button');btn.id='capital426ProductsEntry';btn.className='capital426-products-entry';btn.type='button';btn.innerHTML='<span><strong>资金 / 补货观察</strong><small>不只看库存数量，查看资金结构</small></span><b>›</b>';const target=main.querySelector('.grid-3')||main.firstElementChild;target?.insertAdjacentElement('afterend',btn);btn.onclick=()=>openCapital426('categories');
  }

  renderDashboard=async function(){const r=await originalRenderDashboard426.apply(this,arguments);try{await enhanceDashboard426();}catch(e){console.warn('[v4.2.6 dashboard]',e);}return r;};
  renderMore=async function(){const r=await originalRenderMore426.apply(this,arguments);try{await enhanceMore426();}catch(e){console.warn('[v4.2.6 more]',e);}return r;};
  renderReports=async function(){const r=await originalRenderReports426.apply(this,arguments);try{await enhanceReports426();}catch(e){console.warn('[v4.2.6 reports]',e);}return r;};
  renderProducts=async function(){const r=await originalRenderProducts426.apply(this,arguments);try{await enhanceProducts426();}catch(e){console.warn('[v4.2.6 products]',e);}return r;};

  window.MocuiCapital426={version:VERSION,collect:collect426,open:openCapital426,summary:summary426,setAction:setAction426};
})();
