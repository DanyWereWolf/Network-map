'use strict';

/**
 * Persist / hydrate the in-memory store document to MySQL tables.
 */
const { query, withTransaction, getPool } = require('./mysql');
const mapAssemble = require('./map-assemble');

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
        passwordResetTokens: []
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
    for (var oi = 0; oi < store.organizations.length; oi++) {
        var orgId = store.organizations[oi].id;
        var assembled = await withTransaction(async function (conn) {
            return mapAssemble.assembleMapData(conn, orgId);
        });
        if (assembled && assembled.length) {
            store.mapDataByOrg[orgId] = assembled;
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

async function persistStoreToMysql(store, opts) {
    opts = opts || {};
    if (!store) return;
    await withTransaction(async function (conn) {
        // Organizations first
        await conn.query('SET FOREIGN_KEY_CHECKS=0');
        await conn.query('DELETE FROM password_reset_tokens');
        await conn.query('DELETE FROM support_messages');
        await conn.query('DELETE FROM support_threads');
        await conn.query('DELETE FROM visit_logs');
        await conn.query('DELETE FROM device_tokens');
        await conn.query('DELETE FROM pricing_plans');
        await conn.query('DELETE FROM org_chat_media');
        await conn.query('DELETE FROM org_chat_messages');
        await conn.query('DELETE FROM history_events');
        await conn.query('DELETE FROM user_themes');
        await conn.query('DELETE FROM user_map_start');
        await conn.query('DELETE FROM org_settings');
        await conn.query('DELETE FROM platform_settings');
        await conn.query('DELETE FROM sessions');
        await conn.query('DELETE FROM users');
        await conn.query('DELETE FROM org_map_blobs');
        // map relational cleared per-org below
        const [existingOrgs] = await conn.query('SELECT id FROM organizations');
        var keepOrg = {};
        (store.organizations || []).forEach(function (o) { keepOrg[o.id] = 1; });
        for (var ei = 0; ei < (existingOrgs || []).length; ei++) {
            var oid = existingOrgs[ei].id;
            if (!keepOrg[oid]) {
                await mapAssemble.clearOrgMapRows(conn, oid);
                await conn.query('DELETE FROM organizations WHERE id = ?', [oid]);
            }
        }

        for (var i = 0; i < (store.organizations || []).length; i++) {
            var o = store.organizations[i];
            await conn.query(
                `INSERT INTO organizations (
                    id, name, map_object_limit_unlocked, custom_map_object_limit, max_concurrent_users,
                    status, contact_email, two_factor_enabled, two_factor_secret, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE
                    name=VALUES(name), map_object_limit_unlocked=VALUES(map_object_limit_unlocked),
                    custom_map_object_limit=VALUES(custom_map_object_limit),
                    max_concurrent_users=VALUES(max_concurrent_users), status=VALUES(status),
                    contact_email=VALUES(contact_email), two_factor_enabled=VALUES(two_factor_enabled),
                    two_factor_secret=VALUES(two_factor_secret)`,
                [
                    o.id, o.name || 'Организация',
                    o.mapObjectLimitUnlocked ? 1 : 0,
                    o.customMapObjectLimit != null ? o.customMapObjectLimit : null,
                    o.maxConcurrentUsers != null ? o.maxConcurrentUsers : null,
                    o.status || 'active',
                    o.contactEmail || null,
                    o.twoFactorEnabled ? 1 : 0,
                    o.twoFactorSecret || null,
                    toMysqlDate(o.createdAt) || toMysqlDate(new Date())
                ]
            );
        }

        for (var ui = 0; ui < (store.users || []).length; ui++) {
            var u = store.users[ui];
            await conn.query(
                `INSERT INTO users (
                    id, username, password_hash, full_name, role, status, email, organization_id,
                    avatar_updated_at, must_change_password, created_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    u.id, u.username, u.password || '',
                    u.fullName || u.full_name || null,
                    u.role || 'user', u.status || 'pending',
                    u.email || null, u.organizationId || null,
                    toMysqlDate(u.avatarUpdatedAt),
                    u.mustChangePassword ? 1 : 0,
                    toMysqlDate(u.createdAt) || toMysqlDate(new Date())
                ]
            );
        }

        for (var si = 0; si < (store.sessions || []).length; si++) {
            var s = store.sessions[si];
            if (!s || !s.token || !s.user_id) continue;
            var exp = toMysqlDate(s.expires_at);
            if (!exp) continue;
            await conn.query(
                'INSERT INTO sessions (token, user_id, organization_id, expires_at) VALUES (?,?,?,?)',
                [s.token, s.user_id, s.organization_id || null, exp]
            );
        }

        var settings = store.settings || {};
        for (var sk of Object.keys(settings)) {
            var sv = settings[sk];
            if (typeof sv === 'object') sv = JSON.stringify(sv);
            await conn.query(
                'INSERT INTO platform_settings (setting_key, setting_value) VALUES (?,?)',
                [sk, sv != null ? String(sv) : null]
            );
        }

        var settingsByOrg = store.settingsByOrg || {};
        for (var orgKey of Object.keys(settingsByOrg)) {
            var os = settingsByOrg[orgKey] || {};
            for (var osk of Object.keys(os)) {
                var osv = os[osk];
                await conn.query(
                    'INSERT INTO org_settings (org_id, setting_key, setting_value) VALUES (?,?,?)',
                    [orgKey, osk, typeof osv === 'string' ? osv : JSON.stringify(osv)]
                );
            }
        }

        // Maps
        var mapByOrg = store.mapDataByOrg || {};
        for (var mk of Object.keys(mapByOrg)) {
            var items = Array.isArray(mapByOrg[mk]) ? mapByOrg[mk] : [];
            await conn.query(
                'INSERT INTO org_map_blobs (org_id, map_json, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE map_json=VALUES(map_json), updated_at=VALUES(updated_at)',
                [mk, JSON.stringify(items), toMysqlDate(new Date())]
            );
            if (!opts.skipRelationalMap) {
                await mapAssemble.disassembleMapData(conn, mk, items);
            }
        }

        var histByOrg = store.historyByOrg || {};
        for (var hk of Object.keys(histByOrg)) {
            var hlist = histByOrg[hk] || [];
            for (var hi = 0; hi < hlist.length; hi++) {
                var h = hlist[hi];
                if (!h || !h.id) continue;
                await conn.query(
                    `INSERT INTO history_events (id, org_id, timestamp, action_type, action_name, icon, user_json, details_json)
                     VALUES (?,?,?,?,?,?,?,?)`,
                    [
                        h.id, hk, toMysqlDate(h.timestamp),
                        h.actionType || null, h.actionName || null, h.icon || null,
                        h.user ? JSON.stringify(h.user) : null,
                        h.details ? JSON.stringify(h.details) : null
                    ]
                );
            }
        }

        var chatByOrg = store.chatByOrg || {};
        for (var ck of Object.keys(chatByOrg)) {
            var clist = chatByOrg[ck] || [];
            for (var ci = 0; ci < clist.length; ci++) {
                var msg = clist[ci];
                if (!msg) continue;
                var mid = msg.id || ('chat_' + ck + '_' + ci);
                await conn.query(
                    'INSERT INTO org_chat_messages (id, org_id, payload_json, created_at) VALUES (?,?,?,?)',
                    [mid, ck, JSON.stringify(msg), toMysqlDate(msg.at || msg.createdAt || new Date())]
                );
            }
        }

        var mediaByOrg = store.chatMediaByOrg || {};
        for (var medK of Object.keys(mediaByOrg)) {
            var mlist = mediaByOrg[medK] || [];
            for (var mi = 0; mi < mlist.length; mi++) {
                var med = mlist[mi];
                if (!med) continue;
                var medId = med.id || ('media_' + medK + '_' + mi);
                await conn.query(
                    'INSERT INTO org_chat_media (id, org_id, payload_json) VALUES (?,?,?)',
                    [medId, medK, JSON.stringify(med)]
                );
            }
        }

        for (var pi = 0; pi < (store.pricingPlans || []).length; pi++) {
            var plan = store.pricingPlans[pi];
            if (!plan || !plan.id) continue;
            await conn.query(
                'INSERT INTO pricing_plans (id, payload_json, sort_order) VALUES (?,?,?)',
                [plan.id, JSON.stringify(plan), plan.order != null ? plan.order : pi]
            );
        }

        for (var vi = 0; vi < (store.visitLogs || []).length; vi++) {
            var v = store.visitLogs[vi];
            await conn.query(
                `INSERT INTO visit_logs (at_time, username, user_id, organization_id, ip, source, user_agent)
                 VALUES (?,?,?,?,?,?,?)`,
                [toMysqlDate(v.at), v.username || null, v.userId || null, v.organizationId || null, v.ip || null, v.source || null, v.userAgent || null]
            );
        }

        for (var di = 0; di < (store.deviceTokens || []).length; di++) {
            var dt = store.deviceTokens[di];
            if (!dt || !dt.token) continue;
            await conn.query(
                'INSERT INTO device_tokens (user_id, org_id, token, platform, updated_at) VALUES (?,?,?,?,?)',
                [dt.userId || '', dt.orgId || null, dt.token, dt.platform || null, toMysqlDate(dt.updatedAt || new Date())]
            );
        }

        for (var ti = 0; ti < (store.supportThreads || []).length; ti++) {
            var th = store.supportThreads[ti];
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

        for (var pri = 0; pri < (store.passwordResetTokens || []).length; pri++) {
            var pr = store.passwordResetTokens[pri];
            if (!pr || !pr.token) continue;
            var prExp = toMysqlDate(pr.expiresAt);
            if (!prExp) continue;
            var rest = Object.assign({}, pr);
            delete rest.token;
            delete rest.userId;
            delete rest.expiresAt;
            await conn.query(
                'INSERT INTO password_reset_tokens (token, user_id, expires_at, payload_json) VALUES (?,?,?,?)',
                [pr.token, pr.userId || '', prExp, Object.keys(rest).length ? JSON.stringify(rest) : null]
            );
        }

        // user map starts / themes from settings
        try {
            var starts = JSON.parse(store.settings && store.settings.userMapStarts || '{}');
            for (var uid of Object.keys(starts || {})) {
                await conn.query(
                    'INSERT INTO user_map_start (user_id, payload_json) VALUES (?,?)',
                    [uid, JSON.stringify(starts[uid])]
                );
            }
        } catch (e) {}
        try {
            var themes = JSON.parse(store.settings && store.settings.userThemes || '{}');
            for (var tuid of Object.keys(themes || {})) {
                await conn.query(
                    'INSERT INTO user_themes (user_id, theme) VALUES (?,?)',
                    [tuid, themes[tuid]]
                );
            }
        } catch (e2) {}

        await conn.query('SET FOREIGN_KEY_CHECKS=1');
    });
}

async function persistOrgMap(orgId, mapData) {
    await withTransaction(async function (conn) {
        await conn.query(
            `INSERT INTO org_map_blobs (org_id, map_json, updated_at) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE map_json=VALUES(map_json), updated_at=VALUES(updated_at)`,
            [orgId, JSON.stringify(mapData || []), toMysqlDate(new Date())]
        );
        await mapAssemble.disassembleMapData(conn, orgId, mapData || []);
    });
}

module.exports = {
    hydrateStoreFromMysql,
    persistStoreToMysql,
    persistOrgMap,
    emptyStore,
    toMysqlDate
};
