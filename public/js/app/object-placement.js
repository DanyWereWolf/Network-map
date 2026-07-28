/**
 * Размещение объектов на карте: координаты, тип, pan-lock.
 */
let objectPlacementMode = false;
let currentPlacementType = null;
let currentPlacementName = null;
let currentPlacementNodeKind = 'network';

/** Имя из поля боковой панели (актуальное), иначе кэш при старте режима размещения. */
function getPlacementObjectName() {
    var inp = document.getElementById('objectName');
    return (inp ? inp.value.trim() : '') || currentPlacementName || '';
}

function normalizeObjectPlacementCoords(lat, lon) {
    lat = Number(typeof lat === 'string' ? lat.trim().replace(',', '.') : lat);
    lon = Number(typeof lon === 'string' ? lon.trim().replace(',', '.') : lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lat, lon];
}

function clearObjectPlacementCoordsForm() {
    var latEl = document.getElementById('objectPlacementLat');
    var lonEl = document.getElementById('objectPlacementLon');
    if (latEl) latEl.value = '';
    if (lonEl) lonEl.value = '';
    removePlacementCoordsPreview();
}

function removePlacementCoordsPreview() {
    if (!placementCoordsPreviewPlacemark || !myMap) {
        placementCoordsPreviewPlacemark = null;
        return;
    }
    try { myMap.geoObjects.remove(placementCoordsPreviewPlacemark); } catch (e) {}
    placementCoordsPreviewPlacemark = null;
}

function showPlacementCoordsOnMap(coords) {
    if (!myMap || !coords || coords.length < 2) return;
    removePlacementCoordsPreview();

    var typeEl = document.getElementById('objectType');
    var type = typeEl ? typeEl.value : 'support';
    var iconOpts = type === 'node' ? { nodeKind: (document.getElementById('nodeKind') && document.getElementById('nodeKind').value) || 'network' } : null;
    var previewIcon = buildMapPlacemarkIcon(type, 'phantom', iconOpts);

    if (previewIcon) {
        placementCoordsPreviewPlacemark = new ymaps.Placemark(coords, {
            type: 'coordsPreview'
        }, {
            iconLayout: 'default#image',
            iconImageHref: previewIcon.href,
            iconImageSize: previewIcon.iconImageSize,
            iconImageOffset: previewIcon.iconImageOffset,
            zIndex: 9998,
            interactive: false,
            hasBalloon: false,
            openBalloonOnClick: false
        });
    } else {
        placementCoordsPreviewPlacemark = new ymaps.Placemark(coords, {}, {
            preset: 'islands#orangeCircleDotIcon',
            zIndex: 9998,
            interactive: false,
            hasBalloon: false,
            openBalloonOnClick: false
        });
    }

    myMap.geoObjects.add(placementCoordsPreviewPlacemark);

    var zoom = myMap.getZoom();
    if (typeof zoom !== 'number' || zoom < 17) zoom = 17;
    if (zoom > 19) zoom = 19;
    try { myMap.setCenter(coords, zoom, { duration: typeof mapMotionDuration === 'function' ? mapMotionDuration(300) : 300 }); } catch (e) {}
}

function previewObjectPlacementCoordsOnMap() {
    if (!myMap) {
        showWarning('Карта ещё не загружена', 'Координаты');
        return;
    }
    var coords = getObjectPlacementCoordsFromForm();
    if (coords === false) return;
    if (!coords) {
        showWarning('Укажите широту и долготу', 'Координаты');
        return;
    }
    showPlacementCoordsOnMap(coords);
}

function parseObjectPlacementCoordsFromText(text) {
    if (!text || typeof text !== 'string') return null;
    var raw = text.trim();
    if (!raw) return null;

    var yandexLl = raw.match(/[?&]ll=(-?\d+(?:[.,]\d+)?)\s*[, ]\s*(-?\d+(?:[.,]\d+)?)/i);
    if (yandexLl) {
        return normalizeObjectPlacementCoords(
            Number(String(yandexLl[2]).replace(',', '.')),
            Number(String(yandexLl[1]).replace(',', '.'))
        );
    }
    var yandexPt = raw.match(/[?&]pt=(-?\d+(?:[.,]\d+)?)\s*[,_]\s*(-?\d+(?:[.,]\d+)?)/i);
    if (yandexPt) {
        return normalizeObjectPlacementCoords(
            Number(String(yandexPt[1]).replace(',', '.')),
            Number(String(yandexPt[2]).replace(',', '.'))
        );
    }

    var parts = raw.match(/-?\d+(?:[.,]\d+)?/g);
    if (!parts || parts.length < 2) return null;
    var a = Number(String(parts[0]).replace(',', '.'));
    var b = Number(String(parts[1]).replace(',', '.'));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    var lat = a;
    var lon = b;
    if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
        lat = b;
        lon = a;
    }
    return normalizeObjectPlacementCoords(lat, lon);
}

