'use strict';
(()=>{
 const VERSION='3.20.1';
 let last='';
 function activeRoute(){return document.querySelector('.bottom-nav .nav-item.active')?.dataset?.route||''}
 function sync(){
   const r=activeRoute(),m=document.querySelector('#main');
   if(r&&r!==last){
     last=r;
     if(m)m.scrollTop=0;
     const map={dashboard:'dashboard',products:'products',loans:'loans',reports:'reports',more:'more'};
     document.body.dataset.mocuiPage=map[r]||r;
   }
 }
 const mo=new MutationObserver(()=>requestAnimationFrame(sync));
 function start(){sync();const nav=document.querySelector('.bottom-nav');if(nav)mo.observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.MocuiIphoneHotfix={version:VERSION,sync};
})();