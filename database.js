const path = require('path');
const fs = require('fs');

const STORE_PATH = process.env.DB_PATH ? process.env.DB_PATH.replace(/\.db$/i, '-store.json') : path.join(__dirname, 'data', 'store.json');
const BACKUPS_DIR = path.join(path.dirname(STORE_PATH), 'backups');
const BACKUP_RETENTION_DAYS = 30; 

let store = null;

/** Сравнение id организации без учёта типа (строка/число), чтобы лимиты и данные не «терялись». */
function organizationIdsMatch(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

/** Активна ли сессия по expires_at (строка ISO, число ms/s, без поля = нет). */
function sessionIsActive(ses) {
    if (!ses || ses.expires_at == null || ses.expires_at === '') return false;
    var raw = ses.expires_at;
    var expMs;
    if (typeof raw === 'number') {
        expMs = raw < 1e12 ? raw * 1000 : raw;
    } else {
        expMs = new Date(raw).getTime();
    }
    if (isNaN(expMs)) return false;
    return expMs > Date.now();
}

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
            chatByOrg: {},
            chatMediaByOrg: {},
            pricingPlans: [],
            visitLogs: []
        };
        saveStore();
        return store;
    }
    try {
        store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    } catch (e) {
        store = { mapData: [], users: [], history: [], settings: {}, sessions: [], organizations: [], mapDataByOrg: {}, historyByOrg: {}, settingsByOrg: {}, chatByOrg: {}, chatMediaByOrg: {}, pricingPlans: [], visitLogs: [] };
        saveStore();
    }
    if (!store.sessions) store.sessions = [];
    if (!store.settings) store.settings = {};
    if (!Array.isArray(store.organizations)) store.organizations = [];
    if (typeof store.mapDataByOrg !== 'object') store.mapDataByOrg = {};
    if (typeof store.historyByOrg !== 'object') store.historyByOrg = {};
    if (typeof store.settingsByOrg !== 'object') store.settingsByOrg = {};
    if (typeof store.chatByOrg !== 'object') store.chatByOrg = {};
    if (typeof store.chatMediaByOrg !== 'object') store.chatMediaByOrg = {};
    if (!Array.isArray(store.pricingPlans)) store.pricingPlans = [];
    if (!Array.isArray(store.visitLogs)) store.visitLogs = [];
    migrateToOrganizations();
    stripNetboxFromStore(store);
    return store;
}

function stripNetboxFromStore(s) {
    if (!s) return;
    var dirty = false;
    if (s.settings && s.settings.netboxConfig !== undefined) {
        delete s.settings.netboxConfig;
        dirty = true;
    }
    if (s.settingsByOrg && typeof s.settingsByOrg === 'object') {
        Object.keys(s.settingsByOrg).forEach(function(orgId) {
            var o = s.settingsByOrg[orgId];
            if (o && o.netboxConfig !== undefined) {
                delete o.netboxConfig;
                dirty = true;
            }
        });
    }
    function stripMapObject(obj) {
        if (!obj || typeof obj !== 'object') return false;
        var changed = false;
        ['netboxId', 'netboxUrl', 'netboxDeviceType', 'netboxSite'].forEach(function(k) {
            if (obj[k] !== undefined) {
                delete obj[k];
                changed = true;
            }
        });
        return changed;
    }
    function stripMapList(list) {
        if (!Array.isArray(list)) return false;
        var c = false;
        list.forEach(function(item) {
            if (stripMapObject(item)) c = true;
        });
        return c;
    }
    if (stripMapList(s.mapData)) dirty = true;
    if (s.mapDataByOrg && typeof s.mapDataByOrg === 'object') {
        Object.keys(s.mapDataByOrg).forEach(function(orgId) {
            if (stripMapList(s.mapDataByOrg[orgId])) dirty = true;
        });
    }
    if (dirty) saveStore();
}

