'use strict';
(() => {
  const DB_NAME = 'mocui_inventory_db';
  const STORES = ['products','categories','customers','sales','loans','stockMoves','stocktakes','settings','auditLogs'];
  const DIRTY_KEY = 'mocui_local_first_v2_dirty';
  const OLD_DIRTY_KEY = 'mocui_cloud_unsynced_v1';
  const STATE_KEY = 'mocui_local_first_v2_state';
  const cloud = window.CloudSync;
  if (!cloud || cloud.__localFirstV2Installed) return;

  let authenticated = false;
  let syncing = false;
  let pulling = false;
  let timer = null;
  let retryTimer = null;
  let retryMs = 2500;
  let revision = Number(cloud.revision || 0);

  const original = {
    bootstrap: cloud.bootstrap.bind(cloud),
    logout: cloud.logout.bind(cloud),
    changePassword: cloud.changePassword.bind(cloud),
    listBackups: cloud.listBackups.bind(cloud),
    restoreBackup: cloud.restoreBackup.bind(cloud),
    listSessions: cloud.listSessions.bind(cloud),
    logoutOtherSessions: cloud.logoutOtherSessions.bind(cloud),
    revokeSession: cloud.revokeSession.bind(cloud),
  };

  // 旧 app.js 会在本地写入前等待首次云端 pull。
  // v2 改为 local-first：业务写入绝不等待网络。
  let initialPullPromise = null;
  try {
    Object.defineProperty(window, '__mocuiInitialPullPromise', {
      configurable: true,
      get() { return null; },
      set(value) { initialPullPromise = value || null; },
    });
  } catch (_) {
    window.__mocuiInitialPullPromise = null;
  }

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); }
    catch (_) { return null; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function getDirty() {
    const own = readJSON(DIRTY_KEY);
    const legacy = readJSON(OLD_DIRTY_KEY);
    return own?.dirty ? own : legacy?.dirty ? legacy : null;
  }
  function markDirty(reason = 'local-write') {
    const old = getDirty();
    const next = {
      dirty: true,
      firstAt: old?.firstAt || Date.now(),
      lastAt: Date.now(),
      reason,
    };
    writeJSON(DIRTY_KEY, next);
    document.documentElement.dataset.localDirty = '1';
    updateStatus('local-saved');
  }
  function clearDirty() {
    try { localStorage.removeItem(DIRTY_KEY); } catch (_) {}
    try { localStorage.removeItem(OLD_DIRTY_KEY); } catch (_) {}
    delete document.documentElement.dataset.localDirty;
    updateStatus('synced');
  }
  function isDirty() { return Boolean(getDirty()?.dirty); }

  function saveState(extra = {}) {
    writeJSON(STATE_KEY, {
      ...readJSON(STATE_KEY),
      revision,
      updatedAt: Date.now(),
      ...extra,
    });
  }

  function updateStatus(kind, detail = '') {
    const badge = document.querySelector('#cloudBadge');
    const subtitle = document.querySelector('#pageSubtitle');
    if (!badge && !subtitle) return;

    if (kind === 'local-saved') {
      if (badge) { badge.className = 'cloud-badge syncing'; badge.textContent = '待同步'; }
      if (subtitle) subtitle.textContent = detail || '本机已保存 · 等待云端同步';
    } else if (kind === 'syncing') {
      if (badge) { badge.className = 'cloud-badge syncing'; badge.textContent = '同步中'; }
      if (subtitle) subtitle.textContent = detail || '本机数据安全 · 正在后台同步';
    } else if (kind === 'synced') {
      if (badge) { badge.className = 'cloud-badge cloud'; badge.textContent = '云端'; }
      if (subtitle) subtitle.textContent = detail || '本机已保存 · 云端已确认';
    } else if (kind === 'offline') {
      if (badge) { badge.className = 'cloud-badge error'; badge.textContent = '待同步'; }
      if (subtitle) subtitle.textContent = detail || '本机数据安全 · 网络恢复后自动同步';
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('本机数据库打开失败'));
    });
  }
  function requestPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('本机数据库操作失败'));
    });
  }
  async function snapshotStores() {
    const db = await openDb();
    try {
      const stores = {};
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) { stores[name] = []; continue; }
        const tx = db.transaction(name, 'readonly');
        stores[name] = await requestPromise(tx.objectStore(name).getAll());
      }
      return stores;
    } finally {
      db.close();
    }
  }

  function timeOf(row) {
    const keys = ['updatedAt','modifiedAt','restoredAt','archivedAt','deletedAt','createdAt','date','businessDate'];
    for (const key of keys) {
      const value = row?.[key];
      const t = typeof value === 'number' ? value : Date.parse(value || '');
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  }
  function mergeById(localRows = [], remoteRows = [], mergeItem = null) {
    const map = new Map();
    for (const row of remoteRows || []) if (row?.id != null) map.set(String(row.id), row);
    for (const local of localRows || []) {
      if (local?.id == null) continue;
      const key = String(local.id);
      const remote = map.get(key);
      if (!remote) map.set(key, local);
      else if (mergeItem) map.set(key, mergeItem(local, remote));
      else map.set(key, timeOf(local) >= timeOf(remote) ? local : remote);
    }
    return [...map.values()];
  }
  function mergeLedgerRows(local, remote, field = 'rows') {
    const newer = timeOf(local) >= timeOf(remote) ? local : remote;
    const older = newer === local ? remote : local;
    return {
      ...older,
      ...newer,
      [field]: mergeById(local?.[field] || [], remote?.[field] || []),
      updatedAt: newer?.updatedAt || older?.updatedAt || new Date().toISOString(),
    };
  }
  function mergeTradeGallery(local, remote) {
    const batches = mergeById(local?.batches || [], remote?.batches || [], (left, right) => {
      const newer = timeOf(left) >= timeOf(right) ? left : right;
      const older = newer === left ? right : left;
      return {
        ...older,
        ...newer,
        items: mergeById(left?.items || [], right?.items || []),
        updatedAt: newer?.updatedAt || older?.updatedAt || new Date().toISOString(),
      };
    });
    const newer = timeOf(local) >= timeOf(remote) ? local : remote;
    const older = newer === local ? remote : local;
    return { ...older, ...newer, batches };
  }
  function mergeSetting(local, remote) {
    const id = String(local?.id || remote?.id || '');
    if (id === 'tradeGalleryLedgerV1') return mergeTradeGallery(local, remote);
    if (id === 'externalGoodsLedgerV1') return mergeLedgerRows(local, remote, 'rows');
    if (id === 'passDealsLedgerV1') return mergeLedgerRows(local, remote, 'rows');
    return timeOf(local) >= timeOf(remote) ? local : remote;
  }
  function mergeSnapshots(local = {}, remote = {}) {
    const out = {};
    for (const name of STORES) {
      out[name] = name === 'settings'
        ? mergeById(local[name] || [], remote[name] || [], mergeSetting)
        : mergeById(local[name] || [], remote[name] || []);
    }
    return out;
  }

  // 只做 upsert，绝不 clear 本机库。
  async function applyMergedStores(stores) {
    const db = await openDb();
    try {
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) continue;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(name, 'readwrite');
          const os = tx.objectStore(name);
          for (const row of stores[name] || []) os.put(row);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error(`合并 ${name} 失败`));
          tx.onabort = () => reject(tx.error || new Error(`合并 ${name} 被中止`));
        });
      }
    } finally {
      db.close();
    }
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const res = await fetch(path, { credentials: 'same-origin', ...options, headers });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const error = new Error(body?.error || body || `请求失败 ${res.status}`);
      error.status = res.status;
      error.payload = body;
      throw error;
    }
    return body;
  }

  async function getRemote() {
    const result = await api('/api/sync');
    revision = Number(result.revision || 0);
    saveState({ revision, lastRemoteReadAt: Date.now() });
    return result;
  }

  async function safePull() {
    if (!authenticated || pulling) return { queued: pulling, skipped: !authenticated };
    pulling = true;
    updateStatus(
      isDirty() ? 'local-saved' : 'syncing',
      isDirty() ? '本机已保存 · 正在检查云端新数据' : '正在读取云端数据'
    );
    try {
      const [local, remoteResult] = await Promise.all([snapshotStores(), getRemote()]);
      const remote = remoteResult.snapshot?.stores || remoteResult.snapshot || {};
      if (remoteResult.snapshot) {
        const merged = mergeSnapshots(local, remote);
        await applyMergedStores(merged);
      }
      if (isDirty()) schedule(150);
      else {
        updateStatus(
          'synced',
          remoteResult.updatedAt
            ? `本机已保存 · 云端已同步 ${new Date(remoteResult.updatedAt).toLocaleString('zh-CN')}`
            : '本机已保存 · 云端已确认'
        );
      }
      window.dispatchEvent(new CustomEvent('cloud-pull-ok', { detail: { revision } }));
      return remoteResult;
    } catch (error) {
      updateStatus('offline', `本机数据安全 · 云端读取失败：${error.message}`);
      window.dispatchEvent(new CustomEvent('cloud-pull-error', { detail: { message: error.message } }));
      throw error;
    } finally {
      pulling = false;
    }
  }

  async function putSnapshot(localStores, expectedRevision) {
    const snapshot = {
      app: '漠翠进销存',
      version: '2.0-local-first',
      exportedAt: new Date().toISOString(),
      deviceId: cloud.deviceId,
      stores: localStores,
    };
    return api('/api/sync', {
      method: 'PUT',
      body: JSON.stringify({ revision: expectedRevision, snapshot, deviceId: cloud.deviceId }),
    });
  }

  async function safePush() {
    if (!authenticated) {
      markDirty('auth-pending');
      return { queued: true };
    }
    if (syncing || pulling) {
      markDirty('sync-busy');
      return { queued: true };
    }
    if (!isDirty()) return { skipped: true, clean: true };

    syncing = true;
    clearTimeout(retryTimer);
    updateStatus('syncing');
    try {
      let local = await snapshotStores();
      let expected = revision;

      try {
        const remote = await getRemote();
        expected = Number(remote.revision || 0);
        if (remote.snapshot) {
          const remoteStores = remote.snapshot?.stores || remote.snapshot || {};
          local = mergeSnapshots(local, remoteStores);
          await applyMergedStores(local);
        }
      } catch (error) {
        if (error.status === 401) throw error;
        // 网络抖动不阻断本机保存；继续用已知 revision 尝试。
      }

      let result;
      try {
        result = await putSnapshot(local, expected);
      } catch (error) {
        if (error.status !== 409) throw error;

        // 并发冲突：先合并云端，再重试一次；不 force 覆盖。
        const remote = await getRemote();
        const remoteStores = remote.snapshot?.stores || remote.snapshot || {};
        local = mergeSnapshots(local, remoteStores);
        await applyMergedStores(local);
        result = await putSnapshot(local, Number(remote.revision || 0));
      }

      revision = Number(result.revision || revision + 1);
      saveState({ revision, lastSyncOkAt: Date.now() });
      clearDirty();
      retryMs = 2500;
      window.dispatchEvent(new CustomEvent('cloud-sync-ok', { detail: { revision } }));
      return result;
    } catch (error) {
      markDirty(error.status === 401 ? 'login-required' : 'sync-failed');
      updateStatus(
        'offline',
        error.status === 401
          ? '本机数据安全 · 请重新登录后同步'
          : '本机数据安全 · 云端稍后自动重试'
      );
      window.dispatchEvent(new CustomEvent('cloud-sync-error', { detail: { message: error.message } }));

      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (navigator.onLine) void safePush().catch(() => {});
      }, retryMs);
      retryMs = Math.min(60000, Math.round(retryMs * 1.8));
      throw error;
    } finally {
      syncing = false;
    }
  }

  function schedule(delay = 650) {
    if (window.__cloudImporting) return;
    if (!authenticated) return;

    // dbPut/dbAdd/dbDelete 已经完成 IndexedDB 写入后才会调用 schedule。
    // 因此这里同步写入 dirty 标记，随后云端异步处理。
    markDirty('local-write');

    clearTimeout(timer);
    timer = setTimeout(() => {
      void safePush().catch(() => {});
    }, Math.max(80, Number(delay) || 650));
  }

  async function bootstrap(options = {}) {
    const result = await original.bootstrap({ ...options, deferPull: true });
    authenticated = true;

    const persisted = readJSON(STATE_KEY);
    if (Number.isFinite(Number(persisted?.revision))) {
      revision = Number(persisted.revision || revision);
    }

    if (isDirty()) updateStatus('local-saved');
    else updateStatus('synced', '本机数据已就绪 · 正在检查云端');

    if (isDirty()) {
      setTimeout(() => void safePush().catch(() => {}), 120);
    }
    return result;
  }

  async function forcePush() {
    markDirty('manual-sync');
    return safePush();
  }

  window.addEventListener('online', () => {
    if (authenticated && isDirty()) void safePush().catch(() => {});
    else if (authenticated) void safePull().catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && authenticated && isDirty()) {
      void safePush().catch(() => {});
    }
  });

  window.addEventListener('pagehide', () => {
    // 不把 pagehide 的网络请求当作安全保障；这里只保留持久 dirty 状态。
    if (isDirty()) markDirty('app-backgrounded');
  });

  cloud.bootstrap = bootstrap;
  cloud.pull = safePull;
  cloud.push = safePush;
  cloud.forcePush = forcePush;
  cloud.schedule = schedule;
  cloud.hasUnsyncedLocalData = isDirty;
  cloud.localFirstV2 = true;
  cloud.__localFirstV2Installed = true;

  try {
    Object.defineProperty(cloud, 'revision', {
      configurable: true,
      get: () => revision,
    });
  } catch (_) {}

  if (isDirty()) document.documentElement.dataset.localDirty = '1';
})();
