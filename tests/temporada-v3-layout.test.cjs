const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const h=fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8');
const j=fs.readFileSync(path.join(root,'public/temporada/sheet.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/temporada/v3-atributos.css'),'utf8');
test('nova ficha usa a arte enviada e mostra só seis controles de atributo',()=>{
  assert(h.includes('class="season-rulebook-v3"'));
  assert(h.includes('/temporada/v3-atributos.css?v=1'));
  assert(css.includes("/temporada/assets/novo-fundo-enviado.webp"));
  assert(css.includes("#sheet > :not(.v3-attributes)"));
  const keys=['potencia','destreza','constituicao','raciocinio','consciencia','expressao'];
  for(const key of keys){
    assert(h.includes('class="attr v3-attributes" type="button" data-attr="'+key+'"'),key);
    assert(j.includes(key+':0'),key+' não inicializado');
  }
  assert.equal((h.match(/class="attr v3-attributes"/g)||[]).length,6);
  assert(!h.includes('src="/temporada/mobile.js?v=responsive-1"'));
  assert(h.includes('src="/temporada/sheet.js?v=v3-atributos-1"'));
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
