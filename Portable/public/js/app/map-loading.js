var _mapInitialLoadPending = true;
var _mapTilesReady = false;
var _mapDataReady = false;
var _mapStateReceived = false;
var _mapLoadSafetyTimer = null;
var _mapBulkImportActive = false;
var MAP_BULK_IMPORT_MIN_ITEMS = 350;
var MAP_BULK_IMPORT_BATCH_SIZE = 60;
var MAP_BULK_IMPORT_BATCH_SIZE_INITIAL = 120;
var MAP_BULK_IMPORT_CABLE_BATCH_SIZE = 40;
var MAP_BULK_IMPORT_CABLE_BATCH_SIZE_INITIAL = 80;
var MAP_UNDO_REDO_BATCH_MIN = 1;
var MAP_UNDO_REDO_BATCH_SIZE = 50;
var INCREMENTAL_UNDO_MAX_CHANGES = 50;

var _entranceStartedAt = 0;
var _entranceExitStarted = false;
var _entranceReelDone = false;
var _entranceReelSafetyTimer = null;
var APP_ENTRANCE_LOADING_MS = 3600;
var APP_ENTRANCE_LOADING_WELCOME_MS = 4200;
var APP_ENTRANCE_LOADING_REDUCED_MS = 400;
var APP_ENTRANCE_REEL_FALLBACK_MS = 5200;
var APP_ENTRANCE_MIN_MS = APP_ENTRANCE_LOADING_MS;
var APP_ENTRANCE_EXIT_MS = 520;
var APP_ENTRANCE_EXIT_REDUCED_MS = 140;
var _entranceWelcomeMode = false;

var MAP_BULK_IMPORT_STEP_BUDGET_MS = 40;
var MAP_BULK_IMPORT_STEP_BUDGET_INITIAL_MS = 100;
var MAP_UNDO_REDO_STEP_BUDGET_MS = 14;

function isMapBulkImportActive() {
    return !!_mapBulkImportActive;
}

function scheduleMapImportStep(fn) {
    if (typeof document !== 'undefined' && document.hidden) {
        setTimeout(fn, 0);
        return;
    }
    requestAnimationFrame(fn);
}

function mapImportNow() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
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
    if (plan.cableVisualization) {
        if (typeof pruneCableLabelsAfterCableRemoval === 'function') {
            pruneCableLabelsAfterCableRemoval();
        } else {
            updateCableVisualization({ skipFilter: true });
        }
    }
    if (plan.crossGroupKey != null) updateCrossDisplay(plan.crossGroupKey);
    if (plan.nodeGroupKey != null) updateNodeDisplay(plan.nodeGroupKey);
    if (plan.connectionLines === 'full') scheduleConnectionLinesUpdate('full');
    else if (plan.connectionLines) scheduleConnectionLinesUpdate(plan.connectionLines);
}

function scheduleObjectDeleteVisualRefresh(plan) {
    plan = plan || {};
    var runCritical = function() {
        finishObjectDeleteVisualRefresh(plan);
    };
    var runDeferred = function() {
        try { updateStats(); } catch (eStats) {}
        if (plan.renderRegions && typeof renderRegionsSidebarList === 'function') {
            try { renderRegionsSidebarList(); } catch (eReg) {}
        }
    };
    var afterCritical = function() {
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(runDeferred, { timeout: 220 });
        } else {
            setTimeout(runDeferred, 0);
        }
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            runCritical();
            afterCritical();
        });
    } else {
        setTimeout(function() {
            runCritical();
            afterCritical();
        }, 0);
    }
}

function isAppEntranceActive() {
    var el = document.getElementById('appEntranceOverlay');
    return !!(el && !el.hasAttribute('hidden') && !el.classList.contains('is-hidden') && !el.classList.contains('is-leaving'));
}

