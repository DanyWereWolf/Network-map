/**
 * Прокладка GPON-жил и сплиттер-маршрутов по карте.
 */
function getGponFiberRoutingSourceAnchor(data) {
    if (!data) return null;
    if (data.sourceKind === 'oltPort') return data.oltObj || data.routingAnchor;
    return data.routingAnchor || data.splitterObj;
}

function getGponFiberRoutingSourceCoords(data) {
    var anchor = getGponFiberRoutingSourceAnchor(data);
    if (!anchor) return null;
    if (typeof getObjectRoutingCoords === 'function') {
        return getObjectRoutingCoords(anchor);
    }
    if (!anchor.geometry) return null;
    try { return anchor.geometry.getCoordinates(); } catch (e) { return null; }
}

function isGponFiberRoutingTargetReachableClick(data, clickedObject) {
    if (!data || !clickedObject || !data.targetObj) return false;
    if (getObjectUniqueId(clickedObject) === data.targetId) return true;
    if (typeof getObjectCabinetId !== 'function' || typeof getObjectCabinetUid !== 'function') return false;
    var targetCab = getObjectCabinetId(data.targetObj);
    if (!targetCab) return false;
    return getObjectCabinetUid(clickedObject) === targetCab;
}

function isGponFiberRoutingSourceUid(data, objId) {
    if (!data || !objId) return false;
    if (data.sourceKind === 'oltPort') {
        if (data.oltObj && getObjectUniqueId(data.oltObj) === objId) return true;
        if (data.oltObj && typeof getObjectCabinetId === 'function') {
            var oltCab = getObjectCabinetId(data.oltObj);
            if (oltCab && oltCab === objId) return true;
        }
        return false;
    }
    var anchor = data.routingAnchor || data.splitterObj;
    return (anchor && getObjectUniqueId(anchor) === objId) ||
        (data.splitterObj && getObjectUniqueId(data.splitterObj) === objId);
}

function isGponFiberRoutingParticipant(data, objId) {
    if (!data || !objId) return false;
    if (objId === data.targetId || isGponFiberRoutingSourceUid(data, objId)) return true;
    if (data.targetObj && typeof getObjectCabinetId === 'function') {
        var targetCab = getObjectCabinetId(data.targetObj);
        if (targetCab && targetCab === objId) return true;
    }
    if (data.oltObj && data.sourceKind === 'oltPort' && typeof getObjectCabinetId === 'function') {
        var oltCab = getObjectCabinetId(data.oltObj);
        if (oltCab && oltCab === objId) return true;
    }
    return false;
}

function stopGponRoutingPulseAnimation() {
    if (gponRoutingHighlightAnimState && gponRoutingHighlightAnimState.rafId) {
        cancelAnimationFrame(gponRoutingHighlightAnimState.rafId);
    }
    gponRoutingHighlightAnimState = null;
}

