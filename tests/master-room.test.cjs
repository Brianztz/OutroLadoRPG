const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
globalThis.crypto = globalThis.crypto || webcrypto;

const root = path.join(__dirname, '..');
const roomSource = fs.readFileSync(path.join(root, 'src/master-room-api.js'), 'utf8');
const sessionSource = fs.readFileSync(path.join(root, 'src/session-api.js'), 'utf8');
const roomUrl = 'data:text/javascript;base64,' + Buffer.from(roomSource).toString('base64');
const sessionUrl = 'data:text/javascript;base64,' + Buffer.from(sessionSource).toString('base64');
const load = async () => (await import(roomUrl)).handleMasterRoomRequest;
const OWNER_KEY = 'Z'.repeat(64);
const PERSON_1 = 'OLM-' + 'A'.repeat(64);
const PERSON_2 = 'OLM-' + 'B'.repeat(64);
const env = () => ({ MASTER_DATA_TOKEN: OWNER_KEY });
function fakeContext() {
  const values = new Map();
  const storage = {
    get: async key => values.get(key),
    put: async (key, value) => { values.set(key, value); },
    delete: async key => values.delete(key),
    transaction: async fn => fn(storage)
  };
  return { storage, values };
}
function login(key, extra = {}) {
  return new Request('https://example.com/api/master-room', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, ...extra })
  });
}
function check(key, table, token = OWNER_KEY) {
  return new Request('https://internal.invalid/api/master-key-check', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-OL-Internal-Auth': token },
    body: JSON.stringify({ key, physicalTable: table })
  });
}
test('chave pessoal nasce bloqueada e nao concede escudo a visitante anonimo', async () => {
  const room = await load(), ctx = fakeContext();
  let response = await room(login(PERSON_1), ctx, env());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'activation_required');
  assert.equal(ctx.values.size, 0);
  response = await room(login(PERSON_1, { activationSecret: 'errada' }), ctx, env());
  assert.equal(response.status, 401);
  assert.equal(ctx.values.size, 0);
  response = await room(login('senha-invalida'), ctx, env());
  assert.equal(response.status, 401);
});
test('primeira ativacao registra apenas o hash e reaproveita codigo de mesa permanente', async () => {
  const room = await load(), ctx = fakeContext();
  let response = await room(login(OWNER_KEY, { preferredCode: 'VESTIGIOS' }), ctx, env());
  assert.equal((await response.json()).tableCode, 'VESTIGIOS');
  response = await room(login(PERSON_1, { activationSecret: OWNER_KEY }), ctx, env());
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.tableCode, 'VESTIGIOS');
  assert.equal(result.activated, true);
  const stored = JSON.stringify([...ctx.values]);
  assert(!stored.includes(PERSON_1), 'Chave pessoal nao pode ficar em texto puro no banco');
  assert(!stored.includes(OWNER_KEY), 'Chave antiga nao pode ficar em texto puro no banco');
  response = await room(login(PERSON_1), ctx, env());
  result = await response.json();
  assert.equal(result.tableCode, 'VESTIGIOS');
  assert.equal(result.activated, true);
});
test('chave de outro navegador nao pode roubar um mestre ja ativado', async () => {
  const room = await load(), ctx = fakeContext();
  const first = await room(login(PERSON_1, { activationSecret: OWNER_KEY }), ctx, env());
  const table = (await first.json()).tableCode;
  assert.match(table, /^M[A-F0-9]{20}$/);
  let response = await room(login(PERSON_2), ctx, env());
  assert.equal(response.status, 403);
  response = await room(login(PERSON_2, { activationSecret: OWNER_KEY }), ctx, env());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'already_activated');
  response = await room(login(PERSON_1), ctx, env());
  assert.equal((await response.json()).tableCode, table);
});
test('validacao interna so aceita chave ativa e mesa T2 correta', async () => {
  const room = await load(), ctx = fakeContext();
  await room(login(PERSON_1, { activationSecret: OWNER_KEY, preferredCode: 'VESTIGIOS' }), ctx, env());
  const correct = await room(check(PERSON_1, 'T2_VESTIGIOS'), ctx, env());
  assert.equal(correct.status, 200);
  assert.equal((await correct.json()).ok, true);
  assert.equal((await room(check(PERSON_1, 'T2_OUTRA'), ctx, env())).status, 401);
  assert.equal((await room(check(PERSON_2, 'T2_VESTIGIOS'), ctx, env())).status, 401);
  assert.equal((await room(check(PERSON_1, 'T2_VESTIGIOS', 'forjada'), ctx, env())).status, 403);
  assert.equal((await room(new Request('https://example.com/api/master-key-check'), ctx, env())).status, 405);
});
test('login de mestre usa a chave pessoal apenas para sua propria mesa', async () => {
  const room = await load(), handleSession = (await import(sessionUrl)).handleSessionRequest;
  const registry = fakeContext();
  await room(login(PERSON_1, { activationSecret: OWNER_KEY, preferredCode: 'VESTIGIOS' }), registry, env());
  const sessionStorage = fakeContext();
  const fullEnv = {
    ...env(),
    TABLE_ROOMS: { getByName: code => {
      assert.equal(code, 'SYSTEM_MASTER_PROFILE_V1');
      return { fetch: request => room(request, registry, env()) };
    } }
  };
  async function signIn(table, secret) {
    return handleSession(new Request('https://example.com/api/session?mesa=' + table, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'master', key: secret })
    }), sessionStorage, fullEnv);
  }
  let response = await signIn('T2_OUTRA', PERSON_1);
  assert.equal(response.status, 401);
  response = await signIn('T2_VESTIGIOS', PERSON_2);
  assert.equal(response.status, 401);
  response = await signIn('T2_VESTIGIOS', PERSON_1);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  // Legacy token remains available to the site administrator for emergency access.
  response = await signIn('T2_VESTIGIOS', OWNER_KEY);
  assert.equal(response.status, 200);
});
test('portal gera chave criptografica sem servidor e exige ativacao antes da permissao', () => {
  const portal = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const native = fs.readFileSync(path.join(root, 'public/firebase-client.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');
  assert(portal.includes("crypto.getRandomValues(new Uint8Array(32))"));
  assert(portal.includes("localStorage.setItem(KEY_STORAGE, key)"));
  assert(portal.includes('readonly autocomplete="off" spellcheck="false"'));
  assert(portal.includes('OLNative.getMasterRoom(personalKey, preferredCode, bootstrap)'));
  assert(portal.includes('OLNative.signInMaster(physicalRoom(table), personalKey)'));
  assert(portal.includes('void inspectMasterKey(!notice)'));
  assert(portal.includes("document.getElementById('restore-master-button')"));
  assert(native.includes('activationSecret'));
  assert(worker.includes("new URL(request.url).pathname === '/api/master-key-check'"));
  assert(worker.includes("getByName('SYSTEM_MASTER_PROFILE_V1')"));
  assert(!portal.includes('value="classic"'));
});
test('escudo Vestigios continua com seu codigo de mesa fixo e convite individual', () => {
  const master = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
  const portal = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert(master.includes('onclick="copyMasterTableCode()"'));
  assert(master.includes("url.searchParams.set('mesa', masterTableCode)"));
  assert(!master.includes('function switchMasterTable('));
  assert(portal.includes('OLNative.signInPlayer(physical, edition, normalizedCode, key)'));
});
