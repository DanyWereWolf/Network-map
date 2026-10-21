require('./lib/threadpool');
const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');
const cors = require('cors');
const WebSocket = require('ws');
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const db = require('./database');
const avatars = require('./avatars');
const chatMedia = require('./chat-media');
const objectMedia = require('./object-media');
const basemap = require('./lib/basemap');
const multer = require('multer');
const security = require('./lib/security');
const passwords = require('./lib/password');
const cpuPool = require('./lib/cpu-pool');
const zabbixClient = require('./lib/zabbix-client');
const nedImport = require('./lib/ned-import');
const perfMonitor = require('./lib/perf-monitor');
const portableLicense = require('./lib/portable-license');


const SERVER_CONFIG_PATH = path.join(ROOT_DIR, 'server-config.json');

function loadServerConfig() {
    try {
        if (!fs.existsSync(SERVER_CONFIG_PATH)) return { ok: true, config: {} };
        const raw = fs.readFileSync(SERVER_CONFIG_PATH, 'utf8');
        // BOM от некоторых редакторов Windows
        const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
        return { ok: true, config: JSON.parse(text) };
    } catch (e) {
        console.error('[Config] Не удалось прочитать server-config.json:', e && e.message ? e.message : e);
        return { ok: false, error: e, config: null };
    }
}

/**
 * Перечитать server-config.json без перезапуска процесса
 * (SMTP, adminEmail, publicSiteUrl, ключи карт и т.п.).
 * При ошибке парсинга оставляем прежний конфиг.
 */
function reloadServerConfig(options) {
    const silent = !!(options && options.silent);
    const loaded = loadServerConfig();
    if (!loaded.ok || !loaded.config) {
        return serverConfig;
    }
    serverConfig = loaded.config;
    if (!silent) console.log('[Config] server-config.json перезагружен');
    return serverConfig;
}

/**
 * Dev: public/ (читаемые исходники). Prod: dist/ после `npm run build`,
 * если serveObfuscatedClient / SERVE_OBFUSCATED_CLIENT включены.
 */
function resolvePublicDir(config) {
    const wantObfuscated =
        config.serveObfuscatedClient === true ||
        String(process.env.SERVE_OBFUSCATED_CLIENT || '').trim() === '1' ||
        String(process.env.SERVE_OBFUSCATED_CLIENT || '').toLowerCase() === 'true';
    const distDir = path.join(ROOT_DIR, 'dist');
    const publicDir = path.join(ROOT_DIR, 'public');
    if (wantObfuscated) {
        if (fs.existsSync(path.join(distDir, 'js'))) {
            console.log('[Static] Раздача обфусцированного клиента из dist/');
            return distDir;
        }
        console.warn('[Static] serveObfuscatedClient включён, но dist/ нет — сначала npm run build. Раздаётся public/');
    }
    return publicDir;
}

var _initialConfigLoad = loadServerConfig();
let serverConfig = (_initialConfigLoad.ok && _initialConfigLoad.config) ? _initialConfigLoad.config : {};
const PUBLIC_DIR = resolvePublicDir(serverConfig);

if (fs.existsSync(SERVER_CONFIG_PATH)) {
    let configReloadTimer = null;
    fs.watchFile(SERVER_CONFIG_PATH, { interval: 1000 }, function() {
        clearTimeout(configReloadTimer);
        configReloadTimer = setTimeout(function() {
            try {
                reloadServerConfig();
            } catch (e) {
                console.error('[Config] Ошибка перезагрузки:', e && e.message ? e.message : e);
            }
        }, 150);
    });
}

function logServerConfigWarnings() {
    if (!fs.existsSync(SERVER_CONFIG_PATH)) {
        console.warn('[Config] Файл server-config.json не найден в корне проекта:', SERVER_CONFIG_PATH);
        return;
    }
    const mapEngine = String(serverConfig.mapEngine || process.env.MAP_ENGINE || 'yandex').trim().toLowerCase();
    if (mapEngine === 'leaflet' || mapEngine === 'offline' || mapEngine === 'orthophoto') {
        var gdalStatus = basemap.getGdalStatus();
        if (gdalStatus && gdalStatus.nodeFallback) {
            console.warn('[Config] mapEngine=leaflet: GDAL не найден — будет встроенная нарезка тайлов (медленнее).');
        }
    } else {
        const mapsKey = String(serverConfig.yandexMapsApiKey || process.env.YANDEX_MAPS_API_KEY || '').trim();
        if (!mapsKey || mapsKey === 'YOUR_YANDEX_MAPS_API_KEY') {
            console.warn('[Config] yandexMapsApiKey не задан — карты Яндекса не будут работать.');
        }
    }
    console.log('[Config] Режим Portable (on-prem): без регистрации, почты и платформенной админки.');
    if (portableLicense.isEnforced(serverConfig)) {
        var licStatus = portableLicense.getStatus(serverConfig);
        if (licStatus.valid) {
            console.log('[License] Лицензия OK' + (licStatus.customer ? (': ' + licStatus.customer) : ''));
        } else {
            console.warn('[License] Нет активной лицензии. Код машины:', licStatus.machineCode || '—');
            console.warn('[License] Откройте /license.html и вставьте файл лицензии из site-admin.');
        }
    } else {
        console.warn('[License] Проверка отключена (portableLicenseRequired: false или нет публичного ключа).');
    }
}

// Portable: порт/host из server-config.json важнее чужого PORT из IDE/окружения
const PORT = parseInt(
    serverConfig.portable
        ? (serverConfig.port || process.env.PORT || process.argv[2] || '3000')
        : (process.env.PORT || process.argv[2] || serverConfig.port || '3000'),
    10
);
const HOST = serverConfig.portable
    ? (serverConfig.host || process.env.HOST || '0.0.0.0')
    : (process.env.HOST || serverConfig.host || '0.0.0.0');
const app = express();

/** Portable: коммерческие лимиты отключены полностью. */
function getDefaultFreeMapObjectLimit() {
    return -1;
}

function getDefaultMaxConcurrentUsers() {
    return -1;
}

function normalizeMaxConcurrentUsers() {
    return -1;
}

function getMaxConcurrentForOrg() {
    return -1;
}

function getConcurrentUsersPayload(orgId) {
    var active = orgId ? db.countActiveSessionsForOrganization(orgId) : 0;
    return {
        active: active,
        limit: null,
        unlimited: true,
        remaining: null,
        defaultLimit: null
    };
}

function orgHasUnlimitedMapObjects() {
    return true;
}

function getMapObjectLimitForOrg() {
    return null;
}

function getMapObjectLimitPayload(orgId) {
    var count = orgId ? db.countMapObjectsForOrganization(orgId) : 0;
    return {
        count: count,
        limit: null,
        unlocked: true,
        remaining: null,
        defaultFreeLimit: null
    };
}

function validateMapDataObjectLimit(orgId, data) {
    var count = db.countActualMapObjectsInArray(data);
    return { ok: true, count: count, limit: null, unlocked: true };
}

perfMonitor.wrapMapSave(db);
app.use(perfMonitor.httpMiddleware);
app.use(cors({ origin: true, credentials: true }));
// 50mb: карты 10k+ объектов / фото в payload; 10mb часто мало и провоцирует обрывы/ретраи.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));

/** Лицензия Portable: без валидного файла — только страница активации и статинка. */
app.use(function(req, res, next) {
    if (!portableLicense.isEnforced(serverConfig)) return next();
    var status = portableLicense.getStatus(serverConfig);
    if (status.valid) return next();
    var reqPath = req.path || '';
    if (portableLicense.isPathAllowedWithoutLicense(reqPath)) return next();
    if (reqPath.indexOf('/api/') === 0) {
        return res.status(403).json({
            error: status.error || 'Требуется лицензия Portable',
            code: 'LICENSE_REQUIRED',
            machineCode: status.machineCode,
            machineFingerprint: status.machineFingerprint
        });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
        var bare = reqPath === '/' || reqPath === '/index.html' || reqPath === '/auth.html';
        if (bare) return res.redirect(302, '/license.html');
    }
    next();
});

app.get('/api/portable/license/status', function(req, res) {
    var status = portableLicense.getStatus(serverConfig);
    res.json({
        required: !!status.enforced,
        valid: !!status.valid,
        machineCode: status.machineCode || '',
        machineFingerprint: status.machineFingerprint || '',
        customer: status.customer || null,
        licenseId: status.licenseId || null,
        issuedAt: status.issuedAt || null,
        error: status.valid ? null : (status.error || null)
    });
});

app.post('/api/portable/license/activate', function(req, res) {
    try {
        var body = req.body || {};
        var raw = body.license != null ? body.license : body.licenseText;
        var result = portableLicense.activate(serverConfig, raw);
        if (!result.ok) return res.status(400).json({ error: result.error || 'Активация не удалась' });
        res.json({
            ok: true,
            status: {
                required: !!result.status.enforced,
                valid: !!result.status.valid,
                machineCode: result.status.machineCode,
                customer: result.status.customer || null,
                licenseId: result.status.licenseId || null
            }
        });
    } catch (e) {
        res.status(500).json({ error: String(e && e.message ? e.message : e) });
    }
});

/** Разрешить встраивание карты (Zabbix URL widget и др.). */
app.use(function(req, res, next) {
    var raw = serverConfig.embedFrameAncestors;
    if (raw === false || raw === 'deny') {
        res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
        res.setHeader('X-Frame-Options', 'DENY');
        return next();
    }
    var list = [];
    if (Array.isArray(raw)) {
        list = raw.map(function(v) { return String(v || '').trim(); }).filter(Boolean);
    } else if (typeof raw === 'string' && raw.trim()) {
        list = raw.split(/[\s,]+/).map(function(v) { return v.trim(); }).filter(Boolean);
    }
    if (!list.length) {
        // По умолчанию разрешаем iframe (для Zabbix и аналогов).
        list = ['*'];
    }
    res.setHeader('Content-Security-Policy', 'frame-ancestors ' + list.join(' '));
    // CSP frame-ancestors перекрывает X-Frame-Options в современных браузерах.
    res.removeHeader('X-Frame-Options');
    next();
});

function generateToken() {
    return 'tk_' + Date.now() + '_' + require('crypto').randomBytes(16).toString('hex');
}

function generateEmbedLinkToken() {
    return 'emb_' + require('crypto').randomBytes(24).toString('hex');
}

function resolveOrganizationByEmbedToken(token) {
    if (!token || String(token).indexOf('emb_') !== 0) return null;
    var orgs = db.getOrganizations() || [];
    for (var i = 0; i < orgs.length; i++) {
        var org = orgs[i];
        if (!org || !org.embedEnabled || !org.embedToken) continue;
        if (org.embedToken !== token) continue;
        if (org.status && org.status !== 'active') return null;
        return org;
    }
    return null;
}

function buildEmbedUserPayload(organization) {
    var organizationId = organization.id;
    return {
        userId: null,
        username: 'embed',
        fullName: 'Встраивание',
        role: 'user',
        embed: true,
        organizationId: organizationId,
        avatarUrl: null,
        organization: {
            id: organization.id,
            name: organization.name,
            status: organization.status,
            mapLimits: getMapObjectLimitPayload(organizationId),
            concurrentUsers: getConcurrentUsersPayload(organizationId),
            zabbixEnabled: !!(organization.zabbixEnabled && organization.zabbixApiUrl && organization.zabbixApiToken)
        }
    };
}

/** Кэш проверки токена для WS (курсоры бьют десятки раз/сек). */
var sessionTokenCache = new Map();
var SESSION_TOKEN_CACHE_MS = 3000;
var cursorAvatarCache = new Map();
var syncStateFingerprintByOrg = Object.create(null);

function getSessionByToken(token) {
    if (!token) return null;
    var now = Date.now();
    var cached = sessionTokenCache.get(token);
    if (cached && (now - cached.at) < SESSION_TOKEN_CACHE_MS) {
        return cached.value;
    }
    var embedOrg = resolveOrganizationByEmbedToken(token);
    if (embedOrg) {
        var embedValue = { userId: null, organizationId: embedOrg.id, isEmbed: true };
        sessionTokenCache.set(token, { at: now, value: embedValue });
        return embedValue;
    }
    var sessions = db.getSessions();
    var ses = sessions.find(function(s) { return s.token === token && db.sessionIsActive(s); });
    if (!ses) {
        sessionTokenCache.set(token, { at: now, value: null });
        return null;
    }
    var users = db.getUsers();
    var user = users.find(function(u) { return String(u.id) === String(ses.user_id); });
    var value = user
        ? { userId: user.id, organizationId: user.organizationId != null ? user.organizationId : (ses.organization_id || null) }
        : null;
    sessionTokenCache.set(token, { at: now, value: value });
    if (sessionTokenCache.size > 2000) {
        sessionTokenCache.forEach(function (entry, key) {
            if ((now - entry.at) >= SESSION_TOKEN_CACHE_MS) sessionTokenCache.delete(key);
        });
    }
    return value;
}

function invalidateSessionTokenCache(token) {
    if (token) sessionTokenCache.delete(token);
    else sessionTokenCache.clear();
}

function getSessionUserFromToken(token) {
    if (!token) return null;
    var embedOrg = resolveOrganizationByEmbedToken(token);
    if (embedOrg) return buildEmbedUserPayload(embedOrg);
    const sessions = db.getDb().prepare('SELECT user_id, organization_id FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').all(token);
    if (sessions.length === 0) return null;
    const users = db.getUsers();
    const user = users.find(u => String(u.id) === String(sessions[0].user_id));
    if (!user) return null;
    const organizationId = user.organizationId != null ? user.organizationId : (sessions[0].organization_id || null);
    const organization = organizationId ? db.getOrganization(organizationId) : null;
    const mapLimits = organizationId ? getMapObjectLimitPayload(organizationId) : null;
    return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName || user.full_name,
        role: user.role,
        organizationId: organizationId,
        avatarUrl: avatars.getAvatarApiPath(user.id, user.avatarUpdatedAt),
        organization: organization ? {
            id: organization.id,
            name: organization.name,
            status: organization.status,
            mapLimits: mapLimits,
            concurrentUsers: getConcurrentUsersPayload(organizationId),
            zabbixEnabled: !!(organization.zabbixEnabled && organization.zabbixApiUrl && organization.zabbixApiToken)
        } : null
    };
}

function getSessionUser(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return getSessionUserFromToken(auth.slice(7));
}

function canViewUserAvatar(viewer, targetUserId) {
    if (!viewer || targetUserId == null) return false;
    if (String(viewer.userId) === String(targetUserId)) return true;
    const users = db.getUsers();
    const viewerUser = users.find(function(u) { return String(u.id) === String(viewer.userId); });
    const target = users.find(function(u) { return String(u.id) === String(targetUserId); });
    if (viewerUser && target && viewerUser.organizationId && target.organizationId &&
        String(viewerUser.organizationId) === String(target.organizationId)) {
        return true;
    }
    if (viewer.role !== 'admin') return false;
    if (!target) return false;
    return canAdminManageUser(viewer, target);
}

function canAdminManageUser(admin, target) {
    if (!admin || admin.role !== 'admin' || !target) return false;
    if (target.username === 'admin') {
        return isGlobalAdmin(admin) && String(admin.userId) === String(target.id);
    }
    if (isGlobalAdmin(admin)) return true;
    return !!(target.organizationId && admin.organizationId &&
        String(target.organizationId) === String(admin.organizationId));
}

function userToClientFields(u) {
    return {
        id: u.id,
        username: u.username,
        fullName: u.fullName || u.full_name,
        role: u.role,
        status: u.status || 'approved',
        createdAt: u.createdAt,
        organizationId: u.organizationId || null,
        avatarUrl: avatars.getAvatarApiPath(u.id, u.avatarUpdatedAt)
    };
}

function isGlobalAdmin(user) {
    // Глобальный админ панели: роль admin и нет привязки к организации
    return !!(user && user.role === 'admin' && (user.organizationId == null));
}

function getClientIp(req) {
    var xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim();
    }
    var xrip = req.headers['x-real-ip'];
    if (typeof xrip === 'string' && xrip.trim()) return xrip.trim();
    return String(req.ip || req.socket && req.socket.remoteAddress || '');
}

function getAuthRateLimitOptions() {
    var windowMs = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || serverConfig.authRateLimitWindowMs || '900000', 10);
    var maxAttempts = parseInt(process.env.AUTH_RATE_LIMIT_MAX || serverConfig.authRateLimitMax || '20', 10);
    if (isNaN(windowMs) || windowMs < 60000) windowMs = 900000;
    if (isNaN(maxAttempts) || maxAttempts < 3) maxAttempts = 20;
    return { windowMs: windowMs, maxAttempts: maxAttempts };
}


