const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..');
const file=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const data=file('bestiary-outrolado.js');
const browser=file('bestiary-master.js');
const screens=['mestre.html','mestre-temporada.html'];
const openPage=name=>{
 const dom=new JSDOM(file(name),{url:'https://example.test/'+name,runScripts:'outside-only'});
 const w=dom.window;
 w.eval("let monstersState=[]; function saveMonstersState(){window.__saved=JSON.parse(JSON.stringify(monstersState))}; function renderMonsters(){window.__renders=(window.__renders||0)+1}");
 w.eval(data);
 w.eval(browser);
 return {dom,w};
};
test('os dois escudos incluem exatamente a mesma biblioteca de referências',()=>{
 for(const name of screens){
  const html=file(name);
  const ids=['master-bestiary-library','bestiary-search','bestiary-element','bestiary-source','bestiary-tier','bestiary-reference-grid','bestiary-results-count'];
  for(const id of ids)assert(html.includes('id="'+id+'"'),name+' ausente '+id);
  assert(html.includes('bestiary-outrolado.js?v=1'));
  assert(html.includes('bestiary-master.js?v=1'));
  assert(html.includes('bestiary-outrolado.css?v=1'));
 }
 assert(!file('mestre.html').includes('master-theme.css?v=1'),'primeira temporada mantém seu tema original');
 assert(file('mestre-temporada.html').includes('master-theme.css?v=1'));
});
test('131 modelos diferentes de criatura com mecânica autoral válida do Outro Lado',()=>{
 const {w,dom}=openPage('mestre.html');
 try{
  const entries=w.OLBestiary.entries;
  assert.equal(entries.length,131);
  assert.equal(new Set(entries.map(item=>item.id)).size,entries.length);
  for(const entry of entries){
   const m=w.OLBestiary.makeMonster(entry.id,'sample_'+entry.id);
   assert.equal(m.name,entry.name);
   assert(m.maxLife>=1);
   assert.deepEqual(Object.keys(m.attrs).sort(),['agi','for','int','pre','vig']);
   assert.deepEqual(Object.keys(m.skills).sort(),['fortitude','iniciativa','percepcao','reflexos','vontade']);
   assert(m.actions.length>=2);
   for(const a of m.actions){if(a.damage) assert.match(a.damage,/^\d+d\d+(?:\+\d+)?$/);}
   assert(m.bestiary.unofficial);
  }
 }finally{dom.window.close();}
});
test('pesquisa e filtros permitem localizar nomes, elementos e origens',()=>{
 const {w,dom}=openPage('mestre-temporada.html');
 try{
  const doc=w.document,search=doc.getElementById('bestiary-search');
  assert.match(doc.getElementById('bestiary-results-count').textContent,/131/);
  assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,24);
  search.value='zumbi de sangue';
  search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert(doc.querySelectorAll('.bestiary-reference-card').length>=2);
  assert([...doc.querySelectorAll('.bestiary-reference-name')].every(x=>x.textContent.toLowerCase().includes('zumbi de sangue')));
  const element=doc.getElementById('bestiary-element');
  search.value='';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  element.value='Medo';element.dispatchEvent(new w.Event('change',{bubbles:true}));
  assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,4);
 }finally{dom.window.close();}
});
test('adicionar monstro importa cópia editável sem sobrescrever monstros da mesa',()=>{
 const {w,dom}=openPage('mestre.html');
 try{
  const doc=w.document;
  doc.getElementById('bestiary-search').value='zumbi de sangue';
  doc.getElementById('bestiary-search').dispatchEvent(new w.Event('input',{bubbles:true}));
  const button=doc.querySelector('.bestiary-reference-import');
  assert(button);
  button.click();
  assert.equal(w.__saved.length,1);
  assert.equal(w.__saved[0].name,doc.querySelector('.bestiary-reference-name').textContent);
  assert(w.__renders>=1);
  assert(w.__saved[0].actions.length>=2);
  assert(w.__saved[0].bestiary.unofficial);
  button.click();
  assert.equal(w.__saved.length,2,'nova cópia independente');
  assert.notEqual(w.__saved[0].id,w.__saved[1].id);
 }finally{dom.window.close();}
});


test('os Escudos usam a regra de atributo 0=1d20, +1=2d20, -1=2d20 menor',()=>{
 for(const page of screens){
  const html=file(page);
  const begin=html.indexOf('function rollMonsterD20PoolByAttribute(');
  const end=html.indexOf('function resolveMonsterD20(',begin);
  assert(begin>0&&end>begin,page+' precisa possuir regra de rolagem');
  const poolFactory=new Function('Math',html.slice(begin,end)+';return rollMonsterD20PoolByAttribute;');
  const fakeMath=Object.create(Math);
  let rolls=[0.2,0.85,0.45], index=0;
  fakeMath.random=()=>rolls[index++ % rolls.length];
  const pool=poolFactory(fakeMath);
  const neutral=pool(0);
  assert.equal(neutral.quantity,1);
  assert.equal(neutral.takesLowest,false);
  const positive=pool(1);
  assert.equal(positive.quantity,2);
  assert.equal(positive.takesLowest,false);
  const negative=pool(-1);
  assert.equal(negative.quantity,2);
  assert.equal(negative.takesLowest,true);
  assert.equal(negative.selectedRoll,Math.min(...negative.rolls));
  assert.equal(pool(3).quantity,4);
 }
});
