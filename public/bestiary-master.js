/* Integração do catálogo de referência no Escudo do Mestre.
   Os modelos só entram nos monstros ATIVOS quando o Mestre clica importar.
   A primeira e a segunda temporada conservam cada uma seu localStorage. */
(function(){
  'use strict';
  const api=window.OLBestiary;
  const container=document.getElementById('master-bestiary-library');
  if(!api||!container)return;
  const search=document.getElementById('bestiary-search');
  const elementSelect=document.getElementById('bestiary-element');
  const sourceSelect=document.getElementById('bestiary-source');
  const tierSelect=document.getElementById('bestiary-tier');
  const resultCount=document.getElementById('bestiary-results-count');
  const list=document.getElementById('bestiary-reference-grid');
  const more=document.getElementById('bestiary-load-more');
  const status=document.getElementById('bestiary-import-status');
  const pageSize=24;
  let page=1;
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const makeOption=(value,label)=>{
    const node=document.createElement('option');
    node.value=value;node.textContent=label;
    return node;
  };
  for(const element of api.elements) elementSelect.append(makeOption(element,element));
  for(const source of api.sources) sourceSelect.append(makeOption(source,source));
  for(let tier=1;tier<=5;tier++) tierSelect.append(makeOption(String(tier),api.tierName(tier)));

  function makeCard(entry){
    const sample=api.makeMonster(entry.id,'preview');
    const card=document.createElement('article');
    card.className='bestiary-reference-card';
    const title=document.createElement('strong');
    title.className='bestiary-reference-name';title.textContent=entry.name;
    const category=document.createElement('span');
    category.className='bestiary-reference-element';
    category.textContent=entry.element;
    category.dataset.element=entry.element;
    const tags=document.createElement('div');
    tags.className='bestiary-reference-tags';
    tags.append(category);
    const badge=document.createElement('span');badge.textContent=api.tierName(entry.tier);
    tags.append(badge);
    const source=document.createElement('small');
    source.className='bestiary-reference-origin';source.textContent=entry.source;
    const stat=document.createElement('p');
    stat.className='bestiary-reference-stats';
    stat.textContent='PV '+sample.maxLife+' · '+sample.resistance+' · '+sample.actions[0].name+' '+sample.actions[0].damage;
    const button=document.createElement('button');
    button.type='button';
    button.className='bestiary-reference-import';
    button.textContent='＋ ADICIONAR À MESA';
    button.setAttribute('aria-label','Adicionar '+entry.name+' aos monstros ativos');
    button.addEventListener('click',()=>{
      // Não altera a biblioteca; cria uma cópia editável/independente.
      const monster=api.makeMonster(entry.id);
      if(!monster)return;
      monstersState.push(monster);
      try{
        saveMonstersState();
        renderMonsters();
      }catch(error){
        monstersState.pop();
        status.textContent='Erro ao adicionar '+entry.name+': '+String(error.message||error);
        return;
      }
      status.textContent=entry.name+' adicionado à mesa. Role dados e edite os valores no painel abaixo.';
      button.textContent='✓ ADICIONADO — IMPORTAR OUTRO';
    });
    card.append(title,tags,source,stat,button);
    return card;
  }

  function render(){
    const name=normalized(search.value);
    const element=elementSelect.value,source=sourceSelect.value,tier=tierSelect.value;
    const matching=api.entries.filter(entry=>
      (!name || normalized(entry.name+' '+entry.source+' '+entry.element).includes(name))
      && (!element || entry.element===element)
      && (!source || entry.source===source)
      && (!tier || entry.tier===Number(tier))
    );
    resultCount.textContent=matching.length+' criaturas encontradas · '+api.entries.length+' referências disponíveis';
    list.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const entry of matching.slice(0,page*pageSize)) fragment.append(makeCard(entry));
    list.append(fragment);
    more.hidden=matching.length<=page*pageSize;
    if(!matching.length){
      const empty=document.createElement('p');
      empty.className='bestiary-reference-empty';
      empty.textContent='Nenhuma criatura encontrada. Experimente outro nome ou remova os filtros.';
      list.append(empty);
    }
  }
  const reset=()=>{page=1;render();};
  search.addEventListener('input',reset);
  elementSelect.addEventListener('change',reset);
  sourceSelect.addEventListener('change',reset);
  tierSelect.addEventListener('change',reset);
  more.addEventListener('click',()=>{page+=1;render();});
  container.querySelector('summary').setAttribute('aria-label','Mostrar ou ocultar o catálogo de criaturas do Outro Lado');
  render();
})();
