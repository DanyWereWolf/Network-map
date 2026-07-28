/**
 * Удаление кабелей с карты.
 */
function getDeleteCableConfirmDetails(cableUniqueId) {
    var cable = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cable' && obj.properties.get('uniqueId') === cableUniqueId;
    });
    var title = 'Удаление кабеля';
    var cableName = cable ? (cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'))) : '';
    var message = cableName ? ('Удалить кабель «' + cableName + '»?') : 'Удалить этот кабель?';
    var oltImpact = getCableOltImpact(cableUniqueId);
    if (oltImpact.ports || oltImpact.incoming) {
        var msgParts = [];
        if (oltImpact.incoming) msgParts.push('приход OLT');
        if (oltImpact.ports) msgParts.push('PON-порты OLT');
        message = 'Кабель участвует в подключении к OLT (' + msgParts.join(', ') + ').\n' +
            'Кабель и все связанные привязки (ONU, сплиттеры) будут удалены.\n\nУдалить?';
    }
    return { title: title, message: message };
}

async function confirmAndDeleteCableImpl(cableUniqueId, opts) {
    if (!cableUniqueId) return false;
    var details = getDeleteCableConfirmDetails(cableUniqueId);
    if (typeof showConfirm === 'function') {
        var ok = await showConfirm(details.message, details.title, { confirmText: 'Удалить', cancelText: 'Отмена' });
        if (!ok) return false;
    }
    deleteCableByUniqueId(cableUniqueId, opts);
    return true;
}

function confirmAndDeleteCable(cableUniqueId, opts) {
    void confirmAndDeleteCableImpl(cableUniqueId, opts);
}

window.confirmAndDeleteCable = confirmAndDeleteCable;

var cableDeleteDelegationBound = false;
function bindCableDeleteDelegation() {
    if (cableDeleteDelegationBound) return;
    var modalInfo = document.getElementById('modalInfo');
    if (!modalInfo) return;
    cableDeleteDelegationBound = true;
    modalInfo.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-action="delete-cable"]');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        var uid = btn.getAttribute('data-cable-id');
        if (uid) void confirmAndDeleteCableImpl(uid);
    });
}

