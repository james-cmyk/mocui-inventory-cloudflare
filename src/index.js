const encoder = new TextEncoder();

const APP_VERSION = "3.0.0";
const SESSION_COOKIE = "mocui_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const PASSWORD_ITERATIONS = 100_000;
const MAX_REQUEST_BYTES = 24 * 1024 * 1024;
const KEEP_BACKUPS = 50;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function withSecurityHeaders(response) {
  const next = new Response(response.body, response);
  next.headers.set("x-content-type-options", "nosniff");
  next.headers.set("x-frame-options", "DENY");
  next.headers.set("referrer-policy", "no-referrer");
  next.headers.set("permissions-policy", "camera=(self), microphone=(), geolocation=()");
  next.headers.set(
    "content-security-policy",
    "default-src 'self'; img-src 'self' data: blob: https://thumb.qinsilk.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  return next;
}

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      user_agent TEXT,
      ip_address TEXT
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      revision INTEGER NOT NULL DEFAULT 0,
      object_key TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0,
      device_id TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sync_history (
      revision INTEGER PRIMARY KEY,
      object_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      device_id TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sync_history_created_at ON sync_history(created_at DESC)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL,
      window_started INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL,
      ip_address TEXT
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC)"),
  ]);
}

async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first();
  return row?.value ?? null;
}

async function setSetting(env, key, value) {
  await env.DB.prepare(`INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(key, value, Date.now())
    .run();
}

function parseCookies(request) {
  const output = {};
  const source = request.headers.get("cookie") || "";
  for (const part of source.split(";")) {
    const index = part.indexOf("=");
    if (index > -1) {
      output[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1));
    }
  }
  return output;
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bytesToHex(bytes) {
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

async function sha256Text(value) {
  return bytesToHex(await sha256Bytes(encoder.encode(value)));
}

async function safeEqualText(left, right) {
  const [a, b] = await Promise.all([sha256Text(String(left)), sha256Text(String(right))]);
  let diff = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function randomToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

async function derivePasswordHash(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function makePasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return JSON.stringify({
    version: 1,
    iterations: PASSWORD_ITERATIONS,
    salt: base64Url(salt),
    hash: await derivePasswordHash(password, salt),
  });
}

function base64UrlToBytes(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyPassword(password, recordText) {
  try {
    const record = JSON.parse(recordText);
    const salt = base64UrlToBytes(record.salt);
    const calculated = await derivePasswordHash(password, salt, Number(record.iterations));
    return safeEqualText(calculated, record.hash);
  } catch {
    return false;
  }
}

function requestIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}

async function audit(env, request, action, detail = "") {
  await env.DB.prepare(
    "INSERT INTO audit_log (id, action, detail, created_at, ip_address) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), action, detail.slice(0, 2000), Date.now(), requestIp(request))
    .run();
}

function verifyMutationOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin && origin !== url.origin) throw json({ error: "请求来源不合法" }, 403);
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw json({ error: "跨站请求已拒绝" }, 403);
  }
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_REQUEST_BYTES) throw json({ error: "上传数据过大，请先减少图片或分批处理" }, 413);
  return request.json().catch(() => {
    throw json({ error: "请求数据格式错误" }, 400);
  });
}

async function createSession(request, env) {
  const token = randomToken();
  const tokenHash = await sha256Text(token);
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.prepare(`INSERT INTO sessions
    (id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id,
      tokenHash,
      expiresAt,
      now,
      now,
      (request.headers.get("user-agent") || "").slice(0, 500),
      requestIp(request),
    )
    .run();
  return {
    id,
    token,
    tokenHash,
    expiresAt,
    cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  };
}

async function currentSession(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const tokenHash = await sha256Text(token);
  const row = await env.DB.prepare(
    "SELECT id, token_hash, expires_at FROM sessions WHERE token_hash = ?",
  )
    .bind(tokenHash)
    .first();
  if (!row || Number(row.expires_at) < Date.now()) return null;
  return { id: row.id, tokenHash, expiresAt: Number(row.expires_at) };
}

async function requireSession(request, env) {
  const session = await currentSession(request, env);
  if (!session) throw json({ error: "请先登录" }, 401);
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(Date.now(), session.id).run();
  return session;
}

async function checkLoginRate(request, env) {
  const key = await sha256Text(`login:${requestIp(request)}`);
  const now = Date.now();
  const row = await env.DB.prepare(
    "SELECT attempt_count, window_started FROM login_attempts WHERE attempt_key = ?",
  )
    .bind(key)
    .first();
  if (!row || now - Number(row.window_started) > LOGIN_WINDOW_MS) {
    return { key, count: 0, blocked: false };
  }
  return { key, count: Number(row.attempt_count), blocked: Number(row.attempt_count) >= MAX_LOGIN_ATTEMPTS };
}

async function recordLoginFailure(env, rate) {
  const now = Date.now();
  if (rate.count === 0) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO login_attempts (attempt_key, attempt_count, window_started) VALUES (?, 1, ?)",
    )
      .bind(rate.key, now)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE login_attempts SET attempt_count = attempt_count + 1 WHERE attempt_key = ?",
    )
      .bind(rate.key)
      .run();
  }
}

