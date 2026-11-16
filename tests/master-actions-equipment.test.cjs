const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../public/mestre-temporada.html'), 'utf8');
const document = new JSDOM(html).window.document;

test('escudo: barra do mestre possui só cinco ações por ícones acessíveis', () => {
  const actions = document.querySelector('.master-top-actions');
  const buttons = [...actions.querySelectorAll('button')];
  assert.equal(buttons.length, 5);
  assert.deepEqual(buttons.map(button => button.id), [
    'master-back-menu',
    'master-saved-sheets-button',
    'master-overlay-button',
    'master-invite-button',
    'combat-mode-button'
  ]);
  for (const button of buttons) {
    assert(button.querySelector('svg[aria-hidden="true"]'), `Ícone ausente em ${button.id}`);
    assert(button.getAttribute('aria-label'), `Descrição acessível ausente em ${button.id}`);
    assert(button.getAttribute('title'), `Tooltip ausente em ${button.id}`);
    assert.equal(button.textContent.trim(), '');
  }
  assert.equal(actions.querySelector('#master-table-button'), null);
  assert.equal(actions.querySelector('.btn-create-catalog-entry'), null);
  assert.equal(document.getElementById('master-table-code'), null);
  assert.equal(document.getElementById('master-invite-table').type, 'text');
});

test('escudo: criação de item/arma está na aba Equipamentos, junto ao catálogo salvo', () => {
  const tab = document.querySelector('[data-master-tab="equipment"]');
  const panel = document.getElementById('master-tab-equipment');
  assert(tab);
  assert(panel);
  assert.equal(tab.getAttribute('onclick'), "switchMasterTab('equipment')");
  assert(panel.classList.contains('master-tab-panel'));
  assert(panel.querySelector('#catalog-grid'));
  assert(panel.querySelector('#catalog-search'));
  assert(panel.querySelector('#catalog-count'));
  assert.equal(panel.querySelector('.btn-create-catalog-entry').getAttribute('onclick'), 'openCatalogCreator()');
  assert.equal(document.querySelector('.master-top-actions .btn-create-catalog-entry'), null);
  assert.equal(document.getElementById('master-items-catalog-legacy'), null);
  assert(html.includes("if (selectedTab === 'equipment') renderMasterCatalog();"));
  assert(html.includes("function openCatalogCreator() {\n            switchMasterTab('equipment');"));
  assert(html.includes("customCatalogEntries = loadCustomCatalogEntries()"));
  assert(html.includes("...customCatalogEntries"));
});

test('escudo: modo de combate mantém o desenho e atualiza o nome acessível', () => {
  const button = document.getElementById('combat-mode-button');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert(button.querySelector('svg'));
  assert(html.includes("button.setAttribute('aria-pressed', String(combatModeEnabled))"));
  assert(html.includes("button.setAttribute('aria-label', actionLabel)"));
  assert(!html.includes("button.textContent = combatModeEnabled ? '⚔ MODO DE COMBATE"));
});
