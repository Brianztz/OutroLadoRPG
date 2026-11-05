/* Outro Lado — layout móvel da ficha da temporada.
 * Os controles originais são movidos, não duplicados: continuam com os mesmos
 * eventos, salvamento local, Firebase e sincronização com mestre/overlay.
 */
(function initSeasonMobile(){
  'use strict';
  const root=document.getElementById('mobile-sheet');
  if(!root||!window.matchMedia)return;
  const media=window.matchMedia('(max-width: 767px)');
  const byId=id=>document.getElementById(id);
  const originals=new Map();
  const labels={forca:'FORÇA',agilidade:'AGILIDADE',vigor:'VIGOR',intelecto:'INTELECTO',presenca:'PRESENÇA'};
  let active=false,lastAvatar=null;

  function move(node,target){
    if(!node||!target)return;
    if(!originals.has(node)){
      const mark=document.createComment('posição original de '+(node.id||'controle'));
      node.parentNode.insertBefore(mark,node);
      originals.set(node,mark);
    }
    target.appendChild(node);
  }
  function sendDecrease(node){
    node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
  }
  function refreshAvatar(){
    if(!active)return;
    const value=window.SeasonPortrait?.avatar?.()||'';
    if(value===lastAvatar)return;
    lastAvatar=value;
    const img=byId('mobile-avatar-img'),placeholder=byId('mobile-avatar-placeholder');
    if(value){img.src=value;img.hidden=false;placeholder.hidden=true;}
    else{img.removeAttribute('src');img.hidden=true;placeholder.hidden=false;}
  }
  function mount(){
    if(active)return;
    active=true;
    move(byId('char-nex'),byId('mobile-nex-mount'));
    move(byId('char-level'),byId('mobile-level-mount'));
    move(byId('char-name'),byId('mobile-name-mount'));
    move(byId('char-origin'),byId('mobile-origin-mount'));
    move(byId('char-occupation'),byId('mobile-occupation-mount'));
    const attrMount=byId('mobile-attrs-mount');
    attrMount.replaceChildren();
    for(const [id,title] of Object.entries(labels)){
      const node=document.querySelector('.attr[data-attr="'+id+'"]');
      if(!node)continue;
      const row=document.createElement('div');
      row.className='mobile-attr-row';row.dataset.mobileAttr=id;
      const label=document.createElement('span');
      label.className='mobile-attr-label';label.textContent=title;
      const minus=document.createElement('button');
      minus.type='button';minus.className='mobile-attr-minus';minus.textContent='−';
      minus.setAttribute('aria-label','Diminuir '+title);
      minus.title='Diminuir '+title;
      minus.addEventListener('click',()=>sendDecrease(node));
      row.append(label,minus);
      attrMount.append(row);
      move(node,row);
    }
    move(byId('skill-edge-toolbar'),byId('mobile-edges-mount'));
    move(byId('sheet-skills-grid'),byId('mobile-skills-mount'));
    move(byId('combat-area'),byId('mobile-combat-mount'));
    const resources=byId('mobile-resources-mount');
    move(document.querySelector('.resource-widget[aria-label="Vida"]'),resources);
    move(document.querySelector('.resource-widget[aria-label="Sanidade"]'),resources);
    root.hidden=false;
    document.body.classList.add('is-mobile-season');
    lastAvatar=null;refreshAvatar();
  }
  function unmount(){
    if(!active)return;
    document.body.classList.remove('is-mobile-season');
    for(const [node,mark] of originals){
      if(mark.parentNode)mark.parentNode.insertBefore(node,mark);
    }
    root.hidden=true;
    active=false;
  }
  function updateLayout(){if(media.matches)mount();else unmount();}
  byId('mobile-level-plus').addEventListener('click',()=>byId('char-level').click());
  byId('mobile-level-minus').addEventListener('click',()=>sendDecrease(byId('char-level')));
  byId('mobile-avatar-button').addEventListener('click',()=>byId('portrait-file').click());
  window.addEventListener('season:change',refreshAvatar);
  window.addEventListener('season:portrait-ready',refreshAvatar);
  if(typeof media.addEventListener==='function')media.addEventListener('change',updateLayout);
  else if(typeof media.addListener==='function')media.addListener(updateLayout);
  window.addEventListener('resize',updateLayout);
  updateLayout();
})();
