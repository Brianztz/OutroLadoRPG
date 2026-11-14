const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('new portal authenticates by server sessions and not Firebase tokens',()=>{
 const portal=read('public/index.html');
 const session=read('src/session-api.js');
 assert(portal.includes('OLNative.signInMaster(physical, key)'));
 assert(portal.includes('OLNative.signInPlayer(physical, edition, code, key)'));
 assert(portal.includes("seasonSelect.value = params.get('temporada') === '2'"));
 assert(portal.includes("if (isPlayerInvite)"));
 assert(!portal.includes('OLFirebase.signInWithGoogle'));
 assert(session.includes("'ol_room_session'"));
 assert(session.includes('HttpOnly; SameSite=Lax'));
 assert(session.includes("'session:' + await digest(token)"));
});
test('native session rejects unknown player credentials',()=>{
 const auth=read('src/session-api.js');
 assert(auth.includes('invalid_credentials'));
 assert(auth.includes("'sheet:' + edition + ':' + code + ':owner-sha256'"));
 assert(auth.includes('SESSION_TTL_MS'));
});
test('master invite manager provisions and rotates per-player keys',()=>{
 const manager=read('public/acessos.html');
 assert(manager.includes('OLNative.provisionPlayer(physical, edition, playerCode)'));
 assert(manager.includes('status.textContent'));
 assert(manager.includes("invite.hash = new URLSearchParams"));
 for(const path of ['public/mestre.html','public/mestre-temporada.html']){
   const content=read(path);
   assert(content.includes("new URL('./acessos.html', location.href)"));
 }
});
test('nenhum arquivo de migracao Firebase permanece no portal',()=>{
 const portal=read('public/index.html');
 const native=read('public/native-client.js');
 assert(!portal.includes('migrar.html'));
 assert(!fs.existsSync(path.join(root, 'public/migrar.html')));
 assert(!fs.existsSync(path.join(root, 'public/legacy-firebase-client.js')));
 assert(native.includes('OLNative'));
});