function finishAppEntranceReel() {
    if (_entranceReelDone) return;
    _entranceReelDone = true;
    if (_entranceReelSafetyTimer) {
        clearTimeout(_entranceReelSafetyTimer);
        _entranceReelSafetyTimer = null;
    }

    var el = document.getElementById('appEntranceOverlay');
    if (!el) return;

    _entranceStartedAt = Date.now();
    APP_ENTRANCE_MIN_MS = _entranceWelcomeMode ? APP_ENTRANCE_LOADING_WELCOME_MS : APP_ENTRANCE_LOADING_MS;
    if (el.classList.contains('app-entrance--reduced')) {
        APP_ENTRANCE_MIN_MS = APP_ENTRANCE_LOADING_REDUCED_MS;
    }

    el.classList.remove('app-entrance--reel');
    el.classList.add('app-entrance--loading');

    var video = document.getElementById('appEntranceVideo');
    if (video) {
        try { video.pause(); } catch (ePause) {}
    }

    var status = el.querySelector('.app-entrance__status');
    if (status) status.textContent = 'Загрузка карты…';

    tryCompleteMapInitialLoad();
}

function startAppEntranceReel() {
    var el = document.getElementById('appEntranceOverlay');
    if (!el) return;

    var reduceMotion = el.classList.contains('app-entrance--reduced');
    var video = document.getElementById('appEntranceVideo');

    if (reduceMotion || !video) {
        finishAppEntranceReel();
        return;
    }

    el.classList.add('app-entrance--reel');
    el.classList.remove('app-entrance--loading');

    var onDone = function() {
        finishAppEntranceReel();
    };

    try {
        video.currentTime = 0;
    } catch (eSeek) {}
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;

    var played = false;
    try {
        var p = video.play();
        if (p && typeof p.then === 'function') {
            p.then(function() { played = true; }).catch(function() {
                onDone();
            });
        } else {
            played = true;
        }
    } catch (ePlay) {
        onDone();
        return;
    }

    video.addEventListener('ended', onDone, { once: true });
    video.addEventListener('error', onDone, { once: true });
    _entranceReelSafetyTimer = setTimeout(onDone, APP_ENTRANCE_REEL_FALLBACK_MS);
}

