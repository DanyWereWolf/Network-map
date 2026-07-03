/**
 * Режим просмотра/редактирования, иконки объектов, импорт файла.
 */
function handleFileImport(e) {
    if (typeof requireAdmin === 'function' && !requireAdmin()) {
        if (e.target) e.target.value = '';
        return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const fileInput = e.target;
    const reader = new FileReader();
    reader.onload = function(ev) {
        (async function() {
        try {
            const raw = ev.target.result;
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) {
                showError('Файл должен содержать массив объектов карты (JSON-массив).', 'Импорт');
                fileInput.value = '';
                return;
            }
            
            if (objects.length > 0 && !(await showConfirm('Текущая карта будет полностью заменена импортируемыми данными. Продолжить?', 'Импорт', { confirmText: 'Продолжить' }))) {
                fileInput.value = '';
                return;
            }
            clearMap();
            importData(data);
            // После импорта фиксируем состояние, чтобы оно не терялось при перезагрузке.
            saveData({ syncFull: true });
            showSuccess('Карта импортирована (' + data.length + ' объектов)', 'Импорт');
            logAction(ActionTypes.IMPORT_DATA, { count: data.length });
        } catch (error) {
            console.error('Ошибка при импорте файла:', error);
            showError('Ошибка при чтении файла. Проверьте, что выбран корректный JSON-файл экспорта карты.', 'Импорт');
        }
        fileInput.value = '';
        })();
    };
    reader.readAsText(file);
}

/** Узкая ширина как у телефона: только просмотр (согласовано с app-mobile.css, 768px). */
function isNetworkMapMobileViewOnly() {
    try {
        return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
    } catch (e) {
        return false;
    }
}

function switchToViewMode(silent) {
    const wasEditMode = isEditMode;
    isEditMode = false;
    currentCableTool = false;
    copperCableLayingActive = false;
    cableSource = null;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    if (typeof clearCabinetCableSourceHighlight === 'function') clearCabinetCableSourceHighlight();
    cancelUndergroundSpanEdit();
    resetCableUndergroundLayingState(false);
    resetCableUndergroundPendingSpans();
    pendingCopperPortPreset = null;
    pendingCopperRouteFinish = null;
    if (typeof finishOltPortCableLayingSession === 'function') finishOltPortCableLayingSession();
    if (typeof finishRadioBridgePortCableLayingSession === 'function') finishRadioBridgePortCableLayingSession();

    if (objectPlacementMode) {
        cancelObjectPlacement();
    }
    
    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }

    if (cableSplitMode) {
        cancelCableSplitMode();
    }

    if (regionDrawMode && typeof cancelRegionDraw === 'function') cancelRegionDraw();
    
    if (wasEditMode && !silent) {
        showInfo('Переключено в режим просмотра', 'Режим');
    }
    
    removeCablePreview();
    updateUIForMode();
    
    clearSelection();

    if (hoveredObject) {
        clearHoverHighlight();
    }
    if (myMap && myMap.container) {
        const mapEl = myMap.container.getElement();
        mapEl.style.cursor = '';
        mapEl.classList.remove('map-crosshair-active');
    }
    
    updateEditControls();
    makeObjectsNonDraggable();
    syncMapPanLockForEditTools();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
    if (infoModalEditModeSession && currentModalObject) {
        infoModalEditMode = false;
        if (typeof releaseHeldObjectLock === 'function') releaseHeldObjectLock();
        if (typeof refreshObjectModal === 'function') refreshObjectModal(currentModalObject);
    }
}

