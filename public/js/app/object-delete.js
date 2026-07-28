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

    if (window.ObjectGallery && ObjectGallery.canHaveGallery(obj)) {
        ObjectGallery.cleanupObjectPhotos(obj);
    }

    var gponImpact = isFiberHostType(objType) ? collectGponImpactFromHost(obj) : null;
    if (!gponImpact && opts && opts.gponImpact) gponImpact = opts.gponImpact;
    var oltGponImpact = (objType === 'olt') ? collectGponImpactFromOlt(obj) : null;
    if (!oltGponImpact && opts && opts.oltGponImpact) oltGponImpact = opts.oltGponImpact;

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
    
    cablesToRemove.forEach(cable => {
        var cableUniqueId = cable.properties.get('uniqueId');
        if (cableUniqueId) {
            deleteCableByUniqueId(cableUniqueId, { skipSync: true, skipRefreshModal: true, deferMapRefresh: true });
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

    var gponRefreshOpts = { deferLineRefresh: true };
    if (isFiberHostType(objType) && gponImpact && gponImpact.hasGpon) {
        forcePurgeGponAfterHostRemoval(gponImpact, gponRefreshOpts);
        gponPurged = true;
    } else if (objType === 'olt' && oltGponImpact && oltGponImpact.hasGpon) {
        forcePurgeGponAfterHostRemoval(oltGponImpact, gponRefreshOpts);
        gponPurged = true;
    }

    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function' && objUniqueId) {
            window.syncSendOp({ type: 'delete_object', uniqueId: objUniqueId });
        }
        saveData({ skipSync: true, undoLabel: 'удаление', coalesce: false });
        logAction(ActionTypes.DELETE_OBJECT, {
            objectType: objType,
            name: objName
        });
    }
    if (!(opts && opts.deferMapRefresh)) {
        var refreshPlan = {};
        if (cablesToRemove.length > 0 || cableRoutesUpdated) refreshPlan.cableVisualization = true;
        if (objType === 'node' && objGroupKey) refreshPlan.nodeGroupKey = objGroupKey;
        else if (objType === 'cross' && objGroupKey) refreshPlan.crossGroupKey = objGroupKey;
        else if (objType === 'cabinet' && typeof updateCabinetDisplay === 'function') updateCabinetDisplay();
        if (gponPurged) {
            refreshPlan.connectionLines = 'full';
        } else if (objUniqueId && (
            (typeof isFiberHostType === 'function' && isFiberHostType(objType)) ||
            objType === 'olt' || objType === 'onu' || objType === 'splitter' ||
            objType === 'mediaConverter' || objType === 'radioBridge' || objType === 'node' ||
            objType === 'support' || objType === 'attachment'
        )) {
            refreshPlan.connectionLines = objUniqueId;
        } else if (cablesToRemove.length > 0 || cableRoutesUpdated) {
            refreshPlan.connectionLines = 'full';
        }
        scheduleObjectDeleteVisualRefresh(refreshPlan);
    }
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
    
    closeInfoModalForDeletedHost((opts && opts.deletedModalUid) || objUniqueId);
}