function initAppEntrance() {
    var el = document.getElementById('appEntranceOverlay');
    if (!el) return;
    _entranceStartedAt = Date.now();
    _entranceExitStarted = false;
    _entranceReelDone = false;
    _entranceWelcomeMode = false;
    if (_entranceReelSafetyTimer) {
        clearTimeout(_entranceReelSafetyTimer);
        _entranceReelSafetyTimer = null;
    }

    document.documentElement.classList.add('app-entrance-active');
    el.removeAttribute('hidden');
    el.classList.remove(
        'is-hidden', 'is-leaving', 'app-entrance--ready', 'app-entrance--enter-map',
        'app-entrance--loading', 'app-entrance--welcome', 'app-entrance--reel'
    );
    el.classList.add('app-entrance--logo');
    el.setAttribute('aria-busy', 'true');

    var justLoggedIn = false;
    try {
        justLoggedIn = sessionStorage.getItem('networkMap_justLoggedIn') === '1';
        if (justLoggedIn) sessionStorage.removeItem('networkMap_justLoggedIn');
    } catch (eFlag) {}

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

    _entranceWelcomeMode = !!justLoggedIn;
    APP_ENTRANCE_EXIT_MS = 520;

    if (justLoggedIn && greet) {
        el.classList.add('app-entrance--welcome');
        greet.hidden = false;
        greet.textContent = name ? ('Добро пожаловать, ' + name) : 'Добро пожаловать';
    } else if (greet) {
        greet.hidden = true;
    }

    var status = el.querySelector('.app-entrance__status');
    if (status) status.textContent = 'Загрузка карты…';

    var reduceMotion = false;
    try {
        reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (eMotion) {}
    if (reduceMotion) {
        APP_ENTRANCE_EXIT_MS = APP_ENTRANCE_EXIT_REDUCED_MS;
        el.classList.add('app-entrance--reduced');
    }

    _entranceReelDone = true;
    APP_ENTRANCE_MIN_MS = _entranceWelcomeMode
        ? APP_ENTRANCE_LOADING_WELCOME_MS
        : APP_ENTRANCE_LOADING_MS;
    if (reduceMotion) APP_ENTRANCE_MIN_MS = APP_ENTRANCE_LOADING_REDUCED_MS;
    _entranceStartedAt = Date.now();
}

function hideAppEntranceOverlay() {
    var el = document.getElementById('appEntranceOverlay');
    if (!el || _entranceExitStarted) return;
    _entranceExitStarted = true;
    el.classList.add('is-leaving', 'app-entrance--enter-map');
    el.classList.remove('app-entrance--reel', 'app-entrance--loading');
    el.setAttribute('aria-busy', 'false');
    var video = document.getElementById('appEntranceVideo');
    if (video) {
        try { video.pause(); } catch (ePause2) {}
    }
    setTimeout(function() {
        el.setAttribute('hidden', '');
        el.classList.add('is-hidden');
        el.classList.remove('is-leaving', 'app-entrance--enter-map', 'app-entrance--ready');
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
    if (typeof invalidateConnectionLinesDisplayCache === 'function') {
        invalidateConnectionLinesDisplayCache();
    }
}

function setMapLoadingOverlayText(text) {
    if (!text) return;
    var mapText = document.querySelector('#mapLoadingOverlay .map-loading-text');
    if (mapText) mapText.textContent = text;
    var entranceText = document.querySelector('#appEntranceOverlay .map-loading-text');
    if (entranceText && isAppEntranceActive()) entranceText.textContent = text;
}
window.setMapLoadingOverlayText = setMapLoadingOverlayText;

function resetAppEntranceTimer() {
    _entranceExitStarted = false;
    _entranceReelDone = true;
    if (_entranceReelSafetyTimer) {
        clearTimeout(_entranceReelSafetyTimer);
        _entranceReelSafetyTimer = null;
    }
    var el = document.getElementById('appEntranceOverlay');
    if (el) {
        el.classList.remove(
            'is-leaving', 'app-entrance--enter-map', 'app-entrance--ready',
            'is-hidden', 'app-entrance--loading', 'app-entrance--reel', 'app-entrance--logo'
        );
        void el.offsetWidth;
        el.classList.add('app-entrance--logo');
        el.removeAttribute('hidden');
        el.setAttribute('aria-busy', 'true');
        document.documentElement.classList.add('app-entrance-active');
        var status = el.querySelector('.app-entrance__status');
        if (status) status.textContent = 'Загрузка карты…';
    }
    APP_ENTRANCE_MIN_MS = APP_ENTRANCE_LOADING_MS;
    _entranceStartedAt = Date.now();
    if (typeof tryCompleteMapInitialLoad === 'function') {
        try { tryCompleteMapInitialLoad(); } catch (eComplete) {}
    }
}
window.resetAppEntranceTimer = resetAppEntranceTimer;

function getMapBulkImportStepBudgetMs() {
    if (_mapInitialLoadPending) return MAP_BULK_IMPORT_STEP_BUDGET_INITIAL_MS;
    return MAP_BULK_IMPORT_STEP_BUDGET_MS;
}
window.getMapBulkImportStepBudgetMs = getMapBulkImportStepBudgetMs;

function getMapBulkImportBatchSize() {
    if (_mapInitialLoadPending) return MAP_BULK_IMPORT_BATCH_SIZE_INITIAL;
    return MAP_BULK_IMPORT_BATCH_SIZE;
}
window.getMapBulkImportBatchSize = getMapBulkImportBatchSize;

function getMapBulkImportCableBatchSize() {
    if (_mapInitialLoadPending) return MAP_BULK_IMPORT_CABLE_BATCH_SIZE_INITIAL;
    return MAP_BULK_IMPORT_CABLE_BATCH_SIZE;
}
window.getMapBulkImportCableBatchSize = getMapBulkImportCableBatchSize;

function isMapRegionPickerAwaiting() {
    return !!window._mapRegionPickerAwaiting;
}
window.isMapRegionPickerAwaiting = isMapRegionPickerAwaiting;

function markMapTilesReady() {
    if (_mapTilesReady) return;
    _mapTilesReady = true;
    tryCompleteMapInitialLoad();
}

function markMapDataReady() {
    if (_mapDataReady) return;
    _mapDataReady = true;
    if (typeof applyAutoPerfForMapSize === 'function' && Array.isArray(window.objects)) {
        try { applyAutoPerfForMapSize(window.objects.length); } catch (eAuto) {}
    }
    try {
        var objCount = (typeof window.objects !== 'undefined' && Array.isArray(window.objects)) ? window.objects.length : 0;
        if (objCount < 5000 && typeof warmMapEditCaches === 'function') {
            setTimeout(function() {
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(function() { warmMapEditCaches(); }, { timeout: 30000 });
                } else {
                    warmMapEditCaches();
                }
            }, 20000);
        }
    } catch (eWarmReady) {}

    if (!_mapTilesReady) {
        setTimeout(function() {
            if (!_mapTilesReady) markMapTilesReady();
        }, 400);
    }
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
    if (window.ZabbixStatus && typeof ZabbixStatus.init === 'function') {
        try { ZabbixStatus.init(); } catch (eZx) {}
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            var overlay = document.getElementById('appEntranceOverlay');
            if (overlay) overlay.classList.add('app-entrance--ready');
            var status = document.querySelector('#appEntranceOverlay .map-loading-text');
            if (status) status.textContent = 'Открываем карту…';
            setTimeout(function() {
                hideAppEntranceOverlay();
                hideMapLoadingOverlay();
                if (myMap && myMap.container) {
                    try { myMap.container.fitToViewport(); } catch (eFit) {}
                }
                try {
                    if (typeof applyMapViewportUpdate === 'function') {
                        setTimeout(function() {
                            try { applyMapViewportUpdate(); } catch (eVp) {}
                        }, 300);
                    }
                } catch (eFilterReveal) {}
                if (!window.syncIsConnected && typeof showSyncRequiredOverlay === 'function') {
                    showSyncRequiredOverlay();
                }
                scheduleWelcomeAfterMapReady();
                if (typeof MapRuntime !== 'undefined' && MapRuntime.flushPendingAfterLoad) {
                    setTimeout(function() {
                        try { MapRuntime.flushPendingAfterLoad(); } catch (eFlush) {}
                    }, 1500);
                }
            }, 420);
        });
    });
}