function fillObjectPlacementCoordsForm(coords) {
    var normalized = normalizeObjectPlacementCoords(coords && coords[0], coords && coords[1]);
    if (!normalized) return false;
    var latEl = document.getElementById('objectPlacementLat');
    var lonEl = document.getElementById('objectPlacementLon');
    if (latEl) latEl.value = normalized[0].toFixed(6);
    if (lonEl) lonEl.value = normalized[1].toFixed(6);
    return true;
}

function applyObjectPlacementCoordsPaste(text, sourceEl) {
    var coords = parseObjectPlacementCoordsFromText(text);
    if (!coords) {
        showWarning('Не удалось распознать координаты. Вставьте пару чисел, например: 55.7558, 37.6173', 'Координаты');
        return false;
    }
    fillObjectPlacementCoordsForm(coords);
    if (sourceEl && typeof sourceEl.focus === 'function') sourceEl.focus();
    return true;
}

function setupObjectPlacementCoordsControls() {
    var latEl = document.getElementById('objectPlacementLat');
    var lonEl = document.getElementById('objectPlacementLon');
    var pasteBtn = document.getElementById('objectPlacementCoordsPaste');
    var previewBtn = document.getElementById('objectPlacementCoordsPreview');

    function bindCoordsPasteInput(el) {
        if (!el || el._coordsPasteBound) return;
        el._coordsPasteBound = true;
        el.addEventListener('paste', function(e) {
            var text = '';
            try {
                if (e.clipboardData) text = e.clipboardData.getData('text/plain') || '';
            } catch (err) {}
            if (!text || !/[;,\s]/.test(text) || !parseObjectPlacementCoordsFromText(text)) return;
            e.preventDefault();
            applyObjectPlacementCoordsPaste(text, el);
        });
    }

    bindCoordsPasteInput(latEl);
    bindCoordsPasteInput(lonEl);

    if (pasteBtn && !pasteBtn._coordsPasteBound) {
        pasteBtn._coordsPasteBound = true;
        pasteBtn.addEventListener('click', function() {
            if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
                navigator.clipboard.readText().then(function(text) {
                    applyObjectPlacementCoordsPaste(text, latEl || lonEl);
                }).catch(function() {
                    showWarning('Нет доступа к буферу обмена. Вставьте координаты в поле вручную (Ctrl+V).', 'Координаты');
                });
                return;
            }
            showWarning('Вставьте координаты в поле широты или долготы (Ctrl+V).', 'Координаты');
        });
    }

    if (previewBtn && !previewBtn._coordsPreviewBound) {
        previewBtn._coordsPreviewBound = true;
        previewBtn.addEventListener('click', previewObjectPlacementCoordsOnMap);
    }
}

/** null — поля пустые; false — ошибка валидации; [lat, lon] — готовые координаты */
function getObjectPlacementCoordsFromForm() {
    var latEl = document.getElementById('objectPlacementLat');
    var lonEl = document.getElementById('objectPlacementLon');
    var latRaw = latEl ? String(latEl.value).trim() : '';
    var lonRaw = lonEl ? String(lonEl.value).trim() : '';
    if (!latRaw && !lonRaw) return null;
    if (!latRaw || !lonRaw) {
        showWarning('Укажите и широту, и долготу', 'Координаты');
        return false;
    }
    var normalized = normalizeObjectPlacementCoords(latRaw, lonRaw);
    if (!normalized) {
        showWarning('Некорректные координаты. Широта: от −90 до 90, долгота: от −180 до 180', 'Координаты');
        return false;
    }
    return normalized;
}

const PLACEMENT_COORD_EPS = 0.00001;

function getObjectPlacementGroupType(type) {
    if (type === 'node' || type === 'cross') return type;
    return null;
}

function coordsMatchForPlacement(coords, objCoords, placementType) {
    if (!coords || !objCoords || coords.length < 2 || objCoords.length < 2) return false;
    if (getObjectPlacementGroupType(placementType)) {
        return typeof coordsInSameObjectGroup === 'function'
            ? coordsInSameObjectGroup(coords, objCoords)
            : groupKey(coords) === groupKey(objCoords);
    }
    return Math.abs(objCoords[0] - coords[0]) < PLACEMENT_COORD_EPS &&
        Math.abs(objCoords[1] - coords[1]) < PLACEMENT_COORD_EPS;
}

function getPlacemarksAtCoords(coords, placementType) {
    if (!coords || coords.length < 2) return [];
    var found = [];
    var scanList = objects;
    if (typeof MapPerf !== 'undefined' && MapPerf.querySpatialNearCoords) {
        var near = MapPerf.querySpatialNearCoords(coords, getObjectPlacementGroupType(placementType) ? 2 : 1);
        // Пустой near означает «никого рядом» только если spatial-индекс уже наполнен.
        if (near && (near.length > 0 || (typeof MapPerf.shouldUseViewportCull === 'function' && MapPerf.shouldUseViewportCull()))) {
            scanList = near;
        }
    }
    for (var i = 0; i < scanList.length; i++) {
        var obj = scanList[i];
        if (!obj || !obj.geometry || !obj.properties) continue;
        var objType = obj.properties.get('type');
        if (objType === 'cable' || objType === 'cableLabel') continue;
        try {
            var objCoords = obj.geometry.getCoordinates();
            if (coordsMatchForPlacement(coords, objCoords, placementType)) {
                found.push(obj);
            }
        } catch (error) {}
    }
    return found;
}

