const path = require('path');
const fs = require('fs');
const { sanitizeNewsBody } = require('./news-sanitize');
const { isMysqlEnabled, closePool } = require('./db/mysql');
const cpuPool = require('./lib/cpu-pool');

const ROOT_DIR = path.join(__dirname, '..');
const STORE_PATH = process.env.DB_PATH ? process.env.DB_PATH.replace(/\.db$/i, '-store.json') : path.join(ROOT_DIR, 'data', 'store.json');
const BACKUPS_DIR = path.join(path.dirname(STORE_PATH), 'backups');
const FULL_BACKUPS_DIR = path.join(BACKUPS_DIR, 'full');
const BACKUP_RETENTION_DAYS = 30;
const FULL_SNAPSHOT_KEEP = 48;
const FULL_SNAPSHOT_MIN_INTERVAL_MS = 60 * 60 * 1000;
const DANGEROUS_SAVE_MIN_EXISTING_BYTES = 50 * 1024;
const DANGEROUS_SAVE_RATIO = 0.15;
const MAP_SHRINK_MIN_EXISTING = 20;
const MAP_SHRINK_RATIO = 0.2;
const MYSQL_PERSIST_DEBOUNCE_MS = 400;
const JSON_SAVE_DEBOUNCE_MS = 120;
/** При большем числе объектов карты stringify уходит в worker_threads. */
const JSON_SAVE_OFFLOAD_MIN_OBJECTS = 80;
const MIRROR_JSON = String(process.env.MYSQL_MIRROR_JSON || '').trim() === '1';

let store = null;
let lastFullSnapshotAt = 0;
let allowDangerousSaveOnce = false;
let mysqlInitialized = false;
let mysqlPersistTimer = null;
let mysqlPersistChain = Promise.resolve();
let mysqlPersistDirty = false;
let jsonSaveTimer = null;
let jsonSaveDirty = false;
let jsonSaveChain = Promise.resolve();
let jsonSaveSyncFallback = false;

/** РЎСЂР°РІРЅРµРЅРёРµ id РѕСЂРіР°РЅРёР·Р°С†РёРё Р±РµР· СѓС‡С‘С‚Р° С‚РёРїР° (СЃС‚СЂРѕРєР°/С‡РёСЃР»Рѕ), С‡С‚РѕР±С‹ Р»РёРјРёС‚С‹ Рё РґР°РЅРЅС‹Рµ РЅРµ В«С‚РµСЂСЏР»РёСЃСЊВ». */
function organizationIdsMatch(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

/** РђРєС‚РёРІРЅР° Р»Рё СЃРµСЃСЃРёСЏ РїРѕ expires_at (СЃС‚СЂРѕРєР° ISO, С‡РёСЃР»Рѕ ms/s, Р±РµР· РїРѕР»СЏ = РЅРµС‚). */
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

function ensureFullBackupsDir() {
    if (!fs.existsSync(FULL_BACKUPS_DIR)) fs.mkdirSync(FULL_BACKUPS_DIR, { recursive: true });
    return FULL_BACKUPS_DIR;
}

function emptyStoreSkeleton() {
    return {
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
        visitLogs: [],
        deviceTokens: [],
        supportThreads: [],
        passwordResetTokens: [],
        emailVerificationTokens: []
    };
}

function normalizeStoreShape(s) {
    if (!s || typeof s !== 'object') return emptyStoreSkeleton();
    if (!s.sessions) s.sessions = [];
    if (!s.settings) s.settings = {};
    if (!Array.isArray(s.organizations)) s.organizations = [];
    if (typeof s.mapDataByOrg !== 'object' || !s.mapDataByOrg) s.mapDataByOrg = {};
    if (typeof s.historyByOrg !== 'object' || !s.historyByOrg) s.historyByOrg = {};
    if (typeof s.settingsByOrg !== 'object' || !s.settingsByOrg) s.settingsByOrg = {};
    if (typeof s.chatByOrg !== 'object' || !s.chatByOrg) s.chatByOrg = {};
    if (typeof s.chatMediaByOrg !== 'object' || !s.chatMediaByOrg) s.chatMediaByOrg = {};
    if (!Array.isArray(s.pricingPlans)) s.pricingPlans = [];
    if (!Array.isArray(s.deviceTokens)) s.deviceTokens = [];
    if (!Array.isArray(s.visitLogs)) s.visitLogs = [];
    if (!Array.isArray(s.supportThreads)) s.supportThreads = [];
    if (!Array.isArray(s.passwordResetTokens)) s.passwordResetTokens = [];
    if (!Array.isArray(s.emailVerificationTokens)) s.emailVerificationTokens = [];
    if (!Array.isArray(s.mapData)) s.mapData = [];
    if (!Array.isArray(s.users)) s.users = [];
    if (!Array.isArray(s.history)) s.history = [];
    return s;
}

function countMapDataByOrgItems(mapDataByOrg) {
    if (!mapDataByOrg || typeof mapDataByOrg !== 'object') return 0;
    var n = 0;
    Object.keys(mapDataByOrg).forEach(function (k) {
        if (Array.isArray(mapDataByOrg[k])) n += mapDataByOrg[k].length;
    });
    return n;
}

function tryParseStoreFile(filePath) {
    try {
        var raw = fs.readFileSync(filePath, 'utf8');
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return normalizeStoreShape(parsed);
    } catch (e) {
        return null;
    }
}

function findLastKnownGoodStore() {
    var candidates = [];
    var dir = path.dirname(STORE_PATH);
    try {
        fs.readdirSync(dir).forEach(function (name) {
            if (name === 'store.json') return;
            if (/^store\.json\.(bak|before|corrupt)/i.test(name) || /^store\.full-/i.test(name) || name.endsWith('.bak')) {
                candidates.push(path.join(dir, name));
            }
        });
    } catch (e) {}
    try {
        if (fs.existsSync(FULL_BACKUPS_DIR)) {
            fs.readdirSync(FULL_BACKUPS_DIR).forEach(function (name) {
                if (/^store-.*\.json$/i.test(name)) candidates.push(path.join(FULL_BACKUPS_DIR, name));
            });
        }
    } catch (e2) {}
    candidates = candidates
        .map(function (p) {
            try {
                return { path: p, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size };
            } catch (e3) {
                return null;
            }
        })
        .filter(Boolean)
        .sort(function (a, b) { return b.mtime - a.mtime; });
    for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].size < 100) continue;
        var parsed = tryParseStoreFile(candidates[i].path);
        if (!parsed) continue;
        var hasData = (parsed.organizations && parsed.organizations.length) ||
            (parsed.users && parsed.users.length) ||
            countMapDataByOrgItems(parsed.mapDataByOrg) > 0;
        if (hasData) {
            console.warn('[DB] Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ last-known-good РёР·:', candidates[i].path);
            return parsed;
        }
    }
    return null;
}

function loadStore() {
    if (store) return store;
    if (isMysqlEnabled()) {
        if (!mysqlInitialized) {
            throw new Error('MySQL storage not initialized вЂ” await db.initStorage() before use');
        }
        return store;
    }
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        var recovered = findLastKnownGoodStore();
        if (recovered) {
            store = recovered;
            allowDangerousSaveOnce = true;
            saveStore();
            allowDangerousSaveOnce = false;
            migrateToOrganizations();
            return store;
        }
        store = emptyStoreSkeleton();
        allowDangerousSaveOnce = true;
        saveStore();
        allowDangerousSaveOnce = false;
        return store;
    }
    try {
        store = normalizeStoreShape(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')));
    } catch (e) {
        var corruptPath = STORE_PATH + '.corrupt-' + Date.now();
        try {
            fs.copyFileSync(STORE_PATH, corruptPath);
            console.error('[DB] РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ store.json, РєРѕРїРёСЏ:', corruptPath, e.message);
        } catch (copyErr) {
            console.error('[DB] РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕС‡РёС‚Р°С‚СЊ store.json:', e.message);
        }
        var recoveredAfterCorrupt = findLastKnownGoodStore();
        if (recoveredAfterCorrupt) {
            store = recoveredAfterCorrupt;
            allowDangerousSaveOnce = true;
            saveStore();
            allowDangerousSaveOnce = false;
        } else {
            // РќРµ Р·Р°С‚РёСЂР°РµРј Р±РёС‚С‹Р№ С„Р°Р№Р» РїСѓСЃС‚С‹Рј store вЂ” РїРѕРґРЅРёРјР°РµРј in-memory РїСѓСЃС‚РѕР№ С‚РѕР»СЊРєРѕ РґР»СЏ Р°РІР°СЂРёР№РЅРѕРіРѕ СЃС‚Р°СЂС‚Р°
            store = emptyStoreSkeleton();
            console.error('[DB] Р’РђР–РќРћ: store.json РїРѕРІСЂРµР¶РґС‘РЅ Рё last-known-good РЅРµ РЅР°Р№РґРµРЅ. РџСѓСЃС‚РѕР№ store РІ РїР°РјСЏС‚Рё, РґРёСЃРє РЅРµ РїРµСЂРµР·Р°РїРёСЃР°РЅ.');
        }
    }
    migrateToOrganizations();
    return store;
}

/**
 * Async bootstrap: migrations + hydrate when storage=mysql; otherwise sync JSON load.
 * Must be awaited before accepting HTTP / calling getDb() in MySQL mode.
 */
async function initStorage() {
    if (isMysqlEnabled()) {
        const { runMigrations } = require('./db/migrate');
        const mysqlPersist = require('./db/mysql-persist');
        await runMigrations();
        store = normalizeStoreShape(await mysqlPersist.hydrateStoreFromMysql());
        migrateToOrganizations();
        mysqlInitialized = true;
        initSchema();
        console.log('[DB] Storage: MySQL (' +
            ((store.organizations || []).length) + ' orgs, ' +
            ((store.users || []).length) + ' users, ' +
            countMapDataByOrgItems(store.mapDataByOrg) + ' map items)');
        return store;
    }
    mysqlInitialized = false;
    loadStore();
    initSchema();
    console.log('[DB] Storage: JSON (' + STORE_PATH + ')');
    return store;
}

function scheduleMysqlPersist() {
    mysqlPersistDirty = true;
    if (mysqlPersistTimer) clearTimeout(mysqlPersistTimer);
    mysqlPersistTimer = setTimeout(function () {
        mysqlPersistTimer = null;
        flushMysqlPersist().catch(function (e) {
            console.error('[DB] MySQL persist failed:', e && e.message ? e.message : e);
        });
    }, MYSQL_PERSIST_DEBOUNCE_MS);
}

