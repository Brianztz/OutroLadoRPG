(async function initializeSeasonSheet(){'use strict';try{const params=new URLSearchParams(location.search),view=params.get('view');if(!await OLFirebase.guardPage(view?'master':'player'))return;const user=await OLFirebase.getCurrentUser();const table=OLFirebase.normalizeTableCode(params.get('mesa'));const prefix='ol_temporada_v1:'+user.uid+':'+table+':'+(view||'own')+':';window.SeasonContext={table,view,user,prefix,stateKey:prefix+'state'};
(function(){
  'use strict';
  const W=1920,H=909;
  const viewport=document.getElementById('viewport');
  const sheet=document.getElementById('sheet');
  const $=id=>document.getElementById(id);
  const attrIds=['forca','agilidade','vigor','intelecto','presenca'];
  const newAttributeNames={potencia:'POTÊNCIA',destreza:'DESTREZA',constituicao:'CONSTITUIÇÃO',raciocinio:'RACIOCÍNIO',consciencia:'CONSCIÊNCIA',expressao:'EXPRESSÃO'};
  const skillNames=["ANOMALIAS","ATLETISMO","CONFRONTO","CONHECIMENTO","DISCRIÇÃO","INFLUÊNCIA","INVESTIGAÇÃO","MEDICINA","MOBILIDADE","OBSERVAÇÃO","OFÍCIO","PRECISÃO","RESISTÊNCIA","SENSIBILIDADE","SOBREVIVÊNCIA","TECNOLOGIA"];
  const exilioDescriptions=["Fenômenos e manifestações do Exílio.","Correr, saltar, escalar, nadar e superar obstáculos físicos.","Combate corpo a corpo, agarrões e golpes.","Ciências, cultura, história e teoria.","Furtividade, infiltração e ocultação.","Persuadir, negociar, intimidar e enganar.","Examinar evidências e reconstruir acontecimentos.","Diagnóstico, tratamentos e primeiros socorros.","Equilíbrio, acrobacias, esquivas e deslocamento.","Identificar sinais, movimentos e detalhes.","Atividade profissional ou artística; requer especialidade.","Disparos, arremessos e mira.","Resistir a pressão física e mental.","Interpretar emoções, atitudes e contradições.","Orientação, rastreamento e adaptação.","Computadores, eletrônica e sistemas."];
  const exilioDefaultAttributes={"ATLETISMO":"potencia","CONFRONTO":"potencia","PRECISÃO":"destreza","MOBILIDADE":"destreza","DISCRIÇÃO":"destreza","RESISTÊNCIA":"constituicao","OBSERVAÇÃO":"consciencia","INVESTIGAÇÃO":"raciocinio","CONHECIMENTO":"raciocinio","TECNOLOGIA":"raciocinio","MEDICINA":"raciocinio","INFLUÊNCIA":"expressao","SENSIBILIDADE":"consciencia","SOBREVIVÊNCIA":"consciencia","OFÍCIO":"raciocinio","ANOMALIAS":"consciencia"};
  const exilioAttributeLabels={"potencia":"POT","destreza":"DES","constituicao":"CON","raciocinio":"RAC","consciencia":"CNS","expressao":"EXP"};
  function buildExilioSkillTable(){
    const grid=$('sheet-skills-grid');
    grid.classList.add('exilio-skill-tables','exilio-skill-tiles');
    grid.setAttribute('aria-label','Perícias do Exílio. Clique para rolar escolhendo um atributo; mantenha pressionado para abrir treinamento.');
    grid.replaceChildren();
    for(const name of skillNames){
      const row=document.createElement('article');
      row.className='sheet-skill-card';row.dataset.skill=name;
      const btn=document.createElement('button');
      btn.className='sheet-skill-details';btn.type='button';
      btn.setAttribute('aria-label','Abrir perícia '+name);
      btn.title='Clique esquerdo: teste com escolha de atributo. Segure o botão esquerdo: treinamento e detalhes.';
      const label=document.createElement('strong');label.textContent=name;
      const rank=document.createElement('span');rank.className='sheet-skill-training';rank.textContent='SEM TREINAMENTO';
      const modifier=document.createElement('span');modifier.className='sheet-skill-score';modifier.textContent='0';
      btn.append(label,rank,modifier);
      row.append(btn);grid.append(row);
    }
  }
  buildExilioSkillTable();
  const initial={name:'',occupation:'Nenhum',origin:'Mundano',level:1,nex:0,attrs:{forca:0,agilidade:0,vigor:0,intelecto:0,presenca:0,potencia:0,destreza:0,constituicao:0,raciocinio:0,consciencia:0,expressao:0},skills:{},skillDomains:{},skillDomainBases:null,skillAttributes:{},skillBonuses:{},paranormalInfluence:0,exilioBackground:'',exilioAbilitiesNotes:'',exilioProgression:null,exilioResourceLedger:null,exilioPD:null,exilioShortRests:0};
  let state=JSON.parse(JSON.stringify(initial));
  let toastHandle=null;
  const save=()=>{try{localStorage.setItem(window.SeasonContext.stateKey,JSON.stringify(state));window.dispatchEvent(new Event('season:change'));}catch(e){}};
  try{const value=localStorage.getItem(window.SeasonContext.stateKey);if(value){const loaded=JSON.parse(value);if(loaded&&loaded.attrs&&loaded.skills){state={...initial,...loaded,attrs:{...initial.attrs,...loaded.attrs}};}}}catch(e){}
  function display(){
    const newResources=ensureExilioCreationResources();
    const creationChanged=reconcileExilioCreationAttributes();
    reconcileIPBonuses();
    const occupationDomainsChanged=reconcileOccupationSkillDomains();
    if(newResources||creationChanged||occupationDomainsChanged)save();
    displayExilioArtAndAbilities();
    displayParanormalInfluence();
    displayResources();
    renderClues();
    displayCombat();
    if(typeof inventoryLocation!=='undefined')renderInventory();
    const classAliases={Combatente:'Vanguarda',Especialista:'Analista',Ocultista:'Canalizador',Nenhuma:'Mundano'};
    const allowedClasses=['Mundano','Vanguarda','Analista','Canalizador'];
    const mappedClass=classAliases[state.origin]||state.origin||'Mundano';
    state.origin=allowedClasses.includes(mappedClass)?mappedClass:'Mundano';
    $('char-origin').textContent=state.origin;
    $('char-origin').dataset.exilioClass=state.origin;
    $('char-origin').title='Classe: '+state.origin+' · clique para escolher';
    refreshAnalystPD();
    $('char-name').value=state.name||'';
    keepLegacyOccupation();
    $('panel-occupation').value=state.occupation||'Nenhum';
    $('char-level').textContent=state.level;
    $('char-level').classList.add('changed');
    $('char-nex').value=state.nex||0;
    $('char-occupation').textContent=state.occupation;
    $('char-occupation').classList.add('changed');
    document.querySelectorAll('[data-attr]').forEach(el=>{
      const v=Number(state.attrs[el.dataset.attr])||0;
      el.querySelector('.attr-number').textContent=(el.classList.contains('v3-attributes')||v!==0)?String(v):'';
      const newName=newAttributeNames[el.dataset.attr];
      el.setAttribute('aria-label',newName
        ? newName+', valor '+v+'. Clique para aumentar, botão direito para diminuir; Shift e clique ou R para rolar.'
        : el.dataset.attr+', valor '+v);
    });
    document.querySelectorAll('[data-skill]').forEach(el=>{
      const name=el.dataset.skill;
      const domain=Number(state.skillDomains?.[name])||0;
      const bonus=Number(state.skillBonuses?.[name])||0;
      // Os cards exibem apenas Domínio e bônus; o atributo entra somente no teste.
      const modifier=domain+bonus;
      const rank={0:'SEM TREINAMENTO',2:'PRATICANTE +2',4:'EXPERIENTE +4',6:'REFERÊNCIA +6'}[domain]||'DOMÍNIO '+(domain>=0?'+':'')+domain;
      el.classList.toggle('trained',domain>0);
      el.querySelector('.sheet-skill-training').textContent=rank;
      el.querySelector('.sheet-skill-score').textContent=(modifier>0?'+':'')+modifier;
      const button=el.querySelector('.sheet-skill-details');
      button.setAttribute('aria-label',name+', '+rank+', bônus sem atributo '+(modifier>=0?'+':'')+modifier+'. Clique para escolher atributo e rolar; segure para treinamento.');
      updateSkillEdgeBadge(el);
    });
  }
  // Nunca achatar a arte: escala uniforme em qualquer proporção de tela.
  // Modo padrão: toda a ficha cabe na janela. Modo leitura: escala mínima
  // para textos pequenos, com rolagem em vez de distorção ou recorte.
  const viewModeKey='outrolado_temporada_visualizacao_v3';
  let screenMode='fit';
  try { if(localStorage.getItem(viewModeKey)==='readable') screenMode='readable'; } catch (_) {}
  function computeSheetScale(width,height,mode='fit'){
    const safeWidth=Math.max(1,Number(width)||1);
    const safeHeight=Math.max(1,Number(height)||1);
    const fitScale=Math.min(safeWidth/W,safeHeight/H);
    return mode==='readable'?Math.max(fitScale,0.82):fitScale;
  }
  function updateScale(){
    const width=Math.max(1,window.visualViewport?.width||window.innerWidth);
    const height=Math.max(1,window.visualViewport?.height||window.innerHeight);
    const scale=computeSheetScale(width,height,screenMode);
    const fitScale=computeSheetScale(width,height,'fit');
    const scaledWidth=W*scale,scaledHeight=H*scale;
    viewport.style.width=scaledWidth+'px';
    viewport.style.height=scaledHeight+'px';
    sheet.style.transform='scale('+scale+')';
    document.body.classList.toggle('season-readable-zoom',screenMode==='readable');
    // Inventário e Rituais seguem o tamanho disponível e não são esticados.
    // São quadros com seus próprios elementos absolutos em coordenadas 1920×909.
    const stageWidth=W*fitScale,stageHeight=H*fitScale;
    const stageLeft=Math.max(0,(width-stageWidth)/2);
    const stageTop=Math.max(0,(height-stageHeight)/2);
    for(const canvasId of ['inventory-portrait-canvas','ritual-canvas']){
      const canvas=$(canvasId);
      if(!canvas)continue;
      canvas.style.transform='scale('+fitScale+')';
      canvas.style.left=stageLeft+'px';
      canvas.style.top=stageTop+'px';
    }
    const fitButton=$('fit-mode');
    if(fitButton){
      fitButton.textContent=screenMode==='fit'
        ?'VISUALIZAÇÃO: ENCAIXADA · AMPLIAR'
        :'VISUALIZAÇÃO: AMPLIADA · ENCAIXAR';
      fitButton.title=screenMode==='fit'
        ?'Ampliar uniformemente para facilitar a leitura; use a rolagem quando necessário.'
        :'Encaixar toda a ficha na janela sem comprimir a imagem.';
      fitButton.setAttribute('aria-pressed',String(screenMode==='readable'));
    }
  }
  const toolsButton=$('tools-toggle');
  const toolsHeader=document.querySelector('.head');
  const hideTools=()=>{toolsHeader.classList.remove('tools-open');toolsButton.setAttribute('aria-expanded','false');};
  toolsButton.addEventListener('click',()=>{
    const open=toolsHeader.classList.toggle('tools-open');
    toolsButton.setAttribute('aria-expanded',String(open));
  });
  document.addEventListener('pointerdown',event=>{
    if(!toolsHeader.contains(event.target) && !toolsButton.contains(event.target))hideTools();
  });
  $('fit-mode').addEventListener('click',()=>{
    screenMode=screenMode==='fit'?'readable':'fit';
    try {localStorage.setItem(viewModeKey,screenMode);} catch (_) {}
    updateScale();
  });
  $('photo-header-upload').addEventListener('click',hideTools);
  $('download-preview').addEventListener('click',hideTools);
  $('clear').addEventListener('click',hideTools);
  $('edit').addEventListener('click',hideTools);

  function toast(s){const el=$('toast');el.textContent=s;el.classList.add('visible');clearTimeout(toastHandle);toastHandle=setTimeout(()=>el.classList.remove('visible'),2500)}
  document.querySelectorAll('[data-attr]').forEach(el=>{
    const id=el.dataset.attr;
    const isNew=el.classList.contains('v3-attributes');
    const change=delta=>{
      const current=Number(state.attrs[id])||0;
      const creation=clampParanormalInfluence(state.paranormalInfluence)===0&&state.origin==='Mundano'&&Boolean(newAttributeNames[id]);
      const next=Math.max(-1,Math.min(creation?3:5,current+delta));
      if(next===current){if(creation&&delta>0)toast('Na criação, atributo máximo +3.');return;}
      if(creation){
        const values=Object.keys(newAttributeNames).map(key=>key===id?next:(Number(state.attrs[key])||0));
        if(values.reduce((sum,v)=>sum+v,0)>6){toast('Na criação, distribua até 6 pontos. Um atributo em −1 concede 1 ponto extra.');return;}
        if(values.filter(v=>v===-1).length>1){toast('Na criação, apenas um atributo pode ser reduzido a −1.');return;}
      }
      state.attrs[id]=next;display();save();
    };
    const roll=()=>{
      const value=Number(state.attrs[id])||0;
      const pool=rollSkillPool(value);
      showSkillDice(pool,'ATRIBUTO',newAttributeNames[id]||id.toUpperCase());
    };
    el.addEventListener('click',event=>{
      if(isNew&&event.shiftKey){roll();return;}
      change(1);
    });
    el.addEventListener('contextmenu',event=>{event.preventDefault();change(-1);});
    if(!isNew)return;
    // Os mesmos controles também são usáveis por toque e teclado.
    el.addEventListener('keydown',event=>{
      if(event.key==='ArrowUp'||event.key==='ArrowRight'){event.preventDefault();change(1);}
      if(event.key==='ArrowDown'||event.key==='ArrowLeft'){event.preventDefault();change(-1);}
      if(event.key.toLowerCase()==='r'){event.preventDefault();roll();}
    });
    const buttons=document.createElement('span');
    buttons.className='v3-attribute-tools';
    buttons.style.left=(parseFloat(el.style.left)+35)+'px';
    buttons.style.top=(parseFloat(el.style.top)+1)+'px';
    const decrease=document.createElement('button');
    decrease.type='button';decrease.className='v3-attribute-minus';
    decrease.textContent='−';decrease.title='Diminuir '+newAttributeNames[id];
    decrease.setAttribute('aria-label','Diminuir '+newAttributeNames[id]);
    decrease.addEventListener('click',()=>change(-1));
    const dice=document.createElement('button');
    dice.type='button';dice.className='v3-attribute-roll';
    dice.textContent='⚄';dice.title='Rolar '+newAttributeNames[id]+' no sistema Exílio';
    dice.setAttribute('aria-label','Rolar '+newAttributeNames[id]);
    dice.addEventListener('click',roll);
    buttons.append(decrease,dice);
    el.after(buttons);
  });
  // Clique esquerdo curto rola; manter pressionado (mouse ou toque) abre treinamento.
  // Via teclado: Enter/Espaço rola, Shift+Enter ou T abre treinamento.
  document.querySelectorAll('[data-skill]').forEach(el=>{
    const button=el.querySelector('.sheet-skill-details');
    let holdTimer=null,held=false;
    const stopHold=()=>{if(holdTimer!==null){clearTimeout(holdTimer);holdTimer=null;}};
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||!event.isPrimary)return;
      stopHold();held=false;
      holdTimer=setTimeout(()=>{holdTimer=null;held=true;openSkill(el);},550);
    });
    for(const type of ['pointerup','pointercancel','pointerleave'])button.addEventListener(type,stopHold);
    button.addEventListener('contextmenu',event=>{if(event.pointerType==='touch')event.preventDefault();});
    button.addEventListener('click',event=>{
      stopHold();
      if(held){event.preventDefault();held=false;return;}
      if(event.button!==0)return;
      openQuickSkillRoll(el);
    });
    button.addEventListener('keydown',event=>{
      if((event.key==='Enter'&&event.shiftKey)||event.key.toLowerCase()==='t'){
        event.preventDefault();stopHold();openSkill(el);
      }
    });
  });
  $('char-name').addEventListener('input',e=>{state.name=e.target.value.toUpperCase().slice(0,22);save();});
  $('panel-occupation').addEventListener('change',e=>{state.occupation=e.target.value;display();save();});
  // Mesmo controle dos atributos: clique esquerdo aumenta, direito diminui.
  const changeLevel=delta=>{
    state.level=Math.max(1,Math.min(20,(Number(state.level)||1)+delta));
    display();save();
  };
  $('char-level').addEventListener('click',()=>changeLevel(1));
  $('char-level').addEventListener('contextmenu',event=>{event.preventDefault();changeLevel(-1);});
  $('char-occupation').addEventListener('click',()=>$('occupation-dialog').showModal());
  $('char-nex').addEventListener('change',e=>{state.nex=Number(e.target.value);save();});
  $('occupation-close').addEventListener('click',()=>$('occupation-dialog').close());
  $('occupation-dialog').addEventListener('click',e=>{if(e.target===$('occupation-dialog'))e.target.close();});
  // Ocupações oficiais do Exílio 3.0 (30), com descrição, Domínios e Vivência.
  const occupations=[{"name":"Acadêmico","description":"Você tem experiência com estudos, pesquisas e ensino. Acostumado a examinar teorias, documentos e evidências, costuma procurar explicações mesmo quando os acontecimentos parecem desafiar a lógica.","domains":"Conhecimento • Investigação","vivenciaName":"Pesquisa Metódica","vivencia":"Uma vez por cena, repita um d10 em Conhecimento; mantenha o novo resultado."},{"name":"Investigador","description":"Você tem experiência em descobrir fatos ocultos, conectar pistas e reconstituir acontecimentos. Pode ser um detetive, perito ou alguém acostumado a resolver casos e procurar a verdade.","domains":"Investigação • Observação","vivenciaName":"Olhar Metódico","vivencia":"Uma vez por cena, transforme um resultado Normal de Investigação em Bom."},{"name":"Jornalista","description":"Você procura informações, entrevista pessoas e transforma descobertas em relatos. Sabe acompanhar notícias, questionar versões oficiais e seguir uma história até encontrar o que está sendo escondido.","domains":"Investigação • Influência","vivenciaName":"Fonte Confiável","vivencia":"Uma vez por investigação, obtenha uma informação pública relevante por um contato plausível."},{"name":"Estudante","description":"Você está acostumado a estudar, pesquisar e aprender assuntos novos, combinando teoria, observação e experiência.","domains":"Conhecimento • Observação","vivenciaName":"Aprendizado Rápido","vivencia":"Uma vez por cena, receba +2 em Conhecimento sobre algo estudado recentemente."},{"name":"Bibliotecário","description":"Você trabalha com livros, acervos e arquivos. Sabe encontrar referências e reconhecer padrões em documentos.","domains":"Conhecimento • Investigação","vivenciaName":"Memória de Arquivos","vivencia":"Uma vez por cena, localize uma referência relevante em acervo acessível, sem teste de busca rotineira."},{"name":"Arqueólogo","description":"Você interpreta artefatos, ruínas e vestígios antigos para reconstruir acontecimentos e modos de vida.","domains":"Conhecimento • Sobrevivência","vivenciaName":"Leitura do Passado","vivencia":"Uma vez por cena, obtenha informação adicional ao examinar vestígios materiais ou históricos."},{"name":"Médico","description":"Você possui formação para examinar pessoas, identificar condições clínicas e agir diante de doenças ou ferimentos.","domains":"Medicina • Conhecimento","vivenciaName":"Diagnóstico Preciso","vivencia":"Uma vez por cena, identifique uma condição física e seu risco imediato a partir de sinais observáveis."},{"name":"Enfermeiro","description":"Você acompanha cuidados e recuperação de pacientes, mantendo atenção e calma em momentos delicados.","domains":"Medicina • Sensibilidade","vivenciaName":"Cuidados Contínuos","vivencia":"Uma vez por cena, conceda +2 a teste de recuperação física acompanhado por você."},{"name":"Psicólogo","description":"Você estuda comportamentos e emoções, e aprendeu a escutar e compreender pessoas com atenção.","domains":"Sensibilidade • Influência","vivenciaName":"Escuta Atenta","vivencia":"Uma vez por cena, receba +2 em Sensibilidade para compreender alguém por meio de conversa."},{"name":"Socorrista","description":"Você foi treinado para responder a acidentes e emergências em situações nas quais cada segundo importa.","domains":"Medicina • Resistência","vivenciaName":"Resposta Imediata","vivencia":"Uma vez por cena, repita um d10 em Medicina ao prestar socorro sob pressão."},{"name":"Veterinário","description":"Você entende sinais de saúde e comportamento animal e sabe examinar animais e reconhecer alterações.","domains":"Medicina • Conhecimento","vivenciaName":"Leitura Animal","vivencia":"Uma vez por cena, obtenha informação adicional sobre saúde ou comportamento de animal examinado."},{"name":"Policial","description":"Você atuou na segurança pública ou recebeu treinamento semelhante. Aprendeu a observar comportamentos, lidar com ocorrências e tomar decisões em momentos de tensão.","domains":"Precisão • Observação","vivenciaName":"Avaliação de Ameaças","vivencia":"Uma vez por confronto, receba +2 em Observação para reconhecer perigo imediato ou rota de aproximação."},{"name":"Militar","description":"Você tem disciplina operacional, treinamento físico e experiência em trabalhar sob pressão ou ameaça.","domains":"Confronto • Resistência","vivenciaName":"Disciplina Operacional","vivencia":"Uma vez por confronto, repita um d10 de Resistência Física sob esforço ou pressão."},{"name":"Lutador","description":"Você treinou artes marciais ou outras formas de combate corpo a corpo. Essa vivência desenvolveu disciplina, consciência dos movimentos e reflexos úteis em situações perigosas.","domains":"Confronto • Mobilidade","vivenciaName":"Guarda Treinada","vivencia":"Uma vez por confronto, receba +2 em Confronto para escapar de imobilização."},{"name":"Atleta","description":"Você se dedicou a um esporte ou a uma atividade física competitiva. Treinos, disciplina e esforço desenvolveram seu preparo corporal e sua capacidade de reagir sob pressão.","domains":"Atletismo • Resistência","vivenciaName":"Segundo Fôlego","vivencia":"Uma vez por cena, repita um d10 de Atletismo ou Resistência Física."},{"name":"Vigilante","description":"Você protege pessoas e lugares, desenvolvendo atenção constante e capacidade de notar comportamentos suspeitos.","domains":"Observação • Confronto","vivenciaName":"Atenção Constante","vivencia":"Uma vez por cena, receba +2 em Observação para detectar movimento suspeito."},{"name":"Técnico de Informática","description":"Você se sente à vontade com computadores, redes, programas e dispositivos eletrônicos. Sabe pesquisar informações, entender problemas digitais e usar a tecnologia para seguir pistas.","domains":"Tecnologia • Investigação","vivenciaName":"Diagnóstico Rápido","vivencia":"Uma vez por cena, ao examinar dispositivo, descubra uma informação sobre funcionamento ou falha."},{"name":"Engenheiro","description":"Você entende como máquinas, estruturas e sistemas funcionam. Seja pela formação ou pela prática, prefere analisar problemas, improvisar soluções e consertar o que parece perdido.","domains":"Tecnologia • Ofício (Mecânica)","vivenciaName":"Solução Estrutural","vivencia":"Uma vez por cena, receba +2 para testar solução mecânica ou estrutural."},{"name":"Mecânico","description":"Você repara máquinas e mecanismos e está habituado a improvisar soluções usando ferramentas e materiais disponíveis.","domains":"Ofício (Mecânica) • Tecnologia","vivenciaName":"Reparo Improvisado","vivencia":"Uma vez por cena, repita um d10 ao tentar restaurar temporariamente um mecanismo."},{"name":"Programador","description":"Você conhece programação, lógica e sistemas digitais, investigando código e falhas de software.","domains":"Tecnologia • Conhecimento","vivenciaName":"Lógica de Sistemas","vivencia":"Uma vez por cena, receba +2 em Tecnologia para analisar código ou falha de software."},{"name":"Inventor","description":"Você transforma ideias em protótipos e ferramentas, combinando técnica com improvisação.","domains":"Ofício (Mecânica) • Investigação","vivenciaName":"Protótipo Funcional","vivencia":"Uma vez por investigação, monte ferramenta improvisada de uso único com materiais adequados, a critério do mestre."},{"name":"Artista","description":"Sua vida gira em torno da expressão criativa: música, atuação, dança, escrita, artes visuais ou outras formas de arte. Você entende o poder de uma imagem, de uma história e das emoções que elas despertam.","domains":"Ofício (Artes) • Sensibilidade","vivenciaName":"Expressão Autêntica","vivencia":"Uma vez por cena, receba +2 em Ofício (Artes) ao interpretar obra ou comunicar ideia."},{"name":"Ator","description":"Você domina interpretação e expressão, adaptando gestos e emoções para representar personagens.","domains":"Influência • Ofício (Artes Cênicas)","vivenciaName":"Personagem Convincente","vivencia":"Uma vez por cena, repita um d10 em Influência ao representar identidade ou emoção."},{"name":"Religioso","description":"A fé e a espiritualidade têm um papel importante em sua vida. Você pode fazer parte de uma comunidade religiosa, orientar outras pessoas ou buscar respostas para experiências que parecem sobrenaturais.","domains":"Conhecimento • Sensibilidade","vivenciaName":"Tradições e Símbolos","vivencia":"Uma vez por cena, obtenha informação adicional ao identificar prática ou símbolo religioso conhecido."},{"name":"Comerciante","description":"Você tem experiência em negociar bens e serviços, avaliar propostas e compreender interesses.","domains":"Influência • Observação","vivenciaName":"Bom Negociador","vivencia":"Uma vez por cena, receba +2 em Influência ao negociar bens ou serviços."},{"name":"Professor","description":"Você se dedicou ao ensino e sabe orientar outras pessoas e explicar tarefas difíceis.","domains":"Conhecimento • Influência","vivenciaName":"Explicação Clara","vivencia":"Uma vez por cena, conceda +2 ao teste de aliado que esteja orientando em tarefa conhecida; não acumula auxílio."},{"name":"Criminoso","description":"Você já viveu fora da lei, por necessidade, escolha ou influência de outras pessoas. Aprendeu a reconhecer riscos, escapar da atenção alheia e circular por ambientes que muitos evitam.","domains":"Discrição • Mobilidade","vivenciaName":"Rotas Alternativas","vivencia":"Uma vez por cena, receba +2 em Discrição para escapar de vigilância ou atravessar área restrita."},{"name":"Trabalhador","description":"Você adquiriu conhecimentos técnicos pelo trabalho e sabe executar tarefas práticas de sua profissão.","domains":"Ofício (escolhido) • Atletismo","vivenciaName":"Experiência Prática","vivencia":"Uma vez por cena, repita um d10 em Ofício ao realizar tarefa própria da profissão."},{"name":"Explorador","description":"Você costuma atravessar ambientes desconhecidos, procurar rotas e reconhecer riscos do terreno.","domains":"Sobrevivência • Observação","vivenciaName":"Orientação Natural","vivencia":"Uma vez por cena, receba +2 em Sobrevivência para achar rota segura ou reconhecer perigos do terreno."},{"name":"Autodidata","description":"Você estuda por conta própria e sabe aplicar conhecimentos adquiridos fora do ensino formal.","domains":"Conhecimento • Tecnologia","vivenciaName":"Conhecimento Independente","vivencia":"Uma vez por cena, receba +2 em Conhecimento ou Tecnologia sobre tema estudado por conta própria."}];
  const occupationNames=new Set(occupations.map(o=>o.name));
  const occupationPanelSelect=$('panel-occupation');
  occupationPanelSelect.replaceChildren();
  for(const name of ['Nenhum',...occupations.map(o=>o.name)]){
    const option=document.createElement('option');option.value=name;option.textContent=name;
    occupationPanelSelect.append(option);
  }
  function keepLegacyOccupation(){
    const name=state.occupation||'Nenhum';
    if(name!=='Nenhum'&&!occupationNames.has(name)&&![...occupationPanelSelect.options].some(o=>o.value===name)){
      const option=document.createElement('option');option.value=name;option.textContent=name+' (anterior)';occupationPanelSelect.append(option);
    }
  }
  // A ocupação fornece dois Domínios em Praticante (+2), sem apagar treinos próprios.
  // Para fichas antigas, os graus existentes são preservados como base independente.
  function occupationDomainNames(name=state.occupation){
    const selected=occupations.find(o=>o.name===name);
    if(!selected)return [];
    return [...new Set(selected.domains.split('•')
      .map(part=>part.trim().replace(/\s*\([^)]*\)/g,'').toLocaleUpperCase('pt-BR'))
      .filter(skill=>skillNames.includes(skill)))];
  }
  function reconcileOccupationSkillDomains(){
    let changed=false;
    if(!state.skillDomainBases||typeof state.skillDomainBases!=='object'||Array.isArray(state.skillDomainBases)){
      state.skillDomainBases={...(state.skillDomains||{})};
      changed=true;
    }
    state.skillDomains=state.skillDomains||{};
    state.skills=state.skills||{};
    const granted=new Set(occupationDomainNames());
    for(const skill of skillNames){
      const own=Math.max(0,Number(state.skillDomainBases[skill])||0);
      const current=Math.max(own,granted.has(skill)?2:0);
      if((Number(state.skillDomains[skill])||0)!==current){state.skillDomains[skill]=current;changed=true;}
      if((Number(state.skills[skill])||0)!==current){state.skills[skill]=current;changed=true;}
    }
    return changed;
  }
  function setIndependentSkillDomain(name,amount){
    if(!state.skillDomainBases)reconcileOccupationSkillDomains();
    state.skillDomainBases[name]=amount;
    const current=Math.max(amount,occupationDomainNames().includes(name)?2:0);
    state.skillDomains[name]=current;
    state.skills=state.skills||{};
    state.skills[name]=current;
  }
  const choose=(name)=>{state.occupation=name;display();save();$('occupation-dialog').close();};
  $('occupation-none').addEventListener('click',()=>choose('Nenhum'));
  for(const details of occupations){
    const card=document.createElement('button');card.type='button';card.className='occupation-card';
    const title=document.createElement('strong');title.textContent=details.name;
    const description=document.createElement('span');description.textContent=details.description;
    const domains=document.createElement('small');domains.textContent='Domínios (Praticante +2): '+details.domains;
    const vivencia=document.createElement('small');vivencia.textContent='Vivência — '+details.vivenciaName+': '+details.vivencia;
    card.append(title,description,domains,vivencia);
    card.addEventListener('click',()=>choose(details.name));$('occupation-list').append(card);
  }
  const panel=$('panel');
  function openPanel(){panel.classList.add('open');$('season-retry').focus();}
  function closePanel(){panel.classList.remove('open')}
  $('edit').addEventListener('click',openPanel);
  $('close-panel').addEventListener('click',closePanel);
  $('clear').addEventListener('click',()=>{if(confirm('Reiniciar apenas os campos desta prévia visual?')){state=JSON.parse(JSON.stringify(initial));save();display();toast('Prévia reiniciada. A ficha original não foi alterada.');}});
  $('download-preview').addEventListener('click',()=>{
    const snapshot={modelo:'Outro Lado - teste visual offline',aviso:'Isto não é exportação da ficha oficial.',...state};
    const b=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(b);const a=document.createElement('a');a.href=url;a.download='teste-visual-outro-lado.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Prévia exportada em JSON (não é a ficha oficial).');
  });
  window.addEventListener('resize',updateScale);
  window.visualViewport?.addEventListener?.('resize',updateScale);
  window.addEventListener('orientationchange',updateScale);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanel();hideTools();}});

  const skillDescriptions=exilioDescriptions;
  const tabelaD20={1:{n:20,b:99,e:99},2:{n:19,b:20,e:99},3:{n:18,b:20,e:99},4:{n:17,b:19,e:99},5:{n:16,b:19,e:20},6:{n:15,b:18,e:20},7:{n:14,b:18,e:20},8:{n:13,b:17,e:20},9:{n:12,b:17,e:20},10:{n:11,b:16,e:19},11:{n:10,b:16,e:19},12:{n:9,b:15,e:19},13:{n:8,b:15,e:19},14:{n:7,b:14,e:19},15:{n:6,b:14,e:18},16:{n:5,b:13,e:18},17:{n:4,b:13,e:18},18:{n:3,b:12,e:18},19:{n:2,b:12,e:18},20:{n:1,b:11,e:18}};
  const skillAttributeKeys={FOR:'forca',AGI:'agilidade',VIG:'vigor',INT:'intelecto',PRE:'presenca'};
  let selectedSkill=null;
  function skillValues(attribute,training,bonus){
    const total=(Number(attribute)||0)+(Number(training)||0)+(Number(bonus)||0);
    return {natural:total,total,targets:{n:11,b:16,e:21}};
  }
  function rollSkillPool(attribute,random=Math.random,modifier=0){
    const bonus=Math.trunc(Number(attribute)||0);
    const dice=[Math.floor(random()*10)+1,Math.floor(random()*10)+1];
    const value=dice[0]+dice[1]+bonus;
    return {dice,kept:dice,value,lowest:false,detail:'2d10 ['+dice.join(', ')+'] + '+bonus+' = '+value};
  }
  function classifySkill(value){return value>=21?'EXTREMO':value>=16?'BOM':value>=11?'NORMAL':'FALHA';}
  function selectedValues(){
    const domain=Number($('skill-training').value)||0;
    const bonus=Math.trunc(Number($('skill-bonus').value)||0);
    return {domain,bonus,total:domain+bonus};
  }
  function refreshSkill(){
    if(!selectedSkill)return;
    const v=selectedValues();
    $('skill-formula').textContent='2d10 + atributo escolhido na rolagem + Domínio '+v.domain+(v.bonus?' + bônus '+v.bonus:'');
    $('skill-dice-rule').textContent='Modificador sem atributo: '+(v.total>=0?'+':'')+v.total+' · Clique no dado para escolher o atributo.';
  }
  function openSkill(el){
    selectedSkill=el;const name=el.dataset.skill;
    $('skill-name').textContent=name;$('skill-description').textContent=skillDescriptions[skillNames.indexOf(name)]||'';
    $('skill-training').value=String(Number(state.skillDomains?.[name])||0);
    $('skill-bonus').value=Number(state.skillBonuses?.[name])||0;
    const occupationHint=$('skill-occupation-hint'),isGranted=occupationDomainNames().includes(name);
    occupationHint.hidden=!isGranted;
    occupationHint.textContent=isGranted?'A ocupação '+state.occupation+' concede Praticante (+2) nesta perícia. Esse benefício será retirado ao mudar de ocupação, salvo se você tiver treinamento próprio.':'';
    $('skill-roll-attribute-picker').hidden=true;
    $('skill-result').textContent='';refreshSkill();$('skill-drawer').showModal();
  }
  // Seletor rápido: não abre nem altera o painel de treinamento.
  function openQuickSkillRoll(el){
    const name=el.dataset.skill,dialog=$('skill-quick-roll-dialog'),options=$('skill-quick-roll-options');
    $('skill-quick-roll-title').textContent=name+' · Escolha o atributo';
    options.replaceChildren();
    for(const [key,label] of Object.entries(newAttributeNames)){
      const value=Number(state.attrs[key])||0;
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label+' ('+(value>=0?'+':'')+value+')';
      button.setAttribute('aria-label','Rolar '+name+' com '+label);
      button.addEventListener('click',()=>{
        const pool=rollExilioSkill(name,key);
        dialog.close();
        showSkillDice(pool,'TOTAL',name);
      });
      options.append(button);
    }
    dialog.showModal();
    options.querySelector('button')?.focus();
  }
  $('skill-quick-roll-close').addEventListener('click',()=>$('skill-quick-roll-dialog').close());
  $('skill-quick-roll-dialog').addEventListener('click',event=>{
    if(event.target!==$('skill-quick-roll-dialog'))return;
    const box=event.target.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)event.target.close();
  });
  function saveSkillSettings(){
    if(!selectedSkill)return;
    const name=selectedSkill.dataset.skill;
    const requested=Number($('skill-training').value)||0;
    const previous=Number(state.skillDomains?.[name])||0;
    const ip=clampParanormalInfluence(state.paranormalInfluence);
    if((requested===4&&ip<4)||(requested===6&&ip<7)){
      toast(requested===4?'Domínio Experiente (+4) exige IP 4.':'Domínio Referência (+6) exige IP 7.');
      $('skill-training').value=String(previous);refreshSkill();return false;
    }
    const refs=skillNames.filter(n=>n!==name&&(Number(state.skillDomains?.[n])||0)===6).length;
    if(requested===6&&refs>=2){
      toast('O livro permite no máximo duas perícias em Referência (+6).');
      $('skill-training').value=String(previous);refreshSkill();return false;
    }
    const bonus=Math.max(-99,Math.min(99,Math.trunc(Number($('skill-bonus').value)||0)));
    state.skillDomains=state.skillDomains||{};state.skillBonuses=state.skillBonuses||{};
    setIndependentSkillDomain(name,[0,2,4,6].includes(requested)?requested:previous);
    state.skillBonuses[name]=bonus;
    $('skill-bonus').value=bonus;
    save();display();refreshSkill();$('skill-result').textContent='';return true;
  }
  function rollExilioSkill(name,attributeKey,random=Math.random){
    if(!Object.prototype.hasOwnProperty.call(newAttributeNames,attributeKey))throw Error('Escolha um atributo válido.');
    const attribute=Number(state.attrs[attributeKey])||0,domain=Number(state.skillDomains?.[name])||0,bonus=Number(state.skillBonuses?.[name])||0;
    const dice=[Math.floor(random()*10)+1,Math.floor(random()*10)+1];
    const total=dice[0]+dice[1]+attribute+domain+bonus;
    const detail='2d10 ['+dice.join(', ')+'] + '+exilioAttributeLabels[attributeKey]+' ('+attribute+') + Domínio '+domain+(bonus?' + bônus '+bonus:'')+' = '+total;
    return {dice,kept:dice,value:total,lowest:false,detail};
  }
  $('skill-training').addEventListener('change',saveSkillSettings);
  $('skill-bonus').addEventListener('change',saveSkillSettings);
  $('skill-close').addEventListener('click',()=>$('skill-drawer').close());
  $('skill-drawer').addEventListener('click',event=>{
    if(event.target!==$('skill-drawer'))return;
    const r=event.target.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();
  });
  $('skill-roll').addEventListener('click',()=>{
    if(!selectedSkill||!saveSkillSettings())return;
    const picker=$('skill-roll-attribute-picker'),options=$('skill-roll-attribute-options');
    options.replaceChildren();
    for(const [key,label] of Object.entries(newAttributeNames)){
      const attr=Number(state.attrs[key])||0;
      const button=document.createElement('button');button.type='button';
      button.textContent=label+' ('+(attr>=0?'+':'')+attr+')';
      button.setAttribute('aria-label','Rolar '+selectedSkill.dataset.skill+' com '+label+' ('+attr+')');
      button.addEventListener('click',()=>{
        if(!selectedSkill)return;
        const name=selectedSkill.dataset.skill,pool=rollExilioSkill(name,key);
        const output=$('skill-result');output.dataset.result='TOTAL';output.textContent=pool.detail;
        picker.hidden=true;
        showSkillDice(pool,'TOTAL',name);
      });
      options.append(button);
    }
    picker.hidden=false;
    options.querySelector('button')?.focus();
  });
  
  let diceTimer=null,diceURL=null;
  function cleanupSkillDice(){clearTimeout(diceTimer);diceTimer=null;$('skill-dice-animation').onload=null;$('skill-dice-animation').onerror=null;if(diceURL){URL.revokeObjectURL(diceURL);diceURL=null;}$('skill-dice-animation').removeAttribute('src');}
  function showSkillDice(pool,label,name){
window.dispatchEvent(new CustomEvent('season:roll',{detail:{pool,label,name}}));
    cleanupSkillDice();$('skill-dice-title').textContent=name;$('skill-dice-reveal').hidden=true;
    $('skill-dice-number').textContent=pool.value;$('skill-dice-class').textContent=label;$('skill-dice-class').dataset.result=label;
    $('skill-dice-detail').textContent='Girando o dado…';$('skill-dice-popup').showModal();
    const reveal=()=>{if(!$('skill-dice-popup').open)return;$('skill-dice-reveal').hidden=false;$('skill-dice-detail').textContent=pool.detail||pool.dice.length+'d20 ['+pool.dice.join(', ')+'] · '+(pool.lowest?'menor':'maior')+' resultado';};
    let started=false;const ready=()=>{if(started)return;started=true;clearTimeout(diceTimer);diceTimer=setTimeout(reveal,window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:1500);};
    $('skill-dice-animation').onload=ready;$('skill-dice-animation').onerror=ready;
    diceURL='/temporada/assets/dice.gif?roll='+Date.now();$('skill-dice-animation').src=diceURL;diceTimer=setTimeout(ready,2500);
  }
  $('skill-dice-close').addEventListener('click',()=>$('skill-dice-popup').close());
  $('skill-dice-popup').addEventListener('close',cleanupSkillDice);
  $('skill-dice-popup').addEventListener('click',e=>{if(e.target===$('skill-dice-popup')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});



  // Influência Paranormal (Exílio): valor inteiro entre 0 e 10.
  function clampParanormalInfluence(value){
    const number=Number(value);
    return Number.isFinite(number)?Math.max(0,Math.min(10,Math.trunc(number))):0;
  }
  function displayParanormalInfluence(){
    const value=clampParanormalInfluence(state.paranormalInfluence);
    state.paranormalInfluence=value;
    $('influence-value').value=String(value);
    $('influence-value').title='Influência Paranormal: '+value+'/10';
  }
  function setParanormalInfluence(value){
    const next=clampParanormalInfluence(value);
    if(next===clampParanormalInfluence(state.paranormalInfluence)){
      displayParanormalInfluence();
      return;
    }
    state.paranormalInfluence=next;
    display();
    save();
    if($('exilio-progress-dialog').open)renderProgressChoices();
  }
  $('influence-value').addEventListener('change',event=>setParanormalInfluence(event.target.value));


  // Regras de Exílio 3.0. O ledger registra apenas bônus automáticos fixos por IP.
  const exilioGrowth={Vanguarda:[5,3],Analista:[3,5],Canalizador:[2,6]};
  const exilioBook={"Vanguarda":{"base":[{"ip":1,"name":"Guarda · Corpo Firme","description":"+2 em Resistência física para suportar impacto, empurrão, queda ou derrubada.","postura":"Guarda"},{"ip":1,"name":"Guarda · Interposição","description":"Uma vez por rodada, use a reação para receber ataque físico direcionado a aliado próximo e alcançável.","postura":"Guarda"},{"ip":1,"name":"Pressão · Presença Ameaçadora","description":"+2 em Confronto para agarrar, empurrar, desarmar e impedir movimento. Não beneficia dano direto.","postura":"Pressão"},{"ip":1,"name":"Pressão · Marcação","description":"Ao acertar ataque corpo a corpo, marque um alvo até o próximo turno. Ao seu alcance, primeiro ataque do alvo contra outra pessoa sofre −2.","postura":"Pressão"},{"ip":1,"name":"Investida · Passos Decididos","description":"+2 em Mobilidade em aproximações, obstáculos e reposicionamento durante combate.","postura":"Investida"},{"ip":1,"name":"Investida · Avanço Impetuoso","description":"Uma vez por turno, ao avançar 3 m antes de ataque corpo a corpo, recebe +2 nesse ataque.","postura":"Investida"},{"ip":3,"name":"Instinto de Combate","description":"Uma vez por rodada, em empate numérico de teste oposto de combate, gaste 1 PM para somar +2 ao próprio resultado."},{"ip":6,"name":"Adaptação Instintiva","description":"Uma vez por rodada, além da troca normal, pode mudar Postura ao perceber ação inimiga antes de sua resolução, sem gastar reação."},{"ip":7,"name":"Determinação Inabalável","description":"Uma vez por cena, após falhar em Resistência durante combate, gaste 3 PM e repita um d10, mantendo o novo resultado."},{"ip":10,"name":"Domínio Absoluto","description":"Uma vez por cena, gaste 5 PM para ativar por três turnos. Pode alternar Posturas livremente, usar técnica inicial de outra Postura e receber +2 em um teste de combate uma vez durante a ativação."}],"branches":{"Sentinela":[{"ip":2,"name":"Proteção Instintiva","description":"+2 na defesa ao interceptar ataque com Interposição; 0 PM."},{"ip":5,"name":"Dividir o Fardo","description":"Ao sofrer dano por Interposição, gaste 2 PM para reduzir 1d6 + CON do dano, uma vez por rodada."},{"ip":9,"name":"Última Barreira","description":"Uma vez por cena, gaste 4 PM em Interposição para +4 na defesa, metade do dano restante e +2 contra efeitos secundários."}],"Ruptor":[{"ip":2,"name":"Domínio de Espaço","description":"Ao alvo marcado tentar sair de seu alcance, reação de Confronto contra Mobilidade pode impedir deslocamento; 0 PM."},{"ip":5,"name":"Golpe Desestabilizador","description":"Após ataque acertado, 2 PM e Confronto contra Resistência para empurrar 2 m ou travar deslocamento voluntário."},{"ip":9,"name":"Cerco Implacável","description":"Uma vez por cena, 4 PM intensificam Marcação por duas rodadas: penalidade −4 e bônus +2 em Domínio de Espaço."}],"Batedor":[{"ip":2,"name":"Movimento Contínuo","description":"Após Avanço Impetuoso, desloque até 2 m extras mesmo errando o ataque, uma vez por turno; 0 PM."},{"ip":5,"name":"Mudança de Trajetória","description":"Gaste 2 PM para elevar Passos Decididos a +4 em contornos e obstáculos, uma vez por turno."},{"ip":9,"name":"Investida Fantasma","description":"Uma vez por cena, 4 PM concedem +6 m no turno, impedem reações por passagem e elevam Avanço Impetuoso a +4."}]},"choices":{"4":[{"ip":4,"name":"Proteção Estendida","description":"Interposição protege aliado até 3 m, desde que alcançável."},{"ip":4,"name":"Ameaça Persistente","description":"Mantém Marcação após o primeiro ataque falho contra inimigo já marcado, nas condições previstas."},{"ip":4,"name":"Impulso Controlado","description":"+2 no próximo teste de Mobilidade após Avanço Impetuoso, até o fim do turno."}],"8":[{"ip":8,"name":"Amparo Firme","description":"Com Interposição, gaste 2 PM para reduzir mais 3 do dano recebido, uma vez por rodada."},{"ip":8,"name":"Abertura Forçada","description":"Ao vencer Confronto oposto contra alvo marcado, dá +2 ao próximo ataque de aliado contra ele."},{"ip":8,"name":"Arrancada Decisiva","description":"Gaste 2 PM antes de Avanço Impetuoso para receber mais 3 m de deslocamento no turno."}]}},"Analista":{"base":[{"ip":1,"name":"Mente Investigativa","description":"Inicia cada cena com 2 Pontos de Dedução (PD), máximo 3; uma descoberta nova relevante recupera 1 PD uma vez por cena."},{"ip":1,"name":"Leitura de Cena","description":"Gaste 1 PD para fazer uma pergunta objetiva e fundamentada ao mestre após observar pessoa, objeto ou local."},{"ip":1,"name":"Conexão de Pistas","description":"Gaste 2 PD para solicitar conexão plausível entre ao menos duas evidências relevantes."},{"ip":1,"name":"Antecipação","description":"Gaste 1 PD para alertar aliado de perigo iminente e conceder +2 a teste diretamente destinado a evitá-lo."},{"ip":3,"name":"Raciocínio Adaptativo","description":"Uma vez por cena, gaste 1 PD para repetir um d10 após falha em investigação, observação ou análise. O novo resultado vale."},{"ip":6,"name":"Mente Expandida","description":"Inicia cenas com 3 PD, máximo 5; recupera 1 PD até duas vezes por cena após descobertas novas e distintas."},{"ip":7,"name":"Hipótese Confirmada","description":"Uma vez por cena, gaste 2 PD para avaliar hipótese com duas evidências. Se sustentada, recupere 1 PD ou conceda +2 em teste ligado a ela."},{"ip":10,"name":"Consciência Analítica","description":"Uma vez por cena, por 3 PD, ativa análise por três rodadas ou sequência de investigação. Reduz custos de técnicas, permite pergunta gratuita e bônus +4 conforme condições do livro."}],"branches":{"Reconstrutor":[{"ip":2,"name":"Reconstrução de Cena","description":"1 PD: obtenha sequência parcial provável fundamentada nas evidências da cena."},{"ip":5,"name":"Vestígios Ocultos","description":"1 PD: identifique indício discreto ou contradição; se não existir evidência adequada, não gasta PD."},{"ip":9,"name":"Reconstrução Definitiva","description":"Uma vez por cena, por 3 PD e com três evidências, obtenha sequência, conexão e lacuna ainda não esclarecida."}],"Estrategista":[{"ip":2,"name":"Plano de Contingência","description":"1 PD: plano específico concede +2 em teste relacionado de até dois aliados até o fim da cena."},{"ip":5,"name":"Análise de Vulnerabilidade","description":"2 PD: encontre limitação sustentada e dê +2 uma vez a aliado que a explore."},{"ip":9,"name":"Estratégia Magistral","description":"3 PD: até três aliados recebem benefício único de +2 em teste do plano ou repetição de d10 para evitar perigo previsto."}],"Perfilador":[{"ip":2,"name":"Leitura Comportamental","description":"1 PD: inferência fundamentada sobre emoções, motivações ou padrões observados; não lê pensamentos."},{"ip":5,"name":"Padrão Previsível","description":"2 PD: uma vez por cena, receba +4 em teste contra padrão ou +2 a aliado alertado."},{"ip":9,"name":"Perfil Psicológico","description":"3 PD: infira motivação, padrão e vulnerabilidade; a Intervenção Calculada dá +4 a teste apropriado."}]},"choices":{"4":[{"ip":4,"name":"Olhar Minucioso","description":"Por 1 PD, Leitura de Cena permite duas perguntas sobre o mesmo alvo."},{"ip":4,"name":"Associação Brilhante","description":"Uma vez por cena, Conexão de Pistas custa 1 PD, em vez de 2."},{"ip":4,"name":"Aviso Preciso","description":"Antecipação alerta até dois aliados com +2 para evitar o mesmo perigo."}],"8":[{"ip":8,"name":"Olhar Revelador","description":"Uma vez por cena, gaste +1 PD em Leitura de Cena para obter detalhe relevante para investigar."},{"ip":8,"name":"Síntese Analítica","description":"Uma vez por cena, Conexão de Pistas também oferece próximo rumo ou +2 em teste ligado à conexão."},{"ip":8,"name":"Antevisão Tática","description":"Uma vez por cena, gaste +1 PD em Antecipação e permita +4 ou repetir um d10 em teste de aliado."}]}},"Canalizador":{"base":[{"ip":1,"name":"Modulações iniciais · Expansão, Persistência e Intensificação","description":"Expansão: +2 PM para aumentar o alcance em 3 metros. Persistência: +2 PM para acrescentar uma rodada à duração. Intensificação: +4 PM para acrescentar um dado elegível, limitado a d12 no tipo. Uma Modulação por ritual, exceto quando habilidade explícita permitir, como Trama Dupla."},{"ip":3,"name":"Economia","description":"Economia de Ressonância — 1 vez por cena, reduza em 2 PM o custo de uma Modulação aplicada a um ritual, até o mínimo de 0 PM. Não reduz o custo-base do ritual nem o custo de aprimoramentos.","recovered":true},{"ip":6,"name":"Ressonância Profunda","description":"Economia de Ressonância pode ser usada duas vezes por cena, obrigatoriamente em dois rituais diferentes. Cada uso reduz 2 PM de uma Modulação. Não acumule duas reduções no mesmo ritual.","recovered":true},{"ip":7,"name":"Consciência Resiliente","description":"1 vez por cena, após falhar em Resistência contra efeito paranormal, gaste 2 PM e escolha: repetir um d10 do teste (o novo resultado é obrigatório) OU reduzir em 3 a perda involuntária de PM. Reduções equivalentes não se acumulam.","recovered":true},{"ip":10,"name":"Consciência em Ressonância","description":"1 vez por cena, como ação, gaste 6 PM para ativar por 3 rodadas. Condução Instintiva: uma vez por rodada, reduza em 2 PM o custo de uma Modulação aplicada a um ritual próprio; não acumula com Economia de Ressonância. Percepção Expandida: receba informação fundamentada sobre uma alteração, risco ou oportunidade paranormal. Ajuste Decisivo: gaste 2 PM adicionais para +4 em teste próprio de Anomalias diretamente ligado ao paranormal.","recovered":true}],"branches":{"Tecelão":[{"ip":2,"name":"Tecelagem Precisa","description":"1 vez por cena, ao usar uma Modulação, pague +2 PM para aprimorá-la: Expansão passa a +6 m; Persistência passa a +2 rodadas; Intensificação permite repetir o dado principal e obriga a manter o novo resultado. Mantém o limite de uma Modulação por ritual.","recovered":true},{"ip":5,"name":"Trama Dupla","description":"1 vez por cena, pague +2 PM para usar duas Modulações diferentes no mesmo ritual, pagando também o custo de ambas. Tecelagem Precisa aprimora apenas uma das duas; Economia de Ressonância reduz apenas uma.","recovered":true},{"ip":9,"name":"Trama Magistral","description":"1 vez por cena, ao usar Trama Dupla, pague +4 PM adicionais: as duas Modulações recebem aprimoramento de Tecelagem Precisa, e o custo combinado das Modulações é reduzido em 2 PM. Não combine Economia de Ressonância nessa execução; o limite de dado permanece 1d12.","recovered":true}],"Âncora":[{"ip":2,"name":"Estabilidade Compartilhada","description":"Reação, 1 vez por rodada, 2 PM. Proteja a si mesmo ou um aliado a até 3 m: conceda +2 em Resistência contra efeito paranormal ou reduza em 2 a perda involuntária de PM causada por ele.","recovered":true},{"ip":5,"name":"Campo de Estabilidade","description":"Ação, 4 PM, 1 vez por cena. Crie um campo de raio 3 m durante 3 rodadas: protegidos recebem +2 em Resistência mental e reduzem em 2 a primeira perda involuntária de PM de cada um durante a duração. Não se acumula com proteções equivalentes.","recovered":true},{"ip":9,"name":"Bastião da Consciência","description":"1 vez por cena, ao ativar Campo de Estabilidade, pague +4 PM (8 PM no total). Amplie o raio para 6 m e, por 3 rodadas, conceda +4 em Resistência mental e redução de 4 na primeira perda involuntária de PM de cada protegido. Não se acumula com efeitos equivalentes.","recovered":true}],"Dissonante":[{"ip":2,"name":"Interferência de Ressonância","description":"Ação, 2 PM, 1 vez por cena, alcance 6 m. Faça um teste de Consciência + Anomalias contra manifestação compatível. Em resultado Bom ou Extremo, escolha: Ruído Paranormal (−2/−4 no próximo teste relacionado da manifestação); Descompasso (+2/+4 no próximo teste específico para resistir ou investigar efeito contínuo); Oscilação (perturba componente sensorial secundário por um instante no Bom ou até o início do próximo turno no Extremo). Não causa dano, remove condições ou cancela manifestações; sem teste aplicável, Ruído não pode ser escolhido; efeitos equivalentes não se acumulam.","recovered":true},{"ip":5,"name":"Fratura de Padrão","description":"Ação, 4 PM, 1 vez por cena, alcance 6 m. Após observar um padrão paranormal recorrente, faça teste de Consciência + Anomalias. Resultado Bom: adia a próxima ocorrência até o fim do próximo turno. Resultado Extremo: adia por até 2 rodadas. Não cancela a manifestação nem impede ações independentes.","recovered":true},{"ip":9,"name":"Colapso de Padrão","description":"1 vez por cena, ao usar Fratura de Padrão, pague +4 PM (8 PM no total). Suspenda um padrão recorrente observado por 2 rodadas no resultado Bom ou 3 no Extremo. Conceda +2 em um teste para explorar a abertura criada. Não cancela manifestações nem ações independentes.","recovered":true}]},"choices":{"4":[{"name":"Sintonia Ampliada","description":"Reação, 1 vez por cena. Pague 2 PM adicionais e o custo da Modulação para aplicá-la a um ritual compatível conjurado por aliado a até 3 m. Máximo de uma Modulação por ritual.","ip":4,"recovered":true},{"name":"Controle de Fluxo","description":"1 vez por cena, após falhar em teste de Anomalias diretamente relacionado ao paranormal, gaste 2 PM para repetir um dos d10; mantenha o novo resultado.","ip":4,"recovered":true},{"name":"Sensibilidade Profunda","description":"1 vez por cena, gaste 2 PM para investigar Estrutura, Instabilidade ou Vínculo de uma manifestação ativa. O mestre só fornece informação pertinente, fundamentada no fenômeno. Se não houver informação pertinente, não gaste os PM.","ip":4,"recovered":true}],"8":[{"name":"Convergência Ritual","description":"Reação, 1 vez por cena, sobre ritual de aliado a até 3 m. Escolha: Condução Conjunta (gaste 4 PM para conceder +4 ao teste ritualístico) OU Fluxo Compartilhado (assuma até 4 PM do custo normal do ritual, sem taxa adicional). Não pode combinar com Sintonia Ampliada.","ip":8,"recovered":true},{"name":"Harmonia da Consciência","description":"Reação, 1 vez por cena, 2 PM, para você ou aliado a até 3 m que falhou em Resistência mental contra efeito paranormal. Repita um d10, mantendo o novo resultado, OU adie uma condição mental temporária até o fim do próximo turno. Não combine a repetição com Consciência Resiliente.","ip":8,"recovered":true},{"name":"Leitura da Ruptura","description":"Ação, 4 PM, 1 vez por cena, alcance 6 m. Teste Consciência + Anomalias para identificar uma condição real que altere uma manifestação. Bom: revela a condição e como explorá-la. Extremo: além disso, escolha +4 num teste relacionado ou +2 em Anomalias na exploração. Não inventa fraquezas nem modifica o fenômeno. Se não existir condição pertinente, não gaste PM.","ip":8,"recovered":true}]}}};
  const exilioAttr=['potencia','destreza','constituicao','raciocinio','consciencia','expressao'];
  const exilioAttrNames={potencia:'Potência',destreza:'Destreza',constituicao:'Constituição',raciocinio:'Raciocínio',consciencia:'Consciência',expressao:'Expressão'};
  function ipLevel(){return clampParanormalInfluence(state.paranormalInfluence);}
  function progression(){
    if(!state.exilioProgression||typeof state.exilioProgression!=='object')state.exilioProgression={};
    const p=state.exilioProgression;
    p.branch=p.branch||{};p.choice=p.choice||{};p.attrs=p.attrs||{};p.domains=p.domains||{};
    return p;
  }
  function reconcileIPBonuses(){
    const ip=ipLevel();
    const alias={Combatente:'Vanguarda',Especialista:'Analista',Ocultista:'Canalizador'};
    const klass=alias[state.origin]||state.origin;
    const rate=exilioGrowth[klass]||[0,0];
    const wanted={life:rate[0]*ip,sanity:rate[1]*ip};
    const previous=state.exilioResourceLedger||{life:0,sanity:0};
    const dl=wanted.life-(Number(previous.life)||0),dm=wanted.sanity-(Number(previous.sanity)||0);
    if(!dl&&!dm)return false;
    state.resources=state.resources||{};
    for(const [key,diff] of [['life',dl],['sanity',dm]]){
      const old=state.resources[key]||{current:100,max:100};
      const max=Math.max(1,Math.min(9999,(Number(old.max)||100)+diff));
      const current=Math.max(0,Math.min(max,Number(old.current)||0));
      state.resources[key]={current,max};
    }
    state.exilioResourceLedger={...wanted,ip,klass};
    return true;
  }
  const exilioPostureNames=['Guarda','Pressão','Investida'];
  function currentExilioPosture(){
    const selected=progression().posture;
    return exilioPostureNames.includes(selected)?selected:'Guarda';
  }
  function exilioPostureAbility(){
    const name=currentExilioPosture();
    return {
      ip:1,klass:'Vanguarda',kind:'posture-choice',name:'Posturas de Combate',
      category:'POSTURA · '+name.toUpperCase(),
      description:'Postura ativa: '+name+'. Clique para conhecer Guarda, Pressão e Investida e escolher qual usar.'
    };
  }
  function classUnlocked(klass){
    const book=exilioBook[klass];if(!book)return [];
    const p=progression(),ip=ipLevel(),branch=p.branch[klass],enh=p.choice[klass]||{};
    // Uma única habilidade selecionável reúne todas as Posturas, não uma ficha para cada técnica.
    const entries=book.base.filter(x=>x.ip<=ip&&!x.postura).map(x=>({...x,klass}));
    if(klass==='Vanguarda'&&ip>=1)entries.unshift(exilioPostureAbility());
    for(const x of book.branches[branch]||[])if(x.ip<=ip)entries.push({...x,klass,branch});
    for(const [level,options] of Object.entries(book.choices)){
      if(Number(level)>ip)continue;
      const selected=options.find(x=>x.name===enh[level]);
      if(selected)entries.push({...selected,klass});
      else if(enh[level])entries.push({ip:Number(level),klass,name:enh[level],
        description:'Escolha personalizada preservada de uma versão anterior da ficha. Consulte o mestre para confirmar o efeito.',
        legacyChoice:true});
    }
    return entries;
  }
  function allClassAbilities(klass){
    const book=exilioBook[klass];if(!book)return [];
    const entries=book.base.filter(x=>!x.postura).map(x=>({...x,klass}));
    if(klass==='Vanguarda')entries.unshift(exilioPostureAbility());
    for(const [branch,items] of Object.entries(book.branches))for(const x of items)entries.push({...x,klass,branch});
    for(const items of Object.values(book.choices))for(const x of items)entries.push({...x,klass});
    return entries.sort((a,b)=>a.ip-b.ip||a.name.localeCompare(b.name,'pt-BR'));
  }
  function showAbility(entry,owned){
    const isPosture=entry.kind==='posture-choice';
    const mayChoose=isPosture&&owned&&state.origin==='Vanguarda'&&ipLevel()>=1;
    const selectedPosture=currentExilioPosture();
    $('exilio-detail-title').textContent=entry.name;
    $('exilio-detail-tag').textContent=entry.klass==='Ocupação'?'OCUPAÇÃO · EXÍLIO 3.0':(entry.klass||'EXÍLIO')+' · IP '+entry.ip;
    $('exilio-detail-description').textContent=isPosture
      ?'Só uma Postura fica ativa por vez. A troca gratuita ocorre no seu turno; a partir do IP 6, Adaptação Instintiva permite também uma troca reativa por rodada ao perceber ação inimiga.'
      :entry.description;
    const options=$('exilio-detail-choices');
    options.replaceChildren();
    options.hidden=!isPosture;
    if(isPosture){
      for(const name of exilioPostureNames){
        const effects=exilioBook.Vanguarda.base.filter(ability=>ability.postura===name);
        const button=document.createElement('button');
        button.type='button';button.className='exilio-posture-option';
        const active=name===selectedPosture;
        button.setAttribute('aria-pressed',String(active));
        button.disabled=!mayChoose;
        const heading=document.createElement('span');heading.className='exilio-posture-option-head';
        const title=document.createElement('strong');title.textContent=name;
        const stateLabel=document.createElement('small');stateLabel.textContent=active?'ATIVA':mayChoose?'SELECIONAR':'PRÉVIA';
        heading.append(title,stateLabel);button.append(heading);
        for(const ability of effects){
          const effect=document.createElement('span');effect.className='exilio-posture-effect';
          const strong=document.createElement('b');strong.textContent=ability.name.replace(name+' · ','')+': ';
          effect.append(strong,document.createTextNode(ability.description));button.append(effect);
        }
        if(mayChoose)button.addEventListener('click',()=>{
          if(currentExilioPosture()===name)return;
          progression().posture=name;
          display();save();
          // Atualiza o card e o conteúdo da janela, preservando a seleção registrada.
          showAbility(exilioPostureAbility(),true);
          const focused=options.querySelectorAll('.exilio-posture-option')[exilioPostureNames.indexOf(name)];
          focused?.focus();
        });
        options.append(button);
      }
    }
    $('exilio-detail-status').textContent=isPosture
      ?(mayChoose?'Postura ativa: '+selectedPosture+'. Clique em outra opção para alternar. A ficha salva a escolha.':'Prévia de Posturas. Escolha Vanguarda no IP 1 para habilitar a troca.')
      :entry.legacyChoice?'Escolha personalizada do personagem.'
      :owned?'Habilidade adquirida.':'Prévia. Para adquirir, avance IP e faça as escolhas necessárias.';
    const dialog=$('exilio-detail-dialog');
    if(!dialog.open)dialog.showModal();
  }
  function addAbilityCard(entry,target,owned){
    const b=document.createElement('button');
    b.type='button';
    b.className='exilio-ability-card exilio-name-only'+(owned?'':' locked');
    const title=document.createElement('strong');
    title.textContent=entry.name;
    b.append(title);
    b.title=owned?'Clique para ver a habilidade':'Habilidade bloqueada · clique para consultar';
    b.setAttribute('aria-label',entry.name+(owned?'. Abrir descrição da habilidade.':'. Bloqueada; consultar descrição.'));
    b.addEventListener('click',()=>showAbility(entry,owned));
    target.append(b);
  }
  function pendingIP(){
    const klass=state.origin,ip=ipLevel(),p=progression();
    if(!ip)return 0;
    if(!exilioBook[klass])return 1;
    let n=ip>=2&&!p.branch[klass]?1:0;
    for(const level of [3,6,9])if(level<=ip&&!p.attrs[level])n++;
    for(const level of [2,4,7,10])if(level<=ip)n+=Math.max(0,2-(p.domains[level]||[]).length);
    for(const level of [4,8])if(level<=ip&&exilioBook[klass].choices[level]&&!p.choice[klass]?.[level])n++;
    // Aprimoramentos do Canalizador são escolhas normais da tabela, contadas acima.
    return n;
  }
  // Duas abas independentes no painel: ocupação e classe, sem misturar os cards.
  let exilioAbilitySection='classe';
  function setExilioAbilitySection(section){
    exilioAbilitySection=section==='ocupacao'?'ocupacao':'classe';
    renderAbilities();
  }
  function renderAbilities(){
    const list=$('exilio-abilities-cards');list.replaceChildren();
    const occupationTab=exilioAbilitySection==='ocupacao';
    const klass=state.origin||'Mundano';
    const oc=occupations.find(x=>x.name===state.occupation);
    const active=classUnlocked(klass);
    const classTab=$('exilio-class-tab'),jobTab=$('exilio-occupation-tab');
    classTab.setAttribute('aria-selected',String(!occupationTab));
    jobTab.setAttribute('aria-selected',String(occupationTab));
    classTab.tabIndex=occupationTab?-1:0;
    jobTab.tabIndex=occupationTab?0:-1;
    list.setAttribute('aria-labelledby',occupationTab?'exilio-occupation-tab':'exilio-class-tab');
    if(occupationTab){
      $('exilio-ability-count').textContent='OCUPAÇÃO';
      $('exilio-abilities-status').textContent=oc?oc.name+' · Vivência disponível':'Nenhuma ocupação selecionada';
      if(oc){
        addAbilityCard({ip:0,klass:'Ocupação',category:'VIVÊNCIA',name:oc.vivenciaName,description:oc.vivencia},list,true);
      }
    }else{
      $('exilio-ability-count').textContent='HABILIDADES · '+active.length;
      const pending=pendingIP();
      $('exilio-abilities-status').textContent=klass+' · IP '+ipLevel()+(pending?' · '+pending+' escolha(s) pendente(s)':' · ganhos automáticos aplicados');
      for(const entry of active)addAbilityCard(entry,list,true);
      $('exilio-progress-open').classList.toggle('has-pending',pending>0);
    }
  }
  $('exilio-occupation-tab').addEventListener('click',()=>setExilioAbilitySection('ocupacao'));
  $('exilio-class-tab').addEventListener('click',()=>setExilioAbilitySection('classe'));
  for(const [button,other,target] of [
    ['exilio-occupation-tab','exilio-class-tab','classe'],
    ['exilio-class-tab','exilio-occupation-tab','ocupacao']
  ]){
    $(button).addEventListener('keydown',event=>{
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
        event.preventDefault();setExilioAbilitySection(target);$(other).focus();
      }
    });
  }
  function renderAbilityCatalog(){
    const klass=$('exilio-catalog-class').value,items=allClassAbilities(klass);
    const owned=new Set(classUnlocked(klass).map(e=>e.name));
    const list=$('exilio-catalog-list');list.replaceChildren();
    $('exilio-catalog-summary').textContent=klass+' · '+items.length+' técnicas e opções. Clique para ver a descrição.';
    for(const entry of items)addAbilityCard(entry,list,state.origin===klass&&owned.has(entry.name));
  }
  function block(root,name,description){
    const article=document.createElement('section');article.className='exilio-progress-card';
    const h=document.createElement('h3');h.textContent=name;article.append(h);
    if(description){const p=document.createElement('p');p.textContent=description;article.append(p);}
    root.append(article);return article;
  }
  function action(parent,title,fn){
    const b=document.createElement('button');b.type='button';b.textContent=title;b.className='exilio-progress-action';
    b.addEventListener('click',fn);parent.append(b);
  }
  function chooseAttribute(level,key){
    const p=progression(),value=Number(state.attrs[key])||0;
    if(p.attrs[level]||level>ipLevel()||value>=5)return;
    state.attrs[key]=value+1;p.attrs[level]=key;
    if(key==='constituicao'||key==='consciencia'){
      const id=key==='constituicao'?'life':'sanity';
      const old=state.resources?.[id]||{current:100,max:100};
      state.resources[id]={...old,max:Math.min(9999,Number(old.max)+2)};
    }
    display();save();renderProgressChoices();
  }
  function chooseDomain(level,name){
    const p=progression(),chosen=p.domains[level]||[],value=Number(state.skillDomains?.[name])||0;
    if(level>ipLevel()||chosen.length>=2||chosen.some(x=>x.name===name)||!skillNames.includes(name))return;
    if(value===6||value===2&&level<4||value===4&&level<7)return;
    if(value===4&&skillNames.filter(n=>Number(state.skillDomains?.[n])===6).length>=2)return;
    p.domains[level]=[...chosen,{name,from:value,to:value+2}];
    setIndependentSkillDomain(name,value+2);
    display();save();renderProgressChoices();
  }
  function renderProgressChoices(){
    const root=$('exilio-progress-choices');root.replaceChildren();
    const ip=ipLevel(),klass=state.origin,p=progression();
    const l=state.exilioResourceLedger||{life:0,sanity:0};
    $('exilio-progress-summary').textContent=klass+' · IP '+ip+' · bônus fixos acumulados: +'+l.life+' PV máximos / +'+l.sanity+' PM máximos. IP não cura pontos perdidos.';
    if(ip===0){block(root,'IP 0 · Mundano','O primeiro contato abre a escolha da classe no IP 1.');return;}
    if(!exilioBook[klass]){
      const area=block(root,'Classe pendente','Escolha Vanguarda, Analista ou Canalizador para receber os ganhos de classe.');
      action(area,'ESCOLHER CLASSE',()=>{$('exilio-progress-dialog').close();renderOrigins();$('origin-dialog').showModal();});
      return;
    }
    if(ip>=2){
      const selected=p.branch[klass],area=block(root,'IP 2 · Especialização',selected?'Escolhida: '+selected:'Escolha sua especialização.');
      if(!selected)for(const name of Object.keys(exilioBook[klass].branches))action(area,name,()=>{p.branch[klass]=name;display();save();renderProgressChoices();});
    }
    for(const level of [3,6,9]){
      if(level>ip)continue;
      const current=p.attrs[level],area=block(root,'IP '+level+' · +1 atributo',current?'Escolhido: '+exilioAttrNames[current]:'Escolha um atributo. Constituição concede +2 PV máximos; Consciência, +2 PM máximos.');
      if(!current)for(const key of exilioAttr)if((Number(state.attrs[key])||0)<5)action(area,exilioAttrNames[key]+' ('+(Number(state.attrs[key])||0)+')',()=>chooseAttribute(level,key));
    }
    for(const level of [2,4,7,10]){
      if(level>ip)continue;
      const list=p.domains[level]||[],area=block(root,'IP '+level+' · 2 melhorias de Domínio',list.length+'/2 recebidas. Cada perícia só pode avançar uma vez por marco.');
      for(const item of list){const line=document.createElement('p');line.textContent=item.name+' · +'+item.from+' → +'+item.to;area.append(line);}
      if(list.length<2){
        const row=document.createElement('div');row.className='exilio-progress-row';
        const select=document.createElement('select');select.setAttribute('aria-label','Melhoria de Domínio no IP '+level);
        for(const name of skillNames){
          const value=Number(state.skillDomains?.[name])||0;
          if(value===6||value===2&&level<4||value===4&&level<7||list.some(x=>x.name===name))continue;
          if(value===4&&skillNames.filter(n=>Number(state.skillDomains?.[n])===6).length>=2)continue;
          const option=document.createElement('option');option.value=name;option.textContent=name+' (+ '+value+' → '+(value+2)+')';select.append(option);
        }
        if(select.options.length){row.append(select);action(row,'APLICAR',()=>chooseDomain(level,select.value));area.append(row);}
        else{const hint=document.createElement('p');hint.textContent='Sem perícia elegível para melhoria neste momento.';area.append(hint);}
      }
    }
    for(const level of [4,8]){
      if(level>ip)continue;
      const options=exilioBook[klass].choices[level]||[];
      if(!options.length)continue;
      const selected=p.choice[klass]?.[level],area=block(root,'IP '+level+' · Aprimoramento',selected?'Escolhido: '+selected:'Escolha um aprimoramento permanente.');
      if(!selected)for(const ability of options)action(area,ability.name,()=>{
        p.choice[klass]=p.choice[klass]||{};p.choice[klass][level]=ability.name;
        display();save();renderProgressChoices();
      });
    }

    const other=block(root,'Habilidades adquiridas automaticamente','Os cards são liberados nos IP correspondentes. O Catálogo também mostra técnicas de níveis futuros.');

  }
  $('exilio-catalog-open').addEventListener('click',()=>{
    $('exilio-catalog-class').value=exilioBook[state.origin]?state.origin:'Vanguarda';
    $('origin-dialog').close();
    renderAbilityCatalog();$('exilio-catalog-dialog').showModal();
  });
  $('exilio-catalog-class').addEventListener('change',renderAbilityCatalog);
  $('exilio-catalog-close').addEventListener('click',()=>$('exilio-catalog-dialog').close());
  $('exilio-detail-close').addEventListener('click',()=>$('exilio-detail-dialog').close());
  $('exilio-progress-open').addEventListener('click',()=>{$('origin-dialog').close();renderProgressChoices();$('exilio-progress-dialog').showModal();});
  $('exilio-progress-close').addEventListener('click',()=>$('exilio-progress-dialog').close());

  // Arte do Photoshop: mantém a imagem vinculada ao estado da ficha e sincronizável.
  // O fundo padrão é a imagem do Mestre; imports novos podem substituí-la.
  let appliedSeasonBackground=null;
  function displayExilioArtAndAbilities(){
    const picture=state.exilioBackgroundVersion==='20261110'&&typeof state.exilioBackground==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/.test(state.exilioBackground)
      ? state.exilioBackground : '';
    if(picture!==appliedSeasonBackground){
      const sheet=$('sheet');
      if(picture){
        sheet.style.setProperty('background','#030303 url("'+picture+'") left top / 1920px 909px no-repeat','important');
      }else{
        sheet.style.removeProperty('background');
      }
      appliedSeasonBackground=picture;
    }
    renderAbilities();
  }
  $('exilio-background-choose').addEventListener('click',()=>$('exilio-background-file').click());
  $('exilio-background-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      toast('Escolha uma imagem JPG, PNG ou WebP.');return;
    }
    if(file.size>400000){
      toast('O fundo deve ter no máximo 400 KB. Use o JPG otimizado exportado do PSD.');return;
    }
    try{
      const url=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));
        reader.onerror=()=>reject(reader.error||new Error('Falha ao ler imagem'));reader.readAsDataURL(file);
      });
      const dims=await new Promise((resolve,reject)=>{
        const img=new Image();img.onload=()=>resolve([img.naturalWidth,img.naturalHeight]);
        img.onerror=reject;img.src=url;
      });
      if(dims[0]!==1920||dims[1]!==909){toast('O fundo precisa ter 1920 × 909 pixels.');return;}
      const previous=state.exilioBackground||'';const previousVersion=state.exilioBackgroundVersion;
      state.exilioBackground=url;state.exilioBackgroundVersion='20261110';displayExilioArtAndAbilities();
      try{localStorage.setItem(window.SeasonContext.stateKey,JSON.stringify(state));window.dispatchEvent(new Event('season:change'));}
      catch(error){
        state.exilioBackground=previous;state.exilioBackgroundVersion=previousVersion;displayExilioArtAndAbilities();
        toast('Sem espaço para salvar o fundo. Tente o JPG otimizado.');return;
      }
      toast('Novo fundo do Exílio aplicado e salvo!');
    }catch(error){toast('Não foi possível carregar o JPG.');}
  });
  $('exilio-background-clear').addEventListener('click',()=>{
    state.exilioBackground='';state.exilioBackgroundVersion='20261110';
    displayExilioArtAndAbilities();save();
    toast('Fundo padrão restaurado.');
  });
  function ensureExilioCreationResources(){
    if(state.resources?.life&&state.resources?.sanity)return false;
    const roll=()=>Array.from({length:3},()=>Math.floor(Math.random()*6)+1);
    const pv=roll(),pm=roll();
    const life=Math.max(1,pv.reduce((sum,n)=>sum+n,0)+8+2*(Number(state.attrs.constituicao)||0));
    const sanity=Math.max(1,pm.reduce((sum,n)=>sum+n,0)+14+2*(Number(state.attrs.consciencia)||0));
    state.resources={...state.resources,life:state.resources?.life||{current:life,max:life},sanity:state.resources?.sanity||{current:sanity,max:sanity}};
    state.exilioCreationRolls={pv,pm};
    state.exilioCreationAttrBase={constituicao:Number(state.attrs.constituicao)||0,consciencia:Number(state.attrs.consciencia)||0};
    return true;
  }
  function reconcileExilioCreationAttributes(){
    // Recalcula somente a parcela +2×CON/CNS da CRIAÇÃO, com os 3d6 já salvos.
    // Após IP 1, ganhos de atributo seguem a regra de avanço sem retroatividade.
    if(!state.exilioCreationRolls||ipLevel()!==0)return false;
    if(!state.exilioCreationAttrBase){
      state.exilioCreationAttrBase={constituicao:Number(state.attrs.constituicao)||0,consciencia:Number(state.attrs.consciencia)||0};
      return false; // não modificar ficha salva anterior que ainda não tinha registro do atributo base
    }
    let changed=false;
    for(const [key,resource] of [['constituicao','life'],['consciencia','sanity']]){
      const previous=Number(state.exilioCreationAttrBase[key])||0;
      const current=Number(state.attrs[key])||0;
      if(previous===current)continue;
      const existing=state.resources[resource],oldMax=Number(existing.max)||1;
      const max=Math.max(1,Math.min(9999,oldMax+(current-previous)*2));
      existing.max=max;
      existing.current=Number(existing.current)===oldMax?max:Math.max(0,Math.min(max,Number(existing.current)||0));
      state.exilioCreationAttrBase[key]=current;
      changed=true;
    }
    return changed;
  }
  function normalizeResource(value){
    const max=Math.max(1,Math.min(9999,Math.trunc(Number(value?.max)||1)));
    const current=Math.max(0,Math.min(max,Math.trunc(Number(value?.current) || 0)));
    return {current,max};
  }
  function displayResources(){
    state.resources=state.resources||{};
    for(const id of ['life','sanity']){
      const value=normalizeResource(state.resources[id]||{current:100,max:100});state.resources[id]=value;
      $(id+'-current').value=value.current;$(id+'-max').value=value.max;
      $(id+'-fill').style.width=(100*value.current/value.max)+'%';
      if(id==='sanity')$(id+'-bar').title=value.current===0?'COLAPSO MENTAL · incapacitado até recuperar PM':value.current*4<=value.max?'PERTURBADO · PM ≤25%':'PM: '+value.current+'/'+value.max;
      $(id+'-bar').setAttribute('aria-valuemin','0');$(id+'-bar').setAttribute('aria-valuemax',String(value.max));$(id+'-bar').setAttribute('aria-valuenow',String(value.current));$(id+'-bar').setAttribute('aria-valuetext',value.current+' de '+value.max);
    }
  }
  for(const id of ['life','sanity']){
    const update=()=>{state.resources[id]=normalizeResource({current:$(id+'-current').value,max:$(id+'-max').value});displayResources();save();};
    $(id+'-current').addEventListener('change',update);$(id+'-max').addEventListener('change',update);
    for(const [suffix,delta] of [['minus',-1],['plus',1]])$(id+'-'+suffix).addEventListener('click',()=>{$(id+'-current').value=Number($(id+'-current').value)+delta;update();});
  }


  // Aplicar o novo valor inicial uma vez; edições futuras permanecem salvas.
  if(!state.defenseZeroDefaultApplied){if(state.combat)state.combat.defense=0;state.defenseZeroDefaultApplied=true;save();}
  let editingAttack=null;
  const attackCriticalState={};
  function combatState(){if(!state.combat)state.combat={move:6,defense:0,attacks:[{id:'unarmed',name:'Ataque Desarmado',skill:'CONFRONTO',damage:'1d3',attr:'potencia',critical:0,mult:2}]};return state.combat;}
  function damageTerms(formula){
    const f=String(formula).toLowerCase().replace(/\s/g,'');
    if(!/^[+-]?(?:\d{0,2}d\d{1,3}|\d{1,4})(?:[+-](?:\d{0,2}d\d{1,3}|\d{1,4}))*$/.test(f))throw Error('Use uma fórmula como 1d3, 2d6 ou 2d6+1.');
    const terms=f.match(/[+-]?(?:\d*d\d+|\d+)/g);
    if(terms.length>10)throw Error('Use no máximo 10 termos.');
    return terms.map(t=>{const sign=t.startsWith('-')?-1:1;const raw=t.replace(/^[+-]/,'');if(raw.includes('d')){const [q,s]=raw.split('d');const count=Number(q||1),sides=Number(s);if(count<1||count>30||sides<2||sides>100)throw Error('Use de 1 a 30 dados, com 2 a 100 faces.');return {sign,count,sides};}return {sign,flat:Number(raw)};});
  }
  function rollDamage(formula,critical,bonus,random=Math.random,multiplier=2){
    let total=Number(bonus)||0;
    const dice=[];
    const times=critical?Math.max(1,Math.min(10,Math.trunc(Number(multiplier)||1))):1;
    for(const term of damageTerms(formula)){
      if(term.sides){
        // Multiplica a quantidade dos dados de dano, nunca o bônus fixo.
        for(let i=0;i<term.count*times;i++){
          const die=1+Math.floor(random()*term.sides);
          dice.push(die);total+=term.sign*die;
        }
      }else total+=term.sign*term.flat;
    }
    return {value:total,dice,lowest:false,multiplier:times};
  }
  function attackValues(a){
    const distance=/PRECISÃO|PONTARIA/i.test(String(a.skill||''))||a.ranged===true;
    const key=distance?'destreza':a.attackAttribute==='destreza'?'destreza':'potencia';
    const skill=distance?'PRECISÃO':'CONFRONTO';
    const attr=Number(state.attrs[key])||0;
    const domain=Number(state.skillDomains?.[skill])||0;
    const bonus=Number(state.skillBonuses?.[skill])||0;
    return {attr,domain,bonus,total:attr+domain+bonus,skill,distance,key};
  }
