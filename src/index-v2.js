import legacy from "./index.js";

const V2_STORES = [
  "products","categories","customers","sales","loans",
  "stockMoves","stocktakes","settings","auditLogs",
];
const V2_STORE_SET = new Set(V2_STORES);
const MAX_OPS_PER_REQUEST = 30;
const CHECKPOINT_EVERY = 25;

function v2Json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

async function callLegacy(request, env, ctx) {
  if (typeof legacy === "function") return legacy(request, env, ctx);
  if (legacy && typeof legacy.fetch === "function") return legacy.fetch(request, env, ctx);
  return new Response("Legacy worker handler unavailable", { status: 500 });
}

async function requireV2Session(request, env, ctx) {
  const url = new URL(request.url);
  const probe = new Request(new URL("/api/auth/me", url.origin), {
    method: "GET",
    headers: request.headers,
  });
  const response = await callLegacy(probe, env, ctx);
  if (!response.ok) {
    return {
      ok: false,
      response: v2Json({ error: "请先登录" }, response.status === 401 ? 401 : 503),
    };
  }
  return { ok: true };
}

function verifyV2MutationOrigin(request) {
  if (["GET","HEAD","OPTIONS"].includes(request.method)) return null;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== url.origin) return v2Json({ error: "请求来源不合法" }, 403);
  if (fetchSite && !["same-origin","none"].includes(fetchSite)) {
    return v2Json({ error: "跨站请求已拒绝" }, 403);
  }
  return null;
}

async function ensureV2Schema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_operations (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      op_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      store_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      mutation TEXT NOT NULL CHECK (mutation IN ('put','delete')),
      payload_json TEXT,
      base_seq INTEGER NOT NULL DEFAULT 0,
      client_time INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_v2_ops_seq ON sync_v2_operations(seq)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_v2_ops_entity ON sync_v2_operations(store_name, record_id, seq)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_entities (
      store_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload_json TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      last_seq INTEGER NOT NULL DEFAULT 0,
      device_id TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (store_name, record_id)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_v2_entities_seq ON sync_v2_entities(last_seq)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_v2_checkpoints (
      seq INTEGER PRIMARY KEY,
      object_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0
    )`),
  ]);
}

async function v2MetaGet(env, key) {
  const row = await env.DB.prepare("SELECT value FROM sync_v2_meta WHERE key = ?").bind(key).first();
  return row?.value ?? null;
}

async function v2MetaSet(env, key, value) {
  await env.DB.prepare(`INSERT INTO sync_v2_meta (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, String(value), Date.now())
    .run();
}

function normalizeStores(snapshot) {
  const source = snapshot?.stores || snapshot || {};
  const stores = {};
  for (const name of V2_STORES) {
    stores[name] = Array.isArray(source?.[name]) ? source[name] : [];
  }
  return stores;
}

async function readLegacySnapshot(request, env, ctx) {
  const url = new URL(request.url);
  const req = new Request(new URL("/api/sync", url.origin), {
    method: "GET",
    headers: request.headers,
  });
  const response = await callLegacy(req, env, ctx);
  if (!response.ok) return null;
  const result = await response.json().catch(() => null);
  return result?.snapshot ? normalizeStores(result.snapshot) : null;
}

function recordTime(row) {
  const candidates = [
    row?.updatedAt, row?.modifiedAt, row?.restoredAt, row?.archivedAt,
    row?.deletedAt, row?.createdAt, row?.date, row?.businessDate,
  ];
  for (const value of candidates) {
    const t = typeof value === "number" ? value : Date.parse(value || "");
    if (Number.isFinite(t) && t > 0) return t;
  }
  return Date.now();
}

async function seedEntitiesFromSnapshot(env, stores) {
  const statements = [];
  for (const storeName of V2_STORES) {
    for (const row of stores?.[storeName] || []) {
      if (!row || row.id == null) continue;
      statements.push(
        env.DB.prepare(`INSERT INTO sync_v2_entities
          (store_name, record_id, payload_json, deleted, last_seq, device_id, updated_at)
          VALUES (?, ?, ?, 0, 0, 'legacy', ?)
          ON CONFLICT(store_name, record_id) DO NOTHING`)
          .bind(storeName, String(row.id), JSON.stringify(row), recordTime(row))
      );
    }
  }
  for (let i = 0; i < statements.length; i += 40) {
    await env.DB.batch(statements.slice(i, i + 40));
  }
  await v2MetaSet(env, "initialized", "1");
  await v2MetaSet(env, "initialized_at", String(Date.now()));
}

async function currentCursor(env) {
  const row = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM sync_v2_operations").first();
  return Number(row?.cursor || 0);
}

async function entitiesSnapshot(env) {
  const stores = Object.fromEntries(V2_STORES.map((name) => [name, []]));
  const rows = await env.DB.prepare(`SELECT store_name, record_id, payload_json, last_seq
    FROM sync_v2_entities WHERE deleted = 0`).all();
  for (const row of rows.results || []) {
    if (!V2_STORE_SET.has(row.store_name)) continue;
    try {
      const payload = JSON.parse(row.payload_json || "null");
      if (payload && payload.id != null) stores[row.store_name].push(payload);
    } catch {}
  }
  return stores;
}

async function ensureV2Initialized(request, env, ctx) {
  const initialized = await v2MetaGet(env, "initialized");
  if (initialized === "1") return;
  const legacySnapshot = await readLegacySnapshot(request, env, ctx);
  if (legacySnapshot) {
    await seedEntitiesFromSnapshot(env, legacySnapshot);
  } else {
    await v2MetaSet(env, "initialized", "1");
    await v2MetaSet(env, "initialized_at", String(Date.now()));
  }
}

function dataUrlInfo(value) {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(value);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), base64: match[2] };
}

