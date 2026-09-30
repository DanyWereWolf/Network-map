/**
 * Выделение объектов на карте.
 */
function createSelectionPulse(obj) {
    if (!obj || !obj.geometry || !myMap || !window.ymaps) return;
    removeSelectionPulse(obj);
    if (typeof areMapAnimationsEnabled === 'function' && !areMapAnimationsEnabled()) return;
    if (typeof AppMotion !== 'undefined' && AppMotion.isPrefEnabled && !AppMotion.isPrefEnabled('selectionPulse')) return;
    var type = obj.properties ? obj.properties.get('type') : '';
    if (type === 'cable' || type === 'cableLabel' || type === 'region') return;
    var coords = null;
    try { coords = obj.geometry.getCoordinates(); } catch (e) {}
    if (!coords || typeof coords[0] !== 'number') return;
    var color = '#14b8a6';
    if (window.MapIcons && MapIcons.COLORS) {
        if (type === 'node' && typeof MapIcons.getNodeColor === 'function') {
            color = MapIcons.getNodeColor(obj.properties.get('nodeKind')) || color;
        } else if (MapIcons.COLORS[type]) {
            color = MapIcons.COLORS[type];
        }
    }
    var startR = 12;
    var expand = 36;
    var life = 650;
    var pulse = null;
    try {
        pulse = new ymaps.Circle([coords, startR], {}, {
            fillColor: color,
            fillOpacity: 0.32,
            strokeColor: color,
            strokeWidth: 1.4,
            strokeOpacity: 0.5,
            zIndex: 640,
            interactive: false
        });
        pulse.properties.set('type', 'selectionPulse');
        myMap.geoObjects.add(pulse);
        obj.properties.set('selectionPulse', pulse);
    } catch (eCreate) {
        return;
    }
    var t0 = performance.now();
    function tick(now) {
        if (obj.properties.get('selectionPulse') !== pulse) return;
        var p = Math.min(1, (now - t0) / life);
        var ease = 1 - Math.pow(1 - p, 2.4);
        var fade = 1 - ease;
        try {
            pulse.geometry.setRadius(startR + ease * expand);
            pulse.options.set({
                fillOpacity: 0.32 * fade,
                strokeOpacity: 0.5 * fade
            });
        } catch (ePulse) {}
        if (p < 1) {
            requestAnimationFrame(tick);
        } else {
            removeSelectionPulse(obj);
        }
    }
    requestAnimationFrame(tick);
}

function selectObject(obj) {
    clearShowOnMapHighlight();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        
        const type = obj.properties.get('type');
        
        if (isEditMode && type !== 'crossGroup' && type !== 'nodeGroup') {
            return;
        }

        applyMapPlacemarkIcon(obj, type, 'selected', obj);
        createSelectionPulse(obj);
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
            if (typeof followMapHoverCardDuringDrag === 'function') {
                followMapHoverCardDuringDrag(placemark);
            }
        }
    });
}

function updateSelectionPulsePosition(obj) {
    const pulse = obj.properties.get('selectionPulse');
    if (pulse && obj.geometry) {
        const coords = obj.geometry.getCoordinates();
        if (coords && typeof coords[0] === 'number') {
            try { pulse.geometry.setCoordinates(coords); } catch (e) {}
        }
    }
}

function removeSelectionPulse(obj) {
    if (!obj || !obj.properties) return;
    const pulse = obj.properties.get('selectionPulse');
    if (pulse) {
        try { myMap.geoObjects.remove(pulse); } catch (eRm) {}
        obj.properties.set('selectionPulse', null);
        obj.properties.set('selectionPulseBaseRadius', null);
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
