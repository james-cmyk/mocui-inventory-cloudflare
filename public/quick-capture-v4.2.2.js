'use strict';

(function(){
  const VERSION='4.2.2';
  const PRODUCT_DRAFT_KEY='mocui_product_draft_v1';
  const SEARCH_HISTORY_KEY='mocui_global_goods_search_history_v1';

  const originalRenderDashboard422=renderDashboard;
  const originalRenderProducts422=renderProducts;
  const originalRenderMore422=renderMore;

  function normalizeText(v){return String(v||'').replace(/，/g,',').replace(/：/g,':').replace(/。/g,' ').replace(/\s+/g,' ').trim();}
  function pickFirst(text,patterns){for(const p of patterns){const m=text.match(p);if(m)return (m[1]||m[0]||'').trim();}return '';}
  function numberFrom(text,labels){
    for(const label of labels){
      let m=text.match(new RegExp(`${label}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)`,'i'));if(m)return n(m[1]);
      m=text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:元)?\\s*${label}`,'i'));if(m)return n(m[1]);
    }
    return 0;
  }
  function uniqueParts(parts){const out=[];for(const x of parts){const v=String(x||'').trim();if(v&&!out.includes(v))out.push(v);}return out;}
  function guessCategory(text){
    const cats=['金镶玉','银镶玉','碧玉','糖白','糖玉','青花','烟紫','紫罗兰','藕粉','白玉','黄玉','南红','晴水','且末蓝','鸭蛋青','豆青','裸石面','器皿','挂件'];
    return cats.find(x=>text.includes(x))||'';
  }
  function guessForm(text){return pickFirst(text,[/(手镯|手串|单圈手串|多圈手串|吊坠|挂件|戒指|指环|项链|耳坠|摆件|原石|珠串|珠子|牌子|平安扣|貔貅|佛公|无事牌)/]);}
  function guessMaterial(text){return pickFirst(text,[/(俄料|俄罗斯料|青海料|新疆料|且末料|籽料|山料|韩料|河磨料|罗甸料|巴沙料|野牛沟)/]);}
  function guessSpec(text){
    const parts=[];
    const circle=text.match(/(\d{2}(?:\.\d+)?)\s*圈(?:口)?/);if(circle)parts.push(`${circle[1]}圈`);
    const bead=text.match(/卡\s*(\d+(?:\.\d+)?)/i);if(bead)parts.push(`卡${bead[1]}`);
    const weight=text.match(/(\d+(?:\.\d+)?)\s*(?:g|克)\b/i);if(weight)parts.push(`${weight[1]}g`);
    const size=text.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)(?:\s*[×xX*]\s*(\d+(?:\.\d+)?))?/);if(size)parts.push([size[1],size[2],size[3]].filter(Boolean).join('×'));
    return parts.join(' · ');
  }
  function guessSource(text){
    return pickFirst(text,[/(?:来源|货主|同行|从)\s*[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9_-]{1,12})(?:\s|,|，|$)/,/(?:由|是)\s*([\u4e00-\u9fa5A-Za-z0-9_-]{1,10})\s*(?:拿来|给我|的货)/,/(?:^|\s)([\u4e00-\u9fa5]{2,4})\s*(?:拿来|拿来的|给的|给我)/]);
  }
  function guessColor(text){
    return pickFirst(text,[/(菠菜绿|苹果绿|粉青|鸭蛋青|阳绿|深绿|浅绿|湖水绿|晴水绿|冷白|奶白|脂白|青白|瓷白|糖白|红糖|黄口|烟紫|藕粉|蓝调|墨黑|青黑|白色|绿色|黄色|紫色)/]);
  }
  function parseQuickText(raw){
    const text=normalizeText(raw),category=guessCategory(text),form=guessForm(text),material=guessMaterial(text),spec=guessSpec(text),source=guessSource(text),color=guessColor(text);
    const cost=numberFrom(text,['成本','结算','拿货价','底价','货主价']);
    const sale=numberFrom(text,['售价','零售价','卖','报价','销售价']);
    const qtyMatch=text.match(/(?:库存|数量|共)\s*[:：]?\s*(\d+(?:\.\d+)?)/);const stock=qtyMatch?Math.max(0,n(qtyMatch[1])):1;
    let name=uniqueParts([material,category,form]).join('');
    if(!name){
      name=text
        .replace(/(?:来源|货主|同行|成本|结算|拿货价|底价|货主价|售价|零售价|报价|销售价)\s*[:：]?\s*[\u4e00-\u9fa5A-Za-z0-9_.-]+/g,' ')
        .replace(/\d+(?:\.\d+)?\s*(?:元|圈口?|克|g)\b/ig,' ')
        .replace(/[,，;；]/g,' ')
        .replace(/\s+/g,' ').trim().slice(0,28)||'未命名货品';
    }
    const noteBits=[];if(source)noteBits.push(`来源：${source}`);if(spec)noteBits.push(`规格：${spec}`);if(text)noteBits.push(`快捷建档原话：${text}`);
    return {raw:text,name,category,color,costPrice:cost,salePrice:sale,stock,spec,source,note:noteBits.join('\n')};
  }

  function quickPreviewHTML(parsed){
    const row=(k,v,placeholder='待补')=>`<div><span>${k}</span><strong class="${v?'':'muted'}">${esc(v||placeholder)}</strong></div>`;
    return `<div class="quick422-preview-grid">
      ${row('名称',parsed.name)}${row('分类',parsed.category)}${row('规格',parsed.spec)}${row('来源',parsed.source)}
      ${row('成本',parsed.costPrice?fmtMoney(parsed.costPrice):'')}${row('售价',parsed.salePrice?fmtMoney(parsed.salePrice):'')}${row('库存',fmtInt(parsed.stock||1))}${row('颜色',parsed.color)}
    </div>`;
  }

  async function openQuickCreate422(){
    const old=loadLocalDraft(PRODUCT_DRAFT_KEY);
    if(old&&String(old.name||old.note||'').trim()){
      const ok=window.confirm('检测到一个尚未保存的商品草稿。继续会用新的极速建档内容覆盖它。确定继续吗？');
      if(!ok){await openProductForm();return;}
    }
    const state={text:'',image:'',parsed:parseQuickText('')};
    openModal('极速建档',`<div class="quick422-create">
      <div class="quick422-hero"><strong>拍一张 + 说一句</strong><span>先生成草稿，再进入原商品表单确认；库存和流水仍由原核心逻辑保存。</span></div>
      <div class="quick422-photo-actions"><label for="quick422Camera"><b>拍照</b><small>直接调用相机</small></label><input id="quick422Camera" class="hidden" type="file" accept="image/*" capture="environment"><label for="quick422Gallery"><b>相册</b><small>选择已有照片</small></label><input id="quick422Gallery" class="hidden" type="file" accept="image/*"></div>
      <div id="quick422ImagePreview" class="quick422-image-preview"><span>还没有图片</span></div>
      <div class="form-group"><label class="form-label">一句话描述</label><div class="quick422-input-wrap"><textarea id="quick422Text" class="textarea" placeholder="例如：老张拿来的俄料碧玉手镯，57圈，8000成本，12800卖，有两个小黑点"></textarea><button id="quick422Voice" type="button" aria-label="语音输入">🎙</button></div><div class="field-help">可直接使用 iPhone 键盘上的麦克风。系统只提取明确写出的信息，不会替你判断玉质或自动定价。</div></div>
      <div class="quick422-section-title">系统整理</div><div id="quick422Preview">${quickPreviewHTML(state.parsed)}</div>
      <div class="notice">没有识别出的字段可以留空，进入商品表单后再补。商品编码仍由原系统自动生成。</div>
      <button id="quick422ToForm" class="btn block" type="button">带入商品表单确认</button>
    </div>`,{full:true,onOpen:()=>{
      const textEl=$('#quick422Text');
      const refresh=()=>{state.text=textEl.value;state.parsed=parseQuickText(state.text);$('#quick422Preview').innerHTML=quickPreviewHTML(state.parsed);};
      textEl.oninput=refresh;
      const setImage=async file=>{if(!file)return;state.image=await compressImage(file,1280,.78);$('#quick422ImagePreview').innerHTML=`<img src="${state.image}" alt="待建档货品">`;};
      $('#quick422Camera').onchange=async e=>{await setImage(e.target.files?.[0]);e.target.value='';};
      $('#quick422Gallery').onchange=async e=>{await setImage(e.target.files?.[0]);e.target.value='';};
      $('#quick422Voice').onclick=()=>{
        const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
        if(!SR){showToast('当前浏览器不支持网页语音识别，请使用 iPhone 键盘麦克风输入');textEl.focus();return;}
        const rec=new SR();rec.lang='zh-CN';rec.interimResults=false;rec.maxAlternatives=1;
        $('#quick422Voice').classList.add('is-listening');
        rec.onresult=e=>{const t=e.results?.[0]?.[0]?.transcript||'';textEl.value=[textEl.value,t].filter(Boolean).join(' ');refresh();};
        rec.onerror=()=>showToast('语音识别没有成功，请使用键盘麦克风');rec.onend=()=>$('#quick422Voice')?.classList.remove('is-listening');
        try{rec.start();}catch(_){showToast('语音识别暂不可用，请使用键盘麦克风');}
      };
      $('#quick422ToForm').onclick=async()=>{
        refresh();const p=state.parsed;
        saveLocalDraft(PRODUCT_DRAFT_KEY,{name:p.name,code:'',category:p.category,categoryId:'',color:p.color,costPrice:p.costPrice,salePrice:p.salePrice,stock:p.stock||1,note:p.note,image:state.image});
        closeModal();await openProductForm();
      };
    }});
  }

  function searchHistory(){try{return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)||'[]').filter(Boolean).slice(0,8);}catch(_){return [];}}
  function saveSearchHistory(q){q=String(q||'').trim();if(!q)return;try{const rows=[q,...searchHistory().filter(x=>x!==q)].slice(0,8);localStorage.setItem(SEARCH_HISTORY_KEY,JSON.stringify(rows));}catch(_){}}
  function searchable(q,...fields){return typeof mocuiFuzzyMatch==='function'?mocuiFuzzyMatch(q,...fields):fields.join(' ').toLowerCase().includes(String(q||'').toLowerCase());}
  function resultDate(r){const d=new Date(r.date||0);return Number.isNaN(d.getTime())?0:d.getTime();}
  function productState(p){if(p.historicalOnly)return '历史';if(n(p.stock)>0)return `在手 ${fmtInt(p.stock)}`;return '已售罄';}
  function typeLabel(type){return ({product:'商品',loan:'调借',external:'外部货',pass:'过手',gallery:'图库'}[type]||type);}

  async function collectGlobalGoods422(){
    const tasks=[dbAll('products'),dbAll('loans')];
    if(typeof getExternalGoods==='function')tasks.push(getExternalGoods());else tasks.push(Promise.resolve([]));
    if(typeof getPassDeals==='function')tasks.push(getPassDeals());else tasks.push(Promise.resolve([]));
    if(typeof getTradeGalleryLedger==='function')tasks.push(getTradeGalleryLedger());else tasks.push(Promise.resolve(null));
    const [products,loans,external,passes,galleryLedger]=await Promise.all(tasks);const rows=[];
    for(const p of products){rows.push({type:'product',id:p.id,title:p.name||'未命名商品',code:p.code||'',subtitle:[p.category,p.color,p.note].filter(Boolean).join(' · '),state:productState(p),date:p.updatedAt||p.createdAt,image:p.image||'',raw:p,search:[p.name,p.code,p.category,p.color,p.note,p.workflowQuotes?.map(q=>`${q.person} ${q.note}`).join(' ')]});}
    for(const l of loans){for(const i of (l.items||[])){rows.push({type:'loan',id:l.id,title:i.productName||'调借货品',code:i.productCode||l.loanNo||'',subtitle:`${l.person||'未填写同行'} · ${l.type==='borrow'?'调入/借入':'借出'} · ${i.color||''}`,state:loanIsOpen(l)?`未处理 ${fmtInt(Math.max(0,loanItemRemaining(l,i)))}件`:'已完成',date:l.updatedAt||l.date||l.createdAt,image:i.image||'',raw:l,search:[i.productName,i.productCode,i.color,i.productNote,l.person,l.loanNo,l.note]});}}
    for(const r of (external||[])){rows.push({type:'external',id:r.id,title:r.itemName||'外部货',code:r.tempNo||'',subtitle:`货主 ${r.ownerName||'-'} · 当前 ${r.currentHolderName||'本店'} · ${r.note||''}`,state:typeof externalStatusName==='function'?externalStatusName(r):r.status,date:r.updatedAt||r.createdAt,image:r.image||'',raw:r,search:[r.itemName,r.tempNo,r.ownerName,r.currentHolderName,r.buyerName,r.note]});}
    for(const d of (passes||[])){rows.push({type:'pass',id:d.id,title:d.itemName||'过手货',code:d.dealNo||'',subtitle:`来源 ${d.sourceName||'-'} · 买家 ${d.buyerName||'-'} · ${d.note||''}`,state:d.status==='cancelled'?'已撤销':'已成交',date:d.updatedAt||d.createdAt,image:d.image||'',raw:d,search:[d.itemName,d.dealNo,d.sourceName,d.buyerName,d.note]});}
    if(galleryLedger&&typeof tradeGalleryFlatRows==='function'){
      try{for(const x of tradeGalleryFlatRows(galleryLedger)){const item=x.item||{},batch=x.batch||{};rows.push({type:'gallery',id:item.id||batch.id,title:item.name||item.itemName||item.productName||'过手图库',code:item.code||item.productCode||batch.batchNo||'',subtitle:[batch.sourceName||batch.person||batch.name,item.note||item.remark||'',batch.note||''].filter(Boolean).join(' · '),state:typeof tradeGalleryItemIsActive==='function'&&tradeGalleryItemIsActive(item)?'图库在用':'历史图库',date:item.updatedAt||item.createdAt||batch.updatedAt||batch.createdAt,image:item.image||item.photo||item.thumbnail||'',raw:x,search:[item.name,item.itemName,item.productName,item.code,item.productCode,item.note,item.remark,batch.sourceName,batch.person,batch.name,batch.note]});}}catch(err){console.warn('[v4.2.2 gallery search]',err);}
    }
    return rows;
  }

  function resultHTML(r){return `<button class="quick422-search-row" type="button" data-type="${esc(r.type)}" data-id="${esc(r.id||'')}">${r.image?`<img src="${esc(r.image)}" alt="">`:`<span class="quick422-result-placeholder">玉</span>`}<div><div class="quick422-result-top"><span>${typeLabel(r.type)}</span><strong>${esc(r.title)}</strong></div><small>${esc(r.code||'无编码')} · ${esc(r.subtitle||'')}</small></div><b>${esc(r.state||'查看')} ›</b></button>`;}
  async function openSearchResult422(r){
    if(r.type==='product'){closeModal();navigate('product-detail',{id:r.id});return;}
    if(r.type==='loan'){closeModal();openLoanDetail(r.id);return;}
    if(r.type==='external'){closeModal();openExternalGoodDetail(r.id);return;}
    if(r.type==='pass'){closeModal();navigate('pass-deals');return;}
    if(r.type==='gallery'){closeModal();navigate('trade-gallery');return;}
  }

  async function openGlobalSearch422(initial=''){
    const rows=await collectGlobalGoods422();let mode='all';
    openModal('全局找货',`<div class="quick422-search"><div class="quick422-searchbox"><span>⌕</span><input id="quick422SearchInput" placeholder="货号 / 名称 / 圈口 / 颜色 / 同行 / 来源 / 备注" value="${esc(initial)}"><button id="quick422ClearSearch" type="button">×</button></div><div id="quick422SearchHistory" class="quick422-history"></div><div class="quick422-search-tabs"><button data-mode="all" class="active">全部</button><button data-mode="product">商品</button><button data-mode="loan">调借</button><button data-mode="external">外部货</button><button data-mode="pass">过手</button><button data-mode="gallery">图库</button></div><div id="quick422SearchCount" class="quick422-search-count"></div><div id="quick422SearchResults"></div></div>`,{full:true,onOpen:()=>{
      const input=$('#quick422SearchInput'),host=$('#quick422SearchResults'),count=$('#quick422SearchCount'),hist=$('#quick422SearchHistory');
      const drawHistory=()=>{const h=searchHistory();hist.innerHTML=h.length?`<span>最近搜索</span>${h.map(x=>`<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}`:'';$$('[data-q]',hist).forEach(b=>b.onclick=()=>{input.value=b.dataset.q;draw();});};
      const draw=()=>{const q=input.value.trim();let found=rows.filter(r=>(mode==='all'||r.type===mode)&&(!q||searchable(q,...r.search,r.title,r.code,r.subtitle,r.state))).sort((a,b)=>resultDate(b)-resultDate(a));found=found.slice(0,100);count.textContent=`找到 ${found.length}${found.length===100?'＋':''} 条记录${q?'':' · 未输入关键词时显示最近记录'}`;host.innerHTML=found.length?found.map(resultHTML).join(''):`<div class="quick422-search-empty"><strong>没有找到</strong><span>可以换货号、姓名、来源、圈口或备注里的词再搜。</span></div>`;$$('.quick422-search-row',host).forEach(el=>el.onclick=()=>{const r=found.find(x=>x.type===el.dataset.type&&String(x.id||'')===el.dataset.id);if(r){saveSearchHistory(input.value);openSearchResult422(r);}});drawHistory();};
      input.oninput=draw;input.onkeydown=e=>{if(e.key==='Enter'){saveSearchHistory(input.value);drawHistory();}};$('#quick422ClearSearch').onclick=()=>{input.value='';input.focus();draw();};$$('.quick422-search-tabs button').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('.quick422-search-tabs button').forEach(x=>x.classList.toggle('active',x===b));draw();});draw();setTimeout(()=>input.focus(),80);
    }});
  }

  renderDashboard=async function(){
    const result=await originalRenderDashboard422.apply(this,arguments);
    try{if(appState.route==='dashboard'&&!document.querySelector('#quick422DashboardTools')){const panel=document.querySelector('#workflow42DailyPanel')||$('#main')?.firstElementChild;if(panel){const el=document.createElement('div');el.id='quick422DashboardTools';el.className='quick422-dashboard-tools';el.innerHTML=`<button id="quick422DashCreate" type="button"><b>＋</b><span><strong>极速建档</strong><small>拍照 + 一句话</small></span></button><button id="quick422DashFind" type="button"><b>⌕</b><span><strong>全局找货</strong><small>库存 + 历史一起搜</small></span></button>`;panel.appendChild(el);$('#quick422DashCreate').onclick=openQuickCreate422;$('#quick422DashFind').onclick=()=>openGlobalSearch422();}}}catch(err){console.warn('[v4.2.2 dashboard]',err);}return result;
  };

  renderProducts=async function(){
    const result=await originalRenderProducts422.apply(this,arguments);
    try{if(appState.route==='products'&&!document.querySelector('#quick422ProductTools')){const main=$('#main');if(main){const el=document.createElement('section');el.id='quick422ProductTools';el.className='quick422-product-tools';el.innerHTML=`<button id="quick422ProductCreate" type="button"><span>＋</span><div><strong>极速建档</strong><small>先生成草稿，再确认保存</small></div></button><button id="quick422ProductFind" type="button"><span>⌕</span><div><strong>全局找货</strong><small>连已售、调借、同行货一起找</small></div></button>`;main.prepend(el);$('#quick422ProductCreate').onclick=openQuickCreate422;$('#quick422ProductFind').onclick=()=>openGlobalSearch422();}}}catch(err){console.warn('[v4.2.2 products]',err);}return result;
  };

  renderMore=async function(){
    const result=await originalRenderMore422.apply(this,arguments);
    try{if(appState.route==='more'&&!document.querySelector('#quick422MoreTools')){const main=$('#main');if(main){const sec=document.createElement('section');sec.id='quick422MoreTools';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">日常效率</div><div class="list"><div id="quick422MoreCreate" class="list-item clickable"><div class="thumb placeholder">＋</div><div class="item-main"><div class="item-title">极速建档</div><div class="item-meta">拍照 + 一句话生成商品草稿</div></div><div>›</div></div><div id="quick422MoreFind" class="list-item clickable"><div class="thumb placeholder">⌕</div><div class="item-main"><div class="item-title">全局找货</div><div class="item-meta">当前库存、已售、调借、外部货、过手图库统一搜索</div></div><div>›</div></div></div>`;main.prepend(sec);$('#quick422MoreCreate').onclick=openQuickCreate422;$('#quick422MoreFind').onclick=()=>openGlobalSearch422();}}}catch(_){}return result;
  };

  window.MocuiQuickCapture422={version:VERSION,parse:parseQuickText,openCreate:openQuickCreate422,openSearch:openGlobalSearch422,collect:collectGlobalGoods422};
})();
