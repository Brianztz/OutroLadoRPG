const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 20 * 1024 * 1024 });

app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_TABLE = 'PADRAO';
const playersData = new Map();
const playerSockets = new Map();
const initiativeStates = new Map();

function normalizePlayerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function normalizeTableCode(value) {
    const normalized = String(value || DEFAULT_TABLE)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
    return normalized || DEFAULT_TABLE;
}

function tableRoom(table) {
    return `mesa:${normalizeTableCode(table)}`;
}

function playerKey(table, code) {
    return `${normalizeTableCode(table)}::${normalizePlayerCode(code)}`;
}

function emptyInitiativeState() {
    return { entries: [], activeId: null, round: 0, started: false };
}

function getInitiativeState(table) {
    const normalizedTable = normalizeTableCode(table);
    if (!initiativeStates.has(normalizedTable)) initiativeStates.set(normalizedTable, emptyInitiativeState());
    return initiativeStates.get(normalizedTable);
}

function playersSnapshot(table, includeOffline = false) {
    const normalizedTable = normalizeTableCode(table);
    return Array.from(playersData.values()).filter(player => (
        player
        && player.mesa === normalizedTable
        && (includeOffline || player.online !== false)
    ));
}

function setAudienceTable(socket, type, rawTable) {
    const field = type === 'master' ? 'masterTable' : 'overlayTable';
    const previous = socket.data[field];
    const table = normalizeTableCode(rawTable);
    if (previous && previous !== table) socket.leave(tableRoom(previous));
    socket.join(tableRoom(table));
    socket.data[field] = table;
    socket.data[type === 'master' ? 'isMaster' : 'isOverlay'] = true;
    return table;
}

function unregisterPlayerSocket(socket, announce = true) {
    const key = socket.data.playerKey;
    if (!key || !playerSockets.has(key)) return;

    const sockets = playerSockets.get(key);
    sockets.delete(socket.id);
    if (!sockets.size) {
        playerSockets.delete(key);
        const data = playersData.get(key);
        if (announce && data) {
            playersData.set(key, { ...data, online: false });
            io.to(tableRoom(data.mesa)).emit('player_disconnected', { codigo: data.codigo, mesa: data.mesa });
        }
    }

    socket.data.playerKey = null;
    socket.data.playerCode = null;
    socket.data.playerTable = null;
}

function registerPlayerSocket(table, code, socket) {
    const normalizedTable = normalizeTableCode(table);
    const normalizedCode = normalizePlayerCode(code);
    const key = playerKey(normalizedTable, normalizedCode);

    if (socket.data.playerKey && socket.data.playerKey !== key) {
        const previousTable = socket.data.playerTable;
        unregisterPlayerSocket(socket, true);
        if (previousTable) socket.leave(tableRoom(previousTable));
    }

    const isFreshConnection = !playerSockets.has(key) || playerSockets.get(key).size === 0;
    if (!playerSockets.has(key)) playerSockets.set(key, new Set());
    playerSockets.get(key).add(socket.id);
    socket.join(tableRoom(normalizedTable));
    socket.data.playerKey = key;
    socket.data.playerCode = normalizedCode;
    socket.data.playerTable = normalizedTable;
    if (isFreshConnection) {
        io.to(tableRoom(normalizedTable)).emit('player_connected', { codigo: normalizedCode, mesa: normalizedTable });
    }
    return key;
}

function normalizeInitiativeState(rawState) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const entries = Array.isArray(source.entries) ? source.entries.slice(0, 200).map((entry, index) => ({
        id: String(entry && entry.id || `initiative_${index}`).slice(0, 100),
        name: String(entry && entry.name || 'Participante').slice(0, 120),
        value: Number.isFinite(Number(entry && entry.value)) ? Number(entry.value) : 0,
        kind: entry && entry.kind === 'player' ? 'player' : 'npc',
        code: normalizePlayerCode(entry && entry.code)
    })) : [];
    const activeId = source.activeId ? String(source.activeId).slice(0, 100) : null;
    return {
        entries,
        activeId: activeId && entries.some(entry => entry.id === activeId) ? activeId : null,
        round: Math.max(0, Math.floor(Number(source.round) || 0)),
        started: Boolean(source.started && activeId)
    };
}

