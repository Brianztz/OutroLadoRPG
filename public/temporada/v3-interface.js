/* Exílio 3.0: interface nova, exclusiva de ficha-temporada.html.
 * A ficha original Outro Lado não importa este arquivo.
 */
(function(global){
'use strict';
if(!document.body.classList.contains('season-rulebook-v3'))return;
const root=document.getElementById('exilio-v3-ui');
if(!root)return;
const $=id=>document.getElementById(id);
const attrs={potencia:'Potência',destreza:'Destreza',constituicao:'Constituição',raciocinio:'Raciocínio',consciencia:'Consciência',expressao:'Expressão'};
const skills=[
 ['Atletismo','potencia'],['Confronto','potencia'],['Precisão','destreza'],['Mobilidade','destreza'],
 ['Discrição','destreza'],['Resistência','constituicao'],['Observação','consciencia'],
 ['Investigação','raciocinio'],['Conhecimento','raciocinio'],['Tecnologia','raciocinio'],
 ['Medicina','raciocinio'],['Influência','expressao'],['Sensibilidade','consciencia'],
 ['Sobrevivência','consciencia'],['Ofício','raciocinio'],['Anomalias','consciencia']
];
const classGain={mundano:[0,0],vanguarda:[5,3],analista:[3,5],canalizador:[2,6]};
const statLabel={pv:'Pontos de Vida',pm:'Pontos Mentais'};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(n))?Math.trunc(Number(n)):min));
const rollDice=(n,sides)=>Array.from({length:n},()=>1+Math.floor(Math.random()*sides));
const total=arr=>arr.reduce((a,b)=>a+b,0);
const rank=n=>n>=21?'EXTREMO':n>=16?'BOM':n>=11?'NORMAL':'FALHA';
const defaults=()=>({ip:0,classe:'mundano',domains:{},tests:{},combat:{rd:0,melee:'potencia'},
 pv:{dice:null,con:0,cns:0,bonus:0,max:null,current:null},
 pm:{dice:null,con:0,cns:0,bonus:0,max:null,current:null}});
