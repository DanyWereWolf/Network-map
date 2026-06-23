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
    if (typeof applyLayCableProductToCable === 'function') applyLayCableProductToCable(cable);
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
    var startKey = fiberConnKey(cableId, fiberNumber);
    var visited = new Set([startKey]);
    var queue = [{ cableId: cableId, fiberNumber: fiberNumber }];
    var result = [{ cableId: cableId, fiberNumber: fiberNumber }];
    while (queue.length) {
        var cur = queue.shift();
        var neighbors = typeof getFiberNeighborsAtHost === 'function'
            ? getFiberNeighborsAtHost(hostObj, cur.cableId, cur.fiberNumber)
            : [];
        for (var j = 0; j < neighbors.length; j++) {
            var p = neighbors[j];
            var pk = fiberConnKey(p.cableId, p.fiberNumber);
            if (!visited.has(pk)) {
                visited.add(pk);
                result.push(p);
                queue.push(p);
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
            expandFiberOltWalkFromHost(queue, visited, state.host, state.cableId, state.fiberNumber);
        }
        var cable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === state.cableId;
        });
        if (!cable) return;
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (fromObj && fromObj.properties && fromObj.properties.get('type') === 'olt') {
            return {
                oltId: getObjectUniqueId(fromObj),
                oltName: fromObj.properties.get('name') || 'OLT',
                physicalCableOnly: true,
                viaPhysicalCable: true,
                inheritedFromNetwork: true
            };
        }
        if (toObj && toObj.properties && toObj.properties.get('type') === 'olt') {
            return {
                oltId: getObjectUniqueId(toObj),
                oltName: toObj.properties.get('name') || 'OLT',
                physicalCableOnly: true,
                viaPhysicalCable: true,
                inheritedFromNetwork: true
            };
        }
        var endpoints = [];
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

    var cableHit = expandFiberOltNetworkState({ host: startHost, cableId: startCableId, fiberNumber: startFiberNumber });
    if (cableHit) return cableHit;
    while (queue.length && visited.size <= maxVisits) {
        var cur = queue.shift();
        var found = resolveFiberOltUpstreamAtHost(cur.host, cur.cableId, cur.fiberNumber, true, false);
        if (found) return Object.assign({}, found, { inheritedFromNetwork: true });
        cableHit = expandFiberOltNetworkState(cur);
        if (cableHit) return cableHit;
    }
    return null;
}

/** Выход сплиттера на жиле → корневой вход с хостом для наследования OLT. */
function getSplitterOutputUpstreamFiber(hostObj, cableId, fiberNumber) {
    if (!hostObj || typeof findSplitterOutputAtHost !== 'function') return null;
    var outHit = findSplitterOutputAtHost(hostObj, cableId, fiberNumber);
    if (!outHit || !outHit.splitterObj || typeof getSplitterRootInputFiber !== 'function') return null;
    var root = getSplitterRootInputFiber(outHit.splitterObj);
    if (!root || !root.cableId || root.fiberNumber == null) return null;
    var inputHost = hostObj;
    if (typeof getSplitterHostInputFiber === 'function') {
        var hostIn = getSplitterHostInputFiber(outHit.splitterObj);
        if (hostIn && hostIn.hostObj) inputHost = hostIn.hostObj;
    }
    return { hostObj: inputHost, cableId: root.cableId, fiberNumber: root.fiberNumber };
}

function enqueueFiberOltWalkState(queue, visited, state) {
    var stateKey = (state.host ? getObjectUniqueId(state.host) : '_') + '|' + fiberConnKey(state.cableId, state.fiberNumber);
    if (visited.has(stateKey)) return;
    visited.add(stateKey);
    queue.push(state);
}

