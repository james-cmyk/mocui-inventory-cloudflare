'use strict';
(() => {
  const VERSION='3.0.0';
  function tuneImage(img){
    if(!img||img.dataset.mocuiPerf==='1')return;
    img.dataset.mocuiPerf='1';
    img.decoding='async';
    if(!img.closest('.modal-backdrop,.product-hero,.image-viewer')){
      img.loading='lazy';
      try{img.fetchPriority='low'}catch{}
    }
  }
  function tune(root=document){
    root.querySelectorAll?.('img').forEach(tuneImage);
  }
  const observer=new MutationObserver(records=>{
    requestAnimationFrame(()=>records.forEach(r=>r.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.tagName==='IMG')tuneImage(n);
      tune(n);
    })));
  });
  function install(){
    tune();
    observer.observe(document.body,{childList:true,subtree:true});
    // 页面切到后台时不做额外动画和重绘。
    document.addEventListener('visibilitychange',()=>document.documentElement.classList.toggle('mocui-background',document.hidden));
    window.MocuiPerformance={version:VERSION,tuneImages:tune};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
