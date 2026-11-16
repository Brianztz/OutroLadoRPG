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


/* Entregas do mestre guardadas separadamente da ficha. Isso impede que um
   salvamento antigo do jogador sobrescreva pistas ou equipamentos recebidos. */
const MAX_GRANTS_PER_CHARACTER = 600;
// Cada importação de outra ficha inicia uma geração própria de entregas.
// A geração vazia preserva todos os registros históricos anteriores a esta mudança.
function masterGrantScope(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value) ? value : '';
}
function masterGrantIndex(root, scope = '') {
  return root + ':master-grant-ids' + (scope ? ':' + scope : '');
}
function masterGrantRecord(root, scope, id) {
  return root + ':master-grant:' + (scope ? scope + ':' : '') + id;
}
function nativeSheetHash(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function normalizeMasterGrant(type, source, id) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  if (type === 'item') {
    const name = String(source.n || '').trim().slice(0, 120);
    if (!name) return null;
    const isWeapon = source.type === 'arma';
    const ammo = source.type === 'municao';
    const lines = [
      String(source.d || '').slice(0, 5000),
      ...(isWeapon ? [
        'Dano: ' + String(source.dmg || '0').slice(0, 50),
        'Crítico: ' + String(source.crit || '×2').slice(0, 50),
        'Perícia: ' + String(source.skill || 'CONFRONTO').slice(0, 70),
        'Munição: ' + String(source.ammo || 'Nenhuma').slice(0, 70),
        'Capacidade: ' + String(source.capacity || 0).slice(0, 20),
        'Ataques: ' + String(source.atk || 1).slice(0, 20),
        'Alcance: ' + String(source.range || 'Curto').slice(0, 50)
      ] : [])
    ].filter(Boolean);
    return { id: 'master_item_' + id, name, description: lines.join('\n'),
      weight: Math.max(0, Math.min(999, Number(source.w) || 0)),
      quantity: 1, location: 'equipment', type: isWeapon ? 'weapon' : 'gear',
      image: String(source.img || '').slice(0, 3000),
      masterGranted: true, masterAmmo: ammo };
  }
  if (type === 'clue') {
    const name = String(source.title || '').trim().slice(0, 160);
    if (!name) return null;
    const clueType = source.type === 'book' ? 'book' : source.type === 'audio' ? 'audio' : 'object';
    const pages = (Array.isArray(source.pages) ? source.pages : []).slice(0, 100)
      .map(page => String(typeof page === 'string' ? page : page?.img || page?.src || ''))
      .filter(Boolean);
    const image = String(source.img || source.image || '');
    return {
      id: 'master_clue_' + id, title: name,
      text: String(source.desc ?? source.text ?? '').slice(0, 5000),
      image, type: clueType, backImg: String(source.backImg || ''),
      coverImg: String(source.coverImg || ''), coverBackImg: String(source.coverBackImg || ''),
      audioSrc: String(source.audioSrc || ''), audioImg: String(source.audioImg || ''),
      thickness: Math.max(4, Math.min(40, Number(source.thickness) || 18)), pages,
      masterGranted: true
    };
  }
  return null;
}
async function mergeMasterGrants(storage, root, payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.sheetJson !== 'string') return payload;
  let sheet;
  try { sheet = JSON.parse(payload.sheetJson); } catch (_) { return payload; }
  if (!sheet || sheet.version !== 1 || !sheet.state || typeof sheet.state !== 'object') return payload;
  const state = sheet.state;
  const scope = masterGrantScope(state.masterGrantScope);
  // Jamais reaplicar entregas da ficha anterior, mesmo que o código do jogador seja o mesmo.
  const ids = await storage.get(masterGrantIndex(root, scope));
  if (!Array.isArray(ids) || ids.length === 0) return payload;
  const applied = new Set(Array.isArray(state.masterGrantIds) ? state.masterGrantIds : []);
  const missing = ids.filter(id => !applied.has(id));
  if (!missing.length) return payload;
  const grants = await Promise.all(missing.map(id => getStored(storage, masterGrantRecord(root, scope, id))));
  if (grants.some(grant => !grant?.data)) throw new Error('Incomplete master delivery');
  for (let i = 0; i < missing.length; i++) {
    const entry = grants[i].data;
    const content = normalizeMasterGrant(entry.type, entry.payload, missing[i]);
    if (!content) throw new Error('Invalid master delivery');
    if (entry.type === 'item') {
      if (!state.inventory || typeof state.inventory !== 'object') {
        state.inventory = { items: [], equipped: { weapon: null, armor: null, important: null, backpack: null } };
      }
      if (!Array.isArray(state.inventory.items)) state.inventory.items = [];
      if (!state.inventory.items.some(item => item.id === content.id)) state.inventory.items.push(content);
    } else {
      if (!Array.isArray(state.clues)) state.clues = [];
      if (!state.clues.some(clue => clue.id === content.id)) state.clues.push(content);
    }
    applied.add(missing[i]);
  }
  state.masterGrantIds = [...applied];
  const sheetJson = JSON.stringify(sheet);
  return { ...payload, sheetJson, sheetHash: nativeSheetHash(sheetJson) };
}
async function persistMasterGrant(storage, root, type, payload, id) {
  // O escudo grava na geração da ficha atualmente salva no servidor.
  const scope = masterGrantScope(await storage.get(root + ':active-master-grant-scope'));
  const indexKey = masterGrantIndex(root, scope);
  const original = await storage.get(indexKey);
  if (Array.isArray(original) && original.includes(id)) return id;
  if (Array.isArray(original) && original.length >= MAX_GRANTS_PER_CHARACTER) {
    throw new Error('delivery_limit_reached');
  }
  const saved = await putStored(storage, masterGrantRecord(root, scope, id), { type, payload });
  if (saved.error) throw new Error(saved.error);
  const add = async store => {
    const ids = await store.get(indexKey);
    const existing = Array.isArray(ids) ? ids : [];
    if (existing.includes(id)) return;
    if (existing.length >= MAX_GRANTS_PER_CHARACTER) throw new Error('delivery_limit_reached');
    await store.put(indexKey, [...existing, id]);
  };
  if (typeof storage.transaction === 'function') await storage.transaction(add);
  else await add(storage);
  return id;
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

  if (kind !== 'character' && kind !== 'clues' && kind !== 'player-access'
    && kind !== 'player-list' && kind !== 'account-register' && kind !== 'grant')
    return json({ error: 'invalid_kind' }, 400);
  if (kind === 'account-register') {
    // A one-time invitation lets a player bind a username and password to the
    // EXISTING character. No new character is created or moved between tables.
    if (request.method !== 'POST') return json({error:'method_not_allowed'},405);
    if (session?.role !== 'player' || session.edition !== 'temporada')
      return json({error:'player_session_required'},403);
    if (String(request.headers.get('Content-Type')||'').split(';')[0].trim()!=='application/json')
      return json({error:'json_required'},415);
    const raw=await request.text();
    if(raw.length>512)return json({error:'request_too_large'},413);
    let payload;try{payload=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
    const code=session.code;
    const ownerHash=await ctx.storage.get('sheet:temporada:'+code+':owner-sha256');
    if (!ownerHash || !env.TABLE_ROOMS || masterSecret.length<32)
      return json({error:'player_session_required'},403);
    const physicalTable=url.searchParams.get('mesa')||'';
    const registry=env.TABLE_ROOMS.getByName('SYSTEM_MASTER_PROFILE_V2');
    const registration=await registry.fetch(new Request('https://internal.invalid/api/account-internal',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-OL-Internal-Auth':masterSecret},
      body:JSON.stringify({
        action:'register-player',username:payload?.username,
        password:payload?.password,physicalTable,code,ownerHash
      })
    }));
    const result=await registration.json().catch(()=>({error:'registration_failed'}));
    return json(result,registration.status);
  }
  if (kind === 'grant') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!master) return json({ error: 'master_credential_required' }, 403);
    if (edition !== 'temporada') return json({ error: 'season_required' }, 400);
    const serialized = await request.text();
    if (serialized.length > MAX_JSON_LENGTH) return json({ error: 'payload_too_large' }, 413);
    let grant;
    try { grant = JSON.parse(serialized); } catch (_) { return json({ error: 'invalid_json' }, 400); }
    const codes = [...new Set((Array.isArray(grant?.codes) ? grant.codes : []).map(asCode).filter(Boolean))];
    if (!codes.length || codes.length > 200) return json({ error: 'invalid_recipients' }, 400);
    if (!['item', 'clue'].includes(grant?.type)
      || !normalizeMasterGrant(grant.type, grant.payload, 'check')) {
      return json({ error: 'invalid_delivery' }, 400);
    }
    const invalidCodes = [];
    for (const playerCode of codes) {
      const root = 'sheet:temporada:' + playerCode;
      if (!await ctx.storage.get(root + ':owner-sha256')
        && !await ctx.storage.get(root + ':manifest')) invalidCodes.push(playerCode);
    }
    if (invalidCodes.length) return json({ error: 'unknown_recipients', codes: invalidCodes }, 404);
    const deliveryId = /^[a-zA-Z0-9_-]{8,80}$/.test(String(grant.deliveryId || ''))
      ? grant.deliveryId : crypto.randomUUID().replace(/-/g, '');
    const delivered = [];
    try {
      for (const playerCode of codes) {
        await persistMasterGrant(ctx.storage, 'sheet:temporada:' + playerCode,
          grant.type, grant.payload, deliveryId);
        delivered.push(playerCode);
      }
    } catch (error) {
      console.error('Master delivery failed', error);
      return json({ error: 'delivery_failed', delivered, remaining: codes.filter(c => !delivered.includes(c)) }, 500);
    }
    return json({ ok: true, delivered, count: delivered.length });
  }
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
      if(!name)name=String(await ctx.storage.get(root+':display-name')||'').trim().slice(0,80);
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
    const displayName=String(url.searchParams.get('nome')||'').trim().slice(0,80);
    if(displayName && url.searchParams.get('create')==='1')
      await ctx.storage.put(playerRoot+':display-name',displayName);
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
      if (!result) return json({ error: 'not_found' }, 404);
      if (kind === 'character' && edition === 'temporada') {
        result.data = await mergeMasterGrants(ctx.storage, root, result.data);
      }
      return json({ ok: true, ...result });
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
    if (kind === 'character' && edition === 'temporada') {
      payload = await mergeMasterGrants(ctx.storage, root, payload);
    }
    const result = await putStored(ctx.storage, root, payload);
    if (!result.error && kind === 'character' && edition === 'temporada') {
      // Atualizar a geração ativa somente após o salvamento completo da ficha.
      // Preservar a geração vazia permite abrir fichas legadas sem migração destrutiva.
      const sheet = typeof payload?.sheetJson === 'string' ? JSON.parse(payload.sheetJson) : null;
      const scope = masterGrantScope(sheet?.state?.masterGrantScope);
      await ctx.storage.put(root + ':active-master-grant-scope', scope);
    }
    return result.error ? json(result, 413) : json({ ok: true, ...result, ...(kind === 'character' && payload?.sheetHash ? { sheetHash: payload.sheetHash } : {}) });
  } catch (error) {
    console.error('Storage write failed', error);
    return json({ error: 'storage_write_failed' }, 500);
  }
}