function extensionForMime(mime) {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
  })[mime] || "bin";
}

async function externalizePayload(value, env, opId, state = { index: 0 }) {
  const info = dataUrlInfo(value);
  if (info) {
    const index = state.index++;
    const name = `${opId}-${String(index).padStart(3, "0")}.${extensionForMime(info.mime)}`;
    const key = `sync-v2-media/${name}`;
    const binary = atob(info.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    await env.STORAGE.put(key, bytes, {
      httpMetadata: { contentType: info.mime },
      customMetadata: { opId },
    });
    return `/api/sync/v2/media/${encodeURIComponent(name)}`;
  }
  if (Array.isArray(value)) {
    const out = [];
    for (const item of value) out.push(await externalizePayload(item, env, opId, state));
    return out;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = await externalizePayload(item, env, opId, state);
    }
    return out;
  }
  return value;
}

async function applyOperationToEntity(env, opRow) {
  const seq = Number(opRow.seq || 0);
  const existing = await env.DB.prepare(`SELECT last_seq FROM sync_v2_entities
    WHERE store_name = ? AND record_id = ?`)
    .bind(opRow.store_name, opRow.record_id)
    .first();

  if (Number(existing?.last_seq || 0) >= seq) return;

  const deleted = opRow.mutation === "delete" ? 1 : 0;
  await env.DB.prepare(`INSERT INTO sync_v2_entities
    (store_name, record_id, payload_json, deleted, last_seq, device_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_name, record_id) DO UPDATE SET
      payload_json = excluded.payload_json,
      deleted = excluded.deleted,
      last_seq = excluded.last_seq,
      device_id = excluded.device_id,
      updated_at = excluded.updated_at`)
    .bind(
      opRow.store_name,
      opRow.record_id,
      opRow.payload_json || null,
      deleted,
      seq,
      opRow.device_id || "",
      Number(opRow.created_at || Date.now()),
    )
    .run();
}

async function v2Bootstrap(request, env, ctx) {
  await ensureV2Initialized(request, env, ctx);
  return v2Json({
    ok: true,
    protocol: "mocui-sync-v2",
    cursor: await currentCursor(env),
    snapshot: { stores: await entitiesSnapshot(env) },
  });
}

async function v2GetOps(request, env) {
  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  const rows = await env.DB.prepare(`SELECT seq, op_id, device_id, store_name, record_id,
      mutation, payload_json, base_seq, client_time, created_at
    FROM sync_v2_operations
    WHERE seq > ?
    ORDER BY seq ASC
    LIMIT ?`)
    .bind(after, limit)
    .all();

  const operations = (rows.results || []).map((row) => ({
    seq: Number(row.seq),
    opId: row.op_id,
    deviceId: row.device_id,
    store: row.store_name,
    recordId: row.record_id,
    mutation: row.mutation,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    baseSeq: Number(row.base_seq || 0),
    clientTime: Number(row.client_time || 0),
    createdAt: Number(row.created_at || 0),
  }));

  const cursor = operations.length ? operations[operations.length - 1].seq : after;
  const max = await currentCursor(env);
  return v2Json({
    ok: true,
    operations,
    cursor,
    maxCursor: max,
    hasMore: cursor < max,
  });
}

