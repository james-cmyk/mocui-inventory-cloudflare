'use strict';
(() => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let deferredPrompt = null;

  const qs = (s) => document.querySelector(s);

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
        bar.textContent = '当前离线：可查看已缓存页面，新增数据请联网后操作';
        document.body.appendChild(bar);
      }
    } else if (bar) {
      bar.textContent = '网络已恢复，正在连接云端…';
      setTimeout(() => bar.remove(), 1800);
    }
  }

  function showUpdate(worker) {
    if (qs('#pwaUpdateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'pwaUpdateBar';
    bar.className = 'pwa-update-bar';
    bar.innerHTML = `<span>发现新版本</span><button type="button">立即更新</button>`;
    document.body.appendChild(bar);
    bar.querySelector('button').onclick = () => {
      worker?.postMessage({type:'SKIP_WAITING'});
      location.reload();
    };
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'});
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
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
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) {
      console.warn('PWA service worker registration failed', e);
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    createInstallCard();
  });
  window.addEventListener('appinstalled', () => qs('#pwaInstallCard')?.remove());
  window.addEventListener('online', updateOnlineState);
  window.addEventListener('offline', updateOnlineState);

  window.MocuiPWA = {showInstallGuide: showIOSGuide, isStandalone};

  document.addEventListener('DOMContentLoaded', () => {
    updateOnlineState();
    registerSW();
    if (isIOS) setTimeout(createInstallCard, 1800);
  });
})();