function switchToEditMode() {
    
    if (!canEdit()) {
        showWarning('Редактирование доступно только администраторам', 'Нет доступа');
        return;
    }

    if (isNetworkMapMobileViewOnly()) {
        var inApp = false;
        try {
            inApp = window.__VOLSMAP_ANDROID__ === true
                || (window.VolsmapAndroid && typeof window.VolsmapAndroid.isApp === 'function' && window.VolsmapAndroid.isApp());
        } catch (e) {}
        showInfo(
            inApp
                ? 'В мобильном приложении доступен просмотр. Редактирование карты — с компьютера.'
                : 'На этом экране доступен только просмотр. Редактирование карты — с компьютера или планшета (ширина окна больше 768px).',
            'Режим'
        );
        return;
    }
    
    isEditMode = true;
    updateUIForMode();
    updateEditControls();
    makeObjectsDraggable();
    showInfo('Переключено в режим редактирования', 'Режим');
    syncMapPanLockForEditTools();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
}

function updateUIForMode() {
    const viewBtn = document.getElementById('viewMode');
    const editBtn = document.getElementById('editMode');
    
    if (viewBtn) viewBtn.classList.toggle('active', !isEditMode);
    if (editBtn) editBtn.classList.toggle('active', isEditMode);
}

function updateEditControls() {
    const editControls = document.querySelectorAll('#addObject, #addCable, #drawRegionBtn');
    editControls.forEach(control => {
        control.style.opacity = isEditMode ? '1' : '0.5';
        control.style.pointerEvents = isEditMode ? 'all' : 'none';
    });
}