function isOrgAdmin(user) {
    return !!(user && user.role === 'admin' && user.organizationId);
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function parseMapStartPayload(mapStart) {
    if (!mapStart || !Array.isArray(mapStart.center) || mapStart.center.length < 2) return null;
    var lat = Number(mapStart.center[0]);
    var lon = Number(mapStart.center[1]);
    var zoomRaw = Number(mapStart.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    var zoom = Number.isFinite(zoomRaw) && zoomRaw >= 1 && zoomRaw <= 21 ? zoomRaw : 15;
    return { center: [lat, lon], zoom: zoom };
}

/** Число администраторов в организации (роль admin + organizationId). */
function countOrgAdmins(organizationId, usersList) {
    if (!organizationId) return 0;
    var list = usersList || db.getUsers();
    return list.filter(function(u) {
        return u.role === 'admin' && u.organizationId && String(u.organizationId) === String(organizationId);
    }).length;
}

function buildLoginUserPayload(user, organizationId, organization) {
    return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName || user.full_name,
        role: user.role,
        organizationId: organizationId,
        avatarUrl: avatars.getAvatarApiPath(user.id, user.avatarUpdatedAt),
        organization: organization ? {
            id: organization.id,
            name: organization.name,
            status: organization.status,
            mapLimits: getMapObjectLimitPayload(organizationId),
            concurrentUsers: getConcurrentUsersPayload(organizationId),
            zabbixEnabled: !!(organization.zabbixEnabled && organization.zabbixApiUrl && organization.zabbixApiToken)
        } : null
    };
}

function completeUserLogin(req, res, user, organizationId, organization) {
    db.deleteSessionsForUser(user.id);

    if (organization && organization.status !== 'active') {
        if (organization.status === 'pending') {
            return res.json({
                success: false,
                error: 'Организация ещё не активирована. Обратитесь к администратору.',
                code: 'org_pending'
            });
        }
        return res.json({ success: false, error: 'Организация приостановлена. Обратитесь к администратору.' });
    }
    // Portable: лимит одновременных сессий не применяется

    const token = generateToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    var stmt = db.getDb().prepare('INSERT INTO sessions (token, user_id, expires_at, organization_id) VALUES (?, ?, ?, ?)');
    stmt.run(token, user.id, expires, organizationId);

    try {
        db.addVisitLog({
            at: new Date().toISOString(),
            username: user.username,
            userId: user.id,
            organizationId: organizationId || '',
            ip: getClientIp(req),
            source: getClientIp(req) || 'unknown',
            userAgent: String(req.headers['user-agent'] || '')
        });
    } catch (e) {}

    notifySessionRevokedForUser(user.id, token);

    res.json({
        success: true,
        token: token,
        user: buildLoginUserPayload(user, organizationId, organization)
    });
}

async function validateCredentials(username, password) {
    if (!username || !password) return { ok: false, error: 'Укажите имя и пароль', status: 400 };
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (userIndex === -1) return { ok: false, error: 'Пользователь не найден' };
    const user = users[userIndex];
    const passwordOk = await passwords.verifyPassword(password, user.password);
    if (!passwordOk) return { ok: false, error: 'Неверный пароль' };
    if (passwords.isLegacyPasswordHash(user.password)) {
        users[userIndex].password = await passwords.hashPassword(password);
        db.setUsers(users);
    }
    const currentUser = users[userIndex];
    if (currentUser.status === 'pending') return { ok: false, error: 'Заявка ожидает одобрения' };
    if (currentUser.status === 'rejected') return { ok: false, error: 'Заявка отклонена' };
    var organizationId = currentUser.organizationId || null;
    if (currentUser.role !== 'admin' && !organizationId) {
        return { ok: false, error: 'Учётная запись не привязана к организации. Обратитесь к администратору.' };
    }
    var organization = organizationId ? db.getOrganization(organizationId) : null;
    return { ok: true, user: currentUser, organizationId: organizationId, organization: organization };
}

app.get('/api/map', (req, res) => {
    try {
        var user = getSessionUser(req);
        var orgId = (user && user.organizationId) ? user.organizationId : null;
        if (!orgId && user) return res.status(403).json({ error: 'Выберите организацию или привяжите учётную запись к организации' });
        var regionId = req.query && req.query.regionId != null ? String(req.query.regionId).trim() : '';
        if (!regionId) {
            return res.status(400).json({
                error: 'Укажите regionId. Сначала получите список регионов: GET /api/map-regions',
                code: 'MAP_REGION_REQUIRED'
            });
        }
        if (orgId && db.ensureMapRegionsMigrated) {
            try { db.ensureMapRegionsMigrated(orgId); } catch (eMig) {}
        }
        var full = [];
        if (orgId) {
            var live = null;
            try {
                live = getSyncStateForOrg(orgId, { forceFromDb: false });
            } catch (eLive) { live = null; }
            if (live && Array.isArray(live.data) && live.data.length) {
                full = live.data;
            } else {
                full = db.getMapData(orgId) || [];
            }
        }
        var core = db.mapRegionsCore;
        var data = core ? core.filterItemsByRegionId(full, regionId) : full;
        var objectCount = data.length;
        var softWarn = core ? core.softWarnForCount(objectCount) : null;
        var meta = db.getMapRegionsMeta ? db.getMapRegionsMeta(orgId) : null;
        res.json({
            data: data,
            organizationId: orgId || null,
            regionId: regionId,
            objectCount: objectCount,
            softWarn: softWarn,
            defaultMapRegionId: meta ? meta.defaultMapRegionId : null
        });
    } catch (e) {
        var code = e && e.code;
        if (code === 'MAP_REGION_NOT_FOUND' || code === 'MAP_REGION_REQUIRED') {
            return res.status(code === 'MAP_REGION_NOT_FOUND' ? 404 : 400).json({ error: String(e.message), code: code });
        }
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/map-regions', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        var orgId = user.organizationId;
        if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
        try { getSyncStateForOrg(orgId, { forceFromDb: false }); } catch (eLive) {}
        res.json(db.listMapRegionsWithCounts(orgId));
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/map-regions', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
        var orgId = user.organizationId;
        if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
        var created = db.createMapRegion(orgId, req.body && req.body.name);
        res.json({ ok: true, region: created, regions: db.listMapRegionsWithCounts(orgId) });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.patch('/api/map-regions/:id', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
        var orgId = user.organizationId;
        if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
        var updated = db.updateMapRegion(orgId, req.params.id, {
            name: req.body && req.body.name,
            setAsDefault: !!(req.body && req.body.setAsDefault)
        });
        res.json({ ok: true, region: updated, regions: db.listMapRegionsWithCounts(orgId) });
    } catch (e) {
        var code = e && e.code;
        if (code === 'MAP_REGION_NOT_FOUND') return res.status(404).json({ error: String(e.message), code: code });
        res.status(400).json({ error: String(e.message), code: code || undefined });
    }
});

app.delete('/api/map-regions/:id', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
        var orgId = user.organizationId;
        if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
        var result = db.deleteMapRegion(orgId, req.params.id);
        res.json({ ok: true, result: result, regions: db.listMapRegionsWithCounts(orgId) });
    } catch (e) {
        var code = e && e.code;
        var status = code === 'MAP_REGION_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: String(e.message), code: code || undefined });
    }
});

app.post('/api/map/move-to-region', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
        var orgId = user.organizationId;
        if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
        var uniqueIds = req.body && req.body.uniqueIds;
        var targetRegionId = req.body && req.body.targetRegionId;
        if (!Array.isArray(uniqueIds) || !uniqueIds.length) {
            return res.status(400).json({ error: 'Укажите uniqueIds' });
        }
        if (!targetRegionId) return res.status(400).json({ error: 'Укажите targetRegionId' });
        try { flushMapDbSave(orgId); } catch (eFlush) {}
        var result = db.moveMapItemsToRegion(orgId, uniqueIds, targetRegionId);
        try {
            var syncKey = normalizeSyncOrgId(orgId);
            if (syncKey) {
                syncCurrentStateByOrg[syncKey] = {
                    clientId: 'api-move-region',
                    data: cpuPool.deepCloneSync(db.getMapData(orgId) || [])
                };
                try { syncStateFingerprintByOrg[syncKey] = fingerprintMapData(syncCurrentStateByOrg[syncKey].data); } catch (eFp) {}
                var refreshPayload = { type: 'map_refresh', organizationId: syncKey, forceFull: true, regionId: null };
                wss.clients.forEach(function (client) {
                    if (client.readyState === WebSocket.OPEN && syncOrgIdsEqual(client.orgId, syncKey)) {
                        try { client.send(JSON.stringify(refreshPayload)); } catch (eSend) {}
                    }
                });
            }
        } catch (eSync) {}
        res.json({ ok: true, result: result });
    } catch (e) {
        var code = e && e.code;
        res.status(code === 'MAP_REGION_NOT_FOUND' ? 404 : 400).json({ error: String(e.message), code: code || undefined });
    }
});

/** Конвертация .ned (NeD) → JSON карты. Тело: raw bytes, Content-Type: application/octet-stream */
app.post('/api/import/ned', express.raw({ type: '*/*', limit: '120mb' }), async function(req, res) {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    try {
        await nedImport.ensureConverterReady();
    } catch (e) {
        console.error('[ned-import]', e && e.message ? e.message : e);
        return res.status(503).json({
            error: 'Не удалось подготовить конвертер NeD: ' + String(e && e.message ? e.message : e)
        });
    }
    try {
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
        const data = await nedImport.convertNedBuffer(buf);
        res.json({ ok: true, count: data.length, data: data });
    } catch (e) {
        console.error('[ned-import]', e && e.message ? e.message : e);
        res.status(500).json({ error: String(e && e.message ? e.message : e) });
    }
});

app.post('/api/map', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (isGlobalAdmin(user)) return res.status(403).json({ error: 'Главному администратору недоступно сохранение карты.' });
    var orgId = user.organizationId;
    if (!orgId) return res.status(403).json({ error: 'Укажите организацию для сохранения карты' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Только администратор может сохранять карту' });
    try {
        const data = req.body && req.body.data;
        if (!Array.isArray(data)) return res.status(400).json({ error: 'Ожидается массив data' });
        var allowShrink = !!(req.body && req.body.allowShrink && isGlobalAdmin(user));
        var replaceAll = !!(req.body && req.body.replaceAll);
        var regionId = req.body && req.body.regionId != null ? String(req.body.regionId).trim() : '';
        if (!replaceAll && !regionId) {
            return res.status(400).json({
                error: 'Укажите regionId (или replaceAll для полной замены карты организации)',
                code: 'MAP_REGION_REQUIRED'
            });
        }
        var savedFull = null;
        if (replaceAll) {
            var shrink = db.assertMapDataNotDangerousShrink
                ? db.assertMapDataNotDangerousShrink(orgId, data, { allowShrink: allowShrink })
                : { ok: true };
            if (!shrink.ok) {
                return res.status(400).json({
                    error: shrink.error,
                    code: 'MAP_DANGEROUS_SHRINK',
                    previous: shrink.previous,
                    next: shrink.next
                });
            }
            var validation = validateMapDataObjectLimit(orgId, data);
            if (!validation.ok) {
                return res.status(403).json({
                    error: validation.error,
                    mapLimits: { count: validation.count, limit: validation.limit, unlocked: validation.unlocked }
                });
            }
            if (db.ensureMapRegionsMigrated) db.ensureMapRegionsMigrated(orgId);
            var defId = null;
            try {
                var meta = db.getMapRegionsMeta(orgId);
                defId = meta && meta.defaultMapRegionId;
            } catch (eMeta) {}
            var tagged = data.map(function (item) {
                if (!item || typeof item !== 'object') return item;
                if (!item.mapRegionId && defId) return Object.assign({}, item, { mapRegionId: defId });
                return item;
            });
            db.setMapData(orgId, tagged, { allowShrink: allowShrink });
            savedFull = tagged;
        } else {
            try {
                savedFull = db.setMapDataForRegion(orgId, regionId, data, { allowShrink: allowShrink });
            } catch (eReg) {
                if (eReg && (eReg.code === 'MAP_DANGEROUS_SHRINK' || eReg.code === 'MAP_SHRINK')) {
                    return res.status(400).json({
                        error: eReg.message,
                        code: 'MAP_DANGEROUS_SHRINK',
                        previous: eReg.previous,
                        next: eReg.next
                    });
                }
                if (eReg && eReg.code === 'MAP_REGION_NOT_FOUND') {
                    return res.status(404).json({ error: eReg.message, code: eReg.code });
                }
                throw eReg;
            }
            var validationMerged = validateMapDataObjectLimit(orgId, savedFull);
            if (!validationMerged.ok) {
                return res.status(403).json({
                    error: validationMerged.error,
                    mapLimits: { count: validationMerged.count, limit: validationMerged.limit, unlocked: validationMerged.unlocked }
                });
            }
        }
        try {
            var syncKey = normalizeSyncOrgId(orgId);
            if (syncKey) {
                if (mapDbSaveTimersByOrg[syncKey]) {
                    clearTimeout(mapDbSaveTimersByOrg[syncKey]);
                    mapDbSaveTimersByOrg[syncKey] = null;
                }
                var fullForSync = savedFull || db.getMapData(orgId) || [];
                syncCurrentStateByOrg[syncKey] = {
                    clientId: 'api-map-save',
                    data: cpuPool.deepCloneSync(fullForSync)
                };
                try {
                    syncStateFingerprintByOrg[syncKey] = fingerprintMapData(fullForSync);
                } catch (eFp) {}
                var refreshPayload = {
                    type: 'map_refresh',
                    organizationId: syncKey,
                    forceFull: true,
                    regionId: replaceAll ? null : regionId
                };
                var gnSave = syncGroupNamesByOrg[syncKey] || syncGroupNames;
                if (gnSave && (gnSave.cross || gnSave.node)) refreshPayload.groupNames = gnSave;
                wss.clients.forEach(function(client) {
                    if (client.readyState === WebSocket.OPEN && syncOrgIdsEqual(client.orgId, syncKey)) {
                        try { client.send(JSON.stringify(refreshPayload)); } catch (eSend) {}
                    }
                });
            }
        } catch (eSync) {
            console.warn('[API] map save sync refresh failed:', eSync && eSync.message ? eSync.message : eSync);
        }
        var softWarn = null;
        if (!replaceAll && regionId && db.mapRegionsCore) {
            var sliceCount = db.mapRegionsCore.filterItemsByRegionId(savedFull || [], regionId).length;
            softWarn = db.mapRegionsCore.softWarnForCount(sliceCount);
        }
        res.json({ ok: true, mapLimits: getMapObjectLimitPayload(orgId), regionId: regionId || null, softWarn: softWarn });
    } catch (e) {
        var status = (e && e.code === 'MAP_DANGEROUS_SHRINK') ? 400 : 500;
        res.status(status).json({ error: String(e.message), code: e.code || undefined });
    }
});

app.post('/api/auth/login', async function(req, res) {
    var ip = getClientIp(req);
    var rate = security.checkRateLimit('auth:' + ip, getAuthRateLimitOptions());
    if (!rate.ok) {
        return res.status(429).json({
            success: false,
            error: 'Слишком много попыток входа. Повторите через ' + rate.retryAfterSec + ' с.'
        });
    }
    var body = req.body || {};
    try {
        var cred = await validateCredentials(body.username, body.password);
    } catch (e) {
        return res.status(500).json({ success: false, error: 'Ошибка проверки пароля' });
    }
    if (!cred.ok) {
        if (cred.status === 400) return res.status(400).json({ success: false, error: cred.error });
        var failPayload = { success: false, error: cred.error };
        if (cred.code) failPayload.code = cred.code;
        return res.json(failPayload);
    }
    // Portable: 2FA отключена — сразу выдаём сессию
    completeUserLogin(req, res, cred.user, cred.organizationId, cred.organization);
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
    res.json({ user: user });
});

app.get('/api/organizations/me', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.json({ organization: null });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.json({ organization: null });
    var orgMapStart = db.getMapStartForOrg ? db.getMapStartForOrg(org.id) : null;
    res.json({
        organization: {
            id: org.id,
            name: org.name,
            status: org.status,
            contactEmail: org.contactEmail || '',
            mapObjectLimitUnlocked: true,
            mapLimits: getMapObjectLimitPayload(user.organizationId),
            concurrentUsers: getConcurrentUsersPayload(user.organizationId),
            zabbixEnabled: !!(org.zabbixEnabled && org.zabbixApiUrl && org.zabbixApiToken),
            embedEnabled: !!(org.embedEnabled && org.embedToken),
            setupCompleted: !!org.setupCompleted,
            hasMapStart: !!orgMapStart
        }
    });
});

/** Portable: нужна ли первичная настройка (название + расположение карты). */
app.get('/api/portable/setup', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user) || !user.organizationId) {
        return res.json({ needed: false });
    }
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.json({ needed: false });
    var orgMapStart = db.getMapStartForOrg ? db.getMapStartForOrg(org.id) : null;
    var name = String(org.name || '').trim();
    var nameBroken = !name || /^\?[\?\s]*$/.test(name) || /Р[А-Яа-яЁё]/.test(name);
    var needed = !org.setupCompleted || nameBroken || !orgMapStart;
    res.json({
        needed: needed,
        organizationName: nameBroken ? '' : name,
        hasMapStart: !!orgMapStart,
        mapStart: orgMapStart || null
    });
});

/** Portable: сохранить название организации и общий вид карты для всех. */
app.post('/api/portable/setup', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user) || !user.organizationId) {
        return res.status(403).json({ error: 'Только администратор организации' });
    }
    var body = req.body || {};
    var name = String(body.organizationName || body.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Укажите название организации' });
    if (name.length > 120) return res.status(400).json({ error: 'Название организации слишком длинное' });
    var parsedMapStart = parseMapStartPayload(body.mapStart);
    if (!parsedMapStart) {
        return res.status(400).json({ error: 'Укажите расположение карты' });
    }
    var ok = db.updateOrganization(user.organizationId, {
        name: name,
        setupCompleted: true
    });
    if (!ok) return res.status(404).json({ error: 'Организация не найдена' });
    if (db.setMapStartForOrg) db.setMapStartForOrg(user.organizationId, parsedMapStart);
    if (db.setMapStartForUser) db.setMapStartForUser(user.userId, parsedMapStart);
    var org = db.getOrganization(user.organizationId);
    res.json({
        ok: true,
        organization: {
            id: org.id,
            name: org.name,
            setupCompleted: true
        },
        mapStart: parsedMapStart
    });
});

/** Portable: админ организации настраивает свою org (имя, контакт). */
app.patch('/api/organizations/me', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    if (!user.organizationId) return res.status(403).json({ error: 'Нет организации' });
    var body = req.body || {};
    var updates = {};
    if (body.name !== undefined) {
        var name = String(body.name || '').trim();
        if (name.length < 2) return res.status(400).json({ error: 'Название организации слишком короткое' });
        if (name.length > 120) return res.status(400).json({ error: 'Название организации слишком длинное' });
        updates.name = name;
    }
    if (body.contactEmail !== undefined) {
        var email = String(body.contactEmail || '').trim();
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ error: 'Укажите корректный e-mail' });
        }
        updates.contactEmail = email;
    }
    if (!Object.keys(updates).length) {
        return res.status(400).json({ error: 'Нет полей для обновления' });
    }
    var ok = db.updateOrganization(user.organizationId, updates);
    if (!ok) return res.status(404).json({ error: 'Организация не найдена' });
    var org = db.getOrganization(user.organizationId);
    res.json({
        ok: true,
        organization: {
            id: org.id,
            name: org.name,
            status: org.status,
            contactEmail: org.contactEmail || '',
            mapLimits: getMapObjectLimitPayload(user.organizationId),
            concurrentUsers: getConcurrentUsersPayload(user.organizationId),
            zabbixEnabled: !!(org.zabbixEnabled && org.zabbixApiUrl && org.zabbixApiToken),
            embedEnabled: !!(org.embedEnabled && org.embedToken)
        }
    });
});

