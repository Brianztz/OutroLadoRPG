const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('public/mestre-temporada.html');
const theme = read('public/temporada/master-theme.css');
const bestiaryCss = read('public/bestiary-outrolado.css');

function modalPage() {
  const dom = new JSDOM(html, { url: 'https://example.test/mestre-temporada.html' });
  const { document } = dom.window;
  const start = html.indexOf('function switchMonsterModalTab(');
  const end = html.indexOf('function closeMonsterPopup(', start);
  assert(start > 0 && end > start);
  let rendered = 0;
  dom.window.renderExilioBestiary = () => { rendered++; };
  const methods = new Function('document', 'window', html.slice(start, end) +
    '; return { switchMonsterModalTab, handleMonsterModalTabs };')(document, dom.window);
  return { dom, document, methods, getRendered: () => rendered };
}

test('Bestiário é uma aba do popup Novo Monstro e não uma aba da navegação principal', () => {
  const { dom, document } = modalPage();
  try {
    const nav = document.querySelector('.master-tabs');
    const popup = document.getElementById('monster-modal');
    const tabs = popup.querySelector('.monster-modal-tabs');
    const form = document.getElementById('monster-modal-form-panel');
    const bestiary = document.getElementById('monster-modal-bestiary-panel');
    assert(nav.querySelector('[data-master-tab="monsters"]'));
    assert.equal(nav.querySelector('[data-master-tab="catalog"]'), null);
    assert.equal(document.getElementById('master-tab-catalog'), null);
    assert(tabs && tabs.getAttribute('role') === 'tablist');
    assert(form && bestiary);
    assert(bestiary.contains(document.getElementById('master-bestiary-library')));
    assert(bestiary.contains(document.getElementById('bestiary-search')));
    assert(bestiary.contains(document.getElementById('bestiary-reference-grid')));
    assert.equal(form.querySelector('.monster-save-button').getAttribute('onclick'), 'saveMonsterFromPopup()');
    assert(bestiary.hidden);
    assert(!form.hidden);
    assert(document.getElementById('master-tab-equipment'));
  } finally { dom.window.close(); }
});

test('alternância das abas muda visibilidade, seleção acessível e renderiza o Bestiário', () => {
  const { dom, document, methods, getRendered } = modalPage();
  try {
    methods.switchMonsterModalTab('bestiary');
    assert.equal(document.getElementById('monster-modal-form-panel').hidden, true);
    assert.equal(document.getElementById('monster-modal-bestiary-panel').hidden, false);
    assert.equal(document.getElementById('monster-modal-bestiary-tab').getAttribute('aria-selected'), 'true');
    assert.equal(document.getElementById('monster-modal-form-tab').getAttribute('aria-selected'), 'false');
    assert.equal(getRendered(), 1);
    methods.switchMonsterModalTab('form');
    assert.equal(document.getElementById('monster-modal-form-panel').hidden, false);
    assert.equal(document.getElementById('monster-modal-bestiary-panel').hidden, true);
    assert.equal(getRendered(), 1);
    let prevented = false;
    methods.handleMonsterModalTabs({
      key: 'ArrowRight',
      target: document.getElementById('monster-modal-form-tab'),
      preventDefault() { prevented = true; }
    });
    assert(prevented);
    assert.equal(document.getElementById('monster-modal-bestiary-tab').getAttribute('aria-selected'), 'true');
  } finally { dom.window.close(); }
});

test('fichas de criaturas e Bestiário usam visual por Matriz sem remover ações', () => {
  assert(html.includes("card.dataset.matrix=monster.matrix||''"));
  assert(html.includes('monster-card-core'));
  assert(html.includes('monster-traits'));
  assert(html.includes('monster-actions-summary'));
  assert(html.includes('monster-current-life'));
  assert(html.includes('monster-current-mental'));
  assert(html.includes('monster-edit'));
  assert(html.includes('monster-remove'));
  assert(html.includes('monster-attribute'));
  assert(html.includes('monster-skill-chip'));
  assert(html.includes('action-attack-roll'));
  assert(html.includes('action-damage-roll'));
  assert(theme.includes('.monster-modal-tabs'));
  assert(theme.includes('.monster-modal-panel[hidden]'));
  assert(theme.includes('.monster-card-sigil'));
  assert(theme.includes('[data-matrix="Carne"]'));
  assert(bestiaryCss.includes('#monster-modal-bestiary-panel .bestiary-book-card'));
  assert(bestiaryCss.includes('[data-matrix="Vazio"]'));
  assert(!bestiaryCss.includes('#master-tab-catalog'));
});
