const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const bookSource=read('public/bestiary-exilio.js');
const master=read('public/mestre-temporada.html');
const integration=read('public/bestiary-exilio-master.js');
const browser={};
vm.runInNewContext(bookSource,{window:browser,Date,Math});
const api=browser.OLBestiary;
const names=[
  'O Rastejante','O Sussurrante','A Mulher sem Rosto','O Caçador do Escuro',
  'O Pavor Primordial','O Repetidor','A Criança Esquecida','A Mulher do Retrato',
  'O Colecionador de Rostos','O Arquivista Morto','O Retorcido','O Costurado',
  'O Esfolado','A Massa Faminta','O Coração Exposto','O Dobrador',
  'A Fenda Viva','O Homem Invertido','O Labirinto Andante',
  'A Geometria Impossível','O Estalador','A Voz que Volta','O Duplicado',
  'O Sino Vivo','A Última Frequência','O Apagado','O Sem-Nome',
  'O Devorador de Luz','O Observador Vazio','A Ausência Absoluta'
];
const matrixOrder=['Medo','Lembrança','Carne','Ruptura','Eco','Vazio'];
test('o catálogo contém exatamente as 30 manifestações do Capítulo 10 do Livro Exílio 3.0',()=>{
  assert(api);
  assert.equal(api.entries.length,30);
  assert.deepEqual(Array.from(api.entries,e=>e.name),names);
  assert.deepEqual(Array.from(api.matrices),matrixOrder);
  assert.equal(new Set(api.entries.map(e=>e.id)).size,30);
  for(let i=0;i<6;i++){
    const block=api.entries.slice(i*5,i*5+5);
    assert(block.every(e=>e.matrix===matrixOrder[i]));
  }
  assert(api.entries.every(e=>e.source.includes('Livro Básico')));
  assert(!api.entries.some(e=>['Sangue','Morte','Conhecimento','Energia'].includes(e.matrix)));
});
test('estatísticas NA, PV e RD conferem com as 30 fichas do livro',()=>{
  const na=[1,1,2,3,5,1,2,2,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5,1,2,3,4,5];
  const pv=[16,14,28,48,115,12,24,30,70,105,18,32,44,80,125,15,26,50,78,120,13,25,42,75,110,17,30,52,72,130];
  const rd=[0,0,1,2,4,0,0,1,2,3,0,1,2,3,4,0,1,2,3,4,0,0,1,2,3,0,1,2,2,4];
  const attack=[3,3,5,7,10,2,5,5,8,11,3,5,7,9,11,3,5,7,9,11,3,5,7,9,11,3,5,7,6,11];
  assert.deepEqual(Array.from(api.entries,e=>e.na),na);
  assert.deepEqual(Array.from(api.entries,e=>e.pv),pv);
  assert.deepEqual(Array.from(api.entries,e=>e.rd),rd);
  assert.deepEqual(Array.from(api.entries,e=>e.attackBonus),attack);
  assert(api.entries.every(e=>e.movement===6 && e.exposure.pm && e.damage && e.ability && e.weakness));
  for(const [i,e] of api.entries.entries()){
    assert.equal(e.order,i+1);
    assert.equal(e.tier,e.na);
    assert.equal(e.exposure.dt,e.na===1?11:e.na<=3?16:21);
  }
});
test('PM do livro é opcional; dano em PM permanece separado de dano nos PV',()=>{
  const pm=api.entries.filter(e=>e.pm!==null).map(e=>[e.name,e.pm]);
  assert.deepEqual(JSON.parse(JSON.stringify(pm)),[
    ['A Criança Esquecida',20],['A Mulher do Retrato',20],
    ['O Colecionador de Rostos',28],['O Arquivista Morto',32],
    ['O Sem-Nome',20],['O Devorador de Luz',24],
    ['O Observador Vazio',24],['A Ausência Absoluta',32]
  ]);
  for(const name of ['A Criança Esquecida','O Arquivista Morto','O Sem-Nome']){
    const e=api.entries.find(e=>e.name===name);
    assert.equal(e.damageType,'PM');
    const imported=api.makeMonster(e.id);
    assert.equal(imported.maxMental,e.pm);
    assert(imported.actions[0].description.includes('não PV'));
  }
  assert.equal(api.entries.find(e=>e.name==='O Rastejante').pm,null);
});
test('atributos, domínios e habilidades especiais são os do livro e não são escalados artificialmente',()=>{
  const rastejante=api.entries[0];
  assert.equal(rastejante.attrs.destreza,2);
  assert.equal(rastejante.domains.CONFRONTO,2);
  assert.equal(rastejante.domains.MOBILIDADE,2);
  const repetidor=api.entries.find(e=>e.name==='O Repetidor');
  assert.equal(repetidor.domains.CONFRONTO,1);
  const esfolado=api.entries.find(e=>e.name==='O Esfolado');
  assert.equal(esfolado.attrs.consciencia,1);
  assert(esfolado.weakness.includes('RD em 1'));
  const primordial=api.entries.find(e=>e.name==='O Pavor Primordial');
  assert.equal(primordial.domains.CONFRONTO,5);
  const observador=api.entries.find(e=>e.name==='O Observador Vazio');
  assert.equal(observador.attrs.potencia,2);
  assert.equal(observador.attrs.consciencia,4);
  assert.equal(observador.domains.CONFRONTO,4);
  assert.equal(observador.attackBonus,6);
  assert(observador.ability.includes('1d8 PM por 5PM'));
  assert.equal(api.entries.find(e=>e.name==='O Coração Exposto').pv,125);
});
test('importar gera cópia única, com Matriz, NA, PV, RD, fraquezas, exposição e ação editáveis',()=>{
  const entry=api.entries.find(e=>e.name==='A Mulher sem Rosto');
  const a=api.makeMonster(entry.id);
  const b=api.makeMonster(entry.id);
  assert.notEqual(a.id,b.id);
  assert.equal(a.matrix,'Medo');
  assert.equal(a.maxLife,28);
  assert.equal(a.resistance,'RD 1');
  assert.equal(a.move,6);
  assert.equal(a.bestiary.na,2);
  assert.equal(a.maxMental,0);
  assert.equal(a.presence,'Exposição Moderada · DT16 · 1d6 PM');
  assert.equal(a.actions[0].test,'Ataque +5');
  assert.equal(a.actions[0].damage,'1d8+2');
  assert.equal(a.actions[1].description,'Margem de acerto ≥5 aplica Confuso.');
  assert.equal(a.vulnerabilities,'Espelho com seu verdadeiro reflexo a desorienta.');
  a.attrs.destreza=8;
  a.actions[0].damage='20d10';
  assert.equal(b.attrs.destreza,2);
  assert.equal(b.actions[0].damage,'1d8+2');
  assert.equal(entry.attrs.destreza,2);
  assert.equal(api.makeMonster('exilio-999'),null);
});
test('o Bestiário fica como aba interna no pop-up Novo Monstro, sem perder o catálogo de equipamentos',()=>{
  assert(!master.includes('data-master-tab="catalog"'));
  assert(!master.includes('id="master-tab-catalog"'));
  assert(master.includes('id="monster-modal-form-panel"'));
  assert(master.includes('id="monster-modal-bestiary-panel"'));
  assert(master.includes('id="monster-modal-bestiary-tab"'));
  assert(master.includes('id="master-bestiary-library"'));
  assert(master.includes('id="master-tab-equipment"'));
  assert(master.includes('id="catalog-grid"'));
  assert(master.includes('switchMonsterModalTab(tab)'));
  assert.match(master,/<script src="\/bestiary-exilio\.js\?v=[^"\s]+"><\/script>/);
  assert(master.includes('<script src="/bestiary-exilio-master.js?v=monster-modal-v2"></script>'));
  assert(!master.includes('<script src="/bestiary-outrolado.js?v=2"></script>'));
  assert(master.includes('id="monsters-grid"'));
  assert(master.includes('Criaturas da mesa · Exílio 3.0'));
  assert(master.includes("monster.bestiary?.book ? 'NA '+monster.bestiary.na : 'IP '+monster.ip"));
  assert(master.includes("monster.bestiary?.book ? '—' : monster.defense"));
});
test('a interface de bestiário busca por Matriz e NA e importa para monstros ativos',()=>{
  assert.doesNotThrow(()=>new vm.Script(integration));
  assert(integration.includes('api.entries.filter'));
  assert(integration.includes('entry.matrix===matrix'));
  assert(integration.includes('entry.na===Number(na)'));
  assert(integration.includes('monstersState.push(monster)'));
  assert(integration.includes('saveMonstersState()'));
  assert(integration.includes('renderMonsters()'));
  assert(integration.includes('monstersState.pop()'));
  assert(integration.includes('FRAQUEZA'));
  assert(integration.includes('EXPOSIÇÃO'));
  assert(integration.includes('DOMÍNIOS'));
});
test('código inline do escudo permanece sintaticamente válido',()=>{
  const blocks=[...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(m=>m[1]).filter(Boolean);
  for(const [i,block] of blocks.entries())
    assert.doesNotThrow(()=>new vm.Script(block,{filename:'escudo-'+i}));
});
