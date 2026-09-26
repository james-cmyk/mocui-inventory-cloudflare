'use strict';
(()=>{
  const VERSION='4.4.4';
  const EPS=1e-8;
  const locks=new Set();
  const originalSaleCard=window.saleCard;
  const originalDuplicateSale=window.duplicateSale;

  const closeEnough=(a,b)=>Math.abs(Number(a||0)-Number(b||0))<=EPS;
  const saleRefMatch=(move,saleId)=>{
    const ref=String(move?.refId||'');
    return move?.refType==='sale' && (ref===String(saleId)||ref.startsWith(`${saleId}::`));
  };
  const groupSaleItems=sale=>{
    const map=new Map();
    for(const item of sale?.items||[]){
      if(!item?.productId)continue;
      const mode=item.fromLoan&&item.loanId
        ? (item.loanType==='lend'?'loan_lend':'loan_borrow')
        : 'regular';
      const old=map.get(item.productId);
      if(old&&old.mode!==mode)throw new Error(`${item.productName||'商品'} 同一销售单存在不同库存来源，已停止操作`);
      const row=old||{productId:item.productId,productName:item.productName||'',qty:0,mode,item};
      row.qty+=n(item.qty);map.set(item.productId,row);
    }
    return [...map.values()];
  };
  const moveTypesFor=group=>group.mode==='loan_borrow'
    ? new Set(['loan_sale','loan_sale_cancel','loan_sale_restore'])
    : new Set(['sale','sale_cancel','sale_restore']);
  const transitionType=(group,kind)=>group.mode==='loan_borrow'
    ? (kind==='cancel'?'loan_sale_cancel':'loan_sale_restore')
    : (kind==='cancel'?'sale_cancel':'sale_restore');
  const initialType=group=>group.mode==='loan_borrow'?'loan_sale':'sale';

  async function inspectSaleStock(sale){
    const moves=await dbAll('stockMoves');
    const groups=groupSaleItems(sale);
    return groups.map(group=>{
      if(group.mode==='loan_lend')return {...group,tracked:true,net:0,targetActive:0,targetCancelled:0,related:[]};
      const types=moveTypesFor(group);
      const related=moves.filter(m=>m.productId===group.productId&&saleRefMatch(m,sale.id)&&types.has(m.type));
      const net=related.reduce((sum,m)=>sum+n(m.qtyChange),0);
      const tracked=related.some(m=>m.type===initialType(group));
      return {...group,tracked,net,targetActive:-n(group.qty),targetCancelled:0,related};
    });
  }

  function assertReasonableState(row){
    if(row.mode==='loan_lend')return;
    if(!row.tracked)return;
    const q=n(row.qty);
    if(row.net>EPS || row.net < -q-EPS){
      throw new Error(`${row.productName} 的销售库存流水异常（本单净影响 ${fmtInt(row.net)}，应在 ${fmtInt(-q)}～0 之间），已停止自动修改`);
    }
  }

  async function applySaleStockTarget(sale,target,{reason='库存状态校正'}={}){
    const rows=await inspectSaleStock(sale);
    const opId=`${Date.now()}-${crypto.randomUUID()}`;
    const changes=[];

    // First pass: validate every row before any write.
    for(const row of rows){
      assertReasonableState(row);
      if(row.mode==='loan_lend')continue;
      let delta;
      if(row.tracked){
        const wanted=target==='active'?row.targetActive:row.targetCancelled;
        delta=wanted-row.net;
      }else{
        // Legacy sale without an original stock move: preserve the old behavior.
        delta=target==='active'?-n(row.qty):n(row.qty);
      }
      if(delta < -EPS){
        const p=await dbGet('products',row.productId);
        if(!p)throw new Error(`${row.productName} 商品档案不存在`);
        if(n(p.stock) < -delta-EPS)throw new Error(`${p.name} 库存不足：当前 ${fmtInt(p.stock)}，需要 ${fmtInt(-delta)}`);
      }
      if(Math.abs(delta)>EPS)changes.push({...row,delta});
    }

    // Second pass: perform only the exact missing transition amount.
    for(const row of changes){
      const kind=target==='active'?'restore':'cancel';
      const type=transitionType(row,kind);
      const refId=`${sale.id}::${kind}::${opId}`;
      await adjustStock(row.productId,row.delta,type,'sale',refId,`${reason} · ${sale.orderNo}`);
    }
    return {rows,changes};
  }

  async function syncLoanForCancel(sale){
    for(const i of sale.items||[]){
      if(!(i.fromLoan&&i.loanId))continue;
      const l=await dbGet('loans',i.loanId);if(!l)continue;
      l.items=(l.items||[]).map(x=>x.productId===i.productId?{...x,soldQty:Math.max(0,loanItemSoldQty(l,x)-n(i.qty))}:x);
      l.saleEvents=(l.saleEvents||[]).map(e=>e.saleId===sale.id?{...e,status:'cancelled',cancelledAt:nowISO()}:e);
      refreshLoanStatus(l);await dbPut('loans',l);
      if(i.loanType==='lend'){
        await recordStockReference(i.productId,'loan_sale_cancel','sale',`${sale.id}::cancelref::${Date.now()}-${crypto.randomUUID()}`,`撤销借调售出 ${sale.orderNo}，恢复为借调未处理；仓库库存不重复增加`);
      }
    }
  }

  async function syncLoanForRestore(sale){
    // Validate first.
    for(const i of sale.items||[]){
      if(!(i.fromLoan&&i.loanId))continue;
      const l=await dbGet('loans',i.loanId);if(!l)throw new Error(`关联调借单不存在：${i.loanNo||''}`);
      const li=(l.items||[]).find(x=>x.productId===i.productId);
      if(!li||loanItemRemaining(l,li)<n(i.qty))throw new Error(`${i.productName} 当前借调未处理数量不足，不能恢复销售`);
    }
    for(const i of sale.items||[]){
      if(!(i.fromLoan&&i.loanId))continue;
      const l=await dbGet('loans',i.loanId);
      l.items=(l.items||[]).map(x=>x.productId===i.productId?{...x,soldQty:loanItemSoldQty(l,x)+n(i.qty)}:x);
      l.saleEvents=(l.saleEvents||[]).map(e=>e.saleId===sale.id?{...e,status:'active',cancelledAt:null,restoredAt:nowISO()}:e);
      refreshLoanStatus(l);await dbPut('loans',l);
      if(i.loanType==='lend'){
        await recordStockReference(i.productId,'loan_sale_restore','sale',`${sale.id}::restoreref::${Date.now()}-${crypto.randomUUID()}`,`恢复借调售出 ${sale.orderNo}；借出时库存已扣减`);
      }
    }
  }

  async function withLock(key,fn){
    if(locks.has(key))return;
    locks.add(key);
    try{return await fn();}finally{locks.delete(key);}
  }

  async function cancelSaleV2(id){
    return withLock(`cancel:${id}`,async()=>{
      const s=await dbGet('sales',id);
      if(!s||s.status!=='active')return;
      if(s.importedHistorical||s.sourceType==='qinsilk_history'){showToast('秦丝历史销售不参与库存，不能撤销');return;}
      if(!await confirmDialog('确定撤销这张销售单？系统会先核对本单实际库存影响，只补回尚未恢复的数量。'))return;
      try{
        // Preflight accessory inventory is not needed for cancellation; cancellation only returns stock.
        await applySaleStockTarget(s,'cancelled',{reason:'撤销销售库存回补'});
        await syncLoanForCancel(s);
        await cancelAccessorySale(s);
        s.status='cancelled';s.cancelledAt=nowISO();s.updatedAt=nowISO();
        s.stockState='cancelled';s.stockStateVersion=2;
        await dbPut('sales',s);
        await writeAudit('sale.cancel','sale',s.id,`${s.orderNo} 已撤销（v4.4.4库存核对）`,null,{status:s.status,cancelledAt:s.cancelledAt,stockState:s.stockState});
        showToast('销售单已撤销，库存已按本单实际流水核对恢复');
        await renderSales();
      }catch(err){showToast(err?.message||'撤销失败，库存未继续修改');}
    });
  }

  async function restoreSaleV2(id){
    return withLock(`restore:${id}`,async()=>{
      const s=await dbGet('sales',id);
      if(!s||s.status!=='cancelled')return;
      if(s.importedHistorical||s.sourceType==='qinsilk_history'){showToast('秦丝历史销售不能恢复');return;}
      try{
        const inspection=await inspectSaleStock(s);
        // Determine only the missing warehouse deduction; if a bad previous cancel left inventory already deducted,
        // this can be zero and the sale status is simply brought back in sync.
        for(const row of inspection){
          assertReasonableState(row);
          if(row.mode==='loan_lend')continue;
          const need=row.tracked?(row.net-row.targetActive):n(row.qty);
          if(need>EPS){
            const p=await dbGet('products',row.productId);
            if(!p)throw new Error(`${row.productName} 商品档案不存在`);
            if(n(p.stock)<need-EPS)throw new Error(`${p.name} 库存不足：当前 ${fmtInt(p.stock)}，恢复销售需要 ${fmtInt(need)}`);
          }
        }
        await validateAccessoryUsages(s.accessoryUsages||[]);
        await syncLoanForRestore(s);
        await applySaleStockTarget(s,'active',{reason:'恢复销售重新扣减'});
        await restoreAccessorySale(s);
        s.status='active';s.cancelledAt=null;s.updatedAt=nowISO();s.stockState='active';s.stockStateVersion=2;
        if(s.saleChannel==='xhs'){const days=Number(s.xhsConfirmDays)||15;const d=new Date();d.setDate(d.getDate()+days);s.xhsStatus='pending';s.xhsConfirmDueDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;s.xhsUpdatedAt=nowISO();}
        await dbPut('sales',s);
        await writeAudit('sale.restore','sale',s.id,`${s.orderNo} 已恢复（v4.4.4库存核对）`,null,{status:s.status,updatedAt:s.updatedAt,stockState:s.stockState});
        showToast('销售单已恢复，库存状态已核对');
        await renderSales();
      }catch(err){showToast(err?.message||'恢复失败，库存未继续修改');}
    });
  }

  async function repairCancelledSaleStock(id,{silent=false,noRender=false}={}){
    return withLock(`repair:${id}`,async()=>{
      const s=await dbGet('sales',id);
      if(!s||s.status!=='cancelled')throw new Error('只有已撤销销售单可以检查库存');
      if(s.importedHistorical||s.sourceType==='qinsilk_history')throw new Error('秦丝历史销售不参与当前库存');
      const result=await applySaleStockTarget(s,'cancelled',{reason:'撤销单库存修复'});
      await cancelAccessorySale(s);
      s.stockState='cancelled';s.stockStateVersion=2;s.updatedAt=nowISO();await dbPut('sales',s);
      const qty=result.changes.reduce((sum,x)=>sum+Math.max(0,n(x.delta)),0);
      await writeAudit('sale.stock_repair','sale',s.id,qty>EPS?`${s.orderNo} 修复撤销库存 +${fmtInt(qty)}`:`${s.orderNo} 撤销库存检查正常`,null,{repairedQty:qty});
      if(!silent)showToast(qty>EPS?`已修复：共恢复 ${fmtInt(qty)} 件库存`:'这张撤销单库存已经一致，无需修复');
      if(!noRender)await renderSales();
      return {repairedQty:qty};
    });
  }

  async function editSaleCustomer(id){
    const s=await dbGet('sales',id);if(!s)return;
    if(s.importedHistorical||s.sourceType==='qinsilk_history'){showToast('秦丝历史销售不建议修改客户');return;}
    const name=window.prompt('修改客户 / 销售对象名称（只改名称，不动库存）',s.customerName||'');
    if(name===null)return;
    const customerName=String(name||'').trim()||'散客';
    let customerId='';
    if(customerName!=='散客'){
      const customers=await dbAll('customers');let c=customers.find(x=>String(x.name||'').trim()===customerName);
      if(!c){c={id:uid('cust'),name:customerName,phone:'',note:'销售单修改客户时自动创建',createdAt:nowISO(),updatedAt:nowISO()};await dbPut('customers',c);}
      customerId=c.id;
    }
    const before={customerId:s.customerId||'',customerName:s.customerName||''};
    s.customerId=customerId;s.customerName=customerName;s.updatedAt=nowISO();await dbPut('sales',s);
    await writeAudit('sale.customer_update','sale',s.id,`${s.orderNo} 客户修改为 ${customerName}`,before,{customerId,customerName});
    showToast('客户名称已修改，库存没有变化');await renderSales();
  }

  async function duplicateSaleV2(id){
    try{
      const s=await dbGet('sales',id);
      if(s?.status==='cancelled')await repairCancelledSaleStock(id,{silent:true,noRender:true});
      return await originalDuplicateSale(id);
    }catch(err){showToast(err?.message||'复制前库存检查失败');}
  }

  // Replace only the sales state-transition handlers. Business creation logic stays untouched.
  window.cancelSale=cancelSaleV2;
  window.restoreSale=restoreSaleV2;
  window.duplicateSale=duplicateSaleV2;
  // Keep the global function bindings in sync for classic-script callers.
  try{cancelSale=cancelSaleV2;restoreSale=restoreSaleV2;duplicateSale=duplicateSaleV2;}catch(_){/* window assignments above are sufficient */}

  if(typeof originalSaleCard==='function'){
    const wrapped=function(s){
      let html=originalSaleCard(s);
      const historical=Boolean(s?.importedHistorical||s?.sourceType==='qinsilk_history');
      if(historical)return html;
      const edit=`<button class="btn small secondary edit-sale-customer" data-id="${esc(s.id)}">修改客户</button>`;
      if(s.status==='active'){
        html=html.replace(/(<button class="btn small danger cancel-sale"[^>]*>撤销销售<\/button>)/,`${edit}$1`);
      }else if(s.status==='cancelled'){
        const repair=`<button class="btn small secondary repair-sale-stock" data-id="${esc(s.id)}">检查库存</button>`;
        html=html.replace(/(<button class="btn small success restore-sale"[^>]*>恢复销售单<\/button>)/,`${repair}${edit}$1`);
      }
      return html;
    };
    window.saleCard=wrapped;try{saleCard=wrapped;}catch(_){}
  }

  document.addEventListener('click',e=>{
    const repair=e.target.closest('.repair-sale-stock');
    if(repair){e.preventDefault();e.stopPropagation();repairCancelledSaleStock(repair.dataset.id).catch(err=>showToast(err.message));return;}
    const edit=e.target.closest('.edit-sale-customer');
    if(edit){e.preventDefault();e.stopPropagation();editSaleCustomer(edit.dataset.id).catch(err=>showToast(err.message));}
  });

  window.MocuiSaleStockHotfix={version:VERSION,inspect:inspectSaleStock,repairCancelledSaleStock};
})();
