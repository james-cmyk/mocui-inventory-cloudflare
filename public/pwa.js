'use strict';
(() => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const APP_CACHE_PREFIX = 'mocui-';
  let deferredPrompt = null;
  let registration = null;
  let checkingUpdate = false;

  const qs = (s) => document.querySelector(s);

  function notify(message, duration = 2200) {
    const toast = qs('#toast');
    if (toast) {
      toast.textContent = message;
      toast.classList.add('show');
      clearTimeout(notify.t);
      notify.t = setTimeout(() => toast.classList.remove('show'), duration);
      return;
    }
    console.log('[MocuiPWA]', message);
  }

  function injectMaintenanceStyle() {
    if (qs('#mocuiPwaMaintenanceStyle')) return;
    const style = document.createElement('style');
    style.id = 'mocuiPwaMaintenanceStyle';
    style.textContent = `
      .mocui-update-card{margin:14px 0 24px;padding:16px;border:1px solid #e4e7ec;border-radius:16px;background:#fff}
      .mocui-update-card h3{margin:0;font-size:16px;color:#101828}
      .mocui-update-card p{margin:6px 0 14px;font-size:12px;line-height:1.65;color:#667085}
      .mocui-update-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .mocui-update-actions button{height:42px;border-radius:12px;border:1px solid #d0d5dd;background:#fff;color:#101828;font-size:14px;font-weight:700}
      .mocui-update-actions button.primary{background:#101828;border-color:#101828;color:#fff}
      .mocui-update-actions button:disabled{opacity:.55}
      .mocui-update-note{margin-top:10px;font-size:11px;line-height:1.55;color:#98a2b3}
    `;
    document.head.appendChild(style);
  }

  function createInstallCard() {
    if (isStandalone || sessionStorage.getItem('mocui_pwa_install_dismissed') === '1') return;
    const card = document.createElement('div');
    card.id = 'pwaInstallCard';
    card.className = 'pwa-install-card';
    card.innerHTML = `
      <div class="pwa-install-icon"><img src="icon-192.png" alt=""></div>
      <div class="pwa-install-copy"><strong>安装“漠翠进销存”</strong><span>添加到 iPhone 主屏幕，全屏打开，使用更像 App。</span></div>
      <button class="pwa-install-action" type="button">安装</button>
      <button class="pwa-install-close" type="button" aria-label="关闭">×</button>`;
    document.body.appendChild(card);
    card.querySelector('.pwa-install-close').onclick = () => {
      sessionStorage.setItem('mocui_pwa_install_dismissed', '1');
      card.remove();
    };
    card.querySelector('.pwa-install-action').onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice.catch(() => null);
        deferredPrompt = null;
        card.remove();
        return;
      }
      showIOSGuide();
    };
  }

  function showIOSGuide() {
    const old = qs('#pwaGuide');
    if (old) old.remove();
    const guide = document.createElement('div');
    guide.id = 'pwaGuide';
    guide.className = 'pwa-guide-backdrop';
    guide.innerHTML = `<div class="pwa-guide-sheet">
      <div class="pwa-guide-handle"></div>
      <h2>添加到 iPhone 主屏幕</h2>
      <ol>
        <li>请用 <strong>Safari</strong> 打开当前网址。</li>
        <li>点击浏览器底部的 <strong>分享按钮</strong> <span class="pwa-share-symbol">□↑</span>。</li>
        <li>向下滑，选择 <strong>“添加到主屏幕”</strong>。</li>
        <li>点击右上角 <strong>“添加”</strong>。</li>
      </ol>
      <div class="pwa-guide-note">以后直接点击桌面的“漠翠进销存”图标，手机与电脑仍使用同一套云端数据。</div>
      <button type="button">我知道了</button>
    </div>`;
    document.body.appendChild(guide);
    guide.onclick = (e) => { if (e.target === guide || e.target.tagName === 'BUTTON') guide.remove(); };
  }

  function updateOnlineState() {
    document.documentElement.dataset.online = navigator.onLine ? 'yes' : 'no';
    let bar = qs('#pwaOfflineBar');
    if (!navigator.onLine) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'pwaOfflineBar';
        bar.className = 'pwa-offline-bar';
        bar.textContent = '当前离线：本机数据仍可安全保存，联网后自动同步';
        document.body.appendChild(bar);
      }
    } else if (bar) {
      bar.textContent = '网络已恢复，正在连接云端…';
      setTimeout(() => bar.remove(), 1800);
    }
  }

  function showUpdate(worker) {
    if (!worker) return;
    if (qs('#pwaUpdateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwaUpdateBar';
    bar.className = 'pwa-update-bar';
    bar.innerHTML = `<span>发现新版本</span><button type="button">立即更新</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = () => activateWaitingWorker(worker);
  }

  async function activateWaitingWorker(worker) {
    const target = worker || registration?.waiting;
    if (!target) {
      notify('没有等待安装的新版本');
      return false;
    }
    sessionStorage.removeItem('mocui_pwa_reloaded');
    target.postMessage({ type: 'SKIP_WAITING' });
    notify('正在更新应用…');
    return true;
  }

  async function checkForUpdate({ silent = false } = {}) {
    if (!('serviceWorker' in navigator)) {
      if (!silent) notify('当前环境不支持应用更新检查');
      return;
    }
    if (!navigator.onLine) {
      if (!silent) notify('当前离线，联网后再检查更新');
      return;
    }
    if (checkingUpdate) return;
    checkingUpdate = true;
    try {
      registration = registration || await navigator.serviceWorker.getRegistration('./') || await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });

      if (registration.waiting) {
        showUpdate(registration.waiting);
        if (!silent) notify('发现已下载的新版本，可以立即更新');
        return;
      }

      await registration.update();
      await new Promise(resolve => setTimeout(resolve, 1200));

      if (registration.waiting) {
        showUpdate(registration.waiting);
        if (!silent) notify('发现新版本，可以立即更新');
      } else if (!silent) {
        notify('当前已经是最新版本');
      }
    } catch (error) {
      console.warn('PWA update check failed', error);
      if (!silent) notify(`检查更新失败：${error?.message || '请稍后重试'}`, 3200);
    } finally {
      checkingUpdate = false;
    }
  }

  async function repairAppCache() {
    if (!('caches' in window)) {
      notify('当前环境不支持缓存修复');
      return;
    }
    if (!navigator.onLine) {
      notify('当前离线，不能刷新应用缓存');
      return;
    }

    const ok = window.confirm(
      '刷新应用缓存只会清理应用代码缓存，不会删除商品、销售、调借、本机数据库或待同步队列。\n\n确定继续吗？'
    );
    if (!ok) return;

    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(APP_CACHE_PREFIX)).map((key) => caches.delete(key))
      );

      registration = registration || await navigator.serviceWorker.getRegistration('./');
      if (registration) {
        await registration.update().catch(() => {});
        if (registration.waiting) {
          sessionStorage.removeItem('mocui_pwa_reloaded');
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
      notify('应用缓存已刷新，正在重新加载…');
      setTimeout(() => location.reload(), 800);
    } catch (error) {
      console.warn('PWA cache repair failed', error);
      notify(`缓存修复失败：${error?.message || '请稍后重试'}`, 3200);
    }
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });

      if (registration.waiting) showUpdate(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!sessionStorage.getItem('mocui_pwa_reloaded')) {
          sessionStorage.setItem('mocui_pwa_reloaded', '1');
          location.reload();
        }
      });

      setTimeout(() => void checkForUpdate({ silent: true }), 800);
      setInterval(() => registration?.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) {
      console.warn('PWA service worker registration failed', e);
    }
  }

  function ensureMaintenanceCard() {
    injectMaintenanceStyle();
    const main = qs('#main');
    const moreActive = qs('.nav-item[data-route="more"].active');
    if (!main || !moreActive || qs('#mocuiUpdateMaintenanceCard')) return;

    const card = document.createElement('section');
    card.id = 'mocuiUpdateMaintenanceCard';
    card.className = 'mocui-update-card';
    card.innerHTML = `
      <h3>应用与更新</h3>
      <p>如果错过“立即更新”提示，可在这里重新检查。缓存修复只处理应用代码，不会删除业务数据。</p>
      <div class="mocui-update-actions">
        <button id="mocuiCheckUpdate" class="primary" type="button">检查更新</button>
        <button id="mocuiRepairCache" type="button">刷新应用缓存</button>
      </div>
      <div class="mocui-update-note">不会清除商品、销售、调借、本机数据库或待同步 Outbox。</div>
    `;
    main.appendChild(card);

    qs('#mocuiCheckUpdate')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '检查中…';
      await checkForUpdate();
      button.disabled = false;
      button.textContent = '检查更新';
    });
    qs('#mocuiRepairCache')?.addEventListener('click', repairAppCache);
  }

  const maintenanceObserver = new MutationObserver(() => setTimeout(ensureMaintenanceCard, 0));

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    createInstallCard();
  });
  window.addEventListener('appinstalled', () => qs('#pwaInstallCard')?.remove());
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);

  window.MocuiPWA = {
    showInstallGuide: showIOSGuide,
    isStandalone,
    checkForUpdate,
    repairAppCache,
  };

  document.addEventListener('DOMContentLoaded', () => {
    updateOnlineState();
    registerSW();
    if (isIOS) setTimeout(createInstallCard, 1800);

    injectMaintenanceStyle();
    const main = qs('#main');
    if (main) maintenanceObserver.observe(main, { childList: true });
    const nav = qs('.bottom-nav');
    if (nav) maintenanceObserver.observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] });
    setTimeout(ensureMaintenanceCard, 900);
  });
})();
