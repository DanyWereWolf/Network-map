/**
 * Модалки подключения жил к OLT, ONU, узлу.
 */
function showSplitterOutputSplitterDialog(splitterObj, outIdx) {
    syncSplitterInputFromHost(splitterObj);
    var effectiveInput = getSplitterRootInputFiber(splitterObj);
    if (!effectiveInput) {
        showWarning('Сначала подключите входную жилу к сплиттеру с муфты или кросса.', 'Нет входа');
        return;
    }
    var splitters = getAvailableSplittersForSplitterOutput(getObjectUniqueId(splitterObj));
    if (splitters.length === 0) {
        showWarning('Нет свободных сплиттеров. Все сплиттеры уже имеют вход или подключены к выходам.', 'Нет сплиттеров');
        return;
    }
    splitterOutputSplitterModalData = { splitterObj: splitterObj, outIdx: outIdx, splitters: splitters };
    var modal = document.getElementById('splitterOutputSplitterModal');
    var listEl = document.getElementById('splitterOutputSplitterList');
    if (listEl) {
        listEl.innerHTML = '';
        splitters.forEach(function(sp, idx) {
            var name = sp.properties.get('name') || ('Сплиттер ' + (idx + 1));
            var uid = getObjectUniqueId(sp);
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div>';
            div.addEventListener('click', function() { selectSplitterOutputSplitter(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
    }
    if (modal) modal.style.display = 'block';
}

function closeSplitterOutputSplitterModal() {
    var modal = document.getElementById('splitterOutputSplitterModal');
    if (modal) modal.style.display = 'none';
    splitterOutputSplitterModalData = null;
}

function selectSplitterOutputSplitter(splitterIndex) {
    if (!splitterOutputSplitterModalData) return;
    var data = splitterOutputSplitterModalData;
    if (splitterIndex < 0 || splitterIndex >= data.splitters.length) return;
    var targetSplitter = data.splitters[splitterIndex];
    var splitterId = getObjectUniqueId(targetSplitter);
    closeSplitterOutputSplitterModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'splitter', targetSplitter, splitterId);
}

function deleteSplitterOutput(splitterObj, outIdx) {
    if (!splitterObj || splitterObj.properties.get('type') !== 'splitter') return;
    var ratio = parseInt(splitterObj.properties.get('splitRatio'), 10) || 8;
    var outputs = (splitterObj.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    
    var oldOutput = outputs[outIdx];
    if (!oldOutput) return;
    
    if (oldOutput.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === oldOutput.onuId; });
        if (onuObj) {
            onuObj.properties.set('incomingFiber', null);
        }
    } else if (oldOutput.mediaConverterId) {
        var mcObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === oldOutput.mediaConverterId; });
        if (mcObj) mcObj.properties.set('incomingFiber', null);
    } else if (oldOutput.nodeId) {
        var nodeObjDisc = getMapObjectByUid(oldOutput.nodeId, 'node');
        if (nodeObjDisc && oldOutput.switchId != null && oldOutput.switchPort != null) {
            clearNodeSwitchFiberPortOccupied(nodeObjDisc, oldOutput.switchId, oldOutput.switchPort);
        }
    } else if (oldOutput.splitterId) {
        var targetSplitter = resolveSplitterObject(oldOutput.splitterId);
        if (targetSplitter) {
            targetSplitter.properties.set('inputFiber', null);
        }
    }
    
    outputs[outIdx] = null;
    splitterObj.properties.set('outputConnections', outputs);
    if (splitterObj._embedded && splitterObj._host) {
        persistEmbeddedSplittersOnHost(splitterObj._host);
    }
    saveData();
    updateSplitterOutputConnectionLines();
    refreshSplitterUiAfterChange(splitterObj);
}

function initSplitterOutputOnuModal() {
    var modal = document.getElementById('splitterOutputOnuModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-splitter-output-onu');
    var cancelBtn = document.getElementById('cancelSplitterOutputOnu');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterOutputOnuModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterOutputOnuModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterOutputOnuModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterOutputOnuModal();
    });
}