io.on('connection', socket => {
    console.log('Conexao aberta:', socket.id);

    socket.on('master_ready', rawData => {
        const table = setAudienceTable(socket, 'master', rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        socket.emit('players_snapshot', playersSnapshot(table));
        socket.emit('initiative_state_updated', getInitiativeState(table));
    });

    socket.on('overlay_ready', rawData => {
        const table = setAudienceTable(socket, 'overlay', rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        socket.emit('players_snapshot', playersSnapshot(table, true));
        socket.emit('initiative_state_updated', getInitiativeState(table));
    });

    socket.on('initiative_state_change', rawState => {
        if (!socket.data.isMaster) return;
        const table = normalizeTableCode(rawState && rawState.mesa || socket.data.masterTable);
        const state = normalizeInitiativeState(rawState);
        initiativeStates.set(table, state);
        io.to(tableRoom(table)).emit('initiative_state_updated', state);
    });

    socket.on('status_change', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const code = normalizePlayerCode(rawData.codigo || rawData.id);
        const table = normalizeTableCode(rawData.mesa);
        if (!code) return;

        const key = registerPlayerSocket(table, code, socket);
        const data = { ...rawData, codigo: code, id: code, mesa: table, online: true };
        playersData.set(key, data);
        io.to(tableRoom(table)).emit('update_mestre', data);
    });

    socket.on('master_update_player', rawData => {
        if (!rawData || typeof rawData !== 'object' || !rawData.fullData) return;
        const code = normalizePlayerCode(rawData.codigo || rawData.id);
        const table = normalizeTableCode(rawData.mesa || socket.data.masterTable);
        if (!code) return;

        const key = playerKey(table, code);
        const previousData = playersData.get(key) || {};
        const data = { ...previousData, ...rawData, codigo: code, id: code, mesa: table, online: true };
        playersData.set(key, data);

        const sockets = playerSockets.get(key);
        if (sockets) sockets.forEach(socketId => io.to(socketId).emit('player_data_updated', data));
        io.to(tableRoom(table)).emit('update_mestre', data);
    });

    socket.on('grant_catalog_item', rawData => {
        const rawItem = rawData && rawData.item;
        if (!rawItem || typeof rawItem !== 'object') return;
        const name = String(rawItem.n || '').trim().slice(0, 120);
        if (!name) return;

        const table = normalizeTableCode(rawData.mesa || socket.data.masterTable);
        const recipients = new Set((Array.isArray(rawData.codigos) ? rawData.codigos : []).map(normalizePlayerCode).filter(Boolean));
        const item = {
            id: String(rawItem.id || `master_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
            n: name,
            w: Math.max(0, Math.min(999, Number(rawItem.w) || 0)),
            d: String(rawItem.d || '').slice(0, 5000),
            eq: true,
            type: ['arma', 'municao', 'comum'].includes(rawItem.type) ? rawItem.type : 'comum',
            dmg: String(rawItem.dmg || '0').slice(0, 40),
            extra: String(rawItem.extra || '0').slice(0, 40),
            crit: String(rawItem.crit || '20/x2').slice(0, 40),
            skill: String(rawItem.skill || 'Luta').slice(0, 60),
            img: String(rawItem.img || '').slice(0, 3000),
            atkType: String(rawItem.atkType || 'Corpo a corpo').slice(0, 40),
            atk: Math.max(1, Math.min(20, Number(rawItem.atk) || 1)),
            range: String(rawItem.range || 'Curto').slice(0, 40),
            ammo: String(rawItem.ammo || 'Nenhuma').slice(0, 40),
            capacity: Math.max(0, Math.min(999, Number(rawItem.capacity) || 0)),
            currentShots: Math.max(0, Math.min(999, Number(rawItem.currentShots) || 0))
        };

        playersData.forEach(player => {
            if (!player || player.mesa !== table || (recipients.size && !recipients.has(player.codigo))) return;
            const sockets = playerSockets.get(playerKey(table, player.codigo));
            if (sockets) sockets.forEach(socketId => io.to(socketId).emit('catalog_item_granted', { item }));
        });
    });

    socket.on('rolagem_feita', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const code = normalizePlayerCode(rawData.codigo || socket.data.playerCode);
        const table = normalizeTableCode(rawData.mesa || socket.data.playerTable);
        const rollData = { ...rawData, codigo: code, mesa: table };
        io.to(tableRoom(table)).emit('novo_log', rollData);
        if (code && /^iniciativa\b/i.test(String(rawData.acao || '').trim())) {
            io.to(tableRoom(table)).emit('initiative_rolled', rollData);
        }
    });

    socket.on('request_player', rawData => {
        const source = rawData && typeof rawData === 'object' ? rawData : { codigo: rawData };
        const code = normalizePlayerCode(source.codigo || source.id);
        const table = normalizeTableCode(source.mesa || socket.data.masterTable);
        const key = playerKey(table, code);
        if (playersData.has(key)) socket.emit('update_mestre', playersData.get(key));
    });

    socket.on('disconnect', () => {
        unregisterPlayerSocket(socket, true);
        console.log('Conexao encerrada:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
