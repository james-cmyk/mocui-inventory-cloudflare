'use strict';
(()=>{
  const VERSION='4.4.5';
  const MAX_IMAGES=12;
  const base={
    openProductForm:typeof openProductForm==='function'?openProductForm:null,
    renderProductDetail:typeof renderProductDetail==='function'?renderProductDetail:null,
    renderPassDealNew:typeof renderPassDealNew==='function'?renderPassDealNew:null,
    syncPassDealFormToDraft:typeof syncPassDealFormToDraft==='function'?syncPassDealFormToDraft:null,
    savePassDeal:typeof savePassDeal==='function'?savePassDeal:null,
    openPassDealDetail:typeof openPassDealDetail==='function'?openPassDealDetail:null,
    openExternalGoodForm:typeof openExternalGoodForm==='function'?openExternalGoodForm:null,
    saveExternalGood:typeof saveExternalGood==='function'?saveExternalGood:null,
    openExternalGoodDetail:typeof openExternalGoodDetail==='function'?openExternalGoodDetail:null,
  };

  function mediaList(row){
    const out=[];
    const add=v=>{const s=String(v||'').trim();if(s&&!out.includes(s))out.push(s);};
    (Array.isArray(row?.images)?row.images:[]).forEach(add);
    add(row?.image);
    return out.slice(0,MAX_IMAGES);
  }
  function syncPrimary(row){
    row.images=mediaList(row);
    row.image=row.images[0]||'';
    return row;
  }
  async function appendFiles(images,files,{maxSide=1080,quality=.72}={}){
    const room=Math.max(0,MAX_IMAGES-images.length);
    if(!room){showToast(`最多保存 ${MAX_IMAGES} 张图片`);return images;}
    const picked=[...(files||[])].slice(0,room);
    for(const file of picked)images.push(await compressImage(file,maxSide,quality));
    if((files?.length||0)>room)showToast(`只添加前 ${room} 张，最多 ${MAX_IMAGES} 张`);
    return images;
  }
  function mediaGrid(images,{removeClass='',cover=true}={}){
    if(!images?.length)return '<div class="field-help">尚未选择图片</div>';
    return `<div class="mocui-media-grid">${images.map((src,idx)=>`<div class="mocui-media-tile"><img src="${esc(src)}" alt="图片 ${idx+1}">${cover&&idx===0?'<span class="mocui-media-cover">首图</span>':''}${removeClass?`<button type="button" class="mocui-media-remove ${removeClass}" data-index="${idx}" aria-label="删除第${idx+1}张图片">×</button>`:''}</div>`).join('')}</div>`;
  }
  function detailGallery(images){
    if(!images?.length)return '';
    return `<div class="mocui-detail-gallery">${images.map((src,idx)=>`<img src="${esc(src)}" alt="图片 ${idx+1}" loading="lazy">`).join('')}</div>`;
  }

  // ---------- 正式商品：单图 -> 最多12图，image继续作为兼容首图 ----------
  if(base.openProductForm){
    const wrapped=async function(product=null,{copy=false}={}){
      await base.openProductForm(product,{copy});
      const form=$('#productForm'),input=$('#productImage'),preview=$('#productImagePreview');
      if(!form||!input||!preview)return;
      const recovered=!product&&!copy?loadLocalDraft('mocui_product_draft_v1'):null;
      const p=product||recovered||{};
      let images=mediaList(p);
      input.multiple=true;
      const label=document.querySelector('label[for="productImage"]');
      if(label)label.innerHTML=`点击选择图片（可多选）<br><small>最多 ${MAX_IMAGES} 张；再次选择会继续添加，不覆盖已有图片</small>`;

      const draw=()=>{
        preview.innerHTML=mediaGrid(images,{removeClass:'v445-remove-product-image'});
        preview.classList.add('mocui-multi-preview');
        $$('.v445-remove-product-image',preview).forEach(btn=>btn.onclick=()=>{images.splice(n(btn.dataset.index),1);window.__mocuiProductDirty=true;draw();});
      };
      const compactDraft=()=>{
        if(product||copy)return;
        const fd=new FormData(form);
        // localStorage 草稿只留首图，避免多张 base64 撑爆浏览器本地配额；当前打开页面内仍保留全部图片。
        saveLocalDraft('mocui_product_draft_v1',{name:String(fd.get('name')||''),code:String(fd.get('code')||''),category:String(fd.get('category')||''),categoryId:String(fd.get('categoryId')||''),color:String(fd.get('color')||''),costPrice:n(fd.get('costPrice')),salePrice:n(fd.get('salePrice')),stock:n(fd.get('stock')),note:String(fd.get('note')||''),image:images[0]||''});
      };
      input.onchange=async e=>{await appendFiles(images,e.target.files,{maxSide:1280,quality:.76});e.target.value='';window.__mocuiProductDirty=true;compactDraft();draw();};
      form.addEventListener('input',()=>{compactDraft();});

      form.onsubmit=async e=>{
        e.preventDefault();
        const btn=e.submitter||$('#productForm button[type="submit"]');
        if(btn?.dataset.submitting==='1')return;
        setCoreButtonBusy(btn,true,'正在保存…','保存商品');
        try{
          const fd=new FormData(e.target),oldStock=n(p.stock),newStock=n(fd.get('stock')),catLink=await ensureCategoryTreeValue(String(fd.get('category')||''));
          const normalized=mediaList({images,image:images[0]||''});
          const obj={...(product&&!copy?p:{}),id:copy||!product?uid('prod'):p.id,name:String(fd.get('name')).trim(),code:String(fd.get('code')).trim()||await nextProductCode(),category:catLink.value,categoryId:String(fd.get('categoryId')||catLink.categoryId||''),color:String(fd.get('color')).trim(),costPrice:n(fd.get('costPrice')),salePrice:n(fd.get('salePrice')),stock:product&&!copy?oldStock:newStock,note:String(fd.get('note')).trim(),images:normalized,image:normalized[0]||'',createdAt:copy||!product?nowISO():p.createdAt,updatedAt:nowISO()};
          if(!obj.name){showToast('请填写商品名称');return;}
          const allProducts=await dbAll('products'),sameCode=allProducts.find(x=>x.id!==obj.id&&String(x.code||'').trim()===obj.code);
          if(sameCode){showToast(`商品编码 ${obj.code} 已存在：${sameCode.name}`);return;}
          const before=product?auditSafe(product):null;await dbPut('products',obj);
          if((copy||!product)&&obj.stock!==0&&!await stockMoveExists(obj.id,'initial','product',obj.id))await dbPut('stockMoves',{id:uid('move'),productId:obj.id,productCode:obj.code,productName:obj.name,type:'initial',qtyChange:obj.stock,beforeStock:0,afterStock:obj.stock,refType:'product',refId:obj.id,note:'新建商品初始库存',createdAt:nowISO()});
          await writeAudit(product?'product.update':copy?'product.copy':'product.create','product',obj.id,`${obj.name} 已保存`,before,obj);
          clearLocalDraft('mocui_product_draft_v1');window.__mocuiProductDirty=false;closeModal();showToast(`商品已保存 · ${obj.images.length} 张图片`);await navigate('products');
        }catch(err){showToast(err?.message||'商品保存失败，请重试');}
        finally{if(btn&&document.body.contains(btn))setCoreButtonBusy(btn,false,'','保存商品');}
      };
      draw();
    };
    window.openProductForm=wrapped;try{openProductForm=wrapped;}catch(_){}
  }

  if(base.renderProductDetail){
    const wrapped=async function(){
      await base.renderProductDetail.apply(this,arguments);
      const p=await dbGet('products',appState.params.id).catch(()=>null),images=mediaList(p);
      if(!p||images.length<=1)return;
      const card=$('#main .card');if(!card||card.querySelector('.mocui-product-gallery'))return;
      const box=document.createElement('div');box.className='mocui-product-gallery';box.innerHTML=`<div class="mocui-gallery-title">商品图片 <span>${images.length} 张</span></div>${detailGallery(images)}`;card.appendChild(box);
    };
    window.renderProductDetail=wrapped;try{renderProductDetail=wrapped;}catch(_){}
  }

  // ---------- 过手单：支持多图 ----------
  if(base.syncPassDealFormToDraft){
    const wrapped=function(){
      const d=base.syncPassDealFormToDraft.apply(this,arguments);if(!d)return d;
      syncPrimary(d);saveLocalDraft(PASS_DEAL_PENDING_KEY,{...d});return d;
    };
    window.syncPassDealFormToDraft=wrapped;try{syncPassDealFormToDraft=wrapped;}catch(_){}
  }

  if(base.renderPassDealNew){
    const wrapped=async function(){
      await base.renderPassDealNew.apply(this,arguments);
      const d=appState.passDealDraft,input=$('#passDealImageInput'),preview=$('#passDealImagePreview');if(!d||!input||!preview)return;
      d.images=mediaList(d);d.image=d.images[0]||'';input.multiple=true;
      const label=document.querySelector('label[for="passDealImageInput"]');if(label)label.textContent='选择照片（可多选）';
      const draw=()=>{preview.innerHTML=mediaGrid(d.images,{removeClass:'v445-remove-pass-image'});$$('.v445-remove-pass-image',preview).forEach(btn=>btn.onclick=()=>{d.images.splice(n(btn.dataset.index),1);d.image=d.images[0]||'';saveLocalDraft(PASS_DEAL_PENDING_KEY,{...d});draw();});};
      input.onchange=async e=>{await appendFiles(d.images,e.target.files,{maxSide:1080,quality:.72});d.image=d.images[0]||'';e.target.value='';saveLocalDraft(PASS_DEAL_PENDING_KEY,{...d});draw();};draw();
    };
    window.renderPassDealNew=wrapped;try{renderPassDealNew=wrapped;}catch(_){}
  }

  if(base.savePassDeal){
    const wrapped=function(btn){
      return withCoreActionLock('pass-deal-save',btn,'正在记录…',async()=>{
        const d=syncPassDealFormToDraft()||passDealNewDraft();syncPrimary(d);clearFieldValidation();
        if(!d.itemName)return showFieldValidation('请填写货品描述。',$('#passDealItem'));
        if(!d.sourceName)return showFieldValidation('请填写货主 / 来源。',$('#passDealSource'));
        if(!d.buyerName)return showFieldValidation('请填写买家 / 客户。',$('#passDealBuyer'));
        if(d.costAmount==='')return showFieldValidation('请填写拿货成本。',$('#passDealCost'));
        if(d.saleAmount==='')return showFieldValidation('请填写成交价。',$('#passDealSale'));
        if(!d.createdAt||Number.isNaN(new Date(d.createdAt).getTime()))return showFieldValidation('请选择有效的成交时间。',$('#passDealDate'));
        const cost=n(d.costAmount),sale=n(d.saleAmount);if(cost<0)return showFieldValidation('拿货成本不能小于 0。',$('#passDealCost'));if(sale<0)return showFieldValidation('成交价不能小于 0。',$('#passDealSale'));
        d.__corePassDealId=d.__corePassDealId||uid('pass');d.__corePassDealNo=d.__corePassDealNo||await nextPassDealNo();saveLocalDraft(PASS_DEAL_PENDING_KEY,{...d});
        const existing=await getPassDeal(d.__corePassDealId);if(existing){clearLocalDraft(PASS_DEAL_PENDING_KEY);appState.passDealDraft=null;showToast(`过手单已存在：${existing.dealNo}`);navigate('pass-deals',{highlight:existing.id});return;}
        const row={id:d.__corePassDealId,dealNo:d.__corePassDealNo,itemName:d.itemName,qty:Math.max(.01,n(d.qty)||1),sourceName:d.sourceName,buyerName:d.buyerName,costAmount:cost,saleAmount:sale,receivedAmount:d.receivedAmount===''?sale:Math.max(0,n(d.receivedAmount)),sourcePaidAmount:d.sourcePaidAmount===''?cost:Math.max(0,n(d.sourcePaidAmount)),note:d.note||'',images:mediaList(d),image:mediaList(d)[0]||'',status:'active',sourceType:'pass_deal',stockApplied:false,businessDate:String(d.createdAt||'').slice(0,10)||localDateKey(),createdAt:d.createdAt?new Date(d.createdAt).toISOString():nowISO(),updatedAt:nowISO(),coreVersion:1};
        await putPassDeal(row);await writeAudit('passdeal.create','passDeal',row.id,`${row.dealNo} · ${row.sourceName} → ${row.buyerName} · 利润 ${fmtMoney(passDealProfit(row))}`,null,row);clearLocalDraft(PASS_DEAL_PENDING_KEY);appState.passDealDraft=null;showToast(`过手单已记录 · ${row.images.length} 张图片`);navigate('pass-deals',{highlight:row.id});
      }).catch(err=>showToast(err?.message||'过手单保存失败，请重试'));
    };
    window.savePassDeal=wrapped;try{savePassDeal=wrapped;}catch(_){}
  }

  if(base.openPassDealDetail){
    const wrapped=function(row){
      if(!row)return;const profit=passDealProfit(row),images=mediaList(row);
      openModal(`过手单 ${row.dealNo}`,`${detailGallery(images)}<div class="grid-2"><div class="metric compact"><div class="label">货主</div><div class="value" style="font-size:14px">${esc(row.sourceName)}</div></div><div class="metric compact"><div class="label">买家</div><div class="value" style="font-size:14px">${esc(row.buyerName)}</div></div></div><div class="section-title">${esc(row.itemName)} <small>数量 ${fmtInt(row.qty)}</small></div><div class="total-box"><div class="total-row"><span>成交</span><strong>${fmtMoney(row.saleAmount)}</strong></div><div class="total-row"><span>成本</span><strong>${fmtMoney(row.costAmount)}</strong></div><div class="total-row"><span>实收 / 买家未收</span><strong>${fmtMoney(row.receivedAmount)} / ${fmtMoney(passDealBuyerDue(row))}</strong></div><div class="total-row"><span>已付货主 / 未付</span><strong>${fmtMoney(row.sourcePaidAmount)} / ${fmtMoney(passDealSourceDue(row))}</strong></div><div class="total-row grand"><span>差价利润</span><strong>${fmtMoney(profit)}</strong></div></div><div class="notice">状态：${passDealIsActive(row)?'有效':'已作废'}<br>时间：${fmtDateTime(row.createdAt)}<br>备注：${esc(row.note||'无')}<br><strong>库存影响：0</strong></div>`,{});
    };
    window.openPassDealDetail=wrapped;try{openPassDealDetail=wrapped;}catch(_){}
  }

  // ---------- 外部同行货：支持多图 ----------
  if(base.saveExternalGood){
    const wrapped=function(btn,draft){
      return withCoreActionLock('external-good-new',btn,'正在保存…',async()=>{
        if(!draft.itemName||!draft.ownerName)throw new Error('请填写货品和货主');syncPrimary(draft);
        const row={id:uid('external'),tempNo:await nextExternalNo(),itemName:draft.itemName.trim(),qty:Math.max(.01,n(draft.qty)||1),ownerName:draft.ownerName.trim(),ownerCostAmount:Math.max(0,n(draft.ownerCostAmount)),note:draft.note||'',images:mediaList(draft),image:mediaList(draft)[0]||'',status:'held',currentHolderName:'本店',stockApplied:false,businessDate:String(draft.date||'').slice(0,10)||localDateKey(),createdAt:draft.date?new Date(draft.date).toISOString():nowISO(),updatedAt:nowISO(),events:[]};
        await putExternalGood(row);await writeAudit('external.intake','externalGood',row.id,`${row.tempNo} · ${row.ownerName} · ${row.itemName}`,null,row);showToast(`外部货已登记 · ${row.images.length} 张图片`);closeModal();renderExternalGoods();
      }).catch(err=>showToast(err?.message||'保存失败'));
    };
    window.saveExternalGood=wrapped;try{saveExternalGood=wrapped;}catch(_){}
  }

  if(base.openExternalGoodForm){
    const wrapped=async function(){
      await base.openExternalGoodForm.apply(this,arguments);
      const form=$('#externalGoodForm'),input=$('#externalImage'),preview=$('#externalImagePreview');if(!form||!input||!preview)return;
      const images=[];input.multiple=true;const label=document.querySelector('label[for="externalImage"]');if(label)label.textContent='选择照片（可多选）';
      const draw=()=>{preview.innerHTML=mediaGrid(images,{removeClass:'v445-remove-external-image'});$$('.v445-remove-external-image',preview).forEach(btn=>btn.onclick=()=>{images.splice(n(btn.dataset.index),1);draw();});};
      input.onchange=async e=>{await appendFiles(images,e.target.files,{maxSide:1080,quality:.72});e.target.value='';draw();};
      form.onsubmit=async e=>{e.preventDefault();const draft={itemName:$('#externalItem').value,qty:$('#externalQty').value,date:$('#externalDate').value,ownerName:$('#externalOwner').value,ownerCostAmount:$('#externalCost').value,note:$('#externalNote').value,images:[...images],image:images[0]||''};await saveExternalGood($('#saveExternalGoodBtn'),draft);};draw();
    };
    window.openExternalGoodForm=wrapped;try{openExternalGoodForm=wrapped;}catch(_){}
  }

  if(base.openExternalGoodDetail){
    const wrapped=async function(id){
      const r=await getExternalGood(id);if(!r)return;const images=mediaList(r);const actions=r.status==='held'?`<div class="grid-2"><button id="externalTransfer" class="btn secondary">调给别人</button><button id="externalSell" class="btn">我直接卖出</button></div><button id="externalReturnOwner" class="btn ghost block" style="margin-top:8px">归还货主</button>`:r.status==='out'?`<div class="grid-2"><button id="externalSoldByDealer" class="btn">对方卖掉 / 结算</button><button id="externalBack" class="btn secondary">退回我这里</button></div><button id="externalReturnOwner" class="btn ghost block" style="margin-top:8px">直接归还货主</button>`:'';
      openModal(`${r.itemName} · ${r.tempNo}`,`${detailGallery(images)}<div class="grid-2"><div class="metric compact"><div class="label">货主</div><div class="value" style="font-size:14px">${esc(r.ownerName)}</div></div><div class="metric compact"><div class="label">状态</div><div class="value" style="font-size:14px">${externalStatusName(r)}</div></div></div><div class="total-box"><div class="total-row"><span>数量 / 货主底价</span><strong>${fmtInt(r.qty)} / ${fmtMoney(r.ownerCostAmount)}</strong></div><div class="total-row"><span>当前位置</span><strong>${esc(r.currentHolderName||'-')}</strong></div>${r.status==='sold'?`<div class="total-row"><span>成交 / 实收</span><strong>${fmtMoney(r.saleAmount)} / ${fmtMoney(r.receivedAmount)}</strong></div><div class="total-row"><span>已付货主 / 未付</span><strong>${fmtMoney(r.ownerPaidAmount)} / ${fmtMoney(externalOwnerDue(r))}</strong></div><div class="total-row grand"><span>外部货利润</span><strong>${fmtMoney(externalProfit(r))}</strong></div>`:''}</div>${actions}<div class="notice" style="margin-top:10px">备注：${esc(r.note||'无')}<br><strong>正式库存影响：0</strong></div>`,{onOpen:()=>{if($('#externalTransfer'))$('#externalTransfer').onclick=()=>openExternalTransfer(r.id);if($('#externalSell'))$('#externalSell').onclick=()=>openExternalSale(r.id,'direct');if($('#externalSoldByDealer'))$('#externalSoldByDealer').onclick=()=>openExternalSale(r.id,'dealer');if($('#externalBack'))$('#externalBack').onclick=()=>externalBackToStore(r.id,$('#externalBack'));if($('#externalReturnOwner'))$('#externalReturnOwner').onclick=()=>externalReturnToOwner(r.id,$('#externalReturnOwner'));}});
    };
    window.openExternalGoodDetail=wrapped;try{openExternalGoodDetail=wrapped;}catch(_){}
  }

  window.MocuiMultiMedia={version:VERSION,maxImages:MAX_IMAGES,mediaList};
})();
