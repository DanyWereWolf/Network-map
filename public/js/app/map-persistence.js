/**
 * Сериализация, save/load, undo/redo, импорт/экспорт.
 */
function serializeOneObject(obj) {
    var idx = objects.indexOf(obj);
    if (idx < 0) return null;
    var arr = getSerializedData();
    return arr[idx] || null;
}

function serializeMapItemFromObject(obj) {
    if (!obj || !obj.properties || !obj.geometry) return null;
    if (obj.properties) {
        var t0 = obj.properties.get('type');
        if (t0 && t0 !== 'cable' && t0 !== 'cableLabel') ensurePlacemarkUniqueIdForSync(obj);
    }
    const props = obj.properties.getAll();
    var geometry = obj.geometry.getCoordinates();
    var revision = getMapRevision(obj);
    if (props.type === 'cable') {
            var cableGeom = (window.CableUnderground && CableUnderground.getCableGeometryForSave)
                ? (CableUnderground.getCableGeometryForSave(obj) || normalizeCableGeometry(geometry) || geometry)
                : (normalizeCableGeometry(geometry) || geometry);
            const fromObj = props.from, toObj = props.to;
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: objects.indexOf(fromObj),
                to: objects.indexOf(toObj),
                geometry: cableGeom
            };
            if (fromObj && toObj && fromObj.properties && toObj.properties) {
                const fu = fromObj.properties.get('uniqueId');
                const tu = toObj.properties.get('uniqueId');
                if (fu) result.fromUniqueId = fu;
                if (tu) result.toUniqueId = tu;
            }
            if (props.uniqueId) result.uniqueId = props.uniqueId;
            if (props.distance !== undefined) result.distance = props.distance;
            result.cableName = props.cableName ?? null;
            var cpMfrSer = props.cableManufacturer;
            var cpModSer = props.cableModel;
            if (cpMfrSer) result.cableManufacturer = cpMfrSer;
            if (cpModSer) result.cableModel = cpModSer;
            if (!isCopperCableType(props.cableType)) {
                var fcSer = props.fiberCount;
                if (fcSer != null && fcSer !== '') result.fiberCount = parseInt(fcSer, 10);
                var fpSer = props.fiberPalette;
                if (Array.isArray(fpSer) && fpSer.length) result.fiberPalette = fpSer;
            }
            var ptsRoute = props.points;
            if (Array.isArray(ptsRoute) && ptsRoute.length >= 2) {
                var routeIds = [];
                for (var pri = 0; pri < ptsRoute.length; pri++) {
                    var ptm = ptsRoute[pri];
                    var puid = ptm && ptm.properties && ptm.properties.get('uniqueId');
                    if (!puid) {
                        routeIds = null;
                        break;
                    }
                    routeIds.push(puid);
                }
                if (routeIds && routeIds.length === ptsRoute.length) result.routeUniqueIds = routeIds;
            }
            var uSpansSer = props.undergroundSpans;
            if (Array.isArray(uSpansSer) && uSpansSer.length) result.undergroundSpans = uSpansSer;
            if (props.cableType === 'copper') {
                if (props.copperPortFrom != null && props.copperPortFrom !== '') result.copperPortFrom = props.copperPortFrom;
                if (props.copperPortTo != null && props.copperPortTo !== '') result.copperPortTo = props.copperPortTo;
                if (props.copperSwitchFromId) result.copperSwitchFromId = props.copperSwitchFromId;
                if (props.copperSwitchToId) result.copperSwitchToId = props.copperSwitchToId;
            }
            result.revision = revision;
            return result;
        }
        if (props.type === 'region') {
            var ringOut = MapRegions.getRegionRing(obj);
            var regionResult = {
                type: 'region',
                name: props.name,
                geometry: ringOut,
                fillColor: props.fillColor || MapRegions.DEFAULT_FILL,
                strokeColor: props.strokeColor || MapRegions.DEFAULT_STROKE,
                fillOpacity: props.fillOpacity != null ? props.fillOpacity : MapRegions.DEFAULT_FILL_OPACITY,
                regionVisible: props.regionVisible !== false,
                uniqueId: props.uniqueId,
                revision: revision
            };
            if (Array.isArray(props.photos) && props.photos.length) regionResult.photos = props.photos;
            return regionResult;
        }
        const result = {
            type: props.type,
            name: props.name,
            geometry: geometry,
            revision: revision
        };
        if (props.uniqueId) result.uniqueId = props.uniqueId;
        if (props.usedFibers) result.usedFibers = props.usedFibers;
        if (props.fiberConnections) result.fiberConnections = props.fiberConnections;
        if (props.fiberLabels) result.fiberLabels = props.fiberLabels;
        if (props.type === 'sleeve') {
            if (props.sleeveType) result.sleeveType = props.sleeveType;
            if (props.maxFibers !== undefined) result.maxFibers = props.maxFibers;
            appendFiberSchemeCanvasPropsToResult(props, result);
            appendFiberSchemeViewPropsToResult(props, result);
            appendFiberSchemeCableSidesToResult(props, result);
        }
        if (props.type === 'spliceCassette') {
            if (props.cassetteType) result.cassetteType = props.cassetteType;
            if (props.maxFibers !== undefined) result.maxFibers = props.maxFibers;
            appendFiberSchemeCanvasPropsToResult(props, result);
            appendFiberSchemeViewPropsToResult(props, result);
            appendFiberSchemeCableSidesToResult(props, result);
        }
        if (props.type === 'cross') {
            appendFiberSchemeCanvasPropsToResult(props, result);
            appendFiberSchemeViewPropsToResult(props, result);
            appendFiberSchemeCableSidesToResult(props, result);
            if (props.crossType) result.crossType = props.crossType;
            if (props.crossPorts) result.crossPorts = props.crossPorts;
            if (props.crossCopperPorts !== undefined && props.crossCopperPorts !== null) result.crossCopperPorts = props.crossCopperPorts;
            if (props.copperPortUsage) result.copperPortUsage = props.copperPortUsage;
            if (props.nodeConnections) result.nodeConnections = props.nodeConnections;
            if (props.fiberPorts) result.fiberPorts = props.fiberPorts;
            if (props.crossPortPatches) result.crossPortPatches = props.crossPortPatches;
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
            if (props.mediaConverterConnections) result.mediaConverterConnections = props.mediaConverterConnections;
            if (props.radioBridgeConnections) result.radioBridgeConnections = props.radioBridgeConnections;
            if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
            if (Array.isArray(props.embeddedSplitters)) {
                result.embeddedSplitters = props.embeddedSplitters;
            }
        }
        if (isSleeveLikeHostType(props.type)) {
            if (props.nodeConnections) result.nodeConnections = props.nodeConnections;
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
            if (props.mediaConverterConnections) result.mediaConverterConnections = props.mediaConverterConnections;
            if (props.radioBridgeConnections) result.radioBridgeConnections = props.radioBridgeConnections;
            if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
            if (Array.isArray(props.embeddedSplitters)) {
                result.embeddedSplitters = props.embeddedSplitters;
            }
        }
        if (props.type === 'olt') {
            if (props.ponPorts !== undefined) result.ponPorts = props.ponPorts;
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            else if (props.incomingFiber === null) result.incomingFiber = null;
            if (props.portAssignments) result.portAssignments = props.portAssignments;
            if (props.portLabels) result.portLabels = props.portLabels;
            if (props.ponPortTypes) result.ponPortTypes = props.ponPortTypes;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
        }
        if (props.type === 'splitter') {
            if (props.splitRatio !== undefined) result.splitRatio = props.splitRatio;
            if (props.inputFiber) result.inputFiber = props.inputFiber;
            if (props.outputConnections) result.outputConnections = props.outputConnections;
            if (props.outputLabels) result.outputLabels = props.outputLabels;
        }
        if (props.type === 'onu') {
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
        }
        if (props.type === 'camera') {
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
            if (props.streamType && props.streamType !== 'none') result.streamType = props.streamType;
            else if (props.streamUrl) result.streamType = props.streamType || 'none';
            if (props.streamUrl) result.streamUrl = props.streamUrl;
            if (props.streamUser) result.streamUser = props.streamUser;
            if (props.streamPass) result.streamPass = props.streamPass;
            if (props.streamAutoplay === false) result.streamAutoplay = false;
            if (props.streamMuted === false) result.streamMuted = false;
            if (props.snapshotPhoto) result.snapshotPhoto = props.snapshotPhoto;
        }
        if (props.type === 'mediaConverter') {
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
        }
        if (props.type === 'radioBridge') {
            if (props.bridgeMode) result.bridgeMode = props.bridgeMode;
            if (props.role) result.role = props.role;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
            result.peerBridgeId = props.peerBridgeId || null;
            result.peerBridgeName = props.peerBridgeName || null;
            result.routeIds = Array.isArray(props.routeIds) ? props.routeIds : [];
            result.stationLinks = Array.isArray(props.stationLinks) ? props.stationLinks : [];
            result.ptpPeerLinks = Array.isArray(props.ptpPeerLinks) ? props.ptpPeerLinks : [];
            result.apBridgeId = props.apBridgeId || null;
            result.apBridgeName = props.apBridgeName || null;
            result.ptpPeerId = props.ptpPeerId || null;
            result.ptpPeerName = props.ptpPeerName || null;
            result.incomingFiber = props.incomingFiber || null;
            result.showCoverage = !!props.showCoverage;
            result.coverageShape = props.coverageShape || 'circle';
            var radiusKmRaw = props.coverageRadiusKm != null && props.coverageRadiusKm !== ''
                ? parseFloat(props.coverageRadiusKm)
                : (props.coverageRadiusM != null ? props.coverageRadiusM / 1000 : 3);
            var radiusKm = radiusKmRaw > 50 ? radiusKmRaw / 1000 : radiusKmRaw;
            if (isNaN(radiusKm) || radiusKm <= 0) radiusKm = 3;
            var lengthKmRaw = props.coverageLengthKm != null && props.coverageLengthKm !== ''
                ? parseFloat(props.coverageLengthKm)
                : (props.coverageLengthM != null ? props.coverageLengthM / 1000 : radiusKm);
            var lengthKm = lengthKmRaw > 50 ? lengthKmRaw / 1000 : lengthKmRaw;
            if (isNaN(lengthKm) || lengthKm <= 0) lengthKm = radiusKm;
            result.coverageRadiusKm = radiusKm;
            result.coverageLengthKm = lengthKm;
            result.coverageAzimuth = props.coverageAzimuth != null ? props.coverageAzimuth : 0;
            result.coverageAngle = props.coverageAngle != null ? props.coverageAngle : 60;
            if (Array.isArray(props.radioBridgePortTypes) && props.radioBridgePortTypes.length) {
                result.radioBridgePortTypes = props.radioBridgePortTypes.slice();
            }
            if (props.copperPortUsage && Object.keys(props.copperPortUsage).length) {
                result.copperPortUsage = Object.assign({}, props.copperPortUsage);
            }
            if (props.portLabels && Object.keys(props.portLabels).length) {
                result.portLabels = Object.assign({}, props.portLabels);
            }
            if (props.manualPortUsage && Object.keys(props.manualPortUsage).length) {
                result.manualPortUsage = Object.assign({}, props.manualPortUsage);
            }
        }
        if (props.type === 'signalPost') {
            if (props.comment != null) result.comment = props.comment;
        }
        if (props.type === 'cabinet') {
            if (props.comment != null) result.comment = props.comment;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.cabinetMount) result.cabinetMount = props.cabinetMount;
            if (props.cabinetHeight) result.cabinetHeight = props.cabinetHeight;
            if (props.cabinetWidth) result.cabinetWidth = props.cabinetWidth;
            if (props.cabinetUnits) result.cabinetUnits = props.cabinetUnits;
            if (props.address) result.address = props.address;
            if (props.inventoryNumber) result.inventoryNumber = props.inventoryNumber;
            if (props.serialNumber) result.serialNumber = props.serialNumber;
            if (props.ipAddress) result.ipAddress = props.ipAddress;
        }
        if (props.cabinetId) {
            result.cabinetId = props.cabinetId;
            if (props.cabinetOrder != null && props.cabinetOrder !== '') {
                result.cabinetOrder = Number(props.cabinetOrder);
            }
        }
        else if (typeof canBeCabinetMember === 'function' && canBeCabinetMember(props.type)) {
            result.cabinetId = null;
        }
        if (props.type === 'node') {
            if (props.nodeKind) result.nodeKind = props.nodeKind;
            if (props.comment) result.comment = props.comment;
            var attSw = props.attachedSwitches;
            if (Array.isArray(attSw) && attSw.length) result.attachedSwitches = JSON.parse(JSON.stringify(attSw));
        }
        if (props.type === 'switch') {
            if (props.parentNodeId) result.parentNodeId = props.parentNodeId;
            if (props.switchPortTypes) result.switchPortTypes = props.switchPortTypes;
            if (props.copperPortUsage) result.copperPortUsage = props.copperPortUsage;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment != null) result.comment = props.comment;
        }
        if (Array.isArray(props.photos) && props.photos.length) result.photos = props.photos;
        return result;
}

function getSerializedData() {
    return objects.map(function(obj) { return serializeMapItemFromObject(obj); }).filter(Boolean);
}

function cloneMapSnapshot(state) {
    return JSON.parse(JSON.stringify(state));
}

function indexMapSnapshot(state) {
    var objectsByUid = Object.create(null);
    var cablesByUid = Object.create(null);
    var missingUid = 0;
    if (!Array.isArray(state)) return { objectsByUid: objectsByUid, cablesByUid: cablesByUid, missingUid: 0 };
    for (var i = 0; i < state.length; i++) {
        var item = state[i];
        if (!item || !item.type) continue;
        if (item.uniqueId == null || item.uniqueId === '') {
            missingUid++;
            continue;
        }
        var uid = String(item.uniqueId);
        if (item.type === 'cable') cablesByUid[uid] = item;
        else objectsByUid[uid] = item;
    }
    return { objectsByUid: objectsByUid, cablesByUid: cablesByUid, missingUid: missingUid };
}

function snapshotItemEquals(a, b) {
    if (!a || !b) return false;
    if (a.revision != null && b.revision != null) return Number(a.revision) === Number(b.revision);
    return JSON.stringify(a) === JSON.stringify(b);
}

function diffMapSnapshots(fromState, toState) {
    var from = indexMapSnapshot(fromState);
    var to = indexMapSnapshot(toState);
    if (from.missingUid || to.missingUid) return null;
    var diff = {
        added: [],
        removed: [],
        updated: [],
        cablesAdded: [],
        cablesRemoved: [],
        cablesUpdated: [],
        nodeGroupKeys: [],
        crossGroupKeys: [],
        hasRegion: false,
        needsConnectionLines: false,
        needsCopperRebuild: false,
        changeCount: 0
    };
    var nodeKeySet = Object.create(null);
    var crossKeySet = Object.create(null);
    function trackItem(item) {
        if (!item) return;
        if (item.type === 'region') diff.hasRegion = true;
        if (item.type === 'node' && item.geometry) {
            var nk = groupKey(item.geometry);
            if (!nodeKeySet[nk]) { nodeKeySet[nk] = true; diff.nodeGroupKeys.push(nk); }
        } else if (item.type === 'cross' && item.geometry) {
            var ck = groupKey(item.geometry);
            if (!crossKeySet[ck]) { crossKeySet[ck] = true; diff.crossGroupKeys.push(ck); }
        }
        if (item.type === 'olt' || item.type === 'onu' || item.type === 'splitter' ||
            item.type === 'mediaConverter' || item.type === 'radioBridge' || item.type === 'cross' || item.type === 'sleeve' || item.type === 'spliceCassette' || item.type === 'node') {
            diff.needsConnectionLines = true;
        }
    }
    var uid;
    for (uid in to.objectsByUid) {
        if (!Object.prototype.hasOwnProperty.call(to.objectsByUid, uid)) continue;
        var toItem = to.objectsByUid[uid];
        if (!from.objectsByUid[uid]) {
            diff.added.push(toItem);
            trackItem(toItem);
        } else if (!snapshotItemEquals(from.objectsByUid[uid], toItem)) {
            diff.updated.push(toItem);
            trackItem(toItem);
        }
    }
    for (uid in from.objectsByUid) {
        if (!Object.prototype.hasOwnProperty.call(from.objectsByUid, uid)) continue;
        if (!to.objectsByUid[uid]) {
            diff.removed.push(uid);
            trackItem(from.objectsByUid[uid]);
        }
    }
    for (uid in to.cablesByUid) {
        if (!Object.prototype.hasOwnProperty.call(to.cablesByUid, uid)) continue;
        var toCable = to.cablesByUid[uid];
        if (!from.cablesByUid[uid]) diff.cablesAdded.push(toCable);
        else if (!snapshotItemEquals(from.cablesByUid[uid], toCable)) diff.cablesUpdated.push(toCable);
    }
    for (uid in from.cablesByUid) {
        if (!Object.prototype.hasOwnProperty.call(from.cablesByUid, uid)) continue;
        if (!to.cablesByUid[uid]) diff.cablesRemoved.push(uid);
    }
    diff.needsCopperRebuild = diff.cablesRemoved.length > 0 ||
        diff.cablesAdded.some(function(c) { return c && c.cableType === 'copper'; }) ||
        diff.cablesUpdated.some(function(c) { return c && c.cableType === 'copper'; });
    diff.changeCount = diff.added.length + diff.removed.length + diff.updated.length +
        diff.cablesAdded.length + diff.cablesRemoved.length + diff.cablesUpdated.length;
    return diff;
}

function finishIncrementalUndoRedoRefresh(diff, done) {
    requestAnimationFrame(function() {
        var cablesChanged = diff.cablesAdded.length || diff.cablesRemoved.length || diff.cablesUpdated.length;
        if (cablesChanged) updateCableVisualization();
        diff.crossGroupKeys.forEach(function(k) { updateCrossDisplay(k); });
        diff.nodeGroupKeys.forEach(function(k) { updateNodeDisplay(k); });
        if (diff.needsConnectionLines) scheduleConnectionLinesUpdate('full');
        if (diff.needsCopperRebuild) rebuildAllCopperPortUsageFromCables();
        if (diff.hasRegion) {
            if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
            if (window.MapRegions && MapRegions.rebuildAllRegionLabels && myMap) {
                MapRegions.rebuildAllRegionLabels(myMap, objects);
            }
        }
        if (diff.added.length || diff.removed.length || diff.updated.length || cablesChanged) {
            if (typeof applyMapFilter === 'function') applyMapFilter();
        }
        updateStats();
        if (typeof done === 'function') done();
    });
}

function tryApplyMapStateIncrementally(fromState, toState, done) {
    var diff = diffMapSnapshots(fromState, toState);
    if (!diff) return false;
    if (diff.changeCount === 0) {
        requestAnimationFrame(function() { if (typeof done === 'function') done(); });
        return true;
    }
    if (diff.changeCount > INCREMENTAL_UNDO_MAX_CHANGES) return false;
    try {
        _mapBulkImportActive = true;
        var i;
        for (i = 0; i < diff.cablesRemoved.length; i++) {
            deleteCableByUniqueId(diff.cablesRemoved[i], { skipSync: true, deferMapRefresh: true });
        }
        for (i = 0; i < diff.removed.length; i++) {
            var remObj = getMapObjectByUid(diff.removed[i]);
            if (remObj) deleteObject(remObj, { skipSync: true, deferMapRefresh: true });
        }
        for (i = 0; i < diff.added.length; i++) {
            importDataCreatePlacemarkRef(diff.added[i]);
        }
        for (i = 0; i < diff.updated.length; i++) {
            var upItem = diff.updated[i];
            var liveObj = getMapObjectByUid(upItem.uniqueId);
            if (liveObj) populatePlacemarkFromSerializedData(liveObj, upItem);
        }
        if (diff.cablesAdded.length) {
            importDataRunCables(diff.cablesAdded, new Array(diff.cablesAdded.length));
        }
        for (i = 0; i < diff.cablesUpdated.length; i++) {
            var cableItem = diff.cablesUpdated[i];
            var liveCable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' &&
                    o.properties.get('uniqueId') === cableItem.uniqueId;
            });
            if (liveCable) applySerializedCableToMap(liveCable, cableItem, { skipVisualRefresh: true });
            else importDataRunCables([cableItem], [null]);
        }
        _mapBulkImportActive = false;
        if (typeof MapPerf !== 'undefined') MapPerf.reindexAllObjects(objects);
        finishIncrementalUndoRedoRefresh(diff, done);
        return true;
    } catch (eIncUndo) {
        _mapBulkImportActive = false;
        return false;
    }
}

function finalizeUndoRedoRestoredState(stateToRestore, message, title) {
    try {
        lastSavedState = cloneMapSnapshot(stateToRestore);
        pushSaveDataToSync({ syncFull: true, state: lastSavedState });
        if (typeof showSuccess === 'function') showSuccess(message, title);
    } finally {
        inUndoRedo = false;
        hideMapLoadingOverlay();
        updateUndoRedoButtons();
    }
}