function scheduleWelcomeAfterMapReady() {
    if (window.VolsmapEmbed && VolsmapEmbed.isEmbed && VolsmapEmbed.isEmbed()) return;
    var delay = Math.max(120, (APP_ENTRANCE_EXIT_MS || 620) + 80);
    setTimeout(function() {
        var resuming = typeof resumeOnboardingTourIfNeeded === 'function' && resumeOnboardingTourIfNeeded();
        if (!resuming && typeof initWelcomeModal === 'function') initWelcomeModal();
    }, delay);
}

function tryCompleteMapInitialLoad() {
    if (!_mapInitialLoadPending) return;
    if (!_mapTilesReady || !_mapDataReady) return;
    if (!_entranceReelDone) return;
    if (typeof isMapRegionPickerAwaiting === 'function' && isMapRegionPickerAwaiting()) return;
    _mapInitialLoadPending = false;
    if (_mapLoadSafetyTimer) {
        clearTimeout(_mapLoadSafetyTimer);
        _mapLoadSafetyTimer = null;
    }
    var started = _entranceStartedAt || Date.now();
    var elapsed = Date.now() - started;
    var wait = Math.max(0, APP_ENTRANCE_MIN_MS - elapsed);
    var status = document.querySelector('#appEntranceOverlay .map-loading-text');
    if (status && wait > 80) status.textContent = 'Ещё мгновение…';
    setTimeout(finishMapInitialReveal, wait);
}

function startMapLoadSafetyTimeout() {
    if (_mapLoadSafetyTimer) return;
    _mapLoadSafetyTimer = setTimeout(function() {
        _mapLoadSafetyTimer = null;
        if (!_mapDataReady) markMapDataReady();
        if (!_mapTilesReady) markMapTilesReady();
    }, 12000);
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
    setTimeout(mark, 350);
    setTimeout(mark, 2000);
    if (myMap.events && typeof myMap.events.add === 'function') {
        try { myMap.events.add('tilesload', mark); } catch (eTiles) {}
        try { myMap.events.add('actionend', mark); } catch (eAction) {}
    }
}

initAppEntrance();
