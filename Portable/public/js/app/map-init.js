/**
 * Инициализация Yandex Maps и обработчики UI карты.
 */
function init() {
    var initialCenter = [54.663609, 86.162243];
    var initialZoom = 16;
    if (window._pendingMapStart && Array.isArray(window._pendingMapStart.center)) {
        initialCenter = window._pendingMapStart.center;
        initialZoom = window._pendingMapStart.zoom || 16;
    }
    var focusOnce = null;
    try {
        focusOnce = JSON.parse(sessionStorage.getItem('volsmap.mapFocusOnce') || 'null');
        sessionStorage.removeItem('volsmap.mapFocusOnce');
    } catch (eFocus) { focusOnce = null; }
    var mapState = {
        center: initialCenter,
        zoom: initialZoom,
        controls: []
    };
    try {
        var bootType = (typeof MapRuntime !== 'undefined' && MapRuntime.getLastBasemapType)
            ? MapRuntime.getLastBasemapType()
            : (window.VolsmapBootBasemapType || null);
        if (bootType && String(bootType).indexOf('yandex#') === 0 &&
            !(ymaps.meta && ymaps.meta.engine === 'leaflet-shim')) {
            mapState.type = bootType;
        } else if (bootType && String(bootType).indexOf('leaflet#') === 0) {
            mapState.type = bootType;
        }
    } catch (eBootType) {}
    myMap = new ymaps.Map('map', mapState);
    if (window._pendingMapStart) {
        window._mapStartApplied = true;
        window._pendingMapStart = null;
    }
    if (focusOnce && Array.isArray(focusOnce.bounds) && focusOnce.bounds.length === 2) {
        try {
            myMap.setBounds(focusOnce.bounds, { checkZoomRange: true, zoomMargin: 40 });
            window._mapFocusOnceActive = true;
        } catch (eBounds) { /* остаётся начальная точка */ }
    }
    
    try { myMap.controls.remove('searchControl'); } catch (e) {}
    try { myMap.controls.remove('trafficControl'); } catch (e) {}
    try { myMap.controls.remove('geolocationControl'); } catch (e) {}
    try { myMap.controls.remove('rulerControl'); } catch (e) {}
    try { myMap.controls.remove('fullscreenControl'); } catch (e) {}
    try { myMap.controls.remove('typeSelector'); } catch (e) {}

    // Сразу нужный слой (boot-кэш), только если рантайм уже совпадает — без recreate
    (function applyBootBasemapType() {
        var bootType = null;
        try {
            if (typeof MapRuntime !== 'undefined' && MapRuntime.getLastBasemapType) {
                bootType = MapRuntime.getLastBasemapType();
            }
        } catch (e1) {}
        if (!bootType) {
            try { bootType = window.VolsmapBootBasemapType || null; } catch (e2) {}
        }
        if (!bootType || !myMap || typeof myMap.setType !== 'function') return;
        var wantYandex = String(bootType).indexOf('yandex#') === 0;
        var active = 'leaflet';
        try {
            if (typeof MapRuntime !== 'undefined' && MapRuntime.getActiveRuntime) {
                active = MapRuntime.getActiveRuntime();
            } else if (typeof MapEngine !== 'undefined' && MapEngine.getEngine) {
                active = MapEngine.getEngine();
            } else if (window.VolsmapMapEngine) {
                active = window.VolsmapMapEngine;
            }
        } catch (eAct) {}
        if ((wantYandex && active !== 'yandex') || (!wantYandex && active !== 'leaflet')) {
            return;
        }
        try { myMap.setType(bootType); } catch (e3) {}
        if (typeof MapRuntime !== 'undefined' && MapRuntime.persistBasemapType) {
            try { MapRuntime.persistBasemapType(bootType); } catch (e4) {}
        }
    })();

    setupMapLayerSelector();
    try { myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e) {}

    createCursorIndicator();

    window.lastMouseX = 0;
    window.lastMouseY = 0;

    myMap.options.set('suppressMapOpenBlock', true);
    
    loadData();
    setupEventListeners();
    setupObjectPlacementPanDrag();
    setupRectSelection();
    if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    
    setTimeout(function() {
        if (lastSavedState === null && typeof getSerializedData === 'function') lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    }, 0);
    switchToViewMode(false);
    syncMapPanLockForEditTools();

    (function setupMobileReadonlyResizeGuard() {
        var resizeTimer = null;
        window.addEventListener('resize', function() {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly() && isEditMode) {
                    switchToViewMode(true);
                }
            }, 200);
        });
    })();

    setupMapTilesReady();
    // Dual: прогрев второго движка + заливка объектов параллельно с loadData
    if (typeof MapRuntime !== 'undefined' && MapRuntime.scheduleWarmOpposite) {
        try { MapRuntime.scheduleWarmOpposite(200); } catch (eWarmInit) {}
    }
}