function restoreMapStateFull(stateToRestore, message, title) {
    showUndoRedoLoadingOverlay(title === 'Повтор' ? 'Применение изменения…' : 'Восстановление карты…');
    importData(stateToRestore, { skipSave: true, skipHistory: true, undoRedo: true }, function() {
        finalizeUndoRedoRestoredState(stateToRestore, message, title);
    });
}

function saveData(opts) {
    opts = opts || {};
    if (currentModalObject && infoModalEditModeSession && !infoModalEditMode && !opts.fiberSchemeViewOnly) return;
    if (!inUndoRedo && lastSavedState !== null) {
        undoStack.push(JSON.parse(JSON.stringify(lastSavedState)));
        if (undoStack.length > UNDO_MAX) undoStack.shift();
        redoStack = [];
    }
    var data = getSerializedData();
    lastSavedState = JSON.parse(JSON.stringify(data));
    if (!(opts && opts.skipSync) && !inUndoRedo) pushSaveDataToSync(opts || {});
    if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
}

function performUndo() {
    if (!canEdit() || undoStack.length === 0 || inUndoRedo) return;
    var stateToRestore = undoStack.pop();
    var currentState = lastSavedState != null ? lastSavedState : getSerializedData();
    redoStack.push(cloneMapSnapshot(currentState));
    inUndoRedo = true;
    updateUndoRedoButtons();
    if (tryApplyMapStateIncrementally(currentState, stateToRestore, function() {
        finalizeUndoRedoRestoredState(stateToRestore, 'Действие отменено', 'Отмена');
    })) {
        return;
    }
    restoreMapStateFull(stateToRestore, 'Действие отменено', 'Отмена');
}

function performRedo() {
    if (!canEdit() || redoStack.length === 0 || inUndoRedo) return;
    var stateToRestore = redoStack.pop();
    var currentState = lastSavedState != null ? lastSavedState : getSerializedData();
    undoStack.push(cloneMapSnapshot(currentState));
    inUndoRedo = true;
    updateUndoRedoButtons();
    if (tryApplyMapStateIncrementally(currentState, stateToRestore, function() {
        finalizeUndoRedoRestoredState(stateToRestore, 'Действие повторено', 'Повтор');
    })) {
        return;
    }
    restoreMapStateFull(stateToRestore, 'Действие повторено', 'Повтор');
}

function updateUndoRedoButtons() {
    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    var busy = !!inUndoRedo;
    if (undoBtn) {
        undoBtn.disabled = busy || undoStack.length === 0;
        undoBtn.title = busy ? 'Подождите…' : (undoStack.length === 0 ? 'Отмена (Ctrl+Z)' : 'Отменить (Ctrl+Z)');
    }
    if (redoBtn) {
        redoBtn.disabled = busy || redoStack.length === 0;
        redoBtn.title = busy ? 'Подождите…' : (redoStack.length === 0 ? 'Повтор (Ctrl+Y)' : 'Повторить (Ctrl+Y)');
    }
}

function applyMapStartFromSettings(mapStart, force) {
    if (!mapStart || !Array.isArray(mapStart.center) || mapStart.center.length < 2) return false;
    if (!force && window._mapStartApplied) return false;
    if (typeof myMap === 'undefined' || !myMap) {
        window._pendingMapStart = mapStart;
        return false;
    }
    try {
        var startZoom = mapStart.zoom || 16;
        myMap.setCenter(mapStart.center, startZoom);
        window._mapStartApplied = true;
        window._pendingMapStart = null;
        return true;
    } catch (e) {
        return false;
    }
}
window.applyMapStartFromSettings = applyMapStartFromSettings;

function loadData() {
    loadGroupNamesFromStorage();
    var token = getAuthToken();
    if (!token) {
        if (typeof withDeviceCatalogHydration === 'function') {
            withDeviceCatalogHydration(function() {
                if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
                if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
            });
        } else {
            if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
            if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
        }
    } else if (typeof ensureDeviceCatalogsNonEmpty === 'function' && typeof withDeviceCatalogHydration === 'function') {
        withDeviceCatalogHydration(function() { ensureDeviceCatalogsNonEmpty(); });
    } else if (typeof ensureDeviceCatalogsNonEmpty === 'function') {
        ensureDeviceCatalogsNonEmpty();
    }
    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
    if (!getApiBase()) {
        showNoApiMessage();
        markMapDataReady();
        return;
    }
    
    (function() {
        if (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) AuthSystem.refreshUsersFromApi();
        if (!token) return;

        function fetchMapFromApi() {
            return fetch(getApiBase() + '/api/map', { headers: { 'Authorization': 'Bearer ' + token } })
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(body) {
                    if (!body || !Array.isArray(body.data)) return false;
                    if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                        window._mapOrgIdLoaded = String(currentUser.organizationId);
                    }
                    if (typeof applyRemoteState === 'function') {
                        applyRemoteState(body.data, { fromApi: true, organizationId: body.organizationId });
                    }
                    return true;
                });
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false
            && typeof OfflineMapCache !== 'undefined' && OfflineMapCache.tryRestoreAndApply) {
            OfflineMapCache.tryRestoreAndApply().then(function(restored) {
                if (!restored) fetchMapFromApi().catch(function() {});
            });
        } else {
            fetchMapFromApi().catch(function() {
                if (typeof OfflineMapCache !== 'undefined' && OfflineMapCache.tryRestoreAndApply) {
                    OfflineMapCache.tryRestoreAndApply();
                }
            });
        }
        fetch(getApiBase() + '/api/history', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); }).then(function(b) {
            if (b && Array.isArray(b.history)) {
                if (typeof window.setHistoryFromApi === 'function') window.setHistoryFromApi(b.history);
                else window._pendingHistoryFromApi = b.history;
            }
        }).catch(function() {});
        fetch(getApiBase() + '/api/settings', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); }).then(function(s) {
            if (!s) return;
            if (s.theme === 'dark' || s.theme === 'light') {
                try { setTheme(s.theme, { syncServer: false }); } catch (e) {}
            }
            if (s.groupNames && typeof crossGroupNames !== 'undefined' && typeof nodeGroupNames !== 'undefined') {
                try {
                    if (s.groupNames.cross && typeof s.groupNames.cross === 'object') Object.keys(s.groupNames.cross).forEach(function(k) { crossGroupNames.set(k, s.groupNames.cross[k]); });
                    if (s.groupNames.node && typeof s.groupNames.node === 'object') Object.keys(s.groupNames.node).forEach(function(k) { nodeGroupNames.set(k, s.groupNames.node[k]); });
                    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
                    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
                } catch (e) {}
            }
            if (typeof withDeviceCatalogHydration === 'function') {
                withDeviceCatalogHydration(function() {
                    if (s.customDeviceOptions && typeof hasPersistedDeviceCatalogOpts === 'function'
                        && hasPersistedDeviceCatalogOpts(s.customDeviceOptions)
                        && typeof loadDeviceCatalog === 'function') {
                        loadDeviceCatalog(s.customDeviceOptions);
                    }
                    if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
                });
            } else {
                if (s.customDeviceOptions && typeof hasPersistedDeviceCatalogOpts === 'function'
                    && hasPersistedDeviceCatalogOpts(s.customDeviceOptions)
                    && typeof loadCustomDeviceOptions === 'function') loadCustomDeviceOptions(s.customDeviceOptions);
                if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
            }
            if (typeof syncDeviceCatalogLocalStorage === 'function') syncDeviceCatalogLocalStorage();
            if (s.mapStart) {
                window._savedMapStart = s.mapStart;
                applyMapStartFromSettings(s.mapStart, true);
            }
            if (s.collaboratorCursorStyle && typeof applyCollaboratorCursorStyle === 'function') {
                applyCollaboratorCursorStyle(s.collaboratorCursorStyle);
            }
        }).catch(function() {
            if (typeof withDeviceCatalogHydration === 'function') {
                withDeviceCatalogHydration(function() {
                    if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
                    if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
                });
            } else {
                if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
                if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
            }
        });
    })();
    setTimeout(function() {
        if (!_mapDataReady && !_mapStateReceived) markMapDataReady();
    }, 15000);
}

function showSyncRequiredOverlay() {
    if (_mapInitialLoadPending) return;
    if (window.syncIsConnected) return;
    var el = document.getElementById('syncRequiredOverlay');
    if (el) { el.style.display = 'flex'; return; }
    var wrapper = document.getElementById('mapAreaWrapper');
    if (!wrapper) return;
    el = document.createElement('div');
    el.id = 'syncRequiredOverlay';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.75);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99998;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;';
    el.innerHTML = '<div><h2 style="margin:0 0 12px;">Общая карта</h2><p style="margin:0 0 8px;">Подключение к совместной карте организации…</p><p style="margin:0;font-size:14px;opacity:0.9;">Подождите несколько секунд или обновите страницу.</p></div>';
    wrapper.appendChild(el);
}
function hideSyncRequiredOverlay() {
    var el = document.getElementById('syncRequiredOverlay');
    if (el) el.style.display = 'none';
}
window.showSyncRequiredOverlay = showSyncRequiredOverlay;
window.hideSyncRequiredOverlay = hideSyncRequiredOverlay;

var COLLABORATOR_CURSOR_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899'];
var collaboratorCursorStyle = 'pointer';
var _lastCollaboratorCursorsPayload = null;

function normalizeCollaboratorCursorStyle(value) {
    return value === 'circle' ? 'circle' : 'pointer';
}

function getCollaboratorCursorStyle() {
    return collaboratorCursorStyle;
}
window.getCollaboratorCursorStyle = getCollaboratorCursorStyle;

function applyCollaboratorCursorStyle(style) {
    var next = normalizeCollaboratorCursorStyle(style);
    if (next === collaboratorCursorStyle) return;
    collaboratorCursorStyle = next;
    if (collaboratorCursorsPlacemarks.length) collaboratorCursorsPlacemarks._ids = '';
    if (_lastCollaboratorCursorsPayload) applyCollaboratorCursorsNow(_lastCollaboratorCursorsPayload);
}
window.applyCollaboratorCursorStyle = applyCollaboratorCursorStyle;

function applyOrgDisplaySettings(settings) {
    if (!settings || settings.collaboratorCursorStyle === undefined) return;
    applyCollaboratorCursorStyle(settings.collaboratorCursorStyle);
}
window.applyOrgDisplaySettings = applyOrgDisplaySettings;

function truncateCollaboratorName(name) {
    var s = (name || 'Участник').toString().trim();
    if (!s) s = 'Участник';
    return s.length > 18 ? s.slice(0, 16) + '\u2026' : s;
}

function escapeSvgText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeSvgAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;');
}

function getCollaboratorAvatarPath(cursor) {
    if (cursor && cursor.avatarUrl) return cursor.avatarUrl;
    if (!cursor || cursor.userId == null || typeof AuthSystem === 'undefined' || !AuthSystem.getUsers) return '';
    var users = AuthSystem.getUsers();
    var u = users.find(function(x) { return String(x.id) === String(cursor.userId); });
    return (u && u.avatarUrl) ? u.avatarUrl : '';
}

function getCollaboratorAvatarImageUrl(avatarPath) {
    if (!avatarPath) return '';
    if (typeof getAvatarImageSrc === 'function') return getAvatarImageSrc(avatarPath);
    var base = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
    var path = avatarPath.charAt(0) === '/' ? avatarPath : '/' + avatarPath;
    var url = base ? (base.replace(/\/$/, '') + path) : path;
    var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    if (token) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
    return url;
}

var _collaboratorAvatarDataCache = {};
var _collaboratorCursorsApplyGen = 0;

function loadCollaboratorAvatarDataUrl(avatarPath) {
    var imageUrl = getCollaboratorAvatarImageUrl(avatarPath);
    if (!imageUrl) return Promise.resolve('');
    if (_collaboratorAvatarDataCache[imageUrl]) return _collaboratorAvatarDataCache[imageUrl];
    _collaboratorAvatarDataCache[imageUrl] = fetch(imageUrl)
        .then(function(r) { if (!r.ok) throw new Error('avatar'); return r.blob(); })
        .then(function(blob) {
            return new Promise(function(resolve, reject) {
                var reader = new FileReader();
                reader.onload = function() { resolve(reader.result || ''); };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        })
        .catch(function() {
            delete _collaboratorAvatarDataCache[imageUrl];
            return '';
        });
    return _collaboratorAvatarDataCache[imageUrl];
}

function buildCollaboratorNameLabelSvg(color, label, y) {
    var labelW = Math.min(120, Math.max(40, Math.round(label.length * 6.8 + 12)));
    var theme = getCollaboratorLabelTheme();
    return {
        labelW: labelW,
        svg: '<rect x="0" y="' + y + '" width="' + labelW + '" height="18" rx="4" fill="' + escapeSvgAttr(theme.bg) + '"/>' +
            '<rect x="0" y="' + y + '" width="' + labelW + '" height="18" rx="4" fill="none" stroke="' + color + '" stroke-width="1.5"/>' +
            '<text x="' + (labelW / 2) + '" y="' + (y + 12.5) + '" text-anchor="middle" dominant-baseline="middle" fill="' + escapeSvgAttr(theme.text) + '" font-size="11" font-weight="600" font-family="DM Sans, system-ui, sans-serif">' + escapeSvgText(label) + '</text>'
    };
}

function readCssThemeColor(varName, fallback) {
    try {
        var value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return value || fallback;
    } catch (e) {
        return fallback;
    }
}

function cssColorWithAlpha(color, alpha) {
    if (!color) return '';
    var value = String(color).trim();
    var match = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (match) return 'rgba(' + match[1] + ', ' + match[2] + ', ' + match[3] + ', ' + alpha + ')';
    if (/^#[0-9a-f]{3}$/i.test(value)) {
        value = '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3];
    }
    if (/^#[0-9a-f]{6}$/i.test(value)) {
        return 'rgba(' +
            parseInt(value.slice(1, 3), 16) + ', ' +
            parseInt(value.slice(3, 5), 16) + ', ' +
            parseInt(value.slice(5, 7), 16) + ', ' + alpha + ')';
    }
    return value;
}

function getCollaboratorLabelTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bgCard = readCssThemeColor('--bg-card', isDark ? '#1e293b' : '#ffffff');
    var text = readCssThemeColor('--text-primary', isDark ? '#f1f5f9' : '#0f172a');
    return {
        bg: cssColorWithAlpha(bgCard, isDark ? 0.94 : 0.96),
        text: text
    };
}

function getCollaboratorCursorThemeKey() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function refreshCollaboratorCursorsForTheme() {
    if (!collaboratorCursorsPlacemarks.length && !_lastCollaboratorCursorsPayload) return;
    if (collaboratorCursorsPlacemarks.length) collaboratorCursorsPlacemarks._ids = '';
    if (_lastCollaboratorCursorsPayload) applyCollaboratorCursorsNow(_lastCollaboratorCursorsPayload);
}
window.refreshCollaboratorCursorsForTheme = refreshCollaboratorCursorsForTheme;

function buildCollaboratorPointerIcon(color, name) {
    var label = truncateCollaboratorName(name);
    var labelBlock = buildCollaboratorNameLabelSvg(color, label, 30);
    var width = Math.max(24, labelBlock.labelW);
    var height = 48;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
        '<path d="M2 2v19l5.2-4.1 3.3 6.3 2.8-1.6-3.1-5.7h6.8z" fill="' + color + '" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>' +
        labelBlock.svg +
        '</svg>';
    return {
        svg: svg,
        size: [width, height],
        hotspot: [2, 2]
    };
}

function buildCollaboratorCircleIcon(color, name, avatarDataUrl) {
    var label = truncateCollaboratorName(name);
    var initial = ((name || 'Участник').toString().trim() || 'Участник').charAt(0).toUpperCase();
    var labelBlock = buildCollaboratorNameLabelSvg(color, label, 30);
    var width = Math.max(28, labelBlock.labelW);
    var height = 48;
    var circleContent;
    if (avatarDataUrl) {
        circleContent = '<defs><clipPath id="av"><circle cx="14" cy="14" r="11"/></clipPath></defs>' +
            '<circle cx="14" cy="14" r="12" fill="' + color + '" stroke="#ffffff" stroke-width="2"/>' +
            '<image href="' + escapeSvgAttr(avatarDataUrl) + '" x="3" y="3" width="22" height="22" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>';
    } else {
        circleContent = '<circle cx="14" cy="14" r="12" fill="' + color + '" stroke="#ffffff" stroke-width="2"/>' +
            '<text x="14" y="18" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold" font-family="DM Sans, system-ui, sans-serif">' + escapeSvgText(initial) + '</text>';
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
        circleContent +
        labelBlock.svg +
        '</svg>';
    return {
        svg: svg,
        size: [width, height],
        hotspot: [14, 14]
    };
}

function prepareCollaboratorCursorIcon(cursor, idx, style) {
    var color = COLLABORATOR_CURSOR_COLORS[idx % COLLABORATOR_CURSOR_COLORS.length];
    var name = (cursor.displayName || 'Участник').toString().trim();
    if (normalizeCollaboratorCursorStyle(style) !== 'circle') {
        return Promise.resolve(buildCollaboratorPointerIcon(color, name));
    }
    var avatarPath = getCollaboratorAvatarPath(cursor);
    if (!avatarPath) return Promise.resolve(buildCollaboratorCircleIcon(color, name, ''));
    return loadCollaboratorAvatarDataUrl(avatarPath).then(function(dataUrl) {
        return buildCollaboratorCircleIcon(color, name, dataUrl);
    });
}

function buildCollaboratorCursorIcon(color, name, style, avatarDataUrl) {
    if (normalizeCollaboratorCursorStyle(style) === 'circle') return buildCollaboratorCircleIcon(color, name, avatarDataUrl || '');
    return buildCollaboratorPointerIcon(color, name);
}

function createCollaboratorCursorPlacemark(pos, name, icon) {
    var dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(icon.svg)));
    var pm = new ymaps.Placemark(pos, {
        hintContent: name
    }, {
        iconLayout: 'default#image',
        iconImageHref: dataUrl,
        iconImageSize: icon.size,
        iconImageOffset: [-icon.hotspot[0], -icon.hotspot[1]],
        zIndex: 9998,
        cursor: 'default',
        interactive: false,
        interactivityModel: 'default#transparent'
    });
    pm._lastCursorPos = [pos[0], pos[1]];
    return pm;
}

var _pendingCollaboratorCursors = null;
var _collaboratorCursorsRaf = null;
var _collaboratorCursorsRafPayload = null;

function cursorPositionsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return false;
    return a[0] === b[0] && a[1] === b[1];
}

function applyCollaboratorCursorsNow(cursors) {
    if (!myMap || !myMap.geoObjects) return;
    _lastCollaboratorCursorsPayload = cursors;
    var style = getCollaboratorCursorStyle();
    var themeKey = getCollaboratorCursorThemeKey();
    if (!cursors || cursors.length === 0) {
        collaboratorCursorsPlacemarks.forEach(function(pm) {
            try { myMap.geoObjects.remove(pm); } catch (e) {}
        });
        collaboratorCursorsPlacemarks = [];
        collaboratorCursorsPlacemarks._style = style;
        collaboratorCursorsPlacemarks._theme = themeKey;
        return;
    }
    var ids = cursors.map(function(c) {
        return c.id + ':' + (c.avatarUrl || getCollaboratorAvatarPath(c) || '');
    }).join(',');
    var prevIds = collaboratorCursorsPlacemarks.length ? (collaboratorCursorsPlacemarks._ids || '') : '';
    if (ids === prevIds && collaboratorCursorsPlacemarks.length === cursors.length &&
        collaboratorCursorsPlacemarks._style === style && collaboratorCursorsPlacemarks._theme === themeKey) {
        cursors.forEach(function(c, idx) {
            var pos = c.position;
            if (!Array.isArray(pos) || pos.length < 2) return;
            var pm = collaboratorCursorsPlacemarks[idx];
            if (!pm || !pm.geometry) return;
            if (cursorPositionsEqual(pm._lastCursorPos, pos)) return;
            try {
                pm.geometry.setCoordinates(pos);
                pm._lastCursorPos = [pos[0], pos[1]];
            } catch (e) {}
        });
        return;
    }
    collaboratorCursorsPlacemarks.forEach(function(pm) {
        try { myMap.geoObjects.remove(pm); } catch (e) {}
    });
    collaboratorCursorsPlacemarks = [];
    collaboratorCursorsPlacemarks._ids = ids;
    collaboratorCursorsPlacemarks._style = style;
    collaboratorCursorsPlacemarks._theme = themeKey;
    var applyGen = ++_collaboratorCursorsApplyGen;
    Promise.all(cursors.map(function(c, idx) {
        return prepareCollaboratorCursorIcon(c, idx, style).then(function(icon) {
            return { cursor: c, icon: icon };
        });
    })).then(function(items) {
        if (applyGen !== _collaboratorCursorsApplyGen) return;
        if (!myMap || !myMap.geoObjects) return;
        collaboratorCursorsPlacemarks.forEach(function(pm) {
            try { myMap.geoObjects.remove(pm); } catch (e) {}
        });
        collaboratorCursorsPlacemarks = [];
        collaboratorCursorsPlacemarks._ids = ids;
        collaboratorCursorsPlacemarks._style = style;
        collaboratorCursorsPlacemarks._theme = themeKey;
        items.forEach(function(item) {
            if (!item || !item.icon || !item.cursor) return;
            var pos = item.cursor.position;
            if (!Array.isArray(pos) || pos.length < 2) return;
            var name = (item.cursor.displayName || 'Участник').toString().trim();
            var pm = createCollaboratorCursorPlacemark(pos, name, item.icon);
            myMap.geoObjects.add(pm);
            collaboratorCursorsPlacemarks.push(pm);
        });
    }).catch(function() {});
}