function canPlaceObjectAtCoords(coords, type) {
    if (canBeCabinetMember(type)) {
        var memberOk = typeof canPlaceMemberAtCoords === 'function'
            ? canPlaceMemberAtCoords(coords, type, getPlacemarksAtCoords(coords, type))
            : null;
        if (memberOk === true) return true;
        if (memberOk === false) return false;
    }
    if (type === 'cabinet') {
        var atCabinetPoint = getPlacemarksAtCoords(coords, type);
        return !atCabinetPoint.some(function(obj) {
            return obj.properties.get('type') === 'cabinet';
        });
    }
    return true;
}

function resolvePlacementCoordsForGrouping(coords, type) {
    if (typeof resolvePlacementCoordsForCabinet === 'function') {
        coords = resolvePlacementCoordsForCabinet(coords, type);
    }
    var groupType = getObjectPlacementGroupType(type);
    if (!groupType || !coords) return coords;
    var atPoint = getPlacemarksAtCoords(coords, type);
    for (var i = 0; i < atPoint.length; i++) {
        if (atPoint[i].properties.get('type') === groupType && atPoint[i].geometry) {
            return atPoint[i].geometry.getCoordinates();
        }
    }
    return coords;
}

function placeObjectAtCoords(coords) {
    if (!coords || coords.length < 2) return false;

    const type = currentPlacementType || (document.getElementById('objectType') && document.getElementById('objectType').value);

    if (!canPlaceObjectAtCoords(coords, type)) {
        if (canBeCabinetMember(type) && findCabinetAtCoords && findCabinetAtCoords(coords)) {
            showWarning('Не удалось добавить объект в ящик в этой точке', 'Размещение');
        } else if (type === 'cabinet') {
            showWarning('В этой точке уже есть ящик', 'Размещение');
        } else {
            showWarning('Не удалось разместить объект в этой точке', 'Размещение');
        }
        return false;
    }

    coords = resolvePlacementCoordsForGrouping(coords, type);

    if (type === 'node') {
        const name = getPlacementObjectName();
        if (name && findNodeByName(name)) {
            if (typeof showError === 'function') showError('Узел сети с таким названием уже существует. Задайте другое название.', 'Дубликат узла');
            else alert('Узел сети с таким названием уже существует. Задайте другое название.');
            return false;
        }
        const nodeKindSelect = document.getElementById('nodeKind');
        const nodeKind = currentPlacementNodeKind || (nodeKindSelect ? nodeKindSelect.value : 'network');
        if (!createObject(type, name || '', coords, { nodeKind: nodeKind })) return false;
        currentPlacementName = name || '';
        currentPlacementNodeKind = nodeKind;
    } else if (type === 'sleeve') {
        const sleeveName = getPlacementObjectName();
        const sleeveType = document.getElementById('sleeveType').value;
        if (!createObject(type, sleeveName || '', coords, { sleeveType: sleeveType, maxFibers: 0 })) return false;
    } else if (type === 'cross') {
        const name = getPlacementObjectName();
        const crossTypeEl = document.getElementById('crossType');
        const crossType = crossTypeEl ? crossTypeEl.value : 'SNR-ODF-W24';
        const crossPorts = typeof getDefaultPortsForCrossType === 'function'
            ? getDefaultPortsForCrossType(crossType)
            : 24;
        var ccpElPl = document.getElementById('crossCopperPorts');
        var crossCopperPortsPl = ccpElPl ? (parseInt(ccpElPl.value, 10) || 0) : 0;
        if (!createObject(type, name || '', coords, { crossType: crossType, crossPorts: crossPorts, crossCopperPorts: crossCopperPortsPl })) return false;
        currentPlacementName = name || '';
    } else if (type === 'support' || type === 'attachment') {
        const name = document.getElementById('objectName').value.trim();
        var waypointPm = createObject(type, name || '', coords);
        if (!waypointPm) return false;
        if (typeof tryAttachWaypointToNearbyCables === 'function') {
            tryAttachWaypointToNearbyCables(waypointPm, { snap: true, persist: true });
        }
    } else if (type === 'manhole') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
    } else if (type === 'signalPost') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
    } else if (type === 'cabinet') {
        const name = document.getElementById('objectName').value.trim();
        var cabOpts = typeof getCabinetPlacementOptionsFromForm === 'function' ? getCabinetPlacementOptionsFromForm() : {};
        if (!createObject(type, name || '', coords, cabOpts)) return false;
    } else if (type === 'olt') {
        const name = getPlacementObjectName();
        const oltPortsEl = document.getElementById('oltPonPorts');
        const ponPorts = oltPortsEl ? (parseInt(oltPortsEl.value, 10) || 8) : 8;
        const manufacturer = (document.getElementById('oltManufacturer') && document.getElementById('oltManufacturer').value) ? document.getElementById('oltManufacturer').value.trim() : '';
        const model = (document.getElementById('oltModel') && document.getElementById('oltModel').value) ? document.getElementById('oltModel').value.trim() : '';
        if (!createObject(type, name || '', coords, { ponPorts: ponPorts, manufacturer: manufacturer, model: model })) return false;
        currentPlacementName = name || '';
    } else if (type === 'onu') {
        const name = getPlacementObjectName();
        const manufacturer = (document.getElementById('onuManufacturer') && document.getElementById('onuManufacturer').value) ? document.getElementById('onuManufacturer').value.trim() : '';
        const model = (document.getElementById('onuModel') && document.getElementById('onuModel').value) ? document.getElementById('onuModel').value.trim() : '';
        if (!createObject(type, name || '', coords, { manufacturer: manufacturer, model: model })) return false;
        currentPlacementName = name || '';
    } else if (type === 'camera') {
        const name = getPlacementObjectName();
        const manufacturer = (document.getElementById('cameraManufacturer') && document.getElementById('cameraManufacturer').value) ? document.getElementById('cameraManufacturer').value.trim() : '';
        const model = (document.getElementById('cameraModel') && document.getElementById('cameraModel').value) ? document.getElementById('cameraModel').value.trim() : '';
        var camOpts = { manufacturer: manufacturer, model: model };
        if (window.CameraPlayer && typeof CameraPlayer.getPlacementStreamOptions === 'function') {
            Object.assign(camOpts, CameraPlayer.getPlacementStreamOptions());
        }
        if (!createObject(type, name || '', coords, camOpts)) return false;
        currentPlacementName = name || '';
    } else if (type === 'mediaConverter') {
        const nameMc = getPlacementObjectName();
        const manufacturerMc = (document.getElementById('mediaConverterManufacturer') && document.getElementById('mediaConverterManufacturer').value) ? document.getElementById('mediaConverterManufacturer').value.trim() : '';
        const modelMc = (document.getElementById('mediaConverterModel') && document.getElementById('mediaConverterModel').value) ? document.getElementById('mediaConverterModel').value.trim() : '';
        if (!createObject(type, nameMc || '', coords, { manufacturer: manufacturerMc, model: modelMc })) return false;
        currentPlacementName = nameMc || '';
    } else if (type === 'radioBridge') {
        const nameRb = getPlacementObjectName();
        const modeEl = document.getElementById('radioBridgeMode');
        const roleEl = document.getElementById('radioBridgeRole');
        const bridgeMode = modeEl && modeEl.value === 'ptmp' ? 'ptmp' : 'ptp';
        const role = bridgeMode === 'ptp' ? 'ptp' : ((roleEl && roleEl.value === 'ap') ? 'ap' : 'station');
        const manufacturerRb = (document.getElementById('radioBridgeManufacturer') && document.getElementById('radioBridgeManufacturer').value) ? document.getElementById('radioBridgeManufacturer').value.trim() : '';
        const modelRb = (document.getElementById('radioBridgeModel') && document.getElementById('radioBridgeModel').value) ? document.getElementById('radioBridgeModel').value.trim() : '';
        if (!createObject(type, nameRb || '', coords, { bridgeMode: bridgeMode, role: role, manufacturer: manufacturerRb, model: modelRb })) return false;
        currentPlacementName = nameRb || '';
    } else {
        if (!createObject(type, '', coords)) return false;
    }

    removePhantomPlacemark();
    try { if (myMap && myMap.balloon) myMap.balloon.close(); } catch (eCloseBalloon) {}
    return true;
}

