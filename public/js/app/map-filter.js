/**
 * Фильтр объектов на карте, expert zoom.
 */
var MAP_FILTER_INPUT_IDS = [
    'mapFilterNode', 'mapFilterNodeAggregationOnly', 'mapFilterCross', 'mapFilterSleeve',
    'mapFilterSupport', 'mapFilterAttachment', 'mapFilterManhole', 'mapFilterSignalPost', 'mapFilterOlt', 'mapFilterSplitter',
    'mapFilterOnu', 'mapFilterCamera', 'mapFilterMediaConverter'
];
var MAP_FILTER_MAIN_KEYS = ['node', 'cross', 'sleeve', 'support', 'attachment', 'manhole', 'signalPost', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter'];
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
    olt: 'mapFilterOlt',
    splitter: 'mapFilterSplitter',
    onu: 'mapFilterOnu',
    camera: 'mapFilterCamera',
    mediaConverter: 'mapFilterMediaConverter'
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
    var oltEl = document.getElementById('mapFilterOlt');
    var splitterEl = document.getElementById('mapFilterSplitter');
    var onuEl = document.getElementById('mapFilterOnu');
    var cameraEl = document.getElementById('mapFilterCamera');
    var mediaConverterEl = document.getElementById('mapFilterMediaConverter');
    return {
        node: nodeEl ? nodeEl.checked : true,
        nodeAggregationOnly: nodeAggEl ? nodeAggEl.checked : false,
        cross: crossEl ? crossEl.checked : true,
        sleeve: sleeveEl ? sleeveEl.checked : true,
        support: supportEl ? supportEl.checked : true,
        attachment: attachmentEl ? attachmentEl.checked : true,
        manhole: manholeEl ? manholeEl.checked : true,
        signalPost: signalPostEl ? signalPostEl.checked : true,
        olt: oltEl ? oltEl.checked : true,
        splitter: splitterEl ? splitterEl.checked : true,
        onu: onuEl ? onuEl.checked : true,
        camera: cameraEl ? cameraEl.checked : true,
        mediaConverter: mediaConverterEl ? mediaConverterEl.checked : true
    };
}

// "Vols expert" style: при отдалении сначала скрываются подписи, потом сами объекты.
// Настройка порогов: при уменьшении зума значение растет к "ближе" и скрытие уходит обратно.
const EXPERT_ZOOM_HIDE_LABELS_BELOW = 17;
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
    [nodeConnectionLines, onuConnectionLines, oltConnectionLines, splitterConnectionLines, splitterOutputConnectionLines].forEach(function(arr) {
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
    if (!myMap || typeof myMap.getZoom !== 'function') return;
    if (!Array.isArray(objects)) return;

    const zoom = myMap.getZoom();
    if (typeof zoom !== 'number') return;

    const hideLabels = zoom < EXPERT_ZOOM_HIDE_LABELS_BELOW;
    var hideObjects = zoom < EXPERT_ZOOM_HIDE_OBJECTS_BELOW;
    // На телефоне при стартовом зуме 15–16 иначе «пустая» карта без pinch-zoom.
    if (hideObjects && typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly()) {
        hideObjects = false;
    }
    if (!hideLabels && !hideObjects) return;

    // Скрываем "подписи":
    // - отдельные label-placemark'и, хранящиеся в obj.properties.get('label')
    // - отдельные cableLabel-объекты (тип 'cableLabel')
    if (hideLabels) {
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

    // Скрываем "объекты":
    // - все placemark'и из массива objects (включая кабели)
    // - group-placemark'и (nodeGroup/crossGroup)
    if (hideObjects) {
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

function applyMapFilter() {
    if (!myMap || !objects) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    if (typeof updateMapFilterBadge === 'function') updateMapFilterBadge();
    function isObjVisible(obj) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel' || type === 'region') return false;
        if (type === 'node') {
            if (!filter.node) return false;
            if (filter.nodeAggregationOnly) return obj.properties.get('nodeKind') === 'aggregation';
        } else if (type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter') {
            if (filter[type] === false) return false;
        } else if (filter[type] !== true) {
            return false;
        }
        if (window.MapRegions && MapRegions.isObjectInAnyHiddenRegion(obj, objects)) return false;
        return true;
    }
    var visibleCables = new Set();
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'cable') {
            var from = obj.properties.get('from');
            var to = obj.properties.get('to');
            var points = obj.properties.get('points');
            var visible = from && to && isObjVisible(from) && isObjVisible(to) &&
                (!Array.isArray(points) || points.length === 0 || points.every(function(p) { return isObjVisible(p); }));
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
            visible = isObjVisible(obj);
        }
        try {
            if (obj.options) obj.options.set('visible', visible);
            var label = obj.properties.get('label');
            if (label && label.options) label.options.set('visible', visible);
            var regionLabel = obj.properties.get('regionLabel');
            if (regionLabel && regionLabel.options) regionLabel.options.set('visible', visible);
        } catch (e) {}
    });
    crossGroupPlacemarks.forEach(function(pm) {
        var v = filter.cross;
        try { if (pm.options) pm.options.set('visible', v); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('crossGroupLabel');
        try { if (lbl && lbl.options) lbl.options.set('visible', v); } catch (e) {}
    });
    nodeGroupPlacemarks.forEach(function(pm) {
        var visible = filter.node;
        if (visible && filter.nodeAggregationOnly) {
            var group = pm.properties && pm.properties.get('nodeGroup');
            visible = Array.isArray(group) && group.some(function(nd) { return nd.properties && nd.properties.get('nodeKind') === 'aggregation'; });
        }
        try { if (pm.options) pm.options.set('visible', visible); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
        try { if (lbl && lbl.options) lbl.options.set('visible', visible); } catch (e) {}
    });

    applyViewportCullToMap();
    applyConnectionLinesVisibility();

    // Доп. скрытие по зуму (поверх фильтра).
    try { applyExpertZoomVisibility(); } catch (e) {}
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
