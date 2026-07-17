'use strict';

/**
 * Restore MySQL database from a mysqldump .sql file under data/backups/full/.
 * Stop the API before running from CLI. Requires --yes.
 *
 *   npm run restore:mysql -- --dump mysqldump-network_map-….sql --yes
 *   npm run restore:mysql -- --dump path/to/file.sql --yes
 */
const path = require('path');
const fs = require('fs');
const { restoreMysqlDump, FULL_BACKUPS_DIR, isSafeDumpFilename } = require('../server/db/mysql-ops');
const { getMysqlConfig } = require('../server/db/mysql');

function argValue(flag) {
    var i = process.argv.indexOf(flag);
    if (i < 0 || i + 1 >= process.argv.length) return null;
    return process.argv[i + 1];
}

function main() {
    var dumpPath = argValue('--dump');
    var yes = process.argv.indexOf('--yes') >= 0;

    if (!dumpPath) {
        console.error('Usage: npm run restore:mysql -- --dump path/to/file.sql --yes');
        console.error('Stop the API before restoring (CLI). From site-admin restore is live.');
        process.exit(1);
    }

    var cfg = getMysqlConfig();
    console.log('[restore] Target:', cfg.user + '@' + cfg.host + ':' + cfg.port + '/' + cfg.database);
    console.log('[restore] Dump:', dumpPath);
    console.log('[restore] WARNING: This overwrites the MySQL database contents.');

    if (!yes) {
        console.error('[restore] Refusing without --yes');
        process.exit(1);
    }

    var filename = path.basename(dumpPath);
    // Allow absolute/relative paths: copy or resolve into full backups dir if needed
    if (!isSafeDumpFilename(filename)) {
        console.error('[restore] Filename must match mysqldump-*.sql');
        process.exit(1);
    }

    var abs = path.isAbsolute(dumpPath) ? dumpPath : path.join(process.cwd(), dumpPath);
    var inFull = path.join(FULL_BACKUPS_DIR, filename);
    if (path.resolve(abs) !== path.resolve(inFull)) {
        if (!fs.existsSync(abs)) {
            console.error('[restore] File not found:', abs);
            process.exit(1);
        }
        if (!fs.existsSync(FULL_BACKUPS_DIR)) fs.mkdirSync(FULL_BACKUPS_DIR, { recursive: true });
        if (!fs.existsSync(inFull)) {
            fs.copyFileSync(abs, inFull);
            console.log('[restore] Copied into', inFull);
        }
    }

    var result = restoreMysqlDump(filename);
    if (!result.ok) {
        console.error('[restore] FAILED:', result.error);
        process.exit(1);
    }
    console.log('[restore] OK — start API and run: npm run db:status');
}

main();