app.get('/api/map-limits', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.json({ mapLimits: null });
    res.json({ mapLimits: getMapObjectLimitPayload(user.organizationId) });
});

function buildOrgEmbedUrl(req, embedToken) {
    var base = serverConfig.publicSiteUrl || process.env.PUBLIC_SITE_URL || getSiteBaseUrl(req) || '';
    base = String(base || '').trim().replace(/\/$/, '');
    if (!base) base = '';
    var pathUrl = (base || '') + '/index.html?embed=1&embedToken=' + encodeURIComponent(embedToken);
    return pathUrl;
}

app.get('/api/organizations/me/embed', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    var enabled = !!(org.embedEnabled && org.embedToken);
    res.json({
        enabled: enabled,
        embedToken: enabled ? org.embedToken : null,
        embedUrl: enabled ? buildOrgEmbedUrl(req, org.embedToken) : null,
        createdAt: org.embedCreatedAt || null
    });
});

app.post('/api/organizations/me/embed', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    var rotate = !!(req.body && req.body.rotate);
    var token = org.embedToken;
    if (!token || rotate || !org.embedEnabled) {
        token = generateEmbedLinkToken();
    }
    var createdAt = new Date().toISOString();
    var ok = db.updateOrganization(user.organizationId, {
        embedEnabled: true,
        embedToken: token,
        embedCreatedAt: createdAt
    });
    if (!ok) return res.status(404).json({ error: 'Организация не найдена' });
    invalidateSessionTokenCache(token);
    if (org.embedToken && org.embedToken !== token) invalidateSessionTokenCache(org.embedToken);
    res.json({
        ok: true,
        enabled: true,
        embedToken: token,
        embedUrl: buildOrgEmbedUrl(req, token),
        createdAt: createdAt
    });
});

app.delete('/api/organizations/me/embed', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    if (org.embedToken) invalidateSessionTokenCache(org.embedToken);
    db.updateOrganization(user.organizationId, {
        embedEnabled: false,
        embedToken: null,
        embedCreatedAt: null
    });
    res.json({ ok: true, enabled: false });
});

/** Обмен embed-токена на сессию просмотра (для Zabbix / iframe). */
app.post('/api/auth/embed', (req, res) => {
    var body = req.body || {};
    var embedToken = String(body.embedToken || body.token || '').trim();
    if (!embedToken) return res.status(400).json({ success: false, error: 'Не указан токен встраивания' });
    var ip = getClientIp(req);
    var rate = security.checkRateLimit('embed:' + ip, getAuthRateLimitOptions());
    if (!rate.ok) {
        return res.status(429).json({ success: false, error: 'Слишком много попыток. Подождите немного.' });
    }
    var org = resolveOrganizationByEmbedToken(embedToken);
    if (!org) {
        return res.status(401).json({ success: false, error: 'Ссылка встраивания недействительна или отключена' });
    }
    res.json({
        success: true,
        token: embedToken,
        user: buildEmbedUserPayload(org)
    });
});

function normalizeZabbixOrgUrl(raw) {
    return zabbixClient.normalizeApiUrl(raw).replace(/\/api_jsonrpc\.php$/i, '');
}

function normalizeZabbixPollIntervalSec(raw, fallback) {
    var n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (isNaN(n)) n = fallback != null ? fallback : 45;
    return Math.max(15, Math.min(600, Math.round(n)));
}

function getOrgZabbixPollIntervalSec(org) {
    return normalizeZabbixPollIntervalSec(org && org.zabbixPollIntervalSec, 45);
}

app.get('/api/organizations/me/zabbix', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    res.json({
        enabled: !!org.zabbixEnabled,
        apiUrl: org.zabbixApiUrl || '',
        hasToken: !!(org.zabbixApiToken && String(org.zabbixApiToken).trim()),
        pollIntervalSec: getOrgZabbixPollIntervalSec(org),
        updatedAt: org.zabbixUpdatedAt || null
    });
});

app.post('/api/organizations/me/zabbix', async function(req, res) {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    var body = req.body || {};
    var apiUrlRaw = body.apiUrl != null ? String(body.apiUrl).trim() : (org.zabbixApiUrl || '');
    var tokenRaw = body.apiToken != null ? String(body.apiToken).trim() : '';
    var enabled = body.enabled !== undefined ? !!body.enabled : true;
    var testOnly = !!body.testOnly;
    var pollIntervalSec = normalizeZabbixPollIntervalSec(
        body.pollIntervalSec != null ? body.pollIntervalSec : org.zabbixPollIntervalSec,
        45
    );

    var apiUrl = normalizeZabbixOrgUrl(apiUrlRaw);
    if (enabled && !apiUrl) {
        return res.status(400).json({ error: 'Укажите URL Zabbix (например https://zabbix.example.com)' });
    }
    var token = tokenRaw || (org.zabbixApiToken || '');
    if (enabled && !token) {
        return res.status(400).json({ error: 'Укажите API-токен Zabbix' });
    }

    if (enabled && token) {
        try {
            var test = await zabbixClient.testConnection(apiUrl, token);
            if (testOnly) {
                return res.json({ ok: true, tested: true, version: test.version || '', pollIntervalSec: pollIntervalSec });
            }
        } catch (e) {
            return res.status(400).json({
                error: 'Не удалось подключиться к Zabbix: ' + (e && e.message ? e.message : String(e)),
                tested: false
            });
        }
    }

    if (testOnly) {
        return res.json({ ok: true, tested: true, pollIntervalSec: pollIntervalSec });
    }

    var updatedAt = new Date().toISOString();
    var updates = {
        zabbixEnabled: enabled,
        zabbixApiUrl: enabled ? apiUrl : (apiUrl || null),
        zabbixUpdatedAt: updatedAt,
        zabbixPollIntervalSec: pollIntervalSec
    };
    if (tokenRaw) updates.zabbixApiToken = tokenRaw;
    if (!enabled) {
        updates.zabbixApiToken = null;
        updates.zabbixApiUrl = apiUrl || null;
    }
    db.updateOrganization(user.organizationId, updates);
    invalidateZabbixStatusCache(user.organizationId);
    res.json({
        ok: true,
        enabled: enabled,
        apiUrl: enabled ? apiUrl : (apiUrl || ''),
        hasToken: !!(enabled && (tokenRaw || org.zabbixApiToken)),
        pollIntervalSec: pollIntervalSec,
        updatedAt: updatedAt
    });
});

app.delete('/api/organizations/me/zabbix', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    db.updateOrganization(user.organizationId, {
        zabbixEnabled: false,
        zabbixApiUrl: null,
        zabbixApiToken: null,
        zabbixUpdatedAt: null
    });
    invalidateZabbixStatusCache(user.organizationId);
    res.json({ ok: true, enabled: false, hasToken: false });
});

var zabbixStatusCache = Object.create(null);
var ZABBIX_STATUS_CACHE_MS = 40000;

function invalidateZabbixStatusCache(orgId) {
    if (orgId == null) {
        zabbixStatusCache = Object.create(null);
        return;
    }
    delete zabbixStatusCache[String(orgId)];
}

function normalizeMatchKey(s) {
    return String(s || '').trim().toLowerCase();
}

function normalizeIpKey(s) {
    return String(s || '').trim();
}

function collectZabbixCandidates(mapData) {
    var list = [];
    (mapData || []).forEach(function(item) {
        if (!item || item.type === 'cable' || item.type === 'region') return;
        var uid = item.uniqueId != null ? String(item.uniqueId) : '';
        if (!uid) return;
        var ips = [];
        var names = [];
        var hosts = [];
        if (item.zabbixHost) hosts.push(String(item.zabbixHost).trim());
        if (item.ipAddress) ips.push(normalizeIpKey(item.ipAddress));
        if (item.name) names.push(String(item.name).trim());
        if (item.type === 'node' && Array.isArray(item.attachedSwitches)) {
            item.attachedSwitches.forEach(function(sw) {
                if (!sw) return;
                if (sw.zabbixHost) hosts.push(String(sw.zabbixHost).trim());
                if (sw.ipAddress) ips.push(normalizeIpKey(sw.ipAddress));
                if (sw.name) names.push(String(sw.name).trim());
            });
        }
        list.push({
            uniqueId: uid,
            type: item.type,
            zabbixHosts: hosts.filter(Boolean),
            ips: ips.filter(Boolean),
            names: names.filter(Boolean)
        });
    });
    return list;
}

function buildZabbixHostIndexes(hosts) {
    var byHostName = Object.create(null);
    var byVisibleName = Object.create(null);
    var byIp = Object.create(null);
    (hosts || []).forEach(function(h) {
        if (!h || !h.hostid) return;
        var entry = {
            hostid: String(h.hostid),
            host: h.host || '',
            name: h.name || h.host || ''
        };
        if (h.host) byHostName[normalizeMatchKey(h.host)] = entry;
        if (h.name) byVisibleName[normalizeMatchKey(h.name)] = entry;
        (h.interfaces || []).forEach(function(iface) {
            if (iface && iface.ip) byIp[normalizeIpKey(iface.ip)] = entry;
        });
    });
    return { byHostName: byHostName, byVisibleName: byVisibleName, byIp: byIp };
}

function matchCandidateToHost(candidate, indexes) {
    var i;
    for (i = 0; i < candidate.zabbixHosts.length; i++) {
        var key = normalizeMatchKey(candidate.zabbixHosts[i]);
        if (indexes.byHostName[key]) return indexes.byHostName[key];
        if (indexes.byVisibleName[key]) return indexes.byVisibleName[key];
    }
    for (i = 0; i < candidate.ips.length; i++) {
        var ip = normalizeIpKey(candidate.ips[i]);
        if (indexes.byIp[ip]) return indexes.byIp[ip];
    }
    for (i = 0; i < candidate.names.length; i++) {
        var n = normalizeMatchKey(candidate.names[i]);
        if (indexes.byHostName[n]) return indexes.byHostName[n];
        if (indexes.byVisibleName[n]) return indexes.byVisibleName[n];
    }
    return null;
}

async function buildZabbixStatusForOrg(org) {
    var apiUrl = org.zabbixApiUrl;
    var token = org.zabbixApiToken;
    var hosts = await zabbixClient.fetchHostsWithInterfaces(apiUrl, token);
    var problems = await zabbixClient.fetchActiveProblems(apiUrl, token);
    var triggerIds = (problems || []).map(function(p) { return p.objectid; });
    var triggerHostMap = await zabbixClient.fetchTriggerHostMap(apiUrl, token, triggerIds);

    var problemsByHost = Object.create(null);
    (problems || []).forEach(function(p) {
        var hostid = triggerHostMap[String(p.objectid)];
        if (!hostid) return;
        if (!problemsByHost[hostid]) problemsByHost[hostid] = [];
        problemsByHost[hostid].push({
            name: p.name || 'Проблема',
            severity: parseInt(p.severity, 10) || 0
        });
    });

    var indexes = buildZabbixHostIndexes(hosts);
    var mapData = db.getMapData(org.id) || [];
    var candidates = collectZabbixCandidates(mapData);
    var items = [];

    candidates.forEach(function(c) {
        var matched = matchCandidateToHost(c, indexes);
        if (!matched) return;
        var plist = problemsByHost[matched.hostid] || [];
        var maxSev = 0;
        var names = [];
        plist.forEach(function(pr) {
            if (pr.severity > maxSev) maxSev = pr.severity;
            if (names.length < 5) names.push(pr.name);
        });
        items.push({
            uniqueId: c.uniqueId,
            matched: true,
            host: matched.host || matched.name,
            hostid: matched.hostid,
            severity: maxSev,
            ok: maxSev === 0,
            problems: names
        });
    });

    return {
        enabled: true,
        updatedAt: new Date().toISOString(),
        pollIntervalSec: getOrgZabbixPollIntervalSec(org),
        items: items
    };
}

app.get('/api/zabbix/status', async function(req, res) {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (isGlobalAdmin(user)) {
        return res.status(403).json({ error: 'Главному администратору недоступен статус карты' });
    }
    var orgId = user.organizationId;
    if (!orgId) return res.status(403).json({ error: 'Нет организации' });
    var org = db.getOrganization(orgId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    var pollIntervalSec = getOrgZabbixPollIntervalSec(org);
    if (!org.zabbixEnabled || !org.zabbixApiUrl || !org.zabbixApiToken) {
        return res.json({ enabled: false, updatedAt: null, pollIntervalSec: pollIntervalSec, items: [] });
    }

    var cacheKey = String(orgId);
    var cached = zabbixStatusCache[cacheKey];
    var now = Date.now();
    // Кэш чуть короче клиентского опроса, чтобы карта чаще получала свежие данные.
    var cacheMs = Math.max(10000, Math.min(ZABBIX_STATUS_CACHE_MS, pollIntervalSec * 1000 - 5000));
    if (cached && (now - cached.at) < cacheMs) {
        return res.json(cached.payload);
    }

    try {
        var payload = await buildZabbixStatusForOrg(org);
        zabbixStatusCache[cacheKey] = { at: now, payload: payload };
        res.json(payload);
    } catch (e) {
        res.status(502).json({
            enabled: true,
            error: e && e.message ? String(e.message) : 'Ошибка Zabbix API',
            updatedAt: null,
            pollIntervalSec: pollIntervalSec,
            items: []
        });
    }
});

app.get('/api/users', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Доступ только для администратора' });
    const isGlobal = isGlobalAdmin(user);
    const users = db.getUsers().filter(u => {
        if (isGlobal) return true;
        // Администратор организации видит только пользователей своей организации
        return u.organizationId && u.organizationId === user.organizationId;
    });
    const allOrgs = db.getOrganizations();
    const orgs = isGlobal ? allOrgs : allOrgs.filter(o => o.id === user.organizationId);
    const safe = users.map(u => {
        var o = userToClientFields(u);
        if (u.organizationId) {
            var org = orgs.find(function(x) { return x.id === u.organizationId; });
            o.organizationName = org ? org.name : null;
        }
        return o;
    });
    res.json({ users: safe, organizations: orgs });
});

function avatarUserIdFromRouteParam(param) {
    var s = String(param || '');
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\.(jpe?g|png|webp|gif)$/i, '');
}

app.get('/api/avatars/:userId', (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : (req.query && req.query.token ? String(req.query.token) : '');
    const viewer = getSessionUserFromToken(token);
    if (!viewer) return res.status(401).end();
    const userId = avatarUserIdFromRouteParam(req.params.userId);
    if (!canViewUserAvatar(viewer, userId)) return res.status(403).end();
    const file = avatars.findAvatarFile(userId);
    if (!file) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type(avatars.mimeForExt(path.extname(file)));
    res.sendFile(path.resolve(file));
});

app.post('/api/users/me/avatar', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    const parsed = avatars.parseAvatarPayload(req.body);
    if (!parsed) return res.status(400).json({ error: 'Некорректное изображение. Допустимы JPG, PNG, WebP или GIF до 2 МБ.' });
    const users = db.getUsers();
    const i = users.findIndex(function(u) { return String(u.id) === String(user.userId); });
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    try {
        avatars.saveUserAvatar(user.userId, parsed.buffer, parsed.ext);
        users[i].avatarUpdatedAt = Date.now();
        db.setUsers(users);
        const avatarUrl = avatars.getAvatarApiPath(users[i].id, users[i].avatarUpdatedAt);
        res.json({ ok: true, avatarUrl: avatarUrl });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.delete('/api/users/me/avatar', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    const users = db.getUsers();
    const i = users.findIndex(function(u) { return String(u.id) === String(user.userId); });
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    avatars.removeAvatarFiles(user.userId);
    delete users[i].avatarUpdatedAt;
    db.setUsers(users);
    res.json({ ok: true, avatarUrl: null });
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

app.put('/api/users/:userId', async (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const userId = req.params.userId;
    const { fullName, role, password, organizationId, email } = req.body || {};
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!canAdminManageUser(admin, users[i])) {
        return res.status(403).json({ error: 'Нет прав на изменение этого пользователя' });
    }

    if (role !== undefined && users[i].role === 'admin' && role !== 'admin') {
        if (String(admin.userId) === String(userId)) {
            return res.status(400).json({ error: 'Нельзя снять с себя роль администратора' });
        }
        if (users[i].organizationId && countOrgAdmins(users[i].organizationId, users) <= 1) {
            return res.status(400).json({ error: 'Нельзя снять роль с единственного администратора организации' });
        }
    }
    if (fullName !== undefined) { users[i].fullName = fullName; users[i].full_name = fullName; }
    if (email !== undefined) {
        var emailTrim = String(email).trim();
        if (emailTrim && !isValidEmail(emailTrim)) {
            return res.status(400).json({ error: 'Укажите корректный e-mail' });
        }
        users[i].email = emailTrim || null;
    }
    if (role !== undefined) users[i].role = role;
    if (password && String(password).length >= 6) {
        try {
            users[i].password = await passwords.hashPassword(password);
        } catch (e) {
            return res.status(500).json({ error: 'Не удалось сохранить пароль' });
        }
    }
    if (organizationId !== undefined) {
        // Portable: одна организация — нельзя переносить пользователей в другую.
        if (organizationId && String(organizationId) !== String(users[i].organizationId)) {
            return res.status(403).json({ error: 'Нельзя менять организацию пользователя' });
        }
    }
    db.setUsers(users);
    res.json({ ok: true });
});

app.delete('/api/users/:userId', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const userId = req.params.userId;
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    if (!canAdminManageUser(admin, users[i])) {
        return res.status(403).json({ error: 'Нет прав на удаление этого пользователя' });
    }
    if (userId === admin.userId) return res.status(400).json({ error: 'Нельзя удалить свой аккаунт' });
    if (users[i].username === 'admin') return res.status(400).json({ error: 'Нельзя удалить главного администратора' });
    if (users[i].role === 'admin' && users[i].organizationId && countOrgAdmins(users[i].organizationId, users) <= 1) {
        return res.status(400).json({ error: 'Нельзя удалить единственного администратора организации' });
    }
    const deleted = users[i];
    users.splice(i, 1);
    db.setUsers(users);
    try { db.deleteSessionsForUser(deleted.id); } catch (e) {}
    res.json({ ok: true, user: { id: deleted.id, username: deleted.username } });
});

app.post('/api/users', async (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const { username, password, fullName, role, organizationId, email } = req.body || {};
    if (!username || username.length < 3) return res.status(400).json({ error: 'Имя не менее 3 символов' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });
    // Portable: одна организация на инстанс
    if (!admin.organizationId) return res.status(403).json({ error: 'Нет организации для создания пользователя' });
    var resolvedOrgId = admin.organizationId;
    const users = db.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.status(400).json({ error: 'Пользователь уже существует' });
    let hashedPassword;
    try {
        hashedPassword = await passwords.hashPassword(password);
    } catch (e) {
        return res.status(500).json({ error: 'Не удалось сохранить пароль' });
    }
    var resolvedEmail = '';
    if (email && isValidEmail(String(email))) {
        resolvedEmail = String(email).trim();
    } else if (resolvedOrgId) {
        var orgForEmail = db.getOrganization(resolvedOrgId);
        if (orgForEmail && orgForEmail.contactEmail && isValidEmail(orgForEmail.contactEmail)) {
            resolvedEmail = String(orgForEmail.contactEmail).trim();
        }
    }
    const newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        username: username,
        password: hashedPassword,
        fullName: fullName || username,
        full_name: fullName || username,
        role: role || 'user',
        status: 'approved',
        emailVerified: true,
        organizationId: resolvedOrgId,
        createdAt: new Date().toISOString()
    };
    if (resolvedEmail) newUser.email = resolvedEmail;
    users.push(newUser);
    db.setUsers(users);
    res.json({ ok: true, user: { id: newUser.id, username: newUser.username } });
});

