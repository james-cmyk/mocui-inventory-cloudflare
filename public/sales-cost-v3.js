'use strict';
(() => {
  const VERSION='3.13.0',MAX_SIDE=320,QUALITY=.74;
  const running=new Set(),queued=new Set(),queue=[];
  let working=false,syncTimer=null,io=null;

  window.MocuiSalesCostV3={version:'3.12.0',integratedIntoCore:true};

  function escAttr(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function supported(src){const s=String(src||'');return /^data:image\//i.test(s)||/^\/api\/media\//.test(s)||/^https?:\/\//i.test(s);}
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>window.CloudSync?.schedule?.(),1200);}

  async function sourceBlob(src){
    const res=await fetch(src,{credentials:'same-origin',cache:'force-cache'});
    if(!res.ok)throw new Error(`源图读取失败 ${res.status}`);
    const blob=await res.blob();
    if(!String(blob.type||'').startsWith('image/'))throw new Error('源文件不是图片');
    return blob;
  }
  async function decode(blob){
    if('createImageBitmap' in window){try{return await createImageBitmap(blob);}catch(_){}}
    const url=URL.createObjectURL(blob);
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>{resolve(img);setTimeout(()=>URL.revokeObjectURL(url),0);};
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片解码失败'));};
      img.src=url;
    });
  }
  function toBlob(canvas){
    return new Promise(resolve=>{
      canvas.toBlob(blob=>{
        if(blob)return resolve(blob);
        canvas.toBlob(resolve,'image/jpeg',.76);
      },'image/webp',QUALITY);
    });
  }
  async function makeThumb(src){
    const blob=await sourceBlob(src),img=await decode(blob);
    const w=Number(img.width||img.naturalWidth||1),h=Number(img.height||img.naturalHeight||1);
    const scale=Math.min(1,MAX_SIDE/Math.max(w,h)),tw=Math.max(1,Math.round(w*scale)),th=Math.max(1,Math.round(h*scale));
    const canvas=document.createElement('canvas');canvas.width=tw;canvas.height=th;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,tw,th);ctx.drawImage(img,0,0,w,h,0,0,tw,th);
    try{img.close?.();}catch(_){}
    const out=await toBlob(canvas);if(!out)throw new Error('缩略图生成失败');return out;
  }
  async function upload(blob,id){
    const res=await fetch('/api/media/upload',{method:'POST',credentials:'same-origin',
      headers:{'content-type':blob.type||'image/webp','x-product-id':String(id||'').slice(0,80),'x-mocui-purpose':'thumbnail-320'},body:blob});
    const data=await res.json().catch(()=>({}));
    if(!res.ok||!data.url)throw new Error(data.error||`缩略图上传失败 ${res.status}`);
    return data.url;
  }
  function applyDom(id,url){
    document.querySelectorAll('img[data-mocui-thumb-id]').forEach(img=>{
      if(img.dataset.mocuiThumbId!==String(id))return;
      img.src=url;img.removeAttribute('data-mocui-thumb-needs');
    });
  }
  async function buildOne(id){
    if(running.has(id)||!navigator.onLine)return;
    running.add(id);
    try{
      if(typeof window.dbGet!=='function'||typeof window.dbPut!=='function')return;
      const latest=await window.dbGet('products',id);
      if(!latest?.image)return;
      if(latest.thumbnail){applyDom(id,latest.thumbnail);return;}
      const source=String(latest.image||'');if(!supported(source))return;
      const blob=await makeThumb(source),url=await upload(blob,id);
      const current=await window.dbGet('products',id);
      if(!current||String(current.image||'')!==source)return;
      if(current.thumbnail){applyDom(id,current.thumbnail);return;}
      current.thumbnail=url;current.thumbnailVersion=1;current.thumbnailCreatedAt=new Date().toISOString();
      // silent：只写技术缓存字段，不改变商品 updatedAt，不生成库存/销售业务流水。
      await window.dbPut('products',current,true);
      scheduleSync();applyDom(id,url);
    }catch(err){console.debug('[mocui thumb]',id,err?.message||err);}
    finally{running.delete(id);}
  }
  async function pump(){
    if(working)return;working=true;
    try{
      while(queue.length){
        if(document.hidden||!navigator.onLine)break;
        const id=queue.shift();queued.delete(id);await buildOne(id);
        await new Promise(r=>setTimeout(r,80));
      }
    }finally{working=false;}
  }
  function enqueue(id){
    id=String(id||'');if(!id||queued.has(id)||running.has(id))return;
    queued.add(id);queue.push(id);
    if('requestIdleCallback' in window)requestIdleCallback(()=>pump(),{timeout:1800});else setTimeout(()=>pump(),350);
  }
  function ensureIO(){
    if(io||!('IntersectionObserver' in window))return;
    io=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(!e.isIntersecting)return;io.unobserve(e.target);
      if(e.target.dataset.mocuiThumbNeeds==='1')enqueue(e.target.dataset.mocuiThumbId);
    }),{rootMargin:'240px 0px'});
  }
  function scan(root=document){
    ensureIO();
    root.querySelectorAll?.('img[data-mocui-thumb-id]').forEach(img=>{
      if(img.dataset.mocuiThumbNeeds!=='1')return;
      if(io)io.observe(img);else enqueue(img.dataset.mocuiThumbId);
    });
  }
  function installImageThumb(){
    if(typeof window.imageThumb!=='function'||window.imageThumb.__mocuiThumbV313)return;
    const wrapped=p=>{
      if(!p?.image)return '<div class="thumb placeholder">玉</div>';
      const has=Boolean(p.thumbnail),src=has?p.thumbnail:p.image,id=String(p.id||p.productId||'');
      return `<img class="thumb" src="${escAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"${id?` data-mocui-thumb-id="${escAttr(id)}"`:''}${id&&!has?' data-mocui-thumb-needs="1"':''}>`;
    };
    wrapped.__mocuiThumbV313=true;window.imageThumb=wrapped;
  }
  function install(){
    installImageThumb();scan();
    const main=document.getElementById('main');
    if(main)new MutationObserver(records=>requestAnimationFrame(()=>records.forEach(r=>r.addedNodes.forEach(n=>{
      if(n.nodeType===1)scan(n.matches?.('img[data-mocui-thumb-id]')?(n.parentElement||n):n);
    })))).observe(main,{childList:true,subtree:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)pump();},{passive:true});
    window.addEventListener('online',pump,{passive:true});
    window.MocuiR2Thumbs={version:VERSION,scan,enqueue,rebuild:async id=>{
      if(typeof window.dbGet!=='function'||typeof window.dbPut!=='function')return false;
      const p=await window.dbGet('products',id);if(!p)return false;
      p.thumbnail='';delete p.thumbnailCreatedAt;await window.dbPut('products',p,true);scheduleSync();enqueue(id);return true;
    }};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
