/**
 * Регионы карты: полигоны, подсчёт объектов внутри, скрытие региона и содержимого.
 */
(function (global) {
    var DEFAULT_FILL = '#3b82f6';
    var DEFAULT_STROKE = '#2563eb';
    var DEFAULT_FILL_OPACITY = 0.22;
    var REGION_Z_INDEX = 1;
    var REGION_LABEL_Z_INDEX = 3;

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
        'support', 'sleeve', 'cross', 'node', 'attachment', 'manhole', 'signalPost',
        'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'switch'
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

    function getHiddenRegions(objects) {
        return getAllRegions(objects).filter(function (r) { return !isRegionVisible(r); });
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

    function isCoordInAnyHiddenRegion(coord, objects) {
        if (!coord) return false;
        var hidden = getHiddenRegions(objects);
        for (var i = 0; i < hidden.length; i++) {
            var ring = getRegionRing(hidden[i]);
            if (ring.length >= 3 && pointInPolygon(coord, ring)) return true;
        }
        return false;
    }

    function isObjectInAnyHiddenRegion(obj, objects) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        if (type === 'region' || type === 'cableLabel' || type === 'regionLabel') return false;
        if (type === 'cable') return isCableInAnyHiddenRegion(obj, objects);
        return isCoordInAnyHiddenRegion(getObjectCoords(obj), objects);
    }

    function isCableInAnyHiddenRegion(cable, objects) {
        var coords = getCableCoords(cable);
        for (var i = 0; i < coords.length; i++) {
            if (isCoordInAnyHiddenRegion(coords[i], objects)) return true;
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

    function buildRegionLabelHtml(name, fillColor, strokeColor, layout) {
        var esc = typeof global.escapeHtml === 'function' ? global.escapeHtml : function (s) {
            return String(s == null ? '' : s);
        };
        layout = layout || {};
        var text = esc(layout.text != null ? layout.text : ((name && String(name).trim()) ? name : 'Регион'));
        var bg = fillColor || DEFAULT_FILL;
        var border = strokeColor || DEFAULT_STROKE;
        var maxW = layout.maxWidthPx != null ? layout.maxWidthPx : 200;
        var fs = layout.fontSizePx != null ? layout.fontSizePx : 13;
        var style = '--region-label-bg:' + bg + ';--region-label-border:' + border +
            ';max-width:' + maxW + 'px;font-size:' + fs + 'px;width:' + maxW + 'px;';
        return '<div class="region-map-label" style="' + style + '"><span class="region-map-label__text">' + text + '</span></div>';
    }

    function removeRegionLabel(regionObj, map) {
        if (!regionObj || !regionObj.properties) return;
        var label = regionObj.properties.get('regionLabel');
        if (!label) return;
        map = map || global.myMap;
        if (map) {
            try { map.geoObjects.remove(label); } catch (e) {}
        }
        regionObj.properties.unset('regionLabel');
    }

    function updateRegionLabel(regionObj, map) {
        map = map || global.myMap;
        if (!regionObj || !regionObj.properties || !map || typeof ymaps === 'undefined') return;
        if (regionObj.properties.get('_detachedForGeometryEdit')) {
            removeRegionLabel(regionObj, map);
            return;
        }
        var ring = getRegionRing(regionObj);
        var center = getRegionLabelCenter(ring);
        if (!center) {
            removeRegionLabel(regionObj, map);
            return;
        }
        var name = regionObj.properties.get('name') || '';
        var fill = regionObj.properties.get('fillColor') || DEFAULT_FILL;
        var stroke = regionObj.properties.get('strokeColor') || DEFAULT_STROKE;
        var layout = getRegionLabelLayout(map, ring, name);
        var html = buildRegionLabelHtml(name, fill, stroke, layout);
        var label = regionObj.properties.get('regionLabel');
        var regionVisible = regionObj.options ? regionObj.options.get('visible') !== false : true;
        var labelVisible = regionVisible && !layout.hide;

        if (!label) {
            label = new ymaps.Placemark(center, {}, {
                iconLayout: 'default#imageWithContent',
                iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
                iconImageSize: [1, 1],
                iconImageOffset: [0, 0],
                iconContent: html,
                iconContentOffset: [0, 0],
                zIndex: REGION_LABEL_Z_INDEX,
                visible: labelVisible,
                interactive: false,
                cursor: 'default',
                hasBalloon: false,
                hasHint: false
            });
            label.properties.set('type', 'regionLabel');
            label.properties.set('parentRegionId', regionObj.properties.get('uniqueId'));
            map.geoObjects.add(label);
            regionObj.properties.set('regionLabel', label);
        } else {
            label.properties.set({ iconContent: html });
            try { label.geometry.setCoordinates(center); } catch (eC) {}
            try {
                label.options.set('zIndex', REGION_LABEL_Z_INDEX);
                label.options.set('visible', labelVisible);
            } catch (eO) {}
        }
    }

    function syncAllRegionLabels(map, objectList) {
        if (!map || !Array.isArray(objectList)) return;
        getAllRegions(objectList).forEach(function (regionObj) {
            updateRegionLabel(regionObj, map);
        });
    }

    function isMapObjectShown(obj) {
        if (!obj || !obj.options) return true;
        try { return obj.options.get('visible') !== false; } catch (e) { return true; }
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
            lineGroups.nodeConnectionLines
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
        getHiddenRegions: getHiddenRegions,
        collectObjectsInRegion: collectObjectsInRegion,
        isObjectInAnyHiddenRegion: isObjectInAnyHiddenRegion,
        isCableInAnyHiddenRegion: isCableInAnyHiddenRegion,
        getPolygonOptions: getPolygonOptions,
        applyRegionStyle: applyRegionStyle,
        updateRegionLabel: updateRegionLabel,
        removeRegionLabel: removeRegionLabel,
        syncAllRegionLabels: syncAllRegionLabels,
        sendRegionToMapBack: sendRegionToMapBack,
        sendAllRegionsToMapBack: sendAllRegionsToMapBack,
        syncConnectionLinesVisibility: syncConnectionLinesVisibility,
        countSummaryText: countSummaryText
    };
})(typeof window !== 'undefined' ? window : this);
