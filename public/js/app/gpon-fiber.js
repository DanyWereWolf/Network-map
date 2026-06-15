/**
 * GPON: назначения жил, OLT, очистка при удалении.
 */
function copperSerializedMetaFromItem(item) {
    if (!item || item.cableType !== 'copper') return null;
    var m = {};
    if (item.copperSwitchFromId) m.copperSwitchFromId = item.copperSwitchFromId;
    if (item.copperSwitchToId) m.copperSwitchToId = item.copperSwitchToId;
    if (item.copperPortFrom != null && item.copperPortFrom !== '') {
        var x = parseInt(item.copperPortFrom, 10);
        if (!isNaN(x)) m.copperPortFrom = x;
    }
    if (item.copperPortTo != null && item.copperPortTo !== '') {
        var y = parseInt(item.copperPortTo, 10);
        if (!isNaN(y)) m.copperPortTo = y;
    }
    return Object.keys(m).length ? m : null;
}

/** Восстановление полей меди и занятости портов из сохранённого элемента (импорт / merge). */
function applySerializedCopperMetadataToCable(cable, item) {
    if (!cable || !cable.properties || !item || item.cableType !== 'copper') return;
    if (item.copperPortFrom != null && item.copperPortFrom !== '') {
        var cpf = parseInt(item.copperPortFrom, 10);
        cable.properties.set('copperPortFrom', isNaN(cpf) ? null : cpf);
    } else cable.properties.set('copperPortFrom', null);
    if (item.copperPortTo != null && item.copperPortTo !== '') {
        var cpt = parseInt(item.copperPortTo, 10);
        cable.properties.set('copperPortTo', isNaN(cpt) ? null : cpt);
    } else cable.properties.set('copperPortTo', null);
    cable.properties.set('copperSwitchFromId', item.copperSwitchFromId || null);
    cable.properties.set('copperSwitchToId', item.copperSwitchToId || null);
    applyCopperCableOccupancyFromCable(cable);
}

function getEffectiveCableLayingType() {
    if (typeof copperCableLayingActive !== 'undefined' && copperCableLayingActive) return 'copper';
    return 'fiber';
}

function applyNewCableFiberProps(cable) {
    if (!cable || !cable.properties || !window.FiberCableConfig) return;
    if (!window.FiberCableConfig.isOpticalCableType(cable.properties.get('cableType'))) return;
    var count = window.FiberCableConfig.getLayFiberCount();
    cable.properties.set('fiberCount', count);
    cable.properties.set('cableType', 'fiber');
    var pal = window.FiberCableConfig.getLayFiberPalette();
    if (pal && pal.length) {
        cable.properties.set('fiberPalette', window.FiberCableConfig.trimPaletteToCount
            ? window.FiberCableConfig.trimPaletteToCount(pal, count)
            : pal);
    } else {
        cable.properties.unset('fiberPalette');
    }
    window.FiberCableConfig.applyOpticalMapStyle(cable);
}

function applyImportedCableFiberProps(cable, item) {
    if (!cable || !cable.properties || !item || item.cableType === 'copper') return;
    if (!window.FiberCableConfig) return;
    if (item.fiberCount != null && item.fiberCount !== '') {
        cable.properties.set('fiberCount', parseInt(item.fiberCount, 10));
    } else if (window.FiberCableConfig.LEGACY_TYPE_COUNTS[item.cableType]) {
        cable.properties.set('fiberCount', window.FiberCableConfig.LEGACY_TYPE_COUNTS[item.cableType]);
    }
    if (Array.isArray(item.fiberPalette) && item.fiberPalette.length) {
        var impCount = cable.properties.get('fiberCount');
        if (impCount == null || impCount === '') {
            impCount = window.FiberCableConfig.LEGACY_TYPE_COUNTS[item.cableType] || window.FiberCableConfig.getLayFiberCount();
        }
        cable.properties.set('fiberPalette', window.FiberCableConfig.trimPaletteToCount
            ? window.FiberCableConfig.trimPaletteToCount(item.fiberPalette, impCount)
            : item.fiberPalette);
    }
    if (window.FiberCableConfig.isOpticalCableType(cable.properties.get('cableType'))) {
        window.FiberCableConfig.applyOpticalMapStyle(cable);
    }
}

function disableCableMapBalloon(cable) {
    if (!cable) return;
    if (cable.properties) {
        cable.properties.unset('balloonContent');
        cable.properties.unset('hintContent');
    }
    if (cable.options) {
        cable.options.set({ hasBalloon: false, hasHint: false });
    }
}

function parseFiberConnectionKey(key) {
    if (!key || typeof key !== 'string') return null;
    var parts = key.split('-');
    var fiberNumber = parseInt(parts.pop(), 10);
    if (isNaN(fiberNumber)) return null;
    var cableId = parts.join('-');
    if (!cableId) return null;
    return { cableId: cableId, fiberNumber: fiberNumber };
}

var HOST_FIBER_ASSIGNMENT_PROPS = ['oltConnections', 'onuConnections', 'splitterConnections', 'nodeConnections', 'mediaConverterConnections'];

function fiberConnKey(cableId, fiberNumber) {
    return cableId + '-' + fiberNumber;
}

