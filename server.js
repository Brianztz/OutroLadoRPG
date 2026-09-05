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
const clueInspections = new Map();
const luminaStates = new Map();
const screenShareRooms = new Map();
const screenShareChats = new Map();

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

function screenRoom(table) {
    return `tela:${normalizeTableCode(table)}`;
}

function getScreenShareRoom(table) {
    const normalizedTable = normalizeTableCode(table);
    if (!screenShareRooms.has(normalizedTable)) {
        screenShareRooms.set(normalizedTable, {
            broadcasterId: null,
            viewers: new Set(),
            fallbackViewers: new Set(),
            relayMimeType: '',
            relayBootstrapChunk: null
        });
    }
    return screenShareRooms.get(normalizedTable);
}

function getScreenShareChat(table) {
    const normalizedTable = normalizeTableCode(table);
    if (!screenShareChats.has(normalizedTable)) screenShareChats.set(normalizedTable, []);
    return screenShareChats.get(normalizedTable);
}

function normalizeScreenChatName(value) {
    return String(value || 'Espectador').trim().replace(/\s+/g, ' ').slice(0, 30) || 'Espectador';
}

function normalizeScreenChatText(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, 400);
}

function emitScreenShareFallbackCount(table, room = getScreenShareRoom(table)) {
    if (!room.fallbackViewers.size) {
        room.relayMimeType = '';
        room.relayBootstrapChunk = null;
    }
    if (room.broadcasterId) {
        io.to(room.broadcasterId).emit('screen_share_fallback_count', {
            mesa: normalizeTableCode(table),
            count: room.fallbackViewers.size
        });
    }
}

function emitScreenShareState(table) {
    const normalizedTable = normalizeTableCode(table);
    const room = getScreenShareRoom(normalizedTable);
    io.to(screenRoom(normalizedTable)).emit('screen_share_state', {
        mesa: normalizedTable,
        active: Boolean(room.broadcasterId),
        viewers: room.viewers.size
    });
}

