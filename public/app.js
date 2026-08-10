'use strict';

const DB_NAME = 'mocui_inventory_db';
const DB_VERSION = 2;
const STORES = ['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
const MAIN_ROUTES = new Set(['dashboard','products','sale-new','loans','reports','more']);
const ROUTE_PARENTS = {'product-detail':'products','product-content':'products',content:'more',customers:'more',stocktake:'more',ledger:'more',settings:'more',audit:'settings',health:'settings','qinsilk-import':'more'};
let db;
let routeStack=[];
let appState = { route:'dashboard', params:{}, saleDraft:null, loanDraft:null, qinsilkFiles:[], qinsilkBackupDone:false, qinsilkLastResult:null };
let navigationToken=0;
const routeScrollPositions=new Map();
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const nowISO = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}_${crypto.randomUUID()}`;
const n = v => Number(v || 0);
const fmtMoney = v => `¥${n(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtInt = v => n(v).toLocaleString('zh-CN',{maximumFractionDigits:2});
const fmtDateTime = v => v ? new Date(v).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '-';
const fmtDate = v => v ? new Date(v).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}) : '-';
const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const localInputDateTime = (date=new Date()) => {
  const off = date.getTimezoneOffset();
  return new Date(date.getTime()-off*60000).toISOString().slice(0,16);
};
const startOfDay = d => { const x=new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = d => { const x=new Date(d); x.setHours(23,59,59,999); return x; };
const daysAgo = days => { const d=new Date(); d.setDate(d.getDate()-days); return d; };
const daysBetween = (a,b=new Date()) => Math.floor((startOfDay(b)-startOfDay(new Date(a)))/86400000);

function showToast(message){
  const el=$('#toast'); el.textContent=message; el.classList.add('show');
  clearTimeout(showToast.t); showToast.t=setTimeout(()=>el.classList.remove('show'),2200);
}
function confirmDialog(message){ return Promise.resolve(window.confirm(message)); }
function downloadBlob(content, filename, type='application/octet-stream'){
  const blob = content instanceof Blob ? content : new Blob([content],{type});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function readFileAsDataURL(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
async function compressImage(file,maxSide=1280,quality=.78){
  const src=await readFileAsDataURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=reject;x.src=src;});
    const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',quality);
  }catch(_){return src;}
}
function readFileAsText(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsText(file,'utf-8'); }); }
function saveLocalDraft(key,value){ try{localStorage.setItem(key,JSON.stringify(value));}catch(_){/* 图片过大时仍保留当前会话草稿 */} }
function loadLocalDraft(key){ try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;} }
function clearLocalDraft(key){ try{localStorage.removeItem(key);}catch(_){} }
function auditSafe(value,depth=0){
  if(depth>5)return '[层级过深]';
  if(Array.isArray(value))return value.slice(0,20).map(v=>auditSafe(v,depth+1));
  if(value&&typeof value==='object'){const out={};for(const [k,v] of Object.entries(value)){if(['image','images','signedImages','ownerSignature','borrowerSignature'].includes(k)){out[k]=Array.isArray(v)?`[${v.length}个媒体文件]`:(v?'[媒体文件]':'');continue;}out[k]=auditSafe(v,depth+1);}return out;}
  if(typeof value==='string'&&value.length>500)return value.slice(0,500)+'…';
  return value;
}
async function writeAudit(action,entityType,entityId,summary,before=null,after=null){
  if(!db||window.__cloudImporting)return;
  const record={id:uid('audit'),action,entityType,entityId:String(entityId||''),summary:String(summary||''),before:auditSafe(before),after:auditSafe(after),deviceId:String(window.CloudSync?.deviceId||'').slice(0,80),createdAt:nowISO()};
  await dbPut('auditLogs',record,true);
  const rows=await dbAll('auditLogs');
  if(rows.length>1000){const old=rows.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(0,rows.length-1000);for(const row of old)await dbDelete('auditLogs',row.id,true);}
  window.CloudSync?.schedule();
}

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      STORES.forEach(name=>{ if(!d.objectStoreNames.contains(name)) d.createObjectStore(name,{keyPath:'id'}); });
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function reqP(req){ return new Promise((res,rej)=>{req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);}); }
async function dbGet(store,id){ return reqP(db.transaction(store,'readonly').objectStore(store).get(id)); }
async function dbAll(store){ return reqP(db.transaction(store,'readonly').objectStore(store).getAll()); }
async function waitForInitialCloudPull(silent=false){
  if(silent||window.__cloudImporting)return;
  const pending=window.__mocuiInitialPullPromise;
  if(pending)await pending.catch(()=>{});
}
async function dbPut(store,value,silent=false){ await waitForInitialCloudPull(silent);const r=await reqP(db.transaction(store,'readwrite').objectStore(store).put(value)); if(!silent&&!window.__cloudImporting)window.CloudSync?.schedule(); return r; }
async function dbAdd(store,value,silent=false){ await waitForInitialCloudPull(silent);const r=await reqP(db.transaction(store,'readwrite').objectStore(store).add(value)); if(!silent&&!window.__cloudImporting)window.CloudSync?.schedule(); return r; }
async function dbDelete(store,id,silent=false){ await waitForInitialCloudPull(silent);const r=await reqP(db.transaction(store,'readwrite').objectStore(store).delete(id)); if(!silent&&!window.__cloudImporting)window.CloudSync?.schedule(); return r; }
async function dbClear(store,silent=false){ await waitForInitialCloudPull(silent);const r=await reqP(db.transaction(store,'readwrite').objectStore(store).clear()); if(!silent&&!window.__cloudImporting)window.CloudSync?.schedule(); return r; }

async function ensureDefaults(){
  const categories=await dbAll('categories');
  if(!categories.length){
    for(const name of ['手镯','手串','吊坠','戒指','摆件','原石','其他']) await dbPut('categories',{id:uid('cat'),name,createdAt:nowISO()});
  }
}
async function nextProductCode(){
  const products=await dbAll('products');
  const max=products.reduce((m,p)=>Math.max(m,Number(String(p.code||'').replace(/\D/g,''))||0),0);
  return `MC${String(max+1).padStart(6,'0')}`;
}
async function nextOrderNo(){
  const sales=await dbAll('sales');
  const d=new Date(); const ymd=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const count=sales.filter(s=>String(s.orderNo||'').startsWith(`XS${ymd}`)).length+1;
  return `XS${ymd}${String(count).padStart(4,'0')}`;
}
async function nextLoanNo(){
  const rows=await dbAll('loans'); const d=new Date();
  const ymd=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  return `TJ${ymd}${String(rows.filter(x=>String(x.loanNo||'').startsWith(`TJ${ymd}`)).length+1).padStart(4,'0')}`;
}

async function adjustStock(productId, delta, type, refType, refId, note='', createdAt=nowISO()){
  const p=await dbGet('products',productId); if(!p) throw new Error('商品不存在');
  const before=n(p.stock), after=before+n(delta);
  if(after<0) throw new Error(`${p.name} 库存不足，当前库存 ${before}`);
  p.stock=after; p.updatedAt=nowISO(); await dbPut('products',p);
  await dbPut('stockMoves',{id:uid('move'),productId:p.id,productCode:p.code,productName:p.name,type,qtyChange:n(delta),beforeStock:before,afterStock:after,refType,refId,note,createdAt});
  await writeAudit(`stock.${type}`,'product',p.id,`${p.name} 库存 ${fmtInt(before)} → ${fmtInt(after)}`,{stock:before},{stock:after,refType,refId,note});
  return p;
}
async function validateStock(items, direction=-1){
  for(const item of items){
    const p=await dbGet('products',item.productId); if(!p) throw new Error(`商品 ${item.productName||''} 不存在`);
    if(direction<0 && n(p.stock)<n(item.qty)) throw new Error(`${p.name} 库存不足：库存 ${p.stock}，需要 ${item.qty}`);
  }
}
async function recordStockReference(productId,type,refType,refId,note='',createdAt=nowISO()){
  const p=await dbGet('products',productId);if(!p)throw new Error('商品不存在');
  await dbPut('stockMoves',{id:uid('move'),productId:p.id,productCode:p.code,productName:p.name,type,qtyChange:0,beforeStock:n(p.stock),afterStock:n(p.stock),refType,refId,note,createdAt});
  return p;
}

function dateRange(key, customStart, customEnd){
  const today=new Date(); let start,end;
  if(key==='today'){ start=startOfDay(today); end=endOfDay(today); }
  else if(key==='yesterday'){ const d=daysAgo(1); start=startOfDay(d); end=endOfDay(d); }
  else if(key==='tomorrow'){ const d=new Date(); d.setDate(d.getDate()+1); start=startOfDay(d); end=endOfDay(d); }
  else if(key==='7d'){ start=startOfDay(daysAgo(6)); end=endOfDay(today); }
  else if(key==='30d'){ start=startOfDay(daysAgo(29)); end=endOfDay(today); }
  else if(key==='custom'){ start=customStart?startOfDay(customStart):new Date(0); end=customEnd?endOfDay(customEnd):endOfDay(today); }
  else { start=new Date(0); end=new Date(8640000000000000); }
  return {start,end};
}
function inRange(date,{start,end}){ const t=new Date(date).getTime(); return t>=start.getTime()&&t<=end.getTime(); }
function calcSaleTotals(draft){
  const subtotal=(draft.items||[]).reduce((s,i)=>s+n(i.qty)*n(i.price),0);
  let discountAmount=0;
  if(draft.discountType==='amount'||draft.discountType==='round') discountAmount=Math.max(0,n(draft.discountValue));
  if(draft.discountType==='percent') discountAmount=subtotal*Math.min(100,Math.max(0,n(draft.discountValue)))/100;
  discountAmount=Math.min(subtotal,discountAmount);
  return {subtotal,discountAmount,finalAmount:Math.max(0,subtotal-discountAmount)};
}

function loanItemReturnedQty(loan,item){
  if(item && item.returnedQty!==undefined) return Math.min(n(item.qty),Math.max(0,n(item.returnedQty)));
  if(loan?.status==='returned') return n(item?.qty);
  return (loan?.returns||[]).reduce((sum,event)=>sum+n((event.items||[]).find(x=>x.productId===item?.productId)?.qty),0);
}
function loanItemSoldQty(loan,item){
  if(item && item.soldQty!==undefined) return Math.min(n(item.qty),Math.max(0,n(item.soldQty)));
  return (loan?.saleEvents||[]).filter(e=>e.status!=='cancelled').reduce((sum,event)=>sum+n((event.items||[]).find(x=>x.productId===item?.productId)?.qty),0);
}
function loanItemRemaining(loan,item){ return Math.max(0,n(item?.qty)-loanItemReturnedQty(loan,item)-loanItemSoldQty(loan,item)); }
function loanRemainingQty(loan){ return (loan?.items||[]).reduce((sum,item)=>sum+loanItemRemaining(loan,item),0); }
function loanReturnedTotal(loan){ return (loan?.items||[]).reduce((sum,item)=>sum+loanItemReturnedQty(loan,item),0); }
function loanSoldTotal(loan){ return (loan?.items||[]).reduce((sum,item)=>sum+loanItemSoldQty(loan,item),0); }
function loanIsPartial(loan){ return loanRemainingQty(loan)>0&&(loanReturnedTotal(loan)>0||loanSoldTotal(loan)>0); }
function loanIsOpen(loan){ return loanRemainingQty(loan)>0; }
function loanResolutionStatus(loan){
  if(loanRemainingQty(loan)>0)return 'active';
  const returned=loanReturnedTotal(loan),sold=loanSoldTotal(loan);
  if(sold>0&&returned>0)return 'completed';
  if(sold>0)return 'sold';
  return 'returned';
}
function refreshLoanStatus(loan){
  loan.status=loanResolutionStatus(loan);
  loan.returnedAt=loan.status==='returned'?(loan.returnedAt||nowISO()):null;
  loan.completedAt=loan.status!=='active'?(loan.completedAt||nowISO()):null;
  loan.updatedAt=nowISO();
  return loan;
}
function loanReturnEvents(loan){
  if((loan?.returns||[]).length) return loan.returns;
  if(loan?.status==='returned'&&loan?.returnedAt) return [{id:'legacy',date:loan.returnedAt,note:'旧版记录：全部归还',images:[],items:(loan.items||[]).map(i=>({productId:i.productId,productName:i.productName,color:i.color,qty:n(i.qty)}))}];
  return [];
}
function loanSaleEvents(loan){ return (loan?.saleEvents||[]).filter(e=>e.status!=='cancelled'); }

