/**
 * Модалки назначения жил: узел, ONU, сплиттер, GPON-маршрут.
 */
function initNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    if (!modal) return;
    
    const closeBtn = modal.querySelector('.close-node-selection');
    const cancelBtn = document.getElementById('cancelNodeSelection');
    const searchInput = document.getElementById('nodeSearchInput');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeNodeSelectionModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeNodeSelectionModal);
    }

    modal.addEventListener('click', function(e) {
        if (e.target.id === 'nodeFiberBackBtn') {
            e.stopPropagation();
            if (nodeSelectionModalData && nodeSelectionModalData.mode === 'oltCrossConnect') {
                backOltCrossSelectionToList();
            } else {
                backNodeSelectionToList();
            }
            return;
        }
        if (e.target.id === 'nodeFiberConfirmBtn') {
            e.stopPropagation();
            if (nodeSelectionModalData && nodeSelectionModalData.mode === 'oltCrossConnect') {
                confirmOltCrossPortConnect();
            } else {
                confirmNodeFiberToSfpPort();
            }
            return;
        }
        if (e.target === modal) {
            closeNodeSelectionModal();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (!nodeSelectionModalData) return;
            if (nodeSelectionModalData.mode === 'oltCrossConnect' && nodeSelectionModalData.phase === 'crossList') {
                var crosses = typeof refreshOltCrossConnectModalCrosses === 'function'
                    ? refreshOltCrossConnectModalCrosses()
                    : (nodeSelectionModalData.crosses || []);
                renderOltCrossListForModal(crosses, this.value);
                return;
            }
            if (nodeSelectionModalData.phase === 'list') {
                renderNodeList(nodeSelectionModalData.nodes, this.value);
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            if (nodeSelectionModalData && nodeSelectionModalData.mode === 'oltCrossConnect' && nodeSelectionModalData.phase === 'crossPort') {
                backOltCrossSelectionToList();
            } else if (nodeSelectionModalData && nodeSelectionModalData.phase === 'sfp') {
                backNodeSelectionToList();
            } else {
                closeNodeSelectionModal();
            }
        }
    });
}

function initOnuSelectionModal() {
    var modal = document.getElementById('onuSelectionModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-onu-selection');
    var cancelBtn = document.getElementById('cancelOnuSelection');
    var searchInput = document.getElementById('onuSearchInput');
    if (closeBtn) closeBtn.addEventListener('click', closeOnuSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeOnuSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeOnuSelectionModal(); });
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (onuSelectionModalData) renderOnuList(this.value);
        });
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeOnuSelectionModal();
    });
}

function getAvailableSplitters(hostObj) {
    if (hostObj && window.EmbeddedSplitters && EmbeddedSplitters.isHost(hostObj)) {
        return EmbeddedSplitters.getAvailableForHost(hostObj).map(function(rec) {
            return EmbeddedSplitters.createFacade(hostObj, rec);
        });
    }
    return [];
}

function isCableFromOltAtHost(hostObj, cableId) {
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable || !hostObj) return false;
    var otherEnd = getOtherEndOfCable(cable, hostObj);
    return !!(otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'olt');
}

