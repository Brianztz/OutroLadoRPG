const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function setup({view='',cloud=null}={}){
 const errors=[],writes=[],sent=[],handlers={};let watcher;
 const console=new VirtualConsole();console.on('jsdomError',e=>errors.push(e));console.on('error',e=>errors.push(e));
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8'),{url:'https://example.test/ficha-temporada.html?mesa=TESTE'+(view?'&view='+view:''),runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;w.matchMedia=()=>({matches:true});w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});w.HTMLElement.prototype.getAnimations=()=>[];w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.OLFirebase={guardPage:async()=>true,getCurrentUser:async()=>({uid:'user1'}),normalizeTableCode:s=>(s||'PADRAO').toUpperCase(),hashCharacterSheet:s=>String(s.length),loadCharacter:async(t,v)=>{assert.equal(v,'temporada');return cloud;},saveCharacter:async(t,s,m)=>{assert.equal(m.sheetVariant,'temporada');writes.push(JSON.parse(s));return {sheetHash:String(s.length)};},watchCharacter:async(t,fn,v)=>{assert.equal(v,'temporada');watcher=fn;return ()=>{};}};
 w.io=()=>({connected:true,on:(e,f)=>handlers[e]=f,emit:(e,d)=>sent.push({e,d})});
 w.eval(fs.readFileSync(path.join(root,'public/temporada/sync.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'public/temporada/sheet.js'),'utf8'));
 await delay(80);assert.deepEqual(errors,[]);assert(w.SeasonSheet,'sheet initialized');
 return {dom,w,writes,sent,handlers,errors,watcher};
}
test('season boots, preserves all panels, sends vitals and rolls to existing master/overlay events',async()=>{const app=await setup();try{const {w,sent,writes}=app;assert.equal(w.document.querySelectorAll('[data-skill]').length,28);assert(writes.length);assert.equal(writes[0].version,1);assert.equal(w.localStorage.getItem('ordem_save_local'),null);const last=sent.filter(p=>p.e==='status_change').at(-1);assert.equal(last.d.sheetType,'temporada');assert.equal(last.d.vida_max,100);w.document.getElementById('life-minus').click();await delay(650);assert.equal(sent.filter(p=>p.e==='status_change').at(-1).d.vida_atual,99);w.document.querySelector('.sheet-skill-roll').click();assert(sent.some(p=>p.e==='rolagem_feita'));assert.equal(app.errors.length,0);}finally{app.dom.window.close();}});
test('master changes and grants roundtrip to season without replacing original or duplicating items',async()=>{const app=await setup();try{const {w,handlers,sent}=app;const p=JSON.parse(JSON.stringify(sent.find(p=>p.e==='status_change').d));p.fullData.info.vida_atual=37;p.fullData.inv.push({id:'gift',n:'Lanterna',w:1,d:'Luz',type:'comum',img:''});p.fullData.clues.push({id:'clue',title:'Carta',desc:'Investigue',img:'',type:'object'});handlers.player_data_updated(p);await delay(650);assert.equal(w.SeasonSheet.getState().resources.life.current,37);assert.equal(w.SeasonSheet.getState().inventory.items.length,1);assert.equal(w.SeasonSheet.getState().clues[0].text,'Investigue');const updated=sent.filter(p=>p.e==='status_change').at(-1).d;handlers.player_data_updated(updated);await delay(40);assert.equal(w.SeasonSheet.getState().inventory.items.length,1);assert.equal(app.errors.length,0);}finally{app.dom.window.close();}});
test('master view requests player and never writes the master own cloud character',async()=>{const app=await setup({view:'ABCD'});try{assert(app.sent.some(p=>p.e==='request_player'));assert.equal(app.writes.length,0);const state=JSON.parse(JSON.stringify(app.w.SeasonSheet.getState()));app.handlers.update_mestre({codigo:'ABCD',mesa:'TESTE',fullData:{sheetType:'temporada',temporada:{version:1,state,portrait:{image:''}},info:{vida_atual:22,vida_max:100,sani_atual:80,sani_max:100},inv:[],clues:[]}});await delay(30);app.w.document.getElementById('life-minus').click();await delay(650);assert(app.sent.some(p=>p.e==='master_update_player'));assert.equal(app.writes.length,0);assert.equal(app.errors.length,0);}finally{app.dom.window.close();}});

test('sync sends cropped avatar while preserving original sheet portrait',async()=>{const app=await setup();try{const {w,sent}=app;w.SeasonPortrait.avatar=()=> 'data:image/png;base64,CROPPED';w.SeasonPortrait.snapshot=()=>({image:'data:image/png;base64,ORIGINAL',settings:{}});w.dispatchEvent(new w.Event('season:change'));await delay(650);const packet=sent.filter(p=>p.e==='status_change').at(-1).d;assert.equal(packet.foto,'data:image/png;base64,CROPPED');assert.equal(packet.fullData.info.char_img,'data:image/png;base64,ORIGINAL');assert.equal(packet.fullData.temporada.portrait.image,'data:image/png;base64,ORIGINAL');}finally{app.dom.window.close();}});

test('level behaves like attributes: left click increases, right click decreases within 1 to 20 and syncs',async()=>{
 const app=await setup();try{
  const {w,writes,sent}=app,button=w.document.getElementById('char-level');
  const rightClick=()=>{const event=new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true});button.dispatchEvent(event);assert.equal(event.defaultPrevented,true);};
  assert.equal(w.SeasonSheet.getState().level,1);
  rightClick();assert.equal(w.SeasonSheet.getState().level,1);
  button.click();assert.equal(button.textContent,'2');assert.equal(w.SeasonSheet.getState().level,2);
  rightClick();assert.equal(button.textContent,'1');assert.equal(w.SeasonSheet.getState().level,1);
  for(let n=0;n<25;n++)button.click();assert.equal(w.SeasonSheet.getState().level,20);
  rightClick();assert.equal(w.SeasonSheet.getState().level,19);
  await delay(650);
  assert.equal(writes.at(-1).state.level,19);
  assert.equal(sent.filter(p=>p.e==='status_change').at(-1).d.temporada.state.level,19);
  assert.equal(app.errors.length,0);
 }finally{app.dom.window.close();}
});

test('mobile layout reuses original controls, preserves skills and switches back to desktop',async()=>{
 const app=await setup();try{
  const {w,writes}=app;
  let narrow=true,onChange;
  w.matchMedia=()=>({get matches(){return narrow},addEventListener(event,handler){if(event==='change')onChange=handler;}});
  const originalSkillGrid=w.document.getElementById('sheet-skills-grid');
  const originalAttr=w.document.querySelector('.attr[data-attr="forca"]');
  w.eval(fs.readFileSync(path.join(root,'public/temporada/mobile.js'),'utf8'));
  const mobile=w.document.getElementById('mobile-sheet');
  assert.equal(mobile.hidden,false);
  assert(w.document.body.classList.contains('is-mobile-season'));
  assert.equal(w.document.querySelector('#mobile-skills-mount #sheet-skills-grid'),originalSkillGrid);
  assert.equal(originalSkillGrid.querySelectorAll('[data-skill]').length,28);
  assert.equal(w.document.querySelector('#mobile-attrs-mount .attr[data-attr="forca"]'),originalAttr);
  w.document.getElementById('mobile-level-plus').click();
  assert.equal(w.SeasonSheet.getState().level,2);
  w.document.getElementById('mobile-level-minus').click();
  assert.equal(w.SeasonSheet.getState().level,1);
  originalAttr.click();
  assert.equal(w.SeasonSheet.getState().attrs.forca,1);
  w.document.querySelector('[data-mobile-attr="forca"] .mobile-attr-minus').click();
  assert.equal(w.SeasonSheet.getState().attrs.forca,0);
  w.SeasonPortrait.avatar=()=> 'data:image/png;base64,AAAA';
  w.dispatchEvent(new w.Event('season:change'));
  assert(w.document.getElementById('mobile-avatar-img').src.startsWith('data:image/png;base64,AAAA'));
  narrow=false;onChange();
  assert.equal(mobile.hidden,true);
  assert.equal(originalSkillGrid.parentElement.id,'sheet');
  assert.equal(originalAttr.parentElement.id,'sheet');
  narrow=true;onChange();
  assert.equal(w.document.querySelector('#mobile-skills-mount #sheet-skills-grid'),originalSkillGrid);
  await delay(650);
  assert.equal(writes.at(-1).state.attrs.forca,0);
  assert.equal(app.errors.length,0);
 }finally{app.dom.window.close();}
});


test('mobile inventory follows reference without duplicating items or losing clue controls on desktop',async()=>{
 const app=await setup();
 try{
  const {w}=app;
  let narrow=true,onChange;
  w.matchMedia=()=>({get matches(){return narrow;},addEventListener(event,callback){if(event==='change')onChange=callback;}});
  const originalClues=w.document.getElementById('inventory-clues');
  const originalGrid=w.document.getElementById('inventory-grid');
  const originalWeaponSlot=w.document.getElementById('inventory-slot-weapon');
  w.eval(fs.readFileSync(path.join(root,'public/temporada/mobile.js'),'utf8'));
  const details=w.document.getElementById('mobile-inventory-clues');
  assert(details,'clue disclosure should exist on mobile');
  assert.equal(details.open,false);
  assert.equal(details.querySelector('#inventory-clues'),originalClues);
  assert.equal(w.document.getElementById('inventory-grid'),originalGrid);
  assert.equal(w.document.getElementById('inventory-slot-weapon'),originalWeaponSlot);
  const state=w.SeasonSheet.getState();
  state.inventory={items:[{id:'test-weapon',name:'Machete',type:'weapon',location:'equipment',quantity:1,weight:1,image:''}],equipped:{weapon:'test-weapon',armor:null,important:null,backpack:null}};
  w.SeasonSheet.applyState(state);
  assert(originalGrid.textContent.includes('Machete'),'existing inventory grid renders item name');
  assert(originalWeaponSlot.textContent.includes('Machete'),'equipped slot reflects the same item');
  assert(w.document.getElementById('inventory-load-text').textContent.includes('1 / 5'));
  w.document.getElementById('tab-inventario').click();
  await delay(20);
  assert.equal(w.document.getElementById('page-inventario').hidden,false);
  assert.equal(w.document.getElementById('page-principal').hidden,true,'Principal deve ficar oculta no Inventário');
  assert.equal(w.document.getElementById('page-rituais').hidden,true,'Rituais deve ficar oculta no Inventário');
  assert.equal(w.document.getElementById('mobile-sheet').closest('#page-principal').hidden,true);
  narrow=false;onChange();
  assert.equal(w.document.getElementById('mobile-inventory-clues'),null);
  assert.equal(originalClues.parentElement.id,'inventory-ui');
  assert.equal(w.document.getElementById('inventory-grid'),originalGrid);
  narrow=true;onChange();
  assert.equal(w.document.getElementById('mobile-inventory-clues').querySelector('#inventory-clues'),originalClues);
  assert.equal(app.errors.length,0);
 }finally{app.dom.window.close();}
});
test('mobile inventory CSS keeps the desktop untouched with a dedicated breakpoint',()=>{
 const css=fs.readFileSync(path.join(root,'public/temporada/mobile.css'),'utf8');
 assert(css.includes('@media (max-width:767px)'));
 assert(css.includes('body.is-mobile-season #page-inventario:not([hidden])'));
 assert(css.includes('body.is-mobile-season .layout#page-principal:not([hidden])'));
 assert(css.includes('body.is-mobile-season #page-principal[hidden]'));
 assert(css.includes('body.is-mobile-season #mobile-sheet:not([hidden])'));
 assert(css.includes('body.is-mobile-season #mobile-sheet[hidden]'));
 assert(css.includes('body.is-mobile-season #inventory-grid .item-slot'));
 assert(css.includes('body.is-mobile-season #inventory-ui .inventory-equipped'));
 assert(css.includes('body.is-mobile-season #mobile-inventory-clues'));
});


test('compact season combat card separates readable attack, damage and critical values',async()=>{
  const app=await setup();
  try{
    const {w}=app;
    const card=w.document.querySelector('#combat-attacks .combat-card-compact');
    assert(card,'expected default unarmed attack card');
    assert.equal(card.querySelector('.combat-card-head strong').textContent,'Ataque Desarmado');
    const metrics=[...card.querySelectorAll('.combat-roll-row > *')];
    assert.equal(metrics.length,3);
    for(const [i,label] of ['ATAQUE','DANO','CRÍTICO'].entries()){
      const item=metrics[i];
      assert(item.querySelector('.combat-metric-value')?.textContent.trim(),'value missing for '+label);
      assert.equal(item.querySelector('.combat-metric-label')?.textContent,label);
      assert(item.getAttribute('aria-label').startsWith(label+': '));
    }
    assert.equal(metrics[0].tagName,'BUTTON','attack action must remain interactive');
    assert.equal(metrics[1].tagName,'BUTTON','damage action must remain interactive');
    assert.equal(metrics[2].tagName,'SPAN','critical is informational');
    const sheetCSS=fs.readFileSync(path.join(root,'public/temporada/sheet.css'),'utf8');
    const mobileCSS=fs.readFileSync(path.join(root,'public/temporada/mobile.css'),'utf8');
    assert(sheetCSS.includes('/* Leitura acessível dos ataques'));
    assert(sheetCSS.includes('.combat-metric-value'));
    assert(sheetCSS.includes('white-space:normal'));
    assert(mobileCSS.includes('/* Cartões de ataque legíveis em telas sensíveis ao toque.'));
    assert(mobileCSS.includes('grid-column:1/-1!important'));
    assert.equal(app.errors.length,0);
  }finally{app.dom.window.close();}
});
