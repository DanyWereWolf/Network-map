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
                var merged = Object.assign({}, item, { waypoints: waypoints });
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

    function estimatePathDistanceM(path) {
        if (!path || !path.length || typeof global.calculateDistance !== 'function') return null;
        var total = 0;
        var lastObj = null;
        for (var i = 0; i < path.length; i++) {
            var item = path[i];
            if (item.type === 'start' || item.type === 'object') {
                lastObj = item.object;
            } else if (item.type === 'cable' && item.cable && lastObj) {
                var nextObj = null;
                for (var k = i + 1; k < path.length; k++) {
                    if (path[k].type === 'object' || path[k].type === 'start') {
                        nextObj = path[k].object;
                        break;
                    }
                }
                if (nextObj) {
                    var coords = getCableSegmentCoords(item.cable, lastObj, nextObj);
                    for (var c = 0; c < coords.length - 1; c++) {
                        total += global.calculateDistance(coords[c], coords[c + 1]);
                    }
                    lastObj = nextObj;
                }
            }
        }
        return total > 0 ? Math.round(total) : null;
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
        var status = analyzePathStatus(path);
        var dist = estimatePathDistanceM(path);
        var icon = status.status === 'complete' ? '✓' : (status.status === 'empty' ? '·' : '⚠');
        var html = '<div class="trace-path-status ' + status.cssClass + '">';
        html += '<span class="trace-path-status-icon">' + icon + '</span>';
        html += '<span class="trace-path-status-text">' + (typeof global.escapeHtml === 'function' ? global.escapeHtml(status.label) : status.label) + '</span>';
        if (dist != null) {
            html += '<span class="trace-path-status-distance">~' + dist + ' м</span>';
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
            return getObjectIcon(item.objectType) + ' ' + (item.objectName || getTypeName(item.objectType)) + port + ' (' + getTypeName(item.objectType) + ')';
        }
        if (item.type === 'cable') {
            var wp = '';
            if (item.waypoints && item.waypoints.length) {
                wp = ' [' + item.waypoints.map(function (w) {
                    return (w.objectName || getTypeName(w.objectType));
                }).join(' → ') + ']';
            }
            return '  → Кабель «' + (item.cableName || 'кабель') + '», жила ' + item.fiberNumber + wp;
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
        var displayPath = compressPathForDisplay(path);
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
        var dist = estimatePathDistanceM(path);
        var footer = status.label;
        if (dist != null) footer += ' (~' + dist + ' м)';
        lines.push('—');
        lines.push(footer);
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
        return '<div class="trace-item trace-item--object' + start + wp + '">' +
            '<span class="trace-item-glyph" aria-hidden="true">' + getObjectIcon(item.objectType) + '</span>' +
            '<div class="trace-item-main">' +
            '<span class="trace-item-title">' + esc(item.objectName || getTypeName(item.objectType)) + '</span>' +
            port +
            '<span class="trace-item-kind">' + esc(getTypeName(item.objectType)) + '</span>' +
            '</div>' + mapPinBtn(objId) + '</div>';
    }

    function renderCompactPathHtml(path, startStepNumber) {
        startStepNumber = startStepNumber || 1;
        var html = '';
        if (renderPathStatusHtml) html += renderPathStatusHtml(path);
        html += '<div class="trace-timeline">';
        var displayPath = compressPathForDisplay(path);
        displayPath.forEach(function (item) {
            if (item.type === 'start' || item.type === 'object') {
                var mod = isWaypointType(item.objectType) ? 'waypoint' : '';
                html += renderCompactObjectItem(item, mod);
            } else if (item.type === 'cable') {
                var cable = item.cable || null;
                var cableType = cable ? cable.properties.get('cableType') : null;
                var meta = getFiberMeta(cable, cableType, item.fiberNumber);
                var wp = (item.waypoints && item.waypoints.length) ? renderWaypointsInlineHtml(item.waypoints) : '';
                html += '<div class="trace-item trace-item--cable" style="--fiber-color:' + meta.color + '">' +
                    '<span class="trace-item-glyph trace-item-glyph--muted" aria-hidden="true">↳</span>' +
                    '<div class="trace-item-main">' +
                    '<span class="trace-item-cable-name">' + esc(item.cableName || 'Кабель') + '</span>' +
                    renderFiberChip(item.fiberNumber, meta, true) + wp +
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

    function attachTraceModalHandlers(container) {
        if (!container) return;
        if (typeof global.attachTraceShowOnMapHandlers === 'function') {
            global.attachTraceShowOnMapHandlers(container);
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
        buildHighlightGeometries: buildHighlightGeometries,
        getCableSegmentCoords: getCableSegmentCoords,
        renderPathStatusHtml: renderPathStatusHtml,
        renderWaypointsInlineHtml: renderWaypointsInlineHtml,
        buildTraceActionsHtml: buildTraceActionsHtml,
        buildTraceToolbarHtml: buildTraceToolbarHtml,
        buildTraceViewHtml: buildTraceViewHtml,
        renderCompactPathHtml: renderCompactPathHtml,
        attachTraceModalHandlers: attachTraceModalHandlers,
        pathToPlainText: pathToPlainText,
        pathsToPlainText: pathsToPlainText,
        pathSignature: pathSignature,
        dedupePaths: dedupePaths,
        prependNodePrefixToPath: prependNodePrefixToPath,
        renderPathsOverviewHtml: renderPathsOverviewHtml,
        copyTraceToClipboard: copyTraceToClipboard
    };
})(typeof window !== 'undefined' ? window : this);