async function flushMysqlPersist() {
    if (!isMysqlEnabled() || !store || !mysqlInitialized) return;
    if (mysqlPersistTimer) {
        clearTimeout(mysqlPersistTimer);
        mysqlPersistTimer = null;
    }
    if (!mysqlPersistDirty) return;
    mysqlPersistDirty = false;
    const snapshot = store;
    const mysqlPersist = require('./db/mysql-persist');
    mysqlPersistChain = mysqlPersistChain.then(async function () {
        await mysqlPersist.persistStoreToMysql(snapshot, { skipRelationalMap: false });
    }).catch(function (e) {
        mysqlPersistDirty = true;
        console.error('[DB] MySQL persist error:', e && e.message ? e.message : e);
    });
    await mysqlPersistChain;
}

function writeJsonStoreFile(json, existingRaw, storeObj) {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (existingRaw && isDangerousStoreShrink(existingRaw, json, storeObj || store)) {
        var rejectedPath = STORE_PATH + '.rejected-' + Date.now();
        try { fs.writeFileSync(rejectedPath, json, 'utf8'); } catch (e2) {}
        console.error('[DB] REFUSED dangerous save (shrink). Rejected payload:', rejectedPath,
            'existingBytes=', existingRaw.length, 'newBytes=', json.length);
        var err = new Error('Отказ записи: попытка затереть большую базу уменьшенными данными');
        err.code = 'DB_DANGEROUS_SAVE';
        throw err;
    }
    const tmpPath = STORE_PATH + '.tmp.' + Date.now();
    try {
        fs.writeFileSync(tmpPath, json, 'utf8');
        fs.renameSync(tmpPath, STORE_PATH);
        maybeWriteRotatingFullSnapshot(STORE_PATH);
    } catch (e) {
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        throw e;
    }
}

function exportLogicalStoreSnapshot(label) {
    if (!store) return null;
    ensureFullBackupsDir();
    var stamp = formatSnapshotStamp(new Date());
    var name = label ? ('store-' + label + '-' + stamp + '.json') : ('store-' + stamp + '.json');
    var outPath = path.join(FULL_BACKUPS_DIR, name);
    fs.writeFileSync(outPath, JSON.stringify(store, null, 0), 'utf8');
    pruneFullSnapshots(FULL_SNAPSHOT_KEEP);
    return { filename: name, path: outPath };
}

