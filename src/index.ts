interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

type Session = { id: string; expiresAt: number };
const encoder = new TextEncoder();
const json = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});

function parseCookies(request: Request): Record<string,string> {
  const out: Record<string,string> = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('='); if (i > -1) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1));
  }
  return out;
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function safeEqual(a: string, b: string) {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = da.length ^ db.length;
  for (let i=0;i<Math.max(da.length,db.length);i++) diff |= (da.charCodeAt(i)||0) ^ (db.charCodeAt(i)||0);
  return diff === 0;
}
async function currentSession(request: Request, env: Env): Promise<Session|null> {
  const token = parseCookies(request).mocui_session; if (!token) return null;
  const hash = await digest(`${token}:${env.SESSION_SECRET}`);
  const row = await env.DB.prepare('SELECT id, expires_at FROM sessions WHERE token_hash = ?').bind(hash).first<{id:string;expires_at:number}>();
  if (!row || row.expires_at < Date.now()) return null;
  return {id:row.id, expiresAt:row.expires_at};
}
async function requireSession(request: Request, env: Env) {
  const session = await currentSession(request, env);
  if (!session) throw new Response(JSON.stringify({error:'请先登录'}), {status:401,headers:{'content-type':'application/json'}});
  return session;
}
async function login(request: Request, env: Env) {
  const body = await request.json().catch(()=>({})) as {password?:string};
  if (!body.password || !(await safeEqual(body.password, env.ADMIN_PASSWORD))) return json({error:'密码错误'},401);
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...tokenBytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  const tokenHash = await digest(`${token}:${env.SESSION_SECRET}`);
  const id = crypto.randomUUID(), expiresAt = Date.now() + 30*24*60*60*1000;
  await env.DB.prepare('INSERT INTO sessions (id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(id, tokenHash, expiresAt, Date.now()).run();
  return json({ok:true},200, {'set-cookie':`mocui_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`});
}
async function syncGet(request: Request, env: Env) {
  await requireSession(request, env);
  const row = await env.DB.prepare('SELECT revision, object_key, updated_at FROM sync_state WHERE id = 1').first<{revision:number;object_key:string;updated_at:number}>();
  if (!row) return json({revision:0,snapshot:null});
  const object = await env.STORAGE.get(row.object_key);
  const snapshot = object ? await object.json() : null;
  return json({revision:row.revision,updatedAt:row.updated_at,snapshot});
}
async function syncPut(request: Request, env: Env) {
  await requireSession(request, env);
  const body = await request.json() as {revision?:number;snapshot?:unknown};
  if (!body.snapshot || typeof body.revision !== 'number') return json({error:'同步数据格式错误'},400);
  const row = await env.DB.prepare('SELECT revision FROM sync_state WHERE id = 1').first<{revision:number}>();
  const current = row?.revision || 0;
  if (body.revision !== current) return json({error:'云端版本已变化',revision:current},409);
  const next = current + 1, key = `snapshots/current-${next}.json`, now = Date.now();
  await env.STORAGE.put(key, JSON.stringify(body.snapshot), {httpMetadata:{contentType:'application/json'}, customMetadata:{revision:String(next)}});
  await env.DB.prepare(`INSERT INTO sync_state (id, revision, object_key, updated_at) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, object_key=excluded.object_key, updated_at=excluded.updated_at`).bind(next,key,now).run();
  if (current > 2) await env.STORAGE.delete(`snapshots/current-${current-2}.json`);
  return json({ok:true,revision:next,updatedAt:now});
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/health') return json({ok:true,service:'mocui-inventory-cloudflare'});
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return await login(request,env);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return json({ok:true},200,{'set-cookie':'mocui_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
      if (url.pathname === '/api/auth/me') { await requireSession(request,env); return json({authenticated:true}); }
      if (url.pathname === '/api/sync' && request.method === 'GET') return await syncGet(request,env);
      if (url.pathname === '/api/sync' && request.method === 'PUT') return await syncPut(request,env);
      if (url.pathname.startsWith('/api/')) return json({error:'接口不存在'},404);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof Response) return error;
      console.error(JSON.stringify({event:'request_error',message:error instanceof Error?error.message:String(error)}));
      return json({error:'服务器内部错误'},500);
    }
  }
} satisfies ExportedHandler<Env>;
