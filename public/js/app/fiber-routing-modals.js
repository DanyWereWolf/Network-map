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
            } else if (nodeSelectionModalData && nodeSelectionModalData.mode === 'crossPortPatch') {
                backCrossPortPatchToList();
            } else {
                backNodeSelectionToList();
            }
            return;
        }
        if (e.target.id === 'nodeFiberConfirmBtn') {
            e.stopPropagation();
            if (nodeSelectionModalData && nodeSelectionModalData.mode === 'oltCrossConnect') {
                confirmOltCrossPortConnect();
            } else if (nodeSelectionModalData && nodeSelectionModalData.mode === 'crossPortPatch') {
                confirmCrossPortPatchConnect();
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
            if (nodeSelectionModalData.mode === 'crossPortPatch' && nodeSelectionModalData.phase === 'crossList') {
                renderCrossPortPatchCrossList(nodeSelectionModalData.crosses || [], this.value);
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
            } else if (nodeSelectionModalData && nodeSelectionModalData.mode === 'crossPortPatch' && nodeSelectionModalData.phase === 'crossPort') {
                backCrossPortPatchToList();
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
                if (!isFiberHostType(st)) return;
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

function getMcIdsUsedBySplitterOutputs() {
    var used = [];
    function collect(sp) {
        if (!sp || !sp.properties) return;
        var outputs = sp.properties.get('outputConnections') || [];
        outputs.forEach(function(o) {
            if (o && o.mediaConverterId) used.push(o.mediaConverterId);
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
        var host = getFiberHostByUid(outConn.hostId);
        if (!host) host = getMapObjectByUid(outConn.hostId, 'cabinet');
        return host;
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
    if (!outConn) return null;
    if (outConn.crossPort != null) {
        var crossHost = null;
        if (outConn.hostId && typeof getMapObjectByUid === 'function') {
            crossHost = getFiberHostByUid(outConn.hostId);
        }
        if (!crossHost && splitterObj && splitterObj._host) crossHost = splitterObj._host;
        if (!crossHost && outConn.hostId) {
            crossHost = objects.find(function(o) {
                return o.properties && getObjectUniqueId(o) === outConn.hostId && isCrossLikeHostType(o.properties.get('type'));
            }) || null;
        }
        if (crossHost && typeof resolveSplitterCrossPortLogicalFiber === 'function') {
            var logical = resolveSplitterCrossPortLogicalFiber(crossHost, outConn.crossPort);
            if (logical) {
                var rootCable = typeof findCableById === 'function' ? findCableById(logical.cableId) : null;
                return { cable: rootCable, host: crossHost, crossPort: parseInt(outConn.crossPort, 10), logicalFiber: logical };
            }
        }
        return crossHost ? { cable: null, host: crossHost, crossPort: parseInt(outConn.crossPort, 10) } : null;
    }
    if (!outConn.cableId) return null;
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

/** Drop-кабель от сплиттера/хоста до ONU (для трассы и расчёта дБм). */
function resolveSplitterToOnuDropFiber(splitterObj, onuObj, outputEntry) {
    if (!onuObj || !onuObj.properties) return null;
    var onuUid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(onuObj) : onuObj.properties.get('uniqueId');
    var cableId = null;
    var fiberNumber = null;

    if (outputEntry && outputEntry.cableId) {
        cableId = outputEntry.cableId;
        fiberNumber = outputEntry.fiberNumber;
    }

    if (!cableId) {
        var inc = onuObj.properties.get('incomingFiber');
        if (inc && inc.cableId) {
            cableId = inc.cableId;
            fiberNumber = inc.fiberNumber;
        }
    }

    if (!cableId && splitterObj && onuUid) {
        var host = splitterObj._host || null;
        if (host && host.properties) {
            var onuMap = host.properties.get('onuConnections') || {};
            Object.keys(onuMap).forEach(function(key) {
                if (cableId) return;
                var e = onuMap[key];
                if (!e || e.onuId !== onuUid) return;
                var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(key) : null;
                if (parsed && parsed.cableId) {
                    cableId = parsed.cableId;
                    fiberNumber = parsed.fiberNumber;
                }
            });
        }
    }

    if (!cableId) return null;
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    }) || null;
    if (!cable) return null;
    return { cableId: cableId, fiberNumber: fiberNumber != null ? fiberNumber : 1, cable: cable };
}

function buildSplitterOutputToOnuPathSteps(splitterObj, onuObj, outputEntry) {
    if (!onuObj || !onuObj.properties) return null;
    var onuName = onuObj.properties.get('name') || 'ONU';
    var drop = resolveSplitterToOnuDropFiber(splitterObj, onuObj, outputEntry || null);
    var steps = [{
        type: 'splitterOutputToOnu',
        splitter: splitterObj,
        onuObj: onuObj,
        onuName: onuName,
        cableId: drop ? drop.cableId : null,
        fiberNumber: drop ? drop.fiberNumber : null,
        cable: drop ? drop.cable : null
    }];
    if (drop && drop.cable) {
        var cabName = drop.cable.properties.get('cableName') ||
            (typeof getCableDescription === 'function'
                ? getCableDescription(drop.cable.properties.get('cableType'))
                : 'Кабель');
        steps.push({
            type: 'cable',
            cableId: drop.cableId,
            cableName: cabName,
            fiberNumber: drop.fiberNumber,
            cable: drop.cable
        });
    }
    steps.push({
        type: 'object',
        objectType: 'onu',
        objectName: onuName,
        object: onuObj,
        port: null
    });
    return steps;
}

/** Физические жилы на порту кросса (fiberPorts), кроме указанной (обычно feeder сплиттера). */
function findPhysicalFibersOnCrossPort(crossObj, portNumber, excludeCableId, excludeFiberNumber) {
    if (!crossObj || !crossObj.properties || portNumber == null) return [];
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    var keys = typeof findFiberKeysByCrossPort === 'function'
        ? findFiberKeysByCrossPort(fiberPorts, portNumber)
        : Object.keys(fiberPorts).filter(function(k) { return String(fiberPorts[k]) === String(portNumber); });
    var out = [];
    keys.forEach(function(key) {
        var parsed = typeof parseFiberConnectionKey === 'function'
            ? parseFiberConnectionKey(key)
            : (typeof parseFiberKey === 'function' ? parseFiberKey(key) : null);
        if (!parsed) return;
        if (excludeCableId && parsed.cableId === excludeCableId &&
            Number(parsed.fiberNumber) === Number(excludeFiberNumber)) return;
        out.push(parsed);
    });
    return out;
}

function findCableByUniqueIdLocal(cableId) {
    if (!cableId || typeof objects === 'undefined') return null;
    return objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    }) || null;
}

/** Длина линии связи хост → ONU (кросс/муфта → waypoints → ONU), м. */
function measureHostToOnuDropDistanceM(hostObj, onuObj, routeIds) {
    if (!hostObj || !onuObj || !hostObj.geometry || !onuObj.geometry) return 0;
    var start;
    var end;
    try {
        start = hostObj.geometry.getCoordinates();
        end = onuObj.geometry.getCoordinates();
    } catch (e) {
        return 0;
    }
    if (!start || !end) return 0;
    var coords = [start];
    if (routeIds && routeIds.length && typeof gponRouteWaypointCoords === 'function') {
        coords = coords.concat(gponRouteWaypointCoords(routeIds) || []);
    }
    coords.push(end);
    if (typeof polylineLength === 'function') return polylineLength(coords);
    if (typeof calculateDistance !== 'function') return 0;
    var sum = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        sum += calculateDistance(coords[i], coords[i + 1]);
    }
    return sum;
}

function pushOnuDropStepsFromHost(steps, crossObj, cableId, fiberNumber, onuObj, onuAss, opts) {
    opts = opts || {};
    if (!onuObj || !onuObj.properties) return;
    var routeIds = (onuAss && onuAss.routeIds) || [];
    var distanceM = measureHostToOnuDropDistanceM(crossObj, onuObj, routeIds);
    var cable = (!opts.skipCable && cableId) ? findCableByUniqueIdLocal(cableId) : null;
    // Отдельный drop-кабель: только если это не входная/логическая жила сплиттера
    // и второй конец кабеля — ONU.
    if (cable && !opts.logicalFiberOnly) {
        var otherEnd = typeof getOtherEndOfCable === 'function' ? getOtherEndOfCable(cable, crossObj) : null;
        var isDropCable = otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'onu';
        if (isDropCable) {
            var cabName = cable.properties.get('cableName') ||
                (typeof getCableDescription === 'function'
                    ? getCableDescription(cable.properties.get('cableType'))
                    : 'Кабель');
            steps.push({
                type: 'cable',
                cableId: cableId,
                cableName: cabName,
                fiberNumber: fiberNumber,
                cable: cable
            });
        }
    }
    steps.push({
        type: 'onuConnection',
        cableId: cableId,
        fiberNumber: fiberNumber,
        onuName: onuObj.properties.get('name') || 'ONU',
        cross: crossObj,
        onu: onuObj,
        routeIds: routeIds,
        distanceM: distanceM,
        segmentLengthM: distanceM
    });
    steps.push({
        type: 'object',
        objectType: 'onu',
        objectName: onuObj.properties.get('name') || 'ONU',
        object: onuObj,
        port: null
    });
}

function resolveOnuObjFromAss(onuAss) {
    if (!onuAss || !onuAss.onuId) return null;
    if (typeof getMapObjectByUid === 'function') return getMapObjectByUid(onuAss.onuId, 'onu');
    return objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === onuAss.onuId;
    }) || null;
}

