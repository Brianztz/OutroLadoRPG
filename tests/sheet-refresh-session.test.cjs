const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
globalThis.crypto = globalThis.crypto || webcrypto;

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/session-api.js'), 'utf8');
const compatibility = fs.readFileSync(path.join(root, 'public/firebase-client.js'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const moduleURL = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const loadSession = async () => (await import(moduleURL)).handleSessionRequest;
const secret = 'M'.repeat(48);

function storageContext() {
  const data = new Map();
  return { storage: {
    get: async key => data.get(key),
    put: async (key, value) => { data.set(key, value); },
    delete: async key => { data.delete(key); }
  }, data };
}
function request(table, method='GET', cookie='', role='master', key=secret) {
  const url = 'https://example.test/api/session?mesa=' + table;
  return new Request(url, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
    },
    ...(method === 'POST' ? { body: JSON.stringify({ role, key }) } : {})
  });
}
function cookieHeader(response) {
  return response.headers.get('set-cookie').split(';')[0];
}
test('cada mesa possui cookie de sessao proprio e atualizar uma nao desloga outra', async () => {
  const handle = await loadSession(), a = storageContext(), b = storageContext();
  const ra = await handle(request('T2_AURORA', 'POST'), a, {MASTER_DATA_TOKEN: secret});
  const rb = await handle(request('T2_VESTIGIOS', 'POST'), b, {MASTER_DATA_TOKEN: secret});
  assert.equal(ra.status, 200); assert.equal(rb.status, 200);
  const ca = cookieHeader(ra), cb = cookieHeader(rb);
  assert.match(ca, /^ol_room_session_T2_AURORA=[a-f0-9]{64}$/);
  assert.match(cb, /^ol_room_session_T2_VESTIGIOS=[a-f0-9]{64}$/);
  const both = ca + '; ' + cb;
  assert.equal((await handle(request('T2_AURORA','GET',both),a,{})).status,200);
  assert.equal((await handle(request('T2_VESTIGIOS','GET',both),b,{})).status,200);
  assert.equal((await handle(request('T2_AURORA','GET',cb),a,{})).status,401);
  assert.equal((await handle(request('T2_VESTIGIOS','GET',ca),b,{})).status,401);
});
test('sessao criada antes do conserto continua valida e sair limpa ambos os cookies', async () => {
  const handle = await loadSession(), ctx = storageContext();
  const login = await handle(request('T2_AURORA','POST'),ctx,{MASTER_DATA_TOKEN:secret});
  const oldCookie = cookieHeader(login).replace('ol_room_session_T2_AURORA=','ol_room_session=');
  assert.equal((await handle(request('T2_AURORA','GET',oldCookie),ctx,{})).status,200);
  const logout=await handle(request('T2_AURORA','DELETE',oldCookie),ctx,{});
  assert.equal(logout.status,200);
  const cookies=logout.headers.get('set-cookie');
  assert(cookies.includes('ol_room_session_T2_AURORA='));
  assert(cookies.includes('ol_room_session='));
  assert.equal((await handle(request('T2_AURORA','GET',oldCookie),ctx,{})).status,401);
});
function fakeStorage(initial={}) {
  const state = new Map(Object.entries(initial));
  return {getItem:key=>state.has(key)?state.get(key):null,setItem:(key,val)=>state.set(key,String(val))};
}
function page({role='player',playerKey='a'.repeat(96),personalKey='OLM-'+'A'.repeat(64),networkDown=false}={}) {
  const table='AURORA', player='P1';
  const playerPage=role==='player';
  const location={
    href:'https://example.test/'+(playerPage?'ficha-temporada.html':'mestre-temporada.html')
      +'?mesa='+table+'&temporada=2'+(playerPage?'&personagem='+player:''),
    pathname:playerPage?'/ficha-temporada.html':'/mestre-temporada.html',
    search:'?mesa='+table+'&temporada=2'+(playerPage?'&personagem='+player:''),
    redirects:[],
    replace(url){this.redirects.push(url);}
  };
  const physical='T2_'+table;
  const storage = fakeStorage({'ol_personal_master_key_v1':personalKey,'player_sync_code':player});
  const session = fakeStorage({['ol_player_resume_v1:'+physical+':'+player]:playerKey});
  let signedIn=false;
  const calls=[];
  const fetch=async (url,opts={})=>{
    calls.push({url,method:opts.method||'GET',body:opts.body});
    if(networkDown)throw Error('network unavailable');
    if(url.startsWith('/api/session?') && opts.method==='POST') {
      const body=JSON.parse(opts.body);
      if(body.role!==role || body.key !== (role==='master'?personalKey:playerKey))
        return Response.json({error:'invalid_credentials'}, {status:401});
      signedIn=true;
      return Response.json({ok:true,role,code:playerPage?player:''});
    }
    return signedIn
      ? Response.json({ok:true,role,code:playerPage?player:''})
      : Response.json({error:'expired'},{status:401});
  };
  const element={classList:{remove(){}}};
  const doc={documentElement:element,body:{append(){}},getElementById(){return null},createElement(){return {style:{},setAttribute(){},querySelector(){return {addEventListener(){}}},innerHTML:''}}};
  const win={location,localStorage:storage,sessionStorage:session,fetch,
    OLSeasonSpace:{isSeasonPage(){return true},tableId:t=>'T2_'+t},
    addEventListener(){},dispatchEvent(){}};
  vm.runInNewContext(compatibility,{window:win,localStorage:storage,sessionStorage:session,document:doc,URL,URLSearchParams,Response,Date,TextEncoder,console,CustomEvent:class{}});
  return {win,location,calls};
}
test('refresh da ficha recupera a sessao de jogador pela credencial guardada na aba', async () => {
  const p=page();
  assert.equal(await p.win.OLFirebase.guardPage('player'),true);
  assert.equal(p.location.redirects.length,0);
  assert.equal(p.calls.filter(x=>x.method==='POST').length,1);
  assert(p.calls.some(x=>JSON.parse(x.body||'{}').key==='a'.repeat(96)));
  assert.equal(await p.win.OLFirebase.getCurrentUser().then(x=>x.code),'P1');
});
test('refresh do escudo recupera a sessao pela chave pessoal ja salva', async () => {
  const p=page({role:'master'});
  assert.equal(await p.win.OLFirebase.guardPage('master'),true);
  assert.equal(p.location.redirects.length,0);
  assert.equal(p.calls.filter(x=>x.method==='POST').length,1);
});
test('falha temporaria da internet nao manda o jogador de volta ao codigo',async()=>{
  const p=page({networkDown:true});
  assert.equal(await p.win.OLFirebase.guardPage('player'),false);
  assert.equal(p.location.redirects.length,0);
});
test('codigo do personagem fica na URL da ficha sem incluir a chave privada',()=>{
  assert(portal.includes("next.searchParams.set('personagem', playerCode)"));
  assert(portal.includes("sessionStorage.setItem('ol_player_resume_v1:' + physical + ':' + normalizedCode, key)"));
  assert(portal.includes("const edition = 'temporada'"));
  const html=fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8');
  assert(html.includes('firebase-client.js?v=session-resume-20261114'));
});
