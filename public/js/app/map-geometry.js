/**
 * Геометрия карты: hit-test, snap, прямоугольное выделение.
 */
function geoToClient(geoCoord) {
    if (!myMap || !geoCoord || geoCoord.length < 2) return null;
    try {
        const bounds = myMap.getBounds();
        if (!bounds || bounds.length < 2) return null;
        const rect = myMap.container.getElement().getBoundingClientRect();
        const minLat = Math.min(bounds[0][0], bounds[1][0]);
        const maxLat = Math.max(bounds[0][0], bounds[1][0]);
        const minLon = Math.min(bounds[0][1], bounds[1][1]);
        const maxLon = Math.max(bounds[0][1], bounds[1][1]);
        const lat = geoCoord[0];
        const lon = geoCoord[1];
        if (maxLat === minLat || maxLon === minLon) return null;
        const x = rect.left + (lon - minLon) / (maxLon - minLon) * rect.width;
        const y = rect.top + (maxLat - lat) / (maxLat - minLat) * rect.height;
        return [x, y];
    } catch (e) {
        return null;
    }
}

function clientToGeo(clientX, clientY) {
    if (!myMap) return null;
    try {
        const bounds = myMap.getBounds();
        if (!bounds || bounds.length < 2) return null;
        const rect = myMap.container.getElement().getBoundingClientRect();
        const minLat = Math.min(bounds[0][0], bounds[1][0]);
        const maxLat = Math.max(bounds[0][0], bounds[1][0]);
        const minLon = Math.min(bounds[0][1], bounds[1][1]);
        const maxLon = Math.max(bounds[0][1], bounds[1][1]);
        if (maxLat === minLat || maxLon === minLon) return null;
        const propX = (clientX - rect.left) / rect.width;
        const propY = (clientY - rect.top) / rect.height;
        const lon = minLon + propX * (maxLon - minLon);
        const lat = maxLat - propY * (maxLat - minLat);
        return [lat, lon];
    } catch (e) {
        return null;
    }
}

var rectSelectStart = null;
var rectSelectEnd = null;
var rectSelectOverlay = null;
var rectSelectPanel = null;

