'use strict';
(() => {
  const QUEUE_DB='mocui_media_upload_queue';
  const QUEUE_VERSION=1;
  const STORE='tradeGalleryJobs';
  const MAX_CONCURRENCY=3;
  const MAX_RETRIES=3;
  let processing=false;

  function openQueueDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(QUEUE_DB,QUEUE_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('上传队列数据库打开失败'));
    });
  }
  async function qPut(job){
    const db=await openQueueDb();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).put(job);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error('保存上传队列失败'));
      });
    }finally{db.close();}
  }
  async function qDelete(id){
    const db=await openQueueDb();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error('删除上传队列失败'));
      });
    }finally{db.close();}
  }
  async function qAll(){
    const db=await openQueueDb();
    try{
      return await new Promise((resolve,reject)=>{
        const req=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
        req.onsuccess=()=>resolve(req.result||[]);
        req.onerror=()=>reject(req.error||new Error('读取上传队列失败'));
      });
    }finally{db.close();}
  }

  function ensurePill(){
    if(!document.getElementById('mocuiUploadQueueStyle')){
      const s=document.createElement('style');
      s.id='mocuiUploadQueueStyle';
      s.textContent=`#mocuiUploadQueuePill{position:fixed;left:50%;bottom:calc(78px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9998;max-width:calc(100vw - 32px);padding:8px 12px;border-radius:999px;background:#111827;color:#fff;font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.18);display:none;white-space:nowrap}#mocuiUploadQueuePill.show{display:block}#mocuiUploadQueuePill.error{background:#9f3a16}`;
      document.head.appendChild(s);
    }
    let el=document.getElementById('mocuiUploadQueuePill');
    if(!el){el=document.createElement('div');el.id='mocuiUploadQueuePill';document.body.appendChild(el);}
    return el;
  }
  function pill(text,error=false){
    const el=ensurePill();
    el.textContent=text||'';
    el.classList.toggle('show',Boolean(text));
    el.classList.toggle('error',Boolean(error));
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  async function compressForUpload(file){
    if(!file||Number(file.size||0)<=900*1024)return {body:file,mime:file?.type||'image/jpeg'};
    try{
      if(typeof window.compressImage!=='function')return {body:file,mime:file.type||'image/jpeg'};
      const dataUrl=await window.compressImage(file,1600,.80);
      const blob=await (await fetch(dataUrl)).blob();
      if(blob?.size&&blob.size<Number(file.size||0)*.92)return {body:blob,mime:blob.type||'image/jpeg'};
    }catch{}
    return {body:file,mime:file.type||'image/jpeg'};
  }

  async function uploadWithRetry(file,batchId){
    let lastError;
    for(let attempt=1;attempt<=MAX_RETRIES;attempt++){
      try{
        const {body,mime}=await compressForUpload(file);
        const res=await fetch('/api/media/upload',{
          method:'POST',
          credentials:'same-origin',
          headers:{'content-type':mime||'image/jpeg','x-product-id':`trade-${batchId}`.slice(0,80)},
          body
        });
        const type=res.headers.get('content-type')||'';
        const out=type.includes('application/json')?await res.json().catch(()=>({})):await res.text();
        if(!res.ok)throw new Error(out?.error||out||`上传失败 ${res.status}`);
        return out;
      }catch(err){
        lastError=err;
        if(attempt<MAX_RETRIES)await sleep(700*attempt);
      }
    }
    throw lastError||new Error('图片上传失败');
  }

  function progress(job){
    const total=job.items?.length||0;
    const done=(job.items||[]).filter(x=>x.result?.url).length;
    return {total,done};
  }

  async function finalizeJob(job){
    if(typeof window.getTradeGalleryLedger!=='function'||typeof window.putTradeGalleryLedger!=='function')throw new Error('货源库模块尚未加载');
    const ledger=await window.getTradeGalleryLedger();
    if((ledger.batches||[]).some(x=>x.id===job.id)){await qDelete(job.id);return;}
    const createdAt=job.createdAt||new Date().toISOString();
    const batch={
      id:job.id,
      dealerName:job.sourcePending?'':job.dealerName,
      sourcePending:Boolean(job.sourcePending),
      receivedAt:job.receivedAt,
      note:job.note||'',
      items:(job.items||[]).map(x=>({
        id:x.id,url:x.result.url,mime:x.result.mime||'',size:Number(x.result.size||x.originalSize||0),
        originalName:x.originalName||'',itemName:x.itemName||'',price:x.price===''?'':Number(x.price||0),
        note:x.note||'',status:'active',createdAt
      })),
      createdAt,updatedAt:new Date().toISOString()
    };
    ledger.batches=[batch,...(ledger.batches||[])];
    await window.putTradeGalleryLedger(ledger);
    if(!batch.sourcePending&&typeof window.rememberTradeGalleryDealer==='function')await window.rememberTradeGalleryDealer(batch.dealerName);
    if(typeof window.writeAudit==='function')await window.writeAudit('trade_gallery.create','tradeGallery',batch.id,`${batch.sourcePending?'待确认来源':batch.dealerName} · ${batch.items.length}张货源图`,null,{dealerName:batch.dealerName,sourcePending:batch.sourcePending,receivedAt:batch.receivedAt,count:batch.items.length});
    await qDelete(job.id);
    window.dispatchEvent(new CustomEvent('trade-gallery-upload-complete',{detail:{batchId:job.id}}));
  }

  async function processOneJob(job){
    if(!navigator.onLine)throw new Error('当前离线，等待联网后续传');
    if((job.items||[]).every(x=>x.result?.url)){await finalizeJob(job);return;}
    const indexes=(job.items||[]).map((x,i)=>x.result?.url?-1:i).filter(i=>i>=0);
    let cursor=0,failed=null;
    async function worker(){
      while(!failed){
        const slot=cursor++;
        if(slot>=indexes.length)return;
        const idx=indexes[slot],item=job.items[idx];
        const p=progress(job);pill(`货源图后台上传 ${p.done+1}/${p.total}`);
        try{
          item.result=await uploadWithRetry(item.file,job.id);
          item.uploadedAt=new Date().toISOString();
          item.file=null;
          job.updatedAt=new Date().toISOString();
          await qPut(job);
        }catch(err){
          item.error=err?.message||'上传失败';
          item.failedAt=new Date().toISOString();
          job.updatedAt=new Date().toISOString();
          await qPut(job);
          failed=err;
          return;
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(MAX_CONCURRENCY,indexes.length)},()=>worker()));
    if(failed)throw failed;
    await finalizeJob(job);
  }

  async function processQueue(){
    if(processing)return;
    processing=true;
    try{
      const jobs=(await qAll()).sort((a,b)=>Number(a.queuedAt||0)-Number(b.queuedAt||0));
      if(!jobs.length){pill('');return;}
      for(const job of jobs){
        const p=progress(job);pill(`货源图后台上传 ${p.done}/${p.total}`);
        try{
          await processOneJob(job);
          if(!(await qAll()).length){pill('货源图片已全部上传');setTimeout(()=>pill(''),1800);}
        }catch(err){
          pill(`上传暂停：${err?.message||'网络异常'}，会自动续传`,true);
          break;
        }
      }
    }finally{processing=false;}
  }

  async function enqueueDraft(draft){
    const jobs=await qAll();
    const existing=jobs.find(x=>x.id===draft.id);
    if(existing){void processQueue();return existing;}
    if(typeof window.getTradeGalleryLedger==='function'){
      const ledger=await window.getTradeGalleryLedger();
      if((ledger.batches||[]).some(x=>x.id===draft.id))return null;
    }
    const received=new Date(draft.receivedAt);
    if(Number.isNaN(received.getTime()))throw new Error('货源时间无效');
    const job={
      id:draft.id,dealerName:draft.sourcePending?'':draft.dealerName,sourcePending:Boolean(draft.sourcePending),
      receivedAt:received.toISOString(),note:draft.note||'',queuedAt:Date.now(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
      items:(draft.items||[]).map(x=>({
        id:x.id,file:x.file,originalName:x.file?.name||'',originalSize:Number(x.file?.size||0),
        itemName:x.itemName||'',price:x.price??'',note:x.note||'',result:null
      }))
    };
    await qPut(job);
    void processQueue();
    return job;
  }

  function install(){
    if(typeof window.commitTradeGalleryBatch!=='function'){setTimeout(install,80);return;}
    if(window.commitTradeGalleryBatch.__queueVersion)return;
    const replacement=async function(draft,btn,statusEl){
      if(typeof window.tradeGalleryGuardOk==='function'&&!window.tradeGalleryGuardOk())throw new Error('货源库保护检查未通过');
      if(btn){btn.disabled=true;btn.dataset.submitting='1';btn.textContent='正在保存到本机…';}
      try{
        if(statusEl)statusEl.textContent='正在建立本机安全上传队列…';
        await enqueueDraft(draft);
        if(statusEl)statusEl.textContent='已保存到本机，图片后台上传；现在可以继续操作或关闭页面。';
        if(typeof window.showToast==='function')window.showToast('已保存到本机，图片后台上传中');
        return {queued:true};
      }finally{
        if(btn&&document.body.contains(btn)){btn.disabled=false;btn.dataset.submitting='0';btn.textContent='保存这批货源图片';}
      }
    };
    replacement.__queueVersion='1.6';
    window.commitTradeGalleryBatch=replacement;
    try{commitTradeGalleryBatch=replacement;}catch{}
    void processQueue();
  }

  window.MocuiUploadQueue={process:processQueue,list:qAll,enqueue:enqueueDraft};
  window.addEventListener('online',()=>void processQueue());
  window.addEventListener('load',()=>setTimeout(()=>void processQueue(),800));
  window.addEventListener('trade-gallery-upload-complete',()=>{
    if(document.body?.dataset?.uiRoute==='trade-gallery'&&typeof window.renderTradeGallery==='function')void window.renderTradeGallery().catch(()=>{});
  });
  install();
})();