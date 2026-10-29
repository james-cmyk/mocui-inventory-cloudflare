'use strict';
(()=>{
  const CURRENT='4.6.3';
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
    }catch(e){console.warn('[v4.6.3 update]',e);return false;}finally{checking=false;}
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
  document.addEventListener('DOMContentLoaded',()=>{updateOnlineState();announceVersion();registerSW();waitInteraction();waitWorkflow463();});
})();
