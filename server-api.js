const express = require('express');
const http = require('http');
const path = require('path');
const os = require('os');
const cors = require('cors');
const WebSocket = require('ws');
const db = require('./database');
const avatars = require('./avatars');
const chatMedia = require('./chat-media');
const security = require('./lib/security');

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

/** Запасной лимит объектов, если в хранилище и конфиге не задано иное. */
var FALLBACK_FREE_MAP_OBJECT_LIMIT = parseInt(
    process.env.FREE_MAP_OBJECT_LIMIT || serverConfig.freeMapObjectLimit || '2000',
    10
);
if (isNaN(FALLBACK_FREE_MAP_OBJECT_LIMIT) || FALLBACK_FREE_MAP_OBJECT_LIMIT < 1) {
    FALLBACK_FREE_MAP_OBJECT_LIMIT = 2000;
}

function getDefaultFreeMapObjectLimit() {
    try {
        var cfg = db.getPlatformLimitsConfig();
        if (cfg.fromStore && cfg.fromStore.limit) return cfg.defaultFreeMapObjectLimit;
        return FALLBACK_FREE_MAP_OBJECT_LIMIT;
    } catch (e) {
        return FALLBACK_FREE_MAP_OBJECT_LIMIT;
    }
}

var FALLBACK_MAX_CONCURRENT_USERS = parseInt(
    process.env.MAX_CONCURRENT_USERS || serverConfig.maxConcurrentUsers || '4',
    10
);
if (isNaN(FALLBACK_MAX_CONCURRENT_USERS) || FALLBACK_MAX_CONCURRENT_USERS < 1) {
    FALLBACK_MAX_CONCURRENT_USERS = 4;
}

function getDefaultMaxConcurrentUsers() {
    try {
        var cfg = db.getPlatformLimitsConfig();
        if (!cfg.fromStore || !cfg.fromStore.concurrent) return FALLBACK_MAX_CONCURRENT_USERS;
        var c = cfg.defaultMaxConcurrentUsers;
        return c === -1 ? -1 : (c >= 1 ? c : FALLBACK_MAX_CONCURRENT_USERS);
    } catch (e) {
        return FALLBACK_MAX_CONCURRENT_USERS;
    }
}

function normalizeMaxConcurrentUsers(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    var n = typeof raw === 'number' ? raw : parseInt(raw, 10);
    if (isNaN(n)) return null;
    if (n < 0) return -1;
    if (n === 0) return null;
    return Math.min(999, n);
}

function getMaxConcurrentForOrg(org) {
    if (!org) return getDefaultMaxConcurrentUsers();
    var raw = org.maxConcurrentUsers;
    if (raw === -1 || raw === 999) return -1;
    if (raw != null && raw !== '') {
        var n = typeof raw === 'number' ? raw : parseInt(raw, 10);
        if (!isNaN(n) && n > 0) return n;
    }
    return getDefaultMaxConcurrentUsers();
}

function getConcurrentUsersPayload(orgId) {
    var org = orgId ? db.getOrganization(orgId) : null;
    var limitRaw = getMaxConcurrentForOrg(org);
    var unlimited = limitRaw === -1;
    var limit = unlimited ? null : limitRaw;
    var active = orgId ? db.countActiveSessionsForOrganization(orgId) : 0;
    return {
        active: active,
        limit: limit,
        unlimited: unlimited,
        remaining: limit != null ? Math.max(0, limit - active) : null,
        defaultLimit: getDefaultMaxConcurrentUsers() === -1 ? FALLBACK_MAX_CONCURRENT_USERS : getDefaultMaxConcurrentUsers()
    };
}

function orgHasUnlimitedMapObjects(org) {
    return !!(org && org.mapObjectLimitUnlocked);
}

function getMapObjectLimitForOrg(org) {
    if (!org || orgHasUnlimitedMapObjects(org)) return null;
    if (org.customMapObjectLimit != null && org.customMapObjectLimit !== '') {
        var custom = typeof org.customMapObjectLimit === 'number' ? org.customMapObjectLimit : parseInt(org.customMapObjectLimit, 10);
        if (!isNaN(custom) && custom > 0) return custom;
    }
    return getDefaultFreeMapObjectLimit();
}

function getMapObjectLimitPayload(orgId) {
    var org = orgId ? db.getOrganization(orgId) : null;
    var count = orgId ? db.countMapObjectsForOrganization(orgId) : 0;
    var limit = getMapObjectLimitForOrg(org);
    var unlocked = orgHasUnlimitedMapObjects(org);
    var remaining = limit != null ? Math.max(0, limit - count) : null;
    return {
        count: count,
        limit: limit,
        unlocked: unlocked,
        remaining: remaining,
        defaultFreeLimit: getDefaultFreeMapObjectLimit()
    };
}

function validateMapDataObjectLimit(orgId, data) {
    var org = db.getOrganization(orgId);
    var limit = getMapObjectLimitForOrg(org);
    var count = db.countActualMapObjectsInArray(data);
    if (limit == null) {
        return { ok: true, count: count, limit: null, unlocked: true };
    }
    if (count > limit) {
        return {
            ok: false,
            count: count,
            limit: limit,
            unlocked: false,
            error: 'Достигнут лимит объектов на карте (' + limit + '). Сейчас: ' + count + '. Чтобы снять ограничение, свяжитесь с владельцем программы (контакты на главной странице).'
        };
    }
    return { ok: true, count: count, limit: limit, unlocked: false };
}

function planIdsMatch(planIdFromOrg, planEntryId) {
    return String(planIdFromOrg || '').trim().toLowerCase() === String(planEntryId || '').trim().toLowerCase();
}

