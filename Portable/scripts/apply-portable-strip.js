/**
 * One-shot transformer: strips SaaS routes from Portable/server/server-api.js
 * and injects on-prem bootstrap. Safe to re-run (idempotent markers).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const API_PATH = path.join(__dirname, '..', 'server', 'server-api.js');
let src = fs.readFileSync(API_PATH, 'utf8');

if (src.indexOf('PORTABLE_STRIP_APPLIED') !== -1) {
    console.log('Portable strip already applied, skipping.');
    process.exit(0);
}

/** Remove Express route handlers whose path matches any of the predicates. */
function removeRoutes(code, shouldRemove) {
    const re = /\napp\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
    const matches = [];
    let m;
    while ((m = re.exec(code)) !== null) {
        matches.push({
            index: m.index,
            method: m[1],
            path: m[3],
            quoteStart: m.index + m[0].indexOf(m[2])
        });
    }
    // Walk from end so indices stay valid
    let out = code;
    for (let i = matches.length - 1; i >= 0; i--) {
        const cur = matches[i];
        if (!shouldRemove(cur.path, cur.method)) continue;
        const start = cur.index; // includes leading \n
        const end = i + 1 < matches.length ? matches[i + 1].index : findRouteBlockEnd(out, start);
        // Prefer next app.METHOD as end boundary when available
        let blockEnd;
        if (i + 1 < matches.length) {
            blockEnd = matches[i + 1].index;
        } else {
            blockEnd = findRouteBlockEnd(out, start + 1);
        }
        // Also stop before non-route top-level declarations after last route in a cluster
        out = out.slice(0, start) + out.slice(blockEnd);
    }
    return out;
}

