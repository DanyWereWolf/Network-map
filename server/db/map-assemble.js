'use strict';

/**
 * Assemble / disassemble org map JSON <-> relational MySQL tables.
 * Client continues to receive the same nested document shape.
 */

const FIBER_HOST_TYPES = { sleeve: 1, spliceCassette: 1, cross: 1 };
const ASSIGNMENT_KINDS = [
    { prop: 'nodeConnections', kind: 'node' },
    { prop: 'oltConnections', kind: 'olt' },
    { prop: 'onuConnections', kind: 'onu' },
    { prop: 'mediaConverterConnections', kind: 'mediaConverter' },
    { prop: 'radioBridgeConnections', kind: 'radioBridge' },
    { prop: 'splitterConnections', kind: 'splitter' }
];

function parseJson(val, fallback) {
    if (val == null) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch (e) { return fallback; }
}

function extractLatLon(geometry) {
    if (!Array.isArray(geometry)) return { lat: null, lon: null };
    if (typeof geometry[0] === 'number' && typeof geometry[1] === 'number') {
        return { lat: geometry[0], lon: geometry[1] };
    }
    // polygon / polyline — store first point if available
    if (Array.isArray(geometry[0]) && typeof geometry[0][0] === 'number') {
        return { lat: geometry[0][0], lon: geometry[0][1] };
    }
    return { lat: null, lon: null };
}

/**
 * Clear relational map rows for an org (keeps org_map_blobs).
 */
async function clearOrgMapRows(conn, orgId) {
    const tables = [
        'splitter_outputs', 'splitters', 'fiber_assignments', 'cross_port_patches',
        'cross_fiber_ports', 'fiber_labels', 'fiber_used', 'fiber_splices',
        'device_incoming_fibers', 'olt_port_assignments',
        'object_photos', 'node_switches', 'cable_underground_spans', 'cable_route_points',
        'map_cables', 'map_objects'
    ];
    for (var i = 0; i < tables.length; i++) {
        await conn.query('DELETE FROM `' + tables[i] + '` WHERE org_id = ?', [orgId]);
    }
}

async function disassembleMapData(conn, orgId, items) {
    if (!Array.isArray(items)) items = [];
    await clearOrgMapRows(conn, orgId);

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        var type = item.type || 'unknown';
        var generatedUid = false;
        if (!item.uniqueId) {
            // cableLabel often has only geometry — synthesize a stable id for relational storage
            if (type !== 'cableLabel') continue;
            item = Object.assign({}, item, { uniqueId: 'cableLabel-' + orgId + '-' + i });
            generatedUid = true;
        }
        if (type === 'cable') {
            await insertCable(conn, orgId, item);
        } else {
            await insertObject(conn, orgId, item, { generatedUid: generatedUid });
        }
    }
}

