'use strict';
(()=>{
  const CURRENT='4.7.9.4';
  const VERSION_URL='./version.json';
  let registration=null,checking=false,lastCheck=0;
  const qs=s=>document.querySelector(s);


  // ===== v4.7.1 稳定性收口：统一页面增强 / 导航增强调度器 =====
  // 之前各版本分别包装 render* / navigate，功能没有问题，但层数会随版本增长。
  // 这里把它们收敛到单一包装层；各版本仍按注册顺序执行自己的增强逻辑。
  const afterHooks471=new Map();
  function ensureAfterHookTarget471(name){
    const current=window[name];if(typeof current!=='function')return false;
    if(current.__mocuiAfterHookBus471)return true;
    const base=current;
    const wrapped=async function(){
      const result=await base.apply(this,arguments),hooks=[...(afterHooks471.get(name)?.values()||[])];
      for(const hook of hooks){
        try{const out=hook.fn?.();if(hook.awaitAfter&&out&&typeof out.then==='function')await out;}
        catch(e){console.warn(`[${hook.key} ${name}]`,e);}
      }
      return result;
    };
    Object.defineProperty(wrapped,'__mocuiAfterHookBus471',{value:true});
    Object.defineProperty(wrapped,'__mocuiBase471',{value:base});
    window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
    return true;
  }
  function addAfterHook471(name,key,fn,{awaitAfter=false}={}){
    if(!afterHooks471.has(name))afterHooks471.set(name,new Map());
    afterHooks471.get(name).set(key,{key,fn,awaitAfter});
    return ensureAfterHookTarget471(name);
  }

  const navigateHooks471={before:new Map(),after:new Map()};
  function ensureNavigateBus471(){
    const current=window.navigate;if(typeof current!=='function')return false;
    if(current.__mocuiNavigateBus471)return true;
    const base=current;
    const wrapped=async function(route,params,options){
      const ctx={route,params,options,target:String(route||''),previous:String(window.appState?.route||''),started:Date.now(),args:arguments};
      for(const hook of navigateHooks471.before.values()){
        try{const out=hook.fn?.(ctx);if(hook.awaitHook&&out&&typeof out.then==='function')await out;}
        catch(e){console.warn(`[${hook.key} navigate:before]`,e);}
      }
      const result=await base.apply(this,arguments);ctx.result=result;ctx.current=String(window.appState?.route||'');
      for(const hook of navigateHooks471.after.values()){
        try{const out=hook.fn?.(ctx);if(hook.awaitHook&&out&&typeof out.then==='function')await out;}
        catch(e){console.warn(`[${hook.key} navigate:after]`,e);}
      }
      return result;
    };
    Object.defineProperty(wrapped,'__mocuiNavigateBus471',{value:true});
    Object.defineProperty(wrapped,'__mocuiBase471',{value:base});
    window.navigate=wrapped;try{globalThis.navigate=wrapped;}catch{}
    return true;
  }
  function addNavigateHook471(phase,key,fn,{awaitHook=false}={}){
    const bucket=navigateHooks471[phase];if(!bucket)return false;
    bucket.set(key,{key,fn,awaitHook});return ensureNavigateBus471();
  }
  function stabilityCleanup471(ctx){
    const target=String(ctx?.target||window.appState?.route||'');
    if(target!=='sale-new'){try{clearSale463?.();}catch{}}
    if(!['sales','loans'].includes(target)){try{closeCompletion468?.();}catch{}}
    const active=document.activeElement;
    if(!active?.matches?.('input,select,textarea,[contenteditable="true"]'))document.body.classList.remove('v462-field-focused');
  }

  // ===== v4.6.1 本机优先极速启动（保留） =====
  function installFastCloudStart(CloudSync){
    // v4.7.5：sync-v3 已经负责“本机先显示 + 后台增量同步”。
    // 不再提前放行 cloud bootstrap，否则登录失效/首次设备初始化时可能与 sync-v3 抢时序。
    if(!CloudSync||CloudSync.__mocuiFastStartV461)return;
    try{Object.defineProperty(CloudSync,'__mocuiFastStartV461',{value:true,configurable:false});}catch{}
  }

  try{
    if(window.CloudSync){
      installFastCloudStart(window.CloudSync);
    }else{
      let cloudValue;
      Object.defineProperty(window,'CloudSync',{
        configurable:true,enumerable:true,
        get(){return cloudValue;},
        set(value){
          cloudValue=value;
          try{installFastCloudStart(value);}catch(e){console.warn('[fast-start] install failed',e);}
          Object.defineProperty(window,'CloudSync',{configurable:true,enumerable:true,writable:true,value});
        }
      });
    }
  }catch(e){console.warn('[fast-start] hook failed',e);}

  // ===== v4.6.2 交互提速 =====
  function installInteractionStyles(){
    if(document.getElementById('mocuiInteraction462Styles'))return;
    const style=document.createElement('style');
    style.id='mocuiInteraction462Styles';
    style.textContent=`
      button,.clickable,[role="button"]{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
      button,.clickable{transition:transform .10s ease,opacity .10s ease,background-color .12s ease,border-color .12s ease}
      button:active,.clickable:active{transform:scale(.985)}

      .v462-draft-section{margin:10px 0 12px}
      .v462-draft-title{display:flex;align-items:center;justify-content:space-between;margin:0 3px 7px;font-size:12px;color:#75817b}
      .v462-draft-title strong{font-size:14px;color:#17221e}
      .v462-draft-list{display:grid;gap:7px}
      .v462-draft-card{width:100%;border:1px solid #cfe5d9!important;background:#eef8f3!important;border-radius:17px!important;padding:12px 13px!important;display:grid!important;grid-template-columns:38px minmax(0,1fr) auto!important;gap:10px!important;align-items:center!important;text-align:left!important;color:#17221e!important;box-shadow:none!important}
      .v462-draft-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#177355;color:#fff;font-size:14px;font-weight:850}
      .v462-draft-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.v462-draft-copy strong{font-size:14px}.v462-draft-copy small{font-size:10.5px;color:#66766e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .v462-draft-arrow{font-size:21px;color:#7a8d84;font-weight:400}

      .v462-main-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
      .v462-main-actions>button{min-height:66px!important}
      .v462-secondary-wrap{margin-top:9px}
      .v462-secondary-label{font-size:11px;color:#8a9690;margin:0 3px 6px}
      .v462-secondary-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
      .v462-secondary-actions button{appearance:none;border:1px solid #e4e9e6;background:#fff;border-radius:13px;min-height:43px;padding:7px 5px;color:#48564f;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:none}
      .v462-secondary-actions .v446-icon{display:none!important}
      .v462-secondary-actions button>span{display:block!important}.v462-secondary-actions button>span small,.v462-secondary-actions button>b{display:none!important}
      #v462Products .v446-icon{background:#e8f6ef;color:#177355}

      .sticky-actions{padding-bottom:max(10px,env(safe-area-inset-bottom))!important;gap:8px!important}
      .sticky-actions .btn{min-height:52px!important;font-size:15px!important;font-weight:800!important;border-radius:14px!important}
      #saveSale,.sale-submit,.v455-picker-confirm,#saveLoan,#saveReturn{min-height:52px!important}
      .v455-picker-footer{padding-bottom:max(10px,env(safe-area-inset-bottom))!important}
      .v455-picker-footer button{min-height:52px!important}

      body.v462-field-focused .bottom-nav{opacity:.24;pointer-events:none;transition:opacity .12s ease}
      @media(max-width:380px){.v462-draft-card{grid-template-columns:34px minmax(0,1fr) auto!important;padding:10px!important}.v462-draft-icon{width:34px;height:34px}.v462-secondary-actions{gap:5px}.v462-secondary-actions button{font-size:10.5px}}
    `;
    document.head.appendChild(style);
  }

  function safeLoad(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  function draftQty(d){return (d?.items||[]).reduce((s,i)=>s+Number(i?.qty||i?.returnQty||0),0);}
  function draftTime(d){
    const raw=d?._manualDraftSavedAt||d?.updatedAt||d?.date||'';
    if(!raw)return '';
    const dt=new Date(raw);if(Number.isNaN(dt.getTime()))return '';
    return dt.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function hasSaleDraft(d){return !!(d&&d._manualDraft&&((d.items||[]).length||String(d.customerName||'').trim()));}
  function hasLoanDraft(d){return !!(d&&((d.items||[]).length||String(d.person||'').trim()));}

  function syncVisibleVersion(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 交互提速版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
  }

  function enhanceDashboard462(){
    if(window.appState?.route!=='dashboard')return;
    const home=document.querySelector('.v44-home');if(!home)return;
    syncVisibleVersion();

    // 1. 有草稿才出现“继续操作”，没有草稿不占首页空间。
    document.getElementById('v462DraftResume')?.remove();
    const sale=safeLoad('mocui_sale_manual_draft_v455');
    const loan=safeLoad('mocui_loan_draft_v1');
    const rows=[];
    if(hasSaleDraft(sale))rows.push({kind:'sale',label:'继续销售草稿',meta:`已选 ${(sale.items||[]).length} 种 / ${draftQty(sale)} 件${draftTime(sale)?` · ${draftTime(sale)}`:''}`,data:sale});
    if(hasLoanDraft(loan))rows.push({kind:'loan',label:'继续调借草稿',meta:`${loan.person?`${loan.person} · `:''}已选 ${(loan.items||[]).length} 种 / ${draftQty(loan)} 件${draftTime(loan)?` · ${draftTime(loan)}`:''}`,data:loan});
    if(rows.length){
      const section=document.createElement('section');section.id='v462DraftResume';section.className='v462-draft-section';
      section.innerHTML=`<div class="v462-draft-title"><strong>继续上次操作</strong><span>点一下直接回来</span></div><div class="v462-draft-list">${rows.map((r,i)=>`<button type="button" class="v462-draft-card" data-v462-draft="${r.kind}" data-index="${i}"><span class="v462-draft-icon">${r.kind==='sale'?'售':'调'}</span><span class="v462-draft-copy"><strong>${r.label}</strong><small>${r.meta}</small></span><span class="v462-draft-arrow">›</span></button>`).join('')}</div>`;
      const attention=home.querySelector('.v44-attention'),actions=home.querySelector('.v446-actions-section');
      home.insertBefore(section,attention||actions||home.firstChild);
      section.querySelectorAll('[data-v462-draft]').forEach(btn=>btn.onclick=()=>{
        const r=rows[Number(btn.dataset.index)||0];if(!r)return;
        if(r.kind==='sale'){
          if(window.appState)window.appState.saleDraft=r.data;
          if(typeof window.navigate==='function')window.navigate('sale-new');
        }else{
          if(window.appState)window.appState.loanDraft=r.data;
          if(typeof window.openLoanForm==='function')window.openLoanForm();
        }
      });
    }

    // 2. 首页只突出四个高频入口；低频操作保留，但降级为轻量按钮。
    const actions=home.querySelector('.v446-actions');
    if(actions){
      actions.classList.add('v462-main-actions');
      let products=document.getElementById('v462Products');
      if(!products){
        products=document.createElement('button');products.id='v462Products';products.type='button';
        products.innerHTML='<i class="v446-icon action-icon" aria-hidden="true">库</i><span><strong>商品管理</strong><small>搜索 · 修改 · 查历史</small></span><b>›</b>';
        products.onclick=()=>window.navigate?.('products');
      }
      const loanBtn=document.getElementById('v44Loan');
      if(loanBtn&&loanBtn.nextSibling)actions.insertBefore(products,loanBtn.nextSibling);else actions.appendChild(products);

      const lowIds=['v44Pass','v44Content','v44Stocktake'];
      const lows=lowIds.map(id=>document.getElementById(id)).filter(Boolean);
      if(lows.length){
        let wrap=document.getElementById('v462SecondaryWrap');
        if(!wrap){
          wrap=document.createElement('div');wrap.id='v462SecondaryWrap';wrap.className='v462-secondary-wrap';
          wrap.innerHTML='<div class="v462-secondary-label">其他操作</div><div class="v462-secondary-actions"></div>';
          actions.parentElement?.appendChild(wrap);
        }
        const box=wrap.querySelector('.v462-secondary-actions');lows.forEach(b=>box.appendChild(b));
      }
    }
  }

  function editableFields(form){
    return [...form.querySelectorAll('input,select,textarea,[contenteditable="true"]')].filter(el=>{
      if(el.disabled||el.readOnly)return false;
      const type=String(el.type||'').toLowerCase();
      if(['hidden','file','checkbox','radio','button','submit','reset'].includes(type))return false;
      const r=el.getBoundingClientRect();return r.width>0&&r.height>0;
    });
  }
  function updateEnterHints(form){
    const list=editableFields(form).filter(el=>!el.matches('textarea,[contenteditable="true"],input[type="search"]'));
    list.forEach((el,i)=>{try{el.enterKeyHint=i===list.length-1?'done':'next';}catch{}});
  }
  function ensureFocusVisible(el){
    if(!el||!window.visualViewport)return;
    setTimeout(()=>{
      if(document.activeElement!==el)return;
      const r=el.getBoundingClientRect(),limit=window.visualViewport.height-92;
      if(r.bottom>limit||r.top<70)el.scrollIntoView({block:'center',behavior:'smooth'});
    },220);
  }
  function installKeyboardFlow(){
    if(document.documentElement.dataset.v462Keyboard==='1')return;
    document.documentElement.dataset.v462Keyboard='1';
    document.addEventListener('focusin',e=>{
      const el=e.target;if(!el?.matches?.('input,select,textarea,[contenteditable="true"]'))return;
      document.body.classList.add('v462-field-focused');
      const form=el.closest('form');if(form)updateEnterHints(form);
      ensureFocusVisible(el);
    });
    document.addEventListener('focusout',()=>setTimeout(()=>{if(!document.activeElement?.matches?.('input,select,textarea,[contenteditable="true"]'))document.body.classList.remove('v462-field-focused');},80));
    document.addEventListener('keydown',e=>{
      if(e.key!=='Enter'||e.shiftKey||e.isComposing)return;
      const el=e.target;if(!el?.matches?.('input,select,[contenteditable="true"]')||el.matches('input[type="search"]'))return;
      const form=el.closest('form');if(!form)return;
      const list=editableFields(form).filter(x=>!x.matches('textarea,[contenteditable="true"]'));
      const idx=list.indexOf(el),next=idx>=0?list[idx+1]:null;
      if(next){e.preventDefault();next.focus();ensureFocusVisible(next);}
    },true);
  }

  function wrapRender(name,after){return addAfterHook471(name,'v462',after,{awaitAfter:false});}

  function installInteraction462(){
    if(window.__mocuiInteraction462)return true;
    if(typeof window.renderDashboard!=='function'||typeof window.navigate!=='function')return false;
    window.__mocuiInteraction462=true;
    installInteractionStyles();installKeyboardFlow();
    wrapRender('renderDashboard',enhanceDashboard462);
    ['renderProducts','renderLoans','renderReports','renderMore','renderSaleNew','renderPassDealNew','renderLoanFormModal'].forEach(name=>wrapRender(name,syncVisibleVersion));
    const baseProduct=window.openProductForm;
    if(typeof baseProduct==='function'&&!baseProduct.__v462Wrapped){
      const wrapped=async function(){const r=await baseProduct.apply(this,arguments);setTimeout(()=>{const f=document.querySelector('#modalRoot form');if(f)updateEnterHints(f);},0);return r;};
      Object.defineProperty(wrapped,'__v462Wrapped',{value:true});window.openProductForm=wrapped;try{globalThis.openProductForm=wrapped;}catch{}
    }
    if(window.appState?.route==='dashboard')enhanceDashboard462();
    syncVisibleVersion();
    return true;
  }
  function waitInteraction(){
    let attempts=0;
    const tick=()=>{attempts++;if(installInteraction462()||attempts>80)return;setTimeout(tick,50);};
    setTimeout(tick,0);
  }

  // ===== v4.6.3 高频流程提速：销售 / 调借 =====
  function installWorkflow463Styles(){
    if(document.getElementById('mocuiWorkflow463Styles'))return;
    const style=document.createElement('style');
    style.id='mocuiWorkflow463Styles';
    style.textContent=`
      .v463-optional-toggle{width:100%;appearance:none;border:1px solid #e1e8e4;background:#fff;border-radius:14px;min-height:45px;padding:9px 12px;margin:8px 0;color:#53615a;font-size:12px;font-weight:760;display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left}
      .v463-optional-toggle strong{color:#24342d;font-size:13px}.v463-optional-toggle span:last-child{font-size:18px;color:#8a9791;font-weight:450;transition:transform .15s ease}.v463-optional-toggle.is-open span:last-child{transform:rotate(90deg)}
      .v463-sale-dock{position:fixed;z-index:88;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));min-height:60px;border:1px solid rgba(214,226,220,.94);border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 10px 28px rgba(28,54,42,.14);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:7px;display:grid;grid-template-columns:minmax(0,1fr) minmax(132px,42%);gap:8px;align-items:center}
      .v463-sale-summary{min-width:0;padding:3px 5px;display:flex;flex-direction:column;gap:1px}.v463-sale-summary small{font-size:10px;color:#78867f}.v463-sale-summary strong{font-size:16px;color:#17221e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v463-sale-summary em{font-style:normal;font-size:10px;color:#66766e}
      .v463-sale-confirm{min-height:46px!important;border:0!important;border-radius:13px!important;background:#177355!important;color:#fff!important;font-size:14px!important;font-weight:820!important;box-shadow:none!important}.v463-sale-confirm:disabled{opacity:.45!important}
      body.v463-sale-active #main{padding-bottom:150px!important}body.v462-field-focused .v463-sale-dock{display:none!important}
      .v463-loan-quick{margin:8px 0 2px!important;min-height:48px!important;border-radius:14px!important;background:#eef8f3!important;border-color:#cfe5d9!important;color:#176b50!important;font-weight:820!important}
      .v463-optional-card{margin-top:8px!important}
      @media(max-width:380px){.v463-sale-dock{left:8px;right:8px;grid-template-columns:minmax(0,1fr) 130px}.v463-sale-summary strong{font-size:14px}}
    `;
    document.head.appendChild(style);
  }

  function saleTotals463(d){
    const items=d?.items||[];
    const subtotal=items.reduce((sum,i)=>sum+Number(i?.qty||0)*Number(i?.price||0),0);
    let discount=0,raw=Number(d?.discountValue||0);
    if(d?.discountType==='amount'||d?.discountType==='round')discount=Math.max(0,raw);
    if(d?.discountType==='percent')discount=subtotal*Math.min(100,Math.max(0,raw))/100;
    discount=Math.min(subtotal,discount);
    return {qty:items.reduce((s,i)=>s+Number(i?.qty||0),0),kinds:items.length,subtotal,finalAmount:Math.max(0,subtotal-discount)};
  }
  function money463(v){try{return typeof window.fmtMoney==='function'?window.fmtMoney(Number(v||0)):`¥${Number(v||0).toFixed(2)}`;}catch{return `¥${Number(v||0).toFixed(2)}`;}}

  function makeOptionalToggle463({id,label,meta,target,open=false}){
    if(!target||document.getElementById(id))return null;
    const btn=document.createElement('button');btn.id=id;btn.type='button';btn.className='v463-optional-toggle';
    btn.innerHTML=`<span><strong>${label}</strong>${meta?` · ${meta}`:''}</span><span>›</span>`;
    const apply=value=>{target.hidden=!value;btn.classList.toggle('is-open',value);btn.setAttribute('aria-expanded',String(value));};
    btn.onclick=()=>apply(target.hidden);target.parentNode.insertBefore(btn,target);apply(open);return btn;
  }

  function updateSaleDock463(){
    const dock=document.getElementById('v463SaleDock'),d=window.appState?.saleDraft;if(!dock||!d)return;
    // 先把当前输入同步到草稿，保证浮条金额和数量与屏幕一致。
    try{if(typeof window.syncSaleFormToDraft==='function')window.syncSaleFormToDraft();else if(typeof globalThis.syncSaleFormToDraft==='function')globalThis.syncSaleFormToDraft();}catch{}
    const t=saleTotals463(d),summary=dock.querySelector('.v463-sale-summary');
    if(summary)summary.innerHTML=`<small>本单 ${t.kinds} 种 / ${t.qty} 件</small><strong>${money463(t.finalAmount)}</strong><em>${d.customerName?d.customerName:'散客'} · 点右侧直接完成</em>`;
    const confirm=dock.querySelector('.v463-sale-confirm');if(confirm)confirm.disabled=!d.items?.length;
  }

  function enhanceSale463(){
    if(window.appState?.route!=='sale-new')return;
    installWorkflow463Styles();document.body.classList.add('v463-sale-active');
    const d=window.appState?.saleDraft;if(!d)return;

    // 高频路径：从首页“销售开单”进入的新单，直接打开商品+数量选择，省掉一次点击。
    if(sessionStorage.getItem('mocui_v463_sale_autopick')==='1'&&!d.items?.length&&!document.getElementById('v455TradePicker')){
      sessionStorage.removeItem('mocui_v463_sale_autopick');
      setTimeout(()=>document.getElementById('chooseProducts')?.click(),80);
    }

    // 配饰/额外成本属于低频项：没有历史填写值时默认收起。
    const accessoryField=document.getElementById('chooseAccessories');
    const accessoryCard=accessoryField?.closest('.card');
    if(accessoryCard&&!accessoryCard.dataset.v463Optional){
      accessoryCard.dataset.v463Optional='1';
      const used=(d.accessoryUsages||[]).length||Number(d.directAccessoryCost||0)>0||Number(d.otherDirectCost||0)>0;
      makeOptionalToggle463({id:'v463AccessoryToggle',label:'配饰与其他成本',meta:'可选',target:accessoryCard,open:!!used});
    }

    // 优惠和备注默认收起，只保留“实收 + 应收 + 确认”在主流程。
    const discount=document.getElementById('discountType');
    const discountRow=discount?.closest('.form-row');
    const note=document.getElementById('saleNote')?.closest('.form-group');
    if(discountRow&&!document.getElementById('v463SaleExtraToggle')){
      const host=discountRow.parentElement;
      const wrap=document.createElement('div');wrap.id='v463SaleExtraFields';
      host.insertBefore(wrap,discountRow);wrap.appendChild(discountRow);if(note)wrap.appendChild(note);
      const used=(d.discountType&&d.discountType!=='none')||Number(d.discountValue||0)>0||String(d.note||'').trim();
      makeOptionalToggle463({id:'v463SaleExtraToggle',label:'优惠 / 备注',meta:'可选',target:wrap,open:!!used});
    }

    // 无论页面滑到哪里，底部都能看到本单金额并一键确认。
    let dock=document.getElementById('v463SaleDock');
    if(!dock){
      dock=document.createElement('div');dock.id='v463SaleDock';dock.className='v463-sale-dock';
      dock.innerHTML='<div class="v463-sale-summary"></div><button type="button" class="v463-sale-confirm">确认销售</button>';
      document.body.appendChild(dock);
      dock.querySelector('.v463-sale-confirm').onclick=()=>document.getElementById('saveSale')?.click();
      const main=document.getElementById('main');
      ['input','change'].forEach(type=>main?.addEventListener(type,e=>{if(e.target?.closest?.('#main'))setTimeout(updateSaleDock463,0);},{passive:true}));
    }
    updateSaleDock463();
  }

  function clearSale463(){document.body.classList.remove('v463-sale-active');document.getElementById('v463SaleDock')?.remove();}

  function enhanceLoan463(){
    installWorkflow463Styles();
    const form=document.getElementById('loanForm'),d=window.appState?.loanDraft;if(!form||!d)return;
    const person=document.getElementById('loanPerson'),outstanding=document.getElementById('loanPersonOutstanding'),choose=document.getElementById('loanChooseProducts');

    // 商品选择是主流程，提前到“基本信息”之后；图片/备注移到后面并默认收起。
    const productCard=choose?.closest('.loan-step-card'),optionalCard=document.getElementById('loanImages')?.closest('.loan-step-card');
    if(productCard&&optionalCard&&productCard.compareDocumentPosition(optionalCard)&Node.DOCUMENT_POSITION_PRECEDING){
      optionalCard.parentNode.insertBefore(productCard,optionalCard);
    }
    if(productCard){const n=productCard.querySelector('.loan-step-title span');if(n)n.textContent='2';}
    if(optionalCard&&!optionalCard.dataset.v463Optional){
      optionalCard.dataset.v463Optional='1';optionalCard.classList.add('v463-optional-card');
      const title=optionalCard.querySelector('.loan-step-title');if(title)title.innerHTML='<span>3</span> 图片与文字备注（可选）';
      const used=(d.images||[]).length||String(d.note||'').trim();
      makeOptionalToggle463({id:'v463LoanOptionalToggle',label:'图片 / 文字备注',meta:'可选',target:optionalCard,open:!!used});
    }

    // 姓名下面直接给下一步入口，避免再往下找“选择商品”。
    if(outstanding&&choose&&!document.getElementById('v463LoanQuickChoose')){
      const quick=document.createElement('button');quick.id='v463LoanQuickChoose';quick.type='button';quick.className='btn secondary block v463-loan-quick';quick.textContent=d.items?.length?'修改商品与数量':'下一步 · 选择商品与数量';
      outstanding.insertAdjacentElement('afterend',quick);quick.onclick=()=>choose.click();
    }
    // 新调借打开后把操作起点放在“调借人”。
    if(person&&!String(person.value||'').trim())setTimeout(()=>{try{person.focus({preventScroll:true});person.scrollIntoView({block:'center'});}catch{}},120);
  }

  function enhanceDashboard463(){
    if(window.appState?.route!=='dashboard')return;clearSale463();
    const sale=document.getElementById('v44Sale');if(sale&&sale.dataset.v463Fast!=='1'){
      sale.dataset.v463Fast='1';const base=sale.onclick;
      sale.onclick=function(e){sessionStorage.setItem('mocui_v463_sale_autopick','1');return base?.call(this,e);};
    }
    syncVisibleVersion();
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 高频流程提速版`;
  }

  function wrap463(name,after){return addAfterHook471(name,'v463',after,{awaitAfter:false});}
  function installWorkflow463(){
    if(window.__mocuiWorkflow463)return true;
    if(typeof window.renderSaleNew!=='function'||typeof window.renderLoanFormModal!=='function'||typeof window.renderDashboard!=='function')return false;
    window.__mocuiWorkflow463=true;installWorkflow463Styles();
    wrap463('renderSaleNew',enhanceSale463);wrap463('renderLoanFormModal',enhanceLoan463);wrap463('renderDashboard',enhanceDashboard463);
    ['renderProducts','renderLoans','renderSales','renderReports','renderMore','renderPassDealNew'].forEach(name=>wrap463(name,()=>{clearSale463();syncVisibleVersion();}));
    if(window.appState?.route==='sale-new')enhanceSale463();else if(document.getElementById('loanForm'))enhanceLoan463();else if(window.appState?.route==='dashboard')enhanceDashboard463();
    syncVisibleVersion();return true;
  }
  function waitWorkflow463(){let attempts=0;const tick=()=>{attempts++;if(installWorkflow463()||attempts>100)return;setTimeout(tick,50);};setTimeout(tick,60);}

  // ===== v4.6.4 找货 / 搜索提速 =====
  const RECENT_PRODUCTS_464='mocui_recent_product_ids_v464';
  let productSearchIndex464={byCode:new Map(),byName:new Map()};
  function updateProductSearchIndex464(rows=[]){
    const byCode=new Map(),byName=new Map();
    for(const p of rows||[]){
      const code=codeCanon464(p?.code),raw=compact464(p?.code),name=compact464(p?.name);
      if(code)byCode.set(code,p);if(raw)byCode.set(raw,p);if(name&&!byName.has(name))byName.set(name,p);
    }
    productSearchIndex464={byCode,byName};
  }
  function enrichSearchFields464(fields=[]){
    const flat=fields.flat(Infinity).filter(v=>v!==undefined&&v!==null).map(v=>String(v)),extra=[];
    let product=null;
    for(const v of flat){
      const c=codeCanon464(v),raw=compact464(v);
      product=productSearchIndex464.byCode.get(c)||productSearchIndex464.byCode.get(raw)||null;
      if(product)break;
    }
    if(!product){
      for(const v of flat){const name=compact464(v);product=productSearchIndex464.byName.get(name)||null;if(product)break;}
    }
    if(product)extra.push(product.category,product.note,product.qinsilk?.size,product.size,product.spec,product.ringSize);
    return [...flat,...extra.filter(v=>v!==undefined&&v!==null).map(v=>String(v))];
  }
  function norm464(value){
    let s=String(value??'');
    try{s=s.normalize('NFKC');}catch{}
    return s.toLowerCase().replace(/[，。；、·_—–/\\|()（）\[\]【】{}<>《》:：;；,+＋]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function compact464(value){return norm464(value).replace(/\s+/g,'');}
  function tokens464(value){
    const s=norm464(value);if(!s)return [];
    const chunks=s.split(/\s+/).filter(Boolean),out=[];
    for(const chunk of chunks){
      const parts=chunk.match(/[a-z]+|\d+(?:\.\d+)?|[\u3400-\u9fff]+|[^a-z0-9\u3400-\u9fff]+/g)||[chunk];
      for(const p of parts){const v=compact464(p);if(v)out.push(v);}
    }
    return out;
  }
  function codeCanon464(value){
    const raw=compact464(value).replace(/[^a-z0-9]/g,'');
    const m=raw.match(/^([a-z]+)0*(\d+)$/);
    if(m)return `${m[1]}${String(Number(m[2]))}`;
    return raw.replace(/^0+(?=\d)/,'');
  }
  function smartMatch464(query,...fields){
    const qc=compact464(query);if(!qc)return true;
    const flat=enrichSearchFields464(fields),fieldText=flat.map(compact464).filter(Boolean);
    const ts=tokens464(query);
    // 每个关键词必须真实存在于某一个字段，禁止跨字段边界拼出不存在的词。
    if(ts.length&&ts.every(t=>fieldText.some(h=>h.includes(t))))return true;
    const qcode=codeCanon464(query);
    if(qcode.length>=2&&flat.some(v=>{const c=codeCanon464(v);return c&&c.includes(qcode);} ))return true;
    if(qc.length===1)return fieldText.some(h=>h.includes(qc));
    return false;
  }
  function productRank464(p,query){
    const q=compact464(query);if(!q)return 100;
    const qcode=codeCanon464(query),code=compact464(p?.code),ccode=codeCanon464(p?.code),name=compact464(p?.name),color=compact464(p?.color),category=compact464(p?.category),note=compact464(p?.note);
    if(code===q||ccode===qcode)return 0;
    if((q&&code.endsWith(q))||(qcode&&ccode.endsWith(qcode)))return 5;
    if(name===q)return 10;
    if(name.startsWith(q))return 20;
    if(name.includes(q))return 30;
    if(color.includes(q))return 40;
    if(category.includes(q))return 50;
    if(note.includes(q))return 60;
    const hay=compact464([p?.name,p?.code,p?.color,p?.category,p?.note].join(' '));
    const ts=tokens464(query);if(ts.length&&ts.every(t=>hay.includes(t)))return 70;
    return 90;
  }
  function loadRecent464(){try{const a=JSON.parse(localStorage.getItem(RECENT_PRODUCTS_464)||'[]');return Array.isArray(a)?a.map(String).slice(0,24):[];}catch{return [];}}
  function rememberRecent464(ids){
    try{
      const incoming=(Array.isArray(ids)?ids:[ids]).filter(Boolean).map(String),old=loadRecent464();
      const next=[...incoming,...old.filter(x=>!incoming.includes(x))].slice(0,24);
      localStorage.setItem(RECENT_PRODUCTS_464,JSON.stringify(next));
    }catch{}
  }
  function installSmartMatcher464(){
    try{window.mocuiFuzzyMatch=smartMatch464;globalThis.mocuiFuzzyMatch=smartMatch464;}catch{}
    try{if(window.MocuiCoreV4?.search)window.MocuiCoreV4.search.match=smartMatch464;}catch{}
  }
  // v4.7.9: 统一搜索共享商品映射，降低重复全库读取；商品变更后立即失效。
  let productMapCache464=null,productMapPromise464=null,productMapTime464=0;
  window.addEventListener('mocui-product-index-changed',()=>{productMapCache464=null;productMapTime464=0;});
  async function productMap464(){
    if(productMapCache464&&Date.now()-productMapTime464<20000)return productMapCache464;
    if(productMapPromise464)return productMapPromise464;
    productMapPromise464=(async()=>{
      try{
        const rows=await window.dbAll?.('products');updateProductSearchIndex464(rows||[]);
        productMapCache464=new Map((rows||[]).map(p=>[String(p.id),p]));productMapTime464=Date.now();
        return productMapCache464;
      }catch{return new Map();}
    })().finally(()=>{productMapPromise464=null;});
    return productMapPromise464;
  }
  async function reorderProductList464(){
    const input=document.getElementById('productSearch'),list=document.getElementById('productList');if(!input||!list)return;
    const query=input.value.trim();if(!query)return;
    const map=await productMap464(),nodes=[...list.querySelectorAll('[data-product-id]')];
    nodes.sort((a,b)=>{
      const pa=map.get(String(a.dataset.productId)),pb=map.get(String(b.dataset.productId));
      const ra=productRank464(pa,query),rb=productRank464(pb,query);return ra-rb;
    }).forEach(n=>list.appendChild(n));
  }
  function enhanceProducts464(){
    const input=document.getElementById('productSearch');if(!input)return;
    const stock=document.getElementById('stockFilter');
    input.placeholder='名称 / 货号尾号 / 颜色 / 分类 / 备注';input.setAttribute('enterkeyhint','search');
    if(input.dataset.v474StockBridge!=='1'){
      input.dataset.v474StockBridge='1';let internal=false,autoAll=false,userStock=false;
      if(stock){
        stock.addEventListener('change',()=>{if(!internal){userStock=true;autoAll=false;}});
      }
      const bridgeStock=()=>{
        if(!stock||userStock)return;
        const q=input.value.trim();
        if(q&&stock.value==='in'){
          internal=true;stock.value='';stock.dispatchEvent(new Event('change',{bubbles:true}));internal=false;autoAll=true;
        }else if(!q&&autoAll&&stock.value===''){
          internal=true;stock.value='in';stock.dispatchEvent(new Event('change',{bubbles:true}));internal=false;autoAll=false;
        }
      };
      input.addEventListener('input',bridgeStock);input.addEventListener('search',bridgeStock);input.addEventListener('compositionend',bridgeStock);
      setTimeout(bridgeStock,0);
    }
    if(input.dataset.v464Smart==='1'){setTimeout(reorderProductList464,220);return;}
    input.dataset.v464Smart='1';let timer=null;
    const queue=()=>{clearTimeout(timer);timer=setTimeout(()=>{reorderProductList464().catch(()=>{});},110);};
    input.addEventListener('input',queue);input.addEventListener('search',queue);input.addEventListener('compositionend',queue);
    stock?.addEventListener('change',queue);
    listRecentProductClicks464();queue();
  }
  function listRecentProductClicks464(){
    if(document.documentElement.dataset.v464RecentClicks==='1')return;
    document.documentElement.dataset.v464RecentClicks='1';
    document.addEventListener('click',e=>{
      const row=e.target?.closest?.('[data-product-id]');if(row?.dataset?.productId)rememberRecent464(row.dataset.productId);
      if(e.target?.closest?.('#v455PickerConfirm')){
        const ids=[...document.querySelectorAll('#v455PickerList .v455-picker-row.is-selected')].map(x=>x.dataset.id).filter(Boolean);
        if(ids.length)rememberRecent464(ids);
      }
      if(e.target?.closest?.('#v446HeaderSearch,#v44PageSearch,.v44-page-mic'))setTimeout(enhanceGlobal464,60);
      if(e.target?.closest?.('#chooseProducts,#loanChooseProducts,#v463LoanQuickChoose'))setTimeout(enhancePicker464,80);
    },false);
  }
  async function enhancePicker464(){
    // v4.7.7：选货页保留原始位置，不因选中/最近使用/库存而重排。
    const root=document.getElementById('v455TradePicker');
    const input=root?.querySelector('#v455PickerSearch');
    if(!root||!input)return;
    input.placeholder='名称 / 货号尾号 / 颜色 / 分类 / 备注';
    input.setAttribute('enterkeyhint','search');
    if(input.dataset.v477Stable==='1')return;
    input.dataset.v477Stable='1';
    const confirm=root.querySelector('#v455PickerConfirm');
    confirm?.addEventListener('click',()=>{
      const ids=[...root.querySelectorAll('.v455-picker-row.is-selected')].map(el=>el.dataset.id).filter(Boolean);
      if(ids.length)rememberRecent464(ids);
    },true);
  }
  function globalRank464(btn,query){
    const kind=btn.dataset.kind||'',text=compact464(btn.textContent),q=compact464(query);let score=kind==='product'?0:kind==='loan'?20:kind==='sale'?25:35;
    if(!q)return score;
    const idx=text.indexOf(q);if(idx===0)score-=12;else if(idx>0)score+=Math.min(18,idx);else score+=30;
    return score;
  }
  function enhanceGlobal464(){
    const input=document.getElementById('v44GlobalQuery'),host=document.getElementById('v44GlobalResults');if(!input||!host)return;
    input.placeholder='货号尾号、名称、颜色、同行、备注…';
    const help=document.querySelector('.v44-search-help');if(help)help.textContent='支持货号尾号；同时搜索商品、已售记录、调借、同行货、过手单和货源库';
    const reorder=()=>setTimeout(()=>{
      const q=input.value.trim(),nodes=[...host.querySelectorAll('.v44-search-result')];
      nodes.sort((a,b)=>globalRank464(a,q)-globalRank464(b,q)).forEach(n=>host.appendChild(n));
    },20);
    if(input.dataset.v464Smart!=='1'){input.dataset.v464Smart='1';input.addEventListener('input',reorder);input.addEventListener('compositionend',reorder);input.addEventListener('search',reorder);}
    reorder();
  }
  function syncSearchVersion464(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 找货提速版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
  }
  function wrap464(name,after){return addAfterHook471(name,'v464',after,{awaitAfter:false});}
  function installSearch464(){
    if(window.__mocuiSearch464)return true;
    if(typeof window.renderProducts!=='function'||typeof window.renderDashboard!=='function')return false;
    window.__mocuiSearch464=true;installSmartMatcher464();listRecentProductClicks464();productMap464().catch(()=>{});
    wrap464('renderProducts',()=>{enhanceProducts464();syncSearchVersion464();});
    ['renderDashboard','renderSaleNew','renderLoanFormModal','renderLoans','renderSales','renderReports','renderMore'].forEach(name=>wrap464(name,()=>{syncSearchVersion464();setTimeout(()=>{enhanceGlobal464();enhancePicker464();},40);}));
    document.addEventListener('focusin',e=>{if(e.target?.id==='v44GlobalQuery')enhanceGlobal464();if(e.target?.id==='v455PickerSearch')enhancePicker464();});
    if(window.appState?.route==='products')enhanceProducts464();setTimeout(()=>{enhanceGlobal464();enhancePicker464();},60);syncSearchVersion464();return true;
  }
  function waitSearch464(){let attempts=0;const tick=()=>{attempts++;if(installSearch464()||attempts>110)return;setTimeout(tick,50);};setTimeout(tick,100);}

  // ===== v4.6.5 商品卡片 + 一键操作 =====
  function installProductCards465Styles(){
    if(document.getElementById('mocuiProductCards465Styles'))return;
    const style=document.createElement('style');style.id='mocuiProductCards465Styles';
    style.textContent=`
      #productList .v465-product-card{display:grid!important;grid-template-columns:58px minmax(0,1fr) auto!important;grid-template-rows:auto auto!important;gap:4px 10px!important;align-items:center!important;padding:10px!important;border-radius:16px!important;min-height:78px!important}
      #productList .v465-product-card>.thumb{grid-column:1!important;grid-row:1 / span 2!important;width:58px!important;height:58px!important;min-width:58px!important;border-radius:13px!important;object-fit:cover!important;align-self:center!important}
      #productList .v465-product-card>.item-main{grid-column:2!important;grid-row:1!important;min-width:0!important;align-self:center!important}
      #productList .v465-product-card>.item-right{grid-column:3!important;grid-row:1!important;align-self:center!important;text-align:right!important;min-width:66px!important}
      .v465-product-name{font-size:14px!important;line-height:1.25!important;font-weight:820!important;color:#17221e!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .v465-product-meta{margin-top:3px;font-size:10.5px;line-height:1.35;color:#718078;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .v465-product-price{margin-top:4px;font-size:13px;font-weight:800;color:#24342d}
      .v465-stock-badge{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:4px 8px;border-radius:999px;background:#eaf7f1;color:#177355;font-size:10.5px;font-weight:800;white-space:nowrap}
      .v465-stock-badge.low{background:#fff4df;color:#a35d00}.v465-stock-badge.out{background:#f3f4f4;color:#8b9590}
      .v465-product-actions{grid-column:2 / 4;grid-row:2;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:4px}
      .v465-product-actions button{appearance:none;border:1px solid #dfe7e3;background:#fff;border-radius:10px;min-height:36px;padding:6px 8px;color:#42534b;font-size:11px;font-weight:780;box-shadow:none!important}
      .v465-product-actions button[data-v465-action="sale"]{background:#eef8f3;border-color:#cfe5d9;color:#176b50}
      .v465-product-actions button:disabled{opacity:.38!important;background:#f5f6f6!important;color:#929b97!important;border-color:#e7eae9!important}
      #productList .v465-product-card.has-actions{grid-template-rows:auto auto!important;padding-bottom:9px!important}
      #productList .v465-product-card:not(.has-actions)>.item-main{grid-row:1 / span 2!important}
      #productList .v465-product-card:not(.has-actions)>.item-right{grid-row:1 / span 2!important}
      @media(max-width:380px){#productList .v465-product-card{grid-template-columns:52px minmax(0,1fr) auto!important;gap:4px 8px!important}#productList .v465-product-card>.thumb{width:52px!important;height:52px!important;min-width:52px!important}.v465-product-actions button{font-size:10.5px;padding:5px}}
    `;
    document.head.appendChild(style);
  }
  function esc465(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function money465(v){
    const n=Number(v||0);try{return new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:0,maximumFractionDigits:2}).format(n);}catch{return `¥${n.toFixed(0)}`;}
  }
  function bestImage465(p){
    const first=Array.isArray(p?.images)?p.images.find(Boolean):'';return first||p?.image||p?.cover||p?.thumbnail||p?.thumb||'';
  }
  function localDateTime465(date=new Date()){
    const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function localDate465(date=new Date()){
    const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
  }
  function persistSaleDraft465(d){
    try{localStorage.setItem('mocui_sale_manual_draft_v455',JSON.stringify({...d,items:(d.items||[]).map(i=>({...i,image:''})),_manualDraft:true,_manualDraftSavedAt:new Date().toISOString()}));}catch{}
  }
  function persistLoanDraft465(d){
    try{localStorage.setItem('mocui_loan_draft_v1',JSON.stringify({...d,images:[],items:(d.items||[]).map(i=>({...i,image:''})),_manualDraft:true,_manualDraftSavedAt:new Date().toISOString()}));}catch{}
  }
  function quickSale465(p){
    if(Number(p?.stock||0)<=0){notify('这件商品当前库存为 0，可先编辑或盘点补库存');return;}
    let d=window.appState?.saleDraft;
    if(!d){const saved=safeLoad('mocui_sale_manual_draft_v455');if(saved?._manualDraft)d=saved;}
    if(!d)d={customerId:'',customerName:'',createdAt:localDateTime465(),items:[],accessoryUsages:[],directAccessoryCost:0,otherDirectCost:0,discountType:'none',discountValue:0,received:'',note:''};
    d.items=Array.isArray(d.items)?d.items:[];
    const existing=d.items.find(i=>String(i.productId)===String(p.id));
    if(existing){existing.stock=Number(p.stock||0);existing.productName=p.name;existing.productCode=p.code;existing.color=p.color;existing.costPrice=Number(p.costPrice||0);if(!Number.isFinite(Number(existing.price)))existing.price=Number(p.salePrice||0);}
    else d.items.unshift({productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty:1,price:Number(p.salePrice||0),costPrice:Number(p.costPrice||0),image:bestImage465(p),stock:Number(p.stock||0),productNote:p.note||'',itemNote:''});
    if(window.appState)window.appState.saleDraft=d;persistSaleDraft465(d);rememberRecent464(p.id);sessionStorage.removeItem('mocui_v463_sale_autopick');window.navigate?.('sale-new');
  }
  function quickLoan465(p){
    if(Number(p?.stock||0)<=0){notify('这件商品当前库存为 0，不能直接借出');return;}
    const current=window.appState?.loanDraft||safeLoad('mocui_loan_draft_v1');
    if(current&&hasLoanDraft(current)){
      if(window.appState)window.appState.loanDraft=current;
      notify('已有调借草稿，已先打开草稿，避免覆盖未完成内容');
      window.openLoanForm?.();return;
    }
    const now=new Date(),due=new Date(now);due.setDate(due.getDate()+30);
    const d={type:'lend',person:'',date:localDateTime465(now),expectedReturnDate:localDate465(due),note:'',images:[],items:[{productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty:1,stock:Number(p.stock||0),image:bestImage465(p),productNote:p.note||'',costPrice:Number(p.costPrice||0),salePrice:Number(p.salePrice||0)}]};
    if(window.appState)window.appState.loanDraft=d;persistLoanDraft465(d);rememberRecent464(p.id);window.openLoanForm?.();
  }
  async function quickEdit465(p){
    rememberRecent464(p.id);if(typeof window.openProductForm==='function')await window.openProductForm(p);else window.navigate?.('product-detail',{id:p.id});
  }
  async function enhanceProductCards465(){
    if(window.appState?.route!=='products')return;
    installProductCards465Styles();
    const list=document.getElementById('productList'),input=document.getElementById('productSearch');if(!list)return;
    const map=await productMap464(),rows=[...list.querySelectorAll('[data-product-id]')],query=String(input?.value||'').trim();
    const showActions=!!query||rows.length<=30;
    for(const row of rows){
      const p=map.get(String(row.dataset.productId));if(!p)continue;
      row.classList.add('v465-product-card');row.classList.toggle('has-actions',showActions);
      const main=row.querySelector('.item-main'),right=row.querySelector('.item-right');
      if(main){
        main.innerHTML=`<div class="v465-product-name">${esc465(p.name||'未命名商品')}</div><div class="v465-product-meta">${esc465(p.code||'无货号')} · ${esc465(p.color||'未填写颜色')}${p.category?` · ${esc465(p.category)}`:''}</div><div class="v465-product-price">售价 ${money465(p.salePrice)}</div>`;
      }
      const stock=Number(p.stock||0),stockClass=stock<=0?'out':stock<=1?'low':'';
      if(right)right.innerHTML=`<span class="v465-stock-badge ${stockClass}">${stock<=0?'无库存':`库存 ${stock}`}</span>`;
      let actions=row.querySelector('.v465-product-actions');
      if(showActions&&!actions){actions=document.createElement('div');actions.className='v465-product-actions';actions.innerHTML='<button type="button" data-v465-action="sale">销售</button><button type="button" data-v465-action="loan">借出</button><button type="button" data-v465-action="edit">编辑</button>';row.appendChild(actions);}
      if(!showActions&&actions){actions.remove();actions=null;}
      if(actions){
        const sale=actions.querySelector('[data-v465-action="sale"]'),loan=actions.querySelector('[data-v465-action="loan"]'),edit=actions.querySelector('[data-v465-action="edit"]');
        if(sale){sale.disabled=stock<=0;sale.onclick=e=>{e.preventDefault();e.stopPropagation();quickSale465(p);};}
        if(loan){loan.disabled=stock<=0;loan.onclick=e=>{e.preventDefault();e.stopPropagation();quickLoan465(p);};}
        if(edit)edit.onclick=e=>{e.preventDefault();e.stopPropagation();quickEdit465(p);};
      }
    }
  }
  function bindProductRefresh465(){
    if(document.documentElement.dataset.v465ProductRefresh==='1')return;
    document.documentElement.dataset.v465ProductRefresh='1';let timer=null;
    const queue=(delay=280)=>{clearTimeout(timer);timer=setTimeout(()=>enhanceProductCards465(),delay);};
    document.addEventListener('input',e=>{if(e.target?.id==='productSearch')queue(300);},true);
    document.addEventListener('compositionend',e=>{if(e.target?.id==='productSearch')queue(300);},true);
    document.addEventListener('change',e=>{if(e.target?.id==='stockFilter')queue(120);},true);
    document.addEventListener('click',e=>{if(e.target?.closest?.('#categoryPickerRows [data-category-id]'))queue(120);},true);
  }
  function syncProductVersion465(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 商品快捷操作版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
  }
  function wrap465(name,after){return addAfterHook471(name,'v465',after,{awaitAfter:false});}
  function installProductCards465(){
    if(window.__mocuiProductCards465)return true;
    if(typeof window.renderProducts!=='function')return false;
    window.__mocuiProductCards465=true;installProductCards465Styles();bindProductRefresh465();
    wrap465('renderProducts',()=>{enhanceProductCards465();syncProductVersion465();});
    ['renderDashboard','renderSaleNew','renderLoanFormModal','renderLoans','renderSales','renderReports','renderMore'].forEach(name=>wrap465(name,syncProductVersion465));
    if(window.appState?.route==='products')enhanceProductCards465();syncProductVersion465();return true;
  }
  function waitProductCards465(){let attempts=0;const tick=()=>{attempts++;if(installProductCards465()||attempts>120)return;setTimeout(tick,50);};setTimeout(tick,140);}

  // ===== v4.6.6 首页待办 + 最近操作 =====
  function installHomeFocus466Styles(){
    if(document.getElementById('mocuiHomeFocus466Styles'))return;
    const style=document.createElement('style');style.id='mocuiHomeFocus466Styles';
    style.textContent=`
      .v466-section{margin:10px 0 12px}.v466-head{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin:0 3px 7px}.v466-head strong{font-size:14px;color:#17221e}.v466-head span{font-size:10.5px;color:#87928d}
      .v466-task-list,.v466-recent-list{display:grid;gap:7px}.v466-task{appearance:none;width:100%;min-height:54px;border:1px solid #e2e8e5;background:#fff;border-radius:15px;padding:9px 11px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left;color:#24342d;box-shadow:none!important}
      .v466-task.danger{background:#fff7f6;border-color:#f2d2ce}.v466-task.warn{background:#fffbf2;border-color:#eeddb8}.v466-task.xhs{background:#faf7ff;border-color:#e7dcf5}
      .v466-task-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:12px;font-weight:850;background:#eef5f1;color:#176b50}.v466-task.danger .v466-task-icon{background:#fde8e6;color:#b42318}.v466-task.warn .v466-task-icon{background:#fff0cf;color:#9b6500}.v466-task.xhs .v466-task-icon{background:#eee5fa;color:#7658cb}
      .v466-task-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.v466-task-copy strong{font-size:13px;line-height:1.2}.v466-task-copy small{font-size:10.5px;color:#748179;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v466-task-count{font-size:12px;font-weight:820;color:#53615a;white-space:nowrap}
      .v466-recent{appearance:none;width:100%;border:1px solid #e6ebe8;background:#fff;border-radius:14px;min-height:52px;padding:9px 11px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:9px;align-items:center;text-align:left;color:#24342d;box-shadow:none!important}
      .v466-recent-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;background:#f1f5f3;color:#526159;font-size:11px;font-weight:850}.v466-recent-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.v466-recent-copy strong{font-size:12.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v466-recent-copy small{font-size:10px;color:#87928d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v466-recent-time{font-size:10px;color:#929d98;white-space:nowrap}
      .v466-empty-note{font-size:10.5px;color:#8b9691;margin:4px 3px 0}
      @media(max-width:380px){.v466-task{grid-template-columns:31px minmax(0,1fr) auto;padding:8px}.v466-task-icon{width:31px;height:31px}.v466-recent{grid-template-columns:30px minmax(0,1fr) auto;padding:8px}.v466-recent-icon{width:30px;height:30px}}
    `;
    document.head.appendChild(style);
  }
  function esc466(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function timeValue466(v){const d=new Date(v||0);return Number.isNaN(d.getTime())?0:d.getTime();}
  function relativeTime466(v){
    const t=timeValue466(v);if(!t)return '';
    const diff=Date.now()-t,min=Math.floor(diff/60000),d=new Date(t),now=new Date();
    if(min<1)return '刚刚';if(min<60)return `${min}分钟前`;
    const same=d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate();
    const hh=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;if(same)return hh;
    const y=new Date(now);y.setDate(now.getDate()-1);if(d.getFullYear()===y.getFullYear()&&d.getMonth()===y.getMonth()&&d.getDate()===y.getDate())return `昨天 ${hh}`;
    return `${d.getMonth()+1}/${d.getDate()}`;
  }
  function loanOpen466(l){try{if(typeof window.loanIsOpen==='function')return !!window.loanIsOpen(l);}catch{}return !['returned','completed','closed'].includes(String(l?.status||'active'));}
  function loanDue466(l){try{if(typeof window.loanDueDate==='function')return window.loanDueDate(l);}catch{}return l?.expectedReturnDate||l?.date||l?.createdAt||'';}
  function daysToDue466(l){const raw=loanDue466(l);if(!raw)return 9999;const due=new Date(String(raw).slice(0,10)+'T00:00:00'),now=new Date();now.setHours(0,0,0,0);if(Number.isNaN(due.getTime()))return 9999;return Math.ceil((due-now)/86400000);}
  function isXhsPending466(s){return s?.saleChannel==='xhs'&&s?.status==='active'&&['pending','returning'].includes(String(s?.xhsStatus||'pending'));}
  function xhsDue466(s){if(!isXhsPending466(s)||!s?.xhsConfirmDueDate)return 9999;const due=new Date(String(s.xhsConfirmDueDate).slice(0,10)+'T23:59:59'),today=new Date();today.setHours(0,0,0,0);if(Number.isNaN(due.getTime()))return 9999;return Math.ceil((due-today)/86400000);}
  function auditLabel466(action=''){
    const map={'sale.create':'销售开单','sale.cancel':'撤销销售','sale.restore':'恢复销售','loan.create':'新增调借','loan.return':'调借归还','loan.return.undo':'撤销归还','loan.return_undo':'撤销归还','product.create':'新增商品','product.update':'修改商品','product.copy':'复制商品'};
    if(map[action])return map[action];if(action.startsWith('stock.'))return '库存调整';if(action.startsWith('loan.'))return '调借操作';if(action.startsWith('sale.'))return '销售操作';if(action.startsWith('product.'))return '商品操作';return '最近操作';
  }
  function auditIcon466(type,action=''){if(type==='sale'||action.startsWith('sale.'))return '售';if(type==='loan'||action.startsWith('loan.'))return '调';if(type==='product'||action.startsWith('product.')||action.startsWith('stock.'))return '货';return '记';}
  let homeFocusSeq466=0;
  async function enhanceDashboard466(){
    if(window.appState?.route!=='dashboard'||typeof window.dbAll!=='function')return;
    const seq=++homeFocusSeq466,home=document.querySelector('.v44-home');if(!home)return;installHomeFocus466Styles();
    document.getElementById('v466HomeTasks')?.remove();document.getElementById('v466Recent')?.remove();document.querySelector('.v44-attention')?.remove();
    let sales=[],loans=[];
    try{[sales,loans]=await Promise.all([window.dbAll('sales'),window.dbAll('loans')]);}catch(e){console.warn('[v4.6.6 home data]',e);return;}
    if(seq!==homeFocusSeq466||window.appState?.route!=='dashboard'||!document.body.contains(home))return;
    const openLoans=(loans||[]).filter(loanOpen466),overdue=openLoans.filter(l=>daysToDue466(l)<0),dueSoon=openLoans.filter(l=>{const d=daysToDue466(l);return d>=0&&d<=7;}),dueXhs=(sales||[]).filter(s=>isXhsPending466(s)&&xhsDue466(s)<=0);
    const tasks=[];
    if(overdue.length)tasks.push({kind:'overdue',cls:'danger',icon:'急',title:'调借已超期',meta:`最久超期 ${Math.max(...overdue.map(l=>Math.abs(daysToDue466(l))))} 天 · 点开处理归还/售出`,count:`${overdue.length} 单`});
    if(dueSoon.length)tasks.push({kind:'soon',cls:'warn',icon:'期',title:'7 天内到期',meta:`最近一单 ${Math.min(...dueSoon.map(daysToDue466))} 天后到期`,count:`${dueSoon.length} 单`});
    if(dueXhs.length)tasks.push({kind:'xhs',cls:'xhs',icon:'薯',title:'小红书待确认',meta:'已到确认日或退款处理中',count:`${dueXhs.length} 单`});
    const actions=home.querySelector('.v446-actions-section');
    if(tasks.length){
      const sec=document.createElement('section');sec.id='v466HomeTasks';sec.className='v466-section';sec.innerHTML=`<div class="v466-head"><strong>待处理</strong><span>只显示需要你动作的事项</span></div><div class="v466-task-list">${tasks.map(t=>`<button type="button" class="v466-task ${t.cls}" data-v466-task="${t.kind}"><span class="v466-task-icon">${t.icon}</span><span class="v466-task-copy"><strong>${t.title}</strong><small>${t.meta}</small></span><span class="v466-task-count">${t.count} ›</span></button>`).join('')}</div>`;
      home.insertBefore(sec,actions||home.lastElementChild);
      sec.querySelectorAll('[data-v466-task]').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.v466Task;if(k==='xhs')window.navigate?.('sales',{xhs:'pending'});else window.navigate?.('loans');});
    }
    // v4.7.9.3: 最近操作模块已移除，不查询整份审计日志。
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 连续处理版`;
  }
  function scheduleDashboard466(){
    const run=()=>enhanceDashboard466().catch(e=>console.warn('[v4.6.6 dashboard]',e));
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:160});else setTimeout(run,0);
  }
  function wrap466(name,after){return addAfterHook471(name,'v466',after,{awaitAfter:false});}
  function installHomeFocus466(){
    if(window.__mocuiHomeFocus466)return true;
    if(!window.__mocuiProductCards465||typeof window.renderDashboard!=='function')return false;
    window.__mocuiHomeFocus466=true;installHomeFocus466Styles();wrap466('renderDashboard',scheduleDashboard466);
    ['renderProducts','renderLoans','renderSales','renderReports','renderMore'].forEach(name=>wrap466(name,()=>{const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=CURRENT;}));
    if(window.appState?.route==='dashboard')scheduleDashboard466();return true;
  }
  function waitHomeFocus466(){let attempts=0;const tick=()=>{attempts++;if(installHomeFocus466()||attempts>140)return;setTimeout(tick,50);};setTimeout(tick,220);}

  // ===== v4.6.7 最近联系人一键填充 =====
  function installContacts467Styles(){
    if(document.getElementById('mocuiContacts467Styles'))return;
    const style=document.createElement('style');style.id='mocuiContacts467Styles';
    style.textContent=`
      .v467-recent-wrap{margin:7px 0 2px}.v467-recent-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 6px;color:#7c8983;font-size:10.5px}.v467-recent-head strong{font-size:11.5px;color:#53615a}
      .v467-recent-chips{display:flex;gap:7px;overflow-x:auto;padding:1px 1px 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}.v467-recent-chips::-webkit-scrollbar{display:none}
      .v467-chip{appearance:none;flex:0 0 auto;min-height:34px;border:1px solid #dde6e1;background:#f8fbf9;border-radius:999px;padding:6px 10px;color:#2d4037;font-size:12px;font-weight:760;display:inline-flex;align-items:center;gap:5px;box-shadow:none!important;white-space:nowrap}
      .v467-chip small{font-size:9.5px;font-weight:650;color:#8a9690}.v467-chip:active{background:#eef7f2}.v467-chip.is-open{border-color:#efcfab;background:#fff8ef;color:#8a4a07}
      @media(max-width:380px){.v467-chip{padding:6px 9px;font-size:11.5px}.v467-recent-chips{gap:6px}}
    `;
    document.head.appendChild(style);
  }
  function esc467(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function time467(v){const n=new Date(v||0).getTime();return Number.isFinite(n)?n:0;}
  async function recentSalePeople467(){
    if(typeof window.dbAll!=='function')return [];
    const [sales,customers]=await Promise.all([window.dbAll('sales'),window.dbAll('customers')]);
    const byName=new Map(),customerByName=new Map((customers||[]).map(c=>[String(c?.name||'').trim(),c]));
    for(const sale of sales||[]){
      if(sale?.status==='cancelled'||sale?.excludedFromReports)continue;
      const name=String(sale?.customerName||'').trim();if(!name||name==='散客')continue;
      const old=byName.get(name)||{name,id:sale?.customerId||customerByName.get(name)?.id||'',count:0,last:0};
      old.count+=1;old.last=Math.max(old.last,time467(sale?.createdAt||sale?.updatedAt));if(!old.id)old.id=customerByName.get(name)?.id||'';byName.set(name,old);
    }
    // 没有销售历史的客户作为候补，不挤掉真正最近使用的人。
    for(const c of customers||[]){const name=String(c?.name||'').trim();if(!name||name==='散客'||byName.has(name))continue;byName.set(name,{name,id:c.id||'',count:0,last:time467(c.updatedAt||c.createdAt)});}
    return [...byName.values()].sort((a,b)=>b.last-a.last||b.count-a.count).slice(0,6);
  }
  async function recentLoanPeople467(){
    if(typeof window.dbAll!=='function')return [];
    const loans=await window.dbAll('loans'),byName=new Map();
    for(const loan of loans||[]){
      const name=String(loan?.person||'').trim();if(!name)continue;
      const old=byName.get(name)||{name,count:0,open:0,last:0};old.count+=1;old.last=Math.max(old.last,time467(loan?.date||loan?.createdAt||loan?.updatedAt));if(loanOpen466(loan))old.open+=1;byName.set(name,old);
    }
    return [...byName.values()].sort((a,b)=>b.last-a.last||b.count-a.count).slice(0,6);
  }
  function mountChips467({host,id,rows,onPick,meta}){
    if(!host||!rows?.length)return;document.getElementById(id)?.remove();
    const wrap=document.createElement('div');wrap.id=id;wrap.className='v467-recent-wrap';
    wrap.innerHTML=`<div class="v467-recent-head"><strong>最近使用</strong><span>点名字直接填入</span></div><div class="v467-recent-chips">${rows.map((r,i)=>`<button type="button" class="v467-chip ${r.open?'is-open':''}" data-v467-index="${i}"><span>${esc467(r.name)}</span>${meta?.(r)?`<small>${esc467(meta(r))}</small>`:''}</button>`).join('')}</div>`;
    host.insertAdjacentElement('afterend',wrap);wrap.querySelectorAll('[data-v467-index]').forEach(btn=>btn.onclick=()=>{const row=rows[Number(btn.dataset.v467Index)||0];if(row)onPick?.(row);});
  }
  async function enhanceSaleContacts467(){
    if(window.appState?.route!=='sale-new')return;installContacts467Styles();
    const input=document.getElementById('saleCustomer');if(!input||document.getElementById('v467SalePeople'))return;
    const rows=await recentSalePeople467();if(window.appState?.route!=='sale-new'||!document.body.contains(input))return;
    const host=input.closest('.form-group')||input.parentElement;
    mountChips467({host,id:'v467SalePeople',rows,meta:r=>r.count?`${r.count}单`:'客户',onPick:r=>{
      input.value=r.name;if(window.appState?.saleDraft){window.appState.saleDraft.customerName=r.name;window.appState.saleDraft.customerId=r.id||'';}
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('saleCustomerSuggestions')?.classList.add('hidden');setTimeout(updateSaleDock463,0);
    }});
  }
  async function enhanceLoanContacts467(){
    installContacts467Styles();const input=document.getElementById('loanPerson');if(!input||document.getElementById('v467LoanPeople'))return;
    const rows=await recentLoanPeople467();if(!document.body.contains(input))return;const host=input.closest('.form-group')||input.parentElement;
    mountChips467({host,id:'v467LoanPeople',rows,meta:r=>r.open?`${r.open}单未完`:r.count?`${r.count}次`:'',onPick:r=>{
      input.value=r.name;if(window.appState?.loanDraft)window.appState.loanDraft.person=r.name;
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('loanPersonSuggestions')?.classList.add('hidden');
    }});
  }
  function wrap467(name,after){return addAfterHook471(name,'v467',after,{awaitAfter:true});}
  function installContacts467(){
    if(window.__mocuiContacts467)return true;if(typeof window.renderSaleNew!=='function'||typeof window.renderLoanFormModal!=='function')return false;
    window.__mocuiContacts467=true;installContacts467Styles();wrap467('renderSaleNew',enhanceSaleContacts467);wrap467('renderLoanFormModal',enhanceLoanContacts467);
    ['renderDashboard','renderProducts','renderLoans','renderSales','renderReports','renderMore'].forEach(name=>wrap467(name,()=>{const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=CURRENT;}));
    if(window.appState?.route==='sale-new')enhanceSaleContacts467();else if(document.getElementById('loanForm'))enhanceLoanContacts467();return true;
  }
  function waitContacts467(){let attempts=0;const tick=()=>{attempts++;if(installContacts467()||attempts>160)return;setTimeout(tick,50);};setTimeout(tick,260);}

  // ===== v4.6.8 保存成功后的连续处理 =====
  function installContinuous468Styles(){
    if(document.getElementById('mocuiContinuous468Styles'))return;
    const style=document.createElement('style');style.id='mocuiContinuous468Styles';
    style.textContent=`
      .v468-complete{position:fixed;z-index:160;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));border:1px solid #d9e6df;border-radius:20px;background:rgba(255,255,255,.98);box-shadow:0 16px 42px rgba(22,52,38,.18);padding:13px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:v468-in .16s ease-out}
      @keyframes v468-in{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
      .v468-complete-head{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:10px}.v468-complete-icon{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#e8f6ef;color:#13704f;font-size:20px;font-weight:900}
      .v468-complete-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.v468-complete-copy strong{font-size:15px;color:#17221e}.v468-complete-copy small{font-size:10.5px;color:#75817b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v468-complete-close{appearance:none;border:0;background:transparent;width:34px;height:34px;border-radius:10px;color:#84918b;font-size:20px;box-shadow:none!important}
      .v468-complete-actions{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:7px;margin-top:11px}.v468-complete-actions button{appearance:none;min-height:44px;border-radius:13px;border:1px solid #dfe7e3;background:#fff;color:#3e5047;font-size:12px;font-weight:800;box-shadow:none!important;padding:7px 6px}.v468-complete-actions .primary{background:#177355;border-color:#177355;color:#fff}.v468-complete-actions button:active{transform:scale(.985)}
      body.v462-field-focused .v468-complete{display:none!important}
      @media(max-width:380px){.v468-complete{left:8px;right:8px;padding:11px}.v468-complete-actions{grid-template-columns:1.2fr 1fr 1fr;gap:5px}.v468-complete-actions button{font-size:11px;padding:6px 4px}}
    `;
    document.head.appendChild(style);
  }
  function closeCompletion468(){document.getElementById('v468Completion')?.remove();}
  function completionKey468(action,id){return `${action}:${id||''}`;}
  function handledCompletion468(key){try{return sessionStorage.getItem('mocui_v468_last_completion')===key;}catch{return false;}}
  function markCompletion468(key){try{sessionStorage.setItem('mocui_v468_last_completion',key);}catch{}}
  async function latestAudit468(action,sinceMs){
    if(typeof window.dbAll!=='function')return null;
    try{
      const logs=await window.dbAll('auditLogs');
      return (logs||[]).filter(x=>String(x?.action||'')===action&&new Date(x?.createdAt||0).getTime()>=sinceMs).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0]||null;
    }catch{return null;}
  }
  async function completionRecord468(kind,id){
    if(!id||typeof window.dbGet!=='function')return null;
    try{return await window.dbGet(kind==='sale'?'sales':'loans',id);}catch{return null;}
  }
  function showCompletion468(kind,record,audit){
    installContinuous468Styles();closeCompletion468();
    const id=String(record?.id||audit?.entityId||'');
    const key=completionKey468(kind==='sale'?'sale.create':'loan.create',id);if(handledCompletion468(key))return;markCompletion468(key);
    const isSale=kind==='sale';
    const title=isSale?'销售已保存':'调借已保存';
    const meta=isSale
      ?`${record?.orderNo||''}${record?.customerName?` · ${record.customerName}`:''}${Number.isFinite(Number(record?.finalAmount))?` · ¥${Number(record.finalAmount||0).toFixed(0)}`:''}`
      :`${record?.loanNo||''}${record?.person?` · ${record.person}`:''}${record?.type?` · ${record.type==='borrow'?'调入':'借出'}`:''}`;
    const sheet=document.createElement('section');sheet.id='v468Completion';sheet.className='v468-complete';sheet.setAttribute('role','status');
    sheet.innerHTML=`<div class="v468-complete-head"><span class="v468-complete-icon">✓</span><span class="v468-complete-copy"><strong>${title}</strong><small>${esc467(meta||audit?.summary||'记录已经安全写入')}</small></span><button type="button" class="v468-complete-close" aria-label="关闭">×</button></div><div class="v468-complete-actions"><button type="button" class="primary" data-v468="next">${isSale?'继续开下一单':'继续新增调借'}</button><button type="button" data-v468="view">${isSale?'查看刚才订单':'查看刚才调借'}</button><button type="button" data-v468="home">返回首页</button></div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('.v468-complete-close').onclick=closeCompletion468;
    sheet.querySelector('[data-v468="next"]').onclick=()=>{
      closeCompletion468();
      if(isSale){
        if(window.appState)window.appState.saleDraft=null;
        try{sessionStorage.setItem('mocui_v463_sale_autopick','1');}catch{}
        window.navigate?.('sale-new');
      }else{
        if(window.appState)window.appState.loanDraft=null;
        if(typeof window.openLoanForm==='function')window.openLoanForm();else window.navigate?.('loans');
      }
    };
    sheet.querySelector('[data-v468="view"]').onclick=()=>{
      closeCompletion468();
      if(isSale){
        if(record&&typeof window.openSaleDetail==='function')window.openSaleDetail(record);
        else{
          const card=id?document.querySelector(`.sale-card[data-id="${CSS?.escape?CSS.escape(id):id}"]`):null;
          if(card)card.click();else window.navigate?.('sales',{highlight:id});
        }
      }else{
        if(id&&typeof window.openLoanDetail==='function')window.openLoanDetail(id);
        else{
          const row=id?document.querySelector(`[data-loan-id="${CSS?.escape?CSS.escape(id):id}"]`):null;
          if(row)row.click();else window.navigate?.('loans');
        }
      }
    };
    sheet.querySelector('[data-v468="home"]').onclick=()=>{closeCompletion468();window.navigate?.('dashboard',{}, {reset:true});};
  }
  async function detectCompletion468({target,previous,started}){
    // 销售：只接受从开单页完成后跳到销售单管理的路径。
    if(target==='sales'&&previous==='sale-new'&&!window.appState?.saleDraft){
      const audit=await latestAudit468('sale.create',started-5000);if(!audit)return;
      const key=completionKey468('sale.create',audit.entityId);if(handledCompletion468(key))return;
      const record=await completionRecord468('sale',audit.entityId);showCompletion468('sale',record,audit);return;
    }
    // 调借是全屏弹层，不改变 route；保存后会写 loan.create，再跳调借管理。
    if(target==='loans'&&!window.appState?.loanDraft){
      const audit=await latestAudit468('loan.create',started-5000);if(!audit)return;
      const key=completionKey468('loan.create',audit.entityId);if(handledCompletion468(key))return;
      const record=await completionRecord468('loan',audit.entityId);showCompletion468('loan',record,audit);
    }
  }
  function installContinuous468(){
    if(window.__mocuiContinuous468)return true;if(typeof window.navigate!=='function')return false;
    window.__mocuiContinuous468=true;installContinuous468Styles();
    addNavigateHook471('after','v468',ctx=>{
      Promise.resolve().then(()=>detectCompletion468({target:ctx.target,previous:ctx.previous,started:ctx.started})).catch(e=>console.warn('[v4.6.8 completion]',e));
    });
    return true;
  }
  function waitContinuous468(){let attempts=0;const tick=()=>{attempts++;if(installContinuous468()||attempts>180)return;setTimeout(tick,50);};setTimeout(tick,320);}

  // ===== v4.6.9 页面状态记忆：搜索 / 筛选 / 列表位置 =====
  const PAGE_STATE_KEY_469='mocui_page_state_v469';
  function readStates469(){try{const x=JSON.parse(sessionStorage.getItem(PAGE_STATE_KEY_469)||'{}');return x&&typeof x==='object'?x:{};}catch{return {};}}
  function pageState469(route){return readStates469()[route]||{};}
  function writeState469(route,patch){
    try{const all=readStates469(),old=all[route]&&typeof all[route]==='object'?all[route]:{};all[route]={...old,...patch,updatedAt:Date.now()};sessionStorage.setItem(PAGE_STATE_KEY_469,JSON.stringify(all));}catch{}
  }
  function clearState469(route){try{const all=readStates469();delete all[route];sessionStorage.setItem(PAGE_STATE_KEY_469,JSON.stringify(all));}catch{}}
  function mainScroll469(){const m=document.getElementById('main');return m?Number(m.scrollTop||0):Number(window.scrollY||0);}
  function restoreScroll469(route,delay=180){const top=Number(pageState469(route).scrollTop||0);if(top<=0)return;setTimeout(()=>{if(String(window.appState?.route||'')!==route)return;const m=document.getElementById('main');if(m)m.scrollTo({top,left:0,behavior:'auto'});else window.scrollTo({top,left:0,behavior:'auto'});},delay);}
  function syncMemoryVersion469(){const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 页面记忆版`;const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=CURRENT;}

  function saveProducts469(){
    if(window.appState?.route!=='products')return;
    const input=document.getElementById('productSearch'),stock=document.getElementById('stockFilter');
    writeState469('products',{query:input?.value||'',stock:stock?.value??'in',scrollTop:mainScroll469()});
  }
  function saveSales469(){
    if(window.appState?.route!=='sales')return;
    const input=document.getElementById('saleSearch'),active=document.querySelector('#saleStatus button.active');
    const status=active?.id==='v44XhsTab'?'xhs':(active?.dataset?.status||'all');
    writeState469('sales',{query:input?.value||'',status,scrollTop:mainScroll469()});
  }
  function saveLoans469(){
    if(window.appState?.route!=='loans')return;
    const active=document.querySelector('#loanStatus button.active');
    writeState469('loans',{status:active?.dataset?.status||'all',scrollTop:mainScroll469()});
  }
  function captureCurrent469(){const r=String(window.appState?.route||'');if(r==='products')saveProducts469();else if(r==='sales')saveSales469();else if(r==='loans')saveLoans469();}

  function bindProducts469(){
    const input=document.getElementById('productSearch'),stock=document.getElementById('stockFilter');if(!input||!stock)return;
    if(input.dataset.v469Memory!=='1'){
      input.dataset.v469Memory='1';const save=()=>setTimeout(saveProducts469,90);input.addEventListener('input',save);input.addEventListener('search',save);input.addEventListener('compositionend',save);
      stock.addEventListener('change',saveProducts469);
    }
  }
  function restoreProducts469(){
    if(window.appState?.route!=='products')return;const st=pageState469('products'),input=document.getElementById('productSearch'),stock=document.getElementById('stockFilter');if(!input||!stock)return;
    bindProducts469();
    if(typeof st.query==='string'&&input.value!==st.query){input.value=st.query;input.dispatchEvent(new Event('input',{bubbles:true}));}
    setTimeout(()=>{if(window.appState?.route!=='products')return;if(typeof st.stock==='string'&&[...stock.options].some(o=>o.value===st.stock)&&stock.value!==st.stock){stock.value=st.stock;stock.dispatchEvent(new Event('change',{bubbles:true}));}setTimeout(()=>restoreScroll469('products',0),120);},80);
  }

  function bindSales469(){
    const input=document.getElementById('saleSearch'),seg=document.getElementById('saleStatus');if(!seg)return;
    if(input&&input.dataset.v469Memory!=='1'){input.dataset.v469Memory='1';input.addEventListener('input',()=>setTimeout(saveSales469,40));input.addEventListener('search',saveSales469);}
    if(seg.dataset.v469Memory!=='1'){seg.dataset.v469Memory='1';seg.addEventListener('click',e=>{if(e.target?.closest?.('button'))setTimeout(saveSales469,30);});}
  }
  function restoreSales469(){
    if(window.appState?.route!=='sales')return;
    // 新保存记录带 highlight，或明确从小红书入口进入时，以当前目标为准，不恢复旧筛选。
    if(window.appState?.params?.highlight||window.appState?.params?.xhs){bindSales469();return;}
    const st=pageState469('sales');bindSales469();
    setTimeout(()=>{
      if(window.appState?.route!=='sales')return;
      const status=String(st.status||'all');let btn=null;
      if(status==='xhs')btn=document.getElementById('v44XhsTab');else btn=document.querySelector(`#saleStatus button[data-status="${status.replace(/"/g,'')}"]`);
      if(btn&&!btn.classList.contains('active'))btn.click();
      const input=document.getElementById('saleSearch');if(input&&typeof st.query==='string'&&input.value!==st.query){input.value=st.query;input.dispatchEvent(new Event('input',{bubbles:true}));}
      setTimeout(()=>restoreScroll469('sales',0),120);
    },40);
  }

  function bindLoans469(){
    const seg=document.getElementById('loanStatus');if(!seg)return;if(seg.dataset.v469Memory==='1')return;seg.dataset.v469Memory='1';seg.addEventListener('click',e=>{if(e.target?.closest?.('button'))setTimeout(saveLoans469,30);});
  }
  function restoreLoans469(){
    if(window.appState?.route!=='loans')return;const st=pageState469('loans');bindLoans469();
    setTimeout(()=>{if(window.appState?.route!=='loans')return;const status=String(st.status||'all'),btn=document.querySelector(`#loanStatus button[data-status="${status.replace(/"/g,'')}"]`);if(btn&&!btn.classList.contains('active'))btn.click();setTimeout(()=>restoreScroll469('loans',0),100);},30);
  }

  function installScrollMemory469(){
    const main=document.getElementById('main');if(!main||main.dataset.v469Scroll==='1')return;main.dataset.v469Scroll='1';let raf=0;
    main.addEventListener('scroll',()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;const r=String(window.appState?.route||'');if(['products','sales','loans'].includes(r))writeState469(r,{scrollTop:mainScroll469()});});},{passive:true});
  }
  function wrap469(name,after){return addAfterHook471(name,'v469',after,{awaitAfter:true});}
  function installPageMemory469(){
    if(window.__mocuiPageMemory469)return true;if(typeof window.navigate!=='function'||typeof window.renderProducts!=='function')return false;
    window.__mocuiPageMemory469=true;installScrollMemory469();
    wrap469('renderProducts',()=>{restoreProducts469();syncMemoryVersion469();});
    wrap469('renderSales',()=>{restoreSales469();syncMemoryVersion469();});
    wrap469('renderLoans',()=>{restoreLoans469();syncMemoryVersion469();});
    ['renderDashboard','renderReports','renderMore'].forEach(name=>wrap469(name,syncMemoryVersion469));
    // 新开业务时清空对应列表筛选，避免保存后新记录被旧筛选隐藏。
    wrap469('renderSaleNew',()=>{clearState469('sales');syncMemoryVersion469();});
    const oldLoan=window.openLoanForm;if(typeof oldLoan==='function'&&!oldLoan.__v469Wrapped){
      const loanWrapped=async function(){clearState469('loans');return oldLoan.apply(this,arguments);};Object.defineProperty(loanWrapped,'__v469Wrapped',{value:true});window.openLoanForm=loanWrapped;try{globalThis.openLoanForm=loanWrapped;}catch{}
    }
    addNavigateHook471('before','v469-capture',()=>captureCurrent469());
    addNavigateHook471('after','v469-scroll',()=>setTimeout(installScrollMemory469,0));
    if(window.appState?.route==='products')restoreProducts469();else if(window.appState?.route==='sales')restoreSales469();else if(window.appState?.route==='loans')restoreLoans469();
    syncMemoryVersion469();return true;
  }
  function waitPageMemory469(){let attempts=0;const tick=()=>{attempts++;if(installPageMemory469()||attempts>200)return;setTimeout(tick,50);};setTimeout(tick,380);}

  // ===== v4.7.0 全局搜索直达：搜到商品后直接销售 / 借出 / 编辑 =====
  function installGlobalDirect470Styles(){
    if(document.getElementById('mocuiGlobalDirect470Styles'))return;
    const style=document.createElement('style');style.id='mocuiGlobalDirect470Styles';
    style.textContent=`
      .v470-search-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:-2px 10px 9px 52px;padding:0 0 1px}
      .v470-search-actions button{appearance:none;min-height:34px;border:1px solid #dfe7e3;background:#fff;border-radius:10px;color:#42534b;font-size:10.5px;font-weight:790;box-shadow:none!important;padding:5px 7px;touch-action:manipulation}
      .v470-search-actions button[data-v470-action="sale"]{background:#eef8f3;border-color:#cfe5d9;color:#176b50}
      .v470-search-actions button:disabled{opacity:.38!important;background:#f5f6f6!important;color:#929b97!important;border-color:#e7eae9!important}
      .v470-search-actions button:active{transform:scale(.985)}
      .v470-search-result-product{border-bottom-color:transparent!important}
      @media(max-width:380px){.v470-search-actions{margin-left:46px;margin-right:7px;gap:5px}.v470-search-actions button{font-size:10px;padding:5px 4px}}
    `;
    document.head.appendChild(style);
  }
  let globalDirectSeq470=0;
  function closeGlobalSearch470(next){
    const close=document.querySelector('#modalRoot .modal-close');
    if(close)close.click();
    setTimeout(()=>{try{next?.();}catch(e){console.warn('[v4.7.0 global action]',e);}},70);
  }
  async function enhanceGlobalDirect470(){
    const input=document.getElementById('v44GlobalQuery'),host=document.getElementById('v44GlobalResults');
    if(!input||!host)return;
    installGlobalDirect470Styles();
    const seq=++globalDirectSeq470,q=String(input.value||'').trim();
    host.querySelectorAll('.v470-search-actions').forEach(x=>x.remove());
    host.querySelectorAll('.v470-search-result-product').forEach(x=>x.classList.remove('v470-search-result-product'));
    // 空搜索仍保持原来的轻量最近记录列表，真正输入关键词后才显示快捷操作。
    if(!q)return;
    const map=await productMap464();
    if(seq!==globalDirectSeq470||!document.body.contains(host))return;
    const rows=[...host.querySelectorAll('.v44-search-result[data-kind="product"]')].slice(0,24);
    for(const row of rows){
      const id=String(row.dataset.id||''),product=map.get(id);if(!product)continue;
      row.classList.add('v470-search-result-product');
      const stock=Number(product.stock||0),actions=document.createElement('div');
      actions.className='v470-search-actions';actions.dataset.productId=id;
      actions.innerHTML=`<button type="button" data-v470-action="sale" ${stock>0?'':'disabled'}>销售</button><button type="button" data-v470-action="loan" ${stock>0?'':'disabled'}>借出</button><button type="button" data-v470-action="edit">编辑</button>`;
      row.insertAdjacentElement('afterend',actions);
      actions.querySelectorAll('button').forEach(btn=>btn.onclick=e=>{
        e.preventDefault();e.stopPropagation();if(btn.disabled)return;
        const action=btn.dataset.v470Action;rememberRecent464(product.id);
        if(action==='sale')closeGlobalSearch470(()=>quickSale465(product));
        else if(action==='loan')closeGlobalSearch470(()=>quickLoan465(product));
        else closeGlobalSearch470(()=>quickEdit465(product));
      });
    }
  }
  function queueGlobalDirect470(delay=35){setTimeout(()=>enhanceGlobalDirect470().catch(e=>console.warn('[v4.7.0 global direct]',e)),delay);}
  function syncGlobalDirectVersion470(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 数据安全状态版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
    setTimeout(()=>{const f=document.querySelector('.v44-home-foot');if(f)f.textContent=`v${CURRENT} · 数据安全状态版`;},320);
  }
  function wrap470(name,after){return addAfterHook471(name,'v470',after,{awaitAfter:false});}
  function installGlobalDirect470(){
    if(window.__mocuiGlobalDirect470)return true;
    if(!window.__mocuiPageMemory469||typeof window.renderDashboard!=='function')return false;
    window.__mocuiGlobalDirect470=true;installGlobalDirect470Styles();
    addNavigateHook471('after','v471-cleanup',stabilityCleanup471);
    document.addEventListener('input',e=>{if(e.target?.id==='v44GlobalQuery')queueGlobalDirect470(25);},true);
    document.addEventListener('compositionend',e=>{if(e.target?.id==='v44GlobalQuery')queueGlobalDirect470(25);},true);
    document.addEventListener('focusin',e=>{if(e.target?.id==='v44GlobalQuery')queueGlobalDirect470(45);},true);
    document.addEventListener('click',e=>{if(e.target?.closest?.('#v446HeaderSearch,#v44PageSearch,.v44-page-mic'))queueGlobalDirect470(110);},false);
    ['renderDashboard','renderProducts','renderSales','renderLoans','renderReports','renderMore','renderSaleNew','renderLoanFormModal'].forEach(name=>wrap470(name,syncGlobalDirectVersion470));
    syncGlobalDirectVersion470();queueGlobalDirect470(80);return true;
  }
  function waitGlobalDirect470(){let attempts=0;const tick=()=>{attempts++;if(installGlobalDirect470()||attempts>220)return;setTimeout(tick,50);};setTimeout(tick,430);}

  // ===== v4.7.2 数据安全状态：把真实同步队列/冲突/最近确认时间做成可见状态 =====
  const SYNC_OK_KEY_472='mocui_sync_last_ok_v472';
  const SYNC_DIRTY_KEY_472='mocui_sync_v3_dirty';
  function installSyncSafety472Styles(){
    if(document.getElementById('mocuiSyncSafety472Styles'))return;
    const style=document.createElement('style');style.id='mocuiSyncSafety472Styles';
    style.textContent=`
      #cloudBadge[data-v472-ready="1"]{cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;outline:none}
      #cloudBadge[data-v472-ready="1"]:focus-visible{box-shadow:0 0 0 3px rgba(23,115,85,.16)}
      .v472-sync-shell{display:grid;gap:10px}.v472-sync-hero{border:1px solid #dfe8e3;border-radius:18px;padding:13px;background:#f9fbfa;display:grid;grid-template-columns:42px minmax(0,1fr);gap:11px;align-items:center}
      .v472-sync-hero.is-good{background:#f2faf6;border-color:#cfe5d9}.v472-sync-hero.is-warn{background:#fff9ee;border-color:#eeddb8}.v472-sync-hero.is-danger{background:#fff5f4;border-color:#f2d2ce}
      .v472-sync-mark{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:#eaf4ef;color:#176b50;font-size:15px;font-weight:900}.v472-sync-hero.is-warn .v472-sync-mark{background:#fff0cf;color:#9b6500}.v472-sync-hero.is-danger .v472-sync-mark{background:#fde8e6;color:#b42318}
      .v472-sync-copy{min-width:0;display:flex;flex-direction:column;gap:3px}.v472-sync-copy strong{font-size:15px;color:#17221e}.v472-sync-copy small{font-size:11px;line-height:1.45;color:#6e7c75}
      .v472-sync-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v472-sync-metric{border:1px solid #e5ebe8;background:#fff;border-radius:14px;padding:10px}.v472-sync-metric span{display:block;font-size:10.5px;color:#86918c;margin-bottom:3px}.v472-sync-metric strong{display:block;font-size:14px;color:#26372f}.v472-sync-metric strong.danger{color:#b42318}.v472-sync-metric strong.warn{color:#9b6500}
      .v472-sync-actions{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:7px}.v472-sync-actions button{min-height:44px;border-radius:13px;font-size:12px;font-weight:800}.v472-sync-actions .primary{background:#177355!important;border-color:#177355!important;color:#fff!important}
      .v472-sync-note{font-size:10.5px;line-height:1.55;color:#78867f;padding:0 2px}.v472-sync-note strong{color:#4a5b52}
      .v472-settings-card{border:1px solid #dfe8e3;background:#f9fbfa;border-radius:16px;padding:12px;margin-bottom:12px}.v472-settings-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.v472-settings-head strong{font-size:14px}.v472-settings-head button{appearance:none;border:0;background:transparent;color:#177355;font-size:11px;font-weight:800;padding:5px}
      .v472-settings-line{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.v472-settings-line div{background:#fff;border:1px solid #e6ebe8;border-radius:12px;padding:8px}.v472-settings-line small{display:block;color:#87928d;font-size:9.5px;margin-bottom:3px}.v472-settings-line b{display:block;font-size:12px;color:#26372f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:380px){.v472-sync-actions{grid-template-columns:1.15fr 1fr 1fr;gap:5px}.v472-sync-actions button{font-size:11px;padding:6px 4px}.v472-settings-line{gap:5px}}
    `;document.head.appendChild(style);
  }
  function esc472(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function loadSyncOk472(){try{return JSON.parse(localStorage.getItem(SYNC_OK_KEY_472)||'null')||null;}catch{return null;}}
  function saveSyncOk472(detail={}){try{localStorage.setItem(SYNC_OK_KEY_472,JSON.stringify({at:Date.now(),cursor:Number(detail?.cursor||0),protocol:detail?.protocol||'v3-journal'}));}catch{}}
  function hasDirty472(){try{if(JSON.parse(localStorage.getItem(SYNC_DIRTY_KEY_472)||'null')?.dirty)return true;}catch{}return document.documentElement.dataset.localDirty==='1';}
  function fmtTime472(value){const t=Number(value||0);if(!t)return '尚未记录';const d=new Date(t);if(Number.isNaN(d.getTime()))return '尚未记录';const now=new Date(),same=d.toDateString()===now.toDateString();return same?`今天 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:d.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  function localBackup472(){const raw=localStorage.getItem('mocui_last_local_backup')||'';if(!raw)return {raw:'',label:'尚未导出'};const t=new Date(raw).getTime();if(!Number.isFinite(t))return {raw,label:'已导出'};const days=Math.floor((Date.now()-t)/86400000);return {raw,label:days<=0?'今天':days===1?'昨天':`${days}天前`,days};}
  async function syncSnapshot472(){
    let core={cursor:0,outbox:0,conflicts:0,dirty:0},statusValid=false;
    try{if(typeof window.CloudSync?.getV3Status==='function'){const result=await window.CloudSync.getV3Status();if(result&&typeof result==='object'){core={...core,...result};statusValid=true;}}}catch(e){console.warn('[v4.7.2 sync status]',e);}
    const online=navigator.onLine,dirtyMarker=hasDirty472(),badge=document.getElementById('cloudBadge'),text=String(badge?.textContent||''),cls=String(badge?.className||'');
    let kind=statusValid?'synced':'unknown';
    if(!statusValid)kind='unknown';
    else if(Number(core.conflicts||0)>0||/冲突/.test(text))kind='conflict';
    else if(!online)kind='offline';
    else if(/同步中/.test(text)&&!/待同步/.test(text))kind='syncing';
    else if(Number(core.outbox||0)>0||Number(core.dirty||0)>0||dirtyMarker||/待同步/.test(text))kind='pending';
    else if(/error/.test(cls)&&!/已同步/.test(text))kind='offline';
    const last=loadSyncOk472(),backup=localBackup472();
    return {...core,online,dirtyMarker,kind,last,backup,statusValid};
  }
  function stateCopy472(st){
    if(st.kind==='unknown')return {cls:'is-warn',mark:'?',title:'同步状态尚未确认',sub:'增量同步队列未能读取，不能判断为云端已同步'};
    if(st.kind==='conflict')return {cls:'is-danger',mark:'!',title:'存在同步冲突',sub:'本机数据仍保留，但需要先确认冲突后才能认为云端完全一致'};
    if(st.kind==='offline')return {cls:'is-warn',mark:'离',title:'当前离线 · 本机已保存',sub:'可以继续操作；联网后系统会自动尝试把待同步记录传到云端'};
    if(st.kind==='syncing')return {cls:'is-warn',mark:'↻',title:'正在后台同步',sub:'本机可继续使用，完成后状态会自动更新'};
    if(st.kind==='pending')return {cls:'is-warn',mark:'待',title:'本机已保存 · 等待云端',sub:'数据没有丢失，但还有本机变更尚未得到云端确认'};
    return {cls:'is-good',mark:'✓',title:'本机与云端已同步',sub:'当前同步队列为空，没有检测到待处理冲突'};
  }
  async function refreshSyncBadge472(){
    const badge=document.getElementById('cloudBadge');if(!badge)return;installSyncSafety472Styles();
    badge.dataset.v472Ready='1';badge.setAttribute('role','button');badge.setAttribute('tabindex','0');badge.setAttribute('aria-label','查看数据同步状态');
    const st=await syncSnapshot472(),copy=stateCopy472(st);badge.title=`${copy.title}｜待上传 ${Number(st.outbox||0)}｜冲突 ${Number(st.conflicts||0)}｜最近确认 ${fmtTime472(st.last?.at)}`;
  }
  async function renderSyncPanel472(root){
    const host=root?.querySelector?.('#v472SyncPanel')||document.getElementById('v472SyncPanel');if(!host)return;
    const st=await syncSnapshot472(),copy=stateCopy472(st),pending=Number(st.outbox||0),dirty=Number(st.dirty||0),conflicts=Number(st.conflicts||0);
    host.innerHTML=`<div class="v472-sync-shell"><div class="v472-sync-hero ${copy.cls}"><span class="v472-sync-mark">${copy.mark}</span><span class="v472-sync-copy"><strong>${esc472(copy.title)}</strong><small>${esc472(copy.sub)}</small></span></div><div class="v472-sync-grid"><div class="v472-sync-metric"><span>待上传队列</span><strong class="${pending?'warn':''}">${pending} 条</strong></div><div class="v472-sync-metric"><span>待捕获变更</span><strong class="${dirty?'warn':''}">${dirty} 条</strong></div><div class="v472-sync-metric"><span>同步冲突</span><strong class="${conflicts?'danger':''}">${conflicts} 条</strong></div><div class="v472-sync-metric"><span>最近云端确认</span><strong>${esc472(fmtTime472(st.last?.at))}</strong></div><div class="v472-sync-metric"><span>网络</span><strong>${st.online?'在线':'离线'}</strong></div><div class="v472-sync-metric"><span>本地 JSON 备份</span><strong>${esc472(st.backup.label)}</strong></div></div>${conflicts?'<div class="notice danger"><strong>检测到同步冲突。</strong><br>先导出完整 JSON 备份。增量同步模式下已停用“整库强制覆盖云端”，避免误删另一台设备的新数据。</div>':''}<div class="v472-sync-actions"><button id="v472SyncNow" class="btn primary" type="button" ${st.online?'':'disabled'}>立即同步</button><button id="v472BackupNow" class="btn secondary" type="button">导出备份</button><button id="v472SyncSettings" class="btn secondary" type="button">数据设置</button></div><div class="v472-sync-note"><strong>判断口径：</strong>“已同步”只在增量同步队列、待捕获变更和冲突都为 0 时显示；不是只看网络是否在线。</div></div>`;
    const syncBtn=host.querySelector('#v472SyncNow');if(syncBtn)syncBtn.onclick=async()=>{if(!navigator.onLine)return;syncBtn.disabled=true;syncBtn.textContent='同步中…';try{const result=await window.CloudSync?.pull?.();const verified=await syncSnapshot472();if(verified.statusValid&&Number(verified.outbox||0)===0&&Number(verified.dirty||0)===0&&Number(verified.conflicts||0)===0)saveSyncOk472(result||{});notify('同步检查完成');}catch(e){notify(`同步失败：${e?.message||'请稍后重试'}`);}finally{await refreshSyncBadge472();await renderSyncPanel472(root);}};
    const backupBtn=host.querySelector('#v472BackupNow');if(backupBtn)backupBtn.onclick=async()=>{try{if(typeof window.backupAll==='function')await window.backupAll();else{notify('请到“数据与设置”导出完整备份');closeModal472();window.navigate?.('settings');}}catch(e){notify(e?.message||'导出失败');}setTimeout(()=>renderSyncPanel472(root),120);};
    const settingsBtn=host.querySelector('#v472SyncSettings');if(settingsBtn)settingsBtn.onclick=()=>{closeModal472();window.navigate?.('settings');};
  }
  function closeModal472(){const close=document.querySelector('#modalRoot .modal-close');if(close)close.click();}
  function openSyncPanel472(){
    if(typeof window.openModal!=='function'){notify('同步详情暂时不可打开，请到“更多 → 数据与设置”查看');return;}
    window.openModal('数据同步状态','<div id="v472SyncPanel"><div class="v44-search-loading">正在读取真实同步状态…</div></div>',{full:false,onOpen:root=>renderSyncPanel472(root).catch(e=>console.warn('[v4.7.2 sync panel]',e))});
  }
  async function enhanceSettings472(){
    if(window.appState?.route!=='settings')return;installSyncSafety472Styles();const main=document.getElementById('main');if(!main)return;
    document.getElementById('v472SettingsSafety')?.remove();const st=await syncSnapshot472();if(window.appState?.route!=='settings'||!document.body.contains(main))return;const copy=stateCopy472(st),card=document.createElement('section');card.id='v472SettingsSafety';card.className='v472-settings-card';
    card.innerHTML=`<div class="v472-settings-head"><strong>同步安全状态</strong><button type="button" id="v472SettingsDetail">查看详情 ›</button></div><div class="v472-settings-line"><div><small>当前</small><b>${esc472(copy.title)}</b></div><div><small>待同步</small><b>${Number(st.outbox||0)+Number(st.dirty||0)} 条</b></div><div><small>最近确认</small><b>${esc472(fmtTime472(st.last?.at))}</b></div></div>`;
    main.prepend(card);card.querySelector('#v472SettingsDetail').onclick=openSyncPanel472;
  }
  function syncVersion472(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 数据安全状态版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
    setTimeout(()=>{const f=document.querySelector('.v44-home-foot');if(f)f.textContent=`v${CURRENT} · 数据安全状态版`;},420);
  }
  function installSyncSafety472(){
    if(window.__mocuiSyncSafety472)return true;if(typeof window.navigate!=='function'||!window.CloudSync)return false;
    window.__mocuiSyncSafety472=true;installSyncSafety472Styles();
    const badge=document.getElementById('cloudBadge');if(badge&&badge.dataset.v472Bound!=='1'){badge.dataset.v472Bound='1';badge.addEventListener('click',openSyncPanel472);badge.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSyncPanel472();}});}
    window.addEventListener('cloud-sync-ok',async e=>{const d=e.detail||{},verified=await syncSnapshot472();if(verified.statusValid&&Number(verified.outbox||0)===0&&Number(verified.dirty||0)===0&&Number(verified.conflicts||0)===0)saveSyncOk472(d);refreshSyncBadge472();if(window.appState?.route==='settings')enhanceSettings472();});
    window.addEventListener('cloud-mode-change',()=>{setTimeout(refreshSyncBadge472,20);});
    window.addEventListener('online',()=>setTimeout(refreshSyncBadge472,80));window.addEventListener('offline',()=>setTimeout(refreshSyncBadge472,20));
    addAfterHook471('renderSettings','v472',()=>{enhanceSettings472();syncVersion472();},{awaitAfter:false});
    ['renderDashboard','renderProducts','renderSales','renderLoans','renderReports','renderMore','renderSaleNew','renderLoanFormModal'].forEach(name=>addAfterHook471(name,'v472',()=>{refreshSyncBadge472();syncVersion472();},{awaitAfter:false}));
    refreshSyncBadge472();if(window.appState?.route==='settings')enhanceSettings472();syncVersion472();return true;
  }
  function waitSyncSafety472(){let attempts=0;const tick=()=>{attempts++;if(installSyncSafety472()||attempts>240)return;setTimeout(tick,50);};setTimeout(tick,470);}

  // ===== v4.7.3 调借人工作台：按同行聚合未结调借，不改业务账 =====
  const LOAN_VIEW_KEY_473='mocui_v473_loan_view';
  const LOAN_PERSON_QUERY_473='mocui_v473_person_query';
  function installLoanPeople473Styles(){
    if(document.getElementById('mocuiLoanPeople473Styles'))return;
    const style=document.createElement('style');style.id='mocuiLoanPeople473Styles';
    style.textContent=`
      .v473-view-switch{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:11px 0 9px;padding:4px;border:1px solid #e5ebe8;background:#f4f7f5;border-radius:14px}
      .v473-view-switch button{appearance:none;border:0;background:transparent;border-radius:10px;min-height:38px;color:#718078;font-size:12px;font-weight:800;box-shadow:none!important}.v473-view-switch button.active{background:#fff;color:#1f3028;box-shadow:0 1px 5px rgba(25,49,37,.08)!important}
      .v473-people-panel{display:grid;gap:9px}.v473-people-toolbar{display:flex;align-items:center;gap:8px}.v473-people-search{flex:1;min-width:0;border:1px solid #dde5e1;background:#fff;border-radius:12px;min-height:42px;padding:9px 11px;font-size:13px;color:#24342d;outline:none}.v473-people-search:focus{border-color:#a9cdbd;box-shadow:0 0 0 3px rgba(23,115,85,.08)}
      .v473-person-card{appearance:none;width:100%;border:1px solid #e2e9e5;background:#fff;border-radius:16px;padding:11px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;text-align:left;color:#24342d;box-shadow:none!important}.v473-person-card.danger{border-color:#f1cfcb;background:#fffafa}.v473-person-card.warn{border-color:#ead9b5;background:#fffdf7}
      .v473-person-main{min-width:0}.v473-person-name{display:flex;align-items:center;gap:7px;min-width:0}.v473-person-name strong{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v473-person-name span{flex:0 0 auto;border-radius:999px;padding:3px 7px;background:#eef6f2;color:#176b50;font-size:9.5px;font-weight:800}.v473-person-card.danger .v473-person-name span{background:#fde8e6;color:#b42318}.v473-person-card.warn .v473-person-name span{background:#fff0cf;color:#9b6500}
      .v473-person-meta{margin-top:4px;font-size:10.5px;line-height:1.45;color:#74817a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v473-person-right{text-align:right;align-self:center}.v473-person-right strong{display:block;font-size:14px;color:#2e4037}.v473-person-right small{display:block;margin-top:2px;font-size:9.5px;color:#8b9691}.v473-person-arrow{grid-column:1 / 3;border-top:1px solid #edf1ef;padding-top:7px;font-size:10.5px;color:#66766e;display:flex;align-items:center;justify-content:space-between;gap:8px}
      .v473-person-detail-head{border:1px solid #dfe8e3;background:#f6faf8;border-radius:15px;padding:11px;margin-bottom:10px}.v473-person-detail-head strong{font-size:15px}.v473-person-detail-head div{margin-top:4px;font-size:11px;color:#718078;line-height:1.5}.v473-person-loans{display:grid;gap:8px}.v473-person-loan{border:1px solid #e3e9e6;background:#fff;border-radius:14px;padding:10px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.v473-person-loan.is-overdue{border-color:#f0cbc6;background:#fffafa}.v473-person-loan-copy{min-width:0}.v473-person-loan-copy strong{display:block;font-size:12.5px}.v473-person-loan-copy small{display:block;margin-top:3px;font-size:10px;color:#75817b;line-height:1.4}.v473-person-loan button{min-height:36px;white-space:nowrap}.v473-empty{border:1px dashed #dce5e0;border-radius:15px;padding:22px 12px;text-align:center;color:#88948e;font-size:12px}
      @media(max-width:380px){.v473-person-card{padding:10px}.v473-person-meta{font-size:10px}.v473-person-right strong{font-size:13px}.v473-person-loan{grid-template-columns:minmax(0,1fr) 72px}.v473-person-loan button{font-size:10.5px;padding:5px}}
    `;document.head.appendChild(style);
  }
  function esc473(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function loanReturned473(loan,item){
    const qty=Math.max(0,Number(item?.qty||0));
    if(item&&item.returnedQty!==undefined)return Math.min(qty,Math.max(0,Number(item.returnedQty||0)));
    if(String(loan?.status||'')==='returned')return qty;
    return (loan?.returns||[]).filter(event=>event?.status!=='cancelled').reduce((sum,event)=>sum+(event?.items||[]).reduce((total,part)=>total+(String(part?.productId)===String(item?.productId)?Math.max(0,Number(part?.qty||0)):0),0),0);
  }
  function loanSold473(loan,item){
    const qty=Math.max(0,Number(item?.qty||0));
    if(item&&item.soldQty!==undefined)return Math.min(qty,Math.max(0,Number(item.soldQty||0)));
    return (loan?.saleEvents||[]).filter(e=>String(e?.status||'active')!=='cancelled').reduce((sum,event)=>sum+Number((event?.items||[]).find(x=>String(x?.productId)===String(item?.productId))?.qty||0),0);
  }
  function loanRemaining473(loan){return (loan?.items||[]).reduce((sum,item)=>sum+Math.max(0,Number(item?.qty||0)-loanReturned473(loan,item)-loanSold473(loan,item)),0);}
  function openLoan473(loan){return loanRemaining473(loan)>0;}
  function dueDate473(loan){
    if(loan?.expectedReturnDate)return String(loan.expectedReturnDate).slice(0,10);
    const base=new Date(loan?.date||loan?.createdAt||Date.now());if(Number.isNaN(base.getTime()))return '';
    base.setDate(base.getDate()+30);return `${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
  }
  function daysDue473(loan){const raw=dueDate473(loan);if(!raw)return 9999;const d=new Date(raw+'T00:00:00'),t=new Date();t.setHours(0,0,0,0);if(Number.isNaN(d.getTime()))return 9999;return Math.ceil((d-t)/86400000);}
  function dateLabel473(raw){if(!raw)return '未设置';const d=new Date(String(raw).slice(0,10)+'T00:00:00');if(Number.isNaN(d.getTime()))return '未设置';return `${d.getMonth()+1}/${d.getDate()}`;}
  function peopleRows473(loans){
    const map=new Map();
    for(const loan of loans||[]){
      if(!openLoan473(loan))continue;
      const person=String(loan?.person||'未填写姓名').trim()||'未填写姓名';
      let row=map.get(person);if(!row)row={person,loans:[],remaining:0,overdue:0,soon:0,lend:0,borrow:0,nearest:9999,last:0};
      const left=loanRemaining473(loan),days=daysDue473(loan);row.loans.push(loan);row.remaining+=left;row.nearest=Math.min(row.nearest,days);if(days<0)row.overdue++;else if(days<=7)row.soon++;if(loan?.type==='borrow')row.borrow++;else row.lend++;row.last=Math.max(row.last,new Date(loan?.date||loan?.createdAt||0).getTime()||0);map.set(person,row);
    }
    return [...map.values()].sort((a,b)=>b.overdue-a.overdue||b.soon-a.soon||a.nearest-b.nearest||b.remaining-a.remaining||b.last-a.last||a.person.localeCompare(b.person,'zh-CN'));
  }
  function closeModal473(){const close=document.querySelector('#modalRoot .modal-close');if(close)close.click();}
  function openPersonLoans473(row){
    if(!row?.loans?.length)return;
    const sorted=[...row.loans].sort((a,b)=>daysDue473(a)-daysDue473(b)||new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));
    if(typeof window.openModal!=='function'){
      const first=sorted[0];if(first&&typeof window.openLoanDetail==='function')window.openLoanDetail(first.id);return;
    }
    const overdue=row.overdue,head=overdue?`${overdue} 单超期 · 共 ${row.remaining} 件未处理`:`${row.loans.length} 单进行中 · 共 ${row.remaining} 件未处理`;
    window.openModal(`${row.person} · 未结调借`,`<div class="v473-person-detail-head"><strong>${esc473(row.person)}</strong><div>${esc473(head)}${row.lend?` · 借出 ${row.lend} 单`:''}${row.borrow?` · 调入 ${row.borrow} 单`:''}</div></div><div class="v473-person-loans">${sorted.map(l=>{const left=loanRemaining473(l),days=daysDue473(l),due=dueDate473(l),state=days<0?`超期 ${Math.abs(days)} 天`:days===0?'今天到期':days<=7?`${days} 天后到期`:`到期 ${dateLabel473(due)}`;const items=(l.items||[]).filter(i=>Math.max(0,Number(i?.qty||0)-loanReturned473(l,i)-loanSold473(l,i))>0).slice(0,3).map(i=>`${esc473(i.productName||'商品')} × ${Math.max(0,Number(i?.qty||0)-loanReturned473(l,i)-loanSold473(l,i))}`).join(' · ');return `<div class="v473-person-loan ${days<0?'is-overdue':''}"><span class="v473-person-loan-copy"><strong>${esc473(l.loanNo||'调借单')} · ${l.type==='borrow'?'调入':'借出'} · 未处理 ${left} 件</strong><small>${esc473(state)}${items?`<br>${items}`:''}</small></span><button type="button" class="btn secondary small" data-v473-loan="${esc473(l.id)}">查看/处理</button></div>`;}).join('')}</div>`,{full:true,onOpen:root=>{root.querySelectorAll('[data-v473-loan]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.v473Loan;closeModal473();setTimeout(()=>window.openLoanDetail?.(id),40);});}});
  }
  async function enhanceLoanPeople473(){
    if(window.appState?.route!=='loans'||typeof window.dbAll!=='function')return;
    installLoanPeople473Styles();const main=document.getElementById('main'),status=document.getElementById('loanStatus'),list=document.getElementById('loanList');if(!main||!status||!list)return;
    document.getElementById('v473LoanViewSwitch')?.remove();document.getElementById('v473PeoplePanel')?.remove();
    const loans=await window.dbAll('loans');if(window.appState?.route!=='loans'||!document.body.contains(main))return;
    const rows=peopleRows473(loans),wrap=document.createElement('div');wrap.id='v473LoanViewSwitch';wrap.className='v473-view-switch';wrap.innerHTML='<button type="button" data-v473-view="order">按单查看</button><button type="button" data-v473-view="person">按同行查看</button>';status.insertAdjacentElement('beforebegin',wrap);
    const panel=document.createElement('section');panel.id='v473PeoplePanel';panel.className='v473-people-panel';panel.hidden=true;status.insertAdjacentElement('afterend',panel);
    let view='order';try{view=sessionStorage.getItem(LOAN_VIEW_KEY_473)||'order';}catch{}
    let query='';try{query=sessionStorage.getItem(LOAN_PERSON_QUERY_473)||'';}catch{}
    const drawPeople=()=>{
      const q=String(query||'').trim().toLowerCase(),filtered=q?rows.filter(r=>r.person.toLowerCase().includes(q)):rows;
      panel.innerHTML=`<div class="v473-people-toolbar"><input id="v473PersonSearch" class="v473-people-search" placeholder="搜索同行姓名" value="${esc473(query)}"></div>${filtered.length?filtered.map((r,i)=>{const danger=r.overdue>0,warn=!danger&&r.soon>0,due=danger?`${r.overdue}单超期`:warn?`${r.soon}单临近到期`:r.nearest<9999?`${Math.max(0,r.nearest)}天后最近到期`:'未设置到期';return `<button type="button" class="v473-person-card ${danger?'danger':warn?'warn':''}" data-v473-person="${i}"><span class="v473-person-main"><span class="v473-person-name"><strong>${esc473(r.person)}</strong><span>${r.loans.length} 单未结</span></span><span class="v473-person-meta">${r.lend?`借出 ${r.lend} 单`:''}${r.lend&&r.borrow?' · ':''}${r.borrow?`调入 ${r.borrow} 单`:''} · ${esc473(due)}</span></span><span class="v473-person-right"><strong>${r.remaining} 件</strong><small>未处理</small></span><span class="v473-person-arrow"><span>查看全部未结记录</span><b>›</b></span></button>`;}).join(''):'<div class="v473-empty">没有找到未结调借人</div>'}`;
      const input=panel.querySelector('#v473PersonSearch');if(input){input.oninput=()=>{query=input.value;try{sessionStorage.setItem(LOAN_PERSON_QUERY_473,query);}catch{}drawPeople();requestAnimationFrame(()=>{const next=panel.querySelector('#v473PersonSearch');if(next){next.focus();try{next.setSelectionRange(query.length,query.length);}catch{}}});};}
      panel.querySelectorAll('[data-v473-person]').forEach(btn=>btn.onclick=()=>{const filteredRows=q?rows.filter(r=>r.person.toLowerCase().includes(q)):rows;openPersonLoans473(filteredRows[Number(btn.dataset.v473Person)||0]);});
    };
    const applyView=()=>{const person=view==='person';status.hidden=person;list.hidden=person;panel.hidden=!person;wrap.querySelectorAll('[data-v473-view]').forEach(b=>b.classList.toggle('active',b.dataset.v473View===view));if(person)drawPeople();};
    wrap.querySelectorAll('[data-v473-view]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.v473View==='person'?'person':'order';try{sessionStorage.setItem(LOAN_VIEW_KEY_473,view);}catch{}applyView();});
    applyView();
  }
  function syncVersion473(){const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 调借人工作台版`;const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;setTimeout(()=>{const f=document.querySelector('.v44-home-foot');if(f)f.textContent=`v${CURRENT} · 调借人工作台版`;},460);}
  function installLoanPeople473(){
    if(window.__mocuiLoanPeople473)return true;if(!window.__mocuiSyncSafety472||typeof window.renderLoans!=='function')return false;
    window.__mocuiLoanPeople473=true;installLoanPeople473Styles();addAfterHook471('renderLoans','v473',()=>{enhanceLoanPeople473().catch(e=>console.warn('[v4.7.3 loan people]',e));syncVersion473();},{awaitAfter:false});
    ['renderDashboard','renderProducts','renderSales','renderReports','renderMore','renderSaleNew','renderLoanFormModal','renderSettings'].forEach(name=>addAfterHook471(name,'v473',syncVersion473,{awaitAfter:false}));
    if(window.appState?.route==='loans')enhanceLoanPeople473().catch(e=>console.warn('[v4.7.3 loan people init]',e));syncVersion473();return true;
  }
  function waitLoanPeople473(){let attempts=0;const tick=()=>{attempts++;if(installLoanPeople473()||attempts>260)return;setTimeout(tick,50);};setTimeout(tick,520);}

  // ===== v4.7.4 搜索统一修正：跨库存 + 分类/备注补索引 =====
  function syncVersion474(){
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 搜索统一修正版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=`v${CURRENT}`;
  }
  function installSearchFix474(){
    if(window.__mocuiSearchFix474)return true;if(!window.__mocuiLoanPeople473)return false;
    window.__mocuiSearchFix474=true;
    ['renderDashboard','renderProducts','renderSales','renderLoans','renderReports','renderMore','renderSaleNew','renderLoanFormModal','renderSettings'].forEach(name=>addAfterHook471(name,'v474',()=>{syncVersion474();if(name==='renderProducts')setTimeout(enhanceProducts464,20);},{awaitAfter:false}));
    document.addEventListener('focusin',e=>{if(e.target?.id==='v455PickerSearch')enhancePicker464();});
    if(window.appState?.route==='products')setTimeout(enhanceProducts464,30);syncVersion474();return true;
  }
  function waitSearchFix474(){let attempts=0;const tick=()=>{attempts++;if(installSearchFix474()||attempts>280)return;setTimeout(tick,50);};setTimeout(tick,560);}

  // ===== v4.7.5 整体稳定修复：更新接管 / 同步入口收紧 / 版本显示统一 =====
  const UPDATE_PENDING_475='mocui_pending_app_update';
  let updateActivating475=false;
  function updateSafe475(){
    const route=String(window.appState?.route||'');
    if(document.querySelector('.cloud-login,#modalRoot .modal-backdrop'))return false;
    if(window.__mocuiProductDirty||window.__mocuiInitialPullPromise||document.documentElement.dataset.initialSync==='pending')return false;
    if(document.documentElement.dataset.localDirty==='1')return false;
    try{if(JSON.parse(localStorage.getItem('mocui_sync_v3_dirty')||'null')?.dirty)return false;}catch{return false;}
    if(['sale-new','pass-deal-new'].includes(route))return false;
    if(document.getElementById('loanForm'))return false;
    const active=document.activeElement;
    if(active?.matches?.('input,textarea,select,[contenteditable="true"]'))return false;
    return true;
  }
  function syncStableLabel475(){
    const foot=document.querySelector('.v44-home-foot');if(foot&&foot.textContent!==`v${CURRENT} · 整体稳定修复版`)foot.textContent=`v${CURRENT} · 整体稳定修复版`;
    const more=document.querySelector('#v44MoreVersion strong');if(more&&more.textContent!==`v${CURRENT}`)more.textContent=`v${CURRENT}`;
    if(window.appState?.route==='settings'){
      document.querySelectorAll('#main .notice').forEach(el=>{if(/版本：v\d/i.test(el.textContent||''))el.innerHTML=el.innerHTML.replace(/版本：v[^·<]+/i,`版本：v${CURRENT} `);});
    }
  }
  function hardenSettings475(){
    if(window.appState?.route!=='settings')return;
    const force=document.getElementById('forceCloudUpload');
    if(force&&window.CloudSync?.incrementalV3){
      force.onclick=null;force.disabled=true;force.textContent='增量同步模式：整库覆盖已停用';
      if(!document.getElementById('v475ForceNotice')){
        const note=document.createElement('div');note.id='v475ForceNotice';note.className='notice warn';note.style.marginTop='8px';
        note.innerHTML='<strong>为什么停用？</strong><br>当前使用增量同步。整库覆盖可能把另一台设备刚产生的新记录一起覆盖。遇到冲突先导出完整 JSON 备份，不要用整库覆盖处理。';
        force.insertAdjacentElement('afterend',note);
      }
    }
    syncStableLabel475();
  }
  function installStability475(){
    if(window.__mocuiStability475)return true;if(!window.__mocuiSearchFix474)return false;
    window.__mocuiStability475=true;
    ['renderDashboard','renderProducts','renderSales','renderLoans','renderReports','renderMore','renderSaleNew','renderLoanFormModal','renderSettings'].forEach(name=>addAfterHook471(name,'v475',()=>{syncStableLabel475();if(name==='renderSettings')hardenSettings475();setTimeout(syncStableLabel475,560);},{awaitAfter:false}));
    addNavigateHook471('after','v475-update',()=>{syncStableLabel475();});
    if(window.appState?.route==='settings')hardenSettings475();syncStableLabel475();setTimeout(syncStableLabel475,620);return true;
  }
  function waitStability475(){let attempts=0;const tick=()=>{attempts++;if(installStability475()||attempts>300)return;setTimeout(tick,50);};setTimeout(tick,610);}

  // ===== PWA 更新机制 =====
  function notify(msg){const t=qs('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),1800);}
  function updateOnlineState(){document.documentElement.dataset.online=navigator.onLine?'yes':'no';let bar=qs('#pwaOfflineBar');if(!navigator.onLine){if(!bar){bar=document.createElement('div');bar.id='pwaOfflineBar';bar.className='pwa-offline-bar';bar.textContent='当前离线：本机数据仍可使用，联网后再同步';document.body.appendChild(bar);}}else if(bar)bar.remove();}
  async function remoteVersion(){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return '';const j=await r.json();return j.channel==='stable'?String(j.version||''):'';}catch{return '';}}
  function waitForWaiting475(reg,timeout=2600){
    return new Promise(resolve=>{
      if(!reg)return resolve(null);if(reg.waiting)return resolve(reg.waiting);
      let done=false,timer=setTimeout(()=>finish(reg.waiting||null),timeout);
      const finish=worker=>{if(done)return;done=true;clearTimeout(timer);resolve(worker||null);};
      const watch=worker=>{if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed')finish(reg.waiting||worker);});};
      watch(reg.installing);reg.addEventListener?.('updatefound',()=>watch(reg.installing),{once:true});
    });
  }
  function armReload475(){
    // Never reload an active ERP session when a new Service Worker takes control.
    // Reload explicitly on the next user-initiated open, preserving unsaved work.
    try{sessionStorage.removeItem('mocui_update_reload_once');}catch{}
    navigator.serviceWorker?.addEventListener('controllerchange',()=>{
      try{localStorage.setItem('mocui_update_ready_for_next_open',CURRENT);}catch{}
    },{once:true});
  }
  async function activateWaiting475(reg,target=''){
    if(!reg?.waiting||updateActivating475)return false;
    if(!updateSafe475()){try{localStorage.setItem(UPDATE_PENDING_475,target||'waiting');}catch{}return false;}
    // 绝不能把本机尚待上传的数据误判成安全的升级时机。
    let syncState=null;try{if(typeof window.CloudSync?.getV3Status==='function')syncState=await window.CloudSync.getV3Status();}catch(e){console.warn('[v4.7.6 update sync guard]',e);}
    let atomicPending=false;try{atomicPending=Boolean(await window.MocuiAtomic479?.hasPending?.());}catch{atomicPending=true;}
    if(!syncState||atomicPending||Number(syncState.outbox||0)>0||Number(syncState.dirty||0)>0||Number(syncState.conflicts||0)>0||!updateSafe475()){try{localStorage.setItem(UPDATE_PENDING_475,target||'waiting');}catch{}return false;}
    updateActivating475=true;try{if(target)sessionStorage.setItem('mocui_update_target',target);armReload475();reg.waiting.postMessage({type:'SKIP_WAITING_MANUAL'});return true;}catch(e){updateActivating475=false;console.warn('[v4.7.5 activate update]',e);return false;}
  }
  async function tryActivatePending475(){
    if(!('serviceWorker' in navigator)||!updateSafe475())return false;
    try{registration=registration||await navigator.serviceWorker.getRegistration('./');if(!registration?.waiting)return false;const target=localStorage.getItem(UPDATE_PENDING_475)||localStorage.getItem('mocui_downloaded_update_target')||'';return activateWaiting475(registration,target);}catch{return false;}
  }
  async function checkForUpdate({force=false}={}){
    if(!('serviceWorker' in navigator)||!navigator.onLine||checking)return false;
    const now=Date.now();if(!force&&now-lastCheck<60000){await tryActivatePending475();return false;}lastCheck=now;checking=true;
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const rv=await remoteVersion();
      if(!rv)return false; // 候选版禁止自动或手动接管到正式 PWA。
      if(registration.waiting){await activateWaiting475(registration,rv);return true;}
      await registration.update();
      if(rv&&rv!==CURRENT){
        localStorage.setItem('mocui_downloaded_update_target',rv);localStorage.setItem(UPDATE_PENDING_475,rv);
        const waiting=await waitForWaiting475(registration);if(waiting)await activateWaiting475(registration,rv);return true;
      }
      await tryActivatePending475();return false;
    }catch(e){console.warn('[v4.7.5 update]',e);return false;}finally{checking=false;}
  }
  async function repairAppCache(){
    if(!navigator.onLine){notify('当前离线，不能刷新应用代码');return;}
    try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mocui-')).map(k=>caches.delete(k)));registration=registration||await navigator.serviceWorker.getRegistration('./');await registration?.update();setTimeout(()=>location.reload(),350);}catch{notify('刷新失败，请稍后再试');}
  }
  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});/* 更新只由用户明确操作触发；返回桌面不主动接管。 */}catch(e){console.warn('PWA service worker registration failed',e);}
  }
  function announceVersion(){
    localStorage.setItem('mocui_last_ui_version',CURRENT);
    try{const pending=localStorage.getItem(UPDATE_PENDING_475);if(pending===CURRENT)localStorage.removeItem(UPDATE_PENDING_475);const downloaded=localStorage.getItem('mocui_downloaded_update_target');if(downloaded===CURRENT)localStorage.removeItem('mocui_downloaded_update_target');}catch{}
    sessionStorage.removeItem('mocui_update_target');sessionStorage.removeItem('mocui_update_ready');
  }

  window.addEventListener('online',updateOnlineState);
  window.addEventListener('offline',updateOnlineState);
  // v4.7.9.3: iPhone 后台恢复只恢复布局，不再触发 SW 更新 / 接管 / 重载。
  // 设置里的手动更新仍可调用 MocuiPWA.checkForUpdate()。
  // v4.7.9.3: 新增渲染兜底。仅在页面内容真正为空时提供人工恢复入口。
  // 不自动 reload、不删除任何本机数据，也不在有表单的页面强制跳转。
  function installResumeGuard4793(){
    let pending=0;
    const check=()=>{
      clearTimeout(pending);
      pending=setTimeout(()=>{
        if(document.hidden)return;
        const app=qs('#app'),main=qs('#main'),boot=qs('#bootScreen');
        if(!app||!main||boot&&!boot.classList.contains('is-ready'))return;
        if(main.children.length||String(main.textContent||'').trim())return;
        main.innerHTML='<div class="notice warn" style="margin:22px 14px;line-height:1.7"><strong>页面暂时没有显示内容</strong><p>请点击下方按钮返回首页。此操作不清除本机数据，也不自动重复加载。</p><button type="button" id="mocuiResumeHome4793" class="btn">返回首页</button></div>';
        const btn=main.querySelector('#mocuiResumeHome4793');
        btn.onclick=()=>{if(typeof window.navigate==='function')window.navigate('dashboard',{}, {reset:true}).catch(err=>notify(err?.message||'返回失败'));};
      },1500);
    };
    window.addEventListener('pageshow',check,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();},{passive:true});
  }
  async function registerExistingOrNew4793(){
    if(!('serviceWorker' in navigator)||document.hidden)return;
    try{
      registration=await navigator.serviceWorker.getRegistration('./');
      // 已安装的 PWA 不在每次打开时重新注册，不产生后台下载风暴。
      if(!registration)await registerSW();
    }catch(e){console.warn('[v4.7.9.3 SW check]',e);}
  }
  window.MocuiPWA={version:CURRENT,checkForUpdate:()=>checkForUpdate({force:true}),repairAppCache};
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();installResumeGuard4793();setTimeout(registerExistingOrNew4793,4500);waitInteraction();waitWorkflow463();waitSearch464();waitProductCards465();waitHomeFocus466();waitContacts467();waitContinuous468();waitPageMemory469();waitGlobalDirect470();waitSyncSafety472();waitLoanPeople473();waitSearchFix474();waitStability475();});
})();
