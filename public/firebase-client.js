(function installOutroLadoNativeClient(global) {
  'use strict';
  const base = '/api/';
  function tableCode(value) {
    const normalized = String(value || 'PADRAO').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return normalized || 'PADRAO';
  }
  function requireOk(response, data) {
    if (response.ok) return data;
    const error = new Error(data?.error || 'Erro na sincronizacao.');
    error.status = response.status;
    throw error;
  }
  async function api(path, options) {
    const response = await global.fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options
    });
    const result = await response.json().catch(() => ({ error: 'invalid_server_response' }));
    return requireOk(response, result);
  }
  function query(table, kind, edition, code) {
    const params = new URLSearchParams({ mesa: tableCode(table), kind });
    if (edition) params.set('edicao', edition === 'temporada' ? 'temporada' : 'classic');
    if (code) params.set('codigo', code);
    return base + 'storage?' + params.toString();
  }
  function sessionUrl(table) {
    return base + 'session?mesa=' + encodeURIComponent(tableCode(table));
  }
  async function getMasterRoom(secret, preferredCode = '', activationSecret = '') {
    return api(base + 'master-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: secret, preferredCode, activationSecret })
    });
  }
  async function signInMaster(table, secret) {
    return api(sessionUrl(table), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'master', key: secret })
    });
  }
  async function signInPlayer(table, edition, code, key) {
    return api(sessionUrl(table), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'player', edition, code, key })
    });
  }
  async function getSession(table) {
    return api(sessionUrl(table));
  }
  async function signOut(table) {
    return api(sessionUrl(table), { method: 'DELETE' });
  }
  async function provisionPlayer(table, edition, code) {
    return api(query(table, 'player-access', edition, code), { method: 'POST' });
  }
  async function readCharacter(table, edition, code) {
    return api(query(table, 'character', edition, code));
  }
  async function writeCharacter(table, edition, code, sheet) {
    return api(query(table, 'character', edition, code), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sheet)
    });
  }
  async function readClues(table) {
    return api(query(table, 'clues'));
  }
  async function writeClues(table, clues) {
    return api(query(table, 'clues'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clues)
    });
  }
  global.OLNative = Object.freeze({
    tableCode, getMasterRoom, signInMaster, signInPlayer, getSession, signOut,
    provisionPlayer, readCharacter, writeCharacter, readClues, writeClues
  });
})(window);