async function insertCable(conn, orgId, item) {
    var cableAttrs = pickCableAttrs(item);
    if (!Object.prototype.hasOwnProperty.call(item, 'revision')) cableAttrs._noRevision = true;
    await conn.query(
        `INSERT INTO map_cables (
            org_id, unique_id, cable_type, fiber_count, fiber_palette_json, name, distance,
            manufacturer, model, from_unique_id, to_unique_id, geometry_json, revision, attrs_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
            orgId,
            item.uniqueId,
            item.cableType || null,
            item.fiberCount != null ? item.fiberCount : null,
            item.fiberPalette ? JSON.stringify(item.fiberPalette) : null,
            item.cableName != null ? item.cableName : (item.name != null ? item.name : null),
            item.distance != null ? item.distance : null,
            item.cableManufacturer || null,
            item.cableModel || null,
            item.fromUniqueId || null,
            item.toUniqueId || null,
            item.geometry ? JSON.stringify(item.geometry) : null,
            item.revision != null ? item.revision : 0,
            JSON.stringify(cableAttrs)
        ]
    );
    var route = item.routeUniqueIds;
    if (Array.isArray(route)) {
        for (var r = 0; r < route.length; r++) {
            await conn.query(
                'INSERT INTO cable_route_points (org_id, cable_unique_id, seq, object_unique_id) VALUES (?,?,?,?)',
                [orgId, item.uniqueId, r, String(route[r])]
            );
        }
    }
    var spans = item.undergroundSpans;
    if (Array.isArray(spans)) {
        for (var s = 0; s < spans.length; s++) {
            var sp = spans[s] || {};
            await conn.query(
                'INSERT INTO cable_underground_spans (org_id, cable_unique_id, entry_manhole_id, exit_manhole_id, path_coords_json) VALUES (?,?,?,?,?)',
                [
                    orgId, item.uniqueId,
                    sp.entryManholeId || null, sp.exitManholeId || null,
                    sp.pathCoords ? JSON.stringify(sp.pathCoords) : null
                ]
            );
        }
    }
}

function pickCableAttrs(item) {
    var skip = {
        type: 1, uniqueId: 1, revision: 1, cableType: 1, fiberCount: 1, fiberPalette: 1,
        cableName: 1, name: 1, distance: 1, cableManufacturer: 1, cableModel: 1,
        fromUniqueId: 1, toUniqueId: 1, geometry: 1, routeUniqueIds: 1, undergroundSpans: 1
        // keep from/to (legacy endpoint indices) in attrs
    };
    var out = {};
    Object.keys(item).forEach(function (k) {
        if (!skip[k]) out[k] = item[k];
    });
    return out;
}

async function insertObject(conn, orgId, item, opts) {
    opts = opts || {};
    var ll = extractLatLon(item.geometry);
    var fiberFields = extractFiberFields(item);
    var attrs = Object.assign({}, item);
    delete attrs.type;
    delete attrs.uniqueId;
    delete attrs.name;
    // Keep geometry in attrs (polygons / non-point shapes); lat/lon are indexed convenience columns
    delete attrs.revision;
    delete attrs.cabinetId;
    delete attrs.cabinetOrder;
    // fiber / splitter fields stored relationally — strip from attrs to avoid duplication bloat
    Object.keys(fiberFields.strip).forEach(function (k) { delete attrs[k]; });
    if (item.type === 'splitter') {
        [
            'splitRatio', 'outputConnections', 'inputFiber', 'inputCableId', 'inputFiberNumber',
            'schemeX', 'schemeY', 'schemeMirrored', 'schemeFlipVertical', 'schemeOrientation', 'id'
        ].forEach(function (k) { delete attrs[k]; });
    }
    if (opts.generatedUid) attrs._generatedUniqueId = true;
    if (!Object.prototype.hasOwnProperty.call(item, 'revision')) attrs._noRevision = true;

    await conn.query(
        `INSERT INTO map_objects (
            org_id, unique_id, type, name, lat, lon, revision, cabinet_id, cabinet_order, attrs_json
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
            orgId, item.uniqueId, item.type || 'unknown', item.name != null ? item.name : null,
            ll.lat, ll.lon,
            item.revision != null ? item.revision : 0,
            item.cabinetId || null,
            item.cabinetOrder != null ? item.cabinetOrder : null,
            JSON.stringify(attrs)
        ]
    );

    if (Array.isArray(item.photos)) {
        for (var p = 0; p < item.photos.length; p++) {
            await conn.query(
                'INSERT INTO object_photos (org_id, object_unique_id, photo_json, seq) VALUES (?,?,?,?)',
                [orgId, item.uniqueId, JSON.stringify(item.photos[p]), p]
            );
        }
    }
    if (item.type === 'node' && Array.isArray(item.attachedSwitches)) {
        for (var sw = 0; sw < item.attachedSwitches.length; sw++) {
            await conn.query(
                'INSERT INTO node_switches (org_id, node_unique_id, switch_json, seq) VALUES (?,?,?,?)',
                [orgId, item.uniqueId, JSON.stringify(item.attachedSwitches[sw]), sw]
            );
        }
    }

    if (FIBER_HOST_TYPES[item.type]) {
        await insertFiberHostRows(conn, orgId, item);
    }
    if (item.type === 'splitter') {
        await insertSplitter(conn, orgId, item.uniqueId, null, item);
    }
    if (item.incomingFiber && item.incomingFiber.cableId != null) {
        await conn.query(
            'INSERT INTO device_incoming_fibers (org_id, object_unique_id, cable_id, fiber_number) VALUES (?,?,?,?)',
            [orgId, item.uniqueId, String(item.incomingFiber.cableId), Number(item.incomingFiber.fiberNumber)]
        );
    }
    if (item.type === 'olt' && item.portAssignments && typeof item.portAssignments === 'object') {
        var ports = item.portAssignments;
        for (var portKey of Object.keys(ports)) {
            var ass = ports[portKey];
            if (!ass || ass.cableId == null) continue;
            await conn.query(
                'INSERT INTO olt_port_assignments (org_id, olt_unique_id, port_number, cable_id, fiber_number) VALUES (?,?,?,?,?)',
                [orgId, item.uniqueId, String(portKey), String(ass.cableId), Number(ass.fiberNumber)]
            );
        }
    }
}

