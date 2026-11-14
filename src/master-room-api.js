// A single permanent room code for the owner of this Worker.
// Stored in a dedicated Durable Object, not in browser storage or the master secret.
const KEY = 'owner:permanent-room-code:v1';
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

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return 'M' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
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
  if (serverKey.length < 32 || !constantTimeEqual(data?.key, serverKey)) {
    return json({ error: 'invalid_credentials' }, 401);
  }
  // A previous room can be adopted once, before any permanent code exists.
  const preferredCode = String(data?.preferredCode || '').trim().toUpperCase();
  if (preferredCode && (!/^[A-Z0-9_-]{1,40}$/.test(preferredCode)
      || preferredCode === 'SYSTEM_MASTER_PROFILE_V1')) {
    return json({ error: 'invalid_room_code' }, 400);
  }
  const result = await ctx.storage.transaction(async transaction => {
    let code = await transaction.get(KEY);
    let created = false;
    if (!code) {
      code = preferredCode || newCode();
      await transaction.put(KEY, code);
      created = true;
    }
    return { code, created };
  });
  return json({ ok: true, tableCode: result.code, created: result.created });
}
