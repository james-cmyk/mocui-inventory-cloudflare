'use strict';
(()=>{
  const CURRENT='4.6.7';
  const VERSION_URL='./version.json';
  let registration=null,checking=false,lastCheck=0;
  const qs=s=>document.querySelector(s);

  // ===== v4.6.1 本机优先极速启动（保留） =====
  function installFastCloudStart(CloudSync){
    if(!CloudSync||CloudSync.__mocuiFastStartV461)return;
    const originalBootstrap=CloudSync.bootstrap?.bind(CloudSync);
    const originalPull=CloudSync.pull?.bind(CloudSync);
    const originalSchedule=CloudSync.schedule?.bind(CloudSync);
    if(!originalBootstrap||!originalPull)return;
    let authGate=null,queuedSchedule=false,queuedDelay=1000;
    CloudSync.bootstrap=(options={})=>{
      if(!authGate){
        authGate=Promise.resolve()
          .then(()=>originalBootstrap({...options,deferPull:true}))
          .then(value=>({ok:true,value}),error=>({ok:false,error}));
      }
      return Promise.resolve({mode:'local-first',deferred:true});
    };
    CloudSync.pull=async(...args)=>{
      if(authGate){
        const gate=authGate,result=await gate;
        if(authGate===gate)authGate=null;
        if(!result.ok)throw result.error;
        if(queuedSchedule&&originalSchedule){
          const d=queuedDelay;queuedSchedule=false;queuedDelay=1000;
          setTimeout(()=>originalSchedule(d),0);
        }
      }
      return originalPull(...args);
    };
    if(originalSchedule){
      CloudSync.schedule=(delay=1000)=>{
        if(authGate){queuedSchedule=true;queuedDelay=Math.min(queuedDelay,Number(delay)||1000);return;}
        return originalSchedule(delay);
      };
    }
    Object.defineProperty(CloudSync,'__mocuiFastStartV461',{value:true,configurable:false});
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

  function wrapRender(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v462Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{after?.();}catch(e){console.warn(`[v4.6.2 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v462Wrapped',{value:true});
    window[name]=wrapped;
    try{globalThis[name]=wrapped;}catch{}
  }

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

  function wrap463(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v463Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{after?.();}catch(e){console.warn(`[v4.6.3 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v463Wrapped',{value:true});window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
  }
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
    const flat=fields.flat(Infinity).filter(v=>v!==undefined&&v!==null).map(v=>String(v));
    const hay=compact464(flat.join(' '));
    const ts=tokens464(query);
    if(ts.length&&ts.every(t=>hay.includes(t)))return true;
    const qcode=codeCanon464(query);
    if(qcode.length>=2&&flat.some(v=>{const c=codeCanon464(v);return c&&c.includes(qcode);} ))return true;
    // 单字/双字仍允许宽松查找，方便柜台快速找货；更长关键词要求词组命中，减少误匹配。
    if(qc.length===1)return hay.includes(qc);
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
  async function productMap464(){
    try{const rows=await window.dbAll?.('products');return new Map((rows||[]).map(p=>[String(p.id),p]));}catch{return new Map();}
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
    input.placeholder='名称 / 货号尾号 / 颜色';input.setAttribute('enterkeyhint','search');
    if(input.dataset.v464Smart==='1'){setTimeout(reorderProductList464,220);return;}
    input.dataset.v464Smart='1';let timer=null;
    const queue=()=>{clearTimeout(timer);timer=setTimeout(reorderProductList464,230);};
    input.addEventListener('input',queue);input.addEventListener('search',queue);input.addEventListener('compositionend',queue);
    document.getElementById('stockFilter')?.addEventListener('change',queue);
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
    const root=document.getElementById('v455TradePicker'),input=root?.querySelector('#v455PickerSearch'),list=root?.querySelector('#v455PickerList');if(!root||!input||!list)return;
    input.placeholder='名称 / 货号尾号 / 颜色';input.setAttribute('enterkeyhint','search');
    const map=await productMap464();
    const reorder=()=>{
      const q=input.value.trim(),recent=loadRecent464(),recentPos=new Map(recent.map((id,i)=>[id,i]));
      const nodes=[...list.querySelectorAll('.v455-picker-row')];
      nodes.sort((a,b)=>{
        const sa=a.classList.contains('is-selected')?0:1,sb=b.classList.contains('is-selected')?0:1;if(sa!==sb)return sa-sb;
        const pa=map.get(String(a.dataset.id)),pb=map.get(String(b.dataset.id));
        if(q){const ra=productRank464(pa,q),rb=productRank464(pb,q);if(ra!==rb)return ra-rb;}
        else{const ia=recentPos.has(String(a.dataset.id))?recentPos.get(String(a.dataset.id)):999,ib=recentPos.has(String(b.dataset.id))?recentPos.get(String(b.dataset.id)):999;if(ia!==ib)return ia-ib;}
        const aa=Number(pa?.stock||0)>0?0:1,bb=Number(pb?.stock||0)>0?0:1;return aa-bb;
      }).forEach(n=>list.appendChild(n));
    };
    if(input.dataset.v464Smart!=='1'){
      input.dataset.v464Smart='1';let t=null;const queue=()=>{clearTimeout(t);t=setTimeout(reorder,30);};
      input.addEventListener('input',queue);input.addEventListener('search',queue);input.addEventListener('compositionend',queue);
    }
    const confirm=root.querySelector('#v455PickerConfirm');
    if(confirm&&confirm.dataset.v464Recent!=='1'){
      confirm.dataset.v464Recent='1';
      confirm.addEventListener('click',()=>{const ids=[...root.querySelectorAll('.v455-picker-row.is-selected')].map(x=>x.dataset.id).filter(Boolean);if(ids.length)rememberRecent464(ids);},true);
    }
    setTimeout(reorder,35);
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
  function wrap464(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v464Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{after?.();}catch(e){console.warn(`[v4.6.4 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v464Wrapped',{value:true});window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
  }
  function installSearch464(){
    if(window.__mocuiSearch464)return true;
    if(typeof window.renderProducts!=='function'||typeof window.renderDashboard!=='function')return false;
    window.__mocuiSearch464=true;installSmartMatcher464();listRecentProductClicks464();
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
  function wrap465(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v465Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{after?.();}catch(e){console.warn(`[v4.6.5 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v465Wrapped',{value:true});window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
  }
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
    let sales=[],loans=[],logs=[];
    try{[sales,loans,logs]=await Promise.all([window.dbAll('sales'),window.dbAll('loans'),window.dbAll('auditLogs')]);}catch(e){console.warn('[v4.6.6 home data]',e);return;}
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
    const supported=(logs||[]).filter(x=>['sale','loan','product'].includes(String(x.entityType||''))||/^(sale|loan|product|stock)\./.test(String(x.action||''))).sort((a,b)=>timeValue466(b.createdAt)-timeValue466(a.createdAt)).slice(0,4);
    if(supported.length){
      const sec=document.createElement('section');sec.id='v466Recent';sec.className='v466-section';sec.innerHTML=`<div class="v466-head"><strong>最近操作</strong><span>最多显示 4 条</span></div><div class="v466-recent-list">${supported.map((x,i)=>`<button type="button" class="v466-recent" data-v466-recent="${i}"><span class="v466-recent-icon">${auditIcon466(String(x.entityType||''),String(x.action||''))}</span><span class="v466-recent-copy"><strong>${esc466(auditLabel466(String(x.action||'')))}</strong><small>${esc466(x.summary||x.entityId||'')}</small></span><span class="v466-recent-time">${relativeTime466(x.createdAt)}</span></button>`).join('')}</div>`;
      home.insertBefore(sec,actions||home.lastElementChild);
      sec.querySelectorAll('[data-v466-recent]').forEach(btn=>btn.onclick=()=>{const x=supported[Number(btn.dataset.v466Recent)||0];if(!x)return;const type=String(x.entityType||''),id=String(x.entityId||'');if(type==='product'&&id)window.navigate?.('product-detail',{id});else if(type==='loan'&&id&&typeof window.openLoanDetail==='function')window.openLoanDetail(id);else if(type==='loan')window.navigate?.('loans');else if(type==='sale')window.navigate?.('sales',{highlight:id});});
    }
    const foot=document.querySelector('.v44-home-foot');if(foot)foot.textContent=`v${CURRENT} · 快捷联系人版`;
  }
  function scheduleDashboard466(){
    const run=()=>enhanceDashboard466().catch(e=>console.warn('[v4.6.6 dashboard]',e));
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:160});else setTimeout(run,0);
  }
  function wrap466(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v466Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{after?.();}catch(e){console.warn(`[v4.6.6 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v466Wrapped',{value:true});window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
  }
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
  function wrap467(name,after){
    const fn=window[name];if(typeof fn!=='function'||fn.__v467Wrapped)return;
    const wrapped=async function(){const r=await fn.apply(this,arguments);try{await after?.();}catch(e){console.warn(`[v4.6.7 ${name}]`,e);}return r;};
    Object.defineProperty(wrapped,'__v467Wrapped',{value:true});window[name]=wrapped;try{globalThis[name]=wrapped;}catch{}
  }
  function installContacts467(){
    if(window.__mocuiContacts467)return true;if(typeof window.renderSaleNew!=='function'||typeof window.renderLoanFormModal!=='function')return false;
    window.__mocuiContacts467=true;installContacts467Styles();wrap467('renderSaleNew',enhanceSaleContacts467);wrap467('renderLoanFormModal',enhanceLoanContacts467);
    ['renderDashboard','renderProducts','renderLoans','renderSales','renderReports','renderMore'].forEach(name=>wrap467(name,()=>{const more=document.querySelector('#v44MoreVersion strong');if(more)more.textContent=CURRENT;}));
    if(window.appState?.route==='sale-new')enhanceSaleContacts467();else if(document.getElementById('loanForm'))enhanceLoanContacts467();return true;
  }
  function waitContacts467(){let attempts=0;const tick=()=>{attempts++;if(installContacts467()||attempts>160)return;setTimeout(tick,50);};setTimeout(tick,260);}

  // ===== PWA 更新机制 =====
  function notify(msg){const t=qs('#toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.remove('show'),1800);}
  function updateOnlineState(){document.documentElement.dataset.online=navigator.onLine?'yes':'no';let bar=qs('#pwaOfflineBar');if(!navigator.onLine){if(!bar){bar=document.createElement('div');bar.id='pwaOfflineBar';bar.className='pwa-offline-bar';bar.textContent='当前离线：本机数据仍可使用，联网后再同步';document.body.appendChild(bar);}}else if(bar)bar.remove();}
  async function remoteVersion(){try{const r=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)return '';const j=await r.json();return String(j.version||'');}catch{return '';}}
  async function checkForUpdate({force=false}={}){
    if(!('serviceWorker' in navigator)||!navigator.onLine||checking)return false;
    const now=Date.now();if(!force&&now-lastCheck<60000)return false;lastCheck=now;checking=true;
    try{
      registration=registration||await navigator.serviceWorker.getRegistration('./')||await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});
      const rv=await remoteVersion();
      if(rv&&rv!==CURRENT){localStorage.setItem('mocui_downloaded_update_target',rv);await registration.update();return true;}
      await registration.update();return false;
    }catch(e){console.warn('[v4.6.7 update]',e);return false;}finally{checking=false;}
  }
  async function repairAppCache(){
    if(!navigator.onLine){notify('当前离线，不能刷新应用代码');return;}
    try{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mocui-')).map(k=>caches.delete(k)));registration=registration||await navigator.serviceWorker.getRegistration('./');await registration?.update();setTimeout(()=>location.reload(),350);}catch{notify('刷新失败，请稍后再试');}
  }
  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{registration=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});setTimeout(()=>checkForUpdate({force:true}),800);}catch(e){console.warn('PWA service worker registration failed',e);}
  }
  function announceVersion(){localStorage.setItem('mocui_last_ui_version',CURRENT);localStorage.removeItem('mocui_pending_app_update');sessionStorage.removeItem('mocui_update_target');sessionStorage.removeItem('mocui_update_ready');sessionStorage.removeItem('mocui_update_reload_once');}

  window.addEventListener('online',()=>{updateOnlineState();checkForUpdate({force:true});});
  window.addEventListener('offline',updateOnlineState);
  window.addEventListener('pageshow',()=>checkForUpdate());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkForUpdate();});
  window.MocuiPWA={version:CURRENT,checkForUpdate:()=>checkForUpdate({force:true}),repairAppCache};
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();registerSW();waitInteraction();waitWorkflow463();waitSearch464();waitProductCards465();waitHomeFocus466();waitContacts467();});
})();
