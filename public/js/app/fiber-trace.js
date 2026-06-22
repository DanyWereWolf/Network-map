/**
 * Трассировка жил и модальное окно трассировки.
 */
function getCableRoutePointsForTrace(cable) {
    if (!cable || !cable.properties) return null;
    var pts = getCableRoutePoints(cable);
    var spans = cable.properties.get('undergroundSpans') || [];
    if (Array.isArray(pts) && pts.length > 2 && window.CableUnderground && CableUnderground.ensureRouteIncludesUndergroundManholes) {
        return CableUnderground.ensureRouteIncludesUndergroundManholes(pts.slice(), spans);
    }
    return pts;
}

/** Другие узлы на той же жиле того же кабеля (кросс на противоположном конце магистрали). */
function findPeerNodeTargetsOnCable(startCross, cableId, fiberNumber, originNodeId) {
    var peers = [];
    var startUid = getObjectUniqueId(startCross);
    var key = cableId + '-' + fiberNumber;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        var ht = obj.properties.get('type');
        if (!isFiberHostType(ht)) return;
        if (getObjectUniqueId(obj) === startUid) return;
        var nc = obj.properties.get('nodeConnections') || {};
        var conn = nc[key];
        if (!conn || !conn.nodeId || conn.nodeId === originNodeId) return;
        var nodeObj = objects.find(function(n) {
            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === conn.nodeId;
        });
        if (nodeObj) peers.push({ crossObj: obj, nodeObj: nodeObj, nodeConn: conn });
    });
    return peers;
}

