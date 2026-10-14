/**
 * Фасад движка карты: yandex (облако) | leaflet (on-prem / ортофото).
 * Конфиг приходит из /api/public-config → window.__volsmapPublicConfig.mapEngine
 */
(function (global) {
    'use strict';

    var ENGINE_YANDEX = 'yandex';
    var ENGINE_LEAFLET = 'leaflet';

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
            if (global.VolsmapMapEngine) return normalizeEngine(global.VolsmapMapEngine);
        } catch (e2) {}
        return ENGINE_YANDEX;
    }

    function isLeaflet() {
        return getConfiguredEngine() === ENGINE_LEAFLET;
    }

    function isYandex() {
        return !isLeaflet();
    }

    /**
     * Ждёт готовности выбранного движка и вызывает cb.
     * Для leaflet — shim выставляет window.ymaps и вызывает ready.
     */
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
        getEngine: getConfiguredEngine,
        isLeaflet: isLeaflet,
        isYandex: isYandex,
        whenReady: whenReady,
        normalizeEngine: normalizeEngine
    };
})(typeof window !== 'undefined' ? window : this);
