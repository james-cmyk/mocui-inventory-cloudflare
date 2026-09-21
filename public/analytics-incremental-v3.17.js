'use strict';
(()=>{
  const VERSION='3.17.0';
  let installed=false;
  function install(){
    if(installed||typeof window.dbPut!=='function'||!window.MocuiAnalytics?.applySaleDelta)return false;
    installed=true;
    const put=window.dbPut,add=window.dbAdd,del=window.dbDelete;
    window.dbPut=async function(store,value,...rest){
      let old=null;if(store==='sales'&&value?.id)old=await window.dbGet('sales',value.id).catch(()=>null);
      const result=await put(store,value,...rest);
      if(store==='sales')window.MocuiAnalytics.applySaleDelta(old,value).catch(()=>{});
      return result;
    };
    window.dbAdd=async function(store,value,...rest){
      const result=await add(store,value,...rest);
      if(store==='sales')window.MocuiAnalytics.applySaleDelta(null,value).catch(()=>{});
      return result;
    };
    window.dbDelete=async function(store,id,...rest){
      let old=null;if(store==='sales')old=await window.dbGet('sales',id).catch(()=>null);
      const result=await del(store,id,...rest);
      if(store==='sales')window.MocuiAnalytics.applySaleDelta(old,null).catch(()=>{});
      return result;
    };
    return true;
  }
  const t=setInterval(()=>{if(install())clearInterval(t)},25);setTimeout(()=>clearInterval(t),10000);
  window.MocuiAnalyticsIncremental={version:VERSION};
})();