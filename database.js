const path = require('path');
const fs = require('fs');

const STORE_PATH = process.env.DB_PATH ? process.env.DB_PATH.replace(/\.db$/i, '-store.json') : path.join(__dirname, 'data', 'store.json');
const BACKUPS_DIR = path.join(path.dirname(STORE_PATH), 'backups');
const BACKUP_RETENTION_DAYS = 30; 

let store = null;

function getOrgBackupsDir(orgId) {
    if (!orgId) throw new Error('orgId required');
    return path.join(BACKUPS_DIR, String(orgId));
}

function ensureOrgBackupsDir(orgId) {
    const dir = getOrgBackupsDir(orgId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

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
            sessions: [],
            organizations: [],
            mapDataByOrg: {},
            historyByOrg: {},
            settingsByOrg: {},
            pricingPlans: []
        };
        saveStore();
        return store;
    }
    try {
        store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (e) {
        store = { mapData: [], users: [], history: [], settings: {}, sessions: [], organizations: [], mapDataByOrg: {}, historyByOrg: {}, settingsByOrg: {}, pricingPlans: [] };
        saveStore();
    }
    if (!store.sessions) store.sessions = [];
    if (!store.settings) store.settings = {};
    if (!Array.isArray(store.organizations)) store.organizations = [];
    if (typeof store.mapDataByOrg !== 'object') store.mapDataByOrg = {};
    if (typeof store.historyByOrg !== 'object') store.historyByOrg = {};
    if (typeof store.settingsByOrg !== 'object') store.settingsByOrg = {};
    if (!Array.isArray(store.pricingPlans)) store.pricingPlans = [];
    migrateToOrganizations();
    return store;
}

function migrateToOrganizations() {
    const s = store;
    if (s.organizations && s.organizations.length > 0) return;
    const hasLegacyData = (Array.isArray(s.mapData) && s.mapData.length > 0) || (Array.isArray(s.history) && s.history.length > 0);
    const defaultOrgId = 'org_default_' + Date.now();
    s.organizations = [{
        id: defaultOrgId,
        name: 'По умолчанию',
        planId: 'basic',
        maxConcurrentUsers: 3,
        subscriptionEndsAt: null,
        status: 'active',
        createdAt: new Date().toISOString()
    }];
    s.mapDataByOrg = {};
    s.historyByOrg = {};
    s.settingsByOrg = s.settingsByOrg || {};
    if (hasLegacyData) {
        s.mapDataByOrg[defaultOrgId] = Array.isArray(s.mapData) ? s.mapData : [];
        s.historyByOrg[defaultOrgId] = Array.isArray(s.history) ? s.history : [];
    }
    const users = Array.isArray(s.users) ? s.users : [];
    users.forEach(function(u) {
        if (u.organizationId === undefined && u.role !== 'admin') u.organizationId = defaultOrgId;
    });
    s.users = users;
    const sessions = Array.isArray(s.sessions) ? s.sessions : [];
    sessions.forEach(function(ses) {
        if (ses.organization_id === undefined) {
            const u = users.find(function(usr) { return usr.id === ses.user_id; });
            ses.organization_id = u && u.organizationId ? u.organizationId : null;
        }
    });
    s.sessions = sessions;
    saveStore();
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
                        s.sessions.push({
                            token: args[0],
                            user_id: args[1],
                            expires_at: args[2],
                            organization_id: args[3] !== undefined ? args[3] : null
                        });
                    } else if (sql.includes('DELETE FROM sessions')) {
                        s.sessions = s.sessions.filter(ses => ses.token !== args[0]);
                    }
                    saveStore();
                },
                all: function (token) {
                    const s = loadStore();
                    const now = new Date().toISOString();
                    const found = (s.sessions || []).filter(ses => ses.token === token && ses.expires_at > now);
                    return found.map(ses => ({ user_id: ses.user_id, organization_id: ses.organization_id != null ? ses.organization_id : null }));
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
    if (!Array.isArray(s.organizations)) s.organizations = [];
    if (typeof s.mapDataByOrg !== 'object') s.mapDataByOrg = {};
    if (typeof s.historyByOrg !== 'object') s.historyByOrg = {};
    if (typeof s.settingsByOrg !== 'object') s.settingsByOrg = {};
    if (!Array.isArray(s.pricingPlans)) s.pricingPlans = [];
    saveStore();
}