async function setupAdmin(request, env) {
  const existing = await getSetting(env, "admin_password");
  if (existing) return json({ error: "系统已经完成初始化" }, 409);

  const body = await readJson(request);
  const password = String(body.password || "");
  if (password.length < 10) return json({ error: "管理密码至少需要10位" }, 400);
  if (password.length > 128) return json({ error: "管理密码不能超过128位" }, 400);

  // 只有第一位完成初始化的人可以写入管理员密码。
  // INSERT OR IGNORE 避免两台设备同时初始化时后提交者覆盖先提交者。
  let passwordRecord;
  try {
    passwordRecord = await makePasswordRecord(password);
  } catch (error) {
    console.error(JSON.stringify({
      event: "password_hash_failed",
      message: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: "密码加密失败，请稍后重试" }, 500);
  }
  const now = Date.now();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO app_settings
    (key, value, updated_at) VALUES ('admin_password', ?, ?)`)
    .bind(passwordRecord, now)
    .run();
  if (Number(inserted.meta?.changes || 0) !== 1) {
    return json({ error: "系统已在其他设备完成初始化，请直接登录" }, 409);
  }

  await setSetting(env, "initialized_at", String(now));
  const session = await createSession(request, env);
  await audit(env, request, "setup_complete", "administrator initialized without setup code");
  return json({ ok: true }, 200, { "set-cookie": session.cookie });
}

async function login(request, env) {
  const rate = await checkLoginRate(request, env);
  if (rate.blocked) {
    return json({ error: "密码尝试次数过多，请15分钟后再试" }, 429);
  }
  const body = await readJson(request);
  const password = String(body.password || "");
  const record = await getSetting(env, "admin_password");
  if (!record) return json({ error: "系统尚未初始化" }, 409);
  if (!(await verifyPassword(password, record))) {
    await recordLoginFailure(env, rate);
    await audit(env, request, "login_failed", "invalid password");
    return json({ error: "密码错误" }, 401);
  }
  await env.DB.prepare("DELETE FROM login_attempts WHERE attempt_key = ?").bind(rate.key).run();
  const session = await createSession(request, env);
  await audit(env, request, "login_success", session.id);
  return json({ ok: true }, 200, { "set-cookie": session.cookie });
}

async function logout(request, env) {
  const session = await currentSession(request, env);
  if (session) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash).run();
    await audit(env, request, "logout", session.id);
  }
  return json(
    { ok: true },
    200,
    { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` },
  );
}

