'use strict';

/**
 * Persist / hydrate the in-memory store document to MySQL tables.
 */
const crypto = require('crypto');
const { query, withTransaction, getPool } = require('./mysql');
const mapAssemble = require('./map-assemble');
const { createBatchingConn } = require('./batch-conn');

function toMysqlDate(v) {
    if (v == null || v === '') return null;
    var d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 23).replace('T', ' ');
}

function emptyStore() {
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

async function hydrateStoreFromMysql() {
    await getPool();
    const store = emptyStore();

    const [orgs] = await query('SELECT * FROM organizations');
    store.organizations = (orgs || []).map(function (o) {
        return {
            id: o.id,
            name: o.name,
            mapObjectLimitUnlocked: !!o.map_object_limit_unlocked,
            customMapObjectLimit: o.custom_map_object_limit,
            maxConcurrentUsers: o.max_concurrent_users,
            status: o.status,
            contactEmail: o.contact_email || '',
            twoFactorEnabled: !!o.two_factor_enabled,
            twoFactorSecret: o.two_factor_secret,
            embedEnabled: !!o.embed_enabled,
            embedToken: o.embed_token || null,
            embedCreatedAt: o.embed_created_at ? new Date(o.embed_created_at).toISOString() : null,
            zabbixEnabled: !!o.zabbix_enabled,
            zabbixApiUrl: o.zabbix_api_url || null,
            zabbixApiToken: o.zabbix_api_token || null,
            zabbixUpdatedAt: o.zabbix_updated_at ? new Date(o.zabbix_updated_at).toISOString() : null,
            zabbixPollIntervalSec: o.zabbix_poll_interval_sec != null ? Number(o.zabbix_poll_interval_sec) : null,
            createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString()
        };
    });

    const [users] = await query('SELECT * FROM users');
    store.users = (users || []).map(function (u) {
        return {
            id: u.id,
            username: u.username,
            password: u.password_hash,
            fullName: u.full_name,
            full_name: u.full_name,
            role: u.role,
            status: u.status,
            email: u.email || '',
            emailVerified: u.email_verified === undefined || u.email_verified === null ? true : !!u.email_verified,
            organizationId: u.organization_id,
            avatarUpdatedAt: u.avatar_updated_at,
            mustChangePassword: !!u.must_change_password,
            createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString()
        };
    });

    const [sessions] = await query('SELECT * FROM sessions');
    store.sessions = (sessions || []).map(function (s) {
        return {
            token: s.token,
            user_id: s.user_id,
            organization_id: s.organization_id,
            expires_at: s.expires_at ? new Date(s.expires_at).toISOString() : null
        };
    });

    const [plat] = await query('SELECT setting_key, setting_value FROM platform_settings');
    store.settings = {};
    (plat || []).forEach(function (row) {
        store.settings[row.setting_key] = row.setting_value;
    });

    const [orgSet] = await query('SELECT org_id, setting_key, setting_value FROM org_settings');
    store.settingsByOrg = {};
    (orgSet || []).forEach(function (row) {
        if (!store.settingsByOrg[row.org_id]) store.settingsByOrg[row.org_id] = {};
        var val = row.setting_value;
        try { val = JSON.parse(row.setting_value); } catch (e) {}
        store.settingsByOrg[row.org_id][row.setting_key] = val;
    });

    // Map: prefer relational assemble, else blob
    store.mapDataByOrg = {};
    var relationalMapOrgs = Object.create(null);
    Object.defineProperty(store, '__relationalMapOrgs', { value: relationalMapOrgs, enumerable: false });
    for (var oi = 0; oi < store.organizations.length; oi++) {
        var orgId = store.organizations[oi].id;
        var assembled = await withTransaction(async function (conn) {
            return mapAssemble.assembleMapData(conn, orgId);
        });
        if (assembled && assembled.length) {
            store.mapDataByOrg[orgId] = assembled;
            relationalMapOrgs[orgId] = true;
        } else {
            const [blobs] = await query('SELECT map_json FROM org_map_blobs WHERE org_id = ?', [orgId]);
            if (blobs && blobs[0] && blobs[0].map_json) {
                try {
                    store.mapDataByOrg[orgId] = JSON.parse(blobs[0].map_json);
                } catch (e) {
                    store.mapDataByOrg[orgId] = [];
                }
            } else {
                store.mapDataByOrg[orgId] = [];
            }
        }
    }

    const [hist] = await query('SELECT * FROM history_events ORDER BY timestamp ASC');
    store.historyByOrg = {};
    (hist || []).forEach(function (h) {
        if (!store.historyByOrg[h.org_id]) store.historyByOrg[h.org_id] = [];
        var user = null;
        try { user = h.user_json ? (typeof h.user_json === 'string' ? JSON.parse(h.user_json) : h.user_json) : null; } catch (e) {}
        var details = null;
        try { details = h.details_json ? (typeof h.details_json === 'string' ? JSON.parse(h.details_json) : h.details_json) : null; } catch (e2) {}
        store.historyByOrg[h.org_id].push({
            id: h.id,
            timestamp: h.timestamp ? new Date(h.timestamp).toISOString() : null,
            actionType: h.action_type,
            actionName: h.action_name,
            icon: h.icon,
            user: user,
            details: details
        });
    });

    const [chat] = await query('SELECT * FROM org_chat_messages ORDER BY created_at ASC');
    store.chatByOrg = {};
    (chat || []).forEach(function (c) {
        if (!store.chatByOrg[c.org_id]) store.chatByOrg[c.org_id] = [];
        var payload = c.payload_json;
        try { payload = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) {}
        store.chatByOrg[c.org_id].push(payload);
    });

    const [media] = await query('SELECT * FROM org_chat_media');
    store.chatMediaByOrg = {};
    (media || []).forEach(function (m) {
        if (!store.chatMediaByOrg[m.org_id]) store.chatMediaByOrg[m.org_id] = [];
        var payload = m.payload_json;
        try { payload = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) {}
        store.chatMediaByOrg[m.org_id].push(payload);
    });

    const [plans] = await query('SELECT * FROM pricing_plans ORDER BY sort_order ASC');
    store.pricingPlans = (plans || []).map(function (p) {
        var payload = p.payload_json;
        try { payload = typeof payload === 'string' ? JSON.parse(payload) : payload; } catch (e) { payload = { id: p.id }; }
        return payload;
    });

    const [visits] = await query('SELECT * FROM visit_logs ORDER BY at_time ASC');
    store.visitLogs = (visits || []).map(function (v) {
        return {
            at: v.at_time ? new Date(v.at_time).toISOString() : null,
            username: v.username,
            userId: v.user_id,
            organizationId: v.organization_id,
            ip: v.ip,
            source: v.source,
            userAgent: v.user_agent
        };
    });

    const [tokens] = await query('SELECT * FROM device_tokens');
    store.deviceTokens = (tokens || []).map(function (t) {
        return {
            userId: t.user_id,
            orgId: t.org_id,
            token: t.token,
            platform: t.platform,
            updatedAt: t.updated_at
        };
    });

    const [threads] = await query('SELECT * FROM support_threads');
    const [msgs] = await query('SELECT * FROM support_messages ORDER BY at_time ASC');
    var msgsByThread = {};
    (msgs || []).forEach(function (m) {
        if (!msgsByThread[m.thread_id]) msgsByThread[m.thread_id] = [];
        msgsByThread[m.thread_id].push({
            id: m.id,
            from: m.from_role,
            text: m.body,
            at: m.at_time ? new Date(m.at_time).toISOString() : null
        });
    });
    store.supportThreads = (threads || []).map(function (t) {
        return {
            id: t.id,
            visitorId: t.visitor_id,
            name: t.name,
            email: t.email,
            page: t.page,
            createdAt: t.created_at ? new Date(t.created_at).toISOString() : null,
            updatedAt: t.updated_at ? new Date(t.updated_at).toISOString() : null,
            unreadByAdmin: !!t.unread_by_admin,
            unreadByVisitor: !!t.unread_by_visitor,
            messages: msgsByThread[t.id] || []
        };
    });

    const [prt] = await query('SELECT * FROM password_reset_tokens');
    store.passwordResetTokens = (prt || []).map(function (t) {
        var extra = {};
        try { extra = t.payload_json ? (typeof t.payload_json === 'string' ? JSON.parse(t.payload_json) : t.payload_json) : {}; } catch (e) {}
        return Object.assign({
            token: t.token,
            userId: t.user_id,
            expiresAt: t.expires_at ? new Date(t.expires_at).toISOString() : null
        }, extra);
    });

    const [evt] = await query('SELECT * FROM email_verification_tokens');
    store.emailVerificationTokens = (evt || []).map(function (t) {
        var extra = {};
        try { extra = t.payload_json ? (typeof t.payload_json === 'string' ? JSON.parse(t.payload_json) : t.payload_json) : {}; } catch (e) {}
        return Object.assign({
            token: t.token,
            userId: t.user_id,
            expiresAt: t.expires_at ? new Date(t.expires_at).toISOString() : null
        }, extra);
    });

    // user map start / themes into settings
    const [ums] = await query('SELECT * FROM user_map_start');
    if (!store.settings.userMapStarts) store.settings.userMapStarts = '{}';
    try {
        var mapStarts = {};
        (ums || []).forEach(function (r) {
            mapStarts[r.user_id] = typeof r.payload_json === 'string' ? JSON.parse(r.payload_json) : r.payload_json;
        });
        store.settings.userMapStarts = JSON.stringify(mapStarts);
    } catch (e) {}
    const [uth] = await query('SELECT * FROM user_themes');
    try {
        var themes = {};
        (uth || []).forEach(function (r) { themes[r.user_id] = r.theme; });
        store.settings.userThemes = JSON.stringify(themes);
    } catch (e2) {}

    return store;
}

/* ---------- Запись: писатели по разделам ---------- */

const ORG_SCOPED_TABLES = ['history_events', 'org_chat_messages', 'org_chat_media', 'org_settings', 'org_map_blobs'];
const GLOBAL_TABLES_FULL_RESET = [
    'password_reset_tokens', 'email_verification_tokens', 'support_messages', 'support_threads',
    'visit_logs', 'device_tokens', 'pricing_plans', 'org_chat_media', 'org_chat_messages',
    'history_events', 'user_themes', 'user_map_start', 'org_settings', 'platform_settings',
    'sessions', 'users', 'org_map_blobs'
];

async function writeOrganizations(conn, orgs) {
    const [existingOrgs] = await conn.query('SELECT id FROM organizations');
    var keepOrg = {};
    (orgs || []).forEach(function (o) { if (o && o.id) keepOrg[o.id] = 1; });
    for (var ei = 0; ei < (existingOrgs || []).length; ei++) {
        var oid = existingOrgs[ei].id;
        if (keepOrg[oid]) continue;
        await mapAssemble.clearOrgMapRows(conn, oid);
        for (var ti = 0; ti < ORG_SCOPED_TABLES.length; ti++) {
            await conn.query('DELETE FROM `' + ORG_SCOPED_TABLES[ti] + '` WHERE org_id = ?', [oid]);
        }
        await conn.query('DELETE FROM organizations WHERE id = ?', [oid]);
    }
    for (var i = 0; i < (orgs || []).length; i++) {
        var o = orgs[i];
        if (!o || !o.id) continue;
        await conn.query(
            `INSERT INTO organizations (
                id, name, map_object_limit_unlocked, custom_map_object_limit, max_concurrent_users,
                status, contact_email, two_factor_enabled, two_factor_secret,
                embed_enabled, embed_token, embed_created_at,
                zabbix_enabled, zabbix_api_url, zabbix_api_token, zabbix_updated_at,
                zabbix_poll_interval_sec, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                name=VALUES(name), map_object_limit_unlocked=VALUES(map_object_limit_unlocked),
                custom_map_object_limit=VALUES(custom_map_object_limit),
                max_concurrent_users=VALUES(max_concurrent_users), status=VALUES(status),
                contact_email=VALUES(contact_email), two_factor_enabled=VALUES(two_factor_enabled),
                two_factor_secret=VALUES(two_factor_secret),
                embed_enabled=VALUES(embed_enabled), embed_token=VALUES(embed_token),
                embed_created_at=VALUES(embed_created_at),
                zabbix_enabled=VALUES(zabbix_enabled), zabbix_api_url=VALUES(zabbix_api_url),
                zabbix_api_token=VALUES(zabbix_api_token), zabbix_updated_at=VALUES(zabbix_updated_at),
                zabbix_poll_interval_sec=VALUES(zabbix_poll_interval_sec)`,
            [
                o.id, o.name || 'Организация',
                o.mapObjectLimitUnlocked ? 1 : 0,
                o.customMapObjectLimit != null ? o.customMapObjectLimit : null,
                o.maxConcurrentUsers != null ? o.maxConcurrentUsers : null,
                o.status || 'active',
                o.contactEmail || null,
                o.twoFactorEnabled ? 1 : 0,
                o.twoFactorSecret || null,
                o.embedEnabled ? 1 : 0,
                o.embedToken || null,
                toMysqlDate(o.embedCreatedAt) || null,
                o.zabbixEnabled ? 1 : 0,
                o.zabbixApiUrl || null,
                o.zabbixApiToken || null,
                toMysqlDate(o.zabbixUpdatedAt) || null,
                o.zabbixPollIntervalSec != null ? o.zabbixPollIntervalSec : null,
                toMysqlDate(o.createdAt) || toMysqlDate(new Date())
            ]
        );
    }
}

async function writeUsers(conn, users) {
    await conn.query('DELETE FROM users');
    for (var ui = 0; ui < (users || []).length; ui++) {
        var u = users[ui];
        if (!u || !u.id) continue;
        await conn.query(
            `INSERT INTO users (
                id, username, password_hash, full_name, role, status, email, email_verified, organization_id,
                avatar_updated_at, must_change_password, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                u.id, u.username, u.password || '',
                u.fullName || u.full_name || null,
                u.role || 'user', u.status || 'pending',
                u.email || null,
                u.emailVerified === false ? 0 : 1,
                u.organizationId || null,
                toMysqlDate(u.avatarUpdatedAt),
                u.mustChangePassword ? 1 : 0,
                toMysqlDate(u.createdAt) || toMysqlDate(new Date())
            ]
        );
    }
}

async function writeSessions(conn, sessions) {
    await conn.query('DELETE FROM sessions');
    for (var si = 0; si < (sessions || []).length; si++) {
        var s = sessions[si];
        if (!s || !s.token || !s.user_id) continue;
        var exp = toMysqlDate(s.expires_at);
        if (!exp) continue;
        await conn.query(
            'INSERT INTO sessions (token, user_id, organization_id, expires_at) VALUES (?,?,?,?)',
            [s.token, s.user_id, s.organization_id || null, exp]
        );
    }
}

/** platform_settings + производные таблицы user_map_start / user_themes. */
async function writePlatformSettings(conn, settings) {
    settings = settings || {};
    await conn.query('DELETE FROM platform_settings');
    await conn.query('DELETE FROM user_map_start');
    await conn.query('DELETE FROM user_themes');
    for (var sk of Object.keys(settings)) {
        var sv = settings[sk];
        if (typeof sv === 'object') sv = JSON.stringify(sv);
        await conn.query(
            'INSERT INTO platform_settings (setting_key, setting_value) VALUES (?,?)',
            [sk, sv != null ? String(sv) : null]
        );
    }
    try {
        var starts = JSON.parse(settings.userMapStarts || '{}');
        for (var uid of Object.keys(starts || {})) {
            await conn.query(
                'INSERT INTO user_map_start (user_id, payload_json) VALUES (?,?)',
                [uid, JSON.stringify(starts[uid])]
            );
        }
    } catch (e) {}
    try {
        var themes = JSON.parse(settings.userThemes || '{}');
        for (var tuid of Object.keys(themes || {})) {
            await conn.query(
                'INSERT INTO user_themes (user_id, theme) VALUES (?,?)',
                [tuid, themes[tuid]]
            );
        }
    } catch (e2) {}
}

async function writeOrgSettings(conn, os, orgId) {
    await conn.query('DELETE FROM org_settings WHERE org_id = ?', [orgId]);
    os = os || {};
    for (var osk of Object.keys(os)) {
        var osv = os[osk];
        await conn.query(
            'INSERT INTO org_settings (org_id, setting_key, setting_value) VALUES (?,?,?)',
            [orgId, osk, typeof osv === 'string' ? osv : JSON.stringify(osv)]
        );
    }
}

async function writeOrgMap(conn, items, orgId, section) {
    items = Array.isArray(items) ? items : [];
    // Blob читается только когда реляционные таблицы карты пусты, поэтому при точечном
    // обновлении его можно писать реже; пустую карту пишем всегда, иначе вернётся старый blob.
    var skipBlob = !!(section && section.mapDiff && section.skipBlob && items.length);
    if (!skipBlob) {
        var json = section && section.json != null ? section.json : JSON.stringify(items);
        await conn.query(
            'INSERT INTO org_map_blobs (org_id, map_json, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE map_json=VALUES(map_json), updated_at=VALUES(updated_at)',
            [orgId, json, toMysqlDate(new Date())]
        );
        if (section) section.blobWritten = true;
    }
    if (section && section.blobOnly) return;
    if (section && section.skipRelationalMap) return;
    if (section && section.mapDiff) {
        await mapAssemble.applyMapDiff(conn, orgId, section.mapDiff);
        return;
    }
    await mapAssemble.disassembleMapData(conn, orgId, items);
}

async function writeOrgHistory(conn, hlist, orgId) {
    await conn.query('DELETE FROM history_events WHERE org_id = ?', [orgId]);
    hlist = hlist || [];
    for (var hi = 0; hi < hlist.length; hi++) {
        var h = hlist[hi];
        if (!h || !h.id) continue;
        await conn.query(
            `INSERT INTO history_events (id, org_id, timestamp, action_type, action_name, icon, user_json, details_json)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
                h.id, orgId, toMysqlDate(h.timestamp),
                h.actionType || null, h.actionName || null, h.icon || null,
                h.user ? JSON.stringify(h.user) : null,
                h.details ? JSON.stringify(h.details) : null
            ]
        );
    }
}

