/**
 * Два независимых рантайма карты (не смешивать в одном canvas):
 *  - yandex  — официальный JS API (схема / спутник / гибрид как до ортофото)
 *  - leaflet — шим + ортофото / OSM / без подложки
 *
 * mapEngine=leaflet в конфиге = «доступны оба»; активный выбирается слоем.
 */
(function (global) {
    'use strict';

    var switching = false;
    var lastBasemapType = null;
    var pendingAfterLoad = null;
    var NATIVE_LOAD_TIMEOUT_MS = 20000;
    var STORAGE_KEY = 'volsmap.basemapType';
    var STORAGE_ORG_PREFIX = 'volsmap.basemapType.org.';

    function isYandexBasemapType(type) {
        var t = String(type || '');
        return t.indexOf('yandex#') === 0;
    }

    function isLeafletBasemapType(type) {
        var t = String(type || '');
        return t.indexOf('leaflet#') === 0;
    }

    function desiredRuntimeForType(type) {
        if (isYandexBasemapType(type)) return 'yandex';
        if (isLeafletBasemapType(type)) return 'leaflet';
        return null;
    }

    function getOrgIdForCache() {
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                return String(currentUser.organizationId).trim();
            }
        } catch (e) {}
        try {
            var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
            var sess = raw ? JSON.parse(raw) : null;
            if (sess && sess.organizationId != null) return String(sess.organizationId).trim();
            if (sess && sess.orgId != null) return String(sess.orgId).trim();
        } catch (e2) {}
        return '';
    }

    function persistBasemapType(type) {
        var t = String(type || '');
        if (!desiredRuntimeForType(t)) return;
        lastBasemapType = t;
        try {
            localStorage.setItem(STORAGE_KEY, t);
            var orgId = getOrgIdForCache();
            if (orgId) localStorage.setItem(STORAGE_ORG_PREFIX + orgId, t);
        } catch (e) {}
        try {
            global.VolsmapBootBasemapType = t;
        } catch (e2) {}
    }

    function readCachedBasemapType() {
        try {
            var orgId = getOrgIdForCache();
            if (orgId) {
                var perOrg = localStorage.getItem(STORAGE_ORG_PREFIX + orgId);
                if (desiredRuntimeForType(perOrg)) return perOrg;
            }
            var last = localStorage.getItem(STORAGE_KEY);
            if (desiredRuntimeForType(last)) return last;
        } catch (e) {}
        try {
            if (desiredRuntimeForType(global.VolsmapBootBasemapType)) {
                return global.VolsmapBootBasemapType;
            }
        } catch (e2) {}
        return null;
    }

    // Восстановить last из boot/кэша при загрузке модуля
    try {
        lastBasemapType = readCachedBasemapType() || global.VolsmapBootBasemapType || null;
    } catch (eInitLast) {}

    function getActiveRuntime() {
        // Фактический API важнее runtimeEngine (избегаем рассинхрона)
        try {
            if (global.ymaps && global.ymaps.meta && global.ymaps.meta.engine === 'leaflet-shim') {
                return 'leaflet';
            }
        } catch (e) {}
        if (typeof MapEngine !== 'undefined' && MapEngine.getEngine) {
            return MapEngine.getEngine();
        }
        return 'yandex';
    }

    function ensureShimSaved() {
        if (!global.__ymapsShim && global.ymaps && global.ymaps.meta && global.ymaps.meta.engine === 'leaflet-shim') {
            global.__ymapsShim = global.ymaps;
        }
    }

    function loadNativeApi() {
        if (global.__ymapsNative && global.__ymapsNative.Map) {
            return Promise.resolve(global.__ymapsNative);
        }
        var loader;
        if (global.VolsmapBasemapStack && typeof VolsmapBasemapStack.loadNativeYmapsApi === 'function') {
            loader = VolsmapBasemapStack.loadNativeYmapsApi();
        } else {
            return Promise.reject(new Error('Native Yandex API loader unavailable'));
        }
        return Promise.race([
            loader,
            new Promise(function (_, reject) {
                setTimeout(function () {
                    reject(new Error('Таймаут загрузки API Яндекс.Карт'));
                }, NATIVE_LOAD_TIMEOUT_MS);
            })
        ]);
    }

    function isInitialMapLoadPending() {
        try {
            return typeof _mapInitialLoadPending !== 'undefined' && !!_mapInitialLoadPending;
        } catch (e) {
            return false;
        }
    }

    function readView() {
        var center = [54.66, 86.16];
        var zoom = 16;
        try {
            if (global.myMap && typeof global.myMap.getCenter === 'function') {
                center = global.myMap.getCenter();
            }
            if (global.myMap && typeof global.myMap.getZoom === 'function') {
                zoom = global.myMap.getZoom();
            }
        } catch (e) {}
        return { center: center, zoom: zoom };
    }

    function snapshotData() {
        try {
            if (typeof getSerializedData === 'function') {
                return getSerializedData();
            }
        } catch (e) {}
        return [];
    }

    function resetMapDom() {
        var el = document.getElementById('map');
        if (!el) return;
        try {
            el.innerHTML = '';
            el.removeAttribute('style');
            // Leaflet оставляет классы на контейнере
            el.className = (el.className || '')
                .split(/\s+/)
                .filter(function (c) {
                    return c && c.indexOf('leaflet') !== 0;
                })
                .join(' ');
        } catch (e) {}
    }

    function destroyCurrentMap() {
        try {
            if (global.myMap && typeof global.myMap.destroy === 'function') {
                global.myMap.destroy();
            }
        } catch (e) {}
        global.myMap = null;
        resetMapDom();
    }

    function createMap(center, zoom, mapType) {
        var state = {
            center: center,
            zoom: zoom,
            controls: []
        };
        if (mapType) state.type = mapType;
        global.myMap = new global.ymaps.Map('map', state);
        try { global.myMap.controls.remove('searchControl'); } catch (e1) {}
        try { global.myMap.controls.remove('trafficControl'); } catch (e2) {}
        try { global.myMap.controls.remove('geolocationControl'); } catch (e3) {}
        try { global.myMap.controls.remove('rulerControl'); } catch (e4) {}
        try { global.myMap.controls.remove('fullscreenControl'); } catch (e5) {}
        try { global.myMap.controls.remove('typeSelector'); } catch (e6) {}
        try { global.myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e7) {}
        try { global.myMap.options.set('suppressMapOpenBlock', true); } catch (e8) {}
    }

    function restoreObjects(data, done) {
        if (typeof importData !== 'function') {
            if (typeof done === 'function') done();
            return;
        }
        importData(data || [], { skipSave: true, skipHistory: true, merge: false }, function () {
            if (typeof done === 'function') done();
        });
    }

    function afterMapReady(mapType, done) {
        if (typeof createCursorIndicator === 'function') {
            try { createCursorIndicator(); } catch (eC) {}
        }
        if (typeof bindMyMapInteractionEvents === 'function') {
            try { bindMyMapInteractionEvents(); } catch (eB) {}
        }
        if (typeof setupMapLayerSelector === 'function') {
            try { setupMapLayerSelector(); } catch (eS) {}
        }
        if (typeof setupObjectPlacementPanDrag === 'function') {
            try { setupObjectPlacementPanDrag(); } catch (ePan) {}
        }
        if (typeof setupRectSelection === 'function') {
            try { setupRectSelection(); } catch (eRect) {}
        }
        if (typeof setupMapTilesReady === 'function') {
            try { setupMapTilesReady(); } catch (eTiles) {}
        }
        if (typeof syncMapPanLockForEditTools === 'function') {
            try { syncMapPanLockForEditTools(); } catch (eP) {}
        }
        if (mapType && global.myMap && typeof global.myMap.setType === 'function') {
            try { global.myMap.setType(mapType); } catch (eT) {}
        }
        lastBasemapType = mapType || lastBasemapType;
        if (typeof done === 'function') done();
    }

    /**
     * Полная смена движка. Тяжёлая операция: снимок → destroy → create → importData.
     */
    function switchTo(runtime, mapType, done) {
        if (switching) {
            // Не рвём текущий switch — запомним желаемый слой
            if (mapType) pendingAfterLoad = mapType;
            if (typeof done === 'function') done(new Error('switch in progress'));
            return;
        }
        var target = runtime === 'leaflet' ? 'leaflet' : 'yandex';
        if (getActiveRuntime() === target) {
            if (mapType && global.myMap && global.myMap.setType) {
                try { global.myMap.setType(mapType); } catch (e) {}
            }
            lastBasemapType = mapType || lastBasemapType;
            if (typeof done === 'function') done();
            return;
        }

        switching = true;
        ensureShimSaved();
        var view = readView();
        var data = snapshotData();
        var destroyed = false;

        var prep = target === 'yandex' ? loadNativeApi() : Promise.resolve(global.__ymapsShim || global.ymaps);

        prep.then(function (api) {
            destroyCurrentMap();
            destroyed = true;

            if (target === 'yandex') {
                global.__ymapsNative = api;
                global.ymaps = api;
                if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                    MapEngine.setRuntimeEngine('yandex');
                }
                global.VolsmapMapEngine = 'yandex';
            } else {
                var shim = global.__ymapsShim || api;
                global.ymaps = shim;
                if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                    MapEngine.setRuntimeEngine('leaflet');
                }
                global.VolsmapMapEngine = 'leaflet';
            }

            function build() {
                createMap(view.center, view.zoom, mapType);
                restoreObjects(data, function () {
                    afterMapReady(mapType, function () {
                        switching = false;
                        if (typeof markMapTilesReady === 'function') {
                            try { markMapTilesReady(); } catch (eM) {}
                        }
                        if (typeof done === 'function') done(null);
                    });
                });
            }

            if (global.ymaps && typeof global.ymaps.ready === 'function') {
                global.ymaps.ready(build);
            } else {
                build();
            }
        }).catch(function (err) {
            switching = false;
            console.error('[MapRuntime] switch failed', err);
            // Если карту уже снесли — пытаемся вернуть Leaflet, чтобы не остаться с пустым #map
            if (destroyed) {
                try {
                    var shimBack = global.__ymapsShim;
                    if (shimBack) {
                        global.ymaps = shimBack;
                        if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                            MapEngine.setRuntimeEngine('leaflet');
                        }
                        global.VolsmapMapEngine = 'leaflet';
                        createMap(view.center, view.zoom);
                        restoreObjects(data, function () {
                            afterMapReady(null, function () {});
                        });
                    }
                } catch (eRec) {}
            }
            if (typeof showError === 'function') {
                showError('Не удалось переключить карту: ' + (err && err.message ? err.message : err));
            }
            if (typeof done === 'function') done(err);
        });
    }

    /**
     * Выбор слоя из меню: при необходимости меняет рантайм, иначе только setType.
     */
    function applyBasemapType(mapType, done) {
        var type = String(mapType || '');
        var want = desiredRuntimeForType(type);
        if (!want) {
            if (typeof done === 'function') done();
            return;
        }

        // Dual-mode только если конфиг изначально leaflet (on-prem с ортофото)
        var dual = false;
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var cfgEng = String(cfg.mapEngine || global.VolsmapConfiguredEngine || '').toLowerCase();
            dual = (cfgEng === 'leaflet' || cfgEng === 'offline' || cfgEng === 'orthophoto');
        } catch (e) {}

        if (!dual) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e2) {}
            }
            persistBasemapType(type);
            if (typeof done === 'function') done();
            return;
        }

        var active = getActiveRuntime();
        if (want === active) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e3) {}
            }
            persistBasemapType(type);
            if (typeof done === 'function') done();
            return;
        }

        // Нельзя destroy/recreate карты во время первой загрузки — зависает оверлей.
        // Кэш уже должен был выбрать правильный boot; pending — только если настройки орг. другие.
        if (isInitialMapLoadPending()) {
            pendingAfterLoad = type;
            persistBasemapType(type);
            if (typeof done === 'function') done();
            return;
        }

        // Без длинного пролога — оба API уже прогреты после boot
        switchTo(want, type, function (err) {
            if (!err) persistBasemapType(type);
            if (typeof done === 'function') done(err);
        });
    }

    /** Вызвать после скрытия оверлея загрузки — догрузить второй движок / редкий mismatch. */
    function flushPendingAfterLoad() {
        try { preloadOppositeRuntime(); } catch (ePre) {}

        var type = pendingAfterLoad;
        pendingAfterLoad = null;
        if (!type) return;

        var want = desiredRuntimeForType(type);
        var active = getActiveRuntime();
        // Уже на нужном рантайме (удачный boot) — только setType, без recreate
        if (want && want === active) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e) {}
            }
            persistBasemapType(type);
            return;
        }
        setTimeout(function () {
            applyBasemapType(type);
        }, 50);
    }

    function preloadNativeIfDual() {
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var cfgEng = String(cfg.mapEngine || global.VolsmapConfiguredEngine || '').toLowerCase();
            if (cfgEng === 'leaflet' || cfgEng === 'offline' || cfgEng === 'orthophoto') {
                ensureShimSaved();
                loadNativeApi().catch(function () {});
            }
        } catch (e) {}
    }

    /** Прогрев «второго» движка, чтобы ручное переключение было быстрым. */
    function preloadOppositeRuntime() {
        var active = getActiveRuntime();
        if (active === 'leaflet') {
            preloadNativeIfDual();
        } else {
            ensureShimSaved();
        }
    }

    global.MapRuntime = {
        applyBasemapType: applyBasemapType,
        switchTo: switchTo,
        getActiveRuntime: getActiveRuntime,
        desiredRuntimeForType: desiredRuntimeForType,
        preloadNativeIfDual: preloadNativeIfDual,
        preloadOppositeRuntime: preloadOppositeRuntime,
        flushPendingAfterLoad: flushPendingAfterLoad,
        persistBasemapType: persistBasemapType,
        readCachedBasemapType: readCachedBasemapType,
        getLastBasemapType: function () { return lastBasemapType || readCachedBasemapType(); }
    };
})(typeof window !== 'undefined' ? window : this);
