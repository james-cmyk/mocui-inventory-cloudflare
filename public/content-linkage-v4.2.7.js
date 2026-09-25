'use strict';

(function(){
  const VERSION='4.2.7';
  const baseRenderContentHub427=window.renderContentHub||renderContentHub;
  const baseRenderProductContent427=window.renderProductContent||renderProductContent;
  const baseRenderProductDetail427=renderProductDetail;
  const baseRenderMore427=renderMore;

  function clean(v){return String(v??'').trim();}
  function arrMedia(p){return Array.isArray(p?.media)?p.media:[];}
  function cut(text,max){return Array.from(String(text||'')).slice(0,max).join('');}
  function seedOf(p){return String(p?.code||p?.id||p?.name||'mocui').split('').reduce((a,c)=>a+c.charCodeAt(0),0);}
  function moneyPlain(v){const x=n(v);return x?`¥${x.toLocaleString('zh-CN',{maximumFractionDigits:2})}`:'';}
  function noteLine(note,label){const m=String(note||'').match(new RegExp(`(?:^|\\n)${label}[：:]\\s*([^\\n]+)`));return m?clean(m[1]):'';}
  function deriveSpec(p){
    const direct=clean(p?.qinsilk?.size||p?.size||noteLine(p?.note,'规格'));
    if(direct)return direct;
    const text=[p?.name,p?.note].filter(Boolean).join(' ');
    const circle=text.match(/(\d{2}(?:\.\d+)?)\s*圈(?:口)?/);if(circle)return `${circle[1]}圈`;
    const bead=text.match(/卡\s*(\d+(?:\.\d+)?)/i);if(bead)return `卡${bead[1]}`;
    const size=text.match(/(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)(?:\s*[×xX*]\s*(\d+(?:\.\d+)?))?/);if(size)return [size[1],size[2],size[3]].filter(Boolean).join('×');
    return '';
  }
  function deriveSource(p){return noteLine(p?.note,'来源');}
  function deriveMaterial(p){
    const text=[p?.name,p?.category,p?.note].filter(Boolean).join(' ');
    const m=text.match(/(新疆(?:料)?|且末(?:料)?|籽料|山料|俄料|俄罗斯料|青海料|野牛沟|巴沙料|韩料|河磨料|罗甸料)/);
    return m?m[1]:'';
  }
  function deriveForm(p){
    const text=[p?.name,p?.category].filter(Boolean).join(' ');
    const m=text.match(/(手镯|镯子|手串|珠串|吊坠|挂件|平安扣|无事牌|戒指|指环|项链|耳坠|摆件|原石|牌子)/);
    return m?m[1]:'';
  }
  function linkageOf(p){
    const x=p?.contentLinkageV1&&typeof p.contentLinkageV1==='object'?p.contentLinkageV1:{};
    return {
      version:1,
      sellingPoints:clean(x.sellingPoints),
      disclosure:clean(x.disclosure),
      peerQuote:x.peerQuote===''||x.peerQuote===null||x.peerQuote===undefined?'':Math.max(0,n(x.peerQuote)),
      showMomentsPrice:Boolean(x.showMomentsPrice),
      publicExtra:clean(x.publicExtra),
      updatedAt:x.updatedAt||'',
      lastGeneratedAt:x.lastGeneratedAt||'',
    };
  }
  function factSheet(p,link=linkageOf(p)){
    return {
      name:clean(p?.name),code:clean(p?.code),category:clean(p?.category),color:clean(p?.color),
      spec:deriveSpec(p),material:deriveMaterial(p),form:deriveForm(p),source:deriveSource(p),
      salePrice:n(p?.salePrice),sellingPoints:link.sellingPoints,disclosure:link.disclosure,publicExtra:link.publicExtra,
      peerQuote:link.peerQuote,showMomentsPrice:link.showMomentsPrice,
    };
  }
  function splitFacts(text){return String(text||'').split(/[，,；;\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,5);}
  function publicFactLine(f){return [f.spec&&`规格 ${f.spec}`,f.color&&`颜色 ${f.color}`].filter(Boolean).join('｜');}
  function generateCopies(p,link=linkageOf(p)){
    const f=factSheet(p,link),selling=splitFacts(f.sellingPoints),disclosure=splitFacts(f.disclosure),extra=clean(f.publicExtra);
    const factLine=publicFactLine(f);
    const points=selling.length?selling.join('，'):'实物拍摄，重点看整体颜色、细节和自然光下的状态';
    const detail=disclosure.length?`细节说明：${disclosure.join('，')}`:'';
    const moments=[f.name,factLine,points,detail,extra,link.showMomentsPrice&&f.salePrice?`参考：${moneyPlain(f.salePrice)}`:''].filter(Boolean).join('\n');

    const peer=[f.code?`【${f.code}】`:'' ,f.name,f.spec?`规格：${f.spec}`:'',f.color?`颜色：${f.color}`:'',selling.length?`特点：${selling.join('；')}`:'',disclosure.length?`细节：${disclosure.join('；')}`:'',link.peerQuote!==''?`同行参考：${moneyPlain(link.peerQuote)}`:'',extra?`补充：${extra}`:''].filter(Boolean).join('\n');

    const titleCore=[f.material,clean(f.category).replace(/\s*\/\s*/g,''),f.form].filter(Boolean).join('');
    const title=cut(`${titleCore||f.name}｜实拍看细节`,20);
    const variants=[
      ()=>[`柜台上整理到这件${f.name}。`,factLine?`${factLine}。`:'',`这种货我会先看整体协调感，再看细节。${selling.length?`这件比较直观的地方是：${selling.join('、')}。`:''}`,detail,extra,'图片和视频都尽量按同一件实物记录，天然材质个体差异以实物为准。'].filter(Boolean).join('\n\n'),
      ()=>[`这件${f.name}，我会先看整体，再看细节。`,factLine?`${factLine}。`:'',selling.length?`实物比较明显的几个点：${selling.join('、')}。`:'实拍里重点看颜色、结构和整体状态。',detail,extra,'玉石没有标准答案，最后还是要把自己的预算、审美和佩戴习惯放在一起看。'].filter(Boolean).join('\n\n'),
      ()=>[`做玉久了会发现，同一类货不能只看一个指标。今天这件${f.name}，更适合把整体和细节一起看。`,factLine?`${factLine}。`:'',selling.length?`我会重点看：${selling.join('、')}。`:'我会重点看实拍状态和整体协调感。',detail,extra,'实物拍摄只负责把状态尽量记录清楚，不用一个标签替代整件货的判断。'].filter(Boolean).join('\n\n'),
      ()=>[`今天不讲一堆参数，直接看这件${f.name}本身。`,factLine?`${factLine}。`:'',selling.length?`它比较值得看的地方：${selling.join('、')}。`:'先看整体颜色，再放大看细节。',detail,extra,'我是漠翠珠宝，新疆店主，只做真玉。实拍尽量还原，天然材质个体差异以实物为准。'].filter(Boolean).join('\n\n'),
    ];
    const xhs=variants[seedOf(p)%variants.length]();
    const shortVideo=[f.name,factLine,selling.length?`重点：${selling.join('、')}`:'实物视频重点看整体颜色和细节',disclosure.length?`细节：${disclosure.join('、')}`:'','实物拍摄，天然材质个体差异以实物为准。'].filter(Boolean).join('｜');
    let storeTitle=[f.material,clean(f.category),f.form,f.spec,f.color,'和田玉 实拍'].filter(Boolean).join(' ');storeTitle=cut(storeTitle||`${f.name} 和田玉 实拍`,60);
    return {moments,agent:peer,xhsTitle:title,xhs,shortVideo,storeTitle};
  }
  function contentHubOf(p){
    const h=p?.contentHub&&typeof p.contentHub==='object'?JSON.parse(JSON.stringify(p.contentHub)):{};
    h.copies={moments:'',xhsTitle:'',xhs:'',shortVideo:'',storeTitle:'',agent:'',...(h.copies||{})};
    h.publishHistory={moments:[],xhs:[],douyin:[],kuaishou:[],...(h.publishHistory||{})};
    h.repeatDays={moments:20,xhs:30,douyin:30,kuaishou:30,...(h.repeatDays||{})};
    h.createdAt=h.createdAt||nowISO();h.updatedAt=nowISO();
    return h;
  }
  async function saveLinkage(p,link){p.contentLinkageV1={...link,version:1,updatedAt:nowISO()};p.updatedAt=nowISO();await dbPut('products',p);return p;}
  async function writeGeneratedCopies(p,link,mode='fill'){
    const drafts=generateCopies(p,link),hub=contentHubOf(p),before={...hub.copies};
    for(const [key,value] of Object.entries(drafts)){
      if(mode==='overwrite'||!clean(hub.copies[key]))hub.copies[key]=value;
    }
    hub.updatedAt=nowISO();p.contentHub=hub;p.contentLinkageV1={...link,version:1,updatedAt:nowISO(),lastGeneratedAt:nowISO()};p.updatedAt=nowISO();await dbPut('products',p);
    try{await writeAudit('content.linkage_generate','product',p.id,`${p.name} 内容草稿已${mode==='overwrite'?'重新生成':'补全'}`,before,hub.copies);}catch(_){}
    return drafts;
  }
  function completeness(p){
    const link=linkageOf(p),hub=contentHubOf(p),spec=deriveSpec(p),hasImage=Boolean(p.image||arrMedia(p).some(m=>m.type==='image')),hasVideo=arrMedia(p).some(m=>m.type==='video');
    const rows=[
      {key:'image',label:'图片',ok:hasImage},
      {key:'video',label:'视频',ok:hasVideo},
      {key:'spec',label:'规格',ok:Boolean(spec)},
      {key:'color',label:'颜色',ok:Boolean(clean(p.color))},
      {key:'facts',label:'内容事实',ok:Boolean(link.updatedAt||link.sellingPoints||link.disclosure)},
      {key:'copy',label:'平台文案',ok:Boolean(clean(hub.copies.moments)||clean(hub.copies.xhs))},
    ];
    return {rows,done:rows.filter(x=>x.ok).length,total:rows.length,link,hub,hasImage,hasVideo,spec};
  }
  function readinessHTML(p){const c=completeness(p);return `<div class="content427-readiness">${c.rows.map(x=>`<span class="${x.ok?'ok':'missing'}">${x.ok?'✓':'·'} ${x.label}</span>`).join('')}</div>`;}
  function previewBlock(title,text){return `<div class="content427-preview"><div><strong>${esc(title)}</strong><button type="button" class="link-button content427-copy-preview" data-text="${encodeURIComponent(text)}">复制</button></div><pre>${esc(text||'暂无')}</pre></div>`;}

  async function openFactEditor427(productId){
    const p=await dbGet('products',productId);if(!p)return;
    const link=linkageOf(p),f=factSheet(p,link);let preview=generateCopies(p,link);
    const latestQuote=(p.workflowQuotes||[]).filter(q=>q.status!=='closed').sort((a,b)=>new Date(b.createdAt||b.updatedAt||0)-new Date(a.createdAt||a.updatedAt||0))[0];
    openModal('内容事实卡',`<div class="content427-editor">
      <div class="notice"><strong>公开内容只读取确认过的事实。</strong><br>内部成本、货主姓名、完整内部备注不会自动写进朋友圈或小红书；原始商品图和原视频也不会被修改。</div>
      <div class="content427-facts-grid"><div><span>货品</span><strong>${esc(f.name||'-')}</strong></div><div><span>货号</span><strong>${esc(f.code||'-')}</strong></div><div><span>分类</span><strong>${esc(f.category||'-')}</strong></div><div><span>颜色</span><strong>${esc(f.color||'-')}</strong></div><div><span>规格</span><strong>${esc(f.spec||'待补')}</strong></div><div><span>内部来源</span><strong>${esc(f.source||'未记录')}</strong></div></div>
      <div class="form-group"><label class="form-label">可公开写的特点 / 卖点</label><textarea id="content427Selling" class="textarea" placeholder="只写你确认过的客观特征，例如：颜色均匀、细度好、圆条、自然光偏暖">${esc(link.sellingPoints)}</textarea><div class="field-help">用逗号分开即可。系统不会自己判断“顶级、无结构、羊脂”等结论。</div></div>
      <div class="form-group"><label class="form-label">需要主动说明的细节 / 瑕疵</label><textarea id="content427Disclosure" class="textarea" placeholder="例如：一处小黑点、轻微水线、局部糖色过渡">${esc(link.disclosure)}</textarea></div>
      <div class="form-group"><label class="form-label">公开补充</label><textarea id="content427Extra" class="textarea" placeholder="例如：自然光实拍、适合喜欢偏冷白的人">${esc(link.publicExtra)}</textarea></div>
      <div class="form-row"><div class="form-group"><label class="form-label">同行参考报价（可选）</label><input id="content427PeerQuote" class="input" inputmode="decimal" type="number" min="0" step="0.01" value="${link.peerQuote!==''?esc(link.peerQuote):''}" placeholder="不填就不出现在同行文案"></div><div class="form-group"><label class="form-label">朋友圈价格</label><label class="content427-switch"><input id="content427ShowPrice" type="checkbox" ${link.showMomentsPrice?'checked':''}><span>显示商品售价 ${f.salePrice?moneyPlain(f.salePrice):'（未录售价）'}</span></label></div></div>
      ${latestQuote?`<div class="notice warn">最近有一条内部报价：${esc(latestQuote.person||'未填写对象')} · ${fmtMoney(latestQuote.amount||latestQuote.price||0)}。为避免把针对某个人的报价误发给其他同行，本页不会自动带入。</div>`:''}
      <div class="section-title">草稿预览 <small>保存事实后可以只补空白，或重新覆盖生成</small></div>
      <div id="content427PreviewArea">${previewBlock('朋友圈',preview.moments)}${previewBlock('同行转货',preview.agent)}${previewBlock('小红书',`${preview.xhsTitle}\n\n${preview.xhs}`)}</div>
      <div class="content427-editor-actions"><button id="content427SaveFacts" class="btn secondary" type="button">只保存事实卡</button><button id="content427FillCopies" class="btn" type="button">只补空白文案</button><button id="content427OverwriteCopies" class="btn danger" type="button">重新生成全部文案</button></div>
    </div>`,{full:true,onOpen:()=>{
      const read=()=>({version:1,sellingPoints:clean($('#content427Selling').value),disclosure:clean($('#content427Disclosure').value),publicExtra:clean($('#content427Extra').value),peerQuote:$('#content427PeerQuote').value===''?'':Math.max(0,n($('#content427PeerQuote').value)),showMomentsPrice:$('#content427ShowPrice').checked,updatedAt:link.updatedAt,lastGeneratedAt:link.lastGeneratedAt});
      const refresh=()=>{preview=generateCopies(p,read());$('#content427PreviewArea').innerHTML=previewBlock('朋友圈',preview.moments)+previewBlock('同行转货',preview.agent)+previewBlock('小红书',`${preview.xhsTitle}\n\n${preview.xhs}`);bindPreviewCopy();};
      const bindPreviewCopy=()=>{$$('.content427-copy-preview').forEach(btn=>btn.onclick=()=>copyText(decodeURIComponent(btn.dataset.text||'')));};
      ['content427Selling','content427Disclosure','content427Extra','content427PeerQuote','content427ShowPrice'].forEach(id=>{const el=$('#'+id);if(el)el.oninput=refresh;if(el&&el.type==='checkbox')el.onchange=refresh;});
      bindPreviewCopy();
      $('#content427SaveFacts').onclick=async()=>{await saveLinkage(p,read());showToast('内容事实卡已保存');closeModal();if(appState.route==='product-content')await window.renderProductContent();else if(appState.route==='product-detail')await renderProductDetail();};
      $('#content427FillCopies').onclick=async()=>{const v=read();await writeGeneratedCopies(p,v,'fill');showToast('已只补空白文案，已有文案没有覆盖');closeModal();if(appState.route==='product-content')await window.renderProductContent();};
      $('#content427OverwriteCopies').onclick=async()=>{if(!await confirmDialog('确定用当前事实卡重新生成朋友圈、同行、小红书和短视频文案？现有这些文案会被覆盖，但发布记录不会删除。'))return;const v=read();await writeGeneratedCopies(p,v,'overwrite');showToast('平台文案已重新生成');closeModal();if(appState.route==='product-content')await window.renderProductContent();};
    }});
  }

  function productLinkagePanelHTML(p){
    const c=completeness(p),f=factSheet(p,c.link),drafts=generateCopies(p,c.link),peer=clean(c.hub.copies.agent)||drafts.agent,moments=clean(c.hub.copies.moments)||drafts.moments;
    return `<section id="content427ProductPanel" class="content427-product-panel"><div class="content427-panel-head"><div><strong>商品档案 → 内容</strong><span>${c.done}/${c.total} 项内容资料已具备</span></div><button id="content427EditFacts" class="btn small">编辑事实卡</button></div>${readinessHTML(p)}<div class="content427-fact-summary"><span>规格 <b>${esc(f.spec||'待补')}</b></span><span>颜色 <b>${esc(f.color||'待补')}</b></span><span>卖点 <b>${esc(c.link.sellingPoints||'待补')}</b></span><span>细节说明 <b>${esc(c.link.disclosure||'无/待确认')}</b></span></div><div class="content427-fast-actions"><button id="content427CopyMoments" type="button">复制朋友圈</button><button id="content427CopyPeer" type="button">复制同行转货</button><button id="content427FillBlank" type="button">补全空白文案</button></div><div class="item-meta">公开文案不会自动带入成本、货主或内部备注。原始商品图/视频保持原文件，不生成覆盖版本。</div></section>`;
  }

  async function injectProductContent427(){
    if(appState.route!=='product-content'||document.querySelector('#content427ProductPanel'))return;
    const p=await dbGet('products',appState.params.id);if(!p)return;
    const main=$('#main'),anchor=main?.querySelector('.content-product-head');if(!main||!anchor)return;
    const wrap=document.createElement('div');wrap.innerHTML=productLinkagePanelHTML(p);const panel=wrap.firstElementChild;anchor.insertAdjacentElement('afterend',panel);
    const c=completeness(p),drafts=generateCopies(p,c.link),hub=contentHubOf(p);
    $('#content427EditFacts').onclick=()=>openFactEditor427(p.id);
    $('#content427CopyMoments').onclick=()=>copyText(clean(hub.copies.moments)||drafts.moments);
    $('#content427CopyPeer').onclick=()=>copyText(clean(hub.copies.agent)||drafts.agent);
    $('#content427FillBlank').onclick=async()=>{await writeGeneratedCopies(p,c.link,'fill');showToast('已补全空白文案');await window.renderProductContent();};
  }

  function issueScore(p){const c=completeness(p);let score=0;if(!c.hasImage)score+=8;if(!clean(c.hub.copies.moments)&&!clean(c.hub.copies.xhs))score+=6;if(!c.hasVideo)score+=3;if(!c.spec)score+=2;if(!clean(p.color))score+=2;if(!c.link.updatedAt&&!c.link.sellingPoints&&!c.link.disclosure)score+=2;return score;}
  function issueText(p){const c=completeness(p),a=[];if(!c.hasImage)a.push('缺图片');if(!clean(c.hub.copies.moments)&&!clean(c.hub.copies.xhs))a.push('缺文案');if(!c.hasVideo)a.push('缺视频');if(!c.spec)a.push('缺规格');if(!clean(p.color))a.push('缺颜色');if(!c.link.updatedAt&&!c.link.sellingPoints&&!c.link.disclosure)a.push('事实卡未建');return a.join(' · ')||'资料齐';}

  async function injectContentHub427(){
    if(appState.route!=='content'||document.querySelector('#content427HubPanel'))return;
    const products=(await dbAll('products')).filter(p=>!p.historicalOnly&&n(p.stock)>0);
    const noCopy=products.filter(p=>{const h=contentHubOf(p);return !clean(h.copies.moments)&&!clean(h.copies.xhs);});
    const noImage=products.filter(p=>!Boolean(p.image||arrMedia(p).some(m=>m.type==='image')));
    const noVideo=products.filter(p=>!arrMedia(p).some(m=>m.type==='video'));
    const noFacts=products.filter(p=>{const x=linkageOf(p);return !x.updatedAt&&!x.sellingPoints&&!x.disclosure;});
    let momentsDue=0,xhsDue=0;try{momentsDue=window.MocuiContent?.dueProducts?.(products,'moments')?.length||0;xhsDue=window.MocuiContent?.dueProducts?.(products,'xhs')?.length||0;}catch(_){}
    const needs=[...products].sort((a,b)=>issueScore(b)-issueScore(a)||new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt)).filter(p=>issueScore(p)>0).slice(0,6);
    const panel=document.createElement('section');panel.id='content427HubPanel';panel.className='content427-hub-panel';panel.innerHTML=`<div class="content427-panel-head"><div><strong>内容联动概览</strong><span>先补事实和素材，再决定发什么；不批量生成同款小红书文案</span></div></div><div class="content427-metrics"><div><span>在手商品</span><b>${products.length}</b></div><div><span>文案待补</span><b>${noCopy.length}</b></div><div><span>图片待补</span><b>${noImage.length}</b></div><div><span>视频待补</span><b>${noVideo.length}</b></div><div><span>事实卡待补</span><b>${noFacts.length}</b></div><div><span>朋友圈到期</span><b>${momentsDue}</b></div><div><span>小红书到期</span><b>${xhsDue}</b></div></div>${needs.length?`<div class="content427-needs-title">优先补资料</div><div class="content427-needs">${needs.map(p=>`<button type="button" data-content427-id="${esc(p.id)}"><span>${p.image?`<img src="${esc(p.image)}" alt="">`:'玉'}</span><div><strong>${esc(p.name)}</strong><small>${esc(issueText(p))}</small></div><b>›</b></button>`).join('')}</div>`:'<div class="notice success">当前在手商品的基础内容资料比较完整。</div>'}<div class="notice">这里的“优先”只按资料缺口排序，不代表商品更值得推广。小红书正文仍建议逐件检查，避免批量模板感。</div>`;
    const main=$('#main'),tabs=main?.querySelector('.workbench-tabs');if(tabs)tabs.insertAdjacentElement('afterend',panel);else main?.prepend(panel);
    $$('[data-content427-id]',panel).forEach(btn=>btn.onclick=()=>navigate('product-content',{id:btn.dataset.content427Id}));
  }

  async function injectProductDetail427(){
    if(appState.route!=='product-detail'||document.querySelector('#content427DetailActions'))return;
    const p=await dbGet('products',appState.params.id);if(!p)return;const btn=$('#productContent');if(!btn)return;
    const c=completeness(p),drafts=generateCopies(p,c.link),hub=contentHubOf(p);
    const el=document.createElement('div');el.id='content427DetailActions';el.className='content427-detail-actions';el.innerHTML=`<button id="content427DetailPeer" type="button">复制同行文案</button><button id="content427DetailFacts" type="button">内容事实卡</button>`;btn.insertAdjacentElement('afterend',el);
    $('#content427DetailPeer').onclick=()=>copyText(clean(hub.copies.agent)||drafts.agent);
    $('#content427DetailFacts').onclick=()=>openFactEditor427(p.id);
  }

  window.renderProductContent=async function(){const result=await baseRenderProductContent427.apply(this,arguments);await injectProductContent427();return result;};
  try{renderProductContent=window.renderProductContent;}catch(_){}
  window.renderContentHub=async function(){const result=await baseRenderContentHub427.apply(this,arguments);await injectContentHub427();return result;};
  try{renderContentHub=window.renderContentHub;}catch(_){}
  renderProductDetail=async function(){const result=await baseRenderProductDetail427.apply(this,arguments);await injectProductDetail427();return result;};

  renderMore=async function(){
    const result=await baseRenderMore427.apply(this,arguments);
    try{if(appState.route==='more'&&!document.querySelector('#content427MoreEntry')){const main=$('#main');if(main){const sec=document.createElement('section');sec.id='content427MoreEntry';sec.className='more-group';sec.innerHTML=`<div class="more-group-title">内容与货品</div><div class="list"><div id="content427OpenHub" class="list-item clickable"><div class="thumb placeholder">文</div><div class="item-main"><div class="item-title">商品内容联动</div><div class="item-meta">商品档案 → 事实卡 → 朋友圈 / 同行 / 小红书</div></div><div>›</div></div></div>`;main.prepend(sec);$('#content427OpenHub').onclick=()=>navigate('content');}}}catch(_){}return result;
  };

  let observerTimer=0;
  const observer=new MutationObserver(()=>{clearTimeout(observerTimer);observerTimer=setTimeout(()=>{if(appState.route==='product-content')injectProductContent427().catch(()=>{});else if(appState.route==='content')injectContentHub427().catch(()=>{});else if(appState.route==='product-detail')injectProductDetail427().catch(()=>{});},30);});
  const startObserver=()=>{const main=$('#main');if(main)observer.observe(main,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObserver,{once:true});else startObserver();

  window.MocuiContentLinkage427={version:VERSION,linkageOf,factSheet,generateCopies,completeness,openFactEditor:openFactEditor427};
})();