async function writeOrgChat(conn, clist, orgId) {
    await conn.query('DELETE FROM org_chat_messages WHERE org_id = ?', [orgId]);
    clist = clist || [];
    for (var ci = 0; ci < clist.length; ci++) {
        var msg = clist[ci];
        if (!msg) continue;
        var mid = msg.id || ('chat_' + orgId + '_' + ci);
        await conn.query(
            'INSERT INTO org_chat_messages (id, org_id, payload_json, created_at) VALUES (?,?,?,?)',
            [mid, orgId, JSON.stringify(msg), toMysqlDate(msg.at || msg.createdAt || new Date())]
        );
    }
}

async function writeOrgChatMedia(conn, mlist, orgId) {
    await conn.query('DELETE FROM org_chat_media WHERE org_id = ?', [orgId]);
    mlist = mlist || [];
    for (var mi = 0; mi < mlist.length; mi++) {
        var med = mlist[mi];
        if (!med) continue;
        var medId = med.id || ('media_' + orgId + '_' + mi);
        await conn.query(
            'INSERT INTO org_chat_media (id, org_id, payload_json) VALUES (?,?,?)',
            [medId, orgId, JSON.stringify(med)]
        );
    }
}

async function writePricingPlans(conn, plans) {
    await conn.query('DELETE FROM pricing_plans');
    plans = plans || [];
    for (var pi = 0; pi < plans.length; pi++) {
        var plan = plans[pi];
        if (!plan || !plan.id) continue;
        await conn.query(
            'INSERT INTO pricing_plans (id, payload_json, sort_order) VALUES (?,?,?)',
            [plan.id, JSON.stringify(plan), plan.order != null ? plan.order : pi]
        );
    }
}