/** Прямой проход по points[] кабеля от кросса до кросса соседнего узла. */
function buildCableRouteWalkPath(startCross, endCross, cable, fiberNumber, endNodeConn) {
    var pts = getCableRoutePoints(cable);
    if (!pts || pts.length < 2 || !startCross || !endCross || !cable) return null;
    var cableId = cable.properties.get('uniqueId');
    var cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
    var startIdx = getPointIndexOnCableRoute(pts, startCross);
    var endIdx = getPointIndexOnCableRoute(pts, endCross);
    if (startIdx === -1 || endIdx === -1 || startIdx === endIdx) return null;

    var path = [];
    var startType = startCross.properties.get('type');
    path.push({
        type: 'start',
        objectType: startType,
        objectName: startCross.properties.get('name') || getObjectTypeName(startType),
        object: startCross,
        port: (startType === 'cross') ? ((startCross.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null) : null
    });

    var step = endIdx > startIdx ? 1 : -1;
    for (var i = startIdx; i !== endIdx; i += step) {
        var nextPt = pts[i + step];
        if (!nextPt) break;
        path.push({ type: 'cable', cableId: cableId, cableName: cableName, fiberNumber: fiberNumber, cable: cable });
        var ot = nextPt.properties.get('type');
        path.push({
            type: 'object',
            objectType: ot,
            objectName: nextPt.properties.get('name') || getObjectTypeName(ot),
            object: nextPt,
            port: (ot === 'cross') ? ((nextPt.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null) : null
        });
    }

    var connectedNode = endNodeConn && endNodeConn.nodeId ? objects.find(function(n) {
        return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === endNodeConn.nodeId;
    }) : null;
    if (connectedNode) {
        path.push({
            type: 'nodeConnection',
            cableId: cableId,
            fiberNumber: fiberNumber,
            nodeName: endNodeConn.nodeName || connectedNode.properties.get('name') || 'Узел',
            cross: endCross,
            node: connectedNode
        });
        path.push({
            type: 'object',
            objectType: 'node',
            objectName: connectedNode.properties.get('name') || 'Узел сети',
            object: connectedNode
        });
    }
    return path.length > 1 ? path : null;
}

function tracePeerNodePathsOnSharedCable(startCross, cableId, fiberNumber, originNodeId) {
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable) return [];
    var paths = [];
    findPeerNodeTargetsOnCable(startCross, cableId, fiberNumber, originNodeId).forEach(function(peer) {
        var walk = buildCableRouteWalkPath(startCross, peer.crossObj, cable, fiberNumber, peer.nodeConn);
        if (walk) paths.push(walk);
    });
    return paths;
}

function cableEndpointRole(cable, currentObj) {
    if (!cable || !currentObj) return null;
    var currentId = getObjectUniqueId(currentObj);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    if (fromObj && (fromObj === currentObj || getObjectUniqueId(fromObj) === currentId)) return 'from';
    if (toObj && (toObj === currentObj || getObjectUniqueId(toObj) === currentId)) return 'to';
    var currentCoords = currentObj.geometry ? currentObj.geometry.getCoordinates() : null;
    if (currentCoords) {
        if (fromObj && fromObj.geometry) {
            var fc = fromObj.geometry.getCoordinates();
            if (fc && Math.abs(fc[0] - currentCoords[0]) < 0.0001 && Math.abs(fc[1] - currentCoords[1]) < 0.0001) return 'from';
        }
        if (toObj && toObj.geometry) {
            var tc = toObj.geometry.getCoordinates();
            if (tc && Math.abs(tc[0] - currentCoords[0]) < 0.0001 && Math.abs(tc[1] - currentCoords[1]) < 0.0001) return 'to';
        }
    }
    return null;
}

/**
 * Следующая точка маршрута по кабелю. Кросс/муфта на конце (from/to), но не в points[],
 * связывается с первой/последней промежуточной точкой.
 */
function getOtherEndOnCableRoute(cable, currentObj, previousObj) {
    if (!cable || !currentObj) return null;
    var pts = getCableRoutePointsForTrace(cable);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    var currentId = getObjectUniqueId(currentObj);
    var previousId = previousObj ? getObjectUniqueId(previousObj) : null;
    var endpointRole = cableEndpointRole(cable, currentObj);

    if (pts && pts.length > 2) {
        var idx = -1;
        for (var i = 0; i < pts.length; i++) {
            if (pts[i] === currentObj || (pts[i] && getObjectUniqueId(pts[i]) === currentId)) { idx = i; break; }
        }
        if (idx === -1 && endpointRole) {
            var firstPt = pts[0];
            var lastPt = pts[pts.length - 1];
            var firstPtId = firstPt ? getObjectUniqueId(firstPt) : null;
            var lastPtId = lastPt ? getObjectUniqueId(lastPt) : null;
            if (endpointRole === 'from') {
                if (!previousId) {
                    if (firstPt && firstPtId !== currentId) return firstPt;
                    return pts.length > 1 ? pts[1] : (toObj || null);
                }
                if (firstPt && (firstPt === previousObj || firstPtId === previousId)) {
                    return pts.length > 1 ? pts[1] : (toObj || null);
                }
                if (toObj && (toObj === previousObj || getObjectUniqueId(toObj) === previousId)) return firstPt || null;
                return toObj || null;
            }
            if (endpointRole === 'to') {
                if (!previousId) {
                    if (lastPt && lastPtId !== currentId) return lastPt;
                    return pts.length > 1 ? pts[pts.length - 2] : (fromObj || null);
                }
                if (lastPt && (lastPt === previousObj || lastPtId === previousId)) {
                    return pts.length > 1 ? pts[pts.length - 2] : (fromObj || null);
                }
                if (fromObj && (fromObj === previousObj || getObjectUniqueId(fromObj) === previousId)) return lastPt || null;
                return fromObj || null;
            }
            return null;
        }
        if (idx === -1) return null;
        var nextIdx = idx + 1;
        var prevIdx = idx - 1;
        if (previousId) {
            var prevPtId = (prevIdx >= 0 && pts[prevIdx]) ? getObjectUniqueId(pts[prevIdx]) : null;
            var nextPtId = (nextIdx < pts.length && pts[nextIdx]) ? getObjectUniqueId(pts[nextIdx]) : null;
            if (prevPtId === previousId && nextIdx < pts.length) return pts[nextIdx];
            if (nextPtId === previousId && prevIdx >= 0) return pts[prevIdx];
        }
        if (nextIdx < pts.length) return pts[nextIdx];
        if (prevIdx >= 0) return pts[prevIdx];
        return null;
    }
    if (!fromObj || !toObj) return null;
    if (fromObj === currentObj) return toObj;
    if (toObj === currentObj) return fromObj;
    var fromId = getObjectUniqueId(fromObj);
    var toId = getObjectUniqueId(toObj);
    if (fromId === currentId) return toObj;
    if (toId === currentId) return fromObj;
    var currentCoords = currentObj.geometry ? currentObj.geometry.getCoordinates() : null;
    var fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
    var toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
    if (currentCoords && fromCoords && Math.abs(currentCoords[0] - fromCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - fromCoords[1]) < 0.0001) return toObj;
    if (currentCoords && toCoords && Math.abs(currentCoords[0] - toCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - toCoords[1]) < 0.0001) return fromObj;
    return null;
}

/** Соседи вперёд/назад по маршруту кабеля (для двунаправленной трассировки с кросса). */
function getCableRoutePosition(cable, currentObj) {
    if (!cable || !currentObj) return null;
    var pts = getCableRoutePointsForTrace(cable);
    var currentId = getObjectUniqueId(currentObj);
    if (!pts || pts.length < 2) {
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (fromObj && (fromObj === currentObj || getObjectUniqueId(fromObj) === currentId)) {
            return { forward: toObj || null, backward: null };
        }
        if (toObj && (toObj === currentObj || getObjectUniqueId(toObj) === currentId)) {
            return { forward: null, backward: fromObj || null };
        }
        return null;
    }
    var idx = -1;
    for (var i = 0; i < pts.length; i++) {
        if (pts[i] === currentObj || (pts[i] && getObjectUniqueId(pts[i]) === currentId)) {
            idx = i;
            break;
        }
    }
    if (idx === -1) {
        var role = cableEndpointRole(cable, currentObj);
        if (role === 'from') {
            var fh = pts[0];
            return {
                forward: (fh && getObjectUniqueId(fh) !== currentId) ? fh : (pts.length > 1 ? pts[1] : (cable.properties.get('to') || null)),
                backward: null
            };
        }
        if (role === 'to') {
            var lh = pts[pts.length - 1];
            var backHop = pts.length > 1 ? pts[pts.length - 2] : cable.properties.get('from');
            if (lh && getObjectUniqueId(lh) !== currentId) {
                return { forward: lh, backward: backHop || null };
            }
            return { forward: null, backward: backHop || null };
        }
        return null;
    }
    return {
        forward: idx < pts.length - 1 ? pts[idx + 1] : null,
        backward: idx > 0 ? pts[idx - 1] : null
    };
}

function findNextCableThroughSupport(supportObj, excludeCable) {
    var supportCoords = supportObj.geometry ? supportObj.geometry.getCoordinates() : null;
    var supportId = getObjectUniqueId(supportObj);
    var excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;
    for (var ci = 0; ci < objects.length; ci++) {
        var cable = objects[ci];
        if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
        var cableId = cable.properties.get('uniqueId');
        if (excludeId && cableId === excludeId) continue;
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (!fromObj || !toObj) continue;
        if (fromObj === supportObj || toObj === supportObj) return cable;
        var fromId = getObjectUniqueId(fromObj);
        var toId = getObjectUniqueId(toObj);
        if (supportId && (fromId === supportId || toId === supportId)) return cable;
        if (supportCoords) {
            var fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
            var toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
            if (fromCoords && Math.abs(fromCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(fromCoords[1] - supportCoords[1]) < 0.0001) return cable;
            if (toCoords && Math.abs(toCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(toCoords[1] - supportCoords[1]) < 0.0001) return cable;
        }
    }
    return null;
}

function mergeTraceOptions(base, extra) {
    var out = {};
    var b = base || {};
    var e = extra || {};
    Object.keys(b).forEach(function(k) { out[k] = b[k]; });
    Object.keys(e).forEach(function(k) { out[k] = e[k]; });
    return out;
}

function isOriginNodePassthrough(nodeConn, traceOptions) {
    return !!(traceOptions && traceOptions.originNodeId && nodeConn && nodeConn.nodeId === traceOptions.originNodeId);
}

function resolveHostNodeConnectionAtFiber(hostObj, cableId, fiberNumber) {
    if (!hostObj) return null;
    var nodeConnKey = fiberConnKey(cableId, fiberNumber);
    var nodeConn = getHostAssignment(hostObj, 'nodeConnections', cableId, fiberNumber);
    if (!nodeConn) return null;
    var nodeConnCableId = cableId;
    var nodeConnFiberNumber = fiberNumber;
    var nodeConnMap = hostObj.properties.get('nodeConnections') || {};
    if (!nodeConnMap[nodeConnKey]) {
        var nodeGroup = getSplicedFiberGroup(hostObj, cableId, fiberNumber);
        for (var ngi = 0; ngi < nodeGroup.length; ngi++) {
            var ng = nodeGroup[ngi];
            var ngk = fiberConnKey(ng.cableId, ng.fiberNumber);
            if (nodeConnMap[ngk]) {
                nodeConnCableId = ng.cableId;
                nodeConnFiberNumber = ng.fiberNumber;
                break;
            }
        }
    }
    return { nodeConn: nodeConn, nodeConnCableId: nodeConnCableId, nodeConnFiberNumber: nodeConnFiberNumber, nodeConnKey: nodeConnKey };
}

function tryHandleHostNodeConnectionTrace(path, hostObj, currentCableId, currentFiberNumber, currentCable, currentObject, traceOptions) {
    var resolved = resolveHostNodeConnectionAtFiber(hostObj, currentCableId, currentFiberNumber);
    if (!resolved) return null;
    var nodeConn = resolved.nodeConn;
    var nodeConnCableId = resolved.nodeConnCableId;
    var nodeConnFiberNumber = resolved.nodeConnFiberNumber;
    var nodeConnKey = resolved.nodeConnKey;
    var connectedNode = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'node' && obj.properties.get('uniqueId') === nodeConn.nodeId;
    });
    if (!connectedNode) return { action: 'break' };
    if (isOriginNodePassthrough(nodeConn, traceOptions)) {
        var passExit = getOtherEndOnCableRoute(currentCable, hostObj, currentObject);
        if (passExit) {
            if (path.length && path[path.length - 1].type === 'object' && path[path.length - 1].object === hostObj) {
                path.pop();
            }
            return { action: 'continue', previousObject: hostObj, currentObject: passExit };
        }
    }
    if (nodeConnCableId !== currentCableId || nodeConnFiberNumber !== currentFiberNumber) {
        var fiberLabels = hostObj.properties.get('fiberLabels') || {};
        path.push({
            type: 'connection',
            fromCableId: currentCableId,
            fromFiberNumber: currentFiberNumber,
            fromLabel: fiberLabels[nodeConnKey] || '',
            fromCableType: currentCable ? currentCable.properties.get('cableType') : null,
            toCableId: nodeConnCableId,
            toFiberNumber: nodeConnFiberNumber,
            toLabel: fiberLabels[fiberConnKey(nodeConnCableId, nodeConnFiberNumber)] || '',
            toCableType: null,
            sleeve: hostObj
        });
    }
    path.push({ type: 'nodeConnection', cableId: nodeConnCableId, fiberNumber: nodeConnFiberNumber, nodeName: nodeConn.nodeName, cross: hostObj, node: connectedNode });
    path.push({ type: 'object', objectType: 'node', objectName: connectedNode.properties.get('name') || 'Узел сети', object: connectedNode });
    return { action: 'break' };
}

function traceFiberPathFromObject(startObject, startCableId, startFiberNumber, traceOptions) {
    traceOptions = traceOptions || {};
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();
    const visitedPatchKeys = new Set();

    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }

    function findFiberConnection(cableId, fiberNumber, sleeveObj) {
        if (typeof getSplicedFiberGroup === 'function') {
            const group = getSplicedFiberGroup(sleeveObj, cableId, fiberNumber);
            for (let i = 0; i < group.length; i++) {
                const g = group[i];
                if (g.cableId !== cableId || g.fiberNumber !== fiberNumber) {
                    return { cableId: g.cableId, fiberNumber: g.fiberNumber };
                }
            }
            return null;
        }
        const connections = sleeveObj.properties.get('fiberConnections') || [];
        for (const conn of connections) {
            if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                return { cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber };
            }
            if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                return { cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber };
            }
        }
        return null;
    }

    function getOtherEnd(cable, currentObj, previousObj) {
        return getOtherEndOnCableRoute(cable, currentObj, previousObj);
    }

    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };
    
    const startObjectId = getObjectUniqueId(startObject);
    const startObjType = startObject.properties.get('type');
    const startObjName = startObject.properties.get('name') || getObjectTypeName(startObjType);

    const startPort = (startObjType === 'cross') ? ((startObject.properties.get('fiberPorts') || {})[`${startCableId}-${startFiberNumber}`] || null) : null;
    path.push({
        type: 'start',
        objectType: startObjType,
        objectName: startObjName,
        object: startObject,
        port: startPort
    });
    
    visitedObjects.add(startObjectId);

    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    let currentObject = startObject;
    let previousObject = traceOptions.initialPreviousObject || null;
    
    const maxIterations = 100;
    let iterations = 0;
    var afterSplitterInputBranch = false;
    var allowHostRevisitFromSplitter = false;
    var nextObject;
    
    while (iterations < maxIterations) {
        iterations++;

        if (afterSplitterInputBranch) {
            afterSplitterInputBranch = false;
            nextObject = currentObject;
        } else {
            const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
            path.push({
                type: 'cable',
                cableId: currentCableId,
                cableName: cableName,
                fiberNumber: currentFiberNumber,
                cable: currentCable
            });

            nextObject = getOtherEnd(currentCable, currentObject, previousObject);
            
            if (!nextObject) break;
            
            path.push({
                type: 'object',
                objectType: nextObject.properties.get('type'),
                objectName: nextObject.properties.get('name') || getObjectTypeName(nextObject.properties.get('type')),
                object: nextObject,
                port: (nextObject.properties.get('type') === 'cross') ? ((nextObject.properties.get('fiberPorts') || {})[currentCableId + '-' + currentFiberNumber] || null) : null
            });
        }
        
        const nextObjectId = getObjectUniqueId(nextObject);
        var nextObjTypeEarly = nextObject.properties.get('type');
        if (visitedObjects.has(nextObjectId)) {
            if (allowHostRevisitFromSplitter && (nextObjTypeEarly === 'sleeve' || nextObjTypeEarly === 'cross')) {
                allowHostRevisitFromSplitter = false;
                previousObject = currentObject;
                currentObject = nextObject;
            } else if (traceOptions.originNodeId && (traceOptions.startHostId || traceOptions.startCrossId) && nextObjectId === (traceOptions.startHostId || traceOptions.startCrossId)) {
                var exitOnOriginCross = getOtherEnd(currentCable, nextObject, currentObject);
                if (exitOnOriginCross) {
                    if (path.length && path[path.length - 1].type === 'object' && path[path.length - 1].object === nextObject) {
                        path.pop();
                    }
                    previousObject = nextObject;
                    currentObject = exitOnOriginCross;
                    continue;
                }
                break;
            } else {
                break;
            }
        } else {
            visitedObjects.add(nextObjectId);
        }
        
        const objType = nextObjTypeEarly;
        const objName = nextObject.properties.get('name') || getObjectTypeName(objType);

        if (objType === 'splitter') {
            syncSplitterInputFromHost(nextObject);
            const inputFiber = nextObject.properties.get('inputFiber') || getSplitterRootInputFiber(nextObject) || null;
            const outputConnections = nextObject.properties.get('outputConnections') || [];
            const isInputFiber = inputFiber && currentCableId === inputFiber.cableId && currentFiberNumber === inputFiber.fiberNumber;
            const outputIndexByCable = outputConnections.findIndex(function(o) { return o && o.cableId === currentCableId && o.fiberNumber === currentFiberNumber; });
            if (isInputFiber && outputConnections.length > 0) {
                const firstOutWithCable = outputConnections.find(function(o) { return o && o.cableId; });
                if (firstOutWithCable) {
                    const outPeer = resolveSplitterOutputPeer(nextObject, firstOutWithCable);
                    if (outPeer) {
                        const otherEnd = outPeer.host;
                        const outCable = outPeer.cable;
                        path.push({ type: 'cable', cableId: firstOutWithCable.cableId, cableName: outCable.properties.get('cableName') || getCableDescription(outCable.properties.get('cableType')), fiberNumber: firstOutWithCable.fiberNumber, cable: outCable });
                        path.push({ type: 'object', objectType: otherEnd.properties.get('type'), objectName: otherEnd.properties.get('name') || getObjectTypeName(otherEnd.properties.get('type')), object: otherEnd, port: (otherEnd.properties.get('type') === 'cross') ? ((otherEnd.properties.get('fiberPorts') || {})[firstOutWithCable.cableId + '-' + firstOutWithCable.fiberNumber] || null) : null });
                        currentCableId = firstOutWithCable.cableId;
                        currentFiberNumber = firstOutWithCable.fiberNumber;
                        currentCable = outCable;
                        currentObject = otherEnd;
                        afterSplitterInputBranch = true;
                        allowHostRevisitFromSplitter = !!(otherEnd.properties.get('type') === 'sleeve' || otherEnd.properties.get('type') === 'cross');
                    }
                } else {
                    var directOut = appendSplitterDirectOutputSteps(path, nextObject, outputConnections);
                    if (directOut === true) {
                        break;
                    }
                    if (directOut && directOut.childSplitter) {
                        currentObject = directOut.childSplitter;
                        currentCableId = directOut.childInput.cableId;
                        currentFiberNumber = directOut.childInput.fiberNumber;
                        currentCable = findCableById(directOut.childInput.cableId);
                        afterSplitterInputBranch = true;
                    } else {
                        var inCable = findCableById(inputFiber.cableId);
                        var inputOtherEnd = inCable ? getOtherEndForSplitterCable(inCable, nextObject, inputFiber.cableId, inputFiber.fiberNumber) : null;
                        if (inputOtherEnd) {
                            path.push({ type: 'cable', cableId: inputFiber.cableId, cableName: inCable.properties.get('cableName') || getCableDescription(inCable.properties.get('cableType')), fiberNumber: inputFiber.fiberNumber, cable: inCable });
                            path.push({ type: 'object', objectType: inputOtherEnd.properties.get('type'), objectName: inputOtherEnd.properties.get('name') || getObjectTypeName(inputOtherEnd.properties.get('type')), object: inputOtherEnd, port: (inputOtherEnd.properties.get('type') === 'cross') ? ((inputOtherEnd.properties.get('fiberPorts') || {})[inputFiber.cableId + '-' + inputFiber.fiberNumber] || null) : null });
                            currentCableId = inputFiber.cableId;
                            currentFiberNumber = inputFiber.fiberNumber;
                            currentCable = inCable;
                            currentObject = inputOtherEnd;
                            afterSplitterInputBranch = true;
                            allowHostRevisitFromSplitter = !!(inputOtherEnd.properties.get('type') === 'sleeve' || inputOtherEnd.properties.get('type') === 'cross');
                        } else {
                            currentObject = null;
                            break;
                        }
                    }
                }
            } else if (inputFiber && outputIndexByCable >= 0) {
                const inCable = findCableById(inputFiber.cableId);
                if (inCable) {
                    const inputOtherEnd = getOtherEndForSplitterCable(inCable, nextObject, inputFiber.cableId, inputFiber.fiberNumber);
                    if (inputOtherEnd) {
                        path.push({
                            type: 'cable',
                            cableId: inputFiber.cableId,
                            cableName: inCable.properties.get('cableName') || getCableDescription(inCable.properties.get('cableType')),
                            fiberNumber: inputFiber.fiberNumber,
                            cable: inCable
                        });
                        path.push({
                            type: 'object',
                            objectType: inputOtherEnd.properties.get('type'),
                            objectName: inputOtherEnd.properties.get('name') || getObjectTypeName(inputOtherEnd.properties.get('type')),
                            object: inputOtherEnd,
                            port: (inputOtherEnd.properties.get('type') === 'cross') ? ((inputOtherEnd.properties.get('fiberPorts') || {})[inputFiber.cableId + '-' + inputFiber.fiberNumber] || null) : null
                        });
                        currentCableId = inputFiber.cableId;
                        currentFiberNumber = inputFiber.fiberNumber;
                        currentCable = inCable;
                        currentObject = inputOtherEnd;
                        afterSplitterInputBranch = true;
                        allowHostRevisitFromSplitter = !!(inputOtherEnd.properties.get('type') === 'sleeve' || inputOtherEnd.properties.get('type') === 'cross');
                    }
                }
            } else {
                break;
            }
            continue;
        }

        if (objType === 'olt') {
            const portAssignments = nextObject.properties.get('portAssignments') || {};
            let foundPort = null;
            for (const portKey in portAssignments) {
                const pa = portAssignments[portKey];
                if (pa && pa.cableId === currentCableId && pa.fiberNumber === currentFiberNumber) {
                    foundPort = parseInt(portKey, 10);
                    break;
                }
            }
            var incomingFiberOlt = nextObject.properties.get('incomingFiber');
            var isIncomingFiber = incomingFiberOlt && incomingFiberOlt.cableId === currentCableId && incomingFiberOlt.fiberNumber === currentFiberNumber;
            if (foundPort !== null || isIncomingFiber) {
                path.push({
                    type: 'oltPortConnection',
                    cableId: currentCableId,
                    fiberNumber: currentFiberNumber,
                    oltName: nextObject.properties.get('name') || 'OLT',
                    portNumber: foundPort,
                    portLabel: foundPort !== null ? getOltPortLabel(nextObject, foundPort) : '',
                    incoming: isIncomingFiber,
                    olt: nextObject
                });
            }
            break;
        }
        if (objType === 'onu') {
            break;
        }
        if (objType === 'mediaConverter') {
            break;
        }
        if (objType === 'sleeve' || objType === 'cross') {
            if (objType === 'cross') {
                const onuConn = getHostAssignment(nextObject, 'onuConnections', currentCableId, currentFiberNumber);
                if (onuConn) {
                    const connectedOnu = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'onu' && obj.properties.get('uniqueId') === onuConn.onuId
                    );
                    if (connectedOnu) {
                        path.push({ type: 'onuConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, onuName: onuConn.onuName || 'ONU', cross: nextObject, onu: connectedOnu });
                        path.push({ type: 'object', objectType: 'onu', objectName: connectedOnu.properties.get('name') || 'ONU', object: connectedOnu });
                    }
                    break;
                }
                const mcConn = getHostAssignment(nextObject, 'mediaConverterConnections', currentCableId, currentFiberNumber);
                if (mcConn && mcConn.mediaConverterId) {
                    const connectedMc = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'mediaConverter' && obj.properties.get('uniqueId') === mcConn.mediaConverterId
                    );
                    if (connectedMc) {
                        path.push({ type: 'mediaConverterConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, mediaConverterName: mcConn.mediaConverterName || 'Медиаконвертер', cross: nextObject, mediaConverter: connectedMc });
                        path.push({ type: 'object', objectType: 'mediaConverter', objectName: connectedMc.properties.get('name') || 'Медиаконвертер', object: connectedMc, port: null });
                    }
                    break;
                }
            }
            if (objType === 'sleeve') {
                const onuConnS = getHostAssignment(nextObject, 'onuConnections', currentCableId, currentFiberNumber);
                if (onuConnS) {
                    const connectedOnuS = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'onu' && obj.properties.get('uniqueId') === onuConnS.onuId
                    );
                    if (connectedOnuS) {
                        path.push({ type: 'onuConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, onuName: onuConnS.onuName || 'ONU', cross: nextObject, onu: connectedOnuS });
                        path.push({ type: 'object', objectType: 'onu', objectName: connectedOnuS.properties.get('name') || 'ONU', object: connectedOnuS });
                    }
                    break;
                }
                const mcConnSleeve = getHostAssignment(nextObject, 'mediaConverterConnections', currentCableId, currentFiberNumber);
                if (mcConnSleeve && mcConnSleeve.mediaConverterId) {
                    const connectedMcS = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'mediaConverter' && obj.properties.get('uniqueId') === mcConnSleeve.mediaConverterId
                    );
                    if (connectedMcS) {
                        path.push({ type: 'mediaConverterConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, mediaConverterName: mcConnSleeve.mediaConverterName || 'Медиаконвертер', cross: nextObject, mediaConverter: connectedMcS });
                        path.push({ type: 'object', objectType: 'mediaConverter', objectName: connectedMcS.properties.get('name') || 'Медиаконвертер', object: connectedMcS, port: null });
                    }
                    break;
                }
            }
            var hostNodeTrace = tryHandleHostNodeConnectionTrace(path, nextObject, currentCableId, currentFiberNumber, currentCable, currentObject, traceOptions);
            if (hostNodeTrace) {
                if (hostNodeTrace.action === 'continue') {
                    previousObject = hostNodeTrace.previousObject;
                    currentObject = hostNodeTrace.currentObject;
                    continue;
                }
                break;
            }
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);

            var nextFiber = findFiberConnection(currentCableId, currentFiberNumber, nextObject);
            if (!nextFiber) {
                var oltConnAtSlot = getFiberOltAssignment(nextObject, currentCableId, currentFiberNumber);
                if (oltConnAtSlot && oltConnAtSlot.oltId) {
                    var oltObjFromConn = objects.find(function(o) {
                        return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltConnAtSlot.oltId;
                    });
                    if (oltObjFromConn) {
                        var oltPortFromConn = null;
                        var oltIncoming = !!oltConnAtSlot.incoming;
                        if (!oltIncoming && oltConnAtSlot.portNumber != null) {
                            oltPortFromConn = oltConnAtSlot.portNumber;
                        } else if (!oltIncoming) {
                            var paFromConn = oltObjFromConn.properties.get('portAssignments') || {};
                            Object.keys(paFromConn).forEach(function(pk) {
                                var pa = paFromConn[pk];
                                if (pa && pa.cableId === currentCableId && pa.fiberNumber === currentFiberNumber) {
                                    oltPortFromConn = parseInt(pk, 10);
                                }
                            });
                        }
                        path.push({
                            type: 'oltPortConnection',
                            cableId: currentCableId,
                            fiberNumber: currentFiberNumber,
                            oltName: oltObjFromConn.properties.get('name') || 'OLT',
                            portNumber: oltPortFromConn,
                            portLabel: oltPortFromConn != null ? getOltPortLabel(oltObjFromConn, oltPortFromConn) : '',
                            incoming: oltIncoming,
                            olt: oltObjFromConn
                        });
                        path.push({
                            type: 'object',
                            objectType: 'olt',
                            objectName: oltObjFromConn.properties.get('name') || 'OLT',
                            object: oltObjFromConn,
                            port: null
                        });
                        break;
                    }
                }
                var scEntry = getHostAssignment(nextObject, 'splitterConnections', currentCableId, currentFiberNumber);
                if (scEntry && scEntry.splitterId) {
                    var spObj = resolveSplitterObject(scEntry.splitterId);
                    if (spObj) {
                        var cableToSplitter = findCableById(currentCableId);
                        var splitterEnd = cableToSplitter ? getOtherEnd(cableToSplitter, nextObject) : null;
                        var isPhysicalLink = splitterEnd && getObjectUniqueId(splitterEnd) === getObjectUniqueId(spObj);
                        if (cableToSplitter) {
                            if (isPhysicalLink) {
                                path.push({ type: 'cable', cableId: currentCableId, cableName: cableToSplitter.properties.get('cableName') || getCableDescription(cableToSplitter.properties.get('cableType')), fiberNumber: currentFiberNumber, cable: cableToSplitter });
                            } else {
                                path.push({ type: 'splitterConnection', sleeve: nextObject, splitter: spObj, cableId: currentCableId, fiberNumber: currentFiberNumber });
                            }
                        } else {
                            path.push({ type: 'splitterConnection', sleeve: nextObject, splitter: spObj, cableId: currentCableId, fiberNumber: currentFiberNumber });
                        }
                        path.push({ type: 'object', objectType: 'splitter', objectName: spObj.properties.get('name') || 'Сплиттер', object: spObj, port: null });
                        currentObject = spObj;
                        currentCableId = currentCableId;
                        currentFiberNumber = currentFiberNumber;
                        currentCable = cableToSplitter || currentCable;
                        afterSplitterInputBranch = true;
                        continue;
                    }
                }
                var spOutRev = findSplitterOutputAtHost(nextObject, currentCableId, currentFiberNumber);
                if (spOutRev && spOutRev.splitterObj) {
                    var spOutObj = spOutRev.splitterObj;
                    syncSplitterInputFromHost(spOutObj);
                    path.push({ type: 'splitterOutputToHost', splitter: spOutObj, host: nextObject, cableId: currentCableId, fiberNumber: currentFiberNumber });
                    path.push({ type: 'object', objectType: 'splitter', objectName: spOutObj.properties.get('name') || 'Сплиттер', object: spOutObj, port: null });
                    currentObject = spOutObj;
                    currentCableId = currentCableId;
                    currentFiberNumber = currentFiberNumber;
                    currentCable = findCableById(currentCableId) || currentCable;
                    afterSplitterInputBranch = true;
                    continue;
                }
                if (objType === 'cross' && typeof applyCrossPortPatchTraceContinuation === 'function') {
                    var patchCont = applyCrossPortPatchTraceContinuation(path, nextObject, currentCableId, currentFiberNumber, currentCable, visitedPatchKeys);
                    if (patchCont) {
                        if (patchCont.break) break;
                        currentCableId = patchCont.currentCableId;
                        currentFiberNumber = patchCont.currentFiberNumber;
                        currentObject = patchCont.currentObject;
                        previousObject = patchCont.previousObject;
                        currentCable = findCableById(currentCableId);
                        afterSplitterInputBranch = true;
                        continue;
                    }
                }
                break;
            }

            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;

            const fiberLabels = nextObject.properties.get('fiberLabels') || {};
            const fromLabel = fiberLabels[`${currentCableId}-${currentFiberNumber}`] || '';
            const toLabel = fiberLabels[`${nextFiber.cableId}-${nextFiber.fiberNumber}`] || '';

            const fromCableType = currentCable ? currentCable.properties.get('cableType') : null;
            const toCableType = nextCable ? nextCable.properties.get('cableType') : null;
            
            path.push({
                type: 'connection',
                fromCableId: currentCableId,
                fromFiberNumber: currentFiberNumber,
                fromLabel: fromLabel,
                fromCableType: fromCableType,
                toCableId: nextFiber.cableId,
                toFiberNumber: nextFiber.fiberNumber,
                toLabel: toLabel,
                toCableType: toCableType,
                sleeve: nextObject
            });

            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;
            previousObject = currentObject;
            currentObject = nextObject;
            
        } else if (objType === 'support' || objType === 'attachment' || objType === 'manhole') {
            var pts = getCableRoutePointsForTrace(currentCable);
            if (pts && Array.isArray(pts) && pts.length > 2) {
                var currentIdx = -1;
                var nextObjId = getObjectUniqueId(nextObject);
                for (var pi = 0; pi < pts.length; pi++) {
                    if (pts[pi] === nextObject || (pts[pi] && getObjectUniqueId(pts[pi]) === nextObjId)) {
                        currentIdx = pi;
                        break;
                    }
                }
                if (currentIdx !== -1) {
                    var prevObjId = previousObject ? getObjectUniqueId(previousObject) : null;
                    var nextPointIdx = -1;
                    
                    if (prevObjId) {
                        var prevIdx = currentIdx - 1;
                        var nextIdx = currentIdx + 1;
                        var prevPtId = (prevIdx >= 0 && pts[prevIdx]) ? getObjectUniqueId(pts[prevIdx]) : null;
                        var nextPtId = (nextIdx < pts.length && pts[nextIdx]) ? getObjectUniqueId(pts[nextIdx]) : null;
                        
                        if (prevPtId === prevObjId && nextIdx < pts.length) {
                            nextPointIdx = nextIdx;
                        } else if (nextPtId === prevObjId && prevIdx >= 0) {
                            nextPointIdx = prevIdx;
                        }
                    }
                    
                    if (nextPointIdx === -1) {
                        if (currentIdx < pts.length - 1) nextPointIdx = currentIdx + 1;
                        else if (currentIdx > 0) nextPointIdx = currentIdx - 1;
                    }
                    
                    if (nextPointIdx !== -1 && nextPointIdx >= 0 && nextPointIdx < pts.length) {
                        var nextPt = pts[nextPointIdx];
                        if (nextPt) {
                            path.push({
                                type: 'object',
                                objectType: nextPt.properties.get('type'),
                                objectName: nextPt.properties.get('name') || getObjectTypeName(nextPt.properties.get('type')),
                                object: nextPt,
                                port: (nextPt.properties.get('type') === 'cross') ? ((nextPt.properties.get('fiberPorts') || {})[currentCableId + '-' + currentFiberNumber] || null) : null
                            });
                            previousObject = nextObject;
                            currentObject = nextPt;
                            afterSplitterInputBranch = true;
                            continue;
                        }
                    }
                }
            }
            break;
        } else {
            
            break;
        }
    }

    return { path, error: null };
}

function traceAllFiberPathsFromObject(startObject, startCableId, startFiberNumber, traceOptions) {
    traceOptions = traceOptions || {};
    const first = traceFiberPathFromObject(startObject, startCableId, startFiberNumber, traceOptions);
    if (first.error) return { paths: [], error: first.error };
    var paths = [ first.path ];
    var startType = startObject.properties ? startObject.properties.get('type') : '';
    if (startType === 'sleeve' || startType === 'cross') {
        var startCable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === startCableId;
        });
        if (startCable) {
            var routePos = getCableRoutePosition(startCable, startObject);
            if (routePos && routePos.forward && routePos.backward) {
                var reversePath = traceFiberPathFromObject(startObject, startCableId, startFiberNumber, mergeTraceOptions(traceOptions, {
                    initialPreviousObject: routePos.forward
                }));
                if (!reversePath.error && reversePath.path.length > 0) {
                    paths.push(reversePath.path);
                }
            } else if (routePos && routePos.forward && !routePos.backward) {
                var reverseFromEnd = traceFiberPathFromObject(startObject, startCableId, startFiberNumber, mergeTraceOptions(traceOptions, {
                    initialPreviousObject: routePos.forward
                }));
                if (!reverseFromEnd.error && reverseFromEnd.path.length > 0) {
                    paths.push(reverseFromEnd.path);
                }
            }
        }
        var conns = startObject.properties.get('fiberConnections') || [];
        for (var ci = 0; ci < conns.length; ci++) {
            var c = conns[ci];
            var otherCable = null, otherFiber = null;
            if (c.from && c.from.cableId === startCableId && c.from.fiberNumber === startFiberNumber) { otherCable = c.to.cableId; otherFiber = c.to.fiberNumber; }
            else if (c.to && c.to.cableId === startCableId && c.to.fiberNumber === startFiberNumber) { otherCable = c.from.cableId; otherFiber = c.from.fiberNumber; }
            if (otherCable && otherFiber) {
                var alt = traceFiberPathFromObject(startObject, otherCable, otherFiber, traceOptions);
                if (!alt.error && alt.path.length > 0) paths.push(alt.path);
                var altCable = objects.find(function(c) {
                    return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === otherCable;
                });
                if (altCable) {
                    var altPos = getCableRoutePosition(altCable, startObject);
                    if (altPos && altPos.forward && altPos.backward) {
                        var altRev = traceFiberPathFromObject(startObject, otherCable, otherFiber, mergeTraceOptions(traceOptions, {
                            initialPreviousObject: altPos.forward
                        }));
                        if (!altRev.error && altRev.path.length > 0) paths.push(altRev.path);
                    } else if (altPos && altPos.forward && !altPos.backward) {
                        var altRevEnd = traceFiberPathFromObject(startObject, otherCable, otherFiber, mergeTraceOptions(traceOptions, {
                            initialPreviousObject: altPos.forward
                        }));
                        if (!altRevEnd.error && altRevEnd.path.length > 0) paths.push(altRevEnd.path);
                    }
                }
            }
        }
    }
    const maxExpand = 100;
    var expandedKeys = new Set();
    function expandKey(prefix, sp) { return (prefix.length ? prefix.length + '-' : '') + getObjectUniqueId(sp); }
    var anyExpanded = true;
    while (anyExpanded) {
        anyExpanded = false;
        for (var pi = 0; pi < paths.length && paths.length < maxExpand; pi++) {
            var path = paths[pi];
            var splitterIdx = -1;
            var splitterObj = null;
            for (var i = path.length - 1; i >= 0; i--) {
                if (path[i].type === 'object' && path[i].objectType === 'splitter') {
                    splitterIdx = i;
                    splitterObj = path[i].object;
                    break;
                }
            }
            if (splitterIdx < 0 || !splitterObj) continue;
            var prefix = path.slice(0, splitterIdx + 1);
            var key = expandKey(prefix, splitterObj);
            if (expandedKeys.has(key)) continue;
            expandedKeys.add(key);
            var inputFiber = splitterObj.properties.get('inputFiber') || getSplitterRootInputFiber(splitterObj);
            var outputConnections = splitterObj.properties.get('outputConnections') || [];
            if (!inputFiber) continue;
            var hasCableOutputs = outputConnections.some(function(o) { return o && o.cableId; });
            if (hasCableOutputs) {
                for (var oi = 0; oi < outputConnections.length; oi++) {
                    var out = outputConnections[oi];
                    if (!out || !out.cableId) continue;
                    var outCable = objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === out.cableId; });
                    if (!outCable) continue;
                    var outPeer = resolveSplitterOutputPeer(splitterObj, out);
                    if (!outPeer) continue;
                    var otherEnd = outPeer.host;
                    var sub = traceFiberPathFromObject(otherEnd, out.cableId, out.fiberNumber);
                    if (sub.error || !sub.path.length) continue;
                    paths.push(prefix.concat(sub.path.slice(1)));
                    anyExpanded = true;
                }
            }
            for (var oi2 = 0; oi2 < outputConnections.length; oi2++) {
                var out2 = outputConnections[oi2];
                if (!out2) continue;
                if (out2.onuId) {
                    var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out2.onuId; });
                    if (onuObj) {
                        var suffix = [
                            { type: 'splitterOutputToOnu', splitter: splitterObj, onuObj: onuObj, onuName: onuObj.properties.get('name') || 'ONU' },
                            { type: 'object', objectType: 'onu', objectName: onuObj.properties.get('name') || 'ONU', object: onuObj, port: null }
                        ];
                        paths.push(prefix.concat(suffix));
                        anyExpanded = true;
                    }
                } else if (out2.nodeId) {
                    var nodeSuffix = buildSplitterOutputToNodePathSteps(splitterObj, out2);
                    if (nodeSuffix) {
                        paths.push(prefix.concat(nodeSuffix));
                        anyExpanded = true;
                    }
                } else if (out2.mediaConverterId) {
                    var mcSuffix = buildSplitterOutputToMediaConverterPathSteps(splitterObj, out2);
                    if (mcSuffix) {
                        paths.push(prefix.concat(mcSuffix));
                        anyExpanded = true;
                    }
                } else if (out2.splitterId) {
                    var targetSplitter = resolveSplitterObject(out2.splitterId);
                    if (targetSplitter) {
                        var targetOutputs = targetSplitter.properties.get('outputConnections') || [];
                        var midSuffix = [
                            { type: 'splitterOutputToSplitter', fromSplitter: splitterObj, toSplitter: targetSplitter },
                            { type: 'object', objectType: 'splitter', objectName: targetSplitter.properties.get('name') || 'Сплиттер', object: targetSplitter, port: null }
                        ];
                        paths.push(prefix.concat(midSuffix));
                        anyExpanded = true;
                        for (var toi = 0; toi < targetOutputs.length; toi++) {
                            var tout = targetOutputs[toi];
                            if (tout && tout.onuId) {
                                var onuObj2 = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === tout.onuId; });
                                if (onuObj2) {
                                    paths.push(prefix.concat(midSuffix, [
                                        { type: 'splitterOutputToOnu', splitter: targetSplitter, onuObj: onuObj2, onuName: onuObj2.properties.get('name') || 'ONU' },
                                        { type: 'object', objectType: 'onu', objectName: onuObj2.properties.get('name') || 'ONU', object: onuObj2, port: null }
                                    ]));
                                    anyExpanded = true;
                                }
                            } else if (tout && tout.nodeId) {
                                var nodeSuffix2 = buildSplitterOutputToNodePathSteps(targetSplitter, tout);
                                if (nodeSuffix2) {
                                    paths.push(prefix.concat(midSuffix, nodeSuffix2));
                                    anyExpanded = true;
                                }
                            } else if (tout && tout.mediaConverterId) {
                                var mcSuffix2 = buildSplitterOutputToMediaConverterPathSteps(targetSplitter, tout);
                                if (mcSuffix2) {
                                    paths.push(prefix.concat(midSuffix, mcSuffix2));
                                    anyExpanded = true;
                                }
                            } else if (tout && tout.splitterId) {
                                var sp3 = resolveSplitterObject(tout.splitterId);
                                if (sp3) {
                                    var mid2 = midSuffix.concat([
                                        { type: 'splitterOutputToSplitter', fromSplitter: targetSplitter, toSplitter: sp3 },
                                        { type: 'object', objectType: 'splitter', objectName: sp3.properties.get('name') || 'Сплиттер', object: sp3, port: null }
                                    ]);
                                    var out3 = sp3.properties.get('outputConnections') || [];
                                    for (var t2 = 0; t2 < out3.length; t2++) {
                                        if (out3[t2] && out3[t2].onuId) {
                                            var onu3 = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out3[t2].onuId; });
                                            if (onu3) {
                                                paths.push(prefix.concat(mid2, [
                                                    { type: 'splitterOutputToOnu', splitter: sp3, onuObj: onu3, onuName: onu3.properties.get('name') || 'ONU' },
                                                    { type: 'object', objectType: 'onu', objectName: onu3.properties.get('name') || 'ONU', object: onu3, port: null }
                                                ]));
                                                anyExpanded = true;
                                            }
                                        } else if (out3[t2] && out3[t2].nodeId) {
                                            var nodeSuffix3 = buildSplitterOutputToNodePathSteps(sp3, out3[t2]);
                                            if (nodeSuffix3) {
                                                paths.push(prefix.concat(mid2, nodeSuffix3));
                                                anyExpanded = true;
                                            }
                                        } else if (out3[t2] && out3[t2].mediaConverterId) {
                                            var mcSuffix3 = buildSplitterOutputToMediaConverterPathSteps(sp3, out3[t2]);
                                            if (mcSuffix3) {
                                                paths.push(prefix.concat(mid2, mcSuffix3));
                                                anyExpanded = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if (window.FiberTrace && FiberTrace.dedupePaths) {
        paths = FiberTrace.dedupePaths(paths);
    }
    return { paths: paths, error: null };
}

function isFiberConnectedToOlt(sleeveObj, cableId, fiberNumber) {
    return isFiberReachableToOlt(sleeveObj, cableId, fiberNumber);
}

function traceFiberPath(startCableId, startFiberNumber) {
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();
    const visitedPatchKeys = new Set();

    function findFiberConnection(cableId, fiberNumber, sleeveObj) {
        if (typeof getSplicedFiberGroup === 'function') {
            const group = getSplicedFiberGroup(sleeveObj, cableId, fiberNumber);
            for (let i = 0; i < group.length; i++) {
                const g = group[i];
                if (g.cableId !== cableId || g.fiberNumber !== fiberNumber) {
                    return { cableId: g.cableId, fiberNumber: g.fiberNumber };
                }
            }
            return null;
        }
        const connections = sleeveObj.properties.get('fiberConnections') || [];
        for (const conn of connections) {
            if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                return { cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber };
            }
            if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                return { cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber };
            }
        }
        return null;
    }

    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }

    function getOtherEnd(cable, currentObj, previousObj) {
        return getOtherEndOnCableRoute(cable, currentObj, previousObj);
    }

    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };

    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    let previousObject = null;

    const fromObj = currentCable.properties.get('from');
    const toObj = currentCable.properties.get('to');
    const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
    
    const fromObjType = fromObj.properties.get('type');
    const fromPort = (fromObjType === 'cross') ? ((fromObj.properties.get('fiberPorts') || {})[`${startCableId}-${startFiberNumber}`] || null) : null;
    path.push({
        type: 'start',
        objectType: fromObjType,
        objectName: fromObj.properties.get('name') || getObjectTypeName(fromObjType),
        object: fromObj,
        port: fromPort
    });
    
    path.push({
        type: 'cable',
        cableId: currentCableId,
        cableName: cableName,
        fiberNumber: currentFiberNumber,
        cable: currentCable
    });

    let currentObject = toObj;
    const maxIterations = 100;
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        if (!currentObject) break;
        
        const currentObjectId = getObjectUniqueId(currentObject);

        if (visitedObjects.has(currentObjectId)) break;
        visitedObjects.add(currentObjectId);
        
        const objType = currentObject.properties.get('type');
        const objName = currentObject.properties.get('name') || getObjectTypeName(objType);
        const objPort = (objType === 'cross') ? ((currentObject.properties.get('fiberPorts') || {})[`${currentCableId}-${currentFiberNumber}`] || null) : null;
        
        path.push({
            type: 'object',
            objectType: objType,
            objectName: objName,
            object: currentObject,
            port: objPort
        });

        if (objType === 'sleeve' || objType === 'cross') {
            const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
            if (objType === 'cross') {
                const nodeConnections = currentObject.properties.get('nodeConnections') || {};
                let nodeConn = nodeConnections[nodeConnKey];
                let nodeConnCableId = currentCableId;
                let nodeConnFiberNumber = currentFiberNumber;
                
                if (!nodeConn) {
                    const crossFiberConns = currentObject.properties.get('fiberConnections') || [];
                    for (var cfi2 = 0; cfi2 < crossFiberConns.length; cfi2++) {
                        var cfc2 = crossFiberConns[cfi2];
                        var linkedKey2 = null;
                        if (cfc2.from && cfc2.from.cableId === currentCableId && cfc2.from.fiberNumber === currentFiberNumber) {
                            linkedKey2 = cfc2.to.cableId + '-' + cfc2.to.fiberNumber;
                            nodeConnCableId = cfc2.to.cableId;
                            nodeConnFiberNumber = cfc2.to.fiberNumber;
                        } else if (cfc2.to && cfc2.to.cableId === currentCableId && cfc2.to.fiberNumber === currentFiberNumber) {
                            linkedKey2 = cfc2.from.cableId + '-' + cfc2.from.fiberNumber;
                            nodeConnCableId = cfc2.from.cableId;
                            nodeConnFiberNumber = cfc2.from.fiberNumber;
                        }
                        if (linkedKey2 && nodeConnections[linkedKey2]) {
                            nodeConn = nodeConnections[linkedKey2];
                            break;
                        }
                    }
                }
                
                if (nodeConn) {
                    const connectedNode = objects.find(obj => 
                        obj.properties && obj.properties.get('type') === 'node' && obj.properties.get('uniqueId') === nodeConn.nodeId
                    );
                    if (connectedNode) {
                        if (nodeConnCableId !== currentCableId || nodeConnFiberNumber !== currentFiberNumber) {
                            const fiberLabels2 = currentObject.properties.get('fiberLabels') || {};
                            const fromLabel2 = fiberLabels2[nodeConnKey] || '';
                            const toLabel2 = fiberLabels2[nodeConnCableId + '-' + nodeConnFiberNumber] || '';
                            path.push({
                                type: 'connection',
                                fromCableId: currentCableId,
                                fromFiberNumber: currentFiberNumber,
                                fromLabel: fromLabel2,
                                fromCableType: currentCable ? currentCable.properties.get('cableType') : null,
                                toCableId: nodeConnCableId,
                                toFiberNumber: nodeConnFiberNumber,
                                toLabel: toLabel2,
                                toCableType: null,
                                sleeve: currentObject
                            });
                        }
                        path.push({ type: 'nodeConnection', cableId: nodeConnCableId, fiberNumber: nodeConnFiberNumber, nodeName: nodeConn.nodeName, cross: currentObject, node: connectedNode });
                        path.push({ type: 'object', objectType: 'node', objectName: connectedNode.properties.get('name') || 'Узел сети', object: connectedNode });
                    }
                    break;
                }
            }
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);

            const nextFiber = findFiberConnection(currentCableId, currentFiberNumber, currentObject);
            
            if (!nextFiber) {
                var oltConnLegacy = getFiberOltAssignment(currentObject, currentCableId, currentFiberNumber);
                if (oltConnLegacy && oltConnLegacy.oltId) {
                    var oltLegacy = objects.find(function(o) {
                        return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltConnLegacy.oltId;
                    });
                    if (oltLegacy) {
                        var oltPortLegacy = null;
                        var oltIncomingLegacy = !!oltConnLegacy.incoming;
                        if (!oltIncomingLegacy && oltConnLegacy.portNumber != null) {
                            oltPortLegacy = oltConnLegacy.portNumber;
                        } else if (!oltIncomingLegacy) {
                            var paLegacy = oltLegacy.properties.get('portAssignments') || {};
                            Object.keys(paLegacy).forEach(function(pk) {
                                var pa = paLegacy[pk];
                                if (pa && pa.cableId === currentCableId && pa.fiberNumber === currentFiberNumber) {
                                    oltPortLegacy = parseInt(pk, 10);
                                }
                            });
                        }
                        path.push({
                            type: 'oltPortConnection',
                            cableId: currentCableId,
                            fiberNumber: currentFiberNumber,
                            oltName: oltLegacy.properties.get('name') || 'OLT',
                            portNumber: oltPortLegacy,
                            portLabel: oltPortLegacy != null ? getOltPortLabel(oltLegacy, oltPortLegacy) : '',
                            incoming: oltIncomingLegacy,
                            olt: oltLegacy
                        });
                        path.push({
                            type: 'object',
                            objectType: 'olt',
                            objectName: oltLegacy.properties.get('name') || 'OLT',
                            object: oltLegacy,
                            port: null
                        });
                        break;
                    }
                }
                if (currentObject.properties.get('type') === 'cross' && typeof applyCrossPortPatchTraceContinuation === 'function') {
                    var patchContLegacy = applyCrossPortPatchTraceContinuation(path, currentObject, currentCableId, currentFiberNumber, currentCable, visitedPatchKeys);
                    if (patchContLegacy) {
                        if (patchContLegacy.break) break;
                        currentCableId = patchContLegacy.currentCableId;
                        currentFiberNumber = patchContLegacy.currentFiberNumber;
                        currentCable = findCableById(currentCableId);
                        previousObject = patchContLegacy.previousObject;
                        currentObject = patchContLegacy.currentObject;
                        continue;
                    }
                }
                break;
            }

            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;

            const fiberLabels = currentObject.properties.get('fiberLabels') || {};
            const fromLabel = fiberLabels[`${currentCableId}-${currentFiberNumber}`] || '';
            const toLabel = fiberLabels[`${nextFiber.cableId}-${nextFiber.fiberNumber}`] || '';

            const fromCableType = currentCable ? currentCable.properties.get('cableType') : null;
            const toCableType = nextCable ? nextCable.properties.get('cableType') : null;
            
            path.push({
                type: 'connection',
                fromCableId: currentCableId,
                fromFiberNumber: currentFiberNumber,
                fromLabel: fromLabel,
                fromCableType: fromCableType,
                toCableId: nextFiber.cableId,
                toFiberNumber: nextFiber.fiberNumber,
                toLabel: toLabel,
                toCableType: toCableType,
                sleeve: currentObject
            });

            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;

            const nextCableName = nextCable.properties.get('cableName') || getCableDescription(nextCable.properties.get('cableType'));
            path.push({
                type: 'cable',
                cableId: currentCableId,
                cableName: nextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCable
            });

            const nextObject = getOtherEnd(nextCable, currentObject, previousObject);
            
            if (!nextObject) {
                
                break;
            }
            
            previousObject = currentObject;
            currentObject = nextObject;
        } else if (objType === 'support' || objType === 'attachment' || objType === 'manhole') {
            var ptsWp = getCableRoutePointsForTrace(currentCable);
            if (ptsWp && Array.isArray(ptsWp) && ptsWp.length > 2) {
                var wpIdx = -1;
                var wpObjId = getObjectUniqueId(currentObject);
                for (var wpi = 0; wpi < ptsWp.length; wpi++) {
                    if (ptsWp[wpi] === currentObject || (ptsWp[wpi] && getObjectUniqueId(ptsWp[wpi]) === wpObjId)) {
                        wpIdx = wpi;
                        break;
                    }
                }
                if (wpIdx !== -1) {
                    var wpPrevObjId = previousObject ? getObjectUniqueId(previousObject) : null;
                    var wpNextPointIdx = -1;
                    if (wpPrevObjId) {
                        var wpPrevIdx = wpIdx - 1;
                        var wpNextIdx = wpIdx + 1;
                        var wpPrevPtId = (wpPrevIdx >= 0 && ptsWp[wpPrevIdx]) ? getObjectUniqueId(ptsWp[wpPrevIdx]) : null;
                        var wpNextPtId = (wpNextIdx < ptsWp.length && ptsWp[wpNextIdx]) ? getObjectUniqueId(ptsWp[wpNextIdx]) : null;
                        if (wpPrevPtId === wpPrevObjId && wpNextIdx < ptsWp.length) {
                            wpNextPointIdx = wpNextIdx;
                        } else if (wpNextPtId === wpPrevObjId && wpPrevIdx >= 0) {
                            wpNextPointIdx = wpPrevIdx;
                        }
                    }
                    if (wpNextPointIdx === -1) {
                        if (wpIdx < ptsWp.length - 1) wpNextPointIdx = wpIdx + 1;
                        else if (wpIdx > 0) wpNextPointIdx = wpIdx - 1;
                    }
                    if (wpNextPointIdx !== -1 && wpNextPointIdx >= 0 && wpNextPointIdx < ptsWp.length) {
                        path.push({
                            type: 'cable',
                            cableId: currentCableId,
                            cableName: currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType')),
                            fiberNumber: currentFiberNumber,
                            cable: currentCable
                        });
                        previousObject = currentObject;
                        currentObject = ptsWp[wpNextPointIdx];
                        continue;
                    }
                }
            }
            if (objType !== 'support') break;

            const nextCableForSupport = findNextCableThroughSupport(currentObject, currentCable);
            
            if (!nextCableForSupport) {
                
                break;
            }

            const supportNextCableName = nextCableForSupport.properties.get('cableName') || getCableDescription(nextCableForSupport.properties.get('cableType'));
            const supportNextCableId = nextCableForSupport.properties.get('uniqueId');
            
            path.push({
                type: 'cable',
                cableId: supportNextCableId,
                cableName: supportNextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCableForSupport
            });

            const nextObjectAfterSupport = getOtherEnd(nextCableForSupport, currentObject, previousObject);
            
            if (!nextObjectAfterSupport) {
                break;
            }
            
            currentCable = nextCableForSupport;
            currentCableId = supportNextCableId;
            previousObject = currentObject;
            currentObject = nextObjectAfterSupport;

        } else {
            
            break;
        }
    }

    return { path, iterations };
}

