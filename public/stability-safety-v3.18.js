'use strict';
(()=>{
  const VERSION='3.18.0', SNAP='mocui_emergency_snapshot_v318', MAX_SNAP=3;
  const BUSINESS_DB='mocui_inventory_db', BUSINESS_VERSION=2;
  const required=['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
  const state={checked:false,ok:false,issues:[],cacheRepairs:[],lastSnapshotAt:0};

  function openBusiness(){return new Promise((res,rej)=>{const r=indexedDB.open(BUSINESS_DB,BUSINESS_VERSION);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  const reqP=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});

  async function healthCheck(){
    const issues=[];
    try{
      const db=await openBusiness(),names=[...db.objectStoreNames];
      for(const s of required)if(!names.includes(s))issues.push(`缺少正式数据表：${s}`);
      if(!issues.length){
        const tx=db.transaction(required,'readonly');
        for(const s of required)await reqP(tx.objectStore(s).count());
      }
      db.close();
    }catch(e){issues.push(`正式数据库读取失败：${e?.message||e}`);}
    state.checked=true;state.ok=!issues.length;state.issues=issues;
    window.dispatchEvent(new CustomEvent('mocui-health-checked',{detail:{...state}}));
    return {...state};
  }

  async function clearDerived(name){
    return new Promise(resolve=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=()=>resolve(true);r.onerror=()=>resolve(false);r.onblocked=()=>resolve(false);});
  }
  async function repairDerived(){
    // Only rebuildable performance databases are eligible. Never delete the formal business DB.
    const repairs=[];
    try{if(window.MocuiAnalytics?.state){const s=await MocuiAnalytics.state();if(!s?.ready||s?.dirty){await MocuiAnalytics.rebuild();repairs.push('analytics');}}}catch(_){}
    try{if(window.MocuiLargeDataLists?.rebuild){await MocuiLargeDataLists.rebuild();repairs.push('large-lists');}}catch(_){}
    state.cacheRepairs=repairs;return repairs;
  }

  async function compactSnapshot(){
    // Emergency snapshot is additive and local-only. It never replaces normal JSON backup/cloud sync.
    try{
      const db=await openBusiness(),payload={version:1,createdAt:new Date().toISOString(),stores:{}};
      for(const s of required){
        const tx=db.transaction(s,'readonly');
        payload.stores[s]=await reqP(tx.objectStore(s).getAll());
      }
      db.close();
      const raw=JSON.stringify(payload),key=`${SNAP}:${Date.now()}`;
      localStorage.setItem(key,raw);
      const keys=Object.keys(localStorage).filter(k=>k.startsWith(SNAP+':')).sort().reverse();
      keys.slice(MAX_SNAP).forEach(k=>localStorage.removeItem(k));
      state.lastSnapshotAt=Date.now();return {ok:true,key,bytes:raw.length};
    }catch(e){return {ok:false,error:e?.message||String(e)};}
  }

  async function verifySaleReferences(sample=200){
    const out={checked:0,missingProducts:0,negativeQty:0,duplicateIds:0,issues:[]};
    try{
      const db=await openBusiness(),tx=db.transaction(['sales','products'],'readonly'),
        sales=await reqP(tx.objectStore('sales').getAll()), products=await reqP(tx.objectStore('products').getAll()), ids=new Set(products.map(p=>p.id)),seen=new Set();
      for(const s of sales.slice(-sample)){
        out.checked++;
        if(seen.has(s.id)){out.duplicateIds++;out.issues.push(`重复销售ID ${s.id}`);} seen.add(s.id);
        for(const i of s.items||[]){
          if(numeric(i.qty)<0){out.negativeQty++;out.issues.push(`${s.orderNo||s.id} 存在负数量`);}
          if(i.productId&&!ids.has(i.productId)){out.missingProducts++;out.issues.push(`${s.orderNo||s.id} 引用的商品已不存在`);}
        }
      }
      db.close();
    }catch(e){out.issues.push(e?.message||String(e));}
    return out;
  }
  const numeric=v=>Number(v||0);

  function updateNotice(){
    if(document.getElementById('mocuiUpdateReady'))return;
    const el=document.createElement('button');el.id='mocuiUpdateReady';el.className='btn secondary small';
    el.style.cssText='position:fixed;right:12px;bottom:78px;z-index:9999;box-shadow:0 4px 18px rgba(0,0,0,.12)';
    el.textContent='新版本已就绪 · 点此刷新';
    el.onclick=()=>location.reload();document.body.appendChild(el);
  }
  function watchServiceWorker(){
    if(!('serviceWorker'in navigator))return;
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(!reg)return;if(reg.waiting)updateNotice();
      reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller)updateNotice();});});
    }).catch(()=>{});
  }

  async function startup(){
    const h=await healthCheck();
    if(!h.ok){console.error('[mocui health]',h.issues);return;}
    // Do not auto-repair formal data. Only derived caches may rebuild.
    setTimeout(()=>repairDerived().catch(()=>{}),2500);
    setTimeout(()=>compactSnapshot().catch(()=>{}),5000);
    watchServiceWorker();
  }

  window.MocuiStability={
    version:VERSION,state,healthCheck,repairDerived,compactSnapshot,verifySaleReferences,
    latestSnapshots:()=>Object.keys(localStorage).filter(k=>k.startsWith(SNAP+':')).sort().reverse()
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startup,{once:true});else startup();
})();