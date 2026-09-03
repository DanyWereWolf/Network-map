/**
 * Фильтр объектов на карте, expert zoom.
 */
var MAP_FILTER_INPUT_IDS = [
    'mapFilterNode', 'mapFilterNodeAggregationOnly', 'mapFilterCross', 'mapFilterSleeve',
    'mapFilterSupport', 'mapFilterAttachment', 'mapFilterManhole', 'mapFilterSignalPost', 'mapFilterCabinet', 'mapFilterOlt', 'mapFilterSplitter',
    'mapFilterOnu', 'mapFilterCamera', 'mapFilterMediaConverter', 'mapFilterRadioBridge'
];
var MAP_FILTER_MAIN_KEYS = ['node', 'cross', 'sleeve', 'support', 'attachment', 'manhole', 'signalPost', 'cabinet', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'radioBridge'];
var MAP_FILTER_STORAGE_KEY = 'networkMap_mapFilter';

function syncMapFilterChipVisual(el) {
    if (!el) return;
    var chip = el.closest('.map-filter-chip');
    if (!chip) return;
    chip.classList.toggle('map-filter-chip--off', !el.checked);
    chip.classList.toggle('map-filter-chip--disabled', !!el.disabled);
}

function syncMapFilterAggregationOnlyState() {
    var nodeEl = document.getElementById('mapFilterNode');
    var aggEl = document.getElementById('mapFilterNodeAggregationOnly');
    if (!aggEl) return;
    var nodeOn = nodeEl ? nodeEl.checked : true;
    aggEl.disabled = !nodeOn;
    if (!nodeOn) aggEl.checked = false;
    syncMapFilterChipVisual(aggEl);
}

function updateMapFilterBadge() {
    var badge = document.getElementById('mapFilterBadge');
    if (!badge) return;
    var state = typeof getMapFilterState === 'function' ? getMapFilterState() : {};
    var enabled = 0;
    MAP_FILTER_MAIN_KEYS.forEach(function(key) {
        if (state[key]) enabled++;
    });
    var total = MAP_FILTER_MAIN_KEYS.length;
    badge.textContent = enabled + '/' + total;
    badge.classList.remove('map-filter-badge--partial', 'map-filter-badge--none');
    if (enabled === 0) badge.classList.add('map-filter-badge--none');
    else if (enabled < total) badge.classList.add('map-filter-badge--partial');
}

function saveMapFilterToStorage() {
    try {
        localStorage.setItem(MAP_FILTER_STORAGE_KEY, JSON.stringify(getMapFilterState()));
    } catch (e) {}
}

var MAP_FILTER_KEY_TO_ID = {
    node: 'mapFilterNode',
    nodeAggregationOnly: 'mapFilterNodeAggregationOnly',
    cross: 'mapFilterCross',
    sleeve: 'mapFilterSleeve',
    support: 'mapFilterSupport',
    attachment: 'mapFilterAttachment',
    manhole: 'mapFilterManhole',
    signalPost: 'mapFilterSignalPost',
    cabinet: 'mapFilterCabinet',
    olt: 'mapFilterOlt',
    splitter: 'mapFilterSplitter',
    onu: 'mapFilterOnu',
    camera: 'mapFilterCamera',
    mediaConverter: 'mapFilterMediaConverter',
    radioBridge: 'mapFilterRadioBridge'
};

function loadMapFilterFromStorage() {
    try {
        var raw = localStorage.getItem(MAP_FILTER_STORAGE_KEY);
        if (!raw) return false;
        var saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return false;
        Object.keys(MAP_FILTER_KEY_TO_ID).forEach(function(key) {
            var el = document.getElementById(MAP_FILTER_KEY_TO_ID[key]);
            if (el && typeof saved[key] === 'boolean') el.checked = saved[key];
        });
        return true;
    } catch (e) {
        return false;
    }
}

function setMapFilterAll(enabled) {
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'mapFilterNodeAggregationOnly') {
            if (!enabled) el.checked = false;
            return;
        }
        el.checked = !!enabled;
        syncMapFilterChipVisual(el);
    });
    syncMapFilterAggregationOnlyState();
    updateMapFilterBadge();
    saveMapFilterToStorage();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
}

function onMapFilterChange(changedEl) {
    if (changedEl && changedEl.id === 'mapFilterNode') syncMapFilterAggregationOnlyState();
    syncMapFilterChipVisual(changedEl);
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        syncMapFilterChipVisual(document.getElementById(id));
    });
    updateMapFilterBadge();
    saveMapFilterToStorage();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
}