let placementPanBlockClickUntil = 0;
const placementPanPointer = { down: false, startX: 0, startY: 0, moved: false };
const PLACEMENT_PAN_DRAG_THRESHOLD_PX = 5;
/** Короткое окно после pan — только чтобы не поставить объект «хвостом» жеста перетаскивания. */
const PLACEMENT_PAN_CLICK_BLOCK_MS = 40;
let placementObjectDragPanSuspended = false;

function suspendMapPanForPlacementObjectDrag() {
    if (!objectPlacementMode || !myMap || !myMap.behaviors || placementObjectDragPanSuspended) return;
    try {
        if (myMap.behaviors.isEnabled('drag')) {
            myMap.behaviors.disable('drag');
            placementObjectDragPanSuspended = true;
        }
    } catch (e) {}
}

function resumeMapPanAfterPlacementObjectDrag() {
    if (!placementObjectDragPanSuspended) return;
    placementObjectDragPanSuspended = false;
    if (typeof syncMapPanLockForEditTools === 'function') syncMapPanLockForEditTools();
    else if (myMap && myMap.behaviors) {
        try { myMap.behaviors.enable('drag'); } catch (e) {}
    }
}

function markPlacemarkJustPlaced(placemark) {
    if (placemark && placemark.properties && objectPlacementMode) {
        placemark.properties.set('justPlacedAt', Date.now());
    }
}