function initSplitterOutputSplitterModal() {
    var modal = document.getElementById('splitterOutputSplitterModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-splitter-output-splitter');
    var cancelBtn = document.getElementById('cancelSplitterOutputSplitter');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterOutputSplitterModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterOutputSplitterModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterOutputSplitterModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterOutputSplitterModal();
    });
}

function showSplitterOutputHostDialog(splitterObj, outIdx) {
    syncSplitterInputFromHost(splitterObj);
    var effectiveInput = getSplitterRootInputFiber(splitterObj);
    if (!effectiveInput) {
        showWarning('Сначала подключите входную жилу к сплиттеру с муфты или кросса.', 'Нет входа');
        return;
    }
    var hosts = getAvailableHostsForSplitterOutput();
    if (!hosts.length) {
        showWarning('На карте нет муфт или кроссов для подключения выхода.', 'Нет объектов');
        return;
    }
    splitterOutputHostModalData = { splitterObj: splitterObj, outIdx: outIdx, phase: 'host', hosts: hosts, selectedHost: null };
    renderSplitterOutputHostModal();
    var modal = document.getElementById('splitterOutputHostModal');
    if (modal) modal.style.display = 'block';
}

function renderSplitterOutputHostModal() {
    var data = splitterOutputHostModalData;
    if (!data) return;
    var listEl = document.getElementById('splitterOutputHostList');
    var titleEl = document.getElementById('splitterOutputHostTitle');
    var hintEl = document.getElementById('splitterOutputHostHint');
    if (!listEl) return;
    if (titleEl) {
        titleEl.textContent = data.phase === 'fiber' ? 'Выбор жилы в муфте/кроссе' : 'Выбор муфты или кросса';
    }
    if (hintEl) {
        hintEl.textContent = data.phase === 'fiber'
            ? 'Выберите свободную жилу — от неё продолжится трассировка по сети.'
            : 'Выберите муфту или кросс, куда пойдёт выход сплиттера.';
    }
    listEl.innerHTML = '';
    var backBtn = document.getElementById('splitterOutputHostBack');
    if (backBtn) backBtn.style.display = data.phase === 'fiber' ? '' : 'none';
    if (data.phase === 'host') {
        data.hosts.forEach(function(host, idx) {
            var t = host.properties.get('type');
            var name = host.properties.get('name') || (t === 'cross' ? 'Кросс' : 'Муфта');
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + ' <span style="color:var(--text-secondary);font-size:0.75rem;">(' + (t === 'cross' ? 'кросс' : 'муфта') + ')</span></div></div>';
            div.addEventListener('click', function() { selectSplitterOutputHost(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
        return;
    }
    var host = data.selectedHost;
    if (!host) return;
    var splitterId = getObjectUniqueId(data.splitterObj);
    var fibers = getAvailableFibersAtHostForSplitterOutput(host, splitterId, data.outIdx);
    if (!fibers.length) {
        listEl.innerHTML = '<div class="node-list-empty"><p>Нет свободных жил в выбранной муфте/кроссе.</p></div>';
        return;
    }
    fibers.forEach(function(opt, idx) {
        var div = document.createElement('div');
        div.className = 'node-list-item';
        div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
        div.dataset.index = String(idx);
        div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(opt.label) + '</div></div>';
        div.addEventListener('click', function() { selectSplitterOutputHostFiber(parseInt(this.dataset.index, 10)); });
        listEl.appendChild(div);
    });
    data.fiberOptions = fibers;
}

function selectSplitterOutputHost(hostIndex) {
    if (!splitterOutputHostModalData || splitterOutputHostModalData.phase !== 'host') return;
    var hosts = splitterOutputHostModalData.hosts || [];
    if (hostIndex < 0 || hostIndex >= hosts.length) return;
    splitterOutputHostModalData.selectedHost = hosts[hostIndex];
    splitterOutputHostModalData.phase = 'fiber';
    renderSplitterOutputHostModal();
}

function selectSplitterOutputHostFiber(fiberIndex) {
    if (!splitterOutputHostModalData || splitterOutputHostModalData.phase !== 'fiber') return;
    var opts = splitterOutputHostModalData.fiberOptions || [];
    if (fiberIndex < 0 || fiberIndex >= opts.length) return;
    var opt = opts[fiberIndex];
    var data = splitterOutputHostModalData;
    var hostObj = data.selectedHost;
    closeSplitterOutputHostModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'host', hostObj, getObjectUniqueId(hostObj), opt.cableId, opt.fiberNumber);
}

function closeSplitterOutputHostModal() {
    var modal = document.getElementById('splitterOutputHostModal');
    if (modal) modal.style.display = 'none';
    splitterOutputHostModalData = null;
}

function initSplitterOutputHostModal() {
    var modal = document.getElementById('splitterOutputHostModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-splitter-output-host');
    var cancelBtn = document.getElementById('cancelSplitterOutputHost');
    var backBtn = document.getElementById('splitterOutputHostBack');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterOutputHostModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterOutputHostModal);
    if (backBtn) backBtn.addEventListener('click', function() {
        if (!splitterOutputHostModalData || splitterOutputHostModalData.phase !== 'fiber') return;
        splitterOutputHostModalData.phase = 'host';
        splitterOutputHostModalData.selectedHost = null;
        splitterOutputHostModalData.fiberOptions = null;
        renderSplitterOutputHostModal();
    });
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterOutputHostModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterOutputHostModal();
    });
}

let oltSelectionModalData = null;

function getAvailableOlts() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'olt'
    );
}

function showOltSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = t === 'cross'
        ? { type: 'oltIncoming', atCrossId: placeId }
        : { type: 'oltIncoming', atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const olts = getAvailableOlts();
    if (olts.length === 0) {
        showWarning('Нет доступных OLT. Сначала создайте OLT на карте.', 'Нет OLT');
        return;
    }
    oltSelectionModalData = { sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, olts: olts };
    const modal = document.getElementById('oltSelectionModal');
    const fiberInfo = document.getElementById('oltSelectionFiberInfo');
    const oltSelect = document.getElementById('oltSelectSelect');
    const confirmBtn = document.getElementById('confirmOltSelection');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' как приход от кросса к OLT';
    if (oltSelect) {
        oltSelect.innerHTML = '<option value="">— выберите OLT</option>';
        olts.forEach((olt, idx) => {
            const name = olt.properties.get('name') || ('OLT ' + (idx + 1));
            const uid = olt.properties.get('uniqueId');
            oltSelect.innerHTML += '<option value="' + escapeHtml(uid) + '">' + escapeHtml(name) + '</option>';
        });
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (modal) modal.style.display = 'block';
}

function closeOltSelectionModal() {
    const modal = document.getElementById('oltSelectionModal');
    if (modal) modal.style.display = 'none';
    oltSelectionModalData = null;
}

function connectFiberToOlt(sleeveObj, cableId, fiberNumber, oltObj) {
    connectFiberToOltWithRoute(sleeveObj, cableId, fiberNumber, oltObj, []);
}

function connectFiberToOltWithRoute(sleeveObj, cableId, fiberNumber, oltObj, routeIds) {
    routeIds = resolveGponRouteIds(routeIds);
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = { type: 'oltIncoming', oltId: getObjectUniqueId(oltObj) };
    if (t === 'cross') opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    var prevIncoming = oltObj.properties.get('incomingFiber');
    var currentPlaceId = sleeveObj.properties.get('uniqueId');
    const oltId = getObjectUniqueId(oltObj);
    if (prevIncoming) {
        var prevKey = fiberConnKey(prevIncoming.cableId, prevIncoming.fiberNumber);
        var existingPlace = null;
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var st = slot.properties.get('type');
            if (st !== 'cross' && st !== 'sleeve') return;
            var oltConn = slot.properties.get('oltConnections') || {};
            if (oltConn[prevKey] && oltConn[prevKey].incoming && oltConn[prevKey].oltId === oltId) {
                existingPlace = slot;
            }
        });
        if (existingPlace && getObjectUniqueId(existingPlace) !== currentPlaceId) {
            var placeName = existingPlace.properties.get('name') || (existingPlace.properties.get('type') === 'cross' ? 'кросс' : 'муфта');
            showError('Приход для этого OLT уже задан с другого места («' + escapeHtml(placeName) + '»). Подключение приходящей жилы возможно только с одного кросса или муфты.', 'OLT уже подключён');
            return;
        }
    }
    var syncObjects = [sleeveObj, oltObj];
    withSuppressedMapSave(function() {
        if (prevIncoming) {
            var prevKeyClear = fiberConnKey(prevIncoming.cableId, prevIncoming.fiberNumber);
            objects.forEach(function(slot) {
                if (!slot.properties) return;
                var st = slot.properties.get('type');
                if (st !== 'cross' && st !== 'sleeve') return;
                var oltConn = cloneHostFiberAssignmentMap(slot.properties.get('oltConnections'));
                if (oltConn[prevKeyClear] && oltConn[prevKeyClear].incoming) {
                    delete oltConn[prevKeyClear];
                    slot.properties.set('oltConnections', oltConn);
                    syncObjects.push(slot);
                }
            });
        }
        oltObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
        setHostFiberAssignment(sleeveObj, 'oltConnections', cableId, fiberNumber, {
            oltId: oltId,
            incoming: true,
            routeIds: routeIds
        });
    });
    createOltConnectionLine(sleeveObj, oltObj, cableId, fiberNumber, routeIds);
    saveLinkedMapObjects(syncObjects);
    savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
    showObjectInfo(sleeveObj);
}