function findRouteBlockEnd(code, from) {
    // Fallback: find next \napp. or \nfunction or \n// or end
    const slice = code.slice(from + 1);
    const next = slice.search(/\n(?:app\.(?:get|post|put|patch|delete|use)\(|function |\w+\.listen\(|\/\/ Storage bootstrap)/);
    if (next === -1) return code.length;
    return from + 1 + next;
}

function shouldRemovePath(p) {
    if (p === '/api/pricing' || p.indexOf('/api/pricing') === 0) return true;
    if (p === '/api/maintenance-notice') return true;
    if (p.indexOf('/api/support/') === 0) return true;
    if (p.indexOf('/api/privacy/') === 0) return true;
    if (p === '/api/updates') return true;
    if (p.indexOf('/api/news-media/') === 0) return true;
    if (p.indexOf('/api/admin/') === 0) return true;
    if (p === '/api/auth/register') return true;
    if (p === '/api/auth/forgot-password') return true;
    if (p.indexOf('/api/auth/reset-token') === 0) return true;
    if (p === '/api/auth/verify-email') return true;
    if (p === '/api/auth/resend-verification') return true;
    if (p === '/api/auth/reset-password') return true;
    if (p === '/api/public-stats') return true;
    if (p === '/api/organizations') return true; // GET list / POST create (exact)
    if (p === '/pricing.html' || p === '/updates.html') return true;
    if (p === '/robots.txt' || p === '/sitemap.xml') return true;
    // Platform org CRUD (not /me)
    if (/^\/api\/organizations\/:[^/]+$/.test(p)) return true; // PATCH/DELETE :id
    if (/^\/api\/organizations\/:[^/]+\/reset-password$/.test(p)) return true;
    return false;
}

src = removeRoutes(src, shouldRemovePath);

// Remove SaaS requires
src = src.replace(/\nconst newsMedia = require\('\.\/news-media'\);/, '');
src = src.replace(/\nconst supportBot = require\('\.\/lib\/support-bot'\);/, '');
src = src.replace(/\nconst mail = require\('\.\/lib\/mail'\);/, '');
src = src.replace(/\nconst passwordReset = require\('\.\/lib\/password-reset'\);/, '');
src = src.replace(/\nconst emailVerify = require\('\.\/lib\/email-verify'\);/, '');
src = src.replace(/\nconst updateBroadcast = require\('\.\/lib\/update-broadcast'\);/, '');
src = src.replace(/\n\/\*\* Блокировка параллельных массовых рассылок\. \*\/\nvar updateBroadcastInFlight = false;/, '');

// Simplify reloadServerConfig (no mail)
src = src.replace(
    /function reloadServerConfig\(options\) \{[\s\S]*?return serverConfig;\n\}/,
    `function reloadServerConfig(options) {
    const silent = !!(options && options.silent);
    const loaded = loadServerConfig();
    if (!loaded.ok || !loaded.config) {
        return serverConfig;
    }
    serverConfig = loaded.config;
    if (!silent) console.log('[Config] server-config.json перезагружен');
    return serverConfig;
}`
);

// Simplify logServerConfigWarnings (no SMTP)
src = src.replace(
    /function logServerConfigWarnings\(\) \{[\s\S]*?\n\}/,
    `function logServerConfigWarnings() {
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
}`
);

// Unlimited map objects by default in portable (-1 or unlocked)
src = src.replace(
    /var FALLBACK_FREE_MAP_OBJECT_LIMIT = parseInt\(\s*process\.env\.FREE_MAP_OBJECT_LIMIT \|\| serverConfig\.freeMapObjectLimit \|\| '2000',\s*10\s*\);\s*if \(isNaN\(FALLBACK_FREE_MAP_OBJECT_LIMIT\) \|\| FALLBACK_FREE_MAP_OBJECT_LIMIT < 1\) \{\s*FALLBACK_FREE_MAP_OBJECT_LIMIT = 2000;\s*\}/,
    `var _rawMapLimit = process.env.FREE_MAP_OBJECT_LIMIT || serverConfig.mapObjectLimit || serverConfig.freeMapObjectLimit;
var FALLBACK_FREE_MAP_OBJECT_LIMIT = (_rawMapLimit === -1 || _rawMapLimit === '-1' || _rawMapLimit == null || _rawMapLimit === '')
    ? -1
    : parseInt(_rawMapLimit, 10);
if (FALLBACK_FREE_MAP_OBJECT_LIMIT !== -1 && (isNaN(FALLBACK_FREE_MAP_OBJECT_LIMIT) || FALLBACK_FREE_MAP_OBJECT_LIMIT < 1)) {
    FALLBACK_FREE_MAP_OBJECT_LIMIT = -1;
}`
);

src = src.replace(
    /function getDefaultFreeMapObjectLimit\(\) \{\s*try \{\s*var cfg = db\.getPlatformLimitsConfig\(\);\s*if \(cfg\.fromStore && cfg\.fromStore\.limit\) return cfg\.defaultFreeMapObjectLimit;\s*return FALLBACK_FREE_MAP_OBJECT_LIMIT;\s*\} catch \(e\) \{\s*return FALLBACK_FREE_MAP_OBJECT_LIMIT;\s*\}\s*\}/,
    `function getDefaultFreeMapObjectLimit() {
    return FALLBACK_FREE_MAP_OBJECT_LIMIT;
}`
);

src = src.replace(
    /var FALLBACK_MAX_CONCURRENT_USERS = parseInt\(\s*process\.env\.MAX_CONCURRENT_USERS \|\| serverConfig\.maxConcurrentUsers \|\| '4',\s*10\s*\);\s*if \(isNaN\(FALLBACK_MAX_CONCURRENT_USERS\) \|\| FALLBACK_MAX_CONCURRENT_USERS < 1\) \{\s*FALLBACK_MAX_CONCURRENT_USERS = 4;\s*\}/,
    `var _rawConcurrent = process.env.MAX_CONCURRENT_USERS || serverConfig.maxConcurrentUsers;
var FALLBACK_MAX_CONCURRENT_USERS = (_rawConcurrent === -1 || _rawConcurrent === '-1' || _rawConcurrent == null || _rawConcurrent === '')
    ? -1
    : parseInt(_rawConcurrent, 10);
if (FALLBACK_MAX_CONCURRENT_USERS !== -1 && (isNaN(FALLBACK_MAX_CONCURRENT_USERS) || FALLBACK_MAX_CONCURRENT_USERS < 1)) {
    FALLBACK_MAX_CONCURRENT_USERS = -1;
}`
);

src = src.replace(
    /function getDefaultMaxConcurrentUsers\(\) \{\s*try \{\s*var cfg = db\.getPlatformLimitsConfig\(\);\s*if \(!cfg\.fromStore \|\| !cfg\.fromStore\.concurrent\) return FALLBACK_MAX_CONCURRENT_USERS;\s*var c = cfg\.defaultMaxConcurrentUsers;\s*return c === -1 \? -1 : \(c >= 1 \? c : FALLBACK_MAX_CONCURRENT_USERS\);\s*\} catch \(e\) \{\s*return FALLBACK_MAX_CONCURRENT_USERS;\s*\}\s*\}/,
    `function getDefaultMaxConcurrentUsers() {
    return FALLBACK_MAX_CONCURRENT_USERS;
}`
);

src = src.replace(
    /function getMapObjectLimitForOrg\(org\) \{\s*if \(!org \|\| orgHasUnlimitedMapObjects\(org\)\) return null;\s*if \(org\.customMapObjectLimit != null && org\.customMapObjectLimit !== ''\) \{\s*var custom = typeof org\.customMapObjectLimit === 'number' \? org\.customMapObjectLimit : parseInt\(org\.customMapObjectLimit, 10\);\s*if \(!isNaN\(custom\) && custom > 0\) return custom;\s*\}\s*return getDefaultFreeMapObjectLimit\(\);\s*\}/,
    `function getMapObjectLimitForOrg(org) {
    if (!org || orgHasUnlimitedMapObjects(org)) return null;
    var def = getDefaultFreeMapObjectLimit();
    if (def === -1) return null;
    if (org.customMapObjectLimit != null && org.customMapObjectLimit !== '') {
        var custom = typeof org.customMapObjectLimit === 'number' ? org.customMapObjectLimit : parseInt(org.customMapObjectLimit, 10);
        if (!isNaN(custom) && custom > 0) return custom;
    }
    return def;
}`
);

// Remove password-reset rate limit helpers
src = src.replace(/\n\/\*\* Лимит запросов «забыли пароль» с одного IP[\s\S]*?return \{ windowMs: windowMs, maxAttempts: maxAttempts \};\n\}\n\n\/\*\* Лимит реальных писем[\s\S]*?return \{ windowMs: windowMs, maxAttempts: maxAttempts \};\n\}\n/, '\n');