async function changePassword(request, env) {
  const session = await requireSession(request, env);
  const body = await readJson(request);
  const oldPassword = String(body.oldPassword || "");
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 10) return json({ error: "新密码至少需要10位" }, 400);
  const record = await getSetting(env, "admin_password");
  if (!record || !(await verifyPassword(oldPassword, record))) {
    return json({ error: "原密码错误" }, 401);
  }
  await setSetting(env, "admin_password", await makePasswordRecord(newPassword));
  await env.DB.prepare("DELETE FROM sessions").run();
  const nextSession = await createSession(request, env);
  await audit(env, request, "password_changed", session.id);
  return json({ ok: true }, 200, { "set-cookie": nextSession.cookie });
}

async function listSessions(request, env) {
  const current = await requireSession(request, env);
  const rows = await env.DB.prepare(`SELECT id, created_at, last_seen_at, expires_at, user_agent, ip_address
    FROM sessions WHERE expires_at >= ? ORDER BY last_seen_at DESC`).bind(Date.now()).all();
  return json({ sessions: (rows.results || []).map((row) => ({
    ...row, isCurrent: row.id === current.id,
  })) });
}

async function logoutOtherSessions(request, env) {
  const current = await requireSession(request, env);
  const result = await env.DB.prepare("DELETE FROM sessions WHERE id <> ?").bind(current.id).run();
  await audit(env, request, "logout_other_sessions", `kept=${current.id}`);
  return json({ ok: true, removed: Number(result.meta?.changes || 0) });
}

async function revokeSession(request, env, sessionId) {
  const current = await requireSession(request, env);
  if (sessionId === current.id) return json({ error: "不能在这里退出当前设备，请使用退出登录" }, 400);
  const result = await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  await audit(env, request, "session_revoked", sessionId);
  return json({ ok: true, removed: Number(result.meta?.changes || 0) });
}

function decodeDataUrl(value) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return { mime, bytes };
}

function extensionForMime(mime) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[mime] || "bin";
}

async function externalizeMedia(value, env, depth = 0) {
  if (depth > 40) throw new Error("数据层级过深");
  if (typeof value === "string") {
    const media = decodeDataUrl(value);
    if (!media) return value;
    const hash = bytesToHex(await sha256Bytes(media.bytes));
    const filename = `${hash}.${extensionForMime(media.mime)}`;
    const key = `media/${filename}`;
    if (!(await env.STORAGE.head(key))) {
      await env.STORAGE.put(key, media.bytes, {
        httpMetadata: { contentType: media.mime },
        customMetadata: { sha256: hash, createdAt: new Date().toISOString() },
      });
    }
    return `/api/media/${filename}`;
  }
  if (Array.isArray(value)) {
    const output = [];
    for (const item of value) output.push(await externalizeMedia(item, env, depth + 1));
    return output;
  }
  if (value && typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = await externalizeMedia(item, env, depth + 1);
    }
    return output;
  }
  return value;
}

async function readSnapshot(env, objectKey) {
  if (!objectKey) return null;
  const object = await env.STORAGE.get(objectKey);
  if (!object) return null;
  return JSON.parse(await object.text());
}

async function syncGet(request, env) {
  await requireSession(request, env);
  const row = await env.DB.prepare(
    "SELECT revision, object_key, updated_at, device_id FROM sync_state WHERE id = 1",
  ).first();
  if (!row) return json({ revision: 0, updatedAt: 0, snapshot: null });
  return json({
    revision: Number(row.revision),
    updatedAt: Number(row.updated_at),
    deviceId: row.device_id || "",
    snapshot: await readSnapshot(env, row.object_key),
  });
}

async function cleanupBackups(env) {
  const rows = await env.DB.prepare(
    "SELECT revision, object_key FROM sync_history ORDER BY revision DESC LIMIT -1 OFFSET ?",
  )
    .bind(KEEP_BACKUPS)
    .all();
  for (const row of rows.results || []) {
    await env.STORAGE.delete(row.object_key);
    await env.DB.prepare("DELETE FROM sync_history WHERE revision = ?").bind(row.revision).run();
  }
}