function equippedWeaponAttack(){
const inv=inventoryState(),item=inv.items.find(i=>i.id===inv.equipped.weapon&&i.type==='weapon');if(!item)return null;
const catalog=itemCatalog.find(c=>c.id===String(item.image||'').replace(/^catalog:/,''))||itemCatalog.find(c=>c.type==='weapon'&&c.name===item.name);
const field=label=>String(item.description||'').split('\n').find(l=>l.startsWith(label+':'))?.slice(label.length+1).trim();
const skill=/PONTARIA|PRECISÃO/i.test(String(field('Perícia')||catalog?.skill||'Confronto'))?'PRECISÃO':'CONFRONTO';
const criticalText=field('Crítico')||catalog?.crit||'×2';const equipmentMultiplier=criticalMultiplierFromText(criticalText);
const settings=combatState().weaponSettings?.[item.id]||{};
return {skill,damage:field('Dano')||catalog?.dmg||'',attr:skill==='CONFRONTO'?'potencia':'none',critical:0,mult:equipmentMultiplier,attacks:Math.max(1,Number(catalog?.atk)||1),range:catalog?.range||'',...settings,id:'equipped:'+item.id,itemId:item.id,name:item.name,image:inventoryArtworkSource(item),equipped:true};
}

function combatFallbackImage(unarmed){const shape=unarmed?'<path d="M10 32V19q0-6 6-6h2V9q0-5 5-5t5 5V7q0-5 5-5t5 5v2q0-5 5-5t5 5v5q0-5 5-5t5 5v19l-8 14H23L12 40Z"/><path d="M24 47h27v13H24Z"/>':'<path d="m48 5 8 8-28 28-8-8Z M15 30l20 20-5 5-20-20Z M17 43l7 7-12 12-7-7Z"/>';return 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="#ececec" stroke="#777" stroke-width="1.5">'+shape+'</svg>');}

function equippedArmorDefense(){
  const inv=inventoryState(),item=inv.items.find(i=>i.id===inv.equipped.armor&&i.type==='armor');
  if(!item)return {bonus:0,rd:0,name:''};
  const catalog=itemCatalog.find(c=>c.type==='armor'&&c.id===String(item.image||'').replace(/^catalog:/,''))||
                itemCatalog.find(c=>c.type==='armor'&&c.name===item.name);
  const parseDef=text=>{const m=String(text||'').match(/(?:fornece|concede)\s*\+?(\d+)\s*(?:de\s+)?defesa\b/i)||
                      String(text||'').match(/\bdefesa:\s*\+?(\d+)\b/i);return m?Number(m[1]):null;};
  const parseRD=text=>{const m=String(text||'').match(/\bRD(?:\s+física)?\s*[:+]?\s*(\d+)\b/i);return m?Number(m[1]):null;};
  const isLegacyRD=Boolean(catalog?.book3);
  const bonus=isLegacyRD?0:Math.max(0,Math.min(999,parseDef(item.description)??parseDef(catalog?.desc)??0));
  const rd=isLegacyRD?Math.max(0,Math.min(4,Number(catalog?.rd??parseRD(item.description)??0))):0;
  return {bonus,rd,name:item.name};
}
function totalCombatDefense(){return Math.max(0,(Number(combatState().defense)||0)+equippedArmorDefense().bonus);}
 
function ammoNormalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function weaponAmmoSpec(a){const item=a.itemId?inventoryState().items.find(i=>i.id===a.itemId):null;const catalog=itemCatalog.find(c=>c.type==='weapon'&&c.id===String(item?.image||'').replace(/^catalog:/,''))||itemCatalog.find(c=>c.type==='weapon'&&c.name===a.name);const field=label=>String(item?.description||'').split('\n').find(l=>l.startsWith(label+':'))?.slice(label.length+1).trim();const type=a.ammoType??field('Munição')??catalog?.ammo??'';const capacity=Math.max(0,Math.min(999,Math.trunc(Number(a.ammoCapacity??field('Capacidade')??catalog?.capacity)||0)));return type&&capacity?{type,capacity}:null;}
function ammoRemaining(a,spec){const value=combatState().ammunition?.[a.id];return value===undefined?spec.capacity:Math.max(0,Math.min(spec.capacity,Math.trunc(Number(value)||0)));}
function compatibleAmmo(type){return inventoryState().items.find(item=>{if(item.type!=='gear'||Number(item.quantity??1)<1)return false;if(item.location==='backpack'&&!equippedBackpack())return false;const catalog=itemCatalog.find(c=>c.id===String(item.image||'').replace(/^catalog:/,''))||itemCatalog.find(c=>c.name===item.name);return (catalog?.category==='Munições'&&ammoNormalize(catalog.ammo)===ammoNormalize(type))||ammoNormalize(item.name)==='municao '+ammoNormalize(type);});}
function changeWeaponAmmo(a,reload){const spec=weaponAmmoSpec(a);if(!spec)return;const current=ammoRemaining(a,spec);if(reload&&current>=spec.capacity)return;if(!reload&&current<=0)return;const pack=reload?compatibleAmmo(spec.type):null;if(reload&&!pack){toast('Você precisa de munição '+spec.type.toLowerCase()+' no inventário para recarregar.');return;}const previousInventory=JSON.stringify(inventoryState()),previousAmmo=JSON.stringify(combatState().ammunition||{});const ammunition=combatState().ammunition||(combatState().ammunition={});ammunition[a.id]=reload?spec.capacity:current-1;if(pack){if(Number(pack.quantity??1)>1)pack.quantity=Number(pack.quantity)-1;else inventoryRemove(pack.id);}if(!inventoryPersist()){state.inventory=JSON.parse(previousInventory);combatState().ammunition=JSON.parse(previousAmmo);return;}renderInventory();}
function appendWeaponAmmo(card,a){const spec=weaponAmmoSpec(a);if(!spec)return;const current=ammoRemaining(a,spec),row=document.createElement('div');row.className='combat-ammo';const minus=document.createElement('button');minus.type='button';minus.textContent='−';minus.title='Gastar 1 munição';minus.setAttribute('aria-label',minus.title+' de '+a.name);minus.disabled=current===0;minus.onclick=()=>changeWeaponAmmo(a,false);const bar=document.createElement('div');bar.className='combat-ammo-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Munição de '+a.name);bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(spec.capacity));bar.setAttribute('aria-valuenow',String(current));bar.title='Munição '+spec.type;const bullets=document.createElement('span');bullets.className='combat-ammo-bullets';bullets.setAttribute('aria-hidden','true');for(let i=0;i<spec.capacity;i++){const bullet=document.createElement('span');bullet.className='combat-ammo-bullet'+(i>=current?' spent':'');bullets.append(bullet);}const text=document.createElement('span');text.className='combat-ammo-count';text.textContent=current+' / '+spec.capacity;bar.append(bullets,text);const reload=document.createElement('button');reload.type='button';reload.textContent='↻';reload.title='Recarregar — consome 1 pacote de munição '+spec.type.toLowerCase();reload.setAttribute('aria-label',reload.title);reload.disabled=current===spec.capacity;reload.onclick=()=>changeWeaponAmmo(a,true);row.append(minus,bar,reload);card.append(row);}

  function displayCombat(){
    const combat=combatState();$('combat-move').value=combat.move;$('combat-defense').value=totalCombatDefense();$('combat-move-squares').textContent='('+Number((Number(combat.move)||0)/1.5).toLocaleString('pt-BR',{maximumFractionDigits:1})+'q)';const protection=equippedArmorDefense();$('combat-defense').max=999;$('combat-defense').min=0;$('combat-defense').title='Defesa base: '+(Number(combat.defense)||0)+(protection.bonus?' · '+protection.name+': +'+protection.bonus+' Defesa':protection.rd?' · '+protection.name+': RD '+protection.rd:'');
    const list=$('combat-attacks');list.replaceChildren();
    for(const a of [...combat.attacks,...[equippedWeaponAttack()].filter(Boolean)]){
      const card=document.createElement('article');card.className='combat-card';
      const head=document.createElement('div');head.className='combat-card-head';const title=document.createElement('strong');title.textContent=a.name;title.title=a.equipped?'Arma equipada no inventário':a.name;head.append(title);const actions=document.createElement('details');actions.className='combat-actions';const toggle=document.createElement('summary');toggle.textContent='⌄';toggle.setAttribute('aria-label','Opções de '+a.name);actions.append(toggle);head.append(actions);
      const edit=document.createElement('button');edit.type='button';edit.textContent='✎';edit.title='Editar '+a.name;edit.setAttribute('aria-label',edit.title);edit.addEventListener('click',()=>openAttack(a));actions.append(edit);
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.title=(a.equipped?'Desequipar ':'Remover ')+a.name;remove.setAttribute('aria-label',remove.title);remove.addEventListener('click',()=>{if(a.equipped){inventoryEquip('weapon',null);delete attackCriticalState[a.id];save();renderInventory();}else{combat.attacks=combat.attacks.filter(w=>w.id!==a.id);delete attackCriticalState[a.id];save();displayCombat();}});actions.append(remove);card.append(head);
      const row=document.createElement('div');row.className='combat-roll-row';card.classList.add('combat-card-compact');if(a.equipped)card.classList.add('equipped-weapon-card');const image=document.createElement('img');image.className='combat-weapon-image';image.alt=a.name;const catalogImage=itemCatalog.find(c=>c.type==='weapon'&&c.name===a.name)?.image;image.src=a.image||((a.id==='unarmed'||/^Ataque Desarmado$/i.test(a.name))?'/temporada/assets/ataque-desarmado-punho.png':(catalogImage||combatFallbackImage(false)));card.append(image);
      const setCombatMetric=(element,value,label)=>{
        const number=document.createElement('span');number.className='combat-metric-value';number.textContent=value;
        const caption=document.createElement('span');caption.className='combat-metric-label';caption.textContent=label;
        element.replaceChildren(number,caption);
        element.setAttribute('aria-label',label+': '+value);
      };
      const attack=document.createElement('button');attack.type='button';
       const v=attackValues(a);setCombatMetric(attack,'2d10 '+(v.total>=0?'+ ':'− ')+Math.abs(v.total),(Number(a.attacks)||1)>1?'ATAQUE · '+a.attacks+' POR AÇÃO':'ATAQUE');
       attack.addEventListener('click',()=>{
         const current=attackValues(a),pool=rollPendingSkill(current.skill,current.total);
         const kept=pool.kept||pool.dice;
         const equal=kept.length===2&&kept[0]===kept[1];
         const mult=Math.max(1,Number(a.mult)||1);
         attackCriticalState[a.id]=equal&&mult>1;
         showSkillDice(pool,equal?(mult>1?'PAR IGUAL · CRÍTICO ×'+mult+' SE ACERTAR':'PAR IGUAL · SEM MULTIPLICADOR'):classifySkill(pool.value),a.name);
       });
      const damage=document.createElement('button');damage.type='button';const bonus=a.attr==='none'||attackValues(a).distance?0:Number(state.attrs.potencia)||0;setCombatMetric(damage,a.damage?a.damage+(bonus>=0?' +':' ')+bonus:'Configurar','DANO');damage.addEventListener('click',()=>{if(!a.damage){openAttack(a);return;}try{const crit=Boolean(attackCriticalState[a.id]);const b=a.attr==='none'||attackValues(a).distance?0:Number(state.attrs.potencia)||0;const mult=Math.max(1,Number(a.mult)||1);const pool=rollDamage(a.damage,crit,b,Math.random,mult);pool.detail='Dados: '+pool.dice.join(', ')+' · '+a.damage+' · bônus POT '+b+(crit?' · crítico ×'+mult+' nos dados, se o ataque acertou':'');showSkillDice(pool,crit?'DANO CRÍTICO ×'+mult:'DANO',a.name);delete attackCriticalState[a.id];}catch(e){toast(e.message);}});
      const critical=document.createElement('span');setCombatMetric(critical,'×'+Math.max(1,Math.trunc(Number(a.mult)||1)),'CRÍTICO');row.append(attack,damage,critical);card.append(row);appendWeaponAmmo(card,a);list.append(card);
    }
  }
  function openAttack(a=null){editingAttack=a?.id||null;$('attack-editor-title').textContent=a?'Editar ataque':'Adicionar ataque';$('attack-name').value=a?.name||'';$('attack-name').readOnly=Boolean(a?.equipped);$('attack-skill').value=/PRECISÃO|PONTARIA/.test(a?.skill||'')?'PRECISÃO':'CONFRONTO';$('attack-damage').value=a?.damage||'1d3';$('attack-attr').value=a?.attr==='none'?'none':'potencia';$('attack-mult').value=a?.mult??2;const ammo=a?weaponAmmoSpec(a):null;$('attack-ammo-type').value=ammo?.type||'';$('attack-ammo-capacity').value=ammo?.capacity||'';$('attack-error').textContent='';$('attack-editor').showModal();}
  $('combat-add').addEventListener('click',()=>openAttack());$('attack-close').addEventListener('click',()=>$('attack-editor').close());
  $('attack-form').addEventListener('submit',e=>{e.preventDefault();try{damageTerms($('attack-damage').value);const name=$('attack-name').value.trim();if(!name)throw Error('Digite o nome do ataque.');const a={id:editingAttack||'a'+Date.now()+Math.random().toString(36).slice(2),name,skill:$('attack-skill').value,damage:$('attack-damage').value.trim(),attr:$('attack-attr').value,critical:0,mult:Math.max(1,Math.min(4,Number($('attack-mult').value)||1)),ammoType:$('attack-ammo-type').value||undefined,ammoCapacity:$('attack-ammo-capacity').value?Math.max(1,Math.min(999,Number($('attack-ammo-capacity').value))):undefined};const c=combatState();if(editingAttack?.startsWith('equipped:')){const itemId=editingAttack.slice(9);c.weaponSettings=c.weaponSettings||{};c.weaponSettings[itemId]={skill:a.skill,damage:a.damage,attr:a.attr,critical:a.critical,mult:a.mult,ammoType:a.ammoType,ammoCapacity:a.ammoCapacity};}else if(editingAttack)c.attacks=c.attacks.map(w=>w.id===editingAttack?a:w);else c.attacks.push(a);delete attackCriticalState[a.id];save();displayCombat();$('attack-editor').close();}catch(error){$('attack-error').textContent=error.message;}});
  for(const [id,key] of [['combat-move','move'],['combat-defense','defense']])$(id).addEventListener('change',()=>{const bonus=key==='defense'?equippedArmorDefense().bonus:0;combatState()[key]=Math.max(0,Math.min(999,(Number($(id).value)||0)-bonus));save();displayCombat();});


  $('combat-defense').addEventListener('input',()=>{if($('combat-defense').value.trim()!=='')return;combatState().defense=0;$('combat-defense').value=0;save();displayCombat();});

  const pageTabs=Array.from(document.querySelectorAll('#sheet-tabs [role="tab"]'));
  let activeSheetPage='principal',pageTransitionVersion=0,pageAnimations=[];
  async function selectPage(name){
    const order=['principal','inventario','rituais'];if(!order.includes(name))return;
    const version=++pageTransitionVersion;
    pageAnimations.forEach(a=>a.cancel());pageAnimations=[];
    if(name===activeSheetPage)return;
    hideTools();closePanel();
    const previous=$('page-'+activeSheetPage),incoming=$('page-'+name);
    const direction=order.indexOf(name)>order.indexOf(activeSheetPage)?1:-1;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const animate=!reduced&&typeof previous.animate==='function';
    if(animate){
      const exit=previous.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX('+(-14*direction)+'px)'}],{duration:120,easing:'ease-in',fill:'forwards'});
      pageAnimations.push(exit);await exit.finished.catch(()=>{});
      if(version!==pageTransitionVersion)return;
    }
    for(const tab of pageTabs){const active=tab.dataset.page===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('page-'+tab.dataset.page).hidden=!active;}
    const portrait=$('portrait-stage');
    (name==='inventario'?$('inventory-portrait-canvas'):name==='rituais'?$('ritual-canvas'):sheet).append(portrait);
    $('tools-toggle').hidden=name!=='principal';
    activeSheetPage=name;updateScale();
    pageAnimations.forEach(a=>a.cancel());pageAnimations=[];
    if(animate){
      const enter=incoming.animate([{opacity:0,transform:'translateX('+(18*direction)+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
      pageAnimations.push(enter);await enter.finished.catch(()=>{});
      if(version===pageTransitionVersion){enter.cancel();pageAnimations=[];}
    }
  }
  pageTabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectPage(tab.dataset.page));
    tab.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(index+1)%pageTabs.length;else if(e.key==='ArrowLeft')next=(index+pageTabs.length-1)%pageTabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=pageTabs.length-1;else return;e.preventDefault();pageTabs[next].focus();selectPage(pageTabs[next].dataset.page);});
  });


  $('char-origin').addEventListener('click',()=>{renderOrigins();$('origin-dialog').showModal();});
  $('origin-close').addEventListener('click',()=>$('origin-dialog').close());
  $('origin-none').addEventListener('click',()=>{
    if(ipLevel()!==0){toast('Mundano é o estágio de IP 0.');return;}
    state.origin='Mundano';display();save();$('origin-dialog').close();
  });


  const originRules=[{"name":"Mundano","page":5,"description":"Pessoa comum antes do primeiro contato com o Exílio, no IP 0. Ainda não possui uma classe especializada.","rules":["Começa no IP 0 e escolhe uma classe ao atingir o IP 1.","PV iniciais: 3d6 + 8 + (Constituição × 2).","PM iniciais: 3d6 + 14 + (Consciência × 2)."],"progress":{},"cost":"Mundano é o estágio inicial, anterior a Vanguarda, Analista e Canalizador."},{"name":"Vanguarda","page":5,"description":"Classe focada em combate, Posturas e proteção dos aliados.","rules":["Ganha +5 PV máximos e +3 PM máximos por IP, incluindo IP 1.","Especializações: Sentinela, Ruptor e Batedor."],"progress":{},"cost":"O avanço de IP não restaura pontos de vida ou mentais já gastos."},{"name":"Analista","page":5,"description":"Classe de investigação, interpretação de pistas e planejamento, que utiliza Pontos de Dedução (PD).","rules":["Ganha +3 PV máximos e +5 PM máximos por IP, incluindo IP 1.","Especializações: Reconstrutor, Estrategista e Perfilador."],"progress":{},"cost":"PD são um recurso próprio, independente dos Pontos Mentais."},{"name":"Canalizador","page":5,"description":"Classe voltada aos rituais, Modulações e manifestações do Exílio.","rules":["Ganha +2 PV máximos e +6 PM máximos por IP, incluindo IP 1.","Especializações: Tecelão, Âncora e Dissonante."],"progress":{},"cost":"Os rituais utilizam Pontos Mentais conforme as regras do livro."}];
  // Pontos de Dedução não são Pontos Mentais: o Analista começa cenas com 2 PD
  // (máximo 3); no IP 6 passa a começar com 3 PD (máximo 5).
  function refreshAnalystPD(){
    const panel=$('exilio-analyst-pd'),widget=$('exilio-pd-widget');if(!panel||!widget)return;
    const eligible=state.origin==='Analista'&&ipLevel()>=1;
    panel.hidden=!eligible;
    widget.hidden=!eligible;
    if(!eligible)return;
    const max=ipLevel()>=6?5:3;
    const initialPD=ipLevel()>=6?3:2;
    if(!state.exilioPD||!Number.isFinite(Number(state.exilioPD.current)))state.exilioPD={current:initialPD};
    state.exilioPD.current=Math.max(0,Math.min(max,Math.trunc(Number(state.exilioPD.current)||0)));
    $('exilio-pd-current').textContent=String(state.exilioPD.current);
    $('exilio-pd-max').textContent=String(max);
    $('exilio-pd-guide').textContent='Início de cena: '+initialPD+' PD · máximo '+max+' PD. Pontos de Dedução não substituem PM.';
    $('exilio-pd-sheet-value').textContent=state.exilioPD.current+' / '+max;
    for(const id of ['exilio-pd-minus','exilio-pd-sheet-minus'])$(id).disabled=state.exilioPD.current===0;
    for(const id of ['exilio-pd-plus','exilio-pd-sheet-plus'])$(id).disabled=state.exilioPD.current===max;
  }
  for(const [id,delta] of [['exilio-pd-minus',-1],['exilio-pd-plus',1],['exilio-pd-sheet-minus',-1],['exilio-pd-sheet-plus',1]]){
    $(id).addEventListener('click',()=>{
      if(state.origin!=='Analista')return;
      refreshAnalystPD();
      state.exilioPD.current=Math.max(0,Math.min(ipLevel()>=6?5:3,state.exilioPD.current+delta));
      refreshAnalystPD();save();
    });
  }
  $('exilio-pd-new-scene').addEventListener('click',()=>{
    if(state.origin!=='Analista')return;
    state.exilioPD={current:ipLevel()>=6?3:2};
    refreshAnalystPD();save();toast('PD preparados para uma nova cena.');
  });
  // Recuperação Curta e Longa: rolagens independentes de PV e PM.
  const exilioRoll=(sides,count)=>Array.from({length:count},()=>Math.floor(Math.random()*sides)+1).reduce((a,b)=>a+b,0);
  function applyExilioRest(long){
    if(!state.resources?.life||!state.resources?.sanity)return;
    const shortCount=Math.max(0,Math.trunc(Number(state.exilioShortRests)||0));
    if(!long&&shortCount>=2){toast('O livro permite no máximo duas recuperações curtas entre longas.');return;}
    const life=state.resources.life,mental=state.resources.sanity;
    const pv=long?exilioRoll(6,2)+(Number(state.attrs.constituicao)||0):Math.max(1,exilioRoll(6,1)+(Number(state.attrs.constituicao)||0));
    const pm=long?exilioRoll(6,2)+(Number(state.attrs.consciencia)||0):Math.max(1,exilioRoll(6,1)+(Number(state.attrs.consciencia)||0));
    life.current=Math.min(life.max,(Number(life.current)||0)+Math.max(0,pv));
    mental.current=Math.min(mental.max,(Number(mental.current)||0)+Math.max(0,pm));
    state.exilioShortRests=long?0:shortCount+1;
    display();save();hideTools();
    toast((long?'Recuperação longa':'Recuperação curta')+': +'+pv+' PV / +'+pm+' PM (limitados pelos máximos).');
  }
  $('exilio-rest-short').addEventListener('click',()=>applyExilioRest(false));
  $('exilio-rest-long').addEventListener('click',()=>applyExilioRest(true));

  // A tabela de cada classe usa os mesmos dados do livro já aplicados à evolução.
  function classIPGainLabels(klass,ip){
    const book=exilioBook[klass];
    if(!book)return [];
    const gains=[];
    if(ip===1&&klass==='Vanguarda')gains.push('Posturas de Combate: Guarda, Pressão e Investida');
    for(const ability of book.base){
      if(ability.ip===ip&&!ability.postura)gains.push(ability.name);
    }
    if(ip===1&&klass==='Analista')gains.push('PD: 2 no início da cena, máximo 3');
    if(ip===6&&klass==='Analista')gains.push('PD: 3 no início da cena, máximo 5');
    if(ip===2)gains.push('Escolha a especialização: '+Object.keys(book.branches).join(', '));
    if([2,5,9].includes(ip)){
      const specialized=Object.entries(book.branches).map(([branch,skills])=>{
        const ability=skills.find(skill=>skill.ip===ip);
        return ability?branch+': '+ability.name:null;
      }).filter(Boolean);
      if(specialized.length)gains.push('Habilidade da especialização — '+specialized.join(' • '));
    }
    if([4,8].includes(ip)){
      const options=book.choices[ip]||[];
      if(options.length)gains.push('Escolha 1 aprimoramento: '+options.map(x=>x.name).join(' • '));
    }
    if([3,6,9].includes(ip))gains.push('+1 atributo à escolha');
    if([2,4,7,10].includes(ip))gains.push('2 melhorias de Domínio (nova perícia ou avanço)');
    return gains;
  }
  function classIPProgressionTable(klass){
    const growth=exilioGrowth[klass];
    if(!growth||!exilioBook[klass])return null;
    const wrapper=document.createElement('section');
    wrapper.className='origin-ip-progression';
    wrapper.setAttribute('aria-label','Progressão de '+klass+' do IP 1 ao IP 10');
    const heading=document.createElement('h4');
    heading.textContent='PROGRESSÃO · IP 1 AO 10';
    const table=document.createElement('table');
    const header=document.createElement('thead'),headRow=document.createElement('tr');
    for(const column of ['IP','PV / PM','Habilidades e melhorias']){
      const th=document.createElement('th');th.scope='col';th.textContent=column;headRow.append(th);
    }
    header.append(headRow);table.append(header);
    const body=document.createElement('tbody');
    for(let level=1;level<=10;level++){
      const row=document.createElement('tr');
      if(state.origin===klass&&ipLevel()>=level)row.className='origin-ip-reached';
      const number=document.createElement('th');number.scope='row';number.textContent=String(level);
      const resources=document.createElement('td');resources.className='origin-ip-resources';
      resources.textContent='+'+growth[0]+' PV / +'+growth[1]+' PM';
      const detail=document.createElement('td');
      detail.className='origin-ip-gains';
      for(const benefit of classIPGainLabels(klass,level)){
        const line=document.createElement('span');line.textContent=benefit;detail.append(line);
      }
      row.append(number,resources,detail);body.append(row);
    }
    table.append(body);
    const note=document.createElement('p');
    note.className='origin-ip-footnote';
    note.textContent='PV e PM indicam o ganho em cada IP, não o total acumulado. As opções de especialização e aprimoramento são alternativas, não ganhos simultâneos.';
    wrapper.append(heading,table,note);
    return wrapper;
  }
  function renderOrigins(){
    refreshAnalystPD();
    const list=$('origin-options');list.replaceChildren();
    for(const entry of originRules){
      const card=document.createElement('article');card.className='origin-card';
      const title=document.createElement('h3');title.textContent=entry.name;const desc=document.createElement('p');desc.textContent=entry.description;card.append(title,desc);
      const rules=document.createElement('ul');for(const text of entry.rules){const li=document.createElement('li');li.textContent=text;rules.append(li);}card.append(rules);
      if(exilioBook[entry.name])card.append(classIPProgressionTable(entry.name));
      if(Object.keys(entry.progress).length){const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='Progressão por IP';details.append(summary);for(const [nex,power] of Object.entries(entry.progress)){const row=document.createElement('p');row.textContent=nex+'% — '+power;if(Number(nex)<=Number(state.nex||0))row.className='origin-unlocked';details.append(row);}card.append(details);}
      const cost=document.createElement('p');cost.className='origin-cost';cost.textContent=entry.cost;card.append(cost);
      const source=document.createElement('small');source.textContent='EXÍLIO 3.0 — Livro Básico de Regras, p. '+entry.page+'.';card.append(source);
      const select=document.createElement('button');select.type='button';select.className='origin-select';const active=(state.origin??'Mundano')===entry.name;select.textContent=active?'Selecionado':'Escolher '+entry.name;select.setAttribute('aria-pressed',String(active));select.addEventListener('click',()=>{
        if(entry.name!=='Mundano'&&ipLevel()<1){toast('No IP 0 o personagem é Mundano. A classe é escolhida a partir do IP 1.');return;}
        if(entry.name==='Mundano'&&ipLevel()>=1){toast('Mundano pertence ao IP 0. Reduza o IP para 0 antes de voltar.');return;}
        state.origin=entry.name;display();save();$('origin-dialog').close();
      });card.append(select);list.append(card);
    }
  }


  const itemCatalog=[{"name":"Mochila","weight":0,"desc":"Uma mochila leve e de alta qualidade. Ela não usa nenhum espaço e aumenta sua capacidade de carga em 2 espaços.","category":"Mochilas","type":"backpack","id":"catalog-0","image":"/temporada/assets/exilio-crops/exilio-item-mochila.png"},{"name":"Lanterna","weight":1,"desc":"Ilumina lugares escuros. Você pode gastar uma ação de movimento para mirar a luz nos olhos de um ser em alcance curto e deixá-lo ofuscado por 1 rodada.","category":"Equipamentos","type":"gear","id":"catalog-1","image":"/temporada/assets/exilio-crops/exilio-item-lanterna.png"},{"name":"Proteção Leve","weight":2,"desc":"Jaqueta de couro pesada ou colete de kevlar. Fornece +5 de Defesa.","category":"Proteções","type":"armor","id":"catalog-2","image":"/temporada/assets/exilio-crops/exilio-item-protecao-leve.png"},{"name":"Proteção Pesada","weight":5,"desc":"Fornece resistência a balístico, corte, impacto e perfuração, impõe –5 em perícias afetadas pela carga e concede +10 de Defesa.","category":"Proteções","type":"armor","id":"catalog-3","image":"/temporada/assets/exilio-crops/exilio-item-protecao-pesada.png"},{"name":"Munição Curta","weight":1,"desc":"Um pacote de munição curta consumido ao recarregar uma arma compatível.","ammo":"Curta","category":"Munições","type":"gear","id":"catalog-4","image":"/temporada/assets/exilio-crops/exilio-item-municao-curta.png"},{"name":"Munição Longa","weight":1,"desc":"Um pacote de munição longa consumido ao recarregar uma arma compatível.","ammo":"Longa","category":"Munições","type":"gear","id":"catalog-5","image":"/temporada/assets/exilio-crops/exilio-item-municao-longa.png"},{"name":"Munição Pesada","weight":1,"desc":"Um pacote de munição pesada consumido ao recarregar uma arma compatível.","ammo":"Pesada","category":"Munições","type":"gear","id":"catalog-6","image":"/temporada/assets/exilio-crops/exilio-item-municao-pesada-limpa.svg"},{"name":"Munição Especial","weight":1,"desc":"Um pacote de munição especial consumido ao recarregar uma arma compatível.","ammo":"Especial","img":"","category":"Munições","type":"gear","id":"catalog-7","image":"/temporada/assets/exilio-crops/exilio-item-municao-especial-limpa.svg"},{"name":"Soqueira","atk":2,"dmg":"1d6","crit":"20/x2","range":"Toque","skill":"Luta","weight":1,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-8","image":"/temporada/assets/exilio-crops/exilio-item-soqueira.png"},{"name":"Faca","atk":1,"dmg":"1d4","crit":"19/x2","range":"Curto","skill":"Luta","weight":1,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-9","image":"/temporada/assets/exilio-crops/exilio-item-faca.png"},{"name":"Machado","atk":1,"dmg":"1d8","crit":"20/x3","range":"Curto","skill":"Luta","weight":2,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-10","image":"/temporada/assets/exilio-crops/exilio-item-machado.png"},{"name":"Machete","atk":1,"dmg":"1d6","crit":"19/x2","range":"Curto","skill":"Luta","weight":1,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-11","image":"/temporada/assets/exilio-crops/exilio-item-machete.png"},{"name":"Martelo","atk":1,"dmg":"1d6","crit":"20/x2","range":"Curto","skill":"Luta","weight":1,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-12","image":"/temporada/assets/exilio-crops/exilio-item-martelo.png"},{"name":"Marreta","atk":1,"dmg":"1d10","crit":"20/x2","range":"Curto","skill":"Luta","weight":2,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-13","image":"/temporada/assets/exilio-crops/exilio-item-marreta.png"},{"name":"Espada da Ordem","atk":1,"dmg":"1d8","crit":"19/x2","range":"Curto","skill":"Luta","weight":2,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-14","image":"/temporada/assets/exilio-crops/exilio-item-espada-da-ordem.png"},{"name":"Serra Elétrica","atk":1,"dmg":"2d6","crit":"19/x2","range":"Curto","skill":"Luta","weight":2,"category":"Armas corpo a corpo","type":"weapon","id":"catalog-15","image":"/temporada/assets/exilio-crops/exilio-item-serra-eletrica.png"},{"name":"Pistola Antiga","atk":1,"dmg":"1d12","crit":"Nenhum","range":"Curto","ammo":"Curta","capacity":8,"skill":"Pontaria","weight":1,"category":"Armas de disparo","type":"weapon","id":"catalog-16","image":"/temporada/assets/exilio-crops/exilio-item-pistola-antiga.png"},{"name":"Revolver","atk":1,"dmg":"3d6","crit":"20/x2","range":"Curto","ammo":"Curta","capacity":6,"skill":"Pontaria","weight":1,"category":"Armas de disparo","type":"weapon","id":"catalog-17","image":"/temporada/assets/exilio-crops/exilio-item-revolver.png"},{"name":"Pistola Semiautomática","atk":2,"dmg":"3d8","crit":"20/x2","range":"Curto","ammo":"Curta","capacity":10,"skill":"Pontaria","weight":1,"category":"Armas de disparo","type":"weapon","id":"catalog-18","image":"/temporada/assets/exilio-crops/exilio-item-pistola-semiautomatica.png"},{"name":"Escopeta","atk":1,"dmg":"4d6","crit":"20/x2","range":"Curto","ammo":"Pesada","capacity":6,"skill":"Pontaria","weight":2,"category":"Armas de disparo","type":"weapon","id":"catalog-19","image":"/temporada/assets/exilio-crops/exilio-item-escopeta.png"},{"name":"Escopeta (Cano Serrado)","atk":1,"dmg":"4d4","crit":"20/x2","range":"Curto","ammo":"Pesada","capacity":6,"skill":"Pontaria","weight":1,"category":"Armas de disparo","type":"weapon","id":"catalog-20","image":"/temporada/assets/exilio-crops/exilio-item-escopeta-cano-serrado.png"},{"name":"Rifle de Caça","atk":1,"dmg":"2d8","crit":"20/x3","range":"Longo","ammo":"Longa","capacity":8,"skill":"Pontaria","weight":2,"category":"Armas de disparo","type":"weapon","id":"catalog-21","image":"/temporada/assets/exilio-crops/exilio-item-rifle-de-caca.png"},{"name":"Rifle de Precisão","atk":1,"dmg":"3d12","crit":"20/x4","range":"Longo","ammo":"Longa","capacity":5,"skill":"Pontaria","weight":2,"category":"Armas de disparo","type":"weapon","id":"catalog-22","image":"/temporada/assets/exilio-crops/exilio-item-rifle-de-precisao.png"},{"name":"Rifle de Assalto","atk":3,"dmg":"3d8","crit":"20/x2","range":"Longo","ammo":"Longa","capacity":40,"skill":"Pontaria","weight":2,"category":"Armas de disparo","type":"weapon","id":"catalog-23","image":"/temporada/assets/exilio-crops/exilio-item-rifle-de-assalto.png"},{"name":"Balestra","atk":1,"dmg":"4d12","crit":"20/x2","range":"Longo","ammo":"Especial","capacity":1,"skill":"Pontaria","weight":2,"category":"Armas de disparo","type":"weapon","id":"catalog-24","image":"/temporada/assets/exilio-crops/exilio-item-balestra.png"}];
  let inventoryLocation='equipment',inventoryEditId=null,inventoryDraftImage='',inventoryPickerSlot=null,inventoryReading=false;
  // Catálogo do Exílio 3.0 extraído das tabelas de equipamento do Livro Básico.
  // Itens legados continuam acessíveis por ID aos personagens antigos, mas ficam fora da seleção nova.
  itemCatalog.push(...[{"name":"Bolsa equipada","type":"backpack","weight":0,"category":"Bolsas","id":"exilio3-0","book3":true,"desc":"Aumenta a capacidade em 15 espaços, de 5 para 20 no total."},{"name":"Proteção Leve","type":"armor","weight":1,"category":"Proteções","id":"exilio3-1","book3":true,"rd":1,"desc":"Proteção física: RD 1. Ocupa 1 espaço(s). Até duas camadas compatíveis, RD combinada máxima 4. Perde durabilidade após três combates em que sofreu acerto efetivo."},{"name":"Proteção Média","type":"armor","weight":2,"category":"Proteções","id":"exilio3-2","book3":true,"rd":2,"desc":"Proteção física: RD 2. Ocupa 2 espaço(s). Até duas camadas compatíveis, RD combinada máxima 4. Perde durabilidade após três combates em que sofreu acerto efetivo."},{"name":"Proteção Pesada","type":"armor","weight":5,"category":"Proteções","id":"exilio3-3","book3":true,"rd":3,"desc":"Proteção física: RD 3. Ocupa 5 espaço(s). Até duas camadas compatíveis, RD combinada máxima 4. Perde durabilidade após três combates em que sofreu acerto efetivo."},{"name":"Equipamento de investigação","type":"gear","weight":1,"category":"Equipamentos","id":"exilio3-4","book3":true,"desc":"Lanterna, gravador, câmera, detector ou kit de investigação. Ocupa 1 espaço."},{"name":"Medicamento","type":"gear","weight":1,"category":"Equipamentos","id":"exilio3-5","book3":true,"desc":"Ocupa 1 espaço. Não recupera PV automaticamente; efeitos exigem descrição própria."},{"name":"Arma corpo a corpo leve","type":"weapon","weight":1,"category":"Armas corpo a corpo","id":"exilio3-6","book3":true,"skill":"CONFRONTO","dmg":"","desc":"Faca, canivete, bastão curto. Ataque: 2d10 + POT ou DES + Confronto. Dano a definir pelo mestre. Alcance padrão 2m."},{"name":"Arma corpo a corpo pesada","type":"weapon","weight":2,"category":"Armas corpo a corpo","id":"exilio3-7","book3":true,"skill":"CONFRONTO","dmg":"","desc":"Marreta, machado grande, arma longa pesada. Ataque: 2d10 + POT ou DES + Confronto. Dano a definir pelo mestre."},{"name":"Pistola pequena","type":"weapon","weight":1,"category":"Armas de fogo","id":"exilio3-8","book3":true,"dmg":"1d8","skill":"PRECISÃO","ammo":"Cartucho de pistola pequena","capacity":8,"range":"10m","desc":"Dano 1d8 perfurante. Capacidade 8. Alcance 10m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Pistola pequena","type":"gear","weight":1,"category":"Munições","id":"exilio3-9","book3":true,"ammo":"Cartucho de pistola pequena","desc":"Pacote de munição compatível com Pistola pequena. Uma recarga completa. Ocupa 1 espaço."},{"name":"Pistola","type":"weapon","weight":1,"category":"Armas de fogo","id":"exilio3-10","book3":true,"dmg":"1d10","skill":"PRECISÃO","ammo":"Cartucho de pistola","capacity":12,"range":"30m","desc":"Dano 1d10 perfurante. Capacidade 12. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Pistola","type":"gear","weight":1,"category":"Munições","id":"exilio3-11","book3":true,"ammo":"Cartucho de pistola","desc":"Pacote de munição compatível com Pistola. Uma recarga completa. Ocupa 1 espaço."},{"name":"Revólver","type":"weapon","weight":1,"category":"Armas de fogo","id":"exilio3-12","book3":true,"dmg":"2d6","skill":"PRECISÃO","ammo":"Cartucho de revólver","capacity":6,"range":"30m","desc":"Dano 2d6 perfurante. Capacidade 6. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Revólver","type":"gear","weight":1,"category":"Munições","id":"exilio3-13","book3":true,"ammo":"Cartucho de revólver","desc":"Pacote de munição compatível com Revólver. Uma recarga completa. Ocupa 1 espaço."},{"name":"Pistola alto calibre","type":"weapon","weight":1,"category":"Armas de fogo","id":"exilio3-14","book3":true,"dmg":"2d8","skill":"PRECISÃO","ammo":"Cartucho de pistola alto calibre","capacity":7,"range":"30m","desc":"Dano 2d8 perfurante. Capacidade 7. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Pistola alto calibre","type":"gear","weight":1,"category":"Munições","id":"exilio3-15","book3":true,"ammo":"Cartucho de pistola alto calibre","desc":"Pacote de munição compatível com Pistola alto calibre. Uma recarga completa. Ocupa 1 espaço."},{"name":"Submetralhadora","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-16","book3":true,"dmg":"1d10","skill":"PRECISÃO","ammo":"Cartucho de submetralhadora","capacity":24,"range":"30m","desc":"Dano 1d10 perfurante. Capacidade 24. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível. Rajada: 3 projéteis e um dado adicional do mesmo tipo ao acertar."},{"name":"Munição de Submetralhadora","type":"gear","weight":1,"category":"Munições","id":"exilio3-17","book3":true,"ammo":"Cartucho de submetralhadora","desc":"Pacote de munição compatível com Submetralhadora. Uma recarga completa. Ocupa 1 espaço."},{"name":"Espingarda","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-18","book3":true,"dmg":"2d8","skill":"PRECISÃO","ammo":"Cartucho de espingarda","capacity":5,"range":"10m","desc":"Dano 2d8 perfurante. Capacidade 5. Alcance 10m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Espingarda","type":"gear","weight":1,"category":"Munições","id":"exilio3-19","book3":true,"ammo":"Cartucho de espingarda","desc":"Pacote de munição compatível com Espingarda. Uma recarga completa. Ocupa 1 espaço."},{"name":"Escopeta cano duplo","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-20","book3":true,"dmg":"2d10","skill":"PRECISÃO","ammo":"Cartucho de escopeta cano duplo","capacity":2,"range":"10m","desc":"Dano 2d10 perfurante. Capacidade 2. Alcance 10m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Escopeta cano duplo","type":"gear","weight":1,"category":"Munições","id":"exilio3-21","book3":true,"ammo":"Cartucho de escopeta cano duplo","desc":"Pacote de munição compatível com Escopeta cano duplo. Uma recarga completa. Ocupa 1 espaço."},{"name":"Carabina","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-22","book3":true,"dmg":"2d6","skill":"PRECISÃO","ammo":"Cartucho de carabina","capacity":15,"range":"30m","desc":"Dano 2d6 perfurante. Capacidade 15. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Carabina","type":"gear","weight":1,"category":"Munições","id":"exilio3-23","book3":true,"ammo":"Cartucho de carabina","desc":"Pacote de munição compatível com Carabina. Uma recarga completa. Ocupa 1 espaço."},{"name":"Rifle","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-24","book3":true,"dmg":"2d8","skill":"PRECISÃO","ammo":"Cartucho de rifle","capacity":5,"range":"30m","desc":"Dano 2d8 perfurante. Capacidade 5. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Rifle","type":"gear","weight":1,"category":"Munições","id":"exilio3-25","book3":true,"ammo":"Cartucho de rifle","desc":"Pacote de munição compatível com Rifle. Uma recarga completa. Ocupa 1 espaço."},{"name":"Rifle de precisão","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-26","book3":true,"dmg":"2d10","skill":"PRECISÃO","ammo":"Cartucho de rifle de precisão","capacity":5,"range":"30m","desc":"Dano 2d10 perfurante. Capacidade 5. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível."},{"name":"Munição de Rifle de precisão","type":"gear","weight":1,"category":"Munições","id":"exilio3-27","book3":true,"ammo":"Cartucho de rifle de precisão","desc":"Pacote de munição compatível com Rifle de precisão. Uma recarga completa. Ocupa 1 espaço."},{"name":"Fuzil de assalto","type":"weapon","weight":2,"category":"Armas de fogo","id":"exilio3-28","book3":true,"dmg":"2d8","skill":"PRECISÃO","ammo":"Cartucho de fuzil de assalto","capacity":30,"range":"30m","desc":"Dano 2d8 perfurante. Capacidade 30. Alcance 30m. Recarregar custa ação principal e 1 pacote de munição compatível. Rajada: 3 projéteis e um dado adicional do mesmo tipo ao acertar."},{"name":"Munição de Fuzil de assalto","type":"gear","weight":1,"category":"Munições","id":"exilio3-29","book3":true,"ammo":"Cartucho de fuzil de assalto","desc":"Pacote de munição compatível com Fuzil de assalto. Uma recarga completa. Ocupa 1 espaço."}]);
  // Exílio 3.0: imagens já existentes no acervo do projeto.
  // As ilustrações não substituem os nomes, danos ou requisitos das armas do livro.
  const exilioArtworkByName=new Map(itemCatalog.filter(item=>!item.book3&&item.image).map(item=>[item.name,item.image]));
  const exilioArtCorrespondences={
    'Bolsa equipada':'Mochila',
    'Equipamento de investigação':'Lanterna',
    'Proteção Leve':'Proteção Leve',
    'Proteção Pesada':'Proteção Pesada',
    'Arma corpo a corpo leve':'Faca',
    'Arma corpo a corpo pesada':'Marreta',
    'Pistola pequena':'Pistola Antiga',
    'Pistola':'Pistola Semiautomática',
    'Revólver':'Revolver',
    'Pistola alto calibre':'Pistola Semiautomática',
    'Espingarda':'Escopeta',
    'Escopeta cano duplo':'Escopeta (Cano Serrado)',
    'Carabina':'Rifle de Caça',
    'Rifle':'Rifle de Caça',
    'Rifle de precisão':'Rifle de Precisão',
    'Fuzil de assalto':'Rifle de Assalto'
  };
  for(const item of itemCatalog.filter(entry=>entry.book3)){
    let reference=exilioArtCorrespondences[item.name];
    if(item.category==='Munições'){
      const weapon=item.name.replace(/^Munição de /,'');
      reference=/espingarda|escopeta/i.test(weapon)?'Munição Pesada':
                /rifle|carabina|fuzil/i.test(weapon)?'Munição Longa':'Munição Curta';
    }
    const art=exilioArtworkByName.get(reference);
    if(art){
      item.image=art;
      // Guardar a identificação da ilustração quando é apenas uma representação.
      item.illustrationName=reference;
    }
  }
  // Exílio · temporadas: resolve artes pelo catálogo mesmo para itens salvos antes da inclusão dos PNGs.
  // Não altera os dados armazenados. Imagens personalizadas do jogador sempre têm prioridade.
  const normalizeItemArtworkName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  function inventoryCatalogEntry(item){
    if(!item)return null;
    const marker=String(item.image||'');
    const catalogId=marker.startsWith('catalog:')?marker.slice(8):'';
    const byId=catalogId?itemCatalog.find(entry=>entry.id===catalogId):null;
    if(byId)return byId;
    const name=normalizeItemArtworkName(item.name);
    if(!name)return null;
    return itemCatalog.find(entry=>!entry.book3&&entry.type===item.type&&normalizeItemArtworkName(entry.name)===name)||
           itemCatalog.find(entry=>entry.type===item.type&&normalizeItemArtworkName(entry.name)===name)||
           null;
  }
  // Imagens antigas salvas diretamente permanecem compatíveis com as versões sem texto.
  const cleanedItemArtworkByPath={
    '/temporada/assets/exilio-crops/exilio-item-municao-pesada.png':'/temporada/assets/exilio-crops/exilio-item-municao-pesada-limpa.svg',
    '/temporada/assets/exilio-crops/exilio-item-municao-especial.png':'/temporada/assets/exilio-crops/exilio-item-municao-especial-limpa.svg'
  };
  function inventoryArtworkSource(item){
    if(!item)return '';
    const stored=String(item.image||'');
    if(cleanedItemArtworkByPath[stored])return cleanedItemArtworkByPath[stored];
    // Arte do catálogo antigo: atualizar automaticamente ao PNG recortado da imagem do jogador.
    // Fotos próprias, data URLs e arquivos enviados pelo personagem continuam prevalecendo.
    const archivedArt=/^\/temporada\/assets\/(?:[0-9a-f]{20}|municao-especial-exilio)\.png$/i.test(stored);
    if(stored&&!stored.startsWith('catalog:')&&!archivedArt)return stored;
    return inventoryCatalogEntry(item)?.image||(!archivedArt?stored:'');
  }
  function inventoryState(){
    if(!state.inventory)state.inventory={items:[],equipped:{weapon:null,armor:null,important:null}};
    state.inventory.equipped.backpack ??= null;
    return state.inventory;
  }
  function equippedBackpack(){const inv=inventoryState();return inv.items.find(i=>i.id===inv.equipped.backpack&&i.type==='backpack');}
  function normalizeBackpack(){const inv=inventoryState();let changed=false,count=0;for(const item of inv.items){if(item.location==='backpack'){if(!equippedBackpack()||item.type==='backpack'){item.location='equipment';changed=true;}else count++;}}return changed;}
  function inventoryItemSpaces(item){return inventoryItemWeight(item)*Math.max(1,Math.trunc(Number(item.quantity)||1));}
  function inventoryUsedSpaces(location,excludingId=null){return inventoryState().items.filter(i=>(i.location||'equipment')===location&&i.id!==excludingId).reduce((sum,i)=>sum+inventoryItemSpaces(i),0);}
  function validateBackpackItem(item){
    if(item.location==='backpack'){if(item.type==='backpack')throw Error('Guarde a mochila no equipamento para poder equipá-la.');if(!equippedBackpack())throw Error('Equipe uma mochila antes de guardar itens nela.');}
    const location=item.location||'equipment',max=location==='backpack'?15:5;
    const used=inventoryUsedSpaces(location,item.id),required=inventoryItemSpaces(item);
    const previous=inventoryState().items.find(i=>i.id===item.id);
    const reducingExisting=previous&&(previous.location||'equipment')===location&&required<=inventoryItemSpaces(previous);
    if(used+required>max&&!reducingExisting)throw Error('Sem espaço em '+(location==='backpack'?'Mochila':'Equipamento')+': este item precisa de '+required+' espaço(s), mas há '+Math.max(0,max-used)+' disponível(is). Limite: '+max+'.');
  }
  function inventoryEquip(slot,id){
    const inv=inventoryState(),item=inv.items.find(i=>i.id===id);
    if(id!==null&&(!item||(slot!=='important'&&item.type!==slot)))throw Error('Este item não pertence a esse slot.');
    inv.equipped[slot]=id;
  }
  function inventoryRemove(id){const inv=inventoryState();inv.items=inv.items.filter(i=>i.id!==id);for(const key of Object.keys(inv.equipped))if(inv.equipped[key]===id)inv.equipped[key]=null;}
  function inventoryPersist(){try{localStorage.setItem(window.SeasonContext.stateKey,JSON.stringify(state));window.dispatchEvent(new Event('season:change'));return true;}catch(e){$('inventory-error').textContent='O navegador não conseguiu salvar. Remova imagens grandes ou exporte a ficha em Ajustes.';toast('Não foi possível salvar o inventário no navegador.');return false;}}
  function inventoryIcon(item){return {weapon:'⚔',armor:'⬡',gear:'◇',important:'★',backpack:'▣'}[item.type]||'◇';}
  function inventoryPaintSlot(button,item,emptyLabel){
    button.replaceChildren();button.classList.toggle('filled',Boolean(item));
    if(!item){const plus=document.createElement('span');plus.className='slot-empty';plus.textContent='+';button.append(plus);button.title=emptyLabel;return;}
    const artwork=inventoryArtworkSource(item);
    if(artwork){const img=document.createElement('img');img.src=artwork;img.alt='Ilustração de '+item.name;img.loading='eager';button.append(img);}
    else{const icon=document.createElement('span');icon.className='slot-icon';icon.textContent=inventoryIcon(item);button.append(icon);}
    const name=document.createElement('span');name.className='slot-name';name.textContent=item.name;button.append(name);button.title=item.name;
    if(item.quantity>1){const amount=document.createElement('span');amount.className='slot-quantity';amount.textContent='×'+item.quantity;button.append(amount);}
  }
  function renderInventory(){
    const inv=inventoryState(),grid=$('inventory-grid');
    if(normalizeBackpack())inventoryPersist();
    const hasBackpack=Boolean(equippedBackpack());
    if(!hasBackpack)inventoryLocation='equipment';
    $('inventory-toggle').hidden=!hasBackpack;
    $('inventory-location').querySelector('option[value="backpack"]').disabled=!hasBackpack;
    grid.classList.toggle('backpack-grid',inventoryLocation==='backpack');grid.replaceChildren();
    updateInventoryLoad();
    $('inventory-bag-title').textContent=inventoryLocation==='equipment'?'EQUIPAMENTO':'MOCHILA';
    $('inventory-toggle').querySelector('span').textContent=inventoryLocation==='equipment'?'Mochila':'Equipamento';
    $('inventory-toggle').setAttribute('aria-label','Mostrar '+(inventoryLocation==='equipment'?'mochila':'equipamento'));
    const items=inv.items.filter(i=>i.location===inventoryLocation);
    for(const item of items){const btn=document.createElement('button');btn.type='button';btn.className='item-slot';inventoryPaintSlot(btn,item,'');if(Object.values(inv.equipped).includes(item.id)){const badge=document.createElement('span');badge.className='slot-equipped-badge';badge.textContent='Em uso';btn.append(badge);}btn.addEventListener('click',()=>openInventoryItem(item));grid.append(btn);}
    for(let i=items.length;i<(inventoryLocation==='backpack'?15:5);i++){const btn=document.createElement('button');btn.type='button';btn.className='item-slot empty-item';if(inventoryLocation==='backpack'){btn.textContent='+';btn.title='Adicionar item — slot '+(i+1)+' de 15';}btn.setAttribute('aria-label','Adicionar item neste espaço');btn.addEventListener('click',openItemCatalog);grid.append(btn);}
    const add=document.createElement('button');add.type='button';add.className='item-slot add-item';add.innerHTML='<span>+</span><small>Adicionar item</small>';add.addEventListener('click',openItemCatalog);if(inventoryLocation==='equipment')grid.append(add);
    $('inventory-grid').setAttribute('aria-label',inventoryLocation==='backpack'?'Mochila: '+items.length+' de 15 slots ocupados':'Equipamento');
    for(const slot of ['weapon','armor','important'])inventoryPaintSlot($('inventory-slot-'+slot),inv.items.find(i=>i.id===inv.equipped[slot]),'Escolher item');
    displayCombat();
    if(ritualReady)renderRituals();
  }
  function openInventoryItem(item=null,edit=false){if(item&&!edit){showInventoryDetails(item);return;}inventoryEditId=item?.id||null;inventoryDraftImage=item?.image||'';$('inventory-editor-title').textContent=item?'Detalhes do item':'Novo item';$('inventory-weight').value=item?inventoryItemWeight(item):1;$('inventory-name').value=item?.name||'';$('inventory-type').value=item?.type||'gear';$('inventory-quantity').value=item?.quantity||1;$('inventory-location').value=item?.location||inventoryLocation;$('inventory-description').value=item?.description||'';$('inventory-image').value='';$('inventory-error').textContent='';$('inventory-delete').hidden=!item;$('inventory-item-status').textContent=item&&Object.values(inventoryState().equipped).includes(item.id)?'Equipado — continua guardado no inventário.':'';$('inventory-editor').showModal();}
  function readInventoryForm(){
    if(inventoryReading)throw Error('Aguarde o carregamento da imagem.');if(!$('inventory-form').reportValidity())return null;
    const name=$('inventory-name').value.trim();if(!name)throw Error('Digite o nome do item.');
    return {id:inventoryEditId||'item-'+Date.now()+'-'+Math.random().toString(36).slice(2),name,weight:Math.max(0,Math.min(999,Math.trunc(Number($('inventory-weight').value)||0))),type:$('inventory-type').value,quantity:Math.max(1,Math.min(999,Math.trunc(Number($('inventory-quantity').value)||1))),location:$('inventory-location').value,description:$('inventory-description').value.trim(),image:inventoryDraftImage};
  }
  function saveInventoryItem(slot=null){try{const item=readInventoryForm();if(!item)return;validateBackpackItem(item);const inv=inventoryState();const old=JSON.stringify(inv);const index=inv.items.findIndex(i=>i.id===item.id);if(index<0)inv.items.push(item);else inv.items[index]=item;
    for(const key of ['weapon','armor','backpack'])if(inv.equipped[key]===item.id&&item.type!==key)inv.equipped[key]=null;
    if(slot==='auto'){if(!['weapon','armor','backpack'].includes(item.type))slot='important';else slot=item.type;}
    if(slot)inventoryEquip(slot,item.id);normalizeBackpack();
    if(!inventoryPersist()){state.inventory=JSON.parse(old);return;}
    renderInventory();$('inventory-editor').close();
  }catch(e){$('inventory-error').textContent=e.message;}}
  $('inventory-form').addEventListener('submit',e=>{e.preventDefault();saveInventoryItem();});
  
  $('inventory-delete').addEventListener('click',()=>{if(!inventoryEditId)return;const inv=inventoryState(),old=JSON.stringify(inv);inventoryRemove(inventoryEditId);normalizeBackpack();if(!inventoryPersist()){state.inventory=JSON.parse(old);return;}renderInventory();$('inventory-editor').close();});
  $('inventory-image-remove').addEventListener('click',()=>{inventoryDraftImage='';$('inventory-image').value='';$('inventory-item-status').textContent='Imagem removida. Salve para confirmar.';});
  $('inventory-image').addEventListener('change',()=>{const file=$('inventory-image').files[0];if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){$('inventory-error').textContent='Use uma imagem PNG, JPG ou WebP de até 20 MB.';$('inventory-image').value='';return;}inventoryReading=true;const reader=new FileReader();reader.onload=()=>{inventoryDraftImage=String(reader.result);inventoryReading=false;$('inventory-item-status').textContent='Imagem carregada.';};reader.onerror=()=>{inventoryReading=false;$('inventory-error').textContent='Não foi possível abrir a imagem.';};reader.readAsDataURL(file);});
  function openInventoryPicker(slot){inventoryPickerSlot=slot;const inv=inventoryState(),list=$('inventory-picker-list');list.replaceChildren();$('inventory-picker-title').textContent={weapon:'Arma equipada',armor:'Proteção equipada',important:'Item importante'}[slot];const items=inv.items.filter(i=>slot==='important'||i.type===slot);for(const item of items){const btn=document.createElement('button');btn.type='button';btn.className='inventory-choice';btn.textContent=item.name+' · '+(item.location==='backpack'?'Mochila':'Equipamento')+(inv.equipped[slot]===item.id?' · Em uso':'');btn.addEventListener('click',()=>{const before=inv.equipped[slot];inventoryEquip(slot,item.id);if(!inventoryPersist()){inv.equipped[slot]=before;return;}renderInventory();$('inventory-picker').close();});list.append(btn);}if(!items.length){const p=document.createElement('p');p.textContent='Nenhum item desse tipo. Adicione um item na grade de equipamento ou mochila.';list.append(p);}$('inventory-picker').showModal();}
  for(const slot of ['weapon','armor','important'])$('inventory-slot-'+slot).addEventListener('click',()=>openInventoryPicker(slot));
  $('inventory-unequip').addEventListener('click',()=>{const inv=inventoryState(),before=inv.equipped[inventoryPickerSlot];inventoryEquip(inventoryPickerSlot,null);if(!inventoryPersist()){inv.equipped[inventoryPickerSlot]=before;return;}renderInventory();$('inventory-picker').close();});
  $('inventory-editor-close').addEventListener('click',()=>$('inventory-editor').close());$('inventory-picker-close').addEventListener('click',()=>$('inventory-picker').close());
  $('inventory-toggle').addEventListener('click',()=>{if(!equippedBackpack())return;inventoryLocation=inventoryLocation==='equipment'?'backpack':'equipment';renderInventory();});
  renderInventory();


  function criticalMultiplierFromText(critical){
    // No Exílio, o limiar 19/20 do Outro Lado não existe: só importa ×2, ×3, ×4.
    const match=String(critical||'').match(/[x×]\s*(\d+)/i);
    return /nenhum/i.test(String(critical||''))?1:Math.max(1,Math.min(10,Number(match?.[1])||1));
  }
  function catalogDescription(item){
    let base=item.desc||'';
    // A capacidade 5+15 do Exílio permanece; não mostrar o antigo bônus +2 da mochila.
    if(item.type==='backpack')base=base.replace(/aumenta sua capacidade de carga em 2 espaços\.?/i,'permite guardar 15 espaços adicionais no Exílio.');
    const lines=[base];
    if(item.type==='backpack')lines.push('Capacidade: 5 espaços básicos + 15 na mochila equipada.');
    if(item.dmg){
      lines.push('Dano: '+item.dmg);
      lines.push('Crítico: ×'+criticalMultiplierFromText(item.crit));
      lines.push('Ataques: '+(Number(item.atk)||1));
      lines.push('Alcance: '+(item.range||'—'));
      lines.push('Perícia: '+(/pontaria|precisão/i.test(item.skill)?'PRECISÃO':'CONFRONTO'));
    }
    if(item.ammo)lines.push('Munição: '+item.ammo);
    if(item.capacity)lines.push('Capacidade: '+item.capacity);
    lines.push('Espaços: '+item.weight);
    return lines.filter(Boolean).join('\n');
  }
  function chooseCatalogItem(item){
    $('item-catalog-dialog').close();if($('inventory-editor').open)$('inventory-editor').close();openInventoryItem();
    $('inventory-weight').value=item.weight;$('inventory-name').value=item.name;$('inventory-type').value=item.type;$('inventory-quantity').value=1;
    $('inventory-location').value=item.type==='backpack'?'equipment':inventoryLocation;
    $('inventory-description').value=catalogDescription(item);inventoryDraftImage=item.image?'catalog:'+item.id:'';
    $('inventory-item-status').textContent='Item do catálogo. Confira e clique em Salvar ou Equipar.';
  }
  function renderItemCatalog(){
    const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const query=normalize($('item-catalog-search').value.trim()),category=$('item-catalog-category').value;
    const items=itemCatalog.filter(i=>!i.book3&&(!category||i.category===category)&&normalize(i.name+' '+i.category+' '+(i.desc||'')).includes(query));
    $('item-catalog-count').textContent=items.length+' de '+itemCatalog.filter(i=>!i.book3).length+' equipamentos · regras de Outro Lado';const list=$('item-catalog-list');list.replaceChildren();
    for(const item of items){
      const card=document.createElement('article');card.className='item-catalog-card';
      if(item.image){
        const image=document.createElement('img');
        image.className='item-catalog-photo';
        image.src=item.image;
        image.alt='Ilustração de '+item.name;
        image.loading='lazy';
        image.decoding='async';
        image.addEventListener('error',()=>image.remove(),{once:true});
        card.append(image);
      }
      const name=document.createElement('h3');name.textContent=item.name;const cat=document.createElement('small');cat.textContent=item.category;const desc=document.createElement('p');desc.textContent=catalogDescription(item);const add=document.createElement('button');add.type='button';add.textContent='Adicionar ao inventário';add.addEventListener('click',()=>chooseCatalogItem(item));card.append(name,cat,desc,add);list.append(card);}
    if(!items.length){const empty=document.createElement('p');empty.textContent='Nenhum item encontrado.';list.append(empty);}
  }
  function openItemCatalog(){renderItemCatalog();$('item-catalog-dialog').showModal();}
  $('inventory-editor-catalog').addEventListener('click',openItemCatalog);
  $('item-catalog-custom').addEventListener('click',()=>{$('item-catalog-dialog').close();if($('inventory-editor').open)$('inventory-editor').close();openInventoryItem();});
  $('item-catalog-close').addEventListener('click',()=>$('item-catalog-dialog').close());
  $('item-catalog-search').addEventListener('input',renderItemCatalog);$('item-catalog-category').addEventListener('change',renderItemCatalog);


  let inventoryDetailsId=null;
  function showInventoryDetails(item){
    inventoryDetailsId=item.id;$('inventory-details-name').textContent=item.name;
    const image=$('inventory-details-image');const src=inventoryArtworkSource(item);
    image.hidden=!src;if(src){image.src=src;image.alt=item.name;}else image.removeAttribute('src');
    const meta=$('inventory-details-meta');meta.replaceChildren();
    for(const [label,value] of [['Tipo',{weapon:'Arma',armor:'Proteção',gear:'Equipamento',important:'Item importante',backpack:'Mochila'}[item.type]||item.type],['Quantidade',item.quantity],['Guardado em',item.location==='backpack'?'Mochila':'Equipamento']]){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);meta.append(row);}
    $('inventory-details-description').textContent=item.description||'Sem descrição.';
    const labels={weapon:'Arma equipada',armor:'Proteção equipada',important:'Item importante',backpack:'Mochila equipada'};
    $('inventory-details-status').textContent=Object.entries(inventoryState().equipped).filter(([key,id])=>id===item.id).map(([key])=>labels[key]).join(' · ');
    document.querySelector('#inventory-details .inventory-management').open=false;
    $('inventory-details').showModal();
  }
  $('inventory-details-equip').addEventListener('click',()=>{
    const inv=inventoryState(),item=inv.items.find(i=>i.id===inventoryDetailsId);if(!item)return;
    const previous=JSON.stringify(inv);
    try{const slot=['weapon','armor','backpack'].includes(item.type)?item.type:'important';
      if(slot==='backpack')item.location='equipment';
      inventoryEquip(slot,item.id);normalizeBackpack();
      if(!inventoryPersist()){state.inventory=JSON.parse(previous);return;}
      renderInventory();$('inventory-details').close();toast(item.name+' equipado.');
    }catch(error){state.inventory=JSON.parse(previous);toast(error.message);}
  });
  $('inventory-details-delete').addEventListener('click',()=>{
    const inv=inventoryState(),item=inv.items.find(i=>i.id===inventoryDetailsId);if(!item)return;
    const previous=JSON.stringify(inv);inventoryRemove(item.id);normalizeBackpack();
    if(!inventoryPersist()){state.inventory=JSON.parse(previous);return;}
    renderInventory();$('inventory-details').close();toast(item.name+' excluído.');
  });
  $('inventory-details-important').addEventListener('click',()=>{
    const inv=inventoryState(),item=inv.items.find(i=>i.id===inventoryDetailsId);if(!item)return;
    const previous=inv.equipped.important;inventoryEquip('important',item.id);
    if(!inventoryPersist()){inv.equipped.important=previous;return;}
    renderInventory();$('inventory-details').close();toast(item.name+' marcado como importante.');
  });
  $('inventory-details-close').addEventListener('click',()=>$('inventory-details').close());
  $('inventory-details-edit').addEventListener('click',()=>{const item=inventoryState().items.find(i=>i.id===inventoryDetailsId);$('inventory-details').close();if(item)openInventoryItem(item,true);});


  function inventoryItemWeight(item){
    if(Number.isFinite(item.weight))return Math.max(0,item.weight);
    const id=item.image?.startsWith('catalog:')?item.image.slice(8):null;
    const entry=itemCatalog.find(c=>c.id===id)||itemCatalog.find(c=>c.name.toLowerCase()===item.name.toLowerCase());
    if(entry)return entry.weight;
    const match=String(item.description||'').match(/Espaços:\s*(\d+)/i);
    return match?Number(match[1]):item.type==='backpack'?0:1;
  }
  function inventoryLoadValues(){const used=inventoryUsedSpaces(inventoryLocation),max=inventoryLocation==='backpack'?15:5;return {used,max,over:used>max};}

  function updateInventoryLoad(){const load=inventoryLoadValues(),bar=$('inventory-load');$('inventory-load-fill').style.width=Math.min(100,load.used/load.max*100)+'%';bar.classList.toggle('overloaded',load.over);$('inventory-load-text').textContent=load.used+' / '+load.max+(load.over?' · Sobrecarga':'');bar.setAttribute('aria-valuemax',String(load.max));bar.setAttribute('aria-valuenow',String(Math.min(load.used,load.max)));bar.setAttribute('aria-valuetext',load.used+' de '+load.max+' espaços em '+(inventoryLocation==='backpack'?'Mochila':'Equipamento'));bar.title='Espaços usados em '+(inventoryLocation==='backpack'?'Mochila (15 espaços)':'Equipamento (5 espaços)')+'. Consumo: espaços do item × quantidade. Equipar não duplica o consumo.';bar.setAttribute('aria-label','Ocupação de '+(inventoryLocation==='backpack'?'Mochila':'Equipamento'));}


  let clueDraftPages=[],clueEditingId=null,clueDraftImage='',clueReadSequence=0,clueReading=false;
  function clueState(){if(!Array.isArray(state.clues))state.clues=[];return state.clues;}
  function renderClues(){const list=$('clue-list');list.replaceChildren();const clues=clueState();$('clue-count').textContent=clues.length+' '+(clues.length===1?'PISTA':'PISTAS');
if(!clues.length){const empty=document.createElement('p');empty.className='clue-empty';empty.textContent='Nenhuma pista registrada. Clique em + Adicionar.';list.append(empty);}
for(const clue of clues){const card=document.createElement('article');card.className='clue-card';card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label','Examinar pista '+clue.title);const media=document.createElement('div');media.className='clue-card-media';if(clue.image){const img=document.createElement('img');img.src=clue.image;img.alt='';media.append(img);}else media.textContent=clue.type==='book'?'▤':'◇';const content=document.createElement('div');content.className='clue-card-content';const title=document.createElement('h3');title.textContent=clue.title;const text=document.createElement('p');text.textContent=clue.text||'Sem descrição.';const badge=document.createElement('small');badge.textContent=clue.type==='book'?'LIVRO · '+(clue.pages||[]).length+' PÁGINAS':'OBJETO';content.append(title,text,badge);card.append(media,content);card.onclick=()=>inspectClue(clue.id);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();inspectClue(clue.id);}};list.append(card);}}
  function openClue(clue=null){clueReadSequence++;clueReading=false;clueDraftPages=(clue?.pages||[]).slice();$('clue-type').value=clue?.type||'object';renderCluePages();clueEditingId=clue?.id||null;clueDraftImage=clue?.image||'';$('clue-editor-title').textContent=clue?'Editar pista':'Nova pista';$('clue-title').value=clue?.title||'';$('clue-text').value=clue?.text||'';$('clue-image').value='';$('clue-error').textContent='';$('clue-delete').hidden=!clue;refreshClueImage();$('clue-editor').showModal();}
  function refreshClueImage(){const img=$('clue-preview');img.hidden=!clueDraftImage;if(clueDraftImage)img.src=clueDraftImage;else img.removeAttribute('src');}
  function persistClues(){try{localStorage.setItem(window.SeasonContext.stateKey,JSON.stringify(state));window.dispatchEvent(new Event('season:change'));return true;}catch(e){$('clue-error').textContent='Sem espaço para salvar no navegador. Tente uma imagem menor.';return false;}}
  $('clue-add').addEventListener('click',()=>openClue());$('clue-close').addEventListener('click',()=>$('clue-editor').close());
  $('clue-editor').addEventListener('close',()=>{clueReadSequence++;clueReading=false;});
  $('clue-image-remove').addEventListener('click',()=>{clueReadSequence++;clueReading=false;clueDraftImage='';$('clue-image').value='';refreshClueImage();});
  async function prepareClueImage(file){
if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Escolha PNG, JPG ou WebP de até 20 MB.');
const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));r.readAsDataURL(file);});
const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('A imagem não pôde ser aberta.'));i.src=source;});
if(file.size<=350000&&Math.max(image.naturalWidth,image.naturalHeight)<=2048)return source;
const scale=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a imagem.');ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.85);
}
$('clue-image').addEventListener('change',async()=>{const file=$('clue-image').files[0];if(!file)return;const seq=++clueReadSequence;clueReading=true;$('clue-error').textContent='Preparando imagem…';try{const source=await prepareClueImage(file);if(seq!==clueReadSequence)return;clueDraftImage=source;refreshClueImage();$('clue-error').textContent='';}catch(e){if(seq===clueReadSequence)$('clue-error').textContent=e.message;}finally{if(seq===clueReadSequence)clueReading=false;}});
  $('clue-form').addEventListener('submit',e=>{e.preventDefault();if(clueReading){$('clue-error').textContent='Aguarde a imagem carregar.';return;}const title=$('clue-title').value.trim();if(!title){$('clue-error').textContent='Digite um título para a pista.';return;}const previous=clueState().slice();const clue={id:clueEditingId||'clue-'+Date.now()+'-'+Math.random().toString(36).slice(2),title,text:$('clue-text').value,image:clueDraftImage,type:$('clue-type').value,pages:$('clue-type').value==='book'?clueDraftPages.slice():[]};if(clue.type==='book'&&!clue.pages.length){$('clue-error').textContent='Adicione pelo menos uma página ao livro.';return;}const index=state.clues.findIndex(c=>c.id===clue.id);if(index<0)state.clues.push(clue);else state.clues[index]=clue;if(!persistClues()){state.clues=previous;return;}renderClues();$('clue-editor').close();if(index<0)$('clue-list').scrollTop=$('clue-list').scrollHeight;});
  $('clue-delete').addEventListener('click',()=>{if(!clueEditingId)return;const previous=clueState().slice();state.clues=state.clues.filter(c=>c.id!==clueEditingId);if(!persistClues()){state.clues=previous;return;}renderClues();$('clue-editor').close();});
  renderClues();


