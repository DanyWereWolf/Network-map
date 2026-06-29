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
    if (typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly()) {
        initialZoom = Math.max(initialZoom, 16);
    }
    myMap = new ymaps.Map('map', {
        center: initialCenter,
        zoom: initialZoom,
        controls: ['zoomControl']
    });
    if (window._pendingMapStart) {
        window._mapStartApplied = true;
        window._pendingMapStart = null;
    }
    
    try { myMap.controls.remove('searchControl'); } catch (e) {}
    try { myMap.controls.remove('trafficControl'); } catch (e) {}
    try { myMap.controls.remove('geolocationControl'); } catch (e) {}
    try { myMap.controls.remove('rulerControl'); } catch (e) {}
    try { myMap.controls.remove('fullscreenControl'); } catch (e) {}
    try { myMap.controls.remove('typeSelector'); } catch (e) {}
    try {
        var mapLayerSelector = new ymaps.control.TypeSelector(
            ['yandex#map', 'yandex#satellite', 'yandex#hybrid'],
            {
                panoramas: 'off',
                panoramasItemMode: 'off'
            }
        );
        myMap.controls.add(mapLayerSelector, { float: 'right' });
        if (mapLayerSelector.events) {
            mapLayerSelector.events.add(['click', 'expand'], hidePanoramaLayerMenuItem);
        }
        hidePanoramaLayerMenuItem();
        setTimeout(hidePanoramaLayerMenuItem, 300);
    } catch (e) {}
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

    if (getApiBase() && typeof AuthSystem !== 'undefined' && AuthSystem.refreshSessionFromApi) {
        setInterval(AuthSystem.refreshSessionFromApi, 60000);
    }

    setupMapTilesReady();
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
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('exportData').addEventListener('click', exportData);

    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', function() { performUndo(); });
    if (redoBtn) redoBtn.addEventListener('click', function() { performRedo(); });
    document.addEventListener('keydown', function(e) {
        var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            performUndo();
        }
        if (e.ctrlKey && e.key === 'y') {
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
                if (typeof showInfo === 'function') showInfo('Текущий вид сохранён. При следующем открытии карта откроется здесь.', 'Начальная точка');
            }).catch(function() {
                if (typeof showWarning === 'function') showWarning('Не удалось сохранить начальную позицию.', 'Ошибка');
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
            var modalIds = ['deviceCatalogEntryModal', 'infoModal', 'nodeSelectionModal', 'onuSelectionModal', 'splitterSelectionModal', 'splitterOutputOnuModal', 'splitterOutputSplitterModal', 'splitterOutputHostModal', 'oltSelectionModal', 'usersModal', 'userEditModal', 'organizationsModal', 'organizationEditModal', 'updatesModal', 'profileModal', 'deviceCatalogModal'];
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
                    } else {
                        m.style.display = 'none';
                    }
                    e.preventDefault();
                    return;
                }
            }
            if (splitterFiberRoutingMode) { cancelSplitterFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
            if (radioBridgeRoutingMode && typeof cancelRadioBridgeRouting === 'function') { cancelRadioBridgeRouting(); showInfo('Прокладка радиолинка отменена.', 'Отмена'); e.preventDefault(); return; }
            if (fiberRoutingMode) { cancelFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
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

    if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
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

    myMap.events.add('click', handleMapClick);

    myMap.events.add('mousemove', handleMapMouseMove);

    // Обновляем видимость по зуму и (при большой карте) по viewport при панорамировании.
    let expertLastZoom = (typeof myMap.getZoom === 'function') ? myMap.getZoom() : null;
    let mapBoundsChangeTimer = null;
    myMap.events.add('boundschange', function() {
        try {
            if (!myMap || typeof myMap.getZoom !== 'function') return;
            const z = myMap.getZoom();
            if (typeof z !== 'number') return;

            var viewportCull = typeof MapPerf !== 'undefined' && MapPerf.shouldUseViewportCull();
            if (!viewportCull) {
                if (expertLastZoom != null && Math.abs(z - expertLastZoom) < 0.01) return;
            }
            expertLastZoom = z;

            if (mapBoundsChangeTimer) return;
            mapBoundsChangeTimer = setTimeout(function() {
                mapBoundsChangeTimer = null;
                if (typeof applyMapFilter === 'function') applyMapFilter();
                if (window.MapRegions && MapRegions.syncAllRegionLabels && myMap) {
                    MapRegions.syncAllRegionLabels(myMap, objects);
                }
            }, 80);
        } catch (e) {}
    });

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