function leaveScreenShare(socket, announce = true) {
    const table = socket.data.screenShareTable;
    if (!table || !screenShareRooms.has(table)) return;
    const room = screenShareRooms.get(table);

    if (room.broadcasterId === socket.id) {
        room.broadcasterId = null;
        room.viewers.clear();
        room.fallbackViewers.clear();
        room.relayMimeType = '';
        room.relayBootstrapChunk = null;
        if (announce) io.to(screenRoom(table)).emit('screen_share_ended', { mesa: table });
    } else if (room.viewers.delete(socket.id)) {
        room.fallbackViewers.delete(socket.id);
        if (room.broadcasterId) {
            io.to(room.broadcasterId).emit('screen_share_viewer_left', { viewerId: socket.id });
            emitScreenShareFallbackCount(table, room);
        }
    }

    socket.leave(screenRoom(table));
    socket.data.screenShareTable = null;
    socket.data.screenShareRole = null;
    if (!room.broadcasterId && !room.viewers.size) screenShareRooms.delete(table);
    if (announce) emitScreenShareState(table);
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

function getLuminaState(table) {
    const normalizedTable = normalizeTableCode(table);
    if (!luminaStates.has(normalizedTable)) {
        luminaStates.set(normalizedTable, { mesa: normalizedTable, enabled: false, caseId: 'aurora-adelanio' });
    }
    return luminaStates.get(normalizedTable);
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
            const inspection = clueInspections.get(data.mesa);
            if (inspection && inspection.codigo === data.codigo) {
                clueInspections.delete(data.mesa);
                io.to(tableRoom(data.mesa)).emit('clue_inspection_stopped', { mesa: data.mesa, codigo: data.codigo, reason: 'disconnect' });
            }
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

function normalizeClueInspectionState(rawState) {
    const source = rawState && typeof rawState === 'object' ? rawState : {};
    const clamp = (value, minimum, maximum, fallback = 0) => {
        const number = Number(value);
        return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
    };
    return {
        type: source.type === 'book' ? 'book' : 'object',
        rotationX: clamp(source.rotationX, -90, 90, -8),
        rotationY: clamp(source.rotationY, -100000, 100000, 0),
        zoom: clamp(source.zoom, 0.5, 4, 1),
        panXRatio: clamp(source.panXRatio, -1.5, 1.5, 0),
        panYRatio: clamp(source.panYRatio, -1.5, 1.5, 0),
        aspect: clamp(source.aspect, 0, 8, 0),
        open: Boolean(source.open),
        spread: Math.max(0, Math.min(198, Math.floor(Number(source.spread) || 0))),
        turnDirection: Math.sign(Math.max(-1, Math.min(1, Number(source.turnDirection) || 0)))
    };
}

function normalizeClueForInspection(rawClue) {
    const source = rawClue && typeof rawClue === 'object' ? rawClue : {};
    let imageBudget = 18 * 1024 * 1024;
    const takeImage = value => {
        const image = String(value || '');
        if (!image || image.length > imageBudget) return '';
        imageBudget -= image.length;
        return image;
    };
    const type = source.type === 'book' ? 'book' : 'object';
    const safeColor = (value, fallback) => /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim()) ? String(value).trim() : fallback;
    const clue = {
        id: String(source.id || `clue_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
        title: String(source.title || 'Pista').slice(0, 160),
        desc: String(source.desc || '').slice(0, 5000),
        type,
        thickness: Math.max(4, Math.min(40, Math.round((Number(source.thickness) || 18) / 2) * 2))
    };
    if (type === 'book') {
        clue.coverImg = takeImage(source.coverImg || source.img);
        clue.coverBackImg = takeImage(source.coverBackImg || clue.coverImg);
        clue.hasCustomBack = Boolean(source.hasCustomBack);
        clue.edgeColor = safeColor(source.edgeColor, '#4a2d18');
        clue.backEdgeColor = safeColor(source.backEdgeColor, '#4a2d18');
        clue.pages = (Array.isArray(source.pages) ? source.pages : []).slice(0, 100).map(page => ({
            img: takeImage(typeof page === 'string' ? page : page && (page.img || page.src))
        }));
    } else {
        clue.img = takeImage(source.img);
        clue.backImg = takeImage(source.backImg || clue.img);
        clue.edgeColor = safeColor(source.edgeColor, '#68686f');
    }
    return clue;
}

io.on('connection', socket => {
    console.log('Conexao aberta:', socket.id);
    socket.data.screenShareSpectator = Boolean(socket.handshake.auth && socket.handshake.auth.screenShareMode === 'spectator');

    socket.on('master_ready', rawData => {
        const table = setAudienceTable(socket, 'master', rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        socket.emit('players_snapshot', playersSnapshot(table));
        socket.emit('initiative_state_updated', getInitiativeState(table));
        socket.emit('lumina_state_updated', getLuminaState(table));
    });

    socket.on('lumina_ready', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        const previousTable = socket.data.luminaTable;
        if (previousTable && previousTable !== table) socket.leave(tableRoom(previousTable));
        socket.join(tableRoom(table));
        socket.data.luminaTable = table;
        socket.emit('lumina_state_updated', getLuminaState(table));
    });

    socket.on('lumina_master_set', rawData => {
        if (!socket.data.isMaster || !rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(rawData.mesa || socket.data.masterTable);
        const state = { mesa: table, enabled: Boolean(rawData.enabled), caseId: 'aurora-adelanio' };
        luminaStates.set(table, state);
        io.to(tableRoom(table)).emit('lumina_state_updated', state);
    });

    socket.on('screen_share_join', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        if (socket.data.screenShareTable && socket.data.screenShareTable !== table) leaveScreenShare(socket, true);
        socket.join(screenRoom(table));
        socket.data.screenShareTable = table;
        const room = getScreenShareRoom(table);
        socket.emit('screen_share_state', { mesa: table, active: Boolean(room.broadcasterId), viewers: room.viewers.size });
        socket.emit('screen_share_chat_history', { mesa: table, messages: getScreenShareChat(table) });
        if (room.broadcasterId && room.broadcasterId !== socket.id) {
            socket.emit('screen_share_available', { mesa: table, broadcasterId: room.broadcasterId });
        }
    });

    socket.on('screen_share_chat_send', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(rawData.mesa || socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const text = normalizeScreenChatText(rawData.text);
        if (!text) return;
        const now = Date.now();
        if (now - Number(socket.data.lastScreenChatAt || 0) < 350) return;
        socket.data.lastScreenChatAt = now;
        const message = {
            id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            mesa: table,
            senderId: socket.id,
            name: normalizeScreenChatName(rawData.name),
            text,
            createdAt: now
        };
        const messages = getScreenShareChat(table);
        messages.push(message);
        if (messages.length > 120) messages.splice(0, messages.length - 120);
        io.to(screenRoom(table)).emit('screen_share_chat_message', message);
    });

    socket.on('screen_share_start', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        if (socket.data.screenShareSpectator) {
            socket.emit('screen_share_start_denied', { mesa: table, reason: 'spectator' });
            return;
        }
        if (socket.data.screenShareTable !== table) {
            if (socket.data.screenShareTable) leaveScreenShare(socket, true);
            socket.join(screenRoom(table));
            socket.data.screenShareTable = table;
        }
        const room = getScreenShareRoom(table);
        if (room.broadcasterId && room.broadcasterId !== socket.id) {
            io.to(room.broadcasterId).emit('screen_share_replaced', { mesa: table });
            io.to(screenRoom(table)).emit('screen_share_ended', { mesa: table, reason: 'replaced' });
            const previousBroadcaster = io.sockets.sockets.get(room.broadcasterId);
            if (previousBroadcaster) previousBroadcaster.data.screenShareRole = null;
            room.viewers.clear();
            room.fallbackViewers.clear();
            room.relayMimeType = '';
            room.relayBootstrapChunk = null;
        }
        room.broadcasterId = socket.id;
        socket.data.screenShareRole = 'broadcaster';
        io.to(screenRoom(table)).emit('screen_share_available', { mesa: table, broadcasterId: socket.id });
        emitScreenShareState(table);
    });

    socket.on('screen_share_watch', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const room = getScreenShareRoom(table);
        if (!room.broadcasterId || room.broadcasterId === socket.id) return;
        const alreadyWatching = room.viewers.has(socket.id);
        const retryRequested = Boolean(rawData && typeof rawData === 'object' && rawData.retry === true);
        room.viewers.add(socket.id);
        if (!alreadyWatching) room.fallbackViewers.delete(socket.id);
        socket.data.screenShareRole = 'viewer';
        const now = Date.now();
        const retryAllowed = retryRequested && now - Number(socket.data.lastScreenShareRetryAt || 0) >= 4000;
        if (!alreadyWatching || retryAllowed) {
            if (retryAllowed) socket.data.lastScreenShareRetryAt = now;
            io.to(room.broadcasterId).emit('screen_share_viewer_joined', { mesa: table, viewerId: socket.id });
            if (!alreadyWatching) emitScreenShareState(table);
        }
    });

    socket.on('screen_share_offer', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        const target = String(rawData.target || '');
        const targetSocket = io.sockets.sockets.get(target);
        if (room.broadcasterId !== socket.id || !room.viewers.has(target) || !targetSocket || targetSocket.data.screenShareTable !== table) return;
        io.to(target).emit('screen_share_offer', { mesa: table, broadcasterId: socket.id, sdp: rawData.sdp });
    });

    socket.on('screen_share_answer', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        const target = String(rawData.target || '');
        if (room.broadcasterId !== target || !room.viewers.has(socket.id)) return;
        io.to(target).emit('screen_share_answer', { mesa: table, viewerId: socket.id, sdp: rawData.sdp });
    });

    socket.on('screen_share_ice', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        const target = String(rawData.target || '');
        const targetSocket = io.sockets.sockets.get(target);
        const validPair = room.broadcasterId === socket.id ? room.viewers.has(target) : room.broadcasterId === target && room.viewers.has(socket.id);
        if (!validPair || !targetSocket || targetSocket.data.screenShareTable !== table) return;
        io.to(target).emit('screen_share_ice', { mesa: table, from: socket.id, candidate: rawData.candidate });
    });

    socket.on('screen_share_fallback_request', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const room = getScreenShareRoom(table);
        if (!room.broadcasterId || !room.viewers.has(socket.id)) return;
        const alreadyUsingFallback = room.fallbackViewers.has(socket.id);
        room.fallbackViewers.add(socket.id);
        if (!alreadyUsingFallback) {
            if (room.relayMimeType) {
                socket.emit('screen_share_relay_reset', { mesa: table, mimeType: room.relayMimeType });
                if (room.relayBootstrapChunk) {
                    socket.emit('screen_share_relay_chunk', { mesa: table, chunk: room.relayBootstrapChunk });
                }
            }
            emitScreenShareFallbackCount(table, room);
        }
    });

    socket.on('screen_share_peer_connected', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const room = getScreenShareRoom(table);
        if (room.fallbackViewers.delete(socket.id)) emitScreenShareFallbackCount(table, room);
    });

    socket.on('screen_share_relay_selected', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const room = getScreenShareRoom(table);
        if (!room.broadcasterId || !room.fallbackViewers.has(socket.id)) return;
        io.to(room.broadcasterId).emit('screen_share_viewer_left', { viewerId: socket.id, relay: true });
    });

    socket.on('screen_share_frame', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        if (room.broadcasterId !== socket.id || !rawData.frame) return;
        const byteLength = Number(rawData.frame.byteLength || rawData.frame.length || 0);
        if (!byteLength || byteLength > 2 * 1024 * 1024) return;
        room.fallbackViewers.forEach(viewerId => {
            const viewerSocket = io.sockets.sockets.get(viewerId);
            if (viewerSocket && viewerSocket.data.screenShareTable === table) {
                io.to(viewerId).volatile.emit('screen_share_frame', { mesa: table, frame: rawData.frame, mimeType: String(rawData.mimeType || 'image/webp').slice(0, 40) });
            }
        });
    });

    socket.on('screen_share_relay_reset', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        if (room.broadcasterId !== socket.id) return;
        const mimeType = String(rawData.mimeType || '').slice(0, 100);
        if (!/^video\/webm/i.test(mimeType)) return;
        room.relayMimeType = mimeType;
        room.relayBootstrapChunk = null;
        room.fallbackViewers.forEach(viewerId => {
            io.to(viewerId).emit('screen_share_relay_reset', { mesa: table, mimeType });
        });
    });

    socket.on('screen_share_relay_chunk', rawData => {
        if (!rawData || typeof rawData !== 'object' || !rawData.chunk) return;
        const table = normalizeTableCode(socket.data.screenShareTable);
        const room = getScreenShareRoom(table);
        if (room.broadcasterId !== socket.id) return;
        const byteLength = Number(rawData.chunk.byteLength || rawData.chunk.length || 0);
        if (!byteLength || byteLength > 10 * 1024 * 1024) return;
        if (!room.relayBootstrapChunk) room.relayBootstrapChunk = rawData.chunk;
        room.fallbackViewers.forEach(viewerId => {
            const viewerSocket = io.sockets.sockets.get(viewerId);
            if (viewerSocket && viewerSocket.data.screenShareTable === table) {
                io.to(viewerId).emit('screen_share_relay_chunk', { mesa: table, chunk: rawData.chunk });
            }
        });
    });

    socket.on('screen_share_relay_failed', rawData => {
        const table = normalizeTableCode(rawData && typeof rawData === 'object' ? rawData.mesa : socket.data.screenShareTable);
        if (socket.data.screenShareTable !== table) return;
        const room = getScreenShareRoom(table);
        if (!room.broadcasterId || !room.fallbackViewers.has(socket.id)) return;
        io.to(room.broadcasterId).emit('screen_share_relay_failed', { mesa: table, viewerId: socket.id });
    });

    socket.on('screen_share_stop', () => {
        const table = socket.data.screenShareTable;
        if (!table || !screenShareRooms.has(table)) return;
        const room = screenShareRooms.get(table);
        if (room.broadcasterId !== socket.id) return;
        room.broadcasterId = null;
        room.viewers.clear();
        room.fallbackViewers.clear();
        room.relayMimeType = '';
        room.relayBootstrapChunk = null;
        socket.data.screenShareRole = null;
        io.to(screenRoom(table)).emit('screen_share_ended', { mesa: table });
        emitScreenShareState(table);
    });

    socket.on('overlay_ready', rawData => {
        const table = setAudienceTable(socket, 'overlay', rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        socket.emit('players_snapshot', playersSnapshot(table, true));
        socket.emit('initiative_state_updated', getInitiativeState(table));
        const inspection = clueInspections.get(table);
        if (inspection) socket.emit('clue_inspection_started', inspection);
    });

    socket.on('clue_overlay_ready', rawData => {
        const table = setAudienceTable(socket, 'overlay', rawData && typeof rawData === 'object' ? rawData.mesa : rawData);
        const inspection = clueInspections.get(table);
        if (inspection) socket.emit('clue_inspection_started', inspection);
    });

    socket.on('clue_inspection_start', rawData => {
        if (!rawData || typeof rawData !== 'object' || !rawData.clue) return;
        const code = normalizePlayerCode(rawData.codigo || socket.data.playerCode);
        const table = normalizeTableCode(rawData.mesa || socket.data.playerTable);
        const registeredCode = normalizePlayerCode(socket.data.playerCode);
        if (!code || (registeredCode && registeredCode !== code)) return;
        const clue = normalizeClueForInspection(rawData.clue);
        const inspection = {
            mesa: table,
            codigo: code,
            jogador: String(rawData.jogador || 'Jogador').slice(0, 120),
            clue,
            state: normalizeClueInspectionState({ ...rawData.state, type: clue.type })
        };
        clueInspections.set(table, inspection);
        io.to(tableRoom(table)).emit('clue_inspection_started', inspection);
    });

    socket.on('clue_inspection_update', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const code = normalizePlayerCode(rawData.codigo || socket.data.playerCode);
        const table = normalizeTableCode(rawData.mesa || socket.data.playerTable);
        const inspection = clueInspections.get(table);
        if (!inspection || inspection.codigo !== code) return;
        if (rawData.clueId && String(rawData.clueId) !== inspection.clue.id) return;
        inspection.state = normalizeClueInspectionState({ ...rawData.state, type: inspection.clue.type });
        io.to(tableRoom(table)).emit('clue_inspection_updated', {
            mesa: table,
            codigo: code,
            clueId: inspection.clue.id,
            state: inspection.state
        });
    });

    socket.on('clue_inspection_stop', rawData => {
        const source = rawData && typeof rawData === 'object' ? rawData : {};
        const code = normalizePlayerCode(source.codigo || socket.data.playerCode);
        const table = normalizeTableCode(source.mesa || socket.data.playerTable);
        const inspection = clueInspections.get(table);
        if (!inspection || inspection.codigo !== code) return;
        clueInspections.delete(table);
        io.to(tableRoom(table)).emit('clue_inspection_stopped', { mesa: table, codigo: code });
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
        leaveScreenShare(socket, true);
        unregisterPlayerSocket(socket, true);
        console.log('Conexao encerrada:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