function shouldSkipGroupSnapAfterPlacement(placemark) {
    if (!placemark || !placemark.properties) return false;
    var ts = placemark.properties.get('justPlacedAt');
    if (!ts) return false;
    placemark.properties.set('justPlacedAt', null);
    return true;
}

function bindPlacemarkPlacementDragSupport(placemark) {
    if (!placemark || !placemark.events || placemark.properties.get('placementDragBound')) return;
    placemark.properties.set('placementDragBound', true);
    placemark.events.add('mousedown', function(e) {
        if (!objectPlacementMode || !isEditMode) return;
        var domEvent = e.get && e.get('domEvent');
        if (domEvent && domEvent.button !== 0) return;
        suspendMapPanForPlacementObjectDrag();
    });
    placemark.events.add('dragend', function() {
        resumeMapPanAfterPlacementObjectDrag();
    });
}
window.bindPlacemarkPlacementDragSupport = bindPlacemarkPlacementDragSupport;
window.shouldSkipGroupSnapAfterPlacement = shouldSkipGroupSnapAfterPlacement;

function handleAddObject() {
    try {
    if (isNetworkMapMobileViewOnly()) {
        return;
    }
    if (!isEditMode) {
        if (typeof showInfo === 'function') showInfo('Включите режим «Редактирование»', 'Режим');
        return;
    }
    clearShowOnMapHighlight();

    if (currentCableTool) {
        currentCableTool = false;
        const cableBtn = document.getElementById('addCable');
        if (cableBtn) {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
            cableBtn.style.background = '#3498db';
        }
        clearSelection();
        removeCablePreview();
        cableSource = null;
        cableSourceCopperSwitchId = null;
        cableWaypoints = [];
        cancelUndergroundSpanEdit();
        resetCableUndergroundLayingState(false);
        resetCableUndergroundPendingSpans();
        pendingCopperPortPreset = null;
        pendingCopperRouteFinish = null;
        if (typeof finishOltPortCableLayingSession === 'function') finishOltPortCableLayingSession();
        if (typeof finishRadioBridgePortCableLayingSession === 'function') finishRadioBridgePortCableLayingSession();
        copperCableLayingActive = false;
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
    }

    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    if (radioBridgeRoutingMode && typeof cancelRadioBridgeRouting === 'function') {
        cancelRadioBridgeRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }

    const objectTypeEl = document.getElementById('objectType');
    if (!objectTypeEl) return;
    const type = objectTypeEl.value;

    if (type === 'node' || type === 'cross') {
        const name = document.getElementById('objectName').value.trim();
        if (!name) {
            
            if (objectPlacementMode) {
                cancelObjectPlacement();
            }
            showWarning(type === 'cross' ? 'Введите имя кросса' : 'Введите имя узла', 'Требуется имя');
            return;
        }

        if (type === 'node') {
            const nodeKindSelect = document.getElementById('nodeKind');
            currentPlacementNodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
        }

        var formCoords = getObjectPlacementCoordsFromForm();
        if (formCoords === false) return;
        if (formCoords) {
            currentPlacementType = type;
            currentPlacementName = name || '';
            if (placeObjectAtCoords(formCoords)) {
                clearObjectPlacementCoordsForm();
                if (myMap) {
                    try { myMap.setCenter(formCoords, myMap.getZoom(), { duration: typeof mapMotionDuration === 'function' ? mapMotionDuration(200) : 200 }); } catch (e) {}
                }
            }
            return;
        }
        
        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = name;
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            if (mapEl) {
                mapEl.style.cursor = 'crosshair';
                mapEl.classList.add('map-crosshair-active');
            }
        }
        setAddObjectButtonPlacementMode(true);
    } else {
        var formCoordsOther = getObjectPlacementCoordsFromForm();
        if (formCoordsOther === false) return;
        if (formCoordsOther) {
            currentPlacementType = type;
            currentPlacementName = '';
            if (placeObjectAtCoords(formCoordsOther)) {
                clearObjectPlacementCoordsForm();
                if (myMap) {
                    try { myMap.setCenter(formCoordsOther, myMap.getZoom(), { duration: typeof mapMotionDuration === 'function' ? mapMotionDuration(200) : 200 }); } catch (e) {}
                }
            }
            return;
        }

        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = '';
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            if (mapEl) {
                mapEl.style.cursor = 'crosshair';
                mapEl.classList.add('map-crosshair-active');
            }
        }
        setAddObjectButtonPlacementMode(true);
    }
    } finally {
        syncMapPanLockForEditTools();
    }
}