function setupMapFilterControls() {
    loadMapFilterFromStorage();
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        syncMapFilterChipVisual(el);
        el.addEventListener('change', function() {
            onMapFilterChange(el);
        });
    });
    syncMapFilterAggregationOnlyState();
    updateMapFilterBadge();

    var showAllBtn = document.getElementById('mapFilterShowAll');
    var hideAllBtn = document.getElementById('mapFilterHideAll');
    if (showAllBtn) showAllBtn.addEventListener('click', function() { setMapFilterAll(true); });
    if (hideAllBtn) hideAllBtn.addEventListener('click', function() { setMapFilterAll(false); });

    if (typeof applyMapFilter === 'function') applyMapFilter();
}

function getMapFilterState() {
    var nodeEl = document.getElementById('mapFilterNode');
    var nodeAggEl = document.getElementById('mapFilterNodeAggregationOnly');
    var crossEl = document.getElementById('mapFilterCross');
    var sleeveEl = document.getElementById('mapFilterSleeve');
    var supportEl = document.getElementById('mapFilterSupport');
    var attachmentEl = document.getElementById('mapFilterAttachment');
    var manholeEl = document.getElementById('mapFilterManhole');
    var signalPostEl = document.getElementById('mapFilterSignalPost');
    var cabinetEl = document.getElementById('mapFilterCabinet');
    var oltEl = document.getElementById('mapFilterOlt');
    var splitterEl = document.getElementById('mapFilterSplitter');
    var onuEl = document.getElementById('mapFilterOnu');
    var cameraEl = document.getElementById('mapFilterCamera');
    var mediaConverterEl = document.getElementById('mapFilterMediaConverter');
    var radioBridgeEl = document.getElementById('mapFilterRadioBridge');
    return {
        node: nodeEl ? nodeEl.checked : true,
        nodeAggregationOnly: nodeAggEl ? nodeAggEl.checked : false,
        cross: crossEl ? crossEl.checked : true,
        sleeve: sleeveEl ? sleeveEl.checked : true,
        support: supportEl ? supportEl.checked : true,
        attachment: attachmentEl ? attachmentEl.checked : true,
        manhole: manholeEl ? manholeEl.checked : true,
        signalPost: signalPostEl ? signalPostEl.checked : true,
        cabinet: cabinetEl ? cabinetEl.checked : true,
        olt: oltEl ? oltEl.checked : true,
        splitter: splitterEl ? splitterEl.checked : true,
        onu: onuEl ? onuEl.checked : true,
        camera: cameraEl ? cameraEl.checked : true,
        mediaConverter: mediaConverterEl ? mediaConverterEl.checked : true,
        radioBridge: radioBridgeEl ? radioBridgeEl.checked : true
    };
}

// «Vols expert» style: при сильном отдалении скрываются подписи и объекты.
// Пороги настраиваются во вкладке «Настройки» → «Масштаб».
var LOD_DEFAULT_LABELS = 16;
var LOD_DEFAULT_OBJECTS = 16;
var LOD_DEFAULT_REGIONS = 10;
var LOD_STORAGE_PREFIX = 'networkMap_lodThresholds';
var _lodServerSyncTimer = null;

var _lodThresholds = {
    labels: LOD_DEFAULT_LABELS,
    objects: LOD_DEFAULT_OBJECTS,
    regions: LOD_DEFAULT_REGIONS
};

function getLodUserId() {
    try {
        var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
        if (!raw) return null;
        var u = JSON.parse(raw);
        if (u && u.userId != null && String(u.userId).trim() !== '') return String(u.userId).trim();
        if (u && u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
    } catch (e) {}
    return null;
}

function getLodStorageKey() {
    var uid = getLodUserId();
    return uid ? LOD_STORAGE_PREFIX + '_' + uid : LOD_STORAGE_PREFIX;
}

function clampLodValue(value, min, max, fallback) {
    var n = parseInt(value, 10);
    if (isNaN(n)) n = fallback;
    return Math.max(min, Math.min(max, n));
}

function normalizeLodThresholds(raw) {
    var objects = clampLodValue(raw && raw.objects, 8, 20, LOD_DEFAULT_OBJECTS);
    var labels = clampLodValue(raw && raw.labels, 8, 20, LOD_DEFAULT_LABELS);
    var regions = clampLodValue(raw && raw.regions, 5, 16, LOD_DEFAULT_REGIONS);
    // Подписи не раньше объектов: иначе подпись висела бы без объекта.
    if (labels < objects) labels = objects;
    return { labels: labels, objects: objects, regions: regions };
}

function readLodThresholdsFromStorage() {
    var key = getLodStorageKey();
    try {
        var raw = localStorage.getItem(key);
        if (!raw && key !== LOD_STORAGE_PREFIX) raw = localStorage.getItem(LOD_STORAGE_PREFIX);
        if (!raw) return null;
        return normalizeLodThresholds(JSON.parse(raw));
    } catch (e) {}
    return null;
}

function syncLodThresholdsToServer(thresholds) {
    if (typeof getApiBase !== 'function' || typeof getAuthToken !== 'function') return;
    var base = getApiBase();
    var token = getAuthToken();
    if (!base || !token) return;
    try {
        fetch(base + '/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ lodThresholds: thresholds })
        }).catch(function () {});
    } catch (e) {}
}

