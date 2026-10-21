/**
 * Проверка бессрочной офлайн-лицензии Portable (fingerprint + Ed25519).
 * Без phone-home. При отсутствии/битой лицензии — отказ в работе, данные не трогаем.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LICENSE_PATH = path.join(DATA_DIR, 'license.json');
const LOCAL_MACHINE_ID_PATH = path.join(DATA_DIR, '.machine-id');

/** В релизной сборке можно зашить публичный ключ из site-admin. */
const EMBEDDED_PUBLIC_KEY = '';

var _cache = null;

function sortKeys(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sortKeys);
    var out = {};
    Object.keys(value).sort().forEach(function (k) {
        out[k] = sortKeys(value[k]);
    });
    return out;
}

function canonicalize(payload) {
    return JSON.stringify(sortKeys(payload));
}

function normalizeFingerprint(raw) {
    var hex = String(raw || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (hex.length < 16) return '';
    return hex.slice(0, 32);
}

function formatMachineCode(fingerprint) {
    var hex = normalizeFingerprint(fingerprint);
    if (!hex) return '';
    var parts = [];
    for (var i = 0; i < hex.length; i += 4) parts.push(hex.slice(i, i + 4).toUpperCase());
    return parts.join('-');
}

function readOsMachineId() {
    try {
        if (process.platform === 'linux' || process.platform === 'darwin') {
            var linuxPath = '/etc/machine-id';
            if (fs.existsSync(linuxPath)) {
                var id = String(fs.readFileSync(linuxPath, 'utf8') || '').trim();
                if (id) return id;
            }
            var dbusPath = '/var/lib/dbus/machine-id';
            if (fs.existsSync(dbusPath)) {
                var id2 = String(fs.readFileSync(dbusPath, 'utf8') || '').trim();
                if (id2) return id2;
            }
        }
        if (process.platform === 'win32') {
            var out = execSync(
                'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
                { encoding: 'utf8', windowsHide: true, timeout: 5000 }
            );
            var m = String(out).match(/MachineGuid\s+REG_SZ\s+(\S+)/i);
            if (m && m[1]) return m[1].trim();
        }
    } catch (e) {}
    return '';
}

function ensureLocalMachineId() {
    try {
        if (fs.existsSync(LOCAL_MACHINE_ID_PATH)) {
            var existing = String(fs.readFileSync(LOCAL_MACHINE_ID_PATH, 'utf8') || '').trim();
            if (existing) return existing;
        }
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        var id = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
        fs.writeFileSync(LOCAL_MACHINE_ID_PATH, id, 'utf8');
        return id;
    } catch (e) {
        return 'fallback-' + os.hostname();
    }
}

function getMachineFingerprint() {
    var parts = [];
    var osId = readOsMachineId();
    if (osId) parts.push('os:' + osId);
    else parts.push('local:' + ensureLocalMachineId());
    parts.push('plat:' + process.platform);
    return crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 32);
}

function getPublicKey(config) {
    config = config || {};
    return String(
        config.portableLicensePublicKey ||
        process.env.PORTABLE_LICENSE_PUBLIC_KEY ||
        EMBEDDED_PUBLIC_KEY ||
        ''
    ).trim();
}

/**
 * Разработка: portableLicenseRequired: false или нет ключа.
 * Релизная сборка (зашит EMBEDDED_PUBLIC_KEY): всегда включено;
 * отключить можно только env PORTABLE_LICENSE_REQUIRED=0 (для поддержки вендора).
 */
function isEnforced(config) {
    config = config || {};
    var env = String(process.env.PORTABLE_LICENSE_REQUIRED || '').trim().toLowerCase();
    if (env === '0' || env === 'false' || env === 'off') return false;
    if (String(EMBEDDED_PUBLIC_KEY || '').trim()) return true;
    if (config.portableLicenseRequired === false) return false;
    if (config.portableLicenseRequired === true) return true;
    return !!getPublicKey(config);
}

function verifyDocument(publicKeyB64, doc) {
    if (!doc || typeof doc !== 'object') return { ok: false, error: 'Неверный формат лицензии' };
    var payload = doc.payload;
    var signature = doc.signature;
    if (!payload || typeof payload !== 'object' || !signature) {
        return { ok: false, error: 'Неверный формат лицензии' };
    }
    if (!publicKeyB64) return { ok: false, error: 'Не задан публичный ключ проверки' };
    try {
        var key = crypto.createPublicKey({
            key: Buffer.from(String(publicKeyB64).trim(), 'base64'),
            format: 'der',
            type: 'spki'
        });
        var ok = crypto.verify(
            null,
            Buffer.from(canonicalize(payload), 'utf8'),
            key,
            Buffer.from(String(signature), 'base64')
        );
        if (!ok) return { ok: false, error: 'Подпись лицензии недействительна' };
        return { ok: true, payload: payload };
    } catch (e) {
        return { ok: false, error: 'Не удалось проверить подпись' };
    }
}

