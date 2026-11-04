'use strict';
/* v4.7.9.1 安全兼容层：保留旧版销售库存核对，但绝不能覆盖新原子事务处理器。 */
(()=>{
  const VERSION='4.7.9.1',EPS=1e-8;
  const baseCancelSale=window.cancelSale,baseRestoreSale=window.restoreSale;
  const baseDuplicateSale=window.duplicateSale,baseSaleCard=window.saleCard;
  const activeLocks=new Set();
  const num=v=>Number(v||0);
  function grouped(sale){
    if(!sale?.items?.length)throw new Error('销售单缺少商品明细，已阻止库存修改');
    const map=new Map();
    for(const i of sale.items){
      const id=String(i?.productId||'');if(!id)throw new Error('销售单含无商品编号的明细，需人工核对');
      const mode=i.fromLoan&&i.loanId?(i.loanType==='lend'?'loan_lend':'loan_borrow'):'regular';
      const old=map.get(id);
      if(old?.mode&&old.mode!==mode)throw new Error(`商品 ${i.productName||id} 混合了两种出库来源，需人工核对`);
      if(old)old.qty+=num(i.qty);
      else map.set(id,{productId:id,productName:i.productName||id,qty:num(i.qty),mode});
    }
    return [...map.values()];
  }
  function referenced(m,saleId){const id=String(saleId);return m.refType==='sale'&&(String(m.refId)===id||String(m.refId).startsWith(`${id}::`));}
  async function inspectSaleStock(sale){
    const [moves,groups]=await Promise.all([dbAll('stockMoves'),Promise.resolve(grouped(sale))]);
    return groups.map(group=>{
      if(group.mode==='loan_lend')return {...group,tracked:true,net:0,targetActive:0,targetCancelled:0,related:[]};
      const validTypes=group.mode==='loan_borrow'?new Set(['loan_sale','loan_sale_cancel','loan_sale_restore']):new Set(['sale','sale_cancel','sale_restore']);
      const initial=group.mode==='loan_borrow'?'loan_sale':'sale';
      const related=moves.filter(m=>String(m.productId)===group.productId&&referenced(m,sale.id)&&validTypes.has(m.type));
      const net=related.reduce((sum,m)=>sum+num(m.qtyChange),0);
      return {...group,tracked:related.some(m=>m.type===initial),net,targetActive:-group.qty,targetCancelled:0,related};
    });
  }
  async function assertSafeTransition(sale,action){
    const target=action==='cancel'?'active':'cancelled';
    const rows=await inspectSaleStock(sale);
    const wrong=rows.filter(r=>!r.tracked||Math.abs(r.net-r[`target${target[0].toUpperCase()+target.slice(1)}`])>EPS);
    if(wrong.length){
      const detail=wrong.map(r=>`${r.productName}：本单库存影响 ${r.net}，期望 ${r[`target${target[0].toUpperCase()+target.slice(1)}`]}`).join('；');
      throw new Error(`发现旧销售库存流水不一致，已阻止自动${action==='cancel'?'撤销':'恢复'}：${detail}。请先导出备份并人工核对。`);
    }
    return rows;
  }
  async function lock(key,fn){if(activeLocks.has(key))return;activeLocks.add(key);try{return await fn();}finally{activeLocks.delete(key);}}
  function assertAtomicInstalled(){if(!window.MocuiAtomic479||typeof baseCancelSale!=='function'||typeof baseRestoreSale!=='function')throw new Error('销售原子事务模块尚未就绪，已暂停库存操作');}
  async function cancelSafely(id){return lock(`cancel:${id}`,async()=>{
    try{
      assertAtomicInstalled();const sale=await dbGet('sales',id);if(!sale||sale.status!=='active')return;
      if(sale.importedHistorical||sale.sourceType==='qinsilk_history')throw new Error('历史销售不得改变当前库存');
      await assertSafeTransition(sale,'cancel');return await baseCancelSale(id);
    }catch(e){showToast(e?.message||'撤销前库存核对失败，未作任何修改');}
  });}
  async function restoreSafely(id){return lock(`restore:${id}`,async()=>{
    try{
      assertAtomicInstalled();const sale=await dbGet('sales',id);if(!sale||sale.status!=='cancelled')return;
      if(sale.importedHistorical||sale.sourceType==='qinsilk_history')throw new Error('历史销售不得恢复库存');
      await assertSafeTransition(sale,'restore');return await baseRestoreSale(id);
    }catch(e){showToast(e?.message||'恢复前库存核对失败，未作任何修改');}
  });}
  async function checkCancelledSaleStock(id,{silent=false}={}){
    const sale=await dbGet('sales',id);
    if(!sale||sale.status!=='cancelled')throw new Error('只能核对已撤销销售单的库存');
    const rows=await inspectSaleStock(sale),wrong=rows.filter(r=>!r.tracked||Math.abs(r.net-r.targetCancelled)>EPS);
    if(!silent)showToast(wrong.length?`发现 ${wrong.length} 个商品库存流水不一致，未自动修改，请人工核对`:'库存流水检查通过，未修改任何商品');
    return {checked:true,readOnly:true,inconsistent:wrong.length,rows};
  }
  async function editSaleCustomer(id){
    const sale=await dbGet('sales',id);if(!sale||sale.importedHistorical||sale.sourceType==='qinsilk_history')return;
    const raw=window.prompt('修改客户 / 销售对象名称（仅修改文字，不改库存）',sale.customerName||'');if(raw===null)return;
    const name=String(raw||'').trim()||'散客',before={customerName:sale.customerName||''};
    let customerId='';
    if(name!=='散客'){
      const customers=await dbAll('customers');let c=customers.find(x=>String(x.name||'').trim()===name);
      if(!c){c={id:uid('cust'),name,phone:'',note:'修改销售客户时自动创建',createdAt:nowISO(),updatedAt:nowISO()};await dbPut('customers',c);}
      customerId=c.id;
    }
    const live=await dbGet('sales',id);if(!live||live.updatedAt!==sale.updatedAt||live.__mocuiAtomicRevision!==sale.__mocuiAtomicRevision)throw new Error('销售单已变化，请重新打开');
    live.customerId=customerId;live.customerName=name;live.updatedAt=nowISO();await dbPut('sales',live);
    await writeAudit('sale.customer_update','sale',live.id,`${live.orderNo} 客户修改为 ${name}`,before,{customerName:name});
    showToast('客户名称已保存，未修改库存');await renderSales();
  }
  window.cancelSale=cancelSafely;window.restoreSale=restoreSafely;
  try{cancelSale=cancelSafely;restoreSale=restoreSafely;}catch(_){/* 经典脚本定义已暴露在 window 上 */}
  // 复制销售单只做草稿复制，绝不再自动触发旧版逐件修复库存。
  if(typeof baseDuplicateSale==='function'){
    window.duplicateSale=async id=>baseDuplicateSale(id);
    try{duplicateSale=window.duplicateSale;}catch(_){ }
  }
  if(typeof baseSaleCard==='function'){
    const decorated=function(s){
      let html=baseSaleCard(s);
      if(s?.importedHistorical||s?.sourceType==='qinsilk_history')return html;
      const edit=`<button class="btn small secondary edit-sale-customer" data-id="${esc(s.id)}">修改客户</button>`;
      if(s.status==='active')html=html.replace(/(<button class="btn small danger cancel-sale"[^>]*>撤销销售<\/button>)/,`${edit}$1`);
      else if(s.status==='cancelled')html=html.replace(/(<button class="btn small success restore-sale"[^>]*>恢复销售单<\/button>)/,`<button class="btn small secondary repair-sale-stock" data-id="${esc(s.id)}">核对库存</button>${edit}$1`);
      return html;
    };
    window.saleCard=decorated;try{saleCard=decorated;}catch(_){ }
  }
  document.addEventListener('click',e=>{
    const inspect=e.target?.closest?.('.repair-sale-stock');
    if(inspect){e.preventDefault();e.stopPropagation();checkCancelledSaleStock(inspect.dataset.id).catch(err=>showToast(err?.message||'核对失败'));return;}
    const edit=e.target?.closest?.('.edit-sale-customer');
    if(edit){e.preventDefault();e.stopPropagation();editSaleCustomer(edit.dataset.id).catch(err=>showToast(err?.message||'修改客户失败'));}
  });
  window.MocuiSaleStockHotfix={version:VERSION,inspect:inspectSaleStock,repairCancelledSaleStock:checkCancelledSaleStock,cancelSafely,restoreSafely};
})();