function showFiberTrace(cableId, fiberNumber) {
    const result = traceFiberPath(cableId, fiberNumber);
    
    if (result.error) {
        showError('Ошибка трассировки: ' + result.error, 'Трассировка');
        return;
    }
    
    const path = result.path;

    var pathHtml = renderOnePathToTraceHtml(path, 1);
    var bodyHtml = pathHtml.html;
    if (window.FiberTrace && FiberTrace.buildTraceActionsHtml) {
        bodyHtml += FiberTrace.buildTraceActionsHtml();
    }
    openFiberTraceModal({
        title: 'Трассировка · жила ' + fiberNumber,
        subtitle: 'Маршрут по кабелю',
        bodyHtml: bodyHtml,
        paths: [path]
    });
}

let traceHighlightObjects = [];
var traceHighlightClearTimer = null;
var traceReturnContext = null;

function saveTraceReturnContext() {
    if (!currentModalObject || !currentModalObject.properties) {
        traceReturnContext = null;
        return;
    }
    var type = currentModalObject.properties.get('type');
    var name = currentModalObject.properties.get('name') || getObjectTypeName(type);
    traceReturnContext = {
        object: currentModalObject,
        label: name,
        type: type
    };
}

function returnFromTraceToObjectCard() {
    var modal = document.getElementById('infoModal');
    if (modal) {
        modal.removeAttribute('data-trace-view');
        modal.classList.remove('modal--centered');
    }
    var traceHeader = document.getElementById('fiberModalHeader');
    if (traceHeader) traceHeader.classList.remove('fiber-modal-header--trace');
    var ctx = traceReturnContext;
    traceReturnContext = null;
    if (ctx && ctx.object) {
        showObjectInfo(ctx.object);
        return;
    }
    if (typeof closeInfoModal === 'function') closeInfoModal();
}
window.returnFromTraceToObjectCard = returnFromTraceToObjectCard;

