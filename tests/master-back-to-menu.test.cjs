const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const master = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

const start = master.indexOf('        async function returnToMasterMenu() {');
const end = master.indexOf('        async function copyMasterTableCode() {', start);
assert(start > 0 && end > start);
const action = master.slice(start, end);

function runButton({ pending = false, accept = true } = {}) {
  const navigations = [], prompts = [];
  const location = {
    href: 'https://outroladorpg.example/mestre-temporada.html?mesa=VESTIGIOS&temporada=2',
    assign(url) { navigations.push(url); }
  };
  const context = {
    URL, window: {
      location,
      confirm(message) { prompts.push(message); return accept; }
    },
    masterCluesCacheWrites: Promise.resolve(),
    masterCluesCloudQueuedJson: pending ? 'unsaved-data' : '',
    masterCluesCloudSaveInFlight: false,
    masterCluesCloudDirtyBeforeReady: false,
    console
  };
  vm.createContext(context);
  vm.runInContext(action, context);
  return { go: () => vm.runInContext('returnToMasterMenu()', context), navigations, prompts };
}

test('Escudo tem botão visível de voltar ao menu principal', () => {
  assert(master.includes('id="master-back-menu"'));
  assert(master.includes('onclick="returnToMasterMenu()"'));
  assert(master.includes('← VOLTAR AO MENU'));
  assert(master.includes('.master-menu-button:hover'));
});

test('Botão navega para menu sem encerrar a sessão e sem loop de login', async () => {
  const { go, navigations, prompts } = runButton();
  await go();
  assert.equal(navigations.length, 1);
  const dest = new URL(navigations[0]);
  assert.equal(dest.pathname, '/index.html');
  assert.equal(dest.searchParams.get('menu'), '1');
  assert.equal(prompts.length, 0);
  assert(!action.includes('signOut('));
  assert(!action.includes('localStorage.clear('));
  assert(portal.includes('id="login-form"'));
  assert(!portal.includes('inspectMasterKey('));
});

test('Confirma antes de sair com pistas ainda não sincronizadas', async () => {
  const refused = runButton({ pending: true, accept: false });
  await refused.go();
  assert.equal(refused.navigations.length, 0);
  assert.equal(refused.prompts.length, 1);
  assert.match(refused.prompts[0], /pistas aguardando sincronização/);
  const accepted = runButton({ pending: true, accept: true });
  await accepted.go();
  assert.equal(accepted.prompts.length, 1);
  assert.equal(accepted.navigations.length, 1);
});