function disconnectFiberFromOlt(sleeveObj, cableId, fiberNumber) {
    var key = fiberConnKey(cableId, fiberNumber);
    var oltConnections = sleeveObj.properties.get('oltConnections') || {};
    var conn = oltConnections[key];
    if (!conn || !conn.oltId) {
        setHostFiberAssignment(sleeveObj, 'oltConnections', cableId, fiberNumber, null);
        saveLinkedMapObjects([sleeveObj]);
        updateOltConnectionLines();
        savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
        showObjectInfo(sleeveObj);
        return;
    }
    var oltObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === conn.oltId; });
    if (conn.incoming && oltObj) {
        oltObj.properties.set('incomingFiber', null);
    } else if (oltObj && conn.portNumber != null) {
        var portAssignments = oltObj.properties.get('portAssignments') || {};
        delete portAssignments[String(conn.portNumber)];
        oltObj.properties.set('portAssignments', portAssignments);
    }
    removeOltConnectionLine(sleeveObj, cableId, fiberNumber);
    setHostFiberAssignment(sleeveObj, 'oltConnections', cableId, fiberNumber, null);
    saveLinkedMapObjects([sleeveObj, oltObj]);
    savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
    showObjectInfo(sleeveObj);
    cleanupGponAssignmentsWithoutOlt();
}

function initOltSelectionModal() {
    const modal = document.getElementById('oltSelectionModal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-olt-selection');
    const cancelBtn = document.getElementById('cancelOltSelection');
    const oltSelect = document.getElementById('oltSelectSelect');
    const confirmBtn = document.getElementById('confirmOltSelection');
    if (closeBtn) closeBtn.addEventListener('click', closeOltSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeOltSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeOltSelectionModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeOltSelectionModal();
    });
    if (oltSelect) {
        oltSelect.addEventListener('change', function() {
            if (confirmBtn) confirmBtn.disabled = !this.value;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (!oltSelectionModalData) return;
            const oltVal = oltSelect && oltSelect.value;
            if (!oltVal) return;
            const oltObj = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltVal);
            if (!oltObj) return;
            const data = oltSelectionModalData;
            closeOltSelectionModal();
            var infoModal = document.getElementById('infoModal');
            if (infoModal) infoModal.style.display = 'none';
            startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'olt', oltObj);
        });
    }
}

