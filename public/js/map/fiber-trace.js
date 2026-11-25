/**
 * FiberTrace — продольная трассировка (стиль FiberBase), написана с нуля.
 * Контракт window.FiberTrace используется app/fiber-trace.js и fiber-trace-extra.js.
 */
(function (global) {
    'use strict';

    var WAYPOINT_TYPES = ['support', 'attachment', 'manhole'];

    function esc(s) {
        if (typeof global.escapeHtml === 'function') return global.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function svgEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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

    function isFiberHostType(type) {
        if (typeof global.isFiberHostType === 'function') return global.isFiberHostType(type);
        return type === 'sleeve' || type === 'cross' || type === 'spliceCassette';
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
            default: return '📍';
        }
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
        var spans = (cable.properties && cable.properties.get('undergroundSpans')) || [];
        if (!points || points.length < 2) {
            try { return cable.geometry ? cable.geometry.getCoordinates() : []; }
            catch (e) { return []; }
        }
        var fromIdx = findPointIndexOnRoute(points, fromObj);
        var toIdx = findPointIndexOnRoute(points, toObj);
        if (fromIdx < 0 || toIdx < 0) {
            try { return cable.geometry ? cable.geometry.getCoordinates() : []; }
            catch (e2) { return []; }
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
            var pt = getTraceObjectCoords(p);
            if (pt) coords.push(pt);
        });
        return coords.length >= 2 ? coords : [];
    }

    function roundMeters(n) {
        if (n == null || isNaN(Number(n))) return null;
        return Math.round(Number(n) * 10) / 10;
    }

    /** Сырая длина по координатам (м), без округления каждого ребра. */
    function measureCoordsLengthM(coords) {
        if (!coords || coords.length < 2) return 0;
        var total = 0;
        var R = 6371000;
        for (var i = 0; i < coords.length - 1; i++) {
            var a = coords[i];
            var b = coords[i + 1];
            if (!a || !b || a.length < 2 || b.length < 2) continue;
            if (typeof global.calculateDistance === 'function') {
                /* calculateDistance уже в метрах; копим float через хаверсин, чтобы не копить round-ошибку */
            }
            var lat1 = Number(a[0]) * Math.PI / 180;
            var lat2 = Number(b[0]) * Math.PI / 180;
            var dLat = (Number(b[0]) - Number(a[0])) * Math.PI / 180;
            var dLon = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
            var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            total += 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
        }
        return total;
    }

    function getCableDeclaredLengthM(cable) {
        if (!cable || !cable.properties) return null;
        var lm = cable.properties.get('lengthM');
        if (lm != null && lm !== '' && !isNaN(Number(lm)) && Number(lm) >= 0) return Number(lm);
        var dist = cable.properties.get('distance');
        if (dist != null && dist !== '' && !isNaN(Number(dist)) && Number(dist) >= 0) return Number(dist);
        return null;
    }

    function getObjectReserveM(obj) {
        if (!obj || !obj.properties) return 0;
        var v = obj.properties.get('reserveM');
        if (v == null || v === '') return 0;
        var n = Number(v);
        return (!isNaN(n) && n > 0) ? n : 0;
    }

    function resolvePathCableObject(item) {
        if (!item) return null;
        if (item.cable) return item.cable;
        if (!item.cableId || !Array.isArray(global.objects)) return null;
        return global.objects.find(function (o) {
            return o.properties && o.properties.get('type') === 'cable' && getUid(o) === item.cableId;
        }) || null;
    }

    function sameTraceObj(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        var ua = getUid(a);
        var ub = getUid(b);
        return !!(ua && ub && String(ua) === String(ub));
    }

    function hostObjFromPathItem(item) {
        if (!item) return null;
        if (item.type === 'start' || item.type === 'object') {
            var o = item.object;
            if (o && o._embedded && o._host) return o._host;
            return o || null;
        }
        if (item.type === 'nodeConnection') {
            if (item.fromNode) return item.cross || item.node || null;
            return item.node || item.cross || null;
        }
        if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') {
            return item.onu || item.onuObj || null;
        }
        if (item.type === 'oltPortConnection') return item.olt || null;
        if (item.type === 'mediaConverterConnection' || item.type === 'splitterOutputToMediaConverter') {
            return item.mediaConverter || item.mediaConverterObj || null;
        }
        if (item.type === 'radioBridgeConnection') return item.radioBridge || null;
        if (item.type === 'splitterConnection' || item.type === 'splitterOutputToSplitter') {
            return item.splitter || item.toSplitter || null;
        }
        if (item.type === 'splitterOutputToNode') return item.node || item.nodeObj || null;
        return null;
    }

    function getCableFullGeomLengthM(cable) {
        if (!cable) return 0;
        var fullCoords = [];
        try { fullCoords = cable.geometry ? cable.geometry.getCoordinates() : []; } catch (e) { fullCoords = []; }
        if (!fullCoords || fullCoords.length < 2) {
            var routePts = getCableRoutePoints(cable);
            if (routePts && routePts.length >= 2) {
                fullCoords = [];
                routePts.forEach(function (p) {
                    var rc = getTraceObjectCoords(p);
                    if (rc) fullCoords.push(rc);
                });
            }
        }
        return measureCoordsLengthM(fullCoords);
    }

    /**
     * Длина пролёта трассы по кабелю между двумя хостами.
     * Не подставляет длину ВСЕГО кабеля, если точки пролёта не найдены на маршруте.
     */
    function estimateSegmentDistanceM(cable, fromObj, toObj) {
        if (!cable) {
            var c1 = getTraceObjectCoords(fromObj);
            var c2 = getTraceObjectCoords(toObj);
            if (c1 && c2) return roundMeters(measureCoordsLengthM([c1, c2]));
            return null;
        }
        var declared = getCableDeclaredLengthM(cable);
        var points = getCableRoutePoints(cable);
        var fromIdx = (points && fromObj) ? findPointIndexOnRoute(points, fromObj) : -1;
        var toIdx = (points && toObj) ? findPointIndexOnRoute(points, toObj) : -1;
        var cableFrom = cable.properties ? cable.properties.get('from') : null;
        var cableTo = cable.properties ? cable.properties.get('to') : null;
        var isFullHop = (sameTraceObj(fromObj, cableFrom) && sameTraceObj(toObj, cableTo)) ||
            (sameTraceObj(fromObj, cableTo) && sameTraceObj(toObj, cableFrom));

        if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
            var segCoords = getCableSegmentCoords(cable, fromObj, toObj);
            var segGeom = measureCoordsLengthM(segCoords);
            if (declared == null) return segGeom > 0 ? roundMeters(segGeom) : null;
            if (isFullHop) return roundMeters(declared);
            var fullGeom = getCableFullGeomLengthM(cable);
            if (fullGeom <= 0.5) return roundMeters(declared);
            if (segGeom <= 0) return null;
            var ratio = Math.min(1, Math.max(0, segGeom / fullGeom));
            if (ratio >= 0.92) return roundMeters(declared);
            /* Пропорция от паспортной длины — если кабель «с запасом» относительно геометрии */
            if (declared >= fullGeom * 1.15) return roundMeters(declared * ratio);
            return roundMeters(segGeom > 0 ? segGeom : declared * ratio);
        }

        if (isFullHop && declared != null) return roundMeters(declared);

        /* Точки не на маршруте — не берём весь кабель, только прямую между хостами или паспорт при полном hop */
        var p1 = getTraceObjectCoords(fromObj);
        var p2 = getTraceObjectCoords(toObj);
        if (p1 && p2) {
            var straight = measureCoordsLengthM([p1, p2]);
            if (straight > 0) return roundMeters(straight);
        }
        if (declared != null && isFullHop) return roundMeters(declared);
        return null;
    }

    function enrichPathWithLengths(path) {
        if (!Array.isArray(path) || !path.length) return path || [];
        var out = [];
        var lastObj = null;
        var seenHostReserve = {};
        for (var i = 0; i < path.length; i++) {
            var item = path[i];
            var copy = Object.assign({}, item);
            var host = hostObjFromPathItem(item);

            if (item.type === 'start' || item.type === 'object') {
                lastObj = item.object || lastObj;
                var hostObj = item.object;
                if (hostObj && hostObj._embedded && hostObj._host) hostObj = hostObj._host;
                var t = item.objectType;
                if ((isFiberHostType(t) || t === 'node' || t === 'olt' || t === 'onu' ||
                    t === 'mediaConverter' || t === 'radioBridge' || t === 'splitter') && hostObj) {
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
            } else if (host) {
                lastObj = host;
            }

            if (item.type === 'cable') {
                var cableObj = resolvePathCableObject(item);
                copy.cable = cableObj || item.cable;
                var preset = item.segmentLengthM != null ? Number(item.segmentLengthM)
                    : (item.distanceM != null ? Number(item.distanceM) : NaN);
                var nextObj = null;
                for (var k = i + 1; k < path.length; k++) {
                    var nk = path[k];
                    if (!nk) continue;
                    if ((nk.type === 'object' || nk.type === 'start') && isWaypointType(nk.objectType)) continue;
                    var nh = hostObjFromPathItem(nk);
                    if (nh) { nextObj = nh; break; }
                }
                if (!isNaN(preset) && preset >= 0) {
                    copy.segmentLengthM = roundMeters(preset);
            } else {
                    var len = estimateSegmentDistanceM(copy.cable, lastObj, nextObj);
                    if (len != null) copy.segmentLengthM = len;
                }
            } else if (item.type === 'nodeConnection') {
                /* Патч узел↔кросс: короткая связь по координатам */
                var a = item.fromNode ? item.node : item.cross;
                var b = item.fromNode ? item.cross : item.node;
                var patchLen = estimateSegmentDistanceM(null, a || item.node, b || item.cross);
                if (patchLen != null) copy.segmentLengthM = patchLen;
            }

            out.push(copy);
        }
        return out;
    }

    function summarizePathMetrics(path) {
        var distanceM = null;
        var reserveM = 0;
        var reserveNodes = 0;
        var sum = 0;
        var has = false;
        (path || []).forEach(function (item) {
            if (!item) return;
            if ((item.type === 'cable' || item.type === 'nodeConnection') && item.segmentLengthM != null) {
                sum += Number(item.segmentLengthM) || 0;
                has = true;
            }
            if ((item.type === 'start' || item.type === 'object') && item.reserveCounted && item.reserveM > 0) {
                reserveM += Number(item.reserveM) || 0;
                reserveNodes++;
            }
        });
        if (has) distanceM = roundMeters(sum);
        return {
            distanceM: distanceM,
            reserveM: roundMeters(reserveM) || 0,
            reserveNodes: reserveNodes
        };
    }

    function estimatePathDistanceM(path) {
        return summarizePathMetrics(enrichPathWithLengths(path)).distanceM;
    }

    function compressPathForDisplay(path) {
        if (!path || !path.length) return path || [];
        var out = [];
        for (var i = 0; i < path.length; i++) {
            var item = path[i];
            if (!item) continue;
            if ((item.type === 'object' || item.type === 'start') && isWaypointType(item.objectType)) continue;
            out.push(item);
        }
        return out.length ? out : path;
    }

    function analyzePathStatus(path) {
        if (!path || !path.length) {
            return { status: 'empty', label: 'Путь пуст', cssClass: 'trace-path-status--empty' };
        }
        for (var i = path.length - 1; i >= 0; i--) {
            var item = path[i];
            if (item.type === 'object' && item.objectType === 'onu') {
                return { status: 'complete', endpoint: 'onu', label: 'Доходит до ONU «' + (item.objectName || 'ONU') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') {
                return { status: 'complete', endpoint: 'onu', label: 'Доходит до ONU «' + (item.onuName || 'ONU') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'oltPortConnection') {
                var hasLater = false;
                for (var k = i + 1; k < path.length; k++) {
                    var a = path[k];
                    if (a.type === 'cable' || a.type === 'connection' || a.type === 'splitterConnection') { hasLater = true; break; }
                    if (a.type === 'object' && a.objectType && a.objectType !== 'olt') { hasLater = true; break; }
                }
                if (hasLater) continue;
                var oltPortLabel = item.incoming ? 'приход' : ('порт ' + item.portNumber);
                return { status: 'complete', endpoint: 'olt', label: 'Доходит до OLT «' + (item.oltName || 'OLT') + '», ' + oltPortLabel, cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'object' && item.objectType === 'olt') {
                return { status: 'complete', endpoint: 'olt', label: 'Доходит до OLT «' + (item.objectName || 'OLT') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'splitterOutputToNode' || (item.type === 'object' && item.objectType === 'node')) {
                var nodeLabel = item.nodeName || item.objectName || 'Узел';
                return { status: 'complete', endpoint: 'node', label: 'Доходит до узла «' + nodeLabel + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'object' && item.objectType === 'mediaConverter') {
                return { status: 'complete', endpoint: 'mediaConverter', label: 'Доходит до медиаконвертера «' + (item.objectName || 'Медиаконвертер') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'mediaConverterConnection') {
                return { status: 'complete', endpoint: 'mediaConverter', label: 'Вывод на медиаконвертер «' + (item.mediaConverterName || 'Медиаконвертер') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'object' && item.objectType === 'radioBridge') {
                return { status: 'complete', endpoint: 'radioBridge', label: 'Доходит до радиомоста «' + (item.objectName || 'Радиомост') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'radioBridgeConnection') {
                return { status: 'complete', endpoint: 'radioBridge', label: 'Вывод на радиомост «' + (item.radioBridgeName || 'Радиомост') + '»', cssClass: 'trace-path-status--complete' };
            }
            if (item.type === 'nodeConnection' && !item.fromNode) {
                return { status: 'complete', endpoint: 'node', label: 'Вывод на узел «' + (item.nodeName || 'Узел') + '»', cssClass: 'trace-path-status--complete' };
            }
        }
        var lastObjItem = null;
        for (var j = path.length - 1; j >= 0; j--) {
            if (path[j].type === 'object' || path[j].type === 'start') { lastObjItem = path[j]; break; }
        }
        if (!lastObjItem) {
            return { status: 'incomplete', label: 'Маршрут обрывается', cssClass: 'trace-path-status--incomplete' };
        }
        var t = lastObjItem.objectType;
        var name = lastObjItem.objectName || getTypeName(t);
        if (isWaypointType(t)) {
            return { status: 'incomplete', endpoint: t, label: 'Обрыв на ' + getTypeName(t).toLowerCase() + ' «' + name + '»', cssClass: 'trace-path-status--incomplete' };
        }
        if (isFiberHostType(t)) {
            return { status: 'incomplete', endpoint: t, label: 'Обрыв в ' + getTypeName(t).toLowerCase() + ' «' + name + '» — нет сварки на выходе', cssClass: 'trace-path-status--incomplete' };
        }
        return { status: 'incomplete', endpoint: t, label: 'Конец трассы: ' + getTypeName(t) + ' «' + name + '»', cssClass: 'trace-path-status--incomplete' };
    }

    function getPathEndpointLabel(path) {
        var st = analyzePathStatus(path);
        if (st.status === 'complete') {
        for (var i = path.length - 1; i >= 0; i--) {
            var item = path[i];
                if (item.type === 'object' && item.objectType === 'onu') return item.objectName || 'ONU';
                if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') return item.onuName || 'ONU';
                if (item.type === 'object' && item.objectType === 'olt') return item.objectName || 'OLT';
                if (item.type === 'oltPortConnection') return (item.oltName || 'OLT') + (item.portNumber != null ? ', порт ' + item.portNumber : '');
                if (item.type === 'object' && item.objectType === 'node') return item.objectName || 'Узел';
                if (item.type === 'splitterOutputToNode') return item.nodeName || 'Узел';
                if (item.type === 'nodeConnection' && !item.fromNode) return item.nodeName || 'Узел';
                if (item.type === 'object' && item.objectType === 'mediaConverter') return item.objectName || 'Медиаконвертер';
                if (item.type === 'mediaConverterConnection') return item.mediaConverterName || 'Медиаконвертер';
                if (item.type === 'object' && item.objectType === 'radioBridge') return item.objectName || 'Радиомост';
                if (item.type === 'radioBridgeConnection') return item.radioBridgeName || 'Радиомост';
            }
        }
        for (var j = path.length - 1; j >= 0; j--) {
            if (path[j].type === 'object' || path[j].type === 'start') {
                return path[j].objectName || getTypeName(path[j].objectType);
            }
        }
        return '—';
    }

    function pathSignature(path) {
        if (!path || !path.length) return '';
        return path.map(function (it) {
            if (!it) return '';
            if (it.type === 'cable') return 'c:' + it.cableId + ':' + it.fiberNumber;
            if (it.type === 'object' || it.type === 'start') return 'o:' + (getUid(it.object) || it.objectName) + ':' + it.objectType;
            return it.type + ':' + (it.cableId || it.portNumber || '');
        }).join('|');
    }

    function dedupePaths(paths) {
        var seen = {};
        var out = [];
        (paths || []).forEach(function (p) {
            var sig = pathSignature(p);
            if (seen[sig]) return;
            seen[sig] = true;
            out.push(p);
        });
        return out;
    }

    function prependNodePrefixToPath(path, nodeObj, crossObj, cableId, fiberNumber, nodeConn) {
        if (!path || !path.length || !nodeObj) return path || [];
        var head = [{
            type: 'start',
            objectType: 'node',
            objectName: (nodeObj.properties && nodeObj.properties.get('name')) || 'Узел',
            object: nodeObj
        }, {
            type: 'nodeConnection',
            fromNode: true,
            node: nodeObj,
            nodeName: (nodeObj.properties && nodeObj.properties.get('name')) || 'Узел',
            cross: crossObj || null,
            cableId: cableId,
            fiberNumber: fiberNumber
        }];
        if (nodeConn) head[1] = Object.assign(head[1], nodeConn);
        var first = path[0];
        if (first && first.type === 'start' && first.objectType === 'node' && getUid(first.object) === getUid(nodeObj)) {
            return path;
        }
        return head.concat(path);
    }

    function pushTraceLinkLine(fromObj, toCoords, lines) {
        var fromCoords = getTraceObjectCoords(fromObj);
        if (!fromCoords || !toCoords) return;
        lines.push({ coords: [fromCoords, toCoords], underground: false });
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
                if (traceCoords) points.push({ coords: traceCoords, type: item.objectType });
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
                        if (global.CableUnderground && CableUnderground.isUndergroundLegBetween) {
                            var routePts = getCableRoutePoints(item.cable);
                            var spans = item.cable.properties.get('undergroundSpans') || [];
                            if (routePts) {
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
            } else if (item.type === 'onuConnection' && item.onu && item.onu.geometry) {
                try { points.push({ coords: item.onu.geometry.getCoordinates(), type: 'onu' }); } catch (e) {}
            } else if (item.type === 'nodeConnection' && item.node && item.node.geometry) {
                try { points.push({ coords: item.node.geometry.getCoordinates(), type: 'node' }); } catch (e2) {}
            } else if (item.type === 'oltPortConnection' && item.olt) {
                var oltCoords = getTraceObjectCoords(item.olt);
                if (oltCoords) {
                    if (!lastObj || getUid(lastObj) !== getUid(item.olt)) pushTraceLinkLine(lastObj, oltCoords, lines);
                    points.push({ coords: oltCoords, type: 'olt' });
                lastObj = item.olt;
            }
            }
        });
        return { lines: lines, points: points };
    }

    /* ========== Schematic model ========== */

    function findCableById(cableId) {
        if (!cableId || !Array.isArray(global.objects)) return null;
        return global.objects.find(function (o) {
            return o.properties && o.properties.get('type') === 'cable' && getUid(o) === cableId;
        }) || null;
    }

    function resolveFiberFateAtHost(hostObj, cableId, fiberNumber, nextCableId) {
        if (!hostObj || !hostObj.properties || fiberNumber == null) {
            return { kind: 'free', label: 'свободна' };
            }
            var conns = hostObj.properties.get('fiberConnections') || [];
        var peer = null;
        for (var i = 0; i < conns.length; i++) {
            var c = conns[i];
            if (!c || !c.from || !c.to) continue;
            var a = c.from;
            var b = c.to;
            if (String(a.cableId) === String(cableId) && Number(a.fiberNumber) === Number(fiberNumber)) {
                peer = b;
                break;
            }
            if (String(b.cableId) === String(cableId) && Number(b.fiberNumber) === Number(fiberNumber)) {
                peer = a;
                break;
            }
        }
        if (!peer) {
            var ports = hostObj.properties.get('fiberPorts') || {};
            var key = cableId + '-' + fiberNumber;
            if (ports[key] != null) return { kind: 'end', label: 'порт ' + ports[key] };
            return { kind: 'free', label: 'свободна' };
        }
        /* Тот же кабель, что и дальше по трассе — продолжение */
        if (nextCableId && String(peer.cableId) === String(nextCableId)) {
                return {
                    kind: 'continue',
                label: '→ ж' + peer.fiberNumber,
                peerCableId: peer.cableId,
                peerFiber: peer.fiberNumber
            };
        }
        /* Сварка на тот же cableId, что пришёл — не «другой кабель», а ошибка/петля */
        if (String(peer.cableId) === String(cableId)) {
            return {
                kind: 'end',
                label: 'петля ж' + peer.fiberNumber,
                peerCableId: peer.cableId,
                peerFiber: peer.fiberNumber
            };
        }
        var peerCab = findCableById(peer.cableId);
        var peerCabName = peerCab && peerCab.properties
            ? (peerCab.properties.get('cableName') || 'Кабель')
            : 'другой кабель';
        if (peerCabName.length > 22) peerCabName = peerCabName.slice(0, 20) + '…';
            return {
                kind: 'branch',
            label: '→ «' + peerCabName + '» ж' + peer.fiberNumber,
            peerCableId: peer.cableId,
            peerFiber: peer.fiberNumber,
            peerCableName: peerCabName
        };
    }

    function buildFiberRows(seg, toHost, nextCableId, nextTracedFiber, paletteHint) {
        var cable = seg.cable || findCableById(seg.cableId);
        if (!cable && paletteHint && paletteHint.cable) cable = paletteHint.cable;
        var colors = (typeof global.getFiberColors === 'function' && cable) ? (global.getFiberColors(cable) || []) : [];
        if (!colors.length && global.FiberCableConfig &&
            typeof global.FiberCableConfig.buildStandardPalette === 'function') {
            var hintCount = (paletteHint && paletteHint.fiberCount) ||
                Math.max(Number(seg.tracedFiber) || 0, Number(seg.fiberCount) || 0, 24);
            colors = global.FiberCableConfig.buildStandardPalette(hintCount) || [];
        }
        var total = (typeof global.getFiberCount === 'function' && cable) ? (Number(global.getFiberCount(cable)) || 0) : 0;
        if (!total) total = colors.length || Math.max(1, Number(seg.tracedFiber) || 1);
        /* Patch/nodeLink без кабеля: не сжимать веер до «жN = низ колонки» */
        if ((!seg.cableId || seg.kind === 'nodeLink') && paletteHint && paletteHint.fiberCount > total) {
            total = paletteHint.fiberCount;
        }
        var rows = [];
        for (var fi = 1; fi <= total; fi++) {
            var meta = colors.find(function (f) { return f.number === fi; });
            var col = (meta && meta.color) ? meta.color : colorForFiberNumber(cable, fi);
            var traced = Number(seg.tracedFiber) === fi;
            var fate = resolveFiberFateAtHost(toHost && toHost.object, seg.cableId || (paletteHint && paletteHint.cableId), fi, nextCableId);
            /*
             * Трасса важнее портов кросса: если путь идёт на следующий кабель,
             * рисуем continue даже когда fiberPorts дал fate=end (иначе пропадает перемычка).
             */
            if (traced && nextCableId) {
                var peerF = nextTracedFiber != null ? Number(nextTracedFiber) : fi;
                if (!peerF || isNaN(peerF)) peerF = fi;
                fate = {
                    kind: 'continue',
                    label: '→ ж' + peerF,
                    peerCableId: nextCableId,
                    peerFiber: peerF,
                    pathOnly: true
                };
            } else if (traced && (fate.kind === 'free' || fate.kind === 'end')) {
                /* На кроссе/patch без сварки — ровная перемычка той же жилы */
                if (nextTracedFiber != null || seg.kind === 'nodeLink' || !seg.cableId) {
                    var peerFlat = nextTracedFiber != null ? Number(nextTracedFiber) : fi;
                    fate = {
                        kind: 'continue',
                        label: '→ ж' + peerFlat,
                        peerCableId: nextCableId || seg.cableId,
                        peerFiber: peerFlat,
                        pathOnly: true
                    };
                } else if (fate.kind === 'free') {
                    fate = { kind: 'end', label: 'конец трассы' };
                }
            }
            rows.push({
                number: fi,
                color: col,
                name: (meta && meta.name) || '',
                traced: traced,
                fate: fate
            });
        }
        return { cable: cable, total: total, rows: rows };
    }

    function buildTraceSchematicModel(path) {
        var enriched = enrichPathWithLengths(path || []);
        var nodes = [];
        var segments = [];
        var lastHostIdx = -1;
        var pending = null;

        function pushHost(item) {
            var obj = item.object;
            if (!obj) return;
            var uid = getUid(obj) || ('n' + nodes.length);
            if (lastHostIdx >= 0 && getUid(nodes[lastHostIdx].object) === getUid(obj) && !item.port) {
                if (item.port != null) nodes[lastHostIdx].port = item.port;
                return;
            }
            nodes.push({
                id: uid,
                name: item.objectName || getTypeName(item.objectType),
                type: item.objectType,
                object: obj,
                port: item.port || null,
                reserveM: item.reserveM || getObjectReserveM(obj),
                endCaption: null
            });
            if (pending && lastHostIdx >= 0) {
                var toIdx = nodes.length - 1;
                var nextCableHint = null;
                segments.push({
                    kind: pending.kind || 'cable',
                    fromIdx: lastHostIdx,
                    toIdx: toIdx,
                    cableId: pending.cableId,
                    cableName: pending.cableName,
                    cable: pending.cable,
                    lengthM: pending.segmentLengthM != null ? pending.segmentLengthM : null,
                    tracedFiber: pending.fiberNumber,
                    linkLabel: pending.linkLabel || null,
                    fibers: [],
                    fiberCount: 0
                });
                pending = null;
            }
            lastHostIdx = nodes.length - 1;
        }

        enriched.forEach(function (item) {
            if (item.type === 'start' || item.type === 'object') {
                if (isWaypointType(item.objectType)) return;
                pushHost(item);
            } else if (item.type === 'cable' && item.cableId) {
                pending = {
                    kind: 'cable',
                            cableId: item.cableId,
                    cableName: item.cableName || 'Кабель',
                    cable: resolvePathCableObject(item),
                            fiberNumber: item.fiberNumber,
                    segmentLengthM: item.segmentLengthM
                };
            } else if (item.type === 'nodeConnection') {
                pending = {
                    kind: 'nodeLink',
                        cableId: item.cableId,
                    cableName: item.fromNode ? 'Узел → кросс' : 'Кросс → узел',
                    cable: findCableById(item.cableId),
                        fiberNumber: item.fiberNumber,
                    segmentLengthM: item.segmentLengthM != null ? item.segmentLengthM : null,
                    linkLabel: item.fromNode ? ('с узла · ж' + item.fiberNumber) : ('на узел · ж' + item.fiberNumber),
                    fromNode: !!item.fromNode
                };
                if (!item.fromNode && item.node) {
                        pushHost({
                            type: 'object',
                        objectType: 'node',
                        objectName: item.nodeName || 'Узел',
                        object: item.node
                    });
                } else if (item.fromNode && item.cross) {
                        pushHost({
                            type: 'object',
                        objectType: 'cross',
                        objectName: (item.cross.properties && item.cross.properties.get('name')) || 'Кросс',
                        object: item.cross
                    });
                }
            } else if (item.type === 'oltPortConnection' && item.olt) {
                    pushHost({
                        type: 'object',
                        objectType: 'olt',
                    objectName: item.oltName || 'OLT',
                        object: item.olt,
                    port: item.portNumber
                });
            } else if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') {
                var onu = item.onu || item.onuObj;
                if (onu) {
                    if (pending && lastHostIdx >= 0) {
                        /* flush via pushHost */
                    }
                    pushHost({
                        type: 'object',
                        objectType: 'onu',
                        objectName: item.onuName || 'ONU',
                        object: onu
                    });
                }
            } else if (item.type === 'mediaConverterConnection' || item.type === 'splitterOutputToMediaConverter') {
                var mc = item.mediaConverter || item.mediaConverterObj;
                if (mc) {
                    pushHost({
                        type: 'object',
                        objectType: 'mediaConverter',
                        objectName: item.mediaConverterName || 'МК',
                        object: mc
                    });
                }
                    } else if (item.type === 'radioBridgeConnection') {
                if (item.radioBridge) {
                    pushHost({
                        type: 'object',
                        objectType: 'radioBridge',
                        objectName: item.radioBridgeName || 'РМ',
                        object: item.radioBridge
                    });
                }
            } else if (item.type === 'splitterOutputToNode') {
                var node = item.node || item.nodeObj;
                if (node) {
                    pushHost({
                        type: 'object',
                        objectType: 'node',
                        objectName: item.nodeName || 'Узел',
                        object: node
                    });
                }
            } else if (item.type === 'splitterConnection' || item.type === 'splitterOutputToSplitter') {
                var sp = item.splitter || item.toSplitter;
                if (sp) {
                        pushHost({
                            type: 'object',
                        objectType: 'splitter',
                        objectName: (sp.properties && sp.properties.get('name')) || 'Сплиттер',
                        object: sp
                        });
                    }
                }
        });

        if (pending && lastHostIdx >= 0) {
            var cable = pending.cable || findCableById(pending.cableId);
            var far = null;
            if (cable && typeof global.getOtherEndOfCable === 'function') {
                try { far = global.getOtherEndOfCable(cable, nodes[lastHostIdx].object); } catch (e) {}
            }
            if (far) {
                    nodes.push({
                    id: getUid(far) || ('end-' + nodes.length),
                    name: (far.properties && far.properties.get('name')) || getTypeName(far.properties && far.properties.get('type')),
                    type: far.properties && far.properties.get('type'),
                    object: far,
                        port: null,
                    reserveM: 0
                    });
                    segments.push({
                    kind: pending.kind || 'cable',
                        fromIdx: lastHostIdx,
                        toIdx: nodes.length - 1,
                    cableId: pending.cableId,
                    cableName: pending.cableName,
                    cable: cable,
                    lengthM: pending.segmentLengthM,
                    tracedFiber: pending.fiberNumber,
                    linkLabel: pending.linkLabel || null,
                    fibers: [],
                    fiberCount: 0
                });
                pending = null;
                lastHostIdx = nodes.length - 1;
            }
        }

        /*
         * Запасной дотяг: путь оборвался на муфте/кассете/кроссе, а на жиле
         * висит МК/ONU/РМ — добавляем терминал, чтобы «КОНЕЦ» был на оборудовании.
         */
        if (nodes.length && lastHostIdx >= 0 && typeof global.tryAppendHostDropTerminals === 'function') {
            var lastHostNode = nodes[lastHostIdx];
            if (lastHostNode && isFiberHostType(lastHostNode.type) && lastHostNode.object) {
                var pathHasDrop = false;
                for (var pdi = (path || []).length - 1; pdi >= 0; pdi--) {
                    var pd = path[pdi];
                    if (!pd) continue;
                    if (pd.type === 'mediaConverterConnection' || pd.type === 'onuConnection' ||
                        pd.type === 'radioBridgeConnection' ||
                        pd.type === 'splitterOutputToMediaConverter' ||
                        pd.type === 'splitterOutputToOnu' ||
                        (pd.type === 'object' && (pd.objectType === 'mediaConverter' ||
                            pd.objectType === 'onu' || pd.objectType === 'radioBridge'))) {
                        pathHasDrop = true;
                        break;
                    }
                    if (pd.type === 'object' || pd.type === 'start') break;
                }
                if (!pathHasDrop) {
                    var dropCableId = pending && pending.cableId ? pending.cableId : null;
                    var dropFiberN = pending && pending.fiberNumber != null ? pending.fiberNumber : null;
                    if ((dropCableId == null || dropFiberN == null) && segments.length) {
                        var lastSegDrop = segments[segments.length - 1];
                        if (lastSegDrop) {
                            if (dropCableId == null) dropCableId = lastSegDrop.cableId;
                            if (dropFiberN == null) dropFiberN = lastSegDrop.tracedFiber;
                        }
                    }
                    if ((dropCableId == null || dropFiberN == null) && path) {
                        for (var pci = path.length - 1; pci >= 0; pci--) {
                            if (path[pci] && path[pci].type === 'cable' && path[pci].cableId) {
                                if (dropCableId == null) dropCableId = path[pci].cableId;
                                if (dropFiberN == null) dropFiberN = path[pci].fiberNumber;
                                break;
                            }
                        }
                    }
                    if (dropCableId != null && dropFiberN != null) {
                        var dropExtra = [];
                        if (global.tryAppendHostDropTerminals(dropExtra, lastHostNode.object, dropCableId, dropFiberN) &&
                            dropExtra.length) {
                            dropExtra.forEach(function (item) {
                                if (item.type === 'mediaConverterConnection' ||
                                    item.type === 'splitterOutputToMediaConverter') {
                                    var mcDrop = item.mediaConverter || item.mediaConverterObj;
                                    if (mcDrop) {
                                        pending = {
                                            kind: 'nodeLink',
                                            cableId: item.cableId || dropCableId,
                                            cableName: 'К медиаконвертеру',
                                            cable: null,
                                            fiberNumber: item.fiberNumber != null ? item.fiberNumber : dropFiberN,
                                            segmentLengthM: item.segmentLengthM != null ? item.segmentLengthM : null,
                                            linkLabel: 'на МК · ж' + (item.fiberNumber != null ? item.fiberNumber : dropFiberN)
                                        };
                                        pushHost({
                                            type: 'object',
                                            objectType: 'mediaConverter',
                                            objectName: item.mediaConverterName || 'МК',
                                            object: mcDrop
                                        });
                                    }
                                } else if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') {
                                    var onuDrop = item.onu || item.onuObj;
                                    if (onuDrop) {
                                        pending = {
                                            kind: 'nodeLink',
                                            cableId: item.cableId || dropCableId,
                                            cableName: 'К ONU',
                                            cable: null,
                                            fiberNumber: item.fiberNumber != null ? item.fiberNumber : dropFiberN,
                                            segmentLengthM: item.segmentLengthM != null ? item.segmentLengthM : null,
                                            linkLabel: 'на ONU · ж' + (item.fiberNumber != null ? item.fiberNumber : dropFiberN)
                                        };
                                        pushHost({
                                            type: 'object',
                                            objectType: 'onu',
                                            objectName: item.onuName || 'ONU',
                                            object: onuDrop
                                        });
                                    }
                                } else if (item.type === 'radioBridgeConnection') {
                                    if (item.radioBridge) {
                                        pending = {
                                            kind: 'nodeLink',
                                            cableId: item.cableId || dropCableId,
                                            cableName: 'К радиомосту',
                                            cable: null,
                                            fiberNumber: item.fiberNumber != null ? item.fiberNumber : dropFiberN,
                                            segmentLengthM: null,
                                            linkLabel: 'на РМ · ж' + (item.fiberNumber != null ? item.fiberNumber : dropFiberN)
                                        };
                                        pushHost({
                                            type: 'object',
                                            objectType: 'radioBridge',
                                            objectName: item.radioBridgeName || 'РМ',
                                            object: item.radioBridge
                                        });
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }

        /* Заполняем пропуски между соседними узлами (иначе конец/кассета «висит» без ствола) */
        var ordered = [];
        var segByFrom = {};
        segments.forEach(function (seg) {
            if (!seg) return;
            segByFrom[seg.fromIdx] = seg;
        });
        for (var gi = 0; gi < nodes.length - 1; gi++) {
            if (segByFrom[gi] && Number(segByFrom[gi].toIdx) === gi + 1) {
                ordered.push(segByFrom[gi]);
                        } else {
                var prevFiber = ordered.length
                    ? ordered[ordered.length - 1].tracedFiber
                    : (segByFrom[gi] ? segByFrom[gi].tracedFiber : null);
                ordered.push({
                kind: 'nodeLink',
                    fromIdx: gi,
                    toIdx: gi + 1,
                    cableId: null,
                    cableName: 'Связь',
                cable: null,
                lengthM: null,
                    tracedFiber: prevFiber,
                    linkLabel: 'продолжение',
                fibers: [],
                    fiberCount: 0
                });
            }
        }
        segments = ordered;

        function paletteHintFromSeg(s) {
            if (!s) return null;
            var cab = s.cable || findCableById(s.cableId);
            if (!cab && !(Number(s.fiberCount) > 0)) return null;
            return {
                cable: cab,
                cableId: s.cableId,
                fiberCount: Number(s.fiberCount) ||
                    (cab && typeof global.getFiberCount === 'function' ? Number(global.getFiberCount(cab)) || 0 : 0)
            };
        }

        segments.forEach(function (seg, si) {
            var toHost = nodes[seg.toIdx];
            var nextSeg = segments[si + 1];
            var prevSeg = si > 0 ? segments[si - 1] : null;
            var nextCableId = nextSeg ? nextSeg.cableId : null;
            var nextTraced = nextSeg && nextSeg.tracedFiber != null ? nextSeg.tracedFiber : null;
            /* Без кабеля (patch) — палитра с соседнего оптического участка */
            var hint = null;
            if (!seg.cable && !findCableById(seg.cableId)) {
                hint = paletteHintFromSeg(prevSeg) || paletteHintFromSeg(nextSeg);
                if (hint && nextSeg && nextSeg.tracedFiber != null && seg.tracedFiber == null) {
                    seg.tracedFiber = nextSeg.tracedFiber;
                }
                if (hint && prevSeg && prevSeg.tracedFiber != null && seg.tracedFiber == null) {
                    seg.tracedFiber = prevSeg.tracedFiber;
                }
                /* жN→жN на кроссе: peer = та же жила, не «сжатый» низ колонки */
                if (seg.tracedFiber != null && nextTraced == null) nextTraced = seg.tracedFiber;
            }
            var built = buildFiberRows(seg, toHost, nextCableId, nextTraced, hint);
            seg.fibers = built.rows;
            seg.fiberCount = built.total;
            seg.cable = built.cable || seg.cable;
        });

        return { nodes: nodes, segments: segments, sourcePath: path };
    }

    /* ========== FiberBase SVG ========== */

    var TIA_BASE_FIBER_COLORS = [
        '#0000FF', '#FF8C00', '#00FF00', '#8B4513',
        '#808080', '#FFFFFF', '#FF0000', '#000000',
        '#FFFF00', '#800080', '#FFC0CB', '#00CED1'
    ];

    function fiberStrokeSafe(color) {
        if (!color) return '#94a3b8';
        var c = String(color).trim().toUpperCase();
        if (c === '#FFFFFF' || c === '#FFF' || c === 'WHITE') return '#e2e8f0';
        if (c === '#FFFF00' || c === '#FF0' || c === '#FFFACD' || c === 'YELLOW') return '#eab308';
        if (c === '#000000' || c === '#000' || c === 'BLACK') return '#1e293b';
        if (c === '#808080' || c === 'GRAY' || c === 'GREY') return '#64748b';
        return color;
    }

    /** Цвет жилы N: палитра кабеля → стандарт TIA (не серый fallback). */
    function colorForFiberNumber(cable, fiberNumber) {
        var n = Math.max(1, Number(fiberNumber) || 1);
        var colors = [];
        if (cable && typeof global.getFiberColors === 'function') {
            try { colors = global.getFiberColors(cable) || []; } catch (eC) { colors = []; }
        }
        if ((!colors || !colors.length) && global.FiberCableConfig &&
            typeof global.FiberCableConfig.buildStandardPalette === 'function') {
            colors = global.FiberCableConfig.buildStandardPalette(Math.max(n, 24)) || [];
        }
        if ((!colors || !colors.length) && typeof global.getFiberColors === 'function') {
            try {
                /* getFiberColors(fiber24) / число через legacy type */
                colors = global.getFiberColors('fiber' + Math.max(n, 12)) || [];
            } catch (eT) { colors = []; }
        }
        var meta = null;
        for (var i = 0; i < (colors || []).length; i++) {
            if (colors[i] && Number(colors[i].number) === n) { meta = colors[i]; break; }
        }
        if (meta && meta.color) return meta.color;
        return TIA_BASE_FIBER_COLORS[(n - 1) % 12];
    }

    /** Затемнить/осветлить hex для обводки порта. */
    function shadeHex(hex, amt) {
        var c = fiberStrokeSafe(hex);
        var m = String(c).match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!m) return '#334155';
        var h = m[1];
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var n = parseInt(h, 16);
        var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
        var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
        var b = Math.max(0, Math.min(255, (n & 255) + amt));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function r1(n) {
        return Math.round(Number(n) * 10) / 10;
    }

    function truncateText(s, maxChars) {
        s = String(s == null ? '' : s).trim();
        if (maxChars < 4) return '…';
        if (s.length <= maxChars) return s;
        return s.slice(0, Math.max(1, maxChars - 1)) + '…';
    }

    function nodeTitleParts(node, maxChars) {
        maxChars = Math.max(8, maxChars || 22);
        if (!node) return { line1: 'Объект', line2: '', full: 'Объект' };
        var typeName = getTypeName(node.type);
        var name = String(node.name || typeName).trim();
        if (/^obj[-_]/i.test(name) || /^[0-9a-f]{8,}$/i.test(name)) name = typeName;
        var line1 = truncateText('[' + typeName + ']', maxChars);
        var line2 = name && name !== typeName ? truncateText(name, maxChars) : '';
        var full = line2 ? ('[' + typeName + '] — ' + name) : ('[' + typeName + ']');
        return { line1: line1, line2: line2, full: full };
    }

    /** Плавный веер: горизонтальный разгон у ствола, затем к порту. */
    function fanCurve(x0, y0, x1, y1) {
        x0 = r1(x0); y0 = r1(y0); x1 = r1(x1); y1 = r1(y1);
        var dx = Math.abs(x1 - x0);
        var dir = x1 >= x0 ? 1 : -1;
        var c0 = Math.max(22, dx * 0.62);
        var c1 = Math.max(14, dx * 0.38);
        return 'M ' + x0 + ' ' + y0 +
            ' C ' + r1(x0 + dir * c0) + ' ' + y0 + ', ' +
            r1(x1 - dir * c1) + ' ' + y1 + ', ' +
            x1 + ' ' + y1;
    }

    function pushFiberPath(parts, d, stroke, opts) {
        opts = opts || {};
        if (!d) return;
        var safe = fiberStrokeSafe(stroke);
        if (opts.traced) {
            /* Подсветка цветом этой жилы + «сигнал» по штриху */
            parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="7" stroke-opacity="0.28" stroke-linecap="round"/>');
            parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="2.8" stroke-opacity="1" stroke-linecap="round"/>');
            parts.push('<path class="trace-sch-signal" d="' + d + '" fill="none" stroke="' + safe +
                '" stroke-width="2.4" stroke-linecap="round" stroke-opacity="0.95"/>');
            return;
        }
        parts.push('<path d="' + d + '" fill="none" stroke="' + safe +
            '" stroke-width="' + (opts.width != null ? opts.width : 1.3) +
            '" stroke-opacity="' + (opts.opacity != null ? opts.opacity : 0.9) +
            '" stroke-linecap="round"' +
            (opts.dash ? ' stroke-dasharray="' + opts.dash + '"' : '') + '/>');
    }

    function fiberLayer(fiber) {
        if (!fiber) return 0;
        if (fiber.traced) return 3;
        if (fiber.fate && fiber.fate.kind === 'free') return 0;
        if (fiber.fate && fiber.fate.kind === 'branch') return 2;
        return 1;
    }

    /**
     * Продольная схема FiberBase: ствол + бантики муфт без визуальных артефактов.
     */
    function isEndpointEquipmentNode(node) {
        var t = node && node.type;
        return t === 'node' || t === 'olt' || t === 'onu' ||
            t === 'mediaConverter' || t === 'radioBridge';
    }

    function isDropTerminalType(type) {
        return type === 'mediaConverter' || type === 'onu' || type === 'radioBridge';
    }

    /**
     * Drop кассета/муфта → МК/ONU/РМ одной жилой: не рисуем веер и вторую колонку.
     * Терминал уходит в карточку КОНЕЦ, геометрия обрывается на хосте.
     */
    function peelTrailingDropTerminals(nodesIn, segmentsIn) {
        var nodes = (nodesIn || []).slice();
        var segments = (segmentsIn || []).slice();
        var endCardNode = nodes.length ? nodes[nodes.length - 1] : null;
        while (nodes.length >= 2 && segments.length >= nodes.length - 1) {
            var last = nodes[nodes.length - 1];
            var prev = nodes[nodes.length - 2];
            if (!last || !prev || !isDropTerminalType(last.type)) break;
            if (!isFiberHostType(prev.type)) break;
            endCardNode = last;
            nodes.pop();
            if (segments.length) segments.pop();
        }
        return { nodes: nodes, segments: segments, endCardNode: endCardNode };
    }

    function renderFiberbaseSvg(model) {
        var peeled = peelTrailingDropTerminals(
            (model && model.nodes) || [],
            (model && model.segments) || []
        );
        var nodes = peeled.nodes;
        var segments = peeled.segments;
        if (!nodes.length) return '';

        var maxFibers = 1;
        segments.forEach(function (s) {
            var fc = Number(s.fiberCount) || (s.fibers && s.fibers.length) || 0;
            if (s.tracedFiber != null) fc = Math.max(fc, Number(s.tracedFiber) || 0);
            (s.fibers || []).forEach(function (f) {
                if (f && f.number > maxFibers) maxFibers = f.number;
            });
            if (fc > maxFibers) maxFibers = fc;
        });
        maxFibers = Math.max(1, Math.min(96, maxFibers));

        var showAll = maxFibers <= 48;
        var pitch = maxFibers > 48 ? 5.5 : (maxFibers > 36 ? 6.5 : (maxFibers > 24 ? 8 : (maxFibers > 12 ? 10 : 12)));
        var portR = maxFibers > 36 ? 2.2 : (maxFibers > 24 ? 2.7 : 3.1);
        var fanW = Math.max(56, Math.min(88, 46 + maxFibers * 0.55));
        var colSep = Math.max(30, Math.min(48, 26 + maxFibers * 0.3)); /* зазор между колонками вход/выход */
        var trunkW = Math.max(100, Math.min(180, 88 + maxFibers * 0.9));
        var padX = 48;
        var padTop = 78;
        var stackH = Math.max(96, maxFibers * pitch + 20);

        function isEndpointEquipment(node) {
            return isEndpointEquipmentNode(node);
        }

        var branchCount = 0;
        segments.forEach(function (s) {
            (s.fibers || []).forEach(function (f) {
                if (!f || !f.fate || f.fate.kind !== 'branch') return;
                branchCount++;
            });
        });
        var branchExtra = Math.max(56, Math.min(300, 36 + branchCount * 62));

        /*
         * Геометрия: две колонки только где есть вход+выход.
         * Узел/OLT на старте или конце — компактный порт одной жилы (не веер всего кабеля).
         */
        var nodeGeom = [];
        var xCursor = padX;
        for (var ni = 0; ni < nodes.length; ni++) {
            var hasIn = ni > 0 && !!segments[ni - 1];
            var hasOut = ni < segments.length;
            if (!hasIn && !hasOut) hasOut = true;
            var endpoint = isEndpointEquipment(nodes[ni]);
            /* Компакт для старта на оборудовании; drop-терминал уже снят в peel */
            var compact = !hasIn && hasOut && endpoint;
            var blockW;
            var inX;
            var outX;
            var leftTip;
            var rightTip;
            var cx;
            if (hasIn && hasOut) {
                blockW = fanW + colSep + fanW;
                inX = r1(xCursor + fanW);
                outX = r1(inX + colSep);
                leftTip = r1(inX - fanW);
                rightTip = r1(outX + fanW);
                cx = r1((inX + outX) / 2);
            } else if (compact) {
                /* Карточка старта/конца оборудования — шире, читаемые подписи */
                blockW = 132;
                inX = outX = cx = r1(xCursor + blockW / 2);
                leftTip = r1(xCursor);
                rightTip = r1(xCursor + blockW);
            } else if (hasOut) {
                blockW = fanW * 2;
                outX = r1(xCursor + fanW);
                inX = outX;
                leftTip = r1(outX - fanW);
                rightTip = r1(outX + fanW);
                cx = outX;
            } else {
                blockW = fanW * 2;
                inX = r1(xCursor + fanW);
                outX = inX;
                leftTip = r1(inX - fanW);
                rightTip = r1(inX + fanW);
                cx = inX;
            }
            nodeGeom.push({
                inX: inX,
                outX: outX,
                cx: cx,
                leftTip: leftTip,
                rightTip: rightTip,
                hasIn: hasIn,
                hasOut: hasOut,
                compact: !!compact,
                titleW: blockW
            });
            xCursor = rightTip;
            if (ni < segments.length) xCursor += trunkW;
        }

        var titleMaxChars = Math.max(10, Math.min(28, Math.floor(
            Math.max(fanW * 2, colSep + fanW) / 6.2
        )));

        var trunkY = r1(padTop + stackH / 2);
        var fibersTop = padTop + 10;
        var fibersBot = padTop + stackH - 10;
        /* Карточка КОНЕЦ справа — жила всегда доходит, видно чем окончилась трасса */
        var endCardW = 140;
        var endTermX = r1(xCursor + 20 + endCardW / 2);
        var width = r1(endTermX + endCardW / 2 + padX);
        var height = padTop + stackH + 36 + branchExtra + 24;

        /* Карточка КОНЕЦ — МК/ONU/РМ (после peel), геометрия заканчивается на кассете/муфте */
        var lastNode = peeled.endCardNode || nodes[nodes.length - 1];
        var startFiberN = segments[0] && segments[0].tracedFiber != null
            ? Number(segments[0].tracedFiber) : null;
        var endFiberN = segments.length
            ? (segments[segments.length - 1].tracedFiber != null
                ? Number(segments[segments.length - 1].tracedFiber) : startFiberN)
            : startFiberN;
        if (endFiberN == null && model && model.segments && model.segments.length) {
            var fullLastSeg = model.segments[model.segments.length - 1];
            if (fullLastSeg && fullLastSeg.tracedFiber != null) endFiberN = Number(fullLastSeg.tracedFiber);
        }

        function endpointTypeLabel(node) {
            return getTypeName(node && node.type);
        }
        function endpointNameLabel(node, maxLen) {
            var n = String((node && node.name) || endpointTypeLabel(node) || 'Объект').trim();
            if (/^obj[-_]/i.test(n) || /^[0-9a-f]{8,}$/i.test(n)) n = endpointTypeLabel(node);
            return truncateText(n, maxLen || 18);
        }
        /** Карточка СТАРТ / КОНЕЦ: тип, имя, жила — чтобы было ясно, чем началось/окончилось. */
        function emitEndpointCard(kind, cx, fiberNum, node) {
            var isStart = kind === 'start';
            var cardW = isStart ? 124 : endCardW;
            var cardH = 72;
            var x0 = r1(cx - cardW / 2);
            var y0 = r1(trunkY - cardH / 2);
            var badge = isStart ? 'СТАРТ' : 'КОНЕЦ';
            var typeL = truncateText(endpointTypeLabel(node), 16);
            var nameL = endpointNameLabel(node, 18);
            var fiberL = fiberNum != null ? ('ж' + fiberNum) : '';
            parts.push('<g class="trace-sch-endpoint trace-sch-endpoint--' + kind + '">');
            parts.push('<rect class="trace-sch-ep-card" x="' + x0 + '" y="' + y0 +
                '" width="' + cardW + '" height="' + cardH + '" rx="10"/>');
            parts.push('<rect class="trace-sch-ep-badge" x="' + r1(x0 + 8) + '" y="' + r1(y0 + 8) +
                '" width="' + (isStart ? 44 : 48) + '" height="15" rx="7"/>');
            parts.push('<text class="trace-sch-ep-badge-txt" x="' + r1(x0 + 8 + (isStart ? 22 : 24)) +
                '" y="' + r1(y0 + 19) + '" text-anchor="middle">' + badge + '</text>');
            if (fiberL) {
                parts.push('<text class="trace-sch-ep-fiber" x="' + r1(x0 + cardW - 10) + '" y="' +
                    r1(y0 + 19) + '" text-anchor="end">' + svgEsc(fiberL) + '</text>');
            }
            parts.push('<text class="trace-sch-ep-type" x="' + r1(cx) + '" y="' + r1(y0 + 40) +
                '" text-anchor="middle">' + svgEsc(typeL) + '</text>');
            parts.push('<text class="trace-sch-ep-name" x="' + r1(cx) + '" y="' + r1(y0 + 56) +
                '" text-anchor="middle"><title>' +
                svgEsc(endpointNameLabel(node, 40)) + '</title>' + svgEsc(nameL) + '</text>');
            /* Точка выхода/входа жилы на краю карточки */
            var joinX = isStart ? r1(x0 + cardW) : r1(x0);
            parts.push('<circle class="trace-sch-ep-join' + (isStart ? '' : ' trace-sch-ep-join--end') +
                '" cx="' + joinX + '" cy="' + trunkY + '" r="5"/>');
            parts.push('</g>');
            return joinX;
        }

        /** Цвет жилы на участке (свой у каждого кабеля после сварки). */
        function fiberOwnStroke(fiber, fallback) {
            if (fiber && fiber.color) return fiberStrokeSafe(fiber.color);
            return fiberStrokeSafe(fallback || '#eab308');
        }
        function findFiberColor(fibers, num, fallback) {
            if (num == null || !fibers) return fiberOwnStroke(null, fallback);
            for (var fi = 0; fi < fibers.length; fi++) {
                if (fibers[fi] && Number(fibers[fi].number) === Number(num) && fibers[fi].color) {
                    return fiberStrokeSafe(fibers[fi].color);
                }
            }
            return fiberOwnStroke(null, fallback);
        }

        function laneY(fiberNumber, fiberCount) {
            var n = Math.max(1, Number(fiberNumber) || 1);
            var total = Math.max(1, Number(fiberCount) || maxFibers);
            if (total <= 1) return trunkY;
            return r1(fibersTop + ((Math.min(n, total) - 1) / Math.max(1, total - 1)) * (fibersBot - fibersTop));
        }

        function fibersForSeg(seg) {
            var list = (seg.fibers || []).slice();
            if (!list.length && seg.tracedFiber != null) {
                var cab = seg.cable || findCableById(seg.cableId);
                list = [{
                    number: Number(seg.tracedFiber),
                    color: colorForFiberNumber(cab, seg.tracedFiber),
                    traced: true,
                    fate: { kind: 'continue' }
                }];
            }
            return list.filter(Boolean).sort(function (a, b) {
                return fiberLayer(a) - fiberLayer(b) || (a.number - b.number);
            });
        }

        function segFiberCount(seg, fibers) {
            return Math.max(
                Number(seg && seg.fiberCount) || 0,
                (fibers && fibers.length) || 0,
                Number(seg && seg.tracedFiber) || 0,
                1
            );
        }

        var parts = [];
        parts.push('<svg class="trace-schematic-svg trace-schematic-svg--fiberbase" viewBox="0 0 ' +
            r1(width) + ' ' + r1(height) + '" width="' + r1(width) + '" height="' + r1(height) +
            '" data-base-w="' + r1(width) + '" data-base-h="' + r1(height) +
            '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Продольная схема трассы">');

        /* --- 1. Подписи узлов (карточки старт/конец вместо дублирующих заголовков) --- */
        var startJoinX = null;
        var endJoinX = null;
        nodes.forEach(function (node, i) {
            var g = nodeGeom[i];
            if (g.compact && i === 0) {
                startJoinX = emitEndpointCard('start', g.cx, startFiberN, node);
                return;
            }
            var chars = Math.max(8, Math.min(titleMaxChars, Math.floor(g.titleW / 6.2)));
            var tp = nodeTitleParts(node, chars);
            parts.push('<text class="trace-sch-node-title trace-sch-node-title--fb" x="' + g.cx +
                '" y="16" text-anchor="middle"><title>' + svgEsc(tp.full) + '</title>' +
                '<tspan x="' + g.cx + '" dy="0">' + svgEsc(tp.line1) + '</tspan>' +
                (tp.line2
                    ? '<tspan x="' + g.cx + '" dy="12">' + svgEsc(tp.line2) + '</tspan>'
                    : '') +
                '</text>');
            var subY = tp.line2 ? 42 : 30;
            if (node.port != null) {
                parts.push('<text class="trace-sch-node-port" x="' + g.cx + '" y="' + subY +
                    '" text-anchor="middle">' +
                    svgEsc((node.type === 'node' ? 'SFP ' : 'порт ') + node.port) + '</text>');
            } else if (node.reserveM > 0) {
                parts.push('<text class="trace-sch-node-reserve" x="' + g.cx + '" y="' + subY +
                    '" text-anchor="middle">+' + node.reserveM + ' м</text>');
            }
            if (g.hasIn) {
                parts.push('<text class="trace-sch-col-cap" x="' + g.inX + '" y="' + r1(padTop - 4) +
                    '" text-anchor="middle">вход</text>');
            }
            if (g.hasOut) {
                parts.push('<text class="trace-sch-col-cap" x="' + g.outX + '" y="' + r1(padTop - 4) +
                    '" text-anchor="middle">выход</text>');
            }
        });
        endJoinX = emitEndpointCard('end', endTermX, endFiberN, lastNode);

        function emitTrunkSpan(x0, x1, patch) {
            if (x1 <= x0 + 4) return;
            parts.push('<line class="trace-sch-trunk' + (patch ? ' trace-sch-trunk--patch' : '') +
                '" x1="' + x0 + '" y1="' + trunkY + '" x2="' + x1 + '" y2="' + trunkY + '"/>');
            parts.push('<line class="trace-sch-trunk-core' + (patch ? ' trace-sch-trunk-core--patch' : '') +
                '" x1="' + x0 + '" y1="' + trunkY + '" x2="' + x1 + '" y2="' + trunkY + '"/>');
        }

        /* --- 2. Стволы между узлами --- */
        var trunkSpans = [];
        segments.forEach(function (seg, si) {
            var x0 = nodeGeom[si].rightTip;
            var x1 = nodeGeom[si + 1].leftTip;
            if (x1 <= x0 + 6) return;
            var isPatch = seg.kind === 'nodeLink';
            trunkSpans.push({ si: si, x0: x0, x1: x1, seg: seg, patch: isPatch });
            emitTrunkSpan(x0, x1, isPatch);
        });

        trunkSpans.forEach(function (ts) {
            if (ts.seg.lengthM == null || !(Number(ts.seg.lengthM) > 0)) return;
            var mid = r1((ts.x0 + ts.x1) / 2);
            var lenVal = Number(ts.seg.lengthM);
            var lenLabel = (Math.abs(lenVal - Math.round(lenVal)) < 0.05
                ? String(Math.round(lenVal)) : String(lenVal)) + ' м';
            var badgeW = Math.max(36, Math.min(56, 18 + String(lenLabel).length * 6));
            parts.push('<rect class="trace-sch-len-badge" x="' + r1(mid - badgeW / 2) + '" y="' +
                (padTop - 26) + '" width="' + badgeW + '" height="15" rx="4"/>');
            parts.push('<text class="trace-sch-trunk-len" x="' + mid + '" y="' + (padTop - 15) +
                '" text-anchor="middle">' + svgEsc(lenLabel) + '</text>');
        });

        /* --- 3. Веера + две колонки --- */
        var pathBuf = { 0: [], 1: [], 2: [], 3: [] };
        var dotMap = {};
        var labelBuf = [];

        function rememberDot(cx, y, fiber, side) {
            var key = side + '|' + r1(cx) + '|' + r1(y);
            var prev = dotMap[key];
            if (!prev || fiberLayer(fiber) >= fiberLayer(prev.fiber)) {
                dotMap[key] = { cx: r1(cx), y: r1(y), fiber: fiber, side: side };
            }
        }

        function pickTracedFibers(fibers, seg) {
            var traced = (fibers || []).filter(function (f) { return f && f.traced; });
            if (traced.length) {
                return traced.map(function (f) {
                    if (f.color && f.color !== '#94a3b8' && f.color !== '#888888') return f;
                    var cabFix = seg && (seg.cable || findCableById(seg.cableId));
                    return Object.assign({}, f, { color: colorForFiberNumber(cabFix, f.number) });
                });
            }
            if (seg && seg.tracedFiber != null) {
                var cabPf = seg.cable || findCableById(seg.cableId);
                return [{
                    number: Number(seg.tracedFiber),
                    color: colorForFiberNumber(cabPf, seg.tracedFiber),
                    traced: true,
                    fate: { kind: 'continue' }
                }];
            }
            return (fibers || []).slice(0, 1).filter(Boolean);
        }

        function emitFanToCol(trunkTipX, portX, side, fibers, fiberCount, forceY) {
            fibers.forEach(function (fiber) {
                if (!fiber) return;
                if (!showAll && !fiber.traced && fiber.fate && fiber.fate.kind === 'free') return;
                var y = forceY != null ? forceY : laneY(fiber.number, fiberCount);
                var stroke = fiberOwnStroke(fiber);
                var isFree = fiber.fate && fiber.fate.kind === 'free';
                var isBranch = fiber.fate && fiber.fate.kind === 'branch';
                var d = side === 'in'
                    ? fanCurve(trunkTipX, trunkY, portX, y)
                    : fanCurve(portX, y, trunkTipX, trunkY);
                var layer = fiberLayer(fiber);
                pathBuf[layer].push({
                    d: d,
                    stroke: stroke,
                    traced: !!fiber.traced,
                    opacity: isFree ? 0.18 : (isBranch ? 0.95 : (layer === 1 ? 0.88 : 0.95)),
                    width: isFree ? 0.9 : 1.3,
                    dash: isFree ? '2.2 2.6' : null
                });
                rememberDot(portX, y, fiber, side);
            });
        }

        nodes.forEach(function (node, i) {
            var g = nodeGeom[i];
            var leftSeg = g.hasIn ? segments[i - 1] : null;
            var rightSeg = g.hasOut ? segments[i] : null;
            var leftFibers = leftSeg ? fibersForSeg(leftSeg) : [];
            var rightFibers = rightSeg ? fibersForSeg(rightSeg) : [];
            var leftCount = leftSeg ? segFiberCount(leftSeg, leftFibers) : maxFibers;
            var rightCount = rightSeg ? segFiberCount(rightSeg, rightFibers) : maxFibers;

            /* Компактный старт: от края карточки к стволу следующего узла */
            if (g.compact && g.hasOut && !g.hasIn) {
                var fromX = startJoinX != null ? startJoinX : g.rightTip;
                var startTr = pickTracedFibers(rightFibers, rightSeg)[0];
                pathBuf[3].push({
                    d: 'M ' + fromX + ' ' + trunkY + ' L ' + g.rightTip + ' ' + trunkY,
                    stroke: fiberOwnStroke(startTr),
                    traced: true,
                    opacity: 1,
                    width: 2.8,
                    dash: null
                });
                return;
            }

            /* Фон колонок муфты/кросса */
            if (g.hasIn) {
                parts.push('<rect class="trace-sch-col-bg" x="' + r1(g.inX - 11) + '" y="' + r1(fibersTop - 6) +
                    '" width="22" height="' + r1(fibersBot - fibersTop + 12) + '" rx="5"/>');
            }
            if (g.hasOut && (!g.hasIn || g.outX !== g.inX)) {
                parts.push('<rect class="trace-sch-col-bg" x="' + r1(g.outX - 11) + '" y="' + r1(fibersTop - 6) +
                    '" width="22" height="' + r1(fibersBot - fibersTop + 12) + '" rx="5"/>');
            }

            if (g.hasIn && g.hasOut) {
                emitFanToCol(g.leftTip, g.inX, 'in', leftFibers, leftCount);
                emitFanToCol(g.rightTip, g.outX, 'out', rightFibers, rightCount);
            } else if (g.hasOut) {
                emitFanToCol(g.leftTip, g.outX, 'in', rightFibers, rightCount);
                emitFanToCol(g.rightTip, g.outX, 'out', rightFibers, rightCount);
            } else if (g.hasIn) {
                /* Последний узел → карточка КОНЕЦ */
                emitFanToCol(g.leftTip, g.inX, 'in', leftFibers, leftCount);
                var endFibers = pickTracedFibers(leftFibers, leftSeg);
                var toEnd = endJoinX != null ? endJoinX : endTermX;
                endFibers.forEach(function (fiber) {
                    var y = laneY(fiber.number, leftCount);
                    pathBuf[3].push({
                        d: fanCurve(g.inX, y, toEnd, trunkY),
                        stroke: fiberOwnStroke(fiber),
                        traced: true,
                        opacity: 1,
                        width: 2.8,
                        dash: null
                    });
                    rememberDot(g.inX, y, fiber, 'in');
                });
            }

            /* Перемычки: вход → выход (сварка / продолжение трассы через кросс) */
            if (leftSeg && rightSeg) {
                var drawnBridge = {};
                leftFibers.forEach(function (fiber) {
                    if (!fiber || !fiber.fate) return;
                    var cont = fiber.fate.kind === 'continue' ||
                    (fiber.fate.kind === 'branch' && fiber.fate.peerCableId &&
                            rightSeg.cableId && String(fiber.fate.peerCableId) === String(rightSeg.cableId));
                    if (!cont) return;
                    var peerN = fiber.fate.peerFiber != null
                        ? Number(fiber.fate.peerFiber)
                        : (fiber.traced ? (Number(rightSeg.tracedFiber) || fiber.number) : fiber.number);
                    var bkey = fiber.number + '>' + peerN;
                    drawnBridge[bkey] = true;
                    var y0 = laneY(fiber.number, leftCount);
                    var y1 = laneY(peerN, rightCount);
                    var d = 'M ' + g.inX + ' ' + y0 + ' C ' +
                        r1((g.inX + g.outX) / 2) + ' ' + y0 + ', ' +
                        r1((g.inX + g.outX) / 2) + ' ' + y1 + ', ' +
                        g.outX + ' ' + y1;
                    /* После сварки цвет = цвет исходящей жилы (жёлтая→красная → дальше красная) */
                    var bridgeStroke = fiber.traced
                        ? findFiberColor(rightFibers, peerN, fiber.color)
                        : fiberStrokeSafe(fiber.color);
                    pathBuf[fiber.traced ? 3 : 1].push({
                        d: d,
                        stroke: bridgeStroke,
                        traced: !!fiber.traced,
                        opacity: fiber.traced ? 1 : 0.55,
                        width: fiber.traced ? 2.4 : 1.1,
                        dash: fiber.traced ? null : '3 2'
                    });
                });
                /* Гарантия: трассируемая жила всегда имеет перемычку вход→выход */
                var tracedIn = null;
                for (var tli = 0; tli < leftFibers.length; tli++) {
                    if (leftFibers[tli] && leftFibers[tli].traced) { tracedIn = leftFibers[tli]; break; }
                }
                if (tracedIn) {
                    var tPeer = rightSeg.tracedFiber != null
                        ? Number(rightSeg.tracedFiber)
                        : (tracedIn.fate && tracedIn.fate.peerFiber != null
                            ? Number(tracedIn.fate.peerFiber) : tracedIn.number);
                    var tkey = tracedIn.number + '>' + tPeer;
                    if (!drawnBridge[tkey]) {
                        var ty0 = laneY(tracedIn.number, leftCount);
                        var ty1 = laneY(tPeer, rightCount);
                        var td = 'M ' + g.inX + ' ' + ty0 + ' C ' +
                            r1((g.inX + g.outX) / 2) + ' ' + ty0 + ', ' +
                            r1((g.inX + g.outX) / 2) + ' ' + ty1 + ', ' +
                            g.outX + ' ' + ty1;
                        pathBuf[3].push({
                            d: td,
                            stroke: findFiberColor(rightFibers, tPeer, tracedIn.color),
                            traced: true,
                            opacity: 1,
                            width: 2.4,
                            dash: null
                        });
                    }
                }
            }

            /* Номера: слева у входа, справа у выхода */
            if (leftSeg) {
                leftFibers.forEach(function (fiber) {
                    if (!fiber) return;
                    var showNum = fiber.traced || fiber.number === 1 || fiber.number === leftCount ||
                        (leftCount <= 12 ? true : fiber.number % 4 === 0);
                    if (!showNum) return;
                    labelBuf.push({
                        x: r1(g.inX - portR - 4),
                        y: laneY(fiber.number, leftCount),
                        n: fiber.number,
                        traced: !!fiber.traced,
                        anchor: 'end'
                });
            });
        }
            if (rightSeg) {
                rightFibers.forEach(function (fiber) {
                    if (!fiber) return;
                    var showNum = fiber.traced || fiber.number === 1 || fiber.number === rightCount ||
                        (rightCount <= 12 ? true : fiber.number % 4 === 0);
                    if (!showNum) return;
                    labelBuf.push({
                        x: r1(g.outX + portR + 4),
                        y: laneY(fiber.number, rightCount),
                        n: fiber.number,
                        traced: !!fiber.traced,
                        anchor: 'start'
                    });
                });
            }
        });

        /* Жила по стволу между узлами — своим цветом сегмента */
        trunkSpans.forEach(function (ts) {
            var trunkFibers = pickTracedFibers(fibersForSeg(ts.seg), ts.seg);
            trunkFibers.forEach(function (fiber) {
                if (!fiber) return;
                pathBuf[3].push({
                    d: 'M ' + ts.x0 + ' ' + trunkY + ' L ' + ts.x1 + ' ' + trunkY,
                    stroke: fiberOwnStroke(fiber),
                    traced: true,
                    opacity: 1,
                    width: 2.8,
                    dash: null
                });
            });
        });

        /* --- 4. Пути по слоям --- */
        [0, 1, 2, 3].forEach(function (layer) {
            pathBuf[layer].forEach(function (p) {
                pushFiberPath(parts, p.d, p.stroke, {
                    traced: p.traced,
                    opacity: p.opacity,
                    width: p.width,
                    dash: p.dash
                });
            });
        });

        /* --- 5. Точки портов (один раз на позицию) --- */
        Object.keys(dotMap).forEach(function (key) {
            var dot = dotMap[key];
            var fiber = dot.fiber;
            var isFree = fiber.fate && fiber.fate.kind === 'free';
            var fill;
            var ring;
            if (fiber.traced) {
                fill = fiberOwnStroke(fiber);
                ring = shadeHex(fiber.color || fill, -55);
            } else if (isFree) {
                fill = 'var(--trace-sch-port-free-fill, #fff)';
                ring = '#94a3b8';
            } else {
                fill = fiberStrokeSafe(fiber.color);
                ring = shadeHex(fiber.color, -40);
            }
            parts.push('<circle class="trace-sch-port-dot' + (fiber.traced ? ' trace-sch-port-dot--traced' : '') +
                '" cx="' + dot.cx + '" cy="' + dot.y + '" r="' + portR +
                '" fill="' + fill + '" stroke="' + ring + '" stroke-width="0.9"/>');
        });

        /* --- 6. Номера жил --- */
        labelBuf.forEach(function (lb) {
            parts.push('<text class="trace-sch-fiber-num' + (lb.traced ? ' trace-sch-fiber-num--traced' : '') +
                '" x="' + lb.x + '" y="' + r1(lb.y + 3) + '" text-anchor="' + (lb.anchor || 'end') + '">' +
                lb.n + '</text>');
        });

        /*
         * --- 7. Отводы на ДРУГОЙ кабель ---
         * Уход из колонки ВХОДА (приходящий кабель), не из общей оси.
         */
        var branchSlot = 0;
        var usedBranchKeys = {};
        segments.forEach(function (seg, si) {
            var nextSeg = segments[si + 1];
            var gTo = nodeGeom[si + 1];
            if (!gTo) return;
            var inColX = gTo.inX;
            var fibers = fibersForSeg(seg);
            var inCount = segFiberCount(seg, fibers);

            fibers.forEach(function (fiber) {
                if (!fiber || !fiber.fate || fiber.fate.kind !== 'branch') return;
                if (nextSeg && fiber.fate.peerCableId && nextSeg.cableId &&
                    String(fiber.fate.peerCableId) === String(nextSeg.cableId)) return;
                if (fiber.fate.peerCableId && String(fiber.fate.peerCableId) === String(seg.cableId)) return;

                var bkey = inColX + '|' + fiber.number + '|' + (fiber.fate.peerCableId || '');
                if (usedBranchKeys[bkey]) return;
                usedBranchKeys[bkey] = true;
                if (branchSlot >= 8) return;

                var yPort = laneY(fiber.number, inCount);
                var stroke = fiberOwnStroke(fiber);
                var peerN = fiber.fate.peerFiber != null ? fiber.fate.peerFiber : fiber.number;
                var dropY = r1(fibersBot + 36 + branchSlot * 58);
                var elbowX = r1(inColX + 36);
                var dropX1 = r1(elbowX + 78);
                branchSlot++;

                var dLeave = 'M ' + r1(inColX) + ' ' + yPort +
                    ' C ' + r1(inColX + 12) + ' ' + yPort + ', ' +
                    elbowX + ' ' + r1(yPort + Math.max(24, (dropY - yPort) * 0.35)) + ', ' +
                    elbowX + ' ' + dropY;
                pushFiberPath(parts, dLeave, stroke, {
                    traced: !!fiber.traced,
                    opacity: 0.95,
                    width: fiber.traced ? 2.3 : 1.45
                });

                parts.push('<path class="trace-sch-trunk" d="M ' + elbowX + ' ' + dropY + ' L ' + dropX1 + ' ' + dropY + '"/>');
                parts.push('<path class="trace-sch-trunk-core" d="M ' + elbowX + ' ' + dropY + ' L ' + dropX1 + ' ' + dropY + '"/>');

                /* Мини-бантик второго кабеля */
                var tipX = r1(dropX1 + 36);
                var yPeer = r1(dropY - 12);
                pushFiberPath(parts, fanCurve(dropX1, dropY, tipX, yPeer), stroke, {
                    traced: !!fiber.traced, width: 1.4, opacity: 0.95
                });
                parts.push('<circle cx="' + tipX + '" cy="' + yPeer + '" r="3" fill="' +
                    fiberStrokeSafe(fiber.color) + '" stroke="' + shadeHex(fiber.color, -40) +
                    '" stroke-width="0.85"/>');
                parts.push('<text class="trace-sch-fiber-num" x="' + r1(tipX + 6) + '" y="' + r1(yPeer + 3) +
                    '">ж' + peerN + '</text>');

                var cabNm = fiber.fate.peerCableName || 'другой кабель';
                var brLabel = 'ж' + fiber.number + ' → «' + cabNm + '» ж' + peerN;
                parts.push('<text class="trace-sch-branch-label" x="' + r1((elbowX + dropX1) / 2) +
                    '" y="' + r1(dropY - 10) + '" text-anchor="middle">' +
                    svgEsc(truncateText(brLabel, 34)) + '</text>');
            });
        });

        parts.push('</svg>');
        return parts.join('');
    }

    /* ========== Studio UI ========== */

    function computeMetrics(model, path) {
        var enriched = enrichPathWithLengths(path || (model && model.sourcePath) || []);
        var m = summarizePathMetrics(enriched);
        var segSum = 0;
        var segHas = false;
        if (model && model.segments) {
            model.segments.forEach(function (s) {
                if (s && s.lengthM != null) { segSum += Number(s.lengthM) || 0; segHas = true; }
            });
        }
        /* Фоллбек: сумма пролётов со схемы, если path не дал длин */
        if (m.distanceM == null && segHas) m.distanceM = roundMeters(segSum);
        /* Запасы с узлов схемы, если в path не попали */
        if ((!m.reserveM || m.reserveM <= 0) && model && model.nodes) {
            var seen = {};
            var rsum = 0;
            model.nodes.forEach(function (n) {
                if (!n || !(n.reserveM > 0)) return;
                var id = n.id || getUid(n.object) || n.name;
                if (id && seen[id]) return;
                if (id) seen[id] = true;
                rsum += Number(n.reserveM) || 0;
            });
            if (rsum > 0) m.reserveM = roundMeters(rsum) || 0;
        }
        return m;
    }

    function buildLengthCardHtml(metrics) {
        metrics = metrics || {};
        var spans = metrics.distanceM;
        var reserves = metrics.reserveM > 0 ? metrics.reserveM : 0;
        if (spans == null && !reserves) return '';
        var total = spans != null ? roundMeters(spans + reserves) : null;
        var fmt = function (v) {
            if (v == null) return '';
            var n = Number(v);
            return (Math.abs(n - Math.round(n)) < 0.05) ? String(Math.round(n)) : String(n);
        };
        var html = '<div class="trace-length-card" title="Расчётная длина трассы">';
        html += '<div class="trace-length-card__title">Расчётная длина</div><div class="trace-length-card__rows">';
        if (spans != null) html += '<div><span>Пролёты</span><strong>' + fmt(spans) + ' м</strong></div>';
        if (reserves > 0) html += '<div><span>Запасы</span><strong>' + fmt(reserves) + ' м</strong></div>';
        if (total != null) html += '<div class="trace-length-card__total"><span>Итого</span><strong>' + fmt(total) + ' м</strong></div>';
        html += '</div></div>';
        return html;
    }

    function buildOverviewHtml(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';
        var html = '<div class="trace-sch-overview trace-sch-overview--fiberbase" title="Маршрут">';
        model.nodes.forEach(function (node, i) {
            if (i > 0) html += '<span class="trace-sch-overview-line" aria-hidden="true"></span>';
            html += '<span class="trace-sch-overview-node' + (node.type ? ' trace-sch-overview-node--' + node.type : '') +
                '" title="' + esc(node.name || getTypeName(node.type)) + '"><span class="trace-sch-overview-dot"></span></span>';
        });
        html += '</div>';
        return html;
    }

    function pickBestPath(paths) {
        var list = paths || [];
        if (!list.length) return null;
        var best = list[0];
        var bestScore = -1;
        list.forEach(function (p) {
            var st = analyzePathStatus(p);
            var score = (p && p.length) || 0;
            if (st.status === 'complete') score += 1000;
            if (score > bestScore) { bestScore = score; best = p; }
        });
        return best;
    }

    function buildEndpointSummaryHtml(model) {
        if (!model || !model.nodes || !model.nodes.length) return '';
        var a = model.nodes[0];
        var b = model.nodes[model.nodes.length - 1];
        var segs = model.segments || [];
        var f0 = segs[0] && segs[0].tracedFiber != null ? Number(segs[0].tracedFiber) : null;
        var f1 = segs.length && segs[segs.length - 1].tracedFiber != null
            ? Number(segs[segs.length - 1].tracedFiber) : f0;
        var aName = esc((a && a.name) || getTypeName(a && a.type) || 'Старт');
        var bName = esc((b && b.name) || getTypeName(b && b.type) || 'Конец');
        var aType = esc(getTypeName(a && a.type));
        var bType = esc(getTypeName(b && b.type));
        var html = '<div class="trace-endpoint-summary" title="Откуда и куда идёт трасса">';
        html += '<div class="trace-endpoint-summary__side trace-endpoint-summary__side--start">';
        html += '<span class="trace-endpoint-summary__badge">Старт</span>';
        html += '<strong>' + aName + '</strong>';
        html += '<span class="trace-endpoint-summary__muted">' + aType +
            (f0 != null ? ' · ж' + f0 : '') + '</span></div>';
        html += '<span class="trace-endpoint-summary__arrow" aria-hidden="true">→</span>';
        html += '<div class="trace-endpoint-summary__side trace-endpoint-summary__side--end">';
        html += '<span class="trace-endpoint-summary__badge">Конец</span>';
        html += '<strong>' + bName + '</strong>';
        html += '<span class="trace-endpoint-summary__muted">' + bType +
            (f1 != null ? ' · ж' + f1 : '') + '</span></div>';
        html += '</div>';
        return html;
    }

    function buildTraceSchematicHtml(path, opts) {
        opts = opts || {};
        var model = opts.model || (path ? buildTraceSchematicModel(path) : null);
        if (!model || !model.nodes.length) return '';
        model.sourcePath = model.sourcePath || path;
        var metrics = computeMetrics(model, opts.metricsPath || path);
        var html = '<div class="trace-schematic trace-schematic--studio trace-schematic--fiberbase" data-trace-mode="fibers">';
        html += '<div class="trace-schematic-head"><div class="trace-schematic-title-row">';
        html += '<div class="trace-schematic-title">Трассировка</div></div>';
        html += '<div class="trace-schematic-tools"><div class="trace-sch-zoom-controls">';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="out" title="Уменьшить">−</button>';
        html += '<input type="range" class="trace-sch-zoom-slider" min="25" max="250" value="100" step="5" aria-label="Масштаб">';
        html += '<span class="trace-sch-zoom-label">100%</span>';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="in" title="Увеличить">+</button>';
        html += '<button type="button" class="trace-sch-zoom-btn" data-trace-sch-zoom="fit" title="Вписать">⊡</button>';
        html += '</div>';
        html += '<button type="button" class="trace-sch-zoom-btn trace-sch-pdf-btn" data-trace-sch-pdf="1" title="Экспорт PDF">⎙</button>';
        html += '</div></div>';
        html += '<div class="trace-sch-export-root"><div class="trace-sch-meta-row">';
        html += '<div class="trace-sch-meta-main">' + buildEndpointSummaryHtml(model) +
            buildOverviewHtml(model) + '</div>';
        html += '<div class="trace-sch-meta-side">' + buildLengthCardHtml(metrics) + '</div></div>';
        html += '<div class="trace-schematic-scroll"><div class="trace-sch-zoom-inner">';
        html += renderFiberbaseSvg(model);
        html += '</div></div></div>';
        html += '<p class="trace-schematic-hint">Слева — старт, справа — чем окончилась трасса. Жирная линия — цвет жилы. Ctrl+колёсико — масштаб.</p>';
        html += '</div>';
        return html;
    }

    function buildTraceSchematicsHtml(paths) {
        var path = pickBestPath(paths);
        if (!path) return '';
        return buildTraceSchematicHtml(path, { metricsPath: path });
    }

    function buildTraceSchematicsHtmlAsync(paths, ctl) {
        return Promise.resolve().then(function () {
            if (ctl && ctl.isCancelled && ctl.isCancelled()) return '';
            if (ctl && ctl.setProgress) ctl.setProgress('Рисуем схему…', 'Продольная схема', 95);
            return buildTraceSchematicsHtml(paths);
        });
    }

    function buildTraceToolbarHtml(returnLabel, returnType) {
        var back = returnLabel
            ? '<button type="button" class="trace-back-btn" title="Назад к карточке">' +
              esc(returnLabel) + (returnType ? ' · ' + esc(getTypeName(returnType)) : '') + '</button>'
            : '';
        return '<div class="trace-toolbar trace-toolbar--studio">' +
            '<div class="trace-toolbar-actions">' + back +
            '<button type="button" class="trace-tool-btn trace-highlight-btn" title="На карте">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>' +
            '<button type="button" class="trace-tool-btn trace-copy-btn" title="Копировать">⧉</button>' +
            '<button type="button" class="trace-tool-btn trace-steps-toggle" title="Шаги" aria-pressed="false">≡</button>' +
            '</div></div>';
    }

    function buildTraceViewHtml(bodyHtml, returnLabel, returnType) {
        bodyHtml = bodyHtml || '';
        var actionsHtml = '';
        var rest = bodyHtml;
        var actionsMatch = bodyHtml.match(/<div class="trace-result-actions">[\s\S]*<\/div>\s*$/);
        if (actionsMatch) {
            actionsHtml = actionsMatch[0];
            rest = bodyHtml.slice(0, bodyHtml.length - actionsMatch[0].length);
        }
        var schematicHtml = '';
        var stepsHtml = rest;
        var schMark = rest.indexOf('<!--trace-slot:schematic-->');
        var schMarkEnd = rest.indexOf('<!--/trace-slot:schematic-->');
        var stepsMark = rest.indexOf('<!--trace-slot:steps-->');
        var stepsMarkEnd = rest.indexOf('<!--/trace-slot:steps-->');
        if (schMark >= 0 && schMarkEnd > schMark) {
            schematicHtml = rest.slice(schMark + '<!--trace-slot:schematic-->'.length, schMarkEnd);
            if (stepsMark >= 0 && stepsMarkEnd > stepsMark) {
                stepsHtml = rest.slice(stepsMark + '<!--trace-slot:steps-->'.length, stepsMarkEnd);
            } else stepsHtml = '';
        }
        var html = '<div class="trace-view trace-view--studio">';
        html += buildTraceToolbarHtml(returnLabel, returnType);
        html += '<div class="trace-studio-main">';
        if (schematicHtml) html += '<div class="trace-studio-canvas">' + schematicHtml + '</div>';
        html += '<div class="trace-studio-steps' + (schematicHtml ? ' is-collapsed' : '') + '">';
        html += '<div class="trace-studio-steps-head"><span>Шаги маршрута</span>';
        html += '<button type="button" class="trace-steps-toggle trace-steps-toggle--inline" title="Свернуть/развернуть">▾</button></div>';
        html += '<div class="trace-studio-steps-body"><div class="trace-view-body">' + (stepsHtml || '') + '</div></div>';
        html += '</div></div>';
        if (actionsHtml) html += '<div class="trace-view-footer">' + actionsHtml + '</div>';
        html += '</div>';
        return html;
    }

    function buildTraceActionsHtml() {
        return '<div class="trace-result-actions">' +
            '<button type="button" class="btn-primary btn-sm trace-highlight-btn" title="Подсветить на карте">' +
            '<span>На карте</span></button>' +
            '<button type="button" class="btn-secondary btn-sm trace-copy-btn">Копировать</button></div>';
    }

    function renderPathStatusHtml(path) {
        var enriched = enrichPathWithLengths(path);
        var status = analyzePathStatus(path);
        var metrics = summarizePathMetrics(enriched);
        var icon = status.status === 'complete' ? '✓' : (status.status === 'empty' ? '·' : '⚠');
        var html = '<div class="trace-path-status ' + status.cssClass + '">';
        html += '<span class="trace-path-status-icon">' + icon + '</span>';
        html += '<span class="trace-path-status-text">' + esc(status.label) + '</span>';
        if (metrics.distanceM != null) html += '<span class="trace-path-status-distance">~' + metrics.distanceM + ' м</span>';
        if (metrics.reserveM > 0) html += '<span class="trace-path-status-reserve">запас ' + metrics.reserveM + ' м</span>';
        html += '</div>';
        return html;
    }

    function renderWaypointsInlineHtml(waypoints) {
        if (!waypoints || !waypoints.length) return '';
        var parts = waypoints.map(function (wp) {
            return getObjectIcon(wp.objectType) + ' ' + esc(wp.objectName || getTypeName(wp.objectType));
        });
        return '<span class="trace-waypoints-inline">через ' + parts.join(' → ') + '</span>';
    }

    function renderCompactPathHtml(path, startStepNumber) {
        var enriched = enrichPathWithLengths(path);
        var display = compressPathForDisplay(enriched);
        var html = renderPathStatusHtml(path);
        html += '<div class="trace-timeline">';
        var step = startStepNumber || 1;
        display.forEach(function (item) {
            if (!item) return;
            if (item.type === 'start' || item.type === 'object') {
                html += '<div class="trace-item"><span class="trace-item-glyph">' + getObjectIcon(item.objectType) +
                    '</span><span>' + esc(item.objectName || getTypeName(item.objectType)) +
                    (item.port != null ? ' · п.' + item.port : '') + '</span></div>';
                step++;
            } else if (item.type === 'cable') {
                html += '<div class="trace-item trace-item--cable"><span class="trace-item-glyph">➡</span><span>' +
                    esc(item.cableName || 'Кабель') + ' · ж' + item.fiberNumber +
                    (item.segmentLengthM != null ? ' · ' + item.segmentLengthM + ' м' : '') + '</span></div>';
            }
        });
        html += '</div>';
        return html;
    }

    function pathItemToText(item) {
        if (!item) return '';
        if (item.type === 'start' || item.type === 'object') {
            return getObjectIcon(item.objectType) + ' ' + (item.objectName || getTypeName(item.objectType));
        }
        if (item.type === 'cable') {
            return '  → Кабель «' + (item.cableName || 'кабель') + '», волокно ' + item.fiberNumber +
                (item.segmentLengthM != null ? ' ~' + item.segmentLengthM + ' м' : '');
        }
        if (item.type === 'connection') {
            return '  ↔ Сварка ж' + item.fromFiberNumber + ' → ж' + item.toFiberNumber;
        }
        if (item.type === 'nodeConnection') {
            return item.fromNode
                ? ('  🔌 → Кросс, волокно ' + item.fiberNumber)
                : ('  🔌 Вывод на узел «' + (item.nodeName || 'Узел') + '»');
        }
        if (item.type === 'onuConnection' || item.type === 'splitterOutputToOnu') {
            return '  🔌 ONU «' + (item.onuName || 'ONU') + '»';
        }
        if (item.type === 'oltPortConnection') {
            return '  📶 OLT «' + (item.oltName || 'OLT') + '», порт ' + item.portNumber;
        }
        return '';
    }

    function pathToPlainText(path) {
        if (!path || !path.length) return '';
        var enriched = enrichPathWithLengths(path);
        var display = compressPathForDisplay(enriched);
        var lines = [analyzePathStatus(path).label];
        display.forEach(function (item) {
            var t = pathItemToText(item);
            if (t) lines.push(t);
        });
        return lines.join('\n');
    }

    function pathsToPlainText(paths) {
        return (paths || []).map(function (p, i) {
            return (paths.length > 1 ? ('# ' + (i + 1) + '\n') : '') + pathToPlainText(p);
        }).join('\n\n');
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
            } catch (e) { reject(e); }
        });
    }

    function collectCablesFromPaths(paths) {
        var map = {};
        var list = [];
        (paths || []).forEach(function (path) {
            (path || []).forEach(function (item) {
                if (item.type !== 'cable' || !item.cableId || map[item.cableId]) return;
                var cable = resolvePathCableObject(item);
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
        var colors = (typeof global.getFiberColors === 'function') ? (global.getFiberColors(cable) || []) : [];
        var total = (typeof global.getFiberCount === 'function') ? (Number(global.getFiberCount(cable)) || colors.length) : colors.length;
        var usedMap = {};
        if (Array.isArray(global.objects)) {
            global.objects.forEach(function (o) {
                if (!o || !o.properties || !isFiberHostType(o.properties.get('type'))) return;
                (o.properties.get('fiberConnections') || []).forEach(function (c) {
                    if (!c || !c.from || !c.to) return;
                    [c.from, c.to].forEach(function (end) {
                        if (end && String(end.cableId) === String(cableId) && end.fiberNumber != null) {
                            usedMap[Number(end.fiberNumber)] = true;
                        }
                    });
                });
            });
        }
        var free = [];
        for (var i = 1; i <= total; i++) if (!usedMap[i]) free.push(i);
        return { total: total, free: free, used: total - free.length };
    }

    function buildFreeFibersHtml(paths) {
        var cables = collectCablesFromPaths(paths);
        if (!cables.length) return '';
        var html = '<div class="trace-free-fibers"><div class="trace-free-fibers-title">Свободные волокна</div>';
        cables.forEach(function (c) {
            var info = getFreeFibersForCable(c.cable);
            html += '<div class="trace-free-fibers-row"><strong>' + esc(c.cableName) + '</strong>: ';
            html += info.free.length ? ('свободны ' + info.free.slice(0, 24).join(', ') +
                (info.free.length > 24 ? '…' : '') + ' из ' + info.total) : ('заняты все ' + info.total);
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    function renderPathsOverviewHtml(paths) {
        if (!paths || paths.length < 2) return '';
        var html = '<div class="trace-branches-overview">';
        paths.forEach(function (p, i) {
            html += '<button type="button" class="trace-branch-chip' + (i === 0 ? ' trace-branch-chip--active' : '') +
                '" data-branch-index="' + i + '">' + esc(getPathEndpointLabel(p)) + '</button>';
        });
        html += '</div>';
        return html;
    }

    function applyZoom(root, zoom) {
        var svg = root.querySelector('.trace-schematic-svg');
        if (!svg) return 1;
        var baseW = parseFloat(svg.getAttribute('data-base-w')) || 800;
        var baseH = parseFloat(svg.getAttribute('data-base-h')) || 300;
        zoom = Math.max(0.25, Math.min(2.5, Math.round(zoom * 20) / 20));
        svg.setAttribute('width', String(Math.round(baseW * zoom)));
        svg.setAttribute('height', String(Math.round(baseH * zoom)));
        svg.style.width = Math.round(baseW * zoom) + 'px';
        svg.style.height = Math.round(baseH * zoom) + 'px';
        var slider = root.querySelector('.trace-sch-zoom-slider');
        var label = root.querySelector('.trace-sch-zoom-label');
        if (slider) slider.value = String(Math.round(zoom * 100));
        if (label) label.textContent = Math.round(zoom * 100) + '%';
        root.dataset.traceSchZoom = String(zoom);
        return zoom;
    }

    function fitZoom(root) {
        var svg = root.querySelector('.trace-schematic-svg');
        var scroll = root.querySelector('.trace-schematic-scroll');
        if (!svg || !scroll) return 1;
        var baseW = parseFloat(svg.getAttribute('data-base-w')) || 800;
        var baseH = parseFloat(svg.getAttribute('data-base-h')) || 300;
        var z = Math.min((scroll.clientWidth - 16) / baseW, (scroll.clientHeight - 12) / baseH, 1.5);
        return applyZoom(root, Math.max(0.28, z));
    }

    function removeTraceModalPdfBar() {
        document.querySelectorAll('.trace-sch-pdf-bar').forEach(function (el) {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    function exportTraceSchematicToPdf(root) {
        var svg = root && root.querySelector('.trace-schematic-svg');
        if (!svg) {
            if (typeof global.showWarning === 'function') global.showWarning('Нет схемы для экспорта', 'Трассировка');
            return;
        }
        try {
            var serializer = new XMLSerializer();
            var src = serializer.serializeToString(svg);
            var blob = new Blob([src], { type: 'image/svg+xml;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'trace-schematic.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
            if (typeof global.showInfo === 'function') global.showInfo('Схема сохранена (SVG)', 'Трассировка');
        } catch (e) {
            if (typeof global.showWarning === 'function') global.showWarning('Не удалось экспортировать схему', 'Трассировка');
        }
    }

    function attachTraceModalHandlers(container) {
        if (!container || container.dataset.fiberTraceHandlersBound === '1') return;
        container.dataset.fiberTraceHandlersBound = '1';

        container.addEventListener('click', function (e) {
            var back = e.target.closest('.trace-back-btn');
            if (back && typeof global.returnFromTraceToObjectCard === 'function') {
                global.returnFromTraceToObjectCard();
            return;
        }
            if (e.target.closest('.trace-highlight-btn') && typeof global.highlightTracePath === 'function') {
                global.highlightTracePath();
                return;
            }
            if (e.target.closest('.trace-copy-btn')) {
            var paths = global.currentTracePaths;
            if (!paths || !paths.length) {
                var single = global.currentTracePath;
                paths = (single && single.length) ? [single] : [];
            }
            copyTraceToClipboard(paths).then(function () {
                    if (typeof global.showInfo === 'function') global.showInfo('Маршрут скопирован', 'Трассировка');
            }).catch(function () {
                    if (typeof global.showWarning === 'function') global.showWarning('Не удалось скопировать', 'Трассировка');
            });
                return;
            }
            if (e.target.closest('.trace-steps-toggle')) {
            var steps = container.querySelector('.trace-studio-steps');
            if (!steps) return;
            var open = steps.classList.toggle('is-collapsed') === false;
            container.querySelectorAll('.trace-steps-toggle').forEach(function (b) {
                b.setAttribute('aria-pressed', open ? 'true' : 'false');
            });
                return;
            }
            var zoomBtn = e.target.closest('[data-trace-sch-zoom]');
            if (zoomBtn) {
                var root = zoomBtn.closest('.trace-schematic') || container;
                var cur = parseFloat(root.dataset.traceSchZoom) || 1;
                var act = zoomBtn.getAttribute('data-trace-sch-zoom');
                if (act === 'in') applyZoom(root, cur + 0.1);
                else if (act === 'out') applyZoom(root, cur - 0.1);
                else if (act === 'fit') fitZoom(root);
                else if (act === 'reset') applyZoom(root, 1);
                return;
            }
            if (e.target.closest('[data-trace-sch-pdf]')) {
                exportTraceSchematicToPdf(e.target.closest('.trace-schematic') || container);
                return;
            }
            var chip = e.target.closest('.trace-branch-chip');
            if (chip) {
                var idx = parseInt(chip.getAttribute('data-branch-index'), 10);
                var all = global.currentTracePaths;
                if (!all || !all[idx]) return;
                global.currentTracePath = all[idx];
                container.querySelectorAll('.trace-branch-chip').forEach(function (c) {
                    c.classList.toggle('trace-branch-chip--active', c === chip);
                });
                if (typeof global.highlightTracePath === 'function') global.highlightTracePath();
            }
        });

        container.addEventListener('input', function (e) {
            if (!e.target.classList.contains('trace-sch-zoom-slider')) return;
            var root = e.target.closest('.trace-schematic') || container;
            applyZoom(root, (parseFloat(e.target.value) || 100) / 100);
        });

        container.addEventListener('wheel', function (e) {
            if (!e.ctrlKey) return;
            var root = e.target.closest('.trace-schematic');
            if (!root) return;
            e.preventDefault();
            var cur = parseFloat(root.dataset.traceSchZoom) || 1;
            applyZoom(root, cur + (e.deltaY < 0 ? 0.1 : -0.1));
        }, { passive: false });

        var sch = container.querySelector('.trace-schematic');
        if (sch) {
            requestAnimationFrame(function () { fitZoom(sch); });
        }
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
