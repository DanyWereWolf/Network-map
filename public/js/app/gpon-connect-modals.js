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
    var outsSp = splitterObj.properties.get('outputConnections') || [];
    var outSp = outsSp[outIdx];
    if (outSp && outSp.splitterId) {
        showWarning('На выходе уже подключён сплиттер.', 'Выход занят');
        return;
    }
    if (outSp && typeof splitterOutputHasEndpoint === 'function' && splitterOutputHasEndpoint(outSp)) {
        showWarning('Этот выход уже подключён.', 'Выход занят');
        return;
    }
    if (outSp && outSp.hostId && outSp.cableId && outSp.fiberNumber != null) {
        showWarning('Выход уже направлен в муфту/кросс. Сначала отключите трассу.', 'Выход занят');
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
    var outsHost = splitterObj.properties.get('outputConnections') || [];
    var outHost = outsHost[outIdx];
    if (outHost && outHost.splitterId) {
        showWarning('На выходе уже подключён сплиттер.', 'Выход занят');
        return;
    }
    if (outHost && typeof splitterOutputHasEndpoint === 'function' && splitterOutputHasEndpoint(outHost)) {
        showWarning('Этот выход уже подключён.', 'Выход занят');
        return;
    }
    if (outHost && outHost.hostId && outHost.cableId && outHost.fiberNumber != null) {
        showWarning('Выход уже направлен в муфту/кросс.', 'Выход занят');
        return;
    }
    if (outHost && outHost.crossPort != null) {
        showWarning('Выход уже выведен на порт кросса.', 'Выход занят');
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

function getAvailableOltsForIncoming() {
    return getAvailableOlts().filter(function(oltObj) {
        if (typeof getDisplayOltIncomingFiber === 'function') {
            var incoming = getDisplayOltIncomingFiber(oltObj);
            return !(incoming && incoming.cableId);
        }
        var direct = oltObj.properties.get('incomingFiber');
        return !(direct && direct.cableId);
    });
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
    if (typeof getFiberOltRealAssignment === 'function') {
        var existingOltDlg = getFiberOltRealAssignment(sleeveObj, cableId, fiberNumber);
        if (existingOltDlg && existingOltDlg.oltId) {
            showWarning('Жила уже связана с OLT.', 'Жила занята');
            return;
        }
    }
    const olts = getAvailableOltsForIncoming();
    if (olts.length === 0) {
        var hasAnyOlt = getAvailableOlts().length > 0;
        showWarning(
            hasAnyOlt
                ? 'Нет свободных OLT. У всех OLT на карте уже задан приход — сначала отключите текущий приход.'
                : 'Нет доступных OLT. Сначала создайте OLT на карте.',
            'Нет OLT'
        );
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
    if (isCrossLikeHostType(t)) opts.atCrossId = placeId; else opts.atSleeveId = placeId;
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
            if (!isFiberHostType(st)) return;
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
                if (!isFiberHostType(st)) return;
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

function setOltCrossSelectionModalChrome(titleText, listLabel, searchPlaceholder) {
    var modal = document.getElementById('nodeSelectionModal');
    if (!modal) return;
    var title = modal.querySelector('.group-balloon-title');
    if (title) title.textContent = titleText || 'Подключение PON-порта к кроссу';
    var labels = modal.querySelectorAll('.modal-body .form-group > label');
    if (labels[0]) labels[0].textContent = 'Поиск кросса';
    if (labels[1]) labels[1].textContent = listLabel || 'Выберите кросс';
    var searchInput = document.getElementById('nodeSearchInput');
    if (searchInput) searchInput.placeholder = searchPlaceholder || 'Введите имя кросса...';
}

function refreshOltCrossConnectModalCrosses() {
    if (!nodeSelectionModalData || nodeSelectionModalData.mode !== 'oltCrossConnect') return [];
    var crosses = typeof getAvailableCrossesForOltPort === 'function'
        ? getAvailableCrossesForOltPort(nodeSelectionModalData.oltObj, nodeSelectionModalData.portNumber)
        : (typeof getMapCrossObjects === 'function' ? getMapCrossObjects() : []);
    nodeSelectionModalData.crosses = crosses;
    return crosses;
}

function renderOltCrossListForModal(crosses, searchQuery) {
    var nodeListContainer = document.getElementById('nodeListContainer');
    if (!nodeListContainer) return;
    if (!crosses || !crosses.length) {
        nodeListContainer.innerHTML = '<div class="node-list-empty"><p>На карте нет кроссов</p></div>';
        return;
    }
    var query = (searchQuery || '').toLowerCase().trim();
    var filtered = query ? crosses.filter(function(cross) {
        var name = (cross.properties.get('name') || 'Кросс').toLowerCase();
        return name.indexOf(query) !== -1;
    }) : crosses;
    if (!filtered.length) {
        nodeListContainer.innerHTML = '<div class="node-list-no-results">Кроссы не найдены по запросу «' + escapeHtml(searchQuery) + '»</div>';
        return;
    }
    var html = '';
    filtered.forEach(function(cross) {
        var crossUid = cross.properties.get('uniqueId') || '';
        var name = cross.properties.get('name') || 'Кросс';
        var coords = cross.geometry && cross.geometry.getCoordinates ? cross.geometry.getCoordinates() : null;
        var coordsStr = coords ? (coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)) : '';
        var displayName = escapeHtml(name);
        if (query) {
            var regex = new RegExp('(' + escapeRegExpForSearch(query) + ')', 'gi');
            displayName = name.replace(regex, '<mark>$1</mark>');
        }
        html += '<div class="node-list-item" data-cross-uid="' + escapeHtml(crossUid) + '" onclick="selectOltCrossForOltPortByUid(\'' + escapeHtml(crossUid) + '\')">';
        html += '<div class="node-list-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg></div>';
        html += '<div class="node-list-item-info"><div class="node-list-item-name">' + displayName + '</div>';
        if (coordsStr) html += '<div class="node-list-item-coords">' + coordsStr + '</div>';
        html += '</div></div>';
    });
    nodeListContainer.innerHTML = html;
}

function showOltCrossPortConnectDialog(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return;
    if (isOltPortCrossConnected(oltObj, portNumber)) {
        showWarning('PON-порт уже подключён к порту кросса.', 'Порт занят');
        return;
    }
    var mapCrosses = typeof getMapCrossObjects === 'function' ? getMapCrossObjects() : [];
    if (!mapCrosses.length) {
        showWarning('На карте нет кроссов. Добавьте оптический кросс, назначьте жилы на порты панели и повторите подключение.', 'Нет кроссов');
        return;
    }
    nodeSelectionModalData = {
        mode: 'oltCrossConnect',
        oltObj: oltObj,
        portNumber: portNumber,
        crosses: [],
        phase: 'crossList'
    };
    var crosses = refreshOltCrossConnectModalCrosses();
    var modal = document.getElementById('nodeSelectionModal');
    var fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    var searchInput = document.getElementById('nodeSearchInput');
    var portLbl = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '', true)
        : ('порт ' + portNumber);
    setOltCrossSelectionModalChrome('Подключение PON-порта к кроссу', 'Выберите кросс', 'Введите имя кросса...');
    if (fiberInfo) {
        fiberInfo.textContent = 'PON ' + portLbl + ': выберите кросс и порт с жилой — кабель OLT ↔ кросс не нужен, на карте появится линия.';
    }
    if (searchInput) searchInput.value = '';
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = crosses.length > 1 ? '' : 'none';
    renderOltCrossListForModal(crosses, '');
    if (modal) modal.style.display = 'block';
    if (crosses.length === 1) {
        selectOltCrossForOltPortByUid(crosses[0].properties.get('uniqueId'));
        return;
    }
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function resolveOltCrossForConnect(crossUid) {
    if (!crossUid) return null;
    if (typeof getMapObjectByUid === 'function') {
        var byUid = getMapObjectByUid(crossUid, 'cross');
        if (byUid) return byUid;
        byUid = getMapObjectByUid(crossUid);
        if (byUid && typeof isCrossConnectHost === 'function' && isCrossConnectHost(byUid)) return byUid;
    }
    return objects.find(function(o) {
        if (!o || !o.properties || o.properties.get('uniqueId') !== crossUid) return false;
        if (typeof isCrossConnectHost === 'function') return isCrossConnectHost(o);
        return o.properties.get('type') === 'cross';
    }) || null;
}

function selectOltCrossForOltPortByUid(crossUid) {
    if (!nodeSelectionModalData || nodeSelectionModalData.mode !== 'oltCrossConnect') return;
    var crossObj = resolveOltCrossForConnect(crossUid);
    if (!crossObj) {
        refreshOltCrossConnectModalCrosses();
        showError('Кросс не найден. Список обновлён — выберите кросс снова.', 'Кросс');
        var searchInput = document.getElementById('nodeSearchInput');
        renderOltCrossListForModal(nodeSelectionModalData.crosses || [], searchInput ? searchInput.value : '');
        return;
    }
    var oltObj = typeof rehydrateOltConnectHost === 'function'
        ? rehydrateOltConnectHost(nodeSelectionModalData.oltObj)
        : nodeSelectionModalData.oltObj;
    crossObj = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(crossObj)
        : crossObj;
    if (!oltObj || !crossObj) {
        showError('Не удалось открыть подключение: объект OLT или кросс не найден на карте.', 'Ошибка');
        return;
    }
    var allOpts = getConnectableCrossPortsForOlt(crossObj, oltObj, nodeSelectionModalData.portNumber);
    var connectable = allOpts.filter(function(o) { return o.hasSpliceTarget; });
    if (!connectable.length) {
        var crossName = crossObj.properties.get('name') || 'Кросс';
        var fiberPorts = crossObj.properties.get('fiberPorts') || {};
        var hasAssignedFibers = Object.keys(fiberPorts).length > 0 || allOpts.some(function(o) {
            return typeof getCrossPortFiberKeys === 'function' && getCrossPortFiberKeys(crossObj, o.portNumber).length > 0;
        });
        if (!isCrossConnectHost(crossObj)) {
            showError('Объект «' + crossName + '» не распознан как кросс. Обновите страницу (Ctrl+F5) и повторите.', 'Кросс');
        } else if (!allOpts.length) {
            showError('На кроссе «' + crossName + '» все порты панели заняты другими PON-портами OLT. Выберите другой кросс.', 'Нет портов');
        } else if (hasAssignedFibers) {
            showError('На кроссе «' + crossName + '» жилы на портах недоступны для PON (порт занят, приход OLT или жила на другом OLT). Попробуйте порты 2–4 или отключите приход с порта 1.', 'Нет свободных жил');
        } else {
            showError('На кроссе «' + crossName + '» нет портов с жилами. Назначьте жилу на порт в карточке кросса.', 'Нет портов');
        }
        return;
    }
    nodeSelectionModalData.phase = 'crossPort';
    nodeSelectionModalData.selectedCross = crossObj;
    nodeSelectionModalData.crossPortOptions = connectable;
    renderOltCrossPortSelectionUI();
}

function selectOltCrossForOltPort(crossIndex) {
    if (!nodeSelectionModalData || nodeSelectionModalData.mode !== 'oltCrossConnect') return;
    var crosses = refreshOltCrossConnectModalCrosses();
    if (crossIndex < 0 || crossIndex >= crosses.length) return;
    selectOltCrossForOltPortByUid(crosses[crossIndex].properties.get('uniqueId'));
}

function renderOltCrossPortSelectionUI() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'oltCrossConnect' || d.phase !== 'crossPort' || !d.selectedCross || !d.crossPortOptions) return;
    var container = document.getElementById('nodeListContainer');
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = 'none';
    var crossName = escapeHtml(d.selectedCross.properties.get('name') || 'Кросс');
    var selOpts = d.crossPortOptions.map(function(o, idx) {
        return '<option value="' + idx + '">' + escapeHtml(o.label) + '</option>';
    }).join('');
    var html = '<div style="padding: 8px 0;">';
    html += '<p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">Кросс: <strong>' + crossName + '</strong>. Выберите порт с назначенной жилой — связь логическая, физический кабель до OLT не требуется.</p>';
    html += '<div class="form-group" style="margin-bottom: 12px;"><label for="oltCrossPortSelect" style="font-size: 0.8125rem;">Порт кросса</label>';
    html += '<select id="oltCrossPortSelect" class="form-select">' + selOpts + '</select></div>';
    html += '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">';
    html += '<button type="button" id="nodeFiberBackBtn" class="btn-secondary">Назад</button>';
    html += '<button type="button" id="nodeFiberConfirmBtn" class="btn-primary">Подключить</button></div></div>';
    if (container) container.innerHTML = html;
}

function backOltCrossSelectionToList() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'oltCrossConnect') return;
    d.phase = 'crossList';
    d.selectedCross = null;
    d.crossPortOptions = null;
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    var crosses = refreshOltCrossConnectModalCrosses();
    if (searchGroup) searchGroup.style.display = crosses.length > 1 ? '' : 'none';
    setOltCrossSelectionModalChrome('Подключение PON-порта к кроссу', 'Выберите кросс', 'Введите имя кросса...');
    renderOltCrossListForModal(crosses, searchInput ? searchInput.value : '');
}