function migrateToOrganizations() {
    const s = store;
    if (s.organizations && s.organizations.length > 0) return;
    const hasLegacyData = (Array.isArray(s.mapData) && s.mapData.length > 0) || (Array.isArray(s.history) && s.history.length > 0);
    const defaultOrgId = 'org_default_' + Date.now();
    s.organizations = [{
        id: defaultOrgId,
        name: 'По умолчанию',
        mapObjectLimitUnlocked: false,
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
                    const found = (s.sessions || []).filter(ses => ses.token === token && sessionIsActive(ses));
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
    if (!Array.isArray(s.visitLogs)) s.visitLogs = [];
    saveStore();
}

function getMapData(orgId) {
    if (!orgId) return [];
    const s = loadStore();
    const byOrg = s.mapDataByOrg || {};
    if (Array.isArray(byOrg[orgId])) return byOrg[orgId];
    var k = Object.keys(byOrg).find(function(key) { return organizationIdsMatch(key, orgId); });
    return k && Array.isArray(byOrg[k]) ? byOrg[k] : [];
}

function setMapData(orgId, data) {
    if (!orgId) throw new Error('orgId required');
    if (!Array.isArray(data)) throw new Error('data must be array');
    const s = loadStore();
    if (!s.mapDataByOrg) s.mapDataByOrg = {};
    var org = getOrganization(orgId);
    var key = org ? org.id : orgId;
    s.mapDataByOrg[key] = data;
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

const MAX_ORG_CHAT_MESSAGES = 500;

function getOrgChat(orgId, limit) {
    if (!orgId) return [];
    const s = loadStore();
    const byOrg = s.chatByOrg || {};
    const key = String(orgId);
    var list = Array.isArray(byOrg[key]) ? byOrg[key] : [];
    if (limit != null && limit > 0 && list.length > limit) {
        return list.slice(list.length - limit);
    }
    return list;
}

function addOrgChatMessage(orgId, message) {
    if (!orgId) throw new Error('orgId required');
    if (!message || typeof message !== 'object') throw new Error('message required');
    const s = loadStore();
    if (!s.chatByOrg) s.chatByOrg = {};
    const key = String(orgId);
    if (!Array.isArray(s.chatByOrg[key])) s.chatByOrg[key] = [];
    s.chatByOrg[key].push(message);
    if (s.chatByOrg[key].length > MAX_ORG_CHAT_MESSAGES) {
        s.chatByOrg[key] = s.chatByOrg[key].slice(s.chatByOrg[key].length - MAX_ORG_CHAT_MESSAGES);
    }
    saveStore();
    return message;
}

const MAX_CHAT_MEDIA_PER_ORG = 150;

function getChatMedia(orgId, kind) {
    if (!orgId) return [];
    const s = loadStore();
    const key = String(orgId);
    const list = (s.chatMediaByOrg && Array.isArray(s.chatMediaByOrg[key])) ? s.chatMediaByOrg[key] : [];
    if (!kind) return list.slice();
    return list.filter(function(item) { return item && item.kind === kind; });
}

function getChatMediaItem(orgId, mediaId) {
    if (!orgId || !mediaId) return null;
    const list = getChatMedia(orgId);
    return list.find(function(item) { return item && String(item.id) === String(mediaId); }) || null;
}

function addChatMedia(orgId, item) {
    if (!orgId) throw new Error('orgId required');
    if (!item || !item.id) throw new Error('item.id required');
    const s = loadStore();
    if (!s.chatMediaByOrg) s.chatMediaByOrg = {};
    const key = String(orgId);
    if (!Array.isArray(s.chatMediaByOrg[key])) s.chatMediaByOrg[key] = [];
    s.chatMediaByOrg[key].push(item);
    if (s.chatMediaByOrg[key].length > MAX_CHAT_MEDIA_PER_ORG) {
        s.chatMediaByOrg[key] = s.chatMediaByOrg[key].slice(s.chatMediaByOrg[key].length - MAX_CHAT_MEDIA_PER_ORG);
    }
    saveStore();
    return item;
}

function removeChatMedia(orgId, mediaId) {
    if (!orgId || !mediaId) return false;
    const s = loadStore();
    if (!s.chatMediaByOrg || !Array.isArray(s.chatMediaByOrg[String(orgId)])) return false;
    const key = String(orgId);
    const before = s.chatMediaByOrg[key].length;
    s.chatMediaByOrg[key] = s.chatMediaByOrg[key].filter(function(item) {
        return item && String(item.id) !== String(mediaId);
    });
    if (s.chatMediaByOrg[key].length === before) return false;
    saveStore();
    return true;
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
    if (orgId == null || orgId === '') return null;
    const orgs = getOrganizations();
    return orgs.find(function(o) { return organizationIdsMatch(o.id, orgId); }) || null;
}

/** Кабели и служебные подписи не считаются объектами на карте. */
function isMapInfrastructureObject(item) {
    if (!item || !item.type) return false;
    return item.type !== 'cable' && item.type !== 'cableLabel';
}

/**
 * Реальное число объектов на одной карте: узлы, кроссы, муфты, опоры и т.д.
 * Без кабелей, без дублей по uniqueId; коммутаторы внутри узла — как в статистике приложения.
 */
function countActualMapObjectsInArray(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    const byUid = Object.create(null);
    const withoutUid = [];
    arr.forEach(function(item) {
        if (!isMapInfrastructureObject(item)) return;
        const uid = item.uniqueId;
        if (uid != null && uid !== '') {
            if (!byUid[uid]) byUid[uid] = item;
        } else {
            withoutUid.push(item);
        }
    });
    const placemarks = withoutUid.concat(Object.keys(byUid).map(function(k) { return byUid[k]; }));
    let count = 0;
    placemarks.forEach(function(item) {
        count++;
        if (item.type !== 'node' || !Array.isArray(item.attachedSwitches)) return;
        item.attachedSwitches.forEach(function(sw) {
            if (!sw) return;
            const swId = sw.uniqueId;
            if (swId != null && swId !== '' && byUid[swId]) return;
            count++;
        });
    });
    return count;
}

/** Число объектов на карте одной организации (узлы, кроссы, муфты и т.д., без кабелей). */
function countMapObjectsForOrganization(orgId) {
    return countActualMapObjectsInArray(getMapData(orgId));
}

/** Агрегаты для публичного лендинга (без авторизации). */
function getPublicStats() {
    const s = loadStore();
    const orgs = Array.isArray(s.organizations) ? s.organizations : [];
    const users = Array.isArray(s.users) ? s.users : [];
    let mapObjectCount = 0;
    const byOrg = s.mapDataByOrg && typeof s.mapDataByOrg === 'object' ? s.mapDataByOrg : {};
    Object.keys(byOrg).forEach(function(oid) {
        mapObjectCount += countActualMapObjectsInArray(byOrg[oid]);
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
        mapObjectLimitUnlocked: !!org.mapObjectLimitUnlocked,
        customMapObjectLimit: org.customMapObjectLimit != null && org.customMapObjectLimit !== '' ? org.customMapObjectLimit : null,
        maxConcurrentUsers: org.maxConcurrentUsers != null && org.maxConcurrentUsers !== '' ? org.maxConcurrentUsers : null,
        status: org.status || 'active',
        contactEmail: org.contactEmail != null ? String(org.contactEmail).trim() : '',
        twoFactorEnabled: !!org.twoFactorEnabled,
        twoFactorSecret: org.twoFactorSecret ? String(org.twoFactorSecret) : null,
        createdAt: org.createdAt || new Date().toISOString()
    });
    ensureOrgBackupsDir(id);
    saveStore();
    return id;
}

function updateOrganization(orgId, updates) {
    const s = loadStore();
    const idx = (s.organizations || []).findIndex(function(o) { return organizationIdsMatch(o.id, orgId); });
    if (idx === -1) return false;
    if (updates.name !== undefined) s.organizations[idx].name = updates.name;
    if (updates.mapObjectLimitUnlocked !== undefined) s.organizations[idx].mapObjectLimitUnlocked = !!updates.mapObjectLimitUnlocked;
    if (updates.customMapObjectLimit !== undefined) {
        if (updates.customMapObjectLimit === null || updates.customMapObjectLimit === '') {
            s.organizations[idx].customMapObjectLimit = null;
        } else {
            var lim = typeof updates.customMapObjectLimit === 'number' ? updates.customMapObjectLimit : parseInt(updates.customMapObjectLimit, 10);
            s.organizations[idx].customMapObjectLimit = (isNaN(lim) || lim < 1) ? null : lim;
        }
    }
    if (updates.status !== undefined) s.organizations[idx].status = updates.status;
    if (updates.contactEmail !== undefined) s.organizations[idx].contactEmail = String(updates.contactEmail).trim();
    if (updates.maxConcurrentUsers !== undefined) {
        if (updates.maxConcurrentUsers === null || updates.maxConcurrentUsers === '') {
            s.organizations[idx].maxConcurrentUsers = null;
        } else {
            var mcu = typeof updates.maxConcurrentUsers === 'number' ? updates.maxConcurrentUsers : parseInt(updates.maxConcurrentUsers, 10);
            s.organizations[idx].maxConcurrentUsers = (isNaN(mcu) ? null : mcu);
        }
    }
    if (updates.twoFactorEnabled !== undefined) s.organizations[idx].twoFactorEnabled = !!updates.twoFactorEnabled;
    if (updates.twoFactorSecret !== undefined) {
        s.organizations[idx].twoFactorSecret = updates.twoFactorSecret ? String(updates.twoFactorSecret) : null;
    }
    saveStore();
    return true;
}

function deleteOrganization(orgId) {
    const s = loadStore();
    s.organizations = (s.organizations || []).filter(function(o) { return !organizationIdsMatch(o.id, orgId); });
    if (s.mapDataByOrg && typeof s.mapDataByOrg === 'object') {
        Object.keys(s.mapDataByOrg).forEach(function(k) {
            if (organizationIdsMatch(k, orgId)) delete s.mapDataByOrg[k];
        });
    }
    if (s.historyByOrg && typeof s.historyByOrg === 'object') {
        Object.keys(s.historyByOrg).forEach(function(k) {
            if (organizationIdsMatch(k, orgId)) delete s.historyByOrg[k];
        });
    }
    if (s.settingsByOrg && typeof s.settingsByOrg === 'object') {
        Object.keys(s.settingsByOrg).forEach(function(k) {
            if (organizationIdsMatch(k, orgId)) delete s.settingsByOrg[k];
        });
    }
    if (s.chatByOrg && typeof s.chatByOrg === 'object') {
        Object.keys(s.chatByOrg).forEach(function(k) {
            if (organizationIdsMatch(k, orgId)) delete s.chatByOrg[k];
        });
    }
    if (s.chatMediaByOrg && typeof s.chatMediaByOrg === 'object') {
        Object.keys(s.chatMediaByOrg).forEach(function(k) {
            if (organizationIdsMatch(k, orgId)) delete s.chatMediaByOrg[k];
        });
    }
    // Удаляем всех пользователей этой организации (кроме глобального админа без organizationId)
    if (Array.isArray(s.users)) {
        s.users = s.users.filter(function(u) {
            // Пользователь относится к удаляемой организации?
            if (organizationIdsMatch(u.organizationId, orgId)) return false;
            return true;
        });
    }
    // Удаляем все сессии этой организации
    if (Array.isArray(s.sessions)) {
        s.sessions = s.sessions.filter(function(ses) { return !organizationIdsMatch(ses.organization_id, orgId); });
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
        // Карточка «снять лимит» на лендинге — кнопка ведёт в контакты
        s.pricingPlans = [
            {
                id: 'unlock',
                title: 'Безлимит объектов',
                short: 'Снимите лимит для вашей организации — навсегда',
                price: 'по договорённости',
                period: '',
                maxUsersText: 'Неограниченное число узлов, кроссов, муфт и др. на карте',
                order: 0,
                highlighted: true,
                ctaText: 'Связаться с владельцем',
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
    const sessions = getSessions();
    return sessions.filter(function(ses) {
        return organizationIdsMatch(ses.organization_id, orgId) && sessionIsActive(ses);
    }).length;
}

function countActiveSessionsForUser(userId) {
    if (userId == null) return 0;
    const id = String(userId);
    const sessions = getSessions();
    return sessions.filter(function(ses) {
        return String(ses.user_id) === id && sessionIsActive(ses);
    }).length;
}

/** Удаляет только просроченные сессии пользователя (не трогает активные — важно для «сессия занята»). */
function deleteExpiredSessionsForUser(userId) {
    if (userId == null) return;
    const s = loadStore();
    if (!Array.isArray(s.sessions)) s.sessions = [];
    var id = String(userId);
    s.sessions = s.sessions.filter(function(ses) {
        if (String(ses.user_id) !== id) return true;
        return sessionIsActive(ses);
    });
    saveStore();
}

function deleteSessionsForOrganization(orgId) {
    if (!orgId) return;
    const s = loadStore();
    if (!Array.isArray(s.sessions)) s.sessions = [];
    s.sessions = s.sessions.filter(function(ses) {
        return !organizationIdsMatch(ses.organization_id, orgId);
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
    let customDeviceOptions = getSetting('customDeviceOptions');
    if (orgId) {
        const s = loadStore();
        const byOrg = (s.settingsByOrg || {})[orgId];
        if (byOrg && typeof byOrg === 'object') {
            if (byOrg.theme !== undefined) theme = byOrg.theme;
            if (byOrg.groupNames !== undefined) groupNames = byOrg.groupNames;
            if (byOrg.customDeviceOptions !== undefined) customDeviceOptions = byOrg.customDeviceOptions;
        }
    }
    let parsedGroupNames = {};
    let parsedCustomDevice = { manufacturers: [], models: [] };
    try {
        parsedGroupNames = groupNames ? (typeof groupNames === 'string' ? JSON.parse(groupNames) : groupNames) : {};
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
        if (obj.customDeviceOptions !== undefined) o.customDeviceOptions = typeof obj.customDeviceOptions === 'string' ? obj.customDeviceOptions : JSON.stringify(obj.customDeviceOptions);
        delete o.netboxConfig;
        saveStore();
        return;
    }
    if (obj.theme !== undefined) setSetting('theme', obj.theme);
    if (obj.groupNames !== undefined) setSetting('groupNames', typeof obj.groupNames === 'string' ? obj.groupNames : JSON.stringify(obj.groupNames));
    if (obj.customDeviceOptions !== undefined) setSetting('customDeviceOptions', typeof obj.customDeviceOptions === 'string' ? obj.customDeviceOptions : JSON.stringify(obj.customDeviceOptions));
}

function normalizeMapStartRecord(data) {
    if (!data) return null;
    var parsed = data;
    if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed); } catch (e) { return null; }
    }
    if (!parsed || !Array.isArray(parsed.center) || parsed.center.length < 2) return null;
    var lat = Number(parsed.center[0]);
    var lon = Number(parsed.center[1]);
    var zoom = Number(parsed.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (!Number.isFinite(zoom) || zoom < 1 || zoom > 21) zoom = 15;
    return { center: [lat, lon], zoom: zoom };
}

function getMapStartForUser(userId) {
    const raw = getSetting('userMapStarts');
    if (!raw) return null;
    try {
        const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const data = map && userId ? map[String(userId)] : null;
        return normalizeMapStartRecord(data);
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
    const normalized = normalizeMapStartRecord(data);
    if (!normalized) {
        if (userId) delete map[String(userId)];
    } else {
        map[String(userId)] = normalized;
    }
    s.settings.userMapStarts = JSON.stringify(map);
    saveStore();
}

function getMapStartForOrg(orgId) {
    if (!orgId) return null;
    const s = loadStore();
    const byOrg = (s.settingsByOrg || {})[orgId];
    if (!byOrg || byOrg.mapStart == null) return null;
    return normalizeMapStartRecord(byOrg.mapStart);
}

function setMapStartForOrg(orgId, data) {
    if (!orgId) return;
    const s = loadStore();
    if (!s.settingsByOrg) s.settingsByOrg = {};
    if (!s.settingsByOrg[orgId]) s.settingsByOrg[orgId] = {};
    const normalized = normalizeMapStartRecord(data);
    if (!normalized) {
        delete s.settingsByOrg[orgId].mapStart;
    } else {
        s.settingsByOrg[orgId].mapStart = normalized;
    }
    saveStore();
}

function getMapStartForUserOrOrg(userId, orgId) {
    const userStart = getMapStartForUser(userId);
    if (userStart) return userStart;
    const orgStart = orgId ? getMapStartForOrg(orgId) : null;
    if (orgStart && userId) setMapStartForUser(userId, orgStart);
    return orgStart;
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
    if (!organizationIdsMatch(payloadOrgId, orgId)) throw new Error('Бэкап принадлежит другой организации');
    const s = loadStore();
    if (!s.mapDataByOrg || typeof s.mapDataByOrg !== 'object') s.mapDataByOrg = {};
    if (!s.historyByOrg || typeof s.historyByOrg !== 'object') s.historyByOrg = {};
    if (!s.settingsByOrg || typeof s.settingsByOrg !== 'object') s.settingsByOrg = {};
    var org = getOrganization(orgId);
    var key = org ? org.id : orgId;

    s.mapDataByOrg[key] = Array.isArray(parsed.mapData) ? parsed.mapData : [];
    s.historyByOrg[key] = Array.isArray(parsed.history) ? parsed.history : [];
    var restoredSettings = (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {};
    delete restoredSettings.netboxConfig;
    s.settingsByOrg[key] = restoredSettings;

    saveStore();
    deleteSessionsForOrganization(orgId);
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

function addVisitLog(entry) {
    const s = loadStore();
    if (!Array.isArray(s.visitLogs)) s.visitLogs = [];
    var item = {
        at: entry && entry.at ? String(entry.at) : new Date().toISOString(),
        username: entry && entry.username ? String(entry.username) : '',
        userId: entry && entry.userId ? String(entry.userId) : '',
        organizationId: entry && entry.organizationId ? String(entry.organizationId) : '',
        ip: entry && entry.ip ? String(entry.ip) : '',
        source: entry && entry.source ? String(entry.source) : '',
        userAgent: entry && entry.userAgent ? String(entry.userAgent) : ''
    };
    s.visitLogs.push(item);
    // Ограничиваем размер журнала, чтобы store.json не разрастался бесконечно.
    var MAX_VISIT_LOGS = 5000;
    if (s.visitLogs.length > MAX_VISIT_LOGS) {
        s.visitLogs = s.visitLogs.slice(s.visitLogs.length - MAX_VISIT_LOGS);
    }
    saveStore();
}

function getVisitLogs() {
    const s = loadStore();
    return Array.isArray(s.visitLogs) ? s.visitLogs : [];
}

const MAINTENANCE_NOTICE_DEFAULTS = {
    enabled: false,
    title: 'Технические работы',
    message: '',
    startsAt: null,
    endsAt: null,
    id: '',
    updatedAt: null
};

function parseMaintenanceNoticeRaw(raw) {
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return null;
    }
}

function normalizeMaintenanceNotice(obj) {
    const src = obj && typeof obj === 'object' ? obj : {};
    const title = String(src.title != null ? src.title : MAINTENANCE_NOTICE_DEFAULTS.title).trim() || MAINTENANCE_NOTICE_DEFAULTS.title;
    const message = String(src.message != null ? src.message : '').trim();
    const startsAt = src.startsAt ? String(src.startsAt).trim() : null;
    const endsAt = src.endsAt ? String(src.endsAt).trim() : null;
    return {
        enabled: !!src.enabled,
        title: title,
        message: message,
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        id: src.id ? String(src.id) : '',
        updatedAt: src.updatedAt ? String(src.updatedAt) : null
    };
}

function isMaintenanceNoticeActive(notice) {
    const n = normalizeMaintenanceNotice(notice);
    if (!n.enabled || !n.message) return false;
    const now = Date.now();
    if (n.startsAt) {
        const s = new Date(n.startsAt).getTime();
        if (!isNaN(s) && now < s) return false;
    }
    if (n.endsAt) {
        const e = new Date(n.endsAt).getTime();
        if (!isNaN(e) && now > e) return false;
    }
    return true;
}

function getMaintenanceNotice() {
    const parsed = parseMaintenanceNoticeRaw(getSetting('maintenanceNotice'));
    return normalizeMaintenanceNotice(parsed || MAINTENANCE_NOTICE_DEFAULTS);
}

function setMaintenanceNotice(patch) {
    const prev = getMaintenanceNotice();
    const next = normalizeMaintenanceNotice(Object.assign({}, prev, patch || {}));
    const contentChanged = patch && (
        patch.message !== undefined && String(patch.message).trim() !== prev.message ||
        patch.title !== undefined && String(patch.title).trim() !== prev.title ||
        patch.startsAt !== undefined && (patch.startsAt || null) !== (prev.startsAt || null) ||
        patch.endsAt !== undefined && (patch.endsAt || null) !== (prev.endsAt || null)
    );
    if (patch && patch.enabled && (contentChanged || !prev.id)) {
        next.id = 'mn_' + Date.now();
    } else if (!next.id && next.enabled && next.message) {
        next.id = 'mn_' + Date.now();
    }
    next.updatedAt = new Date().toISOString();
    setSetting('maintenanceNotice', JSON.stringify(next));
    return next;
}

function getPlatformLimitsConfig() {
    const s = loadStore();
    var limit = 2000;
    var concurrent = 4;
    var limitFromStore = false;
    var concurrentFromStore = false;
    if (s.settings && s.settings.defaultFreeMapObjectLimit != null && s.settings.defaultFreeMapObjectLimit !== '') {
        var n = parseInt(String(s.settings.defaultFreeMapObjectLimit), 10);
        if (!isNaN(n) && n >= 1) {
            limit = Math.min(999999, n);
            limitFromStore = true;
        }
    }
    if (s.settings && s.settings.defaultMaxConcurrentUsers != null && s.settings.defaultMaxConcurrentUsers !== '') {
        var c = parseInt(String(s.settings.defaultMaxConcurrentUsers), 10);
        if (!isNaN(c) && c >= 1) {
            concurrent = Math.min(999, c);
            concurrentFromStore = true;
        } else if (c === -1) {
            concurrent = -1;
            concurrentFromStore = true;
        }
    }
    return {
        defaultFreeMapObjectLimit: limit,
        defaultMaxConcurrentUsers: concurrent,
        fromStore: { limit: limitFromStore, concurrent: concurrentFromStore }
    };
}

function setPlatformLimitsConfig(patch) {
    if (!patch || typeof patch !== 'object') return getPlatformLimitsConfig();
    if (patch.defaultFreeMapObjectLimit !== undefined) {
        var lim = typeof patch.defaultFreeMapObjectLimit === 'number'
            ? patch.defaultFreeMapObjectLimit
            : parseInt(String(patch.defaultFreeMapObjectLimit), 10);
        if (!isNaN(lim) && lim >= 1) setSetting('defaultFreeMapObjectLimit', String(Math.min(999999, lim)));
    }
    if (patch.defaultMaxConcurrentUsers !== undefined) {
        var cu = typeof patch.defaultMaxConcurrentUsers === 'number'
            ? patch.defaultMaxConcurrentUsers
            : parseInt(String(patch.defaultMaxConcurrentUsers), 10);
        if (!isNaN(cu)) setSetting('defaultMaxConcurrentUsers', String(cu < 0 ? -1 : Math.min(999, cu)));
    }
    return getPlatformLimitsConfig();
}

var DEFAULT_FREE_CARD = {
    title: 'Бесплатно',
    short: 'Полный функционал карты в пределах лимита объектов',
    price: '0 ₽',
    period: 'навсегда',
    ctaText: 'Создать организацию',
    metaLine: ''
};

function getFreeCardConfig() {
    const s = loadStore();
    var card = {
        title: DEFAULT_FREE_CARD.title,
        short: DEFAULT_FREE_CARD.short,
        price: DEFAULT_FREE_CARD.price,
        period: DEFAULT_FREE_CARD.period,
        ctaText: DEFAULT_FREE_CARD.ctaText,
        metaLine: DEFAULT_FREE_CARD.metaLine
    };
    if (s.settings) {
        if (s.settings.freeCardTitle != null && String(s.settings.freeCardTitle).trim() !== '') {
            card.title = String(s.settings.freeCardTitle).trim().slice(0, 120);
        }
        if (s.settings.freeCardShort != null) card.short = String(s.settings.freeCardShort).trim().slice(0, 500);
        if (s.settings.freeCardPrice != null && String(s.settings.freeCardPrice).trim() !== '') {
            card.price = String(s.settings.freeCardPrice).trim().slice(0, 80);
        }
        if (s.settings.freeCardPeriod != null) card.period = String(s.settings.freeCardPeriod).trim().slice(0, 80);
        if (s.settings.freeCardCta != null && String(s.settings.freeCardCta).trim() !== '') {
            card.ctaText = String(s.settings.freeCardCta).trim().slice(0, 80);
        }
        if (s.settings.freeCardMeta != null) card.metaLine = String(s.settings.freeCardMeta).trim().slice(0, 300);
    }
    return card;
}

function setFreeCardConfig(patch) {
    if (!patch || typeof patch !== 'object') return getFreeCardConfig();
    if (patch.title !== undefined) setSetting('freeCardTitle', String(patch.title || '').trim());
    if (patch.short !== undefined) setSetting('freeCardShort', String(patch.short || '').trim());
    if (patch.price !== undefined) setSetting('freeCardPrice', String(patch.price || '').trim());
    if (patch.period !== undefined) setSetting('freeCardPeriod', String(patch.period || '').trim());
    if (patch.ctaText !== undefined) setSetting('freeCardCta', String(patch.ctaText || '').trim());
    if (patch.metaLine !== undefined) setSetting('freeCardMeta', String(patch.metaLine || '').trim());
    return getFreeCardConfig();
}

function getShowcaseConfig() {
    var limits = getPlatformLimitsConfig();
    return {
        defaultFreeMapObjectLimit: limits.defaultFreeMapObjectLimit,
        defaultMaxConcurrentUsers: limits.defaultMaxConcurrentUsers,
        freeCard: getFreeCardConfig(),
        plans: getPricingPlans()
    };
}

function setShowcaseConfig(patch) {
    if (!patch || typeof patch !== 'object') return getShowcaseConfig();
    if (patch.defaultFreeMapObjectLimit !== undefined || patch.defaultMaxConcurrentUsers !== undefined) {
        setPlatformLimitsConfig({
            defaultFreeMapObjectLimit: patch.defaultFreeMapObjectLimit,
            defaultMaxConcurrentUsers: patch.defaultMaxConcurrentUsers
        });
    }
    if (patch.freeCard) setFreeCardConfig(patch.freeCard);
    if (Array.isArray(patch.plans)) setPricingPlans(patch.plans);
    return getShowcaseConfig();
}

function getPublicMaintenanceNotice() {
    const notice = getMaintenanceNotice();
    const active = isMaintenanceNoticeActive(notice);
    return {
        active: active,
        id: notice.id || '',
        title: notice.title,
        message: notice.message,
        startsAt: notice.startsAt,
        endsAt: notice.endsAt
    };
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
    getOrgChat,
    addOrgChatMessage,
    getChatMedia,
    getChatMediaItem,
    addChatMedia,
    removeChatMedia,
    getSettings,
    setSettings,
    getSetting,
    setSetting,
    getMapStartForUser,
    setMapStartForUser,
    getMapStartForOrg,
    setMapStartForOrg,
    getMapStartForUserOrOrg,
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
    sessionIsActive,
    countActiveSessionsForOrganization,
    countActiveSessionsForUser,
    deleteExpiredSessionsForUser,
    deleteSessionsForOrganization,
    deleteSessionsForUser,
    getPricingPlans,
    setPricingPlans,
    getPublicStats,
    countActualMapObjectsInArray,
    countMapObjectsForOrganization,
    addVisitLog,
    getVisitLogs,
    getMaintenanceNotice,
    setMaintenanceNotice,
    getPublicMaintenanceNotice,
    isMaintenanceNoticeActive,
    getPlatformLimitsConfig,
    setPlatformLimitsConfig,
    getFreeCardConfig,
    setFreeCardConfig,
    getShowcaseConfig,
    setShowcaseConfig
};