async function writeVisitLogs(conn, visits) {
    await conn.query('DELETE FROM visit_logs');
    visits = visits || [];
    for (var vi = 0; vi < visits.length; vi++) {
        var v = visits[vi];
        if (!v) continue;
        await conn.query(
            `INSERT INTO visit_logs (at_time, username, user_id, organization_id, ip, source, user_agent)
             VALUES (?,?,?,?,?,?,?)`,
            [toMysqlDate(v.at), v.username || null, v.userId || null, v.organizationId || null, v.ip || null, v.source || null, v.userAgent || null]
        );
    }
}

async function writeDeviceTokens(conn, tokens) {
    await conn.query('DELETE FROM device_tokens');
    tokens = tokens || [];
    for (var di = 0; di < tokens.length; di++) {
        var dt = tokens[di];
        if (!dt || !dt.token) continue;
        await conn.query(
            'INSERT INTO device_tokens (user_id, org_id, token, platform, updated_at) VALUES (?,?,?,?,?)',
            [dt.userId || '', dt.orgId || null, dt.token, dt.platform || null, toMysqlDate(dt.updatedAt || new Date())]
        );
    }
}

async function writeSupportThreads(conn, threads) {
    await conn.query('DELETE FROM support_messages');
    await conn.query('DELETE FROM support_threads');
    threads = threads || [];
    for (var ti = 0; ti < threads.length; ti++) {
        var th = threads[ti];
        if (!th || !th.id) continue;
        await conn.query(
            `INSERT INTO support_threads (
                id, visitor_id, name, email, page, created_at, updated_at, unread_by_admin, unread_by_visitor
            ) VALUES (?,?,?,?,?,?,?,?,?)`,
            [
                th.id, th.visitorId || '', th.name || null, th.email || null, th.page || null,
                toMysqlDate(th.createdAt), toMysqlDate(th.updatedAt),
                th.unreadByAdmin ? 1 : 0, th.unreadByVisitor ? 1 : 0
            ]
        );
        var tmsgs = th.messages || [];
        for (var tmi = 0; tmi < tmsgs.length; tmi++) {
            var tm = tmsgs[tmi];
            if (!tm || !tm.id) continue;
            await conn.query(
                'INSERT INTO support_messages (id, thread_id, from_role, body, at_time) VALUES (?,?,?,?,?)',
                [tm.id, th.id, tm.from || 'visitor', tm.text || '', toMysqlDate(tm.at)]
            );
        }
    }
}