function showOltPortOnuConnectDialog(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return;
    if (typeof isOltPortInUse === 'function' && isOltPortInUse(oltObj, portNumber)) {
        showWarning('PON-порт уже занят.', 'Порт занят');
        return;
    }
    var onus = typeof getAvailableOnusForOltPort === 'function'
        ? getAvailableOnusForOltPort(oltObj, portNumber)
        : (typeof getAvailableOnus === 'function' ? getAvailableOnus() : []);
    if (!onus.length) {
        var hasAnyOnu = objects.some(function(o) { return o.properties && o.properties.get('type') === 'onu'; });
        var hasFreeOnu = typeof getAvailableOnus === 'function' && getAvailableOnus().length > 0;
        showWarning(
            hasAnyOnu
                ? (hasFreeOnu
                    ? 'Нет ONU с координатами для прокладки (на карте или в ящике с OLT).'
                    : 'Нет свободных ONU. Все ONU уже подключены к сети.')
                : 'Нет ONU на карте. Сначала создайте ONU.',
            'Нет ONU'
        );
        return;
    }
    splitterOutputOnuModalData = { mode: 'oltPort', oltObj: oltObj, portNumber: portNumber, onus: onus };
    var modal = document.getElementById('splitterOutputOnuModal');
    var listEl = document.getElementById('splitterOutputOnuList');
    var titleEl = modal && modal.querySelector('.group-balloon-title');
    var infoEl = modal && modal.querySelector('.node-selection-info');
    var portLbl = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '', true)
        : ('порт ' + portNumber);
    if (titleEl) titleEl.textContent = 'Подключение ONU к PON-порту';
    if (infoEl) infoEl.textContent = 'PON ' + portLbl + ': выберите свободную ONU';
    if (listEl) {
        listEl.innerHTML = '';
        onus.forEach(function(onu, idx) {
            var name = onu.properties.get('name') || ('ONU ' + (idx + 1));
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div>';
            div.addEventListener('click', function() { selectSplitterOutputOnu(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
    }
    if (modal) modal.style.display = 'block';
}

function showOltPortMcConnectDialog(oltObj, portNumber) {
    if (!oltObj || portNumber == null) return;
    if (typeof isOltPortInUse === 'function' && isOltPortInUse(oltObj, portNumber)) {
        showWarning('PON-порт уже занят.', 'Порт занят');
        return;
    }
    var mcs = typeof getAvailableMediaConvertersForOltPort === 'function'
        ? getAvailableMediaConvertersForOltPort(oltObj, portNumber)
        : (typeof getAvailableMediaConverters === 'function' ? getAvailableMediaConverters() : []);
    if (!mcs.length) {
        var hasAnyMc = objects.some(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter'; });
        var hasFreeMc = typeof getAvailableMediaConverters === 'function' && getAvailableMediaConverters().length > 0;
        showWarning(
            hasAnyMc
                ? (hasFreeMc
                    ? 'Нет медиаконвертеров с координатами для прокладки (на карте или в ящике с OLT).'
                    : 'Нет свободных медиаконвертеров. Все МК уже подключены к сети.')
                : 'Нет медиаконвертеров на карте. Сначала создайте медиаконвертер.',
            'Нет МК'
        );
        return;
    }
    splitterOutputOnuModalData = { mode: 'oltPortMc', oltObj: oltObj, portNumber: portNumber, mcs: mcs };
    var modal = document.getElementById('splitterOutputOnuModal');
    var listEl = document.getElementById('splitterOutputOnuList');
    var titleEl = modal && modal.querySelector('.group-balloon-title');
    var infoEl = modal && modal.querySelector('.node-selection-info');
    var portLbl = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '', true)
        : ('порт ' + portNumber);
    if (titleEl) titleEl.textContent = 'Подключение медиаконвертера к PON-порту';
    if (infoEl) infoEl.textContent = 'PON ' + portLbl + ': выберите свободный медиаконвертер';
    if (listEl) {
        listEl.innerHTML = '';
        mcs.forEach(function(mc, idx) {
            var name = mc.properties.get('name') || ('МК ' + (idx + 1));
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div>';
            div.addEventListener('click', function() { selectSplitterOutputMc(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
    }
    if (modal) modal.style.display = 'block';
}

function confirmOltCrossPortConnect() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'oltCrossConnect' || d.phase !== 'crossPort' || !d.selectedCross) return;
    var sel = document.getElementById('oltCrossPortSelect');
    var idx = sel && sel.value !== '' ? parseInt(sel.value, 10) : NaN;
    if (isNaN(idx) || !d.crossPortOptions || idx < 0 || idx >= d.crossPortOptions.length) {
        showError('Выберите порт кросса.', 'Порт');
        return;
    }
    var opt = d.crossPortOptions[idx];
    var portNumber = d.portNumber;
    var crossObj = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(resolveOltCrossForConnect(d.selectedCross.properties.get('uniqueId')) || d.selectedCross)
        : (resolveOltCrossForConnect(d.selectedCross.properties.get('uniqueId')) || d.selectedCross);
    var oltObj = typeof rehydrateOltConnectHost === 'function'
        ? rehydrateOltConnectHost(d.oltObj)
        : d.oltObj;
    var spliceTargets = typeof getOltSpliceTargetsOnCrossPort === 'function'
        ? getOltSpliceTargetsOnCrossPort(crossObj, opt.portNumber) : [];
    if (!spliceTargets.length) {
        if (typeof getCrossPortFiberKeys === 'function' && getCrossPortFiberKeys(crossObj, opt.portNumber).length) {
            showError('Жила на этом порту уже занята другим PON-портом OLT. Выберите другой порт.', 'Порт недоступен');
        } else {
            showError('Порт пустой. Сначала назначьте жилу на этот порт в карточке кросса.', 'Нет жилы');
        }
        return;
    }
    closeNodeSelectionModal();
    if (typeof startOltPortCrossRouting === 'function') {
        startOltPortCrossRouting(oltObj, portNumber, crossObj, opt.portNumber);
        return;
    }
    if (!connectOltPortToCrossPort(oltObj, portNumber, crossObj, opt.portNumber)) return;
    if (typeof showSuccess === 'function') {
        var crossName = crossObj.properties.get('name') || 'Кросс';
        showSuccess('PON-порт ' + portNumber + ' подключён к порту ' + opt.portNumber + ' кросса «' + crossName + '».', 'OLT');
    }
    if (typeof refreshObjectModal === 'function') refreshObjectModal(oltObj);
    else if (typeof showObjectInfo === 'function') showObjectInfo(oltObj);
}
