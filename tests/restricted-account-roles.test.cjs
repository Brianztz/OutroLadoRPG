const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(match=>match[1]).filter(s=>s.trim()).at(-1);
assert(script);
const eventsOf = element => element.events;
function harness(role='master',initialSession=false,initialStorage={},query='',fragment='') {
  const elements = new Map();
  const storage = new Map(Object.entries(initialStorage));
  const rooms = new Map();
  const calls = [];
  const location = {
    href:'https://outroladorpg.example/index.html'+query+fragment,
    origin:'https://outroladorpg.example',
    search:query,hash:fragment,pathname:'/index.html',
    navigations:[],
    assign(url){this.navigations.push(url);}
  };
  function el(id) {
    if(!elements.has(id))elements.set(id,{
      id,events:{},value:'',textContent:'',hidden:false,disabled:false,attributes:{},
      classList:{toggle(){}},
      addEventListener(type,cb){this.events[type]=cb;},
      setAttribute(name,value){this.attributes[name]=String(value);},
      getAttribute(name){return this.attributes[name];},
      children:[],replaceChildren(){this.children=[];},append(child){this.children.push(child);},
      focus(){},reset(){this.value='';}
    });
    return elements.get(id);
  }
  const accounts={
    master:{role:'master',tableCode:'MTEST123',code:'',tables:[{tableCode:'MTEST123',name:'Principal'},{tableCode:'MOUTRA',name:'Grupo B'}]},
    player:{role:'player',tableCode:'MTEST123',code:'JOGADOR01',tables:[{tableCode:'MTEST123',code:'JOGADOR01',name:'Principal'},{tableCode:'MOUTRA',code:'JOGADOR02',name:'Grupo B'}]}
  };
  let signed=initialSession,username='clara';
  const client={
    async lookupAccount(username,password) {
      calls.push(['lookup',username,password]);signed=true;
      return accounts[role];
    },
    async signInAccount(table,selectedRole,code,username,password,rememberPlayer) {
      calls.push(['signInAccount',table,selectedRole,code,username,password,rememberPlayer]);
      rooms.set(table,{ok:true,role:selectedRole,code});
    },
    async getSession(table){calls.push(['getSession',table]);if(!rooms.has(table))throw Object.assign(Error('expired'),{status:401});return rooms.get(table);},
    async createMasterTable(username,password,name) {
      calls.push(['createMasterTable',username,password,name]);
      return {ok:true,tableCode:'MNOVA',name};
    },
    async getAccountSession(){if(!signed)throw Error('account_session_required');return {...accounts[role],username};},
    async logoutAccount(){calls.push(['logoutAccount']);signed=false;},
    async joinPlayerAccount(table){calls.push(['joinPlayerAccount',table]);accounts.player.tables.push({tableCode:'MNOVA',code:'JOGADOR03',name:'Nova'});},
    async signInPlayer(table,edition,code,key) {
      calls.push(['signInPlayer',table,edition,code,key]);
      if(key==='INVALID')throw Object.assign(Error('invalid_credentials'),{status:401});
      rooms.set(table,{ok:true,role:'player',code});
    },
    async registerPlayerAccount(table,username,password) {
      calls.push(['registerPlayerAccount',table,username,password]);
    },
    async registerMasterAccount(username,password) {
      calls.push(['registerMasterAccount',username,password]);
      return {ok:true,role:'master',tableCode:'MTEST123'};
    },
    async signOut(table){calls.push(['signOut',table]);rooms.delete(table);},
    async changeMasterCredentials(){calls.push(['changeMasterCredentials']);}
  };
  const ctx={
    location,URL,URLSearchParams,console,window:{confirm:()=>true},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    sessionStorage:{setItem:(key,value)=>storage.set(key,value)},
    document:{getElementById:el,createElement:()=>({value:'',textContent:''})},
    OLFirebase:{
      normalizeTableCode:v=>String(v||'').toUpperCase(),
      seasonScopedTable:v=>'T2_'+v
    },
    OLNative:client
  };
  vm.runInNewContext(script,ctx,{filename:'portal.js'});
  return {elements,el,location,calls,ctx,client,rooms,storage};
}
async function submit(h,id) {
  const event = {preventDefault(){}};
  const handler = eventsOf(h.el(id)).submit;
  assert.equal(typeof handler,'function',id+' has no submit listener');
  await handler(event);
}
async function settle(){
  for(let i=0;i<20;i++)await Promise.resolve();
}

