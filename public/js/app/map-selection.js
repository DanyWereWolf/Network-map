/**
 * Выделение объектов на карте.
 */
function selectObject(obj) {
    clearShowOnMapHighlight();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        
        const type = obj.properties.get('type');
        
        if (isEditMode && type !== 'crossGroup' && type !== 'nodeGroup') {
            return;
        }

        applyMapPlacemarkIcon(obj, type, 'selected', obj);
    }
}

var dragUpdateRafId = null;
var dragUpdatePlacemark = null;
function scheduleDragUpdate(pm) {
    dragUpdatePlacemark = pm;
    if (dragUpdateRafId != null) return;
    dragUpdateRafId = requestAnimationFrame(function() {
        dragUpdateRafId = null;
        var placemark = dragUpdatePlacemark;
        dragUpdatePlacemark = null;
        if (placemark) {
            updateSelectionPulsePosition(placemark);
            updateConnectedCables(placemark);
            syncConnectionLinesForObject(placemark);
        }
    });
}

function updateSelectionPulsePosition(obj) {
    const pulse = obj.properties.get('selectionPulse');
    if (pulse && obj.geometry) {
        const coords = obj.geometry.getCoordinates();
        pulse.geometry.setCoordinates(coords);
    }
}

function removeSelectionPulse(obj) {
    const pulse = obj.properties.get('selectionPulse');
    if (pulse) {
        myMap.geoObjects.remove(pulse);
        obj.properties.set('selectionPulse', null);
    }
}

function deselectObject(obj) {
    selectedObjects = selectedObjects.filter(o => o !== obj);

    removeSelectionPulse(obj);
    
    const type = obj.properties.get('type');
    
    if (isEditMode && type !== 'crossGroup' && type !== 'nodeGroup') {
        return;
    }

    applyMapPlacemarkIcon(obj, type, 'normal', obj);
}

function clearSelection() {
    clearShowOnMapHighlight();
    while (selectedObjects.length > 0) {
        deselectObject(selectedObjects[0]);
    }

}

function addCable(fromObj, toObj, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false, copperMeta = null) {
    
    if (Array.isArray(toObj)) {
        return createCableFromPoints(toObj, cableType, existingCableId, null, skipHistoryLog, skipSync, copperMeta);
    }

    return createCableFromPoints([fromObj, toObj], cableType, existingCableId, fiberNumber, skipHistoryLog, skipSync, copperMeta);
}

/** Метаданные меди из JSON / op.data для createCableFromPoints */
