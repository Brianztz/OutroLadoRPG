const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const master = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
const player = fs.readFileSync(path.join(root, 'public/temporada/sheet.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');

test('o escudo permite inspecionar a pista como na ficha, sem remover o 3D existente', () => {
  assert(master.includes('VER COMO JOGADOR'));
  for (const id of [
    'master-player-clue-modal', 'master-player-clue-stage', 'master-player-clue-object',
    'master-player-clue-front', 'master-player-clue-back', 'master-player-clue-zoom',
    'master-player-clue-nav', 'master-player-clue-prev', 'master-player-clue-next',
    'master-player-clue-overlay-button'
  ]) assert(master.includes('id="'+id+'"'), 'Faltando: '+id);
  for (const method of [
    'openMasterPlayerClueViewer', 'masterPlayerClueAction', 'masterPlayerCluePage',
    'toggleMasterPlayerClueOverlay', 'closeMasterPlayerClueViewer',
    'sendCurrentMasterClue', 'openMasterClueForm', 'saveMasterClueForm'
  ]) assert(master.includes('function '+method+'('), 'Método ausente: '+method);
  assert(master.includes('id="master-clue-3d-stage"'));
  assert(master.includes('id="master-clue-book-stage"'));
  assert(master.includes('id="master-clue-audio-viewer"'));
  assert(master.includes('saveMasterCluesState()'));
});

test('os controles do escudo seguem os da ficha do jogador',()=>{
  for(const [playerCommand, masterCommand] of [
    ["if(action==='left')", "if(action==='left')"],
    ["if(action==='right')", "if(action==='right')"],
    ["if(action==='in')", "if(action==='in')"],
    ["if(action==='out')", "if(action==='out')"],
    ["if(action==='reset')", "if(action==='reset')"]
  ]) {
    assert(player.includes(playerCommand),playerCommand);
    assert(master.includes(masterCommand),masterCommand);
  }
  assert(master.includes("playerClueZoom*(event.deltaY<0?1.12:1/1.12)"));
  assert(master.includes("playerClueDrag.move"));
  assert(master.includes("playerCluePage>=0"));
  assert(master.includes("normalizeMasterCluePages(clue.pages)"));
  assert(master.includes("document.getElementById('master-player-clue-audio')"));
});

test('pistas do mestre podem aparecer no overlay e ser encerradas sem perder dados',()=>{
  assert(master.includes("socket.emit('clue_inspection_start'"));
  assert(master.includes("socket.emit('clue_inspection_update'"));
  assert(master.includes("socket.emit('clue_inspection_stop'"));
  assert(master.includes("socket.connected"));
  assert(master.includes("codigo:'MESTRE'"));
  assert(master.includes("jogador:'Mestre'"));
  assert(master.includes("clue:masterPlayerClueOverlayData(clue)"));
  assert(master.includes('openClueRecipientPopup(clue)'));
  assert(master.includes('function sendClueToPlayers(clue, playerCodes)'));
  assert(worker.includes("if (!meta.authenticated || !data || typeof data !== 'object' || !data.clue) return"));
  assert(worker.includes("this.broadcast('clue_inspection_started', this.inspection)"));
});

test('scripts inline do escudo continuam com sintaxe JavaScript válida',()=>{
  const scripts=[...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match=>match[1]).filter(text=>text.trim());
  assert(scripts.length>=1);
  for(const [index,script] of scripts.entries()) {
    assert.doesNotThrow(()=>new vm.Script(script,{filename:'escudo-inline-'+index+'.js'}));
  }
});
