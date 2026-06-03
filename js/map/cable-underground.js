/**
 * Подземные участки ВОЛС: между двумя колодцами (вход/выход), свободная геометрия pathCoords.
 */
(function (global) {
    var UNDERGROUND_COLOR = '#dc2626';
    var UNDERGROUND_WIDTH = 3;
    var UNDERGROUND_DASH = '10 6';
    var UNDERGROUND_OPACITY = 0.92;

    function getUid(obj) {
        return obj && obj.properties ? obj.properties.get('uniqueId') : null;
    }

    function normalizePathCoords(pathCoords) {
        if (!Array.isArray(pathCoords)) return [];
        var out = [];
        for (var i = 0; i < pathCoords.length; i++) {
            var c = pathCoords[i];
            if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
                out.push([c[0], c[1]]);
            }
        }
        return out;
    }

    /** Нормализация записи участка (поддержка старого формата manholeId + supportId). */
    function normalizeSpanRecord(s) {
        if (!s) return null;
        return {
            entryManholeId: s.entryManholeId || s.manholeId || null,
            exitManholeId: s.exitManholeId || s.supportId || null,
            pathCoords: normalizePathCoords(s.pathCoords)
        };
    }

    function findSpanBetweenManholes(spans, idA, idB) {
        if (!Array.isArray(spans) || !idA || !idB) return null;
        for (var i = 0; i < spans.length; i++) {
            var n = normalizeSpanRecord(spans[i]);
            if (!n || !n.entryManholeId || !n.exitManholeId) continue;
            var e = n.entryManholeId;
            var x = n.exitManholeId;
            if ((e === idA && x === idB) || (e === idB && x === idA)) return n;
        }
        return null;
    }

    /** Воздушная геометрия кабеля: только точки маршрута, без pathCoords под землёй. */
    function buildAerialCableCoordsFromRoute(points) {
        if (!Array.isArray(points) || points.length < 2) return [];
        var out = [];
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            var c = p && p.geometry ? p.geometry.getCoordinates() : null;
            if (c && c.length >= 2) out.push(c);
        }
        return out.length >= 2 ? out : [];
    }

    /**
     * Участки зелёного (воздушного) кабеля: разрыв между колодцами, если между ними подземный span.
     * Возвращает массив линий [[lat,lon], ...], ...
     */
    function buildAerialDisplaySegments(points, undergroundSpans) {
        if (!Array.isArray(points) || points.length < 2) return [];
        var spans = undergroundSpans || [];
        if (!spans.length) {
            var single = buildAerialCableCoordsFromRoute(points);
            return single.length >= 2 ? [single] : [];
        }

        var segments = [];
        var current = [];

        function pushCoord(c) {
            if (!c || c.length < 2) return;
            if (current.length) {
                var last = current[current.length - 1];
                if (last[0] === c[0] && last[1] === c[1]) return;
            }
            current.push(c);
        }

        function flush() {
            if (current.length >= 2) segments.push(current.slice());
            current = [];
        }

        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            var c = p && p.geometry ? p.geometry.getCoordinates() : null;
            if (!c) continue;

            if (i > 0) {
                var prev = points[i - 1];
                var ta = prev.properties ? prev.properties.get('type') : null;
                var tb = p.properties ? p.properties.get('type') : null;
                if (ta === 'manhole' && tb === 'manhole') {
                    var span = findSpanBetweenManholes(spans, getUid(prev), getUid(p));
                    if (span) {
                        flush();
                        current = [];
                        pushCoord(c);
                        continue;
                    }
                }
            }
            pushCoord(c);
        }
        flush();

        if (!segments.length) {
            var fallback = buildAerialCableCoordsFromRoute(points);
            return fallback.length >= 2 ? [fallback] : [];
        }
        return segments;
    }

    function getCableStrokeOptionsFromCable(cable) {
        if (!cable || !cable.options) {
            return {
                strokeColor: UNDERGROUND_COLOR,
                strokeWidth: UNDERGROUND_WIDTH,
                strokeOpacity: UNDERGROUND_OPACITY
            };
        }
        return {
            strokeColor: cable.options.get('strokeColor'),
            strokeWidth: cable.options.get('strokeWidth'),
            strokeOpacity: cable.options.get('strokeOpacity')
        };
    }

    function removeCableAerialOverlays(cable) {
        if (!cable || !cable.properties) return;
        var overlays = cable.properties.get('aerialOverlays');
        if (!Array.isArray(overlays)) return;
        var map = global.myMap;
        overlays.forEach(function (ol) {
            if (map && ol) {
                try { map.geoObjects.remove(ol); } catch (e) {}
            }
        });
        cable.properties.set('aerialOverlays', []);
    }

    function syncAerialOverlayStroke(cable) {
        if (!cable || !cable.properties) return;
        var overlays = cable.properties.get('aerialOverlays');
        if (!Array.isArray(overlays) || !overlays.length) return;
        var stroke = getCableStrokeOptionsFromCable(cable);
        var z = cable.options ? cable.options.get('zIndex') : null;
        overlays.forEach(function (ol) {
            if (!ol || !ol.options) return;
            try {
                ol.options.set(stroke);
                if (z != null) ol.options.set('zIndex', z);
            } catch (e) {}
        });
    }

    function refreshCableAerialOverlays(cable, segments) {
        if (!cable || !cable.properties || !global.myMap) return;
        removeCableAerialOverlays(cable);
        if (!Array.isArray(segments) || segments.length <= 1) return;

        var stroke = getCableStrokeOptionsFromCable(cable);
        var zIndex = (cable.options && cable.options.get('zIndex') != null)
            ? cable.options.get('zIndex')
            : 500;
        var overlays = [];

        for (var i = 1; i < segments.length; i++) {
            if (!segments[i] || segments[i].length < 2) continue;
            var line = new ymaps.Polyline(segments[i], {}, {
                strokeColor: stroke.strokeColor,
                strokeWidth: stroke.strokeWidth,
                strokeOpacity: stroke.strokeOpacity,
                zIndex: zIndex,
                cursor: 'pointer',
                interactive: true,
                hasBalloon: false,
                hasHint: false
            });
            line.properties.set('type', 'cableAerialOverlay');
            line.properties.set('parentCableId', cable.properties.get('uniqueId'));
            global.myMap.geoObjects.add(line);
            overlays.push(line);
        }
        cable.properties.set('aerialOverlays', overlays);
        if (typeof global.bindAllCableAerialOverlays === 'function') {
            global.bindAllCableAerialOverlays(cable);
        }
    }

    function getCableDisplayGeometries(cable) {
        var lines = [];
        if (!cable) return lines;
        if (cable.geometry) {
            try {
                var main = cable.geometry.getCoordinates();
                if (main && main.length >= 2) lines.push(main);
            } catch (e) {}
        }
        var aerial = cable.properties && cable.properties.get('aerialOverlays');
        if (Array.isArray(aerial)) {
            aerial.forEach(function (ol) {
                if (!ol || !ol.geometry) return;
                try {
                    var c = ol.geometry.getCoordinates();
                    if (c && c.length >= 2) lines.push(c);
                } catch (e2) {}
            });
        }
        return lines;
    }

    /** Полная геометрия с pathCoords (legacy / расчёты). */
    function buildCableCoordsFromRoute(points, undergroundSpans) {
        if (!Array.isArray(points) || points.length < 2) return [];
        var spans = undergroundSpans || [];
        var out = [];
        for (var i = 0; i < points.length - 1; i++) {
            var a = points[i];
            var b = points[i + 1];
            var ca = a && a.geometry ? a.geometry.getCoordinates() : null;
            var cb = b && b.geometry ? b.geometry.getCoordinates() : null;
            if (!ca || !cb) continue;
            var ta = a.properties ? a.properties.get('type') : null;
            var tb = b.properties ? b.properties.get('type') : null;
            if (out.length === 0) out.push(ca);
            if (ta === 'manhole' && tb === 'manhole') {
                var span = findSpanBetweenManholes(spans, getUid(a), getUid(b));
                if (span && span.pathCoords && span.pathCoords.length) {
                    for (var j = 0; j < span.pathCoords.length; j++) out.push(span.pathCoords[j]);
                }
            }
            out.push(cb);
        }
        return out.length >= 2 ? out : [];
    }

    function resolveSpanManholes(span, points) {
        var n = normalizeSpanRecord(span);
        if (!n || !Array.isArray(points)) return { entry: null, exit: null };
        var entry = null;
        var exit = null;
        for (var i = 0; i < points.length; i++) {
            var uid = getUid(points[i]);
            if (uid === n.entryManholeId) entry = points[i];
            if (uid === n.exitManholeId) exit = points[i];
        }
        return { entry: entry, exit: exit };
    }

    function getSpanOverlayCoords(span, points) {
        var n = normalizeSpanRecord(span);
        var ep = resolveSpanManholes(span, points);
        if (ep.entry && ep.exit) {
            var c0 = ep.entry.geometry.getCoordinates();
            var c1 = ep.exit.geometry.getCoordinates();
            if (c0 && c1) {
                var coords = [c0];
                if (n && n.pathCoords) {
                    for (var i = 0; i < n.pathCoords.length; i++) coords.push(n.pathCoords[i]);
                }
                coords.push(c1);
                return coords;
            }
        }
        if (n && n.pathCoords && n.pathCoords.length >= 2) {
            return n.pathCoords.slice();
        }
        return [];
    }

    /** Полная линия для сохранения/загрузки (воздух + pathCoords под землёй). */
    function getCableGeometryForSave(cable) {
        if (!cable || !cable.geometry) return null;
        var props = cable.properties;
        var spans = props ? props.get('undergroundSpans') : null;
        var points = props ? props.get('points') : null;
        if (Array.isArray(spans) && spans.length && Array.isArray(points) && points.length >= 2) {
            var full = buildCableCoordsFromRoute(points, spans);
            if (full.length >= 2) return full;
        }
        var lines = getCableDisplayGeometries(cable);
        if (lines.length) {
            var flat = [];
            lines.forEach(function (line) {
                if (!line || line.length < 2) return;
                for (var j = 0; j < line.length; j++) {
                    var c = line[j];
                    if (!c || c.length < 2) continue;
                    if (flat.length) {
                        var last = flat[flat.length - 1];
                        if (last[0] === c[0] && last[1] === c[1]) continue;
                    }
                    flat.push([c[0], c[1]]);
                }
            });
            if (flat.length >= 2) return flat;
        }
        try {
            var raw = cable.geometry.getCoordinates();
            if (Array.isArray(raw) && raw.length >= 2 && typeof raw[0][0] === 'number') {
                return normalizePathCoords(raw);
            }
        } catch (e) {}
        return null;
    }

    function removeCableUndergroundOverlays(cable) {
        if (!cable || !cable.properties) return;
        var overlays = cable.properties.get('undergroundOverlays');
        if (!Array.isArray(overlays)) return;
        var map = global.myMap;
        overlays.forEach(function (ol) {
            if (map && ol) {
                try { map.geoObjects.remove(ol); } catch (e) {}
            }
        });
        cable.properties.set('undergroundOverlays', []);
    }

    function setOverlaysVisible(cable, visible) {
        if (!cable || !cable.properties) return;
        ['undergroundOverlays', 'aerialOverlays'].forEach(function (key) {
            var overlays = cable.properties.get(key);
            if (!Array.isArray(overlays)) return;
            overlays.forEach(function (ol) {
                if (ol && ol.options) {
                    try { ol.options.set('visible', !!visible); } catch (e) {}
                }
            });
        });
    }

    function refreshCableUndergroundOverlays(cable) {
        if (!cable || !cable.properties || !global.myMap) return;
        removeCableUndergroundOverlays(cable);
        var spans = cable.properties.get('undergroundSpans');
        if (!Array.isArray(spans) || !spans.length) return;
        var points = cable.properties.get('points');
        var overlays = [];
        spans.forEach(function (span, spanIndex) {
            var coords = getSpanOverlayCoords(span, points);
            if (coords.length < 2) return;
            var line = new ymaps.Polyline(coords, {}, {
                strokeColor: UNDERGROUND_COLOR,
                strokeWidth: UNDERGROUND_WIDTH,
                strokeStyle: UNDERGROUND_DASH,
                strokeOpacity: UNDERGROUND_OPACITY,
                zIndex: 502,
                interactive: true,
                cursor: 'pointer',
                hasBalloon: false,
                hasHint: true,
                hintContent: 'Клик — проложить подземный участок заново'
            });
            line.properties.set('type', 'cableUndergroundOverlay');
            line.properties.set('parentCableId', cable.properties.get('uniqueId'));
            line.properties.set('undergroundSpanIndex', spanIndex);
            line.events.add('click', function (evt) {
                try {
                    if (evt && evt.stopPropagation) evt.stopPropagation();
                    var orig = evt.get && evt.get('originalEvent');
                    if (orig && orig.stopPropagation) orig.stopPropagation();
                } catch (e) {}
                if (typeof global.onUndergroundSpanClick === 'function') {
                    global.onUndergroundSpanClick(cable, spanIndex);
                }
                return false;
            });
            global.myMap.geoObjects.add(line);
            overlays.push(line);
        });
        cable.properties.set('undergroundOverlays', overlays);
    }

    function computeRouteDistance(points, undergroundSpans) {
        if (!Array.isArray(points) || points.length < 2) return 0;
        var calc = global.calculateDistance;
        if (typeof calc !== 'function') return 0;
        var spans = undergroundSpans || [];
        var total = 0;
        for (var i = 0; i < points.length - 1; i++) {
            var a = points[i];
            var b = points[i + 1];
            if (!a || !b || !a.geometry || !b.geometry) continue;
            var ta = a.properties ? a.properties.get('type') : null;
            var tb = b.properties ? b.properties.get('type') : null;
            if (ta === 'manhole' && tb === 'manhole') {
                var span = findSpanBetweenManholes(spans, getUid(a), getUid(b));
                if (span) {
                    var oc = getSpanOverlayCoords(span, points);
                    for (var j = 0; j < oc.length - 1; j++) {
                        total += calc(oc[j], oc[j + 1]);
                    }
                    continue;
                }
            }
            var ca = a.geometry.getCoordinates();
            var cb = b.geometry.getCoordinates();
            if (ca && cb) total += calc(ca, cb);
        }
        return total;
    }

    function applyCableRouteGeometry(cable, points, undergroundSpans) {
        if (!cable || !cable.properties) return;
        var pts = points || cable.properties.get('points');
        var spans = undergroundSpans != null ? undergroundSpans : (cable.properties.get('undergroundSpans') || []);
        var segments;
        var hasUnderground = Array.isArray(spans) && spans.length;

        if (hasUnderground) {
            segments = buildAerialDisplaySegments(pts, spans);
        } else {
            removeCableAerialOverlays(cable);
            var coords = buildAerialCableCoordsFromRoute(pts);
            segments = coords.length >= 2 ? [coords] : [];
        }

        if (!segments.length && hasUnderground) {
            removeCableAerialOverlays(cable);
            var stubCoords = buildAerialCableCoordsFromRoute(pts);
            if (cable.geometry && stubCoords.length >= 2) {
                try { cable.geometry.setCoordinates(stubCoords); } catch (eStub) {}
            } else if (cable.geometry && pts && pts.length) {
                try {
                    var c0 = pts[0] && pts[0].geometry ? pts[0].geometry.getCoordinates() : null;
                    if (c0) cable.geometry.setCoordinates([c0, c0]);
                } catch (eStub2) {}
            }
            if (cable.options) {
                try { cable.options.set('strokeOpacity', stubCoords.length >= 2 ? 0.8 : 0); } catch (eOp) {}
            }
        } else if (segments.length >= 1 && cable.geometry) {
            try { cable.geometry.setCoordinates(segments[0]); } catch (eSet) {}
            if (cable.options) {
                try {
                    var op = cable.options.get('strokeOpacity');
                    if (op === 0 || op == null) cable.options.set('strokeOpacity', 0.8);
                } catch (eOp2) {}
            }
            refreshCableAerialOverlays(cable, segments);
        } else {
            removeCableAerialOverlays(cable);
        }

        cable.properties.set('distance', computeRouteDistance(pts, spans));
    }

    function removeAllCableRouteOverlays(cable) {
        removeCableUndergroundOverlays(cable);
        removeCableAerialOverlays(cable);
    }

    function findSpanIndexBetweenManholes(spans, idA, idB) {
        if (!Array.isArray(spans) || !idA || !idB) return -1;
        for (var i = 0; i < spans.length; i++) {
            var n = normalizeSpanRecord(spans[i]);
            if (!n || !n.entryManholeId || !n.exitManholeId) continue;
            var e = n.entryManholeId;
            var x = n.exitManholeId;
            if ((e === idA && x === idB) || (e === idB && x === idA)) return i;
        }
        return -1;
    }

    function findRoutePointByUid(points, uid) {
        if (!uid || !Array.isArray(points)) return null;
        for (var i = 0; i < points.length; i++) {
            if (getUid(points[i]) === uid) return points[i];
        }
        return null;
    }

    function findObjectByUid(uid) {
        if (!uid || !global.objects) return null;
        var arr = global.objects;
        for (var i = 0; i < arr.length; i++) {
            if (getUid(arr[i]) === uid) return arr[i];
        }
        return null;
    }

    function dedupeConsecutiveRoutePoints(route) {
        if (!Array.isArray(route) || route.length < 2) return route || [];
        var out = [route[0]];
        for (var i = 1; i < route.length; i++) {
            var prev = out[out.length - 1];
            var cur = route[i];
            if (getUid(prev) && getUid(cur) && getUid(prev) === getUid(cur)) continue;
            if (prev === cur) continue;
            out.push(cur);
        }
        return out.length >= 2 ? out : route;
    }

    function insertManholePairIntoRoute(route, entry, exit) {
        if (!route || route.length < 2 || !entry || !exit) return route;
        var uE = getUid(entry);
        var uX = getUid(exit);
        if (!uE || !uX) return route;
        if (findRoutePointByUid(route, uE) && findRoutePointByUid(route, uX)) return route;

        var ei = -1;
        var xi = -1;
        for (var i = 0; i < route.length; i++) {
            if (getUid(route[i]) === uE) ei = i;
            if (getUid(route[i]) === uX) xi = i;
        }

        if (ei >= 0 && xi >= 0) return route;

        if (ei >= 0 && xi < 0) {
            var afterEntry = route.slice(0, ei + 1).concat([exit], route.slice(ei + 1));
            return dedupeConsecutiveRoutePoints(afterEntry);
        }
        if (xi >= 0 && ei < 0) {
            var beforeExit = route.slice(0, xi).concat([entry], route.slice(xi));
            return dedupeConsecutiveRoutePoints(beforeExit);
        }

        var last = route[route.length - 1];
        var head = route.slice(0, -1).filter(function (p) {
            var u = getUid(p);
            return u !== uE && u !== uX;
        });
        return dedupeConsecutiveRoutePoints(head.concat([entry, exit, last]));
    }

    /** После загрузки: колодцы из undergroundSpans должны быть в points, иначе кабель не рисуется. */
    function ensureRouteIncludesUndergroundManholes(points, spans) {
        if (!Array.isArray(points) || points.length < 2 || !Array.isArray(spans) || !spans.length) {
            return points;
        }
        var route = points.slice();
        spans.forEach(function (sp) {
            var n = normalizeSpanRecord(sp);
            if (!n || !n.entryManholeId || !n.exitManholeId) return;
            var entry = findRoutePointByUid(route, n.entryManholeId) || findObjectByUid(n.entryManholeId);
            var exit = findRoutePointByUid(route, n.exitManholeId) || findObjectByUid(n.exitManholeId);
            if (!entry || !exit) return;
            route = insertManholePairIntoRoute(route, entry, exit);
        });
        return route;
    }

    function getManholeDisplayName(obj) {
        if (!obj || !obj.properties) return 'Колодец';
        var name = obj.properties.get('name');
        return (name && String(name).trim()) ? String(name).trim() : 'Колодец';
    }

    function getSpanDistanceMeters(span, points) {
        var coords = getSpanOverlayCoords(span, points);
        var calc = global.calculateDistance;
        if (!calc || !coords || coords.length < 2) return 0;
        var sum = 0;
        for (var i = 0; i < coords.length - 1; i++) {
            sum += calc(coords[i], coords[i + 1]);
        }
        return Math.round(sum);
    }

    function getUndergroundSpansInfo(cable, points) {
        if (!cable || !cable.properties) return [];
        var spans = cable.properties.get('undergroundSpans');
        if (!Array.isArray(spans) || !spans.length) return [];
        var pts = points || cable.properties.get('points') || [];
        var out = [];
        for (var si = 0; si < spans.length; si++) {
            var n = normalizeSpanRecord(spans[si]);
            if (!n) continue;
            var entry = findRoutePointByUid(pts, n.entryManholeId);
            var exit = findRoutePointByUid(pts, n.exitManholeId);
            out.push({
                index: si,
                entryManholeId: n.entryManholeId,
                exitManholeId: n.exitManholeId,
                entryName: getManholeDisplayName(entry),
                exitName: getManholeDisplayName(exit),
                pathPoints: n.pathCoords ? n.pathCoords.length : 0,
                distanceM: getSpanDistanceMeters(spans[si], pts)
            });
        }
        return out;
    }

    function isUndergroundLegBetween(routePoints, legIndex, spans) {
        if (!Array.isArray(routePoints) || legIndex < 0 || legIndex >= routePoints.length - 1) return null;
        var a = routePoints[legIndex];
        var b = routePoints[legIndex + 1];
        if (!a || !b || !a.properties || !b.properties) return null;
        if (a.properties.get('type') !== 'manhole' || b.properties.get('type') !== 'manhole') return null;
        var idA = getUid(a);
        var idB = getUid(b);
        if (!idA || !idB) return null;
        var spanIdx = findSpanIndexBetweenManholes(spans, idA, idB);
        if (spanIdx < 0) return null;
        return { spanIndex: spanIdx, span: spans[spanIdx] };
    }

    function getUndergroundDistanceMeters(cable) {
        if (!cable || !cable.properties) return 0;
        var spans = cable.properties.get('undergroundSpans');
        var points = cable.properties.get('points');
        if (!Array.isArray(spans) || !spans.length) return 0;
        var calc = global.calculateDistance;
        if (typeof calc !== 'function') return 0;
        var sum = 0;
        spans.forEach(function (span) {
            var coords = getSpanOverlayCoords(span, points);
            for (var i = 0; i < coords.length - 1; i++) {
                sum += calc(coords[i], coords[i + 1]);
            }
        });
        return sum;
    }

    function cloneSpans(spans) {
        if (!Array.isArray(spans)) return [];
        return spans.map(function (s) {
            var n = normalizeSpanRecord(s);
            return n ? {
                entryManholeId: n.entryManholeId,
                exitManholeId: n.exitManholeId,
                pathCoords: n.pathCoords
            } : null;
        }).filter(Boolean);
    }

    function splitSpansForRoute(spans, pointsA, pointsB) {
        if (!Array.isArray(spans) || !spans.length) return { spansA: [], spansB: [] };
        var uidsA = {};
        var uidsB = {};
        (pointsA || []).forEach(function (p) {
            var u = getUid(p);
            if (u) uidsA[u] = true;
        });
        (pointsB || []).forEach(function (p) {
            var u = getUid(p);
            if (u) uidsB[u] = true;
        });
        var spansA = [];
        var spansB = [];
        spans.forEach(function (s) {
            var n = normalizeSpanRecord(s);
            if (!n) return;
            var onA = uidsA[n.entryManholeId] && uidsA[n.exitManholeId];
            var onB = uidsB[n.entryManholeId] && uidsB[n.exitManholeId];
            if (onA) spansA.push(s);
            else if (onB) spansB.push(s);
        });
        return { spansA: spansA, spansB: spansB };
    }

    global.CableUnderground = {
        UNDERGROUND_COLOR: UNDERGROUND_COLOR,
        normalizeSpanRecord: normalizeSpanRecord,
        buildAerialCableCoordsFromRoute: buildAerialCableCoordsFromRoute,
        buildAerialDisplaySegments: buildAerialDisplaySegments,
        buildCableCoordsFromRoute: buildCableCoordsFromRoute,
        computeRouteDistance: computeRouteDistance,
        normalizePathCoords: normalizePathCoords,
        removeCableUndergroundOverlays: removeCableUndergroundOverlays,
        removeCableAerialOverlays: removeCableAerialOverlays,
        removeAllCableRouteOverlays: removeAllCableRouteOverlays,
        refreshCableUndergroundOverlays: refreshCableUndergroundOverlays,
        refreshCableAerialOverlays: refreshCableAerialOverlays,
        applyCableRouteGeometry: applyCableRouteGeometry,
        getCableDisplayGeometries: getCableDisplayGeometries,
        syncAerialOverlayStroke: syncAerialOverlayStroke,
        findSpanBetweenManholes: findSpanBetweenManholes,
        findSpanIndexBetweenManholes: findSpanIndexBetweenManholes,
        isUndergroundLegBetween: isUndergroundLegBetween,
        getUndergroundSpansInfo: getUndergroundSpansInfo,
        getSpanDistanceMeters: getSpanDistanceMeters,
        getUndergroundDistanceMeters: getUndergroundDistanceMeters,
        cloneSpans: cloneSpans,
        splitSpansForRoute: splitSpansForRoute,
        setOverlaysVisible: setOverlaysVisible,
        ensureRouteIncludesUndergroundManholes: ensureRouteIncludesUndergroundManholes,
        findRoutePointByUid: findRoutePointByUid,
        getCableGeometryForSave: getCableGeometryForSave
    };
})(typeof window !== 'undefined' ? window : this);
