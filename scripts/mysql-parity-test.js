'use strict';

/**
 * Golden parity: JSON map → disassemble → assemble → compare.
 *
 * Usage:
 *   node scripts/mysql-parity-test.js                 # in-memory (no MySQL)
 *   node scripts/mysql-parity-test.js --mysql         # against configured MySQL
 *   node scripts/mysql-parity-test.js --org wew
 *   node scripts/mysql-parity-test.js --store data/store.json --org org_xxx
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_STORE = path.join(ROOT, 'data', 'store.json');

function parseArgs(argv) {
    var opts = { store: DEFAULT_STORE, org: null, mysql: false };
    for (var i = 2; i < argv.length; i++) {
        if (argv[i] === '--store' && argv[i + 1]) opts.store = path.resolve(argv[++i]);
        else if (argv[i] === '--org' && argv[i + 1]) opts.org = argv[++i];
        else if (argv[i] === '--mysql') opts.mysql = true;
    }
    return opts;
}

/** Stable stringify for deep compare (sort object keys, drop null/empty collections). */
function canonicalize(value) {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'object') {
        if (typeof value === 'number' && Object.is(value, -0)) return 0;
        return value;
    }
    if (Array.isArray(value)) {
        if (!value.length) return undefined;
        var looksLikeMapItems = value.every(function (x) {
            return x && typeof x === 'object' && !Array.isArray(x) && x.type != null;
        });
        var arr;
        if (looksLikeMapItems) {
            arr = value.slice().sort(function (a, b) {
                var ta = String(a.type || '');
                var tb = String(b.type || '');
                if (ta !== tb) return ta.localeCompare(tb);
                var ua = a.uniqueId != null ? String(a.uniqueId) : '';
                var ub = b.uniqueId != null ? String(b.uniqueId) : '';
                if (ua || ub) return ua.localeCompare(ub);
                return JSON.stringify(a.geometry || null).localeCompare(JSON.stringify(b.geometry || null));
            }).map(canonicalize);
        } else if (value.some(function (x) { return x === null; })) {
            // Keep array length/slots for sparse outputConnections (null entries matter)
            arr = value.map(function (x) { return x === null ? null : canonicalize(x); });
        } else {
            arr = value.map(canonicalize).filter(function (x) { return x !== undefined; });
        }
        return arr;
    }
    var keys = Object.keys(value).sort();
    var out = {};
    keys.forEach(function (k) {
        var v = canonicalize(value[k]);
        if (v === undefined) return;
        if (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length) return;
        out[k] = v;
    });
    if (!Object.keys(out).length) return undefined;
    return out;
}

function stripUndefinedDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function findOrgId(store, hint) {
    if (!hint) {
        var keys = Object.keys(store.mapDataByOrg || {});
        var best = null;
        var bestN = -1;
        keys.forEach(function (k) {
            var n = Array.isArray(store.mapDataByOrg[k]) ? store.mapDataByOrg[k].length : 0;
            if (n > bestN) { bestN = n; best = k; }
        });
        return best;
    }
    if (store.mapDataByOrg && store.mapDataByOrg[hint]) return hint;
    var orgById = (store.organizations || []).find(function (o) { return o && String(o.id) === String(hint); });
    if (orgById) return orgById.id;
    var user = (store.users || []).find(function (u) {
        return u && String(u.username || '').toLowerCase() === String(hint).toLowerCase();
    });
    if (user && user.organizationId) return user.organizationId;
    // fuzzy org name
    var byName = (store.organizations || []).find(function (o) {
        return o && String(o.name || '').toLowerCase().indexOf(String(hint).toLowerCase()) >= 0;
    });
    return byName ? byName.id : null;
}

