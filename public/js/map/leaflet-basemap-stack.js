/**
 * Независимые провайдеры подложки для Leaflet-режима.
 *
 * - Ортофото / OSM / Яндекс-схема (XYZ web_mercator) — обычные тайлы
 * - Спутник / гибрид — настоящий JS API Яндекса в отдельном namespace (__ymapsNative),
 *   чтобы не затирать leaflet-шим window.ymaps (Placemark, Circle, …)
 */
(function (global) {
    'use strict';

    if (!global.L) {
        console.error('[BasemapStack] Leaflet (L) не загружен');
        return;
    }

    var L = global.L;

    var TILE_OPTS = {
        maxZoom: 21,
        maxNativeZoom: 20,
        attribution: '© Яндекс'
    };

    var nativeYmapsPromise = null;

    function getYandexMapsApiKey() {
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var key = String(cfg.yandexMapsApiKey || '').trim();
            if (!key || key === 'YOUR_YANDEX_MAPS_API_KEY') return '';
            return key;
        } catch (e) {
            return '';
        }
    }

    /**
     * Загрузить официальный API в window.__ymapsNative, не ломая leaflet-шим ymaps.
     */
    function loadNativeYmapsApi() {
        if (global.__ymapsNative && global.__ymapsNative.Map) {
            return new Promise(function (resolve) {
                global.__ymapsNative.ready(function () {
                    resolve(global.__ymapsNative);
                });
            });
        }
        if (nativeYmapsPromise) return nativeYmapsPromise;

        nativeYmapsPromise = new Promise(function (resolve, reject) {
            var shimRef = global.ymaps;
            var key = getYandexMapsApiKey();
            var cbName = '__volsmapYmapsNativeOnload';
            var finished = false;

            function finishOk(api) {
                if (finished) return;
                finished = true;
                global.__ymapsNative = api;
                // Вернуть шим для объектов карты
                if (shimRef) global.ymaps = shimRef;
                try {
                    delete global[cbName];
                } catch (eDel) {
                    global[cbName] = undefined;
                }
                api.ready(function () {
                    resolve(api);
                });
            }

            function finishErr(err) {
                if (finished) return;
                finished = true;
                if (shimRef) global.ymaps = shimRef;
                nativeYmapsPromise = null;
                reject(err || new Error('ymaps native load failed'));
            }

            global[cbName] = function (ym) {
                finishOk(ym || global.ymaps);
            };

            var src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU&onload=' + cbName;
            if (key) src += '&apikey=' + encodeURIComponent(key);

            var existing = document.querySelector('script[data-volsmap-ymaps-native="1"]');
            if (existing) {
                // Скрипт уже грузится — ждём callback или готовый __ymapsNative
                var wait = 0;
                var timer = setInterval(function () {
                    wait += 1;
                    if (global.__ymapsNative && global.__ymapsNative.Map) {
                        clearInterval(timer);
                        finishOk(global.__ymapsNative);
                    } else if (wait > 100) {
                        clearInterval(timer);
                        finishErr(new Error('ymaps native timeout'));
                    }
                }, 100);
                return;
            }

            var s = document.createElement('script');
            s.async = true;
            s.src = src;
            s.setAttribute('data-volsmap-ymaps-native', '1');
            s.onerror = function () {
                finishErr(new Error('ymaps script error'));
            };
            document.head.appendChild(s);
        });

        return nativeYmapsPromise;
    }

    /**
     * Слой Leaflet: под ним крутится настоящая ymaps.Map (спутник/гибрид).
     * Позиция и зум синхронизируются с Leaflet — без сдвига EPSG:3395.
     */
    var YandexApiBasemapLayer = L.Layer.extend({
        options: {
            yandexType: 'yandex#satellite',
            attribution: '© Яндекс',
            minZoom: 0,
            maxZoom: 21
        },

        initialize: function (yandexType, options) {
            L.setOptions(this, options);
            if (yandexType) this.options.yandexType = yandexType;
            this._cancelled = false;
        },

        onAdd: function (map) {
            this._cancelled = false;
            this._map = map;

            if (!this._container) {
                // Как leaflet-plugins: контейнер в mapPane, под tile/marker через z-index
                this._container = L.DomUtil.create('div', 'leaflet-yandex-api-basemap leaflet-pane');
            }
            this._container.style.cssText =
                'position:absolute;left:0;top:0;width:100%;height:100%;' +
                'z-index:200;background:#0b1220;pointer-events:none;overflow:hidden;';

            var mapPane = map.getPane('mapPane') || map.getContainer();
            mapPane.insertBefore(this._container, mapPane.firstChild);

            var self = this;
            loadNativeYmapsApi()
                .then(function (api) {
                    if (self._cancelled || !self._map) return;
                    self._initYandex(api);
                })
                .catch(function (err) {
                    console.error('[BasemapStack] Не удалось загрузить Яндекс.Карты API для спутника/гибрида', err);
                });
        },

        onRemove: function (map) {
            this._cancelled = true;
            this._unbind();
            if (this._yandex) {
                try { this._yandex.destroy(); } catch (e1) {}
                this._yandex = null;
            }
            if (this._container && this._container.parentNode) {
                this._container.parentNode.removeChild(this._container);
            }
            this._map = null;
        },

        _initYandex: function (api) {
            if (this._cancelled || this._yandex || !this._container || !api) return;
            var map = this._map;
            if (!map) return;

            var center = map.getCenter();
            var size = map.getSize();
            this._container.style.width = size.x + 'px';
            this._container.style.height = size.y + 'px';

            this._yandex = new api.Map(this._container, {
                center: [center.lat, center.lng],
                zoom: map.getZoom(),
                type: this.options.yandexType,
                controls: [],
                behaviors: []
            }, {
                balloonAutoPan: false,
                suppressMapOpenBlock: true,
                yandexMapDisablePoiInteractivity: true
            });

            try {
                var el = this._yandex.container.getElement();
                if (el) {
                    el.style.width = '100%';
                    el.style.height = '100%';
                    el.style.background = '#0b1220';
                }
            } catch (eBg) {}

            this._bind();
            this._update();
            try { this._yandex.container.fitToViewport(); } catch (eFit) {}
        },

        _bind: function () {
            if (!this._map || this._bound) return;
            this._bound = true;
            // На каждый move НЕ вызывать setCenter — иначе лавина запросов sat*.maps.yandex.net
            // (при 504 браузер зависает, объекты грузятся очень долго).
            this._onMoveFrame = this._syncContainerPosition.bind(this);
            this._onMoveEnd = this._updateFull.bind(this);
            this._onResize = function () {
                if (this._cancelled || !this._yandex) return;
                this._updateFull();
            }.bind(this);
            this._map.on('move zoom', this._onMoveFrame);
            this._map.on('moveend zoomend viewreset', this._onMoveEnd);
            this._map.on('resize', this._onResize);
        },

        _unbind: function () {
            if (!this._map || !this._bound) return;
            this._map.off('move zoom', this._onMoveFrame);
            this._map.off('moveend zoomend viewreset', this._onMoveEnd);
            this._map.off('resize', this._onResize);
            this._bound = false;
        },

        _syncContainerPosition: function () {
            var map = this._map;
            if (this._cancelled || !map || !this._container) return;
            try {
                var mapPane = map.getPane('mapPane');
                if (mapPane) {
                    var offset = L.point(0, 0).subtract(L.DomUtil.getPosition(mapPane));
                    L.DomUtil.setPosition(this._container, offset);
                }
            } catch (ePos) {}
        },

        _updateFull: function () {
            var map = this._map;
            if (this._cancelled || !map || !this._yandex) return;
            this._syncContainerPosition();
            var center = map.getCenter();
            try {
                this._yandex.setCenter([center.lat, center.lng], map.getZoom(), { duration: 0 });
            } catch (eSet) {}
            try {
                var size = map.getSize();
                this._container.style.width = size.x + 'px';
                this._container.style.height = size.y + 'px';
            } catch (eSize) {}
            try { this._yandex.container.fitToViewport(); } catch (eFit2) {}
        },

        _update: function () {
            this._updateFull();
        }
    });

    function createNone() {
        return [];
    }

    function createOsm() {
        return [L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        })];
    }

    function createYandexMap() {
        var key = getYandexMapsApiKey();
        var url = key
            ? ('https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=' + encodeURIComponent(key) +
                '&lang=ru_RU&x={x}&y={y}&z={z}&l=map&projection=web_mercator')
            : ('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU&projection=web_mercator');
        return [L.tileLayer(url, Object.assign({}, TILE_OPTS, { className: 'volsmap-yandex-map' }))];
    }

    function createYandexSatellite() {
        return [new YandexApiBasemapLayer('yandex#satellite')];
    }

    function createYandexHybrid() {
        return [new YandexApiBasemapLayer('yandex#hybrid')];
    }

    function createOrthophoto(tileUrlTemplate, opts) {
        opts = opts || {};
        var layerOpts = {
            minZoom: 0,
            maxZoom: 21,
            minNativeZoom: opts.minNativeZoom != null ? opts.minNativeZoom : 0,
            maxNativeZoom: opts.maxNativeZoom != null ? opts.maxNativeZoom : 18,
            opacity: 1,
            errorTileUrl: '',
            className: 'volsmap-orthophoto'
        };
        if (opts.bounds) layerOpts.bounds = opts.bounds;
        if (opts.tms) layerOpts.tms = true;
        return [L.tileLayer(tileUrlTemplate, layerOpts)];
    }

    function createLayersForType(type, ctx) {
        ctx = ctx || {};
        switch (String(type || '')) {
            case 'leaflet#none':
                return createNone();
            case 'leaflet#osm':
                return createOsm();
            case 'yandex#map':
                return createYandexMap();
            case 'yandex#satellite':
                return createYandexSatellite();
            case 'yandex#hybrid':
                return createYandexHybrid();
            case 'leaflet#orthophoto':
                if (!ctx.tileUrl) return createNone();
                return createOrthophoto(ctx.tileUrl, ctx);
            default:
                return createNone();
        }
    }

    global.VolsmapBasemapStack = {
        TYPES: [
            'leaflet#orthophoto',
            'leaflet#osm',
            'leaflet#none',
            'yandex#map',
            'yandex#satellite',
            'yandex#hybrid'
        ],
        loadNativeYmapsApi: loadNativeYmapsApi,
        createLayersForType: createLayersForType,
        createOrthophoto: createOrthophoto,
        createOsm: createOsm,
        createYandexMap: createYandexMap,
        createYandexSatellite: createYandexSatellite,
        createYandexHybrid: createYandexHybrid
    };
})(typeof window !== 'undefined' ? window : this);