function extractFiberFields(_item) {
    return {
        strip: {
            fiberConnections: 1, usedFibers: 1, fiberLabels: 1, fiberPorts: 1,
            crossPortPatches: 1, embeddedSplitters: 1,
            nodeConnections: 1, oltConnections: 1, onuConnections: 1,
            mediaConverterConnections: 1, radioBridgeConnections: 1, splitterConnections: 1,
            incomingFiber: 1, portAssignments: 1, attachedSwitches: 1, photos: 1
        }
    };
}

async function insertFiberHostRows(conn, orgId, item) {
    var hostId = item.uniqueId;
    var conns = item.fiberConnections;
    if (Array.isArray(conns)) {
        for (var i = 0; i < conns.length; i++) {
            var c = conns[i];
            if (!c || !c.from || !c.to) continue;
            // Preserve original from→to order for JSON parity
            await conn.query(
                `INSERT IGNORE INTO fiber_splices
                (org_id, host_unique_id, cable_a_id, fiber_a, cable_b_id, fiber_b, label)
                VALUES (?,?,?,?,?,?,?)`,
                [
                    orgId, hostId,
                    String(c.from.cableId), Number(c.from.fiberNumber),
                    String(c.to.cableId), Number(c.to.fiberNumber),
                    c.label != null && c.label !== '' ? String(c.label) : null
                ]
            );
        }
    }
    var used = item.usedFibers;
    if (used && typeof used === 'object') {
        for (var cableId of Object.keys(used)) {
            var arr = used[cableId];
            if (!Array.isArray(arr)) continue;
            if (!arr.length) {
                // Sentinel: empty used-fiber list for this cable key
                await conn.query(
                    'INSERT IGNORE INTO fiber_used (org_id, host_unique_id, cable_id, fiber_number) VALUES (?,?,?,?)',
                    [orgId, hostId, String(cableId), -1]
                );
                continue;
            }
            for (var u = 0; u < arr.length; u++) {
                await conn.query(
                    'INSERT IGNORE INTO fiber_used (org_id, host_unique_id, cable_id, fiber_number) VALUES (?,?,?,?)',
                    [orgId, hostId, String(cableId), Number(arr[u])]
                );
            }
        }
    }
    var labels = item.fiberLabels;
    if (labels && typeof labels === 'object') {
        for (var lk of Object.keys(labels)) {
            var parts = String(lk).split('-');
            if (parts.length < 2) continue;
            var fib = Number(parts[parts.length - 1]);
            var cab = parts.slice(0, -1).join('-');
            await conn.query(
                'INSERT INTO fiber_labels (org_id, host_unique_id, cable_id, fiber_number, label) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label)',
                [orgId, hostId, cab, fib, String(labels[lk])]
            );
        }
    }
    if (item.type === 'cross' && item.fiberPorts && typeof item.fiberPorts === 'object') {
        for (var pk of Object.keys(item.fiberPorts)) {
            var pParts = String(pk).split('-');
            if (pParts.length < 2) continue;
            var pFib = Number(pParts[pParts.length - 1]);
            var pCab = pParts.slice(0, -1).join('-');
            await conn.query(
                'INSERT INTO cross_fiber_ports (org_id, cross_unique_id, cable_id, fiber_number, port_number) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE port_number=VALUES(port_number)',
                [orgId, hostId, pCab, pFib, String(item.fiberPorts[pk])]
            );
        }
    }
    if (item.type === 'cross' && item.crossPortPatches && typeof item.crossPortPatches === 'object') {
        for (var fromPort of Object.keys(item.crossPortPatches)) {
            var patch = item.crossPortPatches[fromPort];
            if (!patch) continue;
            await conn.query(
                'INSERT INTO cross_port_patches (org_id, from_cross_id, from_port, to_cross_id, to_port) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE to_cross_id=VALUES(to_cross_id), to_port=VALUES(to_port)',
                [orgId, hostId, String(fromPort), String(patch.crossId || ''), patch.port != null ? patch.port : '']
            );
        }
    }
    for (var ai = 0; ai < ASSIGNMENT_KINDS.length; ai++) {
        var def = ASSIGNMENT_KINDS[ai];
        var map = item[def.prop];
        if (!map || typeof map !== 'object') continue;
        for (var ak of Object.keys(map)) {
            var aParts = String(ak).split('-');
            if (aParts.length < 2) continue;
            var aFib = Number(aParts[aParts.length - 1]);
            var aCab = aParts.slice(0, -1).join('-');
            var val = map[ak] || {};
            var targetId = val.nodeId || val.oltId || val.onuId || val.mediaConverterId ||
                val.radioBridgeId || val.splitterId || null;
            await conn.query(
                `INSERT INTO fiber_assignments
                (org_id, host_unique_id, cable_id, fiber_number, kind, target_id, extras_json)
                VALUES (?,?,?,?,?,?,?)`,
                [orgId, hostId, aCab, aFib, def.kind, targetId != null ? String(targetId) : null, JSON.stringify(val)]
            );
        }
    }
    var emb = item.embeddedSplitters;
    if (Array.isArray(emb)) {
        for (var e = 0; e < emb.length; e++) {
            await insertSplitter(conn, orgId, emb[e].id || ('esp-' + e), hostId, emb[e]);
        }
    }
}

