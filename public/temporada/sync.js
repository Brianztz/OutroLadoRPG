/* Vestigios / Exilio 3.0: realtime and Cloudflare native storage adapter. */
const SOLO_PREFIX='ol_temporada_solo_v1:';
function soloFilePicker(input){
  input.value='';
  if(typeof input.showPicker==='function'){
    try{input.showPicker();return;}catch(_){}
  }
  input.click();
}
function validateSoloBackup(data){
  if(data?.version!==1||!data.state?.attrs||!data.state?.skills)throw Error('Escolha um backup JSON válido da ficha da temporada.');
  if(data.portrait?.image&&!/^data:image\/png;base64,/.test(data.portrait.image))throw Error('Imagem de personagem inválida.');
  return data;
}
async function startStandaloneSheet(){
  const api=window.SeasonSheet,portrait=window.SeasonPortrait,$=id=>document.getElementById(id);
  const note=$('season-solo-note'),picker=$('season-import-file');
  note.hidden=false;$('season-join-table').hidden=false;
  $('season-identity').textContent='Ficha avulsa · sem mesa';
  const snapshot=()=>({version:1,state:api.getState(),portrait:portrait.snapshot(),presentation:{}});
  const status=message=>{note.textContent=message;$('season-status').textContent=message;};
  function persist(){
    try{localStorage.setItem(SOLO_PREFIX+'state',JSON.stringify(api.getState()));
      status('SEM MESA · salva neste navegador. Exporte um backup para guardar ou levar a outro dispositivo.');}
    catch(_){status('SEM MESA · armazenamento indisponível. Exporte o backup antes de sair.');}
  }
  function exportSheet(){
    const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='ficha-avulsa-exilio.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('download-preview').addEventListener('click',event=>{event.stopImmediatePropagation();exportSheet();},true);
  $('season-export').onclick=exportSheet;
  $('import-sheet').onclick=$('season-import').onclick=()=>soloFilePicker(picker);
  picker.onchange=async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    try{
      if(file.size>8*1024*1024)throw Error('O arquivo deve ter até 8 MB.');
      const data=validateSoloBackup(JSON.parse(await file.text()));
      if(!window.confirm('Substituir a ficha avulsa atual pelo backup?'))return;
      await portrait.apply(data.portrait);
      api.applyState({...data.state,masterGrantScope:crypto.randomUUID()});
      persist();api.notify('Ficha avulsa importada.');
    }catch(error){api.notify('Não foi possível importar: '+error.message);}
  };
  $('season-retry').onclick=persist;
  $('season-join-table').onclick=()=>{
    persist();
    const url=new URL('./index.html',location.href);url.searchParams.set('entrar','1');
    location.assign(url.href);
  };
  window.addEventListener('season:change',persist);
  persist();
}
// Lê a cópia avulsa deste dispositivo sem modificar seu estado nem suas imagens.
async function readStandaloneBackup(){
  const state=JSON.parse(localStorage.getItem(SOLO_PREFIX+'state')||'null');
  if(!state?.attrs||!state?.skills)throw Error('Não existe ficha avulsa neste navegador.');
  const settings=JSON.parse(localStorage.getItem(SOLO_PREFIX+'outrolado_offline_foto_posicao_v3')||'{}');
  let image=localStorage.getItem(SOLO_PREFIX+'outrolado_offline_foto_png_v1')||'';
  if(window.indexedDB){
    let db;
    try{
      db=await new Promise((resolve,reject)=>{
        const req=indexedDB.open(SOLO_PREFIX+'outrolado_offline_foto_personagem_v1',1);
        req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos');};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Banco de imagens bloqueado.'));
      });
      const blob=await new Promise((resolve,reject)=>{
        const tx=db.transaction('photos','readonly'),req=tx.objectStore('photos').get('main');
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      if(blob)image=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);
      });
    }catch(error){
      if(!image)throw Error('Não foi possível ler a imagem avulsa. Exporte e importe o backup manualmente.');
    }finally{db?.close();}
  }
  return validateSoloBackup({version:1,state,portrait:{image,settings},presentation:{}});
}
window.startSeasonSync=async function startSeasonSync(){
  const {table,view,user,prefix,stateKey,solo}=window.SeasonContext;
  if(solo)return startStandaloneSheet();
  const api=window.SeasonSheet,portrait=window.SeasonPortrait,$=id=>document.getElementById(id);
  const socket=window.io();window.SeasonSocket=socket;
  const soloCopy=$('season-copy-solo');
  const menu=$('season-tables-menu');
  if(menu&&!view){menu.hidden=false;menu.onclick=()=>{
    const url=new URL('./index.html',location.href);url.searchParams.set('menu','1');
    // Preserve local unsynced edits for this character, rather than carrying them to a different room.
    location.assign(url.href);
  };}
  if(soloCopy&&!view){
    try{soloCopy.hidden=!localStorage.getItem(SOLO_PREFIX+'state');}catch(_){}
  }
  let ready=false,cloudReady=false,applying=false,dirty=false,busy=false,timer=null,realtimeTimer=null,lastHash='',closed=false;
  let preferences={color:'#b83b25',combat:false,status:{}};
  const metadataKey=prefix+'presentation',markerKey=prefix+'cloudHash',dirtyKey=prefix+'dirty';
  dirty=localStorage.getItem(dirtyKey)==='1';
  try{preferences={...preferences,...JSON.parse(localStorage.getItem(metadataKey)||'{}')};}catch(_){}
  let code=view||user.code||new URLSearchParams(location.search).get('personagem')||localStorage.getItem('player_sync_code');
  if(!code){code=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase();localStorage.setItem('player_sync_code',code);}
  const alwaysEditableAttributes=!view && document.body.classList.contains('season-rulebook-v3');
  const lock=locked=>{
    for(const id of ['page-principal','page-inventario','page-rituais','tools-toggle','sheet-tabs']){
      // Os atributos do novo livro devem funcionar até durante a leitura inicial da nuvem.
      const editable=alwaysEditableAttributes && id==='page-principal';
      document.getElementById(id).inert=Boolean(locked && !editable);
    }
    document.getElementById('season-import').disabled=locked;
    document.getElementById('import-sheet').disabled=locked;
    if(soloCopy)soloCopy.disabled=locked;
  };
  lock(true);
  const status=text=>$('season-status').textContent=text;
  $('season-identity').textContent=(view?'Editando ':'Temporada · ')+code+' · '+table;
  $('season-color').value=preferences.color;$('season-combat').checked=preferences.combat;
  function snapshot(){return {version:1,state:api.getState(),portrait:portrait.snapshot(),presentation:{...preferences}};}
  function packet(){const snap=snapshot(),d=api.project();d.temporada=snap;d.info.char_img=snap.portrait.image;d.info.char_cor_overlay=preferences.color;d.modoCombate=preferences.combat;d.charStatus=preferences.status;return {codigo:code,id:code,mesa:table,sheetType:'temporada',nome:d.info.char_nome||'Personagem',foto:portrait.avatar(),corOverlay:preferences.color,nex:d.info.char_nex,defesa:d.defense,vida_atual:d.info.vida_atual,vida_max:d.info.vida_max,sani_atual:d.info.sani_atual,sani_max:d.info.sani_max,modoCombate:preferences.combat,armaDisparoAtiva:d.armaDisparoAtiva,status:preferences.status,fullData:d};}
  function broadcast(){if(ready&&socket.connected)socket.emit(view?'master_update_player':'status_change',packet());}
  // Opening a saved sheet in the master's iframe adds it to the shield's
  // character cards. Unlike an edit, this event never marks the player online
  // or sends the old cloud snapshot to a connected player's own sheet.
  function announceMasterOpenedSheet(){
    if(view&&ready&&socket.connected)socket.emit('master_open_sheet',packet());
  }
  function storePreferences(){localStorage.setItem(metadataKey,JSON.stringify(preferences));$('season-color').value=preferences.color;$('season-combat').checked=preferences.combat;}
  async function applySnapshot(value){if(value?.version!==1||!value.state)throw Error('Formato de ficha incompatível.');applying=true;try{api.applyState(value.state);await portrait.apply(value.portrait);preferences={...preferences,...value.presentation};storePreferences();}finally{applying=false;}}
  // Se houver edições locais offline, acrescentar somente as entregas inéditas
  // do mestre, sem substituir atributos, PV, inventário ou outras edições locais.
  async function mergeOfflineMasterDeliveries(remote){
    const local=snapshot();
    const from=remote?.state,to=local.state;
    if(!from||!to)return;
    // Fichas diferentes podem ter o mesmo código de acesso, mas não as mesmas entregas.
    // O marcador vazio representa uma ficha legada, anterior à separação por importação.
    const scopeOf=state=>typeof state.masterGrantScope==='string'?state.masterGrantScope:'';
    if(scopeOf(from)!==scopeOf(to))return;
    const seen=new Set(Array.isArray(to.masterGrantIds)?to.masterGrantIds:[]);
    const delivered=Array.isArray(from.masterGrantIds)?from.masterGrantIds:[];
    let changed=false;
    for(const id of delivered){
      if(seen.has(id))continue;
      const item=Array.isArray(from.inventory?.items)?from.inventory.items.find(i=>i.id==='master_item_'+id):null;
      const clue=Array.isArray(from.clues)?from.clues.find(c=>c.id==='master_clue_'+id):null;
      if(item){
        if(!to.inventory||typeof to.inventory!=='object')to.inventory={items:[],equipped:{weapon:null,armor:null,important:null,backpack:null}};
        if(!Array.isArray(to.inventory.items))to.inventory.items=[];
        if(!to.inventory.items.some(existing=>existing.id===item.id))to.inventory.items.push(item);
      }
      if(clue){
        if(!Array.isArray(to.clues))to.clues=[];
        if(!to.clues.some(existing=>existing.id===clue.id))to.clues.push(clue);
      }
      seen.add(id);changed=true;
    }
    if(changed){to.masterGrantIds=[...seen];await applySnapshot(local);}
  }
  async function flush(){clearTimeout(timer);if(!ready||applying||busy||closed)return;if(!cloudReady){broadcast();status('MODO LOCAL · atributos salvos neste dispositivo; tente sincronizar depois.');return;}busy=true;try{do{dirty=false;const value=snapshot();broadcast();const json=JSON.stringify(value),hash=OLFirebase.hashCharacterSheet(json);if(hash!==lastHash){status('Salvando…');const result=await OLFirebase.saveCharacter(table,json,{sheetVariant:'temporada',playerCode:code,characterName:value.state.name||'Personagem',overlayColor:preferences.color});lastHash=result.sheetHash;localStorage.setItem(markerKey,lastHash);}if(!dirty)localStorage.removeItem(dirtyKey);status(socket.connected?'Salvo · conectado':'Salvo · reconectando');}while(dirty&&!closed);}catch(error){
    dirty=true;
    const quota=/resource.exhausted|quota limit exceeded|cota diária/i.test(String(error?.code||'')+' '+String(error?.message||''));
    status(quota?'SINCRONIZAÇÃO TEMPORARIAMENTE INDISPONÍVEL — alterações locais preservadas.':'Não salvo na nuvem: '+error.message);
  }finally{busy=false;}}
  function changed(){
    if(applying)return;
    dirty=true;
    localStorage.setItem(dirtyKey,'1');
    if(!ready)return;
    // Os jogadores continuam vendo as alterações em tempo real pelo socket;
    // a gravação persistente aguarda alguns segundos, reduzindo tráfego.
    if(!view){
      clearTimeout(realtimeTimer);
      realtimeTimer=setTimeout(broadcast,180);
    }
    clearTimeout(timer);
    timer=setTimeout(flush,view?220:3500);
  }
  window.addEventListener('season:change',changed);
  $('season-color').onchange=()=>{preferences.color=$('season-color').value;storePreferences();changed();};
  $('season-combat').onchange=()=>{preferences.combat=$('season-combat').checked;storePreferences();changed();};
  window.addEventListener('season:roll',event=>{if(!ready)return;const {pool,label,name}=event.detail;broadcast();socket.emit('rolagem_feita',{codigo:code,mesa:table,jogador:api.getState().name||'Personagem',acao:name+' — '+label,resultado:pool.value,cor:label==='FALHA'?'#f16a5b':'#e8b67a'});});
  socket.on('connect',()=>{if(view){socket.emit('request_player',{codigo:code,mesa:table});announceMasterOpenedSheet();}else if(ready){broadcast();if(!cloudReady)void initialize();else if(dirty)void flush();}status(ready?'Conectado à mesa':'Carregando ficha…');});
  window.addEventListener('online',()=>{if(view||closed)return;if(!cloudReady)void initialize();else if(dirty)void flush();});
  socket.on('disconnect',()=>status('Sem conexão · alterações locais preservadas'));
  socket.on('sync_requested',data=>{if(data?.codigo===code&&data.mesa===table)broadcast();});
  let inbound=Promise.resolve();
  const receive=data=>{if(!data||String(data.codigo)!==code||OLFirebase.normalizeTableCode(data.mesa)!==table||data.fullData?.sheetType!=='temporada')return;inbound=inbound.then(async()=>{if(view&&ready&&JSON.stringify(data.fullData.temporada)===JSON.stringify(snapshot()))return;applying=true;try{api.applyMaster(data.fullData);await portrait.apply(data.fullData.temporada.portrait);preferences={...preferences,...data.fullData.temporada.presentation,color:data.corOverlay||preferences.color,combat:Boolean(data.modoCombate),status:data.status||{}};storePreferences();ready=true;lock(false);status('Atualizado pelo mestre');}finally{applying=false;}if(view)announceMasterOpenedSheet();else changed();}).catch(error=>{applying=false;status('Não foi possível receber a ficha: '+error.message);});};
  socket.on(view?'update_mestre':'player_data_updated',receive);
  if(!view)socket.on('catalog_item_granted',data=>{if(!data?.item)return;const p=packet();p.fullData.inv.push(data.item);receive(p);});
  $('download-preview').addEventListener('click',e=>{e.stopImmediatePropagation();$('season-export').click();},true);
  $('season-export').onclick=()=>{const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ficha-temporada-'+code+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  // O seletor fica fora do painel oculto. Abri-lo diretamente pelo clique
  // visível preserva a ativação do usuário (inclusive em navegadores móveis).
  const importPicker=$('season-import-file');
  function openImportPicker(){
    importPicker.value='';
    if(typeof importPicker.showPicker==='function'){
      try{importPicker.showPicker();return;}catch(error){console.warn('Seletor nativo indisponível:',error);}
    }
    importPicker.click();
  }
  $('import-sheet').onclick=openImportPicker;
  $('season-import').onclick=openImportPicker;
  importPicker.onchange=async event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    try{
      if(file.size>8*1024*1024)throw Error('O arquivo deve ter até 8 MB.');
      const data=JSON.parse(await file.text());
      if(data.version!==1||!data.state?.attrs||!data.state?.skills)
        throw Error('Escolha um backup JSON válido da ficha da temporada.');
      // Importar é trocar de personagem: não herdar entregas pendentes
      // da ficha anterior só porque ambas usam o mesmo código de jogador.
      // O backup continua intacto; a geração pertence à cópia importada.
      const imported={...data,state:{...data.state,masterGrantScope:crypto.randomUUID()}};
      await applySnapshot(imported);
      changed();
      await flush();
      api.notify('Ficha importada. Entregas anteriores de outro personagem não serão reaplicadas.');
    }catch(error){
      const message='Não foi possível importar: '+(error?.message||String(error));
      status(message);
      api.notify(message);
    }
  };
  if(soloCopy&&!view)soloCopy.onclick=async()=>{
    if(!ready||!cloudReady||applying||busy){api.notify('Aguarde a sincronização da mesa antes de usar a ficha avulsa.');return;}
    if(!window.confirm('Usar uma cópia da ficha avulsa nesta mesa? Isso substitui a ficha atual da mesa. A ficha avulsa permanece salva neste navegador.'))return;
    soloCopy.disabled=true;
    try{
      const data=await readStandaloneBackup();
      // Uma nova geração não herda entregas pendentes de outra ficha.
      await applySnapshot({...data,state:{...data.state,masterGrantScope:crypto.randomUUID()}});
      changed();await flush();
      api.notify('Cópia da ficha avulsa aplicada à mesa. A original continua no navegador.');
    }catch(error){api.notify('Não foi possível usar a ficha avulsa: '+error.message);}
    finally{soloCopy.disabled=false;}
  };
  let unsubscribe=null;
  let initializing=false;
  async function initialize(){
    if(initializing||closed)return;
    initializing=true;
    try{
    if(view){
      // The player's sheet is stored in Cloudflare even when they are offline.
      // Only the master can supply a different code to loadCharacter.
      status('Carregando ficha salva do personagem…');
      try{
        const cloud=await OLFirebase.loadCharacter(table,'temporada',code);
        if(cloud?.sheetJson){
          // A live player may have sent a newer snapshot while the request was
          // pending. Do not replace that live state with a delayed cloud read.
          if(!ready)await applySnapshot(JSON.parse(cloud.sheetJson));
          lastHash=cloud.sheetHash||OLFirebase.hashCharacterSheet(cloud.sheetJson);
          localStorage.setItem(markerKey,lastHash);
          ready=true;cloudReady=true;lock(false);
          status('Ficha salva carregada · o mestre pode visualizar e editar');
          announceMasterOpenedSheet();
        }else{
          status('Ainda não há ficha salva na nuvem. Aguardando conexão do jogador…');
        }
      }catch(error){
        console.warn('Não foi possível carregar a ficha salva para o mestre:',error);
        status('Não foi possível consultar a ficha salva. Aguardando conexão do jogador…');
      }
      if(socket.connected)socket.emit('request_player',{codigo:code,mesa:table});
      return;
    }
    status('Carregando a ficha da temporada…');
    try{const cloud=await OLFirebase.loadCharacter(table,'temporada');const marker=localStorage.getItem(markerKey);if(cloud){const locallyDirty=localStorage.getItem(dirtyKey)==='1';if(locallyDirty&&(!marker||marker!==cloud.sheetHash)){
        // A cópia local continua prevalecendo para mudanças do jogador;
        // presentes do mestre entram mesmo enquanto houver conflito de edição.
        await mergeOfflineMasterDeliveries(JSON.parse(cloud.sheetJson));
        ready=true;cloudReady=false;lock(false);
        status('Alterações locais e da nuvem diferem. Exporte o backup antes de sincronizar; seus atributos continuam editáveis.');
        return;
      }if(!locallyDirty)await applySnapshot(JSON.parse(cloud.sheetJson));lastHash=cloud.sheetHash;localStorage.setItem(markerKey,lastHash);}ready=true;cloudReady=true;lock(false);broadcast();if(!unsubscribe)unsubscribe=await OLFirebase.watchCharacter(table,(next,error)=>{if(error){status('Falha ao acompanhar a nuvem: '+error.message);return;}if(!next||next.sheetHash===lastHash||busy||dirty||applying)return;inbound=inbound.then(async()=>{if(busy||dirty)return;await applySnapshot(JSON.parse(next.sheetJson));lastHash=next.sheetHash;localStorage.setItem(markerKey,lastHash);broadcast();}).catch(error=>status('Ficha remota inválida: '+error.message));},'temporada');await flush();}catch(error){cloudReady=false;ready=true;lock(false);broadcast();status('MODO LOCAL · servidor indisponível. Atributos liberados e preservados neste dispositivo. Abra os ajustes e clique em Tentar novamente quando a nuvem voltar.');}
    }finally{initializing=false;}
  }
  $('season-retry').onclick=()=>cloudReady?flush():initialize();
  window.addEventListener('beforeunload',event=>{if(dirty&&!view){event.preventDefault();event.returnValue='';}});
  window.addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);clearTimeout(realtimeTimer);unsubscribe?.();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!closed&&!view){if(!cloudReady)void initialize();else if(dirty)void flush();}});
  let inspecting=null,inspectionTimer=null;
  const inspectionButton=document.createElement('button');inspectionButton.type='button';inspectionButton.textContent='Mostrar no overlay';inspectionButton.id='season-inspect-overlay';$('clue-inspect').append(inspectionButton);
  function stopInspection(){if(inspecting)socket.emit('clue_inspection_stop',{mesa:table,codigo:code,clueId:inspecting});inspecting=null;inspectionButton.textContent='Mostrar no overlay';}
  inspectionButton.onclick=()=>{if(inspecting){stopInspection();return;}if(!socket.connected){api.notify('Conecte-se à mesa para mostrar a pista.');return;}const inspection=api.inspection();if(!inspection)return;inspecting=inspection.clue.id;socket.emit('clue_inspection_start',{mesa:table,codigo:code,jogador:api.getState().name,...inspection});inspectionButton.textContent='Parar no overlay';};
  $('clue-inspect').addEventListener('close',stopInspection);
  window.addEventListener('season:clue-view',()=>{if(!inspecting||inspectionTimer)return;inspectionTimer=setTimeout(()=>{inspectionTimer=null;const value=api.inspection();if(!value||value.clue.id!==inspecting){stopInspection();return;}socket.emit('clue_inspection_update',{mesa:table,codigo:code,clueId:inspecting,state:value.state});},40);});
  socket.on('clue_inspection_stopped',data=>{if(data?.codigo===code){inspecting=null;inspectionButton.textContent='Mostrar no overlay';}});
  await initialize();
};
