'use strict';
(() => {
  const VERSION='3.17.0';
  const DB_NAME='mocui_analytics_v315';
  const DB_VERSION=1;
  const SOURCE_DB='mocui_inventory_db';
  const SOURCE_VERSION=2;
  const STORES=['daily','monthly','customers','products','meta'];
  let adb=null,sdb=null,rebuildPromise=null,dirtyTimer=null;

  const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
  const n=v=>Number(v||0);
  const dayKey=v=>{const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const monthKey=k=>String(k||'').slice(0,7);
  const zero=()=>({orders:0,revenue:0,received:0,qty:0,discount:0,productCost:0,inventoryAccessoryCost:0,directAccessoryCost:0,otherDirectCost:0,totalCost:0,grossProfit:0,receivableGap:0,historicalCount:0});
  const add=(a,b,sign=1)=>{for(const k of Object.keys(zero()))a[k]=n(a[k])+sign*n(b[k]);return a;};

  function openAnalytics(){
    if(adb)return Promise.resolve(adb);
    return new Promise((res,rej)=>{
      const r=indexedDB.open(DB_NAME,DB_VERSION);
      r.onupgradeneeded=()=>{const d=r.result;
        if(!d.objectStoreNames.contains('daily'))d.createObjectStore('daily',{keyPath:'id'});
        if(!d.objectStoreNames.contains('monthly'))d.createObjectStore('monthly',{keyPath:'id'});
        if(!d.objectStoreNames.contains('customers')){const s=d.createObjectStore('customers',{keyPath:'id'});s.createIndex('amount','amount');}
        if(!d.objectStoreNames.contains('products')){const s=d.createObjectStore('products',{keyPath:'id'});s.createIndex('amount','amount');}
        if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'id'});
      };
      r.onsuccess=()=>{adb=r.result;res(adb)};r.onerror=()=>rej(r.error);
    });
  }
  function openSource(){
    if(sdb)return Promise.resolve(sdb);
    return new Promise((res,rej)=>{const r=indexedDB.open(SOURCE_DB,SOURCE_VERSION);r.onsuccess=()=>{sdb=r.result;res(sdb)};r.onerror=()=>rej(r.error);});
  }
  async function sourceAll(store){const d=await openSource();return reqP(d.transaction(store,'readonly').objectStore(store).getAll());}
  async function meta(id){const d=await openAnalytics();return reqP(d.transaction('meta','readonly').objectStore('meta').get(id));}
  async function metaPut(row){const d=await openAnalytics();return reqP(d.transaction('meta','readwrite').objectStore('meta').put(row));}

  function historical(s){return Boolean(s?.importedHistorical||s?.sourceType==='qinsilk_history'||s?.source==='qinsilk'&&String(s?.sourceKey||'').startsWith('qinsilk:'));}
  function active(s){return s?.status==='active'&&!s?.excludedFromReports;}
  function businessDay(s){
    const explicit=String(s?.businessDate||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(explicit))return explicit;
    return dayKey(s?.createdAt||s?.date||s?.updatedAt);
  }
  function metrics(s){
    const productCost=(s?.items||[]).reduce((a,i)=>a+n(i.costPrice)*n(i.qty),0);
    const inv=n(s?.inventoryAccessoryCost);
    // v3.12 sale.accessoryCost = inventory accessory + direct low-value accessory.
    const direct=s?.directAccessoryCost!==undefined?n(s.directAccessoryCost):Math.max(0,n(s?.accessoryCost)-inv);
    const other=n(s?.otherDirectCost),total=productCost+inv+direct+other,revenue=n(s?.finalAmount);
    return {orders:1,revenue,received:historical(s)?revenue:n(s?.received),qty:(s?.items||[]).reduce((a,i)=>a+n(i.qty),0),discount:n(s?.discountAmount),productCost,inventoryAccessoryCost:inv,directAccessoryCost:direct,otherDirectCost:other,totalCost:total,grossProfit:revenue-total,receivableGap:historical(s)?0:revenue-n(s?.received),historicalCount:historical(s)?1:0};
  }
  function customerId(s){return String(s?.customerId||s?.customerName||'散客');}
  function productNet(s,i){
    if(i?.netAmount!==undefined&&i?.netAmount!==null)return n(i.netAmount);
    const gross=n(i?.qty)*n(i?.price),subtotal=n(s?.subtotal)||(s?.items||[]).reduce((a,x)=>a+n(x.qty)*n(x.price),0);
    return subtotal>0?gross*(n(s?.finalAmount)/subtotal):gross;
  }

  async function rebuild(force=false){
    if(rebuildPromise)return rebuildPromise;
    rebuildPromise=(async()=>{
      const state=await meta('state');if(state?.ready&&!state?.dirty&&!force)return state;
      await metaPut({id:'state',ready:false,dirty:true,building:true,startedAt:Date.now()});
      const sales=await sourceAll('sales'),days=new Map(),months=new Map(),customers=new Map(),products=new Map();
      let activeCount=0;
      for(const s of sales){
        if(!active(s))continue;activeCount++;
        const dk=businessDay(s);if(!dk)continue;const m=metrics(s);
        const d=days.get(dk)||{id:dk,...zero()};add(d,m);days.set(dk,d);
        const mk=monthKey(dk),mo=months.get(mk)||{id:mk,...zero()};add(mo,m);months.set(mk,mo);
        const cid=customerId(s),c=customers.get(cid)||{id:cid,name:s.customerName||'散客',orders:0,qty:0,amount:0,lastAt:''};
        c.orders++;c.qty+=m.qty;c.amount+=m.revenue;if(!c.lastAt||new Date(s.createdAt)>new Date(c.lastAt))c.lastAt=s.createdAt||'';customers.set(cid,c);
        for(const i of s.items||[]){const pid=String(i.productId||i.productName||'');if(!pid)continue;const p=products.get(pid)||{id:pid,name:i.productName||'',color:i.color||'',qty:0,amount:0,profit:0};
          const net=productNet(s,i),cost=n(i.costPrice)*n(i.qty);p.qty+=n(i.qty);p.amount+=net;p.profit+=net-cost;products.set(pid,p);}
      }
      const d=await openAnalytics(),tx=d.transaction(STORES,'readwrite');
      for(const st of ['daily','monthly','customers','products'])tx.objectStore(st).clear();
      days.forEach(v=>tx.objectStore('daily').put(v));months.forEach(v=>tx.objectStore('monthly').put(v));customers.forEach(v=>tx.objectStore('customers').put(v));products.forEach(v=>tx.objectStore('products').put(v));
      tx.objectStore('meta').put({id:'state',ready:true,dirty:false,building:false,builtAt:Date.now(),sourceSales:sales.length,activeSales:activeCount,version:VERSION});
      await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
      window.dispatchEvent(new CustomEvent('mocui-analytics-ready'));
      return {ready:true};
    })().finally(()=>rebuildPromise=null);
    return rebuildPromise;
  }

  async function range(start,end){
    await rebuild(false);const d=await openAnalytics(),tx=d.transaction('daily','readonly'),os=tx.objectStore('daily'),out=zero();
    const a=dayKey(start),b=dayKey(end);if(!a||!b)return out;
    return new Promise((res,rej)=>{const r=os.openCursor(IDBKeyRange.bound(a,b));r.onerror=()=>rej(r.error);r.onsuccess=()=>{const c=r.result;if(!c)return res(out);add(out,c.value);c.continue();};});
  }
  async function top(store,limit=20){
    await rebuild(false);const d=await openAnalytics(),rows=await reqP(d.transaction(store,'readonly').objectStore(store).getAll());
    return rows.sort((a,b)=>n(b.amount)-n(a.amount)).slice(0,limit);
  }
  async function customerStats(idOrName){
    await rebuild(false);const d=await openAnalytics(),os=d.transaction('customers','readonly').objectStore('customers');
    let r=await reqP(os.get(String(idOrName||'')));if(r)return r;
    const rows=await reqP(os.getAll());return rows.find(x=>x.name===idOrName)||null;
  }
  function markDirty(){
    clearTimeout(dirtyTimer);dirtyTimer=setTimeout(async()=>{const s=await meta('state').catch(()=>null);await metaPut({...s,id:'state',ready:Boolean(s?.ready),dirty:true,building:false,dirtyAt:Date.now()}).catch(()=>{});},300);
  }

  // Observe source IndexedDB directly: analytics is derived-only and never intercepts business writes.
  async function installSourceObserver(){
    // Core functions are lexical in app.js, so use the cloud-sync completion event plus lightweight polling fingerprint.
    let last='';
    const check=async()=>{try{const rows=await sourceAll('sales');const fp=`${rows.length}|${rows.reduce((a,s)=>a+Date.parse(s.updatedAt||s.createdAt||0),0)}`;if(last&&fp!==last)markDirty();last=fp;}catch(_){}};
    await check();setInterval(check,15000);
    window.addEventListener('cloud-sync-ok',()=>{markDirty();setTimeout(()=>rebuild(false).catch(()=>{}),1800);});
  }


  let mutationChain=Promise.resolve();
  const sameSale=(a,b)=>JSON.stringify(a||null)===JSON.stringify(b||null);

  async function getAgg(store,id){
    const d=await openAnalytics();
    return reqP(d.transaction(store,'readonly').objectStore(store).get(id));
  }
  async function putAgg(store,row){
    const d=await openAnalytics();
    return reqP(d.transaction(store,'readwrite').objectStore(store).put(row));
  }
  async function delAgg(store,id){
    const d=await openAnalytics();
    return reqP(d.transaction(store,'readwrite').objectStore(store).delete(id));
  }
  async function adjustBucket(store,id,m,sign){
    if(!id)return;
    const row=(await getAgg(store,id))||{id,...zero()};
    add(row,m,sign);
    row.orders=Math.max(0,n(row.orders));
    if(row.orders===0)await delAgg(store,id); else await putAgg(store,row);
  }
  async function adjustCustomer(s,sign){
    if(!active(s))return;
    const id=customerId(s),d=await openAnalytics(),os=d.transaction('customers','readwrite').objectStore('customers');
    const old=await reqP(os.get(id))||{id,name:s.customerName||'散客',orders:0,qty:0,amount:0,lastAt:''};
    const m=metrics(s);old.orders=Math.max(0,n(old.orders)+sign);old.qty=n(old.qty)+sign*m.qty;old.amount=n(old.amount)+sign*m.revenue;
    if(sign>0&&(!old.lastAt||new Date(s.createdAt)>new Date(old.lastAt)))old.lastAt=s.createdAt||'';
    if(old.orders===0)await reqP(os.delete(id));else await reqP(os.put(old));
  }
  async function adjustProducts(s,sign){
    if(!active(s))return;
    const d=await openAnalytics(),tx=d.transaction('products','readwrite'),os=tx.objectStore('products');
    for(const i of s.items||[]){
      const id=String(i.productId||i.productName||'');if(!id)continue;
      const old=await reqP(os.get(id))||{id,name:i.productName||'',color:i.color||'',qty:0,amount:0,profit:0};
      const net=productNet(s,i),cost=n(i.costPrice)*n(i.qty);
      old.qty=n(old.qty)+sign*n(i.qty);old.amount=n(old.amount)+sign*net;old.profit=n(old.profit)+sign*(net-cost);
      if(Math.abs(old.qty)<1e-9&&Math.abs(old.amount)<.005)await reqP(os.delete(id));else await reqP(os.put(old));
    }
    await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);});
  }
  async function applySaleDelta(oldSale,newSale){
    await rebuild(false);
    if(sameSale(oldSale,newSale))return;
    for(const [sale,sign] of [[oldSale,-1],[newSale,1]]){
      if(!sale||!active(sale))continue;
      const dk=businessDay(sale),mk=monthKey(dk),m=metrics(sale);
      await adjustBucket('daily',dk,m,sign);await adjustBucket('monthly',mk,m,sign);
      await adjustCustomer(sale,sign);await adjustProducts(sale,sign);
    }
    const st=await meta('state')||{id:'state'};
    await metaPut({...st,id:'state',ready:true,dirty:false,building:false,incrementalAt:Date.now(),version:VERSION});
    window.dispatchEvent(new CustomEvent('mocui-analytics-updated'));
  }
  function queueSaleDelta(oldSale,newSale){
    mutationChain=mutationChain.then(()=>applySaleDelta(oldSale,newSale)).catch(async e=>{
      console.debug('[analytics incremental]',e?.message||e);
      await metaPut({...(await meta('state').catch(()=>null)),id:'state',ready:false,dirty:true,building:false,dirtyAt:Date.now()}).catch(()=>{});
      await rebuild(true).catch(()=>{});
    });
    return mutationChain;
  }

  async function warm(){try{await rebuild(false);}catch(e){console.debug('[analytics]',e?.message||e);}}
  installSourceObserver().catch(()=>{});
  if('requestIdleCallback' in window)requestIdleCallback(warm,{timeout:8000});else setTimeout(warm,4000);

  window.MocuiAnalytics={
    version:VERSION,range,topCustomers:(n=20)=>top('customers',n),topProducts:(n=20)=>top('products',n),
    customerStats,rebuild:()=>rebuild(true),markDirty,
    applySaleDelta:queueSaleDelta,
    state:()=>meta('state')
  };
})();