function getUnlockProductFromPricing() {
    const plans = db.getPricingPlans();
    return plans.find(function(p) { return String(p.kind || '').toLowerCase() === 'unlock'; }) ||
        plans.find(function(p) { return planIdsMatch(p.id, 'unlock'); }) ||
        null;
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

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

function getSessionByToken(token) {
    if (!token) return null;
    var sessions = db.getSessions();
    var ses = sessions.find(function(s) { return s.token === token && db.sessionIsActive(s); });
    if (!ses) return null;
    var users = db.getUsers();
    var user = users.find(function(u) { return String(u.id) === String(ses.user_id); });
    return user ? { userId: user.id, organizationId: user.organizationId != null ? user.organizationId : (ses.organization_id || null) } : null;
}

function getSessionUserFromToken(token) {
    if (!token) return null;
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
            concurrentUsers: getConcurrentUsersPayload(organizationId)
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
    if (viewer.role !== 'admin') return false;
    const users = db.getUsers();
    const target = users.find(function(u) { return String(u.id) === String(targetUserId); });
    if (!target) return false;
    if (isGlobalAdmin(viewer)) return true;
    return !!(target.organizationId && viewer.organizationId && target.organizationId === viewer.organizationId);
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
            concurrentUsers: getConcurrentUsersPayload(organizationId)
        } : null
    };
}

function completeUserLogin(req, res, user, organizationId, organization) {
    var isMainAdminAccount = isGlobalAdmin({ role: user.role, organizationId: user.organizationId });

    if (isMainAdminAccount) {
        db.deleteSessionsForUser(user.id);
    } else {
        if (db.countActiveSessionsForUser(user.id) > 0) {
            return res.json({
                success: false,
                error: 'Сессия занята: эта учётная запись уже используется. Завершите работу в другом окне или нажмите «Выйти» там.'
            });
        }
        db.deleteExpiredSessionsForUser(user.id);
    }

    if (organization && organization.status !== 'active') {
        return res.json({ success: false, error: 'Организация приостановлена. Обратитесь к администратору сервиса.' });
    }
    if (organization && !isMainAdminAccount) {
        var maxConcurrent = getMaxConcurrentForOrg(organization);
        if (maxConcurrent >= 0) {
            var activeOrgSessions = db.countActiveSessionsForOrganization(organizationId);
            if (activeOrgSessions >= maxConcurrent) {
                return res.json({
                    success: false,
                    error: 'Достигнут лимит одновременных пользователей (' + maxConcurrent + '). Попробуйте позже или свяжитесь с владельцем программы.'
                });
            }
        }
    }

    const token = generateToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    var stmt = db.getDb().prepare('INSERT INTO sessions (token, user_id, expires_at, organization_id) VALUES (?, ?, ?, ?)');
    stmt.run(token, user.id, expires, organizationId);

    if (!isMainAdminAccount && db.countActiveSessionsForUser(user.id) > 1) {
        db.getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return res.json({
            success: false,
            error: 'Сессия занята: эта учётная запись уже используется. Завершите работу в другом окне или нажмите «Выйти» там.'
        });
    }

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

    res.json({
        success: true,
        token: token,
        user: buildLoginUserPayload(user, organizationId, organization)
    });
}

function validateCredentials(username, password) {
    if (!username || !password) return { ok: false, error: 'Укажите имя и пароль', status: 400 };
    const users = db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) return { ok: false, error: 'Пользователь не найден' };
    if (user.password !== hashPassword(password)) return { ok: false, error: 'Неверный пароль' };
    if (user.status === 'pending') return { ok: false, error: 'Заявка ожидает одобрения' };
    if (user.status === 'rejected') return { ok: false, error: 'Заявка отклонена' };
    var organizationId = user.organizationId || null;
    if (user.role !== 'admin' && !organizationId) {
        return { ok: false, error: 'Учётная запись не привязана к организации. Обратитесь к администратору.' };
    }
    var organization = organizationId ? db.getOrganization(organizationId) : null;
    return { ok: true, user: user, organizationId: organizationId, organization: organization };
}