/**
 * Продолжение после выхода сплиттера на порт кросса: разъём → drop (кабель или линия связи) → ONU.
 * feederCableId/feederFiber — входная жила сплиттера (не считать её drop-кабелем).
 */
function buildContinuationAfterSplitterCrossPort(crossObj, portNumber, feederCableId, feederFiberNumber, splitterObj, outConn) {
    if (!crossObj || portNumber == null) return [];
    var steps = [];
    var portNum = parseInt(portNumber, 10);

    // 1) Выход сразу на ONU (onuId на выходе сплиттера)
    if (outConn && outConn.onuId) {
        var onuDirect = typeof getMapObjectByUid === 'function'
            ? getMapObjectByUid(outConn.onuId, 'onu')
            : objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === outConn.onuId;
            });
        if (onuDirect) {
            var onuSteps = buildSplitterOutputToOnuPathSteps(splitterObj, onuDirect, outConn);
            return onuSteps || [];
        }
    }

    // 2) ONU на логической жиле выхода сплиттера (линия связи кросс→ONU, часто без drop-кабеля)
    var logical = typeof resolveSplitterCrossPortLogicalFiber === 'function'
        ? resolveSplitterCrossPortLogicalFiber(crossObj, portNum)
        : null;
    if (logical && typeof getHostAssignment === 'function') {
        var onuOnLogical = getHostAssignment(crossObj, 'onuConnections', logical.cableId, logical.fiberNumber);
        var onuLogicalObj = resolveOnuObjFromAss(onuOnLogical);
        if (onuLogicalObj) {
            pushOnuDropStepsFromHost(steps, crossObj, logical.cableId, logical.fiberNumber, onuLogicalObj, onuOnLogical, {
                logicalFiberOnly: true,
                skipCable: true
            });
            return steps;
        }
    }

    // 3) Жилы на этом порту (fiberPorts), кроме feeder → ONU / drop-кабель
    var fibers = findPhysicalFibersOnCrossPort(crossObj, portNum, feederCableId, feederFiberNumber);
    if ((!fibers || !fibers.length) && feederCableId && feederFiberNumber != null &&
        typeof getCrossPortMateFibers === 'function') {
        fibers = getCrossPortMateFibers(crossObj, feederCableId, feederFiberNumber) || [];
    }

    for (var i = 0; i < fibers.length; i++) {
        var f = fibers[i];
        var onuAss = typeof getHostAssignment === 'function'
            ? getHostAssignment(crossObj, 'onuConnections', f.cableId, f.fiberNumber)
            : null;
        var onuObj = resolveOnuObjFromAss(onuAss);
        if (onuObj) {
            pushOnuDropStepsFromHost(steps, crossObj, f.cableId, f.fiberNumber, onuObj, onuAss, {});
            return steps;
        }

        var cable = findCableByUniqueIdLocal(f.cableId);
        if (!cable) continue;
        var otherEnd = typeof getOtherEndOfCable === 'function' ? getOtherEndOfCable(cable, crossObj) : null;
        if (otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'onu') {
            pushOnuDropStepsFromHost(steps, crossObj, f.cableId, f.fiberNumber, otherEnd, null, {});
            return steps;
        }
    }

    // 4) Любая onuConnections, чья жила относится к этому порту (физ. или логически)
    var onuMap = crossObj.properties.get('onuConnections') || {};
    var onuKeys = Object.keys(onuMap);
    for (var ok = 0; ok < onuKeys.length; ok++) {
        var key = onuKeys[ok];
        var ass = onuMap[key];
        if (!ass || !ass.onuId) continue;
        var parsed = typeof parseFiberConnectionKey === 'function'
            ? parseFiberConnectionKey(key)
            : (typeof parseFiberPortKey === 'function' ? parseFiberPortKey(key) : null);
        if (!parsed) continue;
        var portOfFiber = typeof getCrossPortForFiber === 'function'
            ? getCrossPortForFiber(crossObj, parsed.cableId, parsed.fiberNumber)
            : null;
        var matchesPort = portOfFiber != null && Number(portOfFiber) === Number(portNum);
        if (!matchesPort && logical &&
            parsed.cableId === logical.cableId &&
            Number(parsed.fiberNumber) === Number(logical.fiberNumber)) {
            matchesPort = true;
        }
        if (!matchesPort) continue;
        var onuFromMap = resolveOnuObjFromAss(ass);
        if (!onuFromMap) continue;
        var isLogical = logical && parsed.cableId === logical.cableId &&
            Number(parsed.fiberNumber) === Number(logical.fiberNumber);
        pushOnuDropStepsFromHost(steps, crossObj, parsed.cableId, parsed.fiberNumber, onuFromMap, ass, {
            logicalFiberOnly: !!isLogical,
            skipCable: !!isLogical
        });
        return steps;
    }

    // 5) ONU с incomingFiber на порту (отдельный drop-кабель)
    if (typeof objects !== 'undefined') {
        for (var oi = 0; oi < objects.length; oi++) {
            var cand = objects[oi];
            if (!cand.properties || cand.properties.get('type') !== 'onu') continue;
            var inc = cand.properties.get('incomingFiber');
            if (!inc || !inc.cableId) continue;
            var portOfInc = typeof getCrossPortForFiber === 'function'
                ? getCrossPortForFiber(crossObj, inc.cableId, inc.fiberNumber)
                : null;
            var onThisPort = portOfInc != null && Number(portOfInc) === Number(portNum);
            if (!onThisPort && logical &&
                inc.cableId === logical.cableId &&
                Number(inc.fiberNumber) === Number(logical.fiberNumber)) {
                onThisPort = true;
            }
            if (!onThisPort) continue;
            var dropCab = findCableByUniqueIdLocal(inc.cableId);
            var otherDrop = dropCab && typeof getOtherEndOfCable === 'function'
                ? getOtherEndOfCable(dropCab, crossObj)
                : null;
            var isRealDrop = otherDrop === cand ||
                (otherDrop && otherDrop.properties && getObjectUniqueId(otherDrop) === getObjectUniqueId(cand));
            if (isRealDrop) {
                pushOnuDropStepsFromHost(steps, crossObj, inc.cableId, inc.fiberNumber, cand, null, {});
                return steps;
            }
            // Линия связи по логической жиле
            if (logical && inc.cableId === logical.cableId &&
                Number(inc.fiberNumber) === Number(logical.fiberNumber)) {
                var hostAss = typeof getHostAssignment === 'function'
                    ? getHostAssignment(crossObj, 'onuConnections', inc.cableId, inc.fiberNumber)
                    : null;
                pushOnuDropStepsFromHost(steps, crossObj, inc.cableId, inc.fiberNumber, cand, hostAss, {
                    logicalFiberOnly: true,
                    skipCable: true
                });
                return steps;
            }
        }
    }

    return steps;
}

