/* Catálogo consultável do Capítulo 10 do Livro Básico do Exílio 3.0.
   O bestiário fonte é estático; somente a cópia importada entra em monstersState. */
(function(){
  'use strict';
  const api=window.OLBestiary;
  const container=document.getElementById('master-bestiary-library');
  if(!api || !container)return;
  const search=document.getElementById('bestiary-search');
  const matrixSelect=document.getElementById('bestiary-element');
  const naSelect=document.getElementById('bestiary-tier');
  const count=document.getElementById('bestiary-results-count');
  const list=document.getElementById('bestiary-reference-grid');
  const more=document.getElementById('bestiary-load-more');
  const status=document.getElementById('bestiary-import-status');
  const pageSize=12;
  let page=1;
  const normalize=value=>String(value||'').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const element=(tag,cls,value)=>{
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  };
  const option=(value,label)=>{
    const el=document.createElement('option');
    el.value=value;el.textContent=label;
    return el;
  };
  for(const matrix of api.matrices)
    matrixSelect.append(option(matrix,matrix));
  for(let na=1;na<=5;na++)
    naSelect.append(option(String(na),api.tierName(na)));
  const attrLabels={
    potencia:'POT',destreza:'DES',constituicao:'CON',
    raciocinio:'RAC',consciencia:'CNS',expressao:'EXP'
  };
  const title=(label,body)=>{
    const line=element('p','bestiary-book-field');
    line.append(element('strong','',label),document.createTextNode(' '+body));
    return line;
  };
  function makeCard(entry){
    const card=element('article','bestiary-reference-card bestiary-book-card');
    card.dataset.entryId=entry.id;
    const header=element('div','bestiary-book-heading');
    const index=element('span','bestiary-book-index',String(entry.order).padStart(2,'0'));
    const name=element('h3','bestiary-reference-name',entry.name);
    header.append(index,name);
    const tags=element('div','bestiary-reference-tags');
    const matrix=element('span','bestiary-reference-element',entry.matrix);
    matrix.dataset.element=entry.matrix;
    tags.append(matrix,element('span','','NA '+entry.na+' · '+api.tiers[entry.na]));
    const stats=element('div','bestiary-book-stats');
    for(const [label,value] of [
      ['PV',entry.pv],['PM',entry.pm===null?'—':entry.pm],
      ['RD',entry.rd],['MOV',entry.movement+'m']]){
      const block=element('span','bestiary-book-stat');
      block.append(element('small','',label),element('strong','',value));
      stats.append(block);
    }
    const attack=title('ATAQUE','2d10 + '+entry.attackBonus+
      ' · '+entry.damage+' '+entry.damageType+' · corpo a corpo 2m');
    const ability=title('HABILIDADE',entry.ability);
    const weakness=title('FRAQUEZA',entry.weakness);
    weakness.classList.add('bestiary-book-weakness');
    const exposure=title('EXPOSIÇÃO',entry.exposure.level+' · DT'+entry.exposure.dt+
      ' · '+entry.exposure.pm+' PM');
    const details=element('details','bestiary-book-more');
    details.append(element('summary','','ATRIBUTOS E DOMÍNIOS'));
    const detailContent=element('div','bestiary-book-detail-content');
    const attributes=Object.entries(attrLabels).map(([key,label])=>
      label+' '+(entry.attrs[key]>=0?'+':'')+entry.attrs[key]).join(' · ');
    const domains=Object.entries(entry.domains).map(([key,value])=>
      key+' '+(value>=0?'+':'')+value).join(' · ');
    detailContent.append(title('ATRIBUTOS',attributes),title('DOMÍNIOS',domains));
    details.append(detailContent);
    const button=element('button','bestiary-reference-import','＋ ADICIONAR À MESA');
    button.type='button';
    button.setAttribute('aria-label','Adicionar '+entry.name+' aos monstros da mesa');
    button.addEventListener('click',()=>{
      // Each click creates a fresh monster. An existing instance and the
      // official template must never be overwritten by another import.
      const monster=api.makeMonster(entry.id);
      if(!monster)return;
      if(typeof monstersState==='undefined'||typeof saveMonstersState!=='function'){
        status.textContent='Não foi possível localizar os monstros da mesa.';
        return;
      }
      monstersState.push(monster);
      try{
        saveMonstersState();
        renderMonsters();
      }catch(error){
        monstersState.pop();
        status.textContent='Erro ao adicionar '+entry.name+': '+String(error?.message||error);
        return;
      }
      status.textContent=entry.name+' foi adicionado às suas criaturas na aba MONSTROS.';
      button.textContent='✓ ADICIONADO · ADICIONAR OUTRO';
    });
    card.append(header,tags,stats,attack,ability,weakness,exposure,details,button);
    return card;
  }
  function render(){
    const words=normalize(search.value);
    const matrix=matrixSelect.value,na=naSelect.value;
    const found=api.entries.filter(entry=>
      (!words||normalize([
        entry.name,entry.matrix,entry.ability,entry.weakness
      ].join(' ')).includes(words))
      && (!matrix||entry.matrix===matrix)
      && (!na||entry.na===Number(na))
    );
    count.textContent=found.length+' criaturas encontradas · '+
      api.entries.length+' manifestações no Livro Exílio 3.0';
    list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const entry of found.slice(0,page*pageSize))
      fragment.append(makeCard(entry));
    list.append(fragment);
    more.hidden=found.length<=page*pageSize;
    if(!found.length){
      list.append(element('p','bestiary-reference-empty',
        'Nenhuma criatura encontrada. Tente outra Matriz, NA ou nome.'));
    }
  }
  const reset=()=>{page=1;render();};
  search.addEventListener('input',reset);
  matrixSelect.addEventListener('change',reset);
  naSelect.addEventListener('change',reset);
  more.addEventListener('click',()=>{page++;render();});
  container.querySelector('summary').setAttribute('aria-label',
    'Mostrar ou ocultar o bestiário oficial do Livro Exílio 3.0');
  window.renderExilioBestiary=render;
  render();
})();