function openFiberTraceModal(options) {
    saveTraceReturnContext();
    var modal = document.getElementById('infoModal');
    var titleEl = document.getElementById('modalTitle');
    var content = document.getElementById('modalInfo');
    if (!modal || !content) return;

    resetInfoModalFiberLayout();
    updateInfoModalChrome(null, '');
    modal.setAttribute('data-trace-view', '1');
    modal.classList.remove('fiber-management-modal-open', 'fiber-management-modal-open--edit', 'fiber-management-modal-open--view', 'modal--centered');
    var header = document.getElementById('fiberModalHeader');
    if (header) header.classList.add('fiber-modal-header--trace');
    titleEl.textContent = options.title || 'Трассировка';

    var subEl = document.getElementById('modalTitleSub');
    if (subEl) {
        if (options.subtitle) {
            subEl.hidden = false;
            subEl.textContent = options.subtitle;
        } else {
            subEl.hidden = true;
            subEl.textContent = '';
        }
    }

    var returnLabel = traceReturnContext ? traceReturnContext.label : null;
    var returnType = traceReturnContext ? traceReturnContext.type : null;
    var bodyHtml = options.bodyHtml || '';
    content.innerHTML = (window.FiberTrace && FiberTrace.buildTraceViewHtml)
        ? FiberTrace.buildTraceViewHtml(bodyHtml, returnLabel, returnType)
        : bodyHtml;

    window.currentTracePaths = options.paths || [];
    window.currentTracePath = (options.paths && options.paths.length) ? options.paths[0] : [];

    modal.style.display = 'flex';
    modal.classList.remove('modal--centered');

    if (window.FiberTrace && FiberTrace.attachTraceModalHandlers) {
        FiberTrace.attachTraceModalHandlers(content);
    } else {
        attachTraceShowOnMapHandlers(content);
    }
}

