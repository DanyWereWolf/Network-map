/**
 * Фото объектов карты: data/object-media/{orgId}/{mediaId}.{ext}
 */
const fs = require('fs');
const path = require('path');

const MEDIA_ROOT = path.join(__dirname, '..', 'data', 'object-media');
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const OBJECT_MAX_BYTES = 5 * 1024 * 1024;
const ORG_MAX_BYTES = (function() {
    var mb = parseInt(process.env.OBJECT_MEDIA_ORG_QUOTA_MB || '1024', 10);
    if (!mb || mb < 1) mb = 1024;
    return mb * 1024 * 1024;
})();
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const MIME_TO_EXT = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

function ensureOrgDir(orgId) {
    const dir = path.join(MEDIA_ROOT, String(orgId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function mediaFilePath(orgId, mediaId, ext) {
    const safeExt = normalizeExt(ext.replace(/^\./, '')) || '.jpg';
    return path.join(MEDIA_ROOT, String(orgId), String(mediaId) + safeExt);
}

function mimeForExt(ext) {
    const e = String(ext || '').toLowerCase();
    const map = {
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
    };
    return map[e] || 'image/jpeg';
}

function normalizeExt(raw) {
    const e = String(raw || '').toLowerCase().replace(/^\./, '');
    if (e === 'jpg' || e === 'jpeg') return '.jpg';
    if (e === 'png') return '.png';
    if (e === 'webp') return '.webp';
    if (e === 'gif') return '.gif';
    return null;
}

function parseImagePayload(body) {
    if (!body || typeof body !== 'object') return null;
    let dataUrl = body.dataUrl || body.image || body.file;
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    dataUrl = dataUrl.trim();
    const m = /^data:image\/([\w+.-]+);base64,([\s\S]+)$/i.exec(dataUrl);
    if (!m) return null;
    const ext = normalizeExt(m[1].replace(/jpeg/i, 'jpg'));
    if (!ext || IMAGE_EXTS.indexOf(ext) === -1) return null;

    let buf;
    try {
        buf = Buffer.from(m[2], 'base64');
    } catch (e) {
        return null;
    }
    if (!buf.length || buf.length > IMAGE_MAX_BYTES) return null;
    return { ext: ext, buffer: buf, mime: mimeForExt(ext), size: buf.length };
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
    for (let i = 0; i < IMAGE_EXTS.length; i++) {
        const p = base + IMAGE_EXTS[i];
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
    const safeExt = normalizeExt(String(ext || '').replace(/^\./, '')) || '.jpg';
    return '/api/object-media/file/' + encodeURIComponent(String(mediaId)) + safeExt;
}

function mediaIdFromRouteParam(param) {
    var s = String(param || '');
    try { s = decodeURIComponent(s); } catch (e) {}
    return s.replace(/\.[a-z0-9]{1,8}$/i, '');
}

function safeDownloadName(name, ext) {
    var base = String(name || 'photo').replace(/[/\\?%*:|"<>]/g, '_').trim();
    if (!base) base = 'photo';
    const e = normalizeExt(String(ext || '').replace(/^\./, ''));
    if (e && !base.toLowerCase().endsWith(e)) base += e;
    return base.slice(0, 120);
}

function formatBytes(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' Б';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' КБ';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' МБ';
    return (n / (1024 * 1024 * 1024)).toFixed(1) + ' ГБ';
}

function getOrgStorageBytes(orgId) {
    if (!orgId) return 0;
    var dir = path.join(MEDIA_ROOT, String(orgId));
    if (!fs.existsSync(dir)) return 0;
    var total = 0;
    try {
        var files = fs.readdirSync(dir);
        for (var i = 0; i < files.length; i++) {
            var fp = path.join(dir, files[i]);
            try {
                var st = fs.statSync(fp);
                if (st.isFile()) total += st.size;
            } catch (e) {}
        }
    } catch (e) {}
    return total;
}

function photoFileSize(orgId, photo) {
    if (!photo) return 0;
    if (photo.size != null && photo.size > 0) return Number(photo.size);
    if (!photo.id || !orgId) return 0;
    var file = findMediaFile(orgId, photo.id, photo.ext);
    if (!file) return 0;
    try {
        return fs.statSync(file).size;
    } catch (e) {
        return 0;
    }
}

function sumPhotosBytes(photos, orgId) {
    if (!Array.isArray(photos)) return 0;
    var total = 0;
    for (var i = 0; i < photos.length; i++) {
        total += photoFileSize(orgId, photos[i]);
    }
    return total;
}

function findMapObjectByUniqueId(mapData, uniqueId) {
    if (!Array.isArray(mapData) || uniqueId == null || uniqueId === '') return null;
    var uid = String(uniqueId);
    for (var i = 0; i < mapData.length; i++) {
        var item = mapData[i];
        if (!item || !item.type || item.type === 'cable' || item.type === 'cableLabel') continue;
        if (String(item.uniqueId) === uid) return item;
    }
    return null;
}

function getObjectPhotosBytes(orgId, objectUniqueId, mapData) {
    var item = findMapObjectByUniqueId(mapData, objectUniqueId);
    if (!item) return 0;
    return sumPhotosBytes(item.photos, orgId);
}

function checkUploadQuotas(orgId, objectUniqueId, mapData, newBytes) {
    var add = Number(newBytes) || 0;
    if (add <= 0) return { ok: false, error: 'Пустой файл' };

    var orgUsed = getOrgStorageBytes(orgId);
    if (orgUsed + add > ORG_MAX_BYTES) {
        return {
            ok: false,
            code: 'org_quota',
            error: 'Квота хранилища организации исчерпана (' + formatBytes(ORG_MAX_BYTES) + '). Освободите место или удалите старые фото.',
            orgUsedBytes: orgUsed,
            orgMaxBytes: ORG_MAX_BYTES
        };
    }

    if (!objectUniqueId) {
        return { ok: false, error: 'Не указан объект для загрузки' };
    }

    var objectUsed = getObjectPhotosBytes(orgId, objectUniqueId, mapData);
    if (objectUsed + add > OBJECT_MAX_BYTES) {
        return {
            ok: false,
            code: 'object_quota',
            error: 'Лимит фото на объект — ' + formatBytes(OBJECT_MAX_BYTES) + ' (сейчас ' + formatBytes(objectUsed) + '). Удалите лишние снимки.',
            objectUsedBytes: objectUsed,
            objectMaxBytes: OBJECT_MAX_BYTES
        };
    }

    return {
        ok: true,
        orgUsedBytes: orgUsed,
        orgMaxBytes: ORG_MAX_BYTES,
        objectUsedBytes: objectUsed,
        objectMaxBytes: OBJECT_MAX_BYTES
    };
}

function getQuotaInfo(orgId, objectUniqueId, mapData) {
    return {
        fileMaxBytes: IMAGE_MAX_BYTES,
        objectMaxBytes: OBJECT_MAX_BYTES,
        orgMaxBytes: ORG_MAX_BYTES,
        orgUsedBytes: getOrgStorageBytes(orgId),
        objectUsedBytes: objectUniqueId ? getObjectPhotosBytes(orgId, objectUniqueId, mapData) : 0
    };
}

module.exports = {
    IMAGE_MAX_BYTES,
    OBJECT_MAX_BYTES,
    ORG_MAX_BYTES,
    parseImagePayload,
    saveOrgMedia,
    findMediaFile,
    removeMediaFile,
    removeOrgStorage,
    getMediaApiPath,
    mediaIdFromRouteParam,
    mimeForExt,
    normalizeExt,
    safeDownloadName,
    formatBytes,
    getOrgStorageBytes,
    getObjectPhotosBytes,
    checkUploadQuotas,
    getQuotaInfo
};
    