function setupRectSelection() {
    if (!myMap || !myMap.container) return;
    var container = myMap.container.getElement();
    var overlay = document.createElement('div');
    overlay.id = 'rectSelectOverlay';
    overlay.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);display:none;z-index:1000;';
    container.style.position = 'relative';
    container.appendChild(overlay);
    rectSelectOverlay = overlay;

    var panel = document.createElement('div');
    panel.id = 'rectSelectPanel';
    panel.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;box-shadow:var(--shadow-md);z-index:1001;display:none;flex-direction:column;gap:8px;pointer-events:auto;';
    var mapArea = document.getElementById('mapAreaWrapper') || document.getElementById('map');
    if (mapArea) {
        mapArea.style.position = 'relative';
        mapArea.appendChild(panel);
    }
    rectSelectPanel = panel;

    container.addEventListener('mousedown', function(e) {
        if (e.button !== 2) return;
        e.preventDefault();
        if (objectPlacementMode || currentCableTool || splitterFiberRoutingMode || radioBridgeRoutingMode || fiberRoutingMode || regionDrawMode) return;
        var geo = clientToGeo(e.clientX, e.clientY);
        if (!geo) return;
        rectSelectStart = { x: e.clientX, y: e.clientY, geo: geo };
        rectSelectEnd = null;
        overlay.style.left = (e.clientX - container.getBoundingClientRect().left) + 'px';
        overlay.style.top = (e.clientY - container.getBoundingClientRect().top) + 'px';
        overlay.style.width = '0';
        overlay.style.height = '0';
        overlay.style.display = 'block';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('wheel', onRectSelectWheel, { passive: false, capture: true });
    });

    var onRectSelectWheel = function(e) {
        if (rectSelectStart) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    var onMouseMove = function(e) {
        if (!rectSelectStart) return;
        e.preventDefault();
        var rect = container.getBoundingClientRect();
        var x1 = Math.min(rectSelectStart.x, e.clientX);
        var x2 = Math.max(rectSelectStart.x, e.clientX);
        var y1 = Math.min(rectSelectStart.y, e.clientY);
        var y2 = Math.max(rectSelectStart.y, e.clientY);
        overlay.style.left = (x1 - rect.left) + 'px';
        overlay.style.top = (y1 - rect.top) + 'px';
        overlay.style.width = (x2 - x1) + 'px';
        overlay.style.height = (y2 - y1) + 'px';
        rectSelectEnd = { x: e.clientX, y: e.clientY, geo: clientToGeo(e.clientX, e.clientY) };
    };

    var onMouseUp = function(e) {
        if (e.button !== 2) return;
        if (!rectSelectStart) return;
        e.preventDefault();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('wheel', onRectSelectWheel, { passive: false, capture: true });
        var geo2 = rectSelectEnd && rectSelectEnd.geo ? rectSelectEnd.geo : rectSelectStart.geo;
        var minLat = Math.min(rectSelectStart.geo[0], geo2[0]);
        var maxLat = Math.max(rectSelectStart.geo[0], geo2[0]);
        var minLon = Math.min(rectSelectStart.geo[1], geo2[1]);
        var maxLon = Math.max(rectSelectStart.geo[1], geo2[1]);
        var selected = getObjectsInRect(minLat, maxLat, minLon, maxLon);
        rectSelectStart = null;
        rectSelectEnd = null;
        overlay.style.display = 'none';

        if (selected.placemarks.length === 0 && selected.cables.length === 0) {
            return;
        }

        var counts = {};
        selected.placemarks.forEach(function(obj) {
            var t = obj.properties.get('type');
            if (t && t !== 'cableLabel') counts[t] = (counts[t] || 0) + 1;
        });
        counts.cable = selected.cables.length;

        var typeNames = { cross: 'Кроссов', node: 'Узлов', sleeve: 'Муфт', support: 'Опар', attachment: 'Креплений', olt: 'OLT', splitter: 'Сплиттеров', onu: 'ONU', camera: 'Камер', mediaConverter: 'Медиаконв.', cable: 'Кабелей' };
        var parts = [];
        Object.keys(counts).sort().forEach(function(k) {
            if (counts[k] > 0) parts.push(counts[k] + ' ' + (typeNames[k] || k));
        });
        panel.innerHTML = '<div style="font-size:0.875rem;color:var(--text-primary);margin-bottom:8px;">В выделенной области: ' + (parts.length ? parts.join(', ') : '—') + '</div>' +
            (isEditMode ? '<button type="button" class="btn-danger" id="rectSelectDeleteBtn" style="padding:8px 16px;font-size:0.875rem;">Удалить выделенное</button>' : '') +
            '<button type="button" class="btn-secondary" id="rectSelectCloseBtn" style="padding:8px 16px;font-size:0.875rem;">Закрыть</button>';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';

        var deleteBtn = document.getElementById('rectSelectDeleteBtn');
        if (deleteBtn && isEditMode) {
            deleteBtn.addEventListener('click', function() {
                var toDelete = selected.placemarks.concat(selected.cables);
                (async function() {
                    var hasGponHosts = toDelete.some(function(obj) {
                        if (!obj.properties) return false;
                        var t = obj.properties.get('type');
                        if (!isFiberHostType(t)) return false;
                        var imp = collectGponImpactFromHost(obj);
                        return imp && imp.hasGpon;
                    });
                    var bulkMsg = toDelete.length === 1
                        ? getDeleteObjectConfirmDetails(toDelete[0]).message
                        : 'Удалить выделенные объекты (' + toDelete.length + ')?';
                    if (toDelete.length > 1 && hasGponHosts) {
                        bulkMsg += '\n\nНа затронутых муфтах и кроссах будут сняты GPON-связи.';
                    }
                    if (typeof showConfirm === 'function') {
                        var ok = await showConfirm(bulkMsg, 'Удаление', { confirmText: 'Удалить', cancelText: 'Отмена' });
                        if (!ok) return;
                    }
                    toDelete.forEach(function(obj) {
                        var t = obj.properties ? obj.properties.get('type') : null;
                        if (t === 'cable') {
                            var uid = obj.properties.get('uniqueId');
                            if (uid) deleteCableByUniqueId(uid);
                            else {
                                myMap.geoObjects.remove(obj);
                                objects = objects.filter(function(o) { return o !== obj; });
                            }
                        } else {
                            var delOpts = { skipConfirmGpon: true };
                            if (isFiberHostType(t)) {
                                var imp = collectGponImpactFromHost(obj);
                                if (imp && imp.hasGpon) delOpts.gponImpact = imp;
                            }
                            deleteObject(obj, delOpts);
                        }
                    });
                    if (toDelete.length) {
                        saveData({ syncFull: true });
                        if (typeof showInfo === 'function') showInfo('Удалено объектов: ' + toDelete.length, 'Удаление');
                    }
                    panel.style.display = 'none';
                })();
            });
        }

        var closeBtn = document.getElementById('rectSelectCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                panel.style.display = 'none';
            });
        }
    };

    container.addEventListener('contextmenu', function(e) {
        if (rectSelectStart) e.preventDefault();
    });
}

