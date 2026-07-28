/**
 * Создание объектов на карте (placemark).
 */
function findNodeByName(name, excludePlacemark) {
    if (!name || typeof name !== 'string') return null;
    var n = (name || '').trim().toLowerCase();
    if (!n) return null;
    return objects.find(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'node') return false;
        if (obj === excludePlacemark) return false;
        var objName = (obj.properties.get('name') || '').trim().toLowerCase();
        return objName === n;
    }) || null;
}

function createObject(type, name, coords, options = {}) {
    if (!options.skipAddToObjects && wouldExceedMapObjectLimit(1)) {
        notifyMapObjectLimitBlocked();
        return null;
    }

    var mapIcon = buildMapPlacemarkIcon(type, 'normal', type === 'node' ? { nodeKind: options.nodeKind || 'network' } : null);
    if (!mapIcon) return null;

    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: mapIcon.href,
        iconImageSize: mapIcon.iconImageSize,
        iconImageOffset: mapIcon.iconImageOffset,
        draggable: isEditMode,
        hasBalloon: false,
        openBalloonOnClick: false
    };
    
    const placemarkProperties = {
        type: type,
        name: name
    };

    if (type === 'node') {
        placemarkProperties.nodeKind = (options.nodeKind || 'network');
        placemarkProperties.comment = options.comment || '';
        if (Array.isArray(options.attachedSwitches) && options.attachedSwitches.length) {
            placemarkProperties.attachedSwitches = JSON.parse(JSON.stringify(options.attachedSwitches));
        } else {
            placemarkProperties.attachedSwitches = [];
        }
    }

    if (type === 'sleeve' && options.sleeveType) {
        placemarkProperties.sleeveType = options.sleeveType;
        placemarkProperties.maxFibers = options.maxFibers || 0;
    }

    if (type === 'spliceCassette' && options.cassetteType) {
        placemarkProperties.cassetteType = options.cassetteType;
        placemarkProperties.maxFibers = options.maxFibers !== undefined
            ? options.maxFibers
            : (typeof getDefaultMaxFibersForCassetteType === 'function' ? getDefaultMaxFibersForCassetteType(options.cassetteType) : 0);
    }

    if (type === 'cross') {
        if (options.crossType) placemarkProperties.crossType = options.crossType;
        placemarkProperties.crossPorts = options.crossPorts
            || (options.crossType && typeof getDefaultPortsForCrossType === 'function'
                ? getDefaultPortsForCrossType(options.crossType)
                : 24);
        var ccp = options.crossCopperPorts !== undefined && options.crossCopperPorts !== null ? parseInt(options.crossCopperPorts, 10) : 0;
        placemarkProperties.crossCopperPorts = isNaN(ccp) ? 0 : Math.max(0, ccp);
        placemarkProperties.copperPortUsage = {};
    }
    if (type === 'olt') {
        var oltPorts = options.ponPorts || 8;
        var oltMfr = (options.manufacturer || '').trim();
        var oltMod = (options.model || '').trim();
        var oltPortTypes = Array.isArray(options.ponPortTypes) ? options.ponPortTypes.slice() : [];
        if ((!oltPortTypes.length) && oltMfr && oltMod && typeof resolveOltPortTypesForModel === 'function') {
            oltPortTypes = resolveOltPortTypesForModel(oltMfr, oltMod, oltPorts);
        }
        if (oltPortTypes.length) oltPorts = oltPortTypes.length;
        placemarkProperties.ponPorts = oltPorts;
        placemarkProperties.incomingFiber = null;
        placemarkProperties.portAssignments = {};
        placemarkProperties.portLabels = {};
        placemarkProperties.ponPortTypes = oltPortTypes;
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        if (options.ipAddress) placemarkProperties.ipAddress = options.ipAddress;
    }
    if (type === 'splitter') {
        placemarkProperties.splitRatio = options.splitRatio || 8;
        placemarkProperties.inputFiber = null;
        placemarkProperties.outputConnections = [];
    }
    if (type === 'onu') {
        placemarkProperties.incomingFiber = null;
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        if (options.ipAddress) placemarkProperties.ipAddress = options.ipAddress;
    }
    if (type === 'camera') {
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        if (options.ipAddress) placemarkProperties.ipAddress = options.ipAddress;
        placemarkProperties.streamType = (options.streamType && window.CameraPlayer)
            ? CameraPlayer.normalizeStreamType(options.streamType) : (options.streamType || 'none');
        placemarkProperties.streamUrl = options.streamUrl || '';
        placemarkProperties.streamUser = options.streamUser || '';
        placemarkProperties.streamPass = options.streamPass || '';
        placemarkProperties.streamAutoplay = options.streamAutoplay !== false;
        placemarkProperties.streamMuted = options.streamMuted !== false;
        if (options.snapshotPhoto) placemarkProperties.snapshotPhoto = options.snapshotPhoto;
    }
    if (type === 'mediaConverter') {
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        if (options.ipAddress) placemarkProperties.ipAddress = options.ipAddress;
        placemarkProperties.incomingFiber = null;
    }
    if (type === 'radioBridge') {
        var rbMode = options.bridgeMode === 'ptmp' ? 'ptmp' : 'ptp';
        placemarkProperties.bridgeMode = rbMode;
        placemarkProperties.role = rbMode === 'ptp'
            ? 'ptp'
            : ((options.role === 'ap') ? 'ap' : 'station');
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        if (options.ipAddress) placemarkProperties.ipAddress = options.ipAddress;
        placemarkProperties.peerBridgeId = null;
        placemarkProperties.peerBridgeName = null;
        placemarkProperties.routeIds = [];
        placemarkProperties.stationLinks = [];
        placemarkProperties.ptpPeerLinks = [];
        placemarkProperties.apBridgeId = null;
        placemarkProperties.apBridgeName = null;
        placemarkProperties.ptpPeerId = null;
        placemarkProperties.ptpPeerName = null;
        placemarkProperties.incomingFiber = null;
        placemarkProperties.showCoverage = false;
        placemarkProperties.coverageShape = 'circle';
        placemarkProperties.coverageRadiusKm = 3;
        placemarkProperties.coverageLengthKm = 3;
        placemarkProperties.coverageAzimuth = 0;
        placemarkProperties.coverageAngle = 60;
        var rbMfr = (options.manufacturer || '').trim();
        var rbMod = (options.model || '').trim();
        var rbPortTypes = typeof resolveRadioBridgePortTypesForModel === 'function'
            ? resolveRadioBridgePortTypesForModel(rbMfr, rbMod, 1)
            : (typeof buildSwitchPortTypesArray === 'function' ? buildSwitchPortTypesArray(1) : ['RJ45 1000Base-T (Gigabit, порт G)']);
        placemarkProperties.radioBridgePortTypes = rbPortTypes;
        placemarkProperties.copperPortUsage = {};
        placemarkProperties.portLabels = {};
        placemarkProperties.manualPortUsage = {};
    }
    if (type === 'signalPost') {
        placemarkProperties.comment = options.comment || '';
    }
    if (type === 'cabinet') {
        var cabOpts = options || {};
        if (!options.manufacturer && !options.model && typeof getCabinetPlacementOptionsFromForm === 'function') {
            cabOpts = getCabinetPlacementOptionsFromForm();
        }
        placemarkProperties.comment = cabOpts.comment || options.comment || '';
        if (cabOpts.manufacturer) placemarkProperties.manufacturer = cabOpts.manufacturer;
        if (cabOpts.model) placemarkProperties.model = cabOpts.model;
        if (cabOpts.cabinetMount) placemarkProperties.cabinetMount = cabOpts.cabinetMount;
        if (cabOpts.cabinetHeight) placemarkProperties.cabinetHeight = cabOpts.cabinetHeight;
        if (cabOpts.cabinetWidth) placemarkProperties.cabinetWidth = cabOpts.cabinetWidth;
        if (cabOpts.cabinetUnits) placemarkProperties.cabinetUnits = cabOpts.cabinetUnits;
        if (cabOpts.address) placemarkProperties.address = cabOpts.address;
        if (cabOpts.inventoryNumber) placemarkProperties.inventoryNumber = cabOpts.inventoryNumber;
        if (cabOpts.serialNumber) placemarkProperties.serialNumber = cabOpts.serialNumber;
        if (cabOpts.ipAddress) placemarkProperties.ipAddress = cabOpts.ipAddress;
    }
    if (options.cabinetId && typeof canBeCabinetMember === 'function' && canBeCabinetMember(type)) {
        placemarkProperties.cabinetId = String(options.cabinetId);
        if (options.cabinetOrder != null && options.cabinetOrder !== '') {
            placemarkProperties.cabinetOrder = Number(options.cabinetOrder);
        } else if (typeof getNextCabinetMemberOrder === 'function') {
            placemarkProperties.cabinetOrder = getNextCabinetMemberOrder(options.cabinetId);
        }
    }
    if (!placemarkProperties.uniqueId) {
        placemarkProperties.uniqueId = 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    const placemark = new ymaps.Placemark(coords, placemarkProperties, placemarkOptions);
    if (typeof disableNativePlacemarkBalloon === 'function') disableNativePlacemarkBalloon(placemark);

    updateObjectLabel(placemark, name);
    if (type === 'camera') refreshCameraMapPresentation(placemark);
    placemark.events.add('dragend', function() {
        var c = placemark.geometry.getCoordinates();
        var lbl = placemark.properties.get('label');
        if (lbl && lbl.geometry) lbl.geometry.setCoordinates(c);
    });

    placemark.events.add('click', function(e) {
        if (objectPlacementMode) {
            if (type === 'cabinet' && typeof canBeCabinetMember === 'function' && canBeCabinetMember(currentPlacementType || '')) {
                var cabCoords = placemark.geometry && placemark.geometry.getCoordinates();
                if (cabCoords) placeObjectAtCoords(cabCoords);
            }
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        if (radioBridgeRoutingMode && typeof handleRadioBridgeRoutingPlacemarkClick === 'function' &&
            handleRadioBridgeRoutingPlacemarkClick(placemark, type)) {
            return;
        }

        if (splitterFiberRoutingMode && splitterFiberRoutingData) {
            if (Date.now() < placementPanBlockClickUntil) return;
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === splitterFiberRoutingData.targetId ||
                (typeof isGponFiberRoutingTargetReachableClick === 'function' &&
                    isGponFiberRoutingTargetReachableClick(splitterFiberRoutingData, placemark))) {
                completeSplitterFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                addSplitterFiberWaypoint(placemark);
                updateSplitterFiberPreview();
                return;
            }
            
            if (isGponFiberRoutingSourceUid(splitterFiberRoutingData, objId)) {
                splitterFiberWaypoints = [];
                updateSplitterFiberPreview();
                return;
            }
            
            var targetName = getFiberRoutingTargetLabel(splitterFiberRoutingData.targetType, splitterFiberRoutingData.targetObj);
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (fiberRoutingMode && fiberRoutingData) {
            if (Date.now() < placementPanBlockClickUntil) return;
            if (typeof tryCompleteFiberRoutingForCabinetClick === 'function' &&
                tryCompleteFiberRoutingForCabinetClick(placemark)) {
                return;
            }
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === fiberRoutingData.targetId) {
                completeFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                addFiberRoutingWaypoint(placemark);
                updateFiberRoutingPreview();
                return;
            }
            
            if (objId === getObjectUniqueId(fiberRoutingData.sleeveObj)) {
                fiberRoutingWaypoints = [];
                updateFiberRoutingPreview();
                return;
            }
            
            var targetName = getFiberRoutingTargetLabel(fiberRoutingData.targetType, fiberRoutingData.targetObj);
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (currentCableTool && isEditMode) {
            if (Date.now() < placementPanBlockClickUntil) {
                return;
            }
            if (type === 'cabinet' && typeof tryProcessCabinetCableClick === 'function') {
                tryProcessCabinetCableClick(placemark);
                syncMapPanLockForEditTools();
                return;
            }
            if (typeof isCabinetMemberCableActionTarget === 'function' && isCabinetMemberCableActionTarget(placemark) &&
                typeof getObjectCabinetId === 'function' && getObjectCabinetId(placemark) &&
                typeof processCabinetMemberCableAction === 'function') {
                if (processCabinetMemberCableAction(placemark)) {
                    syncMapPanLockForEditTools();
                    return;
                }
            }
            var cableTypeVal = getEffectiveCableLayingType();
            if (handleCopperCablePlacemarkStep(placemark, type, cableTypeVal)) return;
            if (type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'radioBridge') {
                showError('Нельзя прокладывать кабель ВОЛС от сплиттера, ONU, камеры, медиаконвертера или радиомоста. Кабель прокладывается между муфтой, кроссом, креплением или OLT.', 'Недопустимое действие');
                return;
            }
            if (cableUndergroundActive) {
                if (type === 'manhole') {
                    handleManholeCableLayClick(placemark);
                    syncMapPanLockForEditTools();
                    return;
                }
                if (type === 'support' || type === 'attachment') {
                    showError('В подземном участке выберите второй колодец (выход).', 'Подземная прокладка');
                } else {
                    showWarning('В подземном участке выберите второй колодец для выхода.', 'Колодец');
                }
                return;
            }
            var cableEndpointsPlacemark = ['cross', 'sleeve', 'spliceCassette', 'support', 'attachment', 'manhole', 'olt'];
            if (cableEndpointsPlacemark.indexOf(type) !== -1) {
                if (!cableSource) {
                    if (isCableIntermediateWaypoint(type)) {
                        showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры, крепления и колодцы — только промежуточные точки.', 'Недопустимое действие');
                        return;
                    }
                    cableSource = placemark;
                    cableWaypoints = [];
                    resetCableUndergroundPendingSpans();
                    clearSelection();
                    selectObject(cableSource);
                    syncMapPanLockForEditTools();
                    return;
                }
                if (placemark === cableSource) {
                    cableWaypoints = [];
                    resetCableUndergroundLayingState(false);
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (type === 'manhole') {
                    handleManholeCableLayClick(placemark);
                    return;
                }
                if (type === 'support' || type === 'attachment') {
                    addCableWaypoint(placemark);
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (!validatePendingOltPortCableEndpoint(placemark)) return;
                var points = [cableSource].concat(cableWaypoints).concat([placemark]);
                var success = createCableFromPoints(points, cableTypeVal);
                if (success) {
                    if (oltPortCableJustFinished) {
                        oltPortCableJustFinished = false;
                        clearSelection();
                        removeCablePreview();
                        syncMapPanLockForEditTools();
                        return;
                    }
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                    syncMapPanLockForEditTools();
                }
                return;
            }
            if (type === 'node') {
                showError('Узел сети нельзя использовать для прокладки кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            return;
        }

        if ((type === 'node' || isSleeveLikeHostType(type) || type === 'cross' || type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'radioBridge' || type === 'switch')) {
            showObjectInfo(placemark);
            return;
        }

        if (type === 'support' || type === 'attachment' || type === 'manhole') {
            if (isEditMode) {
                clearSelection();
                selectObject(placemark);
            }
            showSupportInfo(placemark);
            return;
        }

        if (type === 'signalPost') {
            if (isEditMode) {
                clearSelection();
                selectObject(placemark);
            }
            showSignalPostInfo(placemark);
            return;
        }

        if (type === 'cabinet') {
            if (isEditMode) {
                clearSelection();
                selectObject(placemark);
            }
            showCabinetInfo(placemark);
            return;
        }

        if (!isEditMode) {
            return;
        }
        
        if (selectedObjects.includes(placemark)) {
            deselectObject(placemark);
        } else {
            selectObject(placemark);
        }
    });

    placemark.events.add('dragstart', function() {
        if (typeof captureObjectDragStartState === 'function') captureObjectDragStartState(placemark);
    });

    placemark.events.add('dragend', function() {
        window.syncDragInProgress = false;
        ensurePlacemarkUniqueIdForSync(placemark);
        var uid = placemark.properties.get('uniqueId');
        if (uid && isObjectLockedByOther(uid)) {
            if (typeof showWarning === 'function') showWarning('Объект редактирует другой пользователь', 'Перемещение недоступно');
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            if (typeof resumeMapPanAfterPlacementObjectDrag === 'function') resumeMapPanAfterPlacementObjectDrag();
            clearObjectDragStartState(placemark);
            return;
        }
        if (typeof finalizeMapObjectDragEnd === 'function') {
            finalizeMapObjectDragEnd(placemark);
        } else {
            updateConnectedCables(placemark);
            saveData({ object: placemark, syncImmediate: true, undoLabel: 'перемещение' });
            if (typeof resumeMapPanAfterPlacementObjectDrag === 'function') resumeMapPanAfterPlacementObjectDrag();
        }
    });
    
    placemark.events.add('drag', function() {
        if (objectPlacementMode && typeof suspendMapPanForPlacementObjectDrag === 'function') {
            suspendMapPanForPlacementObjectDrag();
        }
        if (!window.syncDragInProgress) {
            window.syncDragInProgress = true;
            if (typeof captureObjectDragStartState === 'function' && !placemark.properties.get('_preDragGroupKey')) {
                captureObjectDragStartState(placemark);
            }
            acquireDragObjectLock(placemark);
            if (typeof mapGeoPin === 'function') mapGeoPin(placemark);
        }
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} } 
        scheduleDragUpdate(placemark);
    });

    attachHoverEventsToObject(placemark);
    if (typeof bindPlacemarkPlacementDragSupport === 'function') bindPlacemarkPlacementDragSupport(placemark);
    if (typeof markPlacemarkJustPlaced === 'function') markPlacemarkJustPlaced(placemark);
    objects.push(placemark);
    mapPerfRegister(placemark);
    if (!options.skipAddToObjects) {
        mapLimitsCache.count = (mapLimitsCache.count || 0) + 1;
        if (mapLimitsCache.limit != null) {
            mapLimitsCache.remaining = Math.max(0, mapLimitsCache.limit - mapLimitsCache.count);
        }
        updateMapLimitBanner();
    }

    var groupScope = null;
    try {
        if ((type === 'cross' || type === 'node') && typeof groupKey === 'function' && placemark.geometry) {
            groupScope = groupKey(placemark.geometry.getCoordinates());
        }
    } catch (eGroupScope) {}

    if (typeof applyMapFilterForObject === 'function') applyMapFilterForObject(placemark);

    if (type === 'cross') {
        updateCrossDisplay(groupScope);
    } else if (type === 'node') {
        updateNodeDisplay(groupScope);
    } else if (type === 'cabinet') {
        mapGeoAdd(placemark);
        if (typeof ensureObjectLabelOnMap === 'function') ensureObjectLabelOnMap(placemark);
    } else if (placemarkProperties.cabinetId) {
        if (typeof updateCabinetAfterMemberChange === 'function') updateCabinetAfterMemberChange(placemark);
    } else {
        mapGeoAdd(placemark);
        if (typeof ensureObjectLabelOnMap === 'function') ensureObjectLabelOnMap(placemark);
    }

    if (typeof window.syncSendOp === 'function') {
        var data = serializeOneObject(placemark);
        if (data) {
            window.syncSendOp({ type: 'add_object', data: data });
            if (typeof bumpMapRevisionAfterSyncAdd === 'function') bumpMapRevisionAfterSyncAdd(placemark);
        }
    }
    saveData({ skipSync: true, addObject: placemark, undoLabel: 'добавление' });

    var deferCreateSideEffects = function() {
        if (type === 'cabinet' && typeof updateCabinetLabel === 'function') {
            try { updateCabinetLabel(placemark); } catch (eCab) {}
        }
        // Не remount все регионы (remove+add) — это дергает всю карту при каждом клике.
        if (type !== 'cross' && type !== 'node' && type !== 'cabinet' && !placemarkProperties.cabinetId) {
            if (window.MapRegions && MapRegions.removeErrantRegionObjectLabels) {
                try { MapRegions.removeErrantRegionObjectLabels(myMap, objects); } catch (eReg2) {}
            }
        }
        updateStats();
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(deferCreateSideEffects, { timeout: 120 });
            } else {
                setTimeout(deferCreateSideEffects, 0);
            }
        });
    } else {
        setTimeout(deferCreateSideEffects, 0);
    }

    if (objectPlacementMode && typeof canBeCabinetMember === 'function' && canBeCabinetMember(type) && typeof finishMemberCabinetPlacement === 'function' && !placemarkProperties.cabinetId) {
        finishMemberCabinetPlacement(placemark);
    }
    logAction(ActionTypes.CREATE_OBJECT, {
        objectType: type,
        name: name || ''
    });
    return placemark;
}
