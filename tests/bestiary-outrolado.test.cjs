const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const root=path.join(__dirname,'..');
const file=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const data=file('bestiary-exilio.js');
const browser=file('bestiary-exilio-master.js');
const screen='mestre-temporada.html';
function openPage() {
  const dom=new JSDOM(file(screen),{url:'https://example.test/'+screen,runScripts:'outside-only'});
  const w=dom.window;
  w.eval("var monstersState=[]; function saveMonstersState(){window.__saved=JSON.parse(JSON.stringify(monstersState))}; function renderMonsters(){window.__renders=(window.__renders||0)+1}");
  w.eval(data);
  w.eval(browser);
  return {dom,w};
}
test('escudo de Vestígios exibe biblioteca de 30 criaturas do livro Exílio 3.0',()=>{
  const html=file(screen);
  for(const id of ['master-bestiary-library','bestiary-search','bestiary-element',
    'bestiary-tier','bestiary-reference-grid','bestiary-results-count'])
    assert(html.includes('id="'+id+'"'),id+' ausente');
  assert.match(html,/bestiary-exilio\.js\?v=[^"\s]+/);
  assert(html.includes('bestiary-exilio-master.js?v=monster-modal-v2'));
  assert(html.includes('bestiary-outrolado.css?v=monster-modal-v2'));
  assert(html.includes('📖 BESTIÁRIO'));
  assert(html.includes('master-theme.css?v=exilio-3-escudo-v5'));
});
test('as criaturas do livro possuem ficha Exílio completa e importável',()=>{
  const {w,dom}=openPage();
  try {
    const entries=w.OLBestiary.entries;
    assert.equal(entries.length,30);
    assert.equal(new Set(entries.map(item=>item.id)).size,30);
    for(const entry of entries) {
      const m=w.OLBestiary.makeMonster(entry.id,'sample_'+entry.id);
      assert.equal(m.name,entry.name);
      assert(m.maxLife>=1);
      assert.deepEqual(Object.keys(m.attrs).sort(),
        ['potencia','destreza','constituicao','raciocinio','consciencia','expressao'].sort());
      assert.equal(m.matrix,entry.matrix);
      assert.equal(m.bestiary.na,entry.na);
      assert.equal(m.resistance,'RD '+entry.rd);
      assert(m.actions.length>=2);
      assert.equal(m.actions[0].test,'Ataque +'+entry.attackBonus);
      assert.equal(m.actions[0].damage,entry.damage);
      assert.equal(m.actions[1].description,entry.ability);
      assert(m.bestiary.book);
      assert.equal(m.vulnerabilities,entry.weakness);
      assert(m.presence.includes('DT'+entry.exposure.dt));
    }
  }finally{dom.window.close();}
});
test('pesquisa e filtros encontram nomes, habilidades, Matrizes e Níveis de Ameaça',()=>{
  const {w,dom}=openPage();
  try {
    const doc=w.document,search=doc.getElementById('bestiary-search');
    assert.match(doc.getElementById('bestiary-results-count').textContent,/30/);
    assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,12);
    search.value='teleporte';
    search.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,1);
    assert(doc.querySelector('.bestiary-reference-name').textContent.includes('Fenda Viva'));
    search.value='';
    search.dispatchEvent(new w.Event('input',{bubbles:true}));
    const matrix=doc.getElementById('bestiary-element');
    matrix.value='Medo';
    matrix.dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,5);
    const na=doc.getElementById('bestiary-tier');
    na.value='1';
    na.dispatchEvent(new w.Event('change',{bubbles:true}));
    assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,2);
    matrix.value='';na.value='';
    na.dispatchEvent(new w.Event('change',{bubbles:true}));
    doc.getElementById('bestiary-load-more').click();
    assert.equal(doc.querySelectorAll('.bestiary-reference-card').length,24);
  }finally{dom.window.close();}
});
test('adicionar ao escudo importa cópias independentes sem sobrescrever a fonte',()=>{
  const {w,dom}=openPage();
  try {
    const doc=w.document,search=doc.getElementById('bestiary-search');
    search.value='O Retorcido';
    search.dispatchEvent(new w.Event('input',{bubbles:true}));
    const button=doc.querySelector('.bestiary-reference-import');
    assert(button);
    button.click();
    assert.equal(w.__saved.length,1);
    assert.equal(w.__saved[0].name,'O Retorcido');
    assert(w.__renders>=1);
    assert(w.__saved[0].bestiary.book);
    assert.equal(w.__saved[0].actions.length,2);
    button.click();
    assert.equal(w.__saved.length,2);
    assert.notEqual(w.__saved[0].id,w.__saved[1].id);
    assert.equal(w.OLBestiary.entries.find(e=>e.name==='O Retorcido').pv,18);
  }finally{dom.window.close();}
});
test('rolagens de criatura seguem 2d10 + modificador do Exílio',()=>{
  const html=file(screen);
  const begin=html.indexOf('function rollExilioMonsterDice(');
  const end=html.indexOf('function monsterSkillModifier(',begin);
  assert(begin>0&&end>begin);
  const factory=new Function('exilioInteger',html.slice(begin,end)+';return rollExilioMonsterDice;');
  const roll=factory(value=>Number(value)||0);
  const seq=[0.1,0.6];
  let idx=0;
  const outcome=roll(3,()=>seq[(idx++)%seq.length]);
  assert.deepEqual(outcome.dice,[2,7]);
  assert.equal(outcome.value,12);
  assert.equal(outcome.result,'NORMAL');
});
test('habilidades e fraquezas são as do Livro Exílio, sem criaturas de outro sistema',()=>{
  const {w,dom}=openPage();
  try {
    const checks={
      'O Pavor Primordial':'Apavorado',
      'A Mulher do Retrato':'Confuso',
      'O Coração Exposto':'Regenera 1d6 PV',
      'O Labirinto Andante':'Forma parede',
      'A Última Frequência':'Confuso em raio de 3m',
      'O Observador Vazio':'Ataques mentais +8'
    };
    for(const [name,ability] of Object.entries(checks)){
      const e=w.OLBestiary.entries.find(item=>item.name===name);
      assert(e,name+' ausente');
      assert(e.ability.includes(ability));
      const m=w.OLBestiary.makeMonster(e.id);
      assert(m.actions[1].description.includes(ability));
      assert.equal(m.actions[1].damage,'');
    }
    assert(!w.OLBestiary.entries.some(e=>e.name==='Zumbi de Sangue'));
  }finally{dom.window.close();}
});
