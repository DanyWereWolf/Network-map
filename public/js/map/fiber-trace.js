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
            case 'radioBridge': return '◎';
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
        if (item.type === 'nodeConnection') {
            // fromNode: узел → кросс; иначе вывод с хоста на узел
            return item.fromNode ? (item.cross || null) : (item.node || null);
        }
        if (item.node) return item.node;
        if (item.onu) return item.onu;
        if (item.mediaConverter) return item.mediaConverter;
        if (item.radioBridge) return item.radioBridge;
        if (item.olt) return item.olt;
        if (item.onuObj) return item.onuObj;
        if (item.nodeObj) return item.nodeObj;
        if (item.mediaConverterObj) return item.mediaConverterObj;
        if (item.host) return item.host;
        if (item.splitter) return item.splitter;
        if (item.toSplitter) return item.toSplitter;
        return null;
    }

    /** Конечная точка текущего кабельного hop — не перескакивать через следующий кабель. */
    function findNextPathEndpoint(path, fromIndex) {
        if (!path) return null;
        for (var k = fromIndex + 1; k < path.length; k++) {
            var it = path[k];
            if (!it) continue;
            if (it.type === 'cable') break;
            if (it.type === 'object' || it.type === 'start') {
                return it.object || null;
            }
            if (it.type === 'onuConnection' ||
                it.type === 'mediaConverterConnection' ||
                it.type === 'radioBridgeConnection' ||
                it.type === 'nodeConnection' ||
                it.type === 'splitterOutputToOnu' ||
                it.type === 'splitterOutputToHost' ||
                it.type === 'splitterOutputToNode' ||
                it.type === 'splitterOutputToMediaConverter' ||
                it.type === 'splitterConnection' ||
                it.type === 'oltPortConnection') {
                var ep = pathObjectFromItem(it);
                if (ep) return ep;
            }
        }
        return null;
    }

    function resolvePathCableObject(item) {
        if (!item) return null;
        if (item.cable) return item.cable;
        if (item.cableId) return findSchematicCableById(item.cableId);
        return null;
    }

    function estimateFullCableDistanceM(cable) {
        if (!cable) return null;
        var declared = getCableDeclaredLengthM(cable);
        if (declared != null) return Math.round(declared);
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
        return fullGeom > 0 ? Math.round(fullGeom) : null;
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
            if (item.type === 'mediaConverterConnection') {
                return {
                    status: 'complete',
                    endpoint: 'mediaConverter',
                    label: 'Вывод на медиаконвертер «' + (item.mediaConverterName || 'Медиаконвертер') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'object' && item.objectType === 'radioBridge') {
                return {
                    status: 'complete',
                    endpoint: 'radioBridge',
                    label: 'Доходит до радиомоста «' + (item.objectName || 'Радиомост') + '»',
                    cssClass: 'trace-path-status--complete'
                };
            }
            if (item.type === 'radioBridgeConnection') {
                return {
                    status: 'complete',
                    endpoint: 'radioBridge',
                    label: 'Вывод на радиомост «' + (item.radioBridgeName || 'Радиомост') + '»',
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
            if (item.type === 'mediaConverterConnection') {
                return item.mediaConverterName || 'Медиаконвертер';
            }
            if (item.type === 'object' && item.objectType === 'radioBridge') {
                return item.objectName || 'Радиомост';
            }
            if (item.type === 'radioBridgeConnection') {
                return item.radioBridgeName || 'Радиомост';
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
            // Длину всегда пересчитываем заново — не тащим устаревший segmentLengthM
            if (copy.segmentLengthM != null) delete copy.segmentLengthM;

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
            } else if (item.type === 'cable') {
                var cableObj = resolvePathCableObject(item);
                if (cableObj) copy.cable = cableObj;
                var nextObj = findNextPathEndpoint(path, i);
                var segLen = null;
                if (cableObj && lastObj && nextObj && getUid(lastObj) !== getUid(nextObj)) {
                    segLen = estimateSegmentDistanceM(cableObj, lastObj, nextObj);
                }
                if (segLen == null && cableObj) {
                    segLen = estimateFullCableDistanceM(cableObj);
                }
                if (segLen != null) copy.segmentLengthM = segLen;
                if (nextObj) lastObj = nextObj;
            } else if (item.type === 'onuConnection' && item.onu) {
                var hostForDrop = item.cross || lastObj;
                var dropDist = item.distanceM != null ? Number(item.distanceM) : null;
                if ((dropDist == null || !isFinite(dropDist) || dropDist <= 0) &&
                    typeof global.measureHostToOnuDropDistanceM === 'function' && hostForDrop) {
                    dropDist = global.measureHostToOnuDropDistanceM(hostForDrop, item.onu, item.routeIds || []);
                }
                if ((dropDist == null || !isFinite(dropDist) || dropDist <= 0) && hostForDrop) {
                    var c1 = getTraceObjectCoords(hostForDrop);
                    var c2 = getTraceObjectCoords(item.onu);
                    if (c1 && c2 && typeof global.calculateDistance === 'function') {
                        try {
                            dropDist = global.calculateDistance(c1, c2);
                        } catch (eDrop) { dropDist = null; }
                    }
                }
                if (dropDist != null && isFinite(dropDist) && dropDist > 0) {
                    copy.segmentLengthM = Math.round(dropDist);
                    copy.distanceM = copy.segmentLengthM;
                }
                lastObj = item.onu;
            } else if (item.type === 'mediaConverterConnection' && item.mediaConverter) {
                lastObj = item.mediaConverter;
            } else if (item.type === 'radioBridgeConnection' && item.radioBridge) {
                lastObj = item.radioBridge;
            } else if (item.type === 'nodeConnection') {
                var nodeEp = pathObjectFromItem(item);
                if (nodeEp) lastObj = nodeEp;
            } else if (item.type === 'splitterConnection' && item.splitter) {
                lastObj = item.splitter;
            } else if (item.type === 'splitterOutputToHost' && item.host) {
                lastObj = item.host;
            } else if (item.type === 'splitterOutputToOnu' && (item.onuObj || item.onu)) {
                lastObj = item.onuObj || item.onu;
            } else if (item.type === 'splitterOutputToNode' && item.nodeObj) {
                lastObj = item.nodeObj;
            } else if (item.type === 'splitterOutputToMediaConverter' && item.mediaConverterObj) {
                lastObj = item.mediaConverterObj;
            } else if (item.type === 'oltPortConnection' && item.olt) {
                lastObj = item.olt;
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
            if (item.type === 'onuConnection' && item.segmentLengthM != null) {
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
            var fnFate = Number(fiberNumber);
            for (var ci = 0; ci < conns.length; ci++) {
                var c = conns[ci];
                if (!c || !c.from || !c.to) continue;
                if (String(c.from.cableId) === String(cableId) && Number(c.from.fiberNumber) === fnFate) {
                    splicePeer = { cableId: c.to.cableId, fiberNumber: Number(c.to.fiberNumber) };
                    break;
                }
                if (String(c.to.cableId) === String(cableId) && Number(c.to.fiberNumber) === fnFate) {
                    splicePeer = { cableId: c.from.cableId, fiberNumber: Number(c.from.fiberNumber) };
                    break;
                }
            }
        }
        if (splicePeer) {
            if (nextCableId && String(splicePeer.cableId) === String(nextCableId)) {
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
            // Embedded-сплиттер оставляем отдельным узлом схемы (не схлопываем в кросс/муфту).
            var keepEmbeddedSplitter = !!(obj._embedded && (item.objectType === 'splitter' ||
                (obj.properties && obj.properties.get('type') === 'splitter')));
            if (obj._embedded && obj._host && !keepEmbeddedSplitter) obj = obj._host;
            var baseUid = getUid(obj);
            var isOutPort = item.signalRole === 'splitter-out-port' ||
                (pendingNodeLink && pendingNodeLink.splitterOutputIndex != null &&
                    item.port != null && (item.objectType === 'cross' || item.objectType === 'sleeve' ||
                        item.objectType === 'spliceCassette'));
            // Выход сплиттера на порт того же кросса — отдельный узел, иначе сегмент с вых.N схлопнется.
            var uid = (isOutPort && item.port != null)
                ? (baseUid + '#p' + item.port)
                : baseUid;

            if (lastHost && lastHost.id === uid) {
                if (item.port != null) lastHost.port = item.port;
                if (pendingNodeLink && pendingNodeLink.splitterOutputIndex != null &&
                    lastHost.fromSplitterOutput == null) {
                    lastHost.fromSplitterOutput = Number(pendingNodeLink.splitterOutputIndex) + 1;
                }
                // Не оставлять «висячий» pending на повторном том же узле
                if (pendingNodeLink && lastHostIdx === nodes.length - 1) {
                    pendingNodeLink = null;
                }
                return;
            }
            // Уже есть такой узел раньше в цепочке (кросс до сплиттера) — для выхода делаем порт-узел
            if (!isOutPort && pendingNodeLink && pendingNodeLink.splitterOutputIndex != null &&
                item.port != null) {
                for (var ei = 0; ei < nodes.length; ei++) {
                    if (nodes[ei] && getUid(nodes[ei].object) === baseUid) {
                        isOutPort = true;
                        uid = baseUid + '#p' + item.port;
                        break;
                    }
                }
            }

            var node = {
                id: uid,
                name: (isOutPort && item.port != null)
                    ? ((item.objectName || getTypeName(item.objectType)) + ' · п.' + item.port)
                    : (item.objectName || getTypeName(item.objectType)),
                type: keepEmbeddedSplitter ? 'splitter' : item.objectType,
                object: obj,
                reserveM: item.reserveM || getObjectReserveM(obj),
                port: item.port || null,
                embeddedInHost: keepEmbeddedSplitter ? obj._host : null,
                fromSplitterOutput: (pendingNodeLink && pendingNodeLink.splitterOutputIndex != null)
                    ? (Number(pendingNodeLink.splitterOutputIndex) + 1)
                    : null
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
                    fromNode: !!pendingNodeLink.fromNode,
                    splitterOutputIndex: pendingNodeLink.splitterOutputIndex != null
                        ? pendingNodeLink.splitterOutputIndex
                        : null,
                    crossPort: pendingNodeLink.crossPort != null ? pendingNodeLink.crossPort
                        : (item.port != null ? item.port : null)
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
                    tracedFiber: pendingCable.fiberNumber,
                    splitterOutputIndex: pendingCable.splitterOutputIndex != null
                        ? pendingCable.splitterOutputIndex
                        : null
                });
                if (pendingCable.splitterOutputIndex != null && node.fromSplitterOutput == null) {
                    node.fromSplitterOutput = Number(pendingCable.splitterOutputIndex) + 1;
                }
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
                    if (lastHost && lastHost.type === 'splitter' && lastHost.object &&
                        pendingCable.splitterOutputIndex == null) {
                        var cabOutIdx = resolveSplitterOutputIndexForItem(lastHost.object, {
                            cableId: item.cableId,
                            fiberNumber: item.fiberNumber,
                            outputIndex: item.outputIndex
                        });
                        if (cabOutIdx != null) {
                            pendingCable.splitterOutputIndex = cabOutIdx;
                            pendingCable.label = 'вых.' + (cabOutIdx + 1);
                        }
                    }
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
            } else if (item.type === 'oltPortConnection') {
                // Метка PON-порта: не дублировать OLT и не сбрасывать кабель перед сегментом OLT→хост.
                if (lastHost && item.olt && getUid(lastHost.object) === getUid(item.olt)) {
                    if (item.portNumber != null) lastHost.port = item.portNumber;
                } else if (item.olt) {
                    pushHost({
                        type: 'object',
                        objectType: 'olt',
                        objectName: item.oltName || (item.olt.properties && item.olt.properties.get('name')) || 'OLT',
                        object: item.olt,
                        port: item.portNumber != null ? item.portNumber : null,
                        reserveM: 0
                    });
                }
            } else if (item.type === 'onuConnection' ||
                item.type === 'mediaConverterConnection' ||
                item.type === 'radioBridgeConnection' ||
                item.type === 'splitterConnection' || item.type === 'splitterOutputToOnu' ||
                item.type === 'splitterOutputToNode' || item.type === 'splitterOutputToHost' ||
                item.type === 'splitterOutputToSplitter' || item.type === 'splitterOutputToMediaConverter' ||
                item.type === 'splitterOutputToCrossPort') {
                var endObj = item.node || item.onu || item.mediaConverter || item.radioBridge ||
                    item.splitter || item.onuObj || item.nodeObj || item.host || item.toSplitter ||
                    item.toCross || item.cross;
                var endType = item.node ? 'node' : (item.onu || item.onuObj ? 'onu' :
                    (item.mediaConverter || item.mediaConverterObj ? 'mediaConverter' :
                        (item.radioBridge ? 'radioBridge' :
                            (item.splitter || item.toSplitter ? 'splitter' :
                                ((item.toCross || item.cross) ? 'cross' : 'object')))));
                var endName = item.nodeName || item.onuName || item.mediaConverterName || item.crossName ||
                    (endObj && endObj.properties ? endObj.properties.get('name') : null) || getTypeName(endType);
                if (lastHostIdx >= 0 && !pendingCable && !pendingNodeLink) {
                    var linkLabel = null;
                    var linkName = null;
                    var outIdx = null;
                    var splitterSrc = null;
                    if (lastHost && lastHost.type === 'splitter' && lastHost.object) {
                        splitterSrc = lastHost.object;
                        outIdx = resolveSplitterOutputIndexForItem(splitterSrc, item);
                    } else if (item.splitter) {
                        splitterSrc = item.splitter;
                        outIdx = resolveSplitterOutputIndexForItem(splitterSrc, item);
                    }
                    if (item.outputIndex != null) outIdx = item.outputIndex;

                    if (item.type === 'splitterConnection') {
                        linkName = 'Вход сплиттера';
                        linkLabel = item.fiberNumber != null ? ('вход · ж' + item.fiberNumber) : 'вход сплиттера';
                    } else if (outIdx != null) {
                        linkName = 'Выход ' + (outIdx + 1);
                        linkLabel = 'вых.' + (outIdx + 1);
                        if (item.crossPort != null) linkLabel += ' → п.' + item.crossPort;
                    } else if (item.type === 'splitterOutputToOnu' || item.type === 'onuConnection') {
                        linkName = 'Выход → ONU';
                        linkLabel = 'на ONU';
                    } else if (item.type === 'splitterOutputToNode' || item.type === 'nodeConnection') {
                        linkName = 'Выход → узел';
                        linkLabel = 'на узел';
                    } else if (item.type === 'splitterOutputToMediaConverter' || item.type === 'mediaConverterConnection') {
                        linkName = 'Выход → МК';
                        linkLabel = 'на МК';
                    } else if (item.type === 'splitterOutputToSplitter') {
                        linkName = 'Каскад сплиттеров';
                        linkLabel = '→ сплиттер';
                    } else if (item.type === 'splitterOutputToCrossPort') {
                        linkName = 'Выход → порт';
                        linkLabel = item.crossPort != null ? ('порт ' + item.crossPort) : 'на порт';
                    } else if (item.type === 'radioBridgeConnection') {
                        linkName = '→ Радиомост';
                        linkLabel = 'на РМ';
                    } else if (item.type === 'splitterOutputToHost') {
                        linkName = 'Выход сплиттера';
                        linkLabel = 'выход';
                    }
                    if (linkLabel) {
                        pendingNodeLink = {
                            fromNode: false,
                            cableId: item.cableId || null,
                            fiberNumber: item.fiberNumber != null ? item.fiberNumber : 1,
                            cable: null,
                            cableName: linkName,
                            label: linkLabel,
                            splitterOutputIndex: outIdx,
                            crossPort: item.crossPort != null ? item.crossPort : null
                        };
                    }
                }
                if (endObj) {
                    // Для выхода на порт кросса узел добавит следующий object со signalRole
                    if (item.type !== 'splitterOutputToCrossPort') {
                        pushHost({
                            type: 'object',
                            objectType: endType,
                            objectName: endName,
                            object: endObj,
                            port: item.crossPort != null ? item.crossPort : (item.port != null ? item.port : null),
                            reserveM: 0
                        });
                    }
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
        // Не занижать ёмкость, если сегмент уже знает NF
        if (segment.fiberCount != null && Number(segment.fiberCount) > total) {
            total = Number(segment.fiberCount);
        }

        // Узел↔кросс / вход сплиттера: если есть реальный кабель — показать ВСЕ жилы
        if (segment.kind === 'nodeLink') {
            var linkCable = cable || findSchematicCableById(segment.cableId);
            var linkTotal = 0;
            if (linkCable && typeof global.getFiberCount === 'function') {
                linkTotal = Number(global.getFiberCount(linkCable)) || 0;
            }
            if (!linkTotal && linkCable && typeof global.getFiberColors === 'function') {
                linkTotal = (global.getFiberColors(linkCable) || []).length;
            }
            if (linkTotal > 1) {
                cable = linkCable;
                total = linkTotal;
                colors = (typeof global.getFiberColors === 'function' && linkCable)
                    ? (global.getFiberColors(linkCable) || [])
                    : colors;
                // fall through to full rows below
            } else {
                var n = Number(segment.tracedFiber) || 1;
                var meta = colors.find(function (f) { return f.number === n; }) ||
                    { number: n, color: '#06b6d4', name: '' };
                return {
                    cable: linkCable || cable,
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
                    // Трасса через кросс/муфту на следующий кабель — всегда continue,
                    // даже если fate=end (соед. «сплиттер» без явной сварки в данных)
                    if (row.traced && nextCableId && row.fate &&
                        (row.fate.kind === 'end' || row.fate.kind === 'free')) {
                        var peerF = nextSeg && nextSeg.tracedFiber != null
                            ? nextSeg.tracedFiber
                            : row.number;
                        row.fate = {
                            kind: 'continue',
                            label: '→ ж' + peerF,
                            peerCableId: nextCableId,
                            peerFiber: peerF
                        };
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
                toType: toHost ? toHost.type : null,
                splitterOutputIndex: seg.splitterOutputIndex != null ? seg.splitterOutputIndex : null,
                crossPort: seg.crossPort != null ? seg.crossPort
                    : (toHost && toHost.port != null ? toHost.port : null)
            };
        });
        return { nodes: chain.nodes, segments: segments };
    }

    function resolveSplitterOutputIndexForItem(splitterObj, item) {
        if (!splitterObj || !splitterObj.properties || !item) return null;
        if (item.outputIndex != null) return Number(item.outputIndex);
        var outs = splitterObj.properties.get('outputConnections') || [];
        for (var i = 0; i < outs.length; i++) {
            var c = outs[i];
            if (!c) continue;
            if (c.onuId) {
                var onu = item.onu || item.onuObj;
                if (onu && getUid(onu) === c.onuId) return i;
            }
            if (c.mediaConverterId) {
                var mc = item.mediaConverter || item.mediaConverterObj;
                if (mc && getUid(mc) === c.mediaConverterId) return i;
            }
            if (c.nodeId) {
                var node = item.node || item.nodeObj;
                if (node && getUid(node) === c.nodeId) return i;
            }
            if (c.splitterId) {
                var sp = item.toSplitter || item.splitter;
                if (item.type === 'splitterOutputToSplitter' && item.toSplitter) {
                    if (getUid(item.toSplitter) === c.splitterId) return i;
                } else if (sp && getUid(sp) === c.splitterId) return i;
            }
            if (c.crossPort != null && item.crossPort != null && Number(c.crossPort) === Number(item.crossPort)) {
                if (!c.hostId) return i;
                var crossHost = item.toCross || item.cross || item.host;
                if (!crossHost || getUid(crossHost) === c.hostId) return i;
            }
            if (c.cableId && item.cableId && String(c.cableId) === String(item.cableId)) {
                if (c.fiberNumber == null || item.fiberNumber == null ||
                    Number(c.fiberNumber) === Number(item.fiberNumber)) {
                    return i;
                }
            }
            // Без порта/кабеля не матчить кросс по голому hostId — иначе ложные «вых.N → кросс»
            if (c.hostId && c.crossPort == null && !c.cableId) {
                var hostObj = item.host || item.node || item.onu;
                if (hostObj && getUid(hostObj) === c.hostId) return i;
            }
        }
        return null;
    }

    /**
     * Синхронизация сегмента сплиттера с outputConnections по cableId:
     * жила и номер выхода — из данных, не из чужой трассы / fromSplitterOutput цели.
     */
    function syncSplitterSegmentToOutputConn(seg, fromNode) {
        if (!seg || !seg.cableId || !fromNode || fromNode.type !== 'splitter') return false;
        if (!fromNode.object || !fromNode.object.properties) return false;
        var outs = fromNode.object.properties.get('outputConnections') || [];
        var candidates = [];
        var exact = null;
        for (var i = 0; i < outs.length; i++) {
            var c = outs[i];
            if (!c || !c.cableId) continue;
            if (String(c.cableId) !== String(seg.cableId)) continue;
            candidates.push(i);
            if (seg.tracedFiber != null && c.fiberNumber != null &&
                Number(c.fiberNumber) === Number(seg.tracedFiber)) {
                exact = i;
            }
            if (exact == null && seg.tapFiber != null && c.fiberNumber != null &&
                Number(c.fiberNumber) === Number(seg.tapFiber)) {
                exact = i;
            }
        }
        if (!candidates.length) return false;
        var oi = null;
        if (candidates.length === 1) {
            oi = candidates[0];
        } else if (exact != null) {
            oi = exact;
        } else if (seg.splitterOutputIndex != null &&
            candidates.indexOf(Number(seg.splitterOutputIndex)) >= 0) {
            oi = Number(seg.splitterOutputIndex);
        } else {
            oi = candidates[0];
        }
        seg.splitterOutputIndex = oi;
        var oc = outs[oi];
        if (oc && oc.fiberNumber != null) {
            var fn = Number(oc.fiberNumber);
            seg.tapFiber = fn;
            // Не назначать tracedFiber выдуманным/чужим отводам
            if (seg.onTracePath !== false && !seg.invented) {
                seg.tracedFiber = fn;
            }
        }
        if (seg.linkLabel == null || !/^вых\./i.test(String(seg.linkLabel))) {
            seg.linkLabel = 'вых.' + (oi + 1);
        } else {
            seg.linkLabel = 'вых.' + (oi + 1);
        }
        return true;
    }

    function resolveSplitterOutputIndexForTarget(splitterObj, targetObj, hintPort, hintCableId, hintFiber) {
        if (!splitterObj || !splitterObj.properties || !targetObj) return null;
        var outs = splitterObj.properties.get('outputConnections') || [];
        var tid = getUid(targetObj);
        var tType = targetObj.properties && targetObj.properties.get('type');
        var cableLoose = null;
        for (var i = 0; i < outs.length; i++) {
            var c = outs[i];
            if (!c) continue;
            if (c.onuId && tid === c.onuId) return i;
            if (c.mediaConverterId && tid === c.mediaConverterId) return i;
            if (c.nodeId && tid === c.nodeId) return i;
            if (c.splitterId && tid === c.splitterId) return i;
            // Кабель: сначала точное совпадение жилы, иначе — только если жила не задана
            if (c.cableId && hintCableId && String(c.cableId) === String(hintCableId)) {
                if (hintFiber != null && c.fiberNumber != null &&
                    Number(c.fiberNumber) === Number(hintFiber)) {
                    return i;
                }
                if (cableLoose == null && (c.fiberNumber == null || hintFiber == null)) {
                    cableLoose = i;
                }
            }
            if (c.crossPort != null && hintPort != null && Number(c.crossPort) === Number(hintPort)) {
                if (!c.hostId || tid === c.hostId) return i;
            }
            if (c.hostId && tid === c.hostId && hintPort != null && c.crossPort != null &&
                Number(c.crossPort) === Number(hintPort)) {
                return i;
            }
            if (c.hostId && tid === c.hostId && hintPort == null && c.crossPort == null &&
                tType !== 'cross' && tType !== 'sleeve' && tType !== 'spliceCassette') {
                return i;
            }
        }
        if (cableLoose != null) return cableLoose;
        return null;
    }

    function schematicSvgEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /** Убрать A→C только если это тот же ход жилы через B (A→B и B→C с той же ж). */
    function pruneTransitiveSchematicSegments(segments) {
        if (!segments || segments.length < 2) return segments || [];
        var byFrom = {};
        segments.forEach(function (s, idx) {
            if (!byFrom[s.fromIdx]) byFrom[s.fromIdx] = [];
            byFrom[s.fromIdx].push(idx);
        });
        var drop = {};
        segments.forEach(function (s, si) {
            var fiber = s.tracedFiber;
            if (fiber == null) return;
            var fromSegs = byFrom[s.fromIdx] || [];
            for (var i = 0; i < fromSegs.length; i++) {
                var midSeg = segments[fromSegs[i]];
                if (midSeg.toIdx === s.toIdx) continue;
                if (midSeg.tracedFiber != null && Number(midSeg.tracedFiber) !== Number(fiber)) continue;
                var mid = midSeg.toIdx;
                var midOut = byFrom[mid] || [];
                for (var j = 0; j < midOut.length; j++) {
                    var next = segments[midOut[j]];
                    if (next.toIdx !== s.toIdx) continue;
                    // A→B→C и A→C с той же жилой на первом шаге — короткий дубль
                    drop[si] = true;
                    return;
                }
            }
        });
        if (!Object.keys(drop).length) return segments;
        return segments.filter(function (_s, i) { return !drop[i]; });
    }

    function findSchematicObjectByUid(uid, typeHint) {
        if (!uid || !Array.isArray(global.objects)) return null;
        return global.objects.find(function (o) {
            if (!o || !o.properties) return false;
            if (getUid(o) !== uid) return false;
            if (typeHint && o.properties.get('type') !== typeHint) return false;
            return true;
        }) || null;
    }

    /**
     * Дополнить схему выходами сплиттера на ONU/МК/узел/дочерний сплиттер.
     * Не выдумывать рёбра сплиттер→кросс/муфта по cableId — только из реальной трассы.
     */
    function enrichSchematicModelFromSplitterOutputs(model) {
        if (!model || !model.nodes || !model.segments) return model;
        var nodeMap = {};
        model.nodes.forEach(function (n, i) {
            if (n && n.id != null) nodeMap[String(n.id)] = i;
        });

        function hasEdge(fromIdx, toIdx) {
            for (var ei = 0; ei < model.segments.length; ei++) {
                var s = model.segments[ei];
                if (s && s.fromIdx === fromIdx && s.toIdx === toIdx) return s;
            }
            return null;
        }

        function nodeIndexForObject(obj) {
            if (!obj) return -1;
            var id = getUid(obj);
            if (!id) return -1;
            if (nodeMap[id] != null) return nodeMap[id];
            for (var i = 0; i < model.nodes.length; i++) {
                if (model.nodes[i] && model.nodes[i].object && getUid(model.nodes[i].object) === id) {
                    return i;
                }
            }
            return -1;
        }

        function ensureNode(obj, type, name, port, asOutPort) {
            if (!obj) return -1;
            var baseId = getUid(obj);
            if (!baseId) return -1;
            var id = (asOutPort && port != null) ? (baseId + '#p' + port) : baseId;
            if (nodeMap[id] != null) {
                var ex = model.nodes[nodeMap[id]];
                if (port != null && ex.port == null) ex.port = port;
                return nodeMap[id];
            }
            if (!asOutPort && port != null && nodeMap[baseId] != null) {
                id = baseId + '#p' + port;
                asOutPort = true;
                if (nodeMap[id] != null) {
                    var ex2 = model.nodes[nodeMap[id]];
                    if (port != null && ex2.port == null) ex2.port = port;
                    return nodeMap[id];
                }
            }
            var idx = model.nodes.length;
            model.nodes.push({
                id: id,
                name: (asOutPort && port != null)
                    ? ((name || (obj.properties && obj.properties.get('name')) || getTypeName(type)) + ' · п.' + port)
                    : (name || (obj.properties && obj.properties.get('name')) || getTypeName(type)),
                type: type,
                object: obj,
                reserveM: 0,
                port: port != null ? port : null,
                embeddedInHost: obj._embedded ? obj._host : null
            });
            nodeMap[id] = idx;
            return idx;
        }

        function ensureSeg(fromIdx, toIdx, meta) {
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
            var existing = hasEdge(fromIdx, toIdx);
            var outLabel = meta.outIndex != null ? ('вых.' + (meta.outIndex + 1)) : (meta.label || 'выход');
            if (meta.crossPort != null && meta.outIndex != null) {
                outLabel = 'вых.' + (meta.outIndex + 1) + ' → п.' + meta.crossPort;
            }
            var onPath = meta.onTracePath !== false;
            if (existing) {
                // Не вешать «вых.N» на чужой кабель/сегмент
                if (meta.outIndex != null &&
                    (existing.kind === 'nodeLink' ||
                        !existing.cableId ||
                        !meta.cableId ||
                        String(existing.cableId) === String(meta.cableId))) {
                    existing.splitterOutputIndex = meta.outIndex;
                    existing.linkLabel = outLabel;
                    if (meta.crossPort != null) existing.crossPort = meta.crossPort;
                    // Жилу трассы не перетирать выдуманным отводом
                    if (meta.fiber != null && (onPath || existing.tracedFiber == null)) {
                        if (onPath || existing.onTracePath !== false) {
                            existing.tracedFiber = meta.fiber;
                        } else {
                            existing.tapFiber = meta.fiber;
                        }
                    }
                    if (meta.cableId && !existing.cableId) existing.cableId = meta.cableId;
                    if (onPath) existing.onTracePath = true;
                }
                return;
            }
            model.segments.push({
                kind: 'nodeLink',
                fromIdx: fromIdx,
                toIdx: toIdx,
                cableId: meta.cableId || null,
                cableName: meta.label || outLabel,
                cable: null,
                lengthM: null,
                // Только hop из реальной трассы подсвечиваем как трассируемую жилу
                tracedFiber: (onPath && meta.fiber != null) ? meta.fiber : null,
                tapFiber: (!onPath && meta.fiber != null) ? meta.fiber : null,
                fiberCount: 1,
                fibers: [],
                linkLabel: outLabel,
                fromNode: false,
                splitterOutputIndex: meta.outIndex != null ? meta.outIndex : null,
                crossPort: meta.crossPort != null ? meta.crossPort : null,
                onTracePath: onPath,
                invented: !onPath
            });
        }

        var splitterIdxs = [];
        model.nodes.forEach(function (n, i) {
            if (n && n.type === 'splitter') splitterIdxs.push(i);
        });

        splitterIdxs.forEach(function (si) {
            var spNode = model.nodes[si];
            var sp = spNode.object;
            if (!sp || !sp.properties) return;
            var spHost = sp._host || null;
            var outs = sp.properties.get('outputConnections') || [];
            outs.forEach(function (conn, oi) {
                if (!conn) return;
                var target = null;
                var tType = null;
                var tName = null;
                var tPort = null;
                var asOutPort = false;
                var allowInvent = false;

                if (conn.onuId) {
                    target = findSchematicObjectByUid(conn.onuId, 'onu');
                    tType = 'onu';
                    allowInvent = true;
                } else if (conn.mediaConverterId) {
                    target = findSchematicObjectByUid(conn.mediaConverterId, 'mediaConverter');
                    tType = 'mediaConverter';
                    allowInvent = true;
                } else if (conn.nodeId) {
                    target = findSchematicObjectByUid(conn.nodeId, 'node');
                    tType = 'node';
                    allowInvent = true;
                } else if (conn.splitterId) {
                    target = findSchematicObjectByUid(conn.splitterId, 'splitter');
                    if (!target && typeof global.resolveSplitterObject === 'function') {
                        target = global.resolveSplitterObject(conn.splitterId);
                    }
                    tType = 'splitter';
                    allowInvent = true;
                } else if (conn.crossPort != null) {
                    // Локальный порт на своём хосте сплиттера — ок; чужой кросс не выдумываем
                    target = conn.hostId ? findSchematicObjectByUid(conn.hostId) : null;
                    if (!target && spHost) target = spHost;
                    if (!target) return;
                    var sameHost = spHost && getUid(target) === getUid(spHost);
                    if (!sameHost && nodeIndexForObject(target) < 0) return;
                    tType = target.properties ? target.properties.get('type') : 'cross';
                    tPort = conn.crossPort;
                    tName = target.properties ? target.properties.get('name') : null;
                    asOutPort = true;
                    allowInvent = !!sameHost;
                    if (!allowInvent) {
                        // только подписать уже существующее ребро трассы
                        var existTi = nodeIndexForObject(target);
                        if (existTi < 0) {
                            // попробовать #p порт
                            var pid = getUid(target) + '#p' + tPort;
                            if (nodeMap[pid] != null) existTi = nodeMap[pid];
                        }
                        if (existTi >= 0 && hasEdge(si, existTi)) {
                            ensureSeg(si, existTi, {
                                outIndex: oi,
                                fiber: conn.fiberNumber,
                                crossPort: tPort,
                                label: 'вых.' + (oi + 1)
                            });
                        }
                        return;
                    }
                } else if (conn.cableId) {
                    // Только подписать hop из реальной трассы — не выдумывать дальние концы
                    // (иначе огромный sync и ложные ветки при трассировке с середины).
                    var cab = findSchematicCableById(conn.cableId);
                    if (!cab) return;
                    var matchedCab = false;
                    model.segments.forEach(function (seg) {
                        if (!seg || seg.fromIdx !== si) return;
                        if (!seg.cableId || String(seg.cableId) !== String(conn.cableId)) return;
                        if (conn.fiberNumber != null && seg.tracedFiber != null &&
                            Number(seg.tracedFiber) !== Number(conn.fiberNumber)) {
                            return;
                        }
                        ensureSeg(si, seg.toIdx, {
                            outIndex: oi,
                            fiber: conn.fiberNumber,
                            cableId: conn.cableId,
                            label: 'вых.' + (oi + 1),
                            onTracePath: true
                        });
                        matchedCab = true;
                    });
                    if (matchedCab) return;
                    return;
                }

                if (!target || !allowInvent) return;
                if (!tName && target.properties) tName = target.properties.get('name');
                var ti = ensureNode(target, tType || (target.properties && target.properties.get('type')), tName, tPort, asOutPort);
                ensureSeg(si, ti, {
                    outIndex: oi,
                    fiber: conn.fiberNumber,
                    crossPort: tPort,
                    label: 'вых.' + (oi + 1),
                    cableId: conn.cableId || null,
                    onTracePath: false
                });
                if (ti >= 0 && model.nodes[ti]) {
                    if (model.nodes[ti].fromSplitterOutput == null) {
                        model.nodes[ti].fromSplitterOutput = oi + 1;
                    }
                    if (tPort != null && model.nodes[ti].port == null) {
                        model.nodes[ti].port = tPort;
                    }
                }
            });
        });

        // Дописать номера выходов только на hop'ах из трассы (строгое сопоставление)
        model.segments.forEach(function (seg) {
            if (seg.splitterOutputIndex != null) {
                var toDone = model.nodes[seg.toIdx];
                if (toDone && toDone.fromSplitterOutput == null) {
                    toDone.fromSplitterOutput = Number(seg.splitterOutputIndex) + 1;
                }
                return;
            }
            var from = model.nodes[seg.fromIdx];
            var to = model.nodes[seg.toIdx];
            if (!from || from.type !== 'splitter' || !from.object || !to || !to.object) return;
            var oi2 = resolveSplitterOutputIndexForTarget(
                from.object, to.object, to.port, seg.cableId, seg.tracedFiber
            );
            if (oi2 == null) return;
            seg.splitterOutputIndex = oi2;
            seg.linkLabel = to.port != null
                ? ('вых.' + (oi2 + 1) + ' → п.' + to.port)
                : ('вых.' + (oi2 + 1));
            if (to.fromSplitterOutput == null) to.fromSplitterOutput = oi2 + 1;
        });
        return model;
    }

    /**
     * После входа в кросс/муфту: жилы со сваркой на другой кабель → добавить дальний конец
     * (муфта/кросс), иначе на схеме только подпись «ушла в другой кабель» без узла.
     */
    function enrichSchematicModelFromHostSplices(model) {
        if (!model || !model.nodes || !model.segments) return model;
        var nodeMap = {};
        model.nodes.forEach(function (n, i) {
            if (n && n.id != null) nodeMap[String(n.id)] = i;
        });

        function hasCableEdge(fromIdx, cableId) {
            for (var ei = 0; ei < model.segments.length; ei++) {
                var s = model.segments[ei];
                if (!s || s.fromIdx !== fromIdx || !s.cableId) continue;
                if (String(s.cableId) === String(cableId)) return s;
            }
            return null;
        }

        function ensureNode(obj, type, name) {
            if (!obj) return -1;
            var id = getUid(obj);
            if (!id) return -1;
            if (nodeMap[id] != null) return nodeMap[id];
            for (var i = 0; i < model.nodes.length; i++) {
                if (model.nodes[i] && model.nodes[i].object && getUid(model.nodes[i].object) === id) {
                    nodeMap[id] = i;
                    return i;
                }
            }
            var idx = model.nodes.length;
            model.nodes.push({
                id: id,
                name: name || (obj.properties && obj.properties.get('name')) || getTypeName(type),
                type: type,
                object: obj,
                reserveM: 0,
                port: null,
                embeddedInHost: obj._embedded ? obj._host : null
            });
            nodeMap[id] = idx;
            return idx;
        }

        function resolveFarEnd(cable, hostObj) {
            if (!cable || !hostObj) return null;
            var far = null;
            if (typeof global.getOtherEndOfCable === 'function') {
                far = global.getOtherEndOfCable(cable, hostObj);
            }
            if (!far && typeof global.getOtherEnd === 'function') {
                try { far = global.getOtherEnd(cable, hostObj); } catch (e) { far = null; }
            }
            if (!far && cable.properties) {
                var fromUid = cable.properties.get('fromUniqueId');
                var toUid = cable.properties.get('toUniqueId');
                var hostUid = getUid(hostObj);
                var farUid = null;
                if (hostUid && fromUid && String(fromUid) === String(hostUid)) farUid = toUid;
                else if (hostUid && toUid && String(toUid) === String(hostUid)) farUid = fromUid;
                else farUid = toUid || fromUid;
                if (farUid) far = findSchematicObjectByUid(farUid);
                if (!far) {
                    var fromObj = cable.properties.get('from');
                    var toObj = cable.properties.get('to');
                    if (hostUid && fromObj && getUid(fromObj) === hostUid) far = toObj;
                    else if (hostUid && toObj && getUid(toObj) === hostUid) far = fromObj;
                    else far = toObj || fromObj;
                }
            }
            if (far && getUid(far) === getUid(hostObj)) return null;
            return far || null;
        }

        var incoming = model.segments.slice();
        var added = 0;
        var maxAdd = 24;
        incoming.forEach(function (seg) {
            if (added >= maxAdd) return;
            if (!seg || !seg.cableId || seg.kind === 'nodeLink') return;
            var host = model.nodes[seg.toIdx];
            if (!host || !host.object || !host.object.properties) return;
            var ht = host.type;
            if (ht !== 'cross' && ht !== 'sleeve' && ht !== 'spliceCassette' && ht !== 'olt') return;

            ensureSchematicSegmentFibers(seg, host, null);
            var fibers = seg.fibers || [];
            for (var fi = 0; fi < fibers.length; fi++) {
                if (added >= maxAdd) break;
                var fiber = fibers[fi];
                if (!fiber || !fiber.fate) continue;
                // Только трассируемая жила: иначе схема обрастает чужими ветками и красится cyan
                if (!fiber.traced) continue;
                var fate = fiber.fate;
                if (fate.kind !== 'branch' && fate.kind !== 'continue') continue;
                if (!fate.peerCableId) continue;
                if (String(fate.peerCableId) === String(seg.cableId)) continue;
                if (hasCableEdge(seg.toIdx, fate.peerCableId)) continue;

                // Не дублировать уже существующий hop трассы с этой жилой
                var alreadyOut = false;
                for (var oj = 0; oj < model.segments.length; oj++) {
                    var os = model.segments[oj];
                    if (!os || os.fromIdx !== seg.toIdx) continue;
                    if (String(os.cableId) === String(fate.peerCableId)) {
                        alreadyOut = true;
                        break;
                    }
                }
                if (alreadyOut) continue;

                var peerCab = findSchematicCableById(fate.peerCableId);
                if (!peerCab) continue;
                var farEnd = resolveFarEnd(peerCab, host.object);
                if (!farEnd || !farEnd.properties) continue;
                var farType = farEnd.properties.get('type');
                if (farType === 'support' || farType === 'attachment' || farType === 'manhole' ||
                    farType === 'cable' || farType === 'cableLabel') {
                    continue;
                }
                var ti = ensureNode(
                    farEnd,
                    farType,
                    farEnd.properties.get('name') || getTypeName(farType)
                );
                if (ti < 0 || ti === seg.toIdx) continue;
                if (hasCableEdge(seg.toIdx, fate.peerCableId)) continue;

                var peerFiber = fate.peerFiber != null ? Number(fate.peerFiber) : null;
                var cabName = peerCab.properties.get('cableName') ||
                    (typeof global.getCableDescription === 'function'
                        ? global.getCableDescription(peerCab.properties.get('cableType'), peerCab)
                        : 'кабель');
                var lenM = null;
                if (typeof global.getCableLengthMeters === 'function') {
                    try { lenM = global.getCableLengthMeters(peerCab); } catch (e2) { lenM = null; }
                }
                model.segments.push({
                    kind: 'cable',
                    fromIdx: seg.toIdx,
                    toIdx: ti,
                    cableId: fate.peerCableId,
                    cableName: cabName,
                    cable: peerCab,
                    lengthM: lenM,
                    tracedFiber: peerFiber,
                    fiberCount: 0,
                    fibers: [],
                    linkLabel: peerFiber != null
                        ? ('сварка · ж' + fiber.number + '→ж' + peerFiber)
                        : ('сварка · ж' + fiber.number),
                    fromNode: false,
                    fromType: ht,
                    toType: farType,
                    splitterOutputIndex: null,
                    crossPort: null,
                    fromSplice: true,
                    onTracePath: true,
                    spliceFromFiber: Number(fiber.number)
                });
                added++;
            }
        });
        return model;
    }

    /**
     * Один выход сплиттера (вых.N) — один hop. Иначе при слиянии веток/реверса
     * один порт рисуется веером на муфту и кросс сразу.
     */
    function dedupeSplitterSameOutputHops(model) {
        if (!model || !model.segments || !model.nodes) return model;
        function scoreHop(seg, spNode) {
            if (!seg) return -999;
            var to = model.nodes[seg.toIdx];
            if (!to) return -999;
            var s = 0;
            if (seg.invented || seg.onTracePath === false) s -= 50;
            else s += 30;
            if (seg.cableId) s += 25;
            if (seg.kind !== 'nodeLink') s += 10;
            if (to.type === 'onu') s += 80;
            if (to.type === 'sleeve' || to.type === 'spliceCassette') s += 60;
            if (to.type === 'mediaConverter' || to.type === 'node') s += 40;
            if (to.type === 'cross') s += 15;
            var spHost = spNode && spNode.object && spNode.object._host;
            if (spHost && to.object && getUid(to.object) === getUid(spHost)) s -= 200;
            if (seg.tracedFiber != null) s += 5;
            return s;
        }
        var best = {};
        model.segments.forEach(function (seg, idx) {
            if (!seg || seg.fromIdx == null) return;
            var from = model.nodes[seg.fromIdx];
            if (!from || from.type !== 'splitter') return;
            var oi = seg.splitterOutputIndex;
            if (oi == null && seg.linkLabel) {
                var m = String(seg.linkLabel).match(/вых\.?\s*(\d+)/i);
                if (m) oi = Math.max(0, Number(m[1]) - 1);
            }
            if (oi == null) return;
            var key = String(seg.fromIdx) + ':' + String(oi);
            var prev = best[key];
            var sc = scoreHop(seg, from);
            if (prev == null || sc > prev.score) {
                best[key] = { idx: idx, score: sc };
            }
        });
        var keep = {};
        Object.keys(best).forEach(function (k) { keep[best[k].idx] = true; });
        var hasDedupe = Object.keys(best).length > 0;
        if (!hasDedupe) return model;
        model.segments = model.segments.filter(function (seg, idx) {
            if (!seg || seg.fromIdx == null) return true;
            var from = model.nodes[seg.fromIdx];
            if (!from || from.type !== 'splitter') return true;
            var oi = seg.splitterOutputIndex;
            if (oi == null && seg.linkLabel) {
                var m2 = String(seg.linkLabel).match(/вых\.?\s*(\d+)/i);
                if (m2) oi = Math.max(0, Number(m2[1]) - 1);
            }
            if (oi == null) return true;
            return !!keep[idx];
        });
        return model;
    }

    function schematicNodeTypeRank(type) {
        var rank = {
            olt: 0, cross: 1, sleeve: 1, spliceCassette: 1, splitter: 2,
            node: 3, onu: 4, mediaConverter: 5, radioBridge: 6
        };
        return rank[type] != null ? rank[type] : 9;
    }

    function computeSchematicTreeLayout(model) {
        var n = model.nodes.length;
        var outs = [];
        var children = [];
        var parents = [];
        var ins = [];
        var i;
        for (i = 0; i < n; i++) {
            outs[i] = [];
            children[i] = [];
            parents[i] = [];
            ins[i] = 0;
        }
        model.segments.forEach(function (seg, si) {
            if (seg.fromIdx == null || seg.toIdx == null) return;
            outs[seg.fromIdx].push(si);
            if (children[seg.fromIdx].indexOf(seg.toIdx) < 0) {
                children[seg.fromIdx].push(seg.toIdx);
            }
            if (parents[seg.toIdx].indexOf(seg.fromIdx) < 0) {
                parents[seg.toIdx].push(seg.fromIdx);
            }
            ins[seg.toIdx]++;
        });

        var roots = [];
        for (i = 0; i < n; i++) {
            if (ins[i] === 0) roots.push(i);
        }
        if (!roots.length) roots.push(0);
        roots.sort(function (a, b) {
            return schematicNodeTypeRank(model.nodes[a].type) - schematicNodeTypeRank(model.nodes[b].type);
        });

        // Длиннейший путь по рёбрам: каскад сплиттер→муфта уходит вправо, не в ту же колонку
        var depth = [];
        for (i = 0; i < n; i++) depth[i] = 0;
        var depthGuard = 0;
        var depthChanged = true;
        while (depthChanged && depthGuard++ < n + 3) {
            depthChanged = false;
            model.segments.forEach(function (seg) {
                if (!seg || seg.fromIdx == null || seg.toIdx == null) return;
                if (seg.fromIdx === seg.toIdx) return;
                var nd = (depth[seg.fromIdx] || 0) + 1;
                if (nd > (depth[seg.toIdx] || 0)) {
                    depth[seg.toIdx] = nd;
                    depthChanged = true;
                }
            });
        }
        // Узлы без входящих — корни на глубине 0; остальные уже проставлены
        for (i = 0; i < n; i++) {
            if (ins[i] === 0) depth[i] = 0;
        }
        // Ещё один проход от корней — подтянуть детей корней
        depthChanged = true;
        depthGuard = 0;
        while (depthChanged && depthGuard++ < n + 3) {
            depthChanged = false;
            model.segments.forEach(function (seg) {
                if (!seg || seg.fromIdx == null || seg.toIdx == null) return;
                if (seg.fromIdx === seg.toIdx) return;
                var nd = (depth[seg.fromIdx] || 0) + 1;
                if (nd > (depth[seg.toIdx] || 0)) {
                    depth[seg.toIdx] = nd;
                    depthChanged = true;
                }
            });
        }

        // Сортировка детей: сначала по номеру выхода сплиттера, затем тип/имя
        for (i = 0; i < n; i++) {
            children[i].sort(function (a, b) {
                var outA = null;
                var outB = null;
                (outs[i] || []).forEach(function (si) {
                    var seg = model.segments[si];
                    if (!seg || seg.splitterOutputIndex == null) return;
                    if (seg.toIdx === a) outA = seg.splitterOutputIndex;
                    if (seg.toIdx === b) outB = seg.splitterOutputIndex;
                });
                if (outA != null && outB != null && outA !== outB) return outA - outB;
                if (outA != null && outB == null) return -1;
                if (outA == null && outB != null) return 1;
                var ra = schematicNodeTypeRank(model.nodes[a].type);
                var rb = schematicNodeTypeRank(model.nodes[b].type);
                if (ra !== rb) return ra - rb;
                return String(model.nodes[a].name || '').localeCompare(String(model.nodes[b].name || ''), 'ru');
            });
        }

        var size = [];
        var yPos = [];
        for (i = 0; i < n; i++) {
            size[i] = 1;
            yPos[i] = 0;
        }

        function measure(v, seen) {
            seen = seen || {};
            if (seen[v]) return 1;
            seen[v] = true;
            var kids = children[v];
            if (!kids.length) {
                size[v] = 1;
                return 1;
            }
            var s = 0;
            kids.forEach(function (k) { s += measure(k, seen); });
            size[v] = Math.max(1, s);
            return size[v];
        }

        function place(v, top, seen) {
            seen = seen || {};
            if (seen[v]) {
                yPos[v] = top + 0.5;
                return top + 1;
            }
            seen[v] = true;
            var kids = children[v];
            if (!kids.length) {
                yPos[v] = top + 0.5;
                return top + 1;
            }
            var cursor = top;
            kids.forEach(function (k) {
                cursor = place(k, cursor, seen);
            });
            var ySum = 0;
            kids.forEach(function (k) { ySum += yPos[k]; });
            yPos[v] = ySum / kids.length;
            return top + size[v];
        }

        var cursor = 0;
        roots.forEach(function (r) {
            measure(r, {});
            cursor = place(r, cursor, {});
        });

        var rooted = {};
        function mark(v) {
            if (rooted[v]) return;
            rooted[v] = true;
            (children[v] || []).forEach(mark);
        }
        roots.forEach(mark);
        for (i = 0; i < n; i++) {
            if (!rooted[i]) {
                yPos[i] = cursor + 0.5;
                cursor += 1;
            }
        }

        var minY = Infinity;
        var maxY = -Infinity;
        for (i = 0; i < n; i++) {
            minY = Math.min(minY, yPos[i]);
            maxY = Math.max(maxY, yPos[i]);
        }
        if (!isFinite(minY)) { minY = 0; maxY = 0; }
        for (i = 0; i < n; i++) yPos[i] -= minY;
        var span = Math.max(1, maxY - minY + 1);

        // Колонки только по BFS-глубине (родитель→дети рядом), без «семантики»
        var usedDepths = {};
        for (i = 0; i < n; i++) usedDepths[depth[i]] = true;
        var depthList = Object.keys(usedDepths).map(Number).sort(function (a, b) { return a - b; });
        var depthToCol = {};
        depthList.forEach(function (d, idx) { depthToCol[d] = idx; });
        var col = [];
        for (i = 0; i < n; i++) col[i] = depthToCol[depth[i]];
        var maxCol = Math.max(0, depthList.length - 1);

        return {
            depth: col,
            rawDepth: depth,
            y: yPos,
            maxDepth: maxCol,
            span: span,
            outs: outs,
            ins: ins,
            children: children,
            parents: parents,
            roots: roots
        };
    }

    function schematicNormalizeFiberColor(c) {
        if (!c) return '#94a3b8';
        var u = String(c).toUpperCase();
        if (u === '#FFFFFF' || u === '#FFF' || u === '#FFFACD' || u === '#FFFF00' || u === 'WHITE') {
            return '#cbd5e1';
        }
        return String(c);
    }

    function schematicSegmentTracedFiberMeta(seg) {
        if (!seg) return null;
        var fibers = ensureSchematicSegmentFibers(seg);
        var tracedN = seg.tracedFiber != null ? Number(seg.tracedFiber) : null;
        if (tracedN == null) return null;
        for (var i = 0; i < fibers.length; i++) {
            if (Number(fibers[i].number) === tracedN) return fibers[i];
        }
        return { number: tracedN, color: '#06b6d4', name: '' };
    }

    function ensureSchematicSegmentFibers(seg, toNode, nextCableId) {
        if (!seg) return [];
        var needRebuild = !seg.fibers || !seg.fibers.length;
        if (!needRebuild) {
            var cable = seg.cable || findSchematicCableById(seg.cableId);
            var cap = 0;
            if (typeof global.getFiberCount === 'function' && cable) {
                cap = Number(global.getFiberCount(cable)) || 0;
            }
            if (!cap && cable && typeof global.getFiberColors === 'function') {
                var cols = global.getFiberColors(cable) || [];
                cap = cols.length;
            }
            if (!cap) cap = Number(seg.fiberCount) || 0;
            // Если в сегменте меньше жил, чем ёмкость кабеля — пересобрать
            if (cap > 1 && seg.fibers.length < cap) needRebuild = true;
        }
        if (needRebuild) {
            var built = buildSchematicFiberRows(seg, toNode || null);
            seg.fibers = built.rows || [];
            if (seg.fiberCount == null || seg.fiberCount < (built.total || 0)) {
                seg.fiberCount = built.total;
            }
        }
        if (toNode && seg.cableId) {
            seg.fibers.forEach(function (row) {
                if (!row) return;
                // Всегда пересчитывать fate с актуальным nextCableId —
                // иначе «ветка» на чужой кабель рисуется на исходящую кассету
                row.fate = resolveFiberFateAtHost(
                    toNode.object,
                    seg.cableId,
                    row.number,
                    nextCableId || null
                );
            });
        }
        return seg.fibers;
    }

    /**
     * Кассета жил: активные жилы + куда уходят; свободные — компактной сводкой.
     */
    function appendTreeFiberRibbon(parts, x0, x1, yMid, seg, toNode, nextCableId, embedded) {
        if (!seg) return null;
        // nodeLink без кабеля — не кассета; с cableId (вход сплиттера и т.п.) — показываем жилы
        if (seg.kind === 'nodeLink' && !seg.cableId) return null;
        var fibers = ensureSchematicSegmentFibers(seg, toNode, nextCableId);
        var meta = schematicSegmentTracedFiberMeta(seg);
        if (!fibers.length) return meta;

        var gap = x1 - x0;
        if (gap < 36) return meta;

        var active = fibers.slice();
        var freeCount = 0;
        active.forEach(function (f) {
            if (f && f.fate && f.fate.kind === 'free' && !f.traced) freeCount++;
        });
        // сортируем по номеру жилы — показываем ВСЕ (1…N), включая свободные
        active.sort(function (a, b) {
            return (Number(a.number) || 0) - (Number(b.number) || 0);
        });

        var showFreeLane = false;
        var nActive = active.length;
        var n = Math.max(1, nActive);
        var totalN = fibers.length;

        var showFates = !!(toNode && (toNode.type === 'cross' || toNode.type === 'sleeve' ||
            toNode.type === 'spliceCassette' || toNode.type === 'splitter'));
        var fateColW = (showFates && !embedded) ? Math.min(54, Math.max(36, gap * 0.22)) : 0;

        var pitch = n > 32 ? 6.5 : (n > 16 ? 8 : (n > 8 ? 10 : (n > 4 ? 12 : 14)));
        var bandH = n <= 1 ? 14 : (n - 1) * pitch;
        var maxBand = 280;
        if (bandH > maxBand) {
            pitch = maxBand / Math.max(1, n - 1);
            bandH = maxBand;
        }
        var padY = embedded ? 8 : 10;
        var padX = embedded ? 6 : Math.min(5, gap * 0.04);
        var boxX = x0 + padX;
        var boxW = Math.max(40, x1 - x0 - padX * 2);
        var boxY = yMid - bandH / 2 - padY;
        var boxH = bandH + padY * 2;
        var xa = boxX + 10;
        var xb = boxX + boxW - 6 - fateColW;
        if (xb - xa < 20) {
            fateColW = Math.max(0, fateColW - (20 - (xb - xa)));
            xb = boxX + boxW - 6 - fateColW;
        }
        var yTop = yMid - bandH / 2;

        function laneY(idx) {
            if (n <= 1) return yMid;
            return yTop + (idx / Math.max(1, n - 1)) * bandH;
        }

        var laneByFiber = {};
        active.forEach(function (fiber, idx) {
            laneByFiber[Number(fiber.number)] = laneY(idx);
        });
        var freeLaneY = null;

        parts.push('<g class="trace-sch-tree-fibers">');
        if (!embedded) {
            parts.push('<rect class="trace-sch-tree-fiber-band" x="' + boxX + '" y="' + boxY +
                '" width="' + boxW + '" height="' + boxH + '" rx="8"/>');
        }
        if (fateColW > 18) {
            parts.push('<line class="trace-sch-tree-fiber-fate-sep" x1="' + (xb + 3) + '" y1="' + (boxY + 3) +
                '" x2="' + (xb + 3) + '" y2="' + (boxY + boxH - 3) + '"/>');
        }

        var drawOrder = active.slice().sort(function (a, b) {
            return (a.traced ? 1 : 0) - (b.traced ? 1 : 0);
        });
        drawOrder.forEach(function (fiber) {
            var y = laneByFiber[Number(fiber.number)];
            if (y == null) return;
            var stroke = schematicNormalizeFiberColor(fiber.color);
            var isFree = !!(fiber.fate && fiber.fate.kind === 'free' && !fiber.traced);
            var d = 'M ' + xa + ' ' + y + ' L ' + xb + ' ' + y;
            if (fiber.traced) {
                parts.push('<path d="' + d + '" fill="none" stroke="#22d3ee" stroke-width="7" stroke-opacity="0.18" stroke-linecap="round"/>');
                parts.push('<path d="' + d + '" fill="none" stroke="#06b6d4" stroke-width="3" stroke-linecap="round"/>');
                parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.4" stroke-linecap="round"/>');
                parts.push('<circle cx="' + xa + '" cy="' + y + '" r="3.2" fill="' + stroke +
                    '" stroke="#06b6d4" stroke-width="1.4"/>');
                parts.push('<circle cx="' + xb + '" cy="' + y + '" r="3.2" fill="' + stroke +
                    '" stroke="#06b6d4" stroke-width="1.4"/>');
            } else {
                var opac = isFree ? 0.58 : 0.88;
                var sw = isFree ? 1.35 : 1.5;
                var dash = isFree ? ' stroke-dasharray="3 2.5"' : '';
                parts.push('<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + sw +
                    '" stroke-opacity="' + opac + '" stroke-linecap="round"' + dash + '/>');
                parts.push('<circle cx="' + xa + '" cy="' + y + '" r="2" fill="' + stroke + '" fill-opacity="' + opac + '"/>');
                parts.push('<circle cx="' + xb + '" cy="' + y + '" r="2" fill="' + stroke + '" fill-opacity="' + opac + '"/>');
            }

            parts.push('<text class="trace-sch-fiber-num' + (fiber.traced ? ' trace-sch-fiber-num--traced' : '') +
                '" x="' + (xa - 4) + '" y="' + (y + 2.8) + '" text-anchor="end">' + fiber.number + '</text>');

            if (fateColW > 18 && fiber.fate && fiber.fate.label &&
                !(fiber.fate.kind === 'continue' && fiber.fate.peerFiber != null)) {
                var fl = String(fiber.fate.label);
                if (fiber.fate.kind === 'free') {
                    fl = 'св';
                } else if (fiber.fate.kind === 'continue') {
                    fl = '→';
                } else if (fiber.fate.kind === 'branch') {
                    fl = '→вет.';
                } else if (fiber.fate.kind === 'end') {
                    fl = fl.indexOf('соед') === 0 || fl.indexOf('→') === 0 ? 'соед.' :
                        (fl.indexOf('сплит') === 0 ? 'сплит' : '·');
                }
                if (fl.length > 8) fl = fl.slice(0, 7) + '…';
                var fateCls = 'trace-sch-tree-fate' +
                    (fiber.traced ? ' trace-sch-tree-fate--traced' : '') +
                    (isFree ? ' trace-sch-tree-fate--free' : '') +
                    (fiber.fate.kind === 'branch' ? ' trace-sch-tree-fate--branch' : '');
                parts.push('<text class="' + fateCls + '" x="' + (xb + 5) + '" y="' + (y + 2.8) + '">' +
                    schematicSvgEsc(fl) + '</text>');
            }
        });

        var capBits = [];
        if (meta) capBits.push('ж' + meta.number);
        if (totalN > 1) capBits.push(totalN + 'F');
        if (seg.lengthM != null) capBits.push(seg.lengthM + ' м');
        if (capBits.length) {
            parts.push('<text class="trace-sch-tree-fiber-caption" x="' + (boxX + boxW / 2) +
                '" y="' + (boxY + boxH + 10) + '" text-anchor="middle">' +
                schematicSvgEsc(capBits.join(' · ')) + '</text>');
        }
        parts.push('</g>');

        // laneY по номеру жилы — для сварок (включая свёрнутые свободные)
        var laneMap = {};
        function virtualLaneY(num) {
            var fn = Math.max(1, Number(num) || 1);
            if (laneByFiber[fn] != null) return laneByFiber[fn];
            if (totalN <= 1) return yMid;
            return yTop + ((Math.min(fn, totalN) - 1) / Math.max(1, totalN - 1)) * bandH;
        }
        for (var li = 1; li <= totalN; li++) laneMap[li] = virtualLaneY(li);
        seg._ribbonGeom = {
            xa: xa,
            xb: xb,
            boxL: boxX,
            boxR: boxX + boxW,
            yMid: yMid,
            laneY: laneMap,
            fromIdx: seg.fromIdx,
            toIdx: seg.toIdx,
            cableId: seg.cableId
        };
        if (meta) meta._bandH = boxH + 12;
        else meta = { _bandH: boxH + 12 };
        return meta;
    }

    /** Оценка высоты кассеты исходящего кабеля (для раскладки). */
    function estimateTreeFiberBandH(seg, toNode, nextCableId) {
        if (!seg) return 36;
        if (seg.kind === 'nodeLink' && !seg.cableId) return 36;
        var fibers = ensureSchematicSegmentFibers(seg, toNode, nextCableId);
        if (!fibers.length) return 36;
        var n = fibers.length;
        var pitch = n > 32 ? 6.5 : (n > 16 ? 8 : (n > 8 ? 10 : (n > 4 ? 12 : 14)));
        var bandH = n <= 1 ? 14 : (n - 1) * pitch;
        return Math.min(280, bandH) + 24 + 16; // pad + caption
    }

    /**
     * Единый блок: заголовок муфты/кросса + кассета исходящего кабеля.
     * Возвращает { h, meta }.
     */
    function appendTreeHostCassetteUnit(parts, x, y, w, node, outSeg, toNode, nextCableId) {
        var headH = 28;
        var tone = schematicTreeNodeTone(node && node.type);
        var typeShort = schematicTreeTypeShort(node && node.type);
        var name = String((node && (node.name || getTypeName(node.type))) || '');
        if (name.length > 16) name = name.slice(0, 14) + '…';

        var fibersH = estimateTreeFiberBandH(outSeg, toNode, nextCableId);
        var h = headH + fibersH + 6;
        var rx = 12;

        parts.push('<g class="trace-sch-tree-unit">');
        parts.push('<rect class="trace-sch-tree-unit-shadow" x="' + (x + 1.5) + '" y="' + (y + 2.5) +
            '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>');
        parts.push('<rect class="trace-sch-tree-unit-bg trace-sch-tree-node--' + tone + '" x="' + x + '" y="' + y +
            '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>');
        parts.push('<rect class="trace-sch-tree-unit-head" x="' + x + '" y="' + y +
            '" width="' + w + '" height="' + headH + '" rx="' + rx + '"/>');
        // срезать скругление снизу у шапки
        parts.push('<rect class="trace-sch-tree-unit-head" x="' + x + '" y="' + (y + headH - 10) +
            '" width="' + w + '" height="10"/>');
        parts.push('<rect class="trace-sch-tree-accent trace-sch-tree-accent--' + tone + '" x="' + (x + 1) +
            '" y="' + (y + 6) + '" width="3.5" height="' + (headH - 10) + '" rx="1.5"/>');
        parts.push('<text class="trace-sch-tree-type" x="' + (x + 12) + '" y="' + (y + 12) + '">' +
            schematicSvgEsc(typeShort) + '</text>');
        parts.push('<text class="trace-sch-tree-name" x="' + (x + 12) + '" y="' + (y + 24) + '">' +
            schematicSvgEsc(name) + '</text>');
        if (node && node.fromSplitterOutput != null) {
            parts.push('<text class="trace-sch-tree-meta trace-sch-tree-meta--out" x="' + (x + w - 8) +
                '" y="' + (y + 18) + '" text-anchor="end">вых.' +
                schematicSvgEsc(String(node.fromSplitterOutput)) + '</text>');
        }

        var bodyTop = y + headH + 2;
        var bodyBot = y + h - 4;
        var yMid = (bodyTop + bodyBot - 12) / 2;
        var meta = null;
        if (outSeg) {
            meta = appendTreeFiberRibbon(
                parts, x + 4, x + w - 4, yMid, outSeg, toNode, nextCableId, true
            );
            // unitX/W — край карточки; boxL/R/xa/xb кассеты НЕ трогаем
            if (outSeg._ribbonGeom) {
                outSeg._ribbonGeom.unitX = x;
                outSeg._ribbonGeom.unitW = w;
                outSeg._ribbonGeom.unitY = y;
                outSeg._ribbonGeom.unitH = h;
                outSeg._ribbonGeom.unitR = x + w;
                outSeg._ribbonGeom.unitL = x;
            }
        }
        parts.push('</g>');
        return { h: h, meta: meta, headH: headH };
    }

    function isSchematicSinglePortEndpoint(node) {
        if (!node) return false;
        var t = node.type;
        return t === 'onu' || t === 'mediaConverter' || t === 'radioBridge' || t === 'node';
    }

    function isSchematicPatchHost(node) {
        if (!node) return false;
        return node.type === 'cross' || node.type === 'sleeve' || node.type === 'spliceCassette';
    }

    /** Число выходов сплиттера (splitRatio). */
    function schematicSplitterRatio(node) {
        if (!node || !node.object || !node.object.properties) return 8;
        var r = parseInt(node.object.properties.get('splitRatio'), 10);
        if (!isFinite(r) || r < 2) r = 8;
        return Math.min(64, r);
    }

    /** Занятые выходы на схеме: только те, с которых есть ребро в модели. */
    function schematicSplitterUsedOutIndices(node, model, ni) {
        var used = {};
        var outs = (node && node.object && node.object.properties)
            ? (node.object.properties.get('outputConnections') || [])
            : [];
        function markOi(oi) {
            if (oi == null || !isFinite(Number(oi))) return;
            used[Number(oi)] = true;
        }
        function resolveOiForSeg(seg) {
            if (!seg) return null;
            // Кабель → всегда сверить с outputConnections (не доверять старому индексу/жиле)
            if (seg.cableId) {
                syncSplitterSegmentToOutputConn(seg, node);
                if (seg.splitterOutputIndex != null && isFinite(Number(seg.splitterOutputIndex))) {
                    return Number(seg.splitterOutputIndex);
                }
            } else if (seg.splitterOutputIndex != null && isFinite(Number(seg.splitterOutputIndex))) {
                return Number(seg.splitterOutputIndex);
            }
            if (!node || !node.object) return null;
            var toNode = model.nodes[seg.toIdx];
            var toObj = toNode && toNode.object ? toNode.object : null;
            var oi = null;
            if (toObj) {
                oi = resolveSplitterOutputIndexForTarget(
                    node.object, toObj, toNode.port, seg.cableId, seg.tracedFiber
                );
            }
            if (oi == null && seg.cableId) {
                for (var i = 0; i < outs.length; i++) {
                    var c = outs[i];
                    if (!c || !c.cableId) continue;
                    if (String(c.cableId) !== String(seg.cableId)) continue;
                    oi = i;
                    break;
                }
            }
            // fromSplitterOutput цели нельзя брать для кабеля — у муфты несколько входов
            if (oi == null && !seg.cableId && toNode && toNode.fromSplitterOutput != null) {
                oi = Math.max(0, Number(toNode.fromSplitterOutput) - 1);
            }
            return oi;
        }
        if (model && model.segments) {
            model.segments.forEach(function (seg) {
                if (!seg || seg.fromIdx !== ni) return;
                var oi = resolveOiForSeg(seg);
                if (oi == null) return;
                seg.splitterOutputIndex = oi;
                if (!seg.linkLabel) seg.linkLabel = 'вых.' + (oi + 1);
                markOi(oi);
            });
        }
        return used;
    }

    function estimateTreeSplitterPortsH(ratio) {
        var n = Math.max(2, Number(ratio) || 8);
        var pitch = n > 32 ? 6.5 : (n > 16 ? 8 : (n > 8 ? 10 : (n > 4 ? 12 : 14)));
        var bandH = (n - 1) * pitch;
        return Math.min(280, bandH) + 24 + 16;
    }

    /** Индекс выхода сплиттера (0-based) у сегмента схемы. */
    function schematicSegOutputIndex(seg, toNode) {
        if (!seg) return null;
        if (seg.splitterOutputIndex != null && isFinite(Number(seg.splitterOutputIndex))) {
            return Number(seg.splitterOutputIndex);
        }
        if (seg.linkLabel) {
            var m = String(seg.linkLabel).match(/вых\.?\s*(\d+)/i);
            if (m) return Math.max(0, Number(m[1]) - 1);
        }
        // Для кабеля не брать fromSplitterOutput цели — у муфты несколько входов
        if (seg.cableId) return null;
        if (toNode && toNode.fromSplitterOutput != null) {
            return Math.max(0, Number(toNode.fromSplitterOutput) - 1);
        }
        return null;
    }

    /**
     * Сплиттер: слева COM (один вход), справа выходы 1…N.
     * Вход не занимает «порт 1» выхода.
     */
    function appendTreeSplitterPortsUnit(parts, x, y, w, node, usedOuts, inheritColor) {
        var headH = 28;
        var ratio = schematicSplitterRatio(node);
        var fibersH = estimateTreeSplitterPortsH(ratio);
        var h = headH + fibersH + 6;
        var tone = schematicTreeNodeTone('splitter');
        var typeShort = schematicTreeTypeShort('splitter');
        var name = String((node && (node.name || getTypeName(node.type))) || '');
        if (name.length > 16) name = name.slice(0, 14) + '…';
        var stroke = schematicNormalizeFiberColor(inheritColor || '#06b6d4');
        var rx = 12;
        var bandH = Math.min(280, fibersH - 24 - 16);
        if (bandH < 14) bandH = 14;
        var yMid = y + headH + 2 + (h - headH - 16) / 2;
        var yTop = yMid - bandH / 2;
        // COM слева; выходы начинаются правее — не путать с «ж1 / порт 1»
        var comX = x + 14;
        var comY = yMid;
        var xa = x + 44;
        var xb = x + w - 10;
        var laneY = {};

        parts.push('<g class="trace-sch-tree-unit trace-sch-tree-unit--splitter-ports">');
        parts.push('<rect class="trace-sch-tree-unit-shadow" x="' + (x + 1.5) + '" y="' + (y + 2.5) +
            '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>');
        parts.push('<rect class="trace-sch-tree-unit-bg trace-sch-tree-node--' + tone + '" x="' + x + '" y="' + y +
            '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>');
        parts.push('<rect class="trace-sch-tree-unit-head" x="' + x + '" y="' + y +
            '" width="' + w + '" height="' + headH + '" rx="' + rx + '"/>');
        parts.push('<rect class="trace-sch-tree-unit-head" x="' + x + '" y="' + (y + headH - 10) +
            '" width="' + w + '" height="10"/>');
        parts.push('<rect class="trace-sch-tree-accent trace-sch-tree-accent--' + tone + '" x="' + (x + 1) +
            '" y="' + (y + 6) + '" width="3.5" height="' + (headH - 10) + '" rx="1.5"/>');
        parts.push('<text class="trace-sch-tree-type" x="' + (x + 12) + '" y="' + (y + 12) + '">' +
            schematicSvgEsc(typeShort) + '</text>');
        parts.push('<text class="trace-sch-tree-name" x="' + (x + 12) + '" y="' + (y + 24) + '">' +
            schematicSvgEsc(name) + '</text>');

        // COM — единственный вход
        parts.push('<circle cx="' + comX + '" cy="' + comY + '" r="4" fill="#06b6d4" stroke="#22d3ee" stroke-width="1.4"/>');
        parts.push('<text class="trace-sch-tree-type" x="' + comX + '" y="' + (comY - 8) +
            '" text-anchor="middle">COM</text>');
        parts.push('<line x1="' + (comX + 5) + '" y1="' + comY + '" x2="' + (xa - 6) + '" y2="' + comY +
            '" stroke="#06b6d4" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round"/>');

        usedOuts = usedOuts || {};
        for (var p = 1; p <= ratio; p++) {
            var yy = ratio <= 1 ? yMid : yTop + ((p - 1) / Math.max(1, ratio - 1)) * bandH;
            laneY[p] = yy;
            var connected = !!usedOuts[p - 1];
            var opac = connected ? 0.95 : 0.4;
            var sw = connected ? 1.7 : 1.25;
            var dash = connected ? '' : ' stroke-dasharray="3 2.5"';
            var lineStroke = connected ? stroke : schematicNormalizeFiberColor(stroke);
            // Внутренняя разводка COM → выход
            if (connected) {
                var dxIn = Math.max(8, (xa - comX - 8) * 0.55);
                parts.push('<path d="M ' + (comX + 5) + ' ' + comY +
                    ' C ' + (comX + 5 + dxIn) + ' ' + comY + ', ' +
                    (xa - dxIn) + ' ' + yy + ', ' +
                    xa + ' ' + yy +
                    '" fill="none" stroke="' + lineStroke + '" stroke-width="1.15" stroke-opacity="0.45"/>');
            }
            parts.push('<path d="M ' + xa + ' ' + yy + ' L ' + xb + ' ' + yy +
                '" fill="none" stroke="' + lineStroke + '" stroke-width="' + sw +
                '" stroke-opacity="' + opac + '" stroke-linecap="round"' + dash + '/>');
            parts.push('<circle cx="' + xa + '" cy="' + yy + '" r="' + (connected ? 2.2 : 1.7) +
                '" fill="' + lineStroke + '" fill-opacity="' + opac + '"/>');
            parts.push('<circle cx="' + xb + '" cy="' + yy + '" r="' + (connected ? 3 : 1.8) +
                '" fill="' + lineStroke + '" fill-opacity="' + opac + '"' +
                (connected ? ' stroke="#22d3ee" stroke-width="1.2"' : '') + '/>');
            parts.push('<text class="trace-sch-fiber-num' + (connected ? '' : ' trace-sch-fiber-num--free') +
                '" x="' + (xa - 4) + '" y="' + (yy + 2.8) + '" text-anchor="end">' + p + '</text>');
            if (!connected) {
                parts.push('<text class="trace-sch-tree-fate trace-sch-tree-fate--free" x="' + (xb - 14) +
                    '" y="' + (yy - 5) + '" text-anchor="end">св</text>');
            }
        }

        var usedN = 0;
        Object.keys(usedOuts).forEach(function (k) { if (usedOuts[k]) usedN++; });
        parts.push('<text class="trace-sch-tree-fiber-caption" x="' + (x + w / 2) +
            '" y="' + (y + h - 6) + '" text-anchor="middle">' +
            schematicSvgEsc('1:' + ratio + ' · ' + usedN + '/' + ratio) + '</text>');
        parts.push('</g>');

        if (node) {
            node._portLaneY = laneY;
            node._splitterPortsGeom = {
                xa: xa,
                xb: xb,
                comX: comX,
                comY: comY,
                unitL: x,
                unitR: x + w,
                unitX: x,
                unitW: w,
                yMid: yMid,
                laneY: laneY
            };
        }
        return { h: h, laneY: laneY, comX: comX, comY: comY };
    }

    /**
     * Цвет жилы, вошедшей в сплиттер (COM). У сплиттера своей палитры нет —
     * все порты/выходы наследуют этот цвет.
     */
    function resolveSchematicSplitterInputColor(model, splitterIdx) {
        if (!model || splitterIdx == null) return null;
        var best = null;
        var bestScore = -1;
        (model.segments || []).forEach(function (seg) {
            if (!seg || seg.toIdx !== splitterIdx) return;
            var fromNode = model.nodes[seg.fromIdx];
            // Каскад: цвет уже покрашенного родителя-сплиттера
            if (fromNode && fromNode.type === 'splitter' && fromNode._splitterInheritColor) {
                var parentCol = fromNode._splitterInheritColor;
                var parentScore = 200 + (seg.kind !== 'nodeLink' ? 10 : 0);
                if (parentScore > bestScore) {
                    bestScore = parentScore;
                    best = parentCol;
                }
                return;
            }
            var fibers = ensureSchematicSegmentFibers(seg, model.nodes[splitterIdx], null) || [];
            var tracedN = seg.tracedFiber != null ? Number(seg.tracedFiber) : null;
            var color = null;
            var score = 0;
            if (tracedN != null) {
                for (var i = 0; i < fibers.length; i++) {
                    if (Number(fibers[i].number) === tracedN) {
                        color = fibers[i].color;
                        break;
                    }
                }
                if (!color) color = '#06b6d4';
                score = 100 + (seg.kind !== 'nodeLink' ? 30 : (seg.cableId ? 15 : 0)) +
                    Math.min(20, fibers.length || 0);
            } else {
                for (var j = 0; j < fibers.length; j++) {
                    if (fibers[j] && fibers[j].traced) {
                        color = fibers[j].color;
                        score = 40 + (seg.kind !== 'nodeLink' ? 10 : 0);
                        break;
                    }
                }
            }
            if (color && score > bestScore) {
                bestScore = score;
                best = color;
            }
        });
        return best ? schematicNormalizeFiberColor(best) : null;
    }

    /** Перекрасить все исходящие жилы сплиттера в цвет входа (несколько проходов для каскада). */
    function paintSchematicSplitterInheritedColors(model) {
        if (!model || !model.nodes) return;
        var splitterCount = 0;
        (model.nodes || []).forEach(function (n) {
            if (n && n.type === 'splitter') splitterCount++;
        });
        var passes = Math.max(2, splitterCount + 1);
        for (var pass = 0; pass < passes; pass++) {
            (model.nodes || []).forEach(function (node, ni) {
                if (!node || node.type !== 'splitter') return;
                var col = resolveSchematicSplitterInputColor(model, ni);
                if (!col) return;
                node._splitterInheritColor = col;
                var outs = (node.object && node.object.properties)
                    ? (node.object.properties.get('outputConnections') || [])
                    : [];
                (model.segments || []).forEach(function (seg) {
                    if (!seg || seg.fromIdx !== ni) return;
                    var tap = seg.tracedFiber != null ? Number(seg.tracedFiber) : null;
                    if (tap == null && seg.splitterOutputIndex != null) {
                        var oc = outs[seg.splitterOutputIndex];
                        if (oc && oc.fiberNumber != null) tap = Number(oc.fiberNumber);
                    }
                    // Только жила посадки наследует цвет COM — не весь кабель
                    if (tap == null) return;
                    var fibers = ensureSchematicSegmentFibers(seg, model.nodes[seg.toIdx], null) || [];
                    fibers.forEach(function (f) {
                        if (f && Number(f.number) === tap) f.color = col;
                    });
                });
            });
        }
    }

    /**
     * Мосты кабелей между блоками.
     * — в кросс/муфту: посадка на жилу исходящей кассеты (сварка жN→жM)
     * — в сплиттер: только жилы, реально входящие (не веер свободных)
     * — в ONU/МК/узел: никогда не кассета на N портов
     */
    function appendTreeFiberSplices(parts, model, nodeCX, nodeCY, nodeLeft, nodeRight, nodeH, nodeIsUnit, nodeUnitH, nodeIsSplitterPorts, arrowMarkerId) {
        if (!model || !model.segments) return;
        nodeIsUnit = nodeIsUnit || [];
        nodeUnitH = nodeUnitH || [];
        nodeIsSplitterPorts = nodeIsSplitterPorts || [];

        function fiberStroke(fiber, isTraced) {
            if (isTraced) return '#06b6d4';
            return schematicNormalizeFiberColor(fiber && fiber.color);
        }

        function drawCurve(x1, y1, x2, y2, stroke, sw, opac, dash, traced, markerEnd) {
            if (!(x2 > x1 + 6)) return false;
            // Почти горизонтально — короткая дуга; иначе S-кривая без разлёта
            var dx = Math.max(16, (x2 - x1) * 0.4);
            var markerAttr = markerEnd ? ' marker-end="url(#' + markerEnd + ')"' : '';
            parts.push('<path class="trace-sch-tree-splice' + (traced ? ' trace-sch-tree-splice--traced' : '') +
                '" d="M ' + x1 + ' ' + y1 +
                ' C ' + (x1 + dx) + ' ' + y1 + ', ' +
                (x2 - dx) + ' ' + y2 + ', ' +
                x2 + ' ' + y2 +
                '" fill="none" stroke="' + stroke + '" stroke-width="' + sw +
                '" stroke-opacity="' + opac + '" stroke-linecap="round"' + (dash || '') + markerAttr + '/>');
            return true;
        }

        var splitterInputDone = {};

        (model.segments || []).forEach(function (seg) {
            if (!seg || !seg._ribbonGeom) return;
            if (seg.kind === 'nodeLink' && !seg.cableId) return;
            var fi = seg.fromIdx;
            var ti = seg.toIdx;
            if (fi == null || ti == null) return;
            if (!nodeIsUnit[fi] && !nodeIsSplitterPorts[fi]) return;

            var g = seg._ribbonGeom;
            var fromNodeSp = model.nodes[fi];
            // Сплиттер→муфта/кросс: жила только из outputConnections (не чужой tracedFiber трассы)
            if (fromNodeSp && fromNodeSp.type === 'splitter' && nodeIsSplitterPorts[fi]) {
                syncSplitterSegmentToOutputConn(seg, fromNodeSp);
                if (g._tapFiber != null) {
                    seg.tracedFiber = Number(g._tapFiber);
                } else if (seg.splitterOutputIndex != null && fromNodeSp.object &&
                    fromNodeSp.object.properties) {
                    var outsFix = fromNodeSp.object.properties.get('outputConnections') || [];
                    var ocFix = outsFix[seg.splitterOutputIndex];
                    if (ocFix && ocFix.fiberNumber != null) {
                        seg.tracedFiber = Number(ocFix.fiberNumber);
                        g._tapFiber = Number(ocFix.fiberNumber);
                    }
                }
            }
            var toNode = model.nodes[ti];
            if (isSchematicSinglePortEndpoint(toNode)) {
                // ONU и т.п. — одна жила (трасса), не 8 портов
                var fibersEp = ensureSchematicSegmentFibers(seg, toNode, null) || [];
                var tracedEp = null;
                for (var ei = 0; ei < fibersEp.length; ei++) {
                    var fe = fibersEp[ei];
                    if (fe && (fe.traced || Number(seg.tracedFiber) === Number(fe.number))) {
                        tracedEp = fe;
                        break;
                    }
                }
                if (!tracedEp && seg.tracedFiber != null) {
                    tracedEp = { number: seg.tracedFiber, color: '#06b6d4', traced: true };
                }
                if (!tracedEp) return;
                var y1e = g.laneY[Number(tracedEp.number)];
                if (y1e == null) y1e = g.yMid;
                var xLeaveE = nodeRight[fi] != null ? nodeRight[fi] : (g.unitR != null ? g.unitR : g.xb);
                var xEnterE = (nodeLeft[ti] != null ? nodeLeft[ti] : xLeaveE + 40);
                var y2e = nodeCY[ti] || y1e;
                if (g.xb != null && g.xb < xLeaveE - 2) {
                    parts.push('<path d="M ' + g.xb + ' ' + y1e + ' L ' + xLeaveE + ' ' + y1e +
                        '" fill="none" stroke="#06b6d4" stroke-width="2.4" stroke-linecap="round"/>');
                }
                drawCurve(xLeaveE, y1e, xEnterE, y2e, '#06b6d4', 2.6, 1, '', true);
                parts.push('<circle cx="' + xEnterE + '" cy="' + y2e + '" r="3.2" fill="#06b6d4" stroke="#06b6d4" stroke-width="1.2"/>');
                return;
            }

            if (!nodeIsUnit[ti] && !nodeIsSplitterPorts[ti]) return;

            var toSplitter = toNode && toNode.type === 'splitter';
            // На каждый сплиттер — ровно один вход (не ж1 и ж8 сразу)
            if (toSplitter && splitterInputDone[ti]) return;

            var patch = isSchematicPatchHost(toNode);
            var outRibbon = null;
            var outSeg = null;
            if (patch) {
                for (var oi = 0; oi < (model.segments || []).length; oi++) {
                    var os = model.segments[oi];
                    if (os && os.fromIdx === ti && os._ribbonGeom &&
                        (os.kind !== 'nodeLink' || os.cableId)) {
                        outSeg = os;
                        outRibbon = os._ribbonGeom;
                        break;
                    }
                }
            }

            // Для входа в сплиттер берём только primaryOut источника (кассета на кроссе)
            if (toSplitter) {
                var primFrom = null;
                for (var pi = 0; pi < (model.segments || []).length; pi++) {
                    var ps = model.segments[pi];
                    if (ps && ps.fromIdx === fi && ps._ribbonGeom &&
                        (ps.kind !== 'nodeLink' || ps.cableId)) {
                        // тот же geom, что нарисован в кассете
                        if (ps === seg || (ps.cableId && seg.cableId && ps.cableId === seg.cableId)) {
                            primFrom = ps;
                            break;
                        }
                    }
                }
                if (primFrom && primFrom !== seg && seg.kind === 'nodeLink') return;
            }

            var xLeave = nodeRight[fi] != null ? nodeRight[fi] : (g.unitR != null ? g.unitR : g.xb);
            var xEnter;
            if (toSplitter) {
                xEnter = (nodeLeft[ti] != null ? nodeLeft[ti] : xLeave + 40) + 10;
            } else if (outRibbon) {
                xEnter = outRibbon.xa;
            } else {
                xEnter = (nodeLeft[ti] != null ? nodeLeft[ti] : xLeave + 40) + 18;
            }
            if (!(xEnter > xLeave + 8)) return;

            var outCableId = outSeg && outSeg.cableId ? outSeg.cableId : null;
            // Fate относительно РЕАЛЬНО исходящего кабеля кассеты — не null
            var fibers = ensureSchematicSegmentFibers(seg, toNode, outCableId);
            if (!fibers.length) return;

            var sorted = fibers.slice().sort(function (a, b) {
                return (Number(a.number) || 0) - (Number(b.number) || 0);
            });

            var uh = nodeUnitH[ti] || nodeH || 80;
            var cy = nodeCY[ti] || 0;
            var bodyTop = cy - uh / 2 + 32;
            var bodyBot = cy + uh / 2 - 14;
            var labelItems = [];
            var cxGap = (xLeave + xEnter) / 2;
            var curveMaxY = cy;

            // Одна трассовая жила в сплиттер
            var tracedFiber = null;
            if (toSplitter) {
                for (var tf = 0; tf < sorted.length; tf++) {
                    var fnd = sorted[tf];
                    if (fnd && (fnd.traced || Number(seg.tracedFiber) === Number(fnd.number))) {
                        tracedFiber = fnd;
                        break;
                    }
                }
                if (!tracedFiber && seg.tracedFiber != null) {
                    tracedFiber = { number: seg.tracedFiber, color: '#06b6d4', traced: true };
                }
                if (!tracedFiber) return;
                splitterInputDone[ti] = true;

                var y1s = g.laneY[Number(tracedFiber.number)];
                if (y1s == null) y1s = g.yMid;
                // Вход только на COM — не на порт выхода 1
                var y2s = y1s;
                var spGeom = nodeIsSplitterPorts[ti] && model.nodes[ti]
                    ? model.nodes[ti]._splitterPortsGeom
                    : null;
                if (spGeom && spGeom.comY != null) {
                    y2s = spGeom.comY;
                    xEnter = spGeom.comX != null ? spGeom.comX : xEnter;
                } else {
                    y2s = Math.max(bodyTop, Math.min(bodyBot, (bodyTop + bodyBot) / 2));
                }
                if (g.xb != null && g.xb < xLeave - 2) {
                    parts.push('<path d="M ' + g.xb + ' ' + y1s + ' L ' + xLeave + ' ' + y1s +
                        '" fill="none" stroke="#06b6d4" stroke-width="2.5" stroke-linecap="round"/>');
                }
                // Вход сплиттера на COM — без стрелки-маркера (она выглядела как мусор у кросса)
                drawCurve(xLeave, y1s, xEnter, y2s, '#06b6d4', 2.7, 1, '', true, null);
                var inBadge = 'вход';
                if (tracedFiber.number != null) inBadge = 'вход·ж' + tracedFiber.number;
                var ibx = xLeave + (xEnter - xLeave) * 0.62;
                var iby = y1s + (y2s - y1s) * 0.62 - 11;
                var ibTw = Math.min(72, 12 + inBadge.length * 6.2);
                parts.push('<rect class="trace-sch-tree-edge-badge" x="' + (ibx - ibTw / 2) +
                    '" y="' + (iby - 7.5) + '" width="' + ibTw + '" height="15" rx="7"/>');
                parts.push('<text class="trace-sch-tree-edge-text" x="' + ibx + '" y="' + (iby + 3.5) +
                    '" text-anchor="middle">' + schematicSvgEsc(inBadge) + '</text>');
                // остальные жилы — короткий хвост у края кросса
                sorted.forEach(function (fiber) {
                    if (!fiber || Number(fiber.number) === Number(tracedFiber.number)) return;
                    var yStub = g.laneY[Number(fiber.number)];
                    if (yStub == null) return;
                    if (g.xb != null && g.xb < xLeave - 1) {
                        parts.push('<path d="M ' + g.xb + ' ' + yStub + ' L ' + xLeave + ' ' + yStub +
                            '" fill="none" stroke="' + fiberStroke(fiber, false) +
                            '" stroke-width="1.2" stroke-opacity="0.4" stroke-linecap="round" stroke-dasharray="3 2.5"/>');
                    }
                });
                return;
            }

            var drawOrder = sorted.slice().sort(function (a, b) {
                return (a.traced ? 1 : 0) - (b.traced ? 1 : 0);
            });

            var fromIsSplitterPorts = !!nodeIsSplitterPorts[fi];

            drawOrder.forEach(function (fiber) {
                if (!fiber) return;
                // Выдуманные отводы (не из трассы) не красить как трассируемую жилу
                var segOnPath = seg.onTracePath !== false && !seg.invented;
                var isTraced = segOnPath && (
                    !!fiber.traced || (seg.tracedFiber != null && Number(seg.tracedFiber) === Number(fiber.number))
                );
                // Со сплиттера на муфту/кросс — только жила выхода (ж4 / ж2), без чужих сварок кассеты
                if (fromIsSplitterPorts && !isTraced) return;
                var fate = fiber.fate;
                var isFree = !!(fate && fate.kind === 'free' && !isTraced);

                // Свободные — только короткий хвост у источника, без посадки на чужую кассету
                if (isFree) {
                    var yFree = g.laneY[Number(fiber.number)];
                    if (yFree != null && g.xb != null && g.xb < xLeave - 1) {
                        parts.push('<path d="M ' + g.xb + ' ' + yFree + ' L ' + xLeave + ' ' + yFree +
                            '" fill="none" stroke="' + fiberStroke(fiber, false) +
                            '" stroke-width="1.2" stroke-opacity="0.35" stroke-linecap="round" stroke-dasharray="3 2.5"/>');
                    }
                    return;
                }

                // Мост на исходящую кассету — только если сварка реально на этот кабель
                var peerOnOut = !!(fate && fate.peerCableId && outCableId &&
                    String(fate.peerCableId) === String(outCableId) && fate.peerFiber != null);
                var peerFiber = null;
                if (peerOnOut) {
                    peerFiber = Number(fate.peerFiber);
                } else if (isTraced && outRibbon && outRibbon.laneY[Number(fiber.number)] != null) {
                    // Та же жN на исходящей кассете — не подменять чужим outSeg.tracedFiber
                    // (иначе сплиттер1→ж4 и сплиттер2→ж2 оба садились на ж2 трассы)
                    peerFiber = Number(fiber.number);
                    peerOnOut = true;
                } else if (isTraced && outSeg && outSeg.tracedFiber != null &&
                    Number(fiber.number) === Number(outSeg.tracedFiber) && outRibbon) {
                    // Продолжение той же трассовой жилы, если совпадает номер
                    peerFiber = Number(outSeg.tracedFiber);
                    peerOnOut = true;
                }

                if (!peerOnOut || peerFiber == null) {
                    // Ветка на другой кабель / нет peer — не рисовать фантом на outRibbon
                    var yStubOnly = g.laneY[Number(fiber.number)];
                    if (yStubOnly != null && g.xb != null && g.xb < xLeave - 1) {
                        parts.push('<path d="M ' + g.xb + ' ' + yStubOnly + ' L ' + xLeave + ' ' + yStubOnly +
                            '" fill="none" stroke="' + fiberStroke(fiber, isTraced) +
                            '" stroke-width="' + (isTraced ? 2 : 1.3) +
                            '" stroke-opacity="0.55" stroke-linecap="round"/>');
                    }
                    return;
                }

                var y1 = g.laneY[Number(fiber.number)];
                if (y1 == null) y1 = g.yMid;

                var y2;
                if (outRibbon) {
                    y2 = outRibbon.laneY[peerFiber];
                    if (y2 == null) return; // нет такой жилы на исходящей кассете
                } else {
                    y2 = y1;
                }

                if (g.xb != null && g.xb < xLeave - 2) {
                    parts.push('<path d="M ' + g.xb + ' ' + y1 + ' L ' + xLeave + ' ' + y1 +
                        '" fill="none" stroke="' + fiberStroke(fiber, isTraced) +
                        '" stroke-width="' + (isTraced ? 2.4 : 1.35) +
                        '" stroke-opacity="' + (isTraced ? 1 : 0.75) + '" stroke-linecap="round"/>');
                }

                var stroke = fiberStroke(fiber, isTraced);
                var sw = isTraced ? 2.7 : 1.5;
                var opac = isTraced ? 1 : 0.8;
                if (!drawCurve(xLeave, y1, xEnter, y2, stroke, sw, opac, '', isTraced)) return;

                if (outRibbon) {
                    var xOnFiber = Math.min(xEnter + 14, (outRibbon.xb != null ? outRibbon.xb : xEnter + 14));
                    parts.push('<path d="M ' + xEnter + ' ' + y2 + ' L ' + xOnFiber + ' ' + y2 +
                        '" fill="none" stroke="' + stroke + '" stroke-width="' + sw +
                        '" stroke-opacity="' + opac + '" stroke-linecap="round"/>');
                }

                parts.push('<circle cx="' + xEnter + '" cy="' + y2 + '" r="' + (isTraced ? 3.3 : 2) +
                    '" fill="' + stroke + '" fill-opacity="' + opac + '"' +
                    (isTraced ? ' stroke="#06b6d4" stroke-width="1.3"' : '') + '/>');

                curveMaxY = Math.max(curveMaxY, y1, y2);
                if (isTraced || Number(peerFiber) !== Number(fiber.number)) {
                    labelItems.push({
                        text: Number(peerFiber) !== Number(fiber.number)
                            ? ('ж' + fiber.number + '→ж' + peerFiber)
                            : ('ж' + fiber.number),
                        traced: isTraced,
                        yMid: (y1 + y2) / 2,
                        x: cxGap
                    });
                }
            });

            if (labelItems.length) {
                labelItems.sort(function (a, b) {
                    if (a.traced !== b.traced) return a.traced ? -1 : 1;
                    return String(a.text).localeCompare(String(b.text), 'ru');
                });
                var show = labelItems.filter(function (it) {
                    return it.traced || (it.text && it.text.indexOf('→') >= 0);
                });
                var hostBot = cy + uh / 2;
                var startY = Math.max(hostBot + 10, curveMaxY + 8);
                show.forEach(function (it, li) {
                    parts.push('<text class="trace-sch-tree-splice-label' +
                        (it.traced ? ' trace-sch-tree-splice-label--traced' : '') +
                        '" x="' + (it.x || cxGap) + '" y="' + (startY + li * 11) +
                        '" text-anchor="middle">' + schematicSvgEsc(it.text) + '</text>');
                });
            }
        });
    }

    function pushTreeEdgeBadge(badgeParts, xLeft, xRight, yLine, text, fiberMeta, extraClass) {
        // Для кабелей с кассетой жил подпись уже под кассетой
        if (fiberMeta && fiberMeta._bandH) return;
        if (!text) return;
        var t = String(text || '');
        if (t.length > 14) t = t.slice(0, 12) + '…';
        var tw = Math.min(86, 11 + t.length * 5.8);
        var th = 15;
        var gap = xRight - xLeft;
        if (gap < tw + 8) {
            tw = Math.min(tw, Math.max(24, gap - 6));
            if (tw < 22) return;
        }
        var lx = (xLeft + xRight) / 2;
        lx = Math.max(xLeft + tw / 2 + 2, Math.min(xRight - tw / 2 - 2, lx));
        var ly = yLine - 13;
        // Отложенная геометрия — разведём наслаивания перед отрисовкой
        badgeParts.push({
            x: lx,
            y: ly,
            tw: tw,
            th: th,
            text: t,
            extraClass: extraClass || ''
        });
    }

    function flushTreeEdgeBadges(parts, badgeParts) {
        if (!badgeParts || !badgeParts.length) return;
        var items = badgeParts.filter(function (b) { return b && b.text; });
        // одинаковый текст в одной точке — оставить один
        var seen = {};
        items = items.filter(function (b) {
            var key = b.text + '@' + Math.round(b.x / 8) + ':' + Math.round(b.y / 8);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        items.sort(function (a, b) {
            return (a.y - b.y) || (a.x - b.x);
        });
        var minGap = 22;
        function overlaps(a, b) {
            return Math.abs(a.x - b.x) < (a.tw + b.tw) * 0.55 &&
                Math.abs(a.y - b.y) < minGap;
        }
        // несколько проходов: сдвигаем вниз, затем вбок
        for (var pass = 0; pass < 6; pass++) {
            for (var i = 1; i < items.length; i++) {
                var prev = items[i - 1];
                var cur = items[i];
                if (!overlaps(prev, cur)) continue;
                if (pass < 2) {
                    cur.y = prev.y + minGap;
                } else {
                    cur.x = prev.x + (prev.tw + cur.tw) * 0.52 + 6;
                    if (Math.abs(cur.y - prev.y) < minGap * 0.6) cur.y = prev.y + minGap;
                }
            }
            items.sort(function (a, b) {
                return (a.y - b.y) || (a.x - b.x);
            });
        }
        items.forEach(function (b) {
            parts.push('<rect class="trace-sch-tree-edge-badge' + b.extraClass +
                '" x="' + (b.x - b.tw / 2) + '" y="' + (b.y - b.th / 2) +
                '" width="' + b.tw + '" height="' + b.th + '" rx="7"/>');
            parts.push('<text class="trace-sch-tree-edge-text" x="' + b.x + '" y="' + (b.y + 3.5) +
                '" text-anchor="middle">' + schematicSvgEsc(b.text) + '</text>');
        });
        badgeParts.length = 0;
    }

    /** Оставить ← вых.N только у реальных назначений выходов сплиттера. */
    function normalizeSchematicOutputLabels(model) {
        if (!model || !model.nodes || !model.segments) return model;
        model.nodes.forEach(function (n) {
            if (n) n.fromSplitterOutput = null;
        });
        model.segments.forEach(function (seg) {
            if (!seg || seg.splitterOutputIndex == null) return;
            var from = model.nodes[seg.fromIdx];
            var to = model.nodes[seg.toIdx];
            if (!from || from.type !== 'splitter' || !to) return;
            // не подписывать «назад» на стволовой кросс / сам сплиттер-источник
            if (to.type === 'splitter' && getUid(to.object) === getUid(from.object)) return;
            if (String(to.id || '').indexOf('#p') < 0 &&
                from.embeddedInHost && to.object && getUid(to.object) === getUid(from.embeddedInHost)) {
                return;
            }
            to.fromSplitterOutput = Number(seg.splitterOutputIndex) + 1;
            if (seg.crossPort != null && to.port == null) to.port = seg.crossPort;
        });
        return model;
    }

    function schematicTreeEdgeLabel(seg, compact) {
        if (!seg) return '';
        if (seg.splitterOutputIndex != null) {
            var outLbl = 'вых.' + (Number(seg.splitterOutputIndex) + 1);
            if (seg.crossPort != null) outLbl += '→п.' + seg.crossPort;
            if (compact) return outLbl;
            if (seg.lengthM != null) return outLbl + ' · ' + seg.lengthM + ' м';
            return outLbl;
        }
        if (seg.linkLabel && String(seg.linkLabel).indexOf('вых.') === 0) {
            return String(seg.linkLabel);
        }
        if (seg.kind === 'nodeLink') {
            if (compact) {
                if (seg.linkLabel && String(seg.linkLabel).length <= 12) return String(seg.linkLabel);
                if (seg.tracedFiber != null) return 'ж' + seg.tracedFiber;
                return '';
            }
            if (seg.linkLabel) return String(seg.linkLabel);
            if (seg.tracedFiber != null) return 'ж' + seg.tracedFiber;
            return '';
        }
        // Как в линейной схеме: имя / жN · NF · длина
        var bits = [];
        if (seg.tracedFiber != null) bits.push('ж' + seg.tracedFiber);
        if (seg.fiberCount > 1) bits.push(seg.fiberCount + 'F');
        if (seg.lengthM != null) bits.push(seg.lengthM + ' м');
        if (!bits.length && seg.cableName) {
            var short = String(seg.cableName).split('·')[0].trim();
            if (short.length > 18) short = short.slice(0, 16) + '…';
            return short;
        }
        if (compact) return bits.slice(0, 2).join(' · ');
        return bits.join(' · ');
    }

    function schematicTreeTypeShort(type) {
        var map = {
            olt: 'OLT',
            cross: 'Кросс',
            sleeve: 'Муфта',
            spliceCassette: 'Кассета',
            splitter: 'Сплиттер',
            onu: 'ONU',
            node: 'Узел',
            mediaConverter: 'МК',
            radioBridge: 'РМ'
        };
        return map[type] || getTypeName(type);
    }

    function schematicTreeStageTitle(nodesAtDepth) {
        if (!nodesAtDepth || !nodesAtDepth.length) return '';
        var counts = {};
        nodesAtDepth.forEach(function (node) {
            var t = node.type || 'object';
            counts[t] = (counts[t] || 0) + 1;
        });
        var kindN = Object.keys(counts).length;
        if (counts.olt && kindN === 1) return 'OLT';
        if (counts.splitter && kindN === 1) return 'Сплиттер';
        if ((counts.cross || counts.sleeve || counts.spliceCassette) && kindN === 1) return 'Кросс / муфта';
        if (counts.onu && kindN === 1) return 'ONU';
        if (counts.splitter && (counts.onu || counts.cross || counts.node)) return 'Сплиттер и далее';
        if (counts.onu || counts.node || counts.mediaConverter || counts.radioBridge) return 'Окончания';
        if (kindN > 1) return 'Узлы';
        return '';
    }

    function schematicTreeNodeTone(type) {
        if (type === 'olt') return 'olt';
        if (type === 'splitter') return 'splitter';
        if (type === 'onu') return 'onu';
        if (type === 'cross' || type === 'sleeve' || type === 'spliceCassette') return 'host';
        return 'other';
    }

    function schematicModelNeedsTreeSvg(model) {
        if (!model || !model.nodes || !model.nodes.length) return false;
        if (model.tree || model.merged) return true;
        var outDeg = {};
        (model.segments || []).forEach(function (s) {
            if (!s) return;
            outDeg[s.fromIdx] = (outDeg[s.fromIdx] || 0) + 1;
        });
        return Object.keys(outDeg).some(function (k) { return outDeg[k] > 1; });
    }

    function drainSchematicTreeSvgGen(gen) {
        var next = gen.next();
        while (!next.done) {
            next = gen.next();
        }
        return next.value || '';
    }

    function runSchematicTreeSvgGenAsync(gen, ctl) {
        return (async function () {
            var next = gen.next();
            var step = 0;
            while (!next.done) {
                if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';
                step++;
                var info = next.value || {};
                if (ctl && ctl.setProgress) {
                    // null progress → indeterminate pulse (видно, что не зависло)
                    ctl.setProgress(
                        info.title || 'Рисуем схему…',
                        info.hint || ('Кадр ' + step),
                        info.pct != null ? info.pct : null
                    );
                }
                await yieldSchematicBuild(info.waitMs != null ? info.waitMs : 0);
                next = gen.next();
            }
            return next.value || '';
        })();
    }

    function renderTraceSchematicSvg(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';
        if (schematicModelNeedsTreeSvg(model)) {
            return drainSchematicTreeSvgGen(renderTraceSchematicTreeSvgGen(model));
        }
        return renderTraceSchematicLinearSvg(model);
    }

    function renderTraceSchematicSvgAsync(model, ctl) {
        return (async function () {
            if (!model || !model.nodes || !model.nodes.length) return '';

            var segs = model.segments || [];
            if (segs.length) {
                var ok = await runSchematicWorkSlices(segs.length, function (i) {
                    var s = segs[i];
                    if (s && s.cableId) {
                        ensureSchematicSegmentFibers(s, model.nodes[s.toIdx], null);
                    }
                }, ctl, {
                    budgetMs: 8,
                    label: 'Рисуем схему…',
                    hintPrefix: 'Готовим жилы',
                    progressFrom: 91,
                    progressTo: 95
                });
                if (!ok) return '';
            }

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Рисуем схему…', 'Собираем SVG', null);
            }
            await yieldSchematicBuild(24);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            if (schematicModelNeedsTreeSvg(model)) {
                return runSchematicTreeSvgGenAsync(renderTraceSchematicTreeSvgGen(model), ctl);
            }
            return renderTraceSchematicLinearSvg(model);
        })();
    }

    function renderTraceSchematicLinearSvg(model) {
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
                topLbl = seg.linkLabel || ('ж' + seg.tracedFiber + (seg.fromNode ? ' · с узла' : ' · на узел'));
            } else {
                var shortName = (seg.cableName || 'Кабель').split('·')[0].trim();
                if (shortName.length > 22) shortName = shortName.slice(0, 20) + '…';
                topLbl = shortName + (seg.fiberCount ? ' · ' + seg.fiberCount + 'F' : '') +
                    (lenTxt ? ' · ' + lenTxt : '');
            }
            parts.push('<text class="trace-sch-cable-label' + (seg.kind === 'nodeLink' ? ' trace-sch-cable-label--link' : '') +
                '" x="' + midX + '" y="' + (padTop - 6) + '" text-anchor="middle">' +
                schematicSvgEsc(topLbl) + '</text>');

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

    function* renderTraceSchematicTreeSvgGen(model) {
        yield { hint: 'Раскладка дерева', pct: null, waitMs: 0 };
        var layout = computeSchematicTreeLayout(model);
        yield { hint: 'Считаем размеры узлов', pct: null, waitMs: 0 };
        var blockW = 180;
        var spliceGap = 120;
        var smallNodeW = 108;
        var smallNodeH = 48;
        var headH = 28;

        var outsByNode = {};
        (model.segments || []).forEach(function (seg) {
            if (!seg || seg.fromIdx == null) return;
            if (!outsByNode[seg.fromIdx]) outsByNode[seg.fromIdx] = [];
            outsByNode[seg.fromIdx].push(seg);
        });

        function segmentFiberScore(s) {
            if (!s) return -1;
            var fc = Number(s.fiberCount) || (s.fibers && s.fibers.length) || 0;
            if (!fc && s.cableId) {
                ensureSchematicSegmentFibers(s, model.nodes[s.toIdx], null);
                fc = Number(s.fiberCount) || (s.fibers && s.fibers.length) || 0;
            }
            var score = fc * 10;
            if (s.kind !== 'nodeLink') score += 100;
            else if (s.cableId) score += 40;
            else return -1;
            var to = model.nodes[s.toIdx];
            if (to && (to.type === 'splitter' || to.type === 'sleeve' || to.type === 'cross')) score += 5;
            if (s.tracedFiber != null) score += 1;
            if (s.lengthM != null) score += 2;
            return score;
        }

        function primaryOut(ni) {
            var list = outsByNode[ni] || [];
            var best = null;
            var bestScore = -1;
            for (var i = 0; i < list.length; i++) {
                var sc = segmentFiberScore(list[i]);
                if (sc > bestScore) {
                    bestScore = sc;
                    best = list[i];
                }
            }
            return best;
        }

        function nextCableAfter(toIdx) {
            var list = outsByNode[toIdx] || [];
            for (var i = 0; i < list.length; i++) {
                if (list[i] && list[i].kind !== 'nodeLink' && list[i].cableId) {
                    return list[i].cableId;
                }
            }
            for (var j = 0; j < list.length; j++) {
                if (list[j] && list[j].cableId) return list[j].cableId;
            }
            return null;
        }

        var maxUnitH = smallNodeH;
        (model.nodes || []).forEach(function (node, ni) {
            var outSeg = primaryOut(ni);
            if (!outSeg) return;
            var toNode = model.nodes[outSeg.toIdx];
            var h = headH + estimateTreeFiberBandH(outSeg, toNode, nextCableAfter(outSeg.toIdx)) + 6;
            if (h > maxUnitH) maxUnitH = h;
        });

        // Веер после сплиттера: шире колонки и больше воздуха по вертикали
        var maxFan = 1;
        var densestDepth = 1;
        var depthCount = {};
        (model.nodes || []).forEach(function (_n, ni) {
            var ch = (layout.children && layout.children[ni]) || [];
            if (ch.length > maxFan) maxFan = ch.length;
            var d = layout.depth[ni];
            depthCount[d] = (depthCount[d] || 0) + 1;
        });
        Object.keys(depthCount).forEach(function (dk) {
            densestDepth = Math.max(densestDepth, depthCount[dk] || 0);
        });

        var fanWide = maxFan >= 6 || densestDepth >= 6;
        // Шире зазор между колонками — кривые и «вых.N» не сжимаются
        var spliceGapUse = fanWide ? Math.max(spliceGap, 168) : (maxFan >= 4 ? Math.max(spliceGap, 140) : spliceGap);
        var colW = blockW + spliceGapUse;
        var rowPitch = fanWide ? 64 : 52;
        var colGapY = fanWide ? 36 : 22;
        var groupGapY = fanWide ? 52 : 34;
        var padX = 18;
        var stageH = 22;
        var padTop = 28 + stageH;
        var padBot = 64;
        var padY = 14;

        var nodeCX = [];
        var nodeCY = [];
        var nodeLeft = [];
        var nodeRight = [];
        var nodeIsUnit = [];
        var nodeIsSplitterPorts = [];
        var nodeUnitH = [];
        var nodeUnitW = [];
        var byDepth = {};
        var byDepthIdx = {};

        // Цвета входа сплиттера — до раскладки/отрисовки портов
        paintSchematicSplitterInheritedColors(model);

        for (var i = 0; i < model.nodes.length; i++) {
            var out0 = primaryOut(i);
            // Кассета только у OLT/кросс/муфта/сплиттер с исходящим кабелем — не у ONU
            var isUnit = !!out0 && segmentFiberScore(out0) >= 40 &&
                !isSchematicSinglePortEndpoint(model.nodes[i]);
            nodeIsUnit[i] = isUnit;
            nodeIsSplitterPorts[i] = false;
            if (isUnit) {
                var tn = model.nodes[out0.toIdx];
                nodeUnitH[i] = headH + estimateTreeFiberBandH(out0, tn, nextCableAfter(out0.toIdx)) + 6;
                nodeUnitW[i] = blockW;
            } else {
                var inSegH = null;
                for (var s0 = 0; s0 < (model.segments || []).length; s0++) {
                    var sg0 = model.segments[s0];
                    if (sg0 && sg0.kind !== 'nodeLink' && sg0.toIdx === i && primaryOut(sg0.fromIdx)) {
                        inSegH = sg0;
                        break;
                    }
                }
                if (inSegH) {
                    nodeUnitH[i] = Math.max(
                        smallNodeH,
                        headH + estimateTreeFiberBandH(inSegH, model.nodes[i], null) + 8
                    );
                    nodeUnitW[i] = Math.max(smallNodeW, 118);
                } else {
                    nodeUnitH[i] = smallNodeH;
                    nodeUnitW[i] = smallNodeW;
                }
            }
            // Сплиттер всегда — кассета логических выходов 1…N (не жилы исходящего кабеля)
            if (model.nodes[i] && model.nodes[i].type === 'splitter') {
                var ratioSp = schematicSplitterRatio(model.nodes[i]);
                var portsH = headH + estimateTreeSplitterPortsH(ratioSp) + 6;
                nodeIsSplitterPorts[i] = true;
                nodeIsUnit[i] = false;
                nodeUnitH[i] = Math.max(nodeUnitH[i] || 0, portsH);
                nodeUnitW[i] = Math.max(nodeUnitW[i] || 0, blockW);
            }
            nodeCX[i] = padX + layout.depth[i] * colW + colW / 2;
            nodeCY[i] = padTop + padY + layout.y[i] * rowPitch;
            var dKey = String(layout.depth[i]);
            if (!byDepthIdx[dKey]) byDepthIdx[dKey] = [];
            byDepthIdx[dKey].push(i);
            if (i > 0 && (i % 8) === 0) {
                yield { hint: 'Узлы ' + (i + 1) + ' / ' + model.nodes.length, pct: null, waitMs: 0 };
            }
        }

        yield { hint: 'Упаковка колонок', pct: null, waitMs: 0 };

        function schematicPackWeight(ni) {
            if (nodeIsSplitterPorts[ni]) return 3;
            if ((layout.children[ni] || []).length > 0) return 2;
            var h = nodeUnitH[ni] || smallNodeH;
            if (h > smallNodeH + 36) return 2;
            var t = model.nodes[ni] && model.nodes[ni].type;
            if (t === 'sleeve' || t === 'cross' || t === 'spliceCassette') return 2;
            return 1;
        }

        function isCompactEndpoint(ni) {
            var t = model.nodes[ni] && model.nodes[ni].type;
            return t === 'onu' || t === 'mediaConverter' || t === 'node' ||
                isSchematicSinglePortEndpoint(model.nodes[ni]);
        }

        function isHostLike(ni) {
            if (nodeIsSplitterPorts[ni]) return true;
            var t = model.nodes[ni] && model.nodes[ni].type;
            return t === 'splitter' || t === 'sleeve' || t === 'cross' ||
                t === 'spliceCassette';
        }

        Object.keys(byDepthIdx).forEach(function (dk) {
            var idxs = byDepthIdx[dk].slice();
            idxs.sort(function (a, b) {
                return (layout.y[a] - layout.y[b]) || (a - b);
            });
            var cursor = padTop + padY;
            // Единый крупный зазор ONU ↔ сплиттер/муфта/кросс
            var hostGapY = fanWide ? 58 : 46;
            idxs.forEach(function (ni, ix) {
                var h = nodeUnitH[ni] || smallNodeH;
                nodeCY[ni] = cursor + h / 2;
                var nextNi = idxs[ix + 1];
                var gap = colGapY;
                if (nextNi != null) {
                    var onuPair = isCompactEndpoint(ni) && isCompactEndpoint(nextNi) &&
                        schematicPackWeight(ni) === 1 && schematicPackWeight(nextNi) === 1;
                    var onuToHost = (isCompactEndpoint(ni) && isHostLike(nextNi)) ||
                        (isHostLike(ni) && isCompactEndpoint(nextNi));
                    var hostToHost = isHostLike(ni) && isHostLike(nextNi);
                    if (onuPair) {
                        gap = fanWide ? 14 : 10;
                    } else if (onuToHost || hostToHost) {
                        gap = hostGapY;
                    } else {
                        var nextH = nodeUnitH[nextNi] || smallNodeH;
                        gap += Math.min(28, Math.round((h + nextH) * 0.06));
                        var w0 = schematicPackWeight(ni);
                        var w1 = schematicPackWeight(nextNi);
                        if (w0 !== w1) gap = Math.max(gap, groupGapY);
                        if (w0 >= 2) gap += 10;
                        if (w1 >= 2) gap += 8;
                    }
                }
                cursor += h + gap;
            });
            byDepth[dk] = idxs.map(function (ni) { return model.nodes[ni]; });
        });

        // Родителя к центру детей — только компактные узлы (не высокие кассеты)
        for (var pass = 0; pass < 2; pass++) {
            for (var pi = 0; pi < model.nodes.length; pi++) {
                if (nodeIsUnit[pi]) continue;
                if ((nodeUnitH[pi] || smallNodeH) > smallNodeH + 20) continue;
                var kids = layout.children[pi] || [];
                if (kids.length < 2) continue;
                var sum = 0;
                kids.forEach(function (k) { sum += nodeCY[k]; });
                var target = sum / kids.length;
                var half = (nodeUnitH[pi] || smallNodeH) / 2;
                var ok = true;
                var trialTop = target - half;
                var trialBot = target + half;
                for (var qi = 0; qi < model.nodes.length; qi++) {
                    if (layout.depth[qi] !== layout.depth[pi] || qi === pi) continue;
                    var oh = (nodeUnitH[qi] || smallNodeH) / 2;
                    var oTop = nodeCY[qi] - oh;
                    var oBot = nodeCY[qi] + oh;
                    if (!(trialBot + colGapY <= oTop || trialTop >= oBot + colGapY)) {
                        ok = false;
                        break;
                    }
                }
                if (ok && target > padTop) nodeCY[pi] = target;
            }
        }

        for (var j = 0; j < model.nodes.length; j++) {
            var wj = nodeUnitW[j] || (nodeIsUnit[j] || nodeIsSplitterPorts[j] ? blockW : smallNodeW);
            nodeLeft[j] = nodeCX[j] - wj / 2;
            nodeRight[j] = nodeCX[j] + wj / 2;
            // Предрасчёт Y портов сплиттера — для веера рёбер
            if (nodeIsSplitterPorts[j] && model.nodes[j]) {
                var ratioPre = schematicSplitterRatio(model.nodes[j]);
                var uhPre = nodeUnitH[j] || smallNodeH;
                var yTopCard = nodeCY[j] - uhPre / 2;
                var bandEst = Math.min(280, estimateTreeSplitterPortsH(ratioPre) - 24 - 16);
                if (bandEst < 14) bandEst = 14;
                var yMidPre = yTopCard + headH + 2 + (uhPre - headH - 16) / 2;
                var yTopPorts = yMidPre - bandEst / 2;
                var lanePre = {};
                for (var pp = 1; pp <= ratioPre; pp++) {
                    lanePre[pp] = ratioPre <= 1 ? yMidPre
                        : yTopPorts + ((pp - 1) / Math.max(1, ratioPre - 1)) * bandEst;
                }
                model.nodes[j]._portLaneY = lanePre;
            }
        }

        var contentBottom = padTop + padY;
        for (var bi = 0; bi < model.nodes.length; bi++) {
            contentBottom = Math.max(
                contentBottom,
                nodeCY[bi] + (nodeUnitH[bi] || smallNodeH) / 2
            );
        }
        var width = padX * 2 + (layout.maxDepth + 1) * colW;
        var height = contentBottom + padBot;

        var parts = [];
        var badgeParts = [];

        function elbow(x0, y0, x1, y1, busX) {
            var bx = busX != null ? busX : (x0 + x1) / 2;
            if (Math.abs(y0 - y1) < 1.5) {
                return 'M ' + x0 + ' ' + y0 + ' L ' + x1 + ' ' + y1;
            }
            var r = Math.min(8, Math.abs(y1 - y0) / 2, Math.abs(bx - x0) / 2, Math.abs(x1 - bx) / 2);
            if (r < 3) {
                return 'M ' + x0 + ' ' + y0 + ' L ' + bx + ' ' + y0 + ' L ' + bx + ' ' + y1 + ' L ' + x1 + ' ' + y1;
            }
            var sy = y1 > y0 ? 1 : -1;
            return 'M ' + x0 + ' ' + y0 +
                ' L ' + (bx - r) + ' ' + y0 +
                ' Q ' + bx + ' ' + y0 + ' ' + bx + ' ' + (y0 + sy * r) +
                ' L ' + bx + ' ' + (y1 - sy * r) +
                ' Q ' + bx + ' ' + y1 + ' ' + (bx + r) + ' ' + y1 +
                ' L ' + x1 + ' ' + y1;
        }

        var markerId = 'traceSchArrow' + String(model.nodes.length) + 'x' + String(model.segments.length);
        parts.push('<svg class="trace-schematic-svg trace-schematic-svg--tree" viewBox="0 0 ' + width + ' ' + height +
            '" width="' + width + '" height="' + height +
            '" data-base-w="' + width + '" data-base-h="' + height +
            '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Схема трассы">');
        parts.push('<defs>');
        parts.push('<marker id="' + markerId + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">');
        parts.push('<path d="M 0 1.2 L 9 5 L 0 8.8 Z" class="trace-sch-tree-arrow"/>');
        parts.push('</marker>');
        parts.push('</defs>');

        for (var d = 0; d <= layout.maxDepth; d++) {
            var colX = padX + d * colW + 3;
            parts.push('<rect class="trace-sch-tree-col' + (d % 2 ? ' trace-sch-tree-col--alt' : '') +
                '" x="' + colX + '" y="' + (padTop - stageH) +
                '" width="' + (colW - 6) + '" height="' + (height - padTop - padBot + stageH) + '" rx="12"/>');
            var stage = schematicTreeStageTitle(byDepth[d] || []);
            if (stage) {
                parts.push('<text class="trace-sch-tree-stage" x="' + (padX + d * colW + colW / 2) +
                    '" y="' + (padTop - stageH + 15) + '" text-anchor="middle">' +
                    schematicSvgEsc(stage) + '</text>');
            }
        }

        // Рёбра рисуем ПОСЛЕ карточек сплиттера — чтобы выходить точно с Y порта
        function drawTreeTrunkEdges() {
            var parentGroups = {};
            model.segments.forEach(function (seg, segIdx) {
                if (seg.fromIdx == null || seg.toIdx == null) return;
                var key = String(seg.fromIdx);
                if (!parentGroups[key]) parentGroups[key] = [];
                parentGroups[key].push(segIdx);
            });

            Object.keys(parentGroups).forEach(function (pkey) {
                var idxs = parentGroups[pkey];
                var fi = Number(pkey);
                var segs = idxs.map(function (si) { return model.segments[si]; });
                var x0 = nodeRight[fi];
                var y0 = nodeCY[fi];

                var ribbonTo = null;
                if (nodeIsUnit[fi]) {
                    var prim = primaryOut(fi);
                    if (prim) ribbonTo = prim.toIdx;
                }
                var fromNode = model.nodes[fi];
                var fromIsSplitter = fromNode && fromNode.type === 'splitter';
                var fromPorts = !!nodeIsSplitterPorts[fi];
                segs = segs.filter(function (s) {
                    if (!s || s.toIdx == null) return false;
                    var td = layout.depth[s.toIdx] || 0;
                    var fd = layout.depth[fi] || 0;
                    if (td < fd) return false;
                    if (ribbonTo != null && s.toIdx === ribbonTo) {
                        if (s === primaryOut(fi) || (s.cableId && primaryOut(fi) &&
                            s.cableId === primaryOut(fi).cableId)) return false;
                    }
                    if (s.kind === 'nodeLink' && !s.cableId && nodeIsUnit[s.toIdx] && !fromIsSplitter) {
                        return false;
                    }
                    // Сплиттер→муфта/кросс: не ствол в центр — посадка на жN в терминале
                    if (fromPorts && s.cableId && model.nodes[s.toIdx] &&
                        !isSchematicSinglePortEndpoint(model.nodes[s.toIdx]) &&
                        !nodeIsSplitterPorts[s.toIdx]) {
                        return false;
                    }
                    // Кросс/муфта → кросс/муфта по кабелю: только кассета/сварка, без ствола со стрелкой
                    if (nodeIsUnit[fi] && nodeIsUnit[s.toIdx] && s.cableId) {
                        return false;
                    }
                    if (nodeIsUnit[fi] && nodeIsUnit[s.toIdx] && s.fromSplice) {
                        return false;
                    }
                    return true;
                });
                if (!segs.length) return;

                var group = segs.slice().sort(function (a, b) {
                    var oa = schematicSegOutputIndex(a, model.nodes[a.toIdx]);
                    var ob = schematicSegOutputIndex(b, model.nodes[b.toIdx]);
                    if (oa != null && ob != null && oa !== ob) return oa - ob;
                    if (oa != null && ob == null) return -1;
                    if (oa == null && ob != null) return 1;
                    return (nodeCY[a.toIdx] || 0) - (nodeCY[b.toIdx] || 0);
                });
                // Один сегмент на пару (цель + выход) — разные вых.N на один сплиттер не схлопывать
                var byKey = {};
                group.forEach(function (sg) {
                    if (!sg || sg.toIdx == null) return;
                    var oi = schematicSegOutputIndex(sg, model.nodes[sg.toIdx]);
                    var k = String(sg.toIdx) + ':' + (oi != null ? oi : 'x');
                    var prev = byKey[k];
                    if (!prev) {
                        byKey[k] = sg;
                        return;
                    }
                    if (prev.kind === 'nodeLink' && sg.kind !== 'nodeLink') byKey[k] = sg;
                });
                group = Object.keys(byKey).map(function (k) { return byKey[k]; });
                group.sort(function (a, b) {
                    var oa2 = schematicSegOutputIndex(a, model.nodes[a.toIdx]);
                    var ob2 = schematicSegOutputIndex(b, model.nodes[b.toIdx]);
                    if (oa2 != null && ob2 != null && oa2 !== ob2) return oa2 - ob2;
                    return (nodeCY[a.toIdx] || 0) - (nodeCY[b.toIdx] || 0);
                });
                if (!group.length) return;
                var isFan = group.length > 1;
                var fanN = group.length;

                function smoothEdge(xa, ya, xb, yb, gi) {
                    var span = Math.abs(xb - xa);
                    var dx = Math.max(fanN >= 6 ? 48 : 36, span * (fanN >= 6 ? 0.58 : 0.45));
                    // Лёгкий разнос контрольных точек, чтобы веер не сливался в одну ленту
                    var kink = fanN > 1
                        ? (gi - (fanN - 1) / 2) * Math.min(12, span * 0.035)
                        : 0;
                    return 'M ' + xa + ' ' + ya +
                        ' C ' + (xa + dx) + ' ' + (ya + kink * 0.2) + ', ' +
                        (xb - dx) + ' ' + (yb - kink * 0.15) + ', ' +
                        xb + ' ' + yb;
                }

                var portGeom = fromPorts && fromNode ? fromNode._splitterPortsGeom : null;
                var portLanes = fromPorts && fromNode && fromNode._portLaneY;

                group.forEach(function (sg, gi) {
                    var toN = model.nodes[sg.toIdx];
                    var fromNEdge = model.nodes[sg.fromIdx];
                    if (fromNEdge && fromNEdge.type === 'splitter' && sg.cableId) {
                        syncSplitterSegmentToOutputConn(sg, fromNEdge);
                    }
                    var x1 = nodeLeft[sg.toIdx];
                    var y1 = nodeCY[sg.toIdx];
                    var outIdx = schematicSegOutputIndex(sg, toN);
                    if (outIdx != null && sg.splitterOutputIndex == null) {
                        sg.splitterOutputIndex = outIdx;
                    }

                    // Выход строго с линии порта N
                    var yLeave = y0;
                    if (portLanes && outIdx != null && portLanes[outIdx + 1] != null) {
                        yLeave = portLanes[outIdx + 1];
                    }
                    var xLeave = x0;
                    if (portGeom && portGeom.xb != null) {
                        xLeave = Math.min(x0, portGeom.xb + 1);
                    }

                    // Вход в дочерний сплиттер — только на COM, не на вых.1
                    if (toN && toN.type === 'splitter' && nodeIsSplitterPorts[sg.toIdx] &&
                        toN._splitterPortsGeom) {
                        if (toN._splitterPortsGeom.comY != null) y1 = toN._splitterPortsGeom.comY;
                        if (toN._splitterPortsGeom.comX != null) x1 = toN._splitterPortsGeom.comX;
                        else if (toN._splitterPortsGeom.unitL != null) x1 = toN._splitterPortsGeom.unitL;
                    }

                    parts.push('<circle class="trace-sch-tree-port" cx="' + xLeave + '" cy="' + yLeave + '" r="2.6"/>');
                    // Без marker-end: стрелки на стволе давали «осиротевшие» треугольники у кросса/муфты
                    parts.push('<path class="trace-sch-tree-edge trace-sch-tree-edge--trunk" d="' +
                        smoothEdge(xLeave, yLeave, x1, y1, gi) +
                        '" fill="none"/>');
                    // Подпись у цели, не в середине пролёта
                    var label = schematicTreeEdgeLabel(sg, isFan);
                    if (label) {
                        var bx = x1 - 30;
                        var by = y1 - 12;
                        // Лёгкий разнос при густом веере, чтобы бейджи не слипались
                        if (fanN > 1) {
                            by += (gi - (fanN - 1) / 2) * Math.min(11, 56 / fanN);
                            bx -= Math.min(18, Math.abs(gi - (fanN - 1) / 2) * 3);
                        }
                        pushTreeEdgeBadge(badgeParts, bx - 28, bx + 28, by + 13,
                            label, null,
                            isFan ? '' : ' trace-sch-tree-edge-badge--trunk');
                    }
                });
            });
        }

        // Сплиттер без своей палитры: все жилы = цвет входа (COM)
        paintSchematicSplitterInheritedColors(model);

        yield { hint: 'Рисуем узлы схемы', pct: null, waitMs: 0 };

        // Объединённые блоки муфта+кассета / компактные узлы
        for (var drawNi = 0; drawNi < model.nodes.length; drawNi++) {
            (function (node, ni) {
            var cx = nodeCX[ni];
            var cy = nodeCY[ni];
            var outSeg = primaryOut(ni);

            if (nodeIsSplitterPorts[ni]) {
                var portsH = nodeUnitH[ni] || (headH + 80);
                var yTopPorts = cy - portsH / 2;
                var usedOuts = schematicSplitterUsedOutIndices(node, model, ni);
                appendTreeSplitterPortsUnit(
                    parts,
                    nodeLeft[ni],
                    yTopPorts,
                    nodeUnitW[ni] || blockW,
                    node,
                    usedOuts,
                    node._splitterInheritColor || '#06b6d4'
                );
                // Для кабеля после сплиттера — выход с ПОРТА вых.N, не «жила N → порт N»
                (model.segments || []).forEach(function (outCab) {
                    if (!outCab || outCab.fromIdx !== ni) return;
                    if (outCab.kind === 'nodeLink' && !outCab.cableId) return;
                    if (!outCab.cableId && outCab.kind === 'nodeLink') return;
                    // Не вести «вых.N» на свой хост-кросс сплиттера
                    var spHostSkip = node.object && node.object._host;
                    var toSkip = model.nodes[outCab.toIdx];
                    if (spHostSkip && toSkip && toSkip.object &&
                        getUid(toSkip.object) === getUid(spHostSkip)) {
                        return;
                    }
                    if (outCab.invented || outCab.onTracePath === false) {
                        // Соседние выходы без трассы — без cyan-ленты
                        return;
                    }
                    syncSplitterSegmentToOutputConn(outCab, node);
                    var outIdx = outCab.splitterOutputIndex;
                    if (outIdx == null) {
                        var toObj2 = model.nodes[outCab.toIdx] && model.nodes[outCab.toIdx].object;
                        outIdx = toObj2
                            ? resolveSplitterOutputIndexForTarget(
                                node.object, toObj2, model.nodes[outCab.toIdx].port,
                                outCab.cableId, outCab.tracedFiber
                            )
                            : null;
                        if (outIdx != null) outCab.splitterOutputIndex = outIdx;
                        syncSplitterSegmentToOutputConn(outCab, node);
                        outIdx = outCab.splitterOutputIndex;
                    }
                    var portNum = outIdx != null ? (Number(outIdx) + 1) : null;
                    var leaveY = (portNum != null && node._portLaneY && node._portLaneY[portNum] != null)
                        ? node._portLaneY[portNum]
                        : cy;
                    var fibersOut = ensureSchematicSegmentFibers(outCab, model.nodes[outCab.toIdx], null) || [];
                    var laneMap = {};
                    var outsArr = (node.object && node.object.properties)
                        ? (node.object.properties.get('outputConnections') || [])
                        : [];
                    var tapFiber = null;
                    if (outIdx != null && outsArr[outIdx] && outsArr[outIdx].fiberNumber != null) {
                        tapFiber = Number(outsArr[outIdx].fiberNumber);
                    }
                    if (tapFiber == null && outCab.tracedFiber != null) {
                        tapFiber = Number(outCab.tracedFiber);
                    }
                    if (tapFiber == null && outCab.tapFiber != null) {
                        tapFiber = Number(outCab.tapFiber);
                    }
                    // Не красить все отводы сплиттера как трассу — только hop из маршрута
                    if (tapFiber != null) {
                        outCab.tapFiber = tapFiber;
                        if (outCab.onTracePath !== false && !outCab.invented) {
                            outCab.tracedFiber = tapFiber;
                        } else if (outCab.invented || outCab.onTracePath === false) {
                            outCab.tracedFiber = null;
                        }
                    }
                    // Все жилы этого кабеля выходят с одного порта сплиттера (вых.N)
                    fibersOut.forEach(function (f) {
                        if (!f) return;
                        laneMap[Number(f.number)] = leaveY;
                    });
                    if (tapFiber != null) laneMap[tapFiber] = leaveY;
                    else laneMap._leave = leaveY;
                    var xL = nodeLeft[ni];
                    var xR = nodeRight[ni];
                    var geomXb = (node._splitterPortsGeom && node._splitterPortsGeom.xb != null)
                        ? node._splitterPortsGeom.xb
                        : (xR - 8);
                    outCab._ribbonGeom = {
                        xa: (node._splitterPortsGeom && node._splitterPortsGeom.xa != null)
                            ? node._splitterPortsGeom.xa
                            : (xL + 44),
                        xb: geomXb,
                        boxL: xL,
                        boxR: xR,
                        unitL: xL,
                        unitR: xR,
                        unitX: xL,
                        unitW: xR - xL,
                        yMid: leaveY,
                        laneY: laneMap,
                        fromIdx: ni,
                        toIdx: outCab.toIdx,
                        cableId: outCab.cableId,
                        _fromSplitterPorts: true,
                        _tapFiber: tapFiber,
                        _outPort: portNum
                    };
                });
                return;
            }

            if (outSeg && nodeIsUnit[ni]) {
                var toNode = model.nodes[outSeg.toIdx];
                var unitH = nodeUnitH[ni] || (headH + 80);
                var yTop = cy - unitH / 2;
                // На всякий случай ещё раз покрасить кассету сплиттера перед отрисовкой
                if (node.type === 'splitter' && node._splitterInheritColor && outSeg.fibers) {
                    var tapOnly = outSeg.tracedFiber != null ? Number(outSeg.tracedFiber) : null;
                    outSeg.fibers.forEach(function (f) {
                        if (!f) return;
                        if (tapOnly == null || Number(f.number) === tapOnly) {
                            if (tapOnly != null) f.color = node._splitterInheritColor;
                        }
                    });
                }
                appendTreeHostCassetteUnit(
                    parts,
                    nodeLeft[ni],
                    yTop,
                    blockW,
                    node,
                    outSeg,
                    toNode,
                    nextCableAfter(outSeg.toIdx)
                );
                return;
            }

            // Конечная муфта с входящим кабелем — порты рисует terminal.
            // ONU / МК / узел — всегда компактная карточка (не пропускать!)
            if (!isSchematicSinglePortEndpoint(node)) {
                var hasInFromUnit = false;
                for (var ii = 0; ii < (model.segments || []).length; ii++) {
                    var sIn = model.segments[ii];
                    if (sIn && sIn.toIdx === ni &&
                        (nodeIsUnit[sIn.fromIdx] || nodeIsSplitterPorts[sIn.fromIdx]) &&
                        (sIn.kind !== 'nodeLink' || sIn.cableId)) {
                        hasInFromUnit = true;
                        break;
                    }
                }
                if (hasInFromUnit) return;
            }

            var x = cx - smallNodeW / 2;
            var y = cy - smallNodeH / 2;
            var name = String(node.name || getTypeName(node.type));
            if (name.length > 15) name = name.slice(0, 13) + '…';
            var tone = schematicTreeNodeTone(node.type);
            var typeShort = schematicTreeTypeShort(node.type);

            parts.push('<g class="trace-sch-tree-node-g">');
            parts.push('<rect class="trace-sch-tree-node-shadow" x="' + (x + 1.5) + '" y="' + (y + 2.5) +
                '" width="' + smallNodeW + '" height="' + smallNodeH + '" rx="11"/>');
            parts.push('<rect class="trace-sch-tree-node trace-sch-tree-node--' + tone + '" x="' + x + '" y="' + y +
                '" width="' + smallNodeW + '" height="' + smallNodeH + '" rx="11"/>');
            parts.push('<rect class="trace-sch-tree-accent trace-sch-tree-accent--' + tone + '" x="' + (x + 1) + '" y="' + (y + 8) +
                '" width="3.5" height="' + (smallNodeH - 16) + '" rx="1.5"/>');
            parts.push('<text class="trace-sch-tree-type" x="' + (x + 14) + '" y="' + (y + 17) + '">' +
                schematicSvgEsc(typeShort) + '</text>');
            parts.push('<text class="trace-sch-tree-name" x="' + (x + 14) + '" y="' + (y + 34) + '">' +
                schematicSvgEsc(name) + '</text>');
            parts.push('</g>');
            })(model.nodes[drawNi], drawNi);
            if ((drawNi % 2) === 1 || drawNi === model.nodes.length - 1) {
                yield {
                    hint: 'Узел ' + (drawNi + 1) + ' / ' + model.nodes.length,
                    pct: null,
                    waitMs: 0
                };
            }
        }

        yield { hint: 'Рисуем связи', pct: null, waitMs: 0 };

        // Веер рёбер после портов сплиттера — выход с линии порта N
        drawTreeTrunkEdges();
        yield { hint: 'Терминалы и кассеты', pct: null, waitMs: 0 };

        // Терминалы (муфта/кросс без исходящей кассеты, сплиттер как приёмник): входы слева.
        // ONU / МК / узел — всегда компактные (1 вход), не кассета на N портов.
        var termOrder = [];
        for (var ti0 = 0; ti0 < model.nodes.length; ti0++) {
            if (nodeIsUnit[ti0] || nodeIsSplitterPorts[ti0]) continue;
            if (isSchematicSinglePortEndpoint(model.nodes[ti0])) continue;
            termOrder.push(ti0);
        }
        termOrder.sort(function (a, b) {
            return (layout.depth[a] - layout.depth[b]) || (layout.y[a] - layout.y[b]) || (a - b);
        });

        function synthesizeOutRibbonGeom(hostIdx, termX0, termW0, yTop0, yBot0) {
            var outC = primaryOut(hostIdx);
            if (!outC || outC.kind === 'nodeLink') return;
            if (outC._ribbonGeom) return;
            var toN = model.nodes[outC.toIdx];
            var outFibers = ensureSchematicSegmentFibers(outC, toN, null) || [];
            var sortedOut = outFibers.slice().sort(function (a, b) {
                return (Number(a.number) || 0) - (Number(b.number) || 0);
            });
            var nOut = Math.max(1, sortedOut.length);
            var laneMap = {};
            sortedOut.forEach(function (f, idx) {
                var yy = nOut <= 1 ? (yTop0 + yBot0) / 2
                    : yTop0 + (idx / Math.max(1, nOut - 1)) * (yBot0 - yTop0);
                laneMap[Number(f.number)] = yy;
            });
            if (!sortedOut.length && outC.tracedFiber != null) {
                laneMap[Number(outC.tracedFiber)] = (yTop0 + yBot0) / 2;
            }
            var xa0 = termX0 + 14;
            var xb0 = termX0 + termW0 - 10;
            outC._ribbonGeom = {
                xa: xa0,
                xb: xb0,
                boxL: termX0,
                boxR: termX0 + termW0,
                unitL: termX0,
                unitR: termX0 + termW0,
                unitX: termX0,
                unitW: termW0,
                yMid: (yTop0 + yBot0) / 2,
                laneY: laneMap,
                fromIdx: hostIdx,
                toIdx: outC.toIdx,
                cableId: outC.cableId
            };
        }

        function resolveSchematicSegTapFiber(seg, fromNode) {
            if (!seg) return null;
            syncSplitterSegmentToOutputConn(seg, fromNode);
            if (fromNode && fromNode.object && fromNode.object.properties &&
                seg.splitterOutputIndex != null) {
                var outsT = fromNode.object.properties.get('outputConnections') || [];
                var ocT = outsT[seg.splitterOutputIndex];
                if (ocT && ocT.fiberNumber != null) {
                    var fromOut = Number(ocT.fiberNumber);
                    seg.tracedFiber = fromOut;
                    if (seg._ribbonGeom) seg._ribbonGeom._tapFiber = fromOut;
                    return fromOut;
                }
            }
            if (seg._ribbonGeom && seg._ribbonGeom._tapFiber != null) {
                return Number(seg._ribbonGeom._tapFiber);
            }
            if (seg.tracedFiber != null && isFinite(Number(seg.tracedFiber))) {
                return Number(seg.tracedFiber);
            }
            return null;
        }

        for (var termIx = 0; termIx < termOrder.length; termIx++) {
            var ti = termOrder[termIx];
            if ((termIx % 1) === 0) {
                yield {
                    hint: 'Терминал ' + (termIx + 1) + ' / ' + termOrder.length,
                    pct: null,
                    waitMs: 0
                };
            }
            var inSegs = [];
            for (var s1 = 0; s1 < (model.segments || []).length; s1++) {
                var sg1 = model.segments[s1];
                if (!sg1 || sg1.toIdx !== ti) continue;
                if (sg1.kind === 'nodeLink' && !sg1.cableId) continue;
                if (!sg1._ribbonGeom) continue;
                inSegs.push(sg1);
            }
            if (!inSegs.length) continue;
            // Кассета по любому входящему; посадки — по каждому входу со своей жилой
            inSegs.sort(function (a, b) {
                var da = layout.depth[a.fromIdx] != null ? layout.depth[a.fromIdx] : 0;
                var db = layout.depth[b.fromIdx] != null ? layout.depth[b.fromIdx] : 0;
                return db - da;
            });
            var seg = inSegs[0];
            var toNode = model.nodes[ti];
            var fibers = ensureSchematicSegmentFibers(seg, toNode, null);
            if (!fibers.length) continue;

            var n = fibers.length;
            var pitch = n > 32 ? 6.5 : (n > 16 ? 8 : (n > 8 ? 10 : (n > 4 ? 12 : 14)));
            var bandH = n <= 1 ? 14 : (n - 1) * pitch;
            bandH = Math.min(280, bandH);
            var portPadY = 10;
            var headHTerm = 28;
            var termH = Math.max(smallNodeH, headHTerm + bandH + portPadY * 2 + 8);
            var termW = Math.max(smallNodeW, 118);
            var cx = nodeCX[ti];
            var cy = nodeCY[ti];
            if (nodeUnitH[ti] != null) termH = Math.max(termH, nodeUnitH[ti]);
            var termX = cx - termW / 2;
            var termY = cy - termH / 2;
            nodeLeft[ti] = termX;
            nodeRight[ti] = termX + termW;
            nodeUnitH[ti] = termH;

            var tone = schematicTreeNodeTone(toNode && toNode.type);
            var typeShort = schematicTreeTypeShort(toNode && toNode.type);
            var name = String((toNode && (toNode.name || getTypeName(toNode.type))) || '');
            if (name.length > 14) name = name.slice(0, 12) + '…';

            parts.push('<g class="trace-sch-tree-unit trace-sch-tree-unit--term">');
            parts.push('<rect class="trace-sch-tree-unit-shadow" x="' + (termX + 1.5) + '" y="' + (termY + 2.5) +
                '" width="' + termW + '" height="' + termH + '" rx="12"/>');
            parts.push('<rect class="trace-sch-tree-unit-bg trace-sch-tree-node--' + tone + '" x="' + termX +
                '" y="' + termY + '" width="' + termW + '" height="' + termH + '" rx="12"/>');
            parts.push('<rect class="trace-sch-tree-unit-head" x="' + termX + '" y="' + termY +
                '" width="' + termW + '" height="' + headHTerm + '" rx="12"/>');
            parts.push('<rect class="trace-sch-tree-unit-head" x="' + termX + '" y="' + (termY + headHTerm - 10) +
                '" width="' + termW + '" height="10"/>');
            parts.push('<rect class="trace-sch-tree-accent trace-sch-tree-accent--' + tone + '" x="' + (termX + 1) +
                '" y="' + (termY + 6) + '" width="3.5" height="' + (headHTerm - 10) + '" rx="1.5"/>');
            parts.push('<text class="trace-sch-tree-type" x="' + (termX + 12) + '" y="' + (termY + 12) + '">' +
                schematicSvgEsc(typeShort) + '</text>');
            parts.push('<text class="trace-sch-tree-name" x="' + (termX + 12) + '" y="' + (termY + 24) + '">' +
                schematicSvgEsc(name) + '</text>');

            var yTopPorts = termY + headHTerm + portPadY;
            var portX = termX + 20;
            var entryX = termX;

            var sorted = fibers.slice().sort(function (a, b) {
                return (Number(a.number) || 0) - (Number(b.number) || 0);
            });
            var fiberIdx = {};
            sorted.forEach(function (f, idx) {
                if (f) fiberIdx[Number(f.number)] = idx;
            });
            function termLaneY(idx) {
                if (n <= 1) return yTopPorts + bandH / 2;
                return yTopPorts + (idx / Math.max(1, n - 1)) * bandH;
            }
            function termLaneYForFiber(fiberNum) {
                var idx = fiberIdx[Number(fiberNum)];
                if (idx != null) return termLaneY(idx);
                var fn = Number(fiberNum);
                if (isFinite(fn) && fn >= 1 && fn <= sorted.length) return termLaneY(fn - 1);
                return yTopPorts + bandH / 2;
            }
            function getSplitterOutsList(spNode) {
                if (!spNode || !spNode.object) return [];
                var o = spNode.object;
                var list = [];
                if (o.properties && typeof o.properties.get === 'function') {
                    list = o.properties.get('outputConnections') || [];
                }
                if ((!list || !list.filter(Boolean).length) && o._record && o._record.outputConnections) {
                    list = o._record.outputConnections;
                }
                return list || [];
            }

            // Кабели, приходящие в эту муфту/кросс (из сегментов схемы)
            var cableIdsAtTerm = {};
            inSegs.forEach(function (iseg) {
                if (iseg && iseg.cableId) cableIdsAtTerm[String(iseg.cableId)] = true;
            });
            // Плюс все выходы сплиттеров на схеме, чей кабель ведёт сюда
            (model.nodes || []).forEach(function (spNode, spi) {
                if (!nodeIsSplitterPorts[spi] || !spNode) return;
                getSplitterOutsList(spNode).forEach(function (conn) {
                    if (!conn || !conn.cableId) return;
                    // Дальний конец кабеля = эта муфта?
                    var cab = findSchematicCableById(conn.cableId);
                    if (!cab) return;
                    var far = null;
                    var spHost = spNode.object && spNode.object._host ? spNode.object._host : spNode.object;
                    if (typeof global.getOtherEndOfCable === 'function') {
                        far = global.getOtherEndOfCable(cab, spHost);
                    }
                    if (!far && cab.properties) {
                        var fu = cab.properties.get('fromUniqueId');
                        var tu = cab.properties.get('toUniqueId');
                        var hu = spHost ? getUid(spHost) : null;
                        var farUid = (hu && String(fu) === String(hu)) ? tu
                            : (hu && String(tu) === String(hu)) ? fu : (tu || fu);
                        far = farUid ? findSchematicObjectByUid(farUid) : null;
                    }
                    if (far && toNode && toNode.object && getUid(far) === getUid(toNode.object)) {
                        cableIdsAtTerm[String(conn.cableId)] = true;
                    }
                });
            });

            var tapByFiber = {};
            var drawnBridgeKeys = {};

            function drawTermBridge(xLeave, yLeave, tap, badgeText) {
                if (tap == null || !isFinite(Number(tap))) return false;
                tap = Number(tap);
                var y2 = termLaneYForFiber(tap);
                var key = String(Math.round(xLeave)) + ':' + String(Math.round(yLeave)) + '>' + tap;
                if (drawnBridgeKeys[key]) return false;
                drawnBridgeKeys[key] = true;
                tapByFiber[tap] = tapByFiber[tap] || [];
                if (!(xLeave < entryX - 6)) xLeave = entryX - 36;
                var dx = Math.max(28, (entryX - xLeave) * 0.45);
                parts.push('<path class="trace-sch-tree-splice trace-sch-tree-splice--traced" d="M ' +
                    xLeave + ' ' + yLeave +
                    ' C ' + (xLeave + dx) + ' ' + yLeave + ', ' +
                    (entryX - dx) + ' ' + y2 + ', ' +
                    entryX + ' ' + y2 +
                    ' L ' + portX + ' ' + y2 +
                    '" fill="none" stroke="#06b6d4" stroke-width="2.4" stroke-linecap="round"/>');
                if (badgeText) {
                    pushTreeEdgeBadge(badgeParts, entryX - 58, entryX - 6, y2, badgeText, null, '');
                }
                return true;
            }

            // Мосты по входящим сегментам (жила из outputConnections сплиттера)
            inSegs.forEach(function (iseg) {
                var fromN = model.nodes[iseg.fromIdx];
                var tap = resolveSchematicSegTapFiber(iseg, fromN);
                var yLeave;
                var xLeave;
                if (nodeIsSplitterPorts[iseg.fromIdx] && fromN) {
                    var oi = iseg.splitterOutputIndex;
                    yLeave = nodeCY[iseg.fromIdx];
                    if (oi != null && fromN._portLaneY && fromN._portLaneY[oi + 1] != null) {
                        yLeave = fromN._portLaneY[oi + 1];
                    }
                    xLeave = nodeRight[iseg.fromIdx] != null ? nodeRight[iseg.fromIdx] : entryX - 40;
                    if (fromN._splitterPortsGeom && fromN._splitterPortsGeom.xb != null) {
                        xLeave = fromN._splitterPortsGeom.xb;
                    }
                    if (drawTermBridge(xLeave, yLeave, tap, oi != null ? ('вых.' + (oi + 1)) : null) && tap != null) {
                        tapByFiber[tap].push({ iseg: iseg });
                    }
                    return;
                }
                var ig = iseg._ribbonGeom;
                if (!ig) return;
                yLeave = (tap != null && ig.laneY && ig.laneY[tap] != null) ? ig.laneY[tap] : ig.yMid;
                xLeave = nodeRight[iseg.fromIdx] != null ? nodeRight[iseg.fromIdx]
                    : (ig.unitR != null ? ig.unitR : ig.xb);
                if (drawTermBridge(xLeave, yLeave, tap, null) && tap != null) {
                    tapByFiber[tap].push({ iseg: iseg });
                }
            });

            // Дополнить выходами сплиттеров на этот кабель без сегмента в inSegs
            (model.nodes || []).forEach(function (spNode, spi) {
                if (!nodeIsSplitterPorts[spi] || !spNode) return;
                getSplitterOutsList(spNode).forEach(function (conn, oi) {
                    if (!conn || !conn.cableId || conn.fiberNumber == null) return;
                    if (!cableIdsAtTerm[String(conn.cableId)]) return;
                    var tap = Number(conn.fiberNumber);
                    if (!isFinite(tap) || tapByFiber[tap]) return;
                    var cab2 = findSchematicCableById(conn.cableId);
                    var far2 = null;
                    var spHost2 = spNode.object && spNode.object._host ? spNode.object._host : spNode.object;
                    if (cab2 && typeof global.getOtherEndOfCable === 'function') {
                        far2 = global.getOtherEndOfCable(cab2, spHost2);
                    }
                    if (far2 && toNode && toNode.object && getUid(far2) !== getUid(toNode.object)) return;
                    var yLeave = nodeCY[spi];
                    if (spNode._portLaneY && spNode._portLaneY[oi + 1] != null) {
                        yLeave = spNode._portLaneY[oi + 1];
                    }
                    var xLeave = nodeRight[spi] != null ? nodeRight[spi] : entryX - 40;
                    if (spNode._splitterPortsGeom && spNode._splitterPortsGeom.xb != null) {
                        xLeave = spNode._splitterPortsGeom.xb;
                    }
                    if (drawTermBridge(xLeave, yLeave, tap, 'вых.' + (oi + 1))) {
                        tapByFiber[tap].push({ spNode: spNode, oi: oi });
                    }
                });
            });

            var drawOrder = sorted.slice().sort(function (a, b) {
                var at = tapByFiber[Number(a.number)] ? 1 : 0;
                var bt = tapByFiber[Number(b.number)] ? 1 : 0;
                return at - bt;
            });

            drawOrder.forEach(function (fiber) {
                if (!fiber) return;
                var idx = fiberIdx[Number(fiber.number)];
                if (idx == null) return;
                var isTraced = !!tapByFiber[Number(fiber.number)] || !!fiber.traced;
                var isFree = !!(fiber.fate && fiber.fate.kind === 'free' && !isTraced);
                var y2 = termLaneY(idx);
                var stroke = isTraced ? '#06b6d4' : schematicNormalizeFiberColor(fiber.color);
                var sw = isTraced ? 2.2 : (isFree ? 1.35 : 1.55);
                var opac = isTraced ? 1 : (isFree ? 0.55 : 0.85);
                var dash = isFree ? ' stroke-dasharray="3 2.5"' : '';
                // Внутри кассеты — горизонталь (вход уже нарисован мостом)
                parts.push('<path d="M ' + portX + ' ' + y2 + ' L ' + (termX + termW - 14) + ' ' + y2 +
                    '" fill="none" stroke="' + stroke + '" stroke-width="' + sw +
                    '" stroke-opacity="' + opac + '" stroke-linecap="round"' + dash + '/>');
                parts.push('<circle cx="' + portX + '" cy="' + y2 + '" r="' + (isTraced ? 3.2 : 2.2) +
                    '" fill="' + stroke + '" fill-opacity="' + opac + '"' +
                    (isTraced ? ' stroke="#06b6d4" stroke-width="1.3"' : '') + '/>');
                parts.push('<text class="trace-sch-fiber-num' + (isTraced ? ' trace-sch-fiber-num--traced' : '') +
                    '" x="' + (portX + 9) + '" y="' + (y2 + 2.8) + '">' + fiber.number + '</text>');
            });

            var tapNums = Object.keys(tapByFiber).map(Number).sort(function (a, b) { return a - b; });
            var capBits = [];
            if (tapNums.length) {
                capBits.push(tapNums.map(function (t) { return 'ж' + t; }).join('+'));
            }
            if (n > 1) capBits.push(n + 'F');
            if (seg.lengthM != null) capBits.push(seg.lengthM + ' м');
            if (capBits.length) {
                parts.push('<text class="trace-sch-tree-fiber-caption" x="' + (termX + termW / 2) +
                    '" y="' + (termY + termH - 6) + '" text-anchor="middle">' +
                    schematicSvgEsc(capBits.join(' · ')) + '</text>');
            }
            parts.push('</g>');

            // Геометрия исходящего кабеля с правого края — для следующего терминала
            synthesizeOutRibbonGeom(ti, termX, termW, yTopPorts, yTopPorts + bandH);
        }
        yield { hint: 'Сварки и подписи', pct: null, waitMs: 0 };
        flushTreeEdgeBadges(parts, badgeParts);

        // Сварки / мосты между unit-блоками (OLT→кросс и т.п.)
        paintSchematicSplitterInheritedColors(model);
        var spliceNodeH = Math.max(smallNodeH, Math.min(maxUnitH, 160));
        appendTreeFiberSplices(
            parts, model, nodeCX, nodeCY, nodeLeft, nodeRight,
            spliceNodeH, nodeIsUnit, nodeUnitH, nodeIsSplitterPorts, markerId
        );

        parts.push('</svg>');
        return parts.join('');
    }

    function buildTraceSchematicOverviewHtml(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';
        var html = '<div class="trace-sch-overview' + (model.tree || model.merged ? ' trace-sch-overview--tree' : '') + '">';
        model.nodes.forEach(function (node, i) {
            if (i > 0 && !(model.tree || model.merged)) {
                html += '<span class="trace-sch-overview-line" aria-hidden="true"></span>';
            }
            var kind = node.type ? ' trace-sch-overview-node--' + String(node.type) : '';
            html += '<span class="trace-sch-overview-node' + kind + '" title="' + esc(node.name) + '">' +
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
            '<input type="range" class="trace-sch-zoom-slider" min="25" max="250" value="100" step="5" aria-label="Масштаб схемы">' +
            '<span class="trace-sch-zoom-label">100%</span>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="in" title="Увеличить">+</button>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="fit" title="Вписать в область">⊡</button>' +
            '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="reset" title="100%">100%</button>' +
            '</div>' +
            '</div>';
    }

    function buildTraceSchematicHtml(path, opts) {
        opts = opts || {};
        var model = opts.model || (path ? buildTraceSchematicModel(path) : null);
        if (!model || !model.nodes.length) return '';
        var metricsPath = opts.metricsPath || model.sourcePath || path;
        var metrics = metricsPath
            ? summarizePathMetrics(enrichPathWithLengths(metricsPath))
            : { distanceM: null, reserveM: 0 };
        var isTree = !!(model.tree || model.merged);
        var html = '<div class="trace-schematic' + (isTree ? ' trace-schematic--tree' : '') + '">';
        html += '<div class="trace-schematic-head">';
        html += '<div class="trace-schematic-title-row">';
        html += '<div class="trace-schematic-title">Схема жил</div>';
        if (model.merged && model.branchCount > 1) {
            html += '<div class="trace-schematic-branch-hint" title="Все найденные окончания на одной схеме">одна схема · ' +
                model.branchCount + ' оконч.</div>';
        } else if (model.nodes && model.nodes.length) {
            var leafN = 0;
            var insMap = {};
            (model.segments || []).forEach(function (s) { insMap[s.toIdx] = true; });
            // грубо: узлы без исходящих
            var outsMap = {};
            (model.segments || []).forEach(function (s) { outsMap[s.fromIdx] = true; });
            model.nodes.forEach(function (_n, i) {
                if (!outsMap[i] && (insMap[i] || i > 0)) leafN++;
            });
            if (leafN > 1) {
                html += '<div class="trace-schematic-branch-hint">окончаний: ' + leafN + '</div>';
            }
        } else if (opts.totalBranches > 1) {
            html += '<div class="trace-schematic-branch-hint">веток маршрута: ' + opts.totalBranches + '</div>';
        }
        html += '</div>';
        html += buildTraceSchematicToolbarHtml();
        html += '</div>';
        html += '<div class="trace-sch-export-root">';
        if (isTree) {
            html += '<div class="trace-schematic-legend trace-schematic-legend--tree">';
            html += '<span class="trace-sch-leg trace-sch-leg--olt">OLT</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--host">кросс / муфта</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--splitter">сплиттер</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--onu">ONU</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--traced">трассируемая жила</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--used">остальные жилы</span>';
            html += '</div>';
        } else {
            html += '<div class="trace-schematic-legend">';
            html += '<span class="trace-sch-leg trace-sch-leg--traced">трассируемая</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--used">занята / сварка</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--free">свободна</span>';
            html += '<span class="trace-sch-leg trace-sch-leg--branch">ушла в другой кабель</span>';
            html += '</div>';
            html += buildTraceSchematicOverviewHtml(model);
        }
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
        if (isTree) {
            html += '<p class="trace-schematic-hint">На кабеле в кросс/муфту — все жилы и куда каждая уходит (сварка / ONU / сплиттер / свободна). Ветки от сплиттера — отдельные отводы (вых.N), без общей вертикальной линии. Ctrl+колёсико — масштаб.</p>';
        } else {
            var maxF = 0;
            model.segments.forEach(function (s) { if (s.fiberCount > maxF) maxF = s.fiberCount; });
            var compactNote = maxF > 48 ? ' На кабелях &gt;48 жил свободные линии скрыты для читаемости.' : '';
            html += '<p class="trace-schematic-hint">Прямые параллельные линии — жилы кабеля. Голубая с точками — трассируемая. Пунктир — свободна. Ответвление вниз — сварка в другой кабель. Ctrl+колёсико — масштаб.' + compactNote + '</p>';
        }
        html += '</div>';
        return html;
    }

    function scoreTracePathForSchematic(path) {
        if (!path || !path.length) return -1;
        var score = path.length;
        var hasOnu = false;
        var hasSplitter = false;
        var hasMc = false;
        var hasNode = false;
        var endsAtOltOnly = false;
        for (var i = 0; i < path.length; i++) {
            var it = path[i];
            if (!it) continue;
            if (it.type === 'object' && it.objectType === 'onu') hasOnu = true;
            if (it.type === 'onuConnection' || it.type === 'splitterOutputToOnu') hasOnu = true;
            if (it.type === 'object' && it.objectType === 'splitter') hasSplitter = true;
            if (it.type === 'splitterConnection' || it.type === 'splitterOutputToCrossPort' ||
                it.type === 'splitterOutputToSplitter') hasSplitter = true;
            if (it.type === 'object' && it.objectType === 'mediaConverter') hasMc = true;
            if (it.type === 'mediaConverterConnection' || it.type === 'splitterOutputToMediaConverter') hasMc = true;
            if (it.type === 'object' && it.objectType === 'node') hasNode = true;
            if (it.type === 'nodeConnection' || it.type === 'splitterOutputToNode') hasNode = true;
        }
        var last = path[path.length - 1];
        if (last && ((last.type === 'object' && last.objectType === 'olt') || last.type === 'oltPortConnection')) {
            endsAtOltOnly = !hasOnu && !hasSplitter && !hasMc && !hasNode;
        }
        if (hasOnu) score += 1000;
        if (hasSplitter) score += 400;
        if (hasMc || hasNode) score += 200;
        if (endsAtOltOnly) score -= 500;
        // Окончание на муфте/кроссе после кабеля — полноценная ветка, не отбрасывать
        if (last && last.type === 'object' &&
            (last.objectType === 'sleeve' || last.objectType === 'cross' || last.objectType === 'spliceCassette')) {
            score += 120;
        }
        // Больше уникальных узлов сети — богаче схема
        var seen = {};
        for (var j = 0; j < path.length; j++) {
            var p = path[j];
            if (p && p.type === 'object' && p.object) {
                var uid = getUid(p.object);
                if (uid && !seen[uid]) {
                    seen[uid] = true;
                    score += 15;
                }
            }
        }
        return score;
    }

    function collectContinuableObjectIds(paths) {
        var ids = {};
        (paths || []).forEach(function (path) {
            if (!path || path.length < 2) return;
            var lastObjIdx = -1;
            for (var i = path.length - 1; i >= 0; i--) {
                var it = path[i];
                if (!it) continue;
                if (it.type === 'object' || it.type === 'start' ||
                    it.type === 'onuConnection' || it.type === 'splitterOutputToOnu' ||
                    it.type === 'nodeConnection' || it.type === 'mediaConverterConnection' ||
                    it.type === 'radioBridgeConnection' || it.type === 'oltPortConnection' ||
                    it.type === 'splitterOutputToNode' || it.type === 'splitterOutputToMediaConverter' ||
                    it.type === 'splitterOutputToSplitter' || it.type === 'splitterOutputToCrossPort') {
                    lastObjIdx = i;
                    break;
                }
            }
            for (var j = 0; j < path.length; j++) {
                if (j === lastObjIdx) continue;
                var p = path[j];
                if (!p) continue;
                if (p.type === 'object' && p.object) {
                    var uid = getUid(p.object);
                    if (uid) ids[uid] = true;
                }
                if (p.type === 'splitterConnection' && p.splitter) {
                    var su = getUid(p.splitter);
                    if (su) ids[su] = true;
                }
            }
        });
        return ids;
    }

    function terminalUidFromKey(key) {
        if (!key) return null;
        // onu:uid | splitter:uid | cross:uid | crossPort:host:port | objectType:uid(:port)
        var parts = String(key).split(':');
        if (parts[0] === 'label' || parts[0] === 'onuName' || parts[0] === 'mcName' || parts[0] === 'nodeName') {
            return null;
        }
        if (parts[0] === 'crossPort') return parts[1] || null;
        if (parts[0] === 'oltPort') return parts[1] || null;
        return parts[1] || null;
    }

    /** Префикс другого пути (обрыв на кроссе/сплиттере, дальше по сети есть продолжение). */
    function isPrefixOnlyTracePath(path, continuableIds) {
        if (!path || !continuableIds) return false;
        var st = analyzePathStatus(path);
        if (st.status === 'complete') return false;
        var key = pathSchematicTerminalId(path);
        var uid = terminalUidFromKey(key);
        if (uid && continuableIds[uid]) return true;
        // Неполные окончания на хосте/сплиттере, через которые идут другие ветки
        if (st.endpoint === 'splitter' || st.endpoint === 'cross' || st.endpoint === 'sleeve' ||
            st.endpoint === 'spliceCassette') {
            if (uid && continuableIds[uid]) return true;
        }
        return false;
    }

    function selectUniqueTerminalPaths(paths, opts) {
        opts = opts || {};
        var maxN = opts.max != null ? opts.max : 48;
        var preferComplete = opts.preferComplete !== false;
        if (!paths || !paths.length) return [];
        var continuable = collectContinuableObjectIds(paths);
        var ranked = paths.map(function (p, idx) {
            return { path: p, idx: idx, score: scoreTracePathForSchematic(p), st: analyzePathStatus(p) };
        }).filter(function (row) {
            if (!row.path || scoreTracePathForSchematic(row.path) < 0) return false;
            if (isPrefixOnlyTracePath(row.path, continuable)) return false;
            return true;
        });
        ranked.sort(function (a, b) {
            if (preferComplete) {
                var ac = a.st.status === 'complete' ? 1 : 0;
                var bc = b.st.status === 'complete' ? 1 : 0;
                if (ac !== bc) return bc - ac;
            }
            if (b.score !== a.score) return b.score - a.score;
            return a.idx - b.idx;
        });
        var selected = [];
        var seen = {};
        ranked.forEach(function (row) {
            if (selected.length >= maxN) return;
            var key = pathSchematicTerminalId(row.path);
            if (!key || seen[key]) return;
            seen[key] = true;
            selected.push(row.path);
        });
        if (!selected.length && paths.length) selected.push(paths[0]);
        return selected;
    }

    function pathSchematicTerminalId(path) {
        if (!path || !path.length) return '';
        for (var i = path.length - 1; i >= 0; i--) {
            var it = path[i];
            if (!it) continue;
            if (it.type === 'onuConnection' || it.type === 'splitterOutputToOnu') {
                var onu = it.onu || it.onuObj;
                if (onu) return 'onu:' + getUid(onu);
                if (it.onuName) return 'onuName:' + it.onuName;
            }
            if (it.type === 'mediaConverterConnection' || it.type === 'splitterOutputToMediaConverter') {
                var mc = it.mediaConverter || it.mediaConverterObj;
                if (mc) return 'mc:' + getUid(mc);
                if (it.mediaConverterName) return 'mcName:' + it.mediaConverterName;
            }
            if (it.type === 'nodeConnection' || it.type === 'splitterOutputToNode') {
                var node = it.node || it.nodeObj;
                if (node) return 'node:' + getUid(node);
                if (it.nodeName) return 'nodeName:' + it.nodeName;
            }
            if (it.type === 'radioBridgeConnection') {
                if (it.radioBridge) return 'rb:' + getUid(it.radioBridge);
            }
            if (it.type === 'splitterOutputToSplitter' && (it.toSplitter || it.splitter)) {
                var tsp = it.toSplitter || it.splitter;
                return 'splitter:' + getUid(tsp);
            }
            if (it.type === 'splitterOutputToCrossPort') {
                var host = it.toCross || it.host || it.cross;
                var port = it.crossPort != null ? it.crossPort : '';
                if (host) return 'crossPort:' + getUid(host) + ':' + port;
                return 'crossPort:' + port;
            }
            if (it.type === 'oltPortConnection' && it.olt) {
                return 'oltPort:' + getUid(it.olt) + ':' + it.portNumber;
            }
            if (it.type === 'object' && it.object && it.objectType && it.objectType !== 'olt') {
                var uid = getUid(it.object);
                if (uid) return it.objectType + ':' + uid + (it.port != null ? ':' + it.port : '');
            }
        }
        return 'label:' + getPathEndpointLabel(path);
    }

    function pathSchematicBranchKey(path) {
        return pathSchematicTerminalId(path);
    }

    function selectPathsForSchematic(paths) {
        // Все уникальные окончания — без искусственного потолка
        var n = (paths && paths.length) ? paths.length : 0;
        return selectUniqueTerminalPaths(paths, { max: Math.max(n, 1), preferComplete: true });
    }

    function yieldSchematicBuild(ms) {
        return new Promise(function (resolve) {
            var wait = typeof ms === 'number' ? ms : 0;
            var done = function () {
                if (wait > 0) setTimeout(resolve, wait);
                else setTimeout(resolve, 0);
            };
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(function () { requestAnimationFrame(done); });
            } else {
                done();
            }
        });
    }

    /** Порциями по ~budgetMs, между порциями — уступка UI и обновление прогресса. */
    function runSchematicWorkSlices(total, workAtIndex, ctl, opts) {
        opts = opts || {};
        var budgetMs = opts.budgetMs != null ? opts.budgetMs : 12;
        var label = opts.label || 'Строим схему жил…';
        var hintPrefix = opts.hintPrefix || 'Шаг';
        var progressFrom = opts.progressFrom != null ? opts.progressFrom : 70;
        var progressTo = opts.progressTo != null ? opts.progressTo : 90;
        return (async function () {
            var i = 0;
            while (i < total) {
                if (ctl && ctl.isCancelled && ctl.isCancelled()) return false;
                var t0 = (typeof performance !== 'undefined' && performance.now)
                    ? performance.now()
                    : Date.now();
                while (i < total) {
                    workAtIndex(i);
                    i++;
                    var t1 = (typeof performance !== 'undefined' && performance.now)
                        ? performance.now()
                        : Date.now();
                    if ((t1 - t0) >= budgetMs) break;
                }
                if (ctl && ctl.setProgress) {
                    var pct = progressFrom + Math.round((i / Math.max(1, total)) * (progressTo - progressFrom));
                    ctl.setProgress(label, hintPrefix + ' ' + i + ' из ' + total, pct);
                }
                await yieldSchematicBuild(0);
            }
            return true;
        })();
    }

    function finalizeSchematicModel(model, sourcePath, branchCount, merged) {
        if (!model) return null;
        model.segments = pruneTransitiveSchematicSegments(model.segments || []);
        enrichSchematicModelFromSplitterOutputs(model);
        enrichSchematicModelFromHostSplices(model);
        dedupeSplitterSameOutputHops(model);
        normalizeSchematicOutputLabels(model);

        var outCount = {};
        var inCount = {};
        (model.segments || []).forEach(function (s) {
            if (!s) return;
            outCount[s.fromIdx] = (outCount[s.fromIdx] || 0) + 1;
            inCount[s.toIdx] = (inCount[s.toIdx] || 0) + 1;
        });
        var leafCount = 0;
        (model.nodes || []).forEach(function (_n, i) {
            if (!outCount[i] && inCount[i]) leafCount++;
        });
        model.tree = Object.keys(outCount).some(function (k) { return outCount[k] > 1; }) ||
            (model.nodes && model.nodes.length > 3);
        model.sourcePath = sourcePath || model.sourcePath;
        model.branchCount = Math.max(branchCount || 1, leafCount);
        model.merged = !!merged || !!model.tree;
        return model;
    }

    function finalizeSchematicModelAsync(model, sourcePath, branchCount, merged, ctl) {
        return (async function () {
            if (!model) return null;
            if (ctl && ctl.setProgress) {
                ctl.setProgress('Строим схему жил…', 'Убираем лишние связи', 82);
            }
            await yieldSchematicBuild(8);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return null;
            model.segments = pruneTransitiveSchematicSegments(model.segments || []);

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Строим схему жил…', 'Подписываем выходы сплиттеров', 85);
            }
            await yieldSchematicBuild(8);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return null;
            enrichSchematicModelFromSplitterOutputs(model);

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Строим схему жил…', 'Добавляем сварки', 88);
            }
            await yieldSchematicBuild(8);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return null;
            enrichSchematicModelFromHostSplices(model);

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Строим схему жил…', 'Чистим дубликаты', 90);
            }
            await yieldSchematicBuild(8);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return null;
            dedupeSplitterSameOutputHops(model);
            normalizeSchematicOutputLabels(model);

            var outCount = {};
            var inCount = {};
            (model.segments || []).forEach(function (s) {
                if (!s) return;
                outCount[s.fromIdx] = (outCount[s.fromIdx] || 0) + 1;
                inCount[s.toIdx] = (inCount[s.toIdx] || 0) + 1;
            });
            var leafCount = 0;
            (model.nodes || []).forEach(function (_n, i) {
                if (!outCount[i] && inCount[i]) leafCount++;
            });
            model.tree = Object.keys(outCount).some(function (k) { return outCount[k] > 1; }) ||
                (model.nodes && model.nodes.length > 3);
            model.sourcePath = sourcePath || model.sourcePath;
            model.branchCount = Math.max(branchCount || 1, leafCount);
            model.merged = !!merged || !!model.tree;
            return model;
        })();
    }

    function buildCombinedSchematicModel(paths) {
        var chosen = selectPathsForSchematic(paths);
        if (!chosen.length) return null;
        if (chosen.length === 1) {
            var single = buildTraceSchematicModel(chosen[0]);
            return finalizeSchematicModel(single, chosen[0], 1, !!single.tree);
        }

        var nodeMap = {};
        var nodes = [];
        var segments = [];
        var segKeys = {};

        function addNode(n) {
            if (!n || n.id == null) return -1;
            var id = String(n.id);
            if (nodeMap[id] != null) {
                var existing = nodes[nodeMap[id]];
                if (n.port != null && existing.port == null) existing.port = n.port;
                if (n.fromSplitterOutput != null && existing.fromSplitterOutput == null) {
                    existing.fromSplitterOutput = n.fromSplitterOutput;
                }
                if (n.name && (!existing.name || existing.name.length < n.name.length)) existing.name = n.name;
                return nodeMap[id];
            }
            var idx = nodes.length;
            nodes.push({
                id: id,
                name: n.name,
                type: n.type,
                object: n.object,
                reserveM: n.reserveM || 0,
                port: n.port != null ? n.port : null,
                embeddedInHost: n.embeddedInHost || null,
                fromSplitterOutput: n.fromSplitterOutput != null ? n.fromSplitterOutput : null
            });
            nodeMap[id] = idx;
            return idx;
        }

        chosen.forEach(function (path) {
            var m = buildTraceSchematicModel(path);
            var localIdx = m.nodes.map(addNode);
            m.segments.forEach(function (seg) {
                var fi = localIdx[seg.fromIdx];
                var ti = localIdx[seg.toIdx];
                if (fi < 0 || ti < 0 || fi === ti) return;
                var key = fi + '>' + ti + '>' + (seg.cableId || '') + '>' + (seg.kind || 'cable') + '>' +
                    (seg.tracedFiber != null ? seg.tracedFiber : '');
                if (segKeys[key]) return;
                segKeys[key] = true;
                segments.push(Object.assign({}, seg, { fromIdx: fi, toIdx: ti }));
            });
        });

        return finalizeSchematicModel({
            nodes: nodes,
            segments: segments,
            merged: true,
            sourcePath: chosen[0],
            branchCount: chosen.length
        }, chosen[0], chosen.length, true);
    }

    function buildTraceSchematicHtmlShell(model, path, opts) {
        opts = opts || {};
        if (!model || !model.nodes.length) return null;
        var metricsPath = opts.metricsPath || model.sourcePath || path;
        var metrics = metricsPath
            ? summarizePathMetrics(enrichPathWithLengths(metricsPath))
            : { distanceM: null, reserveM: 0 };
        var isTree = !!(model.tree || model.merged);
        var head = '<div class="trace-schematic' + (isTree ? ' trace-schematic--tree' : '') + '">';
        head += '<div class="trace-schematic-head">';
        head += '<div class="trace-schematic-title-row">';
        head += '<div class="trace-schematic-title">Схема жил</div>';
        if (model.merged && model.branchCount > 1) {
            head += '<div class="trace-schematic-branch-hint" title="Все найденные окончания на одной схеме">одна схема · ' +
                model.branchCount + ' оконч.</div>';
        } else if (opts.totalBranches > 1) {
            head += '<div class="trace-schematic-branch-hint">веток маршрута: ' + opts.totalBranches + '</div>';
        }
        head += '</div>';
        head += buildTraceSchematicToolbarHtml();
        head += '</div>';
        head += '<div class="trace-sch-export-root">';
        if (isTree) {
            head += '<div class="trace-schematic-legend trace-schematic-legend--tree">';
            head += '<span class="trace-sch-leg trace-sch-leg--olt">OLT</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--host">кросс / муфта</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--splitter">сплиттер</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--onu">ONU</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--traced">трассируемая жила</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--used">остальные жилы</span>';
            head += '</div>';
        } else {
            head += '<div class="trace-schematic-legend">';
            head += '<span class="trace-sch-leg trace-sch-leg--traced">трассируемая</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--used">занята / сварка</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--free">свободна</span>';
            head += '<span class="trace-sch-leg trace-sch-leg--branch">ушла в другой кабель</span>';
            head += '</div>';
            head += buildTraceSchematicOverviewHtml(model);
        }
        if (metrics.distanceM != null || metrics.reserveM > 0) {
            head += '<div class="trace-schematic-metrics">';
            if (metrics.distanceM != null) head += '<span>~' + metrics.distanceM + ' м по трассе</span>';
            if (metrics.reserveM > 0) head += '<span>запас ' + metrics.reserveM + ' м</span>';
            head += '</div>';
        }
        var midOpen = '<div class="trace-schematic-scroll"><div class="trace-sch-zoom-inner">';
        var midClose = '</div></div></div>';
        var foot = '';
        if (isTree) {
            foot = '<p class="trace-schematic-hint">На кабеле в кросс/муфту — все жилы и куда каждая уходит (сварка / ONU / сплиттер / свободна). Ветки от сплиттера — отдельные отводы (вых.N), без общей вертикальной линии. Ctrl+колёсико — масштаб.</p>';
        } else {
            foot = '<p class="trace-schematic-hint">Прямые параллельные линии — жилы кабеля. Голубая с точками — трассируемая. Пунктир — свободна. Ответвление вниз — сварка в другой кабель. Ctrl+колёсико — масштаб.</p>';
        }
        foot += '</div>';
        return { head: head, midOpen: midOpen, midClose: midClose, foot: foot, isTree: isTree };
    }

    /**
     * Сборка схемы с уступками UI — любое число веток, прогресс постоянно обновляется.
     */
    function buildTraceSchematicsHtmlAsync(paths, ctl) {
        return (async function () {
            if (!paths || !paths.length) return '';
            var chosen = selectPathsForSchematic(paths);
            if (!chosen.length) return '';

            if (ctl && ctl.setProgress) {
                ctl.setProgress(
                    'Строим схему жил…',
                    'Веток к отрисовке: ' + chosen.length,
                    68
                );
            }
            await yieldSchematicBuild(20);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            var model = null;
            if (chosen.length === 1) {
                if (ctl && ctl.setProgress) {
                    ctl.setProgress('Строим схему жил…', 'Собираем узлы маршрута', 74);
                }
                await yieldSchematicBuild(12);
                if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';
                model = buildTraceSchematicModel(chosen[0]);
                await yieldSchematicBuild(12);
                if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';
                model = await finalizeSchematicModelAsync(model, chosen[0], 1, !!model.tree, ctl);
            } else {
                var nodeMap = {};
                var nodes = [];
                var segments = [];
                var segKeys = {};

                function addNode(n) {
                    if (!n || n.id == null) return -1;
                    var id = String(n.id);
                    if (nodeMap[id] != null) {
                        var existing = nodes[nodeMap[id]];
                        if (n.port != null && existing.port == null) existing.port = n.port;
                        if (n.fromSplitterOutput != null && existing.fromSplitterOutput == null) {
                            existing.fromSplitterOutput = n.fromSplitterOutput;
                        }
                        if (n.name && (!existing.name || existing.name.length < n.name.length)) {
                            existing.name = n.name;
                        }
                        return nodeMap[id];
                    }
                    var idx = nodes.length;
                    nodes.push({
                        id: id,
                        name: n.name,
                        type: n.type,
                        object: n.object,
                        reserveM: n.reserveM || 0,
                        port: n.port != null ? n.port : null,
                        embeddedInHost: n.embeddedInHost || null,
                        fromSplitterOutput: n.fromSplitterOutput != null ? n.fromSplitterOutput : null
                    });
                    nodeMap[id] = idx;
                    return idx;
                }

                var ok = await runSchematicWorkSlices(chosen.length, function (pi) {
                    var m = buildTraceSchematicModel(chosen[pi]);
                    var localIdx = m.nodes.map(addNode);
                    m.segments.forEach(function (seg) {
                        var fi = localIdx[seg.fromIdx];
                        var ti = localIdx[seg.toIdx];
                        if (fi < 0 || ti < 0 || fi === ti) return;
                        var key = fi + '>' + ti + '>' + (seg.cableId || '') + '>' + (seg.kind || 'cable') + '>' +
                            (seg.tracedFiber != null ? seg.tracedFiber : '');
                        if (segKeys[key]) return;
                        segKeys[key] = true;
                        segments.push(Object.assign({}, seg, { fromIdx: fi, toIdx: ti }));
                    });
                }, ctl, {
                    budgetMs: 10,
                    label: 'Строим схему жил…',
                    hintPrefix: 'Ветка',
                    progressFrom: 70,
                    progressTo: 82
                });
                if (!ok) return '';

                model = await finalizeSchematicModelAsync({
                    nodes: nodes,
                    segments: segments,
                    merged: true,
                    sourcePath: chosen[0],
                    branchCount: chosen.length
                }, chosen[0], chosen.length, true, ctl);
            }

            if (!model || !model.nodes || !model.nodes.length) return '';
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Рисуем схему…', 'Подготовка макета', 92);
            }
            await yieldSchematicBuild(24);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            var shell = buildTraceSchematicHtmlShell(model, model.sourcePath || paths[0], {
                totalBranches: paths.length,
                metricsPath: model.sourcePath || paths[0]
            });
            if (!shell) return '';

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Рисуем схему…', 'Отрисовка SVG', null);
            }
            await yieldSchematicBuild(32);
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            var svg = '';
            try {
                svg = await renderTraceSchematicSvgAsync(model, ctl) || '';
            } catch (err) {
                svg = '';
            }
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';

            if (ctl && ctl.setProgress) {
                ctl.setProgress('Почти готово…', 'Собираем панель', 98);
            }
            await yieldSchematicBuild(8);
            return shell.head + shell.midOpen + svg + shell.midClose + shell.foot;
        })();
    }

    function buildTraceSchematicsHtml(paths) {
        if (!paths || !paths.length) return '';
        var model = buildCombinedSchematicModel(paths);
        if (!model || !model.nodes.length) return '';
        return buildTraceSchematicHtml(model.sourcePath || paths[0], {
            model: model,
            totalBranches: paths.length,
            metricsPath: model.sourcePath || paths[0]
        });
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
            } else if (item.type === 'radioBridgeConnection' && item.radioBridge && item.radioBridge.geometry) {
                try { points.push({ coords: item.radioBridge.geometry.getCoordinates(), type: 'radioBridge' }); } catch (e5rb) {}
            } else if (item.type === 'oltPortConnection' && item.olt) {
                var oltCoords = getTraceObjectCoords(item.olt);
                if (oltCoords) {
                    // Не рисовать нулевую линию, если OLT уже текущая точка (префикс OLT → oltPort → кабель).
                    if (!lastObj || getUid(lastObj) !== getUid(item.olt)) {
                        pushTraceLinkLine(lastObj, oltCoords, lines);
                    }
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
        if (item.type === 'radioBridgeConnection') {
            return '  ◎ Радиомост «' + (item.radioBridgeName || 'РМ') + '», жила ' + item.fiberNumber;
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
            if (item.type === 'onuConnection') return 'ONU:' + (item.onu ? getUid(item.onu) : item.onuName);
            if (item.type === 'mediaConverterConnection') return 'MC:' + (item.mediaConverter ? getUid(item.mediaConverter) : item.mediaConverterName);
            if (item.type === 'radioBridgeConnection') return 'RB:' + (item.radioBridge ? getUid(item.radioBridge) : item.radioBridgeName);
            if (item.type === 'crossPortPatch') {
                return 'P:' + (item.fromCross ? getUid(item.fromCross) : '') + ':' + item.fromPort + '>' +
                    (item.toCross ? getUid(item.toCross) : '') + ':' + item.toPort;
            }
            return item.type;
        }).join('|');
    }

    /** Цепочка кабелей — для отсечения зеркального «реверса» той же трассы. */
    function cableChainSignature(path) {
        if (!path || !path.length) return '';
        return path.filter(function (item) { return item.type === 'cable'; })
            .map(function (item) { return item.cableId + ':' + item.fiberNumber; })
            .join('>');
    }

    function pathEndpointUids(path) {
        var first = null;
        var last = null;
        if (!path) return { first: null, last: null };
        path.forEach(function (item) {
            var uid = null;
            if ((item.type === 'start' || item.type === 'object') && item.object) uid = getUid(item.object);
            else if (item.type === 'onuConnection' && item.onu) uid = getUid(item.onu);
            else if (item.type === 'mediaConverterConnection' && item.mediaConverter) uid = getUid(item.mediaConverter);
            else if (item.type === 'radioBridgeConnection' && item.radioBridge) uid = getUid(item.radioBridge);
            else if (item.type === 'nodeConnection' && item.node && !item.fromNode) uid = getUid(item.node);
            else if (item.type === 'oltPortConnection' && item.olt) uid = getUid(item.olt);
            if (uid) {
                if (!first) first = uid;
                last = uid;
            }
        });
        return { first: first, last: last };
    }

    function dedupePaths(paths) {
        if (!Array.isArray(paths) || paths.length < 2) return paths || [];
        var seen = new Set();
        var seenRoutes = [];
        var out = [];
        paths.forEach(function (path) {
            var sig = pathSignature(path);
            if (seen.has(sig)) return;
            var chain = cableChainSignature(path);
            var ends = pathEndpointUids(path);
            if (chain && ends.first && ends.last) {
                var revChain = chain.split('>').reverse().join('>');
                var isMirror = seenRoutes.some(function (r) {
                    return r.chain === revChain && r.first === ends.last && r.last === ends.first;
                });
                if (isMirror) return;
                seenRoutes.push({ chain: chain, first: ends.first, last: ends.last });
            }
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
        var unique = selectUniqueTerminalPaths(paths, { max: 48, preferComplete: true });
        // Индекс чипа → исходный path (для перехода к блоку ветки)
        var indexMap = unique.map(function (p) {
            var idx = paths.indexOf(p);
            return idx >= 0 ? idx : 0;
        });
        var complete = 0;
        unique.forEach(function (path) {
            if (analyzePathStatus(path).status === 'complete') complete++;
        });
        var html = '<div class="trace-paths-overview">';
        html += '<span class="trace-paths-overview-title">Окончаний: ' + unique.length;
        if (unique.length < paths.length) {
            html += ' <span class="trace-paths-overview-sub">из ' + paths.length + ' веток</span>';
        }
        html += '</span>';
        unique.forEach(function (path, i) {
            var st = analyzePathStatus(path);
            var dist = estimatePathDistanceM(path);
            var icon = st.status === 'complete' ? '✓' : '⚠';
            var endpointLabel = getPathEndpointLabel(path);
            var srcIdx = indexMap[i];
            html += '<button type="button" class="trace-branch-chip' +
                (st.status === 'complete' ? ' trace-branch-chip--ok' : ' trace-branch-chip--warn') +
                '" data-branch-index="' + srcIdx + '" title="' + esc(st.label) + '">';
            html += '<span class="trace-branch-chip-icon">' + icon + '</span> ';
            html += esc(endpointLabel);
            if (dist != null) html += ' · ~' + dist + ' м';
            html += '</button>';
        });
        html += '<span class="trace-paths-overview-hint">До конца: ' + complete + ' из ' + unique.length + '</span>';
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
            } else if (item.type === 'radioBridgeConnection') {
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">◎</span>' +
                    '<div class="trace-item-main"><span>РМ «' + esc(item.radioBridgeName || 'РМ') + '» · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.radioBridge ? getUid(item.radioBridge) : null) + '</div>';
            } else if (item.type === 'splitterConnection') {
                var spName = item.splitter && item.splitter.properties ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>На «' + esc(spName) + '» · ж' + item.fiberNumber + '</span></div>' +
                    mapPinBtn(item.splitter ? getUid(item.splitter) : null) + '</div>';
            } else if (item.type === 'splitterOutputToOnu') {
                var onuOutLabel = 'Выход → ONU «' + esc(item.onuName || 'ONU') + '»';
                if (item.fiberNumber != null) onuOutLabel += ' · ж' + item.fiberNumber;
                html += '<div class="trace-item trace-item--meta">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">🔀</span>' +
                    '<div class="trace-item-main"><span>' + onuOutLabel + '</span></div>' +
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
        zoom = Math.max(0.25, Math.min(2.5, Math.round(zoom * 20) / 20));
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
        var isTree = svg.classList.contains('trace-schematic-svg--tree') ||
            !!(root.classList && root.classList.contains('trace-schematic--tree'));
        // Дерево: вписать по ширине; при высокой схеме чуть уменьшить
        var z = isTree
            ? Math.min(availW / baseW, 1.2)
            : Math.min(availW / baseW, availH / baseH, 1.5);
        if (isTree && baseH * z > availH) {
            z = Math.min(z, availH / baseH);
        }
        return applyTraceSchematicZoom(root, Math.max(0.25, z));
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
        buildTraceSchematicsHtmlAsync: buildTraceSchematicsHtmlAsync,
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