function highlightTracePath() {
    clearTraceHighlight();

    var paths = window.currentTracePaths;
    if (!paths || !paths.length) {
        var single = window.currentTracePath;
        paths = (single && single.length) ? [single] : [];
    }
    if (!paths.length) return;

    var branchColors = ['#22c55e', '#16a34a', '#3b82f6', '#a855f7'];
    var allBounds = [];

    paths.forEach(function(path, pi) {
        var color = branchColors[pi % branchColors.length];
        if (window.FiberTrace && FiberTrace.buildHighlightGeometries) {
            var geom = FiberTrace.buildHighlightGeometries(path);
            geom.lines.forEach(function(line) {
                if (!line.coords || line.coords.length < 2) return;
                var highlightLine = new ymaps.Polyline(line.coords, {}, {
                    strokeColor: line.underground ? '#6366f1' : color,
                    strokeWidth: line.underground ? 6 : 8,
                    strokeOpacity: 0.78,
                    strokeStyle: line.underground ? 'shortdash' : 'solid',
                    zIndex: 1500 + pi
                });
                traceHighlightObjects.push(highlightLine);
                myMap.geoObjects.add(highlightLine);
                line.coords.forEach(function(c) { if (c && c.length >= 2) allBounds.push(c); });
            });
            geom.points.forEach(function(pt) {
                if (!pt.coords) return;
                var highlightCircle = new ymaps.Circle([pt.coords, 28], {}, {
                    fillColor: color,
                    fillOpacity: 0.45,
                    strokeColor: color,
                    strokeWidth: 2,
                    zIndex: 1501 + pi
                });
                traceHighlightObjects.push(highlightCircle);
                myMap.geoObjects.add(highlightCircle);
                allBounds.push(pt.coords);
            });
            return;
        }
        path.forEach(function(item) {
            if (item.type === 'cable' && item.cable && item.cable.geometry) {
                var coords = item.cable.geometry.getCoordinates();
                var highlightLine = new ymaps.Polyline(coords, {}, {
                    strokeColor: color,
                    strokeWidth: 8,
                    strokeOpacity: 0.7,
                    zIndex: 1500 + pi
                });
                traceHighlightObjects.push(highlightLine);
                myMap.geoObjects.add(highlightLine);
                if (Array.isArray(coords[0])) coords.forEach(function(c) { allBounds.push(c); });
                else allBounds.push(coords);
            } else if ((item.type === 'start' || item.type === 'object') && item.object && item.object.geometry) {
                var pt = item.object.geometry.getCoordinates();
                var highlightCircle = new ymaps.Circle([pt, 30], {}, {
                    fillColor: color,
                    fillOpacity: 0.5,
                    strokeColor: color,
                    strokeWidth: 3,
                    zIndex: 1500 + pi
                });
                traceHighlightObjects.push(highlightCircle);
                myMap.geoObjects.add(highlightCircle);
                allBounds.push(pt);
            }
        });
    });

    if (allBounds.length > 0) {
        myMap.setBounds(ymaps.util.bounds.fromPoints(allBounds), {
            checkZoomRange: true,
            zoomMargin: 60
        });
    }

    if (traceHighlightClearTimer) clearTimeout(traceHighlightClearTimer);
    traceHighlightClearTimer = setTimeout(function() {
        traceHighlightClearTimer = null;
        clearTraceHighlight();
    }, 15000);
}