function getMapData(orgId) {
    if (!orgId) return [];
    const s = loadStore();
    const byOrg = s.mapDataByOrg || {};
    return Array.isArray(byOrg[orgId]) ? byOrg[orgId] : [];
}

function setMapData(orgId, data) {
    if (!orgId) throw new Error('orgId required');
    if (!Array.isArray(data)) throw new Error('data must be array');
    const s = loadStore();
    if (!s.mapDataByOrg) s.mapDataByOrg = {};
    s.mapDataByOrg[orgId] = data;
    saveStore();
}

function getMapDataLegacy() {
    const s = loadStore();
    return Array.isArray(s.mapData) ? s.mapData : [];
}

function setMapDataLegacy(data) {
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

function getHistory(orgId) {
    if (!orgId) return [];
    const s = loadStore();
    const byOrg = s.historyByOrg || {};
    return Array.isArray(byOrg[orgId]) ? byOrg[orgId] : [];
}

function setHistory(orgId, history) {
    if (!orgId) throw new Error('orgId required');
    if (!Array.isArray(history)) throw new Error('history must be array');
    const s = loadStore();
    if (!s.historyByOrg) s.historyByOrg = {};
    s.historyByOrg[orgId] = history;
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

function getOrganizations() {
    const s = loadStore();
    return Array.isArray(s.organizations) ? s.organizations : [];
}

function getOrganization(orgId) {
    if (!orgId) return null;
    const orgs = getOrganizations();
    return orgs.find(function(o) { return o.id === orgId; }) || null;
}

/** Агрегаты для публичного лендинга (без авторизации). */
function getPublicStats() {
    const s = loadStore();
    const orgs = Array.isArray(s.organizations) ? s.organizations : [];
    const users = Array.isArray(s.users) ? s.users : [];
    let mapObjectCount = 0;
    const byOrg = s.mapDataByOrg && typeof s.mapDataByOrg === 'object' ? s.mapDataByOrg : {};
    Object.keys(byOrg).forEach(function(oid) {
        const arr = byOrg[oid];
        if (Array.isArray(arr)) mapObjectCount += arr.length;
    });
    let userAccountCount = 0;
    users.forEach(function(u) {
        if (!u) return;
        if (String(u.username || '').toLowerCase() === 'admin') return;
        if (u.status === 'rejected') return;
        userAccountCount++;
    });
    return {
        organizationCount: orgs.length,
        userAccountCount: userAccountCount,
        mapObjectCount: mapObjectCount
    };
}

function addOrganization(org) {
    const s = loadStore();
    if (!s.organizations) s.organizations = [];
    const id = org.id || ('org_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    s.organizations.push({
        id: id,
        name: org.name || 'Организация',
        planId: org.planId || 'basic',
        maxConcurrentUsers: org.maxConcurrentUsers != null ? org.maxConcurrentUsers : 3,
        subscriptionEndsAt: org.subscriptionEndsAt || null,
        status: org.status || 'active',
        contactEmail: org.contactEmail != null ? String(org.contactEmail).trim() : '',
        discountPercent: typeof org.discountPercent === 'number' ? org.discountPercent : 0,
        customMonthlyPrice: typeof org.customMonthlyPrice === 'number' ? org.customMonthlyPrice : null,
        createdAt: org.createdAt || new Date().toISOString()
    });
    ensureOrgBackupsDir(id);
    saveStore();
    return id;
}

function updateOrganization(orgId, updates) {
    const s = loadStore();
    const idx = (s.organizations || []).findIndex(function(o) { return o.id === orgId; });
    if (idx === -1) return false;
    if (updates.name !== undefined) s.organizations[idx].name = updates.name;
    if (updates.planId !== undefined) s.organizations[idx].planId = updates.planId;
    if (updates.maxConcurrentUsers !== undefined) s.organizations[idx].maxConcurrentUsers = updates.maxConcurrentUsers;
    if (updates.subscriptionEndsAt !== undefined) s.organizations[idx].subscriptionEndsAt = updates.subscriptionEndsAt;
    if (updates.status !== undefined) s.organizations[idx].status = updates.status;
    if (updates.contactEmail !== undefined) s.organizations[idx].contactEmail = String(updates.contactEmail).trim();
    if (updates.discountPercent !== undefined) s.organizations[idx].discountPercent = updates.discountPercent;
    if (updates.customMonthlyPrice !== undefined) s.organizations[idx].customMonthlyPrice = updates.customMonthlyPrice;
    saveStore();
    return true;
}

function deleteOrganization(orgId) {
    const s = loadStore();
    s.organizations = (s.organizations || []).filter(function(o) { return o.id !== orgId; });
    if (s.mapDataByOrg && s.mapDataByOrg[orgId]) delete s.mapDataByOrg[orgId];
    if (s.historyByOrg && s.historyByOrg[orgId]) delete s.historyByOrg[orgId];
    if (s.settingsByOrg && s.settingsByOrg[orgId]) delete s.settingsByOrg[orgId];
    // Удаляем всех пользователей этой организации (кроме глобального админа без organizationId)
    if (Array.isArray(s.users)) {
        s.users = s.users.filter(function(u) {
            // Пользователь относится к удаляемой организации?
            if (u.organizationId === orgId) return false;
            return true;
        });
    }
    // Удаляем все сессии этой организации
    if (Array.isArray(s.sessions)) {
        s.sessions = s.sessions.filter(function(ses) { return ses.organization_id !== orgId; });
    }
    saveStore();
}

function getSessions() {
    const s = loadStore();
    return Array.isArray(s.sessions) ? s.sessions : [];
}

function getPricingPlans() {
    const s = loadStore();
    if (!Array.isArray(s.pricingPlans) || !s.pricingPlans.length) {
        // Значения по умолчанию для тарифов на главной
        s.pricingPlans = [
            {
                id: 'trial',
                title: 'Пробный',
                short: 'Для знакомства с системой',
                price: '0 ₽',
                period: '/ 14 дней',
                maxUsersText: '1 организация, до 1 одновременного пользователя',
                order: 0,
                highlighted: false,
                ctaText: 'Запустить пробный период',
                kind: 'trial',
                maxConcurrentUsers: 1
            },
            {
                id: 'basic',
                title: 'Базовый',
                short: 'Для небольших команд и пилотов',
                price: '1 490 ₽',
                period: '/ месяц',
                maxUsersText: 'До 3 одновременных пользователей в организации',
                maxConcurrentUsers: 3,
                order: 1,
                highlighted: false,
                ctaText: 'Выбрать «Базовый»',
                kind: 'paid'
            },
            {
                id: 'pro',
                title: 'Про',
                short: 'Оптимально для провайдера с несколькими инженерами',
                price: '3 490 ₽',
                period: '/ месяц',
                maxUsersText: 'До 10 одновременных пользователей; можно усилить лимит в настройках',
                maxConcurrentUsers: 10,
                order: 2,
                highlighted: true,
                ctaText: 'Выбрать «Про»',
                kind: 'paid'
            },
            {
                id: 'enterprise',
                title: 'Корпоративный',
                short: 'Под ваши процессы, SLA и инфраструктуру',
                price: 'по запросу',
                period: '',
                maxUsersText: 'Неограниченное число одновременных пользователей и гибкие условия',
                maxConcurrentUsers: -1,
                order: 3,
                highlighted: false,
                ctaText: 'Обсудить корпоративный тариф',
                kind: 'contact'
            }
        ];
        saveStore();
    }
    return s.pricingPlans.slice().sort(function(a, b) {
        var ao = typeof a.order === 'number' ? a.order : 0;
        var bo = typeof b.order === 'number' ? b.order : 0;
        return ao - bo;
    });
}

function setPricingPlans(plans) {
    const s = loadStore();
    s.pricingPlans = Array.isArray(plans) ? plans : [];
    saveStore();
}

function countActiveSessionsForOrganization(orgId) {
    if (!orgId) return 0;
    const now = new Date().toISOString();
    const sessions = getSessions();
    return sessions.filter(function(ses) {
        return ses.organization_id === orgId && ses.expires_at > now;
    }).length;
}

function deleteSessionsForOrganization(orgId) {
    if (!orgId) return;
    const s = loadStore();
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.sessions = s.sessions.filter(function(ses) {
        return ses.organization_id !== orgId;
    });
    saveStore();
}

/** Удаляет все сессии пользователя (перед новым входом или при принудительном сбросе). */
function deleteSessionsForUser(userId) {
    if (userId == null) return;
    const s = loadStore();
    if (!Array.isArray(s.sessions)) s.sessions = [];
    var id = String(userId);
    s.sessions = s.sessions.filter(function(ses) {
        return String(ses.user_id) !== id;
    });
    saveStore();
}

function getSettings(orgId) {
    let theme = getSetting('theme');
    let groupNames = getSetting('groupNames');
    let netboxConfig = getSetting('netboxConfig');
    let customDeviceOptions = getSetting('customDeviceOptions');
    if (orgId) {
        const s = loadStore();
        const byOrg = (s.settingsByOrg || {})[orgId];
        if (byOrg && typeof byOrg === 'object') {
            if (byOrg.theme !== undefined) theme = byOrg.theme;
            if (byOrg.groupNames !== undefined) groupNames = byOrg.groupNames;
            if (byOrg.netboxConfig !== undefined) netboxConfig = byOrg.netboxConfig;
            if (byOrg.customDeviceOptions !== undefined) customDeviceOptions = byOrg.customDeviceOptions;
        }
    }
    let parsedGroupNames = {};
    let parsedNetboxConfig = { url: '', token: '', ignoreSSL: false };
    let parsedCustomDevice = { manufacturers: [], models: [] };
    try {
        parsedGroupNames = groupNames ? (typeof groupNames === 'string' ? JSON.parse(groupNames) : groupNames) : {};
    } catch (e) {  }
    try {
        parsedNetboxConfig = netboxConfig ? (typeof netboxConfig === 'string' ? JSON.parse(netboxConfig) : netboxConfig) : { url: '', token: '', ignoreSSL: false };
    } catch (e) {  }
    try {
        parsedCustomDevice = customDeviceOptions ? (typeof customDeviceOptions === 'string' ? JSON.parse(customDeviceOptions) : customDeviceOptions) : { deviceCatalog: {}, manufacturers: [], models: [], modelsByManufacturer: {} };
        if (typeof parsedCustomDevice.deviceCatalog !== 'object') parsedCustomDevice.deviceCatalog = {};
        if (!Array.isArray(parsedCustomDevice.manufacturers)) parsedCustomDevice.manufacturers = [];
        if (!Array.isArray(parsedCustomDevice.models)) parsedCustomDevice.models = [];
        if (typeof parsedCustomDevice.modelsByManufacturer !== 'object') parsedCustomDevice.modelsByManufacturer = {};
    } catch (e) {  }
    return {
        theme: theme || '',
        groupNames: parsedGroupNames,
        netboxConfig: parsedNetboxConfig,
        customDeviceOptions: parsedCustomDevice
    };
}

function setSettings(obj, orgId) {
    if (orgId) {
        const s = loadStore();
        if (!s.settingsByOrg) s.settingsByOrg = {};
        if (!s.settingsByOrg[orgId]) s.settingsByOrg[orgId] = {};
        const o = s.settingsByOrg[orgId];
        if (obj.theme !== undefined) o.theme = obj.theme;
        if (obj.groupNames !== undefined) o.groupNames = typeof obj.groupNames === 'string' ? obj.groupNames : JSON.stringify(obj.groupNames);
        if (obj.netboxConfig !== undefined) o.netboxConfig = typeof obj.netboxConfig === 'string' ? obj.netboxConfig : JSON.stringify(obj.netboxConfig);
        if (obj.customDeviceOptions !== undefined) o.customDeviceOptions = typeof obj.customDeviceOptions === 'string' ? obj.customDeviceOptions : JSON.stringify(obj.customDeviceOptions);
        saveStore();
        return;
    }
    if (obj.theme !== undefined) setSetting('theme', obj.theme);
    if (obj.groupNames !== undefined) setSetting('groupNames', typeof obj.groupNames === 'string' ? obj.groupNames : JSON.stringify(obj.groupNames));
    if (obj.netboxConfig !== undefined) setSetting('netboxConfig', typeof obj.netboxConfig === 'string' ? obj.netboxConfig : JSON.stringify(obj.netboxConfig));
    if (obj.customDeviceOptions !== undefined) setSetting('customDeviceOptions', typeof obj.customDeviceOptions === 'string' ? obj.customDeviceOptions : JSON.stringify(obj.customDeviceOptions));
}

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

function createDailyBackup() {
    try {
        if (!fs.existsSync(STORE_PATH)) return;
        const s = loadStore();
        const orgs = Array.isArray(s.organizations) ? s.organizations : [];
        if (!orgs.length) return;
        if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        const now = new Date();
        const dateStr = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0');

        orgs.forEach(function(org) {
            if (!org || !org.id) return;
            const orgId = org.id;
            const dir = ensureOrgBackupsDir(orgId);
            const backupPath = path.join(dir, 'backup-' + dateStr + '.json');
            const payload = {
                version: 1,
                organizationId: orgId,
                createdAt: new Date().toISOString(),
                mapData: getMapData(orgId),
                history: getHistory(orgId),
                settings: getSettings(orgId)
            };
            fs.writeFileSync(backupPath, JSON.stringify(payload), 'utf8');
            pruneBackupsKeepDays(orgId, BACKUP_RETENTION_DAYS);
            console.log('[Backup] Сохранён: ' + orgId + '/backup-' + dateStr + '.json');
        });
    } catch (e) {
        console.error('[Backup] Ошибка:', e.message);
    }
}

function listBackups(orgId) {
    try {
        const dir = getOrgBackupsDir(orgId);
        if (!fs.existsSync(dir)) return [];
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => {
                const match = f.match(/backup-(\d{4})-(\d{2})-(\d{2})\.json/);
                return match ? { filename: f, date: match.slice(1, 4).join('-') } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date));
        return files;
    } catch (e) {
        console.error('[Backup] Ошибка списка:', e.message);
        return [];
    }
}

