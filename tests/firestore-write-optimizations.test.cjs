const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');

test('nenhuma tela carrega Firebase e migrador antigo foi removido',()=>{
 const client=read('public/firebase-client.js');
 const worker=read('src/worker.js');
 const portal=read('public/index.html');
 const realtime=read('public/realtime-client.js');
 assert(!client.includes('gstatic.com/firebasejs/'));
 assert(!worker.includes('verifyFirebaseIdToken'));
 assert(!realtime.includes('firebase.'));
 assert(!portal.includes('ENTRAR COM GOOGLE'));
 assert(!portal.includes('migrar.html'));
 assert(!fs.existsSync(path.join(root,'public/legacy-firebase-client.js')));
 assert(!fs.existsSync(path.join(root,'public/migrar.html')));
});
test('Durable Object sheets and clues are partitioned by edition and character',()=>{
 const store=read('src/storage-api.js');
 assert(store.includes("'sheet:' + edition + ':' + code"));
 assert(store.includes("'content:master-clues'"));
 assert(store.includes("storage.put(root + ':manifest', manifest)"));
 assert(store.includes('const version = crypto.randomUUID()'));
 assert(store.includes('await sha256(source)'));
});
test('Vestigios sheet retains change batching and offline protection',()=>{
 const sync=read('public/temporada/sync.js');
 assert(sync.includes('realtimeTimer=setTimeout(broadcast,180)'));
 assert(sync.includes('timer=setTimeout(flush,view?220:3500)'));
 assert(sync.includes('localStorage.setItem(dirtyKey'));
 assert(sync.includes('clearTimeout(realtimeTimer)'));
});
test('master clue UI preserves fallback, autosaving and safe polling updates',()=>{
 const seasonMaster=read('public/mestre-temporada.html');
 const compat=read('public/firebase-client.js');
 for(const master of [seasonMaster]){
   assert(master.includes('scheduleMasterCluesCloudSave('));
   assert(master.includes('OLFirebase.loadMasterClues('));
   assert(master.includes('OLFirebase.saveMasterClues('));
 }
 assert(compat.includes('async function watchMasterClues('));
 assert(compat.includes('setInterval(check, 7000)'));
});
