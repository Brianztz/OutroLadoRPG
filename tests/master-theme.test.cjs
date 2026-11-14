const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'public/temporada/master-theme.css'), 'utf8');

test('Escudo de Vestigios tem identidade visual exclusiva do Exilio 3.0', () => {
  const originalStyle = html.indexOf('</style>');
  const themeLink = html.indexOf('href="/temporada/master-theme.css?v=exilio-3-escudo-v2"');
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
    'master-table-button','combat-mode-button','players-board',
    'initiative-drawer','master-tab-combat','master-tab-monsters',
    'master-tab-catalog','master-tab-clues','master-tab-lumina',
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
