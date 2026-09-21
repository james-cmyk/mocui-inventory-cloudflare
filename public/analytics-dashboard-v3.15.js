'use strict';
(() => {
  const VERSION='3.15.0';
  function money(v){return `¥${Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
  async function refresh(){
    if(!window.MocuiAnalytics||!document.querySelector('.grid-2 .metric'))return;
    const metrics=[...document.querySelectorAll('#main > .grid-2:first-child .metric')];if(metrics.length<4)return;
    const now=new Date(),todayStart=new Date(now.getFullYear(),now.getMonth(),now.getDate()),monthStart=new Date(now.getFullYear(),now.getMonth(),1);
    const [today,month]=await Promise.all([MocuiAnalytics.range(todayStart,now),MocuiAnalytics.range(monthStart,now)]);
    // Existing cards include pass-deal/external totals. Only replace the formal-sale hint segment, not operating totals.
    const pairs=[[metrics[0],today.revenue],[metrics[1],today.grossProfit],[metrics[2],month.revenue],[metrics[3],month.grossProfit]];
    for(const [card,val] of pairs){const hint=card.querySelector('.hint');if(!hint)continue;hint.innerHTML=hint.innerHTML.replace(/正式\/调借\s*¥[\d,.]+(?:\.\d+)?/,`正式/调借 ${money(val)}`);}
  }
  window.addEventListener('mocui-analytics-ready',()=>{if(document.querySelector('#quickSale'))refresh().catch(()=>{});});
  window.MocuiAnalyticsDashboard={version:VERSION,refresh};
})();
