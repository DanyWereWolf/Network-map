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

var SUBSCRIPTION_PLANS = {
    basic: { maxConcurrentUsers: 3, name: 'Базовый' },
    pro: { maxConcurrentUsers: 10, name: 'Про' },
    enterprise: { maxConcurrentUsers: -1, name: 'Корпоративный' }
};
function getMaxConcurrentFromPricingPlan(planId) {
    if (!planId) return null;
    const plans = db.getPricingPlans();
    const p = plans.find(function(x) { return x.id === planId; });
    if (!p || p.maxConcurrentUsers === undefined || p.maxConcurrentUsers === null || p.maxConcurrentUsers === '') return null;
    const n = typeof p.maxConcurrentUsers === 'number' ? p.maxConcurrentUsers : parseInt(p.maxConcurrentUsers, 10);
    if (isNaN(n) || n === 0) return null;
    return n;
}
function getMaxConcurrentForOrg(org) {
    if (!org) return 1;
    if (org.maxConcurrentUsers != null && org.maxConcurrentUsers >= 0) return org.maxConcurrentUsers;
    const fromPricing = getMaxConcurrentFromPricingPlan(org.planId);
    if (fromPricing != null) return fromPricing === -1 ? 999 : fromPricing;
    var plan = SUBSCRIPTION_PLANS[org.planId || 'basic'];
    return plan ? (plan.maxConcurrentUsers === -1 ? 999 : plan.maxConcurrentUsers) : 3;
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

function getSessionUser(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const sessions = db.getDb().prepare('SELECT user_id, organization_id FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').all(token);
    if (sessions.length === 0) return null;
    const users = db.getUsers();
    const user = users.find(u => String(u.id) === String(sessions[0].user_id));
    if (!user) return null;
    const organizationId = user.organizationId != null ? user.organizationId : (sessions[0].organization_id || null);
    const organization = organizationId ? db.getOrganization(organizationId) : null;
    const maxConcurrent = organization ? getMaxConcurrentForOrg(organization) : null;
    return {
        userId: user.id,
        username: user.username,
        fullName: user.fullName || user.full_name,
        role: user.role,
        organizationId: organizationId,
        organization: organization ? { id: organization.id, name: organization.name, planId: organization.planId, maxConcurrentUsers: maxConcurrent } : null
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
        db.setMapData(orgId, data);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ success: false, error: 'Укажите имя и пароль' });
    const users = db.getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) return res.json({ success: false, error: 'Пользователь не найден' });
    if (user.password !== hashPassword(password)) return res.json({ success: false, error: 'Неверный пароль' });
    if (user.status === 'pending') return res.json({ success: false, error: 'Заявка ожидает одобрения' });
    if (user.status === 'rejected') return res.json({ success: false, error: 'Заявка отклонена' });
    var organizationId = user.organizationId || null;
    var organization = organizationId ? db.getOrganization(organizationId) : null;
    if (user.role !== 'admin' && !organizationId) return res.json({ success: false, error: 'Учётная запись не привязана к организации. Обратитесь к администратору.' });

    var isMainAdminAccount = isGlobalAdmin({ role: user.role, organizationId: user.organizationId });

    // Главный админ панели: новый вход с другого места завершает предыдущую сессию.
    // Остальные: одна активная сессия — иначе отказ («сессия занята»).
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

    if (organization) {
        if (organization.status !== 'active') return res.json({ success: false, error: 'Подписка организации приостановлена или заблокирована.' });
        if (organization.subscriptionEndsAt && new Date(organization.subscriptionEndsAt) < new Date()) return res.json({ success: false, error: 'Срок действия подписки истёк. Продлите подписку.' });
        var maxConcurrent = getMaxConcurrentForOrg(organization);
        if (maxConcurrent >= 0) {
            var activeCount = db.countActiveSessionsForOrganization(organizationId);
            if (activeCount >= maxConcurrent) {
                return res.json({
                    success: false,
                    error: 'Достигнут лимит одновременных пользователей (' + maxConcurrent + '). Попробуйте позже или увеличьте тариф.'
                });
            }
        }
    }
    const token = generateToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    var stmt = db.getDb().prepare('INSERT INTO sessions (token, user_id, expires_at, organization_id) VALUES (?, ?, ?, ?)');
    stmt.run(token, user.id, expires, organizationId);
    // Два параллельных входа (не главный админ): оставляем первого, второго откатываем
    if (!isMainAdminAccount && db.countActiveSessionsForUser(user.id) > 1) {
        db.getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
        return res.json({
            success: false,
            error: 'Сессия занята: эта учётная запись уже используется. Завершите работу в другом окне или нажмите «Выйти» там.'
        });
    }
    try {
        var ip = getClientIp(req);
        var userAgent = String(req.headers['user-agent'] || '');
        db.addVisitLog({
            at: new Date().toISOString(),
            username: user.username,
            userId: user.id,
            organizationId: organizationId || '',
            ip: ip,
            source: ip || 'unknown',
            userAgent: userAgent
        });
    } catch (e) {}
    res.json({
        success: true,
        token,
        user: {
            userId: user.id,
            username: user.username,
            fullName: user.fullName || user.full_name,
            role: user.role,
            organizationId: organizationId,
            organization: organization ? { id: organization.id, name: organization.name, planId: organization.planId, maxConcurrentUsers: getMaxConcurrentForOrg(organization) } : null
        }
    });
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
            planId: org.planId,
            maxConcurrentUsers: getMaxConcurrentForOrg(org),
            subscriptionEndsAt: org.subscriptionEndsAt,
            status: org.status
        }
    });
});

