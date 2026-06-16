/**
 * Линии GPON-связей на карте.
 */
function getNodeConnFiberUsageExclude(hostObj) {
    var uid = getObjectUniqueId(hostObj);
    if (hostObj.properties.get('type') === 'sleeve') {
        return { type: 'nodeConn', sleeveId: uid, atSleeveId: uid };
    }
    return { type: 'nodeConn', crossId: uid, atCrossId: uid };
}

function connectFiberToNode(crossObj, cableId, fiberNumber, nodeObj, switchId, switchPort) {
    const crossId = crossObj.properties.get('uniqueId');
    const usage = getFiberUsage(cableId, fiberNumber, getNodeConnFiberUsageExclude(crossObj));
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    if (!switchId || switchPort == null || isNaN(parseInt(switchPort, 10))) {
        showError('Выберите коммутатор и оптический порт (SFP, SFP+, QSFP, Комбо) для подключения.', 'Порт');
        return;
    }
    var portNum = parseInt(switchPort, 10);
    var swAtt = findAttachedSwitchOnNode(nodeObj, switchId);
    if (!swAtt) {
        showError('Коммутатор не найден в узле.', 'Ошибка');
        return;
    }
    var typesAtt = swAtt.switchPortTypes || [];
    if (portNum < 1 || portNum > typesAtt.length) {
        showError('Некорректный номер порта коммутатора.', 'Порт');
        return;
    }
    if (!isSwitchPortSfpFiberType(typesAtt[portNum - 1])) {
        showError('К кроссу или муфте можно подключить жилу только в оптический порт коммутатора (SFP, SFP+, QSFP, Комбо).', 'Тип порта');
        return;
    }
    var fusAtt = swAtt.fiberPortUsage || {};
    if (fusAtt[String(portNum)]) {
        showError('Выбранный SFP-порт уже занят другой жилой. Выберите другой порт.', 'Порт занят');
        return;
    }
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
    }

    const key = `${cableId}-${fiberNumber}`;
    const nodeUniqueId = nodeObj.properties.get('uniqueId') || generateUniqueId('node');
    const crossUniqueId = crossObj.properties.get('uniqueId') || generateUniqueId('cross');

    if (!nodeObj.properties.get('uniqueId')) {
        nodeObj.properties.set('uniqueId', nodeUniqueId);
    }
    if (!crossObj.properties.get('uniqueId')) {
        crossObj.properties.set('uniqueId', crossUniqueId);
    }

    nodeConnections[key] = {
        nodeId: nodeUniqueId,
        nodeName: nodeObj.properties.get('name') || 'Узел',
        switchId: switchId,
        switchPort: portNum,
        switchPortType: typesAtt[portNum - 1]
    };

    crossObj.properties.set('nodeConnections', nodeConnections);
    markNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum, key);

    createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber);

    saveData();

    showObjectInfo(crossObj);
}

function disconnectFiberFromNode(crossObj, cableId, fiberNumber) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;

    const key = `${cableId}-${fiberNumber}`;
    const conn = nodeConnections[key];

    removeNodeConnectionLine(crossObj, cableId, fiberNumber);

    if (conn && conn.nodeId && conn.switchId != null && conn.switchPort != null) {
        var nodeObjDisc = objects.find(function(n) {
            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === conn.nodeId;
        });
        if (nodeObjDisc) {
            clearNodeSwitchFiberPortOccupied(nodeObjDisc, conn.switchId, conn.switchPort);
        }
    }

    delete nodeConnections[key];

    crossObj.properties.set('nodeConnections', nodeConnections);
    saveData();

    showObjectInfo(crossObj);
}

function disconnectFiberFromOnu(sleeveObj, cableId, fiberNumber) {
    let onuConnections = sleeveObj.properties.get('onuConnections');
    if (!onuConnections) return;
    const key = cableId + '-' + fiberNumber;
    const conn = onuConnections[key];
    if (conn && conn.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === conn.onuId; });
        if (onuObj) {
            var if_ = onuObj.properties.get('incomingFiber');
            if (if_ && if_.cableId === cableId && if_.fiberNumber === fiberNumber) {
                onuObj.properties.set('incomingFiber', null);
            }
        }
    }
    removeOnuConnectionLine(sleeveObj, cableId, fiberNumber);
    delete onuConnections[key];
    sleeveObj.properties.set('onuConnections', onuConnections);
    saveData();
    showObjectInfo(sleeveObj);
}

