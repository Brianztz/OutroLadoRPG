const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const master=fs.readFileSync(path.join(root,'public/mestre-temporada.html'),'utf8');
const portal=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
function harness(deny=false){
 const fields=new Map(),calls=[];
 const el=id=>{if(!fields.has(id))fields.set(id,{value:'',disabled:false,textContent:'',classList:{add(){},remove(){}}});return fields.get(id);};
 let currentKey='a'.repeat(64);
 const ctx=vm.createContext({document:{getElementById:el},masterTableCode:'VESTIGIOS',crypto:webcrypto,URL,URLSearchParams,location:{href:'https://example.test/mestre-temporada.html?mesa=VESTIGIOS'},OLFirebase:{seasonScopedTable:(t,e)=>{assert.equal(e,'temporada');return 'T2_'+t;}},OLNative:{async getTableInvite(...args){calls.push(args);if(deny)throw Error('master_credential_required');if(args[1])currentKey='b'.repeat(64);return {invite:currentKey};}}});
 const from=master.indexOf('        let masterInvitePending=false;'),to=master.indexOf('        function manageMasterInvites()',from);
 assert(from>=0&&to>from);
 vm.runInContext(master.slice(from,to),ctx);
 return {el,calls,generate:(rotate=false)=>vm.runInContext('generateMasterInvite('+rotate+')',ctx)};
}
test('portal oferece ficha sem mesa sem alterar o cadastro por convite',()=>{
 assert.match(portal,/id="solo-sheet-link"[^>]+href="\.\/ficha-temporada\.html\?solo=1"/);
 assert(portal.includes('signup-invite-form'));
});
test('escudo obtém o mesmo link compartilhado da mesa sem criar personagem',async()=>{
 const h=harness();await h.generate();
 assert.equal(h.calls.length,1);
 assert.deepEqual(h.calls[0],['T2_VESTIGIOS',false]);
 const url=new URL(h.el('master-invite-link').value),fragment=new URLSearchParams(url.hash.slice(1));
 assert.equal(url.origin,'https://example.test');assert.equal(url.pathname,'/index.html');
 assert.equal(url.searchParams.get('mesa'),'VESTIGIOS');assert.equal(url.searchParams.get('temporada'),'2');assert.equal(url.searchParams.get('convite'),'1');
 assert.equal(url.searchParams.get('tipo'),'mesa');
 assert.equal(fragment.get('codigo'),null);assert.equal(fragment.get('chave'),'a'.repeat(64));assert(!url.search.includes('chave'));
 assert.equal(h.el('master-invite-copy').disabled,false);
 await h.generate();assert.equal(h.el('master-invite-link').value,url.href);
 await h.generate(true);assert.notEqual(h.el('master-invite-link').value,url.href);
 assert.deepEqual(h.calls[2],['T2_VESTIGIOS',true]);
});
test('sem autorização não gera link nem habilita copiar',async()=>{
 const h=harness(true);await h.generate();
 assert.equal(h.el('master-invite-link').value,'');
 assert.equal(h.el('master-invite-copy').disabled,true);
 assert.match(h.el('master-invite-status').textContent,/Não foi possível/);
});