function cancelObjectPlacement() {
    objectPlacementMode = false;
    currentPlacementType = null;
    currentPlacementName = null;
    placementPanBlockClickUntil = 0;
    placementPanPointer.down = false;
    placementPanPointer.moved = false;
    removePhantomPlacemark();
    removePlacementCoordsPreview();
    if (cursorIndicator) cursorIndicator.style.display = 'none';
    if (hoveredObject) clearHoverHighlight();
    if (myMap && myMap.container) {
        const mapEl = myMap.container.getElement();
        if (!currentCableTool) {
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
    }
    
    setAddObjectButtonPlacementMode(false);
    syncMapPanLockForEditTools();
}

var OBJECT_TYPE_STORAGE_KEY = 'networkMap_objectType';
var CABLE_TYPE_STORAGE_KEY = 'networkMap_cableType';
var OBJECT_TYPE_LABELS = {
    support: 'Опоры',
    sleeve: 'Муфты',
    cross: 'Кроссы',
    attachment: 'Крепления',
    manhole: 'Колодцы',
    signalPost: 'Столбы',
    cabinet: 'Ящики',
    olt: 'OLT',
    splitter: 'Сплиттер',
    onu: 'ONU',
    node: 'Узел',
    camera: 'Камера',
    mediaConverter: 'Медиаконв.',
    radioBridge: 'Радиомост'
};

var OBJECT_TYPE_CHIP_ICONS = {
    support: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="21"/><circle cx="12" cy="5" r="2"/></svg>',
    sleeve: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/></svg>',
    cross: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
    attachment: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.07l-1.6 1.6"/><path d="M14 11a5 5 0 0 0-7.54-.54l-2.92 2.92a5 5 0 0 0 7.07 7.07l1.6-1.6"/></svg>',
    manhole: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    signalPost: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="4" x2="12" y2="20"/><rect x="7" y="6" width="10" height="5" rx="1"/></svg>',
    cabinet: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="14" rx="2"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="16" x2="20" y2="16"/></svg>',
    olt: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><line x1="8" y1="7" x2="8.01" y2="7" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="17" x2="8.01" y2="17" stroke-width="3" stroke-linecap="round"/></svg>',
    onu: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="7" width="14" height="11" rx="2"/><line x1="8" y1="11" x2="8.01" y2="11" stroke-width="3" stroke-linecap="round"/><line x1="12" y1="11" x2="12.01" y2="11" stroke-width="3" stroke-linecap="round"/><line x1="16" y1="11" x2="16.01" y2="11" stroke-width="3" stroke-linecap="round"/></svg>',
    node: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><line x1="8" y1="7" x2="8.01" y2="7" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="17" x2="8.01" y2="17" stroke-width="3" stroke-linecap="round"/></svg>',
    camera: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    mediaConverter: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
    radioBridge: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3a9 9 0 0 0-9 9"/><path d="M12 7a5 5 0 0 0-5 5"/><rect x="8" y="14" width="8" height="6" rx="1"/></svg>'
};

function ensureObjectTypeChipIcons() {
    document.querySelectorAll('.object-type-chip[data-type]').forEach(function(chip) {
        if (chip.querySelector('.object-type-chip__icon')) return;
        var type = chip.getAttribute('data-type');
        var icon = OBJECT_TYPE_CHIP_ICONS[type];
        if (!icon) return;
        var label = (OBJECT_TYPE_LABELS[type] || chip.textContent || '').trim();
        chip.innerHTML =
            '<span class="object-type-chip__icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="object-type-chip__label">' + (typeof escapeHtml === 'function' ? escapeHtml(label) : label) + '</span>';
    });
}

function getObjectTypeLabel(type) {
    return OBJECT_TYPE_LABELS[type] || type || '';
}

function syncObjectsAccordionContentHeight() {
    var content = document.getElementById('objects-content');
    if (!content) return;
    var section = content.closest('.accordion-section');
    if (!section || !section.classList.contains('active')) {
        content.style.maxHeight = '';
        return;
    }
    content.style.maxHeight = '';
}

function ensureObjectsAddButtonVisible() {
    var footer = document.querySelector('.accordion-section--objects.active .objects-add-footer');
    var sidebar = document.querySelector('.sidebar-content');
    if (!footer || !sidebar) return;
    requestAnimationFrame(function() {
        var footerRect = footer.getBoundingClientRect();
        var sidebarRect = sidebar.getBoundingClientRect();
        if (footerRect.bottom > sidebarRect.bottom - 8) {
            sidebar.scrollTop += footerRect.bottom - sidebarRect.bottom + 12;
        }
        if (footerRect.top < sidebarRect.top + 4) {
            sidebar.scrollTop -= sidebarRect.top - footerRect.top + 4;
        }
    });
}

function setupObjectsAccordionAutoHeight() {
    var content = document.getElementById('objects-content');
    if (!content || content._objectsAccordionHeightBound) return;
    content._objectsAccordionHeightBound = true;

    function onObjectsPanelLayoutChange() {
        syncObjectsAccordionContentHeight();
        ensureObjectsAddButtonVisible();
    }

    document.addEventListener('toggle', function(e) {
        var t = e.target;
        if (!t || !content.contains(t)) return;
        if (t.classList && (
            t.classList.contains('object-settings-advanced') ||
            t.classList.contains('object-placement-coords-card--collapsible')
        )) {
            requestAnimationFrame(onObjectsPanelLayoutChange);
            setTimeout(onObjectsPanelLayoutChange, 50);
            setTimeout(onObjectsPanelLayoutChange, 380);
        }
    }, true);

    var objectsHeader = document.querySelector('[data-accordion="objects"]');
    if (objectsHeader) {
        objectsHeader.addEventListener('click', function() {
            setTimeout(onObjectsPanelLayoutChange, 50);
            setTimeout(onObjectsPanelLayoutChange, 380);
        });
    }

    var objectTypeSelect = document.getElementById('objectType');
    if (objectTypeSelect) {
        objectTypeSelect.addEventListener('change', function() {
            requestAnimationFrame(onObjectsPanelLayoutChange);
            setTimeout(onObjectsPanelLayoutChange, 50);
            setTimeout(onObjectsPanelLayoutChange, 200);
        });
    }

    window.addEventListener('resize', onObjectsPanelLayoutChange);

    requestAnimationFrame(onObjectsPanelLayoutChange);
}

function syncObjectTypePickerUI() {
    var select = document.getElementById('objectType');
    if (!select) return;
    var val = select.value;
    document.querySelectorAll('.object-type-chip').forEach(function(chip) {
        var active = chip.getAttribute('data-type') === val;
        chip.classList.toggle('object-type-chip--active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var badge = document.getElementById('objectTypeBadge');
    if (badge) badge.textContent = getObjectTypeLabel(val);
}

function setupObjectTypePicker() {
    var select = document.getElementById('objectType');
    if (!select) return;
    ensureObjectTypeChipIcons();
    try {
        var stored = localStorage.getItem(OBJECT_TYPE_STORAGE_KEY);
        if (stored && select.querySelector('option[value="' + stored + '"]')) {
            select.value = stored;
        }
    } catch (e) {}
    document.querySelectorAll('.object-type-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            var type = chip.getAttribute('data-type');
            if (!type || select.value === type) return;
            select.value = type;
            select.dispatchEvent(new Event('change'));
        });
    });
    syncObjectTypePickerUI();
    setupObjectsAccordionAutoHeight();
    setupOltPlacementCatalogHandlers();
}

function setupOltPlacementCatalogHandlers() {
    var oltModelEl = document.getElementById('oltModel');
    if (oltModelEl && !oltModelEl._oltCatalogBound) {
        oltModelEl._oltCatalogBound = true;
        oltModelEl.addEventListener('change', function() {
            if (typeof syncOltPlacementPortsFromCatalog === 'function') syncOltPlacementPortsFromCatalog();
        });
        oltModelEl.addEventListener('input', function() {
            if (typeof syncOltPlacementPortsFromCatalog === 'function') syncOltPlacementPortsFromCatalog();
        });
    }
}

function getCableTypeLabel(type) {
    if (window.FiberCableConfig && window.FiberCableConfig.isOpticalCableType(type)) {
        var n = window.FiberCableConfig.getLayFiberCount();
        return 'ВОЛС, ' + n + ' ж.';
    }
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var m = window.MapLegendConfig.getCableMeta(type);
        if (m) return m.short;
    }
    return getCableDescription(type);
}