async function writeTokenTable(conn, table, list) {
    await conn.query('DELETE FROM `' + table + '`');
    list = list || [];
    for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (!t || !t.token) continue;
        var exp = toMysqlDate(t.expiresAt);
        if (!exp) continue;
        var rest = Object.assign({}, t);
        delete rest.token;
        delete rest.userId;
        delete rest.expiresAt;
        await conn.query(
            'INSERT INTO `' + table + '` (token, user_id, expires_at, payload_json) VALUES (?,?,?,?)',
            [t.token, t.userId || '', exp, Object.keys(rest).length ? JSON.stringify(rest) : null]
        );
    }
}

const SECTION_WRITERS = {
    organizations: writeOrganizations,
    users: writeUsers,
    sessions: writeSessions,
    settings: writePlatformSettings,
    pricingPlans: writePricingPlans,
    visitLogs: writeVisitLogs,
    deviceTokens: writeDeviceTokens,
    supportThreads: writeSupportThreads,
    passwordResetTokens: function (conn, list) { return writeTokenTable(conn, 'password_reset_tokens', list); },
    emailVerificationTokens: function (conn, list) { return writeTokenTable(conn, 'email_verification_tokens', list); },
    orgSettings: writeOrgSettings,
    map: writeOrgMap,
    history: writeOrgHistory,
    chat: writeOrgChat,
    chatMedia: writeOrgChatMedia
};