app.get('/api/map', (req, res) => {
    try {
        var user = getSessionUser(req);
        if (isGlobalAdmin(user)) {
            return res.status(403).json({ error: 'Главному администратору недоступен интерфейс карты. Используйте панель администратора.' });
        }
        var orgId = (user && user.organizationId) ? user.organizationId : null;
        if (!orgId && user) return res.status(403).json({ error: 'Выберите организацию или привяжите учётную запись к организации' });
        var data = orgId ? db.getMapData(orgId) : [];
        res.json({ data: data });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
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
        var validation = validateMapDataObjectLimit(orgId, data);
        if (!validation.ok) {
            return res.status(403).json({
                error: validation.error,
                mapLimits: { count: validation.count, limit: validation.limit, unlocked: validation.unlocked }
            });
        }
        db.setMapData(orgId, data);
        res.json({ ok: true, mapLimits: getMapObjectLimitPayload(orgId) });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/auth/login', function(req, res) {
    var ip = getClientIp(req);
    var rate = security.checkRateLimit('auth:' + ip, getAuthRateLimitOptions());
    if (!rate.ok) {
        return res.status(429).json({
            success: false,
            error: 'Слишком много попыток входа. Повторите через ' + rate.retryAfterSec + ' с.'
        });
    }
    var body = req.body || {};
    security.verifyTurnstile(body.captchaToken, ip, serverConfig).then(function(captcha) {
        if (!captcha.ok) {
            return res.status(400).json({ success: false, error: captcha.error || 'Ошибка капчи' });
        }
        var cred = validateCredentials(body.username, body.password);
        if (!cred.ok) {
            if (cred.status === 400) return res.status(400).json({ success: false, error: cred.error });
            return res.json({ success: false, error: cred.error });
        }
        var user = cred.user;
        var organizationId = cred.organizationId;
        var organization = cred.organization;
        var isMainAdminAccount = isGlobalAdmin({ role: user.role, organizationId: user.organizationId });

        if (!isMainAdminAccount && security.orgRequiresTotp(organization)) {
            var pendingId = security.createPendingLogin({ userId: user.id, organizationId: organizationId });
            return res.json({
                success: false,
                requiresTotp: true,
                pendingLoginId: pendingId,
                organizationName: organization ? organization.name : ''
            });
        }
        completeUserLogin(req, res, user, organizationId, organization);
    });
});

app.post('/api/auth/verify-totp', function(req, res) {
    var ip = getClientIp(req);
    var rate = security.checkRateLimit('totp:' + ip, getAuthRateLimitOptions());
    if (!rate.ok) {
        return res.status(429).json({
            success: false,
            error: 'Слишком много попыток. Повторите через ' + rate.retryAfterSec + ' с.'
        });
    }
    var body = req.body || {};
    var pendingId = body.pendingLoginId;
    var totpCode = body.totpCode || body.code;
    if (!pendingId || !totpCode) {
        return res.status(400).json({ success: false, error: 'Укажите код двухфакторной аутентификации' });
    }
    var pending = security.consumePendingLogin(pendingId);
    if (!pending) {
        return res.json({ success: false, error: 'Сессия входа истекла. Введите логин и пароль снова.' });
    }
    var users = db.getUsers();
    var user = users.find(function(u) { return String(u.id) === String(pending.userId); });
    if (!user) return res.json({ success: false, error: 'Пользователь не найден' });
    var organizationId = user.organizationId || pending.organizationId || null;
    var organization = organizationId ? db.getOrganization(organizationId) : null;
    if (!security.orgRequiresTotp(organization)) {
        return res.json({ success: false, error: 'Двухфакторная аутентификация не включена для организации' });
    }
    if (!security.verifyTotpCode(organization.twoFactorSecret, totpCode)) {
        return res.json({ success: false, error: 'Неверный код. Проверьте приложение-аутентификатор и время на устройстве.' });
    }
    completeUserLogin(req, res, user, organizationId, organization);
});

app.get('/api/admin/visits', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        var logs = db.getVisitLogs();
        var now = Date.now();
        var dayMs = 24 * 60 * 60 * 1000;
        var weekMs = 7 * dayMs;
        var uniqueByDay = Object.create(null);
        var topSourcesMap = Object.create(null);
        var recent = [];
        var total = logs.length;
        var last24h = 0;
        var last7d = 0;
        for (var i = 0; i < logs.length; i++) {
            var item = logs[i] || {};
            var atMs = new Date(item.at).getTime();
            var source = String(item.source || item.ip || 'unknown');
            var ua = String(item.userAgent || '');
            if (!isNaN(atMs)) {
                if (now - atMs <= dayMs) last24h++;
                if (now - atMs <= weekMs) last7d++;
            }
            topSourcesMap[source] = (topSourcesMap[source] || 0) + 1;
            var dayKey = !isNaN(atMs) ? new Date(atMs).toISOString().slice(0, 10) : 'unknown';
            if (!uniqueByDay[dayKey]) uniqueByDay[dayKey] = Object.create(null);
            uniqueByDay[dayKey][source] = true;
        }
        Object.keys(uniqueByDay).forEach(function(day) {
            uniqueByDay[day] = Object.keys(uniqueByDay[day]).length;
        });
        var topSources = Object.keys(topSourcesMap)
            .map(function(k) { return { source: k, count: topSourcesMap[k] || 0 }; })
            .sort(function(a, b) { return b.count - a.count; })
            .slice(0, 5);
        for (var j = logs.length - 1; j >= 0 && recent.length < 8; j--) {
            var r = logs[j] || {};
            recent.push({
                at: r.at || '',
                username: r.username || '',
                organizationId: r.organizationId || '',
                source: r.source || r.ip || 'unknown',
                userAgent: String(r.userAgent || '').slice(0, 140)
            });
        }
        res.json({
            totalVisits: total,
            visitsLast24h: last24h,
            visitsLast7d: last7d,
            topSources: topSources,
            uniqueSourcesByDay: uniqueByDay,
            recentVisits: recent
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
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
    res.json({
        organization: {
            id: org.id,
            name: org.name,
            status: org.status,
            mapObjectLimitUnlocked: orgHasUnlimitedMapObjects(org),
            mapLimits: getMapObjectLimitPayload(user.organizationId),
            concurrentUsers: getConcurrentUsersPayload(user.organizationId),
            twoFactorEnabled: !!org.twoFactorEnabled
        }
    });
});

app.get('/api/map-limits', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!user.organizationId) return res.json({ mapLimits: null });
    res.json({ mapLimits: getMapObjectLimitPayload(user.organizationId) });
});

