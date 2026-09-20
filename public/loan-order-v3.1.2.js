'use strict';
(() => {
  const VERSION='3.1.2';

  function loanTime(l){
    const v=l?.date||l?.createdAt||l?.updatedAt||0;
    const t=new Date(v).getTime();
    return Number.isFinite(t)?t:0;
  }
  function completedTime(l){
    const v=l?.completedAt||l?.returnedAt||l?.updatedAt||l?.date||l?.createdAt||0;
    const t=new Date(v).getTime();
    return Number.isFinite(t)?t:0;
  }
  function newestFirst(a,b){ return loanTime(b)-loanTime(a); }
  function completedNewestFirst(a,b){ return completedTime(b)-completedTime(a); }

  async function renderLoansV312(){
    setHeader('调借货管理','未还优先 · 最新在前',{label:'＋',onClick:()=>openLoanForm()});

    const all=await dbAll('loans');
    const active=all.filter(loanIsOpen).sort(newestFirst);
    const completed=all.filter(l=>!loanIsOpen(l)).sort(completedNewestFirst);

    $('#main').innerHTML=`
      <button id="openExternalGoods" class="btn secondary block" style="margin-bottom:12px">外部货</button>
      <div class="grid-3">
        <div class="metric compact"><div class="label">正在借调</div><div class="value">${active.length}</div></div>
        <div class="metric compact"><div class="label">部分处理</div><div class="value">${active.filter(loanIsPartial).length}</div></div>
        <div class="metric compact"><div class="label">已超期</div><div class="value danger-text">${active.filter(l=>loanOverdueDays(l)>0).length}</div></div>
      </div>
      <div class="segment" id="loanStatus" style="margin-top:12px">
        <button class="active" data-status="all">全部</button>
        <button data-status="active">正在借调</button>
        <button data-status="partial">部分处理</button>
        <button data-status="returned">已还清</button>
        <button data-status="overdue">超期</button>
      </div>
      <div id="loanList" class="list"></div>`;

    $('#openExternalGoods').onclick=()=>navigate('external-goods');
    let status='all';

    const draw=()=>{
      let html='';
      if(status==='all'){
        if(active.length){
          html+=`<div class="loan-group-title">正在借调 <small>${active.length}</small></div>`;
          html+=active.map(loanListItem).join('');
        }
        if(completed.length){
          html+=`<div class="loan-group-title loan-group-completed">已还清 <small>${completed.length}</small></div>`;
          html+=completed.map(loanListItem).join('');
        }
        if(!active.length&&!completed.length)html=emptyState('⇄','暂无调借记录');
      }else{
        const rows=status==='active'?active:
          status==='partial'?active.filter(loanIsPartial):
          status==='returned'?completed:
          status==='overdue'?active.filter(l=>loanOverdueDays(l)>0):[];
        html=rows.length?rows.map(loanListItem).join(''):emptyState('⇄','暂无调借记录');
      }
      $('#loanList').innerHTML=html;
      $$('#loanList [data-loan-id]').forEach(el=>el.onclick=()=>openLoanDetail(el.dataset.loanId));
    };

    draw();
    $$('#loanStatus button').forEach(b=>b.onclick=()=>{
      status=b.dataset.status;
      $$('#loanStatus button').forEach(x=>x.classList.toggle('active',x===b));
      draw();
    });
  }

  function install(){
    if(typeof window.renderLoans!=='function')return false;
    window.renderLoans=renderLoansV312;
    return true;
  }
  if(!install()){
    const t=setInterval(()=>{if(install())clearInterval(t)},30);
    setTimeout(()=>clearInterval(t),10000);
  }
  window.MocuiLoanOrder={version:VERSION};
})();