function getSplicedFiberGroup(hostObj, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return [{ cableId: cableId, fiberNumber: fiberNumber }];
    var connections = hostObj.properties.get('fiberConnections') || [];
    var startKey = fiberConnKey(cableId, fiberNumber);
    var visited = new Set([startKey]);
    var queue = [{ cableId: cableId, fiberNumber: fiberNumber }];
    var result = [{ cableId: cableId, fiberNumber: fiberNumber }];
    while (queue.length) {
        var cur = queue.shift();
        for (var i = 0; i < connections.length; i++) {
            var conn = connections[i];
            if (!conn || !conn.from || !conn.to) continue;
            var partners = [];
            if (conn.from.cableId === cur.cableId && conn.from.fiberNumber === cur.fiberNumber) partners.push(conn.to);
            if (conn.to.cableId === cur.cableId && conn.to.fiberNumber === cur.fiberNumber) partners.push(conn.from);
            for (var j = 0; j < partners.length; j++) {
                var p = partners[j];
                var pk = fiberConnKey(p.cableId, p.fiberNumber);
                if (!visited.has(pk)) {
                    visited.add(pk);
                    result.push(p);
                    queue.push(p);
                }
            }
        }
    }
    return result;
}

function getHostAssignment(hostObj, propName, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return null;
    var map = hostObj.properties.get(propName) || {};
    var key = fiberConnKey(cableId, fiberNumber);
    if (map[key]) return map[key];
    var group = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
    for (var i = 0; i < group.length; i++) {
        var g = group[i];
        var gk = fiberConnKey(g.cableId, g.fiberNumber);
        if (gk !== key && map[gk]) return map[gk];
    }
    return null;
}

function hostAssignmentsConflict(a, b, propName) {
    if (!a || !b) return false;
    if (propName === 'oltConnections') {
        return a.oltId !== b.oltId || !!a.incoming !== !!b.incoming ||
            (a.portNumber != null ? a.portNumber : null) !== (b.portNumber != null ? b.portNumber : null);
    }
    if (propName === 'onuConnections') return a.onuId !== b.onuId;
    if (propName === 'splitterConnections') return a.splitterId !== b.splitterId;
    if (propName === 'nodeConnections') return a.nodeId !== b.nodeId;
    if (propName === 'mediaConverterConnections') return a.mediaConverterId !== b.mediaConverterId;
    return JSON.stringify(a) !== JSON.stringify(b);
}

function getHostAssignmentConflictLabel(propName) {
    if (propName === 'oltConnections') return 'OLT';
    if (propName === 'onuConnections') return 'ONU';
    if (propName === 'splitterConnections') return 'сплиттер';
    if (propName === 'nodeConnections') return 'узел';
    if (propName === 'mediaConverterConnections') return 'медиаконвертер';
    return 'назначение';
}

function getSpliceAssignmentConflict(hostObj, cableIdA, fiberA, cableIdB, fiberB) {
    if (!hostObj || !hostObj.properties) return null;
    var fiberMap = {};
    getSplicedFiberGroup(hostObj, cableIdA, fiberA).forEach(function(f) {
        fiberMap[fiberConnKey(f.cableId, f.fiberNumber)] = f;
    });
    fiberMap[fiberConnKey(cableIdB, fiberB)] = { cableId: cableIdB, fiberNumber: fiberB };
    var fibers = Object.keys(fiberMap).map(function(k) { return fiberMap[k]; });
    for (var pi = 0; pi < HOST_FIBER_ASSIGNMENT_PROPS.length; pi++) {
        var prop = HOST_FIBER_ASSIGNMENT_PROPS[pi];
        var map = hostObj.properties.get(prop) || {};
        var found = null;
        for (var fi = 0; fi < fibers.length; fi++) {
            var val = map[fiberConnKey(fibers[fi].cableId, fibers[fi].fiberNumber)];
            if (!val) continue;
            if (found && hostAssignmentsConflict(found, val, prop)) {
                return { prop: prop, label: getHostAssignmentConflictLabel(prop) };
            }
            found = val;
        }
    }
    return null;
}

function getOltAtHostCableEnd(hostObj, cableId) {
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable || !hostObj) return null;
    var otherEnd = getOtherEndOfCable(cable, hostObj);
    if (!otherEnd || !otherEnd.properties || otherEnd.properties.get('type') !== 'olt') return null;
    return {
        oltId: otherEnd.properties.get('uniqueId'),
        oltName: otherEnd.properties.get('name') || 'OLT',
        viaPhysicalCable: true,
        physicalCableOnly: true
    };
}

/** Обход жилы через сращивания и кабели между кроссами/муфтами — найти назначение OLT на другом участке пути. */
function findFiberOltRealAssignmentViaNetwork(startHost, startCableId, startFiberNumber) {
    var maxVisits = 160;
    var queue = [];
    var visited = new Set();
    visited.add((getObjectUniqueId(startHost) || '') + '|' + fiberConnKey(startCableId, startFiberNumber));

    function enqueueNetworkState(state) {
        var stateKey = (state.host ? getObjectUniqueId(state.host) : '_') + '|' + fiberConnKey(state.cableId, state.fiberNumber);
        if (visited.has(stateKey)) return;
        visited.add(stateKey);
        queue.push(state);
    }

    function expandFiberOltNetworkState(state) {
        if (state.host) {
            getSplicedFiberGroup(state.host, state.cableId, state.fiberNumber).forEach(function(g) {
                enqueueNetworkState({ host: state.host, cableId: g.cableId, fiberNumber: g.fiberNumber });
            });
        }
        var cable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === state.cableId;
        });
        if (!cable) return;
        var endpoints = [];
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (fromObj) endpoints.push(fromObj);
        if (toObj) endpoints.push(toObj);
        var routePts = getCableRoutePointsForTrace(cable);
        if (routePts && routePts.length) {
            routePts.forEach(function(pt) {
                if (pt && pt.properties) {
                    var ptType = pt.properties.get('type');
                    if (ptType === 'sleeve' || ptType === 'cross') endpoints.push(pt);
                }
            });
        }
        endpoints.forEach(function(ep) {
            if (!ep || !ep.properties) return;
            var epType = ep.properties.get('type');
            if (epType !== 'sleeve' && epType !== 'cross') return;
            if (state.host && getObjectUniqueId(ep) === getObjectUniqueId(state.host)) return;
            enqueueNetworkState({ host: ep, cableId: state.cableId, fiberNumber: state.fiberNumber });
        });
    }

    expandFiberOltNetworkState({ host: startHost, cableId: startCableId, fiberNumber: startFiberNumber });
    while (queue.length && visited.size <= maxVisits) {
        var cur = queue.shift();
        var found = resolveFiberOltUpstreamAtHost(cur.host, cur.cableId, cur.fiberNumber, true, false);
        if (found) return Object.assign({}, found, { inheritedFromNetwork: true });
        expandFiberOltNetworkState(cur);
    }
    return null;
}