function showSplitterSelectionDialog(sleeveObj, cableId, fiberNumber, excludeSplitterId) {
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = t === 'cross' ? { type: 'splitterInput', atCrossId: placeId } : { type: 'splitterInput', atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    var splitters = getAvailableSplitters(sleeveObj);
    if (excludeSplitterId) splitters = splitters.filter(function(s) { return getObjectUniqueId(s) !== excludeSplitterId; });
    if (splitters.length === 0) {
        showWarning('Нет сплиттеров в схеме этой муфты/кросса. Добавьте сплиттер на вкладке «Схема» (кнопка 🔀 Сплиттер).', 'Нет сплиттеров');
        return;
    }
    splitterSelectionModalData = { sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, splitters: splitters };
    const modal = document.getElementById('splitterSelectionModal');
    const fiberInfo = document.getElementById('splitterSelectionFiberInfo');
    const splitterSelect = document.getElementById('splitterSelect');
    const confirmBtn = document.getElementById('confirmSplitterSelection');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к входу сплиттера';
    if (splitterSelect) {
        splitterSelect.innerHTML = '<option value="">— выберите сплиттер</option>';
        splitters.forEach((sp, idx) => {
            const name = sp.properties.get('name') || ('Сплиттер ' + (idx + 1));
            const uid = getObjectUniqueId(sp);
            splitterSelect.innerHTML += '<option value="' + escapeHtml(uid) + '">' + escapeHtml(name) + '</option>';
        });
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (modal) modal.style.display = 'block';
}

function closeSplitterSelectionModal() {
    const modal = document.getElementById('splitterSelectionModal');
    if (modal) modal.style.display = 'none';
    splitterSelectionModalData = null;
}

function isFiberSplitterAssignmentDirect(hostObj, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return false;
    var map = hostObj.properties.get('splitterConnections') || {};
    var entry = map[fiberConnKey(cableId, fiberNumber)];
    return !!(entry && entry.splitterId);
}

function resolveSplitterAssignmentKey(hostObj, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return null;
    var splitterConnections = hostObj.properties.get('splitterConnections') || {};
    var key = fiberConnKey(cableId, fiberNumber);
    if (splitterConnections[key] && splitterConnections[key].splitterId) {
        return { key: key, conn: splitterConnections[key] };
    }
    var ass = getHostAssignment(hostObj, 'splitterConnections', cableId, fiberNumber);
    if (!ass || !ass.splitterId) return null;
    var group = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
    for (var i = 0; i < group.length; i++) {
        var gk = fiberConnKey(group[i].cableId, group[i].fiberNumber);
        if (splitterConnections[gk] && splitterConnections[gk].splitterId === ass.splitterId) {
            return { key: gk, conn: splitterConnections[gk] };
        }
    }
    return null;
}

function disconnectFiberFromSplitter(sleeveObj, cableId, fiberNumber) {
    var resolved = resolveSplitterAssignmentKey(sleeveObj, cableId, fiberNumber);
    if (!resolved || !resolved.conn || !resolved.conn.splitterId) {
        setHostFiberAssignment(sleeveObj, 'splitterConnections', cableId, fiberNumber, null);
        saveData();
        updateSplitterConnectionLines();
        showObjectInfo(sleeveObj);
        return;
    }
    const key = resolved.key;
    const conn = resolved.conn;
    const disconnectCableId = parseFiberConnectionKey(key).cableId;
    const disconnectFiberNumber = parseFiberConnectionKey(key).fiberNumber;
    const splitterObj = resolveSplitterObject(conn.splitterId);
    withSuppressedMapSave(function() {
        if (splitterObj) purgeSplitterGponTree(splitterObj);
    });
    if (!splitterObj || !splitterObj._embedded) {
        removeSplitterConnectionLine(sleeveObj, disconnectCableId, disconnectFiberNumber);
    }
    var splitterConnections = cloneHostFiberAssignmentMap(sleeveObj.properties.get('splitterConnections'));
    delete splitterConnections[key];
    sleeveObj.properties.set('splitterConnections', splitterConnections);
    if (splitterObj && splitterObj._embedded && splitterObj._host) {
        persistEmbeddedSplittersOnHost(splitterObj._host);
    }
    saveData();
    updateSplitterOutputConnectionLines();
    updateSplitterConnectionLines();
    if (typeof showSuccess === 'function') showSuccess('Жила отключена от сплиттера и снова доступна в муфте.', 'Восстановление');
    if (splitterObj) refreshSplitterUiAfterChange(splitterObj);
    else showObjectInfo(sleeveObj);
}

function connectFiberToSplitterWithRoute(sleeveObj, cableId, fiberNumber, splitterObj, routeIds) {
    routeIds = resolveGponRouteIds(routeIds);
    const splitterId = getObjectUniqueId(splitterObj);
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = { type: 'splitterInput', splitterId: splitterId };
    if (isCrossLikeHostType(t)) opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return false;
    }
    const key = fiberConnKey(cableId, fiberNumber);
    return withSuppressedMapSave(function() {
        const prevInput = splitterObj.properties.get('inputFiber');
        if (prevInput) {
            const prevKey = fiberConnKey(prevInput.cableId, prevInput.fiberNumber);
            objects.forEach(function(slot) {
                if (!slot.properties) return;
                const st = slot.properties.get('type');
                if (st !== 'cross' && st !== 'sleeve') return;
                var sc = cloneHostFiberAssignmentMap(slot.properties.get('splitterConnections'));
                if (sc[prevKey] && sc[prevKey].splitterId === splitterId) {
                    delete sc[prevKey];
                    slot.properties.set('splitterConnections', sc);
                }
            });
        }
        setHostFiberAssignment(sleeveObj, 'splitterConnections', cableId, fiberNumber, {
            splitterId: splitterId,
            routeIds: routeIds || []
        });
        if (splitterObj._embedded && splitterObj._record) {
            applyEmbeddedSplitterInputFiber(splitterObj._record, cableId, fiberNumber);
        } else {
            splitterObj.properties.set('inputFiber', { cableId: cableId, fiberNumber: fiberNumber });
        }
        syncSplitterInputFromHost(splitterObj);
        if (splitterObj._embedded && splitterObj._host) {
            persistEmbeddedSplittersOnHost(splitterObj._host, { skipSync: true });
        }
        if (!splitterObj._embedded && hasMapGeometry(splitterObj)) {
            createSplitterConnectionLine(sleeveObj, splitterObj, cableId, fiberNumber, routeIds);
        }
        saveData();
        updateSplitterConnectionLines();
        return true;
    });
}

function initSplitterSelectionModal() {
    const modal = document.getElementById('splitterSelectionModal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-splitter-selection');
    const cancelBtn = document.getElementById('cancelSplitterSelection');
    const splitterSelect = document.getElementById('splitterSelect');
    const confirmBtn = document.getElementById('confirmSplitterSelection');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterSelectionModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterSelectionModal();
    });
    if (splitterSelect) {
        splitterSelect.addEventListener('change', function() {
            if (confirmBtn) confirmBtn.disabled = !this.value;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (!splitterSelectionModalData) return;
            const splitterVal = splitterSelect && splitterSelect.value;
            if (!splitterVal) return;
            const splitterObj = resolveSplitterObject(splitterVal);
            if (!splitterObj) return;
            const data = splitterSelectionModalData;
            closeSplitterSelectionModal();
            if (connectFiberToSplitterWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, splitterObj, [])) {
                refreshSplitterUiAfterChange(splitterObj);
            }
        });
    }
}

