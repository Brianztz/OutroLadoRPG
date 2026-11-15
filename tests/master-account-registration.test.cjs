const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
globalThis.crypto=globalThis.crypto||webcrypto;
const src=fs.readFileSync(path.join(__dirname,'../src/account-api.js'),'utf8');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
function context(){
  const data=new Map();
  const storage={
    get:async key=>data.get(key),
    put:async(key,value)=>data.set(key,value),
    delete:async key=>data.delete(key),
    list:async({prefix})=>new Map([...data].filter(([key])=>key.startsWith(prefix))),
    transaction:async fn=>fn(storage)
  };
  return {data,storage};
}
async function harness(){
  const account=(await load()).handleAccountRequest;
  const ctx=context(),secret='S'.repeat(48);
  const env={MASTER_DATA_TOKEN:secret};
  const request=(action,body={},internal=false,ip='')=>new Request(
    'https://outrolado.example/api/'+(internal?'account-internal':'account'),{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(internal?{'X-OL-Internal-Auth':secret}:{}),
        ...(ip?{'CF-Connecting-IP':ip}:{})
      },
      body:JSON.stringify({action,...body})
    }
  );
  const call=(action,data={},internal=false,ip='')=>account(
    request(action,data,internal,ip),ctx,env
  );
  return {call,ctx};
}
const password='uma-senha-segura-2026';
const pass2='outra-senha-segura-2026';
const physical=table=>'T2_'+table;

test('qualquer visitante pode criar conta de mestre sem convite, com mesa exclusiva',async()=>{
  const h=await harness();
  const a=await h.call('register-master',{username:'Mestre_Ana',password});
  assert.equal(a.status,201);
  const alice=await a.json();
  assert.equal(alice.role,'master');
  assert.match(alice.tableCode,/^M[A-F0-9]{20}$/);
  const b=await h.call('register-master',{username:'Mestre_Bruno',password:pass2});
  assert.equal(b.status,201);
  const bruno=await b.json();
  assert.notEqual(bruno.tableCode,alice.tableCode,'Cada mestre tem mesa independente');
  assert.equal(h.ctx.data.get('account:master:v1'),undefined,'Cadastro não toma posse do mestre anterior');
  for(const [name,pass,tableCode] of [
    ['mestre_ana',password,alice.tableCode],
    ['mestre_bruno',pass2,bruno.tableCode]]) {
    const response=await h.call('lookup',{username:name,password:pass});
    assert.equal(response.status,200);
    const account=await response.json();
    assert.equal(account.tableCode,tableCode);
    assert.equal(account.role,'master');
  }
  assert(!JSON.stringify([...h.ctx.data]).includes(password));
  assert(!JSON.stringify([...h.ctx.data]).includes(pass2));
  assert.equal((await h.call('register-master',{username:'mestre_ana',password:pass2})).status,409);
});

test('mestre de uma mesa não pode autenticar ou assumir outra mesa',async()=>{
  const h=await harness();
  const ra=await (await h.call('register-master',{username:'ana',password})).json();
  const rb=await (await h.call('register-master',{username:'bruno',password:pass2})).json();
  const directA=await h.call('check',{
    username:'ana',password,role:'master',physicalTable:physical(ra.tableCode)
  },true);
  assert.equal(directA.status,200);
  const crossA=await h.call('check',{
    username:'ana',password,role:'master',physicalTable:physical(rb.tableCode)
  },true);
  assert.equal(crossA.status,401);
  const fakeRole=await h.call('check',{
    username:'ana',password,role:'player',physicalTable:physical(ra.tableCode)
  },true);
  assert.equal(fakeRole.status,401);
  const missingInternalSecret=await (await load()).handleAccountRequest(
    new Request('https://outrolado.example/api/account-internal',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'check',username:'ana',password,role:'master',physicalTable:physical(ra.tableCode)
      })
    }),h.ctx,{MASTER_DATA_TOKEN:'S'.repeat(48)}
  );
  assert.equal(missingInternalSecret.status,403);
});

test('convite de jogador pode ser registrado em mesa de mestre recém-criado',async()=>{
  const h=await harness();
  const a=await (await h.call('register-master',{username:'ana',password})).json();
  const b=await (await h.call('register-master',{username:'bruno',password:pass2})).json();
  const code='JOGADOR_01',ownerHash='a'.repeat(64);
  let result=await h.call('register-player',{
    username:'clara',password:'senha-da-clara-2026',
    physicalTable:physical(a.tableCode),code,ownerHash
  },true);
  assert.equal(result.status,200);
  result=await h.call('lookup',{username:'clara',password:'senha-da-clara-2026'});
  const registered=await result.json();
  assert.equal(registered.role,'player');
  assert.equal(registered.tableCode,a.tableCode);
  assert.equal(registered.code,code);
  const wrongRoom=await h.call('register-player',{
    username:'falso',password:'senha-do-falso-2026',
    physicalTable:'T2_MSEM_DONO',code:'OUTRO',ownerHash
  },true);
  assert.equal(wrongRoom.status,403);
  const playerCross=await h.call('check',{
    username:'clara',password:'senha-da-clara-2026',role:'player',
    physicalTable:physical(b.tableCode),code
  },true);
  assert.equal(playerCross.status,401);
});

test('alterar usuário do mestre preserva o dono da sala e o registro de novos jogadores',async()=>{
  const h=await harness();
  const reg=await (await h.call('register-master',{username:'ana',password})).json();
  const edit=await h.call('change-master-credentials',{
    username:'ana',password,newUsername:'nova_ana',newPassword:pass2
  });
  assert.equal(edit.status,200);
  assert.equal((await h.call('lookup',{username:'ana',password})).status,401);
  const login=await h.call('lookup',{username:'nova_ana',password:pass2});
  assert.equal(login.status,200);
  assert.equal((await login.json()).tableCode,reg.tableCode);
  const index=h.ctx.data.get('account:room-owner:v1:'+physical(reg.tableCode));
  assert(index && h.ctx.data.get(index).username==='nova_ana');
  const invite=await h.call('register-player',{
    username:'clara',password:'senha-da-clara-2026',
    physicalTable:physical(reg.tableCode),code:'PERSONAGEM1',
    ownerHash:'b'.repeat(64)
  },true);
  assert.equal(invite.status,200);
});

test('limita cadastro automático por IP sem bloquear acesso de mestre existente',async()=>{
  const h=await harness();
  for(let i=0;i<5;i++) {
    const r=await h.call('register-master',{
      username:'teste'+i,password
    },false,'203.0.113.2');
    assert.equal(r.status,201);
  }
  const denied=await h.call('register-master',{
    username:'teste6',password
  },false,'203.0.113.2');
  assert.equal(denied.status,429);
  assert.equal((await denied.json()).error,'too_many_signups');
  assert.equal((await h.call('lookup',{username:'teste0',password})).status,200);
});
