/**
 * Медиафайлы для новостей: data/news-media/{mediaId}.{ext}
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEDIA_ROOT = path.join(__dirname, 'data', 'news-media');
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
const FILE_MAX_BYTES = 20 * 1024 * 1024;

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTS = ['.mp4', '.webm', '.ogg'];
const FILE_EXTS = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.txt', '.csv', '.rtf', '.zip', '.rar', '.7z',
    '.json', '.xml'
].concat(IMAGE_EXTS, VIDEO_EXTS);

const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/ogg': '.ogg',
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

function ensureDir() {
    if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });
}

function normalizeExt(raw) {
    const e = String(raw || '').toLowerCase().replace(/^\./, '');
    if (e === 'jpg' || e === 'jpeg') return '.jpg';
    if (e === 'png') return '.png';
    if (e === 'webp') return '.webp';
    if (e === 'gif') return '.gif';
    if (e === 'mp4') return '.mp4';
    if (e === 'webm') return '.webm';
    if (e === 'ogg') return '.ogg';
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

function mimeForExt(ext) {
    const e = String(ext || '').toLowerCase();
    const map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.ogg': 'video/ogg',
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

function extFromFilename(name) {
    const m = String(name || '').match(/(\.[a-z0-9]{1,8})$/i);
    return m ? normalizeExt(m[1]) : null;
}

function mediaFilePath(mediaId, ext) {
    const safeExt = normalizeExt(String(ext || '').replace(/^\./, '')) || '.bin';
    return path.join(MEDIA_ROOT, String(mediaId) + safeExt);
}

function generateMediaId() {
    return 'nm_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

function parsePayload(body) {
    if (!body || typeof body !== 'object') return null;
    const kind = String(body.kind || 'image').toLowerCase();
    let dataUrl = body.dataUrl || body.file;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    dataUrl = dataUrl.trim();
    const m = /^data:([^;]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!m) return null;

    const mime = String(m[1]).toLowerCase().split(':').pop();
    let ext = MIME_TO_EXT[mime] || extFromFilename(body.name);
    if (!ext) return null;

    let maxBytes = FILE_MAX_BYTES;
    let allowed = FILE_EXTS;
    if (kind === 'image') {
        maxBytes = IMAGE_MAX_BYTES;
        allowed = IMAGE_EXTS;
    } else if (kind === 'video') {
        maxBytes = VIDEO_MAX_BYTES;
        allowed = VIDEO_EXTS;
    }
    if (allowed.indexOf(ext) === -1) return null;

    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch (e) {
        return null;
    }
    if (!buf.length || buf.length > maxBytes) return null;

    const name = String(body.name || 'file' + ext).replace(/[/\\?%*:|"<>]/g, '_').trim().slice(0, 120) || ('file' + ext);
    return {
        ext: ext,
        buffer: buf,
        mime: mimeForExt(ext),
        kind: kind === 'video' ? 'video' : (kind === 'file' ? 'file' : 'image'),
        size: buf.length,
        name: name
    };
}

function saveMedia(mediaId, buffer, ext) {
    ensureDir();
    const filePath = mediaFilePath(mediaId, ext);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

function findMediaFile(mediaId, extHint) {
    if (!mediaId) return null;
    const base = path.join(MEDIA_ROOT, String(mediaId));
    if (extHint) {
        const p = base + normalizeExt(String(extHint).replace(/^\./, ''));
        if (fs.existsSync(p)) return p;
    }
    for (let i = 0; i < FILE_EXTS.length; i++) {
        const p = base + FILE_EXTS[i];
        if (fs.existsSync(p)) return p;
    }
    const bin = base + '.bin';
    if (fs.existsSync(bin)) return bin;
    return null;
}

function getMediaApiPath(mediaId, ext) {
    const safeExt = normalizeExt(String(ext || '').replace(/^\./, '')) || '.bin';
    return '/api/news-media/file/' + encodeURIComponent(String(mediaId)) + safeExt;
}

function mediaIdFromRouteParam(param) {
    var s = String(param || '');
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\.[a-z0-9]{1,8}$/i, '');
}

function shouldInline(mime, ext, kind) {
    if (kind === 'image') return true;
    const e = String(ext || '').toLowerCase();
    if (IMAGE_EXTS.indexOf(e) >= 0) return true;
    return !!(mime && String(mime).toLowerCase().indexOf('image/') === 0);
}

function isVideoExt(ext) {
    const e = String(ext || '').toLowerCase();
    return VIDEO_EXTS.indexOf(e) >= 0;
}

function safeDownloadName(name, ext) {
    var base = String(name || 'file').replace(/[/\\?%*:|"<>]/g, '_').trim();
    if (!base) base = 'file';
    const e = normalizeExt(String(ext || '').replace(/^\./, ''));
    if (e && !base.toLowerCase().endsWith(e)) base += e;
    return base.slice(0, 120);
}

module.exports = {
    IMAGE_MAX_BYTES,
    VIDEO_MAX_BYTES,
    FILE_MAX_BYTES,
    parsePayload,
    saveMedia,
    findMediaFile,
    getMediaApiPath,
    mediaIdFromRouteParam,
    mimeForExt,
    normalizeExt,
    generateMediaId,
    shouldInline,
    isVideoExt,
    safeDownloadName
};