const ORG_SECTION_SOURCES = {
    orgSettings: 'settingsByOrg',
    map: 'mapDataByOrg',
    history: 'historyByOrg',
    chat: 'chatByOrg',
    chatMedia: 'chatMediaByOrg'
};

const GLOBAL_SECTION_SOURCES = [
    'organizations', 'users', 'sessions', 'settings', 'pricingPlans', 'visitLogs',
    'deviceTokens', 'supportThreads', 'passwordResetTokens', 'emailVerificationTokens'
];

/* ---------- Инкрементальная запись ---------- */

const MAP_FULL_CHECK_INTERVAL_MS = 60 * 1000;
const MAP_BLOB_INTERVAL_MS = 5 * 60 * 1000;

function sectionKey(kind, orgId) {
    return orgId == null ? kind : kind + ':' + orgId;
}

function emptyPayloadFor(kind) {
    return kind === 'orgSettings' || kind === 'settings' ? {} : [];
}

function buildSections(store) {
    var list = [];
    GLOBAL_SECTION_SOURCES.forEach(function (kind) {
        var payload = store[kind];
        list.push({ key: kind, kind: kind, orgId: null, payload: payload != null ? payload : emptyPayloadFor(kind) });
    });
    Object.keys(ORG_SECTION_SOURCES).forEach(function (kind) {
        var byOrg = store[ORG_SECTION_SOURCES[kind]] || {};
        Object.keys(byOrg).forEach(function (orgId) {
            var payload = byOrg[orgId];
            list.push({ key: sectionKey(kind, orgId), kind: kind, orgId: orgId, payload: payload != null ? payload : emptyPayloadFor(kind) });
        });
    });
    return list;
}

