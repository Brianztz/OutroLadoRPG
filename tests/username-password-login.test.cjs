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
    account:(action,body)=>registryHandle(post('/api/account',{action,...body}),registry,env),
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
    passwordHash:pbkdf2Sync(PA,Buffer.from(salt,'hex'),180000,32,'sha256').toString('hex')
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
    ok:true,role:'master',tableCode:'VESTIGIOS',code:''
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
    ok:true,role:'player',tableCode:'VESTIGIOS',code:'VESTIGIOS-CLARA'
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
    'change-master-form','player-setup-form','player-username','player-password'])
    assert(html.includes('id="'+id+'"'),id);
  assert(!html.includes('id="master-key"'));
  assert(!html.includes('id="room-label"'));
  assert(html.includes('OLNative.lookupAccount(username,password)'));
  assert(html.includes('OLNative.registerPlayerAccount(pendingPlayer.physical,username'));
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
