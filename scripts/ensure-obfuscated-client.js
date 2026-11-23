'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUBLIC_JS = path.join(ROOT, 'public', 'js');
const DIST_JS = path.join(ROOT, 'dist', 'js');
const BUILD_SCRIPT = path.join(__dirname, 'build-client.js');

function newestMtimeMs(dir) {
    var newest = 0;
    if (!fs.existsSync(dir)) return 0;
    function walk(d) {
        var entries;
        try {
            entries = fs.readdirSync(d, { withFileTypes: true });
        } catch (e) {
            return;
        }
        for (var i = 0; i < entries.length; i++) {
            var full = path.join(d, entries[i].name);
            if (entries[i].isDirectory()) {
                walk(full);
            } else if (entries[i].isFile()) {
                try {
                    var t = fs.statSync(full).mtimeMs;
                    if (t > newest) newest = t;
                } catch (e2) {
                }
            }
        }
    }
    walk(dir);
    return newest;
}

function needsRebuild() {
    if (!fs.existsSync(DIST_JS)) return true;
    var pub = newestMtimeMs(PUBLIC_JS);
    var dist = newestMtimeMs(DIST_JS);
    if (!dist) return true;
    return pub > dist + 500;
}

function ensureObfuscatedClientSync(opts) {
    opts = opts || {};
    if (!opts.force && !needsRebuild()) {
        console.log('[ensure-client] dist/ актуален — сборка пропущена');
        return { built: false, skipped: true };
    }

    console.log('[ensure-client] Запуск npm run build (обфускация клиента)…');
    var args = [BUILD_SCRIPT];
    if (opts.noDomainLock) args.push('--no-domain-lock');

    var result = spawnSync(process.execPath, args, {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env
    });

    if (result.status !== 0) {
        console.error('[ensure-client] Сборка клиента не удалась (код ' + result.status + ')');
        process.exit(result.status || 1);
    }
    return { built: true, skipped: false };
}

if (require.main === module) {
    ensureObfuscatedClientSync({
        force: process.argv.indexOf('--force') !== -1,
        noDomainLock: process.argv.indexOf('--no-domain-lock') !== -1
    });
}

module.exports = {
    ensureObfuscatedClientSync: ensureObfuscatedClientSync,
    needsRebuild: needsRebuild
};