function hashJson(json) {
    return crypto.createHash('sha1').update(json).digest('base64') + ':' + json.length;
}

const MAP_DIFF_MAX_SHARE = 0.3;

/**
 * JSON карты по объектам. index = null, если точечное обновление невозможно
 * (повтор uniqueId) — тогда карта переписывается целиком.
 */
function serializeMapItems(items, orgId) {
    var parts = new Array(items.length);
    var objects = new Map();
    var unkeyed = [];
    var stable = true;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var json = JSON.stringify(item);
        parts[i] = json === undefined ? 'null' : json;
        if (!stable || !item || typeof item !== 'object') continue;
        if (item.uniqueId == null || item.uniqueId === '') {
            // Как в disassembleMapData: из объектов без uniqueId в таблицы попадают только подписи кабелей.
            if (item.type === 'cableLabel') unkeyed.push({ uid: 'cableLabel-' + orgId + '-' + i, json: parts[i], item: item });
            continue;
        }
        var key = (item.type === 'cable' ? 'c:' : 'o:') + String(item.uniqueId);
        if (objects.has(key)) {
            stable = false;
            continue;
        }
        objects.set(key, { json: parts[i], item: item });
    }
    return {
        json: '[' + parts.join(',') + ']',
        index: stable ? {
            objects: objects,
            unkeyed: unkeyed,
            unkeyedJson: unkeyed.map(function (u) { return u.json; }).join(',')
        } : null
    };
}