function getOnuIdsUsedBySplitterOutputs() {
    var used = [];
    function collect(sp) {
        if (!sp || !sp.properties) return;
        var outputs = sp.properties.get('outputConnections') || [];
        outputs.forEach(function(o) {
            if (o && o.onuId) used.push(o.onuId);
        });
    }
    if (window.EmbeddedSplitters) EmbeddedSplitters.forEach(collect);
    else objects.forEach(function(obj) {
        if (obj.properties && obj.properties.get('type') === 'splitter') collect(obj);
    });
    return used;
}

function getSplitterIdsUsedBySplitterOutputs() {
    var used = [];
    function collect(sp) {
        if (!sp || !sp.properties) return;
        var outputs = sp.properties.get('outputConnections') || [];
        outputs.forEach(function(o) {
            if (o && o.splitterId) used.push(o.splitterId);
        });
    }
    if (window.EmbeddedSplitters) EmbeddedSplitters.forEach(collect);
    else objects.forEach(function(obj) {
        if (obj.properties && obj.properties.get('type') === 'splitter') collect(obj);
    });
    return used;
}

function getHostForSplitterOutputConn(outConn, splitterObj) {
    if (!outConn) return null;
    if (outConn.hostId) {
        return getMapObjectByUid(outConn.hostId, 'sleeve') || getMapObjectByUid(outConn.hostId, 'cross');
    }
    if (splitterObj && splitterObj._host) return splitterObj._host;
    return null;
}

/** Другой конец кабеля относительно сплиттера (карта или встроенный в муфту/кросс). */
function getOtherEndForSplitterCable(cable, splitterObj, cableId, fiberNumber) {
    if (!cable || !splitterObj) return null;
    var direct = getOtherEndOfCable(cable, splitterObj);
    if (direct) return direct;
    if (!splitterObj._embedded) return null;
    var hostIn = getSplitterHostInputFiber(splitterObj);
    if (hostIn && hostIn.cableId === cableId && hostIn.fiberNumber === fiberNumber) {
        return hostIn.hostObj || null;
    }
    return splitterObj._host || null;
}