async function v2PostOps(request, env, ctx) {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.operations)) {
    return v2Json({ error: "同步数据格式错误" }, 400);
  }
  if (body.operations.length > MAX_OPS_PER_REQUEST) {
    return v2Json({ error: `单次最多 ${MAX_OPS_PER_REQUEST} 个同步操作` }, 413);
  }

  const bodyDeviceId = String(body.deviceId || "").slice(0, 200);
  if (!bodyDeviceId) return v2Json({ error: "缺少 deviceId" }, 400);

  const acknowledged = [];
  const conflicts = [];

  for (const input of body.operations) {
    const opId = String(input?.opId || "").slice(0, 200);
    const storeName = String(input?.store || "");
    const recordId = String(input?.recordId || "").slice(0, 500);
    const mutation = String(input?.mutation || "");
    const baseSeq = Math.max(0, Number(input?.baseSeq || 0));
    const clientTime = Math.max(0, Number(input?.clientTime || Date.now()));

    if (!opId || !recordId || !V2_STORE_SET.has(storeName) || !["put","delete"].includes(mutation)) {
      return v2Json({ error: "存在无效同步操作" }, 400);
    }

    const duplicate = await env.DB.prepare(`SELECT seq, op_id, device_id, store_name,
        record_id, mutation, payload_json, base_seq, client_time, created_at
      FROM sync_v2_operations WHERE op_id = ?`)
      .bind(opId)
      .first();

    if (duplicate) {
      await applyOperationToEntity(env, duplicate);
      acknowledged.push({
        opId,
        seq: Number(duplicate.seq),
        store: duplicate.store_name,
        recordId: duplicate.record_id,
        mutation: duplicate.mutation,
        payload: duplicate.payload_json ? JSON.parse(duplicate.payload_json) : null,
      });
      continue;
    }

    const current = await env.DB.prepare(`SELECT payload_json, deleted, last_seq, device_id, updated_at
      FROM sync_v2_entities WHERE store_name = ? AND record_id = ?`)
      .bind(storeName, recordId)
      .first();

    if (
      current &&
      Number(current.last_seq || 0) > baseSeq &&
      String(current.device_id || "") !== bodyDeviceId
    ) {
      conflicts.push({
        opId,
        store: storeName,
        recordId,
        remote: {
          lastSeq: Number(current.last_seq || 0),
          deleted: Boolean(current.deleted),
          payload: current.payload_json ? JSON.parse(current.payload_json) : null,
          deviceId: current.device_id || "",
          updatedAt: Number(current.updated_at || 0),
        },
      });
      continue;
    }

    let canonicalPayload = null;
    if (mutation === "put") {
      if (!input.payload || typeof input.payload !== "object") {
        return v2Json({ error: "put 操作缺少 payload" }, 400);
      }
      canonicalPayload = await externalizePayload(input.payload, env, opId);
    }

    const now = Date.now();
    await env.DB.prepare(`INSERT INTO sync_v2_operations
      (op_id, device_id, store_name, record_id, mutation, payload_json, base_seq, client_time, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        opId,
        bodyDeviceId,
        storeName,
        recordId,
        mutation,
        canonicalPayload ? JSON.stringify(canonicalPayload) : null,
        baseSeq,
        clientTime,
        now,
      )
      .run();

    const inserted = await env.DB.prepare(`SELECT seq, op_id, device_id, store_name,
        record_id, mutation, payload_json, base_seq, client_time, created_at
      FROM sync_v2_operations WHERE op_id = ?`)
      .bind(opId)
      .first();

    await applyOperationToEntity(env, inserted);

    acknowledged.push({
      opId,
      seq: Number(inserted.seq),
      store: storeName,
      recordId,
      mutation,
      payload: inserted.payload_json ? JSON.parse(inserted.payload_json) : null,
    });
  }

  if (acknowledged.length) {
    await v2MetaSet(env, "initialized", "1");
    const maxSeq = Math.max(...acknowledged.map((x) => Number(x.seq || 0)));
    if (maxSeq > 0 && maxSeq % CHECKPOINT_EVERY === 0) {
      ctx.waitUntil(createCheckpoint(env, maxSeq).catch((error) => {
        console.error("sync v2 checkpoint failed", error);
      }));
    }
  }

  return v2Json({
    ok: true,
    acknowledged,
    conflicts,
    cursor: await currentCursor(env),
  });
}

async function createCheckpoint(env, seq) {
  const existing = await env.DB.prepare("SELECT seq FROM sync_v2_checkpoints WHERE seq = ?")
    .bind(seq)
    .first();
  if (existing) return;

  const snapshot = {
    app: "漠翠进销存",
    version: "2.0-incremental",
    seq,
    exportedAt: new Date().toISOString(),
    stores: await entitiesSnapshot(env),
  };
  const text = JSON.stringify(snapshot);
  const key = `sync-v2-checkpoints/seq-${String(seq).padStart(10, "0")}-${Date.now()}.json`;
  await env.STORAGE.put(key, text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { seq: String(seq) },
  });
  await env.DB.prepare(`INSERT OR IGNORE INTO sync_v2_checkpoints
    (seq, object_key, created_at, size_bytes) VALUES (?, ?, ?, ?)`)
    .bind(seq, key, Date.now(), new TextEncoder().encode(text).byteLength)
    .run();
}

async function v2Status(env) {
  const [ops, entities, checkpoints] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(MAX(seq),0) AS cursor FROM sync_v2_operations").first(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM sync_v2_entities WHERE deleted = 0").first(),
    env.DB.prepare("SELECT COUNT(*) AS count, COALESCE(MAX(seq),0) AS latest FROM sync_v2_checkpoints").first(),
  ]);
  return v2Json({
    ok: true,
    protocol: "mocui-sync-v2",
    cursor: Number(ops?.cursor || 0),
    operationCount: Number(ops?.count || 0),
    entityCount: Number(entities?.count || 0),
    checkpointCount: Number(checkpoints?.count || 0),
    latestCheckpoint: Number(checkpoints?.latest || 0),
  });
}

async function v2Media(request, env, name) {
  const key = `sync-v2-media/${name}`;
  const object = await env.STORAGE.get(key);
  if (!object) return v2Json({ error: "图片不存在" }, 404);
  const headers = new Headers();
  if (typeof object.writeHttpMetadata === "function") object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) headers.set("content-type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("etag", object.httpEtag || object.etag || "");
  return new Response(object.body, { headers });
}

async function handleV2(request, env, ctx) {
  await ensureV2Schema(env);

  const auth = await requireV2Session(request, env, ctx);
  if (!auth.ok) return auth.response;

  const originError = verifyV2MutationOrigin(request);
  if (originError) return originError;

  const url = new URL(request.url);
  if (url.pathname === "/api/sync/v2/bootstrap" && request.method === "GET") {
    return v2Bootstrap(request, env, ctx);
  }
  if (url.pathname === "/api/sync/v2/ops" && request.method === "GET") {
    return v2GetOps(request, env);
  }
  if (url.pathname === "/api/sync/v2/ops" && request.method === "POST") {
    return v2PostOps(request, env, ctx);
  }
  if (url.pathname === "/api/sync/v2/status" && request.method === "GET") {
    return v2Status(env);
  }
  if (url.pathname.startsWith("/api/sync/v2/media/") && request.method === "GET") {
    const name = decodeURIComponent(url.pathname.slice("/api/sync/v2/media/".length));
    if (!/^[A-Za-z0-9._-]+$/.test(name)) return v2Json({ error: "图片路径无效" }, 400);
    return v2Media(request, env, name);
  }
  return v2Json({ error: "未找到 v2 同步接口" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/sync/v2/")) {
      try {
        return await handleV2(request, env, ctx);
      } catch (error) {
        console.error("sync v2 error", error);
        return v2Json({ error: error instanceof Error ? error.message : "同步服务异常" }, 500);
      }
    }
    return callLegacy(request, env, ctx);
  },
};