app.get('/api/history', (req, res) => {
    try {
        var user = getSessionUser(req);
        var orgId = (user && user.organizationId) ? user.organizationId : (user && user.role === 'admin' ? (req.query.orgId || (db.getOrganizations().length ? db.getOrganizations()[0].id : null)) : null);
        if (!orgId && user) return res.status(403).json({ error: 'Выберите организацию' });
        var history = orgId ? db.getHistory(orgId) : [];
        res.json({ history: history });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/history', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    var orgId = user.organizationId || (user.role === 'admin' && req.body && req.body.organizationId ? req.body.organizationId : null);
    if (!orgId) return res.status(403).json({ error: 'Укажите организацию' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Только администратор может изменять историю' });
    try {
        const history = req.body && req.body.history;
        if (!Array.isArray(history)) return res.status(400).json({ error: 'Ожидается массив history' });
        db.setHistory(orgId, history);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

const MAX_CHAT_TEXT_LENGTH = 2000;
const CHAT_HISTORY_DEFAULT_LIMIT = 100;

function getOrgApprovedUsers(orgId) {
    return db.getUsers().filter(function(u) {
        return u.organizationId && String(u.organizationId) === String(orgId) &&
            (u.status || 'approved') === 'approved';
    });
}

function parseMentionsFromText(text, orgId, explicitIds) {
    var mentions = [];
    var seen = {};
    function addUser(u) {
        if (!u || seen[String(u.id)]) return;
        seen[String(u.id)] = true;
        mentions.push({
            userId: u.id,
            username: u.username,
            fullName: (u.fullName || u.full_name || '').toString().trim()
        });
    }
    if (Array.isArray(explicitIds)) {
        var all = db.getUsers();
        explicitIds.forEach(function(id) {
            var u = all.find(function(x) { return String(x.id) === String(id); });
            if (u && u.organizationId && String(u.organizationId) === String(orgId)) addUser(u);
        });
    }
    if (!text) return mentions;
    var orgUsers = getOrgApprovedUsers(orgId);
    var re = /@([a-zA-Z0-9_.\u0400-\u04FF-]+)/g;
    var m;
    while ((m = re.exec(text))) {
        var token = m[1].toLowerCase();
        var u = orgUsers.find(function(x) {
            return String(x.username || '').toLowerCase() === token;
        });
        if (!u) {
            u = orgUsers.find(function(x) {
                var fn = (x.fullName || x.full_name || '').toString().trim().toLowerCase();
                if (!fn) return false;
                var compact = fn.replace(/\s+/g, '');
                return compact.indexOf(token) === 0 || fn.split(/\s+/)[0] === token;
            });
        }
        if (u) addUser(u);
    }
    return mentions;
}

function resolveSenderAvatarUrl(user) {
    if (user && user.avatarUrl) return user.avatarUrl;
    if (!user || user.userId == null) return null;
    var users = db.getUsers();
    var u = users.find(function(x) { return String(x.id) === String(user.userId); });
    return u ? avatars.getAvatarApiPath(u.id, u.avatarUpdatedAt) : null;
}

function buildChatMessage(user, content) {
    var name = (user.fullName || user.username || 'Участник').toString().trim().slice(0, 100) || 'Участник';
    var text = content && content.text != null ? String(content.text).trim() : '';
    if (text.length > MAX_CHAT_TEXT_LENGTH) text = text.slice(0, MAX_CHAT_TEXT_LENGTH);
    var msg = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
        userId: user.userId,
        userName: name,
        avatarUrl: resolveSenderAvatarUrl(user),
        text: text || null,
        createdAt: new Date().toISOString()
    };
    if (content && Array.isArray(content.mentions) && content.mentions.length) {
        msg.mentions = content.mentions;
    }
    if (content && content.mediaId) {
        msg.mediaId = String(content.mediaId);
        msg.mediaKind = content.mediaKind || null;
        if (content.mediaUrl) msg.mediaUrl = content.mediaUrl;
        if (content.mediaName) msg.mediaName = content.mediaName;
        if (content.mediaExt) msg.mediaExt = content.mediaExt;
        if (content.mediaMime) msg.mediaMime = content.mediaMime;
        if (content.mediaSize != null) msg.mediaSize = content.mediaSize;
    }
    return msg;
}

function broadcastOrgChat(orgId, message) {
    if (!orgId || !wss) return;
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
            try { client.send(JSON.stringify({ type: 'chat', message: message })); } catch (e) {}
        }
    });
}

function broadcastOrgChatDeleted(orgId, messageId) {
    if (!orgId || !wss || !messageId) return;
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
            try { client.send(JSON.stringify({ type: 'chat_deleted', messageId: String(messageId) })); } catch (e) {}
        }
    });
}

function broadcastOrgChatUpdated(orgId, message) {
    if (!orgId || !wss || !message || !message.id) return;
    wss.clients.forEach(function(client) {
        if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
            try { client.send(JSON.stringify({ type: 'chat_updated', message: message })); } catch (e) {}
        }
    });
}

function sendOrgChatHistory(ws, orgId, limit) {
    var messages = db.getOrgChat(orgId, limit || CHAT_HISTORY_DEFAULT_LIMIT);
    try { ws.send(JSON.stringify({ type: 'chat_history', messages: messages })); } catch (e) {}
}

function createOrgChatMessage(user, payload) {
    var orgId = user.organizationId;
    if (!orgId) return { error: 'Укажите организацию', status: 403 };

    var text = '';
    var mediaId = '';
    if (payload != null && typeof payload === 'object') {
        text = payload.text != null ? String(payload.text).trim() : '';
        mediaId = payload.mediaId != null ? String(payload.mediaId).trim() : '';
    } else if (payload != null) {
        text = String(payload).trim();
    }

    if (!text && !mediaId) return { error: 'Пустое сообщение', status: 400 };

    var mediaItem = null;
    if (mediaId) {
        mediaItem = db.getChatMediaItem(orgId, mediaId);
        if (!mediaItem) return { error: 'Стикер или GIF не найден', status: 404 };
    }

    var mentions = parseMentionsFromText(text, orgId, payload && payload.mentionUserIds);
    var message = buildChatMessage(user, {
        text: text || null,
        mentions: mentions,
        mediaId: mediaItem ? mediaItem.id : null,
        mediaKind: mediaItem ? mediaItem.kind : null,
        mediaUrl: mediaItem ? chatMedia.getMediaApiPath(mediaItem.id, mediaItem.ext) : null,
        mediaName: mediaItem ? (mediaItem.name || null) : null,
        mediaExt: mediaItem ? mediaItem.ext : null,
        mediaMime: mediaItem ? (mediaItem.mime || chatMedia.mimeForExt(mediaItem.ext)) : null,
        mediaSize: mediaItem && mediaItem.size != null ? mediaItem.size : null
    });
    db.addOrgChatMessage(orgId, message);
    broadcastOrgChat(orgId, message);
    return { ok: true, message: message };
}

function deleteOrgChatMessage(user, messageId) {
    var orgId = user && user.organizationId ? user.organizationId : null;
    if (!orgId) return { error: 'Чат доступен только участникам организации', status: 403 };
    var id = messageId != null ? String(messageId).trim() : '';
    if (!id) return { error: 'messageId обязателен', status: 400 };
    var messages = db.getOrgChat(orgId);
    var message = Array.isArray(messages)
        ? messages.find(function(item) { return item && String(item.id) === id; })
        : null;
    if (!message) return { error: 'Сообщение не найдено', status: 404 };
    var canDelete = String(message.userId) === String(user.userId) || user.role === 'admin';
    if (!canDelete) return { error: 'Можно удалять только свои сообщения', status: 403 };
    var removed = db.removeOrgChatMessage(orgId, id);
    if (!removed) return { error: 'Сообщение уже удалено', status: 404 };
    broadcastOrgChatDeleted(orgId, id);
    return { ok: true, messageId: id };
}

function editOrgChatMessage(user, messageId, payload) {
    var orgId = user && user.organizationId ? user.organizationId : null;
    if (!orgId) return { error: 'Чат доступен только участникам организации', status: 403 };
    var id = messageId != null ? String(messageId).trim() : '';
    if (!id) return { error: 'messageId обязателен', status: 400 };
    var newText = payload && payload.text != null ? String(payload.text).trim() : '';
    if (!newText) return { error: 'Текст сообщения не может быть пустым', status: 400 };
    if (newText.length > MAX_CHAT_TEXT_LENGTH) newText = newText.slice(0, MAX_CHAT_TEXT_LENGTH);
    var messages = db.getOrgChat(orgId);
    var message = Array.isArray(messages)
        ? messages.find(function(item) { return item && String(item.id) === id; })
        : null;
    if (!message) return { error: 'Сообщение не найдено', status: 404 };
    var canEdit = String(message.userId) === String(user.userId) || user.role === 'admin';
    if (!canEdit) return { error: 'Можно изменять только свои сообщения', status: 403 };
    var updated = db.updateOrgChatMessageText(orgId, id, newText);
    if (!updated) return { error: 'Сообщение не найдено', status: 404 };
    broadcastOrgChatUpdated(orgId, updated);
    return { ok: true, message: updated };
}

