/**
 * Блокировки объектов при совместном редактировании и инкрементальная синхронизация.
 */
var myHeldObjectLockId = null;
var infoModalEditMode = true;
var infoModalEditModeSession = false;

function isObjectLockedByOther(uniqueId) {
    if (!uniqueId || !window.syncIsConnected) return false;
    var locks = window.syncRemoteObjectLocks || {};
    var lock = locks[uniqueId];
    if (!lock || !lock.clientId) return false;
    var myId = window.syncMyClientId;
    return myId ? lock.clientId !== myId : true;
}

function modalIsEditMode() {
    if (!isEditMode) return false;
    if (infoModalEditModeSession) return !!infoModalEditMode;
    return true;
}

function releaseHeldObjectLock() {
    if (!myHeldObjectLockId) return;
    if (typeof window.syncReleaseObjectLock === 'function') {
        window.syncReleaseObjectLock(myHeldObjectLockId);
    }
    myHeldObjectLockId = null;
}

function shouldSkipRemoteModalRefresh(obj) {
    if (!obj || !currentModalObject || currentModalObject !== obj) return false;
    if (!infoModalEditModeSession || !modalIsEditMode()) return false;
    var uid = getObjectUniqueId(obj);
    return !!(uid && myHeldObjectLockId === uid);
}

function applyModalEditModeForObject(obj, callback) {
    infoModalEditModeSession = true;
    if (!isEditMode) {
        infoModalEditMode = false;
        if (typeof callback === 'function') callback();
        return;
    }
    if (!window.syncIsConnected || typeof window.syncRequestObjectLock !== 'function') {
        infoModalEditMode = true;
        if (typeof callback === 'function') callback();
        return;
    }
    var uid = getObjectUniqueId(obj);
    if (!uid) {
        infoModalEditMode = true;
        if (typeof callback === 'function') callback();
        return;
    }
    if (myHeldObjectLockId && myHeldObjectLockId !== uid) {
        releaseHeldObjectLock();
    }
    if (myHeldObjectLockId === uid && !isObjectLockedByOther(uid)) {
        infoModalEditMode = true;
        if (typeof callback === 'function') callback();
        return;
    }
    window.syncRequestObjectLock(uid, function(ok, lockedBy) {
        if (ok && isEditMode) {
            myHeldObjectLockId = uid;
            infoModalEditMode = true;
        } else {
            infoModalEditMode = false;
            if (!ok && myHeldObjectLockId === uid) releaseHeldObjectLock();
            if (!ok && lockedBy && typeof showWarning === 'function') {
                showWarning('Сейчас редактирует: ' + lockedBy, 'Объект занят');
            }
        }
        if (typeof callback === 'function') callback();
    });
}

function updateModalLockBanner(uniqueId) {
    var el = document.getElementById('modalLockBanner');
    if (!el) return;
    var locks = window.syncRemoteObjectLocks || {};
    var lock = uniqueId ? locks[uniqueId] : null;
    var myId = window.syncMyClientId;
    if (lock && myId && lock.clientId !== myId) {
        el.hidden = false;
        el.textContent = 'Редактирует: ' + (lock.displayName || 'другой пользователь');
        el.className = 'object-lock-banner object-lock-banner--remote';
        return;
    }
    if (uniqueId && myHeldObjectLockId === uniqueId && modalIsEditMode()) {
        el.hidden = false;
        el.textContent = 'Вы редактируете этот объект';
        el.className = 'object-lock-banner object-lock-banner--mine';
        return;
    }
    if (!modalIsEditMode() && uniqueId && lock) {
        el.hidden = false;
        el.textContent = 'Только просмотр — редактирует ' + (lock.displayName || 'другой пользователь');
        el.className = 'object-lock-banner object-lock-banner--remote';
        return;
    }
    el.hidden = true;
    el.textContent = '';
}

function applyObjectLocksToMapDraggable() {
    if (!isEditMode) return;
    objects.forEach(function(o) {
        if (!o || !o.properties || !o.options) return;
        var t = o.properties.get('type');
        if (t === 'cable' || t === 'cableLabel' || t === 'crossGroup' || t === 'nodeGroup' || t === 'region') {
            if (t === 'region') try { o.options.set('draggable', false); } catch (eR) {}
            return;
        }
        var uid = getObjectUniqueId(o);
        var locked = uid && isObjectLockedByOther(uid);
        try { o.options.set('draggable', !locked); } catch (e) {}
    });
}

window.onSyncObjectLocks = function() {
    applyObjectLocksToMapDraggable();
    if (currentModalObject) {
        var uid = getObjectUniqueId(currentModalObject);
        updateModalLockBanner(uid);
        if (uid && isObjectLockedByOther(uid) && myHeldObjectLockId !== uid && infoModalEditModeSession) {
            infoModalEditMode = false;
            refreshObjectModal(currentModalObject);
        }
    }
};

