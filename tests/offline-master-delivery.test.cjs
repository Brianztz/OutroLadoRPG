const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const sessionUrl = 'data:text/javascript;base64,' +
  fs.readFileSync(path.join(root, 'src/session-api.js')).toString('base64');
const storageSource = fs.readFileSync(path.join(root, 'src/storage-api.js'), 'utf8')
  .replace("from './session-api.js'", "from '" + sessionUrl + "'");
const moduleUrl = 'data:text/javascript;base64,' +
  Buffer.from(storageSource).toString('base64');
const load = () => import(moduleUrl);
const MASTER = 'M'.repeat(48);
const env = { MASTER_DATA_TOKEN: MASTER };

function context() {
  const records = new Map();
  const storage = {
    get: async key => records.get(key),
    put: async (key, value) => { records.set(key, value); },
    delete: async key => { records.delete(key); },
    transaction: async fn => fn(storage)
  };
  return { storage, records };
}
function request(method, kind, bearer = MASTER, body, code = 'HERO', edition = 'temporada') {
  return new Request('https://example.test/api/storage?mesa=T2_ROOM&kind=' + kind +
    '&codigo=' + code + '&edicao=' + edition, {
    method, headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
function character(name = 'Herói') {
  const sheetJson = JSON.stringify({
    version: 1, state: { name, attrs: {}, skills: {},
      inventory: { items: [], equipped: { weapon: null, armor: null } },
      clues: [] }
  });
  return { sheetJson, sheetHash: 'old-hash', characterName: name };
}
async function ready() {
  globalThis.crypto = globalThis.crypto || webcrypto;
  const { handleStorageRequest } = await load();
  const ctx = context();
  await ctx.storage.put('sheet:temporada:HERO:owner-sha256', 'registered');
  return { ctx, handle: (method, kind, bearer, data, code, edition) =>
    handleStorageRequest(request(method, kind, bearer, data, code, edition), ctx, env) };
}

test('somente mestre pode registrar entregas, e apenas para personagens da mesa', async () => {
  const { handle } = await ready();
  let res = await handle('POST', 'grant', 'N'.repeat(48), {
    codes: ['HERO'], type: 'item', payload: { n: 'Lanterna', type: 'comum' }
  });
  assert.equal(res.status, 403);
  res = await handle('POST', 'grant', MASTER, {
    codes: ['OTHER'], type: 'item', payload: { n: 'Lanterna' }
  });
  assert.equal(res.status, 404);
  assert.deepEqual((await res.json()).codes, ['OTHER']);
  res = await handle('POST', 'grant', MASTER, {
    codes: ['HERO'], type: 'item', payload: { n: 'Lanterna' }
  }, 'HERO', 'classic');
  assert.equal(res.status, 400);
});

test('arma enviada offline entra direto na ficha, sobrevive a salvamento desatualizado e não duplica', async () => {
  const { ctx, handle } = await ready();
  const old = character();
  assert.equal((await handle('PUT', 'character', MASTER, old)).status, 200);
  const gift = { codes: ['HERO'], deliveryId: 'gift-unique-001', type: 'item',
    payload: { n: 'Pistola', type: 'arma', w: 1, atk: 2, dmg: '3d8',
      crit: '20/x2', skill: 'PRECISÃO', ammo: 'Curta', capacity: 10, range: 'Curto' } };
  let res = await handle('POST', 'grant', MASTER, gift);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).count, 1);
  // Um segundo clique/reenvio com o mesmo ID não duplica a entrega.
  res = await handle('POST', 'grant', MASTER, gift);
  assert.equal(res.status, 200);
  assert.equal((await ctx.storage.get('sheet:temporada:HERO:master-grant-ids')).length, 1);
  res = await handle('GET', 'character', MASTER);
  let snapshot = JSON.parse((await res.json()).data.sheetJson);
  assert.equal(snapshot.state.inventory.items.length, 1);
  assert.equal(snapshot.state.inventory.items[0].type, 'weapon');
  assert.match(snapshot.state.inventory.items[0].description, /Dano: 3d8/);
  assert.match(snapshot.state.inventory.items[0].description, /Ataques: 2/);
  assert.deepEqual(snapshot.state.masterGrantIds, ['gift-unique-001']);
  // O jogador ainda tinha uma cópia anterior aberta e a salvou depois.
  assert.equal((await handle('PUT', 'character', MASTER, old)).status, 200);
  res = await handle('GET', 'character', MASTER);
  snapshot = JSON.parse((await res.json()).data.sheetJson);
  assert.equal(snapshot.state.inventory.items.length, 1);
});

test('pistas, incluindo livros e áudio, ficam salvas sem exigir websocket ativo', async () => {
  const { handle } = await ready();
  const gift = { codes: ['HERO'], deliveryId: 'clue-unique-001', type: 'clue',
    payload: { title: 'Gravação', desc: 'Áudio encontrado', type: 'audio',
      audioSrc: '/assets/gravação.mp3', img: '/assets/gravador.png' } };
  assert.equal((await handle('POST', 'grant', MASTER, gift)).status, 200);
  // O personagem ainda nem tinha criado a ficha: o presente fica na fila.
  assert.equal((await handle('GET', 'character', MASTER)).status, 404);
  assert.equal((await handle('PUT', 'character', MASTER, character())).status, 200);
  let res = await handle('GET', 'character', MASTER);
  let sheet = JSON.parse((await res.json()).data.sheetJson);
  assert.equal(sheet.state.clues.length, 1);
  assert.equal(sheet.state.clues[0].type, 'audio');
  assert.equal(sheet.state.clues[0].audioSrc, '/assets/gravação.mp3');
  assert.equal(sheet.state.clues[0].text, 'Áudio encontrado');
  assert.equal((await handle('POST', 'grant', MASTER, {
    codes: ['HERO'], deliveryId: 'clue-book-002', type: 'clue',
    payload: { title: 'Diário', type: 'book', img: '/capa.png',
      pages: [{ img: '/p1.png' }, { img: '/p2.png' }] }
  })).status, 200);
  res = await handle('GET', 'character', MASTER);
  sheet = JSON.parse((await res.json()).data.sheetJson);
  assert.equal(sheet.state.clues.length, 2);
  assert.deepEqual(sheet.state.clues[1].pages, ['/p1.png', '/p2.png']);
});

test('conteúdo removido pelo jogador não volta após a remoção ser salva', async () => {
  const { handle } = await ready();
  await handle('PUT', 'character', MASTER, character());
  await handle('POST', 'grant', MASTER, {
    codes: ['HERO'], deliveryId: 'gift-removable-01', type: 'item',
    payload: { n: 'Mapa', type: 'comum', w: 1 }
  });
  const received = await handle('GET', 'character', MASTER);
  const payload = (await received.json()).data;
  const sheet = JSON.parse(payload.sheetJson);
  assert.equal(sheet.state.inventory.items.length, 1);
  sheet.state.inventory.items = [];
  payload.sheetJson = JSON.stringify(sheet);
  assert.equal((await handle('PUT', 'character', MASTER, payload)).status, 200);
  const after = await handle('GET', 'character', MASTER);
  assert.equal(JSON.parse((await after.json()).data.sheetJson).state.inventory.items.length, 0);
});

test('escudo oculta o cabeçalho online e o histórico, mas mantém os cartões e seleciona offline', () => {
  const html = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
  const native = fs.readFileSync(path.join(root, 'public/firebase-client.js'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'public/temporada/sync.js'), 'utf8');
  assert(!html.includes('Jogadores conectados automaticamente'));
  assert(!html.includes('ÚLTIMAS ROLAGENS'));
  assert(!html.includes('id="player-rolls-list"'));
  assert(html.includes('id="players-board"'));
  assert(html.includes('for (const saved of savedPlayerSheets)'));
  assert(html.includes('await sendClueToPlayers('));
  assert(html.includes('await sendCatalogEntryToPlayers('));
  assert(html.includes('OLNative.grantCharacterContent('));
  assert(native.includes("query(table, 'grant', 'temporada')"));
  assert(sync.includes('mergeOfflineMasterDeliveries('));
});
