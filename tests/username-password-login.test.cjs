const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,pbkdf2Sync,createHash}=require('node:crypto');
globalThis.crypto=globalThis.crypto||webcrypto;

const root=path.join(__dirname,'..');
const read=path=>fs.readFileSync(require('node:path').join(root,path),'utf8');
const load=async source=>(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')));
const accountSource=read('src/account-api.js');
const sessionSource=read('src/session-api.js');
const storageSource=read('src/storage-api.js').replace(
  "from './session-api.js'",
  "from 'data:text/javascript;base64,"+Buffer.from(sessionSource).toString('base64')+"'"
);
const S='S'.repeat(48);
const K='OLM-'+'A'.repeat(64);
const PA='correct-password-very-long';
const PS='player-password-very-long';
const ctx=()=>{
  const data=new Map();
  const storage={
    get:async k=>data.get(k),
    put:async(k,v)=>{data.set(k,v);},
    delete:async k=>{data.delete(k);},
    list:async({prefix})=>new Map([...data].filter(([k])=>k.startsWith(prefix))),
    transaction:async fn=>fn(storage)
  };
  return {data,storage};
};
const post=(endpoint,value,headers={})=>new Request('https://example.test'+endpoint,{
  method:'POST',headers:{'Content-Type':'application/json',...headers},
  body:JSON.stringify(value)
});
function harness(){
  const registry=ctx(),room=ctx();
  const env={
    MASTER_DATA_TOKEN:S,
    TABLE_ROOMS:{
      getByName(name){
        assert.equal(name,'SYSTEM_MASTER_PROFILE_V2');
        return {fetch:request=>registryHandle(request,registry,env)};
      }
    }
  };
  let registryHandle,sessionHandle,storageHandle;
  return {
    registry,room,env,
    async init(){
      registryHandle=(await load(accountSource)).handleAccountRequest;
      sessionHandle=(await load(sessionSource)).handleSessionRequest;
      storageHandle=(await load(storageSource)).handleStorageRequest;
    },
    account:(action,body,cookie='')=>registryHandle(post('/api/account',{action,...body},cookie?{Cookie:cookie}:{}),registry,env),
    internal:(action,body)=>registryHandle(post('/api/account-internal',{action,...body},
      {'X-OL-Internal-Auth':S}),registry,env),
    session:(table,body,cookie='')=>sessionHandle(new Request(
      'https://example.test/api/session?mesa='+encodeURIComponent(table),{
        method:body?'POST':'GET',
        headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      }),room,env),
    register:(table,cookie,body)=>storageHandle(post(
      '/api/storage?mesa='+encodeURIComponent(table)+'&kind=account-register&edicao=temporada',
      body,{Cookie:cookie}),room,env)
  };
}
async function setup(h){
  const username='narrador',salt='a'.repeat(32);
  const key='account:user:v1:'+createHash('sha256').update(username).digest('hex');
  h.registry.data.set('owner:permanent-room-code:v1','VESTIGIOS');
  h.registry.data.set('account:master:v1',key);
  h.registry.data.set(key,{
    role:'master',username,tableCode:'VESTIGIOS',salt,
    passwordHash:pbkdf2Sync(PA,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex')
  });
}
test('login do mestre exige usuário e senha e não permite primeiro visitante cadastrar conta',async()=>{
  const h=harness();await h.init();await setup(h);
  let res=await h.account('setup-master',{username:'intruso',password:PA,proofKey:S});
  assert.equal(res.status,400);
  res=await h.account('lookup',{username:'narrador',password:'senha-incorreta'});
  assert.equal(res.status,401);
  res=await h.account('lookup',{username:'NARRADOR',password:PA});
  assert.equal(res.status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(await res.json())),{
    ok:true,role:'master',tableCode:'VESTIGIOS',code:'',
    tables:[{tableCode:'VESTIGIOS',name:'Mesa principal'}]
  });
  const stored=JSON.stringify([...h.registry.data]);
  assert(!stored.includes(PA));
  assert(stored.includes('passwordHash'));
});
test('mestre autentica no cookie da mesa e outra mesa é rejeitada',async()=>{
  const h=harness();await h.init();await setup(h);
  const auth={role:'master',username:'narrador',password:PA};
  assert.equal((await h.session('T2_OUTRA',auth)).status,401);
  const response=await h.session('T2_VESTIGIOS',auth);
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.session('T2_VESTIGIOS',null,cookie)).status,200);
});
test('jogador só pode criar login para a ficha que seu convite autoriza',async()=>{
  const h=harness();await h.init();await setup(h);
  const ownerKey='a'.repeat(96);
  const ownerHash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerKey));
  const hash=[...new Uint8Array(ownerHash)].map(b=>b.toString(16).padStart(2,'0')).join('');
  h.room.data.set('sheet:temporada:VESTIGIOS-CLARA:owner-sha256',hash);
  const ticket=await h.session('T2_VESTIGIOS',{
    role:'player',edition:'temporada',code:'VESTIGIOS-CLARA',key:ownerKey
  });
  assert.equal(ticket.status,200);
  const cookie=ticket.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.register('T2_VESTIGIOS','',{username:'clara',password:PS})).status,403);
  let res=await h.register('T2_VESTIGIOS',cookie,{username:'clara',password:PS});
  assert.equal(res.status,200);
  assert.equal((await res.json()).ok,true);
  res=await h.account('lookup',{username:'clara',password:PS});
  assert.deepEqual(JSON.parse(JSON.stringify(await res.json())),{
    ok:true,role:'player',tableCode:'VESTIGIOS',code:'VESTIGIOS-CLARA',
    tables:[{tableCode:'VESTIGIOS',code:'VESTIGIOS-CLARA',name:'Mesa VESTIGIOS'}]
  });
  assert.equal((await h.session('T2_VESTIGIOS',{
    role:'player',edition:'temporada',code:'OUTRO',username:'clara',password:PS
  })).status,401);
  res=await h.session('T2_VESTIGIOS',{
    role:'player',edition:'temporada',code:'VESTIGIOS-CLARA',username:'clara',password:PS
  });
  assert.equal(res.status,200);
  // A reissued invitation revokes both previous password sessions and login.
  h.room.data.set('sheet:temporada:VESTIGIOS-CLARA:owner-sha256','b'.repeat(64));
  const oldCookie=res.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.session('T2_VESTIGIOS',null,oldCookie)).status,401);
  res=await h.session('T2_VESTIGIOS',{
    role:'player',edition:'temporada',code:'VESTIGIOS-CLARA',username:'clara',password:PS
  });
  assert.equal(res.status,401);
});
test('limite de tentativas e usuário reservado evitam força bruta e colisão',async()=>{
  const h=harness();await h.init();await setup(h);
  for(let i=0;i<6;i++)await h.account('lookup',{username:'narrador',password:'errada-aaaaaaaa'});
  const res=await h.account('lookup',{username:'narrador',password:PA});
  assert.equal(res.status,429);
  assert.equal((await res.json()).error,'too_many_attempts');
  const privateCall=await (await load(accountSource)).handleAccountRequest(
    post('/api/account-internal',{action:'register-player',username:'xpto',password:PS}),
    h.registry,h.env);
  assert.equal(privateCall.status,403);
});
test('portal usa só usuário e senha; convites novos ativam jogador',()=>{
  const html=read('public/index.html');
  for(const id of ['login-username','login-password','login-form',
    'change-master-form','guest-player-menu','player-join-form'])
    assert(html.includes('id="'+id+'"'),id);
  assert(!html.includes('id="master-key"'));
  assert(!html.includes('id="room-label"'));
  assert(html.includes('OLNative.lookupAccount(username,password)'));
  assert(!html.includes('id="player-setup-form"'));
  assert(html.includes("destination('player',normalizedTable,normalizedCode)"));
  assert(html.includes('enterPlayer(inviteCredentials.table,inviteCredentials.code,inviteCredentials.key'));
  assert(html.includes("history.replaceState(null,'',location.pathname+location.search)"));
  assert(!html.includes('localStorage.setItem(KEY_STORAGE'));
  assert(!html.includes('master-setup-form'));
  assert(!html.includes('recuperar'));
  assert(html.includes('OLNative.changeMasterCredentials('));
  const invites=read('public/acessos.html');
  assert(!invites.includes('id="room-label"'));
  assert(invites.includes("generateInternalCode()"));
  assert(invites.includes('id="character-name"'));
  const worker=read('src/worker.js');
  assert(worker.includes("if (url.pathname === '/api/account')"));
  assert(!worker.includes("if (url.pathname === '/api/account-internal')"));
});
test('scripts inline da interface continuam válidos',()=>{
  for(const file of ['public/index.html','public/acessos.html']){
    const content=read(file);
    for(const [i,match] of [...content.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries()){
      if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1],{filename:file+':'+i}));
    }
  }
});

