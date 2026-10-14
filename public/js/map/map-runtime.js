/**
 * Два независимых рантайма карты (не смешивать в одном canvas):
 *  - yandex  — официальный JS API (схема / спутник / гибрид)
 *  - leaflet — шим + ортофото / OSM / без подложки
 *
 * Выбор слоя:
 *  - орг. дефолт — только для тех, кто ещё не выбирал сам;
 *  - личный выбор пользователя сохраняется (localStorage + /api/settings).
 */
(function (global) {
    'use strict';

    var switching = false;
    var lastBasemapType = null;
    var pendingAfterLoad = null;
    var NATIVE_LOAD_TIMEOUT_MS = 20000;
    var SHIM_WAIT_MS = 15000;
    /** Keep-alive слоты: карта не destroy при переключении Яндекс ↔ Leaflet. */
    var slots = {
        yandex: null,
        leaflet: null
    };
    var warmingOpposite = false;
    var warmAttempts = 0;
    var WARM_MAX_ATTEMPTS = 4;
    var WARM_WAIT_MS = 8000;
    var warmPromise = null;
    var warmResolve = null;
    var hydratingOpposite = false;
    var hydratePromise = null;
    var hydrateResolve = null;
    var USER_KEY_PREFIX = 'volsmap.basemapType.user.';
    var ORG_DEFAULT_PREFIX = 'volsmap.basemapType.orgDefault.';
    var LEGACY_KEY = 'volsmap.basemapType';
    var LEGACY_ORG_PREFIX = 'volsmap.basemapType.org.';

    function isYandexBasemapType(type) {
        return String(type || '').indexOf('yandex#') === 0;
    }

    function isLeafletBasemapType(type) {
        return String(type || '').indexOf('leaflet#') === 0;
    }

    function desiredRuntimeForType(type) {
        if (isYandexBasemapType(type)) return 'yandex';
        if (isLeafletBasemapType(type)) return 'leaflet';
        return null;
    }

    function getUserIdForCache() {
        try {
            if (typeof currentUser !== 'undefined' && currentUser) {
                var id = currentUser.userId != null ? currentUser.userId : currentUser.id;
                if (id != null && String(id).trim() !== '') return String(id).trim();
            }
        } catch (e) {}
        try {
            var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
            var sess = raw ? JSON.parse(raw) : null;
            if (!sess) return '';
            var uid = sess.userId != null ? sess.userId : sess.id;
            return uid != null ? String(uid).trim() : '';
        } catch (e2) {
            return '';
        }
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

    function hasUserBasemapPreference() {
        var uid = getUserIdForCache();
        if (!uid) return false;
        try {
            var v = localStorage.getItem(USER_KEY_PREFIX + uid);
            return !!desiredRuntimeForType(v);
        } catch (e) {
            return false;
        }
    }

    function readUserBasemapType() {
        var uid = getUserIdForCache();
        if (!uid) return null;
        try {
            var v = localStorage.getItem(USER_KEY_PREFIX + uid);
            return desiredRuntimeForType(v) ? v : null;
        } catch (e) {
            return null;
        }
    }

    function readOrgDefaultBasemapType() {
        var orgId = getOrgIdForCache();
        if (!orgId) return null;
        try {
            var v = localStorage.getItem(ORG_DEFAULT_PREFIX + orgId);
            if (desiredRuntimeForType(v)) return v;
            // legacy keys
            var legacy = localStorage.getItem(LEGACY_ORG_PREFIX + orgId);
            if (desiredRuntimeForType(legacy)) return legacy;
        } catch (e) {}
        return null;
    }

    function persistOrgDefaultBasemapType(type) {
        var t = String(type || '');
        if (!desiredRuntimeForType(t)) return;
        var orgId = getOrgIdForCache();
        try {
            if (orgId) localStorage.setItem(ORG_DEFAULT_PREFIX + orgId, t);
        } catch (e) {}
    }

    /** Личный выбор пользователя (меню слоёв). Не перезаписывается орг. дефолтом. */
    function persistUserBasemapType(type) {
        var t = String(type || '');
        if (!desiredRuntimeForType(t)) return;
        lastBasemapType = t;
        try {
            global.VolsmapBootBasemapType = t;
        } catch (e0) {}
        var uid = getUserIdForCache();
        try {
            if (uid) localStorage.setItem(USER_KEY_PREFIX + uid, t);
            // legacy boot helpers
            localStorage.setItem(LEGACY_KEY, t);
            var orgId = getOrgIdForCache();
            if (orgId) localStorage.setItem(LEGACY_ORG_PREFIX + orgId, t);
        } catch (e) {}
        // Сервер — чтобы выбор переживал смену браузера/устройства
        try {
            if (typeof getApiBase === 'function' && typeof getAuthToken === 'function') {
                var token = getAuthToken();
                var base = getApiBase();
                if (token && base) {
                    fetch(base + '/api/settings', {
                        method: 'POST',
                        headers: {
                            Authorization: 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userBasemapType: t })
                    }).catch(function () {});
                }
            }
        } catch (eApi) {}
    }

    /** @deprecated: только session memory / boot без пометки «личный выбор» */
    function persistBasemapType(type) {
        var t = String(type || '');
        if (!desiredRuntimeForType(t)) return;
        lastBasemapType = t;
        try { global.VolsmapBootBasemapType = t; } catch (e) {}
    }

    function readCachedBasemapType() {
        var user = readUserBasemapType();
        if (user) return user;
        try {
            if (desiredRuntimeForType(global.VolsmapBootBasemapType)) {
                return global.VolsmapBootBasemapType;
            }
        } catch (e) {}
        var orgDef = readOrgDefaultBasemapType();
        if (orgDef) return orgDef;
        try {
            var legacy = localStorage.getItem(LEGACY_KEY);
            if (desiredRuntimeForType(legacy)) return legacy;
        } catch (e2) {}
        return null;
    }

    try {
        lastBasemapType = readCachedBasemapType() || global.VolsmapBootBasemapType || null;
    } catch (eInitLast) {}

    function getActiveRuntime() {
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

    /** Ждём пассивный шим (dual-boot на Яндексе грузит Leaflet в фоне). */
    function ensureLeafletShimApi() {
        if (global.__ymapsShim && global.__ymapsShim.Map) {
            return Promise.resolve(global.__ymapsShim);
        }
        return new Promise(function (resolve, reject) {
            var started = Date.now();
            var timer = setInterval(function () {
                if (global.__ymapsShim && global.__ymapsShim.Map) {
                    clearInterval(timer);
                    resolve(global.__ymapsShim);
                } else if (Date.now() - started > SHIM_WAIT_MS) {
                    clearInterval(timer);
                    reject(new Error('Leaflet-шим не загрузился'));
                }
            }, 40);
        });
    }

    function activateLeafletShim(shim) {
        global.VolsmapShimPassive = false;
        global.__ymapsShim = shim || global.__ymapsShim;
        if (global.LeafletYmapsShim && typeof LeafletYmapsShim.install === 'function') {
            LeafletYmapsShim.install();
        } else if (global.__ymapsShim) {
            global.ymaps = global.__ymapsShim;
        }
        return global.ymaps;
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

    function showSwitchOverlay(on) {
        var el = document.getElementById('mapRuntimeSwitchOverlay');
        if (on) {
            if (!el) {
                el = document.createElement('div');
                el.id = 'mapRuntimeSwitchOverlay';
                el.setAttribute('aria-hidden', 'true');
                el.style.cssText =
                    'position:absolute;inset:0;z-index:5000;display:flex;align-items:center;justify-content:center;' +
                    'background:rgba(10,14,24,0.28);backdrop-filter:blur(1px);transition:opacity .15s ease;pointer-events:all;';
                el.innerHTML =
                    '<div style="padding:8px 14px;border-radius:10px;background:rgba(15,23,42,.78);color:#e2e8f0;font:500 12px/1.3 system-ui,sans-serif;">' +
                    'Смена подложки…</div>';
                var host = document.getElementById('mapAreaWrapper') || document.body;
                if (host && host !== document.body) {
                    try {
                        var cs = window.getComputedStyle(host);
                        if (cs.position === 'static') host.style.position = 'relative';
                    } catch (ePos) {}
                }
                (host || document.body).appendChild(el);
            }
            el.style.opacity = '1';
            el.style.display = 'flex';
        } else if (el) {
            el.style.opacity = '0';
            setTimeout(function () {
                if (el && el.parentNode) el.parentNode.removeChild(el);
            }, 160);
        }
    }

    function hashData(data) {
        var n = (data && data.length) || 0;
        if (!n) return '0';
        var h = n * 10007;
        var step = Math.max(1, (n / 48) | 0);
        for (var i = 0; i < n; i += step) {
            var it = data[i];
            if (!it) continue;
            var lat = it.lat != null ? it.lat : (it.coords && it.coords[0]);
            var lon = it.lon != null ? it.lon : (it.coords && it.coords[1]);
            h = (h * 33 + String(it.uniqueId || it.id || '').length * 997 +
                Math.round((Number(lat) || 0) * 1e4) + Math.round((Number(lon) || 0) * 1e4) +
                (Number(it.revision) || 0)) | 0;
        }
        var last = data[n - 1];
        if (last) {
            h = (h * 33 + Math.round((Number(last.lat) || 0) * 1e4) +
                Math.round((Number(last.lon) || 0) * 1e4)) | 0;
        }
        return n + ':' + h;
    }

    function ensureRuntimeHost() {
        var mapEl = document.getElementById('map') || document.querySelector('.map-runtime-slot:not(.is-parked)');
        var wrap = document.getElementById('mapAreaWrapper');
        if (!wrap) return null;
        var host = document.getElementById('mapRuntimeHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'mapRuntimeHost';
            host.className = 'map-runtime-host';
            if (mapEl && mapEl.parentNode === wrap) {
                wrap.insertBefore(host, mapEl);
                host.appendChild(mapEl);
            } else if (mapEl && mapEl.parentNode) {
                mapEl.parentNode.insertBefore(host, mapEl);
                host.appendChild(mapEl);
            } else {
                wrap.appendChild(host);
            }
        }
        return host;
    }

    function parkSlotElement(el, runtimeName) {
        if (!el) return;
        el.id = 'map-runtime-' + runtimeName;
        el.classList.add('map-runtime-slot', 'is-parked');
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    function showSlotElement(el) {
        if (!el) return;
        var prev = document.getElementById('map');
        if (prev && prev !== el) {
            var otherName = prev.getAttribute('data-runtime') || 'other';
            parkSlotElement(prev, otherName);
        }
        el.id = 'map';
        el.classList.add('map', 'map-runtime-slot');
        el.classList.remove('is-parked');
        el.style.cssText = '';
        el.removeAttribute('aria-hidden');
    }

    function slotHasEngine(slot) {
        return !!(slot && slot.map && slot.el);
    }

    function slotHasObjects(slot) {
        return !!(slot && Array.isArray(slot.objects) && slot.objects.length > 0);
    }

    function setWarmStatus(status, detail) {
        try {
            global.__volsmapBasemapWarm = status;
            global.__volsmapBasemapWarmDetail = detail || '';
        } catch (e) {}
    }

    function beginWarmCycle() {
        warmingOpposite = true;
        var resolveFn = null;
        warmPromise = new Promise(function (resolve) { resolveFn = resolve; });
        warmResolve = resolveFn;
    }

    function endWarmCycle() {
        warmingOpposite = false;
        var resolveFn = warmResolve;
        warmResolve = null;
        warmPromise = null;
        if (typeof resolveFn === 'function') {
            try { resolveFn(); } catch (eRes) {}
        }
    }

    function beginHydrateCycle() {
        hydratingOpposite = true;
        var resolveFn = null;
        hydratePromise = new Promise(function (resolve) { resolveFn = resolve; });
        hydrateResolve = resolveFn;
    }

    function endHydrateCycle() {
        hydratingOpposite = false;
        var resolveFn = hydrateResolve;
        hydrateResolve = null;
        hydratePromise = null;
        if (typeof resolveFn === 'function') {
            try { resolveFn(); } catch (eRes) {}
        }
    }

    function waitBackgroundThen(cb) {
        var p = null;
        if (hydratingOpposite && hydratePromise) p = hydratePromise;
        else if (warmingOpposite && warmPromise) p = warmPromise;
        if (!p) {
            cb();
            return;
        }
        var settled = false;
        var timer = setTimeout(function () {
            if (settled) return;
            settled = true;
            cb();
        }, WARM_WAIT_MS);
        p.then(function () {
            if (settled) return;
            // Дать warm→hydrate стартовать синхронно/в том же тике
            setTimeout(function () {
                if (settled) return;
                if (hydratingOpposite && hydratePromise) {
                    waitBackgroundThen(cb);
                    return;
                }
                if (warmingOpposite && warmPromise) {
                    waitBackgroundThen(cb);
                    return;
                }
                settled = true;
                clearTimeout(timer);
                cb();
            }, 0);
        }, function () {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            cb();
        });
    }

    function getObjectsRef() {
        try {
            if (Array.isArray(global.objects)) return global.objects;
        } catch (e) {}
        return [];
    }

    function adoptObjects(arr) {
        var list = Array.isArray(arr) ? arr : [];
        try {
            global.objects = list;
        } catch (e1) {}
        try {
            if (typeof MapPerf !== 'undefined' && MapPerf.reindexAllObjects) {
                MapPerf.reindexAllObjects(list);
            }
        } catch (e2) {}
        try {
            if (typeof applyMapFilter === 'function') applyMapFilter();
            else if (typeof applyMapViewportUpdate === 'function') applyMapViewportUpdate();
        } catch (e3) {}
    }

    function recordActiveSlot(data, hide) {
        var name = getActiveRuntime();
        if (name !== 'yandex' && name !== 'leaflet') name = 'leaflet';
        if (!slots[name]) slots[name] = {};
        var slot = slots[name];
        slot.map = global.myMap;
        slot.objects = getObjectsRef();
        slot.fp = hashData(data || []);
        var el = slot.el || document.getElementById('map');
        if (el) {
            el.setAttribute('data-runtime', name);
            slot.el = el;
            if (hide !== false) parkSlotElement(el, name);
        }
        return slot;
    }

    function parkActiveSlot(data) {
        return recordActiveSlot(data, true);
    }

    function applyRuntimeApi(target, api) {
        if (target === 'yandex') {
            global.__ymapsNative = api;
            global.ymaps = api;
            if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                MapEngine.setRuntimeEngine('yandex');
            }
            global.VolsmapMapEngine = 'yandex';
        } else {
            activateLeafletShim(api);
            if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                MapEngine.setRuntimeEngine('leaflet');
            }
            global.VolsmapMapEngine = 'leaflet';
        }
    }

    function createMap(center, zoom, mapType, elementOrId) {
        var state = {
            center: center,
            zoom: zoom,
            controls: []
        };
        if (mapType) state.type = mapType;
        global.myMap = new global.ymaps.Map(elementOrId || 'map', state);
        try { global.myMap.controls.remove('searchControl'); } catch (e1) {}
        try { global.myMap.controls.remove('trafficControl'); } catch (e2) {}
        try { global.myMap.controls.remove('geolocationControl'); } catch (e3) {}
        try { global.myMap.controls.remove('rulerControl'); } catch (e4) {}
        try { global.myMap.controls.remove('fullscreenControl'); } catch (e5) {}
        try { global.myMap.controls.remove('typeSelector'); } catch (e6) {}
        try { global.myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e7) {}
        try { global.myMap.options.set('suppressMapOpenBlock', true); } catch (e8) {}
    }

    function restoreObjects(data, done, extraOpts) {
        if (typeof importData !== 'function') {
            if (typeof done === 'function') done();
            return;
        }
        var opts = {
            skipSave: true,
            skipHistory: true,
            merge: false
        };
        if (extraOpts) {
            if (extraOpts.preserveUiState) opts.preserveUiState = true;
            if (extraOpts.bulkImport) opts.bulkImport = true;
        }
        importData(data || [], opts, function (err) {
            if (typeof done === 'function') done(err || null);
        });
    }

    function syncViewToMap(view) {
        if (!global.myMap || !view) return;
        try {
            if (typeof global.myMap.setCenter === 'function' && view.center) {
                global.myMap.setCenter(view.center, view.zoom, { duration: 0 });
            } else if (typeof global.myMap.setZoom === 'function' && view.zoom != null) {
                global.myMap.setZoom(view.zoom, { duration: 0 });
            }
        } catch (e) {
            try {
                if (global.myMap.setZoom) global.myMap.setZoom(view.zoom);
                if (global.myMap.setCenter) global.myMap.setCenter(view.center);
            } catch (e2) {}
        }
    }

    function fitActiveMap() {
        try {
            if (global.myMap && global.myMap.container && global.myMap.container.fitToViewport) {
                global.myMap.container.fitToViewport();
            }
        } catch (eFit) {}
        try {
            if (global.myMap && global.myMap._leaflet && global.myMap._leaflet.invalidateSize) {
                global.myMap._leaflet.invalidateSize(false);
            }
        } catch (eInv) {}
    }

    function afterMapReady(mapType, done, light) {
        if (typeof bindMyMapInteractionEvents === 'function') {
            try { bindMyMapInteractionEvents(); } catch (eB) {}
        }
        if (typeof syncMapPanLockForEditTools === 'function') {
            try { syncMapPanLockForEditTools(); } catch (eP) {}
        }
        if (!light) {
            if (typeof createCursorIndicator === 'function') {
                try { createCursorIndicator(); } catch (eC) {}
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
        }
        if (mapType && global.myMap && typeof global.myMap.setType === 'function') {
            try { global.myMap.setType(mapType); } catch (eT) {}
        }
        fitActiveMap();
        lastBasemapType = mapType || lastBasemapType;
        if (typeof done === 'function') done();
    }

    function finishSwitch(mapType, done) {
        switching = false;
        showSwitchOverlay(false);
        if (typeof markMapTilesReady === 'function') {
            try { markMapTilesReady(); } catch (eM) {}
        }
        if (typeof done === 'function') done(null);
    }

    /**
     * Keep-alive: два контейнера, без destroy.
     * Если opposite уже гидратирован (objects+fp) — только show, без importData.
     */
    function switchTo(runtime, mapType, done) {
        if (switching) {
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
        ensureRuntimeHost();

        function beginSwitchBody() {
        var view = readView();
        var data = snapshotData();
        var fp = hashData(data);
        var existingPreview = slots[target];
        var canInstant = slotHasEngine(existingPreview) &&
            slotHasObjects(existingPreview) &&
            existingPreview.fp === fp;
        if (!canInstant) showSwitchOverlay(true);
        parkActiveSlot(data);

        var prep = target === 'yandex'
            ? loadNativeApi()
            : ensureLeafletShimApi();

        prep.then(function (api) {
            applyRuntimeApi(target, api);

            function activateExisting(slot) {
                showSlotElement(slot.el);
                global.myMap = slot.map;
                if (slotHasObjects(slot) && slot.fp === fp) {
                    adoptObjects(slot.objects);
                    syncViewToMap(view);
                    afterMapReady(mapType, function () {
                        finishSwitch(mapType, done);
                    }, true);
                    return;
                }
                showSwitchOverlay(true);
                restoreObjects(data, function () {
                    slot.objects = getObjectsRef();
                    slot.fp = fp;
                    slot.map = global.myMap;
                    syncViewToMap(view);
                    afterMapReady(mapType, function () {
                        finishSwitch(mapType, done);
                    }, true);
                }, { preserveUiState: true, bulkImport: true });
            }

            function createFresh() {
                var host = ensureRuntimeHost();
                var el = document.createElement('div');
                el.className = 'map map-runtime-slot';
                el.setAttribute('data-runtime', target);
                el.id = 'map';
                if (host) host.appendChild(el);
                else {
                    var wrap = document.getElementById('mapAreaWrapper');
                    if (wrap) wrap.appendChild(el);
                }

                function build() {
                    try {
                        createMap(view.center, view.zoom, mapType, el);
                    } catch (eCreate) {
                        switching = false;
                        showSwitchOverlay(false);
                        console.error('[MapRuntime] createMap failed', eCreate);
                        if (typeof showError === 'function') {
                            showError('Не удалось создать карту: ' + (eCreate && eCreate.message ? eCreate.message : eCreate));
                        }
                        if (typeof done === 'function') done(eCreate);
                        return;
                    }
                    restoreObjects(data, function () {
                        slots[target] = {
                            el: el,
                            map: global.myMap,
                            objects: getObjectsRef(),
                            fp: fp
                        };
                        afterMapReady(mapType, function () {
                            finishSwitch(mapType, done);
                        });
                    }, { preserveUiState: true, bulkImport: true });
                }

                if (global.ymaps && typeof global.ymaps.ready === 'function') {
                    global.ymaps.ready(build);
                } else {
                    build();
                }
            }

            var existing = slots[target];
            if (existing && existing.map && existing.el) {
                if (global.ymaps && typeof global.ymaps.ready === 'function') {
                    global.ymaps.ready(function () {
                        activateExisting(existing);
                    });
                } else {
                    activateExisting(existing);
                }
            } else {
                createFresh();
            }
        }).catch(function (err) {
            switching = false;
            showSwitchOverlay(false);
            console.error('[MapRuntime] switch failed', err);
            try {
                var prevName = target === 'yandex' ? 'leaflet' : 'yandex';
                var prev = slots[prevName];
                if (prev && prev.el) {
                    showSlotElement(prev.el);
                    global.myMap = prev.map;
                    applyRuntimeApi(prevName,
                        prevName === 'yandex' ? (global.__ymapsNative || global.ymaps) : (global.__ymapsShim || global.ymaps));
                }
            } catch (eRec) {}
            if (typeof showError === 'function') {
                showError('Не удалось переключить карту: ' + (err && err.message ? err.message : err));
            }
            if (typeof done === 'function') done(err);
        });
        } // end beginSwitchBody

        // Если слот ещё не гидратирован — дожать warm/hydrate до show
        if (!canInstantPreview(target) && !hydratingOpposite && !warmingOpposite) {
            try {
                if (!slotHasEngine(slots[target])) warmOppositeSlot();
                else hydrateOppositeSlot();
            } catch (eH) {}
        }
        waitBackgroundThen(beginSwitchBody);
    }

    function canInstantPreview(targetName) {
        var slot = slots[targetName];
        if (!slotHasEngine(slot) || !slotHasObjects(slot)) return false;
        try {
            return slot.fp === hashData(snapshotData());
        } catch (e) {
            return false;
        }
    }

    /**
     * @param {string} mapType
     * @param {function=} done
     * @param {{ asUserChoice?: boolean }=} opts
     */
    function applyBasemapType(mapType, done, opts) {
        opts = opts || {};
        var type = String(mapType || '');
        var want = desiredRuntimeForType(type);
        if (!want) {
            if (typeof done === 'function') done();
            return;
        }

        var dual = false;
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var cfgEng = String(cfg.mapEngine || global.VolsmapConfiguredEngine || '').toLowerCase();
            dual = (cfgEng === 'leaflet' || cfgEng === 'offline' || cfgEng === 'orthophoto');
        } catch (e) {}

        function finishPersist() {
            if (opts.asUserChoice) persistUserBasemapType(type);
            else persistBasemapType(type);
        }

        if (!dual) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e2) {}
            }
            finishPersist();
            if (typeof done === 'function') done();
            return;
        }

        var active = getActiveRuntime();
        if (want === active) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e3) {}
            }
            finishPersist();
            if (typeof done === 'function') done();
            return;
        }

        if (isInitialMapLoadPending()) {
            pendingAfterLoad = type;
            finishPersist();
            if (typeof done === 'function') done();
            return;
        }

        switchTo(want, type, function (err) {
            if (!err) finishPersist();
            if (typeof done === 'function') done(err);
        });
    }

    function flushPendingAfterLoad() {
        try { preloadOppositeRuntime(); } catch (ePre) {}

        var type = pendingAfterLoad;
        pendingAfterLoad = null;
        // Орг. дефолт не должен перебивать личный выбор
        if (hasUserBasemapPreference()) {
            var userType = readUserBasemapType();
            if (userType) {
                var wantU = desiredRuntimeForType(userType);
                var activeU = getActiveRuntime();
                if (wantU === activeU) {
                    if (global.myMap && global.myMap.setType) {
                        try { global.myMap.setType(userType); } catch (e) {}
                    }
                    return;
                }
                setTimeout(function () {
                    applyBasemapType(userType, null, { asUserChoice: false });
                }, 50);
                return;
            }
        }
        if (!type) return;

        var want = desiredRuntimeForType(type);
        var active = getActiveRuntime();
        if (want && want === active) {
            if (global.myMap && global.myMap.setType) {
                try { global.myMap.setType(type); } catch (e) {}
            }
            persistBasemapType(type);
            return;
        }
        setTimeout(function () {
            applyBasemapType(type, null, { asUserChoice: false });
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

    function preloadOppositeRuntime() {
        var active = getActiveRuntime();
        if (active === 'leaflet') {
            preloadNativeIfDual();
        } else {
            ensureShimSaved();
            ensureLeafletShimApi().catch(function () {});
        }
        scheduleWarmOpposite(0);
    }

    function scheduleWarmOpposite(delayMs) {
        var delay = delayMs != null ? delayMs : 0;
        setTimeout(function () {
            try { warmOppositeSlot(); } catch (eW) {
                console.warn('[MapRuntime] warm schedule error', eW);
                setWarmStatus('error', String(eW && eW.message ? eW.message : eW));
                endWarmCycle();
            }
        }, delay);
    }

    function scheduleHydrateOpposite(delayMs) {
        var delay = delayMs != null ? delayMs : 0;
        setTimeout(function () {
            try { hydrateOppositeSlot(); } catch (eH) {
                console.warn('[MapRuntime] hydrate schedule error', eH);
                setWarmStatus('error', String(eH && eH.message ? eH.message : eH));
                endHydrateCycle();
            }
        }, delay);
    }

    function prepareWarmContainer(el, host) {
        if (!el || !host) return;
        el.classList.add('map', 'map-runtime-slot');
        el.classList.remove('is-parked');
        el.style.cssText =
            'position:absolute;inset:0;width:100%;height:100%;' +
            'opacity:0;pointer-events:none;z-index:0;visibility:visible;';
        if (!el.parentNode) host.appendChild(el);
        try {
            var br = host.getBoundingClientRect();
            if (br.width < 2 || br.height < 2) {
                el.style.minWidth = '320px';
                el.style.minHeight = '240px';
            }
        } catch (eBr) {}
    }

    function isPrimaryBusy() {
        try {
            if (typeof _mapApplyInProgress !== 'undefined' && _mapApplyInProgress) return true;
        } catch (e1) {}
        try {
            if (typeof isMapBulkImportActive === 'function' && isMapBulkImportActive()) return true;
        } catch (e2) {}
        return false;
    }

    function isDataReadyForHydrate() {
        try {
            if (typeof _mapDataReady !== 'undefined' && !_mapDataReady) return false;
        } catch (e) {}
        var data = snapshotData();
        return !!(data && data.length);
    }

    /**
     * Фоновый прогрев движка (API + пустая карта) без подмены globals.
     */
    function warmOppositeSlot() {
        if (warmingOpposite || switching || hydratingOpposite) return;
        var active = getActiveRuntime();
        if (active !== 'yandex' && active !== 'leaflet') {
            setWarmStatus('skip', 'active=' + active);
            return;
        }
        var target = active === 'yandex' ? 'leaflet' : 'yandex';
        if (slotHasEngine(slots[target])) {
            setWarmStatus('ready', target + '-engine');
            scheduleHydrateOpposite(0);
            return;
        }

        beginWarmCycle();
        warmAttempts++;
        setWarmStatus('pending', target + ' #' + warmAttempts);
        ensureRuntimeHost();
        try { recordActiveSlot(null, false); } catch (eRec) {}

        var view = readView();
        var prep = target === 'yandex' ? loadNativeApi() : ensureLeafletShimApi();

        prep.then(function (api) {
            if (slotHasEngine(slots[target])) {
                setWarmStatus('ready', target + '-engine');
                endWarmCycle();
                scheduleHydrateOpposite(0);
                return;
            }
            if (!api || !api.Map) {
                throw new Error('API ' + target + ' недоступен');
            }

            var host = ensureRuntimeHost();
            var el = document.createElement('div');
            el.setAttribute('data-runtime', target);
            el.id = 'map-runtime-' + target;
            prepareWarmContainer(el, host);

            function failWarm(err) {
                console.warn('[MapRuntime] warm failed', err);
                setWarmStatus('error', String(err && err.message ? err.message : err));
                try {
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                } catch (eDel) {}
                endWarmCycle();
                if (warmAttempts < WARM_MAX_ATTEMPTS) {
                    scheduleWarmOpposite(800 * warmAttempts);
                }
            }

            function stripWarmMapChrome(mapInst) {
                if (!mapInst || !mapInst.controls) return;
                try { mapInst.controls.remove('searchControl'); } catch (e1) {}
                try { mapInst.controls.remove('trafficControl'); } catch (e2) {}
                try { mapInst.controls.remove('geolocationControl'); } catch (e3) {}
                try { mapInst.controls.remove('rulerControl'); } catch (e4) {}
                try { mapInst.controls.remove('fullscreenControl'); } catch (e5) {}
                try { mapInst.controls.remove('typeSelector'); } catch (e6) {}
                try { mapInst.behaviors.disable('rightMouseButtonMagnifier'); } catch (e7) {}
                try { mapInst.options.set('suppressMapOpenBlock', true); } catch (e8) {}
            }

            function buildWarm() {
                var mapInst = null;
                try {
                    mapInst = new api.Map(el, {
                        center: view.center,
                        zoom: view.zoom,
                        controls: []
                    });
                    stripWarmMapChrome(mapInst);
                    try {
                        if (mapInst._leaflet && mapInst._leaflet.invalidateSize) {
                            mapInst._leaflet.invalidateSize(true);
                        }
                    } catch (eInv) {}
                    try {
                        if (mapInst.container && mapInst.container.fitToViewport) {
                            mapInst.container.fitToViewport();
                        }
                    } catch (eFit) {}
                } catch (eCreate) {
                    failWarm(eCreate);
                    return;
                }
                slots[target] = {
                    el: el,
                    map: mapInst,
                    objects: [],
                    fp: ''
                };
                parkSlotElement(el, target);
                setWarmStatus('ready', target + '-engine');
                endWarmCycle();
                try { hydrateOppositeSlot(); } catch (eHyd) {
                    scheduleHydrateOpposite(50);
                }
            }

            function runWhenApiReady(cb) {
                if (api && typeof api.ready === 'function') {
                    var readyDone = false;
                    var readyTimer = setTimeout(function () {
                        if (readyDone) return;
                        readyDone = true;
                        cb();
                    }, 3000);
                    api.ready(function () {
                        if (readyDone) return;
                        readyDone = true;
                        clearTimeout(readyTimer);
                        cb();
                    });
                } else {
                    cb();
                }
            }

            runWhenApiReady(buildWarm);
        }).catch(function (err) {
            console.warn('[MapRuntime] warm opposite failed', err);
            setWarmStatus('error', String(err && err.message ? err.message : err));
            endWarmCycle();
            if (warmAttempts < WARM_MAX_ATTEMPTS) {
                scheduleWarmOpposite(1000 * warmAttempts);
            }
        });
    }

    /**
     * Фоновая заливка объектов на opposite-слот.
     * Краткий swap globals → importData → restore активной карты.
     * После этого switch = только show контейнера.
     */
    function hydrateOppositeSlot() {
        if (hydratingOpposite || warmingOpposite || switching) return;
        var active = getActiveRuntime();
        if (active !== 'yandex' && active !== 'leaflet') return;
        var target = active === 'yandex' ? 'leaflet' : 'yandex';
        var slot = slots[target];

        if (!slotHasEngine(slot)) {
            scheduleWarmOpposite(0);
            return;
        }
        if (!isDataReadyForHydrate()) {
            setWarmStatus('wait', 'data');
            return;
        }
        if (isPrimaryBusy()) {
            scheduleHydrateOpposite(400);
            return;
        }

        var data = snapshotData();
        var fp = hashData(data);
        if (!data.length) {
            setWarmStatus('ready', target + '-engine-empty');
            return;
        }
        if (slotHasObjects(slot) && slot.fp === fp) {
            setWarmStatus('ready', target + '-hydrated');
            return;
        }

        beginHydrateCycle();
        setWarmStatus('hydrating', target);
        global.__volsmapHydratingOpposite = true;

        var saved = {
            ymaps: global.ymaps,
            myMap: global.myMap,
            objects: getObjectsRef(),
            engine: global.VolsmapMapEngine,
            runtimeEngine: typeof MapEngine !== 'undefined' && MapEngine.getEngine
                ? MapEngine.getEngine()
                : active
        };

        var prep = target === 'yandex' ? loadNativeApi() : ensureLeafletShimApi();
        prep.then(function (api) {
            if (!api || !api.Map) {
                throw new Error('API ' + target + ' недоступен');
            }
            applyRuntimeApi(target, api);
            global.myMap = slot.map;

            // Не шумим оверлеем импорта во время гидратации
            var prevSetText = global.setMapLoadingOverlayText;
            if (typeof prevSetText === 'function') {
                global.setMapLoadingOverlayText = function () {};
            }

            restoreObjects(data, function (err) {
                if (typeof prevSetText === 'function') {
                    global.setMapLoadingOverlayText = prevSetText;
                }
                try {
                    if (!err) {
                        slot.objects = getObjectsRef();
                        slot.fp = fp;
                        slot.map = global.myMap;
                    }
                } catch (eSlot) {}

                try {
                    global.ymaps = saved.ymaps;
                    global.myMap = saved.myMap;
                    adoptObjects(saved.objects);
                    global.VolsmapMapEngine = saved.engine;
                    if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                        MapEngine.setRuntimeEngine(saved.runtimeEngine || active);
                    }
                    var activeSlot = slots[active];
                    if (activeSlot && activeSlot.el) {
                        showSlotElement(activeSlot.el);
                    } else {
                        var mapEl = document.getElementById('map');
                        if (mapEl) {
                            mapEl.style.cssText = '';
                            mapEl.classList.remove('is-parked');
                        }
                    }
                    fitActiveMap();
                } catch (eRest) {
                    console.warn('[MapRuntime] hydrate restore failed', eRest);
                }

                global.__volsmapHydratingOpposite = false;
                endHydrateCycle();
                if (err) {
                    setWarmStatus('error', String(err && err.message ? err.message : err));
                    scheduleHydrateOpposite(1200);
                } else {
                    setWarmStatus('ready', target + '-hydrated');
                }
            }, { preserveUiState: true, bulkImport: true });
        }).catch(function (err) {
            global.__volsmapHydratingOpposite = false;
            console.warn('[MapRuntime] hydrate failed', err);
            setWarmStatus('error', String(err && err.message ? err.message : err));
            try {
                global.ymaps = saved.ymaps;
                global.myMap = saved.myMap;
                adoptObjects(saved.objects);
                global.VolsmapMapEngine = saved.engine;
                if (typeof MapEngine !== 'undefined' && MapEngine.setRuntimeEngine) {
                    MapEngine.setRuntimeEngine(saved.runtimeEngine || active);
                }
            } catch (eR2) {}
            endHydrateCycle();
            scheduleHydrateOpposite(1500);
        });
    }

    global.MapRuntime = {
        applyBasemapType: applyBasemapType,
        switchTo: switchTo,
        getActiveRuntime: getActiveRuntime,
        desiredRuntimeForType: desiredRuntimeForType,
        preloadNativeIfDual: preloadNativeIfDual,
        preloadOppositeRuntime: preloadOppositeRuntime,
        warmOppositeSlot: warmOppositeSlot,
        hydrateOppositeSlot: hydrateOppositeSlot,
        scheduleWarmOpposite: scheduleWarmOpposite,
        scheduleHydrateOpposite: scheduleHydrateOpposite,
        flushPendingAfterLoad: flushPendingAfterLoad,
        persistBasemapType: persistBasemapType,
        persistUserBasemapType: persistUserBasemapType,
        persistOrgDefaultBasemapType: persistOrgDefaultBasemapType,
        hasUserBasemapPreference: hasUserBasemapPreference,
        readCachedBasemapType: readCachedBasemapType,
        readUserBasemapType: readUserBasemapType,
        getLastBasemapType: function () { return lastBasemapType || readCachedBasemapType(); }
    };
})(typeof window !== 'undefined' ? window : this);