let ready=false,lastResult=null;
const resource=(value)=>{const x=value&&typeof value==='object'?value:{};return {
 dice:Array.isArray(x.dice)&&x.dice.length===3?x.dice.map(d=>clamp(d,1,6)):null,
 con:clamp(x.con,-1,5),cns:clamp(x.cns,-1,5),bonus:clamp(x.bonus,0,6),
 max:x.max===null||x.max===undefined?null:clamp(x.max,0,9999),
 current:x.current===null||x.current===undefined?null:clamp(x.current,0,9999)
};};
function current(){
 const sheet=global.SeasonSheet.getState(),d=defaults(),v=sheet.exilio3||{};
 const ex={...d,...v};ex.ip=clamp(ex.ip,0,10);
 ex.classe=Object.prototype.hasOwnProperty.call(classGain,ex.classe)?ex.classe:'mundano';
 ex.domains={...(v.domains||{})};ex.tests={...(v.tests||{})};
 ex.combat={...d.combat,...(v.combat||{})};
 ex.combat.rd=clamp(ex.combat.rd,0,4);
 ex.combat.melee=ex.combat.melee==='destreza'?'destreza':'potencia';
 ex.pv=resource(v.pv);ex.pm=resource(v.pm);
 return {sheet,ex};
}
function resourceMaximum(key,ex){
 const r=ex[key];if(!r.dice)return null;
 const initial=key==='pv'?8+2*r.con:14+2*r.cns;
 const gain=classGain[ex.classe][key==='pv'?0:1];
 return Math.max(1,total(r.dice)+initial+ex.ip*gain+r.bonus);
}
function recalc(ex){
 for(const key of ['pv','pm']){
  const r=ex[key],prior=r.max,newMax=resourceMaximum(key,ex);
  r.max=newMax;
  if(newMax===null){r.current=null;continue;}
  if(r.current===null)r.current=newMax;
  else if(prior!==null&&newMax<prior)r.current=Math.min(r.current,newMax);
  r.current=clamp(r.current,0,newMax);
 }
}
function save(edit){
 const {sheet,ex}=current();
 edit(ex,sheet);recalc(ex);sheet.exilio3=ex;
 global.SeasonSheet.applyState(sheet);
}
function notify(message){
 const el=$('v3-roll-result');el.textContent=message;
 el.classList.remove('v3-flash');void el.offsetWidth;el.classList.add('v3-flash');
}
function build(){
 root.innerHTML=[
 '<section class="v3-top-bar" aria-label="Identificação e progressão">',
 '<label class="v3-field v3-name-field">PERSONAGEM<input id="v3-char-name" type="text" maxlength="35" placeholder="Nome do personagem"></label>',
 '<label class="v3-field">CLASSE<select id="v3-class"><option value="mundano">Mundano</option><option value="vanguarda">Vanguarda</option><option value="analista">Analista</option><option value="canalizador">Canalizador</option></select></label>',
 '<div class="v3-ip-control"><span>IP</span><button type="button" data-ip="-1">−</button><strong id="v3-ip-value">0</strong><button type="button" data-ip="1">+</button></div>',
 '<output id="v3-budget" title="6 pontos iniciais; +1 atributo nos IP 3, 6 e 9">ATRIBUTOS 0 / 6</output>',
 '</section>',
 '<section class="v3-resource v3-resource-pv" aria-label="Pontos de Vida">',
 '<div class="v3-resource-numbers"><button type="button" data-resource="pv" data-delta="-1" aria-label="Diminuir PV">−</button><strong id="v3-pv-current">—</strong><span>/</span><span id="v3-pv-max">—</span><button type="button" data-resource="pv" data-delta="1" aria-label="Aumentar PV">+</button></div>',
 '<div class="v3-resource-actions"><button type="button" data-generate="pv">GERAR 3d6</button><button type="button" data-stat-bonus="pv" title="CON +1 numa progressão concede +2 PV máximos">CON +2</button></div>',
 '</section>',
 '<section class="v3-resource v3-resource-pm" aria-label="Pontos Mentais">',
 '<div class="v3-resource-numbers"><button type="button" data-resource="pm" data-delta="-1" aria-label="Diminuir PM">−</button><strong id="v3-pm-current">—</strong><span>/</span><span id="v3-pm-max">—</span><button type="button" data-resource="pm" data-delta="1" aria-label="Aumentar PM">+</button></div>',
 '<div class="v3-resource-actions"><button type="button" data-generate="pm">GERAR 3d6</button><button type="button" data-stat-bonus="pm" title="CNS +1 numa progressão concede +2 PM máximos">CNS +2</button></div>',
 '</section>',
 '<section class="v3-skills" aria-label="Dezesseis perícias do Exílio">',
 '<p class="v3-section-intro">2d10 + ATRIBUTO + DOMÍNIO · 0 / +2 / +4 / +6</p>',
 '<div id="v3-domains" class="v3-domain-grid"></div>',
 '</section>',
 '<section class="v3-combat" aria-label="Combate Exílio 3.0">',
 '<p class="v3-combat-note">TESTE OPOSTO · EMPATE FAVORECE DEFENSOR</p>',
 '<label class="v3-field v3-melee-attr">CORPO A CORPO<select id="v3-melee-attr"><option value="potencia">POTÊNCIA</option><option value="destreza">DESTREZA</option></select></label>',
 '<div class="v3-combat-actions">',
 '<button type="button" data-combat="initiative">INICIATIVA <small>DES + MOBILIDADE</small></button>',
 '<button type="button" data-combat="melee">ATACAR · CORPO A CORPO <small>POT/DES + CONFRONTO</small></button>',
 '<button type="button" data-combat="ranged">ATACAR · DISTÂNCIA <small>DES + PRECISÃO</small></button>',
 '<button type="button" data-combat="dodge">ESQUIVA <small>DES + MOBILIDADE</small></button>',
 '<button type="button" data-combat="parry">APARAR <small>POT/DES + CONFRONTO</small></button>',
 '<button type="button" data-combat="counter">CONTRA-ATACAR <small>POT/DES + CONFRONTO</small></button>',
 '<button type="button" data-combat="block">BLOQUEIO <small>RD + RESISTÊNCIA · SEM ROLAGEM</small></button>',
 '<button type="button" data-combat="sanity">EXPOSIÇÃO MENTAL <small>CNS + RESISTÊNCIA</small></button>',
 '</div>',
 '<div class="v3-rd"><span>RD EQUIPADA</span><button type="button" data-rd="-1">−</button><strong id="v3-rd-value">0</strong><button type="button" data-rd="1">+</button></div>',
 '<p class="v3-combat-note">1 AÇÃO · 6m · 1 REAÇÃO · SEM DEFESA FIXA</p>',
 '</section>',
 '<aside class="v3-roll-output" aria-live="polite"><span class="v3-roll-heading">RESULTADO</span><div id="v3-roll-result">Escolha uma perícia ou ação para rolar 2d10.</div></aside>'
 ].join('');
 const grid=$('v3-domains');
 for(const [name,suggested] of skills){
  const row=document.createElement('div');row.className='v3-domain-row';row.dataset.domain=name;
  const label=document.createElement('span');label.className='v3-domain-name';label.textContent=name;
  const grade=document.createElement('button');grade.type='button';grade.className='v3-domain-grade';
  grade.dataset.grade=name;grade.title='Aumentar domínio (botão direito diminui)';
  const select=document.createElement('select');select.className='v3-domain-attr';
  select.dataset.attribute=name;select.setAttribute('aria-label','Atributo para '+name);
  for(const [key,title] of Object.entries(attrs)){
   const opt=document.createElement('option');opt.value=key;opt.textContent=title;select.append(opt);
  }
  select.value=suggested;
  const rollButton=document.createElement('button');rollButton.type='button';rollButton.className='v3-domain-roll';
  rollButton.dataset.rollDomain=name;rollButton.textContent='⚄';rollButton.title='Rolar '+name;
  row.append(label,grade,select,rollButton);grid.append(row);
 }
}
function render(){
 if(!ready)return;
 const {sheet,ex}=current(),input=$('v3-char-name');
 if(document.activeElement!==input)input.value=sheet.name||'';
 $('v3-ip-value').textContent=ex.ip;
 $('v3-class').disabled=ex.ip===0;
 $('v3-class').value=ex.ip===0?'mundano':ex.classe;
 const spent=Object.keys(attrs).reduce((n,key)=>n+clamp(sheet.attrs?.[key]||0,-1,5),0);
 const max=6+[3,6,9].filter(n=>ex.ip>=n).length;
 $('v3-budget').textContent='ATRIBUTOS '+spent+' / '+max;
 $('v3-budget').dataset.over=String(spent>max);
 for(const key of ['pv','pm']){
  $('v3-'+key+'-current').textContent=ex[key].current===null?'—':ex[key].current;
  $('v3-'+key+'-max').textContent=ex[key].max===null?'—':ex[key].max;
  root.querySelector('[data-generate="'+key+'"]').textContent=ex[key].dice?'ROLAR DE NOVO':'GERAR 3d6';
 }
 $('v3-pm-current').classList.toggle('v3-warning',ex.pm.max!==null&&ex.pm.current<=ex.pm.max*.25);
 $('v3-rd-value').textContent=ex.combat.rd;
 $('v3-melee-attr').value=ex.combat.melee;
 for(const row of $('v3-domains').children){
  const name=row.dataset.domain,level=clamp(ex.domains[name]||0,0,6);
  row.querySelector('.v3-domain-grade').textContent='+'+level;
  row.querySelector('.v3-domain-attr').value=ex.tests[name]||skills.find(x=>x[0]===name)[1];
 }
}
function roll({name,attribute,domain='',type='test'}){
 const {sheet,ex}=current();
 const d=rollDice(2,10),a=clamp(sheet.attrs?.[attribute]||0,-1,5),bonus=clamp(ex.domains[domain]||0,0,6);
 const n=total(d)+a+bonus,grade=rank(n);
 const message=name+' · '+d.join(' + ')+' + ('+a+') + '+bonus+' = '+n+' · '+grade+
 (type==='opposed'?' · empate favorece o defensor':'')+
 (type==='attack'&&d[0]===d[1]?' · dados iguais: +1 dado de dano da arma SE acertar':'');
 lastResult={dice:d,total:n,grade,text:message};
 notify(message);
 global.dispatchEvent(new CustomEvent('season:roll',{detail:{pool:{dice:d,value:n,lowest:false,detail:message},label:grade,name}}));
 return lastResult;
}
function rollAttribute(key){if(Object.prototype.hasOwnProperty.call(attrs,key))return roll({name:attrs[key],attribute:key});}
function generateResource(key){
 const {sheet,ex}=current();
 if(ex[key].dice&&!global.confirm('Rolar '+statLabel[key]+' novamente e substituir o valor inicial?'))return;
 const d=rollDice(3,6);
 save((next)=>{
  next[key]={...next[key],dice:d,con:clamp(sheet.attrs?.constituicao||0,-1,5),
   cns:clamp(sheet.attrs?.consciencia||0,-1,5),max:null,current:null};
 });
 const after=current().ex;
 notify(statLabel[key]+': 3d6 ['+d.join(', ')+'] · máximo '+after[key].max);
}
function changeDomain(name,delta){
 const {ex}=current(),before=clamp(ex.domains[name]||0,0,6),next=clamp(before+2*delta,0,6);
 if(before===next)return;
 if(next===4&&ex.ip<4){notify('Experiente exige IP 4.');return;}
 if(next===6&&ex.ip<7){notify('Referência exige IP 7.');return;}
 if(next===6&&Object.values(ex.domains).filter(v=>Number(v)===6).length>=2){
  notify('No máximo dois Domínios em Referência.');return;
 }
 if(ex.ip===0&&before===0&&next===2&&Object.values(ex.domains).filter(v=>Number(v)>=2).length>=4){
  notify('IP 0: dois Domínios da ocupação e dois livres, no máximo quatro Praticantes iniciais.');return;
 }
 save(nextState=>{nextState.domains[name]=next;});
}
function combat(action){
 const {ex}=current();
 if(action==='block'){
  notify('BLOQUEIO AUTOMÁTICO: RD '+ex.combat.rd+' + Resistência '+(ex.domains['Resistência']||0)+
   ' = redução de '+(ex.combat.rd+(ex.domains['Resistência']||0))+' de dano. Sem rolagem.');
  return;
 }
 const melee=ex.combat.melee,config={
  initiative:['INICIATIVA','destreza','Mobilidade','test'],
  melee:['ATAQUE CORPO A CORPO',melee,'Confronto','attack'],
  ranged:['ATAQUE À DISTÂNCIA','destreza','Precisão','attack'],
  dodge:['ESQUIVA','destreza','Mobilidade','opposed'],
  parry:['APARAR',melee,'Confronto','opposed'],
  counter:['CONTRA-ATAQUE',melee,'Confronto','opposed'],
  sanity:['EXPOSIÇÃO PARANORMAL','consciencia','Resistência','test']
 }[action];
 if(!config)return;
 const result=roll({name:config[0],attribute:config[1],domain:config[2],type:config[3]});
 if(action==='parry'||action==='counter')notify(result.text+' · margem ≥5: aplique o benefício técnico do livro.');
 if(action==='sanity')notify(result.text+' · DT 11/16/21; na falha, perda de 1d4/1d6/2d6 PM.');
}
function bind(){
 root.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.ip!==undefined){
   const delta=Number(b.dataset.ip);
   save(ex=>{ex.ip=clamp(ex.ip+delta,0,10);if(ex.ip===0)ex.classe='mundano';});
   if(current().ex.ip===1&&current().ex.classe==='mundano')notify('No IP 1, escolha sua classe: Vanguarda, Analista ou Canalizador.');
  }else if(b.dataset.resource){
   const name=b.dataset.resource,delta=Number(b.dataset.delta);
   save(ex=>{if(ex[name].max!==null)ex[name].current=clamp(ex[name].current+delta,0,ex[name].max);});
  }else if(b.dataset.generate)generateResource(b.dataset.generate);
  else if(b.dataset.statBonus){
   const name=b.dataset.statBonus;
   const {ex}=current();
   if(ex.ip<3){notify('O primeiro aumento de atributo ocorre no IP 3.');return;}
   if(!ex[name].dice){notify('Gere os valores iniciais de '+name.toUpperCase()+' primeiro.');return;}
   if(ex[name].bonus>=6){notify('Limite de três avanços (+6) atingido.');return;}
   save(next=>{next[name].bonus+=2;});
   notify(name.toUpperCase()+': +2 ao valor máximo pelo aumento de CON/CNS, sem retroatividade.');
  }else if(b.dataset.grade)changeDomain(b.dataset.grade,1);
  else if(b.dataset.rollDomain){
   const {ex}=current(),name=b.dataset.rollDomain;
   const suggested=skills.find(x=>x[0]===name)[1];
   const outcome=roll({name,attribute:ex.tests[name]||suggested,domain:name});
   if(name==='Anomalias'&&outcome.dice[0]===outcome.dice[1]){
    const face=outcome.dice[0],echo=face<=3?'DISSONANTE':face<=7?'MANIFESTO':'RESSONANTE';
    notify(outcome.text+' · ECO '+echo+': aplicar efeito conforme o livro quando paranormal.');
   }
  }else if(b.dataset.combat)combat(b.dataset.combat);
  else if(b.dataset.rd)save(ex=>{ex.combat.rd=clamp(ex.combat.rd+Number(b.dataset.rd),0,4);});
 });
 root.addEventListener('contextmenu',event=>{
  const b=event.target.closest('button[data-grade]');if(!b)return;
  event.preventDefault();changeDomain(b.dataset.grade,-1);
 });
 root.addEventListener('change',event=>{
  const target=event.target;
  if(target.id==='v3-class')save(ex=>{if(ex.ip>0)ex.classe=target.value;});
  else if(target.id==='v3-melee-attr')save(ex=>{ex.combat.melee=target.value==='destreza'?'destreza':'potencia';});
  else if(target.matches('select[data-attribute]')){
   if(Object.prototype.hasOwnProperty.call(attrs,target.value))
    save(ex=>{ex.tests[target.dataset.attribute]=target.value;});
  }
 });
 $('v3-char-name').addEventListener('change',event=>{
  const {sheet}=current();sheet.name=event.target.value.trim().slice(0,35);
  global.SeasonSheet.applyState(sheet);
 });
}
function initialize(){
 if(ready||!global.SeasonSheet)return;
 ready=true;build();bind();render();
 global.addEventListener('season:change',render);
}
global.ExilioV3={rollAttribute,rollTest:roll,notify,domains:skills.map(x=>x[0])};
global.addEventListener('season:v3-ready',initialize);
if(global.SeasonSheet)initialize();
})(window);
