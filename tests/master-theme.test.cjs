const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'public/temporada/master-theme.css'), 'utf8');

test('Escudo de Vestigios tem identidade visual exclusiva do Exilio 3.0', () => {
  const originalStyle = html.indexOf('</style>');
  const themeLink = html.indexOf('href="/temporada/master-theme.css?v=exilio-3-escudo-v4"');
  assert(originalStyle >= 0 && themeLink > originalStyle);
  assert(html.includes('OUTRO LADO: VESTÍGIOS · EXÍLIO 3.0'));
  assert(html.includes('Escudo do Mestre · Vestígios'));
  assert(!html.includes('OUTRO LADO / 1ª TEMPORADA'));
  assert(!fs.existsSync(path.join(root, 'public/mestre.html')));
});

test('Theme uses the season red, black and parchment palette without hiding game sections', () => {
  assert.match(theme, /--season-red:\s*#c32c1b/);
  assert.match(theme, /--bg-body:\s*#070606/);
  assert.match(theme, /--season-cream:\s*#f6e6d9/);
  for (const selector of [
    '.mestre-top-bar', '.master-tab-button.active', '.player-card',
    '.monster-card', '.catalog-card', '.master-clue-card',
    '.initiative-drawer', '.master-invite-dialog', '.master-dice-box',
    '.lumina-master-panel'
  ]) {
    assert(theme.includes(selector), selector + ' missing its theme customization');
  }
  assert(!/\.master-tab-panel\s*\{\s*display\s*:\s*none/i.test(theme), 'theme should not change tab display state');
});

test('Master controls and game content still use the existing identifiers', () => {
  for (const id of [
    'master-invite-table','combat-mode-button','players-board',
    'initiative-drawer','master-tab-combat','master-tab-monsters',
    'monster-modal-bestiary-tab','monster-modal-bestiary-panel',
    'master-tab-equipment','master-tab-clues','master-tab-lumina',
    'monsters-grid','catalog-grid','master-clues-grid',
    'master-invite-dialog','master-overlay-button'
  ]) {
    assert(html.includes('id="' + id + '"'), 'Missing Vestigios master control: ' + id);
  }
  for (const method of [
    'toggleCombatMode()', 'copyMasterTableCode()', 'openMasterInvite()',
    "switchMasterTab('combat')", 'openMonsterPopup()'
  ]) {
    assert(html.includes(method), 'Missing master action: ' + method);
  }
  assert(!html.includes('function chooseMasterTable('), 'O codigo da mesa nao deve ser editavel');
  assert(!html.includes('function switchMasterTable('), 'O mestre deve manter o codigo definitivo');
});

test('Cartões de personagens: ocupação junto da classe, PV e PM antes dos atributos', () => {
  const start = html.indexOf('function renderPlayer(rawData)');
  const end = html.indexOf('function removePlayer(', start);
  assert(start >= 0 && end > start, 'Renderizador do cartão não localizado');
  const render = html.slice(start, end);
  const cardStart = render.indexOf('card.innerHTML = `');
  const cardEnd = render.indexOf("card.querySelector('.btn-ver-ficha')", cardStart);
  const card = render.slice(cardStart, cardEnd);
  const infoStart = card.indexOf('<div class="player-info">');
  const infoEnd = card.indexOf('</div>', infoStart);
  assert(infoStart >= 0 && infoEnd > infoStart);
  const info = card.slice(infoStart, infoEnd);
  assert(info.includes('class="exilio-player-class"'), 'Classe ausente no cabeçalho');
  assert(info.includes('class="exilio-player-occupation"'), 'Ocupação deve estar junto da classe');
  assert(info.indexOf('exilio-player-class') < info.indexOf('exilio-player-occupation'));
  assert(info.includes('class="player-defense"'));
  assert.equal((card.match(/class="exilio-player-occupation"/g) || []).length, 1);
  const resourcesStart = card.indexOf('class="exilio-player-resources"');
  const lifeStart = card.indexOf('PV · PONTOS DE VIDA');
  const mentalStart = card.indexOf('PM · PONTOS MENTAIS');
  const attrStart = card.indexOf('class="exilio-player-attributes"');
  const trainedStart = card.indexOf('${exilioTrainedSkills}');
  assert(resourcesStart > infoEnd);
  assert(lifeStart > resourcesStart && mentalStart > lifeStart);
  assert(attrStart > mentalStart && trainedStart > attrStart);
  for (const field of ['lifeCurrent', 'lifeMaximum', 'sanityCurrent', 'sanityMaximum', 'lifePercent', 'sanityPercent']) {
    assert(render.includes(field), 'Valor preservado: '+field);
  }
  assert(theme.includes('.player-card .player-info .exilio-player-occupation'));
  assert(theme.includes('.player-card .exilio-player-resources'));
  assert(theme.includes('@media(max-width: 520px)'));
});