function expandFiberOltWalkFromHost(queue, visited, host, cableId, fiberNumber) {
    if (!host) return;
    getSplicedFiberGroup(host, cableId, fiberNumber).forEach(function(g) {
        enqueueFiberOltWalkState(queue, visited, { host: host, cableId: g.cableId, fiberNumber: g.fiberNumber });
    });
    var viaSp = getSplitterOutputUpstreamFiber(host, cableId, fiberNumber);
    if (viaSp) {
        enqueueFiberOltWalkState(queue, visited, {
            host: viaSp.hostObj,
            cableId: viaSp.cableId,
            fiberNumber: viaSp.fiberNumber
        });
    }
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
    var viaSpOut = getSplitterOutputUpstreamFiber(hostObj, cableId, fiberNumber);
    if (viaSpOut) {
        var fromSplitter = resolveFiberOltUpstreamAtHost(
            viaSpOut.hostObj, viaSpOut.cableId, viaSpOut.fiberNumber, skipNetworkWalk, skipSpliceInherit);
        if (fromSplitter) return Object.assign({}, fromSplitter, { viaSplitter: true });
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
        if (!isFiberHostType(t)) return;
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
            expandFiberOltWalkFromHost(queue, visited, cur.host, cur.cableId, cur.fiberNumber);
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
        if (!isFiberHostType(t)) return;
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
        return o.properties && isFiberHostType(o.properties.get('type'));
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
            if (!isFiberHostType(t)) return;
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
            if (!isFiberHostType(t)) return;
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
        if (!isFiberHostType(t)) return;
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
        if (isFiberHostType(t)) {
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

        if (isFiberHostType(t)) {
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

        if (isFiberHostType(t)) {
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
    objects.forEach(function(slot) {
        if (slot.properties && slot.properties.get('type') === 'olt') {
            syncOltLogicalState(slot, { save: false });
        }
    });
}

function isOltPortAssigned(oltObj, portNumber) {
    return isOltPortFeederReady(oltObj, portNumber);
}

function isOltPortFeederReady(oltObj, portNumber) {
    return isOltPortCrossConnected(oltObj, portNumber);
}

function isOltPortCrossConnected(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return false;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    if (!ass || ass.cableId == null || ass.fiberNumber == null) return false;
    if (ass.crossId == null || ass.crossPort == null) return false;
    return isFiberExistingOnCable(ass.cableId, ass.fiberNumber);
}

function getOltPortCrossHost(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return null;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    if (!ass || !ass.crossId) return null;
    return objects.find(function(o) {
        return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
            getObjectUniqueId(o) === ass.crossId;
    }) || null;
}

function getOltPortFeederHost(oltObj, portNumber) {
    var crossHost = getOltPortCrossHost(oltObj, portNumber);
    if (crossHost) return crossHost;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    if (!ass || ass.cableId == null) return null;
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === ass.cableId;
    });
    if (!cable) return null;
    return getOltHostForCableEnd(oltObj, cable);
}

function getMapCrossObjects() {
    return objects.filter(function(o) {
        return o && o.properties && isCrossLikeHostType(o.properties.get('type'));
    });
}

function isCrossConnectHost(obj) {
    if (!obj || !obj.properties || typeof obj.properties.get !== 'function') return false;
    var t = obj.properties.get('type');
    if (isCrossLikeHostType(t)) return true;
    return obj.properties.get('crossPorts') != null || !!obj.properties.get('fiberPorts');
}

function rehydrateCrossConnectHost(crossObjOrUid) {
    if (!crossObjOrUid) return null;
    var uid = typeof crossObjOrUid === 'string'
        ? crossObjOrUid
        : (crossObjOrUid.properties && crossObjOrUid.properties.get
            ? crossObjOrUid.properties.get('uniqueId')
            : null);
    if (uid && typeof resolveOltCrossForConnect === 'function') {
        var resolved = resolveOltCrossForConnect(uid);
        if (resolved) return resolved;
    }
    if (typeof crossObjOrUid === 'object' && isCrossConnectHost(crossObjOrUid)) return crossObjOrUid;
    return null;
}

function rehydrateOltConnectHost(oltObj) {
    if (!oltObj || !oltObj.properties) return null;
    var uid = oltObj.properties.get('uniqueId');
    if (uid && typeof getMapObjectByUid === 'function') {
        var resolved = getMapObjectByUid(uid, 'olt');
        if (resolved) return resolved;
    }
    return objects.find(function(o) {
        return o && o.properties && o.properties.get('type') === 'olt' &&
            o.properties.get('uniqueId') === uid;
    }) || oltObj;
}

function getCrossPanelPortNumbers(crossObj) {
    if (!crossObj || !crossObj.properties) return [];
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    var seen = new Set();
    var ordered = [];
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    Object.keys(fiberPorts).forEach(function(key) {
        var port = parseInt(fiberPorts[key], 10);
        if (isNaN(port) || port < 1 || port > crossPorts || seen.has(port)) return;
        seen.add(port);
        ordered.push(port);
    });
    for (var p = 1; p <= crossPorts; p++) {
        if (!seen.has(p)) ordered.push(p);
    }
    return ordered;
}

/** Порт панели кросса занят активным логическим PON другого OLT (crossId + crossPort в portAssignments). */
function isCrossPortLinkedToOlt(crossObj, crossPortNum, excludeOltId, excludeOltPort) {
    if (!crossObj || crossPortNum == null) return false;
    var crossId = getObjectUniqueId(crossObj);
    if (!crossId) return false;
    var panelPort = parseInt(crossPortNum, 10);
    if (isNaN(panelPort)) return false;
    for (var i = 0; i < objects.length; i++) {
        var obj = objects[i];
        if (!obj.properties || obj.properties.get('type') !== 'olt') continue;
        var oltUid = getObjectUniqueId(obj);
        var pa = obj.properties.get('portAssignments') || {};
        for (var pk in pa) {
            if (!Object.prototype.hasOwnProperty.call(pa, pk)) continue;
            var ponPort = parseInt(pk, 10);
            var a = pa[pk];
            if (!a || a.crossId == null || a.crossPort == null) continue;
            if (String(a.crossId) !== String(crossId)) continue;
            if (parseInt(a.crossPort, 10) !== panelPort) continue;
            if (excludeOltId && oltUid === excludeOltId && ponPort === parseInt(excludeOltPort, 10)) continue;
            if (!isOltPortCrossConnected(obj, ponPort)) continue;
            return true;
        }
    }
    return false;
}

function getCrossPortFiberKeys(crossObj, crossPortNum) {
    if (!crossObj || crossPortNum == null) return [];
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    if (typeof findFiberKeysByCrossPort === 'function') {
        return findFiberKeysByCrossPort(fiberPorts, crossPortNum);
    }
    var portStr = String(crossPortNum);
    return Object.keys(fiberPorts).filter(function(key) {
        return String(fiberPorts[key]) === portStr;
    });
}

function isFiberIncomingAtCross(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    var directOlt = getHostFiberMapEntry(crossObj, 'oltConnections', cableId, fiberNumber);
    if (directOlt && directOlt.incoming) return true;
    var key = fiberConnKey(cableId, fiberNumber);
    for (var i = 0; i < objects.length; i++) {
        var olt = objects[i];
        if (!olt.properties || olt.properties.get('type') !== 'olt') continue;
        var incoming = olt.properties.get('incomingFiber');
        if (incoming && fiberConnKey(incoming.cableId, incoming.fiberNumber) === key) return true;
    }
    return false;
}

function findOltObjectByUid(oltId) {
    if (!oltId) return null;
    return objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'olt' && getObjectUniqueId(o) === oltId;
    }) || null;
}

/** Активное логическое PON: portAssignments с crossId/crossPort и жилой на этом кроссе. */
function isOltLogicalPonOnCrossFiber(crossObj, oltObj, portNumber, cableId, fiberNumber) {
    if (!crossObj || !oltObj || portNumber == null || !cableId || fiberNumber == null) return false;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    if (!ass || ass.crossId == null || ass.crossPort == null) return false;
    if (String(ass.crossId) !== String(getObjectUniqueId(crossObj))) return false;
    if (fiberConnKey(ass.cableId, ass.fiberNumber) !== fiberConnKey(cableId, fiberNumber)) return false;
    return isOltPortCrossConnected(oltObj, portNumber);
}

/** Жила уже занята активным логическим PON на этом кроссе (не feeder/приход без crossId). */
function isFiberOltPonActiveAtCross(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    var key = fiberConnKey(cableId, fiberNumber);
    var crossId = getObjectUniqueId(crossObj);
    var directOlt = getHostFiberMapEntry(crossObj, 'oltConnections', cableId, fiberNumber);
    if (directOlt && directOlt.portNumber != null && !directOlt.incoming) {
        var connOlt = findOltObjectByUid(directOlt.oltId);
        if (connOlt && isOltLogicalPonOnCrossFiber(crossObj, connOlt, directOlt.portNumber, cableId, fiberNumber)) {
            return true;
        }
    }
    for (var i = 0; i < objects.length; i++) {
        var olt = objects[i];
        if (!olt.properties || olt.properties.get('type') !== 'olt') continue;
        var pa = olt.properties.get('portAssignments') || {};
        for (var pk in pa) {
            if (!Object.prototype.hasOwnProperty.call(pa, pk)) continue;
            var a = pa[pk];
            if (!a || fiberConnKey(a.cableId, a.fiberNumber) !== key) continue;
            if (a.crossId == null || a.crossPort == null || !crossId) continue;
            if (String(a.crossId) !== String(crossId)) continue;
            if (!isOltPortCrossConnected(olt, parseInt(pk, 10))) continue;
            return true;
        }
    }
    return false;
}

function isFiberOltPonFeederAtCross(crossObj, cableId, fiberNumber) {
    return isFiberOltPonActiveAtCross(crossObj, cableId, fiberNumber);
}

function isFiberUsedByOtherOltPon(cableId, fiberNumber, excludeOltId, excludePort) {
    if (!cableId || fiberNumber == null) return false;
    var key = fiberConnKey(cableId, fiberNumber);
    for (var i = 0; i < objects.length; i++) {
        var olt = objects[i];
        if (!olt.properties || olt.properties.get('type') !== 'olt') continue;
        var oltUid = getObjectUniqueId(olt);
        var pa = olt.properties.get('portAssignments') || {};
        for (var pk in pa) {
            if (!Object.prototype.hasOwnProperty.call(pa, pk)) continue;
            var a = pa[pk];
            if (!a || fiberConnKey(a.cableId, a.fiberNumber) !== key) continue;
            if (!isFiberExistingOnCable(a.cableId, a.fiberNumber)) continue;
            var portNum = parseInt(pk, 10);
            if (excludeOltId && oltUid === excludeOltId && portNum === parseInt(excludePort, 10)) continue;
            if (a.crossId != null && a.crossPort != null) {
                if (!isOltPortCrossConnected(olt, portNum)) continue;
                return true;
            }
            return true;
        }
    }
    return false;
}