function resolveSplitterOutputPeer(splitterObj, outConn) {
    if (!outConn || !outConn.cableId) return null;
    var outCable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === outConn.cableId;
    });
    if (!outCable) return null;
    var otherEnd = getOtherEndOfCable(outCable, splitterObj);
    if (!otherEnd) otherEnd = getHostForSplitterOutputConn(outConn, splitterObj);
    return otherEnd ? { cable: outCable, host: otherEnd } : null;
}

function buildSplitterOutputToNodePathSteps(splitterObj, outConn) {
    if (!outConn || !outConn.nodeId || !splitterObj) return null;
    var nodeObj = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'node' && getObjectUniqueId(o) === outConn.nodeId;
    });
    if (!nodeObj) return null;
    var nodeName = nodeObj.properties.get('name') || 'Узел';
    return [
        { type: 'splitterOutputToNode', splitter: splitterObj, nodeObj: nodeObj, nodeName: nodeName, switchPort: outConn.switchPort != null ? outConn.switchPort : null },
        { type: 'object', objectType: 'node', objectName: nodeName, object: nodeObj, port: null }
    ];
}

function buildSplitterOutputToMediaConverterPathSteps(splitterObj, outConn) {
    if (!outConn || !outConn.mediaConverterId || !splitterObj) return null;
    var mcObj = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === outConn.mediaConverterId;
    });
    if (!mcObj) return null;
    var mcName = mcObj.properties.get('name') || 'Медиаконвертер';
    return [
        { type: 'splitterOutputToMediaConverter', splitter: splitterObj, mediaConverterObj: mcObj, mediaConverterName: mcName },
        { type: 'object', objectType: 'mediaConverter', objectName: mcName, object: mcObj, port: null }
    ];
}

function appendSplitterDirectOutputSteps(path, splitterObj, outputConnections) {
    var outs = outputConnections || [];
    var firstOutOnu = outs.find(function(o) { return o && o.onuId; });
    if (firstOutOnu) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === firstOutOnu.onuId; });
        if (onuObj) {
            path.push({ type: 'splitterOutputToOnu', splitter: splitterObj, onuObj: onuObj, onuName: onuObj.properties.get('name') || 'ONU' });
            path.push({ type: 'object', objectType: 'onu', objectName: onuObj.properties.get('name') || 'ONU', object: onuObj, port: null });
            return true;
        }
    }
    var firstOutNode = outs.find(function(o) { return o && o.nodeId; });
    if (firstOutNode) {
        var nodeSteps = buildSplitterOutputToNodePathSteps(splitterObj, firstOutNode);
        if (nodeSteps) {
            nodeSteps.forEach(function(step) { path.push(step); });
            return true;
        }
    }
    var firstOutMc = outs.find(function(o) { return o && o.mediaConverterId; });
    if (firstOutMc) {
        var mcSteps = buildSplitterOutputToMediaConverterPathSteps(splitterObj, firstOutMc);
        if (mcSteps) {
            mcSteps.forEach(function(step) { path.push(step); });
            return true;
        }
    }
    var firstOutSplitter = outs.find(function(o) { return o && o.splitterId; });
    if (firstOutSplitter) {
        var childSplitter = resolveSplitterObject(firstOutSplitter.splitterId);
        if (childSplitter) {
            var childInput = childSplitter.properties.get('inputFiber') || getSplitterRootInputFiber(childSplitter);
            if (childInput && childInput.cableId) {
                path.push({ type: 'splitterOutputToSplitter', fromSplitter: splitterObj, toSplitter: childSplitter });
                path.push({ type: 'object', objectType: 'splitter', objectName: childSplitter.properties.get('name') || 'Сплиттер', object: childSplitter, port: null });
                return { childSplitter: childSplitter, childInput: childInput };
            }
        }
    }
    return false;
}

