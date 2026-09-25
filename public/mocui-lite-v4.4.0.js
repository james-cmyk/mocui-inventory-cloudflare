'use strict';

(function(){
  const VERSION='4.4.0';
  const XHS_DEFAULT_DAYS=15;
  const base={
    renderProducts,renderLoans,renderMore,renderPassDealNew,renderSaleNew,renderSales,
    renderLoanFormModal,openProductForm,syncSaleFormToDraft,saveSale,saleCard,cancelSale,openSaleDetail
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
    const b=document.createElement('button');b.type='button';b.className='v44-mic';b.setAttribute('aria-label',label);b.innerHTML='<span>●</span>';
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
    openModal('全局找货',`<div class="v44-global-modal"><div class="v44-global-search"><input id="v44GlobalQuery" class="input" placeholder="货号、圈口、名称、同行、备注…" value="${esc(initial)}"><button id="v44GlobalMic" class="v44-search-mic" type="button" aria-label="语音搜索">●</button></div><div class="v44-search-help">同时搜索：商品、已售记录、调借、外部同行货、过手单、调货货源库</div><div id="v44GlobalResults" class="v44-search-results"><div class="v44-search-loading">正在读取可搜索记录…</div></div></div>`,{full:true,onOpen:async()=>{
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
    return `<div class="v44-page-search"><button id="${id}" type="button"><span>⌕</span><strong>${placeholder}</strong></button><button class="v44-page-mic" data-for="${id}" type="button" aria-label="语音全局搜索">●</button></div>`;
  }
  function bindSearchBar(id='v44PageSearch'){
    const btn=$q('#'+id),mic=$q(`.v44-page-mic[data-for="${id}"]`);if(btn)btn.onclick=()=>openGlobalSearch();
    if(mic)mic.onclick=()=>{const ghost=document.createElement('input');startVoice(ghost,{onDone:q=>openGlobalSearch(q)});};
  }

  // ---------- 轻量首页 ----------
  async function renderDashboardLite(){
    setHeader('漠翠进销存','找货 · 记货 · 调货 · 看报表');
    const [products,sales,loans]=await Promise.all([dbAll('products'),dbAll('sales'),dbAll('loans')]);
    const catalog=products.filter(p=>!p.historicalOnly),activeSales=sales.filter(s=>saleIsReportActive(s));
    const today=localDay(),todaySales=activeSales.filter(s=>String(s.businessDate||s.createdAt||'').slice(0,10)===today);
    const inventoryQty=catalog.reduce((a,p)=>a+num(p.stock),0),inventoryCost=catalog.reduce((a,p)=>a+num(p.stock)*num(p.costPrice),0);
    const openLoans=loans.filter(loanIsOpen),overdue=openLoans.filter(l=>loanOverdueDays(l)>0);
    const pendingXhs=activeSales.filter(isXhsPending),dueXhs=pendingXhs.filter(s=>{const d=xhsDueDays(s);return d!==null&&d<=0;});
    const todayAmount=todaySales.reduce((a,s)=>a+num(s.finalAmount),0);
    $('#main').innerHTML=`<div class="v44-home">${searchBarHTML('v44HomeSearch','搜货号、圈口、名称、同行、历史记录')}
      <div class="v44-metrics">
        <button class="v44-metric" id="v44Inventory"><span>当前库存</span><strong>${fmtInt(inventoryQty)} 件</strong><small>成本 ${money(inventoryCost)}</small></button>
        <button class="v44-metric ${overdue.length?'attention':''}" id="v44Loans"><span>调出中</span><strong>${openLoans.length} 单</strong><small>${overdue.length?`${overdue.length} 单超期`:'当前未完成调借'}</small></button>
        <button class="v44-metric" id="v44TodaySales"><span>今日成交</span><strong>${money(todayAmount)}</strong><small>${todaySales.length} 笔正式销售</small></button>
        <button class="v44-metric ${dueXhs.length?'attention':''}" id="v44Xhs"><span>小红书待确认</span><strong>${pendingXhs.length} 单</strong><small>${dueXhs.length?`${dueXhs.length} 单已到确认日`:'默认15天后提醒'}</small></button>
      </div>
      ${(overdue.length||dueXhs.length)?`<section class="v44-attention"><div class="v44-section-title"><strong>需要留意</strong><span>只显示真正需要处理的事项</span></div>${dueXhs.length?`<button id="v44DueXhs" type="button"><span>小红书订单到确认日</span><b>${dueXhs.length} 单 ›</b></button>`:''}${overdue.length?`<button id="v44OverdueLoans" type="button"><span>调借已超期</span><b>${overdue.length} 单 ›</b></button>`:''}</section>`:''}
      <section><div class="v44-section-title"><strong>常用操作</strong><span>每天真正会用的入口</span></div><div class="v44-actions">
        <button id="v44Sale" class="primary"><span>销售开单</span><small>正式库存 · 可选小红书缓冲</small></button>
        <button id="v44Product"><span>新增商品</span><small>建立正式商品档案</small></button>
        <button id="v44Loan"><span>新增调借</span><small>借出 / 正式调入</small></button>
        <button id="v44Pass"><span>过手单</span><small>不建商品 · 不动库存</small></button>
        <button id="v44Content"><span>内容工作台</span><small>图片视频 · 文案 · 发布</small></button>
        <button id="v44Stocktake"><span>库存盘点</span><small>核对正式商品库存</small></button>
      </div></section>
      <div class="v44-home-foot">v${VERSION} · 轻量正式版</div>
    </div>`;
    bindSearchBar('v44HomeSearch');
    $q('#v44Inventory').onclick=()=>navigate('products');$q('#v44Loans').onclick=()=>navigate('loans');$q('#v44TodaySales').onclick=()=>navigate('sales');$q('#v44Xhs').onclick=()=>navigate('sales',{xhs:'pending'});
    $q('#v44DueXhs')&&($q('#v44DueXhs').onclick=()=>navigate('sales',{xhs:'pending'}));$q('#v44OverdueLoans')&&($q('#v44OverdueLoans').onclick=()=>navigate('loans'));
    $q('#v44Sale').onclick=()=>{appState.saleDraft=null;navigate('sale-new');};$q('#v44Product').onclick=()=>openProductForm();$q('#v44Loan').onclick=()=>openLoanForm();$q('#v44Pass').onclick=()=>navigate('pass-deal-new');$q('#v44Content').onclick=()=>navigate('content');$q('#v44Stocktake').onclick=()=>navigate('stocktake');
  }
  renderDashboard=renderDashboardLite;

  // ---------- 页面搜索 + 统一视觉 ----------
  renderProducts=async function(){await base.renderProducts.apply(this,arguments);const main=$q('#main');if(!main||$q('#v44ProductsSearch'))return;main.insertAdjacentHTML('afterbegin',searchBarHTML('v44ProductsSearch','全局找货：也能搜已售、调借、过手记录'));bindSearchBar('v44ProductsSearch');};
  renderLoans=async function(){await base.renderLoans.apply(this,arguments);const main=$q('#main');if(main&&!$q('#v44LoansSearch')){main.insertAdjacentHTML('afterbegin',searchBarHTML('v44LoansSearch','搜商品、调借人、历史调货记录'));bindSearchBar('v44LoansSearch');}};
  renderPassDealNew=async function(){await base.renderPassDealNew.apply(this,arguments);decoratePassVoice();};
  renderLoanFormModal=async function(){const r=await base.renderLoanFormModal.apply(this,arguments);decorateLoanVoice();return r;};
  renderMore=async function(){await base.renderMore.apply(this,arguments);const main=$q('#main');if(main&&!$q('#v44MoreVersion'))main.insertAdjacentHTML('beforeend',`<div id="v44MoreVersion" class="v44-version"><strong>v${VERSION}</strong><span>轻量正式版 · 自动更新</span></div>`);};

  // ---------- 商品表单语音：仅备注，避免误填价格 ----------
  openProductForm=async function(){const r=await base.openProductForm.apply(this,arguments);setTimeout(()=>{const note=$q('#productForm textarea[name="note"], #productForm textarea');addVoiceButton(note,{append:true,label:'语音输入商品备注'});},0);return r;};

  // ---------- 小红书销售缓冲 ----------
  syncSaleFormToDraft=function(){base.syncSaleFormToDraft.apply(this,arguments);const d=appState.saleDraft;if(!d)return;const channel=$q('#v44SaleChannel'),days=$q('#v44XhsDays');if(channel)d.saleChannel=channel.value;if(days)d.xhsConfirmDays=Number(days.value)||XHS_DEFAULT_DAYS;};

  function injectSaleChannel(){
    const d=appState.saleDraft;if(!d||$q('#v44SaleChannel'))return;
    const customer=$q('#saleCustomer')?.closest('.card')||$q('#main .card');if(!customer)return;
    const box=document.createElement('div');box.className='v44-sale-channel';box.innerHTML=`<div class="form-row"><div class="form-group"><label class="form-label">销售渠道</label><select id="v44SaleChannel" class="select"><option value="normal" ${(d.saleChannel||'normal')==='normal'?'selected':''}>普通销售</option><option value="xhs" ${d.saleChannel==='xhs'?'selected':''}>小红书订单</option></select></div><div class="form-group" id="v44XhsDaysGroup"><label class="form-label">确认提醒</label><select id="v44XhsDays" class="select"><option value="10">10天后</option><option value="15">15天后</option><option value="20">20天后</option><option value="30">30天后</option></select></div></div><div id="v44XhsHint" class="field-help">小红书订单保存后正常扣库存；到期提醒你确认完成。如果发生退款，已发货的订单要等实物退回后再恢复库存。</div>`;
    customer.appendChild(box);const channel=$q('#v44SaleChannel'),days=$q('#v44XhsDays');days.value=String(d.xhsConfirmDays||XHS_DEFAULT_DAYS);
    const refresh=()=>{$q('#v44XhsDaysGroup').classList.toggle('hidden',channel.value!=='xhs');$q('#v44XhsHint').classList.toggle('hidden',channel.value!=='xhs');d.saleChannel=channel.value;d.xhsConfirmDays=Number(days.value)||XHS_DEFAULT_DAYS;};channel.onchange=refresh;days.onchange=refresh;refresh();
  }
  renderSaleNew=async function(){await base.renderSaleNew.apply(this,arguments);injectSaleChannel();};

  saveSale=async function(){
    syncSaleFormToDraft();const draft=appState.saleDraft,channel=draft?.saleChannel||'normal',days=Number(draft?.xhsConfirmDays)||XHS_DEFAULT_DAYS;
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
    await base.cancelSale(id);const s=await dbGet('sales',id);if(!s||s.status!=='cancelled')return;s.xhsStatus=finalStatus;s.xhsRefundCompletedAt=nowISO();s.xhsUpdatedAt=nowISO();s.updatedAt=nowISO();await dbPut('sales',s);if(appState.route==='sales')await renderSales();
  }
  function openXhsRefundChoice(id){openModal('小红书退款 / 取消',`<div class="v44-refund-choice"><div class="notice warn"><strong>库存恢复规则</strong><br>如果货已经发出，不要因为客户申请退款就先恢复库存；等实物真正退回来再取消销售。</div><button id="v44UnshippedCancel" class="btn secondary block" type="button">未发货 · 直接取消销售并恢复库存</button><button id="v44Returning" class="btn block" type="button">已发货 · 先标记“退款处理中”</button></div>`,{onOpen:()=>{$q('#v44UnshippedCancel').onclick=async()=>{closeModal();setTimeout(()=>cancelXhs(id,'refunded'),30);};$q('#v44Returning').onclick=async()=>{closeModal();await markXhsReturning(id);};}});}

  renderSales=async function(){
    await base.renderSales.apply(this,arguments);
    const seg=$q('#saleStatus');if(seg&&!$q('#v44XhsTab')){const b=document.createElement('button');b.id='v44XhsTab';b.textContent='小红书待确认';seg.appendChild(b);b.onclick=async()=>{const sales=(await dbAll('sales')).filter(s=>!s.excludedFromReports&&isXhsPending(s)).sort((a,b)=>new Date(a.xhsConfirmDueDate||a.createdAt)-new Date(b.xhsConfirmDueDate||b.createdAt));$$q('#saleStatus button').forEach(x=>x.classList.toggle('active',x===b));$q('#salesList').innerHTML=sales.length?sales.map(saleCard).join(''):`<div class="empty"><strong>暂无小红书待确认订单</strong></div>`;};}
    const list=$q('#salesList');if(list&&!list.dataset.v44XhsDelegated){list.dataset.v44XhsDelegated='1';list.addEventListener('click',e=>{const c=e.target.closest('.xhs-confirm'),r=e.target.closest('.xhs-refund'),ret=e.target.closest('.xhs-returned');if(c){e.preventDefault();e.stopPropagation();confirmXhs(c.dataset.id);}if(r){e.preventDefault();e.stopPropagation();openXhsRefundChoice(r.dataset.id);}if(ret){e.preventDefault();e.stopPropagation();cancelXhs(ret.dataset.id,'refunded');}});}
    if(appState.params?.xhs==='pending')$q('#v44XhsTab')?.click();
  };

  openSaleDetail=function(s){base.openSaleDetail(s);if(!isXhsSale(s))return;const body=$q('#modalRoot .modal-body');if(!body)return;const panel=document.createElement('div');panel.className='v44-xhs-detail';panel.innerHTML=`<div><strong>小红书订单</strong><span class="badge ${xhsStatus(s)==='confirmed'?'success':xhsStatus(s)==='returning'?'warn':'warn'}">${esc(xhsStateLabel(s))}</span></div>${s.xhsConfirmDueDate?`<small>确认提醒：${esc(s.xhsConfirmDueDate)}</small>`:''}`;body.prepend(panel);};

  // 让恢复后的小红书撤销单仍保留渠道身份，但重新进入待确认。
  const baseRestore=typeof restoreSale==='function'?restoreSale:null;
  if(baseRestore){restoreSale=async function(id){await baseRestore(id);const s=await dbGet('sales',id);if(s?.saleChannel==='xhs'&&s.status==='active'){s.xhsStatus='pending';s.xhsConfirmDueDate=addDays(nowISO(),Number(s.xhsConfirmDays)||XHS_DEFAULT_DAYS);s.xhsUpdatedAt=nowISO();await dbPut('sales',s);if(appState.route==='sales')await renderSales();}};}

  // ---------- 启动 ----------
  window.MocuiLite440={version:VERSION,openGlobalSearch,startVoice,isXhsPending};
})();
