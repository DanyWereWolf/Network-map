/**
 * REST API и база данных для «Карта локальной сети».
 * Один сервер отдаёт и приложение (HTML/JS/CSS), и API — база всегда из проекта.
 * Запуск: node server-api.js [порт]  →  открыть http://localhost:3000
 * Данные: ./data/store.json
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database');

const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
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

app.listen(PORT, () => {
    console.log('Приложение и API: http://localhost:' + PORT);
    console.log('Данные: ' + path.join(__dirname, 'data', 'store.json'));
});
