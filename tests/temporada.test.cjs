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

test('level editor allows entering or decreasing the level and syncs the saved value',async()=>{
 const app=await setup();try{
  const {w,writes,sent}=app,button=w.document.getElementById('char-level'),dialog=w.document.getElementById('level-dialog'),input=w.document.getElementById('level-input'),form=w.document.getElementById('level-form');
  button.click();assert.equal(dialog.open,true);assert.equal(input.value,'1');
  input.value='12';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(button.textContent,'12');assert.equal(w.SeasonSheet.getState().level,12);assert.equal(dialog.open,false);
  await delay(650);assert.equal(writes.at(-1).state.level,12);assert.equal(sent.filter(p=>p.e==='status_change').at(-1).d.temporada.state.level,12);
  button.click();w.document.getElementById('level-minus').click();assert.equal(input.value,'11');
  w.document.getElementById('level-cancel').click();assert.equal(w.SeasonSheet.getState().level,12);
  button.click();input.value='0';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.equal(w.SeasonSheet.getState().level,12);assert.equal(dialog.open,true);
 }finally{app.dom.window.close();}
});
