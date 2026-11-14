// Same-origin, HttpOnly sessions for the Outro Lado Worker.
// Each room persists sessions in its own Durable Object storage.
// A credential is submitted to the server only; never commit it to Git.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SESSION_COOKIE = 'ol_room_session';
const encode = new TextEncoder();

function fixedEqual(left, right) {
  const a = String(left || ''), b = String(right || '');
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
}
async function digest(token) {
  const hash = await crypto.subtle.digest('SHA-256', encode.encode(String(token)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
function sessionToken(request) {
  const match = /(?:^|;\s*)ol_room_session=([a-f0-9]{64})/i.exec(request.headers.get('Cookie') || '');
  return match ? match[1] : '';
}
function sessionCookie(token, clear = false) {
  return SESSION_COOKIE + '=' + (clear ? '' : token) +
    '; Path=/; Secure; HttpOnly; SameSite=Lax' +
    (clear ? '; Max-Age=0' : '; Max-Age=28800');
}
function response(payload, status = 200, cookie) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) }
  });
}
function playerCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

export async function currentSession(request, ctx) {
  const token = sessionToken(request);
  if (!token) return null;
  const key = 'session:' + (await digest(token));
  const session = await ctx.storage.get(key);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await ctx.storage.delete(key);
    return null;
  }
  // A rotated player credential immediately invalidates old sessions.
  if (session.role === 'player') {
    const ownerKey = 'sheet:' + session.edition + ':' + session.code + ':owner-sha256';
    const currentKey = await ctx.storage.get(ownerKey);
    if (!currentKey || !fixedEqual(currentKey, session.credentialHash)) return null;
  }
  return session;
}

export async function handleSessionRequest(request, ctx, env) {
  if (request.method === 'GET') {
    const session = await currentSession(request, ctx);
    return response(session
      ? { ok: true, role: session.role, code: session.code || '' }
      : { ok: false }, session ? 200 : 401);
  }
  if (request.method === 'DELETE') {
    const token = sessionToken(request);
    if (token) await ctx.storage.delete('session:' + (await digest(token)));
    return response({ ok: true }, 200, sessionCookie('', true));
  }
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if (String(request.headers.get('Content-Type') || '').split(';')[0].trim() !== 'application/json') {
    return response({ error: 'json_required' }, 415);
  }
  const raw = await request.text();
  if (raw.length > 2048) return response({ error: 'request_too_large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return response({ error: 'invalid_json' }, 400); }

  const role = data && data.role;
  let edition = data && data.edition === 'temporada' ? 'temporada' : 'classic';
  let code = '';
  let credentialHash = '';
  if (role === 'master') {
    const serverKey = String(env.MASTER_DATA_TOKEN || '');
    if (serverKey.length < 32 || !fixedEqual(data && data.key, serverKey)) {
      return response({ error: 'invalid_credentials' }, 401);
    }
  } else if (role === 'player') {
    code = playerCode(data && data.code);
    const key = String(data && data.key || '');
    if (!code || key.length < 43 || key.length > 256) {
      return response({ error: 'invalid_credentials' }, 401);
    }
    credentialHash = await digest(key);
    const ownerHash = await ctx.storage.get('sheet:' + edition + ':' + code + ':owner-sha256');
    if (!ownerHash || !fixedEqual(ownerHash, credentialHash)) {
      return response({ error: 'invalid_credentials' }, 401);
    }
  } else {
    return response({ error: 'invalid_role' }, 400);
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, '0')).join('');
  await ctx.storage.put('session:' + await digest(token), {
    role, code, edition, credentialHash, expiresAt: Date.now() + SESSION_TTL_MS
  });
  return response({ ok: true, role, code }, 200, sessionCookie(token));
}