function restoreFromBackup(orgId, filename) {
    if (!orgId) throw new Error('orgId required');
    const trimmed = typeof filename === 'string' ? filename.trim() : '';
    if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(trimmed)) throw new Error('Недопустимое имя файла');
    const backupPath = path.join(getOrgBackupsDir(orgId), trimmed);
    if (!fs.existsSync(backupPath)) throw new Error('Файл бэкапа не найден');
    let raw, parsed;
    try {
        raw = fs.readFileSync(backupPath, 'utf8');
        parsed = JSON.parse(raw);
    } catch (e) {
        if (e instanceof SyntaxError) throw new Error('Неверный формат JSON в бэкапе');
        throw e;
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('Неверный формат бэкапа');
    const payloadOrgId = parsed.organizationId || orgId;
    if (payloadOrgId !== orgId) throw new Error('Бэкап принадлежит другой организации');
    const s = loadStore();
    if (!s.mapDataByOrg || typeof s.mapDataByOrg !== 'object') s.mapDataByOrg = {};
    if (!s.historyByOrg || typeof s.historyByOrg !== 'object') s.historyByOrg = {};
    if (!s.settingsByOrg || typeof s.settingsByOrg !== 'object') s.settingsByOrg = {};

    s.mapDataByOrg[orgId] = Array.isArray(parsed.mapData) ? parsed.mapData : [];
    s.historyByOrg[orgId] = Array.isArray(parsed.history) ? parsed.history : [];
    s.settingsByOrg[orgId] = (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {};

    saveStore();
    console.log('[Backup] Восстановлено из:', orgId + '/' + trimmed);
}

function pruneBackupsKeepDays(orgId, keepDays) {
    try {
        const dir = getOrgBackupsDir(orgId);
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
            .map(f => {
                const match = f.match(/backup-(\d{4})-(\d{2})-(\d{2})\.json/);
                return match ? { name: f, date: match.slice(1, 4).join('-') } : null;
            })
            .filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date));
        if (files.length <= keepDays) return;
        for (let i = keepDays; i < files.length; i++) {
            const filePath = path.join(dir, files[i].name);
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
    getMapDataLegacy,
    setMapDataLegacy,
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
    listBackups,
    restoreFromBackup,
    initDefaultAdmin,
    getOrganizations,
    getOrganization,
    addOrganization,
    updateOrganization,
    deleteOrganization,
    getSessions,
    countActiveSessionsForOrganization,
    deleteSessionsForOrganization,
    deleteSessionsForUser,
    getPricingPlans,
    setPricingPlans,
    getPublicStats
};
