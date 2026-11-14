const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/master-room-api.js'), 'utf8');
const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
globalThis.crypto = globalThis.crypto || webcrypto;
const load = async () => (await import(moduleUrl)).handleMasterRoomRequest;

function fakeContext() {
  const values = new Map();
  const database = {
    get: async key => values.get(key),
    put: async (key, value) => { values.set(key, value); }
  };
  return { storage: { transaction: async fn => fn(database) }, values };
}
function login(secret, preferredCode = '') {
  return new Request('https://example.com/api/master-room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: secret, preferredCode })
  });
}
const validEnv = () => ({ MASTER_DATA_TOKEN: 'Z'.repeat(64) });

test('o mestre recebe um codigo criptografico fixo e persistente no Durable Object', async () => {
  const handle = await load(), ctx = fakeContext(), env = validEnv();
  let response = await handle(login('Z'.repeat(64)), ctx, env);
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal(first.ok, true);
  assert.match(first.tableCode, /^M[A-F0-9]{20}$/);
  assert.equal(first.created, true);
  response = await handle(login('Z'.repeat(64)), ctx, env);
  const again = await response.json();
  assert.equal(again.tableCode, first.tableCode);
  assert.equal(again.created, false);
  // Durable Object state survives new browser/device sessions and token rotation.
  response = await handle(login('Q'.repeat(64)), ctx, { MASTER_DATA_TOKEN: 'Q'.repeat(64) });
  assert.equal((await response.json()).tableCode, first.tableCode);
});
test('nenhum codigo de mesa e gerado antes da autenticacao do mestre', async () => {
  const handle = await load(), ctx = fakeContext(), env = validEnv();
  let response = await handle(login('senha-errada'), ctx, env);
  assert.equal(response.status, 401);
  assert.equal(ctx.values.size, 0);
  response = await handle(new Request('https://example.com/api/master-room'), ctx, env);
  assert.equal(response.status, 405);
  assert.equal(ctx.values.size, 0);
});
test('a primeira entrada pode aproveitar a mesa antiga sem permitir troca depois', async () => {
  const handle = await load(), ctx = fakeContext(), env = validEnv();
  let response = await handle(login('Z'.repeat(64), 'PADRAO'), ctx, env);
  assert.equal((await response.json()).tableCode, 'PADRAO');
  response = await handle(login('Z'.repeat(64), 'OUTRA_MESA'), ctx, env);
  const fixed = await response.json();
  assert.equal(fixed.tableCode, 'PADRAO');
  assert.equal(fixed.created, false);
});
test('na primeira entrada codigos invalidos ou reservados sao rejeitados', async () => {
  const handle = await load(), ctx = fakeContext(), env = validEnv();
  let response = await handle(login('Z'.repeat(64), 'SYSTEM_MASTER_PROFILE_V1'), ctx, env);
  assert.equal(response.status, 400);
  response = await handle(login('Z'.repeat(64), 'MESA!INVALIDA'), ctx, env);
  assert.equal(response.status, 400);
  assert.equal(ctx.values.size, 0);
});
test('o login do mestre usa o codigo permanente e o jogador mantem o link de convite', () => {
  const worker = fs.readFileSync(path.join(__dirname, '../src/worker.js'), 'utf8');
  const portal = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const adapter = fs.readFileSync(path.join(__dirname, '../public/firebase-client.js'), 'utf8');
  assert(worker.includes("getByName('SYSTEM_MASTER_PROFILE_V1')"));
  assert(worker.includes("handleMasterRoomRequest(request, this.ctx, this.env)"));
  assert(adapter.includes("base + 'master-room'"));
  assert(portal.includes('OLNative.getMasterRoom(key, preferredCode)'));
  assert(portal.includes("localStorage.setItem('master_permanent_table_code', table)"));
  assert(portal.includes("OLNative.signInMaster(physical, key)"));
  assert(portal.includes("OLNative.signInPlayer(physical, edition, code, key)"));
  assert(portal.includes("if (isPlayerInvite && keyInput.value && codeInput.value)"));
  assert(portal.includes("seasonSelect.value = params.get('temporada') === '2'"));
});