function flushPendingCollaboratorCursors() {
    if (_pendingCollaboratorCursors == null) return;
    var pending = _pendingCollaboratorCursors;
    _pendingCollaboratorCursors = null;
    updateCollaboratorCursors(pending);
}

function updateCollaboratorCursors(cursors) {
    if (_mapApplyInProgress) {
        _pendingCollaboratorCursors = cursors;
        return;
    }
    _collaboratorCursorsRafPayload = cursors;
    if (_collaboratorCursorsRaf) return;
    var raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : function(f) { setTimeout(f, 16); };
    _collaboratorCursorsRaf = raf(function() {
        _collaboratorCursorsRaf = null;
        var payload = _collaboratorCursorsRafPayload;
        _collaboratorCursorsRafPayload = null;
        applyCollaboratorCursorsNow(payload);
    });
}
window.updateCollaboratorCursors = updateCollaboratorCursors;

function showNoApiMessage() {
    var overlay = document.getElementById('noApiOverlay');
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'noApiOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;text-align:center;padding:20px;box-sizing:border-box;';
    overlay.innerHTML = '<div><h2 style="margin:0 0 12px;">Приложение работает только с сервером</h2><p style="margin:0 0 8px;">Запустите сервер: <code style="background:#333;padding:4px 8px;">npm run api</code></p><p style="margin:0;">Затем откройте <a href="http://localhost:3000" style="color:#6eb8ff;">http://localhost:3000</a></p></div>';
    document.body.appendChild(overlay);
}

function postHistoryToApi(history) {
    if (!getApiBase() || !Array.isArray(history)) return;
    fetch(getApiBase() + '/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
        body: JSON.stringify({ history: history })
    }).catch(function() {});
}

function shouldApplyRemoteMapState(organizationId) {
    if (organizationId == null || organizationId === '') return true;
    var myOrg = (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null)
        ? String(currentUser.organizationId)
        : (window._mapOrgIdLoaded != null ? String(window._mapOrgIdLoaded) : null);
    if (!myOrg) return true;
    return String(organizationId) === myOrg;
}

var _mapApiReloadTimer = null;
var _mapApplyInProgress = false;

function reloadMapFromApi(meta) {
    meta = meta || {};
    if (meta.organizationId != null && !shouldApplyRemoteMapState(meta.organizationId)) return;
    if (!getApiBase() || !getAuthToken()) return;
    if (_mapApiReloadTimer) clearTimeout(_mapApiReloadTimer);
    var delay = meta.immediate ? 0 : 100;
    _mapApiReloadTimer = setTimeout(function() {
        _mapApiReloadTimer = null;
        fetch(getApiBase() + '/api/map', {
            headers: { 'Authorization': 'Bearer ' + getAuthToken() },
            cache: 'no-store'
        }).then(function(r) { return r.ok ? r.json() : null; })
            .then(function(body) {
                if (!body || !Array.isArray(body.data)) return;
                if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                    window._mapOrgIdLoaded = String(currentUser.organizationId);
                }
                applyRemoteState(body.data, { fromApi: true, organizationId: body.organizationId || meta.organizationId });
            })
            .catch(function() {});
    }, delay);
}
window.reloadMapFromApi = reloadMapFromApi;

function applyRemoteState(data, meta) {
    meta = meta || {};
    if (!Array.isArray(data)) {
        markMapDataReady();
        return;
    }
    if (meta.organizationId != null && !shouldApplyRemoteMapState(meta.organizationId)) {
        return;
    }
    if (_mapApplyInProgress) return;
    _mapStateReceived = true;
    if (_mapDataReady && !_mapInitialLoadPending && objects && objects.length > 0 && meta.merge === true) {
        try {
            if (data.length === 0) {
                clearMap({ skipSave: true, skipHistory: true });
                lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
                updateStats();
                markMapDataReady();
                return;
            }
            applyRemoteStateMerged(data);
            lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
            updateStats();
            markMapDataReady();
            return;
        } catch (eMerge) {}
    }
    if (_mapInitialLoadPending && data.length > 0 && typeof setMapLoadingOverlayText === 'function') {
        setMapLoadingOverlayText('Загрузка объектов…');
    }
    try {
        _mapApplyInProgress = true;
        collaboratorCursorsPlacemarks.forEach(function(pm) {
            try { if (myMap && myMap.geoObjects) myMap.geoObjects.remove(pm); } catch (e) {}
        });
        collaboratorCursorsPlacemarks = [];
        var opts = { skipSave: true, skipHistory: true };
        var bulkLoad = _mapInitialLoadPending && data.length >= MAP_BULK_IMPORT_MIN_ITEMS;
        var applyFinished = false;
        function finishRemoteApply() {
            if (applyFinished) return;
            applyFinished = true;
            _mapApplyInProgress = false;
            lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
            updateStats();
            markMapDataReady();
            if (typeof OfflineMapCache !== 'undefined' && OfflineMapCache.scheduleSave) {
                OfflineMapCache.scheduleSave();
            }
            if (meta && meta.fromApi && typeof OfflineMapCache !== 'undefined' && OfflineMapCache.hideOfflineBanner) {
                OfflineMapCache.hideOfflineBanner();
                window._volsmapOfflineMapActive = false;
            }
            flushPendingCollaboratorCursors();
        }
        if (data.length === 0) {
            clearMap(opts);
            updateStats();
            lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
            if (window._savedMapStart && typeof applyMapStartFromSettings === 'function') {
                applyMapStartFromSettings(window._savedMapStart, true);
            }
            markMapDataReady();
            return;
        }
        importData(data, opts, bulkLoad ? finishRemoteApply : null);
        if (!bulkLoad) finishRemoteApply();
    } catch (e) {
        _mapApplyInProgress = false;
        updateStats();
        markMapDataReady();
        flushPendingCollaboratorCursors();
    }
}

function applyRemoteStateMerged(data) {
    var incomingCables = data.filter(function(i) { return i.type === 'cable'; });
    var incomingCableIds = {};
    incomingCables.forEach(function(c) { if (c.uniqueId != null) incomingCableIds[c.uniqueId] = true; });

    var refs = [];
    var refIndexByDataIndex = {};
    var i, item, existing, created, label;
    for (i = 0; i < data.length; i++) {
        item = data[i];
        if (item.type === 'cable') continue;
        if (item.type === 'region') {
            existing = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'region' &&
                    o.properties.get('uniqueId') === item.uniqueId;
            });
            if (existing) {
                populateRegionFromSerializedData(existing, item);
                refs.push(existing);
            } else {
                created = createRegionFromData(item);
                if (created) refs.push(created);
            }
            refIndexByDataIndex[i] = refs.length - 1;
            continue;
        }
        existing = objects.find(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === item.uniqueId;
        });
        if (existing) {
            populatePlacemarkFromSerializedData(existing, item);
            refs.push(existing);
        } else {
            created = createObjectFromData(item);
            if (created) refs.push(created);
        }
        refIndexByDataIndex[i] = refs.length - 1;
    }

    var toRemoveObjs = objects.filter(function(o) {
        var t = o.properties && o.properties.get('type');
        if (!t || t === 'cable' || t === 'cableLabel') return false;
        return refs.indexOf(o) === -1;
    });
    var toRemoveCables = objects.filter(function(o) {
        if (!o.properties || o.properties.get('type') !== 'cable') return false;
        if (!incomingCableIds[o.properties.get('uniqueId')]) return true;
        var from = o.properties.get('from');
        var to = o.properties.get('to');
        return toRemoveObjs.indexOf(from) !== -1 || toRemoveObjs.indexOf(to) !== -1;
    });

    toRemoveCables.forEach(function(cable) {
        myMap.geoObjects.remove(cable);
        objects = objects.filter(function(o) { return o !== cable; });
    });
    toRemoveObjs.forEach(function(obj) {
        label = obj.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} }
        if (obj.properties.get('type') === 'region' && window.MapRegions && MapRegions.removeRegionLabel) {
            MapRegions.removeRegionLabel(obj, myMap);
        }
        var cablesToRemove = objects.filter(function(c) {
            return c.properties && c.properties.get('type') === 'cable' &&
                (c.properties.get('from') === obj || c.properties.get('to') === obj);
        });
        cablesToRemove.forEach(function(c) {
            myMap.geoObjects.remove(c);
            objects = objects.filter(function(o) { return o !== c; });
        });
        myMap.geoObjects.remove(obj);
        objects = objects.filter(function(o) { return o !== obj; });
    });

    incomingCables.forEach(function(item) {
        var coords = normalizeCableGeometry(item.geometry);
        var fromObj = null, toObj = null;
        
        if (item.fromUniqueId) {
            fromObj = refs.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.fromUniqueId; });
        }
        if (item.toUniqueId) {
            toObj = refs.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.toUniqueId; });
        }
        if (!fromObj || !toObj) {
            if (item.from != null && item.to != null) {
                var fromIdx = refIndexByDataIndex[item.from];
                var toIdx = refIndexByDataIndex[item.to];
                if (fromIdx != null && toIdx != null && fromIdx < refs.length && toIdx < refs.length) {
                    fromObj = fromObj || refs[fromIdx];
                    toObj = toObj || refs[toIdx];
                }
            }
        }
        if (!fromObj || !toObj) {
            if (coords && coords.length >= 2) {
                // Для ВОЛС при коллизии координат предпочитаем кросс/муфту/OLT; для меди концы —
                // узел, коммутатор, камера, МК. Иначе МК у кросса ошибочно привязывается к кроссу.
                var preferFiberEndpoint = item.cableType !== 'copper';
                fromObj = fromObj || findRefClosestToCoord(refs, coords[0], undefined, preferFiberEndpoint, item.fromUniqueId);
                toObj = toObj || findRefClosestToCoord(refs, coords[coords.length - 1], undefined, preferFiberEndpoint, item.toUniqueId);
            }
        }
        if ((!fromObj || !toObj) && coords && coords.length >= 2) {
            var geomEpMerge = findObjectsAtGeometry(refs, coords);
            if (geomEpMerge && geomEpMerge.length >= 2) {
                fromObj = fromObj || geomEpMerge[0];
                toObj = toObj || geomEpMerge[geomEpMerge.length - 1];
            }
        }
        if (!fromObj || !toObj) return;
        var itemCuMetaMerge = copperSerializedMetaFromItem(item);
        var existingCable = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
        });
        if (existingCable) {
            var routeMerged = buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords);
            var pointsArr = routeMerged;
            if (!pointsArr || pointsArr.length < 2) {
                pointsArr = (coords && coords.length >= 2) ? findObjectsAtGeometry(refs, item.geometry) : null;
            }
            if (!pointsArr || pointsArr.length < 2) pointsArr = [fromObj, toObj];
            else {
                if (fromObj) pointsArr[0] = fromObj;
                if (toObj) pointsArr[pointsArr.length - 1] = toObj;
            }
            existingCable.properties.set('from', pointsArr[0]);
            existingCable.properties.set('to', pointsArr[pointsArr.length - 1]);
            existingCable.properties.set('points', pointsArr);
            if (existingCable.geometry) {
                try {
                    var lineM = pointsArr.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (lineM.length >= 2) existingCable.geometry.setCoordinates(lineM);
                    else if (coords && coords.length >= 2) existingCable.geometry.setCoordinates(coords);
                } catch (eM) {}
            }
            if (item.distance !== undefined) existingCable.properties.set('distance', item.distance);
            if (item.cableName != null) existingCable.properties.set('cableName', item.cableName);
            if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(existingCable, item);
            applySerializedUndergroundToCable(existingCable, item, pointsArr);
            applySerializedCopperMetadataToCable(existingCable, item);
            applyImportedCableFiberProps(existingCable, item);
        } else {
            var points = buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords);
            if (!points || points.length < 2) {
                points = (coords && coords.length >= 2) ? findObjectsAtGeometry(refs, item.geometry) : null;
            }
            if (points && points.length >= 2) {
                if (fromObj) points[0] = fromObj;
                if (toObj) points[points.length - 1] = toObj;
                addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true, itemCuMetaMerge);
            } else {
                addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true, itemCuMetaMerge);
            }
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
            });
            if (cable) {
                var ptNew = cable.properties.get('points');
                if (Array.isArray(ptNew) && ptNew.length >= 2) {
                    try {
                        var lineN = ptNew.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (cable.geometry && lineN.length >= 2) cable.geometry.setCoordinates(lineN);
                    } catch (eN) {}
                } else if (cable.geometry && coords && coords.length >= 2) cable.geometry.setCoordinates(coords);
                if (item.distance !== undefined) cable.properties.set('distance', item.distance);
                if (item.cableName != null) cable.properties.set('cableName', item.cableName);
                if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(cable, item);
                applySerializedUndergroundToCable(cable, item, cable.properties.get('points'));
                applyImportedCableFiberProps(cable, item);
            }
        }
    });

    if (typeof syncAllCabinetMembersToCabinets === 'function') {
        syncAllCabinetMembersToCabinets({ skipDisplay: true });
    }
    repairCablesAfterImport();
    if (typeof repairRadioBridgeFiberLinksAfterLoad === 'function') repairRadioBridgeFiberLinksAfterLoad();
    refreshAllCableUndergroundOverlays();
    updateCableVisualization();
    updateCrossDisplay();
    updateNodeDisplay();
    if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
    ensureNodeLabelsVisible();
    scheduleConnectionLinesUpdate();
    if (currentModalObject && refs.indexOf(currentModalObject) !== -1 &&
        typeof refreshObjectModal === 'function' &&
        !(typeof shouldSkipRemoteModalRefresh === 'function' && shouldSkipRemoteModalRefresh(currentModalObject))) {
        refreshObjectModal(currentModalObject);
    }
    updateStats();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
    if (window.MapRegions && MapRegions.sendAllRegionsToMapBack && myMap) {
        MapRegions.sendAllRegionsToMapBack(myMap, objects);
    }
    if (window.MapRegions && MapRegions.purgeOrphanRegionLabelDom) {
        MapRegions.purgeOrphanRegionLabelDom();
    }

    setTimeout(function() {
        incomingCables.forEach(function(item) {
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
            });
            if (!cable || !cable.geometry) return;
            var pts = cable.properties.get('points');
            var ugItem = item.undergroundSpans;
            if (window.CableUnderground && Array.isArray(ugItem) && ugItem.length && Array.isArray(pts) && pts.length >= 2) {
                try {
                    applySerializedUndergroundToCable(cable, item, pts);
                    return;
                } catch (eUgM) {}
            }
            if (Array.isArray(pts) && pts.length >= 2) {
                try {
                    var fromPts = pts.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (fromPts.length >= 2) cable.geometry.setCoordinates(fromPts);
                    return;
                } catch (eP) {}
            }
            var geom = normalizeCableGeometry(item.geometry);
            if (geom && geom.length >= 2) {
                cable.geometry.setCoordinates(geom);
            }
        });
        validateAndFixCableGeometryOnLoad();
        refreshAllCableUndergroundOverlays();
        updateCableVisualization();
        
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
    }, 0);

    selectedObjects = selectedObjects.filter(function(o) { return objects.indexOf(o) !== -1; });
    selectedObjects.forEach(function(o) {
        var pulse = o.properties && o.properties.get('selectionPulse');
        if (!pulse && o.geometry) updateSelectionPulsePosition(o);
    });
}

function refreshRemoteObjectVisuals(obj) {
    if (!obj || !obj.properties) return;
    var type = obj.properties.get('type');
    if (type === 'cross') {
        updateCrossDisplay(groupKey(obj.geometry.getCoordinates()));
    } else if (type === 'node') {
        updateNodeDisplay(groupKey(obj.geometry.getCoordinates()));
    } else if (typeof canBeCabinetMember === 'function' && canBeCabinetMember(type) && typeof updateCabinetDisplay === 'function') {
        updateCabinetDisplay();
    } else if (typeof applyMapFilter === 'function') {
        applyMapFilter();
    }
    var name = obj.properties.get('name') || '';
    updateObjectLabel(obj, name);
    var label = obj.properties.get('label');
    if (label) {
        try {
            if (myMap.geoObjects.indexOf(label) === -1) myMap.geoObjects.add(label);
        } catch (e) {}
    }
    scheduleConnectionLinesUpdate(getObjectUniqueId(obj));
}

function applyOperationToMap(op) {
    if (!op || !op.type) return;
    var objCount = 0;
    objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') !== 'cable' && o.properties.get('type') !== 'cableLabel') objCount++;
    });
    if (op.type === 'add_object' && op.data) {
        var addUid = op.data.uniqueId;
        if (addUid != null && addUid !== '') {
            var existingAdd = objects.find(function(o) {
                var t = o.properties && o.properties.get('type');
                return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === addUid;
            });
            if (existingAdd) {
                return;
            }
        }
        if (op.data.type === 'region') {
            var newRegion = createRegionFromData(op.data);
            if (newRegion) {
                updateStats();
                if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
            }
            return;
        }
        var newObj = createObjectFromData(op.data, { skipAddToObjects: true });
        if (!newObj) return;
        objects.splice(objCount, 0, newObj);
        mapPerfRegister(newObj);
        if (newObj.properties.get('type') !== 'cross' && newObj.properties.get('type') !== 'node') mapGeoAdd(newObj);
        refreshRemoteObjectVisuals(newObj);
        updateStats();
        return;
    }
    if (op.type === 'update_object' && op.uniqueId != null && op.data) {
        var objUp = getMapObjectByUid(op.uniqueId);
        if (objUp) {
            populatePlacemarkFromSerializedData(objUp, op.data);
            if (op.data.type !== 'region') updateConnectedCables(objUp);
            refreshRemoteObjectVisuals(objUp);
            updateStats();
            if (currentModalObject === objUp && typeof refreshObjectModal === 'function' &&
                !(typeof shouldSkipRemoteModalRefresh === 'function' && shouldSkipRemoteModalRefresh(objUp))) {
                refreshObjectModal(objUp);
            }
        }
        return;
    }
    if (op.type === 'delete_object' && op.uniqueId != null) {
        var toDel = objects.find(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === op.uniqueId;
        });
        if (toDel) deleteObject(toDel, { skipSync: true });
        return;
    }
    if (op.type === 'add_cable' && op.data) {
        var opCuMeta = copperSerializedMetaFromItem(op.data);
        var refsOpMap = objects.filter(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel';
        });
        var existingByOp = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
        var opCoordsNorm = op.data.geometry && normalizeCableGeometry(op.data.geometry);
        if (existingByOp) {
            var fromUidOp = op.data.fromUniqueId, toUidOp = op.data.toUniqueId;
            var fE = fromUidOp ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUidOp; }) : existingByOp.properties.get('from');
            var tE = toUidOp ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUidOp; }) : existingByOp.properties.get('to');
            if (!fE) fE = existingByOp.properties.get('from');
            if (!tE) tE = existingByOp.properties.get('to');
            var rE = buildCableRoutePointsFromData(refsOpMap, op.data, fE, tE, opCoordsNorm);
            if (rE && rE.length >= 2) {
                existingByOp.properties.set('from', rE[0]);
                existingByOp.properties.set('to', rE[rE.length - 1]);
                existingByOp.properties.set('points', rE);
                try {
                    var linE = rE.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (existingByOp.geometry && linE.length >= 2) existingByOp.geometry.setCoordinates(linE);
                } catch (eExOp) {}
            } else if (existingByOp.geometry && opCoordsNorm && opCoordsNorm.length >= 2) {
                existingByOp.geometry.setCoordinates(opCoordsNorm);
            }
            if (op.data.distance !== undefined) existingByOp.properties.set('distance', op.data.distance);
            if (op.data.cableName != null) existingByOp.properties.set('cableName', op.data.cableName);
            if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(existingByOp, op.data);
            if (op.data.cableType === 'copper' && opCuMeta) {
                if (opCuMeta.copperSwitchFromId) existingByOp.properties.set('copperSwitchFromId', opCuMeta.copperSwitchFromId);
                else existingByOp.properties.set('copperSwitchFromId', null);
                if (opCuMeta.copperSwitchToId) existingByOp.properties.set('copperSwitchToId', opCuMeta.copperSwitchToId);
                else existingByOp.properties.set('copperSwitchToId', null);
                existingByOp.properties.set('copperPortFrom', opCuMeta.copperPortFrom != null ? opCuMeta.copperPortFrom : null);
                existingByOp.properties.set('copperPortTo', opCuMeta.copperPortTo != null ? opCuMeta.copperPortTo : null);
                applyCopperCableOccupancyFromCable(existingByOp);
            }
            applySerializedUndergroundToCable(existingByOp, op.data, existingByOp.properties.get('points'));
            applyImportedCableFiberProps(existingByOp, op.data);
            updateCableVisualization();
            scheduleConnectionLinesUpdate();
            updateStats();
            return;
        }
        var fromUid = op.data.fromUniqueId, toUid = op.data.toUniqueId;
        var fromObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUid; });
        var toObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUid; });
        if (fromObj && toObj) {
            var routeOp = buildCableRoutePointsFromData(refsOpMap, op.data, fromObj, toObj, opCoordsNorm);
            if (routeOp && routeOp.length >= 2) {
                addCable(routeOp[0], routeOp, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
            } else if (opCoordsNorm && opCoordsNorm.length > 2) {
                var ptsOp = findObjectsAtGeometry(refsOpMap, op.data.geometry);
                if (ptsOp && ptsOp.length >= 2) {
                    if (fromObj) ptsOp[0] = fromObj;
                    if (toObj) ptsOp[ptsOp.length - 1] = toObj;
                    addCable(ptsOp[0], ptsOp, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
                } else {
                    addCable(fromObj, toObj, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
                }
            } else {
                addCable(fromObj, toObj, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
            }
            var cable = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
            if (cable) {
                var ptOp = cable.properties.get('points');
                if (Array.isArray(ptOp) && ptOp.length >= 2) {
                    try {
                        var lOp = ptOp.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (cable.geometry && lOp.length >= 2) cable.geometry.setCoordinates(lOp);
                    } catch (eImpOp) {}
                } else if (cable.geometry && opCoordsNorm && opCoordsNorm.length >= 2) cable.geometry.setCoordinates(opCoordsNorm);
                if (op.data.distance !== undefined) cable.properties.set('distance', op.data.distance);
                if (op.data.cableName != null) cable.properties.set('cableName', op.data.cableName);
                if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(cable, op.data);
                applySerializedUndergroundToCable(cable, op.data, cable.properties.get('points'));
                applyImportedCableFiberProps(cable, op.data);
            }
            updateCableVisualization();
            scheduleConnectionLinesUpdate();
            updateStats();
        }
        return;
    }
    if (op.type === 'update_cable' && op.uniqueId != null && op.data) {
        var cableUp = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.uniqueId; });
        if (cableUp) {
            applySerializedCableToMap(cableUp, op.data);
            updateStats();
            if (currentModalObject === cableUp && typeof showCableInfo === 'function') showCableInfo(cableUp);
        }
        return;
    }
    if (op.type === 'delete_cable' && op.uniqueId != null) {
        deleteCableByUniqueId(op.uniqueId, { skipSync: true });
    }
}
window.applyOperationToMap = applyOperationToMap;

