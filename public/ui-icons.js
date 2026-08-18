'use strict';

/*
 * 漠翠进销存 · UI Icon Decorator v1.0
 * 目的：把已上传的透明 PNG 图标映射到现有业务按钮。
 * 原则：不改业务函数、不重绑点击事件、不改数据库结构。
 */
(() => {
  const BASE = '/assets/icons';

  const ICONS = {
    salesOrder: `${BASE}/actions/ic_action_sales_order.png`,
    addProduct: `${BASE}/actions/ic_action_add_product.png`,
    addLending: `${BASE}/actions/ic_action_add_lending.png`,
    profitDifference: `${BASE}/actions/ic_action_profit_difference.png`,
    customers: `${BASE}/actions/ic_action_customers.png`,
    inventory: `${BASE}/actions/ic_action_inventory.png`,
    orders: `${BASE}/actions/ic_action_orders.png`,
    salesReport: `${BASE}/actions/ic_action_sales_report.png`,
    inventoryReport: `${BASE}/actions/ic_action_inventory_report.png`,
    lendingReport: `${BASE}/actions/ic_action_lending_report.png`,
    backup: `${BASE}/actions/ic_action_backup.png`,
    sync: `${BASE}/actions/ic_action_sync.png`,
    import: `${BASE}/actions/ic_action_import.png`,
    export: `${BASE}/actions/ic_action_export.png`,
    settings: `${BASE}/actions/ic_action_settings.png`,
    note: `${BASE}/actions/ic_action_note.png`,
    camera: `${BASE}/actions/ic_action_camera.png`,
    trash: `${BASE}/actions/ic_action_trash.png`,
    gallery: `${BASE}/actions/ic_action_gallery.png`,
    filter: `${BASE}/actions/ic_action_filter.png`,
    search: `${BASE}/actions/ic_action_search.png`,
    edit: `${BASE}/actions/ic_action_edit.png`,
    list: `${BASE}/actions/ic_action_list.png`,
    tag: `${BASE}/actions/ic_action_tag.png`,
    barcode: `${BASE}/actions/ic_action_barcode.png`,
    cloudUpload: `${BASE}/actions/ic_action_cloud_upload.png`,
    cloudDownload: `${BASE}/actions/ic_action_cloud_download.png`,
    reorder: `${BASE}/actions/ic_action_reorder.png`,
    refresh: `${BASE}/actions/ic_action_refresh.png`,
    sliders: `${BASE}/actions/ic_action_sliders.png`,
    calendar: `${BASE}/actions/ic_action_calendar.png`,
    calculator: `${BASE}/actions/ic_action_calculator.png`,
    folder: `${BASE}/actions/ic_action_folder.png`,
    cart: `${BASE}/actions/ic_action_cart.png`,
    bell: `${BASE}/common/ic_common_bell.png`,
    back: `${BASE}/common/ic_common_back.png`,
    forward: `${BASE}/common/ic_common_forward.png`,
    share: `${BASE}/common/ic_common_share.png`,
    external: `${BASE}/common/ic_common_external_link.png`,
    more: `${BASE}/common/ic_common_more.png`,
    undo: `${BASE}/common/ic_common_undo.png`,
    copy: `${BASE}/common/ic_common_copy.png`,
    close: `${BASE}/common/ic_common_close.png`,
    minus: `${BASE}/common/ic_common_minus.png`,
    plus: `${BASE}/common/ic_common_plus.png`,
    check: `${BASE}/common/ic_common_check.png`,
    lock: `${BASE}/common/ic_common_lock.png`,
    user: `${BASE}/common/ic_common_user.png`,
    success: `${BASE}/status/ic_status_success.png`,
    warning: `${BASE}/status/ic_status_warning.png`,
    error: `${BASE}/status/ic_status_error.png`,
    info: `${BASE}/status/ic_status_info.png`,
    offline: `${BASE}/status/ic_status_offline.png`,
  };

  // 从“最具体”到“较通用”，避免“商品”抢先匹配“新增商品”。
  const TEXT_RULES = [
    [/销售开单|新建销售|新增销售|开单/, ICONS.salesOrder],
    [/新增商品|添加商品|新建商品/, ICONS.addProduct],
    [/新增调借|新建调借|添加调借/, ICONS.addLending],
    [/过手差价|过手单/, ICONS.profitDifference],
    [/客户管理|客户列表|客户$/, ICONS.customers],
    [/库存盘点|盘点/, ICONS.inventory],
    [/订单|销售记录|单据/, ICONS.orders],
    [/销售报表|销售统计/, ICONS.salesReport],
    [/库存报表|库存统计/, ICONS.inventoryReport],
    [/调借报表|调借统计/, ICONS.lendingReport],
    [/备份|创建备份/, ICONS.backup],
    [/同步|立即同步/, ICONS.sync],
    [/导入/, ICONS.import],
    [/导出/, ICONS.export],
    [/设置/, ICONS.settings],
    [/内容工作台|笔记|文案/, ICONS.note],
    [/拍照|相机/, ICONS.camera],
    [/删除|移除/, ICONS.trash],
    [/图库|图片库|选择图片|上传图片/, ICONS.gallery],
    [/筛选/, ICONS.filter],
    [/搜索|查找/, ICONS.search],
    [/编辑|修改/, ICONS.edit],
    [/列表|明细/, ICONS.list],
    [/标签|分类/, ICONS.tag],
    [/条码|扫码/, ICONS.barcode],
    [/上传云端|云端上传/, ICONS.cloudUpload],
    [/从云端下载|下载云端/, ICONS.cloudDownload],
    [/重新排序|排序/, ICONS.reorder],
    [/刷新|重新加载|重新连接/, ICONS.refresh],
    [/高级筛选/, ICONS.sliders],
    [/日期|选择日期/, ICONS.calendar],
    [/计算|核算/, ICONS.calculator],
    [/文件|文件夹/, ICONS.folder],
    [/购物车|选货/, ICONS.cart],
    [/通知|提醒/, ICONS.bell],
    [/返回/, ICONS.back],
    [/下一步|继续/, ICONS.forward],
    [/分享/, ICONS.share],
    [/打开外部|外部链接/, ICONS.external],
    [/更多/, ICONS.more],
    [/撤销|恢复/, ICONS.undo],
    [/复制/, ICONS.copy],
    [/关闭|取消/, ICONS.close],
    [/减少|减一/, ICONS.minus],
    [/增加|加一|新增$/, ICONS.plus],
    [/确认|完成|保存成功/, ICONS.check],
    [/锁定|不可删除/, ICONS.lock],
  ];

  const ARIA_RULES = [
    [/返回/, ICONS.back],
    [/搜索/, ICONS.search],
    [/筛选/, ICONS.filter],
    [/更多/, ICONS.more],
    [/编辑/, ICONS.edit],
    [/删除/, ICONS.trash],
    [/关闭/, ICONS.close],
    [/新增|添加|页面操作/, ICONS.plus],
    [/分享/, ICONS.share],
  ];

  const normalize = s => String(s || '').replace(/\s+/g, '').trim();

  function resolveIcon(el) {
    const explicit = el.getAttribute('data-ui-icon');
    if (explicit && ICONS[explicit]) return ICONS[explicit];

    const aria = normalize(el.getAttribute('aria-label'));
    if (aria) {
      const hit = ARIA_RULES.find(([re]) => re.test(aria));
      if (hit) return hit[1];
    }

    const text = normalize(el.textContent);
    if (!text || text.length > 18) return null;
    const hit = TEXT_RULES.find(([re]) => re.test(text));
    return hit ? hit[1] : null;
  }

  function decorate(el) {
    if (!(el instanceof Element)) return;
    if (el.matches('.nav-item, .ui-icon-only')) return;
    if (el.querySelector(':scope > .ui-auto-icon')) return;

    const icon = resolveIcon(el);
    if (!icon) return;

    const img = document.createElement('img');
    img.className = 'ui-auto-icon';
    img.src = icon;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');

    // 保持原事件和文本节点不变，只在最前面插入图片。
    el.insertBefore(img, el.firstChild);
    el.classList.add('ui-decorated');

    const cls = String(el.className || '');
    if (/quick|action|shortcut|entry|tile|menu-card/i.test(cls)) {
      el.classList.add('ui-action-tile');
    }
  }

  function scan(root = document) {
    if (!(root instanceof Element || root instanceof Document)) return;
    root.querySelectorAll('button, a, [role="button"]').forEach(decorate);
  }

  // app.js 会动态重绘 main / modalRoot，因此使用 MutationObserver 自动补图标。
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan(document);
    });
  });

  function start() {
    scan(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.MocuiUIIcons = { ICONS, scan };
})();
