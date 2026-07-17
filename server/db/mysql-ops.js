'use strict';

/**
 * Shared MySQL ops for CLI scripts and site-admin API.
 * Never returns passwords.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    loadServerConfig,
    getMysqlConfig,
    isMysqlEnabled,
    query,
    closePool
} = require('./mysql');

const ROOT = path.join(__dirname, '..', '..');
const FULL_BACKUPS_DIR = path.join(ROOT, 'data', 'backups', 'full');

function ensureFullBackupsDir() {
    if (!fs.existsSync(FULL_BACKUPS_DIR)) fs.mkdirSync(FULL_BACKUPS_DIR, { recursive: true });
    return FULL_BACKUPS_DIR;
}

function countOr(rows, key) {
    if (!rows || !rows[0]) return 0;
    var v = rows[0][key];
    return v == null ? 0 : Number(v);
}

/**
 * @returns {Promise<object>} status payload without secrets
 */
async function getStorageStatus() {
    var cfg = loadServerConfig();
    var storage = String(process.env.STORAGE || cfg.storage || 'json').toLowerCase();
    var mysqlCfg = getMysqlConfig();
    var base = {
        storage: storage,
        mysqlEnabled: isMysqlEnabled(),
        mysql: {
            host: mysqlCfg.host,
            port: mysqlCfg.port,
            user: mysqlCfg.user,
            database: mysqlCfg.database,
            connectionLimit: mysqlCfg.connectionLimit
        },
        connected: false,
        version: null,
        database: null,
        migrations: [],
        organizations: null,
        users: null,
        error: null
    };

    try {
        var verRows = (await query('SELECT VERSION() AS v'))[0];
        base.version = verRows && verRows[0] ? verRows[0].v : null;
        var dbRows = (await query('SELECT DATABASE() AS db'))[0];
        base.database = dbRows && dbRows[0] ? dbRows[0].db : null;
        base.connected = true;

        try {
            var migRows = (await query('SELECT id, applied_at FROM schema_migrations ORDER BY applied_at'))[0];
            base.migrations = (migRows || []).map(function (r) {
                return { id: r.id, appliedAt: r.applied_at };
            });
        } catch (e) {
            base.migrations = [];
        }

        try {
            var orgRows = (await query('SELECT COUNT(*) AS c FROM organizations'))[0];
            var userRows = (await query('SELECT COUNT(*) AS c FROM users'))[0];
            base.organizations = countOr(orgRows, 'c');
            base.users = countOr(userRows, 'c');
        } catch (e) {
            base.organizations = null;
            base.users = null;
        }
    } catch (e) {
        base.connected = false;
        base.error = e && e.message ? String(e.message) : String(e);
    }

    return base;
}

function isSafeDumpFilename(name) {
    return typeof name === 'string' &&
        /^mysqldump-[\w.-]+\.sql$/i.test(name.trim()) &&
        !name.includes('..') &&
        !name.includes('/') &&
        !name.includes('\\');
}

function listMysqlDumps() {
    try {
        ensureFullBackupsDir();
        return fs.readdirSync(FULL_BACKUPS_DIR)
            .filter(function (f) { return /^mysqldump-.*\.sql$/i.test(f); })
            .map(function (f) {
                var p = path.join(FULL_BACKUPS_DIR, f);
                try {
                    var st = fs.statSync(p);
                    return { filename: f, size: st.size, mtime: st.mtime.toISOString() };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort(function (a, b) { return String(b.mtime).localeCompare(String(a.mtime)); });
    } catch (e) {
        return [];
    }
}

/**
 * Create mysqldump into data/backups/full/.
 * @returns {{ ok: boolean, path?: string, filename?: string, error?: string }}
 */
function createMysqlDump() {
    ensureFullBackupsDir();
    var cfg = getMysqlConfig();
    var stamp = new Date().toISOString().replace(/[:.]/g, '-');
    var dumpName = 'mysqldump-' + cfg.database + '-' + stamp + '.sql';
    var dumpPath = path.join(FULL_BACKUPS_DIR, dumpName);
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
        return { ok: false, error: 'mysqldump недоступен: ' + r.error.message };
    }
    if (r.status !== 0) {
        return { ok: false, error: (r.stderr || r.stdout || 'mysqldump failed').trim() };
    }
    fs.writeFileSync(dumpPath, r.stdout, 'utf8');
    return { ok: true, path: dumpPath, filename: dumpName };
}

/**
 * Restore from a dump file under data/backups/full/.
 * Caller should flush/rehydrate app store after this.
 * @param {string} filename
 * @returns {{ ok: boolean, error?: string }}
 */
function restoreMysqlDump(filename) {
    var trimmed = typeof filename === 'string' ? filename.trim() : '';
    if (!isSafeDumpFilename(trimmed)) {
        return { ok: false, error: 'Недопустимое имя файла' };
    }
    var abs = path.join(FULL_BACKUPS_DIR, trimmed);
    if (!fs.existsSync(abs)) {
        return { ok: false, error: 'Файл dump не найден' };
    }
    var cfg = getMysqlConfig();
    var args = [
        '-h', cfg.host,
        '-P', String(cfg.port),
        '-u', cfg.user
    ];
    var env = Object.assign({}, process.env);
    if (cfg.password) env.MYSQL_PWD = cfg.password;

    var fd = fs.openSync(abs, 'r');
    var r;
    try {
        r = spawnSync('mysql', args, {
            encoding: 'utf8',
            env: env,
            stdio: [fd, 'pipe', 'pipe'],
            maxBuffer: 64 * 1024 * 1024
        });
    } finally {
        fs.closeSync(fd);
    }

    if (r.error) {
        return { ok: false, error: 'mysql client: ' + r.error.message };
    }
    if (r.status !== 0) {
        return { ok: false, error: (r.stderr || r.stdout || ('exit ' + r.status)).trim() };
    }
    return { ok: true, filename: trimmed };
}

module.exports = {
    getStorageStatus,
    listMysqlDumps,
    createMysqlDump,
    restoreMysqlDump,
    isSafeDumpFilename,
    ensureFullBackupsDir,
    FULL_BACKUPS_DIR,
    closePool
};