async function syncPut(request, env, ctx) {
  const session = await requireSession(request, env);
  const body = await readJson(request);
  if (!body.snapshot || typeof body.revision !== "number") {
    return json({ error: "同步数据格式错误" }, 400);
  }
  const force = new URL(request.url).searchParams.get("force") === "1";
  const row = await env.DB.prepare("SELECT revision FROM sync_state WHERE id = 1").first();
  const current = Number(row?.revision || 0);
  if (!force && Number(body.revision) !== current) {
    return json({ error: "云端数据已在其他设备更新", revision: current }, 409);
  }
  const sanitized = await externalizeMedia(body.snapshot, env);
  const serialized = JSON.stringify(sanitized);
  if (encoder.encode(serialized).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "业务数据超过单次同步上限，请先导出备份并清理过大的历史图片" }, 413);
  }
  const next = current + 1;
  const now = Date.now();
  const deviceId = String(body.deviceId || "").slice(0, 200);
  const key = `snapshots/revision-${String(next).padStart(8, "0")}-${now}.json`;
  await env.STORAGE.put(key, serialized, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { revision: String(next), sessionId: session.id },
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sync_state (id, revision, object_key, updated_at, device_id)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision = excluded.revision,
        object_key = excluded.object_key, updated_at = excluded.updated_at,
        device_id = excluded.device_id`)
      .bind(next, key, now, deviceId),
    env.DB.prepare(`INSERT INTO sync_history
      (revision, object_key, created_at, device_id, size_bytes) VALUES (?, ?, ?, ?, ?)`)
      .bind(next, key, now, deviceId, encoder.encode(serialized).byteLength),
    env.DB.prepare(
      "INSERT INTO audit_log (id, action, detail, created_at, ip_address) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      force ? "sync_force" : "sync_put",
      `revision=${next}`,
      now,
      requestIp(request),
    ),
  ]);
  ctx.waitUntil(cleanupBackups(env).catch((error) => console.error("cleanup backups", error)));
  return json({ ok: true, revision: next, updatedAt: now, snapshot: sanitized });
}

async function listBackups(request, env) {
  await requireSession(request, env);
  const rows = await env.DB.prepare(
    "SELECT revision, created_at, device_id, size_bytes FROM sync_history ORDER BY revision DESC LIMIT 30",
  ).all();
  return json({ backups: rows.results || [] });
}

async function restoreBackup(request, env, revision) {
  await requireSession(request, env);
  const backup = await env.DB.prepare(
    "SELECT object_key FROM sync_history WHERE revision = ?",
  )
    .bind(revision)
    .first();
  if (!backup) return json({ error: "没有找到该云端备份" }, 404);
  const snapshot = await readSnapshot(env, backup.object_key);
  if (!snapshot) return json({ error: "备份文件已不存在" }, 404);
  const state = await env.DB.prepare("SELECT revision FROM sync_state WHERE id = 1").first();
  const next = Number(state?.revision || 0) + 1;
  const now = Date.now();
  const serialized = JSON.stringify(snapshot);
  const key = `snapshots/revision-${String(next).padStart(8, "0")}-${now}-restore.json`;
  await env.STORAGE.put(key, serialized, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { revision: String(next), restoredFrom: String(revision) },
  });
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO sync_state (id, revision, object_key, updated_at, device_id)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision = excluded.revision,
        object_key = excluded.object_key, updated_at = excluded.updated_at,
        device_id = excluded.device_id`)
      .bind(next, key, now, `restore:${revision}`),
    env.DB.prepare(`INSERT INTO sync_history
      (revision, object_key, created_at, device_id, size_bytes) VALUES (?, ?, ?, ?, ?)`)
      .bind(next, key, now, `restore:${revision}`, encoder.encode(serialized).byteLength),
  ]);
  await audit(env, request, "backup_restored", `from=${revision};to=${next}`);
  return json({ ok: true, revision: next, updatedAt: now, snapshot });
}