/** Кабель от OLT на жиле в кроссе/муфте (напрямую или через сращение с кабелем к OLT). */
function getFiberOltPhysicalAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj) return null;
    var directEnd = getOltAtHostCableEnd(hostObj, cableId);
    if (directEnd) {
        return Object.assign({}, directEnd, { physicalCableOnly: true, viaPhysicalCable: true });
    }
    var group = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
    for (var i = 0; i < group.length; i++) {
        var g = group[i];
        if (g.cableId === cableId && g.fiberNumber === fiberNumber) continue;
        var viaEnd = getOltAtHostCableEnd(hostObj, g.cableId);
        if (viaEnd) {
            return Object.assign({}, viaEnd, { physicalCableOnly: true, viaPhysicalCable: true, viaSplice: true });
        }
    }
    return null;
}

/** Локальное назначение OLT на жиле: PON/приход, кабель к OLT, сращение в этом кроссе/муфте. */
function resolveFiberOltUpstreamAtHost(hostObj, cableId, fiberNumber, skipNetworkWalk, skipSpliceInherit) {
    if (!hostObj) return null;
    var direct = getHostFiberMapEntry(hostObj, 'oltConnections', cableId, fiberNumber);
    if (direct) return direct;
    var key = fiberConnKey(cableId, fiberNumber);
    for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        if (!obj.properties || obj.properties.get('type') !== 'olt') continue;
        var uid = getObjectUniqueId(obj);
        var incoming = obj.properties.get('incomingFiber');
        if (incoming && fiberConnKey(incoming.cableId, incoming.fiberNumber) === key) {
            return { oltId: uid, oltName: obj.properties.get('name') || 'OLT', incoming: true };
        }
        var pa = obj.properties.get('portAssignments') || {};
        for (var pk in pa) {
            var a = pa[pk];
            if (a && fiberConnKey(a.cableId, a.fiberNumber) === key) {
                return { oltId: uid, oltName: obj.properties.get('name') || 'OLT', portNumber: parseInt(pk, 10), incoming: false };
            }
        }
    }
    if (!skipSpliceInherit) {
        var group = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
        for (var gi = 0; gi < group.length; gi++) {
            var g = group[gi];
            if (g.cableId === cableId && g.fiberNumber === fiberNumber) continue;
            var inh = resolveFiberOltUpstreamAtHost(hostObj, g.cableId, g.fiberNumber, true, true);
            if (inh) return inh;
        }
        var physical = getFiberOltPhysicalAtHost(hostObj, cableId, fiberNumber);
        if (physical) return physical;
    } else {
        var physicalDirect = getOltAtHostCableEnd(hostObj, cableId);
        if (physicalDirect) {
            return Object.assign({}, physicalDirect, { physicalCableOnly: true, viaPhysicalCable: true });
        }
    }
    if (skipNetworkWalk || skipSpliceInherit) return null;
    return findFiberOltRealAssignmentViaNetwork(hostObj, cableId, fiberNumber);
}

/** Реальное назначение OLT на жиле (PON, приход, кабель к OLT через сращение/сеть). */
function getFiberOltRealAssignment(hostObj, cableId, fiberNumber, skipSpliceInherit, skipNetworkWalk) {
    if (!hostObj) return null;
    if (skipSpliceInherit && skipNetworkWalk) {
        var directOnly = getHostFiberMapEntry(hostObj, 'oltConnections', cableId, fiberNumber);
        if (directOnly) return directOnly;
        var keyOnly = fiberConnKey(cableId, fiberNumber);
        for (var oi = 0; oi < objects.length; oi++) {
            var oltObj = objects[oi];
            if (!oltObj.properties || oltObj.properties.get('type') !== 'olt') continue;
            var oltUid = getObjectUniqueId(oltObj);
            var incOnly = oltObj.properties.get('incomingFiber');
            if (incOnly && fiberConnKey(incOnly.cableId, incOnly.fiberNumber) === keyOnly) {
                return { oltId: oltUid, oltName: oltObj.properties.get('name') || 'OLT', incoming: true };
            }
            var paOnly = oltObj.properties.get('portAssignments') || {};
            for (var pkOnly in paOnly) {
                var aOnly = paOnly[pkOnly];
                if (aOnly && fiberConnKey(aOnly.cableId, aOnly.fiberNumber) === keyOnly) {
                    return { oltId: oltUid, oltName: oltObj.properties.get('name') || 'OLT', portNumber: parseInt(pkOnly, 10), incoming: false };
                }
            }
        }
        return getFiberOltPhysicalAtHost(hostObj, cableId, fiberNumber);
    }
    return resolveFiberOltUpstreamAtHost(hostObj, cableId, fiberNumber, !!skipNetworkWalk, !!skipSpliceInherit);
}

/** OLT на жиле: явное назначение в муфте/кроссе или через сращённую жилу / кабель от OLT. */
function getFiberOltAssignment(hostObj, cableId, fiberNumber) {
    if (!hostObj) return null;
    var ass = getHostAssignment(hostObj, 'oltConnections', cableId, fiberNumber);
    if (ass) return ass;
    var group = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
    for (var i = 0; i < group.length; i++) {
        var viaCable = getOltAtHostCableEnd(hostObj, group[i].cableId);
        if (viaCable) return viaCable;
    }
    return getOltAtHostCableEnd(hostObj, cableId);
}

