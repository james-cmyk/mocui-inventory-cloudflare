'use strict';
/* 漠翠 ERP 4.7.9: 同一 IndexedDB 事务保存库存、流水、单据；跨库同步使用持久化恢复哨兵。 */
(()=>{
  const MAIN='mocui_inventory_db',SYNC='mocui_sync_v2',SYNC_VERSION=2;
  let mainPromise=null,syncPromise=null;
  const key=(store,id)=>`${store}:${id}`;
  const now=()=>new Date().toISOString();
  function main(){if(mainPromise)return mainPromise;mainPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(MAIN,2);
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();mainPromise=null};resolve(req.result);};
    req.onerror=()=>{mainPromise=null;reject(req.error||new Error('本机数据库无法打开'));};
  });return mainPromise;}
  function sync(){if(syncPromise)return syncPromise;syncPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(SYNC,SYNC_VERSION);
    req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();syncPromise=null};resolve(req.result);};
    req.onerror=()=>{syncPromise=null;reject(req.error||new Error('同步队列无法打开'));};
  });return syncPromise;}
  const reqP=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  // 两个 IndexedDB 不支持跨库事务：跨库防护标记不能当成云端已确认。
  // 本机业务事务未完成时仅保存 pending token；进程中断后由 recover 强制一次完整对账。
  async function beginFence(token){
    const d=await sync();return new Promise((resolve,reject)=>{
      const tx=d.transaction('meta','readwrite'),meta=tx.objectStore('meta');let error=null;
      const get=meta.get('mocui_atomic_guard_v479');
      get.onsuccess=()=>{try{
        const guard=get.result?.value||{tokens:[]};
        const tokens=[...new Set([...(guard.tokens||[]),token])];
        meta.put({key:'mocui_atomic_guard_v479',value:{tokens},updatedAt:Date.now()});
      }catch(e){error=e;tx.abort();}};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(error||tx.error||new Error('同步保护失败'));
    });
  }
  async function stageSync(token,records){
    const d=await sync();return new Promise((resolve,reject)=>{
      const tx=d.transaction(['dirty','meta'],'readwrite'),dirty=tx.objectStore('dirty'),meta=tx.objectStore('meta');let failure=null;
      const get=meta.get('mocui_atomic_guard_v479');
      get.onsuccess=()=>{try{
        const guard=get.result?.value||{tokens:[]};
        if(!(guard.tokens||[]).includes(token))throw new Error('同步保护标记丢失，请检查同步状态');
        for(const row of records){
          if(!row?.id)continue;
          dirty.put({key:key(row.store,row.id),store:row.store,recordId:String(row.id),mutation:'put',payload:row.data,createdAt:Date.now()});
        }
        const remaining=(guard.tokens||[]).filter(x=>x!==token);
        meta.put({key:'mocui_atomic_guard_v479',value:{tokens:remaining},updatedAt:Date.now()});
      }catch(e){failure=e;tx.abort();}};
      tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure||tx.error||new Error('同步标记写入失败'));
    });
  }
  async function requireFullScan(){
    const d=await sync();return new Promise((resolve,reject)=>{
      const tx=d.transaction('meta','readwrite');tx.objectStore('meta').put({key:'needsFullScan',value:true,updatedAt:Date.now()});
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('对账标记保存失败'));
    });
  }
  async function recover(){
    try{
      const d=await sync();return await new Promise((resolve,reject)=>{
        const tx=d.transaction('meta','readwrite'),meta=tx.objectStore('meta');let found=false,error=null;
        const get=meta.get('mocui_atomic_guard_v479');
        get.onsuccess=()=>{try{
          found=!!get.result?.value?.tokens?.length;
          if(found){
            // 与标记清理同一事务：哪怕下次启动前再次断电，fullScan 仍保留。
            meta.put({key:'needsFullScan',value:true,updatedAt:Date.now()});
            meta.put({key:'mocui_atomic_guard_v479',value:{tokens:[]},updatedAt:Date.now()});
          }
        }catch(e){error=e;tx.abort();}};
        tx.oncomplete=()=>resolve(found);tx.onabort=()=>reject(error||tx.error||new Error('事务恢复标记失败'));
      });
    }catch(e){console.warn('[v4.7.9] 同步恢复检查失败，需人工确认',e);throw e;}
  }
  function normalizeMoves(changes){
    const result=new Map();
    for(const c of changes||[]){
      const id=String(c.productId||'');const delta=Number(c.delta);
      if(!id||!Number.isFinite(delta)||!c.type||!c.refId||!c.refType)throw new Error('库存流水参数不完整');
      const k=[id,c.type,c.refType,c.refId,c.operationId||''].join('\u001f');
      const old=result.get(k);
      if(old)old.delta+=delta;else result.set(k,{...c,productId:id,delta});
    }
    return [...result.values()];
  }
  async function commit({moves=[],writes=[],audit=[],label='业务提交'}={}){
    if(!window.CloudSync?.incrementalV3)throw new Error('增量同步模块尚未就绪，已阻止本次库存操作');
    const normalized=normalizeMoves(moves),rowWrites=writes.map(w=>({store:w.store,data:w.data,absent:!!w.absent,expectedStatus:w.expectedStatus,expectedUpdatedAt:w.expectedUpdatedAt}));
    if(!normalized.length&&!rowWrites.length)throw new Error('没有需要保存的内容');
    const writeKeys=rowWrites.map(w=>key(w.store,w.data?.id));
    if(new Set(writeKeys).size!==writeKeys.length)throw new Error(`${label}：同一业务单据重复提交`);
    if(rowWrites.some(w=>!['sales','loans','settings','stocktakes','products'].includes(w.store)))throw new Error(`${label}：无效的业务数据表`);
    const token=`atom_${crypto.randomUUID()}`;
    await beginFence(token);
    let committed=false,changed=[];
    try{
      const d=await main();
      const stores=[...new Set(['products','stockMoves','auditLogs',...rowWrites.map(w=>w.store)])];
      changed=await new Promise((resolve,reject)=>{
        const tx=d.transaction(stores,'readwrite'),products=tx.objectStore('products'),moveStore=tx.objectStore('stockMoves');
        const fetched=new Map(),existingWrites=new Map(),out=[],groups=new Map();let failed=null;
        const abort=e=>{if(failed)return;failed=e instanceof Error?e:new Error(String(e));try{tx.abort();}catch{}};
        for(const move of normalized){if(!groups.has(move.productId))groups.set(move.productId,[]);groups.get(move.productId).push(move);}
        const tasks=[];
        for(const id of groups.keys())tasks.push(new Promise((res,rej)=>{
          const r=products.get(id);r.onsuccess=()=>{fetched.set(id,r.result);res();};r.onerror=()=>rej(r.error);
        }));
        for(const w of rowWrites){if(!w.data?.id){abort(new Error('业务单据缺少 ID'));break;}tasks.push(new Promise((res,rej)=>{
          const r=tx.objectStore(w.store).get(w.data.id);r.onsuccess=()=>{existingWrites.set(key(w.store,w.data.id),r.result);res();};r.onerror=()=>rej(r.error);
        }));}
        const allMoves=new Promise((res,rej)=>{const r=moveStore.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});
        Promise.all([...tasks,allMoves]).then(values=>{
          if(failed)return;
          try{
            const oldMoves=values[values.length-1];
            for(const m of normalized){
              if(oldMoves.some(x=>String(x.productId)===m.productId&&x.type===m.type&&x.refType===m.refType&&String(x.refId)===String(m.refId)&&(!m.operationId||x.operationId===m.operationId)))
                throw new Error(`${label}：已有同业务库存流水，已阻止重复扣减，请先核对原单据`);
            }
            for(const w of rowWrites){
              const original=existingWrites.get(key(w.store,w.data.id));
              if(w.absent&&original)throw new Error(`${label}：单据已存在，不能重复保存`);
              if(w.expectedStatus!==undefined&&String(original?.status||'')!==String(w.expectedStatus))throw new Error(`${label}：单据状态已变化，请重新打开`);
              if(w.expectedUpdatedAt!==undefined&&String(original?.updatedAt||'')!==String(w.expectedUpdatedAt||''))throw new Error(`${label}：单据被其他操作更新，请重新打开`);
              // 单调递增版本，避免同一毫秒内 updatedAt 碰撞导致陈旧表单覆盖新交易。
              const currentRevision=Number(original?.__mocuiAtomicRevision||0);
              const draftRevision=Number(w.data.__mocuiAtomicRevision||0);
              if(original&&currentRevision!==draftRevision)throw new Error(`${label}：单据已被更新，请重新打开`);
              const row={...w.data,__mocuiAtomicRevision:currentRevision+1};
              tx.objectStore(w.store).put(row);out.push({store:w.store,id:row.id,data:row});
            }
            for(const [id,entries] of groups){
              const p=fetched.get(id);if(!p)throw new Error(`${label}：商品 ${id} 已不存在`);
              let count=Number(p.stock||0);if(!Number.isFinite(count))throw new Error(`${p.name||id} 库存异常`);
              const changedProduct={...p};
              for(const m of entries){
                const before=count,after=Math.round((count+Number(m.delta))*10000)/10000;
                if(m.expectedStock!==undefined&&(!Number.isFinite(Number(m.expectedStock))||Math.abs(before-Number(m.expectedStock))>1e-8))throw new Error(`${p.name||id} 的账面库存已变化：原 ${m.expectedStock}，现 ${before}，请重新盘点`);
                if(after<0)throw new Error(`${p.name||id} 库存不足：现有 ${before}，本次变化 ${m.delta}`);
                if(!Number.isFinite(after))throw new Error('库存变动无效');
                count=after;
                const row={id:`move_${crypto.randomUUID()}`,productId:p.id,productCode:p.code,productName:p.name,type:m.type,qtyChange:Number(m.delta),beforeStock:before,afterStock:after,refType:m.refType,refId:m.refId,operationId:m.operationId||'',note:m.note||'',createdAt:m.createdAt||now()};
                moveStore.put(row);out.push({store:'stockMoves',id:row.id,data:row});
              }
              if(count!==Number(p.stock||0)){
                changedProduct.stock=count;changedProduct.updatedAt=now();products.put(changedProduct);out.push({store:'products',id:changedProduct.id,data:changedProduct});
              }
            }
            for(const a of audit){
              const row={id:`audit_${crypto.randomUUID()}`,action:a.action,entityType:a.entityType,entityId:String(a.entityId||''),summary:String(a.summary||''),before:null,after:a.after||null,deviceId:String(window.CloudSync?.deviceId||'').slice(0,80),createdAt:now()};
              tx.objectStore('auditLogs').put(row);out.push({store:'auditLogs',id:row.id,data:row});
            }
          }catch(e){abort(e);}
        }).catch(abort);
        tx.oncomplete=()=>resolve(out);
        tx.onabort=()=>reject(failed||tx.error||new Error(`${label}失败，已回滚全部本机变动`));
        tx.onerror=()=>{};
      });
      committed=true;
    }catch(e){
      // 未提交时安全释放哨兵；释放失败保留完整对账标记，下次启动继续检查。
      try{await stageSync(token,[]);}catch{}
      throw e;
    }
    let syncQueued=true;
    try{await stageSync(token,changed);}catch(e){
      syncQueued=false;console.error('[v4.7.9] 本机事务已成功，云端队列待恢复',e);
      try{await requireFullScan();}catch(err){console.error('[v4.7.9] 强制对账标记失败，请停止业务并保留本机数据',err);}
    }
    try{window.dispatchEvent(new CustomEvent('mocui-atomic-commit',{detail:{products:changed.filter(x=>x.store==='products').map(x=>x.data)}}));}catch{}
    try{window.CloudSync.schedule(180);}catch{}
    if(!syncQueued){
      console.warn('[v4.7.9] 操作已保存在本机；云端尚待恢复同步，请不要清缓存');
      try{window.alert?.('本次业务已经保存在本机，但云端同步队列写入失败。\n请不要重复提交，也不要清理缓存或卸载应用。\n请在“更多 → 数据与设置”导出备份并检查同步状态。');}catch{}
    }
    return{ok:committed,syncQueued};
  }
  async function hasPending(){
    const d=await sync();const meta=d.transaction('meta','readonly').objectStore('meta');
    const [guard,fullScan]=await Promise.all([reqP(meta.get('mocui_atomic_guard_v479')),reqP(meta.get('needsFullScan'))]);
    return Boolean(guard?.value?.tokens?.length||fullScan?.value);
  }
  window.MocuiAtomic479={version:'4.7.9.1',commit,recover,hasPending,normalizeMoves};
})();
