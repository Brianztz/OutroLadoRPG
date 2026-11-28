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
  async function getTableInvite(table,rotate=false){
    return api(query(table,'table-invite','temporada')+(rotate?'&rotate=1':''),{method:'POST'});
  }
  async function joinTableInvite(table,invite,previouslyJoined=false){
    return api(sessionUrl(table),{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'join-table',invite,previouslyJoined})});
  }
  async function signInPlayer(table, edition, code, key) {
    return api(sessionUrl(table), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'player', edition, code, key })
    });
  }
  async function lookupAccount(username, password) {
    return api(base+'account',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'lookup',username,password})
    });
  }
  async function registerMasterAccount(username, password) {
    return api(base+'account',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'register-master',username,password})
    });
  }
  async function createMasterTable(username,password,name) {
    return api(base+'account',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(username?{action:'create-master-table',username,password,name}:{action:'create-master-table',useSession:true,name})
    });
  }
  async function changeMasterCredentials(username,password,newUsername,newPassword) {
    return api(base+'account',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        action:'change-master-credentials',username,password,newUsername,newPassword
      })
    });
  }
  async function signInAccount(table, role, code, username, password, rememberPlayer = false) {
    return api(sessionUrl(table),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(username?{role,edition:'temporada',code,username,password}:{role,edition:'temporada',code,useAccount:true,...(rememberPlayer?{rememberPlayer:true}:{})})
    });
  }
  async function getAccountSession(){
    return api(base+'account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'current-account'})});
  }
  async function logoutAccount(){
    return api(base+'account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout-account'})});
  }
  async function joinPlayerAccount(table){
    return api(query(table,'account-register','temporada'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({useSession:true})});
  }
  async function registerPlayerAccount(table,username,password) {
    return api(query(table,'account-register','temporada'),{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,password})
    });
  }
  async function getSession(table) {
    return api(sessionUrl(table));
  }
  async function signOut(table) {
    return api(sessionUrl(table), { method: 'DELETE' });
  }
  async function provisionPlayer(table, edition, code, mode = '', name = '') {
    const url = query(table, 'player-access', edition, code);
    const flag = mode === 'create' ? '&create=1' : mode === 'renew' ? '&renew=1' : '';
    const displayName = name ? '&nome=' + encodeURIComponent(String(name).slice(0, 80)) : '';
    return api(url + flag + displayName, { method: 'POST' });
  }
  async function listPlayers(table, edition = 'temporada') {
    return api(query(table, 'player-list', edition));
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
    lookupAccount, registerMasterAccount, createMasterTable, changeMasterCredentials, signInAccount, registerPlayerAccount,
    getAccountSession, logoutAccount, joinPlayerAccount,
    getTableInvite, joinTableInvite, provisionPlayer, listPlayers, readCharacter, writeCharacter, readClues, writeClues
  });
})(window);
