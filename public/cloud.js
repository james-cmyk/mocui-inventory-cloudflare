'use strict';
(() => {
  let revision = 0;
  let timer = null;
  let syncing = false;
  let dirty = false;

  const api = async (path, options = {}) => {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: {'content-type':'application/json', ...(options.headers || {})},
      ...options,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(body.error || `请求失败 ${res.status}`);
      error.status = res.status;
      error.payload = body;
      throw error;
    }
    return body;
  };

  const login = () => new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'cloud-login';
    wrap.innerHTML = `<div class="cloud-login-card"><h1>漠翠进销存</h1><p>请输入云端管理密码</p><form><input type="password" autocomplete="current-password" placeholder="管理密码" required><button type="submit">登录</button><div class="cloud-login-error"></div></form></div>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const error = form.querySelector('.cloud-login-error');
      button.disabled = true; error.textContent = '';
      try {
        await api('/api/auth/login', {method:'POST', body:JSON.stringify({password:form.querySelector('input').value})});
        wrap.remove(); resolve();
      } catch (e) {
        error.textContent = e.message;
        button.disabled = false;
      }
    };
  });

  async function ensureAuthenticated() {
    try { await api('/api/auth/me'); }
    catch (e) { if (e.status === 401) { await login(); } else throw e; }
  }

  async function exportStores() {
    const stores = {};
    for (const name of STORES) stores[name] = await dbAll(name);
    return {app:'漠翠进销存', version:'1.4-cloud', exportedAt:new Date().toISOString(), stores};
  }

  async function importStores(snapshot) {
    if (!snapshot?.stores) return;
    window.__cloudImporting = true;
    try {
      for (const name of STORES) {
        await dbClear(name, true);
        for (const row of snapshot.stores[name] || []) await dbPut(name, row, true);
      }
    } finally { window.__cloudImporting = false; }
  }

  async function pull() {
    const result = await api('/api/sync');
    revision = Number(result.revision || 0);
    if (result.snapshot) await importStores(result.snapshot);
  }

  async function push() {
    if (syncing || window.__cloudImporting) { dirty = true; return; }
    syncing = true; dirty = false;
    try {
      const snapshot = await exportStores();
      const result = await api('/api/sync', {method:'PUT', body:JSON.stringify({revision, snapshot})});
      revision = Number(result.revision || revision + 1);
      window.dispatchEvent(new CustomEvent('cloud-sync-ok', {detail:{revision}}));
    } catch (e) {
      if (e.status === 409) {
        const useRemote = window.confirm('云端数据已在其他设备更新。点击“确定”载入云端数据；点击“取消”保留本机数据并稍后手动处理。');
        if (useRemote) { await pull(); location.reload(); }
      } else {
        console.error('cloud sync failed', e);
        window.dispatchEvent(new CustomEvent('cloud-sync-error', {detail:{message:e.message}}));
      }
    } finally {
      syncing = false;
      if (dirty) schedule(600);
    }
  }

  function schedule(delay = 900) {
    if (window.__cloudImporting) return;
    clearTimeout(timer);
    timer = setTimeout(push, delay);
  }

  async function bootstrap() {
    await ensureAuthenticated();
    await pull();
  }

  window.CloudSync = {bootstrap, pull, push, schedule, logout:() => api('/api/auth/logout',{method:'POST'}).then(()=>location.reload())};
})();
