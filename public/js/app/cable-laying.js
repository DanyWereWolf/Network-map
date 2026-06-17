/**
 * Прокладка кабелей: createCableFromPoints, sync op.
 */
function revertCableFiberCountInputs(cableUniqueId) {
    var cable = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cable' && obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable) return;
    var count = String(getFiberCount(cable));
    document.querySelectorAll('.cable-fiber-count-input').forEach(function(inp) {
        if (inp.getAttribute('data-cable-id') === cableUniqueId) inp.value = count;
    });
    var mainInput = document.getElementById('cableFiberCountInput');
    if (mainInput && cable === currentModalObject) mainInput.value = count;
}

async function updateCableFiberSettings(cableUniqueId, fiberCount, fiberPalette) {
    var cable = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cable' && obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable || !window.FiberCableConfig) return false;
    var oldCount = getFiberCount(cable);
    var newCount = Math.max(1, Math.min(window.FiberCableConfig.MAX_FIBERS, parseInt(fiberCount, 10) || 1));
    var removedConnections = 0;
    if (newCount < oldCount) {
        var lost = countConnectionsLostOnCableFiberReduction(cableUniqueId, newCount);
        var ok = await showConfirm(
            formatCableFiberReductionLossMessage(oldCount, newCount, lost),
            'Изменение числа жил',
            {
                confirmText: 'Применить',
                cancelText: 'Отмена',
                closeOnBackdrop: false,
                closeOnEscape: false,
                allowCloseButton: false
            }
        );
        if (!ok) {
            revertCableFiberCountInputs(cableUniqueId);
            return false;
        }
        removedConnections = lost.total;
        pruneConnectionsForRemovedCableFibers(cableUniqueId, newCount);
    }
    window.FiberCableConfig.applyCableFiberSettings(cable, newCount, fiberPalette);
    disableCableMapBalloon(cable);
    saveData();
    if (currentModalObject) {
        if (currentModalObject === cable) showCableInfo(cable);
        else refreshObjectModal(currentModalObject);
    }
    return true;
}

/** Без uniqueId op add_cable на сервере не находит концы — кабель не попадает в сохранённое состояние. */
function ensurePlacemarkUniqueIdForSync(pm) {
    if (!pm || !pm.properties) return;
    var uid = pm.properties.get('uniqueId');
    if (uid != null && uid !== '') return;
    var t = pm.properties.get('type') || 'obj';
    pm.properties.set('uniqueId', generateUniqueId(t));
}

/** Сохраняет uniqueId точек маршрута на сервер до add_cable. */
function syncCableRoutePlacemarkUids(points) {
    if (!points || points.length < 2) return [];
    var changed = [];
    for (var i = 0; i < points.length; i++) {
        var pm = points[i];
        if (!pm || !pm.properties) continue;
        var t = pm.properties.get('type');
        if (!t || t === 'cable' || t === 'cableLabel') continue;
        var hadUid = pm.properties.get('uniqueId');
        ensurePlacemarkUniqueIdForSync(pm);
        var nowUid = pm.properties.get('uniqueId');
        if (nowUid && (hadUid == null || hadUid === '')) {
            if (changed.indexOf(pm) === -1) changed.push(pm);
        }
    }
    if (changed.length && typeof saveLinkedMapObjects === 'function') {
        saveLinkedMapObjects(changed);
    }
    return changed;
}

