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
            type: 'coordsPreview',
            balloonContent: 'Предпросмотр: ' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)
        }, {
            iconLayout: 'default#image',
            iconImageHref: previewIcon.href,
            iconImageSize: previewIcon.iconImageSize,
            iconImageOffset: previewIcon.iconImageOffset,
            zIndex: 9998,
            interactive: false
        });
    } else {
        placementCoordsPreviewPlacemark = new ymaps.Placemark(coords, {
            balloonContent: coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)
        }, {
            preset: 'islands#orangeCircleDotIcon',
            zIndex: 9998,
            interactive: false
        });
    }

    myMap.geoObjects.add(placementCoordsPreviewPlacemark);

    var zoom = myMap.getZoom();
    if (typeof zoom !== 'number' || zoom < 17) zoom = 17;
    if (zoom > 19) zoom = 19;
    try { myMap.setCenter(coords, zoom, { duration: 300 }); } catch (e) {}
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
        return groupKey(coords) === groupKey(objCoords);
    }
    return Math.abs(objCoords[0] - coords[0]) < PLACEMENT_COORD_EPS &&
        Math.abs(objCoords[1] - coords[1]) < PLACEMENT_COORD_EPS;
}

function getPlacemarksAtCoords(coords, placementType) {
    if (!coords || coords.length < 2) return [];
    var found = [];
    objects.forEach(function(obj) {
        if (!obj || !obj.geometry || !obj.properties) return;
        var objType = obj.properties.get('type');
        if (objType === 'cable' || objType === 'cableLabel') return;
        try {
            var objCoords = obj.geometry.getCoordinates();
            if (coordsMatchForPlacement(coords, objCoords, placementType)) {
                found.push(obj);
            }
        } catch (error) {}
    });
    return found;
}

function canPlaceObjectAtCoords(coords, type) {
    var atPoint = getPlacemarksAtCoords(coords, type);
    if (!atPoint.length) return true;
    var groupType = getObjectPlacementGroupType(type);
    if (!groupType) return false;
    return atPoint.every(function(obj) {
        return obj.properties.get('type') === groupType;
    });
}

function resolvePlacementCoordsForGrouping(coords, type) {
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
        var groupType = getObjectPlacementGroupType(type);
        if (groupType) {
            showWarning('В этой точке уже есть объект другого типа. Узлы и кроссы можно ставить только в группу с объектами того же типа.', 'Размещение');
        } else {
            showWarning('В этой точке уже есть объект', 'Размещение');
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
        const maxFibers = parseInt(document.getElementById('sleeveMaxFibers').value) || 0;
        if (!createObject(type, sleeveName || '', coords, { sleeveType: sleeveType, maxFibers: maxFibers })) return false;
    } else if (type === 'cross') {
        const name = getPlacementObjectName();
        const crossPorts = parseInt(document.getElementById('crossPorts').value) || 24;
        var ccpElPl = document.getElementById('crossCopperPorts');
        var crossCopperPortsPl = ccpElPl ? (parseInt(ccpElPl.value, 10) || 0) : 0;
        if (!createObject(type, name || '', coords, { crossPorts: crossPorts, crossCopperPorts: crossCopperPortsPl })) return false;
        currentPlacementName = name || '';
    } else if (type === 'support') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
    } else if (type === 'attachment') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
    } else if (type === 'manhole') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
    } else if (type === 'signalPost') {
        const name = document.getElementById('objectName').value.trim();
        if (!createObject(type, name || '', coords)) return false;
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
    } else {
        if (!createObject(type, '', coords)) return false;
    }

    removePhantomPlacemark();
    return true;
}

let placementPanBlockClickUntil = 0;
const placementPanPointer = { down: false, startX: 0, startY: 0, moved: false };
const PLACEMENT_PAN_DRAG_THRESHOLD_PX = 5;
/** Короткое окно после pan — только чтобы не поставить объект «хвостом» жеста перетаскивания. */
const PLACEMENT_PAN_CLICK_BLOCK_MS = 40;

function handleAddObject() {
    try {
    if (isNetworkMapMobileViewOnly()) {
        return;
    }
    if (!isEditMode) {
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
                saveData();
                clearObjectPlacementCoordsForm();
                if (myMap) {
                    try { myMap.setCenter(formCoords, myMap.getZoom(), { duration: 200 }); } catch (e) {}
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
                saveData();
                clearObjectPlacementCoordsForm();
                if (myMap) {
                    try { myMap.setCenter(formCoordsOther, myMap.getZoom(), { duration: 200 }); } catch (e) {}
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
    olt: 'OLT',
    splitter: 'Сплиттер',
    onu: 'ONU',
    node: 'Узел',
    camera: 'Камера',
    mediaConverter: 'Медиаконв.'
};

function getObjectTypeLabel(type) {
    return OBJECT_TYPE_LABELS[type] || type || '';
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
    if (!fiberRoutingMode && !splitterFiberRoutingMode) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

function isMapPanDragTrackingActive() {
    return objectPlacementMode || isCableLayingWithSource() || fiberRoutingMode || splitterFiberRoutingMode;
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
        if (lockPan) myMap.behaviors.disable('drag');
        else myMap.behaviors.enable('drag');
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
        if (!placementPanPointer.down) return;
        placementPanPointer.down = false;
        if (placementPanPointer.moved && isMapPanDragTrackingActive()) {
            placementPanBlockClickUntil = Date.now() + PLACEMENT_PAN_CLICK_BLOCK_MS;
        }
    });
}
