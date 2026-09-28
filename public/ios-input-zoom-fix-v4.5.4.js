'use strict';
(()=>{
  const VERSION='4.5.4';
  const viewport=document.querySelector('meta[name="viewport"]');
  const normalViewport='width=device-width,initial-scale=1,viewport-fit=cover';
  let lastEditableFocus=0;
  let resetTimer=0;

  const isEditable=el=>Boolean(el?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),textarea,select,[contenteditable="true"]'));

  function clearKeyboardFlags(){
    document.documentElement.classList.remove('ios-keyboard-open');
    document.body.classList.remove('keyboard-open');
  }

  function resetViewportIfNeeded(){
    clearTimeout(resetTimer);
    resetTimer=setTimeout(()=>{
      if(isEditable(document.activeElement))return;
      clearKeyboardFlags();
      const scale=Number(window.visualViewport?.scale||1);
      // Only undo a recent form-focus zoom. Do not interfere with deliberate pinch zoom elsewhere.
      if(!viewport||scale<=1.01||Date.now()-lastEditableFocus>8000)return;
      const original=viewport.getAttribute('content')||normalViewport;
      viewport.setAttribute('content',`${normalViewport},maximum-scale=1`);
      requestAnimationFrame(()=>setTimeout(()=>viewport.setAttribute('content',original.includes('width=device-width')?original:normalViewport),80));
    },180);
  }

  function leaveForm(){
    const active=document.activeElement;
    if(isEditable(active)){
      try{active.blur();}catch(_){ }
    }
    clearKeyboardFlags();
    resetViewportIfNeeded();
  }

  document.addEventListener('focusin',e=>{
    if(isEditable(e.target))lastEditableFocus=Date.now();
  },true);

  document.addEventListener('focusout',()=>resetViewportIfNeeded(),true);

  // Back/close/main-nav transitions are the places where iOS can keep the focused viewport scale.
  document.addEventListener('click',e=>{
    if(e.target.closest?.('.modal-close,#pageBack,.page-back,.bottom-nav .nav-item')){
      leaveForm();
    }
  },true);

  window.addEventListener('pageshow',()=>{
    clearKeyboardFlags();
    resetViewportIfNeeded();
  });

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)resetViewportIfNeeded();
  });

  // Exposed only for diagnostics/manual recovery; no business data is touched.
  window.MocuiIOSInputZoomFix={version:VERSION,reset:leaveForm};
})();