function diffSummary(a, b, pathPrefix) {
    pathPrefix = pathPrefix || '';
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
        return [pathPrefix + ': type/shape mismatch'];
    }
    var diffs = [];
    if (Array.isArray(a)) {
        if (a.length !== b.length) diffs.push(pathPrefix + ': length ' + a.length + ' vs ' + b.length);
        var n = Math.min(a.length, b.length, 20);
        for (var i = 0; i < n; i++) {
            diffs = diffs.concat(diffSummary(a[i], b[i], pathPrefix + '[' + i + ']'));
            if (diffs.length > 40) break;
        }
        return diffs.slice(0, 40);
    }
    if (a && typeof a === 'object') {
        var keys = {};
        Object.keys(a).forEach(function (k) { keys[k] = 1; });
        Object.keys(b).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) {
            if (!(k in a)) diffs.push(pathPrefix + '.' + k + ': missing in input');
            else if (!(k in b)) diffs.push(pathPrefix + '.' + k + ': missing in assembled');
            else diffs = diffs.concat(diffSummary(a[k], b[k], pathPrefix + '.' + k));
        });
        return diffs.slice(0, 40);
    }
    if (a !== b) diffs.push(pathPrefix + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
    return diffs;
}

async function main() {
    var opts = parseArgs(process.argv);
    if (!fs.existsSync(opts.store)) {
        console.error('Store not found:', opts.store);
        process.exit(1);
    }
    var store = JSON.parse(fs.readFileSync(opts.store, 'utf8'));
    var orgId = findOrgId(store, opts.org);
    if (!orgId) {
        console.error('Org not found. Hint:', opts.org || '(largest)');
        process.exit(1);
    }
    var input = store.mapDataByOrg[orgId] || [];
    console.log('[parity] org=', orgId, 'items=', input.length, opts.mysql ? '(mysql)' : '(memory)');

    var mapAssemble = require('../server/db/map-assemble');
    var assembled;

    if (opts.mysql) {
        var { runMigrations } = require('../server/db/migrate');
        var { withTransaction, closePool, query } = require('../server/db/mysql');
        var { toMysqlDate } = require('../server/db/mysql-persist');
        await runMigrations();
        var orgMeta = (store.organizations || []).find(function (o) { return o && o.id === orgId; }) || {
            id: orgId, name: 'parity-test', createdAt: new Date().toISOString()
        };
        await query(
            `INSERT INTO organizations (id, name, created_at) VALUES (?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name)`,
            [orgId, orgMeta.name || 'parity-test', toMysqlDate(orgMeta.createdAt) || toMysqlDate(new Date())]
        );
        assembled = await withTransaction(async function (conn) {
            await mapAssemble.disassembleMapData(conn, orgId, input);
            return mapAssemble.assembleMapData(conn, orgId);
        });
        await closePool();
    } else {
        var { createMemoryConn } = require('../server/db/memory-conn');
        var conn = createMemoryConn();
        await mapAssemble.disassembleMapData(conn, orgId, input);
        assembled = await mapAssemble.assembleMapData(conn, orgId);
    }

    if (!assembled) {
        console.error('[parity] FAIL: assemble returned null/empty');
        process.exit(1);
    }

    var left = canonicalize(stripUndefinedDeep(input));
    var right = canonicalize(stripUndefinedDeep(assembled));
    var leftStr = JSON.stringify(left);
    var rightStr = JSON.stringify(right);

    if (leftStr === rightStr) {
        console.log('[parity] OK — exact canonical match (' + input.length + ' items)');
        process.exit(0);
    }

    // Soft metrics: count by type
    function byType(arr) {
        var m = {};
        (arr || []).forEach(function (it) {
            var t = (it && it.type) || '?';
            m[t] = (m[t] || 0) + 1;
        });
        return m;
    }
    console.log('[parity] input types:', JSON.stringify(byType(input)));
    console.log('[parity] assembled types:', JSON.stringify(byType(assembled)));
    console.log('[parity] byte lengths:', leftStr.length, 'vs', rightStr.length);
    var diffs = diffSummary(left, right, 'map');
    console.log('[parity] sample diffs (' + diffs.length + '):');
    diffs.slice(0, 25).forEach(function (d) { console.log('  ', d); });

    var outDir = path.join(ROOT, 'data', 'parity');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'input-' + orgId + '.json'), JSON.stringify(left, null, 2));
    fs.writeFileSync(path.join(outDir, 'assembled-' + orgId + '.json'), JSON.stringify(right, null, 2));
    console.log('[parity] Wrote data/parity/input-*.json and assembled-*.json for inspection');

    process.exit(1);
}

main().catch(function (e) {
    console.error('[parity] FAILED:', e && e.stack ? e.stack : e);
    process.exit(1);
});
