'use strict';
/* 漠翠 ERP v4.7.9.4 — 无损数据库结构预检查。只添加缺失表/索引，绝不 clear/delete 数据。 */
(()=>{
  const BUSINESS='mocui_inventory_db',SYNC='mocui_sync_v2';
  const business=['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
  const sync=['meta','shadow','outbox','conflicts','dirty'];
  const schemas={
    [BUSINESS]:{stores:Object.fromEntries(business.map(name=>[name,'id'])),indexes:{}},
    [SYNC]:{stores:{meta:'key',shadow:'key',outbox:'id',conflicts:'id',dirty:'key'},indexes:{outbox:['createdAt','entityKey'],conflicts:['entityKey'],dirty:['createdAt']}}
  };
  let active=null;
  const dbOpen=(name,version)=>new Promise((resolve,reject)=>{
    const req=version?indexedDB.open(name,version):indexedDB.open(name);
    let finished=false;const timer=setTimeout(()=>{
      if(!finished){finished=true;reject(new Error(name+' 数据库升级被其他页面阻塞，请关闭其他 ERP 页面再试'))}
    },8500);
    const settle=(fn,arg)=>{if(finished){if(fn===resolve)arg?.close?.();return;}finished=true;clearTimeout(timer);fn(arg)};
    req.onblocked=()=>{console.warn('[Mocui schema] waiting for other tabs',name)};
    req.onerror=()=>settle(reject,req.error||new Error(name+' 无法打开'));
    req.onsuccess=()=>settle(resolve,req.result);
    if(version)req.onupgradeneeded=()=>{
      const d=req.result,tx=req.transaction,definition=schemas[name];
      for(const [store,keyPath] of Object.entries(definition.stores)){
        const os=d.objectStoreNames.contains(store)?tx.objectStore(store):d.createObjectStore(store,{keyPath});
        for(const idx of definition.indexes[store]||[])if(!os.indexNames.contains(idx))os.createIndex(idx,idx);
      }
    };
  });
  function missing(db,definition){
    const result=[];
    for(const name of Object.keys(definition.stores)){
      if(!db.objectStoreNames.contains(name)){result.push('数据表 '+name);continue;}
      const indexes=definition.indexes[name]||[];
      if(indexes.length){const tx=db.transaction(name,'readonly'),s=tx.objectStore(name);
        for(const idx of indexes)if(!s.indexNames.contains(idx))result.push(name+' 索引 '+idx);
      }
    }
    return result;
  }
  async function checkOne(name){
    const d=await dbOpen(name),spec=schemas[name],oldVersion=d.version;
    let absent=missing(d,spec);d.close();
    if(!absent.length)return{name,version:oldVersion,modified:false};
    console.warn('[Mocui schema] repairing',name,absent);
    const upgraded=await dbOpen(name,oldVersion+1);
    try{
      const remaining=missing(upgraded,spec);
      if(remaining.length)throw new Error(name+' 仍缺少 '+remaining.join('、'));
      return{name,version:upgraded.version,modified:true,added:absent};
    }finally{upgraded.close()}
  }
  async function check(){
    if(active)return active;
    active=(async()=>{
      const reports=[];
      for(const name of [BUSINESS,SYNC])reports.push(await checkOne(name));
      console.info('[Mocui schema] checked',reports);
      return reports;
    })().finally(()=>{active=null});
    return active;
  }
  window.MocuiSchemaGuard4794={check,version:'4.7.9.4'};
})();
