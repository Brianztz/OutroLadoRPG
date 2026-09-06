(function bootstrapOutroLadoRealtime(global) {
    'use strict';

    if (typeof global.io === 'function') return;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const BINARY_FIELDS = ['frame', 'chunk'];

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

    function makeClientId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return global.crypto.randomUUID().replace(/-/g, '');
        }
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }

    function binaryField(data) {
        if (!data || typeof data !== 'object') return null;
        for (const field of BINARY_FIELDS) {
            const value = data[field];
            if (value instanceof ArrayBuffer) return { field, value };
            if (ArrayBuffer.isView(value)) {
                return {
                    field,
                    value: value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
                };
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
        if (bytes.byteLength < 5 || bytes[0] !== 1) throw new Error('Pacote em tempo real invalido.');
        const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, false);
        if (headerLength < 2 || 5 + headerLength > bytes.byteLength) throw new Error('Cabecalho invalido.');
        const packet = JSON.parse(decoder.decode(bytes.subarray(5, 5 + headerLength)));
        packet.d = packet.d && typeof packet.d === 'object' ? packet.d : {};
        packet.d[packet.b] = bytes.slice(5 + headerLength).buffer;
        return packet;
    }

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
            const urlTable = new URL(global.location.href).searchParams.get('mesa');
            this._table = normalizeTableCode(urlTable || 'PADRAO');
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
            if (this._socket) this._socket.close(1000, 'client disconnect');
            return this;
        }

        _dispatch(event, data) {
            const handlers = this._handlers.get(event);
            if (!handlers) return;
            [...handlers].forEach(handler => {
                try { handler(data); } catch (error) { setTimeout(() => { throw error; }, 0); }
            });
        }

        _send(packet) {
            try {
                if (packet.volatile && this._socket.bufferedAmount > 2 * 1024 * 1024) return;
                this._socket.send(encodePacket(packet.event, packet.data));
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

        _open() {
            if (this._manualClose) return;
            const generation = ++this._generation;
            const protocol = global.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const url = new URL('/ws', global.location.href);
            url.protocol = protocol;
            url.searchParams.set('mesa', this._table);
            url.searchParams.set('client', this.id);
            if (this.auth.screenShareMode) url.searchParams.set('screenShareMode', String(this.auth.screenShareMode));

            const socket = new WebSocket(url.href);
            socket.binaryType = 'arraybuffer';
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

            socket.addEventListener('close', () => {
                if (generation !== this._generation) return;
                const wasConnected = this.connected;
                this.connected = false;
                if (wasConnected) this._dispatch('disconnect');
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
})(window);
