/**
 * Подпись / проверка бессрочных лицензий Portable (Ed25519).
 * Приватный ключ только на SaaS; в Portable — публичный.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function ensureKeypair(keypairPath) {
    if (fs.existsSync(keypairPath)) {
        var existing = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
        if (existing && existing.publicKey && existing.privateKey) return existing;
    }
    var pair = crypto.generateKeyPairSync('ed25519');
    var data = {
        algorithm: 'ed25519',
        publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
        createdAt: new Date().toISOString()
    };
    fs.mkdirSync(path.dirname(keypairPath), { recursive: true });
    fs.writeFileSync(keypairPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    return data;
}

function loadKeypair(keypairPath) {
    if (!fs.existsSync(keypairPath)) return null;
    try {
        var data = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
        if (data && data.publicKey && data.privateKey) return data;
    } catch (e) {}
    return null;
}

function signPayload(privateKeyB64, payload) {
    var key = crypto.createPrivateKey({
        key: Buffer.from(privateKeyB64, 'base64'),
        format: 'der',
        type: 'pkcs8'
    });
    return crypto.sign(null, Buffer.from(canonicalize(payload), 'utf8'), key).toString('base64');
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

function createLicenseDocument(privateKeyB64, fields) {
    var fp = normalizeFingerprint(fields.machineFingerprint);
    if (!fp) throw new Error('Укажите код машины (fingerprint)');
    var customer = String(fields.customer || '').trim();
    if (customer.length < 2) throw new Error('Укажите название клиента');
    if (customer.length > 200) throw new Error('Название клиента слишком длинное');
    var licenseId = String(fields.licenseId || ('lic_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex')));
    var payload = {
        v: 1,
        licenseId: licenseId,
        customer: customer,
        note: String(fields.note || '').trim().slice(0, 500),
        machineFingerprint: fp,
        perpetual: true,
        issuedAt: fields.issuedAt || new Date().toISOString()
    };
    return {
        payload: payload,
        signature: signPayload(privateKeyB64, payload)
    };
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

module.exports = {
    canonicalize: canonicalize,
    normalizeFingerprint: normalizeFingerprint,
    formatMachineCode: formatMachineCode,
    ensureKeypair: ensureKeypair,
    loadKeypair: loadKeypair,
    signPayload: signPayload,
    verifyDocument: verifyDocument,
    createLicenseDocument: createLicenseDocument,
    parseLicenseInput: parseLicenseInput
};
