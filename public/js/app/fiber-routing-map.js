/**
 * Прокладка GPON-жил и сплиттер-маршрутов по карте.
 */
function handleSplitterFiberRoutingClick(coords) {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    var data = splitterFiberRoutingData;
    var clickedObject = findObjectAtCoords(coords);
    
    if (clickedObject && clickedObject.geometry) {
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        var objId = getObjectUniqueId(clickedObject);
        
        if (objId === data.targetId) {
            completeSplitterFiberRouting();
            return;
        }
        
        if (objType === 'support' || objType === 'attachment') {
            addSplitterFiberWaypoint(clickedObject);
            updateSplitterFiberPreview();
            return;
        }
        
        var anchor = data.routingAnchor || data.splitterObj;
        if (objId === getObjectUniqueId(anchor) || objId === getObjectUniqueId(data.splitterObj)) {
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
    
    var splitterCoords = getSplitterRoutingAnchorCoords(data.splitterObj);
    if (!splitterCoords) return;
    points.push(splitterCoords);
    
    splitterFiberWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    if (points.length >= 1) {
        var targetCoords = data.targetObj.geometry.getCoordinates();
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
    
    var splitterCoords = getSplitterRoutingAnchorCoords(data.splitterObj);
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
    showInfo('Режим прокладки жилы: ' + sleeveName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(sleeveObj);
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