function syncCableTypePickerUI() {
    var select = document.getElementById('cableType');
    var badge = document.getElementById('cableTypeBadge');
    var copperActive = typeof copperCableLayingActive !== 'undefined' && copperCableLayingActive;
    if (badge) {
        badge.textContent = copperActive ? 'Медь' : getCableTypeLabel(select ? select.value : 'fiber4');
    }
    if (!select || copperActive) return;
    var val = select.value;
    document.querySelectorAll('.cable-type-chip').forEach(function(chip) {
        chip.classList.toggle('cable-type-chip--active', chip.getAttribute('data-cable') === val);
    });
}

function setupCableTypePicker() {
    if (window.MapLegendConfig) {
        if (window.MapLegendConfig.renderSidebarLegend) {
            window.MapLegendConfig.renderSidebarLegend('legend-content');
        }
        if (window.MapLegendConfig.renderCableTypePicker) {
            window.MapLegendConfig.renderCableTypePicker('cableTypePicker');
        }
    }
    if (window.FiberCableConfig && window.FiberCableConfig.setupLayFiberControls) {
        window.FiberCableConfig.setupLayFiberControls();
    }
    var select = document.getElementById('cableType');
    if (!select) return;
    if (!select.querySelector('option[value="fiber"]')) {
        select.innerHTML = '<option value="fiber">ВОЛС</option>';
    }
    select.value = 'fiber';
    syncCableTypePickerUI();
    if (!select._cableSelectBound) {
        select._cableSelectBound = true;
        select.addEventListener('change', function() {
            syncCableTypePickerUI();
        });
    }
    var layCount = document.getElementById('layFiberCount');
    if (layCount && !layCount._badgeSyncBound) {
        layCount._badgeSyncBound = true;
        layCount.addEventListener('change', syncCableTypePickerUI);
        layCount.addEventListener('input', syncCableTypePickerUI);
    }
}