var dragHeldLockId = null;

function getMapRevision(obj) {
    if (!obj || !obj.properties) return 0;
    var r = obj.properties.get('mapRevision');
    return r != null && !isNaN(Number(r)) ? Number(r) : 0;
}

function setMapRevision(obj, revision) {
    if (!obj || !obj.properties) return;
    obj.properties.set('mapRevision', revision != null && !isNaN(Number(revision)) ? Number(revision) : 0);
}

/** После add_object сервер ставит revision=1; без этого первый update_object откатывает координаты. */
function bumpMapRevisionAfterSyncAdd(obj) {
    if (!obj || !obj.properties) return;
    setMapRevision(obj, Math.max(getMapRevision(obj), 1));
}

function shouldUseIncrementalSync(opts) {
    if (opts && (opts.syncFull || opts.skipSync)) return false;
    return !!(window.syncIsConnected && typeof window.syncSendOp === 'function');
}

var syncPushDebounceTimers = {};

function flushSyncPushForUid(uniqueId) {
    if (!uniqueId) return;
    var entry = syncPushDebounceTimers[uniqueId];
    if (!entry) return;
    if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
    }
    var target = entry.target;
    syncPushDebounceTimers[uniqueId] = null;
    if (!target || !target.properties) return;
    var t = target.properties.get('type');
    if (t === 'cable') syncPushCableUpdate(target, true);
    else syncPushObjectUpdate(target, true);
}

function scheduleSyncPushForObject(obj) {
    if (!obj || !obj.properties) return;
    var uid = getObjectUniqueId(obj);
    if (!uid) return;
    var prev = syncPushDebounceTimers[uid];
    if (prev && prev.timer) clearTimeout(prev.timer);
    syncPushDebounceTimers[uid] = { target: obj, timer: setTimeout(function() {
        flushSyncPushForUid(uid);
    }, 350) };
}

function syncPushObjectUpdate(obj, immediate) {
    if (!obj || !obj.properties) return false;
    var t = obj.properties.get('type');
    if (!t || t === 'cable' || t === 'cableLabel') return false;
    if (!immediate) {
        scheduleSyncPushForObject(obj);
        return true;
    }
    var data = serializeMapItemFromObject(obj);
    if (!data || !data.uniqueId) return false;
    var baseRevision = getMapRevision(obj);
    delete data.revision;
    if (typeof window.syncSendOp === 'function') {
        window.syncSendOp({
            type: 'update_object',
            uniqueId: data.uniqueId,
            baseRevision: baseRevision,
            data: data
        });
        setMapRevision(obj, baseRevision + 1);
        return true;
    }
    return false;
}

function syncPushCableUpdate(cable, immediate) {
    if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
    if (!immediate) {
        scheduleSyncPushForObject(cable);
        return true;
    }
    var data = serializeMapItemFromObject(cable);
    if (!data || !data.uniqueId) return false;
    var baseRevision = getMapRevision(cable);
    delete data.revision;
    if (typeof window.syncSendOp === 'function') {
        window.syncSendOp({
            type: 'update_cable',
            uniqueId: data.uniqueId,
            baseRevision: baseRevision,
            data: data
        });
        setMapRevision(cable, baseRevision + 1);
        return true;
    }
    return false;
}

function saveObjectWithConnectedCables(obj) {
    if (!obj || !obj.properties) {
        saveData();
        return;
    }
    var toSave = [obj];
    if (typeof getCablesTouchingObject === 'function') {
        getCablesTouchingObject(obj).forEach(function(cable) {
            if (!cable || toSave.indexOf(cable) !== -1) return;
            ensurePlacemarkUniqueIdForSync(cable);
            toSave.push(cable);
        });
    }
    saveLinkedMapObjects(toSave);
}

function captureObjectDragStartState(obj) {
    if (!obj || !obj.properties || !obj.geometry) return;
    try {
        var c = obj.geometry.getCoordinates();
        if (!c || c.length < 2 || typeof c[0] !== 'number') return;
        obj.properties.set('_preDragCoords', [c[0], c[1]]);
        if (typeof groupKey === 'function') {
            obj.properties.set('_preDragGroupKey', groupKey(c));
        }
    } catch (e) {}
}

function getObjectDragGroupScope(obj) {
    var keys = [];
    var preKey = obj && obj.properties ? obj.properties.get('_preDragGroupKey') : null;
    if (preKey) keys.push(preKey);
    try {
        if (obj && obj.geometry && typeof groupKey === 'function') {
            var newKey = groupKey(obj.geometry.getCoordinates());
            if (newKey && keys.indexOf(newKey) < 0) keys.push(newKey);
        }
    } catch (e) {}
    return keys.length ? keys : null;
}