function isFiberPresentAtCross(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    if (typeof crossHasFiberForConnection === 'function' &&
        crossHasFiberForConnection(crossObj, cableId, fiberNumber)) return true;
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    return fiberPorts[fiberConnKey(cableId, fiberNumber)] != null;
}

function isOltNetworkSpliceTargetFiber(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    if (!isFiberPresentAtCross(crossObj, cableId, fiberNumber)) return false;
    if (typeof isFiberSplicedAtHost === 'function' && isFiberSplicedAtHost(crossObj, cableId, fiberNumber)) return false;
    if (isFiberIncomingAtCross(crossObj, cableId, fiberNumber)) return false;
    if (isFiberOltPonFeederAtCross(crossObj, cableId, fiberNumber)) return false;
    return true;
}

function collectOltSpliceTargetsAtCross(crossObj) {
    if (!crossObj) return [];
    var seen = new Set();
    var result = [];
    function pushTarget(cableId, fiberNumber) {
        var key = fiberConnKey(cableId, fiberNumber);
        if (seen.has(key)) return;
        if (!isOltNetworkSpliceTargetFiber(crossObj, cableId, fiberNumber)) return;
        seen.add(key);
        result.push({ cableId: cableId, fiberNumber: fiberNumber });
    }
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    for (var p = 1; p <= crossPorts; p++) {
        getCrossPortFiberKeys(crossObj, p).forEach(function(fiberKey) {
            var parsed = typeof parseFiberPortKey === 'function' ? parseFiberPortKey(fiberKey) : null;
            if (parsed) pushTarget(parsed.cableId, parsed.fiberNumber);
        });
    }
    getUnassignedOltSpliceTargetFibersAtCross(crossObj).forEach(function(t) {
        pushTarget(t.cableId, t.fiberNumber);
    });
    return result;
}

function getUnassignedOltSpliceTargetFibersAtCross(crossObj) {
    if (!crossObj) return [];
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    var assignedKeys = new Set(Object.keys(fiberPorts));
    var targets = [];
    var cables = typeof getConnectedCables === 'function' ? getConnectedCables(crossObj) : [];
    cables.forEach(function(cable) {
        if (!cable.properties) return;
        var cableId = cable.properties.get('uniqueId');
        if (!cableId) return;
        var otherEnd = typeof getOtherEndOfCable === 'function' ? getOtherEndOfCable(cable, crossObj) : null;
        if (otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'olt') return;
        var fiberCount = typeof getFiberCount === 'function' ? getFiberCount(cable) : 0;
        for (var f = 1; f <= fiberCount; f++) {
            var fiberKey = fiberConnKey(cableId, f);
            if (assignedKeys.has(fiberKey)) continue;
            if (isOltNetworkSpliceTargetFiber(crossObj, cableId, f)) {
                targets.push({ cableId: cableId, fiberNumber: f });
            }
        }
    });
    return targets;
}

function parseCrossFiberPortKey(fiberKey) {
    if (!fiberKey) return null;
    if (typeof parseFiberPortKey === 'function') {
        var fromPortKey = parseFiberPortKey(fiberKey);
        if (fromPortKey) return fromPortKey;
    }
    if (typeof parseFiberKey === 'function') {
        var fromFiberKey = parseFiberKey(fiberKey);
        if (fromFiberKey) return fromFiberKey;
    }
    var lastDash = fiberKey.lastIndexOf('-');
    if (lastDash < 0) return null;
    var fiberNumber = parseInt(fiberKey.substring(lastDash + 1), 10);
    if (isNaN(fiberNumber)) return null;
    return { cableId: fiberKey.substring(0, lastDash), fiberNumber: fiberNumber };
}

/** Жилы на порту панели кросса, доступные для логического PON (без кабеля OLT ↔ кросс). */
function getOltSpliceTargetsOnCrossPort(crossObj, crossPortNum) {
    if (!crossObj || crossPortNum == null) return [];
    var targets = [];
    getCrossPortFiberKeys(crossObj, crossPortNum).forEach(function(key) {
        var parsed = parseCrossFiberPortKey(key);
        if (!parsed) return;
        if (!isFiberExistingOnCable(parsed.cableId, parsed.fiberNumber)) return;
        if (isFiberIncomingAtCross(crossObj, parsed.cableId, parsed.fiberNumber)) return;
        if (isFiberOltPonActiveAtCross(crossObj, parsed.cableId, parsed.fiberNumber)) return;
        targets.push({ cableId: parsed.cableId, fiberNumber: parsed.fiberNumber });
    });
    return targets;
}

function formatOltSpliceFiberLabel(cableId, fiberNumber) {
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('uniqueId') === cableId;
    });
    var cableName = cable
        ? (cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType')))
        : cableId;
    return cableName + ', ж.' + fiberNumber;
}

function isCrossPortAvailableForOltConnect(crossObj, crossPortNum, oltObj, oltPortNum) {
    if (!isCrossConnectHost(crossObj) || crossPortNum == null) return false;
    if (typeof isCrossPortPatched === 'function' && isCrossPortPatched(crossObj, crossPortNum)) return false;
    var oltUid = oltObj ? getObjectUniqueId(oltObj) : null;
    return !isCrossPortLinkedToOlt(crossObj, crossPortNum, oltUid, oltPortNum);
}

function crossHasFreeOltPanelPort(crossObj, oltObj, oltPortNum) {
    if (!crossObj) return false;
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    var oltUid = oltObj ? getObjectUniqueId(oltObj) : null;
    for (var p = 1; p <= crossPorts; p++) {
        if (!isCrossPortLinkedToOlt(crossObj, p, oltUid, oltPortNum)) return true;
    }
    return false;
}

function crossHasOltConnectableFiberPort(crossObj, oltObj, oltPortNum) {
    if (!crossObj) return false;
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    var oltUid = oltObj ? getObjectUniqueId(oltObj) : null;
    for (var p = 1; p <= crossPorts; p++) {
        if (isCrossPortLinkedToOlt(crossObj, p, oltUid, oltPortNum)) continue;
        if (getOltSpliceTargetsOnCrossPort(crossObj, p).length > 0) return true;
    }
    return false;
}

function crossHasAssignedFiberPort(crossObj, oltObj, oltPortNum) {
    if (!crossObj) return false;
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    var oltUid = oltObj ? getObjectUniqueId(oltObj) : null;
    for (var p = 1; p <= crossPorts; p++) {
        if (isCrossPortLinkedToOlt(crossObj, p, oltUid, oltPortNum)) continue;
        if (getCrossPortFiberKeys(crossObj, p).length > 0) return true;
    }
    return false;
}

