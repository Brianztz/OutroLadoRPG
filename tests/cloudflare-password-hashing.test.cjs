const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto, pbkdf2Sync, createHash } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../src/account-api.js'), 'utf8');
const salt = '00112233445566778899aabbccddeeff';
const password = 'test-only-master-password-123';
const legacyHash = pbkdf2Sync(password,Buffer.from(salt,'hex'),180000,32,'sha256').toString('hex');
const newHash = pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
assert.match(source,/const WORK_FACTOR = 100000;/);
const fixture = source
  .replace(/const INITIAL_MASTER_SALT = '[a-f0-9]{32}';/,"const INITIAL_MASTER_SALT = '"+salt+"';")
  .replace(/const INITIAL_MASTER_PASSWORD_HASH = '[a-f0-9]{64}';/,"const INITIAL_MASTER_PASSWORD_HASH = '"+newHash+"';")
  .replace(/const LEGACY_INITIAL_MASTER_PASSWORD_HASH = '[a-f0-9]{64}';/,"const LEGACY_INITIAL_MASTER_PASSWORD_HASH = '"+legacyHash+"';");
assert.notEqual(fixture,source);
let maxRequested = 0;
globalThis.crypto = {
  getRandomValues: array => webcrypto.getRandomValues(array),
  subtle: {
    digest: (...args) => webcrypto.subtle.digest(...args),
    importKey: (...args) => webcrypto.subtle.importKey(...args),
    deriveBits: (settings,...args) => {
      maxRequested = Math.max(maxRequested,settings.iterations);
      assert(settings.iterations <= 100000,
        'Cloudflare rejeita PBKDF2 com mais de 100.000 iterações');
      return webcrypto.subtle.deriveBits(settings,...args);
    }
  }
};
const api = import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
function setup(){
  const records = new Map();
  const storage = {
    get:async k=>records.get(k),
    put:async(k,v)=>records.set(k,v),
    delete:async k=>records.delete(k),
    transaction:async fn=>fn(storage)
  };
  const key = 'account:user:v1:' + createHash('sha256').update('mestre').digest('hex');
  const oldItem = {
    role:'master',username:'mestre',tableCode:'M6C8604FBE737F0724FE5',
    salt,passwordHash:legacyHash,createdAt:Date.now()-100000
  };
  records.set(key,oldItem);
  return {storage,key,records};
}
async function request(storage,username,password,action='lookup'){
  const {handleAccountRequest}=await api;
  const req=new Request('https://example.test/api/account',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,username,password})
  });
  return handleAccountRequest(req,{storage},{MASTER_DATA_TOKEN:'S'.repeat(48)});
}
test('login inicial migra verificador 180k sem usar operação não suportada',async()=>{
  const {storage,key,records}=setup();
  const wrong=await request(storage,'mestre','senha-totalmente-incorreta');
  assert.equal(wrong.status,401);
  assert.equal(records.get(key).passwordHash,legacyHash);
  const valid=await request(storage,'mestre',password);
  assert.equal(valid.status,200);
  assert.equal((await valid.json()).role,'master');
  assert.equal(records.get(key).passwordHash,newHash);
  const repeat=await request(storage,'mestre',password);
  assert.equal(repeat.status,200);
  assert.equal(maxRequested,100000);
});
test('cadastro e autenticação de novo mestre respeitam limite WebCrypto',async()=>{
  const {storage}=setup();
  const creation=await request(storage,'novomestre','senha-do-novo-mestre-2026','register-master');
  assert.equal(creation.status,201);
  const data=await creation.json();
  assert.match(data.tableCode,/^M[A-F0-9]{20}$/);
  const login=await request(storage,'novomestre','senha-do-novo-mestre-2026');
  assert.equal(login.status,200);
  assert.equal((await login.json()).tableCode,data.tableCode);
  assert.equal(maxRequested,100000);
});
