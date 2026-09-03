const crypto = require('crypto');
const db = require('../database');
const passwordReset = require('./password-reset');

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function isEmailVerified(user) {
    if (!user) return false;
    // Старые и созданные админом учётки без поля считаем подтверждёнными
    if (user.emailVerified === undefined || user.emailVerified === null) return true;
    return !!user.emailVerified;
}

function findUserForEmailVerify(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return null;
    const users = db.getUsers();
    if (trimmed.includes('@')) {
        const emailLower = trimmed.toLowerCase();
        const matches = users.filter(function(u) {
            return u.email && String(u.email).trim().toLowerCase() === emailLower
                && u.status !== 'rejected'
                && !isEmailVerified(u);
        });
        if (matches.length === 1) return matches[0];
        return null;
    }
    return users.find(function(u) {
        return u.username && u.username.toLowerCase() === trimmed.toLowerCase();
    }) || null;
}

function canResendVerification(user) {
    if (!user) return false;
    if (user.status === 'rejected') return false;
    return !isEmailVerified(user);
}

function createVerifyToken(userId) {
    db.purgeExpiredEmailVerificationTokens();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS).toISOString();
    db.addEmailVerificationToken({ token: token, userId: userId, expiresAt: expiresAt });
    return token;
}

function consumeVerifyToken(token) {
    db.purgeExpiredEmailVerificationTokens();
    const entry = db.getEmailVerificationToken(token);
    if (!entry) return null;
    db.deleteEmailVerificationToken(token);
    return entry;
}

function buildVerifyEmail(siteUrl, token, username) {
    const base = String(siteUrl || '').trim().replace(/\/$/, '');
    const link = base
        ? (base + '/auth.html?verify=' + encodeURIComponent(token))
        : ('/auth.html?verify=' + encodeURIComponent(token));
    const subject = 'Подтверждение e-mail — Карта оптической сети';
    const text = [
        'Здравствуйте!',
        '',
        'Вы зарегистрировали учётную запись «' + username + '» на volsmap.ru.',
        '',
        'Подтвердите e-mail, перейдя по ссылке (действует 24 часа):',
        link,
        '',
        'Если вы не регистрировались, просто проигнорируйте это письмо.',
        '',
        '— Карта оптической сети (volsmap.ru)'
    ].join('\n');
    const html = [
        '<p>Здравствуйте!</p>',
        '<p>Вы зарегистрировали учётную запись <strong>' + escapeHtml(username) + '</strong> на volsmap.ru.</p>',
        '<p><a href="' + escapeHtml(link) + '">Подтвердить e-mail</a></p>',
        '<p style="color:#64748b;font-size:14px;">Ссылка действует 24 часа. Если вы не регистрировались, проигнорируйте это письмо.</p>',
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

module.exports = {
    VERIFY_TOKEN_TTL_MS: VERIFY_TOKEN_TTL_MS,
    isEmailVerified: isEmailVerified,
    findUserForEmailVerify: findUserForEmailVerify,
    canResendVerification: canResendVerification,
    createVerifyToken: createVerifyToken,
    consumeVerifyToken: consumeVerifyToken,
    buildVerifyEmail: buildVerifyEmail,
    maskEmail: passwordReset.maskEmail,
    isValidEmail: passwordReset.isValidEmail
};
