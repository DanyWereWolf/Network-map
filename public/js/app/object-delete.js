/**
 * Удаление объектов с карты и GPON-последствия.
 */
function getDeleteObjectConfirmDetails(obj) {
    var fallback = { title: 'Удаление объекта', message: 'Вы уверены, что хотите удалить этот объект?', gponImpact: null };
    if (!obj || !obj.properties) return fallback;
    var objType = obj.properties.get('type');
    var objName = obj.properties.get('name') || '';
    var objUniqueId = obj.properties.get('uniqueId');
    var title = 'Удаление объекта';
    var message = 'Вы уверены, что хотите удалить этот объект?';
    var gponImpact = null;
    var oltGponImpact = null;

    if (objType === 'support') {
        var cablesOnSupport = getCablesThroughSupport(obj);
        if (cablesOnSupport.length > 0) {
            message = cablesOnSupport.length === 1
                ? 'На этой опоре проложен кабель. Удалить опору и кабель?'
                : 'На этой опоре проложено кабелей: ' + cablesOnSupport.length + '. Удалить опору и все эти кабели?';
        }
    } else if (objType === 'attachment') {
        var cablesOnAttachment = getCablesThroughSupport(obj);
        if (cablesOnAttachment.length > 0) {
            message = cablesOnAttachment.length === 1
                ? 'Через это крепление проходит кабель. Удалить крепление и кабель?'
                : 'Через это крепление проходит кабелей: ' + cablesOnAttachment.length + '. Удалить крепление и все эти кабели?';
        }
    } else if (isFiberHostType(objType)) {
        gponImpact = collectGponImpactFromHost(obj);
        var hostDelGen = objType === 'cross' ? 'кросса' : (objType === 'spliceCassette' ? 'сплайс-кассеты' : 'муфты');
        var hostDelPrep = objType === 'cross' ? 'кроссе' : (objType === 'spliceCassette' ? 'сплайс-кассете' : 'муфте');
        var hostDelAcc = objType === 'cross' ? 'кросс' : (objType === 'spliceCassette' ? 'сплайс-кассету' : 'муфту');
        title = 'Удаление ' + hostDelGen;
        if (gponImpact && gponImpact.hasGpon) {
            var splitterConnDel = obj.properties.get('splitterConnections') || {};
            var onuConnDel = obj.properties.get('onuConnections') || {};
            var oltConnDel = obj.properties.get('oltConnections') || {};
            var fiberConnDel = obj.properties.get('fiberConnections') || [];
            var gponParts = [];
            if (Object.keys(oltConnDel).length) gponParts.push('OLT');
            if (Object.keys(splitterConnDel).length) gponParts.push('сплиттер');
            if (Object.keys(onuConnDel).length) gponParts.push('ONU');
            if (fiberConnDel.length) gponParts.push('сращивания жил');
            if (!gponParts.length) gponParts.push('кабели GPON');
            message = 'В ' + hostDelPrep + ' есть GPON-подключения (' + gponParts.join(', ') + ').\n' +
                'Объект будет удалён вместе со всеми связями (сплиттеры, ONU, линии на карте).\n\nУдалить?';
        } else if (objName) {
            message = 'Удалить ' + hostDelAcc + ' «' + objName + '»?';
        } else {
            message = 'Удалить этот ' + hostDelAcc + '?';
        }
    } else if (objType === 'cabinet') {
        var memberN = typeof getCabinetMembers === 'function' ? getCabinetMembers(objUniqueId).length : 0;
        title = 'Удаление ящика';
        if (memberN > 0) {
            message = 'В ящике ' + memberN + ' объект(ов). При удалении ящика оборудование останется на карте в этой точке.\n\nУдалить ящик?';
        } else if (objName) {
            message = 'Удалить ящик «' + objName + '»?';
        } else {
            message = 'Удалить этот ящик?';
        }
    } else if (objType === 'olt') {
        oltGponImpact = collectGponImpactFromOlt(obj);
        title = 'Удаление OLT';
        if (oltGponImpact && oltGponImpact.hasGpon) {
            message = 'OLT подключён к GPON-сети (кабели, муфты, сплиттеры, ONU).\n' +
                'При удалении будут сняты все связанные GPON-подключения и линии на карте.\n\nУдалить OLT?';
        } else if (objName) {
            message = 'Удалить OLT «' + objName + '»?';
        } else {
            message = 'Удалить этот OLT?';
        }
    }
    return { title: title, message: message, gponImpact: gponImpact, oltGponImpact: oltGponImpact };
}

