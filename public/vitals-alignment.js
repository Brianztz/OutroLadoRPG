(function fixVitalBarsAlignment() {
  'use strict';
  if (document.getElementById('ol-vitals-align-style')) return;

  // A ação de rolar Sanidade possui um botão de 27px no título,
  // fazendo o campo de Sanidade começar mais abaixo que Vida.
  // Ambos os cabeçalhos agora ocupam a mesma altura.
  const style = document.createElement('style');
  style.id = 'ol-vitals-align-style';
  style.textContent = `
    .status-grid > .status-box > .status-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-height: 27px;
      margin-bottom: 5px;
      box-sizing: border-box;
    }
    .status-grid > .status-box > .status-controls {
      margin-top: 0;
    }
    .status-grid > .status-box > .status-toggles-container {
      margin-top: 0;
    }
    .status-grid .sanity-roll-button {
      flex: 0 0 27px;
    }
  `;
  document.head.appendChild(style);
})();