app.get('/api/chat/members', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    try {
        var members = getOrgApprovedUsers(user.organizationId).map(function(u) {
            return {
                id: u.id,
                username: u.username,
                fullName: (u.fullName || u.full_name || '').toString().trim(),
                avatarUrl: avatars.getAvatarApiPath(u.id, u.avatarUpdatedAt)
            };
        });
        res.json({ members: members });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/chat', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    try {
        var limit = parseInt(req.query.limit, 10);
        if (isNaN(limit) || limit < 1) limit = CHAT_HISTORY_DEFAULT_LIMIT;
        if (limit > 500) limit = 500;
        var messages = db.getOrgChat(user.organizationId, limit);
        res.json({ messages: messages });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/chat/updates', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    try {
        var sinceRaw = req.query.since;
        var sinceMs = sinceRaw ? new Date(String(sinceRaw)).getTime() : (Date.now() - 3600000);
        if (isNaN(sinceMs)) sinceMs = Date.now() - 3600000;
        var messages = db.getOrgChatSince(user.organizationId, sinceMs);
        res.json({ messages: messages, serverTime: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/devices/register', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        var body = req.body || {};
        var token = body.token != null ? String(body.token).trim() : '';
        if (!token) return res.status(400).json({ error: 'token обязателен' });
        db.registerDeviceToken(user.userId, user.organizationId, token, body.platform || 'android');
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/devices/unregister', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        var body = req.body || {};
        var token = body.token != null ? String(body.token).trim() : '';
        if (!token) return res.status(400).json({ error: 'token обязателен' });
        db.unregisterDeviceToken(user.userId, token);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/chat', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        var body = req.body || {};
        var result = createOrgChatMessage(user, { text: body.text, mediaId: body.mediaId });
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json({ ok: true, message: result.message });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.delete('/api/chat/:messageId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        var result = deleteOrgChatMessage(user, req.params && req.params.messageId);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json({ ok: true, messageId: result.messageId });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.patch('/api/chat/:messageId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    try {
        var result = editOrgChatMessage(user, req.params && req.params.messageId, req.body || {});
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json({ ok: true, message: result.message });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/chat/media', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    try {
        var kind = null;
        if (req.query.kind === 'gif') kind = 'gif';
        else if (req.query.kind === 'sticker') kind = 'sticker';
        else if (req.query.kind === 'file') kind = 'file';
        var items = db.getChatMedia(user.organizationId, kind);
        var media = items.map(function(item) {
            return {
                id: item.id,
                kind: item.kind,
                name: item.name,
                ext: item.ext,
                mime: item.mime || chatMedia.mimeForExt(item.ext),
                size: item.size != null ? item.size : null,
                url: chatMedia.getMediaApiPath(item.id, item.ext),
                uploadedBy: item.uploadedBy,
                uploadedByName: item.uploadedByName,
                createdAt: item.createdAt
            };
        });
        res.json({ media: media });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/chat/media', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    var kind = 'sticker';
    if (req.body && req.body.kind === 'gif') kind = 'gif';
    else if (req.body && req.body.kind === 'file') kind = 'file';
    var parsed = chatMedia.parseMediaPayload(req.body, kind);
    if (!parsed) {
        var limitMb = kind === 'gif' ? '8' : (kind === 'file' ? '15' : '2');
        var errText = kind === 'gif'
            ? 'Некорректный GIF. Допустим только GIF до ' + limitMb + ' МБ.'
            : (kind === 'file'
                ? 'Некорректный файл. Допустимы PDF, Office, архивы, изображения и текстовые файлы до ' + limitMb + ' МБ.'
                : 'Некорректное изображение. Допустимы JPG, PNG, WebP или GIF до ' + limitMb + ' МБ.');
        return res.status(400).json({ error: errText });
    }
    try {
        var orgId = user.organizationId;
        var mediaId = 'cm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        chatMedia.saveOrgMedia(orgId, mediaId, parsed.buffer, parsed.ext);
        var name = (req.body && req.body.name) ? String(req.body.name).trim().slice(0, 120) : '';
        if (!name && kind === 'file') name = 'file' + parsed.ext;
        var item = {
            id: mediaId,
            kind: parsed.kind,
            ext: parsed.ext,
            mime: parsed.mime,
            size: parsed.size,
            name: name,
            uploadedBy: user.userId,
            uploadedByName: (user.fullName || user.username || '').toString().trim().slice(0, 100),
            createdAt: new Date().toISOString()
        };
        db.addChatMedia(orgId, item);
        res.json({
            ok: true,
            media: {
                id: item.id,
                kind: item.kind,
                name: item.name,
                ext: item.ext,
                mime: item.mime,
                size: item.size,
                url: chatMedia.getMediaApiPath(item.id, item.ext),
                uploadedBy: item.uploadedBy,
                uploadedByName: item.uploadedByName,
                createdAt: item.createdAt
            }
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.delete('/api/chat/media/:mediaId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Чат доступен только участникам организации' });
    var mediaId = chatMedia.mediaIdFromRouteParam(req.params.mediaId);
    var item = db.getChatMediaItem(user.organizationId, mediaId);
    if (!item) return res.status(404).json({ error: 'Файл не найден' });
    var canDelete = String(item.uploadedBy) === String(user.userId) || user.role === 'admin';
    if (!canDelete) return res.status(403).json({ error: 'Можно удалять только свои вложения' });
    try {
        chatMedia.removeMediaFile(user.organizationId, mediaId, item.ext);
        db.removeChatMedia(user.organizationId, mediaId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/chat/media/file/:mediaId', (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : (req.query && req.query.token ? String(req.query.token) : '');
    const viewer = getSessionUserFromToken(token);
    if (!viewer || !viewer.organizationId) return res.status(401).end();
    var mediaId = chatMedia.mediaIdFromRouteParam(req.params.mediaId);
    var item = db.getChatMediaItem(viewer.organizationId, mediaId);
    if (!item) return res.status(404).end();
    const file = chatMedia.findMediaFile(viewer.organizationId, mediaId, item.ext);
    if (!file) return res.status(404).end();
    var mime = item.mime || chatMedia.mimeForExt(path.extname(file));
    var downloadName = chatMedia.safeDownloadName(item.name, item.ext || path.extname(file));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(mime);
    if (!chatMedia.shouldInlineFile(item)) {
        res.setHeader('Content-Disposition', 'attachment; filename="' + downloadName.replace(/"/g, '') + '"');
    }
    res.sendFile(path.resolve(file));
});

app.get('/api/object-media/quota', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    try {
        var orgId = user.organizationId;
        var objectUniqueId = req.query && req.query.objectUniqueId ? String(req.query.objectUniqueId).trim() : '';
        var mapData = db.getMapData(orgId);
        res.json(objectMedia.getQuotaInfo(orgId, objectUniqueId || null, mapData));
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/object-media', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    var parsed = objectMedia.parseImagePayload(req.body);
    if (!parsed) {
        return res.status(400).json({ error: 'Некорректное изображение. Допустимы JPG, PNG, WebP или GIF до 5 МБ.' });
    }
    try {
        var orgId = user.organizationId;
        var objectUniqueId = req.body && req.body.objectUniqueId ? String(req.body.objectUniqueId).trim() : '';
        var mapData = db.getMapData(orgId);
        var quotaCheck = objectMedia.checkUploadQuotas(orgId, objectUniqueId, mapData, parsed.size);
        if (!quotaCheck.ok) {
            return res.status(413).json({
                error: quotaCheck.error,
                code: quotaCheck.code || 'quota',
                orgUsedBytes: quotaCheck.orgUsedBytes,
                orgMaxBytes: quotaCheck.orgMaxBytes,
                objectUsedBytes: quotaCheck.objectUsedBytes,
                objectMaxBytes: quotaCheck.objectMaxBytes
            });
        }
        var mediaId = 'om_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        objectMedia.saveOrgMedia(orgId, mediaId, parsed.buffer, parsed.ext);
        var name = (req.body && req.body.name) ? String(req.body.name).trim().slice(0, 120) : '';
        var item = {
            id: mediaId,
            ext: parsed.ext,
            mime: parsed.mime,
            size: parsed.size,
            name: name,
            uploadedBy: user.userId,
            createdAt: new Date().toISOString()
        };
        res.json({
            ok: true,
            media: {
                id: item.id,
                name: item.name,
                ext: item.ext,
                mime: item.mime,
                size: item.size,
                url: objectMedia.getMediaApiPath(item.id, item.ext),
                uploadedBy: item.uploadedBy,
                createdAt: item.createdAt
            }
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.delete('/api/object-media/:mediaId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    var mediaId = objectMedia.mediaIdFromRouteParam(req.params.mediaId);
    if (!mediaId || mediaId.indexOf('om_') !== 0) return res.status(404).json({ error: 'Файл не найден' });
    try {
        objectMedia.removeMediaFile(user.organizationId, mediaId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/object-media/file/:mediaId', (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : (req.query && req.query.token ? String(req.query.token) : '');
    const viewer = getSessionUserFromToken(token);
    if (!viewer || !viewer.organizationId) return res.status(401).end();
    var mediaId = objectMedia.mediaIdFromRouteParam(req.params.mediaId);
    if (!mediaId || mediaId.indexOf('om_') !== 0) return res.status(404).end();
    const file = objectMedia.findMediaFile(viewer.organizationId, mediaId);
    if (!file) return res.status(404).end();
    var mime = objectMedia.mimeForExt(path.extname(file));
    var downloadName = objectMedia.safeDownloadName(null, path.extname(file));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(mime);
    res.setHeader('Content-Disposition', 'inline; filename="' + downloadName.replace(/"/g, '') + '"');
    res.sendFile(path.resolve(file));
});

// ===== On-prem basemap / ортофото (GeoTIFF → XYZ tiles) =====
var basemapUpload = multer({
    dest: path.join(DATA_DIR, 'basemaps', '_tmp'),
    limits: {
        fileSize: (function () {
            var gb = parseFloat(serverConfig.basemapMaxUploadGb || process.env.BASEMAP_MAX_UPLOAD_GB || '8');
            if (!gb || gb < 0.1) gb = 8;
            return Math.floor(gb * 1024 * 1024 * 1024);
        })()
    },
    fileFilter: function (req, file, cb) {
        var name = String(file.originalname || '').toLowerCase();
        var ok = /\.(tif|tiff|geotiff)$/i.test(name) ||
            /tiff|geotiff|octet-stream/i.test(String(file.mimetype || ''));
        if (!ok) return cb(new Error('Допустим только GeoTIFF (.tif/.tiff)'));
        cb(null, true);
    }
});

function ensureBasemapTmpDir() {
    var dir = path.join(DATA_DIR, 'basemaps', '_tmp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}
ensureBasemapTmpDir();

app.get('/api/basemap/status', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    var gdal = basemap.getGdalStatus();
    var used = basemap.getOrgUsedBytes(user.organizationId);
    var quota = basemap.getQuotaBytes(serverConfig);
    res.json({
        gdal: gdal,
        usedBytes: used,
        quotaBytes: quota,
        usedLabel: basemap.formatBytes(used),
        quotaLabel: basemap.formatBytes(quota),
        active: basemap.getActiveManifest(user.organizationId)
    });
});

app.get('/api/basemap/active', (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : (req.query && req.query.token ? String(req.query.token) : '');
    const user = token ? getSessionUserFromToken(token) : getSessionUser(req);
    if (!user || !user.organizationId) return res.status(401).json({ error: 'Требуется авторизация' });
    var active = basemap.getActiveManifest(user.organizationId);
    if (!active) return res.json({ packId: null });
    res.json(active);
});

app.get('/api/basemap/packs', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    res.json(basemap.listPacks(user.organizationId));
});

app.get('/api/basemap/tiles/:packId/:z/:x/:y', (req, res) => {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
        ? req.headers.authorization.slice(7)
        : (req.query && req.query.token ? String(req.query.token) : '');
    const user = getSessionUserFromToken(token);
    if (!user || !user.organizationId) return res.status(401).end();
    var packId = String(req.params.packId || '');
    if (!/^pack_[a-z0-9_]+$/i.test(packId)) return res.status(404).end();
    var z = parseInt(req.params.z, 10);
    var x = parseInt(req.params.x, 10);
    var y = parseInt(String(req.params.y).replace(/\.png$/i, ''), 10);
    if (!isFinite(z) || !isFinite(x) || !isFinite(y) || z < 0 || z > 24) return res.status(404).end();
    var file = basemap.findTile(user.organizationId, packId, z, x, y);
    if (!file) return res.status(404).end();
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type('image/png');
    res.sendFile(path.resolve(file));
});

app.post('/api/basemap/upload', function (req, res) {
    ensureBasemapTmpDir();
    basemapUpload.single('file')(req, res, function (err) {
        if (err) {
            return res.status(400).json({ error: String(err.message || err) });
        }
        const user = getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
        if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
        if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
        if (!req.file || !req.file.path) {
            return res.status(400).json({ error: 'Файл GeoTIFF не получен (поле file)' });
        }
        try {
            var mode = (req.body && req.body.mode === 'patch') ? 'patch' : 'full';
            var job = basemap.createUploadJob({
                orgId: user.organizationId,
                tempPath: req.file.path,
                fileSize: req.file.size || 0,
                sourceName: (req.body && req.body.sourceName) || req.file.originalname || '',
                mode: mode,
                minZoom: req.body && req.body.minZoom,
                maxZoom: req.body && req.body.maxZoom,
                activate: req.body && req.body.activate !== 'false',
                serverConfig: serverConfig
            });
            res.json({ ok: true, jobId: job.id, status: job.status, mode: job.mode });
        } catch (e) {
            try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (eUn) {}
            res.status(e.status || 500).json({
                error: String(e.message || e),
                code: e.code || undefined
            });
        }
    });
});

app.get('/api/basemap/jobs/:jobId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    var job = basemap.getJob(String(req.params.jobId || ''));
    if (!job || String(job.orgId) !== String(user.organizationId)) {
        return res.status(404).json({ error: 'Задача не найдена' });
    }
    res.json({
        id: job.id,
        status: job.status,
        progress: job.progress,
        message: job.message,
        error: job.error,
        packId: job.packId,
        mode: job.mode,
        bounds: job.bounds || null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
    });
});

app.post('/api/basemap/:packId/activate', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    try {
        var active = basemap.activatePack(user.organizationId, String(req.params.packId || ''));
        res.json({ ok: true, active: active });
    } catch (e) {
        res.status(e.status || 500).json({ error: String(e.message || e) });
    }
});

app.delete('/api/basemap/:packId', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.status(403).json({ error: 'Доступно только участникам организации' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    try {
        res.json(basemap.deletePack(user.organizationId, String(req.params.packId || '')));
    } catch (e) {
        res.status(e.status || 500).json({ error: String(e.message || e) });
    }
});

app.get('/api/settings', (req, res) => {
    try {
        var user = getSessionUser(req);
        var orgId = (user && user.organizationId) ? user.organizationId : (user && user.role === 'admin' ? (req.query.orgId || (db.getOrganizations().length ? db.getOrganizations()[0].id : null)) : null);
        var settings = db.getSettings(orgId || undefined);
        if (user && db.getMapStartForUserOrOrg) {
            const mapStart = db.getMapStartForUserOrOrg(user.userId, orgId);
            if (mapStart) settings.mapStart = mapStart;
        }
        if (user && db.getThemeForUser) {
            settings.theme = db.getThemeForUser(user.userId) || '';
        }
        if (user && db.getPerfSettingsForUser) {
            var perf = db.getPerfSettingsForUser(user.userId);
            if (perf) settings.perfSettings = perf;
        }
        if (user && db.getThemeAccentForUser) {
            var accent = db.getThemeAccentForUser(user.userId);
            if (accent) settings.themeAccent = accent;
        }
        if (user && db.getLodThresholdsForUser) {
            var lod = db.getLodThresholdsForUser(user.userId);
            if (lod) settings.lodThresholds = lod;
        }
        if (user && db.getBasemapTypeForUser) {
            var userBasemap = db.getBasemapTypeForUser(user.userId);
            if (userBasemap) settings.userBasemapType = userBasemap;
        }
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/settings', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (user.embed) return res.status(403).json({ error: 'В режиме встраивания настройки недоступны' });
    const body = req.body || {};
    var orgId = user.organizationId || (user.role === 'admin' && body.organizationId ? body.organizationId : null);
    try {
        if (body.mapStart !== undefined) {
            const parsedMapStart = parseMapStartPayload(body.mapStart);
            if (parsedMapStart) {
                if (db.setMapStartForUser) db.setMapStartForUser(user.userId, parsedMapStart);
                // Админ задаёт общий вид карты для всей организации
                if (user.role === 'admin' && orgId && db.setMapStartForOrg) {
                    db.setMapStartForOrg(orgId, parsedMapStart);
                }
            } else if (db.setMapStartForUser) {
                db.setMapStartForUser(user.userId, null);
            }
        }
        if (body.theme !== undefined && db.setThemeForUser) {
            const t = body.theme === 'dark' || body.theme === 'light' ? body.theme : null;
            db.setThemeForUser(user.userId, t);
        }
        if (body.perfSettings !== undefined && db.setPerfSettingsForUser) {
            db.setPerfSettingsForUser(user.userId, body.perfSettings);
        }
        if (body.themeAccent !== undefined && db.setThemeAccentForUser) {
            db.setThemeAccentForUser(user.userId, body.themeAccent);
        }
        if (body.lodThresholds !== undefined && db.setLodThresholdsForUser) {
            db.setLodThresholdsForUser(user.userId, body.lodThresholds);
        }
        if (body.userBasemapType !== undefined && db.setBasemapTypeForUser) {
            db.setBasemapTypeForUser(user.userId, body.userBasemapType);
        }
        var toSave = {};
        if (user.role === 'admin') {
            if (body.groupNames !== undefined && typeof body.groupNames === 'object') {
                syncGroupNames = body.groupNames;
            }
            toSave = Object.assign({}, body);
            delete toSave.theme;
            delete toSave.mapStart;
            delete toSave.perfSettings;
            delete toSave.themeAccent;
            delete toSave.lodThresholds;
            delete toSave.userBasemapType;
        }
        if (Object.keys(toSave).length > 0) db.setSettings(toSave, orgId || undefined);
        if (orgId && (toSave.collaboratorCursorStyle !== undefined || toSave.fiberMapColor !== undefined || toSave.fiberMapStrokeWidth !== undefined || toSave.cameraCoverageColor !== undefined || toSave.radioBridgeCoverageColor !== undefined || toSave.defaultBasemapType !== undefined || toSave.defaultBasemapOfflineType !== undefined)) {
            var orgSettings = db.getSettings(orgId);
            var broadcastPayload = {};
            if (toSave.collaboratorCursorStyle !== undefined) {
                broadcastPayload.collaboratorCursorStyle = orgSettings.collaboratorCursorStyle;
            }
            if (toSave.fiberMapColor !== undefined || toSave.fiberMapStrokeWidth !== undefined) {
                broadcastPayload.fiberMapColor = orgSettings.fiberMapColor;
                broadcastPayload.fiberMapStrokeWidth = orgSettings.fiberMapStrokeWidth;
            }
            if (toSave.cameraCoverageColor !== undefined) {
                broadcastPayload.cameraCoverageColor = orgSettings.cameraCoverageColor;
            }
            if (toSave.radioBridgeCoverageColor !== undefined) {
                broadcastPayload.radioBridgeCoverageColor = orgSettings.radioBridgeCoverageColor;
            }
            if (toSave.defaultBasemapType !== undefined) {
                broadcastPayload.defaultBasemapType = orgSettings.defaultBasemapType;
            }
            if (toSave.defaultBasemapOfflineType !== undefined) {
                broadcastPayload.defaultBasemapOfflineType = orgSettings.defaultBasemapOfflineType;
            }
            broadcastOrgSettings(orgId, broadcastPayload);
        }
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

function wsClientBelongsToOrg(clientOrgId, targetOrgId) {
    if (clientOrgId == null || clientOrgId === '' || !targetOrgId) return false;
    if (String(clientOrgId) === String(targetOrgId)) return true;
    var org = db.getOrganization(targetOrgId);
    return !!(org && String(clientOrgId) === String(org.id));
}

app.get('/api/backups', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
    const orgId = user.organizationId || null;
    if (!orgId) return res.status(403).json({ error: 'Бэкапы доступны только для привязанной организации' });
    try {
        const list = db.listBackups(orgId);
        res.json({ backups: list });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/backups/restore', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Только для администратора' });
    const orgId = user.organizationId || null;
    if (!orgId) return res.status(403).json({ error: 'Восстановление доступно только для привязанной организации' });
    const filename = req.body && req.body.filename;
    if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'Укажите filename' });
    // force: админ организации может подтвердить откат к меньшей карте (старый бэкап)
    var force = !!(req.body && req.body.force);
    try {
        db.restoreFromBackup(orgId, filename.trim(), { force: force });
        Object.keys(syncCurrentStateByOrg).forEach(function(oid) {
            if (wsClientBelongsToOrg(oid, orgId)) delete syncCurrentStateByOrg[oid];
        });
        wss.clients.forEach(function(client) {
            if (client.readyState === WebSocket.OPEN && wsClientBelongsToOrg(client.orgId, orgId)) {
                try { client.close(4002, 'Данные карты восстановлены'); } catch (e) {}
            }
        });
        res.json({ ok: true, message: 'Данные восстановлены. Все учётные записи организации отключены. Войдите снова.' });
    } catch (e) {
        const msg = e && e.message ? String(e.message) : 'Ошибка восстановления';
        var payload = { error: msg };
        if (e && e.code === 'MAP_SHRINK') {
            payload.code = 'MAP_SHRINK';
            if (e.previous != null) payload.previous = e.previous;
            if (e.next != null) payload.next = e.next;
        }
        res.status(400).json(payload);
    }
});

app.get('/api/health', (req, res) => res.json({
    ok: true,
    db: (db.getStorageMode && db.getStorageMode()) || 'json'
}));

app.post('/api/perf/client', (req, res) => {
    const user = getSessionUser(req);
    if (!user || user.userId == null) return res.status(401).json({ error: 'Требуется авторизация' });
    var result = perfMonitor.recordClientReport(user, req.body, {
        username: user.fullName || user.username,
        organizationName: user.organization && user.organization.name,
        userAgent: req.headers['user-agent']
    });
    if (!result.ok) return res.status(400).json({ error: 'Некорректные данные' });
    res.json({ ok: true });
});

function buildPerfMapWarnings(analysis, load, online) {
    var warnings = [];
    var mb = analysis.bytes / 1048576;
    var objectCount = 0;
    analysis.byType.forEach(function(t) {
        if (t.type !== 'cable' && t.type !== 'cableLabel') objectCount += t.count;
    });
    if (mb >= 20) warnings.push({ level: 'danger', text: 'Очень большой объём данных карты (' + mb.toFixed(1) + ' МБ): долгая загрузка, сохранение и синхронизация' });
    else if (mb >= 8) warnings.push({ level: 'warn', text: 'Большой объём данных карты (' + mb.toFixed(1) + ' МБ)' });
    if (analysis.bytes > 0 && analysis.photosBytes / analysis.bytes >= 0.25 && analysis.photosBytes > 1048576) {
        warnings.push({ level: 'warn', text: 'Фото занимают ' + Math.round(analysis.photosBytes / analysis.bytes * 100) + '% данных карты' });
    }
    if (objectCount >= 10000) warnings.push({ level: 'danger', text: 'Очень много объектов (' + objectCount + '): на слабых ПК рекомендуйте режим «Эконом»' });
    else if (objectCount >= 4000) warnings.push({ level: 'warn', text: 'Много объектов (' + objectCount + ')' });
    if (analysis.cablePoints >= 100000) warnings.push({ level: 'danger', text: 'Очень детальные трассы кабелей (' + analysis.cablePoints + ' точек)' });
    else if (analysis.cablePoints >= 30000) warnings.push({ level: 'warn', text: 'Много точек в трассах кабелей (' + analysis.cablePoints + ')' });
    if (analysis.fiberSplices >= 50000) warnings.push({ level: 'warn', text: 'Много сварок волокон (' + analysis.fiberSplices + ')' });
    if (load.saves.p95Ms >= 500) warnings.push({ level: 'danger', text: 'Медленное сохранение карты (p95 ' + load.saves.p95Ms + ' мс) — блокирует сервер' });
    else if (load.saves.p95Ms >= 150) warnings.push({ level: 'warn', text: 'Сохранение карты занимает ' + load.saves.p95Ms + ' мс (p95)' });
    if (load.opsPerMin >= 120) warnings.push({ level: 'warn', text: 'Высокая частота изменений: ' + load.opsPerMin + ' операций/мин' });
    if (load.statesPer15m >= 10) warnings.push({ level: 'warn', text: 'Частая полная перезапись карты клиентами (' + load.statesPer15m + ' за 15 мин)' });
    if (online >= 2 && mb >= 5 && load.wsOutKb5m >= 20480) {
        warnings.push({ level: 'warn', text: 'Большой исходящий трафик синхронизации: ' + Math.round(load.wsOutKb5m / 1024) + ' МБ за 5 мин' });
    }
    return warnings;
}

const DEFAULT_PUBLIC_SITE_URL = '';

const PDF_FONT_ROOT_CANDIDATES = [
    path.join(ROOT_DIR, 'TILDASANS-VF_5.TTF'),
    path.join(ROOT_DIR, 'TildaSans-VF_5.ttf'),
    path.join(ROOT_DIR, 'NotoSans-Regular.ttf')
];

function resolvePdfFontPath() {
    const publicFontsDir = path.join(PUBLIC_DIR, 'fonts');
    const publicCandidates = PDF_FONT_ROOT_CANDIDATES.map(function(p) {
        return path.join(publicFontsDir, path.basename(p));
    });
    const candidates = publicCandidates.concat(PDF_FONT_ROOT_CANDIDATES);
    for (let i = 0; i < candidates.length; i++) {
        if (fs.existsSync(candidates[i])) return candidates[i];
    }
    return null;
}

function ensurePdfFontDeployed() {
    let source = null;
    for (let i = 0; i < PDF_FONT_ROOT_CANDIDATES.length; i++) {
        if (fs.existsSync(PDF_FONT_ROOT_CANDIDATES[i])) {
            source = PDF_FONT_ROOT_CANDIDATES[i];
            break;
        }
    }
    if (!source) return;
    try {
        const fontDir = path.join(PUBLIC_DIR, 'fonts');
        fs.mkdirSync(fontDir, { recursive: true });
        const baseName = path.basename(source);
        const dest = path.join(fontDir, baseName);
        if (!fs.existsSync(dest)) fs.copyFileSync(source, dest);
        const canonical = path.join(fontDir, 'TILDASANS-VF_5.TTF');
        if (baseName !== 'TILDASANS-VF_5.TTF' && !fs.existsSync(canonical)) {
            fs.copyFileSync(source, canonical);
        }
    } catch (eFont) {
        console.warn('[PDF] Не удалось скопировать шрифт в public/fonts:', eFont && eFont.message ? eFont.message : eFont);
    }
}

ensurePdfFontDeployed();

function httpGetBuffer(targetUrl, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var parsed;
        try {
            parsed = new URL(targetUrl);
        } catch (eUrl) {
            reject(eUrl);
            return;
        }
        var lib = parsed.protocol === 'https:' ? https : http;
        var req = lib.request({
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Network-map static-map-proxy',
                'Accept': 'image/*,*/*'
            },
            timeout: timeoutMs || 20000
        }, function(upstream) {
            if (upstream.statusCode >= 300 && upstream.statusCode < 400 && upstream.headers.location) {
                var next = upstream.headers.location;
                if (!/^https?:\/\//i.test(next)) {
                    next = parsed.protocol + '//' + parsed.host + next;
                }
                upstream.resume();
                httpGetBuffer(next, timeoutMs).then(resolve, reject);
                return;
            }
            var chunks = [];
            upstream.on('data', function(chunk) { chunks.push(chunk); });
            upstream.on('end', function() {
                var buffer = Buffer.concat(chunks);
                if (upstream.statusCode !== 200) {
                    reject(new Error('upstream-http-' + upstream.statusCode));
                    return;
                }
                resolve({
                    buffer: buffer,
                    contentType: upstream.headers['content-type'] || 'image/png'
                });
            });
        });
        req.on('error', reject);
        req.on('timeout', function() {
            req.destroy();
            reject(new Error('upstream-timeout'));
        });
        req.end();
    });
}

function buildStaticMapUpstreamUrls(ll, zoom, size, lang, apiKey) {
    var urls = [];
    if (apiKey && apiKey !== 'YOUR_YANDEX_MAPS_API_KEY') {
        urls.push('https://static-maps.yandex.ru/v1?apikey=' + encodeURIComponent(apiKey)
            + '&ll=' + encodeURIComponent(ll)
            + '&z=' + zoom
            + '&size=' + encodeURIComponent(size)
            + '&lang=' + encodeURIComponent(lang));
    }
    var legacy = 'https://static-maps.yandex.ru/1.x/?lang=' + encodeURIComponent(lang)
        + '&ll=' + encodeURIComponent(ll)
        + '&z=' + zoom
        + '&l=map&size=' + encodeURIComponent(size);
    if (apiKey && apiKey !== 'YOUR_YANDEX_MAPS_API_KEY') {
        legacy += '&apikey=' + encodeURIComponent(apiKey);
    }
    urls.push(legacy);
    return urls;
}

async function fetchStaticMapImage(ll, zoom, size, lang, apiKey) {
    var urls = buildStaticMapUpstreamUrls(ll, zoom, size, lang, apiKey);
    var lastError = null;
    for (var i = 0; i < urls.length; i++) {
        try {
            if (typeof fetch === 'function') {
                var upstream = await fetch(urls[i], { redirect: 'follow' });
                if (upstream.ok) {
                    return {
                        buffer: Buffer.from(await upstream.arrayBuffer()),
                        contentType: upstream.headers.get('content-type') || 'image/png'
                    };
                }
                lastError = new Error('upstream-http-' + upstream.status);
                continue;
            }
            return await httpGetBuffer(urls[i]);
        } catch (eTry) {
            lastError = eTry;
        }
    }
    throw lastError || new Error('static-map-unavailable');
}

function getSiteBaseUrl(req) {
    const configured = serverConfig.publicSiteUrl || process.env.PUBLIC_SITE_URL || '';
    if (configured) return String(configured).trim().replace(/\/$/, '');
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) return DEFAULT_PUBLIC_SITE_URL;
    const hostname = host.replace(/:\d+$/, '').toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1') return '';
    return proto + '://' + host;
}

app.get('/api/public-config', (req, res) => {
    var keyRaw = String(serverConfig.yandexMapsApiKey || process.env.YANDEX_MAPS_API_KEY || '').trim();
    var keyOk = !!(keyRaw && keyRaw !== 'YOUR_YANDEX_MAPS_API_KEY');
    var key = keyOk ? keyRaw : '';
    const publicSiteUrl = serverConfig.publicSiteUrl || process.env.PUBLIC_SITE_URL || getSiteBaseUrl(req);
    const mapEngineRaw = String(serverConfig.mapEngine || process.env.MAP_ENGINE || 'leaflet').trim().toLowerCase();
    // Portable on-prem: dual Leaflet+Яндекс. Без интернета — GeoTIFF / пустая подложка; с сетью — Яндекс.
    // mapEngine=yandex только если явно задан и есть ключ; иначе dual (leaflet).
    var mapEngine;
    if (mapEngineRaw === 'yandex' && keyOk) {
        mapEngine = 'yandex';
    } else if (mapEngineRaw === 'leaflet' || mapEngineRaw === 'offline' || mapEngineRaw === 'orthophoto' || !keyOk) {
        mapEngine = 'leaflet';
    } else {
        mapEngine = 'leaflet';
    }
    res.json({
        portable: true,
        yandexMapsApiKey: key,
        mapEngine: mapEngine,
        publicSiteUrl: publicSiteUrl ? String(publicSiteUrl).trim().replace(/\/$/, '') : '',
        freeMapObjectLimit: getDefaultFreeMapObjectLimit() === -1 ? null : getDefaultFreeMapObjectLimit(),
        defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers() === -1 ? null : getDefaultMaxConcurrentUsers()
    });
});

app.get('/api/pdf-font', (req, res) => {
    const fontPath = resolvePdfFontPath();
    if (!fontPath) {
        return res.status(404).json({ error: 'PDF font not found' });
    }
    res.setHeader('Content-Type', 'font/ttf');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(fontPath);
});

app.get('/api/static-map-image', async (req, res) => {
    const ll = String(req.query.ll || '').trim();
    const size = String(req.query.size || '').trim();
    const lang = String(req.query.lang || 'ru_RU').trim();
    const zoomRaw = parseInt(String(req.query.z || '12'), 10);
    const zoom = Number.isFinite(zoomRaw) ? Math.max(1, Math.min(17, zoomRaw)) : 12;
    if (!/^\d+(\.\d+)?,\d+(\.\d+)?$/.test(ll)) {
        return res.status(400).json({ error: 'Invalid ll parameter' });
    }
    if (!/^\d+,\d+$/.test(size)) {
        return res.status(400).json({ error: 'Invalid size parameter' });
    }
    const apiKey = String(serverConfig.yandexMapsApiKey || process.env.YANDEX_MAPS_API_KEY || '').trim();
    try {
        const result = await fetchStaticMapImage(ll, zoom, size, lang, apiKey);
        res.setHeader('Content-Type', result.contentType || 'image/png');
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.send(result.buffer);
    } catch (eMap) {
        console.error('[PDF] static-map-image proxy failed:', eMap && eMap.message ? eMap.message : eMap, { ll, size, zoom });
        res.status(502).json({ error: 'Static map proxy failed' });
    }
});

// Portable: корень — карта (клиент редиректит на auth без сессии)
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(PUBLIC_DIR, 'favicon.svg'));
});

// Раздача JS с явным Content-Type (избегаем text/html от прокси/404)
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), {
    setHeaders: function (res, filePath) {
        if (filePath && String(filePath).endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
    }
}));

app.use(express.static(PUBLIC_DIR));

/** Клиент оборвал соединение во время чтения body (reload, таймаут, cancel) — не ошибка приложения. */
function isRequestAbortedError(err) {
    if (!err) return false;
    if (err.type === 'request.aborted') return true;
    if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') return true;
    var msg = String(err.message || '').toLowerCase();
    return msg === 'request aborted' || msg.indexOf('request aborted') !== -1;
}

app.use(function(err, req, res, next) {
    if (isRequestAbortedError(err)) {
        if (!res.headersSent) {
            try { res.status(400).end(); } catch (eEnd) {}
        }
        return;
    }
    if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
        if (!res.headersSent) {
            return res.status(413).json({
                error: 'Слишком большой запрос. Для карт с большим числом объектов увеличьте лимит body на сервере.'
            });
        }
        return;
    }
    var status = err && (err.status || err.statusCode) ? (err.status || err.statusCode) : 500;
    if (status >= 500) {
        console.error('[API]', err && err.stack ? err.stack : err);
    }
    if (!res.headersSent) {
        res.status(status).json({ error: (err && err.message) ? String(err.message) : 'Internal Server Error' });
    }
});


/** PORTABLE_STRIP_APPLIED — bootstrap одной организации и админа из server-config.json */
async function ensurePortableBootstrap() {
    var orgName = String(serverConfig.organizationName || 'Организация').trim() || 'Организация';
    var adminUser = String(serverConfig.bootstrapAdminUsername || 'admin').trim() || 'admin';
    var adminPass = String(serverConfig.bootstrapAdminPassword || 'admin123');
    var adminFull = String(serverConfig.bootstrapAdminFullName || 'Администратор').trim() || 'Администратор';
    var adminEmail = String(serverConfig.adminEmail || '').trim() || '';

    function looksBrokenOrgName(name) {
        var s = String(name || '').trim();
        if (!s) return true;
        if (/^\?[\?\s]*$/.test(s)) return true;
        // UTF-8, прочитанный как Windows-1251
        if (/Р[А-Яа-яЁё]/.test(s) && /С[А-Яа-яЁё]/.test(s)) return true;
        return false;
    }

    var orgs = db.getOrganizations() || [];
    var org = orgs[0] || null;
    if (!org) {
        var newOrgId = db.addOrganization({
            name: orgName,
            status: 'active',
            contactEmail: adminEmail,
            mapObjectLimitUnlocked: true,
            maxConcurrentUsers: -1
        });
        try {
            db.updateOrganization(newOrgId, { setupCompleted: false });
        } catch (eSetup) {}
        org = db.getOrganization(newOrgId);
        console.log('[Portable] Создана организация:', orgName, '(' + newOrgId + ')');
    } else {
        try {
            var heal = {
                status: 'active',
                mapObjectLimitUnlocked: true,
                maxConcurrentUsers: -1,
                customMapObjectLimit: null,
                twoFactorEnabled: false,
                twoFactorSecret: null
            };
            if (looksBrokenOrgName(org.name)) {
                heal.name = orgName;
                heal.setupCompleted = false;
                console.log('[Portable] Восстановлено название организации:', orgName);
            }
            db.updateOrganization(org.id, heal);
            org = db.getOrganization(org.id) || org;
        } catch (eOrg) {}
    }
    if (!org || !org.id) {
        throw new Error('[Portable] Не удалось создать или найти организацию');
    }

    var users = db.getUsers() || [];
    var admin = users.find(function(u) {
        return u && String(u.username).toLowerCase() === adminUser.toLowerCase();
    });
    if (!admin) {
        var hashed = await passwords.hashPassword(adminPass);
        users.push({
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            username: adminUser,
            password: hashed,
            fullName: adminFull,
            role: 'admin',
            status: 'approved',
            emailVerified: true,
            email: adminEmail || null,
            organizationId: org.id,
            createdAt: new Date().toISOString()
        });
        db.setUsers(users);
        console.log('[Portable] Создан администратор:', adminUser + ' / ' + adminPass, '(смените пароль после первого входа)');
    } else {
        var patched = false;
        if (!admin.organizationId) {
            admin.organizationId = org.id;
            patched = true;
        }
        if (admin.emailVerified === false) {
            admin.emailVerified = true;
            patched = true;
        }
        if (admin.status !== 'approved') {
            admin.status = 'approved';
            patched = true;
        }
        if (admin.role !== 'admin') {
            admin.role = 'admin';
            patched = true;
        }
        if (admin.fullName && /Р[А-Яа-яЁё]/.test(String(admin.fullName)) && /С[А-Яа-яЁё]/.test(String(admin.fullName))) {
            admin.fullName = adminFull;
            patched = true;
        }
        if (patched) {
            db.setUsers(users);
            console.log('[Portable] Администратор обновлён и привязан к организации:', org.name || org.id);
        }
    }

    users = db.getUsers() || [];
    var changed = false;
    users.forEach(function(u) {
        if (u.emailVerified === false) { u.emailVerified = true; changed = true; }
        if (u.role === 'admin' && !u.organizationId) { u.organizationId = org.id; changed = true; }
    });
    if (changed) db.setUsers(users);
}

// Storage bootstrap (JSON sync or MySQL hydrate) happens in initStorage before listen.

function normalizeSyncOrgId(orgId) {
    if (orgId == null || orgId === '') return null;
    var org = db.getOrganization(orgId);
    return org ? org.id : String(orgId);
}

function syncOrgIdsEqual(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}

function getSyncStateForOrg(orgId, options) {
    options = options || {};
    var key = normalizeSyncOrgId(orgId);
    if (!key) return null;
    if (options.forceFromDb || !syncCurrentStateByOrg[key]) {
        syncCurrentStateByOrg[key] = {
            clientId: 'server',
            data: cpuPool.deepCloneSync(db.getMapData(key) || [])
        };
        try {
            var sett = db.getSettings(key);
            if (sett && sett.groupNames && (sett.groupNames.cross || sett.groupNames.node)) {
                syncGroupNamesByOrg[key] = sett.groupNames;
            }
        } catch (e) {}
    }
    return syncCurrentStateByOrg[key];
}

if (db.createDailyBackup) {
    const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setTimeout(function runBackup() {
        db.createDailyBackup();
        setInterval(db.createDailyBackup, BACKUP_INTERVAL_MS);
    }, 60 * 1000);
}

const server = http.createServer(app);
var syncGroupNames = null;
var syncGroupNamesByOrg = {};
try {
    var s = db.getSettings();
    if (s && s.groupNames && typeof s.groupNames === 'object') syncGroupNames = s.groupNames;
} catch (e) {}
var syncCurrentStateByOrg = {};
var mapDbSaveTimersByOrg = {};
var MAP_DB_SAVE_DEBOUNCE_MS = 1500;

function scheduleMapDbSave(orgId) {
    var key = normalizeSyncOrgId(orgId);
    if (!key) return;
    if (mapDbSaveTimersByOrg[key]) clearTimeout(mapDbSaveTimersByOrg[key]);
    mapDbSaveTimersByOrg[key] = setTimeout(function() {
        mapDbSaveTimersByOrg[key] = null;
        try {
            var state = syncCurrentStateByOrg[key];
            if (state && Array.isArray(state.data)) db.setMapData(key, state.data);
        } catch (e) {
            console.error('[Sync] setMapData refused for', key, e && e.message);
        }
    }, MAP_DB_SAVE_DEBOUNCE_MS);
}

function flushMapDbSave(orgId) {
    var key = normalizeSyncOrgId(orgId);
    if (!key) return;
    if (mapDbSaveTimersByOrg[key]) {
        clearTimeout(mapDbSaveTimersByOrg[key]);
        mapDbSaveTimersByOrg[key] = null;
    }
    try {
        var state = syncCurrentStateByOrg[key];
        if (state && Array.isArray(state.data)) db.setMapData(key, state.data);
    } catch (e) {
        console.error('[Sync] flush setMapData refused for', key, e && e.message);
    }
}

const wss = new WebSocket.Server({ server, path: '/sync' });
const syncClientNames = new Map();
const syncClientUserIds = new Map();
const syncClientOrgIds = new Map();
perfMonitor.registerGauge('wsClients', function() { return wss.clients.size; });
perfMonitor.registerGauge('cpuPool', function() { return cpuPool.stats(); });
perfMonitor.registerGauge('storageMode', function() {
    return typeof db.getStorageMode === 'function' ? db.getStorageMode() : 'json';
});
perfMonitor.registerGauge('syncStatesInMemory', function() { return Object.keys(syncCurrentStateByOrg).length; });
perfMonitor.registerGauge('mysqlPersist', function() {
    return typeof db.getMysqlPersistStats === 'function' ? db.getMysqlPersistStats() : null;
});

function notifySessionRevokedForUser(userId, exceptToken) {
    if (userId == null || !wss) return;
    var uid = String(userId);
    wss.clients.forEach(function(client) {
        if (client.readyState !== WebSocket.OPEN) return;
        if (String(client.userId || '') !== uid) return;
        if (exceptToken && client.authToken === exceptToken) return;
        try {
            client.send(JSON.stringify({
                type: 'session_revoked',
                reason: 'Выполнен вход с другого устройства.'
            }));
            client.close(4002, 'session_revoked');
        } catch (e) {}
    });
}

function closeWsIfTokenRevoked(ws) {
    if (!ws || !ws.authToken) return false;
    var now = Date.now();
    if (ws._sessionOkUntil && now < ws._sessionOkUntil) return false;
    if (getSessionByToken(ws.authToken)) {
        ws._sessionOkUntil = now + SESSION_TOKEN_CACHE_MS;
        return false;
    }
    try {
        ws.send(JSON.stringify({
            type: 'session_revoked',
            reason: 'Выполнен вход с другого устройства.'
        }));
        ws.close(4002, 'session_revoked');
    } catch (e) {}
    return true;
}
const objectLocksByOrg = {};
const OBJECT_LOCK_TTL_MS = 3 * 60 * 1000;

function getOrgObjectLocks(orgId) {
    if (!orgId) return null;
    if (!objectLocksByOrg[orgId]) objectLocksByOrg[orgId] = {};
    return objectLocksByOrg[orgId];
}

function pruneStaleObjectLocks(orgId) {
    var locks = getOrgObjectLocks(orgId);
    if (!locks) return;
    var now = Date.now();
    Object.keys(locks).forEach(function(uid) {
        var lock = locks[uid];
        if (!lock || now - (lock.at || 0) > OBJECT_LOCK_TTL_MS) delete locks[uid];
    });
}

function collectObjectLocksList(orgId) {
    pruneStaleObjectLocks(orgId);
    var locks = getOrgObjectLocks(orgId);
    if (!locks) return [];
    return Object.keys(locks).map(function(uid) {
        var lock = locks[uid];
        return {
            uniqueId: uid,
            clientId: lock.clientId,
            userId: lock.userId != null ? lock.userId : null,
            displayName: lock.displayName || 'Участник',
            at: lock.at
        };
    });
}

function broadcastObjectLocks(orgId) {
    if (!orgId) return;
    var list = collectObjectLocksList(orgId);
    wss.clients.forEach(function(client) {
        if (client.readyState !== WebSocket.OPEN || !syncOrgIdsEqual(client.orgId, orgId)) return;
        try {
            client.send(JSON.stringify({ type: 'object_locks', locks: list }));
        } catch (e) {}
    });
}

function releaseObjectLocksForClient(clientId, orgId) {
    if (!orgId) return false;
    var locks = getOrgObjectLocks(orgId);
    if (!locks) return false;
    var changed = false;
    Object.keys(locks).forEach(function(uid) {
        if (locks[uid] && locks[uid].clientId === clientId) {
            delete locks[uid];
            changed = true;
        }
    });
    return changed;
}

function tryAcquireObjectLock(orgId, clientId, uniqueId, meta) {
    if (!orgId || !clientId || !uniqueId) return { ok: false };
    pruneStaleObjectLocks(orgId);
    var locks = getOrgObjectLocks(orgId);
    var existing = locks[uniqueId];
    var now = Date.now();
    if (existing && existing.clientId !== clientId && now - (existing.at || 0) <= OBJECT_LOCK_TTL_MS) {
        return { ok: false, lock: existing };
    }
    locks[uniqueId] = {
        clientId: clientId,
        userId: meta.userId != null ? meta.userId : null,
        displayName: meta.displayName || 'Участник',
        at: now
    };
    return { ok: true, lock: locks[uniqueId] };
}

function tryReleaseObjectLock(orgId, clientId, uniqueId) {
    if (!orgId || !clientId || !uniqueId) return false;
    var locks = getOrgObjectLocks(orgId);
    var existing = locks[uniqueId];
    if (!existing || existing.clientId !== clientId) return false;
    delete locks[uniqueId];
    return true;
}

function tryTouchObjectLock(orgId, clientId, uniqueId) {
    if (!orgId || !clientId || !uniqueId) return false;
    pruneStaleObjectLocks(orgId);
    var locks = getOrgObjectLocks(orgId);
    var existing = locks[uniqueId];
    if (!existing || existing.clientId !== clientId) return false;
    existing.at = Date.now();
    return true;
}

function isSyncClientAdmin(clientId) {
    const userId = syncClientUserIds.get(clientId);
    if (!userId) return false;
    const users = db.getUsers();
    const user = users.find(function(u) { return u.id === userId; });
    return user && user.role === 'admin';
}

/** Resolve cable endpoints from serialized map data (client uses full-array indices + optional uniqueIds). */
function cableEndpointUniqueIdsFromSerialized(fullState, cable) {
    var fu = cable.fromUniqueId;
    var tu = cable.toUniqueId;
    if (fu != null && fu !== '' && tu != null && tu !== '') {
        return { fromUid: fu, toUid: tu };
    }
    if (!Array.isArray(fullState)) return { fromUid: fu, toUid: tu };
    var fi = cable.from;
    var ti = cable.to;
    if ((fu == null || fu === '') && fi != null && fi >= 0 && fi < fullState.length) {
        var a = fullState[fi];
        if (a && a.type !== 'cable' && a.uniqueId != null) fu = a.uniqueId;
    }
    if ((tu == null || tu === '') && ti != null && ti >= 0 && ti < fullState.length) {
        var b = fullState[ti];
        if (b && b.type !== 'cable' && b.uniqueId != null) tu = b.uniqueId;
    }
    return { fromUid: fu, toUid: tu };
}

function copyOpticalFiberFieldsToCableData(cableData, c) {
    if (!cableData || !c || c.cableType === 'copper') return;
    if (c.fiberCount != null && c.fiberCount !== '') {
        var fc = parseInt(c.fiberCount, 10);
        if (!isNaN(fc) && fc > 0) cableData.fiberCount = fc;
    }
    if (Array.isArray(c.fiberPalette) && c.fiberPalette.length) {
        cableData.fiberPalette = c.fiberPalette;
    }
    if (c.fibersPerModule != null && c.fibersPerModule !== '') {
        var mpm = parseInt(c.fibersPerModule, 10);
        if (!isNaN(mpm) && mpm > 0) cableData.fibersPerModule = mpm;
    }
    if (c.moduleCount != null && c.moduleCount !== '') {
        var mc = parseInt(c.moduleCount, 10);
        if (!isNaN(mc) && mc > 0) cableData.moduleCount = mc;
    }
}

function normalizeUndergroundSpansArray(spans) {
    if (!Array.isArray(spans) || !spans.length) return null;
    var out = [];
    for (var i = 0; i < spans.length; i++) {
        var s = spans[i];
        if (!s || typeof s !== 'object') continue;
        var entry = s.entryManholeId || s.manholeId || null;
        var exit = s.exitManholeId || s.supportId || null;
        if (!entry || !exit) continue;
        var path = Array.isArray(s.pathCoords) ? s.pathCoords.filter(function(c) {
            return Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number';
        }).map(function(c) { return [c[0], c[1]]; }) : [];
        out.push({ entryManholeId: entry, exitManholeId: exit, pathCoords: path });
    }
    return out.length ? out : null;
}

function copyUndergroundFieldsToCableData(cableData, c) {
    if (!cableData || !c || c.cableType === 'copper') return;
    var spans = normalizeUndergroundSpansArray(c.undergroundSpans);
    if (spans) cableData.undergroundSpans = spans;
}

function mergeMapState(current, incoming) {
    if (!Array.isArray(incoming)) return current;
    if (incoming.length === 0) return incoming;
    if (!Array.isArray(current) || current.length === 0) return incoming;
    var currentObjs = current.filter(function(i) { return i.type !== 'cable'; });
    var currentCables = current.filter(function(i) { return i.type === 'cable'; });
    var incomingObjs = incoming.filter(function(i) { return i.type !== 'cable'; });
    var incomingCables = incoming.filter(function(i) { return i.type === 'cable'; });
    var mergedObjs = [];
    var i, j, o, inc, uid, idx, fromUid, toUid, fromIdx, toIdx, c, cableData, existing, ends;
    for (i = 0; i < currentObjs.length; i++) mergedObjs.push(currentObjs[i]);
    for (j = 0; j < incomingObjs.length; j++) {
        inc = incomingObjs[j];
        idx = -1;
        if (inc.uniqueId != null && inc.uniqueId !== '') {
            idx = mergedObjs.findIndex(function(o) { return o.uniqueId === inc.uniqueId; });
        }
        if (idx >= 0) mergedObjs[idx] = inc;
        else mergedObjs.push(inc);
    }
    var mergedCables = [];
    for (i = 0; i < currentCables.length; i++) {
        c = currentCables[i];
        ends = cableEndpointUniqueIdsFromSerialized(current, c);
        fromUid = ends.fromUid;
        toUid = ends.toUid;
        if (fromUid == null || toUid == null) continue;
        fromIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === fromUid; });
        toIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === toUid; });
        if (fromIdx >= 0 && toIdx >= 0) {
            cableData = { type: 'cable', cableType: c.cableType, from: fromIdx, to: toIdx, geometry: c.geometry };
            if (c.uniqueId != null) cableData.uniqueId = c.uniqueId;
            if (c.distance !== undefined) cableData.distance = c.distance;
            if (c.cableName != null) cableData.cableName = c.cableName;
            if (Array.isArray(c.routeUniqueIds) && c.routeUniqueIds.length >= 2) cableData.routeUniqueIds = c.routeUniqueIds.slice();
            if (c.cableType === 'copper') {
                if (c.copperSwitchFromId) cableData.copperSwitchFromId = c.copperSwitchFromId;
                if (c.copperSwitchToId) cableData.copperSwitchToId = c.copperSwitchToId;
                if (c.copperPortFrom != null && c.copperPortFrom !== '') cableData.copperPortFrom = c.copperPortFrom;
                if (c.copperPortTo != null && c.copperPortTo !== '') cableData.copperPortTo = c.copperPortTo;
            }
            copyOpticalFiberFieldsToCableData(cableData, c);
            copyUndergroundFieldsToCableData(cableData, c);
            mergedCables.push(cableData);
        }
    }
    for (j = 0; j < incomingCables.length; j++) {
        c = incomingCables[j];
        ends = cableEndpointUniqueIdsFromSerialized(incoming, c);
        fromUid = ends.fromUid;
        toUid = ends.toUid;
        if (fromUid == null || toUid == null) continue;
        fromIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === fromUid; });
        toIdx = mergedObjs.findIndex(function(o) { return o.uniqueId === toUid; });
        if (fromIdx < 0 || toIdx < 0) continue;
        cableData = { type: 'cable', cableType: c.cableType, from: fromIdx, to: toIdx, geometry: c.geometry };
        if (c.uniqueId != null) cableData.uniqueId = c.uniqueId;
        if (c.distance !== undefined) cableData.distance = c.distance;
        if (c.cableName != null) cableData.cableName = c.cableName;
        if (Array.isArray(c.routeUniqueIds) && c.routeUniqueIds.length >= 2) cableData.routeUniqueIds = c.routeUniqueIds.slice();
        if (c.cableType === 'copper') {
            if (c.copperSwitchFromId) cableData.copperSwitchFromId = c.copperSwitchFromId;
            if (c.copperSwitchToId) cableData.copperSwitchToId = c.copperSwitchToId;
            if (c.copperPortFrom != null && c.copperPortFrom !== '') cableData.copperPortFrom = c.copperPortFrom;
            if (c.copperPortTo != null && c.copperPortTo !== '') cableData.copperPortTo = c.copperPortTo;
        }
        copyOpticalFiberFieldsToCableData(cableData, c);
        copyUndergroundFieldsToCableData(cableData, c);
        existing = mergedCables.findIndex(function(x) { return x.uniqueId === c.uniqueId; });
        if (existing >= 0) mergedCables[existing] = cableData; else mergedCables.push(cableData);
    }
    return mergedObjs.concat(mergedCables);
}

function getItemRevision(item) {
    if (!item || item.revision == null) return 0;
    var r = Number(item.revision);
    return isNaN(r) ? 0 : r;
}

function applyOperationToState(state, op) {
    if (!Array.isArray(state)) return { state: state, conflict: null };
    var i, idx, fromIdx, toIdx, fromUid, toUid, c, cur, baseRev, merged;
    if (op.type === 'add_object' && op.data) {
        var objCount = 0;
        for (i = 0; i < state.length; i++) {
            if (state[i] && state[i].type !== 'cable') objCount++;
        }
        var addUid = op.data.uniqueId;
        if (addUid != null && addUid !== '') {
            idx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === addUid; });
            if (idx >= 0) {
                state = state.slice();
                merged = Object.assign({}, state[idx], op.data);
                merged.revision = getItemRevision(state[idx]) + 1;
                state[idx] = merged;
                op.data = merged;
                return { state: state, conflict: null };
            }
        }
        var addData = Object.assign({}, op.data, { revision: 1 });
        op.data = addData;
        state = state.slice(0, objCount).concat([addData]).concat(state.slice(objCount));
        state = state.map(function(item) {
            if (item.type !== 'cable') return item;
            var from = item.from, to = item.to;
            if (from >= objCount) from++; if (to >= objCount) to++;
            return Object.assign({}, item, { from: from, to: to });
        });
        return { state: state, conflict: null };
    }
    if (op.type === 'update_object' && op.uniqueId != null && op.data) {
        idx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === op.uniqueId; });
        if (idx >= 0) {
            cur = state[idx];
            baseRev = op.baseRevision;
            if (baseRev != null && Number(baseRev) !== getItemRevision(cur)) {
                var sameEditor = cur._syncEditor && cur._syncEditor === op._clientId;
                var oneBehindAfterCreate = Number(baseRev) + 1 === getItemRevision(cur);
                if (!sameEditor && !oneBehindAfterCreate && Number(baseRev) < getItemRevision(cur)) {
                    return {
                        state: state,
                        conflict: {
                            uniqueId: op.uniqueId,
                            revision: getItemRevision(cur),
                            data: cur,
                            editorClientId: cur._syncEditor || null
                        }
                    };
                }
            }
            state = state.slice();
            merged = Object.assign({}, cur, op.data);
            delete merged.revision;
            merged.revision = getItemRevision(cur) + 1;
            merged._syncEditor = op._clientId || cur._syncEditor || null;
            state[idx] = merged;
            op.data = merged;
        }
        return { state: state, conflict: null };
    }
    if (op.type === 'delete_object' && op.uniqueId != null) {
        idx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === op.uniqueId; });
        if (idx < 0) return { state: state, conflict: null };
        state = state.filter(function(_, i) { return i !== idx; });
        state = state.map(function(item, i) {
            if (item.type !== 'cable') return item;
            var from = item.from, to = item.to;
            if (from === idx || to === idx) return null;
            if (from > idx) from--; if (to > idx) to--;
            return Object.assign({}, item, { from: from, to: to });
        }).filter(Boolean);
        return { state: state, conflict: null };
    }
    if (op.type === 'add_cable' && op.data) {
        fromUid = op.data.fromUniqueId; toUid = op.data.toUniqueId;
        fromIdx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === fromUid; });
        toIdx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === toUid; });
        // Fallback: uniqueId как строка / без строгого type filter если концы потерялись в индексе
        if (fromIdx < 0 && fromUid != null && fromUid !== '') {
            fromIdx = state.findIndex(function(i) { return i && i.type !== 'cable' && String(i.uniqueId) === String(fromUid); });
        }
        if (toIdx < 0 && toUid != null && toUid !== '') {
            toIdx = state.findIndex(function(i) { return i && i.type !== 'cable' && String(i.uniqueId) === String(toUid); });
        }
        if (fromIdx >= 0 && toIdx >= 0) {
            c = { type: 'cable', cableType: op.data.cableType, from: fromIdx, to: toIdx, geometry: op.data.geometry };
            if (fromUid != null && fromUid !== '') c.fromUniqueId = fromUid;
            if (toUid != null && toUid !== '') c.toUniqueId = toUid;
            if (op.data.uniqueId != null) c.uniqueId = op.data.uniqueId;
            if (op.data.distance !== undefined) c.distance = op.data.distance;
            if (op.data.cableName != null) c.cableName = op.data.cableName;
            if (Array.isArray(op.data.routeUniqueIds) && op.data.routeUniqueIds.length >= 2) c.routeUniqueIds = op.data.routeUniqueIds.slice();
            if (op.data.cableType === 'copper') {
                if (op.data.copperSwitchFromId) c.copperSwitchFromId = op.data.copperSwitchFromId;
                if (op.data.copperSwitchToId) c.copperSwitchToId = op.data.copperSwitchToId;
                if (op.data.copperPortFrom != null && op.data.copperPortFrom !== '') c.copperPortFrom = op.data.copperPortFrom;
                if (op.data.copperPortTo != null && op.data.copperPortTo !== '') c.copperPortTo = op.data.copperPortTo;
            }
            copyOpticalFiberFieldsToCableData(c, op.data);
            copyUndergroundFieldsToCableData(c, op.data);
            if (op.data.uniqueId != null && op.data.uniqueId !== '') {
                var dupIdx = state.findIndex(function(i) { return i.type === 'cable' && i.uniqueId === op.data.uniqueId; });
                if (dupIdx >= 0) {
                    state = state.slice();
                    merged = Object.assign({}, state[dupIdx], c);
                    merged.revision = getItemRevision(state[dupIdx]) + 1;
                    state[dupIdx] = merged;
                    op.data = merged;
                    return { state: state, conflict: null };
                }
            }
            c.revision = 1;
            op.data = c;
            return { state: state.concat([c]), conflict: null };
        }
        console.warn('[Sync] add_cable dropped: endpoints not found', fromUid, toUid);
        return { state: state, conflict: null };
    }
    if (op.type === 'update_cable' && op.uniqueId != null && op.data) {
        idx = state.findIndex(function(i) { return i.type === 'cable' && i.uniqueId === op.uniqueId; });
        if (idx >= 0) {
            cur = state[idx];
            baseRev = op.baseRevision;
            if (baseRev != null && Number(baseRev) !== getItemRevision(cur)) {
                var sameEditorCable = cur._syncEditor && cur._syncEditor === op._clientId;
                if (!sameEditorCable && Number(baseRev) < getItemRevision(cur)) {
                    return {
                        state: state,
                        conflict: {
                            uniqueId: op.uniqueId,
                            revision: getItemRevision(cur),
                            data: cur,
                            editorClientId: cur._syncEditor || null
                        }
                    };
                }
            }
            state = state.slice();
            merged = Object.assign({}, cur, op.data);
            delete merged.revision;
            merged.revision = getItemRevision(cur) + 1;
            merged._syncEditor = op._clientId || cur._syncEditor || null;
            state[idx] = merged;
            op.data = merged;
        }
        return { state: state, conflict: null };
    }
    if (op.type === 'delete_cable' && op.uniqueId != null) {
        return { state: state.filter(function(i) { return !(i.type === 'cable' && i.uniqueId === op.uniqueId); }), conflict: null };
    }
    return { state: state, conflict: null };
}