async function insertSplitter(conn, orgId, splitterId, hostUniqueId, rec) {
    if (!splitterId) return;
    var layout = {
        schemeX: rec.schemeX, schemeY: rec.schemeY,
        schemeMirrored: rec.schemeMirrored, schemeFlipVertical: rec.schemeFlipVertical,
        schemeOrientation: rec.schemeOrientation,
        outputLabels: rec.outputLabels
    };
    var input = rec.inputFiber || null;
    if (rec.inputCableId != null) {
        input = { cableId: rec.inputCableId, fiberNumber: rec.inputFiberNumber };
    }
    await conn.query(
        `INSERT INTO splitters (org_id, splitter_id, host_unique_id, name, split_ratio, layout_json, input_json)
         VALUES (?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), split_ratio=VALUES(split_ratio),
           layout_json=VALUES(layout_json), input_json=VALUES(input_json), host_unique_id=VALUES(host_unique_id)`,
        [
            orgId, String(splitterId), hostUniqueId,
            rec.name || null,
            rec.splitRatio != null ? Number(rec.splitRatio) : 2,
            JSON.stringify(layout),
            input ? JSON.stringify(input) : null
        ]
    );
    var outs = rec.outputConnections;
    if (Array.isArray(outs)) {
        for (var oi = 0; oi < outs.length; oi++) {
            var out = outs[oi];
            var kind = null;
            if (out) {
                if (out.cableId != null) kind = 'fiber';
                else if (out.crossPort != null) kind = 'cross_port';
                else if (out.splitterId) kind = 'splitter';
                else if (out.onuId) kind = 'onu';
                else if (out.mediaConverterId) kind = 'mediaConverter';
                else if (out.nodeId) kind = 'node';
            }
            await conn.query(
                `INSERT INTO splitter_outputs (org_id, splitter_id, output_index, target_kind, payload_json)
                 VALUES (?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE target_kind=VALUES(target_kind), payload_json=VALUES(payload_json)`,
                [orgId, String(splitterId), oi, kind, out ? JSON.stringify(out) : null]
            );
        }
    }
}

/**
 * Rebuild map JSON array for org from relational tables.
 * Falls back to empty array if no rows.
 */
