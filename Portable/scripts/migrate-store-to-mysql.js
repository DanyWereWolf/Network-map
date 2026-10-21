'use strict';

/**
 * Migrate data/store.json → MySQL (platform tables + org_map_blobs + relational map).
 *
 * Usage:
 *   node scripts/migrate-store-to-mysql.js
 *   node scripts/migrate-store-to-mysql.js --store path/to/store.json
 *   node scripts/migrate-store-to-mysql.js --skip-relational
 *
 * Prerequisites: MySQL reachable per server-config.json mysql.* (storage flag ignored here).
 * After success: set "storage": "mysql" in server-config.json and restart API.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STORE = path.join(ROOT, 'data', 'store.json');

function parseArgs(argv) {
    var opts = { store: DEFAULT_STORE, skipRelational: false };
    for (var i = 2; i < argv.length; i++) {
        if (argv[i] === '--store' && argv[i + 1]) {
            opts.store = path.resolve(argv[++i]);
        } else if (argv[i] === '--skip-relational') {
            opts.skipRelational = true;
        } else if (argv[i] === '--help' || argv[i] === '-h') {
            opts.help = true;
        }
    }
    return opts;
}

async function main() {
    var opts = parseArgs(process.argv);
    if (opts.help) {
        console.log('Usage: node scripts/migrate-store-to-mysql.js [--store path] [--skip-relational]');
        process.exit(0);
    }
    if (!fs.existsSync(opts.store)) {
        console.error('Store file not found:', opts.store);
        process.exit(1);
    }

    var raw = fs.readFileSync(opts.store, 'utf8');
    var store;
    try {
        store = JSON.parse(raw);
    } catch (e) {
        console.error('Invalid JSON:', e.message);
        process.exit(1);
    }

    var orgCount = (store.organizations || []).length;
    var userCount = (store.users || []).length;
    var mapItems = 0;
    Object.keys(store.mapDataByOrg || {}).forEach(function (k) {
        if (Array.isArray(store.mapDataByOrg[k])) mapItems += store.mapDataByOrg[k].length;
    });
    console.log('[migrate] Source:', opts.store);
    console.log('[migrate] Orgs:', orgCount, 'users:', userCount, 'map items:', mapItems);

    var { runMigrations } = require('../server/db/migrate');
    var { persistStoreToMysql } = require('../server/db/mysql-persist');
    var { closePool, getMysqlConfig } = require('../server/db/mysql');

    console.log('[migrate] Target DB:', getMysqlConfig().database, '@', getMysqlConfig().host);
    await runMigrations();
    console.log('[migrate] Writing rows…');
    await persistStoreToMysql(store, { skipRelationalMap: !!opts.skipRelational });
    await closePool();

    console.log('[migrate] Done.');
    console.log('[migrate] Next: set "storage": "mysql" in server-config.json and restart `npm run api`.');
    console.log('[migrate] Keep a copy of store.json until you verify login/map/admin.');
}

main().catch(function (e) {
    console.error('[migrate] FAILED:', e && e.stack ? e.stack : e);
    process.exit(1);
});