function resolveOltSpliceTargetOnCrossPort(crossObj, crossPortNum) {
    var onPort = getOltSpliceTargetsOnCrossPort(crossObj, crossPortNum);
    if (onPort.length) return onPort[0];
    return null;
}

function buildOltCrossPortOption(crossObj, portNum, spliceTargets) {
    var fiberLabels = spliceTargets.map(function(t) {
        return formatOltSpliceFiberLabel(t.cableId, t.fiberNumber);
    });
    if (!fiberLabels.length) {
        if (getCrossPortFiberKeys(crossObj, portNum).length) {
            fiberLabels.push('жила занята другим PON');
        } else {
            fiberLabels.push('пустой · назначьте жилу в кроссе');
        }
    }
    return {
        portNumber: portNum,
        fiberLabels: fiberLabels,
        hasSpliceTarget: spliceTargets.length > 0,
        label: 'Порт ' + portNum + ' · ' + fiberLabels.join('; ')
    };
}

function getConnectableCrossPortsForOlt(crossObj, oltObj, portNumber) {
    crossObj = rehydrateCrossConnectHost(crossObj);
    oltObj = rehydrateOltConnectHost(oltObj);
    if (!crossObj || !oltObj || portNumber == null) return [];
    if (!isCrossConnectHost(crossObj)) return [];
    var panelPorts = getCrossPanelPortNumbers(crossObj);
    var options = [];
    panelPorts.forEach(function(p) {
        if (!isCrossPortAvailableForOltConnect(crossObj, p, oltObj, portNumber)) return;
        var spliceTargets = getOltSpliceTargetsOnCrossPort(crossObj, p);
        options.push(buildOltCrossPortOption(crossObj, p, spliceTargets));
    });
    options.sort(function(a, b) {
        if (a.hasSpliceTarget === b.hasSpliceTarget) return a.portNumber - b.portNumber;
        return a.hasSpliceTarget ? -1 : 1;
    });
    return options;
}

function getAvailableCrossesForOltPort(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return [];
    if (isOltPortCrossConnected(oltObj, portNumber)) return [];
    var crosses = getMapCrossObjects().slice();
    crosses.sort(function(a, b) {
        var aScore = crossHasOltConnectableFiberPort(a, oltObj, portNumber) ? 0
            : (crossHasAssignedFiberPort(a, oltObj, portNumber) ? 1 : 2);
        var bScore = crossHasOltConnectableFiberPort(b, oltObj, portNumber) ? 0
            : (crossHasAssignedFiberPort(b, oltObj, portNumber) ? 1 : 2);
        if (aScore !== bScore) return aScore - bScore;
        var an = String((a.properties && a.properties.get('name')) || '').toLowerCase();
        var bn = String((b.properties && b.properties.get('name')) || '').toLowerCase();
        return an.localeCompare(bn, 'ru');
    });
    return crosses;
}

function removeFiberConnectionsForFiberAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    var conns = hostObj.properties.get('fiberConnections') || [];
    var filtered = conns.filter(function(conn) {
        if (!conn || !conn.from || !conn.to) return true;
        var involves = (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
            (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber);
        return !involves;
    });
    if (filtered.length === conns.length) return false;
    hostObj.properties.set('fiberConnections', filtered);
    return true;
}

function connectOltPortToCrossPort(oltObj, portNumber, crossObj, crossPortNum) {
    if (!oltObj || !crossObj || portNumber == null || crossPortNum == null) return false;
    if (isOltPortCrossConnected(oltObj, portNumber)) {
        showError('PON-порт уже подключён к порту кросса. Сначала отключите текущее подключение.', 'Порт занят');
        return false;
    }
    if (!isCrossPortAvailableForOltConnect(crossObj, crossPortNum, oltObj, portNumber)) {
        showError('Порт кросса недоступен: он уже занят другим PON-портом OLT.', 'Порт недоступен');
        return false;
    }
    var mate = resolveOltSpliceTargetOnCrossPort(crossObj, crossPortNum);
    if (!mate) {
        if (getCrossPortFiberKeys(crossObj, crossPortNum).length) {
            showError('Жила на этом порту уже занята другим PON-портом OLT.', 'Порт недоступен');
        } else {
            showError('На выбранном порту нет жилы. Сначала назначьте жилу на порт в карточке кросса.', 'Нет жилы');
        }
        return false;
    }
    var oltId = getObjectUniqueId(oltObj);
    if (isFiberUsedByOtherOltPon(mate.cableId, mate.fiberNumber, oltId, portNumber)) {
        showError('Эта жила уже подключена к другому PON-порту OLT.', 'Жила занята');
        return false;
    }
    var portAssignments = Object.assign({}, oltObj.properties.get('portAssignments') || {});
    portAssignments[String(portNumber)] = {
        cableId: mate.cableId,
        fiberNumber: mate.fiberNumber,
        crossId: getObjectUniqueId(crossObj),
        crossPort: parseInt(crossPortNum, 10)
    };
    oltObj.properties.set('portAssignments', portAssignments);
    setHostFiberAssignment(crossObj, 'oltConnections', mate.cableId, mate.fiberNumber, {
        oltId: oltId,
        portNumber: portNumber
    });
    saveLinkedMapObjects([oltObj, crossObj]);
    if (typeof createOltConnectionLine === 'function') {
        createOltConnectionLine(crossObj, oltObj, mate.cableId, mate.fiberNumber, []);
    } else if (typeof scheduleConnectionLinesUpdate === 'function') {
        scheduleConnectionLinesUpdate();
    }
    return true;
}

function disconnectOltPonPort(oltObj, portNumber, opts) {
    opts = opts || {};
    if (!oltObj || portNumber == null) return false;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    if (!ass || ass.cableId == null) return false;
    var cableId = ass.cableId;
    var fiberNumber = ass.fiberNumber;
    var crossObj = getOltPortCrossHost(oltObj, portNumber);
    if (!crossObj) {
        crossObj = getOltPortFeederHost(oltObj, portNumber);
    }
    if (crossObj) {
        setHostFiberAssignment(crossObj, 'oltConnections', cableId, fiberNumber, null);
        if (typeof removeOltConnectionLine === 'function') {
            removeOltConnectionLine(crossObj, cableId, fiberNumber);
        }
    }
    var portAssignments = Object.assign({}, oltObj.properties.get('portAssignments') || {});
    delete portAssignments[String(portNumber)];
    oltObj.properties.set('portAssignments', portAssignments);
    var toSave = [oltObj];
    if (crossObj) toSave.push(crossObj);
    saveLinkedMapObjects(toSave);
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    if (!opts.silent && typeof showSuccess === 'function') {
        showSuccess('PON-порт ' + portNumber + ' отключён.', 'OLT');
    }
    return true;
}

function isFiberExistingOnCable(cableId, fiberNumber) {
    if (!cableId || fiberNumber == null) return false;
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable) return false;
    var n = getFiberCount(cable);
    var f = parseInt(fiberNumber, 10);
    return !isNaN(f) && f >= 1 && f <= n;
}

var PON_PORT_DEFAULT_KIND = 'GPON';

var PON_PORT_KIND_OPTIONS = [
    'GPON',
    'XGS-PON',
    'XG-PON',
    'Combo GPON/XGS-PON',
    'EPON',
    '10G-EPON',
    'NG-PON2',
    'OTDR / мониторинг'
];

