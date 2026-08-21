'use strict';
(() => {
  const VERSION='2.2.0',REPORT_ID='productDedupeLastReportV2';
  let dedupeRunning=false,dashToken=0;
  const qs=(s,r=document)=>r.querySelector(s);
  const norm=v=>String(v??'').trim().toLowerCase().replace(/\s+/g,'');
  const t=v=>{const x=Date.parse(v||'');return Number.isFinite(x)?x:0;};
  const isQ=p=>p?.source==='qinsilk'||String(p?.sourceKey||'').startsWith('qinsilk:')||Boolean(p?.qinsilk);
  function keyOf(p){
    const code=norm(p?.code);
    if(code&&!/^his-\d+$/i.test(String(p?.code||'')))return `code:${code}`;
    const barcode=norm(p?.qinsilk?.barcode); if(barcode)return `barcode:${barcode}`;
    const sk=norm(p?.sourceKey); if(sk&&sk.startsWith('qinsilk:product:'))return `source:${sk}`;
    return '';
  }
  function groupsOf(products){
    const m=new Map();
    for(const p of products||[]){if(!p||p.mergedInto)continue;const k=keyOf(p);if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(p);}
    return [...m.entries()].map(([key,rows])=>({key,rows})).filter(g=>g.rows.length>1&&g.rows.some(isQ));
  }
  function canonical(rows){
    return [...rows].sort((a,b)=>{
      const aa=a.historicalOnly?0:1,bb=b.historicalOnly?0:1;if(aa!==bb)return bb-aa;
      const am=isQ(a)?0:1,bm=isQ(b)?0:1;if(am!==bm)return bm-am;
      return (t(a.createdAt)||Number.MAX_SAFE_INTEGER)-(t(b.createdAt)||Number.MAX_SAFE_INTEGER);
    })[0];
  }
  function newest(rows){return [...rows].sort((a,b)=>Math.max(t(b.updatedAt),t(b.createdAt))-Math.max(t(a.updatedAt),t(a.createdAt)))[0]||rows[0];}
  function mergeNotes(rows){const s=new Set(),out=[];for(const r of rows){const x=String(r?.note||'').trim();if(x&&!s.has(x)){s.add(x);out.push(x);}}return out.join('\n');}
  function buildMain(base,rows){
    const nrow=newest(rows),q=rows.filter(r=>r?.qinsilk).sort((a,b)=>t(a.updatedAt)-t(b.updatedAt)).reduce((a,r)=>({...a,...r.qinsilk}),{});
    const created=rows.map(r=>r.createdAt).filter(Boolean).sort((a,b)=>t(a)-t(b))[0]||base.createdAt||nrow.createdAt;
    return {...base,
      name:nrow?.name||base.name,code:base.code||nrow?.code||'',category:nrow?.category||base.category||'',categoryId:nrow?.categoryId||base.categoryId||'',
      color:nrow?.color||base.color||'',costPrice:Number.isFinite(Number(nrow?.costPrice))?Number(nrow.costPrice):Number(base.costPrice||0),
      salePrice:Number.isFinite(Number(nrow?.salePrice))?Number(nrow.salePrice):Number(base.salePrice||0),
      stock:Number.isFinite(Number(nrow?.stock))?Number(nrow.stock):Number(base.stock||0),
      note:mergeNotes(rows),image:nrow?.image||base.image||rows.find(r=>r?.image)?.image||'',
      source:base.source||nrow?.source||'',sourceKey:rows.find(r=>String(r?.sourceKey||'').startsWith('qinsilk:product:'))?.sourceKey||base.sourceKey||nrow?.sourceKey||'',
      qinsilk:Object.keys(q).length?q:base.qinsilk,historicalOnly:rows.some(r=>!r.historicalOnly)?false:Boolean(base.historicalOnly),
      mergedFrom:[...new Set([...(base.mergedFrom||[]),...rows.filter(r=>r.id!==base.id).map(r=>r.id)])],dedupeVersion:VERSION,createdAt:created,updatedAt:new Date().toISOString()
    };
  }
  function remapDeep(v,map){
    if(Array.isArray(v))return v.map(x=>remapDeep(x,map));
    if(!v||typeof v!=='object')return v;
    let ch=false;const o={};
    for(const [k,val] of Object.entries(v)){if(k==='productId'&&map.has(String(val))){o[k]=map.get(String(val));ch=true;}else{const nx=remapDeep(val,map);o[k]=nx;if(nx!==val)ch=true;}}
    return ch?o:v;
  }
  async function remapRefs(map){
    let changed=0;
    for(const store of ['sales','loans','stocktakes']){
      for(const row of await dbAll(store)){const nx=remapDeep(row,map);if(nx!==row){nx.updatedAt=new Date().toISOString();await dbPut(store,nx,true);changed++;}}
    }
    for(const move of await dbAll('stockMoves')){
      if(!map.has(String(move.productId)))continue;
      if(['qinsilk_initial','qinsilk_inventory_sync'].includes(move.type))continue;
      await dbPut('stockMoves',{...move,productId:map.get(String(move.productId))},true);changed++;
    }
    return changed;
  }
  async function scanDuplicates(){
    const products=await dbAll('products'),groups=groupsOf(products);
    return {groups,duplicateCount:groups.reduce((s,g)=>s+g.rows.length-1,0),productCount:products.filter(p=>!p.historicalOnly).length};
  }
  async function mergeDuplicates({confirmUser=true,quiet=false}={}){
    if(dedupeRunning)return {busy:true};dedupeRunning=true;
    try{
      const scan=await scanDuplicates();
      if(!scan.groups.length){if(!quiet)showToast('没有发现可安全合并的重复导入商品');return {mergedGroups:0,archived:0,references:0};}
      if(confirmUser){
        const names=scan.groups.slice(0,5).map(g=>g.rows[0]?.name||g.rows[0]?.code||g.key).join('、');
        const ok=await confirmDialog(`发现 ${scan.groups.length} 组、${scan.duplicateCount} 个高置信重复导入商品。\n\n示例：${names}${scan.groups.length>5?' 等':''}\n\n相同货号/条码只保留一个主商品；库存取最新快照，不累加；旧重复记录归档，不硬删除；销售/调借引用会指向主商品。\n\n确认开始整理吗？`);
        if(!ok)return {cancelled:true};
      }
      const map=new Map(),report=[];let archived=0;
      for(const g of scan.groups){
        const main=canonical(g.rows),merged=buildMain(main,g.rows);await dbPut('products',merged,true);
        const ids=[];
        for(const r of g.rows){if(r.id===main.id)continue;map.set(String(r.id),main.id);ids.push(r.id);await dbPut('products',{...r,stock:0,historicalOnly:true,mergedInto:main.id,mergeArchivedAt:new Date().toISOString(),dedupeVersion:VERSION,updatedAt:new Date().toISOString()},true);archived++;}
        report.push({key:g.key,canonicalId:main.id,name:merged.name,code:merged.code,archivedIds:ids});
      }
      const references=await remapRefs(map);
      await dbPut('settings',{id:REPORT_ID,version:VERSION,mergedAt:new Date().toISOString(),mergedGroups:report.length,archived,references,groups:report},true);
      window.CloudSync?.schedule?.(100);
      if(!quiet)showToast(`已合并 ${report.length} 组重复商品，归档 ${archived} 条`);
      if(appState?.route==='products')await renderProducts(); if(appState?.route==='dashboard')await renderDashboard();
      return {mergedGroups:report.length,archived,references};
    }catch(e){console.error('product dedupe failed',e);if(!quiet)showToast(`重复商品整理失败：${e?.message||'未知错误'}`);throw e;}
    finally{dedupeRunning=false;}
  }
  function patchImport(){
    try{
      if(typeof importQinsilkProducts!=='function'||importQinsilkProducts.__mocuiDedupePatched)return;
      const old=importQinsilkProducts;
      const wrap=async function(...args){const r=await old.apply(this,args);await mergeDuplicates({confirmUser:false,quiet:true});return r;};
      wrap.__mocuiDedupePatched=true;importQinsilkProducts=wrap;
    }catch(e){console.warn('QinSilk dedupe patch skipped',e);}
  }
  function addCleanupCard(){
    if(appState?.route!=='more')return;const main=qs('#main');if(!main||qs('#mocuiDataCleanupCard'))return;
    const card=document.createElement('section');card.id='mocuiDataCleanupCard';card.className='mocui-maintenance-card';
    card.innerHTML=`<div class="mocui-maintenance-head"><div><strong>数据整理</strong><span>只合并高置信重复导入商品</span></div><span class="mocui-safe-chip">安全归档</span></div><button id="mocuiScanDuplicates" class="mocui-maintenance-btn" type="button"><span>检查重复商品</span><b>›</b></button><div id="mocuiDuplicateResult" class="mocui-maintenance-note">相同货号/条码才会自动判为重复；只同名但货号不同的商品不会自动合并。</div>`;
    main.appendChild(card);
    qs('#mocuiScanDuplicates').onclick=async()=>{const b=qs('#mocuiScanDuplicates'),box=qs('#mocuiDuplicateResult');b.disabled=true;b.querySelector('span').textContent='正在检查…';try{const r=await scanDuplicates();if(!r.groups.length){box.textContent='没有发现高置信重复导入商品。';showToast('没有发现重复导入商品');}else{box.textContent=`发现 ${r.groups.length} 组，共 ${r.duplicateCount} 条重复记录。`;await mergeDuplicates({confirmUser:true});}}finally{b.disabled=false;b.querySelector('span').textContent='检查重复商品';}};
  }
  async function enhanceDashboard(){
    if(appState?.route!=='dashboard')return;const token=++dashToken,main=qs('#main');if(!main||qs('#mocuiTodayLedgerBreakdown'))return;
    try{
      const [sales,deals,externalGoods]=await Promise.all([dbAll('sales'),getPassDeals(),getExternalGoods()]);
      if(token!==dashToken||appState?.route!=='dashboard')return;
      const range=dateRange('today'),formal=sales.filter(s=>saleIsReportActive(s)&&recordInBusinessRange(s,range,'sale')),pass=(deals||[]).filter(d=>passDealIsActive(d)&&recordInBusinessRange(d,range,'pass')),ext=externalSoldRowsForRange(externalGoods,range);
      const a=formal.reduce((x,r)=>x+n(r.finalAmount),0),b=pass.reduce((x,r)=>x+n(r.saleAmount),0),c=ext.reduce((x,r)=>x+n(r.saleAmount),0),total=a+b+c;
      const sec=document.createElement('section');sec.id='mocuiTodayLedgerBreakdown';sec.className='mocui-ledger-breakdown';
      sec.innerHTML=`<div class="mocui-ledger-title"><div><strong>今日成交构成</strong><span>总额合并，账目分开</span></div><b>${fmtMoney(total)}</b></div><div class="mocui-ledger-grid"><div class="mocui-ledger-item"><span>正式 / 调借账</span><strong>${fmtMoney(a)}</strong><small>${formal.length} 单</small></div><div class="mocui-ledger-item"><span>过手差价账</span><strong>${fmtMoney(b)}</strong><small>${pass.length} 单</small></div><div class="mocui-ledger-item"><span>外部同行货账</span><strong>${fmtMoney(c)}</strong><small>${ext.length} 单</small></div></div><div class="mocui-ledger-foot">首页“今日总成交额” = 三类成交额之和；报表仍按三套账分别核算。</div>`;
      const grid=main.querySelector('.grid-2');grid?grid.insertAdjacentElement('afterend',sec):main.prepend(sec);
    }catch(e){console.warn('dashboard turnover enhancement failed',e);}
  }
  function polishBack(){
    const back=qs('#pageBack');if(!back)return;back.classList.add('mocui-back-button');
    if(!back.querySelector('.mocui-back-label'))back.innerHTML='<span class="mocui-back-chevron" aria-hidden="true">‹</span><span class="mocui-back-label">返回</span>';
  }
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const canBack=()=>standalone()&&qs('#pageBack')&&!qs('#pageBack').classList.contains('hidden')&&!qs('#modalRoot .modal-backdrop')&&!document.body.classList.contains('keyboard-open')&&typeof goBack==='function';
  function swipeBack(){
    if(window.__mocuiSwipeBackInstalled)return;window.__mocuiSwipeBackInstalled=true;
    const ind=document.createElement('div');ind.id='mocuiSwipeBackIndicator';ind.innerHTML='<span>‹</span>';document.body.appendChild(ind);
    let on=false,sx=0,sy=0,lx=0,ly=0,st=0,q=false;
    const reset=()=>{on=false;q=false;ind.classList.remove('show','ready');ind.style.removeProperty('--swipe-progress');};
    document.addEventListener('touchstart',e=>{if(!canBack()||e.touches.length!==1)return;const p=e.touches[0];if(p.clientX>34)return;on=true;sx=lx=p.clientX;sy=ly=p.clientY;st=performance.now();ind.classList.add('show');},{passive:true});
    document.addEventListener('touchmove',e=>{if(!on||e.touches.length!==1)return;const p=e.touches[0];lx=p.clientX;ly=p.clientY;const dx=Math.max(0,lx-sx),dy=Math.abs(ly-sy);if(dx<8)return;if(dy>dx*.85){reset();return;}q=true;const prog=Math.min(1,dx/92);ind.style.setProperty('--swipe-progress',String(prog));ind.classList.toggle('ready',dx>=72);if(dx>12&&e.cancelable)e.preventDefault();},{passive:false});
    document.addEventListener('touchend',async()=>{if(!on)return;const dx=lx-sx,vel=dx/Math.max(1,performance.now()-st),ok=q&&(dx>=72||(dx>=48&&vel>.5));reset();if(ok&&canBack())try{await goBack();}catch(e){console.warn(e);}},{passive:true});
    document.addEventListener('touchcancel',reset,{passive:true});
  }
  function run(){polishBack();addCleanupCard();void enhanceDashboard();}
  const ob=new MutationObserver(()=>requestAnimationFrame(run));
  document.addEventListener('DOMContentLoaded',()=>{patchImport();polishBack();swipeBack();const main=qs('#main'),top=qs('.topbar');if(main)ob.observe(main,{childList:true});if(top)ob.observe(top,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});setTimeout(run,500);});
  window.MocuiBusinessUX={version:VERSION,scanDuplicates,mergeDuplicates};
})();
