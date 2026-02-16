/**
 * Хранение данных в JSON-файле (без нативных модулей, работает на любой Node.js).
 * Файл: ./data/store.json
 */
const path = require('path');
const fs = require('fs');

const STORE_PATH = process.env.DB_PATH ? process.env.DB_PATH.replace(/\.db$/i, '-store.json') : path.join(__dirname, 'data', 'store.json');
const BACKUPS_DIR = path.join(path.dirname(STORE_PATH), 'backups');
const BACKUP_RETENTION_DAYS = 30; // хранить бэкапы за последний месяц

let store = null;

function loadStore() {
    if (store) return store;
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        store = {
            mapData: [],
            users: [],
            history: [],
            settings: {},
            sessions: []
        };
        saveStore();
        return store;
    }
    try {
        store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (e) {
        store = { mapData: [], users: [], history: [], settings: {}, sessions: [] };
        saveStore();
    }
    if (!store.sessions) store.sessions = [];
    if (!store.settings) store.settings = {};
    return store;
}

function saveStore() {
    if (!store) return;
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(store, null, 0);
    const tmpPath = STORE_PATH + '.tmp.' + Date.now();
    try {
        fs.writeFileSync(tmpPath, json, 'utf8');
        fs.renameSync(tmpPath, STORE_PATH);
    } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        throw e;
    }
}

function getDb() {
    loadStore();
    initSchema();
    return {
        prepare: function (sql) {
            return {
                get: function (p) {
                    if (sql.includes('map_data') && sql.includes('id = 1')) {
                        const s = loadStore();
                        return s.mapData !== undefined ? { data: JSON.stringify(s.mapData) } : null;
                    }
                    if (sql.includes('history') && sql.includes('id = 1')) {
                        const s = loadStore();
                        return s.history !== undefined ? { data: JSON.stringify(s.history) } : null;
                    }
                    if (sql.includes('settings') && sql.includes('key =')) {
                        const s = loadStore();
                        const key = (p || '').toString();
                        const val = s.settings && s.settings[key] !== undefined ? s.settings[key] : '';
                        return key === 'users' ? { value: JSON.stringify(s.users || []) } : { value: val };
                    }
                    return null;
                },
                run: function () {
                    const args = Array.prototype.slice.call(arguments);
                    const s = loadStore();
                    if (sql.includes('UPDATE map_data')) {
                        s.mapData = JSON.parse(args[0] || '[]');
                    } else if (sql.includes('UPDATE history')) {
                        s.history = JSON.parse(args[0] || '[]');
                    } else if (sql.includes('INSERT OR REPLACE INTO settings')) {
                        const key = args[0], value = args[1];
                        if (!s.settings) s.settings = {};
                        if (key === 'users') {
                            try { s.users = JSON.parse(value || '[]'); } catch (e) { s.users = []; }
                        } else s.settings[key] = value;
                    } else if (sql.includes('INSERT INTO sessions')) {
                        s.sessions.push({ token: args[0], user_id: args[1], expires_at: args[2] });
                    } else if (sql.includes('DELETE FROM sessions')) {
                        s.sessions = s.sessions.filter(ses => ses.token !== args[0]);
                    }
                    saveStore();
                },
                all: function (token) {
                    const s = loadStore();
                    const now = new Date().toISOString();
                    const found = (s.sessions || []).filter(ses => ses.token === token && ses.expires_at > now);
                    return found.map(ses => ({ user_id: ses.user_id }));
                }
            };
        },
        exec: function (sql) {
            loadStore();
            if (sql.includes('CREATE TABLE') && sql.includes('map_data')) {
                if (!Array.isArray(store.mapData)) store.mapData = [];
                if (!Array.isArray(store.history)) store.history = [];
                if (!store.settings) store.settings = {};
                if (!store.sessions) store.sessions = [];
                saveStore();
            }
        }
    };
}

function initSchema() {
    const s = loadStore();
    if (!Array.isArray(s.mapData)) s.mapData = [];
    if (!Array.isArray(s.users)) s.users = [];
    if (!Array.isArray(s.history)) s.history = [];
    if (!s.settings || typeof s.settings !== 'object') s.settings = {};
    if (!Array.isArray(s.sessions)) s.sessions = [];
    saveStore();
}

function getMapData() {
    const s = loadStore();
    return Array.isArray(s.mapData) ? s.mapData : [];
}

function setMapData(data) {
    if (!Array.isArray(data)) throw new Error('data must be array');
    const s = loadStore();
    s.mapData = data;
    saveStore();
}

function getUsers() {
    const s = loadStore();
    return Array.isArray(s.users) ? s.users : [];
}

function setUsers(users) {
    const s = loadStore();
    s.users = Array.isArray(users) ? users : [];
    saveStore();
}

function getHistory() {
    const s = loadStore();
    return Array.isArray(s.history) ? s.history : [];
}

