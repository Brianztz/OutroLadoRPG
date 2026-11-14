// Persistent single-owner master key. Public login may generate a candidate key,
// but only possession of the existing bootstrap secret can activate it.
// No private access is granted by generating a candidate in the browser.
const ROOM_KEY = 'owner:permanent-room-code:v1';
const PERSONAL_HASH_KEY = 'owner:personal-master-sha256:v1';
const PERSONAL_PATTERN = /^OLM-[A-F0-9]{64}$/;
const encoder = new TextEncoder();

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left || ''));
  const b = encoder.encode(String(right || ''));
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a[i] || 0) ^ (b[i] || 0);
  }
  return difference === 0;
}
async function digest(value) {
  const sha = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(sha), byte => byte.toString(16).padStart(2, '0')).join('');
}
function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'M' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function seasonRoom(logicalCode) {
  const code = String(logicalCode || '').toUpperCase();
  if (code.length <= 37) return 'T2_' + code;
  let hash = 2166136261;
  for (const letter of code) {
    hash ^= letter.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return 'T2_' + code.slice(0, 28) + '_' + hash.toString(16).padStart(8, '0');
}

export async function handleMasterRoomRequest(request, ctx, env) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (String(request.headers.get('Content-Type') || '').split(';')[0].trim() !== 'application/json') {
    return json({ error: 'json_required' }, 415);
  }
  const raw = await request.text();
  if (raw.length > 512) return json({ error: 'request_too_large' }, 413);
  let data;
  try { data = JSON.parse(raw); } catch { return json({ error: 'invalid_json' }, 400); }

  const serverKey = String(env.MASTER_DATA_TOKEN || '');
  if (serverKey.length < 32) return json({ error: 'master_not_configured' }, 503);

  // Only the Worker calls this route on the registry Durable Object.
  // It is deliberately not exposed by the public Worker router.
  if (new URL(request.url).pathname === '/api/master-key-check') {
    if (!constantTimeEqual(request.headers.get('X-OL-Internal-Auth'), serverKey)) {
      return json({ error: 'forbidden' }, 403);
    }
    const savedHash = await ctx.storage.get(PERSONAL_HASH_KEY);
    const roomCode = await ctx.storage.get(ROOM_KEY);
    const key = String(data?.key || '');
    const physical = String(data?.physicalTable || '');
    const valid = PERSONAL_PATTERN.test(key) && savedHash && roomCode
      && constantTimeEqual(await digest(key), savedHash)
      && constantTimeEqual(physical, seasonRoom(roomCode));
    return json({ ok: Boolean(valid) }, valid ? 200 : 401);
  }

  if (new URL(request.url).pathname !== '/api/master-room') {
    return json({ error: 'not_found' }, 404);
  }

  const key = String(data?.key || '');
  const isLegacyKey = constantTimeEqual(key, serverKey);
  if (!isLegacyKey && !PERSONAL_PATTERN.test(key)) {
    return json({ error: 'invalid_credentials' }, 401);
  }

  const preferredCode = String(data?.preferredCode || '').trim().toUpperCase();
  if (preferredCode && (!/^[A-Z0-9_-]{1,40}$/.test(preferredCode)
    || preferredCode === 'SYSTEM_MASTER_PROFILE_V1')) {
    return json({ error: 'invalid_room_code' }, 400);
  }

  // The original master credential stays available for emergency recovery.
  // It is never sent back to a browser or stored in this Durable Object.
  if (isLegacyKey) {
    const result = await ctx.storage.transaction(async transaction => {
      let code = await transaction.get(ROOM_KEY);
      let created = false;
      if (!code) {
        code = preferredCode || newCode();
        await transaction.put(ROOM_KEY, code);
        created = true;
      }
      return { code, created };
    });
    return json({ ok: true, tableCode: result.code, created: result.created });
  }

  const keyHash = await digest(key);
  const knownHash = await ctx.storage.get(PERSONAL_HASH_KEY);
  const knownRoom = await ctx.storage.get(ROOM_KEY);
  if (knownHash && constantTimeEqual(knownHash, keyHash) && knownRoom) {
    return json({ ok: true, tableCode: knownRoom, created: false, activated: true });
  }

  // Generating a key in a public page never grants master privileges.
  const activationSecret = String(data?.activationSecret || '');
  if (!activationSecret) return json({ error: 'activation_required' }, 403);
  if (!constantTimeEqual(activationSecret, serverKey)) {
    return json({ error: 'invalid_activation' }, 401);
  }

  const result = await ctx.storage.transaction(async transaction => {
    const activeHash = await transaction.get(PERSONAL_HASH_KEY);
    if (activeHash) return { error: 'already_activated' };
    let tableCode = await transaction.get(ROOM_KEY);
    let created = false;
    if (!tableCode) {
      tableCode = preferredCode || newCode();
      await transaction.put(ROOM_KEY, tableCode);
      created = true;
    }
    await transaction.put(PERSONAL_HASH_KEY, keyHash);
    return { tableCode, created };
  });
  if (result.error) return json(result, 409);
  return json({ ok: true, tableCode: result.tableCode, created: result.created, activated: true });
}
