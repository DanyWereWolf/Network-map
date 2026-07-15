/**
 * Подсветка объектов на карте, фантом и курсор при размещении.
 */
function clearShowOnMapHighlight() {
    if (!showOnMapHighlightState) return;
    var s = showOnMapHighlightState;
    showOnMapHighlightState = null;
    if (s.timeoutId) clearTimeout(s.timeoutId);
    if (s.obj && s.obj.options) {
        try {
            if (s.isCable) {
                s.obj.options.set('strokeColor', s.originalOptions.strokeColor || '#3b82f6');
                s.obj.options.set('strokeWidth', s.originalOptions.strokeWidth != null ? s.originalOptions.strokeWidth : 3);
            } else {
                if (s.originalOptions.preset) s.obj.options.set('preset', s.originalOptions.preset);
            }
        } catch (e) {}
    }
}

function createCursorIndicator() {
    cursorIndicator = document.createElement('div');
    cursorIndicator.id = 'cursorIndicator';
    cursorIndicator.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        background: rgba(59, 130, 246, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(cursorIndicator);
}

function updateCursorIndicator(e, objectType, objectCoord) {
    if (!cursorIndicator) return;
    
    if (objectType && e) {
        let text = '';
        switch(objectType) {
            case 'support':
                text = 'Опора связи';
                break;
            case 'sleeve':
                text = 'Кабельная муфта';
                break;
            case 'cross':
                text = 'Оптический кросс';
                break;
            case 'node':
                text = 'Узел сети';
                break;
            case 'cross':
                text = 'Оптический кросс';
                break;
            case 'attachment':
                text = 'Крепление узлов';
                break;
            case 'manhole':
                text = 'Колодец';
                break;
            case 'signalPost':
                text = 'Сигнальный столб';
                break;
            case 'cabinet':
                text = 'Ящик';
                break;
            case 'olt':
                text = 'OLT (GPON)';
                break;
            case 'splitter':
                text = 'Сплиттер';
                break;
            case 'onu':
                text = 'ONU';
                break;
            case 'camera':
                text = 'Камера';
                break;
            case 'mediaConverter':
                text = 'Медиаконвертер';
                break;
            case 'cable':
                text = 'Кабель';
                break;
            case 'crossGroup':
                text = 'Группа кроссов';
                break;
            case 'nodeGroup':
                text = 'Группа узлов';
                break;
            default:
                text = 'Объект';
        }
        cursorIndicator.textContent = text;
        cursorIndicator.style.display = 'block';
        
        let clientX = window.lastMouseX || 0;
        let clientY = window.lastMouseY || 0;
        if (objectCoord && (objectCoord.length >= 2)) {
            const pt = geoToClient(objectCoord);
            if (pt) {
                clientX = pt[0];
                clientY = pt[1];
            }
        }
        if (clientX > 0 || clientY > 0) {
            cursorIndicator.style.left = clientX + 'px';
            cursorIndicator.style.top = (clientY + 14) + 'px';
            cursorIndicator.style.transform = 'translate(-50%, 0)';
        }
    } else {
        cursorIndicator.style.display = 'none';
        cursorIndicator.style.transform = '';
    }
}

function updatePhantomPlacemark(type, coords) {
    if (!type || !coords) {
        removePhantomPlacemark();
        return;
    }

    var currentPhantomType = phantomPlacemark && phantomPlacemark.properties ? phantomPlacemark.properties.get('phantomType') : null;
    if (phantomPlacemark && currentPhantomType === type) {
        phantomPlacemark.geometry.setCoordinates(coords);
        return;
    }
    removePhantomPlacemark();

    var phantomIcon = buildMapPlacemarkIcon(type, 'phantom', type === 'node' ? { nodeKind: currentPlacementNodeKind } : null);
    if (!phantomIcon) return;

    phantomPlacemark = new ymaps.Placemark(coords, {
        type: 'phantom',
        phantomType: type,
        balloonContent: ''
    }, {
        iconLayout: 'default#image',
        iconImageHref: phantomIcon.href,
        iconImageSize: phantomIcon.iconImageSize,
        iconImageOffset: phantomIcon.iconImageOffset,
        iconImageOpacity: 0.7, 
        zIndex: 9999, 
        interactive: false, 
        cursor: 'crosshair',
        hasBalloon: false,
        openBalloonOnClick: false
    });
    
    myMap.geoObjects.add(phantomPlacemark);
}

function removePhantomPlacemark() {
    if (phantomPlacemark) {
        myMap.geoObjects.remove(phantomPlacemark);
        phantomPlacemark = null;
    }
}

function resolveCableFromMapTarget(target) {
    if (!target || !target.properties) return null;
    var type = target.properties.get('type');
    if (type === 'cable') return target;
    if (type === 'cableAerialOverlay') {
        var uid = target.properties.get('parentCableId');
        if (!uid || !Array.isArray(objects)) return null;
        for (var i = 0; i < objects.length; i++) {
            var o = objects[i];
            if (o && o.properties && o.properties.get('uniqueId') === uid && o.properties.get('type') === 'cable') {
                return o;
            }
        }
    }
    return null;
}

function handleCableMapClickEvent(cable, e) {
    if (radioBridgeRoutingMode && radioBridgeRoutingData) {
        var rbCoords = e && e.get ? e.get('coords') : null;
        if (rbCoords && typeof handleRadioBridgeRoutingClick === 'function') {
            handleRadioBridgeRoutingClick(rbCoords);
        }
        return false;
    }
    try {
        if (e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
            e.originalEvent.stopPropagation();
        }
        if (e.stopPropagation && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
    } catch (error) {}
    if (cableSplitMode && cableSplitData) {
        var splitCoords = e.get && e.get('coords');
        if (splitCoords) {
            window.lastMapClickCoords = splitCoords;
            handleCableSplitMapClick(splitCoords, cable);
            return false;
        }
    }
    if (cableSplitSuppressInfoUntil && Date.now() < cableSplitSuppressInfoUntil) {
        return false;
    }
    showCableInfo(cable);
    return false;
}

function bindCableAerialOverlayEvents(overlay, cable) {
    if (!overlay || !cable || !overlay.events) return;
    overlay.events.add('click', function(e) {
        return handleCableMapClickEvent(cable, e);
    });
    function onEnter(e) {
        var domEvent = e.get && e.get('domEvent');
        if (domEvent) {
            window.lastMouseX = domEvent.clientX || 0;
            window.lastMouseY = domEvent.clientY || 0;
        }
        if (objectPlacementMode && phantomPlacemark) {
            myMap.geoObjects.remove(phantomPlacemark);
            phantomPlacemark = null;
        }
        if (hoveredObject && hoveredObject !== cable) clearHoverHighlight();
        highlightObjectOnHover(cable, e);
    }
    function onLeave() {
        if (hoveredObject === cable) clearHoverHighlight();
    }
    overlay.events.add('mouseenter', onEnter);
    overlay.events.add('mouseleave', onLeave);
    overlay.events.add('mouseover', onEnter);
    overlay.events.add('mouseout', onLeave);
}

function bindAllCableAerialOverlays(cable) {
    if (!cable || !cable.properties) return;
    var overlays = cable.properties.get('aerialOverlays');
    if (!Array.isArray(overlays)) return;
    overlays.forEach(function(ol) {
        bindCableAerialOverlayEvents(ol, cable);
    });
}

window.bindAllCableAerialOverlays = bindAllCableAerialOverlays;

function attachHoverEventsToObject(obj) {
    if (!obj || !obj.events) return;
    const objType = obj.properties ? obj.properties.get('type') : null;
    if (!objType || objType === 'cableLabel' || objType === 'cableAerialOverlay') return;
    
    function onMouseEnter(e) {
        const domEvent = e.get && e.get('domEvent');
        if (domEvent) {
            window.lastMouseX = domEvent.clientX || 0;
            window.lastMouseY = domEvent.clientY || 0;
        }
        if (objectPlacementMode && phantomPlacemark) {
            myMap.geoObjects.remove(phantomPlacemark);
            phantomPlacemark = null;
        }
        if (hoveredObject && hoveredObject !== obj) clearHoverHighlight();
        highlightObjectOnHover(obj, e);
    }
    function onMouseLeave() {
        if (hoveredObject === obj) clearHoverHighlight();
    }
    obj.events.add('mouseenter', onMouseEnter);
    obj.events.add('mouseleave', onMouseLeave);
    obj.events.add('mouseover', onMouseEnter);
    obj.events.add('mouseout', onMouseLeave);
}

function highlightObjectOnHover(obj, e) {
    if (!obj || !obj.properties) {
        return;
    }

    if (selectedObjects.includes(obj)) {
        return;
    }
    
    hoveredObject = obj;
    
    const type = obj.properties.get('type');

    const objCoord = (type === 'cable' || type === 'cableLabel') ? (e && e.get('coords') ? e.get('coords') : null) : (obj.geometry ? obj.geometry.getCoordinates() : null);
    updateCursorIndicator(e, type, objCoord);

    if (type === 'cable' || type === 'cableLabel') {
        
        showHoverCircle(obj, e);
        
        highlightCableOnHover(obj);
        return;
    }

    if (type === 'node') {
        showHoverCircle(obj, e);
        return;
    }

    var hoverIconTypes = ['support', 'sleeve', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment', 'manhole', 'signalPost', 'cabinet'];
    if (hoverIconTypes.indexOf(type) < 0) return;

    var hoverIcon = buildMapPlacemarkIcon(type, 'hover', obj);
    if (!hoverIcon) return;

    hoveredObjectOriginalIcon = {
        href: obj.options.get('iconImageHref'),
        size: obj.options.get('iconImageSize'),
        offset: obj.options.get('iconImageOffset')
    };

    obj.options.set({
        iconImageHref: hoverIcon.href,
        iconImageSize: hoverIcon.iconImageSize,
        iconImageOffset: hoverIcon.iconImageOffset
    });
    
    showHoverCircle(obj, e);
}

function showHoverCircle(obj, e) {
    if (!obj || !obj.geometry) return;

    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
    
    const type = obj.properties ? obj.properties.get('type') : null;

    if (type === 'cable') {
        if (!e) return;
        
        const coords = e.get('coords');
        var geoms = (window.CableUnderground && CableUnderground.getCableDisplayGeometries)
            ? CableUnderground.getCableDisplayGeometries(obj)
            : [obj.geometry.getCoordinates()];
        var nearestPoint = null;
        var bestDist = Infinity;
        for (var gi = 0; gi < geoms.length; gi++) {
            var geom = geoms[gi];
            if (!geom || geom.length < 2) continue;
            var projected = projectPointOntoPolyline(coords, geom);
            if (projected && projected.distance < bestDist) {
                bestDist = projected.distance;
                nearestPoint = projected.point;
            }
        }
        if (!nearestPoint) return;

            const zoom = myMap.getZoom();
            const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00015 : 0.0001);
            
            hoverCircle = new ymaps.Circle([nearestPoint, radius], {}, {
                fillColor: 'rgba(59, 130, 246, 0.2)',
                strokeColor: '#3b82f6',
                strokeWidth: 2,
                strokeStyle: 'solid',
                zIndex: 999
            });
            
            myMap.geoObjects.add(hoverCircle);
    } else {
        
        const coords = obj.geometry.getCoordinates();

        const zoom = myMap.getZoom();
        const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00018 : 0.00012);

        let fillColor = 'rgba(59, 130, 246, 0.15)';
        let strokeColor = '#3b82f6';
        let strokeWidth = 2.5;
        const isGroup = type === 'crossGroup' || type === 'nodeGroup';
        
        if (type === 'node') {
            const nodeKind = obj.properties.get('nodeKind') || 'network';
            if (nodeKind === 'aggregation') {
                strokeColor = '#ef4444';
                fillColor = 'rgba(239, 68, 68, 0.18)';
            } else {
                strokeColor = '#22c55e';
                fillColor = 'rgba(34, 197, 94, 0.18)';
            }
        } else if (isGroup) {
            fillColor = 'rgba(59, 130, 246, 0.25)';
            strokeWidth = 4;
        }
        
        hoverCircle = new ymaps.Circle([coords, radius], {}, {
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
            strokeStyle: 'solid',
            zIndex: isGroup ? 9999 : 999
        });
        
        myMap.geoObjects.add(hoverCircle);
    }
}

function removeHoverCircle() {
    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
}

function highlightCableOnHover(cable) {
    if (!cable || !cable.properties) return;

    if (!cable.properties.get('originalCableOptions')) {
        const originalOptions = {
            strokeWidth: cable.options.get('strokeWidth'),
            strokeColor: cable.options.get('strokeColor'),
            strokeOpacity: cable.options.get('strokeOpacity')
        };
        cable.properties.set('originalCableOptions', originalOptions);
    }

    const cableType = cable.properties.get('cableType');
    const normalWidth = getCableWidth(cableType);
    const normalColor = getCableColor(cableType);
    
    cable.options.set({
        strokeWidth: normalWidth * 1.8,
        strokeColor: '#60a5fa', 
        strokeOpacity: 0.95,
        zIndex: 998
    });
    if (window.CableUnderground && CableUnderground.syncAerialOverlayStroke) {
        CableUnderground.syncAerialOverlayStroke(cable);
    }
}

function clearCableHoverHighlight(cable) {
    if (!cable || !cable.properties) return;
    
    const originalOptions = cable.properties.get('originalCableOptions');
    if (originalOptions) {
        cable.options.set({
            strokeWidth: originalOptions.strokeWidth,
            strokeColor: originalOptions.strokeColor,
            strokeOpacity: originalOptions.strokeOpacity,
            zIndex: CABLE_MAP_Z_INDEX
        });
        cable.properties.unset('originalCableOptions');
        if (window.CableUnderground && CableUnderground.syncAerialOverlayStroke) {
            CableUnderground.syncAerialOverlayStroke(cable);
        }
    }
}

function clearHoverHighlight() {
    if (hoveredObject) {
        const type = hoveredObject.properties ? hoveredObject.properties.get('type') : null;
        
        if (type === 'cable') {
            
            clearCableHoverHighlight(hoveredObject);
        } else if (hoveredObjectOriginalIcon) {
            
            hoveredObject.options.set({
                iconImageHref: hoveredObjectOriginalIcon.href,
                iconImageSize: hoveredObjectOriginalIcon.size,
                iconImageOffset: hoveredObjectOriginalIcon.offset
            });
        }
    }
    
    hoveredObject = null;
    hoveredObjectOriginalIcon = null;
    removeHoverCircle();
    updateCursorIndicator(null, null);
}