function isFiberOltAssignmentDirect(hostObj, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return false;
    var map = hostObj.properties.get('oltConnections') || {};
    return !!map[fiberConnKey(cableId, fiberNumber)];
}

function getHostFiberMapEntry(hostObj, propName, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return null;
    var map = hostObj.properties.get(propName) || {};
    return map[fiberConnKey(cableId, fiberNumber)] || null;
}

/** Блокирует сращивание: приход OLT (upstream) или GPON feeder на жиле. PON-порт можно назначить заранее — сращивание не блокируется. */
function isFiberOltSpliceBlocked(hostObj, cableId, fiberNumber) {
    if (!hostObj) return false;
    var assign = getFiberOltRealAssignment(hostObj, cableId, fiberNumber);
    if (assign && assign.incoming) return true;
    var key = fiberConnKey(cableId, fiberNumber);
    var oltMap = hostObj.properties.get('oltConnections') || {};
    var onuMap = hostObj.properties.get('onuConnections') || {};
    var spMap = hostObj.properties.get('splitterConnections') || {};
    if (oltMap[key] && ((onuMap[key] && onuMap[key].onuId) || (spMap[key] && spMap[key].splitterId))) return true;
    return false;
}

/** Блокирует «Узел» только при прямом OLT на этой жиле (порт/приход), не при достижимости OLT по сети или через сплиттер. */
function isFiberLocalOltNodeBlocked(hostObj, cableId, fiberNumber) {
    if (!hostObj) return false;
    if (getHostFiberMapEntry(hostObj, 'oltConnections', cableId, fiberNumber)) return true;
    var key = fiberConnKey(cableId, fiberNumber);
    for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        if (!obj.properties || obj.properties.get('type') !== 'olt') continue;
        var incoming = obj.properties.get('incomingFiber');
        if (incoming && fiberConnKey(incoming.cableId, incoming.fiberNumber) === key) return true;
    }
    return false;
}

function isFiberFromOltAtHost(hostObj, cableId, fiberNumber) {
    return !!getFiberOltAssignment(hostObj, cableId, fiberNumber);
}

/** Найти муфту/кросс на кабеле для проверки достижимости OLT. */
function findFiberHostForReachability(cableId, fiberNumber) {
    var candidates = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var t = obj.properties.get('type');
        if (t !== 'cross' && t !== 'sleeve') return;
        var cables = getConnectedCables(obj);
        for (var ci = 0; ci < cables.length; ci++) {
            if (cables[ci].properties && cables[ci].properties.get('uniqueId') === cableId) {
                candidates.push(obj);
                break;
            }
        }
    });
    for (var i = 0; i < candidates.length; i++) {
        var h = candidates[i];
        if (getHostAssignment(h, 'splitterConnections', cableId, fiberNumber)) return h;
        if (getHostAssignment(h, 'onuConnections', cableId, fiberNumber)) return h;
        if (getFiberOltAssignment(h, cableId, fiberNumber)) return h;
    }
    return candidates[0] || null;
}

/** Связь с OLT в пределах текущей муфты/кросса или по трассировке через сеть. */
function isFiberReachableToOlt(hostObj, cableId, fiberNumber) {
    if (!hostObj) {
        hostObj = findFiberHostForReachability(cableId, fiberNumber);
    }
    if (hostObj && getFiberOltRealAssignment(hostObj, cableId, fiberNumber)) return true;
    if (isFiberOnOltGlobally(cableId, fiberNumber)) return true;
    return isFiberConnectedToOltNetworkWalk(hostObj, cableId, fiberNumber);
}

function isFiberOnOltGlobally(cableId, fiberNumber) {
    var key = fiberConnKey(cableId, fiberNumber);
    for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        if (!obj.properties || obj.properties.get('type') !== 'olt') continue;
        var incoming = obj.properties.get('incomingFiber');
        if (incoming && fiberConnKey(incoming.cableId, incoming.fiberNumber) === key) return true;
        var pa = obj.properties.get('portAssignments') || {};
        for (var pk in pa) {
            var a = pa[pk];
            if (a && fiberConnKey(a.cableId, a.fiberNumber) === key) return true;
        }
    }
    return false;
}

/** Обход жилы через сращивания и кабели между муфтами/кроссами. */
function isFiberConnectedToOltNetworkWalk(startHost, startCableId, startFiberNumber) {
    var maxVisits = 160;
    var queue = [{ host: startHost || null, cableId: startCableId, fiberNumber: startFiberNumber }];
    var visited = new Set();
    while (queue.length && visited.size < maxVisits) {
        var cur = queue.shift();
        var stateKey = (cur.host ? getObjectUniqueId(cur.host) : '_') + '|' + fiberConnKey(cur.cableId, cur.fiberNumber);
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);
        if (isFiberOnOltGlobally(cur.cableId, cur.fiberNumber)) return true;
        if (cur.host) {
            if (getFiberOltRealAssignment(cur.host, cur.cableId, cur.fiberNumber, false, true)) return true;
            getSplicedFiberGroup(cur.host, cur.cableId, cur.fiberNumber).forEach(function(g) {
                queue.push({ host: cur.host, cableId: g.cableId, fiberNumber: g.fiberNumber });
            });
        }
        var cable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cur.cableId;
        });
        if (!cable) continue;
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (fromObj && fromObj.properties && fromObj.properties.get('type') === 'olt') return true;
        if (toObj && toObj.properties && toObj.properties.get('type') === 'olt') return true;
        var endpoints = [];
        if (fromObj) endpoints.push(fromObj);
        if (toObj) endpoints.push(toObj);
        var routePts = getCableRoutePointsForTrace(cable);
        if (routePts && routePts.length) {
            routePts.forEach(function(pt) {
                if (pt && pt.properties) {
                    var ptType = pt.properties.get('type');
                    if (ptType === 'sleeve' || ptType === 'cross' || ptType === 'olt') endpoints.push(pt);
                }
            });
        }
        endpoints.forEach(function(ep) {
            if (!ep || !ep.properties) return;
            var epType = ep.properties.get('type');
            if (epType === 'olt') return;
            if (epType === 'sleeve' || epType === 'cross') {
                if (cur.host && getObjectUniqueId(ep) === getObjectUniqueId(cur.host)) return;
                queue.push({ host: ep, cableId: cur.cableId, fiberNumber: cur.fiberNumber });
            }
        });
    }
    return false;
}

