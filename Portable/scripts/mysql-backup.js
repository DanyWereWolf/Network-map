'use strict';

/**
 * Logical JSON export + optional mysqldump wrapper for MySQL mode.
 *
 *   node scripts/mysql-backup.js              # export assembled store JSON to data/backups/full/
 *   node scripts/mysql-backup.js --dump       # also run mysqldump if available
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

async function main() {
    var wantDump = process.argv.indexOf('--dump') >= 0;
    var { runMigrations } = require('../server/db/migrate');
    var { hydrateStoreFromMysql } = require('../server/db/mysql-persist');
    var { closePool } = require('../server/db/mysql');

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
        var { createMysqlDump } = require('../server/db/mysql-ops');
        var dumpResult = createMysqlDump();
        if (!dumpResult.ok) {
            console.warn('[backup] mysqldump failed:', dumpResult.error);
        } else {
            console.log('[backup] SQL dump:', dumpResult.path);
        }
    }

    await closePool();
}

main().catch(function (e) {
    console.error('[backup] FAILED:', e && e.stack ? e.stack : e);
    process.exit(1);
});