function ensureNodeLabelsVisible() {
    objects.forEach(obj => {
        if (obj.properties) {
            const type = obj.properties.get('type');
            if (!type || type === 'cable' || type === 'cableLabel' || type === 'region' || type === 'regionLabel') return;
            const name = obj.properties.get('name') || '';
            updateObjectLabel(obj, name);
            var label = obj.properties.get('label');
            if (label && (!myMap.geoObjects.indexOf || myMap.geoObjects.indexOf(label) === -1)) {
                try { myMap.geoObjects.add(label); } catch(e) {}
            }
        }
    });
    if (window.MapRegions && MapRegions.removeErrantRegionObjectLabels) {
        MapRegions.removeErrantRegionObjectLabels(myMap, objects);
    }
}

function importDataAssignUniqueIds(data) {
    if (!Array.isArray(data)) return;
    data.forEach(function(item) {
        if (item && item.type && item.type !== 'cable' && (item.uniqueId == null || item.uniqueId === '')) {
            item.uniqueId = generateUniqueId(item.type);
        }
    });
}

function importDataCreatePlacemarkRef(item) {
    if (!item || item.type === 'cable' || item.type === 'cableLabel') return null;
    if (item.type === 'region') return createRegionFromData(item);
    return createObjectFromData(item, null, { bulkImport: true });
}

function buildImportRefIndex(objectRefs) {
    var refsOnly = [];
    var refByUid = Object.create(null);
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    function addRef(r) {
        if (!r || !r.properties) return;
        if (seen && seen.has(r)) return;
        if (seen) seen.add(r);
        try {
            var uid = r.properties.get('uniqueId');
            if (uid != null && uid !== '') refByUid[uid] = r;
            refsOnly.push(r);
        } catch (eRef) {}
    }
    if (objectRefs) {
        for (var ri = 0; ri < objectRefs.length; ri++) addRef(objectRefs[ri]);
    }
    if (objects) {
        for (var oi = 0; oi < objects.length; oi++) {
            var o = objects[oi];
            if (!o || !o.properties) continue;
            var t = o.properties.get('type');
            if (t === 'cable' || t === 'cableLabel') continue;
            addRef(o);
        }
    }
    return { refsOnly: refsOnly, refByUid: refByUid };
}