function renderCluePages(){$('clue-pages-fields').hidden=$('clue-type').value!=='book';const list=$('clue-pages-list');list.replaceChildren();clueDraftPages.forEach((src,i)=>{const row=document.createElement('div');const img=document.createElement('img');img.src=src;img.alt='Página '+(i+1);const label=document.createElement('span');label.textContent='Página '+(i+1);const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.onclick=()=>{clueDraftPages.splice(i,1);renderCluePages();};row.append(img,label,remove);list.append(row);});}
$('clue-type').onchange=renderCluePages;
$('clue-pages-files').onchange=async()=>{const files=Array.from($('clue-pages-files').files);if(!files.length)return;if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>20*1024*1024)){$('clue-error').textContent='Escolha imagens de até 20 MB por página.';return;}const seq=++clueReadSequence;clueReading=true;try{const pages=[];for(const file of files){if(seq!==clueReadSequence)return;pages.push(await prepareClueImage(file));}if(seq!==clueReadSequence)return;clueDraftPages.push(...pages);renderCluePages();$('clue-error').textContent='';}catch(e){if(seq===clueReadSequence)$('clue-error').textContent='Não foi possível carregar as páginas.';}finally{if(seq===clueReadSequence)clueReading=false;$('clue-pages-files').value='';}};
let inspectedClue=null,cluePage=-1,clueZoom=1,clueAngle=0,clueTilt=0,clueX=0,clueY=0,clueMove=false,clueDrag=null;
function transformClue(){window.dispatchEvent(new Event('season:clue-view'));$('clue-zoom-value').textContent=Math.round(clueZoom*100)+'%';$('clue-object').style.transform='translate('+clueX+'px,'+clueY+'px) scale('+clueZoom+') rotateX('+clueTilt+'deg) rotateY('+clueAngle+'deg)';}
function resetClueView(){clueZoom=1;clueAngle=0;clueTilt=0;clueX=0;clueY=0;transformClue();}
function renderClueInspection(){window.dispatchEvent(new Event('season:clue-view'));const c=clueState().find(c=>c.id===inspectedClue);if(!c)return;const obj=$('clue-object');obj.replaceChildren();const pages=c.pages||[];const src=c.type==='book'&&cluePage>=0?pages[cluePage]:c.image;if(src){const img=document.createElement('img');img.src=src;img.alt=c.type==='book'?(cluePage<0?'Capa':'Página '+(cluePage+1)):c.title;img.draggable=false;obj.append(img);}else obj.textContent=c.type==='book'?'📖':'🔎';$('clue-book-nav').hidden=c.type!=='book';$('clue-page-label').textContent=cluePage<0?'Capa':(cluePage+1)+' / '+pages.length;$('clue-prev').disabled=cluePage<0;$('clue-next').disabled=cluePage>=pages.length-1;obj.getAnimations().forEach(a=>a.cancel());if(!matchMedia('(prefers-reduced-motion: reduce)').matches)obj.animate([{opacity:.15},{opacity:1}],{duration:220});}
function inspectClue(id){const c=clueState().find(c=>c.id===id);if(!c)return;inspectedClue=id;cluePage=-1;clueMove=false;$('clue-inspect-title').textContent=c.title;$('clue-inspect-description').textContent=c.text||'Sem descrição.';$('clue-inspect-error').textContent='';resetClueView();renderClueInspection();$('clue-inspect').showModal();}
$('clue-inspect-close').onclick=()=>$('clue-inspect').close();
$('clue-inspect-edit').onclick=()=>{const c=clueState().find(c=>c.id===inspectedClue);$('clue-inspect').close();if(c)openClue(c);};
$('clue-inspect-delete').onclick=()=>{const previous=clueState().slice();state.clues=previous.filter(c=>c.id!==inspectedClue);if(!persistClues()){state.clues=previous;$('clue-inspect-error').textContent='Não foi possível salvar a exclusão.';return;}renderClues();$('clue-inspect').close();};
$('clue-prev').onclick=()=>{if(cluePage>=0){cluePage--;resetClueView();renderClueInspection();}};
$('clue-next').onclick=()=>{const c=clueState().find(c=>c.id===inspectedClue);if(c&&cluePage<(c.pages||[]).length-1){cluePage++;resetClueView();renderClueInspection();}};
document.querySelectorAll('[data-clue-tool]').forEach(b=>b.onclick=()=>{const action=b.dataset.clueTool;if(action==='left')clueAngle-=45;if(action==='right')clueAngle+=45;if(action==='in')clueZoom=Math.min(8,clueZoom+.25);if(action==='out')clueZoom=Math.max(.25,clueZoom-.25);if(action==='move'){clueMove=!clueMove;b.setAttribute('aria-pressed',String(clueMove));}if(action==='reset')resetClueView();transformClue();});
$('clue-stage').onpointerdown=e=>{if(e.button!==0&&e.button!==2)return;e.preventDefault();clueDrag={x:e.clientX,y:e.clientY,move:e.button===2,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.style.cursor='grabbing';};
$('clue-stage').onpointermove=e=>{if(!clueDrag||e.pointerId!==clueDrag.id)return;const dx=e.clientX-clueDrag.x,dy=e.clientY-clueDrag.y;if(clueDrag.move){clueX+=dx;clueY+=dy;}else{clueAngle+=dx*.5;clueTilt=Math.max(-75,Math.min(75,clueTilt-dy*.5));}clueDrag.x=e.clientX;clueDrag.y=e.clientY;transformClue();};
function stopClueDrag(){clueDrag=null;$('clue-stage').style.cursor='grab';}
$('clue-stage').onpointerup=$('clue-stage').onpointercancel=$('clue-stage').onlostpointercapture=stopClueDrag;
$('clue-stage').addEventListener('contextmenu',e=>e.preventDefault());
$('clue-inspect').addEventListener('close',stopClueDrag);


$('clue-stage').addEventListener('wheel',e=>{e.preventDefault();clueZoom=Math.max(.25,Math.min(8,clueZoom*(e.deltaY<0?1.12:1/1.12)));transformClue();},{passive:false});
$('clue-stage').addEventListener('dblclick',()=>{resetClueView();});


function pendingSkillEdge(name){const value=state.nextSkillDice?.[name];return value===1?1:value===-1?-1:0;}
function updateSkillEdgeBadge(el){let badge=el.querySelector('.skill-edge-badge');const edge=pendingSkillEdge(el.dataset.skill);if(!badge){badge=document.createElement('span');badge.className='skill-edge-badge';el.append(badge);}badge.hidden=!edge;badge.textContent=edge>0?'+1 · maior':'+1 · menor';badge.title=(edge>0?'Vantagem: +1 dado, usar o maior.':'Desvantagem: +1 dado, usar o menor.')+' Somente na próxima rolagem.';}
function refreshSkillEdgeBadges(){document.querySelectorAll('[data-skill]').forEach(updateSkillEdgeBadge);}
function rollPendingSkill(name,attribute,random=Math.random){const pool=rollSkillPool(attribute,random);if(state.nextSkillDice?.[name]){delete state.nextSkillDice[name];save();refreshSkillEdgeBadges();}return pool;}
let choosingSkillEdge=0;
function chooseSkillEdge(edge){choosingSkillEdge=choosingSkillEdge===edge?0:edge;updateSkillEdgeSelection();}
function updateSkillEdgeSelection(){const active=choosingSkillEdge!==0;$('skill-advantage').setAttribute('aria-pressed',String(choosingSkillEdge===1));$('skill-disadvantage').setAttribute('aria-pressed',String(choosingSkillEdge===-1));$('sheet-skills-grid').classList.toggle('choosing-edge',active);$('skill-edge-status').textContent=active?'Clique na perícia para aplicar '+(choosingSkillEdge>0?'vantagem':'desvantagem')+'. Esc cancela.':'';}
$('skill-advantage').onclick=()=>chooseSkillEdge(1);$('skill-disadvantage').onclick=()=>chooseSkillEdge(-1);
$('sheet-skills-grid').addEventListener('click',e=>{if(!choosingSkillEdge)return;const card=e.target.closest('[data-skill]');if(!card||!$('sheet-skills-grid').contains(card))return;e.preventDefault();e.stopImmediatePropagation();const name=card.dataset.skill;state.nextSkillDice=state.nextSkillDice||{};state.nextSkillDice[name]=choosingSkillEdge;save();refreshSkillEdgeBadges();choosingSkillEdge=0;updateSkillEdgeSelection();},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&choosingSkillEdge){choosingSkillEdge=0;updateSkillEdgeSelection();}});
updateSkillEdgeSelection();