function persistLodThresholds(thresholds, options) {
    options = options || {};
    try {
        localStorage.setItem(getLodStorageKey(), JSON.stringify(thresholds));
    } catch (e) {}
    if (options.syncServer) {
        if (_lodServerSyncTimer) clearTimeout(_lodServerSyncTimer);
        _lodServerSyncTimer = setTimeout(function () {
            _lodServerSyncTimer = null;
            syncLodThresholdsToServer(thresholds);
        }, 300);
    }
}

function getLodThresholds() {
    return {
        labels: _lodThresholds.labels,
        objects: _lodThresholds.objects,
        regions: _lodThresholds.regions
    };
}

function setLodThresholds(partial, options) {
    options = options || {};
    var next = normalizeLodThresholds({
        labels: partial && partial.labels != null ? partial.labels : _lodThresholds.labels,
        objects: partial && partial.objects != null ? partial.objects : _lodThresholds.objects,
        regions: partial && partial.regions != null ? partial.regions : _lodThresholds.regions
    });
    _lodThresholds = next;
    if (options.persist !== false) persistLodThresholds(next, { syncServer: !!options.syncServer });
    // Обратная совместимость для кода, читающего константы как переменные.
    EXPERT_ZOOM_HIDE_LABELS_BELOW = next.labels;
    EXPERT_ZOOM_HIDE_OBJECTS_BELOW = next.objects;
    EXPERT_ZOOM_HIDE_REGIONS_BELOW = next.regions;
    return getLodThresholds();
}

function resetLodThresholds(options) {
    return setLodThresholds({
        labels: LOD_DEFAULT_LABELS,
        objects: LOD_DEFAULT_OBJECTS,
        regions: LOD_DEFAULT_REGIONS
    }, options);
}

function applyLodThresholdsFromServer(raw, options) {
    options = options || {};
    if (!raw || typeof raw !== 'object') return getLodThresholds();
    return setLodThresholds(raw, {
        persist: options.persist !== false,
        syncServer: false
    });
}

(function initLodThresholdsFromStorage() {
    var saved = readLodThresholdsFromStorage();
    if (saved) setLodThresholds(saved, { persist: false });
    else setLodThresholds(_lodThresholds, { persist: false });
})();

/** @deprecated use getLodThresholds().labels — оставляем как var для совместимости */
var EXPERT_ZOOM_HIDE_LABELS_BELOW = _lodThresholds.labels;
var EXPERT_ZOOM_HIDE_OBJECTS_BELOW = _lodThresholds.objects;
var EXPERT_ZOOM_HIDE_REGIONS_BELOW = _lodThresholds.regions;

function applyRegionZoomVisibility(zoom) {
    if (!Array.isArray(objects)) return;
    var hideRegions = typeof zoom === 'number' && zoom < getLodThresholds().regions;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties || obj.properties.get('type') !== 'region') return;
        var visible = true;
        if (regionEditTarget && obj === regionEditTarget) visible = false;
        else if (obj.properties.get('_detachedForGeometryEdit')) visible = false;
        else if (hideRegions) visible = false;
        else if (window.MapRegions) visible = MapRegions.isRegionVisible(obj);
        try { if (obj.options) obj.options.set('visible', visible); } catch (e) {}
        var regionLabel = obj.properties.get('regionLabel');
        if (regionLabel && regionLabel.options) {
            try { regionLabel.options.set('visible', visible); } catch (eLbl) {}
        }
    });
}

function forEachConnectionLine(callback) {
    [nodeConnectionLines, onuConnectionLines, oltConnectionLines, splitterConnectionLines, splitterOutputConnectionLines, radioBridgeConnectionLines].forEach(function(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(line) {
            if (line && line.options) callback(line);
        });
    });
}

function setAllConnectionLinesVisible(visible) {
    forEachConnectionLine(function(line) {
        try { line.options.set('visible', !!visible); } catch (e) {}
    });
}
window.setAllConnectionLinesVisible = setAllConnectionLinesVisible;

