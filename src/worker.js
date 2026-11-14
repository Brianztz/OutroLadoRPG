import { DurableObject } from 'cloudflare:workers';
import { handleStorageRequest } from './storage-api.js';
import { currentSession, handleSessionRequest } from './session-api.js';
import { handleMasterRoomRequest } from './master-room-api.js';

const DEFAULT_TABLE = 'PADRAO';
const encoder = new TextEncoder();
function requestProtocols(request) {
    return String(request.headers.get('Sec-WebSocket-Protocol') || '')
        .split(',').map(v => v.trim()).filter(Boolean);
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

function normalizePlayerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function makeId(value) {
    const supplied = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    return supplied || crypto.randomUUID().replace(/-/g, '');
}

function encodePacket(event, data) { return JSON.stringify({ e: event, d: data }); }

    function decodePacket(raw) { return JSON.parse(raw); }

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

function compactPlayer(data) {
    return {
        codigo: normalizePlayerCode(data && (data.codigo || data.id)),
        id: normalizePlayerCode(data && (data.codigo || data.id)),
        mesa: normalizeTableCode(data && data.mesa),
        sheetType: data && data.sheetType === 'temporada' ? 'temporada' : 'classic',
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

        ctx.blockConcurrencyWhile(async () => {
            this.table = normalizeTableCode(await ctx.storage.get('table'));
            const storedPlayers = await ctx.storage.list({ prefix: 'player:' });
            for (const [key, player] of storedPlayers) {
                this.players.set(key.slice(7), player);
            }
            this.initiative = await ctx.storage.get('initiative') || emptyInitiativeState();
            this.lumina = await ctx.storage.get('lumina') || { mesa: this.table, enabled: false, caseId: 'aurora-adelanio' };
            this.inspection = await ctx.storage.get('inspection') || null;
        });
    }

    async fetch(request) {
        if (new URL(request.url).pathname === '/api/master-room') {
            return handleMasterRoomRequest(request, this.ctx, this.env);
        }
        if (new URL(request.url).pathname === '/api/session') {
            return handleSessionRequest(request, this.ctx, this.env);
        }
        if (new URL(request.url).pathname === '/api/storage') {
            return handleStorageRequest(request, this.ctx, this.env);
        }
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected WebSocket', { status: 426 });
        }
        const url = new URL(request.url);
        const protocols = requestProtocols(request);
        const nativeSession = await currentSession(request, this.ctx);
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
            authenticated: Boolean(nativeSession),
            isMaster: nativeSession?.role === 'master',
            nativeRole: nativeSession?.role || '',
            nativeCode: nativeSession?.code || '',
            nativeEdition: nativeSession?.edition || '',
            nativeCredentialHash: nativeSession?.credentialHash || '',
            isOverlay: false,
            isLumina: false,
            playerCode: ''
        });
        const headers = protocols.includes('ol-v1') ? { 'Sec-WebSocket-Protocol': 'ol-v1' } : undefined;
        return new Response(null, { status: 101, webSocket: client, headers });
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

    broadcast(event, data, predicate = null) {
        const packet = encodePacket(event, data);
        for (const ws of this.sockets()) {
            const meta = this.meta(ws);
            if (ws.readyState !== 1 || (predicate && !predicate(meta, ws))) continue;
            try { ws.send(packet); } catch (error) {}
        }
    }

    playerSockets(code) {
        const normalized = normalizePlayerCode(code);
        return this.sockets().filter(ws => this.meta(ws).playerCode === normalized);
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
        if (meta.nativeRole === 'player') {
            const owner = await this.ctx.storage.get(
                'sheet:' + meta.nativeEdition + ':' + meta.nativeCode + ':owner-sha256');
            if (!owner || owner !== meta.nativeCredentialHash) {
                try { ws.close(4003, 'player access revoked'); } catch (_) {}
                return;
            }
            if (['status_change','rolagem_feita','clue_inspection_start',
                'clue_inspection_update','clue_inspection_stop'].includes(event)) {
                const code = normalizePlayerCode(
                    data && (data.codigo || data.id) || meta.playerCode || meta.nativeCode);
                if (code !== meta.nativeCode) return;
            }
        }


        if (event === 'master_ready') {
            if (!meta.isMaster) {
                this.send(ws, 'auth_error', { reason: 'master_required' });
                return;
            }
            this.send(ws, 'players_snapshot', [...this.players.values()].filter(player => player && player.online !== false));
            this.send(ws, 'initiative_state_updated', this.initiative);
            this.send(ws, 'lumina_state_updated', this.lumina);
            return;
        }

        if (event === 'kick_player') {
            if (!meta.isMaster || !data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || data.id);
            if (!code) return;

            const targets = this.playerSockets(code);
            for (const target of targets) {
                this.send(target, 'player_kicked', { mesa: this.table, codigo: code, reason: 'removed_by_master' });
                this.updateMeta(target, { playerCode: '' });
                try { target.close(4003, 'removed by master'); } catch (error) {}
            }

            this.players.delete(code);
            try { await this.ctx.storage.delete(`player:${code}`); } catch (error) {}
            if (this.inspection && this.inspection.codigo === code) {
                this.inspection = null;
                await this.persistInspection();
                this.broadcast('clue_inspection_stopped', { mesa: this.table, codigo: code, reason: 'removed_by_master' });
            }
            this.broadcast('player_disconnected', { codigo: code, mesa: this.table, reason: 'removed_by_master' });
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

        if (event === 'clue_inspection_start') {
            if (!meta.authenticated || !data || typeof data !== 'object' || !data.clue) return;
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
            if (!meta.authenticated || !data || typeof data !== 'object') return;
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
            if (!meta.authenticated) return;
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
            if (!meta.authenticated || !data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || data.id);
            if (!code) return;
            const registeredCode = normalizePlayerCode(meta.playerCode);
            if (registeredCode && registeredCode !== code) return;
            // Sinalize uma entrada nova apenas quando não houver outra aba ativa
            // deste jogador. Assim o overlay libera retratos ocultos após o
            // reingresso pelo convite, sem tratar cada edição da ficha como login.
            const freshConnection = registeredCode !== code
                && !this.playerSockets(code).some(target => target !== ws);
            meta = this.updateMeta(ws, { playerCode: code });
            const player = { ...data, codigo: code, id: code, mesa: this.table, online: true };
            this.players.set(code, player);
            await this.persistPlayer(player);
            if (freshConnection) {
                this.broadcast('player_connected', { codigo: code, mesa: this.table });
            }
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
            if (!meta.authenticated || !data || typeof data !== 'object') return;
            const code = normalizePlayerCode(data.codigo || meta.playerCode);
            const registeredCode = normalizePlayerCode(meta.playerCode);
            if (!code || (registeredCode && registeredCode !== code)) return;
            if (!registeredCode) meta = this.updateMeta(ws, { playerCode: code });
            const rollData = { ...data, codigo: code, mesa: this.table };
            this.broadcast('novo_log', rollData);
            if (code && /^iniciativa\b/i.test(String(data.acao || '').trim())) {
                this.broadcast('initiative_rolled', rollData);
            }
            return;
        }

        if (event === 'request_player') {
            if (!meta.isMaster) return;
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
        if (url.pathname === '/api/master-room') {
            // A fixed Durable Object holds the owner's code across devices and deployments.
            return env.TABLE_ROOMS.getByName('SYSTEM_MASTER_PROFILE_V1').fetch(request);
        }
        if (url.pathname === '/api/storage' || url.pathname === '/api/session') {
            const table = normalizeTableCode(url.searchParams.get('mesa'));
            return env.TABLE_ROOMS.getByName(table).fetch(request);
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
            const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
            const headers = new Headers(assetResponse.headers);
            headers.set('Cache-Control', 'no-store');
            return new Response(assetResponse.body, {
                status: assetResponse.status,
                statusText: assetResponse.statusText,
                headers
            });
        }
        if (url.pathname === '/ficha' || url.pathname === '/ficha/' || url.pathname === '/ficha.html') {
            const assetResponse = await env.ASSETS.fetch(request);
            const contentType = String(assetResponse.headers.get('content-type') || '');
            if (!assetResponse.ok || !contentType.includes('text/html')) return assetResponse;

            const html = await assetResponse.text();
            const playerOccupationScript = '<script defer src="/player-occupations.js?v=20261028-1"></script>'
                + '<script defer src="/occupation-picker.js?v=20261028-2"></script>'
                + '<script defer src="/character-toolbar.js?v=20261028-1"></script>'
                + '<script defer src="/vitals-alignment.js?v=20261028-3"></script>'
                + '<script defer src="/ritual-balance-runtime.js?v=20261028-1"></script>';
            const body = html.includes('</head>')
                ? html.replace('</head>', playerOccupationScript + '</head>')
                : playerOccupationScript + html;
            const headers = new Headers(assetResponse.headers);
            headers.delete('content-length');
            headers.set('Cache-Control', 'no-store');
            return new Response(body, {
                status: assetResponse.status,
                statusText: assetResponse.statusText,
                headers
            });
        }
        return env.ASSETS.fetch(request);
    }
};
