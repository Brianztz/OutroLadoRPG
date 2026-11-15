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
function harness(role='master') {
  const elements = new Map();
  const storage = new Map();
  const calls = [];
  const location = {
    href:'https://outroladorpg.example/index.html',
    origin:'https://outroladorpg.example',
    search:'',hash:'',pathname:'/index.html',
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
      focus(){},reset(){this.value='';}
    });
    return elements.get(id);
  }
  const accounts={
    master:{role:'master',tableCode:'MTEST123',code:''},
    player:{role:'player',tableCode:'MTEST123',code:'JOGADOR01'}
  };
  const client={
    async lookupAccount(username,password) {
      calls.push(['lookup',username,password]);
      return accounts[role];
    },
    async signInAccount(table,selectedRole,code,username,password) {
      calls.push(['signInAccount',table,selectedRole,code,username,password]);
    },
    async signInPlayer(table,edition,code,key) {
      calls.push(['signInPlayer',table,edition,code,key]);
    },
    async registerPlayerAccount(table,username,password) {
      calls.push(['registerPlayerAccount',table,username,password]);
    },
    async signOut(table){calls.push(['signOut',table]);},
    async changeMasterCredentials(){calls.push(['changeMasterCredentials']);}
  };
  const ctx={
    location,URL,URLSearchParams,console,history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    sessionStorage:{setItem:(key,value)=>storage.set(key,value)},
    document:{getElementById:el},
    OLFirebase:{
      normalizeTableCode:v=>String(v||'').toUpperCase(),
      seasonScopedTable:v=>'T2_'+v
    },
    OLNative:client
  };
  vm.runInNewContext(script,ctx,{filename:'portal.js'});
  return {elements,el,location,calls,ctx,client};
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

test('portal apresenta os dois botões, cadastro restrito e tela de escolha de papel',()=>{
  for(const id of ['tab-login','tab-signup','login-view','signup-view',
    'signup-invite-form','signup-invite-link','role-section','role-master',
    'role-player','role-other-account','player-setup-form'])
    assert(html.includes('id="'+id+'"'),id);
  assert(html.includes('O cadastro é restrito aos jogadores convidados'));
  assert(html.includes('Não é possível criar uma conta de mestre por aqui'));
  assert(!html.includes('role="master"') && !html.includes('value="master"'));
  assert(!html.includes('id="player-skip-account"'));
  assert.doesNotThrow(()=>new vm.Script(script));
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
  h.el('role-player').events.click();
  assert.equal(h.location.navigations.length,0,'mestre não deve entrar como personagem inexistente');
  h.el('role-master').events.click();
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
  h.el('role-master').events.click();
  assert.equal(h.location.navigations.length,0);
  h.el('role-player').events.click();
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
  assert.equal(h.el('invite-section').hidden,false);
  assert.equal(h.el('login-section').hidden,true);
  assert.equal(h.el('player-setup-form').hidden,false);
  assert.equal(h.el('signup-invite-link').value,'','o link com chave não deve ficar no campo');
});
test('após cadastrar jogador convidado, mostra escolha restrita antes da ficha',async()=>{
  const h=harness('player');
  h.el('signup-invite-link').value='https://outroladorpg.example/?convite=1&mesa=MTEST123#codigo=JOGADOR01&chave=CHAVESEGURA';
  await submit(h,'signup-invite-form');
  await settle();
  h.el('player-username').value='clara';
  h.el('player-password').value='senha-da-clara-123';
  h.el('player-confirm').value='senha-da-clara-123';
  await submit(h,'player-setup-form');
  assert(h.calls.some(c=>c[0]==='registerPlayerAccount'&&c[2]==='clara'));
  assert.equal(h.location.navigations.length,0,'cadastro não pula escolha de papel');
  assert.equal(h.el('invite-section').hidden,true);
  assert.equal(h.el('role-section').hidden,false);
  assert.equal(h.el('role-master').disabled,true);
  h.el('role-player').events.click();
  assert.equal(new URL(h.location.navigations[0]).pathname,'/ficha-temporada.html');
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
