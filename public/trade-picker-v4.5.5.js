'use strict';

/*
 * 漠翠进销存 v4.5.5 — 销售/调借选货与草稿增强
 * 目标：
 * 1) 选货层独立于父级销售/调借页面，关闭选货不撤销父级表单。
 * 2) 在选货层内同时选择商品与数量；搜索始终固定在顶部。
 * 3) 销售与调借均提供显式“保存草稿”入口。
 * 不修改库存扣减/恢复、正式销售保存、正式调借保存等核心业务逻辑。
 */
(()=>{
  const VERSION='4.5.5';
  const SALE_DRAFT_KEY='mocui_sale_manual_draft_v455';
  const LOAN_DRAFT_KEY='mocui_loan_draft_v1';

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const num=v=>Number(v||0);
  const safeText=v=>String(v??'').trim();
  const escHtml=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=v=>typeof fmtMoney==='function'?fmtMoney(num(v)):`¥${num(v).toFixed(2)}`;
  const qtyText=v=>typeof fmtInt==='function'?fmtInt(num(v)):String(num(v));

  const baseRenderSaleNew=window.renderSaleNew;
  const baseRenderLoanFormModal=window.renderLoanFormModal;
  const baseSaveSale=window.saveSale;

  function compactSaleDraft(d){
    return {
      ...d,
      items:(d?.items||[]).map(i=>({...i,image:''})),
      accessoryUsages:(d?.accessoryUsages||[]).map(x=>({...x})),
      _manualDraft:true,
      _manualDraftSavedAt:new Date().toISOString()
    };
  }
  function compactLoanDraft(d){
    return {
      ...d,
      images:[],
      items:(d?.items||[]).map(i=>({...i,image:''})),
      _manualDraft:true,
      _manualDraftSavedAt:new Date().toISOString()
    };
  }
  function persistSaleDraftObject(d){
    saveLocalDraft(SALE_DRAFT_KEY,compactSaleDraft(d));
  }
  function persistLoanDraftObject(d){
    saveLocalDraft(LOAN_DRAFT_KEY,compactLoanDraft(d));
  }
  function saveSaleDraft({toast=true}={}){
    try{
      if(typeof syncSaleFormToDraft==='function')syncSaleFormToDraft();
      const d=appState?.saleDraft;
      if(!d)return false;
      persistSaleDraftObject(d);
      if(toast)showToast('销售草稿已保存');
      return true;
    }catch(e){
      console.warn('[v4.5.5 sale draft]',e);
      if(toast)showToast('草稿保存失败，请重试');
      return false;
    }
  }
  function syncLoanDraftFromForm(){
    const d=appState?.loanDraft;if(!d)return null;
    const type=q('#loanType'),person=q('#loanPerson'),date=q('#loanDate'),expected=q('#loanExpectedReturnDate'),note=q('#loanNote');
    if(type)d.type=type.value||d.type;
    if(person)d.person=person.value.trim();
    if(date)d.date=date.value;
    if(expected)d.expectedReturnDate=expected.value;
    if(note)d.note=note.value;
    qa('[data-loan-index]').forEach(el=>{
      const item=d.items?.[num(el.dataset.loanIndex)];
      const input=q('.loan-qty',el);
      if(item&&input)item.qty=num(input.value);
    });
    return d;
  }
  function saveLoanDraft({toast=true}={}){
    try{
      const d=syncLoanDraftFromForm();if(!d)return false;
      persistLoanDraftObject(d);
      if(toast)showToast('调借草稿已保存');
      return true;
    }catch(e){
      console.warn('[v4.5.5 loan draft]',e);
      if(toast)showToast('草稿保存失败，请重试');
      return false;
    }
  }

  function closePicker(){
    const root=q('#v455TradePicker');
    if(root)root.remove();
    document.body.classList.remove('v455-picker-open');
  }

  function productThumb(p){
    const src=p?.image||p?.images?.[0]||'';
    return src?`<img class="v455-picker-thumb" src="${src}" alt="">`:`<div class="v455-picker-thumb v455-picker-placeholder">货</div>`;
  }

  async function openTradePicker({mode='sale',title='选择商品与数量',currentItems=[],onConfirm}){
    closePicker();
    const products=(await dbAll('products')).filter(p=>!p.historicalOnly);
    const current=new Map((currentItems||[]).map(i=>[String(i.productId||i.id),i]));
    const selected=new Map();
    for(const [id,item] of current){
      const p=products.find(x=>String(x.id)===id);if(!p)continue;
      selected.set(id,{product:p,qty:Math.max(0,num(item.qty))||defaultQty(p,mode)});
    }

    function isOutbound(){return mode==='sale'||mode==='loan-lend';}
    function maxQty(p){return isOutbound()?Math.max(0,num(p.stock)):Infinity;}
    function defaultQty(p,m=mode){const max=m==='sale'||m==='loan-lend'?Math.max(0,num(p.stock)):Infinity;return Number.isFinite(max)?Math.min(1,max):1;}
    function normalizeQty(p,value){
      let v=Math.max(0,num(value));
      const max=maxQty(p);
      if(Number.isFinite(max))v=Math.min(v,max);
      return Math.round(v*100)/100;
    }
    function selectable(p){return !isOutbound()||num(p.stock)>0;}

    const root=document.createElement('div');
    root.id='v455TradePicker';root.className='v455-picker-overlay';
    root.innerHTML=`
      <section class="v455-picker-sheet" role="dialog" aria-modal="true" aria-label="${escHtml(title)}">
        <header class="v455-picker-head">
          <div><strong>${escHtml(title)}</strong><small>${mode==='sale'?'销售数量直接在这里填写':mode==='loan-lend'?'借出数量直接在这里填写':'调入数量直接在这里填写'}</small></div>
          <button id="v455PickerClose" class="v455-picker-close" type="button" aria-label="关闭选择商品">×</button>
        </header>
        <div class="v455-picker-searchbar">
          <span class="v455-search-icon" aria-hidden="true"></span>
          <input id="v455PickerSearch" type="search" inputmode="search" autocomplete="off" placeholder="搜索名称、编码、颜色">
          <span id="v455PickerSelectedSummary" class="v455-picker-summary"></span>
        </div>
        <div id="v455PickerList" class="v455-picker-list"></div>
        <footer class="v455-picker-footer">
          <button id="v455PickerCancel" class="btn secondary" type="button">返回</button>
          <button id="v455PickerConfirm" class="btn" type="button">确定选择</button>
        </footer>
      </section>`;
    document.body.appendChild(root);document.body.classList.add('v455-picker-open');

    const search=q('#v455PickerSearch',root),list=q('#v455PickerList',root),confirm=q('#v455PickerConfirm',root),summary=q('#v455PickerSelectedSummary',root);

    function totalQty(){let t=0;for(const x of selected.values())t+=num(x.qty);return Math.round(t*100)/100;}
    function validSelection(){
      if(!selected.size)return false;
      for(const {product,qty} of selected.values()){
        if(num(qty)<=0)return false;
        if(isOutbound()&&num(qty)>num(product.stock)+1e-8)return false;
      }
      return true;
    }
    function updateFooter(){
      summary.textContent=selected.size?`${selected.size}种 · ${qtyText(totalQty())}件`:'未选择';
      confirm.textContent=selected.size?`确定选择（${selected.size}种）`:'确定选择';
      confirm.disabled=!validSelection();
    }
    function rowHtml(p){
      const id=String(p.id),sel=selected.get(id),checked=!!sel,can=selectable(p),qty=sel?.qty??defaultQty(p);
      const max=maxQty(p),stockText=`库存 ${qtyText(p.stock)}`;
      return `<div class="v455-picker-row ${checked?'is-selected':''} ${can?'':'is-disabled'}" data-id="${escHtml(id)}">
        <button class="v455-picker-check" type="button" ${can?'':'disabled'} aria-label="${checked?'取消选择':'选择'} ${escHtml(p.name)}"><span>${checked?'✓':''}</span></button>
        ${productThumb(p)}
        <div class="v455-picker-copy">
          <strong>${escHtml(p.name)}</strong>
          <small>${escHtml(p.code||'无编码')} · ${escHtml(p.color||'未填写颜色')} · ${stockText}</small>
          <span>${money(p.salePrice)}</span>
        </div>
        <div class="v455-picker-qty ${checked?'':'is-hidden'}">
          <span>数量</span>
          <div class="v455-qty-control">
            <button class="v455-qty-minus" type="button" aria-label="减少数量">−</button>
            <input class="v455-qty-input" type="number" inputmode="decimal" min="0.01" step="0.01" ${Number.isFinite(max)?`max="${max}"`:''} value="${qty}">
            <button class="v455-qty-plus" type="button" aria-label="增加数量">＋</button>
          </div>
          ${Number.isFinite(max)?`<small>最多 ${qtyText(max)}</small>`:'<small>调入数量不限当前库存</small>'}
        </div>
      </div>`;
    }
    function bindRows(){
      qa('.v455-picker-row',list).forEach(row=>{
        const id=row.dataset.id,p=products.find(x=>String(x.id)===id);if(!p)return;
        const check=q('.v455-picker-check',row),input=q('.v455-qty-input',row),minus=q('.v455-qty-minus',row),plus=q('.v455-qty-plus',row);
        const setSelected=(on)=>{
          if(on){
            if(!selectable(p))return;
            const existing=selected.get(id);selected.set(id,{product:p,qty:existing?.qty||defaultQty(p)});
          }else selected.delete(id);
          draw();
        };
        check.onclick=e=>{e.preventDefault();e.stopPropagation();setSelected(!selected.has(id));};
        input?.addEventListener('focus',()=>{if(!selected.has(id)&&selectable(p)){selected.set(id,{product:p,qty:defaultQty(p)});row.classList.add('is-selected');q('.v455-picker-qty',row)?.classList.remove('is-hidden');check.querySelector('span').textContent='✓';updateFooter();}});
        input?.addEventListener('input',()=>{
          if(!selected.has(id))selected.set(id,{product:p,qty:defaultQty(p)});
          const v=normalizeQty(p,input.value);selected.get(id).qty=v;input.value=String(v||'');updateFooter();
        });
        minus?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!selected.has(id))return;let v=normalizeQty(p,num(selected.get(id).qty)-1);if(v<=0)v=Math.min(defaultQty(p),maxQty(p));selected.get(id).qty=v;input.value=String(v);updateFooter();});
        plus?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(!selected.has(id)){setSelected(true);return;}const v=normalizeQty(p,num(selected.get(id).qty)+1);selected.get(id).qty=v;input.value=String(v);updateFooter();});
      });
    }
    function draw(){
      const term=safeText(search.value).toLowerCase();
      const rows=products.filter(p=>{
        if(!term)return true;
        const hay=[p.name,p.code,p.color,p.note].map(v=>String(v||'').toLowerCase()).join(' ');
        if(hay.includes(term))return true;
        try{return typeof mocuiFuzzyMatch==='function'&&mocuiFuzzyMatch(term,p.name,p.code,p.color,p.note);}catch{return false;}
      });
      list.innerHTML=rows.length?rows.map(rowHtml).join(''):`<div class="v455-picker-empty"><strong>没有找到商品</strong><span>换名称、货号或颜色试试</span></div>`;
      bindRows();updateFooter();
    }

    q('#v455PickerClose',root).onclick=closePicker;
    q('#v455PickerCancel',root).onclick=closePicker;
    root.addEventListener('click',e=>{if(e.target===root)closePicker();});
    search.addEventListener('input',draw);
    confirm.onclick=()=>{
      if(!validSelection())return;
      const rows=[...selected.values()].map(x=>({product:x.product,qty:num(x.qty)}));
      closePicker();
      onConfirm?.(rows);
    };
    draw();setTimeout(()=>search.focus(),80);
  }

  function installSaleEnhancements(){
    const choose=q('#chooseProducts');if(!choose||!appState?.saleDraft)return;
    choose.textContent='＋ 选择商品与数量';
    choose.onclick=()=>{
      if(typeof syncSaleFormToDraft==='function')syncSaleFormToDraft();
      const d=appState.saleDraft;
      openTradePicker({mode:'sale',title:'选择销售商品与数量',currentItems:d.items,onConfirm:rows=>{
        const old=new Map((d.items||[]).map(i=>[String(i.productId),i]));
        d.items=rows.map(({product:p,qty})=>{
          const prev=old.get(String(p.id));
          return prev?{...prev,qty}:{productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty,price:num(p.salePrice),costPrice:num(p.costPrice),image:p.image,stock:num(p.stock),productNote:p.note||'',itemNote:''};
        });
        try{persistSaleDraftObject(d);}catch(e){console.warn('[v4.5.5 persist sale selection]',e);}
        renderSaleNew();
      }});
    };

    const finalSave=q('#saveSale');if(finalSave&&typeof window.saveSale==='function')finalSave.onclick=window.saveSale;

    if(!q('#v455SaveSaleDraft')){
      const btn=document.createElement('button');btn.id='v455SaveSaleDraft';btn.type='button';btn.className='btn secondary block v455-save-draft';btn.textContent='保存草稿';
      choose.insertAdjacentElement('afterend',btn);
      btn.onclick=()=>saveSaleDraft();
    }
  }

  function installLoanEnhancements(){
    const choose=q('#loanChooseProducts');if(!choose||!appState?.loanDraft)return;
    choose.textContent='＋ 选择商品与数量';
    choose.onclick=()=>{
      const d=syncLoanDraftFromForm()||appState.loanDraft;
      saveLoanDraft({toast:false});
      openTradePicker({mode:d.type==='borrow'?'loan-borrow':'loan-lend',title:d.type==='borrow'?'选择调入商品与数量':'选择借出商品与数量',currentItems:d.items,onConfirm:rows=>{
        const old=new Map((d.items||[]).map(i=>[String(i.productId),i]));
        d.items=rows.map(({product:p,qty})=>{
          const prev=old.get(String(p.id));
          return prev?{...prev,qty}:{productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty,stock:num(p.stock),image:p.image,productNote:p.note||'',costPrice:num(p.costPrice),salePrice:num(p.salePrice)};
        });
        try{persistLoanDraftObject(d);}catch(e){console.warn('[v4.5.5 persist loan selection]',e);}
        renderLoanFormModal();
      }});
    };

    const sticky=q('#loanForm .sticky-actions');
    if(sticky&&!q('#v455SaveLoanDraft',sticky)){
      const btn=document.createElement('button');btn.id='v455SaveLoanDraft';btn.type='button';btn.className='btn secondary v455-save-loan-draft';btn.textContent='保存草稿';
      sticky.insertBefore(btn,sticky.firstChild);
      sticky.classList.add('v455-loan-sticky-actions');
      btn.onclick=()=>saveLoanDraft();
    }
  }

  if(typeof baseRenderSaleNew==='function'){
    window.renderSaleNew=async function(){
      try{
        if(!appState?.saleDraft){
          const core=typeof loadLocalDraft==='function'?loadLocalDraft('mocui_sale_core_pending_v1'):null;
          if(!core?.__coreSaleId){
            const manual=typeof loadLocalDraft==='function'?loadLocalDraft(SALE_DRAFT_KEY):null;
            if(manual?._manualDraft){appState.saleDraft=manual;setTimeout(()=>showToast('已恢复销售草稿'),60);}
          }
        }
      }catch(e){console.warn('[v4.5.5 restore sale draft]',e);}
      const r=await baseRenderSaleNew.apply(this,arguments);
      installSaleEnhancements();
      return r;
    };
  }

  if(typeof baseRenderLoanFormModal==='function'){
    window.renderLoanFormModal=async function(){
      const r=await baseRenderLoanFormModal.apply(this,arguments);
      installLoanEnhancements();
      return r;
    };
  }

  if(typeof baseSaveSale==='function'){
    window.saveSale=async function(){
      const r=await baseSaveSale.apply(this,arguments);
      if(!appState?.saleDraft){try{clearLocalDraft(SALE_DRAFT_KEY);}catch{}}
      return r;
    };
  }

  // 现有页面如果在补丁加载前已经渲染，也立即安装一次。
  setTimeout(()=>{
    if(appState?.route==='sale-new')installSaleEnhancements();
    if(q('#loanForm'))installLoanEnhancements();
  },120);

  window.MocuiTradePicker455={version:VERSION,openTradePicker,saveSaleDraft,saveLoanDraft,closePicker};
})();
