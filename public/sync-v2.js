'use strict';
(() => {
  const MAIN_DB = "mocui_inventory_db";
  const SYNC_DB = "mocui_sync_v2";
  const SYNC_DB_VERSION = 1;
  const STORES = [
    "products","categories","customers","sales","loans",
    "stockMoves","stocktakes","settings","auditLogs",
  ];
  const DIRTY_KEY = "mocui_sync_v2_dirty";
  const LEGACY_DIRTY_KEYS = ["mocui_local_first_v2_dirty","mocui_cloud_unsynced_v1"];
  const MAX_BATCH_OPS = 20;
  const MAX_BATCH_BYTES = 8 * 1024 * 1024;
  const cloud = window.CloudSync;
  if (!cloud || cloud.__incrementalV2Installed) return;

  let authenticated = false;
  let syncing = false;
  let timer = null;
  let retryTimer = null;
  let retryDelay = 2000;
  let cursor = 0;

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

  // app.js 旧逻辑会让业务写入等待首次云端 pull。
  // v2 增量同步必须始终本机先保存，所以 getter 永远返回 null。
  try {
    Object.defineProperty(window, "__mocuiInitialPullPromise", {
      configurable: true,
      get() { return null; },
      set(_) {},
    });
  } catch (_) {
    window.__mocuiInitialPullPromise = null;
  }

  const now = () => Date.now();
  const entityKey = (store, recordId) => `${store}:${recordId}`;

  function markDirty(reason = "local-write") {
    const value = { dirty: true, reason, at: now() };
    try { localStorage.setItem(DIRTY_KEY, JSON.stringify(value)); } catch {}
    document.documentElement.dataset.localDirty = "1";
    updateStatus("pending");
  }

  function clearDirty() {
    try { localStorage.removeItem(DIRTY_KEY); } catch {}
    for (const key of LEGACY_DIRTY_KEYS) {
      try { localStorage.removeItem(key); } catch {}
    }
    delete document.documentElement.dataset.localDirty;
  }

  function hasDirtyMarker() {
    try {
      if (JSON.parse(localStorage.getItem(DIRTY_KEY) || "null")?.dirty) return true;
    } catch {}
    for (const key of LEGACY_DIRTY_KEYS) {
      try {
        if (JSON.parse(localStorage.getItem(key) || "null")?.dirty) return true;
      } catch {}
    }
    return false;
  }

  function updateStatus(kind, detail = "") {
    const badge = document.querySelector("#cloudBadge");
    const subtitle = document.querySelector("#pageSubtitle");

    const set = (cls, badgeText, subtitleText) => {
      if (badge) {
        badge.className = `cloud-badge ${cls}`;
        badge.textContent = badgeText;
      }
      if (subtitle) subtitle.textContent = detail || subtitleText;
    };

    if (kind === "pending") set("syncing", "待同步", "本机已保存 · 等待云端");
    else if (kind === "syncing") set("syncing", "同步中", "本机数据安全 · 正在增量同步");
    else if (kind === "offline") set("error", "待同步", "本机数据安全 · 联网后自动同步");
    else if (kind === "conflict") set("error", "有冲突", "本机数据安全 · 有记录需要确认");
    else set("cloud", "云端", "本机已保存 · 云端已确认");
  }

  function openSyncDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SYNC_DB, SYNC_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("shadow")) db.createObjectStore("shadow", { keyPath: "key" });
        if (!db.objectStoreNames.contains("outbox")) {
          const store = db.createObjectStore("outbox", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("entityKey", "entityKey");
        }
        if (!db.objectStoreNames.contains("conflicts")) {
          const store = db.createObjectStore("conflicts", { keyPath: "id" });
          store.createIndex("entityKey", "entityKey");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("同步队列数据库打开失败"));
    });
  }

  function openMainDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(MAIN_DB);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("本机数据库打开失败"));
    });
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB 操作失败"));
    });
  }

  async function syncGet(store, key) {
    const db = await openSyncDb();
    try { return await reqP(db.transaction(store, "readonly").objectStore(store).get(key)); }
    finally { db.close(); }
  }

  async function syncAll(store) {
    const db = await openSyncDb();
    try { return await reqP(db.transaction(store, "readonly").objectStore(store).getAll()); }
    finally { db.close(); }
  }

  async function syncPut(store, value) {
    const db = await openSyncDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("同步状态保存失败"));
        tx.onabort = () => reject(tx.error || new Error("同步状态保存中止"));
      });
    } finally { db.close(); }
  }

  async function syncDelete(store, key) {
    const db = await openSyncDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("同步状态删除失败"));
      });
    } finally { db.close(); }
  }

  async function syncClear(store) {
    const db = await openSyncDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("同步状态清空失败"));
      });
    } finally { db.close(); }
  }

  async function metaGet(key, fallback = null) {
    return (await syncGet("meta", key))?.value ?? fallback;
  }
  async function metaSet(key, value) {
    await syncPut("meta", { key, value, updatedAt: now() });
  }

  async function snapshotLocal() {
    const db = await openMainDb();
    try {
      const result = {};
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) { result[name] = []; continue; }
        result[name] = await reqP(db.transaction(name, "readonly").objectStore(name).getAll());
      }
      return result;
    } finally { db.close(); }
  }

  async function applyLocal(store, recordId, mutation, payload) {
    const db = await openMainDb();
    try {
      if (!db.objectStoreNames.contains(store)) return;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        const os = tx.objectStore(store);
        if (mutation === "delete") os.delete(recordId);
        else os.put(payload);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error(`应用远端 ${store} 失败`));
        tx.onabort = () => reject(tx.error || new Error(`应用远端 ${store} 中止`));
      });
    } finally { db.close(); }
  }

  function recordTime(row) {
    const values = [
      row?.updatedAt,row?.modifiedAt,row?.restoredAt,row?.archivedAt,
      row?.deletedAt,row?.createdAt,row?.date,row?.businessDate,
    ];
    for (const value of values) {
      const t = typeof value === "number" ? value : Date.parse(value || "");
      if (Number.isFinite(t) && t > 0) return t;
    }
    return 0;
  }

  function mergeById(localRows = [], remoteRows = []) {
    const map = new Map();
    for (const row of remoteRows || []) if (row?.id != null) map.set(String(row.id), row);
    for (const local of localRows || []) {
      if (local?.id == null) continue;
      const key = String(local.id);
      const remote = map.get(key);
      if (!remote || recordTime(local) >= recordTime(remote)) map.set(key, local);
    }
    return [...map.values()];
  }

  function mergeSnapshots(local, remote) {
    const result = {};
    for (const store of STORES) result[store] = mergeById(local?.[store] || [], remote?.[store] || []);
    return result;
  }

  async function applyMergedSnapshot(stores) {
    const db = await openMainDb();
    try {
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) continue;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(store, "readwrite");
          const os = tx.objectStore(store);
          for (const row of stores?.[store] || []) os.put(row);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error(`合并 ${store} 失败`));
          tx.onabort = () => reject(tx.error || new Error(`合并 ${store} 中止`));
        });
      }
    } finally { db.close(); }
  }

  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }

  async function hashValue(value) {
    const bytes = new TextEncoder().encode(canonical(value));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...digest].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["content-type"]) headers["content-type"] = "application/json";
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers,
    });
    const type = response.headers.get("content-type") || "";
    const body = type.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text();
    if (!response.ok) {
      const error = new Error(body?.error || body || `请求失败 ${response.status}`);
      error.status = response.status;
      error.payload = body;
      throw error;
    }
    return body;
  }

  async function setShadowFromSnapshot(remote) {
    await syncClear("shadow");
    for (const store of STORES) {
      for (const row of remote?.[store] || []) {
        if (row?.id == null) continue;
        await syncPut("shadow", {
          key: entityKey(store, row.id),
          store,
          recordId: String(row.id),
          hash: await hashValue(row),
          deleted: false,
          lastSeq: cursor,
          updatedAt: now(),
        });
      }
    }
  }

  async function captureDiff() {
    const [local, shadows, pending, conflicts] = await Promise.all([
      snapshotLocal(),
      syncAll("shadow"),
      syncAll("outbox"),
      syncAll("conflicts"),
    ]);

    const shadowMap = new Map(shadows.map((x) => [x.key, x]));
    const pendingMap = new Map(pending.map((x) => [x.entityKey, x]));
    const conflictKeys = new Set(conflicts.map((x) => x.entityKey));
    const currentKeys = new Set();

    for (const store of STORES) {
      for (const row of local[store] || []) {
        if (row?.id == null) continue;
        const key = entityKey(store, row.id);
        currentKeys.add(key);
        if (conflictKeys.has(key)) continue;

        const hash = await hashValue(row);
        const shadow = shadowMap.get(key);
        const oldPending = pendingMap.get(key);

        if (shadow && !shadow.deleted && shadow.hash === hash) {
          if (oldPending) await syncDelete("outbox", oldPending.id);
          continue;
        }
        if (oldPending?.mutation === "put" && oldPending.hash === hash) continue;

        if (oldPending) await syncDelete("outbox", oldPending.id);
        const op = {
          id: crypto.randomUUID(),
          opId: crypto.randomUUID(),
          entityKey: key,
          store,
          recordId: String(row.id),
          mutation: "put",
          payload: row,
          hash,
          baseSeq: Math.min(Number(oldPending?.baseSeq ?? cursor), cursor),
          clientTime: now(),
          createdAt: Number(oldPending?.createdAt || now()),
        };
        await syncPut("outbox", op);
        pendingMap.set(key, op);
      }
    }

    for (const shadow of shadows) {
      if (shadow.deleted || currentKeys.has(shadow.key) || conflictKeys.has(shadow.key)) continue;
      const oldPending = pendingMap.get(shadow.key);
      if (oldPending?.mutation === "delete") continue;
      if (oldPending) await syncDelete("outbox", oldPending.id);
      const op = {
        id: crypto.randomUUID(),
        opId: crypto.randomUUID(),
        entityKey: shadow.key,
        store: shadow.store,
        recordId: shadow.recordId,
        mutation: "delete",
        payload: null,
        hash: "",
        baseSeq: Math.min(Number(oldPending?.baseSeq ?? cursor), cursor),
        clientTime: now(),
        createdAt: Number(oldPending?.createdAt || now()),
      };
      await syncPut("outbox", op);
      pendingMap.set(shadow.key, op);
    }

    return syncAll("outbox");
  }

  function chooseBatch(ops) {
    const sorted = [...ops].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
    const batch = [];
    let bytes = 0;
    for (const op of sorted) {
      const candidate = {
        opId: op.opId,
        store: op.store,
        recordId: op.recordId,
        mutation: op.mutation,
        payload: op.payload,
        baseSeq: op.baseSeq,
        clientTime: op.clientTime,
      };
      const size = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
      if (batch.length && (batch.length >= MAX_BATCH_OPS || bytes + size > MAX_BATCH_BYTES)) break;
      batch.push({ local: op, wire: candidate });
      bytes += size;
    }
    return batch;
  }

  async function saveConflict(localOp, remote, source) {
    const conflict = {
      id: crypto.randomUUID(),
      entityKey: localOp.entityKey,
      store: localOp.store,
      recordId: localOp.recordId,
      localOperation: localOp,
      remote,
      source,
      createdAt: now(),
    };
    await syncPut("conflicts", conflict);
    await syncDelete("outbox", localOp.id);
    updateStatus("conflict");
    return conflict;
  }

  async function acknowledge(ack, localOp) {
    const key = entityKey(ack.store, ack.recordId);
    if (ack.mutation === "delete") {
      await applyLocal(ack.store, ack.recordId, "delete", null);
      await syncPut("shadow", {
        key,
        store: ack.store,
        recordId: String(ack.recordId),
        hash: "",
        deleted: true,
        lastSeq: Number(ack.seq || cursor),
        updatedAt: now(),
      });
    } else {
      await applyLocal(ack.store, ack.recordId, "put", ack.payload);
      await syncPut("shadow", {
        key,
        store: ack.store,
        recordId: String(ack.recordId),
        hash: await hashValue(ack.payload),
        deleted: false,
        lastSeq: Number(ack.seq || cursor),
        updatedAt: now(),
      });
    }
    await syncDelete("outbox", localOp.id);
  }

  async function flushOutbox() {
    let safety = 0;
    while (safety++ < 100) {
      const all = await syncAll("outbox");
      if (!all.length) return;

      const batch = chooseBatch(all);
      if (!batch.length) return;

      const response = await api("/api/sync/v2/ops", {
        method: "POST",
        body: JSON.stringify({
          cursor,
          deviceId: cloud.deviceId,
          operations: batch.map((x) => x.wire),
        }),
      });

      const localByOpId = new Map(batch.map((x) => [x.local.opId, x.local]));

      for (const ack of response.acknowledged || []) {
        const localOp = localByOpId.get(ack.opId);
        if (!localOp) continue;
        await acknowledge(ack, localOp);
        cursor = Math.max(cursor, Number(ack.seq || 0));
      }

      for (const item of response.conflicts || []) {
        const localOp = localByOpId.get(item.opId);
        if (!localOp) continue;
        await saveConflict(localOp, item.remote, "server");
        cursor = Math.max(cursor, Number(item.remote?.lastSeq || 0));
      }

      cursor = Math.max(cursor, Number(response.cursor || 0));
      await metaSet("cursor", cursor);

      if (!(response.acknowledged || []).length && !(response.conflicts || []).length) break;
    }
  }

  async function pullRemoteOps() {
    let loops = 0;
    while (loops++ < 100) {
      const result = await api(`/api/sync/v2/ops?after=${encodeURIComponent(cursor)}&limit=100`);
      const operations = result.operations || [];
      if (!operations.length) {
        cursor = Math.max(cursor, Number(result.cursor || cursor));
        await metaSet("cursor", cursor);
        return;
      }

      for (const op of operations) {
        const key = entityKey(op.store, op.recordId);
        const pending = (await syncAll("outbox")).find((x) => x.entityKey === key);
        const existingConflict = (await syncAll("conflicts")).find((x) => x.entityKey === key);

        if (pending && op.deviceId !== cloud.deviceId) {
          if (!existingConflict) await saveConflict(pending, {
            lastSeq: op.seq,
            deleted: op.mutation === "delete",
            payload: op.payload,
            deviceId: op.deviceId,
            updatedAt: op.createdAt,
          }, "pull");
        } else if (!existingConflict) {
          await applyLocal(op.store, op.recordId, op.mutation, op.payload);
          await syncPut("shadow", {
            key,
            store: op.store,
            recordId: String(op.recordId),
            hash: op.mutation === "put" ? await hashValue(op.payload) : "",
            deleted: op.mutation === "delete",
            lastSeq: Number(op.seq),
            updatedAt: now(),
          });
        }

        cursor = Math.max(cursor, Number(op.seq || 0));
      }

      await metaSet("cursor", cursor);
      if (!result.hasMore) return;
    }
  }

  async function firstBootstrapIfNeeded() {
    const initialized = Boolean(await metaGet("initialized", false));
    cursor = Number(await metaGet("cursor", 0)) || 0;
    if (initialized) return;

    const result = await api("/api/sync/v2/bootstrap");
    const remote = result.snapshot?.stores || {};
    const local = await snapshotLocal();
    const merged = mergeSnapshots(local, remote);

    await applyMergedSnapshot(merged);
    cursor = Number(result.cursor || 0);
    await setShadowFromSnapshot(remote);
    await metaSet("cursor", cursor);
    await metaSet("initialized", true);
    markDirty("v2-bootstrap");
    await captureDiff();
  }

  async function syncCycle({ pull = true } = {}) {
    if (!authenticated || syncing) {
      if (hasDirtyMarker()) updateStatus("pending");
      return { queued: true };
    }

    syncing = true;
    clearTimeout(retryTimer);
    updateStatus("syncing");

    try {
      await captureDiff();
      await flushOutbox();

      if (pull) await pullRemoteOps();

      await captureDiff();
      const [remaining, conflicts] = await Promise.all([syncAll("outbox"), syncAll("conflicts")]);

      if (conflicts.length) {
        updateStatus("conflict");
      } else if (remaining.length) {
        markDirty("pending-after-cycle");
        updateStatus("pending");
      } else {
        clearDirty();
        updateStatus("synced");
      }

      retryDelay = 2000;
      window.dispatchEvent(new CustomEvent("cloud-sync-ok", {
        detail: { cursor, pending: remaining.length, conflicts: conflicts.length, protocol: "v2" },
      }));
      return { ok: true, cursor, pending: remaining.length, conflicts: conflicts.length };
    } catch (error) {
      markDirty(error.status === 401 ? "login-required" : "sync-error");
      updateStatus("offline");
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (navigator.onLine) void syncCycle().catch(() => {});
      }, retryDelay);
      retryDelay = Math.min(60000, Math.round(retryDelay * 1.8));
      window.dispatchEvent(new CustomEvent("cloud-sync-error", {
        detail: { message: error.message, protocol: "v2" },
      }));
      throw error;
    } finally {
      syncing = false;
    }
  }

  function schedule(delay = 500) {
    if (window.__cloudImporting) return;
    markDirty("local-write");
    clearTimeout(timer);
    timer = setTimeout(() => void syncCycle().catch(() => {}), Math.max(80, Number(delay) || 500));
  }

  async function bootstrap(options = {}) {
    const result = await original.bootstrap({ ...options, deferPull: true });
    authenticated = true;
    await firstBootstrapIfNeeded();

    const [pending, conflicts] = await Promise.all([syncAll("outbox"), syncAll("conflicts")]);
    if (conflicts.length) updateStatus("conflict");
    else if (pending.length || hasDirtyMarker()) updateStatus("pending");
    else updateStatus("synced");

    return { ...result, protocol: "v2-incremental" };
  }

  async function pull() {
    return syncCycle({ pull: true });
  }
  async function push() {
    return syncCycle({ pull: false });
  }
  async function forcePush() {
    markDirty("manual-sync");
    return syncCycle({ pull: true });
  }

  async function status() {
    const [outbox, conflicts] = await Promise.all([syncAll("outbox"), syncAll("conflicts")]);
    return { cursor, outbox: outbox.length, conflicts: conflicts.length, dirty: hasDirtyMarker() };
  }

  async function resolveConflict(conflictId, choice = "remote") {
    const conflict = await syncGet("conflicts", conflictId);
    if (!conflict) throw new Error("没有找到冲突记录");

    if (choice === "remote") {
      const remote = conflict.remote || {};
      await applyLocal(
        conflict.store,
        conflict.recordId,
        remote.deleted ? "delete" : "put",
        remote.payload || null,
      );
      await syncPut("shadow", {
        key: conflict.entityKey,
        store: conflict.store,
        recordId: conflict.recordId,
        hash: remote.deleted ? "" : await hashValue(remote.payload),
        deleted: Boolean(remote.deleted),
        lastSeq: Number(remote.lastSeq || cursor),
        updatedAt: now(),
      });
    } else if (choice === "local") {
      const localOp = conflict.localOperation;
      localOp.id = crypto.randomUUID();
      localOp.opId = crypto.randomUUID();
      localOp.baseSeq = Number(conflict.remote?.lastSeq || cursor);
      localOp.createdAt = now();
      await syncPut("outbox", localOp);
      markDirty("conflict-local-chosen");
    } else {
      throw new Error("choice 只能是 local 或 remote");
    }

    await syncDelete("conflicts", conflictId);
    schedule(100);
  }

  window.addEventListener("online", () => {
    if (authenticated) void syncCycle().catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hasDirtyMarker()) {
      // 数据安全不依赖后台请求；dirty + outbox 都已持久化。
      markDirty("backgrounded");
    }
  });

  window.addEventListener("pagehide", () => {
    if (hasDirtyMarker()) markDirty("pagehide");
  });

  cloud.bootstrap = bootstrap;
  cloud.pull = pull;
  cloud.push = push;
  cloud.forcePush = forcePush;
  cloud.schedule = schedule;
  cloud.getV2Status = status;
  cloud.resolveV2Conflict = resolveConflict;
  cloud.incrementalV2 = true;
  cloud.__incrementalV2Installed = true;

  if (hasDirtyMarker()) document.documentElement.dataset.localDirty = "1";
})();
