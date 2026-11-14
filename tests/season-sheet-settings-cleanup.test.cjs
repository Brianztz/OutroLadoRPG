const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('painel de ajustes nao inclui ocupacao duplicada nem troca ou restauracao de fundo', () => {
  const html = read('public/ficha-temporada.html');
  const js = read('public/temporada/sheet.js');
  const css = read('public/temporada/v3-atributos.css');
  for(const control of [
    'panel-occupation',
    'exilio-background-choose',
    'exilio-background-clear',
    'exilio-background-file',
    'exilio-art-controls'
  ]) {
    assert(!html.includes(control), control + ' ainda no HTML');
    assert(!js.includes(control), control + ' ainda no JavaScript');
    assert(!css.includes(control), control + ' ainda no CSS');
  }
  assert(!html.includes('TROCAR FUNDO'));
  assert(!html.includes('RESTAURAR FUNDO'));
  assert(!html.includes('O fundo enviado já está aplicado'));
  assert(!js.includes('keepLegacyOccupation'));
  assert(!js.includes('occupationPanelSelect'));
});

test('selecionar ocupacao na ficha e preservar background salvo continuam funcionando', () => {
  const html = read('public/ficha-temporada.html');
  const js = read('public/temporada/sheet.js');
  assert(html.includes('id="char-occupation"'));
  assert(html.includes('id="occupation-dialog"'));
  assert(html.includes('id="occupation-list"'));
  assert(js.includes("'char-occupation').addEventListener('click'"));
  assert(js.includes("const choose=(name)=>{state.occupation=name;display();save();$('occupation-dialog').close();};"));
  assert(js.includes('reconcileOccupationSkillDomains()'));
  assert(js.includes("state.exilioBackgroundVersion==='20261110'"));
  assert(js.includes('appliedSeasonBackground=picture'));
  assert(html.includes('id="photo-panel-add"'));
  assert(html.includes('id="close-panel"'));
});