function broadcastSyncClients(onlyOrgId) {
    wss.clients.forEach(function(targetClient) {
        if (targetClient.readyState !== WebSocket.OPEN) return;
        var targetOrg = targetClient.orgId != null ? targetClient.orgId : null;
        if (onlyOrgId != null && targetOrg !== onlyOrgId) return;
        var list = [];
        wss.clients.forEach(function(c) {
            if (c.readyState === WebSocket.OPEN && c.clientId && syncOrgIdsEqual(c.orgId, targetOrg)) {
                var uid = syncClientUserIds.get(c.clientId) || null;
                list.push({
                    id: c.clientId,
                    displayName: syncClientNames.get(c.clientId) || 'Участник',
                    userId: uid,
                    avatarUrl: uid != null ? resolveSenderAvatarUrl({ userId: uid }) : null
                });
            }
        });
        try { targetClient.send(JSON.stringify({ type: 'clients', clients: list })); } catch (e) {}
    });
}

wss.on('connection', (ws, req) => {
    if (portableLicense.isEnforced(serverConfig)) {
        var lic = portableLicense.getStatus(serverConfig);
        if (!lic.valid) {
            try {
                ws.send(JSON.stringify({
                    type: 'error',
                    error: lic.error || 'Требуется лицензия Portable',
                    code: 'LICENSE_REQUIRED',
                    machineCode: lic.machineCode
                }));
            } catch (eSend) {}
            try { ws.close(); } catch (eClose) {}
            return;
        }
    }
    const clientId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    ws.clientId = clientId;
    ws.orgId = null;
    ws.connectedAt = Date.now();
    perfMonitor.instrumentWs(ws);
    syncClientNames.set(clientId, 'Участник');
    setImmediate(function() { broadcastSyncClients(); });
    ws.send(JSON.stringify({ type: 'yourId', clientId: clientId }));
    ws.send(JSON.stringify({ type: 'clients', clients: [] }));
    ws.on('message', (raw) => {
        const str = raw.toString();
        if (str.length > 15 * 1024 * 1024) return;
        setImmediate(function() {
        var perfT0 = performance.now();
        var perfMsgType = 'invalid';
        try {
            const msg = JSON.parse(str);
            perfMsgType = msg && msg.type;
            if (msg.type === 'cursor') {
                // Курсоры частые — не гоняем проверку сессии на каждое сообщение.
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
            if (closeWsIfTokenRevoked(ws)) return;
            if (msg.type === 'hello') {
                const name = (msg.displayName && String(msg.displayName).trim()) || 'Участник';
                syncClientNames.set(clientId, name.slice(0, 100));
                if (msg.userId !== undefined && msg.userId !== null) syncClientUserIds.set(clientId, msg.userId);
                var orgId = null;
                if (msg.token) {
                    ws.authToken = String(msg.token);
                    var session = getSessionByToken(msg.token);
                    if (!session) {
                        try {
                            ws.send(JSON.stringify({
                                type: 'session_revoked',
                                reason: 'Выполнен вход с другого устройства.'
                            }));
                            ws.close(4002, 'session_revoked');
                        } catch (e) {}
                        return;
                    }
                    ws.userId = session.userId;
                    orgId = session.organizationId || null;
                    if (orgId) {
                        orgId = normalizeSyncOrgId(orgId);
                        ws.orgId = orgId;
                    }
                    syncClientUserIds.set(clientId, session.userId);
                    if (orgId) syncClientOrgIds.set(clientId, orgId);
                }
                if (orgId) {
                    // Не клонируем всю карту на каждый hello — берём кэш, если уже есть.
                    var state = getSyncStateForOrg(orgId, { forceFromDb: false });
                    if (state) {
                        var groupNames = syncGroupNamesByOrg[orgId] || syncGroupNames;
                        var helloPayload = { type: 'map_refresh', organizationId: orgId };
                        if (groupNames && (groupNames.cross || groupNames.node)) helloPayload.groupNames = groupNames;
                        try { ws.send(JSON.stringify(helloPayload)); } catch (e) {}
                    }
                    try {
                        ws.send(JSON.stringify({ type: 'object_locks', locks: collectObjectLocksList(orgId) }));
                    } catch (eLocks) {}
                    sendOrgChatHistory(ws, orgId);
                }
                setImmediate(function() { broadcastSyncClients(orgId); });
                return;
            }
            if (msg.type === 'chat' && (msg.text != null || msg.mediaId != null)) {
                var orgIdChat = ws.orgId;
                if (!orgIdChat || !ws.userId) return;
                var usersChat = db.getUsers();
                var uChat = usersChat.find(function(u) { return String(u.id) === String(ws.userId); });
                if (!uChat || String(uChat.organizationId) !== String(orgIdChat)) return;
                var chatUser = {
                    userId: uChat.id,
                    username: uChat.username,
                    fullName: uChat.fullName || uChat.full_name,
                    organizationId: orgIdChat,
                    avatarUrl: avatars.getAvatarApiPath(uChat.id, uChat.avatarUpdatedAt)
                };
                createOrgChatMessage(chatUser, {
                    text: msg.text,
                    mediaId: msg.mediaId,
                    mentionUserIds: msg.mentionUserIds
                });
                return;
            }
            var orgId = ws.orgId ? normalizeSyncOrgId(ws.orgId) : null;
            if (!orgId) return;
            if (msg.type === 'groupNames' && msg.groupNames && typeof msg.groupNames === 'object') {
                if (!isSyncClientAdmin(clientId)) return;
                if (orgId) syncGroupNamesByOrg[orgId] = msg.groupNames; else syncGroupNames = msg.groupNames;
                try { db.setSettings({ groupNames: msg.groupNames }, orgId || undefined); } catch (e) {}
                wss.clients.forEach(function(client) {
                    if (client.readyState === WebSocket.OPEN && syncOrgIdsEqual(client.orgId, orgId)) {
                        try { client.send(JSON.stringify({ type: 'groupNames', groupNames: msg.groupNames })); } catch (e) {}
                    }
                });
                return;
            }
            if (msg.type === 'lock_object' && msg.uniqueId && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var lockUid = String(msg.uniqueId).trim();
                if (!lockUid) return;
                var lockMeta = {
                    userId: syncClientUserIds.get(clientId) || null,
                    displayName: syncClientNames.get(clientId) || 'Участник'
                };
                var lockResult = tryAcquireObjectLock(orgId, clientId, lockUid, lockMeta);
                try {
                    ws.send(JSON.stringify({
                        type: 'lock_result',
                        uniqueId: lockUid,
                        ok: !!lockResult.ok,
                        lockedBy: lockResult.ok ? null : (lockResult.lock && lockResult.lock.displayName) || 'Участник'
                    }));
                } catch (eLockRes) {}
                if (lockResult.ok) broadcastObjectLocks(orgId);
                return;
            }
            if (msg.type === 'unlock_object' && msg.uniqueId && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var unlockUid = String(msg.uniqueId).trim();
                if (!unlockUid) return;
                if (tryReleaseObjectLock(orgId, clientId, unlockUid)) broadcastObjectLocks(orgId);
                return;
            }
            if (msg.type === 'lock_touch' && msg.uniqueId && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var touchUid = String(msg.uniqueId).trim();
                if (!touchUid) return;
                tryTouchObjectLock(orgId, clientId, touchUid);
                return;
            }
            if (msg.type === 'op' && msg.op && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var state = getSyncStateForOrg(orgId);
                msg.op._clientId = msg.clientId || clientId;
                var applyResult = applyOperationToState(state.data, msg.op);
                if (applyResult.conflict) {
                    try {
                        ws.send(JSON.stringify({ type: 'op_conflict', conflict: applyResult.conflict }));
                    } catch (eConf) {}
                    return;
                }
                var nextData = applyResult.state;
                var validation = validateMapDataObjectLimit(orgId, nextData);
                if (!validation.ok) {
                    try {
                        ws.send(JSON.stringify({
                            type: 'limit_error',
                            error: validation.error,
                            mapLimits: { count: validation.count, limit: validation.limit, unlocked: validation.unlocked }
                        }));
                    } catch (eLim) {}
                    return;
                }
                state.data = nextData;
                state.clientId = msg.clientId || clientId;
                // Структурные op (кабель/объект) — сразу в store/БД, иначе F5 до debounce теряет данные.
                if (msg.op.type === 'add_cable' || msg.op.type === 'delete_cable' ||
                    msg.op.type === 'add_object' || msg.op.type === 'delete_object') {
                    flushMapDbSave(orgId);
                } else {
                    scheduleMapDbSave(orgId);
                }
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && syncOrgIdsEqual(client.orgId, orgId)) {
                        try { client.send(JSON.stringify({ type: 'op', op: msg.op })); } catch (e) {}
                    }
                });
                return;
            }
            var justConnected = (Date.now() - (ws.connectedAt || 0)) < 4000;
            if (!justConnected && msg.type === 'state' && Array.isArray(msg.data) && isSyncClientAdmin(clientId) && orgId) {
                var state = getSyncStateForOrg(orgId);
                if (!state) return;
                var stateRegionId = msg.regionId != null ? String(msg.regionId).trim() : '';
                var fp = fingerprintMapData(msg.data);
                if (fp && syncStateFingerprintByOrg[orgId] === fp &&
                    Array.isArray(state.data) && state.data.length === msg.data.length && !stateRegionId) {
                    return;
                }
                var nextData;
                if (stateRegionId && db.mapRegionsCore) {
                    try {
                        if (db.ensureMapRegionsMigrated) db.ensureMapRegionsMigrated(orgId);
                    } catch (eMig2) {}
                    var shrinkReg = db.mapRegionsCore.assertRegionSliceNotDangerousShrink(
                        state.data || [],
                        stateRegionId,
                        msg.data,
                        { allowShrink: !!msg.allowShrink }
                    );
                    if (!shrinkReg.ok) {
                        try {
                            ws.send(JSON.stringify({
                                type: 'sync_error',
                                error: shrinkReg.error || 'Отказ записи: опасное уменьшение региона',
                                code: 'MAP_DANGEROUS_SHRINK',
                                previous: shrinkReg.previous,
                                next: shrinkReg.next
                            }));
                        } catch (eShrinkR) {}
                        return;
                    }
                    nextData = db.mapRegionsCore.mergeRegionSliceIntoFull(
                        state.data || [],
                        stateRegionId,
                        db.stripMapItemsFromOtherOrganizations(orgId, msg.data)
                    );
                } else {
                    nextData = db.stripMapItemsFromOtherOrganizations(orgId, msg.data);
                    var shrinkCheck = db.assertMapDataNotDangerousShrink
                        ? db.assertMapDataNotDangerousShrink(orgId, nextData, { allowShrink: !!msg.allowShrink })
                        : { ok: true };
                    if (!shrinkCheck.ok) {
                        try {
                            ws.send(JSON.stringify({
                                type: 'sync_error',
                                error: shrinkCheck.error || 'Отказ записи: опасное уменьшение карты',
                                code: 'MAP_DANGEROUS_SHRINK',
                                previous: shrinkCheck.previous,
                                next: shrinkCheck.next
                            }));
                        } catch (eShrink) {}
                        console.warn('[Sync] Refused dangerous state shrink for', orgId, shrinkCheck);
                        return;
                    }
                }
                var validationFull = validateMapDataObjectLimit(orgId, nextData);
                if (!validationFull.ok) {
                    try {
                        ws.send(JSON.stringify({
                            type: 'limit_error',
                            error: validationFull.error,
                            mapLimits: { count: validationFull.count, limit: validationFull.limit, unlocked: validationFull.unlocked }
                        }));
                    } catch (eLim2) {}
                    return;
                }
                state.data = nextData;
                state.clientId = msg.clientId || clientId;
                syncStateFingerprintByOrg[orgId] = fingerprintMapData(nextData);
                if (msg.groupNames && typeof msg.groupNames === 'object') {
                    syncGroupNamesByOrg[orgId] = msg.groupNames;
                    try { db.setSettings({ groupNames: msg.groupNames }, orgId); } catch (e) {}
                }
                scheduleMapDbSave(orgId);
                var statePayload = {
                    type: 'map_refresh',
                    organizationId: orgId,
                    regionId: stateRegionId || null
                };
                var gn = syncGroupNamesByOrg[orgId] || syncGroupNames;
                if (gn && (gn.cross || gn.node)) statePayload.groupNames = gn;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && syncOrgIdsEqual(client.orgId, orgId)) {
                        try { client.send(JSON.stringify(statePayload)); } catch (e) {}
                    }
                });
            }
        } catch (e) {
        } finally {
            perfMonitor.recordWsMessage(ws.orgId, perfMsgType, str.length, performance.now() - perfT0);
        }
        });
    });
    ws.on('close', function() {
        var closedOrgId = ws.orgId;
        if (closedOrgId && releaseObjectLocksForClient(clientId, closedOrgId)) {
            setImmediate(function() { broadcastObjectLocks(closedOrgId); });
        }
        syncClientNames.delete(clientId);
        syncClientUserIds.delete(clientId);
        syncClientOrgIds.delete(clientId);
        ws.cursor = null;
        if (ws.orgId) flushMapDbSave(ws.orgId);
        setImmediate(function() {
            broadcastSyncClients();
            broadcastCursors();
        });
    });
});

