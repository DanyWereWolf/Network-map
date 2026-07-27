/**
 * Фильтр объектов на карте, expert zoom.
 */
var MAP_FILTER_INPUT_IDS = [
    'mapFilterNode', 'mapFilterNodeAggregationOnly', 'mapFilterCross', 'mapFilterSleeve',
    'mapFilterSupport', 'mapFilterAttachment', 'mapFilterManhole', 'mapFilterSignalPost', 'mapFilterCabinet', 'mapFilterOlt', 'mapFilterSplitter',
    'mapFilterOnu', 'mapFilterCamera', 'mapFilterMediaConverter'
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

// «Vols expert» style: при сильном отдалении скрываются и подписи, и сами объекты.
// Подписи скрываются вместе с объектами (раньше порог был 17 — при зуме 16 по умолчанию имена не были видны).
const EXPERT_ZOOM_HIDE_LABELS_BELOW = 16;
const EXPERT_ZOOM_HIDE_OBJECTS_BELOW = 16;
/** Регионы скрываются только при сильном отдалении (отдельно от сетевых объектов). */
const EXPERT_ZOOM_HIDE_REGIONS_BELOW = 10;

function applyRegionZoomVisibility(zoom) {
    if (!Array.isArray(objects)) return;
    var hideRegions = typeof zoom === 'number' && zoom < EXPERT_ZOOM_HIDE_REGIONS_BELOW;
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

    const hideLabels = zoom < EXPERT_ZOOM_HIDE_LABELS_BELOW;
    var hideObjects = zoom < EXPERT_ZOOM_HIDE_OBJECTS_BELOW;
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
    return {
        zoom: zoom,
        hideLabels: typeof zoom === 'number' && zoom < EXPERT_ZOOM_HIDE_LABELS_BELOW,
        hideObjects: typeof zoom === 'number' && zoom < EXPERT_ZOOM_HIDE_OBJECTS_BELOW
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
    var bounds = (typeof MapPerf !== 'undefined' && MapPerf.getExpandedBounds) ? MapPerf.getExpandedBounds(myMap) : null;
    return {
        bounds: bounds,
        zoom: zoomFlags.zoom,
        hideLabels: zoomFlags.hideLabels,
        hideObjects: zoomFlags.hideObjects,
        hideRegions: typeof zoomFlags.zoom === 'number' && zoomFlags.zoom < EXPERT_ZOOM_HIDE_REGIONS_BELOW,
        showConnectionLines: typeof MapPerf !== 'undefined' && MapPerf.connectionLinesVisibleAtZoom
            ? MapPerf.connectionLinesVisibleAtZoom(zoomFlags.zoom) : (typeof zoomFlags.zoom !== 'number' || zoomFlags.zoom >= EXPERT_ZOOM_HIDE_OBJECTS_BELOW)
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
}

function regionZoomLabelRebuildNeeded(oldZoom, newZoom) {
    if (typeof oldZoom !== 'number' || typeof newZoom !== 'number') return false;
    return (oldZoom >= EXPERT_ZOOM_HIDE_REGIONS_BELOW && newZoom < EXPERT_ZOOM_HIDE_REGIONS_BELOW) ||
        (oldZoom < EXPERT_ZOOM_HIDE_REGIONS_BELOW && newZoom >= EXPERT_ZOOM_HIDE_REGIONS_BELOW);
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
    applyConnectionLinesVisibility();
    if (typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization()) {
        MapPerf.syncViewportMounts(buildMapMountContext());
        try { applyExpertZoomVisibility(); } catch (eExpVirt) {}
        try {
            applyCrossNodeLabelVisibility(typeof mapFilter !== 'undefined' ? mapFilter : getMapFilterState(), getExpertZoomFlags());
        } catch (eCnLbl) {}
        try { applyRegionZoomVisibility(myMap.getZoom()); } catch (eReg) {}
    } else {
        applyViewportCullToMap();
        try { applyExpertZoomVisibility(); } catch (eExp) {}
    }
    if (window.MapRegions && MapRegions.purgeOrphanRegionLabelDom) {
        MapRegions.purgeOrphanRegionLabelDom();
    }
}

function isMapFilterObjVisible(obj, filter) {
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
    if (window.MapRegions && MapRegions.isObjectInAnyHiddenRegion(obj, objects)) return false;
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
    var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization();
    try {
        obj.properties.set('_mapFilterVisible', visible);
        if (!useVirtual) {
            if (obj.options) obj.options.set('visible', visible);
            var label = obj.properties.get('label');
            if (label && label.options) label.options.set('visible', visible);
        } else if (type === 'cross' || type === 'node') {
            if (obj.options) obj.options.set('visible', visible);
        }
    } catch (e) {}
}

function ensureObjectLabelOnMap(obj) {
    if (!obj || !obj.properties || !myMap) return;
    if (obj.properties.get('_mapFilterVisible') === false) return;
    if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) return;
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
    var hideLabels = false;
    if (typeof getExpertZoomFlags === 'function') {
        var zf = getExpertZoomFlags();
        hideLabels = !!(zf && zf.hideLabels);
    }
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
    if (window.MapPerfLog && MapPerfLog.isEnabled()) {
        return MapPerfLog.measure('applyMapFilter', applyMapFilterInstrumented);
    }
    return applyMapFilterInstrumented();
}
function applyMapFilterInstrumented() {
    if (window._mapPdfExportCaptureActive) return;
    if (!myMap || !objects) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization();
    if (typeof updateMapFilterBadge === 'function') updateMapFilterBadge();
    var visibleCables = new Set();
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'cable') {
            var from = obj.properties.get('from');
            var to = obj.properties.get('to');
            var points = obj.properties.get('points');
            var visible = from && to && isMapFilterObjVisible(from, filter) && isMapFilterObjVisible(to, filter) &&
                (!Array.isArray(points) || points.length === 0 || points.every(function(p) { return isMapFilterObjVisible(p, filter); }));
            if (visible && window.MapRegions && MapRegions.isCableInAnyHiddenRegion(obj, objects)) visible = false;
            if (visible) visibleCables.add(obj);
        }
    });
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        var visible = false;
        if (type === 'cable') {
            visible = visibleCables.has(obj);
            if (window.CableUnderground) CableUnderground.setOverlaysVisible(obj, visible);
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
            visible = isMapFilterObjVisible(obj, filter);
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
    });
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
