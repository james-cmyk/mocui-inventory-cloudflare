'use strict';
(()=>{
  const VERSION='4.1.4';
  const DB_NAME='mocui_inventory_db', DB_VERSION=2;
  const STORES=['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
  const SNAP_PREFIX='mocui_v41_snapshot:';
  const state={running:false,last:null,errors:[]};
  const num=v=>Number(v||0);
  const reqP=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
  function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('数据库正在被其他页面占用'));});}
  async function readAll(){
    const db=await openDB(),out={};
    try{for(const s of STORES){if(!db.objectStoreNames.contains(s))throw new Error(`缺少正式数据表：${s}`);out[s]=await reqP(db.transaction(s,'readonly').objectStore(s).getAll());}}
    finally{db.close();}
    return out;
  }
  const dup=(rows,key)=>{const m=new Map(),out=[];for(const r of rows){const v=String(r?.[key]||'').trim();if(!v)continue;if(m.has(v))out.push(v);else m.set(v,1);}return [...new Set(out)];};
  function loanReturned(l,i){if(i?.returnedQty!==undefined)return Math.min(num(i.qty),Math.max(0,num(i.returnedQty)));return (l.returns||[]).reduce((s,e)=>s+num((e.items||[]).find(x=>x.productId===i?.productId)?.qty),0);}
  function loanSold(l,i){if(i?.soldQty!==undefined)return Math.min(num(i.qty),Math.max(0,num(i.soldQty)));return (l.saleEvents||[]).filter(e=>e.status!=='cancelled').reduce((s,e)=>s+num((e.items||[]).find(x=>x.productId===i?.productId)?.qty),0);}
  function syncSnapshot(){const c=window.CloudSync||{};return {mode:c.mode||'unknown',revision:Number(c.revision||0),deviceId:String(c.deviceId||'').slice(0,12),available:!!window.CloudSync};}
  const BASELINE_ID='ledgerBaselineV414';
  function baselineFromSettings(settings){const b=(settings||[]).find(x=>x&&x.id===BASELINE_ID);return b&&b.establishedAt&&b.stocks&&typeof b.stocks==='object'?b:null;}
  async function scan(){
    if(state.running)return state.last; state.running=true;
    const started=Date.now(),issues=[],warnings=[];
    try{
      const d=await readAll(),products=d.products||[],sales=d.sales||[],loans=d.loans||[],moves=d.stockMoves||[],baseline=baselineFromSettings(d.settings);
      const baselineTime=baseline?new Date(baseline.establishedAt).getTime():0;
      const pids=new Set(products.map(x=>x.id)), saleIds=new Set(sales.map(x=>x.id));
      for(const code of dup(products,'code'))issues.push({type:'duplicate_product_code',level:'error',text:`重复商品编码：${code}`});
      for(const no of dup(sales,'orderNo'))issues.push({type:'duplicate_sale_no',level:'error',text:`重复销售单号：${no}`});
      for(const no of dup(loans,'loanNo'))issues.push({type:'duplicate_loan_no',level:'error',text:`重复调借单号：${no}`});
      for(const s of sales){
        if(!s?.id||!Array.isArray(s.items)){issues.push({type:'sale_shape',level:'error',text:`销售单 ${s?.orderNo||s?.id||'未知'} 数据结构异常`});continue;}
        if(s.status==='active'&&!s.items.length)issues.push({type:'empty_sale',level:'error',text:`销售单 ${s.orderNo||s.id} 没有商品`});
        for(const i of s.items){if(num(i.qty)<=0)issues.push({type:'sale_qty',level:'error',text:`销售单 ${s.orderNo||s.id} 存在非正数量`});if(i.productId&&!pids.has(i.productId)&&!s.importedHistorical&&s.sourceType!=='qinsilk_history')warnings.push({type:'sale_product_missing',level:'warn',text:`销售单 ${s.orderNo||s.id} 引用的商品当前不存在`});}
      }
      for(const l of loans){
        for(const i of l.items||[]){const q=num(i.qty),r=loanReturned(l,i),s=loanSold(l,i);if(q<=0)issues.push({type:'loan_qty',level:'error',text:`调借单 ${l.loanNo||l.id} 存在非正数量`});if(r<0||s<0||r+s>q+1e-8)issues.push({type:'loan_overprocessed',level:'error',text:`调借单 ${l.loanNo||l.id} 的 ${i.productName||'商品'} 归还/售出数量超过原借数量`});}
        for(const e of (l.saleEvents||[]).filter(x=>x.status!=='cancelled'))if(e.saleId&&!saleIds.has(e.saleId))warnings.push({type:'loan_sale_missing',level:'warn',text:`调借单 ${l.loanNo||l.id} 的售出事件找不到销售单`});
      }
      const byProduct=new Map();for(const m of moves){if(!byProduct.has(m.productId))byProduct.set(m.productId,[]);byProduct.get(m.productId).push(m);if(m.productId&&!pids.has(m.productId))warnings.push({type:'orphan_move',level:'warn',text:`存在找不到商品的库存流水：${m.productName||m.productCode||m.id}`});}
      const saleRefsByProduct=new Map(),loanRefsByProduct=new Map();
      for(const sale of sales){if(sale.status==='cancelled')continue;for(const item of sale.items||[]){if(!item.productId)continue;if(!saleRefsByProduct.has(item.productId))saleRefsByProduct.set(item.productId,[]);saleRefsByProduct.get(item.productId).push({id:sale.id,no:sale.orderNo||sale.id,date:sale.saleDate||sale.createdAt,qty:num(item.qty),status:sale.status||'active'});}}
      for(const loan of loans){for(const item of loan.items||[]){if(!item.productId)continue;if(!loanRefsByProduct.has(item.productId))loanRefsByProduct.set(item.productId,[]);loanRefsByProduct.get(item.productId).push({id:loan.id,no:loan.loanNo||loan.id,date:loan.loanDate||loan.createdAt,qty:num(item.qty),status:loan.status||'active'});}}
      const stockDiffRows=[];let chainBreaks=0;
      for(const p of products){
        const all=(byProduct.get(p.id)||[]).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
        const hasBase=!!(baseline&&Object.prototype.hasOwnProperty.call(baseline.stocks,p.id));
        const list=hasBase?all.filter(m=>new Date(m.createdAt||0).getTime()>baselineTime):all;
        let expected=hasBase?num(baseline.stocks[p.id]):0,broken=false;
        for(const m of list){if(Math.abs(num(m.beforeStock)-expected)>1e-8&&m.type!=='ledger_reconcile')broken=true;expected+=num(m.qtyChange);if(Math.abs(num(m.afterStock)-expected)>1e-8)broken=true;}
        const current=num(p.stock),difference=current-expected;
        if(Math.abs(difference)>1e-8)stockDiffRows.push({productId:p.id,productCode:p.code||'',productName:p.name||'未命名商品',current,expected,difference,chainBroken:broken,sales:(saleRefsByProduct.get(p.id)||[]).filter(x=>!hasBase||new Date(x.date||0).getTime()>baselineTime).slice(-8),loans:(loanRefsByProduct.get(p.id)||[]).filter(x=>!hasBase||new Date(x.date||0).getTime()>baselineTime).slice(-8),recentMoves:list.slice(-8).map(m=>({id:m.id,type:m.type,createdAt:m.createdAt,qtyChange:num(m.qtyChange),beforeStock:num(m.beforeStock),afterStock:num(m.afterStock),refType:m.refType||'',refId:m.refId||''}))});
        if(broken)chainBreaks++;
      }
      if(stockDiffRows.length)issues.push({type:'stock_diff',level:'error',text:`${stockDiffRows.length} 个商品当前库存与流水推算不一致`,count:stockDiffRows.length,details:stockDiffRows});
      if(chainBreaks)warnings.push({type:'stock_chain',level:'warn',text:`${chainBreaks} 个商品的库存流水前后值存在断点`,count:chainBreaks});
      const report={version:VERSION,ok:issues.length===0,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),durationMs:Date.now()-started,counts:Object.fromEntries(STORES.map(s=>[s,(d[s]||[]).length])),issues,warnings,sync:syncSnapshot(),baseline:baseline?{establishedAt:baseline.establishedAt,productCount:Object.keys(baseline.stocks||{}).length}:null};
      state.last=report;localStorage.setItem('mocui_v41_last_health',JSON.stringify(report));window.dispatchEvent(new CustomEvent('mocui-v41-health',{detail:report}));return report;
    }catch(e){const report={version:VERSION,ok:false,finishedAt:new Date().toISOString(),durationMs:Date.now()-started,counts:{},issues:[{type:'scan_error',level:'error',text:e?.message||String(e)}],warnings:[],sync:syncSnapshot()};state.last=report;return report;}
    finally{state.running=false;}
  }
  async function snapshot(){const d=await readAll(),payload={format:'mocui-v41-emergency-snapshot',version:1,createdAt:new Date().toISOString(),dbVersion:DB_VERSION,stores:d};const raw=JSON.stringify(payload),key=SNAP_PREFIX+Date.now();try{localStorage.setItem(key,raw);const keys=Object.keys(localStorage).filter(k=>k.startsWith(SNAP_PREFIX)).sort().reverse();keys.slice(3).forEach(k=>localStorage.removeItem(k));return {ok:true,key,bytes:raw.length};}catch(e){return {ok:false,error:e?.message||String(e)};}}
  async function repairCaches(){const done=[];try{if(window.MocuiAnalytics?.rebuild){await window.MocuiAnalytics.rebuild();done.push('统计缓存');}}catch(_){}try{if(window.MocuiLargeDataLists?.rebuild){await window.MocuiLargeDataLists.rebuild();done.push('大数据列表索引');}}catch(_){}return done;}
  function rememberError(kind,event){const item={kind,time:new Date().toISOString(),message:String(event?.reason?.message||event?.message||event?.reason||'未知错误').slice(0,500)};state.errors.push(item);state.errors=state.errors.slice(-30);try{localStorage.setItem('mocui_v41_recent_errors',JSON.stringify(state.errors));}catch(_){}}
  window.addEventListener('error',e=>rememberError('error',e));window.addEventListener('unhandledrejection',e=>rememberError('promise',e));
  try{state.errors=JSON.parse(localStorage.getItem('mocui_v41_recent_errors')||'[]');}catch(_){}
  window.MocuiCoreSafety={version:VERSION,state,scan,snapshot,repairCaches,syncSnapshot,recentErrors:()=>[...state.errors],last:()=>state.last||(()=>{try{return JSON.parse(localStorage.getItem('mocui_v41_last_health')||'null');}catch(_){return null;}})()};
})();