var lastCursorsBroadcast = 0;
var cursorsBroadcastTimer = null;
var CURSORS_BROADCAST_THROTTLE_MS = 200;

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

function resolveCursorAvatarUrl(userId) {
    if (userId == null) return null;
    var key = String(userId);
    if (cursorAvatarCache.has(key)) return cursorAvatarCache.get(key);
    var users = db.getUsers();
    var u = users.find(function(x) { return String(x.id) === String(userId); });
    var url = u ? avatars.getAvatarApiPath(u.id, u.avatarUpdatedAt) : null;
    cursorAvatarCache.set(key, url);
    if (cursorAvatarCache.size > 500) cursorAvatarCache.clear();
    return url;
}

function broadcastOrgSettings(orgId, settings) {
    if (!orgId || !settings || typeof settings !== 'object') return;
    const payload = JSON.stringify({ type: 'org_settings', settings: settings });
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (!syncOrgIdsEqual(client.orgId, orgId)) return;
        try { client.send(payload); } catch (e) {}
    });
}

function broadcastCursors() {
    // Формируем курсоры отдельно по организациям и отправляем только соответствующим клиентам.
    const byOrg = {};
    const payloadByOrg = {};
    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;
        if (!client.clientId || !client.cursor || !client.cursor.position) return;
        const orgId = client.orgId != null ? client.orgId : null;
        const key = orgId == null ? '__null' : String(orgId);
        if (!byOrg[key]) byOrg[key] = [];
        byOrg[key].push({
            id: client.clientId,
            displayName: client.cursor.displayName,
            userId: client.cursor.userId,
            avatarUrl: resolveCursorAvatarUrl(client.cursor.userId),
            position: client.cursor.position
        });
    });

    Object.keys(byOrg).forEach(function (key) {
        payloadByOrg[key] = JSON.stringify({ type: 'cursors', cursors: byOrg[key] });
    });
    var emptyPayload = JSON.stringify({ type: 'cursors', cursors: [] });

    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;
        const orgId = client.orgId != null ? client.orgId : null;
        const key = orgId == null ? '__null' : String(orgId);
        const payload = payloadByOrg[key] || emptyPayload;
        try { client.send(payload); } catch (e) {}
    });
}