function routingHighlightColorRgb(hex) {
    var h = String(hex || '#3b82f6').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 59, g: 130, b: 246 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function startGponRoutingPulseAnimation(pulseEntries) {
    stopGponRoutingPulseAnimation();
    if (!pulseEntries || !pulseEntries.length) return;
    var startedAt = performance.now();
    gponRoutingHighlightAnimState = { pulses: pulseEntries, rafId: null };

    function tick(now) {
        if (!gponRoutingHighlightAnimState) return;
        var elapsed = (now - startedAt) / 1000;
        gponRoutingHighlightAnimState.pulses.forEach(function(entry, idx) {
            if (!entry || !entry.pulseCircle || !entry.pulseCircle.geometry) return;
            var phase = (elapsed * 0.9 + idx * 0.45) % 1;
            var scale = 1 + phase * 0.75;
            var fade = 1 - phase;
            try {
                entry.pulseCircle.geometry.setRadius(entry.baseRadius * scale);
                entry.pulseCircle.options.set({
                    fillOpacity: 0.28 * fade,
                    strokeOpacity: 0.65 * fade
                });
            } catch (ePulse) {}
        });
        gponRoutingHighlightAnimState.rafId = requestAnimationFrame(tick);
    }
    gponRoutingHighlightAnimState.rafId = requestAnimationFrame(tick);
}

function clearGponRoutingMapHighlight() {
    stopGponRoutingPulseAnimation();
    if (Array.isArray(gponRoutingHighlightMarkers)) {
        gponRoutingHighlightMarkers.forEach(function(m) {
            try { if (myMap) myMap.geoObjects.remove(m); } catch (e) {}
        });
    }
    gponRoutingHighlightMarkers = [];
    if (Array.isArray(gponRoutingHighlightIconState)) {
        gponRoutingHighlightIconState.forEach(function(entry) {
            if (!entry || !entry.obj || !entry.obj.properties) return;
            if (typeof applyMapPlacemarkIcon === 'function') {
                var variant = entry.hadSelected ? 'selected' : 'normal';
                applyMapPlacemarkIcon(entry.obj, entry.type, variant, entry.obj);
            }
        });
    }
    gponRoutingHighlightIconState = [];
}

function applyGponRoutingMapHighlight(sourceObj, targetObj) {
    clearGponRoutingMapHighlight();
    if (!myMap) return;
    var pulseEntries = [];

    function markEndpoint(obj, color, role) {
        if (!obj) return null;
        var coords = typeof getObjectRoutingCoords === 'function' ? getObjectRoutingCoords(obj) : null;
        if (!coords && obj.geometry) {
            try { coords = obj.geometry.getCoordinates(); } catch (eC) {}
        }
        if (!coords || coords.length < 2) return null;
        var type = obj.properties ? obj.properties.get('type') : '';
        if (typeof applyMapPlacemarkIcon === 'function' && type) {
            gponRoutingHighlightIconState.push({
                obj: obj,
                type: type,
                hadSelected: selectedObjects.indexOf(obj) >= 0
            });
            applyMapPlacemarkIcon(obj, type, 'selected', obj);
        }
        var rgb = routingHighlightColorRgb(color);
        var baseRadius = 20;
        try {
            var outline = new ymaps.Circle([coords, baseRadius], {
                hintContent: role === 'target' ? 'Цель — кликните для завершения' : 'Начало маршрута'
            }, {
                fillColor: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.14)',
                strokeColor: color,
                strokeWidth: 3,
                strokeOpacity: 0.95,
                zIndex: 652,
                interactive: false
            });
            outline.properties.set('type', 'gponRoutingHighlight');
            myMap.geoObjects.add(outline);
            gponRoutingHighlightMarkers.push(outline);

            var pulse = new ymaps.Circle([coords, baseRadius], {}, {
                fillColor: color,
                fillOpacity: 0.28,
                strokeColor: color,
                strokeWidth: 2,
                strokeOpacity: 0.55,
                zIndex: 651,
                interactive: false
            });
            pulse.properties.set('type', 'gponRoutingHighlightPulse');
            myMap.geoObjects.add(pulse);
            gponRoutingHighlightMarkers.push(pulse);
            pulseEntries.push({ pulseCircle: pulse, baseRadius: baseRadius });
        } catch (eR) {}
        return coords;
    }

    var cSource = markEndpoint(sourceObj, '#0ea5e9', 'source');
    var cTarget = markEndpoint(targetObj, '#a855f7', 'target');
    if (pulseEntries.length) startGponRoutingPulseAnimation(pulseEntries);
    var points = [];
    if (cSource) points.push(cSource);
    if (cTarget) points.push(cTarget);

    if (points.length === 2 && typeof ymaps !== 'undefined' && ymaps.util && ymaps.util.bounds) {
        try {
            myMap.setBounds(ymaps.util.bounds.fromPoints(points), {
                checkZoomRange: true,
                zoomMargin: [70, 70, 70, 70],
                duration: 350
            });
        } catch (eB) {
            if (cTarget) myMap.setCenter(cTarget, Math.max(myMap.getZoom(), 17), { duration: 300 });
        }
    } else if (cTarget) {
        myMap.setCenter(cTarget, Math.max(myMap.getZoom(), 17), { duration: 300 });
    } else if (cSource) {
        myMap.setCenter(cSource, Math.max(myMap.getZoom(), 17), { duration: 300 });
    }
}

