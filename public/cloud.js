'use strict';
(() => {
  let revision = 0;
  let timer = null;
  let syncing = false;
  let pulling = false;
  let dirty = false;
  let mode = 'checking';
  let health = null;
  const deviceId = (() => {
    const key = 'mocui_cloud_device_id';
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    return value;
  })();

  const api = async (path, options = {}) => {
    const headers = {...(options.headers || {})};
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers,
    });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const error = new Error(body?.error || body || `请求失败 ${res.status}`);
      error.status = res.status;
      error.payload = body;
      throw error;
    }
    return body;
  };

  const setStatus = (nextMode, text = '') => {
    mode = nextMode;
    const subtitle = document.querySelector('#pageSubtitle');
    const badge = document.querySelector('#cloudBadge');
    if (subtitle) subtitle.textContent = text || (mode === 'cloud' ? 'Cloudflare 云端同步' : '本机模式');
    if (badge) {
      badge.className = `cloud-badge ${mode}`;
      badge.textContent = mode === 'cloud' ? '云端' : mode === 'syncing' ? '同步中' : mode === 'error' ? '同步异常' : '本机';
    }
    document.documentElement.dataset.cloudMode = mode;
    window.dispatchEvent(new CustomEvent('cloud-mode-change', {detail:{mode, health}}));
  };

  function authScreen({setup = false} = {}) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'cloud-login';
      wrap.innerHTML = setup
        ? `<div class="cloud-login-card"><div class="setup-mark">首次设置</div><h1>漠翠进销存</h1><p>这是你的私人进销存。请直接设置管理密码，完成后系统会自动登录。</p><form>
            <label>设置管理密码</label><input name="password" type="password" autocomplete="new-password" placeholder="至少10位" minlength="10" maxlength="128" required autofocus>
            <label>再次输入密码</label><input name="confirm" type="password" autocomplete="new-password" placeholder="再次确认" minlength="10" maxlength="128" required>
            <button type="submit">设置密码并进入系统</button><div class="cloud-login-error"></div>
          </form><small>首次设置只允许成功一次。请使用不与微信、邮箱或银行卡相同的独立密码。</small></div>`
        : `<div class="cloud-login-card"><h1>漠翠进销存</h1><p>请输入管理密码</p><form>
            <input name="password" type="password" autocomplete="current-password" placeholder="管理密码" required>
            <button type="submit">登录</button><div class="cloud-login-error"></div>
          </form><small>系统仅供你本人使用，数据保存在 Cloudflare D1 与 R2。</small></div>`;
      document.body.appendChild(wrap);
      const form = wrap.querySelector('form');
      form.onsubmit = async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        const error = form.querySelector('.cloud-login-error');
        const password = form.elements.password.value;
        if (setup && password !== form.elements.confirm.value) {
          error.textContent = '两次输入的密码不一致';
          return;
        }
        button.disabled = true;
        error.textContent = '';
        try {
          if (setup) {
            await api('/api/auth/setup', {
              method:'POST',
              body:JSON.stringify({password}),
            });
          } else {
            await api('/api/auth/login', {method:'POST', body:JSON.stringify({password})});
          }
          wrap.remove();
          resolve();
        } catch (e) {
          error.textContent = e.message;
          button.disabled = false;
        }
      };
    });
  }

  async function ensureAuthenticated() {
    try {
      await api('/api/auth/me');
    } catch (e) {
      if (e.status === 401) await authScreen();
      else throw e;
    }
  }

  async function exportStores() {
    const stores = {};
    for (const name of STORES) stores[name] = await dbAll(name);
    return {
      app:'漠翠进销存',
      version:'2.8-cloud',
      exportedAt:new Date().toISOString(),
      deviceId,
      stores,
    };
  }

  async function importStores(snapshot) {
    if (!snapshot?.stores) return;
    window.__cloudImporting = true;
    try {
      for (const name of STORES) {
        await dbClear(name, true);
        for (const row of snapshot.stores[name] || []) await dbPut(name, row, true);
      }
    } finally {
      window.__cloudImporting = false;
    }
  }

  async function pull() {
    if (mode !== 'cloud') return {skipped:true, mode};
    if (pulling) return {queued:true};
    pulling = true;
    setStatus('syncing', '正在后台同步');
    try {
      const result = await api('/api/sync');
      revision = Number(result.revision || 0);
      if (result.snapshot) await importStores(result.snapshot);
      setStatus('cloud', result.updatedAt ? `云端已同步 · ${new Date(result.updatedAt).toLocaleString('zh-CN')}` : 'Cloudflare 云端同步');
      window.dispatchEvent(new CustomEvent('cloud-pull-ok', {detail:{revision}}));
      return result;
    } catch (error) {
      setStatus('error', '云端读取失败');
      window.dispatchEvent(new CustomEvent('cloud-pull-error', {detail:{message:error.message}}));
      throw error;
    } finally {
      pulling = false;
      if (dirty) schedule(500);
    }
  }

  async function push({force = false} = {}) {
    if (mode !== 'cloud' && mode !== 'error') return {skipped:true, mode};
    if (syncing || pulling || window.__cloudImporting) {
      dirty = true;
      return {queued:true};
    }
    syncing = true;
    dirty = false;
    setStatus('syncing', '正在保存到云端');
    try {
      const snapshot = await exportStores();
      const result = await api(`/api/sync${force ? '?force=1' : ''}`, {
        method:'PUT',
        body:JSON.stringify({revision, snapshot, deviceId}),
      });
      revision = Number(result.revision || revision + 1);
      if (result.snapshot) await importStores(result.snapshot);
      setStatus('cloud', `云端已保存 · 版本 ${revision}`);
      window.dispatchEvent(new CustomEvent('cloud-sync-ok', {detail:{revision}}));
      return result;
    } catch (e) {
      if (e.status === 409) {
        setStatus('error', '检测到其他设备的新数据');
        const useRemote = window.confirm('云端数据已在其他设备更新。\n\n点击“确定”：载入云端最新数据。\n点击“取消”：保留本机数据，稍后可在“更多→数据与设置”选择覆盖云端。');
        if (useRemote) {
          setStatus('cloud');
          await pull();
          location.reload();
        }
      } else {
        console.error('cloud sync failed', e);
        setStatus('error', `同步失败：${e.message}`);
        window.dispatchEvent(new CustomEvent('cloud-sync-error', {detail:{message:e.message}}));
      }
      throw e;
    } finally {
      syncing = false;
      if (dirty) schedule(800);
    }
  }

  function schedule(delay = 1000) {
    if (window.__cloudImporting) return;
    if (syncing || pulling || mode === 'syncing') {
      dirty = true;
      return;
    }
    if (!['cloud','error'].includes(mode)) return;
    clearTimeout(timer);
    timer = setTimeout(() => void push().catch(() => {}), delay);
  }

  async function bootstrap({deferPull = false} = {}) {
    try {
      setStatus('checking', '正在验证登录');
      // 正常已登录启动只请求一次 /auth/me；仅未登录时再查询首次设置状态。
      try {
        await api('/api/auth/me');
      } catch (error) {
        if (error.status !== 401) throw error;
        health = await api('/api/health');
        await authScreen({setup:Boolean(health.needsSetup)});
      }
      setStatus('cloud', '本地数据已就绪');
      if (!deferPull) await pull();
    } catch (error) {
      console.error('cloud bootstrap failed', error);
      setStatus('error', `云端连接失败：${error.message}`);
      throw error;
    }
    return {mode, health};
  }

  async function logout() {
    await api('/api/auth/logout', {method:'POST'});
    location.reload();
  }

  async function changePassword(oldPassword, newPassword) {
    return api('/api/auth/change-password', {
      method:'POST',
      body:JSON.stringify({oldPassword, newPassword}),
    });
  }

  async function listBackups() {
    return api('/api/backups');
  }

  async function restoreBackup(backupRevision) {
    const result = await api(`/api/backups/${backupRevision}/restore`, {method:'POST'});
    revision = Number(result.revision || revision);
    if (result.snapshot) await importStores(result.snapshot);
    return result;
  }

  async function listSessions() { return api('/api/auth/sessions'); }
  async function logoutOtherSessions() { return api('/api/auth/sessions/logout-others', {method:'POST'}); }
  async function revokeSession(sessionId) { return api(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {method:'DELETE'}); }

  window.CloudSync = {
    bootstrap,
    pull,
    push,
    forcePush: () => push({force:true}),
    schedule,
    logout,
    changePassword,
    listBackups,
    restoreBackup,
    listSessions,
    logoutOtherSessions,
    revokeSession,
    get mode() { return mode; },
    get health() { return health; },
    get revision() { return revision; },
    get deviceId() { return deviceId; },
  };
})();
