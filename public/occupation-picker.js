(function setupOccupationPicker() {
  'use strict';

  // Resumos originais inspirados nas origens do Livro de Regras.
  // Curioso, Jornalista e Revoltado são opções adaptadas para Outro Lado.
  const occupationInfo = {
    Academico: {
      description: 'Você tem experiência com estudos, pesquisas e ensino. Acostumado a examinar teorias, documentos e evidências, costuma procurar explicações mesmo quando os acontecimentos parecem desafiar a lógica.',
      skills: 'Ciências e Investigação'
    },
    AgenteSaude: {
      description: 'Você trabalha ou já trabalhou cuidando da saúde de outras pessoas, seja em hospitais, consultórios, laboratórios ou situações de emergência. Sabe observar sinais de sofrimento e agir diante de uma crise.',
      skills: 'Intuição e Medicina'
    },
    Artista: {
      description: 'Sua vida gira em torno da expressão criativa: música, atuação, dança, escrita, artes visuais ou outras formas de arte. Você entende o poder de uma imagem, de uma história e das emoções que elas despertam.',
      skills: 'Artes e Enganação'
    },
    Atleta: {
      description: 'Você se dedicou a um esporte ou a uma atividade física competitiva. Treinos, disciplina e esforço desenvolveram seu preparo corporal e sua capacidade de reagir sob pressão.',
      skills: 'Acrobacia e Atletismo'
    },
    Chef: {
      description: 'Você tem prática no preparo de alimentos, profissionalmente ou por paixão. Conhece ingredientes, técnicas e rotinas exigentes, além de saber trabalhar em equipe quando cada segundo importa.',
      skills: 'Fortitude e Profissão'
    },
    Criminoso: {
      description: 'Você já viveu fora da lei, por necessidade, escolha ou influência de outras pessoas. Aprendeu a reconhecer riscos, escapar da atenção alheia e circular por ambientes que muitos evitam.',
      skills: 'Crime e Furtividade'
    },
    Curioso: {
      description: 'Você dificilmente aceita uma pergunta sem resposta. Boatos, lugares proibidos e situações estranhas despertam sua vontade de investigar, mesmo quando a escolha mais segura seria ir embora.',
      skills: 'Atualidades e Investigação',
      adapted: true
    },
    Desgarrado: {
      description: 'Sua história foi marcada pela falta de estabilidade, pelo isolamento ou pela necessidade de se virar sem ajuda. A experiência ensinou você a suportar dificuldades e encontrar maneiras de sobreviver.',
      skills: 'Fortitude e Sobrevivência'
    },
    Engenheiro: {
      description: 'Você entende como máquinas, estruturas e sistemas funcionam. Seja pela formação ou pela prática, prefere analisar problemas, improvisar soluções e consertar o que parece perdido.',
      skills: 'Profissão e Tecnologia'
    },
    Investigador: {
      description: 'Você tem experiência em descobrir fatos ocultos, conectar pistas e reconstituir acontecimentos. Pode ser um detetive, perito ou alguém acostumado a resolver casos e procurar a verdade.',
      skills: 'Investigação e Percepção'
    },
    Jornalista: {
      description: 'Você procura informações, entrevista pessoas e transforma descobertas em relatos. Sabe acompanhar notícias, questionar versões oficiais e seguir uma história até encontrar o que está sendo escondido.',
      skills: 'Atualidades e Investigação',
      adapted: true
    },
    Lutador: {
      description: 'Você treinou artes marciais ou outras formas de combate corpo a corpo. Essa vivência desenvolveu disciplina, consciência dos movimentos e reflexos úteis em situações perigosas.',
      skills: 'Luta e Reflexos'
    },
    Policial: {
      description: 'Você atuou na segurança pública ou recebeu treinamento semelhante. Aprendeu a observar comportamentos, lidar com ocorrências e tomar decisões em momentos de tensão.',
      skills: 'Pontaria e Percepção'
    },
    Religioso: {
      description: 'A fé e a espiritualidade têm um papel importante em sua vida. Você pode fazer parte de uma comunidade religiosa, orientar outras pessoas ou buscar respostas para experiências que parecem sobrenaturais.',
      skills: 'Religião'
    },
    Revoltado: {
      description: 'Uma injustiça, uma perda ou uma experiência difícil fez você desconfiar das regras impostas pelos outros. Independente e contestador, prefere agir do seu jeito e nem sempre revela o que pensa.',
      skills: 'Furtividade',
      adapted: true
    },
    TI: {
      description: 'Você se sente à vontade com computadores, redes, programas e dispositivos eletrônicos. Sabe pesquisar informações, entender problemas digitais e usar a tecnologia para seguir pistas.',
      skills: 'Investigação e Tecnologia'
    },
    Universitario: {
      description: 'Você frequenta ou frequentou o ensino superior e está habituado a estudar, pesquisar e trocar ideias. A vida acadêmica aproximou você de diferentes assuntos e métodos de investigação.',
      skills: 'Atualidades e Investigação'
    }
  };

  function initialize() {
    const select = document.getElementById('char_ocupacao');
    if (!select || select.dataset.occupationPickerReady === '1') return;
    select.dataset.occupationPickerReady = '1';

    const options = Array.from(select.options).filter(option => option.value && !/^ocultista$/i.test(option.value.trim()) && !/^ocultista$/i.test(option.textContent.trim()))
      .map(option => ({
        value: option.value,
        label: option.textContent.trim(),
        ...(occupationInfo[option.value] || {
          description: 'Uma experiência de vida que influencia como seu personagem age e investiga os mistérios ao redor.',
          skills: 'Conforme a ficha',
          adapted: true
        })
      }));

    const normalize = value => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    const styles = document.createElement('style');
    styles.textContent = `
      .ol-occupation-wrapper {
        position: relative; display: block; min-width: 0; width: 100%;
      }
      /* O select original permanece no DOM para a ficha salvar os dados,
         mas é substituído visualmente por um botão de verdade. */
      .ol-occupation-wrapper > select {
        position: absolute !important; width: 1px !important; height: 1px !important;
        padding: 0 !important; margin: 0 !important; border: 0 !important;
        opacity: 0 !important; pointer-events: none !important;
        clip-path: inset(50%) !important; overflow: hidden !important;
      }
      .ol-occupation-trigger {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        width: 100%; min-height: 60px; padding: 12px 16px;
        border: 1px solid #5b9cc5; border-radius: 10px;
        background: linear-gradient(125deg, #183b54, #0a1d2e);
        box-shadow: inset 0 0 0 1px rgba(139,204,246,.08);
        color: #eef8ff; cursor: pointer; text-align: left; font: inherit;
      }
      .ol-occupation-trigger:hover {
        border-color: #9bdaff; background: linear-gradient(125deg, #245679, #0e293f);
      }
      .ol-occupation-trigger:focus-visible {
        outline: 2px solid #8bccf6; outline-offset: 3px;
        box-shadow: 0 0 0 5px rgba(139,204,246,.15);
      }
      .ol-occupation-trigger-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .ol-occupation-trigger-label {
        display: block; font-size: .8rem; font-weight: 900;
        letter-spacing: .055em; text-transform: uppercase;
      }
      .ol-occupation-trigger-current {
        display: block; font-size: .78rem; line-height: 1.4;
        color: #a7cadf; overflow-wrap: anywhere;
      }
      .ol-occupation-trigger-arrow { flex: 0 0 auto; color: #8bccf6; font-size: 1.3rem; }
      .ol-occupation-trigger:disabled { cursor: not-allowed; opacity: .55; }
      .ol-occupation-overlay[hidden] { display: none !important; }
      .ol-occupation-overlay {
        position: fixed; inset: 0; z-index: 2147483000;
        display: flex; align-items: center; justify-content: center;
        padding: 16px; background: rgba(0,3,8,.88); backdrop-filter: blur(8px);
        color: #e7f1f7; font-family: Roboto, "Segoe UI", Arial, sans-serif;
      }
      .ol-occupation-modal {
        width: min(900px, 100%); max-height: min(90vh, 850px);
        display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid rgba(139,204,246,.48); border-radius: 17px;
        background: linear-gradient(155deg,#101d2b,#050b12 75%);
        box-shadow: 0 28px 90px rgba(0,0,0,.75), 0 0 40px rgba(57,174,232,.07);
      }
      .ol-occupation-modal * { box-sizing: border-box; }
      .ol-occupation-head {
        display: flex; align-items: start; justify-content: space-between;
        gap: 16px; padding: 23px 26px 14px;
        border-bottom: 1px solid rgba(139,204,246,.15);
      }
      .ol-occupation-eyebrow {
        margin: 0 0 7px; font-size: .7rem; font-weight: 800;
        text-transform: uppercase; letter-spacing: .18em; color: #8bccf6;
      }
      .ol-occupation-heading {
        margin: 0; font-size: clamp(1.4rem,3.5vw,1.85rem);
        line-height: 1.2; color: #fff; letter-spacing: -.02em;
      }
      .ol-occupation-subtitle { margin: 8px 0 0; color: #a4b7c5; font-size: .88rem; line-height: 1.45; }
      .ol-occupation-icon-button {
        flex: 0 0 38px; width: 38px; height: 38px; border: 1px solid #3a5162;
        border-radius: 9px; background: #101e2c; color: #dcecf7;
        font-size: 1.5rem; cursor: pointer;
      }
      .ol-occupation-body {
        min-height: 0; display: grid; grid-template-columns: minmax(210px, 0.85fr) minmax(0, 1.15fr);
      }
      .ol-occupation-browser {
        display: flex; min-height: 0; flex-direction: column; padding: 16px;
        border-right: 1px solid rgba(139,204,246,.15); background: rgba(0,0,0,.16);
      }
      .ol-occupation-search {
        width: 100%; min-height: 43px; padding: 10px 12px; margin-bottom: 12px;
        color: #fff; background: #070f17; border: 1px solid #3c586c;
        border-radius: 8px; font-size: 16px;
      }
      .ol-occupation-list { overflow-y: auto; min-height: 0; max-height: 420px; display: grid; align-content: start; gap: 6px; }
      .ol-occupation-item {
        width: 100%; padding: 11px 12px; display: flex; align-items: center; justify-content: space-between;
        gap: 10px; border: 1px solid transparent; border-radius: 9px;
        background: transparent; color: #d9e8f3; text-align: left; cursor: pointer;
        font-size: .9rem; line-height: 1.35;
      }
      .ol-occupation-item:hover { border-color: #46677c; background: rgba(139,204,246,.06); }
      .ol-occupation-item[aria-pressed="true"] {
        border-color: #6daed7; background: rgba(57,174,232,.16); color: #fff; font-weight: 700;
      }
      .ol-occupation-item small { color: #8bccf6; font-size: .67rem; flex-shrink: 0; }
      .ol-occupation-empty { color: #abbcc9; font-size: .86rem; padding: 14px 8px; }
      .ol-occupation-detail { padding: clamp(18px,3vw,29px); overflow-y: auto; }
      .ol-occupation-tag {
        display: inline-block; padding: 5px 9px; border: 1px solid rgba(139,204,246,.3);
        border-radius: 6px; background: rgba(139,204,246,.07); color: #8bccf6;
        font-size: .69rem; font-weight: 800; text-transform: uppercase; letter-spacing: .09em;
      }
      .ol-occupation-name { margin: 17px 0 13px; font-size: clamp(1.6rem,3.5vw,2.15rem); color: #fff; }
      .ol-occupation-description { margin: 0; color: #cedbe4; line-height: 1.75; font-size: .98rem; }
      .ol-occupation-skills {
        margin-top: 23px; padding: 14px 16px; border-radius: 10px;
        border: 1px solid rgba(139,204,246,.22); background: rgba(57,174,232,.055);
      }
      .ol-occupation-skills strong { display: block; margin-bottom: 6px; font-size: .72rem; color: #8bccf6; letter-spacing: .1em; text-transform: uppercase; }
      .ol-occupation-skills span { font-size: .9rem; color: #f0f6fa; }
      .ol-occupation-source { margin: 16px 0 0; color: #92a6b5; font-size: .78rem; line-height: 1.5; }
      .ol-occupation-footer {
        display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap;
        gap: 9px; padding: 15px 24px; border-top: 1px solid rgba(139,204,246,.15);
      }
      .ol-occupation-footer button { min-height: 43px; padding: 10px 17px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: .85rem; }
      .ol-occupation-cancel { border: 1px solid #53697b; background: transparent; color: #d7e6ef; }
      .ol-occupation-confirm { border: 1px solid #8bccf6; background: #2576a3; color: #fff; }
      .ol-occupation-confirm:hover { background: #318dbf; }
      .ol-occupation-confirm:disabled { cursor: not-allowed; opacity: .5; }
      .ol-occupation-modal :focus-visible { outline: 2px solid #8bccf6; outline-offset: 2px; }
      @media (max-width: 650px) {
        .ol-occupation-overlay { padding: 8px; }
        .ol-occupation-modal { max-height: 94vh; }
        .ol-occupation-head { padding: 17px 16px 12px; }
        .ol-occupation-body { grid-template-columns: minmax(0,1fr); overflow-y: auto; }
        .ol-occupation-browser { border-right: 0; border-bottom: 1px solid rgba(139,204,246,.15); padding: 12px; }
        .ol-occupation-list { max-height: 205px; }
        .ol-occupation-detail { padding: 16px; overflow: visible; }
        .ol-occupation-footer { padding: 12px; }
        .ol-occupation-footer button { flex: 1; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ol-occupation-overlay { backdrop-filter: none; }
      }
    `;
    document.head.appendChild(styles);

    const wrap = document.createElement('div');
    wrap.className = 'ol-occupation-wrapper';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'ol-occupation-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'ol-occupation-modal');
    trigger.innerHTML = '<span class="ol-occupation-trigger-text"><strong class="ol-occupation-trigger-label">Escolher ocupação</strong><span class="ol-occupation-trigger-current">Clique para ver as ocupações e suas descrições</span></span><span class="ol-occupation-trigger-arrow" aria-hidden="true">➜</span>';
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    wrap.appendChild(trigger);
    const buttonTitle = trigger.querySelector('.ol-occupation-trigger-label');
    const buttonCurrent = trigger.querySelector('.ol-occupation-trigger-current');
    function syncOccupationButton() {
      const chosen = options.find(option => option.value === select.value);
      buttonTitle.textContent = chosen ? 'Alterar ocupação' : 'Escolher ocupação';
      buttonCurrent.textContent = chosen ? chosen.label : 'Ver descrições e selecionar';
      trigger.setAttribute('aria-label', chosen
        ? 'Alterar ocupação atual: ' + chosen.label
        : 'Escolher ocupação e consultar sua descrição');
    }
    select.addEventListener('change', syncOccupationButton);
    syncOccupationButton();

    const overlay = document.createElement('div');
    overlay.className = 'ol-occupation-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="ol-occupation-modal" id="ol-occupation-modal" role="dialog" aria-modal="true" aria-labelledby="ol-occupation-heading" aria-describedby="ol-occupation-subtitle" tabindex="-1">
        <header class="ol-occupation-head">
          <div>
            <p class="ol-occupation-eyebrow">Outro Lado · Ficha de personagem</p>
            <h2 class="ol-occupation-heading" id="ol-occupation-heading">Escolha sua ocupação</h2>
            <p class="ol-occupation-subtitle" id="ol-occupation-subtitle">Descubra a história de cada ocupação antes de decidir.</p>
          </div>
          <button class="ol-occupation-icon-button" type="button" aria-label="Fechar seleção de ocupação" data-ol-occ-close>×</button>
        </header>
        <div class="ol-occupation-body">
          <div class="ol-occupation-browser">
            <input class="ol-occupation-search" type="search" placeholder="Buscar ocupação..." aria-label="Buscar ocupação" autocomplete="off">
            <div class="ol-occupation-list" aria-label="Ocupações disponíveis"></div>
          </div>
          <div class="ol-occupation-detail" aria-live="polite">
            <span class="ol-occupation-tag"></span>
            <h3 class="ol-occupation-name"></h3>
            <p class="ol-occupation-description"></p>
            <div class="ol-occupation-skills">
              <strong>Perícias aplicadas na ficha</strong>
              <span class="ol-occupation-skills-value"></span>
            </div>
            <p class="ol-occupation-source"></p>
          </div>
        </div>
        <footer class="ol-occupation-footer">
          <button class="ol-occupation-cancel" type="button" data-ol-occ-close>Cancelar</button>
          <button class="ol-occupation-confirm" type="button">Confirmar ocupação</button>
        </footer>
      </section>
    `;
    document.body.appendChild(overlay);

    const modal = overlay.querySelector('.ol-occupation-modal');
    const search = overlay.querySelector('.ol-occupation-search');
    const list = overlay.querySelector('.ol-occupation-list');
    const title = overlay.querySelector('.ol-occupation-name');
    const desc = overlay.querySelector('.ol-occupation-description');
    const badge = overlay.querySelector('.ol-occupation-tag');
    const skills = overlay.querySelector('.ol-occupation-skills-value');
    const source = overlay.querySelector('.ol-occupation-source');
    const confirm = overlay.querySelector('.ol-occupation-confirm');
    let highlighted = '';
    let previousFocus = null;
    let previousBodyOverflow = '';

    function renderDetails() {
      const chosen = options.find(option => option.value === highlighted);
      confirm.disabled = !chosen;
      title.textContent = chosen ? chosen.label : 'Selecione uma ocupação';
      desc.textContent = chosen ? chosen.description : 'Escolha uma opção da lista para ler sua descrição.';
      skills.textContent = chosen ? chosen.skills : '—';
      badge.textContent = chosen && chosen.adapted ? 'Adaptação · Outro Lado' : 'Origem do Livro de Regras';
      source.textContent = chosen && chosen.adapted
        ? 'Esta ocupação foi adaptada para a campanha Outro Lado e não faz parte das origens do livro básico.'
        : 'Descrição resumida em palavras próprias, inspirada na origem correspondente de Ordem Paranormal RPG.';
      for (const button of list.querySelectorAll('button[data-occupation]')) {
        button.setAttribute('aria-pressed', button.dataset.occupation === highlighted ? 'true' : 'false');
      }
    }

    function renderList() {
      list.textContent = '';
      const query = normalize(search.value.trim());
      const filtered = options.filter(option => normalize(option.label).includes(query) || normalize(option.description).includes(query));
      if (filtered.length && !filtered.some(option => option.value === highlighted)) highlighted = filtered[0].value;
      if (!filtered.length) highlighted = '';

      for (const option of filtered) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ol-occupation-item';
        button.dataset.occupation = option.value;
        const text = document.createElement('span');
        text.textContent = option.label;
        button.appendChild(text);
        if (option.value === select.value) {
          const current = document.createElement('small');
          current.textContent = 'ATUAL';
          button.appendChild(current);
        }
        button.addEventListener('click', () => {
          highlighted = option.value;
          renderDetails();
        });
        list.appendChild(button);
      }
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'ol-occupation-empty';
        empty.textContent = 'Nenhuma ocupação encontrada.';
        list.appendChild(empty);
      }
      renderDetails();
    }

    function open() {
      if (!overlay.hidden) return;
      previousFocus = document.activeElement;
      previousBodyOverflow = document.body.style.overflow;
      highlighted = options.some(option => option.value === select.value) ? select.value : (options[0] && options[0].value || '');
      search.value = '';
      renderList();
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      trigger.setAttribute('aria-expanded', 'true');
      search.focus();
    }

    function close() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.body.style.overflow = previousBodyOverflow;
      trigger.setAttribute('aria-expanded', 'false');
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      else trigger.focus();
    }

    trigger.addEventListener('click', open);
    trigger.setAttribute('aria-expanded', 'false');
    const label = document.querySelector('label[for="char_ocupacao"]');
    if (label) label.addEventListener('click', event => { event.preventDefault(); open(); });
    overlay.querySelectorAll('[data-ol-occ-close]').forEach(button => button.addEventListener('click', close));
    overlay.addEventListener('mousedown', event => { if (event.target === overlay) close(); });
    search.addEventListener('input', renderList);
    confirm.addEventListener('click', () => {
      if (!highlighted) return;
      if (select.value !== highlighted) {
        select.value = highlighted;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      syncOccupationButton();
      close();
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key !== 'Tab') return;
      const focusable = [...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node => node.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); modal.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
