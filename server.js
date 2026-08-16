const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Mantém a ficha mais recente e todas as conexões ativas de cada jogador.
const playersData = new Map();
const playerSockets = new Map();

function normalizePlayerCode(value) {
    return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

function registerPlayerSocket(code, socket) {
    if (!playerSockets.has(code)) playerSockets.set(code, new Set());
    playerSockets.get(code).add(socket.id);
    socket.data.playerCode = code;
}

io.on('connection', socket => {
    console.log('🟢 Conexão aberta:', socket.id);

    // O Escudo do Mestre solicita automaticamente todos os jogadores já conectados.
    socket.on('master_ready', () => {
        socket.data.isMaster = true;
        socket.emit('players_snapshot', Array.from(playersData.values()));
    });

    // A própria ficha anuncia o jogador sempre que salva ou reconecta.
    socket.on('status_change', rawData => {
        const code = normalizePlayerCode(rawData && (rawData.codigo || rawData.id));
        if (!code || !rawData || typeof rawData !== 'object') return;

        registerPlayerSocket(code, socket);
        const data = { ...rawData, codigo: code, id: code, online: true };
        playersData.set(code, data);
        io.emit('update_mestre', data);
    });

    // Alterações feitas pelo mestre na ficha aberta são enviadas ao jogador real.
    socket.on('master_update_player', rawData => {
        const code = normalizePlayerCode(rawData && (rawData.codigo || rawData.id));
        if (!code || !rawData || typeof rawData !== 'object' || !rawData.fullData) return;

        const previousData = playersData.get(code) || {};
        const data = { ...previousData, ...rawData, codigo: code, id: code, online: true };
        playersData.set(code, data);

        const sockets = playerSockets.get(code);
        if (sockets) sockets.forEach(socketId => io.to(socketId).emit('player_data_updated', data));
        io.emit('update_mestre', data);
    });

    // Envia silenciosamente um item do catálogo para todos os jogadores conectados.
    socket.on('grant_catalog_item', rawData => {
        const rawItem = rawData && rawData.item;
        if (!rawItem || typeof rawItem !== 'object') return;
        const name = String(rawItem.n || '').trim().slice(0, 120);
        if (!name) return;
        const item = {
            id: String(rawItem.id || `master_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80),
            n: name,
            w: Math.max(0, Math.min(999, Number(rawItem.w) || 0)),
            d: String(rawItem.d || '').slice(0, 5000),
            eq: true,
            type: ['arma','municao','comum'].includes(rawItem.type) ? rawItem.type : 'comum',
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
        playerSockets.forEach(sockets => sockets.forEach(socketId => io.to(socketId).emit('catalog_item_granted', { item })));
    });

    socket.on('rolagem_feita', rawData => {
        if (!rawData || typeof rawData !== 'object') return;
        const code = normalizePlayerCode(rawData.codigo || socket.data.playerCode);
        const rollData = { ...rawData, codigo: code };
        io.emit('novo_log', rollData);
        if (code && /^iniciativa\b/i.test(String(rawData.acao || '').trim())) {
            io.emit('initiative_rolled', rollData);
        }
    });

    // Continua sendo usado internamente ao abrir a ficha completa no Escudo.
    socket.on('request_player', rawCode => {
        const code = normalizePlayerCode(rawCode);
        if (playersData.has(code)) socket.emit('update_mestre', playersData.get(code));
    });

    socket.on('disconnect', () => {
        const code = socket.data.playerCode;
        if (code && playerSockets.has(code)) {
            const sockets = playerSockets.get(code);
            sockets.delete(socket.id);
            if (!sockets.size) {
                playerSockets.delete(code);
                playersData.delete(code);
                io.emit('player_disconnected', { codigo: code });
            }
        }
        console.log('🔴 Conexão encerrada:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado na porta ${PORT}`);
});
