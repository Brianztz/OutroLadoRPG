const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const h=fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8');
const j=fs.readFileSync(path.join(root,'public/temporada/sheet.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/temporada/v3-atributos.css'),'utf8');
test('nova ficha usa a arte enviada e mostra só seis controles de atributo',()=>{
  assert(h.includes('class="season-rulebook-v3"'));
  assert.match(h, /href="\/temporada\/v3-atributos\.css\?v=[^"\s]+"/);
  assert(css.includes("/temporada/assets/fundo-exilio-t2-20261110.webp"));
  assert(css.includes("/temporada/assets/fundo-exilio-t2-20261111.webp"));
  for(const asset of ['fundo-exilio-t2-20261110.webp','fundo-exilio-t2-20261111.webp']){
    const art=fs.readFileSync(path.join(root,'public/temporada/assets',asset));
    assert.equal(art.toString('ascii',0,4),'RIFF','imagem WebP válida');
    assert.equal(art.toString('ascii',8,12),'WEBP','imagem WebP válida');
  }
  assert(css.includes("#sheet > :not(.v3-attributes)"));
  const keys=['potencia','destreza','constituicao','raciocinio','consciencia','expressao'];
  for(const key of keys){
    assert(h.includes('class="attr v3-attributes" type="button" data-attr="'+key+'"'),key);
    assert(j.includes(key+':0'),key+' não inicializado');
  }
  assert.equal((h.match(/class="attr v3-attributes"/g)||[]).length,6);
  assert(!h.includes('src="/temporada/mobile.js?v=responsive-1"'));
  assert.match(h, /src="\/temporada\/sheet\.js\?v=[^"\s]+"/);
});
test('coordenadas dos losangos na arte correspondem aos seis atributos',()=>{
 const values=[['potencia',802,201],['destreza',773,232],['constituicao',743,262],['raciocinio',711,293],['consciencia',681,323],['expressao',649,355]];
 for(const [key,x,y] of values){
  const pat=new RegExp('data-attr="'+key+'"[^>]+style="left:'+x+'px;top:'+y+'px;"');
  assert(pat.test(h),'posição incorreta: '+key);
 }
});
test('outros dados e histórico permanecem no HTML e nas rotinas',()=>{
 for(const id of ['combat-area','sheet-skills-grid','page-inventario','page-rituais','char-name','portrait-png']){
  assert(h.includes('id="'+id+'"'),id);
 }
 assert(j.includes("window.dispatchEvent(new Event('season:change'))"));
});


test('atributos visíveis preservam aumentar, diminuir, rolar e salvar',()=>{
  assert(j.includes("const newAttributeNames={potencia:'POTÊNCIA'"));
  assert(j.includes("const next=Math.max(-1,Math.min(creation?3:5,current+delta))"));
  assert(j.includes("values.reduce((sum,v)=>sum+v,0)>6"));
  assert(j.includes("values.filter(v=>v===-1).length>1"));
  assert(j.includes("el.addEventListener('contextmenu'"));
  assert(j.includes("showSkillDice(pool,'ATRIBUTO'"));
  assert(j.includes("el.addEventListener('keydown'"));
  assert(j.includes("v3-attribute-minus"));
  assert(j.includes("v3-attribute-roll"));
  assert(css.includes("#sheet > :not(.v3-attributes):not(.v3-attribute-tools)"));
  assert(css.includes(".v3-attribute-tools:focus-within"));
  assert(css.includes("@media (hover:none), (pointer:coarse)"));
});
test('tela deixa de bloquear os atributos em falha de Firebase e preserva modo local',()=>{
  const sync=fs.readFileSync(path.join(root,'public/temporada/sync.js'),'utf8');
  assert(sync.includes('ready=true;lock(false);broadcast();status('));
  assert(sync.includes('cloudReady=false;ready=true;lock(false);broadcast();'));
  assert(sync.includes("const alwaysEditableAttributes=!view && document.body.classList.contains('season-rulebook-v3')"));
  assert(sync.includes("const editable=alwaysEditableAttributes && id==='page-principal'"));
  assert(sync.includes("if(!cloudReady){broadcast();status('MODO LOCAL"));
  assert(sync.includes("()=>cloudReady?flush():initialize()"));
  assert.match(h, /src="\/temporada\/sync\.js\?v=[^"\s]+"/);
});
