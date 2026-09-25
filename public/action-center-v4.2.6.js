'use strict';

(function(){
  const VERSION='4.2.6';
  const LEDGER_ID='actionCenterLedgerV1';
  const DAY=86400000;
  const originalRenderDashboard426=renderDashboard;
  const originalRenderMore426=renderMore;

  function dayKey426(value=new Date()){
    if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
    const d=value instanceof Date?value:new Date(value);if(Number.isNaN(d.getTime()))return '';
    const off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,10);
  }
  function addDays426(day,delta){const d=new Date(`${day}T12:00:00`);d.setDate(d.getDate()+delta);return dayKey426(d);}
  function esc426(v){return typeof esc==='function'?esc(v):String(v??'');}
  function money426(v){return typeof fmtMoney==='function'?fmtMoney(Number(v)||0):`¥${Number(v||0).toFixed(2)}`;}
  function int426(v){return typeof fmtInt==='function'?fmtInt(Number(v)||0):String(Number(v)||0);}

  async function getLedger426(){
    const row=await dbGet('settings',LEDGER_ID);
    return row&&row.states?row:{id:LEDGER_ID,version:1,states:{},updatedAt:''};
  }
  async function putLedger426(ledger){
    ledger.updatedAt=nowISO();await dbPut('settings',ledger);return ledger;
  }
  function taskFingerprint426(t){return [t.kind,t.id,t.amount||0,t.age||0,t.due||'',t.meta||'',t.priority].join('|');}
  function priorityRank426(p){return p==='critical'?0:p==='today'?1:p==='normal'?2:3;}
  function priorityName426(p){return p==='critical'?'优先':p==='today'?'今天':p==='normal'?'关注':'可稍后';}

  function makeTask426(kind,id,priority,title,meta,action,data={}){
    const t={key:`${kind}:${id}`,kind,id,priority,title,meta,action,...data};t.fingerprint=taskFingerprint426(t);return t;
  }

  async function collect426(){
    const [daily,weekly,ledger]=await Promise.all([
      window.MocuiDailyClose424?.collect?window.MocuiDailyClose424.collect():Promise.resolve(null),
      window.MocuiWeeklyReview425?.collect?window.MocuiWeeklyReview425.collect():Promise.resolve(null),
      getLedger426()
    ]);
    if(!daily||!weekly)return {today:dayKey426(),tasks:[],visible:[],snoozed:[],ledger,daily,weekly};
    const today=daily.day||dayKey426(),tasks=[];

    // 账款：7天以上进入行动中心，14/30天逐级提高优先级。
    for(const r of daily.settlement?.receivables||[]){
      if(Number(r.age||0)<7)continue;
      const priority=r.age>30?'critical':r.age>14?'today':'normal';
      tasks.push(makeTask426('receive',`${r.kind}:${r.id}`,priority,`收款 · ${r.person||'未填写对象'}`,`${r.ref||''} · 待收 ${money426(r.amount)} · 已挂 ${int426(r.age)} 天`,'settlement',{direction:'receive',settlementKind:r.kind,entityId:r.id,person:r.person,amount:r.amount,age:r.age,ref:r.ref,title2:r.title||''}));
    }
    for(const r of daily.settlement?.payables||[]){
      if(Number(r.age||0)<7)continue;
      const priority=r.age>30?'critical':r.age>14?'today':'normal';
      tasks.push(makeTask426('pay',`${r.kind}:${r.id}`,priority,`付款 · ${r.person||'未填写对象'}`,`${r.ref||''} · 待付 ${money426(r.amount)} · 已挂 ${int426(r.age)} 天`,'settlement',{direction:'pay',settlementKind:r.kind,entityId:r.id,person:r.person,amount:r.amount,age:r.age,ref:r.ref,title2:r.title||''}));
    }

    // 调借：超期最优先，3天内到期进入今天任务。
    const loanSeen=new Set();
    for(const l of daily.goods?.overdueLoans||[]){
      const id=String(l.id||l.loanNo||'');if(!id||loanSeen.has(id))continue;loanSeen.add(id);
      const overdue=typeof loanOverdueDays==='function'?Math.max(1,loanOverdueDays(l)):1;
      tasks.push(makeTask426('loan',id,'critical',`追货 · ${l.person||'未填写同行'}`,`${l.loanNo||'调借单'} · 已超期 ${int426(overdue)} 天`,'loan',{entityId:l.id,person:l.person,due:typeof loanDueDate==='function'?loanDueDate(l):l.expectedReturnDate||'',age:overdue}));
    }
    for(const l of daily.goods?.soonLoans||[]){
      const id=String(l.id||l.loanNo||'');if(!id||loanSeen.has(id))continue;loanSeen.add(id);
      const due=typeof loanDueDate==='function'?loanDueDate(l):l.expectedReturnDate||'';
      tasks.push(makeTask426('loan',id,'today',`确认归还 · ${l.person||'未填写同行'}`,`${l.loanNo||'调借单'} · 预计 ${due||'近期'} 归还`,'loan',{entityId:l.id,person:l.person,due}));
    }

    // 外部同行货：超期 / 3天内到期。
    const extSeen=new Set();
    for(const r of daily.goods?.externalOverdue||[]){
      const id=String(r.id||r.tempNo||'');if(!id||extSeen.has(id))continue;extSeen.add(id);
      tasks.push(makeTask426('external',id,'critical',`外部货追踪 · ${r.currentHolderName||'同行'}`,`${r.itemName||r.tempNo||'外部货'} · 已超过预计处理日期`,'external',{entityId:r.id,person:r.currentHolderName,due:r.expectedReturnDate||'',amount:r.ownerCostAmount||0}));
    }
    for(const r of daily.goods?.externalDueSoon||[]){
      const id=String(r.id||r.tempNo||'');if(!id||extSeen.has(id))continue;extSeen.add(id);
      tasks.push(makeTask426('external',id,'today',`确认外部货 · ${r.currentHolderName||'同行'}`,`${r.itemName||r.tempNo||'外部货'} · 预计 ${r.expectedReturnDate||'近期'} 前处理`,'external',{entityId:r.id,person:r.currentHolderName,due:r.expectedReturnDate||'',amount:r.ownerCostAmount||0}));
    }

    // 报价跟进：到期 / 逾期直接进入今天任务。
    for(const x of daily.follow?.due||[]){
      const q=x.quote||{},p=x.product||{},qid=String(q.id||`${q.person||''}:${q.createdAt||q.nextFollowupDate||''}`);
      tasks.push(makeTask426('quote',`${p.id}:${qid}`,'today',`报价跟进 · ${q.person||'未填写对象'}`,`${p.name||'商品'} · 报价 ${money426(q.amount)} · 跟进日 ${q.nextFollowupDate||today}`,'product',{entityId:p.id,person:q.person,amount:q.amount||0,due:q.nextFollowupDate||today}));
    }

    // 数据完整性：成本缺失比图片缺失优先级更高，因为会影响利润与库存货值。
    const missingImageIds=new Set((daily.data?.missingImage||[]).map(p=>p.id));
    for(const p of daily.data?.missingCost||[]){
      tasks.push(makeTask426('cost',String(p.id),'normal',`补成本 · ${p.name}`,`${p.code||'无编码'} · 当前库存 ${int426(p.stock)} · 成本为 0`,'product',{entityId:p.id,amount:n(p.stock)*n(p.costPrice)}));
      missingImageIds.delete(p.id);
    }
    for(const p of daily.data?.missingImage||[]){
      if(!missingImageIds.has(p.id))continue;
      tasks.push(makeTask426('image',String(p.id),'later',`补图片 · ${p.name}`,`${p.code||'无编码'} · 当前库存 ${int426(p.stock)}`,'product',{entityId:p.id}));
    }

    // 慢动库存：只作为可稍后复盘，不与真正到期/账款任务争抢注意力。
    for(const x of (weekly.slowInventory||[]).slice(0,20)){
      const p=x.product||{};
      tasks.push(makeTask426('slow',String(p.id),'later',`慢动复盘 · ${p.name}`,`${int426(x.days)} 天无成交 · 库存 ${int426(x.stock)} · 成本货值 ${money426(x.value)}`,'product',{entityId:p.id,age:x.days,amount:x.value}));
    }

    // 晚间未日结：只提醒做核对，不自动声明已完成。
    if(!daily.currentClose&&new Date().getHours()>=18){
      tasks.push(makeTask426('daily-close',today,'normal','完成今日收尾',`成交 ${money426(daily.turnover?.total||0)} · 实收 ${money426(daily.cash?.received||0)} · 先核对资金、货品和明日重点`,'daily-close',{due:today}));
    }

    // 去重 + 排序。
    const dedup=[...new Map(tasks.map(t=>[t.key,t])).values()].sort((a,b)=>priorityRank426(a.priority)-priorityRank426(b.priority)||(b.age||0)-(a.age||0)||String(a.title).localeCompare(String(b.title),'zh-CN'));
    const visible=[],snoozed=[];
    for(const t of dedup){
      const state=ledger.states?.[t.key];
      const same=state?.fingerprint===t.fingerprint;
      const resumeOn=String(state?.resumeOn||'');
      if(same&&resumeOn&&today<resumeOn)snoozed.push({...t,state});else visible.push(t);
    }
    return {today,tasks:dedup,visible,snoozed,ledger,daily,weekly};
  }

  async function snooze426(task,days,label){
    const data=await collect426(),ledger=data.ledger||await getLedger426(),resumeOn=addDays426(data.today,Math.max(1,days));
    ledger.states=ledger.states||{};ledger.states[task.key]={fingerprint:task.fingerprint,resumeOn,label:label||`${days}天后`,updatedAt:nowISO()};await putLedger426(ledger);
    await writeAudit('action.snooze','system',task.key,`${task.title} · 暂缓到 ${resumeOn}`,null,{resumeOn,label});showToast(label==='今天已处理'?'今天先隐藏，未解决明天会重新出现':`已暂缓到 ${resumeOn}`);
  }
  async function wake426(task){
    const ledger=await getLedger426();if(ledger.states?.[task.key]){delete ledger.states[task.key];await putLedger426(ledger);}showToast('已恢复到待办');
  }

  function taskRow426(t,snoozed=false){
    const cls=t.priority==='critical'?'critical':t.priority==='today'?'today':t.priority==='normal'?'normal':'later';
    return `<article class="action426-row ${cls}" data-task-key="${esc426(t.key)}"><div class="action426-priority"><span></span><b>${priorityName426(t.priority)}</b></div><button class="action426-main" type="button" data-task-open="${esc426(t.key)}"><strong>${esc426(t.title)}</strong><small>${esc426(t.meta||'')}</small></button>${snoozed?`<div class="action426-snooze-meta">${esc426(t.state?.label||'已暂缓')} · ${esc426(t.state?.resumeOn||'')}</div><button type="button" class="action426-wake" data-task-wake="${esc426(t.key)}">恢复</button>`:`<button class="action426-more" type="button" data-task-more="${esc426(t.key)}">···</button>`}</article>`;
  }

  async function openTask426(task){
    if(!task)return;
    if(task.action==='settlement'){
      closeModal();setTimeout(()=>window.MocuiSettlement423?.openEntry?.(task.settlementKind,task.entityId,task.direction),120);return;
    }
    if(task.action==='loan'){
      closeModal();setTimeout(()=>{if(typeof openLoanDetail==='function')openLoanDetail(task.entityId);else navigate('loans');},120);return;
    }
    if(task.action==='external'){
      closeModal();setTimeout(()=>{if(typeof openExternalGoodDetail==='function')openExternalGoodDetail(task.entityId);else navigate('external-goods');},120);return;
    }
    if(task.action==='product'){
      closeModal();setTimeout(()=>navigate('product-detail',{id:task.entityId}),120);return;
    }
    if(task.action==='daily-close'){
      closeModal();setTimeout(()=>window.MocuiDailyClose424?.open?.('today'),120);return;
    }
  }

  function taskMenu426(task,refresh){
    openModal('这条任务怎么处理？',`<div class="action426-menu"><div class="notice"><strong>${esc426(task.title)}</strong><br>${esc426(task.meta||'')}</div><button id="action426DoneToday" class="btn block" type="button">今天已处理</button><div class="grid-2" style="margin-top:8px"><button id="action426Snooze3" class="btn secondary" type="button">3天后提醒</button><button id="action426Snooze7" class="btn secondary" type="button">7天后提醒</button></div><button id="action426OpenSource" class="btn ghost block" style="margin-top:8px" type="button">打开原业务记录</button><div class="field-help" style="margin-top:10px">“今天已处理”只隐藏到明天；如果真实问题仍未解决，会自动重新出现。结清、归还或补全资料后，任务会自动消失。</div></div>`,{onOpen:()=>{
      $('#action426DoneToday').onclick=async()=>{await snooze426(task,1,'今天已处理');closeModal();setTimeout(()=>openActionCenter426('todo'),100);};
      $('#action426Snooze3').onclick=async()=>{await snooze426(task,3,'3天后提醒');closeModal();setTimeout(()=>openActionCenter426('todo'),100);};
      $('#action426Snooze7').onclick=async()=>{await snooze426(task,7,'7天后提醒');closeModal();setTimeout(()=>openActionCenter426('todo'),100);};
      $('#action426OpenSource').onclick=()=>openTask426(task);
    }});
  }

  function summary426(data){
    const by={critical:0,today:0,normal:0,later:0};data.visible.forEach(t=>by[t.priority]=(by[t.priority]||0)+1);
    const top=data.visible.slice(0,8);
    return [`漠翠进销存｜行动清单 ${data.today}`,`待处理 ${data.visible.length} 项｜优先 ${by.critical}｜今天 ${by.today}｜关注 ${by.normal}｜可稍后 ${by.later}`, ...top.map((t,i)=>`${i+1}. [${priorityName426(t.priority)}] ${t.title}｜${t.meta}`)].join('\n');
  }

  async function openActionCenter426(initial='todo'){
    let tab=initial;
    const drawModal=async()=>{
      const data=await collect426();
      const by={critical:0,today:0,normal:0,later:0};data.visible.forEach(t=>by[t.priority]=(by[t.priority]||0)+1);
      const current=tab==='snoozed'?data.snoozed:data.visible;
      const body=$('#action426Body');if(!body)return;
      body.innerHTML=`${tab==='todo'?`<div class="action426-summary"><div><span>优先</span><strong>${by.critical}</strong></div><div><span>今天</span><strong>${by.today}</strong></div><div><span>关注</span><strong>${by.normal}</strong></div><div><span>可稍后</span><strong>${by.later}</strong></div></div><div class="action426-rule">任务来自真实未结业务；结清、归还或补全后会自动消失。没有永久“忽略”。</div>`:''}${current.length?`<div class="action426-list">${current.map(t=>taskRow426(t,tab==='snoozed')).join('')}</div>`:`<div class="action426-empty"><strong>${tab==='snoozed'?'没有暂缓中的任务':'当前没有需要处理的任务'}</strong><span>${tab==='snoozed'?'稍后提醒的事项会显示在这里。':'系统只会在有明确业务依据时生成任务。'}</span></div>`}${tab==='todo'?`<div class="action426-footer"><button id="action426Copy" class="btn secondary" type="button">复制行动清单</button><button id="action426Weekly" class="btn secondary" type="button">打开周复盘</button></div>`:''}`;
      $$('[data-task-open]',body).forEach(b=>b.onclick=()=>openTask426(current.find(t=>t.key===b.dataset.taskOpen)));
      $$('[data-task-more]',body).forEach(b=>b.onclick=()=>taskMenu426(current.find(t=>t.key===b.dataset.taskMore),drawModal));
      $$('[data-task-wake]',body).forEach(b=>b.onclick=async()=>{const t=current.find(x=>x.key===b.dataset.taskWake);await wake426(t);await drawModal();});
      if($('#action426Copy'))$('#action426Copy').onclick=async()=>{try{const txt=summary426(data);if(typeof copyText==='function')await copyText(txt);else await navigator.clipboard.writeText(txt);showToast('行动清单已复制');}catch(_){showToast('复制失败');}};
      if($('#action426Weekly'))$('#action426Weekly').onclick=()=>{closeModal();setTimeout(()=>window.MocuiWeeklyReview425?.open?.('alerts'),120);};
      const todoBtn=$('[data-action426-tab="todo"]'),snBtn=$('[data-action426-tab="snoozed"]');if(todoBtn)todoBtn.textContent=`今日任务 ${data.visible.length||''}`;if(snBtn)snBtn.textContent=`已暂缓 ${data.snoozed.length||''}`;
    };
    const initialData=await collect426();
    openModal('行动中心',`<div class="action426"><div class="action426-tabs"><button data-action426-tab="todo" class="${tab==='todo'?'active':''}">今日任务 ${initialData.visible.length||''}</button><button data-action426-tab="snoozed" class="${tab==='snoozed'?'active':''}">已暂缓 ${initialData.snoozed.length||''}</button></div><div id="action426Body"></div></div>`,{full:true,onOpen:()=>{
      $$('.action426-tabs button').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.action426Tab;$$('.action426-tabs button').forEach(x=>x.classList.toggle('active',x===btn));drawModal();});drawModal();
    }});
  }

  async function enhanceDashboard426(){
    if(appState.route!=='dashboard'||document.querySelector('#action426Dashboard'))return;const data=await collect426(),main=$('#main');if(!main)return;
    const critical=data.visible.filter(t=>t.priority==='critical').length,today=data.visible.filter(t=>t.priority==='today').length;
    const card=document.createElement('button');card.id='action426Dashboard';card.className=`action426-dashboard ${critical?'critical':today?'today':''}`;card.type='button';card.innerHTML=`<div><span>行动中心</span><strong>${data.visible.length?`${data.visible.length} 项待处理`:'当前已清'}</strong><small>${data.visible.length?`${critical?`优先 ${critical} · `:''}${today?`今天 ${today} · `:''}${esc426(data.visible[0]?.title||'')}`:'没有明确到期、账款或资料任务'}</small></div><div><b>${critical?'先处理优先项':data.visible.length?'开始处理':'查看'}</b><span>›</span></div>`;
    const anchor=document.querySelector('#weekly425Dashboard')||document.querySelector('#daily424Dashboard')||document.querySelector('#workflow42DailyPanel');if(anchor)anchor.insertAdjacentElement('afterend',card);else main.prepend(card);card.onclick=()=>openActionCenter426();
  }

  async function enhanceMore426(){
    if(appState.route!=='more'||document.querySelector('#action426More'))return;const main=$('#main');if(!main)return;const data=await collect426(),sec=document.createElement('section');sec.id='action426More';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">执行</div><div class="list"><div id="action426MoreOpen" class="list-item clickable"><div class="thumb placeholder">✓</div><div class="item-main"><div class="item-title">行动中心</div><div class="item-meta">${data.visible.length} 项待处理 · 催款、追货、跟进、补资料</div></div><div>›</div></div></div>`;const anchor=document.querySelector('#weekly425More')||document.querySelector('#daily424MoreEntry')||main.firstElementChild;anchor?.insertAdjacentElement('afterend',sec);$('#action426MoreOpen').onclick=()=>openActionCenter426();
  }

  renderDashboard=async function(){const r=await originalRenderDashboard426.apply(this,arguments);try{await enhanceDashboard426();}catch(e){console.warn('[v4.2.6 dashboard]',e);}return r;};
  renderMore=async function(){const r=await originalRenderMore426.apply(this,arguments);try{await enhanceMore426();}catch(e){console.warn('[v4.2.6 more]',e);}return r;};

  window.MocuiActionCenter426={version:VERSION,collect:collect426,open:openActionCenter426};
})();