function handleSplitterFiberRoutingClick(coords) {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    var data = splitterFiberRoutingData;
    var clickedObject = findObjectAtCoords(coords);
    
    if (clickedObject && clickedObject.geometry) {
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        var objId = getObjectUniqueId(clickedObject);
        
        if (objId === data.targetId || isGponFiberRoutingTargetReachableClick(data, clickedObject)) {
            completeSplitterFiberRouting();
            return;
        }
        
        if (objType === 'support' || objType === 'attachment') {
            addSplitterFiberWaypoint(clickedObject);
            updateSplitterFiberPreview();
            return;
        }
        
        if (isGponFiberRoutingSourceUid(data, objId)) {
            splitterFiberWaypoints = [];
            updateSplitterFiberPreview();
            return;
        }
        
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре или креплению для добавления промежуточной точки, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
    } else {
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре, креплению или целевому объекту (' + escapeHtml(targetName) + ').', 'Режим прокладки');
    }
}

function updateSplitterFiberPreview() {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    var data = splitterFiberRoutingData;
    var points = [];
    
    var splitterCoords = getGponFiberRoutingSourceCoords(data);
    if (!splitterCoords) return;
    points.push(splitterCoords);
    
    splitterFiberWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    if (points.length >= 1) {
        var targetCoords = typeof getObjectRoutingCoords === 'function'
            ? getObjectRoutingCoords(data.targetObj)
            : (data.targetObj && data.targetObj.geometry ? data.targetObj.geometry.getCoordinates() : null);
        if (!targetCoords) return;
        points.push(targetCoords);
        
        splitterFiberPreviewLine = new ymaps.Polyline(points, {}, {
            strokeColor: getFiberRoutingPreviewStroke(data.targetType),
            strokeWidth: 2,
            strokeStyle: 'shortdash',
            strokeOpacity: 0.5
        });
        myMap.geoObjects.add(splitterFiberPreviewLine);
    }
}

function updateSplitterFiberPreviewWithCursor(cursorCoords) {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    var data = splitterFiberRoutingData;
    var points = [];
    
    var splitterCoords = getGponFiberRoutingSourceCoords(data);
    if (!splitterCoords) return;
    points.push(splitterCoords);
    
    splitterFiberWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    points.push(cursorCoords);
    
    splitterFiberPreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: getFiberRoutingPreviewStroke(data.targetType),
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.4
    });
    myMap.geoObjects.add(splitterFiberPreviewLine);
}

function areFiberRoutingHostsCoLocated(hostA, hostB) {
    if (!hostA || !hostB) return false;
    if (typeof getObjectCabinetId === 'function') {
        var cabA = getObjectCabinetId(hostA);
        var cabB = getObjectCabinetId(hostB);
        if (cabA && cabB && cabA === cabB) return true;
    }
    if (!hostA.geometry || !hostB.geometry) return false;
    var coordsA = hostA.geometry.getCoordinates();
    var coordsB = hostB.geometry.getCoordinates();
    if (!coordsA || !coordsB || coordsA.length < 2 || coordsB.length < 2) return false;
    return Math.abs(coordsA[0] - coordsB[0]) <= 1e-10 && Math.abs(coordsA[1] - coordsB[1]) <= 1e-10;
}

function tryCompleteFiberRoutingForCabinetClick(clickedObject) {
    if (!fiberRoutingMode || !fiberRoutingData || !clickedObject || !clickedObject.properties) return false;
    var target = fiberRoutingData.targetObj;
    if (!target || typeof getObjectCabinetId !== 'function') return false;
    var targetCabId = getObjectCabinetId(target);
    if (!targetCabId) return false;
    var clickedType = clickedObject.properties.get('type');
    var clickedCabId = clickedType === 'cabinet'
        ? getObjectUniqueId(clickedObject)
        : getObjectCabinetId(clickedObject);
    if (clickedCabId !== targetCabId) return false;
    completeFiberRouting();
    return true;
}

