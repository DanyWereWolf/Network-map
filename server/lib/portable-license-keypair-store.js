/**
 * Единый vendor-keypair для Portable:
 * лежит в server/config/ (ездит вместе с кодом приложения),
 * а не в data/ (у каждого хоста свой каталог → раньше получались разные ключи).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const portableLicenseCrypto = require('./portable-license-crypto');

const BUNDLED_KEYPAIR_PATH = path.join(__dirname, '..', 'config', 'portable-license-keypair.json');

function getBundledKeypairPath() {
    return BUNDLED_KEYPAIR_PATH;
}

function legacyDataKeypairPath(dataDir) {
    return path.join(dataDir || '', 'portable-license-keypair.json');
}

/**
 * Всегда предпочитаем bundled. Legacy data/ используется только если bundled ещё нет
 * (один раз мигрируем в config, чтобы дальше ключ жил с кодом).
 */
function resolveKeypairPath(dataDir) {
    if (fs.existsSync(BUNDLED_KEYPAIR_PATH)) return BUNDLED_KEYPAIR_PATH;
    var legacy = dataDir ? legacyDataKeypairPath(dataDir) : '';
    if (legacy && fs.existsSync(legacy)) {
        try {
            fs.mkdirSync(path.dirname(BUNDLED_KEYPAIR_PATH), { recursive: true });
            fs.copyFileSync(legacy, BUNDLED_KEYPAIR_PATH);
            return BUNDLED_KEYPAIR_PATH;
        } catch (e) {
            return legacy;
        }
    }
    return BUNDLED_KEYPAIR_PATH;
}

function getOrCreateKeypair(dataDir) {
    var p = resolveKeypairPath(dataDir);
    return portableLicenseCrypto.ensureKeypair(p);
}

module.exports = {
    BUNDLED_KEYPAIR_PATH: BUNDLED_KEYPAIR_PATH,
    getBundledKeypairPath: getBundledKeypairPath,
    resolveKeypairPath: resolveKeypairPath,
    getOrCreateKeypair: getOrCreateKeypair
};
