/**
 * REST API и база данных для «Карта локальной сети».
 * Один сервер отдаёт и приложение (HTML/JS/CSS), и API — база всегда из проекта.
 * Слушает на всех интерфейсах (0.0.0.0): доступ по localhost и по IP в сети.
 * Запуск: node server-api.js [порт]  или  HOST=0.0.0.0 PORT=3000 node server-api.js
 * Данные: ./data/store.json
 */
const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const cors = require('cors');
const WebSocket = require('ws');
const db = require('./database');

function loadServerConfig() {
    let config = {};
    try {
        const configPath = path.join(__dirname, 'server-config.json');
        if (require('fs').existsSync(configPath)) {
            config = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
        }
    } catch (e) {}
    return config;
}
const serverConfig = loadServerConfig();
const PORT = parseInt(process.env.PORT || process.argv[2] || serverConfig.port || '3000', 10);
const HOST = process.env.HOST || serverConfig.host || '0.0.0.0';
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Хэш пароля (как в auth.js)
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        hash = ((hash << 5) - hash) + password.charCodeAt(i);
        hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(16) + '_' + password.length;
}

function generateToken() {
    return 'tk_' + Date.now() + '_' + require('crypto').randomBytes(16).toString('hex');
}

// Проверка токена (Authorization: Bearer <token>)
function getSessionUser(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const sessions = db.getDb().prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').all(token);
    if (sessions.length === 0) return null;
    const users = db.getUsers();
    const user = users.find(u => u.id === sessions[0].user_id);
    if (!user) return null;
    return { userId: user.id, username: user.username, fullName: user.fullName || user.full_name, role: user.role };
}

// ————— Карта —————
app.get('/api/map', (req, res) => {
    try {
        const data = db.getMapData();
        res.json({ data });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/map', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        const data = req.body && req.body.data;
        if (!Array.isArray(data)) return res.status(400).json({ error: 'Ожидается массив data' });
        db.setMapData(data);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

// ————— Авторизация —————
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: 'Укажите имя и пароль' });
    const users = db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.json({ success: false, error: 'Пользователь не найден' });
    if (user.password !== hashPassword(password)) return res.json({ success: false, error: 'Неверный пароль' });
    if (user.status === 'pending') return res.json({ success: false, error: 'Заявка ожидает одобрения' });
    if (user.status === 'rejected') return res.json({ success: false, error: 'Заявка отклонена' });
    const token = generateToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.getDb().prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires);
    res.json({
        success: true,
        token,
        user: { userId: user.id, username: user.username, fullName: user.fullName || user.full_name, role: user.role }
    });
});

app.post('/api/auth/logout', (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        db.getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    }
    res.json({ ok: true });
});

app.get('/api/auth/session', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Нет сессии' });
    res.json({ user });
});

app.post('/api/auth/register', (req, res) => {
    const { username, password, fullName } = req.body || {};
    if (!username || username.length < 3) return res.status(400).json({ success: false, error: 'Имя не менее 3 символов' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Пароль не менее 6 символов' });
    const users = db.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.json({ success: false, error: 'Пользователь уже существует' });
    const newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        username,
        password: hashPassword(password),
        fullName: fullName || username,
        full_name: fullName || username,
        role: 'user',
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    db.setUsers(users);
    res.json({ success: true, pending: true });
});

// ————— Пользователи (админ) —————
app.get('/api/users', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
    const users = db.getUsers();
    const safe = users.map(u => ({ id: u.id, username: u.username, fullName: u.fullName || u.full_name, role: u.role, status: u.status || 'approved', createdAt: u.createdAt }));
    res.json({ users: safe });
});

app.post('/api/users/approve', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const { userId } = req.body || {};
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    users[i].status = 'approved';
    db.setUsers(users);
    res.json({ ok: true });
});

app.post('/api/users/reject', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const { userId } = req.body || {};
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    if (users[i].username === 'admin') return res.status(400).json({ error: 'Нельзя отклонить главного администратора' });
    users[i].status = 'rejected';
    db.setUsers(users);
    res.json({ ok: true });
});

app.put('/api/users/:userId', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const userId = req.params.userId;
    const { fullName, role, password } = req.body || {};
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    if (users[i].username === 'admin' && role !== undefined && role !== 'admin') return res.status(400).json({ error: 'Нельзя снять роль администратора с главного администратора' });
    if (fullName !== undefined) { users[i].fullName = fullName; users[i].full_name = fullName; }
    if (role !== undefined) users[i].role = role;
    if (password && String(password).length >= 6) users[i].password = hashPassword(password);
    db.setUsers(users);
    res.json({ ok: true });
});

app.post('/api/users', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const { username, password, fullName, role } = req.body || {};
    if (!username || username.length < 3) return res.status(400).json({ error: 'Имя не менее 3 символов' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });
    const users = db.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Пользователь уже существует' });
    const newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        username: username,
        password: hashPassword(password),
        fullName: fullName || username,
        full_name: fullName || username,
        role: role || 'user',
        status: 'approved',
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    db.setUsers(users);
    res.json({ ok: true, user: { id: newUser.id, username: newUser.username } });
});

