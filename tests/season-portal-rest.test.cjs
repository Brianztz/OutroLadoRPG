const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('portal Vestigios atende somente a segunda temporada com autenticacao nativa', () => {
  const portal = read('public/index.html');
  const session = read('src/session-api.js');
  assert(portal.includes('OLNative.getMasterRoom(key, preferredCode)'));
  assert(portal.includes("const edition = 'temporada'"));
  assert(portal.includes('OLNative.signInMaster(physicalRoom(table), key)'));
  assert(portal.includes('OLNative.signInPlayer(physical, edition, normalizedCode, key)'));
  assert(portal.includes("'./mestre-temporada.html'"));
  assert(portal.includes("'./ficha-temporada.html'"));
  assert(portal.includes("next.searchParams.set('temporada', '2')"));
  assert(!portal.includes('value="classic"'));
  assert(!portal.includes('mestre.html'));
  assert(!portal.includes('ficha.html'));
  assert(!portal.includes('gstatic.com/firebasejs'));
  assert(session.includes("'ol_room_session'"));
  assert(session.includes('HttpOnly; SameSite=Lax'));
  assert(session.includes("'session:' + await digest(token)"));
});

test('sessao nativa recusa credenciais invalidas', () => {
  const auth = read('src/session-api.js');
  assert(auth.includes('invalid_credentials'));
  assert(auth.includes("'sheet:' + edition + ':' + code + ':owner-sha256'"));
  assert(auth.includes('SESSION_TTL_MS'));
});

test('convites usam somente a temporada 2 com chave individual', () => {
  const manager = read('public/acessos.html');
  const master = read('public/mestre-temporada.html');
  assert(manager.includes("const edition = 'temporada'"));
  assert(manager.includes("OLSeasonSpace.tableId(table, edition)"));
  assert(manager.includes("OLNative.provisionPlayer(physical, edition, playerCode)"));
  assert(manager.includes("invite.searchParams.set('temporada', '2')"));
  assert(manager.includes("invite.hash = new URLSearchParams"));
  assert(manager.includes('create.onclick = () => issueInvite(generateCode())'));
  assert(manager.includes('crypto.getRandomValues(new Uint8Array(12))'));
  assert(manager.includes('navigator.clipboard.writeText(input.value)'));
  assert(manager.includes('<details id="recover">'));
  assert(master.includes("new URL('./acessos.html', location.href)"));
  assert(!manager.includes("'classic'"));
  assert(!manager.includes('mestre.html'));
});

test('convite automatico esconde o login e remove o segredo da URL', () => {
  const portal = read('public/index.html');
  assert(portal.includes("document.getElementById('master-section').hidden = true"));
  assert(portal.includes("document.getElementById('invite-section').hidden = false"));
  assert(portal.includes("history.replaceState(null, '', location.pathname + location.search)"));
  assert(portal.includes('enterPlayer(inviteCredentials.table, inviteCredentials.code, inviteCredentials.key, inviteStatus)'));
  assert(portal.includes('Convite incompleto.'));
});

test('nao sobram SDK nem migrador Firebase', () => {
  const portal = read('public/index.html');
  assert(!portal.includes('migrar.html'));
  assert(!fs.existsSync(path.join(root, 'public/migrar.html')));
  assert(!fs.existsSync(path.join(root, 'public/legacy-firebase-client.js')));
  assert(read('public/native-client.js').includes('OLNative'));
});

test('primeira temporada foi removida sem apagar backend ou recursos compartilhados', () => {
  assert(!fs.existsSync(path.join(root, 'public/mestre.html')));
  assert(!fs.existsSync(path.join(root, 'public/ficha.html')));
  const worker = read('src/worker.js');
  const config = read('wrangler.jsonc');
  assert(worker.includes("'/mestre-temporada.html'"));
  assert(worker.includes("'/ficha-temporada.html'"));
  assert(worker.includes("url.searchParams.set('temporada', '2')"));
  assert(config.includes('"/mestre.html"'));
  assert(config.includes('"/ficha.html"'));
  for (const file of ['public/mestre-temporada.html', 'public/ficha-temporada.html', 'public/overlay.html', 'public/season-space.js']) {
    assert(fs.existsSync(path.join(root, file)), file);
  }
});