// validateCredentials: drop email verify
src = src.replace(
    /if \(!emailVerify\.isEmailVerified\(currentUser\)\) \{\s*return \{\s*ok: false,\s*error: '[^']*',\s*code: 'email_not_verified'\s*\};\s*\}\s*/,
    ''
);

// completeUserLogin: soften pending org message, skip visit log optional ok
src = src.replace(
    /error: 'Подтвердите e-mail по ссылке из письма — без этого организация ещё не активирована\.',\s*code: 'email_not_verified'/,
    "error: 'Организация ещё не активирована. Обратитесь к администратору.',\n                code: 'org_pending'"
);

// Map: don't block "global admin" — in portable admin always has org
src = src.replace(
    /if \(isGlobalAdmin\(user\)\) \{\s*return res\.status\(403\)\.json\(\{ error: 'Главному администратору недоступен интерфейс карты\. Используйте панель администратора\.' \}\);\s*\}\s*/,
    ''
);

// Root → index.html
src = src.replace(
    /\/\/ Лицевая страница по умолчанию — условия \(pricing\.html\)\napp\.get\('\/', \(req, res\) => \{\s*res\.setHeader\('Cache-Control', 'no-cache'\);\s*res\.sendFile\(path\.join\(PUBLIC_DIR, 'pricing\.html'\)\);\s*\}\);/,
    `// Portable: корень — карта (клиент редиректит на auth без сессии)
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});`
);

// public-config: portable flag
src = src.replace(
    /res\.json\(\{\s*yandexMapsApiKey: key,\s*mapEngine: mapEngine,\s*publicSiteUrl: publicSiteUrl \? String\(publicSiteUrl\)\.trim\(\)\.replace\(\/\\\/\$\/, ''\) : '',\s*freeMapObjectLimit: getDefaultFreeMapObjectLimit\(\),\s*defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers\(\)\s*\}\);/,
    `res.json({
        portable: true,
        yandexMapsApiKey: key,
        mapEngine: mapEngine,
        publicSiteUrl: publicSiteUrl ? String(publicSiteUrl).trim().replace(/\\/$/, '') : '',
        freeMapObjectLimit: getDefaultFreeMapObjectLimit() === -1 ? null : getDefaultFreeMapObjectLimit(),
        defaultMaxConcurrentUsers: getDefaultMaxConcurrentUsers() === -1 ? null : getDefaultMaxConcurrentUsers()
    });`
);

const BOOTSTRAP = `
/** PORTABLE_STRIP_APPLIED — bootstrap одной организации и админа из server-config.json */
async function ensurePortableBootstrap() {
    var orgName = String(serverConfig.organizationName || 'Организация').trim() || 'Организация';
    var adminUser = String(serverConfig.bootstrapAdminUsername || 'admin').trim() || 'admin';
    var adminPass = String(serverConfig.bootstrapAdminPassword || 'admin123');
    var adminFull = String(serverConfig.bootstrapAdminFullName || 'Администратор').trim() || 'Администратор';
    var adminEmail = String(serverConfig.adminEmail || '').trim() || '';

    var orgs = db.getOrganizations() || [];
    var org = orgs[0] || null;
    if (!org) {
        var newOrgId = db.addOrganization({
            name: orgName,
            status: 'active',
            contactEmail: adminEmail,
            mapObjectLimitUnlocked: true,
            maxConcurrentUsers: getDefaultMaxConcurrentUsers() === -1 ? -1 : getDefaultMaxConcurrentUsers()
        });
        org = db.getOrganization(newOrgId);
        console.log('[Portable] Создана организация:', orgName, '(' + newOrgId + ')');
    } else if (org.status === 'pending') {
        try {
            db.updateOrganization(org.id, { status: 'active' });
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
    if (!admin && users.length === 0) {
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
        console.log('[Portable] Создан администратор:', adminUser, '(смените пароль после первого входа)');
    } else if (admin && !admin.organizationId) {
        admin.organizationId = org.id;
        admin.emailVerified = true;
        if (admin.status === 'pending') admin.status = 'approved';
        db.setUsers(users);
        console.log('[Portable] Администратор привязан к организации:', org.name || org.id);
    }

    users = db.getUsers() || [];
    var changed = false;
    users.forEach(function(u) {
        if (u.emailVerified === false) { u.emailVerified = true; changed = true; }
        if (u.status === 'pending' && u.role === 'admin') { u.status = 'approved'; changed = true; }
        if (u.role === 'admin' && !u.organizationId) { u.organizationId = org.id; changed = true; }
    });
    if (changed) db.setUsers(users);
}
`;

const marker = '// Storage bootstrap (JSON sync or MySQL hydrate) happens in initStorage before listen.';
if (src.indexOf('PORTABLE_STRIP_APPLIED') === -1) {
    if (src.indexOf(marker) !== -1) {
        src = src.replace(marker, BOOTSTRAP + '\n' + marker);
    } else {
        src = src + '\n' + BOOTSTRAP;
    }
}

// Replace startup: skip SaaS initDefaultAdmin (creates org-less admin), use portable bootstrap
src = src.replace(
    /db\.initStorage\(\)\.then\(function \(\) \{\s*db\.getDb\(\);\s*return db\.initDefaultAdmin\(\);\s*\}\)\.then\(function\(\) \{\s*server\.listen\(PORT, HOST, \(\) => \{[\s\S]*?logServerConfigWarnings\(\);\s*nedImport\.prepareInBackground\(\);\s*if \(mail\.isMailConfigured\(serverConfig\) && mail\.verifySmtp\) \{[\s\S]*?\}\s*\}\);\s*\}\)/,
    `db.initStorage().then(function () {
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
        nedImport.prepareInBackground();
    });
})`
);

fs.writeFileSync(API_PATH, src);
console.log('Wrote stripped server-api.js');

// Quick sanity: leftover requires
const leftovers = [];
['news-media', 'support-bot', 'email-verify', 'update-broadcast', './lib/mail', 'password-reset'].forEach(function(name) {
    if (src.indexOf("require('./" + name) !== -1 || src.indexOf("require('./lib/" + name.replace('lib/', '')) !== -1) {
        // check more carefully
    }
    if (new RegExp("require\\(['\\\"]\\.\\/" + name.replace('/', '\\/') + "['\\\"]\\)").test(src)) {
        leftovers.push(name);
    }
});
['newsMedia', 'supportBot', 'emailVerify', 'updateBroadcast', 'passwordReset', 'mail.'].forEach(function(id) {
    if (src.indexOf(id) !== -1 && id !== 'mail.') leftovers.push('ref:' + id);
});
if (src.indexOf('mail.') !== -1 || src.indexOf('mail)') !== -1) {
    // mail may still be referenced
    const mailRefs = (src.match(/\bmail\b/g) || []).length;
    if (mailRefs > 0) leftovers.push('mail refs: ' + mailRefs);
}
console.log('Leftover hints:', leftovers.length ? leftovers : 'none');