async function confirmAndDeleteObject(obj, opts) {
    if (!obj) return false;
    var details = getDeleteObjectConfirmDetails(obj);
    if (typeof showConfirm === 'function') {
        var ok = await showConfirm(details.message, details.title, { confirmText: 'Удалить', cancelText: 'Отмена' });
        if (!ok) return false;
    }
    var objUniqueId = obj.properties && obj.properties.get('uniqueId');
    var delOpts = Object.assign({}, opts || {}, {
        skipConfirmGpon: true,
        deletedModalUid: objUniqueId
    });
    if (details.gponImpact && details.gponImpact.hasGpon) {
        delOpts.gponImpact = details.gponImpact;
    }
    if (details.oltGponImpact && details.oltGponImpact.hasGpon) {
        delOpts.oltGponImpact = details.oltGponImpact;
    }
    deleteObject(obj, delOpts);
    return true;
}

function deleteObject(obj, opts) {
    
    const objType = obj.properties.get('type');
    const objName = obj.properties.get('name') || '';
    const objUniqueId = obj.properties.get('uniqueId');
    var objGroupKey = null;
    if (obj.geometry && (objType === 'node' || objType === 'cross')) {
        var objCoords = obj.geometry.getCoordinates();
        if (objCoords && objCoords.length >= 2 && typeof objCoords[0] === 'number') {
            objGroupKey = groupKey(objCoords);
        }
    }
    var nodeConnectionsCleared = false;
    var cableRoutesUpdated = false;
    var gponPurged = false;

    if (!(opts && opts.skipSync) && objUniqueId && isObjectLockedByOther(objUniqueId)) {
        if (typeof showWarning === 'function') showWarning('Объект редактирует другой пользователь', 'Удаление недоступно');
        return;
    }

    if (objType === 'cabinet' && objUniqueId && typeof releaseAllCabinetMembers === 'function') {
        releaseAllCabinetMembers(objUniqueId);
    }

    if (!(opts && opts.remoteApply) && window.ObjectGallery && ObjectGallery.canHaveGallery(obj)) {
        ObjectGallery.cleanupObjectPhotos(obj);
    }

    var gponImpact = null;
    var oltGponImpact = null;
    // Remote apply: не считаем GPON-impact (дорого) — линии снимаются точечно, граф почистит idle.
    if (!(opts && opts.remoteApply)) {
        gponImpact = isFiberHostType(objType) ? collectGponImpactFromHost(obj) : null;
        if (!gponImpact && opts && opts.gponImpact) gponImpact = opts.gponImpact;
        oltGponImpact = (objType === 'olt') ? collectGponImpactFromOlt(obj) : null;
        if (!oltGponImpact && opts && opts.oltGponImpact) oltGponImpact = opts.oltGponImpact;
    } else if (opts && opts.gponImpact) {
        gponImpact = opts.gponImpact;
    } else if (opts && opts.oltGponImpact) {
        oltGponImpact = opts.oltGponImpact;
    }

    if (currentModalObject === obj || (objUniqueId && currentModalObject && getObjectUniqueId(currentModalObject) === objUniqueId)) {
        currentModalObject = null;
        closeInfoModal({ force: true });
    }

    if (objType === 'node' && objUniqueId) {
        objects.forEach(function(crossObj) {
            var hostType = crossObj.properties ? crossObj.properties.get('type') : null;
            if (!crossObj.properties || !isFiberHostType(hostType)) return;
            var nodeConnections = crossObj.properties.get('nodeConnections');
            if (!nodeConnections) return;
            var changed = false;
            Object.keys(nodeConnections).forEach(function(key) {
                var conn = nodeConnections[key];
                if (conn && conn.nodeId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        if (conn.switchId != null && conn.switchPort != null) {
                            clearNodeSwitchFiberPortOccupied(obj, conn.switchId, conn.switchPort);
                        }
                        removeNodeConnectionLine(crossObj, cableId, fiberNum);
                        delete nodeConnections[key];
                        changed = true;
                        nodeConnectionsCleared = true;
                    }
                }
            });
            if (changed) crossObj.properties.set('nodeConnections', nodeConnections);
        });
    }
    if (objType === 'olt' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (!isFiberHostType(t)) return;
            var oltConn = slot.properties.get('oltConnections');
            if (!oltConn) return;
            var changed = false;
            Object.keys(oltConn).forEach(function(key) {
                if (oltConn[key] && oltConn[key].oltId === objUniqueId) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed) removeOltConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete oltConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('oltConnections', oltConn);
        });
    }
    if (objType === 'onu' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (!isFiberHostType(t)) return;
            var onuConn = slot.properties.get('onuConnections');
            if (!onuConn) return;
            var changed = false;
            Object.keys(onuConn).forEach(function(key) {
                if (onuConn[key] && onuConn[key].onuId === objUniqueId) {
                    var parsedOnu = parseFiberConnectionKey(key);
                    if (parsedOnu) removeOnuConnectionLine(slot, parsedOnu.cableId, parsedOnu.fiberNumber);
                    delete onuConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('onuConnections', onuConn);
        });
    }
    if (objType === 'mediaConverter' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (!isFiberHostType(t)) return;
            var mcConn = slot.properties.get('mediaConverterConnections');
            if (!mcConn) return;
            var changed = false;
            Object.keys(mcConn).forEach(function(key) {
                if (mcConn[key] && mcConn[key].mediaConverterId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        removeOnuConnectionLine(slot, cableId, fiberNum);
                    }
                    delete mcConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('mediaConverterConnections', mcConn);
        });
    }
    if (objType === 'radioBridge' && objUniqueId && typeof purgeRadioBridgeReferences === 'function') {
        purgeRadioBridgeReferences(objUniqueId);
    }
    if (objType === 'radioBridge' && objUniqueId) {
        if (typeof removeRadioBridgeCoverage === 'function') removeRadioBridgeCoverage(obj);
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (!isFiberHostType(t)) return;
            var rbConn = slot.properties.get('radioBridgeConnections');
            if (!rbConn) return;
            var changed = false;
            Object.keys(rbConn).forEach(function(key) {
                if (rbConn[key] && rbConn[key].radioBridgeId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        removeOnuConnectionLine(slot, cableId, fiberNum);
                    }
                    delete rbConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('radioBridgeConnections', rbConn);
        });
    }
    if (objType === 'splitter' && objUniqueId) {
        var deletedSplitterOutputs = obj.properties.get('outputConnections') || [];
        deletedSplitterOutputs.forEach(function(o) {
            if (!o) return;
            if (o.onuId) {
                var onuFromOutput = getMapObjectByUid(o.onuId, 'onu');
                if (onuFromOutput && onuFromOutput.properties) onuFromOutput.properties.set('incomingFiber', null);
            } else if (o.splitterId) {
                var childSplitter = resolveSplitterObject(o.splitterId);
                if (childSplitter) purgeSplitterGponTree(childSplitter);
            }
        });
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (!isFiberHostType(t)) return;
            var splitterConn = slot.properties.get('splitterConnections');
            if (!splitterConn) return;
            var changed = false;
            Object.keys(splitterConn).forEach(function(key) {
                if (splitterConn[key] && splitterConn[key].splitterId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        removeSplitterConnectionLine(slot, cableId, fiberNum);
                    }
                    delete splitterConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('splitterConnections', splitterConn);
        });
    }

    const label = obj.properties.get('label');
    if (label) {
        myMap.geoObjects.remove(label);
    }
    if (typeof removeObjectLockMapBadge === 'function') {
        try { removeObjectLockMapBadge(obj); } catch (eBadge) {}
    }
    
    if (objType === 'support' || objType === 'attachment' || isFiberHostType(objType)) {
        var waypointUid = getObjectUniqueId(obj);
        for (var ci = 0; ci < objects.length; ci++) {
            var cable = objects[ci];
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            var points = cable.properties.get('points');
            if (!Array.isArray(points) || points.length <= 2) continue;
            var objIdx = -1;
            for (var pi = 0; pi < points.length; pi++) {
                var pt = points[pi];
                if (pt === obj || (waypointUid && pt && getObjectUniqueId(pt) === waypointUid)) {
                    objIdx = pi;
                    break;
                }
            }
            if (objIdx <= 0 || objIdx >= points.length - 1) continue;
            var newPoints = points.filter(function(p, idx) { return idx !== objIdx; });
            cable.properties.set('points', newPoints);
            var newGeometry = [];
            for (var gi = 0; gi < newPoints.length; gi++) {
                var np = newPoints[gi];
                if (np && np.geometry) {
                    var c = np.geometry.getCoordinates();
                    if (c) newGeometry.push(c);
                }
            }
            if (newGeometry.length >= 2 && cable.geometry) {
                cable.geometry.setCoordinates(newGeometry);
                cableRoutesUpdated = true;
            }
        }
    }

    let cablesToRemove = objects.filter(cable => {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        if (cable.properties.get('from') === obj || cable.properties.get('to') === obj) return true;
        return false;
    });
    var removedUniqueIds = [];
    if (objUniqueId) removedUniqueIds.push(objUniqueId);
    cablesToRemove.forEach(function(cable) {
        var cuid = cable.properties && cable.properties.get('uniqueId');
        if (cuid) removedUniqueIds.push(cuid);
    });
    
    cablesToRemove.forEach(cable => {
        var cableUniqueId = cable.properties.get('uniqueId');
        if (cableUniqueId) {
            deleteCableByUniqueId(cableUniqueId, {
                skipSync: true,
                skipRefreshModal: true,
                deferMapRefresh: true,
                remoteApply: !!(opts && opts.remoteApply)
            });
        } else {
            mapPerfUnregister(cable);
            myMap.geoObjects.remove(cable);
            objects = objects.filter(o => o !== cable);
        }
    });
    
    myMap.geoObjects.remove(obj);
    if (objType === 'region' && window.MapRegions && MapRegions.removeRegionLabel) {
        MapRegions.removeRegionLabel(obj, myMap);
    } else {
        const hadLabel = obj.properties && obj.properties.get('label');
        if (hadLabel) try { myMap.geoObjects.remove(hadLabel); } catch (e) {}
    }
    mapPerfUnregister(obj);
    objects = objects.filter(o => o !== obj);
    // После исключения из objects — иначе итерация по objects + getObjectUniqueId
    // могла снова зарегистрировать кросс в MapPerf и вернуть его на карту.
    if (objType === 'cross' && objUniqueId && typeof removeCrossPortPatchesReferencingCross === 'function') {
        removeCrossPortPatchesReferencingCross(objUniqueId);
    }

    if (objUniqueId) {
        if (typeof isFiberHostType === 'function' && isFiberHostType(objType)) {
            removeHostConnectionLines(objUniqueId);
            removeNodeLinesForCross(objUniqueId);
        } else if (objType === 'splitter') {
            removeSplitterOutputLinesForSplitter(objUniqueId);
        }
    }

    var pendingGponImpact = null;
    if (isFiberHostType(objType) && gponImpact && gponImpact.hasGpon) {
        pendingGponImpact = gponImpact;
        gponPurged = true;
    } else if (objType === 'olt' && oltGponImpact && oltGponImpact.hasGpon) {
        pendingGponImpact = oltGponImpact;
        gponPurged = true;
    }

    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function' && objUniqueId) {
            window.syncSendOp({ type: 'delete_object', uniqueId: objUniqueId });
        }
        var saveOpts = { skipSync: true, undoLabel: 'удаление', coalesce: false };
        if (removedUniqueIds.length) saveOpts.removeUniqueIds = removedUniqueIds;
        saveData(saveOpts);
        logAction(ActionTypes.DELETE_OBJECT, {
            objectType: objType,
            name: objName
        });
    } else if (removedUniqueIds.length && typeof patchLastSavedStateRemoveUniqueIds === 'function') {
        // Remote delete: обновить снимок undo без полной сериализации карты.
        try { patchLastSavedStateRemoveUniqueIds(removedUniqueIds); } catch (ePatch) {}
    }

    // GPON-purge (обход графа) — после кадра. На remoteApply не запускаем: иначе другие клиенты зависают.
    if (pendingGponImpact && !(opts && opts.remoteApply) && typeof forcePurgeGponAfterHostRemoval === 'function') {
        var impactToPurge = pendingGponImpact;
        var runGponPurge = function() {
            try {
                forcePurgeGponAfterHostRemoval(impactToPurge, { deferLineRefresh: true });
            } catch (eGpon) {}
            if (!(opts && opts.deferMapRefresh)) {
                scheduleConnectionLinesUpdate('full');
            }
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(function() { setTimeout(runGponPurge, 0); });
        } else {
            setTimeout(runGponPurge, 0);
        }
    } else if (pendingGponImpact && opts && opts.remoteApply) {
        // Лёгкая отложенная зачистка свойств без rebuild всех линий.
        var remoteImpact = pendingGponImpact;
        var runRemoteGponIdle = function() {
            try {
                forcePurgeGponAfterHostRemoval(remoteImpact, { deferLineRefresh: true });
            } catch (eRemoteGpon) {}
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(runRemoteGponIdle, { timeout: 2500 });
        } else {
            setTimeout(runRemoteGponIdle, 500);
        }
    }

    if (!(opts && opts.deferMapRefresh)) {
        var refreshPlan = {};
        if (cablesToRemove.length > 0 || cableRoutesUpdated) refreshPlan.cableVisualization = true;
        if (objType === 'node' && objGroupKey) refreshPlan.nodeGroupKey = objGroupKey;
        else if (objType === 'cross' && objGroupKey) refreshPlan.crossGroupKey = objGroupKey;
        else if (objType === 'cabinet' && typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
        // Линии уже сняты выше (removeHostConnectionLines). Не вызывать полный rebuild.
        if (!gponPurged && !(opts && opts.remoteApply) && (cablesToRemove.length > 0 || cableRoutesUpdated)) {
            refreshPlan.connectionLines = 'full';
        } else if (!gponPurged && !(opts && opts.remoteApply) && objUniqueId && (
            (typeof isFiberHostType === 'function' && isFiberHostType(objType)) ||
            objType === 'olt' || objType === 'onu' || objType === 'splitter' ||
            objType === 'mediaConverter' || objType === 'radioBridge' || objType === 'node' ||
            objType === 'support' || objType === 'attachment'
        )) {
            refreshPlan.connectionLines = objUniqueId;
        }
        scheduleObjectDeleteVisualRefresh(refreshPlan);
    }
    // Сайдбар регионов: collectObjectsInRegion = O(regions×objects) — только при удалении региона.
    if (objType === 'region' && typeof renderRegionsSidebarList === 'function') {
        var renderRegions = function() { renderRegionsSidebarList(); };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(renderRegions, { timeout: 400 });
        } else {
            setTimeout(renderRegions, 0);
        }
    }
    
    closeInfoModalForDeletedHost((opts && opts.deletedModalUid) || objUniqueId);
}

