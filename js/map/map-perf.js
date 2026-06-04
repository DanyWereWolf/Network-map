/**
 * Индекс объектов, отсечение по viewport, планировщик линий связи.
 */
(function(global) {
    var objectsById = new Map();
    var VIEWPORT_CULL_MIN_OBJECTS = 120;
    var VIEWPORT_BUFFER_RATIO = 0.12;
    var ZOOM_SHOW_CONNECTION_LINES = 17;

    function uidFromObj(obj) {
        if (!obj || !obj.properties) return null;
        var id = obj.properties.get('uniqueId');
        return id != null && id !== '' ? String(id) : null;
    }

    function registerMapObject(obj) {
        var uid = uidFromObj(obj);
        if (!uid) return;
        objectsById.set(uid, obj);
    }

    function unregisterMapObject(obj) {
        var uid = uidFromObj(obj);
        if (uid) objectsById.delete(uid);
        else if (obj && obj.properties) {
            objectsById.forEach(function(v, k) {
                if (v === obj) objectsById.delete(k);
            });
        }
    }

    function clearObjectsIndex() {
        objectsById.clear();
    }

    function reindexAllObjects(list) {
        clearObjectsIndex();
        if (!Array.isArray(list)) return;
        for (var i = 0; i < list.length; i++) registerMapObject(list[i]);
    }

    function getByUid(uid, typeFilter) {
        if (uid == null || uid === '') return null;
        var obj = objectsById.get(String(uid));
        if (!obj) return null;
        if (typeFilter && obj.properties) {
            var t = obj.properties.get('type');
            if (t !== typeFilter) return null;
        }
        return obj;
    }

    function shouldUseViewportCull() {
        return typeof objects !== 'undefined' && Array.isArray(objects) &&
            objects.length >= VIEWPORT_CULL_MIN_OBJECTS;
    }

    function getExpandedBounds(map) {
        if (!map || typeof map.getBounds !== 'function') return null;
        var b = map.getBounds();
        if (!b || !b[0] || !b[1]) return null;
        var minLat = Math.min(b[0][0], b[1][0]);
        var maxLat = Math.max(b[0][0], b[1][0]);
        var minLon = Math.min(b[0][1], b[1][1]);
        var maxLon = Math.max(b[0][1], b[1][1]);
        var dLat = (maxLat - minLat) * VIEWPORT_BUFFER_RATIO;
        var dLon = (maxLon - minLon) * VIEWPORT_BUFFER_RATIO;
        return {
            minLat: minLat - dLat,
            maxLat: maxLat + dLat,
            minLon: minLon - dLon,
            maxLon: maxLon + dLon
        };
    }

    function coordInBounds(coord, bounds) {
        if (!coord || coord.length < 2 || !bounds) return true;
        var lat = coord[0];
        var lon = coord[1];
        return lat >= bounds.minLat && lat <= bounds.maxLat &&
            lon >= bounds.minLon && lon <= bounds.maxLon;
    }

    function geometryIntersectsBounds(obj, bounds) {
        if (!obj || !bounds) return true;
        try {
            if (obj.geometry && typeof obj.geometry.getCoordinates === 'function') {
                var c = obj.geometry.getCoordinates();
                if (!c) return true;
                if (typeof c[0] === 'number') return coordInBounds(c, bounds);
                if (Array.isArray(c[0]) && typeof c[0][0] === 'number') {
                    for (var i = 0; i < c.length; i++) {
                        if (coordInBounds(c[i], bounds)) return true;
                    }
                    return false;
                }
                if (Array.isArray(c[0]) && Array.isArray(c[0][0])) {
                    for (var ri = 0; ri < c.length; ri++) {
                        var ring = c[ri];
                        if (!Array.isArray(ring)) continue;
                        for (var j = 0; j < ring.length; j++) {
                            if (coordInBounds(ring[j], bounds)) return true;
                        }
                    }
                    return false;
                }
            }
        } catch (e) {}
        return true;
    }

    function cableInViewport(cable, bounds) {
        if (!cable || !cable.properties || !bounds) return true;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from && from.geometry && coordInBounds(from.geometry.getCoordinates(), bounds)) return true;
        if (to && to.geometry && coordInBounds(to.geometry.getCoordinates(), bounds)) return true;
        var points = cable.properties.get('points');
        if (Array.isArray(points)) {
            for (var i = 0; i < points.length; i++) {
                var p = points[i];
                if (p && p.geometry && coordInBounds(p.geometry.getCoordinates(), bounds)) return true;
            }
        }
        return geometryIntersectsBounds(cable, bounds);
    }

    function isObjectInViewport(obj, bounds) {
        if (!obj || !bounds) return true;
        var type = obj.properties && obj.properties.get('type');
        if (type === 'cable') return cableInViewport(obj, bounds);
        if (type === 'cableLabel') {
            var cables = obj.properties.get('cables');
            if (!Array.isArray(cables)) return true;
            for (var i = 0; i < cables.length; i++) {
                if (cableInViewport(cables[i], bounds)) return true;
            }
            return false;
        }
        return geometryIntersectsBounds(obj, bounds);
    }

    function connectionLinesVisibleAtZoom(zoom) {
        return typeof zoom !== 'number' || zoom >= ZOOM_SHOW_CONNECTION_LINES;
    }

    var pendingConnectionUids = null;
    var connectionLinesTimer = null;
    var CONNECTION_LINES_DEBOUNCE_MS = 48;

    function scheduleConnectionLinesUpdate(uidOrList) {
        if (uidOrList == null || uidOrList === 'full') {
            pendingConnectionUids = null;
        } else if (pendingConnectionUids !== null) {
            if (!pendingConnectionUids) pendingConnectionUids = new Set();
            if (Array.isArray(uidOrList)) {
                uidOrList.forEach(function(u) { if (u) pendingConnectionUids.add(String(u)); });
            } else {
                pendingConnectionUids.add(String(uidOrList));
            }
        } else {
            pendingConnectionUids = new Set();
            if (Array.isArray(uidOrList)) {
                uidOrList.forEach(function(u) { if (u) pendingConnectionUids.add(String(u)); });
            } else {
                pendingConnectionUids.add(String(uidOrList));
            }
        }
        if (connectionLinesTimer) return;
        connectionLinesTimer = setTimeout(function() {
            connectionLinesTimer = null;
            var uids = pendingConnectionUids;
            pendingConnectionUids = null;
            if (typeof global.flushMapConnectionLines === 'function') {
                global.flushMapConnectionLines(uids);
            } else if (typeof global.updateAllConnectionLines === 'function') {
                global.updateAllConnectionLines();
            }
        }, CONNECTION_LINES_DEBOUNCE_MS);
    }

    global.MapPerf = {
        registerMapObject: registerMapObject,
        unregisterMapObject: unregisterMapObject,
        clearObjectsIndex: clearObjectsIndex,
        reindexAllObjects: reindexAllObjects,
        getByUid: getByUid,
        shouldUseViewportCull: shouldUseViewportCull,
        getExpandedBounds: getExpandedBounds,
        coordInBounds: coordInBounds,
        isObjectInViewport: isObjectInViewport,
        connectionLinesVisibleAtZoom: connectionLinesVisibleAtZoom,
        scheduleConnectionLinesUpdate: scheduleConnectionLinesUpdate,
        ZOOM_SHOW_CONNECTION_LINES: ZOOM_SHOW_CONNECTION_LINES,
        VIEWPORT_CULL_MIN_OBJECTS: VIEWPORT_CULL_MIN_OBJECTS
    };
})(typeof window !== 'undefined' ? window : this);
