/**
 * Утилиты трассировки оптических жил: сжатие маршрута, статус, подсветка на карте.
 */
(function (global) {
    'use strict';

    var WAYPOINT_TYPES = ['support', 'attachment', 'manhole'];

    function getUid(obj) {
        if (typeof global.getObjectUniqueId === 'function') return global.getObjectUniqueId(obj);
        return obj && obj.properties ? obj.properties.get('uniqueId') : null;
    }

    function getTypeName(type) {
        if (typeof global.getObjectTypeName === 'function') return global.getObjectTypeName(type);
        return type || 'Объект';
    }

    function isWaypointType(type) {
        return WAYPOINT_TYPES.indexOf(type) !== -1;
    }

    function getObjectIcon(type) {
        switch (type) {
            case 'cross': return '📦';
            case 'sleeve': return '🔴';
            case 'spliceCassette': return '🟠';
            case 'node': return '🖥️';
            case 'olt': return '📶';
            case 'onu': return '📟';
            case 'mediaConverter': return '⇄';
            case 'splitter': return '🔀';
            case 'support': return '📡';
            case 'attachment': return '📎';
            case 'manhole': return '⬤';
            case 'camera': return '📷';
            default: return '📍';
        }
    }

    function findPointIndexOnRoute(points, obj) {
        if (!Array.isArray(points) || !obj) return -1;
        if (typeof global.traceRouteObjectsMatch === 'function') {
            for (var i = 0; i < points.length; i++) {
                if (global.traceRouteObjectsMatch(points[i], obj)) return i;
            }
            return -1;
        }
        var uid = getUid(obj);
        for (var j = 0; j < points.length; j++) {
            if (points[j] === obj) return j;
            if (uid && points[j] && getUid(points[j]) === uid) return j;
        }
        return -1;
    }

    function getTraceObjectCoords(obj) {
        if (!obj) return null;
        if (typeof global.getObjectRoutingCoords === 'function') {
            var routed = global.getObjectRoutingCoords(obj);
            if (routed && routed.length >= 2) return routed;
        }
        if (obj.geometry) {
            try {
                var coords = obj.geometry.getCoordinates();
                if (coords && coords.length >= 2) return coords;
            } catch (e) {}
        }
        return null;
    }

    function getCableRoutePoints(cable) {
        if (!cable || !cable.properties) return null;
        var points = cable.properties.get('points');
        var spans = cable.properties.get('undergroundSpans') || [];
        if (Array.isArray(points) && points.length >= 2) {
            if (global.CableUnderground && CableUnderground.ensureRouteIncludesUndergroundManholes) {
                return CableUnderground.ensureRouteIncludesUndergroundManholes(points.slice(), spans);
            }
            return points.slice();
        }
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (fromObj && toObj) return [fromObj, toObj];
        return null;
    }

    function getCableSegmentCoords(cable, fromObj, toObj) {
        if (!cable) return [];
        var points = getCableRoutePoints(cable);
        var spans = cable.properties.get('undergroundSpans') || [];
        if (!points || points.length < 2) {
            try {
                return cable.geometry ? cable.geometry.getCoordinates() : [];
            } catch (e) {
                return [];
            }
        }
        var fromIdx = findPointIndexOnRoute(points, fromObj);
        var toIdx = findPointIndexOnRoute(points, toObj);
        if (fromIdx < 0 || toIdx < 0) {
            try {
                return cable.geometry ? cable.geometry.getCoordinates() : [];
            } catch (e2) {
                return [];
            }
        }
        var a = Math.min(fromIdx, toIdx);
        var b = Math.max(fromIdx, toIdx);
        var sub = points.slice(a, b + 1);
        if (global.CableUnderground && CableUnderground.buildCableCoordsFromRoute) {
            var built = CableUnderground.buildCableCoordsFromRoute(sub, spans);
            if (built && built.length >= 2) return built;
        }
        var coords = [];
        sub.forEach(function (p) {
            var ptCoords = getTraceObjectCoords(p);
            if (ptCoords) coords.push(ptCoords);
        });
        return coords.length >= 2 ? coords : [];
    }

    function pathObjectFromItem(item) {
        if (!item) return null;
        if (item.type === 'start' || item.type === 'object') return item.object || null;
        if (item.node) return item.node;
        if (item.onu) return item.onu;
        if (item.mediaConverter) return item.mediaConverter;
        if (item.olt) return item.olt;
        if (item.onuObj) return item.onuObj;
        if (item.nodeObj) return item.nodeObj;
        if (item.mediaConverterObj) return item.mediaConverterObj;
        if (item.splitter) return item.splitter;
        if (item.toSplitter) return item.toSplitter;
        return null;
    }

    /** Сжимает подряд идущие участки кабеля с промежуточными точками (опора, колодец). */
    function compressPathForDisplay(path) {
        if (!Array.isArray(path) || !path.length) return [];
        var out = [];
        var i = 0;
        while (i < path.length) {
            var item = path[i];
            if (item.type !== 'cable') {
                out.push(item);
                i++;
                continue;
            }
            var cableId = item.cableId;
            var waypoints = [];
            var j = i;
            while (j < path.length && path[j].type === 'cable' && path[j].cableId === cableId) {
                if (j + 1 < path.length && path[j + 1].type === 'object' && isWaypointType(path[j + 1].objectType)) {
                    waypoints.push(path[j + 1]);
                    j += 2;
                } else {
                    break;
                }
            }
            if (waypoints.length > 0) {
                var mergedLen = 0;
                var hasLen = false;
                for (var mi = i; mi < j; mi++) {
                    if (path[mi].type === 'cable' && path[mi].segmentLengthM != null) {
                        mergedLen += Number(path[mi].segmentLengthM) || 0;
                        hasLen = true;
                    }
                }
                var merged = Object.assign({}, item, { waypoints: waypoints });
                if (hasLen) merged.segmentLengthM = Math.round(mergedLen);
                out.push(merged);
                i = j;
            } else {
                out.push(item);
                i++;
            }
        }
        return out;
    }

    function analyzePathStatus(path) {
        if (!path || !path.length) {
            return { status: 'empty', label: 'Путь пуст', cssClass: 'trace-path-status--empty' };
        }
        for (var i = path.length - 1; i >= 0; i--) {
            var item = path[i];
            if (item.type === 'object' && item.objectType === 'onu') {
                return {
                    status: 'complete',
                    endpoint: 'onu',
                    label: 'Доходит до ONU «' + (item.objectName || 'ONU') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'onuConnection') {
                return {
                    status: 'complete',
                    endpoint: 'onu',
                    label: 'Доходит до ONU «' + (item.onuName || 'ONU') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'splitterOutputToOnu') {
                return {
                    status: 'complete',
                    endpoint: 'onu',
                    label: 'Доходит до ONU «' + (item.onuName || 'ONU') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'oltPortConnection') {
                var hasLaterNetwork = false;
                for (var k = i + 1; k < path.length; k++) {
                    var after = path[k];
                    if (after.type === 'cable' || after.type === 'connection' || after.type === 'splitterConnection') {
                        hasLaterNetwork = true;
                        break;
                    }
                    if (after.type === 'object' && after.objectType && after.objectType !== 'olt') {
                        hasLaterNetwork = true;
                        break;
                    }
                    if (after.type === 'splitterOutputToOnu' || after.type === 'onuConnection') {
                        hasLaterNetwork = true;
                        break;
                    }
                }
                if (hasLaterNetwork) continue;
                var oltPortLabel = item.incoming ? 'приход' : (typeof formatOltPortDisplay === 'function'
                    ? formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt && typeof getOltPortLabel === 'function' ? getOltPortLabel(item.olt, item.portNumber) : ''))
                    : ('порт ' + item.portNumber));
                return {
                    status: 'complete',
                    endpoint: 'olt',
                    label: 'Доходит до OLT «' + (item.oltName || 'OLT') + '», ' + oltPortLabel,
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'object' && item.objectType === 'olt') {
                var hasLaterThanOlt = false;
                for (var ko = i + 1; ko < path.length; ko++) {
                    var afterOlt = path[ko];
                    if (afterOlt.type === 'cable' || afterOlt.type === 'connection' || afterOlt.type === 'splitterConnection') {
                        hasLaterThanOlt = true;
                        break;
                    }
                    if (afterOlt.type === 'object' && afterOlt.objectType && afterOlt.objectType !== 'olt') {
                        hasLaterThanOlt = true;
                        break;
                    }
                }
                if (hasLaterThanOlt) continue;
                return {
                    status: 'complete',
                    endpoint: 'olt',
                    label: 'Доходит до OLT «' + (item.objectName || 'OLT') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'splitterOutputToNode' || (item.type === 'object' && item.objectType === 'node')) {
                var nodeLabel = item.nodeName || item.objectName || 'Узел';
                if (item.type === 'splitterOutputToNode') {
                    nodeLabel = item.nodeName || (item.nodeObj && item.nodeObj.properties ? item.nodeObj.properties.get('name') : null) || 'Узел';
                }
                return {
                    status: 'complete',
                    endpoint: 'node',
                    label: 'Доходит до узла «' + nodeLabel + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'object' && item.objectType === 'mediaConverter') {
                return {
                    status: 'complete',
                    endpoint: 'mediaConverter',
                    label: 'Доходит до медиаконвертера «' + (item.objectName || 'Медиаконвертер') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'nodeConnection') {
                if (item.fromNode) continue;
                return {
                    status: 'complete',
                    endpoint: 'node',
                    label: 'Вывод на узел «' + (item.nodeName || 'Узел') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
        }
        var lastObjItem = null;
        for (var j = path.length - 1; j >= 0; j--) {
            if (path[j].type === 'object' || path[j].type === 'start') {
                lastObjItem = path[j];
                break;
            }
        }
        if (!lastObjItem) {
            return { status: 'incomplete', label: 'Маршрут обрывается', cssClass: 'trace-path-status--incomplete' };
        }
        var t = lastObjItem.objectType;
        var name = lastObjItem.objectName || getTypeName(t);
        if (isWaypointType(t)) {
            return {
                status: 'incomplete',
                endpoint: t,
                label: 'Обрыв на ' + getTypeName(t).toLowerCase() + ' «' + name + '» — кабель не продолжается',
                cssClass: 'trace-path-status--incomplete'
            };
        }
        if (isFiberHostType(t)) {
            return {
                status: 'incomplete',
                endpoint: t,
                label: 'Обрыв в ' + getTypeName(t).toLowerCase() + ' «' + name + '» — нет сварки на выходе',
                cssClass: 'trace-path-status--incomplete'
            };
        }
        if (t === 'splitter') {
            return {
                status: 'incomplete',
                endpoint: 'splitter',
                label: 'Обрыв на сплиттере «' + name + '» — нет выхода',
                cssClass: 'trace-path-status--incomplete'
            };
        }
        return {
            status: 'incomplete',
            endpoint: t,
            label: 'Конец трассы: ' + getTypeName(t) + ' «' + name + '»',
            cssClass: 'trace-path-status--incomplete'
        };
    }

    function getPathEndpointLabel(path) {
        if (!path || !path.length) return '—';
        for (var i = path.length - 1; i >= 0; i--) {
            var item = path[i];
            if (item.type === 'object' && item.objectType === 'onu') {
                return item.objectName || 'ONU';
            }
            if (item.type === 'onuConnection') {
                return item.onuName || 'ONU';
            }
            if (item.type === 'splitterOutputToOnu') {
                return item.onuName || 'ONU';
            }
            if (item.type === 'oltPortConnection') {
                var hasLaterHop = false;
                for (var k = i + 1; k < path.length; k++) {
                    var afterHop = path[k];
                    if (afterHop.type === 'cable' || afterHop.type === 'connection' || afterHop.type === 'splitterConnection') {
                        hasLaterHop = true;
                        break;
                    }
                    if (afterHop.type === 'object' && afterHop.objectType && afterHop.objectType !== 'olt') {
                        hasLaterHop = true;
                        break;
                    }
                }
                if (hasLaterHop) continue;
                var oltPortLabel = item.incoming ? 'приход' : (typeof formatOltPortDisplay === 'function'
                    ? formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt && typeof getOltPortLabel === 'function' ? getOltPortLabel(item.olt, item.portNumber) : ''))
                    : ('порт ' + item.portNumber));
                return (item.oltName || 'OLT') + ', ' + oltPortLabel;
            }
            if (item.type === 'object' && item.objectType === 'olt') {
                return item.objectName || 'OLT';
            }
            if (item.type === 'splitterOutputToNode' || (item.type === 'object' && item.objectType === 'node')) {
                if (item.type === 'splitterOutputToNode') {
                    return item.nodeName || (item.nodeObj && item.nodeObj.properties ? item.nodeObj.properties.get('name') : null) || 'Узел';
                }
                return item.objectName || 'Узел';
            }
            if (item.type === 'object' && item.objectType === 'mediaConverter') {
                return item.objectName || 'Медиаконвертер';
            }
            if (item.type === 'nodeConnection') {
                if (item.fromNode) continue;
                return item.nodeName || 'Узел';
            }
        }
        for (var j = path.length - 1; j >= 0; j--) {
            if (path[j].type === 'object' || path[j].type === 'start') {
                return path[j].objectName || getTypeName(path[j].objectType);
            }
        }
        return '—';
    }

    function getObjectReserveM(obj) {
        if (!obj || !obj.properties) return 0;
        var v = obj.properties.get('reserveM');
        if (v == null || v === '') return 0;
        var n = Number(v);
        return (!isNaN(n) && n > 0) ? n : 0;
    }

    function getCableDeclaredLengthM(cable) {
        if (!cable || !cable.properties) return null;
        var lm = cable.properties.get('lengthM');
        if (lm != null && lm !== '' && !isNaN(Number(lm)) && Number(lm) >= 0) {
            return Number(lm);
        }
        var dist = cable.properties.get('distance');
        if (dist != null && dist !== '' && !isNaN(Number(dist)) && Number(dist) >= 0) {
            return Number(dist);
        }
        return null;
    }

    function measureCoordsLengthM(coords) {
        if (!coords || coords.length < 2 || typeof global.calculateDistance !== 'function') return 0;
        var total = 0;
        for (var c = 0; c < coords.length - 1; c++) {
            total += global.calculateDistance(coords[c], coords[c + 1]);
        }
        return total;
    }

    function estimateSegmentDistanceM(cable, fromObj, toObj) {
        if (!cable) return null;
        var segCoords = getCableSegmentCoords(cable, fromObj, toObj);
        var segGeom = measureCoordsLengthM(segCoords);
        var declared = getCableDeclaredLengthM(cable);
        if (declared == null) {
            return segGeom > 0 ? Math.round(segGeom) : null;
        }
        var fullCoords = [];
        try {
            fullCoords = cable.geometry ? cable.geometry.getCoordinates() : [];
        } catch (e) {
            fullCoords = [];
        }
        if (!fullCoords || fullCoords.length < 2) {
            var routePts = getCableRoutePoints(cable);
            if (routePts && routePts.length >= 2) {
                fullCoords = [];
                for (var ri = 0; ri < routePts.length; ri++) {
                    var rc = getTraceObjectCoords(routePts[ri]);
                    if (rc) fullCoords.push(rc);
                }
            }
        }
        var fullGeom = measureCoordsLengthM(fullCoords);
        if (fullGeom <= 0.5) {
            return Math.round(declared);
        }
        if (segGeom <= 0) return Math.round(declared);
        var ratio = Math.min(1, Math.max(0, segGeom / fullGeom));
        if (ratio > 0.97) return Math.round(declared);
        return Math.round(declared * ratio);
    }

    function estimatePathDistanceM(path) {
        var enriched = enrichPathWithLengths(path);
        var metrics = summarizePathMetrics(enriched);
        return metrics.distanceM;
    }

    function enrichPathWithLengths(path) {
        if (!Array.isArray(path) || !path.length) return path || [];
        var out = [];
        var lastObj = null;
        var seenHostReserve = {};
        for (var i = 0; i < path.length; i++) {
            var item = path[i];
            var copy = Object.assign({}, item);
            if (item.type === 'start' || item.type === 'object') {
                lastObj = item.object || lastObj;
                var hostObj = item.object;
                if (hostObj && hostObj._embedded && hostObj._host) hostObj = hostObj._host;
                var t = item.objectType;
                var isHost = t === 'sleeve' || t === 'cross' || t === 'spliceCassette' ||
                    (typeof global.isFiberHostType === 'function' && global.isFiberHostType(t));
                if (isHost && hostObj) {
                    var uid = getUid(hostObj);
                    var reserve = getObjectReserveM(hostObj);
                    copy.reserveM = reserve;
                    if (uid && reserve > 0 && !seenHostReserve[uid]) {
                        seenHostReserve[uid] = true;
                        copy.reserveCounted = true;
                    } else {
                        copy.reserveCounted = false;
                    }
                }
            } else if (item.type === 'cable' && item.cable && lastObj) {
                var nextObj = null;
                for (var k = i + 1; k < path.length; k++) {
                    if (path[k].type === 'object' || path[k].type === 'start') {
                        nextObj = path[k].object;
                        break;
                    }
                }
                if (nextObj) {
                    var segLen = estimateSegmentDistanceM(item.cable, lastObj, nextObj);
                    if (segLen != null) copy.segmentLengthM = segLen;
                    lastObj = nextObj;
                }
            }
            out.push(copy);
        }
        return out;
    }

    function summarizePathMetrics(path) {
        var distanceM = 0;
        var hasDistance = false;
        var reserveM = 0;
        var reserveNodes = 0;
        if (!Array.isArray(path)) return { distanceM: null, reserveM: 0, reserveNodes: 0 };
        for (var i = 0; i < path.length; i++) {
            var item = path[i];
            if (item.type === 'cable' && item.segmentLengthM != null) {
                distanceM += Number(item.segmentLengthM) || 0;
                hasDistance = true;
            }
            if ((item.type === 'start' || item.type === 'object') && item.reserveCounted && item.reserveM > 0) {
                reserveM += Number(item.reserveM) || 0;
                reserveNodes++;
            }
        }
        return {
            distanceM: hasDistance ? Math.round(distanceM) : null,
            reserveM: Math.round(reserveM * 10) / 10,
            reserveNodes: reserveNodes
        };
    }

    function collectCablesFromPaths(paths) {
        var map = {};
        var list = [];
        (paths || []).forEach(function (path) {
            (path || []).forEach(function (item) {
                if (item.type !== 'cable' || !item.cableId) return;
                if (map[item.cableId]) return;
                var cable = item.cable;
                if (!cable && Array.isArray(global.objects)) {
                    cable = global.objects.find(function (o) {
                        return o.properties && o.properties.get('type') === 'cable' && getUid(o) === item.cableId;
                    });
                }
                if (!cable) return;
                map[item.cableId] = true;
                list.push({
                    cableId: item.cableId,
                    cable: cable,
                    cableName: item.cableName || cable.properties.get('cableName') || 'Кабель'
                });
            });
        });
        return list;
    }

    function getFreeFibersForCable(cable) {
        if (!cable || !cable.properties) return { total: 0, free: [], used: 0 };
        var cableId = getUid(cable);
        var total = typeof global.getFiberCount === 'function' ? global.getFiberCount(cable) : 0;
        var free = [];
        if (!cableId || !total || typeof global.getFiberUsage !== 'function') {
            return { total: total || 0, free: free, used: 0 };
        }
        for (var n = 1; n <= total; n++) {
            var usage = global.getFiberUsage(cableId, n);
            if (!usage || !usage.used) free.push(n);
        }
        return { total: total, free: free, used: total - free.length };
    }

    function buildFreeFibersHtml(paths) {
        var cables = collectCablesFromPaths(paths);
        if (!cables.length) return '';
        var html = '<div class="trace-free-fibers">';
        html += '<div class="trace-free-fibers-title">Свободные жилы на трассе</div>';
        html += '<div class="trace-free-fibers-list">';
        var anyFree = false;
        cables.forEach(function (entry, idx) {
            var info = getFreeFibersForCable(entry.cable);
            var freeCount = info.free.length;
            if (freeCount > 0) anyFree = true;
            var preview = info.free.slice(0, 12).join(', ');
            if (info.free.length > 12) preview += '…';
            html += '<details class="trace-free-fibers-item"' + (idx === 0 ? ' open' : '') + '>';
            html += '<summary><span class="trace-free-fibers-name">' + esc(entry.cableName) + '</span>';
            html += '<span class="trace-free-fibers-count' + (freeCount ? '' : ' trace-free-fibers-count--none') + '">' +
                freeCount + ' / ' + info.total + ' своб.</span></summary>';
            if (freeCount) {
                html += '<div class="trace-free-fibers-nums">' + esc(preview) + '</div>';
            } else {
                html += '<div class="trace-free-fibers-nums trace-free-fibers-nums--empty">Нет свободных жил</div>';
            }
            html += '</details>';
        });
        if (!anyFree) {
            html += '<div class="trace-free-fibers-hint">На кабелях маршрута свободных жил нет</div>';
        }
        html += '</div></div>';
        return html;
    }

    function resolveFiberFateAtHost(hostObj, cableId, fiberNumber, nextCableId) {
        if (!hostObj || !hostObj.properties) {
            return { kind: 'end', label: 'конец' };
        }
        var splicePeer = null;
        if (typeof global.getSplicedFiberGroup === 'function') {
            var group = global.getSplicedFiberGroup(hostObj, cableId, fiberNumber) || [];
            for (var gi = 0; gi < group.length; gi++) {
                var g = group[gi];
                if (g.cableId !== cableId || Number(g.fiberNumber) !== Number(fiberNumber)) {
                    splicePeer = g;
                    break;
                }
            }
        } else {
            var conns = hostObj.properties.get('fiberConnections') || [];
            for (var ci = 0; ci < conns.length; ci++) {
                var c = conns[ci];
                if (!c || !c.from || !c.to) continue;
                if (c.from.cableId === cableId && Number(c.from.fiberNumber) === Number(fiberNumber)) {
                    splicePeer = c.to;
                    break;
                }
                if (c.to.cableId === cableId && Number(c.to.fiberNumber) === Number(fiberNumber)) {
                    splicePeer = c.from;
                    break;
                }
            }
        }
        if (splicePeer) {
            if (nextCableId && splicePeer.cableId === nextCableId) {
                return {
                    kind: 'continue',
                    label: '→ ж' + splicePeer.fiberNumber,
                    peerCableId: splicePeer.cableId,
                    peerFiber: splicePeer.fiberNumber
                };
            }
            var peerCableName = '';
            if (Array.isArray(global.objects)) {
                var peerCab = global.objects.find(function (o) {
                    return o.properties && o.properties.get('type') === 'cable' && getUid(o) === splicePeer.cableId;
                });
                if (peerCab) {
                    peerCableName = peerCab.properties.get('cableName') ||
                        (typeof global.getCableDescription === 'function'
                            ? global.getCableDescription(peerCab.properties.get('cableType'), peerCab)
                            : 'кабель');
                }
            }
            return {
                kind: 'branch',
                label: (peerCableName || 'кабель') + ' · ж' + splicePeer.fiberNumber,
                peerCableId: splicePeer.cableId,
                peerFiber: splicePeer.fiberNumber
            };
        }

        function hostAss(prop) {
            return typeof global.getHostAssignment === 'function'
                ? global.getHostAssignment(hostObj, prop, cableId, fiberNumber)
                : null;
        }
        var nodeAss = hostAss('nodeConnections');
        if (nodeAss) return { kind: 'end', label: 'узел' + (nodeAss.nodeName ? ' «' + nodeAss.nodeName + '»' : '') };
        var onuAss = hostAss('onuConnections');
        if (onuAss) return { kind: 'end', label: 'ONU' };
        var oltAss = hostAss('oltConnections');
        if (oltAss) return { kind: 'end', label: oltAss.incoming ? 'приход OLT' : 'порт OLT' };
        var mcAss = hostAss('mediaConverterConnections');
        if (mcAss) return { kind: 'end', label: 'МК' };
        var rbAss = hostAss('radioBridgeConnections');
        if (rbAss) return { kind: 'end', label: 'радиомост' };
        var spAss = hostAss('splitterConnections');
        if (spAss) return { kind: 'end', label: 'сплиттер' };

        if (typeof global.getFiberUsage === 'function') {
            var usage = global.getFiberUsage(cableId, fiberNumber);
            if (usage && usage.used) return { kind: 'end', label: usage.where || 'занята' };
        }
        return { kind: 'free', label: 'свободна' };
    }

    function findSchematicCableById(cableId) {
        if (!cableId || !Array.isArray(global.objects)) return null;
        return global.objects.find(function (o) {
            return o.properties && o.properties.get('type') === 'cable' && getUid(o) === cableId;
        }) || null;
    }

    function extractSchematicChain(path) {
        var enriched = enrichPathWithLengths(path || []);
        var nodes = [];
        var segments = [];
        var lastHost = null;
        var lastHostIdx = -1;
        var pendingCable = null;
        var pendingNodeLink = null;

        function pushHost(item) {
            if (!item || !item.object) return;
            if (isWaypointType(item.objectType)) return;
            var obj = item.object;
            if (obj._embedded && obj._host) obj = obj._host;
            var uid = getUid(obj);
            if (lastHost && getUid(lastHost.object) === uid) {
                // тот же хост — можно дописать порт/имя
                if (item.port != null) lastHost.port = item.port;
                return;
            }
            var node = {
                id: uid,
                name: item.objectName || getTypeName(item.objectType),
                type: item.objectType,
                object: obj,
                reserveM: item.reserveM || getObjectReserveM(obj),
                port: item.port || null
            };
            nodes.push(node);
            if (pendingNodeLink && lastHostIdx >= 0) {
                segments.push({
                    kind: 'nodeLink',
                    fromIdx: lastHostIdx,
                    toIdx: nodes.length - 1,
                    cableId: pendingNodeLink.cableId,
                    cableName: pendingNodeLink.cableName,
                    cable: pendingNodeLink.cable,
                    lengthM: null,
                    tracedFiber: pendingNodeLink.fiberNumber,
                    linkLabel: pendingNodeLink.label,
                    fromNode: !!pendingNodeLink.fromNode
                });
                pendingNodeLink = null;
                pendingCable = null;
            } else if (pendingCable && lastHostIdx >= 0) {
                segments.push({
                    kind: 'cable',
                    fromIdx: lastHostIdx,
                    toIdx: nodes.length - 1,
                    cableId: pendingCable.cableId,
                    cableName: pendingCable.cableName,
                    cable: pendingCable.cable,
                    lengthM: pendingCable.segmentLengthM,
                    tracedFiber: pendingCable.fiberNumber
                });
                pendingCable = null;
            }
            lastHost = node;
            lastHostIdx = nodes.length - 1;
        }

        for (var i = 0; i < enriched.length; i++) {
            var item = enriched[i];
            if (item.type === 'start' || item.type === 'object') {
                if (isWaypointType(item.objectType)) continue;
                pushHost(item);
            } else if (item.type === 'cable' && item.cableId) {
                if (pendingCable && pendingCable.cableId === item.cableId) {
                    var addLen = item.segmentLengthM != null ? Number(item.segmentLengthM) : 0;
                    if (pendingCable.segmentLengthM != null || addLen) {
                        pendingCable.segmentLengthM = Math.round((Number(pendingCable.segmentLengthM) || 0) + addLen);
                    }
                    if (item.fiberNumber != null) pendingCable.fiberNumber = item.fiberNumber;
                } else {
                    pendingCable = Object.assign({}, item);
                }
            } else if (item.type === 'connection' || item.type === 'crossPortPatch') {
                pendingCable = null;
            } else if (item.type === 'nodeConnection') {
                var cableObj = findSchematicCableById(item.cableId);
                var cabName = cableObj
                    ? (cableObj.properties.get('cableName') ||
                        (typeof global.getCableDescription === 'function'
                            ? global.getCableDescription(cableObj.properties.get('cableType'), cableObj)
                            : 'Кабель'))
                    : 'Кабель';
                if (item.fromNode) {
                    // Узел сети → кросс по жиле
                    pendingNodeLink = {
                        fromNode: true,
                        cableId: item.cableId,
                        fiberNumber: item.fiberNumber,
                        cable: cableObj,
                        cableName: cabName,
                        label: 'с узла · ж' + item.fiberNumber
                    };
                    pendingCable = null;
                    if (item.cross) {
                        pushHost({
                            type: 'object',
                            objectType: 'cross',
                            objectName: item.cross.properties.get('name') || item.nodeName || 'Кросс',
                            object: item.cross,
                            port: (item.cross.properties.get('fiberPorts') || {})[item.cableId + '-' + item.fiberNumber] || null,
                            reserveM: 0
                        });
                    }
                } else {
                    // Кросс → узел сети
                    pendingNodeLink = {
                        fromNode: false,
                        cableId: item.cableId,
                        fiberNumber: item.fiberNumber,
                        cable: cableObj,
                        cableName: cabName,
                        label: 'на узел · ж' + item.fiberNumber
                    };
                    pendingCable = null;
                    if (item.node) {
                        pushHost({
                            type: 'object',
                            objectType: 'node',
                            objectName: item.nodeName || (item.node.properties.get('name') || 'Узел сети'),
                            object: item.node,
                            reserveM: 0
                        });
                    }
                }
            } else if (item.type === 'onuConnection' ||
                item.type === 'oltPortConnection' || item.type === 'mediaConverterConnection' ||
                item.type === 'splitterConnection' || item.type === 'splitterOutputToOnu' ||
                item.type === 'splitterOutputToNode' || item.type === 'splitterOutputToHost' ||
                item.type === 'splitterOutputToSplitter' || item.type === 'splitterOutputToMediaConverter' ||
                item.type === 'splitterOutputToCrossPort') {
                var endObj = item.node || item.onu || item.olt || item.mediaConverter ||
                    item.splitter || item.onuObj || item.nodeObj || item.host || item.toSplitter || item.toCross;
                var endType = item.node ? 'node' : (item.onu || item.onuObj ? 'onu' : (item.olt ? 'olt' :
                    (item.mediaConverter || item.mediaConverterObj ? 'mediaConverter' :
                        (item.splitter || item.toSplitter ? 'splitter' : (item.toCross ? 'cross' : 'object')))));
                var endName = item.nodeName || item.onuName || item.oltName || item.mediaConverterName ||
                    (endObj && endObj.properties ? endObj.properties.get('name') : null) || getTypeName(endType);
                if (endObj) {
                    pushHost({
                        type: 'object',
                        objectType: endType,
                        objectName: endName,
                        object: endObj,
                        reserveM: 0
                    });
                }
                pendingCable = null;
            }
        }
        return { nodes: nodes, segments: segments };
    }

    function buildSchematicFiberRows(segment, toHost) {
        var cable = segment.cable || findSchematicCableById(segment.cableId);
        var colors = [];
        if (typeof global.getFiberColors === 'function') {
            colors = cable ? global.getFiberColors(cable) : [];
        }
        var total = typeof global.getFiberCount === 'function' && cable
            ? global.getFiberCount(cable)
            : (colors.length || 0);
        if (!total && colors.length) total = colors.length;
        if (!total) total = Math.max(1, Number(segment.tracedFiber) || 1);

        // Узел↔кросс: одна жила, но total = ёмкость кабеля — для выравнивания laneY с соседним сегментом
        if (segment.kind === 'nodeLink') {
            var n = Number(segment.tracedFiber) || 1;
            var meta = colors.find(function (f) { return f.number === n; }) || { number: n, color: '#06b6d4', name: '' };
            return {
                cable: cable,
                total: Math.max(total, n),
                rows: [{
                    number: n,
                    color: meta.color || '#06b6d4',
                    name: meta.name || '',
                    hasBlackRing: !!meta.hasBlackRing,
                    traced: true,
                    fate: segment.fromNode
                        ? { kind: 'continue', label: 'в кросс' }
                        : { kind: 'end', label: 'узел сети' }
                }]
            };
        }

        var rows = [];
        for (var fi = 1; fi <= total; fi++) {
            var m = colors.find(function (f) { return f.number === fi; }) || { number: fi, color: '#94a3b8', name: '' };
            rows.push({
                number: fi,
                color: m.color || '#94a3b8',
                name: m.name || '',
                hasBlackRing: !!m.hasBlackRing,
                traced: Number(segment.tracedFiber) === fi,
                fate: null
            });
        }
        return { cable: cable, total: total, rows: rows };
    }

    function buildTraceSchematicModel(path) {
        var chain = extractSchematicChain(path);
        var segments = chain.segments.map(function (seg, si) {
            var toHost = chain.nodes[seg.toIdx];
            var fromHost = chain.nodes[seg.fromIdx];
            var nextSeg = chain.segments[si + 1];
            var nextCableId = nextSeg ? nextSeg.cableId : null;
            var built = buildSchematicFiberRows(seg, toHost);
            if (seg.kind !== 'nodeLink') {
                built.rows.forEach(function (row) {
                    row.fate = resolveFiberFateAtHost(
                        toHost && toHost.object,
                        seg.cableId,
                        row.number,
                        nextCableId
                    );
                    if (row.traced && row.fate.kind === 'free') {
                        if (nextCableId) {
                            row.fate = { kind: 'continue', label: 'трасса →', peerCableId: nextCableId };
                        } else if (toHost && toHost.type === 'node') {
                            row.fate = { kind: 'end', label: 'узел сети' };
                        } else {
                            row.fate = { kind: 'end', label: 'конец трассы' };
                        }
                    }
                    // На кроссе, если жила уходит на узел (nodeConnections) — явно пометить
                    if (row.traced && toHost && toHost.type === 'cross' && row.fate && row.fate.kind === 'end' &&
                        row.fate.label && row.fate.label.indexOf('узел') === 0) {
                        row.fate.label = 'на узел';
                    }
                });
            }
            var title;
            if (seg.kind === 'nodeLink') {
                title = seg.fromNode
                    ? ('Узел → кросс · ж' + seg.tracedFiber)
                    : ('Кросс → узел · ж' + seg.tracedFiber);
                if (seg.cableName) title += ' · ' + seg.cableName;
            } else {
                title = seg.cableName || (built.cable && built.cable.properties
                    ? (built.cable.properties.get('cableName') || 'Кабель')
                    : 'Кабель');
            }
            return {
                kind: seg.kind || 'cable',
                fromIdx: seg.fromIdx,
                toIdx: seg.toIdx,
                cableId: seg.cableId,
                cableName: title,
                cable: built.cable || seg.cable,
                lengthM: seg.lengthM,
                tracedFiber: seg.tracedFiber,
                fiberCount: built.total,
                fibers: built.rows,
                linkLabel: seg.linkLabel || null,
                fromNode: !!seg.fromNode,
                fromType: fromHost ? fromHost.type : null,
                toType: toHost ? toHost.type : null
            };
        });
        return { nodes: chain.nodes, segments: segments };
    }

    function schematicSvgEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderTraceSchematicSvg(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';

        var maxFibers = 1;
        model.segments.forEach(function (s) {
            if (s.fiberCount > maxFibers) maxFibers = s.fiberCount;
            if (s.tracedFiber != null && Number(s.tracedFiber) > maxFibers) maxFibers = Number(s.tracedFiber);
        });

        var showAll = maxFibers <= 48;
        var pitch = maxFibers > 36 ? 5 : (maxFibers > 24 ? 6 : (maxFibers > 12 ? 7 : 9));
        var fiberH = Math.max(88, Math.min(220, maxFibers * pitch + 20));
        var nodeW = 88;
        var cableW = 200;
        var padX = 20;
        var padTop = 44;
        var padBot = 28;
        var branchExtra = 44;
        var width = padX * 2 + model.nodes.length * nodeW + model.segments.length * cableW;
        var height = padTop + fiberH + padBot + branchExtra;

        var nodeX = [];
        var xCursor = padX;
        for (var ni = 0; ni < model.nodes.length; ni++) {
            nodeX.push(xCursor + nodeW / 2);
            xCursor += nodeW;
            if (ni < model.segments.length) xCursor += cableW;
        }

        function laneY(fiberNumber) {
            var n = Math.max(1, Number(fiberNumber) || 1);
            var span = Math.max(1, maxFibers - 1);
            var top = padTop + 12;
            var usable = fiberH - 24;
            if (maxFibers <= 1) return top + usable / 2;
            return top + ((Math.min(n, maxFibers) - 1) / span) * usable;
        }

        var parts = [];
        parts.push('<svg class="trace-schematic-svg" viewBox="0 0 ' + width + ' ' + height +
            '" width="' + width + '" height="' + height +
            '" data-base-w="' + width + '" data-base-h="' + height +
            '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Схема трассы жил">');

        // Фон полосы жил — один общий «лоток», без pinch
        parts.push('<rect class="trace-sch-band" x="' + padX + '" y="' + padTop +
            '" width="' + (width - padX * 2) + '" height="' + fiberH + '" rx="10"/>');

        model.nodes.forEach(function (node, i) {
            var cx = nodeX[i];
            var label = schematicSvgEsc(node.name || getTypeName(node.type));
            if (label.length > 16) label = label.slice(0, 14) + '…';
            var typeLbl = schematicSvgEsc(getTypeName(node.type));
            parts.push('<rect class="trace-sch-node-bg" x="' + (cx - nodeW / 2 + 3) + '" y="' + (padTop - 2) +
                '" width="' + (nodeW - 6) + '" height="' + (fiberH + 4) + '" rx="8"/>');
            parts.push('<text class="trace-sch-node-title" x="' + cx + '" y="16" text-anchor="middle">' + label + '</text>');
            parts.push('<text class="trace-sch-node-type" x="' + cx + '" y="28" text-anchor="middle">' + typeLbl + '</text>');
            if (node.port != null) {
                parts.push('<text class="trace-sch-node-port" x="' + cx + '" y="' + (padTop + fiberH + 14) +
                    '" text-anchor="middle">порт ' + schematicSvgEsc(String(node.port)) + '</text>');
            } else if (node.reserveM > 0) {
                parts.push('<text class="trace-sch-node-reserve" x="' + cx + '" y="' + (padTop + fiberH + 14) +
                    '" text-anchor="middle">+' + node.reserveM + ' м</text>');
            }
        });

        model.segments.forEach(function (seg, si) {
            var x0 = nodeX[seg.fromIdx] + nodeW * 0.32;
            var x1 = nodeX[seg.toIdx] - nodeW * 0.32;
            var midX = (x0 + x1) / 2;
            var lenTxt = seg.lengthM != null ? (seg.lengthM + ' м') : '';
            var topLbl;
            if (seg.kind === 'nodeLink') {
                topLbl = 'ж' + seg.tracedFiber + (seg.fromNode ? ' · с узла' : ' · на узел');
            } else {
                var shortName = (seg.cableName || 'Кабель').split('·')[0].trim();
                if (shortName.length > 22) shortName = shortName.slice(0, 20) + '…';
                topLbl = shortName + (seg.fiberCount ? ' · ' + seg.fiberCount + 'F' : '') +
                    (lenTxt ? ' · ' + lenTxt : '');
            }
            parts.push('<text class="trace-sch-cable-label' + (seg.kind === 'nodeLink' ? ' trace-sch-cable-label--link' : '') +
                '" x="' + midX + '" y="' + (padTop - 6) + '" text-anchor="middle">' +
                schematicSvgEsc(topLbl) + '</text>');

            // Лёгкие направляющие дорожек на кабеле (не на link)
            if (seg.kind !== 'nodeLink' && showAll && maxFibers >= 4) {
                for (var g = 1; g <= maxFibers; g++) {
                    if (g !== 1 && g !== maxFibers && g % 4 !== 0) continue;
                    var gy = laneY(g);
                    parts.push('<line x1="' + x0 + '" y1="' + gy + '" x2="' + x1 + '" y2="' + gy +
                        '" stroke="rgba(148,163,184,0.12)" stroke-width="1"/>');
                }
            }

            var nextSeg = model.segments[si + 1];
            var branchSlot = 0;
            var drawOrder = (seg.fibers || []).slice().sort(function (a, b) {
                return (a.traced ? 1 : 0) - (b.traced ? 1 : 0);
            });

            drawOrder.forEach(function (fiber) {
                if (!showAll && !fiber.traced && fiber.fate && fiber.fate.kind === 'free') return;
                var y = laneY(fiber.number);
                var stroke = fiber.color || '#94a3b8';
                if (stroke === '#FFFFFF' || stroke === '#ffffff' || stroke === '#FFFACD') stroke = '#cbd5e1';
                var d = 'M ' + x0 + ' ' + y + ' L ' + x1 + ' ' + y;
                var isFree = fiber.fate && fiber.fate.kind === 'free';

                if (fiber.traced) {
                    parts.push('<path d="' + d + '" fill="none" stroke="#22d3ee" stroke-width="7" stroke-opacity="0.2" stroke-linecap="round"/>');
                    parts.push('<path d="' + d + '" fill="none" stroke="#06b6d4" stroke-width="3.2" stroke-linecap="round"/>');
                    parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.4" stroke-linecap="round"/>');
                    parts.push('<circle cx="' + x0 + '" cy="' + y + '" r="3.8" fill="#06b6d4" stroke="#0f172a" stroke-width="1"/>');
                    parts.push('<circle cx="' + x1 + '" cy="' + y + '" r="3.8" fill="#06b6d4" stroke="#0f172a" stroke-width="1"/>');
                    if (seg.kind === 'nodeLink' || si === 0) {
                        parts.push('<text class="trace-sch-fiber-num--traced" x="' + (x0 - 6) + '" y="' + (y + 3.5) +
                            '" text-anchor="end">' + fiber.number + '</text>');
                    }
                } else {
                    var opac = isFree ? 0.28 : 0.78;
                    var sw = isFree ? 1.1 : 1.65;
                    var dash = isFree ? ' stroke-dasharray="2.5 2.5"' : '';
                    parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw +
                        '" stroke-opacity="' + opac + '" stroke-linecap="round"' + dash + '/>');
                    if (isFree) {
                        parts.push('<circle cx="' + x1 + '" cy="' + y + '" r="1.8" fill="none" stroke="' + stroke +
                            '" stroke-width="1" stroke-opacity="0.4"/>');
                    } else if (fiber.fate && fiber.fate.kind === 'end') {
                        parts.push('<circle cx="' + x1 + '" cy="' + y + '" r="2.4" fill="' + stroke + '"/>');
                    }
                    if (fiber.number === 1 || fiber.number === maxFibers || fiber.number % 8 === 0) {
                        parts.push('<text class="trace-sch-fiber-num" x="' + (x0 - 4) + '" y="' + (y + 3) +
                            '" text-anchor="end">' + fiber.number + '</text>');
                    }
                }

                if (fiber.traced && fiber.fate && fiber.fate.kind === 'end' && fiber.fate.label && !nextSeg) {
                    parts.push('<text class="trace-sch-end-label" x="' + (x1 + 7) + '" y="' + (y + 3.5) + '">' +
                        schematicSvgEsc(String(fiber.fate.label).slice(0, 18)) + '</text>');
                }

                // Переход трассы в следующий кабель: через узел, а не петлёй внутри текущего сегмента
                if (fiber.traced && nextSeg && fiber.fate && (
                    fiber.fate.kind === 'continue' ||
                    (fiber.fate.kind === 'branch' && fiber.fate.peerCableId &&
                        nextSeg.cableId && fiber.fate.peerCableId === nextSeg.cableId)
                )) {
                    var peerN = fiber.fate.peerFiber != null
                        ? Number(fiber.fate.peerFiber)
                        : (Number(nextSeg.tracedFiber) || Number(fiber.number));
                    var yNext = laneY(peerN);
                    var xNext0 = nodeX[nextSeg.fromIdx] + nodeW * 0.32;
                    var cxNode = nodeX[seg.toIdx];
                    parts.push('<path d="M ' + x1 + ' ' + y +
                        ' C ' + (x1 + (cxNode - x1) * 0.55) + ' ' + y + ', ' +
                        (xNext0 - (xNext0 - cxNode) * 0.55) + ' ' + yNext + ', ' +
                        xNext0 + ' ' + yNext +
                        '" fill="none" stroke="#06b6d4" stroke-width="2.4" stroke-linecap="round"/>');
                    if (Number(peerN) !== Number(fiber.number)) {
                        parts.push('<text class="trace-sch-splice-label" x="' + cxNode + '" y="' +
                            ((y + yNext) / 2 - 4) + '" text-anchor="middle">ж' + fiber.number +
                            '→ж' + peerN + '</text>');
                    }
                }

                if (fiber.fate && fiber.fate.kind === 'branch' && (fiber.traced || branchSlot < 3)) {
                    var by = padTop + fiberH + 12 + branchSlot * 11;
                    branchSlot++;
                    parts.push('<path d="M ' + x1 + ' ' + y + ' L ' + x1 + ' ' + by +
                        '" fill="none" stroke="' + stroke + '" stroke-width="1.2" stroke-opacity="0.7"/>');
                    parts.push('<circle cx="' + x1 + '" cy="' + by + '" r="2.2" fill="' + stroke + '"/>');
                    parts.push('<text class="trace-sch-branch-label" x="' + (x1 + 5) + '" y="' + (by + 3) + '">ж' +
                        fiber.number + ' → ' + schematicSvgEsc((fiber.fate.label || '').slice(0, 20)) + '</text>');
                }
            });
        });

        parts.push('</svg>');
        return parts.join('');
    }

    function buildTraceSchematicOverviewHtml(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';
        var html = '<div class="trace-sch-overview">';
        model.nodes.forEach(function (node, i) {
            if (i > 0) html += '<span class="trace-sch-overview-line" aria-hidden="true"></span>';
            html += '<span class="trace-sch-overview-node" title="' + esc(node.name) + '">' +
                '<span class="trace-sch-overview-dot"></span>' +
                '<span class="trace-sch-overview-label">' + esc(node.name) + '</span></span>';
        });
        html += '</div>';
        return html;
    }

    function buildTraceSchematicToolbarHtml() {
        return '<div class="trace-schematic-tools">' +
            '<div class="trace-sch-zoom-controls" title="Масштаб (Ctrl + колёсико)">' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="out" title="Уменьшить">−</button>' +
            '<input type="range" class="trace-sch-zoom-slider" min="40" max="250" value="100" step="5" aria-label="Масштаб схемы">' +
            '<span class="trace-sch-zoom-label">100%</span>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="in" title="Увеличить">+</button>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="fit" title="Вписать в область">⊡</button>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="reset" title="100%">100%</button>' +
            '</div>' +
            '</div>';
    }

    function buildTraceSchematicHtml(path, opts) {
        opts = opts || {};
        var model = buildTraceSchematicModel(path);
        if (!model.nodes.length) return '';
        var metrics = summarizePathMetrics(enrichPathWithLengths(path));
        var html = '<div class="trace-schematic">';
        html += '<div class="trace-schematic-head">';
        html += '<div class="trace-schematic-title">Схема жил</div>';
        html += buildTraceSchematicToolbarHtml();
        html += '</div>';
        html += '<div class="trace-sch-export-root">';
        html += '<div class="trace-schematic-legend">';
        html += '<span class="trace-sch-leg trace-sch-leg--traced">трассируемая</span>';
        html += '<span class="trace-sch-leg trace-sch-leg--used">занята / сварка</span>';
        html += '<span class="trace-sch-leg trace-sch-leg--free">свободна</span>';
        html += '<span class="trace-sch-leg trace-sch-leg--branch">ушла в другой кабель</span>';
        html += '</div>';
        html += buildTraceSchematicOverviewHtml(model);
        if (metrics.distanceM != null || metrics.reserveM > 0) {
            html += '<div class="trace-schematic-metrics">';
            if (metrics.distanceM != null) html += '<span>~' + metrics.distanceM + ' м по трассе</span>';
            if (metrics.reserveM > 0) html += '<span>запас ' + metrics.reserveM + ' м</span>';
            html += '</div>';
        }
        html += '<div class="trace-schematic-scroll">';
        html += '<div class="trace-sch-zoom-inner">';
        html += renderTraceSchematicSvg(model);
        html += '</div></div>';
        html += '</div>';
        var maxF = 0;
        model.segments.forEach(function (s) { if (s.fiberCount > maxF) maxF = s.fiberCount; });
        var compactNote = maxF > 48 ? ' На кабелях &gt;48 жил свободные линии скрыты для читаемости.' : '';
        html += '<p class="trace-schematic-hint">Прямые параллельные линии — жилы кабеля. Голубая с точками — трассируемая. Пунктир — свободна. Ответвление вниз — сварка в другой кабель. Ctrl+колёсико — масштаб.' + compactNote + '</p>';
        html += '</div>';
        return html;
    }

    function buildTraceSchematicsHtml(paths) {
        if (!paths || !paths.length) return '';
        if (paths.length === 1) return buildTraceSchematicHtml(paths[0]);
        var html = '';
        paths.forEach(function (path, i) {
            var label = getPathEndpointLabel(path);
            html += '<div class="trace-schematic-branch" data-branch-index="' + i + '">';
            if (paths.length > 1) {
                html += '<div class="trace-schematic-branch-title">Ветка: ' + esc(label) + '</div>';
            }
            html += buildTraceSchematicHtml(path);
            html += '</div>';
        });
        return html;
    }

    function traceCoordsDiffer(a, b) {
        if (!a || !b || a.length < 2 || b.length < 2) return false;
        return Math.abs(a[0] - b[0]) > 1e-6 || Math.abs(a[1] - b[1]) > 1e-6;
    }

    function pushTraceLinkLine(fromObj, toCoords, lines) {
        var fromCoords = getTraceObjectCoords(fromObj);
        if (fromCoords && toCoords && traceCoordsDiffer(fromCoords, toCoords)) {
            lines.push({ coords: [fromCoords, toCoords], underground: false });
        }
    }

    function buildHighlightGeometries(path) {
        var lines = [];
        var points = [];
        if (!path || !path.length) return { lines: lines, points: points };

        var lastObj = null;
        path.forEach(function (item, idx) {
            if (item.type === 'start' || item.type === 'object') {
                var traceObj = item.object;
                if (traceObj && traceObj._embedded && traceObj._host) traceObj = traceObj._host;
                var traceCoords = getTraceObjectCoords(traceObj);
                if (traceCoords) {
                    points.push({
                        coords: traceCoords,
                        type: item.objectType
                    });
                }
                lastObj = traceObj || item.object || lastObj;
            } else if (item.type === 'cable' && item.cable && lastObj) {
                var nextObj = null;
                for (var k = idx + 1; k < path.length; k++) {
                    if (path[k].type === 'object' || path[k].type === 'start') {
                        nextObj = path[k].object;
                        break;
                    }
                }
                if (nextObj) {
                    var seg = getCableSegmentCoords(item.cable, lastObj, nextObj);
                    if (seg && seg.length >= 2) {
                        var isUg = false;
                        if (global.CableUnderground) {
                            var routePts = getCableRoutePoints(item.cable);
                            var spans = item.cable.properties.get('undergroundSpans') || [];
                            if (routePts && CableUnderground.isUndergroundLegBetween) {
                                var fi = findPointIndexOnRoute(routePts, lastObj);
                                var ti = findPointIndexOnRoute(routePts, nextObj);
                                if (fi >= 0 && ti >= 0) {
                                    var lo = Math.min(fi, ti);
                                    var hi = Math.max(fi, ti);
                                    for (var leg = lo; leg < hi; leg++) {
                                        if (CableUnderground.isUndergroundLegBetween(routePts, leg, spans)) {
                                            isUg = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        lines.push({ coords: seg, underground: isUg });
                    }
                    lastObj = nextObj;
                }
            } else if (item.type === 'splitterConnection') {
                [item.sleeve, item.splitter].forEach(function (o) {
                    var pin = o && o._embedded && o._host ? o._host : o;
                    if (pin && pin.geometry) {
                        try { points.push({ coords: pin.geometry.getCoordinates(), type: 'splitter' }); } catch (e2) {}
                    }
                });
            } else if (item.type === 'splitterOutputToHost' && item.host && item.host.geometry) {
                try { points.push({ coords: item.host.geometry.getCoordinates(), type: 'splitter' }); } catch (e2b) {}
            } else if (item.type === 'splitterOutputToNode' && item.nodeObj && item.nodeObj.geometry) {
                try { points.push({ coords: item.nodeObj.geometry.getCoordinates(), type: 'node' }); } catch (e3a) {}
            } else if (item.type === 'splitterOutputToMediaConverter' && item.mediaConverterObj && item.mediaConverterObj.geometry) {
                try { points.push({ coords: item.mediaConverterObj.geometry.getCoordinates(), type: 'mediaConverter' }); } catch (e3b) {}
            } else if (item.type === 'nodeConnection' && item.node && item.node.geometry) {
                try { points.push({ coords: item.node.geometry.getCoordinates(), type: 'node' }); } catch (e3) {}
            } else if (item.type === 'onuConnection' && item.onu && item.onu.geometry) {
                try { points.push({ coords: item.onu.geometry.getCoordinates(), type: 'onu' }); } catch (e4) {}
            } else if (item.type === 'mediaConverterConnection' && item.mediaConverter && item.mediaConverter.geometry) {
                try { points.push({ coords: item.mediaConverter.geometry.getCoordinates(), type: 'mediaConverter' }); } catch (e5) {}
            } else if (item.type === 'oltPortConnection' && item.olt) {
                var oltCoords = getTraceObjectCoords(item.olt);
                if (oltCoords) {
                    pushTraceLinkLine(lastObj, oltCoords, lines);
                    points.push({ coords: oltCoords, type: 'olt' });
                    lastObj = item.olt;
                }
            }
        });
        return { lines: lines, points: points };
    }

    function renderPathStatusHtml(path) {
        var enriched = enrichPathWithLengths(path);
        var status = analyzePathStatus(path);
        var metrics = summarizePathMetrics(enriched);
        var icon = status.status === 'complete' ? '✓' : (status.status === 'empty' ? '·' : '⚠');
        var html = '<div class="trace-path-status ' + status.cssClass + '">';
        html += '<span class="trace-path-status-icon">' + icon + '</span>';
        html += '<span class="trace-path-status-text">' + (typeof global.escapeHtml === 'function' ? global.escapeHtml(status.label) : status.label) + '</span>';
        if (metrics.distanceM != null) {
            html += '<span class="trace-path-status-distance">~' + metrics.distanceM + ' м</span>';
        }
        if (metrics.reserveM > 0) {
            html += '<span class="trace-path-status-reserve">запас ' + metrics.reserveM + ' м</span>';
        }
        html += '</div>';
        return html;
    }

    function renderWaypointsInlineHtml(waypoints) {
        if (!waypoints || !waypoints.length) return '';
        var esc = typeof global.escapeHtml === 'function' ? global.escapeHtml : function (s) { return s; };
        var parts = waypoints.map(function (wp) {
            return getObjectIcon(wp.objectType) + ' ' + esc(wp.objectName || getTypeName(wp.objectType));
        });
        return '<span class="trace-waypoints-inline">через ' + parts.join(' → ') + '</span>';
    }

    function pathItemToText(item) {
        if (!item) return '';
        if (item.type === 'start' || item.type === 'object') {
            var port = (item.objectType === 'cross' && item.port) ? ', порт ' + item.port : '';
            var reserve = (item.reserveM != null && item.reserveM > 0) ? (', запас ' + item.reserveM + ' м') : '';
            return getObjectIcon(item.objectType) + ' ' + (item.objectName || getTypeName(item.objectType)) + port + reserve + ' (' + getTypeName(item.objectType) + ')';
        }
        if (item.type === 'cable') {
            var wp = '';
            if (item.waypoints && item.waypoints.length) {
                wp = ' [' + item.waypoints.map(function (w) {
                    return (w.objectName || getTypeName(w.objectType));
                }).join(' → ') + ']';
            }
            var len = (item.segmentLengthM != null) ? (' ~' + item.segmentLengthM + ' м') : '';
            return '  → Кабель «' + (item.cableName || 'кабель') + '», жила ' + item.fiberNumber + len + wp;
        }
        if (item.type === 'connection') {
            return '  ↔ Сварка: ж' + item.fromFiberNumber + (item.fromLabel ? ' [' + item.fromLabel + ']' : '') +
                ' → ж' + item.toFiberNumber + (item.toLabel ? ' [' + item.toLabel + ']' : '');
        }
        if (item.type === 'nodeConnection') {
            if (item.fromNode) {
                return '  🔌 → Кросс «' + (item.nodeName || 'Кросс') + '», жила ' + item.fiberNumber;
            }
            return '  🔌 Вывод на узел «' + (item.nodeName || 'Узел') + '», жила ' + item.fiberNumber;
        }
        if (item.type === 'onuConnection') {
            return '  🔌 Вывод на ONU «' + (item.onuName || 'ONU') + '», жила ' + item.fiberNumber;
        }
        if (item.type === 'mediaConverterConnection') {
            return '  ⇄ Медиаконвертер «' + (item.mediaConverterName || 'МК') + '», жила ' + item.fiberNumber;
        }
        if (item.type === 'splitterConnection') {
            var spN = item.splitter && item.splitter.properties ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
            return '  🔀 На сплиттер «' + spN + '», жила ' + item.fiberNumber;
        }
        if (item.type === 'splitterOutputToOnu') {
            return '  🔀 → ONU «' + (item.onuName || 'ONU') + '»';
        }
        if (item.type === 'splitterOutputToNode') {
            var spNodePort = item.switchPort != null ? ', SFP ' + item.switchPort : '';
            return '  🔀 → Узел «' + (item.nodeName || 'Узел') + '»' + spNodePort;
        }
        if (item.type === 'splitterOutputToMediaConverter') {
            return '  🔀 → МК «' + (item.mediaConverterName || 'Медиаконвертер') + '»';
        }
        if (item.type === 'splitterOutputToSplitter') {
            var toN = item.toSplitter && item.toSplitter.properties ? (item.toSplitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
            return '  🔀 → Сплиттер «' + toN + '»';
        }
        if (item.type === 'splitterOutputToHost') {
            var hostN = item.host && item.host.properties ? (item.host.properties.get('name') || 'Муфта/кросс') : 'Муфта/кросс';
            return '  🔀 → «' + hostN + '», жила ' + (item.fiberNumber != null ? item.fiberNumber : '?');
        }
        if (item.type === 'splitterOutputToCrossPort') {
            return '  🔀 → порт ' + item.crossPort + ' («' + (item.crossName || 'Кросс') + '»)';
        }
        if (item.type === 'oltPortConnection') {
            var portLabel = item.incoming ? 'приход' : (typeof formatOltPortDisplay === 'function'
                ? formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt && typeof getOltPortLabel === 'function' ? getOltPortLabel(item.olt, item.portNumber) : ''))
                : ('порт ' + item.portNumber));
            return '  📶 OLT «' + (item.oltName || 'OLT') + '», ' + portLabel + ', жила ' + item.fiberNumber;
        }
        return '';
    }

    function pathToPlainText(path, opts) {
        opts = opts || {};
        if (!path || !path.length) return '';
        var lines = [];
        var enriched = enrichPathWithLengths(path);
        var displayPath = compressPathForDisplay(enriched);
        var step = opts.startStep || 1;
        displayPath.forEach(function (item) {
            var line = pathItemToText(item);
            if (!line) return;
            if (item.type === 'start' || item.type === 'object') {
                lines.push(step + '. ' + line);
                step++;
            } else {
                lines.push(line);
            }
        });
        var status = analyzePathStatus(path);
        var metrics = summarizePathMetrics(enriched);
        lines.push('—');
        var footerParts = [status.label];
        if (metrics.distanceM != null) footerParts.push('~' + metrics.distanceM + ' м');
        if (metrics.reserveM > 0) footerParts.push('запас ' + metrics.reserveM + ' м');
        lines.push(footerParts.join(' · '));
        return lines.join('\n');
    }

    function pathsToPlainText(paths, opts) {
        if (!paths || !paths.length) return '';
        if (paths.length === 1) return pathToPlainText(paths[0], opts);
        var out = [];
        paths.forEach(function (path, i) {
            if (i > 0) out.push('');
            out.push('=== ' + getPathEndpointLabel(path) + ' ===');
            out.push(pathToPlainText(path, { startStep: 1 }));
        });
        return out.join('\n');
    }

    function pathSignature(path) {
        if (!path || !path.length) return '';
        return path.map(function (item) {
            if (item.type === 'cable') return 'C:' + item.cableId + ':' + item.fiberNumber;
            if (item.type === 'object' || item.type === 'start') {
                return 'O:' + item.objectType + ':' + (item.object ? getUid(item.object) : item.objectName);
            }
            if (item.type === 'connection') {
                return 'X:' + item.fromCableId + ':' + item.fromFiberNumber + '>' + item.toCableId + ':' + item.toFiberNumber;
            }
            if (item.type === 'oltPortConnection') return 'OLT:' + (item.olt ? getUid(item.olt) : item.oltName) + ':' + item.portNumber;
            if (item.type === 'nodeConnection') return 'N:' + (item.node ? getUid(item.node) : item.nodeName);
            return item.type;
        }).join('|');
    }

    function dedupePaths(paths) {
        if (!Array.isArray(paths) || paths.length < 2) return paths || [];
        var seen = new Set();
        var out = [];
        paths.forEach(function (path) {
            var sig = pathSignature(path);
            if (seen.has(sig)) return;
            seen.add(sig);
            out.push(path);
        });
        return out;
    }

    function prependNodePrefixToPath(path, nodeObj, crossObj, cableId, fiberNumber, nodeConn) {
        if (!path || !path.length || !nodeObj || !crossObj) return path;
        var crossName = crossObj.properties.get('name') || 'Кросс';
        var nodeName = nodeObj.properties.get('name') || 'Узел сети';
        var port = (crossObj.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null;
        var rest = path.slice();
        if (rest[0] && rest[0].type === 'start') {
            rest = rest.slice(1);
        }
        return [
            { type: 'start', objectType: 'node', objectName: nodeName, object: nodeObj, port: null },
            {
                type: 'nodeConnection',
                cableId: cableId,
                fiberNumber: fiberNumber,
                nodeName: crossName,
                cross: crossObj,
                node: nodeObj,
                fromNode: true
            },
            { type: 'object', objectType: 'cross', objectName: crossName, object: crossObj, port: port }
        ].concat(rest);
    }

    function renderPathsOverviewHtml(paths) {
        if (!paths || paths.length < 2) return '';
        var complete = 0;
        var html = '<div class="trace-paths-overview">';
        html += '<span class="trace-paths-overview-title">Веток: ' + paths.length + '</span>';
        paths.forEach(function (path, i) {
            var st = analyzePathStatus(path);
            if (st.status === 'complete') complete++;
            var dist = estimatePathDistanceM(path);
            var icon = st.status === 'complete' ? '✓' : '⚠';
            var endpointLabel = getPathEndpointLabel(path);
            html += '<button type="button" class="trace-branch-chip" data-branch-index="' + i + '" title="' +
                esc(st.label) + '">';
            html += icon + ' ' + esc(endpointLabel);
            if (dist != null) html += ' · ~' + dist + ' м';
            html += '</button>';
        });
        html += '<span class="trace-paths-overview-hint">До конца: ' + complete + ' из ' + paths.length + '</span>';
        html += '</div>';
        return html;
    }

    function esc(text) {
        return typeof global.escapeHtml === 'function' ? global.escapeHtml(text) : String(text == null ? '' : text);
    }

    function mapPinBtn(objId) {
        if (!objId) return '';
        return '<button type="button" class="trace-map-pin trace-show-on-map-btn" data-object-id="' + esc(objId) + '" title="На карте" aria-label="На карте"></button>';
    }

    function getFiberMeta(cable, cableType, fiberNumber) {
        var colors = [];
        if (typeof global.getFiberColors === 'function') {
            colors = cable ? global.getFiberColors(cable) : (cableType ? global.getFiberColors(cableType) : []);
        }
        var fiber = colors.find(function (f) { return f.number === fiberNumber; });
        var color = fiber ? fiber.color : '#3b82f6';
        var light = color === '#FFFFFF' || color === '#FFFACD' || color === '#FFFF00';
        return {
            color: color,
            name: fiber ? fiber.name : '',
            textColor: light ? '#000' : '#fff'
        };
    }

    function renderFiberChip(fiberNumber, meta, compact) {
        var label = 'Ж' + fiberNumber + (meta.name && !compact ? ' ' + meta.name : '');
        return '<span class="trace-fiber-chip" style="--fiber-color:' + meta.color + ';--fiber-text:' + meta.textColor + '">' + esc(label) + '</span>';
    }

    function renderCompactObjectItem(item, mod) {
        var objId = item.object ? getUid(item.object) : null;
        var port = (item.objectType === 'cross' && item.port) ? '<span class="trace-item-tag">п.' + esc(String(item.port)) + '</span>' : '';
        var wp = (mod === 'waypoint') ? ' trace-item--waypoint' : '';
        var start = (item.type === 'start') ? ' trace-item--start' : '';
        var reserveHtml = '';
        if (item.reserveM != null && item.reserveM > 0) {
            reserveHtml = '<span class="trace-item-reserve" title="Запас кабеля в узле">+' + item.reserveM + ' м</span>';
        }
        return '<div class="trace-item trace-item--object' + start + wp + '">' +
            '<span class="trace-item-glyph" aria-hidden="true">' + getObjectIcon(item.objectType) + '</span>' +
            '<div class="trace-item-main">' +
            '<span class="trace-item-title">' + esc(item.objectName || getTypeName(item.objectType)) + '</span>' +
            port + reserveHtml +
            '<span class="trace-item-kind">' + esc(getTypeName(item.objectType)) + '</span>' +
            '</div>' + mapPinBtn(objId) + '</div>';
    }

    function renderCompactPathHtml(path, startStepNumber) {
        startStepNumber = startStepNumber || 1;
        var enriched = enrichPathWithLengths(path);
        var html = '';
        if (renderPathStatusHtml) html += renderPathStatusHtml(path);
        html += '<div class="trace-timeline">';
        var displayPath = compressPathForDisplay(enriched);
        displayPath.forEach(function (item) {
            if (item.type === 'start' || item.type === 'object') {
                var mod = isWaypointType(item.objectType) ? 'waypoint' : '';
                html += renderCompactObjectItem(item, mod);
            } else if (item.type === 'cable') {
                var cable = item.cable || null;
                var cableType = cable ? cable.properties.get('cableType') : null;
                var meta = getFiberMeta(cable, cableType, item.fiberNumber);
                var wp = (item.waypoints && item.waypoints.length) ? renderWaypointsInlineHtml(item.waypoints) : '';
                var lenHtml = (item.segmentLengthM != null)
                    ? '<span class="trace-item-len">~' + item.segmentLengthM + ' м</span>'
                    : '';
                html += '<div class="trace-item trace-item--cable" style="--fiber-color:' + meta.color + '">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">↳</span>' +
                    '<div class="trace-item-main">' +
                    '<span class="trace-item-cable-name">' + esc(item.cableName || 'Кабель') + '</span>' +
                    renderFiberChip(item.fiberNumber, meta, true) + lenHtml + wp +
                    '</div>' + mapPinBtn(cable ? getUid(cable) : null) + '</div>';
            } else if (item.type === 'connection') {
                var fromCable = item.fromCable || null;
                var toCable = item.toCable || null;
                var fromMeta = getFiberMeta(fromCable, item.fromCableType, item.fromFiberNumber);
                var toMeta = getFiberMeta(toCable, item.toCableType, item.toFiberNumber);
                html += '<div class="trace-item trace-item--splice trace-item--no-pin">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">⚡</span>' +
                    '<div class="trace-item-main trace-item-main--inline">' +
                    renderFiberChip(item.fromFiberNumber, fromMeta, true) +
                    (item.fromLabel ? '<span class="trace-item-note">' + esc(item.fromLabel) + '</span>' : '') +
                    '<span class="trace-item-arrow">→</span>' +
                    renderFiberChip(item.toFiberNumber, toMeta, true) +
                    (item.toLabel ? '<span class="trace-item-note">' + esc(item.toLabel) + '</span>' : '') +
                    '</div></div>';
            } else if (item.type === 'nodeConnection') {
                var nodeConnText = item.fromNode
                    ? ('→ Кросс «' + esc(item.nodeName || 'Кросс') + '» · ж' + item.fiberNumber)
                    : ('На узел «' + esc(item.nodeName || 'Узел') + '» · ж' + item.fiberNumber);
                var nodeConnPin = item.fromNode
                    ? (item.cross ? getUid(item.cross) : null)
                    : (item.node ? getUid(item.node) : null);
                html += '<div class="trace-item trace-item--meta trace-item--link">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔌</span>' +
                    '<div class="trace-item-main"><span>' + nodeConnText + '</span></div>' +
                    mapPinBtn(nodeConnPin) + '</div>';
            } else if (item.type === 'onuConnection') {
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">📟</span>' +
                    '<div class="trace-item-main"><span>ONU «' + esc(item.onuName || 'ONU') + '» · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.onu ? getUid(item.onu) : null) + '</div>';
            } else if (item.type === 'mediaConverterConnection') {
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">⇄</span>' +
                    '<div class="trace-item-main"><span>МК «' + esc(item.mediaConverterName || 'МК') + '» · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.mediaConverter ? getUid(item.mediaConverter) : null) + '</div>';
            } else if (item.type === 'splitterConnection') {
                var spName = item.splitter && item.splitter.properties ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>На «' + esc(spName) + '» · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.splitter ? getUid(item.splitter) : null) + '</div>';
            } else if (item.type === 'splitterOutputToOnu') {
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>Выход → ONU «' + esc(item.onuName || 'ONU') + '»</span></div>' +
                    mapPinBtn(item.onuObj ? getUid(item.onuObj) : null) + '</div>';
            } else if (item.type === 'splitterOutputToNode') {
                var spNodePortLbl = item.switchPort != null ? ' · SFP ' + item.switchPort : '';
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>Выход → Узел «' + esc(item.nodeName || 'Узел') + '»' + esc(spNodePortLbl) + '</span></div>' +
                    mapPinBtn(item.nodeObj ? getUid(item.nodeObj) : null) + '</div>';
            } else if (item.type === 'splitterOutputToMediaConverter') {
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>Выход → МК «' + esc(item.mediaConverterName || 'Медиаконвертер') + '»</span></div>' +
                    mapPinBtn(item.mediaConverterObj ? getUid(item.mediaConverterObj) : null) + '</div>';
            } else if (item.type === 'splitterOutputToSplitter') {
                var toSp = item.toSplitter && item.toSplitter.properties ? (item.toSplitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>Выход → «' + esc(toSp) + '»</span></div>' +
                    mapPinBtn(item.toSplitter ? getUid(item.toSplitter) : null) + '</div>';
            } else if (item.type === 'splitterOutputToHost') {
                var hostN = item.host && item.host.properties ? (item.host.properties.get('name') || 'Муфта/кросс') : 'Муфта/кросс';
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>Выход → «' + esc(hostN) + '» · ж' + esc(String(item.fiberNumber != null ? item.fiberNumber : '?')) + '</span></div>' +
                    mapPinBtn(item.host ? getUid(item.host) : null) + '</div>';
            } else if (item.type === 'oltPortConnection') {
                var oltPort = item.incoming ? 'приход' : (typeof formatOltPortDisplay === 'function'
                    ? formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt && typeof getOltPortLabel === 'function' ? getOltPortLabel(item.olt, item.portNumber) : ''), true)
                    : ('п.' + item.portNumber));
                html += '<div class="trace-item trace-item--meta trace-item--olt">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">📶</span>' +
                    '<div class="trace-item-main"><span>OLT «' + esc(item.oltName || 'OLT') + '» · ' + esc(String(oltPort)) + ' · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.olt ? getUid(item.olt) : null) + '</div>';
            } else if (item.type === 'crossPortPatch') {
                html += '<div class="trace-item trace-item--meta trace-item--link">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">⇄</span>' +
                    '<div class="trace-item-main"><span>Кроссировка: «' + esc(item.fromCrossName || 'Кросс') + '» п.' + item.fromPort +
                    ' → «' + esc(item.toCrossName || 'Кросс') + '» п.' + item.toPort + '</span></div>' +
                    mapPinBtn(item.toCross ? getUid(item.toCross) : null) + '</div>';
            }
        });
        html += '</div>';
        return { html: html, nextStepNumber: startStepNumber };
    }

    function formatTraceBackLabel(returnLabel, returnType) {
        if (!returnLabel) return '← К карточке';
        var short = String(returnLabel);
        if (short.length > 28) short = short.slice(0, 26) + '…';
        var kind = returnType ? getTypeName(returnType).toLowerCase() : 'объекту';
        return '← К ' + kind + ' «' + short + '»';
    }

    function buildTraceToolbarHtml(returnLabel, returnType) {
        return '<div class="trace-toolbar">' +
            '<button type="button" class="trace-back-btn">' + esc(formatTraceBackLabel(returnLabel, returnType)) + '</button>' +
            '</div>';
    }

    function buildTraceViewHtml(bodyHtml, returnLabel, returnType) {
        var actionsHtml = '';
        var timelineHtml = bodyHtml;
        var actionsMatch = bodyHtml.match(/<div class="trace-result-actions">[\s\S]*<\/div>\s*$/);
        if (actionsMatch) {
            actionsHtml = actionsMatch[0];
            timelineHtml = bodyHtml.slice(0, bodyHtml.length - actionsMatch[0].length);
        }
        return '<div class="trace-view">' +
            buildTraceToolbarHtml(returnLabel, returnType) +
            '<div class="trace-view-scroll">' +
            '<div class="trace-view-body">' + timelineHtml + '</div>' +
            '</div>' +
            (actionsHtml ? '<div class="trace-view-footer">' + actionsHtml + '</div>' : '') +
            '</div>';
    }

    function buildTraceActionsHtml() {
        return '<div class="trace-result-actions">' +
            '<button type="button" class="btn-primary btn-sm trace-highlight-btn" title="Подсветить маршрут на карте">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>' +
            '</svg><span>На карте</span></button>' +
            '<button type="button" class="btn-secondary btn-sm trace-copy-btn" title="Скопировать текст маршрута">Копировать</button></div>';
    }

    function copyTraceToClipboard(paths) {
        var text = pathsToPlainText(paths);
        if (!text) return Promise.reject(new Error('empty'));
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            try {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    function applyTraceSchematicZoom(root, zoom) {
        var svg = root.querySelector('.trace-schematic-svg');
        var slider = root.querySelector('.trace-sch-zoom-slider');
        var label = root.querySelector('.trace-sch-zoom-label');
        if (!svg) return 1;
        var baseW = parseFloat(svg.getAttribute('data-base-w')) || parseFloat(svg.getAttribute('width')) || 800;
        var baseH = parseFloat(svg.getAttribute('data-base-h')) || parseFloat(svg.getAttribute('height')) || 300;
        zoom = Math.max(0.4, Math.min(2.5, Math.round(zoom * 20) / 20));
        svg.setAttribute('width', String(Math.round(baseW * zoom)));
        svg.setAttribute('height', String(Math.round(baseH * zoom)));
        svg.style.width = Math.round(baseW * zoom) + 'px';
        svg.style.height = Math.round(baseH * zoom) + 'px';
        root.dataset.traceSchZoom = String(zoom);
        if (slider) slider.value = String(Math.round(zoom * 100));
        if (label) label.textContent = Math.round(zoom * 100) + '%';
        return zoom;
    }

    function fitTraceSchematicZoom(root) {
        var svg = root.querySelector('.trace-schematic-svg');
        var scroll = root.querySelector('.trace-schematic-scroll');
        if (!svg || !scroll) return 1;
        var baseW = parseFloat(svg.getAttribute('data-base-w')) || 800;
        var baseH = parseFloat(svg.getAttribute('data-base-h')) || 300;
        var availW = Math.max(120, scroll.clientWidth - 16);
        var availH = Math.max(100, scroll.clientHeight - 12);
        var z = Math.min(availW / baseW, availH / baseH, 1.5);
        return applyTraceSchematicZoom(root, Math.max(0.4, z));
    }

    function buildTraceSchematicPdfFilename() {
        var d = new Date();
        var pad = function (n) { return n < 10 ? '0' + n : String(n); };
        return 'trassa-zhil-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
            '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.pdf';
    }

    async function exportTraceSchematicToPdf(root) {
        if (!root) return false;
        if (!global.jspdf || !global.jspdf.jsPDF) {
            if (typeof global.showError === 'function') {
                global.showError('PDF-библиотеки не загружены. Обновите страницу и попробуйте снова.', 'Экспорт');
            }
            return false;
        }
        if (typeof global.html2canvas !== 'function') {
            if (typeof global.showError === 'function') {
                global.showError('html2canvas не загружен. Обновите страницу и попробуйте снова.', 'Экспорт');
            }
            return false;
        }

        var exportBtn = document.querySelector('#traceModalPdfBar .trace-sch-export-pdf') ||
            root.querySelector('.trace-sch-export-pdf');
        var exportBtnHtml = exportBtn ? exportBtn.innerHTML : '';
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Формирование…';
        }

        var scroll = root.querySelector('.trace-schematic-scroll');
        var exportRoot = root.querySelector('.trace-sch-export-root') || root;
        var prevZoom = parseFloat(root.dataset.traceSchZoom || '1') || 1;
        var prevOverflow = scroll ? scroll.style.overflow : '';
        var prevMaxH = scroll ? scroll.style.maxHeight : '';
        var prevMinH = scroll ? scroll.style.minHeight : '';

        try {
            // Для PDF — натуральный масштаб и полный кадр без обрезки скроллом
            applyTraceSchematicZoom(root, 1);
            if (scroll) {
                scroll.style.overflow = 'visible';
                scroll.style.maxHeight = 'none';
                scroll.style.minHeight = '0';
            }

            await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });

            var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            var bg = isDark ? '#0f172a' : '#ffffff';
            var canvas = await global.html2canvas(exportRoot, {
                backgroundColor: bg,
                scale: Math.min(2.5, Math.max(1.5, global.devicePixelRatio || 2)),
                logging: false,
                useCORS: true,
                allowTaint: true,
                width: exportRoot.scrollWidth,
                height: exportRoot.scrollHeight,
                windowWidth: exportRoot.scrollWidth,
                windowHeight: exportRoot.scrollHeight
            });

            var imgData = canvas.toDataURL('image/png');
            if (!imgData) throw new Error('canvas-empty');

            var orientation = canvas.width >= canvas.height ? 'l' : 'p';
            var doc = new global.jspdf.jsPDF({ orientation: orientation, unit: 'pt', format: 'a4' });
            if (typeof global.ensurePdfUnicodeFont === 'function') {
                await global.ensurePdfUnicodeFont(doc);
            }

            var pageW = doc.internal.pageSize.getWidth();
            var pageH = doc.internal.pageSize.getHeight();
            var margin = 18;
            var headerH = 22;
            var title = 'Схема трассы жил';
            var metricsEl = root.querySelector('.trace-schematic-metrics');
            var metricsTxt = metricsEl ? metricsEl.textContent.replace(/\s+/g, ' ').trim() : '';
            var dateTxt = new Date().toLocaleString();

            doc.setFontSize(11);
            doc.text(title, margin, margin + 4);
            doc.setFontSize(8);
            var sub = [metricsTxt, dateTxt].filter(Boolean).join(' · ');
            if (sub) doc.text(sub, margin, margin + 16);

            var availW = pageW - margin * 2;
            var availH = pageH - margin * 2 - headerH;
            var imgW = availW;
            var imgH = canvas.height * (imgW / canvas.width);
            if (imgH <= availH) {
                var imgX = margin + (availW - imgW) / 2;
                var imgY = margin + headerH + (availH - imgH) / 2;
                doc.addImage(imgData, 'PNG', imgX, imgY, imgW, imgH);
            } else {
                // Многостраничный экспорт по вертикали
                var sliceH = canvas.width * (availH / availW);
                var yPx = 0;
                var pageIndex = 0;
                while (yPx < canvas.height - 1) {
                    if (pageIndex > 0) {
                        doc.addPage();
                        doc.setFontSize(9);
                        doc.text(title + ' (стр. ' + (pageIndex + 1) + ')', margin, margin + 4);
                    }
                    var hPx = Math.min(sliceH, canvas.height - yPx);
                    var sliceCanvas = document.createElement('canvas');
                    sliceCanvas.width = canvas.width;
                    sliceCanvas.height = Math.max(1, Math.round(hPx));
                    var sctx = sliceCanvas.getContext('2d');
                    sctx.fillStyle = bg;
                    sctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
                    sctx.drawImage(canvas, 0, yPx, canvas.width, hPx, 0, 0, canvas.width, hPx);
                    var sliceData = sliceCanvas.toDataURL('image/png');
                    var drawH = availW * (hPx / canvas.width);
                    var topY = pageIndex === 0 ? margin + headerH : margin + 14;
                    doc.addImage(sliceData, 'PNG', margin, topY, availW, drawH);
                    yPx += hPx;
                    pageIndex++;
                }
            }

            doc.save(buildTraceSchematicPdfFilename());
            if (typeof global.showSuccess === 'function') {
                global.showSuccess('PDF со схемой трассы сформирован', 'Экспорт');
            }
            if (typeof global.logAction === 'function' && global.ActionTypes && global.ActionTypes.EXPORT_DATA) {
                global.logAction(global.ActionTypes.EXPORT_DATA, { format: 'trace-schematic-pdf' });
            }
            return true;
        } catch (eExport) {
            console.error('Trace schematic PDF export failed:', eExport);
            if (typeof global.showError === 'function') {
                global.showError('Не удалось сформировать PDF схемы трассы.', 'Экспорт');
            }
            return false;
        } finally {
            if (scroll) {
                scroll.style.overflow = prevOverflow;
                scroll.style.maxHeight = prevMaxH;
                scroll.style.minHeight = prevMinH;
            }
            applyTraceSchematicZoom(root, prevZoom);
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = exportBtnHtml || '⤓ Скачать PDF';
            }
        }
    }

    function attachTraceSchematicControls(container) {
        if (!container) return;
        container.querySelectorAll('.trace-schematic').forEach(function (root) {
            if (root.dataset.schControlsBound) return;
            root.dataset.schControlsBound = '1';

            var zoom = 1;
            var scroll = root.querySelector('.trace-schematic-scroll');
            var slider = root.querySelector('.trace-sch-zoom-slider');

            function setZoom(z) {
                zoom = applyTraceSchematicZoom(root, z);
            }

            requestAnimationFrame(function () {
                zoom = fitTraceSchematicZoom(root);
            });

            root.querySelectorAll('[data-trace-sch-zoom]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var act = btn.getAttribute('data-trace-sch-zoom');
                    if (act === 'in') setZoom(zoom + 0.1);
                    else if (act === 'out') setZoom(zoom - 0.1);
                    else if (act === 'reset') setZoom(1);
                    else if (act === 'fit') zoom = fitTraceSchematicZoom(root);
                });
            });
            if (slider) {
                slider.addEventListener('input', function () {
                    setZoom(parseInt(slider.value, 10) / 100);
                });
            }
            if (scroll) {
                scroll.addEventListener('wheel', function (e) {
                    if (!(e.ctrlKey || e.metaKey)) return;
                    e.preventDefault();
                    setZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
                }, { passive: false });
            }

            var pdfBtn = root.querySelector('.trace-sch-export-pdf');
            if (pdfBtn) {
                pdfBtn.addEventListener('click', function () {
                    exportTraceSchematicToPdf(root);
                });
            }
        });
    }

    function removeTraceModalPdfBar() {
        var bar = document.getElementById('traceModalPdfBar');
        if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }

    function ensureTraceModalPdfBar(modal, schematicContainer) {
        if (!modal) return null;
        var content = modal.querySelector(':scope > .modal-content') || modal.querySelector('.modal-content');
        var body = content && content.querySelector(':scope > .modal-body');
        if (!content || !body) return null;

        var bar = document.getElementById('traceModalPdfBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'traceModalPdfBar';
            bar.className = 'trace-modal-pdf-bar';
            bar.innerHTML =
                '<div class="trace-modal-pdf-bar__text">' +
                '<strong>Схема жил</strong>' +
                '<span>Экспорт трассы в PDF</span>' +
                '</div>' +
                '<button type="button" class="trace-sch-export-pdf trace-modal-pdf-btn" title="Скачать схему трассы в PDF">' +
                '⤓ Скачать PDF</button>';
            content.insertBefore(bar, body);
        }

        var btn = bar.querySelector('.trace-sch-export-pdf');
        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1';
            btn.addEventListener('click', function () {
                var root = (schematicContainer || modal).querySelector('.trace-schematic');
                if (!root) {
                    if (typeof global.showWarning === 'function') {
                        global.showWarning('Схема жил не найдена на странице трассы', 'Экспорт');
                    }
                    return;
                }
                exportTraceSchematicToPdf(root);
            });
        }
        return bar;
    }

    function attachTraceModalHandlers(container) {
        if (!container) return;
        if (typeof global.attachTraceShowOnMapHandlers === 'function') {
            global.attachTraceShowOnMapHandlers(container);
        }
        attachTraceSchematicControls(container);
        var modal = document.getElementById('infoModal');
        if (modal && modal.getAttribute('data-trace-view') === '1') {
            ensureTraceModalPdfBar(modal, container);
        }
        var backBtn = container.querySelector('.trace-back-btn');
        if (backBtn && !backBtn.dataset.bound) {
            backBtn.dataset.bound = '1';
            backBtn.addEventListener('click', function () {
                if (typeof global.returnFromTraceToObjectCard === 'function') {
                    global.returnFromTraceToObjectCard();
                }
            });
        }
        var highlightBtn = container.querySelector('.trace-highlight-btn');
        if (highlightBtn && !highlightBtn.dataset.bound) {
            highlightBtn.dataset.bound = '1';
            highlightBtn.addEventListener('click', function () {
                if (typeof global.highlightTracePath === 'function') global.highlightTracePath();
            });
        }
        var copyBtn = container.querySelector('.trace-copy-btn');
        if (copyBtn && !copyBtn.dataset.bound) {
            copyBtn.dataset.bound = '1';
            copyBtn.addEventListener('click', function () {
                var paths = global.currentTracePaths;
                if (!paths || !paths.length) {
                    var single = global.currentTracePath;
                    paths = (single && single.length) ? [single] : [];
                }
                copyTraceToClipboard(paths).then(function () {
                    if (typeof global.showInfo === 'function') global.showInfo('Маршрут скопирован в буфер обмена', 'Трассировка');
                }).catch(function () {
                    if (typeof global.showWarning === 'function') global.showWarning('Не удалось скопировать маршрут', 'Трассировка');
                });
            });
        }
        var branchChips = container.querySelectorAll('.trace-branch-chip');
        if (branchChips.length && !container.querySelector('.trace-branch-chip--active')) {
            branchChips[0].classList.add('trace-branch-chip--active');
        }
        branchChips.forEach(function (chip) {
            if (chip.dataset.bound) return;
            chip.dataset.bound = '1';
            chip.addEventListener('click', function () {
                var idx = parseInt(chip.getAttribute('data-branch-index'), 10);
                var paths = global.currentTracePaths;
                if (!paths || !paths[idx]) return;
                global.currentTracePath = paths[idx];
                container.querySelectorAll('.trace-branch-chip').forEach(function (c) {
                    c.classList.toggle('trace-branch-chip--active', c === chip);
                });
                var branchEl = container.querySelector('.trace-branch-block[data-branch-index="' + idx + '"]') ||
                    container.querySelector('.trace-branch-separator[data-branch-index="' + idx + '"]');
                if (branchEl && branchEl.scrollIntoView) {
                    branchEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
                if (typeof global.highlightTracePath === 'function') global.highlightTracePath();
            });
        });
    }

    global.FiberTrace = {
        WAYPOINT_TYPES: WAYPOINT_TYPES,
        isWaypointType: isWaypointType,
        getObjectIcon: getObjectIcon,
        compressPathForDisplay: compressPathForDisplay,
        analyzePathStatus: analyzePathStatus,
        getPathEndpointLabel: getPathEndpointLabel,
        estimatePathDistanceM: estimatePathDistanceM,
        estimateSegmentDistanceM: estimateSegmentDistanceM,
        enrichPathWithLengths: enrichPathWithLengths,
        summarizePathMetrics: summarizePathMetrics,
        buildFreeFibersHtml: buildFreeFibersHtml,
        getFreeFibersForCable: getFreeFibersForCable,
        collectCablesFromPaths: collectCablesFromPaths,
        getObjectReserveM: getObjectReserveM,
        buildTraceSchematicHtml: buildTraceSchematicHtml,
        buildTraceSchematicsHtml: buildTraceSchematicsHtml,
        buildTraceSchematicModel: buildTraceSchematicModel,
        buildHighlightGeometries: buildHighlightGeometries,
        getCableSegmentCoords: getCableSegmentCoords,
        renderPathStatusHtml: renderPathStatusHtml,
        renderWaypointsInlineHtml: renderWaypointsInlineHtml,
        buildTraceActionsHtml: buildTraceActionsHtml,
        buildTraceToolbarHtml: buildTraceToolbarHtml,
        buildTraceViewHtml: buildTraceViewHtml,
        renderCompactPathHtml: renderCompactPathHtml,
        attachTraceModalHandlers: attachTraceModalHandlers,
        exportTraceSchematicToPdf: exportTraceSchematicToPdf,
        removeTraceModalPdfBar: removeTraceModalPdfBar,
        pathToPlainText: pathToPlainText,
        pathsToPlainText: pathsToPlainText,
        pathSignature: pathSignature,
        dedupePaths: dedupePaths,
        prependNodePrefixToPath: prependNodePrefixToPath,
        renderPathsOverviewHtml: renderPathsOverviewHtml,
        copyTraceToClipboard: copyTraceToClipboard
    };
})(typeof window !== 'undefined' ? window : this);