function fingerprintMapData(data) {
    if (!Array.isArray(data)) return '0';
    var n = data.length;
    var revSum = 0;
    var uidHash = 0;
    var geoSum = 0;
    for (var i = 0; i < n; i++) {
        var it = data[i];
        if (!it) continue;
        revSum = (revSum + (Number(it.revision) || 0)) | 0;
        if (it.uniqueId != null) {
            var s = String(it.uniqueId);
            for (var j = 0; j < s.length; j++) {
                uidHash = ((uidHash << 5) - uidHash + s.charCodeAt(j)) | 0;
            }
        }
        var coords = it.coords || it.coordinates || it.geometry;
        if (Array.isArray(coords) && typeof coords[0] === 'number') {
            geoSum = (geoSum + Math.round(coords[0] * 1e4) + Math.round((coords[1] || 0) * 1e4)) | 0;
        } else if (coords && Array.isArray(coords.coordinates)) {
            var c0 = coords.coordinates[0];
            if (Array.isArray(c0) && typeof c0[0] === 'number') {
                geoSum = (geoSum + Math.round(c0[0] * 1e4) + Math.round((c0[1] || 0) * 1e4)) | 0;
            }
        }
    }
    return n + ':' + revSum + ':' + uidHash + ':' + geoSum;
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

server.on('error', function(err) {
    if (err && err.code === 'EADDRINUSE') {
        console.error('[ОШИБКА] Порт ' + PORT + ' уже занят. Остановите старый процесс:');
        console.error('  systemctl stop <имя-сервиса>  или  fuser -k ' + PORT + '/tcp');
        console.error('Либо укажите другой порт в server-config.json или переменной PORT.');
    } else {
        console.error('[ОШИБКА] Не удалось запустить HTTP-сервер:', err && err.message ? err.message : err);
    }
    process.exit(1);
});

db.initStorage().then(function () {
    db.getDb();
    return ensurePortableBootstrap();
}).then(function() {
    server.listen(PORT, HOST, () => {
        console.log('Приложение и API (Portable):');
        console.log('  Локально:    http://localhost:' + PORT);
        const ips = getLocalIPs();
        if (ips.length) {
            ips.forEach(ip => console.log('  В сети:      http://' + ip + ':' + PORT));
            console.log('  На других устройствах откройте адрес «В сети» в браузере.');
        }
        console.log('Синхронизация: ws://...:' + PORT + '/sync (в одном процессе с API)');
        if (db.getStorageMode && db.getStorageMode() === 'mysql') {
            console.log('Данные: MySQL (storage=mysql)');
        } else {
            console.log('Данные: ' + path.join(DATA_DIR, 'store.json'));
        }
        if (db.createDailyBackup) console.log('Резервные копии: ежедневно в data/backups/, хранятся 30 дней.');
        logServerConfigWarnings();
        try {
            if (nedImport && typeof nedImport.prepareInBackground === 'function') {
                nedImport.prepareInBackground();
            }
        } catch (eNed) {
            console.warn('[ned-import] Пропуск подготовки (в Portable tools/ не включены):', eNed && eNed.message ? eNed.message : eNed);
        }
    });
}).catch(function(err) {
    console.error('[ОШИБКА] Не удалось инициализировать данные:', err && err.message ? err.message : err);
    process.exit(1);
});

function flushAndExit(code) {
    var done = function () {
        try { cpuPool.destroy(); } catch (e) {}
        process.exit(code);
    };
    var tasks = [];
    if (db.flushMysqlPersist) tasks.push(db.flushMysqlPersist());
    if (db.flushJsonPersist) tasks.push(db.flushJsonPersist());
    if (!tasks.length) {
        done();
        return;
    }
    Promise.all(tasks.map(function (p) {
        return Promise.resolve(p).catch(function () {});
    })).then(done).catch(done);
    setTimeout(done, 8000);
}
process.on('SIGINT', function () { flushAndExit(0); });
process.on('SIGTERM', function () { flushAndExit(0); });
