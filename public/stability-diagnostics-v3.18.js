'use strict';
(()=>{
 const VERSION='3.18.0';
 function card(){
   if(!window.MocuiStability||document.getElementById('mocuiDiagnostics'))return;
   const main=document.querySelector('#main');if(!main)return;
   const text=(document.querySelector('.page-title')?.textContent||document.querySelector('header')?.textContent||'');
   if(!/设置|更多/.test(text))return;
   const box=document.createElement('div');box.id='mocuiDiagnostics';box.className='card';box.style.marginTop='12px';
   box.innerHTML='<div class="section-title">数据安全检查</div><div class="item-meta" id="mocuiDiagText">检查正式数据库、统计缓存和销售引用，不自动修改正式账本。</div><div class="form-row" style="margin-top:10px"><button class="btn secondary" id="mocuiRunDiag">运行检查</button><button class="btn secondary" id="mocuiSnap">创建本机应急快照</button></div>';
   main.appendChild(box);
   box.querySelector('#mocuiRunDiag').onclick=async()=>{const t=box.querySelector('#mocuiDiagText');t.textContent='正在检查…';const [h,s]=await Promise.all([MocuiStability.healthCheck(),MocuiStability.verifySaleReferences()]);t.textContent=h.ok&&!s.issues.length?`检查通过：正式数据库正常；抽查 ${s.checked} 笔销售引用未发现异常。`:`发现 ${h.issues.length+s.issues.length} 项需要人工确认；系统未自动修改正式数据。`;};
   box.querySelector('#mocuiSnap').onclick=async()=>{const t=box.querySelector('#mocuiDiagText'),r=await MocuiStability.compactSnapshot();t.textContent=r.ok?'本机应急快照已创建。正式账本未改动。':`快照失败：${r.error}`;};
 }
 const mo=new MutationObserver(()=>setTimeout(card,0));mo.observe(document.documentElement,{subtree:true,childList:true});
 setTimeout(card,1500);window.MocuiDiagnostics={version:VERSION};
})();