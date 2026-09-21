'use strict';
(()=>{
 const VERSION='3.20.0';
 const pageMap={
  dashboard:'dashboard',home:'dashboard',products:'products',product:'products',
  'sale-new':'sale-new',saleNew:'sale-new',sales:'sales',
  loans:'loans',loan:'loans',reports:'reports',report:'reports',
  more:'more',settings:'settings',customers:'customers',ledger:'ledger',accessories:'accessories'
 };
 function infer(){
  // Prefer the app's route state; fallback to stable DOM signatures.
  let raw=window.appState?.page||window.appState?.route||'';
  let p=pageMap[raw]||raw;
  const m=document.querySelector('#main');
  if(!p&&m){
   if(m.querySelector('#quickSale'))p='dashboard';
   else if(m.querySelector('#v316range'))p='reports';
   else if(m.querySelector('#saleCustomer'))p='sale-new';
   else if(m.querySelector('#productList'))p='products';
   else if(m.querySelector('#loanList'))p='loans';
   else if(m.querySelector('#salesList'))p='sales';
  }
  document.body.dataset.mocuiPage=p||'other';
  return p;
 }
 function polish(){
  const p=infer(),main=document.querySelector('#main');if(!main)return;
  // Add semantic accessibility labels without changing business DOM order.
  main.querySelectorAll('button:not([aria-label])').forEach(b=>{
   const t=(b.textContent||'').trim();if(t)b.setAttribute('aria-label',t);
  });
  main.querySelectorAll('img:not([alt])').forEach(i=>i.alt='');
  // Numeric inputs get decimal keyboard unless core explicitly chose another mode.
  main.querySelectorAll('input[type="number"]:not([inputmode])').forEach(i=>i.inputMode='decimal');
  main.querySelectorAll('input[type="tel"]:not([inputmode])').forEach(i=>i.inputMode='tel');
 }
 let queued=false;
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;polish()})}
 const mo=new MutationObserver(schedule);
 function start(){polish();const m=document.querySelector('#main');if(m)mo.observe(m,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);window.addEventListener('popstate',schedule)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.MocuiIphonePages={version:VERSION,refresh:polish};
})();