function getObjectsInRect(minLat, maxLat, minLon, maxLon) {
    var placemarks = [];
    var cables = [];
    if (!objects || !Array.isArray(objects)) return { placemarks: placemarks, cables: cables };

    function inRect(lat, lon) {
        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    }

    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel') {
            if (type === 'cableLabel') return;
            var geom = obj.geometry && obj.geometry.getCoordinates ? obj.geometry.getCoordinates() : null;
            if (!geom) return;
            var flat = normalizeCableGeometry(geom);
            if (!flat) return;
            var anyIn = flat.some(function(p) { return inRect(p[0], p[1]); });
            if (anyIn) cables.push(obj);
        } else {
            var coords = obj.geometry && obj.geometry.getCoordinates ? obj.geometry.getCoordinates() : null;
            if (coords && coords.length >= 2 && inRect(coords[0], coords[1])) {
                placemarks.push(obj);
            }
        }
    });

    return { placemarks: placemarks, cables: cables };
}

function normalizeCableGeometry(geom) {
    if (!Array.isArray(geom) || geom.length < 2) return null;
    var flat = [];
    function add(c) {
        if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
            flat.push([c[0], c[1]]);
        }
    }
    for (var i = 0; i < geom.length; i++) {
        var p = geom[i];
        if (Array.isArray(p) && p.length >= 2) {
            if (typeof p[0] === 'number') add(p);
            else if (Array.isArray(p[0])) for (var j = 0; j < p.length; j++) add(p[j]);
        }
    }
    return flat.length >= 2 ? flat : null;
}

function findRefClosestToCoord(refs, coord, tolerance, preferCableEndpoint, preferredUniqueId) {
    if (!Array.isArray(refs) || !coord || coord.length < 2) return null;
    tolerance = tolerance || 0.0005;
    if (preferredUniqueId) {
        for (var rp = 0; rp < refs.length; rp++) {
            var op = refs[rp];
            if (!op || !op.properties) continue;
            if (op.properties.get('uniqueId') !== preferredUniqueId) continue;
            return op;
        }
    }
    var best = null, bestDist = tolerance;
    var bestEndpoint = null, bestEndpointDist = tolerance;
    for (var r = 0; r < refs.length; r++) {
        var o = refs[r];
        if (!o || !o.geometry) continue;
        var c = o.geometry.getCoordinates();
        if (!c || c.length < 2) continue;
        var d = Math.sqrt(Math.pow(c[0] - coord[0], 2) + Math.pow(c[1] - coord[1], 2));
        if (d >= tolerance) continue;
        var t = o.properties && o.properties.get('type');
        if (preferCableEndpoint && (isFiberHostType(t) || t === 'olt' || t === 'radioBridge')) {
            if (d < bestEndpointDist) { bestEndpointDist = d; bestEndpoint = o; }
        }
        if (d < bestDist) { bestDist = d; best = o; }
    }
    if (preferCableEndpoint && bestEndpoint) return bestEndpoint;
    return best;
}