const DEFAULT_LEGAL_PROFILE={id:'legalProfile',partyAName:'漠翠珠宝',partyAIdNo:'',partyAPhone:'',partyAAddress:'',defaultDeliveryPlace:'',defaultDisputeCourt:'甲方住所地有管辖权的人民法院',updatedAt:''};
async function getLegalProfile(){return {...DEFAULT_LEGAL_PROFILE,...((await dbGet('settings','legalProfile'))||{})};}
function addDaysLocal(value,days=30){const d=value?new Date(value):new Date();d.setDate(d.getDate()+days);return localInputDateTime(d).slice(0,10);}
function loanDueDate(loan){return loan?.expectedReturnDate||addDaysLocal(loan?.date||loan?.createdAt||nowISO(),30);}
function loanOverdueDays(loan){if(!loanIsOpen(loan))return 0;const due=startOfDay(loanDueDate(loan)),today=startOfDay(new Date());return today>due?Math.floor((today-due)/86400000):0;}
function loanDaysToDue(loan){const due=startOfDay(loanDueDate(loan));return Math.ceil((due-startOfDay(new Date()))/86400000);}
function contractNoFor(loan,index=1){return `MC-${loan.loanNo||loan.id}-${String(index).padStart(2,'0')}`;}
function contractStatusName(doc){if(doc?.borrowerSignature||doc?.signedImages?.length)return '已有签署/确认凭证';if(doc?.savedAt)return '已保存未签';return '草稿';}
function safeDateOnly(v){return v?new Date(v).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}):'____年__月__日';}
function moneyCN(v){return `人民币 ${fmtMoney(v)} 元`;}
async function sha256Text(text){try{const data=new TextEncoder().encode(text),hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');}catch(_){return `local-${Date.now()}-${text.length}`;}}
async function copyText(text){try{await navigator.clipboard.writeText(text);showToast('已复制到剪贴板');}catch(_){const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();showToast('已复制到剪贴板');}}
function documentItemsTotal(items){return (items||[]).reduce((sum,i)=>sum+n(i.qty)*n(i.liabilityPrice),0);}
function buildWechatConfirmation(doc,loan){const qty=(doc.items||[]).reduce((s,i)=>s+n(i.qty),0),total=documentItemsTotal(doc.items);return `本人${doc.partyBName||loan.person}（微信号/手机号：${doc.partyBWechat||doc.partyBPhone||'________'}）确认：已于${safeDateOnly(doc.agreementDate)}收到${doc.partyAName||'甲方'}交付的《${doc.docType==='transfer'?'货品调拨/交接确认单':'货品借调及委托销售确认协议'}》（编号：${doc.contractNo}）所列货品，共${fmtInt(qty)}件，责任价合计${fmtMoney(total)}。本人已核对货品名称、编码、数量、图片及状态，同意未售货品最迟于${safeDateOnly(doc.dueDate)}归还；已售货品按约定期限结算。本人同意该确认信息、原始聊天记录、交接图片、付款和还货记录共同作为双方交易及履行情况的证据。`}
function documentBodyHTML(doc,loan,{print=false}={}){
  const total=documentItemsTotal(doc.items),qty=(doc.items||[]).reduce((s,i)=>s+n(i.qty),0),title=doc.docType==='transfer'?'货品调拨/交接确认单':'货品借调及委托销售确认协议';
  const rows=(doc.items||[]).map((i,idx)=>`<tr><td>${idx+1}</td><td>${esc(i.productName)}</td><td>${esc(i.productCode||'')}</td><td>${esc(i.color||'')}</td><td>${fmtInt(i.qty)}</td><td>${fmtMoney(i.liabilityPrice)}</td><td>${fmtMoney(n(i.qty)*n(i.liabilityPrice))}</td><td>${esc(i.productNote||'')}</td></tr>`).join('');
  const clauses=doc.docType==='transfer'?`<ol class="legal-clauses"><li>乙方确认已收到本确认单所列货品，并已核对名称、编码、颜色、数量、外观及交接图片。</li><li>本单作为双方货品交接、库存流转及后续归还、销售结算的凭证。货品所有权及结算方式以双方实际约定和后续记录为准。</li><li>乙方应妥善保管货品；发生销售、归还、损坏或遗失时，应及时通知甲方并形成书面或电子记录。</li><li>双方认可与本单对应的微信聊天原始记录、交接照片、系统流水、付款凭证、还货照片可作为履行情况的补充证据。</li></ol>`:`<ol class="legal-clauses"><li><strong>交付与验收：</strong>乙方确认已收到附件货品并完成核对；对数量、编码、外观或图片有异议的，应在收到后合理期限内及时提出，否则可结合交接图片和聊天记录认定交付情况。</li><li><strong>所有权与保管：</strong>货品在乙方完成销售结算前仍归甲方所有。乙方应妥善保管，未经甲方同意不得质押、赠与、擅自转交或以其他方式处分；经授权销售的除外。</li><li><strong>销售结算：</strong>乙方售出货品后，应在 ${fmtInt(doc.settlementDays||1)} 日内向甲方报告并结清对应款项。系统中关联销售单、付款记录及双方微信确认可作为结算依据。</li><li><strong>归还期限：</strong>未售货品应于 ${safeDateOnly(doc.dueDate)} 前完好归还。每次部分归还应记录时间、商品、数量、图片和备注，剩余货品继续承担保管与返还义务。</li><li><strong>灭失、损坏和擅自处分：</strong>乙方占有期间发生遗失、损坏、掉包、擅自处分或无法返还的，应按本协议所列责任价及可证明的实际损失承担责任；因货品自身自然属性或甲方原因造成的除外。</li><li><strong>违约责任：</strong>逾期返还或结算的，乙方应继续履行，并赔偿甲方实际损失及合理维权支出。双方约定逾期违约金暂按未履行责任金额每日万分之 ${fmtInt(doc.lateRateWan||3)} 计算；如司法机关依法调整，以生效裁判为准。</li><li><strong>证据约定：</strong>双方认可本协议、可靠电子签名或手写签名、按指印、微信原始聊天记录、交接和还货图片、系统业务流水、物流及支付记录均可用于证明合同订立与履行，但任何单一证据的证明力由司法机关依法认定。</li><li><strong>争议解决：</strong>协商不成的，向 ${esc(doc.disputeCourt||'有管辖权的人民法院')} 起诉；如该约定依法不具备管辖连接点，则按法定管辖处理。</li></ol>`;
  const sig=(label,src,name)=>`<div class="contract-sign"><div>${label}：${esc(name||'')}</div>${src?`<img src="${src}" alt="${label}签名">`:'<div class="signature-line">签名/盖章/按指印：________________</div>'}<div>签署日期：____年__月__日</div></div>`;
  return `<article class="contract-paper ${print?'print-paper':''}"><div class="contract-title">${title}</div><div class="contract-no">编号：${esc(doc.contractNo)}</div><div class="contract-parties"><p><strong>甲方（货品提供方）：</strong>${esc(doc.partyAName||'')}　证件/统一代码：${esc(doc.partyAIdNo||'未填写')}<br>电话：${esc(doc.partyAPhone||'未填写')}　地址：${esc(doc.partyAAddress||'未填写')}</p><p><strong>乙方（借调/接收方）：</strong>${esc(doc.partyBName||loan.person||'')}　证件/统一代码：${esc(doc.partyBIdNo||'未填写')}<br>电话：${esc(doc.partyBPhone||'未填写')}　微信号：${esc(doc.partyBWechat||'未填写')}<br>地址：${esc(doc.partyBAddress||'未填写')}</p></div><p>双方就货品借调、交接、保管、销售结算及归还事宜达成如下确认。交接日期：${safeDateOnly(doc.agreementDate)}；交接地点：${esc(doc.deliveryPlace||'未填写')}。</p><div class="contract-table-wrap"><table class="contract-table"><thead><tr><th>序号</th><th>商品</th><th>编码</th><th>颜色</th><th>数量</th><th>责任价</th><th>小计</th><th>商品备注</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4">合计</td><td>${fmtInt(qty)}</td><td colspan="2">${fmtMoney(total)}</td><td></td></tr></tfoot></table></div>${clauses}${doc.extraTerms?`<div class="contract-extra"><strong>其他约定：</strong>${esc(doc.extraTerms).replace(/\n/g,'<br>')}</div>`:''}<div class="contract-signatures">${sig('甲方',doc.ownerSignature,doc.partyAName)}${sig('乙方',doc.borrowerSignature,doc.partyBName)}</div><div class="contract-foot">生成时间：${fmtDateTime(doc.generatedAt||nowISO())}　系统记录号：${esc(doc.contractNo)}${doc.hash?`<br>内容校验值：${esc(doc.hash)}`:''}<br><strong>提示：</strong>本模板用于增强交易凭证，不构成律师出具的法律意见；合同效力和证据采信由司法机关结合身份、签署、交付及完整证据链依法认定。</div></article>`;
}
function contractPrintHTML(doc,loan){const body=documentBodyHTML(doc,loan,{print:true});return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${doc.contractNo}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#111;margin:0;background:#fff}.contract-paper{max-width:900px;margin:0 auto;padding:28px;font-size:13px;line-height:1.75}.contract-title{text-align:center;font-size:24px;font-weight:800}.contract-no{text-align:right;margin:5px 0 16px}.contract-parties{border:1px solid #222;padding:10px 14px}.contract-table{width:100%;border-collapse:collapse;font-size:11px}.contract-table th,.contract-table td{border:1px solid #333;padding:5px;vertical-align:top}.contract-table-wrap{overflow:visible;margin:14px 0}.legal-clauses{padding-left:22px}.legal-clauses li{margin:7px 0}.contract-signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:28px}.contract-sign img{max-width:210px;height:75px;object-fit:contain;border-bottom:1px solid #111}.signature-line{height:75px;padding-top:45px;border-bottom:1px solid #111}.contract-foot{margin-top:24px;font-size:10px;color:#555}.contract-extra{border:1px dashed #555;padding:10px;margin-top:12px}@media print{.contract-paper{padding:0}.contract-foot{page-break-inside:avoid}}</style></head><body>${body}</body></html>`;}
function openPrintWindow(html){const w=window.open('','_blank');if(!w){showToast('浏览器阻止了新窗口，请允许弹窗');return;}w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print();},500);}
function setupSignaturePad(canvas,existing=''){
  const ctx=canvas.getContext('2d'),ratio=Math.max(1,window.devicePixelRatio||1),rect=canvas.getBoundingClientRect();canvas.width=Math.max(300,Math.round(rect.width*ratio));canvas.height=Math.round(150*ratio);ctx.scale(ratio,ratio);ctx.lineWidth=2.2;ctx.lineCap='round';ctx.strokeStyle='#101828';let drawing=false,hasInk=false;
  const pos=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return {x:p.clientX-r.left,y:p.clientY-r.top};};
  const start=e=>{drawing=true;hasInk=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();};const move=e=>{if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();e.preventDefault();};const end=e=>{drawing=false;e.preventDefault?.();};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',end);
  if(existing){const img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,rect.width,150);hasInk=true;};img.src=existing;}
  return {clear(){ctx.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);hasInk=false;},value(){return hasInk?canvas.toDataURL('image/png'):'';}};
}
async function openLoanDocumentHub(loanId){
  const l=await dbGet('loans',loanId);if(!l)return;const docs=l.legalDocuments||[];
  openModal('凭证与合同',`<div class="notice warn">入口仅用于需要增强证据时使用。系统生成文本不等于自动成立或保证胜诉，建议让对方签字/按指印，或使用具备身份认证和防篡改能力的可靠电子签名。</div><div class="legal-doc-actions"><button id="createLoanAgreement" class="btn block">生成借调及委托销售协议</button><button id="createTransferSlip" class="btn secondary block">生成简版调拨/交接单</button></div><div class="section-title">已保存凭证 <small>${docs.length} 份</small></div><div class="list">${docs.length?docs.slice().reverse().map(d=>`<div class="list-item clickable saved-doc" data-doc-id="${d.id}"><div class="thumb placeholder">文</div><div class="item-main"><div class="item-title">${esc(d.docType==='transfer'?'调拨/交接单':'借调协议')} · ${esc(d.contractNo)}</div><div class="item-meta">${fmtDateTime(d.savedAt||d.generatedAt)} · ${contractStatusName(d)}</div></div><div>›</div></div>`).join(''):emptyState('文','尚未生成凭证')}</div>`,{full:true,onOpen:()=>{$('#createLoanAgreement').onclick=()=>openLoanContractForm(l.id,'agreement');$('#createTransferSlip').onclick=()=>openLoanContractForm(l.id,'transfer');$$('.saved-doc').forEach(el=>el.onclick=()=>openLoanContractForm(l.id,null,el.dataset.docId));}});
}
async function openLoanContractForm(loanId,docType='agreement',docId=''){
  const l=await dbGet('loans',loanId);if(!l)return;const profile=await getLegalProfile(),docs=l.legalDocuments||[],existing=docId?docs.find(x=>x.id===docId):null,index=existing?docs.findIndex(x=>x.id===existing.id)+1:docs.length+1;
  const doc=existing?JSON.parse(JSON.stringify(existing)):{id:uid('legal'),docType:docType||'agreement',contractNo:contractNoFor(l,index),partyAName:profile.partyAName,partyAIdNo:profile.partyAIdNo,partyAPhone:profile.partyAPhone,partyAAddress:profile.partyAAddress,partyBName:l.person||'',partyBIdNo:'',partyBPhone:'',partyBWechat:'',partyBAddress:'',agreementDate:(l.date||nowISO()).slice(0,10),dueDate:loanDueDate(l),deliveryPlace:profile.defaultDeliveryPlace||'',settlementDays:1,lateRateWan:3,disputeCourt:profile.defaultDisputeCourt||'甲方住所地有管辖权的人民法院',extraTerms:'',items:(l.items||[]).map(i=>({productId:i.productId,productName:i.productName,productCode:i.productCode,color:i.color,qty:n(i.qty),liabilityPrice:n(i.salePrice||i.costPrice),productNote:i.productNote||''})),ownerSignature:'',borrowerSignature:'',signedImages:[],generatedAt:nowISO(),savedAt:'',hash:''};
  const rows=()=>doc.items.map((i,idx)=>`<div class="contract-item-edit" data-contract-item="${idx}"><div class="item-main"><div class="item-title">${esc(i.productName)}</div><div class="item-meta">${esc(i.productCode||'')} · ${esc(i.color||'')} · 数量 ${fmtInt(i.qty)}</div>${i.productNote?`<div class="loan-product-note">商品备注：${esc(i.productNote)}</div>`:''}</div><div><div class="mini-label">责任价/件</div><input class="mini-input contract-liability" type="number" min="0" step="0.01" value="${n(i.liabilityPrice)}"></div></div>`).join('');
  openModal(existing?'查看/更新合同凭证':'生成合同凭证',`<form id="loanContractForm"><div class="notice">${esc(l.person)} · ${esc(l.loanNo)}<br>建议填写对方可核验的真实姓名、手机号和身份证号/统一社会信用代码。高价值货品优先纸面签字按指印或第三方可靠电子签名。</div><div class="loan-step-card"><div class="loan-step-title"><span>1</span> 双方身份与期限</div><div class="form-row"><div class="form-group"><label class="form-label">甲方真实姓名/主体名称 *</label><input id="partyAName" class="input" value="${esc(doc.partyAName)}" required></div><div class="form-group"><label class="form-label">甲方证件/统一代码</label><input id="partyAIdNo" class="input" value="${esc(doc.partyAIdNo)}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">甲方电话</label><input id="partyAPhone" class="input" value="${esc(doc.partyAPhone)}"></div><div class="form-group"><label class="form-label">甲方地址</label><input id="partyAAddress" class="input" value="${esc(doc.partyAAddress)}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">乙方真实姓名/主体名称 *</label><input id="partyBName" class="input" value="${esc(doc.partyBName)}" required></div><div class="form-group"><label class="form-label">乙方身份证/统一代码</label><input id="partyBIdNo" class="input" value="${esc(doc.partyBIdNo)}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">乙方电话</label><input id="partyBPhone" class="input" value="${esc(doc.partyBPhone)}"></div><div class="form-group"><label class="form-label">乙方微信号</label><input id="partyBWechat" class="input" value="${esc(doc.partyBWechat)}"></div></div><div class="form-group"><label class="form-label">乙方地址</label><input id="partyBAddress" class="input" value="${esc(doc.partyBAddress)}"></div><div class="form-row"><div class="form-group"><label class="form-label">交接日期</label><input id="agreementDate" class="input" type="date" value="${esc(doc.agreementDate)}"></div><div class="form-group"><label class="form-label">最迟归还日期</label><input id="dueDate" class="input" type="date" value="${esc(doc.dueDate)}"></div></div><div class="form-group"><label class="form-label">交接地点</label><input id="deliveryPlace" class="input" value="${esc(doc.deliveryPlace)}"></div></div><div class="loan-step-card"><div class="loan-step-title"><span>2</span> 商品责任价</div><div class="field-help">责任价用于发生无法返还、损坏或擅自处分时确定主张基础，不建议直接使用你的内部成本价；可按双方认可的结算价或合理市场价填写。</div>${rows()}<div id="contractTotal" class="total-box"></div></div><div class="loan-step-card"><div class="loan-step-title"><span>3</span> 结算与争议约定</div><div class="form-row"><div class="form-group"><label class="form-label">售出后几日内结算</label><input id="settlementDays" class="input" type="number" min="0" step="1" value="${n(doc.settlementDays)}"></div><div class="form-group"><label class="form-label">逾期日违约金（万分之）</label><input id="lateRateWan" class="input" type="number" min="0" step="0.1" value="${n(doc.lateRateWan)}"></div></div><div class="form-group"><label class="form-label">争议管辖</label><input id="disputeCourt" class="input" value="${esc(doc.disputeCourt)}"><div class="field-help">约定法院应与争议有实际联系。系统默认使用甲方住所地法院，并保留法定管辖兜底。</div></div><div class="form-group"><label class="form-label">其他约定</label><textarea id="extraTerms" class="textarea">${esc(doc.extraTerms)}</textarea></div></div><div class="loan-step-card"><div class="loan-step-title"><span>4</span> 签名和确认凭证</div><div class="signature-grid"><div><label class="form-label">甲方屏幕手写签名</label><canvas id="ownerSignatureCanvas" class="signature-pad"></canvas><button id="clearOwnerSignature" class="btn secondary small" type="button">清除甲方签名</button></div><div><label class="form-label">乙方屏幕手写签名</label><canvas id="borrowerSignatureCanvas" class="signature-pad"></canvas><button id="clearBorrowerSignature" class="btn secondary small" type="button">清除乙方签名</button></div></div><div class="notice warn" style="margin-top:10px">屏幕手写签名可增强证据，但不当然等同于经身份认证、防篡改的“可靠电子签名”。重要交易建议打印后手写签字并按指印，或使用合规第三方电子签约服务。</div><div class="form-group"><label class="form-label">签字页、按指印照片或微信明确确认截图</label><label class="upload-box loan-upload-box" for="contractEvidenceImages"><strong>＋ 上传确认凭证</strong><span>最多12张，每次保存不会覆盖借调原始图片</span></label><input id="contractEvidenceImages" class="hidden" type="file" accept="image/*" multiple><div id="contractEvidencePreview" class="upload-preview loan-image-preview"></div></div></div><div class="loan-step-card"><div class="loan-step-title"><span>5</span> 合同预览</div><div id="contractPreview" class="contract-preview"></div></div><div class="legal-bottom-actions"><button id="copyWechatConfirm" class="btn secondary" type="button">复制微信确认文案</button><button id="printContract" class="btn secondary" type="button">打印/存为PDF</button><button id="downloadContract" class="btn secondary" type="button">下载HTML副本</button><button class="btn block" type="submit">保存合同快照</button></div></form>`,{full:true,onOpen:()=>{
    const ownerPad=setupSignaturePad($('#ownerSignatureCanvas'),doc.ownerSignature),borrowerPad=setupSignaturePad($('#borrowerSignatureCanvas'),doc.borrowerSignature);
    const sync=()=>{doc.partyAName=$('#partyAName').value.trim();doc.partyAIdNo=$('#partyAIdNo').value.trim();doc.partyAPhone=$('#partyAPhone').value.trim();doc.partyAAddress=$('#partyAAddress').value.trim();doc.partyBName=$('#partyBName').value.trim();doc.partyBIdNo=$('#partyBIdNo').value.trim();doc.partyBPhone=$('#partyBPhone').value.trim();doc.partyBWechat=$('#partyBWechat').value.trim();doc.partyBAddress=$('#partyBAddress').value.trim();doc.agreementDate=$('#agreementDate').value;doc.dueDate=$('#dueDate').value;doc.deliveryPlace=$('#deliveryPlace').value.trim();doc.settlementDays=n($('#settlementDays').value);doc.lateRateWan=n($('#lateRateWan').value);doc.disputeCourt=$('#disputeCourt').value.trim();doc.extraTerms=$('#extraTerms').value;$$('[data-contract-item]').forEach(el=>{doc.items[n(el.dataset.contractItem)].liabilityPrice=n($('.contract-liability',el).value);});doc.ownerSignature=ownerPad.value()||doc.ownerSignature;doc.borrowerSignature=borrowerPad.value()||doc.borrowerSignature;};
    const renderEvidence=()=>{$('#contractEvidencePreview').innerHTML=(doc.signedImages||[]).map((src,idx)=>`<div class="upload-thumb-wrap"><img src="${src}" alt="确认凭证 ${idx+1}"><button type="button" class="remove-contract-image" data-index="${idx}">×</button></div>`).join('');$$('.remove-contract-image').forEach(btn=>btn.onclick=()=>{doc.signedImages.splice(n(btn.dataset.index),1);renderEvidence();});};
    const update=()=>{sync();$('#contractTotal').innerHTML=`<div class="total-row grand"><span>责任价合计</span><strong>${fmtMoney(documentItemsTotal(doc.items))}</strong></div>`;$('#contractPreview').innerHTML=documentBodyHTML({...doc,hash:''},l);};
    ['partyAName','partyAIdNo','partyAPhone','partyAAddress','partyBName','partyBIdNo','partyBPhone','partyBWechat','partyBAddress','agreementDate','dueDate','deliveryPlace','settlementDays','lateRateWan','disputeCourt','extraTerms'].forEach(id=>$('#'+id).oninput=update);$$('.contract-liability').forEach(x=>x.oninput=update);
    $('#clearOwnerSignature').onclick=()=>{ownerPad.clear();doc.ownerSignature='';update();};$('#clearBorrowerSignature').onclick=()=>{borrowerPad.clear();doc.borrowerSignature='';update();};
    $('#contractEvidenceImages').onchange=async e=>{const room=Math.max(0,12-(doc.signedImages||[]).length);for(const f of [...e.target.files].slice(0,room))(doc.signedImages||(doc.signedImages=[])).push(await compressImage(f,1280,.75));e.target.value='';renderEvidence();};
    $('#copyWechatConfirm').onclick=()=>{sync();copyText(buildWechatConfirmation(doc,l));};$('#printContract').onclick=async()=>{sync();const clone={...doc,generatedAt:doc.generatedAt||nowISO()};const noHash=contractPrintHTML({...clone,hash:''},l),hash=await sha256Text(noHash);clone.hash=hash;openPrintWindow(contractPrintHTML(clone,l));};$('#downloadContract').onclick=async()=>{sync();const clone={...doc,generatedAt:doc.generatedAt||nowISO()};const raw=contractPrintHTML({...clone,hash:''},l);clone.hash=await sha256Text(raw);downloadBlob(contractPrintHTML(clone,l),`${clone.contractNo}_${clone.docType==='transfer'?'调拨交接单':'借调协议'}.html`,'text/html;charset=utf-8');};
    renderEvidence();update();
    $('#loanContractForm').onsubmit=async e=>{e.preventDefault();sync();if(!doc.partyAName||!doc.partyBName){showToast('请填写双方真实姓名或主体名称');return;}if(!doc.dueDate){showToast('请填写最迟归还日期');return;}doc.generatedAt=doc.generatedAt||nowISO();doc.savedAt=nowISO();const raw=contractPrintHTML({...doc,hash:''},l);doc.hash=await sha256Text(raw);doc.confirmationText=buildWechatConfirmation(doc,l);const current=await dbGet('loans',l.id),arr=current.legalDocuments||[],pos=arr.findIndex(x=>x.id===doc.id);if(pos>=0)arr[pos]=doc;else arr.push(doc);current.legalDocuments=arr;current.expectedReturnDate=doc.dueDate||current.expectedReturnDate;current.updatedAt=nowISO();await dbPut('loans',current);await writeAudit('loan.document','loan',current.id,`${doc.contractNo} 合同/凭证已保存`,null,{docType:doc.docType,dueDate:doc.dueDate,hash:doc.hash});await dbPut('settings',{...profile,id:'legalProfile',partyAName:doc.partyAName,partyAIdNo:doc.partyAIdNo,partyAPhone:doc.partyAPhone,partyAAddress:doc.partyAAddress,defaultDeliveryPlace:doc.deliveryPlace,defaultDisputeCourt:doc.disputeCourt,updatedAt:nowISO()});closeModal();showToast('合同快照已保存，内容校验值已生成');await openLoanDocumentHub(l.id);};
  }});
}


function setHeader(title,subtitle='',action=null){
  $('.brand').textContent=title; $('#pageSubtitle').textContent=subtitle;
  const back=$('#pageBack');const canBack=!MAIN_ROUTES.has(appState.route)&&(routeStack.length>0||ROUTE_PARENTS[appState.route]);
  if(back){back.classList.toggle('hidden',!canBack);back.onclick=()=>goBack();}
  const btn=$('#topAction'); btn.onclick=null;
  if(action){btn.classList.remove('hidden');btn.textContent=action.label||'＋';btn.onclick=action.onClick;} else btn.classList.add('hidden');
}
function navRouteFor(route){
  if(route==='dashboard' || route==='sale-new') return 'dashboard';
  if(route==='products' || route.startsWith('product')) return 'products';
  if(route==='loans' || route.startsWith('loan')) return 'loans';
  if(route==='reports') return 'reports';
  if(route==='more' || ['content','shortcut-setup','customers','stocktake','ledger','settings','audit','health','sales','qinsilk-import'].includes(route)) return 'more';
  return route;
}
function setActiveNav(route){
  const target=navRouteFor(route);
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===target));
}
async function navigate(route,params={},options={}){
  const {reset=false,fromBack=false,restoreScroll=null}=options;
  const currentKey=`${appState.route}:${JSON.stringify(appState.params||{})}`;
  routeScrollPositions.set(currentKey,window.scrollY||0);
  if(reset)routeStack=[];
  else if(!fromBack&&appState.route!==route)routeStack.push({route:appState.route,params:appState.params,scrollY:window.scrollY||0});

  const token=++navigationToken;
  const main=$('#main');
  main?.classList.add('route-changing');
  main?.setAttribute('aria-busy','true');
  await nextFrame();

  appState.route=route;
  appState.params=params;
  setActiveNav(route);
  await render();
  if(token!==navigationToken)return;

  const targetKey=`${route}:${JSON.stringify(params||{})}`;
  const saved=restoreScroll ?? (fromBack?routeScrollPositions.get(targetKey):0) ?? 0;
  window.scrollTo({top:saved,left:0,behavior:'instant'});
  main?.classList.remove('route-changing');
  main?.classList.add('route-entering');
  main?.removeAttribute('aria-busy');
  requestAnimationFrame(()=>requestAnimationFrame(()=>main?.classList.remove('route-entering')));
  enhanceCurrentPage();
}
async function goBack(){
  const previous=routeStack.pop()||{route:ROUTE_PARENTS[appState.route]||'dashboard',params:{},scrollY:0};
  await navigate(previous.route,previous.params||{},{fromBack:true,restoreScroll:previous.scrollY||0});
}

let modalHistoryActive=false;
let modalCloseGuard=null;
function openModal(title,content,{full=false,onOpen=null,closeLabel='×',guardClose=null}={}){
  const root=$('#modalRoot');
  const wasOpen=Boolean(root.innerHTML);
  if(!wasOpen){
    history.pushState({...history.state,mocuiModal:true},'',location.href);
    modalHistoryActive=true;
  }
  modalCloseGuard=guardClose;
  root.innerHTML=`<div class="modal-backdrop"><section class="modal ${full?'full':''}"><div class="modal-head"><div class="modal-title">${esc(title)}</div><button class="modal-close ${closeLabel!=='×'?'text-close':''}" type="button" aria-label="返回">${esc(closeLabel)}</button></div><div class="modal-body">${content}</div></section></div>`;
  $('.modal-close',root).onclick=()=>closeModal();
  $('.modal-backdrop',root).addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal();});
  if(onOpen) onOpen(root);
}
function closeModal(fromHistory=false){
  if(!fromHistory&&modalCloseGuard&&modalCloseGuard()===false)return;
  modalCloseGuard=null;
  $('#modalRoot').innerHTML='';
  if(modalHistoryActive&&!fromHistory){
    modalHistoryActive=false;
    history.back();
  }else modalHistoryActive=false;
}
window.addEventListener('popstate',()=>{
  if($('#modalRoot').innerHTML) closeModal(true);
});

