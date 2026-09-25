'use strict';

(function(){
  const VERSION='4.3.1';
  const baseRenderDashboard430=renderDashboard;
  const baseRenderMore430=renderMore;
  const baseRenderProducts430=renderProducts;

  function safeText(v){return String(v??'');}
  function money430(v){return typeof fmtMoney==='function'?fmtMoney(Number(v)||0):`¥${(Number(v)||0).toFixed(2)}`;}

  function ensureNav430(){
    const nav=document.querySelector('.bottom-nav');if(!nav)return;
    const target=[
      {route:'dashboard',label:'首页',icon:'/assets/icons/navigation/ic_nav_home.png'},
      {route:'products',label:'货品',icon:'/assets/icons/navigation/ic_nav_products.png'},
      {route:'loans',label:'调货',icon:'/assets/icons/navigation/ic_nav_lending.png'},
      {route:'customers',label:'往来',icon:'/assets/icons/actions/ic_action_customers.png'},
      {route:'more',label:'更多',icon:'/assets/icons/navigation/ic_nav_more.png'},
    ];
    const current=appState?.route||'dashboard';
    nav.innerHTML=target.map(x=>`<button data-route="${x.route}" class="nav-item ${x.route===current?'active':''}"><span><img src="${x.icon}" alt="" /></span><b>${x.label}</b></button>`).join('');
    $$('.bottom-nav .nav-item').forEach(btn=>btn.onclick=()=>navigate(btn.dataset.route));
  }

  async function compactDashboard430(){
    if(appState.route!=='dashboard')return;
    ensureNav430();
    const main=$('#main');if(!main)return;
    const oldWeekly=$('#weekly425Dashboard'),oldCapital=$('#capital426Dashboard');
    let weekly=null,capital=null;
    try{weekly=await window.MocuiWeeklyReview425?.collect?.();}catch(_){ }
    try{capital=await window.MocuiCapital426?.collect?.();}catch(_){ }
    oldWeekly?.remove();oldCapital?.remove();
    if($('#formal430BusinessPanel'))return;
    const meaningful=(weekly?.alerts||[]).filter(a=>a.level!=='data');
    const critical=meaningful.filter(a=>a.level==='critical').length;
    const revenue=weekly?.current?.revenue||0,margin=weekly?.current?.margin;
    const owned=capital?.totalOwnedCost||0,recv=capital?.receivable||0,slow=capital?.slowValue||0;
    const sec=document.createElement('section');sec.id='formal430BusinessPanel';sec.className='formal430-business-panel';
    sec.innerHTML=`<div class="formal430-section-head"><div><strong>经营分析</strong><span>需要时再看，不占用今日工作台</span></div><button id="formal430Reports" type="button">报表 ›</button></div><div class="formal430-analysis-grid"><button id="formal430Weekly" class="${critical?'critical':meaningful.length?'attention':''}" type="button"><span>近7天复盘</span><strong>${meaningful.length?`${meaningful.length} 项提醒`:'暂无主要异常'}</strong><small>${meaningful.length?safeText(meaningful.slice(0,2).map(x=>x.title).join(' · ')):`成交 ${money430(revenue)}${margin===null||margin===undefined?'':` · 毛利率 ${(margin*100).toFixed(1)}%`}`}</small></button><button id="formal430Capital" type="button"><span>资金结构</span><strong>自有货 ${money430(owned)}</strong><small>待收 ${money430(recv)} · 慢动 ${money430(slow)}</small></button></div>`;
    const anchor=$('#daily424Dashboard')||$('#workflow42DailyPanel');
    if(anchor)anchor.insertAdjacentElement('afterend',sec);else main.prepend(sec);
    $('#formal430Weekly').onclick=()=>window.MocuiWeeklyReview425?.open?.(meaningful.length?'alerts':'overview');
    $('#formal430Capital').onclick=()=>window.MocuiCapital426?.open?.();
    $('#formal430Reports').onclick=()=>navigate('reports');

    const badge=document.createElement('div');badge.id='formal430VersionBadge';badge.className='formal430-version-badge';badge.textContent='v4.3.1 · 启动修复版';main.appendChild(badge);
  }

  function removeMoreDuplicates430(){
    ['quick422MoreTools','settle423MoreEntry','daily424MoreEntry','weekly425More','capital426More','content427MoreEntry'].forEach(id=>document.getElementById(id)?.remove());
    // 底部已有“往来”，这里不重复占一行。
    document.querySelector('.more-item[data-route="customers"]')?.remove();
  }

  function moreRow430(id,icon,title,meta){return `<div id="${id}" class="list-item clickable formal430-more-row"><div class="thumb placeholder">${icon}</div><div class="item-main"><div class="item-title">${title}</div><div class="item-meta">${meta}</div></div><div>›</div></div>`;}

  async function formalizeMore430(){
    if(appState.route!=='more')return;ensureNav430();removeMoreDuplicates430();
    const main=$('#main');if(!main||$('#formal430MoreDaily'))return;
    const daily=document.createElement('section');daily.id='formal430MoreDaily';daily.className='more-group formal430-more-group';daily.innerHTML=`<div class="more-group-title">常用操作</div><div class="list">${moreRow430('formal430QuickCreate','＋','极速建档','拍照 + 一句话，先生成草稿再确认')}${moreRow430('formal430QuickSearch','⌕','全局找货','库存、已售、调借、外部货、过手记录一起搜')}${moreRow430('formal430Settlement','¥','收付款与对账','待收、待付、分次结算和按人对账')}${moreRow430('formal430DailyClose','日','每日收尾','成交、现金、货品去向和明日重点一次核对')}</div>`;
    const analysis=document.createElement('section');analysis.id='formal430MoreAnalysis';analysis.className='more-group formal430-more-group';analysis.innerHTML=`<div class="more-group-title">经营分析</div><div class="list">${moreRow430('formal430ReportsMore','表','经营报表','成交、利润、品类和客户数据')}${moreRow430('formal430WeeklyMore','周','周复盘与异常提醒','账龄、慢动、调出时间、毛利率变化')}${moreRow430('formal430CapitalMore','资','资金占用与补货观察','自有货成本、慢动库存、90天品类结构')}</div>`;
    const content=document.createElement('section');content.id='formal430MoreContent';content.className='more-group formal430-more-group';content.innerHTML=`<div class="more-group-title">内容</div><div class="list">${moreRow430('formal430Content','文','商品内容联动','商品档案 → 事实卡 → 朋友圈 / 同行 / 小红书')}</div>`;
    const system=document.createElement('section');system.id='formal430MoreSystem';system.className='more-group formal430-more-group';system.innerHTML=`<div class="more-group-title">版本</div><div class="list">${moreRow430('formal430SelfCheck','✓','正式版自检','只读检查核心数据、增强模块、PWA 与当前版本')}</div>`;
    main.prepend(system);main.prepend(content);main.prepend(analysis);main.prepend(daily);
    $('#formal430QuickCreate').onclick=()=>window.MocuiQuickCapture422?.openCreate?.();
    $('#formal430QuickSearch').onclick=()=>window.MocuiQuickCapture422?.openSearch?.();
    $('#formal430Settlement').onclick=()=>window.MocuiSettlement423?.open?.();
    $('#formal430DailyClose').onclick=()=>window.MocuiDailyClose424?.open?.();
    $('#formal430ReportsMore').onclick=()=>navigate('reports');
    $('#formal430WeeklyMore').onclick=()=>window.MocuiWeeklyReview425?.open?.();
    $('#formal430CapitalMore').onclick=()=>window.MocuiCapital426?.open?.();
    $('#formal430Content').onclick=()=>navigate('content');
    $('#formal430SelfCheck').onclick=openSelfCheck430;
    const foot=document.createElement('div');foot.className='formal430-release-note';foot.innerHTML='<strong>漠翠进销存 v4.3.1</strong><span>4.2 日常业务效率优化已收口 · 底层业务账本不迁移</span>';main.appendChild(foot);
  }

  async function formalizeProducts430(){
    if(appState.route!=='products')return;ensureNav430();
    document.querySelector('#capital426ProductsEntry')?.remove();
    const tools=$('#quick422ProductTools');if(tools)tools.classList.add('formal430-primary-tools');
  }

  function checkLine430(ok,title,meta){return `<div class="formal430-check-row ${ok?'ok':'warn'}"><span>${ok?'✓':'!'}</span><div><strong>${title}</strong><small>${meta}</small></div></div>`;}
  async function collectSelfCheck430(){
    const checks=[];let counts={};
    const stores=[['products','商品'],['sales','销售'],['loans','调借'],['customers','往来'],['settings','设置']];
    for(const [key,label] of stores){try{const rows=await dbAll(key);counts[key]=rows.length;checks.push({ok:true,title:`${label}数据可读`,meta:`${rows.length} 条`});}catch(err){checks.push({ok:false,title:`${label}数据读取失败`,meta:err?.message||'未知错误'});}}
    const modules=[
      ['工作台',window.MocuiWorkflow42],['往来管理',window.MocuiCounterparty421],['极速建档',window.MocuiQuickCapture422],['收付款',window.MocuiSettlement423],['每日收尾',window.MocuiDailyClose424],['周复盘',window.MocuiWeeklyReview425],['资金分析',window.MocuiCapital426],['内容联动',window.MocuiContentLinkage427]
    ];
    for(const [name,obj] of modules)checks.push({ok:Boolean(obj),title:`${name}模块`,meta:obj?`已加载 · v${obj.version||'-'}`:'未检测到'});
    checks.push({ok:Boolean(navigator.serviceWorker),title:'PWA / Service Worker',meta:navigator.serviceWorker?.controller?'当前页面已由 Service Worker 控制':'浏览器支持；当前页面可能刚更新，重开后接管'});
    const cloud=safeText($('#cloudBadge')?.textContent||'未显示');checks.push({ok:true,title:'云端状态',meta:`当前界面：${cloud}`});
    return {checks,counts,cloud};
  }
  async function openSelfCheck430(){
    const data=await collectSelfCheck430(),failed=data.checks.filter(x=>!x.ok).length;
    const summary=`漠翠进销存 v${VERSION}\n自检时间：${new Date().toLocaleString()}\n结果：${failed?`${failed} 项需要检查`:'基础检查通过'}\n商品 ${data.counts.products||0} · 销售 ${data.counts.sales||0} · 调借 ${data.counts.loans||0} · 往来 ${data.counts.customers||0}\n云端界面状态：${data.cloud}`;
    openModal('正式版自检',`<div class="formal430-self-head ${failed?'warn':'ok'}"><strong>${failed?`${failed} 项需要检查`:'基础检查通过'}</strong><span>只读检查，不修复、不删除、不迁移任何业务数据。</span></div><div class="formal430-check-list">${data.checks.map(x=>checkLine430(x.ok,x.title,x.meta)).join('')}</div><div class="notice"><strong>版本边界</strong><br>v4.3.1 延续入口收口与只读诊断。库存、销售、调借、归还、结算仍使用原业务记录，不在自检中自动修复。</div><button id="formal430CopyDiag" class="btn secondary block" type="button">复制诊断摘要</button>`,{full:true,onOpen:()=>{$('#formal430CopyDiag').onclick=async()=>{try{if(typeof copyText==='function')await copyText(summary);else await navigator.clipboard.writeText(summary);showToast('诊断摘要已复制');}catch(_){showToast('复制失败');}};}});
  }

  renderDashboard=async function(){const r=await baseRenderDashboard430.apply(this,arguments);try{await compactDashboard430();}catch(e){console.warn('[v4.3.0 dashboard]',e);}return r;};
  renderMore=async function(){const r=await baseRenderMore430.apply(this,arguments);try{await formalizeMore430();}catch(e){console.warn('[v4.3.0 more]',e);}return r;};
  renderProducts=async function(){const r=await baseRenderProducts430.apply(this,arguments);try{await formalizeProducts430();}catch(e){console.warn('[v4.3.0 products]',e);}return r;};

  // v4.3.1：只在启动时整理一次导航。
  // v4.3.0 曾监听 bottom-nav 的 childList，并在监听回调里再次重写 nav.innerHTML，
  // 会形成 MutationObserver 自触发循环，导致 iPhone Safari 页面崩溃。
  const start=()=>{ensureNav430();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();

  window.MocuiFormal430={version:VERSION,selfCheck:collectSelfCheck430,openSelfCheck:openSelfCheck430};
})();
