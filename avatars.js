/**
 * Хранение аватаров пользователей в data/avatars/{userId}.{ext}
 */
const fs = require('fs');
const path = require('path');

const AVATARS_DIR = path.join(__dirname, 'data', 'avatars');
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function ensureAvatarsDir() {
    if (!fs.existsSync(AVATARS_DIR)) {
        fs.mkdirSync(AVATARS_DIR, { recursive: true });
    }
}

function avatarPathForUser(userId, ext) {
    return path.join(AVATARS_DIR, String(userId) + ext);
}

function stripAvatarExtension(id) {
    return String(id || '').replace(/\.(jpe?g|png|webp|gif)$/i, '');
}

function findAvatarFile(userId) {
    if (userId == null || userId === '') return null;
    const id = stripAvatarExtension(userId);
    const direct = path.join(AVATARS_DIR, String(userId));
    if (fs.existsSync(direct)) {
        try {
            if (fs.statSync(direct).isFile()) return direct;
        } catch (e) {}
    }
    const base = path.join(AVATARS_DIR, id);
    for (let i = 0; i < AVATAR_EXTS.length; i++) {
        const p = base + AVATAR_EXTS[i];
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function userHasAvatar(userId) {
    return !!findAvatarFile(userId);
}

function mimeForExt(ext) {
    const e = String(ext || '').toLowerCase();
    if (e === '.png') return 'image/png';
    if (e === '.webp') return 'image/webp';
    if (e === '.gif') return 'image/gif';
    return 'image/jpeg';
}

function normalizeExt(raw) {
    const e = String(raw || '').toLowerCase().replace(/^\./, '');
    if (e === 'jpg' || e === 'jpeg') return '.jpg';
    if (e === 'png') return '.png';
    if (e === 'webp') return '.webp';
    if (e === 'gif') return '.gif';
    return null;
}

function parseAvatarPayload(body) {
    if (!body || typeof body !== 'object') return null;
    let dataUrl = body.dataUrl || body.image || body.avatar;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    dataUrl = dataUrl.trim();
    const m = /^data:image\/([\w+.-]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!m) return null;
    const ext = normalizeExt(m[1].replace(/jpeg/i, 'jpg'));
    if (!ext) return null;
    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch (e) {
        return null;
    }
    if (!buf.length || buf.length > AVATAR_MAX_BYTES) return null;
    return { ext: ext, buffer: buf, mime: mimeForExt(ext) };
}

function removeAvatarFiles(userId) {
    ensureAvatarsDir();
    const base = path.join(AVATARS_DIR, String(userId));
    AVATAR_EXTS.forEach(function(ext) {
        try {
            if (fs.existsSync(base + ext)) fs.unlinkSync(base + ext);
        } catch (e) {}
    });
}

function saveUserAvatar(userId, buffer, ext) {
    ensureAvatarsDir();
    removeAvatarFiles(userId);
    const safeExt = normalizeExt(ext.replace(/^\./, '')) || '.jpg';
    const filePath = avatarPathForUser(userId, safeExt);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

function getAvatarApiPath(userId, avatarUpdatedAt) {
    if (!userHasAvatar(userId)) return null;
    const file = findAvatarFile(userId);
    if (!file) return null;
    const ext = path.extname(file);
    let url = '/api/avatars/' + encodeURIComponent(String(userId)) + ext;
    if (avatarUpdatedAt) url += '?v=' + encodeURIComponent(String(avatarUpdatedAt));
    return url;
}

module.exports = {
    AVATAR_MAX_BYTES,
    findAvatarFile,
    userHasAvatar,
    parseAvatarPayload,
    saveUserAvatar,
    removeAvatarFiles,
    getAvatarApiPath,
    mimeForExt
};