test('portal apresenta Criar Conta como Mestre sem convite e Jogador por convite',()=>{
  for(const id of ['tab-login','tab-signup','login-view','signup-view',
    'signup-invite-form','signup-invite-link','signup-master-form',
    'signup-master-username','signup-master-password','signup-master-confirm',
    'signup-as-master','signup-as-player','role-section','role-master',
    'role-player','role-other-account','guest-player-menu','player-join-form'])
    assert(html.includes('id="'+id+'"'),id);
  assert(html.includes('Qualquer pessoa pode criar uma conta de Mestre'));
  assert(html.includes('Para jogar, cole o convite'));
  assert(!html.includes('id="player-setup-form"'));
  assert(!html.includes('id="player-password"'));
  assert(!html.includes('role="master"') && !html.includes('value="master"'));
  assert(!html.includes('id="player-skip-account"'));
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('cadastro aberto de mestre cria conta própria e permite escolher Escudo',async()=>{
  const h=harness('master');
  h.el('tab-signup').events.click();
  // The static HTML starts with Mestre selected; the minimal DOM mock
  // needs to apply that default, because it does not parse hidden attributes.
  h.el('signup-as-master').events.click();
  assert.equal(h.el('signup-master-view').hidden,false);
  assert.equal(h.el('signup-player-view').hidden,true);
  h.el('signup-master-username').value='outromestre';
  h.el('signup-master-password').value='Senha-de-mestre-123';
  h.el('signup-master-confirm').value='Senha-de-mestre-123';
  await submit(h,'signup-master-form');
  assert(h.calls.some(c=>c[0]==='registerMasterAccount'&&c[1]==='outromestre'));
  assert.equal(h.el('role-section').hidden,false);
  assert.equal(h.el('role-master').disabled,false);
  assert.equal(h.location.navigations.length,0);
  await h.el('role-master').events.click();
  assert.equal(new URL(h.location.navigations[0]).pathname,'/mestre-temporada.html');
});
test('ao escolher cadastro de jogador continua obrigando convite',()=>{
  const h=harness('player');
  h.el('tab-signup').events.click();
  h.el('signup-as-player').events.click();
  assert.equal(h.el('signup-master-view').hidden,true);
  assert.equal(h.el('signup-player-view').hidden,false);
  h.el('signup-as-master').events.click();
  assert.equal(h.el('signup-master-view').hidden,false);
});
test('após login, mestre escolhe seu escudo e não recebe ficha de jogador sem convite',async()=>{
  const h=harness('master');
  h.el('login-username').value='mestre';
  h.el('login-password').value='senha-do-mestre-123';
  await submit(h,'login-form');
  assert.equal(h.location.navigations.length,0,'login deve mostrar escolha antes de navegar');
  assert.equal(h.el('role-section').hidden,false);
  assert.equal(h.el('login-section').hidden,true);
  assert.equal(h.el('role-master').disabled,false);
  assert.equal(h.el('role-player').disabled,true);
  await h.el('role-player').events.click();
  assert.equal(h.location.navigations.length,0,'mestre não deve entrar como personagem inexistente');
  await h.el('role-master').events.click();
  assert.equal(new URL(h.location.navigations[0]).pathname,'/mestre-temporada.html');
  assert(h.calls.some(c=>c[0]==='signInAccount'&&c[2]==='master'));
});
test('jogador não consegue elevar privilégios para mestre escolhendo o botão',async()=>{
  const h=harness('player');
  h.el('login-username').value='clara';
  h.el('login-password').value='senha-da-clara-123';
  await submit(h,'login-form');
  assert.equal(h.el('role-master').disabled,true);
  assert.equal(h.el('role-player').disabled,false);
  await h.el('role-master').events.click();
  assert.equal(h.location.navigations.length,0);
  await h.el('role-player').events.click();
  const target=new URL(h.location.navigations[0]);
  assert.equal(target.pathname,'/ficha-temporada.html');
  assert.equal(target.searchParams.get('personagem'),'JOGADOR01');
  assert(h.calls.some(c=>c[0]==='signInAccount'&&c[2]==='player'));
});
test('criar conta exige convite de mesma origem e nunca aceita link de terceiros',async()=>{
  const h=harness('player');
  h.el('tab-signup').events.click();
  assert.equal(h.el('signup-view').hidden,false);
  assert.equal(h.el('login-view').hidden,true);
  h.el('signup-invite-link').value='https://outra-pagina.example/index.html?convite=1&mesa=MTEST123#codigo=JOGADOR01&chave=CHAVE';
  await submit(h,'signup-invite-form');
  await settle();
  assert(!h.calls.some(c=>c[0]==='signInPlayer'));
  assert.match(h.el('signup-status').textContent,/inválido|inválida/i);
  h.el('signup-invite-link').value='https://outroladorpg.example/index.html?convite=1&mesa=MTEST123#codigo=JOGADOR01&chave=CHAVESEGURA';
  await submit(h,'signup-invite-form');
  await settle();
  assert(h.calls.some(c=>c[0]==='signInPlayer'&&c[3]==='JOGADOR01'&&c[4]==='CHAVESEGURA'));
  assert.equal(new URL(h.location.navigations.at(-1)).pathname,'/ficha-temporada.html');
  assert.equal(new URL(h.location.navigations.at(-1)).searchParams.get('personagem'),'JOGADOR01');
  assert(!h.calls.some(c=>c[0]==='lookup'||c[0]==='registerPlayerAccount'));
  assert.equal(h.el('signup-invite-link').value,'','o link com chave não deve ficar no campo');
});
test('convite direto abre ficha sem cadastro, senha ou conta',async()=>{
  const h=harness('player',false,{},'?convite=1&mesa=MTEST123','#codigo=JOGADOR01&chave=CHAVESEGURA');
  await settle();
  assert.equal(new URL(h.location.navigations[0]).pathname,'/ficha-temporada.html');
  assert.equal(new URL(h.location.navigations[0]).searchParams.get('personagem'),'JOGADOR01');
  assert(!h.calls.some(c=>c[0]==='lookup'||c[0]==='registerPlayerAccount'||c[0]==='joinPlayerAccount'));
  const saved=JSON.parse(h.storage.get('ol_player_device_tables_v1'));
  assert.equal(saved[0].tableCode,'MTEST123');
  assert(!JSON.stringify([...h.storage]).includes('CHAVESEGURA'));
});
test('trocar conta encerra sessão antes de aceitar outro usuário',async()=>{
  const h=harness('master');
  h.el('login-username').value='mestre';h.el('login-password').value='senha-do-mestre-123';
  await submit(h,'login-form');
  await h.el('role-other-account').events.click();
  assert(h.calls.some(c=>c[0]==='signOut'&&c[1]==='T2_MTEST123'));
  assert.equal(h.el('role-section').hidden,true);
  assert.equal(h.el('login-section').hidden,false);
  assert.equal(h.el('login-password').value,'');
});

test('mestre lista mesas e abre outro escudo sem repetir senha',async()=>{
  const h=harness('master');
  h.el('login-username').value='mestre';h.el('login-password').value='Senha-de-mestre-123';
  await submit(h,'login-form');
  assert.equal(h.el('master-tables-panel').hidden,false);
  assert.deepEqual(h.el('master-table-select').children.map(x=>x.value),['MTEST123','MOUTRA']);
  h.el('master-table-select').value='MOUTRA';
  await h.el('role-master').events.click();
  assert(h.calls.some(c=>c[0]==='signInAccount'&&c[1]==='T2_MOUTRA'));
  assert.equal(new URL(h.location.navigations.at(-1)).searchParams.get('mesa'),'MOUTRA');
  assert(!html.includes('id="master-table-password"'));
  assert(h.calls.filter(c=>c[0]==='signInAccount').every(c=>c[4]===undefined&&c[5]===undefined));
});
test('mestre cria mesa no portal e jogador não tem acesso à criação',async()=>{
  const h=harness('master');
  h.el('login-username').value='mestre';h.el('login-password').value='Senha-de-mestre-123';
  await submit(h,'login-form');
  h.el('master-new-table-name').value='Grupo C';
  await submit(h,'master-create-table-form');
  assert(h.calls.some(c=>c[0]==='createMasterTable'&&c[1]===null&&c[2]===null&&c[3]==='Grupo C'));
  assert.equal(new URL(h.location.navigations.at(-1)).searchParams.get('mesa'),'MNOVA');
  const p=harness('player');p.el('login-username').value='clara';p.el('login-password').value='Senha-de-jogador-123';
  await submit(p,'login-form');assert.equal(p.el('master-tables-panel').hidden,true);
  await submit(p,'master-create-table-form');
  assert(!p.calls.some(c=>c[0]==='createMasterTable'));
});

test('jogador sem conta aceita várias mesas e reabre fichas diferentes sem senha',async()=>{
  const h=harness('player');await settle();
  h.el('guest-player-menu').events.click();
  assert.equal(h.el('player-tables-panel').hidden,false);
  assert.equal(h.el('role-master').disabled,true);
  for(const [table,code] of [['MTEST123','JOGADOR01'],['MOUTRA','JOGADOR02']]){
    h.el('player-join-link').value='https://outroladorpg.example/?convite=1&mesa='+table+'#codigo='+code+'&chave=CHAVE';
    await submit(h,'player-join-form');await settle();
    assert.equal(new URL(h.location.navigations.at(-1)).searchParams.get('personagem'),code);
  }
  const stored=JSON.parse(h.storage.get('ol_player_device_tables_v1'));
  assert.equal(stored.length,2);
  assert(!JSON.stringify(stored).includes('CHAVE'));
  const next=harness('player',false,Object.fromEntries(h.storage),'?jogador=1');
  for(const [room,session] of h.rooms)next.rooms.set(room,session);
  await settle();
  next.el('player-table-select').value='MTEST123';
  await next.el('role-player').events.click();
  assert.equal(new URL(next.location.navigations.at(-1)).searchParams.get('personagem'),'JOGADOR01');
  next.el('player-table-select').value='MOUTRA';
  await next.el('role-player').events.click();
  assert.equal(new URL(next.location.navigations.at(-1)).searchParams.get('personagem'),'JOGADOR02');
  assert(!next.calls.some(c=>['lookup','signInAccount','registerPlayerAccount'].includes(c[0])));
  next.rooms.delete('T2_MOUTRA');
  const before=next.location.navigations.length;
  await next.el('role-player').events.click();
  assert.equal(next.location.navigations.length,before);
  assert.match(next.el('role-status').textContent,/expirou/);
});
test('convite inválido e lista local manipulada não concedem acesso',async()=>{
  const h=harness('player',false,{'ol_player_device_tables_v1':JSON.stringify([{tableCode:'MOUTRA',code:'FALSO'}])},'?jogador=1');
  await settle();
  await h.el('role-player').events.click();
  assert.equal(h.location.navigations.length,0);
  h.el('player-join-link').value='https://outroladorpg.example/?convite=1&mesa=MOUTRA#codigo=FALSO&chave=INVALID';
  await submit(h,'player-join-form');await settle();
  assert.equal(h.location.navigations.length,0);
});
test('remover acesso local não apaga ficha nem encerra outras mesas',async()=>{
  const h=harness('player',false,{'ol_player_device_tables_v1':JSON.stringify([{tableCode:'MTEST123',code:'P1'},{tableCode:'MOUTRA',code:'P2'}])},'?jogador=1');
  h.rooms.set('T2_MTEST123',{ok:true,role:'player',code:'P1'});h.rooms.set('T2_MOUTRA',{ok:true,role:'player',code:'P2'});
  await settle();
  h.el('player-table-select').value='MTEST123';
  await h.el('player-forget-table').events.click();
  assert.deepEqual(JSON.parse(h.storage.get('ol_player_device_tables_v1')).map(t=>t.tableCode),['MOUTRA']);
  assert(h.rooms.has('T2_MOUTRA'));
  assert(!h.rooms.has('T2_MTEST123'));
});
