const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'public/temporada/v3-interface.js'),'utf8');
const make=()=>{
 const dom=new JSDOM('<!doctype html><body class="season-rulebook-v3"><div id="exilio-v3-ui"></div></body>',{
   url:'https://example.test/ficha-temporada.html',runScripts:'outside-only',pretendToBeVisual:true
 });
 const w=dom.window;
 let state={name:'',attrs:{potencia:0,destreza:0,constituicao:0,raciocinio:0,consciencia:0,expressao:0},skills:{}};
 w.SeasonSheet={
   getState:()=>JSON.parse(JSON.stringify(state)),
   applyState:next=>{state=JSON.parse(JSON.stringify(next));w.dispatchEvent(new w.Event('season:change'))}
 };
 w.Math.random=()=>0;
 w.confirm=()=>true;
 const events=[];
 w.addEventListener('season:roll',event=>events.push(event.detail));
 w.eval(js);
 const get=()=>w.SeasonSheet.getState();
 const click=sel=>{const node=w.document.querySelector(sel);assert(node,'Missing '+sel);node.click();return node;};
 return{w,dom,get,click,events};
};
test('monta 16 Domínios, IP, recursos e oito ações de combate',()=>{
 const f=make();try{
   const d=f.w.document;
   assert.equal(d.querySelectorAll('.v3-domain-row').length,16);
   assert.equal(d.querySelectorAll('[data-combat]').length,8);
   assert(d.getElementById('v3-mobile-attr-grid').children.length===6);
   assert.equal(d.getElementById('v3-class').disabled,true);
   assert.equal(f.w.ExilioV3.domains.length,16);
 }finally{f.dom.window.close();}
});
test('IP escolhe classe e usa fórmula oficial 3d6 + 8/14 + CON/CNS + crescimento',()=>{
 const f=make();try{
   f.click('[data-ip="1"]');
   const select=f.w.document.getElementById('v3-class');
   select.value='vanguarda';select.dispatchEvent(new f.w.Event('change',{bubbles:true}));
   f.click('[data-generate="pv"]');f.click('[data-generate="pm"]');
   const state=f.get().exilio3;
   assert.equal(state.ip,1);
   assert.equal(state.classe,'vanguarda');
   assert.deepEqual(state.pv.dice,[1,1,1]);assert.deepEqual(state.pm.dice,[1,1,1]);
   assert.equal(state.pv.max,16); // 3+8+5
   assert.equal(state.pm.max,20); // 3+14+3
   f.click('[data-resource="pv"][data-delta="-1"]');
   assert.equal(f.get().exilio3.pv.current,15);
   f.click('[data-ip="1"]');
   assert.equal(f.get().exilio3.pv.max,21);
   assert.equal(f.get().exilio3.pv.current,15,'avançar não restaura PV gastos');
 }finally{f.dom.window.close();}
});
test('bônus CON/CNS pode ser aplicado apenas uma vez por IP 3, 6 e 9',()=>{
 const f=make();try{
   f.click('[data-generate="pv"]');
   for(let n=0;n<3;n++)f.click('[data-ip="1"]');
   f.click('[data-stat-bonus="pv"]');
   f.click('[data-stat-bonus="pv"]');
   assert.equal(f.get().exilio3.pv.bonus,2);
   for(let n=0;n<3;n++)f.click('[data-ip="1"]');
   f.click('[data-stat-bonus="pv"]');
   assert.equal(f.get().exilio3.pv.bonus,4);
 }finally{f.dom.window.close();}
});
test('graduação exige IP 4 e 7; somente dois Domínios podem chegar a Referência',()=>{
 const f=make();try{
   const g=sel=>f.click('[data-grade="'+sel+'"]');
   g('Atletismo');g('Atletismo');
   assert.equal(f.get().exilio3.domains['Atletismo'],2);
   for(let n=0;n<4;n++)f.click('[data-ip="1"]');
   g('Atletismo');assert.equal(f.get().exilio3.domains['Atletismo'],4);
   g('Atletismo');assert.equal(f.get().exilio3.domains['Atletismo'],4);
   for(let n=4;n<7;n++)f.click('[data-ip="1"]');
   g('Atletismo');assert.equal(f.get().exilio3.domains['Atletismo'],6);
   for(const s of ['Confronto','Precisão']){g(s);g(s);g(s);}
   assert.equal(f.get().exilio3.domains['Confronto'],6);
   assert.equal(f.get().exilio3.domains['Precisão'],4);
 }finally{f.dom.window.close();}
});
test('testes padrão são 2d10 + atributo + Domínio, e combate não possui defesa fixa',()=>{
 const f=make();try{
   const state=f.get();state.attrs.raciocinio=2;f.w.SeasonSheet.applyState(state);
   f.click('[data-grade="Investigação"]');
   f.click('[data-roll-domain="Investigação"]');
   assert.equal(f.events.at(-1).pool.dice.length,2);
   assert.equal(f.events.at(-1).pool.value,6); // 1+1+RAC2+Domínio2
   f.click('[data-rd="1"]');
   const rolls=f.events.length;
   f.click('[data-combat="block"]');
   assert.equal(f.events.length,rolls,'bloqueio não rola dado');
   assert.match(f.w.document.getElementById('v3-roll-result').textContent,/RD 1/);
   f.click('[data-combat="dodge"]');
   assert.equal(f.events.at(-1).pool.dice.length,2);
   assert.match(f.w.document.getElementById('v3-roll-result').textContent,/empate favorece o defensor/);
 }finally{f.dom.window.close();}
});
test('arquivo é exclusivo da segunda temporada, sem depender da ficha original',()=>{
 const original=fs.readFileSync(path.join(root,'public/ficha.html'),'utf8');
 const season=fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8');
 assert(!original.includes('exilio-v3-ui'));
 assert(season.includes('id="exilio-v3-ui"'));
 assert(season.includes('v3-interface.js'));
});
