'use strict';

/**
 * Обёртка над mysql2-соединением: однострочные INSERT ... VALUES (?,?,..) с одинаковым SQL
 * копятся и уходят одним многострочным INSERT. Любой другой запрос сначала сбрасывает очередь,
 * поэтому порядок DELETE → INSERT сохраняется. Результаты отложенных INSERT не возвращаются.
 */
const INSERT_RE = /^\s*(INSERT\s+(?:IGNORE\s+)?INTO\s+[\s\S]*?\bVALUES\s*)(\(\s*\?(?:\s*,\s*\?)*\s*\))([\s\S]*)$/i;
const MAX_ROWS = 1000;
const MAX_BYTES = 2 * 1024 * 1024;

function paramBytes(p) {
    if (p == null) return 4;
    if (typeof p === 'string') return p.length + 2;
    if (Buffer.isBuffer(p)) return p.length * 2;
    return 16;
}

function createBatchingConn(conn) {
    var groups = new Map();
    var stats = { statements: 0, rows: 0 };

    async function flushGroup(g) {
        if (!g.rows) return;
        var sql = g.prefix + new Array(g.rows).fill(g.tuple).join(',') + g.suffix;
        var params = g.params;
        g.rows = 0;
        g.params = [];
        g.bytes = 0;
        stats.statements++;
        await conn.query(sql, params);
    }

    async function flush() {
        for (const g of groups.values()) await flushGroup(g);
    }

    async function query(sql, params) {
        var m = typeof sql === 'string' && Array.isArray(params) ? INSERT_RE.exec(sql) : null;
        if (m) {
            var placeholders = (m[2].match(/\?/g) || []).length;
            if (placeholders === params.length && m[3].indexOf('?') === -1) {
                var g = groups.get(sql);
                if (!g) {
                    g = { prefix: m[1], tuple: m[2], suffix: m[3], rows: 0, params: [], bytes: 0 };
                    groups.set(sql, g);
                }
                for (var i = 0; i < params.length; i++) {
                    g.params.push(params[i]);
                    g.bytes += paramBytes(params[i]);
                }
                g.rows++;
                stats.rows++;
                if (g.rows >= MAX_ROWS || g.bytes >= MAX_BYTES) await flushGroup(g);
                return [{ affectedRows: 0, deferred: true }];
            }
        }
        await flush();
        stats.statements++;
        return conn.query(sql, params);
    }

    return { query: query, flush: flush, stats: stats };
}

module.exports = { createBatchingConn };