function buildSplitterOutputToCrossPortPathSteps(splitterObj, crossObj, outConn, outputIndex) {
    if (!splitterObj || !crossObj || !outConn || outConn.crossPort == null) return null;
    var portNum = parseInt(outConn.crossPort, 10);
    var crossName = crossObj.properties.get('name') || 'Кросс';
    var feeder = null;
    if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(splitterObj);
    feeder = splitterObj.properties.get('inputFiber') ||
        (typeof getSplitterRootInputFiber === 'function' ? getSplitterRootInputFiber(splitterObj) : null);

    var steps = [{
        type: 'splitterOutputToCrossPort',
        splitter: splitterObj,
        cross: crossObj,
        crossName: crossName,
        crossPort: portNum,
        outputIndex: outputIndex != null ? outputIndex : 0,
        cableId: feeder ? feeder.cableId : null,
        fiberNumber: feeder ? feeder.fiberNumber : null,
        connectorLossDb: (crossObj.properties.get('connectorLossDb') != null
            ? Number(crossObj.properties.get('connectorLossDb'))
            : 0.3)
    }, {
        type: 'object',
        objectType: 'cross',
        objectName: crossName,
        object: crossObj,
        port: portNum,
        signalRole: 'splitter-out-port'
    }];

    var cont = buildContinuationAfterSplitterCrossPort(
        crossObj,
        portNum,
        feeder ? feeder.cableId : null,
        feeder ? feeder.fiberNumber : null,
        splitterObj,
        outConn
    );
    return steps.concat(cont || []);
}

