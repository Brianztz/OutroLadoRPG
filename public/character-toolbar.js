(function styleCharacterToolbar() {
  'use strict';
  if (window.__outroLadoCompactToolbarLoaded) return;
  window.__outroLadoCompactToolbarLoaded = true;

  const css = `
    /* Barra de acoes do personagem: visual compacto sem trocar eventos originais. */
    .ol-toolbar-group {
      display: flex !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      gap: 7px !important;
      width: auto !important;
      max-width: 100%;
    }
    .ol-toolbar-action,
    .ol-toolbar-table {
      box-sizing: border-box !important;
      min-height: 35px !important;
      height: auto !important;
      width: auto !important;
      max-width: 100%;
      padding: 7px 12px !important;
      margin: 0 !important;
      display: inline-flex !important;
      justify-content: center !important;
      align-items: center !important;
      gap: 6px !important;
      border-radius: 9px !important;
      font-family: "Segoe UI", system-ui, sans-serif !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      line-height: 1.35 !important;
      letter-spacing: .012em !important;
      white-space: nowrap !important;
      text-decoration: none !important;
      text-transform: none !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.035) !important;
      transition: border-color .18s ease, background-color .18s ease,
        box-shadow .18s ease, transform .18s ease !important;
    }
    .ol-toolbar-action {
      background: #101a27 !important;
      border: 1px solid #364e63 !important;
      color: #eaf2f9 !important;
      cursor: pointer !important;
    }
    .ol-toolbar-action:hover:not(:disabled) {
      background: #1b3044 !important;
      border-color: #6cbbea !important;
      box-shadow: 0 0 0 2px rgba(57,174,232,.1) !important;
      transform: translateY(-1px);
    }
    .ol-toolbar-action:active:not(:disabled) { transform: translateY(0); }
    .ol-toolbar-action:focus-visible {
      outline: 2px solid #91d9ff !important;
      outline-offset: 3px !important;
    }
    .ol-toolbar-action:disabled { opacity: .52 !important; cursor: not-allowed !important; }
    .ol-toolbar-table {
      background: rgba(12, 32, 48, .86) !important;
      border: 1px solid rgba(88, 176, 232, .6) !important;
      color: #aedfff !important;
      font-size: 11.5px !important;
      letter-spacing: .03em !important;
      user-select: text;
    }
    .ol-toolbar-action[data-ol-action="combat"] {
      background: #112333 !important;
      border-color: #4d84a4 !important;
      color: #d6ecfa !important;
    }
    .ol-toolbar-action[data-ol-action="save"] {
      background: #2797d0 !important;
      border-color: #55c2f2 !important;
      color: #031522 !important;
      font-weight: 800 !important;
    }
    .ol-toolbar-action[data-ol-action="save"]:hover:not(:disabled) {
      background: #65c8f5 !important;
      border-color: #9cddff !important;
    }
    .ol-toolbar-action[data-ol-action="reset"] {
      background: rgba(92,19,35,.22) !important;
      border-color: rgba(242,85,105,.48) !important;
      color: #ff9eab !important;
    }
    .ol-toolbar-action[data-ol-action="reset"]:hover:not(:disabled) {
      background: rgba(132,26,46,.35) !important;
      border-color: #ff8293 !important;
    }
    @media (max-width: 640px) {
      .ol-toolbar-group { gap: 6px !important; }
      .ol-toolbar-action, .ol-toolbar-table {
        min-height: 34px !important;
        padding: 7px 10px !important;
        font-size: 11px !important;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ol-toolbar-action { transition: none !important; transform: none !important; }
    }
  `;

  const style = document.createElement('style');
  style.id = 'ol-compact-toolbar-style';
  style.textContent = css;
  document.head.appendChild(style);

  const normalize = value => String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();

  function classify(element) {
    const txt = normalize(element instanceof HTMLInputElement ? element.value : element.textContent);
    if (!txt || txt.length > 80) return '';
    if (txt.includes('zerar ficha')) return 'reset';
    if (txt.includes('salvar') && txt.includes('exportar')) return 'save';
    if (txt.includes('modo de combate') || txt.includes('modo combate')) return 'combat';
    if (/^(?:[\p{Extended_Pictographic}\s\ufe0f\u200d]*\s*)?importar\s*$/u.test(txt) ||
        (txt.includes('importar') && txt.length < 17)) return 'import';
    return '';
  }

  function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let node = nodes[0].parentElement;
    while (node && !nodes.every(item => node.contains(item))) node = node.parentElement;
    return node;
  }

  function apply() {
    const controls = [...document.querySelectorAll('button, [role="button"], input[type="button"], a')]
      .filter(node => !node.closest('.ol-occupation-overlay'));
    const seen = new Map();
    for (const node of controls) {
      const type = classify(node);
      if (type && !seen.has(type)) seen.set(type, node);
    }
    for (const [type, node] of seen) {
      node.classList.add('ol-toolbar-action');
      node.dataset.olAction = type;
    }

    // Identifica a etiqueta da mesa sem confundi-la com o cabeçalho inteiro.
    const labels = [...document.querySelectorAll('span, strong, label, div, button')];
    const label = labels.find(node => {
      if (node.closest('.ol-occupation-overlay') || node.querySelector('button, input, a')) return false;
      const txt = normalize(node.textContent);
      return /^mesa\s*:\s*[^\s]/.test(txt) && txt.length <= 55;
    });
    if (label) label.classList.add('ol-toolbar-table');

    if (seen.size >= 3) {
      const ancestor = commonAncestor([...seen.values()]);
      // Nao altera layouts maiores (cabecalho inteiro, ficha ou outras abas).
      if (ancestor && ancestor !== document.body && ancestor !== document.documentElement
          && ancestor.querySelectorAll('button, a, input').length <= 10
          && ancestor.children.length <= 12
          && ancestor.getBoundingClientRect().height <= 120) {
        ancestor.classList.add('ol-toolbar-group');
      }
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => { scheduled = false; apply(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else schedule();
  window.addEventListener('load', schedule, { once: true });
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.setTimeout(schedule, 400);
  window.setTimeout(schedule, 1800);
})();