(function balanceRitualDiceInPublishedSheet() {
  'use strict';
  if (window.__olRitualBalanceRuntime) return;
  window.__olRitualBalanceRuntime = true;

  // A ficha atualizada tem o balanceamento nativo. Evita duplicar a lógica.
  if (typeof balanceRitualDiceText === 'function') return;

  const steps = [4, 6, 8, 10, 12, 20];
  const rebalance = value => typeof value === 'string'
    ? value.replace(/(?<![\p{L}\p{N}_])(\d+)\s*d\s*(\d+)(?!\d)/giu, (formula, count) => {
        const amount = Number(count);
        return Number.isSafeInteger(amount) && amount > 1
          ? '1d' + steps[Math.min(amount, steps.length) - 1]
          : formula;
      })
    : value;

  function rebalanceCatalog() {
    if (typeof RITUAL_CATALOG === 'undefined' || !Array.isArray(RITUAL_CATALOG)) return;
    for (const ritual of RITUAL_CATALOG) {
      for (const field of ['desc', 'discente', 'verdadeiro']) {
        if (typeof ritual[field] === 'string') ritual[field] = rebalance(ritual[field]);
      }
    }
  }

  function rebalanceKnownRituals() {
    for (const hidden of document.querySelectorAll('.hidden-ritual')) {
      for (const name of ['desc-geral', 'desc-disc', 'desc-verd']) {
        const value = hidden.getAttribute('data-' + name);
        if (value !== null) {
          const changed = rebalance(value);
          if (changed !== value) hidden.setAttribute('data-' + name, changed);
        }
      }
      const id = hidden.id.replace('rit-data-', '');
      const details = document.getElementById('rit-html-' + id);
      if (details) {
        const before = details.innerHTML;
        const after = rebalance(before);
        if (before !== after) details.innerHTML = after;
      }
    }
  }

  function install() {
    rebalanceCatalog();
    if (typeof window.addRitual === 'function' && !window.addRitual.__olBalanceWrapped) {
      const original = window.addRitual;
      const wrapped = function(...args) {
        for (const index of [2, 9, 10, 11]) args[index] = rebalance(args[index]);
        return original.apply(this, args);
      };
      wrapped.__olBalanceWrapped = true;
      window.addRitual = wrapped;
    }
    rebalanceKnownRituals();

    const host = document.getElementById('rituals-body');
    if (host) {
      let scheduled = false;
      const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          rebalanceKnownRituals();
        });
      });
      observer.observe(host, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();