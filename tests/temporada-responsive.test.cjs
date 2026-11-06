const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const js = read('public/temporada/sheet.js');
const css = read('public/temporada/sheet.css');
const mobileJs = read('public/temporada/mobile.js');
const mobileCss = read('public/temporada/mobile.css');
const html = read('public/ficha-temporada.html');

const first = js.indexOf('  function computeSheetScale(');
const last = js.indexOf('  function updateScale(){',first);
assert(first >= 0 && last > first,'helper responsivo deve existir');
const computeSheetScale = new Function('W','H',js.slice(first,last) + '\nreturn computeSheetScale;')(1920,909);

test('ficha permanece inteira sem distorcer em resoluções comuns',()=>{
 const dimensions = [
  [1920,1080],[1366,768],[1440,900],[1280,720],[1280,1024],
  [2560,1080],[3440,1440],[1024,768],[810,1080],[800,600],[375,812]
 ];
 for(const [width,height] of dimensions){
   const scale=computeSheetScale(width,height,'fit');
   assert(scale > 0, 'scale inválida em '+width+'×'+height);
   assert(1920*scale <= width + 0.00001, 'largura ultrapassou janela '+width+'×'+height);
   assert(909*scale <= height + 0.00001, 'altura ultrapassou janela '+width+'×'+height);
   assert(Math.abs((1920*scale)/(909*scale)-1920/909) < 1e-9,
     'proporção alterada em '+width+'×'+height);
 }
});

test('modo de leitura pode ampliar uniformemente sem esticar a ficha',()=>{
 const fit=computeSheetScale(1280,720,'fit');
 const readable=computeSheetScale(1280,720,'readable');
 assert(readable>fit,'ampliação deve ser maior quando a ficha fica pequena');
 assert.equal(readable,0.82);
 assert.equal(computeSheetScale(2560,1440,'readable'),computeSheetScale(2560,1440,'fit'));
 assert(js.includes("sheet.style.transform='scale('+scale+')'"));
 assert(!js.includes("scaleX=screenMode"));
 assert(!js.includes("scaleY=screenMode"));
 assert(css.includes('body.season-readable-zoom #page-principal:not([hidden])'));
 assert(css.includes('overflow:auto'));
});

test('fundos de Inventário e Rituais preservam proporções, sincronizados com suas camadas',()=>{
 assert(js.includes("canvas.style.transform='scale('+fitScale+')'"));
 assert(js.includes("'inventory-portrait-canvas','ritual-canvas'"));
 assert(css.includes('#page-inventario:not([hidden]),'));
 assert(css.includes('#page-rituais:not([hidden])'));
 assert(css.includes('background-size:contain;'));
});

test('mesmo breakpoint para JS e os três trechos de estilo mobile',()=>{
 const query='(max-width: 1199px), (max-width: 1399px) and (orientation: portrait)';
 assert(mobileJs.includes("matchMedia('"+query+"')"));
 const cssQuery='@media (max-width:1199px), (max-width:1399px) and (orientation:portrait)';
 assert.equal(mobileCss.split(cssQuery).length-1,4);
 assert(mobileCss.includes('body.is-mobile-season #page-rituais:not([hidden])'));
 assert(mobileCss.includes('body.is-mobile-season #ritual-canvas'));
 assert(mobileCss.includes('transform:none!important'));
 assert(mobileCss.includes('#ritual-detail-panel.ritual-detail-closed'));
 assert(mobileCss.includes('width:min(100%,720px)'));
});

test('o navegador carrega a nova versão responsiva, preservando aba e dados da temporada',()=>{
 for(const filename of ['sheet.css','mobile.css','sheet.js','mobile.js']){
   assert(html.includes('/temporada/'+filename+'?v=responsive-1'),'asset não versionado: '+filename);
 }
 for(const tab of ['tab-principal','tab-inventario','tab-rituais']){
   assert(html.includes('id="'+tab+'"'),'aba ausente: '+tab);
 }
 assert(html.includes('id="fit-mode"'));
 assert(html.includes('id="mobile-sheet"'));
 assert(js.includes("if(localStorage.getItem(viewModeKey)==='readable')"));
});