function computeMapDiff(prev, next) {
    if (!prev || !next) return null;
    var changedItems = [];
    var generatedItems = [];
    var affectedObjectUids = [];
    var affectedCableUids = [];
    function markAffected(key) {
        var uid = key.slice(2);
        if (key.charAt(0) === 'c') affectedCableUids.push(uid);
        else affectedObjectUids.push(uid);
    }
    next.objects.forEach(function (entry, key) {
        if (prev.objects.get(key) === entry.json) return;
        changedItems.push(entry.item);
        markAffected(key);
    });
    prev.objects.forEach(function (_json, key) {
        if (!next.objects.has(key)) markAffected(key);
    });
    var rewriteGenerated = prev.unkeyedJson !== next.unkeyedJson;
    if (rewriteGenerated) {
        next.unkeyed.forEach(function (u) { generatedItems.push({ uid: u.uid, item: u.item }); });
    }
    var touched = affectedObjectUids.length + affectedCableUids.length + generatedItems.length;
    if (touched > Math.max(50, next.objects.size * MAP_DIFF_MAX_SHARE)) return null;
    return {
        changedItems: changedItems,
        generatedItems: generatedItems,
        rewriteGenerated: rewriteGenerated,
        affectedObjectUids: affectedObjectUids,
        affectedCableUids: affectedCableUids
    };
}

/** В состоянии храним только JSON объектов, без ссылок на сами объекты карты. */
function toStoredIndex(index) {
    if (!index) return null;
    var objects = new Map();
    index.objects.forEach(function (entry, key) { objects.set(key, entry.json); });
    return { objects: objects, unkeyedJson: index.unkeyedJson };
}

function createPersistState() {
    return {
        hashes: Object.create(null),
        meta: Object.create(null),
        mapRefs: Object.create(null),
        mapIndex: Object.create(null),
        blobAt: Object.create(null),
        blobDirty: Object.create(null),
        lastFullCheckAt: 0
    };
}

/**
 * Запоминает текущее содержимое store как уже записанное в MySQL (сразу после hydrate),
 * чтобы первое изменение не вызывало полную перезапись базы.
 */
function primePersistState(store) {
    var state = createPersistState();
    var relational = (store && store.__relationalMapOrgs) || {};
    buildSections(store || {}).forEach(function (s) {
        state.meta[s.key] = { kind: s.kind, orgId: s.orgId };
        if (s.kind === 'map' && Array.isArray(s.payload)) {
            var ser = serializeMapItems(s.payload, s.orgId);
            state.hashes[s.key] = hashJson(ser.json);
            // Карта из blob-фолбэка: таблицы не совпадают с ней, первое сохранение — только полная перезапись.
            state.mapIndex[s.orgId] = relational[s.orgId] ? toStoredIndex(ser.index) : null;
            state.mapRefs[s.orgId] = { ref: s.payload, len: s.payload.length };
            return;
        }
        state.hashes[s.key] = hashJson(JSON.stringify(s.payload));
    });
    state.lastFullCheckAt = Date.now();
    return state;
}

/**
 * Пишет в MySQL только изменившиеся разделы store (одной транзакцией).
 * opts.full — переписать всё с очисткой таблиц (миграция / восстановление).
 * @returns {Promise<{sections: string[], ms: number, statements: number, rows: number}>}
 */
