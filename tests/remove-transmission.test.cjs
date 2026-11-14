const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
test('Worker preserves player, master and overlay events after transmission removal',async()=>{
 const source=fs.readFileSync(path.join(root,'src/worker.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class TableRoom','class TableRoom').replace('export default {','globalThis.worker = {')+'\nglobalThis.Room=TableRoom;';
 const sandbox={DurableObject:class{},TextEncoder,TextDecoder,console,Response,URL,crypto:require('node:crypto').webcrypto};vm.runInNewContext(source,sandbox);
 const socket=meta=>({readyState:1,meta,messages:[],deserializeAttachment(){return this.meta},serializeAttachment(m){this.meta=m},send(p){this.messages.push(JSON.parse(p))}});
 const player=socket({id:'p',authenticated:true,playerCode:'P1'}),master=socket({id:'m',isMaster:true}),overlay=socket({id:'o'});const data=new Map();let ready;
 const ctx={getWebSockets:()=>[player,master,overlay],blockConcurrencyWhile:f=>ready=f(),storage:{get:async k=>data.get(k),list:async()=>new Map(),put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)}};
 const room=new sandbox.Room(ctx,{});await ready;
 await room.webSocketMessage(player,JSON.stringify({e:'status_change',d:{codigo:'P1',vida_atual:12,vida_max:20}}));assert.equal(master.messages.at(-1).d.vida_atual,12);
 await room.handleEvent(overlay,'overlay_ready',{});assert.equal(overlay.messages.find(m=>m.e==='players_snapshot').d[0].codigo,'P1');
 await room.handleEvent(player,'rolagem_feita',{codigo:'P1',acao:'Luta',resultado:17});assert.equal(master.messages.at(-1).e,'novo_log');
 await room.handleEvent(player,'clue_inspection_start',{codigo:'P1',clue:{id:'c1',name:'Pista'}});assert.equal(overlay.messages.at(-1).e,'clue_inspection_started');
 const before=master.messages.length;await room.handleEvent(player,'screen_share_start',{});await room.handleEvent(player,'screen_share_join',{});assert.equal(master.messages.length,before);
 await room.cleanupSocket(player);assert.ok(master.messages.some(m=>m.e==='player_disconnected'));
});
test('Removed transmission page, music bindings and UI are absent',()=>{
 for(const p of ['public/compartilhar.html','public/spotify-link.js','src/youtube-oauth.js'])assert.equal(fs.existsSync(path.join(root,p)),false);
 for(const p of ['server.js','src/worker.js','public/realtime-client.js','realtime-client.js','public/mestre-temporada.html','public/firebase-client.js','wrangler.jsonc'])assert.doesNotMatch(fs.readFileSync(path.join(root,p),'utf8'),/screen_share|screenShare|compartilhar\.html|YOUTUBE_GRANTS|connectYouTubeMusic/);
 const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));assert.equal(config.durable_objects.bindings[0].class_name,'TableRoom');
});
