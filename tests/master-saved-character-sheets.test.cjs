const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

const master = fs.readFileSync(path.join(root,'public/mestre-temporada.html'),'utf8');
const sheet = fs.readFileSync(path.join(root,'public/ficha-temporada.html'),'utf8');
const client = fs.readFileSync(path.join(root,'public/firebase-client.js'),'utf8');
const sync = fs.readFileSync(path.join(root,'public/temporada/sync.js'),'utf8');
const store = fs.readFileSync(path.join(root,'src/storage-api.js'),'utf8');

test('o escudo tem acesso visível às fichas salvas, mesmo sem jogador online', () => {
  assert(master.includes('id="master-saved-sheets-button"'));
  assert(master.includes('onclick="openSavedPlayerSheets()"'));
  assert(master.includes('FICHAS DOS PERSONAGENS'));
  assert(master.includes('id="master-sheets-dialog"'));
  assert(master.includes('id="master-sheets-search"'));
  assert(master.includes('id="master-sheets-list"'));
  assert(master.includes('function refreshSavedPlayerSheets()'));
  assert(master.includes("OLNative.listPlayers(physical,'temporada')"));
  assert(master.includes("OLFirebase.seasonScopedTable(tableAtStart)"));
  assert(master.includes('savedPlayerSheets = Array.isArray(result.players) ? result.players : []'));
  assert(master.includes("open.disabled = !entry.hasSheet && !online"));
  assert(master.includes("open.addEventListener('click', () => {"));
  assert(master.includes("abrirFicha(code);"));
  assert(master.includes("function closeSavedPlayerSheets()"));
  assert(master.includes('id="master-sheets-invite-link"'));
  assert(store.includes("if (!master) return json({ error: 'master_credential_required' }, 403)"));
});

test('a ficha aberta pelo mestre mantém a autenticação da mesa e usa o código correto', async () => {
  const start = client.indexOf('  async function loadCharacter(');
  const end = client.indexOf('  async function saveCharacter(',start);
  assert(start>=0 && end>start);
  const logs=[];
  let role='master';
  const ctx = {
    getCurrentUser: async()=>({role,code:'MEU_PERSONAGEM'}),
    localStorage:{getItem:()=> 'OUTRO_PERSONAGEM'},
    normalizePlayerCode: value => String(value||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,40),
    seasonScopedTable:table=>'T2_'+table,
    global:{OLNative:{readCharacter:async(table,variant,code)=>{
      logs.push({table,variant,code});
      return {data:{sheetJson:'{"version":1,"state":{"name":"Clara"}}',sheetHash:'HASH'}};
    }}}
  };
  vm.createContext(ctx);
  const load = vm.runInContext(client.slice(start,end)+'\nloadCharacter',ctx);
  const masterResult=await load('VESTIGIOS','temporada','VESTIGIOS-CLARA');
  assert.equal(logs[0].code,'VESTIGIOS-CLARA');
  assert.equal(logs[0].table,'T2_VESTIGIOS');
  assert.equal(logs[0].variant,'temporada');
  assert.equal(masterResult.sheetHash,'HASH');
  role='player';
  await load('VESTIGIOS','temporada','OUTRO_PERSONAGEM');
  assert.equal(logs[1].code,'MEU_PERSONAGEM',
    'jogadores nao podem usar a selecao de outro codigo do mestre');
});

test('o visualizador carrega a ficha na nuvem e salva edições do mestre', () => {
  assert(master.includes("const page = 'ficha-temporada.html';"));
  assert(master.includes("view=\${encodeURIComponent(code)}"));
  assert(sync.includes("const cloud=await OLFirebase.loadCharacter(table,'temporada',code);"));
  assert(sync.includes('if(!ready)await applySnapshot(JSON.parse(cloud.sheetJson))'));
  assert(sync.includes("status('Ficha salva carregada · o mestre pode visualizar e editar')"));
  assert(sync.includes("if(socket.connected)socket.emit('request_player',{codigo:code,mesa:table});"));
  assert(!sync.includes("if(view){status('Alterações enviadas ao jogador');break;}"));
  assert(sync.includes('await OLFirebase.saveCharacter(table,json,'));
  assert(sync.includes('playerCode:code'));
  assert(sheet.includes('temporada/sync.js?v=master-saved-sheets-1'));
  assert(sheet.includes('firebase-client.js?v=master-saved-sheets-1'));
});

test('os scripts inline do escudo continuam com sintaxe válida', () => {
  const scripts=[...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(m=>m[1]).filter(s=>s.trim());
  assert(scripts.length>=1);
  for(const [i,s] of scripts.entries())assert.doesNotThrow(()=>new vm.Script(s,{filename:'escudo-'+i+'.js'}));
});