function findObjectsAtGeometry(refs, geometry, tolerance) {
    var geom = normalizeCableGeometry(geometry) || (Array.isArray(geometry) ? geometry : null);
    if (!Array.isArray(refs) || !geom || geom.length < 2) return null;
    tolerance = tolerance || 0.0003;
    var points = [];
    var last = null;
    for (var g = 0; g < geom.length; g++) {
        var coord = geom[g];
        if (!coord || coord.length < 2) continue;
        var best = null, bestDist = tolerance;
        for (var r = 0; r < refs.length; r++) {
            var o = refs[r];
            if (!o || !o.geometry) continue;
            var c = o.geometry.getCoordinates();
            if (!c || c.length < 2) continue;
            var d = Math.sqrt(Math.pow(c[0] - coord[0], 2) + Math.pow(c[1] - coord[1], 2));
            if (d < bestDist) { bestDist = d; best = o; }
        }
        if (best && best !== last) {
            points.push(best);
            last = best;
        }
    }
    return points.length >= 2 ? points : null;
}

/** Восстанавливает цепочку объектов маршрута кабеля: приоритет у routeUniqueIds (опоры/крепления), иначе по вершинам геометрии. */
function buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords) {
    if (!Array.isArray(refs) || !item) return null;
    if (Array.isArray(item.routeUniqueIds) && item.routeUniqueIds.length >= 2) {
        var route = [];
        for (var ri = 0; ri < item.routeUniqueIds.length; ri++) {
            var ruid = item.routeUniqueIds[ri];
            var found = null;
            for (var r = 0; r < refs.length; r++) {
                var o = refs[r];
                if (o && o.properties && o.properties.get('uniqueId') === ruid) {
                    found = o;
                    break;
                }
            }
            if (!found) {
                route = null;
                break;
            }
            route.push(found);
        }
        if (route && route.length >= 2) {
            if (fromObj) route[0] = fromObj;
            if (toObj) route[route.length - 1] = toObj;
            if (window.CableUnderground && Array.isArray(item.undergroundSpans) && item.undergroundSpans.length) {
                route = CableUnderground.ensureRouteIncludesUndergroundManholes(route, item.undergroundSpans);
            }
            return route;
        }
    }
    if (coords && coords.length > 2 && item.geometry != null) {
        var fg = findObjectsAtGeometry(refs, item.geometry);
        if (fg && fg.length >= 2) {
            if (fromObj) fg[0] = fromObj;
            if (toObj) fg[fg.length - 1] = toObj;
            if (window.CableUnderground && Array.isArray(item.undergroundSpans) && item.undergroundSpans.length) {
                fg = CableUnderground.ensureRouteIncludesUndergroundManholes(fg, item.undergroundSpans);
            }
            return fg;
        }
    }
    if (fromObj && toObj && window.CableUnderground && Array.isArray(item.undergroundSpans) && item.undergroundSpans.length) {
        return CableUnderground.ensureRouteIncludesUndergroundManholes([fromObj, toObj], item.undergroundSpans);
    }
    return null;
}

function getCableSnapTolerance(zoom) {
    if (zoom == null) zoom = myMap.getZoom();
    return zoom < 12 ? 0.00022 : (zoom < 15 ? 0.00014 : 0.00008);
}

function getCableAutoSelectTolerance(zoom) {
    if (zoom == null) zoom = myMap.getZoom();
    return zoom < 12 ? 0.00028 : (zoom < 15 ? 0.00018 : 0.0001);
}

/** Радиус привязки кабеля в пикселях экрана (стабильнее, чем градусы широты/долготы). */
function getCableSnapPixelRadius(zoom, mode) {
    if (zoom == null && myMap) zoom = myMap.getZoom();
    if (mode === 'auto' || mode === 'click') {
        if (zoom < 12) return 56;
        if (zoom < 15) return 46;
        return 40;
    }
    if (zoom < 12) return 52;
    if (zoom < 15) return 42;
    return 36;
}