(function installCompatibility(global) {
  'use strict';
  const tableFromURL = () => new URL(global.location.href).searchParams.get('mesa')
    || localStorage.getItem('portal_table_code')
    || localStorage.getItem('player_table_code')
    || localStorage.getItem('master_table_code')
    || 'PADRAO';
  const norm = global.OLNative.tableCode;
  function seasonScopedTable(table, edition = null) {
    const season = edition === 'temporada' ||
      (edition == null && global.OLSeasonSpace?.isSeasonPage?.());
    return season && global.OLSeasonSpace ? global.OLSeasonSpace.tableId(table, 'temporada') : norm(table);
  }
  let cachedUser = null, cachedTable = '', cacheUntil = 0;
  async function nativeSession(table = seasonScopedTable(tableFromURL()), force = false) {
    table = norm(table);
    if (!force && cachedTable === table && Date.now() < cacheUntil) return cachedUser;
    const response = await global.OLNative.getSession(table).catch(error => {
      if (error.status === 401) return null;
      throw error;
    });
    if (!response?.ok) { cachedUser = null; cachedTable = table; cacheUntil = Date.now() + 1500; return null; }
    cachedTable = table; cacheUntil = Date.now() + 7000;
    cachedUser = {
      uid: response.role === 'master' ? 'native-master' : 'native-player:' + response.code,
      displayName: response.role === 'master' ? 'Mestre' : 'Jogador ' + response.code,
      email: '', photoURL: '', emailVerified: true,
      role: response.role, code: response.code || ''
    };
    return cachedUser;
  }
  async function getCurrentUser() { return nativeSession(); }
  function hashCharacterSheet(value) {
    const source = String(value || '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
  function normalizePlayerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
  }
  async function authorizedTable(role, requestedTable = tableFromURL(), edition = null) {
    const physical = seasonScopedTable(requestedTable, edition);
    const user = await nativeSession(physical, true);
    if (!user || (role === 'master' && user.role !== 'master')
      || (role === 'player' && user.role !== 'player')) {
      throw new Error('A sessão não tem acesso a esta mesa. Use seu convite ou entre novamente.');
    }
    return { user, tableId: physical, role };
  }
  async function preparePortal(role, requestedTable, edition = null) {
    return authorizedTable(role, requestedTable, edition);
  }
  function portalURL(message) {
    const u = new URL('./index.html', global.location.href);
    u.search = '';
    u.searchParams.set('mesa', norm(tableFromURL()));
    if (global.OLSeasonSpace?.isSeasonPage?.()) u.searchParams.set('temporada', '2');
    if (message) u.searchParams.set('aviso', message);
    return u.href;
  }
  async function guardPage(role) {
    try {
      await authorizedTable(role, tableFromURL());
      document.documentElement.classList.remove('firebase-auth-pending');
      return true;
    } catch (error) {
      document.documentElement.classList.remove('firebase-auth-pending');
      global.location.replace(portalURL('Acesso expirado ou não autorizado. Entre novamente.'));
      return false;
    }
  }
  async function loadCharacter(requestedTable, variant) {
    const user = await getCurrentUser();
    if (!user) throw Error('É necessário entrar na mesa.');
    const code = user.role === 'master' ? normalizePlayerCode(localStorage.getItem('player_sync_code')) : user.code;
    if (!code) throw Error('Código do personagem não encontrado.');
    try {
      const response = await global.OLNative.readCharacter(seasonScopedTable(requestedTable), variant, code);
      return response.data?.sheetJson ? response.data : null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
  async function saveCharacter(requestedTable, data, metadata = {}) {
    const user = await getCurrentUser();
    if (!user) throw Error('É necessário entrar na mesa para salvar.');
    const code = user.role === 'master' ? normalizePlayerCode(metadata.playerCode || localStorage.getItem('player_sync_code')) : user.code;
    if (!code) throw Error('Código do personagem não encontrado.');
    const sheetJson = typeof data === 'string' ? data : JSON.stringify(data || {});
    const sheetHash = hashCharacterSheet(sheetJson);
    const payload = {
      sheetJson, sheetHash, playerCode: code,
      characterName: String(metadata.characterName || '').slice(0, 120),
      updatedAt: new Date().toISOString()
    };
    await global.OLNative.writeCharacter(seasonScopedTable(requestedTable),
      metadata.sheetVariant || (global.OLSeasonSpace?.isSeasonPage?.() ? 'temporada' : 'classic'),
      code, payload);
    global.dispatchEvent(new CustomEvent('ol:character-sync', {
      detail: { state: 'saved', tableId: seasonScopedTable(requestedTable), sheetHash }
    }));
    return { sheetHash, playerCode: code, skipped: false };
  }
  async function loadMasterClues(table) {
    try {
      const r = await global.OLNative.readClues(seasonScopedTable(table));
      return r.data?.cluesJson ? r.data : null;
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
  async function saveMasterClues(table, clues) {
    const cluesJson = typeof clues === 'string' ? clues : JSON.stringify(clues || []);
    const cluesHash = hashCharacterSheet(cluesJson);
    await global.OLNative.writeClues(seasonScopedTable(table), {
      cluesJson, cluesHash, updatedAt: new Date().toISOString()
    });
    return { cluesHash, skipped: false };
  }
  async function watchChanges(load, listener, keyFn) {
    if (typeof listener !== 'function') throw Error('Listener necessário.');
    let active = true, last = undefined, pending = false;
    async function check() {
      if (!active || pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const data = await load();
        const key = data ? keyFn(data) : '';
        if (last === undefined || key !== last) { last = key; listener(data, null); }
      } catch (error) { listener(null, error); } finally { pending = false; }
    }
    await check();
    const timer = setInterval(check, 7000);
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', visible);
    const changed = () => void check();
    global.addEventListener('focus', changed);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      global.removeEventListener('focus', changed);
    };
  }
  async function watchCharacter(table, listener, variant) {
    return watchChanges(() => loadCharacter(table, variant), listener, data => data.sheetHash);
  }
  async function watchMasterClues(table, listener) {
    return watchChanges(() => loadMasterClues(table), listener, data => data.cluesHash);
  }
  async function removeTablePlayer(table, code) {
    const user = await getCurrentUser();
    if (user?.role !== 'master') throw Error('Somente o mestre pode remover jogadores.');
    await global.OLNative.provisionPlayer(seasonScopedTable(table), 
      global.OLSeasonSpace?.isSeasonPage?.() ? 'temporada' : 'classic', normalizePlayerCode(code));
    return { playerCode: normalizePlayerCode(code), tableId: seasonScopedTable(table) };
  }
  async function signOut() {
    await global.OLNative.signOut(seasonScopedTable(tableFromURL()));
    cachedUser = null; cacheUntil = 0;
  }
  async function onUserChanged(listener) {
    const user = await getCurrentUser().catch(() => null);
    listener(user);
    return () => {};
  }
  // Legacy global name is retained only as a compatibility interface.
  // This module does not load or call Firebase services.
  global.OLFirebase = Object.freeze({
    config: null, databaseId: null, masterEmail: '',
    getCurrentUser, guardPage, hashCharacterSheet,
    isBootstrapMaster: user => Boolean(user?.role === 'master'),
    loadCharacter, loadMasterClues, normalizeTableCode: norm,
    seasonScopedTable, onUserChanged, preparePortal,
    refreshRealtimeToken: async () => '',
    removeTablePlayer, saveCharacter, saveMasterClues,
    signInWithGoogle: async () => { throw Error('Use o login por convite ou chave do mestre.'); },
    signOut, watchCharacter, watchMasterClues
  });
})(window);