app.get('/api/organizations', (req, res) => {
    const admin = getSessionUser(req);
    if (!isGlobalAdmin(admin)) return res.status(403).json({ error: 'Доступ только для администратора' });
    try {
        var list = db.getOrganizations().map(function(o) {
            var activeSessions = db.countActiveSessionsForOrganization(o.id);
            return {
                id: o.id,
                name: o.name,
                planId: o.planId,
                maxConcurrentUsers: o.maxConcurrentUsers != null ? o.maxConcurrentUsers : (SUBSCRIPTION_PLANS[o.planId] && SUBSCRIPTION_PLANS[o.planId].maxConcurrentUsers >= 0 ? SUBSCRIPTION_PLANS[o.planId].maxConcurrentUsers : -1),
                subscriptionEndsAt: o.subscriptionEndsAt,
                status: o.status,
                contactEmail: o.contactEmail != null ? String(o.contactEmail) : '',
                createdAt: o.createdAt,
                activeSessions: activeSessions
            };
        });
        res.json({ organizations: list, plans: SUBSCRIPTION_PLANS });
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

app.get('/api/pricing', (req, res) => {
    try {
        const raw = db.getPricingPlans();
        const plans = raw.map(function(p, idx) {
            var promoPct = typeof p.promoPercent === 'number' ? p.promoPercent : parseFloat(p.promoPercent);
            if (isNaN(promoPct) || promoPct < 0) promoPct = 0;
            if (promoPct > 100) promoPct = 100;
            var mcu = p.maxConcurrentUsers;
            if (mcu !== undefined && mcu !== null && mcu !== '') {
                mcu = typeof mcu === 'number' ? mcu : parseInt(mcu, 10);
                if (isNaN(mcu)) mcu = null;
            } else {
                mcu = null;
            }
            return {
                id: String(p.id || ('plan_' + idx)),
                title: p.title,
                short: p.short,
                price: p.price,
                period: p.period,
                maxUsersText: p.maxUsersText,
                maxConcurrentUsers: mcu,
                order: typeof p.order === 'number' ? p.order : idx,
                highlighted: !!p.highlighted,
                ctaText: p.ctaText,
                kind: p.kind,
                promoPercent: promoPct,
                promoStartsAt: p.promoStartsAt ? String(p.promoStartsAt).slice(0, 10) : '',
                promoEndsAt: p.promoEndsAt ? String(p.promoEndsAt).slice(0, 10) : '',
                priceBeforePromo: p.priceBeforePromo != null ? String(p.priceBeforePromo) : ''
            };
        });
        res.json({ plans: plans });
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
        var mcuRaw = p.maxConcurrentUsers;
        var mcu = null;
        if (mcuRaw !== undefined && mcuRaw !== null && mcuRaw !== '') {
            mcu = typeof mcuRaw === 'number' ? mcuRaw : parseInt(mcuRaw, 10);
            if (isNaN(mcu)) mcu = null;
            else if (mcu === 0) mcu = null;
            else if (mcu < -1) mcu = null;
        }
        return {
            id: String(p.id || ('plan_' + idx)),
            title: String(p.title || 'Тариф'),
            short: String(p.short || ''),
            price: String(p.price || ''),
            period: String(p.period || ''),
            maxUsersText: String(p.maxUsersText || ''),
            maxConcurrentUsers: mcu,
            order: typeof p.order === 'number' ? p.order : idx,
            highlighted: !!p.highlighted,
            ctaText: String(p.ctaText || ''),
            kind: p.kind === 'trial' || p.kind === 'contact' ? p.kind : 'paid',
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
    var planId = body.planId || 'basic';
    var maxConcurrentUsers = body.maxConcurrentUsers;
    if (maxConcurrentUsers === undefined && SUBSCRIPTION_PLANS[planId]) maxConcurrentUsers = SUBSCRIPTION_PLANS[planId].maxConcurrentUsers === -1 ? 999 : SUBSCRIPTION_PLANS[planId].maxConcurrentUsers;
    var id = db.addOrganization({
        name: name,
        planId: planId,
        maxConcurrentUsers: maxConcurrentUsers,
        subscriptionEndsAt: body.subscriptionEndsAt || null,
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
    if (body.planId !== undefined) updates.planId = body.planId;
    if (body.maxConcurrentUsers !== undefined) updates.maxConcurrentUsers = body.maxConcurrentUsers;
    if (body.subscriptionEndsAt !== undefined) updates.subscriptionEndsAt = body.subscriptionEndsAt;
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

app.post('/api/auth/register', (req, res) => {
    const { username, password, fullName, organizationName, contactEmail } = req.body || {};
    if (!username || username.length < 3) return res.status(400).json({ success: false, error: 'Имя не менее 3 символов' });
    if (!organizationName || String(organizationName).trim().length < 3) return res.status(400).json({ success: false, error: 'Укажите название организации (не менее 3 символов)' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Пароль не менее 6 символов' });
    if (!contactEmail || !isValidContactEmail(String(contactEmail))) return res.status(400).json({ success: false, error: 'Укажите корректный e-mail для связи' });
    const users = db.getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return res.json({ success: false, error: 'Пользователь уже существует' });
    var organizationId = db.addOrganization({
        name: String(organizationName).trim(),
        planId: 'basic',
        maxConcurrentUsers: 1,
        subscriptionEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
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
    res.json({ success: true, pending: !organizationId, organizationId: organizationId });
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
        var o = { id: u.id, username: u.username, fullName: u.fullName || u.full_name, role: u.role, status: u.status || 'approved', createdAt: u.createdAt };
        if (u.organizationId) {
            o.organizationId = u.organizationId;
            var org = orgs.find(function(x) { return x.id === u.organizationId; });
            o.organizationName = org ? org.name : null;
        }
        return o;
    });
    res.json({ users: safe, organizations: orgs });
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

app.get('/api/settings', (req, res) => {
    try {
        var user = getSessionUser(req);
        var orgId = (user && user.organizationId) ? user.organizationId : (user && user.role === 'admin' ? (req.query.orgId || (db.getOrganizations().length ? db.getOrganizations()[0].id : null)) : null);
        var settings = db.getSettings(orgId || undefined);
        if (user && db.getMapStartForUser) {
            const mapStart = db.getMapStartForUser(user.userId);
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
        if (body.mapStart !== undefined && db.setMapStartForUser) {
            db.setMapStartForUser(user.userId, body.mapStart);
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
        Object.keys(syncCurrentStateByOrg).forEach(function(oid) { delete syncCurrentStateByOrg[oid]; });
        wss.clients.forEach(function(client) {
            if (client.readyState === WebSocket.OPEN && client.orgId) {
                var state = getSyncStateForOrg(client.orgId);
                try { client.send(JSON.stringify({ type: 'state', clientId: state.clientId, data: state.data })); } catch (e) {}
            }
        });
        res.json({ ok: true, message: 'Данные восстановлены. Войдите снова.' });
    } catch (e) {
        const msg = e && e.message ? String(e.message) : 'Ошибка восстановления';
        res.status(400).json({ error: msg });
    }
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: 'sqlite' }));

app.get('/api/public-config', (req, res) => {
    const key = serverConfig.yandexMapsApiKey || process.env.YANDEX_MAPS_API_KEY || '';
    res.json({ yandexMapsApiKey: key });
});

app.get('/api/public-stats', (req, res) => {
    try {
        res.json(db.getPublicStats());
    } catch (e) {
        res.status(500).json({ error: String(e.message) });
    }
});

// Лицевая страница по умолчанию — тарифы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pricing.html'));
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
var defaultOrgIdForSync = (function() {
    var orgs = db.getOrganizations();
    return orgs.length ? orgs[0].id : null;
})();
const wss = new WebSocket.Server({ server, path: '/sync' });
const syncClientNames = new Map();
const syncClientUserIds = new Map();
const syncClientOrgIds = new Map();
var syncDirtyOrgs = {};

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
        uid = inc.uniqueId != null ? inc.uniqueId : 'obj-' + j;
        idx = mergedObjs.findIndex(function(o) { return (o.uniqueId != null ? o.uniqueId : '') === uid; });
        if (idx >= 0) mergedObjs[idx] = inc; else mergedObjs.push(inc);
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
        existing = mergedCables.findIndex(function(x) { return x.uniqueId === c.uniqueId; });
        if (existing >= 0) mergedCables[existing] = cableData; else mergedCables.push(cableData);
    }
    return mergedObjs.concat(mergedCables);
}

function applyOperationToState(state, op) {
    if (!Array.isArray(state)) return state;
    var objCount = state.filter(function(i) { return i.type !== 'cable'; }).length;
    var i, idx, fromIdx, toIdx, fromUid, toUid, c;
    if (op.type === 'add_object' && op.data) {
        state = state.slice(0, objCount).concat([op.data]).concat(state.slice(objCount));
        state = state.map(function(item) {
            if (item.type !== 'cable') return item;
            var from = item.from, to = item.to;
            if (from >= objCount) from++; if (to >= objCount) to++;
            return Object.assign({}, item, { from: from, to: to });
        });
        return state;
    }
    if (op.type === 'update_object' && op.uniqueId != null && op.data) {
        idx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === op.uniqueId; });
        if (idx >= 0) {
            state = state.slice();
            state[idx] = Object.assign({}, state[idx], op.data);
        }
        return state;
    }
    if (op.type === 'delete_object' && op.uniqueId != null) {
        idx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === op.uniqueId; });
        if (idx < 0) return state;
        state = state.filter(function(_, i) { return i !== idx; });
        state = state.map(function(item, i) {
            if (item.type !== 'cable') return item;
            var from = item.from, to = item.to;
            if (from === idx || to === idx) return null;
            if (from > idx) from--; if (to > idx) to--;
            return Object.assign({}, item, { from: from, to: to });
        }).filter(Boolean);
        return state;
    }
    if (op.type === 'add_cable' && op.data) {
        fromUid = op.data.fromUniqueId; toUid = op.data.toUniqueId;
        fromIdx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === fromUid; });
        toIdx = state.findIndex(function(i) { return i.type !== 'cable' && i.uniqueId === toUid; });
        if (fromIdx >= 0 && toIdx >= 0) {
            c = { type: 'cable', cableType: op.data.cableType, from: fromIdx, to: toIdx, geometry: op.data.geometry };
            if (op.data.uniqueId != null) c.uniqueId = op.data.uniqueId;
            if (op.data.distance !== undefined) c.distance = op.data.distance;
            if (op.data.cableName != null) c.cableName = op.data.cableName;
            if (Array.isArray(op.data.routeUniqueIds) && op.data.routeUniqueIds.length >= 2) c.routeUniqueIds = op.data.routeUniqueIds.slice();
            return state.concat([c]);
        }
        return state;
    }
    if (op.type === 'update_cable' && op.uniqueId != null && op.data) {
        idx = state.findIndex(function(i) { return i.type === 'cable' && i.uniqueId === op.uniqueId; });
        if (idx >= 0) {
            state = state.slice();
            state[idx] = Object.assign({}, state[idx], op.data);
        }
        return state;
    }
    if (op.type === 'delete_cable' && op.uniqueId != null) {
        return state.filter(function(i) { return !(i.type === 'cable' && i.uniqueId === op.uniqueId); });
    }
    return state;
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
                }
                setImmediate(function() { broadcastSyncClients(orgId); });
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
            if (msg.type === 'op' && msg.op && orgId) {
                if (!isSyncClientAdmin(clientId)) return;
                var state = getSyncStateForOrg(orgId);
                state.data = applyOperationToState(state.data, msg.op);
                state.clientId = msg.clientId || clientId;
                syncDirtyOrgs[orgId] = true;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                        try { client.send(JSON.stringify({ type: 'op', op: msg.op })); } catch (e) {}
                    }
                });
                scheduleSyncWrite();
                return;
            }
            var justConnected = (Date.now() - (ws.connectedAt || 0)) < 4000;
            if (!justConnected && msg.data && isSyncClientAdmin(clientId) && orgId) {
                var state = getSyncStateForOrg(orgId);
                state.data = mergeMapState(state.data, msg.data);
                state.clientId = msg.clientId || clientId;
                if (msg.groupNames && typeof msg.groupNames === 'object') {
                    syncGroupNamesByOrg[orgId] = msg.groupNames;
                    try { db.setSettings({ groupNames: msg.groupNames }, orgId); } catch (e) {}
                }
                syncDirtyOrgs[orgId] = true;
                var statePayload = { type: 'state', clientId: state.clientId, data: state.data };
                var gn = syncGroupNamesByOrg[orgId] || syncGroupNames;
                if (gn && (gn.cross || gn.node)) statePayload.groupNames = gn;
                wss.clients.forEach(function(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN && client.orgId === orgId) {
                        try { client.send(JSON.stringify(statePayload)); } catch (e) {}
                    }
                });
                scheduleSyncWrite();
            }
        } catch (e) {}
        });
    });
    ws.on('close', function() {
        syncClientNames.delete(clientId);
        syncClientUserIds.delete(clientId);
        syncClientOrgIds.delete(clientId);
        ws.cursor = null;
        setImmediate(function() {
            broadcastSyncClients();
            broadcastCursors();
        });
    });
});

var syncWriteTimer = null;
var SYNC_WRITE_DELAY_MS = 1800;

function scheduleSyncWrite() {
    if (syncWriteTimer) clearTimeout(syncWriteTimer);
    syncWriteTimer = setTimeout(function() {
        syncWriteTimer = null;
        try {
            Object.keys(syncDirtyOrgs).forEach(function(orgId) {
                var state = syncCurrentStateByOrg[orgId];
                if (state && orgId) db.setMapData(orgId, state.data);
            });
            syncDirtyOrgs = {};
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
