const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
globalThis.crypto=globalThis.crypto||webcrypto;

const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const token='b'.repeat(64);
const masterSecret='s'.repeat(64);
const password='senha-nova-123456';
// Use a test-only token. Never commit the real recovery link in GitHub.
const {createHash}=require('node:crypto');
const fixtureHash=createHash('sha256').update(token).digest('hex');
const production=source('src/account-api.js');
assert.match(production,/const expectedHash='[a-f0-9]{64}';/);
assert(!production.includes(token));
const fixture=production.replace(/const expectedHash='[a-f0-9]{64}';/,
  "const expectedHash='"+fixtureHash+"';");
const loaded=import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
const storage = () => {
  const map=new Map();
  const s={
    get:async k=>map.get(k),
    put:async(k,v)=>{map.set(k,v);},
    delete:async k=>{map.delete(k);},
    list:async({prefix})=>new Map([...map].filter(([key])=>key.startsWith(prefix))),
    transaction:async fn=>fn(s),
    deleteAll:async()=>{map.clear();}
  };
  return {storage:s,map};
};
async function harness(){
  const ctx=storage(),room=storage();
  const handler=(await loaded).handleAccountRequest;
  const calls=[];
  const env={
    MASTER_DATA_TOKEN:masterSecret,
    TABLE_ROOMS:{
      getByName(name){
        calls.push(name);
        assert.equal(name,'T2_VESTIGIOS');
        return {fetch:async req=>{
          assert.equal(new URL(req.url).pathname,'/api/admin-auth-reset');
          assert.equal(req.method,'POST');
          assert.equal(req.headers.get('X-OL-Internal-Auth'),masterSecret);
          await room.storage.deleteAll();
          return Response.json({ok:true,oldRoomErased:true});
        }};
      }
    }
  };
  ctx.map.set('owner:permanent-room-code:v1','VESTIGIOS');
  ctx.map.set('owner:personal-master-sha256:v1','old-hash');
  ctx.map.set('account:master:v1','account:user:v1:old');
  ctx.map.set('account:user:v1:old',{
    role:'master',username:'antigo',passwordHash:'0'.repeat(64),
    salt:'1234567890abcdef1234567890abcdef',tableCode:'VESTIGIOS'
  });
  ctx.map.set('account:player-index:v1:T2_VESTIGIOS:CLARA','account:user:v1:player');
  ctx.map.set('account:user:v1:player',{
    role:'player',username:'clara',passwordHash:'0'.repeat(64),
    salt:'1234567890abcdef1234567890abcdef',tableCode:'VESTIGIOS'
  });
  room.map.set('session:old-master',{role:'master'});
  room.map.set('session:old-player',{role:'player'});
  room.map.set('sheet:temporada:CLARA:owner-sha256','invitation-secret-hash');
  room.map.set('sheet:temporada:CLARA:manifest',{version:'legacy',parts:0});
  room.map.set('content:master-clues:manifest',{version:'legacy',parts:0});
  room.map.set('monster:001',{name:'Criatura'});
  const call=(action,fields)=>handler(new Request('https://test.example/api/account',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,...fields})
  }),ctx,env);
  return {ctx,room,env,calls,call};
}
test('token inválido não altera registros existentes nem dá acesso ao mestre',async()=>{
  const h=await harness();
  const result=await h.call('reset-master',{
    username:'mestre',password,recoveryToken:'token-falso'
  });
  assert.equal(result.status,403);
  assert.equal(h.ctx.map.get('account:master:v1'),'account:user:v1:old');
  assert.equal(h.room.map.get('sheet:temporada:CLARA:owner-sha256'),'invitation-secret-hash');
  assert.equal(h.calls.length,0);
});
test('link único apaga contas, fichas, monstros, pistas e sessões; cria mesa nova',async()=>{
  const h=await harness();
  const response=await h.call('reset-master',{
    username:'MestreNovo',password,recoveryToken:token
  });
  assert.equal(response.status,200);
  const data=await response.json();
  assert.match(data.tableCode,/^M[A-F0-9]{20}$/);
  assert.notEqual(data.tableCode,'VESTIGIOS');
  assert.equal(data.oldAccessRevoked,true);
  assert.equal(data.oldRoomErased,true);
  assert.equal(h.ctx.map.get('owner:permanent-room-code:v1'),data.tableCode);
  assert.equal(h.ctx.map.has('owner:personal-master-sha256:v1'),false);
  assert.equal(h.ctx.map.has('account:user:v1:old'),false);
  assert.equal(h.ctx.map.has('account:user:v1:player'),false);
  assert.equal(h.ctx.map.has('account:player-index:v1:T2_VESTIGIOS:CLARA'),false);
  assert.equal(h.room.map.has('session:old-master'),false);
  assert.equal(h.room.map.has('session:old-player'),false);
  assert.equal(h.room.map.has('sheet:temporada:CLARA:owner-sha256'),false);
  assert.equal(h.room.map.size,0);
  assert.equal(h.room.map.has('sheet:temporada:CLARA:manifest'),false);
  assert.equal(h.room.map.has('content:master-clues:manifest'),false);
  assert.equal(h.room.map.has('monster:001'),false);
  const masterKey=h.ctx.map.get('account:master:v1');
  const master=h.ctx.map.get(masterKey);
  assert.equal(master.username,'mestrenovo');
  assert.equal(master.role,'master');
  assert.equal(master.tableCode,data.tableCode);
  assert.notEqual(master.passwordHash,password);
  assert.equal(master.passwordHash.length,64);
  assert(!JSON.stringify([...h.ctx.map]).includes(password));
  assert.equal((await h.call('reset-master',{
    username:'outro',password,recoveryToken:token
  })).status,409);
  assert.equal(h.ctx.map.get('account:master:v1'),masterKey);
  const lookup=await h.call('lookup',{username:'MestreNovo',password});
  assert.equal(lookup.status,200);
  const account=await lookup.json();
  assert.equal(account.role,'master');
  assert.equal(account.tableCode,data.tableCode);
});
test('registro sem mesa existente é recusado, sem inventar nova mesa',async()=>{
  const h=await harness();
  h.ctx.map.delete('owner:permanent-room-code:v1');
  const result=await h.call('reset-master',{
    username:'mestre',password,recoveryToken:token
  });
  assert.equal(result.status,409);
  assert.equal((await result.json()).error,'no_existing_room');
  assert.equal(h.ctx.map.get('account:master:v1'),'account:user:v1:old');
});
test('rota de revogação é interna e exige segredo da Cloudflare',()=>{
  const worker=source('src/worker.js');
  assert(worker.includes("'/api/admin-auth-reset'"));
  assert(worker.includes("request.headers.get('X-OL-Internal-Auth')"));
  assert(worker.includes('await this.ctx.storage.deleteAll()'));
  assert(worker.includes('this.players.clear()'));
  assert(worker.includes('this.initiative=emptyInitiativeState()'));
  assert(!worker.includes("if (url.pathname === '/api/admin-auth-reset')"));
});
test('portal usa link em fragmento, não exige chave antiga e pede senha nova',()=>{
  const page=source('public/index.html');
  const client=source('public/firebase-client.js');
  assert(page.includes("recoveryFragment.get('recuperar')"));
  assert(page.includes("history.replaceState(null,'',location.pathname+location.search)"));
  assert(page.includes("OLNative.resetMasterAccount("));
  assert(page.includes("$('setup-proof-row').hidden=true"));
  assert(page.includes("localStorage.removeItem(KEY_STORAGE)"));
  assert(page.includes('id="setup-password"'));
  assert(page.includes('APAGAR MESA ANTIGA E CRIAR MEU NOVO LOGIN'));
  assert(page.includes('ATENÇÃO: esta operação apaga definitivamente a mesa anterior'));
  assert(client.includes("action:'reset-master'"));
  for(const [i,m] of [...page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
    if(m[1].trim())assert.doesNotThrow(()=>new vm.Script(m[1],{filename:'portal-script-'+i}));
  }
});
