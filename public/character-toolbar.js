(function styleCharacterToolbar() {
  'use strict';
  if (window.__outroLadoCompactToolbarLoaded) return;
  window.__outroLadoCompactToolbarLoaded = true;

  const css = `
    /* Primeira temporada: controles leves, sem efeitos decorativos. */
    .ol-toolbar-group {
      display: flex !important; align-items: center !important;
      flex-wrap: wrap !important; gap: 6px !important;
      width: auto !important; max-width: 100%;
    }
    .ol-toolbar-action, .ol-toolbar-table {
      box-sizing: border-box !important;
      display: inline-flex !important; align-items: center !important;
      justify-content: center !important; gap: 5px !important;
      width: auto !important; max-width: 100%;
      height: auto !important; min-height: 32px !important;
      margin: 0 !important; padding: 6px 10px !important;
      border: 1px solid rgba(157,189,210,.23) !important;
      border-radius: 6px !important;
      background: rgba(10,22,33,.70) !important;
      color: #d3e0e9 !important;
      font: 600 11.5px/1.3 "Segoe UI", system-ui, sans-serif !important;
      letter-spacing: .01em !important;
      white-space: nowrap !important;
      text-transform: none !important; text-decoration: none !important;
      text-shadow: none !important; box-shadow: none !important;
      filter: none !important; transform: none !important;
      transition: background-color .16s ease, border-color .16s ease, color .16s ease !important;
    }
    .ol-toolbar-action { cursor: pointer !important; }
    .ol-toolbar-action:hover:not(:disabled) {
      background: rgba(32,57,74,.85) !important;
      border-color: rgba(139,204,246,.55) !important;
      color: #f2f8fc !important;
      box-shadow: none !important; transform: none !important;
    }
    .ol-toolbar-action:active:not(:disabled) {
      background: rgba(27,47,63,.95) !important;
    }
    .ol-toolbar-action:focus-visible {
      outline: 2px solid #8bccf6 !important; outline-offset: 2px !important;
    }
    .ol-toolbar-action:disabled {
      opacity: .48 !important; cursor: not-allowed !important;
    }
    .ol-toolbar-table {
      min-height: 30px !important;
      color: #a6bac9 !important;
      border-color: rgba(157,189,210,.16) !important;
      background: rgba(8,18,28,.45) !important;
      font-size: 11px !important;
      user-select: text;
    }
    .ol-toolbar-action[data-ol-action="combat"] {
      color: #c4dbea !important;
    }
    .ol-toolbar-action[data-ol-action="save"] {
      color: #9ed5f4 !important;
      border-color: rgba(117,190,232,.42) !important;
      background: rgba(16,48,67,.48) !important;
      font-weight: 650 !important;
    }
    .ol-toolbar-action[data-ol-action="save"]:hover:not(:disabled) {
      color: #e6f5ff !important;
      background: rgba(33,81,110,.55) !important;
      border-color: rgba(139,204,246,.68) !important;
    }
    .ol-toolbar-action[data-ol-action="reset"] {
      color: #d6a0a9 !important;
      border-color: rgba(208,122,137,.32) !important;
      background: rgba(61,23,32,.24) !important;
    }
    .ol-toolbar-action[data-ol-action="reset"]:hover:not(:disabled) {
      color: #f4c1c8 !important;
      background: rgba(89,36,47,.43) !important;
      border-color: rgba(229,146,157,.58) !important;
    }
    @media (max-width: 640px) {
      .ol-toolbar-group { gap: 5px !important; }
      .ol-toolbar-action, .ol-toolbar-table {
        min-height: 32px !important; padding: 6px 9px !important;
        font-size: 11px !important;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ol-toolbar-action { transition: none !important; }
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