/** On-prem (mapEngine=leaflet): доступны и Яндекс, и ортофото — независимо. */
function isBasemapDualMode() {
    try {
        if (typeof MapEngine !== 'undefined' && MapEngine.isDualMode) return !!MapEngine.isDualMode();
        if (typeof MapEngine !== 'undefined' && MapEngine.getConfiguredEngine) {
            return MapEngine.getConfiguredEngine() === 'leaflet';
        }
    } catch (e) {}
    try {
        var cfg = window.__volsmapPublicConfig || {};
        var eng = String(cfg.mapEngine || window.VolsmapConfiguredEngine || '').toLowerCase();
        return eng === 'leaflet' || eng === 'offline' || eng === 'orthophoto';
    } catch (e2) {
        return false;
    }
}

var _mapLayerSelectorUiBound = false;

function setupMapLayerSelector() {
    var root = document.getElementById('mapLayerSelector');
    var btn = document.getElementById('mapLayerSelectorBtn');
    var menu = document.getElementById('mapLayerSelectorMenu');
    if (!root || !btn || !menu || !myMap) return;

    var dualMode = isBasemapDualMode();
    var leafletMode = dualMode || (typeof MapEngine !== 'undefined' && MapEngine.isLeaflet && MapEngine.isLeaflet());
    var items = menu.querySelectorAll('.map-layer-selector__item');
    var groups = menu.querySelectorAll('.map-layer-selector__group');

    for (var g = 0; g < groups.length; g++) {
        var groupEng = groups[g].getAttribute('data-engine-group') || '';
        if (leafletMode) {
            // On-prem: локально / OSM онлайн / Яндекс отдельно + действия админа.
            if (groupEng === 'leaflet' || groupEng === 'yandex' || groupEng === 'leaflet-actions') {
                groups[g].removeAttribute('hidden');
            } else {
                groups[g].setAttribute('hidden', '');
            }
        } else if (groupEng === 'yandex') {
            groups[g].removeAttribute('hidden');
        } else {
            groups[g].setAttribute('hidden', '');
        }
    }

    function isLayerAdmin() {
        try {
            if (typeof isOrgBasemapAdmin === 'function') return !!isOrgBasemapAdmin();
            return !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
        } catch (e) {
            return false;
        }
    }

    function refreshLayerItemVisibility() {
        var admin = isLayerAdmin();
        for (var i = 0; i < items.length; i++) {
            var eng = items[i].getAttribute('data-engine') || 'yandex';
            var adminOnly = items[i].getAttribute('data-admin-only') === '1';
            if (adminOnly && !admin) {
                items[i].setAttribute('hidden', '');
                continue;
            }
            if (leafletMode) {
                if (eng === 'leaflet' || eng === 'yandex') items[i].removeAttribute('hidden');
                else items[i].setAttribute('hidden', '');
            } else {
                if (eng === 'yandex') items[i].removeAttribute('hidden');
                else items[i].setAttribute('hidden', '');
            }
        }
    }

    refreshLayerItemVisibility();

    function setOpen(open) {
        root.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) menu.removeAttribute('hidden');
        else menu.setAttribute('hidden', '');
    }

    function labelForType(key) {
        if (key === 'yandex#satellite') return 'Спутник';
        if (key === 'yandex#hybrid') return 'Гибрид';
        if (key === 'yandex#map') return 'Схема';
        if (key === 'leaflet#osm') return 'OSM';
        if (key === 'leaflet#none') return 'Без подложки';
        if (key === 'leaflet#orthophoto') return 'Ортофото';
        return 'Слои';
    }

    function syncActive(type) {
        var fallback = 'yandex#map';
        try {
            if (typeof MapEngine !== 'undefined' && MapEngine.isLeaflet && MapEngine.isLeaflet()) {
                fallback = 'leaflet#orthophoto';
            }
        } catch (eFb) {}
        var key = type || (myMap.getType && myMap.getType()) || fallback;
        for (var j = 0; j < items.length; j++) {
            var item = items[j];
            if (item.hasAttribute('hidden')) continue;
            if (item.getAttribute('data-action')) {
                item.classList.remove('is-active');
                item.setAttribute('aria-selected', 'false');
                continue;
            }
            var active = item.getAttribute('data-map-type') === key;
            item.classList.toggle('is-active', active);
            item.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        var label = document.getElementById('mapLayerSelectorLabel');
        if (label) label.textContent = labelForType(key);
    }

    if (!_mapLayerSelectorUiBound) {
        _mapLayerSelectorUiBound = true;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            refreshLayerItemVisibility();
            setOpen(!root.classList.contains('is-open'));
        });

        menu.addEventListener('click', function(e) {
            var item = e.target && e.target.closest ? e.target.closest('.map-layer-selector__item') : null;
            if (!item || item.hasAttribute('hidden')) return;
            e.preventDefault();
            e.stopPropagation();
            var action = item.getAttribute('data-action');
            if (action === 'basemap-default') {
                setOpen(false);
                if (typeof openBasemapDefaultModal === 'function') openBasemapDefaultModal();
                return;
            }
            if (action === 'basemap-admin') {
                setOpen(false);
                if (typeof openBasemapAdminModal === 'function') openBasemapAdminModal();
                return;
            }
            var mapType = item.getAttribute('data-map-type');
            if (!mapType) return;
            if (typeof MapRuntime !== 'undefined' && MapRuntime.applyBasemapType) {
                MapRuntime.applyBasemapType(mapType, function () {
                    syncActive(mapType);
                }, { asUserChoice: true });
            } else {
                try { myMap.setType(mapType); } catch (err) {}
                if (typeof MapRuntime !== 'undefined' && MapRuntime.persistUserBasemapType) {
                    try { MapRuntime.persistUserBasemapType(mapType); } catch (eSave) {}
                }
                syncActive(mapType);
            }
            setOpen(false);
        });

        document.addEventListener('click', function(e) {
            if (!root.classList.contains('is-open')) return;
            if (root.contains(e.target)) return;
            setOpen(false);
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && root.classList.contains('is-open')) setOpen(false);
        });
    }

    try {
        myMap.events.add('typechange', function() {
            syncActive(myMap.getType && myMap.getType());
        });
    } catch (err) {}

    var initialType = null;
    try {
        if (typeof MapRuntime !== 'undefined' && MapRuntime.getLastBasemapType) {
            initialType = MapRuntime.getLastBasemapType();
        }
    } catch (eLast) {}
    syncActive(initialType || (myMap.getType && myMap.getType()) || null);
}