/** Собрать жилы и кабели GPON-сети, затронутые удалением OLT. */
function collectGponImpactFromOlt(oltObj) {
    var fiberKeys = new Set();
    var cableIds = new Set();
    if (!oltObj || !oltObj.properties) {
        return { fiberKeys: [], cableIds: [], hasGpon: false };
    }
    var oltUid = getObjectUniqueId(oltObj);
    if (!oltUid) return { fiberKeys: [], cableIds: [], hasGpon: false };

    var incoming = oltObj.properties.get('incomingFiber');
    if (incoming && incoming.cableId) {
        fiberKeys.add(fiberConnKey(incoming.cableId, incoming.fiberNumber));
        cableIds.add(incoming.cableId);
    }
    var portAssignments = oltObj.properties.get('portAssignments') || {};
    Object.keys(portAssignments).forEach(function(portKey) {
        var a = portAssignments[portKey];
        if (a && a.cableId) {
            fiberKeys.add(fiberConnKey(a.cableId, a.fiberNumber));
            cableIds.add(a.cableId);
        }
    });
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (t !== 'cross' && t !== 'sleeve') return;
        var oltConn = slot.properties.get('oltConnections') || {};
        Object.keys(oltConn).forEach(function(key) {
            if (oltConn[key] && oltConn[key].oltId === oltUid) {
                fiberKeys.add(key);
                var p = parseFiberConnectionKey(key);
                if (p) cableIds.add(p.cableId);
            }
        });
    });
    objects.forEach(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        var fromUid = from && from.properties ? from.properties.get('uniqueId') : null;
        var toUid = to && to.properties ? to.properties.get('uniqueId') : null;
        if (from === oltObj || to === oltObj || fromUid === oltUid || toUid === oltUid) {
            var cid = cable.properties.get('uniqueId');
            if (cid) cableIds.add(cid);
        }
    });

    var expandHosts = objects.filter(function(o) {
        return o.properties && (o.properties.get('type') === 'cross' || o.properties.get('type') === 'sleeve');
    });
    Array.from(fiberKeys).forEach(function(k) {
        var p = parseFiberConnectionKey(k);
        if (!p) return;
        expandHosts.forEach(function(host) {
            getSplicedFiberGroup(host, p.cableId, p.fiberNumber).forEach(function(g) {
                fiberKeys.add(fiberConnKey(g.cableId, g.fiberNumber));
                cableIds.add(g.cableId);
            });
        });
    });

    var fiberKeyArr = Array.from(fiberKeys);
    var fiberKeySet = new Set(fiberKeyArr);
    var hasDownstreamGpon = false;
    if (fiberKeyArr.length) {
        objects.forEach(function(slot) {
            if (!slot.properties || hasDownstreamGpon) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            ['splitterConnections', 'onuConnections'].forEach(function(prop) {
                var map = slot.properties.get(prop) || {};
                Object.keys(map).forEach(function(key) {
                    if (fiberKeySet.has(key)) hasDownstreamGpon = true;
                    if (hasDownstreamGpon) return;
                    var p = parseFiberConnectionKey(key);
                    if (!p) return;
                    var grp = getSplicedFiberGroup(slot, p.cableId, p.fiberNumber);
                    for (var gi = 0; gi < grp.length; gi++) {
                        if (fiberKeySet.has(fiberConnKey(grp[gi].cableId, grp[gi].fiberNumber))) {
                            hasDownstreamGpon = true;
                            return;
                        }
                    }
                });
            });
        });
    }
    return {
        fiberKeys: fiberKeyArr,
        cableIds: Array.from(cableIds),
        hasGpon: fiberKeyArr.length > 0 || hasDownstreamGpon
    };
}

