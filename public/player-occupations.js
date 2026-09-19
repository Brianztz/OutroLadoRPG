(function unlockPlayerOccupations(global) {
    'use strict';

    const normalize = value => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

    const isOccultist = value => normalize(value) === 'ocultista';
    const optionIsOccultist = option => isOccultist(option && option.value) || isOccultist(option && option.textContent);
    let scheduled = false;

    function radioLabelText(input) {
        if (!input) return '';
        if (input.labels && input.labels.length) {
            return Array.from(input.labels).map(label => label.textContent || '').join(' ');
        }
        const wrappingLabel = input.closest('label');
        return wrappingLabel ? wrappingLabel.textContent || '' : '';
    }

    function unlockSelect(select) {
        const options = Array.from(select.options || []);
        if (!options.some(optionIsOccultist)) return false;

        select.disabled = false;
        select.removeAttribute('disabled');

        const fieldset = select.closest('fieldset[disabled]');
        if (fieldset) fieldset.removeAttribute('disabled');

        options.forEach(option => {
            if (optionIsOccultist(option)) {
                option.disabled = true;
                option.setAttribute('disabled', '');
                return;
            }
            const label = normalize(option.textContent);
            const value = normalize(option.value);
            if (!label || /^selecione|^escolha|^--/.test(label) || (!value && /^selecione|^escolha/.test(label))) return;
            option.disabled = false;
            option.removeAttribute('disabled');
        });
        return true;
    }

    function unlockRadioGroups() {
        const groups = new Map();
        document.querySelectorAll('input[type="radio"]').forEach(input => {
            const key = input.name || input.getAttribute('data-group') || '';
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(input);
        });

        groups.forEach(inputs => {
            if (!inputs.some(input => isOccultist(input.value) || isOccultist(radioLabelText(input)))) return;
            inputs.forEach(input => {
                const occultist = isOccultist(input.value) || isOccultist(radioLabelText(input));
                input.disabled = occultist;
                if (occultist) input.setAttribute('disabled', '');
                else input.removeAttribute('disabled');
            });
        });
    }

    function unlockButtonGroups() {
        document.querySelectorAll('button').forEach(button => {
            if (!isOccultist(button.textContent) && !isOccultist(button.value) && !isOccultist(button.dataset && (button.dataset.value || button.dataset.class || button.dataset.classe || button.dataset.occupation || button.dataset.ocupacao))) return;
            const parent = button.parentElement;
            if (!parent) return;
            Array.from(parent.children).forEach(sibling => {
                if (!(sibling instanceof HTMLButtonElement)) return;
                const occultist = isOccultist(sibling.textContent) || isOccultist(sibling.value) || isOccultist(sibling.dataset && (sibling.dataset.value || sibling.dataset.class || sibling.dataset.classe || sibling.dataset.occupation || sibling.dataset.ocupacao));
                sibling.disabled = occultist;
                if (occultist) sibling.setAttribute('disabled', '');
                else sibling.removeAttribute('disabled');
            });
        });
    }

    function unlockDatalists() {
        document.querySelectorAll('datalist').forEach(list => {
            const options = Array.from(list.querySelectorAll('option'));
            if (!options.some(optionIsOccultist)) return;
            options.forEach(option => {
                if (optionIsOccultist(option)) option.remove();
            });
            if (!list.id) return;
            const input = document.querySelector(`input[list="${CSS.escape(list.id)}"]`);
            if (input) {
                input.disabled = false;
                input.removeAttribute('disabled');
                input.readOnly = false;
                input.removeAttribute('readonly');
            }
        });
    }

    function applyOccupationRule() {
        scheduled = false;
        document.querySelectorAll('select').forEach(unlockSelect);
        unlockRadioGroups();
        unlockButtonGroups();
        unlockDatalists();
    }

    function scheduleApply() {
        if (scheduled) return;
        scheduled = true;
        global.requestAnimationFrame(applyOccupationRule);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleApply, { once: true });
    } else {
        scheduleApply();
    }

    global.addEventListener('load', scheduleApply, { once: true });
    document.addEventListener('change', scheduleApply, true);
    document.addEventListener('input', scheduleApply, true);

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['disabled', 'readonly', 'class', 'style']
    });

    global.setTimeout(scheduleApply, 300);
    global.setTimeout(scheduleApply, 1200);
})(window);
