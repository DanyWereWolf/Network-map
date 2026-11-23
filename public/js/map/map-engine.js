(function (global) {
    'use strict';

    var ENGINE_YANDEX = 'yandex';
    var ENGINE_LEAFLET = 'leaflet';
    var runtimeEngine = null;

    try {
        var bootEng = global.VolsmapMapEngine;
        var cfgEng = global.VolsmapConfiguredEngine;
        if ((cfgEng === 'leaflet' || cfgEng === 'offline' || cfgEng === 'orthophoto') &&
            (bootEng === 'yandex' || bootEng === 'leaflet')) {
            runtimeEngine = bootEng;
        }
    } catch (eBoot) {}

    function normalizeEngine(raw) {
        var v = String(raw || '').trim().toLowerCase();
        if (v === ENGINE_LEAFLET || v === 'offline' || v === 'orthophoto') return ENGINE_LEAFLET;
        return ENGINE_YANDEX;
    }

    function getConfiguredEngine() {
        try {
            var cfg = global.__volsmapPublicConfig;
            if (cfg && cfg.mapEngine) return normalizeEngine(cfg.mapEngine);
        } catch (e) {}
        try {
            if (global.VolsmapConfiguredEngine) return normalizeEngine(global.VolsmapConfiguredEngine);
        } catch (eCfg) {}
        try {
            if (global.VolsmapMapEngine) return normalizeEngine(global.VolsmapMapEngine);
        } catch (e2) {}
        return ENGINE_YANDEX;
    }

    function getEngine() {
        if (runtimeEngine) return runtimeEngine;
        return getConfiguredEngine();
    }

    function setRuntimeEngine(eng) {
        runtimeEngine = eng ? normalizeEngine(eng) : null;
        try {
            global.VolsmapMapEngine = getEngine();
        } catch (e) {}
    }

    function isLeaflet() {
        return getEngine() === ENGINE_LEAFLET;
    }

    function isYandex() {
        return !isLeaflet();
    }

    function isDualMode() {
        var c = getConfiguredEngine();
        return c === ENGINE_LEAFLET;
    }

    function whenReady(cb) {
        function run() {
            try { cb(); } catch (e) { console.error('[MapEngine] ready callback failed', e); }
        }
        if (isLeaflet()) {
            if (global.ymaps && typeof global.ymaps.ready === 'function') {
                global.ymaps.ready(run);
                return;
            }
            var attempts = 0;
            var t = setInterval(function () {
                attempts++;
                if (global.ymaps && typeof global.ymaps.ready === 'function') {
                    clearInterval(t);
                    global.ymaps.ready(run);
                } else if (attempts >= 600) {
                    clearInterval(t);
                    console.error('[MapEngine] Leaflet shim not ready');
                    run();
                }
            }, 50);
            return;
        }
        if (global.ymaps && typeof global.ymaps.ready === 'function') {
            global.ymaps.ready(run);
            return;
        }
        var attemptsY = 0;
        var ty = setInterval(function () {
            attemptsY++;
            if (global.ymaps && typeof global.ymaps.ready === 'function') {
                clearInterval(ty);
                global.ymaps.ready(run);
            } else if (attemptsY >= 600) {
                clearInterval(ty);
                run();
            }
        }, 50);
    }

    global.MapEngine = {
        YANDEX: ENGINE_YANDEX,
        LEAFLET: ENGINE_LEAFLET,
        getEngine: getEngine,
        getConfiguredEngine: getConfiguredEngine,
        setRuntimeEngine: setRuntimeEngine,
        isLeaflet: isLeaflet,
        isYandex: isYandex,
        isDualMode: isDualMode,
        whenReady: whenReady,
        normalizeEngine: normalizeEngine
    };
})(typeof window !== 'undefined' ? window : this);