function uploadExtensionForMime(mime) {
  return ({
    "image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/heic":"heic","image/heif":"heif",
    "video/mp4":"mp4","video/quicktime":"mov","video/x-m4v":"m4v","video/webm":"webm"
  })[mime] || "bin";
}

function allowedUploadMime(mime) {
  return /^(?:image\/(?:jpeg|png|webp|gif|heic|heif)|video\/(?:mp4|quicktime|x-m4v|webm))$/.test(mime);
}

async function mediaUpload(request, env) {
  await requireSession(request, env);
  const mime = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!allowedUploadMime(mime)) return json({ error: "暂不支持这种图片或视频格式" }, 415);
  const isVideo = mime.startsWith("video/");
  const maxBytes = (isVideo ? 95 : 25) * 1024 * 1024;
  const length = Number(request.headers.get("content-length") || 0);
  if (length && length > maxBytes) return json({ error: `单个${isVideo ? "视频" : "图片"}超过当前上传限制` }, 413);
  if (!request.body) return json({ error: "没有收到媒体文件" }, 400);
  const ext = uploadExtensionForMime(mime);
  const filename = `u-${crypto.randomUUID()}.${ext}`;
  const productId = String(request.headers.get("x-product-id") || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  await env.STORAGE.put(`media/${filename}`, request.body, {
    httpMetadata: { contentType: mime },
    customMetadata: { productId, createdAt: new Date().toISOString(), source: "content-workbench" },
  });
  await audit(env, request, "media_uploaded", `${filename};${productId};${length || 0}`);
  return json({ ok: true, url: `/api/media/${filename}`, filename, mime, type: isVideo ? "video" : "image", size: length || 0 });
}

async function mediaImport(request, env) {
  await requireSession(request, env);
  const body = await readJson(request);
  let url;
  try { url = new URL(String(body.url || "")); } catch { return json({ error: "图片地址无效" }, 400); }
  if (url.protocol !== "https:" || url.hostname !== "thumb.qinsilk.com") return json({ error: "目前只允许转存秦丝图片域名" }, 400);
  const remote = await fetch(url.toString(), { redirect: "follow" });
  if (!remote.ok) return json({ error: "秦丝图片读取失败" }, 502);
  const finalUrl = new URL(remote.url);
  if (finalUrl.protocol !== "https:" || finalUrl.hostname !== "thumb.qinsilk.com") return json({ error: "图片跳转地址不受信任" }, 400);
  const mime = String(remote.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(?:jpeg|png|webp|gif)$/.test(mime)) return json({ error: "远程文件不是支持的图片" }, 415);
  const bytes = new Uint8Array(await remote.arrayBuffer());
  if (bytes.byteLength > 25 * 1024 * 1024) return json({ error: "远程图片超过25MB" }, 413);
  const filename = `u-${crypto.randomUUID()}.${uploadExtensionForMime(mime)}`;
  const productId = String(body.productId || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  await env.STORAGE.put(`media/${filename}`, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { productId, createdAt: new Date().toISOString(), source: "qinsilk-import", originalUrl: url.toString().slice(0, 500) },
  });
  await audit(env, request, "media_imported", `${filename};${productId}`);
  return json({ ok: true, url: `/api/media/${filename}`, filename, mime, type: "image", size: bytes.byteLength });
}

async function mediaDelete(request, env, filename) {
  await requireSession(request, env);
  if (!/^u-[a-f0-9-]{36}\.(?:jpg|png|webp|gif|heic|heif|mp4|mov|m4v|webm)$/.test(filename)) {
    return json({ error: "只允许删除内容工作台上传的素材" }, 400);
  }
  await env.STORAGE.delete(`media/${filename}`);
  await audit(env, request, "media_deleted", filename);
  return json({ ok: true });
}