function applyConnectionLinesMapStyle() {
    forEachConnectionLine(function(line) {
        try {
            var color = line.options.get('strokeColor') || '#22c55e';
            var opts = getConnectionLinePolylineOptions(color);
            line.options.set('strokeWidth', opts.strokeWidth);
            line.options.set('strokeOpacity', opts.strokeOpacity);
            line.options.set('zIndex', opts.zIndex);
        } catch (e) {}
    });
}

function applyExpertZoomVisibility() {
    if (window._mapPdfExportCaptureActive) return;
    if (!myMap || typeof myMap.getZoom !== 'function') return;
    if (!Array.isArray(objects)) return;

    const zoom = myMap.getZoom();
    if (typeof zoom !== 'number') return;

    var thr = getLodThresholds();
    const hideLabels = zoom < thr.labels;
    var hideObjects = zoom < thr.objects;
    if (!hideLabels && !hideObjects) return;

    var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization && MapPerf.shouldUseVirtualization();

    if (hideLabels && !useVirtual) {
        objects.forEach(function(obj) {
            if (!obj || !obj.properties || !obj.options) return;
            const type = obj.properties.get('type');

            if (type === 'cableLabel') {
                try { obj.options.set('visible', false); } catch (e) {}
            }

            const label = obj.properties.get('label');
            if (label && label.options) {
                try { label.options.set('visible', false); } catch (e) {}
            }
        });
    }

    if (hideObjects) {
        if (useVirtual) {
            setAllConnectionLinesVisible(false);
            objects.forEach(function(obj) {
                if (!obj || !obj.properties || !obj.options) return;
                var type = obj.properties.get('type');
                if (type !== 'cross' && type !== 'node') return;
                try {
                    if (myMap.geoObjects.indexOf(obj) !== -1) obj.options.set('visible', false);
                } catch (eCn) {}
            });
        } else {
            objects.forEach(function(obj) {
                if (!obj || !obj.options) return;
                if (obj.properties && obj.properties.get('type') === 'region') return;
                try { obj.options.set('visible', false); } catch (e) {}
                if (obj.properties && obj.properties.get('type') === 'cable' && window.CableUnderground) {
                    try { CableUnderground.setOverlaysVisible(obj, false); } catch (eUg) {}
                }
            });
            setAllConnectionLinesVisible(false);
        }
    }

    const crossPlacemarks = (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks))
        ? crossGroupPlacemarks
        : [];
    const nodePlacemarks = (typeof nodeGroupPlacemarks !== 'undefined' && Array.isArray(nodeGroupPlacemarks))
        ? nodeGroupPlacemarks
        : [];

    if (hideLabels) {
        crossPlacemarks.forEach(function(pm) {
            try {
                const lbl = pm && pm.properties && pm.properties.get('crossGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            } catch (e) {}
        });
        nodePlacemarks.forEach(function(pm) {
            try {
                const lbl = pm && pm.properties && pm.properties.get('nodeGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            } catch (e) {}
        });
    }

    if (hideObjects) {
        crossPlacemarks.forEach(function(pm) {
            try { if (pm && pm.options) pm.options.set('visible', false); } catch (e) {}
        });
        nodePlacemarks.forEach(function(pm) {
            try { if (pm && pm.options) pm.options.set('visible', false); } catch (e) {}
        });
    }

    applyRegionZoomVisibility(zoom);
}

function getExpertZoomFlags() {
    var zoom = (myMap && typeof myMap.getZoom === 'function') ? myMap.getZoom() : 16;
    var thr = getLodThresholds();
    return {
        zoom: zoom,
        hideLabels: typeof zoom === 'number' && zoom < thr.labels,
        hideObjects: typeof zoom === 'number' && zoom < thr.objects
    };
}

function applyGroupPlacemarkFilterVisibility(filter, zoomFlags) {
    zoomFlags = zoomFlags || getExpertZoomFlags();
    var hideLabels = zoomFlags.hideLabels;
    var hideObjects = zoomFlags.hideObjects;
    crossGroupPlacemarks.forEach(function(pm) {
        var v = filter.cross && !hideObjects;
        try { if (pm.options) pm.options.set('visible', v); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('crossGroupLabel');
        if (lbl) {
            var lblVisible = v && !hideLabels;
            try {
                if (lblVisible && myMap && myMap.geoObjects.indexOf(lbl) === -1) myMap.geoObjects.add(lbl);
                if (lbl.options) lbl.options.set('visible', lblVisible);
            } catch (eLbl) {}
        }
    });
    nodeGroupPlacemarks.forEach(function(pm) {
        var visible = filter.node && !hideObjects;
        if (visible && filter.nodeAggregationOnly) {
            var group = pm.properties && pm.properties.get('nodeGroup');
            visible = Array.isArray(group) && group.some(function(nd) { return nd.properties && nd.properties.get('nodeKind') === 'aggregation'; });
        }
        try { if (pm.options) pm.options.set('visible', visible); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
        if (lbl) {
            var nodeLblVisible = visible && !hideLabels;
            try {
                if (nodeLblVisible && myMap && myMap.geoObjects.indexOf(lbl) === -1) myMap.geoObjects.add(lbl);
                if (lbl.options) lbl.options.set('visible', nodeLblVisible);
            } catch (eLbl) {}
        }
    });
}

function applyCrossNodeLabelVisibility(filter, zoomFlags) {
    if (!myMap || !Array.isArray(objects)) return;
    zoomFlags = zoomFlags || getExpertZoomFlags();
    var hideLabels = zoomFlags.hideLabels;
    var showCross = !filter || filter.cross !== false;
    var showNode = !filter || filter.node !== false;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'node') return;
        var label = obj.properties.get('label');
        if (!label) return;
        var onMap = false;
        try { onMap = myMap.geoObjects.indexOf(obj) !== -1; } catch (e) { onMap = false; }
        if (!onMap) return;
        var filterVisible = obj.properties.get('_mapFilterVisible');
        var showLabel = filterVisible !== false && !hideLabels;
        if (type === 'cross') showLabel = showLabel && showCross;
        if (type === 'node') showLabel = showLabel && showNode;
        try {
            if (showLabel && myMap.geoObjects.indexOf(label) === -1) myMap.geoObjects.add(label);
            if (label.options) label.options.set('visible', showLabel);
        } catch (e2) {}
    });
}

function buildMapMountContext() {
    var zoomFlags = getExpertZoomFlags();
    var thr = getLodThresholds();
    var bounds = (typeof MapPerf !== 'undefined' && MapPerf.getExpandedBounds) ? MapPerf.getExpandedBounds(myMap) : null;
    return {
        bounds: bounds,
        zoom: zoomFlags.zoom,
        hideLabels: zoomFlags.hideLabels,
        hideObjects: zoomFlags.hideObjects,
        hideRegions: typeof zoomFlags.zoom === 'number' && zoomFlags.zoom < thr.regions,
        showConnectionLines: typeof MapPerf !== 'undefined' && MapPerf.connectionLinesVisibleAtZoom
            ? MapPerf.connectionLinesVisibleAtZoom(zoomFlags.zoom) : (typeof zoomFlags.zoom !== 'number' || zoomFlags.zoom >= thr.objects)
    };
}

function applyLowZoomMapUpdate() {
    if (window._mapPdfExportCaptureActive) return;
    if (!myMap || !objects) return;
    var filter = typeof mapFilter !== 'undefined' && mapFilter ? mapFilter : getMapFilterState();
    var zoomFlags = getExpertZoomFlags();
    var mountCtx = buildMapMountContext();
    if (typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization()) {
        MapPerf.unmountNonRegionObjects(mountCtx);
    }
    applyConnectionLinesVisibility();
    applyGroupPlacemarkFilterVisibility(filter, zoomFlags);
    try { applyExpertZoomVisibility(); } catch (eLow) {}
    try { applyCrossNodeLabelVisibility(filter, zoomFlags); } catch (eLowLbl) {}
    try { applyRegionZoomVisibility(zoomFlags.zoom); } catch (eLowReg) {}
    if (typeof applyRadioBridgeCoverageVisibility === 'function') {
        applyRadioBridgeCoverageVisibility();
    }
    if (typeof applyCameraCoverageVisibility === 'function') {
        applyCameraCoverageVisibility();
    }
}

function regionZoomLabelRebuildNeeded(oldZoom, newZoom) {
    if (typeof oldZoom !== 'number' || typeof newZoom !== 'number') return false;
    var regionsBelow = getLodThresholds().regions;
    return (oldZoom >= regionsBelow && newZoom < regionsBelow) ||
        (oldZoom < regionsBelow && newZoom >= regionsBelow);
}

/** Вернуть visible у кроссов/узлов после expert-zoom hide (опция переживает remove/add). */
function restoreExternallyManagedObjectVisibility(filter, zoomFlags) {
    if (!myMap || !Array.isArray(objects)) return;
    zoomFlags = zoomFlags || getExpertZoomFlags();
    if (zoomFlags.hideObjects) return;
    filter = filter || (typeof mapFilter !== 'undefined' && mapFilter ? mapFilter : getMapFilterState());
    var hideLabels = !!zoomFlags.hideLabels;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties || !obj.options) return;
        var type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'node') return;
        try {
            if (myMap.geoObjects.indexOf(obj) === -1) return;
        } catch (eIdx) { return; }
        var show = obj.properties.get('_mapFilterVisible') !== false;
        if (type === 'cross' && filter.cross === false) show = false;
        if (type === 'node') {
            if (filter.node === false) show = false;
            else if (filter.nodeAggregationOnly && obj.properties.get('nodeKind') !== 'aggregation') show = false;
        }
        if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) show = false;
        try { obj.options.set('visible', show); } catch (eVis) {}
        var label = obj.properties.get('label');
        if (label && label.options) {
            try { label.options.set('visible', show && !hideLabels); } catch (eLbl) {}
        }
    });
}

