/**
 * Индекс объектов, отсечение по viewport, виртуализация geoObjects, spatial index.
 */
(function(global) {
    var objectsById = new Map();
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
    var objectsByType = {
        cable: [],
        cableLabel: [],
        region: []
    };

    function uidFromObj(obj) {
        if (!obj || !obj.properties) return null;
        var id = obj.properties.get('uniqueId');
        return id != null && id !== '' ? String(id) : null;
    }

    function addToTypeIndex(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        var bucket = objectsByType[type];
        if (!bucket) return;
        if (bucket.indexOf(obj) === -1) bucket.push(obj);
    }

    function removeFromTypeIndex(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        var bucket = objectsByType[type];
        if (!bucket) return;
        var idx = bucket.indexOf(obj);
        if (idx !== -1) bucket.splice(idx, 1);
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
        spatialGrid.clear();
        mountedUids.clear();
        pinnedUids.clear();
        objectsByType.cable = [];
        objectsByType.cableLabel = [];
        objectsByType.region = [];
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
        var min = VIEWPORT_CULL_MIN_OBJECTS;
        if (typeof global.getPerfVirtualizationThresholds === 'function') {
            try {
                var thr = global.getPerfVirtualizationThresholds();
                if (thr && typeof thr.cullMin === 'number') min = thr.cullMin;
            } catch (e) {}
        }
        return typeof objects !== 'undefined' && Array.isArray(objects) &&
            objects.length >= min;
    }

    function shouldUseVirtualization() {
        var min = VIRTUALIZATION_MIN_OBJECTS;
        if (typeof global.getPerfVirtualizationThresholds === 'function') {
            try {
                var thr = global.getPerfVirtualizationThresholds();
                if (thr && typeof thr.virtMin === 'number') min = thr.virtMin;
            } catch (e) {}
        }
        return typeof objects !== 'undefined' && Array.isArray(objects) &&
            objects.length >= min;
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

    function getObjectsZoomThreshold() {
        if (typeof global.getLodThresholds === 'function') {
            return global.getLodThresholds().objects;
        }
        return ZOOM_SHOW_CONNECTION_LINES;
    }

    function connectionLinesVisibleAtZoom(zoom) {
        if (typeof global.areConnectionLinesEnabled === 'function' && !global.areConnectionLinesEnabled()) {
            return false;
        }
        if (typeof global.mapObjectsVisibleAtZoom === 'function') {
            return global.mapObjectsVisibleAtZoom(zoom);
        }
        return typeof zoom !== 'number' || zoom >= getObjectsZoomThreshold();
    }

    function isBulkImportActive() {
        return typeof global.isMapBulkImportActive === 'function' && global.isMapBulkImportActive();
    }

    function isCabinetMember(obj) {
        return typeof global.getObjectCabinetId === 'function' && !!global.getObjectCabinetId(obj);
    }

    function buildDefaultMountContext() {
        var zoom = (global.myMap && typeof global.myMap.getZoom === 'function') ? global.myMap.getZoom() : 16;
        if (typeof global.buildMapMountContext === 'function') {
            try { return global.buildMapMountContext(); } catch (eCtx) {}
        }
        if (typeof global.getExpertZoomFlags === 'function') {
            var flags = global.getExpertZoomFlags();
            var thr = typeof global.getLodThresholds === 'function' ? global.getLodThresholds() : { objects: 16, labels: 16, regions: 10 };
            return {
                bounds: getExpandedBounds(global.myMap),
                zoom: flags.zoom,
                hideLabels: !!flags.hideLabels,
                hideObjects: !!flags.hideObjects,
                hideRegions: typeof flags.zoom === 'number' && flags.zoom < thr.regions,
                showConnectionLines: connectionLinesVisibleAtZoom(flags.zoom)
            };
        }
        var objectsBelow = getObjectsZoomThreshold();
        return {
            bounds: getExpandedBounds(global.myMap),
            zoom: zoom,
            hideLabels: typeof zoom === 'number' && zoom < objectsBelow,
            hideObjects: typeof zoom === 'number' && zoom < objectsBelow,
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
        // Always use current zoom/bounds — stale mountContext caused newly created
        // objects to stay mounted at low zoom (expert hide ignored).
        var ctx = buildDefaultMountContext();
        mountContext = ctx;
        if (!shouldUseVirtualization()) {
            if (global.myMap) {
                try {
                    if (global.myMap.geoObjects.indexOf(obj) === -1) global.myMap.geoObjects.add(obj);
                    var uid = uidFromObj(obj);
                    if (uid) mountedUids.add(uid);
                    var type = obj.properties && obj.properties.get('type');
                    if (ctx.hideObjects && type !== 'region' && obj.options) {
                        obj.options.set('visible', false);
                    }
                    var label = obj.properties && obj.properties.get('label');
                    if (label && label.options && (ctx.hideObjects || ctx.hideLabels)) {
                        label.options.set('visible', false);
                    }
                } catch (e) {}
            }
            return;
        }
        if (isBulkImportActive()) return;
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

    function syncViewportMounts(ctx) {
        if (!shouldUseVirtualization() || !global.myMap || !Array.isArray(global.objects)) return;
        mountContext = ctx || buildDefaultMountContext();
        ctx = mountContext;

        if (ctx.hideObjects) {
            unmountNonRegionObjects(ctx);
            return;
        }

        var bounds = ctx.bounds;
        if (!bounds) return;

        if (mountedUids.size === 0 && shouldUseVirtualization()) {
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

        // Avoid full objects[] scan: use typed indexes for cable/cableLabel/region.
        var typedLists = [objectsByType.cable, objectsByType.cableLabel, objectsByType.region];
        for (var tl = 0; tl < typedLists.length; tl++) {
            var list = typedLists[tl];
            for (var i = 0; i < list.length; i++) {
                var cableObj = list[i];
                if (!shouldMountObject(cableObj, ctx)) continue;
                var cableUid = uidFromObj(cableObj);
                if (cableUid) candidateSet.add(cableUid);
                if (!isMounted(cableObj)) mountObject(cableObj, ctx);
            }
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
        getByUid: getByUid,
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
        getObjectsByType: function(type) {
            return objectsByType[type] || null;
        },
        ZOOM_SHOW_CONNECTION_LINES: ZOOM_SHOW_CONNECTION_LINES,
        VIEWPORT_CULL_MIN_OBJECTS: VIEWPORT_CULL_MIN_OBJECTS,
        VIRTUALIZATION_MIN_OBJECTS: VIRTUALIZATION_MIN_OBJECTS
    };
})(typeof window !== 'undefined' ? window : this);