function emptyState(icon,title,text=''){
  return `<div class="empty"><div class="emoji">${icon}</div><strong>${esc(title)}</strong>${text?`<div class="item-meta">${esc(text)}</div>`:''}</div>`;
}
function imageThumb(p){ return p.image?`<img class="thumb" src="${esc(p.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:`<div class="thumb placeholder">玉</div>`; }
function productListItem(p){
  return `<div class="list-item clickable" data-product-id="${p.id}">${imageThumb(p)}<div class="item-main"><div class="item-title">${esc(p.name)}</div><div class="item-meta">${esc(p.code)} · ${esc(p.category||'未分类')} · ${esc(p.color||'未填写颜色')}</div><div class="item-meta">成本 ${fmtMoney(p.costPrice)}　售价 ${fmtMoney(p.salePrice)}</div></div><div class="item-right"><span class="badge ${n(p.stock)<=0?'danger':n(p.stock)<=1?'warn':'success'}">库存 ${fmtInt(p.stock)}</span></div></div>`;
}

function enhanceCurrentPage(){
  $$('#main input[type="number"]').forEach(input=>{
    if(!input.hasAttribute('inputmode')) input.setAttribute('inputmode','decimal');
  });
  $$('#main button,.bottom-nav button,.topbar button').forEach(button=>{
    button.style.touchAction='manipulation';
  });
}

function setupViewportBehavior(){
  const viewport=window.visualViewport;
  if(!viewport)return;
  const isEditableFocused=()=>{
    const el=document.activeElement;
    if(!el||el===document.body)return false;
    return el.matches('textarea, select, [contenteditable="true"], input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])');
  };
  const update=()=>{
    // iOS 在页面高度、地址栏或横向标签变化时也会触发 visualViewport resize。
    // 只有可编辑控件真正获得焦点并且可视高度明显缩小时，才视为键盘打开。
    const viewportShrink=Math.max(0,window.innerHeight-viewport.height);
    const keyboardOpen=isEditableFocused()&&viewportShrink>120;
    document.body.classList.toggle('keyboard-open',keyboardOpen);
    document.documentElement.style.setProperty('--visual-viewport-height',`${viewport.height}px`);
  };
  viewport.addEventListener('resize',update,{passive:true});
  viewport.addEventListener('scroll',update,{passive:true});
  document.addEventListener('focusin',update,{passive:true});
  document.addEventListener('focusout',()=>setTimeout(update,80),{passive:true});
  update();
}

async function render(){
  const routes={
    dashboard:renderDashboard, products:renderProducts, 'product-detail':renderProductDetail,
    'sale-new':renderSaleNew, sales:renderSales, loans:renderLoans, reports:renderReports,
    more:renderMore, content:renderContentHub, 'product-content':renderProductContent, 'shortcut-setup':renderShortcutSetup, customers:renderCustomers, stocktake:renderStocktake, ledger:renderLedger, settings:renderSettings, audit:renderAuditLogs, health:renderInventoryHealth, 'qinsilk-import':renderQinsilkImport
  };
  try{ await (routes[appState.route]||renderDashboard)(); }catch(err){ console.error(err); $('#main').innerHTML=`<div class="notice danger">页面加载失败：${esc(err.message)}</div>`; }
}

async function renderDashboard(){
  setHeader('漠翠进销存','经营概况');
  const [products,sales,loans]=await Promise.all([dbAll('products'),dbAll('sales'),dbAll('loans')]);
  const activeSales=sales.filter(s=>s.status==='active');
  const today=dateRange('today'), monthStart=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const todaySales=activeSales.filter(s=>inRange(s.createdAt,today));
  const monthSales=activeSales.filter(s=>new Date(s.createdAt)>=monthStart);
  const inventoryQty=products.reduce((s,p)=>s+n(p.stock),0);
  const inventoryCost=products.reduce((s,p)=>s+n(p.stock)*n(p.costPrice),0);
  const sumAmount=rows=>rows.reduce((s,r)=>s+n(r.finalAmount),0);
  const profit=rows=>rows.reduce((s,r)=>s+r.items.reduce((x,i)=>x+(n(i.price)-n(i.costPrice))*n(i.qty),0)-n(r.discountAmount),0);
  const overdue=loans.filter(l=>loanOverdueDays(l)>0);
  const dueSoon=loans.filter(l=>loanIsOpen(l)&&loanDaysToDue(l)>=0&&loanDaysToDue(l)<=7);
  $('#main').innerHTML=`
    <div class="grid-2">
      <div class="metric"><div class="label">今日销售额</div><div class="value money">${fmtMoney(sumAmount(todaySales))}</div><div class="hint">${todaySales.length} 笔销售</div></div>
      <div class="metric"><div class="label">今日毛利润</div><div class="value money">${fmtMoney(profit(todaySales))}</div><div class="hint">按商品成本估算</div></div>
      <div class="metric"><div class="label">本月销售额</div><div class="value money">${fmtMoney(sumAmount(monthSales))}</div><div class="hint">${monthSales.length} 笔销售</div></div>
      <div class="metric"><div class="label">本月毛利润</div><div class="value money">${fmtMoney(profit(monthSales))}</div><div class="hint">已扣订单优惠</div></div>
    </div>
    <div class="section-title">商品仓库 <small>实时库存</small></div>
    <div class="grid-3">
      <div class="metric compact"><div class="label">商品数量</div><div class="value">${products.length}</div></div>
      <div class="metric compact"><div class="label">库存总数</div><div class="value">${fmtInt(inventoryQty)}</div></div>
      <div class="metric compact"><div class="label">库存成本</div><div class="value">${fmtMoney(inventoryCost)}</div></div>
    </div>
    ${(overdue.length||dueSoon.length)?`<div class="section-title ${overdue.length?'danger-text':''}">调借到期提醒 <small>${overdue.length} 单超期 · ${dueSoon.length} 单7天内到期</small></div><div class="list">${[...overdue,...dueSoon.filter(x=>!overdue.includes(x))].slice(0,6).map(loanListItem).join('')}</div>`:''}
    <div class="section-title">快捷操作</div>
    <div class="grid-2">
      <button class="btn block" id="quickSale">销售开单</button><button class="btn secondary block" id="quickProduct">新增商品</button>
      <button class="btn secondary block" id="quickLoan">新增调借</button><button class="btn secondary block" id="quickStocktake">库存盘点</button>
    </div>
    <button class="content-dashboard-link" id="quickContent"><span><strong>内容工作台</strong><small>今日待发 · 图片视频 · 文案 · 重复曝光</small></span><b>›</b></button>`;
  $('#quickSale').onclick=()=>navigate('sale-new'); $('#quickProduct').onclick=()=>openProductForm(); $('#quickLoan').onclick=()=>openLoanForm(); $('#quickStocktake').onclick=()=>navigate('stocktake'); $('#quickContent').onclick=()=>navigate('content');
}

async function renderProducts(){
  setHeader('商品管理','查询、编辑、复制、批量上传',{label:'＋',onClick:()=>openProductForm()});
  const [products,categories]=await Promise.all([dbAll('products'),dbAll('categories')]);
  const activeProducts=products.filter(p=>n(p.stock)>0), soldOutCount=products.length-activeProducts.length;
  const qty=activeProducts.reduce((s,p)=>s+n(p.stock),0), cost=activeProducts.reduce((s,p)=>s+n(p.stock)*n(p.costPrice),0);
  $('#main').innerHTML=`
    <div class="grid-3">
      <div class="metric compact"><div class="label">在售商品</div><div class="value">${activeProducts.length}</div><div class="hint">售罄隐藏 ${soldOutCount}</div></div>
      <div class="metric compact"><div class="label">库存总数</div><div class="value">${fmtInt(qty)}</div></div>
      <div class="metric compact"><div class="label">库存成本</div><div class="value">${fmtMoney(cost)}</div></div>
    </div>
    <div class="product-filter-row" style="margin-top:12px"><div class="search"><input id="productSearch" placeholder="名称 / 编码 / 颜色"></div><select id="categoryFilter" class="filter-select"><option value="">全部分类</option>${categories.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select><select id="stockFilter" class="filter-select"><option value="in" selected>有库存</option><option value="">全部</option><option value="low">低库存（1件）</option><option value="out">已售罄</option></select></div>
    <div class="btn-row" style="margin-bottom:10px"><button class="btn secondary small" id="batchImport">批量上传</button><button class="btn secondary small" id="manageCategory">分类管理</button><button class="btn secondary small" id="exportProducts">导出商品</button></div>
    <div id="productList" class="list"></div>`;
  const draw=()=>{
    const q=$('#productSearch').value.trim().toLowerCase(), cat=$('#categoryFilter').value, stock=$('#stockFilter').value;
    const stockOK=p=>!stock||(stock==='in'&&n(p.stock)>0)||(stock==='low'&&n(p.stock)>0&&n(p.stock)<=1)||(stock==='out'&&n(p.stock)<=0);
    const rows=products.filter(p=>(!cat||p.category===cat)&&stockOK(p)&&(!q||[p.name,p.code,p.color,p.category].some(v=>String(v||'').toLowerCase().includes(q)))).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    $('#productList').innerHTML=rows.length?rows.map(productListItem).join(''):emptyState('⌕','没有找到商品','可调整关键词或分类');
    $$('#productList [data-product-id]').forEach(el=>el.onclick=()=>navigate('product-detail',{id:el.dataset.productId}));
  };
  draw(); $('#productSearch').oninput=draw; $('#categoryFilter').onchange=draw; $('#stockFilter').onchange=draw;
  $('#batchImport').onclick=openBatchImport; $('#manageCategory').onclick=openCategoryManager; $('#exportProducts').onclick=()=>exportProductsCSV(products);
}

async function openProductForm(product=null,{copy=false}={}){
  const categories=await dbAll('categories'); const code=copy||!product?await nextProductCode():product.code;
  const recovered=!product&&!copy?loadLocalDraft('mocui_product_draft_v1'):null;
  const p=product||recovered||{};
  openModal(copy?'复制商品':product?'编辑商品':'新增商品',`
    <form id="productForm">
      <div class="form-group"><label class="form-label">商品图片</label><label class="upload-box" for="productImage">点击选择图片<br>建议上传正方形或竖图</label><input id="productImage" type="file" accept="image/*" class="hidden"><div id="productImagePreview" class="upload-preview">${p.image?`<img src="${p.image}" alt="">`:''}</div></div>
      <div class="form-group"><label class="form-label">商品名称 *</label><input class="input" name="name" required value="${esc(p.name||'')}"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">商品编码</label><input class="input" name="code" value="${esc(p.code||code)}"></div><div class="form-group"><label class="form-label">分类</label><select class="select" name="category"><option value="">未分类</option>${categories.map(c=>`<option ${p.category===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div>
      <div class="form-group"><label class="form-label">商品颜色</label><input class="input" name="color" value="${esc(p.color||'')}" placeholder="如：白色、菠菜绿、晴水色"></div>
      <div class="form-row three"><div class="form-group"><label class="form-label">成本价</label><input class="input" name="costPrice" type="number" min="0" step="0.01" value="${n(p.costPrice)}"></div><div class="form-group"><label class="form-label">销售价</label><input class="input" name="salePrice" type="number" min="0" step="0.01" value="${n(p.salePrice)}"></div><div class="form-group"><label class="form-label">库存</label><input class="input" name="stock" type="number" min="0" step="1" value="${copy?0:n(p.stock)}" ${product&&!copy?'readonly':''}></div></div>
      ${product&&!copy?`<div class="notice warn">编辑商品时库存不可直接改，请使用“盘点”或“入库/出库”，这样库存流水不会丢失。</div>`:''}
      <div class="form-group"><label class="form-label">备注</label><textarea class="textarea" name="note">${esc(p.note||'')}</textarea></div>
      <button class="btn block" type="submit">保存商品</button>
    </form>`,{guardClose:()=>{if(!window.__mocuiProductDirty)return true;return window.confirm('商品内容尚未保存。确定退出吗？草稿会保留在这台手机。');},onOpen:root=>{
      let image=p.image||'';window.__mocuiProductDirty=false;
      let draftTimer=null;const saveDraft=()=>{if(product||copy)return;clearTimeout(draftTimer);draftTimer=setTimeout(()=>{const fd=new FormData($('#productForm',root));saveLocalDraft('mocui_product_draft_v1',{name:String(fd.get('name')||''),code:String(fd.get('code')||''),category:String(fd.get('category')||''),color:String(fd.get('color')||''),costPrice:n(fd.get('costPrice')),salePrice:n(fd.get('salePrice')),stock:n(fd.get('stock')),note:String(fd.get('note')||''),image});},250);};
      $('#productForm',root).addEventListener('input',()=>{window.__mocuiProductDirty=true;saveDraft();});
      $('#productImage',root).onchange=async e=>{const f=e.target.files[0]; if(!f)return; image=await compressImage(f);window.__mocuiProductDirty=true;saveDraft(); $('#productImagePreview',root).innerHTML=`<img src="${image}" alt="">`;};
      $('#productForm',root).onsubmit=async e=>{
        e.preventDefault(); const fd=new FormData(e.target); const oldStock=n(p.stock), newStock=n(fd.get('stock'));
        const obj={...(product&&!copy?p:{}),id:copy||!product?uid('prod'):p.id,name:String(fd.get('name')).trim(),code:String(fd.get('code')).trim()||await nextProductCode(),category:String(fd.get('category')),color:String(fd.get('color')).trim(),costPrice:n(fd.get('costPrice')),salePrice:n(fd.get('salePrice')),stock:product&&!copy?oldStock:newStock,note:String(fd.get('note')).trim(),image,createdAt:copy||!product?nowISO():p.createdAt,updatedAt:nowISO()};
        if(!obj.name){showToast('请填写商品名称');return;}
        const before=product?auditSafe(product):null;await dbPut('products',obj);
        if((copy||!product)&&obj.stock!==0) await dbPut('stockMoves',{id:uid('move'),productId:obj.id,productCode:obj.code,productName:obj.name,type:'initial',qtyChange:obj.stock,beforeStock:0,afterStock:obj.stock,refType:'product',refId:obj.id,note:'新建商品初始库存',createdAt:nowISO()});
        await writeAudit(product?'product.update':copy?'product.copy':'product.create','product',obj.id,`${obj.name} 已保存`,before,obj);clearLocalDraft('mocui_product_draft_v1');window.__mocuiProductDirty=false;closeModal(); showToast('商品已保存'); await navigate('products');
      };
    }});
}

async function openCategoryManager(){
  const draw=async()=>{
    const categories=(await dbAll('categories')).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
    $('#categoryRows').innerHTML=categories.map(c=>`<div class="list-item"><div class="item-main"><div class="item-title">${esc(c.name)}</div></div><button class="btn small secondary edit-cat" data-id="${c.id}">修改</button><button class="btn small danger del-cat" data-id="${c.id}">删除</button></div>`).join('')||emptyState('◫','暂无分类');
    $$('.edit-cat').forEach(b=>b.onclick=async()=>{const c=await dbGet('categories',b.dataset.id); const name=prompt('修改分类名称',c.name); if(name&&name.trim()){const products=await dbAll('products'); for(const p of products.filter(x=>x.category===c.name)){p.category=name.trim();await dbPut('products',p);} c.name=name.trim();await dbPut('categories',c);draw();}});
    $$('.del-cat').forEach(b=>b.onclick=async()=>{if(await confirmDialog('删除分类后，商品会变为未分类。确定删除？')){const c=await dbGet('categories',b.dataset.id); const products=await dbAll('products'); for(const p of products.filter(x=>x.category===c.name)){p.category='';await dbPut('products',p);} await dbDelete('categories',c.id);draw();}});
  };
  openModal('分类管理',`<div class="form-row"><input id="newCategory" class="input" placeholder="输入新分类"><button id="addCategory" class="btn">添加</button></div><div class="spacer"></div><div id="categoryRows" class="list"></div>`,{onOpen:()=>{draw();$('#addCategory').onclick=async()=>{const name=$('#newCategory').value.trim();if(!name)return;await dbPut('categories',{id:uid('cat'),name,createdAt:nowISO()});$('#newCategory').value='';draw();};}});
}

function parseCSV(text){
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;}
    else if(ch==='"'){quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()))rows.push(row);row=[];}
    else cell+=ch;
  }
  row.push(cell); if(row.some(x=>x.trim())) rows.push(row); return rows;
}
async function openBatchImport(){
  openModal('批量上传商品',`
    <div class="notice warn">CSV 表头：商品名称、分类、颜色、成本价、销售价、库存数量、商品编码。编码留空会自动生成。批量图片可在导入后逐个商品补充。</div>
    <label class="upload-box" for="csvFile">点击选择 CSV 文件</label><input id="csvFile" class="hidden" type="file" accept=".csv,text/csv">
    <div id="csvPreview" class="spacer"></div><button id="doImport" class="btn block" disabled>确认导入</button>`,{onOpen:()=>{
      let parsed=[];
      $('#csvFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;const text=await readFileAsText(f);const rows=parseCSV(text);if(rows.length<2){showToast('CSV 没有商品数据');return;}const headers=rows[0].map(x=>x.trim());parsed=rows.slice(1).map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()]))).filter(x=>x['商品名称']);$('#csvPreview').innerHTML=`<div class="notice success">识别到 ${parsed.length} 个商品</div>`;$('#doImport').disabled=!parsed.length;};
      $('#doImport').onclick=async()=>{for(const row of parsed){const stock=n(row['库存数量']), code=row['商品编码']||await nextProductCode(), category=row['分类']||'';if(category){const cats=await dbAll('categories');if(!cats.some(c=>c.name===category))await dbPut('categories',{id:uid('cat'),name:category,createdAt:nowISO()});}const p={id:uid('prod'),name:row['商品名称'],category,color:row['颜色']||'',costPrice:n(row['成本价']),salePrice:n(row['销售价']),stock,code,note:'',image:'',createdAt:nowISO(),updatedAt:nowISO()};await dbPut('products',p);if(stock)await dbPut('stockMoves',{id:uid('move'),productId:p.id,productCode:p.code,productName:p.name,type:'initial',qtyChange:stock,beforeStock:0,afterStock:stock,refType:'import',refId:p.id,note:'批量导入初始库存',createdAt:nowISO()});}closeModal();showToast(`已导入 ${parsed.length} 个商品`);navigate('products');};
    }});
}
function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function exportProductsCSV(products){
  const head=['商品名称','分类','颜色','成本价','销售价','库存数量','商品编码'];
  const rows=products.map(p=>[p.name,p.category,p.color,p.costPrice,p.salePrice,p.stock,p.code]);
  downloadBlob('\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),`商品库存_${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');
}

async function renderProductDetail(){
  const p=await dbGet('products',appState.params.id); if(!p){showToast('商品不存在');return navigate('products');}
  setHeader(p.name,p.code,{label:'···',onClick:()=>openProductActions(p)});
  const [sales,moves]=await Promise.all([dbAll('sales'),dbAll('stockMoves')]);
  const productSales=sales.filter(s=>s.status==='active'&&s.items.some(i=>i.productId===p.id));
  $('#main').innerHTML=`
    <div class="card"><div style="display:flex;gap:14px">${imageThumb({...p,image:p.image})}<div class="item-main"><div class="item-title" style="font-size:18px">${esc(p.name)}</div><div class="item-meta">${esc(p.category||'未分类')} · ${esc(p.color||'未填写颜色')}</div><div class="btn-row" style="margin-top:10px"><span class="badge success">库存 ${fmtInt(p.stock)}</span><span class="badge">成本 ${fmtMoney(p.costPrice)}</span><span class="badge">售价 ${fmtMoney(p.salePrice)}</span></div></div></div>${p.note?`<div class="product-note-box"><strong>商品备注</strong><span>${esc(p.note)}</span></div>`:''}</div>
    <div class="grid-3"><button id="productSale" class="btn">销售</button><button id="productEdit" class="btn secondary">编辑</button><button id="productStock" class="btn secondary">盘点</button></div><button id="productContent" class="btn secondary block content-entry-btn">图片 / 视频素材与发布</button>
    <div class="section-title">销售明细 <small>默认近30天</small></div>
    <div class="segment" id="productRange"><button data-range="today">今天</button><button data-range="yesterday">昨天</button><button data-range="tomorrow">明天</button><button data-range="7d">7天</button><button data-range="30d" class="active">30天</button><button data-range="all">全部</button><button data-range="custom">自定义</button></div>
    <div id="productStats"></div><div id="productSalesList" class="list"></div>
    <div class="section-title">库存流水 <small>最近20条</small></div>
    <div class="timeline">${moves.filter(m=>m.productId===p.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20).map(m=>`<div class="timeline-item"><div class="time">${fmtDateTime(m.createdAt)}</div><div class="text">${esc(moveTypeName(m.type))}　<strong class="${m.qtyChange>=0?'success-text':'danger-text'}">${m.qtyChange>=0?'+':''}${fmtInt(m.qtyChange)}</strong>　${fmtInt(m.beforeStock)} → ${fmtInt(m.afterStock)}</div><div class="item-meta">${esc(m.note||'')}</div></div>`).join('')||emptyState('▥','暂无库存流水')}</div>`;
  const drawSales=(key='30d',customStart='',customEnd='')=>{
    const range=dateRange(key,customStart,customEnd), rows=productSales.filter(s=>inRange(s.createdAt,range));
    const lines=[]; rows.forEach(s=>s.items.filter(i=>i.productId===p.id).forEach(i=>lines.push({...i,order:s})));
    const qty=lines.reduce((x,i)=>x+n(i.qty),0), amount=lines.reduce((x,i)=>x+n(i.price)*n(i.qty),0);
    const customerMap={}; lines.forEach(i=>{const name=i.order.customerName||'散客';customerMap[name]=(customerMap[name]||0)+n(i.qty);});
    const top=Object.entries(customerMap).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=>`${k} ${v}件`).join('、')||'暂无';
    $('#productStats').innerHTML=`<div class="grid-3"><div class="metric compact"><div class="label">销量</div><div class="value">${fmtInt(qty)}</div></div><div class="metric compact"><div class="label">交易额</div><div class="value">${fmtMoney(amount)}</div></div><div class="metric compact"><div class="label">客户拿货</div><div class="value" style="font-size:12px">${esc(top)}</div></div></div>`;
    $('#productSalesList').innerHTML=lines.length?lines.sort((a,b)=>new Date(b.order.createdAt)-new Date(a.order.createdAt)).map(i=>`<div class="list-item"><div class="item-main"><div class="item-title">${esc(i.order.customerName||'散客')} · ${esc(i.order.orderNo)}</div><div class="item-meta">${fmtDateTime(i.order.createdAt)} · ${esc(i.color||p.color||'')}</div></div><div class="item-right"><strong>${fmtInt(i.qty)} 件</strong><div class="item-meta">${fmtMoney(n(i.price)*n(i.qty))}</div></div></div>`).join(''):emptyState('▥','该时间段暂无销售');
  };
  drawSales();
  $$('#productRange button').forEach(b=>b.onclick=()=>{if(b.dataset.range==='custom'){openDateRangePicker((s,e)=>drawSales('custom',s,e));return;}$$('#productRange button').forEach(x=>x.classList.remove('active'));b.classList.add('active');drawSales(b.dataset.range);});
  $('#productSale').onclick=()=>{appState.saleDraft=null;navigate('sale-new',{productId:p.id});}; $('#productEdit').onclick=()=>openProductForm(p); $('#productStock').onclick=()=>openSingleStocktake(p); $('#productContent').onclick=()=>navigate('product-content',{id:p.id});
}
function moveTypeName(type){return ({initial:'初始入库',sale:'销售出库',sale_cancel:'撤销回库',sale_restore:'恢复销售',stocktake:'盘点调整',stock_in:'采购入库',stock_out:'手工出库',loan_borrow:'调入库存',loan_lend:'借出库存',loan_return:'调借归还',loan_sale:'借调售出',loan_sale_cancel:'撤销借调售出',loan_sale_restore:'恢复借调售出',ledger_reconcile:'流水校正'}[type]||type);}
function openProductActions(p){
  openModal('商品操作',`<div class="grid-2"><button id="actCopy" class="btn secondary">复制商品</button><button id="actEdit" class="btn secondary">编辑商品</button><button id="actIn" class="btn secondary">商品入库</button><button id="actOut" class="btn secondary">商品出库</button><button id="actDelete" class="btn danger">删除商品</button></div>`,{onOpen:()=>{
    $('#actCopy').onclick=()=>{closeModal();openProductForm(p,{copy:true});}; $('#actEdit').onclick=()=>{closeModal();openProductForm(p);};
    $('#actIn').onclick=()=>{closeModal();openManualStock(p,1);}; $('#actOut').onclick=()=>{closeModal();openManualStock(p,-1);};
    $('#actDelete').onclick=async()=>{const [sales,loans]=await Promise.all([dbAll('sales'),dbAll('loans')]);const used=sales.some(s=>s.items.some(i=>i.productId===p.id))||loans.some(l=>l.items.some(i=>i.productId===p.id));if(used){showToast('该商品已有销售或调借记录，不能删除，可把库存盘点为0并保留历史');return;}if(await confirmDialog('确定删除这个尚未发生业务的商品？')){await writeAudit('product.delete','product',p.id,`${p.name} 已删除`,p,null);await dbDelete('products',p.id);closeModal();showToast('商品已删除');navigate('products');}};
  }});
}
function openManualStock(p,direction){
  openModal(direction>0?'商品入库':'商品出库',`<form id="manualStockForm"><div class="notice ${direction>0?'success':'warn'}">${esc(p.name)}　当前库存：${fmtInt(p.stock)}</div><div class="form-group"><label class="form-label">数量</label><input class="input" name="qty" type="number" min="0.01" step="0.01" required></div><div class="form-group"><label class="form-label">备注</label><textarea class="textarea" name="note" placeholder="如：采购入库、退货、损耗等"></textarea></div><button class="btn block" type="submit">确认${direction>0?'入库':'出库'}</button></form>`,{onOpen:()=>{$('#manualStockForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),qty=n(fd.get('qty'));try{await adjustStock(p.id,direction*qty,direction>0?'stock_in':'stock_out','manual',uid('manual'),String(fd.get('note')));closeModal();showToast('库存已更新');navigate('product-detail',{id:p.id});}catch(err){showToast(err.message);}};}});
}
function openSingleStocktake(p){
  openModal('商品盘点',`<form id="singleStockForm"><div class="notice warn">账面库存：${fmtInt(p.stock)}</div><div class="form-group"><label class="form-label">实际盘点数量</label><input class="input" name="counted" type="number" min="0" step="0.01" value="${n(p.stock)}" required></div><div class="form-group"><label class="form-label">盘点备注</label><textarea class="textarea" name="note"></textarea></div><button class="btn block" type="submit">确认盘点</button></form>`,{onOpen:()=>{$('#singleStockForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),counted=n(fd.get('counted')),delta=counted-n(p.stock),ref=uid('stocktake');if(delta)await adjustStock(p.id,delta,'stocktake','stocktake',ref,String(fd.get('note')));await dbPut('stocktakes',{id:ref,date:nowISO(),items:[{productId:p.id,productName:p.name,bookQty:n(p.stock),countedQty:counted,difference:delta}],note:String(fd.get('note')),createdAt:nowISO()});closeModal();showToast('盘点已保存');navigate('product-detail',{id:p.id});};}});
}
function openDateRangePicker(callback){
  openModal('自定义时间',`<div class="form-row"><div class="form-group"><label class="form-label">开始日期</label><input id="customStart" class="input" type="date"></div><div class="form-group"><label class="form-label">结束日期</label><input id="customEnd" class="input" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div><button id="applyCustomRange" class="btn block">确定</button>`,{onOpen:()=>{$('#applyCustomRange').onclick=()=>{const s=$('#customStart').value,e=$('#customEnd').value;if(!s||!e){showToast('请选择开始和结束日期');return;}closeModal();callback(s,e);};}});
}

async function renderSaleNew(){
  setHeader('销售开单','多选商品、修改数量和单价');
  if(!appState.saleDraft){
    appState.saleDraft={customerId:'',customerName:'',createdAt:localInputDateTime(),items:[],discountType:'none',discountValue:0,received:'',note:''};
    if(appState.params.productId){const p=await dbGet('products',appState.params.productId);if(p)appState.saleDraft.items.push({productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty:1,price:n(p.salePrice),costPrice:n(p.costPrice),image:p.image,stock:n(p.stock),productNote:p.note||'',itemNote:''});}
  }
  const [customers,sales]=await Promise.all([dbAll('customers'),dbAll('sales')]);
  const customerHistory=new Map();
  customers.forEach(c=>customerHistory.set(c.name,{id:c.id,name:c.name,phone:c.phone||'',orders:0,lastDate:c.updatedAt||c.createdAt||''}));
  sales.forEach(order=>{const name=String(order.customerName||'').trim();if(!name||name==='散客')return;const old=customerHistory.get(name)||{id:order.customerId||'',name,phone:'',orders:0,lastDate:order.createdAt};old.orders+=1;if(!old.lastDate||new Date(order.createdAt)>new Date(old.lastDate))old.lastDate=order.createdAt;customerHistory.set(name,old);});
  const customerRows=[...customerHistory.values()].sort((a,b)=>new Date(b.lastDate||0)-new Date(a.lastDate||0));
  const d=appState.saleDraft, totals=calcSaleTotals(d);
  $('#main').innerHTML=`
    <div class="card">
      <div class="form-group autocomplete"><label class="form-label">客户</label><div class="form-row" style="grid-template-columns:1fr auto"><input id="saleCustomer" class="input" value="${esc(d.customerName)}" placeholder="输入一个字匹配历史客户"><button id="chooseCustomer" class="btn secondary">选择</button></div><div id="saleCustomerSuggestions" class="autocomplete-list hidden"></div><div class="field-help">输入姓名任意一个字，会显示历史客户；也可以直接输入新客户。</div></div><div class="form-group"><label class="form-label">销售时间</label><input id="saleDate" class="input" type="datetime-local" value="${esc(d.createdAt)}"></div>
      <button id="chooseProducts" class="btn block secondary">＋ 选择商品（可多选）</button>
    </div>
    <div id="saleItems">${d.items.length?d.items.map((i,idx)=>saleLineHTML(i,idx)).join(''):emptyState('＋','还没有选择商品','点击上方按钮添加')}</div>
    <div class="card">
      <div class="form-row"><div class="form-group"><label class="form-label">优惠方式</label><select id="discountType" class="select"><option value="none" ${d.discountType==='none'?'selected':''}>无优惠</option><option value="amount" ${d.discountType==='amount'?'selected':''}>优惠金额</option><option value="percent" ${d.discountType==='percent'?'selected':''}>折扣百分比</option><option value="round" ${d.discountType==='round'?'selected':''}>抹零</option></select></div><div class="form-group"><label id="discountLabel" class="form-label">优惠值</label><input id="discountValue" class="input" type="number" min="0" step="0.01" value="${n(d.discountValue)}"></div></div>
      <div class="form-group"><label class="form-label">本次实收</label><input id="received" class="input" type="number" min="0" step="0.01" value="${d.received===''?totals.finalAmount:n(d.received)}"></div>
      <div class="form-group"><label class="form-label">销售备注</label><textarea id="saleNote" class="textarea">${esc(d.note)}</textarea></div>
      <div class="total-box"><div class="total-row"><span>商品金额</span><strong>${fmtMoney(totals.subtotal)}</strong></div><div class="total-row"><span>优惠/抹零</span><strong>-${fmtMoney(totals.discountAmount)}</strong></div><div class="total-row grand"><span>应收</span><strong>${fmtMoney(totals.finalAmount)}</strong></div></div>
      <button id="saveSale" class="btn block" ${d.items.length?'':'disabled'}>确认开单并扣减库存</button>
      <button id="viewSales" class="btn block secondary" style="margin-top:8px">查看销售单 / 撤销恢复</button>
    </div>`;
  bindSaleDraft(customerRows);
}
function saleLineHTML(i,idx){
  return `<div class="sale-line" data-index="${idx}"><div class="sale-line-top"><div><div class="sale-line-name">${esc(i.productName)}</div><div class="item-meta">${esc(i.productCode)} · ${esc(i.color||'')} · 可售 ${fmtInt(i.stock)}</div>${i.productNote?`<div class="loan-product-note">商品备注：${esc(i.productNote)}</div>`:''}</div><button class="btn small danger remove-sale-item">删除</button></div><div class="sale-line-grid"><div><div class="mini-label">数量</div><input class="mini-input line-qty" type="number" min="0.01" step="0.01" value="${n(i.qty)}"></div><div><div class="mini-label">销售单价</div><input class="mini-input line-price" type="number" min="0" step="0.01" value="${n(i.price)}"></div><div><div class="mini-label">小计</div><div style="padding:9px 2px;font-weight:800">${fmtMoney(n(i.qty)*n(i.price))}</div></div></div><div class="form-group" style="margin:9px 0 0"><label class="mini-label">本件商品备注</label><input class="input line-item-note" value="${esc(i.itemNote||'')}" placeholder="本次销售的商品情况、证书、瑕疵说明等"></div></div>`;
}
function syncSaleFormToDraft(){
  const d=appState.saleDraft;if(!d)return;
  d.customerName=$('#saleCustomer')?.value.trim()||''; d.createdAt=$('#saleDate')?.value||localInputDateTime(); d.discountType=$('#discountType')?.value||'none'; d.discountValue=n($('#discountValue')?.value); d.received=$('#received')?.value??''; d.note=$('#saleNote')?.value||'';
  $$('.sale-line').forEach(el=>{const i=d.items[n(el.dataset.index)];if(i){i.qty=n($('.line-qty',el).value);i.price=n($('.line-price',el).value);i.itemNote=$('.line-item-note',el)?.value||'';}});
}
function bindSaleDraft(customerRows=[]){
  $('#chooseProducts').onclick=()=>{syncSaleFormToDraft();openProductSelector(appState.saleDraft.items.map(i=>i.productId),selected=>{const existing=new Map(appState.saleDraft.items.map(i=>[i.productId,i]));appState.saleDraft.items=selected.map(p=>existing.get(p.id)||{productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty:1,price:n(p.salePrice),costPrice:n(p.costPrice),image:p.image,stock:n(p.stock),productNote:p.note||'',itemNote:''});renderSaleNew();});};
  $('#chooseCustomer').onclick=()=>openCustomerSelector(c=>{$('#saleCustomer').value=c.name;appState.saleDraft.customerId=c.id;appState.saleDraft.customerName=c.name;});
  const input=$('#saleCustomer'),suggestions=$('#saleCustomerSuggestions');
  const drawSuggestions=()=>{const q=input.value.trim().toLowerCase();if(appState.saleDraft.customerName!==input.value.trim())appState.saleDraft.customerId='';const rows=q?customerRows.filter(x=>[x.name,x.phone].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8):[];suggestions.innerHTML=rows.map(x=>`<button type="button" class="autocomplete-option sale-customer-option" data-name="${esc(x.name)}" data-id="${esc(x.id||'')}"><strong>${esc(x.name)}</strong><span>${x.phone?esc(x.phone)+' · ':''}${x.orders||0} 笔销售${x.lastDate?' · 最近 '+fmtDate(x.lastDate):''}</span></button>`).join('');suggestions.classList.toggle('hidden',!rows.length);$$('.sale-customer-option',suggestions).forEach(btn=>btn.onclick=()=>{input.value=btn.dataset.name;appState.saleDraft.customerId=btn.dataset.id;appState.saleDraft.customerName=btn.dataset.name;suggestions.classList.add('hidden');});};
  input.oninput=drawSuggestions;input.onfocus=drawSuggestions;input.onblur=()=>setTimeout(()=>suggestions.classList.add('hidden'),160);
  $$('.sale-line').forEach(el=>{
    $('.remove-sale-item',el).onclick=()=>{syncSaleFormToDraft();appState.saleDraft.items.splice(n(el.dataset.index),1);renderSaleNew();};
    $$('.mini-input',el).forEach(x=>x.onchange=()=>{syncSaleFormToDraft();renderSaleNew();});
  });
  ['discountType','discountValue'].forEach(id=>$('#'+id).onchange=()=>{syncSaleFormToDraft();renderSaleNew();});
  $('#viewSales').onclick=()=>{syncSaleFormToDraft();navigate('sales');};
  $('#saveSale').onclick=saveSale;
}
async function openProductSelector(selectedIds=[],callback){
  const [products,categories]=await Promise.all([dbAll('products'),dbAll('categories')]); const selected=new Set(selectedIds);
  openModal('选择商品',`<div class="toolbar"><div class="search"><input id="selectorSearch" placeholder="名称、编码、颜色"></div><select id="selectorCategory" class="filter-select"><option value="">全部分类</option>${categories.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select></div><div id="selectorList" class="list"></div><div class="sticky-actions"><button id="selectorConfirm" class="btn block">确定选择（${selected.size}）</button></div>`,{full:true,onOpen:()=>{
    const draw=()=>{const q=$('#selectorSearch').value.trim().toLowerCase(),cat=$('#selectorCategory').value;const rows=products.filter(p=>(!cat||p.category===cat)&&(!q||[p.name,p.code,p.color].some(v=>String(v||'').toLowerCase().includes(q))));$('#selectorList').innerHTML=rows.map(p=>`<label class="list-item"><input class="selector-check" type="checkbox" data-id="${p.id}" ${selected.has(p.id)?'checked':''}>${imageThumb(p)}<div class="item-main"><div class="item-title">${esc(p.name)}</div><div class="item-meta">${esc(p.code)} · ${esc(p.color||'')} · 库存 ${fmtInt(p.stock)}</div></div><div class="item-right"><strong>${fmtMoney(p.salePrice)}</strong></div></label>`).join('')||emptyState('⌕','没有商品');$$('.selector-check').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.id):selected.delete(c.dataset.id);$('#selectorConfirm').textContent=`确定选择（${selected.size}）`;});};draw();$('#selectorSearch').oninput=draw;$('#selectorCategory').onchange=draw;$('#selectorConfirm').onclick=()=>{const rows=products.filter(p=>selected.has(p.id));closeModal();callback(rows);};
  }});
}
async function saveSale(){
  syncSaleFormToDraft(); const d=appState.saleDraft; if(!d.items.length){showToast('请选择商品');return;} if(d.items.some(i=>n(i.qty)<=0)){showToast('商品数量必须大于0');return;}
  try{
    await validateStock(d.items,-1); const totals=calcSaleTotals(d), id=uid('sale'), orderNo=await nextOrderNo();
    const customerName=d.customerName||'散客'; let customerId=d.customerId||'';
    if(customerName!=='散客'&&!customerId){const customers=await dbAll('customers');let c=customers.find(x=>x.name===customerName);if(!c){c={id:uid('cust'),name:customerName,phone:'',note:'销售开单自动创建',createdAt:nowISO(),updatedAt:nowISO()};await dbPut('customers',c);}customerId=c.id;}
    const createdAt=new Date(d.createdAt).toISOString();
    for(const i of d.items) await adjustStock(i.productId,-n(i.qty),'sale','sale',id,`销售单 ${orderNo}`,createdAt);
    const sale={id,orderNo,customerId,customerName,items:d.items.map(i=>({...i,qty:n(i.qty),price:n(i.price),costPrice:n(i.costPrice)})),subtotal:totals.subtotal,discountType:d.discountType,discountValue:n(d.discountValue),discountAmount:totals.discountAmount,finalAmount:totals.finalAmount,received:d.received===''?totals.finalAmount:n(d.received),note:d.note,status:'active',createdAt,cancelledAt:null,updatedAt:nowISO()};
    await dbPut('sales',sale);await writeAudit('sale.create','sale',sale.id,`${orderNo} · ${sale.customerName||'散客'} · ${fmtMoney(sale.finalAmount)}`,null,sale); appState.saleDraft=null; showToast(`开单成功：${orderNo}`); navigate('sales',{highlight:id});
  }catch(err){showToast(err.message);}
}

async function renderSales(){
  setHeader('销售单管理','撤销、恢复、复制重新开单',{label:'＋',onClick:()=>{appState.saleDraft=null;navigate('sale-new');}});
  const sales=(await dbAll('sales')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  $('#main').innerHTML=`<div class="segment" id="saleStatus"><button data-status="all" class="active">全部</button><button data-status="active">有效单</button><button data-status="cancelled">已撤销</button></div><div class="toolbar"><div class="search"><input id="saleSearch" placeholder="订单号、客户、商品"></div></div><div id="salesList" class="list"></div>`;
  let status='all'; const draw=()=>{const q=$('#saleSearch').value.trim().toLowerCase();const rows=sales.filter(s=>(status==='all'||s.status===status)&&(!q||[s.orderNo,s.customerName,s.sourceLoanNo,s.note,...s.items.flatMap(i=>[i.productName,i.itemNote,i.productNote])].some(v=>String(v||'').toLowerCase().includes(q))));$('#salesList').innerHTML=rows.length?rows.map(s=>saleCard(s)).join(''):emptyState('▥','暂无销售单');$$('.sale-card').forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;openSaleDetail(sales.find(x=>x.id===el.dataset.id));});$$('.cancel-sale').forEach(b=>b.onclick=()=>cancelSale(b.dataset.id));$$('.restore-sale').forEach(b=>b.onclick=()=>restoreSale(b.dataset.id));$$('.duplicate-sale').forEach(b=>b.onclick=()=>duplicateSale(b.dataset.id));};
  draw(); $('#saleSearch').oninput=draw; $$('#saleStatus button').forEach(b=>b.onclick=()=>{status=b.dataset.status;$$('#saleStatus button').forEach(x=>x.classList.toggle('active',x===b));draw();});
}
function saleCard(s){
  const linked=s.sourceType==='loan_sale'||s.items?.some(i=>i.fromLoan),historical=Boolean(s.importedHistorical||s.sourceType==='qinsilk_history');
  return `<div class="card sale-card" data-id="${s.id}"><div style="display:flex;justify-content:space-between;gap:10px"><div><div class="item-title">${esc(s.customerName||'散客')} · ${esc(s.orderNo)}</div><div class="item-meta">${fmtDateTime(s.createdAt)} · ${s.items.length} 种商品 ${linked?'· 借调售出':historical?'· 秦丝历史':''}</div></div><div class="item-right"><strong>${fmtMoney(s.finalAmount)}</strong><span class="badge ${s.status==='active'?'success':'danger'}">${s.status==='active'?'有效':'已撤销'}</span></div></div><div class="item-meta" style="margin-top:8px">${s.items.slice(0,3).map(i=>`${esc(i.productName)}×${fmtInt(i.qty)}`).join('、')}${s.items.length>3?'…':''}</div>${linked?`<div class="linked-source-tag">⇄ 来源：${esc(s.sourceLoanNo||s.items.find(i=>i.loanNo)?.loanNo||'借调单')}</div>`:historical?'<div class="linked-source-tag">秦丝历史记录 · 不参与库存扣减</div>':''}${historical?'':`<div class="btn-row" style="margin-top:10px">${s.status==='active'?`<button class="btn small danger cancel-sale" data-id="${s.id}">撤销销售</button>`:`<button class="btn small success restore-sale" data-id="${s.id}">恢复销售单</button><button class="btn small secondary duplicate-sale" data-id="${s.id}">复制重新开单</button>`}</div>`}</div>`;
}
function openSaleDetail(s){
  const linked=s.sourceType==='loan_sale'||s.items?.some(i=>i.fromLoan),loanId=s.sourceLoanId||s.items?.find(i=>i.loanId)?.loanId;
  openModal(`销售单 ${s.orderNo}`,`<div class="grid-2"><div class="metric compact"><div class="label">客户</div><div class="value" style="font-size:14px">${esc(s.customerName||'散客')}</div></div><div class="metric compact"><div class="label">状态</div><div class="value" style="font-size:14px">${s.status==='active'?'有效':'已撤销'}</div></div></div>${linked?`<div class="notice success">本单由借调商品售出自动生成，已联通调借、销售、库存流水和统计。<br>来源调借单：${esc(s.sourceLoanNo||'')}</div>`:(s.importedHistorical||s.sourceType==='qinsilk_history')?'<div class="notice warn">这是从秦丝导入的历史销售，只用于报表与查询，不改变当前库存，也不能在这里撤销。</div>':''}<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>商品</th><th>颜色</th><th>数量</th><th>单价</th><th>小计</th><th>商品备注</th></tr></thead><tbody>${s.items.map(i=>`<tr><td>${esc(i.productName)}</td><td>${esc(i.color||'')}</td><td>${fmtInt(i.qty)}</td><td>${fmtMoney(i.price)}</td><td>${fmtMoney(n(i.qty)*n(i.price))}</td><td>${esc(i.itemNote||i.productNote||'')}</td></tr>`).join('')}</tbody></table></div><div class="total-box"><div class="total-row"><span>商品金额</span><strong>${fmtMoney(s.subtotal)}</strong></div><div class="total-row"><span>优惠/抹零</span><strong>-${fmtMoney(s.discountAmount)}</strong></div><div class="total-row"><span>本次实收</span><strong>${fmtMoney(s.received)}</strong></div><div class="total-row grand"><span>应收</span><strong>${fmtMoney(s.finalAmount)}</strong></div></div><div class="notice">开单时间：${fmtDateTime(s.createdAt)}<br>销售备注：${esc(s.note||'无')}</div>${linked&&loanId?`<button id="openLinkedLoan" class="btn secondary block">查看关联调借单</button>`:''}`,{onOpen:()=>{if($('#openLinkedLoan'))$('#openLinkedLoan').onclick=()=>openLoanDetail(loanId);}});
}
async function cancelSale(id){
  const s=await dbGet('sales',id);if(!s||s.status!=='active')return;if(s.importedHistorical||s.sourceType==='qinsilk_history'){showToast('秦丝历史销售不参与库存，不能在这里撤销');return;}if(!await confirmDialog('确定撤销这张销售单？普通销售会恢复仓库库存；借调售出会恢复为借调未处理数量。'))return;
  try{
    for(const i of s.items){
      if(i.fromLoan&&i.loanId){
        const l=await dbGet('loans',i.loanId);if(l){
          l.items=(l.items||[]).map(x=>x.productId===i.productId?{...x,soldQty:Math.max(0,loanItemSoldQty(l,x)-n(i.qty))}:x);
          l.saleEvents=(l.saleEvents||[]).map(e=>e.saleId===s.id?{...e,status:'cancelled',cancelledAt:nowISO()}:e);refreshLoanStatus(l);await dbPut('loans',l);
          if(i.loanType==='borrow')await adjustStock(i.productId,n(i.qty),'loan_sale_cancel','sale',s.id,`撤销借调售出 ${s.orderNo}，恢复仓库库存`);
          else await recordStockReference(i.productId,'loan_sale_cancel','sale',s.id,`撤销借调售出 ${s.orderNo}，商品恢复为借调未处理，仓库库存不重复增加`);
        }
      }else await adjustStock(i.productId,n(i.qty),'sale_cancel','sale',s.id,`撤销销售单 ${s.orderNo}`);
    }
    s.status='cancelled';s.cancelledAt=nowISO();s.updatedAt=nowISO();await dbPut('sales',s);await writeAudit('sale.cancel','sale',s.id,`${s.orderNo} 已撤销`,null,{status:s.status,cancelledAt:s.cancelledAt});showToast('销售单已撤销，相关库存和借调记录已同步');renderSales();
  }catch(err){showToast(err.message);}
}
async function restoreSale(id){
  const s=await dbGet('sales',id);if(!s||s.status!=='cancelled')return;if(s.importedHistorical||s.sourceType==='qinsilk_history'){showToast('秦丝历史销售不能恢复库存');return;}
  try{
    for(const i of s.items){
      if(i.fromLoan&&i.loanId){
        const l=await dbGet('loans',i.loanId);if(!l)throw new Error(`关联调借单不存在：${i.loanNo||''}`);
        const li=(l.items||[]).find(x=>x.productId===i.productId);if(!li||loanItemRemaining(l,li)<n(i.qty))throw new Error(`${i.productName} 当前借调未处理数量不足，不能恢复销售`);
        if(i.loanType==='borrow')await validateStock([i],-1);
      }else await validateStock([i],-1);
    }
    for(const i of s.items){
      if(i.fromLoan&&i.loanId){
        const l=await dbGet('loans',i.loanId);
        l.items=(l.items||[]).map(x=>x.productId===i.productId?{...x,soldQty:loanItemSoldQty(l,x)+n(i.qty)}:x);
        l.saleEvents=(l.saleEvents||[]).map(e=>e.saleId===s.id?{...e,status:'active',cancelledAt:null,restoredAt:nowISO()}:e);refreshLoanStatus(l);await dbPut('loans',l);
        if(i.loanType==='borrow')await adjustStock(i.productId,-n(i.qty),'loan_sale_restore','sale',s.id,`恢复借调售出 ${s.orderNo}`);
        else await recordStockReference(i.productId,'loan_sale_restore','sale',s.id,`恢复借调售出 ${s.orderNo}，借出时库存已扣减`);
      }else await adjustStock(i.productId,-n(i.qty),'sale_restore','sale',s.id,`恢复销售单 ${s.orderNo}`);
    }
    s.status='active';s.cancelledAt=null;s.updatedAt=nowISO();await dbPut('sales',s);await writeAudit('sale.restore','sale',s.id,`${s.orderNo} 已恢复`,null,{status:s.status,updatedAt:s.updatedAt});showToast('销售单已恢复，借调、库存和统计已重新联通');renderSales();
  }catch(err){showToast(err.message);}
}

async function duplicateSale(id){
  const s=await dbGet('sales',id);if(!s)return;const products=await dbAll('products');const pm=new Map(products.map(p=>[p.id,p]));appState.saleDraft={customerId:s.customerId||'',customerName:s.customerName||'',createdAt:localInputDateTime(),items:s.items.filter(i=>pm.has(i.productId)).map(i=>{const {fromLoan,loanId,loanNo,loanPerson,loanType,loanSaleEventId,...rest}=i;return {...rest,stock:n(pm.get(i.productId).stock),itemNote:i.itemNote||''};}),discountType:s.discountType,discountValue:s.discountValue,received:'',note:`复制自撤销单 ${s.orderNo}`};navigate('sale-new');
}

function loanListItem(l){
  const open=loanIsOpen(l),overdueDays=loanOverdueDays(l),overdue=overdueDays>0,daysToDue=loanDaysToDue(l),partial=loanIsPartial(l),remaining=loanRemainingQty(l),total=(l.items||[]).reduce((s,i)=>s+n(i.qty),0),sold=loanSoldTotal(l),returned=loanReturnedTotal(l),resolution=loanResolutionStatus(l);
  const state=open?(overdue?`超期${overdueDays}天`:daysToDue<=7?`${Math.max(0,daysToDue)}天后到期`:partial?'部分处理':'借调中'):(resolution==='sold'?'已全部售出':resolution==='completed'?'已完成':'已全部归还');
  const badge=!open?'success':overdue?'danger':daysToDue<=7?'warn':partial?'partial':'warn';
  return `<div class="list-item clickable ${overdue?'overdue':''}" data-loan-id="${l.id}"><div class="item-main"><div class="item-title">${esc(l.person)} · ${l.type==='borrow'?'调入/借入':'借出'}</div><div class="item-meta">${fmtDateTime(l.date||l.createdAt)} · 预计归还 ${fmtDate(loanDueDate(l))} · ${(l.items||[]).length} 种商品 · 原借 ${fmtInt(total)} 件${open?` · 未处理 ${fmtInt(remaining)} 件`:''}</div><div class="item-meta">已还 ${fmtInt(returned)} · 已售 ${fmtInt(sold)} · ${esc(l.note||'无备注')}</div></div><div class="item-right"><span class="badge ${badge}">${state}</span></div></div>`;
}
async function renderLoans(){
  setHeader('调借货管理','连续借货、多次归还、每次图片留底',{label:'＋',onClick:()=>openLoanForm()});
  const loans=(await dbAll('loans')).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const openRows=loans.filter(loanIsOpen);
  $('#main').innerHTML=`<div class="grid-3"><div class="metric compact"><div class="label">未处理单</div><div class="value">${openRows.length}</div></div><div class="metric compact"><div class="label">部分处理</div><div class="value">${openRows.filter(loanIsPartial).length}</div></div><div class="metric compact"><div class="label">已超期</div><div class="value danger-text">${openRows.filter(l=>loanOverdueDays(l)>0).length}</div></div></div><div class="segment" id="loanStatus" style="margin-top:12px"><button class="active" data-status="all">全部</button><button data-status="active">未处理</button><button data-status="partial">部分处理</button><button data-status="returned">已完成</button><button data-status="overdue">超期</button></div><div id="loanList" class="list"></div>`;
  let status='all'; const draw=()=>{const rows=loans.filter(l=>status==='all'||(status==='active'?loanIsOpen(l):status==='partial'?loanIsPartial(l):status==='returned'?!loanIsOpen(l):status==='overdue'?loanOverdueDays(l)>0:false));$('#loanList').innerHTML=rows.length?rows.map(loanListItem).join(''):emptyState('⇄','暂无调借记录');$$('[data-loan-id]').forEach(el=>el.onclick=()=>openLoanDetail(el.dataset.loanId));};draw();$$('#loanStatus button').forEach(b=>b.onclick=()=>{status=b.dataset.status;$$('#loanStatus button').forEach(x=>x.classList.toggle('active',x===b));draw();});
}
async function openLoanForm(){
  const saved=loadLocalDraft('mocui_loan_draft_v1');
  if(!appState.loanDraft&&saved){const resume=window.confirm('检测到上次未保存的借调草稿。确定继续填写，取消则新建空白借调单。');appState.loanDraft=resume?saved:null;if(!resume)clearLocalDraft('mocui_loan_draft_v1');}
  if(!appState.loanDraft)appState.loanDraft={type:'lend',person:'',date:localInputDateTime(),expectedReturnDate:addDaysLocal(nowISO(),30),note:'',images:[],items:[]};
  appState.loanDraft.expectedReturnDate=appState.loanDraft.expectedReturnDate||addDaysLocal(appState.loanDraft.date||nowISO(),30);
  await renderLoanFormModal();
}
async function renderLoanFormModal(){
  const d=appState.loanDraft;
  const [loanRows,customerRows]=await Promise.all([dbAll('loans'),dbAll('customers')]);
  const history=loanRows.sort((a,b)=>new Date(b.date||b.createdAt)-new Date(a.date||a.createdAt));
  const peopleMap=new Map();
  customerRows.forEach(c=>{const name=String(c.name||'').trim();if(!name)return;peopleMap.set(name,{name,phone:c.phone||'',count:0,lastDate:c.updatedAt||c.createdAt||'',open:0,source:'客户'});});
  history.forEach(row=>{
    const name=String(row.person||'').trim();if(!name)return;
    const old=peopleMap.get(name)||{name,phone:'',count:0,lastDate:row.date||row.createdAt,open:0,source:'借调'};
    old.count+=1;if(loanIsOpen(row))old.open+=1;if(!old.lastDate||new Date(row.date||row.createdAt)>new Date(old.lastDate))old.lastDate=row.date||row.createdAt;
    peopleMap.set(name,old);
  });
  const people=[...peopleMap.values()].sort((a,b)=>new Date(b.lastDate)-new Date(a.lastDate));
  const direction=d.type==='borrow'?1:-1;
  const itemHTML=d.items.length?d.items.map((i,idx)=>{
    const after=n(i.stock)+direction*n(i.qty),invalid=d.type==='lend'&&after<0;
    return `<div class="loan-product-card ${invalid?'invalid':''}" data-loan-index="${idx}">
      <div class="loan-product-head">${i.image?`<img class="loan-thumb" src="${i.image}" alt="">`:`<div class="loan-thumb placeholder">玉</div>`}<div class="item-main"><div class="sale-line-name">${esc(i.productName)}</div><div class="item-meta">${esc(i.productCode)} · ${esc(i.color||'未填写颜色')}</div></div><button type="button" class="btn small danger remove-loan-item">删除</button></div>
      <div class="loan-qty-grid"><div><div class="mini-label">调借数量</div><input class="mini-input loan-qty" type="number" min="0.01" step="0.01" value="${n(i.qty)}"></div><div class="loan-stock-flow"><div class="mini-label">库存变化</div><div class="loan-stock-values"><strong>${fmtInt(i.stock)}</strong><span>→</span><strong class="loan-after-stock ${invalid?'danger-text':direction>0?'success-text':''}">${fmtInt(after)}</strong></div><div class="item-meta loan-stock-hint">${d.type==='borrow'?'保存后库存增加':'保存后库存减少'}</div></div></div>
    </div>`;
  }).join(''):emptyState('⇄','未选择商品','点击“选择调借商品”添加');
  openModal('新增调借货',`<form id="loanForm" autocomplete="off">
    <div class="loan-step-card"><div class="loan-step-title"><span>1</span> 调借基本信息</div>
      <div class="form-group"><label class="form-label">调借类型</label><div class="loan-type-switch"><button type="button" data-loan-type="lend" class="${d.type==='lend'?'active':''}">借出 · 库存减少</button><button type="button" data-loan-type="borrow" class="${d.type==='borrow'?'active':''}">调入/借入 · 库存增加</button></div><input id="loanType" type="hidden" value="${esc(d.type)}"></div>
      <div class="form-group autocomplete"><label class="form-label">调借人姓名 *</label><input id="loanPerson" class="input" value="${esc(d.person)}" placeholder="输入一个字自动匹配历史借调人" required><div id="loanPersonSuggestions" class="autocomplete-list hidden"></div><div class="field-help">选择历史姓名后，会直接显示这个人所有尚未归还或售出的记录。</div></div>
      <div id="loanPersonOutstanding"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">调借日期和时间</label><input id="loanDate" class="input" type="datetime-local" value="${esc(d.date)}"><div class="field-help">可以补录以前记录。</div></div><div class="form-group"><label class="form-label">预计归还日期</label><input id="loanExpectedReturnDate" class="input" type="date" value="${esc(d.expectedReturnDate||addDaysLocal(d.date||nowISO(),30))}"><div class="field-help">首页会在到期前7天提醒。</div></div></div>
    </div>
    <div class="loan-step-card"><div class="loan-step-title"><span>2</span> 借货图片与文字备注</div>
      <div class="form-group"><label class="form-label">图片备注</label><label class="upload-box loan-upload-box" for="loanImages"><strong>＋ 从相册选择微信截图或拿货照片</strong><span>这是本次借货的原始凭证，支持多选，最多 12 张</span></label><input id="loanImages" class="hidden" type="file" accept="image/*" multiple><div class="upload-meta"><span id="loanImageCount">已选 ${d.images.length}/12 张</span><span>图片会自动压缩</span></div><div id="loanImagePreview" class="upload-preview loan-image-preview"></div></div>
      <div class="form-group"><label class="form-label">文字备注</label><textarea id="loanNote" class="textarea" placeholder="例如：微信确认拿走哪几件、预计归还时间、货品状态等">${esc(d.note)}</textarea></div>
    </div>
    <div class="loan-step-card"><div class="loan-step-title"><span>3</span> 选择商品与数量</div><button id="loanChooseProducts" type="button" class="btn secondary block">＋ 选择调借商品（可多选）</button><div id="loanItems" style="margin-top:10px">${itemHTML}</div><div id="loanInventorySummary" class="notice ${d.type==='borrow'?'success':'warn'}"></div></div>
    <div class="sticky-actions"><button id="saveLoan" class="btn block" type="submit">保存调借单并同步库存</button></div>
  </form>`,{full:true,closeLabel:'← 返回',onOpen:()=>{
    const sync=()=>{d.type=$('#loanType').value;d.person=$('#loanPerson').value.trim();d.date=$('#loanDate').value;d.expectedReturnDate=$('#loanExpectedReturnDate').value;d.note=$('#loanNote').value;$$('[data-loan-index]').forEach(el=>{const item=d.items[n(el.dataset.loanIndex)];if(item)item.qty=n($('.loan-qty',el).value);});const compact={...d,images:[],items:d.items.map(i=>({...i,image:''}))};saveLocalDraft('mocui_loan_draft_v1',compact);};
    const renderImages=()=>{$('#loanImageCount').textContent=`已选 ${d.images.length}/12 张`;$('#loanImagePreview').innerHTML=d.images.map((src,idx)=>`<div class="upload-thumb-wrap"><img src="${src}" alt="调借备注图片 ${idx+1}"><button type="button" class="remove-upload-image" data-image-index="${idx}" aria-label="删除图片">×</button></div>`).join('');$$('.remove-upload-image').forEach(btn=>btn.onclick=()=>{d.images.splice(n(btn.dataset.imageIndex),1);renderImages();});};
    const updateInventoryPreview=()=>{sync();const dir=d.type==='borrow'?1:-1;let totalQty=0,invalid=0;$$('[data-loan-index]').forEach(el=>{const item=d.items[n(el.dataset.loanIndex)],after=n(item.stock)+dir*n(item.qty);totalQty+=n(item.qty);const bad=d.type==='lend'&&after<0;if(bad)invalid++;el.classList.toggle('invalid',bad);$('.loan-after-stock',el).textContent=fmtInt(after);$('.loan-after-stock',el).className=`loan-after-stock ${bad?'danger-text':dir>0?'success-text':''}`;$('.loan-stock-hint',el).textContent=d.type==='borrow'?'保存后库存增加':'保存后库存减少';});const summary=$('#loanInventorySummary');if(!d.items.length){summary.className='notice warn';summary.innerHTML='还没有选择商品，保存前必须至少选择 1 件商品。';}else if(invalid){summary.className='notice danger';summary.innerHTML=`共选择 <strong>${d.items.length}</strong> 种、<strong>${fmtInt(totalQty)}</strong> 件；有 ${invalid} 件商品库存不足，不能保存。`;}else{summary.className=`notice ${d.type==='borrow'?'success':'warn'}`;summary.innerHTML=`共选择 <strong>${d.items.length}</strong> 种、<strong>${fmtInt(totalQty)}</strong> 件；保存后库存将自动${d.type==='borrow'?'增加':'减少'}。`;}$('#saveLoan').disabled=invalid>0||!d.items.length;};
    const drawOutstanding=()=>{const name=$('#loanPerson').value.trim();const rows=name?history.filter(x=>loanIsOpen(x)&&String(x.person||'').trim()===name):[];const root=$('#loanPersonOutstanding');if(!rows.length){root.innerHTML='';return;}root.innerHTML=`<div class="existing-loans-panel"><div class="existing-loans-head"><strong>${esc(name)} 未完成记录</strong><span>${rows.length} 单 · ${fmtInt(rows.reduce((sum,l)=>sum+loanRemainingQty(l),0))} 件未处理</span></div>${rows.map(l=>`<div class="existing-loan-card"><div class="existing-loan-top"><div><strong>${esc(l.loanNo)}</strong><div class="item-meta">${fmtDateTime(l.date)} · ${loanIsPartial(l)?'已有部分归还/售出':'尚未处理'}</div></div><button type="button" class="btn small secondary outstanding-detail" data-id="${l.id}">查看/处理</button></div><div class="existing-loan-items">${l.items.filter(i=>loanItemRemaining(l,i)>0).map(i=>`<span>${esc(i.productName)} × ${fmtInt(loanItemRemaining(l,i))}</span>`).join('')}</div><div class="item-meta">备注：${esc(l.note||'无')} · 还货 ${(l.returns||[]).length} 次 · 售出 ${loanSaleEvents(l).length} 次</div>${l.images?.length?`<div class="mini-image-strip">${l.images.slice(0,4).map(src=>`<img src="${src}" alt="">`).join('')}${l.images.length>4?`<span>+${l.images.length-4}</span>`:''}</div>`:''}</div>`).join('')}</div>`;$$('.outstanding-detail',root).forEach(btn=>btn.onclick=()=>{sync();openLoanDetail(btn.dataset.id);});};
    const personInput=$('#loanPerson'),suggestions=$('#loanPersonSuggestions');
    const drawPeople=()=>{const q=personInput.value.trim().toLowerCase(),rows=q?people.filter(x=>[x.name,x.phone].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8):[];suggestions.innerHTML=rows.map(x=>`<button type="button" class="autocomplete-option" data-person="${esc(x.name)}"><strong>${esc(x.name)}</strong><span>${x.phone?esc(x.phone)+' · ':''}${x.count?`借调 ${x.count} 次`:x.source||'历史客户'}${x.open?` · ${x.open} 单未还`:''}${x.lastDate?` · 最近 ${fmtDate(x.lastDate)}`:''}</span></button>`).join('');suggestions.classList.toggle('hidden',!rows.length);$$('.autocomplete-option',suggestions).forEach(btn=>btn.onclick=()=>{personInput.value=btn.dataset.person;d.person=btn.dataset.person;suggestions.classList.add('hidden');drawOutstanding();});drawOutstanding();};
    personInput.oninput=()=>{d.person=personInput.value.trim();drawPeople();};personInput.onfocus=drawPeople;personInput.onblur=()=>setTimeout(()=>suggestions.classList.add('hidden'),160);
    $$('.loan-type-switch button').forEach(btn=>btn.onclick=()=>{$('#loanType').value=btn.dataset.loanType;d.type=btn.dataset.loanType;$$('.loan-type-switch button').forEach(x=>x.classList.toggle('active',x===btn));updateInventoryPreview();});
    $('#loanChooseProducts').onclick=()=>{sync();openProductSelector(d.items.map(i=>i.productId),rows=>{const old=new Map(d.items.map(i=>[i.productId,i]));d.items=rows.map(p=>old.get(p.id)||{productId:p.id,productName:p.name,productCode:p.code,color:p.color,qty:1,stock:n(p.stock),image:p.image,productNote:p.note||'',costPrice:n(p.costPrice),salePrice:n(p.salePrice)});renderLoanFormModal();});};
    $$('.remove-loan-item').forEach(btn=>btn.onclick=()=>{sync();d.items.splice(n(btn.closest('[data-loan-index]').dataset.loanIndex),1);renderLoanFormModal();});
    $$('.loan-qty').forEach(input=>input.oninput=updateInventoryPreview);
    $('#loanImages').onchange=async e=>{const files=[...e.target.files],room=Math.max(0,12-d.images.length);if(!room){showToast('最多只能上传 12 张图片');e.target.value='';return;}for(const file of files.slice(0,room))d.images.push(await compressImage(file,1080,.70));if(files.length>room)showToast(`只添加前 ${room} 张，最多 12 张`);e.target.value='';renderImages();};
    renderImages();updateInventoryPreview();drawOutstanding();
    $('#loanForm').onsubmit=async e=>{e.preventDefault();sync();if(!d.person){showToast('请填写调借人姓名');personInput.focus();return;}if(!d.date||Number.isNaN(new Date(d.date).getTime())){showToast('请选择有效的调借时间');return;}if(!d.items.length){showToast('请选择调借商品');return;}if(d.items.some(i=>n(i.qty)<=0)){showToast('调借数量必须大于0');return;}try{if(d.type==='lend')await validateStock(d.items,-1);const id=uid('loan'),loanNo=await nextLoanNo(),createdAt=new Date(d.date).toISOString();for(const i of d.items)await adjustStock(i.productId,(d.type==='borrow'?1:-1)*n(i.qty),d.type==='borrow'?'loan_borrow':'loan_lend','loan',id,`${d.person} ${d.type==='borrow'?'调入':'借出'} ${loanNo}`,createdAt);const loan={id,loanNo,type:d.type,person:d.person,date:createdAt,expectedReturnDate:d.expectedReturnDate||addDaysLocal(createdAt,30),note:d.note,images:d.images,items:d.items.map(i=>({...i,qty:n(i.qty),returnedQty:0,soldQty:0})),returns:[],saleEvents:[],status:'active',returnedAt:null,createdAt:nowISO(),updatedAt:nowISO()};await dbPut('loans',loan);await writeAudit('loan.create','loan',id,`${d.person} ${d.type==='borrow'?'调入':'借出'} ${loanNo}`,null,loan);clearLocalDraft('mocui_loan_draft_v1');closeModal();appState.loanDraft=null;showToast('调借单已保存，库存已同步');navigate('loans');}catch(err){showToast(err.message);}};
  }});
}
async function openLoanDetail(idOrLoan){
  const l=typeof idOrLoan==='string'?await dbGet('loans',idOrLoan):idOrLoan;if(!l)return;
  const open=loanIsOpen(l),overdueDays=loanOverdueDays(l),overdue=overdueDays>0,partial=loanIsPartial(l),returnEvents=loanReturnEvents(l),saleEvents=loanSaleEvents(l),remaining=loanRemainingQty(l),resolution=loanResolutionStatus(l);
  const state=open?(partial?'已有归还或售出，仍有商品未处理':overdue?`已超过预计归还日期，当前超期 ${overdueDays} 天`:'调借进行中'):(resolution==='sold'?'所有商品已售出':resolution==='completed'?'所有商品已处理完成':'所有商品已归还');
  const productsHTML=(l.items||[]).map(i=>{const returned=loanItemReturnedQty(l,i),sold=loanItemSoldQty(l,i),left=loanItemRemaining(l,i);const doneLabel=left>0?'':sold>=n(i.qty)?'已售出':returned>=n(i.qty)?'已归还':'已完成';return `<div class="return-product-row ${left<=0?'done':''}">${i.image?`<img class="loan-thumb" src="${i.image}" alt="">`:`<div class="loan-thumb placeholder">玉</div>`}<div class="item-main"><div class="item-title">${esc(i.productName)}</div><div class="item-meta">${esc(i.productCode||'')} · ${esc(i.color||'')}</div>${i.productNote?`<div class="loan-product-note">商品备注：${esc(i.productNote)}</div>`:''}<div class="return-progress"><span>借调 ${fmtInt(i.qty)}</span><span>已还 ${fmtInt(returned)}</span><span class="sold-text">已售 ${fmtInt(sold)}</span><strong>未处理 ${fmtInt(left)}</strong></div></div><div class="item-right">${left>0?`<div class="loan-item-actions"><button type="button" class="btn small success return-one" data-product-id="${i.productId}">归还</button><button type="button" class="btn small loan-sell sell-one" data-product-id="${i.productId}">售出</button></div>`:`<span class="badge success">${doneLabel}</span>`}</div></div>`;}).join('');
  const originalImages=l.images?.length?`<div class="evidence-gallery">${l.images.map((src,idx)=>`<div><img src="${src}" alt="借货凭证 ${idx+1}"><span>借货图 ${idx+1}</span></div>`).join('')}</div>`:`<div class="notice">本次借货没有上传图片凭证。</div>`;
  const timeline=[...returnEvents.map((event,idx)=>({...event,eventType:'return',label:`第 ${idx+1} 次还货`})),...saleEvents.map(event=>({...event,eventType:'sale',label:`售出 · ${event.orderNo||''}`}))].sort((a,b)=>new Date(a.date||a.createdAt)-new Date(b.date||b.createdAt));
  const eventsHTML=timeline.length?timeline.map((event,idx)=>`<div class="return-event ${event.eventType==='sale'?'sale-event':''}"><div class="return-event-head"><span class="return-event-index">${event.eventType==='sale'?'售':idx+1}</span><div><strong>${esc(event.label)}</strong><div class="item-meta">${fmtDateTime(event.date||event.createdAt)}${event.customerName?` · 客户 ${esc(event.customerName)}`:''}</div></div></div><div class="return-event-items">${(event.items||[]).map(i=>`<span>${esc(i.productName||'商品')} × ${fmtInt(i.qty)}</span>`).join('')}</div><div class="return-event-note">${esc(event.note||event.itemNote||'无文字备注')}</div>${event.eventType==='return'?(event.images?.length?`<div class="evidence-gallery compact">${event.images.map((src,j)=>`<div><img src="${src}" alt="还货图片 ${j+1}"><span>还货图 ${j+1}</span></div>`).join('')}</div>`:'<div class="item-meta">本次未上传还货图片</div>'):`<button class="btn small secondary open-linked-sale" data-sale-id="${event.saleId||''}">查看销售单 ${esc(event.orderNo||'')}</button>`}</div>`).join(''):emptyState('＋','还没有流转记录','每一次还货和借调售出都会自动留在这里');
  openModal(`调借单 ${l.loanNo}`,`<div class="notice ${!open?'success':overdue?'danger':'warn'}">${state}${open?` · 还有 ${fmtInt(remaining)} 件未处理`:''}</div>
    <div class="grid-2"><div class="metric compact"><div class="label">调借人</div><div class="value" style="font-size:14px">${esc(l.person)}</div></div><div class="metric compact"><div class="label">类型</div><div class="value" style="font-size:14px">${l.type==='borrow'?'调入/借入':'借出'}</div></div></div>
    <div class="loan-info-head"><div class="section-title">借调信息与原始图片</div><button id="loanEvidenceMore" class="loan-evidence-corner" type="button">··· 凭证</button></div><div class="notice">借调时间：${fmtDateTime(l.date)}<br>预计归还：${fmtDate(loanDueDate(l))}<br>文字备注：${esc(l.note||'无')}${(l.legalDocuments||[]).length?`<br><span class="linked-source-tag">已保存 ${(l.legalDocuments||[]).length} 份合同/交接凭证</span>`:''}</div>${originalImages}
    <div class="section-title">借调商品 <small>归还、售出均在商品后操作</small></div><div class="return-product-list">${productsHTML}</div>
    ${open?`<div class="return-action-grid"><button id="returnAll" class="btn success block">全部还货</button><button id="returnPartial" class="btn secondary block">部分还货</button></div>`:''}
    <div class="section-title">流转记录 <small>还货 ${returnEvents.length} 次 · 售出 ${saleEvents.length} 次</small></div><div class="return-history">${eventsHTML}</div>
    ${open?`<button id="nextReturn" class="next-return-box" type="button"><span>＋</span><strong>记录下一次还货</strong><small>上传本次还货图片、填写时间和文字备注</small></button>`:`<div class="notice success">这张调借单的商品已经全部归还或售出，记录已完整保留。</div>`}` ,{full:true,onOpen:()=>{
      $$('.return-one').forEach(btn=>btn.onclick=()=>openLoanReturnForm(l.id,btn.dataset.productId,false,false));
      $$('.sell-one').forEach(btn=>btn.onclick=()=>openLoanSaleForm(l.id,btn.dataset.productId));
      $$('.open-linked-sale').forEach(btn=>btn.onclick=async()=>{const sale=await dbGet('sales',btn.dataset.saleId);if(sale)openSaleDetail(sale);});
      if($('#returnAll'))$('#returnAll').onclick=()=>openLoanReturnForm(l.id,null,true,false);
      if($('#returnPartial'))$('#returnPartial').onclick=()=>openLoanReturnForm(l.id,null,false,false);
      if($('#nextReturn'))$('#nextReturn').onclick=()=>openLoanReturnForm(l.id,null,false,false);
      if($('#loanEvidenceMore'))$('#loanEvidenceMore').onclick=()=>openLoanDocumentHub(l.id);
    }});
}
async function openLoanSaleForm(loanId,productId){
  const [l,p,customers,sales]=await Promise.all([dbGet('loans',loanId),dbGet('products',productId),dbAll('customers'),dbAll('sales')]);
  if(!l||!p){showToast('关联商品或调借单不存在');return;}
  const li=(l.items||[]).find(x=>x.productId===productId),remaining=li?loanItemRemaining(l,li):0;if(!li||remaining<=0){showToast('这件商品已经没有可售出的借调数量');return;}
  const history=new Map();customers.forEach(c=>history.set(c.name,{id:c.id,name:c.name,phone:c.phone||'',orders:0,lastDate:c.updatedAt||c.createdAt||''}));sales.forEach(order=>{const name=String(order.customerName||'').trim();if(!name||name==='散客')return;const x=history.get(name)||{id:order.customerId||'',name,phone:'',orders:0,lastDate:order.createdAt};x.orders++;if(!x.lastDate||new Date(order.createdAt)>new Date(x.lastDate))x.lastDate=order.createdAt;history.set(name,x);});
  const people=[...history.values()].sort((a,b)=>new Date(b.lastDate||0)-new Date(a.lastDate||0));
  const draft={customerId:'',customerName:l.person||'',date:localInputDateTime(),qty:Math.min(1,remaining),price:n(li.salePrice||p.salePrice),discountType:'none',discountValue:0,received:'',itemNote:li.productNote||p.note||'',note:`由调借单 ${l.loanNo} 售出`};
  openModal('借调商品售出',`<form id="loanSaleForm"><div class="notice success">${esc(l.person)} · ${esc(l.loanNo)}<br>售出后会自动生成正式销售单，并同步调借未处理数量、销售记录、库存流水、利润和统计。</div><div class="loan-sale-product">${li.image?`<img class="loan-thumb" src="${li.image}" alt="">`:`<div class="loan-thumb placeholder">玉</div>`}<div class="item-main"><div class="item-title">${esc(li.productName)}</div><div class="item-meta">${esc(li.productCode||'')} · ${esc(li.color||'')} · 可处理 ${fmtInt(remaining)}</div><div class="loan-product-note">商品备注：${esc(li.productNote||p.note||'无')}</div></div></div><div class="form-group autocomplete"><label class="form-label">销售客户</label><input id="loanSaleCustomer" class="input" value="${esc(draft.customerName)}" placeholder="输入一个字匹配历史客户"><div id="loanSaleCustomerSuggestions" class="autocomplete-list hidden"></div></div><div class="form-group"><label class="form-label">销售时间</label><input id="loanSaleDate" class="input" type="datetime-local" value="${draft.date}"></div><div class="form-row"><div class="form-group"><label class="form-label">售出数量</label><input id="loanSaleQty" class="input" type="number" min="0.01" max="${n(remaining)}" step="0.01" value="${n(draft.qty)}"></div><div class="form-group"><label class="form-label">销售单价</label><input id="loanSalePrice" class="input" type="number" min="0" step="0.01" value="${n(draft.price)}"></div></div><div class="form-row"><div class="form-group"><label class="form-label">优惠方式</label><select id="loanSaleDiscountType" class="select"><option value="none">无优惠</option><option value="amount">优惠金额</option><option value="percent">折扣百分比</option><option value="round">抹零</option></select></div><div class="form-group"><label class="form-label">优惠值</label><input id="loanSaleDiscountValue" class="input" type="number" min="0" step="0.01" value="0"></div></div><div class="form-group"><label class="form-label">本次实收</label><input id="loanSaleReceived" class="input" type="number" min="0" step="0.01"></div><div class="form-group"><label class="form-label">商品备注（保存到本次销售明细）</label><textarea id="loanSaleItemNote" class="textarea">${esc(draft.itemNote)}</textarea></div><div class="form-group"><label class="form-label">销售备注</label><textarea id="loanSaleNote" class="textarea">${esc(draft.note)}</textarea></div><div id="loanSaleSummary" class="total-box"></div><div class="notice warn">${l.type==='lend'?'这件商品在借出时已经从仓库库存扣减，售出时不会重复扣库存；系统会把借调未处理数量转为已售出，并写入一条关联库存流水。':'这件商品是调入/借入库存，售出时会从当前仓库库存正常扣减。'}</div><button id="saveLoanSale" class="btn loan-sell block" type="submit">确认售出并生成销售单</button></form>`,{full:true,onOpen:()=>{
    const input=$('#loanSaleCustomer'),suggestions=$('#loanSaleCustomerSuggestions');
    const drawPeople=()=>{const q=input.value.trim().toLowerCase(),rows=q?people.filter(x=>[x.name,x.phone].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,8):[];suggestions.innerHTML=rows.map(x=>`<button type="button" class="autocomplete-option loan-sale-customer-option" data-name="${esc(x.name)}" data-id="${esc(x.id||'')}"><strong>${esc(x.name)}</strong><span>${x.phone?esc(x.phone)+' · ':''}${x.orders||0} 笔销售${x.lastDate?' · 最近 '+fmtDate(x.lastDate):''}</span></button>`).join('');suggestions.classList.toggle('hidden',!rows.length);$$('.loan-sale-customer-option',suggestions).forEach(btn=>btn.onclick=()=>{input.value=btn.dataset.name;draft.customerId=btn.dataset.id;draft.customerName=btn.dataset.name;suggestions.classList.add('hidden');});};
    input.oninput=()=>{draft.customerId='';drawPeople();};input.onfocus=drawPeople;input.onblur=()=>setTimeout(()=>suggestions.classList.add('hidden'),160);
    let receivedTouched=false;
    const sync=()=>{draft.customerName=input.value.trim();draft.date=$('#loanSaleDate').value;draft.qty=n($('#loanSaleQty').value);draft.price=n($('#loanSalePrice').value);draft.discountType=$('#loanSaleDiscountType').value;draft.discountValue=n($('#loanSaleDiscountValue').value);draft.received=$('#loanSaleReceived').value;draft.itemNote=$('#loanSaleItemNote').value;draft.note=$('#loanSaleNote').value;};
    const update=()=>{sync();const totals=calcSaleTotals({items:[{qty:draft.qty,price:draft.price}],discountType:draft.discountType,discountValue:draft.discountValue});if(!receivedTouched){$('#loanSaleReceived').value=totals.finalAmount.toFixed(2);draft.received=$('#loanSaleReceived').value;}$('#loanSaleSummary').innerHTML=`<div class="total-row"><span>商品金额</span><strong>${fmtMoney(totals.subtotal)}</strong></div><div class="total-row"><span>优惠/抹零</span><strong>-${fmtMoney(totals.discountAmount)}</strong></div><div class="total-row grand"><span>应收</span><strong>${fmtMoney(totals.finalAmount)}</strong></div>`;$('#saveLoanSale').disabled=draft.qty<=0||draft.qty>remaining;};
    ['loanSaleQty','loanSalePrice','loanSaleDiscountType','loanSaleDiscountValue'].forEach(id=>$('#'+id).oninput=update);$('#loanSaleReceived').oninput=()=>{receivedTouched=true;draft.received=$('#loanSaleReceived').value;};update();
    $('#loanSaleForm').onsubmit=async e=>{e.preventDefault();sync();if(draft.qty<=0||draft.qty>remaining){showToast(`售出数量不能超过当前未处理数量 ${fmtInt(remaining)}`);return;}if(!draft.date||Number.isNaN(new Date(draft.date).getTime())){showToast('请选择有效销售时间');return;}try{
      const currentLoan=await dbGet('loans',l.id),currentItem=(currentLoan.items||[]).find(x=>x.productId===productId),currentRemaining=currentItem?loanItemRemaining(currentLoan,currentItem):0;if(currentRemaining<draft.qty)throw new Error(`当前只剩 ${fmtInt(currentRemaining)} 件可售出`);
      if(currentLoan.type==='borrow')await validateStock([{productId,productName:p.name,qty:draft.qty}],-1);
      let customerId=draft.customerId||'',customerName=draft.customerName||'散客';if(customerName!=='散客'&&!customerId){const all=await dbAll('customers');let c=all.find(x=>x.name===customerName);if(!c){c={id:uid('cust'),name:customerName,phone:'',note:'借调售出自动创建',createdAt:nowISO(),updatedAt:nowISO()};await dbPut('customers',c);}customerId=c.id;}
      const saleId=uid('sale'),eventId=uid('loan_sale_event'),orderNo=await nextOrderNo(),createdAt=new Date(draft.date).toISOString();const totals=calcSaleTotals({items:[{qty:draft.qty,price:draft.price}],discountType:draft.discountType,discountValue:draft.discountValue});
      if(currentLoan.type==='borrow')await adjustStock(productId,-draft.qty,'loan_sale','sale',saleId,`借调售出 ${orderNo} · 来源 ${currentLoan.loanNo}`,createdAt);else await recordStockReference(productId,'loan_sale','sale',saleId,`借调售出 ${orderNo} · 来源 ${currentLoan.loanNo}；借出时库存已扣减，本次不重复扣减`,createdAt);
      const saleItem={productId:p.id,productName:p.name,productCode:p.code,color:currentItem.color||p.color,qty:draft.qty,price:draft.price,costPrice:n(currentItem.costPrice||p.costPrice),image:currentItem.image||p.image,stock:n(p.stock),productNote:currentItem.productNote||p.note||'',itemNote:draft.itemNote,fromLoan:true,loanId:currentLoan.id,loanNo:currentLoan.loanNo,loanPerson:currentLoan.person,loanType:currentLoan.type,loanSaleEventId:eventId};
      const sale={id:saleId,orderNo,customerId,customerName,items:[saleItem],subtotal:totals.subtotal,discountType:draft.discountType,discountValue:draft.discountValue,discountAmount:totals.discountAmount,finalAmount:totals.finalAmount,received:draft.received===''?totals.finalAmount:n(draft.received),note:draft.note,status:'active',sourceType:'loan_sale',sourceLoanId:currentLoan.id,sourceLoanNo:currentLoan.loanNo,createdAt,cancelledAt:null,updatedAt:nowISO()};await dbPut('sales',sale);await writeAudit('sale.loan_create','sale',sale.id,`${orderNo} · 来源 ${currentLoan.loanNo}`,null,sale);
      currentLoan.items=(currentLoan.items||[]).map(x=>x.productId===productId?{...x,soldQty:loanItemSoldQty(currentLoan,x)+draft.qty}:x);currentLoan.saleEvents=[...(currentLoan.saleEvents||[]),{id:eventId,saleId,orderNo,date:createdAt,customerId,customerName,note:draft.note,itemNote:draft.itemNote,status:'active',items:[{productId:p.id,productName:p.name,productCode:p.code,color:saleItem.color,qty:draft.qty,price:draft.price}],createdAt:nowISO()}];refreshLoanStatus(currentLoan);await dbPut('loans',currentLoan);await writeAudit('loan.sale','loan',currentLoan.id,`${currentLoan.loanNo} 售出 ${p.name} × ${fmtInt(draft.qty)}`,null,{saleId,orderNo,productId,qty:draft.qty});
      closeModal();showToast(`已售出并生成销售单 ${orderNo}`);await openLoanDetail(currentLoan.id);
    }catch(err){showToast(err.message);}};
  }});
}
async function openLoanReturnForm(loanId,productId=null,all=false,returnToDraft=false){
  const l=await dbGet('loans',loanId);if(!l||!loanIsOpen(l)){showToast('这张调借单已经还清');return;}
  const remaining=(l.items||[]).filter(i=>loanItemRemaining(l,i)>0);
  const selected=productId?remaining.filter(i=>i.productId===productId):remaining;
  const draft={date:localInputDateTime(),note:'',images:[],items:selected.map(i=>({...i,remainingQty:loanItemRemaining(l,i),returnQty:all||productId?loanItemRemaining(l,i):0}))};
  const rowsHTML=draft.items.map((i,idx)=>`<div class="return-entry-row" data-return-index="${idx}"><div class="item-main"><div class="item-title">${esc(i.productName)}</div><div class="item-meta">${esc(i.color||'')} · 当前未还 ${fmtInt(i.remainingQty)}</div></div><div class="return-qty-control"><span>本次还</span><input class="mini-input return-qty" type="number" min="0" max="${n(i.remainingQty)}" step="0.01" value="${n(i.returnQty)}" ${all?'readonly':''}></div></div>`).join('');
  const title=all?'全部还货':productId?'归还单件商品':'记录部分还货';
  openModal(title,`<form id="loanReturnForm"><div class="notice ${all?'success':'warn'}">${esc(l.person)} · ${esc(l.loanNo)}<br>${all?'本次会把所有剩余商品全部入库。':'只填写本次实际归还的数量，未还部分继续挂账。'}</div><div class="form-group"><label class="form-label">还货日期和时间</label><input id="returnDate" class="input" type="datetime-local" value="${draft.date}"></div><div class="loan-step-card"><div class="loan-step-title"><span>1</span> 本次归还商品</div>${rowsHTML}<div id="returnSummary" class="notice warn"></div></div><div class="loan-step-card"><div class="loan-step-title"><span>2</span> 本次还货图片留底</div><div class="return-photo-actions"><label class="btn secondary" for="returnCamera">📷 直接拍照</label><label class="btn secondary" for="returnGallery">＋ 相册多选</label></div><input id="returnCamera" class="hidden" type="file" accept="image/*" capture="environment"><input id="returnGallery" class="hidden" type="file" accept="image/*" multiple><div class="field-help">每次还货单独保存，二次、三次还货的图片不会覆盖。</div><div class="upload-meta"><span id="returnImageCount">已选 0/12 张</span><span>可连续拍照或多次添加</span></div><div id="returnImagePreview" class="upload-preview loan-image-preview"></div><div class="form-group" style="margin-top:12px"><label class="form-label">本次还货文字备注</label><textarea id="returnNote" class="textarea" placeholder="例如：当面归还、微信确认、商品状态、还有哪件未还等"></textarea></div></div><div class="sticky-actions"><button id="saveReturn" type="submit" class="btn success block">保存本次还货并同步库存</button></div></form>`,{full:true,onOpen:()=>{
    if(returnToDraft){const backToDraft=()=>renderLoanFormModal();$('.modal-close').onclick=backToDraft;$('.modal-backdrop').addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))setTimeout(backToDraft,0);});}
    const sync=()=>{draft.date=$('#returnDate').value;draft.note=$('#returnNote').value;$$('[data-return-index]').forEach(el=>{draft.items[n(el.dataset.returnIndex)].returnQty=n($('.return-qty',el).value);});};
    const renderImages=()=>{$('#returnImageCount').textContent=`已选 ${draft.images.length}/12 张`;$('#returnImagePreview').innerHTML=draft.images.map((src,idx)=>`<div class="upload-thumb-wrap"><img src="${src}" alt="还货图片 ${idx+1}"><button type="button" class="remove-return-image" data-index="${idx}">×</button></div>`).join('');$$('.remove-return-image').forEach(btn=>btn.onclick=()=>{draft.images.splice(n(btn.dataset.index),1);renderImages();});};
    const update=()=>{sync();let qty=0,invalid=0;draft.items.forEach(i=>{qty+=n(i.returnQty);if(n(i.returnQty)<0||n(i.returnQty)>n(i.remainingQty))invalid++;});const summary=$('#returnSummary');if(invalid){summary.className='notice danger';summary.innerHTML='归还数量不能超过当前未还数量。';}else if(qty<=0){summary.className='notice warn';summary.innerHTML='请填写至少一件商品的本次归还数量。';}else if(!draft.images.length){summary.className='notice warn';summary.innerHTML=`本次归还 <strong>${fmtInt(qty)}</strong> 件；还需要至少拍摄或上传 1 张还货图片。`;}else{summary.className='notice success';summary.innerHTML=`本次共归还 <strong>${fmtInt(qty)}</strong> 件，图片已留底，保存后立即同步库存。`;}$('#saveReturn').disabled=invalid>0||qty<=0||!draft.images.length;};
    $$('.return-qty').forEach(input=>input.oninput=update);
    const addReturnImages=async e=>{const files=[...e.target.files],room=Math.max(0,12-draft.images.length);if(!room){showToast('本次最多上传 12 张图片');e.target.value='';return;}for(const file of files.slice(0,room))draft.images.push(await compressImage(file,1080,.72));if(files.length>room)showToast(`只添加前 ${room} 张，最多 12 张`);e.target.value='';renderImages();update();};
    $('#returnCamera').onchange=addReturnImages;$('#returnGallery').onchange=addReturnImages;
    renderImages();update();
    $('#loanReturnForm').onsubmit=async e=>{e.preventDefault();sync();const items=draft.items.filter(i=>n(i.returnQty)>0).map(i=>({productId:i.productId,productName:i.productName,productCode:i.productCode,color:i.color,qty:n(i.returnQty)}));if(!items.length){showToast('请填写本次归还数量');return;}if(!draft.images.length){showToast('每次还货至少需要拍摄或上传 1 张图片留底');return;}for(const i of draft.items){if(n(i.returnQty)>n(i.remainingQty)){showToast(`${i.productName} 归还数量超过未还数量`);return;}}if(!draft.date||Number.isNaN(new Date(draft.date).getTime())){showToast('请选择有效还货时间');return;}try{
      if(l.type==='borrow')await validateStock(items.map(i=>({...i,qty:i.qty})),-1);
      const eventId=uid('return'),eventDate=new Date(draft.date).toISOString(),eventNo=(l.returns||[]).length+1;
      for(const i of items)await adjustStock(i.productId,(l.type==='borrow'?-1:1)*n(i.qty),'loan_return','loan_return',eventId,`${l.person} 第${eventNo}次归还 ${l.loanNo}`,eventDate);
      l.items=(l.items||[]).map(item=>{const back=items.find(x=>x.productId===item.productId);return {...item,returnedQty:loanItemReturnedQty(l,item)+n(back?.qty)};});
      l.returns=[...(l.returns||[]),{id:eventId,date:eventDate,note:draft.note,images:draft.images,items,createdAt:nowISO()}];
      refreshLoanStatus(l);if(l.status==='returned')l.returnedAt=eventDate;await dbPut('loans',l);await writeAudit('loan.return','loan',l.id,`${l.loanNo} 本次归还 ${fmtInt(items.reduce((sum,x)=>sum+n(x.qty),0))} 件`,null,{eventId,date:eventDate,items});const finished=!loanIsOpen(l);closeModal();showToast(finished?'本张调借单已处理完成，库存已同步':'本次还货已保存，剩余继续挂账');if(returnToDraft&&appState.loanDraft)await renderLoanFormModal();else await openLoanDetail(l.id);
    }catch(err){showToast(err.message);}};
  }});
}
async function renderReports(){
  setHeader('统计报表','经营概况、销售、利润、客户、商品');
  $('#main').innerHTML=`<div class="segment" id="reportRange"><button data-range="today">今天</button><button data-range="yesterday">昨天</button><button data-range="tomorrow">明天</button><button data-range="7d">7天</button><button data-range="30d" class="active">30天</button><button data-range="all">全部</button><button data-range="custom">自定义</button></div><div id="reportBody"></div>`;
  const draw=async(key='30d',s='',e='')=>{
    const [sales,products,customers]=await Promise.all([dbAll('sales'),dbAll('products'),dbAll('customers')]); const range=dateRange(key,s,e); const rows=sales.filter(x=>x.status==='active'&&inRange(x.createdAt,range));
    const revenue=rows.reduce((a,x)=>a+n(x.finalAmount),0), received=rows.reduce((a,x)=>a+n(x.received),0), qty=rows.reduce((a,x)=>a+x.items.reduce((b,i)=>b+n(i.qty),0),0);
    const grossProfit=rows.reduce((a,x)=>a+x.items.reduce((b,i)=>b+(n(i.price)-n(i.costPrice))*n(i.qty),0)-n(x.discountAmount),0);
    const discount=rows.reduce((a,x)=>a+n(x.discountAmount),0), cost=revenue-grossProfit;
    const customerMap={}; rows.forEach(x=>{const key=x.customerName||'散客';if(!customerMap[key])customerMap[key]={name:key,amount:0,qty:0,orders:0};customerMap[key].amount+=n(x.finalAmount);customerMap[key].qty+=x.items.reduce((a,i)=>a+n(i.qty),0);customerMap[key].orders++;});
    const productMap={}; rows.forEach(x=>x.items.forEach(i=>{if(!productMap[i.productId])productMap[i.productId]={name:i.productName,color:i.color,qty:0,amount:0,profit:0};productMap[i.productId].qty+=n(i.qty);productMap[i.productId].amount+=n(i.price)*n(i.qty);productMap[i.productId].profit+=(n(i.price)-n(i.costPrice))*n(i.qty);}));
    const customerRank=Object.values(customerMap).sort((a,b)=>b.amount-a.amount); const productRank=Object.values(productMap).sort((a,b)=>b.amount-a.amount);
    const inventoryCost=products.reduce((a,p)=>a+n(p.stock)*n(p.costPrice),0), inventoryQty=products.reduce((a,p)=>a+n(p.stock),0);
    $('#reportBody').innerHTML=`
      <div class="section-title">经营概况</div><div class="grid-2"><div class="metric"><div class="label">销售额</div><div class="value">${fmtMoney(revenue)}</div><div class="hint">${rows.length} 笔订单</div></div><div class="metric"><div class="label">本次实收</div><div class="value">${fmtMoney(received)}</div><div class="hint">应收差额 ${fmtMoney(revenue-received)}</div></div><div class="metric"><div class="label">销售数量</div><div class="value">${fmtInt(qty)}</div><div class="hint">商品件数</div></div><div class="metric"><div class="label">毛利润</div><div class="value">${fmtMoney(grossProfit)}</div><div class="hint">毛利率 ${revenue?((grossProfit/revenue)*100).toFixed(1):0}%</div></div></div>
      <div class="section-title">利润分析</div><div class="grid-3"><div class="metric compact"><div class="label">销售成本</div><div class="value">${fmtMoney(cost)}</div></div><div class="metric compact"><div class="label">优惠抹零</div><div class="value">${fmtMoney(discount)}</div></div><div class="metric compact"><div class="label">单均金额</div><div class="value">${fmtMoney(rows.length?revenue/rows.length:0)}</div></div></div>
      <div class="section-title">库存汇总</div><div class="grid-3"><div class="metric compact"><div class="label">商品数量</div><div class="value">${products.length}</div></div><div class="metric compact"><div class="label">库存总数</div><div class="value">${fmtInt(inventoryQty)}</div></div><div class="metric compact"><div class="label">库存成本</div><div class="value">${fmtMoney(inventoryCost)}</div></div></div>
      <div class="section-title">客户分析 / 客户排名 <small>${customers.length} 位客户</small></div>${customerRank.length?`<div class="table-wrap"><table class="table"><thead><tr><th>排名</th><th>客户</th><th>订单</th><th>拿货数</th><th>交易额</th></tr></thead><tbody>${customerRank.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${x.orders}</td><td>${fmtInt(x.qty)}</td><td>${fmtMoney(x.amount)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('♙','暂无客户销售数据')}
      <div class="section-title">商品销售排名</div>${productRank.length?`<div class="table-wrap"><table class="table"><thead><tr><th>排名</th><th>商品</th><th>颜色</th><th>销量</th><th>交易额</th><th>毛利润</th></tr></thead><tbody>${productRank.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.name)}</td><td>${esc(x.color||'')}</td><td>${fmtInt(x.qty)}</td><td>${fmtMoney(x.amount)}</td><td>${fmtMoney(x.profit)}</td></tr>`).join('')}</tbody></table></div>`:emptyState('◫','暂无商品销售数据')}
      <button id="exportSalesReport" class="btn secondary block" style="margin-top:12px">导出当前销售报表 CSV</button>`;
    $('#exportSalesReport').onclick=()=>exportSalesCSV(rows);
  };
  draw();$$('#reportRange button').forEach(b=>b.onclick=()=>{if(b.dataset.range==='custom'){openDateRangePicker((s,e)=>draw('custom',s,e));return;}$$('#reportRange button').forEach(x=>x.classList.toggle('active',x===b));draw(b.dataset.range);});
}
function exportSalesCSV(rows){
  const head=['订单号','销售时间','客户','商品名称','颜色','数量','销售单价','商品金额','订单优惠','订单应收','本次实收','状态']; const out=[];
  rows.forEach(s=>s.items.forEach(i=>out.push([s.orderNo,fmtDateTime(s.createdAt),s.customerName,i.productName,i.color,i.qty,i.price,n(i.qty)*n(i.price),s.discountAmount,s.finalAmount,s.received,s.status==='active'?'有效':'已撤销'])));
  downloadBlob('\ufeff'+[head,...out].map(r=>r.map(csvCell).join(',')).join('\n'),`销售报表_${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');
}


function normalizeMatchKey(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,'');}
function mergeImportedNote(existing,parts=[]){
  const clean=[...new Set(parts.map(x=>String(x||'').trim()).filter(Boolean))].join('；');
  if(!clean)return existing||'';if(!existing)return clean;if(existing.includes(clean))return existing;return `${existing}\n${clean}`;
}
function safeQinsilkImage(value){try{const url=new URL(String(value||''));return url.protocol==='https:'&&(url.hostname==='thumb.qinsilk.com'||url.hostname.endsWith('.qinsilk.com'))?url.href:'';}catch(_){return '';}}
function qinsilkPreviewLine(kind,row){
  if(kind==='products')return `${esc(row.code||'无货号')} · ${esc(row.name||'未命名')} · 成本 ${fmtMoney(row.costPrice)} · 售价 ${fmtMoney(row.salePrice)}`;
  if(kind==='customers')return `${esc(row.name||'未命名')} · ${esc(row.phone||'无电话')} · ${esc(row.type||'')}`;
  if(kind==='inventory')return `${esc(row.code||row.name||'未匹配')} · 库存 ${fmtInt(row.stock)}${row.warehouse?` · ${esc(row.warehouse)}`:''}`;
  if(kind==='sales')return `${esc(row.orderNo||'无单号')} · ${esc(row.name||row.code||'未匹配')} × ${fmtInt(row.qty)} · ${fmtMoney(row.amount||row.qty*row.price)}`;
  return '无法预览';
}
async function getQinsilkHistory(){return (await dbGet('settings','qinsilkImportHistory'))||{id:'qinsilkImportHistory',batches:[]};}
async function analyzeQinsilkFile(file){
  const [products,customers,sales,history]=await Promise.all([dbAll('products'),dbAll('customers'),dbAll('sales'),getQinsilkHistory()]);
  const repeated=(history.batches||[]).some(b=>b.hash&&b.hash===file.hash);
  const rows=file.normalized||[];let create=0,update=0,skip=0,invalid=0,warning=0;
  if(file.kind==='products'){
    const existing=new Map(products.map(p=>[normalizeMatchKey(p.code),p]));const seen=new Set();
    for(const row of rows){const key=normalizeMatchKey(row.code);if(!row.name||!key){invalid++;continue;}if(seen.has(key)){skip++;continue;}seen.add(key);existing.has(key)?update++:create++;if(!row.salePrice)warning++;}
  }else if(file.kind==='customers'){
    const phones=new Set(customers.map(c=>normalizeMatchKey(c.phone)).filter(Boolean)),names=new Set(customers.map(c=>normalizeMatchKey(c.name)).filter(Boolean));const seen=new Set();
    for(const row of rows){if(!row.name){invalid++;continue;}const key=normalizeMatchKey(row.phone)||normalizeMatchKey(row.name);if(seen.has(key)){skip++;continue;}seen.add(key);(row.phone&&phones.has(normalizeMatchKey(row.phone)))||names.has(normalizeMatchKey(row.name))?update++:create++;}
  }else if(file.kind==='inventory'){
    const codes=new Set(products.map(p=>normalizeMatchKey(p.code)).filter(Boolean)),names=new Set(products.map(p=>normalizeMatchKey(p.name)).filter(Boolean));
    for(const row of rows){if(!row.hasStock||(!row.code&&!row.name)){invalid++;continue;}(codes.has(normalizeMatchKey(row.code))||names.has(normalizeMatchKey(row.name)))?update++:warning++;}
  }else if(file.kind==='sales'){
    const codes=new Set(products.map(p=>normalizeMatchKey(p.code)).filter(Boolean)),names=new Set(products.map(p=>normalizeMatchKey(p.name)).filter(Boolean));const sourceKeys=new Set(sales.map(s=>s.sourceKey||s.orderNo).filter(Boolean));const orders=new Set();
    for(const row of rows){if(row.returnLike){skip++;continue;}if(row.qty<=0||(!row.code&&!row.name)){invalid++;continue;}if(!(codes.has(normalizeMatchKey(row.code))||names.has(normalizeMatchKey(row.name)))){warning++;continue;}const order=row.orderNo||`第${row.rowNumber}行`;orders.add(order);}
    for(const order of orders)sourceKeys.has(`qinsilk:${order}`)||sourceKeys.has(order)?skip++:create++;
  }else invalid=rows.length||1;
  return {create,update,skip,invalid,warning,repeated};
}
function qinsilkFileCard(file,index){
  const a=file.analysis||{},bad=file.kind==='unknown'||!file.normalized.length;
  return `<div class="card qinsilk-file-card ${bad?'import-file-error':''}"><div class="qinsilk-file-head"><div><div class="item-title">${esc(file.fileName)}</div><div class="item-meta">${esc(QinSilkImport.kindLabel(file.kind))} · ${fmtInt(file.normalized.length)} 行 · ${(file.fileSize/1024/1024).toFixed(2)} MB</div></div><button class="btn small secondary remove-qinsilk-file" data-index="${index}">移除</button></div>${a.repeated?'<div class="notice warn compact-notice">这个文件以前导入过；再次导入会按货号更新，不会重复增加销售单。</div>':''}<div class="import-stats"><span class="badge success">新增 ${a.create||0}</span><span class="badge">更新 ${a.update||0}</span><span class="badge warn">警告 ${a.warning||0}</span><span class="badge danger">无效 ${a.invalid||0}</span><span class="badge">跳过 ${a.skip||0}</span></div>${bad?`<div class="notice danger">${file.error?esc(file.error):file.normalized.length?'无法识别文件类型':'文件中没有可导入的数据'}</div>`:`<div class="qinsilk-preview">${file.normalized.slice(0,4).map(row=>`<div>${qinsilkPreviewLine(file.kind,row)}</div>`).join('')}</div>`}</div>`;
}
async function drawQinsilkImportFiles(){
  const box=$('#qinsilkFileList');if(!box)return;
  box.innerHTML=appState.qinsilkFiles.length?appState.qinsilkFiles.map(qinsilkFileCard).join(''):emptyState('⇩','尚未选择秦丝文件','可以一次选择商品、客户、库存和销售 Excel');
  $$('.remove-qinsilk-file').forEach(btn=>btn.onclick=()=>{appState.qinsilkFiles.splice(Number(btn.dataset.index),1);drawQinsilkImportFiles();updateQinsilkRunState();});
}
function updateQinsilkRunState(){const run=$('#runQinsilkImport');if(run)run.disabled=!appState.qinsilkBackupDone||!appState.qinsilkFiles.some(f=>f.kind!=='unknown'&&f.normalized.length);const flag=$('#qinsilkBackupFlag');if(flag)flag.textContent=appState.qinsilkBackupDone?'已完成备份，可以导入':'导入前必须先下载完整备份';}
async function renderQinsilkImport(){
  setHeader('秦丝数据导入','Excel预览、去重与安全导入');
  const history=await getQinsilkHistory();
  $('#main').innerHTML=`<div class="notice success"><strong>秦丝继续作为正式账本，本页面用于单向导入。</strong><br>商品按货号更新；客户按手机或姓名合并；库存按当前数量覆盖；销售作为历史记录导入，不重复扣减库存。</div>
  <div class="card"><div class="card-title">1. 选择秦丝文件</div><label class="upload-box qinsilk-upload" for="qinsilkFiles">点击选择 Excel / CSV<br><small>支持多选：商品、客户、库存、销售</small></label><input id="qinsilkFiles" class="hidden" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" multiple><div id="qinsilkParseStatus" class="item-meta" style="margin-top:8px"></div></div>
  <div id="qinsilkFileList"></div>
  <div class="card"><div class="card-title">2. 备份后执行</div><div id="qinsilkBackupFlag" class="notice warn">导入前必须先下载完整备份</div><button id="backupBeforeQinsilk" class="btn secondary block">先导出完整 JSON 备份</button><button id="runQinsilkImport" class="btn block" style="margin-top:8px" disabled>开始安全导入</button><div id="qinsilkProgress" class="import-progress hidden"><div id="qinsilkProgressBar"></div></div><div id="qinsilkResult" style="margin-top:10px"></div></div>
  <div class="card"><div class="card-title">导入规则</div><div class="rule-list"><div><strong>商品</strong><span>货号相同则更新资料；商品表没有实际库存时，库存保持不变或新商品设为0。</span></div><div><strong>库存</strong><span>按货号汇总所有仓库后设置为当前库存，并生成一条库存同步流水。</span></div><div><strong>销售</strong><span>只导入历史记录，不改变当前库存；秦丝退货/负数行先跳过并列入结果。</span></div><div><strong>图片</strong><span>先使用秦丝图片链接展示，后续可再迁移到自己的 R2。</span></div></div></div>
  <div class="section-title">最近导入 <small>${(history.batches||[]).length} 次</small></div><div class="list">${(history.batches||[]).slice(0,8).map(b=>`<div class="list-item"><div class="item-main"><div class="item-title">${esc(b.fileName||b.kind||'秦丝导入')}</div><div class="item-meta">${fmtDateTime(b.importedAt)} · ${esc(QinSilkImport.kindLabel(b.kind))} · ${fmtInt(b.rows||0)} 行</div></div><span class="badge success">完成</span></div>`).join('')||emptyState('◷','暂无导入记录')}</div>`;
  await drawQinsilkImportFiles();updateQinsilkRunState();
  $('#qinsilkFiles').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;const status=$('#qinsilkParseStatus');for(let i=0;i<files.length;i++){status.textContent=`正在读取 ${i+1}/${files.length}：${files[i].name}`;try{const parsed=await QinSilkImport.readFile(files[i]);const kind=QinSilkImport.detectKind(parsed.headers,parsed.fileName),normalized=QinSilkImport.normalize(kind,parsed.rows);const entry={...parsed,kind,normalized};entry.analysis=await analyzeQinsilkFile(entry);appState.qinsilkFiles.push(entry);}catch(err){appState.qinsilkFiles.push({fileName:files[i].name,fileSize:files[i].size,hash:'',kind:'unknown',normalized:[],error:err.message,analysis:{invalid:1}});}await drawQinsilkImportFiles();}status.textContent=`已读取 ${files.length} 个文件`;e.target.value='';updateQinsilkRunState();};
  $('#backupBeforeQinsilk').onclick=async()=>{await backupAll();appState.qinsilkBackupDone=true;updateQinsilkRunState();};
  $('#runQinsilkImport').onclick=runQinsilkImport;
  if(appState.qinsilkLastResult)showQinsilkResult(appState.qinsilkLastResult);
}
async function snapshotAllStores(){const stores={};for(const name of STORES)stores[name]=await dbAll(name);return stores;}
async function restoreStoreSnapshot(stores){window.__cloudImporting=true;try{for(const name of STORES){await dbClear(name,true);for(const row of stores[name]||[])await dbPut(name,row,true);}}finally{window.__cloudImporting=false;}}
async function ensureQinsilkCategory(name,map){if(!name)return '';const key=normalizeMatchKey(name);if(map.has(key))return map.get(key).name;const row={id:uid('cat'),name,createdAt:nowISO()};await dbPut('categories',row,true);map.set(key,row);return name;}
async function importQinsilkProducts(file,batch,result){
  const products=await dbAll('products'),categories=await dbAll('categories'),map=new Map(products.map(p=>[normalizeMatchKey(p.code),p])),catMap=new Map(categories.map(c=>[normalizeMatchKey(c.name),c])),seen=new Set();
  for(const row of file.normalized){const key=normalizeMatchKey(row.code);if(!row.name||!key){result.invalid++;result.details.push(['商品','无效',row.code||'',`第${row.rowNumber}行缺少名称或货号`]);continue;}if(seen.has(key)){result.skipped++;continue;}seen.add(key);const old=map.get(key),category=await ensureQinsilkCategory(row.category,catMap);const sourceNote=[row.size&&`规格：${row.size}`,row.barcode&&`条码：${row.barcode}`,row.supplier&&`供应商：${row.supplier}`];const product={...(old||{}),id:old?.id||uid('prod'),name:row.name,code:row.code,category,color:row.color||old?.color||'',costPrice:row.costPrice||old?.costPrice||0,salePrice:row.salePrice||old?.salePrice||0,stock:row.hasStock?row.stock:n(old?.stock),note:old?.note||mergeImportedNote('',sourceNote),image:safeQinsilkImage(row.image)||old?.image||'',createdAt:old?.createdAt||row.launchDate||nowISO(),updatedAt:nowISO(),source:'qinsilk',sourceKey:`qinsilk:product:${row.code}`,qinsilk:{barcode:row.barcode,brand:row.brand,supplier:row.supplier,unit:row.unit,size:row.size,material:row.material,status:row.status,wholesalePrice:row.wholesalePrice,retailPrice:row.retailPrice,suggestedPrice:row.suggestedPrice,launchDate:row.launchDate,importBatchId:batch}};await dbPut('products',product,true);map.set(key,product);if(!old&&product.stock){await dbPut('stockMoves',{id:uid('move'),productId:product.id,productCode:product.code,productName:product.name,type:'qinsilk_initial',qtyChange:product.stock,beforeStock:0,afterStock:product.stock,refType:'qinsilk_import',refId:batch,note:'秦丝商品资料导入初始库存',createdAt:nowISO()},true);}old?result.updated++:result.created++;result.details.push(['商品',old?'更新':'新增',row.code,row.name]);}
}
async function importQinsilkCustomers(file,batch,result){
  const customers=await dbAll('customers'),byPhone=new Map(customers.filter(c=>c.phone).map(c=>[normalizeMatchKey(c.phone),c])),byName=new Map(customers.map(c=>[normalizeMatchKey(c.name),c])),seen=new Set();
  for(const row of file.normalized){if(!row.name){result.invalid++;continue;}const key=normalizeMatchKey(row.phone)||normalizeMatchKey(row.name);if(seen.has(key)){result.skipped++;continue;}seen.add(key);const old=(row.phone&&byPhone.get(normalizeMatchKey(row.phone)))||byName.get(normalizeMatchKey(row.name));const sourceNote=[row.type&&`秦丝类型：${row.type}`,row.tags&&`标签：${row.tags}`,row.wechat&&`微信：${row.wechat}`,row.address&&`地址：${row.address}`,row.source&&`来源：${row.source}`,row.note];const customer={...(old||{}),id:old?.id||uid('cust'),name:row.name,phone:row.phone||old?.phone||'',note:mergeImportedNote(old?.note||'',sourceNote),createdAt:old?.createdAt||row.createdAt||nowISO(),updatedAt:nowISO(),source:'qinsilk',sourceKey:`qinsilk:customer:${key}`,qinsilk:{type:row.type,tags:row.tags,contact:row.contact,wechat:row.wechat,address:row.address,balance:row.balance,points:row.points,lastPurchaseAt:row.lastPurchaseAt,importBatchId:batch}};await dbPut('customers',customer,true);if(customer.phone)byPhone.set(normalizeMatchKey(customer.phone),customer);byName.set(normalizeMatchKey(customer.name),customer);old?result.updated++:result.created++;result.details.push(['客户',old?'更新':'新增',customer.phone,customer.name]);}
}
async function importQinsilkInventory(file,batch,result){
  const products=await dbAll('products'),byCode=new Map(products.map(p=>[normalizeMatchKey(p.code),p])),byName=new Map(products.map(p=>[normalizeMatchKey(p.name),p])),groups=new Map();
  for(const row of file.normalized){if(!row.hasStock||(!row.code&&!row.name)){result.invalid++;continue;}const key=normalizeMatchKey(row.code)||`name:${normalizeMatchKey(row.name)}`;if(!groups.has(key))groups.set(key,{...row,stock:0,warehouses:[]});const g=groups.get(key);g.stock+=n(row.stock);if(row.warehouse)g.warehouses.push(row.warehouse);}
  for(const row of groups.values()){const product=(row.code&&byCode.get(normalizeMatchKey(row.code)))||byName.get(normalizeMatchKey(row.name));if(!product){result.warnings++;result.details.push(['库存','未匹配',row.code,row.name]);continue;}const before=n(product.stock),after=Math.max(0,n(row.stock)),delta=after-before;product.stock=after;if(row.costPrice)product.costPrice=row.costPrice;product.updatedAt=nowISO();product.qinsilk={...(product.qinsilk||{}),inventoryWarehouses:[...new Set(row.warehouses)],inventoryImportBatchId:batch};await dbPut('products',product,true);if(Math.abs(delta)>1e-8)await dbPut('stockMoves',{id:uid('move'),productId:product.id,productCode:product.code,productName:product.name,type:'qinsilk_inventory_sync',qtyChange:delta,beforeStock:before,afterStock:after,refType:'qinsilk_import',refId:batch,note:`秦丝当前库存同步${row.warehouses.length?`（${[...new Set(row.warehouses)].join('、')}）`:''}`,createdAt:nowISO()},true);result.updated++;result.details.push(['库存','设置',product.code,`${fmtInt(before)} → ${fmtInt(after)}`]);}
}
async function importQinsilkSales(file,batch,result){
  const [products,customers,sales]=await Promise.all([dbAll('products'),dbAll('customers'),dbAll('sales')]);const byCode=new Map(products.map(p=>[normalizeMatchKey(p.code),p])),byName=new Map(products.map(p=>[normalizeMatchKey(p.name),p])),customerByName=new Map(customers.map(c=>[normalizeMatchKey(c.name),c]));const existing=new Set(sales.flatMap(s=>[s.sourceKey,s.orderNo]).filter(Boolean)),groups=new Map();
  for(const row of file.normalized){if(row.returnLike){result.skipped++;result.details.push(['销售','跳过退货',row.orderNo,row.name]);continue;}if(row.qty<=0||(!row.code&&!row.name)){result.invalid++;continue;}const product=(row.code&&byCode.get(normalizeMatchKey(row.code)))||byName.get(normalizeMatchKey(row.name));if(!product){result.warnings++;result.details.push(['销售','商品未匹配',row.code,row.name]);continue;}const order=row.orderNo||`QS-${String(row.date||nowISO()).slice(0,10).replace(/-/g,'')}-${row.rowNumber}`,sourceKey=`qinsilk:${order}`;if(!groups.has(sourceKey))groups.set(sourceKey,{orderNo:order,sourceKey,date:row.date||nowISO(),customerName:row.customerName||'散客',note:row.note||'',items:[],amount:0,discount:0});const group=groups.get(sourceKey);group.items.push({productId:product.id,productCode:product.code,productName:product.name,color:row.color||product.color||'',qty:n(row.qty),price:n(row.price),costPrice:row.costPrice||n(product.costPrice),itemNote:'秦丝历史销售'});group.amount+=row.amount||n(row.qty)*n(row.price);group.discount+=n(row.discount);}
  for(const group of groups.values()){if(existing.has(group.sourceKey)||existing.has(group.orderNo)){result.skipped++;continue;}let customerId='';if(group.customerName&&group.customerName!=='散客'){let c=customerByName.get(normalizeMatchKey(group.customerName));if(!c){c={id:uid('cust'),name:group.customerName,phone:'',note:'秦丝销售历史自动创建',createdAt:nowISO(),updatedAt:nowISO(),source:'qinsilk'};await dbPut('customers',c,true);customerByName.set(normalizeMatchKey(c.name),c);}customerId=c.id;}const subtotal=group.items.reduce((sum,i)=>sum+n(i.qty)*n(i.price),0),finalAmount=group.amount||Math.max(0,subtotal-group.discount),discountAmount=Math.max(0,group.discount||subtotal-finalAmount);const sale={id:uid('sale'),orderNo:group.orderNo,customerId,customerName:group.customerName,items:group.items,subtotal,discountType:'amount',discountValue:discountAmount,discountAmount,finalAmount,received:finalAmount,note:mergeImportedNote(group.note,['秦丝历史销售：不改变当前库存']),status:'active',createdAt:group.date,cancelledAt:null,updatedAt:nowISO(),source:'qinsilk',sourceType:'qinsilk_history',sourceKey:group.sourceKey,importedHistorical:true,stockApplied:false,importBatchId:batch};await dbPut('sales',sale,true);existing.add(group.sourceKey);result.created++;result.details.push(['销售','新增历史',sale.orderNo,`${sale.customerName} ${fmtMoney(sale.finalAmount)}`]);}
}
function showQinsilkResult(result){const box=$('#qinsilkResult');if(!box)return;box.innerHTML=`<div class="notice success"><strong>导入完成</strong><br>新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped} · 警告 ${result.warnings} · 无效 ${result.invalid}</div><button id="downloadQinsilkLog" class="btn secondary block">下载导入结果 CSV</button>`;$('#downloadQinsilkLog').onclick=()=>{const head=['类型','结果','编号','说明'];downloadBlob('\ufeff'+[head,...result.details].map(r=>r.map(csvCell).join(',')).join('\n'),`秦丝导入结果_${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');};}
async function runQinsilkImport(){
  if(!appState.qinsilkBackupDone){showToast('请先导出完整备份');return;}const files=appState.qinsilkFiles.filter(f=>f.kind!=='unknown'&&f.normalized.length);if(!files.length){showToast('没有可导入文件');return;}if(!await confirmDialog('确认开始导入？商品会按货号更新，库存文件会设置当前库存，销售历史不会扣库存。'))return;
  await waitForInitialCloudPull();const before=await snapshotAllStores(),batch=uid('qinsilk'),result={created:0,updated:0,skipped:0,warnings:0,invalid:0,details:[],batchId:batch,startedAt:nowISO()};const button=$('#runQinsilkImport'),progress=$('#qinsilkProgress'),bar=$('#qinsilkProgressBar');button.disabled=true;button.textContent='正在导入…';progress.classList.remove('hidden');
  window.__cloudImporting=true;
  try{for(let i=0;i<files.length;i++){bar.style.width=`${Math.round(i/files.length*100)}%`;const file=files[i];if(file.kind==='products')await importQinsilkProducts(file,batch,result);else if(file.kind==='customers')await importQinsilkCustomers(file,batch,result);else if(file.kind==='inventory')await importQinsilkInventory(file,batch,result);else if(file.kind==='sales')await importQinsilkSales(file,batch,result);const history=await getQinsilkHistory();history.batches=[{batchId:batch,fileName:file.fileName,kind:file.kind,hash:file.hash,rows:file.normalized.length,importedAt:nowISO()},...(history.batches||[])].slice(0,50);history.updatedAt=nowISO();await dbPut('settings',history,true);}bar.style.width='100%';}
  catch(err){window.__cloudImporting=false;await restoreStoreSnapshot(before);button.disabled=false;button.textContent='开始安全导入';progress.classList.add('hidden');showToast(`导入失败，已自动回滚：${err.message}`);return;}finally{window.__cloudImporting=false;}
  await writeAudit('qinsilk.import','system',batch,`秦丝导入：新增${result.created} 更新${result.updated} 跳过${result.skipped}`,null,result);try{await CloudSync.push();}catch(_){showToast('本机导入完成，云端稍后重试');}appState.qinsilkLastResult=result;showQinsilkResult(result);button.textContent='已完成导入';setTimeout(()=>progress.classList.add('hidden'),500);showToast('秦丝数据导入完成');
}

async function renderMore(){
  setHeader('更多功能','客户、盘点、流水、备份');
  const items=[['content','▣','内容工作台','今日待发、素材复用、文案与发布记录'],['shortcut-setup','⚡','iPhone快捷保存','一次设置，原图/视频/店铺图直接进相册'],['qinsilk-import','⇩','秦丝数据导入','Excel导入商品、客户、库存和销售'],['customers','♙','客户管理','客户信息与拿货统计'],['sales','▥','销售单管理','撤销、恢复、复制重新开单'],['stocktake','✓','库存盘点','批量盘点并生成差异流水'],['ledger','≡','库存流水','查询所有入库、出库、销售、调借变化'],['health','◎','库存体检','核对商品库存与全部库存流水'],['audit','◷','操作日志','查看重要修改与库存变化'],['settings','⚙','数据与设置','云端备份、设备与安全设置']];
  $('#main').innerHTML=`<div class="list">${items.map(x=>`<div class="list-item clickable more-item" data-route="${x[0]}"><div class="thumb placeholder">${x[1]}</div><div class="item-main"><div class="item-title">${x[2]}</div><div class="item-meta">${x[3]}</div></div><div>›</div></div>`).join('')}</div><div class="notice warn" style="margin-top:12px">秦丝建议继续作为正式账本；漠翠系统用于玉石专业资料、借调和分析。导入前请先做完整备份。</div>`;
  $$('.more-item').forEach(el=>el.onclick=()=>navigate(el.dataset.route));
}

async function renderCustomers(){
  setHeader('客户管理','客户查询与拿货统计',{label:'＋',onClick:()=>openCustomerForm()});
  const [customers,sales]=await Promise.all([dbAll('customers'),dbAll('sales')]);
  const stats={};sales.filter(s=>s.status==='active').forEach(s=>{const id=s.customerId||s.customerName||'guest';if(!stats[id])stats[id]={amount:0,orders:0,qty:0};stats[id].amount+=n(s.finalAmount);stats[id].orders++;stats[id].qty+=s.items.reduce((a,i)=>a+n(i.qty),0);});
  $('#main').innerHTML=`<div class="toolbar"><div class="search"><input id="customerSearch" placeholder="客户姓名、电话模糊搜索"></div></div><div id="customerList" class="list"></div>`;
  const draw=()=>{const q=$('#customerSearch').value.trim().toLowerCase();const rows=customers.filter(c=>!q||[c.name,c.phone,c.note].some(v=>String(v||'').toLowerCase().includes(q)));$('#customerList').innerHTML=rows.length?rows.map(c=>{const st=stats[c.id]||{amount:0,orders:0,qty:0};return `<div class="list-item clickable customer-row" data-id="${c.id}"><div class="thumb placeholder">客</div><div class="item-main"><div class="item-title">${esc(c.name)}</div><div class="item-meta">${esc(c.phone||'未填写电话')} · ${st.orders} 单 · ${fmtInt(st.qty)} 件</div></div><div class="item-right"><strong>${fmtMoney(st.amount)}</strong></div></div>`;}).join(''):emptyState('♙','暂无客户');$$('.customer-row').forEach(el=>el.onclick=async()=>openCustomerForm(await dbGet('customers',el.dataset.id)));};draw();$('#customerSearch').oninput=draw;
}
function openCustomerForm(c=null){
  openModal(c?'编辑客户':'新增客户',`<form id="customerForm"><div class="form-group"><label class="form-label">客户姓名 *</label><input class="input" name="name" required value="${esc(c?.name||'')}"></div><div class="form-group"><label class="form-label">电话</label><input class="input" name="phone" inputmode="tel" value="${esc(c?.phone||'')}"></div><div class="form-group"><label class="form-label">备注</label><textarea class="textarea" name="note">${esc(c?.note||'')}</textarea></div><button class="btn block" type="submit">保存客户</button>${c?`<button id="deleteCustomer" class="btn danger block" type="button" style="margin-top:8px">删除客户</button>`:''}</form>`,{onOpen:()=>{$('#customerForm').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);await dbPut('customers',{id:c?.id||uid('cust'),name:String(fd.get('name')).trim(),phone:String(fd.get('phone')).trim(),note:String(fd.get('note')).trim(),createdAt:c?.createdAt||nowISO(),updatedAt:nowISO()});closeModal();showToast('客户已保存');renderCustomers();};if($('#deleteCustomer'))$('#deleteCustomer').onclick=async()=>{if(await confirmDialog('确定删除客户资料？历史销售单仍会保留客户名称。')){await dbDelete('customers',c.id);closeModal();renderCustomers();}};}});
}
async function openCustomerSelector(callback){
  const customers=await dbAll('customers');openModal('选择客户',`<div class="toolbar"><div class="search"><input id="custSelectSearch" placeholder="搜索客户"></div></div><div id="custSelectList" class="list"></div><button id="newCustInSelector" class="btn secondary block" style="margin-top:10px">＋ 新增客户</button>`,{onOpen:()=>{const draw=()=>{const q=$('#custSelectSearch').value.trim().toLowerCase(),rows=customers.filter(c=>!q||[c.name,c.phone].some(v=>String(v||'').toLowerCase().includes(q)));$('#custSelectList').innerHTML=rows.map(c=>`<div class="list-item clickable cust-select" data-id="${c.id}"><div class="item-main"><div class="item-title">${esc(c.name)}</div><div class="item-meta">${esc(c.phone||'')}</div></div></div>`).join('')||emptyState('♙','没有客户');$$('.cust-select').forEach(el=>el.onclick=()=>{const c=customers.find(x=>x.id===el.dataset.id);closeModal();callback(c);});};draw();$('#custSelectSearch').oninput=draw;$('#newCustInSelector').onclick=()=>{closeModal();openCustomerForm();};}});
}

async function renderStocktake(){
  setHeader('库存盘点','批量录入实际库存');
  const products=(await dbAll('products')).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  $('#main').innerHTML=`<div class="notice warn">只需修改实际数量不同的商品。保存后系统会自动生成盘盈或盘亏库存流水。</div><div class="toolbar"><div class="search"><input id="stocktakeSearch" placeholder="搜索商品"></div></div><form id="stocktakeForm"><div id="stocktakeList" class="list"></div><div class="form-group" style="margin-top:12px"><label class="form-label">盘点备注</label><textarea id="stocktakeNote" class="textarea"></textarea></div><button class="btn block" type="submit">保存本次盘点</button></form>`;
  const draw=()=>{const q=$('#stocktakeSearch').value.trim().toLowerCase(),rows=products.filter(p=>!q||[p.name,p.code,p.color].some(v=>String(v||'').toLowerCase().includes(q)));$('#stocktakeList').innerHTML=rows.map(p=>`<div class="list-item stocktake-row" data-id="${p.id}">${imageThumb(p)}<div class="item-main"><div class="item-title">${esc(p.name)}</div><div class="item-meta">账面库存 ${fmtInt(p.stock)}</div></div><div style="width:90px"><input class="input counted" type="number" min="0" step="0.01" value="${n(p.stock)}"></div></div>`).join('')||emptyState('✓','没有商品');};draw();$('#stocktakeSearch').oninput=draw;
  $('#stocktakeForm').onsubmit=async e=>{e.preventDefault();const ref=uid('stocktake'),items=[];for(const el of $$('.stocktake-row')){const p=products.find(x=>x.id===el.dataset.id),counted=n($('.counted',el).value),delta=counted-n(p.stock);if(delta){await adjustStock(p.id,delta,'stocktake','stocktake',ref,$('#stocktakeNote').value);items.push({productId:p.id,productName:p.name,bookQty:n(p.stock),countedQty:counted,difference:delta});}}if(!items.length){showToast('没有库存差异');return;}await dbPut('stocktakes',{id:ref,date:nowISO(),items,note:$('#stocktakeNote').value,createdAt:nowISO()});showToast(`盘点完成，调整 ${items.length} 个商品`);navigate('dashboard');};
}

async function renderLedger(){
  setHeader('库存流水','所有库存增减记录');
  const moves=(await dbAll('stockMoves')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  $('#main').innerHTML=`<div class="toolbar"><div class="search"><input id="ledgerSearch" placeholder="商品、编码、备注"></div><select id="ledgerType" class="filter-select"><option value="">全部类型</option>${[...new Set(moves.map(m=>m.type))].map(t=>`<option value="${t}">${moveTypeName(t)}</option>`).join('')}</select></div><div id="ledgerList" class="timeline"></div>`;
  const draw=()=>{const q=$('#ledgerSearch').value.trim().toLowerCase(),type=$('#ledgerType').value,rows=moves.filter(m=>(!type||m.type===type)&&(!q||[m.productName,m.productCode,m.note].some(v=>String(v||'').toLowerCase().includes(q))));$('#ledgerList').innerHTML=rows.length?rows.map(m=>`<div class="timeline-item"><div class="time">${fmtDateTime(m.createdAt)}</div><div class="text"><strong>${esc(m.productName)}</strong> · ${esc(moveTypeName(m.type))}　<span class="${m.qtyChange>=0?'success-text':'danger-text'}">${m.qtyChange>=0?'+':''}${fmtInt(m.qtyChange)}</span></div><div class="item-meta">库存 ${fmtInt(m.beforeStock)} → ${fmtInt(m.afterStock)}　${esc(m.note||'')}</div></div>`).join(''):emptyState('≡','暂无库存流水');};draw();$('#ledgerSearch').oninput=draw;$('#ledgerType').onchange=draw;
}

function auditActionName(action){
  const map={'product.create':'新增商品','product.copy':'复制商品','product.update':'修改商品','product.delete':'删除商品','loan.create':'新增调借','loan.document':'保存凭证','loan.return':'调借归还','loan.sale':'借调售出','sale.create':'新建销售','sale.loan_create':'借调售出开单','sale.cancel':'撤销销售','sale.restore':'恢复销售','backup.restore':'恢复备份','data.clear':'清空数据','qinsilk.import':'秦丝数据导入'};
  if(action.startsWith('stock.'))return `库存：${moveTypeName(action.slice(6))}`;
  return map[action]||action;
}
async function renderAuditLogs(){
  setHeader('操作日志','最近1000条重要操作');
  const logs=(await dbAll('auditLogs')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  $('#main').innerHTML=`<div class="notice">日志会随业务数据同步到云端；图片和签名不会写入日志，避免备份体积膨胀。</div><div class="toolbar"><div class="search"><input id="auditSearch" placeholder="操作、商品、单号、摘要"></div><button id="exportAudit" class="btn secondary small">导出CSV</button></div><div id="auditList" class="timeline"></div>`;
  const draw=()=>{const q=$('#auditSearch').value.trim().toLowerCase(),rows=logs.filter(x=>!q||[x.action,x.entityType,x.entityId,x.summary].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,400);$('#auditList').innerHTML=rows.length?rows.map(x=>`<div class="timeline-item"><div class="time">${fmtDateTime(x.createdAt)}</div><div class="text"><strong>${esc(auditActionName(x.action))}</strong> · ${esc(x.summary||'')}</div><div class="item-meta">${esc(x.entityType||'')} ${esc(x.entityId||'')} · 设备 ${esc(String(x.deviceId||'').slice(0,8)||'本机')}</div></div>`).join(''):emptyState('◷','暂无操作日志');};draw();$('#auditSearch').oninput=draw;
  $('#exportAudit').onclick=()=>{const head=['时间','操作','对象类型','对象ID','摘要','设备'];const rows=logs.map(x=>[x.createdAt,auditActionName(x.action),x.entityType,x.entityId,x.summary,x.deviceId]);downloadBlob('\ufeff'+[head,...rows].map(r=>r.map(csvCell).join(',')).join('\n'),`操作日志_${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8');};
}
async function calculateInventoryHealth(){
  const [products,moves]=await Promise.all([dbAll('products'),dbAll('stockMoves')]);
  const groups=new Map();for(const move of moves){if(!groups.has(move.productId))groups.set(move.productId,[]);groups.get(move.productId).push(move);}
  const rows=products.map(product=>{const list=(groups.get(product.id)||[]).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));let expected=0,chainBroken=false;for(const move of list){if(Math.abs(n(move.beforeStock)-expected)>1e-8&&move.type!=='ledger_reconcile')chainBroken=true;expected+=n(move.qtyChange);if(Math.abs(n(move.afterStock)-expected)>1e-8)chainBroken=true;}return {product,moves:list.length,expected,current:n(product.stock),difference:n(product.stock)-expected,chainBroken};});
  const orphanMoves=moves.filter(m=>!products.some(p=>p.id===m.productId));
  return {rows,issues:rows.filter(r=>Math.abs(r.difference)>1e-8||r.chainBroken),orphanMoves};
}
async function reconcileLedger(productId){
  const health=await calculateInventoryHealth(),row=health.rows.find(x=>x.product.id===productId);if(!row||Math.abs(row.difference)<1e-8)return;
  const p=row.product,move={id:uid('move'),productId:p.id,productCode:p.code,productName:p.name,type:'ledger_reconcile',qtyChange:row.difference,beforeStock:row.expected,afterStock:row.current,refType:'health',refId:uid('health'),note:'库存体检：以当前商品库存补齐缺失流水',createdAt:nowISO()};await dbPut('stockMoves',move);await writeAudit('stock.ledger_reconcile','product',p.id,`${p.name} 补齐库存流水 ${fmtInt(row.expected)} → ${fmtInt(row.current)}`,{ledgerStock:row.expected},{ledgerStock:row.current});
}
async function renderInventoryHealth(){
  setHeader('库存体检','核对商品库存和库存流水');
  const result=await calculateInventoryHealth();
  $('#main').innerHTML=`<div class="grid-3"><div class="metric compact"><div class="label">商品</div><div class="value">${result.rows.length}</div></div><div class="metric compact"><div class="label">异常商品</div><div class="value ${result.issues.length?'danger-text':'success-text'}">${result.issues.length}</div></div><div class="metric compact"><div class="label">孤立流水</div><div class="value ${result.orphanMoves.length?'danger-text':''}">${result.orphanMoves.length}</div></div></div><div class="notice ${result.issues.length?'warn':'success'}" style="margin-top:12px">${result.issues.length?'发现差异时先核对实物库存。若商品页库存正确，可用“补齐流水”；若实物数量不同，应去库存盘点。':'全部商品的当前库存与库存流水一致。'}</div><div class="section-title">检查结果</div><div class="list">${result.issues.length?result.issues.map(r=>`<div class="list-item"><div class="item-main"><div class="item-title">${esc(r.product.name)}</div><div class="item-meta">商品库存 ${fmtInt(r.current)} · 流水推算 ${fmtInt(r.expected)} · 差异 ${r.difference>=0?'+':''}${fmtInt(r.difference)}${r.chainBroken?' · 流水前后值存在断点':''}</div></div><button class="btn secondary small reconcile-ledger" data-id="${r.product.id}">补齐流水</button></div>`).join(''):emptyState('✓','库存流水一致')}</div>${result.orphanMoves.length?`<div class="section-title danger-text">孤立流水</div><div class="notice danger">有 ${result.orphanMoves.length} 条流水找不到对应商品。请先导出完整备份，再联系维护人员处理，不建议直接删除。</div>`:''}`;
  $$('.reconcile-ledger').forEach(btn=>btn.onclick=async()=>{if(!await confirmDialog('确认当前商品库存数字是正确的，并仅补一条校正流水？'))return;await reconcileLedger(btn.dataset.id);showToast('校正流水已补齐');renderInventoryHealth();});
}

async function renderSettings(){
  const cloudEnabled=['cloud','error'].includes(window.CloudSync?.mode);
  setHeader('数据与设置',cloudEnabled?'云端同步、备份与合同抬头':'本机备份与合同抬头');
  const counts={};for(const store of STORES)counts[store]=(await dbAll(store)).length;const profile=await getLegalProfile();const lastExport=localStorage.getItem('mocui_last_local_backup')||'';
  $('#main').innerHTML=`${cloudEnabled?'':`<div class="notice warn"><strong>当前未连接云端</strong><br>请检查网络后刷新页面。不要清理浏览器网站数据，并先导出 JSON 备份。</div>`}
  ${cloudEnabled?`<div class="card"><div class="card-title">Cloudflare 云端</div><div class="grid-3"><div class="metric compact"><div class="label">同步版本</div><div class="value">${fmtInt(CloudSync.revision||0)}</div></div><div class="metric compact"><div class="label">设备</div><div class="value" style="font-size:12px">${esc(String(CloudSync.deviceId||'').slice(0,8))}</div></div><div class="metric compact"><div class="label">状态</div><div class="value" style="font-size:13px">${CloudSync.mode==='cloud'?'正常':'待处理'}</div></div></div><div class="btn-row" style="margin-top:10px"><button id="syncNow" class="btn secondary">立即同步</button><button id="cloudBackups" class="btn secondary">云端备份</button><button id="manageDevices" class="btn secondary">登录设备</button><button id="changeCloudPassword" class="btn secondary">修改密码</button></div><button id="forceCloudUpload" class="btn warn block" style="margin-top:8px">本机数据强制覆盖云端</button><button id="logoutCloud" class="btn ghost block" style="margin-top:8px">退出登录</button></div>`:''}
  <div class="card"><div class="card-title">合同抬头</div><div class="notice">用于自动生成借调协议和调拨交接单；内容会跟随业务数据同步到云端。请填写真实签约主体。</div><form id="legalProfileForm"><div class="form-group"><label class="form-label">甲方真实姓名/公司名称</label><input id="setPartyAName" class="input" value="${esc(profile.partyAName)}"></div><div class="form-group"><label class="form-label">身份证号/统一社会信用代码</label><input id="setPartyAIdNo" class="input" value="${esc(profile.partyAIdNo)}"></div><div class="form-row"><div class="form-group"><label class="form-label">联系电话</label><input id="setPartyAPhone" class="input" value="${esc(profile.partyAPhone)}"></div><div class="form-group"><label class="form-label">交接地点</label><input id="setDeliveryPlace" class="input" value="${esc(profile.defaultDeliveryPlace)}"></div></div><div class="form-group"><label class="form-label">住所/经营地址</label><input id="setPartyAAddress" class="input" value="${esc(profile.partyAAddress)}"></div><div class="form-group"><label class="form-label">默认争议管辖</label><input id="setDisputeCourt" class="input" value="${esc(profile.defaultDisputeCourt)}"></div><button class="btn secondary block" type="submit">保存合同抬头</button></form></div>
  <div class="card"><div class="card-title">备份与数据安全</div><div class="notice warn">每次云端同步都会生成历史版本；仍建议每周把完整 JSON 保存到 iCloud。最近本地导出：${lastExport?fmtDateTime(lastExport):'尚未导出'}</div><div class="grid-2"><button id="inventoryHealth" class="btn secondary">库存体检</button><button id="openAuditLogs" class="btn secondary">操作日志</button></div><button id="backupAll" class="btn block" style="margin-top:8px">导出完整 JSON 备份</button><label class="btn secondary block" style="display:block;text-align:center;margin-top:8px" for="restoreFile">从 JSON 备份恢复</label><input id="restoreFile" class="hidden" type="file" accept=".json,application/json"></div>
  <div class="card"><div class="card-title">当前数据量</div><div class="grid-3"><div class="metric compact"><div class="label">商品</div><div class="value">${counts.products}</div></div><div class="metric compact"><div class="label">销售单</div><div class="value">${counts.sales}</div></div><div class="metric compact"><div class="label">调借单</div><div class="value">${counts.loans}</div></div></div></div>
  <div class="card"><div class="card-title danger-text">危险操作</div><button id="clearAll" class="btn danger block">清空全部业务数据</button></div>
  <div class="notice">版本：漠翠经营助手 3.0 内容工作台第一期<br>手机和电脑共用 Cloudflare D1 + R2；本机 IndexedDB 用于加速和离线缓存。</div>`;
  $('#legalProfileForm').onsubmit=async e=>{e.preventDefault();await dbPut('settings',{id:'legalProfile',partyAName:$('#setPartyAName').value.trim(),partyAIdNo:$('#setPartyAIdNo').value.trim(),partyAPhone:$('#setPartyAPhone').value.trim(),partyAAddress:$('#setPartyAAddress').value.trim(),defaultDeliveryPlace:$('#setDeliveryPlace').value.trim(),defaultDisputeCourt:$('#setDisputeCourt').value.trim(),updatedAt:nowISO()});showToast('合同抬头已保存并等待同步');};
  $('#backupAll').onclick=backupAll;$('#restoreFile').onchange=restoreAll;$('#clearAll').onclick=clearAllData;
  if($('#syncNow'))$('#syncNow').onclick=async()=>{try{await CloudSync.push();showToast('云端同步完成');renderSettings();}catch(err){showToast(err.message);}};
  if($('#cloudBackups'))$('#cloudBackups').onclick=openCloudBackupManager;
  if($('#manageDevices'))$('#manageDevices').onclick=openDeviceManager;
  if($('#changeCloudPassword'))$('#changeCloudPassword').onclick=openCloudPasswordForm;
  if($('#forceCloudUpload'))$('#forceCloudUpload').onclick=async()=>{if(!await confirmDialog('只有确认云端数据不需要保留时才能继续。确定用本机数据覆盖云端？'))return;if(!await confirmDialog('再次确认：覆盖后，其他设备的云端新数据会被本机版本替代。'))return;try{await CloudSync.forcePush();showToast('本机数据已覆盖云端');renderSettings();}catch(err){showToast(err.message);}};
  if($('#logoutCloud'))$('#logoutCloud').onclick=()=>CloudSync.logout();
  if($('#inventoryHealth'))$('#inventoryHealth').onclick=()=>navigate('health');if($('#openAuditLogs'))$('#openAuditLogs').onclick=()=>navigate('audit');
}

function deviceNameFromAgent(agent=''){
  if(/iPhone/i.test(agent))return 'iPhone';if(/iPad/i.test(agent))return 'iPad';if(/Macintosh/i.test(agent))return 'Mac';if(/Android/i.test(agent))return '安卓设备';if(/Windows/i.test(agent))return 'Windows';return '其他设备';
}
function openDeviceManager(){
  openModal('登录设备',`<div class="notice">可以查看当前仍有效的登录会话，并让其他设备立即退出。</div><div id="deviceList">${emptyState('↻','正在读取设备…')}</div><button id="logoutOtherDevices" class="btn warn block" style="margin-top:10px">退出其他全部设备</button>`,{onOpen:async()=>{
    const load=async()=>{try{const result=await CloudSync.listSessions(),rows=result.sessions||[];$('#deviceList').innerHTML=rows.length?rows.map(s=>`<div class="list-item"><div class="item-main"><div class="item-title">${esc(deviceNameFromAgent(s.user_agent))}${s.isCurrent?' · 当前设备':''}</div><div class="item-meta">最近活动 ${fmtDateTime(s.last_seen_at)} · 登录 ${fmtDateTime(s.created_at)} · ${esc(s.ip_address||'')}</div></div>${s.isCurrent?'':`<button class="btn danger small revoke-session" data-id="${s.id}">退出</button>`}</div>`).join(''):emptyState('⌁','没有登录设备');$$('.revoke-session').forEach(btn=>btn.onclick=async()=>{if(!await confirmDialog('让这台设备立即退出登录？'))return;await CloudSync.revokeSession(btn.dataset.id);showToast('设备已退出');await load();});}catch(err){$('#deviceList').innerHTML=`<div class="notice danger">读取失败：${esc(err.message)}</div>`;}};
    $('#logoutOtherDevices').onclick=async()=>{if(!await confirmDialog('确定让除当前手机外的全部设备退出？'))return;await CloudSync.logoutOtherSessions();showToast('其他设备已全部退出');await load();};await load();
  }});
}

function openCloudPasswordForm(){
  openModal('修改管理密码',`<form id="cloudPasswordForm"><div class="notice warn">修改后，其他已登录设备会退出，需要用新密码重新登录。</div><div class="form-group"><label class="form-label">原密码</label><input id="oldCloudPassword" class="input" type="password" autocomplete="current-password" required></div><div class="form-group"><label class="form-label">新密码（至少10位）</label><input id="newCloudPassword" class="input" type="password" autocomplete="new-password" minlength="10" required></div><div class="form-group"><label class="form-label">再次输入新密码</label><input id="confirmCloudPassword" class="input" type="password" autocomplete="new-password" minlength="10" required></div><button class="btn block" type="submit">确认修改</button></form>`,{onOpen:()=>{$('#cloudPasswordForm').onsubmit=async e=>{e.preventDefault();const next=$('#newCloudPassword').value;if(next!==$('#confirmCloudPassword').value){showToast('两次输入的新密码不一致');return;}try{await CloudSync.changePassword($('#oldCloudPassword').value,next);closeModal();showToast('密码修改成功');}catch(err){showToast(err.message);}};}});
}

function openCloudBackupManager(){
  openModal('云端历史备份',`<div class="notice">系统自动保留最近50次云端同步版本。恢复历史版本会另存为一个新版本，不会直接删除旧备份。</div><div id="cloudBackupList"><div class="empty"><div class="emoji">↻</div><div>正在读取云端备份…</div></div></div>`,{onOpen:async()=>{try{const result=await CloudSync.listBackups(),rows=result.backups||[];$('#cloudBackupList').innerHTML=rows.length?rows.map(row=>`<div class="list-item"><div class="item-main"><div class="item-title">云端版本 ${fmtInt(row.revision)}</div><div class="item-meta">${fmtDateTime(row.created_at)} · ${(n(row.size_bytes)/1024/1024).toFixed(2)} MB</div></div><button class="btn secondary small restore-cloud-backup" data-revision="${row.revision}">恢复</button></div>`).join(''):emptyState('▥','暂无云端备份');$$('.restore-cloud-backup').forEach(btn=>btn.onclick=async()=>{const rev=n(btn.dataset.revision);if(!await confirmDialog(`确定恢复云端版本 ${rev}？当前版本仍会保留为历史备份。`))return;try{await CloudSync.restoreBackup(rev);closeModal();showToast('历史版本已恢复');location.reload();}catch(err){showToast(err.message);}});}catch(err){$('#cloudBackupList').innerHTML=`<div class="notice danger">读取失败：${esc(err.message)}</div>`;}}});
}

async function backupAll(){
  const exportedAt=nowISO(),data={app:'漠翠经营助手',version:'3.0',exportedAt,stores:{}};for(const s of STORES)data.stores[s]=await dbAll(s);downloadBlob(JSON.stringify(data,null,2),`漠翠进销存完整备份_${new Date().toISOString().slice(0,10)}.json`,'application/json');localStorage.setItem('mocui_last_local_backup',exportedAt);showToast('备份文件已导出');
}
async function restoreAll(e){
  const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await readFileAsText(f));if(!data.stores)throw new Error('不是有效备份文件');if(!await confirmDialog('恢复会清空并覆盖当前所有数据，确定继续？'))return;for(const s of STORES){await dbClear(s);for(const row of (data.stores[s]||[]))await dbPut(s,row);}await ensureDefaults();await writeAudit('backup.restore','system','backup','已从 JSON 备份恢复',null,{exportedAt:data.exportedAt||'',counts:Object.fromEntries(STORES.map(s=>[s,(data.stores[s]||[]).length]))});showToast('数据恢复完成');navigate('dashboard');}catch(err){showToast(`恢复失败：${err.message}`);}finally{e.target.value='';}
}
async function clearAllData(){
  if(!await confirmDialog('此操作不可撤销。确定清空商品、销售、调借、客户和库存流水？'))return;if(!await confirmDialog('再次确认：真的要清空全部业务数据？'))return;for(const s of STORES)await dbClear(s);await ensureDefaults();await writeAudit('data.clear','system','all','全部业务数据已清空',null,{clearedAt:nowISO()});showToast('全部数据已清空');navigate('dashboard');
}

function setBootStatus(text){const el=$('#bootStatus');if(el)el.textContent=text;}
function finishBoot(){const el=$('#bootScreen');if(!el)return;el.classList.add('is-ready');setTimeout(()=>el.remove(),240);}
function failBoot(error){
  console.error(error);
  const el=$('#bootScreen');if(!el)return;
  el.classList.add('has-error');
  setBootStatus(`连接失败：${error.message||'请检查网络后重试'}`);
  const retry=$('#bootRetry');if(retry)retry.onclick=()=>location.reload();
}
function showInitialSyncPill(){
  let pill=$('#initialSyncPill');if(pill)return pill;
  pill=document.createElement('div');pill.id='initialSyncPill';pill.className='initial-sync-pill';pill.textContent='正在后台同步云端数据';document.body.appendChild(pill);return pill;
}
function hideInitialSyncPill(text='云端数据已更新'){
  const pill=$('#initialSyncPill');if(!pill)return;
  pill.textContent=text;setTimeout(()=>{pill.classList.add('is-done');setTimeout(()=>pill.remove(),220);},350);
}
async function refreshCurrentPageAfterPull(){
  const modalOpen=Boolean($('#modalRoot .modal-backdrop'));
  const editing=modalOpen||window.__mocuiProductDirty||appState.route==='sale-new';
  if(editing)return;
  const routeAtStart=appState.route,paramsAtStart={...appState.params},top=window.scrollY;
  await render();enhanceCurrentPage();
  if(appState.route===routeAtStart&&JSON.stringify(appState.params)===JSON.stringify(paramsAtStart))window.scrollTo({top,behavior:'instant'});
}
function bindPrimaryNavigation(){
  $$('.nav-item').forEach(b=>b.onclick=()=>{
    if(document.activeElement&&document.activeElement.matches?.('input, textarea, select, [contenteditable="true"]'))document.activeElement.blur();
    document.body.classList.remove('keyboard-open');
    if(appState.route==='sale-new')syncSaleFormToDraft();
    const target=b.dataset.route;
    if(navRouteFor(appState.route)===target&&appState.route===target){
      window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      return;
    }
    navigate(target,{}, {reset:true});
  });
}
async function init(){
  setBootStatus('正在读取本机数据…');
  db=await openDB();
  await ensureDefaults();
  setupViewportBehavior();
  history.scrollRestoration='manual';
  bindPrimaryNavigation();
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}

  // 先在启动层后面渲染本机缓存，身份验证成功后可以立即显示。
  await render();
  enhanceCurrentPage();
  await nextFrame();

  setBootStatus('正在安全验证登录…');
  await CloudSync.bootstrap({deferPull:true});
  finishBoot();

  // 云端完整数据改为后台同步，不再阻塞首页显示。
  document.documentElement.dataset.initialSync='pending';
  showInitialSyncPill();
  const initialPull=CloudSync.pull();
  window.__mocuiInitialPullPromise=initialPull;
  initialPull.then(async()=>{
    await ensureDefaults();
    await refreshCurrentPageAfterPull();
    hideInitialSyncPill();
  }).catch(()=>{
    hideInitialSyncPill('暂时离线，已显示本机数据');
    showToast('云端同步失败，当前显示本机缓存');
  }).finally(()=>{
    delete document.documentElement.dataset.initialSync;
    window.__mocuiInitialPullPromise=null;
  });
}
window.addEventListener('DOMContentLoaded',()=>init().catch(failBoot));
