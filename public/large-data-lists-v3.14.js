'use strict';
(() => {
  const VERSION='3.14.0';
  const DB_NAME='mocui_list_perf_v314';
  const DB_VERSION=1;
  const PAGE_SIZE=50;
  const MAX_LOADED=250;
  const STORES=['sales','loans','stockMoves','customers'];
  let perfDB=null,writeHooksInstalled=false,renderersInstalled=false;
  const generation={sales:0,loans:0,ledger:0,customers:0};

  const reqP=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  function openPerf(){
    if(perfDB)return Promise.resolve(perfDB);
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        for(const name of STORES){
          if(d.objectStoreNames.contains(name))continue;
          const s=d.createObjectStore(name,{keyPath:'id'});
          s.createIndex('sortKey','sortKey',{unique:false});
          s.createIndex('statusSort','statusSort',{unique:false});
          s.createIndex('searchText','searchText',{unique:false});
        }
        if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'id'});
      };
      req.onsuccess=()=>{perfDB=req.result;resolve(perfDB);};
      req.onerror=()=>reject(req.error);
    });
  }
  const low=s=>String(s||'').toLowerCase();
  const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:0;};
  const sortKey=(row,store)=>store==='loans'?ts(row.date||row.createdAt):ts(row.createdAt||row.date);
  function lite(store,row){
    if(!row?.id)return null;
    const base={id:row.id,sortKey:sortKey(row,store),status:String(row.status||''),createdAt:row.createdAt||'',date:row.date||''};
    if(store==='sales')return {...base,orderNo:row.orderNo||'',customerName:row.customerName||'',customerId:row.customerId||'',finalAmount:Number(row.finalAmount||0),received:Number(row.received||0),sourceLoanNo:row.sourceLoanNo||'',sourceType:row.sourceType||'',importedHistorical:Boolean(row.importedHistorical),excludedFromReports:Boolean(row.excludedFromReports),note:row.note||'',items:(row.items||[]).map(i=>({productId:i.productId,productName:i.productName||'',qty:Number(i.qty||0),itemNote:i.itemNote||'',productNote:i.productNote||'',fromLoan:Boolean(i.fromLoan),loanNo:i.loanNo||''})),statusSort:`${row.status||''}|${String(9999999999999-sortKey(row,store)).padStart(13,'0')}`,searchText:low([row.orderNo,row.customerName,row.sourceLoanNo,row.note,...(row.items||[]).flatMap(i=>[i.productName,i.itemNote,i.productNote])].join(' '))};
    if(store==='loans')return {...base,loanNo:row.loanNo||'',type:row.type||'',person:row.person||'',expectedReturnDate:row.expectedReturnDate||'',note:row.note||'',items:(row.items||[]).map(i=>({productId:i.productId,productName:i.productName||'',productCode:i.productCode||'',qty:Number(i.qty||0),returnedQty:Number(i.returnedQty||0),soldQty:Number(i.soldQty||0)})),returns:(row.returns||[]).map(x=>({items:x.items||[]})),saleEvents:(row.saleEvents||[]).map(x=>({status:x.status,items:x.items||[]})),statusSort:`${row.status||''}|${String(9999999999999-sortKey(row,store)).padStart(13,'0')}`,searchText:low([row.loanNo,row.person,row.note,...(row.items||[]).flatMap(i=>[i.productName,i.productCode])].join(' '))};
    if(store==='stockMoves')return {...base,type:row.type||'',productName:row.productName||'',productCode:row.productCode||'',qtyChange:Number(row.qtyChange||0),beforeStock:Number(row.beforeStock||0),afterStock:Number(row.afterStock||0),note:row.note||'',statusSort:`${row.type||''}|${String(9999999999999-sortKey(row,store)).padStart(13,'0')}`,searchText:low([row.productName,row.productCode,row.note,row.type].join(' '))};
    if(store==='customers')return {...base,name:row.name||'',phone:row.phone||'',note:row.note||'',sortKey:ts(row.updatedAt||row.createdAt),statusSort:`all|${String(9999999999999-ts(row.updatedAt||row.createdAt)).padStart(13,'0')}`,searchText:low([row.name,row.phone,row.note].join(' '))};
    return null;
  }
  async function putLite(store,row){
    const value=lite(store,row);if(!value)return;
    const d=await openPerf();await reqP(d.transaction(store,'readwrite').objectStore(store).put(value));
  }
  async function delLite(store,id){
    const d=await openPerf();await reqP(d.transaction(store,'readwrite').objectStore(store).delete(id));
  }
  async function clearLite(store){
    const d=await openPerf();await reqP(d.transaction(store,'readwrite').objectStore(store).clear());
  }
  async function metaGet(id){const d=await openPerf();return reqP(d.transaction('meta','readonly').objectStore('meta').get(id));}
  async function metaPut(v){const d=await openPerf();return reqP(d.transaction('meta','readwrite').objectStore('meta').put(v));}
  async function sourceAll(store){
    if(typeof window.dbAll!=='function')return [];
    return window.dbAll(store);
  }
  async function rebuild(store,force=false){
    const ready=await metaGet(`ready:${store}`);
    if(ready?.ready&&!force)return;
    const rows=await sourceAll(store),d=await openPerf(),tx=d.transaction([store,'meta'],'readwrite'),os=tx.objectStore(store);
    os.clear();for(const row of rows){const v=lite(store,row);if(v)os.put(v);}
    tx.objectStore('meta').put({id:`ready:${store}`,ready:true,count:rows.length,at:Date.now()});
    await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});
  }
  async function ensure(store){const m=await metaGet(`ready:${store}`);if(!m?.ready)await rebuild(store,true);}
  async function page(store,{offset=0,limit=PAGE_SIZE,filter=null}={}){
    await ensure(store);const d=await openPerf(),os=d.transaction(store,'readonly').objectStore(store),idx=os.index('sortKey');
    return new Promise((resolve,reject)=>{
      const rows=[];let matched=0;
      const req=idx.openCursor(null,'prev');
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{const c=req.result;if(!c)return resolve({rows,hasMore:false});
        const v=c.value;if(!filter||filter(v)){if(matched++>=offset)rows.push(v);if(rows.length>limit)return resolve({rows:rows.slice(0,limit),hasMore:true});}
        c.continue();
      };
    });
  }
  async function count(store,filter=null){
    await ensure(store);const d=await openPerf(),os=d.transaction(store,'readonly').objectStore(store);
    if(!filter)return reqP(os.count());
    return new Promise((resolve,reject)=>{let n=0;const r=os.openCursor();r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c)return resolve(n);if(filter(c.value))n++;c.continue();};});
  }
  async function scanSearch(store,q,filter=null,limit=MAX_LOADED){
    await ensure(store);q=low(q).trim();const d=await openPerf(),os=d.transaction(store,'readonly').objectStore(store),idx=os.index('sortKey');
    return new Promise((resolve,reject)=>{const rows=[];const r=idx.openCursor(null,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||rows.length>=limit)return resolve(rows);const v=c.value;if((!filter||filter(v))&&(!q||v.searchText.includes(q)))rows.push(v);c.continue();};});
  }
  function loanRemaining(i){return Math.max(0,Number(i.qty||0)-Number(i.returnedQty||0)-Number(i.soldQty||0));}
  function loanOpen(l){return (l.items||[]).some(i=>loanRemaining(i)>0);}
  function loanPartial(l){const total=(l.items||[]).reduce((a,i)=>a+Number(i.qty||0),0),left=(l.items||[]).reduce((a,i)=>a+loanRemaining(i),0);return left>0&&left<total;}
  function loanOverdue(l){if(!loanOpen(l))return false;const due=new Date(l.expectedReturnDate||l.date||0);if(Number.isNaN(due.getTime()))return false;due.setHours(0,0,0,0);const now=new Date();now.setHours(0,0,0,0);return now>due;}
  function saleFilter(status,q){q=low(q).trim();return s=>!s.excludedFromReports&&(status==='all'||s.status===status)&&(!q||s.searchText.includes(q));}
  function loanFilter(status){return l=>status==='all'||(status==='active'?loanOpen(l):status==='partial'?loanPartial(l):status==='returned'?!loanOpen(l):status==='overdue'?loanOverdue(l):false);}
  function ledgerFilter(type,q){q=low(q).trim();return m=>(!type||m.type===type)&&(!q||m.searchText.includes(q));}
  function customerFilter(q){q=low(q).trim();return c=>!q||c.searchText.includes(q);}

  function installWriteHooks(){
    if(writeHooksInstalled||typeof window.dbPut!=='function')return false;
    writeHooksInstalled=true;
    const oldPut=window.dbPut,oldAdd=window.dbAdd,oldDelete=window.dbDelete,oldClear=window.dbClear;
    window.dbPut=async function(store,value,...rest){const r=await oldPut(store,value,...rest);if(STORES.includes(store))putLite(store,value).catch(()=>metaPut({id:`ready:${store}`,ready:false,at:Date.now()}));return r;};
    window.dbAdd=async function(store,value,...rest){const r=await oldAdd(store,value,...rest);if(STORES.includes(store))putLite(store,value).catch(()=>metaPut({id:`ready:${store}`,ready:false,at:Date.now()}));return r;};
    window.dbDelete=async function(store,id,...rest){const r=await oldDelete(store,id,...rest);if(STORES.includes(store))delLite(store,id).catch(()=>metaPut({id:`ready:${store}`,ready:false,at:Date.now()}));return r;};
    window.dbClear=async function(store,...rest){const r=await oldClear(store,...rest);if(STORES.includes(store))clearLite(store).then(()=>metaPut({id:`ready:${store}`,ready:true,count:0,at:Date.now()})).catch(()=>{});return r;};
    return true;
  }

  function appendMore(host,shown,total,onClick){
    let btn=document.getElementById('v314LoadMore');btn?.remove();
    if(shown>=total)return;
    btn=document.createElement('button');btn.id='v314LoadMore';btn.className='btn secondary block';btn.style.marginTop='12px';btn.textContent=`继续显示（约剩余 ${Math.max(0,total-shown)}）`;btn.onclick=onClick;host.insertAdjacentElement('afterend',btn);
  }

  async function renderSalesV314(){
    const gen=++generation.sales;
    setHeader('销售单管理','按需读取 · 撤销、恢复、复制重新开单',{label:'＋',onClick:()=>{appState.saleDraft=null;navigate('sale-new');}});
    $('#main').innerHTML=`<div class="segment" id="saleStatus"><button data-status="all" class="active">全部</button><button data-status="active">有效单</button><button data-status="cancelled">已撤销</button></div><div class="toolbar"><div class="search"><input id="saleSearch" placeholder="订单号、客户、商品"></div></div><div id="salesList" class="list"></div>`;
    let status='all',shown=PAGE_SIZE;
    const draw=async()=>{const q=$('#saleSearch')?.value||'',f=saleFilter(status,q);let rows,total;
      if(q){rows=await scanSearch('sales',q,s=>!s.excludedFromReports&&(status==='all'||s.status===status),shown);total=rows.length<shown?rows.length:shown+1;}
      else{const p=await page('sales',{offset:0,limit:shown,filter:f});rows=p.rows;total=p.hasMore?shown+1:rows.length;}
      if(gen!==generation.sales||appState.route!=='sales')return;
      const host=$('#salesList');host.innerHTML=rows.length?rows.map(s=>saleCard(s)).join(''):emptyState('▥','暂无销售单');
      $$('.sale-card').forEach(el=>el.onclick=async e=>{if(e.target.closest('button'))return;const full=await dbGet('sales',el.dataset.id);if(full)openSaleDetail(full);});
      $$('.cancel-sale').forEach(b=>b.onclick=()=>cancelSale(b.dataset.id));$$('.restore-sale').forEach(b=>b.onclick=()=>restoreSale(b.dataset.id));$$('.duplicate-sale').forEach(b=>b.onclick=()=>duplicateSale(b.dataset.id));
      appendMore(host,rows.length,total,()=>{shown=Math.min(MAX_LOADED,shown+PAGE_SIZE);draw();});
    };
    await draw();$('#saleSearch').oninput=()=>{shown=PAGE_SIZE;draw();};$$('#saleStatus button').forEach(b=>b.onclick=()=>{status=b.dataset.status;shown=PAGE_SIZE;$$('#saleStatus button').forEach(x=>x.classList.toggle('active',x===b));draw();});
  }

  async function renderLedgerV314(){
    const gen=++generation.ledger;setHeader('库存流水','按需读取最近记录');
    await ensure('stockMoves');
    const types=[...new Set((await scanSearch('stockMoves','',null,500)).map(x=>x.type))].filter(Boolean);
    $('#main').innerHTML=`<div class="toolbar"><div class="search"><input id="ledgerSearch" placeholder="商品、编码、备注"></div><select id="ledgerType" class="filter-select"><option value="">全部类型</option>${types.map(t=>`<option value="${esc(t)}">${moveTypeName(t)}</option>`).join('')}</select></div><div id="ledgerList" class="timeline"></div>`;
    let shown=PAGE_SIZE;
    const draw=async()=>{const q=$('#ledgerSearch')?.value||'',type=$('#ledgerType')?.value||'',f=ledgerFilter(type,q);let rows,total;
      if(q){rows=await scanSearch('stockMoves',q,m=>!type||m.type===type,shown);total=rows.length<shown?rows.length:shown+1;}
      else{const p=await page('stockMoves',{offset:0,limit:shown,filter:f});rows=p.rows;total=p.hasMore?shown+1:rows.length;}
      if(gen!==generation.ledger||appState.route!=='ledger')return;const host=$('#ledgerList');host.innerHTML=rows.length?rows.map(m=>`<div class="timeline-item"><div class="time">${fmtDateTime(m.createdAt)}</div><div class="text"><strong>${esc(m.productName)}</strong> · ${esc(moveTypeName(m.type))}　<span class="${m.qtyChange>=0?'success-text':'danger-text'}">${m.qtyChange>=0?'+':''}${fmtInt(m.qtyChange)}</span></div><div class="item-meta">库存 ${fmtInt(m.beforeStock)} → ${fmtInt(m.afterStock)}　${esc(m.note||'')}</div></div>`).join(''):emptyState('≡','暂无库存流水');appendMore(host,rows.length,total,()=>{shown=Math.min(MAX_LOADED,shown+PAGE_SIZE);draw();});
    };await draw();$('#ledgerSearch').oninput=()=>{shown=PAGE_SIZE;draw();};$('#ledgerType').onchange=()=>{shown=PAGE_SIZE;draw();};
  }

  async function renderLoansV314(){
    const gen=++generation.loans;setHeader('调借货管理','按需读取 · 连续借货、多次归还',{label:'＋',onClick:()=>openLoanForm()});
    await ensure('loans');const allCount=await count('loans'),openCount=await count('loans',loanOpen),partialCount=await count('loans',loanPartial),overdueCount=await count('loans',loanOverdue);
    $('#main').innerHTML=`<div class="notice"><strong>调借分两套：</strong>正式商品库调借继续在这里；别人临时放你这里的货请用“外部同行货”。</div><button id="openExternalGoods" class="btn secondary block" style="margin-bottom:12px">外部同行货 / 寄售流转（测试）</button><div class="grid-3"><div class="metric compact"><div class="label">未处理单</div><div class="value">${openCount}</div></div><div class="metric compact"><div class="label">部分处理</div><div class="value">${partialCount}</div></div><div class="metric compact"><div class="label">已超期</div><div class="value danger-text">${overdueCount}</div></div></div><div class="segment" id="loanStatus" style="margin-top:12px"><button class="active" data-status="all">全部</button><button data-status="active">未处理</button><button data-status="partial">部分处理</button><button data-status="returned">已完成</button><button data-status="overdue">超期</button></div><div id="loanList" class="list"></div>`;
    $('#openExternalGoods').onclick=()=>navigate('external-goods');let status='all',shown=PAGE_SIZE;
    const draw=async()=>{let p;if(status==='all'){const openPage=await page('loans',{offset:0,limit:shown,filter:loanOpen});const need=Math.max(0,shown-openPage.rows.length);const donePage=need?await page('loans',{offset:0,limit:need,filter:l=>!loanOpen(l)}):{rows:[],hasMore:true};p={rows:[...openPage.rows,...donePage.rows],hasMore:openPage.hasMore||donePage.hasMore};}else{const f=loanFilter(status);p=await page('loans',{offset:0,limit:shown,filter:f});}if(gen!==generation.loans||appState.route!=='loans')return;const host=$('#loanList');host.innerHTML=p.rows.length?p.rows.map(loanListItem).join(''):emptyState('⇄','暂无调借记录');$$('[data-loan-id]').forEach(el=>el.onclick=()=>openLoanDetail(el.dataset.loanId));appendMore(host,p.rows.length,p.hasMore?shown+1:p.rows.length,()=>{shown=Math.min(MAX_LOADED,shown+PAGE_SIZE);draw();});};
    await draw();$$('#loanStatus button').forEach(b=>b.onclick=()=>{status=b.dataset.status;shown=PAGE_SIZE;$$('#loanStatus button').forEach(x=>x.classList.toggle('active',x===b));draw();});
  }

  async function renderCustomersV314(){
    const gen=++generation.customers;setHeader('客户管理','按需读取客户；统计保持原账本口径',{label:'＋',onClick:()=>openCustomerForm()});
    $('#main').innerHTML=`<div class="toolbar"><div class="search"><input id="customerSearch" placeholder="客户姓名、电话模糊搜索"></div></div><div id="customerList" class="list"></div>`;let shown=PAGE_SIZE;
    const draw=async()=>{const q=$('#customerSearch')?.value||'',f=customerFilter(q);let rows,total;if(q){rows=await scanSearch('customers',q,null,shown);total=rows.length<shown?rows.length:shown+1;}else{const p=await page('customers',{offset:0,limit:shown,filter:f});rows=p.rows;total=p.hasMore?shown+1:rows.length;}
      if(gen!==generation.customers||appState.route!=='customers')return;const host=$('#customerList');
      let stats=new Map();
      if(window.MocuiAnalytics?.customerStats){
        const pairs=await Promise.all(rows.map(async c=>[c.id,await window.MocuiAnalytics.customerStats(c.id).catch(()=>null)]));
        stats=new Map(pairs);
      }
      host.innerHTML=rows.length?rows.map(c=>{const st=stats.get(c.id);return `<div class="list-item clickable customer-row" data-id="${c.id}"><div class="thumb placeholder">客</div><div class="item-main"><div class="item-title">${esc(c.name)}</div><div class="item-meta">${esc(c.phone||'未填写电话')}${st?` · ${st.orders}单 · 累计 ¥${Number(st.amount||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:''}</div></div></div>`}).join(''):emptyState('♙','暂无客户');$$('.customer-row').forEach(el=>el.onclick=async()=>openCustomerForm(await dbGet('customers',el.dataset.id)));appendMore(host,rows.length,total,()=>{shown=Math.min(MAX_LOADED,shown+PAGE_SIZE);draw();});};
    await draw();$('#customerSearch').oninput=()=>{shown=PAGE_SIZE;draw();};
  }

  function installRenderers(){
    if(renderersInstalled||typeof window.renderSales!=='function'||typeof window.renderLoans!=='function'||typeof window.renderLedger!=='function'||typeof window.renderCustomers!=='function')return false;
    renderersInstalled=true;window.renderSales=renderSalesV314;window.renderLoans=renderLoansV314;window.renderLedger=renderLedgerV314;window.renderCustomers=renderCustomersV314;return true;
  }

  function warm(){
    let i=0;const next=()=>{if(i>=STORES.length)return;const s=STORES[i++];rebuild(s,false).catch(()=>{}).finally(()=>setTimeout(next,250));};next();
  }
  const timer=setInterval(()=>{const a=installWriteHooks(),b=installRenderers();if(a&&b)clearInterval(timer);},25);setTimeout(()=>clearInterval(timer),10000);
  if('requestIdleCallback' in window)requestIdleCallback(warm,{timeout:6000});else setTimeout(warm,3000);
  window.addEventListener('cloud-sync-ok',()=>setTimeout(()=>STORES.forEach(s=>metaPut({id:`ready:${s}`,ready:false,at:Date.now()}).catch(()=>{})),1800));
  window.MocuiLargeDataLists={version:VERSION,rebuild:async()=>{for(const s of STORES)await rebuild(s,true);return true;}};
})();
