'use strict';

/**
 * Print MySQL / storage status for console ops (no passwords).
 *
 *   node scripts/mysql-status.js
 *   npm run db:status
 */
const { getStorageStatus, closePool } = require('../server/db/mysql-ops');

async function main() {
    var s = await getStorageStatus();
    console.log('[status] storage:', s.storage, '(enabled=' + s.mysqlEnabled + ')');
    console.log('[status] mysql:', s.mysql.user + '@' + s.mysql.host + ':' +
        s.mysql.port + '/' + s.mysql.database);
    console.log('[status] pool limit:', s.mysql.connectionLimit);

    if (!s.connected) {
        console.error('[status] FAIL: cannot connect —', s.error || 'unknown');
        process.exitCode = 1;
        return;
    }

    console.log('[status] version:', s.version);
    console.log('[status] database:', s.database);
    var migIds = (s.migrations || []).map(function (m) { return m.id; });
    console.log('[status] migrations:', migIds.length ? migIds.join(', ') : '(none)');
    if (s.organizations != null) console.log('[status] organizations:', s.organizations);
    else console.log('[status] counts: (tables missing — run npm run db:migrate)');
    if (s.users != null) console.log('[status] users:', s.users);
    console.log('[status] ok: connected');
}

main()
    .catch(function (e) {
        console.error('[status] FAILED:', e && e.stack ? e.stack : e);
        process.exit(1);
    })
    .finally(function () {
        return closePool();
    });