function setupEventListeners() {
    
    document.getElementById('viewMode').addEventListener('click', function() { switchToViewMode(false); });
    document.getElementById('editMode').addEventListener('click', switchToEditMode);

    const addObjectBtn = document.getElementById('addObject');
    addObjectBtn.addEventListener('click', function(e) {
        
        if (this.onclick && typeof this.onclick === 'function' && this.onclick === cancelObjectPlacement) {
            this.onclick(e);
        } else {
            
            handleAddObject();
        }
    });

    document.getElementById('addCable').addEventListener('click', function() {
        try {
        if (isNetworkMapMobileViewOnly()) {
            return;
        }
        if (!isEditMode) {
            if (typeof showInfo === 'function') showInfo('Включите режим «Редактирование»', 'Режим');
            return;
        }

        if (objectPlacementMode) {
            cancelObjectPlacement();
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

        if (cableSplitMode) {
            cancelCableSplitMode();
        }
        
        currentCableTool = !currentCableTool;
        const cableBtn = this;
        
        if (currentCableTool) {
            cableBtn.classList.add('btn-add-object--placement');
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="btn-lay-cable-text">Завершить прокладку</span>';
            cableBtn.style.background = '';
            copperCableLayingActive = false;
            if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
            clearShowOnMapHighlight();
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableSourceCopperSwitchId = null;
            cableWaypoints = [];
            pendingCopperPortPreset = null;
            pendingCopperRouteFinish = null;
            if (typeof clearCabinetCableSourceHighlight === 'function') clearCabinetCableSourceHighlight();
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = 'crosshair';
            mapEl.classList.add('map-crosshair-active');
        } else {
            cableBtn.classList.remove('btn-add-object--placement');
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span class="btn-lay-cable-text">Проложить кабель</span>';
            cableBtn.style.background = '';
            copperCableLayingActive = false;
            if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableSourceCopperSwitchId = null;
            cableWaypoints = [];
            pendingCopperPortPreset = null;
            pendingCopperRouteFinish = null;
            if (typeof finishOltPortCableLayingSession === 'function') finishOltPortCableLayingSession();
            if (typeof finishRadioBridgePortCableLayingSession === 'function') finishRadioBridgePortCableLayingSession();
            if (typeof clearCabinetCableSourceHighlight === 'function') clearCabinetCableSourceHighlight();
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
        } finally {
            syncMapPanLockForEditTools();
        }
    });

    document.getElementById('importBtn').addEventListener('click', function() {
        if (typeof requireAdmin === 'function' && !requireAdmin()) return;
        document.getElementById('importFile').click();
    });

    var importFileInput = document.getElementById('importFile');
    if (importFileInput) importFileInput.value = '';
    importFileInput.addEventListener('change', handleFileImport);
    var exportTrigger = document.getElementById('exportData');
    var exportMenuWrap = document.getElementById('exportMenuWrap');
    var filesTransferActions = document.getElementById('filesTransferActions');
    var exportDropdown = document.getElementById('exportMenuDropdown');
    if (exportTrigger && exportMenuWrap && exportDropdown) {
        function closeExportMenu() {
            exportDropdown.classList.remove('open');
            exportMenuWrap.classList.remove('export-menu-wrap--open');
            exportTrigger.setAttribute('aria-expanded', 'false');
            exportDropdown.setAttribute('aria-hidden', 'true');
        }
        function openExportMenu() {
            exportDropdown.classList.add('open');
            exportMenuWrap.classList.add('export-menu-wrap--open');
            exportTrigger.setAttribute('aria-expanded', 'true');
            exportDropdown.setAttribute('aria-hidden', 'false');
        }
        exportTrigger.addEventListener('click', function(e) {
            if (typeof requireAdmin === 'function' && !requireAdmin()) return;
            e.preventDefault();
            if (exportDropdown.classList.contains('open')) closeExportMenu();
            else openExportMenu();
        });
        exportDropdown.addEventListener('click', function(e) {
            var item = e.target && e.target.closest('.export-menu-item');
            if (!item) return;
            if (typeof requireAdmin === 'function' && !requireAdmin()) return;
            var format = item.getAttribute('data-export-format');
            closeExportMenu();
            exportData(format || 'json');
        });
        document.addEventListener('click', function(e) {
            var root = filesTransferActions || exportMenuWrap;
            if (!root.contains(e.target)) closeExportMenu();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeExportMenu();
        });
    }

    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', function() { performUndo(); });
    if (redoBtn) redoBtn.addEventListener('click', function() { performRedo(); });
    document.addEventListener('keydown', function(e) {
        var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
            e.preventDefault();
            if (e.shiftKey) performRedo();
            else performUndo();
            return;
        }
        if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
            e.preventDefault();
            performRedo();
        }
    });

    setupMapFilterControls();
    setupRegionControls();

    var saveMapStartBtn = document.getElementById('saveMapStartBtn');
    if (saveMapStartBtn) {
        saveMapStartBtn.addEventListener('click', function() {
            if (!myMap || !getApiBase() || !getAuthToken()) {
                if (typeof showWarning === 'function') showWarning('Нужно быть авторизованным для сохранения начальной позиции.', 'Настройка');
                return;
            }
            var center = myMap.getCenter();
            if (!center) return;
            var lat = Array.isArray(center) ? center[0] : (center[0] != null ? center[0] : (center.lat && center.lat()));
            var lon = Array.isArray(center) ? center[1] : (center[1] != null ? center[1] : (center.lng && center.lng()));
            if (typeof lat !== 'number' || typeof lon !== 'number') return;
            var zoom = myMap.getZoom();
            if (typeof zoom !== 'number') zoom = 15;
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ mapStart: { center: [lat, lon], zoom: zoom } })
            }).then(function(r) {
                if (!r.ok) throw new Error('Ошибка сохранения');
                var forTeam = currentUser && currentUser.role === 'admin';
                if (typeof showInfo === 'function') {
                    showInfo(
                        forTeam
                            ? 'Вид сохранён. Карта будет открываться здесь у всей команды.'
                            : 'Текущий вид сохранён. При следующем открытии карта откроется здесь.',
                        'Расположение карты'
                    );
                }
            }).catch(function() {
                if (typeof showWarning === 'function') showWarning('Не удалось сохранить расположение карты.', 'Ошибка');
            });
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (typeof window.isConfirmModalBlockingEscape === 'function' && window.isConfirmModalBlockingEscape()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (typeof window.isConfirmModalOpen === 'function' && window.isConfirmModalOpen()) {
                if (typeof window.cancelConfirmModal === 'function') window.cancelConfirmModal();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            var modalIds = ['deviceCatalogEntryModal', 'infoModal', 'nodeSelectionModal', 'onuSelectionModal', 'splitterSelectionModal', 'splitterOutputOnuModal', 'splitterOutputSplitterModal', 'splitterOutputHostModal', 'oltSelectionModal', 'oltPortSelectionModal', 'signalTraceModal', 'usersModal', 'userEditModal', 'organizationsModal', 'organizationEditModal', 'profileModal', 'deviceCatalogModal'];
            for (var i = 0; i < modalIds.length; i++) {
                var m = document.getElementById(modalIds[i]);
                var modalOpen = m && m.style && m.style.display && m.style.display !== 'none';
                if (modalOpen) {
                    if (modalIds[i] === 'infoModal' && typeof closeInfoModal === 'function') {
                        closeInfoModal();
                    } else if (modalIds[i] === 'deviceCatalogEntryModal' && typeof closeDeviceCatalogEntryModal === 'function') {
                        closeDeviceCatalogEntryModal();
                    } else if (modalIds[i] === 'deviceCatalogModal' && typeof closeDeviceCatalogModal === 'function') {
                        closeDeviceCatalogModal();
                    } else if (modalIds[i] === 'oltSelectionModal' && typeof closeOltSelectionModal === 'function') {
                        closeOltSelectionModal();
                    } else if (modalIds[i] === 'oltPortSelectionModal' && typeof window.closeOltPortSelectionModal === 'function') {
                        window.closeOltPortSelectionModal();
                    } else if (modalIds[i] === 'signalTraceModal' && typeof window.closeSignalTraceModal === 'function') {
                        window.closeSignalTraceModal();
                    } else {
                        m.style.display = 'none';
                    }
                    e.preventDefault();
                    return;
                }
            }
            if (splitterFiberRoutingMode) { cancelSplitterFiberRouting(); showInfo('Прокладка волокна отменена.', 'Отмена'); e.preventDefault(); return; }
            if (radioBridgeRoutingMode && typeof cancelRadioBridgeRouting === 'function') { cancelRadioBridgeRouting(); showInfo('Прокладка радиолинка отменена.', 'Отмена'); e.preventDefault(); return; }
            if (fiberRoutingMode) { cancelFiberRouting(); showInfo('Прокладка волокна отменена.', 'Отмена'); e.preventDefault(); return; }
            if (cableSplitMode) { cancelCableSplitMode(); showInfo('Установка муфты отменена.', 'Отмена'); e.preventDefault(); return; }
            if (objectPlacementMode) { cancelObjectPlacement(); e.preventDefault(); return; }
            if (cableUndergroundEditMode) {
                cancelUndergroundSpanEdit();
                if (typeof showInfo === 'function') showInfo('Перепрокладка подземного участка отменена.', 'Отмена');
                e.preventDefault();
                return;
            }
            if (currentCableTool && cableUndergroundActive) {
                resetCableUndergroundLayingState(true);
                hideUndergroundEditBar();
                if (typeof showInfo === 'function') showInfo('Подземная прокладка отменена. Колодец убран из маршрута.', 'Отмена');
                e.preventDefault();
                return;
            }
            if (currentCableTool) {
                var cableBtn = document.getElementById('addCable');
                if (cableBtn) cableBtn.click();
                e.preventDefault();
            }
            return;
        }
    });

    setupObjectTypePicker();
    setupCableTypePicker();
    setupObjectPlacementCoordsControls();
    if (typeof setupSupportAutonumberControls === 'function') setupSupportAutonumberControls();

    const objectTypeSelect = document.getElementById('objectType');
    if (objectTypeSelect) {
        objectTypeSelect.addEventListener('change', function() {
            if (typeof syncObjectTypePickerUI === 'function') syncObjectTypePickerUI();
            try { localStorage.setItem(OBJECT_TYPE_STORAGE_KEY, this.value); } catch (e) {}
            const nameInputGroup = document.getElementById('objectNameGroup');
            const sleeveSettingsGroup = document.getElementById('sleeveSettingsGroup');
            const crossSettingsGroup = document.getElementById('crossSettingsGroup');
            const nodeSettingsGroup = document.getElementById('nodeSettingsGroup');
            const oltSettingsGroup = document.getElementById('oltSettingsGroup');
            const splitterSettingsGroup = document.getElementById('splitterSettingsGroup');
            const type = this.value;

            const showName = ['node', 'cross', 'sleeve', 'support', 'attachment', 'manhole', 'signalPost', 'cabinet', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'radioBridge'].indexOf(type) !== -1;
            if (nameInputGroup) nameInputGroup.style.display = showName ? 'block' : 'none';
            if (sleeveSettingsGroup) sleeveSettingsGroup.style.display = type === 'sleeve' ? 'block' : 'none';
            if (crossSettingsGroup) crossSettingsGroup.style.display = type === 'cross' ? 'block' : 'none';
            if (nodeSettingsGroup) nodeSettingsGroup.style.display = type === 'node' ? 'block' : 'none';
            if (oltSettingsGroup) oltSettingsGroup.style.display = type === 'olt' ? 'block' : 'none';
            if (splitterSettingsGroup) splitterSettingsGroup.style.display = type === 'splitter' ? 'block' : 'none';
            const onuSettingsGroup = document.getElementById('onuSettingsGroup');
            if (onuSettingsGroup) onuSettingsGroup.style.display = type === 'onu' ? 'block' : 'none';
            const cameraSettingsGroup = document.getElementById('cameraSettingsGroup');
            if (cameraSettingsGroup) cameraSettingsGroup.style.display = type === 'camera' ? 'block' : 'none';
            const mediaConverterSettingsGroup = document.getElementById('mediaConverterSettingsGroup');
            if (mediaConverterSettingsGroup) mediaConverterSettingsGroup.style.display = type === 'mediaConverter' ? 'block' : 'none';
            const radioBridgeSettingsGroup = document.getElementById('radioBridgeSettingsGroup');
            if (radioBridgeSettingsGroup) radioBridgeSettingsGroup.style.display = type === 'radioBridge' ? 'block' : 'none';
            const radioBridgeRoleGroup = document.getElementById('radioBridgeRoleGroup');
            const radioBridgeModeEl = document.getElementById('radioBridgeMode');
            if (radioBridgeRoleGroup && radioBridgeModeEl) {
                radioBridgeRoleGroup.style.display = (type === 'radioBridge' && radioBridgeModeEl.value === 'ptmp') ? 'block' : 'none';
            }
            const cabinetSettingsGroup = document.getElementById('cabinetSettingsGroup');
            if (cabinetSettingsGroup) cabinetSettingsGroup.style.display = type === 'cabinet' ? 'block' : 'none';
            const supportAutonumberGroup = document.getElementById('supportAutonumberGroup');
            if (supportAutonumberGroup) supportAutonumberGroup.style.display = type === 'support' ? 'block' : 'none';
            if (type === 'support') {
                if (typeof refreshSupportAutonumberUi === 'function') refreshSupportAutonumberUi();
            } else {
                const nameInputReset = document.getElementById('objectName');
                if (nameInputReset) {
                    nameInputReset.readOnly = false;
                    nameInputReset.classList.remove('object-name--autonumber');
                }
            }
            if (nameInputGroup) {
                const nameLabel = nameInputGroup.querySelector('label');
                if (nameLabel) {
                    const labels = { cross: 'Имя кросса', sleeve: 'Название муфты', support: 'Подпись опоры', attachment: 'Название', manhole: 'Название колодца', signalPost: 'Подпись столба', cabinet: 'Название ящика', node: 'Имя узла', olt: 'Имя OLT', splitter: 'Имя сплиттера', onu: 'Имя ONU', camera: 'Имя камеры', mediaConverter: 'Название медиаконвертера', radioBridge: 'Название радиомоста' };
                    nameLabel.textContent = labels[type] || 'Имя';
                }
            }

        if (objectPlacementMode) {
            const newType = this.value;
            currentPlacementType = newType;
            
            if (['node', 'cross', 'sleeve', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'radioBridge'].indexOf(newType) !== -1) {
                const nameInput = document.getElementById('objectName');
                currentPlacementName = nameInput ? nameInput.value.trim() : '';
            } else {
                currentPlacementName = '';
            }
            
            if (newType === 'node') {
                const nodeKindSelect = document.getElementById('nodeKind');
                currentPlacementNodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
            }
            if (['olt', 'onu', 'camera', 'mediaConverter', 'radioBridge', 'cabinet'].indexOf(newType) !== -1) {
                populateDeviceDatalists();
                var mInp = newType === 'olt' ? document.getElementById('oltManufacturer') : (newType === 'onu' ? document.getElementById('onuManufacturer') : (newType === 'camera' ? document.getElementById('cameraManufacturer') : (newType === 'cabinet' ? document.getElementById('cabinetManufacturer') : (newType === 'radioBridge' ? document.getElementById('radioBridgeManufacturer') : document.getElementById('mediaConverterManufacturer')))));
                var cat = 'node';
                if (newType === 'camera') cat = 'camera';
                else if (newType === 'olt') cat = 'olt';
                else if (newType === 'onu') cat = 'onu';
                else if (newType === 'cabinet') cat = 'cabinet';
                else if (newType === 'radioBridge') cat = 'radioBridge';
                populateModelDatalistForManufacturer(mInp ? mInp.value.trim() : '', 'deviceModelsList', cat);
            }
        }
        });
        if (objectTypeSelect.value) objectTypeSelect.dispatchEvent(new Event('change'));
    }

    const objectNameInput = document.getElementById('objectName');
    if (objectNameInput) {
        objectNameInput.addEventListener('input', function() {
            if (!objectPlacementMode || !currentPlacementType) return;
            var typesWithPlacementName = ['node', 'cross', 'sleeve', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter', 'radioBridge'];
            if (typesWithPlacementName.indexOf(currentPlacementType) !== -1) {
                currentPlacementName = this.value.trim();
            }
        });
    }

    const nodeKindSelect = document.getElementById('nodeKind');
    if (nodeKindSelect) {
        nodeKindSelect.addEventListener('change', function() {
            if (objectPlacementMode && currentPlacementType === 'node') {
                currentPlacementNodeKind = this.value || 'network';
            }
        });
    }

    function setupDeviceManufacturerChangeHandlers(manufacturerId, catalogKind) {
        catalogKind = catalogKind || 'node';
        var mInp = document.getElementById(manufacturerId);
        if (mInp) {
            mInp.addEventListener('change', function() {
                if (typeof populateModelDatalistForManufacturer === 'function') populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', catalogKind);
            });
        }
    }
    setupDeviceManufacturerChangeHandlers('oltManufacturer', 'olt');
    setupDeviceManufacturerChangeHandlers('onuManufacturer', 'onu');
    setupDeviceManufacturerChangeHandlers('cameraManufacturer', 'camera');
    setupDeviceManufacturerChangeHandlers('mediaConverterManufacturer', 'node');
    setupDeviceManufacturerChangeHandlers('radioBridgeManufacturer', 'radioBridge');
    setupDeviceManufacturerChangeHandlers('cabinetManufacturer', 'cabinet');

    var radioBridgeModeSelect = document.getElementById('radioBridgeMode');
    if (radioBridgeModeSelect && !radioBridgeModeSelect._rbModeBound) {
        radioBridgeModeSelect._rbModeBound = true;
        radioBridgeModeSelect.addEventListener('change', function() {
            var roleGroup = document.getElementById('radioBridgeRoleGroup');
            if (roleGroup) roleGroup.style.display = this.value === 'ptmp' ? 'block' : 'none';
        });
    }

    function preventPasswordSuggestions(inputEl) {
        if (!inputEl || inputEl.tagName !== 'INPUT') return;
        inputEl.readOnly = true;
        inputEl.addEventListener('focus', function() { this.readOnly = false; }, { once: true });
    }
    function setupDeviceFieldsNoPasswordSuggestions() {
        return;
    }
    setupDeviceFieldsNoPasswordSuggestions();

    setupAccordions();

    if (typeof refreshAllSleeveTypeSelects === 'function') refreshAllSleeveTypeSelects();
    if (typeof refreshAllCrossTypeSelects === 'function') refreshAllCrossTypeSelects();

    initDeviceComboboxes(document);
    if (typeof setupLayCableProductHandlers === 'function') setupLayCableProductHandlers();

    initNodeSelectionModal();
    initOnuSelectionModal();
    initSplitterSelectionModal();
    initSplitterOutputOnuModal();
    initSplitterOutputSplitterModal();
    initSplitterOutputHostModal();
    initOltSelectionModal();

    bindMyMapInteractionEvents();

    document.addEventListener('mousemove', function(e) {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
    });

    const modal = document.getElementById('infoModal');
    const closeBtn = modal ? modal.querySelector('.close') : null;
    
    if (closeBtn && modal) {
        closeBtn.onclick = function() {
            closeInfoModal();
        };
    }
    
    window.onclick = function(event) {
        if (modal && event.target === modal) {
            closeInfoModal();
        }
    };

    setupMapSearch();

    initTheme();
}

