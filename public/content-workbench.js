'use strict';
(() => {
  const PLATFORM_CONFIG={
    moments:{label:'朋友圈',repeatDays:20,copyKey:'moments'},
    xhs:{label:'小红书',repeatDays:30,copyKey:'xhs'},
    wechatVideo:{label:'视频号',repeatDays:30,copyKey:'shortVideo'},
    douyin:{label:'抖音',repeatDays:30,copyKey:'shortVideo'},
    kuaishou:{label:'快手',repeatDays:30,copyKey:'shortVideo'},
  };
  const RISK_RULES=[
    {group:'极限/保证',words:['最好的','最好','第一','顶级','极品','绝对','百分百','100%','永久','唯一','全网最低','最低价','无敌'],suggest:'改为客观、可验证的描述'},
    {group:'投资/价值承诺',words:['稳赚','升值','保值','暴涨','投资回报','只涨不跌','增值'],suggest:'改为“个人审美/收藏偏好”，不要承诺未来价值'},
    {group:'封建迷信',words:['招财','转运','改运','辟邪','挡灾','旺财','镇宅','开光','消灾','保平安'],suggest:'改为“传统文化寓意、美好祝愿”等中性表达'},
    {group:'健康功效',words:['治病','治疗','疗效','养生功效','改善睡眠','降血压','排毒','美容养颜','治愈'],suggest:'删除功效暗示，只描述材质、工艺和佩戴体验'},
    {group:'站外引流',words:['加微信','加V','微信联系','手机号','电话联系','私下交易','扫码加我'],suggest:'删除站外联系方式与交易引导'},
  ];
  const ownMediaUrl=url=>/^\/api\/media\//.test(String(url||''));
  const cleanText=s=>String(s||'').trim();
  const mediaOf=p=>Array.isArray(p.media)?p.media:[];
  const contentOf=p=>{
    const current=p.contentHub&&typeof p.contentHub==='object'?p.contentHub:{};
    return {
      copies:{moments:'',xhsTitle:'',xhs:'',shortVideo:'',storeTitle:'',agent:'',...(current.copies||{})},
      publishHistory:{moments:[],xhs:[],wechatVideo:[],douyin:[],kuaishou:[],...(current.publishHistory||{})},
      repeatDays:{moments:20,xhs:30,wechatVideo:30,douyin:30,kuaishou:30,...(current.repeatDays||{})},
      agentShares:Array.isArray(current.agentShares)?current.agentShares:[],
      createdAt:current.createdAt||new Date().toISOString(),updatedAt:current.updatedAt||new Date().toISOString(),
    };
  };
  function productSpec(p){return cleanText(p.qinsilk?.size||p.size||'');}
  function topicTags(p){
    const text=`${p.name||''} ${p.category||''} ${p.color||''} ${p.note||''}`;
    const tags=['#和田玉'];
    if(/手镯/.test(text))tags.push('#和田玉手镯');
    else if(/手串|手链/.test(text))tags.push('#和田玉手串');
    else if(/吊坠|挂件|佛|观音|平安扣/.test(text))tags.push('#和田玉吊坠');
    else if(/戒指|戒面/.test(text))tags.push('#玉石戒指');
    if(/碧玉/.test(text))tags.push('#碧玉');
    if(/白玉/.test(text))tags.push('#白玉');
    if(/青花/.test(text))tags.push('#青花玉');
    if(/晴水/.test(text))tags.push('#晴水');
    if(/俄料/.test(text))tags.push('#俄料和田玉');
    if(/青海/.test(text))tags.push('#青海料');
    if(/新疆|且末|籽料/.test(text))tags.push('#新疆和田玉');
    tags.push('#玉石分享');
    return [...new Set(tags)].slice(0,6);
  }
  function defaultCopies(p){
    const spec=productSpec(p), color=cleanText(p.color), cat=cleanText(p.category), tags=topicTags(p).join(' ');
    const facts=[spec&&`规格：${spec}`,color&&`颜色：${color}`,cat&&`品类：${cat}`].filter(Boolean);
    const moments=[p.name,facts.join('｜'),'今天实拍的一件，图片和视频都是同一件货。喜欢这类风格可以重点看整体颜色、细节和上手效果。'].filter(Boolean).join('\n');
    const xhsTitle=( `${p.name}${spec?`｜${spec}`:''} 实拍分享` ).slice(0,38);
    const xhs=[`今天整理到这件${p.name}。`,facts.length?facts.join('，')+'。':'',`我更建议先看整体协调感，再看细节和预算是否匹配。实物天然材质存在个体差异，图片与视频尽量按实拍记录。`,tags].filter(Boolean).join('\n');
    const shortVideo=[p.name,facts.join('｜'),'实物视频记录，重点看整体颜色、细节和自然光下的状态。'].filter(Boolean).join('\n');
    let storeTitle=[p.name,spec,color,cat,'实物拍摄'].filter(Boolean).join(' ');
    if(storeTitle.length<16)storeTitle+=' 和田玉饰品 实拍';
    storeTitle=storeTitle.slice(0,60);
    return {moments,xhsTitle,xhs,shortVideo,storeTitle,agent:moments};
  }
  function scanRisk(text){
    const found=[];
    const raw=String(text||'');
    for(const rule of RISK_RULES){for(const word of rule.words){if(raw.includes(word))found.push({word,group:rule.group,suggest:rule.suggest});}}
    return found;
  }
  function riskHTML(text){
    const rows=scanRisk(text);
    if(!rows.length)return '<div class="content-risk-ok">✓ 未发现当前辅助词库中的高风险表达</div>';
    return `<div class="content-risk-list">${rows.map(r=>`<div><span class="badge danger">${esc(r.word)}</span><strong>${esc(r.group)}</strong><small>${esc(r.suggest)}</small></div>`).join('')}</div>`;
  }
  async function mediaApi(path,options={}){
    const res=await fetch(path,{credentials:'same-origin',...options});
    const type=res.headers.get('content-type')||'';
    const body=type.includes('application/json')?await res.json().catch(()=>({})):await res.text();
    if(!res.ok)throw new Error(body?.error||body||`请求失败 ${res.status}`);
    return body;
  }
  async function uploadMediaFile(file,productId){
    const isVideo=file.type.startsWith('video/');
    const limit=isVideo?95*1024*1024:25*1024*1024;
    if(file.size>limit)throw new Error(`${file.name} 超过当前单文件${isVideo?'95MB':'25MB'}限制`);
    return mediaApi('/api/media/upload',{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-product-id':String(productId||'').slice(0,80)},body:file});
  }
  async function importQinsilkImage(url,productId){
    return mediaApi('/api/media/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,productId})});
  }
  async function deleteMediaUrl(url){
    if(!/^\/api\/media\/u-/.test(url))return;
    await mediaApi(url,{method:'DELETE'});
  }
  function mediaCard(m,p){
    const isVideo=m.type==='video';
    return `<div class="content-media-card" data-media-id="${esc(m.id)}">${isVideo?`<video src="${esc(m.url)}" preload="metadata" playsinline></video><span class="content-media-kind">视频</span>`:`<img src="${esc(m.url)}" alt="" loading="lazy"><span class="content-media-kind">图片</span>`}<div class="content-media-meta"><span>${esc(m.name||'素材')}</span><span>${m.size?`${(m.size/1024/1024).toFixed(1)}MB`:''}</span></div><div class="content-media-actions">${!isVideo?`<button class="mini-media-btn set-cover" data-id="${esc(m.id)}">${p.image===m.url?'✓ 封面':'设封面'}</button>`:''}<button class="mini-media-btn danger remove-media" data-id="${esc(m.id)}">移除</button></div></div>`;
  }
  async function blobToFile(url,name,typeHint=''){
    const res=await fetch(url,{credentials:'same-origin'});if(!res.ok)throw new Error('素材读取失败');const blob=await res.blob();
    return new File([blob],name||`mocui-${Date.now()}`,{type:blob.type||typeHint||'application/octet-stream'});
  }
  async function shareFiles(files,title='漠翠商品素材'){
    if(!files.length){showToast('暂无可分享素材');return;}
    try{
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files}))){await navigator.share({title,files});return;}
    }catch(err){if(err?.name==='AbortError')return;}
    files.forEach(file=>{const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);});
    showToast('已转为文件下载；iPhone可在分享菜单中选择“存储图像/视频”');
  }
  async function shareMediaList(list,p){
    const files=[];for(let i=0;i<list.length;i++){const m=list[i];files.push(await blobToFile(m.url,m.name||`${p.code||'mocui'}-${i+1}.${m.type==='video'?'mp4':'jpg'}`,m.mime));}
    await shareFiles(files,p.name);
  }
  async function cropFileFromMedia(m,ratio,prefix){
    const response=await fetch(m.url,{credentials:'same-origin'});if(!response.ok)throw new Error('图片读取失败');const blob=await response.blob();const src=URL.createObjectURL(blob);
    try{
      const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('图片解码失败'));el.src=src;});
      const outW=1080,outH=Math.round(outW/ratio),canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,outW,outH);
      const srcRatio=img.naturalWidth/img.naturalHeight;let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;if(srcRatio>ratio){sw=img.naturalHeight*ratio;sx=(img.naturalWidth-sw)/2;}else{sh=img.naturalWidth/ratio;sy=(img.naturalHeight-sh)/2;}ctx.drawImage(img,sx,sy,sw,sh,0,0,outW,outH);
      const out=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.92));return new File([out],`${prefix}-${m.name||'image'}.jpg`,{type:'image/jpeg'});
    }finally{URL.revokeObjectURL(src);}
  }
  async function saveProductContent(p,hub){p.contentHub={...hub,updatedAt:new Date().toISOString()};p.updatedAt=new Date().toISOString();await dbPut('products',p);}
  function lastPublished(hub,platform){const rows=hub.publishHistory?.[platform]||[];return rows.length?rows.map(x=>new Date(x.at||x)).sort((a,b)=>b-a)[0]:null;}
  function daysSince(date){return date?Math.floor((Date.now()-date.getTime())/86400000):null;}
  function dueState(p,platform){const hub=contentOf(p),last=lastPublished(hub,platform),repeat=Number(hub.repeatDays?.[platform]||PLATFORM_CONFIG[platform]?.repeatDays||30),days=daysSince(last);return {last,days,repeat,due:!last||days>=repeat};}
  function productMediaSummary(p){const media=mediaOf(p),imgs=media.filter(m=>m.type==='image').length+(p.image&&!media.some(m=>m.url===p.image)?1:0),videos=media.filter(m=>m.type==='video').length;return `${imgs}图 · ${videos}视频`;}
  function dueProducts(products,platform){
    return products.filter(p=>Number(p.stock)>0).map(p=>{const d=dueState(p,platform),updated=new Date(p.updatedAt||p.createdAt||0);let score=0;if(!d.last){const age=(Date.now()-updated.getTime())/86400000;score=age<=3?100000-age:50000+age;}else score=(d.days-d.repeat)*100;return {p,d,score};}).filter(x=>x.d.due).sort((a,b)=>b.score-a.score).slice(0,10);
  }

  async function shareApi(path,options={}){
    const res=await fetch(path,{credentials:'same-origin',...options});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body?.error||`请求失败 ${res.status}`);
    return body;
  }
  function publicShareUrl(token){const u=new URL('/share.html',location.origin);u.hash=token;return u.toString();}
  function shareStatus(row){
    if(row.revokedAt)return {label:'已撤销',cls:'danger'};
    if(row.expiresAt&&row.expiresAt<Date.now())return {label:'已过期',cls:'warn'};
    return {label:'有效',cls:'success'};
  }
  async function openAgentShareManager(p,hub){
    const ownMedia=mediaOf(p).filter(m=>ownMediaUrl(m.url));
    const server=await shareApi(`/api/shares?productId=${encodeURIComponent(p.id)}`).catch(()=>({shares:[]}));
    const statusMap=new Map((server.shares||[]).map(x=>[x.id,x]));
    const localMap=new Map((hub.agentShares||[]).map(x=>[x.id,x]));
    const history=(server.shares||[]).map(row=>({...row,url:localMap.get(row.id)?.url||''}));
    const defaultAgent=hub.copies.agent||hub.copies.moments||defaultCopies(p).agent;
    const retail=Number(p.salePrice||0)>0?`¥${Number(p.salePrice).toLocaleString('zh-CN',{maximumFractionDigits:2})}`:'';
    const listHTML=history.length?history.map(row=>{const st=shareStatus(row);return `<div class="agent-share-row" data-id="${esc(row.id)}"><div class="agent-share-info"><div><strong>${esc(row.title||p.name)}</strong><span class="badge ${st.cls}">${st.label}</span></div><small>${row.createdAt?fmtDateTime(new Date(row.createdAt)):'—'} · 浏览 ${row.viewCount||0} · 下载 ${row.downloadCount||0}${row.expiresAt?` · 到期 ${fmtDateTime(new Date(row.expiresAt))}`:' · 长期有效'}</small></div><div class="agent-share-actions">${row.url&&st.label==='有效'?`<button class="btn secondary small copy-agent-link" data-url="${esc(row.url)}">复制链接</button><button class="btn secondary small system-share-agent-link" data-url="${esc(row.url)}">分享链接</button>`:''}${st.label==='有效'?`<button class="btn danger small revoke-agent-link" data-id="${esc(row.id)}">撤销</button>`:''}</div></div>`}).join(''):emptyState('↗','还没有代理分享链接','生成后代理只看到公开素材和文案');
    openModal('代理素材分享',`<div class="notice success"><strong>安全白名单：</strong>公开页只返回商品名称、公开货号、你选择显示的价格、代理文案、原图和原视频。成本、利润、供应商、库存位置、客户、调借和销售记录不会发送给公开页面。</div><div class="form-group"><label class="form-label">代理转发文案</label><textarea id="agentShareCopy" class="textarea tall">${esc(defaultAgent)}</textarea></div><div class="form-row"><div class="form-group"><label class="form-label">价格显示</label><select id="agentPriceMode" class="select"><option value="none">不显示价格</option>${retail?`<option value="retail">零售价 ${esc(retail)}</option>`:''}<option value="custom">自定义价格/说明</option></select></div><div class="form-group"><label class="form-label">有效期</label><select id="agentExpiry" class="select"><option value="7">7天</option><option value="30" selected>30天</option><option value="90">90天</option><option value="0">长期有效</option></select></div></div><div id="agentCustomPriceWrap" class="form-group hidden"><label class="form-label">公开价格/说明</label><input id="agentCustomPrice" class="input" placeholder="如：代理价私询 / ¥12800"></div><label class="check-line"><input id="agentAllowDownload" type="checkbox" checked> 允许代理下载原图和原视频</label><div class="notice">当前可分享自有素材：${ownMedia.filter(x=>x.type==='image').length} 张原图 · ${ownMedia.filter(x=>x.type==='video').length} 个原视频。${ownMedia.length?'':'请先把图片/视频上传或转存到自己的 R2。'}</div><button id="createAgentShare" class="btn block" ${ownMedia.length?'':'disabled'}>生成安全代理链接</button><div id="createdAgentShare" class="agent-created-link hidden"></div><div class="section-title">已有链接 <small>${history.length}</small></div><div id="agentShareHistory">${listHTML}</div>`,{onOpen:()=>{
      const mode=$('#agentPriceMode');mode.onchange=()=>$('#agentCustomPriceWrap').classList.toggle('hidden',mode.value!=='custom');
      $('#createAgentShare').onclick=async()=>{try{
        const text=$('#agentShareCopy').value.trim();
        let publicPrice='';if(mode.value==='retail')publicPrice=retail;else if(mode.value==='custom')publicPrice=$('#agentCustomPrice').value.trim();
        const result=await shareApi('/api/shares',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({productId:p.id,title:p.name,code:p.code||'',publicPrice,copyText:text,expiresDays:Number($('#agentExpiry').value||0),allowDownload:$('#agentAllowDownload').checked,media:ownMedia.map(m=>({url:m.url,type:m.type,name:m.name,mime:m.mime}))})});
        const url=publicShareUrl(result.token);hub.copies.agent=text;hub.agentShares=[{id:result.id,url,createdAt:new Date(result.createdAt).toISOString(),expiresAt:result.expiresAt||null},...(hub.agentShares||[]).filter(x=>x.id!==result.id)].slice(0,100);await saveProductContent(p,hub);
        const box=$('#createdAgentShare');box.classList.remove('hidden');box.innerHTML=`<strong>链接已生成</strong><input id="newAgentShareUrl" class="input" readonly value="${esc(url)}"><div class="btn-row"><button id="copyNewAgentLink" class="btn secondary small">复制链接</button><button id="shareNewAgentLink" class="btn small">发给代理</button></div>`;$('#copyNewAgentLink').onclick=()=>copyText(url);$('#shareNewAgentLink').onclick=async()=>{if(navigator.share){try{await navigator.share({title:p.name,text:'商品原图/视频与转发文案',url});return;}catch(e){if(e?.name==='AbortError')return;}}await copyText(url);showToast('链接已复制');};showToast('代理分享链接已生成');
      }catch(err){showToast(err.message);}};
      $$('.copy-agent-link').forEach(btn=>btn.onclick=()=>copyText(btn.dataset.url));
      $$('.system-share-agent-link').forEach(btn=>btn.onclick=async()=>{const url=btn.dataset.url;if(navigator.share){try{await navigator.share({title:p.name,url});return;}catch(e){if(e?.name==='AbortError')return;}}await copyText(url);});
      $$('.revoke-agent-link').forEach(btn=>btn.onclick=async()=>{if(!await confirmDialog('撤销后代理立即无法继续访问这个链接，确定撤销？'))return;try{await shareApi(`/api/shares/${encodeURIComponent(btn.dataset.id)}`,{method:'DELETE'});hub.agentShares=(hub.agentShares||[]).filter(x=>x.id!==btn.dataset.id);await saveProductContent(p,hub);showToast('分享链接已撤销');closeModal();await openAgentShareManager(p,hub);}catch(err){showToast(err.message);}});
    }});
  }
  async function renderContentHub(){
    setHeader('内容工作台','今日待发、重复曝光与素材复用');const products=await dbAll('products');const moments=dueProducts(products,'moments'),xhs=dueProducts(products,'xhs');
    $('#main').innerHTML=`<div class="content-hub-summary"><div class="metric"><div class="label">朋友圈建议</div><div class="value">${moments.length}</div><div class="hint">默认20天循环</div></div><div class="metric"><div class="label">小红书建议</div><div class="value">${xhs.length}</div><div class="hint">默认30天循环</div></div></div><div class="notice">优先显示仍有库存、从未发布或已达到重复发布周期的商品。第一期每天最多推荐10件，避免待办太长。</div><div class="section-title">今日朋友圈 <small>${moments.length} 件</small></div><div class="list">${moments.map(x=>contentDueItem(x.p,x.d,'moments')).join('')||emptyState('✓','今天暂无到期商品')}</div><div class="section-title">今日小红书 <small>${xhs.length} 件</small></div><div class="list">${xhs.map(x=>contentDueItem(x.p,x.d,'xhs')).join('')||emptyState('✓','今天暂无到期商品')}</div>`;
    $$('#main .open-product-content').forEach(btn=>btn.onclick=()=>navigate('product-content',{id:btn.dataset.id}));
  }
  function contentDueItem(p,d,platform){return `<button class="content-due-item open-product-content" data-id="${esc(p.id)}"><span class="content-due-thumb">${p.image?`<img src="${esc(p.image)}" alt="">`:'玉'}</span><span class="content-due-main"><strong>${esc(p.name)}</strong><small>${esc(p.code)} · ${productMediaSummary(p)}</small><small>${d.last?`上次${PLATFORM_CONFIG[platform].label} ${d.days}天前`:`尚未记录${PLATFORM_CONFIG[platform].label}发布时间`}</small></span><span class="content-due-arrow">›</span></button>`;}
  async function renderProductContent(){
    const p=await dbGet('products',appState.params.id);if(!p){showToast('商品不存在');return navigate('products');}setHeader('素材与发布',`${p.name} · ${p.code}`);
    let hub=contentOf(p);if(!Object.values(hub.copies).some(Boolean)){hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);}
    const renderPage=async()=>{
      const media=mediaOf(p),images=media.filter(m=>m.type==='image'),videos=media.filter(m=>m.type==='video'),externalCover=p.image&&!ownMediaUrl(p.image)&&!media.some(m=>m.url===p.image);
      $('#main').innerHTML=`<div class="content-product-head"><div class="content-product-cover">${p.image?`<img src="${esc(p.image)}" alt="">`:'玉'}</div><div><strong>${esc(p.name)}</strong><span>${esc(p.code)} · 库存 ${fmtInt(p.stock)}</span><span>${productMediaSummary(p)}</span></div></div>
      <div class="section-title">商品素材 <small>图片与视频上传一次，后续重复使用</small></div><div class="card"><label class="content-upload-zone" for="contentMediaInput"><strong>＋ 上传图片 / 视频</strong><span>图片单张≤25MB；视频单个≤95MB</span></label><input id="contentMediaInput" class="hidden" type="file" accept="image/*,video/*" multiple><div id="contentUploadStatus" class="item-meta" style="margin-top:8px"></div>${externalCover?`<div class="notice warn" style="margin-top:10px">当前主图来自秦丝外链。<button id="importLegacyCover" class="link-button">转存到自己的R2素材库</button></div>`:''}<div class="content-media-grid">${media.map(m=>mediaCard(m,p)).join('')||emptyState('▧','还没有自有素材','上传后会保存在 Cloudflare R2')}</div><div class="notice" style="margin-top:10px"><strong>素材规则：</strong>朋友圈、代理转图、小红书笔记和普通分享一律使用原图；只有小红书店铺商品图需要时才生成裁切版。</div><div class="content-media-tools"><button id="shareImages" class="btn secondary">保存/分享原图</button><button id="shareVideos" class="btn secondary">保存/分享原视频</button><button id="export34" class="btn secondary">店铺图 3:4</button><button id="export11" class="btn secondary">店铺图 1:1</button></div><button id="agentShareCenter" class="btn block agent-share-entry">生成代理素材分享链接</button><div class="item-meta" style="margin-top:7px">代理页只显示公开素材和文案，不显示成本、利润、供应商、库存位置或业务记录。</div></div>
      <div class="section-title">文案助手 <small>第一期使用本地模板，可手动修改</small></div><div class="card"><div class="btn-row"><button id="regenCopies" class="btn secondary small">根据商品重新生成</button><button id="scanXhs" class="btn secondary small">检测小红书风险词</button></div><div class="form-group"><label class="form-label">朋友圈文案</label><textarea id="momentsCopy" class="textarea content-copy-area">${esc(hub.copies.moments)}</textarea><button class="copy-inline" data-copy="momentsCopy">复制朋友圈文案</button></div><div class="form-group"><label class="form-label">小红书标题</label><input id="xhsTitleCopy" class="input" value="${esc(hub.copies.xhsTitle)}"><div class="char-count"><span id="xhsTitleCount">${hub.copies.xhsTitle.length}</span> 字</div></div><div class="form-group"><label class="form-label">小红书正文 + 话题</label><textarea id="xhsCopy" class="textarea content-copy-area tall">${esc(hub.copies.xhs)}</textarea><button class="copy-inline" data-copy="xhsCopy">复制小红书文案</button><div id="xhsRiskBox">${riskHTML(hub.copies.xhsTitle+'\n'+hub.copies.xhs)}</div></div><div class="form-group"><label class="form-label">短视频文案（视频号/抖音/快手）</label><textarea id="shortVideoCopy" class="textarea content-copy-area">${esc(hub.copies.shortVideo)}</textarea><button class="copy-inline" data-copy="shortVideoCopy">复制短视频文案</button></div><div class="form-group"><label class="form-label">小红书店铺标题</label><input id="storeTitleCopy" class="input" value="${esc(hub.copies.storeTitle)}"><div class="char-count"><span id="storeTitleCount">${hub.copies.storeTitle.length}</span> 字</div><button class="copy-inline" data-copy="storeTitleCopy">复制店铺标题</button></div><button id="saveCopies" class="btn block">保存文案</button></div>
      <div class="section-title">发布记录 <small>记录后自动计算下次重复发布时间</small></div><div class="card content-platform-list">${Object.entries(PLATFORM_CONFIG).map(([key,cfg])=>platformRow(p,hub,key,cfg)).join('')}</div>`;
      bindContentPage();
    };
    const syncHubFromFields=()=>{hub.copies={...hub.copies,moments:$('#momentsCopy')?.value||hub.copies.moments,xhsTitle:$('#xhsTitleCopy')?.value||hub.copies.xhsTitle,xhs:$('#xhsCopy')?.value||hub.copies.xhs,shortVideo:$('#shortVideoCopy')?.value||hub.copies.shortVideo,storeTitle:$('#storeTitleCopy')?.value||hub.copies.storeTitle};};
    const bindContentPage=()=>{
      $('#contentMediaInput').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;const status=$('#contentUploadStatus');for(let i=0;i<files.length;i++){const f=files[i];status.textContent=`正在上传 ${i+1}/${files.length}：${f.name}`;try{const result=await uploadMediaFile(f,p.id);p.media=[...mediaOf(p),{id:crypto.randomUUID(),type:result.type,name:f.name,mime:result.mime,size:f.size,url:result.url,createdAt:new Date().toISOString()}];if(result.type==='image'&&!p.image)p.image=result.url;await dbPut('products',p);}catch(err){showToast(err.message);}}status.textContent='素材上传完成';e.target.value='';await renderPage();};
      if($('#importLegacyCover'))$('#importLegacyCover').onclick=async()=>{try{const result=await importQinsilkImage(p.image,p.id);p.media=[...mediaOf(p),{id:crypto.randomUUID(),type:'image',name:'秦丝主图',mime:result.mime,size:result.size||0,url:result.url,createdAt:new Date().toISOString()}];p.image=result.url;await dbPut('products',p);showToast('主图已转存到自己的R2');await renderPage();}catch(err){showToast(err.message);}};
      $$('.set-cover').forEach(btn=>btn.onclick=async()=>{const m=mediaOf(p).find(x=>x.id===btn.dataset.id);if(!m)return;p.image=m.url;p.updatedAt=new Date().toISOString();await dbPut('products',p);showToast('封面已更新');await renderPage();});
      $$('.remove-media').forEach(btn=>btn.onclick=async()=>{const m=mediaOf(p).find(x=>x.id===btn.dataset.id);if(!m)return;if(!await confirmDialog('从该商品移除这份素材？已上传到自有R2的文件也会删除。'))return;try{await deleteMediaUrl(m.url);}catch(_){/* 引用仍会移除 */}p.media=mediaOf(p).filter(x=>x.id!==m.id);if(p.image===m.url)p.image=p.media.find(x=>x.type==='image')?.url||'';await dbPut('products',p);await renderPage();});
      $('#shareImages').onclick=async()=>{const list=mediaOf(p).filter(m=>m.type==='image');if(!list.length&&p.image&&!ownMediaUrl(p.image)){showToast('请先把秦丝外链主图转存到自己的R2');return;}await shareMediaList(list,p).catch(e=>showToast(e.message));};
      $('#shareVideos').onclick=async()=>shareMediaList(mediaOf(p).filter(m=>m.type==='video'),p).catch(e=>showToast(e.message));
      const exportRatio=async ratio=>{const list=mediaOf(p).filter(m=>m.type==='image');if(!list.length){showToast('请先上传自有图片');return;}const files=[];try{for(const m of list.slice(0,9))files.push(await cropFileFromMedia(m,ratio,ratio===.75?'xhs-store-3x4':'xhs-store-1x1'));await shareFiles(files,`${p.name} · 小红书店铺 ${ratio===.75?'3:4':'1:1'}`);}catch(e){showToast(e.message);}};
      $('#export34').onclick=()=>exportRatio(.75);$('#export11').onclick=()=>exportRatio(1);
      $('#agentShareCenter').onclick=()=>openAgentShareManager(p,hub).catch(e=>showToast(e.message));
      $$('.copy-inline').forEach(btn=>btn.onclick=()=>copyText($('#'+btn.dataset.copy).value));
      const updateCounts=()=>{$('#xhsTitleCount').textContent=$('#xhsTitleCopy').value.length;$('#storeTitleCount').textContent=$('#storeTitleCopy').value.length;};$('#xhsTitleCopy').oninput=updateCounts;$('#storeTitleCopy').oninput=updateCounts;
      $('#scanXhs').onclick=()=>{$('#xhsRiskBox').innerHTML=riskHTML($('#xhsTitleCopy').value+'\n'+$('#xhsCopy').value);};
      $('#regenCopies').onclick=async()=>{if(!await confirmDialog('用商品资料重新生成文案？你当前未保存的修改会被覆盖。'))return;hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);await renderPage();};
      $('#saveCopies').onclick=async()=>{syncHubFromFields();await saveProductContent(p,hub);showToast('文案已保存');$('#xhsRiskBox').innerHTML=riskHTML(hub.copies.xhsTitle+'\n'+hub.copies.xhs);};
      $$('.publish-prepare').forEach(btn=>btn.onclick=async()=>{syncHubFromFields();await saveProductContent(p,hub);const platform=btn.dataset.platform,cfg=PLATFORM_CONFIG[platform],text=cfg.copyKey==='xhs'?`${hub.copies.xhsTitle}\n${hub.copies.xhs}`:hub.copies[cfg.copyKey];await copyText(text);const list=platform==='moments'||platform==='xhs'?mediaOf(p).filter(m=>m.type==='image'):mediaOf(p).filter(m=>m.type==='video');if(list.length)await shareMediaList(list,p).catch(e=>showToast(e.message));else showToast('文案已复制；当前没有对应素材可分享');});
      $$('.mark-published').forEach(btn=>btn.onclick=async()=>{syncHubFromFields();const platform=btn.dataset.platform;hub.publishHistory[platform]=[...(hub.publishHistory[platform]||[]),{at:new Date().toISOString()}].slice(-50);await saveProductContent(p,hub);showToast(`已记录${PLATFORM_CONFIG[platform].label}发布时间`);await renderPage();});
      $$('.repeat-days').forEach(input=>input.onchange=async()=>{hub.repeatDays[input.dataset.platform]=Math.max(1,Number(input.value)||PLATFORM_CONFIG[input.dataset.platform].repeatDays);await saveProductContent(p,hub);showToast('重复发布周期已保存');});
    };
    await renderPage();
  }
  function platformRow(p,hub,key,cfg){const last=lastPublished(hub,key),days=daysSince(last),repeat=Number(hub.repeatDays[key]||cfg.repeatDays);return `<div class="content-platform-row"><div class="content-platform-main"><strong>${cfg.label}</strong><span>${last?`上次：${fmtDateTime(last)} · ${days}天前`:'尚未记录发布时间'}</span><span>${last&&days<repeat?`建议 ${repeat-days} 天后再次发布`:'现在可以发布/重新曝光'}</span></div><label class="repeat-field">周期<input class="repeat-days" data-platform="${key}" type="number" min="1" max="365" value="${repeat}">天</label><div class="content-platform-actions"><button class="btn secondary small publish-prepare" data-platform="${key}">复制+分享</button><button class="btn small mark-published" data-platform="${key}">标记已发</button></div></div>`;}
  window.renderContentHub=renderContentHub;
  window.renderProductContent=renderProductContent;
  window.MocuiContent={dueProducts,scanRisk,defaultCopies};
})();