test('sessão da conta cria e abre mesas sem senha, recusa outras contas e é revogada no logout',async()=>{
  const h=harness();await h.init();await setup(h);
  const auth=await h.account('lookup',{username:'narrador',password:PA});
  const account=auth.headers.get('set-cookie').split(';')[0];
  assert.match(auth.headers.get('set-cookie'),/ol_account_session=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Lax/);
  assert.equal((await h.account('create-master-table',{useSession:true,name:'Grupo B'})).status,401);
  const creation=await h.account('create-master-table',{useSession:true,name:'Grupo B'},account);
  assert.equal(creation.status,201);
  const table=(await creation.json()).tableCode;
  const current=await (await h.account('current-account',{},account)).json();
  assert.equal(current.tables.length,2);
  assert.equal(current.username,'narrador');
  const room=await h.session('T2_'+table,{role:'master',useAccount:true},account);
  assert.equal(room.status,200);
  const roomCookie=room.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.session('T2_'+table,null,roomCookie)).status,401);
  assert.equal((await h.session('T2_'+table,null,account+'; '+roomCookie)).status,200);
  assert.equal((await h.session('T2_OUTRA',{role:'master',useAccount:true},account)).status,401);
  assert.equal((await h.account('logout-account',{},account)).status,200);
  assert.equal((await h.account('current-account',{},account)).status,401);
  assert.equal((await h.session('T2_'+table,null,account+'; '+roomCookie)).status,401);
});
test('jogador aceita convite adicional na mesma conta, mantém duas fichas e não acessa mesa alheia',async()=>{
  const h=harness();await h.init();await setup(h);
  const master=await h.account('lookup',{username:'narrador',password:PA});
  const masterCookie=master.headers.get('set-cookie').split(';')[0];
  const second=await (await h.account('create-master-table',{useSession:true,name:'Grupo B'},masterCookie)).json();
  const physical='T2_'+second.tableCode;
  const inviteA='a'.repeat(96),inviteB='b'.repeat(96);
  const hash=value=>createHash('sha256').update(value).digest('hex');
  h.room.data.set('sheet:temporada:CLARA1:owner-sha256',hash(inviteA));
  h.room.data.set('sheet:temporada:CLARA2:owner-sha256',hash(inviteB));
  const first=await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA1',key:inviteA});
  const firstCookie=first.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.register('T2_VESTIGIOS',firstCookie,{username:'clara',password:PS})).status,200);
  const login=await h.account('lookup',{username:'clara',password:PS});
  const account=login.headers.get('set-cookie').split(';')[0];
  const secondInvite=await h.session(physical,{role:'player',edition:'temporada',code:'CLARA2',key:inviteB});
  const secondCookie=secondInvite.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.register(physical,secondCookie+'; '+masterCookie,{useSession:true})).status,403);
  assert.equal((await h.register(physical,secondCookie+'; '+account,{useSession:true})).status,200);
  const current=await (await h.account('current-account',{},account)).json();
  assert.equal(current.tables.length,2);
  assert.deepEqual(current.tables.map(t=>t.code),['CLARA1','CLARA2']);
  const room1=await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA1',useAccount:true},account);
  const room2=await h.session(physical,{role:'player',edition:'temporada',code:'CLARA2',useAccount:true},account);
  assert.equal(room1.status,200);assert.equal(room2.status,200);
  assert.equal((await h.session(physical,{role:'player',edition:'temporada',code:'CLARA1',useAccount:true},account)).status,401);
  assert.equal((await h.session(physical,{role:'master',useAccount:true},account)).status,401);
  assert.equal((await h.register(physical,room2.headers.get('set-cookie').split(';')[0]+'; '+account,{useSession:true})).status,403);
  const reuse=await h.session(physical,{role:'player',edition:'temporada',code:'CLARA2',key:inviteB});
  assert.equal((await h.register(physical,reuse.headers.get('set-cookie').split(';')[0],{username:'intruso',password:PS})).status,409);
  h.room.data.set('sheet:temporada:CLARA2:owner-sha256',hash('c'.repeat(96)));
  assert.equal((await h.session(physical,{role:'player',edition:'temporada',code:'CLARA2',useAccount:true},account)).status,401);
  assert.equal((await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA1',useAccount:true},account)).status,200);
});