// ————— История —————
app.get('/api/history', (req, res) => {
    try {
        const history = db.getHistory();
        res.json({ history });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/history', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        const history = req.body && req.body.history;
        if (!Array.isArray(history)) return res.status(400).json({ error: 'Ожидается массив history' });
        db.setHistory(history);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

// ————— Настройки (тема, имена групп, NetBox) —————
app.get('/api/settings', (req, res) => {
    try {
        const settings = db.getSettings();
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/settings', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        db.setSettings(req.body || {});
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

// Здоровье
app.get('/api/health', (req, res) => res.json({ ok: true, db: 'sqlite' }));

// Раздаём приложение с того же сервера (после маршрутов /api/*)
app.use(express.static(path.join(__dirname)));

db.getDb();
db.initDefaultAdmin();

// ————— WebSocket: одна общая карта для всех, хранится в БД —————
const server = http.createServer(app);
var syncCurrentState = { clientId: 'server', data: db.getMapData() || [] };
const wss = new WebSocket.Server({ server, path: '/sync' });
const syncClientNames = new Map(); // clientId -> displayName

const syncClientUserIds = new Map(); // clientId -> userId (number or string)

/** Слияние входящего состояния с текущим по uniqueId — правки разных пользователей не затирают друг друга */
function mergeMapState(current, incoming) {
    if (!Array.isArray(incoming) || incoming.length === 0) return current;
    if (!Array.isArray(current) || current.length === 0) return incoming;
    var currentObjs = current.filter(function(i) { return i.type !== 'cable'; });
    var currentCables = current.filter(function(i) { return i.type === 'cable'; });
    var incomingObjs = incoming.filter(function(i) { return i.type !== 'cable'; });
    var incomingCables = incoming.filter(function(i) { return i.type === 'cable'; });
    var mergedObjs = [];
    var i, j, o, inc, uid, idx, fromUid, toUid, fromIdx, toIdx, c, cableData, existing;
    for (i = 0; i < currentObjs.length; i++) mergedObjs.push(currentObjs[i]);
    for (j = 0; j < incomingObjs.length; j++) {
        inc = incomingObjs[j];
        uid = inc.uniqueId != null ? inc.uniqueId : 'obj-' + j;
        idx = mergedObjs.findIndex(function(o) { return (o.uniqueId != null ? o.uniqueId : '') === uid; });
        if (idx >= 0) mergedObjs[idx] = inc; else mergedObjs.push(inc);
    }
    var mergedCables = [];
    for (i = 0; i < currentCables.length; i++) {
        c = currentCables[i];
        fromUid = currentObjs[c.from] && currentObjs[c.from].uniqueId;
        toUid = currentObjs[c.to] && currentObjs[c.to].uniqueId;
        if (fromUid == null || toUid == null) continue;
        fromIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === fromUid; });
        toIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === toUid; });
        if (fromIdx >= 0 && toIdx >= 0) {
            cableData = { type: 'cable', cableType: c.cableType, from: fromIdx, to: toIdx, geometry: c.geometry };
            if (c.uniqueId != null) cableData.uniqueId = c.uniqueId;
            if (c.distance !== undefined) cableData.distance = c.distance;
            if (c.cableName != null) cableData.cableName = c.cableName;
            mergedCables.push(cableData);
        }
    }
    for (j = 0; j < incomingCables.length; j++) {
        c = incomingCables[j];
        fromUid = incomingObjs[c.from] && incomingObjs[c.from].uniqueId;
        toUid = incomingObjs[c.to] && incomingObjs[c.to].uniqueId;
        if (fromUid == null || toUid == null) continue;
        fromIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === fromUid; });
        toIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === toUid; });
        if (fromIdx < 0 || toIdx < 0) continue;
        cableData = { type: 'cable', cableType: c.cableType, from: fromIdx, to: toIdx, geometry: c.geometry };
        if (c.uniqueId != null) cableData.uniqueId = c.uniqueId;
        if (c.distance !== undefined) cableData.distance = c.distance;
        if (c.cableName != null) cableData.cableName = c.cableName;
        existing = mergedCables.findIndex(function(x) { return x.uniqueId === c.uniqueId; });
        if (existing >= 0) mergedCables[existing] = cableData; else mergedCables.push(cableData);
    }
    return mergedObjs.concat(mergedCables);
}

function broadcastSyncClients() {
    const list = [];
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.clientId) {
            list.push({
                id: client.clientId,
                displayName: syncClientNames.get(client.clientId) || 'Участник',
                userId: syncClientUserIds.get(client.clientId) || null
            });
        }
    });
    const payload = JSON.stringify({ type: 'clients', clients: list });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try { client.send(payload); } catch (e) {}
        }
    });
}