function importDataRunOneCable(item, objectRefs, refIndex, cableByUid) {
    if (!item || item.type !== 'cable') return;
    var refsOnly = refIndex.refsOnly;
    var refByUid = refIndex.refByUid;
    var coords = normalizeCableGeometry(item.geometry);
    var fromObj = null;
    var toObj = null;

    if (item.fromUniqueId) fromObj = refByUid[item.fromUniqueId] || null;
    if (item.toUniqueId) toObj = refByUid[item.toUniqueId] || null;
    if (!fromObj || !toObj) {
        if (item.from !== undefined && item.to !== undefined &&
            item.from < objectRefs.length && item.to < objectRefs.length) {
            fromObj = fromObj || objectRefs[item.from];
            toObj = toObj || objectRefs[item.to];
        }
    }
    if (!fromObj || !toObj) {
        if (coords && coords.length >= 2) {
            var preferFiberEpImp = item.cableType !== 'copper';
            fromObj = fromObj || findRefClosestToCoord(refsOnly, coords[0], undefined, preferFiberEpImp, item.fromUniqueId);
            toObj = toObj || findRefClosestToCoord(refsOnly, coords[coords.length - 1], undefined, preferFiberEpImp, item.toUniqueId);
        }
    }
    if ((!fromObj || !toObj) && coords && coords.length >= 2) {
        var geomEp = findObjectsAtGeometry(refsOnly, coords);
        if (geomEp && geomEp.length >= 2) {
            fromObj = fromObj || geomEp[0];
            toObj = toObj || geomEp[geomEp.length - 1];
        }
    }
    if (!fromObj || !toObj) return;

    var itemCuMeta = copperSerializedMetaFromItem(item);
    var existingCableImport = (item.uniqueId != null && cableByUid[item.uniqueId]) || null;
    if (!existingCableImport && item.uniqueId != null) {
        existingCableImport = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
        }) || null;
        if (existingCableImport) cableByUid[item.uniqueId] = existingCableImport;
    }
    if (existingCableImport) {
        var routeExisting = buildCableRoutePointsFromData(refsOnly, item, fromObj, toObj, coords);
        var ptsArr = routeExisting;
        if (!ptsArr || ptsArr.length < 2) {
            ptsArr = (coords && coords.length >= 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : null;
            if (!ptsArr || ptsArr.length < 2) ptsArr = [fromObj, toObj];
        }
        if (ptsArr && ptsArr.length >= 2) {
            if (fromObj) ptsArr[0] = fromObj;
            if (toObj) ptsArr[ptsArr.length - 1] = toObj;
            existingCableImport.properties.set('from', ptsArr[0]);
            existingCableImport.properties.set('to', ptsArr[ptsArr.length - 1]);
            existingCableImport.properties.set('points', ptsArr);
            try {
                var lineExisting = ptsArr.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                if (existingCableImport.geometry && lineExisting.length >= 2) existingCableImport.geometry.setCoordinates(lineExisting);
                else if (existingCableImport.geometry && coords && coords.length >= 2) existingCableImport.geometry.setCoordinates(coords);
            } catch (eEx) {}
        }
        if (item && 'cableName' in item) existingCableImport.properties.set('cableName', item.cableName);
        if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(existingCableImport, item);
        if (item.distance !== undefined) existingCableImport.properties.set('distance', item.distance);
        applySerializedUndergroundToCable(existingCableImport, item, ptsArr);
        applySerializedCopperMetadataToCable(existingCableImport, item);
        applyImportedCableFiberProps(existingCableImport, item);
        return;
    }
    var routePts = buildCableRoutePointsFromData(refsOnly, item, fromObj, toObj, coords);
    if (routePts && routePts.length >= 2) {
        addCable(routePts[0], routePts, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
    } else {
        var points = (coords && coords.length >= 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : null;
        if (points && points.length >= 2) {
            if (fromObj) points[0] = fromObj;
            if (toObj) points[points.length - 1] = toObj;
            addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
        } else {
            addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
        }
    }
    var cable = (item.uniqueId != null && cableByUid[item.uniqueId]) || objects.find(function(obj) {
        return obj.properties &&
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === item.uniqueId;
    });
    if (cable) {
        if (item.uniqueId != null) cableByUid[item.uniqueId] = cable;
        var ptList = cable.properties.get('points');
        if (Array.isArray(ptList) && ptList.length >= 2) {
            try {
                var lineFromPts = ptList.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                if (cable.geometry && lineFromPts.length >= 2) cable.geometry.setCoordinates(lineFromPts);
            } catch (eImp) {}
        } else if (cable.geometry && coords && coords.length >= 2) {
            cable.geometry.setCoordinates(coords);
        }
        if (!cable.properties.get('distance')) {
            var fromCoords = fromObj.geometry.getCoordinates();
            var toCoords = toObj.geometry.getCoordinates();
            cable.properties.set('distance', calculateDistance(fromCoords, toCoords));
        }
        if (item && 'cableName' in item) cable.properties.set('cableName', item.cableName);
        if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(cable, item);
        applySerializedUndergroundToCable(cable, item, cable.properties.get('points'));
        applyImportedCableFiberProps(cable, item);
    }
}

function importDataRunCables(data, objectRefs, onDone) {
    var refIndex = buildImportRefIndex(objectRefs);
    var cableByUid = Object.create(null);
    var cableItems = [];
    if (Array.isArray(data)) {
        for (var di = 0; di < data.length; di++) {
            if (data[di] && data[di].type === 'cable') cableItems.push(data[di]);
        }
    }
    var useCableBatch = isMapBulkImportActive()
        && cableItems.length >= (typeof MAP_BULK_IMPORT_CABLE_BATCH_SIZE === 'number' ? MAP_BULK_IMPORT_CABLE_BATCH_SIZE : 40);
    if (!useCableBatch) {
        try {
            cableItems.forEach(function(item) {
                importDataRunOneCable(item, objectRefs, refIndex, cableByUid);
            });
        } catch (syncCableErr) {
            if (typeof onDone === 'function') onDone(syncCableErr);
            return;
        }
        if (typeof onDone === 'function') onDone();
        return;
    }
    var cableIdx = 0;
    var cableBatchSize = typeof MAP_BULK_IMPORT_CABLE_BATCH_SIZE === 'number' ? MAP_BULK_IMPORT_CABLE_BATCH_SIZE : 40;
    function importCableBatch() {
        try {
            var end = Math.min(cableIdx + cableBatchSize, cableItems.length);
            for (; cableIdx < end; cableIdx++) {
                importDataRunOneCable(cableItems[cableIdx], objectRefs, refIndex, cableByUid);
            }
        } catch (batchCableErr) {
            if (typeof onDone === 'function') onDone(batchCableErr);
            return;
        }
        if (typeof setMapLoadingOverlayText === 'function' && cableItems.length > 0) {
            setMapLoadingOverlayText('Прокладка кабелей… ' + cableIdx + ' / ' + cableItems.length);
        }
        if (cableIdx < cableItems.length) {
            requestAnimationFrame(importCableBatch);
            return;
        }
        if (typeof onDone === 'function') onDone();
    }
    requestAnimationFrame(importCableBatch);
}

function importDataPostProcess(opts, onDone) {
    var finish = function() {
        if (typeof onDone === 'function') onDone();
    };
    var work = function() {
        if (typeof syncAllCabinetMembersToCabinets === 'function') {
            syncAllCabinetMembersToCabinets({ skipDisplay: true });
        }
        repairCablesAfterImport();
        validateAndFixCableGeometryOnLoad();
        refreshAllCableUndergroundOverlays();
        applyAllOpticalCableMapStyles();
        ensureNodeLabelsVisible();
        updateCableVisualization();
        updateCrossDisplay();
        updateNodeDisplay();
        if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
        scheduleConnectionLinesUpdate('full');
        migrateStandaloneSwitchesIntoNodes();
        if (window.EmbeddedSplitters && typeof EmbeddedSplitters.migrateAllFromMap === 'function') {
            EmbeddedSplitters.migrateAllFromMap();
        }
        if (window.EmbeddedSplitters && typeof EmbeddedSplitters.syncAllInputs === 'function') {
            objects.forEach(function(obj) {
                if (EmbeddedSplitters.isHost(obj)) EmbeddedSplitters.syncAllInputs(obj);
            });
        }
        if (migrateNodeLevelSwitchMetaToAttached() && !(opts && opts.skipSave)) saveData();
        if (typeof migrateAllRadioBridgeCopperPorts === 'function') migrateAllRadioBridgeCopperPorts();
        if (typeof repairRadioBridgeFiberLinksAfterLoad === 'function') repairRadioBridgeFiberLinksAfterLoad();
        rebuildAllCopperPortUsageFromCables();
        if (window.CameraPlayer && CameraPlayer.startStreamMonitor) CameraPlayer.startStreamMonitor();
        if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
        if (window.MapRegions && MapRegions.sendAllRegionsToMapBack && myMap) {
            MapRegions.sendAllRegionsToMapBack(myMap, objects);
        }
        if (window.MapRegions && MapRegions.rebuildAllRegionLabels && myMap) {
            MapRegions.rebuildAllRegionLabels(myMap, objects);
        } else if (window.MapRegions && MapRegions.syncAllRegionLabels && myMap) {
            MapRegions.syncAllRegionLabels(myMap, objects);
        }
        objects.forEach(function(obj) {
            if (obj && obj.properties && obj.properties.get('type') === 'cable') ensureCableMapZIndex(obj);
        });
        if (typeof applyMapFilter === 'function') applyMapFilter();
        if (opts && opts.undoRedo) requestAnimationFrame(finish);
        else finish();
    };
    var useChunkedPostProcess = isMapBulkImportActive() && !(opts && opts.undoRedo);
    if (useChunkedPostProcess) {
        if (typeof setMapLoadingOverlayText === 'function') {
            setMapLoadingOverlayText(opts && opts.bulkImport ? 'Финализация импорта…' : 'Подготовка карты…');
        }
        var postSteps = [
            function() {
                if (typeof syncAllCabinetMembersToCabinets === 'function') {
                    syncAllCabinetMembersToCabinets({ skipDisplay: true });
                }
                repairCablesAfterImport();
                validateAndFixCableGeometryOnLoad();
                refreshAllCableUndergroundOverlays();
                applyAllOpticalCableMapStyles();
                ensureNodeLabelsVisible();
            },
            function() {
                updateCableVisualization();
                updateCrossDisplay();
                updateNodeDisplay();
                if (typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
            },
            function() {
                scheduleConnectionLinesUpdate('full');
                migrateStandaloneSwitchesIntoNodes();
                if (window.EmbeddedSplitters && typeof EmbeddedSplitters.migrateAllFromMap === 'function') {
                    EmbeddedSplitters.migrateAllFromMap();
                }
                if (window.EmbeddedSplitters && typeof EmbeddedSplitters.syncAllInputs === 'function') {
                    objects.forEach(function(obj) {
                        if (EmbeddedSplitters.isHost(obj)) EmbeddedSplitters.syncAllInputs(obj);
                    });
                }
            },
            function() {
                if (migrateNodeLevelSwitchMetaToAttached() && !(opts && opts.skipSave)) saveData();
                if (typeof migrateAllRadioBridgeCopperPorts === 'function') migrateAllRadioBridgeCopperPorts();
                if (typeof repairRadioBridgeFiberLinksAfterLoad === 'function') repairRadioBridgeFiberLinksAfterLoad();
                rebuildAllCopperPortUsageFromCables();
                if (window.CameraPlayer && CameraPlayer.startStreamMonitor) CameraPlayer.startStreamMonitor();
                if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
            },
            function() {
                if (window.MapRegions && MapRegions.sendAllRegionsToMapBack && myMap) {
                    MapRegions.sendAllRegionsToMapBack(myMap, objects);
                }
                if (window.MapRegions && MapRegions.rebuildAllRegionLabels && myMap) {
                    MapRegions.rebuildAllRegionLabels(myMap, objects);
                } else if (window.MapRegions && MapRegions.syncAllRegionLabels && myMap) {
                    MapRegions.syncAllRegionLabels(myMap, objects);
                }
                objects.forEach(function(obj) {
                    if (obj && obj.properties && obj.properties.get('type') === 'cable') ensureCableMapZIndex(obj);
                });
                if (typeof applyMapFilter === 'function') applyMapFilter();
            }
        ];
        var stepIdx = 0;
        function runPostStep() {
            if (stepIdx >= postSteps.length) {
                finish();
                return;
            }
            postSteps[stepIdx++]();
            requestAnimationFrame(runPostStep);
        }
        requestAnimationFrame(runPostStep);
        return;
    }
    if (opts && opts.undoRedo) requestAnimationFrame(work);
    else work();
}

function importData(data, opts, done) {
    opts = opts || {};
    var undoRedo = !!opts.undoRedo;
    var bulkMinItems = undoRedo ? MAP_UNDO_REDO_BATCH_MIN : MAP_BULK_IMPORT_MIN_ITEMS;
    var useBulk = !!opts.bulkImport || undoRedo || (Array.isArray(data) && data.length >= bulkMinItems);
    var importBatchSize = undoRedo ? MAP_UNDO_REDO_BATCH_SIZE : MAP_BULK_IMPORT_BATCH_SIZE;
    _mapBulkImportActive = useBulk;
    clearMap(opts || {});
    importDataAssignUniqueIds(data);

    function completeImport(err) {
        importDataPostProcess(opts, function() {
            _mapBulkImportActive = false;
            if (typeof MapPerf !== 'undefined') MapPerf.reindexAllObjects(objects);
            if (typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization()) {
                MapPerf.adoptExistingGeoObjects(objects);
            }
            if (typeof done === 'function') done(err || null);
        });
    }

    function failImport(err) {
        _mapBulkImportActive = false;
        if (typeof done === 'function') done(err || new Error('import failed'));
    }

    if (useBulk && Array.isArray(data) && data.length >= bulkMinItems) {
        var objectRefs = new Array(data.length);
        var idx = 0;
        var placemarkLoaded = 0;
        var placemarkTotal = 0;
        data.forEach(function(it) { if (it && it.type !== 'cable' && it.type !== 'cableLabel') placemarkTotal++; });

        function importPlacemarkBatch() {
            try {
                var end = Math.min(idx + importBatchSize, data.length);
                for (; idx < end; idx++) {
                    var item = data[idx];
                    if (!item) continue;
                    if (item.type === 'cable' || item.type === 'cableLabel') {
                        objectRefs[idx] = null;
                        continue;
                    }
                    objectRefs[idx] = importDataCreatePlacemarkRef(item);
                    if (objectRefs[idx]) placemarkLoaded++;
                }
            } catch (batchErr) {
                failImport(batchErr);
                return;
            }
            if (typeof setMapLoadingOverlayText === 'function' && placemarkTotal > 0) {
                var progressText = undoRedo
                    ? ('Восстановление объектов… ' + placemarkLoaded + ' / ' + placemarkTotal)
                    : (opts.bulkImport
                        ? ('Импорт объектов… ' + placemarkLoaded + ' / ' + placemarkTotal)
                        : ('Загрузка объектов… ' + placemarkLoaded + ' / ' + placemarkTotal));
                setMapLoadingOverlayText(progressText);
            }
            if (idx < data.length) {
                requestAnimationFrame(importPlacemarkBatch);
                return;
            }
            if (typeof setMapLoadingOverlayText === 'function') {
                setMapLoadingOverlayText(undoRedo ? 'Восстановление кабелей…' : 'Прокладка кабелей…');
            }
            requestAnimationFrame(function() {
                importDataRunCables(data, objectRefs, function(err) {
                    if (err) {
                        failImport(err);
                        return;
                    }
                    completeImport();
                });
            });
        }
        requestAnimationFrame(importPlacemarkBatch);
        return;
    }

    var objectRefs = [];
    try {
        data.forEach(function(item) {
            if (item.type === 'cable' || item.type === 'cableLabel') {
                objectRefs.push(null);
                return;
            }
            objectRefs.push(importDataCreatePlacemarkRef(item));
        });
    } catch (syncErr) {
        failImport(syncErr);
        return;
    }
    importDataRunCables(data, objectRefs, function(err) {
        if (err) {
            failImport(err);
            return;
        }
        if (typeof MapPerf !== 'undefined') MapPerf.reindexAllObjects(objects);
        completeImport();
    });
}

function populateRegionFromSerializedData(regionObj, data) {
    if (!regionObj || !data || data.type !== 'region' || !window.MapRegions) return;
    var ring = MapRegions.normalizeRing(data.geometry);
    if (ring.length >= 3 && regionObj.geometry) {
        try { regionObj.geometry.setCoordinates([ring]); } catch (e) {}
    }
    if (data.name != null) {
        regionObj.properties.set('name', data.name);
        regionObj.properties.set('balloonContent', data.name ? ('Регион: ' + data.name) : 'Регион');
    }
    if (data.fillColor) regionObj.properties.set('fillColor', data.fillColor);
    if (data.strokeColor) regionObj.properties.set('strokeColor', data.strokeColor);
    if (data.fillOpacity != null) regionObj.properties.set('fillOpacity', data.fillOpacity);
    if (data.regionVisible != null) regionObj.properties.set('regionVisible', data.regionVisible !== false);
    if (data.revision != null) setMapRevision(regionObj, data.revision);
    if (window.ObjectGallery) ObjectGallery.applyPhotosFromData(regionObj, data);
    else if (Array.isArray(data.photos)) regionObj.properties.set('photos', data.photos);
    MapRegions.applyRegionStyle(regionObj);
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
}

function populatePlacemarkFromSerializedData(placemark, data) {
    if (!placemark || !data || !data.type) return;
    var type = data.type;
    if (type === 'region') {
        populateRegionFromSerializedData(placemark, data);
        return;
    }
    if (data.geometry && placemark.geometry) {
        var incomingRev = data.revision != null && !isNaN(Number(data.revision)) ? Number(data.revision) : null;
        var localRev = typeof getMapRevision === 'function' ? getMapRevision(placemark) : 0;
        if (incomingRev == null || incomingRev >= localRev) {
            placemark.geometry.setCoordinates(data.geometry);
        }
    }
    if (type) placemark.properties.set('type', type);
    if (data.name != null) {
        placemark.properties.set('name', data.name);
        var opName = data.name;
        if (type === 'cross') {
            placemark.properties.set('balloonContent', opName ? 'Оптический кросс: ' + opName : 'Оптический кросс');
        } else if (type === 'sleeve') {
            placemark.properties.set('balloonContent', opName ? 'Кабельная муфта: ' + opName : 'Кабельная муфта');
        } else if (type === 'spliceCassette') {
            placemark.properties.set('balloonContent', opName ? 'Сплайс-кассета: ' + opName : 'Сплайс-кассета');
        } else if (type === 'node') {
            placemark.properties.set('balloonContent', opName ? 'Узел сети: ' + opName : 'Узел сети');
        }
        if (typeof updateObjectLabel === 'function') updateObjectLabel(placemark, opName);
    }
    if (data.revision != null) {
        var revIncoming = Number(data.revision);
        if (!isNaN(revIncoming) && revIncoming >= (typeof getMapRevision === 'function' ? getMapRevision(placemark) : 0)) {
            setMapRevision(placemark, revIncoming);
        }
    }
    if (data.usedFibers) placemark.properties.set('usedFibers', data.usedFibers);
    if (data.fiberConnections) placemark.properties.set('fiberConnections', data.fiberConnections);
    if (data.fiberLabels) placemark.properties.set('fiberLabels', data.fiberLabels);
    if (type === 'node') {
        placemark.properties.set('nodeKind', data.nodeKind || 'network');
        if (data.comment) placemark.properties.set('comment', data.comment);
        if (Array.isArray(data.attachedSwitches) && data.attachedSwitches.length) {
            placemark.properties.set('attachedSwitches', JSON.parse(JSON.stringify(data.attachedSwitches)));
        } else {
            placemark.properties.set('attachedSwitches', placemark.properties.get('attachedSwitches') || []);
        }
    }
    if (type === 'sleeve') {
        if (data.sleeveType) placemark.properties.set('sleeveType', data.sleeveType);
        if (data.maxFibers !== undefined) placemark.properties.set('maxFibers', data.maxFibers);
        if (data.nodeConnections) placemark.properties.set('nodeConnections', data.nodeConnections);
        if (data.oltConnections) placemark.properties.set('oltConnections', data.oltConnections);
        if (data.onuConnections) placemark.properties.set('onuConnections', data.onuConnections);
        if (data.mediaConverterConnections) placemark.properties.set('mediaConverterConnections', data.mediaConverterConnections);
        if (data.radioBridgeConnections) placemark.properties.set('radioBridgeConnections', data.radioBridgeConnections);
        if (data.splitterConnections) placemark.properties.set('splitterConnections', data.splitterConnections);
        placemark.properties.set('embeddedSplitters', Array.isArray(data.embeddedSplitters) ? data.embeddedSplitters : []);
        loadFiberSchemeCanvasPropsFromData(data, placemark);
        loadFiberSchemeViewPropsFromData(data, placemark);
        loadFiberSchemeCableSidesFromData(data, placemark);
    }
    if (type === 'spliceCassette') {
        var cassetteType = data.cassetteType || data.sleeveType;
        if (cassetteType) placemark.properties.set('cassetteType', cassetteType);
        if (data.maxFibers !== undefined) placemark.properties.set('maxFibers', data.maxFibers);
        else if (cassetteType && typeof getDefaultMaxFibersForCassetteType === 'function') {
            placemark.properties.set('maxFibers', getDefaultMaxFibersForCassetteType(cassetteType));
        }
        if (data.nodeConnections) placemark.properties.set('nodeConnections', data.nodeConnections);
        if (data.oltConnections) placemark.properties.set('oltConnections', data.oltConnections);
        if (data.onuConnections) placemark.properties.set('onuConnections', data.onuConnections);
        if (data.mediaConverterConnections) placemark.properties.set('mediaConverterConnections', data.mediaConverterConnections);
        if (data.radioBridgeConnections) placemark.properties.set('radioBridgeConnections', data.radioBridgeConnections);
        if (data.splitterConnections) placemark.properties.set('splitterConnections', data.splitterConnections);
        placemark.properties.set('embeddedSplitters', Array.isArray(data.embeddedSplitters) ? data.embeddedSplitters : []);
        loadFiberSchemeCanvasPropsFromData(data, placemark);
        loadFiberSchemeViewPropsFromData(data, placemark);
        loadFiberSchemeCableSidesFromData(data, placemark);
    }
    if (type === 'cross') {
        if (data.crossType) placemark.properties.set('crossType', data.crossType);
        if (data.crossPorts) placemark.properties.set('crossPorts', data.crossPorts);
        var ccp = data.crossCopperPorts !== undefined && data.crossCopperPorts !== null ? parseInt(data.crossCopperPorts, 10) : 0;
        placemark.properties.set('crossCopperPorts', isNaN(ccp) ? 0 : Math.max(0, ccp));
        placemark.properties.set('copperPortUsage', data.copperPortUsage && typeof data.copperPortUsage === 'object' ? data.copperPortUsage : {});
        if (data.nodeConnections) placemark.properties.set('nodeConnections', data.nodeConnections);
        if (data.fiberPorts) placemark.properties.set('fiberPorts', data.fiberPorts);
        if (data.crossPortPatches) placemark.properties.set('crossPortPatches', data.crossPortPatches);
        if (data.oltConnections) placemark.properties.set('oltConnections', data.oltConnections);
        if (data.onuConnections) placemark.properties.set('onuConnections', data.onuConnections);
        if (data.mediaConverterConnections) placemark.properties.set('mediaConverterConnections', data.mediaConverterConnections);
        if (data.radioBridgeConnections) placemark.properties.set('radioBridgeConnections', data.radioBridgeConnections);
        if (data.splitterConnections) placemark.properties.set('splitterConnections', data.splitterConnections);
        placemark.properties.set('embeddedSplitters', Array.isArray(data.embeddedSplitters) ? data.embeddedSplitters : []);
        loadFiberSchemeCanvasPropsFromData(data, placemark);
        loadFiberSchemeViewPropsFromData(data, placemark);
        loadFiberSchemeCableSidesFromData(data, placemark);
    }
    if (type === 'olt') {
        placemark.properties.set('ponPorts', data.ponPorts || 8);
        placemark.properties.set('incomingFiber', data.incomingFiber || null);
        placemark.properties.set('portAssignments', data.portAssignments || {});
        placemark.properties.set('portLabels', data.portLabels || {});
        placemark.properties.set('ponPortTypes', Array.isArray(data.ponPortTypes) && data.ponPortTypes.length
            ? data.ponPortTypes.slice()
            : []);
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
    }
    if (type === 'splitter') {
        placemark.properties.set('splitRatio', data.splitRatio || 8);
        placemark.properties.set('inputFiber', data.inputFiber || null);
        placemark.properties.set('outputConnections', data.outputConnections || []);
        placemark.properties.set('outputLabels', Array.isArray(data.outputLabels) ? data.outputLabels : []);
    }
    if (type === 'onu') {
        placemark.properties.set('incomingFiber', data.incomingFiber || null);
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
    }
    if (type === 'camera') {
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
        if (window.CameraPlayer) {
            CameraPlayer.applyCameraStreamConfig(placemark, {
                streamType: data.streamType || 'none',
                streamUrl: data.streamUrl || '',
                streamUser: data.streamUser || '',
                streamPass: data.streamPass || '',
                streamAutoplay: data.streamAutoplay !== false,
                streamMuted: data.streamMuted !== false
            });
        } else {
            placemark.properties.set('streamType', data.streamType || 'none');
            if (data.streamUrl) placemark.properties.set('streamUrl', data.streamUrl);
        }
        if (data.snapshotPhoto) {
            if (window.CameraPlayer) CameraPlayer.applyCameraSnapshot(placemark, data.snapshotPhoto);
            else if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(data.snapshotPhoto)) {
                placemark.properties.set('snapshotPhoto', data.snapshotPhoto);
            }
        }
    }
    if (type === 'mediaConverter') {
        placemark.properties.set('incomingFiber', data.incomingFiber || null);
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
    }
    if (type === 'radioBridge') {
        placemark.properties.set('bridgeMode', data.bridgeMode || 'ptp');
        placemark.properties.set('role', data.role || (data.bridgeMode === 'ptmp' ? 'station' : 'ptp'));
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
        placemark.properties.set('peerBridgeId', data.peerBridgeId || null);
        placemark.properties.set('peerBridgeName', data.peerBridgeName || null);
        placemark.properties.set('routeIds', Array.isArray(data.routeIds) ? data.routeIds : []);
        placemark.properties.set('stationLinks', Array.isArray(data.stationLinks) ? data.stationLinks : []);
        var ptpPeerLinks = Array.isArray(data.ptpPeerLinks) ? data.ptpPeerLinks : [];
        if (!ptpPeerLinks.length && data.ptpPeerId) {
            ptpPeerLinks = [{
                peerId: data.ptpPeerId,
                peerName: data.ptpPeerName || '',
                routeIds: []
            }];
        }
        placemark.properties.set('ptpPeerLinks', ptpPeerLinks);
        placemark.properties.set('apBridgeId', data.apBridgeId || null);
        placemark.properties.set('apBridgeName', data.apBridgeName || null);
        placemark.properties.set('ptpPeerId', data.ptpPeerId || null);
        placemark.properties.set('ptpPeerName', data.ptpPeerName || null);
        placemark.properties.set('incomingFiber', data.incomingFiber || null);
        placemark.properties.set('showCoverage', !!data.showCoverage);
        placemark.properties.set('coverageShape', data.coverageShape || 'circle');
        var loadRadiusKmRaw = data.coverageRadiusKm != null && data.coverageRadiusKm !== ''
            ? parseFloat(data.coverageRadiusKm)
            : (data.coverageRadiusM != null ? data.coverageRadiusM / 1000 : 3);
        var loadRadiusKm = loadRadiusKmRaw > 50 ? loadRadiusKmRaw / 1000 : loadRadiusKmRaw;
        if (isNaN(loadRadiusKm) || loadRadiusKm <= 0) loadRadiusKm = 3;
        var loadLengthKmRaw = data.coverageLengthKm != null && data.coverageLengthKm !== ''
            ? parseFloat(data.coverageLengthKm)
            : (data.coverageLengthM != null ? data.coverageLengthM / 1000 : loadRadiusKm);
        var loadLengthKm = loadLengthKmRaw > 50 ? loadLengthKmRaw / 1000 : loadLengthKmRaw;
        if (isNaN(loadLengthKm) || loadLengthKm <= 0) loadLengthKm = loadRadiusKm;
        placemark.properties.set('coverageRadiusKm', loadRadiusKm);
        placemark.properties.set('coverageLengthKm', loadLengthKm);
        placemark.properties.set('coverageRadiusM', null);
        placemark.properties.set('coverageLengthM', null);
        placemark.properties.set('coverageAzimuth', data.coverageAzimuth != null ? data.coverageAzimuth : 0);
        placemark.properties.set('coverageAngle', data.coverageAngle != null ? data.coverageAngle : 60);
        if (Array.isArray(data.radioBridgePortTypes) && data.radioBridgePortTypes.length) {
            placemark.properties.set('radioBridgePortTypes', data.radioBridgePortTypes.slice());
        }
        placemark.properties.set('copperPortUsage', data.copperPortUsage && typeof data.copperPortUsage === 'object' ? Object.assign({}, data.copperPortUsage) : {});
        placemark.properties.set('portLabels', data.portLabels && typeof data.portLabels === 'object' ? Object.assign({}, data.portLabels) : {});
        placemark.properties.set('manualPortUsage', data.manualPortUsage && typeof data.manualPortUsage === 'object' ? Object.assign({}, data.manualPortUsage) : {});
        if (typeof ensureRadioBridgePortTypes === 'function') ensureRadioBridgePortTypes(placemark);
        if (typeof migrateRadioBridgeCopperCablePorts === 'function') migrateRadioBridgeCopperCablePorts(placemark);
    }
    if (type === 'signalPost') {
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
    }
    if (type === 'cabinet') {
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.cabinetMount) placemark.properties.set('cabinetMount', data.cabinetMount);
        if (data.cabinetHeight) placemark.properties.set('cabinetHeight', data.cabinetHeight);
        if (data.cabinetWidth) placemark.properties.set('cabinetWidth', data.cabinetWidth);
        if (data.cabinetUnits) placemark.properties.set('cabinetUnits', data.cabinetUnits);
        if (data.address) placemark.properties.set('address', data.address);
        if (data.inventoryNumber) placemark.properties.set('inventoryNumber', data.inventoryNumber);
        if (data.serialNumber) placemark.properties.set('serialNumber', data.serialNumber);
        if (data.ipAddress) placemark.properties.set('ipAddress', data.ipAddress);
    }
    if (typeof canBeCabinetMember === 'function' && canBeCabinetMember(type)) {
        if ('cabinetId' in data) {
            if (data.cabinetId) placemark.properties.set('cabinetId', String(data.cabinetId));
            else if (typeof clearObjectCabinetId === 'function') clearObjectCabinetId(placemark);
            else if (typeof placemark.properties.unset === 'function') placemark.properties.unset('cabinetId');
            else placemark.properties.set('cabinetId', '');
        }
        if (data.cabinetId && data.cabinetOrder != null && data.cabinetOrder !== '') {
            placemark.properties.set('cabinetOrder', Number(data.cabinetOrder));
        } else if (!data.cabinetId && typeof clearCabinetMemberOrder === 'function') {
            clearCabinetMemberOrder(placemark);
        }
    } else if (data.cabinetId) {
        placemark.properties.set('cabinetId', data.cabinetId);
    }
    if (type === 'switch') {
        placemark.properties.set('parentNodeId', data.parentNodeId || '');
        placemark.properties.set('switchPortTypes', Array.isArray(data.switchPortTypes) && data.switchPortTypes.length
            ? data.switchPortTypes.slice()
            : buildSwitchPortTypesArray(24, typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)'));
        placemark.properties.set('copperPortUsage', data.copperPortUsage && typeof data.copperPortUsage === 'object' ? data.copperPortUsage : {});
        if (data.manufacturer) placemark.properties.set('manufacturer', data.manufacturer);
        if (data.model) placemark.properties.set('model', data.model);
        if (data.comment != null) placemark.properties.set('comment', data.comment || '');
    }
    if (window.ObjectGallery) ObjectGallery.applyPhotosFromData(placemark, data);
    else if (Array.isArray(data.photos)) placemark.properties.set('photos', data.photos);
}

function applySerializedCableToMap(cable, data, opts) {
    if (!cable || !data || data.type !== 'cable') return;
    var opCuMeta = copperSerializedMetaFromItem(data);
    var refsOpMap = objects.filter(function(o) {
        var t = o.properties && o.properties.get('type');
        return t && t !== 'cable' && t !== 'cableLabel';
    });
    var opCoordsNorm = data.geometry && normalizeCableGeometry(data.geometry);
    var fromUid = data.fromUniqueId;
    var toUid = data.toUniqueId;
    var fromObj = fromUid ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUid; }) : cable.properties.get('from');
    var toObj = toUid ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUid; }) : cable.properties.get('to');
    if (!fromObj) fromObj = cable.properties.get('from');
    if (!toObj) toObj = cable.properties.get('to');
    var routePts = buildCableRoutePointsFromData(refsOpMap, data, fromObj, toObj, opCoordsNorm);
    if (routePts && routePts.length >= 2) {
        cable.properties.set('from', routePts[0]);
        cable.properties.set('to', routePts[routePts.length - 1]);
        cable.properties.set('points', routePts);
        try {
            var lin = routePts.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
            if (cable.geometry && lin.length >= 2) cable.geometry.setCoordinates(lin);
        } catch (eR) {}
    } else if (cable.geometry && opCoordsNorm && opCoordsNorm.length >= 2) {
        cable.geometry.setCoordinates(opCoordsNorm);
    }
    if (data.distance !== undefined) cable.properties.set('distance', data.distance);
    if (data.cableName != null) cable.properties.set('cableName', data.cableName);
    if (typeof applySerializedCableProduct === 'function') applySerializedCableProduct(cable, data);
    if (data.cableType === 'copper' && opCuMeta) {
        if (opCuMeta.copperSwitchFromId) cable.properties.set('copperSwitchFromId', opCuMeta.copperSwitchFromId);
        else cable.properties.set('copperSwitchFromId', null);
        if (opCuMeta.copperSwitchToId) cable.properties.set('copperSwitchToId', opCuMeta.copperSwitchToId);
        else cable.properties.set('copperSwitchToId', null);
        cable.properties.set('copperPortFrom', opCuMeta.copperPortFrom != null ? opCuMeta.copperPortFrom : null);
        cable.properties.set('copperPortTo', opCuMeta.copperPortTo != null ? opCuMeta.copperPortTo : null);
        applyCopperCableOccupancyFromCable(cable);
    }
    applySerializedUndergroundToCable(cable, data, cable.properties.get('points'));
    applyImportedCableFiberProps(cable, data);
    if (data.revision != null) setMapRevision(cable, data.revision);
    if (window.CableUnderground) {
        try {
            CableUnderground.refreshCableUndergroundOverlays(cable);
            CableUnderground.syncAerialOverlayStroke(cable);
        } catch (eUgUp) {}
    }
    if (!(opts && opts.skipVisualRefresh)) {
        updateCableVisualization();
        scheduleConnectionLinesUpdate();
    }
}

