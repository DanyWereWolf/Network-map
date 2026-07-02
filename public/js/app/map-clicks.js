/**
 * Клики и движение мыши по карте в режиме редактирования.
 */
function validateFiberCableLayEndpoint(endpointObj) {
    if (typeof validatePendingOltPortCableEndpoint === 'function' && !validatePendingOltPortCableEndpoint(endpointObj)) return false;
    if (typeof validatePendingRadioBridgePortCableEndpoint === 'function' && !validatePendingRadioBridgePortCableEndpoint(endpointObj)) return false;
    return true;
}

function processFiberCableEndpointClick(clickedObject) {
    if (!clickedObject || !clickedObject.geometry) return;
    var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
    var cableType = getEffectiveCableLayingType();
    var hadCableSource = !!cableSource;

    function afterCableSourceSet() {
        if (typeof syncCabinetCableSourceHighlight === 'function') syncCabinetCableSourceHighlight();
        if (!hadCableSource && cableSource && getObjectCabinetId && getObjectCabinetId(cableSource) &&
            typeof notifyCableLayingSourceInCabinet === 'function') {
            notifyCableLayingSourceInCabinet();
        }
    }

    if (objType === 'splitter' || objType === 'onu' || objType === 'camera' || objType === 'mediaConverter' ||
        (objType === 'radioBridge' && !(typeof isRadioBridgeFiberCableLayToEndpointActive === 'function' && isRadioBridgeFiberCableLayToEndpointActive()))) {
        showError('Нельзя прокладывать кабель ВОЛС от сплиттера, ONU, камеры или медиаконвертера. Кабель прокладывается между муфтой, кроссом, креплением, OLT или радиомостом (оптический порт).', 'Недопустимое действие');
        return;
    }

    if (isFiberCableEndpointType(objType) || isCableIntermediateWaypoint(objType)) {
        if (!cableSource) {
            if (isCableIntermediateWaypoint(objType)) {
                showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры, крепления и колодцы — только промежуточные точки.', 'Недопустимое действие');
                return;
            }
            cableSource = clickedObject;
            cableWaypoints = [];
            resetCableUndergroundPendingSpans();
            clearSelection();
            selectObject(cableSource);
            afterCableSourceSet();
            return;
        }
        if (clickedObject === cableSource) {
            cableWaypoints = [];
            resetCableUndergroundLayingState(false);
            clearSelection();
            selectObject(cableSource);
            return;
        }
        if (objType === 'manhole') {
            handleManholeCableLayClick(clickedObject);
            return;
        }
        if (objType === 'support' || objType === 'attachment') {
            addCableWaypoint(clickedObject);
            clearSelection();
            selectObject(cableSource);
            return;
        }
        if (cableUndergroundActive) {
            showError('Завершите подземный участок: кликайте по карте и выберите второй колодец, или Escape для отмены.', 'Колодец');
            return;
        }
        if (!validateFiberCableLayEndpoint(clickedObject)) return;
        var pointsEnd = [cableSource].concat(cableWaypoints).concat([clickedObject]);
        var successEnd = createCableFromPoints(pointsEnd, cableType);
        if (successEnd) {
            if (oltPortCableJustFinished || radioBridgePortCableJustFinished) {
                oltPortCableJustFinished = false;
                radioBridgePortCableJustFinished = false;
                clearSelection();
                removeCablePreview();
                return;
            }
            hadCableSource = true;
            cableSource = clickedObject;
            cableWaypoints = [];
            clearSelection();
            selectObject(cableSource);
            removeCablePreview();
            afterCableSourceSet();
        }
        return;
    }
    if (objType === 'node') {
        showError('Нельзя прокладывать кабель к узлу сети. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
        return;
    }

    if (!cableSource) {
        if (!isFiberCableEndpointType(objType)) {
            showError('Начало кабеля должно быть муфтой, сплайс-кассетой, кроссом или OLT. Опоры, крепления и колодцы — только промежуточные точки.', 'Недопустимое действие');
            return;
        }
        cableSource = clickedObject;
        cableWaypoints = [];
        resetCableUndergroundPendingSpans();
        clearSelection();
        selectObject(cableSource);
        afterCableSourceSet();
        return;
    }

    if (clickedObject === cableSource) {
        cableWaypoints = [];
        resetCableUndergroundLayingState(false);
        clearSelection();
        selectObject(cableSource);
        return;
    }
    if (objType === 'manhole') {
        handleManholeCableLayClick(clickedObject);
        return;
    }
    if (objType === 'support' || objType === 'attachment') {
        addCableWaypoint(clickedObject);
        clearSelection();
        selectObject(cableSource);
        return;
    }
    if (isFiberCableEndpointType(objType)) {
        if (cableUndergroundActive) {
            showError('Завершите подземный участок: кликайте по карте и выберите второй колодец, или Escape для отмены.', 'Колодец');
            return;
        }
        if (!validateFiberCableLayEndpoint(clickedObject)) return;
        var pointsFin = [cableSource].concat(cableWaypoints).concat([clickedObject]);
        var successFin = createCableFromPoints(pointsFin, cableType);
        if (successFin) {
            if (oltPortCableJustFinished || radioBridgePortCableJustFinished) {
                oltPortCableJustFinished = false;
                radioBridgePortCableJustFinished = false;
                clearSelection();
                removeCablePreview();
                return;
            }
            hadCableSource = true;
            cableSource = clickedObject;
            cableWaypoints = [];
            clearSelection();
            selectObject(cableSource);
            removeCablePreview();
            afterCableSourceSet();
        }
        return;
    }
    showError('Кабель прокладывается между муфтой, сплайс-кассетой, кроссом или OLT. Промежуточные точки: опора, крепление; под землёй — между двумя колодцами.', 'Недопустимое действие');
}

function handleMapClick(e) {
    try {
    clearShowOnMapHighlight();
    const coords = e.get('coords');
    window.lastMapClickCoords = coords;

    const target = e.get('target');
    if (radioBridgeRoutingMode && radioBridgeRoutingData) {
        if (Date.now() < placementPanBlockClickUntil) return;
        handleRadioBridgeRoutingClick(coords);
        return;
    }
    if (cableSplitMode && cableSplitData) {
        handleCableSplitMapClick(coords, resolveCableFromMapTarget(target));
        return;
    }
    const zoom = myMap.getZoom();
    const clickedCable = findCableAtCoords(coords, zoom);

    var cableFromTarget = resolveCableFromMapTarget(target);
    if (cableFromTarget) {
        showCableInfo(cableFromTarget);
        return;
    }

    if (clickedCable && !(cableSplitMode && cableSplitData)) {
        showCableInfo(clickedCable);
        return;
    }

    if (splitterFiberRoutingMode && splitterFiberRoutingData) {
        if (Date.now() < placementPanBlockClickUntil) return;
        handleSplitterFiberRoutingClick(coords);
        return;
    }
    
    if (fiberRoutingMode && fiberRoutingData) {
        if (Date.now() < placementPanBlockClickUntil) return;
        handleFiberRoutingClick(coords);
        return;
    }

    if (!isEditMode) {
        return;
    }

    if (regionDrawMode) {
        regionDrawCoords.push(coords);
        updateRegionDrawBar();
        updateRegionDrawPreview();
        return;
    }

    if (cableUndergroundEditMode && cableUndergroundEditCable) {
        var editCoords = e.get('coords');
        var zoomEdit = myMap ? myMap.getZoom() : 15;
        var clickedObjEdit = findObjectAtCoords(editCoords, null, {
            pixelRadius: getCableSnapPixelRadius(zoomEdit, 'click')
        });
        if (clickedObjEdit && clickedObjEdit.geometry && clickedObjEdit.properties) {
            var ugEditType = clickedObjEdit.properties.get('type');
            if (ugEditType === 'manhole') {
                var epUg = getUndergroundEditSpanEndpoints(cableUndergroundEditCable, cableUndergroundEditSpanIndex);
                var clickUid = getObjectUniqueId(clickedObjEdit);
                if (epUg && clickUid === epUg.norm.exitManholeId) {
                    saveUndergroundSpanEdit();
                    return;
                }
                showWarning('Кликайте по карте. Завершение — <strong>второй колодец</strong> (выход) или «Готово».', 'Подземная прокладка');
                return;
            }
            if (ugEditType === 'support' || ugEditType === 'attachment') {
                showError('Сначала завершите подземный участок (второй колодец или «Готово»).', 'Подземная прокладка');
                return;
            }
        }
        if (editCoords && editCoords.length >= 2) {
            var lastEd = cableUndergroundCoords.length ? cableUndergroundCoords[cableUndergroundCoords.length - 1] : null;
            var minStepEd = 0.000008;
            if (!lastEd || Math.abs(lastEd[0] - editCoords[0]) > minStepEd || Math.abs(lastEd[1] - editCoords[1]) > minStepEd) {
                cableUndergroundCoords.push(editCoords);
                persistUndergroundRelayoutDraft();
            }
            updateUndergroundEditPreview(editCoords);
            updateUndergroundEditBarText();
        }
        return;
    }

    if (objectPlacementMode) {
        const coords = e.get('coords');

        if (Date.now() < placementPanBlockClickUntil) {
            return;
        }

        if (placeObjectAtCoords(coords)) {
            requestAnimationFrame(function() { saveData(); });
        }
        return;
    }

    if (currentCableTool && isEditMode) {
        if (Date.now() < placementPanBlockClickUntil) {
            return;
        }
        const coords = e.get('coords');
        const zoom = myMap.getZoom();
        const clickedCable = findCableAtCoords(coords, zoom);

        if (clickedCable && !(cableSplitMode && cableSplitData)) {
            showCableInfo(clickedCable);
            return;
        }

        if (cableSplitMode && cableSplitData) {
            handleCableSplitMapClick(coords);
            return;
        }

        const clickedObject = findObjectAtCoords(coords, null, {
            pixelRadius: getCableSnapPixelRadius(zoom, 'click'),
            priorityTypes: ['cabinet', 'cross', 'sleeve', 'olt'],
            excludeCabinetMembers: true
        });
        const cableType = getEffectiveCableLayingType();
        if (isCopperCableType(cableType)) {
            if (clickedObject && clickedObject.geometry) {
                var otc = clickedObject.properties.get('type');
                if (typeof tryProcessCabinetCableClick === 'function' &&
                    tryProcessCabinetCableClick(clickedObject)) return;
                if (handleCopperCablePlacemarkStep(clickedObject, otc, cableType)) return;
            } else if (cableSource) {
                const autoSelectTolerance = getCableAutoSelectTolerance(zoom);
                var cabNearCu = findObjectAtCoords(coords, null, {
                    pixelRadius: getCableSnapPixelRadius(zoom, 'auto'),
                    includeTypes: ['cabinet'],
                    excludeObject: cableSource
                });
                if (cabNearCu && typeof tryProcessCabinetCableClick === 'function' &&
                    tryProcessCabinetCableClick(cabNearCu)) return;
                var nearestCu = null;
                var minDCu = Infinity;
                objects.forEach(function(obj) {
                    if (!obj || !obj.geometry || !obj.properties) return;
                    var tc = obj.properties.get('type');
                    if (tc === 'node' && getNodeAttachedSwitches(obj).length === 0) return;
                    if (['switch', 'node', 'support', 'attachment', 'camera', 'mediaConverter'].indexOf(tc) === -1) return;
                    if (obj === cableSource) return;
                    try {
                        var oc = obj.geometry.getCoordinates();
                        var latD = Math.abs(oc[0] - coords[0]);
                        var lonD = Math.abs(oc[1] - coords[1]);
                        var dist = Math.sqrt(latD * latD + lonD * lonD);
                        if (dist < autoSelectTolerance && dist < minDCu) {
                            minDCu = dist;
                            nearestCu = obj;
                        }
                    } catch (eCu) {}
                });
                if (nearestCu) {
                    var tnc = nearestCu.properties.get('type');
                    if (tnc === 'support' || tnc === 'attachment') {
                        addCableWaypoint(nearestCu);
                        clearSelection();
                        selectObject(cableSource);
                    } else {
                        var toSwNearest = null;
                        if (tnc === 'node') {
                            toSwNearest = resolveSwitchIdForCopperNodeClick(nearestCu);
                            if (!toSwNearest) return;
                        }
                        var copperMetaNear = {
                            copperSwitchFromId: cableSource.properties.get('type') === 'node' ? cableSourceCopperSwitchId : null,
                            copperSwitchToId: tnc === 'node' ? toSwNearest : null
                        };
                        var ptsCu = [cableSource].concat(cableWaypoints).concat([nearestCu]);
                        openCopperEndPortModal(ptsCu, cableType, copperMetaNear);
                    }
                }
            }
            return;
        }

        if (cableUndergroundActive && clickedObject && clickedObject.geometry) {
            var ugType = clickedObject.properties.get('type');
            if (ugType === 'manhole') {
                handleManholeCableLayClick(clickedObject);
                return;
            }
            if (ugType === 'support' || ugType === 'attachment') {
                showError('В подземном участке выберите <strong>второй колодец</strong> (выход). Опора — только после выхода из колодца.', 'Подземная прокладка');
                return;
            }
            showWarning('В подземном участке кликайте по карте для трассы или выберите <strong>второй колодец</strong> для выхода.', 'Колодец');
            return;
        }

        if (clickedObject && clickedObject.geometry) {
            if (typeof tryProcessCabinetCableClick === 'function' &&
                tryProcessCabinetCableClick(clickedObject, processFiberCableEndpointClick)) {
                return;
            }

            processFiberCableEndpointClick(clickedObject);
            return;
        } else {

            if (cableUndergroundActive && cableSource) {
                var lastUg = cableUndergroundCoords.length ? cableUndergroundCoords[cableUndergroundCoords.length - 1] : null;
                var minStep = 0.000008;
                if (!lastUg || Math.abs(lastUg[0] - coords[0]) > minStep || Math.abs(lastUg[1] - coords[1]) > minStep) {
                    cableUndergroundCoords.push(coords);
                }
                clearSelection();
                selectObject(cableSource);
                removeCablePreview();
                updateCablePreview(cableSource, cableWaypoints, coords);
                updateUndergroundEditBarText();
                return;
            }

            if (cableSource) {
                const currentCableType = getEffectiveCableLayingType();
                var rbHostToRbLay = typeof isRadioBridgeHostToRbCableLayActive === 'function' &&
                    isRadioBridgeHostToRbCableLayActive();
                var nearestObject = findObjectAtCoords(coords, null, {
                    pixelRadius: getCableSnapPixelRadius(zoom, 'auto'),
                    priorityTypes: rbHostToRbLay
                        ? ['radioBridge', 'cross', 'sleeve', 'olt', 'support', 'attachment', 'manhole']
                        : ['cross', 'sleeve', 'olt', 'support', 'attachment', 'manhole'],
                    excludeCabinetMembers: true,
                    excludeTypes: ['cabinet'],
                    excludeObject: cableSource
                });
                if (!nearestObject) {
                    var cabNear = findObjectAtCoords(coords, null, {
                        pixelRadius: getCableSnapPixelRadius(zoom, 'auto'),
                        includeTypes: ['cabinet'],
                        excludeObject: cableSource
                    });
                    if (cabNear && cabNear !== cableSource && typeof resolveCabinetCableTarget === 'function') {
                        resolveCabinetCableTarget(cabNear, function(target) {
                            if (!target) return;
                            if (!validateFiberCableLayEndpoint(target)) return;
                            var pointsCab = [cableSource].concat(cableWaypoints).concat([target]);
                            var okCab = createCableFromPoints(pointsCab, getEffectiveCableLayingType());
                            if (okCab) {
                                if (oltPortCableJustFinished || radioBridgePortCableJustFinished) {
                                    oltPortCableJustFinished = false;
                                    radioBridgePortCableJustFinished = false;
                                    clearSelection();
                                    removeCablePreview();
                                    return;
                                }
                                cableSource = target;
                                cableWaypoints = [];
                                clearSelection();
                                selectObject(cableSource);
                                removeCablePreview();
                                if (typeof syncCabinetCableSourceHighlight === 'function') syncCabinetCableSourceHighlight();
                            }
                        });
                        return;
                    }
                }
                if (nearestObject) {
                    nearestObject = typeof resolveCableSnapEndpoint === 'function'
                        ? resolveCableSnapEndpoint(nearestObject)
                        : nearestObject;
                }
                if (nearestObject) {
                    const t = nearestObject.properties.get('type');
                    if (t === 'manhole') {
                        handleManholeCableLayClick(nearestObject);
                    } else if (t === 'support' || t === 'attachment') {
                        addCableWaypoint(nearestObject);
                        clearSelection();
                        selectObject(cableSource);
                    } else {
                        if (!validateFiberCableLayEndpoint(nearestObject)) return;
                        const pointsNear = [cableSource].concat(cableWaypoints).concat([nearestObject]);
                        const cableTypeVal = getEffectiveCableLayingType();
                        const successNear = createCableFromPoints(pointsNear, cableTypeVal);
                        if (successNear) {
                            if (oltPortCableJustFinished || radioBridgePortCableJustFinished) {
                                oltPortCableJustFinished = false;
                                radioBridgePortCableJustFinished = false;
                                clearSelection();
                                removeCablePreview();
                                return;
                            }
                            cableSource = nearestObject;
                            cableWaypoints = [];
                            clearSelection();
                            selectObject(cableSource);
                            removeCablePreview();
                        }
                    }
                }
            }
        }
        return;
    }
    
    } finally {
        try { syncMapPanLockForEditTools(); } catch (eLock) {}
    }
}

var mapMouseMoveRafId = null;
function handleMapMouseMove(e) {
    try {
        if (e.originalEvent) {
            window.lastMouseX = e.originalEvent.clientX || 0;
            window.lastMouseY = e.originalEvent.clientY || 0;
        } else if (e.get) {
            const domEvent = e.get('domEvent');
            if (domEvent) {
                window.lastMouseX = domEvent.clientX || 0;
                window.lastMouseY = domEvent.clientY || 0;
            }
        }
    } catch (err) {}
    
    const mapCoords = e.get('coords');
    if (mapCoords && window.syncIsConnected && typeof window.syncSendCursor === 'function') {
        window.syncSendCursor(mapCoords);
    }

    if (!isEditMode) {
        return;
    }

    if (objectPlacementMode) {
        const type = currentPlacementType;
        updatePhantomPlacemark(type, mapCoords);
        if (type) updateCursorIndicator(e, type);
        return;
    }

    if (cableUndergroundEditMode && cableUndergroundEditCable && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coordsEd = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            updateUndergroundEditPreview(coordsEd);
        });
    }

    if (currentCableTool && cableSource && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        var ev = e;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var previewZoom = myMap.getZoom();
            var snapObj = findObjectAtCoords(coords, null, {
                pixelRadius: getCableSnapPixelRadius(previewZoom, 'preview'),
                priorityTypes: ['cross', 'crossGroup', 'sleeve', 'olt', 'support', 'attachment', 'manhole'],
                excludeCabinetMembers: true,
                excludeTypes: ['cabinet'],
                excludeObject: cableSource
            });
            var previewCoords = coords;
            if (snapObj && snapObj !== cableSource) {
                var t = snapObj.properties.get('type');
                if (t !== 'cable' && t !== 'cableLabel') {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateCablePreview(cableSource, cableWaypoints, previewCoords);
        });
    }

    if (splitterFiberRoutingMode && splitterFiberRoutingData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(coords);
            var previewCoords = coords;
            if (snapObj) {
                var t = snapObj.properties.get('type');
                if (t === 'support' || t === 'attachment' || getObjectUniqueId(snapObj) === splitterFiberRoutingData.targetId ||
                    (typeof isGponFiberRoutingTargetReachableClick === 'function' &&
                        isGponFiberRoutingTargetReachableClick(splitterFiberRoutingData, snapObj)) ||
                    (typeof isGponFiberRoutingSourceUid === 'function' &&
                        isGponFiberRoutingSourceUid(splitterFiberRoutingData, getObjectUniqueId(snapObj)))) {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateSplitterFiberPreviewWithCursor(previewCoords);
        });
    }
    
    if (radioBridgeRoutingMode && radioBridgeRoutingData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var rbCoords = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(rbCoords);
            var previewCoords = rbCoords;
            if (snapObj) {
                var t = snapObj.properties.get('type');
                var sid = getObjectUniqueId(snapObj);
                if (t === 'support' || t === 'attachment' ||
                    sid === radioBridgeRoutingData.targetId ||
                    sid === getObjectUniqueId(radioBridgeRoutingData.sourceBridge)) {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateRadioBridgePreviewWithCursor(previewCoords);
        });
    }

    if (fiberRoutingMode && fiberRoutingData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(coords);
            var previewCoords = coords;
            if (snapObj) {
                var t = snapObj.properties.get('type');
                if (t === 'support' || t === 'attachment' || getObjectUniqueId(snapObj) === fiberRoutingData.targetId) {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateFiberRoutingPreviewWithCursor(previewCoords);
        });
    }

    if (cableSplitMode && cableSplitData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coordsSplit = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            updateCableSplitPreview(coordsSplit);
        });
    }
}