function parseLicenseInput(raw) {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    var text = String(raw).trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            return JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
        } catch (e2) {
            return null;
        }
    }
}

function loadLicenseFile() {
    try {
        if (!fs.existsSync(LICENSE_PATH)) return null;
        return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
    } catch (e) {
        return null;
    }
}

function saveLicenseFile(doc) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LICENSE_PATH, JSON.stringify(doc, null, 2), 'utf8');
    invalidateCache();
}

function removeLicenseFile() {
    try {
        if (fs.existsSync(LICENSE_PATH)) fs.unlinkSync(LICENSE_PATH);
    } catch (e) {}
    invalidateCache();
}

function invalidateCache() {
    _cache = null;
}

function evaluate(config) {
    var enforced = isEnforced(config);
    var fp = getMachineFingerprint();
    var machineCode = formatMachineCode(fp);
    var publicKey = getPublicKey(config);
    if (!enforced) {
        return {
            enforced: false,
            valid: true,
            machineFingerprint: fp,
            machineCode: machineCode,
            reason: 'disabled'
        };
    }
    if (!publicKey) {
        return {
            enforced: true,
            valid: false,
            machineFingerprint: fp,
            machineCode: machineCode,
            error: 'В server-config.json не задан portableLicensePublicKey (скопируйте из site-admin)'
        };
    }
    var doc = loadLicenseFile();
    if (!doc) {
        return {
            enforced: true,
            valid: false,
            machineFingerprint: fp,
            machineCode: machineCode,
            error: 'Файл лицензии не найден. Активируйте установку на странице лицензии.'
        };
    }
    var verified = verifyDocument(publicKey, doc);
    if (!verified.ok) {
        return {
            enforced: true,
            valid: false,
            machineFingerprint: fp,
            machineCode: machineCode,
            error: verified.error || 'Лицензия недействительна'
        };
    }
    var payload = verified.payload;
    var licFp = normalizeFingerprint(payload.machineFingerprint);
    if (!licFp || licFp !== fp) {
        return {
            enforced: true,
            valid: false,
            machineFingerprint: fp,
            machineCode: machineCode,
            error: 'Лицензия выдана для другого компьютера. Запросите перевыпуск в site-admin.',
            licenseId: payload.licenseId || null,
            customer: payload.customer || null
        };
    }
    return {
        enforced: true,
        valid: true,
        machineFingerprint: fp,
        machineCode: machineCode,
        licenseId: payload.licenseId || null,
        customer: payload.customer || null,
        issuedAt: payload.issuedAt || null,
        perpetual: payload.perpetual !== false
    };
}

function getStatus(config) {
    if (_cache && _cache.configRef === config) return _cache.status;
    var status = evaluate(config);
    _cache = { configRef: config, status: status };
    return status;
}

function activate(config, rawLicense) {
    var publicKey = getPublicKey(config);
    if (!publicKey) {
        return { ok: false, error: 'Не задан portableLicensePublicKey в конфигурации сервера' };
    }
    var doc = parseLicenseInput(rawLicense);
    if (!doc) return { ok: false, error: 'Не удалось разобрать текст лицензии (ожидается JSON)' };
    var verified = verifyDocument(publicKey, doc);
    if (!verified.ok) return { ok: false, error: verified.error };
    var fp = getMachineFingerprint();
    var licFp = normalizeFingerprint(verified.payload.machineFingerprint);
    if (!licFp || licFp !== fp) {
        return {
            ok: false,
            error: 'Код машины не совпадает. Отправьте актуальный код: ' + formatMachineCode(fp)
        };
    }
    saveLicenseFile({
        payload: verified.payload,
        signature: doc.signature
    });
    return { ok: true, status: getStatus(config) };
}

function isPathAllowedWithoutLicense(reqPath) {
    var p = String(reqPath || '');
    if (p.indexOf('/api/portable/license') === 0) return true;
    if (p === '/license.html' || p === '/favicon.svg' || p === '/favicon.png') return true;
    if (p.indexOf('/css/') === 0 || p.indexOf('/js/') === 0 || p.indexOf('/fonts/') === 0) return true;
    if (p.indexOf('/icons/') === 0 || p.indexOf('/img/') === 0 || p.indexOf('/vendor/') === 0) return true;
    return false;
}

module.exports = {
    LICENSE_PATH: LICENSE_PATH,
    normalizeFingerprint: normalizeFingerprint,
    formatMachineCode: formatMachineCode,
    getMachineFingerprint: getMachineFingerprint,
    getPublicKey: getPublicKey,
    isEnforced: isEnforced,
    verifyDocument: verifyDocument,
    parseLicenseInput: parseLicenseInput,
    loadLicenseFile: loadLicenseFile,
    saveLicenseFile: saveLicenseFile,
    removeLicenseFile: removeLicenseFile,
    invalidateCache: invalidateCache,
    evaluate: evaluate,
    getStatus: getStatus,
    activate: activate,
    isPathAllowedWithoutLicense: isPathAllowedWithoutLicense
};