function setAddObjectButtonPlacementMode(active) {
    var addBtn = document.getElementById('addObject');
    if (!addBtn) return;
    var iconCancel = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    var iconAdd = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    if (active) {
        addBtn.classList.add('btn-add-object--placement');
        addBtn.innerHTML = iconCancel + '<span class="btn-add-object-text">Завершить размещение</span>';
        addBtn.onclick = cancelObjectPlacement;
    } else {
        addBtn.classList.remove('btn-add-object--placement');
        addBtn.innerHTML = iconAdd + '<span class="btn-add-object-text">Добавить на карту</span>';
        addBtn.onclick = null;
    }
}

/** На touch при размещении объектов pan отключён — иначе не двигается «фантом». На мыши pan включён. */
function isMapPanLockedForObjectPlacement() {
    if (!objectPlacementMode) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

function isCableLayingWithSource() {
    return !!(currentCableTool && cableSource && isEditMode);
}

/** На touch при прокладке кабеля (есть начальная точка) pan отключён; на мыши — ЛКМ перетаскивает карту. */
function isMapPanLockedForCableTool() {
    if (!isCableLayingWithSource()) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

/** На touch при прокладке GPON-жилы (OLT, ONU, сплиттер) pan отключён; на мыши — ЛКМ перетаскивает карту. */
function isMapPanLockedForFiberRouting() {
    if (!fiberRoutingMode && !splitterFiberRoutingMode && !radioBridgeRoutingMode) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

function isMapPanDragTrackingActive() {
    return objectPlacementMode || isCableLayingWithSource() || fiberRoutingMode || splitterFiberRoutingMode || radioBridgeRoutingMode;
}

/**
 * На сенсорных экранах поведение «перетаскивание» карты перехватывает движение пальца,
 * из‑за чего не срабатывает предпросмотр кабеля / «фантом» при размещении объектов.
 * Пока активны эти режимы, отключаем pan (drag); масштаб жестами и кнопками зума сохраняется.
 * На мыши в размещении объектов, прокладке кабеля и GPON-жил pan (ЛКМ + перетаскивание) включён; клик после pan не ставит точку.
 */
function syncMapPanLockForEditTools() {
    if (!myMap || !myMap.behaviors) return;
    var lockPan = !!(isMapPanLockedForObjectPlacement() || isMapPanLockedForCableTool() ||
        isMapPanLockedForFiberRouting() || cableSplitMode);
    try {
        var dragEnabled = myMap.behaviors.isEnabled('drag');
        if (lockPan && dragEnabled) myMap.behaviors.disable('drag');
        else if (!lockPan && !dragEnabled) myMap.behaviors.enable('drag');
    } catch (err) {}
}

function setupObjectPlacementPanDrag() {
    if (!myMap || !myMap.container) return;
    var el = myMap.container.getElement();
    if (!el || el.dataset.placementPanDragBound) return;
    el.dataset.placementPanDragBound = '1';

    el.addEventListener('mousedown', function(e) {
        if (e.button !== 0 || !isMapPanDragTrackingActive()) return;
        placementPanBlockClickUntil = 0;
        placementPanPointer.down = true;
        placementPanPointer.startX = e.clientX;
        placementPanPointer.startY = e.clientY;
        placementPanPointer.moved = false;
    });

    document.addEventListener('mousemove', function(e) {
        if (!placementPanPointer.down || !isMapPanDragTrackingActive()) return;
        if (!placementPanPointer.moved) {
            var dx = e.clientX - placementPanPointer.startX;
            var dy = e.clientY - placementPanPointer.startY;
            if (dx * dx + dy * dy > PLACEMENT_PAN_DRAG_THRESHOLD_PX * PLACEMENT_PAN_DRAG_THRESHOLD_PX) {
                placementPanPointer.moved = true;
            }
        }
    });

    document.addEventListener('mouseup', function() {
        if (!placementPanPointer.down) {
            resumeMapPanAfterPlacementObjectDrag();
            return;
        }
        placementPanPointer.down = false;
        if (placementPanPointer.moved && isMapPanDragTrackingActive()) {
            placementPanBlockClickUntil = Date.now() + PLACEMENT_PAN_CLICK_BLOCK_MS;
        }
        resumeMapPanAfterPlacementObjectDrag();
    });
}