function clearTraceHighlight() {
    if (traceHighlightClearTimer) {
        clearTimeout(traceHighlightClearTimer);
        traceHighlightClearTimer = null;
    }
    traceHighlightObjects.forEach(function(obj) {
        myMap.geoObjects.remove(obj);
    });
    traceHighlightObjects = [];
}

let nodeConnectionLines = [];
let onuConnectionLines = [];
let oltConnectionLines = [];
let splitterConnectionLines = [];
let splitterOutputConnectionLines = [];

let nodeSelectionModalData = null;
let onuSelectionModalData = null;
let splitterSelectionModalData = null;
let splitterOutputOnuModalData = null;
let splitterOutputSplitterModalData = null;
let splitterOutputHostModalData = null;
var scrollToFiberAfterSleeveRender = null;
var savedFiberConnectionsScrollPos = null;

function getAvailableNodes() {
    return objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'node'
    );
}

function showNodeSelectionDialog(crossObj, cableId, fiberNumber) {
    const nodes = getAvailableNodes();
    
    if (nodes.length === 0) {
        showWarning('Нет доступных узлов для подключения. Сначала создайте узел сети.', 'Нет узлов');
        return;
    }

    nodeSelectionModalData = {
        mode: 'fiber',
        crossObj: crossObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        nodes: nodes,
        phase: 'list'
    };

    const modal = document.getElementById('nodeSelectionModal');
    const fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    const searchInput = document.getElementById('nodeSearchInput');

    fiberInfo.textContent = `Подключение жилы #${fiberNumber} к узлу: выберите узел, затем свободный оптический порт на коммутаторе.`;

    searchInput.value = '';

    renderNodeList(nodes, '');

    modal.style.display = 'block';

    setTimeout(() => searchInput.focus(), 100);
}

