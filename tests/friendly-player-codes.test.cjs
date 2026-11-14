const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
globalThis.crypto = globalThis.crypto || webcrypto;

const root = path.join(__dirname, '..');
const authURL = 'data:text/javascript;base64,' + fs.readFileSync(path.join(root, 'src/session-api.js')).toString('base64');
const storageSource = fs.readFileSync(path.join(root, 'src/storage-api.js'), 'utf8')
  .replace("from './session-api.js'", "from '" + authURL + "'");
const sourceURL = 'data:text/javascript;base64,' + Buffer.from(storageSource).toString('base64');
const load = async () => (await import(sourceURL)).handleStorageRequest;
const secret = 'M'.repeat(48);
function mockContext() {
  const data = new Map();
  return { data, storage: {
    get: async key => data.get(key),
    put: async (key,value) => { data.set(key,value); },
    delete: async key => { data.delete(key); },
    list: async ({prefix}) => new Map([...data].filter(([key]) => key.startsWith(prefix)))
  }};
}
function request(kind, code='', mode='', auth=secret) {
  const url = new URL('https://example.test/api/storage');
  url.searchParams.set('mesa','T2_VESTIGIOS');
  url.searchParams.set('kind',kind);
  url.searchParams.set('edicao','temporada');
  if(code)url.searchParams.set('codigo',code);
  if(mode)url.searchParams.set(mode,'1');
  return new Request(url,{method:kind==='player-access'?'POST':'GET',headers:auth?{Authorization:'Bearer '+auth}:{}});
}
test('codigos amigaveis sao baseados em mesa e personagem e aceitam acentos', () => {
  const page=fs.readFileSync(path.join(root,'public/acessos.html'),'utf8');
  const start=page.indexOf('  function slug(value) {');
  const end=page.indexOf('  function updatePreview() {',start);
  assert(start>=0&&end>start);
  const fixture=vm.runInNewContext(page.slice(start,end)+'\nfriendlyCode();',{
    roomLabel:{value:'Vestígios'},characterName:{value:'Clára Valverde'}
  });
  assert.equal(fixture,'VESTIGIOS-CLARA-VALVERDE');
  const long=vm.runInNewContext(page.slice(start,end)+'\nfriendlyCode();',{
    roomLabel:{value:'Floresta da Serra dos Mortos'},characterName:{value:'João e Jéssica Pereira da Silva'}
  });
  assert.match(long,/^[A-Z0-9-]+$/);
  assert(long.length<=40);
  assert(page.includes('id="saved-list"'));
  assert(page.includes('OLNative.listPlayers(physical, edition)'));
  assert(!page.includes('function generateCode()'));
});
test('codigo existente nunca e substituido ao criar convite para mesmo nome', async () => {
  const handle=await load(),ctx=mockContext(),env={MASTER_DATA_TOKEN:secret};
  const code='VESTIGIOS-CLARA';
  let res=await handle(request('player-access',code,'create'),ctx,env);
  assert.equal(res.status,200);
  const first=(await res.json()).playerKey;
  assert.match(first,/^[a-f0-9]{96}$/);
  res=await handle(request('player-access',code,'create'),ctx,env);
  assert.equal(res.status,409);
  assert.equal((await res.json()).error,'character_code_taken');
  res=await handle(request('player-list'),ctx,env);
  assert.equal(res.status,200);
  const list=await res.json();
  assert.deepEqual(list.players.map(p=>p.code),[code]);
  assert(!JSON.stringify(list).includes(first));
});
test('lista antiga recupera personagem pelo nome e renova chave sem excluir ficha', async () => {
  const handle=await load(),ctx=mockContext(),env={MASTER_DATA_TOKEN:secret};
  const code='J0A1B2C3D4E5F6';
  const rootKey='sheet:temporada:'+code;
  const payload={characterName:'Lucas Santos',sheetJson:'{}',playerCode:code};
  const raw=JSON.stringify(payload);
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  const hash=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
  ctx.data.set(rootKey+':manifest',{parts:1,version:'old',hash,updatedAt:'2026-11-01T00:00:00Z'});
  ctx.data.set(rootKey+':chunk:old:0',raw);
  ctx.data.set(rootKey+':owner-sha256','hash_antigo_que_nao_pode_ser_revelado');
  let res=await handle(request('player-list'),ctx,env);
  assert.equal(res.status,200);
  let list=(await res.json()).players;
  assert.equal(list[0].name,'Lucas Santos');
  assert.equal(list[0].code,code);
  assert.equal(list[0].hasSheet,true);
  assert(!JSON.stringify(list).includes('hash_antigo'));
  res=await handle(request('player-access',code,'renew'),ctx,env);
  assert.equal(res.status,200);
  assert.notEqual(ctx.data.get(rootKey+':owner-sha256'),'hash_antigo_que_nao_pode_ser_revelado');
  assert.equal(ctx.data.get(rootKey+':chunk:old:0'),raw);
  assert.equal(ctx.data.get(rootKey+':manifest').hash,hash);
  res=await handle(request('player-access','NAOEXISTE','renew'),ctx,env);
  assert.equal(res.status,404);
});
test('lista de fichas so pode ser consultada pelo mestre',async()=>{
  const handle=await load(),ctx=mockContext(),env={MASTER_DATA_TOKEN:secret};
  ctx.data.set('sheet:temporada:CONFIDENCIAL:owner-sha256','hash');
  let res=await handle(request('player-list','','','incorreta'),ctx,env);
  assert.equal(res.status,403);
  res=await handle(request('player-list','','',''),ctx,env);
  assert.equal(res.status,403);
  res=await handle(request('player-list','','',secret),ctx,env);
  assert.equal(res.status,200);
  assert.equal((await res.json()).players[0].code,'CONFIDENCIAL');
});