function connectFiberToOnuWithRoute(sleeveObj, cableId, fiberNumber, onuObj, routeIds) {
    routeIds = resolveGponRouteIds(routeIds);
    const sleeveId = sleeveObj.properties.get('uniqueId');
    const onuId = getObjectUniqueId(onuObj);
    if (isOnuUsedInNetwork(onuId)) {
        showError('Это ONU уже подключено к сети. Сначала отключите его от текущей жилы или выхода сплиттера.', 'ONU занято');
        return;
    }
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'onuConn', sleeveId: sleeveId, onuId: onuId, atSleeveId: sleeveId });
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    let onuConnections = sleeveObj.properties.get('onuConnections');
    if (!onuConnections) {
        onuConnections = {};
    }
    const key = cableId + '-' + fiberNumber;
    const onuUniqueId = onuObj.properties.get('uniqueId') || generateUniqueId('onu');
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId') || generateUniqueId('cross');
    if (!onuObj.properties.get('uniqueId')) onuObj.properties.set('uniqueId', onuUniqueId);
    if (!sleeveObj.properties.get('uniqueId')) sleeveObj.properties.set('uniqueId', sleeveUniqueId);
    onuConnections[key] = { onuId: onuUniqueId, onuName: onuObj.properties.get('name') || 'ONU', routeIds: routeIds || [] };
    sleeveObj.properties.set('onuConnections', onuConnections);
    onuObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    createOnuConnectionLine(sleeveObj, onuObj, cableId, fiberNumber, routeIds);
    saveData();
}

function connectFiberToMediaConverterWithRoute(sleeveObj, cableId, fiberNumber, mcObj, routeIds) {
    routeIds = resolveGponRouteIds(routeIds);
    const placeId = sleeveObj.properties.get('uniqueId');
    const mcId = getObjectUniqueId(mcObj);
    const slotTypeMc = sleeveObj.properties.get('type');
    const usageOptsMc = { type: 'mediaConverterConn', mediaConverterId: mcId };
    if (slotTypeMc === 'cross') {
        usageOptsMc.crossId = placeId;
        usageOptsMc.atCrossId = placeId;
    } else {
        usageOptsMc.sleeveId = placeId;
        usageOptsMc.atSleeveId = placeId;
    }
    const usage = getFiberUsage(cableId, fiberNumber, usageOptsMc);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    let mcConnections = sleeveObj.properties.get('mediaConverterConnections');
    if (!mcConnections) {
        mcConnections = {};
    }
    const key = cableId + '-' + fiberNumber;
    const mcUniqueId = mcObj.properties.get('uniqueId') || generateUniqueId('mediaConverter');
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId') || generateUniqueId('cross');
    if (!mcObj.properties.get('uniqueId')) mcObj.properties.set('uniqueId', mcUniqueId);
    if (!sleeveObj.properties.get('uniqueId')) sleeveObj.properties.set('uniqueId', sleeveUniqueId);
    mcConnections[key] = { mediaConverterId: mcUniqueId, mediaConverterName: mcObj.properties.get('name') || 'Медиаконвертер', routeIds: routeIds || [] };
    sleeveObj.properties.set('mediaConverterConnections', mcConnections);
    mcObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    createMediaConverterConnectionLine(sleeveObj, mcObj, cableId, fiberNumber, routeIds);
    saveData();
}

function disconnectFiberFromMediaConverter(sleeveObj, cableId, fiberNumber) {
    let mcConnections = sleeveObj.properties.get('mediaConverterConnections');
    if (!mcConnections) return;
    const key = cableId + '-' + fiberNumber;
    const conn = mcConnections[key];
    if (conn && conn.mediaConverterId) {
        var mcObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === conn.mediaConverterId; });
        if (mcObj) {
            var ifMc = mcObj.properties.get('incomingFiber');
            if (ifMc && ifMc.cableId === cableId && ifMc.fiberNumber === fiberNumber) {
                mcObj.properties.set('incomingFiber', null);
            }
        }
    }
    removeOnuConnectionLine(sleeveObj, cableId, fiberNumber);
    delete mcConnections[key];
    sleeveObj.properties.set('mediaConverterConnections', mcConnections);
    saveData();
    showObjectInfo(sleeveObj);
}