function applyMapViewportUpdate() {
    if (window._mapPdfExportCaptureActive) return;
    if (!myMap || !objects) return;
    var zoomFlags = getExpertZoomFlags();
    if (zoomFlags.hideObjects) {
        applyLowZoomMapUpdate();
        if (window.MapRegions && MapRegions.purgeOrphanRegionLabelDom) {
            MapRegions.purgeOrphanRegionLabelDom();
        }
        return;
    }
    var filter = typeof mapFilter !== 'undefined' && mapFilter ? mapFilter : getMapFilterState();
    if (typeof refreshCrossNodeViewportDisplay === 'function') {
        try { refreshCrossNodeViewportDisplay(); } catch (eCrossNode) {}
    }
    // На больших картах zoom-in идёт через viewport-update без полного applyMapFilter —
    // нужно явно снять visible:false, выставленный при expert-zoom hide.
    try { restoreExternallyManagedObjectVisibility(filter, zoomFlags); } catch (eRest) {}
    try { applyGroupPlacemarkFilterVisibility(filter, zoomFlags); } catch (eGrp) {}
    applyConnectionLinesVisibility();
    if (typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization()) {
        MapPerf.syncViewportMounts(buildMapMountContext());
        try { applyExpertZoomVisibility(); } catch (eExpVirt) {}
        try {
            applyCrossNodeLabelVisibility(filter, getExpertZoomFlags());
        } catch (eCnLbl) {}
        try { applyRegionZoomVisibility(myMap.getZoom()); } catch (eReg) {}
    } else {
        applyViewportCullToMap();
        try { applyExpertZoomVisibility(); } catch (eExp) {}
    }
    if (window.MapRegions && MapRegions.purgeOrphanRegionLabelDom) {
        MapRegions.purgeOrphanRegionLabelDom();
    }
    if (typeof applyRadioBridgeCoverageVisibility === 'function') {
        applyRadioBridgeCoverageVisibility();
    }
    if (typeof applyCameraCoverageVisibility === 'function') {
        applyCameraCoverageVisibility();
    }
}