function deleteCableByUniqueId(cableUniqueId, opts) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (!cable) return;

    if (!(opts && opts.skipSync) && cableUniqueId && isObjectLockedByOther(cableUniqueId)) {
        if (typeof showWarning === 'function') showWarning('Кабель редактирует другой пользователь', 'Удаление недоступно');
        return;
    }

    clearCopperCableOccupancyForCableId(cableUniqueId);

    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    const cableType = getCableDescription(cable.properties.get('cableType'));
    const fromName = fromObj ? (fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type'))) : '?';
    const toName = toObj ? (toObj.properties.get('name') || getObjectTypeName(toObj.properties.get('type'))) : '?';

    if (fromObj) {
        removeCableFromUsedFibers(fromObj, cableUniqueId);
    }
    if (toObj) {
        removeCableFromUsedFibers(toObj, cableUniqueId);
    }
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (isFiberHostType(t)) {
            var oltConn = slot.properties.get('oltConnections');
            var onuConn = slot.properties.get('onuConnections');
            var mcConn = slot.properties.get('mediaConverterConnections');
            var rbConn = slot.properties.get('radioBridgeConnections');
            var splitterConn = slot.properties.get('splitterConnections');
            var nodeConn = slot.properties.get('nodeConnections');
            var fiberConn = slot.properties.get('fiberConnections');
            var changed = false;
            if (oltConn) {
                Object.keys(oltConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete oltConn[key];
                        changed = true;
                    }
                });
            }
            if (onuConn) {
                Object.keys(onuConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete onuConn[key];
                        changed = true;
                    }
                });
            }
            if (mcConn) {
                Object.keys(mcConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete mcConn[key];
                        changed = true;
                    }
                });
            }
            if (rbConn) {
                Object.keys(rbConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete rbConn[key];
                        changed = true;
                    }
                });
            }
            if (splitterConn) {
                Object.keys(splitterConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete splitterConn[key];
                        changed = true;
                    }
                });
            }
            if (nodeConn) {
                Object.keys(nodeConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete nodeConn[key];
                        changed = true;
                    }
                });
            }
            if (fiberConn && Array.isArray(fiberConn)) {
                var newFiberConn = fiberConn.filter(function(conn) {
                    if (!conn) return false;
                    var fromMatch = conn.from && conn.from.cableId === cableUniqueId;
                    var toMatch = conn.to && conn.to.cableId === cableUniqueId;
                    return !fromMatch && !toMatch;
                });
                if (newFiberConn.length !== fiberConn.length) {
                    slot.properties.set('fiberConnections', newFiberConn);
                    changed = true;
                }
            }
            if (changed) {
                if (oltConn) slot.properties.set('oltConnections', oltConn);
                if (onuConn) slot.properties.set('onuConnections', onuConn);
                if (mcConn) slot.properties.set('mediaConverterConnections', mcConn);
                if (rbConn) slot.properties.set('radioBridgeConnections', rbConn);
                if (splitterConn) slot.properties.set('splitterConnections', splitterConn);
                if (nodeConn) slot.properties.set('nodeConnections', nodeConn);
            }
        }
        if (t === 'olt') {
            var portAssignments = slot.properties.get('portAssignments') || {};
            var incomingFiber = slot.properties.get('incomingFiber');
            var paChanged = false;
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === cableUniqueId) {
                    delete portAssignments[portKey];
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignments);
            if (incomingFiber && incomingFiber.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            var outputConnections = slot.properties.get('outputConnections');
            if (inputFiber && inputFiber.cableId === cableUniqueId) {
                slot.properties.set('inputFiber', null);
            }
            if (outputConnections && Array.isArray(outputConnections)) {
                var newOutputConn = outputConnections.map(function(conn) {
                    if (conn && conn.cableId === cableUniqueId) {
                        return { onuId: conn.onuId, splitterId: conn.splitterId };
                    }
                    return conn;
                });
                slot.properties.set('outputConnections', newOutputConn);
            }
        }
        if (t === 'onu') {
            var onuIncoming = slot.properties.get('incomingFiber');
            if (onuIncoming && onuIncoming.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
        if (t === 'mediaConverter') {
            var mcIncomingDel = slot.properties.get('incomingFiber');
            if (mcIncomingDel && mcIncomingDel.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
        if (t === 'radioBridge') {
            var rbIncomingDel = slot.properties.get('incomingFiber');
            if (rbIncomingDel && rbIncomingDel.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
    });

    if (window.CableUnderground) CableUnderground.removeAllCableRouteOverlays(cable);
    myMap.geoObjects.remove(cable);
    objects = objects.filter(o => o !== cable);
    
    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function') {
            window.syncSendOp({ type: 'delete_cable', uniqueId: cableUniqueId });
        }
        var cableSaveOpts = { skipSync: true, undoLabel: 'удаление кабеля', coalesce: false };
        if (cableUniqueId) cableSaveOpts.removeUniqueIds = [cableUniqueId];
        saveData(cableSaveOpts);
        logAction(ActionTypes.DELETE_CABLE, {
            cableType: cableType,
            from: fromName,
            to: toName
        });
    }

    if (!(opts && opts.deferMapRefresh)) {
        updateCableVisualization({ skipFilter: true });
        scheduleConnectionLinesUpdate();
        cleanupGponAssignmentsWithoutOlt({ deferLineRefresh: true });
        if (typeof updateStats === 'function') {
            setTimeout(function() { updateStats(); }, 0);
        }
    }

    const modal = document.getElementById('infoModal');
    if (isInfoModalVisible(modal)) {
        var modalTitleEl = document.getElementById('modalTitle');
        var isTraceModal = modalTitleEl && modalTitleEl.textContent && modalTitleEl.textContent.toLowerCase().indexOf('трассировка') !== -1;
        if (currentModalObject === cable || isTraceModal) {
            closeInfoModal();
        }
    }

    if (!(opts && opts.skipRefreshModal) && currentModalObject && currentModalObject !== cable) {
        if (currentModalObject.properties && isObjectOnMap(currentModalObject)) {
            const objType = currentModalObject.properties.get('type');
            if (objType !== 'cable') {
                refreshObjectModal(currentModalObject);
            }
        }
    }
}