function appendMapGroupPlacemarkMatches(cursorPx, pixelRadius, opts, matches) {
    if (!cursorPx || !pixelRadius || opts.includeMapGroups === false) return;
    var groupArrays = [];
    if (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks)) {
        groupArrays.push(crossGroupPlacemarks);
    }
    groupArrays.forEach(function(groupList) {
        groupList.forEach(function(pm) {
            if (!pm || !pm.geometry || !pm.properties) return;
            if (opts.excludeObject && pm === opts.excludeObject) return;
            var objType = pm.properties.get('type');
            if (objType !== 'crossGroup') return;
            try {
                var objCoords = pm.geometry.getCoordinates();
                var objPx = geoToClient(objCoords);
                if (!objPx) return;
                var dx = objPx[0] - cursorPx[0];
                var dy = objPx[1] - cursorPx[1];
                var distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > pixelRadius) return;
                matches.push({ obj: pm, distance: distance });
            } catch (e) {}
        });
    });
}

function resolveCableSnapEndpoint(placemark) {
    if (!placemark || !placemark.properties) return placemark;
    var type = placemark.properties.get('type');
    if (type === 'crossGroup') {
        var crosses = placemark.properties.get('crossGroup');
        if (crosses && crosses.length === 1) return crosses[0];
        return null;
    }
    return placemark;
}

function findObjectAtCoords(coords, tolerance, opts) {
    opts = opts || {};
    var pixelRadius = opts.pixelRadius;
    var cursorPx = (pixelRadius != null && typeof geoToClient === 'function') ? geoToClient(coords) : null;
    var usePixelSnap = cursorPx != null && pixelRadius > 0;

    if (!usePixelSnap && (tolerance === null || tolerance === undefined)) {
        const zoom = myMap.getZoom();
        tolerance = zoom < 12 ? 0.001 : (zoom < 15 ? 0.0005 : 0.00025);
    }

    var matches = [];
    objects.forEach(function(obj) {
        if (!obj || !obj.geometry || !obj.properties) return;
        var objType = obj.properties.get('type');
        if (objType === 'cable' || objType === 'cableLabel') return;
        if (opts.excludeCabinetMembers && typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) return;
        var excludeTypes = opts.excludeTypes;
        if (excludeTypes && excludeTypes.length && excludeTypes.indexOf(objType) !== -1) return;
        if (opts.includeTypes && opts.includeTypes.length && opts.includeTypes.indexOf(objType) === -1) return;
        if (opts.excludeObject && obj === opts.excludeObject) return;
        try {
            var objCoords = obj.geometry.getCoordinates();
            var distance;
            if (usePixelSnap) {
                var objPx = geoToClient(objCoords);
                if (!objPx) return;
                var dx = objPx[0] - cursorPx[0];
                var dy = objPx[1] - cursorPx[1];
                distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > pixelRadius) return;
            } else {
                var latDiff = Math.abs(objCoords[0] - coords[0]);
                var lonDiff = Math.abs(objCoords[1] - coords[1]);
                distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
                if (distance > tolerance) return;
            }
            matches.push({ obj: obj, distance: distance });
        } catch (error) {}
    });
    if (usePixelSnap) appendMapGroupPlacemarkMatches(cursorPx, pixelRadius, opts, matches);
    if (!matches.length) return null;
    matches.sort(function(a, b) { return a.distance - b.distance; });

    var priorityTypes = opts.priorityTypes;
    if (priorityTypes && priorityTypes.length) {
        for (var pi = 0; pi < priorityTypes.length; pi++) {
            var pt = priorityTypes[pi];
            for (var mi = 0; mi < matches.length; mi++) {
                if (matches[mi].obj.properties.get('type') === pt) return matches[mi].obj;
            }
        }
    }

    for (var i = 0; i < matches.length; i++) {
        if (matches[i].obj.properties.get('type') !== 'cabinet') return matches[i].obj;
    }
    return matches[0].obj;
}

