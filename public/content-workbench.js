'use strict';
(() => {
  const PLATFORM_CONFIG={
    moments:{label:'朋友圈',repeatDays:20,copyKey:'moments',media:'images'},
    xhs:{label:'小红书',repeatDays:30,copyKey:'xhs',media:'video'},
    douyin:{label:'抖音',repeatDays:30,copyKey:'shortVideo',media:'video'},
    kuaishou:{label:'快手',repeatDays:30,copyKey:'shortVideo',media:'video'},
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
      publishHistory:{moments:[],xhs:[],douyin:[],kuaishou:[],...(current.publishHistory||{})},
      repeatDays:{moments:20,xhs:30,douyin:30,kuaishou:30,...(current.repeatDays||{})},
      xhsTags:current.xhsTags&&typeof current.xhsTags==='object'?current.xhsTags:{items:[],updatedAt:''},
      agentShares:Array.isArray(current.agentShares)?current.agentShares:[],
      createdAt:current.createdAt||new Date().toISOString(),updatedAt:current.updatedAt||new Date().toISOString(),
    };
  };
  function productSpec(p){return cleanText(p.qinsilk?.size||p.size||'');}
  const XHS_TAG_POOL=[
    {tag:'#和田玉',group:'核心',heat:100,terms:['和田玉','玉石','白玉','碧玉','青玉','青花','晴水','糖玉']},
    {tag:'#和田玉手镯',group:'核心',heat:98,terms:['手镯','镯子','圆条','正圈','贵妃']},
    {tag:'#和田玉手串',group:'核心',heat:94,terms:['手串','手链','珠串','珠子']},
    {tag:'#和田玉吊坠',group:'核心',heat:93,terms:['吊坠','挂件','平安扣','佛','观音','无事牌','如意']},
    {tag:'#白玉手镯',group:'精准',heat:92,terms:['白玉','白镯','脂白','奶白','冷白']},
    {tag:'#碧玉手镯',group:'精准',heat:90,terms:['碧玉','菠菜绿','苹果绿']},
    {tag:'#晴水手镯',group:'精准',heat:88,terms:['晴水','湖水绿','浅绿晴']},
    {tag:'#糖白玉',group:'精准',heat:85,terms:['糖白','糖玉','糖色']},
    {tag:'#青花玉',group:'精准',heat:82,terms:['青花','墨色','黑白']},
    {tag:'#俄料和田玉',group:'产地',heat:87,terms:['俄料','俄罗斯料','俄白']},
    {tag:'#新疆和田玉',group:'产地',heat:96,terms:['新疆','且末','籽料','于田','若羌']},
    {tag:'#青海料',group:'产地',heat:84,terms:['青海','野牛沟','水透']},
    {tag:'#和田玉怎么选',group:'搜索',heat:97,terms:['怎么选','挑选','选择','预算','白度','细度','油性','结构','值不值']},
    {tag:'#和田玉鉴别',group:'搜索',heat:95,terms:['鉴别','真假','辨别','毛孔','结构','产地','避坑']},
    {tag:'#手镯怎么选',group:'搜索',heat:94,terms:['手镯','圈口','白度','细度','预算','黑点','水线']},
    {tag:'#玉石分享',group:'泛兴趣',heat:78,terms:['实拍','分享','上手','自然光','细节']},
    {tag:'#玉石搭配',group:'场景',heat:76,terms:['搭配','穿搭','日常佩戴','通勤']},
    {tag:'#送礼推荐',group:'场景',heat:75,terms:['送礼','礼物','生日','长辈']},
  ];
  function xhsContext(p,extra=''){
    return `${p.name||''} ${p.category||''} ${p.color||''} ${p.note||''} ${productSpec(p)} ${extra||''}`.replace(/\s+/g,' ').trim();
  }
  function analyzeXhsTags(p,extra=''){
    const text=xhsContext(p,extra), scored=[];
    for(const row of XHS_TAG_POOL){
      let hits=0;for(const term of row.terms){if(text.includes(term))hits++;}
      if(!hits&&row.tag!=='#和田玉')continue;
      const relevance=row.tag==='#和田玉'?68:Math.min(100,50+hits*18);
      const score=Math.round(relevance*.68+row.heat*.32);
      scored.push({...row,relevance,score});
    }
    const must=[];
    const pushTag=tag=>{const r=scored.find(x=>x.tag===tag);if(r&&!must.some(x=>x.tag===tag))must.push(r);};
    pushTag('#和田玉');
    if(/手镯|镯子|圆条|正圈|贵妃/.test(text))pushTag('#和田玉手镯');
    else if(/手串|手链|珠串/.test(text))pushTag('#和田玉手串');
    else if(/吊坠|挂件|平安扣|佛|观音|无事牌|如意/.test(text))pushTag('#和田玉吊坠');
    const rest=scored.filter(x=>!must.some(m=>m.tag===x.tag)).sort((a,b)=>b.score-a.score);
    return [...must,...rest].slice(0,6);
  }
  function stripHashtags(text){
    return String(text||'').split(/\n/).map(line=>line.replace(/(?:^|\s)#[^#\s]+/g,' ').replace(/\s{2,}/g,' ').trim()).filter(Boolean).join('\n');
  }
  function applyXhsTagOptimization(p,hub,title,body){
    const rows=analyzeXhsTags(p,`${title||''} ${body||''}`), tags=rows.map(x=>x.tag).join(' ');
    const base=stripHashtags(body);
    return {title:String(title||'').slice(0,38),body:[base,tags].filter(Boolean).join('\n'),rows};
  }
  function xhsTagsHTML(rows){
    if(!rows?.length)return '<span class="item-meta">暂无匹配标签</span>';
    return rows.map(r=>`<span class="xhs-tag-chip"><b>${esc(r.tag)}</b><small>${esc(r.group)}</small></span>`).join('');
  }
  function topicTags(p){return analyzeXhsTags(p).map(x=>x.tag);}
  function defaultCopies(p){
    const spec=productSpec(p), color=cleanText(p.color), cat=cleanText(p.category), tags=topicTags(p).join(' ');
    const facts=[spec&&`规格：${spec}`,color&&`颜色：${color}`,cat&&`品类：${cat}`].filter(Boolean);
    const moments=[p.name,facts.join('｜'),'今天实拍的一件，图片和视频都是同一件货。喜欢这类风格可以重点看整体颜色、细节和上手效果。'].filter(Boolean).join('\n');
    const xhsTitle=( `${p.name}${spec?`｜${spec}`:''} 实拍分享` ).slice(0,38);
    const xhs=[`今天整理到这件${p.name}。`,facts.length?facts.join('，')+'。':'',`我更建议先看整体协调感，再看细节、结构和预算是否匹配。天然材质存在个体差异，图片与视频尽量按实拍记录。`,tags].filter(Boolean).join('\n');
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
  function downloadProgressHTML(label='正在准备素材'){
    return `<div class="download-progress-wrap"><div class="download-progress-ring" style="--p:0"><div><strong id="downloadProgressPct">0%</strong></div></div><strong id="downloadProgressLabel">${esc(label)}</strong><span id="downloadProgressMeta">正在读取素材…</span></div>`;
  }
  function setDownloadProgress(percent,label='',meta=''){
    const ring=$('.download-progress-ring');if(ring)ring.style.setProperty('--p',Math.max(0,Math.min(100,Math.round(percent))));
    if($('#downloadProgressPct'))$('#downloadProgressPct').textContent=`${Math.round(percent)}%`;
    if(label&&$('#downloadProgressLabel'))$('#downloadProgressLabel').textContent=label;
    if(meta&&$('#downloadProgressMeta'))$('#downloadProgressMeta').textContent=meta;
  }
  async function fetchFileWithProgress(url,name,typeHint='',onProgress=()=>{}){
    const res=await fetch(url,{credentials:'same-origin'});if(!res.ok)throw new Error('素材读取失败');
    const total=Number(res.headers.get('content-length')||0);if(!res.body||!res.body.getReader){const blob=await res.blob();onProgress(1);return new File([blob],name,{type:blob.type||typeHint||'application/octet-stream'});}
    const reader=res.body.getReader(),chunks=[];let loaded=0;while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;onProgress(total?Math.min(1,loaded/total):0);}
    const blob=new Blob(chunks,{type:res.headers.get('content-type')||typeHint||'application/octet-stream'});onProgress(1);return new File([blob],name,{type:blob.type});
  }
  function triggerBrowserDownload(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  async function prepareDownload(list,p,{store11=false,title='商品素材'}={}){
    if(!list.length){showToast('暂无可下载素材');return;}
    openModal('下载素材',downloadProgressHTML('正在准备下载'),{dismissible:false});
    try{
      const files=[];for(let i=0;i<list.length;i++){
        const m=list[i];const base=i/list.length,span=1/list.length;setDownloadProgress(base*100,'正在准备下载',`${i+1}/${list.length} ${m.name||'素材'}`);
        let f;if(store11){setDownloadProgress((base+.1*span)*100,'正在生成店铺 1:1',`${i+1}/${list.length}`);f=await fitFileFromMedia(m,1,'xhs-store-1x1');setDownloadProgress((base+span)*100);}else f=await fetchFileWithProgress(m.url,m.name||`${p.code||'mocui'}-${i+1}.${m.type==='video'?'mp4':'jpg'}`,m.mime||'',x=>setDownloadProgress((base+x*span)*100,'正在下载素材',`${i+1}/${list.length}`));
        files.push(f);
      }
      setDownloadProgress(100,'下载准备完成','正在保存文件…');files.forEach(triggerBrowserDownload);setTimeout(()=>{closeModal();showToast('下载完成');},450);
      return files;
    }catch(e){closeModal();showToast(e.message);throw e;}
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
  async function fitFileFromMedia(m,ratio,prefix){
    const response=await fetch(m.url,{credentials:'same-origin'});if(!response.ok)throw new Error('图片读取失败');const blob=await response.blob();const src=URL.createObjectURL(blob);
    try{
      const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(new Error('图片解码失败'));el.src=src;});
      const outW=1080,outH=Math.round(outW/ratio),canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;const ctx=canvas.getContext('2d');
      const sample=document.createElement('canvas');sample.width=24;sample.height=24;const sx=sample.getContext('2d');sx.drawImage(img,0,0,24,24);let data;try{data=sx.getImageData(0,0,24,24).data;}catch{data=null;}
      let r=247,g=247,b=247,count=0;if(data){r=g=b=0;const edge=5;for(let y=0;y<24;y++){for(let x=0;x<24;x++){if(x>=edge&&x<24-edge&&y>=edge&&y<24-edge)continue;const i=(y*24+x)*4;r+=data[i];g+=data[i+1];b+=data[i+2];count++;}}if(count){r=Math.round(r/count);g=Math.round(g/count);b=Math.round(b/count);}}
      const soften=v=>Math.round(v*.38+255*.62);ctx.fillStyle=`rgb(${soften(r)},${soften(g)},${soften(b)})`;ctx.fillRect(0,0,outW,outH);
      const pad=Math.round(Math.min(outW,outH)*.025),scale=Math.min((outW-pad*2)/img.naturalWidth,(outH-pad*2)/img.naturalHeight),dw=Math.round(img.naturalWidth*scale),dh=Math.round(img.naturalHeight*scale),dx=Math.round((outW-dw)/2),dy=Math.round((outH-dh)/2);
      ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight,dx,dy,dw,dh);
      const out=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));return new File([out],`${prefix}-${m.name||'image'}.jpg`,{type:'image/jpeg'});
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
  function relativePublished(hub,platform){
    const last=lastPublished(hub,platform);if(!last)return '未发';const days=daysSince(last);if(days<=0)return '今天';if(days===1)return '昨天';return `${days}天前`;
  }
  function latestActivityAt(p){
    const mediaDates=mediaOf(p).map(m=>new Date(m.createdAt||0).getTime()).filter(Number.isFinite), base=new Date(p.updatedAt||p.createdAt||0).getTime();return Math.max(base||0,...mediaDates,0);
  }
  async function recordShareTime(p,hub,platform){
    const at=new Date().toISOString();hub.publishHistory[platform]=[...(hub.publishHistory[platform]||[]),{at,source:'share'}].slice(-80);await saveProductContent(p,hub);return at;
  }
  function mediaForPlatform(p,platform){
    const media=mediaOf(p);if(platform==='moments')return media.filter(m=>m.type==='image');if(['xhs','douyin','kuaishou'].includes(platform))return media.filter(m=>m.type==='video').slice(0,1);return [];
  }
  async function executePlatformShare(p,hub,platform){
    const cfg=PLATFORM_CONFIG[platform];if(!cfg)return;
    if(platform==='xhs'){
      const optimized=applyXhsTagOptimization(p,hub,hub.copies.xhsTitle,hub.copies.xhs);hub.copies.xhsTitle=optimized.title;hub.copies.xhs=optimized.body;hub.xhsTags={items:optimized.rows,updatedAt:new Date().toISOString()};
    }
    const list=mediaForPlatform(p,platform), text=cfg.copyKey==='xhs'?`${hub.copies.xhsTitle}\n${hub.copies.xhs}`:hub.copies[cfg.copyKey];
    await saveProductContent(p,hub);await copyText(text||'');
    if(!list.length){showToast(platform==='moments'?'文案已复制；请先上传自有原图':'文案已复制；请先上传该商品原视频');return;}
    await recordShareTime(p,hub,platform);
    if(platform==='moments'){
      showToast('朋友圈文案已复制，时间已记录');
      await prepareDownload(list,p,{title:'朋友圈原图'}).catch(()=>{});return;
    }
    showToast(`${cfg.label}文案已复制，分享时间已记录`);
    await shareMediaList(list,p).catch(e=>showToast(e.message));
  }
  async function storeFitFiles(p,ratio){
    const list=mediaOf(p).filter(m=>m.type==='image');if(!list.length)throw new Error('请先上传自有图片');const files=[];for(const m of list.slice(0,9))files.push(await fitFileFromMedia(m,ratio,ratio===.75?'xhs-store-3x4':'xhs-store-1x1'));return files;
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
  function feedCard(p){
    const hub=contentOf(p), videos=mediaOf(p).filter(m=>m.type==='video'), moments=relativePublished(hub,'moments'), xhs=relativePublished(hub,'xhs'), dueM=dueState(p,'moments').due, dueX=dueState(p,'xhs').due, hasShared=Boolean(lastPublished(hub,'moments')||lastPublished(hub,'xhs'));
    const preview=(hub.copies.moments||defaultCopies(p).moments).split('\n').filter(Boolean)[0]||'';
    return `<article class="workbench-product-card" data-id="${esc(p.id)}"><div class="workbench-product-row"><div class="workbench-thumb">${p.image?`<img src="${esc(p.image)}" alt="">`:'<span>玉</span>'}${videos.length?'<i class="workbench-play">▶</i>':''}</div><div class="workbench-product-main"><strong>${esc(p.name)}</strong><span>${esc(p.code||'')} · ${productMediaSummary(p)}</span>${Number(p.salePrice)>0?`<b>${fmtMoney(p.salePrice)}</b>`:''}<small>${esc(preview)}</small></div><button class="workbench-share-main" data-action="share" data-id="${esc(p.id)}">${hasShared&&(dueM||dueX)?'重发':'分享'}</button></div><div class="workbench-status"><span class="${dueM?'due':''}">朋友圈 ${moments}</span><span class="${dueX?'due':''}">小红书 ${xhs}</span></div><div class="workbench-actions"><button data-action="download" data-id="${esc(p.id)}">下载</button><button data-action="copy" data-id="${esc(p.id)}">文案</button><button data-action="edit" data-id="${esc(p.id)}">编辑</button><button data-action="share" data-id="${esc(p.id)}">分享</button></div></article>`;
  }
  function historyCards(products){
    const rows=[];for(const p of products){const hub=contentOf(p);for(const key of Object.keys(PLATFORM_CONFIG)){for(const evt of hub.publishHistory[key]||[]){const at=new Date(evt.at||evt);if(!Number.isNaN(at.getTime()))rows.push({p,key,at});}}}rows.sort((a,b)=>b.at-a.at);return rows.slice(0,120).map(row=>`<div class="workbench-history-row"><div class="workbench-history-thumb">${row.p.image?`<img src="${esc(row.p.image)}" alt="">`:'玉'}</div><div><strong>${esc(row.p.name)}</strong><span>${PLATFORM_CONFIG[row.key]?.label||row.key} · ${fmtDateTime(row.at)}</span></div><button class="workbench-open" data-id="${esc(row.p.id)}">›</button></div>`).join('')||emptyState('◷','还没有分享记录','从内容工作台发起分享后会自动记录时间');
  }
  async function openWorkbenchDownload(p){
    openModal('下载素材',`<div class="workbench-sheet-product"><strong>${esc(p.name)}</strong><span>原图原视频不裁切；店铺图只保留 1:1</span></div><div class="workbench-sheet-grid three"><button id="wbDlImages"><i>图</i><strong>全部原图</strong><span>朋友圈 / 代理</span></button><button id="wbDlVideo"><i>▶</i><strong>原视频</strong><span>原画质</span></button><button id="wbDl11"><i>1:1</i><strong>店铺 1:1</strong><span>完整构图适配</span></button></div><div class="item-meta" style="margin-top:10px">iPhone 网页下载会进入系统“下载”流程；纯 PWA 不能静默写入“照片”相册。</div>`,{onOpen:()=>{
      $('#wbDlImages').onclick=async()=>{closeModal();await prepareDownload(mediaOf(p).filter(m=>m.type==='image'),p,{title:'全部原图'}).catch(()=>{});};
      $('#wbDlVideo').onclick=async()=>{closeModal();await prepareDownload(mediaOf(p).filter(m=>m.type==='video').slice(0,1),p,{title:'原视频'}).catch(()=>{});};
      $('#wbDl11').onclick=async()=>{closeModal();await prepareDownload(mediaOf(p).filter(m=>m.type==='image').slice(0,9),p,{store11:true,title:'店铺1:1'}).catch(()=>{});};
    }});
  }
  async function openWorkbenchCopy(p){
    const hub=contentOf(p);if(!Object.values(hub.copies).some(Boolean)){hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);}const opt=applyXhsTagOptimization(p,hub,hub.copies.xhsTitle,hub.copies.xhs);
    openModal('复制文案',`<div class="workbench-copy-list"><button id="wbCopyMoments"><strong>朋友圈文案</strong><span>${esc((hub.copies.moments||'').slice(0,70))}</span></button><button id="wbCopyXhs"><strong>小红书标题 + 正文 + 标签</strong><span>${esc(opt.title)}</span></button><button id="wbCopyAgent"><strong>代理转发文案</strong><span>${esc((hub.copies.agent||hub.copies.moments||'').slice(0,70))}</span></button></div>`,{onOpen:()=>{
      $('#wbCopyMoments').onclick=()=>copyText(hub.copies.moments);$('#wbCopyXhs').onclick=()=>copyText(`${opt.title}\n${opt.body}`);$('#wbCopyAgent').onclick=()=>copyText(hub.copies.agent||hub.copies.moments);
    }});
  }
  async function openWorkbenchShare(p){
    const hub=contentOf(p);if(!Object.values(hub.copies).some(Boolean)){hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);}const opt=applyXhsTagOptimization(p,hub,hub.copies.xhsTitle,hub.copies.xhs);hub.xhsTags={items:opt.rows,updatedAt:new Date().toISOString()};
    openModal('分享',`<div class="workbench-sheet-product"><strong>${esc(p.name)}</strong><span>点击平台会先复制对应文案，并自动记录本次分享时间</span></div><div class="platform-share-grid"><button data-p="moments"><i class="platform-moments">朋</i><strong>朋友圈</strong><span>复制文案 + 下载原图</span></button><button data-p="xhs"><i class="platform-xhs">薯</i><strong>小红书</strong><span>原视频 + 热门标签</span></button><button data-p="douyin"><i class="platform-douyin">抖</i><strong>抖音</strong><span>原视频 + 文案</span></button><button data-p="kuaishou"><i class="platform-kuaishou">快</i><strong>快手</strong><span>原视频 + 文案</span></button><button id="wbAgentShare"><i class="platform-agent">代</i><strong>代理转图</strong><span>安全分享链接</span></button><button id="wbSaveOriginal"><i class="platform-save">↓</i><strong>保存原图</strong><span>不裁切</span></button></div><div class="notice"><strong>朋友圈视频 / 视频号：</strong>继续用秒剪发布，本工作台不重复记录。</div>`,{onOpen:()=>{
      $$('.platform-share-grid [data-p]').forEach(btn=>btn.onclick=async()=>{const platform=btn.dataset.p;closeModal();await executePlatformShare(p,hub,platform);});
      $('#wbAgentShare').onclick=()=>{closeModal();setTimeout(()=>openAgentShareManager(p,hub).catch(e=>showToast(e.message)),60);};
      $('#wbSaveOriginal').onclick=async()=>{closeModal();await prepareDownload(mediaOf(p).filter(m=>m.type==='image'),p,{title:'全部原图'}).catch(()=>{});};
    }});
  }
  function openWorkbenchAdd(){
    openModal('添加到内容工作台',`<div class="workbench-copy-list"><button id="wbChooseExisting"><strong>选择已有商品</strong><span>从当前库存商品中选择，然后上传今天的新图和视频</span></button><button id="wbCreateProduct"><strong>新增商品</strong><span>没有商品档案时先新建商品</span></button></div>`,{onOpen:()=>{
      $('#wbChooseExisting').onclick=()=>{closeModal();setTimeout(()=>openProductSelector([],rows=>{if(!rows.length)return;if(rows.length>1){showToast('一次请选择1个商品');return;}navigate('product-content',{id:rows[0].id});}),50);};
      $('#wbCreateProduct').onclick=()=>{closeModal();setTimeout(()=>openProductForm(),50);};
    }});
  }
  async function renderContentHub(){
    setHeader('内容工作台','商品流 · 分享 · 重复曝光',{label:'＋',onClick:openWorkbenchAdd});const products=(await dbAll('products')).filter(p=>Number(p.stock)>0), byId=new Map(products.map(p=>[p.id,p]));let tab='products',filter='all',query='',limit=80;
    const queueRows=[...dueProducts(products,'moments'),...dueProducts(products,'xhs')],queueMap=new Map();for(const row of queueRows){const old=queueMap.get(row.p.id);if(!old||row.score>old.score)queueMap.set(row.p.id,row);}const todayIds=new Set([...queueMap.values()].sort((a,b)=>b.score-a.score||latestActivityAt(b.p)-latestActivityAt(a.p)).slice(0,10).map(x=>x.p.id));
    $('#main').innerHTML=`<div class="workbench-tabs"><button class="active" data-tab="products">产品</button><button data-tab="history">发布记录</button></div><div id="workbenchProductTools"><div class="workbench-search-row"><div class="search-wrap"><span>⌕</span><input id="workbenchSearch" class="input" placeholder="搜索名称、货号、颜色"></div><button id="workbenchFilterBtn" class="filter-square">筛</button></div><div class="workbench-filter-chips"><button class="active" data-filter="all">全部</button><button data-filter="due">今日推荐</button><button data-filter="moments">朋友圈20天+</button><button data-filter="xhs">小红书30天+</button><button data-filter="video">有视频</button></div><div class="workbench-quick-count"><span>库存商品 <b>${products.length}</b></span><span>今日推荐 <b>${todayIds.size}</b></span></div></div><div id="workbenchBody"></div>`;
    const draw=()=>{
      const body=$('#workbenchBody'),tools=$('#workbenchProductTools');if(tab==='history'){tools.classList.add('hidden');body.innerHTML=`<div class="section-title compact">最近分享记录</div><div class="workbench-history-list">${historyCards(products)}</div>`;$$('.workbench-open').forEach(btn=>btn.onclick=()=>navigate('product-content',{id:btn.dataset.id}));return;}
      tools.classList.remove('hidden');let rows=[...products];const q=query.trim().toLowerCase();if(q)rows=rows.filter(p=>[p.name,p.code,p.color,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
      if(filter==='due')rows=rows.filter(p=>todayIds.has(p.id));if(filter==='moments')rows=rows.filter(p=>dueState(p,'moments').due);if(filter==='xhs')rows=rows.filter(p=>dueState(p,'xhs').due);if(filter==='video')rows=rows.filter(p=>mediaOf(p).some(m=>m.type==='video'));
      rows.sort((a,b)=>{const ad=todayIds.has(a.id)?1:0,bd=todayIds.has(b.id)?1:0;return bd-ad||latestActivityAt(b)-latestActivityAt(a);});
      const visible=rows.slice(0,limit),due=(filter==='all'&&!q)?visible.filter(p=>todayIds.has(p.id)):[],rest=visible.filter(p=>!due.includes(p));body.innerHTML=`${due.length?`<div class="workbench-group-title"><strong>今日推荐</strong><span>${due.length}件</span></div>${due.map(feedCard).join('')}`:''}${rest.length?`<div class="workbench-group-title"><strong>${q||filter!=='all'?'筛选结果':'最近商品'}</strong><span>${rest.length}件</span></div>${rest.map(feedCard).join('')}`:''}${!visible.length?emptyState('⌕','没有符合条件的商品'):''}${rows.length>limit?'<button id="workbenchLoadMore" class="btn secondary block">加载更多</button>':''}`;
      if($('#workbenchLoadMore'))$('#workbenchLoadMore').onclick=()=>{limit+=80;draw();};
      $$('.workbench-product-card [data-action]').forEach(btn=>btn.onclick=async e=>{e.stopPropagation();const p=byId.get(btn.dataset.id);if(!p)return;const action=btn.dataset.action;if(action==='edit')navigate('product-content',{id:p.id});else if(action==='download')await openWorkbenchDownload(p);else if(action==='copy')await openWorkbenchCopy(p);else if(action==='share')await openWorkbenchShare(p);});
    };
    $$('.workbench-tabs button').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;$$('.workbench-tabs button').forEach(x=>x.classList.toggle('active',x===btn));draw();});
    $('#workbenchSearch').oninput=e=>{query=e.target.value;limit=80;draw();};
    $$('.workbench-filter-chips button').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.filter;$$('.workbench-filter-chips button').forEach(x=>x.classList.toggle('active',x===btn));limit=80;draw();});
    $('#workbenchFilterBtn').onclick=()=>{filter=filter==='all'?'due':'all';$$('.workbench-filter-chips button').forEach(x=>x.classList.toggle('active',x.dataset.filter===filter));draw();};draw();
  }
  async function renderProductContent(){
    const p=await dbGet('products',appState.params.id);if(!p){showToast('商品不存在');return navigate('products');}setHeader('素材与发布',`${p.name} · ${p.code}`);
    let hub=contentOf(p);if(!Object.values(hub.copies).some(Boolean)){hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);}
    const renderPage=async()=>{
      const media=mediaOf(p),images=media.filter(m=>m.type==='image'),videos=media.filter(m=>m.type==='video'),externalCover=p.image&&!ownMediaUrl(p.image)&&!media.some(m=>m.url===p.image);
      $('#main').innerHTML=`<div class="content-product-head"><div class="content-product-cover">${p.image?`<img src="${esc(p.image)}" alt="">`:'玉'}</div><div><strong>${esc(p.name)}</strong><span>${esc(p.code)} · 库存 ${fmtInt(p.stock)}</span><span>${productMediaSummary(p)}</span></div></div>
      <div class="section-title">产品素材与发布 <small>像发朋友圈一样：先选素材，再粘贴文案</small></div><div class="card moments-compose-card"><div class="moments-compose-head"><strong>${esc(p.name)}</strong><span>${esc(p.code)} · 库存 ${fmtInt(p.stock)}</span></div><label class="moments-upload-button" for="contentMediaInput"><span>＋</span><strong>上传图片 / 视频</strong><small>支持多选</small></label><input id="contentMediaInput" class="hidden" type="file" accept="image/*,video/*" multiple><div id="contentUploadStatus" class="item-meta moments-upload-status"></div>${externalCover?`<div class="notice warn" style="margin-top:10px">当前主图来自秦丝外链。<button id="importLegacyCover" class="link-button">转存到自己的R2素材库</button></div>`:''}<div class="content-media-grid moments-media-grid">${media.map(m=>mediaCard(m,p)).join('')||emptyState('▧','还没有素材','点击上方“上传图片 / 视频”')}</div><div class="moments-copy-box"><label>朋友圈文案</label><textarea id="momentsCopy" class="textarea content-copy-area" placeholder="把今天的朋友圈文案直接粘贴在这里">${esc(hub.copies.moments)}</textarea><button class="copy-inline" data-copy="momentsCopy">复制文案</button></div><div class="content-media-tools three"><button id="shareImages" class="btn secondary">下载原图</button><button id="shareVideos" class="btn secondary">下载原视频</button><button id="export11" class="btn secondary">店铺 1:1</button></div><div class="item-meta">原图/原视频始终保留；店铺图只生成 1:1 完整构图适配副本。</div><button id="agentShareCenter" class="btn block agent-share-entry">生成代理素材分享链接</button></div>
      <div class="section-title">文案助手 <small>第一期使用本地模板，可手动修改</small></div><div class="card"><div class="btn-row"><button id="regenCopies" class="btn secondary small">根据商品重新生成</button><button id="scanXhs" class="btn secondary small">检测小红书风险词</button></div><div class="form-group"><label class="form-label">小红书标题</label><input id="xhsTitleCopy" class="input" value="${esc(hub.copies.xhsTitle)}"><div class="char-count"><span id="xhsTitleCount">${hub.copies.xhsTitle.length}</span> 字</div></div><div class="form-group"><label class="form-label">小红书正文 + 话题</label><textarea id="xhsCopy" class="textarea content-copy-area tall">${esc(hub.copies.xhs)}</textarea><button class="copy-inline" data-copy="xhsCopy">复制小红书文案</button><div id="xhsRiskBox">${riskHTML(hub.copies.xhsTitle+'\n'+hub.copies.xhs)}</div><div class="xhs-tag-panel"><div><strong>相关热门标签</strong><button id="refreshXhsTags" class="link-button">重新分析</button></div><div id="xhsTagChips" class="xhs-tag-chips">${xhsTagsHTML(analyzeXhsTags(p,hub.copies.xhsTitle+' '+hub.copies.xhs))}</div><small>根据商品资料和当前文案自动匹配；优先相关性，不硬蹭无关热点。</small></div></div><div class="form-group"><label class="form-label">短视频文案（抖音/快手）</label><textarea id="shortVideoCopy" class="textarea content-copy-area">${esc(hub.copies.shortVideo)}</textarea><button class="copy-inline" data-copy="shortVideoCopy">复制短视频文案</button></div><div class="form-group"><label class="form-label">小红书店铺标题</label><input id="storeTitleCopy" class="input" value="${esc(hub.copies.storeTitle)}"><div class="char-count"><span id="storeTitleCount">${hub.copies.storeTitle.length}</span> 字</div><button class="copy-inline" data-copy="storeTitleCopy">复制店铺标题</button></div><button id="saveCopies" class="btn block">保存文案</button></div>
      <div class="section-title">分享记录 <small>点击平台分享后自动记录，无需再点“已发”</small></div><div class="card content-platform-list">${Object.entries(PLATFORM_CONFIG).map(([key,cfg])=>platformRow(p,hub,key,cfg)).join('')}</div>`;
      bindContentPage();
    };
    const syncHubFromFields=()=>{hub.copies={...hub.copies,moments:$('#momentsCopy')?.value||hub.copies.moments,xhsTitle:$('#xhsTitleCopy')?.value||hub.copies.xhsTitle,xhs:$('#xhsCopy')?.value||hub.copies.xhs,shortVideo:$('#shortVideoCopy')?.value||hub.copies.shortVideo,storeTitle:$('#storeTitleCopy')?.value||hub.copies.storeTitle};};
    const bindContentPage=()=>{
      $('#contentMediaInput').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;const status=$('#contentUploadStatus');for(let i=0;i<files.length;i++){const f=files[i];status.textContent=`正在上传 ${i+1}/${files.length}：${f.name}`;try{const result=await uploadMediaFile(f,p.id);p.media=[...mediaOf(p),{id:crypto.randomUUID(),type:result.type,name:f.name,mime:result.mime,size:f.size,url:result.url,createdAt:new Date().toISOString()}];if(result.type==='image'&&!p.image)p.image=result.url;await dbPut('products',p);}catch(err){showToast(err.message);}}status.textContent='素材上传完成';e.target.value='';await renderPage();};
      if($('#importLegacyCover'))$('#importLegacyCover').onclick=async()=>{try{const result=await importQinsilkImage(p.image,p.id);p.media=[...mediaOf(p),{id:crypto.randomUUID(),type:'image',name:'秦丝主图',mime:result.mime,size:result.size||0,url:result.url,createdAt:new Date().toISOString()}];p.image=result.url;await dbPut('products',p);showToast('主图已转存到自己的R2');await renderPage();}catch(err){showToast(err.message);}};
      $$('.set-cover').forEach(btn=>btn.onclick=async()=>{const m=mediaOf(p).find(x=>x.id===btn.dataset.id);if(!m)return;p.image=m.url;p.updatedAt=new Date().toISOString();await dbPut('products',p);showToast('封面已更新');await renderPage();});
      $$('.remove-media').forEach(btn=>btn.onclick=async()=>{const m=mediaOf(p).find(x=>x.id===btn.dataset.id);if(!m)return;if(!await confirmDialog('从该商品移除这份素材？已上传到自有R2的文件也会删除。'))return;try{await deleteMediaUrl(m.url);}catch(_){/* 引用仍会移除 */}p.media=mediaOf(p).filter(x=>x.id!==m.id);if(p.image===m.url)p.image=p.media.find(x=>x.type==='image')?.url||'';await dbPut('products',p);await renderPage();});
      $('#shareImages').onclick=async()=>{const list=mediaOf(p).filter(m=>m.type==='image');if(!list.length&&p.image&&!ownMediaUrl(p.image)){showToast('请先把秦丝外链主图转存到自己的R2');return;}await prepareDownload(list,p,{title:'全部原图'}).catch(()=>{});};
      $('#shareVideos').onclick=async()=>prepareDownload(mediaOf(p).filter(m=>m.type==='video'),p,{title:'原视频'}).catch(()=>{});
      $('#export11').onclick=async()=>prepareDownload(mediaOf(p).filter(m=>m.type==='image').slice(0,9),p,{store11:true,title:'店铺1:1'}).catch(()=>{});
      $('#agentShareCenter').onclick=()=>openAgentShareManager(p,hub).catch(e=>showToast(e.message));
      $$('.copy-inline').forEach(btn=>btn.onclick=()=>copyText($('#'+btn.dataset.copy).value));
      const updateCounts=()=>{$('#xhsTitleCount').textContent=$('#xhsTitleCopy').value.length;$('#storeTitleCount').textContent=$('#storeTitleCopy').value.length;};$('#xhsTitleCopy').oninput=updateCounts;$('#storeTitleCopy').oninput=updateCounts;
      $('#scanXhs').onclick=()=>{$('#xhsRiskBox').innerHTML=riskHTML($('#xhsTitleCopy').value+'\n'+$('#xhsCopy').value);};
      $('#refreshXhsTags').onclick=async()=>{syncHubFromFields();const optimized=applyXhsTagOptimization(p,hub,$('#xhsTitleCopy').value,$('#xhsCopy').value);$('#xhsTitleCopy').value=optimized.title;$('#xhsCopy').value=optimized.body;hub.copies.xhsTitle=optimized.title;hub.copies.xhs=optimized.body;hub.xhsTags={items:optimized.rows,updatedAt:new Date().toISOString()};$('#xhsTagChips').innerHTML=xhsTagsHTML(optimized.rows);updateCounts();await saveProductContent(p,hub);showToast('已按商品和当前文案匹配相关标签');};
      $('#regenCopies').onclick=async()=>{if(!await confirmDialog('用商品资料重新生成文案？你当前未保存的修改会被覆盖。'))return;hub.copies={...hub.copies,...defaultCopies(p)};await saveProductContent(p,hub);await renderPage();};
      $('#saveCopies').onclick=async()=>{syncHubFromFields();await saveProductContent(p,hub);showToast('文案已保存');$('#xhsRiskBox').innerHTML=riskHTML(hub.copies.xhsTitle+'\n'+hub.copies.xhs);};
      $$('.publish-prepare').forEach(btn=>btn.onclick=async()=>{syncHubFromFields();await executePlatformShare(p,hub,btn.dataset.platform);await renderPage();});
      $$('.repeat-days').forEach(input=>input.onchange=async()=>{hub.repeatDays[input.dataset.platform]=Math.max(1,Number(input.value)||PLATFORM_CONFIG[input.dataset.platform].repeatDays);await saveProductContent(p,hub);showToast('重复发布周期已保存');});
    };
    await renderPage();
  }
  function platformRow(p,hub,key,cfg){const last=lastPublished(hub,key),days=daysSince(last),repeat=Number(hub.repeatDays[key]||cfg.repeatDays);return `<div class="content-platform-row"><div class="content-platform-main"><strong>${cfg.label}</strong><span>${last?`最近分享：${fmtDateTime(last)} · ${days}天前`:'尚未记录分享时间'}</span><span>${last&&days<repeat?`建议 ${repeat-days} 天后再次曝光`:'现在可以发布/重新曝光'}</span></div><label class="repeat-field">周期<input class="repeat-days" data-platform="${key}" type="number" min="1" max="365" value="${repeat}">天</label><div class="content-platform-actions one"><button class="btn small publish-prepare" data-platform="${key}">复制文案 + 分享素材</button></div></div>`;}
  window.renderContentHub=renderContentHub;
  window.renderProductContent=renderProductContent;
  window.MocuiContent={dueProducts,scanRisk,defaultCopies,analyzeXhsTags,applyXhsTagOptimization};
})();
