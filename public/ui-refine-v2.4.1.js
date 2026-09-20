'use strict';
(() => {
  const VERSION = '2.4.0';

  const ROUTE_TITLES = {
    products: '商品',
    sales: '销售',
    loans: '调借',
    reports: '报表',
    more: '更多',
    customers: '客户',
    stocktake: '盘点',
    ledger: '流水',
    audit: '日志',
    health: '体检',
    settings: '设置',
    'pass-deals': '过手',
    'external-goods': '外部货',
    'trade-gallery': '货源库'
  };

  function setRouteMarker() {
    const route = String(appState?.route || '');
    document.body.dataset.mocuiRoute = route;
  }

  function compactHeader() {
    const route = String(appState?.route || '');
    const brand = document.querySelector('.brand');
    const subtitle = document.querySelector('#pageSubtitle');
    if (!brand || !subtitle || route === 'dashboard') return;

    // 不改主标题，只压缩过长副标题。
    const compact = {
      products: '查询 · 分类 · 库存',
      sales: '销售记录与撤销',
      loans: '借出 · 调入 · 归还',
      reports: '经营数据',
      more: '常用工具',
      customers: '客户与拿货',
      stocktake: '核对实际库存',
      ledger: '库存变化记录',
      audit: '重要操作记录',
      health: '库存一致性检查',
      settings: '同步 · 备份 · 安全',
      'pass-deals': '临时过手独立账',
      'external-goods': '同行货流转',
      'trade-gallery': '同行货源图片'
    };
    if (compact[route]) subtitle.textContent = compact[route];
  }

  function refineProducts() {
    if (appState?.route !== 'products') return;

    const actions = {
      batchImport: '导入',
      manageCategory: '分类',
      exportProducts: '导出'
    };
    for (const [id, label] of Object.entries(actions)) {
      const el = document.getElementById(id);
      if (el) el.textContent = label;
    }

    const search = document.querySelector('#productSearch');
    if (search) search.placeholder = '名称 / 编码 / 颜色';

    const stats = document.querySelector('#main > .grid-3');
    if (stats) stats.classList.add('mocui-summary-strip');

    const toolbar = document.querySelector('.product-filter-row');
    if (toolbar) toolbar.classList.add('mocui-filter-bar');
  }

  function refineSales() {
    if (appState?.route !== 'sales') return;

    const search = document.querySelector('#saleSearch');
    if (search) search.placeholder = '单号 / 客户 / 商品';

    const segment = document.querySelector('#saleStatus');
    if (segment) segment.classList.add('mocui-compact-segment');

    document.querySelectorAll('.sale-card').forEach(card => {
      card.classList.add('mocui-compact-record');
    });
  }

  function refineLoans() {
    if (appState?.route !== 'loans') return;

    const main = document.querySelector('#main');
    if (!main) return;

    const firstNotice = main.querySelector(':scope > .notice');
    if (firstNotice) {
      firstNotice.classList.add('mocui-page-tip');
      firstNotice.innerHTML = '<strong>正式调借</strong>：自有库存借出 / 正式调入。临时寄售或别人的货请放到“外部货”。';
    }

    const ext = document.querySelector('#openExternalGoods');
    if (ext) {
      ext.textContent = '外部货';
      ext.classList.add('mocui-small-entry');
    }

    const stats = main.querySelector(':scope > .grid-3');
    if (stats) stats.classList.add('mocui-summary-strip');

    const segment = document.querySelector('#loanStatus');
    if (segment) segment.classList.add('mocui-compact-segment');

    document.querySelectorAll('[data-loan-id]').forEach(row => {
      row.classList.add('mocui-compact-record');
    });
  }

  function refineReports() {
    if (appState?.route !== 'reports') return;

    const reportMode = document.querySelector('#reportMode');
    if (reportMode) {
      reportMode.classList.add('mocui-report-tabs');
      const names = {
        report: '销售',
        pass: '过手',
        external: '外部货',
        assistant: '助手'
      };
      reportMode.querySelectorAll('button').forEach(btn => {
        if (names[btn.dataset.mode]) btn.textContent = names[btn.dataset.mode];
      });
    }

    const range = document.querySelector('#reportRange');
    if (range) {
      range.classList.add('mocui-scroll-tabs');
      const labels = {
        today: '今天',
        yesterday: '昨天',
        '7d': '7天',
        '30d': '30天',
        month: '本月',
        year: '今年',
        all: '全部',
        custom: '自定义'
      };
      range.querySelectorAll('button').forEach(btn => {
        if (labels[btn.dataset.range]) btn.textContent = labels[btn.dataset.range];
      });
    }

    document.querySelector('#reportBody')?.classList.add('mocui-report-body');
  }

  function refineMore() {
    if (appState?.route !== 'more') return;

    const descriptions = {
      '过手差价': '临时过手，独立记利润',
      '调货货源库（试用）': '同行图片、价格与来源',
      '客户管理': '客户资料与拿货记录',
      '销售单管理': '查询、撤销与恢复',
      '库存盘点': '核对实际库存',
      '库存流水': '查看库存变化',
      '内容工作台': '素材与发布记录',
      'iPhone快捷保存': '图片视频快捷入库',
      '秦丝数据导入': '导入历史商品与销售',
      '库存体检': '检查库存与流水',
      '操作日志': '查看重要操作',
      '数据与设置': '同步、备份与安全'
    };

    document.querySelectorAll('.more-item').forEach(item => {
      item.classList.add('mocui-more-tile');
      const title = item.querySelector('.item-title')?.textContent.trim();
      const meta = item.querySelector('.item-meta');
      if (meta && descriptions[title]) meta.textContent = descriptions[title];
    });

    const warning = [...document.querySelectorAll('#main > .notice.warn')].pop();
    if (warning) {
      warning.classList.add('mocui-maintenance-note');
      warning.innerHTML = '<strong>数据安全</strong>：导入、恢复或覆盖云端前，先做完整备份。';
    }
  }

  function refineCustomers() {
    if (appState?.route !== 'customers') return;
    const search = document.querySelector('#customerSearch');
    if (search) search.placeholder = '姓名 / 电话';
    document.querySelectorAll('.customer-row').forEach(row => row.classList.add('mocui-compact-record'));
  }

  function refineStocktake() {
    if (appState?.route !== 'stocktake') return;
    const tip = document.querySelector('#main > .notice.warn');
    if (tip) {
      tip.classList.add('mocui-page-tip');
      tip.innerHTML = '<strong>只改有差异的商品。</strong> 保存后自动生成盘盈 / 盘亏流水。';
    }
    const search = document.querySelector('#stocktakeSearch');
    if (search) search.placeholder = '搜索商品';
  }

  function refineLedger() {
    if (appState?.route !== 'ledger') return;
    const search = document.querySelector('#ledgerSearch');
    if (search) search.placeholder = '商品 / 编码 / 备注';
    document.querySelector('#ledgerList')?.classList.add('mocui-compact-timeline');
  }

  function refineAudit() {
    if (appState?.route !== 'audit') return;
    const notice = document.querySelector('#main > .notice');
    if (notice) {
      notice.classList.add('mocui-page-tip');
      notice.innerHTML = '<strong>操作日志</strong>会同步到云端；图片与签名不写入日志。';
    }
    const search = document.querySelector('#auditSearch');
    if (search) search.placeholder = '操作 / 商品 / 单号';
    document.querySelector('#auditList')?.classList.add('mocui-compact-timeline');
  }

  function refineHealth() {
    if (appState?.route !== 'health') return;
    document.querySelector('#main > .grid-3')?.classList.add('mocui-summary-strip');
  }

  function refineSettings() {
    if (appState?.route !== 'settings') return;

    document.querySelectorAll('#main > .card').forEach(card => {
      card.classList.add('mocui-settings-card');
    });

    // 安全相关提示和危险操作不删，只降低视觉拥挤。
    document.querySelectorAll('#main .notice').forEach(n => {
      n.classList.add('mocui-settings-note');
    });
  }

  function refinePassDeals() {
    if (appState?.route !== 'pass-deals') return;
    const tip = document.querySelector('#main > .notice');
    if (tip) {
      tip.classList.add('mocui-page-tip');
      tip.innerHTML = '<strong>过手独立账</strong>：只记成交、成本和差价，不影响正式库存。';
    }
    document.querySelector('#passDealStatus')?.classList.add('mocui-compact-segment');
    document.querySelectorAll('.pass-deal-card').forEach(card => card.classList.add('mocui-compact-record'));
  }

  function refineExternalGoods() {
    if (appState?.route !== 'external-goods') return;
    const tip = document.querySelector('#main > .notice');
    if (tip) {
      tip.classList.add('mocui-page-tip');
      tip.innerHTML = '<strong>外部货</strong>只追踪货主、去向和结算，不计入自有库存。';
    }
    document.querySelector('#main > .grid-3')?.classList.add('mocui-summary-strip');
    document.querySelector('#externalStatus')?.classList.add('mocui-scroll-tabs');
    document.querySelectorAll('.external-good-card').forEach(card => card.classList.add('mocui-compact-record'));
  }

  function refineTradeGallery() {
    if (appState?.route !== 'trade-gallery') return;
    document.querySelector('#tradeGalleryStatus')?.classList.add('mocui-compact-segment');
    const grid = document.querySelector('#tradeGalleryGrid');
    if (grid) grid.classList.add('mocui-gallery-grid');
  }

  function refineModals() {
    const root = document.querySelector('#modalRoot');
    if (!root?.querySelector('.modal-backdrop')) return;

    root.querySelectorAll('.field-help').forEach(el => el.classList.add('mocui-field-help'));
    root.querySelectorAll('.notice').forEach(el => el.classList.add('mocui-modal-note'));
    root.querySelectorAll('.form-group').forEach(el => el.classList.add('mocui-form-group'));
  }

  function run() {
    setRouteMarker();
    compactHeader();

    refineProducts();
    refineSales();
    refineLoans();
    refineReports();
    refineMore();
    refineCustomers();
    refineStocktake();
    refineLedger();
    refineAudit();
    refineHealth();
    refineSettings();
    refinePassDeals();
    refineExternalGoods();
    refineTradeGallery();
    refineModals();
  }

  function install() {
    // v3.0.3: 不再用 MutationObserver 反复整理主页面。
    // reports/products/loans 的 refine 会移动节点；持续监听会让按钮在 iOS 上来回跳动。
    const safeRun = () => {
      try { run(); } catch (error) { console.error('[mocui ui refine]', error); }
    };

    safeRun();

    // 弹窗属于按需 UI，只在用户操作后做一次整理，不做持续 DOM 监听。
    let clickTimer = 0;
    document.addEventListener('click', () => {
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        if (document.querySelector('#modalRoot .modal-backdrop')) safeRun();
      }, 80);
    }, {passive:true});

    window.MocuiUIRefine = {
      version: '2.4.2',
      run: safeRun
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, {once:true});
  } else {
    install();
  }
})();