/** Вход сплиттера с муфты/кросса (splitterConnections) — основной источник физического подключения. */
function getSplitterHostInputFiber(splitterObj) {
    var splitterId = getObjectUniqueId(splitterObj);
    if (!splitterId) return null;
    for (var i = 0; i < objects.length; i++) {
        var slot = objects[i];
        if (!slot.properties) continue;
        var t = slot.properties.get('type');
        if (!isFiberHostType(t)) continue;
        var sc = slot.properties.get('splitterConnections') || {};
        for (var key in sc) {
            if (!sc[key] || sc[key].splitterId !== splitterId) continue;
            var parsed = parseFiberConnectionKey(key);
            if (!parsed) continue;
            return {
                cableId: parsed.cableId,
                fiberNumber: parsed.fiberNumber,
                hostObj: slot,
                routeIds: sc[key].routeIds || []
            };
        }
    }
    return null;
}

function syncSplitterInputFromHost(splitterObj) {
    if (splitterObj && splitterObj._embedded && splitterObj._host && splitterObj._record && window.EmbeddedSplitters) {
        EmbeddedSplitters.syncInputFromConnections(splitterObj._host, splitterObj._record);
    }
    var hostIn = getSplitterHostInputFiber(splitterObj);
    if (!hostIn) {
        if (splitterObj && splitterObj._embedded && splitterObj._record) {
            var rec = splitterObj._record;
            return !!(rec.inputCableId && rec.inputFiberNumber != null);
        }
        return false;
    }
    var cur = splitterObj.properties.get('inputFiber');
    if (!cur || cur.cableId !== hostIn.cableId || cur.fiberNumber !== hostIn.fiberNumber) {
        splitterObj.properties.set('inputFiber', { cableId: hostIn.cableId, fiberNumber: hostIn.fiberNumber });
        if (splitterObj._embedded && splitterObj._host && splitterObj._record && window.EmbeddedSplitters) {
            EmbeddedSplitters.syncInputFromConnections(splitterObj._host, splitterObj._record);
        }
        return true;
    }
    return false;
}

function syncAllSplitterInputsFromHosts() {
    var changed = false;
    if (window.EmbeddedSplitters) {
        EmbeddedSplitters.forEach(function(obj) {
            if (syncSplitterInputFromHost(obj)) changed = true;
        });
        objects.forEach(function(obj) {
            if (EmbeddedSplitters.isHost(obj)) EmbeddedSplitters.syncAllInputs(obj);
        });
    } else {
        objects.forEach(function(obj) {
            if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
            if (syncSplitterInputFromHost(obj)) changed = true;
        });
    }
    return changed;
}

function removeSplitterHostConnection(splitterObj) {
    var hostIn = getSplitterHostInputFiber(splitterObj);
    if (!hostIn) return false;
    var resolved = resolveSplitterAssignmentKey(hostIn.hostObj, hostIn.cableId, hostIn.fiberNumber);
    var sc = hostIn.hostObj.properties.get('splitterConnections') || {};
    var rKey = resolved ? resolved.key : fiberConnKey(hostIn.cableId, hostIn.fiberNumber);
    if (!sc[rKey]) return false;
    var rp = parseFiberConnectionKey(rKey);
    if (rp) removeSplitterConnectionLine(hostIn.hostObj, rp.cableId, rp.fiberNumber);
    delete sc[rKey];
    hostIn.hostObj.properties.set('splitterConnections', sc);
    return true;
}

function getSplitterRootInputFiber(splitterObj, visited) {
    if (!splitterObj || !splitterObj.properties) return null;
    var hostIn = getSplitterHostInputFiber(splitterObj);
    if (hostIn) return { cableId: hostIn.cableId, fiberNumber: hostIn.fiberNumber };
    visited = visited || new Set();
    var myId = getObjectUniqueId(splitterObj);
    if (visited.has(myId)) return null;
    visited.add(myId);
    var input = splitterObj.properties.get('inputFiber');
    if (input && input.cableId && input.fiberNumber != null) return input;
    var foundParent = null;
    function checkParent(o) {
        if (!o.properties || foundParent) return;
        var outs = o.properties.get('outputConnections') || [];
        for (var j = 0; j < outs.length; j++) {
            if (outs[j] && outs[j].splitterId === myId) {
                foundParent = getSplitterRootInputFiber(o, visited);
                return;
            }
        }
    }
    if (window.EmbeddedSplitters) EmbeddedSplitters.forEach(checkParent);
    else objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') === 'splitter') checkParent(o);
    });
    if (foundParent) return foundParent;
    return null;
}