function isMapFilterObjVisible(obj, filter, hiddenRegions) {
    if (!obj || !obj.properties) return false;
    filter = filter || (typeof mapFilter !== 'undefined' && mapFilter ? mapFilter : getMapFilterState());
    var type = obj.properties.get('type');
    if (type === 'cable' || type === 'cableLabel' || type === 'region') return false;
    if (type === 'node') {
        if (!filter.node) return false;
        if (filter.nodeAggregationOnly) return obj.properties.get('nodeKind') === 'aggregation';
    } else if (type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'radioBridge') {
        if (filter[type] === false) return false;
    } else if (type === 'spliceCassette') {
        if (filter.sleeve === false) return false;
    } else if (filter[type] !== true) {
        return false;
    }
    if (window.MapRegions) {
        if (hiddenRegions) {
            if (hiddenRegions.length && MapRegions.isObjectInAnyHiddenRegion(obj, objects, hiddenRegions)) return false;
        } else if (MapRegions.isObjectInAnyHiddenRegion(obj, objects)) {
            return false;
        }
    }
    return true;
}

/** Инкрементально выставить visibility одному объекту (create path, без полного O(n) applyMapFilter). */
function applyMapFilterForObject(obj) {
    if (window._mapPdfExportCaptureActive) return;
    if (!obj || !obj.properties || !myMap) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    var type = obj.properties.get('type');
    var visible = false;
    if (type === 'cable' || type === 'cableLabel' || type === 'region') {
        return;
    }
    visible = isMapFilterObjVisible(obj, filter);
    if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) visible = false;
    var filterVisible = visible;
    var zoomFlags = typeof getExpertZoomFlags === 'function' ? getExpertZoomFlags() : null;
    var hideObjects = !!(zoomFlags && zoomFlags.hideObjects);
    var hideLabels = !!(zoomFlags && zoomFlags.hideLabels);
    if (hideObjects) visible = false;
    var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization();
    try {
        obj.properties.set('_mapFilterVisible', filterVisible);
        if (!useVirtual) {
            if (obj.options) obj.options.set('visible', visible);
            var label = obj.properties.get('label');
            if (label && label.options) label.options.set('visible', visible && !hideLabels);
        } else if (type === 'cross' || type === 'node') {
            if (obj.options) obj.options.set('visible', visible);
            var cnLabel = obj.properties.get('label');
            if (cnLabel && cnLabel.options) cnLabel.options.set('visible', visible && !hideLabels);
        }
    } catch (e) {}
    if (type === 'radioBridge' && typeof applyRadioBridgeCoverageVisibility === 'function') {
        applyRadioBridgeCoverageVisibility(obj);
    }
    if (type === 'camera' && typeof applyCameraCoverageVisibility === 'function') {
        applyCameraCoverageVisibility(obj);
    }
}

