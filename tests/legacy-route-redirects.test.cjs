const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export class TableRoom', 'class TableRoom')
  .replace('export default {', 'globalThis.worker = {');
const scope = { DurableObject: class {}, TextEncoder, TextDecoder, URL, Response, Request, console };
vm.runInNewContext(source, scope);

test('enderecos da primeira temporada redirecionam sem servir a aplicacao antiga', async () => {
  let assetReads = 0;
  const env = { ASSETS: { fetch: () => { assetReads++; throw Error('Nao deve servir pagina antiga'); } } };
  for (const oldPath of ['/mestre', '/mestre/', '/mestre.html', '/ficha', '/ficha/', '/ficha.html']) {
    const requestUrl = new URL('https://example.com' + oldPath + '?mesa=VESTIGIOS&view=P1');
    const res = await scope.worker.fetch(new Request(requestUrl), env);
    assert.equal(res.status, 308, oldPath);
    const next = new URL(res.headers.get('location'));
    assert.equal(next.pathname, oldPath.startsWith('/mestre') ? '/mestre-temporada.html' : '/ficha-temporada.html');
    assert.equal(next.searchParams.get('mesa'), 'VESTIGIOS');
    assert.equal(next.searchParams.get('view'), 'P1');
    assert.equal(next.searchParams.get('temporada'), '2');
  }
  assert.equal(assetReads, 0);
});

test('rotas publicas usam o Worker antes dos assets para aplicar o redirecionamento', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
  for (const route of ['/mestre', '/mestre/', '/mestre.html', '/ficha', '/ficha/', '/ficha.html']) {
    assert(config.assets.run_worker_first.includes(route), route);
  }
});