function appendSplitterDirectOutputSteps(path, splitterObj, outputConnections, targetOnuId) {
    var outs = outputConnections || [];
    var firstOutOnu = null;
    if (targetOnuId) {
        firstOutOnu = outs.find(function(o) { return o && o.onuId === targetOnuId; });
    }
    if (!firstOutOnu) {
        firstOutOnu = outs.find(function(o) { return o && o.onuId; });
    }
    if (firstOutOnu) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === firstOutOnu.onuId; });
        if (onuObj) {
            var onuSteps = typeof buildSplitterOutputToOnuPathSteps === 'function'
                ? buildSplitterOutputToOnuPathSteps(splitterObj, onuObj, firstOutOnu)
                : null;
            if (onuSteps && onuSteps.length) {
                onuSteps.forEach(function(step) { path.push(step); });
            } else {
                path.push({ type: 'splitterOutputToOnu', splitter: splitterObj, onuObj: onuObj, onuName: onuObj.properties.get('name') || 'ONU' });
                path.push({ type: 'object', objectType: 'onu', objectName: onuObj.properties.get('name') || 'ONU', object: onuObj, port: null });
            }
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
    var firstOutCross = outs.find(function(o) { return o && o.crossPort != null; });
    if (firstOutCross) {
        var crossHost = null;
        if (firstOutCross.hostId && typeof getMapObjectByUid === 'function') {
            crossHost = getMapObjectByUid(firstOutCross.hostId, 'cross');
        }
        if (!crossHost && splitterObj._host) crossHost = splitterObj._host;
        if (crossHost && typeof buildSplitterOutputToCrossPortPathSteps === 'function') {
            var outIdx = outs.indexOf(firstOutCross);
            var fullCrossSteps = buildSplitterOutputToCrossPortPathSteps(splitterObj, crossHost, firstOutCross, outIdx);
            if (fullCrossSteps && fullCrossSteps.length) {
                fullCrossSteps.forEach(function(step) { path.push(step); });
                var last = fullCrossSteps[fullCrossSteps.length - 1];
                if (last && last.objectType === 'onu') return true;
                var feeder = splitterObj.properties.get('inputFiber') ||
                    (typeof getSplitterRootInputFiber === 'function' ? getSplitterRootInputFiber(splitterObj) : null);
                return {
                    crossHost: crossHost,
                    crossPort: parseInt(firstOutCross.crossPort, 10),
                    cableId: feeder ? feeder.cableId : null,
                    fiberNumber: feeder ? feeder.fiberNumber : null
                };
            }
        }
        if (crossHost && typeof resolveSplitterCrossPortLogicalFiber === 'function') {
            var crossLogical = resolveSplitterCrossPortLogicalFiber(crossHost, firstOutCross.crossPort);
            if (crossLogical) {
                var crossName = crossHost.properties.get('name') || 'Кросс';
                var outIdxLegacy = outs.indexOf(firstOutCross);
                path.push({
                    type: 'splitterOutputToCrossPort',
                    splitter: splitterObj,
                    cross: crossHost,
                    crossName: crossName,
                    crossPort: parseInt(firstOutCross.crossPort, 10),
                    outputIndex: outIdxLegacy >= 0 ? outIdxLegacy : 0,
                    cableId: crossLogical.cableId,
                    fiberNumber: crossLogical.fiberNumber
                });
                path.push({
                    type: 'object',
                    objectType: 'cross',
                    objectName: crossName,
                    object: crossHost,
                    port: parseInt(firstOutCross.crossPort, 10)
                });
                return {
                    crossHost: crossHost,
                    crossPort: parseInt(firstOutCross.crossPort, 10),
                    cableId: crossLogical.cableId,
                    fiberNumber: crossLogical.fiberNumber
                };
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

function isOnuLinkedOnHost(onuId) {
    if (!onuId) return false;
    var onuKey = String(onuId);
    for (var i = 0; i < objects.length; i++) {
        var slot = objects[i];
        if (!slot.properties) continue;
        var st = slot.properties.get('type');
        if (!isFiberHostType(st)) continue;
        var onuConn = slot.properties.get('onuConnections') || {};
        for (var key in onuConn) {
            if (!Object.prototype.hasOwnProperty.call(onuConn, key)) continue;
            var conn = onuConn[key];
            if (conn && conn.onuId != null && String(conn.onuId) === onuKey) return true;
        }
    }
    return false;
}

function isMcLinkedOnHost(mcId) {
    if (!mcId) return false;
    var mcKey = String(mcId);
    for (var i = 0; i < objects.length; i++) {
        var slot = objects[i];
        if (!slot.properties) continue;
        var st = slot.properties.get('type');
        if (!isFiberHostType(st)) continue;
        var mcConn = slot.properties.get('mediaConverterConnections') || {};
        for (var key in mcConn) {
            if (!Object.prototype.hasOwnProperty.call(mcConn, key)) continue;
            var conn = mcConn[key];
            if (conn && conn.mediaConverterId != null && String(conn.mediaConverterId) === mcKey) return true;
        }
    }
    return false;
}

function isOnuIdInList(onuId, list) {
    if (!onuId || !list || !list.length) return false;
    var onuKey = String(onuId);
    for (var i = 0; i < list.length; i++) {
        if (list[i] != null && String(list[i]) === onuKey) return true;
    }
    return false;
}

function isOnuUsedInNetwork(onuId) {
    if (!onuId) return false;
    if (isOnuIdInList(onuId, getOnuIdsUsedBySplitterOutputs())) return true;
    if (typeof getOnuIdsUsedByOltPorts === 'function' && isOnuIdInList(onuId, getOnuIdsUsedByOltPorts())) return true;
    if (isOnuLinkedOnHost(onuId)) return true;
    var onuObj = getMapObjectByUid(onuId, 'onu');
    if (onuObj && onuObj.properties) {
        var inc = onuObj.properties.get('incomingFiber');
        if (inc && inc.cableId) {
            if (typeof isFiberExistingOnCable === 'function' &&
                !isFiberExistingOnCable(inc.cableId, inc.fiberNumber)) {
                onuObj.properties.set('incomingFiber', null);
            }
        }
    }
    return false;
}

function isMediaConverterUsedInNetwork(mcId) {
    if (!mcId) return false;
    if (isOnuIdInList(mcId, getMcIdsUsedBySplitterOutputs())) return true;
    if (typeof getMcIdsUsedByOltPorts === 'function' && isOnuIdInList(mcId, getMcIdsUsedByOltPorts())) return true;
    if (isMcLinkedOnHost(mcId)) return true;
    var mcObj = getMapObjectByUid(mcId, 'mediaConverter');
    if (mcObj && mcObj.properties) {
        var inc = mcObj.properties.get('incomingFiber');
        if (inc && inc.cableId) {
            if (typeof isFiberExistingOnCable === 'function' &&
                !isFiberExistingOnCable(inc.cableId, inc.fiberNumber)) {
                mcObj.properties.set('incomingFiber', null);
            }
        }
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
        return isFiberHostType(t);
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
            if (!out) continue;
            if (out.cableId === cableId && out.fiberNumber === fiberNumber) {
                if (out.onuId || out.splitterId || out.nodeId || out.mediaConverterId) continue;
                if (localOnly) {
                    if (!out.hostId || out.hostId === hostUid) {
                        return { splitterObj: sp, splitterId: spUid, outputIndex: oi, conn: out };
                    }
                } else if (out.hostId === hostUid) {
                    return { splitterObj: sp, splitterId: spUid, outputIndex: oi, conn: out };
                }
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
                atSleeveId: isSleeveLikeHostType(hostObj.properties.get('type')) ? hostUid : undefined,
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
    var outsMc = facade.properties.get('outputConnections') || [];
    var outMc = outsMc[outputIndex];
    if (outMc && outMc.mediaConverterId) {
        showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
        return;
    }
    if (outMc && (outMc.onuId || outMc.nodeId || outMc.splitterId)) {
        showWarning('Этот выход уже подключён.', 'Выход занят');
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
    var outsOnu = splitterObj.properties.get('outputConnections') || [];
    var outOnu = outsOnu[outIdx];
    if (outOnu && outOnu.onuId) {
        showWarning('На выходе уже подключено ONU.', 'Выход занят');
        return;
    }
    if (outOnu && (outOnu.mediaConverterId || outOnu.nodeId || outOnu.splitterId)) {
        showWarning('Этот выход уже подключён.', 'Выход занят');
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
    splitterOutputOnuModalData = { mode: 'splitter', splitterObj: splitterObj, outIdx: outIdx, onus: onus };
    var modal = document.getElementById('splitterOutputOnuModal');
    var listEl = document.getElementById('splitterOutputOnuList');
    var titleEl = modal && modal.querySelector('.group-balloon-title');
    var infoEl = modal && modal.querySelector('.node-selection-info');
    if (titleEl) titleEl.textContent = 'Выбор ONU для выхода';
    if (infoEl) infoEl.textContent = 'Выберите свободную ONU';
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
    if (data.mode === 'oltPort') {
        startOltPortOnuRouting(data.oltObj, data.portNumber, onuObj, getObjectUniqueId(onuObj));
        return;
    }
    if (data.mode === 'oltPortMc') {
        startOltPortMcRouting(data.oltObj, data.portNumber, onuObj, getObjectUniqueId(onuObj));
        return;
    }
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'onu', onuObj, getObjectUniqueId(onuObj));
}

function selectSplitterOutputMc(mcIndex) {
    if (!splitterOutputOnuModalData) return;
    var data = splitterOutputOnuModalData;
    var list = data.mcs || data.onus;
    if (mcIndex < 0 || !list || mcIndex >= list.length) return;
    var mcObj = list[mcIndex];
    closeSplitterOutputOnuModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    if (data.mode === 'oltPortMc') {
        startOltPortMcRouting(data.oltObj, data.portNumber, mcObj, getObjectUniqueId(mcObj));
        return;
    }
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'mediaConverter', mcObj, getObjectUniqueId(mcObj));
}

function startOltPortOnuRouting(oltObj, portNumber, onuObj, onuId) {
    if (!oltObj || portNumber == null || !onuObj) return;
    if (typeof isOltPortInUse === 'function' && isOltPortInUse(oltObj, portNumber)) {
        showWarning('PON-порт уже занят.', 'Порт занят');
        return;
    }
    if (onuId && isOnuUsedInNetwork(onuId)) {
        showError('Это ONU уже подключено к сети.', 'ONU занято');
        return;
    }
    splitterFiberRoutingMode = true;
    splitterFiberRoutingData = {
        sourceKind: 'oltPort',
        oltObj: oltObj,
        portNumber: portNumber,
        routingAnchor: oltObj,
        targetType: 'onu',
        targetObj: onuObj,
        targetId: onuId || getObjectUniqueId(onuObj)
    };
    splitterFiberWaypoints = [];
    var oltName = oltObj.properties.get('name') || 'OLT';
    var portLbl = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '', true)
        : ('п.' + portNumber);
    var targetName = getFiberRoutingTargetLabel('onu', onuObj);
    showInfo('Режим прокладки жилы: OLT ' + portLbl + ' (' + oltName + ') → ' + targetName +
        '. Кликайте по опорам и креплениям для маршрута, затем по ONU или ящику с ONU (фиолетовая обводка) для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(oltObj);
    applyGponRoutingMapHighlight(oltObj, onuObj);
    syncMapPanLockForEditTools();
    if (areFiberRoutingHostsCoLocated(oltObj, onuObj)) {
        completeSplitterFiberRouting();
    }
}

function startOltPortMcRouting(oltObj, portNumber, mcObj, mcId) {
    if (!oltObj || portNumber == null || !mcObj) return;
    if (typeof isOltPortInUse === 'function' && isOltPortInUse(oltObj, portNumber)) {
        showWarning('PON-порт уже занят.', 'Порт занят');
        return;
    }
    if (mcId && isMediaConverterUsedInNetwork(mcId)) {
        showError('Этот медиаконвертер уже подключён к сети.', 'МК занят');
        return;
    }
    splitterFiberRoutingMode = true;
    splitterFiberRoutingData = {
        sourceKind: 'oltPort',
        oltObj: oltObj,
        portNumber: portNumber,
        routingAnchor: oltObj,
        targetType: 'mediaConverter',
        targetObj: mcObj,
        targetId: mcId || getObjectUniqueId(mcObj)
    };
    splitterFiberWaypoints = [];
    var oltName = oltObj.properties.get('name') || 'OLT';
    var portLbl = typeof formatOltPortDisplay === 'function'
        ? formatOltPortDisplay(portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '', true)
        : ('п.' + portNumber);
    var targetName = getFiberRoutingTargetLabel('mediaConverter', mcObj);
    showInfo('Режим прокладки жилы: OLT ' + portLbl + ' (' + oltName + ') → ' + targetName +
        '. Кликайте по опорам и креплениям для маршрута, затем по медиаконвертеру или ящику с МК (фиолетовая обводка) для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(oltObj);
    applyGponRoutingMapHighlight(oltObj, mcObj);
    syncMapPanLockForEditTools();
    if (areFiberRoutingHostsCoLocated(oltObj, mcObj)) {
        completeSplitterFiberRouting();
    }
}

function startSplitterFiberRouting(splitterObj, outIdx, targetType, targetObj, targetId, cableId, fiberNumber) {
    splitterFiberRoutingMode = true;
    var routingAnchor = getSplitterRoutingAnchor(splitterObj);
    splitterFiberRoutingData = {
        sourceKind: 'splitter',
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
    showInfo('Режим прокладки жилы: ' + anchorName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту (фиолетовая пульсирующая обводка) для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(routingAnchor || splitterObj);
    applyGponRoutingMapHighlight(routingAnchor || splitterObj, targetObj);
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
    clearGponRoutingMapHighlight();
    clearSelection();
    syncMapPanLockForEditTools();
}

function completeSplitterFiberRouting() {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    var data = splitterFiberRoutingData;

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

    if (data.sourceKind === 'oltPort') {
        if (!data.oltObj || data.portNumber == null) return;
        if (data.targetType === 'onu') {
            if (!connectOltPortToOnu(data.oltObj, data.portNumber, data.targetObj, routeIds)) return;
        } else if (data.targetType === 'mediaConverter') {
            if (!connectOltPortToMediaConverter(data.oltObj, data.portNumber, data.targetObj, routeIds)) return;
        } else {
            return;
        }
        if (splitterFiberPreviewLine) {
            myMap.geoObjects.remove(splitterFiberPreviewLine);
            splitterFiberPreviewLine = null;
        }
        splitterFiberRoutingMode = false;
        splitterFiberRoutingData = null;
        splitterFiberWaypoints = [];
        clearGponRoutingMapHighlight();
        clearSelection();
        syncMapPanLockForEditTools();
        if (typeof showSuccess === 'function') {
            var portLblDone = typeof formatOltPortDisplay === 'function'
                ? formatOltPortDisplay(data.portNumber, typeof getOltPortLabel === 'function' ? getOltPortLabel(data.oltObj, data.portNumber) : '', true)
                : ('порт ' + data.portNumber);
            var targetNameDone = data.targetObj.properties.get('name') ||
                (data.targetType === 'mediaConverter' ? 'Медиаконвертер' : 'ONU');
            var targetKind = data.targetType === 'mediaConverter' ? 'медиаконвертеру' : 'ONU';
            showSuccess('PON ' + portLblDone + ' подключён к ' + targetKind + ' «' + targetNameDone + '».', 'OLT');
        }
        if (typeof refreshObjectModal === 'function') refreshObjectModal(data.oltObj);
        else if (typeof showObjectInfo === 'function') showObjectInfo(data.oltObj);
        return;
    }

    var sp = data.splitterObj;
    var ratio = parseInt(sp.properties.get('splitRatio'), 10) || 8;
    var outputs = (sp.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    
    var rootInput = getSplitterRootInputFiber(sp);
    var existingOut = outputs[data.outIdx];
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
        if (existingOut && existingOut.splitterId) {
            showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
            return;
        }
        if (existingOut && existingOut.mediaConverterId) {
            showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
            return;
        }
        outputs[data.outIdx] = typeof mergeSplitterOutputConnection === 'function'
            ? mergeSplitterOutputConnection(existingOut, { onuId: data.targetId, routeIds: routeIds })
            : { onuId: data.targetId, routeIds: routeIds };
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
        if (isMediaConverterUsedInNetwork(data.targetId)) {
            showError('Этот медиаконвертер уже подключён к сети.', 'МК занят');
            return;
        }
        if (existingOut && existingOut.splitterId) {
            showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
            return;
        }
        if (existingOut && existingOut.onuId) {
            showWarning('На выходе уже подключено ONU.', 'Выход занят');
            return;
        }
        if (existingOut && existingOut.mediaConverterId) {
            showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
            return;
        }
        outputs[data.outIdx] = typeof mergeSplitterOutputConnection === 'function'
            ? mergeSplitterOutputConnection(existingOut, { mediaConverterId: data.targetId, routeIds: routeIds })
            : { mediaConverterId: data.targetId, routeIds: routeIds };
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            data.targetObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
        }
    } else if (data.targetType === 'host') {
        if (!data.cableId || data.fiberNumber == null) {
            showError('Не выбрана жила в муфте/кроссе.', 'Ошибка');
            return;
        }
        if (existingOut && existingOut.splitterId) {
            showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
            return;
        }
        outputs[data.outIdx] = typeof mergeSplitterOutputConnection === 'function'
            ? mergeSplitterOutputConnection(existingOut, {
                hostId: data.targetId,
                cableId: data.cableId,
                fiberNumber: data.fiberNumber,
                routeIds: routeIds
            }, { preserveCrossPort: true })
            : {
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
    clearGponRoutingMapHighlight();
    clearSelection();
    refreshSplitterUiAfterChange(sp);
    syncMapPanLockForEditTools();
}
