'use strict';

(function(){
  const VERSION='4.4.9';
  const XHS_DEFAULT_DAYS=15;
  const base={
    renderProducts,renderLoans,renderMore,renderPassDealNew,renderSaleNew,renderSales,
    renderLoanFormModal,openProductForm,openCustomerSelector,syncSaleFormToDraft,saveSale,saleCard,cancelSale,openSaleDetail,
    openModal,closeModal,renderReports,renderProductDetail,navigate,
    renderSettings,renderAuditLogs,renderInventoryHealth,auditActionName
  };

  const $q=(s,r=document)=>r.querySelector(s);
  const $$q=(s,r=document)=>[...r.querySelectorAll(s)];
  const text=v=>String(v??'').trim();
  const num=v=>Number(v||0);
  const money=v=>typeof fmtMoney==='function'?fmtMoney(num(v)):`¥${num(v).toFixed(2)}`;
  const dayMs=86400000;

  function localDay(value=new Date()){
    const d=value instanceof Date?value:new Date(value);
    if(Number.isNaN(d.getTime()))return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(value,days){
    const d=value?new Date(value):new Date();
    if(Number.isNaN(d.getTime()))return localDay(new Date(Date.now()+days*dayMs));
    d.setDate(d.getDate()+Number(days||0));
    return localDay(d);
  }
  function xhsStatus(s){return String(s?.xhsStatus||'pending');}
  function isXhsSale(s){return s?.saleChannel==='xhs';}
  function isXhsPending(s){return isXhsSale(s)&&s.status==='active'&&['pending','returning'].includes(xhsStatus(s));}
  function xhsDueDays(s){
    if(!isXhsPending(s)||!s.xhsConfirmDueDate)return null;
    const due=new Date(`${s.xhsConfirmDueDate}T23:59:59`),today=new Date();today.setHours(0,0,0,0);
    if(Number.isNaN(due.getTime()))return null;
    return Math.ceil((due-today)/dayMs);
  }
  function xhsStateLabel(s){
    if(!isXhsSale(s))return '';
    const st=xhsStatus(s);
    if(s.status==='cancelled'||st==='refunded')return '已退款/取消';
    if(st==='confirmed')return '已确认完成';
    if(st==='returning')return '退款处理中';
    const d=xhsDueDays(s);
    if(d===null)return '待确认';
    if(d<0)return `逾期${Math.abs(d)}天待确认`;
    if(d===0)return '今天确认';
    return `${d}天后确认`;
  }

  function looksLikeXhsCustomer(...values){
    const raw=values.flat(Infinity).map(v=>text(v)).filter(Boolean).join(' ');
    return /(小红书|xiaohongshu|\bxhs\b|红薯)/i.test(raw);
  }
  function setXhsChannelUI(value,{auto=false}={}){
    const d=appState.saleDraft;if(!d)return;
    d.saleChannel=value==='xhs'?'xhs':'normal';
    d._v441ChannelAuto=Boolean(auto&&d.saleChannel==='xhs');
    const hidden=$q('#v44SaleChannel');if(hidden)hidden.value=d.saleChannel;
    $$q('.v441-channel-pill').forEach(btn=>btn.classList.toggle('active',btn.dataset.channel===d.saleChannel));
    const isXhs=d.saleChannel==='xhs';
    $q('#v44XhsDaysGroup')?.classList.toggle('hidden',!isXhs);
    $q('#v44XhsHint')?.classList.toggle('hidden',!isXhs);
    const autoHint=$q('#v441AutoXhsHint');
    if(autoHint){
      autoHint.classList.toggle('hidden',!(isXhs&&d._v441ChannelAuto));
      autoHint.textContent=isXhs&&d._v441ChannelAuto?'已根据客户信息自动识别为小红书订单':''; 
    }
  }
  function autoDetectXhsCustomer(customer=null){
    const d=appState.saleDraft;if(!d||d._v441ChannelManual)return;
    const name=text(customer?.name||$q('#saleCustomer')?.value||d.customerName);
    const note=text(customer?.note);
    const source=text(customer?.source||customer?.channel);
    if(looksLikeXhsCustomer(name,note,source))setXhsChannelUI('xhs',{auto:true});
    else if(d._v441ChannelAuto)setXhsChannelUI('normal',{auto:false});
  }

  // ---------- 语音输入 ----------
  function speechCtor(){return window.SpeechRecognition||window.webkitSpeechRecognition||null;}
  function startVoice(target,{append=false,onDone=null}={}){
    const Ctor=speechCtor();
    if(!Ctor){showToast('当前浏览器未开放网页语音识别，可直接使用 iPhone 键盘麦克风');target?.focus();return;}
    try{
      const r=new Ctor();r.lang='zh-CN';r.interimResults=false;r.continuous=false; r.maxAlternatives=1;
      const old=target?.value||'';
      r.onstart=()=>target?.closest('.v44-voice-wrap')?.classList.add('listening');
      r.onend=()=>target?.closest('.v44-voice-wrap')?.classList.remove('listening');
      r.onerror=()=>{target?.closest('.v44-voice-wrap')?.classList.remove('listening');showToast('语音识别未完成，可改用键盘麦克风');};
      r.onresult=e=>{const said=text(e.results?.[0]?.[0]?.transcript);if(!said)return;target.value=append&&old?`${old}${old.endsWith('，')?'':'，'}${said}`:said;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));onDone?.(said);};
      r.start();
    }catch(_){showToast('语音功能暂时不可用，可使用 iPhone 键盘麦克风');target?.focus();}
  }
  function addVoiceButton(input,{append=false,label='语音输入',onDone=null}={}){
    if(!input||input.dataset.v44Voice==='1')return;
    input.dataset.v44Voice='1';
    const wrap=document.createElement('div');wrap.className='v44-voice-wrap';
    input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);
    const b=document.createElement('button');b.type='button';b.className='v44-mic';b.setAttribute('aria-label',label);b.innerHTML='<span class="v442-mic-icon" aria-hidden="true"></span>';
    b.onclick=e=>{e.preventDefault();e.stopPropagation();startVoice(input,{append,onDone});};
    wrap.appendChild(b);
  }
  function decorateLoanVoice(){
    addVoiceButton($q('#loanPerson'),{label:'语音输入调借人'});
    addVoiceButton($q('#loanNote'),{append:true,label:'语音输入调借备注'});
  }
  function decoratePassVoice(){
    addVoiceButton($q('#passDealItem'),{label:'语音输入货品描述'});
    addVoiceButton($q('#passDealSource'),{label:'语音输入货主'});
    addVoiceButton($q('#passDealBuyer'),{label:'语音输入买家'});
    addVoiceButton($q('#passDealNote'),{append:true,label:'语音输入备注'});
  }

  // ---------- 全局找货 ----------
  function matchQuery(q,fields){
    const query=text(q).toLowerCase();if(!query)return true;
    const hay=fields.flat(Infinity).map(v=>text(v).toLowerCase()).join(' ');
    const terms=query.split(/\s+/).filter(Boolean);
    if(terms.every(t=>hay.includes(t)))return true;
    try{return typeof mocuiFuzzyMatch==='function'&&mocuiFuzzyMatch(query,fields);}catch(_){return false;}
  }
  async function buildGlobalRows(){
    const tasks=[dbAll('products'),dbAll('sales'),dbAll('loans')];
    if(typeof getExternalGoods==='function')tasks.push(getExternalGoods());else tasks.push(Promise.resolve([]));
    if(typeof getPassDeals==='function')tasks.push(getPassDeals());else tasks.push(Promise.resolve([]));
    if(typeof getTradeGalleryLedger==='function')tasks.push(getTradeGalleryLedger());else tasks.push(Promise.resolve({batches:[]}));
    const [products,sales,loans,external,passDeals,gallery]=await Promise.all(tasks);
    const rows=[];
    for(const p of products){rows.push({kind:'product',id:p.id,title:p.name||'未命名商品',meta:`商品 · ${p.code||''} · ${p.color||''} · 库存 ${fmtInt?.(p.stock)??p.stock}`,fields:[p.name,p.code,p.color,p.category,p.note,p.qinsilk?.size,p.size],date:p.updatedAt||p.createdAt,ref:p});}
    for(const s of sales){rows.push({kind:'sale',id:s.id,title:`${s.orderNo||'销售单'} · ${s.customerName||'散客'}`,meta:`销售 · ${money(s.finalAmount)} · ${s.status==='cancelled'?'已撤销':isXhsSale(s)?`小红书 ${xhsStateLabel(s)}`:'有效'}`,fields:[s.orderNo,s.customerName,s.note,s.sourceLoanNo,...(s.items||[]).flatMap(i=>[i.productName,i.productCode,i.color,i.itemNote,i.productNote])],date:s.createdAt,ref:s});}
    for(const l of loans){rows.push({kind:'loan',id:l.id,title:`${l.loanNo||'调借单'} · ${l.person||''}`,meta:`调借 · ${(l.items||[]).length} 种 · ${loanIsOpen(l)?'进行中':'已完成'}`,fields:[l.loanNo,l.person,l.note,...(l.items||[]).flatMap(i=>[i.productName,i.productCode,i.color,i.productNote])],date:l.date||l.createdAt,ref:l});}
    for(const r of external||[]){rows.push({kind:'external',id:r.id,title:`${r.itemName||'外部货'} · ${r.tempNo||''}`,meta:`外部货 · 货主 ${r.ownerName||'-'} · 当前 ${r.currentHolderName||'-'}`,fields:[r.itemName,r.tempNo,r.ownerName,r.currentHolderName,r.buyerName,r.note],date:r.updatedAt||r.createdAt,ref:r});}
    for(const r of passDeals||[]){rows.push({kind:'pass',id:r.id,title:`${r.itemName||'过手货'} · ${r.dealNo||''}`,meta:`过手 · ${r.sourceName||'-'} → ${r.buyerName||'-'} · ${money(r.saleAmount)}`,fields:[r.itemName,r.dealNo,r.sourceName,r.buyerName,r.note],date:r.createdAt,ref:r});}
    if(typeof tradeGalleryFlatRows==='function'){
      for(const {batch,item} of tradeGalleryFlatRows(gallery||{batches:[]})){
        rows.push({kind:'gallery',id:item.id,title:item.itemName||'调货货源图',meta:`货源库 · ${tradeGalleryDealerLabel?.(batch)||batch.dealerName||'待确认来源'} · ${item.price===''?'未录价格':money(item.price)}`,fields:[item.itemName,item.price,item.note,batch.dealerName,batch.note],date:batch.receivedAt||batch.createdAt,ref:{batch,item}});
      }
    }
    return rows.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
  }
  function globalResultHTML(r){
    const icon={product:'货',sale:'售',loan:'调',external:'外',pass:'过',gallery:'图'}[r.kind]||'•';
    return `<button class="v44-search-result" data-kind="${r.kind}" data-id="${esc(r.id)}" type="button"><span class="v44-result-icon">${icon}</span><span class="v44-result-copy"><strong>${esc(r.title)}</strong><small>${esc(r.meta)}</small></span><b>›</b></button>`;
  }
  async function openGlobalSearch(initial=''){
    openModal('全局找货',`<div class="v44-global-modal"><div class="v44-global-search"><input id="v44GlobalQuery" class="input" placeholder="货号、圈口、名称、同行、备注…" value="${esc(initial)}"><button id="v44GlobalMic" class="v44-search-mic" type="button" aria-label="语音搜索"><span class="v442-mic-icon" aria-hidden="true"></span></button></div><div class="v44-search-help">同时搜索：商品、已售记录、调借、外部同行货、过手单、调货货源库</div><div id="v44GlobalResults" class="v44-search-results"><div class="v44-search-loading">正在读取可搜索记录…</div></div></div>`,{full:true,onOpen:async()=>{
      const input=$q('#v44GlobalQuery'),host=$q('#v44GlobalResults');
      $q('#v44GlobalMic').onclick=()=>startVoice(input,{onDone:()=>draw()});
      let rows=[];
      try{rows=await buildGlobalRows();}catch(e){host.innerHTML=`<div class="notice danger">搜索数据读取失败：${esc(e?.message||'未知错误')}</div>`;return;}
      const draw=()=>{const q=input.value;const filtered=q?rows.filter(r=>matchQuery(q,r.fields)).slice(0,80):rows.slice(0,30);host.innerHTML=filtered.length?filtered.map(globalResultHTML).join(''):`<div class="empty"><strong>没有找到</strong><div class="item-meta">可以换货号、圈口、同行姓名或备注关键词试试</div></div>`;$$q('.v44-search-result',host).forEach(btn=>btn.onclick=()=>{const r=rows.find(x=>x.kind===btn.dataset.kind&&x.id===btn.dataset.id);if(!r)return;closeModal();setTimeout(()=>openSearchResult(r),30);});};
      input.oninput=draw;draw();input.focus();
    }});
  }
  function openSearchResult(r){
    if(r.kind==='product')return navigate('product-detail',{id:r.id});
    if(r.kind==='sale')return openSaleDetail(r.ref);
    if(r.kind==='loan')return openLoanDetail(r.id);
    if(r.kind==='external'&&typeof openExternalGoodDetail==='function')return openExternalGoodDetail(r.id);
    if(r.kind==='pass'&&typeof openPassDealDetail==='function')return openPassDealDetail(r.ref);
    if(r.kind==='gallery')return navigate('trade-gallery');
  }
  function searchBarHTML(id='v44PageSearch',placeholder='全局找货：货号、圈口、同行、备注…'){
    return `<div class="v44-page-search v442-searchbar"><button id="${id}" type="button"><span class="v442-search-icon" aria-hidden="true"></span><strong>${placeholder}</strong></button><button class="v44-page-mic" data-for="${id}" type="button" aria-label="语音全局搜索"><span class="v442-mic-icon" aria-hidden="true"></span></button></div>`;
  }
  function bindSearchBar(id='v44PageSearch'){
    const btn=$q('#'+id),mic=$q(`.v44-page-mic[data-for="${id}"]`);if(btn)btn.onclick=()=>openGlobalSearch();
    if(mic)mic.onclick=()=>{const ghost=document.createElement('input');startVoice(ghost,{onDone:q=>openGlobalSearch(q)});};
  }

  // ---------- v4.4.6 首页融合 ----------
  function installHeaderSearch(){
    const actions=$q('.top-actions');
    if(!actions)return;
    let btn=$q('#v446HeaderSearch');
    if(!btn){
      btn=document.createElement('button');
      btn.id='v446HeaderSearch';
      btn.type='button';
      btn.className='v446-header-search';
      btn.setAttribute('aria-label','全局找货');
      btn.innerHTML='<span aria-hidden="true"></span>';
      const badge=$q('#cloudBadge');
      if(badge)actions.insertBefore(btn,badge);else actions.prepend(btn);
      btn.onclick=()=>openGlobalSearch();
    }
    btn.classList.remove('hidden');
  }
  function removeHeaderSearch(){ $q('#v446HeaderSearch')?.classList.add('hidden'); }
  function cleanupLegacyDashboardComposition(){
    const main=$q('#main');if(!main)return;
    [...main.children].forEach(child=>{
      if(child.id==='v446TodayMix'||child.querySelector?.('#v446TodayMix'))return;
      if(text(child.textContent).includes('今日成交构成'))child.remove();
    });
  }
  function v446Icon(label,cls='green'){return `<i class="v446-icon ${cls}" aria-hidden="true">${label}</i>`;}

  async function renderDashboardLite(){
    setHeader('漠翠进销存','找货 · 记货 · 调货 · 看报表');
    installHeaderSearch();
    const tasks=[dbAll('products'),dbAll('sales'),dbAll('loans')];
    tasks.push(typeof getPassDeals==='function'?getPassDeals():Promise.resolve([]));
    tasks.push(typeof getExternalGoods==='function'?getExternalGoods():Promise.resolve([]));
    const [products,sales,loans,passDeals,externalGoods]=await Promise.all(tasks);

    const catalog=products.filter(p=>!p.historicalOnly),activeSales=sales.filter(s=>saleIsReportActive(s));
    const today=localDay(),todayRange=typeof dateRange==='function'?dateRange('today'):null;
    const todaySales=activeSales.filter(s=>String(s.businessDate||s.createdAt||'').slice(0,10)===today);
    const todayPass=(passDeals||[]).filter(r=>{
      if(typeof passDealIsActive==='function'&&!passDealIsActive(r))return false;
      if(todayRange&&typeof recordInBusinessRange==='function')return recordInBusinessRange(r,todayRange,'pass');
      return String(r.createdAt||'').slice(0,10)===today;
    });
    const todayExternal=(typeof externalSoldRowsForRange==='function'&&todayRange)
      ?externalSoldRowsForRange(externalGoods||[],todayRange)
      :(externalGoods||[]).filter(r=>r.status==='sold'&&String(r.businessDate||r.soldAt||'').slice(0,10)===today);

    const formalAmount=todaySales.reduce((a,s)=>a+num(s.finalAmount),0);
    const formalProfit=todaySales.reduce((a,s)=>a+(typeof saleGrossProfit==='function'?num(saleGrossProfit(s)):0),0);
    const passAmount=todayPass.reduce((a,r)=>a+num(r.saleAmount),0);
    const passProfitTotal=todayPass.reduce((a,r)=>a+(typeof passDealProfit==='function'?num(passDealProfit(r)):num(r.saleAmount)-num(r.costAmount)),0);
    const externalAmount=todayExternal.reduce((a,r)=>a+num(r.saleAmount),0);
    const externalProfitTotal=todayExternal.reduce((a,r)=>a+(typeof externalProfit==='function'?num(externalProfit(r)):num(r.saleAmount)-num(r.ownerCostAmount)),0);
    const totalAmount=formalAmount+passAmount+externalAmount;
    const totalProfit=formalProfit+passProfitTotal+externalProfitTotal;
    const totalDeals=todaySales.length+todayPass.length+todayExternal.length;

    const inventoryQty=catalog.reduce((a,p)=>a+num(p.stock),0);
    const openLoans=loans.filter(loanIsOpen),overdue=openLoans.filter(l=>loanOverdueDays(l)>0);
    const pendingXhs=activeSales.filter(isXhsPending),dueXhs=pendingXhs.filter(s=>{const d=xhsDueDays(s);return d!==null&&d<=0;});

    $('#main').innerHTML=`<div class="v44-home v446-home">
      <section id="v446TodayMix" class="v446-mix-card">
        <button id="v446MixAll" class="v446-mix-head" type="button">
          <span class="v446-mix-title">${v446Icon('构','mix')}<span><strong>今日成交构成</strong><small>三套账合计 · 账目分开</small></span></span>
          <span class="v446-mix-total"><small>今日成交总额</small><strong>${money(totalAmount)}</strong></span>
        </button>
        <div class="v446-mix-grid">
          <button id="v446MixFormal" class="v446-mix-item formal" type="button">${v446Icon('账','green')}<span><small>正式 / 调借账</small><strong>${money(formalAmount)}</strong><em>${todaySales.length} 单</em></span></button>
          <button id="v446MixPass" class="v446-mix-item pass" type="button">${v446Icon('过','orange')}<span><small>过手差价账</small><strong>${money(passAmount)}</strong><em>${todayPass.length} 单</em></span></button>
          <button id="v446MixExternal" class="v446-mix-item external" type="button">${v446Icon('同','blue')}<span><small>外部同行货账</small><strong>${money(externalAmount)}</strong><em>${todayExternal.length} 单</em></span></button>
        </div>
      </section>

      <div class="v44-metrics v441-compact-metrics v446-metrics">
        <button class="v44-metric primary-number" id="v44TodaySales"><span>今日成交</span><strong>${money(totalAmount)}</strong><small>${totalDeals} 笔 · 三账合计</small></button>
        <button class="v44-metric primary-number" id="v441TodayProfit"><span>今日利润</span><strong>${money(totalProfit)}</strong><small>三账按已记录成本</small></button>
        <button class="v44-metric" id="v44Inventory"><span>当前库存</span><strong>${fmtInt(inventoryQty)} 件</strong><small>正式商品</small></button>
        <button class="v44-metric ${overdue.length?'attention':''}" id="v44Loans"><span>调出中</span><strong>${openLoans.length} 单</strong><small>${overdue.length?`${overdue.length} 单超期`:'未完成调借'}</small></button>
        <button class="v44-metric" id="v441TodayOrders"><span>今日订单</span><strong>${todaySales.length} 单</strong><small>正式销售</small></button>
        <button class="v44-metric ${dueXhs.length?'attention':''}" id="v44Xhs"><span>小红书待确认</span><strong>${pendingXhs.length} 单</strong><small>${dueXhs.length?`${dueXhs.length} 单到期`:'仅小红书订单'}</small></button>
      </div>

      ${(overdue.length||dueXhs.length)?`<section class="v44-attention v446-attention"><div class="v44-section-title"><strong>需要留意</strong><span>只显示需要处理的事项</span></div>${dueXhs.length?`<button id="v44DueXhs" type="button"><span>小红书订单到确认日</span><b>${dueXhs.length} 单 ›</b></button>`:''}${overdue.length?`<button id="v44OverdueLoans" type="button"><span>调借已超期</span><b>${overdue.length} 单 ›</b></button>`:''}</section>`:''}

      <section class="v446-actions-section"><div class="v44-section-title"><strong>常用操作</strong><span>高频入口</span></div><div class="v44-actions v441-compact-actions v446-actions">
        <button id="v44Sale" class="primary">${v446Icon('售','green')}<span><strong>销售开单</strong><small>普通 / 小红书</small></span><b>›</b></button>
        <button id="v44Product">${v446Icon('货','blue')}<span><strong>新增商品</strong><small>正式商品档案</small></span><b>›</b></button>
        <button id="v44Loan">${v446Icon('调','orange')}<span><strong>新增调借</strong><small>借出 / 调入</small></span><b>›</b></button>
        <button id="v44Pass">${v446Icon('过','purple')}<span><strong>过手单</strong><small>不动库存</small></span><b>›</b></button>
        <button id="v44Content">${v446Icon('文','pink')}<span><strong>内容工作台</strong><small>素材与文案</small></span><b>›</b></button>
        <button id="v44Stocktake">${v446Icon('盘','teal')}<span><strong>库存盘点</strong><small>核对库存</small></span><b>›</b></button>
      </div></section>
      <div class="v44-home-foot">v${VERSION} · 首页融合版</div>
    </div>`;

    $q('#v446MixAll').onclick=()=>navigate('reports');
    $q('#v446MixFormal').onclick=()=>navigate('reports');
    $q('#v446MixPass').onclick=()=>navigate('pass-deals');
    $q('#v446MixExternal').onclick=()=>navigate('external-goods');
    $q('#v44Inventory').onclick=()=>navigate('products');
    $q('#v44Loans').onclick=()=>navigate('loans');
    $q('#v44TodaySales').onclick=()=>navigate('reports');
    $q('#v441TodayProfit').onclick=()=>navigate('reports');
    $q('#v441TodayOrders').onclick=()=>navigate('sales');
    $q('#v44Xhs').onclick=()=>navigate('sales',{xhs:'pending'});
    $q('#v44DueXhs')&&($q('#v44DueXhs').onclick=()=>navigate('sales',{xhs:'pending'}));
    $q('#v44OverdueLoans')&&($q('#v44OverdueLoans').onclick=()=>navigate('loans'));
    $q('#v44Sale').onclick=()=>{appState.saleDraft=null;navigate('sale-new');};
    $q('#v44Product').onclick=()=>openProductForm();
    $q('#v44Loan').onclick=()=>openLoanForm();
    $q('#v44Pass').onclick=()=>navigate('pass-deal-new');
    $q('#v44Content').onclick=()=>navigate('content');
    $q('#v44Stocktake').onclick=()=>navigate('stocktake');
    scheduleNavFix();
    cleanupLegacyDashboardComposition();
    setTimeout(cleanupLegacyDashboardComposition,120);
    setTimeout(cleanupLegacyDashboardComposition,500);
  }
  renderDashboard=renderDashboardLite;
  window.addEventListener('mocui-analytics-ready',()=>{if(appState?.route==='dashboard')setTimeout(cleanupLegacyDashboardComposition,0);});
  window.addEventListener('mocui-analytics-updated',()=>{if(appState?.route==='dashboard')setTimeout(cleanupLegacyDashboardComposition,0);});

  // ---------- 页面搜索 + 统一视觉 ----------
  renderProducts=async function(){await base.renderProducts.apply(this,arguments);const main=$q('#main');if(main&&!$q('#v44ProductsSearch')){main.insertAdjacentHTML('afterbegin',searchBarHTML('v44ProductsSearch','全局找货：也能搜已售、调借、过手记录'));bindSearchBar('v44ProductsSearch');}scheduleNavFix();};
  renderLoans=async function(){await base.renderLoans.apply(this,arguments);const main=$q('#main');if(main&&!$q('#v44LoansSearch')){main.insertAdjacentHTML('afterbegin',searchBarHTML('v44LoansSearch','搜商品、调借人、历史调货记录'));bindSearchBar('v44LoansSearch');}scheduleNavFix();};
  renderPassDealNew=async function(){await base.renderPassDealNew.apply(this,arguments);decoratePassVoice();};
  renderLoanFormModal=async function(){const r=await base.renderLoanFormModal.apply(this,arguments);decorateLoanVoice();return r;};
  function ensurePrimaryNav(){
    const labels={dashboard:'首页',products:'货品',loans:'调借',reports:'报表',more:'更多'};
    $$q('.bottom-nav .nav-item').forEach(btn=>{const b=btn.querySelector('b');if(b&&labels[btn.dataset.route])b.textContent=labels[btn.dataset.route];});
  }
  function scheduleNavFix(){requestAnimationFrame(ensurePrimaryNav);setTimeout(ensurePrimaryNav,80);}

  function normalizePageBack(){
    const back=$q('#pageBack');if(!back)return;
    if(back.dataset.v443Normalized==='1')return;
    back.dataset.v443Normalized='1';
    back.innerHTML='<span class="v443-back-chevron" aria-hidden="true">‹</span><span>返回</span>';
  }
  function syncRouteChrome(){
    document.body.dataset.mocuiRoute=String(appState?.route||'');
    normalizePageBack();
    ensurePrimaryNav();
    if(appState?.route==='dashboard')installHeaderSearch();else removeHeaderSearch();
  }

  // v4.4.3：统一路由 UI 状态。只包一层 navigate，不改路由栈和业务逻辑。
  navigate=async function(...args){
    const r=await base.navigate.apply(this,args);
    syncRouteChrome();
    return r;
  };

  renderMore=async function(){
    setHeader('更多','常用工具与数据维护');
    const groups=[
      ['常用工具',[
        ['customers','客','客户','客户资料与拿货记录'],
        ['sales','单','销售单','查看、撤销与恢复销售'],
        ['trade-gallery','货','货源','同行图片与报价记录'],
        ['stocktake','盘','盘点','核对正式商品库存']
      ]],
      ['数据与维护',[
        ['ledger','流','库存流水','查看库存增减记录'],
        ['content','文','内容工作台','素材、文案与发布'],
        ['qinsilk-import','导','秦丝导入','历史数据导入'],
        ['health','检','库存体检','只读核对库存与流水'],
        ['audit','记','操作日志','查看关键修改记录'],
        ['settings','设','设置','云端、备份与安全']
      ]]
    ];
    $('#main').innerHTML=`<div class="v442-more">${groups.map(([title,items])=>`<section class="v442-more-section"><div class="v442-more-title">${esc(title)}</div><div class="v442-more-grid">${items.map(x=>`<button type="button" class="v442-more-card" data-route="${x[0]}"><span class="v442-more-icon">${x[1]}</span><span><strong>${x[2]}</strong><small>${x[3]}</small></span><b>›</b></button>`).join('')}</div></section>`).join('')}<div id="v44MoreVersion" class="v44-version"><strong>v${VERSION}</strong><span>轻量正式版 · 自动更新</span></div></div>`;
    $$q('.v442-more-card').forEach(btn=>btn.onclick=()=>navigate(btn.dataset.route));
    scheduleNavFix();
  };

  // ---------- v4.4.8 正式销售报表：实时账本口径 ----------
  function v448ReportRange(key,start='',end=''){
    const now=new Date(),dayStart=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()),dayEnd=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
    let a,b=dayEnd(now);
    if(key==='today')a=dayStart(now);
    else if(key==='yesterday'){const d=new Date(now);d.setDate(d.getDate()-1);a=dayStart(d);b=dayEnd(d);}
    else if(key==='7d'){const d=new Date(now);d.setDate(d.getDate()-6);a=dayStart(d);}
    else if(key==='30d'){const d=new Date(now);d.setDate(d.getDate()-29);a=dayStart(d);}
    else if(key==='month')a=new Date(now.getFullYear(),now.getMonth(),1);
    else if(key==='year')a=new Date(now.getFullYear(),0,1);
    else if(key==='custom'){a=start?new Date(start+'T00:00:00'):new Date(0);b=end?new Date(end+'T23:59:59.999'):dayEnd(now);}
    else {a=new Date(0);b=new Date(8640000000000000);}
    return {start:a,end:b};
  }
  function v448SaleDate(s){
    const raw=String(s?.businessDate||s?.createdAt||'').trim();if(!raw)return null;
    const d=/^\d{4}-\d{2}-\d{2}$/.test(raw)?new Date(raw+'T12:00:00'):new Date(raw);
    return Number.isNaN(d.getTime())?null:d;
  }
  function v448Historical(s){return Boolean(s?.importedHistorical||s?.sourceType==='qinsilk_history'||(s?.source==='qinsilk'&&String(s?.sourceKey||'').startsWith('qinsilk:')));}
  function v448ActiveSale(s){return typeof saleIsReportActive==='function'?saleIsReportActive(s):s?.status==='active'&&!s?.excludedFromReports;}
  function v448SaleCost(s){return typeof saleCostTotal==='function'?num(saleCostTotal(s)):(s?.items||[]).reduce((a,i)=>a+num(i.costPrice)*num(i.qty),0)+num(s?.accessoryCost)+num(s?.otherDirectCost);}
  function v448SaleProfit(s){return typeof saleGrossProfit==='function'?num(saleGrossProfit(s)):num(s?.finalAmount)-v448SaleCost(s);}
  function v448ReportRows(sales,range){return (sales||[]).filter(v448ActiveSale).filter(s=>{const d=v448SaleDate(s);return d&&d>=range.start&&d<=range.end;});}
  function v448CustomerTable(rows){
    const map=new Map();
    for(const s of rows){const k=s.customerName||'散客',x=map.get(k)||{name:k,orders:0,qty:0,amount:0};x.orders++;x.qty+=(s.items||[]).reduce((a,i)=>a+num(i.qty),0);x.amount+=num(s.finalAmount);map.set(k,x);}
    const list=[...map.values()].sort((a,b)=>b.amount-a.amount).slice(0,50);
    return list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>排名</th><th>客户</th><th>订单</th><th>拿货数</th><th>交易额</th></tr></thead><tbody>${list.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${x.orders}</td><td>${typeof fmtInt==='function'?fmtInt(x.qty):x.qty}</td><td>${money(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">暂无客户销售数据</div>';
  }
  function v448ProductTable(rows){
    const map=new Map();
    for(const s of rows)for(const i of s.items||[]){const k=i.productId||i.productName,x=map.get(k)||{name:i.productName||'未命名商品',qty:0};x.qty+=num(i.qty);map.set(k,x);}
    const list=[...map.values()].sort((a,b)=>b.qty-a.qty).slice(0,50);
    return list.length?`<div class="table-wrap"><table class="table"><thead><tr><th>排名</th><th>商品</th><th>销量</th></tr></thead><tbody>${list.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${typeof fmtInt==='function'?fmtInt(x.qty):x.qty}</td></tr>`).join('')}</tbody></table></div>`:'<div class="notice">暂无商品销售数据</div>';
  }
  async function v448DrawFormalReport(key='30d',customStart='',customEnd=''){
    const [sales,products]=await Promise.all([dbAll('sales'),dbAll('products')]);
    const range=v448ReportRange(key,customStart,customEnd),rows=v448ReportRows(sales,range),catalog=(products||[]).filter(p=>!p.historicalOnly);
    const revenue=rows.reduce((a,s)=>a+num(s.finalAmount),0),cost=rows.reduce((a,s)=>a+v448SaleCost(s),0),profit=rows.reduce((a,s)=>a+v448SaleProfit(s),0),qtySold=rows.reduce((a,s)=>a+(s.items||[]).reduce((b,i)=>b+num(i.qty),0),0),discount=rows.reduce((a,s)=>a+num(s.discountAmount),0);
    let received=0,due=0,over=0;
    for(const s of rows){const finalAmount=Math.max(0,num(s.finalAmount));if(v448Historical(s)){received+=finalAmount;continue;}const got=Math.max(0,num(s.received));received+=got;due+=Math.max(0,finalAmount-got);over+=Math.max(0,got-finalAmount);}
    const inventoryQty=catalog.reduce((a,p)=>a+num(p.stock),0),inventoryCost=catalog.reduce((a,p)=>a+num(p.stock)*num(p.costPrice),0),rate=revenue?profit/revenue*100:0;
    const settleHint=`待收 ${money(due)}${over>0.005?` · 多收 ${money(over)}`:''}`;
    $q('#v448ReportBody').innerHTML=`<div class="notice"><strong>统计口径：</strong>销售统计读取正式销售账本；库存汇总实时读取正式商品库。历史秦丝销售按成交额视为已收。</div>
      <div class="section-title">正式销售概况</div><div class="grid-2"><div class="metric"><div class="label">销售额</div><div class="value">${money(revenue)}</div><div class="hint">${rows.length} 笔订单</div></div><div class="metric"><div class="label">毛利润</div><div class="value">${money(profit)}</div><div class="hint">毛利率 ${rate.toFixed(1)}%</div></div><div class="metric"><div class="label">本期实收</div><div class="value">${money(received)}</div><div class="hint">${settleHint}</div></div><div class="metric"><div class="label">销售数量</div><div class="value">${typeof fmtInt==='function'?fmtInt(qtySold):qtySold}</div></div></div>
      <div class="section-title">成本拆分</div><div class="grid-3"><div class="metric compact"><div class="label">商品/销售成本</div><div class="value">${money(cost)}</div></div><div class="metric compact"><div class="label">优惠抹零</div><div class="value">${money(discount)}</div></div><div class="metric compact"><div class="label">单均金额</div><div class="value">${money(rows.length?revenue/rows.length:0)}</div></div></div>
      <div class="section-title">库存汇总</div><div class="grid-3"><div class="metric compact"><div class="label">商品数量</div><div class="value">${catalog.length}</div></div><div class="metric compact"><div class="label">库存总数</div><div class="value">${typeof fmtInt==='function'?fmtInt(inventoryQty):inventoryQty}</div></div><div class="metric compact"><div class="label">库存成本</div><div class="value">${money(inventoryCost)}</div></div></div>
      <div class="section-title">客户排名</div>${v448CustomerTable(rows)}<div class="section-title">商品销量排名</div>${v448ProductTable(rows)}
      <button id="v448Export" class="btn secondary block" style="margin-top:12px">导出当前销售报表 CSV</button>`;
    const ex=$q('#v448Export');if(ex)ex.onclick=()=>{if(typeof exportSalesCSV==='function')exportSalesCSV(rows);};
  }
  renderReports=async function(){
    setHeader('统计报表','经营数据');
    $q('#main').innerHTML=`<div class="segment" id="v448ReportRange"><button data-k="today">今天</button><button data-k="yesterday">昨天</button><button data-k="7d">7天</button><button data-k="30d" class="active">30天</button><button data-k="month">本月</button><button data-k="year">今年</button><button data-k="all">全部</button><button data-k="custom">自定义</button></div><div id="v448ReportBody"><div class="notice">正在读取正式账本…</div></div><button id="v448LegacyReports" class="btn secondary block" style="margin-top:12px">过手差价 / 外部货 / 经营助手</button>`;
    let key='30d',cs='',ce='';
    const draw=()=>v448DrawFormalReport(key,cs,ce);
    await draw();
    $$q('#v448ReportRange button').forEach(btn=>btn.onclick=async()=>{if(btn.dataset.k==='custom'){const s=prompt('开始日期 YYYY-MM-DD',cs),e=prompt('结束日期 YYYY-MM-DD',ce);if(s===null||e===null)return;cs=s;ce=e;}key=btn.dataset.k;$$q('#v448ReportRange button').forEach(x=>x.classList.toggle('active',x===btn));await draw();});
    const legacy=$q('#v448LegacyReports');if(legacy)legacy.onclick=async()=>{await base.renderReports.apply(this,arguments);scheduleNavFix();};
    scheduleNavFix();
  };

  function normalizeModalChrome(){
    const close=$q('#modalRoot .modal-close');
    if(!close)return;
    const raw=text(close.textContent);
    if(raw.includes('返回')||close.classList.contains('text-close')){
      close.textContent='返回';close.classList.add('v442-modal-back');close.classList.remove('v442-modal-x');
    }else{
      close.textContent='×';close.classList.add('v442-modal-x');close.classList.remove('v442-modal-back');
    }
  }
  openModal=function(){
    const r=base.openModal.apply(this,arguments);
    document.body.classList.add('v443-modal-open');
    requestAnimationFrame(()=>{normalizeModalChrome();normalizePageBack();});
    return r;
  };
  closeModal=function(){
    const r=base.closeModal.apply(this,arguments);
    requestAnimationFrame(()=>{if(!$q('#modalRoot .modal-backdrop'))document.body.classList.remove('v443-modal-open');});
    return r;
  };


  // ---------- 商品表单：保留子分类保护 + 备注语音 ----------
  function installProductCategoryGuard(){
    const form=$q('#productForm');
    if(!form||form.dataset.v443CategoryGuard==='1')return;
    form.dataset.v443CategoryGuard='1';

    const label=$$q('.form-label',form).find(el=>text(el.textContent)==='分类'||text(el.textContent)==='分类 *');
    if(label)label.textContent='分类 *';

    const picker=$q('#productCategoryPicker',form);
    if(picker&&!$q('.v443-category-help',form)){
      const help=document.createElement('div');
      help.className='v443-category-help';
      help.textContent='必须选择具体子分类，一级分类不能直接保存商品。';
      picker.insertAdjacentElement('afterend',help);
    }

    form.addEventListener('submit',async e=>{
      const id=text($q('#productCategoryId',form)?.value);
      const cats=await dbAll('categories');
      const node=cats.find(c=>String(c.id)===id);
      if(!node?.parentId){
        e.preventDefault();e.stopImmediatePropagation();
        showToast('请选择具体子分类后再保存');
        picker?.classList.add('v443-category-required');
        setTimeout(()=>picker?.classList.remove('v443-category-required'),1000);
        picker?.click();
      }
    },true);
  }

  openProductForm=async function(){
    const r=await base.openProductForm.apply(this,arguments);
    setTimeout(()=>{
      installProductCategoryGuard();
      const note=$q('#productForm textarea[name="note"], #productForm textarea');
      addVoiceButton(note,{append:true,label:'语音输入商品备注'});
      normalizeModalChrome();
    },0);
    return r;
  };


  // ---------- 商品详情：只补调借历史，不重复销售历史 ----------
  async function appendProductLoanHistory(){
    if(appState?.route!=='product-detail')return;
    const main=$q('#main'),productId=appState?.params?.id;
    if(!main||!productId||$q('#v443ProductLoans'))return;
    const loans=await dbAll('loans');
    const rows=[];
    for(const loan of loans||[]){
      const item=(loan.items||[]).find(i=>i.productId===productId);
      if(!item)continue;
      let remaining=0;
      try{remaining=loanItemRemaining(loan,item);}catch(_){remaining=Math.max(0,num(item.qty)-num(item.returnedQty)-num(item.soldQty));}
      rows.push({loan,item,remaining});
    }
    rows.sort((a,b)=>new Date(b.loan.date||b.loan.createdAt)-new Date(a.loan.date||a.loan.createdAt));
    if(!rows.length)return;

    const section=document.createElement('section');
    section.id='v443ProductLoans';
    section.className='v443-product-loans';
    section.innerHTML=`<div class="section-title">调借记录 <small>${rows.length} 笔</small></div><div class="v443-loan-history">${rows.slice(0,12).map(({loan,item,remaining})=>{
      const open=typeof loanIsOpen==='function'?loanIsOpen(loan):loan.status!=='returned';
      const dir=loan.type==='lend'?'借出给':'调入自';
      return `<button type="button" class="v443-loan-row" data-id="${esc(loan.id)}"><span><strong>${dir}：${esc(loan.person||'未填写')}</strong><small>${esc(loan.loanNo||'')} · ${fmtDateTime(loan.date||loan.createdAt)}</small></span><span><b>${fmtInt(item.qty)} 件</b><small>${open?`未处理 ${fmtInt(remaining)}`:'已完成'}</small></span></button>`;
    }).join('')}</div>`;
    const inventoryTitle=$$q('.section-title',main).find(el=>text(el.textContent).includes('库存流水'));
    if(inventoryTitle)inventoryTitle.insertAdjacentElement('beforebegin',section);else main.appendChild(section);
    $$q('.v443-loan-row',section).forEach(btn=>btn.onclick=()=>openLoanDetail(btn.dataset.id));
  }

  renderProductDetail=async function(){
    const r=await base.renderProductDetail.apply(this,arguments);
    // 防御性清理：旧版本页面如果残留业务增强区，也不要重复展示销售历史。
    $$q('.mocui-product-relations').forEach(el=>el.remove());
    await appendProductLoanHistory();
    syncRouteChrome();
    return r;
  };


  // ---------- 维护页收尾：版本、日志、体检 ----------
  const v443AuditNames={
    'sale.receive':'补收销售款',
    'sale.xhs_pending':'小红书订单待确认',
    'sale.xhs_confirm':'小红书订单确认完成',
    'sale.xhs_returning':'小红书退款处理中',
    'ledger.baseline':'建立账本基准线',
    'stock.ledger_reconcile':'库存流水校准',
    'pass.receive':'过手单补收',
    'pass.pay_source':'支付过手货主',
    'external.receive':'外部货补收',
    'external.owner_pay':'支付外部货主'
  };
  auditActionName=function(action){
    const key=text(action);
    if(v443AuditNames[key])return v443AuditNames[key];
    return base.auditActionName(key);
  };

  renderAuditLogs=async function(){
    await base.renderAuditLogs.apply(this,arguments);
    const list=$q('#auditList');
    if(list)list.classList.add('v443-audit-clean');
    const search=$q('#auditSearch');
    if(search)search.placeholder='操作、商品、单号';
  };

  renderInventoryHealth=async function(){
    await base.renderInventoryHealth.apply(this,arguments);
    const card=$q('.v41-safety-card');
    if(card){
      const title=$q('.card-title',card);
      if(title)title.textContent='核心账本一致性检查';
      if(!$q('.v443-core-version',card)){
        const note=document.createElement('div');
        note.className='v443-core-version';
        note.textContent=`核心账本 v4.1.4 · 当前应用 v${VERSION}`;
        title?.insertAdjacentElement('afterend',note);
      }
    }
  };

  renderSettings=async function(){
    await base.renderSettings.apply(this,arguments);
    const main=$q('#main');if(!main)return;

    // “同步版本”是云端修订号，不是应用版本。
    const firstMetric=$q('.card .metric .label',main);
    if(firstMetric&&text(firstMetric.textContent)==='同步版本')firstMetric.textContent='云端修订号';

    // 当前数据量里的商品记录包含历史/隐藏档案，避免和货品页在售数量混淆。
    const cards=$$q(':scope > .card',main);
    const countCard=cards.find(c=>text($q('.card-title',c)?.textContent)==='当前数据量');
    if(countCard){
      const label=$q('.metric .label',countCard);if(label)label.textContent='商品记录';
      if(!$q('.v443-count-note',countCard)){
        const note=document.createElement('div');note.className='v443-count-note';
        note.textContent='商品记录包含历史/隐藏档案；货品页显示的是当前正式商品。';
        countCard.appendChild(note);
      }
    }

    // 老版本说明只代表历史开发阶段，统一替换为“应用版本 / 核心账本版本”。
    const notices=$$q(':scope > .notice',main);
    const versionNotice=notices.find(n=>text(n.textContent).startsWith('版本：'));
    if(versionNotice){
      versionNotice.classList.add('v443-version-note');
      versionNotice.innerHTML=`<strong>应用版本 v${VERSION}</strong><br><span>核心账本 v4.1.4 · 销售 / 库存 / 调借事务层保持冻结</span><br><span>Cloudflare D1 + R2 云端 · IndexedDB 本机缓存</span>`;
    }

    const force=$q('#forceCloudUpload');
    if(force){force.classList.add('v443-danger-sync');force.textContent='高级操作：本机数据覆盖云端';}
  };

  // ---------- 小红书销售缓冲 ----------
  syncSaleFormToDraft=function(){
    base.syncSaleFormToDraft.apply(this,arguments);
    const d=appState.saleDraft;if(!d)return;
    if(!d._v441ChannelManual&&looksLikeXhsCustomer(d.customerName))d.saleChannel='xhs';
    const channel=$q('#v44SaleChannel'),days=$q('#v44XhsDays');
    if(channel){channel.value=d.saleChannel||channel.value||'normal';d.saleChannel=channel.value;}
    if(days)d.xhsConfirmDays=Number(days.value)||XHS_DEFAULT_DAYS;
  };

  function injectSaleChannel(){
    const d=appState.saleDraft;if(!d||$q('#v44SaleChannel'))return;
    const customerCard=$q('#saleCustomer')?.closest('.card')||$q('#main .card');if(!customerCard)return;
    if(!d.saleChannel)d.saleChannel=looksLikeXhsCustomer(d.customerName)?'xhs':'normal';
    const box=document.createElement('div');box.className='v44-sale-channel v441-sale-channel';box.innerHTML=`
      <div class="v441-channel-row">
        <div>
          <label class="form-label">销售渠道</label>
          <div class="v441-channel-pills">
            <button type="button" class="v441-channel-pill" data-channel="normal">普通销售</button>
            <button type="button" class="v441-channel-pill" data-channel="xhs">小红书订单</button>
          </div>
          <input id="v44SaleChannel" type="hidden" value="${esc(d.saleChannel||'normal')}">
        </div>
        <div class="form-group" id="v44XhsDaysGroup">
          <label class="form-label">确认提醒</label>
          <select id="v44XhsDays" class="select compact-select"><option value="10">10天</option><option value="15">15天</option><option value="20">20天</option><option value="30">30天</option></select>
        </div>
      </div>
      <div id="v441AutoXhsHint" class="v441-auto-xhs hidden"></div>
      <div id="v44XhsHint" class="field-help">小红书订单正常扣库存；到期后只需要确认完成。已发货退款要等实物退回后再恢复库存。</div>`;
    customerCard.appendChild(box);
    const channel=$q('#v44SaleChannel'),days=$q('#v44XhsDays'),customerInput=$q('#saleCustomer');
    days.value=String(d.xhsConfirmDays||XHS_DEFAULT_DAYS);
    $$q('.v441-channel-pill').forEach(btn=>btn.onclick=()=>{
      d._v441ChannelManual=true;d._v441ChannelAuto=false;
      channel.value=btn.dataset.channel;setXhsChannelUI(channel.value,{auto:false});
    });
    days.onchange=()=>{d.xhsConfirmDays=Number(days.value)||XHS_DEFAULT_DAYS;};
    if(customerInput){
      const detect=()=>{d.customerName=customerInput.value.trim();autoDetectXhsCustomer();};
      customerInput.addEventListener('input',detect);
      customerInput.addEventListener('change',detect);
      customerInput.addEventListener('blur',detect);
    }
    setXhsChannelUI(d.saleChannel,{auto:Boolean(d._v441ChannelAuto)});
    autoDetectXhsCustomer();
  }

  // 选择历史客户时，如果客户姓名/备注带“小红书 / XHS”，自动切换渠道。
  openCustomerSelector=async function(callback){
    return base.openCustomerSelector(c=>{
      callback(c);
      setTimeout(()=>autoDetectXhsCustomer(c),0);
    });
  };

  renderSaleNew=async function(){await base.renderSaleNew.apply(this,arguments);injectSaleChannel();};

  saveSale=async function(){
    syncSaleFormToDraft();const draft=appState.saleDraft,channel=draft?.saleChannel||'normal',days=Number(draft?.xhsConfirmDays)||XHS_DEFAULT_DAYS;
    const receivedInput=$q('#received');
    if(draft&&receivedInput&&typeof calcSaleTotals==='function'){
      const due=Math.max(0,num(calcSaleTotals(draft)?.finalAmount)),received=num(receivedInput.value);
      if(received>due+0.005){const msg=`本次实收 ${money(received)} 高于应收 ${money(due)}，请核对后再保存。`;if(typeof showFieldValidation==='function')showFieldValidation(msg,receivedInput);else showToast(msg);return;}
    }
    await base.saveSale.apply(this,arguments);
    const id=draft?.__coreSaleId;if(!id)return;
    const sale=await dbGet('sales',id).catch(()=>null);if(!sale)return;
    if(channel==='xhs'){
      sale.saleChannel='xhs';sale.xhsStatus=sale.xhsStatus||'pending';sale.xhsConfirmDays=days;sale.xhsConfirmDueDate=sale.xhsConfirmDueDate||addDays(sale.createdAt||new Date(),days);sale.xhsUpdatedAt=nowISO();sale.updatedAt=nowISO();await dbPut('sales',sale);await writeAudit('sale.xhs_pending','sale',sale.id,`${sale.orderNo} · 小红书待确认 · ${sale.xhsConfirmDueDate}`,null,{saleChannel:'xhs',xhsStatus:sale.xhsStatus,xhsConfirmDueDate:sale.xhsConfirmDueDate});if(appState.route==='sales')await renderSales();
    }
  };

  saleCard=function(s){
    let html=base.saleCard(s);if(!isXhsSale(s))return html;
    const st=xhsStatus(s),label=xhsStateLabel(s),cls=st==='confirmed'?'success':st==='returning'?'warn':s.status==='cancelled'?'danger':(xhsDueDays(s)!==null&&xhsDueDays(s)<=0)?'danger':'warn';
    html=html.replace('class="card sale-card"',`class="card sale-card v44-xhs-sale v44-xhs-${st}"`);
    let actions='';
    if(s.status==='active'&&st==='pending')actions=`<div class="v44-xhs-actions"><button class="btn small success xhs-confirm" data-id="${esc(s.id)}" type="button">确认完成</button><button class="btn small secondary xhs-refund" data-id="${esc(s.id)}" type="button">退款/取消</button></div>`;
    if(s.status==='active'&&st==='returning')actions=`<div class="v44-xhs-actions"><button class="btn small danger xhs-returned" data-id="${esc(s.id)}" type="button">已收到退货 · 取消销售</button></div>`;
    const extra=`<div class="v44-xhs-strip"><span class="badge ${cls}">小红书 · ${esc(label)}</span>${s.xhsConfirmDueDate&&s.status==='active'&&st==='pending'?`<small>确认日 ${esc(s.xhsConfirmDueDate)}</small>`:''}</div>${actions}`;
    const i=html.lastIndexOf('</div>');return i>=0?html.slice(0,i)+extra+html.slice(i):html+extra;
  };

  async function confirmXhs(id){const s=await dbGet('sales',id);if(!s||!isXhsSale(s)||s.status!=='active')return;s.xhsStatus='confirmed';s.xhsConfirmedAt=nowISO();s.xhsUpdatedAt=nowISO();s.updatedAt=nowISO();await dbPut('sales',s);await writeAudit('sale.xhs_confirm','sale',s.id,`${s.orderNo} 小红书订单确认完成`,null,{xhsStatus:'confirmed'});showToast('已确认完成');await renderSales();}
  async function markXhsReturning(id){const s=await dbGet('sales',id);if(!s||s.status!=='active')return;s.xhsStatus='returning';s.xhsRefundRequestedAt=nowISO();s.xhsUpdatedAt=nowISO();s.updatedAt=nowISO();await dbPut('sales',s);await writeAudit('sale.xhs_returning','sale',s.id,`${s.orderNo} 小红书退款处理中`,null,{xhsStatus:'returning'});showToast('已标记退款处理中，库存暂不恢复');await renderSales();}
  async function cancelXhs(id,finalStatus='refunded'){
    await cancelSale(id);const s=await dbGet('sales',id);if(!s||s.status!=='cancelled')return;s.xhsStatus=finalStatus;s.xhsRefundCompletedAt=nowISO();s.xhsUpdatedAt=nowISO();s.updatedAt=nowISO();await dbPut('sales',s);if(appState.route==='sales')await renderSales();
  }
  function openXhsRefundChoice(id){openModal('小红书退款 / 取消',`<div class="v44-refund-choice"><div class="notice warn"><strong>库存恢复规则</strong><br>如果货已经发出，不要因为客户申请退款就先恢复库存；等实物真正退回来再取消销售。</div><button id="v44UnshippedCancel" class="btn secondary block" type="button">未发货 · 直接取消销售并恢复库存</button><button id="v44Returning" class="btn block" type="button">已发货 · 先标记“退款处理中”</button></div>`,{onOpen:()=>{$q('#v44UnshippedCancel').onclick=async()=>{closeModal();setTimeout(()=>cancelXhs(id,'refunded'),30);};$q('#v44Returning').onclick=async()=>{closeModal();await markXhsReturning(id);};}});}

  renderSales=async function(){
    await base.renderSales.apply(this,arguments);
    const seg=$q('#saleStatus');if(seg&&!$q('#v44XhsTab')){const b=document.createElement('button');b.id='v44XhsTab';b.textContent='小红书待确认';b.title='这里只显示小红书渠道且尚未确认完成的订单';seg.appendChild(b);b.onclick=async()=>{const sales=(await dbAll('sales')).filter(s=>!s.excludedFromReports&&isXhsPending(s)).sort((a,b)=>new Date(a.xhsConfirmDueDate||a.createdAt)-new Date(b.xhsConfirmDueDate||b.createdAt));$$q('#saleStatus button').forEach(x=>x.classList.toggle('active',x===b));$q('#salesList').innerHTML=sales.length?sales.map(saleCard).join(''):`<div class="empty"><strong>暂无小红书待确认订单</strong><div class="item-meta">普通销售不会出现在这里</div></div>`;};}
    const list=$q('#salesList');if(list&&!list.dataset.v44XhsDelegated){list.dataset.v44XhsDelegated='1';list.addEventListener('click',e=>{const c=e.target.closest('.xhs-confirm'),r=e.target.closest('.xhs-refund'),ret=e.target.closest('.xhs-returned');if(c){e.preventDefault();e.stopPropagation();confirmXhs(c.dataset.id);}if(r){e.preventDefault();e.stopPropagation();openXhsRefundChoice(r.dataset.id);}if(ret){e.preventDefault();e.stopPropagation();cancelXhs(ret.dataset.id,'refunded');}});}
    if(appState.params?.xhs==='pending')$q('#v44XhsTab')?.click();
  };

  openSaleDetail=function(s){base.openSaleDetail(s);if(!isXhsSale(s))return;const body=$q('#modalRoot .modal-body');if(!body)return;const panel=document.createElement('div');panel.className='v44-xhs-detail';panel.innerHTML=`<div><strong>小红书订单</strong><span class="badge ${xhsStatus(s)==='confirmed'?'success':xhsStatus(s)==='returning'?'warn':'warn'}">${esc(xhsStateLabel(s))}</span></div>${s.xhsConfirmDueDate?`<small>确认提醒：${esc(s.xhsConfirmDueDate)}</small>`:''}`;body.prepend(panel);};

  // 让恢复后的小红书撤销单仍保留渠道身份，但重新进入待确认。
  const baseRestore=typeof restoreSale==='function'?restoreSale:null;
  if(baseRestore){restoreSale=async function(id){await baseRestore(id);const s=await dbGet('sales',id);if(s?.saleChannel==='xhs'&&s.status==='active'){s.xhsStatus='pending';s.xhsConfirmDueDate=addDays(nowISO(),Number(s.xhsConfirmDays)||XHS_DEFAULT_DAYS);s.xhsUpdatedAt=nowISO();await dbPut('sales',s);if(appState.route==='sales')await renderSales();}};}

  // ---------- 启动 ----------
  syncRouteChrome();
  setTimeout(syncRouteChrome,120);setTimeout(syncRouteChrome,650);
  window.addEventListener('pageshow',syncRouteChrome,{passive:true});
  window.MocuiLite443={version:VERSION,openGlobalSearch,startVoice,isXhsPending,autoDetectXhsCustomer};
})();
