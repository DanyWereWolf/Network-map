/**
 * Волокна кабеля: usedFibers, группы, связанные кабели.
 */
function removeCableFromUsedFibers(obj, cableUniqueId) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (usedFibersData && usedFibersData[cableUniqueId]) {
        delete usedFibersData[cableUniqueId];
        obj.properties.set('usedFibers', usedFibersData);
        saveData();
    }
}

async function changeCableType(cableUniqueId, newValue) {
    var count = parseInt(newValue, 10);
    if (isNaN(count)) count = getFiberCount(newValue);
    return updateCableFiberSettings(cableUniqueId, count, undefined);
}

function getFiberCount(arg) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getFiberCount(arg);
    if (arg === 'copper') return 1;
    return 0;
}

/** Кабели через опору или крепление: концы маршрута (from/to) или промежуточная точка (points / геометрия). */
function getCablesThroughSupport(supportObj) {
    if (!supportObj || !supportObj.geometry) return [];
    var supportCoords = supportObj.geometry.getCoordinates();
    if (!supportCoords || supportCoords.length < 2) return [];
    var supportId = getObjectUniqueId(supportObj);
    var tol = 1e-6;
    function coordsMatch(a, b) {
        if (!a || !b || a.length < 2 || b.length < 2) return false;
        return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
    }
    var direct = objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === supportObj || to === supportObj) return true;
        if (from && getObjectUniqueId(from) === supportId) return true;
        if (to && getObjectUniqueId(to) === supportId) return true;
        var points = cable.properties.get('points');
        if (Array.isArray(points) && points.some(function(p) { return p === supportObj || (p && getObjectUniqueId(p) === supportId); })) return true;
        var geom = cable.geometry && cable.geometry.getCoordinates && cable.geometry.getCoordinates();
        if (!geom || !Array.isArray(geom)) return false;
        return geom.some(function(c) { return coordsMatch(c, supportCoords); });
    });
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getConnectedCables(obj) {
    var objUid = obj && obj.properties ? getObjectUniqueId(obj) : null;
    var memberCabId = (typeof getObjectCabinetId === 'function' && obj) ? getObjectCabinetId(obj) : '';
    var routeMatch = typeof traceRouteObjectsMatch === 'function' ? traceRouteObjectsMatch : function(a, b) {
        return a === b || (a && b && getObjectUniqueId(a) === getObjectUniqueId(b));
    };
    var scan = objects;
    if (typeof MapPerf !== 'undefined' && MapPerf.getObjectsByType) {
        var typed = MapPerf.getObjectsByType('cable');
        if (Array.isArray(typed) && typed.length) scan = typed;
    }
    var direct = scan.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === obj || to === obj) return true;
        if (!objUid) return false;
        if ((from && getObjectUniqueId(from) === objUid) || (to && getObjectUniqueId(to) === objUid)) return true;
        if (memberCabId) {
            if (from && from.properties && from.properties.get('type') === 'cabinet' &&
                getObjectUniqueId(from) === memberCabId) return true;
            if (to && to.properties && to.properties.get('type') === 'cabinet' &&
                getObjectUniqueId(to) === memberCabId) return true;
        }
        if (routeMatch(from, obj) || routeMatch(to, obj)) return true;
        return false;
    });
    // Стабильная сортировка по uniqueId кабеля, чтобы порядок не «прыгал» при обновлении (опоры, муфта, кросс)
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        if (!idA) idA = '';
        if (!idB) idB = '';
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getOtherEndOfCable(cable, oneEnd) {
    if (!cable || !oneEnd) return null;
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    if (fromObj === oneEnd) return toObj;
    if (toObj === oneEnd) return fromObj;
    const oneId = getObjectUniqueId(oneEnd);
    if (fromObj && getObjectUniqueId(fromObj) === oneId) return toObj;
    if (toObj && getObjectUniqueId(toObj) === oneId) return fromObj;
    var memberCabId = typeof getObjectCabinetId === 'function' ? getObjectCabinetId(oneEnd) : '';
    if (memberCabId) {
        if (fromObj && fromObj.properties && fromObj.properties.get('type') === 'cabinet' &&
            getObjectUniqueId(fromObj) === memberCabId) return toObj;
        if (toObj && toObj.properties && toObj.properties.get('type') === 'cabinet' &&
            getObjectUniqueId(toObj) === memberCabId) return fromObj;
    }
    var routeMatch = typeof traceRouteObjectsMatch === 'function' ? traceRouteObjectsMatch : function(a, b) {
        return a === b || (a && b && getObjectUniqueId(a) === getObjectUniqueId(b));
    };
    if (routeMatch(fromObj, oneEnd)) return toObj;
    if (routeMatch(toObj, oneEnd)) return fromObj;
    return null;
}

function crossHasFiberForConnection(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    const cables = getConnectedCables(crossObj);
    const cable = cables.find(c => c.properties && c.properties.get('uniqueId') === cableId);
    if (!cable) return false;
    const n = getFiberCount(cable);
    return fiberNumber >= 1 && fiberNumber <= n;
}

