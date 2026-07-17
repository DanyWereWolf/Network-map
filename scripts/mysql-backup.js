'use strict';

/**
 * Logical JSON export + optional mysqldump wrapper for MySQL mode.
 *
 *   node scripts/mysql-backup.js              # export assembled store JSON to data/backups/full/
 *   node scripts/mysql-backup.js --dump       # also run mysqldump if available
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

async function main() {
    var wantDump = process.argv.indexOf('--dump') >= 0;
    var { runMigrations } = require('../server/db/migrate');
    var { hydrateStoreFromMysql } = require('../server/db/mysql-persist');
    var { getMysqlConfig, closePool } = require('../server/db/mysql');

    await runMigrations();
    var store = await hydrateStoreFromMysql();
    var dir = path.join(ROOT, 'data', 'backups', 'full');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var jsonName = 'store-mysql-export-' + stamp + '.json';
    var jsonPath = path.join(dir, jsonName);
    fs.writeFileSync(jsonPath, JSON.stringify(store, null, 0), 'utf8');
    console.log('[backup] Logical export:', jsonPath);

    if (wantDump) {
        var cfg = getMysqlConfig();
        var dumpName = 'mysqldump-' + cfg.database + '-' + stamp + '.sql';
        var dumpPath = path.join(dir, dumpName);
        var args = [
            '-h', cfg.host,
            '-P', String(cfg.port),
            '-u', cfg.user,
            '--single-transaction',
            '--routines',
            '--databases', cfg.database
        ];
        var env = Object.assign({}, process.env);
        if (cfg.password) env.MYSQL_PWD = cfg.password;
        var r = spawnSync('mysqldump', args, { encoding: 'utf8', env: env, maxBuffer: 256 * 1024 * 1024 });
        if (r.error) {
            console.warn('[backup] mysqldump not available:', r.error.message);
        } else if (r.status !== 0) {
            console.warn('[backup] mysqldump failed:', r.stderr || r.stdout);
        } else {
            fs.writeFileSync(dumpPath, r.stdout, 'utf8');
            console.log('[backup] SQL dump:', dumpPath);
        }
    }

    await closePool();
}

main().catch(function (e) {
    console.error('[backup] FAILED:', e && e.stack ? e.stack : e);
    process.exit(1);
});