async function assembleMapData(conn, orgId) {
    const [objects] = await conn.query('SELECT * FROM map_objects WHERE org_id = ?', [orgId]);
    const [cables] = await conn.query('SELECT * FROM map_cables WHERE org_id = ?', [orgId]);
    if ((!objects || !objects.length) && (!cables || !cables.length)) {
        return null; // signal: use blob fallback
    }

    const [routes] = await conn.query('SELECT * FROM cable_route_points WHERE org_id = ? ORDER BY cable_unique_id, seq', [orgId]);
    const [spans] = await conn.query('SELECT * FROM cable_underground_spans WHERE org_id = ?', [orgId]);
    const [photos] = await conn.query('SELECT * FROM object_photos WHERE org_id = ? ORDER BY object_unique_id, seq', [orgId]);
    const [switches] = await conn.query('SELECT * FROM node_switches WHERE org_id = ? ORDER BY node_unique_id, seq', [orgId]);
    const [splices] = await conn.query('SELECT * FROM fiber_splices WHERE org_id = ?', [orgId]);
    const [used] = await conn.query('SELECT * FROM fiber_used WHERE org_id = ?', [orgId]);
    const [labels] = await conn.query('SELECT * FROM fiber_labels WHERE org_id = ?', [orgId]);
    const [ports] = await conn.query('SELECT * FROM cross_fiber_ports WHERE org_id = ?', [orgId]);
    const [patches] = await conn.query('SELECT * FROM cross_port_patches WHERE org_id = ?', [orgId]);
    const [assigns] = await conn.query('SELECT * FROM fiber_assignments WHERE org_id = ?', [orgId]);
    const [splitters] = await conn.query('SELECT * FROM splitters WHERE org_id = ?', [orgId]);
    const [spOuts] = await conn.query('SELECT * FROM splitter_outputs WHERE org_id = ? ORDER BY splitter_id, output_index', [orgId]);
    const [incoming] = await conn.query('SELECT * FROM device_incoming_fibers WHERE org_id = ?', [orgId]);
    const [oltPorts] = await conn.query('SELECT * FROM olt_port_assignments WHERE org_id = ?', [orgId]);

    var routesByCable = groupBy(routes, 'cable_unique_id');
    var spansByCable = groupBy(spans, 'cable_unique_id');
    var photosByObj = groupBy(photos, 'object_unique_id');
    var swByNode = groupBy(switches, 'node_unique_id');
    var splicesByHost = groupBy(splices, 'host_unique_id');
    var usedByHost = groupBy(used, 'host_unique_id');
    var labelsByHost = groupBy(labels, 'host_unique_id');
    var portsByCross = groupBy(ports, 'cross_unique_id');
    var patchesByCross = groupBy(patches, 'from_cross_id');
    var assignsByHost = groupBy(assigns, 'host_unique_id');
    var splittersByHost = {};
    var mapLevelSplitters = [];
    (splitters || []).forEach(function (sp) {
        if (sp.host_unique_id) {
            if (!splittersByHost[sp.host_unique_id]) splittersByHost[sp.host_unique_id] = [];
            splittersByHost[sp.host_unique_id].push(sp);
        } else {
            mapLevelSplitters.push(sp);
        }
    });
    var outsBySplitter = groupBy(spOuts, 'splitter_id');
    var incomingByObj = indexBy(incoming, 'object_unique_id');
    var oltById = groupBy(oltPorts, 'olt_unique_id');

    var out = [];

    (objects || []).forEach(function (row) {
        var attrs = parseJson(row.attrs_json, {});
        var item = Object.assign({}, attrs, {
            type: row.type,
            uniqueId: row.unique_id,
            revision: row.revision
        });
        if (row.name != null) item.name = row.name;
        else delete item.name;
        if (row.cabinet_id) item.cabinetId = row.cabinet_id;
        if (row.cabinet_order != null) item.cabinetOrder = row.cabinet_order;
        if (!item.geometry && row.lat != null && row.lon != null) {
            item.geometry = [row.lat, row.lon];
        }
        var ph = photosByObj[row.unique_id];
        if (ph && ph.length) item.photos = ph.map(function (p) { return parseJson(p.photo_json, p.photo_json); });
        if (row.type === 'node') {
            var nsw = swByNode[row.unique_id];
            if (nsw && nsw.length) item.attachedSwitches = nsw.map(function (s) { return parseJson(s.switch_json, {}); });
        }
        if (FIBER_HOST_TYPES[row.type]) {
            applyFiberHostFromRows(item, row.unique_id, {
                splicesByHost: splicesByHost, usedByHost: usedByHost, labelsByHost: labelsByHost,
                portsByCross: portsByCross, patchesByCross: patchesByCross, assignsByHost: assignsByHost,
                splittersByHost: splittersByHost, outsBySplitter: outsBySplitter
            });
        }
        if (row.type === 'splitter') {
            var spRow = (splitters || []).find(function (s) { return s.splitter_id === row.unique_id; });
            if (spRow) applySplitterFields(item, spRow, outsBySplitter[spRow.splitter_id] || []);
        }
        var inc = incomingByObj[row.unique_id];
        if (inc) item.incomingFiber = { cableId: inc.cable_id, fiberNumber: Number(inc.fiber_number) };
        if (row.type === 'olt') {
            var op = oltById[row.unique_id] || [];
            if (op.length) {
                item.portAssignments = {};
                op.forEach(function (o) {
                    item.portAssignments[o.port_number] = { cableId: o.cable_id, fiberNumber: Number(o.fiber_number) };
                });
            }
        }
        pruneNullish(item);
        if (item._generatedUniqueId) {
            delete item.uniqueId;
            delete item._generatedUniqueId;
        }
        if (item._noRevision) {
            delete item.revision;
            delete item._noRevision;
        }
        out.push(item);
    });

    (cables || []).forEach(function (row) {
        var attrs = parseJson(row.attrs_json, {});
        var item = Object.assign({}, attrs, {
            type: 'cable',
            uniqueId: row.unique_id,
            revision: row.revision
        });
        if (row.cable_type != null) item.cableType = row.cable_type;
        if (row.fiber_count != null) item.fiberCount = row.fiber_count;
        if (row.name != null) item.cableName = row.name;
        if (row.distance != null) item.distance = row.distance;
        if (row.manufacturer != null) item.cableManufacturer = row.manufacturer;
        if (row.model != null) item.cableModel = row.model;
        if (row.from_unique_id != null) item.fromUniqueId = row.from_unique_id;
        if (row.to_unique_id != null) item.toUniqueId = row.to_unique_id;
        var geom = parseJson(row.geometry_json, null);
        if (geom != null) item.geometry = geom;
        var palette = parseJson(row.fiber_palette_json, null);
        if (palette != null) item.fiberPalette = palette;
        var rt = routesByCable[row.unique_id];
        if (rt && rt.length) item.routeUniqueIds = rt.map(function (r) { return r.object_unique_id; });
        var ug = spansByCable[row.unique_id];
        if (ug && ug.length) {
            item.undergroundSpans = ug.map(function (s) {
                var span = {};
                if (s.entry_manhole_id != null) span.entryManholeId = s.entry_manhole_id;
                if (s.exit_manhole_id != null) span.exitManholeId = s.exit_manhole_id;
                var pc = parseJson(s.path_coords_json, null);
                if (pc != null) span.pathCoords = pc;
                return span;
            });
        }
        pruneNullish(item);
        if (item._noRevision) {
            delete item.revision;
            delete item._noRevision;
        }
        out.push(item);
    });

    return out;
}

