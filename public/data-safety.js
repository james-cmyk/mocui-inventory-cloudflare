'use strict';
(() => {
  const DB_NAME = 'mocui_inventory_db';
  const STORES = ['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
  const DIRTY_KEY = 'mocui_cloud_unsynced_v1';
  const cloud = window.CloudSync;
  if (!cloud || cloud.__dataSafetyInstalled) return;

  const original = {
    pull: cloud.pull.bind(cloud),
    push: cloud.push.bind(cloud),
    forcePush: cloud.forcePush.bind(cloud),
    schedule: cloud.schedule.bind(cloud),
  };

  function getDirtyMeta() {
    try { return JSON.parse(localStorage.getItem(DIRTY_KEY) || 'null'); }
    catch { return null; }
  }
  function markDirty(reason='local-write') {
    const old=getDirtyMeta();
    const meta={dirty:true,firstAt:old?.firstAt||Date.now(),lastAt:Date.now(),reason};
    try{localStorage.setItem(DIRTY_KEY,JSON.stringify(meta));}catch{}
    document.documentElement.dataset.localDirty='1';
  }
  function clearDirty() {
    try{localStorage.removeItem(DIRTY_KEY);}catch{}
    delete document.documentElement.dataset.localDirty;
  }
  function isDirty(){return Boolean(getDirtyMeta()?.dirty);}

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('本机数据库打开失败'));
    });
  }
  function reqP(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('本机数据库操作失败'));
    });
  }
  async function snapshotStores(){
    const db=await openDb();
    try{
      const out={};
      for(const name of STORES){
        if(!db.objectStoreNames.contains(name)){out[name]=[];continue;}
        out[name]=await reqP(db.transaction(name,'readonly').objectStore(name).getAll());
      }
      return out;
    }finally{db.close();}
  }
  async function restoreStores(stores){
    const db=await openDb();
    try{
      for(const name of STORES){
        if(!db.objectStoreNames.contains(name))continue;
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(name,'readwrite'),os=tx.objectStore(name);
          os.clear();
          for(const row of stores[name]||[])os.put(row);
          tx.oncomplete=resolve;
          tx.onerror=()=>reject(tx.error||new Error(`恢复 ${name} 失败`));
          tx.onabort=()=>reject(tx.error||new Error(`恢复 ${name} 被中止`));
        });
      }
    }finally{db.close();}
  }
  function timeOf(row){
    for(const v of [row?.updatedAt,row?.modifiedAt,row?.restoredAt,row?.archivedAt,row?.createdAt,row?.date,row?.businessDate]){
      const t=Date.parse(v||''); if(Number.isFinite(t))return t;
    }
    return 0;
  }
  function mergeById(localRows=[],remoteRows=[],mergeItem=null){
    const map=new Map();
    for(const row of remoteRows||[])if(row?.id!=null)map.set(String(row.id),row);
    for(const local of localRows||[]){
      if(local?.id==null)continue;
      const key=String(local.id),remote=map.get(key);
      if(!remote)map.set(key,local);
      else if(mergeItem)map.set(key,mergeItem(local,remote));
      else map.set(key,timeOf(local)>=timeOf(remote)?local:remote);
    }
    return [...map.values()];
  }
  function mergeLedgerRows(local,remote,field='rows'){
    const newer=timeOf(local)>=timeOf(remote)?local:remote;
    const older=newer===local?remote:local;
    return {...older,...newer,[field]:mergeById(local?.[field]||[],remote?.[field]||[]),updatedAt:new Date().toISOString()};
  }
  function mergeTradeGallery(local,remote){
    const batches=mergeById(local?.batches||[],remote?.batches||[],(lb,rb)=>{
      const newer=timeOf(lb)>=timeOf(rb)?lb:rb,older=newer===lb?rb:lb;
      return {...older,...newer,items:mergeById(lb?.items||[],rb?.items||[]),updatedAt:new Date().toISOString()};
    });
    return {...remote,...local,batches,updatedAt:new Date().toISOString()};
  }
  function mergeSetting(local,remote){
    const id=String(local?.id||remote?.id||'');
    if(id==='tradeGalleryLedgerV1')return mergeTradeGallery(local,remote);
    if(id==='externalGoodsLedgerV1')return mergeLedgerRows(local,remote,'rows');
    if(id==='passDealsLedgerV1')return mergeLedgerRows(local,remote,'rows');
    return timeOf(local)>=timeOf(remote)?local:remote;
  }
  function mergeSnapshots(local,remote){
    const out={};
    for(const name of STORES){
      out[name]=name==='settings'
        ? mergeById(local[name]||[],remote[name]||[],mergeSetting)
        : mergeById(local[name]||[],remote[name]||[]);
    }
    return out;
  }

  cloud.schedule=function safeSchedule(delay=1000){
    markDirty('scheduled-write');
    return original.schedule(delay);
  };
  cloud.push=async function safePush(options={}){
    if(isDirty())markDirty('push-start');
    try{
      const result=await original.push(options);
      if(!result?.queued)clearDirty();
      return result;
    }catch(error){
      markDirty('push-failed');
      throw error;
    }
  };
  cloud.forcePush=async function safeForcePush(){
    markDirty('force-push');
    try{const result=await original.forcePush();clearDirty();return result;}
    catch(error){markDirty('force-push-failed');throw error;}
  };
  cloud.pull=async function safePull(){
    if(!isDirty())return original.pull();

    const localSnapshot=await snapshotStores();
    try{
      const result=await original.pull();
      const remoteSnapshot=await snapshotStores();
      const merged=mergeSnapshots(localSnapshot,remoteSnapshot);
      await restoreStores(merged);
      await original.forcePush();
      clearDirty();
      window.dispatchEvent(new CustomEvent('mocui-unsynced-recovered'));
      return result;
    }catch(error){
      try{await restoreStores(localSnapshot);}catch{}
      markDirty('recovery-pending');
      throw error;
    }
  };

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&isDirty())void cloud.push().catch(()=>{});
  });
  window.addEventListener('pagehide',()=>{
    if(isDirty())void cloud.push().catch(()=>{});
  });
  window.addEventListener('online',()=>{
    if(isDirty())void cloud.push().catch(()=>{});
  });
  window.addEventListener('cloud-sync-ok',clearDirty);

  cloud.hasUnsyncedLocalData=isDirty;
  cloud.__dataSafetyInstalled=true;
})();