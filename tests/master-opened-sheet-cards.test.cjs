const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const workerSource = read('src/worker.js')
  .replace(/^import .*;\r?\n/gm,'')
  .replace('export class TableRoom','class TableRoom')
  .replace('export default {','globalThis.worker = {')+
  '\nglobalThis.Room=TableRoom;';
function roomHarness(existingRecords=null) {
  const scope={ DurableObject:class{}, TextEncoder, TextDecoder, console, Response, URL, crypto:webcrypto };
  vm.runInNewContext(workerSource,scope);
  const sockets=[];
  const records=existingRecords || new Map([['table','T2_AURORA']]);
  let ready;
  const ctx={
    getWebSockets:()=>sockets,
    blockConcurrencyWhile:fn=>{ready=fn();},
    storage:{
      get:async key=>records.get(key),
      list:async({prefix})=>new Map([...records].filter(([k])=>k.startsWith(prefix))),
      put:async(key,v)=>records.set(key,v),
      delete:async key=>records.delete(key)
    }
  };
  const room=new scope.Room(ctx,{});
  function socket(name,isMaster=false){
    const ws={
      name,readyState:1,messages:[],
      metadata:{authenticated:true,isMaster,playerCode:''},
      deserializeAttachment(){return this.metadata;},
      serializeAttachment(value){this.metadata=value;},
      send(payload){this.messages.push(JSON.parse(payload));},
      close(){this.readyState=3;}
    };
    sockets.push(ws);
    return ws;
  }
  return {room,ready,records,socket};
}
const sheet=(name,number=10)=>({
  codigo:'CLARA',mesa:'T2_AURORA',sheetType:'temporada',nome:name,
  vida_atual:number,vida_max:20,sani_atual:8,sani_max:16,defesa:12,
  fullData:{sheetType:'temporada',temporada:{state:{
    name,origin:'Analista',occupation:'Estudante',paranormalInfluence:3,
    attrs:{potencia:1,consciencia:2},resources:{life:{current:number,max:20},sanity:{current:8,max:16}}
  }}}
});

test('abrir ficha pelo mestre a mostra no escudo, sem fingir jogador online',async()=>{
  const h=roomHarness();await h.ready;
  const master=h.socket('master',true);
  await h.room.handleEvent(master,'master_open_sheet',sheet('Clara'));
  assert.equal(h.room.players.get('CLARA').online,false);
  assert.equal(h.room.players.get('CLARA').openedByMaster,true);
  assert.equal(h.room.players.get('CLARA').nome,'Clara');
  assert(master.messages.some(m=>m.e==='update_mestre'&&m.d.codigo==='CLARA'
    &&m.d.online===false&&m.d.openedByMaster===true));
  await h.room.handleEvent(master,'master_ready',{mesa:'T2_AURORA'});
  const snapshot=master.messages.findLast(m=>m.e==='players_snapshot');
  assert.equal(snapshot.d.length,1);
  assert.equal(snapshot.d[0].codigo,'CLARA');
  assert.equal(snapshot.d[0].online,false);
  assert.equal(h.records.get('player:CLARA').openedByMaster,true);
  assert.equal(h.records.get('player:CLARA').exilioState.resources.life.current,10);
  // The full sheet is NOT copied to the lightweight saved player-card snapshot.
  assert.equal(h.records.get('player:CLARA').fullData,undefined);
  const reload=roomHarness(h.records);await reload.ready;
  const nextMaster=reload.socket('new-master',true);
  await reload.room.handleEvent(nextMaster,'master_ready',{mesa:'T2_AURORA'});
  assert.equal(nextMaster.messages.findLast(m=>m.e==='players_snapshot').d[0].codigo,'CLARA');
});

test('abrir ficha enquanto jogador está online não substitui sua versão nem a marca offline',async()=>{
  const h=roomHarness();await h.ready;
  const master=h.socket('mestre',true),player=h.socket('jogadora');
  await h.room.handleEvent(player,'status_change',sheet('Clara ao vivo',15));
  player.messages.length=0;
  await h.room.handleEvent(master,'master_open_sheet',sheet('Clara antiga',5));
  const value=h.room.players.get('CLARA');
  assert.equal(value.nome,'Clara ao vivo');
  assert.equal(value.vida_atual,15);
  assert.equal(value.online,true);
  assert.equal(value.openedByMaster,true);
  assert(!player.messages.some(m=>m.e==='player_data_updated'));
  // Real edit is still synchronized, and it stays online only while a real player is connected.
  await h.room.handleEvent(master,'master_update_player',sheet('Clara editada',13));
  assert.equal(h.room.players.get('CLARA').vida_atual,13);
  assert.equal(h.room.players.get('CLARA').online,true);
  assert(player.messages.some(m=>m.e==='player_data_updated'));
  await h.room.cleanupSocket(player);
  assert.equal(h.room.players.get('CLARA').online,false);
  assert.equal(h.room.players.get('CLARA').openedByMaster,true);
});

test('fechar somente o cartão offline não expulsa e não apaga a ficha',async()=>{
  const h=roomHarness();await h.ready;
  const master=h.socket('mestre',true);
  await h.room.handleEvent(master,'master_open_sheet',sheet('Clara'));
  await h.room.handleEvent(master,'master_close_sheet',{codigo:'CLARA'});
  assert.equal(h.room.players.get('CLARA').openedByMaster,false);
  assert(h.records.has('player:CLARA'));
  assert(master.messages.some(m=>m.e==='player_disconnected'
    &&m.d.reason==='closed_by_master'));
  master.messages.length=0;
  await h.room.handleEvent(master,'master_ready',{mesa:'T2_AURORA'});
  assert.equal(master.messages.find(m=>m.e==='players_snapshot').d.length,0);
});

test('somente mestre pode anunciar ou fechar fichas no escudo',async()=>{
  const h=roomHarness();await h.ready;
  const player=h.socket('jogadora');
  await h.room.handleEvent(player,'master_open_sheet',sheet('Tentativa'));
  assert.equal(h.room.players.size,0);
  const owner=h.socket('mestre',true);
  await h.room.handleEvent(owner,'master_open_sheet',sheet('Clara'));
  await h.room.handleEvent(player,'master_close_sheet',{codigo:'CLARA'});
  assert.equal(h.room.players.get('CLARA').openedByMaster,true);
  await h.room.handleEvent(owner,'master_open_sheet',{codigo:'OUTRO',sheetType:'classic'});
  assert.equal(h.room.players.size,1);
});

test('ao abrir pelo mestre, ficha envia registro e o escudo mostra status distinto',()=>{
  const sync=read('public/temporada/sync.js');
  const master=read('public/mestre-temporada.html');
  assert(sync.includes("socket.emit('master_open_sheet',packet())"));
  assert(sync.includes('announceMasterOpenedSheet();'));
  assert(master.includes("◇ ABERTA PELO MESTRE"));
  assert(master.includes("● JOGADOR ONLINE"));
  assert(master.includes("✕ FECHAR NO ESCUDO"));
  assert(master.includes("socket.emit('master_close_sheet'"));
  assert(master.includes("reason !== 'closed_by_master'"));
  assert(master.includes("card.classList.toggle('master-opened-offline', masterOpenedOffline)"));
  assert(master.includes('data.fullData?.temporada?.state || data.exilioState || {}'));
  for(const [i,script] of [...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(m=>m[1]).filter(Boolean).entries())assert.doesNotThrow(()=>new vm.Script(script,{filename:'mestre-'+i}));
});
