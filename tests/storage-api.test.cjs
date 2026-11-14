const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const moduleUrl = 'data:text/javascript;base64,' + fs.readFileSync(
  path.join(__dirname, '../src/storage-api.js')).toString('base64');
const load = () => import(moduleUrl);

function fakeContext() {
  const values = new Map();
  return {
    storage: {
      get: async key => values.get(key),
      put: async (key, value) => { values.set(key, value); },
      delete: async key => { values.delete(key); }
    }
  };
}
function call(method, kind, bearer, body, extra = '') {
  return new Request('https://example.com/api/storage?mesa=MESA&kind=' + kind +
    '&codigo=HERO&edicao=classic' + extra, {
    method,
    headers: bearer ? { Authorization: 'Bearer ' + bearer } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}
test('only master may provision player access; player can save and recover JSON', async () => {
  globalThis.crypto = globalThis.crypto || webcrypto;
  const { handleStorageRequest } = await load();
  const ctx = fakeContext(), env = { MASTER_DATA_TOKEN: 'M'.repeat(48) };
  let response = await handleStorageRequest(call('POST', 'player-access', ''), ctx, env);
  assert.equal(response.status, 403);

  response = await handleStorageRequest(call('POST', 'player-access', 'M'.repeat(48)), ctx, env);
  assert.equal(response.status, 200);
  const { playerKey } = await response.json();
  assert.equal(playerKey.length, 96);

  response = await handleStorageRequest(call('PUT', 'character', 'N'.repeat(48), { life: 7 }), ctx, env);
  assert.equal(response.status, 403);
  response = await handleStorageRequest(call('PUT', 'character', playerKey, { life: 7, bag: ['torch'] }), ctx, env);
  assert.equal(response.status, 200);
  response = await handleStorageRequest(call('GET', 'character', playerKey), ctx, env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { life: 7, bag: ['torch'] });

  response = await handleStorageRequest(call('POST', 'player-access', 'M'.repeat(48)), ctx, env);
  const rotated = (await response.json()).playerKey;
  assert.notEqual(rotated, playerKey);
  response = await handleStorageRequest(call('GET', 'character', playerKey), ctx, env);
  assert.equal(response.status, 403);
  response = await handleStorageRequest(call('GET', 'character', rotated), ctx, env);
  assert.equal(response.status, 200);
});
test('master clues require master secret', async () => {
  globalThis.crypto = globalThis.crypto || webcrypto;
  const { handleStorageRequest } = await load();
  const ctx = fakeContext(), env = { MASTER_DATA_TOKEN: 'M'.repeat(48) };
  let response = await handleStorageRequest(call('PUT', 'clues', 'N'.repeat(48), []), ctx, env);
  assert.equal(response.status, 403);
  response = await handleStorageRequest(call('PUT', 'clues', 'M'.repeat(48), [{ title: 'Clue' }]), ctx, env);
  assert.equal(response.status, 200);
  response = await handleStorageRequest(call('GET', 'clues', 'M'.repeat(48)), ctx, env);
  assert.deepEqual((await response.json()).data, [{ title: 'Clue' }]);
});