async function persistStoreIncremental(store, state, opts) {
    opts = opts || {};
    if (!store) return { sections: [], ms: 0, statements: 0, rows: 0 };
    state = state || createPersistState();
    var t0 = Date.now();
    var full = !!opts.full;
    var fullCheck = full || !state.lastFullCheckAt || (t0 - state.lastFullCheckAt) >= MAP_FULL_CHECK_INTERVAL_MS;
    var sections = buildSections(store);
    var present = Object.create(null);
    sections.forEach(function (s) { present[s.key] = true; });
    Object.keys(state.meta).forEach(function (key) {
        if (present[key]) return;
        var meta = state.meta[key];
        sections.push({ key: key, kind: meta.kind, orgId: meta.orgId, payload: emptyPayloadFor(meta.kind), removed: true });
    });

    var changed = [];
    var refUpdates = [];
    sections.forEach(function (s) {
        if (s.kind === 'map' && !fullCheck && !s.removed) {
            var r = state.mapRefs[s.orgId];
            if (r && r.ref === s.payload && r.len === s.payload.length && state.hashes[s.key]) return;
        }
        var isMap = s.kind === 'map' && Array.isArray(s.payload);
        var ser = isMap ? serializeMapItems(s.payload, s.orgId) : null;
        var json = ser ? ser.json : JSON.stringify(s.payload);
        var hash = hashJson(json);
        if (!full && state.hashes[s.key] === hash) {
            if (isMap) {
                refUpdates.push(s);
                if (state.blobDirty[s.orgId] && (t0 - (state.blobAt[s.orgId] || 0)) >= MAP_BLOB_INTERVAL_MS) {
                    s.json = json;
                    s.hash = hash;
                    s.blobOnly = true;
                    changed.push(s);
                }
            }
            return;
        }
        if (isMap) {
            s.json = json;
            s.skipRelationalMap = !!opts.skipRelationalMap;
            s.mapIndex = ser.index;
            if (!full && !s.removed) s.mapDiff = computeMapDiff(state.mapIndex[s.orgId], ser.index);
            var blobAt = state.blobAt[s.orgId] || 0;
            s.skipBlob = !!s.mapDiff && (t0 - blobAt) < MAP_BLOB_INTERVAL_MS;
        }
        s.hash = hash;
        changed.push(s);
    });
    refUpdates.forEach(function (s) {
        state.mapRefs[s.orgId] = { ref: s.payload, len: s.payload.length };
    });
    if (fullCheck) state.lastFullCheckAt = t0;
    if (!changed.length) return { sections: [], ms: Date.now() - t0, statements: 0, rows: 0 };

    var batchStats = null;
    await withTransaction(async function (rawConn) {
        var conn = createBatchingConn(rawConn);
        batchStats = conn.stats;
        await conn.query('SET FOREIGN_KEY_CHECKS=0');
        if (full) {
            for (var gi = 0; gi < GLOBAL_TABLES_FULL_RESET.length; gi++) {
                await conn.query('DELETE FROM `' + GLOBAL_TABLES_FULL_RESET[gi] + '`');
            }
        }
        changed.sort(function (a, b) {
            if (a.kind === 'organizations') return -1;
            if (b.kind === 'organizations') return 1;
            return 0;
        });
        for (var i = 0; i < changed.length; i++) {
            var s = changed[i];
            await SECTION_WRITERS[s.kind](conn, s.payload, s.orgId, s);
        }
        await conn.flush();
        await conn.query('SET FOREIGN_KEY_CHECKS=1');
    });

    changed.forEach(function (s) {
        if (s.removed) {
            delete state.hashes[s.key];
            delete state.meta[s.key];
            if (s.kind === 'map') {
                delete state.mapRefs[s.orgId];
                delete state.mapIndex[s.orgId];
                delete state.blobAt[s.orgId];
                delete state.blobDirty[s.orgId];
            }
            return;
        }
        if (s.kind === 'map') {
            if (s.blobWritten) {
                state.blobAt[s.orgId] = t0;
                state.blobDirty[s.orgId] = false;
            } else {
                state.blobDirty[s.orgId] = true;
            }
            if (s.blobOnly) return;
        }
        state.hashes[s.key] = s.hash;
        state.meta[s.key] = { kind: s.kind, orgId: s.orgId };
        if (s.kind === 'map' && Array.isArray(s.payload)) {
            state.mapRefs[s.orgId] = { ref: s.payload, len: s.payload.length };
            state.mapIndex[s.orgId] = s.skipRelationalMap ? null : toStoredIndex(s.mapIndex);
        }
    });
    return {
        sections: changed.map(function (s) {
            if (s.blobOnly) return s.key + ' (резервная копия)';
            if (s.mapDiff) {
                var d = s.mapDiff;
                return s.key + ' (' + (d.changedItems.length + d.generatedItems.length) + ' изм., ' +
                    (d.affectedObjectUids.length + d.affectedCableUids.length) + ' затронуто)';
            }
            return s.key;
        }),
        ms: Date.now() - t0,
        statements: batchStats ? batchStats.statements : 0,
        rows: batchStats ? batchStats.rows : 0
    };
}

/** Полная перезапись всего store (миграция JSON → MySQL, восстановление снимка). */
async function persistStoreToMysql(store, opts) {
    opts = opts || {};
    return persistStoreIncremental(store, createPersistState(), {
        full: true,
        skipRelationalMap: !!opts.skipRelationalMap
    });
}

async function persistOrgMap(orgId, mapData) {
    await withTransaction(async function (rawConn) {
        var conn = createBatchingConn(rawConn);
        await writeOrgMap(conn, mapData || [], orgId, null);
        await conn.flush();
    });
}

module.exports = {
    hydrateStoreFromMysql,
    persistStoreToMysql,
    persistStoreIncremental,
    createPersistState,
    primePersistState,
    persistOrgMap,
    emptyStore,
    toMysqlDate
};