test('convite concede sessão de jogador durável por mesa sem conta, revogável pelo mestre',async()=>{
  const h=harness();await h.init();await setup(h);
  const key='a'.repeat(96),hash=createHash('sha256').update(key).digest('hex');
  h.room.data.set('sheet:temporada:CLARA:owner-sha256',hash);
  const res=await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA',key});
  assert.equal(res.status,200);
  assert.match(res.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax; Max-Age=7776000/);
  const cookie=res.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.session('T2_VESTIGIOS',null,cookie)).status,200);
  assert.equal((await h.session('T2_OUTRA',null,cookie)).status,401);
  assert.equal((await h.session('T2_VESTIGIOS',{role:'master',key})).status,401);
  h.room.data.set('sheet:temporada:CLARA:owner-sha256','b'.repeat(64));
  assert.equal((await h.session('T2_VESTIGIOS',null,cookie)).status,401);
  assert.equal((await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA',key})).status,401);
});
test('conta antiga pode autorizar dispositivo sem depender de sessão de conta posterior',async()=>{
  const h=harness();await h.init();await setup(h);
  const key='a'.repeat(96);
  h.room.data.set('sheet:temporada:CLARA:owner-sha256',createHash('sha256').update(key).digest('hex'));
  const invited=await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA',key});
  assert.equal((await h.register('T2_VESTIGIOS',invited.headers.get('set-cookie').split(';')[0],{username:'clara',password:PS})).status,200);
  const login=await h.account('lookup',{username:'clara',password:PS});
  const account=login.headers.get('set-cookie').split(';')[0];
  const remembered=await h.session('T2_VESTIGIOS',{role:'player',edition:'temporada',code:'CLARA',useAccount:true,rememberPlayer:true},account);
  assert.equal(remembered.status,200);
  const room=remembered.headers.get('set-cookie').split(';')[0];
  assert.equal((await h.account('logout-account',{},account)).status,200);
  assert.equal((await h.session('T2_VESTIGIOS',null,room)).status,200);
  assert.equal((await h.register('T2_VESTIGIOS',room,{username:'intruso',password:PS})).status,403);
});
