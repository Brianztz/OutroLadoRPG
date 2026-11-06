const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const firebase=read('public/firebase-client.js');
const sync=read('public/temporada/sync.js');
const seasonMaster=read('public/mestre-temporada.html');
const originalMaster=read('public/mestre.html');

function chunkDiff(chunks,previousJson){
 const begin=firebase.indexOf('    const cloudPayloadCache = new Map();');
 const end=firebase.indexOf('    function characterCollection(',begin);
 assert(begin>0&&end>begin,'chunk optimizer helper exists');
 const context=vm.createContext({CHARACTER_CHUNK_SIZE:8});
 vm.runInContext(firebase.slice(begin,end)+';this.choose=payloadChunksToWrite;',context);
 return context.choose(chunks,previousJson);
}

test('only changed chunks of a long character sheet are written',()=>{
 const previous='AAAAAAAABBBBBBBBCCCCCCCC';
 let updated=['AAAAAAAB','BBBBBBBB','CCCCCCCC'];
 assert.deepEqual(Array.from(chunkDiff(updated,previous),entry=>entry.index),[0]);
 updated=['AAAAAAAB','BBBBBBBB','CCCCCCCD'];
 assert.deepEqual(Array.from(chunkDiff(updated,previous),entry=>entry.index),[0,2]);
 assert.equal(chunkDiff(['AAAAAAAA','BBBBBBBB','CCCCCCCC'],previous).length,0);
});

test('first save and missing cache write every chunk for safety',()=>{
 const result=chunkDiff(['AAAAAAAA','BBBBBBBB'],null);
 assert.deepEqual(Array.from(result,entry=>entry.index),[0,1]);
 assert(firebase.includes("cached?.hash === currentData.sheetHash"));
 assert(firebase.includes("cached?.hash === currentData.payloadHash"));
 assert(firebase.includes('await readCharacterSnapshot(currentSnapshot'));
 assert(firebase.includes('await readMasterCluesSnapshot(currentSnapshot'));
});

test('both character and clue writers save only changed chunks',()=>{
 const character=firebase.slice(firebase.indexOf('async function saveCharacter('),firebase.indexOf('async function watchCharacter('));
 const clues=firebase.slice(firebase.indexOf('async function saveMasterClues('),firebase.indexOf('async function watchMasterClues('));
 for(const writer of [character,clues]){
   assert(writer.includes('payloadChunksToWrite(chunks, previousJson).forEach'));
   assert(writer.includes('cloudPayloadCache.set(cacheKey'));
   assert(writer.includes('await batch.commit()'));
   assert(writer.includes('const previousChunkCount'));
 }
 assert(firebase.includes('if (writes.length) await withTimeout('),'profile writes are skipped when content is unchanged');
});

test('season player gets realtime changes while Firestore writes are debounced',()=>{
 assert(sync.includes('realtimeTimer=setTimeout(broadcast,180)'));
 assert(sync.includes('timer=setTimeout(flush,view?220:3500)'));
 assert(sync.includes('localStorage.setItem(dirtyKey'));
 assert(sync.includes('COTA FIREBASE ESGOTADA'));
 assert(sync.includes('clearTimeout(realtimeTimer)'));
});

test('season master slows cloud clue retries when free daily quota is exhausted',()=>{
 assert(seasonMaster.includes('masterCluesCloudQuotaBlockedUntil = Date.now() + 30 * 60 * 1000'));
 assert(seasonMaster.includes('scheduleMasterCluesCloudSave(3000)'));
 assert(seasonMaster.includes('COTA FIREBASE ESGOTADA — PISTAS SALVAS LOCALMENTE'));
 assert(!originalMaster.includes('masterCluesCloudQuotaBlockedUntil'),'classic UI unchanged');
 assert(firebase.includes('A cota diária gratuita de gravações do Firebase acabou'));
});