wss.on('connection', (ws, req) => {
    const clientId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    ws.clientId = clientId;
    ws.connectedAt = Date.now();
    syncClientNames.set(clientId, 'Участник');
    broadcastSyncClients();
    try {
        ws.send(JSON.stringify({ type: 'state', clientId: syncCurrentState.clientId, data: syncCurrentState.data }));
        ws.send(JSON.stringify({ type: 'yourId', clientId: clientId }));
        var list = [];
        wss.clients.forEach(function(c) {
            if (c.readyState === WebSocket.OPEN && c.clientId) {
                list.push({
                    id: c.clientId,
                    displayName: syncClientNames.get(c.clientId) || 'Участник',
                    userId: syncClientUserIds.get(c.clientId) || null
                });
            }
        });
        ws.send(JSON.stringify({ type: 'clients', clients: list }));
    } catch (e) {}
    ws.on('message', (raw) => {
        try {
            const str = raw.toString();
            if (str.length > 15 * 1024 * 1024) return;
            const msg = JSON.parse(str);
            if (msg.type === 'hello') {
                const name = (msg.displayName && String(msg.displayName).trim()) || 'Участник';
                syncClientNames.set(clientId, name.slice(0, 100));
                if (msg.userId !== undefined && msg.userId !== null) syncClientUserIds.set(clientId, msg.userId);
                broadcastSyncClients();
                return;
            }
            if (msg.type === 'cursor') {
                var pos = msg.position;
                if (Array.isArray(pos) && pos.length >= 2 && typeof pos[0] === 'number' && typeof pos[1] === 'number') {
                    ws.cursor = {
                        position: [Number(pos[0]), Number(pos[1])],
                        displayName: syncClientNames.get(clientId) || 'Участник',
                        userId: syncClientUserIds.get(clientId) || null
                    };
                    scheduleCursorsBroadcast();
                }
                return;
            }
            if (msg.type !== 'state' || !Array.isArray(msg.data)) return;
            var justConnected = (Date.now() - (ws.connectedAt || 0)) < 4000;
            if (!justConnected) {
                syncCurrentState.data = mergeMapState(syncCurrentState.data, msg.data);
                syncCurrentState.clientId = msg.clientId || clientId;
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'state', clientId: syncCurrentState.clientId, data: syncCurrentState.data }));
                    }
                });
                scheduleSyncWrite();
            }
        } catch (e) {}
    });
    ws.on('close', function() {
        syncClientNames.delete(clientId);
        syncClientUserIds.delete(clientId);
        ws.cursor = null;
        broadcastSyncClients();
        broadcastCursors();
    });
});

var syncWriteTimer = null;
var SYNC_WRITE_DELAY_MS = 1800;

function scheduleSyncWrite() {
    if (syncWriteTimer) clearTimeout(syncWriteTimer);
    syncWriteTimer = setTimeout(function() {
        syncWriteTimer = null;
        try {
            db.setMapData(syncCurrentState.data);
        } catch (e) {}
    }, SYNC_WRITE_DELAY_MS);
}

var lastCursorsBroadcast = 0;
var cursorsBroadcastTimer = null;
var CURSORS_BROADCAST_THROTTLE_MS = 100;

function scheduleCursorsBroadcast() {
    if (cursorsBroadcastTimer) return;
    var elapsed = Date.now() - lastCursorsBroadcast;
    if (elapsed >= CURSORS_BROADCAST_THROTTLE_MS) {
        lastCursorsBroadcast = Date.now();
        broadcastCursors();
        return;
    }
    cursorsBroadcastTimer = setTimeout(function() {
        cursorsBroadcastTimer = null;
        lastCursorsBroadcast = Date.now();
        broadcastCursors();
    }, CURSORS_BROADCAST_THROTTLE_MS - elapsed);
}

function broadcastCursors() {
    const list = [];
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.clientId && client.cursor && client.cursor.position) {
            list.push({
                id: client.clientId,
                displayName: client.cursor.displayName,
                userId: client.cursor.userId,
                position: client.cursor.position
            });
        }
    });
    const payload = JSON.stringify({ type: 'cursors', cursors: list });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try { client.send(payload); } catch (e) {}
        }
    });
}

function getLocalIPs() {
    const ifaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
        }
    }
    return ips;
}

server.listen(PORT, HOST, () => {
    console.log('Приложение и API:');
    console.log('  Локально:    http://localhost:' + PORT);
    const ips = getLocalIPs();
    if (ips.length) {
        ips.forEach(ip => console.log('  В сети:      http://' + ip + ':' + PORT));
        console.log('  На других устройствах откройте адрес «В сети» в браузере.');
    }
    console.log('Синхронизация: ws://...:' + PORT + '/sync (в одном процессе с API)');
    console.log('Данные: ' + path.join(__dirname, 'data', 'store.json'));
    if (!require('fs').existsSync(path.join(__dirname, 'server-config.json'))) {
        console.log('Настройки: порт/хост можно задать в server-config.json (скопируйте из server-config.example.json).');
    }
});