/**
 * Remote delete обычного объекта: сначала только снять с карты (и endpoint-кабели),
 * тяжёлую зачистку свойств/waypoints/GPON — в idle. Иначе другие клиенты зависают после исчезновения.
 */
function applyRemoteDeleteObjectLite(uniqueId) {
    if (uniqueId == null || uniqueId === '') return false;
    var toDel = null;
    for (var i = 0; i < objects.length; i++) {
        var o = objects[i];
        if (!o || !o.properties) continue;
        var t = o.properties.get('type');
        if (!t || t === 'cable' || t === 'cableLabel') continue;
        if (o.properties.get('uniqueId') === uniqueId) {
            toDel = o;
            break;
        }
    }
    if (!toDel) {
        if (typeof patchLastSavedStateRemoveUniqueIds === 'function') {
            try { patchLastSavedStateRemoveUniqueIds([uniqueId]); } catch (eMiss) {}
        }
        return false;
    }

    var objType = toDel.properties.get('type');
    var objUniqueId = uniqueId;
    var delGroupKey = null;
    try {
        if ((objType === 'cross' || objType === 'node') && toDel.geometry && typeof groupKey === 'function') {
            delGroupKey = groupKey(toDel.geometry.getCoordinates());
        }
    } catch (eGk) {}

    if (objType === 'cabinet' && objUniqueId && typeof releaseAllCabinetMembers === 'function') {
        try { releaseAllCabinetMembers(objUniqueId); } catch (eCab) {}
    }

    if (currentModalObject === toDel || (currentModalObject && getObjectUniqueId(currentModalObject) === objUniqueId)) {
        currentModalObject = null;
        if (typeof closeInfoModal === 'function') closeInfoModal({ force: true });
    }

    var cablesToRemove = [];
    for (var ci = 0; ci < objects.length; ci++) {
        var cable = objects[ci];
        if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') continue;
        if (cable.properties.get('from') === toDel || cable.properties.get('to') === toDel) {
            cablesToRemove.push(cable);
        }
    }

    var removedUniqueIds = [objUniqueId];
    var cableUids = [];
    for (var cj = 0; cj < cablesToRemove.length; cj++) {
        var cuid = cablesToRemove[cj].properties.get('uniqueId');
        if (cuid) {
            removedUniqueIds.push(cuid);
            cableUids.push(cuid);
        }
    }

    try {
        var lbl = toDel.properties.get('label');
        if (lbl) myMap.geoObjects.remove(lbl);
    } catch (eLbl) {}
    if (typeof removeObjectLockMapBadge === 'function') {
        try { removeObjectLockMapBadge(toDel); } catch (eBadge) {}
    }
    if (objUniqueId) {
        if (typeof isFiberHostType === 'function' && isFiberHostType(objType)) {
            try { removeHostConnectionLines(objUniqueId); } catch (eH) {}
            try { removeNodeLinesForCross(objUniqueId); } catch (eN) {}
        } else if (objType === 'splitter' && typeof removeSplitterOutputLinesForSplitter === 'function') {
            try { removeSplitterOutputLinesForSplitter(objUniqueId); } catch (eS) {}
        }
        if (typeof purgeConnectionLinesForMissingUid === 'function') {
            try { purgeConnectionLinesForMissingUid(objUniqueId); } catch (eP) {}
        }
    }

    // Endpoint-кабели: только с карты, без sync scrub свойств.
    for (var ck = 0; ck < cablesToRemove.length; ck++) {
        var cab = cablesToRemove[ck];
        try {
            if (window.CableUnderground) CableUnderground.removeAllCableRouteOverlays(cab);
        } catch (eUg) {}
        try { myMap.geoObjects.remove(cab); } catch (eRmC) {}
        try { mapPerfUnregister(cab); } catch (eUnC) {}
    }

    try { myMap.geoObjects.remove(toDel); } catch (eRm) {}
    if (objType === 'region' && window.MapRegions && MapRegions.removeRegionLabel) {
        try { MapRegions.removeRegionLabel(toDel, myMap); } catch (eReg) {}
    }
    try { mapPerfUnregister(toDel); } catch (eUn) {}

    var removeSet = typeof Set !== 'undefined' ? new Set(cablesToRemove.concat([toDel])) : null;
    objects = objects.filter(function(x) {
        if (removeSet) return !removeSet.has(x);
        if (x === toDel) return false;
        for (var r = 0; r < cablesToRemove.length; r++) {
            if (x === cablesToRemove[r]) return false;
        }
        return true;
    });

    if (typeof patchLastSavedStateRemoveUniqueIds === 'function') {
        try { patchLastSavedStateRemoveUniqueIds(removedUniqueIds); } catch (ePatch) {}
    }

    var refreshPlan = { statsIdle: true };
    // Подписи «N каб.» — в idle: getCableGroups на большой карте подвешивает UI сразу после delete.
    if (cablesToRemove.length > 0 && typeof updateCableVisualization === 'function') {
        var runCableViz = function() {
            try { updateCableVisualization({ skipFilter: true }); } catch (eViz) {}
        };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(runCableViz, { timeout: 1200 });
        else setTimeout(runCableViz, 80);
    }
    if (objType === 'cross' && delGroupKey) {
        refreshPlan.crossGroupKey = { full: false, keys: [delGroupKey], skipCableUpdate: true, skipFilter: true };
    } else if (objType === 'node' && delGroupKey) {
        refreshPlan.nodeGroupKey = { full: false, keys: [delGroupKey], skipCableUpdate: true, skipFilter: true };
    }
    if (typeof scheduleObjectDeleteVisualRefresh === 'function') {
        scheduleObjectDeleteVisualRefresh(refreshPlan);
    }

    if (objType === 'region' && typeof renderRegionsSidebarList === 'function') {
        var renderRegions = function() { renderRegionsSidebarList(); };
        if (typeof requestIdleCallback === 'function') requestIdleCallback(renderRegions, { timeout: 600 });
        else setTimeout(renderRegions, 0);
    }

    // Тяжёлая зачистка свойств (waypoints / fiber refs) — после кадра, в idle.
    var idleCleanup = function() {
        for (var u = 0; u < cableUids.length; u++) {
            try { scrubRemoteDeletedCableRefs(cableUids[u]); } catch (eScrub) {}
        }
        try { scrubRemoteDeletedObjectRefs(objUniqueId, objType); } catch (eObj) {}
    };
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(idleCleanup, { timeout: 2500 });
    } else {
        setTimeout(idleCleanup, 200);
    }

    return true;
}