function createObjectFromData(data, opts, createOpts) {
    createOpts = createOpts || opts || {};
    const { type, name, geometry, usedFibers, fiberConnections, fiberLabels, fiberPorts, sleeveType, maxFibers, crossType, crossPorts, crossCopperPorts, copperPortUsage, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, uniqueId, nodeKind, manufacturer, model, comment, ponPorts, splitRatio, splitterConnections, incomingFiber, portAssignments, portLabels, inputFiber, outputConnections, parentNodeId, switchPortTypes, attachedSwitches, streamType, streamUrl, streamUser, streamPass, streamAutoplay, streamMuted, snapshotPhoto, cabinetId } = data;
    
    var balloonContent;
    switch (type) {
        case 'support': balloonContent = name ? 'Опора связи: ' + name : 'Опора связи'; break;
        case 'sleeve': balloonContent = name ? 'Кабельная муфта: ' + name : 'Кабельная муфта'; break;
        case 'spliceCassette': balloonContent = name ? 'Сплайс-кассета: ' + name : 'Сплайс-кассета'; break;
        case 'cross': balloonContent = 'Оптический кросс: ' + name; break;
        case 'node': balloonContent = 'Узел сети: ' + name; break;
        case 'attachment': balloonContent = name ? 'Крепление узлов: ' + name : 'Крепление узлов'; break;
        case 'manhole': balloonContent = name ? 'Колодец: ' + name : 'Колодец'; break;
        case 'signalPost': balloonContent = name ? 'Сигнальный столб: ' + name : 'Сигнальный столб'; break;
        case 'cabinet': balloonContent = name ? 'Ящик: ' + name : 'Ящик'; break;
        case 'olt': balloonContent = name ? 'OLT: ' + name : 'OLT (GPON)'; break;
        case 'splitter': balloonContent = name ? 'Сплиттер: ' + name : 'Сплиттер'; break;
        case 'onu': balloonContent = name ? 'ONU: ' + name : 'ONU'; break;
        case 'camera': balloonContent = name ? 'Камера: ' + name : 'Камера'; break;
        case 'mediaConverter': balloonContent = name ? 'Медиаконвертер: ' + name : 'Медиаконвертер'; break;
        case 'radioBridge': balloonContent = name ? 'Wi‑Fi радиомост: ' + name : 'Wi‑Fi радиомост'; break;
        case 'switch': balloonContent = name ? 'Коммутатор: ' + name : 'Коммутатор'; break;
        default: balloonContent = 'Объект';
    }

    var mapIcon = buildMapPlacemarkIcon(type, 'normal', { nodeKind: nodeKind || 'network' });
    if (!mapIcon) return null;

    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: mapIcon.href,
        iconImageSize: mapIcon.iconImageSize,
        iconImageOffset: mapIcon.iconImageOffset,
        draggable: isEditMode
    };
    
    const placemark = new ymaps.Placemark(geometry, {
        type: type,
        name: name,
        balloonContent: balloonContent
    }, placemarkOptions);

    if (type === 'node' || type === 'cross' || type === 'switch') {
        placemark.events.add('dragend', function() {
            const label = placemark.properties.get('label');
            const coords = placemark.geometry.getCoordinates();
            if (label && label.geometry) {
                label.geometry.setCoordinates(coords);
            }
            if (type === 'cross') updateCrossDisplay();
            if (type === 'node') updateNodeDisplay();
        });
    }

    if (uniqueId) {
        placemark.properties.set('uniqueId', uniqueId);
    } else {
        ensurePlacemarkUniqueIdForSync(placemark);
    }
    if (!data.revision) data.revision = 0;
    populatePlacemarkFromSerializedData(placemark, data);

    placemark.events.add('click', function(e) {
        if (objectPlacementMode) {
            if (type === 'cabinet' && typeof canBeCabinetMember === 'function' && canBeCabinetMember(currentPlacementType || '')) {
                var cabCoordsPm = placemark.geometry && placemark.geometry.getCoordinates();
                if (cabCoordsPm) placeObjectAtCoords(cabCoordsPm);
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
            
            var spRouteAnchor = getGponFiberRoutingSourceAnchor(splitterFiberRoutingData);
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

    placemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            ensurePlacemarkUniqueIdForSync(placemark);
            var uid = placemark.properties.get('uniqueId');
            var skipGroupSnapPm = typeof shouldSkipGroupSnapAfterPlacement === 'function' && shouldSkipGroupSnapAfterPlacement(placemark);
            updateConnectedCables(placemark);
            if (typeof MapPerf !== 'undefined' && MapPerf.updateSpatialPosition) MapPerf.updateSpatialPosition(placemark);
            const label = placemark.properties.get('label');
            if (label) {
                label.geometry.setCoordinates(placemark.geometry.getCoordinates());
                try { mapGeoAdd(label); } catch (e) {}
            }
            scheduleConnectionLinesUpdate();
            updateSelectionPulsePosition(placemark);
            if ((type === 'cross' || type === 'node') && !skipGroupSnapPm && typeof snapCoordsToObjectGroup === 'function') {
                if (!(typeof onMemberObjectDragEnd === 'function' && onMemberObjectDragEnd(placemark))) {
                    var snappedCoordsPm = snapCoordsToObjectGroup(placemark.geometry.getCoordinates(), type, placemark);
                    placemark.geometry.setCoordinates(snappedCoordsPm);
                }
            } else if (typeof onMemberObjectDragEnd === 'function') {
                onMemberObjectDragEnd(placemark);
            }
            if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(placemark);
            else saveData({ object: placemark, syncImmediate: true });
            if (type === 'cross' && typeof updateCrossDisplay === 'function') updateCrossDisplay();
            if (type === 'node' && typeof updateNodeDisplay === 'function') updateNodeDisplay();
            if (type === 'cabinet' && typeof onCabinetDragEnd === 'function') onCabinetDragEnd(placemark);
            releaseDragObjectLock(uid);
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            if (typeof resumeMapPanAfterPlacementObjectDrag === 'function') resumeMapPanAfterPlacementObjectDrag();
        });

    placemark.events.add('drag', function() {
        if (objectPlacementMode && typeof suspendMapPanForPlacementObjectDrag === 'function') {
            suspendMapPanForPlacementObjectDrag();
        }
        if (!window.syncDragInProgress) {
            window.syncDragInProgress = true;
            acquireDragObjectLock(placemark);
        }
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} }
        scheduleDragUpdate(placemark);
    });

    updateObjectLabel(placemark, name);
    if (type === 'camera') refreshCameraMapPresentation(placemark);

    attachHoverEventsToObject(placemark);
    if (typeof bindPlacemarkPlacementDragSupport === 'function') bindPlacemarkPlacementDragSupport(placemark);
    if (!(createOpts && createOpts.skipAddToObjects)) {
        objects.push(placemark);
        mapPerfRegister(placemark);
        if (type !== 'cross' && type !== 'node') {
            var skipMapAdd = typeof getObjectCabinetId === 'function' && getObjectCabinetId(placemark);
            if (!skipMapAdd) mapGeoAdd(placemark);
        }
        var objLabel = placemark.properties.get('label');
        if (objLabel && !(typeof getObjectCabinetId === 'function' && getObjectCabinetId(placemark))) {
            if (!(typeof MapPerf !== 'undefined' && MapPerf.shouldUseVirtualization && MapPerf.shouldUseVirtualization())) {
                try { mapGeoAdd(objLabel); } catch(e) {}
            }
        }
        if (!isMapBulkImportActive() && !(createOpts && createOpts.bulkImport)) updateStats();
    }
    return placemark;
}