function renderNodeList(nodes, searchQuery) {
    const nodeListContainer = document.getElementById('nodeListContainer');
    
    if (nodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Нет доступных узлов</p>
            </div>
        `;
        return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filteredNodes = query 
        ? nodes.filter(node => {
            const name = (node.properties.get('name') || 'Узел без имени').toLowerCase();
            return name.includes(query);
        })
        : nodes;
    
    if (filteredNodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-no-results">
                Узлы не найдены по запросу "${searchQuery}"
            </div>
        `;
        return;
    }

    let html = '';
    filteredNodes.forEach((node, index) => {
        const name = node.properties.get('name') || 'Узел без имени';
        const coords = node.geometry.getCoordinates();
        const coordsStr = `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        const nodeIndex = nodes.indexOf(node);

        let displayName = escapeHtml(name);
        if (query) {
            const regex = new RegExp(`(${escapeRegExpForSearch(query)})`, 'gi');
            displayName = name.replace(regex, '<mark>$1</mark>');
        }
        
        html += `
            <div class="node-list-item" data-node-index="${nodeIndex}" onclick="selectNodeFromList(${nodeIndex})">
                <div class="node-list-item-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        <line x1="6" y1="6" x2="6.01" y2="6"></line>
                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                </div>
                <div class="node-list-item-info">
                    <div class="node-list-item-name">${displayName}</div>
                    <div class="node-list-item-coords">${coordsStr}</div>
                </div>
            </div>
        `;
    });
    
    nodeListContainer.innerHTML = html;
}

function escapeRegExpForSearch(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectNodeFromList(nodeIndex) {
    if (!nodeSelectionModalData) return;

    const { nodes } = nodeSelectionModalData;
    if (nodeIndex < 0 || nodeIndex >= nodes.length) return;
    const nodeObj = nodes[nodeIndex];
    const opts = collectFreeSfpPortOptionsOnNode(nodeObj);
    if (!opts.length) {
        if (typeof showError === 'function') {
            showError('В этом узле нет коммутатора со свободным оптическим портом (SFP, SFP+, QSFP, Комбо). Добавьте коммутатор в карточке узла и укажите типы портов.', 'Нет оптического порта');
        }
        return;
    }
    nodeSelectionModalData.phase = 'sfp';
    nodeSelectionModalData.selectedNode = nodeObj;
    nodeSelectionModalData.sfpOptions = opts;
    renderNodeSfpPortSelectionUI();
}

function renderNodeSfpPortSelectionUI() {
    var d = nodeSelectionModalData;
    if (!d || d.phase !== 'sfp' || !d.selectedNode || !d.sfpOptions) return;
    var container = document.getElementById('nodeListContainer');
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = 'none';
    var nodeName = escapeHtml(d.selectedNode.properties.get('name') || 'Узел');
    var opts = d.sfpOptions;
    var selOpts = opts.map(function(o, idx) {
        return '<option value="' + idx + '">' + escapeHtml(o.switchLabel) + ' — порт ' + o.port + ' (' + escapeHtml(o.portTypeLabel) + ')</option>';
    }).join('');
    var htmlSfp = '<div style="padding: 8px 0;">';
    var sfpHint = d.mode === 'splitterOutputNode'
        ? 'Выход сплиттера подключается к выбранному SFP-порту коммутатора.'
        : 'Жила с кросса занимает выбранный SFP-порт на коммутаторе.';
    htmlSfp += '<p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">Узел: <strong>' + nodeName + '</strong>. ' + sfpHint + '</p>';
    htmlSfp += '<div class="form-group" style="margin-bottom: 12px;"><label for="nodeFiberSfpSelect" style="font-size: 0.8125rem;">Порт коммутатора (SFP)</label>';
    htmlSfp += '<select id="nodeFiberSfpSelect" class="form-select">' + selOpts + '</select></div>';
    htmlSfp += '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">';
    htmlSfp += '<button type="button" id="nodeFiberBackBtn" class="btn-secondary">Назад</button>';
    htmlSfp += '<button type="button" id="nodeFiberConfirmBtn" class="btn-primary">Подключить</button></div></div>';
    if (container) container.innerHTML = htmlSfp;
}

function backNodeSelectionToList() {
    var d = nodeSelectionModalData;
    if (!d) return;
    d.phase = 'list';
    d.selectedNode = null;
    d.sfpOptions = null;
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = '';
    if (typeof renderNodeList === 'function') renderNodeList(d.nodes, searchInput ? searchInput.value : '');
}

function confirmNodeFiberToSfpPort() {
    var d = nodeSelectionModalData;
    if (!d || d.phase !== 'sfp' || !d.selectedNode) return;
    var sel = document.getElementById('nodeFiberSfpSelect');
    var idx = sel && sel.value !== '' ? parseInt(sel.value, 10) : NaN;
    if (isNaN(idx) || !d.sfpOptions || idx < 0 || idx >= d.sfpOptions.length) {
        if (typeof showError === 'function') showError('Выберите порт SFP на коммутаторе.', 'Порт');
        return;
    }
    var opt = d.sfpOptions[idx];
    var nodeObj = d.selectedNode;
    closeNodeSelectionModal();
    if (d.mode === 'splitterOutputNode') {
        connectSplitterOutputToNode(d.hostObj, d.splitterId, d.outputIndex, nodeObj, opt.switchId, opt.port);
        return;
    }
    connectFiberToNode(d.crossObj, d.cableId, d.fiberNumber, nodeObj, opt.switchId, opt.port);
}

function closeNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    if (modal) modal.style.display = 'none';
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = '';
    var title = modal && modal.querySelector('.group-balloon-title');
    if (title) title.textContent = 'Подключение жилы к узлу';
    var labels = modal ? modal.querySelectorAll('.modal-body .form-group > label') : [];
    if (labels[0]) labels[0].textContent = 'Поиск узла';
    if (labels[1]) labels[1].textContent = 'Выберите узел';
    if (searchInput) searchInput.placeholder = 'Введите имя узла...';
    nodeSelectionModalData = null;
}

function getAvailableOnus() {
    return objects.filter(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'onu') return false;
        var uid = getObjectUniqueId(obj);
        return !isOnuUsedInNetwork(uid);
    });
}

function getAvailableMediaConverters() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'mediaConverter'
    );
}

function setFiberTargetSelectionModalMode(mode) {
    var modal = document.getElementById('onuSelectionModal');
    if (!modal) return;
    var title = modal.querySelector('.group-balloon-title');
    var labels = modal.querySelectorAll('.modal-body .form-group > label');
    var searchInput = document.getElementById('onuSearchInput');
    if (title) title.textContent = mode === 'mediaConverter' ? 'Подключение жилы к медиаконвертеру' : 'Подключение жилы к ONU';
    if (labels[0]) labels[0].textContent = mode === 'mediaConverter' ? 'Поиск медиаконвертера' : 'Поиск ONU';
    if (labels[1]) labels[1].textContent = mode === 'mediaConverter' ? 'Выберите медиаконвертер' : 'Выберите ONU';
    if (searchInput) searchInput.placeholder = mode === 'mediaConverter' ? 'Введите название медиаконвертера...' : 'Введите имя ONU...';
}

function showOnuSelectionDialog(sleeveObj, cableId, fiberNumber) {
    if (!isFiberReachableToOlt(sleeveObj, cableId, fiberNumber)) {
        showWarning('ONU можно подключить только к ветке, связанной с OLT.', 'Нет OLT');
        return;
    }
    const onus = getAvailableOnus();
    if (onus.length === 0) {
        var hasAnyOnu = objects.some(function(o) { return o.properties && o.properties.get('type') === 'onu'; });
        showWarning(
            hasAnyOnu ? 'Нет свободных ONU. Все ONU уже подключены к сети — сначала отключите нужное ONU.' : 'Нет доступных ONU для подключения. Сначала создайте ONU на карте.',
            'Нет ONU'
        );
        return;
    }
    onuSelectionModalData = { mode: 'onu', sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, targets: onus };
    const modal = document.getElementById('onuSelectionModal');
    const fiberInfo = document.getElementById('onuSelectionFiberInfo');
    const searchInput = document.getElementById('onuSearchInput');
    setFiberTargetSelectionModalMode('onu');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к ONU';
    if (searchInput) searchInput.value = '';
    renderOnuList('');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function showMediaConverterSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const placeId = sleeveObj.properties.get('uniqueId');
    const stMcDlg = sleeveObj.properties.get('type');
    const usageOptsMcDlg = isCrossLikeHostType(stMcDlg) ? { atCrossId: placeId } : { atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, usageOptsMcDlg);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const mcs = getAvailableMediaConverters();
    if (mcs.length === 0) {
        showWarning('Нет доступных медиаконвертеров. Сначала создайте медиаконвертер на карте.', 'Нет медиаконвертеров');
        return;
    }
    onuSelectionModalData = { mode: 'mediaConverter', sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, targets: mcs };
    const modal = document.getElementById('onuSelectionModal');
    const fiberInfo = document.getElementById('onuSelectionFiberInfo');
    const searchInput = document.getElementById('onuSearchInput');
    setFiberTargetSelectionModalMode('mediaConverter');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к медиаконвертеру';
    if (searchInput) searchInput.value = '';
    renderOnuList('');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function renderOnuList(searchQuery) {
    if (!onuSelectionModalData) return;
    const mode = onuSelectionModalData.mode || 'onu';
    const targets = onuSelectionModalData.targets || [];
    const container = document.getElementById('onuListContainer');
    if (!container) return;
    if (targets.length === 0) {
        container.innerHTML = '<div class="node-list-empty"><p>' + (mode === 'mediaConverter' ? 'Нет доступных медиаконвертеров' : 'Нет доступных ONU') + '</p></div>';
        return;
    }
    const query = (searchQuery || '').toLowerCase().trim();
    const defaultName = mode === 'mediaConverter' ? 'Медиаконвертер' : 'ONU';
    const filtered = query ? targets.filter(function(o) {
        var name = (o.properties.get('name') || defaultName).toLowerCase();
        return name.indexOf(query) !== -1;
    }) : targets;
    if (filtered.length === 0) {
        container.innerHTML = '<div class="node-list-no-results">' + (mode === 'mediaConverter' ? 'Медиаконвертеры не найдены по запросу' : 'ONU не найдены по запросу') + '</div>';
        return;
    }
    var html = '';
    filtered.forEach(function(obj) {
        var name = obj.properties.get('name') || defaultName;
        var idx = targets.indexOf(obj);
        html += '<div class="node-list-item" data-onu-index="' + idx + '" onclick="selectOnuFromList(' + idx + ')">';
        html += '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div></div>';
    });
    container.innerHTML = html;
}

function selectOnuFromList(onuIndex) {
    if (!onuSelectionModalData) return;
    var data = onuSelectionModalData;
    var targets = data.targets || [];
    if (onuIndex < 0 || onuIndex >= targets.length) return;
    var mode = data.mode || 'onu';
    closeOnuSelectionModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    if (mode === 'mediaConverter') {
        startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'mediaConverter', targets[onuIndex]);
    } else if (mode === 'splitterOutputMc') {
        var spFacade = resolveSplitterObject(data.splitterId);
        if (spFacade) {
            startSplitterFiberRouting(spFacade, data.outputIndex, 'mediaConverter', targets[onuIndex], getObjectUniqueId(targets[onuIndex]));
        }
    } else {
        startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'onu', targets[onuIndex]);
    }
}

function closeOnuSelectionModal() {
    var modal = document.getElementById('onuSelectionModal');
    if (modal) modal.style.display = 'none';
    onuSelectionModalData = null;
}