function createOnuConnectionLine(sleeveObj, onuObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const onuCoords = onuObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOnuConnectionLineByKey(key);
    const onuName = onuObj.properties.get('name') || 'ONU';
    routeIds = resolveGponRouteIds(routeIds);
    
    var points = [sleeveCoords].concat(gponRouteWaypointCoords(routeIds)).concat([onuCoords]);
    
    const line = new ymaps.Polyline(points, {}, getConnectionLinePolylineOptions('#22c55e'));
    line.properties.set('type', 'onuConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('onuName', onuName);
    line.properties.set('routeIds', routeIds);
    onuConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function createMediaConverterConnectionLine(sleeveObj, mcObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const mcCoords = mcObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOnuConnectionLineByKey(key);
    const mcName = mcObj.properties.get('name') || 'Медиаконвертер';
    routeIds = resolveGponRouteIds(routeIds);
    var points = [sleeveCoords].concat(gponRouteWaypointCoords(routeIds)).concat([mcCoords]);
    const line = new ymaps.Polyline(points, {}, getConnectionLinePolylineOptions('#14b8a6'));
    line.properties.set('type', 'mediaConverterConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('mediaConverterName', mcName);
    line.properties.set('routeIds', routeIds);
    onuConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeOnuConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeOnuConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeOnuConnectionLineByKey(key) {
    const idx = onuConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(onuConnectionLines[idx]);
        onuConnectionLines.splice(idx, 1);
    }
}

function createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber) {
    const crossCoords = crossObj.geometry.getCoordinates();
    const nodeCoords = nodeObj.geometry.getCoordinates();
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;

    removeNodeConnectionLineByKey(key);
    
    const nodeName = nodeObj.properties.get('name') || 'Узел';
    const line = new ymaps.Polyline([crossCoords, nodeCoords], {}, getConnectionLinePolylineOptions('#22c55e'));
    
    line.properties.set('type', 'nodeConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('crossId', crossUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('nodeName', nodeName);

    line.events.add('click', function (e) {
        const coords = e.get('coords');
        const fiberNum = line.properties.get('fiberNumber');
        const name = line.properties.get('nodeName') || 'Узел';
        const balloonHtml = '<div class="network-map-balloon">' +
            '<div class="group-balloon-header">' +
            '<span class="group-balloon-title">Соединение с узлом</span>' +
            '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
            '</div>' +
            '<div class="node-selection-body" style="padding: 16px 14px;">' +
            'Жила ' + fiberNum + '<br>→ ' + escapeHtml(name) +
            '</div></div>';
        myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
    });
    
    nodeConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeNodeConnectionLine(crossObj, cableId, fiberNumber) {
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;
    removeNodeConnectionLineByKey(key);
}

function removeNodeConnectionLineByKey(key) {
    const lineIndex = nodeConnectionLines.findIndex(line => 
        line.properties.get('connectionKey') === key
    );
    
    if (lineIndex !== -1) {
        myMap.geoObjects.remove(nodeConnectionLines[lineIndex]);
        nodeConnectionLines.splice(lineIndex, 1);
    }
}

function scheduleConnectionLinesUpdate(uidOrList) {
    if (typeof MapPerf !== 'undefined') {
        MapPerf.scheduleConnectionLinesUpdate(uidOrList);
        return;
    }
    updateAllConnectionLines();
}

function applyConnectionLinesVisibility() {
    if (!myMap || typeof myMap.getZoom !== 'function') return;
    var zoom = myMap.getZoom();
    if (!mapObjectsVisibleAtZoom(zoom)) {
        setAllConnectionLinesVisible(false);
        return;
    }
    try { setAllConnectionLinesVisible(true); } catch (e) {}
    try { applyConnectionLinesMapStyle(); } catch (e) {}
    if (window.MapRegions && MapRegions.syncConnectionLinesVisibility) {
        MapRegions.syncConnectionLinesVisibility(objects, {
            onuConnectionLines: typeof onuConnectionLines !== 'undefined' ? onuConnectionLines : [],
            oltConnectionLines: typeof oltConnectionLines !== 'undefined' ? oltConnectionLines : [],
            splitterConnectionLines: typeof splitterConnectionLines !== 'undefined' ? splitterConnectionLines : [],
            splitterOutputConnectionLines: typeof splitterOutputConnectionLines !== 'undefined' ? splitterOutputConnectionLines : [],
            nodeConnectionLines: typeof nodeConnectionLines !== 'undefined' ? nodeConnectionLines : []
        });
    }
}

function removeHostConnectionLines(hostUid) {
    var i;
    for (i = onuConnectionLines.length - 1; i >= 0; i--) {
        if (onuConnectionLines[i].properties.get('sleeveId') === hostUid) {
            myMap.geoObjects.remove(onuConnectionLines[i]);
            onuConnectionLines.splice(i, 1);
        }
    }
    for (i = oltConnectionLines.length - 1; i >= 0; i--) {
        if (oltConnectionLines[i].properties.get('sleeveId') === hostUid) {
            myMap.geoObjects.remove(oltConnectionLines[i]);
            oltConnectionLines.splice(i, 1);
        }
    }
    for (i = splitterConnectionLines.length - 1; i >= 0; i--) {
        if (splitterConnectionLines[i].properties.get('sleeveId') === hostUid) {
            myMap.geoObjects.remove(splitterConnectionLines[i]);
            splitterConnectionLines.splice(i, 1);
        }
    }
}

function removeNodeLinesForCross(crossUid) {
    for (var i = nodeConnectionLines.length - 1; i >= 0; i--) {
        if (nodeConnectionLines[i].properties.get('crossId') === crossUid) {
            myMap.geoObjects.remove(nodeConnectionLines[i]);
            nodeConnectionLines.splice(i, 1);
        }
    }
}

function removeSplitterOutputLinesForSplitter(splitterUid) {
    for (var i = splitterOutputConnectionLines.length - 1; i >= 0; i--) {
        if (splitterOutputConnectionLines[i].properties.get('splitterId') === splitterUid) {
            myMap.geoObjects.remove(splitterOutputConnectionLines[i]);
            splitterOutputConnectionLines.splice(i, 1);
        }
    }
}

function rebuildHostFiberConnections(obj) {
    if (!obj || !obj.properties) return;
    var type = obj.properties.get('type');
    if (type !== 'cross' && type !== 'sleeve') return;
    var hostUid = getObjectUniqueId(obj);
    var onuConnections = obj.properties.get('onuConnections');
    if (onuConnections) {
        Object.keys(onuConnections).forEach(function(key) {
            var conn = onuConnections[key];
            var parts = key.split('-');
            var fiberNumberParsed = parseInt(parts.pop(), 10);
            var cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            var onuObj = getMapObjectByUid(conn.onuId, 'onu');
            if (onuObj) createOnuConnectionLine(obj, onuObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    }
    var mcConnections = obj.properties.get('mediaConverterConnections');
    if (mcConnections) {
        Object.keys(mcConnections).forEach(function(key) {
            var conn = mcConnections[key];
            var parts = key.split('-');
            var fiberNumberParsed = parseInt(parts.pop(), 10);
            var cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            var mcObj = getMapObjectByUid(conn.mediaConverterId, 'mediaConverter');
            if (mcObj) createMediaConverterConnectionLine(obj, mcObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    }
    var oltConnections = obj.properties.get('oltConnections');
    if (oltConnections) {
        Object.keys(oltConnections).forEach(function(key) {
            var conn = oltConnections[key];
            if (!conn || !conn.oltId) return;
            var parts = key.split('-');
            var fiberNumberParsed = parseInt(parts.pop(), 10);
            var cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            var oltObj = getMapObjectByUid(conn.oltId, 'olt');
            if (oltObj) createOltConnectionLine(obj, oltObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    }
    var splitterConnections = obj.properties.get('splitterConnections');
    if (splitterConnections) {
        Object.keys(splitterConnections).forEach(function(key) {
            var conn = splitterConnections[key];
            if (!conn || !conn.splitterId) return;
            var parts = key.split('-');
            var fiberNumberParsed = parseInt(parts.pop(), 10);
            var cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            var splitterObj = resolveMapSplitterForConnectionLine(conn.splitterId);
            if (splitterObj) createSplitterConnectionLine(obj, splitterObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    }
}

function rebuildNodeLinesForCross(crossObj) {
    if (!crossObj || !crossObj.properties) return;
    var crossUid = getObjectUniqueId(crossObj);
    removeNodeLinesForCross(crossUid);
    var nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;
    Object.keys(nodeConnections).forEach(function(key) {
        var conn = nodeConnections[key];
        var parts = key.split('-');
        var fiberNumberParsed = parseInt(parts.pop(), 10);
        var cableIdParsed = parts.join('-');
        if (!crossHasFiberForConnection(crossObj, cableIdParsed, fiberNumberParsed)) return;
        var nodeObj = getMapObjectByUid(conn.nodeId, 'node');
        if (nodeObj) createNodeConnectionLine(crossObj, nodeObj, cableIdParsed, fiberNumberParsed);
    });
}

function rebuildSplitterOutputLines(splitterObj) {
    if (!splitterObj || !splitterObj.properties) return;
    var splitterUid = getObjectUniqueId(splitterObj);
    removeSplitterOutputLinesForSplitter(splitterUid);
    var outputs = splitterObj.properties.get('outputConnections') || [];
    for (var oi = 0; oi < outputs.length; oi++) {
        var out = outputs[oi];
        if (!out) continue;
        var target = null;
        if (out.onuId) target = getMapObjectByUid(out.onuId, 'onu');
        else if (out.mediaConverterId) target = getMapObjectByUid(out.mediaConverterId, 'mediaConverter');
        else if (out.nodeId) target = getMapObjectByUid(out.nodeId, 'node');
        else if (out.splitterId) target = getMapObjectByUid(out.splitterId, 'splitter');
        else if (out.hostId) {
            target = getMapObjectByUid(out.hostId, 'sleeve') || getMapObjectByUid(out.hostId, 'cross');
        }
        var sourceObj = getSplitterRoutingAnchor(splitterObj) || splitterObj;
        if (target) createSplitterOutputConnectionLine(sourceObj, target, oi, out.routeIds || out.route || []);
    }
}

function connectionRouteUsesWaypoint(conn, wpUid) {
    if (!conn || !wpUid) return false;
    var routeIds = conn.routeIds || conn.route || [];
    return Array.isArray(routeIds) && routeIds.indexOf(wpUid) !== -1;
}

function rebuildLinesThroughWaypoint(wpUid) {
    if (!wpUid) return;
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cross' || t === 'sleeve') {
            var hostUid = getObjectUniqueId(obj);
            var needsRebuild = false;
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'splitterConnections'].forEach(function(prop) {
                var conns = obj.properties.get(prop);
                if (!conns) return;
                Object.keys(conns).forEach(function(key) {
                    if (connectionRouteUsesWaypoint(conns[key], wpUid)) needsRebuild = true;
                });
            });
            var embeddedRouteHit = false;
            if (window.EmbeddedSplitters) {
                (EmbeddedSplitters.getList(obj) || []).forEach(function(rec) {
                    (rec.outputConnections || []).forEach(function(out) {
                        if (out && connectionRouteUsesWaypoint(out, wpUid)) embeddedRouteHit = true;
                    });
                });
            }
            if (needsRebuild) {
                removeHostConnectionLines(hostUid);
                rebuildHostFiberConnections(obj);
            }
            if (embeddedRouteHit) updateSplitterOutputConnectionLines();
        } else if (t === 'splitter') {
            var outputs = obj.properties.get('outputConnections') || [];
            for (var i = 0; i < outputs.length; i++) {
                if (connectionRouteUsesWaypoint(outputs[i], wpUid)) {
                    rebuildSplitterOutputLines(obj);
                    break;
                }
            }
        }
    });
}

function rebuildLinesTargetingEndpoint(endpointUid, endpointType) {
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var t = obj.properties.get('type');
        if (t !== 'cross' && t !== 'sleeve') return;
        var changed = false;
        if (endpointType === 'onu') {
            var onuC = obj.properties.get('onuConnections');
            if (onuC && Object.keys(onuC).some(function(k) { return onuC[k] && onuC[k].onuId === endpointUid; })) changed = true;
        } else if (endpointType === 'olt') {
            var oltC = obj.properties.get('oltConnections');
            if (oltC && Object.keys(oltC).some(function(k) { return oltC[k] && oltC[k].oltId === endpointUid; })) changed = true;
        } else if (endpointType === 'mediaConverter') {
            var mcC = obj.properties.get('mediaConverterConnections');
            if (mcC && Object.keys(mcC).some(function(k) { return mcC[k] && mcC[k].mediaConverterId === endpointUid; })) changed = true;
        } else if (endpointType === 'splitter') {
            var spC = obj.properties.get('splitterConnections');
            if (spC && Object.keys(spC).some(function(k) { return spC[k] && spC[k].splitterId === endpointUid; })) changed = true;
        }
        if (changed) {
            removeHostConnectionLines(getObjectUniqueId(obj));
            rebuildHostFiberConnections(obj);
        }
    });
    if (endpointType === 'splitter') {
        objects.forEach(function(obj) {
            if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
            var outputs = obj.properties.get('outputConnections') || [];
            for (var i = 0; i < outputs.length; i++) {
                if (outputs[i] && (outputs[i].onuId === endpointUid || outputs[i].splitterId === endpointUid)) {
                    rebuildSplitterOutputLines(obj);
                    break;
                }
            }
        });
    }
}

function syncConnectionLinesForObject(obj) {
    if (!obj || !obj.properties) return;
    var type = obj.properties.get('type');
    var uid = getObjectUniqueId(obj);
    if (type === 'cross') {
        removeHostConnectionLines(uid);
        rebuildHostFiberConnections(obj);
        rebuildNodeLinesForCross(obj);
    } else if (type === 'sleeve') {
        removeHostConnectionLines(uid);
        rebuildHostFiberConnections(obj);
        rebuildNodeLinesForCross(obj);
    } else if (type === 'splitter') {
        rebuildSplitterOutputLines(obj);
        rebuildLinesTargetingEndpoint(uid, 'splitter');
    } else if (type === 'onu') {
        rebuildLinesTargetingEndpoint(uid, 'onu');
    } else if (type === 'olt') {
        rebuildLinesTargetingEndpoint(uid, 'olt');
    } else if (type === 'mediaConverter') {
        rebuildLinesTargetingEndpoint(uid, 'mediaConverter');
    } else if (type === 'node') {
        objects.forEach(function(host) {
            var ht = host.properties ? host.properties.get('type') : null;
            if (!host.properties || (ht !== 'cross' && ht !== 'sleeve')) return;
            var nc = host.properties.get('nodeConnections');
            if (!nc) return;
            if (Object.keys(nc).some(function(k) { return nc[k] && nc[k].nodeId === uid; })) {
                rebuildNodeLinesForCross(host);
            }
        });
    } else if (type === 'support' || type === 'attachment') {
        rebuildLinesThroughWaypoint(uid);
    }
}

function purgeConnectionLinesForMissingUid(uid) {
    if (!uid) return;
    var prefixes = [uid + '-'];
    function lineMatches(line) {
        var key = line.properties.get('connectionKey');
        if (key && String(key).indexOf(uid) === 0) return true;
        var sid = line.properties.get('sleeveId') || line.properties.get('crossId') || line.properties.get('splitterId');
        return sid === uid;
    }
    [nodeConnectionLines, onuConnectionLines, oltConnectionLines, splitterConnectionLines, splitterOutputConnectionLines].forEach(function(arr) {
        for (var i = arr.length - 1; i >= 0; i--) {
            if (lineMatches(arr[i])) {
                myMap.geoObjects.remove(arr[i]);
                arr.splice(i, 1);
            }
        }
    });
}

window.flushMapConnectionLines = function(pendingUids) {
    if (!pendingUids || !(pendingUids instanceof Set) || pendingUids.size === 0) {
        updateAllConnectionLines();
        return;
    }
    pendingUids.forEach(function(uid) {
        var obj = getMapObjectByUid(uid);
        if (obj) syncConnectionLinesForObject(obj);
        else purgeConnectionLinesForMissingUid(uid);
    });
    applyConnectionLinesVisibility();
};

function updateAllConnectionLines() {
    updateAllNodeConnectionLines();
    updateOnuConnectionLines();
    updateOltConnectionLines();
    updateSplitterConnectionLines();
    updateSplitterOutputConnectionLines();
    applyConnectionLinesVisibility();
}

function createSplitterOutputConnectionLine(sourceObj, targetObj, outIdx, routeIds, connectionKey) {
    if (!sourceObj || !targetObj || !sourceObj.geometry || !targetObj.geometry) return;
    var splitterId = getObjectUniqueId(sourceObj);
    var key = connectionKey || (splitterId + '-out-' + outIdx);
    var idx = splitterOutputConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(splitterOutputConnectionLines[idx]);
        splitterOutputConnectionLines.splice(idx, 1);
    }
    var sourceCoords = sourceObj.geometry.getCoordinates();
    var targetCoords = targetObj.geometry.getCoordinates();
    var targetType = targetObj.properties ? targetObj.properties.get('type') : '';
    routeIds = resolveGponRouteIds(routeIds);
    
    var lineCoords = [sourceCoords].concat(gponRouteWaypointCoords(routeIds)).concat([targetCoords]);
    
    var stroke = targetType === 'onu' ? '#a855f7' : (targetType === 'mediaConverter' ? '#14b8a6' : (targetType === 'node' ? '#22c55e' : (targetType === 'sleeve' || targetType === 'cross' ? '#ef4444' : '#f97316')));
    var line = new ymaps.Polyline(lineCoords, {}, getConnectionLinePolylineOptions(stroke));
    line.properties.set('type', 'splitterOutputConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('splitterId', splitterId);
    line.properties.set('outputIndex', outIdx);
    line.properties.set('routeIds', routeIds);
    splitterOutputConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function syncSplitterOutputDeviceFibers() {
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
        var rootInput = getSplitterRootInputFiber(obj);
        if (!rootInput || !rootInput.cableId || rootInput.fiberNumber == null) return;
        var outputs = obj.properties.get('outputConnections') || [];
        outputs.forEach(function(out) {
            if (!out) return;
            if (out.onuId) {
                var onuObj = getMapObjectByUid(out.onuId, 'onu');
                if (!onuObj) return;
                var inc = onuObj.properties.get('incomingFiber');
                if (!inc || !inc.cableId) {
                    onuObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
                }
            } else if (out.splitterId) {
                var childSp = getMapObjectByUid(out.splitterId, 'splitter');
                if (!childSp) return;
                var childIn = childSp.properties.get('inputFiber');
                if (!childIn || !childIn.cableId) {
                    childSp.properties.set('inputFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
                }
            }
        });
    });
}

function updateSplitterOutputConnectionLines() {
    syncSplitterOutputDeviceFibers();
    splitterOutputConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    splitterOutputConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'splitter') {
            var outputs = obj.properties.get('outputConnections') || [];
            for (var oi = 0; oi < outputs.length; oi++) {
                var out = outputs[oi];
                if (!out) continue;
                var target = null;
                if (out.onuId) target = getMapObjectByUid(out.onuId, 'onu');
                else if (out.mediaConverterId) target = getMapObjectByUid(out.mediaConverterId, 'mediaConverter');
                else if (out.nodeId) target = getMapObjectByUid(out.nodeId, 'node');
                else if (out.splitterId) target = getMapObjectByUid(out.splitterId, 'splitter');
                else if (out.hostId) target = getMapObjectByUid(out.hostId, 'sleeve') || getMapObjectByUid(out.hostId, 'cross');
                if (target) createSplitterOutputConnectionLine(obj, target, oi, out.routeIds || out.route || []);
            }
            return;
        }
        if (t !== 'cross' && t !== 'sleeve') return;
        if (!window.EmbeddedSplitters) return;
        var hostUid = getObjectUniqueId(obj);
        var embedded = EmbeddedSplitters.getList(obj) || [];
        embedded.forEach(function(rec) {
            if (!rec || !rec.id) return;
            var outs = rec.outputConnections || [];
            for (var ei = 0; ei < outs.length; ei++) {
                var eout = outs[ei];
                if (!eout) continue;
                var etarget = null;
                if (eout.onuId) etarget = getMapObjectByUid(eout.onuId, 'onu');
                else if (eout.mediaConverterId) etarget = getMapObjectByUid(eout.mediaConverterId, 'mediaConverter');
                else if (eout.nodeId) etarget = getMapObjectByUid(eout.nodeId, 'node');
                else if (eout.hostId && eout.hostId !== hostUid) {
                    etarget = getMapObjectByUid(eout.hostId, 'sleeve') || getMapObjectByUid(eout.hostId, 'cross');
                }
                if (etarget) {
                    createSplitterOutputConnectionLine(obj, etarget, ei, eout.routeIds || eout.route || [], hostUid + '-esp-' + rec.id + '-out-' + ei);
                }
            }
        });
    });
}

function updateOnuConnectionLines() {
    onuConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    onuConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const onuConnections = obj.properties.get('onuConnections');
        if (onuConnections) {
            Object.keys(onuConnections).forEach(function(key) {
                const conn = onuConnections[key];
                const parts = key.split('-');
                const fiberNumberParsed = parseInt(parts.pop(), 10);
                const cableIdParsed = parts.join('-');
                if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
                const onuObj = getMapObjectByUid(conn.onuId, 'onu');
                if (onuObj) createOnuConnectionLine(obj, onuObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
            });
        }
        const mcConnections = obj.properties.get('mediaConverterConnections');
        if (mcConnections) {
            Object.keys(mcConnections).forEach(function(key) {
                const conn = mcConnections[key];
                const parts = key.split('-');
                const fiberNumberParsed = parseInt(parts.pop(), 10);
                const cableIdParsed = parts.join('-');
                if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
                const mcObj = getMapObjectByUid(conn.mediaConverterId, 'mediaConverter');
                if (mcObj) createMediaConverterConnectionLine(obj, mcObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
            });
        }
    });
}

function createOltConnectionLine(sleeveObj, oltObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const oltCoords = oltObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOltConnectionLineByKey(key);
    const oltName = oltObj.properties.get('name') || 'OLT';
    routeIds = resolveGponRouteIds(routeIds);
    var points = [sleeveCoords].concat(gponRouteWaypointCoords(routeIds)).concat([oltCoords]);
    const line = new ymaps.Polyline(points, {}, getConnectionLinePolylineOptions('#0ea5e9'));
    line.properties.set('type', 'oltConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('oltName', oltName);
    line.properties.set('routeIds', routeIds);
    oltConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeOltConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeOltConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeOltConnectionLineByKey(key) {
    const idx = oltConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(oltConnectionLines[idx]);
        oltConnectionLines.splice(idx, 1);
    }
}

function updateOltConnectionLines() {
    oltConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    oltConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const oltConnections = obj.properties.get('oltConnections');
        if (!oltConnections) return;
        Object.keys(oltConnections).forEach(function(key) {
            const conn = oltConnections[key];
            if (!conn || !conn.oltId) return;
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const oltObj = getMapObjectByUid(conn.oltId, 'olt');
            if (oltObj) createOltConnectionLine(obj, oltObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    });
}

function createSplitterConnectionLine(sleeveObj, splitterObj, cableId, fiberNumber, routeIds) {
    if (!hasMapGeometry(sleeveObj) || !hasMapGeometry(splitterObj) || splitterObj._embedded) return;
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const splitterCoords = splitterObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeSplitterConnectionLineByKey(key);
    const splitterName = splitterObj.properties.get('name') || 'Сплиттер';
    routeIds = resolveGponRouteIds(routeIds);
    
    var points = [sleeveCoords].concat(gponRouteWaypointCoords(routeIds)).concat([splitterCoords]);
    
    const line = new ymaps.Polyline(points, {}, getConnectionLinePolylineOptions('#f97316'));
    line.properties.set('type', 'splitterConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('splitterName', splitterName);
    line.properties.set('routeIds', routeIds);
    splitterConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeSplitterConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeSplitterConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeSplitterConnectionLineByKey(key) {
    const idx = splitterConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(splitterConnectionLines[idx]);
        splitterConnectionLines.splice(idx, 1);
    }
}

function updateSplitterConnectionLines() {
    syncAllSplitterInputsFromHosts();
    splitterConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    splitterConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const splitterConnections = obj.properties.get('splitterConnections');
        if (!splitterConnections) return;
        Object.keys(splitterConnections).forEach(function(key) {
            const conn = splitterConnections[key];
            if (!conn || !conn.splitterId) return;
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const splitterObj = resolveMapSplitterForConnectionLine(conn.splitterId);
            if (splitterObj) createSplitterConnectionLine(obj, splitterObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    });
}

function updateAllNodeConnectionLines() {
    
    nodeConnectionLines.forEach(line => {
        myMap.geoObjects.remove(line);
    });
    nodeConnectionLines = [];

    objects.forEach(obj => {
        if (!obj.properties) return;
        const ht = obj.properties.get('type');
        if (ht !== 'cross' && ht !== 'sleeve') return;
        const nodeConnections = obj.properties.get('nodeConnections');
        if (!nodeConnections) return;
        Object.keys(nodeConnections).forEach(key => {
            const conn = nodeConnections[key];
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const nodeObj = getMapObjectByUid(conn.nodeId, 'node');
            if (nodeObj) createNodeConnectionLine(obj, nodeObj, cableIdParsed, fiberNumberParsed);
        });
    });
}

