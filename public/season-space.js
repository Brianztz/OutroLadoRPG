/* Separate physical rooms per RPG season while retaining the public table name.
 * Used by portal, Firebase and realtime; classic tables are unchanged.
 */
(function (global) {
  'use strict';
  function normalize(value) {
    const table = String(value || 'PADRAO').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return table || 'PADRAO';
  }
  function hash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  function isSeasonPage() {
    const path = String(global.location?.pathname || '');
    if (/\/(?:ficha-temporada|mestre-temporada)(?:\.html)?\/?$/i.test(path)) return true;
    if (!/\/(?:mestre|overlay)(?:\.html)?\/?$/i.test(path) &&
        !/\/lumina\/index(?:\.html)?\/?$/i.test(path)) return false;
    return new URLSearchParams(global.location.search).get('temporada') === '2';
  }
  function tableId(value, edition) {
    const logical = normalize(value);
    const season = edition === 'temporada' || edition === 2 ||
      (edition == null && isSeasonPage());
    if (!season) return logical;
    // The backend and Firestore restrict table IDs to 40 characters.
    // A suffix hash preserves distinct names when the public code exceeds 37.
    return logical.length <= 37
      ? 'T2_' + logical
      : 'T2_' + logical.slice(0, 28) + '_' + hash(logical);
  }
  global.OLSeasonSpace = Object.freeze({normalize, tableId, isSeasonPage});
})(window);