function startFiberRouting(sleeveObj, cableId, fiberNumber, targetType, targetObj) {
    fiberRoutingMode = true;
    var targetId = getObjectUniqueId(targetObj);
    if (!targetId) {
        targetId = generateUniqueId(targetType);
        targetObj.properties.set('uniqueId', targetId);
    }
    fiberRoutingData = {
        sleeveObj: sleeveObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        targetType: targetType,
        targetObj: targetObj,
        targetId: targetId
    };
    fiberRoutingWaypoints = [];
    var sleeveName = sleeveObj.properties.get('name') || (sleeveObj.properties.get('type') === 'cross' ? 'Кросс' : 'Муфта');
    var targetName = getFiberRoutingTargetLabel(targetType, targetObj);
    showInfo('Режим прокладки жилы: ' + sleeveName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту (фиолетовая пульсирующая обводка) для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(sleeveObj);
    applyGponRoutingMapHighlight(sleeveObj, targetObj);
    syncMapPanLockForEditTools();
    if (areFiberRoutingHostsCoLocated(sleeveObj, targetObj)) {
        completeFiberRouting();
    }
}

function cancelFiberRouting() {
    fiberRoutingMode = false;
    fiberRoutingData = null;
    fiberRoutingWaypoints = [];
    placementPanBlockClickUntil = 0;
    placementPanPointer.down = false;
    placementPanPointer.moved = false;
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    clearGponRoutingMapHighlight();
    clearSelection();
    syncMapPanLockForEditTools();
}

function completeFiberRouting() {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    var data = fiberRoutingData;
    
    var routeIds = resolveGponRouteIds(fiberRoutingWaypoints.map(function(wp) {
        if (wp.properties) {
            var wpId = getObjectUniqueId(wp);
            if (!wpId) {
                wpId = generateUniqueId(wp.properties.get('type') || 'waypoint');
                wp.properties.set('uniqueId', wpId);
            }
            return wpId;
        }
        return null;
    }).filter(function(id) { return id !== null; }));
    
    var refreshedUi = false;
    if (data.targetType === 'onu') {
        connectFiberToOnuWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
        refreshedUi = true;
    } else if (data.targetType === 'mediaConverter') {
        connectFiberToMediaConverterWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
        refreshedUi = true;
    } else if (data.targetType === 'splitter') {
        if (connectFiberToSplitterWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds)) {
            refreshSplitterUiAfterChange(data.targetObj);
            refreshedUi = true;
        }
    } else if (data.targetType === 'olt') {
        connectFiberToOltWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
        refreshedUi = true;
    }
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    fiberRoutingMode = false;
    fiberRoutingData = null;
    fiberRoutingWaypoints = [];
    
    clearGponRoutingMapHighlight();
    clearSelection();
    if (!refreshedUi) {
        savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
        showObjectInfo(data.sleeveObj);
    }
    syncMapPanLockForEditTools();
}

function handleFiberRoutingClick(coords) {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    var data = fiberRoutingData;
    var clickedObject = findObjectAtCoords(coords);
    
    if (clickedObject && clickedObject.geometry) {
        if (typeof tryCompleteFiberRoutingForCabinetClick === 'function' &&
            tryCompleteFiberRoutingForCabinetClick(clickedObject)) {
            return;
        }
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        var objId = getObjectUniqueId(clickedObject);
        
        if (objId === data.targetId) {
            completeFiberRouting();
            return;
        }
        
        if (objType === 'support' || objType === 'attachment') {
            addFiberRoutingWaypoint(clickedObject);
            updateFiberRoutingPreview();
            return;
        }
        
        if (objId === getObjectUniqueId(data.sleeveObj)) {
            fiberRoutingWaypoints = [];
            updateFiberRoutingPreview();
            return;
        }
        
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре или креплению для добавления промежуточной точки, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
    } else {
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре, креплению или целевому объекту (' + escapeHtml(targetName) + ').', 'Режим прокладки');
    }
}

function updateFiberRoutingPreview() {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    var data = fiberRoutingData;
    var points = [];
    
    var sleeveCoords = data.sleeveObj.geometry.getCoordinates();
    points.push(sleeveCoords);
    
    fiberRoutingWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    if (points.length >= 1) {
        var targetCoords = data.targetObj.geometry.getCoordinates();
        points.push(targetCoords);
        
        fiberRoutingPreviewLine = new ymaps.Polyline(points, {}, {
            strokeColor: getFiberRoutingPreviewStroke(data.targetType),
            strokeWidth: 2,
            strokeStyle: 'shortdash',
            strokeOpacity: 0.5
        });
        myMap.geoObjects.add(fiberRoutingPreviewLine);
    }
}

function updateFiberRoutingPreviewWithCursor(cursorCoords) {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    var data = fiberRoutingData;
    var points = [];
    
    var sleeveCoords = data.sleeveObj.geometry.getCoordinates();
    points.push(sleeveCoords);
    
    fiberRoutingWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    points.push(cursorCoords);
    
    fiberRoutingPreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: getFiberRoutingPreviewStroke(data.targetType),
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.4
    });
    myMap.geoObjects.add(fiberRoutingPreviewLine);
}