const ritualCatalogOffline=[["Cicatrização",3,"Toque","Instantâneo","—","Recupera 1d6 PV. Não estabiliza Morrendo, não cura Lesão Grave nem desperta Estabilizado."],["Pulso Anômalo",3,"10m","Instantâneo","DES + Mobilidade","1d8 de dano paranormal."],["Percepção do Véu",2,"Pessoal/10m","3 rodadas","—","Detecta presença e direção aproximada de atividade paranormal, sem detalhes."],["Sussurro Intrusivo",3,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Confuso."],["Véu de Distorção",3,"Pessoal","3 rodadas","—","+2 em Esquiva contra ataques percebidos."],["Luz Mortiça",2,"Toque","10 minutos","—","Objeto ilumina um raio de 6m com luz fria, encerrável."],["Mãos do Invisível",2,"10m","3 rodadas","—","Move objetos desprotegidos até 2kg e opera mecanismos simples; não ataca."],["Marca da Ausência",2,"Toque","1 hora","—","Marca objeto e identifica sua direção aproximada em até 30m."],["Frio de Dentro",3,"10m","Instantâneo","CON + Resistência","1d6 paranormal; margem ≥5 também aplica Lento até o fim do próximo turno."],["Eco dos Passos",2,"Pessoal/10m","Instantâneo","—","Percebe direções gerais de movimentos dos últimos 10 minutos."],["Pele de Cinzas",3,"Toque","3 rodadas","—","RD 2 física, não soma com armaduras; prevalece o maior."],["Agulha do Vazio",2,"10m","Instantâneo","DES + Mobilidade","1d6 perfurante físico; RD comum se aplica."],["Voz Emprestada",2,"Pessoal","10 minutos","Observação se suspeita","Imita uma voz conhecida; suspeitos podem contestar por Observação."],["Último Sussurro",3,"Toque","Instantâneo","—","Memória sensorial fragmentada dos últimos instantes de um cadáver recente."],["Peso Invisível",3,"10m","Até fim do próximo turno","CON + Resistência","Aplica Lento."],["Olhos da Penumbra",2,"Pessoal","10 minutos","—","Vê 10m no escuro não paranormal como luz fraca."],["Memória da Matéria",3,"Toque","Instantâneo","—","Impressão sensorial marcante do objeto nas últimas 24 horas."],["Reflexo Quebrado",3,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Desorientado."],["Silêncio de Vidro",2,"Toque","3 rodadas","—","+2 em Discrição para reduzir ruído do alvo ou objeto."],["Âncora da Consciência",3,"Pessoal","3 rodadas","—","+2 em CNS + Sensibilidade para resistir a medo, confusão e invasão."],["Ruptura do Véu",5,"10m","Instantâneo","DES + Mobilidade","2d8 de dano paranormal."],["Correntes Invisíveis",5,"10m","Até 3 rodadas","CON + Resistência","Aplica Imobilizado; escape pela regra da condição."],["Restauração Profunda",5,"Toque","Instantâneo","—","Recupera 1d12 PV; não estabiliza nem remove Lesão Grave."],["Terror Manifesto",4,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Amedrontado."],["Barreira de Ecos",5,"Pessoal","3 rodadas","—","RD 3 contra dano paranormal, não acumula com barreiras equivalentes."],["Carne em Desacordo",5,"10m","Instantâneo","CON + Resistência","2d6 paranormal; margem ≥5 aplica Atordoado."],["Olho Fora do Corpo",4,"Pessoal/10m","Até 3 rodadas","—","Percepção de ponto móvel até 6m por rodada; não atravessa sólidos."],["Costura do Espaço",5,"10m","Instantâneo","—","Teleporta objeto desprotegido de até 5kg para espaço livre visto."],["Prisão de Reflexos",6,"10m","Até fim do próximo turno","DES + Mobilidade","Aplica Imobilizado; permite escape normal."],["Memória Invadida",5,"Toque","Instantâneo","CNS + Sensibilidade","Obtém até 10s de lembrança relacionada ao tema declarado."],["Chamas que Não Aquecem",5,"10m","Instantâneo","DES + Mobilidade","2d6 paranormal; margem ≥5 aplica Queimando."],["Fratura Sonora",4,"10m","Instantâneo","DES + Mobilidade","1d10 impacto físico; margem ≥5 aplica Atordoado."],["Máscara de Ninguém",4,"Pessoal","10 minutos","Observação se suspeita","Disfarce visual humanoide similar; contato físico denuncia."],["Fio da Consciência",4,"10m","10 minutos","—","Telepatia entre conjurador e alvo voluntário até 30m."],["Passos Entre Paredes",6,"Pessoal","Instantâneo","—","Atravessa barreira sólida não paranormal de até 1m com saída livre."],["Parasita Breve",6,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Confuso e impede conjurar durante o efeito."],["Olhar dos Exilados",4,"Toque","10 minutos","—","+2 em Investigação e Anomalias em vestígios visíveis."],["Escudo de Ossos Vazios",5,"Toque","3 rodadas","—","RD 3 física; não soma com outras RD físicas."],["Rasura da Presença",6,"Pessoal","3 rodadas","—","+4 em Discrição; termina imediatamente ao atacar."],["Selo de Contenção",6,"Toque","10 minutos","CNS + Sensibilidade","A primeira travessia exige teste mental; falha bloqueia um turno e desfaz o selo."],["Colapso Anômalo",8,"10m","Instantâneo","DES + Mobilidade","3d8 de dano paranormal em um alvo."],["Domínio da Consciência",9,"10m","Até 3 rodadas","CNS + Sensibilidade","Aplica Dominado; resistências da condição permanecem."],["Desespero Absoluto",7,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Apavorado."],["Dilaceração Mental",8,"10m","Instantâneo","CNS + Sensibilidade","Causa 1d10 de perda direta de PM."],["Passagem Impossível",7,"Pessoal","Instantâneo","—","Teleporta até 10m para espaço livre perceptível."],["O Quadro que Respira",8,"Toque","10 minutos","—","Obtém até três impressões sobre o passado da imagem."],["Dilúvio de Pensamentos",9,"10m/raio 3m","Instantâneo","CNS + Sensibilidade","Cada alvo que falhar perde 1d6 PM e fica Confuso até o próximo turno."],["Corpo Inexistente",8,"Pessoal","3 rodadas","—","RD 4 física; não soma com proteções."],["Sangue que Recorda",7,"Toque","Instantâneo","—","Impressão de até 30s de memória intensa dos últimos sete dias."],["Sino do Esquecimento",9,"10m","Instantâneo","CNS + Sensibilidade","Alvo perde 1d4 PM e fica Confuso por duas rodadas."],["Olhos do Outro Mundo",7,"Pessoal/30m","10 minutos","—","Detecta manifestações e rastros sobrenaturais visíveis apesar de ilusões comuns."],["Gravidade da Ausência",8,"10m/raio 3m","Instantâneo","DES + Mobilidade","Falha: 2d6 paranormal e Caído; sucesso evita ambos."],["Muralha de Carne Estranha",8,"10m","3 rodadas","—","Parede de 3m por 2m, 15 PV e RD 2; bloqueia passagem e visão."],["Ordem Sem Voz",8,"10m","Próximo turno","CNS + Sensibilidade","Impõe ordem simples não suicida ao alvo."],["Reescrita da Dor",8,"Toque","Instantâneo","—","Recupera 2d8 PV e remove Atordoado; não estabiliza Morrendo."],["Prisão de Identidades",9,"10m","Até fim do próximo turno","CNS + Sensibilidade","Aplica Incapacitado sem causar inconsciência."],["Exílio Momentâneo",9,"10m","Até fim do próximo turno","CNS + Sensibilidade","Alvo desaparece até o fim do próximo turno e retorna a espaço livre."],["Despertar do Parasita",9,"10m","Até 3 rodadas","CNS + Sensibilidade","Aplica Dominado; controlador só exige movimento, fala e atos simples."],["Ruína da Matéria",8,"10m","Instantâneo","DES + Mobilidade","3d6 paranormal contra criatura ou objeto desprotegido até 2m."],["Réquiem dos Quatro Sinos",9,"Pessoal/raio 6m","Instantâneo","CNS + Sensibilidade","Até três alvos: falha causa 2d8 paranormal e perda 1d4 PM."]].map(([name,costPM,range,duration,resistance,desc],i)=>({name,elements:[],element:'Exílio',grade:'Grau '+(i<20?'I':i<40?'II':'III'),circle:String(i<20?1:i<40?2:3),cost:costPM+' PM',costPM,cast:'Ação principal',range,target:'Conforme a descrição',duration,resistance,desc,discente:'',verdadeiro:'',source:'Exílio 3.0 · Livro Básico de Regras'})),ritualSigilsOffline={"Amaldiçoar Arma":"/temporada/assets/3f19c744a2f20d3d0a92.png","Alterar Destino":"/temporada/assets/8e1c2db147e75c7e9a37.png","Alterar Memória":"/temporada/assets/24b886b8a4de54a6ab05.png","Amaldiçoar Tecnologia":"/temporada/assets/d230d578e83c7303c517.png","Âncora Temporal":"/temporada/assets/ab07a2839faf38f19ae6.png","Aprimorar Físico":"/temporada/assets/ee15a0b0a7558407c91a.png","Aprimorar Mente":"/temporada/assets/cc7252130e52d9d10012.png","Arma Atroz":"/temporada/assets/680867c2968c8c932a8b.png","Armadura de Sangue":"/temporada/assets/3b57b2624c5b019336b6.png","Canalizar o Medo":"/temporada/assets/59cb1a55033e19b36bc4.png","Capturar o Coração":"/temporada/assets/a4cb0480568a2bc3505c.png","Chamas do Caos":"/temporada/assets/957ab8e79984ed5e7361.png","Cicatrização":"/temporada/assets/e873a051f6c6956ffff0.png","Cinerária":"/temporada/assets/34eb38cd22f08f49a375.png","Coincidência Forçada":"/temporada/assets/1d5dd0df17c33497c1d0.png","Compreensão Paranormal":"/temporada/assets/e4cce7600641bce81f72.png","Conhecendo o Medo":"/temporada/assets/7388f93f2295680a0415.png","Consumir Manancial":"/temporada/assets/34799b74436b605d1289.png","Contato Paranormal":"/temporada/assets/3d281cd039d33a427345.png","Contenção Fantasmagórica":"/temporada/assets/cf82c92152fc615b12a0.png","Controle Mental":"/temporada/assets/9a8ba79e79a11c301c48.png","Convocação Instantânea":"/temporada/assets/357e7ffcea5bdff05bc2.png","Convocar o Algoz":"/temporada/assets/47a483a17a1a2c82477f.png","Corpo Adaptado":"/temporada/assets/cffe5a21f1013a4e1402.png","Decadência":"/temporada/assets/97af96dfd30ab87c7514.png","Definhar":"/temporada/assets/14aaab356fa3c34d16f9.png","Deflagração de Energia":"/temporada/assets/e33f780d195982761c64.png","Desacelerar Impacto":"/temporada/assets/897eb9e0617054d6e2b0.png","Descarnar":"/temporada/assets/d2a6fa9df18cd186dbdb.png","Detecção de Ameaças":"/temporada/assets/22a47d43add8f7dbc240.png","Dissipar Ritual":"/temporada/assets/a9502bf3175602eada68.png","Dissonância Acústica":"/temporada/assets/61a104bc84583f88966d.png","Distorção Temporal":"/temporada/assets/fdb961816e9ee8176cdc.png","Distorcer Aparência":"/temporada/assets/d111887dd190356e0533.png","Eco Espiral":"/temporada/assets/ade38f1e258b46a0d12d.png","Eletrocussão":"/temporada/assets/12abcda414ff3275feeb.png","Embaralhar":"/temporada/assets/9196c9f303ab3367d2ce.png","Enfeitiçar":"/temporada/assets/6ce5103e0154928bbde6.png","Esconder dos Olhos":"/temporada/assets/e3edf1e4051327d5456f.png","Espirais da Perdição":"/temporada/assets/6c237dcff4644569f75b.png","Ferver Sangue":"/temporada/assets/8509bc4d0c6559abb857.png","Fim Inevitável":"/temporada/assets/dbf43d7f652c6bddb420.png","Flagelo de Sangue":"/temporada/assets/ed6ff0663efbafe4bc8c.png","Forma Monstruosa":"/temporada/assets/58ae96968f7e771c1334.png","Fortalecimento Sensorial":"/temporada/assets/6d8f4984f215c268f856.png","Hemofagia":"/temporada/assets/e09579eb6603f98bd97c.png","Inexistir":"/temporada/assets/02fbb336b52608941c9b.png","Invadir Mente":"/temporada/assets/30a35079228349d8098b.png","Invólucro de Carne":"/temporada/assets/f4dddf63c4276df7ebad.png","Lâmina do Medo":"/temporada/assets/f4d3228ed2ebe4a02360.png","Localização":"/temporada/assets/89697545caa804315f5d.png","Luz":"/temporada/assets/854b93372d47de2c2902.png","Medo Tangível":"/temporada/assets/d035f61989e877ee5f48.png","Mergulho Mental":"/temporada/assets/262ad93f7c20dac46686.png","Miasma Entrópico":"/temporada/assets/0283fafb5da2052990ef.png","Nuvem de Cinzas":"/temporada/assets/7fb865a4995ea74e9d02.png","Ódio Incontrolável":"/temporada/assets/b3bcffe670a466584c7e.png","Ouvir os Sussurros":"/temporada/assets/28e8ff5fbd2e9a83500e.png","Paradoxo":"/temporada/assets/9f8939c099d94f01bee4.png","Perturbação":"/temporada/assets/def8feaf1601d1d5b180.png","Poeira da Podridão":"/temporada/assets/253c9655ea628f06c635.png","Polarização Caótica":"/temporada/assets/0e89f4234a8a78e3632f.png","Possessão":"/temporada/assets/bb4e60b70cce5cdfd4dc.png","Presença do Medo":"/temporada/assets/9e02554f08442d585ac4.png","Proteção contra Rituais":"/temporada/assets/425b057bbb3753ba69d0.png","Purgatório":"/temporada/assets/eb33913421a661b0843e.png","Rejeitar Névoa":"/temporada/assets/403e122af76b4ad5cdd0.png","Salto Fantasma":"/temporada/assets/6186a89b79ad78df19a8.png","Sopro do Caos":"/temporada/assets/82024f2350a51b0f82cb.png","Tecer Ilusão":"/temporada/assets/074a460cea6b73149fd7.png","Tela de Ruído":"/temporada/assets/b1e53f8dbc0bbbb49012.png","Teletransporte":"/temporada/assets/05e9fa82f83fce307d90.png","Tentáculos de Lodo":"/temporada/assets/a1840870b89fc8afe0d4.png","Terceiro Olho":"/temporada/assets/6d711f1f8d1f4deca409.png","Transfigurar Água":"/temporada/assets/c4544bd2406c73cd0048.png","Transfigurar Terra":"/temporada/assets/ab951b5b6be5523fd58d.png","Transfusão Vital":"/temporada/assets/22972c8251780cc763d5.png","Velocidade Mortal":"/temporada/assets/ac874077a98137638fc0.png","Vidência":"/temporada/assets/521334265699a1b4325d.png","Vínculo de Sangue":"/temporada/assets/3242a334c1e21e378569.png","Vomitar Pestes":"/temporada/assets/b9de0e3130eca38e7ecc.png","Zerar Entropia":"/temporada/assets/4b22c0242b69b8032c30.png","Esfolar":"/temporada/assets/c22ec1b1a648a12dffff.png","Sede de Adrenalina":"/temporada/assets/765f8a16e514d85bea47.png","Odor da Caçada":"/temporada/assets/5dab3a21ffaf2d1fd510.png","Martírio de Sangue":"/temporada/assets/cd84c755900409ef7d99.png","Apagar as Luzes":"/temporada/assets/d5aa4174215565762c65.png","Língua Morta":"/temporada/assets/3270dfd5824c54032f7c.png","Fedor Pútrido":"/temporada/assets/a2c2d44d437d8a728853.png","Singularidade Temporal":"/temporada/assets/1056db95336ca74e9f8d.png","Desfazer Sinapses":"/temporada/assets/baa424a750beb720081c.png","Aurora da Verdade":"/temporada/assets/fa56383c03c683be77eb.png","Relembrar Fragmento":"/temporada/assets/6c66712aa782d6322357.png","Pronunciar Sigilo":"/temporada/assets/cd0a122ece0466d1deed.png","Overclock":"/temporada/assets/4ecc35e13b5aa278f45f.png","Tremeluzir":"/temporada/assets/b51eab094b8c6c0dd8e2.png","Mutar":"/temporada/assets/564825415c0af0f262ca.png","Milagre Ionizante":"/temporada/assets/fb2a319cb1dd74fccbfd.png"};
var ritualReady=true;
let ritualDetailOpen=false;
function ritualState(){if(!state.rituals||Array.isArray(state.rituals))state.rituals={known:[],selected:null,cursedItemId:null};return state.rituals;}
function ritualCommit(change){const previous=JSON.stringify(ritualState());change(ritualState());try{localStorage.setItem(window.SeasonContext.stateKey,JSON.stringify(state));window.dispatchEvent(new Event('season:change'));$('ritual-save-error').textContent='';renderRituals();return true;}catch(e){state.rituals=JSON.parse(previous);$('ritual-save-error').textContent='Não foi possível salvar os rituais. Libere espaço no navegador.';toast('Não foi possível salvar a alteração.');return false;}}
function ritualText(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function ritualGradeRequiredIP(ritual){return ({1:1,2:4,3:7})[Number(ritual?.circle)]||Infinity;}
function ritualMaxKnown(){
  // O PDF fornece tetos no IP10; não inventar limites por IP intermediário.
  return ({Vanguarda:3,Analista:5,Canalizador:12})[state.origin]||0;
}
function canLearnRitual(ritual){
  return Boolean(ritual)&&ipLevel()>=ritualGradeRequiredIP(ritual)&&exilioBook[state.origin]&&
    ritualState().known.filter(name=>ritualCatalogOffline.some(r=>r.name===name)).length<ritualMaxKnown();
}
function renderRitualDetails(ritual,target='ritual-detail-content'){const panel=$(target);panel.replaceChildren();if(!ritual){panel.append(ritualText('p','Selecione um ritual para ver sua imagem e informações de conjuração.'));return;}if(ritualSigilsOffline[ritual.name]&&!Number.isFinite(ritual.costPM)){const image=document.createElement('img');image.src=ritualSigilsOffline[ritual.name];image.alt='Símbolo de '+ritual.name;image.className='ritual-detail-image';panel.append(image);}panel.append(ritualText('h3',ritual.name));const meta=document.createElement('dl');meta.className='ritual-meta';for(const [label,key] of [['Grau','grade'],['Custo','cost'],['Execução','cast'],['Alcance','range'],['Alvo / Área','target'],['Duração','duration'],['Resistência','resistance']]){const cell=document.createElement('div');cell.append(ritualText('dt',label),ritualText('dd',ritual[key]||'—'));meta.append(cell);}panel.append(meta);for(const [label,key] of [['Efeito','desc']]){if(!ritual[key])continue;panel.append(ritualText('h4',label),ritualText('p',ritual[key]));}if(target==='ritual-catalog-preview'){const add=ritualText('button',ritualState().known.includes(ritual.name)?'Já adquirido':'＋ Adquirir ritual');add.type='button';add.className='ritual-popup-acquire';const learned=ritualState().known.includes(ritual.name);
add.disabled=learned||!canLearnRitual(ritual);
if(!learned&&!canLearnRitual(ritual))add.textContent='Exige '+ritual.grade+' (IP '+ritualGradeRequiredIP(ritual)+') e vaga para ritual da classe';
add.onclick=()=>{
 if(!canLearnRitual(ritual)){toast('Este ritual exige IP suficiente e respeitar o limite de aprendizado da classe.');return;}
 if(ritualCommit(s=>{if(!s.known.includes(ritual.name))s.known.push(ritual.name);s.selected=ritual.name;}))renderRitualCatalog();
};panel.append(add);return;}if(Number.isFinite(ritual.costPM)){
 let modulationPM=0;
 let modulationName='';
 if(state.origin==='Canalizador'){
   const label=ritualText('label','Modulação do Canalizador (somente uma por ritual, salvo Trama Dupla)');
   label.className='exilio-ritual-mod-label';
   const select=document.createElement('select');select.className='exilio-ritual-modulation';
   const options=[
     ['',0,'Sem Modulação',true],
     ['Expansão',2,'Expansão · +2 PM · alcance +3m',true],
     ['Persistência',2,'Persistência · +2 PM · duração +1 rodada',!/instantâneo/i.test(ritual.duration)],
     ['Intensificação',4,'Intensificação · +4 PM · +1 dado elegível (até d12)',/\d+d(?:4|6|8|10|12)\b/i.test(ritual.desc)]
   ];
   for(const [value,cost,text,allowed] of options){
     const option=document.createElement('option');option.value=value;option.textContent=text;option.disabled=!allowed;option.dataset.pm=String(cost);select.append(option);
   }
   select.addEventListener('change',()=>{
     const option=select.selectedOptions[0];
     modulationName=String(option?.value||'');
     modulationPM=Number(option?.dataset.pm)||0;
     const total=ritual.costPM+modulationPM;
     cast.textContent='CONJURAR · '+total+' PM';
     cast.disabled=Number(state.resources?.sanity?.current||0)<total||ipLevel()<ritualGradeRequiredIP(ritual);
   });
   panel.append(label,select);
 }
 const cast=ritualText('button','CONJURAR · '+ritual.cost);
 cast.type='button';cast.className='ritual-popup-acquire';
 cast.title='Consome PM antes do efeito. Teste 2d10 + CNS + Anomalias quando houver resistência.';
 cast.disabled=Number(state.resources?.sanity?.current||0)<ritual.costPM||ipLevel()<ritualGradeRequiredIP(ritual);
 cast.onclick=()=>{
   const current=Number(state.resources?.sanity?.current||0);
   if(current<ritual.costPM+modulationPM||ipLevel()<ritualGradeRequiredIP(ritual)){toast('PM insuficientes ou Grau bloqueado.');return;}
   state.resources.sanity.current=current-ritual.costPM-modulationPM;
   save();display();
   if(ritual.resistance!=='—'){
     const pool=rollSkillPool((Number(state.attrs.consciencia)||0)+(Number(state.skillDomains?.['ANOMALIAS'])||0));
     pool.detail+=' · Teste de conjuração contra a resistência do alvo.'+(modulationName?' Modulação: '+modulationName+' ('+modulationPM+' PM).':'');
     if(pool.kept?.length===2&&pool.kept[0]===pool.kept[1]){
       const equal=pool.kept[0];
       if(equal<=3){state.resources.sanity.current=Math.max(0,state.resources.sanity.current-1);save();display();pool.detail+=' · Eco Dissonante: −1 PM adicional.';}
       else if(equal<=7)pool.detail+=' · Eco Manifesto: consequência narrativa.';
       else pool.detail+=' · Eco Ressonante: se o teste for bem-sucedido, recupere 1 PM do ritual.';
     }
     showSkillDice(pool,'CONJURAÇÃO',ritual.name);
   }else toast('Ritual conjurado: '+(ritual.costPM+modulationPM)+' PM gastos.'+(modulationName?' Modulação '+modulationName+'.':''));
 };
 panel.append(cast);
}
const remove=ritualText('button','Remover ritual');remove.type='button';remove.onclick=()=>ritualCommit(s=>{s.known=s.known.filter(n=>n!==ritual.name);if(s.selected===ritual.name)s.selected=s.known[0]||null;});panel.append(remove);}
function renderRituals(){const s=ritualState(),list=$('ritual-saved-list');list.replaceChildren();$('ritual-total').textContent=s.known.length+(s.known.length===1?' ritual':' rituais');if(!s.known.length)list.append(ritualText('p','Nenhum ritual adquirido. Use + Adquirir ritual.'));for(const name of s.known){const r=ritualCatalogOffline.find(r=>r.name===name)||{name,grade:'Ritual de edição anterior',cost:'—',desc:'Este ritual foi mantido nos dados salvos, mas não consta no Livro Básico do Exílio 3.0. Remova-o se desejar atualizar a ficha.'};const card=document.createElement('button');card.type='button';card.className='ritual-saved-card';card.setAttribute('aria-pressed',String(s.selected===name));if(ritualSigilsOffline[name]&&!Number.isFinite(r.costPM)){const img=document.createElement('img');img.src=ritualSigilsOffline[name];img.alt='';img.loading='lazy';card.append(img);}const label=document.createElement('span');label.append(ritualText('strong',name),ritualText('small',r.grade+' · '+r.cost));card.append(label);card.onclick=()=>{ritualDetailOpen=true;if(ritualCommit(s=>{s.selected=name;}))setRitualDetailOpen(true);else setRitualDetailOpen(false);};list.append(card);}renderRitualDetails(ritualCatalogOffline.find(r=>r.name===s.selected)||(s.selected?{name:s.selected,grade:'Ritual de edição anterior',cost:'—',desc:'Ritual da versão anterior preservado; não consta no Exílio 3.0.'}:null));setRitualDetailOpen(ritualDetailOpen&&s.known.includes(s.selected));const item=inventoryState().items.find(i=>i.id===s.cursedItemId);inventoryPaintSlot($('ritual-cursed-slot'),item,'Vincular item do inventário');$('ritual-cursed-clear').hidden=!item;}
let ritualPreviewName=null;
function ritualAccent(r){return {Conhecimento:'#d3b55f',Energia:'#bd83ed',Medo:'#d9d9dc',Morte:'#a5a6b5',Sangue:'#e56960'}[r.element]||'#db9c72';}
function renderRitualCatalog(){const query=ammoNormalize($('ritual-search').value),element='',circle=$('ritual-filter-circle').value,list=$('ritual-catalog-list');list.replaceChildren();const matches=ritualCatalogOffline.filter(r=>ammoNormalize(r.name+' '+r.desc+' '+r.grade).includes(query)&&(!element||(r.elements||[r.element]).includes(element))&&(!circle||String(r.circle)===circle)).sort((a,b)=>Number(a.circle)-Number(b.circle)||a.name.localeCompare(b.name,'pt-BR'));$('ritual-catalog-count').textContent=matches.length+' encontrados · '+ritualCatalogOffline.length+' rituais';if(!matches.some(r=>r.name===ritualPreviewName))ritualPreviewName=null;if(!matches.length)list.append(ritualText('p','Nenhum ritual corresponde aos filtros.'));for(const r of matches){const row=document.createElement('button');row.type='button';row.className='ritual-catalog-entry';row.style.setProperty('--ritual-accent',ritualAccent(r));row.setAttribute('aria-pressed',String(r.name===ritualPreviewName));if(ritualSigilsOffline[r.name]&&!Number.isFinite(r.costPM)){const img=document.createElement('img');img.src=ritualSigilsOffline[r.name];img.alt='';img.loading='lazy';row.append(img);}row.append(ritualText('strong',r.name));const chips=document.createElement('small');for(const text of [r.grade,r.cost])chips.append(ritualText('span',text));row.append(chips);if(ritualState().known.includes(r.name))row.append(ritualText('span','Adquirido','ritual-acquired-label'));row.onclick=()=>{const scroll=list.scrollTop;ritualPreviewName=r.name;renderRitualCatalog();list.scrollTop=scroll;$('ritual-catalog-preview').scrollTop=0;};list.append(row);}renderRitualDetails(ritualCatalogOffline.find(r=>r.name===ritualPreviewName),'ritual-catalog-preview');}
$('ritual-acquire').onclick=()=>{$('ritual-search').value='';$('ritual-filter-element').value='';$('ritual-filter-circle').value='';ritualPreviewName=null;renderRitualCatalog();$('ritual-acquire-dialog').showModal();};$('ritual-search').oninput=renderRitualCatalog;$('ritual-filter-element').onchange=renderRitualCatalog;$('ritual-filter-circle').onchange=renderRitualCatalog;$('ritual-acquire-close').onclick=()=>$('ritual-acquire-dialog').close();
$('ritual-cursed-slot').onclick=()=>{const list=$('ritual-cursed-options');list.replaceChildren();const items=inventoryState().items;if(!items.length)list.append(ritualText('p','Adicione um item ao inventário primeiro.'));for(const item of items){const b=document.createElement('button');b.type='button';b.className='item-slot';inventoryPaintSlot(b,item,'');b.onclick=()=>{if(ritualCommit(s=>{s.cursedItemId=item.id;}))$('ritual-cursed-dialog').close();};list.append(b);}$('ritual-cursed-dialog').showModal();};$('ritual-cursed-close').onclick=()=>$('ritual-cursed-dialog').close();$('ritual-cursed-clear').onclick=()=>ritualCommit(s=>{s.cursedItemId=null;});

function setRitualDetailOpen(open){ritualDetailOpen=Boolean(open);const panel=$('ritual-detail-panel');panel.classList.toggle('ritual-detail-closed',!ritualDetailOpen);panel.setAttribute('aria-hidden',String(!ritualDetailOpen));panel.inert=!ritualDetailOpen;}
$('ritual-detail-close').onclick=()=>{setRitualDetailOpen(false);const active=$('ritual-saved-list').querySelector('[aria-pressed="true"]');active?.focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ritualDetailOpen&&!document.querySelector('dialog[open]'))setRitualDetailOpen(false);});

renderRituals();

  window.SeasonSheet={
    getState:()=>JSON.parse(JSON.stringify(state)),
    applyState(next){if(!next||typeof next!=='object'||!next.attrs||!next.skills)throw Error('Ficha da temporada inválida.');state={...JSON.parse(JSON.stringify(initial)),...next};display();save();},
    project(){
      const inv=inventoryState(),weapon=equippedWeaponAttack(),ammo=weapon&&weaponAmmoSpec(weapon);
      const inventory=inv.items.map(item=>{const c=itemCatalog.find(c=>c.id===String(item.image||'').replace(/^catalog:/,''))||itemCatalog.find(c=>c.name===item.name);return {id:item.id,n:item.name,w:inventoryItemWeight(item),d:item.description||'',eq:Object.values(inv.equipped).includes(item.id),type:item.type==='weapon'?'arma':c?.category==='Munições'?'municao':'comum',img:inventoryArtworkSource(item),dmg:c?.dmg||'',crit:c?.crit||'20/x2',skill:c?.skill||'Luta',ammo:c?.ammo||'',capacity:c?.capacity||0,currentShots:state.combat?.ammunition?.['equipped:'+item.id]??c?.capacity??0};});
      const attributes={};for(const [native,legacy] of [['forca','for'],['agilidade','agi'],['vigor','vig'],['intelecto','int'],['presenca','pre']])attributes['attr_'+legacy]=state.attrs[native]||0;
      return {sheetType:'temporada',info:{char_nome:state.name||'',char_nex:state.nex||0,char_ocupacao:state.occupation||'Nenhum',vida_atual:state.resources.life.current,vida_max:state.resources.life.max,sani_atual:state.resources.sanity.current,sani_max:state.resources.sanity.max},attrs:attributes,skills:{...state.skills},inv:inventory,defense:totalCombatDefense(),clues:clueState().map(c=>({...c,desc:c.text||'',img:c.image||'',pages:(c.pages||[]).map(img=>typeof img==='string'?{img}:img)})),activeWeaponId:weapon?.itemId||'',armaDisparoAtiva:ammo?{id:weapon.itemId,nome:weapon.name,municao:ammo.type,atual:ammoRemaining(weapon,ammo),capacidade:ammo.capacity}:null};
    },
    applyMaster(data){
      if(data.sheetType!=='temporada'||!data.temporada?.state)throw Error('Esta não é uma ficha da temporada.');
      state=JSON.parse(JSON.stringify(data.temporada.state));const info=data.info||{};
      if(info.char_nome!==undefined)state.name=String(info.char_nome);if(info.char_nex!==undefined)state.nex=Number(info.char_nex)||0;
      state.resources=state.resources||{};for(const [key,prefix] of [['life','vida'],['sanity','sani']])state.resources[key]=normalizeResource({current:info[prefix+'_atual']??state.resources[key]?.current??100,max:info[prefix+'_max']??state.resources[key]?.max??100});
      const inv=inventoryState();if(Array.isArray(data.inv)){const previous=new Map(inv.items.map(i=>[i.id,i]));const accepted=[];for(const item of data.inv){const existing=previous.get(item.id);if(existing){accepted.push({...existing,name:String(item.n||existing.name),description:String(item.d??existing.description),weight:Number(item.w??existing.weight)});continue;}const c=itemCatalog.find(c=>c.name===item.n);const converted={id:item.id||crypto.randomUUID(),name:String(item.n||'Item'),description:String(item.d||'').replace(/<[^>]*>/g,' '),weight:Number(item.w)||0,quantity:1,location:'equipment',type:c?.type||(item.type==='arma'?'weapon':'gear'),image:c?.image?'catalog:'+c.id:(item.img||'')};if(item.type==='arma')converted.description+='\nDano: '+item.dmg+'\nCrítico: '+item.crit+'\nPerícia: '+item.skill+'\nMunição: '+item.ammo+'\nCapacidade: '+item.capacity;inv.items=Array.from(new Map([...previous.values(),...accepted].map(i=>[i.id,i])).values());let fits=false;for(const location of ['equipment','backpack']){converted.location=location;try{validateBackpackItem(converted);fits=true;break;}catch(_){}}if(fits)accepted.push(converted);else toast('Sem espaço para receber '+converted.name+'.');}inv.items=accepted;for(const key of Object.keys(inv.equipped))if(!inv.items.some(i=>i.id===inv.equipped[key]))inv.equipped[key]=null;}
      if(Array.isArray(data.clues))state.clues=data.clues.map(c=>({...c,title:c.title||'Pista',text:c.desc??c.text??'',image:c.img??c.image??'',pages:(c.pages||[]).map(p=>typeof p==='string'?p:p.img).filter(Boolean)}));
      if(data.defense!==undefined)combatState().defense=Math.max(0,Number(data.defense)-equippedArmorDefense().bonus||0);
      display();save();
    },
    inspection(){const c=clueState().find(c=>c.id===inspectedClue);if(!c)return null;return {clue:{...c,desc:c.text||'',img:c.image||'',coverImg:c.image||'',pages:(c.pages||[]).map(img=>({img}))},state:{rotationX:clueTilt,rotationY:clueAngle,zoom:clueZoom,panXRatio:clueX/Math.max(1,$('clue-stage').clientWidth),panYRatio:clueY/Math.max(1,$('clue-stage').clientHeight),open:cluePage>=0,spread:Math.max(0,Math.floor(cluePage/2))}};},
    notify:toast
  };

  display();updateScale();
})();
(function(){
  'use strict';
  const get = id => document.getElementById(id);
  const input = get('portrait-file');
  const stage = get('portrait-stage');
  const picture = get('portrait-png');
  const hint = get('portrait-hint');
  const replace = get('portrait-replace');
  const settingKey=window.SeasonContext.prefix+'outrolado_offline_foto_posicao_v3';
  // Aplicar uma única vez o novo padrão horizontal, preservando tamanho e altura.
  try { const marker=window.SeasonContext.prefix+'outrolado_offline_horizontal_m60_v1'; if(!localStorage.getItem(marker)){ const previous=JSON.parse(localStorage.getItem(settingKey)||'null')||{scale:100,y:0}; previous.x=-60;localStorage.setItem(settingKey,JSON.stringify(previous));localStorage.setItem(marker,'1');} } catch (_) {}
  const fallbackKey=window.SeasonContext.prefix+'outrolado_offline_foto_png_v1';
  const dbName=window.SeasonContext.prefix+'outrolado_offline_foto_personagem_v1';
  let currentObjectURL=null;let seasonPhotoData='';
  let messageTimer;
  const defaults={scale:100,x:-60,y:0};
  let settings={...defaults};
  // A versão aumentada usava 135%, X=0, Y=18 por padrão. Voltar ao tamanho anterior.
  try {
    const previous=JSON.parse(localStorage.getItem(settingKey)||'null');
    if(previous && Number(previous.scale)===135 && Number(previous.x)===0 && Number(previous.y)===18) {
      localStorage.removeItem(settingKey);
    }
  } catch (_) {}
  try{
    const restored=JSON.parse(localStorage.getItem(settingKey)||'null');
    if(restored && typeof restored==='object')settings={
      scale:Math.max(60,Math.min(175,Number(restored.scale)||100)),
      x:Math.max(-240,Math.min(240,Number(restored.x)||0)),
      y:Math.max(-250,Math.min(250,Number(restored.y)||0))
    };
  }catch(_){ }
  function notify(text){
    const toast=get('toast');if(!toast)return;
    toast.textContent=text;toast.classList.add('visible');
    clearTimeout(messageTimer);
    messageTimer=setTimeout(()=>toast.classList.remove('visible'),3500);
  }
  function persistSettings(){window.dispatchEvent(new Event('season:change'));try{localStorage.setItem(settingKey,JSON.stringify(settings))}catch(_){}}
  function applySettings(){
    picture.style.transform=`translate(${settings.x}px, ${settings.y}px) scale(${settings.scale/100})`;
    for(const [id,value,out,format] of [
      ['photo-scale',settings.scale,'photo-scale-value',v=>v+'%'],
      ['photo-offset-x',settings.x,'photo-x-value',v=>v+' px'],
      ['photo-offset-y',settings.y,'photo-y-value',v=>v+' px']
    ]){get(id).value=value;get(out).textContent=format(value);}
  }
  applySettings();
  [['photo-scale','scale'],['photo-offset-x','x'],['photo-offset-y','y']].forEach(([id,key])=>{
    get(id).addEventListener('input',ev=>{
      settings[key]=Number(ev.target.value);applySettings();persistSettings();
    });
  });
  // Faz o personagem ocupar a área reservada da ficha, mesmo que o PNG
  // tenha centenas de pixels transparentes nas laterais ou no alto.
  // A imagem original continua salva sem alterações.
  function prepararEnquadramento(blob){
    return new Promise(resolve=>{
      if(!blob){resolve(null);return;}
      const sourceUrl=URL.createObjectURL(blob);
      const preview=new Image();
      preview.onload=()=>{
        URL.revokeObjectURL(sourceUrl);
        try{
          const width=preview.naturalWidth,height=preview.naturalHeight;
          if(!width||!height||width*height>30000000){resolve(blob);return;}
          const sourceCanvas=document.createElement('canvas');
          sourceCanvas.width=width;sourceCanvas.height=height;
          const ctx=sourceCanvas.getContext('2d',{willReadFrequently:true});
          if(!ctx){resolve(blob);return;}
          ctx.drawImage(preview,0,0);
          const imageData=ctx.getImageData(0,0,width,height);
          const px=imageData.data;
          let left=width,top=height,right=-1,bottom=-1;
          // Preservar exatamente o enquadramento anterior: medir o contorno
          // antes de limpar pixels, para nao ampliar/deslocar a personagem.
          for(let y=0;y<height;y++){for(let x=0;x<width;x++){
            if(px[(y*width+x)*4+3]>15){
              if(x<left)left=x;if(x>right)right=x;
              if(y<top)top=y;if(y>bottom)bottom=y;
            }
          }}
          if(right<left||bottom<top){resolve(blob);return;}
          // Remove apenas a sobra transparente/escura do PNG (halo de sombra).
          // Mantem os pixels opacos, os tracos do personagem e as cores originais.
          // A silhueta nao recebe uma sombra artificial via CSS.
          for(let p=0;p<px.length;p+=4){
            const a=px[p+3];
            if(!a)continue;
            const brilho=(px[p]*54+px[p+1]*183+px[p+2]*19)/256;
            if(a<62 || (a<220 && brilho<55)){
              px[p+3]=0;
            }else if(a<132){
              // suaviza a borda para evitar contorno duro apos remover o halo
              px[p+3]=Math.round(a*(a-62)/70);
            }
          }
          ctx.putImageData(imageData,0,0);
          const cw=right-left+1,ch=bottom-top+1;
          const padX=Math.round(cw*.025),padTop=Math.round(ch*.02),padBottom=Math.round(ch*.015);
          left=Math.max(0,left-padX);right=Math.min(width-1,right+padX);
          top=Math.max(0,top-padTop);bottom=Math.min(height-1,bottom+padBottom);
          // No hard crop of the character itself, only transparent canvas borders.
          const out=document.createElement('canvas');
          out.width=right-left+1;out.height=bottom-top+1;
          out.getContext('2d').drawImage(sourceCanvas,left,top,out.width,out.height,0,0,out.width,out.height);
          out.toBlob(result=>resolve(result||blob),'image/png');
        }catch(e){resolve(blob);}
      };
      preview.onerror=()=>{URL.revokeObjectURL(sourceUrl);resolve(blob);};
      preview.src=sourceUrl;
    });
  }
  let seasonAvatarData='';
  async function createPortraitAvatar(blob){
    const url=URL.createObjectURL(blob),img=new Image();
    try{
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
      const canvas=document.createElement('canvas');
      canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let left=canvas.width,top=canvas.height,right=-1,bottom=-1;
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        if(pixels[(y*canvas.width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      }
      if(right<left)return '';
      const height=bottom-top+1,width=right-left+1;
      // Reference framing: full hair, face, neck and upper shoulders, with headroom.
      // Already square portraits keep their original framing.
      const fullBody=height>width*1.4;
      const side=fullBody?height*.42:Math.max(width,height);
      const cropTop=fullBody?top-side*.09:top;
      let headLeft=right,headRight=left;
      if(fullBody){
        for(let y=top;y<=Math.min(bottom,top+Math.floor(height*.24));y++)for(let x=left;x<=right;x++){
          if(pixels[(y*canvas.width+x)*4+3]>128){headLeft=Math.min(headLeft,x);headRight=Math.max(headRight,x);}
        }
      }
      const center=fullBody&&headRight>=headLeft?(headLeft+headRight+1)/2:(left+right+1)/2;
      const out=document.createElement('canvas');out.width=512;out.height=512;
      out.getContext('2d').drawImage(canvas,center-side/2,cropTop,side,side,0,0,512,512);
      return out.toDataURL('image/png');
    }finally{URL.revokeObjectURL(url);}
  }
  let photoSequence=0;
  async function setPhoto(blob){
    const sequence=++photoSequence;seasonPhotoData=blob?await fileToDataURL(blob):'';
    if(!blob){
      seasonAvatarData='';
      if(currentObjectURL){URL.revokeObjectURL(currentObjectURL);currentObjectURL=null;}
      picture.removeAttribute('src');picture.hidden=true;hint.hidden=false;replace.hidden=true;window.dispatchEvent(new Event('season:change'));
      return;
    }
    const framed=await prepararEnquadramento(blob);
    const avatar=await createPortraitAvatar(framed);
    if(sequence!==photoSequence)return;
    seasonAvatarData=avatar;
    if(currentObjectURL){URL.revokeObjectURL(currentObjectURL);currentObjectURL=null;}
    currentObjectURL=URL.createObjectURL(framed);
    picture.onload=()=>{if(sequence===photoSequence){picture.hidden=false;hint.hidden=true;replace.hidden=false;}};
    picture.onerror=()=>{if(sequence===photoSequence){picture.hidden=true;hint.hidden=false;replace.hidden=true;notify('Não consegui abrir esse PNG. Tente outra imagem.');}};
    picture.src=currentObjectURL;window.dispatchEvent(new Event('season:change'));
  }
  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window))return reject(new Error('Sem armazenamento de imagens'));
      const req=indexedDB.open(dbName,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos')};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Banco indisponível'));
      req.onblocked=()=>reject(new Error('Banco bloqueado'));
    });
  }
  async function storeInDB(blob){
    const db=await openDB();
    try{
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('photos','readwrite');
        tx.objectStore('photos').put(blob,'main');
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });
    }finally{db.close();}
  }
  async function getFromDB(){
    const db=await openDB();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction('photos','readonly');
      const req=tx.objectStore('photos').get('main');
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });}finally{db.close();}
  }
  async function deleteInDB(){
    const db=await openDB();
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').delete('main');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }
  function fileToDataURL(file){return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
  })}
  function dataURLToBlob(url){
    const [header,data]=url.split(',');
    if(!/^data:image\/png;base64$/i.test(header)||!data)throw Error('PNG inválido');
    const bytes=atob(data);const out=new Uint8Array(bytes.length);
    for(let i=0;i<bytes.length;i++)out[i]=bytes.charCodeAt(i);
    return new Blob([out],{type:'image/png'});
  }
  async function saveFile(file){
    try{
      await storeInDB(file);
      try{localStorage.removeItem(fallbackKey)}catch(_){ }
      return true;
    }catch(_){
      try{
        // Reserva: arquivos menores podem ser gravados sem IndexedDB.
        if(file.size>1200000)return false;
        localStorage.setItem(fallbackKey,await fileToDataURL(file));
        return true;
      }catch(_){return false;}
    }
  }
  async function loadPNG(file){
    if(!file)return;
    if(!(file.type==='image/png'||/\.png$/i.test(file.name))){notify('Escolha uma imagem PNG (.png).');return;}
    if(file.size>15000000){notify('O PNG precisa ter no máximo 15 MB.');return;}
    settings={...defaults};
    applySettings();
    persistSettings();
    setPhoto(file);
    const saved=await saveFile(file);
    notify(saved?'PNG enquadrado automaticamente! Imagem original salva no navegador.':'PNG enquadrado automaticamente! O navegador não conseguiu guardar a imagem para reabrir depois.');
  }
  async function restorePhoto(){
    try{
      const stored=await getFromDB();
      if(stored){await setPhoto(stored);return;}
    }catch(_){ }
    try{
      const fallback=localStorage.getItem(fallbackKey);
      if(fallback)await setPhoto(dataURLToBlob(fallback));
    }catch(_){ }
  }
  async function removePhoto(){
    setPhoto(null);input.value='';
    try{await deleteInDB()}catch(_){ }
    try{localStorage.removeItem(fallbackKey)}catch(_){ }
    notify('PNG removido da prévia.');
  }
  const pick=()=>input.click();
  get('photo-header-upload').addEventListener('click',pick);
  get('photo-panel-add').addEventListener('click',pick);
  hint.addEventListener('click',pick);
  replace.addEventListener('click',pick);
  get('photo-remove').addEventListener('click',removePhoto);
  input.addEventListener('change',ev=>{void loadPNG(ev.target.files?.[0]);ev.target.value='';});
  // Arrastar um PNG para a silhueta ou o quadro também funciona offline.
  for(const event of ['dragenter','dragover'])stage.addEventListener(event,ev=>{
    ev.preventDefault();stage.classList.add('dragging');
    if(ev.dataTransfer)ev.dataTransfer.dropEffect='copy';
  });
  for(const event of ['dragleave','drop'])stage.addEventListener(event,ev=>{
    ev.preventDefault();stage.classList.remove('dragging');
  });
  stage.addEventListener('drop',ev=>{void loadPNG(ev.dataTransfer?.files?.[0]);});
  window.addEventListener('beforeunload',()=>{if(currentObjectURL)URL.revokeObjectURL(currentObjectURL)});
  window.SeasonPortrait={avatar:()=>seasonAvatarData,snapshot:()=>({image:seasonPhotoData,settings:{...settings}}),async apply(value){const image=value?.image||'';if(image&&!/^data:image\/png;base64,/.test(image))throw Error('Imagem de personagem inválida');if(image!==seasonPhotoData){if(image){const blob=dataURLToBlob(image);await setPhoto(blob);await saveFile(blob);}else{await removePhoto();}}settings={...defaults,...(value?.settings||{})};applySettings();persistSettings();}};
  window.SeasonPortrait.ready=restorePhoto();
})();
await window.SeasonPortrait.ready;await window.startSeasonSync();}catch(error){console.error(error);document.getElementById('season-status').textContent='Não foi possível abrir a ficha: '+error.message;}})();