function downloadTextFile(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

var _pdfUnicodeFontBase64 = null;
var PDF_UNICODE_FONT_URLS = [
    '/fonts/TILDASANS-VF_5.TTF',
    '/fonts/TildaSans-VF_5.ttf',
    '/fonts/NotoSans-Regular.ttf',
    '/api/pdf-font'
];

function uint8ToBase64(bytes) {
    var chunkSize = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunkSize) {
        var chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

async function ensurePdfUnicodeFont(doc) {
    try {
        if (!_pdfUnicodeFontBase64) {
            var loaded = false;
            for (var i = 0; i < PDF_UNICODE_FONT_URLS.length; i++) {
                var url = PDF_UNICODE_FONT_URLS[i];
                try {
                    var response = await fetch(url);
                    if (!response.ok) continue;
                    var buffer = await response.arrayBuffer();
                    _pdfUnicodeFontBase64 = uint8ToBase64(new Uint8Array(buffer));
                    loaded = true;
                    break;
                } catch (eOne) {}
            }
            if (!loaded || !_pdfUnicodeFontBase64) throw new Error('font-download-failed');
        }
        doc.addFileToVFS('NotoSans-Regular.ttf', _pdfUnicodeFontBase64);
        doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
        doc.setFont('NotoSans', 'normal');
        return true;
    } catch (eFont) {
        return false;
    }
}

function buildZabbixExportPayload(data) {
    var mapItems = Array.isArray(data) ? data : [];
    var nodes = [];
    var links = [];
    var nodeByIndex = Object.create(null);
    mapItems.forEach(function(item, index) {
        if (!item || !item.type) return;
        if (item.type === 'cable' || item.type === 'cableLabel' || item.type === 'region' || item.type === 'regionLabel') return;
        var geometry = Array.isArray(item.geometry) ? item.geometry : [null, null];
        var lat = Number(geometry[0]);
        var lon = Number(geometry[1]);
        var node = {
            id: item.uniqueId || ('idx-' + index),
            name: item.name || (item.type + '-' + index),
            type: item.type,
            lat: Number.isFinite(lat) ? lat : null,
            lon: Number.isFinite(lon) ? lon : null
        };
        nodeByIndex[index] = node;
        nodes.push(node);
    });

    mapItems.forEach(function(item, index) {
        if (!item || item.type !== 'cable') return;
        var fromNode = nodeByIndex[item.from];
        var toNode = nodeByIndex[item.to];
        if (!fromNode || !toNode) return;
        links.push({
            id: item.uniqueId || ('cable-' + index),
            name: item.cableName || ('Cable ' + (index + 1)),
            cableType: item.cableType || 'fiber',
            from: fromNode.id,
            to: toNode.id,
            fromName: fromNode.name,
            toName: toNode.name,
            distance: item.distance != null ? item.distance : null
        });
    });

    return {
        generatedAt: new Date().toISOString(),
        version: 1,
        source: 'network-map',
        stats: {
            itemsTotal: mapItems.length,
            nodesTotal: nodes.length,
            linksTotal: links.length
        },
        zabbix: {
            // LLD для автообнаружения узлов.
            hosts_discovery: nodes.map(function(node) {
                return {
                    '{#ID}': node.id,
                    '{#NAME}': node.name,
                    '{#TYPE}': node.type,
                    '{#LAT}': node.lat,
                    '{#LON}': node.lon
                };
            }),
            links_discovery: links.map(function(link) {
                return {
                    '{#ID}': link.id,
                    '{#NAME}': link.name,
                    '{#TYPE}': link.cableType,
                    '{#FROM}': link.from,
                    '{#TO}': link.to
                };
            })
        },
        // Полный снимок схемы для восстановления/доп. интеграций.
        full_map: mapItems,
        nodes: nodes,
        links: links
    };
}

function resolveMapExportObjectName(item) {
    if (!item) return '';
    var name = item.name != null ? String(item.name).trim() : '';
    return name || '';
}

function resolveMapExportCableName(item) {
    if (!item) return 'Кабель';
    var cableName = item.cableName != null ? String(item.cableName).trim() : '';
    if (cableName) return cableName;
    if (typeof getCableDescription === 'function') {
        return getCableDescription(item.cableType);
    }
    return 'Кабель';
}

var MAP_EXPORT_OBJECT_TYPE_SINGULAR = {
    region: 'Регион',
    support: 'Опора',
    sleeve: 'Муфта',
    cross: 'Кросс',
    spliceCassette: 'Сплайс-кассета',
    attachment: 'Крепление',
    manhole: 'Колодец',
    signalPost: 'Столб',
    cabinet: 'Ящик',
    olt: 'OLT',
    splitter: 'Сплиттер',
    onu: 'ONU',
    node: 'Узел',
    camera: 'Камера',
    mediaConverter: 'Медиаконвертер',
    radioBridge: 'Радиомост'
};

function resolveMapExportObjectTypeLabel(type, plural) {
    if (!type) return '';
    if (plural) {
        if (type === 'region') return 'Регионы';
        if (typeof getObjectTypeLabel === 'function') {
            var pluralLabel = getObjectTypeLabel(type);
            if (pluralLabel) return pluralLabel;
        }
        return type;
    }
    return MAP_EXPORT_OBJECT_TYPE_SINGULAR[type] || (typeof getObjectTypeLabel === 'function' ? getObjectTypeLabel(type) : type);
}

function resolveMapExportCableTypeLabel(cableType) {
    if (typeof isCopperCableType === 'function' && isCopperCableType(cableType)) return 'Медный кабель';
    if (cableType === 'copper') return 'Медный кабель';
    if (typeof isOpticalCableType === 'function' && isOpticalCableType(cableType)) return 'ВОЛС';
    if (cableType === 'fiber') return 'ВОЛС';
    if (typeof getCableDescription === 'function') return getCableDescription(cableType);
    return 'Кабель';
}

function formatMapExportPointCoords(geometry, itemType) {
    if (!Array.isArray(geometry) || !geometry.length) return '';
    if (itemType === 'region') return '';
    var lat = geometry[0];
    var lon = geometry.length > 1 ? geometry[1] : null;
    if (Array.isArray(lat)) {
        lon = lat.length > 1 ? lat[1] : lon;
        lat = lat[0];
    }
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    return ', ' + lat.toFixed(6) + '°; ' + lon.toFixed(6) + '°';
}

function formatMapExportObjectLine(item, index) {
    if (!item) return '';
    var typeLabel = resolveMapExportObjectTypeLabel(item.type, false);
    var name = resolveMapExportObjectName(item);
    var coords = formatMapExportPointCoords(item.geometry, item.type);
    if (name && typeLabel) return (index + 1) + '. ' + typeLabel + ' «' + name + '»' + coords;
    if (name) return (index + 1) + '. ' + name + coords;
    if (typeLabel) return (index + 1) + '. ' + typeLabel + coords;
    return String(index + 1) + '.' + coords;
}

function resolveMapExportCableRoute(item, objectByIndex) {
    var fromName = item && item.from != null && objectByIndex[item.from] ? resolveMapExportObjectName(objectByIndex[item.from]) : '';
    var toName = item && item.to != null && objectByIndex[item.to] ? resolveMapExportObjectName(objectByIndex[item.to]) : '';
    if (fromName && toName) return fromName + ' → ' + toName;
    return fromName || toName || '';
}

function formatMapExportCableLine(item, objectByIndex, index) {
    if (!item) return '';
    var typeLabel = resolveMapExportCableTypeLabel(item.cableType);
    var cableName = item.cableName != null ? String(item.cableName).trim() : '';
    var routeText = resolveMapExportCableRoute(item, objectByIndex);
    var title = cableName || routeText || resolveMapExportCableName(item);
    var line = (index + 1) + '. ' + typeLabel + ': ' + title;
    if (cableName && routeText && cableName !== routeText) line += ' · ' + routeText;
    if (item.distance != null && Number.isFinite(Number(item.distance))) {
        line += ', ' + Math.round(Number(item.distance)) + ' м';
    }
    return line;
}

function buildPdfExportHtml(data, snapshotHtml) {
    var mapItems = Array.isArray(data) ? data : [];
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    var cables = mapItems.filter(function(item) { return item && item.type === 'cable'; });
    var objectByIndex = Object.create(null);
    mapItems.forEach(function(item, index) {
        if (!item || !item.type) return;
        if (item.type === 'cable' || item.type === 'cableLabel' || item.type === 'regionLabel') return;
        objectByIndex[index] = item;
    });
    var objectsOnly = mapItems.filter(function(item) {
        if (!item || !item.type) return false;
        return item.type !== 'cable' && item.type !== 'cableLabel' && item.type !== 'regionLabel';
    });
    var byType = Object.create(null);
    objectsOnly.forEach(function(item) {
        byType[item.type] = (byType[item.type] || 0) + 1;
    });
    var typeRows = Object.keys(byType).sort().map(function(type) {
        return '<tr><td>' + esc(resolveMapExportObjectTypeLabel(type, true)) + '</td><td>' + byType[type] + '</td></tr>';
    }).join('');
    if (!typeRows) typeRows = '<tr><td>Нет данных</td><td>0</td></tr>';

    var now = new Date();
    var objectRows = objectsOnly.map(function(item, index) {
        var name = resolveMapExportObjectName(item);
        var type = resolveMapExportObjectTypeLabel(item.type, false);
        var geometry = Array.isArray(item.geometry) ? item.geometry : [];
        var lat = '';
        var lon = '';
        if (item.type !== 'region' && geometry.length > 0) {
            lat = geometry[0];
            lon = geometry.length > 1 ? geometry[1] : '';
            if (Array.isArray(lat)) {
                lon = lat.length > 1 ? lat[1] : lon;
                lat = lat[0];
            }
        }
        return '<tr>'
            + '<td>' + esc(index + 1) + '</td>'
            + '<td>' + esc(type) + '</td>'
            + '<td>' + esc(name) + '</td>'
            + '<td>' + esc(lat) + '</td>'
            + '<td>' + esc(lon) + '</td>'
            + '</tr>';
    }).join('');
    if (!objectRows) {
        objectRows = '<tr><td colspan="5">Нет объектов</td></tr>';
    }

    var cableRows = cables.map(function(item, index) {
        var fromName = '';
        var toName = '';
        if (item.from != null && objectByIndex[item.from]) fromName = resolveMapExportObjectName(objectByIndex[item.from]);
        if (item.to != null && objectByIndex[item.to]) toName = resolveMapExportObjectName(objectByIndex[item.to]);
        var cableName = item.cableName != null ? String(item.cableName).trim() : '';
        var routeText = resolveMapExportCableRoute(item, objectByIndex);
        var title = cableName || routeText || resolveMapExportCableName(item);
        return '<tr>'
            + '<td>' + esc(index + 1) + '</td>'
            + '<td>' + esc(resolveMapExportCableTypeLabel(item.cableType)) + '</td>'
            + '<td>' + esc(title) + '</td>'
            + '<td>' + esc(fromName) + '</td>'
            + '<td>' + esc(toName) + '</td>'
            + '<td>' + esc(item.distance != null ? Math.round(Number(item.distance)) + ' м' : '') + '</td>'
            + '</tr>';
    }).join('');
    if (!cableRows) {
        cableRows = '<tr><td colspan="6">Нет кабелей</td></tr>';
    }

    return ''
        + '<!doctype html><html><head><meta charset="utf-8">'
        + '<title>Network Map Export</title>'
        + '<style>'
        + 'body{font-family:Arial,sans-serif;color:#1f2937;padding:24px;line-height:1.4;}'
        + 'h1{margin:0 0 8px;font-size:24px;}'
        + '.meta{color:#6b7280;margin-bottom:20px;}'
        + '.cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;}'
        + '.card{border:1px solid #e5e7eb;border-radius:10px;padding:12px;min-width:180px;}'
        + '.card .label{font-size:12px;color:#6b7280;text-transform:uppercase;}'
        + '.card .value{font-size:22px;font-weight:700;margin-top:4px;}'
        + 'table{width:100%;border-collapse:collapse;}'
        + 'th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px;}'
        + 'th{background:#f9fafb;}'
        + '.table-wrap{overflow-x:auto;margin-bottom:20px;}'
        + '.snapshot-wrap{margin:8px 0 18px;}'
        + '.map-snapshot{max-width:100%;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#f8fafc;}'
        + '.map-snapshot > *{width:100% !important;height:100% !important;}'
        + '@media print{body{padding:12mm;}}'
        + '</style></head><body>'
        + '<h1>Отчёт по карте сети</h1>'
        + '<div class="meta">Дата выгрузки: ' + now.toLocaleString() + '</div>'
        + '<div class="cards">'
        + '<div class="card"><div class="label">Объектов</div><div class="value">' + objectsOnly.length + '</div></div>'
        + '<div class="card"><div class="label">Кабелей</div><div class="value">' + cables.length + '</div></div>'
        + '<div class="card"><div class="label">Всего элементов</div><div class="value">' + mapItems.length + '</div></div>'
        + '</div>'
        + '<h2>Скрин схемы</h2>'
        + '<div class="snapshot-wrap">'
        + (snapshotHtml || '<div class="meta">Скрин карты недоступен в текущем окружении.</div>')
        + '</div>'
        + '<h2>Сводка по типам объектов</h2>'
        + '<div class="table-wrap"><table><thead><tr><th>Тип</th><th>Количество</th></tr></thead><tbody>' + typeRows + '</tbody></table></div>'
        + '<h2>Объекты (полный список)</h2>'
        + '<div class="table-wrap"><table><thead><tr><th>#</th><th>Тип</th><th>Название</th><th>Широта</th><th>Долгота</th></tr></thead><tbody>' + objectRows + '</tbody></table></div>'
        + '<h2>Кабели (полный список)</h2>'
        + '<div class="table-wrap"><table><thead><tr><th>#</th><th>Тип</th><th>Название</th><th>Откуда</th><th>Куда</th><th>Длина</th></tr></thead><tbody>' + cableRows + '</tbody></table></div>'
        + '<p style="margin-top:18px;color:#6b7280;font-size:12px;">'
        + 'Для сохранения в PDF выберите в окне печати: "Сохранить как PDF".'
        + '</p>'
        + '</body></html>';
}

function collectSnapshotBoundsFromData(data) {
    var coreMinLat = Infinity;
    var coreMinLon = Infinity;
    var coreMaxLat = -Infinity;
    var coreMaxLon = -Infinity;
    var allMinLat = Infinity;
    var allMinLon = Infinity;
    var allMaxLat = -Infinity;
    var allMaxLon = -Infinity;
    function visitCoord(value) {
        if (!Array.isArray(value) || value.length < 2) return;
        if (Array.isArray(value[0])) {
            value.forEach(visitCoord);
            return;
        }
        var lat = Number(value[0]);
        var lon = Number(value[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (lat < allMinLat) allMinLat = lat;
        if (lat > allMaxLat) allMaxLat = lat;
        if (lon < allMinLon) allMinLon = lon;
        if (lon > allMaxLon) allMaxLon = lon;
    }
    function visitCoreCoord(value) {
        if (!Array.isArray(value) || value.length < 2) return;
        if (Array.isArray(value[0])) {
            value.forEach(visitCoreCoord);
            return;
        }
        var lat = Number(value[0]);
        var lon = Number(value[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        if (lat < coreMinLat) coreMinLat = lat;
        if (lat > coreMaxLat) coreMaxLat = lat;
        if (lon < coreMinLon) coreMinLon = lon;
        if (lon > coreMaxLon) coreMaxLon = lon;
    }
    (Array.isArray(data) ? data : []).forEach(function(item) {
        if (!item || !item.geometry) return;
        if (item.type === 'cableLabel' || item.type === 'regionLabel') return;
        visitCoord(item.geometry);
        // Приоритет для bounds: реальные объекты и связи, но не регион-полигон.
        if (item.type !== 'region') visitCoreCoord(item.geometry);
    });
    if (Number.isFinite(coreMinLat) && Number.isFinite(coreMinLon) && Number.isFinite(coreMaxLat) && Number.isFinite(coreMaxLon)) {
        return [[coreMinLat, coreMinLon], [coreMaxLat, coreMaxLon]];
    }
    if (Number.isFinite(allMinLat) && Number.isFinite(allMinLon) && Number.isFinite(allMaxLat) && Number.isFinite(allMaxLon)) {
        return [[allMinLat, allMinLon], [allMaxLat, allMaxLon]];
    }
    return null;
}

function collectSnapshotBoundsForPdf(data) {
    var fromData = collectSnapshotBoundsFromData(data);
    if (fromData) return fromData;
    if (!myMap || !myMap.geoObjects || typeof myMap.geoObjects.getBounds !== 'function') return null;
    try {
        var geoBounds = myMap.geoObjects.getBounds();
        if (geoBounds && geoBounds.length >= 2) return geoBounds;
    } catch (eBounds) {}
    return null;
}

function beginMapPdfExportCapture() {
    window._mapPdfExportCaptureActive = true;
}

function endMapPdfExportCapture() {
    window._mapPdfExportCaptureActive = false;
}

var MAP_PDF_MODE_LABELS = {
    overview: 'Обзор — вся сеть на одном листе',
    viewport: 'Как на экране — текущий масштаб'
};

function normalizeMapBoundsRect(bounds) {
    if (!bounds || bounds.length < 2) return null;
    var minLat = Math.min(bounds[0][0], bounds[1][0]);
    var maxLat = Math.max(bounds[0][0], bounds[1][0]);
    var minLon = Math.min(bounds[0][1], bounds[1][1]);
    var maxLon = Math.max(bounds[0][1], bounds[1][1]);
    if (!Number.isFinite(minLat) || !Number.isFinite(minLon) || !Number.isFinite(maxLat) || !Number.isFinite(maxLon)) {
        return null;
    }
    return { minLat: minLat, maxLat: maxLat, minLon: minLon, maxLon: maxLon };
}

function getMapVisibleBounds() {
    if (!myMap || typeof myMap.getBounds !== 'function') return null;
    try {
        return normalizeMapBoundsRect(myMap.getBounds());
    } catch (eBounds) {
        return null;
    }
}

function collectMapItemGeoPoints(item) {
    var points = [];
    if (!item || !item.geometry) return points;
    function visit(value) {
        if (!Array.isArray(value) || value.length < 2) return;
        if (Array.isArray(value[0])) {
            value.forEach(visit);
            return;
        }
        var lat = Number(value[0]);
        var lon = Number(value[1]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) points.push([lat, lon]);
    }
    visit(item.geometry);
    return points;
}

function isGeoPointInBounds(lat, lon, bounds) {
    if (!bounds) return true;
    return lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon;
}

function isMapExportItemInBounds(item, bounds, mapItems) {
    if (!bounds) return true;
    if (!item) return false;
    if (item.type === 'cable') {
        if (item.from != null && mapItems[item.from] && isMapExportItemInBounds(mapItems[item.from], bounds, mapItems)) return true;
        if (item.to != null && mapItems[item.to] && isMapExportItemInBounds(mapItems[item.to], bounds, mapItems)) return true;
        var cablePts = collectMapItemGeoPoints(item);
        for (var ci = 0; ci < cablePts.length; ci++) {
            if (isGeoPointInBounds(cablePts[ci][0], cablePts[ci][1], bounds)) return true;
        }
        return false;
    }
    var pts = collectMapItemGeoPoints(item);
    if (!pts.length) return false;
    for (var pi = 0; pi < pts.length; pi++) {
        if (isGeoPointInBounds(pts[pi][0], pts[pi][1], bounds)) return true;
    }
    return false;
}

function filterMapExportDataByBounds(data, bounds) {
    if (!bounds) return Array.isArray(data) ? data.slice() : [];
    var mapItems = Array.isArray(data) ? data : [];
    return mapItems.filter(function(item) {
        if (!item || !item.type) return false;
        if (item.type === 'cableLabel' || item.type === 'regionLabel') return false;
        return isMapExportItemInBounds(item, bounds, mapItems);
    });
}

function getDefaultMapPdfExportOptions() {
    return {
        mode: 'overview',
        pageFormat: 'a4'
    };
}

function getMapPdfPlacemarkCount() {
    if (!Array.isArray(objects)) return 0;
    var count = 0;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        if (!type || type === 'cable' || type === 'cableLabel' || type === 'regionLabel' || type === 'region') return;
        count++;
    });
    return count;
}

function getMapPdfLargeMapThreshold() {
    if (typeof MapPerf !== 'undefined' && MapPerf.VIEWPORT_CULL_MIN_OBJECTS) {
        return MapPerf.VIEWPORT_CULL_MIN_OBJECTS;
    }
    return 120;
}

function shouldHideObjectsOnPdfOverviewSnapshot() {
    return getMapPdfPlacemarkCount() >= getMapPdfLargeMapThreshold();
}

function isMapPdfDarkTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
}

function applyMapPdfLabelInlineStyles(labelEl) {
    if (!labelEl || !labelEl.style) return;
    var isDark = isMapPdfDarkTheme();
    labelEl.style.display = 'inline-block';
    labelEl.style.color = isDark ? '#f1f5f9' : '#1e293b';
    labelEl.style.fontSize = '11px';
    labelEl.style.fontWeight = '600';
    labelEl.style.lineHeight = '1.25';
    labelEl.style.textAlign = 'center';
    labelEl.style.whiteSpace = 'nowrap';
    labelEl.style.padding = '3px 8px';
    labelEl.style.marginTop = '0';
    labelEl.style.marginLeft = '50%';
    labelEl.style.transform = 'translateX(-50%)';
    labelEl.style.background = isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.94)';
    labelEl.style.border = isDark ? '1px solid rgba(148, 163, 184, 0.35)' : '1px solid #e2e8f0';
    labelEl.style.borderRadius = '6px';
    labelEl.style.boxShadow = isDark
        ? '0 2px 8px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08)'
        : '0 1px 3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.8)';
    labelEl.style.letterSpacing = '0.01em';
}

function applyMapPdfLabelStylesInRoot(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.map-label').forEach(applyMapPdfLabelInlineStyles);
}

function prepareMapLabelsDomForPdfCapture(mapEl) {
    var restores = [];
    if (!mapEl || !mapEl.querySelectorAll) return function() {};
    mapEl.querySelectorAll('.map-label').forEach(function(labelEl) {
        restores.push({ el: labelEl, cssText: labelEl.style.cssText });
        applyMapPdfLabelInlineStyles(labelEl);
    });
    return function() {
        restores.forEach(function(saved) {
            try { saved.el.style.cssText = saved.cssText; } catch (eRestore) {}
        });
    };
}

function refreshVisibleMapLabelsForPdfCapture(boundsRect, opts) {
    opts = opts || {};
    if (opts.hideObjects) return;
    if (typeof updateObjectLabel === 'function') {
        objects.forEach(function(obj) {
            if (!obj || !obj.properties) return;
            var type = obj.properties.get('type');
            if (!isMapPdfObjectType(type)) return;
            if (!opts.showAll && boundsRect && !isLiveObjectInPdfBounds(obj, boundsRect)) return;
            try {
                updateObjectLabel(obj, obj.properties.get('name'));
                var label = obj.properties.get('label');
                if (label && label.options) label.options.set('visible', true);
            } catch (eLabel) {}
        });
    }
}

function isMapPdfObjectType(type) {
    return !!type && type !== 'cable' && type !== 'cableLabel' && type !== 'regionLabel' && type !== 'region';
}

function showMapPdfExportDialog() {
    return new Promise(function(resolve) {
        var modal = document.getElementById('mapPdfExportModal');
        if (!modal) {
            resolve(getDefaultMapPdfExportOptions());
            return;
        }
        var cancelBtn = document.getElementById('mapPdfExportCancel');
        var confirmBtn = document.getElementById('mapPdfExportConfirm');
        var closeBtn = modal.querySelector('.close-map-pdf-export-modal');
        var pageFormatEl = document.getElementById('mapPdfPageFormat');
        var modeInputs = modal.querySelectorAll('input[name="mapPdfMode"]');
        var settled = false;

        function finish(result) {
            if (settled) return;
            settled = true;
            modal.style.display = 'none';
            document.removeEventListener('keydown', onKeyDown);
            resolve(result);
        }

        function readOptions() {
            var mode = 'overview';
            modeInputs.forEach(function(input) {
                if (input.checked) mode = input.value || 'overview';
            });
            if (mode !== 'viewport') mode = 'overview';
            var pageFormat = pageFormatEl && pageFormatEl.value === 'a3' ? 'a3' : 'a4';
            return { mode: mode, pageFormat: pageFormat };
        }

        function onKeyDown(e) {
            if (e.key === 'Escape') finish(null);
        }

        if (cancelBtn) cancelBtn.onclick = function() { finish(null); };
        if (closeBtn) closeBtn.onclick = function() { finish(null); };
        if (confirmBtn) {
            confirmBtn.onclick = function() { finish(readOptions()); };
        }
        modal.onclick = function(e) {
            if (e.target === modal) finish(null);
        };

        modal.style.display = 'block';
        document.addEventListener('keydown', onKeyDown);
        if (confirmBtn) confirmBtn.focus();
    });
}

function getMapPdfCaptureScale(mode) {
    if (mode === 'viewport') {
        return Math.max(1.25, Math.min(2, window.devicePixelRatio || 1.5));
    }
    return Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
}

function getMapPdfCaptureElement() {
    var el = null;
    if (myMap && myMap.container && typeof myMap.container.getElement === 'function') {
        el = myMap.container.getElement();
    }
    if (!el || el.offsetWidth < 8 || el.offsetHeight < 8) {
        el = document.getElementById('map');
    }
    return el;
}

function computeSafeMapPdfCaptureScale(mapEl, desiredScale) {
    var scale = Number(desiredScale);
    if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    if (!mapEl) return scale;
    var maxSide = 4096;
    var w = Math.max(1, mapEl.offsetWidth || mapEl.clientWidth || 1);
    var h = Math.max(1, mapEl.offsetHeight || mapEl.clientHeight || 1);
    var maxByW = maxSide / w;
    var maxByH = maxSide / h;
    var maxScale = Math.min(maxByW, maxByH, 2.5);
    return Math.max(1, Math.min(scale, maxScale));
}

async function waitForMapElementReady(mapEl, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 3000);
    while (Date.now() < deadline) {
        if (mapEl && mapEl.offsetWidth >= 8 && mapEl.offsetHeight >= 8) return true;
        await new Promise(function(resolve) { setTimeout(resolve, 60); });
    }
    return !!(mapEl && mapEl.offsetWidth >= 8 && mapEl.offsetHeight >= 8);
}

function isYmapsTileLikeNode(node) {
    if (!node || !node.className) return false;
    var cls = String(node.className);
    if (cls.indexOf('ymaps') === -1) return false;
    return /tiles|ground|layer|pane/i.test(cls);
}

function stabilizeYmapsDomForHtml2Canvas(rootEl) {
    var restores = [];
    if (!rootEl || !rootEl.querySelectorAll) return function() {};
    var nodes = rootEl.querySelectorAll('*');
    nodes.forEach(function(node) {
        if (!isYmapsTileLikeNode(node) || !node.style) return;
        try {
            var computed = window.getComputedStyle(node);
            var transform = computed.transform || computed.webkitTransform;
            if (!transform || transform === 'none') return;
            var matrixMatch = transform.match(/matrix(3d)?\(([^)]+)\)/);
            if (!matrixMatch) return;
            var parts = matrixMatch[2].split(',').map(function(v) { return parseFloat(v.trim()); });
            if (parts.length < 6) return;
            var tx = parts[4];
            var ty = parts[5];
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
            if (Math.abs(tx) < 0.5 && Math.abs(ty) < 0.5) return;
            restores.push({
                node: node,
                transform: node.style.transform,
                webkitTransform: node.style.webkitTransform,
                left: node.style.left,
                top: node.style.top,
                position: node.style.position
            });
            if (!node.style.position || node.style.position === 'static') {
                node.style.position = 'absolute';
            }
            var left = parseFloat(node.style.left);
            var top = parseFloat(node.style.top);
            node.style.left = (Number.isFinite(left) ? left + tx : tx) + 'px';
            node.style.top = (Number.isFinite(top) ? top + ty : ty) + 'px';
            node.style.transform = 'none';
            node.style.webkitTransform = 'none';
        } catch (eNode) {}
    });
    return function() {
        restores.forEach(function(saved) {
            try {
                saved.node.style.transform = saved.transform;
                saved.node.style.webkitTransform = saved.webkitTransform;
                saved.node.style.left = saved.left;
                saved.node.style.top = saved.top;
                saved.node.style.position = saved.position;
            } catch (eRestore) {}
        });
    };
}

function shouldIgnoreMapPdfCaptureElement(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'iframe' || tag === 'video' || tag === 'script' || tag === 'link') return true;
    if (el.id === 'mapLoadingOverlay') return true;
    return false;
}

function sanitizeMapPdfCaptureClone(clonedRoot) {
    if (!clonedRoot || !clonedRoot.querySelectorAll) return;
    clonedRoot.querySelectorAll('canvas').forEach(function(canvas) {
        if (!canvas || canvas.width < 1 || canvas.height < 1) {
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }
    });
}

async function prepareMapDomForPdfCapture(mapEl) {
    if (myMap && myMap.container && typeof myMap.container.fitToViewport === 'function') {
        try { myMap.container.fitToViewport(); } catch (eFit) {}
    }
    await waitForMapElementReady(mapEl, 2500);
    await new Promise(function(resolve) {
        requestAnimationFrame(function() { requestAnimationFrame(resolve); });
    });
}

async function loadMapPdfImage(url) {
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() { resolve(img); };
        img.onerror = function() { reject(new Error('Image load failed')); };
        img.src = url;
    });
}

function estimateZoomForMapBounds(rect, width, height) {
    if (!rect) return 12;
    var latSpan = Math.max(0.00001, rect.maxLat - rect.minLat);
    var lonSpan = Math.max(0.00001, rect.maxLon - rect.minLon);
    var latMid = (rect.minLat + rect.maxLat) / 2;
    var lonSpanCorrected = lonSpan * Math.cos(latMid * Math.PI / 180);
    var maxSpan = Math.max(latSpan, lonSpanCorrected);
    var worldPx = Math.min(width, height) * 256;
    var zoom = Math.log2(worldPx / maxSpan) - 8;
    return Math.max(3, Math.min(17, Math.round(zoom)));
}

async function captureYandexStaticMapSnapshot(bounds, mapEl) {
    var rect = normalizeMapBoundsRect(bounds);
    if (!rect) return null;
    var width = Math.max(320, Math.min(650, mapEl && mapEl.offsetWidth ? mapEl.offsetWidth : 650));
    var height = Math.max(240, Math.min(450, mapEl && mapEl.offsetHeight ? mapEl.offsetHeight : 450));
    var centerLon = (rect.minLon + rect.maxLon) / 2;
    var centerLat = (rect.minLat + rect.maxLat) / 2;
    var zoom = estimateZoomForMapBounds(rect, width, height);
    var apiKey = '';
    try {
        var resp = await fetch('/api/public-config');
        var config = await resp.json();
        apiKey = config && config.yandexMapsApiKey ? String(config.yandexMapsApiKey).trim() : '';
    } catch (eCfg) {}
    var url = 'https://static-maps.yandex.ru/1.x/?lang=ru_RU&ll='
        + centerLon.toFixed(6) + ',' + centerLat.toFixed(6)
        + '&z=' + zoom + '&l=map&size=' + width + ',' + height;
    if (apiKey && apiKey !== 'YOUR_YANDEX_MAPS_API_KEY') {
        url += '&apikey=' + encodeURIComponent(apiKey);
    }
    var img = await loadMapPdfImage(url);
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return canvas;
}

async function captureMapSnapshot(mapEl, scale) {
    if (!mapEl) throw new Error('Map element is missing');
    await prepareMapDomForPdfCapture(mapEl);
    var desiredScale = computeSafeMapPdfCaptureScale(mapEl, scale);
    var attempts = [desiredScale];
    if (desiredScale > 1.25) attempts.push(1.25);
    if (desiredScale > 1) attempts.push(1);
    var lastError = null;
    for (var i = 0; i < attempts.length; i++) {
        var attemptScale = attempts[i];
        var restoreDom = stabilizeYmapsDomForHtml2Canvas(mapEl);
        var restoreLabelStyles = prepareMapLabelsDomForPdfCapture(mapEl);
        try {
            var canvas = await window.html2canvas(mapEl, {
                backgroundColor: '#ffffff',
                useCORS: true,
                allowTaint: true,
                scale: attemptScale,
                logging: false,
                imageTimeout: 15000,
                width: mapEl.offsetWidth,
                height: mapEl.offsetHeight,
                windowWidth: mapEl.offsetWidth,
                windowHeight: mapEl.offsetHeight,
                scrollX: 0,
                scrollY: 0,
                ignoreElements: shouldIgnoreMapPdfCaptureElement,
                onclone: function(_doc, clonedElement) {
                    sanitizeMapPdfCaptureClone(clonedElement);
                    applyMapPdfLabelStylesInRoot(clonedElement);
                }
            });
            if (canvas && canvas.width > 0 && canvas.height > 0) return canvas;
            lastError = new Error('Empty canvas');
        } catch (eCapture) {
            lastError = eCapture;
        } finally {
            restoreLabelStyles();
            restoreDom();
        }
    }
    throw lastError || new Error('Map capture failed');
}

function getLiveObjectGeoPoints(obj) {
    if (!obj || !obj.geometry || typeof obj.geometry.getCoordinates !== 'function') return [];
    try {
        return collectMapItemGeoPoints({ geometry: obj.geometry.getCoordinates() });
    } catch (eCoords) {
        return [];
    }
}

function isLiveObjectInPdfBounds(obj, boundsRect) {
    if (!boundsRect) return true;
    var pts = getLiveObjectGeoPoints(obj);
    for (var i = 0; i < pts.length; i++) {
        if (isGeoPointInBounds(pts[i][0], pts[i][1], boundsRect)) return true;
    }
    return false;
}

function setPdfExportConnectionLinesVisible(visible) {
    var groups = [];
    if (typeof nodeConnectionLines !== 'undefined') groups.push(nodeConnectionLines);
    if (typeof onuConnectionLines !== 'undefined') groups.push(onuConnectionLines);
    if (typeof oltConnectionLines !== 'undefined') groups.push(oltConnectionLines);
    if (typeof splitterConnectionLines !== 'undefined') groups.push(splitterConnectionLines);
    if (typeof splitterOutputConnectionLines !== 'undefined') groups.push(splitterOutputConnectionLines);
    if (typeof radioBridgeConnectionLines !== 'undefined') groups.push(radioBridgeConnectionLines);
    groups.forEach(function(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(line) {
            if (!line || !line.options) return;
            try { line.options.set('visible', !!visible); } catch (eLine) {}
        });
    });
}

