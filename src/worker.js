import { DurableObject } from 'cloudflare:workers';

const DEFAULT_TABLE = 'PADRAO';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

function normalizePlayerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function makeId(value) {
    const supplied = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    return supplied || crypto.randomUUID().replace(/-/g, '');
}

function binaryField(data) {
    if (!data || typeof data !== 'object') return null;
    for (const field of ['frame', 'chunk']) {
        const value = data[field];
        if (value instanceof ArrayBuffer) return { field, value };
        if (ArrayBuffer.isView(value)) {
            return { field, value: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) };
        }
    }
    return null;
}

function encodePacket(event, data) {
    const binary = binaryField(data);
    if (!binary) return JSON.stringify({ e: event, d: data });
    const cleanData = { ...data };
    delete cleanData[binary.field];
    const header = encoder.encode(JSON.stringify({ e: event, d: cleanData, b: binary.field }));
    const body = new Uint8Array(binary.value);
    const packet = new Uint8Array(5 + header.byteLength + body.byteLength);
    packet[0] = 1;
    new DataView(packet.buffer).setUint32(1, header.byteLength, false);
    packet.set(header, 5);
    packet.set(body, 5 + header.byteLength);
    return packet.buffer;
}

function decodePacket(raw) {
    if (typeof raw === 'string') return JSON.parse(raw);
    const bytes = raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    if (bytes.byteLength < 5 || bytes[0] !== 1) throw new Error('Invalid binary packet');
    const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, false);
    if (headerLength < 2 || 5 + headerLength > bytes.byteLength) throw new Error('Invalid packet header');
    const packet = JSON.parse(decoder.decode(bytes.subarray(5, 5 + headerLength)));
    packet.d = packet.d && typeof packet.d === 'object' ? packet.d : {};
    packet.d[packet.b] = bytes.slice(5 + headerLength).buffer;
    return packet;
}