function clearObjectDragStartState(obj) {
    if (!obj || !obj.properties) return;
    try {
        obj.properties.set('_preDragCoords', null);
        obj.properties.set('_preDragGroupKey', null);
    } catch (e) {}
}

/** Лёгкий finalize после dragend: без полного applyMapFilter / полной пересборки карты. */
function finalizeMapObjectDragEnd(placemark) {
    if (!placemark || !placemark.properties) return;
    var type = placemark.properties.get('type');
    var uid = placemark.properties.get('uniqueId');
    var groupScope = (type === 'cross' || type === 'node') ? getObjectDragGroupScope(placemark) : null;
    clearObjectDragStartState(placemark);

    var skipGroupSnap = typeof shouldSkipGroupSnapAfterPlacement === 'function' && shouldSkipGroupSnapAfterPlacement(placemark);
    if ((type === 'cross' || type === 'node') && !skipGroupSnap && typeof snapCoordsToObjectGroup === 'function') {
        if (!(typeof onMemberObjectDragEnd === 'function' && onMemberObjectDragEnd(placemark))) {
            var snappedCoords = snapCoordsToObjectGroup(placemark.geometry.getCoordinates(), type, placemark);
            placemark.geometry.setCoordinates(snappedCoords);
            if (groupScope && typeof groupKey === 'function') {
                try {
                    var snappedKey = groupKey(snappedCoords);
                    if (snappedKey && groupScope.indexOf(snappedKey) < 0) groupScope.push(snappedKey);
                } catch (eSnapKey) {}
            }
        }
    } else if (typeof onMemberObjectDragEnd === 'function') {
        onMemberObjectDragEnd(placemark);
    }

    if (typeof updateConnectedCables === 'function') updateConnectedCables(placemark);
    if (typeof MapPerf !== 'undefined' && MapPerf.updateSpatialPosition) MapPerf.updateSpatialPosition(placemark);
    var label = placemark.properties.get('label');
    if (label && placemark.geometry) {
        try { label.geometry.setCoordinates(placemark.geometry.getCoordinates()); } catch (eLbl) {}
    }
    if (typeof scheduleConnectionLinesUpdate === 'function') scheduleConnectionLinesUpdate();
    if (typeof updateSelectionPulsePosition === 'function') updateSelectionPulsePosition(placemark);

    if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(placemark);
    else saveData({ object: placemark, syncImmediate: true });

    if (type === 'cross' && typeof updateCrossDisplay === 'function') {
        updateCrossDisplay(groupScope);
    } else if (type === 'node' && typeof updateNodeDisplay === 'function') {
        updateNodeDisplay(groupScope);
    } else if (type === 'cabinet' && typeof onCabinetDragEnd === 'function') {
        onCabinetDragEnd(placemark);
    }

    if (type !== 'cross' && type !== 'node') {
        if (typeof applyMapFilterForObject === 'function') {
            applyMapFilterForObject(placemark);
            if (typeof getCablesTouchingObject === 'function') {
                getCablesTouchingObject(placemark).forEach(function(cable) {
                    applyMapFilterForObject(cable);
                });
            }
        } else if (typeof applyMapFilter === 'function') {
            applyMapFilter();
        }
    }

    // Подпись снимается на drag — вернуть сразу (в т.ч. при virtualization), не ждать pan/sync.
    if (typeof ensureObjectLabelOnMap === 'function') ensureObjectLabelOnMap(placemark);

    releaseDragObjectLock(uid);
    if (typeof MapPerf !== 'undefined' && MapPerf.unpinObject) MapPerf.unpinObject(placemark);

    var deferDragSideEffects = function() {
        if (typeof renderRegionsSidebarList === 'function') {
            try { renderRegionsSidebarList(); } catch (eReg) {}
        }
        if (typeof window.syncApplyPendingState === 'function') {
            try { window.syncApplyPendingState(); } catch (eSync) {}
        }
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function() {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(deferDragSideEffects, { timeout: 120 });
            } else {
                setTimeout(deferDragSideEffects, 0);
            }
        });
    } else {
        setTimeout(deferDragSideEffects, 0);
    }

    if (typeof resumeMapPanAfterPlacementObjectDrag === 'function') resumeMapPanAfterPlacementObjectDrag();
}

function saveLinkedMapObjects(objectsToSave) {
    if (!objectsToSave || !objectsToSave.length) {
        saveData();
        return;
    }
    var seen = {};
    var list = [];
    for (var i = 0; i < objectsToSave.length; i++) {
        var o = objectsToSave[i];
        if (!o || !o.properties) continue;
        var uid = getObjectUniqueId(o);
        if (!uid || seen[uid]) continue;
        seen[uid] = true;
        list.push(o);
    }
    saveData(list.length ? { objects: list, syncImmediate: true } : {});
}

