const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function newRoom() {
  const source = read('src/worker.js')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export class TableRoom', 'class TableRoom')
    .replace('export default {', 'globalThis.worker = {')
    + '\nglobalThis.Room = TableRoom;';
  const scope = { DurableObject: class {}, TextEncoder, TextDecoder, console, Response, URL, crypto: require('node:crypto').webcrypto };
  vm.runInNewContext(source, scope);
  const sockets = [];
  const records = new Map([['table', 'T2_AURORA']]);
  let ready;
  const ctx = {
    getWebSockets: () => sockets,
    blockConcurrencyWhile: fn => { ready = fn(); },
    storage: {
      get: async key => records.get(key),
      list: async () => new Map([...records].filter(([key]) => key.startsWith('player:'))),
      put: async (key, value) => records.set(key, value),
      delete: async key => records.delete(key)
    }
  };
  const room = new scope.Room(ctx, {});
  const socket = (name, metadata) => {
    const client = {
      name, metadata, readyState: 1, messages: [],
      deserializeAttachment() { return this.metadata; },
      serializeAttachment(next) { this.metadata = next; },
      send(payload) { this.messages.push(JSON.parse(payload)); },
      close() { this.readyState = 3; }
    };
    sockets.push(client);
    return client;
  };
  return { room, ready, socket };
}

test('T2: expulsar, reconvidar e conectar o mesmo personagem novamente ao overlay', async () => {
  const { room, ready, socket } = newRoom();
  await ready;
  const master = socket('mestre', { isMaster: true, authenticated: true, playerCode: '' });
  const overlay = socket('overlay', { isOverlay: true, playerCode: '' });
  const player = socket('jogador', { authenticated: true, playerCode: '' });

  await room.handleEvent(player, 'status_change', { codigo: 'P1', mesa: 'T2_AURORA', nome: 'Clara' });
  await room.handleEvent(player, 'status_change', { codigo: 'P1', mesa: 'T2_AURORA', nome: 'Clara' });
  assert.equal(overlay.messages.filter(event => event.e === 'player_connected').length, 1);

  await room.handleEvent(master, 'kick_player', { codigo: 'P1', mesa: 'T2_AURORA' });
  assert.equal(room.players.has('P1'), false);
  assert.equal(player.readyState, 3);
  assert(overlay.messages.some(event => event.e === 'player_disconnected'
    && event.d.codigo === 'P1' && event.d.reason === 'removed_by_master'));

  // O retorno por convite usa uma nova sessão autenticada e mantém o código P1.
  const rejoined = socket('jogador-reconvidado', { authenticated: true, playerCode: '' });
  await room.handleEvent(rejoined, 'status_change', { codigo: 'P1', mesa: 'T2_AURORA', nome: 'Clara' });
  assert.equal(room.players.get('P1').online, true);
  assert.equal(overlay.messages.filter(event => event.e === 'player_connected').length, 2);
  assert.equal(overlay.messages.at(-1).e, 'update_mestre');
  assert.equal(overlay.messages.at(-1).d.codigo, 'P1');

  // Alterar a ficha não deve disparar um falso evento de reconexão.
  await room.handleEvent(rejoined, 'status_change', { codigo: 'P1', mesa: 'T2_AURORA', nome: 'Clara 2' });
  assert.equal(overlay.messages.filter(event => event.e === 'player_connected').length, 2);
});

test('T2: convite individual é renovado, overlay apaga expulsos e restaura reconectados', () => {
  const master = read('public/mestre-temporada.html');
  const overlay = read('public/overlay.html');
  const portal = read('public/index.html');
  const native = read('public/firebase-client.js');
  const realtime = read('public/realtime-client.js');
  const manager = read('public/acessos.html');

  assert(master.includes('await OLFirebase.removeTablePlayer(masterTableCode, code);'));
  assert(master.includes('onclick="openMasterInvite()"'));
  assert(master.includes("new URL('./acessos.html', location.href)"));
  assert(manager.includes('OLNative.provisionPlayer(physical, edition, playerCode, existing ? 'renew' : 'create')'));
  assert(manager.includes("invite.hash = new URLSearchParams"));
  assert(overlay.includes("data.reason === 'removed_by_master'") || overlay.includes("data && data.reason === 'removed_by_master'"));
  assert(overlay.includes("socket.on('player_connected', releasePlayerAfterReconnect)"));
  assert(overlay.includes("socket.on('players_snapshot'"));
  assert(realtime.includes("if (data && data.reason === 'removed_by_master')"));
  assert(portal.includes("const invite = params.get('convite') === '1'"));
  assert(native.includes('async function removeTablePlayer('));
  assert(native.includes('global.OLNative.provisionPlayer'));
  assert(read('public/acessos.html').includes("const edition = 'temporada'"));
});
