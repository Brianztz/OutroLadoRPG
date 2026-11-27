const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const root = path.join(__dirname,'..');
const source = p=>fs.readFileSync(path.join(root,p),'utf8');
const worker = source('src/worker.js');
const master = source('public/mestre-temporada.html');
function compact() {
  const code = worker.replace(/^import .*;\r?\n/gm,'')
    .replace('export class TableRoom','class TableRoom')
    .replace('export default {','globalThis.worker = {');
  const ctx=vm.createContext({DurableObject:class{},TextEncoder,TextDecoder,
    crypto:webcrypto,Response,URL,console});
  vm.runInContext(code+'\nglobalThis.testCompact=compactPlayer;',ctx);
  return ctx.testCompact;
}
const compactPlayer=compact();
function packet(domains) {
  return {
    codigo:'VESTIGIOS-CLARA',mesa:'T2_VESTIGIOS',sheetType:'temporada',
    nome:'Clara',vida_atual:12,vida_max:22,
    fullData:{sheetType:'temporada',temporada:{state:{
      name:'Clara',origin:'Analista',occupation:'Acadêmico',
      attrs:{potencia:1},resources:{life:{current:12,max:22}},
      skillDomains:domains
    }}}
  };
}
test('persistência de perícias oficiais no cartão sem guardar ficha inteira',()=>{
  const record=compactPlayer(packet({
    'ANOMALIAS':6,'ATLETISMO':2,'INVESTIGAÇÃO':4,
    'RESISTÊNCIA':0,'INVÁLIDA':6,'OFÍCIO':-3,'TECNOLOGIA':100
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(record.exilioState.skillDomains)),{
    'ANOMALIAS':6,'ATLETISMO':2,'INVESTIGAÇÃO':4,'TECNOLOGIA':6
  });
  assert.equal(record.fullData,undefined);
  assert.equal(record.exilioState.resources.life.current,12);
  assert(!JSON.stringify(record).includes('INVÁLIDA'));
  assert(JSON.stringify(record).length<3000);
});
test('cartões offline persistem e aceitam mudança posterior de graduação',()=>{
  const old=compactPlayer({...packet({'INVESTIGAÇÃO':4}),online:false,openedByMaster:true});
  assert.equal(old.online,false);
  assert.equal(old.openedByMaster,true);
  assert.equal(old.exilioState.skillDomains['INVESTIGAÇÃO'],4);
  const newer=compactPlayer({...packet({'INVESTIGAÇÃO':6,'MEDICINA':2}),online:false,openedByMaster:true});
  assert.equal(newer.exilioState.skillDomains['INVESTIGAÇÃO'],6);
  assert.equal(newer.exilioState.skillDomains['MEDICINA'],2);
});
test('dados antigos com apenas skills continuam funcionando',()=>{
  const data=packet(null);
  delete data.fullData.temporada.state.skillDomains;
  data.fullData.temporada.state.skills={'CONFRONTO':2,'OFÍCIO':4};
  const record=compactPlayer(data);
  assert.equal(record.exilioState.skillDomains['CONFRONTO'],2);
  assert.equal(record.exilioState.skillDomains['OFÍCIO'],4);
});
const skillDef=master.match(/const EXILIO_MONSTER_SKILLS=([^;]+);/);
assert(skillDef);
const names=JSON.parse(skillDef[1]);
const start=master.indexOf('        function renderPlayerTrainedSkills(exilioState) {');
const end=master.indexOf('        function renderPlayer(rawData) {',start);
assert(start>=0 && end>start);
function renderer() {
  const ctx=vm.createContext({
    EXILIO_MONSTER_SKILLS:names,
    exilioInteger:v=>Number.isFinite(Number(v))?Math.trunc(Number(v)):0,
    escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  });
  const displayNames=master.match(/const exilioMonsterDisplayNames=[^;]+;/)?.[0];
  const displaySkill=master.match(/const displayExilioMonsterSkill=[^;]+;/)?.[0];
  assert(displayNames && displaySkill,'aliases de perícias devem existir');
  vm.runInContext(displayNames+'\n'+displaySkill+'\n'+master.slice(start,end),ctx);
  return vm.runInContext('renderPlayerTrainedSkills',ctx);
}
test('mostra nome, grau, bônus e ordem alfabética, sem perícias não treinadas',()=>{
  const html=renderer()({skillDomains:{
    'INVESTIGAÇÃO':4,'ANOMALIAS':6,'ATLETISMO':2,'CONFRONTO':0,'OUTRA':6
  }});
  assert(html.includes('PERÍCIAS TREINADAS'));
  assert(html.includes('exilio-trained-count">3'));
  assert(html.includes('ANOMALIAS</span><strong>+6</strong><small>REFERÊNCIA'));
  assert(html.includes('ATLETISMO</span><strong>+2</strong><small>PRATICANTE'));
  assert(html.includes('INVESTIGAÇÃO</span><strong>+4</strong><small>EXPERIENTE'));
  assert(!html.includes('CONFRONTO'));
  assert(!html.includes('OUTRA'));
  assert(html.indexOf('ANOMALIAS</span>')<html.indexOf('ATLETISMO</span>'));
  assert(html.indexOf('ATLETISMO</span>')<html.indexOf('INVESTIGAÇÃO</span>'));
});
test('nomes atualizados das perícias são exibidos sem perder as chaves salvas',()=>{
  const html=renderer()({skillDomains:{'DISCRIÇÃO':2,'PRECISÃO':4,'SENSIBILIDADE':6,'CRIME':2}});
  for(const name of ['FURTIVIDADE','PONTARIA','DISCERNIMENTO','CRIME'])assert(html.includes(name+'</span>'),name);
  assert(!html.includes('DISCRIÇÃO</span>'));
});
test('ausência de perícias não se confunde com ficha ainda não carregada',()=>{
  assert(renderer()({skillDomains:{}}).includes('Nenhuma perícia treinada.'));
  assert(renderer()({}).includes('Abra a ficha para carregar os dados de treinamento.'));
});
test('integrado aos cartões online, offline e ao resumo do Worker',()=>{
  assert(master.includes('const exilioTrainedSkills = renderPlayerTrainedSkills(exilioState);'));
  assert(master.includes('$'+'{exilioTrainedSkills}'));
  assert(master.includes('master-opened-offline'));
  assert(master.includes('.exilio-trained-chip'));
  assert(worker.includes('skillDomains: compactTrainedSkillDomains(st.skillDomains || st.skills)'));
});
test('scripts inline continuam sintaticamente válidos',()=>{
  const scripts=[...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(m=>m[1]).filter(Boolean);
  for(const [i,s] of scripts.entries())
    assert.doesNotThrow(()=>new vm.Script(s,{filename:'mestre-'+i+'.js'}));
});
