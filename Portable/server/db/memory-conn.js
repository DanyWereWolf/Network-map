'use strict';

/**
 * Minimal in-memory MySQL stand-in for assemble/disassemble parity tests (no server required).
 * Supports the query shapes used by map-assemble.js.
 */
function createMemoryConn() {
    var tables = Object.create(null);

    function ensure(name) {
        if (!tables[name]) tables[name] = [];
        return tables[name];
    }

    function parseInsert(sql, params) {
        var m = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (!m) return null;
        var table = m[1];
        var cols = m[2].split(',').map(function (c) { return c.trim().replace(/`/g, ''); });
        var row = {};
        for (var i = 0; i < cols.length; i++) row[cols[i]] = params[i];
        return { table: table, row: row, ignore: /INSERT\s+IGNORE/i.test(sql), upsert: /ON DUPLICATE KEY UPDATE/i.test(sql) };
    }

    function uniqueKey(table, row) {
        if (table === 'fiber_splices') {
            return [row.org_id, row.host_unique_id, row.cable_a_id, row.fiber_a, row.cable_b_id, row.fiber_b].join('\0');
        }
        if (table === 'fiber_used') {
            return [row.org_id, row.host_unique_id, row.cable_id, row.fiber_number].join('\0');
        }
        if (table === 'fiber_labels') {
            return [row.org_id, row.host_unique_id, row.cable_id, row.fiber_number].join('\0');
        }
        if (table === 'cross_fiber_ports') {
            return [row.org_id, row.cross_unique_id, row.cable_id, row.fiber_number].join('\0');
        }
        if (table === 'cross_port_patches') {
            return [row.org_id, row.from_cross_id, row.from_port].join('\0');
        }
        if (table === 'splitters') {
            return [row.org_id, row.splitter_id].join('\0');
        }
        if (table === 'splitter_outputs') {
            return [row.org_id, row.splitter_id, row.output_index].join('\0');
        }
        if (table === 'map_objects' || table === 'map_cables') {
            return [row.org_id, row.unique_id].join('\0');
        }
        if (table === 'cable_route_points') {
            return [row.org_id, row.cable_unique_id, row.seq].join('\0');
        }
        return null;
    }

    async function query(sql, params) {
        params = params || [];
        var s = String(sql).replace(/\s+/g, ' ').trim();

        if (/^DELETE FROM/i.test(s)) {
            var dm = s.match(/^DELETE FROM `?(\w+)`? WHERE org_id = \?/i);
            if (dm) {
                var t = ensure(dm[1]);
                tables[dm[1]] = t.filter(function (r) { return String(r.org_id) !== String(params[0]); });
                return [{ affectedRows: t.length - tables[dm[1]].length }];
            }
            return [{ affectedRows: 0 }];
        }

        if (/^SELECT \* FROM/i.test(s)) {
            var sm = s.match(/^SELECT \* FROM `?(\w+)`? WHERE org_id = \?/i);
            if (sm) {
                var rows = ensure(sm[1]).filter(function (r) { return String(r.org_id) === String(params[0]); });
                if (/ORDER BY/i.test(s)) {
                    // Best-effort stable order for known patterns
                    if (/cable_unique_id, seq/i.test(s)) {
                        rows = rows.slice().sort(function (a, b) {
                            var c = String(a.cable_unique_id).localeCompare(String(b.cable_unique_id));
                            return c || (a.seq - b.seq);
                        });
                    } else if (/object_unique_id, seq/i.test(s) || /node_unique_id, seq/i.test(s)) {
                        rows = rows.slice().sort(function (a, b) {
                            var k1 = a.object_unique_id || a.node_unique_id;
                            var k2 = b.object_unique_id || b.node_unique_id;
                            var c = String(k1).localeCompare(String(k2));
                            return c || (a.seq - b.seq);
                        });
                    } else if (/splitter_id, output_index/i.test(s)) {
                        rows = rows.slice().sort(function (a, b) {
                            var c = String(a.splitter_id).localeCompare(String(b.splitter_id));
                            return c || (a.output_index - b.output_index);
                        });
                    }
                }
                return [rows];
            }
            return [[]];
        }

        if (/^INSERT/i.test(s)) {
            var ins = parseInsert(s, params);
            if (!ins) throw new Error('memory-conn: unsupported INSERT: ' + s.slice(0, 120));
            var list = ensure(ins.table);
            var uk = uniqueKey(ins.table, ins.row);
            if (uk != null) {
                var idx = list.findIndex(function (r) { return uniqueKey(ins.table, r) === uk; });
                if (idx >= 0) {
                    if (ins.ignore) return [{ affectedRows: 0 }];
                    if (ins.upsert) {
                        list[idx] = Object.assign({}, list[idx], ins.row);
                        return [{ affectedRows: 1 }];
                    }
                }
            }
            list.push(Object.assign({}, ins.row));
            return [{ affectedRows: 1 }];
        }

        throw new Error('memory-conn: unsupported SQL: ' + s.slice(0, 160));
    }

    return {
        query: query,
        _tables: tables
    };
}

module.exports = { createMemoryConn };