/** Собрать жилы и кабели, затронутые удалением муфты/кросса. */
function collectGponImpactFromHost(hostObj) {
    var fiberKeys = new Set();
    var cableIds = new Set();
    var hasLocalGpon = false;
    if (!hostObj || !hostObj.properties) {
        return { fiberKeys: [], cableIds: [], hasGpon: false };
    }
    var fiberConnections = hostObj.properties.get('fiberConnections') || [];
    fiberConnections.forEach(function(conn) {
        if (conn && conn.from) {
            fiberKeys.add(fiberConnKey(conn.from.cableId, conn.from.fiberNumber));
            cableIds.add(conn.from.cableId);
        }
        if (conn && conn.to) {
            fiberKeys.add(fiberConnKey(conn.to.cableId, conn.to.fiberNumber));
            cableIds.add(conn.to.cableId);
        }
    });
    Array.from(fiberKeys).forEach(function(k) {
        var p = parseFiberConnectionKey(k);
        if (!p) return;
        getSplicedFiberGroup(hostObj, p.cableId, p.fiberNumber).forEach(function(g) {
            fiberKeys.add(fiberConnKey(g.cableId, g.fiberNumber));
            cableIds.add(g.cableId);
        });
    });
    ['oltConnections', 'splitterConnections', 'onuConnections'].forEach(function(prop) {
        var map = hostObj.properties.get(prop) || {};
        if (Object.keys(map).length) hasLocalGpon = true;
        Object.keys(map).forEach(function(k) {
            fiberKeys.add(k);
            var pk = parseFiberConnectionKey(k);
            if (pk) cableIds.add(pk.cableId);
        });
    });
    var fiberKeyArr = Array.from(fiberKeys);
    var cableIdArr = Array.from(cableIds);
    var fiberKeySet = new Set(fiberKeyArr);
    var hasDownstreamGpon = false;
    if (fiberKeyArr.length) {
        objects.forEach(function(slot) {
            if (!slot.properties || slot === hostObj || hasDownstreamGpon) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            ['splitterConnections', 'onuConnections'].forEach(function(prop) {
                var map = slot.properties.get(prop) || {};
                Object.keys(map).forEach(function(key) {
                    if (fiberKeySet.has(key)) hasDownstreamGpon = true;
                    if (hasDownstreamGpon) return;
                    var p = parseFiberConnectionKey(key);
                    if (!p) return;
                    var grp = getSplicedFiberGroup(slot, p.cableId, p.fiberNumber);
                    for (var gi = 0; gi < grp.length; gi++) {
                        if (fiberKeySet.has(fiberConnKey(grp[gi].cableId, grp[gi].fiberNumber))) {
                            hasDownstreamGpon = true;
                            return;
                        }
                    }
                });
            });
        });
    }
    return {
        fiberKeys: fiberKeyArr,
        cableIds: cableIdArr,
        hasGpon: hasLocalGpon || hasDownstreamGpon
    };
}

function fiberTouchesGponImpact(host, cableId, fiberNumber, impact) {
    if (!impact || !impact.fiberKeys || !impact.fiberKeys.length) return false;
    var keySet = new Set(impact.fiberKeys);
    var group = host ? getSplicedFiberGroup(host, cableId, fiberNumber) : [{ cableId: cableId, fiberNumber: fiberNumber }];
    for (var i = 0; i < group.length; i++) {
        if (keySet.has(fiberConnKey(group[i].cableId, group[i].fiberNumber))) return true;
    }
    return false;
}

function purgeSplitterGponTree(splitterObj) {
    if (!splitterObj || !splitterObj.properties) return;
    var outputs = splitterObj.properties.get('outputConnections') || [];
    splitterObj.properties.set('inputFiber', null);
    outputs.forEach(function(o) {
        if (!o) return;
        if (o.onuId) {
            var onu = getMapObjectByUid(o.onuId, 'onu');
            if (onu && onu.properties) onu.properties.set('incomingFiber', null);
        }
        if (o.splitterId) {
            var child = resolveSplitterObject(o.splitterId);
            if (child) purgeSplitterGponTree(child);
        }
    });
    splitterObj.properties.set('outputConnections', outputs.map(function() { return null; }));
}

/** Принудительно снять GPON (ONU, сплиттер, выходы) после удаления муфты/кросса. */
function forcePurgeGponAfterHostRemoval(impact, opts) {
    if (!impact || !objects) return;
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (t !== 'cross' && t !== 'sleeve') return;
        var onuConn = slot.properties.get('onuConnections') || {};
        var splitterConn = slot.properties.get('splitterConnections') || {};
        Object.keys(onuConn).slice().forEach(function(key) {
            var parsed = parseFiberConnectionKey(key);
            if (!parsed) return;
            if (!fiberTouchesGponImpact(slot, parsed.cableId, parsed.fiberNumber, impact) &&
                isFiberReachableToOlt(slot, parsed.cableId, parsed.fiberNumber)) return;
            var entry = onuConn[key];
            removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
            delete onuConn[key];
            if (entry && entry.onuId) {
                var onuObj = getMapObjectByUid(entry.onuId, 'onu');
                if (onuObj && onuObj.properties) onuObj.properties.set('incomingFiber', null);
            }
        });
        Object.keys(splitterConn).slice().forEach(function(key) {
            var parsed = parseFiberConnectionKey(key);
            if (!parsed) return;
            if (!fiberTouchesGponImpact(slot, parsed.cableId, parsed.fiberNumber, impact) &&
                isFiberReachableToOlt(slot, parsed.cableId, parsed.fiberNumber)) return;
            var entry = splitterConn[key];
            removeSplitterConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
            delete splitterConn[key];
            if (entry && entry.splitterId) {
                var spObj = resolveSplitterObject(entry.splitterId);
                if (spObj) purgeSplitterGponTree(spObj);
            }
        });
        slot.properties.set('onuConnections', onuConn);
        slot.properties.set('splitterConnections', splitterConn);
    });
    objects.forEach(function(slot) {
        if (!slot.properties || slot.properties.get('type') !== 'splitter') return;
        var root = getSplitterRootInputFiber(slot);
        if (!root || !root.cableId) return;
        if (!fiberTouchesGponImpact(findFiberHostForReachability(root.cableId, root.fiberNumber), root.cableId, root.fiberNumber, impact) &&
            isFiberReachableToOlt(findFiberHostForReachability(root.cableId, root.fiberNumber), root.cableId, root.fiberNumber)) return;
        purgeSplitterGponTree(slot);
    });
    cleanupGponAssignmentsWithoutOlt(opts);
    if (!(opts && opts.deferLineRefresh)) {
        updateSplitterOutputConnectionLines();
        updateOnuConnectionLines();
        updateSplitterConnectionLines();
        updateOltConnectionLines();
        saveData();
    }
}

function closeInfoModalForDeletedHost(deletedUid) {
    if (deletedUid && currentModalObject && getObjectUniqueId(currentModalObject) !== deletedUid) return;
    currentModalObject = null;
    var infoModal = document.getElementById('infoModal');
    if (!infoModal || !isInfoModalVisible(infoModal)) return;
    closeInfoModal({ force: true });
}