function ensureObjectLabelOnMap(obj) {
    if (!obj || !obj.properties || !myMap) return;
    if (obj.properties.get('_mapFilterVisible') === false) return;
    if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) return;
    var hideLabels = false;
    var hideObjects = false;
    if (typeof getExpertZoomFlags === 'function') {
        var zf = getExpertZoomFlags();
        hideLabels = !!(zf && zf.hideLabels);
        hideObjects = !!(zf && zf.hideObjects);
    }
    if (hideObjects) return;
    var type = obj.properties.get('type');
    if (type === 'cross' || type === 'node') {
        // Подписи одиночных кроссов/узлов возвращает updateCross/NodeDisplay;
        // для групп отдельные label не нужны.
        if (typeof crossGroupPlacemarkByKey !== 'undefined' || typeof nodeGroupPlacemarkByKey !== 'undefined') {
            try {
                var gk = typeof groupKey === 'function' && obj.geometry ? groupKey(obj.geometry.getCoordinates()) : null;
                if (gk) {
                    if (type === 'cross' && crossGroupPlacemarkByKey && crossGroupPlacemarkByKey.has(gk)) return;
                    if (type === 'node' && nodeGroupPlacemarkByKey && nodeGroupPlacemarkByKey.has(gk)) return;
                }
            } catch (eGroup) {}
        }
    }
    var label = obj.properties.get('label');
    if (!label) return;
    try {
        if (obj.geometry && label.geometry) {
            label.geometry.setCoordinates(obj.geometry.getCoordinates());
        }
    } catch (eCoords) {}
    try {
        if (!hideLabels) {
            if (myMap.geoObjects.indexOf(label) === -1) myMap.geoObjects.add(label);
            if (label.options) label.options.set('visible', true);
        } else if (label.options) {
            label.options.set('visible', false);
        }
    } catch (e) {}
}