function getPonPortKindOptions() {
    return PON_PORT_KIND_OPTIONS.slice();
}

function getPonPortDefaultKind() {
    return PON_PORT_DEFAULT_KIND;
}

function getOltPonPortCount(oltObj) {
    if (!oltObj || !oltObj.properties) return 8;
    return Math.max(1, parseInt(oltObj.properties.get('ponPorts'), 10) || 8);
}

function getOltPonPortTypes(oltObj) {
    if (!oltObj || !oltObj.properties) return [];
    var ponPorts = getOltPonPortCount(oltObj);
    var stored = oltObj.properties.get('ponPortTypes');
    var types = Array.isArray(stored) ? stored.slice() : [];
    while (types.length < ponPorts) types.push(PON_PORT_DEFAULT_KIND);
    return types.slice(0, ponPorts);
}

function getOltPonPortType(oltObj, portNumber) {
    var types = getOltPonPortTypes(oltObj);
    var idx = parseInt(portNumber, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= types.length) return PON_PORT_DEFAULT_KIND;
    return types[idx] || PON_PORT_DEFAULT_KIND;
}

function setOltPonPortType(oltObj, portNumber, kind) {
    if (!oltObj || !oltObj.properties || portNumber == null) return;
    var types = getOltPonPortTypes(oltObj);
    var idx = parseInt(portNumber, 10) - 1;
    if (isNaN(idx) || idx < 0) return;
    var trimmed = String(kind || '').trim() || PON_PORT_DEFAULT_KIND;
    types[idx] = trimmed;
    oltObj.properties.set('ponPortTypes', types);
}

function applyOltModelCatalogSettings(oltObj, manufacturer, model) {
    if (!oltObj || !oltObj.properties) return;
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    if (!mfr && !mod) return;
    var currentPorts = getOltPonPortCount(oltObj);
    var types = typeof resolveOltPortTypesForModel === 'function'
        ? resolveOltPortTypesForModel(mfr, mod, currentPorts)
        : null;
    if (!types || !types.length) return;
    oltObj.properties.set('ponPorts', types.length);
    oltObj.properties.set('ponPortTypes', types.slice());
}

function setOltPonPortsPlacementSelect(portCount) {
    var sel = document.getElementById('oltPonPorts');
    if (!sel) return;
    var n = Math.min(96, Math.max(1, parseInt(portCount, 10) || 8));
    var valStr = String(n);
    if (!sel.querySelector('option[value="' + valStr + '"]')) {
        var opt = document.createElement('option');
        opt.value = valStr;
        var word = n === 1 ? 'порт' : (n >= 2 && n <= 4 ? 'порта' : 'портов');
        opt.textContent = n + ' ' + word;
        var inserted = false;
        var options = sel.querySelectorAll('option');
        for (var i = 0; i < options.length; i++) {
            if (parseInt(options[i].value, 10) > n) {
                sel.insertBefore(opt, options[i]);
                inserted = true;
                break;
            }
        }
        if (!inserted) sel.appendChild(opt);
    }
    sel.value = valStr;
}

function syncOltPlacementPortsFromCatalog() {
    var mfrEl = document.getElementById('oltManufacturer');
    var modEl = document.getElementById('oltModel');
    var mfr = mfrEl ? (mfrEl.value || '').trim() : '';
    var mod = modEl ? (modEl.value || '').trim() : '';
    if (!mod) return;
    var catalogTypes = typeof getOltModelPortTypes === 'function' ? getOltModelPortTypes(mfr, mod) : null;
    if (catalogTypes && catalogTypes.length) {
        setOltPonPortsPlacementSelect(catalogTypes.length);
        return;
    }
    var defN = typeof getOltModelDefaultPortCount === 'function' ? getOltModelDefaultPortCount(mfr, mod) : null;
    if (defN != null && defN >= 1) setOltPonPortsPlacementSelect(defN);
}

function isOltPortConnected(oltObj, portNumber) {
    if (!oltObj || !oltObj.properties || portNumber == null) return false;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    return !!(ass && ass.cableId != null && ass.fiberNumber != null &&
        isFiberExistingOnCable(ass.cableId, ass.fiberNumber));
}

function getOltConnectedPortNumbers(oltObj) {
    if (!oltObj || !oltObj.properties) return [];
    var portAssignments = oltObj.properties.get('portAssignments') || {};
    var connected = [];
    Object.keys(portAssignments).forEach(function(portKey) {
        var portNum = parseInt(portKey, 10);
        if (isNaN(portNum) || portNum < 1) return;
        if (isOltPortConnected(oltObj, portNum)) connected.push(portNum);
    });
    connected.sort(function(a, b) { return a - b; });
    return connected;
}

function getOltFreePortNumbers(oltObj) {
    var ponPorts = getOltPonPortCount(oltObj);
    var connected = getOltConnectedPortNumbers(oltObj);
    var free = [];
    for (var p = 1; p <= ponPorts; p++) {
        if (connected.indexOf(p) === -1 && !isOltPortAssigned(oltObj, p)) free.push(p);
    }
    return free;
}

function findOltIncomingOnHosts(oltUid) {
    if (!oltUid) return null;
    var found = null;
    objects.forEach(function(slot) {
        if (found || !slot.properties) return;
        var t = slot.properties.get('type');
        if (!isFiberHostType(t)) return;
        var oltConn = slot.properties.get('oltConnections') || {};
        Object.keys(oltConn).forEach(function(key) {
            if (found) return;
            var conn = oltConn[key];
            if (!conn || conn.oltId !== oltUid || !conn.incoming) return;
            var p = parseFiberConnectionKey(key);
            if (p && isFiberExistingOnCable(p.cableId, p.fiberNumber)) {
                found = { cableId: p.cableId, fiberNumber: p.fiberNumber, hostObj: slot };
            }
        });
    });
    return found;
}

function getDisplayOltIncomingFiber(oltObj) {
    if (!oltObj || !oltObj.properties) return null;
    var oltUid = getObjectUniqueId(oltObj);
    var onHost = findOltIncomingOnHosts(oltUid);
    if (onHost) return { cableId: onHost.cableId, fiberNumber: onHost.fiberNumber };
    var direct = oltObj.properties.get('incomingFiber');
    if (direct && direct.cableId && isFiberExistingOnCable(direct.cableId, direct.fiberNumber)) {
        return { cableId: direct.cableId, fiberNumber: direct.fiberNumber };
    }
    return null;
}