function makeObjectsDraggable() {
    objects.forEach(obj => {
        if (!obj.options || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cable' || t === 'region') return;
        obj.options.set('draggable', true);
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
}

function makeObjectsNonDraggable() {
    objects.forEach(obj => {
        if (!obj.options || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cable' || t === 'region') return;
        obj.options.set('draggable', false);
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
}

function getNodeColorByKind(nodeKind) {
    return nodeKind === 'aggregation' ? '#ef4444' : '#22c55e';
}

function buildMapPlacemarkIcon(type, variant, source) {
    if (!window.MapIcons) return null;
    var opts = { variant: variant || 'normal' };
    if (type === 'node') {
        if (source && source.properties) {
            opts.nodeKind = source.properties.get('nodeKind') || 'network';
        } else if (source && source.nodeKind) {
            opts.nodeKind = source.nodeKind;
        } else if (typeof currentPlacementNodeKind === 'string') {
            opts.nodeKind = currentPlacementNodeKind;
        } else {
            var nodeKindSelect = document.getElementById('nodeKind');
            opts.nodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
        }
    }
    if (type === 'crossGroup') {
        if (source && source.properties) {
            var crossGroup = source.properties.get('crossGroup');
            opts.groupCount = crossGroup ? crossGroup.length : 1;
        } else if (source && source.groupCount != null) {
            opts.groupCount = source.groupCount;
        }
    }
    if (type === 'nodeGroup') {
        if (source && source.properties) {
            var nodeGroup = source.properties.get('nodeGroup');
            opts.groupCount = nodeGroup ? nodeGroup.length : 1;
            var displayNodes = source.properties.get('displayNodes');
            if (displayNodes && displayNodes.length) {
                opts.hasAggregation = displayNodes.some(function (nd) {
                    return nd.properties && nd.properties.get('nodeKind') === 'aggregation';
                });
            }
        } else if (source) {
            if (source.groupCount != null) opts.groupCount = source.groupCount;
            if (source.hasAggregation) opts.hasAggregation = true;
        }
    }
    if (type === 'camera' && source && source.properties && window.CameraPlayer) {
        opts.cameraOnline = CameraPlayer.isCameraOnline(source);
    }
    return MapIcons.buildPlacemarkIcon(type, opts);
}

function applyMapPlacemarkIcon(target, type, variant, source) {
    var icon = buildMapPlacemarkIcon(type, variant, source);
    if (!icon) return null;
    if (target && target.options) {
        target.options.set({
            iconImageHref: icon.href,
            iconImageSize: icon.iconImageSize,
            iconImageOffset: icon.iconImageOffset
        });
    }
    return icon;
}

/** Пересобрать SVG-иконки на карте после смены светлой/тёмной темы. */
function refreshMapPlacemarkIcons() {
    if (!window.MapIcons || typeof objects === 'undefined') return;

    var hoverIconTypes = ['support', 'sleeve', 'spliceCassette', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment', 'manhole', 'signalPost', 'cabinet'];

    objects.forEach(function(obj) {
        if (!obj || !obj.properties || !obj.options) return;
        var type = obj.properties.get('type');
        if (!type || type === 'cable' || type === 'cableLabel') return;
        var variant = 'normal';
        if (selectedObjects.indexOf(obj) >= 0) {
            if (!(isEditMode && type !== 'crossGroup' && type !== 'nodeGroup')) {
                variant = 'selected';
            }
        }
        if (hoveredObject === obj && hoverIconTypes.indexOf(type) >= 0) {
            variant = 'hover';
        }
        applyMapPlacemarkIcon(obj, type, variant, obj);
    });

    if (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks)) {
        crossGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            var variant = selectedObjects.indexOf(pm) >= 0 ? 'selected' : 'normal';
            if (hoveredObject === pm) variant = 'hover';
            applyMapPlacemarkIcon(pm, 'crossGroup', variant, pm);
        });
    }
    if (typeof nodeGroupPlacemarks !== 'undefined' && Array.isArray(nodeGroupPlacemarks)) {
        nodeGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            var variant = selectedObjects.indexOf(pm) >= 0 ? 'selected' : 'normal';
            if (hoveredObject === pm) variant = 'hover';
            applyMapPlacemarkIcon(pm, 'nodeGroup', variant, pm);
        });
    }

    if (phantomPlacemark && phantomPlacemark.properties && phantomPlacemark.options) {
        var phantomType = phantomPlacemark.properties.get('phantomType');
        if (phantomType) {
            var phantomIcon = buildMapPlacemarkIcon(phantomType, 'phantom', phantomType === 'node' ? { nodeKind: currentPlacementNodeKind } : null);
            if (phantomIcon) {
                phantomPlacemark.options.set({
                    iconImageHref: phantomIcon.href,
                    iconImageSize: phantomIcon.iconImageSize,
                    iconImageOffset: phantomIcon.iconImageOffset
                });
            }
        }
    }

    var infoModal = document.getElementById('infoModal');
    if (currentModalObject && isInfoModalVisible(infoModal) && typeof updateInfoModalChrome === 'function') {
        var modalType = currentModalObject.properties.get('type');
        var modalName = currentModalObject.properties.get('name') || '';
        var fiberWs = false;
        if (isFiberHostType(modalType) && typeof getConnectedCables === 'function') {
            fiberWs = getConnectedCables(currentModalObject).length >= 1;
        }
        updateInfoModalChrome(modalType, modalName, { fiberWorkspace: fiberWs });
        var modalBody = document.getElementById('modalInfo');
        if (modalBody && window.MapIcons) {
            modalBody.querySelectorAll('.camera-card-hero-icon, .olt-card-hero-icon, .cassette-card-hero-icon, .support-card-hero-icon, .node-card-hero-icon, .fiber-ws-head-icon').forEach(function(el) {
                var card = el.closest('.camera-card, .olt-card, .support-card, .fiber-workspace-sidebar');
                if (!card) return;
                var iconType = modalType;
                if (card.classList.contains('support-card--attachment')) iconType = 'attachment';
                else if (card.classList.contains('fiber-workspace-sidebar')) {
                    iconType = currentModalObject.properties.get('type');
                }
                var iconOpts = { variant: 'normal' };
                if (iconType === 'node' && currentModalObject.properties) {
                    iconOpts.nodeKind = currentModalObject.properties.get('nodeKind') || 'network';
                }
                if (iconType === 'camera' && window.CameraPlayer) {
                    iconOpts.cameraOnline = CameraPlayer.isCameraOnline(currentModalObject);
                }
                el.innerHTML = MapIcons.buildIconSvg(iconType, iconOpts);
            });
        }
    }
}