function applyMapFilter() {
    if (window._mapPdfExportCaptureActive) return;
    if (!myMap || !objects) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization();
    if (typeof updateMapFilterBadge === 'function') updateMapFilterBadge();
    // One scan for hidden regions — previously each object re-scanned all objects (O(n²)).
    if (window.MapRegions && MapRegions.invalidateHiddenRegionsCache) {
        try { MapRegions.invalidateHiddenRegionsCache(); } catch (eInv) {}
    }
    var hiddenRegions = (window.MapRegions && MapRegions.getHiddenRegions)
        ? MapRegions.getHiddenRegions(objects)
        : [];
    var visibleCables = new Set();
    var i;
    var obj;
    var type;
    var visible;
    for (i = 0; i < objects.length; i++) {
        obj = objects[i];
        if (!obj || !obj.properties) continue;
        type = obj.properties.get('type');
        if (type !== 'cable') continue;
        var from = obj.properties.get('from');
        var to = obj.properties.get('to');
        var points = obj.properties.get('points');
        visible = from && to && isMapFilterObjVisible(from, filter, hiddenRegions) && isMapFilterObjVisible(to, filter, hiddenRegions) &&
            (!Array.isArray(points) || points.length === 0 || points.every(function(p) { return isMapFilterObjVisible(p, filter, hiddenRegions); }));
        if (visible && hiddenRegions.length && window.MapRegions && MapRegions.isCableInAnyHiddenRegion(obj, objects, hiddenRegions)) {
            visible = false;
        }
        if (visible) visibleCables.add(obj);
    }
    for (i = 0; i < objects.length; i++) {
        obj = objects[i];
        if (!obj || !obj.properties) continue;
        type = obj.properties.get('type');
        visible = false;
        if (type === 'cable') {
            visible = visibleCables.has(obj);
            if (!useVirtual && window.CableUnderground) CableUnderground.setOverlaysVisible(obj, visible);
        } else if (type === 'cableLabel') {
            var cables = obj.properties.get('cables');
            visible = Array.isArray(cables) && cables.some(function(c) { return visibleCables.has(c); });
        } else if (type === 'region') {
            if (regionEditTarget && obj === regionEditTarget) {
                visible = false;
            } else if (obj.properties && obj.properties.get('_detachedForGeometryEdit')) {
                visible = false;
            } else {
                visible = window.MapRegions ? MapRegions.isRegionVisible(obj) : true;
            }
        } else {
            visible = isMapFilterObjVisible(obj, filter, hiddenRegions);
            if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) visible = false;
        }
        try {
            obj.properties.set('_mapFilterVisible', visible);
            if (!useVirtual) {
                if (obj.options) obj.options.set('visible', visible);
                var label = obj.properties.get('label');
                if (label && label.options) label.options.set('visible', visible);
                var regionLabel = obj.properties.get('regionLabel');
                if (regionLabel && regionLabel.options) regionLabel.options.set('visible', visible);
            } else if (type === 'cross' || type === 'node') {
                if (obj.options) obj.options.set('visible', visible);
            }
        } catch (e) {}
    }
    var zoomFlags = getExpertZoomFlags();
    applyGroupPlacemarkFilterVisibility(filter, zoomFlags);

    if (useVirtual) {
        var mountCtx = buildMapMountContext();
        if (mountCtx.hideObjects) {
            MapPerf.unmountNonRegionObjects(mountCtx);
            applyConnectionLinesVisibility();
            applyGroupPlacemarkFilterVisibility(filter, zoomFlags);
            try { applyExpertZoomVisibility(); } catch (eVirtLow) {}
            try { applyCrossNodeLabelVisibility(filter, zoomFlags); } catch (eCnLblLow) {}
            try { applyRegionZoomVisibility(zoomFlags.zoom); } catch (eRegLow) {}
        } else {
            MapPerf.syncViewportMounts(mountCtx);
            applyConnectionLinesVisibility();
            try { applyExpertZoomVisibility(); } catch (eVirt) {}
            try { applyCrossNodeLabelVisibility(filter, zoomFlags); } catch (eCnLbl2) {}
        }
    } else {
        applyViewportCullToMap();
        applyConnectionLinesVisibility();
        try { applyExpertZoomVisibility(); } catch (e) {}
        try { applyCrossNodeLabelVisibility(filter, zoomFlags); } catch (eCnLbl3) {}
    }
    if (window.MapRegions && MapRegions.purgeOrphanRegionLabelDom) {
        MapRegions.purgeOrphanRegionLabelDom();
    }
    if (typeof applyRadioBridgeCoverageVisibility === 'function') {
        applyRadioBridgeCoverageVisibility();
    }
    if (typeof applyCameraCoverageVisibility === 'function') {
        applyCameraCoverageVisibility();
    }
}

function applyViewportCullToMap() {
    if (!myMap || typeof MapPerf === 'undefined' || !MapPerf.shouldUseViewportCull()) return;
    var bounds = MapPerf.getExpandedBounds(myMap);
    if (!bounds) return;
    objects.forEach(function(obj) {
        if (!obj || !obj.options) return;
        try {
            if (obj.options.get('visible') === false) return;
            var type = obj.properties && obj.properties.get('type');
            if (type === 'region') return;
            if (!MapPerf.isObjectInViewport(obj, bounds)) {
                obj.options.set('visible', false);
                var label = obj.properties.get('label');
                if (label && label.options) label.options.set('visible', false);
                if (type === 'cable' && window.CableUnderground) {
                    try { CableUnderground.setOverlaysVisible(obj, false); } catch (eUg) {}
                }
            }
        } catch (e) {}
    });
    crossGroupPlacemarks.forEach(function(pm) {
        if (!pm || !pm.options || pm.options.get('visible') === false) return;
        try {
            var c = pm.geometry && pm.geometry.getCoordinates();
            if (c && !MapPerf.coordInBounds(c, bounds)) {
                pm.options.set('visible', false);
                var lbl = pm.properties && pm.properties.get('crossGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            }
        } catch (e2) {}
    });
    nodeGroupPlacemarks.forEach(function(pm) {
        if (!pm || !pm.options || pm.options.get('visible') === false) return;
        try {
            var c = pm.geometry && pm.geometry.getCoordinates();
            if (c && !MapPerf.coordInBounds(c, bounds)) {
                pm.options.set('visible', false);
                var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            }
        } catch (e3) {}
    });
}

window.getLodThresholds = getLodThresholds;
window.setLodThresholds = setLodThresholds;
window.resetLodThresholds = resetLodThresholds;
window.applyLodThresholdsFromServer = applyLodThresholdsFromServer;
window.getExpertZoomFlags = getExpertZoomFlags;
window.buildMapMountContext = buildMapMountContext;
