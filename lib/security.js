const crypto = require('crypto');
const speakeasy = require('speakeasy');

const DEFAULT_RATE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RATE_MAX = 20;
const PENDING_LOGIN_TTL_MS = 5 * 60 * 1000;

const rateBuckets = new Map();
const pendingLogins = new Map();

function pruneRateBuckets(now) {
    if (rateBuckets.size < 5000) return;
    rateBuckets.forEach(function(entry, key) {
        if (!entry || entry.resetAt <= now) rateBuckets.delete(key);
    });
}

function checkRateLimit(key, options) {
    const windowMs = (options && options.windowMs) || DEFAULT_RATE_WINDOW_MS;
    const maxAttempts = (options && options.maxAttempts) || DEFAULT_RATE_MAX;
    const now = Date.now();
    pruneRateBuckets(now);
    var bucketKey = String(key || 'unknown');
    var entry = rateBuckets.get(bucketKey);
    if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        rateBuckets.set(bucketKey, entry);
    }
    entry.count += 1;
    if (entry.count > maxAttempts) {
        var retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        return { ok: false, retryAfterSec: retryAfterSec };
    }
    return { ok: true, remaining: Math.max(0, maxAttempts - entry.count) };
}

function isTurnstileConfigured(config) {
    const secret = (config && config.turnstileSecretKey) || process.env.TURNSTILE_SECRET_KEY || '';
    return !!String(secret).trim();
}

function getTurnstileSiteKey(config) {
    return String((config && config.turnstileSiteKey) || process.env.TURNSTILE_SITE_KEY || '').trim();
}

function verifyTurnstile(token, remoteIp, config) {
    if (!isTurnstileConfigured(config)) return Promise.resolve({ ok: true, skipped: true });
    const secret = String((config && config.turnstileSecretKey) || process.env.TURNSTILE_SECRET_KEY || '').trim();
    if (!token || !String(token).trim()) {
        return Promise.resolve({ ok: false, error: 'Подтвердите, что вы не робот' });
    }
    const body = new URLSearchParams({
        secret: secret,
        response: String(token).trim()
    });
    if (remoteIp) body.set('remoteip', String(remoteIp));
    return fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data && data.success) return { ok: true };
        return { ok: false, error: 'Проверка капчи не пройдена. Обновите страницу и попробуйте снова.' };
    }).catch(function() {
        return { ok: false, error: 'Сервис капчи недоступен. Попробуйте позже.' };
    });
}

function generateTotpSecret(label) {
    const secret = speakeasy.generateSecret({
        name: label || 'Network Map',
        length: 20
    });
    return {
        base32: secret.base32,
        otpauthUrl: secret.otpauth_url || ''
    };
}

function verifyTotpCode(secretBase32, token) {
    if (!secretBase32 || !token) return false;
    return speakeasy.totp.verify({
        secret: String(secretBase32),
        encoding: 'base32',
        token: String(token).replace(/\s/g, ''),
        window: 1
    });
}

function prunePendingLogins(now) {
    pendingLogins.forEach(function(entry, id) {
        if (!entry || entry.expiresAt <= now) pendingLogins.delete(id);
    });
}

function createPendingLogin(payload) {
    prunePendingLogins(Date.now());
    const id = 'pl_' + crypto.randomBytes(16).toString('hex');
    pendingLogins.set(id, {
        userId: payload.userId,
        organizationId: payload.organizationId || null,
        expiresAt: Date.now() + PENDING_LOGIN_TTL_MS
    });
    return id;
}

function consumePendingLogin(pendingId, userId) {
    prunePendingLogins(Date.now());
    const entry = pendingLogins.get(String(pendingId || ''));
    if (!entry || entry.expiresAt <= Date.now()) {
        if (entry) pendingLogins.delete(String(pendingId));
        return null;
    }
    if (userId != null && String(entry.userId) !== String(userId)) return null;
    pendingLogins.delete(String(pendingId));
    return entry;
}

function orgRequiresTotp(org) {
    return !!(org && org.twoFactorEnabled && org.twoFactorSecret);
}

module.exports = {
    checkRateLimit: checkRateLimit,
    isTurnstileConfigured: isTurnstileConfigured,
    getTurnstileSiteKey: getTurnstileSiteKey,
    verifyTurnstile: verifyTurnstile,
    generateTotpSecret: generateTotpSecret,
    verifyTotpCode: verifyTotpCode,
    createPendingLogin: createPendingLogin,
    consumePendingLogin: consumePendingLogin,
    orgRequiresTotp: orgRequiresTotp
};
