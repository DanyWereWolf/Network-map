/**
 * Индекс объектов, отсечение по viewport, виртуализация geoObjects, spatial index.
 */
(function(global) {
    var objectsById = new Map();
    var objectsByType = new Map();
    var VIEWPORT_CULL_MIN_OBJECTS = 120;
    var VIRTUALIZATION_MIN_OBJECTS = 400;
    var VIEWPORT_BUFFER_RATIO = 0.12;
    var SPATIAL_GRID_CELL = 0.0004;
    var SYNC_MOUNT_BATCH = 120;
    var ZOOM_SHOW_CONNECTION_LINES = 16;

    var spatialGrid = new Map();
    var mountedUids = new Set();
    var pinnedUids = new Set();
    var mountContext = null;
    var syncMountRaf = null;
    var syncMountPending = false;

    function uidFromObj(obj) {
        if (!obj || !obj.properties) return null;
        var id = obj.properties.get('uniqueId');
        return id != null && id !== '' ? String(id) : null;
    }

    function typeFromObj(obj) {
        if (!obj || !obj.properties) return null;
        var t = obj.properties.get('type');
        return t != null && t !== '' ? String(t) : null;
    }

    function addToTypeIndex(obj) {
        var t = typeFromObj(obj);
        if (!t) return;
        var bucket = objectsByType.get(t);
        if (!bucket) {
            bucket = [];
            objectsByType.set(t, bucket);
        }
        if (bucket.indexOf(obj) === -1) bucket.push(obj);
    }

    function removeFromTypeIndex(obj) {
        var t = typeFromObj(obj);
        if (!t) return;
        var bucket = objectsByType.get(t);
        if (!bucket) return;
        var idx = bucket.indexOf(obj);
        if (idx !== -1) bucket.splice(idx, 1);
        if (!bucket.length) objectsByType.delete(t);
    }

    function getByType(type) {
        if (!type) return [];
        return objectsByType.get(String(type)) || [];
    }

    function forEachOfType(type, fn) {
        var list = getByType(type);
        for (var i = 0; i < list.length; i++) fn(list[i], i);
    }

    function registerMapObject(obj) {
        var uid = uidFromObj(obj);
        if (!uid) return;
        objectsById.set(uid, obj);
        addToTypeIndex(obj);
        registerSpatial(obj);
    }

    function unregisterMapObject(obj) {
        var uid = uidFromObj(obj);
        removeFromTypeIndex(obj);
        if (uid) {
            objectsById.delete(uid);
            mountedUids.delete(uid);
            pinnedUids.delete(uid);
        } else if (obj && obj.properties) {
            objectsById.forEach(function(v, k) {
                if (v === obj) {
                    objectsById.delete(k);
                    mountedUids.delete(k);
                    pinnedUids.delete(k);
                }
            });
        }
        unregisterSpatial(obj);
    }

    function clearObjectsIndex() {
        objectsById.clear();
        objectsByType.clear();
        spatialGrid.clear();
        mountedUids.clear();
        pinnedUids.clear();
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

    function shouldUseVirtualization() {
        return typeof objects !== 'undefined' && Array.isArray(objects) &&
            objects.length >= VIRTUALIZATION_MIN_OBJECTS;
    }

    function spatialCellKey(lat, lon) {
        return Math.floor(lat / SPATIAL_GRID_CELL) + ',' + Math.floor(lon / SPATIAL_GRID_CELL);
    }

    function getObjectAnchorCoord(obj) {
        if (!obj || !obj.geometry || typeof obj.geometry.getCoordinates !== 'function') return null;
        try {
            var c = obj.geometry.getCoordinates();
            if (!c) return null;
            if (typeof c[0] === 'number') return c;
            if (Array.isArray(c[0]) && typeof c[0][0] === 'number') return c[0];
            if (Array.isArray(c[0]) && Array.isArray(c[0][0])) return c[0][0];
        } catch (e) {}
        return null;
    }

    function addToSpatialCell(key, obj) {
        var bucket = spatialGrid.get(key);
        if (!bucket) {
            bucket = [];
            spatialGrid.set(key, bucket);
        }
        if (bucket.indexOf(obj) === -1) bucket.push(obj);
    }

    function removeFromSpatialCell(key, obj) {
        var bucket = spatialGrid.get(key);
        if (!bucket) return;
        var idx = bucket.indexOf(obj);
        if (idx !== -1) bucket.splice(idx, 1);
        if (!bucket.length) spatialGrid.delete(key);
    }

    function registerSpatial(obj) {
        if (!obj) return;
        var prev = obj._spatialCellKey;
        if (prev) removeFromSpatialCell(prev, obj);
        var coord = getObjectAnchorCoord(obj);
        if (!coord) {
            obj._spatialCellKey = null;
            return;
        }
        var key = spatialCellKey(coord[0], coord[1]);
        obj._spatialCellKey = key;
        addToSpatialCell(key, obj);
    }

    function unregisterSpatial(obj) {
        if (!obj || !obj._spatialCellKey) return;
        removeFromSpatialCell(obj._spatialCellKey, obj);
        obj._spatialCellKey = null;
    }

    function updateSpatialPosition(obj) {
        registerSpatial(obj);
    }

    function querySpatialNearCoords(coords, cellRadius) {
        if (!coords || coords.length < 2) return null;
        cellRadius = cellRadius != null ? cellRadius : 1;
        var lat = coords[0];
        var lon = coords[1];
        var baseLat = Math.floor(lat / SPATIAL_GRID_CELL);
        var baseLon = Math.floor(lon / SPATIAL_GRID_CELL);
        var out = [];
        var seen = new Set();
        for (var dLat = -cellRadius; dLat <= cellRadius; dLat++) {
            for (var dLon = -cellRadius; dLon <= cellRadius; dLon++) {
                var key = (baseLat + dLat) + ',' + (baseLon + dLon);
                var bucket = spatialGrid.get(key);
                if (!bucket) continue;
                for (var i = 0; i < bucket.length; i++) {
                    var obj = bucket[i];
                    var uid = uidFromObj(obj);
                    if (uid && seen.has(uid)) continue;
                    if (uid) seen.add(uid);
                    out.push(obj);
                }
            }
        }
        return out;
    }

    function querySpatialInBounds(bounds) {
        if (!bounds) return null;
        var minLatCell = Math.floor(bounds.minLat / SPATIAL_GRID_CELL);
        var maxLatCell = Math.floor(bounds.maxLat / SPATIAL_GRID_CELL);
        var minLonCell = Math.floor(bounds.minLon / SPATIAL_GRID_CELL);
        var maxLonCell = Math.floor(bounds.maxLon / SPATIAL_GRID_CELL);
        var out = [];
        var seen = new Set();
        for (var latCell = minLatCell; latCell <= maxLatCell; latCell++) {
            for (var lonCell = minLonCell; lonCell <= maxLonCell; lonCell++) {
                var bucket = spatialGrid.get(latCell + ',' + lonCell);
                if (!bucket) continue;
                for (var i = 0; i < bucket.length; i++) {
                    var obj = bucket[i];
                    var uid = uidFromObj(obj);
                    if (uid && seen.has(uid)) continue;
                    if (uid) seen.add(uid);
                    out.push(obj);
                }
            }
        }
        return out;
    }

    function getExpandedBounds(map) {
        if (!map || typeof map.getBounds !== 'function') return null;
        var b = map.getBounds();
        if (!b || !b[0] || !b[1]) return null;
        var minLat = Math.min(b[0][0], b[1][0]);
        var maxLat = Math.max(b[0][0], b[1][0]);
        var minLon = Math.min(b[0][1], b[1][1]);
        var maxLon = Math.max(b[0][1], b[1][1]);
        var spanLat = maxLat - minLat;
        var spanLon = maxLon - minLon;
        if (spanLat < 1e-5 && spanLon < 1e-5) return null;
        var dLat = spanLat * VIEWPORT_BUFFER_RATIO;
        var dLon = spanLon * VIEWPORT_BUFFER_RATIO;
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

    function ringAabbOverlapsBounds(ring, bounds) {
        if (!Array.isArray(ring) || !bounds) return false;
        var minLat = Infinity;
        var maxLat = -Infinity;
        var minLon = Infinity;
        var maxLon = -Infinity;
        for (var i = 0; i < ring.length; i++) {
            var p = ring[i];
            if (!p || p.length < 2) continue;
            if (p[0] < minLat) minLat = p[0];
            if (p[0] > maxLat) maxLat = p[0];
            if (p[1] < minLon) minLon = p[1];
            if (p[1] > maxLon) maxLon = p[1];
        }
        if (minLat === Infinity) return false;
        return !(maxLat < bounds.minLat || minLat > bounds.maxLat ||
            maxLon < bounds.minLon || minLon > bounds.maxLon);
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
                    // Polygons: AABB overlap, not only vertices — otherwise zooming
                    // into a large region (all vertices off-screen) unmounts it.
                    for (var ri = 0; ri < c.length; ri++) {
                        if (ringAabbOverlapsBounds(c[ri], bounds)) return true;
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
        // Never viewport-cull regions (same as applyViewportCullToMap). Their area
        // can still cover the view when every vertex is off-screen after a deep zoom-in.
        if (type === 'region') return true;
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
        if (typeof global.mapObjectsVisibleAtZoom === 'function') {
            return global.mapObjectsVisibleAtZoom(zoom);
        }
        return typeof zoom !== 'number' || zoom >= ZOOM_SHOW_CONNECTION_LINES;
    }

    function isBulkImportActive() {
        return typeof global.isMapBulkImportActive === 'function' && global.isMapBulkImportActive();
    }

    function isCabinetMember(obj) {
        return typeof global.getObjectCabinetId === 'function' && !!global.getObjectCabinetId(obj);
    }

    function buildDefaultMountContext() {
        var zoom = (global.myMap && typeof global.myMap.getZoom === 'function') ? global.myMap.getZoom() : 16;
        return {
            bounds: getExpandedBounds(global.myMap),
            zoom: zoom,
            hideLabels: typeof zoom === 'number' && zoom < 16,
            hideObjects: typeof zoom === 'number' && zoom < 16,
            hideRegions: typeof zoom === 'number' && zoom < 10,
            showConnectionLines: connectionLinesVisibleAtZoom(zoom)
        };
    }

    function isExternallyManagedMapObject(obj) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        return type === 'cross' || type === 'node';
    }

    function shouldMountObject(obj, ctx) {
        if (!obj || !obj.properties) return false;
        if (isExternallyManagedMapObject(obj)) return false;
        ctx = ctx || mountContext || buildDefaultMountContext();
        var type = obj.properties.get('type');
        if (isCabinetMember(obj)) return false;
        if (obj.properties.get('_mapFilterVisible') === false) return false;
        if (ctx.hideObjects && type !== 'region') return false;
        if (ctx.hideRegions && type === 'region') return false;
        if (ctx.bounds && !isObjectInViewport(obj, ctx.bounds)) return false;
        return true;
    }

    function shouldShowLabelForObject(obj, ctx) {
        ctx = ctx || mountContext || buildDefaultMountContext();
        if (ctx.hideLabels) return false;
        var type = obj.properties && obj.properties.get('type');
        if (type === 'cableLabel') return obj.properties.get('_mapFilterVisible') !== false;
        return obj.properties.get('_mapFilterVisible') !== false;
    }

    function isMounted(obj) {
        var uid = uidFromObj(obj);
        return uid ? mountedUids.has(uid) : false;
    }

    function mountObject(obj, ctx) {
        if (!global.myMap || !obj) return;
        var uid = uidFromObj(obj);
        if (!uid || mountedUids.has(uid)) return;
        if (!shouldMountObject(obj, ctx)) return;
        try {
            // Lazy label / hover: created only for viewport objects (cuts INP during 10k+ import).
            if (obj._labelDeferred) {
                obj._labelDeferred = false;
                try {
                    if (typeof global.updateObjectLabel === 'function') {
                        global.updateObjectLabel(obj, obj.properties.get('name'));
                    } else if (typeof updateObjectLabel === 'function') {
                        updateObjectLabel(obj, obj.properties.get('name'));
                    }
                } catch (eLbl) {}
            }
            if (obj._hoverEventsDeferred && typeof global.attachHoverEventsToObject === 'function') {
                try { global.attachHoverEventsToObject(obj); } catch (eHover) {}
            }
            if (global.myMap.geoObjects.indexOf(obj) === -1) global.myMap.geoObjects.add(obj);
            mountedUids.add(uid);
            var type = obj.properties && obj.properties.get('type');
            var label = obj.properties && obj.properties.get('label');
            if (label && shouldShowLabelForObject(obj, ctx)) {
                if (global.myMap.geoObjects.indexOf(label) === -1) global.myMap.geoObjects.add(label);
            }
            if (type === 'cable' && global.CableUnderground) {
                try { global.CableUnderground.setOverlaysVisible(obj, true); } catch (eUg) {}
            }
            if (obj.options) obj.options.set('visible', true);
            if (label && label.options) label.options.set('visible', shouldShowLabelForObject(obj, ctx));
        } catch (e) {}
    }

    function unmountObject(obj) {
        if (!global.myMap || !obj) return;
        if (isExternallyManagedMapObject(obj)) return;
        var uid = uidFromObj(obj);
        if (!uid || !mountedUids.has(uid)) return;
        if (pinnedUids.has(uid)) return;
        try {
            if (typeof global.detachHoverEventsFromObject === 'function') {
                try { global.detachHoverEventsFromObject(obj); } catch (eDet) {}
            }
            global.myMap.geoObjects.remove(obj);
            var label = obj.properties && obj.properties.get('label');
            if (label) global.myMap.geoObjects.remove(label);
            var type = obj.properties && obj.properties.get('type');
            if (type === 'cable' && global.CableUnderground) {
                try { global.CableUnderground.setOverlaysVisible(obj, false); } catch (eUg) {}
            }
            mountedUids.delete(uid);
        } catch (e) {}
    }

    function mapAdd(obj) {
        if (!obj) return;
        registerSpatial(obj);
        if (!shouldUseVirtualization()) {
            if (global.myMap) {
                try {
                    if (global.myMap.geoObjects.indexOf(obj) === -1) global.myMap.geoObjects.add(obj);
                    var uid = uidFromObj(obj);
                    if (uid) mountedUids.add(uid);
                } catch (e) {}
            }
            return;
        }
        if (isBulkImportActive()) return;
        var ctx = mountContext || buildDefaultMountContext();
        if (shouldMountObject(obj, ctx)) mountObject(obj, ctx);
    }

    function mapRemove(obj, force) {
        if (!obj) return;
        var uid = uidFromObj(obj);
        if (global.myMap) {
            try { global.myMap.geoObjects.remove(obj); } catch (e) {}
            var label = obj.properties && obj.properties.get('label');
            if (label) {
                try { global.myMap.geoObjects.remove(label); } catch (e2) {}
            }
        }
        if (uid) {
            mountedUids.delete(uid);
            pinnedUids.delete(uid);
        }
        if (force) unregisterSpatial(obj);
    }

    function pinObject(obj) {
        var uid = uidFromObj(obj);
        if (uid) pinnedUids.add(uid);
        mountObject(obj);
    }

    function unpinObject(obj) {
        var uid = uidFromObj(obj);
        if (uid) pinnedUids.delete(uid);
    }

    function unmountNonRegionObjects(ctx) {
        if (!global.myMap) return;
        ctx = ctx || mountContext || buildDefaultMountContext();
        var toUnmount = [];
        mountedUids.forEach(function(uid) {
            if (pinnedUids.has(uid)) return;
            var obj = objectsById.get(uid);
            if (!obj || isExternallyManagedMapObject(obj)) return;
            var type = obj.properties && obj.properties.get('type');
            if (type === 'region' && !ctx.hideRegions) return;
            toUnmount.push(obj);
        });
        for (var i = 0; i < toUnmount.length; i++) unmountObject(toUnmount[i]);
    }

    var aggregatePlacemarks = [];
    var AGGREGATE_MIN_OBJECTS = 800;
    var AGGREGATE_MIN_COUNT = 3;

    function clearAggregateOverlays() {
        if (!global.myMap) {
            aggregatePlacemarks = [];
            return;
        }
        for (var i = 0; i < aggregatePlacemarks.length; i++) {
            try { global.myMap.geoObjects.remove(aggregatePlacemarks[i]); } catch (e) {}
        }
        aggregatePlacemarks = [];
    }

    function syncAggregateOverlays(ctx) {
        clearAggregateOverlays();
        if (!global.myMap || typeof ymaps === 'undefined') return;
        if (!ctx || !ctx.hideObjects) return;
        if (!Array.isArray(global.objects) || global.objects.length < AGGREGATE_MIN_OBJECTS) return;
        var zoom = ctx.zoom;
        var cellDeg = (typeof zoom === 'number' && zoom >= 14) ? 0.008
            : (typeof zoom === 'number' && zoom >= 12) ? 0.02
            : 0.06;
        var cells = Object.create(null);
        for (var i = 0; i < global.objects.length; i++) {
            var obj = global.objects[i];
            if (!obj || !obj.properties) continue;
            var t = obj.properties.get('type');
            if (!t || t === 'cable' || t === 'cableLabel' || t === 'region' || t === 'crossGroup' || t === 'nodeGroup') continue;
            var c = getObjectAnchorCoord(obj);
            if (!c) continue;
            if (ctx.bounds && !coordInBounds(c, ctx.bounds)) continue;
            var key = Math.floor(c[0] / cellDeg) + ':' + Math.floor(c[1] / cellDeg);
            if (!cells[key]) cells[key] = { lat: 0, lon: 0, count: 0 };
            cells[key].lat += c[0];
            cells[key].lon += c[1];
            cells[key].count++;
        }
        Object.keys(cells).forEach(function(key) {
            var cell = cells[key];
            if (cell.count < AGGREGATE_MIN_COUNT) return;
            var lat = cell.lat / cell.count;
            var lon = cell.lon / cell.count;
            var size = cell.count >= 100 ? 44 : (cell.count >= 30 ? 36 : 28);
            var pm = new ymaps.Placemark([lat, lon], {
                type: 'clusterAggregate',
                iconContent: String(cell.count),
                hintContent: cell.count + ' объектов'
            }, {
                preset: 'islands#blueCircleIcon',
                iconColor: '#2563eb',
                hasBalloon: false,
                openBalloonOnClick: false
            });
            try {
                pm.options.set('iconImageSize', [size, size]);
            } catch (eSz) {}
            try {
                global.myMap.geoObjects.add(pm);
                aggregatePlacemarks.push(pm);
            } catch (eAdd) {}
        });
    }

    function syncViewportMounts(ctx) {
        if (!shouldUseVirtualization() || !global.myMap || !Array.isArray(global.objects)) return;
        mountContext = ctx || buildDefaultMountContext();
        ctx = mountContext;

        if (ctx.hideObjects) {
            unmountNonRegionObjects(ctx);
            syncAggregateOverlays(ctx);
            return;
        }
        clearAggregateOverlays();

        var bounds = ctx.bounds;
        if (!bounds) return;

        if (mountedUids.size === 0 && global.objects.length >= VIRTUALIZATION_MIN_OBJECTS) {
            adoptExistingGeoObjects(global.objects);
        }

        var candidates = querySpatialInBounds(bounds) || [];
        var candidateSet = new Set();
        for (var ci = 0; ci < candidates.length; ci++) {
            var cObj = candidates[ci];
            if (shouldMountObject(cObj, ctx)) {
                var cUid = uidFromObj(cObj);
                if (cUid) candidateSet.add(cUid);
                if (!isMounted(cObj)) mountObject(cObj, ctx);
            }
        }

        for (var i = global.objects.length - 1; i >= 0; i--) {
            var cableObj = global.objects[i];
            if (!cableObj || !cableObj.properties) continue;
            var cableType = cableObj.properties.get('type');
            if (cableType !== 'cable' && cableType !== 'cableLabel' && cableType !== 'region') continue;
            if (!shouldMountObject(cableObj, ctx)) continue;
            var cableUid = uidFromObj(cableObj);
            if (cableUid) candidateSet.add(cableUid);
            if (!isMounted(cableObj)) mountObject(cableObj, ctx);
        }

        var toUnmount = [];
        mountedUids.forEach(function(uid) {
            if (pinnedUids.has(uid)) return;
            if (!candidateSet.has(uid)) {
                var obj = objectsById.get(uid);
                if (obj && !isExternallyManagedMapObject(obj)) toUnmount.push(obj);
            }
        });
        for (var ui = 0; ui < toUnmount.length; ui++) unmountObject(toUnmount[ui]);

        mountedUids.forEach(function(uid) {
            if (pinnedUids.has(uid)) return;
            var obj = objectsById.get(uid);
            if (!obj || isExternallyManagedMapObject(obj)) return;
            var label = obj.properties && obj.properties.get('label');
            if (!label) return;
            var showLabel = shouldShowLabelForObject(obj, ctx);
            try {
                if (label.options) label.options.set('visible', showLabel);
                if (showLabel && global.myMap.geoObjects.indexOf(label) === -1) {
                    global.myMap.geoObjects.add(label);
                } else if (!showLabel && global.myMap.geoObjects.indexOf(label) !== -1) {
                    global.myMap.geoObjects.remove(label);
                }
            } catch (eLbl) {}
        });
    }

    function scheduleSyncViewportMounts(ctx) {
        if (!shouldUseVirtualization()) return;
        mountContext = ctx || mountContext || buildDefaultMountContext();
        if (syncMountRaf) {
            syncMountPending = true;
            return;
        }
        syncMountRaf = (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function(f) { setTimeout(f, 16); })(function() {
            syncMountRaf = null;
            syncViewportMounts(mountContext);
            if (syncMountPending) {
                syncMountPending = false;
                scheduleSyncViewportMounts(mountContext);
            }
        });
    }

    function adoptExistingGeoObjects(list) {
        if (!Array.isArray(list) || !global.myMap) return;
        mountedUids.clear();
        for (var i = 0; i < list.length; i++) {
            var obj = list[i];
            if (!obj || isExternallyManagedMapObject(obj)) continue;
            try {
                if (global.myMap.geoObjects.indexOf(obj) !== -1) {
                    var uid = uidFromObj(obj);
                    if (uid) mountedUids.add(uid);
                }
            } catch (e) {}
        }
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
        clearAggregateOverlays: clearAggregateOverlays,
        getByUid: getByUid,
        getByType: getByType,
        forEachOfType: forEachOfType,
        shouldUseViewportCull: shouldUseViewportCull,
        shouldUseVirtualization: shouldUseVirtualization,
        getExpandedBounds: getExpandedBounds,
        coordInBounds: coordInBounds,
        isObjectInViewport: isObjectInViewport,
        connectionLinesVisibleAtZoom: connectionLinesVisibleAtZoom,
        scheduleConnectionLinesUpdate: scheduleConnectionLinesUpdate,
        querySpatialNearCoords: querySpatialNearCoords,
        querySpatialInBounds: querySpatialInBounds,
        updateSpatialPosition: updateSpatialPosition,
        mapAdd: mapAdd,
        mapRemove: mapRemove,
        mountObject: mountObject,
        unmountObject: unmountObject,
        isMounted: isMounted,
        pinObject: pinObject,
        unpinObject: unpinObject,
        unmountNonRegionObjects: unmountNonRegionObjects,
        syncViewportMounts: syncViewportMounts,
        scheduleSyncViewportMounts: scheduleSyncViewportMounts,
        adoptExistingGeoObjects: adoptExistingGeoObjects,
        buildDefaultMountContext: buildDefaultMountContext,
        shouldMountObject: shouldMountObject,
        ZOOM_SHOW_CONNECTION_LINES: ZOOM_SHOW_CONNECTION_LINES,
        VIEWPORT_CULL_MIN_OBJECTS: VIEWPORT_CULL_MIN_OBJECTS,
        VIRTUALIZATION_MIN_OBJECTS: VIRTUALIZATION_MIN_OBJECTS
    };
})(typeof window !== 'undefined' ? window : this);
