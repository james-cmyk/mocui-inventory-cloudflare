/* 漠翠进销存 UI 稳定基线自检 v3.9.1 */
(()=>{
  'use strict';
  const VERSION='3.9.1';
  const NAV_SPEC=[
    ['dashboard','概况'],
    ['products','商品'],
    ['loans','调借'],
    ['reports','报表'],
    ['more','更多'],
  ];
  let lastSignature='';

  function showFailure(issues){
    let banner=document.getElementById('uiBaselineFailure');
    if(!banner){
      banner=document.createElement('div');
      banner.id='uiBaselineFailure';
      banner.setAttribute('role','alert');
      Object.assign(banner.style,{
        position:'fixed',left:'10px',right:'10px',top:'10px',zIndex:'10000',
        padding:'10px 12px',borderRadius:'12px',background:'#fff1f0',
        border:'1px solid #fda29b',color:'#b42318',fontSize:'12px',fontWeight:'700',
        boxShadow:'0 8px 24px rgba(16,24,40,.14)'
      });
      document.body.appendChild(banner);
    }
    banner.textContent=`界面稳定基线异常：${issues.join('、')}。请停止继续升级并检查 UI 壳层。`;
  }

  function clearFailure(){
    document.getElementById('uiBaselineFailure')?.remove();
  }

  function assertShell(){
    const issues=[];
    const app=document.getElementById('app');
    const topbar=app?.querySelector(':scope > .topbar');
    const main=app?.querySelector(':scope > #main.main');
    const nav=app?.querySelector(':scope > .bottom-nav');
    if(!app) issues.push('缺少 #app');
    if(!topbar) issues.push('缺少顶部栏');
    if(!main) issues.push('缺少主滚动容器');
    if(!nav) issues.push('缺少底部 Dock');

    if(nav){
      const items=[...nav.querySelectorAll(':scope > .nav-item')];
      if(items.length!==NAV_SPEC.length) issues.push(`Dock 应为5栏，当前${items.length}栏`);
      NAV_SPEC.forEach(([route,label],index)=>{
        const item=items[index];
        if(!item) return;
        if(item.dataset.route!==route) issues.push(`第${index+1}栏路由异常`);
        const text=item.querySelector('b');
        if(!text){issues.push(`${label}文字缺失`);return;}
        // 文案属于稳定基线；若功能版本误改，自动恢复，不影响按钮事件。
        if(text.textContent.trim()!==label) text.textContent=label;
      });
    }

    document.documentElement.dataset.uiBaseline=VERSION;
    const signature=issues.join('|');
    if(signature!==lastSignature){
      if(issues.length) console.error('[Mocui UI baseline]',issues);
      else console.info(`[Mocui UI baseline] v${VERSION} OK`);
      lastSignature=signature;
    }
    if(issues.length) showFailure(issues); else clearFailure();
    return {ok:issues.length===0,version:VERSION,issues};
  }

  window.MocuiUIBaseline={version:VERSION,assert:assertShell};

  function schedule(){requestAnimationFrame(()=>requestAnimationFrame(assertShell));}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  window.addEventListener('pageshow',schedule,{passive:true});
  window.addEventListener('orientationchange',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();},{passive:true});
})();