function migrateToOrganizations() {
    const s = store;
    if (s.organizations && s.organizations.length > 0) return;

    const existingMapByOrg = (s.mapDataByOrg && typeof s.mapDataByOrg === 'object') ? s.mapDataByOrg : {};
    const existingHistByOrg = (s.historyByOrg && typeof s.historyByOrg === 'object') ? s.historyByOrg : {};
    const existingSettingsByOrg = (s.settingsByOrg && typeof s.settingsByOrg === 'object') ? s.settingsByOrg : {};
    const hasOrgMaps = countMapDataByOrgItems(existingMapByOrg) > 0 || Object.keys(existingMapByOrg).length > 0;

    // Р•СЃР»Рё mapDataByOrg СѓР¶Рµ РµСЃС‚СЊ вЂ” РЅРµ Р·Р°С‚РёСЂР°РµРј РµРіРѕ, С‚РѕР»СЊРєРѕ СЃРѕР·РґР°С‘Рј org-Р·Р°РїРёСЃРё РїСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё
    if (hasOrgMaps) {
        s.organizations = s.organizations || [];
        Object.keys(existingMapByOrg).forEach(function (orgId) {
            var exists = s.organizations.some(function (o) { return organizationIdsMatch(o.id, orgId); });
            if (!exists) {
                s.organizations.push({
                    id: orgId,
                    name: 'РћСЂРіР°РЅРёР·Р°С†РёСЏ ' + String(orgId).slice(-8),
                    mapObjectLimitUnlocked: false,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
            }
        });
        s.mapDataByOrg = existingMapByOrg;
        s.historyByOrg = existingHistByOrg;
        s.settingsByOrg = existingSettingsByOrg;
        saveStore();
        return;
    }

    const hasLegacyData = (Array.isArray(s.mapData) && s.mapData.length > 0) || (Array.isArray(s.history) && s.history.length > 0);
    const defaultOrgId = 'org_default_' + Date.now();
    s.organizations = [{
        id: defaultOrgId,
        name: 'РџРѕ СѓРјРѕР»С‡Р°РЅРёСЋ',
        mapObjectLimitUnlocked: false,
        status: 'active',
        createdAt: new Date().toISOString()
    }];
    // РќРµ РѕР±РЅСѓР»СЏРµРј СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёРµ РєР»СЋС‡Рё Р±РµР· РЅСѓР¶РґС‹ вЂ” С‚РѕР»СЊРєРѕ РµСЃР»Рё РїСѓСЃС‚Рѕ
    if (!s.mapDataByOrg || typeof s.mapDataByOrg !== 'object') s.mapDataByOrg = {};
    if (!s.historyByOrg || typeof s.historyByOrg !== 'object') s.historyByOrg = {};
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

function isDangerousStoreShrink(existingRaw, newJson, newStoreObj) {
    if (allowDangerousSaveOnce) return false;
    if (!existingRaw || existingRaw.length < DANGEROUS_SAVE_MIN_EXISTING_BYTES) return false;
    if (newJson.length >= Math.floor(existingRaw.length * DANGEROUS_SAVE_RATIO)) {
        // size ok вЂ” still check structural wipe
    } else {
        return true;
    }
    try {
        var oldObj = JSON.parse(existingRaw);
        var oldOrgs = (oldObj.organizations && oldObj.organizations.length) || 0;
        var oldUsers = (oldObj.users && oldObj.users.length) || 0;
        var oldMaps = countMapDataByOrgItems(oldObj.mapDataByOrg);
        var newOrgs = (newStoreObj.organizations && newStoreObj.organizations.length) || 0;
        var newUsers = (newStoreObj.users && newStoreObj.users.length) || 0;
        var newMaps = countMapDataByOrgItems(newStoreObj.mapDataByOrg);
        if ((oldOrgs > 0 && newOrgs === 0) || (oldUsers > 0 && newUsers === 0)) return true;
        if (oldMaps >= MAP_SHRINK_MIN_EXISTING && newMaps < Math.floor(oldMaps * MAP_SHRINK_RATIO)) return true;
    } catch (e) {
        // if old unreadable, don't block
    }
    return false;
}

function formatSnapshotStamp(d) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' +
        pad(d.getHours()) + pad(d.getMinutes());
}

function pruneFullSnapshots(keepCount) {
    keepCount = keepCount || FULL_SNAPSHOT_KEEP;
    try {
        ensureFullBackupsDir();
        var files = fs.readdirSync(FULL_BACKUPS_DIR)
            .filter(function (f) { return /^store-.*\.json$/i.test(f); })
            .map(function (f) {
                var p = path.join(FULL_BACKUPS_DIR, f);
                try { return { name: f, path: p, mtime: fs.statSync(p).mtimeMs }; } catch (e) { return null; }
            })
            .filter(Boolean)
            .sort(function (a, b) { return b.mtime - a.mtime; });
        for (var i = keepCount; i < files.length; i++) {
            try { fs.unlinkSync(files[i].path); } catch (e2) {}
        }
    } catch (e) {
        console.error('[DB] pruneFullSnapshots:', e.message);
    }
}

function maybeWriteRotatingFullSnapshot(sourcePathOrBuffer) {
    var now = Date.now();
    if (now - lastFullSnapshotAt < FULL_SNAPSHOT_MIN_INTERVAL_MS) return;
    try {
        ensureFullBackupsDir();
        var stamp = formatSnapshotStamp(new Date());
        var dest = path.join(FULL_BACKUPS_DIR, 'store-' + stamp + '.json');
        if (typeof sourcePathOrBuffer === 'string' && fs.existsSync(sourcePathOrBuffer)) {
            fs.copyFileSync(sourcePathOrBuffer, dest);
        } else if (Buffer.isBuffer(sourcePathOrBuffer) || typeof sourcePathOrBuffer === 'string') {
            fs.writeFileSync(dest, sourcePathOrBuffer, 'utf8');
        } else if (fs.existsSync(STORE_PATH)) {
            fs.copyFileSync(STORE_PATH, dest);
        } else {
            return;
        }
        lastFullSnapshotAt = now;
        pruneFullSnapshots(FULL_SNAPSHOT_KEEP);
        console.log('[DB] Full snapshot:', path.basename(dest));
    } catch (e) {
        console.error('[DB] Full snapshot error:', e.message);
    }
}

function countStoreMapObjects(s) {
    if (!s) return 0;
    var n = 0;
    if (s.mapDataByOrg && typeof s.mapDataByOrg === 'object') {
        Object.keys(s.mapDataByOrg).forEach(function (orgId) {
            var arr = s.mapDataByOrg[orgId];
            if (Array.isArray(arr)) n += arr.length;
        });
    }
    if (Array.isArray(s.mapData)) n += s.mapData.length;
    return n;
}

function shouldOffloadJsonSave(s) {
    if (!cpuPool.isEnabled()) return false;
    if (jsonSaveSyncFallback) return false;
    return countStoreMapObjects(s) >= JSON_SAVE_OFFLOAD_MIN_OBJECTS;
}

function writeStoreJsonSync(snapshot) {
    const json = JSON.stringify(snapshot, null, 0);
    var existingRawJson = null;
    if (fs.existsSync(STORE_PATH)) {
        try { existingRawJson = fs.readFileSync(STORE_PATH, 'utf8'); } catch (e) { existingRawJson = null; }
    }
    writeJsonStoreFile(json, existingRawJson, snapshot);
}

function scheduleJsonSave() {
    jsonSaveDirty = true;
    if (jsonSaveTimer) return;
    jsonSaveTimer = setTimeout(function () {
        jsonSaveTimer = null;
        flushJsonPersist().catch(function (e) {
            console.error('[DB] JSON persist failed:', e && e.message ? e.message : e);
        });
    }, JSON_SAVE_DEBOUNCE_MS);
}

async function flushJsonPersist() {
    if (jsonSaveTimer) {
        clearTimeout(jsonSaveTimer);
        jsonSaveTimer = null;
    }
    if (!jsonSaveDirty || !store) return;
    jsonSaveDirty = false;
    const snapshot = store;
    jsonSaveChain = jsonSaveChain.then(async function () {
        if (!snapshot) return;
        if (shouldOffloadJsonSave(snapshot)) {
            var json = await cpuPool.stringify(snapshot, 0);
            var existingRawJson = null;
            if (fs.existsSync(STORE_PATH)) {
                try { existingRawJson = fs.readFileSync(STORE_PATH, 'utf8'); } catch (e) { existingRawJson = null; }
            }
            writeJsonStoreFile(json, existingRawJson, snapshot);
            return;
        }
        writeStoreJsonSync(snapshot);
    }).catch(function (e) {
        jsonSaveDirty = true;
        console.error('[DB] JSON persist error:', e && e.message ? e.message : e);
        // Если worker недоступен — дальше пишем синхронно, чтобы не терять данные.
        if (e && /CPU pool|worker/i.test(String(e.message || e))) {
            jsonSaveSyncFallback = true;
        }
    });
    await jsonSaveChain;
}

function saveStore() {
    if (!store) return;
    if (isMysqlEnabled()) {
        if (!mysqlInitialized) {
            throw new Error('MySQL storage not initialized');
        }
        scheduleMysqlPersist();
        if (MIRROR_JSON) {
            if (shouldOffloadJsonSave(store)) {
                scheduleJsonSave();
            } else {
                writeStoreJsonSync(store);
            }
        }
        return;
    }
    if (shouldOffloadJsonSave(store)) {
        scheduleJsonSave();
        return;
    }
    writeStoreJsonSync(store);
}

/**
 * РџСЂРѕРІРµСЂРєР° РѕРїР°СЃРЅРѕРіРѕ СЃР¶Р°С‚РёСЏ РєР°СЂС‚С‹ РѕСЂРіР°РЅРёР·Р°С†РёРё.
 * @returns {{ ok: boolean, error?: string, previous?: number, next?: number }}
 */
function assertMapDataNotDangerousShrink(orgId, data, opts) {
    opts = opts || {};
    if (opts.allowShrink) return { ok: true };
    if (!Array.isArray(data)) return { ok: false, error: 'data must be array' };
    if (!orgId) return { ok: false, error: 'orgId required' };
    var previous = [];
    try {
        previous = getMapData(orgId) || [];
    } catch (e) {
        previous = [];
    }
    var prevLen = Array.isArray(previous) ? previous.length : 0;
    var nextLen = data.length;
    if (prevLen >= MAP_SHRINK_MIN_EXISTING) {
        if (nextLen === 0 || nextLen < Math.floor(prevLen * MAP_SHRINK_RATIO)) {
            return {
                ok: false,
                error: 'РћС‚РєР°Р·: РЅРµР»СЊР·СЏ Р·Р°РјРµРЅРёС‚СЊ РєР°СЂС‚Сѓ РёР· ' + prevLen + ' РѕР±СЉРµРєС‚РѕРІ РЅР° ' + nextLen + ' Р±РµР· СЏРІРЅРѕРіРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёСЏ',
                previous: prevLen,
                next: nextLen
            };
        }
    }
    return { ok: true, previous: prevLen, next: nextLen };
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

function isValidUserEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function backfillUserEmails() {
    const s = loadStore();
    if (!Array.isArray(s.users) || !Array.isArray(s.organizations)) return;
    let changed = false;
    s.users.forEach(function(user) {
        if (!user) return;
        if (isValidUserEmail(user.email)) return;
        if (user.organizationId) {
            const org = s.organizations.find(function(o) { return organizationIdsMatch(o.id, user.organizationId); });
            if (org && isValidUserEmail(org.contactEmail)) {
                user.email = String(org.contactEmail).trim();
                changed = true;
            }
        }
    });
    if (changed) saveStore();
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
    if (!Array.isArray(s.supportThreads)) s.supportThreads = [];
    backfillUserEmails();
    if (!isMysqlEnabled()) saveStore();
}

/** РЈР±РёСЂР°РµС‚ РѕР±СЉРµРєС‚С‹, С‡РµР№ uniqueId РµСЃС‚СЊ РІ РґР°РЅРЅС‹С… РґСЂСѓРіРѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё. */
function stripMapItemsFromOtherOrganizations(orgId, data) {
    if (!orgId || !Array.isArray(data) || !data.length) return Array.isArray(data) ? data : [];
    const s = loadStore();
    const byOrg = s.mapDataByOrg || {};

    // Один проход по чужим картам → Set uid (раньше на каждый объект был полный scan).
    var foreignUids = new Set();
    Object.keys(byOrg).forEach(function (k) {
        if (organizationIdsMatch(k, orgId)) return;
        var arr = byOrg[k];
        if (!Array.isArray(arr)) return;
        for (var fi = 0; fi < arr.length; fi++) {
            var it = arr[fi];
            if (it && it.uniqueId != null && it.uniqueId !== '') {
                foreignUids.add(String(it.uniqueId));
            }
        }
    });

    function isForeignUid(uid) {
        if (uid == null || uid === '') return false;
        if (!foreignUids.size) return false;
        return foreignUids.has(String(uid));
    }

    const filtered = [];
    data.forEach(function(item) {
        if (!item) return;
        if (item.type === 'cable' || item.type === 'cableLabel') return;
        if (isForeignUid(item.uniqueId)) return;
        filtered.push(item);
    });
    data.forEach(function(item) {
        if (!item || item.type !== 'cable') return;
        if (isForeignUid(item.uniqueId)) return;
        if (isForeignUid(item.fromUniqueId) || isForeignUid(item.toUniqueId)) return;
        if (Array.isArray(item.routeUniqueIds)) {
            for (var ri = 0; ri < item.routeUniqueIds.length; ri++) {
                if (isForeignUid(item.routeUniqueIds[ri])) return;
            }
        }
        filtered.push(item);
    });
    data.forEach(function(item) {
        if (!item || item.type !== 'cableLabel') return;
        if (isForeignUid(item.uniqueId)) return;
        filtered.push(item);
    });
    return filtered;
}

function getMapData(orgId) {
    if (!orgId) return [];
    const s = loadStore();
    const byOrg = s.mapDataByOrg || {};
    var raw = null;
    if (Array.isArray(byOrg[orgId])) raw = byOrg[orgId];
    else {
        var k = Object.keys(byOrg).find(function(key) { return organizationIdsMatch(key, orgId); });
        raw = k && Array.isArray(byOrg[k]) ? byOrg[k] : [];
    }
    return stripMapItemsFromOtherOrganizations(orgId, raw);
}

function setMapData(orgId, data, opts) {
    if (!orgId) throw new Error('orgId required');
    if (!Array.isArray(data)) throw new Error('data must be array');
    opts = opts || {};
    var shrink = assertMapDataNotDangerousShrink(orgId, data, opts);
    if (!shrink.ok) {
        var err = new Error(shrink.error || 'РћС‚РєР°Р· Р·Р°РїРёСЃРё РєР°СЂС‚С‹');
        err.code = 'MAP_DANGEROUS_SHRINK';
        err.previous = shrink.previous;
        err.next = shrink.next;
        throw err;
    }
    const s = loadStore();
    if (!s.mapDataByOrg) s.mapDataByOrg = {};
    var org = getOrganization(orgId);
    var key = org ? org.id : orgId;
    s.mapDataByOrg[key] = stripMapItemsFromOtherOrganizations(orgId, data);
    if (opts.allowShrink) allowDangerousSaveOnce = true;
    try {
        saveStore();
    } finally {
        if (opts.allowShrink) allowDangerousSaveOnce = false;
    }
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

function getOrgChatSince(orgId, sinceMs) {
    if (!orgId) return [];
    var list = getOrgChat(orgId, null);
    if (!sinceMs || isNaN(sinceMs)) return list.slice(-30);
    return list.filter(function(item) {
        if (!item || !item.createdAt) return false;
        var t = new Date(item.createdAt).getTime();
        return !isNaN(t) && t > sinceMs;
    });
}

function registerDeviceToken(userId, orgId, token, platform) {
    if (!userId || !token) return null;
    const s = loadStore();
    if (!Array.isArray(s.deviceTokens)) s.deviceTokens = [];
    var now = new Date().toISOString();
    var key = String(token).trim();
    s.deviceTokens = s.deviceTokens.filter(function(item) {
        return item && String(item.token) !== key;
    });
    s.deviceTokens.push({
        userId: String(userId),
        organizationId: orgId != null ? String(orgId) : null,
        token: key,
        platform: platform ? String(platform).slice(0, 32) : 'android',
        updatedAt: now
    });
    if (s.deviceTokens.length > 5000) {
        s.deviceTokens = s.deviceTokens.slice(s.deviceTokens.length - 5000);
    }
    saveStore();
    return true;
}

function unregisterDeviceToken(userId, token) {
    if (!userId || !token) return false;
    const s = loadStore();
    if (!Array.isArray(s.deviceTokens)) return false;
    var key = String(token).trim();
    var uid = String(userId);
    var before = s.deviceTokens.length;
    s.deviceTokens = s.deviceTokens.filter(function(item) {
        return !(item && String(item.userId) === uid && String(item.token) === key);
    });
    if (s.deviceTokens.length !== before) {
        saveStore();
        return true;
    }
    return false;
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

function removeOrgChatMessage(orgId, messageId) {
    if (!orgId || !messageId) return null;
    const s = loadStore();
    if (!s.chatByOrg || typeof s.chatByOrg !== 'object') return null;
    const key = String(orgId);
    if (!Array.isArray(s.chatByOrg[key])) return null;
    var removed = null;
    s.chatByOrg[key] = s.chatByOrg[key].filter(function(item) {
        if (!item || String(item.id) !== String(messageId)) return true;
        removed = item;
        return false;
    });
    if (!removed) return null;
    saveStore();
    return removed;
}

function updateOrgChatMessageText(orgId, messageId, text) {
    if (!orgId || !messageId) return null;
    const s = loadStore();
    if (!s.chatByOrg || typeof s.chatByOrg !== 'object') return null;
    const key = String(orgId);
    if (!Array.isArray(s.chatByOrg[key])) return null;
    var updated = null;
    s.chatByOrg[key] = s.chatByOrg[key].map(function(item) {
        if (!item || String(item.id) !== String(messageId)) return item;
        var next = Object.assign({}, item, {
            text: text || null,
            editedAt: new Date().toISOString()
        });
        updated = next;
        return next;
    });
    if (!updated) return null;
    saveStore();
    return updated;
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

/** РљР°Р±РµР»Рё Рё СЃР»СѓР¶РµР±РЅС‹Рµ РїРѕРґРїРёСЃРё РЅРµ СЃС‡РёС‚Р°СЋС‚СЃСЏ РѕР±СЉРµРєС‚Р°РјРё РЅР° РєР°СЂС‚Рµ. */
function isMapInfrastructureObject(item) {
    if (!item || !item.type) return false;
    return item.type !== 'cable' && item.type !== 'cableLabel';
}

/**
 * Р РµР°Р»СЊРЅРѕРµ С‡РёСЃР»Рѕ РѕР±СЉРµРєС‚РѕРІ РЅР° РѕРґРЅРѕР№ РєР°СЂС‚Рµ: СѓР·Р»С‹, РєСЂРѕСЃСЃС‹, РјСѓС„С‚С‹, РѕРїРѕСЂС‹ Рё С‚.Рґ.
 * Р‘РµР· РєР°Р±РµР»РµР№, Р±РµР· РґСѓР±Р»РµР№ РїРѕ uniqueId; РєРѕРјРјСѓС‚Р°С‚РѕСЂС‹ РІРЅСѓС‚СЂРё СѓР·Р»Р° вЂ” РєР°Рє РІ СЃС‚Р°С‚РёСЃС‚РёРєРµ РїСЂРёР»РѕР¶РµРЅРёСЏ.
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

/** Р§РёСЃР»Рѕ РѕР±СЉРµРєС‚РѕРІ РЅР° РєР°СЂС‚Рµ РѕРґРЅРѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё (СѓР·Р»С‹, РєСЂРѕСЃСЃС‹, РјСѓС„С‚С‹ Рё С‚.Рґ., Р±РµР· РєР°Р±РµР»РµР№). */
function countMapObjectsForOrganization(orgId) {
    return countActualMapObjectsInArray(getMapData(orgId));
}

function mapObjectTypeLabel(type) {
    switch (String(type || '')) {
        case 'support': return 'Опора';
        case 'sleeve': return 'Муфта';
        case 'spliceCassette': return 'Сплайс-кассета';
        case 'cross': return 'Кросс';
        case 'olt': return 'OLT';
        case 'splitter': return 'Сплиттер';
        case 'onu': return 'ONU';
        case 'camera': return 'Камера';
        case 'mediaConverter': return 'Медиаконвертер';
        case 'radioBridge': return 'Радиомост';
        case 'node': return 'Узел';
        case 'switch': return 'Коммутатор';
        case 'attachment': return 'Крепление';
        case 'manhole': return 'Колодец';
        case 'signalPost': return 'Сигнальный столб';
        case 'cabinet': return 'Ящик';
        case 'region': return 'Регион';
        case 'cable': return 'Кабель';
        default: return type ? String(type) : 'Объект';
    }
}

function topCountsToList(counts, limit) {
    var n = limit > 0 ? limit : 3;
    return Object.keys(counts || {})
        .map(function(type) {
            return {
                type: type,
                label: mapObjectTypeLabel(type),
                count: counts[type] || 0
            };
        })
        .filter(function(item) { return item.count > 0; })
        .sort(function(a, b) { return b.count - a.count || String(a.label).localeCompare(String(b.label), 'ru'); })
        .slice(0, n);
}

/** Текущий состав карты по типам (без кабелей), с учётом коммутаторов в узле. */
function getMapObjectTypeCounts(orgId) {
    var arr = getMapData(orgId);
    var counts = Object.create(null);
    if (!Array.isArray(arr) || !arr.length) return counts;
    var byUid = Object.create(null);
    var withoutUid = [];
    arr.forEach(function(item) {
        if (!isMapInfrastructureObject(item)) return;
        var uid = item.uniqueId;
        if (uid != null && uid !== '') {
            if (!byUid[uid]) byUid[uid] = item;
        } else {
            withoutUid.push(item);
        }
    });
    var placemarks = withoutUid.concat(Object.keys(byUid).map(function(k) { return byUid[k]; }));
    placemarks.forEach(function(item) {
        var t = item && item.type ? String(item.type) : 'object';
        counts[t] = (counts[t] || 0) + 1;
        if (item.type !== 'node' || !Array.isArray(item.attachedSwitches)) return;
        item.attachedSwitches.forEach(function(sw) {
            if (!sw) return;
            var swId = sw.uniqueId;
            if (swId != null && swId !== '' && byUid[swId]) return;
            counts.switch = (counts.switch || 0) + 1;
        });
    });
    return counts;
}

/**
 * Мониторинг организации: добавлено/удалено из истории,
 * топ типов (из create_object, иначе с карты), активность пользователей.
 */
function getOrganizationMonitorStats(orgId, options) {
    var topLimit = options && options.topLimit > 0 ? options.topLimit : 3;
    var history = getHistory(orgId);
    var createdCount = 0;
    var deletedCount = 0;
    var createdByType = Object.create(null);
    var byUser = Object.create(null);

    function touchUser(entry) {
        var user = entry && entry.user ? entry.user : null;
        var key = user && (user.id != null ? String(user.id) : (user.username || ''));
        if (!key) key = '_system';
        if (!byUser[key]) {
            byUser[key] = {
                userId: user && user.id != null ? user.id : null,
                username: user && user.username ? String(user.username) : 'Система',
                fullName: user && user.fullName ? String(user.fullName) : '',
                created: 0,
                deleted: 0
            };
        }
        return byUser[key];
    }

    (Array.isArray(history) ? history : []).forEach(function(entry) {
        if (!entry || !entry.actionType) return;
        var action = String(entry.actionType);
        var bucket = touchUser(entry);
        if (action === 'create_object' || action === 'create_cable') {
            createdCount++;
            bucket.created++;
            var type = action === 'create_cable'
                ? 'cable'
                : ((entry.details && entry.details.objectType) ? String(entry.details.objectType) : 'object');
            createdByType[type] = (createdByType[type] || 0) + 1;
        } else if (action === 'delete_object' || action === 'delete_cable') {
            deletedCount++;
            bucket.deleted++;
        }
    });

    var topObjectTypes = topCountsToList(createdByType, topLimit);
    var topSource = 'history';
    if (!topObjectTypes.length) {
        topObjectTypes = topCountsToList(getMapObjectTypeCounts(orgId), topLimit);
        topSource = topObjectTypes.length ? 'map' : 'none';
    }

    var userActivity = Object.keys(byUser).map(function(k) { return byUser[k]; })
        .filter(function(u) { return (u.created + u.deleted) > 0; })
        .sort(function(a, b) {
            return (b.created + b.deleted) - (a.created + a.deleted)
                || String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), 'ru');
        });

    return {
        createdCount: createdCount,
        deletedCount: deletedCount,
        topObjectTypes: topObjectTypes,
        topSource: topSource,
        userActivity: userActivity
    };
}

/**
 * Топ типов объектов по всей платформе.
 * Сначала по текущему составу карт (что реально используется),
 * при пустых картах — по истории созданий.
 */
function getPlatformTopObjectTypes(limit) {
    var n = limit > 0 ? limit : 10;
    var mapCounts = Object.create(null);
    var historyCounts = Object.create(null);
    var orgs = getOrganizations();
    orgs.forEach(function(o) {
        if (!o || !o.id) return;
        var mapPart = getMapObjectTypeCounts(o.id);
        Object.keys(mapPart).forEach(function(type) {
            mapCounts[type] = (mapCounts[type] || 0) + (mapPart[type] || 0);
        });
        var hist = getHistory(o.id);
        (Array.isArray(hist) ? hist : []).forEach(function(entry) {
            if (!entry || entry.actionType !== 'create_object') return;
            var type = (entry.details && entry.details.objectType) ? String(entry.details.objectType) : 'object';
            historyCounts[type] = (historyCounts[type] || 0) + 1;
        });
    });
    var fromMap = topCountsToList(mapCounts, n);
    if (fromMap.length) {
        return { items: fromMap, source: 'map', total: fromMap.reduce(function(s, i) { return s + i.count; }, 0) };
    }
    var fromHistory = topCountsToList(historyCounts, n);
    return {
        items: fromHistory,
        source: fromHistory.length ? 'history' : 'none',
        total: fromHistory.reduce(function(s, i) { return s + i.count; }, 0)
    };
}

/** РђРіСЂРµРіР°С‚С‹ РґР»СЏ РїСѓР±Р»РёС‡РЅРѕРіРѕ Р»РµРЅРґРёРЅРіР° (Р±РµР· Р°РІС‚РѕСЂРёР·Р°С†РёРё). */
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
        name: org.name || 'РћСЂРіР°РЅРёР·Р°С†РёСЏ',
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
    if (updates.contactEmail !== undefined) {
        s.organizations[idx].contactEmail = String(updates.contactEmail).trim();
        if (isValidUserEmail(s.organizations[idx].contactEmail)) {
            (s.users || []).forEach(function(u) {
                if (u && organizationIdsMatch(u.organizationId, orgId) && !isValidUserEmail(u.email)) {
                    u.email = s.organizations[idx].contactEmail;
                }
            });
        }
    }
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
    if (updates.embedEnabled !== undefined) s.organizations[idx].embedEnabled = !!updates.embedEnabled;
    if (updates.embedToken !== undefined) {
        s.organizations[idx].embedToken = updates.embedToken ? String(updates.embedToken) : null;
    }
    if (updates.embedCreatedAt !== undefined) {
        s.organizations[idx].embedCreatedAt = updates.embedCreatedAt ? String(updates.embedCreatedAt) : null;
    }
    if (updates.zabbixEnabled !== undefined) s.organizations[idx].zabbixEnabled = !!updates.zabbixEnabled;
    if (updates.zabbixApiUrl !== undefined) {
        s.organizations[idx].zabbixApiUrl = updates.zabbixApiUrl ? String(updates.zabbixApiUrl).trim() : null;
    }
    if (updates.zabbixApiToken !== undefined) {
        s.organizations[idx].zabbixApiToken = updates.zabbixApiToken ? String(updates.zabbixApiToken) : null;
    }
    if (updates.zabbixUpdatedAt !== undefined) {
        s.organizations[idx].zabbixUpdatedAt = updates.zabbixUpdatedAt ? String(updates.zabbixUpdatedAt) : null;
    }
    if (updates.zabbixPollIntervalSec !== undefined) {
        var pis = typeof updates.zabbixPollIntervalSec === 'number'
            ? updates.zabbixPollIntervalSec
            : parseInt(updates.zabbixPollIntervalSec, 10);
        if (isNaN(pis)) {
            s.organizations[idx].zabbixPollIntervalSec = null;
        } else {
            s.organizations[idx].zabbixPollIntervalSec = Math.max(15, Math.min(600, Math.round(pis)));
        }
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
    // РЈРґР°Р»СЏРµРј РІСЃРµС… РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СЌС‚РѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё (РєСЂРѕРјРµ РіР»РѕР±Р°Р»СЊРЅРѕРіРѕ Р°РґРјРёРЅР° Р±РµР· organizationId)
    if (Array.isArray(s.users)) {
        s.users = s.users.filter(function(u) {
            // РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РЅРѕСЃРёС‚СЃСЏ Рє СѓРґР°Р»СЏРµРјРѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё?
            if (organizationIdsMatch(u.organizationId, orgId)) return false;
            return true;
        });
    }
    // РЈРґР°Р»СЏРµРј РІСЃРµ СЃРµСЃСЃРёРё СЌС‚РѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё
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
        // РљР°СЂС‚РѕС‡РєР° В«СЃРЅСЏС‚СЊ Р»РёРјРёС‚В» РЅР° Р»РµРЅРґРёРЅРіРµ вЂ” РєРЅРѕРїРєР° РІРµРґС‘С‚ РІ РєРѕРЅС‚Р°РєС‚С‹
        s.pricingPlans = [
            {
                id: 'unlock',
                title: 'Р‘РµР·Р»РёРјРёС‚ РѕР±СЉРµРєС‚РѕРІ',
                short: 'РЎРЅРёРјРёС‚Рµ Р»РёРјРёС‚ РґР»СЏ РІР°С€РµР№ РѕСЂРіР°РЅРёР·Р°С†РёРё вЂ” РЅР°РІСЃРµРіРґР°',
                price: 'РїРѕ РґРѕРіРѕРІРѕСЂС‘РЅРЅРѕСЃС‚Рё',
                period: '',
                maxUsersText: 'РќРµРѕРіСЂР°РЅРёС‡РµРЅРЅРѕРµ С‡РёСЃР»Рѕ СѓР·Р»РѕРІ, РєСЂРѕСЃСЃРѕРІ, РјСѓС„С‚ Рё РґСЂ. РЅР° РєР°СЂС‚Рµ',
                order: 0,
                highlighted: true,
                ctaText: 'РЎРІСЏР·Р°С‚СЊСЃСЏ СЃ РІР»Р°РґРµР»СЊС†РµРј',
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

/** РЈРґР°Р»СЏРµС‚ С‚РѕР»СЊРєРѕ РїСЂРѕСЃСЂРѕС‡РµРЅРЅС‹Рµ СЃРµСЃСЃРёРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (Р°РєС‚РёРІРЅС‹Рµ РЅРµ С‚СЂРѕРіР°РµС‚). */
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

/** РЈРґР°Р»СЏРµС‚ РІСЃРµ СЃРµСЃСЃРёРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РїРµСЂРµРґ РЅРѕРІС‹Рј РІС…РѕРґРѕРј РёР»Рё РїСЂРё РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРј СЃР±СЂРѕСЃРµ). */
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

function getSettingsOrgRecord(orgId) {
    if (!orgId) return null;
    const s = loadStore();
    const map = s.settingsByOrg || {};
    if (map[orgId] && typeof map[orgId] === 'object') return map[orgId];
    const key = Object.keys(map).find(function(k) { return organizationIdsMatch(k, orgId); });
    return key && map[key] && typeof map[key] === 'object' ? map[key] : null;
}

function resolveSettingsOrgStorageKey(orgId) {
    if (!orgId) return orgId;
    const org = getOrganization(orgId);
    return org ? org.id : orgId;
}

function getSettings(orgId) {
    let theme = getSetting('theme');
    let groupNames = getSetting('groupNames');
    let customDeviceOptions = getSetting('customDeviceOptions');
    let collaboratorCursorStyle = 'pointer';
    let byOrg = null;
    if (orgId) {
        byOrg = getSettingsOrgRecord(orgId);
        if (byOrg && typeof byOrg === 'object') {
            if (byOrg.theme !== undefined) theme = byOrg.theme;
            if (byOrg.groupNames !== undefined) groupNames = byOrg.groupNames;
            if (byOrg.customDeviceOptions !== undefined) customDeviceOptions = byOrg.customDeviceOptions;
            if (byOrg.collaboratorCursorStyle !== undefined) collaboratorCursorStyle = byOrg.collaboratorCursorStyle;
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
        customDeviceOptions: parsedCustomDevice,
        collaboratorCursorStyle: normalizeCollaboratorCursorStyle(collaboratorCursorStyle)
    };
}

function normalizeCollaboratorCursorStyle(value) {
    return value === 'circle' ? 'circle' : 'pointer';
}

function setSettings(obj, orgId) {
    if (orgId) {
        const s = loadStore();
        if (!s.settingsByOrg) s.settingsByOrg = {};
        const key = resolveSettingsOrgStorageKey(orgId);
        if (!s.settingsByOrg[key]) s.settingsByOrg[key] = {};
        const o = s.settingsByOrg[key];
        if (obj.theme !== undefined) o.theme = obj.theme;
        if (obj.groupNames !== undefined) o.groupNames = typeof obj.groupNames === 'string' ? obj.groupNames : JSON.stringify(obj.groupNames);
        if (obj.customDeviceOptions !== undefined) o.customDeviceOptions = typeof obj.customDeviceOptions === 'string' ? obj.customDeviceOptions : JSON.stringify(obj.customDeviceOptions);
        if (obj.collaboratorCursorStyle !== undefined) o.collaboratorCursorStyle = normalizeCollaboratorCursorStyle(obj.collaboratorCursorStyle);
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

function getUserThemesMap() {
    const raw = getSetting('userThemes');
    if (!raw) return {};
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return {};
    }
}

function getThemeForUser(userId) {
    if (userId == null) return '';
    const map = getUserThemesMap();
    const t = map[String(userId)];
    return (t === 'dark' || t === 'light') ? t : '';
}

function setThemeForUser(userId, theme) {
    if (userId == null) return;
    const s = loadStore();
    if (!s.settings) s.settings = {};
    let map = getUserThemesMap();
    const id = String(userId);
    if (theme === 'dark' || theme === 'light') map[id] = theme;
    else delete map[id];
    s.settings.userThemes = JSON.stringify(map);
    saveStore();
}

function getUserJsonSettingMap(settingKey) {
    const raw = getSetting(settingKey);
    if (!raw) return {};
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function setUserJsonSettingMap(settingKey, map) {
    const s = loadStore();
    if (!s.settings) s.settings = {};
    s.settings[settingKey] = JSON.stringify(map && typeof map === 'object' ? map : {});
    saveStore();
}

function clampPerfInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function readPerfBool(raw, key, fallback) {
    if (!raw || raw[key] === undefined || raw[key] === null) return fallback;
    if (raw[key] === false || raw[key] === 0 || raw[key] === '0') return false;
    if (raw[key] === true || raw[key] === 1 || raw[key] === '1') return true;
    return fallback;
}

function normalizePerfSettingsForUser(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let mode = typeof raw.mode === 'string' ? raw.mode : 'auto';
    if (mode !== 'auto' && mode !== 'economy' && mode !== 'max' && mode !== 'custom') mode = 'auto';
    return {
        mode: mode,
        animations: readPerfBool(raw, 'animations', true),
        lofi: readPerfBool(raw, 'lofi', true),
        connectionLines: readPerfBool(raw, 'connectionLines', true),
        radioCoverage: readPerfBool(raw, 'radioCoverage', true),
        plexus: readPerfBool(raw, 'plexus', true),
        virtMin: clampPerfInt(raw.virtMin, 50, 2000, 400),
        cullMin: clampPerfInt(raw.cullMin, 20, 1000, 120)
    };
}

function getPerfSettingsForUser(userId) {
    if (userId == null) return null;
    const map = getUserJsonSettingMap('userPerfSettings');
    return normalizePerfSettingsForUser(map[String(userId)]);
}

function setPerfSettingsForUser(userId, perf) {
    if (userId == null) return;
    const map = getUserJsonSettingMap('userPerfSettings');
    const id = String(userId);
    const normalized = normalizePerfSettingsForUser(perf);
    if (normalized) map[id] = normalized;
    else delete map[id];
    setUserJsonSettingMap('userPerfSettings', map);
}

function normalizeThemeAccentForUser(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let color = typeof raw.color === 'string' ? raw.color.trim().toLowerCase() : '';
    if (!/^#[0-9a-f]{6}$/.test(color)) return null;
    let id = typeof raw.id === 'string' ? raw.id : 'custom';
    if (!id) id = 'custom';
    return { id: id, color: color };
}

function getThemeAccentForUser(userId) {
    if (userId == null) return null;
    const map = getUserJsonSettingMap('userThemeAccents');
    return normalizeThemeAccentForUser(map[String(userId)]);
}

function setThemeAccentForUser(userId, accent) {
    if (userId == null) return;
    const map = getUserJsonSettingMap('userThemeAccents');
    const id = String(userId);
    const normalized = normalizeThemeAccentForUser(accent);
    if (normalized) map[id] = normalized;
    else delete map[id];
    setUserJsonSettingMap('userThemeAccents', map);
}

function normalizeLodThresholdsForUser(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let objects = clampPerfInt(raw.objects, 8, 20, 16);
    let labels = clampPerfInt(raw.labels, 8, 20, 16);
    let regions = clampPerfInt(raw.regions, 5, 16, 10);
    if (labels < objects) labels = objects;
    return { objects: objects, labels: labels, regions: regions };
}

function getLodThresholdsForUser(userId) {
    if (userId == null) return null;
    const map = getUserJsonSettingMap('userLodThresholds');
    return normalizeLodThresholdsForUser(map[String(userId)]);
}

function setLodThresholdsForUser(userId, lod) {
    if (userId == null) return;
    const map = getUserJsonSettingMap('userLodThresholds');
    const id = String(userId);
    const normalized = normalizeLodThresholdsForUser(lod);
    if (normalized) map[id] = normalized;
    else delete map[id];
    setUserJsonSettingMap('userLodThresholds', map);
}

function createDailyBackup() {
    createDailyBackupAsync().catch(function (e) {
        console.error('[Backup] Ошибка:', e && e.message ? e.message : e);
    });
}

async function createDailyBackupAsync() {
    const s = loadStore();
    const orgs = Array.isArray(s.organizations) ? s.organizations : [];
    if (!orgs.length) return;
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const now = new Date();
    const dateStr = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');

    for (var i = 0; i < orgs.length; i++) {
        var org = orgs[i];
        if (!org || !org.id) continue;
        var orgId = org.id;
        var dir = ensureOrgBackupsDir(orgId);
        var backupPath = path.join(dir, 'backup-' + dateStr + '.json');
        var payload = {
            version: 1,
            organizationId: orgId,
            createdAt: new Date().toISOString(),
            mapData: getMapData(orgId),
            history: getHistory(orgId),
            settings: getSettings(orgId)
        };
        // Не затираем сегодняшний непустой бэкап пустым
        if (fs.existsSync(backupPath)) {
            try {
                var prev = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
                var prevN = Array.isArray(prev.mapData) ? prev.mapData.length : 0;
                var nextN = Array.isArray(payload.mapData) ? payload.mapData.length : 0;
                if (prevN >= MAP_SHRINK_MIN_EXISTING && nextN < Math.floor(prevN * MAP_SHRINK_RATIO)) {
                    console.warn('[Backup] Пропуск перезаписи пустым/урезанным:', orgId + '/backup-' + dateStr + '.json');
                    continue;
                }
            } catch (ePrev) {}
        }
        if (cpuPool.isEnabled()) {
            await cpuPool.stringifyWrite(payload, backupPath, 0);
        } else {
            fs.writeFileSync(backupPath, JSON.stringify(payload), 'utf8');
        }
        pruneBackupsKeepDays(orgId, BACKUP_RETENTION_DAYS);
        console.log('[Backup] Сохранён: ' + orgId + '/backup-' + dateStr + '.json');
    }

    // Полный логический снимок (JSON export) — работает и для MySQL, и для store.json
    ensureFullBackupsDir();
    var fullDaily = path.join(FULL_BACKUPS_DIR, 'store-' + dateStr + '.json');
    var json = cpuPool.isEnabled()
        ? await cpuPool.stringify(s, 0)
        : JSON.stringify(s, null, 0);
    if (fs.existsSync(fullDaily)) {
        try {
            var existingFull = fs.statSync(fullDaily);
            if (existingFull.size >= DANGEROUS_SAVE_MIN_EXISTING_BYTES &&
                Buffer.byteLength(json, 'utf8') < Math.floor(existingFull.size * DANGEROUS_SAVE_RATIO)) {
                console.warn('[Backup] Пропуск полного дневного снимка: новый store заметно меньше');
            } else {
                fs.writeFileSync(fullDaily, json, 'utf8');
                console.log('[Backup] Полный снимок:', path.basename(fullDaily));
            }
        } catch (eFull) {
            fs.writeFileSync(fullDaily, json, 'utf8');
        }
    } else {
        fs.writeFileSync(fullDaily, json, 'utf8');
        console.log('[Backup] Полный снимок:', path.basename(fullDaily));
    }
    pruneFullSnapshots(FULL_SNAPSHOT_KEEP);
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
        console.error('[Backup] РћС€РёР±РєР° СЃРїРёСЃРєР°:', e.message);
        return [];
    }
}

function restoreFromBackup(orgId, filename, opts) {
    if (!orgId) throw new Error('orgId required');
    opts = opts || {};
    const trimmed = typeof filename === 'string' ? filename.trim() : '';
    if (!/^backup-\d{4}-\d{2}-\d{2}\.json$/.test(trimmed)) throw new Error('РќРµРґРѕРїСѓСЃС‚РёРјРѕРµ РёРјСЏ С„Р°Р№Р»Р°');
    const backupPath = path.join(getOrgBackupsDir(orgId), trimmed);
    if (!fs.existsSync(backupPath)) throw new Error('Р¤Р°Р№Р» Р±СЌРєР°РїР° РЅРµ РЅР°Р№РґРµРЅ');
    let raw, parsed;
    try {
        raw = fs.readFileSync(backupPath, 'utf8');
        parsed = JSON.parse(raw);
    } catch (e) {
        if (e instanceof SyntaxError) throw new Error('РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ JSON РІ Р±СЌРєР°РїРµ');
        throw e;
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ Р±СЌРєР°РїР°');
    const payloadOrgId = parsed.organizationId || orgId;
    if (!organizationIdsMatch(payloadOrgId, orgId)) throw new Error('Р‘СЌРєР°Рї РїСЂРёРЅР°РґР»РµР¶РёС‚ РґСЂСѓРіРѕР№ РѕСЂРіР°РЅРёР·Р°С†РёРё');
    const incomingMap = Array.isArray(parsed.mapData) ? parsed.mapData : [];
    var shrink = assertMapDataNotDangerousShrink(orgId, incomingMap, { allowShrink: !!opts.force });
    if (!shrink.ok) {
        throw new Error(shrink.error + '. Р”Р»СЏ РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕРіРѕ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ РїРµСЂРµРґР°Р№С‚Рµ force: true (С‚РѕР»СЊРєРѕ РіР»Р°РІРЅС‹Р№ admin).');
    }
    const s = loadStore();
    if (!s.mapDataByOrg || typeof s.mapDataByOrg !== 'object') s.mapDataByOrg = {};
    if (!s.historyByOrg || typeof s.historyByOrg !== 'object') s.historyByOrg = {};
    if (!s.settingsByOrg || typeof s.settingsByOrg !== 'object') s.settingsByOrg = {};
    var org = getOrganization(orgId);
    var key = org ? org.id : orgId;

    s.mapDataByOrg[key] = incomingMap;
    s.historyByOrg[key] = Array.isArray(parsed.history) ? parsed.history : [];
    var restoredSettings = (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {};
    s.settingsByOrg[key] = restoredSettings;

    if (opts.force) allowDangerousSaveOnce = true;
    try {
        saveStore();
    } finally {
        if (opts.force) allowDangerousSaveOnce = false;
    }
    deleteSessionsForOrganization(orgId);
    console.log('[Backup] Р’РѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРѕ РёР·:', orgId + '/' + trimmed);
}

function listFullStoreBackups() {
    try {
        ensureFullBackupsDir();
        return fs.readdirSync(FULL_BACKUPS_DIR)
            .filter(function (f) { return /^store-.*\.json$/i.test(f); })
            .map(function (f) {
                var p = path.join(FULL_BACKUPS_DIR, f);
                try {
                    var st = fs.statSync(p);
                    return { filename: f, size: st.size, mtime: st.mtime.toISOString() };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort(function (a, b) { return String(b.mtime).localeCompare(String(a.mtime)); });
    } catch (e) {
        console.error('[DB] listFullStoreBackups:', e.message);
        return [];
    }
}

function restoreFullStoreBackup(filename) {
    const trimmed = typeof filename === 'string' ? filename.trim() : '';
    if (!/^store-[\w.-]+\.json$/i.test(trimmed) || trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
        throw new Error('РќРµРґРѕРїСѓСЃС‚РёРјРѕРµ РёРјСЏ С„Р°Р№Р»Р°');
    }
    const backupPath = path.join(FULL_BACKUPS_DIR, trimmed);
    if (!fs.existsSync(backupPath)) throw new Error('Р¤Р°Р№Р» СЃРЅРёРјРєР° РЅРµ РЅР°Р№РґРµРЅ');
    const parsed = tryParseStoreFile(backupPath);
    if (!parsed) throw new Error('РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ СЃРЅРёРјРєР°');
    // Safety: copy current store aside (JSON mode) or logical export (MySQL)
    if (!isMysqlEnabled() && fs.existsSync(STORE_PATH)) {
        try {
            fs.copyFileSync(STORE_PATH, STORE_PATH + '.before-full-restore-' + Date.now());
        } catch (e) {}
    } else if (isMysqlEnabled() && store) {
        try { exportLogicalStoreSnapshot('before-full-restore'); } catch (e2) {}
    }
    allowDangerousSaveOnce = true;
    store = parsed;
    try {
        saveStore();
    } finally {
        allowDangerousSaveOnce = false;
    }
    if (isMysqlEnabled()) {
        // Force immediate flush so restore is durable before clients reconnect
        mysqlPersistDirty = true;
        flushMysqlPersist().catch(function (e) {
            console.error('[DB] MySQL flush after full restore failed:', e && e.message ? e.message : e);
        });
    }
    console.log('[DB] РџРѕР»РЅС‹Р№ store РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅ РёР·:', trimmed);
    return { ok: true, organizations: (parsed.organizations || []).length, users: (parsed.users || []).length };
}

/** РЎР±СЂРѕСЃ in-memory store (РїРѕСЃР»Рµ РїРѕР»РЅРѕРіРѕ restore РёР·РІРЅРµ). */
function reloadStoreFromDisk() {
    store = null;
    if (isMysqlEnabled()) {
        mysqlInitialized = false;
        throw new Error('reloadStoreFromDisk: РІ СЂРµР¶РёРјРµ MySQL РёСЃРїРѕР»СЊР·СѓР№С‚Рµ await reloadStoreFromMysql()');
    }
    return loadStore();
}

async function reloadStoreFromMysql() {
    if (!isMysqlEnabled()) return reloadStoreFromDisk();
    await flushMysqlPersist();
    const mysqlPersist = require('./db/mysql-persist');
    store = normalizeStoreShape(await mysqlPersist.hydrateStoreFromMysql());
    migrateToOrganizations();
    mysqlInitialized = true;
    return store;
}

function getStorageMode() {
    return isMysqlEnabled() ? 'mysql' : 'json';
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
            try { fs.unlinkSync(filePath); console.log('[Backup] РЈРґР°Р»С‘РЅ СЃС‚Р°СЂС‹Р№:', files[i].name); } catch (e) {}
        }
    } catch (e) {
        console.error('[Backup] РћС€РёР±РєР° РѕС‡РёСЃС‚РєРё:', e.message);
    }
}

async function initDefaultAdmin() {
    let users = getUsers();
    if (users.length === 0) {
        const { hashPassword } = require('./lib/password');
        users = [{
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            username: 'admin',
            password: await hashPassword('admin123'),
            fullName: 'РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ',
            role: 'admin',
            status: 'approved',
            createdAt: new Date().toISOString()
        }];
        setUsers(users);
        console.log('РЎРѕР·РґР°РЅ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ: admin / admin123');
    }
}

function purgeExpiredPasswordResetTokens() {
    const s = loadStore();
    if (!Array.isArray(s.passwordResetTokens)) {
        s.passwordResetTokens = [];
        return;
    }
    const now = Date.now();
    const filtered = s.passwordResetTokens.filter(function(t) {
        if (!t || !t.expiresAt) return false;
        const exp = new Date(t.expiresAt).getTime();
        return !isNaN(exp) && exp > now;
    });
    if (filtered.length !== s.passwordResetTokens.length) {
        s.passwordResetTokens = filtered;
        saveStore();
    }
}

function addPasswordResetToken(entry) {
    const s = loadStore();
    if (!Array.isArray(s.passwordResetTokens)) s.passwordResetTokens = [];
    purgeExpiredPasswordResetTokens();
    s.passwordResetTokens = s.passwordResetTokens.filter(function(t) {
        return !t || String(t.userId) !== String(entry.userId);
    });
    s.passwordResetTokens.push({
        token: String(entry.token),
        userId: String(entry.userId),
        expiresAt: String(entry.expiresAt)
    });
    saveStore();
}

function getPasswordResetToken(token) {
    purgeExpiredPasswordResetTokens();
    const s = loadStore();
    if (!Array.isArray(s.passwordResetTokens)) return null;
    const now = Date.now();
    const item = s.passwordResetTokens.find(function(t) {
        return t && t.token === String(token);
    });
    if (!item) return null;
    const exp = new Date(item.expiresAt).getTime();
    if (isNaN(exp) || exp <= now) {
        deletePasswordResetToken(token);
        return null;
    }
    return { token: item.token, userId: item.userId, expiresAt: item.expiresAt };
}

function deletePasswordResetToken(token) {
    const s = loadStore();
    if (!Array.isArray(s.passwordResetTokens)) return;
    const before = s.passwordResetTokens.length;
    s.passwordResetTokens = s.passwordResetTokens.filter(function(t) {
        return !t || t.token !== String(token);
    });
    if (s.passwordResetTokens.length !== before) saveStore();
}

function purgeExpiredEmailVerificationTokens() {
    const s = loadStore();
    if (!Array.isArray(s.emailVerificationTokens)) {
        s.emailVerificationTokens = [];
        return;
    }
    const now = Date.now();
    const filtered = s.emailVerificationTokens.filter(function(t) {
        if (!t || !t.expiresAt) return false;
        const exp = new Date(t.expiresAt).getTime();
        return !isNaN(exp) && exp > now;
    });
    if (filtered.length !== s.emailVerificationTokens.length) {
        s.emailVerificationTokens = filtered;
        saveStore();
    }
}

function addEmailVerificationToken(entry) {
    const s = loadStore();
    if (!Array.isArray(s.emailVerificationTokens)) s.emailVerificationTokens = [];
    purgeExpiredEmailVerificationTokens();
    s.emailVerificationTokens = s.emailVerificationTokens.filter(function(t) {
        return !t || String(t.userId) !== String(entry.userId);
    });
    s.emailVerificationTokens.push({
        token: String(entry.token),
        userId: String(entry.userId),
        expiresAt: String(entry.expiresAt)
    });
    saveStore();
}

function getEmailVerificationToken(token) {
    purgeExpiredEmailVerificationTokens();
    const s = loadStore();
    if (!Array.isArray(s.emailVerificationTokens)) return null;
    const now = Date.now();
    const item = s.emailVerificationTokens.find(function(t) {
        return t && t.token === String(token);
    });
    if (!item) return null;
    const exp = new Date(item.expiresAt).getTime();
    if (isNaN(exp) || exp <= now) {
        deleteEmailVerificationToken(token);
        return null;
    }
    return { token: item.token, userId: item.userId, expiresAt: item.expiresAt };
}

function deleteEmailVerificationToken(token) {
    const s = loadStore();
    if (!Array.isArray(s.emailVerificationTokens)) return;
    const before = s.emailVerificationTokens.length;
    s.emailVerificationTokens = s.emailVerificationTokens.filter(function(t) {
        return !t || t.token !== String(token);
    });
    if (s.emailVerificationTokens.length !== before) saveStore();
}

function deleteEmailVerificationTokensForUser(userId) {
    const s = loadStore();
    if (!Array.isArray(s.emailVerificationTokens)) return;
    const before = s.emailVerificationTokens.length;
    s.emailVerificationTokens = s.emailVerificationTokens.filter(function(t) {
        return !t || String(t.userId) !== String(userId);
    });
    if (s.emailVerificationTokens.length !== before) saveStore();
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
    // РћРіСЂР°РЅРёС‡РёРІР°РµРј СЂР°Р·РјРµСЂ Р¶СѓСЂРЅР°Р»Р°, С‡С‚РѕР±С‹ store.json РЅРµ СЂР°Р·СЂР°СЃС‚Р°Р»СЃСЏ Р±РµСЃРєРѕРЅРµС‡РЅРѕ.
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

var MAX_SUPPORT_THREADS = 500;
var MAX_SUPPORT_MESSAGES_PER_THREAD = 200;

function normalizeSupportMessage(msg) {
    return {
        id: msg.id ? String(msg.id) : 'sm_' + Date.now(),
        from: msg.from === 'admin' || msg.from === 'bot' ? msg.from : 'visitor',
        text: String(msg.text || '').trim().slice(0, 4000),
        at: msg.at ? String(msg.at) : new Date().toISOString()
    };
}

function normalizeSupportThread(thread) {
    var msgs = Array.isArray(thread.messages) ? thread.messages.map(normalizeSupportMessage) : [];
    return {
        id: thread.id ? String(thread.id) : 'st_' + Date.now(),
        visitorId: String(thread.visitorId || ''),
        name: thread.name ? String(thread.name).trim().slice(0, 120) : '',
        email: thread.email ? String(thread.email).trim().slice(0, 200) : '',
        page: thread.page ? String(thread.page).trim().slice(0, 200) : '',
        createdAt: thread.createdAt ? String(thread.createdAt) : new Date().toISOString(),
        updatedAt: thread.updatedAt ? String(thread.updatedAt) : new Date().toISOString(),
        unreadByAdmin: !!thread.unreadByAdmin,
        unreadByVisitor: !!thread.unreadByVisitor,
        messages: msgs
    };
}

function getSupportThreads() {
    const s = loadStore();
    return Array.isArray(s.supportThreads) ? s.supportThreads.map(normalizeSupportThread) : [];
}

function findSupportThreadByVisitorId(visitorId) {
    if (!visitorId) return null;
    var threads = getSupportThreads();
    return threads.find(function(t) { return t.visitorId === String(visitorId); }) || null;
}

function findSupportThreadById(threadId) {
    if (!threadId) return null;
    var threads = getSupportThreads();
    return threads.find(function(t) { return t.id === String(threadId); }) || null;
}

function getSupportThreadPublic(visitorId) {
    var thread = findSupportThreadByVisitorId(visitorId);
    if (!thread) return { threadId: null, messages: [], hasUnreadAdmin: false };
    return {
        threadId: thread.id,
        hasUnreadAdmin: !!thread.unreadByVisitor,
        name: thread.name,
        email: thread.email,
        messages: thread.messages.map(function(m) {
            return { id: m.id, from: m.from, text: m.text, at: m.at };
        })
    };
}

function addSupportMessage(payload) {
    var visitorId = String(payload.visitorId || '').trim();
    var text = String(payload.text || '').trim().slice(0, 4000);
    if (!visitorId || !text) throw new Error('visitorId and text required');
    const s = loadStore();
    if (!Array.isArray(s.supportThreads)) s.supportThreads = [];
    var now = new Date().toISOString();
    var msg = normalizeSupportMessage({
        id: 'sm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        from: payload.from === 'admin' || payload.from === 'bot' ? payload.from : 'visitor',
        text: text,
        at: now
    });
    var idx = s.supportThreads.findIndex(function(t) { return t.visitorId === visitorId; });
    var thread;
    if (idx >= 0) {
        thread = normalizeSupportThread(s.supportThreads[idx]);
        thread.messages.push(msg);
        if (thread.messages.length > MAX_SUPPORT_MESSAGES_PER_THREAD) {
            thread.messages = thread.messages.slice(thread.messages.length - MAX_SUPPORT_MESSAGES_PER_THREAD);
        }
        thread.updatedAt = now;
        if (msg.from === 'visitor') thread.unreadByAdmin = true;
        if (msg.from === 'admin') thread.unreadByVisitor = true;
        if (payload.name) thread.name = String(payload.name).trim().slice(0, 120);
        if (payload.email) thread.email = String(payload.email).trim().slice(0, 200);
        if (payload.page) thread.page = String(payload.page).trim().slice(0, 200);
        s.supportThreads[idx] = thread;
    } else {
        thread = normalizeSupportThread({
            id: 'st_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            visitorId: visitorId,
            name: payload.name || '',
            email: payload.email || '',
            page: payload.page || '',
            createdAt: now,
            updatedAt: now,
            unreadByAdmin: msg.from === 'visitor',
            unreadByVisitor: false,
            messages: [msg]
        });
        s.supportThreads.push(thread);
    }
    if (s.supportThreads.length > MAX_SUPPORT_THREADS) {
        s.supportThreads = s.supportThreads.slice(s.supportThreads.length - MAX_SUPPORT_THREADS);
    }
    saveStore();
    return { thread: thread, message: msg };
}

function markSupportThreadRead(threadId) {
    const s = loadStore();
    if (!Array.isArray(s.supportThreads)) return null;
    var idx = s.supportThreads.findIndex(function(t) { return t.id === String(threadId); });
    if (idx < 0) return null;
    var thread = normalizeSupportThread(s.supportThreads[idx]);
    thread.unreadByAdmin = false;
    s.supportThreads[idx] = thread;
    saveStore();
    return thread;
}

function markSupportThreadReadByVisitor(visitorId) {
    const s = loadStore();
    if (!Array.isArray(s.supportThreads) || !visitorId) return null;
    var idx = s.supportThreads.findIndex(function(t) { return t.visitorId === String(visitorId); });
    if (idx < 0) return null;
    var thread = normalizeSupportThread(s.supportThreads[idx]);
    thread.unreadByVisitor = false;
    s.supportThreads[idx] = thread;
    saveStore();
    return thread;
}

function getSupportThreadsAdminSummary() {
    return getSupportThreads()
        .slice()
        .sort(function(a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); })
        .map(function(t) {
            var last = t.messages.length ? t.messages[t.messages.length - 1] : null;
            return {
                id: t.id,
                visitorId: t.visitorId,
                name: t.name,
                email: t.email,
                page: t.page,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                unreadByAdmin: t.unreadByAdmin,
                messageCount: t.messages.length,
                lastMessage: last ? { from: last.from, text: last.text, at: last.at } : null
            };
        });
}

function countUnreadSupportThreads() {
    return getSupportThreads().filter(function(t) { return t.unreadByAdmin; }).length;
}

const MAINTENANCE_NOTICE_DEFAULTS = {
    enabled: false,
    title: 'РўРµС…РЅРёС‡РµСЃРєРёРµ СЂР°Р±РѕС‚С‹',
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
    var limit = 20000;
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
    title: 'Р‘РµСЃРїР»Р°С‚РЅРѕ',
    short: 'РџРѕР»РЅС‹Р№ С„СѓРЅРєС†РёРѕРЅР°Р» РєР°СЂС‚С‹ РІ РїСЂРµРґРµР»Р°С… Р»РёРјРёС‚Р° РѕР±СЉРµРєС‚РѕРІ',
    price: '0 в‚Ѕ',
    period: 'РЅР°РІСЃРµРіРґР°',
    ctaText: 'РЎРѕР·РґР°С‚СЊ РѕСЂРіР°РЅРёР·Р°С†РёСЋ',
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

var DEFAULT_PRODUCT_UPDATES = [
    {
        id: 'upd_20260529_collab',
        title: 'РЎРѕРІРјРµСЃС‚РЅР°СЏ СЂР°Р±РѕС‚Р° РЅР°Рґ РєР°СЂС‚РѕР№',
        date: '2026-05-29',
        summary: 'Р‘Р»РѕРєРёСЂРѕРІРєР° РѕР±СЉРµРєС‚РѕРІ РїСЂРё СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёРё, РёРЅРєСЂРµРјРµРЅС‚Р°Р»СЊРЅР°СЏ СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ Рё РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ С‚РµРјС‹.',
        body: 'РџСЂРё РѕС‚РєСЂС‹С‚РёРё РєР°СЂС‚РѕС‡РєРё РѕР±СЉРµРєС‚ Р±Р»РѕРєРёСЂСѓРµС‚СЃСЏ РґР»СЏ РѕСЃС‚Р°Р»СЊРЅС‹С… СѓС‡Р°СЃС‚РЅРёРєРѕРІ РґРѕ Р·Р°РєСЂС‹С‚РёСЏ РёР»Рё РїРѕ С‚Р°Р№РјР°СѓС‚Сѓ.\n\nРЎРѕС…СЂР°РЅРµРЅРёРµ РЅР° РєР°СЂС‚Рµ РїРµСЂРµРґР°С‘С‚СЃСЏ РїРѕ РѕРїРµСЂР°С†РёСЏРј, Р° РЅРµ С†РµР»С‹Рј СЃРЅРёРјРєРѕРј вЂ” РјРµРЅСЊС€Рµ С‚СЂР°С„РёРєР° Рё РјРµРЅСЊС€Рµ РєРѕРЅС„Р»РёРєС‚РѕРІ РїСЂРё РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕР№ СЂР°Р±РѕС‚Рµ.\n\nРўРµРјР° РѕС„РѕСЂРјР»РµРЅРёСЏ (СЃРІРµС‚Р»Р°СЏ/С‚С‘РјРЅР°СЏ) СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ РѕС‚РґРµР»СЊРЅРѕ РґР»СЏ РєР°Р¶РґРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ; РїСЂРё РїРµСЂРІРѕРј РІС…РѕРґРµ РїРѕРґСЃС‚Р°РІР»СЏРµС‚СЃСЏ СЃРёСЃС‚РµРјРЅР°СЏ.',
        tags: ['РєР°СЂС‚Р°', 'СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏ', 'РёРЅС‚РµСЂС„РµР№СЃ'],
        published: true
    },
    {
        id: 'upd_20260501_release',
        title: 'Р’РµСЂСЃРёСЏ 1.2',
        date: '2026-05-01',
        summary: 'РљР°СЂС‚Р° Р’РћР›РЎ: GPON, СЃС…РµРјС‹ Р¶РёР», РѕСЂРіР°РЅРёР·Р°С†РёРё Рё СЂРµР·РµСЂРІРЅС‹Рµ РєРѕРїРёРё.',
        body: 'РЈС‡С‘С‚ РєСЂРѕСЃСЃРѕРІ Рё РјСѓС„С‚ СЃРѕ СЃС…РµРјРѕР№ РѕРїС‚РёС‡РµСЃРєРёС… Р¶РёР», GPON, СЂРµР·РµСЂРІРЅРѕРµ РєРѕРїРёСЂРѕРІР°РЅРёРµ РґР°РЅРЅС‹С… РѕСЂРіР°РЅРёР·Р°С†РёРё.\n\nРќР° РіР»Р°РІРЅРѕР№ СЃС‚СЂР°РЅРёС†Рµ вЂ” Р°РєС‚СѓР°Р»СЊРЅС‹Рµ СѓСЃР»РѕРІРёСЏ Рё С‚Р°СЂРёС„С‹.',
        tags: ['СЂРµР»РёР·'],
        published: true
    }
];

function parseProductUpdatesRaw(raw) {
    if (!raw) return null;
    try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
        return null;
    }
}

function normalizeProductUpdate(post, idx) {
    var src = post && typeof post === 'object' ? post : {};
    var now = new Date().toISOString();
    var dateStr = String(src.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr = now.slice(0, 10);
    }
    var tags = [];
    if (Array.isArray(src.tags)) {
        tags = src.tags.map(function(t) { return String(t || '').trim(); }).filter(Boolean).slice(0, 12);
    } else if (typeof src.tags === 'string') {
        tags = src.tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean).slice(0, 12);
    }
    return {
        id: String(src.id || ('upd_' + Date.now() + '_' + (idx || 0))).trim(),
        title: String(src.title || 'Р‘РµР· РЅР°Р·РІР°РЅРёСЏ').trim().slice(0, 200),
        date: dateStr,
        summary: String(src.summary || '').trim().slice(0, 500),
        body: sanitizeNewsBody(String(src.body || '')).slice(0, 150000),
        tags: tags,
        published: src.published !== false,
        createdAt: src.createdAt ? String(src.createdAt) : now,
        updatedAt: now
    };
}

function sortProductUpdates(posts) {
    return posts.slice().sort(function(a, b) {
        var da = String(a.date || '');
        var db = String(b.date || '');
        if (da !== db) return db.localeCompare(da);
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
}

function getProductUpdatesAdmin() {
    var parsed = parseProductUpdatesRaw(getSetting('productUpdates'));
    if (parsed == null) {
        return DEFAULT_PRODUCT_UPDATES.map(function(p, i) { return normalizeProductUpdate(p, i); });
    }
    return sortProductUpdates(parsed.map(function(p, i) { return normalizeProductUpdate(p, i); }));
}

function getProductUpdatesPublic() {
    return getProductUpdatesAdmin().filter(function(p) { return p.published; });
}

function setProductUpdates(posts) {
    var list = Array.isArray(posts) ? posts : [];
    var normalized = list.map(function(p, i) {
        var n = normalizeProductUpdate(p, i);
        if (p && p.createdAt) n.createdAt = String(p.createdAt);
        return n;
    });
    setSetting('productUpdates', JSON.stringify(sortProductUpdates(normalized)));
    return getProductUpdatesAdmin();
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
    initStorage,
    flushMysqlPersist,
    flushJsonPersist,
    getStorageMode,
    isMysqlEnabled,
    exportLogicalStoreSnapshot,
    getMapData,
    setMapData,
    stripMapItemsFromOtherOrganizations,
    getMapDataLegacy,
    setMapDataLegacy,
    getUsers,
    setUsers,
    getHistory,
    setHistory,
    getOrgChat,
    getOrgChatSince,
    addOrgChatMessage,
    removeOrgChatMessage,
    updateOrgChatMessageText,
    getChatMedia,
    getChatMediaItem,
    addChatMedia,
    removeChatMedia,
    registerDeviceToken,
    unregisterDeviceToken,
    getSettings,
    setSettings,
    getSetting,
    setSetting,
    getMapStartForUser,
    setMapStartForUser,
    getMapStartForOrg,
    setMapStartForOrg,
    getMapStartForUserOrOrg,
    getThemeForUser,
    setThemeForUser,
    getPerfSettingsForUser,
    setPerfSettingsForUser,
    getThemeAccentForUser,
    setThemeAccentForUser,
    getLodThresholdsForUser,
    setLodThresholdsForUser,
    createDailyBackup,
    listBackups,
    restoreFromBackup,
    listFullStoreBackups,
    restoreFullStoreBackup,
    reloadStoreFromDisk,
    reloadStoreFromMysql,
    assertMapDataNotDangerousShrink,
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
    getMapObjectTypeCounts,
    getOrganizationMonitorStats,
    getPlatformTopObjectTypes,
    addVisitLog,
    purgeExpiredPasswordResetTokens,
    addPasswordResetToken,
    getPasswordResetToken,
    deletePasswordResetToken,
    purgeExpiredEmailVerificationTokens,
    addEmailVerificationToken,
    getEmailVerificationToken,
    deleteEmailVerificationToken,
    deleteEmailVerificationTokensForUser,
    getVisitLogs,
    getSupportThreads,
    findSupportThreadById,
    getSupportThreadPublic,
    addSupportMessage,
    markSupportThreadRead,
    markSupportThreadReadByVisitor,
    getSupportThreadsAdminSummary,
    countUnreadSupportThreads,
    getMaintenanceNotice,
    setMaintenanceNotice,
    getPublicMaintenanceNotice,
    isMaintenanceNoticeActive,
    getPlatformLimitsConfig,
    setPlatformLimitsConfig,
    getFreeCardConfig,
    setFreeCardConfig,
    getShowcaseConfig,
    setShowcaseConfig,
    getProductUpdatesPublic,
    getProductUpdatesAdmin,
    setProductUpdates,
    closePool
};
