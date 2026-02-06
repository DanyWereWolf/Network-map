/**
 * SQLite-база данных для карты, пользователей, истории и настроек.
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'network-map.db');

let db;

function getDb() {
    if (!db) {
        const fs = require('fs');
        const dir = path.dirname(DB_PATH);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        db = new Database(DB_PATH);
        initSchema();
    }
    return db;
}

function initSchema() {
    const d = getDb();
    d.exec(`
        CREATE TABLE IF NOT EXISTS map_data (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO map_data (id, data) VALUES (1, '[]');

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            full_name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'user',
            status TEXT NOT NULL DEFAULT 'approved',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            data TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO history (id, data) VALUES (1, '[]');

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );
    `);
}

function getMapData() {
    const row = getDb().prepare('SELECT data FROM map_data WHERE id = 1').get();
    return row ? JSON.parse(row.data) : [];
}

function setMapData(data) {
    if (!Array.isArray(data)) throw new Error('data must be array');
    getDb().prepare('UPDATE map_data SET data = ?, updated_at = datetime(\'now\') WHERE id = 1').run(JSON.stringify(data));
}

function getUsers() {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get('users');
    return row ? JSON.parse(row.value) : [];
}

function setUsers(users) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('users', JSON.stringify(users));
}

function getHistory() {
    const row = getDb().prepare('SELECT data FROM history WHERE id = 1').get();
    return row ? JSON.parse(row.data) : [];
}

function setHistory(history) {
    if (!Array.isArray(history)) throw new Error('history must be array');
    getDb().prepare('UPDATE history SET data = ?, updated_at = datetime(\'now\') WHERE id = 1').run(JSON.stringify(history));
}

function getSetting(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setSetting(key, value) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value === undefined || value === null ? '' : String(value));
}

function getSettings() {
    const theme = getSetting('theme');
    const groupNames = getSetting('groupNames');
    const netboxConfig = getSetting('netboxConfig');
    return {
        theme: theme || '',
        groupNames: groupNames ? JSON.parse(groupNames) : {},
        netboxConfig: netboxConfig ? JSON.parse(netboxConfig) : { url: '', token: '', ignoreSSL: false }
    };
}

function setSettings(obj) {
    if (obj.theme !== undefined) setSetting('theme', obj.theme);
    if (obj.groupNames !== undefined) setSetting('groupNames', JSON.stringify(obj.groupNames));
    if (obj.netboxConfig !== undefined) setSetting('netboxConfig', JSON.stringify(obj.netboxConfig));
}

// Инициализация пользователей в том же формате, что и в auth.js (localStorage)
function initDefaultAdmin() {
    let users = getUsers();
    if (users.length === 0) {
        const hashPassword = (password) => {
            let hash = 0;
            for (let i = 0; i < password.length; i++) {
                const char = password.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return 'hash_' + Math.abs(hash).toString(16) + '_' + password.length;
        };
        users = [{
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            username: 'admin',
            password: hashPassword('admin123'),
            fullName: 'Администратор',
            role: 'admin',
            status: 'approved',
            createdAt: new Date().toISOString()
        }];
        setUsers(users);
        console.log('Создан администратор по умолчанию: admin / admin123');
    }
}

module.exports = {
    getDb,
    getMapData,
    setMapData,
    getUsers,
    setUsers,
    getHistory,
    setHistory,
    getSettings,
    setSettings,
    getSetting,
    setSetting,
    initDefaultAdmin
};
