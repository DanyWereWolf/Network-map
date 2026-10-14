/**
 * Yandex Maps 2.1–совместимый слой поверх Leaflet для on-prem / ортофото.
 * Координаты: [lat, lon] как у ymaps.
 */
(function (global) {
    'use strict';

    if (!global.L) {
        console.error('[LeafletYmaps] Leaflet (L) не загружен');
        return;
    }

    var L = global.L;
    var readyQueue = [];
    var readyFired = false;

    function fireReady() {
        if (readyFired) return;
        readyFired = true;
        var q = readyQueue.slice();
        readyQueue = [];
        for (var i = 0; i < q.length; i++) {
            try { q[i](); } catch (e) { console.error(e); }
        }
    }

    function DataBag(initial) {
        this._data = Object.assign({}, initial || {});
    }
    DataBag.prototype.get = function (key) {
        return this._data[key];
    };
    DataBag.prototype.set = function (key, value) {
        if (key && typeof key === 'object' && value === undefined) {
            var obj = key;
            for (var k in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, k)) this._data[k] = obj[k];
            }
            this._emitChange(obj);
            return this;
        }
        this._data[key] = value;
        var single = {};
        single[key] = value;
        this._emitChange(single);
        return this;
    };
    DataBag.prototype.unset = function (key) {
        delete this._data[key];
        return this;
    };
    DataBag.prototype.getAll = function () {
        return Object.assign({}, this._data);
    };
    DataBag.prototype._emitChange = function () {};

    function EventManager(owner) {
        this._owner = owner;
        this._handlers = {};
    }
    EventManager.prototype.add = function (types, handler) {
        var list = String(types).split(/\s+/);
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            if (!t) continue;
            if (!this._handlers[t]) this._handlers[t] = [];
            this._handlers[t].push(handler);
        }
        return this;
    };
    EventManager.prototype.remove = function (types, handler) {
        var list = String(types).split(/\s+/);
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            var arr = this._handlers[t];
            if (!arr) continue;
            if (!handler) {
                delete this._handlers[t];
                continue;
            }
            this._handlers[t] = arr.filter(function (h) { return h !== handler; });
        }
        return this;
    };
    EventManager.prototype.fire = function (type, data) {
        var arr = this._handlers[type];
        if (!arr || !arr.length) return;
        var eventObj = {
            get: function (key) {
                if (key === 'target') return data && data.target != null ? data.target : this._owner;
                if (data && Object.prototype.hasOwnProperty.call(data, key)) return data[key];
                return undefined;
            }.bind(this),
            originalEvent: data && data.originalEvent,
            stopPropagation: function () {
                if (data && data.originalEvent && data.originalEvent.stopPropagation) {
                    data.originalEvent.stopPropagation();
                }
            },
            preventDefault: function () {
                if (data && data.originalEvent && data.originalEvent.preventDefault) {
                    data.originalEvent.preventDefault();
                }
            }
        };
        eventObj._owner = this._owner;
        for (var i = 0; i < arr.length; i++) {
            try { arr[i].call(this._owner, eventObj); } catch (e) { console.error(e); }
        }
    };

    function latLngFromYandex(coords) {
        if (!coords) return null;
        if (Array.isArray(coords) && typeof coords[0] === 'number') {
            return L.latLng(coords[0], coords[1]);
        }
        return null;
    }

    function yandexFromLatLng(ll) {
        if (!ll) return null;
        return [ll.lat, ll.lng];
    }

    function strokeDash(style) {
        if (style === 'dash' || style === 'dashed' || style === 1) return '8 8';
        if (style === 'dot' || style === 'dotted') return '2 6';
        return null;
    }

    function pathStyleFromOptions(opts) {
        opts = opts || {};
        var o = {
            color: opts.strokeColor || opts.color || '#3388ff',
            weight: opts.strokeWidth != null ? Number(opts.strokeWidth) : 3,
            opacity: opts.strokeOpacity != null ? Number(opts.strokeOpacity) : 0.9,
            fillColor: opts.fillColor || opts.strokeColor || '#3388ff',
            fillOpacity: opts.fillOpacity != null ? Number(opts.fillOpacity) : 0.2,
            interactive: opts.interactive !== false
        };
        var dash = strokeDash(opts.strokeStyle);
        if (dash) o.dashArray = dash;
        if (opts.zIndex != null) o.pane = undefined;
        return o;
    }

    function syncPathOptions(layer, optionsBag) {
        if (!layer || !layer.setStyle) return;
        layer.setStyle(pathStyleFromOptions(optionsBag.getAll()));
    }

    /** Как ymaps options.visible: скрыть/показать слой, не отвязывая geoObject от коллекции. */
    function applyGeoObjectVisibility(geoObj) {
        if (!geoObj) return;
        var map = geoObj._map;
        if (!map || !map._leaflet) return;
        var layer = geoObj._layer || (geoObj._ensureLayer ? geoObj._ensureLayer() : null);
        if (!layer) return;
        var visible = geoObj.options ? geoObj.options.get('visible') : true;
        if (visible === false) {
            if (map._leaflet.hasLayer(layer)) {
                map._leaflet.removeLayer(layer);
            }
            if (layer.getElement) {
                try {
                    var elHide = layer.getElement();
                    if (elHide) elHide.style.display = 'none';
                } catch (eHide) {}
            }
            return;
        }
        if (!map._leaflet.hasLayer(layer)) {
            layer.addTo(map._leaflet);
        }
        if (layer.getElement) {
            try {
                var elShow = layer.getElement();
                if (elShow) elShow.style.display = '';
            } catch (eShow) {}
        }
    }

    function bindParentApi(proto) {
        proto.getParent = function () {
            return this._parent || null;
        };
        proto.getMap = function () {
            return this._map;
        };
    }

    function makeIconFromOptions(props, options) {
        options = options || {};
        var href = options.iconImageHref;
        var content = props && props.iconContent != null ? props.iconContent : (options.iconContent || '');
        var size = options.iconImageSize || options.iconSize || [32, 32];
        var offset = options.iconImageOffset || options.iconOffset || [-size[0] / 2, -size[1] / 2];
        var layout = options.iconLayout || '';

        if (layout === 'default#imageWithContent' || (content && !href)) {
            var html = '<div class="volsmap-ymaps-icon-content" style="position:relative;transform:translate(' +
                offset[0] + 'px,' + offset[1] + 'px);">' +
                (href ? '<img src="' + href + '" alt="" style="display:block;width:' + size[0] + 'px;height:' + size[1] + 'px;"/>' : '') +
                '<div class="volsmap-ymaps-icon-html">' + (content || '') + '</div></div>';
            return L.divIcon({
                className: 'volsmap-leaflet-div-icon',
                html: html,
                iconSize: size,
                iconAnchor: [-offset[0], -offset[1]]
            });
        }
        if (href) {
            return L.icon({
                iconUrl: href,
                iconSize: size,
                iconAnchor: [-offset[0], -offset[1]],
                className: 'volsmap-leaflet-img-icon'
            });
        }
        if (content) {
            return L.divIcon({
                className: 'volsmap-leaflet-div-icon',
                html: '<div class="volsmap-ymaps-icon-html">' + content + '</div>',
                iconSize: size,
                iconAnchor: [-offset[0], -offset[1]]
            });
        }
        return L.divIcon({
            className: 'volsmap-leaflet-div-icon volsmap-leaflet-dot',
            html: '<div style="width:12px;height:12px;border-radius:50%;background:#e11d48;border:2px solid #fff;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
    }

    function bindLayerEvents(geoObj, layer) {
        if (!layer) return;
        layer.on('click', function (e) {
            geoObj.events.fire('click', {
                coords: yandexFromLatLng(e.latlng),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
        layer.on('mouseover', function (e) {
            geoObj.events.fire('mouseenter', {
                coords: yandexFromLatLng(e.latlng),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
        layer.on('mouseout', function (e) {
            geoObj.events.fire('mouseleave', {
                coords: yandexFromLatLng(e.latlng),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
        layer.on('contextmenu', function (e) {
            geoObj.events.fire('contextmenu', {
                coords: yandexFromLatLng(e.latlng),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
        layer.on('drag', function (e) {
            if (layer.getLatLng) {
                geoObj.geometry._coords = yandexFromLatLng(layer.getLatLng());
            }
            geoObj.events.fire('drag', {
                coords: geoObj.geometry.getCoordinates(),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
        layer.on('dragend', function (e) {
            if (layer.getLatLng) {
                geoObj.geometry._coords = yandexFromLatLng(layer.getLatLng());
            }
            geoObj.events.fire('dragend', {
                coords: geoObj.geometry.getCoordinates(),
                target: geoObj,
                originalEvent: e.originalEvent
            });
        });
    }

    function GeometryPoint(coords) {
        this._coords = coords ? coords.slice() : [0, 0];
    }
    GeometryPoint.prototype.getCoordinates = function () {
        return this._coords ? this._coords.slice() : null;
    };
    GeometryPoint.prototype.setCoordinates = function (coords) {
        this._coords = coords ? coords.slice() : null;
        if (this._owner && this._owner._layer && this._owner._layer.setLatLng) {
            var ll = latLngFromYandex(this._coords);
            if (ll) this._owner._layer.setLatLng(ll);
        }
        return this;
    };
    GeometryPoint.prototype.getType = function () { return 'Point'; };

    function GeometryLine(coords) {
        this._coords = Array.isArray(coords) ? coords.map(function (c) { return c.slice(); }) : [];
    }
    GeometryLine.prototype.getCoordinates = function () {
        return this._coords.map(function (c) { return c.slice(); });
    };
    GeometryLine.prototype.setCoordinates = function (coords) {
        this._coords = Array.isArray(coords) ? coords.map(function (c) { return c.slice(); }) : [];
        if (this._owner && this._owner._layer && this._owner._layer.setLatLngs) {
            this._owner._layer.setLatLngs(this._coords.map(function (c) {
                return [c[0], c[1]];
            }));
        }
        return this;
    };
    GeometryLine.prototype.getType = function () { return 'LineString'; };

    function GeometryPolygon(rings) {
        this._rings = Array.isArray(rings) ? rings.map(function (ring) {
            return Array.isArray(ring) ? ring.map(function (c) { return c.slice(); }) : [];
        }) : [];
    }
    GeometryPolygon.prototype.getCoordinates = function () {
        return this._rings.map(function (ring) {
            return ring.map(function (c) { return c.slice(); });
        });
    };
    GeometryPolygon.prototype.setCoordinates = function (rings) {
        this._rings = Array.isArray(rings) ? rings.map(function (ring) {
            return Array.isArray(ring) ? ring.map(function (c) { return c.slice(); }) : [];
        }) : [];
        if (this._owner && this._owner._layer && this._owner._layer.setLatLngs) {
            var latlngs = this._rings.map(function (ring) {
                return ring.map(function (c) { return [c[0], c[1]]; });
            });
            this._owner._layer.setLatLngs(latlngs);
        }
        return this;
    };
    GeometryPolygon.prototype.getType = function () { return 'Polygon'; };

    function Placemark(coords, properties, options) {
        this.properties = new DataBag(properties || {});
        this.options = new DataBag(options || {});
        this.events = new EventManager(this);
        this.geometry = new GeometryPoint(coords);
        this.geometry._owner = this;
        this._map = null;
        this._parent = null;
        this._layer = null;
        this._type = 'Placemark';

        var self = this;
        this.options._emitChange = function (changed) {
            // visible всегда применяем: фильтр вида часто ставит только его.
            applyGeoObjectVisibility(self);
            if (changed && Object.prototype.hasOwnProperty.call(changed, 'visible') &&
                self.options.get('visible') === false) {
                return;
            }
            self._rebuildIcon();
            if (self._layer && self._layer.dragging) {
                var draggable = !!self.options.get('draggable');
                if (draggable) self._layer.dragging.enable();
                else self._layer.dragging.disable();
            }
            if (self._layer && typeof self._layer.setOpacity === 'function' && self.options.get('opacity') != null) {
                try { self._layer.setOpacity(Number(self.options.get('opacity'))); } catch (eOp) {}
            }
        };
        this.properties._emitChange = function (changed) {
            if (changed && (changed.iconContent != null || Object.prototype.hasOwnProperty.call(changed, 'iconContent'))) {
                self._rebuildIcon();
            }
        };
    }
    Placemark.prototype._ensureLayer = function () {
        if (this._layer) return this._layer;
        var ll = latLngFromYandex(this.geometry.getCoordinates());
        var icon = makeIconFromOptions(this.properties.getAll(), this.options.getAll());
        this._layer = L.marker(ll, {
            icon: icon,
            draggable: !!this.options.get('draggable'),
            opacity: this.options.get('opacity') != null ? Number(this.options.get('opacity')) : 1,
            interactive: this.options.get('interactive') !== false,
            zIndexOffset: this.options.get('zIndex') != null ? Number(this.options.get('zIndex')) : 0
        });
        bindLayerEvents(this, this._layer);
        return this._layer;
    };
    Placemark.prototype._rebuildIcon = function () {
        if (!this._layer) return;
        this._layer.setIcon(makeIconFromOptions(this.properties.getAll(), this.options.getAll()));
    };
    bindParentApi(Placemark.prototype);

    function Polyline(coords, properties, options) {
        this.properties = new DataBag(properties || {});
        this.options = new DataBag(options || {});
        this.events = new EventManager(this);
        this.geometry = new GeometryLine(coords);
        this.geometry._owner = this;
        this._map = null;
        this._parent = null;
        this._layer = null;
        this._type = 'Polyline';
        var self = this;
        this.options._emitChange = function () {
            syncPathOptions(self._layer, self.options);
            applyGeoObjectVisibility(self);
        };
    }
    Polyline.prototype._ensureLayer = function () {
        if (this._layer) return this._layer;
        var latlngs = (this.geometry.getCoordinates() || []).map(function (c) { return [c[0], c[1]]; });
        this._layer = L.polyline(latlngs, pathStyleFromOptions(this.options.getAll()));
        bindLayerEvents(this, this._layer);
        return this._layer;
    };
    bindParentApi(Polyline.prototype);

    function Polygon(rings, properties, options) {
        this.properties = new DataBag(properties || {});
        this.options = new DataBag(options || {});
        this.events = new EventManager(this);
        var normalized = rings;
        if (Array.isArray(rings) && rings.length && typeof rings[0][0] === 'number') {
            normalized = [rings];
        }
        this.geometry = new GeometryPolygon(normalized);
        this.geometry._owner = this;
        this._map = null;
        this._parent = null;
        this._layer = null;
        this._type = 'Polygon';
        var self = this;
        this.options._emitChange = function () {
            syncPathOptions(self._layer, self.options);
            applyGeoObjectVisibility(self);
        };
    }
    Polygon.prototype._ensureLayer = function () {
        if (this._layer) return this._layer;
        var rings = this.geometry.getCoordinates() || [];
        var latlngs = rings.map(function (ring) {
            return ring.map(function (c) { return [c[0], c[1]]; });
        });
        this._layer = L.polygon(latlngs, pathStyleFromOptions(this.options.getAll()));
        bindLayerEvents(this, this._layer);
        return this._layer;
    };
    bindParentApi(Polygon.prototype);

    function GeoObjectCollection() {
        this._items = [];
        this.events = new EventManager(this);
        this._map = null;
    }
    GeoObjectCollection.prototype.add = function (obj) {
        if (!obj) return this;
        if (this._items.indexOf(obj) === -1) this._items.push(obj);
        obj._parent = this;
        if (this._map) this._map._attachGeoObject(obj);
        return this;
    };
    GeoObjectCollection.prototype.remove = function (obj) {
        var idx = this._items.indexOf(obj);
        if (idx >= 0) this._items.splice(idx, 1);
        if (obj && obj._parent === this) obj._parent = null;
        if (this._map) this._map._detachGeoObject(obj);
        return this;
    };
    GeoObjectCollection.prototype.removeAll = function () {
        var items = this._items.slice();
        for (var i = 0; i < items.length; i++) this.remove(items[i]);
        return this;
    };
    GeoObjectCollection.prototype.getLength = function () {
        return this._items.length;
    };
    GeoObjectCollection.prototype.get = function (index) {
        return this._items[index];
    };
    GeoObjectCollection.prototype.indexOf = function (obj) {
        return this._items.indexOf(obj);
    };
    GeoObjectCollection.prototype.each = function (cb) {
        for (var i = 0; i < this._items.length; i++) cb(this._items[i], i);
    };

    function Behaviors(map) {
        this._map = map;
        this._disabled = {};
    }
    Behaviors.prototype.disable = function (name) {
        this._disabled[name] = true;
        if (name === 'drag' || name === 'multiTouch') {
            try { this._map._leaflet.dragging.disable(); } catch (e) {}
        }
        if (name === 'scrollZoom') {
            try { this._map._leaflet.scrollWheelZoom.disable(); } catch (e2) {}
        }
        if (name === 'dblClickZoom') {
            try { this._map._leaflet.doubleClickZoom.disable(); } catch (e3) {}
        }
        return this;
    };
    Behaviors.prototype.enable = function (name) {
        delete this._disabled[name];
        if (name === 'drag' || name === 'multiTouch') {
            try { this._map._leaflet.dragging.enable(); } catch (e) {}
        }
        if (name === 'scrollZoom') {
            try { this._map._leaflet.scrollWheelZoom.enable(); } catch (e2) {}
        }
        return this;
    };
    Behaviors.prototype.isEnabled = function (name) {
        return !this._disabled[name];
    };

    function Controls() {}
    Controls.prototype.remove = function () { return this; };
    Controls.prototype.add = function () { return this; };

    function Container(map) {
        this._map = map;
    }
    Container.prototype.getSize = function () {
        var size = this._map._leaflet.getSize();
        return [size.x, size.y];
    };
    Container.prototype.getElement = function () {
        return this._map._leaflet.getContainer();
    };
    Container.prototype.fitToViewport = function () {
        this._map._leaflet.invalidateSize();
    };

    // Web Mercator helpers (approx ymaps.projection.wgs84Mercator)
    var EARTH = 6378137;
    var MAX_LAT = 85.05112878;
    function projectMercator(lat, lon) {
        var latC = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT);
        var x = EARTH * lon * Math.PI / 180;
        var y = EARTH * Math.log(Math.tan(Math.PI / 4 + latC * Math.PI / 360));
        return [x, y];
    }
    function toGlobalPixels(coords, zoom) {
        var m = projectMercator(coords[0], coords[1]);
        var scale = Math.pow(2, zoom) / (2 * Math.PI * EARTH) * 256;
        var world = 256 * Math.pow(2, zoom);
        var px = (m[0] + Math.PI * EARTH) * scale;
        var py = (Math.PI * EARTH - m[1]) * scale;
        return [px, py];
    }

    function MapShim(element, state, options) {
        var el = typeof element === 'string' ? document.getElementById(element) : element;
        if (!el) throw new Error('Map container not found');

        state = state || {};
        options = options || {};
        var center = state.center || [54.66, 86.16];
        var zoom = state.zoom != null ? state.zoom : 16;

        this._type = 'leaflet#orthophoto';
        this._basemapLayer = null;
        this._altLayer = null;
        this._lastManifest = null;
        this._packId = null;
        this.options = new DataBag(options);
        this.events = new EventManager(this);
        this.geoObjects = new GeoObjectCollection();
        this.geoObjects._map = this;
        this.behaviors = new Behaviors(this);
        this.controls = new Controls();
        this.container = new Container(this);
        this.layers = [];

        // Яндекс.Карты обычно дают ~19–21; у Leaflet дефолт maxZoom=18 — из‑за этого
        // «старый» зум на ортофото упирался раньше. Overzoom тайлов — через maxNativeZoom слоя.
        this._leaflet = L.map(el, {
            center: center,
            zoom: zoom,
            minZoom: 0,
            maxZoom: 21,
            zoomControl: false,
            attributionControl: false,
            preferCanvas: true
        });

        var self = this;
        this._leaflet.on('click', function (e) {
            self.events.fire('click', {
                coords: yandexFromLatLng(e.latlng),
                target: self,
                originalEvent: e.originalEvent
            });
        });
        this._leaflet.on('contextmenu', function (e) {
            self.events.fire('contextmenu', {
                coords: yandexFromLatLng(e.latlng),
                target: self,
                originalEvent: e.originalEvent
            });
        });
        this._leaflet.on('moveend zoomend', function () {
            self.events.fire('boundschange', {
                target: self,
                newCenter: self.getCenter(),
                newZoom: self.getZoom(),
                newBounds: self.getBounds()
            });
            self.events.fire('actionend', { target: self });
        });
        this._leaflet.on('movestart zoomstart', function () {
            self.events.fire('actionbegin', { target: self });
        });

        this._loadBasemap();

        // tilesload approximation
        setTimeout(function () {
            self.events.fire('tilesload', { target: self });
        }, 400);
    }

    MapShim.prototype._authToken = function () {
        try {
            if (typeof getAuthToken === 'function') {
                return getAuthToken() || '';
            }
            var sess = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
            if (sess) {
                var u = JSON.parse(sess);
                return (u && (u.token || u.sessionToken)) || '';
            }
        } catch (e) {}
        return '';
    };

    MapShim.prototype._apiBase = function () {
        if (typeof getApiBase === 'function') return getApiBase();
        return (global.location && global.location.origin) ? global.location.origin : '';
    };

    MapShim.prototype._tileUrl = function (packId) {
        var token = this._authToken();
        var base = this._apiBase();
        var q = token ? ('?token=' + encodeURIComponent(token)) : '';
        return base + '/api/basemap/tiles/' + encodeURIComponent(packId) + '/{z}/{x}/{y}.png' + q;
    };

    MapShim.prototype._loadBasemap = function () {
        var self = this;
        var token = this._authToken();
        var headers = {};
        if (token) headers.Authorization = 'Bearer ' + token;
        fetch(this._apiBase() + '/api/basemap/active', { headers: headers })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) {
                if (!data || !data.packId) {
                    try { global._volsmapHasActiveBasemap = false; } catch (eNo) {}
                    self._showNoBasemapBanner(true);
                    return;
                }
                self._showNoBasemapBanner(false);
                self.setBasemapPack(data);
            })
            .catch(function () {
                try { global._volsmapHasActiveBasemap = false; } catch (eFail) {}
                self._showNoBasemapBanner(true);
            });
    };

    MapShim.prototype._showNoBasemapBanner = function (show) {
        var id = 'volsmapBasemapMissingBanner';
        var el = document.getElementById(id);
        if (!show) {
            if (el) el.style.display = 'none';
            return;
        }
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'volsmap-offline-map-banner';
            el.setAttribute('role', 'status');
            var header = document.querySelector('.top-header');
            if (header && header.parentNode) header.parentNode.insertBefore(el, header.nextSibling);
            else document.body.appendChild(el);
        }
        el.textContent = 'Ортофото не загружено. Администратор организации: загрузите GeoTIFF в разделе «Подложка карты».';
        el.style.display = 'block';
    };

    MapShim.prototype._clearAltLayer = function () {
        if (this._altLayer) {
            try { this._leaflet.removeLayer(this._altLayer); } catch (e) {}
            this._altLayer = null;
        }
    };

    MapShim.prototype._clearBasemapLayer = function () {
        if (this._basemapLayer) {
            try { this._leaflet.removeLayer(this._basemapLayer); } catch (e) {}
            this._basemapLayer = null;
        }
    };

    MapShim.prototype._clearMaxBounds = function () {
        try {
            this._leaflet.setMaxBounds(null);
            if (this._leaflet.options) this._leaflet.options.maxBounds = null;
        } catch (e) {}
    };

    MapShim.prototype.setBasemapPack = function (manifest) {
        if (!manifest || !manifest.packId) return;
        this._lastManifest = manifest;
        this._packId = manifest.packId;
        try { global._volsmapHasActiveBasemap = true; } catch (eFlag) {}
        this._clearAltLayer();
        this._clearBasemapLayer();
        var nativeMin = manifest.minZoom != null ? Number(manifest.minZoom) : 0;
        var nativeMax = manifest.maxZoom != null ? Number(manifest.maxZoom) : 18;
        if (!Number.isFinite(nativeMin)) nativeMin = 0;
        if (!Number.isFinite(nativeMax)) nativeMax = 18;
        // maxZoom слоя = лимит карты (как у Яндекса), maxNativeZoom = реальные тайлы.
        // Иначе Leaflet не даёт приблизить дальше нарезки пакета.
        var opts = {
            minZoom: 0,
            maxZoom: 21,
            minNativeZoom: nativeMin,
            maxNativeZoom: nativeMax,
            opacity: 1,
            errorTileUrl: ''
        };
        if (manifest.bounds && Array.isArray(manifest.bounds) && manifest.bounds.length === 2) {
            opts.bounds = L.latLngBounds(manifest.bounds[0], manifest.bounds[1]);
        }
        if (manifest.tms) opts.tms = true;
        this._basemapLayer = L.tileLayer(this._tileUrl(manifest.packId), opts);
        this._basemapLayer.addTo(this._leaflet);
        try {
            this._leaflet.setMinZoom(0);
            this._leaflet.setMaxZoom(21);
        } catch (eZoomLim) {}
        if (opts.bounds) {
            try {
                this._leaflet.setMaxBounds(opts.bounds.pad(0.2));
            } catch (e2) {}
        }
        this._type = 'leaflet#orthophoto';
        this.events.fire('typechange', { target: this });
        this.events.fire('tilesload', { target: this });
    };

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

    var YANDEX_TILE_OPTS = {
        maxZoom: 21,
        maxNativeZoom: 20,
        attribution: '© Яндекс'
    };

    // WGS84 eccentricity — спутник Яндекса режется в EPSG:3395 (эллиптический Меркатор),
    // Leaflet/OSM/ортофото — EPSG:3857. Без перепроецирования объекты «уезжают».
    var YANDEX_E = 0.08181919084262157;
    var YANDEX_ORIGIN = 20037508.342789244;

    function latLngToYandexGlobalPixels(lat, lng, zoom) {
        var latC = Math.max(Math.min(lat, MAX_LAT), -MAX_LAT);
        var latRad = latC * Math.PI / 180;
        var lngRad = lng * Math.PI / 180;
        var esin = YANDEX_E * Math.sin(latRad);
        var mx = EARTH * lngRad;
        var my = EARTH * Math.log(
            Math.tan(Math.PI / 4 + latRad / 2) *
            Math.pow((1 - esin) / (1 + esin), YANDEX_E / 2)
        );
        var res = (2 * YANDEX_ORIGIN) / (256 * Math.pow(2, zoom));
        return {
            x: (mx + YANDEX_ORIGIN) / res,
            y: (YANDEX_ORIGIN - my) / res
        };
    }

    function loadImage(url) {
        return new Promise(function (resolve) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { resolve(null); };
            img.src = url;
        });
    }

    /**
     * Спутник Яндекса (EPSG:3395) → холст тайла Leaflet (EPSG:3857).
     */
    function buildYandexSatReprojectedLayer() {
        return L.gridLayer(Object.assign({}, YANDEX_TILE_OPTS, {
            maxNativeZoom: 19,
            tileSize: 256,
            createTile: function (coords, done) {
                var canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 256;
                var ctx = canvas.getContext('2d');
                if (!this._map) {
                    setTimeout(function () { done(null, canvas); }, 0);
                    return canvas;
                }

                var z = coords.z;
                var tileBounds = this._tileCoordsToBounds(coords);
                var nw = tileBounds.getNorthWest();
                var ne = tileBounds.getNorthEast();
                var sw = tileBounds.getSouthWest();
                var se = tileBounds.getSouthEast();

                var cNW = latLngToYandexGlobalPixels(nw.lat, nw.lng, z);
                var cNE = latLngToYandexGlobalPixels(ne.lat, ne.lng, z);
                var cSW = latLngToYandexGlobalPixels(sw.lat, sw.lng, z);
                var cSE = latLngToYandexGlobalPixels(se.lat, se.lng, z);

                var minX = Math.min(cNW.x, cNE.x, cSW.x, cSE.x);
                var maxX = Math.max(cNW.x, cNE.x, cSW.x, cSE.x);
                var minY = Math.min(cNW.y, cNE.y, cSW.y, cSE.y);
                var maxY = Math.max(cNW.y, cNE.y, cSW.y, cSE.y);

                var worldTiles = Math.pow(2, z);
                var tx0 = Math.max(0, Math.floor(minX / 256));
                var ty0 = Math.max(0, Math.floor(minY / 256));
                var tx1 = Math.min(worldTiles - 1, Math.floor((maxX - 1e-6) / 256));
                var ty1 = Math.min(worldTiles - 1, Math.floor((maxY - 1e-6) / 256));

                var loads = [];
                var meta = [];
                for (var tx = tx0; tx <= tx1; tx++) {
                    for (var ty = ty0; ty <= ty1; ty++) {
                        meta.push({ tx: tx, ty: ty });
                        loads.push(loadImage(
                            'https://core-sat.maps.yandex.net/tiles?l=sat&x=' + tx +
                            '&y=' + ty + '&z=' + z + '&scale=1&lang=ru_RU'
                        ));
                    }
                }

                Promise.all(loads).then(function (images) {
                    var cols = tx1 - tx0 + 1;
                    var rows = ty1 - ty0 + 1;
                    if (cols < 1 || rows < 1) {
                        done(null, canvas);
                        return;
                    }
                    var stitch = document.createElement('canvas');
                    stitch.width = cols * 256;
                    stitch.height = rows * 256;
                    var sctx = stitch.getContext('2d');
                    for (var i = 0; i < meta.length; i++) {
                        if (!images[i]) continue;
                        sctx.drawImage(
                            images[i],
                            (meta[i].tx - tx0) * 256,
                            (meta[i].ty - ty0) * 256
                        );
                    }
                    var src = sctx.getImageData(0, 0, stitch.width, stitch.height);
                    var sdata = src.data;
                    var sw = stitch.width;
                    var out = ctx.createImageData(256, 256);
                    var odata = out.data;
                    var lat0 = nw.lat;
                    var lat1 = sw.lat;
                    var lng0 = nw.lng;
                    var lng1 = ne.lng;

                    for (var py = 0; py < 256; py++) {
                        var lat = lat0 + (lat1 - lat0) * (py / 255);
                        for (var px = 0; px < 256; px++) {
                            var lng = lng0 + (lng1 - lng0) * (px / 255);
                            var g = latLngToYandexGlobalPixels(lat, lng, z);
                            var sx = g.x - tx0 * 256;
                            var sy = g.y - ty0 * 256;
                            var ix = sx | 0;
                            var iy = sy | 0;
                            if (ix < 0 || iy < 0 || ix >= sw || iy >= stitch.height) continue;
                            var si = (iy * sw + ix) * 4;
                            var oi = (py * 256 + px) * 4;
                            odata[oi] = sdata[si];
                            odata[oi + 1] = sdata[si + 1];
                            odata[oi + 2] = sdata[si + 2];
                            odata[oi + 3] = sdata[si + 3];
                        }
                    }
                    ctx.putImageData(out, 0, 0);
                    done(null, canvas);
                }).catch(function () {
                    done(null, canvas);
                });

                return canvas;
            }
        }));
    }

    /**
     * Тайлы Яндекса для Leaflet (EPSG:3857).
     * layer: map | sat | skl
     * map/skl — projection=web_mercator; sat — перепроецирование 3395→3857.
     */
    function buildYandexTileLayer(layerKind) {
        var kind = layerKind || 'map';
        var key = getYandexMapsApiKey();
        var url;
        if (kind === 'sat') {
            return buildYandexSatReprojectedLayer();
        }
        if (kind === 'map' && key) {
            url = 'https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=' + encodeURIComponent(key) +
                '&lang=ru_RU&x={x}&y={y}&z={z}&l=map&projection=web_mercator';
            return L.tileLayer(url, Object.assign({}, YANDEX_TILE_OPTS));
        }
        // map / skl — только web_mercator, иначе сдвиг относительно объектов
        url = 'https://core-renderer-tiles.maps.yandex.net/tiles?l=' + encodeURIComponent(kind) +
            '&x={x}&y={y}&z={z}&scale=1&lang=ru_RU&projection=web_mercator';
        return L.tileLayer(url, Object.assign({}, YANDEX_TILE_OPTS));
    }

    MapShim.prototype._setAltBasemapLayer = function (layer, type) {
        this._clearBasemapLayer();
        this._clearAltLayer();
        this._clearMaxBounds();
        this._showNoBasemapBanner(false);
        this._altLayer = layer;
        if (layer) layer.addTo(this._leaflet);
        this._type = type;
        this.events.fire('typechange', { target: this });
        this.events.fire('tilesload', { target: this });
    };

    MapShim.prototype._applyBasemapType = function (type) {
        var next = type || 'leaflet#orthophoto';
        if (next === 'leaflet#none') {
            this._setAltBasemapLayer(null, 'leaflet#none');
            return;
        }
        if (next === 'leaflet#osm') {
            this._setAltBasemapLayer(L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap'
            }), 'leaflet#osm');
            return;
        }
        if (next === 'yandex#map') {
            this._setAltBasemapLayer(buildYandexTileLayer('map'), next);
            return;
        }
        if (next === 'yandex#satellite') {
            this._setAltBasemapLayer(buildYandexTileLayer('sat'), next);
            return;
        }
        if (next === 'yandex#hybrid') {
            // Как в Яндексе: спутник + слой подписей (skl), не полная схема поверх.
            var hybrid = L.layerGroup([
                buildYandexTileLayer('sat'),
                buildYandexTileLayer('skl')
            ]);
            this._setAltBasemapLayer(hybrid, next);
            return;
        }
        // leaflet#orthophoto (и любые неизвестные → ортофото)
        this._clearAltLayer();
        if (this._lastManifest && this._lastManifest.packId) {
            this.setBasemapPack(this._lastManifest);
            return;
        }
        this._type = 'leaflet#orthophoto';
        this._loadBasemap();
        this.events.fire('typechange', { target: this });
    };

    MapShim.prototype._attachGeoObject = function (obj) {
        if (!obj) return;
        obj._map = this;
        var layer = obj._ensureLayer ? obj._ensureLayer() : null;
        if (!layer) return;
        var visible = obj.options ? obj.options.get('visible') : true;
        if (visible === false) {
            if (this._leaflet.hasLayer(layer)) this._leaflet.removeLayer(layer);
            return;
        }
        if (!this._leaflet.hasLayer(layer)) layer.addTo(this._leaflet);
    };

    MapShim.prototype._detachGeoObject = function (obj) {
        if (!obj) return;
        if (obj._layer && this._leaflet.hasLayer(obj._layer)) {
            this._leaflet.removeLayer(obj._layer);
        }
        obj._map = null;
    };

    MapShim.prototype.getCenter = function () {
        return yandexFromLatLng(this._leaflet.getCenter());
    };
    MapShim.prototype.getZoom = function () {
        return this._leaflet.getZoom();
    };
    MapShim.prototype.setCenter = function (center, zoom, opts) {
        var ll = latLngFromYandex(center);
        if (!ll) return this;
        var z = zoom != null ? zoom : this.getZoom();
        var duration = opts && opts.duration != null ? Number(opts.duration) : 0;
        if (duration > 0) {
            this._leaflet.setView(ll, z, { animate: true, duration: duration / 1000 });
        } else {
            this._leaflet.setView(ll, z, { animate: false });
        }
        return this;
    };
    MapShim.prototype.setZoom = function (zoom, opts) {
        var duration = opts && opts.duration != null ? Number(opts.duration) : 0;
        this._leaflet.setZoom(zoom, { animate: duration > 0 });
        return this;
    };
    MapShim.prototype.getBounds = function () {
        var b = this._leaflet.getBounds();
        return [
            [b.getSouth(), b.getWest()],
            [b.getNorth(), b.getEast()]
        ];
    };
    MapShim.prototype.setBounds = function (bounds, opts) {
        if (!bounds || bounds.length < 2) return this;
        var sw = latLngFromYandex(bounds[0]);
        var ne = latLngFromYandex(bounds[1]);
        if (!sw || !ne) return this;
        var padding = 0;
        if (opts && opts.zoomMargin != null) padding = Number(opts.zoomMargin) || 0;
        this._leaflet.fitBounds(L.latLngBounds(sw, ne), {
            padding: [padding, padding],
            animate: !!(opts && opts.duration)
        });
        return this;
    };
    MapShim.prototype.getType = function () {
        return this._type;
    };
    MapShim.prototype.setType = function (type) {
        var next = type || this._type;
        if (next === this._type && (next !== 'leaflet#orthophoto' || this._basemapLayer)) {
            this.events.fire('typechange', { target: this });
            return this;
        }
        this._applyBasemapType(next);
        return this;
    };
    MapShim.prototype.destroy = function () {
        try { this._leaflet.remove(); } catch (e) {}
    };

    // Approximate converter used by some modules
    MapShim.prototype.converter = {
        globalToPage: function () { return [0, 0]; },
        pageToGlobal: function () { return [0, 0]; }
    };

    var ymapsShim = {
        ready: function (cb) {
            if (typeof cb !== 'function') return;
            if (readyFired) {
                setTimeout(cb, 0);
            } else {
                readyQueue.push(cb);
            }
        },
        Map: MapShim,
        Placemark: Placemark,
        Polyline: Polyline,
        Polygon: Polygon,
        GeoObjectCollection: GeoObjectCollection,
        templateLayoutFactory: {
            createClass: function () {
                return function () {};
            }
        },
        projection: {
            wgs84Mercator: {
                toGlobalPixels: toGlobalPixels,
                fromGlobalPixels: function (pixels, zoom) {
                    var scale = Math.pow(2, zoom) / (2 * Math.PI * EARTH) * 256;
                    var x = pixels[0] / scale - Math.PI * EARTH;
                    var y = Math.PI * EARTH - pixels[1] / scale;
                    var lon = x / EARTH * 180 / Math.PI;
                    var lat = (2 * Math.atan(Math.exp(y / EARTH)) - Math.PI / 2) * 180 / Math.PI;
                    return [lat, lon];
                }
            }
        },
        meta: { engine: 'leaflet-shim' }
    };

    global.ymaps = ymapsShim;
    global.LeafletYmapsShim = {
        install: function () {
            global.ymaps = ymapsShim;
            fireReady();
        },
        Map: MapShim
    };

    // CSS helpers
    if (!document.getElementById('volsmapLeafletShimCss')) {
        var style = document.createElement('style');
        style.id = 'volsmapLeafletShimCss';
        style.textContent = [
            '.volsmap-leaflet-div-icon{background:transparent;border:0;}',
            '.leaflet-container{background:#1a1f2e;font:inherit;}',
            '#map.leaflet-container{width:100%;height:100%;}'
        ].join('');
        document.head.appendChild(style);
    }

    fireReady();
})(typeof window !== 'undefined' ? window : this);