function prepareMapVisibilityForPdfCapture(boundsRect, opts) {
    opts = opts || {};
    var showAll = !!opts.showAll;
    var showAllCables = !!opts.showAllCables;
    var hideObjects = !!opts.hideObjects;
    if (!Array.isArray(objects)) return;
    objects.forEach(function(obj) {
        if (!obj || !obj.options || !obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'region') {
            try { obj.options.set('visible', true); } catch (eRegion) {}
            return;
        }
        if (type === 'cable') {
            if (!showAllCables && !showAll && !isLiveObjectInPdfBounds(obj, boundsRect)) return;
            try {
                obj.options.set('visible', true);
                if (window.CableUnderground && CableUnderground.setOverlaysVisible) {
                    CableUnderground.setOverlaysVisible(obj, true);
                }
            } catch (eCable) {}
            return;
        }
        if (type === 'cableLabel') {
            try { obj.options.set('visible', !hideObjects); } catch (eCableLabel) {}
            return;
        }
        if (!isMapPdfObjectType(type)) return;
        if (hideObjects) {
            try {
                obj.options.set('visible', false);
                var hiddenLabel = obj.properties.get('label');
                if (hiddenLabel && hiddenLabel.options) hiddenLabel.options.set('visible', false);
            } catch (eHideObj) {}
            return;
        }
        if (!showAll && !isLiveObjectInPdfBounds(obj, boundsRect)) return;
        try {
            obj.options.set('visible', true);
            var label = obj.properties.get('label');
            if (label && label.options) label.options.set('visible', true);
        } catch (eObj) {}
    });
    if (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks)) {
        crossGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            if (hideObjects) {
                try {
                    pm.options.set('visible', false);
                    var hiddenLbl = pm.properties && pm.properties.get('crossGroupLabel');
                    if (hiddenLbl && hiddenLbl.options) hiddenLbl.options.set('visible', false);
                } catch (eHideCross) {}
                return;
            }
            if (!showAll && !isLiveObjectInPdfBounds(pm, boundsRect)) return;
            try {
                pm.options.set('visible', true);
                var lbl = pm.properties && pm.properties.get('crossGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', true);
            } catch (eCross) {}
        });
    }
    if (typeof nodeGroupPlacemarks !== 'undefined' && Array.isArray(nodeGroupPlacemarks)) {
        nodeGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            if (hideObjects) {
                try {
                    pm.options.set('visible', false);
                    var hiddenLbl = pm.properties && pm.properties.get('nodeGroupLabel');
                    if (hiddenLbl && hiddenLbl.options) hiddenLbl.options.set('visible', false);
                } catch (eHideNode) {}
                return;
            }
            if (!showAll && !isLiveObjectInPdfBounds(pm, boundsRect)) return;
            try {
                pm.options.set('visible', true);
                var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', true);
            } catch (eNode) {}
        });
    }
    setPdfExportConnectionLinesVisible(!hideObjects);
    if (!hideObjects) {
        try {
            if (typeof updateAllConnectionLines === 'function') updateAllConnectionLines();
        } catch (eLines) {}
    }
    if (!opts.skipConnectionVisibilitySync && typeof applyConnectionLinesVisibility === 'function') {
        applyConnectionLinesVisibility();
    }
    refreshVisibleMapLabelsForPdfCapture(boundsRect, opts);
    applyMapPdfLabelStylesInRoot(document.getElementById('map'));
}

function restoreMapVisibilityAfterPdfExport() {
    if (typeof applyMapFilter === 'function') applyMapFilter();
}

async function waitForMapViewChange(opts) {
    opts = opts || {};
    await new Promise(function(resolve) {
        var done = false;
        var finish = function() {
            if (done) return;
            done = true;
            try {
                if (myMap && myMap.events) myMap.events.remove('actionend', onEnd);
            } catch (eRemove) {}
            resolve();
        };
        var onEnd = function() { finish(); };
        try {
            if (myMap && myMap.events) myMap.events.add('actionend', onEnd);
            if (opts.center && opts.zoom != null && myMap && typeof myMap.setCenter === 'function') {
                myMap.setCenter(opts.center, opts.zoom, { duration: 0 });
            } else if (opts.bounds && myMap && typeof myMap.setBounds === 'function') {
                myMap.setBounds(opts.bounds, {
                    checkZoomRange: true,
                    zoomMargin: opts.zoomMargin != null ? opts.zoomMargin : 55,
                    duration: 0
                });
            }
            setTimeout(finish, opts.timeout || 1700);
        } catch (eFit) {
            finish();
        }
    });
    await new Promise(function(resolve) { setTimeout(resolve, opts.renderDelay || 550); });
}

async function ensureMapPdfMinZoom(minZoom, center) {
    if (!myMap || minZoom == null) return;
    try {
        var z = myMap.getZoom();
        if (z >= minZoom) return;
        var targetCenter = center || myMap.getCenter();
        if (targetCenter && typeof myMap.setCenter === 'function') {
            myMap.setCenter(targetCenter, minZoom, { duration: 0 });
            await new Promise(function(resolve) { setTimeout(resolve, 850); });
        }
    } catch (eZoom) {}
}

async function prepareMapFrameForPdfCapture(boundsRect, minZoom, opts) {
    opts = opts || {};
    if (boundsRect && minZoom != null) {
        var center = [
            (boundsRect.minLat + boundsRect.maxLat) / 2,
            (boundsRect.minLon + boundsRect.maxLon) / 2
        ];
        await ensureMapPdfMinZoom(minZoom, center);
    }
    prepareMapVisibilityForPdfCapture(boundsRect, opts);
    await new Promise(function(resolve) { setTimeout(resolve, opts.renderDelay || 320); });
}

function restoreMapView(center, zoom) {
    if (!center || zoom == null || !myMap) return;
    try { myMap.setCenter(center, zoom, { duration: 0 }); } catch (eRestore) {}
}

function createMapPdfTextHelpers(doc, unicodeFontReady, compact) {
    var cyrMap = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    function toAsciiSafeText(value) {
        var source = String(value == null ? '' : value);
        if (unicodeFontReady) return source;
        var out = '';
        for (var i = 0; i < source.length; i++) {
            var ch = source.charAt(i);
            var lower = ch.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(cyrMap, lower)) {
                var mapped = cyrMap[lower];
                if (ch !== lower) mapped = mapped.charAt(0).toUpperCase() + mapped.slice(1);
                out += mapped;
            } else if (ch.charCodeAt(0) <= 127) {
                out += ch;
            } else {
                out += '?';
            }
        }
        return out;
    }
    var margin = compact ? 24 : 34;
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var y = margin;
    var defaultSize = compact ? 8 : 10;
    var defaultGap = compact ? 10 : 14;
    function ensureSpace(heightNeeded) {
        if (y + heightNeeded > pageH - margin) {
            doc.addPage('a4', 'p');
            y = margin;
        }
    }
    function writeLine(text, size, gap) {
        doc.setFontSize(size || defaultSize);
        ensureSpace((size || defaultSize) + 6);
        doc.text(toAsciiSafeText(text), margin, y);
        y += gap || defaultGap;
    }
    function writeTitle(text, size, gap) {
        doc.setFontSize(size || (compact ? 14 : 18));
        ensureSpace((size || (compact ? 14 : 18)) + 8);
        doc.text(toAsciiSafeText(text), margin, y);
        y += gap || (compact ? 18 : 24);
    }
    return {
        margin: margin,
        pageW: pageW,
        pageH: pageH,
        toAsciiSafeText: toAsciiSafeText,
        writeTitle: writeTitle,
        writeLine: writeLine,
        resetPage: function() { y = margin; },
        addGap: function(extra) { y += extra || 0; }
    };
}

function addMapSnapshotsCompactToPdf(doc, snapshots, pageFormat, meta) {
    if (!snapshots || !snapshots.length) return;
    meta = meta || {};
    var margin = 12;
    var snapshot = snapshots[0];
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var top = margin;

    doc.setFontSize(11);
    doc.text(meta.titleLine || 'Отчёт по карте сети', margin, top + 10);
    if (meta.metaLine) {
        doc.setFontSize(8);
        doc.text(meta.metaLine, margin, top + 22);
    }
    top += 34;

    var captionH = snapshot.caption ? 10 : 0;
    var availW = pageW - margin * 2;
    var availH = pageH - top - margin - captionH;
    var canvas = snapshot.canvas;
    var imgW = availW;
    var imgH = canvas.height * (imgW / canvas.width);
    if (imgH > availH) {
        imgH = availH;
        imgW = canvas.width * (imgH / canvas.height);
    }
    var imgX = margin + (availW - imgW) / 2;
    var imgY = top + captionH + (availH - imgH) / 2;
    if (snapshot.caption) {
        doc.setFontSize(8);
        doc.text(snapshot.caption, margin, top + 8);
    }
    doc.addImage(canvas, 'PNG', imgX, imgY, imgW, imgH);
}

function appendMapPdfReportTables(doc, data, helpers, fullData, listScopeLabel, compact) {
    var mapItems = Array.isArray(data) ? data : [];
    var sourceItems = Array.isArray(fullData) ? fullData : mapItems;
    var cables = mapItems.filter(function(item) { return item && item.type === 'cable'; });
    var objectsOnly = mapItems.filter(function(item) {
        if (!item || !item.type) return false;
        return item.type !== 'cable' && item.type !== 'cableLabel' && item.type !== 'regionLabel';
    });
    var byType = Object.create(null);
    objectsOnly.forEach(function(item) { byType[item.type] = (byType[item.type] || 0) + 1; });
    var objectByIndex = Object.create(null);
    sourceItems.forEach(function(item, index) {
        if (!item || !item.type) return;
        if (item.type === 'cable' || item.type === 'cableLabel' || item.type === 'regionLabel') return;
        objectByIndex[index] = item;
    });
    var objectsTitle = listScopeLabel ? ('Объекты (' + listScopeLabel + ')') : 'Объекты';
    var cablesTitle = listScopeLabel ? ('Кабели (' + listScopeLabel + ')') : 'Кабели';
    var sectionSize = compact ? 10 : 12;
    var lineSize = compact ? 8 : 9;
    var lineGap = compact ? 9 : 12;

    helpers.addGap(compact ? 2 : 6);
    helpers.writeLine('Сводка по типам:', sectionSize, compact ? 12 : 16);
    Object.keys(byType).sort().forEach(function(type) {
        helpers.writeLine('- ' + resolveMapExportObjectTypeLabel(type, true) + ': ' + byType[type], lineSize, compact ? 10 : 13);
    });
    if (Object.keys(byType).length === 0) helpers.writeLine('- Нет данных', lineSize, compact ? 10 : 13);

    helpers.addGap(compact ? 2 : 6);
    helpers.writeLine(objectsTitle, sectionSize, compact ? 12 : 16);
    objectsOnly.forEach(function(item, index) {
        helpers.writeLine(formatMapExportObjectLine(item, index), lineSize, lineGap);
    });
    if (objectsOnly.length === 0) helpers.writeLine('Нет объектов', lineSize, lineGap);

    helpers.addGap(compact ? 2 : 6);
    helpers.writeLine(cablesTitle, sectionSize, compact ? 12 : 16);
    cables.forEach(function(item, index) {
        helpers.writeLine(formatMapExportCableLine(item, objectByIndex, index), lineSize, lineGap);
    });
    if (cables.length === 0) helpers.writeLine('Нет кабелей', lineSize, lineGap);
}

async function openPdfExportWindow(data, exportOptions) {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.html2canvas) {
        showError('PDF-библиотеки не загружены. Обновите страницу и попробуйте снова.', 'Экспорт');
        return false;
    }
    if (!myMap || !myMap.container || typeof myMap.container.getElement !== 'function') {
        showError('Карта недоступна для формирования PDF.', 'Экспорт');
        return false;
    }

    exportOptions = exportOptions || getDefaultMapPdfExportOptions();
    var mode = exportOptions.mode === 'viewport' ? 'viewport' : 'overview';
    var pageFormat = exportOptions.pageFormat === 'a3' ? 'a3' : 'a4';
    var hideObjectsOnSnapshot = mode === 'overview' && shouldHideObjectsOnPdfOverviewSnapshot();
    var modeLabel = MAP_PDF_MODE_LABELS[mode] || MAP_PDF_MODE_LABELS.overview;
    if (hideObjectsOnSnapshot) {
        modeLabel += ' · без объектов на снимке';
    }

    var mapEl = getMapPdfCaptureElement();
    if (!mapEl) {
        showError('Не удалось получить контейнер карты.', 'Экспорт');
        return false;
    }

    var restoreCenter = null;
    var restoreZoom = null;
    try { restoreCenter = myMap.getCenter(); } catch (eCenter) {}
    try { restoreZoom = myMap.getZoom(); } catch (eZoom) {}

    var viewportBounds = mode === 'viewport' ? getMapVisibleBounds() : null;
    var reportData = mode === 'viewport' ? filterMapExportDataByBounds(data, viewportBounds) : data;
    var listScopeLabel = mode === 'viewport' ? 'видимая область' : '';

    var bounds = collectSnapshotBoundsForPdf(data);
    if (mode === 'overview' && !bounds) {
        showWarning('Не удалось определить границы карты. Используется режим «Как на экране».', 'Экспорт');
        mode = 'viewport';
        modeLabel = MAP_PDF_MODE_LABELS.viewport;
        viewportBounds = getMapVisibleBounds();
        reportData = filterMapExportDataByBounds(data, viewportBounds);
        listScopeLabel = 'видимая область';
        hideObjectsOnSnapshot = false;
    }

    var captureScale = getMapPdfCaptureScale(mode);
    var mapSnapshots = [];
    var visibilityOpts = {
        hideObjects: hideObjectsOnSnapshot,
        showAllCables: mode === 'overview',
        showAll: mode === 'overview' && !hideObjectsOnSnapshot,
        skipConnectionVisibilitySync: mode === 'overview' || hideObjectsOnSnapshot
    };
    var snapshotCaption = mode === 'viewport'
        ? 'Текущий вид карты'
        : (hideObjectsOnSnapshot ? 'Обзор (трассы и регионы)' : 'Обзор всей сети');
    beginMapPdfExportCapture();
    try {
        if (mode === 'viewport') {
            await waitForMapViewChange({ renderDelay: 350 });
            await prepareMapFrameForPdfCapture(
                viewportBounds,
                16,
                Object.assign({}, visibilityOpts, { renderDelay: 350 })
            );
            prepareMapVisibilityForPdfCapture(viewportBounds, visibilityOpts);
            mapSnapshots.push({
                canvas: await captureMapSnapshot(mapEl, captureScale),
                caption: snapshotCaption
            });
        } else if (mode === 'overview') {
            await waitForMapViewChange({
                bounds: bounds,
                zoomMargin: 48,
                timeout: 2200,
                renderDelay: hideObjectsOnSnapshot ? 700 : 1000
            });
            await prepareMapFrameForPdfCapture(null, null, Object.assign({}, visibilityOpts, {
                renderDelay: hideObjectsOnSnapshot ? 320 : 500
            }));
            prepareMapVisibilityForPdfCapture(null, visibilityOpts);
            await new Promise(function(resolve) { setTimeout(resolve, hideObjectsOnSnapshot ? 250 : 450); });
            mapSnapshots.push({
                canvas: await captureMapSnapshot(mapEl, captureScale),
                caption: snapshotCaption
            });
        }
    } catch (eCapture) {
        console.error('PDF map capture failed:', eCapture);
        if (mode === 'overview' && bounds) {
            try {
                var fallbackCanvas = await captureYandexStaticMapSnapshot(bounds, mapEl);
                if (fallbackCanvas) {
                    mapSnapshots.push({
                        canvas: fallbackCanvas,
                        caption: 'Обзор (статическая карта)'
                    });
                    showWarning('Снимок интерактивной карты не удался — в PDF добавлена статическая карта. Таблицы объектов и кабелей сохранены.', 'Экспорт');
                }
            } catch (eStatic) {
                console.error('PDF static map fallback failed:', eStatic);
            }
        }
        if (!mapSnapshots.length && viewportBounds) {
            try {
                var viewportFallback = await captureYandexStaticMapSnapshot([
                    [viewportBounds.minLat, viewportBounds.minLon],
                    [viewportBounds.maxLat, viewportBounds.maxLon]
                ], mapEl);
                if (viewportFallback) {
                    mapSnapshots.push({
                        canvas: viewportFallback,
                        caption: 'Видимая область (статическая карта)'
                    });
                    showWarning('Снимок интерактивной карты не удался — в PDF добавлена статическая карта. Таблицы объектов и кабелей сохранены.', 'Экспорт');
                }
            } catch (eViewportStatic) {
                console.error('PDF viewport static map fallback failed:', eViewportStatic);
            }
        }
        if (!mapSnapshots.length) {
            restoreMapView(restoreCenter, restoreZoom);
            restoreMapVisibilityAfterPdfExport();
            endMapPdfExportCapture();
            showError('Не удалось снять скрин карты для PDF. Попробуйте режим «Как на экране» или уменьшите окно браузера.', 'Экспорт');
            return false;
        }
    }

    restoreMapView(restoreCenter, restoreZoom);
    restoreMapVisibilityAfterPdfExport();
    endMapPdfExportCapture();

    if (!mapSnapshots.length) {
        showError('Не удалось сформировать снимок карты для PDF.', 'Экспорт');
        return false;
    }

    var mapItems = Array.isArray(reportData) ? reportData : [];
    var cables = mapItems.filter(function(item) { return item && item.type === 'cable'; });
    var objectsOnly = mapItems.filter(function(item) {
        if (!item || !item.type) return false;
        return item.type !== 'cable' && item.type !== 'cableLabel' && item.type !== 'regionLabel';
    });

    var statsLine = mode === 'viewport'
        ? ('Объектов в видимой области: ' + objectsOnly.length + ' | Кабелей: ' + cables.length)
        : ('Объектов: ' + objectsOnly.length + ' | Кабелей: ' + cables.length);
    var metaLine = new Date().toLocaleString() + ' · ' + statsLine + ' · ' + modeLabel;

    var doc = new window.jspdf.jsPDF({ orientation: 'l', unit: 'pt', format: pageFormat });
    var unicodeFontReady = await ensurePdfUnicodeFont(doc);
    if (!unicodeFontReady) {
        showWarning('Не удалось загрузить шрифт для кириллицы. Проверьте интернет — иначе текст в PDF может быть искажён.', 'Экспорт');
    }

    addMapSnapshotsCompactToPdf(doc, mapSnapshots, pageFormat, {
        titleLine: unicodeFontReady ? 'Отчёт по карте сети' : 'Network map report',
        metaLine: metaLine
    });

    doc.addPage('a4', 'p');
    var helpers = createMapPdfTextHelpers(doc, unicodeFontReady, true);
    appendMapPdfReportTables(doc, reportData, helpers, data, listScopeLabel, true);

    doc.save('network-map-export.pdf');
    return true;
}

function exportData(preferredFormat) {
    if (typeof requireAdmin === 'function' && !requireAdmin()) return;
    var data = getSerializedData();
    var choice = preferredFormat ? String(preferredFormat).trim().toLowerCase() : 'json';

    if (choice === '1' || choice === 'json') {
        downloadTextFile(JSON.stringify(data, null, 2), 'network-map-export.json', 'application/json');
        showSuccess('Карта экспортирована в JSON', 'Экспорт');
        logAction(ActionTypes.EXPORT_DATA, { count: objects.length, format: 'json' });
        return;
    }
    if (choice === 'pdf') {
        showMapPdfExportDialog().then(function(options) {
            if (!options) return null;
            return openPdfExportWindow(data, options).then(function(opened) {
                return opened ? options : null;
            });
        }).then(function(result) {
            if (!result) return;
            showSuccess('PDF-файл сформирован и скачан', 'Экспорт');
            logAction(ActionTypes.EXPORT_DATA, { count: objects.length, format: 'pdf', mode: result.mode });
        }).catch(function() {
            showError('Не удалось сформировать PDF.', 'Экспорт');
        });
        return;
    }

    showWarning('Неизвестный формат. Используйте JSON или PDF.', 'Экспорт');
}

function clearMap(opts) {
    opts = opts || {};
    if (window.CameraPlayer && CameraPlayer.stopStreamMonitor) CameraPlayer.stopStreamMonitor();
    const count = objects.length;
    myMap.geoObjects.removeAll();
    resetMapConnectionLineCaches();
    objects = [];
    selectedObjects = [];
    crossGroupPlacemarks = [];
    nodeGroupPlacemarks = [];
    crossGroupPlacemarkByKey.clear();
    nodeGroupPlacemarkByKey.clear();
    if (typeof MapPerf !== 'undefined') MapPerf.clearObjectsIndex();
    if (!opts.skipSave) {
        saveData({ syncFull: true });
    }
    updateStats();
    
    if (count > 0 && !opts.skipHistory) {
        logAction(ActionTypes.CLEAR_MAP, { count: count });
    }
}