/** Синхронизация прихода/PON-портов OLT с муфтой/кроссом и удаление битых назначений. */
function syncOltLogicalState(oltObj, opts) {
    opts = opts || {};
    if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return false;
    var changed = false;
    var oltUid = getObjectUniqueId(oltObj);
    var portAssignments = Object.assign({}, oltObj.properties.get('portAssignments') || {});
    var hostsToSave = [];

    function markHost(host) {
        if (host && hostsToSave.indexOf(host) === -1) hostsToSave.push(host);
    }

    function clearHostOltConnKey(host, key) {
        if (!host || !host.properties) return;
        var oltConn = Object.assign({}, host.properties.get('oltConnections') || {});
        if (!oltConn[key]) return;
        delete oltConn[key];
        host.properties.set('oltConnections', oltConn);
        markHost(host);
        if (typeof removeOltConnectionLine === 'function') {
            var parsed = parseFiberConnectionKey(key);
            if (parsed) removeOltConnectionLine(host, parsed.cableId, parsed.fiberNumber);
        }
    }

    Object.keys(portAssignments).forEach(function(portKey) {
        var a = portAssignments[portKey];
        if (!a || !a.cableId || a.fiberNumber == null) {
            delete portAssignments[portKey];
            changed = true;
            return;
        }
        var invalid = !isFiberExistingOnCable(a.cableId, a.fiberNumber);
        if (!invalid) {
            if (a.crossId != null && a.crossPort != null) {
                var crossHost = objects.find(function(o) {
                    return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
                        getObjectUniqueId(o) === a.crossId;
                });
                if (!crossHost) {
                    invalid = true;
                } else {
                    var fiberKey = fiberConnKey(a.cableId, a.fiberNumber);
                    var portKeys = getCrossPortFiberKeys(crossHost, a.crossPort);
                    var fiberPortsMap = crossHost.properties.get('fiberPorts') || {};
                    if (portKeys.indexOf(fiberKey) < 0 && String(fiberPortsMap[fiberKey]) !== String(a.crossPort)) {
                        invalid = true;
                    }
                }
            } else {
                invalid = true;
            }
        }
        if (invalid) {
            delete portAssignments[portKey];
            changed = true;
            var staleKey = fiberConnKey(a.cableId, a.fiberNumber);
            objects.forEach(function(slot) {
                if (!slot.properties) return;
                var t = slot.properties.get('type');
                if (!isFiberHostType(t)) return;
                var conn = (slot.properties.get('oltConnections') || {})[staleKey];
                if (conn && conn.oltId === oltUid && conn.portNumber === parseInt(portKey, 10)) {
                    clearHostOltConnKey(slot, staleKey);
                }
            });
        }
    });

    var incoming = oltObj.properties.get('incomingFiber');
    if (incoming && incoming.cableId && !isFiberExistingOnCable(incoming.cableId, incoming.fiberNumber)) {
        oltObj.properties.set('incomingFiber', null);
        changed = true;
        incoming = null;
    }

    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (!isFiberHostType(t)) return;
        var oltConn = slot.properties.get('oltConnections') || {};
        Object.keys(oltConn).slice().forEach(function(key) {
            var conn = oltConn[key];
            if (!conn || conn.oltId !== oltUid) return;
            var p = parseFiberConnectionKey(key);
            if (!p || !isFiberExistingOnCable(p.cableId, p.fiberNumber)) {
                if (conn.incoming) oltObj.properties.set('incomingFiber', null);
                if (conn.portNumber != null) delete portAssignments[String(conn.portNumber)];
                clearHostOltConnKey(slot, key);
                changed = true;
                return;
            }
            if (conn.incoming) {
                var curInc = oltObj.properties.get('incomingFiber');
                if (!curInc || curInc.cableId !== p.cableId || curInc.fiberNumber !== p.fiberNumber) {
                    oltObj.properties.set('incomingFiber', { cableId: p.cableId, fiberNumber: p.fiberNumber });
                    changed = true;
                }
            } else if (conn.portNumber != null) {
                var pk = String(conn.portNumber);
                var pa = portAssignments[pk];
                if (!pa || pa.cableId !== p.cableId || pa.fiberNumber !== p.fiberNumber) {
                    var nextPa = { cableId: p.cableId, fiberNumber: p.fiberNumber };
                    if (pa && pa.crossId != null) nextPa.crossId = pa.crossId;
                    if (pa && pa.crossPort != null) nextPa.crossPort = pa.crossPort;
                    if (isCrossLikeHostType(t)) {
                        var crossPortOnFiber = typeof getCrossPortForFiber === 'function'
                            ? getCrossPortForFiber(slot, p.cableId, p.fiberNumber) : null;
                        if (crossPortOnFiber != null) {
                            nextPa.crossId = getObjectUniqueId(slot);
                            nextPa.crossPort = crossPortOnFiber;
                        }
                    }
                    portAssignments[pk] = nextPa;
                    changed = true;
                }
            }
        });
    });

    var hostIncoming = findOltIncomingOnHosts(oltUid);
    if (hostIncoming) {
        var cur = oltObj.properties.get('incomingFiber');
        if (!cur || cur.cableId !== hostIncoming.cableId || cur.fiberNumber !== hostIncoming.fiberNumber) {
            oltObj.properties.set('incomingFiber', {
                cableId: hostIncoming.cableId,
                fiberNumber: hostIncoming.fiberNumber
            });
            changed = true;
        }
    } else {
        var curInc = oltObj.properties.get('incomingFiber');
        if (curInc && curInc.cableId && !isFiberExistingOnCable(curInc.cableId, curInc.fiberNumber)) {
            oltObj.properties.set('incomingFiber', null);
            changed = true;
        }
    }

    oltObj.properties.set('portAssignments', portAssignments);

    if (changed && opts.save !== false) {
        saveLinkedMapObjects([oltObj].concat(hostsToSave));
        if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    }
    return changed;
}

function isOltCableLinkedToHost(oltObj, hostObj, cableId) {
    if (!oltObj || !hostObj || !cableId) return false;
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable) return false;
    var other = getOtherEndOfCable(cable, oltObj);
    return !!(other && getObjectUniqueId(other) === getObjectUniqueId(hostObj));
}

function getOltHostForCableEnd(oltObj, cable) {
    if (!oltObj || !cable || !cable.properties) return null;
    var other = getOtherEndOfCable(cable, oltObj);
    if (!other || !other.properties) return null;
    var t = other.properties.get('type');
    return (t === 'sleeve' || t === 'cross') ? other : null;
}