async function mediaGet(request, env, filename) {
  await requireSession(request, env);
  const legacy=/^[a-f0-9]{64}\.(?:jpg|png|webp|gif)$/.test(filename);
  const uploaded=/^u-[a-f0-9-]{36}\.(?:jpg|png|webp|gif|heic|heif|mp4|mov|m4v|webm)$/.test(filename);
  if (!legacy && !uploaded) return json({ error: "媒体地址无效" }, 400);
  const object = await env.STORAGE.get(`media/${filename}`);
  if (!object) return json({ error: "媒体文件不存在" }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function health(env) {
  await ensureSchema(env);
  const initialized = Boolean(await getSetting(env, "admin_password"));
  const state = await env.DB.prepare("SELECT revision, updated_at FROM sync_state WHERE id = 1").first();
  return json({
    ok: true,
    service: "mocui-inventory-cloudflare",
    release: env.APP_RELEASE || APP_VERSION,
    mode: "cloud",
    cloudConfigured: true,
    needsSetup: !initialized,
    setupMode: "set-password",
    revision: Number(state?.revision || 0),
    updatedAt: Number(state?.updated_at || 0),
  });
}

async function handleApi(request, env, ctx) {
  verifyMutationOrigin(request);
  await ensureSchema(env);
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health" && request.method === "GET") return health(env);
  if (path === "/api/auth/setup" && request.method === "POST") return setupAdmin(request, env);
  if (path === "/api/auth/login" && request.method === "POST") return login(request, env);
  if (path === "/api/auth/logout" && request.method === "POST") return logout(request, env);
  if (path === "/api/auth/me" && request.method === "GET") {
    const session = await requireSession(request, env);
    return json({ authenticated: true, sessionExpiresAt: session.expiresAt });
  }
  if (path === "/api/auth/change-password" && request.method === "POST") {
    return changePassword(request, env);
  }
  if (path === "/api/auth/sessions" && request.method === "GET") return listSessions(request, env);
  if (path === "/api/auth/sessions/logout-others" && request.method === "POST") return logoutOtherSessions(request, env);
  const sessionMatch = /^\/api\/auth\/sessions\/([^/]+)$/.exec(path);
  if (sessionMatch && request.method === "DELETE") return revokeSession(request, env, decodeURIComponent(sessionMatch[1]));
  if (path === "/api/sync" && request.method === "GET") return syncGet(request, env);
  if (path === "/api/sync" && request.method === "PUT") return syncPut(request, env, ctx);
  if (path === "/api/backups" && request.method === "GET") return listBackups(request, env);
  if (path === "/api/media/upload" && request.method === "POST") return mediaUpload(request, env);
  if (path === "/api/media/import" && request.method === "POST") return mediaImport(request, env);

  const restoreMatch = /^\/api\/backups\/(\d+)\/restore$/.exec(path);
  if (restoreMatch && request.method === "POST") {
    return restoreBackup(request, env, Number(restoreMatch[1]));
  }

  const mediaMatch = /^\/api\/media\/([^/]+)$/.exec(path);
  if (mediaMatch && request.method === "GET") return mediaGet(request, env, decodeURIComponent(mediaMatch[1]));
  if (mediaMatch && request.method === "DELETE") return mediaDelete(request, env, decodeURIComponent(mediaMatch[1]));

  return json({ error: "接口不存在" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        return withSecurityHeaders(await handleApi(request, env, ctx));
      }
      return withSecurityHeaders(await env.ASSETS.fetch(request));
    } catch (error) {
      if (error instanceof Response) return withSecurityHeaders(error);
      console.error(JSON.stringify({
        event: "request_error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : "",
      }));
      return withSecurityHeaders(json({ error: "服务器内部错误" }, 500));
    } finally {
      ctx.waitUntil(
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?")
          .bind(Date.now())
          .run()
          .catch(() => undefined),
      );
    }
  },
};
