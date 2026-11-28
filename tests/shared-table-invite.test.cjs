const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
globalThis.crypto=globalThis.crypto||webcrypto;
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const url=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const sessionModule=url(read('src/session-api.js'));
const storageModule=url(read('src/storage-api.js').replace("from './session-api.js'","from '"+sessionModule+"'"));
const secret='M'.repeat(48);
const env={MASTER_DATA_TOKEN:secret};
function context(){
 const map=new Map();let queue=Promise.resolve();
 const storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v),delete:async k=>map.delete(k),
 list:async({prefix})=>new Map([...map].filter(([k])=>k.startsWith(prefix))),
 transaction(fn){const result=queue.then(()=>fn(storage));queue=result.catch(()=>{});return result;}};
 return {map,storage};
}
async function harness(){
 const {handleSessionRequest}=await import(sessionModule);
 const {handleStorageRequest}=await import(storageModule);
 const a=context(),b=context();
 const ctx=table=>table==='T2_A'?a:b;
 const room=(table,body,cookie='')=>handleSessionRequest(new Request('https://test.example/api/session?mesa='+table,{
 method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),Cookie:cookie},
 ...(body?{body:JSON.stringify(body)}:{})
 }),ctx(table),env);
 const store=(table,kind,method='POST',body=null,cookie='',master=false,extra='')=>handleStorageRequest(new Request(
 'https://test.example/api/storage?mesa='+table+'&edicao=temporada&kind='+kind+extra,
 {method,headers:{Cookie:cookie,...(master?{Authorization:'Bearer '+secret}:{}),...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})}),ctx(table),env);
 return {a,b,room,store};
}
const cookie=r=>r.headers.get('set-cookie').split(';')[0];
test('one shared link per table; separate identities and sheet access, repeat joins reuse existing character',async()=>{
 const h=await harness();
 assert.equal((await h.store('T2_A','table-invite')).status,403);
 const key=(await (await h.store('T2_A','table-invite','POST',null,'',true)).json()).invite;
 assert.match(key,/^[a-f0-9]{64}$/);
 assert.equal((await (await h.store('T2_A','table-invite','POST',null,'',true)).json()).invite,key);
 assert.equal(h.a.map.size,1,'creating a link does not create a character');
 const keyB=(await (await h.store('T2_B','table-invite','POST',null,'',true)).json()).invite;
 assert.notEqual(keyB,key);
 assert.equal((await h.room('T2_B',{action:'join-table',invite:key})).status,403);
 const [ra,rb]=await Promise.all([h.room('T2_A',{action:'join-table',invite:key,code:'VICTIM'}),h.room('T2_A',{action:'join-table',invite:key,role:'master'})]);
 assert.equal(ra.status,200);assert.equal(rb.status,200);
 const ca=cookie(ra),cb=cookie(rb),pa=await ra.json(),pb=await rb.json();
 assert.equal(pa.role,'player');assert.equal(pb.role,'player');
 assert.notEqual(pa.code,pb.code);assert.notEqual(pa.code,'VICTIM');
 assert.match(pa.code,/^J[A-F0-9]{32}$/);
 assert.match(ra.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Max-Age=7776000/);
 const repeat=await h.room('T2_A',{action:'join-table',invite:key,previouslyJoined:true},ca);
 assert.deepEqual(await repeat.json(),{ok:true,role:'player',code:pa.code,reused:true});
 assert.equal(h.a.map.get('invite:shared:v1').total,2);
 assert.equal((await h.room('T2_A',{action:'join-table',invite:key,previouslyJoined:true})).status,409);
 assert.equal((await h.store('T2_A','character','PUT',{life:12},ca,false,'&codigo='+pa.code)).status,200);
 assert.equal((await h.store('T2_A','character','PUT',{life:99},cb,false,'&codigo='+pa.code)).status,401);
 assert.equal((await h.store('T2_A','character','GET',null,cb,false,'&codigo='+pa.code)).status,401);
 assert.equal((await h.store('T2_A','character','GET',null,ca,false,'&codigo='+pa.code)).status,200);
 assert.equal((await h.store('T2_A','table-invite','POST',null,ca)).status,403);
 const players=await (await h.store('T2_A','player-list','GET',null,'',true)).json();
 assert.deepEqual(new Set(players.players.map(p=>p.code)),new Set([pa.code,pb.code]));
 const rotated=(await (await h.store('T2_A','table-invite','POST',null,'',true,'&rotate=1')).json()).invite;
 assert.notEqual(rotated,key);
 assert.equal((await h.room('T2_A',{action:'join-table',invite:key})).status,403);
 assert.equal((await h.room('T2_A',null,ca)).status,200,'rotation does not invalidate existing player');
 assert.equal((await h.room('T2_A',{action:'join-table',invite:rotated},ca)).status,200);
 // Individual recovery still targets the existing character, not a new one.
 const individual=await (await h.store('T2_A','player-access','POST',null,'',true,'&renew=1&codigo='+pa.code)).json();
 assert.equal((await h.room('T2_A',null,ca)).status,401);
 const restored=await h.room('T2_A',{role:'player',edition:'temporada',code:pa.code,key:individual.playerKey});
 assert.equal(restored.status,200);assert.equal((await restored.json()).code,pa.code);
});
test('shared joins have bounded rate and master cannot accidentally replace a live master session',async()=>{
 const h=await harness();
 const key=(await (await h.store('T2_A','table-invite','POST',null,'',true)).json()).invite;
 const record=h.a.map.get('invite:shared:v1');h.a.map.set('invite:shared:v1',{...record,window:Date.now(),count:30});
 assert.equal((await h.room('T2_A',{action:'join-table',invite:key})).status,429);
 h.a.map.set('invite:shared:v1',{...record,total:200});
 assert.equal((await h.room('T2_A',{action:'join-table',invite:key})).status,429);
 const masterToken='a'.repeat(64);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(masterToken))),b=>b.toString(16).padStart(2,'0')).join('');
 h.a.map.set('session:'+hash,{role:'master',edition:'temporada',expiresAt:Date.now()+60000});
 assert.equal((await h.room('T2_A',{action:'join-table',invite:key},'ol_room_session_T2_A='+masterToken)).status,409);
});
