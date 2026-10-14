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

    function isOptionVisible(val) {
        return !(val === false || val === 0 || val === 'false' || val === '0');
    }

    /** Как ymaps options.visible: скрыть/показать слой, не отвязывая geoObject от коллекции. */
    function applyGeoObjectVisibility(geoObj) {
        if (!geoObj) return;
        var map = geoObj._map;
        if (!map || !map._leaflet) return;
        var layer = geoObj._layer || (geoObj._ensureLayer ? geoObj._ensureLayer() : null);
        if (!layer) return;
        var visible = geoObj.options ? geoObj.options.get('visible') : true;
        if (!isOptionVisible(visible)) {
            if (map._leaflet.hasLayer(layer)) {
                try { map._leaflet.removeLayer(layer); } catch (eRm) {}
            }
            try {
                if (typeof layer.setStyle === 'function') {
                    layer.setStyle({ opacity: 0, fillOpacity: 0 });
                }
                if (typeof layer.setOpacity === 'function') layer.setOpacity(0);
                if (layer.getElement) {
                    var elHide = layer.getElement();
                    if (elHide) {
                        elHide.style.display = 'none';
                        elHide.style.visibility = 'hidden';
                    }
                }
            } catch (eHide) {}
            return;
        }
        if (!map._leaflet.hasLayer(layer)) {
            try { layer.addTo(map._leaflet); } catch (eAdd) {}
        }
        try {
            if (typeof layer.setOpacity === 'function') {
                var op = geoObj.options.get('opacity');
                layer.setOpacity(op != null ? Number(op) : 1);
            }
            if (typeof layer.setStyle === 'function') {
                syncPathOptions(layer, geoObj.options);
            }
            if (layer.getElement) {
                var elShow = layer.getElement();
                if (elShow) {
                    elShow.style.display = '';
                    elShow.style.visibility = '';
                }
            }
        } catch (eShow) {}
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

    /** ymaps.Circle([center, radiusMeters], props, options) */
    function GeometryCircle(centerAndRadius) {
        var c = Array.isArray(centerAndRadius) ? centerAndRadius : [centerAndRadius, 0];
        this._center = Array.isArray(c[0]) ? c[0].slice() : [0, 0];
        this._radius = Number(c[1]) || 0;
    }
    GeometryCircle.prototype.getCoordinates = function () {
        return [this._center.slice(), this._radius];
    };
    GeometryCircle.prototype.setCoordinates = function (centerAndRadius) {
        var c = Array.isArray(centerAndRadius) ? centerAndRadius : [centerAndRadius, this._radius];
        this._center = Array.isArray(c[0]) ? c[0].slice() : this._center;
        if (c[1] != null) this._radius = Number(c[1]) || 0;
        this._syncLayer();
        return this;
    };
    GeometryCircle.prototype.getRadius = function () {
        return this._radius;
    };
    GeometryCircle.prototype.setRadius = function (r) {
        this._radius = Number(r) || 0;
        this._syncLayer();
        return this;
    };
    GeometryCircle.prototype.getType = function () { return 'Circle'; };
    GeometryCircle.prototype._syncLayer = function () {
        if (!this._owner || !this._owner._layer) return;
        var ll = latLngFromYandex(this._center);
        if (ll) this._owner._layer.setLatLng(ll);
        this._owner._layer.setRadius(this._radius);
    };

    function Circle(centerAndRadius, properties, options) {
        this.properties = new DataBag(properties || {});
        this.options = new DataBag(options || {});
        this.events = new EventManager(this);
        this.geometry = new GeometryCircle(centerAndRadius);
        this.geometry._owner = this;
        this._map = null;
        this._parent = null;
        this._layer = null;
        this._type = 'Circle';
        var self = this;
        this.options._emitChange = function () {
            syncPathOptions(self._layer, self.options);
            applyGeoObjectVisibility(self);
        };
    }
    Circle.prototype._ensureLayer = function () {
        if (this._layer) return this._layer;
        var ll = latLngFromYandex(this.geometry._center) || L.latLng(0, 0);
        this._layer = L.circle(ll, Object.assign(pathStyleFromOptions(this.options.getAll()), {
            radius: this.geometry._radius
        }));
        bindLayerEvents(this, this._layer);
        return this._layer;
    };
    bindParentApi(Circle.prototype);

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

        var bootType = (state && state.type) || global.VolsmapBootBasemapType || 'leaflet#orthophoto';
        if (String(bootType).indexOf('leaflet#') !== 0) bootType = 'leaflet#orthophoto';
        this._type = bootType;
        this._basemapLayer = null; // legacy alias → первый слой стека
        this._altLayer = null;
        this._basemapStack = []; // активные слои подложки (взаимоисключающие)
        this._basemapLoadId = 0;
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

        if (this._type === 'leaflet#orthophoto') {
            this._loadBasemap();
        } else {
            this._applyBasemapType(this._type);
        }

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
        var loadId = (this._basemapLoadId = (this._basemapLoadId || 0) + 1);
        var token = this._authToken();
        var headers = {};
        if (token) headers.Authorization = 'Bearer ' + token;
        fetch(this._apiBase() + '/api/basemap/active', { headers: headers })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (data) {
                // Пользователь уже ушёл на Яндекс/OSM — не возвращаем ортофото поверх.
                if (loadId !== self._basemapLoadId) return;
                if (self._type && self._type !== 'leaflet#orthophoto') return;
                if (!data || !data.packId) {
                    try { global._volsmapHasActiveBasemap = false; } catch (eNo) {}
                    self._showNoBasemapBanner(true);
                    return;
                }
                self._showNoBasemapBanner(false);
                self.setBasemapPack(data);
            })
            .catch(function () {
                if (loadId !== self._basemapLoadId) return;
                if (self._type && self._type !== 'leaflet#orthophoto') return;
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

    /** Снять ВСЕ слои подложки (ортофото и Яндекс независимы — на карте только один набор). */
    MapShim.prototype._clearBasemapStack = function () {
        var map = this._leaflet;
        var stack = this._basemapStack || [];
        for (var i = 0; i < stack.length; i++) {
            try {
                if (map && map.hasLayer(stack[i])) map.removeLayer(stack[i]);
            } catch (e) {}
        }
        this._basemapStack = [];
        this._basemapLayer = null;
        this._altLayer = null;
        try {
            var root = map && map.getContainer();
            if (root) {
                var nodes = root.querySelectorAll('.leaflet-yandex-api-basemap');
                for (var j = 0; j < nodes.length; j++) {
                    if (nodes[j].parentNode) nodes[j].parentNode.removeChild(nodes[j]);
                }
            }
        } catch (e2) {}
    };

    MapShim.prototype._clearAltLayer = function () {
        this._clearBasemapStack();
    };

    MapShim.prototype._clearBasemapLayer = function () {
        this._clearBasemapStack();
    };

    MapShim.prototype._clearMaxBounds = function () {
        try {
            this._leaflet.setMaxBounds(null);
            if (this._leaflet.options) this._leaflet.options.maxBounds = null;
        } catch (e) {}
    };

    /**
     * Включить ровно один тип подложки. Предыдущий набор полностью снимается.
     * @param {string} type
     * @param {object} [ctx] контекст для ортофото (tileUrl, …)
     */
    MapShim.prototype._setBasemapStack = function (type, ctx) {
        var stackApi = global.VolsmapBasemapStack;
        if (!stackApi || typeof stackApi.createLayersForType !== 'function') {
            console.error('[LeafletYmaps] VolsmapBasemapStack не загружен');
            return;
        }
        this._basemapLoadId = (this._basemapLoadId || 0) + 1;
        this._type = type || 'leaflet#none';
        this._showNoBasemapBanner(false);
        this._clearMaxBounds();
        this._clearBasemapStack();

        var layers = stackApi.createLayersForType(this._type, ctx || {}) || [];
        for (var i = 0; i < layers.length; i++) {
            try {
                layers[i].addTo(this._leaflet);
                this._basemapStack.push(layers[i]);
            } catch (eAdd) {
                console.warn('[LeafletYmaps] basemap add failed', eAdd);
            }
        }
        // совместимость со старым кодом
        this._basemapLayer = this._type === 'leaflet#orthophoto' ? (this._basemapStack[0] || null) : null;
        this._altLayer = this._type !== 'leaflet#orthophoto' ? (this._basemapStack[0] || null) : null;

        this.events.fire('typechange', { target: this });
        this.events.fire('tilesload', { target: this });
    };

    MapShim.prototype.setBasemapPack = function (manifest) {
        if (!manifest || !manifest.packId) return;
        this._lastManifest = manifest;
        this._packId = manifest.packId;
        try { global._volsmapHasActiveBasemap = true; } catch (eFlag) {}
        // Пакет ортофото только запоминаем, если сейчас другой слой — не навязываем
        if (this._type && this._type !== 'leaflet#orthophoto') {
            return;
        }
        var nativeMin = manifest.minZoom != null ? Number(manifest.minZoom) : 0;
        var nativeMax = manifest.maxZoom != null ? Number(manifest.maxZoom) : 18;
        if (!Number.isFinite(nativeMin)) nativeMin = 0;
        if (!Number.isFinite(nativeMax)) nativeMax = 18;
        var ctx = {
            tileUrl: this._tileUrl(manifest.packId),
            minNativeZoom: nativeMin,
            maxNativeZoom: nativeMax,
            tms: !!manifest.tms
        };
        if (manifest.bounds && Array.isArray(manifest.bounds) && manifest.bounds.length === 2) {
            ctx.bounds = L.latLngBounds(manifest.bounds[0], manifest.bounds[1]);
        }
        this._setBasemapStack('leaflet#orthophoto', ctx);
        try {
            this._leaflet.setMinZoom(0);
            this._leaflet.setMaxZoom(21);
        } catch (eZoomLim) {}
        if (ctx.bounds) {
            try {
                this._leaflet.setMaxBounds(ctx.bounds.pad(0.2));
            } catch (e2) {}
        }
    };

    MapShim.prototype._setAltBasemapLayer = function (layer, type) {
        // совместимость: один слой через общий стек
        this._basemapLoadId = (this._basemapLoadId || 0) + 1;
        this._type = type || 'leaflet#none';
        this._showNoBasemapBanner(false);
        this._clearMaxBounds();
        this._clearBasemapStack();
        if (layer) {
            try {
                layer.addTo(this._leaflet);
                this._basemapStack.push(layer);
            } catch (e) {}
            this._altLayer = layer;
        }
        this.events.fire('typechange', { target: this });
        this.events.fire('tilesload', { target: this });
    };

    MapShim.prototype._applyBasemapType = function (type) {
        var next = type || 'leaflet#orthophoto';
        if (next === 'leaflet#orthophoto') {
            this._basemapLoadId = (this._basemapLoadId || 0) + 1;
            this._type = 'leaflet#orthophoto';
            this._clearBasemapStack();
            if (this._lastManifest && this._lastManifest.packId) {
                this.setBasemapPack(this._lastManifest);
                return;
            }
            this._loadBasemap();
            this.events.fire('typechange', { target: this });
            return;
        }
        // Все остальные типы — независимые фабрики VolsmapBasemapStack
        this._setBasemapStack(next, {});
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
        // Яндекс-слои — через независимый нативный рантайм (не смешивать в Leaflet)
        if (String(next).indexOf('yandex#') === 0 &&
            !this._runtimeRedirect &&
            global.MapRuntime && typeof global.MapRuntime.applyBasemapType === 'function') {
            try {
                var dual = typeof MapEngine !== 'undefined' && MapEngine.isDualMode && MapEngine.isDualMode();
                if (dual) {
                    this._runtimeRedirect = true;
                    try {
                        global.MapRuntime.applyBasemapType(next);
                    } finally {
                        this._runtimeRedirect = false;
                    }
                    return this;
                }
            } catch (eDual) {
                this._runtimeRedirect = false;
            }
        }
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
        Circle: Circle,
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

    global.__ymapsShim = ymapsShim;
    global.LeafletYmapsShim = {
        install: function () {
            global.VolsmapShimPassive = false;
            global.__ymapsShim = ymapsShim;
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

    // Passive: dual-boot на нативном Яндексе — шим только в __ymapsShim, не трогаем window.ymaps
    if (global.VolsmapShimPassive) {
        // no-op for global ymaps / ready — нативный API уже ведёт карту
    } else {
        global.ymaps = ymapsShim;
        fireReady();
    }
})(typeof window !== 'undefined' ? window : this);
