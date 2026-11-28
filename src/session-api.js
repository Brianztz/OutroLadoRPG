// Same-origin, HttpOnly sessions for the Outro Lado Worker.
// Each room persists sessions in its own Durable Object storage.
// A credential is submitted to the server only; never commit it to Git.
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
// Invitation holders can reopen their sheets on this device without an account.
const PLAYER_DEVICE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
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
// Each physical table has its own cookie. A single global cookie previously
// replaced the player's session whenever another table was opened in a tab.
function scopedCookieName(request) {
  const table = String(new URL(request.url).searchParams.get('mesa') || 'PADRAO')
    .trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40) || 'PADRAO';
  return SESSION_COOKIE + '_' + table;
}
function cookieToken(request, name) {
  const cookies = (request.headers.get('Cookie') || '').split(/;\s*/);
  const entry = cookies.find(item => item.startsWith(name + '='));
  const value = entry ? entry.slice(name.length + 1) : '';
  return /^[a-f0-9]{64}$/i.test(value) ? value : '';
}
function sessionToken(request) {
  // Accept the old cookie for sessions established before this update.
  return cookieToken(request, scopedCookieName(request)) || cookieToken(request, SESSION_COOKIE);
}
function sessionCookie(request, token, clear = false, legacy = false, ttl = SESSION_TTL_MS) {
  return (legacy ? SESSION_COOKIE : scopedCookieName(request)) + '=' + (clear ? '' : token) +
    '; Path=/; Secure; HttpOnly; SameSite=Lax' +
    (clear ? '; Max-Age=0' : '; Max-Age='+Math.floor(ttl/1000));
}
function response(payload, status = 200, cookies = []) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of (Array.isArray(cookies) ? cookies : [cookies])) {
    if (cookie) headers.append('Set-Cookie', cookie);
  }
  return Response.json(payload, { status, headers });
}
function playerCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

export async function currentSession(request, ctx, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const key = 'session:' + (await digest(token));
  const session = await ctx.storage.get(key);
  if (!session) return null;
  if(session.accountTokenHash){
    const account=cookieToken(request,'ol_account_session');
    if(!account||!fixedEqual(await digest(account),session.accountTokenHash))return null;
    // The opaque account token must still be valid (logout/password change revokes it).
    if(!env?.TABLE_ROOMS||String(env.MASTER_DATA_TOKEN||'').length<32)return null;
    const registry=env.TABLE_ROOMS.getByName('SYSTEM_MASTER_PROFILE_V2');
    const verified=await registry.fetch(new Request('https://internal.invalid/api/account-internal',{
      method:'POST',headers:{'Content-Type':'application/json','X-OL-Internal-Auth':env.MASTER_DATA_TOKEN,Cookie:'ol_account_session='+account},
      body:JSON.stringify({action:'check-session',role:session.role,code:session.code,physicalTable:new URL(request.url).searchParams.get('mesa')||''})
    }));
    if(!verified.ok)return null;
  }
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
    const session = await currentSession(request, ctx, env);
    return response(session
      ? { ok: true, role: session.role, code: session.code || '' }
      : { ok: false }, session ? 200 : 401);
  }
  if (request.method === 'DELETE') {
    const token = sessionToken(request);
    if (token) await ctx.storage.delete('session:' + (await digest(token)));
    const legacy = cookieToken(request, SESSION_COOKIE);
    if (legacy && legacy !== token) await ctx.storage.delete('session:' + (await digest(legacy)));
    return response({ ok: true }, 200, [
      sessionCookie(request, '', true),
      sessionCookie(request, '', true, true)
    ]);
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
  let accountTokenHash='',accountExpiresAt=Date.now()+SESSION_TTL_MS;
  const useAccount=data?.useAccount===true;
  // The registry checks username/password internally; no password is
  // persisted in a room session, cookie, localStorage or sheet.
  async function verifyAccount(roleToCheck, codeToCheck = '') {
    const serverKey = String(env.MASTER_DATA_TOKEN || '');
    if (serverKey.length < 32 || !env.TABLE_ROOMS) return null;
    const account=cookieToken(request,'ol_account_session');
    if(useAccount&&!account)return null;
    if(!useAccount&&(typeof data.username!=='string'||typeof data.password!=='string'))return null;
    const registry = env.TABLE_ROOMS.getByName('SYSTEM_MASTER_PROFILE_V2');
    const check = await registry.fetch(new Request('https://internal.invalid/api/account-internal', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-OL-Internal-Auth':serverKey,...(useAccount?{Cookie:'ol_account_session='+account}:{})},
      body:JSON.stringify({
        action:useAccount?'check-session':'check',username:data.username,password:data.password,
        role:roleToCheck,code:codeToCheck,
        physicalTable:new URL(request.url).searchParams.get('mesa')||''
      })
    }));
    if(!check.ok)return null;
    const verified=await check.json();
    if(useAccount){accountTokenHash=await digest(account);accountExpiresAt=verified.expiresAt;}
    return verified;
  }

  if (role === 'master') {
    // No legacy key, first-come signup, or recovery link can enter the shield.
    // The current master's username and password are checked by the v2 registry.
    if(!await verifyAccount('master'))
      return response({error:'invalid_credentials'},401);
  } else if (role === 'player') {
    code = playerCode(data && data.code);
    const ownerHash = await ctx.storage.get('sheet:' + edition + ':' + code + ':owner-sha256');
    if (useAccount || typeof data.username === 'string') {
      if (edition !== 'temporada' || !code || !ownerHash)
        return response({error:'invalid_credentials'},401);
      const verified=await verifyAccount('player',code);
      // Revoking an old invitation also invalidates its registered login.
      if(!verified || !fixedEqual(verified.ownerHash,ownerHash))
        return response({error:'invalid_credentials'},401);
      credentialHash=ownerHash;
    } else {
      const key = String(data && data.key || '');
      if (!code || key.length < 43 || key.length > 256) {
        return response({ error: 'invalid_credentials' }, 401);
      }
      credentialHash = await digest(key);
      if (!ownerHash || !fixedEqual(ownerHash, credentialHash)) {
        return response({ error: 'invalid_credentials' }, 401);
      }
    }
  } else {
    return response({ error: 'invalid_role' }, 400);
  }
  // A valid invitation, or a verified legacy player explicitly saving this device,
  // grants a persistent per-room session, never a master session or a reusable key.
  const invited=role==='player'&&!useAccount&&typeof data.username!=='string';
  const remembered=role==='player'&&(invited||(useAccount&&data.rememberPlayer===true));
  const ttl=remembered?PLAYER_DEVICE_TTL_MS:SESSION_TTL_MS;
  if(remembered){accountTokenHash='';accountExpiresAt=Date.now()+ttl;}
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, '0')).join('');
  await ctx.storage.put('session:' + await digest(token), {
    role, code, edition, credentialHash, accountTokenHash,
    invited, expiresAt:Math.min(Date.now()+ttl,accountExpiresAt)
  });
  return response({ ok: true, role, code }, 200, sessionCookie(request, token,false,false,ttl));
}
