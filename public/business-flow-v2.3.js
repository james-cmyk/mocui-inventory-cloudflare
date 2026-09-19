'use strict';
(() => {
  const VERSION = '2.3.0';

  function isChildCategory(node) {
    return Boolean(node && node.parentId);
  }

  function installProductCategoryGuard() {
    const form = document.querySelector('#productForm');
    if (!form || form.dataset.childCategoryGuard === '1') return;
    form.dataset.childCategoryGuard = '1';

    const label = [...form.querySelectorAll('.form-label')]
      .find(el => el.textContent.trim() === '分类');
    if (label) label.textContent = '分类 *';

    const picker = form.querySelector('#productCategoryPicker');
    if (picker) {
      const help = document.createElement('div');
      help.className = 'mocui-category-help';
      help.textContent = '必须选择具体子分类，一级分类不能直接保存商品。';
      picker.insertAdjacentElement('afterend', help);
    }

    form.addEventListener('submit', async (event) => {
      const categoryId = String(form.querySelector('#productCategoryId')?.value || '').trim();
      const categories = await dbAll('categories');
      const node = categories.find(c => String(c.id) === categoryId);

      if (!isChildCategory(node)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast('请选择具体子分类后再保存');
        const button = form.querySelector('#productCategoryPicker');
        if (button) {
          button.classList.add('mocui-category-required');
          setTimeout(() => button.classList.remove('mocui-category-required'), 1200);
          button.click();
        }
      }
    }, true);
  }

  function patchProductForm() {
    if (typeof openProductForm !== 'function' || openProductForm.__mocuiV23Patched) return;
    const original = openProductForm;
    const wrapped = async function(...args) {
      const result = await original.apply(this, args);
      queueMicrotask(installProductCategoryGuard);
      setTimeout(installProductCategoryGuard, 30);
      return result;
    };
    wrapped.__mocuiV23Patched = true;
    openProductForm = wrapped;
  }

  function activeSaleRowsForProduct(productId, sales) {
    const rows = [];
    for (const sale of sales || []) {
      if (!saleIsReportActive(sale)) continue;
      for (const item of sale.items || []) {
        if (item.productId !== productId) continue;
        rows.push({ sale, item });
      }
    }
    return rows.sort((a,b) => new Date(b.sale.createdAt) - new Date(a.sale.createdAt));
  }

  function loanRowsForProduct(productId, loans) {
    const rows = [];
    for (const loan of loans || []) {
      const item = (loan.items || []).find(i => i.productId === productId);
      if (!item) continue;

      let remaining = 0;
      try {
        remaining = typeof loanItemRemaining === 'function'
          ? loanItemRemaining(loan, item)
          : Math.max(0, n(item.qty) - n(item.returnedQty) - n(item.soldQty));
      } catch {
        remaining = Math.max(0, n(item.qty) - n(item.returnedQty) - n(item.soldQty));
      }

      rows.push({
        loan,
        item,
        remaining,
      });
    }
    return rows.sort((a,b) => new Date(b.loan.date || b.loan.createdAt) - new Date(a.loan.date || a.loan.createdAt));
  }

  async function addProductRelations() {
    if (appState?.route !== 'product-detail') return;

    const main = document.querySelector('#main');
    const productId = appState?.params?.id;
    if (!main || !productId || document.querySelector('#mocuiProductRelations')) return;

    const [sales, loans] = await Promise.all([
      dbAll('sales'),
      dbAll('loans')
    ]);

    const saleRows = activeSaleRowsForProduct(productId, sales).slice(0, 12);
    const loanRows = loanRowsForProduct(productId, loans).slice(0, 12);

    const section = document.createElement('section');
    section.id = 'mocuiProductRelations';
    section.className = 'mocui-product-relations';

    const saleHtml = saleRows.length
      ? saleRows.map(({sale,item}) => `
        <div class="mocui-relation-row">
          <div class="mocui-relation-main">
            <strong>售给：${esc(sale.customerName || '散客')}</strong>
            <span>${fmtDateTime(sale.createdAt)} · ${esc(sale.orderNo || '')}</span>
          </div>
          <div class="mocui-relation-side">
            <b>${fmtInt(item.qty)} 件</b>
            <span>${fmtMoney(n(item.qty) * n(item.price))}</span>
          </div>
        </div>
      `).join('')
      : `<div class="mocui-relation-empty">暂无销售记录</div>`;

    const loanHtml = loanRows.length
      ? loanRows.map(({loan,item,remaining}) => {
          const direction = loan.type === 'lend' ? '借出给' : '借入自';
          const open = typeof loanIsOpen === 'function' ? loanIsOpen(loan) : loan.status !== 'returned';
          const overdue = typeof loanOverdueDays === 'function' ? loanOverdueDays(loan) : 0;
          return `
            <button class="mocui-relation-row mocui-loan-link ${overdue > 0 && open ? 'overdue' : ''}" type="button" data-loan-id="${esc(loan.id)}">
              <div class="mocui-relation-main">
                <strong>${direction}：${esc(loan.person || '未填写')}</strong>
                <span>${fmtDateTime(loan.date || loan.createdAt)} · ${esc(loan.loanNo || '')}</span>
              </div>
              <div class="mocui-relation-side">
                <b>${fmtInt(item.qty)} 件</b>
                <span>${open ? `未处理 ${fmtInt(remaining)}` : '已完成'}</span>
              </div>
            </button>
          `;
        }).join('')
      : `<div class="mocui-relation-empty">暂无调借记录</div>`;

    section.innerHTML = `
      <div class="mocui-relation-title">商品往来</div>
      <div class="mocui-relation-card">
        <div class="mocui-relation-heading">销售记录</div>
        ${saleHtml}
      </div>
      <div class="mocui-relation-card">
        <div class="mocui-relation-heading">调借记录</div>
        ${loanHtml}
      </div>
    `;

    const inventoryTitle = [...main.querySelectorAll('.section-title')]
      .find(el => el.textContent.includes('库存流水'));

    if (inventoryTitle) {
      inventoryTitle.insertAdjacentElement('beforebegin', section);
    } else {
      main.appendChild(section);
    }

    section.querySelectorAll('[data-loan-id]').forEach(button => {
      button.addEventListener('click', () => openLoanDetail(button.dataset.loanId));
    });
  }

  function patchProductDetail() {
    if (typeof renderProductDetail !== 'function' || renderProductDetail.__mocuiV23Patched) return;
    const original = renderProductDetail;
    const wrapped = async function(...args) {
      const result = await original.apply(this, args);
      await addProductRelations();
      return result;
    };
    wrapped.__mocuiV23Patched = true;
    renderProductDetail = wrapped;
  }

  function simplifyDashboardDom() {
    if (appState?.route !== 'dashboard') return;
    const main = document.querySelector('#main');
    if (!main) return;

    // 首页不显示调借逾期/到期提醒，调借页继续保留原有提醒。
    const titles = [...main.querySelectorAll('.section-title')];
    for (const title of titles) {
      if (title.textContent.includes('调借到期提醒')) {
        const next = title.nextElementSibling;
        title.remove();
        if (next?.classList.contains('list')) next.remove();
      }
    }

    // 首页四个经营指标只留核心数字，不再展示细分说明。
    const metricLabels = ['今日成交','今日毛利','本月成交','本月毛利'];
    const metrics = [...main.querySelectorAll(':scope > .grid-2:first-child .metric')];
    metrics.forEach((metric, index) => {
      const label = metric.querySelector('.label');
      if (label && metricLabels[index]) label.textContent = metricLabels[index];
      metric.querySelector('.hint')?.remove();
    });

    // 收集原有按钮，保留原来的点击事件，只精简视觉和文字。
    const nameMap = {
      quickSale: '销售',
      quickProduct: '商品',
      quickLoan: '调借',
      quickPassDeal: '过手',
      quickTradeGallery: '货源',
      quickExternalGoods: '外部货',
      quickStocktake: '盘点',
      quickContent: '内容'
    };

    const cards = Object.keys(nameMap)
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (cards.length && !document.querySelector('#mocuiHomeActions')) {
      const actionSection = document.createElement('section');
      actionSection.id = 'mocuiHomeActions';
      actionSection.className = 'mocui-home-actions';
      const grid = document.createElement('div');
      grid.className = 'mocui-home-action-grid';

      for (const card of cards) {
        const id = card.id;
        card.className = 'mocui-home-action';
        card.innerHTML = `<span>${nameMap[id]}</span>`;
        grid.appendChild(card);
      }

      actionSection.appendChild(grid);

      // 移除原两组复杂操作区。
      main.querySelectorAll('.workflow-section').forEach(el => el.remove());

      // 移除“商品仓库”统计，首页只保留核心经营数字 + 主要按钮。
      const currentTitles = [...main.querySelectorAll('.section-title')];
      for (const title of currentTitles) {
        if (title.textContent.includes('商品仓库')) {
          const next = title.nextElementSibling;
          title.remove();
          if (next?.classList.contains('grid-3')) next.remove();
        }
      }

      const topGrid = main.querySelector(':scope > .grid-2');
      if (topGrid) topGrid.insertAdjacentElement('afterend', actionSection);
      else main.prepend(actionSection);
    }
  }

  function patchDashboard() {
    if (typeof renderDashboard !== 'function' || renderDashboard.__mocuiV23Patched) return;
    const original = renderDashboard;
    const wrapped = async function(...args) {
      const result = await original.apply(this, args);
      simplifyDashboardDom();
      return result;
    };
    wrapped.__mocuiV23Patched = true;
    renderDashboard = wrapped;
  }

  function runCurrentPageEnhancement() {
    if (appState?.route === 'product-detail') void addProductRelations();
    if (appState?.route === 'dashboard') simplifyDashboardDom();
    if (document.querySelector('#productForm')) installProductCategoryGuard();
  }

  function install() {
    patchProductForm();
    patchProductDetail();
    patchDashboard();
    runCurrentPageEnhancement();

    const observer = new MutationObserver(() => {
      requestAnimationFrame(runCurrentPageEnhancement);
    });
    observer.observe(document.querySelector('#main') || document.body, {
      childList: true,
      subtree: false
    });
    observer.observe(document.querySelector('#modalRoot') || document.body, {
      childList: true,
      subtree: true
    });

    window.MocuiV23 = {
      version: VERSION,
      refreshProductRelations: addProductRelations,
      simplifyDashboard: simplifyDashboardDom
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, {once:true});
  } else {
    install();
  }
})();
