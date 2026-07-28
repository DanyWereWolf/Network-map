/**
 * Индикатор загрузки карты, экран входа и отложенная подгрузка скриптов.
 */
var _mapInitialLoadPending = true;
var _mapTilesReady = false;
var _mapDataReady = false;
var _mapStateReceived = false;
var _mapLoadSafetyTimer = null;
var _mapBulkImportActive = false;
var MAP_BULK_IMPORT_MIN_ITEMS = 350;
var MAP_BULK_IMPORT_BATCH_SIZE = 60;
var MAP_BULK_IMPORT_CABLE_BATCH_SIZE = 40;
var MAP_UNDO_REDO_BATCH_MIN = 1;
var MAP_UNDO_REDO_BATCH_SIZE = 50;
var INCREMENTAL_UNDO_MAX_CHANGES = 50;

var _entranceStartedAt = 0;
var _entranceExitStarted = false;
var APP_ENTRANCE_MIN_MS = 2000;
var APP_ENTRANCE_EXIT_MS = 620;

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
    // Без полного applyMapFilter: объекты уже сняты с карты; фильтр подвешивает UI на больших картах.
    if (plan.cableVisualization && typeof updateCableVisualization === 'function') {
        updateCableVisualization({ skipFilter: true });
    }
    if (plan.crossGroupKey != null && typeof updateCrossDisplay === 'function') {
        updateCrossDisplay(plan.crossGroupKey);
    }
    if (plan.nodeGroupKey != null && typeof updateNodeDisplay === 'function') {
        updateNodeDisplay(plan.nodeGroupKey);
    }
    if (plan.connectionLines === 'full') scheduleConnectionLinesUpdate('full');
    else if (plan.connectionLines) scheduleConnectionLinesUpdate(plan.connectionLines);
}

function scheduleObjectDeleteVisualRefresh(plan) {
    plan = plan || {};
    var runVisual = function() { finishObjectDeleteVisualRefresh(plan); };
    var runStats = function() {
        if (typeof updateStats === 'function') updateStats();
    };
    // Разнести тяжёлую работу по кадрам: сначала визуал, потом счётчики.
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            runVisual();
            requestAnimationFrame(runStats);
        });
    } else {
        setTimeout(runVisual, 0);
        setTimeout(runStats, 32);
    }
}

function isAppEntranceActive() {
    var el = document.getElementById('appEntranceOverlay');
    return !!(el && !el.hasAttribute('hidden') && !el.classList.contains('is-hidden') && !el.classList.contains('is-leaving'));
}

function initAppEntrance() {
    var el = document.getElementById('appEntranceOverlay');
    if (!el) return;
    _entranceStartedAt = Date.now();
    document.documentElement.classList.add('app-entrance-active');
    el.removeAttribute('hidden');
    el.classList.remove('is-hidden', 'is-leaving');
    el.setAttribute('aria-busy', 'true');

    var justLoggedIn = false;
    try {
        justLoggedIn = sessionStorage.getItem('networkMap_justLoggedIn') === '1';
        if (justLoggedIn) sessionStorage.removeItem('networkMap_justLoggedIn');
    } catch (eFlag) {}

    if (justLoggedIn) {
        el.classList.add('app-entrance--welcome');
        APP_ENTRANCE_MIN_MS = 2200;
        var greet = document.getElementById('appEntranceGreet');
        var name = '';
        try {
            var session = (typeof getStoredSession === 'function')
                ? getStoredSession()
                : (typeof AuthSystem !== 'undefined' && AuthSystem.getCurrentSession
                    ? AuthSystem.getCurrentSession()
                    : null);
            if (session) name = String(session.fullName || session.username || '').trim();
        } catch (eName) {}
        if (greet) {
            greet.hidden = false;
            greet.textContent = name ? ('Добро пожаловать, ' + name) : 'Добро пожаловать';
        }
    } else {
        APP_ENTRANCE_MIN_MS = 1100;
    }

    var reduceMotion = false;
    try {
        reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (eMotion) {}
    if (reduceMotion) {
        APP_ENTRANCE_MIN_MS = Math.min(APP_ENTRANCE_MIN_MS, 400);
        APP_ENTRANCE_EXIT_MS = 120;
        el.classList.add('app-entrance--reduced');
    }
}

function hideAppEntranceOverlay() {
    var el = document.getElementById('appEntranceOverlay');
    if (!el || _entranceExitStarted) return;
    _entranceExitStarted = true;
    el.classList.add('is-leaving');
    el.setAttribute('aria-busy', 'false');
    setTimeout(function() {
        el.setAttribute('hidden', '');
        el.classList.add('is-hidden');
        el.classList.remove('is-leaving');
        document.documentElement.classList.remove('app-entrance-active');
    }, APP_ENTRANCE_EXIT_MS);
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
    radioBridgeConnectionLines = [];
}

function setMapLoadingOverlayText(text) {
    if (!text) return;
    var mapText = document.querySelector('#mapLoadingOverlay .map-loading-text');
    if (mapText) mapText.textContent = text;
    var entranceText = document.querySelector('#appEntranceOverlay .map-loading-text');
    if (entranceText && isAppEntranceActive()) entranceText.textContent = text;
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

function finishMapInitialReveal() {
    scheduleBackgroundAppScripts();
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            var status = document.querySelector('#appEntranceOverlay .map-loading-text');
            if (status) status.textContent = 'Готово';
            hideAppEntranceOverlay();
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

function tryCompleteMapInitialLoad() {
    if (!_mapInitialLoadPending) return;
    if (!_mapTilesReady || !_mapDataReady) return;
    _mapInitialLoadPending = false;
    if (_mapLoadSafetyTimer) {
        clearTimeout(_mapLoadSafetyTimer);
        _mapLoadSafetyTimer = null;
    }
    var started = _entranceStartedAt || Date.now();
    var elapsed = Date.now() - started;
    var wait = Math.max(0, APP_ENTRANCE_MIN_MS - elapsed);
    setTimeout(finishMapInitialReveal, wait);
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

initAppEntrance();