function isOnuUsedInNetwork(onuId) {
    if (!onuId) return false;
    if (getOnuIdsUsedBySplitterOutputs().indexOf(onuId) !== -1) return true;
    for (var i = 0; i < objects.length; i++) {
        var slot = objects[i];
        if (!slot.properties) continue;
        var st = slot.properties.get('type');
        if (st !== 'cross' && st !== 'sleeve') continue;
        var onuConn = slot.properties.get('onuConnections') || {};
        for (var key in onuConn) {
            if (onuConn[key] && onuConn[key].onuId === onuId) return true;
        }
    }
    var onuObj = getMapObjectByUid(onuId, 'onu');
    if (onuObj && onuObj.properties) {
        var inc = onuObj.properties.get('incomingFiber');
        if (inc && inc.cableId) return true;
    }
    return false;
}

function getAvailableOnusForSplitterOutput(excludeSplitterId) {
    return getAvailableOnus();
}

function getAvailableSplittersForSplitterOutput(sourceSplitterId) {
    if (window.EmbeddedSplitters) return EmbeddedSplitters.getAvailableForOutput(sourceSplitterId);
    var usedSplitterIds = getSplitterIdsUsedBySplitterOutputs();
    return objects.filter(function(o) {
        if (!o.properties || o.properties.get('type') !== 'splitter') return false;
        var uid = getObjectUniqueId(o);
        if (uid === sourceSplitterId) return false;
        if (usedSplitterIds.indexOf(uid) !== -1) return false;
        return !getSplitterRootInputFiber(o);
    });
}

function getAvailableHostsForSplitterOutput() {
    return objects.filter(function(o) {
        if (!o.properties) return false;
        var t = o.properties.get('type');
        return t === 'sleeve' || t === 'cross';
    });
}

function findSplitterOutputAtHost(hostObj, cableId, fiberNumber) {
    if (!hostObj || !hostObj.properties) return null;
    var hostUid = getObjectUniqueId(hostObj);
    if (!hostUid) return null;
    function scan(sp, localOnly) {
        if (!sp || !sp.properties) return null;
        var spUid = getObjectUniqueId(sp);
        var outputs = sp.properties.get('outputConnections') || [];
        for (var oi = 0; oi < outputs.length; oi++) {
            var out = outputs[oi];
            if (!out || out.cableId !== cableId || out.fiberNumber !== fiberNumber) continue;
            if (out.onuId || out.splitterId || out.nodeId || out.mediaConverterId) continue;
            if (localOnly) {
                if (!out.hostId || out.hostId === hostUid) {
                    return { splitterObj: sp, splitterId: spUid, outputIndex: oi, conn: out };
                }
            } else if (out.hostId === hostUid) {
                return { splitterObj: sp, splitterId: spUid, outputIndex: oi, conn: out };
            }
        }
        return null;
    }
    if (window.EmbeddedSplitters && EmbeddedSplitters.isHost(hostObj)) {
        var list = EmbeddedSplitters.getList(hostObj);
        for (var li = 0; li < list.length; li++) {
            var facade = EmbeddedSplitters.createFacade(hostObj, list[li]);
            var localHit = scan(facade, true);
            if (localHit) return localHit;
        }
    }
    if (window.EmbeddedSplitters) {
        var hit = null;
        EmbeddedSplitters.forEach(function(sp) {
            if (!hit) hit = scan(sp, false);
        });
        return hit;
    }
    for (var i = 0; i < objects.length; i++) {
        var spLegacy = objects[i];
        if (!spLegacy.properties || spLegacy.properties.get('type') !== 'splitter') continue;
        var found = scan(spLegacy);
        if (found) return found;
    }
    return null;
}