function emptyInitiativeState() {
    return { entries: [], activeId: null, round: 0, started: false };
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

function normalizeScreenChatName(value) {
    return String(value || 'Espectador').trim().replace(/\s+/g, ' ').slice(0, 30) || 'Espectador';
}

function normalizeScreenChatText(value) {
    return String(value || '').replace(/\r\n?/g, '\n').trim().slice(0, 400);
}

function compactPlayer(data) {
    return {
        codigo: normalizePlayerCode(data && (data.codigo || data.id)),
        id: normalizePlayerCode(data && (data.codigo || data.id)),
        mesa: normalizeTableCode(data && data.mesa),
        nome: String(data && data.nome || '').slice(0, 120),
        foto: String(data && data.foto || '').slice(0, 1_700_000),
        corOverlay: String(data && data.corOverlay || '#8bccf6').slice(0, 24),
        nex: data && data.nex,
        defesa: data && data.defesa,
        vida_atual: data && data.vida_atual,
        vida_max: data && data.vida_max,
        sani_atual: data && data.sani_atual,
        sani_max: data && data.sani_max,
        modoCombate: Boolean(data && data.modoCombate),
        armaDisparoAtiva: data && data.armaDisparoAtiva || null,
        status: data && data.status || {},
        online: data && data.online !== false
    };
}

export class TableRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        this.table = DEFAULT_TABLE;
        this.players = new Map();
        this.initiative = emptyInitiativeState();
        this.lumina = { mesa: DEFAULT_TABLE, enabled: false, caseId: 'aurora-adelanio' };
        this.inspection = null;
        this.chat = [];
        this.relayMimeType = '';
        this.relayBootstrapChunk = null;

        ctx.blockConcurrencyWhile(async () => {
            this.table = normalizeTableCode(await ctx.storage.get('table'));
            const storedPlayers = await ctx.storage.list({ prefix: 'player:' });
            for (const [key, player] of storedPlayers) {
                this.players.set(key.slice(7), player);
            }
            this.initiative = await ctx.storage.get('initiative') || emptyInitiativeState();
            this.lumina = await ctx.storage.get('lumina') || { mesa: this.table, enabled: false, caseId: 'aurora-adelanio' };
            this.inspection = await ctx.storage.get('inspection') || null;
            this.chat = await ctx.storage.get('screen-chat') || [];
        });
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected WebSocket', { status: 426 });
        }
        const url = new URL(request.url);
        const requestedTable = normalizeTableCode(url.searchParams.get('mesa'));
        if (this.table === DEFAULT_TABLE && requestedTable !== this.table) {
            this.table = requestedTable;
            await this.ctx.storage.put('table', this.table);
            this.lumina.mesa = this.table;
        }

        const [client, server] = Object.values(new WebSocketPair());
        const id = makeId(url.searchParams.get('client'));
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({
            id,
            isMaster: false,
            isOverlay: false,
            isLumina: false,
            playerCode: '',
            screenShareJoined: false,
            screenShareRole: '',
            screenShareSpectator: url.searchParams.get('screenShareMode') === 'spectator',
            lastScreenChatAt: 0,
            lastScreenShareRetryAt: 0
        });
        return new Response(null, { status: 101, webSocket: client });
    }

    meta(ws) {
        return ws.deserializeAttachment() || {};
    }

    updateMeta(ws, changes) {
        const next = { ...this.meta(ws), ...changes };
        ws.serializeAttachment(next);
        return next;
    }

    sockets() {
        return this.ctx.getWebSockets();
    }

    send(ws, event, data) {
        if (!ws || ws.readyState !== 1) return;
        try { ws.send(encodePacket(event, data)); } catch (error) {}
    }

    sendToId(id, event, data) {
        const target = this.sockets().find(ws => this.meta(ws).id === id);
        if (target) this.send(target, event, data);
    }

    broadcast(event, data, predicate = null) {
        for (const ws of this.sockets()) {
            const meta = this.meta(ws);
            if (!predicate || predicate(meta, ws)) this.send(ws, event, data);
        }
    }

    playerSockets(code) {
        const normalized = normalizePlayerCode(code);
        return this.sockets().filter(ws => this.meta(ws).playerCode === normalized);
    }

    screenState() {
        let broadcasterId = null;
        const viewers = new Set();
        const fallbackViewers = new Set();
        for (const ws of this.sockets()) {
            const meta = this.meta(ws);
            if (meta.screenShareRole === 'broadcaster') broadcasterId = meta.id;
            if (meta.screenShareRole === 'viewer' || meta.screenShareRole === 'fallback') viewers.add(meta.id);
            if (meta.screenShareRole === 'fallback') fallbackViewers.add(meta.id);
        }
        return { broadcasterId, viewers, fallbackViewers };
    }

    broadcastScreen(event, data) {
        this.broadcast(event, data, meta => meta.screenShareJoined);
    }

    emitScreenState() {
        const room = this.screenState();
        this.broadcastScreen('screen_share_state', {
            mesa: this.table,
            active: Boolean(room.broadcasterId),
            viewers: room.viewers.size
        });
    }

    emitFallbackCount() {
        const room = this.screenState();
        if (!room.fallbackViewers.size) {
            this.relayMimeType = '';
            this.relayBootstrapChunk = null;
        }
        if (room.broadcasterId) {
            this.sendToId(room.broadcasterId, 'screen_share_fallback_count', {
                mesa: this.table,
                count: room.fallbackViewers.size
            });
        }
    }

    async persistPlayer(player) {
        const compact = compactPlayer(player);
        if (!compact.codigo) return;
        try { await this.ctx.storage.put(`player:${compact.codigo}`, compact); } catch (error) {}
    }

    async persistInspection() {
        try {
            if (!this.inspection) {
                await this.ctx.storage.delete('inspection');
                return;
            }
            const serialized = JSON.stringify(this.inspection);
            if (encoder.encode(serialized).byteLength < 1_900_000) {
                await this.ctx.storage.put('inspection', this.inspection);
            }
        } catch (error) {}
    }

    async webSocketMessage(ws, rawMessage) {
        let packet;
        try { packet = decodePacket(rawMessage); } catch (error) { return; }
        if (!packet || typeof packet.e !== 'string') return;
        await this.handleEvent(ws, packet.e, packet.d);
    }

    async handleEvent(ws, event, rawData) {
        const data = rawData && typeof rawData === 'object' ? rawData : rawData;
        let meta = this.meta(ws);

        if (event === 'master_ready') {
            meta = this.updateMeta(ws, { isMaster: true });
            this.send(ws, 'players_snapshot', [...this.players.values()].filter(player => player && player.online !== false));
            this.send(ws, 'initiative_state_updated', this.initiative);
            this.send(ws, 'lumina_state_updated', this.lumina);
            return;
        }

        if (event === 'lumina_ready') {
            this.updateMeta(ws, { isLumina: true });
            this.send(ws, 'lumina_state_updated', this.lumina);
            return;
        }

        if (event === 'lumina_master_set') {
            if (!meta.isMaster || !data || typeof data !== 'object') return;
            this.lumina = { mesa: this.table, enabled: Boolean(data.enabled), caseId: 'aurora-adelanio' };
            await this.ctx.storage.put('lumina', this.lumina);
            this.broadcast('lumina_state_updated', this.lumina);
            return;
        }

        if (event === 'overlay_ready' || event === 'clue_overlay_ready') {
            this.updateMeta(ws, { isOverlay: true });
            if (event === 'overlay_ready') {
                this.send(ws, 'players_snapshot', [...this.players.values()]);
                this.send(ws, 'initiative_state_updated', this.initiative);
            }
            if (this.inspection) this.send(ws, 'clue_inspection_started', this.inspection);
            return;
        }

        if (event === 'screen_share_join') {
            meta = this.updateMeta(ws, { screenShareJoined: true });
            const room = this.screenState();
            this.send(ws, 'screen_share_state', { mesa: this.table, active: Boolean(room.broadcasterId), viewers: room.viewers.size });
            this.send(ws, 'screen_share_chat_history', { mesa: this.table, messages: this.chat });
            if (room.broadcasterId && room.broadcasterId !== meta.id) {
                this.send(ws, 'screen_share_available', { mesa: this.table, broadcasterId: room.broadcasterId });
            }
            return;
        }

        if (event === 'screen_share_chat_send') {
            if (!meta.screenShareJoined || !data || typeof data !== 'object') return;
            const text = normalizeScreenChatText(data.text);
            if (!text) return;
            const now = Date.now();
            if (now - Number(meta.lastScreenChatAt || 0) < 350) return;
            meta = this.updateMeta(ws, { lastScreenChatAt: now });
            const message = {
                id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                mesa: this.table,
                senderId: meta.id,
                name: normalizeScreenChatName(data.name),
                text,
                createdAt: now
            };
            this.chat.push(message);
            if (this.chat.length > 120) this.chat.splice(0, this.chat.length - 120);
            await this.ctx.storage.put('screen-chat', this.chat);
            this.broadcastScreen('screen_share_chat_message', message);
            return;
        }

        if (event === 'screen_share_start') {
            if (meta.screenShareSpectator) {
                this.send(ws, 'screen_share_start_denied', { mesa: this.table, reason: 'spectator' });
                return;
            }
            if (!meta.screenShareJoined) meta = this.updateMeta(ws, { screenShareJoined: true });
            const room = this.screenState();
            if (room.broadcasterId && room.broadcasterId !== meta.id) {
                this.sendToId(room.broadcasterId, 'screen_share_replaced', { mesa: this.table });
                this.broadcastScreen('screen_share_ended', { mesa: this.table, reason: 'replaced' });
                for (const target of this.sockets()) {
                    const targetMeta = this.meta(target);
                    if (targetMeta.screenShareRole) this.updateMeta(target, { screenShareRole: '' });
                }
            }
            this.updateMeta(ws, { screenShareRole: 'broadcaster' });
            this.broadcastScreen('screen_share_available', { mesa: this.table, broadcasterId: meta.id });
            this.emitScreenState();
            return;
        }

        if (event === 'screen_share_watch') {
            if (!meta.screenShareJoined) return;
            const room = this.screenState();
            if (!room.broadcasterId || room.broadcasterId === meta.id) return;
            const wasViewer = room.viewers.has(meta.id);
            const retryRequested = Boolean(data && data.retry === true);
            const now = Date.now();
            const retryAllowed = retryRequested && now - Number(meta.lastScreenShareRetryAt || 0) >= 4000;
            this.updateMeta(ws, {
                screenShareRole: 'viewer',
                lastScreenShareRetryAt: retryAllowed ? now : meta.lastScreenShareRetryAt
            });
            if (!wasViewer || retryAllowed) {
                this.sendToId(room.broadcasterId, 'screen_share_viewer_joined', { mesa: this.table, viewerId: meta.id });
                if (!wasViewer) this.emitScreenState();
            }
            return;
        }

        if (event === 'screen_share_offer') {
            if (!data || typeof data !== 'object') return;
            const room = this.screenState();
            const target = String(data.target || '');
            if (room.broadcasterId !== meta.id || !room.viewers.has(target)) return;
            this.sendToId(target, 'screen_share_offer', { mesa: this.table, broadcasterId: meta.id, sdp: data.sdp });
            return;
        }

        if (event === 'screen_share_answer') {
            if (!data || typeof data !== 'object') return;
            const room = this.screenState();
            const target = String(data.target || '');
            if (room.broadcasterId !== target || !room.viewers.has(meta.id)) return;
            this.sendToId(target, 'screen_share_answer', { mesa: this.table, viewerId: meta.id, sdp: data.sdp });
            return;
        }

        if (event === 'screen_share_ice') {
            if (!data || typeof data !== 'object') return;
            const room = this.screenState();
            const target = String(data.target || '');
            const validPair = room.broadcasterId === meta.id
                ? room.viewers.has(target)
                : room.broadcasterId === target && room.viewers.has(meta.id);
            if (!validPair) return;
            this.sendToId(target, 'screen_share_ice', { mesa: this.table, from: meta.id, candidate: data.candidate });
            return;
        }

        if (event === 'screen_share_fallback_request') {
            const room = this.screenState();
            if (!room.broadcasterId || !room.viewers.has(meta.id)) return;
            const alreadyFallback = room.fallbackViewers.has(meta.id);
            this.updateMeta(ws, { screenShareRole: 'fallback' });
            if (!alreadyFallback) {
                if (this.relayMimeType) {
                    this.send(ws, 'screen_share_relay_reset', { mesa: this.table, mimeType: this.relayMimeType });
                    if (this.relayBootstrapChunk) {
                        this.send(ws, 'screen_share_relay_chunk', { mesa: this.table, chunk: this.relayBootstrapChunk });
                    }
                }
                this.emitFallbackCount();
            }
            return;
        }

        if (event === 'screen_share_peer_connected') {
            if (meta.screenShareRole === 'fallback') {
                this.updateMeta(ws, { screenShareRole: 'viewer' });
                this.emitFallbackCount();
            }
            return;
        }

        if (event === 'screen_share_relay_selected') {
            const room = this.screenState();
            if (!room.broadcasterId || meta.screenShareRole !== 'fallback') return;
            this.sendToId(room.broadcasterId, 'screen_share_viewer_left', { viewerId: meta.id, relay: true });
            return;
        }

        if (event === 'screen_share_frame') {
            if (!data || typeof data !== 'object' || !data.frame) return;
            const room = this.screenState();
            const byteLength = Number(data.frame.byteLength || 0);
            if (room.broadcasterId !== meta.id || !byteLength || byteLength > 2 * 1024 * 1024) return;
            for (const targetId of room.fallbackViewers) {
                this.sendToId(targetId, 'screen_share_frame', {
                    mesa: this.table,
                    frame: data.frame,
                    mimeType: String(data.mimeType || 'image/webp').slice(0, 40)
                });
            }
            return;
        }

        if (event === 'screen_share_relay_reset') {
            if (!data || typeof data !== 'object') return;
            const room = this.screenState();
            if (room.broadcasterId !== meta.id) return;
            const mimeType = String(data.mimeType || '').slice(0, 100);
            if (!/^video\/webm/i.test(mimeType)) return;
            this.relayMimeType = mimeType;
            this.relayBootstrapChunk = null;
            for (const targetId of room.fallbackViewers) {
                this.sendToId(targetId, 'screen_share_relay_reset', { mesa: this.table, mimeType });
            }
            return;
        }

        if (event === 'screen_share_relay_chunk') {
            if (!data || typeof data !== 'object' || !data.chunk) return;
            const room = this.screenState();
            const byteLength = Number(data.chunk.byteLength || 0);
            if (room.broadcasterId !== meta.id || !byteLength || byteLength > 10 * 1024 * 1024) return;
            if (!this.relayBootstrapChunk) this.relayBootstrapChunk = data.chunk;
            for (const targetId of room.fallbackViewers) {
                this.sendToId(targetId, 'screen_share_relay_chunk', { mesa: this.table, chunk: data.chunk });
            }
            return;
        }

        if (event === 'screen_share_relay_failed') {
            const room = this.screenState();
            if (!room.broadcasterId || meta.screenShareRole !== 'fallback') return;
            this.sendToId(room.broadcasterId, 'screen_share_relay_failed', { mesa: this.table, viewerId: meta.id });
            return;
        }

        if (event === 'screen_share_stop') {
            const room = this.screenState();
            if (room.broadcasterId !== meta.id) return;
            for (const target of this.sockets()) {
                const targetMeta = this.meta(target);
                if (targetMeta.screenShareRole) this.updateMeta(target, { screenShareRole: '' });
            }
            this.relayMimeType = '';
            this.relayBootstrapChunk = null;
            this.broadcastScreen('screen_share_ended', { mesa: this.table });
            this.emitScreenState();
            return;
        }

        if (event === 'clue_inspection_start') {
            if (!data || typeof data !== 'object' || !data.clue) return;
            const code = normalizePlayerCode(data.codigo || meta.playerCode);
            const registeredCode = normalizePlayerCode(meta.playerCode);
            if (!code || (registeredCode && registeredCode !== code)) return;
            const clue = normalizeClueForInspection(data.clue);
            this.inspection = {
                mesa: this.table,
                codigo: code,
                jogador: String(data.jogador || 'Jogador').slice(0, 120),
                clue,
                state: normalizeClueInspectionState({ ...data.state, type: clue.type })
            };
            await this.persistInspection();
            this.broadcast('clue_inspection_started', this.inspection);
            return;
        }

        if (event === 'clue_inspection_update') {
            if (!data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || meta.playerCode);
            if (!this.inspection || this.inspection.codigo !== code) return;
            if (data.clueId && String(data.clueId) !== this.inspection.clue.id) return;
            this.inspection.state = normalizeClueInspectionState({ ...data.state, type: this.inspection.clue.type });
            this.broadcast('clue_inspection_updated', {
                mesa: this.table,
                codigo: code,
                clueId: this.inspection.clue.id,
                state: this.inspection.state
            });
            return;
        }

        if (event === 'clue_inspection_stop') {
            const source = data && typeof data === 'object' ? data : {};
            const code = normalizePlayerCode(source.codigo || meta.playerCode);
            if (!this.inspection || this.inspection.codigo !== code) return;
            this.inspection = null;
            await this.persistInspection();
            this.broadcast('clue_inspection_stopped', { mesa: this.table, codigo: code });
            return;
        }

        if (event === 'initiative_state_change') {
            if (!meta.isMaster) return;
            this.initiative = normalizeInitiativeState(data);
            await this.ctx.storage.put('initiative', this.initiative);
            this.broadcast('initiative_state_updated', this.initiative);
            return;
        }

        if (event === 'status_change') {
            if (!data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || data.id);
            if (!code) return;
            meta = this.updateMeta(ws, { playerCode: code });
            const player = { ...data, codigo: code, id: code, mesa: this.table, online: true };
            this.players.set(code, player);
            await this.persistPlayer(player);
            this.broadcast('update_mestre', player);
            return;
        }

        if (event === 'master_update_player') {
            if (!meta.isMaster || !data || typeof data !== 'object' || !data.fullData) return;
            const code = normalizePlayerCode(data.codigo || data.id);
            if (!code) return;
            const previous = this.players.get(code) || {};
            const player = { ...previous, ...data, codigo: code, id: code, mesa: this.table, online: true };
            this.players.set(code, player);
            await this.persistPlayer(player);
            for (const target of this.playerSockets(code)) this.send(target, 'player_data_updated', player);
            this.broadcast('update_mestre', player);
            return;
        }

        if (event === 'grant_catalog_item') {
            if (!meta.isMaster || !data || typeof data !== 'object') return;
            const rawItem = data.item;
            if (!rawItem || typeof rawItem !== 'object') return;
            const name = String(rawItem.n || '').trim().slice(0, 120);
            if (!name) return;
            const recipients = new Set((Array.isArray(data.codigos) ? data.codigos : []).map(normalizePlayerCode).filter(Boolean));
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
            for (const target of this.sockets()) {
                const targetMeta = this.meta(target);
                if (!targetMeta.playerCode || (recipients.size && !recipients.has(targetMeta.playerCode))) continue;
                this.send(target, 'catalog_item_granted', { item });
            }
            return;
        }

        if (event === 'rolagem_feita') {
            if (!data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || meta.playerCode);
            const rollData = { ...data, codigo: code, mesa: this.table };
            this.broadcast('novo_log', rollData);
            if (code && /^iniciativa\b/i.test(String(data.acao || '').trim())) {
                this.broadcast('initiative_rolled', rollData);
            }
            return;
        }

        if (event === 'request_player') {
            const source = data && typeof data === 'object' ? data : { codigo: data };
            const code = normalizePlayerCode(source.codigo || source.id);
            const player = this.players.get(code);
            if (player) this.send(ws, 'update_mestre', player);
            if (!player || !player.fullData) {
                for (const target of this.playerSockets(code)) this.send(target, 'sync_requested', { mesa: this.table, codigo: code });
            }
        }
    }

    async cleanupSocket(ws) {
        const meta = this.meta(ws);
        if (meta.screenShareRole === 'broadcaster') {
            for (const target of this.sockets()) {
                if (target === ws) continue;
                const targetMeta = this.meta(target);
                if (targetMeta.screenShareRole) this.updateMeta(target, { screenShareRole: '' });
            }
            this.relayMimeType = '';
            this.relayBootstrapChunk = null;
            this.broadcastScreen('screen_share_ended', { mesa: this.table });
            this.emitScreenState();
        } else if (meta.screenShareRole === 'viewer' || meta.screenShareRole === 'fallback') {
            const room = this.screenState();
            if (room.broadcasterId) this.sendToId(room.broadcasterId, 'screen_share_viewer_left', { viewerId: meta.id });
            this.emitFallbackCount();
            this.emitScreenState();
        }

        const code = normalizePlayerCode(meta.playerCode);
        if (!code) return;
        const hasOtherSocket = this.sockets().some(target => target !== ws && this.meta(target).playerCode === code);
        if (hasOtherSocket) return;
        const player = this.players.get(code);
        if (player) {
            player.online = false;
            this.players.set(code, player);
            await this.persistPlayer(player);
            this.broadcast('player_disconnected', { codigo: code, mesa: this.table });
        }
        if (this.inspection && this.inspection.codigo === code) {
            this.inspection = null;
            await this.persistInspection();
            this.broadcast('clue_inspection_stopped', { mesa: this.table, codigo: code, reason: 'disconnect' });
        }
    }

    async webSocketClose(ws) {
        await this.cleanupSocket(ws);
    }

    async webSocketError(ws) {
        await this.cleanupSocket(ws);
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return Response.json({ ok: true, realtime: true });
        }
        if (url.pathname === '/ws') {
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426 });
            }
            const table = normalizeTableCode(url.searchParams.get('mesa'));
            return env.TABLE_ROOMS.getByName(table).fetch(request);
        }
        if (url.pathname === '/socket.io/socket.io.js') {
            const assetUrl = new URL('/realtime-client.js', url);
            return env.ASSETS.fetch(new Request(assetUrl, request));
        }
        return env.ASSETS.fetch(request);
    }
};
