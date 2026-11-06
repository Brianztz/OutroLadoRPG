const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'..','public','firebase-client.js'),'utf8');
const start = source.indexOf('    async function seasonPortalRest(');
const end = source.indexOf('    async function preparePortal(',start);
assert(start>0 && end>start,'season REST helper should exist in firebase-client.js');
const helper = source.slice(start,end);
const makeResponse = (status,payload={})=>({status,ok:status>=200&&status<300,json:async()=>payload});

function harness(responses){
  const requests=[];
  const mocks=Array.from(responses);
  class MockAbortController{constructor(){this.signal={};}abort(){}}
  const global={
    fetch:async (url,options)=>{
      requests.push({url,options,body:options.body?JSON.parse(options.body):null});
      const next=mocks.shift();
      if(!next)throw new Error('Unexpected network request');
      return next;
    },
    setTimeout,clearTimeout
  };
  const scope=vm.createContext({
    global,AbortController:MockAbortController,encodeURIComponent,
    FIREBASE_CONFIG:{projectId:'outro-lado-rpg-bryan'},
    DATABASE_ID:'outro-lado-rpg',
    AUTH_TIMEOUT_MS:12000,
    withTimeout:(promise)=>promise,
    portalNetworkError:action=>'O Firebase demorou para '+action
  });
  vm.runInContext(helper+';this.create=createSeasonPortalDocument;',scope);
  return {requests,create:scope.create,user:{uid:'uid1',getIdToken:async()=> 'firebase-id-token'}};
}

test('new season room uses authenticated Firestore REST with server timestamps',async()=>{
  const {create,requests,user}=harness([makeResponse(200,{commitTime:'2026-11-06T03:30:00Z'})]);
  await create(user,'tables/T2_AURORA',{
    tableId:'T2_AURORA',ownerUid:'uid1',status:'active',displayName:'Mesa T2_AURORA'
  },['createdAt','updatedAt'],'ownerUid');
  assert.equal(requests.length,1);
  const request=requests[0];
  assert.equal(request.url,'https://firestore.googleapis.com/v1/projects/outro-lado-rpg-bryan/databases/outro-lado-rpg/documents:commit');
  assert.equal(request.options.headers.Authorization,'Bearer firebase-id-token');
  const write=request.body.writes[0];
  assert.equal(write.currentDocument.exists,false);
  assert.equal(write.update.name,'projects/outro-lado-rpg-bryan/databases/outro-lado-rpg/documents/tables/T2_AURORA');
  assert.equal(write.update.fields.ownerUid.stringValue,'uid1');
  assert.deepEqual(Array.from(write.updateTransforms,t=>t.fieldPath),['createdAt','updatedAt']);
  assert(write.updateTransforms.every(t=>t.setToServerValue==='REQUEST_TIME'));
});

test('a previous successful creation is verified rather than overwritten',async()=>{
  const {create,requests,user}=harness([
    makeResponse(409,{error:{status:'ALREADY_EXISTS'}}),
    makeResponse(200,{fields:{ownerUid:{stringValue:'uid1'}}})
  ]);
  await create(user,'tables/T2_AURORA',{ownerUid:'uid1'},['createdAt'],'ownerUid');
  assert.equal(requests.length,2);
  assert.equal(requests[1].options.method,'GET');
  assert.equal(requests[1].url.endsWith('/documents/tables/T2_AURORA'),true);
});

test('different master ownership and authorization denial are not bypassed',async()=>{
  const a=harness([
    makeResponse(409,{error:{status:'ALREADY_EXISTS'}}),
    makeResponse(200,{fields:{ownerUid:{stringValue:'another-user'}}})
  ]);
  await assert.rejects(a.create(a.user,'tables/T2_AURORA',{ownerUid:'uid1'},['createdAt'],'ownerUid'),/outra conta/);
  const b=harness([makeResponse(403,{error:{status:'PERMISSION_DENIED'}})]);
  await assert.rejects(b.create(b.user,'tables/T2_AURORA',{ownerUid:'uid1'},['createdAt'],'ownerUid'),/não tem permissão/);
});

test('new-season portal selects confirmed REST creation without changing classic SDK writes',()=>{
  assert(source.includes("edition === 'temporada' || (edition == null && global.OLSeasonSpace?.isSeasonPage())"));
  assert(source.includes("await createSeasonPortalDocument(user, 'tables/' + tableId"));
  assert(source.includes("'tables/' + tableId + '/members/' + user.uid"));
  assert(source.includes("setDoc(tableRef, {"),'classic table creation should stay available');
  assert(source.includes("setDoc(memberRef, {"),'classic membership creation should stay available');
});
