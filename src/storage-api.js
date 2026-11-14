import { currentSession } from './session-api.js';
// Durable Object storage for character sheets and the master's clues.
// This API is intentionally independent from Firebase and GitHub tokens.
// It is disabled for master operations until MASTER_DATA_TOKEN is configured
// as a Cloudflare Worker secret. Keep this API on the application's origin.

const MAX_JSON_LENGTH = 30_000_000;
const CHUNK_SIZE = 96_000;

function asCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function sha256(input) {
  const bytes = new TextEncoder().encode(String(input));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}

async function getStored(storage, root) {
  const manifest = await storage.get(root + ':manifest');
  if (!manifest) return null;
  if (!Number.isInteger(manifest.parts) || manifest.parts < 0 || manifest.parts > 400) {
    throw new Error('Invalid stored manifest');
  }
  const values = await Promise.all(Array.from({ length: manifest.parts }, (_, i) =>
    storage.get(root + ':chunk:' + manifest.version + ':' + i)));
  if (values.some(value => typeof value !== 'string')) throw new Error('Missing storage chunk');
  const source = values.join('');
  if ((await sha256(source)) !== manifest.hash) throw new Error('Stored data hash mismatch');
  return { data: JSON.parse(source), updatedAt: manifest.updatedAt };
}

async function putStored(storage, root, payload) {
  const source = JSON.stringify(payload);
  if (!source || source.length > MAX_JSON_LENGTH) return { error: 'payload_too_large' };
  const old = await storage.get(root + ':manifest');
  const version = crypto.randomUUID();
  const parts = Array.from({ length: Math.ceil(source.length / CHUNK_SIZE) }, (_, i) =>
    source.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  // Publish manifest last, so incomplete writes cannot replace valid data.
  for (let i = 0; i < parts.length; i++) {
    await storage.put(root + ':chunk:' + version + ':' + i, parts[i]);
  }
  const manifest = {
    version, parts: parts.length, hash: await sha256(source),
    updatedAt: new Date().toISOString()
  };
  await storage.put(root + ':manifest', manifest);
  if (old && old.version !== version) {
    for (let i = 0; i < old.parts; i++) {
      await storage.delete(root + ':chunk:' + old.version + ':' + i);
    }
  }
  return { hash: manifest.hash, updatedAt: manifest.updatedAt };
}

export async function handleStorageRequest(request, ctx, env) {
  if (request.method !== 'GET' && request.method !== 'PUT' && request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const code = asCode(url.searchParams.get('codigo'));
  const edition = url.searchParams.get('edicao') === 'temporada' ? 'temporada' : 'classic';
  const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '')?.[1] || '';
  const masterSecret = String(env.MASTER_DATA_TOKEN || '');
  const session = await currentSession(request, ctx);
  const master = session?.role === 'master' || (masterSecret.length >= 32 && constantTimeEqual(bearer, masterSecret));

  if (kind !== 'character' && kind !== 'clues' && kind !== 'player-access' && kind !== 'player-list') return json({ error: 'invalid_kind' }, 400);
  if (kind === 'player-list') {
    // List only characters belonging to this physical room and edition.
    // Never return any player access key or its hash.
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (!master) return json({ error: 'master_credential_required' }, 403);
    const prefix = 'sheet:' + edition + ':';
    const entries = await ctx.storage.list({ prefix });
    const codes = new Set();
    for (const key of entries.keys()) {
      const match = /^sheet:(?:classic|temporada):([A-Z0-9_-]{1,40}):(?:owner-sha256|manifest)$/.exec(key);
      if (match) codes.add(match[1]);
      if (codes.size >= 200) break;
    }
    const players = await Promise.all([...codes].map(async playerCode => {
      const root = prefix + playerCode;
      let name = '', hasSheet = false;
      try {
        const result = await getStored(ctx.storage, root);
        hasSheet = Boolean(result);
        const saved = result?.data;
        name = String(saved?.characterName || '').trim().slice(0, 80);
        if (!name && typeof saved?.sheetJson === 'string') {
          const snapshot = JSON.parse(saved.sheetJson);
          name = String(snapshot?.state?.name || snapshot?.info?.char_nome
            || snapshot?.temporada?.state?.name || '').trim().slice(0, 80);
        }
      } catch (_) { /* A corrupt/legacy sheet must not block access recovery. */ }
      return { code: playerCode, name: name || playerCode, hasSheet };
    }));
    players.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.code.localeCompare(b.code));
    return json({ ok: true, players, truncated: codes.size >= 200 });
  }
  if (kind === 'player-access') {
    // Only the master can provision and rotate player access keys.
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!master) return json({ error: 'master_credential_required' }, 403);
    if (!code) return json({ error: 'invalid_character_code' }, 400);
    const playerRoot = 'sheet:' + edition + ':' + code;
    const alreadyExists = Boolean(await ctx.storage.get(playerRoot + ':owner-sha256')
      || await ctx.storage.get(playerRoot + ':manifest'));
    if (url.searchParams.get('create') === '1' && alreadyExists) {
      return json({ error: 'character_code_taken' }, 409);
    }
    if (url.searchParams.get('renew') === '1' && !alreadyExists) {
      return json({ error: 'character_not_found' }, 404);
    }
    const key = Array.from(crypto.getRandomValues(new Uint8Array(48)), byte =>
      byte.toString(16).padStart(2, '0')).join('');
    await ctx.storage.put(playerRoot + ':owner-sha256', await sha256(key));
    return json({ ok: true, playerCode: code, edition, playerKey: key });
  }
  if (request.method === 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (kind === 'character' && !code) return json({ error: 'invalid_character_code' }, 400);
  const root = kind === 'clues' ? 'content:master-clues' : 'sheet:' + edition + ':' + code;

  if (kind === 'clues') {
    if (!master) return json({ error: 'master_credential_required' }, 403);
  } else if (!master) {
    // Player keys are provisioned by the authenticated master, never self-claimed.
    const sessionAuthorized = session?.role === 'player'
      && session.code === code && session.edition === edition;
    if (!sessionAuthorized) {
      if (bearer.length < 43 || bearer.length > 256) return json({ error: 'player_key_required' }, 401);
      const existing = await ctx.storage.get(root + ':owner-sha256');
      if (!existing || !constantTimeEqual(existing, await sha256(bearer))) {
        return json({ error: 'invalid_player_key' }, 403);
      }
    }
  }

  if (request.method === 'GET') {
    try {
      const result = await getStored(ctx.storage, root);
      return result ? json({ ok: true, ...result }) : json({ error: 'not_found' }, 404);
    } catch (error) {
      console.error('Storage read failed', error);
      return json({ error: 'storage_read_failed' }, 500);
    }
  }
  const serialized = await request.text();
  if (serialized.length > MAX_JSON_LENGTH) return json({ error: 'payload_too_large' }, 413);
  let payload;
  try { payload = JSON.parse(serialized); } catch { return json({ error: 'invalid_json' }, 400); }
  try {
    const result = await putStored(ctx.storage, root, payload);
    return result.error ? json(result, 413) : json({ ok: true, ...result });
  } catch (error) {
    console.error('Storage write failed', error);
    return json({ error: 'storage_write_failed' }, 500);
  }
}
