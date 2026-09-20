'use strict';
(() => {
  const VERSION='3.1.7';

  // 直接替换 app.js 已定义的 renderMore。
  // 不读取、不写入 IndexedDB；不修改商品、销售、调借、库存或同步逻辑。
  window.renderMore = async function renderMoreV317(){
    setHeader('更多','常用工具');
    const items=[
      ['customers','客','客户'],
      ['sales','单','销售单'],
      ['stocktake','盘','盘点'],
      ['ledger','流','流水'],
      ['trade-gallery','货','货源'],
      ['settings','设','设置']
    ];

    $('#main').innerHTML=`
      <section class="more-core-v317">
        <div class="more-core-v317-grid">
          ${items.map(([route,icon,label])=>`
            <button type="button" class="more-core-v317-item" data-more-route="${route}">
              <span>${icon}</span><b>${label}</b>
            </button>`).join('')}
        </div>
      </section>`;

    $$('.more-core-v317-item').forEach(el=>{
      el.onclick=()=>navigate(el.dataset.moreRoute);
    });
  };

  window.MocuiMoreV317={version:VERSION};
})();