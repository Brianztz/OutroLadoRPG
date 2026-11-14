const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const load = file => fs.readFileSync(path.join(root, file), 'utf8');
const spaceSource = load('public/season-space.js');
const socketSource = load('public/realtime-client.js');
const adapterSource = load('public/season-socket-adapter.js');

function page(pathname) {
  const window = {location: new URL('https://example.test' + pathname)};
  const context = vm.createContext({window,URL,URLSearchParams,console,setTimeout,clearTimeout,Promise});
  vm.runInContext(spaceSource,context);
  return {window,context};
}

test('same public table code has different physical IDs and does not collide at 40 characters',()=>{
  const classic = page('/mestre.html?mesa=AURORA');
  const season = page('/mestre-temporada.html?mesa=AURORA');
  assert.equal(classic.window.OLSeasonSpace.isSeasonPage(),false);
  assert.equal(season.window.OLSeasonSpace.isSeasonPage(),true);
  assert.equal(classic.window.OLSeasonSpace.tableId('AURORA'),'AURORA');
  assert.equal(season.window.OLSeasonSpace.tableId('AURORA'),'T2_AURORA');
  assert.equal(page('/ficha-temporada.html?mesa=AURORA').window.OLSeasonSpace.tableId('AURORA'),'T2_AURORA');
  assert.equal(page('/overlay.html?mesa=AURORA&temporada=2').window.OLSeasonSpace.tableId('AURORA'),'T2_AURORA');
  assert.equal(page('/lumina/index.html?mesa=AURORA&temporada=2').window.OLSeasonSpace.tableId('AURORA'),'T2_AURORA');
  const long1='A'.repeat(39)+'X';
  const long2='A'.repeat(39)+'Y';
  const key1=season.window.OLSeasonSpace.tableId(long1);
  const key2=season.window.OLSeasonSpace.tableId(long2);
  assert.notEqual(key1,key2);
  assert(key1.length<=40 && key2.length<=40);
});

test('Cloudflare websocket sends season packets only to season room and translates replies',async()=>{
  const {window,context}=page('/ficha-temporada.html?mesa=AURORA');
  class FakeWebSocket {
    static OPEN=1;
    static CONNECTING=0;
    constructor(url){this.url=new URL(url);this.readyState=0;this.handlers={};this.sent=[];FakeWebSocket.latest=this;}
    addEventListener(name,fn){this.handlers[name]=fn;}
    send(packet){this.sent.push(JSON.parse(packet));}
    open(){this.readyState=1;this.handlers.open();}
    deliver(event,data){this.handlers.message({data:JSON.stringify({e:event,d:data})});}
    close(){}
  }
  window.crypto={randomUUID:()=> '9be87fb6-0000-4000-8000-000000000001'};
  window.sessionStorage={getItem:()=>null};
  window.OLNative={getSession:async()=>({ok:true,role:'player',code:'P1'})};
  context.WebSocket=FakeWebSocket;
  vm.runInContext(socketSource,context);
  const client=window.io();
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(FakeWebSocket.latest.url.searchParams.get('mesa'),'T2_AURORA');
  FakeWebSocket.latest.open();
  client.emit('status_change',{codigo:'P1',mesa:'AURORA',sheetType:'temporada'});
  assert.equal(FakeWebSocket.latest.sent.at(-1).d.mesa,'T2_AURORA');
  let received;
  client.on('update_mestre',data=>{received=data;});
  FakeWebSocket.latest.deliver('update_mestre',{mesa:'T2_AURORA',codigo:'P1'});
  assert.equal(received.mesa,'AURORA');
  assert.equal(client._season,true);
});

test('native Socket.IO adapter scopes traffic on local server without changing classic',()=>{
  const season=page('/mestre-temporada.html?mesa=AURORA');
  const calls=[],handlers={};
  const original=()=>({
    emit(event,data){calls.push({event,data});return this;},
    on(event,handler){handlers[event]=handler;return this;},
  });
  season.window.io=original;
  vm.runInContext(adapterSource,season.context);
  const sock=season.window.io();
  sock.emit('master_ready',{mesa:'AURORA'});
  assert.equal(calls[0].data.mesa,'T2_AURORA');
  let received;
  sock.on('update_mestre',data=>{received=data;});
  handlers.update_mestre({mesa:'T2_AURORA',codigo:'P1',sheetType:'temporada'});
  assert.equal(received.mesa,'AURORA');
  const classic=page('/mestre.html?mesa=AURORA');
  classic.window.io=original;
  vm.runInContext(adapterSource,classic.context);
  assert.equal(classic.window.io,original);
});

test('portal and master preserve edition across login, invites and embedded player sheets',()=>{
  const portal=load('public/index.html'),master=load('public/mestre-temporada.html'),classic=load('public/mestre.html');
  assert(portal.includes("'mestre-temporada.html'"));
  assert(classic.includes("'./mestre-temporada.html'"));
  assert(!classic.includes('href="/temporada/master-theme.css?v=1"'));
  assert(master.includes('href="/temporada/master-theme.css?v=1"'));
  assert(portal.includes('OLNative.signInMaster(physical, key)'));
  assert(portal.includes('OLNative.signInPlayer(physical, edition, code, key)'));
  assert(portal.includes("seasonSelect.disabled = true"));
  assert(portal.includes("next.searchParams.set('temporada','2')"));
  assert(master.includes("if (isSeasonMaster) url.searchParams.set('temporada', '2')"));
  assert(master.includes("const page = isSeasonMaster ? 'ficha-temporada.html' : 'ficha.html'"));
  assert(master.includes("if (isSeasonMaster !== fromSeason) return;"));
  assert(master.includes("masterStorageKey('mestre_monsters_state')"));
});

test('Durable storage separates characters by season and room',()=>{
  const storage=load('src/storage-api.js');
  const compat=load('public/firebase-client.js');
  const worker=load('src/worker.js');
  assert(storage.includes("'sheet:' + edition + ':' + code"));
  assert(compat.includes('function seasonScopedTable(table, edition = null)'));
  assert(compat.includes("global.OLSeasonSpace.tableId(table, 'temporada')"));
  assert(worker.includes("sheetType: data && data.sheetType === 'temporada'"));
});

test('all season realtime entry points load the namespace first',()=>{
  for(const file of ['public/mestre-temporada.html','public/overlay.html','public/lumina/index.html','public/ficha-temporada.html']){
    const html=load(file);
    const space=html.indexOf('/season-space.js?v=3');
    const socket=html.indexOf('/socket.io/socket.io.js?v=season2-2');
    const adapter=html.indexOf('/season-socket-adapter.js?v=3');
    assert(space>=0&&socket>space&&adapter>socket, file+' missing season-aware transport');
  }
});

test('season master route is guarded, authenticated and season-aware even without URL edition marker',()=>{
 const firebase=load('public/firebase-client.js');
 const realtime=load('public/realtime-client.js');
 const season=page('/mestre-temporada.html?mesa=AURORA');
 assert.equal(season.window.OLSeasonSpace.isSeasonPage(),true);
 assert.equal(season.window.OLSeasonSpace.tableId('AURORA'),'T2_AURORA');
 assert(firebase.includes('async function guardPage(role)'));
 assert(realtime.includes('mestre|mestre-temporada'));
 const html=load('public/mestre-temporada.html');
 assert(html.includes('const isSeasonMaster = true;'));
 assert(html.includes('OLFirebase.guardPage(\'master\')'));
});