/** Проблемы подключения OLT: изоляция, кабели без назначения, рассинхрон с муфтой/кроссом. */
function getOltConnectivityIssues(oltObj) {
    if (!oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return [];
    var issues = [];
    var oltUid = getObjectUniqueId(oltObj);
    var cables = getConnectedCables(oltObj);
    var incoming = typeof getDisplayOltIncomingFiber === 'function'
        ? getDisplayOltIncomingFiber(oltObj)
        : (oltObj.properties.get('incomingFiber') || null);
    var portAssignments = oltObj.properties.get('portAssignments') || {};
    var hasIncoming = !!(incoming && incoming.cableId);
    var assignedPortCount = Object.keys(portAssignments).filter(function(k) {
        var a = portAssignments[k];
        return a && a.cableId != null && a.fiberNumber != null && isFiberExistingOnCable(a.cableId, a.fiberNumber);
    }).length;

    if (!cables.length && !hasIncoming && !assignedPortCount) {
        issues.push({
            level: 'warn',
            message: 'OLT не подключён к сети: нет кабелей, прихода и назначений на PON-портах.'
        });
        return issues;
    }

    Object.keys(portAssignments).forEach(function(portKey) {
        var a = portAssignments[portKey];
        if (!a || !a.cableId || a.fiberNumber == null) return;
        if (!isFiberExistingOnCable(a.cableId, a.fiberNumber)) {
            issues.push({
                level: 'error',
                message: 'PON-порт ' + portKey + ': назначена жила, которой больше нет в кабеле.'
            });
            return;
        }
        if (a.crossId != null && a.crossPort != null) {
            var cross = objects.find(function(o) {
                return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
                    getObjectUniqueId(o) === a.crossId;
            });
            if (!cross) {
                issues.push({
                    level: 'error',
                    message: 'PON-порт ' + portKey + ': кросс подключения не найден на карте.'
                });
                return;
            }
            var key = fiberConnKey(a.cableId, a.fiberNumber);
            var crossConn = (cross.properties.get('oltConnections') || {})[key];
            if (!crossConn || crossConn.oltId !== oltUid || crossConn.portNumber !== parseInt(portKey, 10)) {
                issues.push({
                    level: 'error',
                    message: 'PON-порт ' + portKey + ': назначение на OLT не совпадает с подключением в кроссе «' +
                        (cross.properties.get('name') || 'Кросс') + '».'
                });
            }
            return;
        }
        var linked = cables.some(function(c) {
            return c.properties && c.properties.get('uniqueId') === a.cableId;
        });
        if (!linked) {
            issues.push({
                level: 'error',
                message: 'PON-порт ' + portKey + ': назначена жила кабеля, который больше не подключён к OLT.'
            });
            return;
        }
        var host = null;
        cables.forEach(function(c) {
            if (c.properties && c.properties.get('uniqueId') === a.cableId) host = getOltHostForCableEnd(oltObj, c);
        });
        if (host) {
            var legacyKey = fiberConnKey(a.cableId, a.fiberNumber);
            var hostConn = (host.properties.get('oltConnections') || {})[legacyKey];
            if (!hostConn || hostConn.oltId !== oltUid || hostConn.portNumber !== parseInt(portKey, 10)) {
                issues.push({
                    level: 'error',
                    message: 'PON-порт ' + portKey + ': назначение на OLT не совпадает с подключением в ' +
                        (host.properties.get('name') || (isCrossLikeHostType(host.properties.get('type')) ? 'кроссе' : 'муфте')) + '.'
                });
            }
        }
    });

    if (hasIncoming) {
        if (!isFiberExistingOnCable(incoming.cableId, incoming.fiberNumber)) {
            issues.push({
                level: 'error',
                message: 'Приход задан на жилу, которой больше нет в кабеле.'
            });
        } else {
            var incLinked = cables.some(function(c) {
                return c.properties && c.properties.get('uniqueId') === incoming.cableId;
            });
            var hostIncoming = findOltIncomingOnHosts(oltUid);
            var incomingOkAtHost = !!(hostIncoming &&
                hostIncoming.cableId === incoming.cableId &&
                hostIncoming.fiberNumber === incoming.fiberNumber);
            if (!incLinked && !incomingOkAtHost) {
                issues.push({
                    level: 'error',
                    message: 'Приход задан на OLT, но в муфте/кроссе нет подтверждения этой жилы (кнопка «Приход OLT»).'
                });
            }
        }
    }

    return issues;
}

function notifyOltCableConnectivityIfNeeded(points, cable) {
    // Логические подключения GPON идут через кросс/муфту; предупреждения о «неназначенных жилах»
    // на физическом кабеле до OLT не показываем.
}

function resolveOltPortCableEnds(points, preset) {
    if (!points || points.length < 2 || !preset) return null;
    var first = points[0];
    var last = points[points.length - 1];
    var oltObj = null;
    var hostObj = null;
    if (first && first.properties && first.properties.get('type') === 'olt' &&
        getObjectUniqueId(first) === preset.oltUid) {
        oltObj = first;
        if (last && last.properties && isCrossLikeHostType(last.properties.get('type'))) hostObj = last;
    } else if (last && last.properties && last.properties.get('type') === 'olt' &&
        getObjectUniqueId(last) === preset.oltUid) {
        oltObj = last;
        if (first && first.properties && isCrossLikeHostType(first.properties.get('type'))) hostObj = first;
    }
    if (!oltObj || !hostObj) return null;
    return { oltObj: oltObj, hostObj: hostObj };
}

function buildOltPortFeederCableName(oltObj, portNumber, hostObj) {
    if (!oltObj || !oltObj.properties || portNumber == null) return '';
    var oltName = String(oltObj.properties.get('name') || '').trim();
    var portLbl = typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '';
    var portPart = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, portLbl, true)
        : ('п.' + portNumber);
    var name = oltName ? ('С OLT «' + oltName + '», ' + portPart) : ('С OLT, ' + portPart);
    if (hostObj && hostObj.properties) {
        var hostName = String(hostObj.properties.get('name') || '').trim();
        if (hostName) {
            name += ' → «' + hostName + '»';
        } else {
            var hostType = isCrossLikeHostType(hostObj.properties.get('type')) ? 'кросс' : 'муфта';
            name += ' → ' + hostType;
        }
    }
    return name;
}

function validatePendingOltPortCableEndpoint(endpointObj) {
    if (!pendingOltPortPreset || !endpointObj || !endpointObj.properties) return true;
    if (!isCrossLikeHostType(endpointObj.properties.get('type'))) {
        showError('С PON-порта OLT прокладывается одножильный кабель только до кросса.', 'Недопустимое действие');
        return false;
    }
    if (pendingOltPortPreset.crossId && getObjectUniqueId(endpointObj) !== pendingOltPortPreset.crossId) {
        var selectedCross = objects.find(function(o) {
            return o.properties && getObjectUniqueId(o) === pendingOltPortPreset.crossId;
        });
        var selectedName = selectedCross ? (selectedCross.properties.get('name') || 'Кросс') : 'кросс';
        showError('Кабель должен идти в выбранный кросс «' + selectedName + '».', 'Неверный кросс');
        return false;
    }
    return true;
}

function finishOltPortCableLayingSession(completed) {
    if (pendingOltPortLayFiberBackup != null && window.FiberCableConfig) {
        window.FiberCableConfig.setLayFiberCount(pendingOltPortLayFiberBackup);
        pendingOltPortLayFiberBackup = null;
        if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    }
    pendingOltPortPreset = null;
    if (completed) oltPortCableJustFinished = true;
    currentCableTool = false;
    cableSource = null;
    cableWaypoints = [];
    if (typeof removeCablePreview === 'function') removeCablePreview();
    var cableBtn = document.getElementById('addCable');
    if (cableBtn) {
        cableBtn.classList.remove('btn-add-object--placement');
        cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span class="btn-lay-cable-text">Проложить кабель</span>';
        cableBtn.style.background = '';
    }
    if (myMap && myMap.container) {
        try {
            var mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        } catch (eMap) {}
    }
    if (typeof syncMapPanLockForEditTools === 'function') syncMapPanLockForEditTools();
}