function pushSaveDataToSync(opts) {
    opts = opts || {};
    if (opts.syncFull) {
        if (opts.persistHttp && Array.isArray(opts.state) && typeof getApiBase === 'function' && getApiBase()) {
            var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            var payload = JSON.stringify({
                data: opts.state,
                allowShrink: !!opts.allowShrink
            });
            fetch(getApiBase() + '/api/map', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? ('Bearer ' + token) : ''
                },
                body: payload
            }).catch(function(e) {
                console.warn('[Save] HTTP map persist failed, falling back to WS state', e);
                if (typeof window.syncSendState === 'function') {
                    window.syncSendState(opts.state);
                }
            });
            // Peers get map_refresh from the POST handler; avoid blasting full WS state.
            return;
        }
        if (typeof window.syncSendState === 'function') {
            window.syncSendState(opts.state || getSerializedData());
        }
        return;
    }
    if (!shouldUseIncrementalSync(opts)) {
        if (!opts.skipSync && typeof window.syncSendState === 'function') {
            window.syncSendState(getSerializedData());
        }
        return;
    }
    if (opts && opts.object) {
        syncPushObjectUpdate(opts.object, !!opts.syncImmediate);
        return;
    }
    if (opts && opts.cable) {
        syncPushCableUpdate(opts.cable, !!opts.syncImmediate);
        return;
    }
    if (opts && opts.objects && opts.objects.length) {
        for (var i = 0; i < opts.objects.length; i++) {
            var syncObj = opts.objects[i];
            if (!syncObj || !syncObj.properties) continue;
            if (syncObj.properties.get('type') === 'cable') {
                syncPushCableUpdate(syncObj, !!opts.syncImmediate);
            } else {
                syncPushObjectUpdate(syncObj, !!opts.syncImmediate);
            }
        }
        return;
    }
    if (opts && opts.cables && opts.cables.length) {
        for (var j = 0; j < opts.cables.length; j++) syncPushCableUpdate(opts.cables[j], !!opts.syncImmediate);
        return;
    }
    if (currentModalObject && currentModalObject.properties) {
        var mt = currentModalObject.properties.get('type');
        if (mt === 'cable') syncPushCableUpdate(currentModalObject, !!opts.syncImmediate);
        else syncPushObjectUpdate(currentModalObject, !!opts.syncImmediate);
        return;
    }
    if (typeof window.syncSendState === 'function') {
        if (typeof window.syncShouldSendFullState === 'function' && !window.syncShouldSendFullState()) return;
        window.syncSendState(getSerializedData());
    }
}

function acquireDragObjectLock(obj) {
    if (!obj || !window.syncIsConnected || typeof window.syncRequestObjectLock !== 'function') return;
    var uid = getObjectUniqueId(obj);
    if (!uid || isObjectLockedByOther(uid)) return;
    if (myHeldObjectLockId === uid) {
        dragHeldLockId = uid;
        return;
    }
    window.syncRequestObjectLock(uid, function(ok) {
        if (ok) {
            dragHeldLockId = uid;
            if (!myHeldObjectLockId) myHeldObjectLockId = uid;
        }
    });
}

function releaseDragObjectLock(uid) {
    if (!uid) return;
    var modal = document.getElementById('infoModal');
    if (currentModalObject && getObjectUniqueId(currentModalObject) === uid && isInfoModalVisible(modal)) {
        dragHeldLockId = null;
        return;
    }
    if (dragHeldLockId === uid) dragHeldLockId = null;
    if (myHeldObjectLockId === uid) releaseHeldObjectLock();
}

window.onSyncOpConflict = function(payload) {
    if (!payload || !payload.uniqueId) return;
    var isOtherEditor = !!(payload.editorClientId && window.syncMyClientId &&
        payload.editorClientId !== window.syncMyClientId);
    if (payload.data) {
        var conflictObj = objects.find(function(o) {
            return o.properties && o.properties.get('uniqueId') === payload.uniqueId;
        });
        if (conflictObj) {
            if (!isOtherEditor) {
                if (payload.revision != null) setMapRevision(conflictObj, payload.revision);
            } else {
                var t = conflictObj.properties.get('type');
                if (t === 'cable') applySerializedCableToMap(conflictObj, payload.data);
                else populatePlacemarkFromSerializedData(conflictObj, payload.data);
            }
        }
    }
    if (!isOtherEditor) return;
    if (currentModalObject && getObjectUniqueId(currentModalObject) === payload.uniqueId) {
        if (typeof showWarning === 'function') {
            showWarning('Пока вы редактировали, объект изменил другой участник. Карточка обновлена.', 'Обновление с сервера');
        }
        refreshObjectModal(currentModalObject);
    }
};