app.get('/api/admin/platform-limits', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        res.json(db.getPlatformLimitsConfig());
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.put('/api/admin/platform-limits', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    const body = req.body || {};
    try {
        var cfg = db.setPlatformLimitsConfig({
            defaultFreeMapObjectLimit: body.defaultFreeMapObjectLimit,
            defaultMaxConcurrentUsers: body.defaultMaxConcurrentUsers
        });
        res.json({ ok: true, limits: cfg });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/admin/showcase', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        res.json(db.getShowcaseConfig());
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.put('/api/admin/showcase', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    const body = req.body || {};
    try {
        var patch = {};
        if (body.defaultFreeMapObjectLimit !== undefined || body.defaultMaxConcurrentUsers !== undefined) {
            patch.defaultFreeMapObjectLimit = body.defaultFreeMapObjectLimit;
            patch.defaultMaxConcurrentUsers = body.defaultMaxConcurrentUsers;
        }
        if (body.freeCard && typeof body.freeCard === 'object') patch.freeCard = body.freeCard;
        if (Array.isArray(body.plans)) {
            var cleaned = body.plans.map(function(p, idx) {
                var kind = String(p.kind || '').toLowerCase();
                if (kind !== 'unlock' && kind !== 'contact') kind = 'contact';
                return {
                    id: String(p.id || ('plan_' + idx)),
                    title: String(p.title || 'Безлимит объектов'),
                    short: String(p.short || ''),
                    price: String(p.price || ''),
                    period: String(p.period || ''),
                    maxUsersText: String(p.maxUsersText || ''),
                    order: typeof p.order === 'number' ? p.order : idx,
                    highlighted: !!p.highlighted,
                    ctaText: String(p.ctaText || ''),
                    kind: kind
                };
            });
            patch.plans = cleaned;
        }
        var cfg = db.setShowcaseConfig(patch);
        res.json({ ok: true, showcase: cfg });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/organizations', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        var list = db.getOrganizations().map(function(o) {
            var activeSessions = db.countActiveSessionsForOrganization(o.id);
            var limits = getMapObjectLimitPayload(o.id);
            return {
                id: o.id,
                name: o.name,
                mapObjectLimitUnlocked: orgHasUnlimitedMapObjects(o),
                customMapObjectLimit: o.customMapObjectLimit != null ? o.customMapObjectLimit : null,
                mapObjectLimit: limits.limit,
                mapObjectCount: limits.count,
                status: o.status,
                contactEmail: o.contactEmail != null ? String(o.contactEmail) : '',
                createdAt: o.createdAt,
                activeSessions: activeSessions,
                maxConcurrentUsers: o.maxConcurrentUsers != null ? o.maxConcurrentUsers : null,
                effectiveMaxConcurrentUsers: getMaxConcurrentForOrg(o)
            };
        });
        res.json({
            organizations: list,
            defaultFreeMapObjectLimit: getDefaultFreeMapObjectLimit(),
            defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers()
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/pricing', (req, res) => {
    try {
        const raw = db.getPricingPlans().filter(function(p) {
            return String(p.kind || '').toLowerCase() !== 'trial';
        });
        const plans = raw.map(function(p, idx) {
            var promoPct = typeof p.promoPercent === 'number' ? p.promoPercent : parseFloat(p.promoPercent);
            if (isNaN(promoPct) || promoPct < 0) promoPct = 0;
            if (promoPct > 100) promoPct = 100;
            var kind = String(p.kind || '').toLowerCase();
            if (kind !== 'unlock' && kind !== 'contact') kind = 'unlock';
            return {
                id: String(p.id || ('plan_' + idx)),
                title: p.title,
                short: p.short,
                price: p.price,
                period: p.period,
                maxUsersText: p.maxUsersText,
                order: typeof p.order === 'number' ? p.order : idx,
                highlighted: !!p.highlighted,
                ctaText: p.ctaText,
                kind: kind,
                promoPercent: promoPct,
                promoStartsAt: p.promoStartsAt ? String(p.promoStartsAt).slice(0, 10) : '',
                promoEndsAt: p.promoEndsAt ? String(p.promoEndsAt).slice(0, 10) : '',
                priceBeforePromo: p.priceBeforePromo != null ? String(p.priceBeforePromo) : ''
            };
        });
        res.json({
            plans: plans,
            freeMapObjectLimit: getDefaultFreeMapObjectLimit(),
            defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers(),
            freeCard: db.getFreeCardConfig()
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/maintenance-notice', (req, res) => {
    try {
        res.json(db.getPublicMaintenanceNotice());
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/admin/maintenance-notice', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        const notice = db.getMaintenanceNotice();
        res.json({
            notice: notice,
            active: db.isMaintenanceNoticeActive(notice)
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.put('/api/admin/maintenance-notice', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    const body = req.body || {};
    try {
        const patch = {};
        if (body.enabled !== undefined) patch.enabled = !!body.enabled;
        if (body.title !== undefined) patch.title = String(body.title || '').trim();
        if (body.message !== undefined) patch.message = String(body.message || '').trim();
        if (body.startsAt !== undefined) patch.startsAt = body.startsAt ? String(body.startsAt) : null;
        if (body.endsAt !== undefined) patch.endsAt = body.endsAt ? String(body.endsAt) : null;
        const notice = db.setMaintenanceNotice(patch);
        res.json({
            success: true,
            notice: notice,
            active: db.isMaintenanceNoticeActive(notice)
        });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.put('/api/pricing', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Только администратор' });
    const body = req.body || {};
    if (!Array.isArray(body.plans)) return res.status(400).json({ error: 'Ожидается массив plans' });
    const cleaned = body.plans.map(function(p, idx) {
        var promoPct = typeof p.promoPercent === 'number' ? p.promoPercent : parseFloat(p.promoPercent);
        if (isNaN(promoPct) || promoPct < 0) promoPct = 0;
        if (promoPct > 100) promoPct = 100;
        var kind = String(p.kind || '').toLowerCase();
        if (kind !== 'unlock' && kind !== 'contact') kind = 'unlock';
        return {
            id: String(p.id || ('plan_' + idx)),
            title: String(p.title || 'Безлимит объектов'),
            short: String(p.short || ''),
            price: String(p.price || ''),
            period: String(p.period || ''),
            maxUsersText: String(p.maxUsersText || ''),
            order: typeof p.order === 'number' ? p.order : idx,
            highlighted: !!p.highlighted,
            ctaText: String(p.ctaText || ''),
            kind: kind,
            promoPercent: promoPct,
            promoStartsAt: p.promoStartsAt ? String(p.promoStartsAt).slice(0, 10) : '',
            promoEndsAt: p.promoEndsAt ? String(p.promoEndsAt).slice(0, 10) : '',
            priceBeforePromo: p.priceBeforePromo != null ? String(p.priceBeforePromo) : ''
        };
    });
    try {
        db.setPricingPlans(cleaned);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/organizations', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Только администратор' });
    var body = req.body || {};
    var name = (body.name && String(body.name).trim()) || 'Организация';
    var id = db.addOrganization({
        name: name,
        mapObjectLimitUnlocked: !!body.mapObjectLimitUnlocked,
        customMapObjectLimit: body.customMapObjectLimit,
        maxConcurrentUsers: normalizeMaxConcurrentUsers(body.maxConcurrentUsers),
        status: body.status || 'active',
        contactEmail: body.contactEmail != null ? String(body.contactEmail).trim() : ''
    });
    res.json({ ok: true, organizationId: id });
});

app.patch('/api/organizations/:id', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Только администратор' });
    var orgId = req.params.id;
    var body = req.body || {};
    var updates = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.mapObjectLimitUnlocked !== undefined) updates.mapObjectLimitUnlocked = !!body.mapObjectLimitUnlocked;
    if (body.customMapObjectLimit !== undefined) updates.customMapObjectLimit = body.customMapObjectLimit;
    if (body.maxConcurrentUsers !== undefined) updates.maxConcurrentUsers = normalizeMaxConcurrentUsers(body.maxConcurrentUsers);
    if (body.status !== undefined) updates.status = body.status;
    if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail;
    var ok = db.updateOrganization(orgId, updates);
    if (!ok) return res.status(404).json({ error: 'Организация не найдена' });

    // При приостановке организации принудительно завершаем все её активные сессии
    if (updates.status === 'suspended') {
        try { db.deleteSessionsForOrganization(orgId); } catch (e) {}
        // Отключаем всех WebSocket‑клиентов этой организации от синхронизации
        try {
            wss.clients.forEach(function(client) {
                if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                    try { client.close(4001, 'Организация приостановлена'); } catch (e) {}
                }
            });
        } catch (e) {}
    }

    res.json({ ok: true });
});

app.post('/api/organizations/:orgId/reset-password', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Только главный администратор' });
    const orgId = req.params.orgId;
    const { password, userId } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Пароль не менее 6 символов' });
    if (!db.getOrganization(orgId)) return res.status(404).json({ error: 'Организация не найдена' });
    const users = db.getUsers();
    const orgUsers = users.filter(u => u.organizationId === orgId);
    let target;
    if (userId) {
        target = orgUsers.find(u => u.id === userId);
        if (!target) return res.status(404).json({ error: 'Пользователь не найден в этой организации' });
    } else {
        const admins = orgUsers.filter(u => u.role === 'admin');
        if (admins.length === 0) return res.status(404).json({ error: 'В организации нет администратора' });
        if (admins.length > 1) {
            return res.status(400).json({
                error: 'Несколько администраторов — укажите userId',
                userIds: admins.map(a => a.id)
            });
        }
        target = admins[0];
    }
    if (target.username === 'admin') return res.status(400).json({ error: 'Нельзя сбросить пароль главного администратора панели здесь' });
    const i = users.findIndex(u => u.id === target.id);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });
    users[i].password = hashPassword(String(password));
    db.setUsers(users);
    try { db.deleteSessionsForUser(target.id); } catch (e) {}
    res.json({ ok: true, username: users[i].username, userId: users[i].id });
});

app.delete('/api/organizations/:id', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Только администратор' });
    var orgId = req.params.id;
    var org = db.getOrganization(orgId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    try {
        db.deleteOrganization(orgId);
        try { chatMedia.removeOrgStorage(orgId); } catch (e) {}
        // Отключаем WebSocket‑клиентов удалённой организации
        try {
            wss.clients.forEach(function(client) {
                if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                    try { client.close(4002, 'Организация удалена'); } catch (e) {}
                }
            });
        } catch (e) {}
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

function isValidContactEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const t = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function parseMapStartPayload(mapStart) {
    if (!mapStart || !Array.isArray(mapStart.center) || mapStart.center.length < 2) return null;
    const lat = Number(mapStart.center[0]);
    const lon = Number(mapStart.center[1]);
    const zoomRaw = Number(mapStart.zoom);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const zoom = Number.isFinite(zoomRaw) && zoomRaw >= 1 && zoomRaw <= 21 ? zoomRaw : 15;
    return { center: [lat, lon], zoom: zoom };
}

app.post('/api/auth/register', function(req, res) {
    var ip = getClientIp(req);
    var rate = security.checkRateLimit('register:' + ip, getAuthRateLimitOptions());
    if (!rate.ok) {
        return res.status(429).json({
            success: false,
            error: 'Слишком много попыток регистрации. Повторите через ' + rate.retryAfterSec + ' с.'
        });
    }
    var body = req.body || {};
    security.verifyTurnstile(body.captchaToken, ip, serverConfig).then(function(captcha) {
        if (!captcha.ok) {
            return res.status(400).json({ success: false, error: captcha.error || 'Ошибка капчи' });
        }
        handleAuthRegister(req, res, body);
    });
});

function handleAuthRegister(req, res, body) {
    const { username, password, fullName, organizationName, contactEmail, mapStart } = body || {};
    if (!username || username.length < 3) return res.status(400).json({ success: false, error: 'Имя не менее 3 символов' });
    if (!organizationName || String(organizationName).trim().length < 3) return res.status(400).json({ success: false, error: 'Укажите название организации (не менее 3 символов)' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Пароль не менее 6 символов' });
    if (!contactEmail || !isValidContactEmail(String(contactEmail))) return res.status(400).json({ success: false, error: 'Укажите корректный e-mail для связи' });
    const users = db.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.json({ success: false, error: 'Пользователь уже существует' });
    var organizationId = db.addOrganization({
        name: String(organizationName).trim(),
        mapObjectLimitUnlocked: false,
        status: 'active',
        contactEmail: String(contactEmail).trim()
    });
    const newUser = {
        id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        username: username,
        password: hashPassword(password),
        fullName: fullName || username,
        full_name: fullName || username,
        // Администратор карты для своей организации (но не глобальный админ панели)
        role: 'admin',
        status: organizationId ? 'approved' : 'pending',
        organizationId: organizationId,
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    db.setUsers(users);
    const parsedMapStart = parseMapStartPayload(mapStart);
    if (parsedMapStart && db.setMapStartForUser) {
        db.setMapStartForUser(newUser.id, parsedMapStart);
    }
    res.json({ success: true, pending: !organizationId, organizationId: organizationId });
}

app.get('/api/organizations/me/security', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    res.json({
        twoFactorEnabled: !!org.twoFactorEnabled,
        captchaEnabled: security.isTurnstileConfigured(serverConfig)
    });
});

app.post('/api/organizations/me/security/2fa/setup', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org) return res.status(404).json({ error: 'Организация не найдена' });
    var label = (org.name || 'Организация') + ' (volsmap)';
    var generated = security.generateTotpSecret(label);
    res.json({
        secret: generated.base32,
        otpauthUrl: generated.otpauthUrl,
        qrCodeUrl: generated.otpauthUrl
            ? ('https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(generated.otpauthUrl))
            : ''
    });
});

app.post('/api/organizations/me/security/2fa/enable', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var body = req.body || {};
    var secret = body.secret ? String(body.secret).trim() : '';
    var code = body.totpCode || body.code;
    if (!secret) return res.status(400).json({ error: 'Секрет не указан. Начните настройку заново.' });
    if (!security.verifyTotpCode(secret, code)) {
        return res.status(400).json({ error: 'Неверный код. Проверьте приложение и повторите.' });
    }
    var ok = db.updateOrganization(user.organizationId, {
        twoFactorEnabled: true,
        twoFactorSecret: secret
    });
    if (!ok) return res.status(404).json({ error: 'Организация не найдена' });
    res.json({ ok: true, twoFactorEnabled: true });
});

app.post('/api/organizations/me/security/2fa/disable', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    if (!isOrgAdmin(user)) return res.status(403).json({ error: 'Только администратор организации' });
    var org = db.getOrganization(user.organizationId);
    if (!org || !org.twoFactorEnabled) {
        return res.json({ ok: true, twoFactorEnabled: false });
    }
    var code = (req.body || {}).totpCode || (req.body || {}).code;
    if (!security.verifyTotpCode(org.twoFactorSecret, code)) {
        return res.status(400).json({ error: 'Неверный код. Введите текущий код из приложения.' });
    }
    db.updateOrganization(user.organizationId, {
        twoFactorEnabled: false,
        twoFactorSecret: null
    });
    res.json({ ok: true, twoFactorEnabled: false });
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

app.put('/api/users/:userId', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const userId = req.params.userId;
    const { fullName, role, password, organizationId } = req.body || {};
    const users = db.getUsers();
    const i = users.findIndex(u => u.id === userId);
    if (i === -1) return res.status(404).json({ error: 'Пользователь не найден' });

    const targetIsMainAdmin = users[i].username === 'admin';
    if (targetIsMainAdmin) {
        // Только сам главный администратор может менять параметры своей учётки.
        if (!isGlobalAdmin(admin) || admin.userId !== userId) {
            return res.status(403).json({ error: 'Только главный администратор может менять параметры главного администратора' });
        }
        // Главный админ всегда должен оставаться глобальным (без привязки к организации).
        users[i].organizationId = null;
    }

    if (targetIsMainAdmin && role !== undefined && role !== 'admin') return res.status(400).json({ error: 'Нельзя снять роль администратора с главного администратора' });
    if (fullName !== undefined) { users[i].fullName = fullName; users[i].full_name = fullName; }
    if (role !== undefined) users[i].role = role;
    if (password && String(password).length >= 6) users[i].password = hashPassword(password);
    if (organizationId !== undefined) users[i].organizationId = targetIsMainAdmin ? null : (organizationId || null);
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
    if (userId === admin.userId) return res.status(400).json({ error: 'Нельзя удалить свой аккаунт' });
    if (users[i].username === 'admin') return res.status(400).json({ error: 'Нельзя удалить главного администратора' });
    const deleted = users[i];
    users.splice(i, 1);
    db.setUsers(users);
    res.json({ ok: true, user: { id: deleted.id, username: deleted.username } });
});

app.post('/api/users', (req, res) => {
    const admin = getSessionUser(req);
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Только администратор' });
    const { username, password, fullName, role, organizationId } = req.body || {};
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
        organizationId: organizationId || null,
        createdAt: new Date().toISOString()
    };
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

app.get('/api/settings', (req, res) => {
    try {
        var user = getSessionUser(req);
        var orgId = (user && user.organizationId) ? user.organizationId : (user && user.role === 'admin' ? (req.query.orgId || (db.getOrganizations().length ? db.getOrganizations()[0].id : null)) : null);
        var settings = db.getSettings(orgId || undefined);
        if (user && db.getMapStartForUserOrOrg) {
            const mapStart = db.getMapStartForUserOrOrg(user.userId, orgId);
            if (mapStart) settings.mapStart = mapStart;
        }
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/settings', (req, res) => {
    const user = getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Требуется авторизация' });
    const body = req.body || {};
    var orgId = user.organizationId || (user.role === 'admin' && body.organizationId ? body.organizationId : null);
    try {
        if (body.mapStart !== undefined) {
            const parsedMapStart = parseMapStartPayload(body.mapStart);
            if (parsedMapStart) {
                if (db.setMapStartForUser) db.setMapStartForUser(user.userId, parsedMapStart);
            } else if (db.setMapStartForUser) {
                db.setMapStartForUser(user.userId, null);
            }
        }
        var toSave = {};
        if (user.role === 'admin') {
            if (body.groupNames !== undefined && typeof body.groupNames === 'object') {
                syncGroupNames = body.groupNames;
            }
            toSave = body;
        } else {
            if (body.theme !== undefined) toSave.theme = body.theme;
        }
        if (Object.keys(toSave).length > 0) db.setSettings(toSave, orgId || undefined);
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
    try {
        db.restoreFromBackup(orgId, filename.trim());
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
        res.status(400).json({ error: msg });
    }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'sqlite' }));

const DEFAULT_PUBLIC_SITE_URL = 'https://volsmap.ru';

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
    const key = serverConfig.yandexMapsApiKey || process.env.YANDEX_MAPS_API_KEY || '';
    const publicSiteUrl = serverConfig.publicSiteUrl || process.env.PUBLIC_SITE_URL || getSiteBaseUrl(req);
    const turnstileSiteKey = security.getTurnstileSiteKey(serverConfig);
    res.json({
        yandexMapsApiKey: key,
        publicSiteUrl: publicSiteUrl ? String(publicSiteUrl).trim().replace(/\/$/, '') : '',
        freeMapObjectLimit: getDefaultFreeMapObjectLimit(),
        defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers(),
        turnstileSiteKey: turnstileSiteKey,
        captchaEnabled: security.isTurnstileConfigured(serverConfig)
    });
});

app.get('/robots.txt', (req, res) => {
    const base = getSiteBaseUrl(req);
    const sitemapLine = base ? ('Sitemap: ' + base + '/sitemap.xml\n') : '';
    res.type('text/plain').send(
        'User-agent: *\n' +
        'Allow: /\n' +
        'Disallow: /index.html\n' +
        'Disallow: /site-admin.html\n' +
        'Disallow: /checkout.html\n' +
        '\n' +
        sitemapLine
    );
});

app.get('/sitemap.xml', (req, res) => {
    const base = getSiteBaseUrl(req);
    const loc = base ? (base + '/') : '/';
    const xml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url>\n' +
        '    <loc>' + loc + '</loc>\n' +
        '    <changefreq>weekly</changefreq>\n' +
        '    <priority>1.0</priority>\n' +
        '  </url>\n' +
        '</urlset>\n';
    res.type('application/xml').send(xml);
});

app.get('/api/public-stats', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    try {
        res.json(db.getPublicStats());
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

// Лицевая страница по умолчанию — условия (pricing.html)
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(__dirname, 'pricing.html'));
});

app.get('/pricing.html', (req, res) => {
    res.redirect(301, '/');
});

// Браузеры по умолчанию запрашивают /favicon.ico; в репозитории только favicon.svg
app.get('/favicon.ico', (req, res) => {
    res.type('image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.join(__dirname, 'favicon.svg'));
});

// Раздача JS с явным Content-Type (избегаем text/html от прокси/404)
app.use('/js', express.static(path.join(__dirname, 'js'), {
    setHeaders: function (res, filePath) {
        if (filePath && String(filePath).endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
    }
}));

app.use(express.static(path.join(__dirname)));

db.getDb();
db.initDefaultAdmin();

function getSyncStateForOrg(orgId) {
    if (!syncCurrentStateByOrg[orgId]) {
        syncCurrentStateByOrg[orgId] = { clientId: 'server', data: db.getMapData(orgId) || [] };
        try {
            var sett = db.getSettings(orgId);
            if (sett && sett.groupNames && (sett.groupNames.cross || sett.groupNames.node)) syncGroupNamesByOrg[orgId] = sett.groupNames;
        } catch (e) {}
    }
    return syncCurrentStateByOrg[orgId];
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
    if (!orgId) return;
    if (mapDbSaveTimersByOrg[orgId]) clearTimeout(mapDbSaveTimersByOrg[orgId]);
    mapDbSaveTimersByOrg[orgId] = setTimeout(function() {
        mapDbSaveTimersByOrg[orgId] = null;
        try {
            var state = syncCurrentStateByOrg[orgId];
            if (state && state.data) db.setMapData(orgId, state.data);
        } catch (e) {}
    }, MAP_DB_SAVE_DEBOUNCE_MS);
}

function flushMapDbSave(orgId) {
    if (!orgId) return;
    if (mapDbSaveTimersByOrg[orgId]) {
        clearTimeout(mapDbSaveTimersByOrg[orgId]);
        mapDbSaveTimersByOrg[orgId] = null;
    }
    try {
        var state = syncCurrentStateByOrg[orgId];
        if (state && state.data) db.setMapData(orgId, state.data);
    } catch (e) {}
}

var defaultOrgIdForSync = (function() {
    var orgs = db.getOrganizations();
    return orgs.length ? orgs[0].id : null;
})();
const wss = new WebSocket.Server({ server, path: '/sync' });
const syncClientNames = new Map();
const syncClientUserIds = new Map();
const syncClientOrgIds = new Map();
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
        if (client.readyState !== WebSocket.OPEN || client.orgId !== orgId) return;
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
    var objCount = state.filter(function(i) { return i.type !== 'cable'; }).length;
    var i, idx, fromIdx, toIdx, fromUid, toUid, c, cur, baseRev, merged;
    if (op.type === 'add_object' && op.data) {
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
            if (baseRev != null && getItemRevision(cur) !== Number(baseRev)) {
                return { state: state, conflict: { uniqueId: op.uniqueId, revision: getItemRevision(cur), data: cur } };
            }
            state = state.slice();
            merged = Object.assign({}, cur, op.data);
            merged.revision = getItemRevision(cur) + 1;
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
        return { state: state, conflict: null };
    }
    if (op.type === 'update_cable' && op.uniqueId != null && op.data) {
        idx = state.findIndex(function(i) { return i.type === 'cable' && i.uniqueId === op.uniqueId; });
        if (idx >= 0) {
            cur = state[idx];
            baseRev = op.baseRevision;
            if (baseRev != null && getItemRevision(cur) !== Number(baseRev)) {
                return { state: state, conflict: { uniqueId: op.uniqueId, revision: getItemRevision(cur), data: cur } };
            }
            state = state.slice();
            merged = Object.assign({}, cur, op.data);
            merged.revision = getItemRevision(cur) + 1;
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
            if (c.readyState === WebSocket.OPEN && c.clientId && c.orgId === targetOrg) {
                list.push({
                    id: c.clientId,
                    displayName: syncClientNames.get(c.clientId) || 'Участник',
                    userId: syncClientUserIds.get(c.clientId) || null
                });
            }
        });
        try { targetClient.send(JSON.stringify({ type: 'clients', clients: list })); } catch (e) {}
    });
}

wss.on('connection', (ws, req) => {
    const clientId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    ws.clientId = clientId;
    ws.orgId = null;
    ws.connectedAt = Date.now();
    syncClientNames.set(clientId, 'Участник');
    setImmediate(function() { broadcastSyncClients(); });
    ws.send(JSON.stringify({ type: 'yourId', clientId: clientId }));
    ws.send(JSON.stringify({ type: 'clients', clients: [] }));
    ws.on('message', (raw) => {
        const str = raw.toString();
        if (str.length > 15 * 1024 * 1024) return;
        setImmediate(function() {
        try {
            const msg = JSON.parse(str);
            if (msg.type === 'hello') {
                const name = (msg.displayName && String(msg.displayName).trim()) || 'Участник';
                syncClientNames.set(clientId, name.slice(0, 100));
                if (msg.userId !== undefined && msg.userId !== null) syncClientUserIds.set(clientId, msg.userId);
                var orgId = null;
                if (msg.token) {
                    var session = getSessionByToken(msg.token);
                    if (session) {
                        ws.userId = session.userId;
                        orgId = session.organizationId || defaultOrgIdForSync;
                        ws.orgId = orgId;
                        syncClientUserIds.set(clientId, session.userId);
                        syncClientOrgIds.set(clientId, orgId);
                    }
                }
                if (orgId) {
                    var state = getSyncStateForOrg(orgId);
                    var groupNames = syncGroupNamesByOrg[orgId] || syncGroupNames;
                    var statePayload = { type: 'state', clientId: state.clientId, data: state.data };
                    if (groupNames && (groupNames.cross || groupNames.node)) statePayload.groupNames = groupNames;
                    try { ws.send(JSON.stringify(statePayload)); } catch (e) {}
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
            var orgId = ws.orgId || defaultOrgIdForSync;
            if (msg.type === 'groupNames' && msg.groupNames && typeof msg.groupNames === 'object') {
                if (!isSyncClientAdmin(clientId)) return;
                if (orgId) syncGroupNamesByOrg[orgId] = msg.groupNames; else syncGroupNames = msg.groupNames;
                try { db.setSettings({ groupNames: msg.groupNames }, orgId || undefined); } catch (e) {}
                wss.clients.forEach(function(client) {
                    if (client.readyState === WebSocket.OPEN && client.orgId === orgId) {
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
            if (msg.type === 'op' && msg.op && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var state = getSyncStateForOrg(orgId);
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
                scheduleMapDbSave(orgId);
                try {
                    ws.send(JSON.stringify({ type: 'op', op: msg.op }));
                } catch (eOpSelf) {}
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                        try { client.send(JSON.stringify({ type: 'op', op: msg.op })); } catch (e) {}
                    }
                });
                return;
            }
            var justConnected = (Date.now() - (ws.connectedAt || 0)) < 4000;
            if (!justConnected && msg.data && isSyncClientAdmin(clientId) && orgId) {
                var state = getSyncStateForOrg(orgId);
                var merged = mergeMapState(state.data, msg.data);
                var validationFull = validateMapDataObjectLimit(orgId, merged);
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
                state.data = merged;
                state.clientId = msg.clientId || clientId;
                if (msg.groupNames && typeof msg.groupNames === 'object') {
                    syncGroupNamesByOrg[orgId] = msg.groupNames;
                    try { db.setSettings({ groupNames: msg.groupNames }, orgId); } catch (e) {}
                }
                scheduleMapDbSave(orgId);
                var statePayload = { type: 'state', clientId: state.clientId, data: state.data };
                var gn = syncGroupNamesByOrg[orgId] || syncGroupNames;
                if (gn && (gn.cross || gn.node)) statePayload.groupNames = gn;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                        try { client.send(JSON.stringify(statePayload)); } catch (e) {}
                    }
                });
            }
        } catch (e) {}
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
    // Формируем курсоры отдельно по организациям и отправляем только соответствующим клиентам.
    const byOrg = {};
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
            position: client.cursor.position
        });
    });

    wss.clients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) return;
        const orgId = client.orgId != null ? client.orgId : null;
        const key = orgId == null ? '__null' : String(orgId);
        const list = byOrg[key] || [];
        const payload = JSON.stringify({ type: 'cursors', cursors: list });
        try { client.send(payload); } catch (e) {}
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
    if (db.createDailyBackup) console.log('Резервные копии: ежедневно в data/backups/, хранятся 30 дней.');
    if (!require('fs').existsSync(path.join(__dirname, 'server-config.json'))) {
        console.log('Настройки: порт/хост можно задать в server-config.json (скопируйте из server-config.example.json).');
    }
});
