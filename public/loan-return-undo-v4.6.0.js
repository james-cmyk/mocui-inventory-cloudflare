'use strict';
(()=>{
  const VERSION='4.6.0';

  // 归还撤销属于核心库存动作：保留独立流水类型，并纳入原有幂等保护。
  try{ if(typeof CORE_STOCK_MOVE_TYPES!=='undefined') CORE_STOCK_MOVE_TYPES.add('loan_return_cancel'); }catch(e){ console.warn('[v4.6.0 core move type]',e); }

  const baseOpenLoanDetail=typeof openLoanDetail==='function'?openLoanDetail:null;
  const baseLoanItemReturnedQty=typeof loanItemReturnedQty==='function'?loanItemReturnedQty:null;

  function activeReturnEvents(loan){
    return (loan?.returns||[]).filter(e=>e?.status!=='cancelled');
  }

  // 旧记录没有 returnedQty 时，必须忽略已经撤销的归还事件。
  if(baseLoanItemReturnedQty){
    const wrappedReturnedQty=function(loan,item){
      if(item&&item.returnedQty!==undefined){
        return Math.min(n(item.qty),Math.max(0,n(item.returnedQty)));
      }
      if((loan?.returns||[]).length){
        return activeReturnEvents(loan).reduce((sum,event)=>sum+n((event.items||[]).find(x=>x.productId===item?.productId)?.qty),0);
      }
      if(loan?.status==='returned')return n(item?.qty);
      return 0;
    };
    try{loanItemReturnedQty=wrappedReturnedQty;}catch(_){}
    try{window.loanItemReturnedQty=wrappedReturnedQty;}catch(_){}
  }

  function aggregateEventItems(event){
    const map=new Map();
    for(const raw of (event?.items||[])){
      const id=String(raw?.productId||'');
      const qty=Math.max(0,n(raw?.qty));
      if(!id||qty<=0)continue;
      const old=map.get(id)||{productId:id,productName:raw.productName||'',productCode:raw.productCode||'',color:raw.color||'',qty:0};
      old.qty+=qty;
      if(!old.productName&&raw.productName)old.productName=raw.productName;
      map.set(id,old);
    }
    return [...map.values()];
  }

  function recomputeReturnedQty(loan){
    const active=activeReturnEvents(loan);
    loan.items=(loan.items||[]).map(item=>{
      const returned=active.reduce((sum,event)=>sum+n((event.items||[]).find(x=>x.productId===item.productId)?.qty),0);
      return {...item,returnedQty:Math.min(n(item.qty),Math.max(0,returned))};
    });
    return loan;
  }

  async function cancelLoanReturnEvent(loanId,eventId){
    const lockKey=`loan-return-cancel:${loanId}:${eventId}`;
    return withCoreActionLock(lockKey,null,'',async()=>{
      const loan=await dbGet('loans',loanId);
      if(!loan)throw new Error('调借单不存在');
      const event=(loan.returns||[]).find(e=>String(e.id)===String(eventId));
      if(!event)throw new Error('找不到这次归还记录');
      if(event.status==='cancelled'){showToast('这次归还已经撤销');await openLoanDetail(loan.id);return;}
      const items=aggregateEventItems(event);
      if(!items.length)throw new Error('这次归还没有可撤销的商品数量');

      // 借出：原归还 +库存，撤销时 -库存；若这些货后来又被使用，必须先阻止撤销，避免负库存。
      // 调入/借入：原归还 -库存，撤销时 +库存。
      const undoDeltaSign=loan.type==='borrow'?1:-1;
      const pending=[];
      for(const item of items){
        const done=await stockMoveExists(item.productId,'loan_return_cancel','loan_return_cancel',event.id);
        if(!done)pending.push(item);
      }
      if(undoDeltaSign<0&&pending.length)await validateStock(pending,-1);

      const totalQty=items.reduce((sum,i)=>sum+n(i.qty),0);
      const effect=loan.type==='borrow'?`库存将增加 ${fmtInt(totalQty)} 件`:`库存将减少 ${fmtInt(totalQty)} 件`;
      const ok=await confirmDialog(`确认撤销这次归还？\n\n${items.map(i=>`${i.productName||'商品'} × ${fmtInt(i.qty)}`).join('\n')}\n\n${effect}。撤销后调借单会重新打开，可重新填写正确的归还数量。`);
      if(!ok)return;

      const cancelledAt=nowISO();
      for(const item of items){
        await adjustStock(
          item.productId,
          undoDeltaSign*n(item.qty),
          'loan_return_cancel',
          'loan_return_cancel',
          event.id,
          `${loan.person} 撤销归还 ${loan.loanNo} · 原归还记录 ${event.id}`,
          cancelledAt
        );
      }

      event.status='cancelled';
      event.cancelledAt=cancelledAt;
      event.cancelReason='归还录入错误，已撤销并回退库存';
      recomputeReturnedQty(loan);
      refreshLoanStatus(loan);
      await dbPut('loans',loan);
      await writeAudit(
        'loan.return_cancel',
        'loan',
        loan.id,
        `${loan.loanNo} 撤销归还 ${fmtInt(totalQty)} 件`,
        null,
        {eventId:event.id,cancelledAt,items,effect:loan.type==='borrow'?'inventory_in':'inventory_out'}
      );
      showToast(loan.type==='borrow'?'归还已撤销，库存已恢复增加':'归还已撤销，库存已扣回');
      await openLoanDetail(loan.id);
    }).catch(err=>showToast(err?.message||'撤销归还失败，请重试'));
  }
  window.cancelLoanReturnEvent=cancelLoanReturnEvent;

  function returnEventDate(e){
    const t=new Date(e?.date||e?.createdAt||0).getTime();
    return Number.isFinite(t)?t:0;
  }

  function decorateReturnEvents(loan){
    const host=document.querySelector('.return-history');
    if(!host)return;
    const rows=[...host.querySelectorAll('.return-event:not(.sale-event)')];
    let events=[];
    if((loan?.returns||[]).length){
      events=[...loan.returns].sort((a,b)=>returnEventDate(a)-returnEventDate(b));
    }else if(loan?.status==='returned'&&loan?.returnedAt){
      events=[{id:'legacy',date:loan.returnedAt,status:'legacy'}];
    }
    rows.forEach((row,idx)=>{
      const event=events[idx];if(!event)return;
      row.dataset.returnEventId=String(event.id||'');
      const old=row.querySelector('.v460-return-action');if(old)old.remove();
      const action=document.createElement('div');action.className='v460-return-action';
      if(event.status==='cancelled'){
        row.classList.add('v460-return-cancelled');
        action.innerHTML=`<span class="v460-cancelled-badge">已撤销</span><small>${event.cancelledAt?fmtDateTime(event.cancelledAt):''}</small>`;
      }else if(event.id==='legacy'){
        action.innerHTML='<span class="v460-legacy-note">旧版归还记录不可直接撤销</span>';
      }else{
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='btn small danger ui-icon-only v460-undo-return';
        btn.textContent='撤销本次归还';
        btn.onclick=e=>{e.preventDefault();e.stopPropagation();cancelLoanReturnEvent(loan.id,event.id);};
        action.appendChild(btn);
      }
      row.appendChild(action);
    });

    const cancelled=(loan?.returns||[]).filter(e=>e?.status==='cancelled').length;
    if(cancelled){
      const title=[...document.querySelectorAll('.section-title')].find(el=>String(el.textContent||'').includes('流转记录'));
      const small=title?.querySelector('small');
      if(small)small.textContent=`归还记录 ${(loan.returns||[]).length} 次 · 已撤销 ${cancelled} 次 · 售出 ${loanSaleEvents(loan).length} 次`;
    }
  }

  if(baseOpenLoanDetail){
    const wrappedOpenLoanDetail=async function(idOrLoan){
      const id=typeof idOrLoan==='string'?idOrLoan:idOrLoan?.id;
      await baseOpenLoanDetail.apply(this,arguments);
      const fresh=id?await dbGet('loans',id):idOrLoan;
      if(fresh)decorateReturnEvents(fresh);
    };
    try{openLoanDetail=wrappedOpenLoanDetail;}catch(_){}
    try{window.openLoanDetail=wrappedOpenLoanDetail;}catch(_){}
  }

  window.MocuiLoanReturnUndo={version:VERSION,cancel:cancelLoanReturnEvent};
})();