function assignOltPortFeederCable(oltObj, portNumber, cableId, fiberNumber, hostObj, cableObj) {
    var oltId = getObjectUniqueId(oltObj);
    getObjectUniqueId(hostObj);
    if (!isOltCableLinkedToHost(oltObj, hostObj, cableId)) {
        showError('Кабель не соединяет этот OLT с выбранным кроссом.', 'Нет связи');
        return false;
    }
    var usage = getFiberUsage(cableId, fiberNumber, { type: 'oltPort', oltId: oltId, portNumber: portNumber });
    if (usage.used) {
        showError('Жила кабеля уже используется: ' + (usage.where || 'другое назначение') + '.', 'Жила занята');
        return false;
    }
    var portAssignments = Object.assign({}, oltObj.properties.get('portAssignments') || {});
    portAssignments[String(portNumber)] = { cableId: cableId, fiberNumber: fiberNumber };
    oltObj.properties.set('portAssignments', portAssignments);
    setHostFiberAssignment(hostObj, 'oltConnections', cableId, fiberNumber, {
        oltId: oltId,
        portNumber: portNumber
    });
    var toSave = [oltObj, hostObj];
    if (cableObj) toSave.push(cableObj);
    saveLinkedMapObjects(toSave);
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    return true;
}

function tryApplyOltPortPresetOnCableCreated(points, cable) {
    if (!pendingOltPortPreset || !points || points.length < 2 || !cable || !cable.properties) return false;
    var preset = pendingOltPortPreset;
    var ends = resolveOltPortCableEnds(points, preset);
    if (!ends) {
        showError('Кабель с PON-порта OLT должен соединять OLT с кроссом.', 'Недопустимое действие');
        finishOltPortCableLayingSession(false);
        return false;
    }
    if (window.FiberCableConfig) {
        window.FiberCableConfig.applyCableFiberSettings(cable, 1, window.FiberCableConfig.buildStandardPalette(1));
        disableCableMapBalloon(cable);
    }
    var cableId = cable.properties.get('uniqueId');
    if (!cableId) {
        cableId = 'cable-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        cable.properties.set('uniqueId', cableId);
    }
    var feederCableName = buildOltPortFeederCableName(ends.oltObj, preset.portNumber, ends.hostObj);
    if (feederCableName) cable.properties.set('cableName', feederCableName);
    if (!assignOltPortFeederCable(ends.oltObj, preset.portNumber, cableId, 1, ends.hostObj, cable)) {
        finishOltPortCableLayingSession(false);
        return false;
    }
    if (preset.crossId != null && preset.crossPort != null) {
        var targetCross = objects.find(function(o) {
            return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
                getObjectUniqueId(o) === preset.crossId;
        });
        if (!targetCross || getObjectUniqueId(ends.hostObj) !== preset.crossId) {
            showError('Кабель должен идти в выбранный кросс.', 'Неверный кросс');
            finishOltPortCableLayingSession(false);
            return false;
        }
        if (!connectOltPortToCrossPort(ends.oltObj, preset.portNumber, targetCross, preset.crossPort)) {
            finishOltPortCableLayingSession(false);
            return false;
        }
    }
    finishOltPortCableLayingSession(true);
    saveData({ syncFull: true });
    if (typeof showObjectInfo === 'function') showObjectInfo(ends.oltObj);
    if (typeof showSuccess === 'function') {
        var hostName = ends.hostObj.properties.get('name') || 'Кросс';
        var portLblDone = typeof formatOltPortDisplay === 'function'
            ? formatOltPortDisplay(preset.portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(ends.oltObj, preset.portNumber) : '', true)
            : ('п.' + preset.portNumber);
        if (preset.crossPort != null) {
            showSuccess('PON-порт ' + portLblDone + ' подключён к порту ' + preset.crossPort + ' кросса «' + hostName + '».', 'OLT');
        } else {
            showSuccess('Feeder с ' + portLblDone + ' проложен до «' + hostName + '».', 'OLT');
        }
    }
    return true;
}

function activateCableLayingTool() {
    if (currentCableTool) return;
    currentCableTool = true;
    var cableBtn = document.getElementById('addCable');
    if (cableBtn) {
        cableBtn.classList.add('btn-add-object--placement');
        cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="btn-lay-cable-text">Завершить прокладку</span>';
        cableBtn.style.background = '';
    }
    copperCableLayingActive = false;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    if (typeof clearShowOnMapHighlight === 'function') clearShowOnMapHighlight();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    cableWaypoints = [];
    if (myMap && myMap.container) {
        try {
            var mapEl = myMap.container.getElement();
            mapEl.style.cursor = 'crosshair';
            mapEl.classList.add('map-crosshair-active');
        } catch (eAct) {}
    }
    if (typeof syncMapPanLockForEditTools === 'function') syncMapPanLockForEditTools();
}

function startOltPortCrossRouting(oltObj, portNumber, crossObj, crossPortNum) {
    if (!isEditMode || !oltObj || !oltObj.properties || oltObj.properties.get('type') !== 'olt') return;
    if (!crossObj || !isCrossLikeHostType(crossObj.properties.get('type')) || crossPortNum == null) return;
    var portNum = parseInt(portNumber, 10);
    var crossPort = parseInt(crossPortNum, 10);
    if (isNaN(portNum) || portNum < 1 || isNaN(crossPort) || crossPort < 1) return;
    if (isOltPortCrossConnected(oltObj, portNum)) {
        showError('Этот PON-порт уже подключён к кроссу. Сначала отключите его.', 'Порт занят');
        return;
    }
    if (isOltPortFeederReady(oltObj, portNum)) {
        showError('Для этого PON-порта уже есть кабель. Отключите порт или завершите подключение.', 'Порт занят');
        return;
    }
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (splitterFiberRoutingMode && typeof cancelSplitterFiberRouting === 'function') cancelSplitterFiberRouting();
    if (fiberRoutingMode && typeof cancelFiberRouting === 'function') cancelFiberRouting();
    if (cableSplitMode && typeof cancelCableSplitMode === 'function') cancelCableSplitMode();
    pendingOltPortLayFiberBackup = window.FiberCableConfig ? window.FiberCableConfig.getLayFiberCount() : null;
    if (window.FiberCableConfig) {
        window.FiberCableConfig.setLayFiberCount(1);
        if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    }
    copperCableLayingActive = false;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    activateCableLayingTool();
    pendingOltPortPreset = {
        oltUid: getObjectUniqueId(oltObj),
        portNumber: portNum,
        crossId: getObjectUniqueId(crossObj),
        crossPort: crossPort
    };
    if (typeof saveLinkedMapObjects === 'function') saveLinkedMapObjects([oltObj]);
    cableSource = oltObj;
    cableWaypoints = [];
    if (typeof removePhantomPlacemark === 'function') removePhantomPlacemark();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof closeInfoModal === 'function') closeInfoModal();
    else {
        var modal = document.getElementById('infoModal');
        if (modal) modal.style.display = 'none';
        currentModalObject = null;
    }
    var portLabel = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNum, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNum) : '', true)
        : ('п.' + portNum);
    var crossName = crossObj.properties.get('name') || 'Кросс';
    showInfo('Прокладка кабеля с ' + portLabel + ' до кросса «' + crossName + '» (порт ' + crossPort + '): кликайте по опорам, затем выберите кросс. Escape — отмена.', 'Подключение OLT');
}
