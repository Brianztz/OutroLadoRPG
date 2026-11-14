const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');const root=path.join(__dirname,'..');
test('Vestigios storage uses the season-two namespace keys',()=>{
 const storage=fs.readFileSync(path.join(root,'src/storage-api.js'),'utf8');
 const compat=fs.readFileSync(path.join(root,'public/firebase-client.js'),'utf8');
 assert(storage.includes("url.searchParams.get('edicao') === 'temporada' ? 'temporada' : 'classic'"));
 assert(storage.includes("'sheet:' + edition + ':' + code"));
 assert(compat.includes("global.OLSeasonSpace.tableId(table, 'temporada')"));
 assert(compat.includes('OLNative.writeCharacter'));
});
test('Vestigios assets exist and the master embeds only the current sheet',()=>{
 for(const name of ['ficha-temporada.html','temporada/sheet.css','temporada/sheet.js']){
  const source=fs.readFileSync(path.join(root,'public',name),'utf8');
  for(const m of source.matchAll(/\/temporada\/assets\/([\w.-]+)/g)){
   assert(fs.existsSync(path.join(root,'public/temporada/assets',m[1])),m[1]);
  }
 }
 const master=fs.readFileSync(path.join(root,'public/mestre-temporada.html'),'utf8');
 assert(master.includes("const page = 'ficha-temporada.html'"));
 assert(!fs.existsSync(path.join(root,'public/mestre.html')));
 assert(!fs.existsSync(path.join(root,'public/ficha.html')));
 for(const file of ['public/firebase-client.js','public/realtime-client.js','public/temporada/sheet.js','public/temporada/sync.js']){
   new vm.Script(fs.readFileSync(path.join(root,file),'utf8'));
 }
});