/**
 * События жестов карты — переподключаются после смены рантайма (Яндекс ↔ Leaflet).
 * Идемпотентно: не дублирует handlers на том же myMap.
 */
function bindMyMapInteractionEvents() {
    if (!myMap || !myMap.events) return;

    var prev = window._volsmapBoundMap;
    if (prev && prev.map === myMap && prev.handlers) return;
    if (prev && prev.map && prev.map !== myMap && prev.map.events && prev.handlers) {
        try {
            var ph = prev.handlers;
            if (ph.click) prev.map.events.remove('click', ph.click);
            if (ph.mousemove) prev.map.events.remove('mousemove', ph.mousemove);
            if (ph.actionbegin) prev.map.events.remove('actionbegin', ph.actionbegin);
            if (ph.actionend) prev.map.events.remove('actionend', ph.actionend);
            if (ph.boundschange) prev.map.events.remove('boundschange', ph.boundschange);
        } catch (eUnbind) {}
    }

    // Обновляем видимость по зуму и (при большой карте) по viewport при панорамировании.
    // Во время жеста (зум + перетаскивание) тяжёлый applyMapFilter не запускаем — иначе карта подвисает.
    var expertLastZoom = (typeof myMap.getZoom === 'function') ? myMap.getZoom() : null;
    var expertPrevZoom = expertLastZoom;
    var mapBoundsChangeTimer = null;
    var mapBoundsChangePending = false;
    var mapBoundsChangeZoomPending = false;
    window.mapUserGestureActive = false;

    function flushMapBoundsChangeUpdate() {
        if (window._mapPdfExportCaptureActive) return;
        mapBoundsChangePending = false;
        var zoomPending = mapBoundsChangeZoomPending;
        mapBoundsChangeZoomPending = false;
        try {
            var currentZoom = (typeof myMap.getZoom === 'function') ? myMap.getZoom() : null;
            var objectsBelow = (typeof getLodThresholds === 'function') ? getLodThresholds().objects : 16;
            var lowZoom = typeof currentZoom === 'number' && currentZoom < objectsBelow;
            var useVirtual = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization && MapPerf.shouldUseVirtualization();
            if (zoomPending && lowZoom && typeof applyLowZoomMapUpdate === 'function') {
                applyLowZoomMapUpdate();
            } else if (zoomPending) {
                if (useVirtual && typeof applyMapViewportUpdate === 'function') applyMapViewportUpdate();
                else if (typeof applyMapFilter === 'function') applyMapFilter();
            } else if (typeof applyMapViewportUpdate === 'function') {
                applyMapViewportUpdate();
            } else if (typeof applyMapFilter === 'function') {
                applyMapFilter();
            }
            if (zoomPending && window.MapRegions && MapRegions.rebuildAllRegionLabels && myMap &&
                typeof regionZoomLabelRebuildNeeded === 'function' &&
                regionZoomLabelRebuildNeeded(expertPrevZoom, currentZoom)) {
                MapRegions.rebuildAllRegionLabels(myMap, objects);
            }
        } catch (eFlush) {}
    }

    function scheduleMapBoundsChangeUpdate(delayMs, zoomChanged) {
        if (zoomChanged) mapBoundsChangeZoomPending = true;
        if (mapBoundsChangeTimer) clearTimeout(mapBoundsChangeTimer);
        mapBoundsChangeTimer = setTimeout(function() {
            mapBoundsChangeTimer = null;
            if (window.mapUserGestureActive) {
                mapBoundsChangePending = true;
                return;
            }
            flushMapBoundsChangeUpdate();
        }, delayMs != null ? delayMs : 80);
    }

    var handlers = {
        click: handleMapClick,
        mousemove: handleMapMouseMove,
        actionbegin: function() {
            window.mapUserGestureActive = true;
            if (typeof clearMapHoverOnMapGesture === 'function') {
                clearMapHoverOnMapGesture();
            }
            if (mapBoundsChangeTimer) {
                clearTimeout(mapBoundsChangeTimer);
                mapBoundsChangeTimer = null;
            }
            if (typeof pauseRadioBridgeCoveragePulseAnimation === 'function') {
                pauseRadioBridgeCoveragePulseAnimation();
            }
        },
        actionend: function() {
            window.mapUserGestureActive = false;
            if (typeof resumeRadioBridgeCoveragePulseAnimation === 'function') {
                resumeRadioBridgeCoveragePulseAnimation();
            }
            if (mapBoundsChangePending) {
                scheduleMapBoundsChangeUpdate(40, mapBoundsChangeZoomPending);
            }
        },
        boundschange: function(e) {
            try {
                if (!myMap || typeof myMap.getZoom !== 'function') return;
                var z = myMap.getZoom();
                if (typeof z !== 'number') return;

                if (typeof updateSettingsCurrentZoom === 'function') {
                    updateSettingsCurrentZoom(z);
                }

                var newZoom = e && typeof e.get === 'function' ? e.get('newZoom') : z;
                var oldZoom = e && typeof e.get === 'function' ? e.get('oldZoom') : expertLastZoom;
                var zoomChanged = typeof newZoom === 'number' && typeof oldZoom === 'number' && newZoom !== oldZoom;
                var viewportCull = typeof MapPerf !== 'undefined' && MapPerf.shouldUseViewportCull();
                var virtualization = typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization();
                if (!viewportCull && !virtualization && !zoomChanged) return;

                expertPrevZoom = expertLastZoom;
                expertLastZoom = z;

                if (window.mapUserGestureActive) {
                    mapBoundsChangePending = true;
                    if (zoomChanged) mapBoundsChangeZoomPending = true;
                    return;
                }
                scheduleMapBoundsChangeUpdate(null, zoomChanged);
            } catch (eBound) {}
        }
    };

    myMap.events.add('click', handlers.click);
    myMap.events.add('mousemove', handlers.mousemove);
    myMap.events.add('actionbegin', handlers.actionbegin);
    myMap.events.add('actionend', handlers.actionend);
    myMap.events.add('boundschange', handlers.boundschange);
    window._volsmapBoundMap = { map: myMap, handlers: handlers };

    if (typeof updateSettingsCurrentZoom === 'function') {
        try { updateSettingsCurrentZoom(myMap.getZoom()); } catch (eZoom) {}
    }
}
