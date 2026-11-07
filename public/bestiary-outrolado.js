/* Bestiário de referência: nomes de Ordem Paranormal, fichas NÃO OFICIAIS.
   Todas as estatísticas, ações e textos foram criados para Outro Lado;
   não são cópias de blocos de estatísticas ou descrições dos livros. */
(function(global){
  'use strict';
  const groups=[
    ['Livro base','Sangue','Aberração de Carne|Aniquilação|Dama de Sangue|Enpap-X|Kerberos|Minotauro|Mulher Afogada|O Carente|O Diabo|Titã de Sangue|Zumbi de Sangue|Zumbi de Sangue Bestial'],
    ['Livro base','Morte','A Marionete|Aracnasita|Carniçal|Ceifador Espiral|Enraizado|Escutado|Esqueleto de Lodo|Múmia Xipófaga|Nidere|O Deus da Morte|Sempiternal|Succ'],
    ['Livro base','Conhecimento','Anjo|Bicho-Papão|Estrangeiro|Existido|Lembrado|Máscara do Desespero|O Espreitador|Ocioso|Parasita de Culpa|Rastejador Sombrio|Silhueta|Vulto'],
    ['Livro base','Energia','Anárquico|Anárquico Descontrolado|Anomalia|Anomiático|Ciborgue|Infecticídio|O Anfitrião|Perturbado de Energia|Sukkalgir|Tempestuoso|Telopsia|Viajante'],
    ['Livro base','Medo','Degolificada'],
    ['Sobrevivendo ao Horror','Conhecimento','Amigo Imaginário|Espectro Inesquecido|Melancolia|Rascunho'],
    ['Sobrevivendo ao Horror','Sangue','Derretido|Medusa|Mescla|Quibungo'],
    ['Sobrevivendo ao Horror','Morte','Memento Mori|Sepultado|Profundo'],
    ['Sobrevivendo ao Horror','Medo','O Uivar|O Terminal'],
    ['Campanhas — Segredo na Floresta','Sangue','Aberrado'],
    ['Campanhas — Segredo na Floresta','Morte','Aberrado de Lodo|Aranhas Desovadas|Cavalo de Lodo|Cobra de Lodo|Escorpião Lacraia|Labra|Larva de Lodo|Morcegosa|Rato de Lodo|Toupeira de Lodo|Zumbi de Lodo'],
    ['Campanhas — Segredo na Floresta','Energia','Aberrado Elétrico'],
    ['Campanhas — Desconjuração e Calamidade','Energia','Existido de Energia'],
    ['Campanhas — Desconjuração e Calamidade','Morte','Existido de Morte|Carniçal da Esfinge'],
    ['Campanhas — Desconjuração e Calamidade','Conhecimento','Ciclope'],
    ['Campanhas — Desconjuração e Calamidade','Sangue','Zumbi Armadurado|Zumbi Decepado|Zumbi Dentado|Zumbi Espinhento'],
    ['Campanhas — O Segredo na Ilha','Realidade','Cachorro Selvagem|Cobra|Javali'],
    ['Campanhas — O Segredo na Ilha','Sangue','Cachorro Selvagem Infectado|Cobra Infectada|Javali Infectado'],
    ['Campanhas — Sinais do Outro Lado','Energia','Bilu|Fummu|Interflorado|Centomorfo|Espectra|Fetilapo|Limiantro|Macróbio|Omatídeo|Reptilídio|Solínico'],
    ['Campanhas — Sinais do Outro Lado','Conhecimento','Doppelganger|Memoflígico'],
    ['Campanhas — Sinais do Outro Lado','Sangue','Rastropoda'],
    ['Campanhas — Quarentena, Natal Macabro e Hexatombe','Energia','Infectado'],
    ['Campanhas — Quarentena, Natal Macabro e Hexatombe','Realidade','Cão de Caça|Cascavel'],
    ['Campanhas — Quarentena, Natal Macabro e Hexatombe','Medo','Anulado'],
    ['Campanhas — Quarentena, Natal Macabro e Hexatombe','Sangue','Arara Devorada|Felino Devorado'],
    ['Enigma do Medo','Sangue','Besta de Sangue|Zumbi Cristalizado'],
    ['Enigma do Medo','Energia','E.C.O.S'],
    ['Enigma do Medo','Conhecimento','Espectro Fragmentado'],
    ['Enigma do Medo','Morte','Tirano de Lodo'],
    ['Vendeta Oculta','Morte','Sereia Encarnada de Morte|Sussurro Enraizado'],
    ['Vendeta Oculta','Sangue','Capivara Sangrenta|Onça Sangrenta|Quimera de Sangue|Tuiuiú Sangrento'],
    ['Vendeta Oculta','Realidade','Jacaré'],
    ['Vendeta Oculta','Conhecimento','Enfermeiro Psicárneo'],
    ['Arquivos Secretos','Energia','Estímulo|Marca-Passo'],
    ['Arquivos Secretos','Conhecimento','Hikikomori|Simulacro'],
    ['Arquivos Secretos','Sangue','Ssabáka'],
    ['Outras aparições','Conhecimento','A Magistrada|Alheio'],
    ['Outras aparições','Sangue','Zumbi Colossal'],
    ['Outras aparições','Morte','Aranha Preta']
  ];
  const slug=name=>String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const legendary=new Set(['Aniquilação','Ceifador Espiral','O Diabo','O Deus da Morte','O Anfitrião','Máscara do Desespero','A Magistrada','O Terminal','Titã de Sangue']);
  const extreme=new Set(['Kerberos','O Carente','O Uivar','Nidere','A Marionete','Anjo','Estrangeiro','Ciborgue','Infecticídio','Tempestuoso','Telopsia','Sempiternal','Quibungo','Profundo','Medusa','Besta de Sangue','Tirano de Lodo','Ssabáka','Zumbi Colossal','Quimera de Sangue']);
  const elevated=new Set(['Dama de Sangue','Enpap-X','Minotauro','Carniçal','Aracnasita','Múmia Xipófaga','Parasita de Culpa','O Espreitador','Bicho-Papão','Rastejador Sombrio','Anárquico Descontrolado','Anomiático','Sukkalgir','Viajante','Degolificada','Medusa','Memento Mori','Mescla','Sepultado','Doppelganger','Memoflígico','Infecticídio','Espectro Inesquecido','Onça Sangrenta','Enfermeiro Psicárneo']);
  const initial=new Set(['Zumbi de Sangue','Esqueleto de Lodo','Existido','Vulto','Aranhas Desovadas','Cobra','Javali','Cachorro Selvagem','Rato de Lodo','Larva de Lodo','Zumbi de Lodo','Infectado','Zumbi Decepado']);
  const tierOf=name=>legendary.has(name)?5:extreme.has(name)?4:elevated.has(name)?3:initial.has(name)?1:2;
  function roleOf(name,tier){
    if(tier===5)return 'entidade';
    if(/Titã|Colossal|Tirano|Profundo|Besta|Aniquilação|Quimera/.test(name))return 'colosso';
    if(/Lodo|Zumbi|Enraizado|Múmia|Aberrado|Javali|Sepultado|Minotauro|Kerberos/.test(name))return 'brutamontes';
    if(/Viajante|Cobra|Lacraia|Aranha|Nidere|Felino|Onça|Carniçal|Cão|Cachorro|Quibungo|Rastropoda/.test(name))return 'caçador';
    if(/Parasita|Infect|Larva|Mescla|Succ|Anomiático|Interflorado/.test(name))return 'parasita';
    if(/Sombra|Vulto|Espreitador|Rascunho|Bilu|Ocioso|Silhueta|Espectro|Morcegosa|Hikikomori/.test(name))return 'espreitador';
    if(/Ciborgue|Solínico|Marca-Passo|Tuiuiú/.test(name))return 'atirador';
    if(/Anárquico|Anárquico Descontrolado|Fummu|Existido|Perturbado/.test(name))return 'horda';
    return 'controle';
  }
  const entries=[];
  const seen=new Set();
  for(const [source,element,names] of groups){
    for(const name of names.split('|')){
      const id=slug(name);
      if(!name||seen.has(id))continue;
      seen.add(id);
      const tier=tierOf(name);
      entries.push(Object.freeze({id,name,source,element,tier,role:roleOf(name,tier)}));
    }
  }
  entries.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  Object.freeze(entries);
  const tierNames=Object.freeze(['','Inicial','Moderada','Elevada','Extrema','Lendária']);
  const descriptions={
    Sangue:'A atmosfera de confronto se intensifica; deixe uma pista física de sua passagem.',
    Morte:'O ritmo da cena parece irregular; descreva uma alteração observável no ambiente.',
    Conhecimento:'Uma lembrança incompleta distrai os presentes; permita uma investigação para entendê-la.',
    Energia:'Um pulso altera um objeto próximo; o Mestre decide que detalhe pode ser explorado.',
    Medo:'A percepção falha por um instante; ofereça aos jogadores uma maneira de confirmar o que viram.',
    Realidade:'O instinto e o terreno ditam o perigo; dê importância à cobertura e ao deslocamento.'
  };
  const roles={
    entidade:['Manifestação','2d6','Escolha uma consequência ambiental visível. Quem investigar pode antecipar a próxima ação.'],
    colosso:['Impacto','2d6','Golpe amplo. O alvo pode recuar e perder posição, evitando ficar encurralado.'],
    brutamontes:['Esmagamento','1d8','O alvo atingido escolhe entre ceder espaço ou sofrer pressão no turno seguinte.'],
    'caçador':['Investida','1d6','Pode avançar antes de agir, mas deixa rastros que revelam sua trajetória.'],
    parasita:['Contato','1d4','Se atingir, marca o alvo narrativamente; uma ação cuidadosa remove a marca.'],
    espreitador:['Ataque furtivo','1d6','Se não for observado, pode mudar de esconderijo depois do golpe.'],
    atirador:['Disparo','1d6','Atinge a distância e altera um ponto de cobertura visível no cenário.'],
    horda:['Assédio','1d4','Um segundo inimigo próximo pode aproveitar a distração para se aproximar.'],
    controle:['Interferência','1d4','O alvo escolhe entre interromper um movimento ou revelar sua posição.']
  };
  function makeMonster(id,overrideId){
    const e=entries.find(x=>x.id===id);
    if(!e)return null;
    const tier=e.tier,role=e.role;
    const strong=/brutamontes|colosso/.test(role);
    const fast=/caçador|espreitador/.test(role);
    const mind=/controle|entidade/.test(role);
    const cap=x=>Math.max(0,Math.min(5,x));
    const attrs={
      for:cap((strong?2:1)+Math.floor(tier/2)),
      agi:cap((fast?2:1)+Math.floor(tier/3)),
      int:cap((mind?2:0)+Math.floor(tier/3)),
      pre:cap((mind?2:1)+Math.floor(tier/3)),
      vig:cap((strong?2:1)+Math.floor(tier/2))
    };
    const base=2*tier;
    const skills={
      fortitude:Math.min(20,base+attrs.vig),
      reflexos:Math.min(20,base+attrs.agi),
      vontade:Math.min(20,base+attrs.pre),
      percepcao:Math.min(20,base+attrs.pre+1),
      iniciativa:Math.min(20,base+attrs.agi+1)
    };
    const hp=[0,20,40,72,125,210][tier]+(role==='colosso'?13*tier:role==='horda'?-6:role==='entidade'?9*tier:0);
    const [actionName,baseDamage,tip]=roles[role];
    const damage=['','1d4+1','1d6+2','2d6+3','3d8+4','4d10+6'][tier];
    const actions=[
      {id:'basic',name:actionName,test:'Luta '+Math.min(20,base+attrs.for),damage:role==='entidade'?damage:baseDamage+'+'+tier,description:tip},
      {id:'special',name:'Perturbação de '+e.element,test:'Vontade '+Math.min(20,base+attrs.pre),damage:'',description:descriptions[e.element]+' Esta ação não causa dano automático.'}
    ];
    return {
      id:overrideId||'bestiario_'+e.id+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),
      name:e.name,life:hp,maxLife:hp,
      resistance:'Defesa sugerida '+(9+tier*2),
      vulnerabilities:'Pistas e fraquezas a definir durante a investigação.',
      attrs,skills,
      presence:e.element==='Realidade'?'Sem efeito paranormal':'Vontade sugerida '+(3+tier*2)+' · efeito narrativo.',
      damage:e.element==='Realidade'?'':tier>=3?'1d4':'',
      actions,
      bestiary:{entryId:e.id,source:e.source,element:e.element,tier,unofficial:true}
    };
  }
  global.OLBestiary=Object.freeze({
    entries,
    sources:Object.freeze([...new Set(entries.map(e=>e.source))]),
    elements:Object.freeze([...new Set(entries.map(e=>e.element))]),
    tierName:n=>tierNames[n]||'',
    makeMonster
  });
})(window);
