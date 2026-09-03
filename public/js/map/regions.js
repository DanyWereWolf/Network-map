/**
 * Регионы карты: полигоны, подсчёт объектов внутри, скрытие региона и содержимого.
 */
(function (global) {
    var DEFAULT_FILL = '#3b82f6';
    var DEFAULT_STROKE = '#2563eb';
    var DEFAULT_FILL_OPACITY = 0.22;
    var REGION_Z_INDEX = 1;
    var REGION_LABEL_Z_INDEX = 3;
    // Cache: getHiddenRegions used to re-scan all objects on every object check → O(n²) in applyMapFilter.
    var _hiddenRegionsCache = null;
    var _hiddenRegionsCacheToken = null;
    var _hiddenRegionsCacheGen = 0;

    function svgEscapeText(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function svgEscapeAttr(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
    }

    function readCssVar(name, fallback) {
        try {
            var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return value || fallback;
        } catch (e) {
            return fallback;
        }
    }

    function hexToRgb(hex) {
        if (!hex) return null;
        var value = String(hex).trim().replace('#', '');
        if (value.length === 3) {
            value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
        }
        if (!/^[0-9a-f]{6}$/i.test(value)) return null;
        return {
            r: parseInt(value.slice(0, 2), 16),
            g: parseInt(value.slice(2, 4), 16),
            b: parseInt(value.slice(4, 6), 16)
        };
    }

    function regionLabelBackground(fillColor) {
        var rgb = hexToRgb(fillColor || DEFAULT_FILL);
        if (!rgb) return 'rgba(59, 130, 246, 0.92)';
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var mix = isDark ? 0.28 : 0.2;
        var base = isDark ? 15 : 255;
        var r = Math.round(rgb.r * mix + base * (1 - mix));
        var g = Math.round(rgb.g * mix + (isDark ? 23 : 255) * (1 - mix));
        var b = Math.round(rgb.b * mix + (isDark ? 42 : 255) * (1 - mix));
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (isDark ? 0.88 : 0.93) + ')';
    }

    /** SVG-иконка подписи — тот же подход, что у курсоров коллег (default#image, без HTML). */
    function buildRegionNameIcon(name, fillColor, strokeColor, layout) {
        layout = layout || {};
        var text = layout.text != null ? layout.text : ((name && String(name).trim()) ? String(name).trim() : 'Регион');
        var fs = layout.fontSizePx || 13;
        var maxW = layout.maxWidthPx || 200;
        var padX = 10;
        var padY = 4;
        var charFactor = /[а-яёА-ЯЁ]/.test(text) ? 0.58 : 0.52;
        var innerW = Math.min(maxW - padX * 2, Math.ceil(text.length * fs * charFactor));
        var width = Math.min(maxW, innerW + padX * 2);
        var height = Math.ceil(fs * 1.25) + padY * 2;
        var bg = regionLabelBackground(fillColor);
        var border = strokeColor || DEFAULT_STROKE;
        var textColor = readCssVar('--text-primary', '#0f172a');
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
            '<rect x="1" y="1" width="' + (width - 2) + '" height="' + (height - 2) + '" rx="8" fill="' + svgEscapeAttr(bg) + '" stroke="' + svgEscapeAttr(border) + '" stroke-width="2" stroke-opacity="0.5"/>' +
            '<text x="' + (width / 2) + '" y="' + (height / 2 + fs * 0.35) + '" text-anchor="middle" fill="' + svgEscapeAttr(textColor) + '" font-size="' + fs + '" font-weight="700" font-family="DM Sans, system-ui, sans-serif">' + svgEscapeText(text) + '</text>' +
            '</svg>';
        return {
            svg: svg,
            size: [width, height],
            hotspot: [width / 2, height / 2]
        };
    }

    function regionNameIconDataUrl(icon) {
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(icon.svg)));
    }

    function isStrayRegionNamePlacemark(obj) {
        if (!obj || !obj.properties) return false;
        if (obj.properties.get('type') === 'regionLabel') return true;
        if (obj.properties.get('parentRegionId')) return true;
        try {
            var layout = obj.options && obj.options.get('iconLayout');
            if (layout === 'default#imageWithContent') {
                var optIc = obj.options.get('iconContent');
                if (typeof optIc === 'string' && optIc.indexOf('region-map-label') !== -1) return true;
            }
            var propIc = obj.properties.get('iconContent');
            if (typeof propIc === 'string' && propIc.indexOf('region-map-label') !== -1) return true;
        } catch (eIc) {}
        return false;
    }

    function stripPlacemarkHtmlContent(pm) {
        if (!pm) return;
        try {
            if (pm.options && typeof pm.options.unset === 'function') {
                pm.options.unset('iconContent');
            }
        } catch (e1) {}
        try {
            if (pm.properties && typeof pm.properties.unset === 'function') {
                pm.properties.unset('iconContent');
            }
        } catch (e2) {}
    }

    function purgeLegacyRegionNameDom() {
        var mapEl = document.getElementById('map');
        if (!mapEl) return;
        mapEl.querySelectorAll('.region-map-label').forEach(function (el) {
            try { el.parentNode.removeChild(el); } catch (e) {}
        });
    }

    function forEachMapGeoObject(map, callback) {
        if (!map || !map.geoObjects || typeof callback !== 'function') return;
        function walk(collection) {
            if (!collection) return;
            try {
                if (typeof collection.each === 'function') {
                    collection.each(function (obj) {
                        callback(obj);
                        if (obj && obj.geoObjects) walk(obj.geoObjects);
                    });
                    return;
                }
            } catch (eEach) {}
            try {
                var len = typeof collection.getLength === 'function' ? collection.getLength() : 0;
                for (var i = 0; i < len; i++) {
                    var obj = collection.get(i);
                    callback(obj, i);
                    if (obj && obj.geoObjects) walk(obj.geoObjects);
                }
            } catch (eLen) {}
        }
        walk(map.geoObjects);
    }

    function sendRegionToMapBack(regionObj, map) {
        if (!regionObj || !map) return;
        if (regionObj.properties && regionObj.properties.get('_detachedForGeometryEdit')) return;
        try {
            map.geoObjects.remove(regionObj);
            map.geoObjects.add(regionObj, 0);
        } catch (e) {}
    }

    function sendAllRegionsToMapBack(map, objectList) {
        if (!map || !Array.isArray(objectList)) return;
        var regions = getAllRegions(objectList);
        for (var i = regions.length - 1; i >= 0; i--) {
            sendRegionToMapBack(regions[i], map);
        }
    }

    var PLACEMARK_TYPES = [
        'support', 'sleeve', 'spliceCassette', 'cross', 'node', 'attachment', 'manhole', 'signalPost',
        'cabinet', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'switch'
    ];

    function normalizeRing(ring) {
        if (!Array.isArray(ring)) return [];
        var out = [];
        for (var i = 0; i < ring.length; i++) {
            var c = ring[i];
            if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
                out.push([c[0], c[1]]);
            }
        }
        if (out.length >= 2) {
            var first = out[0];
            var last = out[out.length - 1];
            if (first[0] === last[0] && first[1] === last[1]) out.pop();
        }
        return out.length >= 3 ? out : [];
    }

    function getRegionRing(regionObj) {
        if (!regionObj || !regionObj.geometry) return [];
        var coords;
        try { coords = regionObj.geometry.getCoordinates(); } catch (e) { return []; }
        if (!coords || !coords.length) return [];
        if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
            return normalizeRing(coords[0]);
        }
        return normalizeRing(coords);
    }

    function pointInPolygon(latLon, ring) {
        var ringNorm = normalizeRing(ring);
        if (!latLon || ringNorm.length < 3) return false;
        var lat = latLon[0];
        var lon = latLon[1];
        var inside = false;
        for (var i = 0, j = ringNorm.length - 1; i < ringNorm.length; j = i++) {
            var lati = ringNorm[i][0];
            var loni = ringNorm[i][1];
            var latj = ringNorm[j][0];
            var lonj = ringNorm[j][1];
            if (((loni > lon) !== (lonj > lon)) &&
                (lat < (latj - lati) * (lon - loni) / (lonj - loni) + lati)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function getAllRegions(objects) {
        if (!Array.isArray(objects)) return [];
        return objects.filter(function (o) {
            return o && o.properties && o.properties.get('type') === 'region';
        });
    }

    function isRegionVisible(regionObj) {
        if (!regionObj || !regionObj.properties) return true;
        return regionObj.properties.get('regionVisible') !== false;
    }

    function isRegionFillVisible(regionObj) {
        if (!regionObj || !regionObj.properties) return true;
        return regionObj.properties.get('regionFillVisible') !== false;
    }

    function invalidateHiddenRegionsCache() {
        _hiddenRegionsCache = null;
        _hiddenRegionsCacheToken = null;
        _hiddenRegionsCacheGen++;
    }

    function getHiddenRegions(objects) {
        var token = objects;
        if (_hiddenRegionsCache && _hiddenRegionsCacheToken === token) return _hiddenRegionsCache;
        _hiddenRegionsCacheToken = token;
        _hiddenRegionsCache = getAllRegions(objects).filter(function (r) { return !isRegionVisible(r); });
        return _hiddenRegionsCache;
    }

    function hasAnyHiddenRegion(objects) {
        return getHiddenRegions(objects).length > 0;
    }

    function getObjectCoords(obj) {
        if (!obj || !obj.geometry) return null;
        try {
            var c = obj.geometry.getCoordinates();
            return c && c.length >= 2 ? c : null;
        } catch (e) {
            return null;
        }
    }

    function getCableCoords(cable) {
        if (!cable || !cable.geometry) return [];
        try {
            var geom = cable.geometry.getCoordinates();
            if (!Array.isArray(geom)) return [];
            return geom.filter(function (c) { return c && c.length >= 2; });
        } catch (e) {
            return [];
        }
    }

    function isPlacemarkInRing(obj, ring) {
        var c = getObjectCoords(obj);
        return c ? pointInPolygon(c, ring) : false;
    }

    function isCableInRing(cable, ring) {
        var coords = getCableCoords(cable);
        for (var i = 0; i < coords.length; i++) {
            if (pointInPolygon(coords[i], ring)) return true;
        }
        return false;
    }

    function isCoordInAnyHiddenRegion(coord, objects, hiddenOverride) {
        if (!coord) return false;
        var hidden = hiddenOverride || getHiddenRegions(objects);
        if (!hidden || !hidden.length) return false;
        for (var i = 0; i < hidden.length; i++) {
            var ring = getRegionRing(hidden[i]);
            if (ring.length >= 3 && pointInPolygon(coord, ring)) return true;
        }
        return false;
    }

    function isObjectInAnyHiddenRegion(obj, objects, hiddenOverride) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        if (type === 'region' || type === 'cableLabel' || type === 'regionLabel') return false;
        var hidden = hiddenOverride || getHiddenRegions(objects);
        if (!hidden || !hidden.length) return false;
        if (type === 'cable') return isCableInAnyHiddenRegion(obj, objects, hidden);
        return isCoordInAnyHiddenRegion(getObjectCoords(obj), objects, hidden);
    }

    function isCableInAnyHiddenRegion(cable, objects, hiddenOverride) {
        var hidden = hiddenOverride || getHiddenRegions(objects);
        if (!hidden || !hidden.length) return false;
        var coords = getCableCoords(cable);
        for (var i = 0; i < coords.length; i++) {
            if (isCoordInAnyHiddenRegion(coords[i], objects, hidden)) return true;
        }
        return false;
    }

    function collectObjectsInRegion(regionObj, objects) {
        var ring = getRegionRing(regionObj);
        var result = {
            placemarks: [],
            cables: [],
            counts: {},
            total: 0
        };
        if (ring.length < 3 || !Array.isArray(objects)) return result;

        objects.forEach(function (obj) {
            if (!obj || !obj.properties) return;
            var type = obj.properties.get('type');
            if (type === 'region' || type === 'cableLabel') return;
            if (type === 'cable') {
                if (isCableInRing(obj, ring)) {
                    result.cables.push(obj);
                    result.counts.cable = (result.counts.cable || 0) + 1;
                    result.total++;
                }
                return;
            }
            if (PLACEMARK_TYPES.indexOf(type) === -1) return;
            if (isPlacemarkInRing(obj, ring)) {
                result.placemarks.push(obj);
                result.counts[type] = (result.counts[type] || 0) + 1;
                result.total++;
            }
        });
        return result;
    }

    function getPolygonOptions(fillColor, strokeColor, fillOpacity) {
        return {
            fillColor: fillColor || DEFAULT_FILL,
            strokeColor: strokeColor || DEFAULT_STROKE,
            strokeWidth: 2,
            fillOpacity: fillOpacity != null ? fillOpacity : DEFAULT_FILL_OPACITY,
            zIndex: REGION_Z_INDEX,
            cursor: 'default',
            draggable: false,
            interactive: false
        };
    }

    function applyRegionStyle(regionObj) {
        if (!regionObj || !regionObj.properties || !regionObj.options) return;
        var fill = regionObj.properties.get('fillColor') || DEFAULT_FILL;
        var stroke = regionObj.properties.get('strokeColor') || DEFAULT_STROKE;
        var opacity = regionObj.properties.get('fillOpacity');
        if (opacity == null || opacity === '') opacity = DEFAULT_FILL_OPACITY;
        if (!isRegionFillVisible(regionObj)) opacity = 0;
        try {
            regionObj.options.set('fillColor', fill);
            regionObj.options.set('strokeColor', stroke);
            regionObj.options.set('fillOpacity', parseFloat(opacity));
            regionObj.options.set('zIndex', REGION_Z_INDEX);
            regionObj.options.set('draggable', false);
            regionObj.options.set('interactive', false);
        } catch (e) {}
        updateRegionLabel(regionObj, global.myMap);
    }

    function getRegionLabelCenter(ring) {
        var ringNorm = normalizeRing(ring);
        if (ringNorm.length < 3) return null;
        var latSum = 0;
        var lonSum = 0;
        for (var i = 0; i < ringNorm.length; i++) {
            latSum += ringNorm[i][0];
            lonSum += ringNorm[i][1];
        }
        var center = [latSum / ringNorm.length, lonSum / ringNorm.length];
        if (pointInPolygon(center, ringNorm)) return center;
        var minLat = ringNorm[0][0];
        var maxLat = ringNorm[0][0];
        var minLon = ringNorm[0][1];
        var maxLon = ringNorm[0][1];
        for (var j = 1; j < ringNorm.length; j++) {
            if (ringNorm[j][0] < minLat) minLat = ringNorm[j][0];
            if (ringNorm[j][0] > maxLat) maxLat = ringNorm[j][0];
            if (ringNorm[j][1] < minLon) minLon = ringNorm[j][1];
            if (ringNorm[j][1] > maxLon) maxLon = ringNorm[j][1];
        }
        var boxCenter = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];
        return pointInPolygon(boxCenter, ringNorm) ? boxCenter : center;
    }

    function ringToPixelBox(map, ring) {
        if (!map || !ring || ring.length < 3) return null;
        var zoom = map.getZoom();
        if (typeof zoom !== 'number') return null;
        var proj = (typeof ymaps !== 'undefined' && ymaps.projection && ymaps.projection.wgs84Mercator)
            ? ymaps.projection.wgs84Mercator
            : null;
        if (!proj || typeof proj.toGlobalPixels !== 'function') return null;
        var center = map.getCenter();
        var size = map.container && map.container.getSize ? map.container.getSize() : null;
        if (!center || !size || size[0] <= 0 || size[1] <= 0) return null;

        var centerGp = proj.toGlobalPixels(center, zoom);
        var halfW = size[0] / 2;
        var halfH = size[1] / 2;
        var minX = Infinity;
        var minY = Infinity;
        var maxX = -Infinity;
        var maxY = -Infinity;

        for (var i = 0; i < ring.length; i++) {
            var gp = proj.toGlobalPixels(ring[i], zoom);
            var x = gp[0] - centerGp[0] + halfW;
            var y = gp[1] - centerGp[1] + halfH;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        if (!isFinite(minX)) return null;
        return {
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    function getRegionLabelLayout(map, ring, name) {
        var box = ringToPixelBox(map, ring);
        var text = (name && String(name).trim()) ? String(name).trim() : 'Регион';
        if (!box || box.width < 44 || box.height < 24) {
            return { hide: true, text: text };
        }

        var padX = 24;
        var innerMax = Math.max(28, Math.floor(box.width * 0.84) - padX);
        var maxHeight = Math.floor(box.height * 0.32);
        var fontSize = Math.max(9, Math.min(14, Math.floor(maxHeight * 0.52)));
        var charFactor = /[а-яёА-ЯЁ]/.test(text) ? 0.58 : 0.52;
        var estText = text.length * fontSize * charFactor;
        if (estText > innerMax) {
            fontSize = Math.max(9, Math.floor(innerMax / (text.length * charFactor)));
        }

        var totalWidth = Math.min(Math.floor(box.width * 0.84), Math.ceil(text.length * fontSize * charFactor) + padX);

        return {
            hide: false,
            text: text,
            maxWidthPx: totalWidth,
            fontSizePx: fontSize
        };
    }

    function createRegionNamePlacemark(center, icon, regionId) {
        var dataUrl = regionNameIconDataUrl(icon);
        var pm = new ymaps.Placemark(center, {}, {
            iconLayout: 'default#image',
            iconImageHref: dataUrl,
            iconImageSize: icon.size,
            iconImageOffset: [-icon.hotspot[0], -icon.hotspot[1]],
            zIndex: REGION_LABEL_Z_INDEX,
            visible: true,
            interactive: false,
            interactivityModel: 'default#transparent',
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        pm.properties.set('type', 'regionLabel');
        pm.properties.set('parentRegionId', regionId);
        return pm;
    }

    function detachRegionLabelFromMap(label, regionObj, map) {
        if (!label) return;
        stripPlacemarkHtmlContent(label);
        map = map || global.myMap;
        if (regionObj && regionObj.geoObjects) {
            try { regionObj.geoObjects.remove(label); } catch (e0) {}
        }
        if (map) {
            try { map.geoObjects.remove(label); } catch (e) {}
        }
    }

    function removeRegionLabel(regionObj, map) {
        if (!regionObj || !regionObj.properties) return;
        map = map || global.myMap;
        var label = regionObj.properties.get('regionLabel');
        if (label) {
            detachRegionLabelFromMap(label, regionObj, map);
            regionObj.properties.unset('regionLabel');
        }
        if (regionObj.geoObjects) {
            var attached = [];
            try {
                if (typeof regionObj.geoObjects.each === 'function') {
                    regionObj.geoObjects.each(function (child) {
                        if (isStrayRegionNamePlacemark(child)) attached.push(child);
                    });
                }
            } catch (eEach) {}
            attached.forEach(function (child) {
                detachRegionLabelFromMap(child, regionObj, map);
            });
        }
        purgeLegacyRegionNameDom();
    }

    function removeAllRegionLabelPlacemarks(map, objectList) {
        if (!map) return;
        if (Array.isArray(objectList)) {
            getAllRegions(objectList).forEach(function (regionObj) {
                removeRegionLabel(regionObj, map);
            });
        }
        var stray = [];
        forEachMapGeoObject(map, function (obj) {
            if (isStrayRegionNamePlacemark(obj)) stray.push(obj);
        });
        stray.forEach(function (obj) {
            detachRegionLabelFromMap(obj, null, map);
        });
        purgeLegacyRegionNameDom();
    }

    function removeErrantRegionObjectLabels(map, objectList) {
        if (!Array.isArray(objectList)) return;
        map = map || global.myMap;
        getAllRegions(objectList).forEach(function (regionObj) {
            var bogus = regionObj.properties.get('label');
            if (!bogus) return;
            detachRegionLabelFromMap(bogus, regionObj, map);
            regionObj.properties.unset('label');
        });
        purgeLegacyRegionNameDom();
    }

    function dedupeRegionLabels(map, objectList) {
        if (!map || !Array.isArray(objectList)) return;
        removeErrantRegionObjectLabels(map, objectList);
        removeAllRegionLabelPlacemarks(map, objectList);
        getAllRegions(objectList).forEach(function (regionObj) {
            updateRegionLabel(regionObj, map);
        });
    }

    function updateRegionLabel(regionObj, map) {
        map = map || global.myMap;
        if (!regionObj || !regionObj.properties || !map || typeof ymaps === 'undefined') return;

        removeRegionLabel(regionObj, map);

        if (regionObj.properties.get('_detachedForGeometryEdit')) return;

        var ring = getRegionRing(regionObj);
        var center = getRegionLabelCenter(ring);
        if (!center || !isFinite(center[0]) || !isFinite(center[1])) return;

        var name = regionObj.properties.get('name') || '';
        var fill = regionObj.properties.get('fillColor') || DEFAULT_FILL;
        var stroke = regionObj.properties.get('strokeColor') || DEFAULT_STROKE;
        var layout = getRegionLabelLayout(map, ring, name);
        var regionVisible = regionObj.options ? regionObj.options.get('visible') !== false : true;
        var labelVisible = regionVisible && !layout.hide;
        if (!labelVisible) return;

        var icon = buildRegionNameIcon(name, fill, stroke, layout);
        var regionId = regionObj.properties.get('uniqueId');
        var label = createRegionNamePlacemark(center, icon, regionId);
        map.geoObjects.add(label);
        regionObj.properties.set('regionLabel', label);
    }

    function rebuildAllRegionLabels(map, objectList) {
        dedupeRegionLabels(map, objectList);
    }

    function syncAllRegionLabels(map, objectList) {
        rebuildAllRegionLabels(map, objectList);
    }

    function purgeOrphanRegionLabelDom() {
        purgeLegacyRegionNameDom();
    }

    function migrateLegacyRegionLabels(map, objectList) {
        rebuildAllRegionLabels(map, objectList);
    }

    function isMapObjectShown(obj) {
        if (!obj) return true;
        try {
            if (obj.properties && obj.properties.get('_mapFilterVisible') === false) return false;
            if (!obj.options) return true;
            return obj.options.get('visible') !== false;
        } catch (e) { return true; }
    }

    function findObjectByUid(objects, uid) {
        if (!uid || !Array.isArray(objects)) return null;
        for (var i = 0; i < objects.length; i++) {
            var o = objects[i];
            if (o && o.properties && o.properties.get('uniqueId') === uid) return o;
        }
        return null;
    }

    function syncConnectionLinesVisibility(objects, lineGroups) {
        if (!lineGroups) return;
        var groups = [
            lineGroups.onuConnectionLines,
            lineGroups.oltConnectionLines,
            lineGroups.splitterConnectionLines,
            lineGroups.splitterOutputConnectionLines,
            lineGroups.nodeConnectionLines,
            lineGroups.radioBridgeConnectionLines
        ];
        groups.forEach(function (arr) {
            if (!Array.isArray(arr)) return;
            arr.forEach(function (line) {
                if (!line || !line.properties || !line.options) return;
                var visible = true;
                var routeIds = line.properties.get('routeIds');
                if (Array.isArray(routeIds)) {
                    for (var ri = 0; ri < routeIds.length; ri++) {
                        var wp = findObjectByUid(objects, routeIds[ri]);
                        if (wp && (!isMapObjectShown(wp) || isObjectInAnyHiddenRegion(wp, objects))) {
                            visible = false;
                            break;
                        }
                    }
                }
                var sleeveId = line.properties.get('sleeveId') || line.properties.get('crossId') || line.properties.get('fromId');
                if (visible && sleeveId) {
                    var src = findObjectByUid(objects, sleeveId);
                    if (src && (!isMapObjectShown(src) || isObjectInAnyHiddenRegion(src, objects))) visible = false;
                }
                var sourceId = line.properties.get('sourceId');
                if (visible && sourceId) {
                    var sourceObj = findObjectByUid(objects, sourceId);
                    if (sourceObj && (!isMapObjectShown(sourceObj) || isObjectInAnyHiddenRegion(sourceObj, objects))) visible = false;
                }
                var targetId = line.properties.get('targetId');
                if (visible && targetId) {
                    var targetObj = findObjectByUid(objects, targetId);
                    if (targetObj && (!isMapObjectShown(targetObj) || isObjectInAnyHiddenRegion(targetObj, objects))) visible = false;
                }
                var radioBridgeId = line.properties.get('radioBridgeId');
                if (visible && radioBridgeId) {
                    var rbObj = findObjectByUid(objects, radioBridgeId);
                    if (rbObj && (!isMapObjectShown(rbObj) || isObjectInAnyHiddenRegion(rbObj, objects))) visible = false;
                }
                if (visible && line.geometry) {
                    try {
                        var pts = line.geometry.getCoordinates();
                        if (Array.isArray(pts) && pts.length) {
                            if (isCoordInAnyHiddenRegion(pts[0], objects)) visible = false;
                            if (visible && isCoordInAnyHiddenRegion(pts[pts.length - 1], objects)) visible = false;
                        }
                    } catch (e) {}
                }
                try { line.options.set('visible', visible); } catch (e2) {}
            });
        });
    }

    function countSummaryText(counts, total) {
        if (!total) return 'Объектов внутри: 0';
        var parts = [];
        var labels = {
            node: 'узлы',
            cross: 'кроссы',
            sleeve: 'муфты',
            support: 'опоры',
            attachment: 'крепления',
            manhole: 'колодцы',
            signalPost: 'столбы',
            olt: 'OLT',
            splitter: 'сплиттеры',
            onu: 'ONU',
            camera: 'камеры',
            mediaConverter: 'медиаконв.',
            switch: 'коммут.',
            cable: 'кабели'
        };
        Object.keys(labels).forEach(function (key) {
            if (counts[key]) parts.push(counts[key] + ' ' + labels[key]);
        });
        return 'Внутри: ' + total + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    }

    global.MapRegions = {
        DEFAULT_FILL: DEFAULT_FILL,
        DEFAULT_STROKE: DEFAULT_STROKE,
        DEFAULT_FILL_OPACITY: DEFAULT_FILL_OPACITY,
        PLACEMARK_TYPES: PLACEMARK_TYPES,
        normalizeRing: normalizeRing,
        getRegionRing: getRegionRing,
        pointInPolygon: pointInPolygon,
        getAllRegions: getAllRegions,
        isRegionVisible: isRegionVisible,
        isRegionFillVisible: isRegionFillVisible,
        getHiddenRegions: getHiddenRegions,
        hasAnyHiddenRegion: hasAnyHiddenRegion,
        invalidateHiddenRegionsCache: invalidateHiddenRegionsCache,
        collectObjectsInRegion: collectObjectsInRegion,
        isObjectInAnyHiddenRegion: isObjectInAnyHiddenRegion,
        isCableInAnyHiddenRegion: isCableInAnyHiddenRegion,
        getPolygonOptions: getPolygonOptions,
        applyRegionStyle: applyRegionStyle,
        updateRegionLabel: updateRegionLabel,
        removeRegionLabel: removeRegionLabel,
        removeAllRegionLabelPlacemarks: removeAllRegionLabelPlacemarks,
        purgeOrphanRegionLabelDom: purgeOrphanRegionLabelDom,
        migrateLegacyRegionLabels: migrateLegacyRegionLabels,
        removeErrantRegionObjectLabels: removeErrantRegionObjectLabels,
        dedupeRegionLabels: dedupeRegionLabels,
        rebuildAllRegionLabels: rebuildAllRegionLabels,
        syncAllRegionLabels: syncAllRegionLabels,
        sendRegionToMapBack: sendRegionToMapBack,
        sendAllRegionsToMapBack: sendAllRegionsToMapBack,
        syncConnectionLinesVisibility: syncConnectionLinesVisibility,
        countSummaryText: countSummaryText
    };
})(typeof window !== 'undefined' ? window : this);
