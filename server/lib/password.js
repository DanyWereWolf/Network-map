const argon2 = require('argon2');

const LEGACY_HASH_RE = /^hash_[0-9a-f]+_\d+$/;

/** @deprecated Старый алгоритм — только для проверки при миграции. */
function legacyHashPassword(password) {
    const pwd = String(password);
    let hash = 0;
    for (let i = 0; i < pwd.length; i++) {
        hash = (hash << 5) - hash + pwd.charCodeAt(i);
        hash = hash & hash;
    }
    return 'hash_' + Math.abs(hash).toString(16) + '_' + pwd.length;
}

function isLegacyPasswordHash(stored) {
    return typeof stored === 'string' && LEGACY_HASH_RE.test(stored);
}

async function hashPassword(password) {
    if (password == null || password === '') throw new Error('password required');
    return argon2.hash(String(password), { type: argon2.argon2id });
}

async function verifyPassword(password, storedHash) {
    if (!storedHash || password == null || password === '') return false;
    const stored = String(storedHash);
    if (isLegacyPasswordHash(stored)) {
        return stored === legacyHashPassword(password);
    }
    try {
        return await argon2.verify(stored, String(password));
    } catch (_) {
        return false;
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    isLegacyPasswordHash,
    legacyHashPassword
};
