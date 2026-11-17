'use strict';

/**
 * Shared MySQL ops for CLI scripts and site-admin API.
 * Never returns passwords.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
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

function mysqlDumpArgs(cfg) {
    return [
        '-h', cfg.host,
        '-P', String(cfg.port),
        '-u', cfg.user,
        '--single-transaction',
        '--routines',
        '--databases', cfg.database
    ];
}

function mysqlClientEnv(cfg) {
    var env = Object.assign({}, process.env);
    if (cfg.password) env.MYSQL_PWD = cfg.password;
    return env;
}

function formatDumpDate(d) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function isDailyDumpFilename(name) {
    return /^mysqldump-[\w.-]+-\d{4}-\d{2}-\d{2}\.sql$/i.test(name);
}

function pruneMysqlDumps(keepDays) {
    keepDays = keepDays || 30;
    try {
        ensureFullBackupsDir();
        var listed = fs.readdirSync(FULL_BACKUPS_DIR)
            .filter(function (f) { return /^mysqldump-.*\.sql$/i.test(f); })
            .map(function (f) {
                var p = path.join(FULL_BACKUPS_DIR, f);
                try { return { name: f, path: p, mtime: fs.statSync(p).mtimeMs }; } catch (e) { return null; }
            })
            .filter(Boolean);
        var daily = [];
        var extra = [];
        listed.forEach(function (f) {
            if (isDailyDumpFilename(f.name)) daily.push(f);
            else extra.push(f);
        });
        daily.sort(function (a, b) { return b.name.localeCompare(a.name); });
        var cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
        var drop = daily.slice(keepDays);
        extra.forEach(function (f) {
            if (f.mtime < cutoff) drop.push(f);
        });
        drop.forEach(function (f) {
            try {
                fs.unlinkSync(f.path);
                console.log('[Backup] Удалён старый SQL dump:', f.name);
            } catch (e) {}
        });
    } catch (e) {
        console.error('[Backup] Очистка SQL dump:', e.message);
    }
}

/**
 * One mysqldump per calendar day. Skips if today's file is already non-empty.
 * Daily files: newest `keepDays`. Manual dumps: deleted after `keepDays`.
 * @param {number} [keepDays]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, filename?: string, path?: string, error?: string }>}
 */
function createDailyMysqlDump(keepDays) {
    return new Promise(function (resolve) {
        if (!isMysqlEnabled()) {
            resolve({ ok: true, skipped: true });
            return;
        }
        ensureFullBackupsDir();
        var cfg = getMysqlConfig();
        var dateStr = formatDumpDate(new Date());
        var dumpName = 'mysqldump-' + cfg.database + '-' + dateStr + '.sql';
        var dumpPath = path.join(FULL_BACKUPS_DIR, dumpName);
        if (fs.existsSync(dumpPath)) {
            try {
                if (fs.statSync(dumpPath).size > 0) {
                    pruneMysqlDumps(keepDays);
                    resolve({ ok: true, skipped: true, filename: dumpName });
                    return;
                }
            } catch (eStat) {}
        }
        var tmpPath = dumpPath + '.tmp';
        var fd;
        try {
            fd = fs.openSync(tmpPath, 'w');
        } catch (eOpen) {
            resolve({ ok: false, error: eOpen && eOpen.message ? eOpen.message : String(eOpen) });
            return;
        }
        var proc = spawn('mysqldump', mysqlDumpArgs(cfg), {
            env: mysqlClientEnv(cfg),
            stdio: ['ignore', fd, 'pipe']
        });
        var stderr = '';
        var settled = false;
        function finish(result) {
            if (settled) return;
            settled = true;
            try { fs.closeSync(fd); } catch (eClose) {}
            resolve(result);
        }
        proc.stderr.on('data', function (chunk) { stderr += chunk; });
        proc.on('error', function (e) {
            try { fs.unlinkSync(tmpPath); } catch (eUnlink) {}
            finish({ ok: false, error: 'mysqldump недоступен: ' + (e && e.message ? e.message : e) });
        });
        proc.on('close', function (code) {
            try { fs.closeSync(fd); } catch (eClose) {}
            if (code !== 0) {
                try { fs.unlinkSync(tmpPath); } catch (eUnlink) {}
                finish({ ok: false, error: (stderr || ('mysqldump exit ' + code)).trim() });
                return;
            }
            try {
                fs.renameSync(tmpPath, dumpPath);
            } catch (eRename) {
                finish({ ok: false, error: eRename && eRename.message ? eRename.message : String(eRename) });
                return;
            }
            pruneMysqlDumps(keepDays);
            finish({ ok: true, filename: dumpName, path: dumpPath });
        });
    });
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
    var args = mysqlDumpArgs(cfg);
    var env = mysqlClientEnv(cfg);
    var r = spawnSync('mysqldump', args, { encoding: 'utf8', env: env, maxBuffer: 256 * 1024 * 1024 });
    if (r.error) {
        return { ok: false, error: 'mysqldump недоступен: ' + r.error.message };
    }
    if (r.status !== 0) {
        return { ok: false, error: (r.stderr || r.stdout || 'mysqldump failed').trim() };
    }
    try {
        fs.writeFileSync(dumpPath, r.stdout, 'utf8');
    } catch (e) {
        var msg = e && e.message ? String(e.message) : String(e);
        if (e && e.code === 'EACCES') {
            msg += ' — каталог data/ принадлежит root? Выполните: sudo chown -R "$USER:$USER" data';
        }
        return { ok: false, error: msg };
    }
    pruneMysqlDumps(30);
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
    createDailyMysqlDump,
    pruneMysqlDumps,
    restoreMysqlDump,
    isSafeDumpFilename,
    ensureFullBackupsDir,
    FULL_BACKUPS_DIR,
    closePool
};
