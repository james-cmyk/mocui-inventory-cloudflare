'use strict';
(() => {
  const VERSION='3.1.0';
  const PERF_DB='mocui_perf_v31';
  const PERF_VERSION=1;
  const PAGE_SIZE=30;
  let perfDbPromise=null;
  let rebuildPromise=null;
  let generation=0;

  function openPerfDb(){
    if(perfDbPromise)return perfDbPromise;
    perfDbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open(PERF_DB,PERF_VERSION);
      req.onupgradeneeded=()=>{
        const d=req.result;
        if(!d.objectStoreNames.contains('products')){
          const s=d.createObjectStore('products',{keyPath:'id'});
          s.createIndex('updatedAt','updatedAt');
        }
        if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta',{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('快速索引打开失败'));
    });
    return perfDbPromise;
  }
  function reqP(req){return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
  async function allIndex(){
    const d=await openPerfDb();
    return reqP(d.transaction('products','readonly').objectStore('products').getAll());
  }
  async function metaGet(key){
    const d=await openPerfDb();
    return (await reqP(d.transaction('meta','readonly').objectStore('meta').get(key)))?.value;
  }
  async function metaSet(key,value){
    const d=await openPerfDb();
    return new Promise((res,rej)=>{
      const tx=d.transaction('meta','readwrite');
      tx.objectStore('meta').put({key,value,updatedAt:Date.now()});
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
    });
  }
  function lite(p){
    const image=String(p?.image||'');
    return {
      id:p.id,name:p.name||'',code:p.code||'',category:p.category||'',categoryId:p.categoryId||'',
      color:p.color||'',costPrice:Number(p.costPrice||0),salePrice:Number(p.salePrice||0),
      stock:Number(p.stock||0),historicalOnly:Boolean(p.historicalOnly),
      updatedAt:p.updatedAt||p.createdAt||'',
      // Base64 原图绝不复制进快速索引；R2/网络地址才保留。
      image:image.startsWith('data:')?'':image
    };
  }
  async function indexPut(p){
    if(!p?.id)return;
    const d=await openPerfDb();
    return new Promise((res,rej)=>{
      const tx=d.transaction('products','readwrite');
      tx.objectStore('products').put(lite(p));
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
    });
  }
  async function indexDelete(id){
    const d=await openPerfDb();
    return new Promise((res,rej)=>{
      const tx=d.transaction('products','readwrite');
      tx.objectStore('products').delete(id);
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
    });
  }

  async function rebuildIndex(force=false){
    if(rebuildPromise)return rebuildPromise;
    rebuildPromise=(async()=>{
      const ready=await metaGet('ready');
      if(ready&&!force)return;
      const rows=await dbAll('products');
      const d=await openPerfDb();
      await new Promise((res,rej)=>{
        const tx=d.transaction(['products','meta'],'readwrite'),s=tx.objectStore('products');
        s.clear();
        for(const p of rows)s.put(lite(p));
        tx.objectStore('meta').put({key:'ready',value:true,updatedAt:Date.now()});
        tx.objectStore('meta').put({key:'count',value:rows.length,updatedAt:Date.now()});
        tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error);
      });
    })().finally(()=>{rebuildPromise=null});
    return rebuildPromise;
  }

  function installWriteHooks(){
    if(window.__mocuiFastIndexHooks||typeof window.dbPut!=='function')return false;
    window.__mocuiFastIndexHooks=true;
    const oldPut=window.dbPut,oldAdd=window.dbAdd,oldDelete=window.dbDelete,oldClear=window.dbClear;
    window.dbPut=async function(store,value,...rest){
      const r=await oldPut.call(this,store,value,...rest);
      if(store==='products')void indexPut(value).catch(()=>metaSet('ready',false));
      return r;
    };
    window.dbAdd=async function(store,value,...rest){
      const r=await oldAdd.call(this,store,value,...rest);
      if(store==='products')void indexPut(value).catch(()=>metaSet('ready',false));
      return r;
    };
    window.dbDelete=async function(store,id,...rest){
      const r=await oldDelete.call(this,store,id,...rest);
      if(store==='products')void indexDelete(id).catch(()=>metaSet('ready',false));
      return r;
    };
    window.dbClear=async function(store,...rest){
      const r=await oldClear.call(this,store,...rest);
      if(store==='products')void metaSet('ready',false);
      return r;
    };
    return true;
  }

  function skeleton(){
    return `<div class="mocui-fast-products">
      <div class="grid-3">
        <div class="metric compact"><div class="label">商品数量</div><div class="value">—</div></div>
        <div class="metric compact"><div class="label">库存总数</div><div class="value">—</div></div>
        <div class="metric compact"><div class="label">库存成本</div><div class="value">—</div></div>
      </div>
      <div class="product-filter-row" style="margin-top:12px">
        <div class="search"><input id="productSearch" placeholder="名称 / 编码 / 颜色"></div>
        <button id="categoryFilterBtn" class="filter-select category-filter-btn" type="button">全部分类</button>
        <select id="stockFilter" class="filter-select"><option value="in" selected>有库存</option><option value="">全部库存</option><option value="low">低库存（1件）</option><option value="out">已售罄</option></select>
      </div>
      <div class="btn-row" style="margin-bottom:10px"><button class="btn secondary small" id="batchImport">导入</button><button class="btn secondary small" id="manageCategory">分类</button><button class="btn secondary small" id="exportProducts">导出</button></div>
      <div id="productList" class="list"><div class="mocui-index-loading">正在读取快速索引…</div></div>
      <button id="productLoadMore" class="btn secondary block mocui-load-more hidden" type="button">继续显示</button>
    </div>`;
  }

  function stockOK(p,value){
    return value==='in'?Number(p.stock)>0:value==='low'?Number(p.stock)===1:value==='out'?Number(p.stock)<=0:true;
  }

  async function fastRenderProducts(){
    const myGen=++generation;
    setHeader('商品管理','快速索引 · 分批显示',{label:'＋',onClick:()=>openProductForm()});
    $('#main').innerHTML=skeleton();

    // 页面结构先立即出现，再读取数据；不会让用户继续看到上一页。
    await new Promise(r=>requestAnimationFrame(r));
    if(myGen!==generation||appState.route!=='products')return;

    let ready=await metaGet('ready');
    if(!ready){
      $('#productList').innerHTML='<div class="mocui-index-loading"><strong>首次建立快速索引</strong><br>只执行一次，完成后商品页会明显更快。</div>';
      await rebuildIndex(true);
    }

    const [productsRaw,categories]=await Promise.all([allIndex(),dbAll('categories')]);
    if(myGen!==generation||appState.route!=='products')return;
    const products=productsRaw.filter(p=>!p.historicalOnly);
    products.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));

    const metrics=$$('.metric .value',$('#main'));
    if(metrics[0])metrics[0].textContent=String(products.length);
    if(metrics[1])metrics[1].textContent=fmtInt(products.reduce((a,p)=>a+Number(p.stock||0),0));
    if(metrics[2])metrics[2].textContent=fmtMoney(products.reduce((a,p)=>a+Number(p.stock||0)*Number(p.costPrice||0),0));

    let selectedCategoryId='__all__',shown=PAGE_SIZE,filtered=[];
    const selectedLabel=()=>{
      if(selectedCategoryId==='__all__')return '全部分类';
      if(selectedCategoryId==='__uncategorized__')return '未分类';
      return categories.find(x=>x.id===selectedCategoryId)?.name||'全部分类';
    };
    const selectedNode=()=>categories.find(c=>c.id===selectedCategoryId)||({id:selectedCategoryId});

    const draw=()=>{
      if(myGen!==generation||appState.route!=='products')return;
      const q=$('#productSearch')?.value.trim().toLowerCase()||'',stock=$('#stockFilter')?.value||'in';
      filtered=products.filter(p=>
        (selectedCategoryId==='__all__'||categoryNodeMatchesProduct(selectedNode(),p,categories)) &&
        stockOK(p,stock) &&
        (!q||[p.name,p.code,p.color,p.category,categoryPathLabel(p.category,categories)].some(v=>String(v||'').toLowerCase().includes(q)))
      );
      const rows=filtered.slice(0,shown),host=$('#productList');
      host.innerHTML=rows.length?rows.map(p=>productListItem(p,categories)).join(''):emptyState('⌕','没有找到商品','可调整关键词或分类');
      $$('#productList [data-product-id]').forEach(el=>el.onclick=()=>navigate('product-detail',{id:el.dataset.productId}));
      $('#categoryFilterBtn').textContent=selectedLabel();
      const more=$('#productLoadMore');
      if(more){
        more.classList.toggle('hidden',shown>=filtered.length);
        more.textContent=shown>=filtered.length?'已显示全部':`继续显示（剩余 ${filtered.length-shown}）`;
      }
      window.MocuiPerformance?.tuneImages?.(host);
    };

    draw();
    $('#productSearch').oninput=()=>{shown=PAGE_SIZE;draw()};
    $('#stockFilter').onchange=()=>{shown=PAGE_SIZE;draw()};
    $('#categoryFilterBtn').onclick=()=>openCategoryPicker({categories,selectedId:selectedCategoryId,allowAll:true,onSelect:id=>{selectedCategoryId=id;shown=PAGE_SIZE;draw()}});
    $('#productLoadMore').onclick=()=>{shown+=PAGE_SIZE;draw()};
    $('#batchImport').onclick=openBatchImport;
    $('#manageCategory').onclick=openCategoryManager;
    $('#exportProducts').onclick=async()=>{
      // 导出是低频操作，需要完整字段时才读取正式商品库。
      const full=(await dbAll('products')).filter(p=>!p.historicalOnly);
      exportProductsCSV(full);
    };
  }

  function installRenderer(){
    if(typeof window.renderProducts!=='function')return false;
    window.renderProducts=fastRenderProducts;
    return true;
  }

  const timer=setInterval(()=>{
    const a=installWriteHooks(),b=installRenderer();
    if(a&&b)clearInterval(timer);
  },25);
  setTimeout(()=>clearInterval(timer),10000);

  // 云端同步完成后不阻塞当前页面；空闲时重建一次轻量索引。
  let reconcileTimer=null;
  window.addEventListener('cloud-sync-ok',()=>{
    clearTimeout(reconcileTimer);
    reconcileTimer=setTimeout(()=>{
      metaSet('ready',false).then(()=>rebuildIndex(true)).catch(()=>{});
    },2500);
  });

  // 首次安装在浏览器空闲时建立索引，用户不进入商品页也可以预热。
  const warm=()=>rebuildIndex(false).catch(()=>{});
  if('requestIdleCallback' in window)requestIdleCallback(warm,{timeout:5000});else setTimeout(warm,2500);

  window.MocuiFastProductIndex={version:VERSION,rebuild:()=>rebuildIndex(true)};
})();