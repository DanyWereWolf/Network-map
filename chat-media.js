/**
 * Медиа чата организации: data/chat-media/{orgId}/{mediaId}.{ext}
 */
const fs = require('fs');
const path = require('path');

const MEDIA_ROOT = path.join(__dirname, 'data', 'chat-media');
const STICKER_MAX_BYTES = 2 * 1024 * 1024;
const GIF_MAX_BYTES = 8 * 1024 * 1024;
const FILE_MAX_BYTES = 15 * 1024 * 1024;
const STICKER_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const GIF_EXTS = ['.gif'];
const FILE_EXTS = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.rtf', '.zip', '.rar', '.7z',
    '.json', '.xml', '.jpg', '.jpeg', '.png', '.webp', '.gif'
];
const ALL_MEDIA_EXTS = STICKER_EXTS.concat(
    GIF_EXTS.filter(function(e) { return STICKER_EXTS.indexOf(e) === -1; }),
    FILE_EXTS.filter(function(e) { return STICKER_EXTS.indexOf(e) === -1 && GIF_EXTS.indexOf(e) === -1; })
);

const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-powerpoint': '.ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'application/rtf': '.rtf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'application/json': '.json',
    'application/xml': '.xml',
    'text/xml': '.xml'
};

function ensureOrgDir(orgId) {
    const dir = path.join(MEDIA_ROOT, String(orgId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function mediaFilePath(orgId, mediaId, ext) {
    const safeExt = normalizeExt(ext.replace(/^\./, '')) || '.bin';
    return path.join(MEDIA_ROOT, String(orgId), String(mediaId) + safeExt);
}

function mimeForExt(ext) {
    const e = String(ext || '').toLowerCase();
    const map = {
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.rtf': 'application/rtf',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.json': 'application/json',
        '.xml': 'application/xml'
    };
    return map[e] || 'application/octet-stream';
}

function normalizeExt(raw) {
    const e = String(raw || '').toLowerCase().replace(/^\./, '');
    if (e === 'jpg' || e === 'jpeg') return '.jpg';
    if (e === 'png') return '.png';
    if (e === 'webp') return '.webp';
    if (e === 'gif') return '.gif';
    if (e === 'pdf') return '.pdf';
    if (e === 'doc') return '.doc';
    if (e === 'docx') return '.docx';
    if (e === 'xls') return '.xls';
    if (e === 'xlsx') return '.xlsx';
    if (e === 'ppt') return '.ppt';
    if (e === 'pptx') return '.pptx';
    if (e === 'txt') return '.txt';
    if (e === 'csv') return '.csv';
    if (e === 'rtf') return '.rtf';
    if (e === 'zip') return '.zip';
    if (e === 'rar') return '.rar';
    if (e === '7z') return '.7z';
    if (e === 'json') return '.json';
    if (e === 'xml') return '.xml';
    return null;
}

function extFromFilename(name) {
    const m = String(name || '').match(/(\.[a-z0-9]{1,8})$/i);
    return m ? normalizeExt(m[1]) : null;
}

function allowedExtsForKind(kind) {
    if (kind === 'gif') return GIF_EXTS;
    if (kind === 'file') return FILE_EXTS;
    return STICKER_EXTS;
}

function parseImagePayload(body, kind) {
    if (!body || typeof body !== 'object') return null;
    const k = kind === 'gif' ? 'gif' : 'sticker';
    const maxBytes = k === 'gif' ? GIF_MAX_BYTES : STICKER_MAX_BYTES;
    const allowed = allowedExtsForKind(k);

    let dataUrl = body.dataUrl || body.image || body.file;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    dataUrl = dataUrl.trim();
    const m = /^data:image\/([\w+.-]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!m) return null;
    const ext = normalizeExt(m[1].replace(/jpeg/i, 'jpg'));
    if (!ext || allowed.indexOf(ext) === -1) return null;
    if (k === 'gif' && ext !== '.gif') return null;

    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch (e) {
        return null;
    }
    if (!buf.length || buf.length > maxBytes) return null;
    return { ext: ext, buffer: buf, mime: mimeForExt(ext), kind: k, size: buf.length };
}

function parseFilePayload(body) {
    if (!body || typeof body !== 'object') return null;
    let dataUrl = body.dataUrl || body.file;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    dataUrl = dataUrl.trim();
    const m = /^data:([^;]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!m) return null;

    const mime = String(m[1]).toLowerCase().split(':').pop();
    let ext = MIME_TO_EXT[mime] || extFromFilename(body.name);
    if (!ext || FILE_EXTS.indexOf(ext) === -1) return null;

    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch (e) {
        return null;
    }
    if (!buf.length || buf.length > FILE_MAX_BYTES) return null;
    return { ext: ext, buffer: buf, mime: mimeForExt(ext), kind: 'file', size: buf.length };
}

function parseMediaPayload(body, kind) {
    if (kind === 'file') return parseFilePayload(body);
    return parseImagePayload(body, kind);
}

function saveOrgMedia(orgId, mediaId, buffer, ext) {
    ensureOrgDir(orgId);
    const filePath = mediaFilePath(orgId, mediaId, ext);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

function findMediaFile(orgId, mediaId, extHint) {
    if (!orgId || !mediaId) return null;
    const base = path.join(MEDIA_ROOT, String(orgId), String(mediaId));
    if (extHint) {
        const p = base + normalizeExt(extHint.replace(/^\./, ''));
        if (fs.existsSync(p)) return p;
    }
    for (let i = 0; i < ALL_MEDIA_EXTS.length; i++) {
        const p = base + ALL_MEDIA_EXTS[i];
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function removeMediaFile(orgId, mediaId, extHint) {
    const file = findMediaFile(orgId, mediaId, extHint);
    if (file) {
        try { fs.unlinkSync(file); } catch (e) {}
    }
}

function removeOrgStorage(orgId) {
    const dir = path.join(MEDIA_ROOT, String(orgId));
    if (!fs.existsSync(dir)) return;
    try {
        fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) {
        try {
            const files = fs.readdirSync(dir);
            files.forEach(function(f) {
                try { fs.unlinkSync(path.join(dir, f)); } catch (err) {}
            });
            fs.rmdirSync(dir);
        } catch (e2) {}
    }
}

function getMediaApiPath(mediaId, ext) {
    const safeExt = normalizeExt(String(ext || '').replace(/^\./, '')) || '.bin';
    return '/api/chat/media/file/' + encodeURIComponent(String(mediaId)) + safeExt;
}

function mediaIdFromRouteParam(param) {
    var s = String(param || '');
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\.[a-z0-9]{1,8}$/i, '');
}

function isImageMime(mime) {
    return !!(mime && String(mime).toLowerCase().indexOf('image/') === 0);
}

function isImageExt(ext) {
    const e = String(ext || '').toLowerCase();
    return e === '.jpg' || e === '.jpeg' || e === '.png' || e === '.webp' || e === '.gif';
}

function shouldInlineFile(item) {
    if (!item) return false;
    if (item.kind === 'sticker' || item.kind === 'gif') return true;
    if (item.kind === 'file' && (isImageMime(item.mime) || isImageExt(item.ext))) return true;
    return false;
}

function safeDownloadName(name, ext) {
    var base = String(name || 'file').replace(/[/\\?%*:|"<>]/g, '_').trim();
    if (!base) base = 'file';
    const e = normalizeExt(String(ext || '').replace(/^\./, ''));
    if (e && !base.toLowerCase().endsWith(e)) base += e;
    return base.slice(0, 120);
}

module.exports = {
    STICKER_MAX_BYTES,
    GIF_MAX_BYTES,
    FILE_MAX_BYTES,
    parseMediaPayload,
    saveOrgMedia,
    findMediaFile,
    removeMediaFile,
    removeOrgStorage,
    getMediaApiPath,
    mediaIdFromRouteParam,
    mimeForExt,
    normalizeExt,
    shouldInlineFile,
    safeDownloadName,
    isImageMime,
    isImageExt
};