function createCableFromPoints(points, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false, copperMeta = null, undergroundSpans = null) {
    if (!points || points.length < 2) return false;
    points = dedupeSupportAttachmentInCablePoints(points);
    if (!points || points.length < 2) return false;
    
    var firstType = points[0] && points[0].properties ? points[0].properties.get('type') : null;
    var lastType = points[points.length - 1] && points[points.length - 1].properties ? points[points.length - 1].properties.get('type') : null;

    if (isCopperCableType(cableType)) {
        if (!validateCopperCableRoute(points, skipSync, copperMeta || {})) return false;
    } else {
        if (firstType === 'node' || lastType === 'node') {
            if (!skipSync) showError('Нельзя прокладывать кабель напрямую к узлу сети. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
            return false;
        }
        const validEndpoints = ['sleeve', 'cross', 'olt'];
        if (validEndpoints.indexOf(firstType) === -1) {
            if (!skipSync) showError('Кабель можно прокладывать от муфты, кросса или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return false;
        }
        if (validEndpoints.indexOf(lastType) === -1) {
            if (!skipSync) showError('Кабель можно прокладывать до муфты, кросса или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return false;
        }

        for (var idx = 0; idx < points.length; idx++) {
            var obj = points[idx];
            var pt = obj && obj.properties ? obj.properties.get('type') : null;
            if (pt === 'node') {
                if (!skipSync) showError('Узел сети не может быть промежуточной точкой кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return false;
            }
            if (pt === 'splitter' || pt === 'onu' || pt === 'camera' || pt === 'mediaConverter') {
                if (!skipSync) showError('Сплиттер, ONU, камера и медиаконвертер не могут быть началом, концом или промежуточной точкой кабеля ВОЛС. Кабель прокладывается между муфтой, кроссом или OLT.', 'Недопустимое действие');
                return false;
            }
        }
    }

    const fiberCount = getFiberCount(cableType);

    var spansForCable = undergroundSpans != null ? undergroundSpans : mergeUndergroundSpansForCreate(null);
    if (!isCopperCableType(cableType) && spansForCable.length) {
        for (var spChk = 0; spChk < spansForCable.length; spChk++) {
            var spRaw = spansForCable[spChk];
            var sp = window.CableUnderground ? CableUnderground.normalizeSpanRecord(spRaw) : spRaw;
            var pairOk = false;
            var eId = sp && (sp.entryManholeId || sp.manholeId);
            var xId = sp && (sp.exitManholeId || sp.supportId);
            for (var pi = 0; pi < points.length - 1; pi++) {
                var ptA = points[pi];
                var ptB = points[pi + 1];
                if (!ptA || !ptB || !ptA.properties || !ptB.properties) continue;
                if (ptA.properties.get('type') !== 'manhole' || ptB.properties.get('type') !== 'manhole') continue;
                var u0 = getObjectUniqueId(ptA);
                var u1 = getObjectUniqueId(ptB);
                if ((u0 === eId && u1 === xId) || (u0 === xId && u1 === eId)) {
                    pairOk = true;
                    break;
                }
            }
            if (!pairOk) {
                if (!skipSync) showError('Подземный участок — два колодца подряд на маршруте (вход и выход).', 'Маршрут кабеля');
                return false;
            }
        }
    }
    var coords;
    let totalDistance;
    if (!isCopperCableType(cableType) && window.CableUnderground && spansForCable.length) {
        coords = CableUnderground.buildAerialCableCoordsFromRoute(points);
        totalDistance = CableUnderground.computeRouteDistance(points, spansForCable);
    } else {
        coords = points.map(function (obj) { return obj.geometry.getCoordinates(); });
    }
    if (!coords || coords.length < 2) return false;

    if (totalDistance === undefined || totalDistance === null) {
        totalDistance = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            totalDistance += calculateDistance(coords[i], coords[i + 1]);
        }
    }
    
    const cableColor = getCableColor(cableType);
    const cableWidth = getCableWidth(cableType);
    const cableDescription = getCableDescription(cableType);

    const cableUniqueId = existingCableId || `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const polyline = new ymaps.Polyline(coords, {}, {
        strokeColor: cableColor,
        strokeWidth: cableWidth,
        strokeOpacity: 0.8,
        zIndex: CABLE_MAP_Z_INDEX,
        hasBalloon: false,
        hasHint: false
    });
    
    polyline.properties.set({
        type: 'cable',
        cableType: cableType,
        from: points[0],
        to: points[points.length - 1],
        uniqueId: cableUniqueId,
        distance: totalDistance,
        points: points
    });
    if (!isCopperCableType(cableType) && spansForCable.length) {
        polyline.properties.set('undergroundSpans', window.CableUnderground ? CableUnderground.cloneSpans(spansForCable) : spansForCable);
        polyline.properties.set('undergroundOverlays', []);
        polyline.properties.set('aerialOverlays', []);
    }
    if (isCopperCableType(cableType)) {
        polyline.properties.set('copperPortFrom', null);
        polyline.properties.set('copperPortTo', null);
        var cm = copperMeta || {};
        polyline.properties.set('copperSwitchFromId', cm.copperSwitchFromId || null);
        polyline.properties.set('copperSwitchToId', cm.copperSwitchToId || null);
        if (pendingCopperPortPreset) {
            var pp = pendingCopperPortPreset;
            var firstPt = points[0];
            var fUid = firstPt && firstPt.properties && firstPt.properties.get('uniqueId');
            var fType = firstPt && firstPt.properties && firstPt.properties.get('type');
            if (pp.kind === 'node' && fType === 'node' && fUid === pp.nodeUid) {
                polyline.properties.set('copperSwitchFromId', pp.switchId);
                polyline.properties.set('copperPortFrom', pp.port);
            }
            pendingCopperPortPreset = null;
        }
        var cpToMeta = cm.copperPortTo;
        if (cpToMeta != null && cpToMeta !== '' && !isNaN(parseInt(cpToMeta, 10))) {
            polyline.properties.set('copperPortTo', parseInt(cpToMeta, 10));
        }
        var cpFromMeta = cm.copperPortFrom;
        if (cpFromMeta != null && cpFromMeta !== '' && !isNaN(parseInt(cpFromMeta, 10))) {
            polyline.properties.set('copperPortFrom', parseInt(cpFromMeta, 10));
        }
        applyCopperCableOccupancyFromCable(polyline);
    } else if (isOpticalCableType(cableType) && !existingCableId) {
        applyNewCableFiberProps(polyline);
    }

    polyline.events.add('click', function(e) {
        return handleCableMapClickEvent(polyline, e);
    });
    
    disableCableMapBalloon(polyline);
    attachHoverEventsToObject(polyline);
    objects.push(polyline);
    mapPerfRegister(polyline);
    myMap.geoObjects.add(polyline);
    if (!isCopperCableType(cableType) && spansForCable.length && window.CableUnderground) {
        CableUnderground.applyCableRouteGeometry(polyline, points, spansForCable);
        if (!isMapBulkImportActive()) CableUnderground.refreshCableUndergroundOverlays(polyline);
    }
    if (!isMapBulkImportActive() && typeof applyMapFilter === 'function') applyMapFilter();

    if (fiberNumber !== null && points.length >= 2) {
        markFiberAsUsed(points[0], cableUniqueId, fiberNumber);
        markFiberAsUsed(points[points.length - 1], cableUniqueId, fiberNumber);
    }

    if (!isMapBulkImportActive()) updateCableVisualization();
    
    if (!existingCableId && !isCopperCableType(cableType) && pendingOltPortPreset &&
        typeof resolveOltPortCableEnds === 'function' && typeof buildOltPortFeederCableName === 'function') {
        var oltEnds = resolveOltPortCableEnds(points, pendingOltPortPreset);
        if (oltEnds) {
            var oltFeederName = buildOltPortFeederCableName(oltEnds.oltObj, pendingOltPortPreset.portNumber, oltEnds.hostObj);
            if (oltFeederName) polyline.properties.set('cableName', oltFeederName);
        }
    }

    if (!skipSync) {
        syncCableRoutePlacemarkUids(points);
        saveData();
        if (typeof window.syncSendOp === 'function') {
            var addCableOp = buildAddCableSyncOp(polyline, points);
            if (addCableOp) window.syncSendOp(addCableOp);
        }
        if (!skipHistoryLog) {
            const fromName = points[0].properties.get('name') || getObjectTypeName(points[0].properties.get('type'));
            const toName = points[points.length - 1].properties.get('name') || getObjectTypeName(points[points.length - 1].properties.get('type'));
            logAction(ActionTypes.CREATE_CABLE, {
                cableType: cableDescription,
                from: fromName,
                to: toName
            });
        }
    }
    if (!existingCableId && !isCopperCableType(cableType)) {
        resetCableUndergroundPendingSpans();
    }
    if (!isMapBulkImportActive()) updateStats();
    if (!existingCableId && !isCopperCableType(cableType) && typeof tryApplyOltPortPresetOnCableCreated === 'function') {
        tryApplyOltPortPresetOnCableCreated(points, polyline);
    } else if (!existingCableId && !isCopperCableType(cableType) && typeof notifyOltCableConnectivityIfNeeded === 'function') {
        notifyOltCableConnectivityIfNeeded(points, polyline);
    }
    return true;
}

function buildAddCableSyncOp(polyline, points) {
    if (!polyline || !points || points.length < 2) return null;
    for (var pUi = 0; pUi < points.length; pUi++) {
        ensurePlacemarkUniqueIdForSync(points[pUi]);
    }
    var cableType = polyline.properties.get('cableType');
    var cableUniqueId = polyline.properties.get('uniqueId');
    var coords = (window.CableUnderground && CableUnderground.getCableGeometryForSave)
        ? CableUnderground.getCableGeometryForSave(polyline)
        : null;
    if (!coords) coords = polyline.geometry ? polyline.geometry.getCoordinates() : null;
    if (!coords) coords = points.map(function(obj) { return obj.geometry.getCoordinates(); });
    coords = normalizeCableGeometry(coords) || coords;
    var totalDistance = polyline.properties.get('distance');
    if (totalDistance === undefined) {
        totalDistance = 0;
        for (var i = 0; i < coords.length - 1; i++) {
            totalDistance += calculateDistance(coords[i], coords[i + 1]);
        }
    }
    var fromUid = points[0].properties.get('uniqueId');
    var toUid = points[points.length - 1].properties.get('uniqueId');
    if (!fromUid || !toUid) return null;
    var addCableOp = {
        type: 'add_cable',
        data: {
            fromUniqueId: fromUid,
            toUniqueId: toUid,
            cableType: cableType,
            uniqueId: cableUniqueId,
            geometry: coords,
            distance: totalDistance,
            cableName: polyline.properties.get('cableName') || null
        }
    };
    var cpMfr = polyline.properties.get('cableManufacturer');
    var cpMod = polyline.properties.get('cableModel');
    if (cpMfr) addCableOp.data.cableManufacturer = cpMfr;
    if (cpMod) addCableOp.data.cableModel = cpMod;
    if (!isCopperCableType(cableType)) {
        var fcOp = polyline.properties.get('fiberCount');
        if (fcOp != null && fcOp !== '') addCableOp.data.fiberCount = parseInt(fcOp, 10);
        var fpOp = polyline.properties.get('fiberPalette');
        if (Array.isArray(fpOp) && fpOp.length) addCableOp.data.fiberPalette = fpOp;
    }
    if (points.length >= 2) {
        var ridAdd = [];
        for (var piAdd = 0; piAdd < points.length; piAdd++) {
            var uAdd = points[piAdd] && points[piAdd].properties && points[piAdd].properties.get('uniqueId');
            if (!uAdd) {
                ridAdd = null;
                break;
            }
            ridAdd.push(uAdd);
        }
        if (ridAdd && ridAdd.length === points.length) addCableOp.data.routeUniqueIds = ridAdd;
    }
    if (!isCopperCableType(cableType)) {
        var uSpans = polyline.properties.get('undergroundSpans');
        if (Array.isArray(uSpans) && uSpans.length) addCableOp.data.undergroundSpans = uSpans;
    }
    if (isCopperCableType(cableType)) {
        var cfs = polyline.properties.get('copperSwitchFromId');
        var cts = polyline.properties.get('copperSwitchToId');
        var cpfS = polyline.properties.get('copperPortFrom');
        var cptS = polyline.properties.get('copperPortTo');
        if (cfs) addCableOp.data.copperSwitchFromId = cfs;
        if (cts) addCableOp.data.copperSwitchToId = cts;
        if (cpfS != null && cpfS !== '') addCableOp.data.copperPortFrom = cpfS;
        if (cptS != null && cptS !== '') addCableOp.data.copperPortTo = cptS;
    }
    return addCableOp;
}
