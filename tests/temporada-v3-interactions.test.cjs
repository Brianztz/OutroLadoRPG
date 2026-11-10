const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('os seis atributos do novo livro funcionam mesmo quando Firebase está indisponível',async()=>{
  const errors=[],sent=[],events={};
  const virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error));
  virtualConsole.on('error',error=>errors.push(error));
  const dom=new JSDOM(read('public/ficha-temporada.html'),{
    url:'https://example.test/ficha-temporada.html?mesa=TESTE',
    pretendToBeVisual:true,runScripts:'outside-only',virtualConsole
  });
  const w=dom.window;
  try {
    let loadCalls=0;
    w.matchMedia=()=>({matches:true});
    w.URL.createObjectURL=()=>'blob:test';
    w.URL.revokeObjectURL=()=>{};
    w.HTMLElement.prototype.animate=()=>({finished:Promise.resolve(),cancel(){}});
    w.HTMLElement.prototype.getAnimations=()=>[];
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
    w.OLFirebase={
      guardPage:async()=>true,
      getCurrentUser:async()=>({uid:'player1'}),
      normalizeTableCode:value=>(value||'PADRAO').toUpperCase(),
      hashCharacterSheet:value=>String(value.length),
      loadCharacter:async()=>{loadCalls++;throw new Error('RESOURCE_EXHAUSTED: quota reached');},
      saveCharacter:async()=>{throw new Error('should not write while cloud unavailable');},
      watchCharacter:async()=>()=>{}
    };
    w.io=()=>({connected:true,on:(name,fn)=>{events[name]=fn;},emit:(name,data)=>{sent.push({name,data});}});
    w.eval(read('public/temporada/sync.js'));
    w.eval(read('public/temporada/sheet.js'));
    await delay(100);
    assert(w.SeasonSheet,'sheet should boot');
    assert.equal(w.document.getElementById('page-principal').inert,false,'offline page must unlock');
    assert.match(w.document.getElementById('season-status').textContent,/MODO LOCAL/);
    const names=['potencia','destreza','constituicao','raciocinio','consciencia','expressao'];
    const rollEvents=[];
    w.addEventListener('season:roll',event=>rollEvents.push(event.detail));
    for(const name of names){
      const control=w.document.querySelector('.v3-attributes[data-attr="'+name+'"]');
      assert(control,'missing '+name);
      assert.equal(control.textContent.trim(),'0');
      control.click();
      assert.equal(control.textContent.trim(),'1');
      assert.equal(w.SeasonSheet.getState().attrs[name],1);
      const right=new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true});
      control.dispatchEvent(right);
      assert.equal(right.defaultPrevented,true);
      assert.equal(w.SeasonSheet.getState().attrs[name],0);
      assert.equal(control.textContent.trim(),'0');
      const minus=control.nextElementSibling.querySelector('.v3-attribute-minus');
      const roll=control.nextElementSibling.querySelector('.v3-attribute-roll');
      assert(minus&&roll,'touch controls missing: '+name);
      minus.click();
      assert.equal(w.SeasonSheet.getState().attrs[name],-1);
      roll.click();
      const result=rollEvents.at(-1);
      assert(result && result.pool.dice.length===2,'negative attribute should roll two d20');
      assert.equal(result.pool.lowest,true,'negative attribute must use lowest die');
      assert.equal(result.pool.value,Math.min(...result.pool.dice));
      w.document.getElementById('skill-dice-popup').close();
      control.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
      assert.equal(w.SeasonSheet.getState().attrs[name],0);
      assert.equal(JSON.parse(w.localStorage.getItem(w.SeasonContext.stateKey)).attrs[name],0);
    }
    // Shift+click rolls without changing the attribute.
    const potencia=w.document.querySelector('.v3-attributes[data-attr="potencia"]');
    potencia.dispatchEvent(new w.MouseEvent('click',{shiftKey:true,bubbles:true}));
    assert.equal(w.SeasonSheet.getState().attrs.potencia,0);
    assert.equal(rollEvents.at(-1).pool.dice.length,1);
    await delay(240);
    assert(sent.some(packet=>packet.name==='status_change'&&packet.data.fullData.temporada.state.attrs.potencia===0),
      'realtime sync should keep working without cloud writes');
    w.document.getElementById('season-retry').click();
    await delay(75);
    assert(loadCalls>=2,'retry should recheck the cloud');
    assert.equal(w.document.getElementById('page-principal').inert,false,'retry failure must not lock controls again');
    assert.deepEqual(errors,[]);
  } finally {
    dom.window.close();
  }
});