function getAvailableFibersAtHostForSplitterOutput(hostObj, sourceSplitterId, outputIndex) {
    if (!hostObj || !hostObj.properties) return [];
    var hostUid = hostObj.properties.get('uniqueId');
    var cables = typeof getConnectedCables === 'function' ? getConnectedCables(hostObj) : [];
    var options = [];
    cables.forEach(function(cable) {
        if (!cable || !cable.properties) return;
        var cableId = cable.properties.get('uniqueId');
        if (!cableId) return;
        var cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
        var fibers = getFiberColors(cable);
        fibers.forEach(function(fiber) {
            var usage = getFiberUsage(cableId, fiber.number, {
                type: 'splitterOutput',
                splitterId: sourceSplitterId,
                outputIndex: outputIndex,
                atSleeveId: hostObj.properties.get('type') === 'sleeve' ? hostUid : undefined,
                atCrossId: isCrossLikeHostType(hostObj.properties.get('type')) ? hostUid : undefined
            });
            if (usage.used) return;
            options.push({
                cableId: cableId,
                fiberNumber: fiber.number,
                label: cableName + ', жила ' + fiber.number + (fiber.name ? ' (' + fiber.name + ')' : '')
            });
        });
    });
    return options;
}

function showSplitterOutputMediaConverterDialog(hostObj, splitterId, outputIndex) {
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return;
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return;
    }
    var mcs = getAvailableMediaConverters();
    if (mcs.length === 0) {
        showWarning('Нет доступных медиаконвертеров.', 'Нет МК');
        return;
    }
    onuSelectionModalData = { mode: 'splitterOutputMc', hostObj: hostObj, splitterId: splitterId, outputIndex: outputIndex, targets: mcs };
    var modal = document.getElementById('onuSelectionModal');
    var fiberInfo = document.getElementById('onuSelectionFiberInfo');
    var searchInput = document.getElementById('onuSearchInput');
    setFiberTargetSelectionModalMode('mediaConverter');
    if (fiberInfo) fiberInfo.textContent = 'Подключение выхода сплиттера к медиаконвертеру';
    if (searchInput) searchInput.value = '';
    renderOnuList('');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function showSplitterOutputOnuDialog(splitterObj, outIdx) {
    syncSplitterInputFromHost(splitterObj);
    var effectiveInput = getSplitterRootInputFiber(splitterObj);
    if (!effectiveInput) {
        showWarning('Сначала подключите входную жилу к сплиттеру с муфты или кросса.', 'Нет входа');
        return;
    }
    var hostForOlt = splitterObj._host || (getSplitterHostInputFiber(splitterObj) || {}).hostObj || null;
    if (!hostForOlt || !isFiberReachableToOlt(hostForOlt, effectiveInput.cableId, effectiveInput.fiberNumber)) {
        showWarning('ONU можно подключить только к ветке, связанной с OLT.', 'Нет OLT');
        return;
    }
    var onus = getAvailableOnusForSplitterOutput();
    if (onus.length === 0) {
        showWarning('Нет свободных ONU. Все ONU уже подключены к выходам сплиттеров.', 'Нет ONU');
        return;
    }
    splitterOutputOnuModalData = { splitterObj: splitterObj, outIdx: outIdx, onus: onus };
    var modal = document.getElementById('splitterOutputOnuModal');
    var listEl = document.getElementById('splitterOutputOnuList');
    if (listEl) {
        listEl.innerHTML = '';
        onus.forEach(function(onu, idx) {
            var name = onu.properties.get('name') || ('ONU ' + (idx + 1));
            var uid = getObjectUniqueId(onu);
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

function closeSplitterOutputOnuModal() {
    var modal = document.getElementById('splitterOutputOnuModal');
    if (modal) modal.style.display = 'none';
    splitterOutputOnuModalData = null;
}

function selectSplitterOutputOnu(onuIndex) {
    if (!splitterOutputOnuModalData) return;
    var data = splitterOutputOnuModalData;
    if (onuIndex < 0 || onuIndex >= data.onus.length) return;
    var onuObj = data.onus[onuIndex];
    closeSplitterOutputOnuModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'onu', onuObj, getObjectUniqueId(onuObj));
}

function startSplitterFiberRouting(splitterObj, outIdx, targetType, targetObj, targetId, cableId, fiberNumber) {
    splitterFiberRoutingMode = true;
    var routingAnchor = getSplitterRoutingAnchor(splitterObj);
    splitterFiberRoutingData = {
        splitterObj: splitterObj,
        routingAnchor: routingAnchor,
        outIdx: outIdx,
        targetType: targetType,
        targetObj: targetObj,
        targetId: targetId,
        cableId: cableId || null,
        fiberNumber: fiberNumber != null ? fiberNumber : null
    };
    splitterFiberWaypoints = [];
    var splitterName = splitterObj.properties.get('name') || 'Сплиттер';
    var targetName = getFiberRoutingTargetLabel(targetType, targetObj);
    var anchorName = routingAnchor && routingAnchor.properties
        ? (routingAnchor.properties.get('name') || (routingAnchor.properties.get('type') === 'cross' ? 'Кросс' : 'Муфта'))
        : splitterName;
    showInfo('Режим прокладки жилы: ' + anchorName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(routingAnchor || splitterObj);
    syncMapPanLockForEditTools();
}

function cancelSplitterFiberRouting() {
    splitterFiberRoutingMode = false;
    splitterFiberRoutingData = null;
    splitterFiberWaypoints = [];
    placementPanBlockClickUntil = 0;
    placementPanPointer.down = false;
    placementPanPointer.moved = false;
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    clearSelection();
    syncMapPanLockForEditTools();
}

function completeSplitterFiberRouting() {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    var data = splitterFiberRoutingData;
    var sp = data.splitterObj;
    var ratio = parseInt(sp.properties.get('splitRatio'), 10) || 8;
    var outputs = (sp.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    
    var routeIds = resolveGponRouteIds(splitterFiberWaypoints.map(function(wp) {
        if (wp.properties) {
            var wpId = getObjectUniqueId(wp);
            if (!wpId) {
                wpId = generateUniqueId(wp.properties.get('type') || 'waypoint');
                wp.properties.set('uniqueId', wpId);
            }
            return wpId;
        }
        return null;
    }).filter(function(id) { return id !== null; }));
    
    var rootInput = getSplitterRootInputFiber(sp);
    if (data.targetType === 'onu') {
        if (!rootInput || !rootInput.cableId || rootInput.fiberNumber == null) {
            showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
            return;
        }
        var oltHost = sp._host || (getSplitterHostInputFiber(sp) || {}).hostObj || null;
        if (!oltHost || !isFiberReachableToOlt(oltHost, rootInput.cableId, rootInput.fiberNumber)) {
            showWarning('ONU можно подключить только к ветке, связанной с OLT.', 'Нет OLT');
            return;
        }
        if (isOnuUsedInNetwork(data.targetId)) {
            showError('Это ONU уже подключено к сети. Сначала отключите его от текущей жилы или выхода сплиттера.', 'ONU занято');
            return;
        }
        outputs[data.outIdx] = { onuId: data.targetId, routeIds: routeIds };
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            data.targetObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
        }
    } else if (data.targetType === 'splitter') {
        outputs[data.outIdx] = { splitterId: data.targetId, routeIds: routeIds };
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            data.targetObj.properties.set('inputFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
        }
    } else if (data.targetType === 'mediaConverter') {
        if (!rootInput || !rootInput.cableId || rootInput.fiberNumber == null) {
            showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
            return;
        }
        outputs[data.outIdx] = { mediaConverterId: data.targetId, routeIds: routeIds };
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            data.targetObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
        }
    } else if (data.targetType === 'host') {
        if (!data.cableId || data.fiberNumber == null) {
            showError('Не выбрана жила в муфте/кроссе.', 'Ошибка');
            return;
        }
        outputs[data.outIdx] = {
            hostId: data.targetId,
            cableId: data.cableId,
            fiberNumber: data.fiberNumber,
            routeIds: routeIds
        };
    }
    
    sp.properties.set('outputConnections', outputs);
    if (sp._embedded && sp._host) {
        persistEmbeddedSplittersOnHost(sp._host);
    }
    saveData();
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    splitterFiberRoutingMode = false;
    splitterFiberRoutingData = null;
    splitterFiberWaypoints = [];
    
    updateSplitterOutputConnectionLines();
    clearSelection();
    refreshSplitterUiAfterChange(sp);
    syncMapPanLockForEditTools();
}