function cleanupGponAssignmentsWithoutOlt(opts) {
    if (!objects) return;
    if (!mapHasOltObjects()) return;
    syncAllSplitterInputsFromHosts();
    var removed = { onu: 0, splitterInputs: 0, splitterOutputs: 0 };
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (t === 'cross' || t === 'sleeve') {
            var onuConn = slot.properties.get('onuConnections') || {};
            var onuChanged = false;
            Object.keys(onuConn).forEach(function(key) {
                var parsed = parseFiberConnectionKey(key);
                if (!parsed) return;
                if (!isFiberReachableToOlt(slot, parsed.cableId, parsed.fiberNumber)) {
                    var entry = onuConn[key];
                    removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete onuConn[key];
                    onuChanged = true;
                    removed.onu++;
                    if (entry && entry.onuId) {
                        var onuObj = getMapObjectByUid(entry.onuId, 'onu');
                        if (onuObj && onuObj.properties) onuObj.properties.set('incomingFiber', null);
                    }
                }
            });
            if (onuChanged) slot.properties.set('onuConnections', onuConn);
        }
        if (t === 'splitter') {
            syncSplitterInputFromHost(slot);
        }
    });
    if (removed.onu || removed.splitterInputs || removed.splitterOutputs) {
        if (!(opts && opts.deferLineRefresh)) {
            saveData();
            updateSplitterOutputConnectionLines();
            updateOnuConnectionLines();
            updateSplitterConnectionLines();
        }
    }
}

function isCableFiberBeyondMax(cableId, fiberNumber, targetCableId, maxFiber) {
    return cableId === targetCableId && fiberNumber > maxFiber;
}

function countConnectionsLostOnCableFiberReduction(cableUniqueId, maxFiber) {
    var stats = { splices: 0, assignments: 0, external: 0 };
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        if (t === 'cross' || t === 'sleeve') {
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'splitterConnections', 'nodeConnections'].forEach(function(prop) {
                var conn = slot.properties.get(prop);
                if (!conn) return;
                Object.keys(conn).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        stats.assignments++;
                    }
                });
            });
            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                fiberConn.forEach(function(conn) {
                    if (!conn) return;
                    var fromHit = conn.from && isCableFiberBeyondMax(conn.from.cableId, conn.from.fiberNumber, cableUniqueId, maxFiber);
                    var toHit = conn.to && isCableFiberBeyondMax(conn.to.cableId, conn.to.fiberNumber, cableUniqueId, maxFiber);
                    if (fromHit || toHit) stats.splices++;
                });
            }
        }
        if (t === 'olt') {
            var incomingFiber = slot.properties.get('incomingFiber');
            if (incomingFiber && incomingFiber.cableId === cableUniqueId && incomingFiber.fiberNumber > maxFiber) {
                stats.external++;
            }
            var portAssignments = slot.properties.get('portAssignments') || {};
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === cableUniqueId && a.fiberNumber > maxFiber) stats.external++;
            });
        }
        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === cableUniqueId && inputFiber.fiberNumber > maxFiber) {
                stats.external++;
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                outputConnections.forEach(function(conn) {
                    if (conn && conn.cableId === cableUniqueId && conn.fiberNumber > maxFiber) stats.external++;
                });
            }
        }
        if (t === 'onu' || t === 'mediaConverter') {
            var inc = slot.properties.get('incomingFiber');
            if (inc && inc.cableId === cableUniqueId && inc.fiberNumber > maxFiber) stats.external++;
        }
    });
    stats.total = stats.splices + stats.assignments + stats.external;
    return stats;
}

function formatCableFiberReductionLossMessage(oldCount, newCount, lost) {
    var lines = [
        'Число жил будет уменьшено с ' + oldCount + ' до ' + newCount + '.',
        'Жилы ' + (newCount + 1) + '–' + oldCount + ' исчезнут с схемы кросса и муфты.'
    ];
    var parts = [];
    if (lost.splices) parts.push(lost.splices + ' сращивани' + (lost.splices === 1 ? 'е' : (lost.splices < 5 ? 'я' : 'й')));
    if (lost.assignments) parts.push(lost.assignments + ' подключени' + (lost.assignments === 1 ? 'е' : (lost.assignments < 5 ? 'я' : 'й')) + ' жил');
    if (lost.external) parts.push(lost.external + ' назначени' + (lost.external === 1 ? 'е' : (lost.external < 5 ? 'я' : 'й')) + ' на OLT/ONU/сплиттер');
    if (parts.length) lines.push('Будут сброшены: ' + parts.join(', ') + '.');
    lines.push('Продолжить?');
    return lines.join('\n\n');
}