function scrubRemoteDeletedCableRefs(cableUniqueId) {
    if (!cableUniqueId || !objects) return;
    objects.forEach(function(slot) {
        if (!slot || !slot.properties) return;
        var t = slot.properties.get('type');
        if (typeof isFiberHostType === 'function' && isFiberHostType(t)) {
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'radioBridgeConnections',
                'splitterConnections', 'nodeConnections'].forEach(function(prop) {
                var map = slot.properties.get(prop);
                if (!map) return;
                var changed = false;
                Object.keys(map).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete map[key];
                        changed = true;
                    }
                });
                if (changed) slot.properties.set(prop, map);
            });
            var fiberConn = slot.properties.get('fiberConnections');
            if (fiberConn && Array.isArray(fiberConn)) {
                var next = fiberConn.filter(function(conn) {
                    if (!conn) return false;
                    if (conn.from && conn.from.cableId === cableUniqueId) return false;
                    if (conn.to && conn.to.cableId === cableUniqueId) return false;
                    return true;
                });
                if (next.length !== fiberConn.length) slot.properties.set('fiberConnections', next);
            }
            try { removeCableFromUsedFibers(slot, cableUniqueId); } catch (eUf) {}
        }
        if (t === 'olt') {
            var portAssignments = slot.properties.get('portAssignments') || {};
            var paChanged = false;
            Object.keys(portAssignments).forEach(function(portKey) {
                if (portAssignments[portKey] && portAssignments[portKey].cableId === cableUniqueId) {
                    delete portAssignments[portKey];
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignments);
            var incomingFiber = slot.properties.get('incomingFiber');
            if (incomingFiber && incomingFiber.cableId === cableUniqueId) slot.properties.set('incomingFiber', null);
        }
        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === cableUniqueId) slot.properties.set('inputFiber', null);
        }
        if (t === 'onu' || t === 'mediaConverter' || t === 'radioBridge') {
            var inc = slot.properties.get('incomingFiber');
            if (inc && inc.cableId === cableUniqueId) slot.properties.set('incomingFiber', null);
        }
    });
}

