'use strict';
(()=>{
 const VERSION='3.19.0', root=document.documentElement;
 let keyboard=false,lastH=window.innerHeight;
 function viewport(){
   const vv=window.visualViewport;if(!vv)return;
   root.style.setProperty('--vvh',`${vv.height}px`);
   const drop=Math.max(0,window.innerHeight-vv.height-vv.offsetTop),open=drop>120;
   if(open!==keyboard){keyboard=open;root.classList.toggle('ios-keyboard-open',open)}
 }
 function reveal(el){
   if(!el?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
   setTimeout(()=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'}),180);
 }
 function preventZoom(e){
   // Keep normal single-finger scrolling; only suppress iOS gesture zoom in installed PWA.
   if(e.touches&&e.touches.length>1)e.preventDefault();
 }
 if(window.visualViewport){visualViewport.addEventListener('resize',viewport,{passive:true});visualViewport.addEventListener('scroll',viewport,{passive:true});viewport()}
 document.addEventListener('focusin',e=>reveal(e.target));
 document.addEventListener('touchstart',e=>{
   const b=e.target.closest?.('button,.btn,.nav-item,.clickable,.workflow-card');
   if(b&&!b.disabled)b.classList.add('ios-pressed');
 },{passive:true});
 document.addEventListener('touchend',()=>document.querySelectorAll('.ios-pressed').forEach(x=>x.classList.remove('ios-pressed')),{passive:true});
 document.addEventListener('touchcancel',()=>document.querySelectorAll('.ios-pressed').forEach(x=>x.classList.remove('ios-pressed')),{passive:true});
 if(matchMedia('(display-mode: standalone)').matches){document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false})}
 window.MocuiIphoneUX={version:VERSION,refreshViewport:viewport};
})();