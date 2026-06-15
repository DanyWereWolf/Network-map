/**
 * Индикатор загрузки карты и отложенная подгрузка скриптов.
 */
var _mapInitialLoadPending = true;
var _mapTilesReady = false;
var _mapDataReady = false;
var _mapStateReceived = false;
var _mapLoadSafetyTimer = null;
var _mapBulkImportActive = false;
var MAP_BULK_IMPORT_MIN_ITEMS = 350;
var MAP_BULK_IMPORT_BATCH_SIZE = 60;
var MAP_UNDO_REDO_BATCH_MIN = 1;
var MAP_UNDO_REDO_BATCH_SIZE = 50;
var INCREMENTAL_UNDO_MAX_CHANGES = 50;

function isMapBulkImportActive() {
    return !!_mapBulkImportActive;
}

function mapHasOltObjects() {
    if (!objects) return false;
    for (var i = 0; i < objects.length; i++) {
        if (objects[i].properties && objects[i].properties.get('type') === 'olt') return true;
    }
    return false;
}

function finishObjectDeleteVisualRefresh(plan) {
    plan = plan || {};
    if (plan.cableVisualization) updateCableVisualization();
    if (plan.crossGroupKey != null) updateCrossDisplay(plan.crossGroupKey);
    if (plan.nodeGroupKey != null) updateNodeDisplay(plan.nodeGroupKey);
    if (plan.connectionLines === 'full') scheduleConnectionLinesUpdate('full');
    else if (plan.connectionLines) scheduleConnectionLinesUpdate(plan.connectionLines);
    updateStats();
}

function scheduleObjectDeleteVisualRefresh(plan) {
    var run = function() { finishObjectDeleteVisualRefresh(plan); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
}

function hideMapLoadingOverlay() {
    var el = document.getElementById('mapLoadingOverlay');
    if (!el || el.classList.contains('is-hidden')) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-busy', 'false');
    setTimeout(function() {
        el.setAttribute('hidden', '');
    }, 400);
}
window.hideMapLoadingOverlay = hideMapLoadingOverlay;

function showUndoRedoLoadingOverlay(text) {
    var el = document.getElementById('mapLoadingOverlay');
    if (!el) return;
    if (text && typeof setMapLoadingOverlayText === 'function') setMapLoadingOverlayText(text);
    el.removeAttribute('hidden');
    el.classList.remove('is-hidden');
    el.setAttribute('aria-busy', 'true');
}

function resetMapConnectionLineCaches() {
    nodeConnectionLines = [];
    onuConnectionLines = [];
    oltConnectionLines = [];
    splitterConnectionLines = [];
    splitterOutputConnectionLines = [];
}

function setMapLoadingOverlayText(text) {
    var el = document.querySelector('#mapLoadingOverlay .map-loading-text');
    if (el && text) el.textContent = text;
}
window.setMapLoadingOverlayText = setMapLoadingOverlayText;

function markMapTilesReady() {
    if (_mapTilesReady) return;
    _mapTilesReady = true;
    tryCompleteMapInitialLoad();
}

function markMapDataReady() {
    if (_mapDataReady) return;
    _mapDataReady = true;
    tryCompleteMapInitialLoad();
}
window.markMapDataReady = markMapDataReady;

function scheduleBackgroundAppScripts() {
    if (window._backgroundScriptsScheduled) return;
    window._backgroundScriptsScheduled = true;
    var urls = window.MAP_BACKGROUND_SCRIPTS;
    if (!urls || !urls.length || typeof loadAppScripts !== 'function') return;
    var load = function() {
        loadAppScripts(urls).catch(function() {});
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(load, { timeout: 3000 });
    } else {
        setTimeout(load, 50);
    }
}

function tryCompleteMapInitialLoad() {
    if (!_mapInitialLoadPending) return;
    if (!_mapTilesReady || !_mapDataReady) return;
    _mapInitialLoadPending = false;
    if (_mapLoadSafetyTimer) {
        clearTimeout(_mapLoadSafetyTimer);
        _mapLoadSafetyTimer = null;
    }
    scheduleBackgroundAppScripts();
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            hideMapLoadingOverlay();
            if (typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly()) {
                if (myMap && myMap.container) {
                    try { myMap.container.fitToViewport(); } catch (eFit) {}
                }
                if (typeof applyMapFilter === 'function') applyMapFilter();
            }
            if (!window.syncIsConnected && typeof showSyncRequiredOverlay === 'function') {
                showSyncRequiredOverlay();
            }
        });
    });
}

function startMapLoadSafetyTimeout() {
    if (_mapLoadSafetyTimer) return;
    _mapLoadSafetyTimer = setTimeout(function() {
        _mapLoadSafetyTimer = null;
        if (!_mapDataReady) markMapDataReady();
        if (!_mapTilesReady) markMapTilesReady();
    }, 45000);
}

function setupMapTilesReady() {
    if (!myMap || !myMap.events) {
        markMapTilesReady();
        return;
    }
    var done = false;
    function mark() {
        if (done) return;
        done = true;
        markMapTilesReady();
    }
    if (myMap.events && typeof myMap.events.add === 'function') {
        try { myMap.events.add('tilesload', mark); } catch (eTiles) {}
    }
    myMap.events.add('actionend', mark);
    setTimeout(mark, 350);
}

function hidePanoramaLayerMenuItem() {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;
    var items = mapEl.querySelectorAll('[class*="listbox__list-item"]');
    for (var i = 0; i < items.length; i++) {
        var text = (items[i].textContent || '').trim();
        if (text === 'Панорамы' || text === 'Panoramas') {
            items[i].style.display = 'none';
        }
    }
}