function setHistory(history) {
    if (!Array.isArray(history)) throw new Error('history must be array');
    const s = loadStore();
    s.history = history;
    saveStore();
}

function getSetting(key) {
    const s = loadStore();
    if (!s.settings || s.settings[key] === undefined) return null;
    return s.settings[key];
}

function setSetting(key, value) {
    const s = loadStore();
    if (!s.settings) s.settings = {};
    s.settings[key] = value === undefined || value === null ? '' : String(value);
    saveStore();
}

function getSettings() {
    const theme = getSetting('theme');
    const groupNames = getSetting('groupNames');
    const netboxConfig = getSetting('netboxConfig');
    let parsedGroupNames = {};
    let parsedNetboxConfig = { url: '', token: '', ignoreSSL: false };
    try {
        parsedGroupNames = groupNames ? (typeof groupNames === 'string' ? JSON.parse(groupNames) : groupNames) : {};
    } catch (e) { /* повреждённые данные — используем по умолчанию */ }
    try {
        parsedNetboxConfig = netboxConfig ? (typeof netboxConfig === 'string' ? JSON.parse(netboxConfig) : netboxConfig) : { url: '', token: '', ignoreSSL: false };
    } catch (e) { /* повреждённые данные — используем по умолчанию */ }
    return {
        theme: theme || '',
        groupNames: parsedGroupNames,
        netboxConfig: parsedNetboxConfig
    };
}

function setSettings(obj) {
    if (obj.theme !== undefined) setSetting('theme', obj.theme);
    if (obj.groupNames !== undefined) setSetting('groupNames', typeof obj.groupNames === 'string' ? obj.groupNames : JSON.stringify(obj.groupNames));
    if (obj.netboxConfig !== undefined) setSetting('netboxConfig', typeof obj.netboxConfig === 'string' ? obj.netboxConfig : JSON.stringify(obj.netboxConfig));
}

// Начальная позиция карты по пользователю (центр и зум при открытии)
function getMapStartForUser(userId) {
    const raw = getSetting('userMapStarts');
    if (!raw) return null;
    try {
        const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const data = map && userId ? map[String(userId)] : null;
        if (data && Array.isArray(data.center) && data.center.length >= 2 && typeof data.zoom === 'number') return data;
        return null;
    } catch (e) {
        return null;
    }
}

function setMapStartForUser(userId, data) {
    const s = loadStore();
    if (!s.settings) s.settings = {};
    let map = {};
    try {
        if (s.settings.userMapStarts) map = typeof s.settings.userMapStarts === 'string' ? JSON.parse(s.settings.userMapStarts) : s.settings.userMapStarts;
    } catch (e) {}
    if (!data || !Array.isArray(data.center) || data.center.length < 2) {
        if (userId) delete map[String(userId)];
    } else {
        map[String(userId)] = { center: data.center.slice(0, 2), zoom: typeof data.zoom === 'number' ? data.zoom : 15 };
    }
    s.settings.userMapStarts = JSON.stringify(map);
    saveStore();
}

/**
 * Создаёт резервную копию store в data/backups/backup-YYYY-MM-DD.json.
 * Затем удаляет бэкапы старше BACKUP_RETENTION_DAYS (оставляет месяц).
 */
function createDailyBackup() {
    try {
        if (!fs.existsSync(STORE_PATH)) return;
        const dir = BACKUPS_DIR;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');
        const backupPath = path.join(dir, 'backup-' + dateStr + '.json');
        const data = fs.readFileSync(STORE_PATH, 'utf8');
        fs.writeFileSync(backupPath, data, 'utf8');
        pruneBackupsKeepDays(BACKUP_RETENTION_DAYS);
        console.log('[Backup] Сохранён: backup-' + dateStr + '.json');
    } catch (e) {
        console.error('[Backup] Ошибка:', e.message);
    }
}

/**
 * Удаляет старые бэкапы, оставляя только последние keepDays файлов по дате в имени.
 */
function pruneBackupsKeepDays(keepDays) {
    try {
        if (!fs.existsSync(BACKUPS_DIR)) return;
        const files = fs.readdirSync(BACKUPS_DIR)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => {
                const match = f.match(/backup-(\d{4})-(\d{2})-(\d{2})\.json/);
                return match ? { name: f, date: match.slice(1, 4).join('-') } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date));
        if (files.length <= keepDays) return;
        for (let i = keepDays; i < files.length; i++) {
            const filePath = path.join(BACKUPS_DIR, files[i].name);
            try { fs.unlinkSync(filePath); console.log('[Backup] Удалён старый:', files[i].name); } catch (e) {}
        }
    } catch (e) {
        console.error('[Backup] Ошибка очистки:', e.message);
    }
}

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
    getMapStartForUser,
    setMapStartForUser,
    createDailyBackup,
    initDefaultAdmin
};