function pruneNullish(obj) {
    if (!obj || typeof obj !== 'object') return;
    Object.keys(obj).forEach(function (k) {
        if (obj[k] === null || obj[k] === undefined) delete obj[k];
    });
}

function applyFiberHostFromRows(item, hostId, bags) {
    var splices = bags.splicesByHost[hostId] || [];
    if (splices.length) {
        item.fiberConnections = splices.map(function (s) {
            var conn = {
                from: { cableId: s.cable_a_id, fiberNumber: Number(s.fiber_a) },
                to: { cableId: s.cable_b_id, fiberNumber: Number(s.fiber_b) }
            };
            if (s.label) conn.label = s.label;
            return conn;
        });
    }
    var usedRows = bags.usedByHost[hostId] || [];
    if (usedRows.length) {
        item.usedFibers = {};
        usedRows.forEach(function (u) {
            if (!item.usedFibers[u.cable_id]) item.usedFibers[u.cable_id] = [];
            if (Number(u.fiber_number) < 0) return; // empty-list sentinel
            item.usedFibers[u.cable_id].push(Number(u.fiber_number));
        });
    }
    var labRows = bags.labelsByHost[hostId] || [];
    if (labRows.length) {
        item.fiberLabels = {};
        labRows.forEach(function (l) {
            item.fiberLabels[l.cable_id + '-' + l.fiber_number] = l.label;
        });
    }
    if (item.type === 'cross') {
        var portRows = bags.portsByCross[hostId] || [];
        if (portRows.length) {
            item.fiberPorts = {};
            portRows.forEach(function (p) {
                item.fiberPorts[p.cable_id + '-' + p.fiber_number] = p.port_number;
            });
        }
        var patchRows = bags.patchesByCross[hostId] || [];
        if (patchRows.length) {
            item.crossPortPatches = {};
            patchRows.forEach(function (p) {
                var portVal = p.to_port;
                if (portVal != null && portVal !== '' && !isNaN(Number(portVal)) && String(Number(portVal)) === String(portVal).trim()) {
                    portVal = Number(portVal);
                }
                item.crossPortPatches[p.from_port] = { crossId: p.to_cross_id, port: portVal };
            });
        }
    }
    var asg = bags.assignsByHost[hostId] || [];
    asg.forEach(function (a) {
        var prop = null;
        if (a.kind === 'node') prop = 'nodeConnections';
        else if (a.kind === 'olt') prop = 'oltConnections';
        else if (a.kind === 'onu') prop = 'onuConnections';
        else if (a.kind === 'mediaConverter') prop = 'mediaConverterConnections';
        else if (a.kind === 'radioBridge') prop = 'radioBridgeConnections';
        else if (a.kind === 'splitter') prop = 'splitterConnections';
        if (!prop) return;
        if (!item[prop]) item[prop] = {};
        item[prop][a.cable_id + '-' + a.fiber_number] = parseJson(a.extras_json, {});
    });
    var emb = bags.splittersByHost[hostId] || [];
    if (emb.length) {
        item.embeddedSplitters = emb.map(function (sp) {
            return buildSplitterRecord(sp, bags.outsBySplitter[sp.splitter_id] || []);
        });
    }
}