function pruneConnectionsForRemovedCableFibers(cableUniqueId, maxFiber) {
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        if (t === 'cross' || t === 'sleeve') {
            var nodeConn = slot.properties.get('nodeConnections');
            if (nodeConn) {
                Object.keys(nodeConn).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = nodeConn[key];
                    if (conn && conn.nodeId && conn.switchId != null && conn.switchPort != null) {
                        var nodeObj = objects.find(function(n) {
                            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === conn.nodeId;
                        });
                        if (nodeObj) clearNodeSwitchFiberPortOccupied(nodeObj, conn.switchId, conn.switchPort);
                    }
                    removeNodeConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete nodeConn[key];
                });
                slot.properties.set('nodeConnections', nodeConn);
            }

            var oltConn = slot.properties.get('oltConnections');
            if (oltConn) {
                Object.keys(oltConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = oltConn[key];
                    if (conn && conn.oltId) {
                        var oltObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === conn.oltId;
                        });
                        if (oltObj) {
                            if (conn.incoming) {
                                oltObj.properties.set('incomingFiber', null);
                            } else if (conn.portNumber != null) {
                                var portAssignments = oltObj.properties.get('portAssignments') || {};
                                delete portAssignments[String(conn.portNumber)];
                                oltObj.properties.set('portAssignments', portAssignments);
                            }
                        }
                    }
                    removeOltConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete oltConn[key];
                });
                slot.properties.set('oltConnections', oltConn);
            }

            var onuConn = slot.properties.get('onuConnections');
            if (onuConn) {
                Object.keys(onuConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = onuConn[key];
                    if (conn && conn.onuId) {
                        var onuObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === conn.onuId;
                        });
                        if (onuObj) {
                            var if_ = onuObj.properties.get('incomingFiber');
                            if (if_ && if_.cableId === cableUniqueId && if_.fiberNumber === parsed.fiberNumber) {
                                onuObj.properties.set('incomingFiber', null);
                            }
                        }
                    }
                    removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete onuConn[key];
                });
                slot.properties.set('onuConnections', onuConn);
            }

            var mcConn = slot.properties.get('mediaConverterConnections');
            if (mcConn) {
                Object.keys(mcConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = mcConn[key];
                    if (conn && conn.mediaConverterId) {
                        var mcObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === conn.mediaConverterId;
                        });
                        if (mcObj) {
                            var ifMc = mcObj.properties.get('incomingFiber');
                            if (ifMc && ifMc.cableId === cableUniqueId && ifMc.fiberNumber === parsed.fiberNumber) {
                                mcObj.properties.set('incomingFiber', null);
                            }
                        }
                    }
                    removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete mcConn[key];
                });
                slot.properties.set('mediaConverterConnections', mcConn);
            }

            var splitterConn = slot.properties.get('splitterConnections');
            if (splitterConn) {
                Object.keys(splitterConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = splitterConn[key];
                    if (conn && conn.splitterId) {
                        var splitterObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'splitter' && o.properties.get('uniqueId') === conn.splitterId;
                        });
                        if (splitterObj) {
                            var inputFiber = splitterObj.properties.get('inputFiber');
                            if (inputFiber && inputFiber.cableId === cableUniqueId && inputFiber.fiberNumber === parsed.fiberNumber) {
                                splitterObj.properties.set('inputFiber', null);
                            }
                        }
                    }
                    removeSplitterConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete splitterConn[key];
                });
                slot.properties.set('splitterConnections', splitterConn);
            }

            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                var newFiberConn = fiberConn.filter(function(conn) {
                    if (!conn) return false;
                    var fromHit = conn.from && isCableFiberBeyondMax(conn.from.cableId, conn.from.fiberNumber, cableUniqueId, maxFiber);
                    var toHit = conn.to && isCableFiberBeyondMax(conn.to.cableId, conn.to.fiberNumber, cableUniqueId, maxFiber);
                    return !fromHit && !toHit;
                });
                if (newFiberConn.length !== fiberConn.length) {
                    slot.properties.set('fiberConnections', newFiberConn);
                }
            }

            var fiberLabels = slot.properties.get('fiberLabels');
            if (fiberLabels) {
                Object.keys(fiberLabels).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        delete fiberLabels[key];
                    }
                });
                slot.properties.set('fiberLabels', fiberLabels);
            }

            var fiberPorts = slot.properties.get('fiberPorts');
            if (fiberPorts) {
                Object.keys(fiberPorts).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        delete fiberPorts[key];
                    }
                });
                slot.properties.set('fiberPorts', fiberPorts);
            }
        }

        if (t === 'olt') {
            var incomingFiberOlt = slot.properties.get('incomingFiber');
            if (incomingFiberOlt && incomingFiberOlt.cableId === cableUniqueId && incomingFiberOlt.fiberNumber > maxFiber) {
                slot.properties.set('incomingFiber', null);
            }
            var portAssignmentsOlt = slot.properties.get('portAssignments') || {};
            var paChanged = false;
            Object.keys(portAssignmentsOlt).forEach(function(portKey) {
                var a = portAssignmentsOlt[portKey];
                if (a && a.cableId === cableUniqueId && a.fiberNumber > maxFiber) {
                    delete portAssignmentsOlt[portKey];
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignmentsOlt);
        }
        if (t === 'splitter') {
            var inputFiberSp = slot.properties.get('inputFiber');
            if (inputFiberSp && inputFiberSp.cableId === cableUniqueId && inputFiberSp.fiberNumber > maxFiber) {
                slot.properties.set('inputFiber', null);
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                var outChanged = false;
                var newOutputConn = outputConnections.map(function(conn) {
                    if (conn && conn.cableId === cableUniqueId && conn.fiberNumber > maxFiber) {
                        outChanged = true;
                        return { onuId: conn.onuId, splitterId: conn.splitterId };
                    }
                    return conn;
                });
                if (outChanged) slot.properties.set('outputConnections', newOutputConn);
            }
        }
        if (t === 'onu' || t === 'mediaConverter') {
            var incEnd = slot.properties.get('incomingFiber');
            if (incEnd && incEnd.cableId === cableUniqueId && incEnd.fiberNumber > maxFiber) {
                slot.properties.set('incomingFiber', null);
            }
        }

        var usedFibersData = slot.properties.get('usedFibers');
        if (usedFibersData && usedFibersData[cableUniqueId]) {
            usedFibersData[cableUniqueId] = usedFibersData[cableUniqueId].filter(function(n) { return n <= maxFiber; });
            slot.properties.set('usedFibers', usedFibersData);
        }
    });
    scheduleConnectionLinesUpdate();
    updateOltConnectionLines();
    updateSplitterConnectionLines();
}
