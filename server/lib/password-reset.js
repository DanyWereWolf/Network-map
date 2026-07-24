const crypto = require('crypto');
const db = require('../database');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isGlobalAdminUser(user) {
    return !!(user && user.role === 'admin' && !user.organizationId);
}

function resolveUserEmail(user, serverConfig) {
    if (!user) return null;
    if (user.email && isValidEmail(user.email)) return String(user.email).trim();
    if (user.organizationId) {
        const org = db.getOrganization(user.organizationId);
        if (org && org.contactEmail && isValidEmail(org.contactEmail)) {
            return String(org.contactEmail).trim();
        }
    }
    if (isGlobalAdminUser(user)) {
        const adminEmail = (serverConfig && serverConfig.adminEmail) || process.env.ADMIN_EMAIL || '';
        if (isValidEmail(adminEmail)) return String(adminEmail).trim();
    }
    return null;
}

function findUserForPasswordReset(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return null;
    const users = db.getUsers();
    if (trimmed.includes('@')) {
        const emailLower = trimmed.toLowerCase();
        const byUserEmail = users.filter(function(u) {
            return u.email && String(u.email).trim().toLowerCase() === emailLower;
        });
        if (byUserEmail.length === 1) return byUserEmail[0];
        if (byUserEmail.length > 1) return null;
        const orgs = db.getOrganizations().filter(function(o) {
            return o.contactEmail && String(o.contactEmail).trim().toLowerCase() === emailLower;
        });
        if (orgs.length !== 1) return null;
        const orgId = orgs[0].id;
        const orgUsers = users.filter(function(u) {
            return u.organizationId === orgId && u.status !== 'rejected' && u.status !== 'pending';
        });
        if (orgUsers.length === 0) return null;
        const admin = orgUsers.find(function(u) { return u.role === 'admin'; });
        return admin || orgUsers[0];
    }
    return users.find(function(u) {
        return u.username && u.username.toLowerCase() === trimmed.toLowerCase();
    }) || null;
}

function canResetPassword(user) {
    if (!user) return false;
    if (user.status === 'pending' || user.status === 'rejected') return false;
    return true;
}

function createResetToken(userId) {
    db.purgeExpiredPasswordResetTokens();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    db.addPasswordResetToken({ token: token, userId: userId, expiresAt: expiresAt });
    return token;
}

function consumeResetToken(token) {
    db.purgeExpiredPasswordResetTokens();
    const entry = db.getPasswordResetToken(token);
    if (!entry) return null;
    db.deletePasswordResetToken(token);
    return entry;
}

function buildResetEmail(siteUrl, token, username) {
    const base = String(siteUrl || '').trim().replace(/\/$/, '');
    const link = base ? (base + '/auth.html?reset=' + encodeURIComponent(token)) : ('/auth.html?reset=' + encodeURIComponent(token));
    const subject = 'Восстановление пароля — Карта оптической сети';
    const text = [
        'Здравствуйте!',
        '',
        'Вы запросили восстановление пароля для учётной записи «' + username + '» на volsmap.ru.',
        '',
        'Перейдите по ссылке, чтобы задать новый пароль (ссылка действует 1 час):',
        link,
        '',
        'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.',
        '',
        '— Карта оптической сети (volsmap.ru)'
    ].join('\n');
    const html = [
        '<p>Здравствуйте!</p>',
        '<p>Вы запросили восстановление пароля для учётной записи <strong>' + escapeHtml(username) + '</strong> на volsmap.ru.</p>',
        '<p><a href="' + escapeHtml(link) + '">Задать новый пароль</a></p>',
        '<p style="color:#64748b;font-size:14px;">Ссылка действует 1 час. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>',
        '<p style="color:#64748b;font-size:14px;">— Карта оптической сети (volsmap.ru)</p>'
    ].join('');
    return { subject: subject, text: text, html: html };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Маска для UI: support@volsmap.ru → s***@volsmap.ru */
function maskEmail(email) {
    const raw = String(email || '').trim();
    const at = raw.indexOf('@');
    if (at < 1) return '';
    const local = raw.slice(0, at);
    const domain = raw.slice(at + 1);
    if (!domain) return '';
    const visible = local.charAt(0);
    return visible + '***@' + domain;
}

module.exports = {
    RESET_TOKEN_TTL_MS: RESET_TOKEN_TTL_MS,
    isValidEmail: isValidEmail,
    resolveUserEmail: resolveUserEmail,
    findUserForPasswordReset: findUserForPasswordReset,
    canResetPassword: canResetPassword,
    createResetToken: createResetToken,
    consumeResetToken: consumeResetToken,
    buildResetEmail: buildResetEmail,
    maskEmail: maskEmail
};
