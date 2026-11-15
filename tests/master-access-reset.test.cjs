const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto,pbkdf2Sync}=require('node:crypto');
globalThis.crypto=globalThis.crypto||webcrypto;
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const password='teste-senha-mestre-2026';
const salt='a'.repeat(32);
const passwordHash=pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
const source=read('src/account-api.js');
assert(!source.includes(password),'A senha temporária nunca pode estar no repositório.');
assert(source.includes('initializeFreshMasterRegistry'));
const fixture=source
  .replace(/const INITIAL_MASTER_SALT = '[a-f0-9]{32}';/,"const INITIAL_MASTER_SALT = '"+salt+"';")
  .replace(/const INITIAL_MASTER_PASSWORD_HASH = '[a-f0-9]{64}';/,"const INITIAL_MASTER_PASSWORD_HASH = '"+passwordHash+"';");
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
function createStore(name){
  const records=new Map();
  const storage={
    get:async k=>records.get(k),put:async(k,v)=>records.set(k,v),
    delete:async k=>records.delete(k),
    list:async({prefix})=>new Map([...records].filter(([k])=>k.startsWith(prefix))),
    deleteAll:async()=>records.clear(),
    transaction:async fn=>fn(storage)
  };
  return {id:{name},storage,records};
}
async function harness(){
 const fresh=createStore('SYSTEM_MASTER_PROFILE_V2');
 const oldRegistry=createStore('SYSTEM_MASTER_PROFILE_V1');
 const oldRoom=createStore('T2_VESTIGIOS');
 oldRegistry.records.set('owner:permanent-room-code:v1','VESTIGIOS');
 oldRegistry.records.set('account:master:v1','account:user:v1:old');
 oldRegistry.records.set('account:user:v1:old',{username:'antigo'});
 oldRoom.records.set('sheet:temporada:CLARA:manifest',{name:'Clara'});
 oldRoom.records.set('content:master-clues:manifest',{name:'Pista'});
 oldRoom.records.set('monster:001',{name:'Criatura'});
 oldRoom.records.set('session:old-user',{role:'master'});
 const calls=[];
 const secret='S'.repeat(48);
 const env={MASTER_DATA_TOKEN:secret,TABLE_ROOMS:{
   getByName(name){
     calls.push(name);
     const ctx=name==='SYSTEM_MASTER_PROFILE_V1'?oldRegistry:oldRoom;
     return {fetch:async req=>{
       const route=new URL(req.url).pathname;
       if(route==='/api/master-room'&&name==='SYSTEM_MASTER_PROFILE_V1'){
         const body=await req.json();
         if(body.key!==secret)return Response.json({error:'forbidden'},{status:403});
         return Response.json({tableCode:'VESTIGIOS'});
       }
       if(route==='/api/admin-auth-reset'&&req.headers.get('X-OL-Internal-Auth')===secret){
         await ctx.storage.deleteAll();
         return Response.json({ok:true});
       }
       return Response.json({error:'forbidden'},{status:403});
     }};
   }
 }};
 const api=await load();
 const account=(action,body)=>api.handleAccountRequest(new Request('https://example.test/api/account',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action,...body})
 }),fresh,env);
 return {fresh,oldRegistry,oldRoom,calls,env,api,account};
}
test('apaga contas, fichas, monstros e pistas antigas; provisiona uma mesa vazia segura',async()=>{
 const h=await harness();
 await h.api.initializeFreshMasterRegistry(h.fresh,h.env);
 assert.equal(h.oldRegistry.records.size,0);
 assert.equal(h.oldRoom.records.size,0);
 const state=h.fresh.records;
 assert(state.get('owner:fresh-install:v2')?.initialized);
 assert.match(state.get('owner:permanent-room-code:v1'),/^M[A-F0-9]{20}$/);
 assert.notEqual(state.get('owner:permanent-room-code:v1'),'VESTIGIOS');
 const pointer=state.get('account:master:v1');
 const master=state.get(pointer);
 assert.equal(master.username,'mestre');
 assert.equal(master.role,'master');
 assert.equal(master.tableCode,state.get('owner:permanent-room-code:v1'));
 assert.equal(master.passwordHash,passwordHash);
 assert(!JSON.stringify([...state]).includes(password));
 const before=h.calls.length;
 await h.api.initializeFreshMasterRegistry(h.fresh,h.env);
 assert.equal(h.calls.length,before,'A limpeza deve acontecer somente uma vez');
 const signed=await h.account('lookup',{username:'mestre',password});
 assert.equal(signed.status,200);
 assert.equal((await signed.json()).tableCode,master.tableCode);
});
test('não apaga a mesa se a autorização administrativa falhar',async()=>{
 const h=await harness();
 h.env.MASTER_DATA_TOKEN='chave inválida';
 await assert.rejects(h.api.initializeFreshMasterRegistry(h.fresh,h.env));
 assert.equal(h.oldRoom.records.has('sheet:temporada:CLARA:manifest'),true);
 assert.equal(h.oldRegistry.records.has('account:master:v1'),true);
 assert(!h.fresh.records.has('owner:fresh-install:v2'));
});
test('novo login não pode ser assumido por visitantes sem senha',async()=>{
 const h=await harness();
 await h.api.initializeFreshMasterRegistry(h.fresh,h.env);
 let res=await h.account('setup-master',{username:'intruso',password:'qualquer senha longa'});
 assert.equal(res.status,400,'Cadastro anônimo está desativado');
 res=await h.account('reset-master',{username:'intruso',password:'qualquer senha longa',recoveryToken:'token'});
 assert.equal(res.status,400,'O endpoint de recuperação não existe mais');
 res=await h.account('lookup',{username:'mestre',password:'senha errada longa'});
 assert.equal(res.status,401);
});
test('mestre altera usuário e senha sem código de recuperação',async()=>{
 const h=await harness();
 await h.api.initializeFreshMasterRegistry(h.fresh,h.env);
 const response=await h.account('change-master-credentials',{
   username:'mestre',password,newUsername:'narrador',newPassword:'Minha-Nova-Senha-2026!'
 });
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
 assert.equal((await h.account('lookup',{username:'mestre',password})).status,401);
 assert.equal((await h.account('lookup',{username:'narrador',password:'Minha-Nova-Senha-2026!'})).status,200);
 const pointer=h.fresh.records.get('account:master:v1');
 assert.equal(h.fresh.records.get(pointer).username,'narrador');
});
test('interface oferece apenas login e troca de senha, sem recuperação ou código antigo',()=>{
 const portal=read('public/index.html');
 const worker=read('src/worker.js');
 const client=read('public/firebase-client.js');
 assert(portal.includes('id="login-username"'));
 assert(portal.includes('id="login-password"'));
 assert(portal.includes('id="change-master-form"'));
 assert(!/recupera|master-setup|setup-proof|player-manual|manual-table|chave antiga|recoveryToken/i.test(portal));
 assert(!/reset-master|setup-master|recoveryToken/i.test(client));
 assert(!/reset-master|setup-master|recoveryToken/i.test(source));
 assert(worker.includes("getByName('SYSTEM_MASTER_PROFILE_V2')"));
 assert(worker.includes('initializeFreshMasterRegistry(ctx,env)'));
 assert(read('src/session-api.js').includes("getByName('SYSTEM_MASTER_PROFILE_V2')"));
 assert(read('src/storage-api.js').includes("getByName('SYSTEM_MASTER_PROFILE_V2')"));
});
