'use strict';
(() => {
  const MAIN_DB="mocui_inventory_db";
  const SYNC_DB="mocui_sync_v2";
  const SYNC_DB_VERSION=2;
  const STORES=["products","categories","customers","sales","loans","stockMoves","stocktakes","settings","auditLogs"];
  const DIRTY_KEY="mocui_sync_v3_dirty";
  const LEGACY_DIRTY_KEYS=["mocui_sync_v2_dirty","mocui_local_first_v2_dirty","mocui_cloud_unsynced_v1"];
  const MAX_BATCH_OPS=30;
  const MAX_BATCH_BYTES=6*1024*1024;
  const cloud=window.CloudSync;
  if(!cloud||cloud.__incrementalV3Installed)return;

  let authenticated=false,syncing=false,timer=null,retryTimer=null,retryDelay=2000,cursor=0;
  let syncDbPromise=null,mainDbPromise=null,appHooksInstalled=false;

  const original={
    bootstrap:cloud.bootstrap.bind(cloud),
    logout:cloud.logout.bind(cloud),
    changePassword:cloud.changePassword.bind(cloud),
    listBackups:cloud.listBackups.bind(cloud),
    restoreBackup:cloud.restoreBackup.bind(cloud),
    listSessions:cloud.listSessions.bind(cloud),
    logoutOtherSessions:cloud.logoutOtherSessions.bind(cloud),
    revokeSession:cloud.revokeSession.bind(cloud),
  };

  try{
    Object.defineProperty(window,"__mocuiInitialPullPromise",{configurable:true,get(){return null},set(_){}});
  }catch(_){window.__mocuiInitialPullPromise=null}

  const now=()=>Date.now();
  const entityKey=(store,id)=>`${store}:${id}`;

  function updateStatus(kind,detail=""){
    const badge=document.querySelector("#cloudBadge"),subtitle=document.querySelector("#pageSubtitle");
    const set=(cls,badgeText,sub)=>{
      if(badge){badge.className=`cloud-badge ${cls}`;badge.textContent=badgeText}
      if(subtitle)subtitle.textContent=detail||sub;
    };
    if(kind==="pending")set("syncing","待同步","本机已保存 · 等待云端");
    else if(kind==="syncing")set("syncing","同步中","本机可继续使用 · 后台增量同步");
    else if(kind==="offline")set("error","待同步","本机已保存 · 联网后自动同步");
    else if(kind==="conflict")set("error","有冲突","本机数据安全 · 有记录需要确认");
    else set("cloud","已同步","本机优先 · 云端已确认");
  }
  function markDirty(reason="local-write"){
    try{localStorage.setItem(DIRTY_KEY,JSON.stringify({dirty:true,reason,at:now()}))}catch{}
    document.documentElement.dataset.localDirty="1";updateStatus("pending");
  }
  function clearDirty(){
    try{localStorage.removeItem(DIRTY_KEY)}catch{}
    for(const k of LEGACY_DIRTY_KEYS)try{localStorage.removeItem(k)}catch{}
    delete document.documentElement.dataset.localDirty;
  }
  function hasDirtyMarker(){
    try{if(JSON.parse(localStorage.getItem(DIRTY_KEY)||"null")?.dirty)return true}catch{}
    for(const k of LEGACY_DIRTY_KEYS)try{if(JSON.parse(localStorage.getItem(k)||"null")?.dirty)return true}catch{}
    return false;
  }

  function openSyncDb(){
    if(syncDbPromise)return syncDbPromise;
    syncDbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(SYNC_DB,SYNC_DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});
        if(!db.objectStoreNames.contains("shadow"))db.createObjectStore("shadow",{keyPath:"key"});
        if(!db.objectStoreNames.contains("outbox")){
          const s=db.createObjectStore("outbox",{keyPath:"id"});s.createIndex("createdAt","createdAt");s.createIndex("entityKey","entityKey");
        }
        if(!db.objectStoreNames.contains("conflicts")){
          const s=db.createObjectStore("conflicts",{keyPath:"id"});s.createIndex("entityKey","entityKey");
        }
        if(!db.objectStoreNames.contains("dirty")){
          const s=db.createObjectStore("dirty",{keyPath:"key"});s.createIndex("createdAt","createdAt");
        }
      };
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();syncDbPromise=null};resolve(db)};
      req.onerror=()=>{syncDbPromise=null;reject(req.error||new Error("同步数据库打开失败"))};
    });
    return syncDbPromise;
  }
  function openMainDb(){
    if(mainDbPromise)return mainDbPromise;
    mainDbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(MAIN_DB);
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();mainDbPromise=null};resolve(db)};
      req.onerror=()=>{mainDbPromise=null;reject(req.error||new Error("本机数据库打开失败"))};
    });
    return mainDbPromise;
  }
  function reqP(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("IndexedDB 操作失败"))})}
  async function get(store,key){const db=await openSyncDb();return reqP(db.transaction(store,"readonly").objectStore(store).get(key))}
  async function all(store){const db=await openSyncDb();return reqP(db.transaction(store,"readonly").objectStore(store).getAll())}
  async function put(store,value){const db=await openSyncDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
  async function del(store,key){const db=await openSyncDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
  async function clear(store){const db=await openSyncDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
  async function metaGet(key,fallback=null){return (await get("meta",key))?.value??fallback}
  async function metaSet(key,value){await put("meta",{key,value,updatedAt:now()})}

  function canonical(v){
    if(v===null||typeof v!=="object")return JSON.stringify(v);
    if(Array.isArray(v))return `[${v.map(canonical).join(",")}]`;
    return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  }
  async function hashValue(v){
    const bytes=new TextEncoder().encode(canonical(v));
    const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
    return [...digest].map(x=>x.toString(16).padStart(2,"0")).join("");
  }
  async function api(path,options={}){
    const headers={...(options.headers||{})};if(options.body&&!headers["content-type"])headers["content-type"]="application/json";
    const response=await fetch(path,{credentials:"same-origin",cache:"no-store",...options,headers});
    const type=response.headers.get("content-type")||"";
    const body=type.includes("application/json")?await response.json().catch(()=>({})):await response.text();
    if(!response.ok){const e=new Error(body?.error||body||`请求失败 ${response.status}`);e.status=response.status;e.payload=body;throw e}
    return body;
  }

  async function noteLocalMutation(store,recordId,mutation,payload=null){
    if(!STORES.includes(store)||recordId==null||window.__cloudImporting)return;
    const key=entityKey(store,recordId);
    await put("dirty",{key,store,recordId:String(recordId),mutation,payload:mutation==="put"?payload:null,createdAt:now()});
    markDirty("local-write");
  }

  function installAppHooks(){
    if(appHooksInstalled||typeof window.dbPut!=="function")return false;
    appHooksInstalled=true;
    const oldPut=window.dbPut,oldAdd=window.dbAdd,oldDelete=window.dbDelete,oldClear=window.dbClear;
    window.dbPut=async function(store,value,...rest){
      const result=await oldPut.call(this,store,value,...rest);
      if(value?.id!=null)void noteLocalMutation(store,value.id,"put",structuredClone(value)).catch(()=>{});
      return result;
    };
    window.dbAdd=async function(store,value,...rest){
      const result=await oldAdd.call(this,store,value,...rest);
      if(value?.id!=null)void noteLocalMutation(store,value.id,"put",structuredClone(value)).catch(()=>{});
      return result;
    };
    window.dbDelete=async function(store,id,...rest){
      const result=await oldDelete.call(this,store,id,...rest);
      void noteLocalMutation(store,id,"delete",null).catch(()=>{});
      return result;
    };
    window.dbClear=async function(store,...rest){
      const result=await oldClear.call(this,store,...rest);
      await metaSet("needsFullScan",true);
      markDirty("store-clear");
      return result;
    };
    return true;
  }
  const hookTimer=setInterval(()=>{if(installAppHooks())clearInterval(hookTimer)},20);
  setTimeout(()=>clearInterval(hookTimer),10000);

  async function snapshotLocal(){
    const db=await openMainDb(),result={};
    for(const name of STORES){
      if(!db.objectStoreNames.contains(name)){result[name]=[];continue}
      result[name]=await reqP(db.transaction(name,"readonly").objectStore(name).getAll());
      await new Promise(r=>setTimeout(r,0));
    }
    return result;
  }
  async function applyLocal(store,id,mutation,payload){
    const db=await openMainDb();if(!db.objectStoreNames.contains(store))return;
    await new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite"),os=tx.objectStore(store);mutation==="delete"?os.delete(id):os.put(payload);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
  }

  async function fullScanOnce(){
    const local=await snapshotLocal(),shadows=await all("shadow");
    const shadowMap=new Map(shadows.map(x=>[x.key,x])),current=new Set();
    for(const store of STORES){
      for(const row of local[store]||[]){
        if(row?.id==null)continue;
        const key=entityKey(store,row.id);current.add(key);
        const hash=await hashValue(row),shadow=shadowMap.get(key);
        if(!shadow||shadow.deleted||shadow.hash!==hash)await put("dirty",{key,store,recordId:String(row.id),mutation:"put",payload:row,createdAt:now()});
      }
      await new Promise(r=>setTimeout(r,0));
    }
    for(const shadow of shadows){
      if(!shadow.deleted&&!current.has(shadow.key))await put("dirty",{key:shadow.key,store:shadow.store,recordId:shadow.recordId,mutation:"delete",payload:null,createdAt:now()});
    }
    await metaSet("needsFullScan",false);
  }

  async function captureDirty(){
    if(await metaGet("needsFullScan",false))await fullScanOnce();
    const [dirty,conflicts]=await Promise.all([all("dirty"),all("conflicts")]);
    const conflictKeys=new Set(conflicts.map(x=>x.entityKey));
    for(const item of dirty){
      if(conflictKeys.has(item.key))continue;
      const existing=(await all("outbox")).find(x=>x.entityKey===item.key);
      if(existing)await del("outbox",existing.id);
      let hash="";
      if(item.mutation==="put")hash=await hashValue(item.payload);
      const shadow=await get("shadow",item.key);
      if(item.mutation==="put"&&shadow&&!shadow.deleted&&shadow.hash===hash){await del("dirty",item.key);continue}
      const op={id:crypto.randomUUID(),opId:crypto.randomUUID(),entityKey:item.key,store:item.store,recordId:item.recordId,mutation:item.mutation,payload:item.payload,hash,baseSeq:Number(shadow?.lastSeq??cursor),clientTime:now(),createdAt:Number(item.createdAt||now())};
      await put("outbox",op);await del("dirty",item.key);
    }
  }

  function chooseBatch(ops){
    const sorted=[...ops].sort((a,b)=>Number(a.createdAt)-Number(b.createdAt)),batch=[];let bytes=0;
    for(const op of sorted){
      const wire={opId:op.opId,store:op.store,recordId:op.recordId,mutation:op.mutation,payload:op.payload,baseSeq:op.baseSeq,clientTime:op.clientTime};
      const size=new TextEncoder().encode(JSON.stringify(wire)).byteLength;
      if(batch.length&&(batch.length>=MAX_BATCH_OPS||bytes+size>MAX_BATCH_BYTES))break;
      batch.push({local:op,wire});bytes+=size;
    }
    return batch;
  }
  async function saveConflict(localOp,remote,source){
    await put("conflicts",{id:crypto.randomUUID(),entityKey:localOp.entityKey,store:localOp.store,recordId:localOp.recordId,localOperation:localOp,remote,source,createdAt:now()});
    await del("outbox",localOp.id);updateStatus("conflict");
  }
  async function acknowledge(ack,localOp){
    const key=entityKey(ack.store,ack.recordId);
    if(ack.mutation==="delete"){
      await applyLocal(ack.store,ack.recordId,"delete",null);
      await put("shadow",{key,store:ack.store,recordId:String(ack.recordId),hash:"",deleted:true,lastSeq:Number(ack.seq||cursor),updatedAt:now()});
    }else{
      await applyLocal(ack.store,ack.recordId,"put",ack.payload);
      await put("shadow",{key,store:ack.store,recordId:String(ack.recordId),hash:await hashValue(ack.payload),deleted:false,lastSeq:Number(ack.seq||cursor),updatedAt:now()});
    }
    await del("outbox",localOp.id);
  }
  async function flushOutbox(){
    for(let safety=0;safety<100;safety++){
      const ops=await all("outbox");if(!ops.length)return;
      const batch=chooseBatch(ops);if(!batch.length)return;
      const response=await api("/api/sync/v2/ops",{method:"POST",body:JSON.stringify({cursor,deviceId:cloud.deviceId,operations:batch.map(x=>x.wire)})});
      const byId=new Map(batch.map(x=>[x.local.opId,x.local]));
      for(const ack of response.acknowledged||[]){const local=byId.get(ack.opId);if(local)await acknowledge(ack,local);cursor=Math.max(cursor,Number(ack.seq||0))}
      for(const item of response.conflicts||[]){const local=byId.get(item.opId);if(local)await saveConflict(local,item.remote,"server");cursor=Math.max(cursor,Number(item.remote?.lastSeq||0))}
      cursor=Math.max(cursor,Number(response.cursor||0));await metaSet("cursor",cursor);
      if(!(response.acknowledged||[]).length&&!(response.conflicts||[]).length)return;
    }
  }
  async function pullRemoteOps(){
    for(let loops=0;loops<100;loops++){
      const result=await api(`/api/sync/v2/ops?after=${encodeURIComponent(cursor)}&limit=200`);
      const operations=result.operations||[];
      if(!operations.length){cursor=Math.max(cursor,Number(result.cursor||cursor));await metaSet("cursor",cursor);return}
      const pending=await all("outbox"),conflicts=await all("conflicts");
      const pendingMap=new Map(pending.map(x=>[x.entityKey,x])),conflictKeys=new Set(conflicts.map(x=>x.entityKey));
      for(const op of operations){
        const key=entityKey(op.store,op.recordId),local=pendingMap.get(key);
        if(local&&op.deviceId!==cloud.deviceId){
          if(!conflictKeys.has(key)){await saveConflict(local,{lastSeq:op.seq,deleted:op.mutation==="delete",payload:op.payload,deviceId:op.deviceId,updatedAt:op.createdAt},"pull");conflictKeys.add(key)}
        }else if(!conflictKeys.has(key)){
          await applyLocal(op.store,op.recordId,op.mutation,op.payload);
          await put("shadow",{key,store:op.store,recordId:String(op.recordId),hash:op.mutation==="put"?await hashValue(op.payload):"",deleted:op.mutation==="delete",lastSeq:Number(op.seq),updatedAt:now()});
        }
        cursor=Math.max(cursor,Number(op.seq||0));
      }
      await metaSet("cursor",cursor);if(!result.hasMore)return;
      await new Promise(r=>setTimeout(r,0));
    }
  }

  function recordTime(row){
    for(const v of [row?.updatedAt,row?.modifiedAt,row?.restoredAt,row?.archivedAt,row?.deletedAt,row?.createdAt,row?.date,row?.businessDate]){
      const t=typeof v==="number"?v:Date.parse(v||"");if(Number.isFinite(t)&&t>0)return t;
    }return 0;
  }
  function mergeById(localRows=[],remoteRows=[]){
    const map=new Map();for(const r of remoteRows)if(r?.id!=null)map.set(String(r.id),r);
    for(const l of localRows){if(l?.id==null)continue;const k=String(l.id),r=map.get(k);if(!r||recordTime(l)>=recordTime(r))map.set(k,l)}
    return [...map.values()];
  }
  async function firstBootstrapIfNeeded(){
    cursor=Number(await metaGet("cursor",0))||0;
    const initialized=Boolean(await metaGet("initialized",false));
    if(initialized){
      const migrated=Boolean(await metaGet("v3JournalReady",false));
      if(!migrated){await metaSet("needsFullScan",true);await metaSet("v3JournalReady",true);markDirty("v3-migration")}
      return;
    }
    const result=await api("/api/sync/v2/bootstrap"),remote=result.snapshot?.stores||{},local=await snapshotLocal(),merged={};
    for(const store of STORES)merged[store]=mergeById(local[store]||[],remote[store]||[]);
    const db=await openMainDb();
    for(const store of STORES){
      if(!db.objectStoreNames.contains(store))continue;
      await new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite"),os=tx.objectStore(store);for(const row of merged[store]||[])os.put(row);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
    }
    cursor=Number(result.cursor||0);await clear("shadow");
    for(const store of STORES)for(const row of remote[store]||[])if(row?.id!=null)await put("shadow",{key:entityKey(store,row.id),store,recordId:String(row.id),hash:await hashValue(row),deleted:false,lastSeq:cursor,updatedAt:now()});
    await metaSet("cursor",cursor);await metaSet("initialized",true);await metaSet("v3JournalReady",true);await metaSet("needsFullScan",true);markDirty("v3-bootstrap");
  }

  async function syncCycle({pull=true}={}){
    if(!authenticated||syncing){if(hasDirtyMarker())updateStatus("pending");return{queued:true}}
    syncing=true;clearTimeout(retryTimer);updateStatus("syncing");
    try{
      await captureDirty();await flushOutbox();if(pull)await pullRemoteOps();await captureDirty();
      const [remaining,conflicts,dirty]=await Promise.all([all("outbox"),all("conflicts"),all("dirty")]);
      if(conflicts.length)updateStatus("conflict");
      else if(remaining.length||dirty.length){markDirty("pending-after-cycle");updateStatus("pending")}
      else{clearDirty();updateStatus("synced")}
      retryDelay=2000;
      window.dispatchEvent(new CustomEvent("cloud-sync-ok",{detail:{cursor,pending:remaining.length,conflicts:conflicts.length,protocol:"v3-journal"}}));
      return{ok:true,cursor,pending:remaining.length,conflicts:conflicts.length};
    }catch(error){
      markDirty(error.status===401?"login-required":"sync-error");updateStatus("offline");
      clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(navigator.onLine)void syncCycle().catch(()=>{})},retryDelay);retryDelay=Math.min(60000,Math.round(retryDelay*1.8));
      throw error;
    }finally{syncing=false}
  }
  function schedule(delay=650){
    if(window.__cloudImporting)return;
    markDirty("local-write");clearTimeout(timer);timer=setTimeout(()=>void syncCycle().catch(()=>{}),Math.max(120,Number(delay)||650));
  }
  async function bootstrap(options={}){
    const result=await original.bootstrap({...options,deferPull:true});authenticated=true;await firstBootstrapIfNeeded();
    const [pending,conflicts]=await Promise.all([all("outbox"),all("conflicts")]);
    if(conflicts.length)updateStatus("conflict");else if(pending.length||hasDirtyMarker())updateStatus("pending");else updateStatus("synced");
    // 首屏不等待云端；空闲后后台同步。
    setTimeout(()=>void syncCycle().catch(()=>{}),120);
    return{...result,protocol:"v3-journal"};
  }
  async function status(){const [o,c,d]=await Promise.all([all("outbox"),all("conflicts"),all("dirty")]);return{cursor,outbox:o.length,conflicts:c.length,dirty:d.length}}
  async function resolveConflict(id,choice="remote"){
    const conflict=await get("conflicts",id);if(!conflict)throw new Error("没有找到冲突记录");
    if(choice==="remote"){
      const r=conflict.remote||{};await applyLocal(conflict.store,conflict.recordId,r.deleted?"delete":"put",r.payload||null);
      await put("shadow",{key:conflict.entityKey,store:conflict.store,recordId:conflict.recordId,hash:r.deleted?"":await hashValue(r.payload),deleted:Boolean(r.deleted),lastSeq:Number(r.lastSeq||cursor),updatedAt:now()});
    }else if(choice==="local"){
      const op={...conflict.localOperation,id:crypto.randomUUID(),opId:crypto.randomUUID(),baseSeq:Number(conflict.remote?.lastSeq||cursor),createdAt:now()};await put("outbox",op);markDirty("conflict-local-chosen");
    }else throw new Error("choice 只能是 local 或 remote");
    await del("conflicts",id);schedule(100);
  }

  cloud.bootstrap=bootstrap;
  cloud.pull=()=>syncCycle({pull:true});
  cloud.push=()=>syncCycle({pull:false});
  cloud.forcePush=()=>{markDirty("manual-sync");return syncCycle({pull:true})};
  cloud.schedule=schedule;
  cloud.getV2Status=status;
  cloud.getV3Status=status;
  cloud.resolveV2Conflict=resolveConflict;
  cloud.resolveV3Conflict=resolveConflict;
  cloud.incrementalV2=true;
  cloud.incrementalV3=true;
  cloud.__incrementalV2Installed=true;
  cloud.__incrementalV3Installed=true;

  window.addEventListener("online",()=>{if(authenticated)setTimeout(()=>void syncCycle().catch(()=>{}),300)});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&hasDirtyMarker())markDirty("backgrounded")});
  if(hasDirtyMarker())document.documentElement.dataset.localDirty="1";
})();