function applySplitterFields(item, spRow, outs) {
    var rec = buildSplitterRecord(spRow, outs);
    if (rec.splitRatio != null) item.splitRatio = rec.splitRatio;
    if (rec.name != null) item.name = rec.name;
    if (rec.inputFiber) item.inputFiber = rec.inputFiber;
    if (rec.outputConnections) item.outputConnections = rec.outputConnections;
    ['schemeX', 'schemeY', 'schemeMirrored', 'schemeFlipVertical', 'schemeOrientation', 'outputLabels'].forEach(function (k) {
        if (rec[k] !== undefined && rec[k] !== null) item[k] = rec[k];
    });
}

function buildSplitterRecord(spRow, outs) {
    var layout = parseJson(spRow.layout_json, {}) || {};
    var input = parseJson(spRow.input_json, null);
    var outputConnections = [];
    var maxIdx = -1;
    (outs || []).forEach(function (o) {
        if (o.output_index > maxIdx) maxIdx = o.output_index;
    });
    if (maxIdx >= 0) {
        for (var i = 0; i <= maxIdx; i++) outputConnections[i] = null;
        (outs || []).forEach(function (o) {
            outputConnections[o.output_index] = o.payload_json != null ? parseJson(o.payload_json, null) : null;
        });
    }
    var rec = {
        id: spRow.splitter_id,
        name: spRow.name,
        splitRatio: spRow.split_ratio,
        outputConnections: maxIdx >= 0 ? outputConnections : undefined,
        schemeX: layout.schemeX,
        schemeY: layout.schemeY,
        schemeMirrored: layout.schemeMirrored,
        schemeFlipVertical: layout.schemeFlipVertical,
        schemeOrientation: layout.schemeOrientation
    };
    if (layout.outputLabels !== undefined) rec.outputLabels = layout.outputLabels;
    if (input) {
        rec.inputFiber = input;
        if (input.cableId != null) {
            rec.inputCableId = input.cableId;
            rec.inputFiberNumber = input.fiberNumber;
        }
    }
    return rec;
}

function groupBy(rows, key) {
    var out = {};
    (rows || []).forEach(function (r) {
        var k = r[key];
        if (!out[k]) out[k] = [];
        out[k].push(r);
    });
    return out;
}

function indexBy(rows, key) {
    var out = {};
    (rows || []).forEach(function (r) { out[r[key]] = r; });
    return out;
}

module.exports = {
    disassembleMapData,
    assembleMapData,
    clearOrgMapRows,
    FIBER_HOST_TYPES
};
