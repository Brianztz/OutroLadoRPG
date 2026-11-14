(function bootstrapOutroLadoRealtime(global) {
    'use strict';

    if (typeof global.io === 'function') return;

    const PLAYER_DISCONNECT_GRACE_MS = 4500;
    const GUARDED_PAGE = /\/(?:ficha|ficha-temporada|mestre|mestre-temporada)(?:\.html)?\/?$/i.test(global.location.pathname);
    const PLAYER_PAGE = /\/(?:ficha|ficha-temporada)(?:\.html)?\/?$/i.test(global.location.pathname);

    function normalizeTableCode(value) {
        const normalized = String(value || 'PADRAO')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
        return normalized || 'PADRAO';
    }

    function normalizePlayerCode(value) {
        return String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '')
            .slice(0, 40);
    }

    function makeClientId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return global.crypto.randomUUID().replace(/-/g, '');
        }
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }

    function encodePacket(event, data) { return JSON.stringify({ e: event, d: data }); }

    function decodePacket(raw) { return JSON.parse(raw); }

    class RealtimeSocket {
        constructor(options = {}) {
            this.auth = options && options.auth && typeof options.auth === 'object' ? options.auth : {};
            this.connected = false;
            this.id = makeClientId();
            this._handlers = new Map();
            this._queue = [];
            this._socket = null;
            this._manualClose = false;
            this._volatileNext = false;
            this._reconnectTimer = null;
            this._reconnectAttempts = 0;
            this._generation = 0;
            this._disconnectTimers = new Map();
            const urlTable = new URL(global.location.href).searchParams.get('mesa');
            this._table = normalizeTableCode(urlTable || 'PADRAO');
            this._season = Boolean(global.OLSeasonSpace && global.OLSeasonSpace.isSeasonPage());
            this._open();
        }

        get volatile() {
            this._volatileNext = true;
            return this;
        }

        on(event, handler) {
            if (typeof handler !== 'function') return this;
            if (!this._handlers.has(event)) this._handlers.set(event, new Set());
            this._handlers.get(event).add(handler);
            return this;
        }

        once(event, handler) {
            if (typeof handler !== 'function') return this;
            const wrapped = (...args) => {
                this.off(event, wrapped);
                handler(...args);
            };
            return this.on(event, wrapped);
        }

        off(event, handler) {
            if (!event) {
                this._handlers.clear();
                return this;
            }
            const handlers = this._handlers.get(event);
            if (!handlers) return this;
            if (typeof handler === 'function') handlers.delete(handler);
            else handlers.clear();
            if (!handlers.size) this._handlers.delete(event);
            return this;
        }

        emit(event, data) {
            if (typeof event !== 'string' || !event) return this;
            const volatile = this._volatileNext;
            this._volatileNext = false;
            const requestedTable = data && typeof data === 'object' && data.mesa
                ? normalizeTableCode(data.mesa)
                : this._table;
            const packet = { event, data, volatile };

            if (requestedTable !== this._table) {
                this._table = requestedTable;
                this._queue.push(packet);
                this._restart();
                return this;
            }
            if (!this.connected || !this._socket || this._socket.readyState !== WebSocket.OPEN) {
                if (!volatile) this._queue.push(packet);
                return this;
            }
            this._send(packet);
            return this;
        }

        connect() {
            if (this.connected || (this._socket && this._socket.readyState === WebSocket.CONNECTING)) return this;
            this._manualClose = false;
            this._open();
            return this;
        }

        disconnect() {
            this._manualClose = true;
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
            this._disconnectTimers.forEach(timer => clearTimeout(timer));
            this._disconnectTimers.clear();
            if (this._socket) this._socket.close(1000, 'client disconnect');
            return this;
        }

        _playerEventKey(data) {
            if (!data || typeof data !== 'object') return '';
            const code = normalizePlayerCode(data.codigo || data.id);
            if (!code) return '';
            return `${normalizeTableCode(data.mesa || this._table)}::${code}`;
        }

        _handlePlayerKick(data = {}) {
            if (!PLAYER_PAGE) return false;
            this._manualClose = true;
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
            try { global.sessionStorage.removeItem('ol_firebase_portal_access'); } catch (error) {}
            const table = normalizeTableCode(data && data.mesa || this._table);
            const url = new URL('./index.html', global.location.href);
            url.search = '';
            url.searchParams.set('mesa', table);
            if (this._season) url.searchParams.set('temporada', '2');
            url.searchParams.set('aviso', 'Você foi removido desta mesa pelo mestre.');
            global.setTimeout(() => global.location.replace(url.href), 0);
            return true;
        }

        _dispatchNow(event, data) {
            const handlers = this._handlers.get(event);
            if (!handlers) return;
            [...handlers].forEach(handler => {
                try { handler(data); } catch (error) { setTimeout(() => { throw error; }, 0); }
            });
        }

        _dispatch(event, originalData) {
            // The server knows only the physical room. Expose the friendly room
            // name to the unchanged sheet, master and overlay event handlers.
            const translate = value => {
                if (!this._season || !value || typeof value !== 'object') return value;
                if (Array.isArray(value)) return value.map(translate);
                const next = { ...value };
                if (typeof next.mesa === 'string' &&
                    next.mesa === global.OLSeasonSpace.tableId(this._table, 'temporada')) {
                    next.mesa = this._table;
                }
                return next;
            };
            const data = translate(originalData);
            if (event === 'player_kicked' && this._handlePlayerKick(data)) return;
            const playerKey = this._playerEventKey(data);

            if (event === 'player_disconnected' && playerKey) {
                const previousTimer = this._disconnectTimers.get(playerKey);
                if (previousTimer) clearTimeout(previousTimer);
                this._disconnectTimers.delete(playerKey);
                if (data && data.reason === 'removed_by_master') {
                    // Expulsão é definitiva; não aguardar a tolerância de
                    // desconexões breves usada para quedas normais da rede.
                    this._dispatchNow(event, data);
                    return;
                }
                const timer = setTimeout(() => {
                    this._disconnectTimers.delete(playerKey);
                    this._dispatchNow(event, data);
                }, PLAYER_DISCONNECT_GRACE_MS);
                this._disconnectTimers.set(playerKey, timer);
                return;
            }

            if (playerKey && (event === 'update_mestre' || event === 'player_connected')) {
                const pendingDisconnect = this._disconnectTimers.get(playerKey);
                if (pendingDisconnect) {
                    clearTimeout(pendingDisconnect);
                    this._disconnectTimers.delete(playerKey);
                }
            }

            this._dispatchNow(event, data);
        }

        _send(packet) {
            try {
                if (packet.volatile && this._socket.bufferedAmount > 2 * 1024 * 1024) return;
                let data = packet.data;
                if (this._season && data && typeof data === 'object' && !Array.isArray(data)) {
                    const logical = normalizeTableCode(data.mesa || this._table);
                    data = { ...data, mesa: global.OLSeasonSpace.tableId(logical, 'temporada') };
                }
                this._socket.send(encodePacket(packet.event, data));
            } catch (error) {
                if (!packet.volatile) this._queue.unshift(packet);
            }
        }

        _restart() {
            this._generation += 1;
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
            if (this._socket) {
                try { this._socket.close(1000, 'change table'); } catch (error) {}
            }
            this.connected = false;
            this.id = makeClientId();
            this._open();
        }

        async _firebaseToken() {
            let token = '';

            if (GUARDED_PAGE && global.OLFirebase && typeof global.OLFirebase.getCurrentUser === 'function') {
                try {
                    const user = await global.OLFirebase.getCurrentUser();
                    if (!user) return '';
                    if (typeof global.OLFirebase.refreshRealtimeToken === 'function') {
                        token = String(await global.OLFirebase.refreshRealtimeToken(user, false) || '');
                    }
                } catch (error) {
                    console.warn('Nao foi possivel preparar a autenticacao em tempo real:', error);
                }
            }

            if (!token) {
                try { token = String(global.sessionStorage.getItem('ol_firebase_id_token') || ''); } catch (error) {}
            }
            return token;
        }

        async _open() {
            if (this._manualClose) return;
            const generation = ++this._generation;
            const firebaseToken = await this._firebaseToken();
            if (generation !== this._generation || this._manualClose) return;

            // Native HttpOnly sessions can authorize a room without Firebase ID tokens.
            // This remains a fallback while older pages still use Firebase authentication.
            let nativeAuthorized = false;
            if (GUARDED_PAGE && !firebaseToken && global.OLNative) {
                try {
                    const physicalTable = this._season
                        ? global.OLSeasonSpace.tableId(this._table, 'temporada')
                        : this._table;
                    const session = await global.OLNative.getSession(physicalTable);
                    nativeAuthorized = Boolean(session?.ok);
                } catch (error) {}
            }
            if (generation !== this._generation || this._manualClose) return;
            if (GUARDED_PAGE && global.OLFirebase && !firebaseToken && !nativeAuthorized) {
                this._scheduleReconnect();
                return;
            }

            const protocol = global.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = new URL('/ws', global.location.href);
            url.protocol = protocol;
            url.searchParams.set('mesa', this._season
                ? global.OLSeasonSpace.tableId(this._table, 'temporada')
                : this._table);
            url.searchParams.set('client', this.id);

            const protocols = firebaseToken ? ['ol-v1', `firebase.${firebaseToken}`] : [];
            const socket = protocols.length ? new WebSocket(url.href, protocols) : new WebSocket(url.href);
            this._socket = socket;

            socket.addEventListener('open', () => {
                if (generation !== this._generation) return;
                this.connected = true;
                this._reconnectAttempts = 0;
                const queued = this._queue.splice(0);
                queued.forEach(packet => this._send(packet));
                this._dispatch('connect');

            });

            socket.addEventListener('message', message => {
                if (generation !== this._generation) return;
                try {
                    const packet = decodePacket(message.data);
                    if (packet && typeof packet.e === 'string') this._dispatch(packet.e, packet.d);
                } catch (error) {
                    console.warn('Mensagem em tempo real ignorada:', error);
                }
            });

            socket.addEventListener('close', closeEvent => {
                if (generation !== this._generation) return;
                const wasConnected = this.connected;
                this.connected = false;
                if (wasConnected) this._dispatch('disconnect');
                if (Number(closeEvent && closeEvent.code) === 4003 && this._handlePlayerKick({ mesa: this._table })) return;
                if (!this._manualClose) this._scheduleReconnect();
            });

            socket.addEventListener('error', () => {
                if (generation !== this._generation) return;
                try { socket.close(); } catch (error) {}
            });
        }

        _scheduleReconnect() {
            if (this._manualClose || this._reconnectTimer) return;
            const delay = Math.min(5000, 350 * (2 ** Math.min(this._reconnectAttempts, 4)));
            this._reconnectAttempts += 1;
            this._reconnectTimer = setTimeout(() => {
                this._reconnectTimer = null;
                this.id = makeClientId();
                this._open();
            }, delay);
        }
    }

    global.io = options => new RealtimeSocket(options);
    global.io.__olSeasonAware = true;
})(window);