function scrubRemoteDeletedObjectRefs(objUniqueId, objType) {
    if (!objUniqueId || !objects) return;
    // Убрать waypoint из маршрутов кабелей (без sync geometry storm — батчем).
    if (objType === 'support' || objType === 'attachment' ||
        (typeof isFiberHostType === 'function' && isFiberHostType(objType))) {
        for (var ci = 0; ci < objects.length; ci++) {
            var cable = objects[ci];
            if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') continue;
            var points = cable.properties.get('points');
            if (!Array.isArray(points) || points.length <= 2) continue;
            var objIdx = -1;
            for (var pi = 0; pi < points.length; pi++) {
                var pt = points[pi];
                if (pt && getObjectUniqueId(pt) === objUniqueId) {
                    objIdx = pi;
                    break;
                }
            }
            if (objIdx <= 0 || objIdx >= points.length - 1) continue;
            var newPoints = points.filter(function(_p, idx) { return idx !== objIdx; });
            cable.properties.set('points', newPoints);
            var newGeometry = [];
            for (var gi = 0; gi < newPoints.length; gi++) {
                var np = newPoints[gi];
                if (np && np.geometry) {
                    var c = np.geometry.getCoordinates();
                    if (c) newGeometry.push(c);
                }
            }
            if (newGeometry.length >= 2 && cable.geometry) {
                try { cable.geometry.setCoordinates(newGeometry); } catch (eGeo) {}
            }
        }
    }
    if (objType === 'node') {
        objects.forEach(function(host) {
            if (!host.properties || !isFiberHostType(host.properties.get('type'))) return;
            var nc = host.properties.get('nodeConnections');
            if (!nc) return;
            var changed = false;
            Object.keys(nc).forEach(function(key) {
                if (nc[key] && nc[key].nodeId === objUniqueId) {
                    delete nc[key];
                    changed = true;
                }
            });
            if (changed) host.properties.set('nodeConnections', nc);
        });
    }
    if (objType === 'olt' || objType === 'onu' || objType === 'splitter' ||
        objType === 'mediaConverter' || objType === 'radioBridge') {
        var propMap = {
            olt: 'oltConnections',
            onu: 'onuConnections',
            splitter: 'splitterConnections',
            mediaConverter: 'mediaConverterConnections',
            radioBridge: 'radioBridgeConnections'
        };
        var prop = propMap[objType];
        var idField = objType === 'mediaConverter' ? 'mediaConverterId'
            : (objType === 'radioBridge' ? 'radioBridgeId' : (objType + 'Id'));
        objects.forEach(function(host) {
            if (!host.properties || !isFiberHostType(host.properties.get('type'))) return;
            var map = host.properties.get(prop);
            if (!map) return;
            var changed = false;
            Object.keys(map).forEach(function(key) {
                if (map[key] && map[key][idField] === objUniqueId) {
                    delete map[key];
                    changed = true;
                }
            });
            if (changed) host.properties.set(prop, map);
        });
    }
}

window.applyRemoteDeleteObjectLite = applyRemoteDeleteObjectLite;
