/* Bestiário do Exílio 3.0 — Livro Básico de Regras,
   Capítulo 10 (pp. 32–42), edição de 13/11/2026.
   30 criaturas oficiais do livro, sem fichas inventadas.
   Estatísticas sugeridas nessa edição são mantidas literalmente.
   Este arquivo NÃO altera monstros já salvos na mesa. */
(function(global){
  'use strict';
  const source='Exílio 3.0 · Livro Básico · Capítulo 10';
  const matrices=Object.freeze(['Medo','Lembrança','Carne','Ruptura','Eco','Vazio']);
  // nome, Matriz, NA, PV, RD, PM, bônus de ataque, dano, natureza do dano,
  // habilidade e fraqueza — transcritos da edição do Livro Básico.
  const rows=[
    ['O Rastejante','Medo',1,16,0,null,3,'1d6+1','cortante','+2 Discrição em sombras quando tiver cobertura.','Luz forte impede seu bônus furtivo.'],
    ['O Sussurrante','Medo',1,14,0,null,3,'1d4','paranormal','Amedrontado, ataque mental +3.','Gravação reproduzida revela sua posição.'],
    ['A Mulher sem Rosto','Medo',2,28,1,null,5,'1d8+2','cortante','Margem de acerto ≥5 aplica Confuso.','Espelho com seu verdadeiro reflexo a desorienta.'],
    ['O Caçador do Escuro','Medo',3,48,2,null,7,'1d10+3','cortante','+2 atacar alvos Amedrontados.','Iluminação reduz sua vantagem de perseguição.'],
    ['O Pavor Primordial','Medo',5,115,4,null,10,'2d8+4','impacto','Pode aplicar Apavorado com ataque mental +10.','Destruir símbolos que sustentam a manifestação.'],
    ['O Repetidor','Lembrança',1,12,0,null,2,'1d6','paranormal','Repete a última frase ouvida.','Identificar a sequência repetida revela padrão.'],
    ['A Criança Esquecida','Lembrança',2,24,0,20,5,'1d4','PM','Imita vozes familiares.','Seu nome verdadeiro rompe o disfarce.'],
    ['A Mulher do Retrato','Lembrança',2,30,1,20,5,'1d8+2','impacto','Pode impor Confuso com ataque mental +5.','Sua pintura original sustenta manifestação.'],
    ['O Colecionador de Rostos','Lembrança',4,70,2,28,8,'2d6','paranormal','Imita aparência de vítima observada.','Registros contraditórios revelam forma real.'],
    ['O Arquivista Morto','Lembrança',5,105,3,32,11,'2d6','PM','Cria duplicata ilusória por 3 rodadas.','Seus registros originais são âncoras.'],
    ['O Retorcido','Carne',1,18,0,null,3,'1d8+1','impacto','Margem ≥5 pode aplicar Caído.','Espaços estreitos limitam seus membros.'],
    ['O Costurado','Carne',2,32,1,null,5,'1d8+2','impacto','Regenera 2 PV/turno enquanto âncora existir.','Suturas mantêm sua forma e regeneração.'],
    ['O Esfolado','Carne',3,44,2,null,7,'1d10+3','cortante','Margem ≥5 aplica Sangramento.','Dano paranormal reduz sua RD em 1 até próximo turno.'],
    ['A Massa Faminta','Carne',4,80,3,null,9,'2d6+4','perfurante','Pode trocar dano por tentativa de Imobilizar.','Passagens estreitas impedem seu avanço.'],
    ['O Coração Exposto','Carne',5,125,4,null,11,'2d8+5','impacto','Regenera 1d6 PV/turno com núcleo protegido.','Expor e romper núcleo interrompe regeneração.'],
    ['O Dobrador','Ruptura',1,15,0,null,3,'1d6','paranormal','Ignora cobertura parcial comum.','Seus movimentos seguem padrões geométricos.'],
    ['A Fenda Viva','Ruptura',2,26,1,null,5,'1d8','paranormal','Move-se 3m por teleporte como movimento.','Só reaparece em superfícies amplas.'],
    ['O Homem Invertido','Ruptura',3,50,2,null,7,'1d10+3','impacto','Pode aplicar Desorientado com margem ≥5.','A sombra denuncia a posição verdadeira.'],
    ['O Labirinto Andante','Ruptura',4,78,3,null,9,'2d6+3','impacto','Forma parede 3m por 2 rodadas.','Depende de âncoras espaciais.'],
    ['A Geometria Impossível','Ruptura',5,120,4,null,11,'3d8','paranormal','Empurra alvo até 6m após resistência vencida.','Interromper 3 âncoras cancela movimento especial.'],
    ['O Estalador','Eco',1,13,0,null,3,'1d6+1','impacto','Margem ≥5 aplica Atordoado.','Ataque forte precedido de 3 estalos.'],
    ['A Voz que Volta','Eco',2,25,0,null,5,'1d8','paranormal','Pode impor Surdo por 1 rodada.','Depende do som original reproduzido.'],
    ['O Duplicado','Eco',3,42,1,null,7,'1d10+2','impacto','+2 ataque depois de observar a ação da vítima.','Padrão repetitivo pode ser antecipado.'],
    ['O Sino Vivo','Eco',4,75,2,null,9,'2d8','paranormal','Pode atingir 2 alvos próximos em 1 ação.','Silêncio entre badaladas abre janela de ataque.'],
    ['A Última Frequência','Eco',5,110,3,null,11,'2d10','paranormal','Confuso em raio de 3m com resistência mental.','Localizar e interromper origem ressonante.'],
    ['O Apagado','Vazio',1,17,0,null,3,'1d6','paranormal','Apaga memória recente de sua presença.','Registros materiais revelam presença.'],
    ['O Sem-Nome','Vazio',2,30,1,20,5,'1d4','PM','Pode aplicar Perturbado.','Antiga identidade expõe sua presença.'],
    ['O Devorador de Luz','Vazio',3,52,2,24,7,'1d10+3','cortante','Apaga luz comum a 6m por 1 rodada.','Fontes simultâneas de luz o enfraquecem.'],
    ['O Observador Vazio','Vazio',4,72,2,24,6,'1d8+2','impacto','Ataques mentais +8: Confuso por 4PM ou perda 1d8 PM por 5PM.','Resistir efeito mental impõe −2 próxima Anomalias.'],
    ['A Ausência Absoluta','Vazio',5,130,4,32,11,'2d10','paranormal','Anula bônus ritualístico durante 1 rodada.','Interromper âncora de sustentação.']
  ];
  const baseAttrs={
    1:[1,2,1,0,0,0],2:[2,2,2,0,1,0],3:[3,2,3,1,2,0],
    4:[4,3,3,1,3,0],5:[5,3,4,1,4,0]
  };
  const baseDomains={
    1:[2,2,0,2],2:[3,2,2,2],3:[4,2,2,2],
    4:[5,2,2,4],5:[6,2,2,4]
  };
  function attributes(name,na){
    const raw=[...baseAttrs[na]];
    if(name==='O Esfolado')raw[4]=1;
    if(name==='O Observador Vazio')return {potencia:2,destreza:2,constituicao:3,raciocinio:1,consciencia:4,expressao:0};
    const [potencia,destreza,constituicao,raciocinio,consciencia,expressao]=raw;
    return {potencia,destreza,constituicao,raciocinio,consciencia,expressao};
  }
  function domains(name,na){
    const raw=[...baseDomains[na]];
    if(name==='O Repetidor')raw[0]=1;
    if(name==='O Pavor Primordial')raw[0]=5;
    if(name==='O Colecionador de Rostos'||name==='O Observador Vazio')raw[0]=4;
    return {'CONFRONTO':raw[0],'MOBILIDADE':raw[1],'RESISTÊNCIA':raw[2],'ANOMALIAS':raw[3]};
  }
  const exposure=na=>na===1
    ? {level:'Leve',dt:11,pm:'1d4'}
    : na<=3 ? {level:'Moderada',dt:16,pm:'1d6'}
      : {level:'Extrema',dt:21,pm:'2d6'};
  const entries=rows.map((raw,index)=>{
    const [name,matrix,na,pv,rd,pm,attackBonus,damage,damageType,ability,weakness]=raw;
    const item={
      id:'exilio-'+String(index+1).padStart(2,'0'),
      order:index+1,name,matrix,element:matrix,na,tier:na,
      pv,rd,pm,movement:6,attackBonus,attack:'2d10 + '+attackBonus,
      damage,damageType,ability,weakness,
      attrs:attributes(name,na),domains:domains(name,na),
      exposure:exposure(na),source
    };
    return Object.freeze(item);
  });
  const tiers=Object.freeze({
    1:'Perturbação',2:'Manifestação',3:'Aberração',4:'Horror',5:'Entidade'
  });
  function makeMonster(entryId,overrideId){
    const e=entries.find(item=>item.id===entryId);
    if(!e)return null;
    const id=overrideId || 'exilio_book_'+e.order+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
    const attackDescription='Dano '+e.damageType+(e.damageType==='PM'?' (reduz Pontos Mentais, não PV)':'')+'. Alcance corpo a corpo 2m.';
    return {
      id,name:e.name,
      life:e.pv,maxLife:e.pv,
      mental:e.pm||0,maxMental:e.pm||0,
      matrix:e.matrix,secondaryMatrix:'',ip:0,
      move:e.movement,defense:0,
      resistance:'RD '+e.rd,
      vulnerabilities:e.weakness,
      attrs:{...e.attrs},
      skills:{...e.domains},
      presence:'Exposição '+e.exposure.level+' · DT'+e.exposure.dt+' · '+e.exposure.pm+' PM',
      damage:'',
      actions:[
        {id:id+'_attack',name:'Ataque',test:'Ataque +'+e.attackBonus,
          damage:e.damage,description:attackDescription,multiplier:1},
        {id:id+'_ability',name:'Habilidade',test:'',damage:'',
          description:e.ability,multiplier:1}
      ],
      bestiary:{
        entryId:e.id,source,book:true,na:e.na,rd:e.rd,
        exposure:{...e.exposure},attack:e.attack,damageType:e.damageType
      }
    };
  }
  global.OLBestiary=Object.freeze({
    entries:Object.freeze(entries),matrices,elements:matrices,
    tiers,sources:Object.freeze([source]),
    tierName:na=>'NA '+na+' · '+(tiers[na]||''),
    makeMonster
  });
})(window);
