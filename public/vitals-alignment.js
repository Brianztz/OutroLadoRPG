(function alignVitalPanels() {
  'use strict';
  if (window.__olVitalsAlignmentInitialized) return;
  window.__olVitalsAlignmentInitialized = true;

  // Alinha a linha - | valor atual / máximo | + de VIDA e SANIDADE.
  // O botão de dados ao lado de SANIDADE aumenta a altura do cabeçalho
  // original. Deslocamos apenas o conteúdo do painel que ficou acima,
  // sem modificar os valores, os botões ou a lógica da ficha.
  const STATS = ['vida', 'sanidade'];
  const offsets = new WeakMap();
  let frame = 0;

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isControl(element, sign) {
    if (!element || !isVisible(element)) return false;
    if (element.matches('button:disabled')) return false;
    const label = normalize(
      element instanceof HTMLInputElement ? element.value : element.textContent
    );
    const aria = normalize(element.getAttribute('aria-label'));
    if (sign === 'minus') {
      return ['-', '−', '–', '－'].includes(label)
        || /^(diminuir|reduzir)\b/.test(aria);
    }
    return ['+', '＋'].includes(label) || /^(aumentar|adicionar)\b/.test(aria);
  }

  function findHeading(name) {
    const candidates = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,span,strong,div,p,label')];
    return candidates.find(element => {
      if (!isVisible(element)) return false;
      if (normalize(element.textContent) !== name) return false;
      // Evita escolher um bloco contendo outro título igual.
      if ([...element.children].some(child => normalize(child.textContent) === name)) return false;
      return true;
    }) || null;
  }

  function findPanel(name) {
    const heading = findHeading(name);
    if (!heading) return null;
    let ancestor = heading.parentElement;
    while (ancestor && ancestor !== document.body) {
      const rect = ancestor.getBoundingClientRect();
      if (rect.width >= 190 && rect.height >= 65 && rect.height <= 280) {
        const controls = [...ancestor.querySelectorAll('button,[role="button"],input[type="button"]')];
        const minus = controls.find(node => isControl(node, 'minus'));
        const plus = controls.find(node => isControl(node, 'plus'));
        if (minus && plus) return { element: ancestor, heading, minus, plus };
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  function clearOffset(panel) {
    const previous = offsets.get(panel.element);
    if (!previous) return;
    for (const child of previous.children) {
      if (child.isConnected) child.style.removeProperty('translate');
    }
    offsets.delete(panel.element);
  }

  function applyOffset(panel, amount) {
    clearOffset(panel);
    if (amount < 1) return;
    const children = [...panel.element.children].filter(child => {
      if (!isVisible(child)) return false;
      const position = getComputedStyle(child).position;
      return position !== 'absolute' && position !== 'fixed';
    });
    if (!children.length) return;
    for (const child of children) {
      child.style.setProperty('translate', '0 ' + amount + 'px', 'important');
    }
    offsets.set(panel.element, { value: amount, children });
  }

  function align() {
    frame = 0;
    const panels = STATS.map(findPanel);
    if (panels.some(panel => !panel)) return;
    const [life, sanity] = panels;
    if (life.element === sanity.element) return;
    // Não alinhar quando a ficha é exibida em uma coluna no celular.
    const boundsA = life.element.getBoundingClientRect();
    const boundsB = sanity.element.getBoundingClientRect();
    if (Math.abs(boundsA.top - boundsB.top) > 14 || Math.abs(boundsA.width - boundsB.width) > 110) {
      panels.forEach(clearOffset);
      return;
    }

    // Os botões de - e + pertencem à mesma linha horizontal da barra.
    // A diferença de 5 a 10 px costuma vir da presença do dado em SANIDADE.
    const firstTop = Math.min(
      life.minus.getBoundingClientRect().top - (offsets.get(life.element)?.value || 0),
      life.plus.getBoundingClientRect().top - (offsets.get(life.element)?.value || 0)
    );
    const secondTop = Math.min(
      sanity.minus.getBoundingClientRect().top - (offsets.get(sanity.element)?.value || 0),
      sanity.plus.getBoundingClientRect().top - (offsets.get(sanity.element)?.value || 0)
    );
    const difference = Math.round(secondTop - firstTop);
    // Um desnível muito grande indica outro layout, não este problema.
    if (Math.abs(difference) > 18) {
      panels.forEach(clearOffset);
      return;
    }
    if (difference > 0) {
      applyOffset(life, difference);
      clearOffset(sanity);
    } else if (difference < 0) {
      applyOffset(sanity, -difference);
      clearOffset(life);
    } else {
      panels.forEach(clearOffset);
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(align);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else schedule();
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(schedule, 350);
  setTimeout(schedule, 1300);
})();