function parseFiberPortKey(key) {
    if (!key) return null;
    const lastDash = key.lastIndexOf('-');
    if (lastDash < 0) return null;
    const fiberNumber = parseInt(key.substring(lastDash + 1), 10);
    if (isNaN(fiberNumber)) return null;
    return { cableId: key.substring(0, lastDash), fiberNumber: fiberNumber, key: key };
}

function getCrossPortForFiber(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return null;
    const fiberPorts = crossObj.properties.get('fiberPorts') || {};
    const port = fiberPorts[cableId + '-' + fiberNumber];
    if (port != null && String(port).trim() !== '') {
        const portNum = parseInt(port, 10);
        if (!isNaN(portNum)) return portNum;
    }
    if (typeof findCrossPortForLogicalFiber === 'function') {
        return findCrossPortForLogicalFiber(crossObj, cableId, fiberNumber);
    }
    return null;
}

function findFiberKeysByCrossPort(fiberPorts, portNumber) {
    if (!fiberPorts || portNumber == null) return [];
    const portStr = String(portNumber);
    return Object.keys(fiberPorts).filter(function(key) {
        return String(fiberPorts[key]) === portStr;
    });
}

function getCrossPortMateFibers(crossObj, cableId, fiberNumber) {
    if (!crossObj || !isCrossLikeHostType(crossObj.properties.get('type'))) return [];
    const port = getCrossPortForFiber(crossObj, cableId, fiberNumber);
    if (port == null) return [];
    const fiberPorts = crossObj.properties.get('fiberPorts') || {};
    const selfKey = cableId + '-' + fiberNumber;
    return findFiberKeysByCrossPort(fiberPorts, port)
        .filter(function(key) { return key !== selfKey; })
        .map(function(key) {
            const parsed = parseFiberPortKey(key);
            return parsed ? { cableId: parsed.cableId, fiberNumber: parsed.fiberNumber } : null;
        })
        .filter(Boolean);
}

function isFiberPortSplicedAtHost(crossObj, cableId, fiberNumber) {
    return getCrossPortMateFibers(crossObj, cableId, fiberNumber).length > 0;
}

function isFiberSplicedAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    var idx = getHostFiberConnIndex(hostObj);
    if (idx) return idx.splicedKeys.has(String(cableId) + '-' + Number(fiberNumber));
    const fiberConnections = hostObj.properties.get('fiberConnections') || [];
    const fn = Number(fiberNumber);
    const cid = String(cableId);
    return fiberConnections.some(function(conn) {
        return (conn.from && String(conn.from.cableId) === cid && Number(conn.from.fiberNumber) === fn) ||
            (conn.to && String(conn.to.cableId) === cid && Number(conn.to.fiberNumber) === fn);
    });
}

function isFiberConnectedAtHost(hostObj, cableId, fiberNumber) {
    return isFiberSplicedAtHost(hostObj, cableId, fiberNumber);
}

/** Индекс fiberConnections хоста: O(1) проверка сращения и соседей. */
function buildFiberConnIndex(fiberConnections) {
    var splicedKeys = new Set();
    var connByFiber = new Map();
    var neighbors = new Map();
    (fiberConnections || []).forEach(function(conn) {
        if (!conn || !conn.from || !conn.to) return;
        var fk = String(conn.from.cableId) + '-' + Number(conn.from.fiberNumber);
        var tk = String(conn.to.cableId) + '-' + Number(conn.to.fiberNumber);
        splicedKeys.add(fk);
        splicedKeys.add(tk);
        if (!connByFiber.has(fk)) connByFiber.set(fk, conn);
        if (!connByFiber.has(tk)) connByFiber.set(tk, conn);
        if (!neighbors.has(fk)) neighbors.set(fk, []);
        if (!neighbors.has(tk)) neighbors.set(tk, []);
        neighbors.get(fk).push({ cableId: conn.to.cableId, fiberNumber: Number(conn.to.fiberNumber) });
        neighbors.get(tk).push({ cableId: conn.from.cableId, fiberNumber: Number(conn.from.fiberNumber) });
    });
    return { splicedKeys: splicedKeys, connByFiber: connByFiber, neighbors: neighbors };
}

function getHostFiberConnIndex(hostObj) {
    if (!hostObj || !hostObj.properties) return null;
    var fc = hostObj.properties.get('fiberConnections') || [];
    var idx = hostObj._fiberConnIndex;
    if (idx && idx._srcLen === fc.length) return idx;
    idx = buildFiberConnIndex(fc);
    idx._srcLen = fc.length;
    hostObj._fiberConnIndex = idx;
    return idx;
}

function invalidateHostFiberConnIndex(hostObj) {
    if (!hostObj) return;
    delete hostObj._fiberConnIndex;
    if (typeof clearFiberHostLookupCaches === 'function') {
        clearFiberHostLookupCaches(hostObj);
    } else if (hostObj._fiberSignalCache) {
        try { hostObj._fiberSignalCache.clear(); } catch (e) { delete hostObj._fiberSignalCache; }
    }
}
window.buildFiberConnIndex = buildFiberConnIndex;
window.getHostFiberConnIndex = getHostFiberConnIndex;
window.invalidateHostFiberConnIndex = invalidateHostFiberConnIndex;

function getFiberNeighborsAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return [];
    var idx = getHostFiberConnIndex(hostObj);
    if (idx) {
        return (idx.neighbors.get(String(cableId) + '-' + Number(fiberNumber)) || []).slice();
    }
    const neighbors = [];
    const connections = hostObj.properties.get('fiberConnections') || [];
    const fn = Number(fiberNumber);
    connections.forEach(function(conn) {
        if (!conn || !conn.from || !conn.to) return;
        if (String(conn.from.cableId) === String(cableId) && Number(conn.from.fiberNumber) === fn) {
            neighbors.push({ cableId: conn.to.cableId, fiberNumber: Number(conn.to.fiberNumber) });
        } else if (String(conn.to.cableId) === String(cableId) && Number(conn.to.fiberNumber) === fn) {
            neighbors.push({ cableId: conn.from.cableId, fiberNumber: Number(conn.from.fiberNumber) });
        }
    });
    return neighbors;
}

function getTotalUsedPortsInCross(crossObj) {
    if (!crossObj || !crossObj.properties || !isCrossLikeHostType(crossObj.properties.get('type'))) {
        return 0;
    }
    const fiberPorts = crossObj.properties.get('fiberPorts') || {};
    const usedPortNums = new Set();
    Object.keys(fiberPorts).forEach(function(key) {
        const lastDash = key.lastIndexOf('-');
        if (lastDash < 0) return;
        const cableId = key.substring(0, lastDash);
        const fiberNumber = parseInt(key.substring(lastDash + 1), 10);
        if (isFiberSplicedAtHost(crossObj, cableId, fiberNumber)) return;
        const port = parseInt(fiberPorts[key], 10);
        if (!isNaN(port) && port > 0) usedPortNums.add(port);
    });
    var patches = typeof getCrossPortPatches === 'function'
        ? getCrossPortPatches(crossObj)
        : (crossObj.properties.get('crossPortPatches') || {});
    Object.keys(patches).forEach(function(portKey) {
        var port = parseInt(portKey, 10);
        if (!isNaN(port) && port > 0) usedPortNums.add(port);
    });
    if (typeof findSplitterOutputOnCrossPort === 'function' && window.EmbeddedSplitters) {
        var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
        for (var p = 1; p <= crossPorts; p++) {
            if (findSplitterOutputOnCrossPort(crossObj, p)) usedPortNums.add(p);
        }
    }
    return usedPortNums.size;
}

/**
 * Сколько волокон реально занято в муфте/кассете: сращивания, явная отметка «исп.»,
 * выводы на узел/OLT/ONU/МК/РМ/сплиттер. Просто пришедший кабель без связей не считается занятым.
 */
function getTotalUsedFibersInSleeve(sleeveObj) {
    if (!sleeveObj || !sleeveObj.properties || !isSleeveLikeHostType(sleeveObj.properties.get('type'))) {
        return 0;
    }

    var used = Object.create(null);

    function mark(cableId, fiberNumber) {
        if (cableId == null || cableId === '' || fiberNumber == null) return;
        var n = Number(fiberNumber);
        if (!isFinite(n)) return;
        used[String(cableId) + '-' + n] = true;
    }

    var usedFibersData = sleeveObj.properties.get('usedFibers') || {};
    Object.keys(usedFibersData).forEach(function(cableId) {
        var arr = usedFibersData[cableId];
        if (!Array.isArray(arr)) return;
        for (var i = 0; i < arr.length; i++) mark(cableId, arr[i]);
    });

    var conns = sleeveObj.properties.get('fiberConnections') || [];
    for (var ci = 0; ci < conns.length; ci++) {
        var conn = conns[ci];
        if (!conn) continue;
        if (conn.from) mark(conn.from.cableId, conn.from.fiberNumber);
        if (conn.to) mark(conn.to.cableId, conn.to.fiberNumber);
    }

    ['nodeConnections', 'oltConnections', 'onuConnections', 'mediaConverterConnections',
        'radioBridgeConnections', 'splitterConnections'].forEach(function(prop) {
        var map = sleeveObj.properties.get(prop) || {};
        Object.keys(map).forEach(function(key) {
            if (map[key]) used[key] = true;
        });
    });

    if (window.EmbeddedSplitters && typeof EmbeddedSplitters.getList === 'function') {
        var list = EmbeddedSplitters.getList(sleeveObj) || [];
        for (var si = 0; si < list.length; si++) {
            var rec = list[si];
            if (!rec) continue;
            if (rec.inputCableId != null && rec.inputFiberNumber != null) {
                mark(rec.inputCableId, rec.inputFiberNumber);
            }
            var outs = rec.outputConnections || [];
            for (var oi = 0; oi < outs.length; oi++) {
                var out = outs[oi];
                if (out && out.cableId != null && out.fiberNumber != null) {
                    mark(out.cableId, out.fiberNumber);
                }
            }
        }
    }

    return Object.keys(used).length;
}

