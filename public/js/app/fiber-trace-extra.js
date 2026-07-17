/**
 * Доп. трассировка: узлы, OLT, show-on-map.
 */
function traceUidEq(a, b) {
    if (a == null || b == null) return false;
    return String(a) === String(b);
}
function collectNodeSplitterFiberConnections(nodeUniqueId, seen) {
    var list = [];
    if (!nodeUniqueId) return list;
    seen = seen || new Set();

    function scanSplitter(sp, hostObj) {
        if (!sp || !sp.properties) return;
        var spId = getObjectUniqueId(sp);
        if (!spId) return;
        var outputs = sp.properties.get('outputConnections') || [];
        var spName = sp.properties.get('name') || 'Сплиттер';
        var host = hostObj || sp._host || null;
        var hostName = host && host.properties ? (host.properties.get('name') || 'Кросс') : 'Кросс';
        var hostUid = host ? getObjectUniqueId(host) : null;
        var hostIn = getSplitterHostInputFiber(sp);

        for (var oi = 0; oi < outputs.length; oi++) {
            var outConn = outputs[oi];
            if (!outConn || outConn.nodeId !== nodeUniqueId) continue;
            var dedupeKey = 'sp:' + spId + ':' + oi;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            list.push({
                source: 'splitter',
                crossObj: host,
                crossName: hostName,
                crossUniqueId: hostUid,
                cableId: hostIn ? hostIn.cableId : null,
                fiberNumber: hostIn ? hostIn.fiberNumber : null,
                fiberLabel: '',
                splitterId: spId,
                splitterName: spName,
                outputIndex: oi,
                outputNumber: oi + 1,
                switchPort: outConn.switchPort != null ? outConn.switchPort : null
            });
        }
    }

    if (window.EmbeddedSplitters) {
        EmbeddedSplitters.forEach(function(sp) {
            scanSplitter(sp, sp._host);
        });
    }
    objects.forEach(function(o) {
        if (!o.properties || o.properties.get('type') !== 'splitter') return;
        scanSplitter(o, null);
    });
    return list;
}

function getNodeConnectedFibers(nodeUniqueId) {
    const connectedFibers = [];
    const seen = new Set();

    if (!nodeUniqueId) return connectedFibers;

    objects.forEach(obj => {
        if (!obj.properties) return;
        var ht = obj.properties.get('type');
        if (!isFiberHostType(ht)) return;
        const nodeConnections = obj.properties.get('nodeConnections');
        const fiberLabels = obj.properties.get('fiberLabels') || {};
        const hostName = obj.properties.get('name') || (ht === 'cross' ? 'Кросс без имени' : 'Муфта без имени');
        const hostUniqueId = obj.properties.get('uniqueId');

        if (nodeConnections) {
            Object.keys(nodeConnections).forEach(key => {
                const conn = nodeConnections[key];
                if (conn.nodeId !== nodeUniqueId) return;
                const parts = key.split('-');
                const fiberNumber = parseInt(parts.pop(), 10);
                const cableId = parts.join('-');
                if (!crossHasFiberForConnection(obj, cableId, fiberNumber)) return;
                const dedupeKey = ht + ':' + cableId + '-' + fiberNumber;
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);
                connectedFibers.push({
                    source: ht,
                    crossObj: obj,
                    crossName: hostName,
                    crossUniqueId: hostUniqueId,
                    cableId: cableId,
                    fiberNumber: fiberNumber,
                    fiberLabel: fiberLabels[key] || '',
                    switchPort: conn.switchPort != null ? conn.switchPort : null
                });
            });
        }
    });

    collectNodeSplitterFiberConnections(nodeUniqueId, seen).forEach(function(conn) {
        connectedFibers.push(conn);
    });

    return connectedFibers;
}

function pathReachesNodeViaSplitter(path, nodeUid, splitterId) {
    if (!path || !nodeUid) return false;
    for (var i = 0; i < path.length; i++) {
        var item = path[i];
        if (item.type === 'splitterOutputToNode' && item.nodeObj) {
            if (getObjectUniqueId(item.nodeObj) !== nodeUid) continue;
            if (splitterId && item.splitter && getObjectUniqueId(item.splitter) !== splitterId) continue;
            return true;
        }
    }
    return false;
}

function traceFromNodeSplitter(nodeObj, splitterId, outputIndex) {
    if (!nodeObj || !splitterId) return;
    var sp = resolveSplitterObject(splitterId);
    if (!sp) {
        showError('Сплиттер не найден. Информация обновлена.', 'Данные устарели');
        showObjectInfo(nodeObj);
        return;
    }
    syncSplitterInputFromHost(sp);
    var hostIn = getSplitterHostInputFiber(sp);
    if (!hostIn || !hostIn.hostObj || !hostIn.cableId || hostIn.fiberNumber == null) {
        showError('Не найден вход сплиттера на кроссе.', 'Трассировка');
        return;
    }
    var outs = sp.properties.get('outputConnections') || [];
    var outConn = outs[outputIndex];
    if (!outConn || outConn.nodeId !== getObjectUniqueId(nodeObj)) {
        showError('Выход сплиттера был отключён. Информация обновлена.', 'Данные устарели');
        showObjectInfo(nodeObj);
        return;
    }
    var nodeUid = getObjectUniqueId(nodeObj);
    var nodeName = nodeObj.properties.get('name') || 'Узел';
    var res = traceAllFiberPathsFromObject(hostIn.hostObj, hostIn.cableId, hostIn.fiberNumber);
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }
    if (!res.paths.length) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }
    var paths = res.paths.filter(function(p) { return pathReachesNodeViaSplitter(p, nodeUid, splitterId); });
    if (!paths.length) paths = res.paths;
    var spName = sp.properties.get('name') || 'Сплиттер';
    var bodyHtml = '<p class="trace-intro">Узел «' + escapeHtml(nodeName) + '» · сплиттер «' + escapeHtml(spName) + '», выход ' + (outputIndex + 1) + '</p>';
    if (paths.length > 1 && window.FiberTrace && FiberTrace.renderPathsOverviewHtml) {
        bodyHtml += FiberTrace.renderPathsOverviewHtml(paths);
    }
    var stepNum = 1;
    for (var pi = 0; pi < paths.length; pi++) {
        if (paths.length > 1 && pi > 0) {
            bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">' + escapeHtml(FiberTrace.getPathEndpointLabel(paths[pi])) + '</div>';
        }
        var pathHtml = renderOnePathToTraceHtml(paths[pi], stepNum);
        bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
        stepNum = pathHtml.nextStepNumber;
    }
    bodyHtml = (typeof appendFiberTraceExtrasHtml === 'function')
        ? appendFiberTraceExtrasHtml(bodyHtml, paths)
        : bodyHtml + ((window.FiberTrace && FiberTrace.buildTraceActionsHtml) ? FiberTrace.buildTraceActionsHtml() : '');
    openFiberTraceModal({
        title: 'Трассировка к узлу',
        subtitle: nodeName + ' · выход сплиттера ' + (outputIndex + 1),
        bodyHtml: bodyHtml,
        paths: paths
    });
}

function traceFromNode(hostUniqueId, cableId, fiberNumber) {
    
    const hostObj = objects.find(obj =>
        obj.properties &&
        isFiberHostType(obj.properties.get('type')) &&
        obj.properties.get('uniqueId') === hostUniqueId
    );
    
    if (!hostObj) {
        showError('Кросс или муфта были удалены. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    const cable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId);
    if (!cable) {
        showError('Кабель был удалён. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    const nodeConn = resolveHostNodeConnectionAtFiber(hostObj, cableId, fiberNumber);
    
    if (!nodeConn) {
        showError('Соединение было удалено. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    let nodeObj = objects.find(obj =>
        obj.properties &&
        obj.properties.get('type') === 'node' &&
        obj.properties.get('uniqueId') === nodeConn.nodeConn.nodeId
    );

    var traceOptions = null;
    if (nodeObj) {
        var hostUid = getObjectUniqueId(hostObj);
        traceOptions = {
            originNodeId: getObjectUniqueId(nodeObj),
            startHostId: hostUid,
            startCrossId: hostUid
        };
    }
    showFiberTraceFromCross(hostObj, cableId, fiberNumber, nodeObj, nodeConn.nodeConn, traceOptions);
}

function traceFromOLTPort(oltObj, portNumber) {
    const portAssignments = oltObj.properties.get('portAssignments') || {};
    const ass = portAssignments[String(portNumber)];
    if (!ass) {
        showWarning('На этот порт нет назначения. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    const oltName = oltObj.properties.get('name') || 'OLT';
    if (ass.onuId) {
        var onu = getMapObjectByUid(ass.onuId, 'onu');
        var onuName = onu ? (onu.properties.get('name') || 'ONU') : 'ONU';
        var incomingOnu = typeof getDisplayOltIncomingFiber === 'function'
            ? getDisplayOltIncomingFiber(oltObj)
            : (oltObj.properties.get('incomingFiber') || null);
        var traceCableId = incomingOnu && incomingOnu.cableId ? incomingOnu.cableId : null;
        var traceFiber = incomingOnu && incomingOnu.fiberNumber != null ? incomingOnu.fiberNumber : null;
        if (!traceCableId && onu) {
            var onuInc = onu.properties.get('incomingFiber');
            if (onuInc && onuInc.cableId) {
                traceCableId = onuInc.cableId;
                traceFiber = onuInc.fiberNumber;
            }
        }
        if (traceCableId && traceFiber != null) {
            var startHost = resolveOltTraceStartObject(oltObj, traceCableId, traceFiber);
            if (!startHost) {
                showError('Не найдена точка трассировки в ящике для порта OLT.', 'Трассировка');
                if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
                    showObjectInfo(currentModalObject);
                }
                return;
            }
            var oltTraceOpts = { traceTowardOnu: true, targetOnuId: getObjectUniqueId(onu) };
            showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startHost, traceCableId, traceFiber, oltTraceOpts, onu);
            return;
        }
        var portLabelOnu = getOltPortLabel(oltObj, portNumber);
        openFiberTraceModal({
            title: 'Трассировка от OLT',
            subtitle: formatOltPortDisplay(portNumber, portLabelOnu, true) + ' · ' + oltName,
            bodyHtml: '<p class="trace-intro">OLT «' + escapeHtml(oltName) + '», ' +
                escapeHtml(formatOltPortDisplay(portNumber, portLabelOnu)) + ' → ONU «' + escapeHtml(onuName) + '»</p>'
        });
        return;
    }
    if (ass.mediaConverterId) {
        var mc = getMapObjectByUid(ass.mediaConverterId, 'mediaConverter');
        var mcName = mc ? (mc.properties.get('name') || 'Медиаконвертер') : 'Медиаконвертер';
        var incomingMc = typeof getDisplayOltIncomingFiber === 'function'
            ? getDisplayOltIncomingFiber(oltObj)
            : (oltObj.properties.get('incomingFiber') || null);
        var traceCableIdMc = incomingMc && incomingMc.cableId ? incomingMc.cableId : null;
        var traceFiberMc = incomingMc && incomingMc.fiberNumber != null ? incomingMc.fiberNumber : null;
        if (!traceCableIdMc && mc) {
            var mcInc = mc.properties.get('incomingFiber');
            if (mcInc && mcInc.cableId) {
                traceCableIdMc = mcInc.cableId;
                traceFiberMc = mcInc.fiberNumber;
            }
        }
        if (traceCableIdMc && traceFiberMc != null) {
            var startHostMc = resolveOltTraceStartObject(oltObj, traceCableIdMc, traceFiberMc, ['mediaConverterConnections']);
            if (!startHostMc) {
                showError('Не найдена точка трассировки в ящике для порта OLT.', 'Трассировка');
                if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
                    showObjectInfo(currentModalObject);
                }
                return;
            }
            showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startHostMc, traceCableIdMc, traceFiberMc);
            return;
        }
        var portLabelMc = getOltPortLabel(oltObj, portNumber);
        openFiberTraceModal({
            title: 'Трассировка от OLT',
            subtitle: formatOltPortDisplay(portNumber, portLabelMc, true) + ' · ' + oltName,
            bodyHtml: '<p class="trace-intro">OLT «' + escapeHtml(oltName) + '», ' +
                escapeHtml(formatOltPortDisplay(portNumber, portLabelMc)) + ' → МК «' + escapeHtml(mcName) + '»</p>'
        });
        return;
    }
    if (ass.crossId != null && ass.crossPort != null) {
        const cross = objects.find(function(o) {
            return o.properties && isCrossLikeHostType(o.properties.get('type')) &&
                traceUidEq(getObjectUniqueId(o), ass.crossId);
        });
        if (!cross) {
            showError('Кросс подключения не найден. Информация обновлена.', 'Данные устарели');
            if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
                showObjectInfo(currentModalObject);
            }
            return;
        }
        var crossTraceOpts = { traceTowardOnu: true };
        var crossBiasPrev = findOltTraceBiasPrevious(cross, ass.cableId, ass.fiberNumber, oltObj);
        if (crossBiasPrev) crossTraceOpts.initialPreviousObject = crossBiasPrev;
        showFiberTraceFromOLTPort(oltObj, oltName, portNumber, cross, ass.cableId, ass.fiberNumber, crossTraceOpts);
        return;
    }
    const cable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === ass.cableId);
    if (!cable) {
        showError('Кабель был удалён. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    var startHostDirect = resolveOltTraceStartObject(oltObj, ass.cableId, ass.fiberNumber);
    if (!startHostDirect) {
        var oltInCabinet = typeof getObjectCabinetId === 'function' && getObjectCabinetId(oltObj);
        if (oltInCabinet) {
            showError('Не найдена точка трассировки в ящике для порта OLT.', 'Трассировка');
            if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
                showObjectInfo(currentModalObject);
            }
            return;
        }
        startHostDirect = oltObj;
    }
    var directTraceOpts = {};
    var targetOnuDirect = null;
    if (ass.onuId) {
        targetOnuDirect = getMapObjectByUid(ass.onuId, 'onu');
        if (targetOnuDirect) {
            directTraceOpts.traceTowardOnu = true;
            directTraceOpts.targetOnuId = getObjectUniqueId(targetOnuDirect);
        }
    }
    showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startHostDirect, ass.cableId, ass.fiberNumber, directTraceOpts, targetOnuDirect);
}

function getObjectMapCoordinates(obj) {
    if (!obj) return null;
    if (typeof getObjectRoutingCoords === 'function') {
        var routed = getObjectRoutingCoords(obj);
        if (routed && routed.length >= 2 && !Array.isArray(routed[0])) {
            var rLat = Number(routed[0]);
            var rLon = Number(routed[1]);
            if (Number.isFinite(rLat) && Number.isFinite(rLon)) return [rLat, rLon];
        }
    }
    if (!obj.geometry) return null;
    try {
        var coords = obj.geometry.getCoordinates();
        if (!coords || coords.length < 2 || Array.isArray(coords[0])) return null;
        var lat = Number(coords[0]);
        var lon = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        return [lat, lon];
    } catch (e) {
        return null;
    }
}

function buildObjectCoordsShowBtnHtml(obj, opts) {
    opts = opts || {};
    var coords = getObjectMapCoordinates(obj);
    if (!coords) return '';
    var uid = getObjectUniqueId(obj);
    var attrs = uid
        ? ' data-object-id="' + escapeHtml(uid) + '"'
        : ' data-lat="' + coords[0].toFixed(6) + '" data-lon="' + coords[1].toFixed(6) + '"';
    var extraClass = (opts.iconOnly ? ' object-coords-show-btn--icon-only' : '') +
        (opts.subtle !== false ? ' object-coords-show-btn--subtle' : '');
    var label = opts.iconOnly ? '' : '<span class="object-coords-show-btn-text">На карте</span>';
    return '<button type="button" class="object-coords-show-btn' + extraClass + '"' + attrs +
        ' title="Показать на карте" aria-label="Показать на карте">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
        label + '</button>';
}

function buildObjectCoordsInlineHtml(obj, opts) {
    opts = opts || {};
    var coords = getObjectMapCoordinates(obj);
    if (!coords) return '';
    var lat = coords[0].toFixed(6);
    var lon = coords[1].toFixed(6);
    var extraClass = opts.compact ? ' object-coords-inline--compact' : '';
    var html = '<div class="object-coords-inline' + extraClass + '">';
    if (opts.showLabel !== false) {
        html += '<span class="object-coords-inline-label">Координаты</span>';
    }
    html += '<span class="object-coords-inline-value" title="Широта, долгота">' + lat + ', ' + lon + '</span>';
    html += buildObjectCoordsShowBtnHtml(obj, { iconOnly: true, subtle: opts.subtle });
    html += '</div>';
    return html;
}

function buildObjectCoordsStatsHtml(obj) {
    return buildObjectCoordsInlineHtml(obj);
}

function buildObjectCoordsSectionHtml(obj) {
    var coords = getObjectMapCoordinates(obj);
    if (!coords) return '';
    return '<section class="object-card-section object-card-section--coords">' +
        buildObjectCoordsInlineHtml(obj, { compact: true }) +
        '</section>';
}

function attachObjectCoordsSectionHandlers(container) {
    if (!container) return;
    container.querySelectorAll('.object-coords-show-btn').forEach(function(btn) {
        if (btn._coordsShowBound) return;
        btn._coordsShowBound = true;
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var uid = btn.getAttribute('data-object-id');
            if (uid && typeof showObjectOnMap === 'function') {
                showObjectOnMap(uid);
                return;
            }
            var lat = parseFloat(btn.getAttribute('data-lat'));
            var lon = parseFloat(btn.getAttribute('data-lon'));
            if (Number.isFinite(lat) && Number.isFinite(lon) && typeof showPlacementCoordsOnMap === 'function') {
                showPlacementCoordsOnMap([lat, lon]);
            }
        });
    });
}

function showObjectOnMap(uniqueId) {
    clearShowOnMapHighlight();
    var obj = objects.find(function(o) {
        return o.properties && o.properties.get('uniqueId') === uniqueId;
    });
    if (!obj) {
        showWarning('Объект не найден на карте', 'Навигация');
        return;
    }
    var coords = null;
    var objType = obj.properties.get('type');
    if (objType === 'cable') {
        var geometry = obj.geometry;
        if (geometry && geometry.getCoordinates) {
            var cableCoords = geometry.getCoordinates();
            if (cableCoords && cableCoords.length > 0) {
                var midIdx = Math.floor(cableCoords.length / 2);
                coords = cableCoords[midIdx];
            }
        }
    } else {
        coords = obj.geometry.getCoordinates();
    }
    if (!coords) {
        showWarning('Не удалось получить координаты объекта', 'Навигация');
        return;
    }
    myMap.setCenter(coords, 21, { duration: 300 });
    if (objType !== 'cable') {
        var originalPreset = obj.options.get('preset');
        obj.options.set('preset', 'islands#redCircleDotIcon');
        var tid = setTimeout(function() {
            clearShowOnMapHighlight();
        }, 2000);
        showOnMapHighlightState = { obj: obj, originalOptions: { preset: originalPreset }, timeoutId: tid, isCable: false };
    } else {
        var originalColor = obj.options.get('strokeColor');
        var originalWidth = obj.options.get('strokeWidth');
        obj.options.set('strokeColor', '#ff0000');
        obj.options.set('strokeWidth', 5);
        var tid = setTimeout(function() {
            clearShowOnMapHighlight();
        }, 2000);
        showOnMapHighlightState = { obj: obj, originalOptions: { strokeColor: originalColor, strokeWidth: originalWidth }, timeoutId: tid, isCable: true };
    }
}

function attachTraceShowOnMapHandlers(container) {
    var buttons = container.querySelectorAll('.trace-show-on-map-btn');
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var objId = btn.getAttribute('data-object-id');
            if (objId) {
                showObjectOnMap(objId);
            }
        });
    });
}

function renderOnePathToTraceHtml(path, startStepNumber) {
    if (window.FiberTrace && FiberTrace.renderCompactPathHtml) {
        return FiberTrace.renderCompactPathHtml(path, startStepNumber);
    }
    var stepNumber = startStepNumber;
    var html = '';
    var enrichedPath = (window.FiberTrace && FiberTrace.enrichPathWithLengths) ? FiberTrace.enrichPathWithLengths(path) : path;
    var displayPath = (window.FiberTrace && FiberTrace.compressPathForDisplay) ? FiberTrace.compressPathForDisplay(enrichedPath) : enrichedPath;
    if (window.FiberTrace && FiberTrace.renderPathStatusHtml) {
        html += FiberTrace.renderPathStatusHtml(path);
    }
    displayPath.forEach(function(item) {
        var objUniqueId = item.object ? getObjectUniqueId(item.object) : null;
        var showOnMapBtn = objUniqueId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(objUniqueId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
        var traceIcon = (window.FiberTrace && FiberTrace.getObjectIcon) ? FiberTrace.getObjectIcon(item.objectType) : '📍';
        
        if (item.type === 'start') {
            var portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            var reserveBadge = (item.reserveM != null && item.reserveM > 0) ? ' <span class="trace-item-reserve">+' + item.reserveM + ' м</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-start">' + stepNumber + '</span><div class="trace-path-block trace-path-start"><div><span>' + traceIcon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + reserveBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'object') {
            portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            var reserveBadgeObj = (item.reserveM != null && item.reserveM > 0) ? ' <span class="trace-item-reserve">+' + item.reserveM + ' м</span>' : '';
            var wpMuted = (window.FiberTrace && FiberTrace.isWaypointType(item.objectType)) ? ' trace-path-block--waypoint' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">' + stepNumber + '</span><div class="trace-path-block trace-path-object' + wpMuted + '"><div><span>' + traceIcon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + reserveBadgeObj + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'onuConnection') {
            var onuConnObjId = item.onu ? getObjectUniqueId(item.onu) : null;
            var onuConnShowBtn = onuConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(onuConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🔌</span><div class="trace-path-block trace-path-object"><span>🔌 Вывод на ONU: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.onuName) + '</span>' + onuConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'mediaConverterConnection') {
            var mcConnObjId = item.mediaConverter ? getObjectUniqueId(item.mediaConverter) : null;
            var mcConnShowBtn = mcConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(mcConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">⇄</span><div class="trace-path-block trace-path-object"><span>⇄ Вывод на медиаконвертер: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.mediaConverterName || 'Медиаконвертер') + '</span>' + mcConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'cable') {
            var cableObjId = item.cable ? getObjectUniqueId(item.cable) : null;
            var cableShowBtn = cableObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(cableObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var cableType = item.cable ? item.cable.properties.get('cableType') : null;
            var traceCableObj = item.cable || null;
            var fiberColors = traceCableObj ? getFiberColors(traceCableObj) : (cableType ? getFiberColors(cableType) : []);
            var fiber = fiberColors.find(function(f) { return f.number === item.fiberNumber; });
            var fiberColor = fiber ? fiber.color : '#3b82f6';
            var fiberName = fiber ? fiber.name : '';
            var fiberTextColor = (fiberColor === '#FFFFFF' || fiberColor === '#FFFACD' || fiberColor === '#FFFF00') ? '#000' : '#fff';
            var waypointsHtml = (item.waypoints && window.FiberTrace && FiberTrace.renderWaypointsInlineHtml) ? FiberTrace.renderWaypointsInlineHtml(item.waypoints) : '';
            var segLenHtml = (item.segmentLengthM != null) ? '<span class="trace-item-len">~' + item.segmentLengthM + ' м</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-cable">➡</span><div class="trace-path-block trace-path-cable" style="border-left-color: ' + fiberColor + ';"><div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;"><span>📡 ' + escapeHtml(item.cableName) + '</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 16px; height: 16px; border-radius: 50%; background: ' + fiberColor + '; border: 1px solid #333; display: inline-block;"></span><span style="background: ' + fiberColor + '; color: ' + fiberTextColor + '; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Жила ' + item.fiberNumber + (fiberName ? ': ' + fiberName : '') + '</span></span>' + segLenHtml + waypointsHtml + '</div>' + cableShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'connection') {
            var fromCableTrace = item.fromCable || (item.fromCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.fromCableId; }) : null);
            var toCableTrace = item.toCable || (item.toCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.toCableId; }) : null);
            var fromFiberColors = fromCableTrace ? getFiberColors(fromCableTrace) : (item.fromCableType ? getFiberColors(item.fromCableType) : []);
            var toFiberColors = toCableTrace ? getFiberColors(toCableTrace) : (item.toCableType ? getFiberColors(item.toCableType) : []);
            var fromFiber = fromFiberColors.find(function(f) { return f.number === item.fromFiberNumber; });
            var toFiber = toFiberColors.find(function(f) { return f.number === item.toFiberNumber; });
            var fromColor = fromFiber ? fromFiber.color : '#f59e0b';
            var toColor = toFiber ? toFiber.color : '#f59e0b';
            var fromTextColor = (fromColor === '#FFFFFF' || fromColor === '#FFFACD' || fromColor === '#FFFF00') ? '#000' : '#fff';
            var toTextColor = (toColor === '#FFFFFF' || toColor === '#FFFACD' || toColor === '#FFFF00') ? '#000' : '#fff';
            var fromFiberName = fromFiber ? fromFiber.name : '';
            var toFiberName = toFiber ? toFiber.name : '';
            var fromLabelText = item.fromLabel ? ' [' + escapeHtml(item.fromLabel) + ']' : '';
            var toLabelText = item.toLabel ? ' [' + escapeHtml(item.toLabel) + ']' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-connection">⚡</span><div class="trace-path-block trace-path-connection"><div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;"><span>🔗 Соединение:</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 14px; height: 14px; border-radius: 50%; background: ' + fromColor + '; border: 1px solid #333;"></span><span style="background: ' + fromColor + '; color: ' + fromTextColor + '; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Ж' + item.fromFiberNumber + (fromFiberName ? ' (' + fromFiberName + ')' : '') + '</span></span>' + (fromLabelText ? '<span style="color: var(--accent-primary); font-weight: 500; font-size: 0.8rem;">' + fromLabelText + '</span>' : '') + '<span style="font-size: 1rem;">→</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 14px; height: 14px; border-radius: 50%; background: ' + toColor + '; border: 1px solid #333;"></span><span style="background: ' + toColor + '; color: ' + toTextColor + '; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Ж' + item.toFiberNumber + (toFiberName ? ' (' + toFiberName + ')' : '') + '</span></span>' + (toLabelText ? '<span style="color: var(--accent-primary); font-weight: 500; font-size: 0.8rem;">' + toLabelText + '</span>' : '') + '</div></div></div>';
            stepNumber++;
        } else if (item.type === 'nodeConnection') {
            var nodeConnObjId = item.node ? getObjectUniqueId(item.node) : null;
            var nodeConnShowBtn = nodeConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(nodeConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🔌</span><div class="trace-path-block trace-path-object"><span>🔌 Вывод на узел: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.nodeName) + '</span>' + nodeConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterConnection') {
            var spObjId = item.splitter ? getObjectUniqueId(item.splitter) : null;
            var spShowBtn = spObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(spObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var spName = item.splitter && item.splitter.properties ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-connection">🔀</span><div class="trace-path-block trace-path-connection"><div><span>→ Жила идёт на сплиттер «' + escapeHtml(spName) + '»</span><span class="trace-path-muted">(жила ' + item.fiberNumber + ')</span></div>' + spShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToOnu') {
            var spOutOnuId = item.onuObj ? getObjectUniqueId(item.onuObj) : null;
            var spOutOnuBtn = spOutOnuId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(spOutOnuId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-onu">📡</span><div class="trace-path-block trace-path-object"><span>🔀 Выход сплиттера → ONU ' + escapeHtml(item.onuName || 'ONU') + '</span>' + spOutOnuBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToNode') {
            var spOutNodeId = item.nodeObj ? getObjectUniqueId(item.nodeObj) : null;
            var spOutNodeBtn = spOutNodeId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(spOutNodeId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var spOutNodePort = item.switchPort != null ? ', SFP ' + item.switchPort : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🖥️</span><div class="trace-path-block trace-path-object"><span>🔀 Выход сплиттера → Узел ' + escapeHtml(item.nodeName || 'Узел') + escapeHtml(spOutNodePort) + '</span>' + spOutNodeBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToSplitter') {
            var toSpObjId = item.toSplitter ? getObjectUniqueId(item.toSplitter) : null;
            var toSpShowBtn = toSpObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(toSpObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var toName = item.toSplitter && item.toSplitter.properties ? item.toSplitter.properties.get('name') || 'Сплиттер' : 'Сплиттер';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-splitter">🔀</span><div class="trace-path-block trace-path-splitter"><span>🔀 Выход сплиттера → ' + escapeHtml(toName) + '</span>' + toSpShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToCrossPort') {
            var crossOutId = item.cross ? getObjectUniqueId(item.cross) : null;
            var crossOutBtn = crossOutId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(crossOutId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-splitter">🔀</span><div class="trace-path-block trace-path-splitter"><span>🔀 Выход сплиттера → порт ' + item.crossPort + ' («' + escapeHtml(item.crossName || 'Кросс') + '»)</span>' + crossOutBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'oltPortConnection') {
            var oltObjId = item.olt ? getObjectUniqueId(item.olt) : null;
            var oltShowBtn = oltObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(oltObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var oltPortText = item.incoming ? 'приход' : formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt ? getOltPortLabel(item.olt, item.portNumber) : ''));
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-olt">🔌</span><div class="trace-path-block trace-path-olt"><div><span>📶 Подключено к OLT «' + escapeHtml(item.oltName || 'OLT') + '», ' + escapeHtml(String(oltPortText)) + '</span><span class="trace-path-muted">(жила ' + item.fiberNumber + ')</span></div>' + oltShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'crossPortPatch') {
            var fromCrossId = item.fromCross ? getObjectUniqueId(item.fromCross) : null;
            var toCrossId = item.toCross ? getObjectUniqueId(item.toCross) : null;
            var patchPin = toCrossId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(toCrossId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-connection">⇄</span><div class="trace-path-block trace-path-connection"><span>⇄ Кроссировка: «' + escapeHtml(item.fromCrossName || 'Кросс') + '» п.' + item.fromPort + ' → «' + escapeHtml(item.toCrossName || 'Кросс') + '» п.' + item.toPort + '</span>' + patchPin + '</div></div>';
            stepNumber++;
        }
    });
    var cablesCount = path.filter(function(p) { return p.type === 'cable'; }).length;
    var connectionsCount = path.filter(function(p) { return p.type === 'connection'; }).length;
    var oltCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'olt'; }).length;
    var splitterCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'splitter'; }).length;
    var onuCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'onu'; }).length;
    html += '<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-secondary);">📡 Кабелей: ' + cablesCount + ', 🔗 соединений: ' + connectionsCount + (oltCount + splitterCount + onuCount > 0 ? ', 📶 OLT: ' + oltCount + ', 🔀 Сплиттеров: ' + splitterCount + ', 📟 ONU: ' + onuCount : '') + '</div>';
    return { html: html, nextStepNumber: stepNumber };
}

function findSplitterOutputsForOnu(onuUid) {
    var hits = [];
    if (!onuUid) return hits;
    function scan(sp, hostObj) {
        if (!sp || !sp.properties) return;
        if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(sp);
        var outputs = sp.properties.get('outputConnections') || [];
        for (var oi = 0; oi < outputs.length; oi++) {
            var out = outputs[oi];
            if (out && traceUidEq(out.onuId, onuUid)) {
                hits.push({ splitter: sp, host: hostObj || sp._host || null, outputIndex: oi, out: out });
            }
        }
    }
    if (window.EmbeddedSplitters) {
        EmbeddedSplitters.forEach(function(sp) { scan(sp, sp._host); });
    }
    objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') === 'splitter') scan(o, null);
    });
    return hits;
}

function findSplitterOnHostFiber(hostObj, cableId, fiberNumber, targetOnuId) {
    if (!hostObj || !cableId || fiberNumber == null) return null;
    var sc = typeof getHostAssignment === 'function'
        ? getHostAssignment(hostObj, 'splitterConnections', cableId, fiberNumber)
        : null;
    if (sc && sc.splitterId) {
        var spFromConn = typeof resolveSplitterObject === 'function' ? resolveSplitterObject(sc.splitterId) : null;
        if (spFromConn) return { splitter: spFromConn, host: hostObj };
    }
    if (window.EmbeddedSplitters && EmbeddedSplitters.isHost(hostObj)) {
        var list = EmbeddedSplitters.getList(hostObj) || [];
        for (var ei = 0; ei < list.length; ei++) {
            var rec = list[ei];
            var facade = EmbeddedSplitters.createFacade(hostObj, rec);
            if (!facade) continue;
            if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(facade);
            var inF = facade.properties.get('inputFiber');
            if (!inF && rec.inputCableId && rec.inputFiberNumber != null) {
                inF = { cableId: rec.inputCableId, fiberNumber: rec.inputFiberNumber };
            }
            if (!inF || inF.cableId !== cableId || Number(inF.fiberNumber) !== Number(fiberNumber)) {
                if (targetOnuId) {
                    var outsAny = facade.properties.get('outputConnections') || [];
                    for (var oa = 0; oa < outsAny.length; oa++) {
                        if (outsAny[oa] && traceUidEq(outsAny[oa].onuId, targetOnuId)) {
                            return { splitter: facade, host: hostObj };
                        }
                    }
                }
                continue;
            }
            if (!targetOnuId) return { splitter: facade, host: hostObj };
            var outs = facade.properties.get('outputConnections') || [];
            for (var oi = 0; oi < outs.length; oi++) {
                if (outs[oi] && traceUidEq(outs[oi].onuId, targetOnuId)) {
                    return { splitter: facade, host: hostObj };
                }
            }
        }
    }
    if (targetOnuId) {
        var scMap = hostObj.properties.get('splitterConnections') || {};
        for (var skey in scMap) {
            if (!scMap[skey] || !scMap[skey].splitterId) continue;
            var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(skey) : null;
            if (!parsed || parsed.cableId !== cableId) continue;
            var spAny = typeof resolveSplitterObject === 'function' ? resolveSplitterObject(scMap[skey].splitterId) : null;
            if (!spAny) continue;
            if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(spAny);
            var outs2 = spAny.properties.get('outputConnections') || [];
            for (var oj = 0; oj < outs2.length; oj++) {
                if (outs2[oj] && traceUidEq(outs2[oj].onuId, targetOnuId)) {
                    return { splitter: spAny, host: hostObj };
                }
            }
        }
    }
    return null;
}

function hostHasCableFiber(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    if (typeof crossHasFiberForConnection === 'function') {
        return crossHasFiberForConnection(hostObj, cableId, fiberNumber);
    }
    if (typeof getConnectedCables === 'function') {
        return getConnectedCables(hostObj).some(function(c) {
            return c.properties && c.properties.get('uniqueId') === cableId;
        });
    }
    return false;
}

function findTargetOnuFiberAtHost(hostObj, cableId, targetOnuId) {
    if (!hostObj || !targetOnuId) return null;
    var onuObj = typeof getMapObjectByUid === 'function' ? getMapObjectByUid(targetOnuId, 'onu') : null;
    if (!onuObj) {
        onuObj = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'onu' && traceUidEq(getObjectUniqueId(o), targetOnuId);
        });
    }
    if (!onuObj) return null;
    var inc = onuObj.properties.get('incomingFiber');
    if (!inc || !inc.cableId || inc.fiberNumber == null) return null;
    if (cableId && inc.cableId !== cableId) return null;
    if (!hostHasCableFiber(hostObj, inc.cableId, inc.fiberNumber)) return null;
    return { cableId: inc.cableId, fiberNumber: inc.fiberNumber, onu: onuObj };
}

function tryAppendOnuAtHostForTrace(path, hostObj, cableId, fiberNumber, targetOnuId) {
    if (!path || !hostObj || !targetOnuId || cableId == null || fiberNumber == null) return false;
    var hostType = hostObj.properties.get('type');

    var onuConn = typeof getHostAssignment === 'function'
        ? getHostAssignment(hostObj, 'onuConnections', cableId, fiberNumber)
        : null;
    if (onuConn && traceUidEq(onuConn.onuId, targetOnuId)) {
        var onuDirect = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'onu' && traceUidEq(getObjectUniqueId(o), targetOnuId);
        });
        if (onuDirect) {
            path.push({
                type: 'onuConnection',
                cableId: cableId,
                fiberNumber: fiberNumber,
                onuName: onuConn.onuName || onuDirect.properties.get('name') || 'ONU',
                cross: hostObj,
                onu: onuDirect
            });
            path.push({
                type: 'object',
                objectType: 'onu',
                objectName: onuDirect.properties.get('name') || 'ONU',
                object: onuDirect
            });
            return true;
        }
    }

    if (typeof findSplitterOnHostFiber === 'function' && typeof appendSplitterOnuStepsToPath === 'function') {
        var spHit = findSplitterOnHostFiber(hostObj, cableId, fiberNumber, targetOnuId);
        if (spHit && spHit.splitter) {
            var extended = appendSplitterOnuStepsToPath(path.slice(), spHit.splitter, targetOnuId, hostObj);
            if (pathReachesOnu(extended, targetOnuId)) {
                extended.slice(path.length).forEach(function(step) { path.push(step); });
                return true;
            }
        }
    }

    if (isFiberHostType(hostType)) {
        var target = findTargetOnuFiberAtHost(hostObj, cableId, targetOnuId);
        if (target && target.onu) {
            if (Number(target.fiberNumber) !== Number(fiberNumber)) {
                var fiberLabels = hostObj.properties.get('fiberLabels') || {};
                path.push({
                    type: 'connection',
                    fromCableId: cableId,
                    fromFiberNumber: fiberNumber,
                    fromLabel: fiberLabels[cableId + '-' + fiberNumber] || '',
                    fromCableType: null,
                    toCableId: cableId,
                    toFiberNumber: target.fiberNumber,
                    toLabel: fiberLabels[cableId + '-' + target.fiberNumber] || '',
                    toCableType: null,
                    sleeve: hostObj,
                    internalCrossFiber: true
                });
            }
            path.push({
                type: 'onuConnection',
                cableId: target.cableId,
                fiberNumber: target.fiberNumber,
                onuName: target.onu.properties.get('name') || 'ONU',
                cross: hostObj,
                onu: target.onu
            });
            path.push({
                type: 'object',
                objectType: 'onu',
                objectName: target.onu.properties.get('name') || 'ONU',
                object: target.onu
            });
            return true;
        }
    }
    return false;
}

function appendSplitterOnuStepsToPath(path, splitterObj, onuUid, hostObj) {
    if (!path || !splitterObj || !onuUid) return path;
    if (pathReachesOnu(path, onuUid)) return path;
    var onuObj = typeof getMapObjectByUid === 'function' ? getMapObjectByUid(onuUid, 'onu') : null;
    if (!onuObj) {
        onuObj = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === onuUid;
        });
    }
    if (!onuObj) return path;
    var out = path.slice();
    var spUid = getObjectUniqueId(splitterObj);
    var hasSp = out.some(function(it) {
        if (it.type === 'object' && it.objectType === 'splitter' && it.object && getObjectUniqueId(it.object) === spUid) return true;
        if (it.type === 'splitterConnection' && it.splitter && getObjectUniqueId(it.splitter) === spUid) return true;
        return false;
    });
    if (!hasSp) {
        out.push({
            type: 'splitterConnection',
            sleeve: hostObj || splitterObj._host || null,
            splitter: splitterObj,
            cableId: null,
            fiberNumber: null
        });
        out.push({
            type: 'object',
            objectType: 'splitter',
            objectName: splitterObj.properties.get('name') || 'Сплиттер',
            object: splitterObj,
            port: null
        });
    }
    out.push({
        type: 'splitterOutputToOnu',
        splitter: splitterObj,
        onuObj: onuObj,
        onuName: onuObj.properties.get('name') || 'ONU'
    });
    out.push({
        type: 'object',
        objectType: 'onu',
        objectName: onuObj.properties.get('name') || 'ONU',
        object: onuObj,
        port: null
    });
    return out;
}

function isOnuOnOltFeederBranch(oltObj, hostObj, cableId, fiberNumber) {
    if (!oltObj || !hostObj || !cableId) return false;
    var oltUid = getObjectUniqueId(oltObj);
    var incoming = typeof getDisplayOltIncomingFiber === 'function'
        ? getDisplayOltIncomingFiber(oltObj)
        : (oltObj.properties.get('incomingFiber') || null);
    if (incoming && incoming.cableId === cableId) {
        if (Number(incoming.fiberNumber) === Number(fiberNumber)) return true;
        var oltMap = hostObj.properties.get('oltConnections') || {};
        for (var key in oltMap) {
            if (!oltMap[key] || !traceUidEq(oltMap[key].oltId, oltUid)) continue;
            var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(key) : null;
            if (parsed && parsed.cableId === cableId) return true;
        }
        var oltCabId = typeof getObjectCabinetId === 'function' ? getObjectCabinetId(oltObj) : '';
        var hostCabId = typeof getObjectCabinetId === 'function' ? getObjectCabinetId(hostObj) : '';
        if (oltCabId && hostCabId && oltCabId === hostCabId) return true;
    }
    return typeof isFiberReachableToOlt === 'function' &&
        isFiberReachableToOlt(hostObj, cableId, fiberNumber);
}

function oltPortAssignsOnu(oltObj, portNumber, onuUid) {
    if (!oltObj || !onuUid || portNumber == null) return false;
    var ass = (oltObj.properties.get('portAssignments') || {})[String(portNumber)];
    return !!(ass && traceUidEq(ass.onuId, onuUid));
}

function tryCompleteOltTraceToOnu(oltObj, portNumber, startObj, cableId, fiberNumber, onuUid, partialPaths, traceOptions) {
    if (!onuUid || !oltObj) return null;
    var opts = Object.assign({}, traceOptions || {}, { traceTowardOnu: true, targetOnuId: onuUid });
    var biasPrev = findOltTraceBiasPrevious(startObj, cableId, fiberNumber, oltObj);
    if (biasPrev) opts.initialPreviousObject = biasPrev;

    var directAtHost = [];
    if (tryAppendOnuAtHostForTrace(directAtHost, startObj, cableId, fiberNumber, onuUid)) {
        var feederForDirect = traceFiberPathFromObject(startObj, cableId, fiberNumber, opts);
        var mergedDirect = (!feederForDirect.error && feederForDirect.path.length)
            ? feederForDirect.path.slice()
            : [{
                type: 'start',
                objectType: startObj.properties.get('type'),
                objectName: startObj.properties.get('name') || getObjectTypeName(startObj.properties.get('type')),
                object: startObj,
                port: (startObj.properties.get('type') === 'cross')
                    ? ((startObj.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null)
                    : null
            }];
        directAtHost.forEach(function(step) { mergedDirect.push(step); });
        if (pathReachesOnu(mergedDirect, onuUid)) {
            return prependOltPrefixToPath(mergedDirect, oltObj, portNumber, startObj, cableId, fiberNumber);
        }
    }

    var hits = findSplitterOutputsForOnu(onuUid);
    if (!hits.length) return null;
    var trustedOnu = oltPortAssignsOnu(oltObj, portNumber, onuUid);

    for (var hi = 0; hi < hits.length; hi++) {
        var hit = hits[hi];
        var sp = hit.splitter;
        if (typeof syncSplitterInputFromHost === 'function') syncSplitterInputFromHost(sp);
        var hostIn = typeof getSplitterHostInputFiber === 'function' ? getSplitterHostInputFiber(sp) : null;
        if (!hostIn || !hostIn.hostObj || !hostIn.cableId || hostIn.fiberNumber == null) continue;
        if (!trustedOnu && !isOnuOnOltFeederBranch(oltObj, hostIn.hostObj, hostIn.cableId, hostIn.fiberNumber)) continue;

        var spRes = traceAllFiberPathsFromObject(hostIn.hostObj, hostIn.cableId, hostIn.fiberNumber, opts);
        var spPaths = spRes.paths || [];
        for (var pi = 0; pi < spPaths.length; pi++) {
            if (pathReachesOnu(spPaths[pi], onuUid)) {
                return prependOltPrefixToPath(spPaths[pi], oltObj, portNumber, startObj, cableId, fiberNumber);
            }
        }

        var base = null;
        if (partialPaths && partialPaths.length) {
            for (var bi = 0; bi < partialPaths.length; bi++) {
                if (partialPaths[bi] && partialPaths[bi].length) { base = partialPaths[bi]; break; }
            }
        }
        if (!base) {
            var feederRes = traceFiberPathFromObject(startObj, cableId, fiberNumber, opts);
            if (!feederRes.error && feederRes.path.length) base = feederRes.path;
        }
        if (base) {
            var extended = appendSplitterOnuStepsToPath(base, sp, onuUid, hostIn.hostObj);
            if (pathReachesOnu(extended, onuUid)) {
                return prependOltPrefixToPath(extended, oltObj, portNumber, startObj, cableId, fiberNumber);
            }
        }

        var minimal = [{
            type: 'start',
            objectType: hostIn.hostObj.properties.get('type'),
            objectName: hostIn.hostObj.properties.get('name') || getObjectTypeName(hostIn.hostObj.properties.get('type')),
            object: hostIn.hostObj,
            port: (hostIn.hostObj.properties.get('type') === 'cross')
                ? ((hostIn.hostObj.properties.get('fiberPorts') || {})[hostIn.cableId + '-' + hostIn.fiberNumber] || null)
                : null
        }];
        minimal = appendSplitterOnuStepsToPath(minimal, sp, onuUid, hostIn.hostObj);
        if (pathReachesOnu(minimal, onuUid)) {
            var feederOnly = traceFiberPathFromObject(startObj, cableId, fiberNumber, opts);
            if (!feederOnly.error && feederOnly.path.length > 1) {
                var merged = feederOnly.path.slice();
                var hostUid = getObjectUniqueId(hostIn.hostObj);
                var hostIdx = -1;
                for (var mi = merged.length - 1; mi >= 0; mi--) {
                    var mit = merged[mi];
                    if (mit.type === 'object' && mit.object && getObjectUniqueId(mit.object) === hostUid) {
                        hostIdx = mi;
                        break;
                    }
                }
                if (hostIdx >= 0) {
                    merged = merged.slice(0, hostIdx + 1).concat(minimal.slice(1));
                    if (pathReachesOnu(merged, onuUid)) {
                        return prependOltPrefixToPath(merged, oltObj, portNumber, startObj, cableId, fiberNumber);
                    }
                }
            }
            return prependOltPrefixToPath(minimal, oltObj, portNumber, startObj, cableId, fiberNumber);
        }
    }
    return null;
}

function findOltTraceStartHost(oltObj, cableId, fiberNumber, extraAssignmentProps) {
    if (!cableId || fiberNumber == null || !Array.isArray(objects)) return null;
    var oltCabId = (typeof getObjectCabinetId === 'function' && oltObj) ? getObjectCabinetId(oltObj) : '';
    var extraProps = Array.isArray(extraAssignmentProps) ? extraAssignmentProps : [];
    var candidates = [];
    for (var hi = 0; hi < objects.length; hi++) {
        var slot = objects[hi];
        if (!slot || !slot.properties || !isFiberHostType(slot.properties.get('type'))) continue;
        var matched = getHostAssignment(slot, 'oltConnections', cableId, fiberNumber) ||
            getHostAssignment(slot, 'onuConnections', cableId, fiberNumber) ||
            getHostAssignment(slot, 'splitterConnections', cableId, fiberNumber);
        if (!matched) {
            for (var ep = 0; ep < extraProps.length; ep++) {
                if (getHostAssignment(slot, extraProps[ep], cableId, fiberNumber)) {
                    matched = true;
                    break;
                }
            }
        }
        if (matched) candidates.push(slot);
    }
    if (!candidates.length && oltCabId && typeof getCabinetByUid === 'function') {
        var oltCab = getCabinetByUid(oltCabId);
        var oltCable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
        });
        if (oltCab && oltCable && typeof findCabinetMemberOnCable === 'function') {
            var cabHost = findCabinetMemberOnCable(oltCab, oltCable, { fiberKey: cableId + '-' + fiberNumber });
            if (cabHost && cabHost.properties && isFiberHostType(cabHost.properties.get('type'))) {
                return cabHost;
            }
        }
        var oltUid = oltObj ? getObjectUniqueId(oltObj) : null;
        if (oltUid) {
            getCabinetMembers(oltCabId).forEach(function(member) {
                if (!member || !member.properties || !isFiberHostType(member.properties.get('type'))) return;
                var oltMap = member.properties.get('oltConnections') || {};
                Object.keys(oltMap).forEach(function(key) {
                    var conn = oltMap[key];
                    if (!conn || !traceUidEq(conn.oltId, oltUid)) return;
                    var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(key) : null;
                    if (parsed && parsed.cableId === cableId && parsed.fiberNumber === fiberNumber) {
                        candidates.push(member);
                    }
                });
            });
        }
    }
    if (!candidates.length) return null;
    if (oltCabId) {
        for (var ci = 0; ci < candidates.length; ci++) {
            if (getObjectCabinetId(candidates[ci]) === oltCabId) return candidates[ci];
        }
    }
    return candidates[0];
}

function resolveOltTraceStartObject(oltObj, cableId, fiberNumber, extraAssignmentProps) {
    var host = findOltTraceStartHost(oltObj, cableId, fiberNumber, extraAssignmentProps);
    if (host) return host;
    var oltCabId = (typeof getObjectCabinetId === 'function' && oltObj) ? getObjectCabinetId(oltObj) : '';
    if (!oltCabId) return oltObj || null;
    if (cableId == null || fiberNumber == null) return null;
    if (typeof getCabinetByUid === 'function') {
        var oltCab = getCabinetByUid(oltCabId);
        var oltCable = objects.find(function(c) {
            return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
        });
        if (oltCab && oltCable && typeof findCabinetMemberOnCable === 'function') {
            var cabHost = findCabinetMemberOnCable(oltCab, oltCable, { fiberKey: cableId + '-' + fiberNumber });
            if (cabHost) return cabHost;
        }
    }
    if (typeof getCabinetMembers === 'function') {
        var members = getCabinetMembers(oltCabId);
        for (var mi = 0; mi < members.length; mi++) {
            var member = members[mi];
            if (!member || !member.properties || !isFiberHostType(member.properties.get('type'))) continue;
            if (getHostAssignment(member, 'oltConnections', cableId, fiberNumber)) return member;
        }
    }
    return null;
}

function findOltCableEndpointForBias(cable, oltObj) {
    if (!cable || !oltObj) return null;
    var matchPt = typeof traceRouteObjectsMatch === 'function' ? traceRouteObjectsMatch : function(a, b) {
        return a === b || (a && b && getObjectUniqueId(a) === getObjectUniqueId(b));
    };
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    if (matchPt(fromObj, oltObj)) return fromObj;
    if (matchPt(toObj, oltObj)) return toObj;
    var oltCabId = typeof getObjectCabinetId === 'function' ? getObjectCabinetId(oltObj) : '';
    if (!oltCabId) return null;
    if (fromObj && fromObj.properties && fromObj.properties.get('type') === 'cabinet' &&
        getObjectUniqueId(fromObj) === oltCabId) return fromObj;
    if (toObj && toObj.properties && toObj.properties.get('type') === 'cabinet' &&
        getObjectUniqueId(toObj) === oltCabId) return toObj;
    return null;
}

function findOltTraceBiasPrevious(startHost, cableId, fiberNumber, oltObj) {
    if (!startHost || !cableId) return null;
    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable) return null;
    if (oltObj) {
        var oltEndpoint = findOltCableEndpointForBias(cable, oltObj);
        if (oltEndpoint) return oltEndpoint;
    }
    if (typeof getCableRoutePosition !== 'function') return null;
    var routePos = getCableRoutePosition(cable, startHost);
    if (!routePos) return null;
    function isFeederType(obj) {
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        return isSleeveLikeHostType(t) || t === 'support' || t === 'attachment' || t === 'manhole';
    }
    if (routePos.forward && routePos.backward) {
        if (isFeederType(routePos.forward)) return routePos.forward;
        if (isFeederType(routePos.backward)) return routePos.backward;
        return routePos.forward;
    }
    if (routePos.forward) return routePos.forward;
    return null;
}

function pathReachesOnu(path, onuUid) {
    if (!path || !onuUid) return false;
    for (var i = 0; i < path.length; i++) {
        var item = path[i];
        if (item.type === 'object' && item.objectType === 'onu' && item.object &&
            traceUidEq(getObjectUniqueId(item.object), onuUid)) return true;
        if (item.type === 'onuConnection' && item.onu && traceUidEq(getObjectUniqueId(item.onu), onuUid)) return true;
        if (item.type === 'splitterOutputToOnu' && item.onuObj && traceUidEq(getObjectUniqueId(item.onuObj), onuUid)) return true;
    }
    return false;
}

function filterPathsToTargetOnu(paths, onuUid) {
    if (!onuUid || !paths || !paths.length) return paths || [];
    var matched = paths.filter(function(p) { return pathReachesOnu(p, onuUid); });
    return matched.length ? matched : paths;
}

function preferOnuTracePaths(paths, onuUid) {
    if (!onuUid || !paths || paths.length <= 1) return paths;
    return paths.slice().sort(function(a, b) {
        var aHit = pathReachesOnu(a, onuUid) ? 1 : 0;
        var bHit = pathReachesOnu(b, onuUid) ? 1 : 0;
        if (bHit !== aHit) return bHit - aHit;
        return (b ? b.length : 0) - (a ? a.length : 0);
    });
}

function buildOltTracePrefixSteps(oltObj, portNumber, startObj, cableId, fiberNumber) {
    if (!oltObj || !startObj || !cableId || fiberNumber == null) return [];
    var oltUid = getObjectUniqueId(oltObj);
    var startUid = getObjectUniqueId(startObj);
    if (oltUid && startUid && oltUid === startUid) return [];

    var oltName = oltObj.properties.get('name') || 'OLT';
    var portLabel = typeof getOltPortLabel === 'function' ? getOltPortLabel(oltObj, portNumber) : '';
    var incoming = false;
    var inc = oltObj.properties.get('incomingFiber');
    if (inc && inc.cableId === cableId && inc.fiberNumber === fiberNumber) incoming = true;

    var steps = [{
        type: 'start',
        objectType: 'olt',
        objectName: oltName,
        object: oltObj,
        port: null
    }, {
        type: 'oltPortConnection',
        cableId: cableId,
        fiberNumber: fiberNumber,
        oltName: oltName,
        portNumber: portNumber,
        portLabel: portLabel,
        incoming: incoming,
        olt: oltObj
    }];

    var cable = objects.find(function(c) {
        return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId;
    });
    if (!cable) {
        if (isFiberHostType(startObj.properties.get('type'))) {
            var hostTypeOnly = startObj.properties.get('type');
            steps.push({
                type: 'object',
                objectType: hostTypeOnly,
                objectName: startObj.properties.get('name') || getObjectTypeName(hostTypeOnly),
                object: startObj,
                port: (hostTypeOnly === 'cross') ? ((startObj.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null) : null
            });
        }
        return steps;
    }

    var matchPt = typeof traceRouteObjectsMatch === 'function' ? traceRouteObjectsMatch : function(a, b) {
        return a === b || (a && b && getObjectUniqueId(a) === getObjectUniqueId(b));
    };
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    var oltOnCable = matchPt(fromObj, oltObj) || matchPt(toObj, oltObj);
    var hostOnCable = matchPt(fromObj, startObj) || matchPt(toObj, startObj);

    if (oltOnCable && hostOnCable) {
        steps.push({
            type: 'cable',
            cableId: cableId,
            cableName: cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType')),
            fiberNumber: fiberNumber,
            cable: cable
        });
    }

    if (isFiberHostType(startObj.properties.get('type'))) {
        var hostType = startObj.properties.get('type');
        steps.push({
            type: 'object',
            objectType: hostType,
            objectName: startObj.properties.get('name') || getObjectTypeName(hostType),
            object: startObj,
            port: (hostType === 'cross') ? ((startObj.properties.get('fiberPorts') || {})[cableId + '-' + fiberNumber] || null) : null
        });
    }
    return steps;
}

function prependOltPrefixToPath(path, oltObj, portNumber, startObj, cableId, fiberNumber) {
    if (!path || !path.length || !oltObj) return path;
    var prefix = buildOltTracePrefixSteps(oltObj, portNumber, startObj, cableId, fiberNumber);
    if (!prefix.length) return path;

    var rest = path.slice();
    if (rest[0] && rest[0].type === 'start') rest = rest.slice(1);

    var lastPrefix = prefix[prefix.length - 1];
    if (lastPrefix && lastPrefix.type === 'object' && rest[0] && rest[0].type === 'object' &&
        getObjectUniqueId(lastPrefix.object) === getObjectUniqueId(rest[0].object)) {
        rest = rest.slice(1);
    }
    if (prefix.length >= 2 && prefix[prefix.length - 2].type === 'cable' &&
        rest[0] && rest[0].type === 'cable' && prefix[prefix.length - 2].cableId === rest[0].cableId) {
        rest = rest.slice(1);
    }
    return prefix.concat(rest);
}

function showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startObj, cableId, fiberNumber, traceOptions, targetOnu) {
    traceOptions = traceOptions || {};
    if (targetOnu && targetOnu.properties) {
        traceOptions.targetOnuId = getObjectUniqueId(targetOnu);
        traceOptions.traceTowardOnu = true;
    }
    var biasPrev = findOltTraceBiasPrevious(startObj, cableId, fiberNumber, oltObj);
    if (biasPrev) {
        traceOptions = Object.assign({}, traceOptions, { initialPreviousObject: biasPrev });
    }
    const res = traceAllFiberPathsFromObject(startObj, cableId, fiberNumber, traceOptions);
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }
    var displayPaths = res.paths.length
        ? res.paths.map(function(p) {
            return prependOltPrefixToPath(p, oltObj, portNumber, startObj, cableId, fiberNumber);
        })
        : [];
    if (traceOptions.targetOnuId) {
        displayPaths = filterPathsToTargetOnu(displayPaths, traceOptions.targetOnuId);
        displayPaths = preferOnuTracePaths(displayPaths, traceOptions.targetOnuId);
        if (!displayPaths.some(function(p) { return pathReachesOnu(p, traceOptions.targetOnuId); })) {
            var fallbackPath = tryCompleteOltTraceToOnu(
                oltObj, portNumber, startObj, cableId, fiberNumber, traceOptions.targetOnuId, displayPaths, traceOptions
            );
            if (fallbackPath) {
                displayPaths = [fallbackPath];
            } else if (displayPaths.length) {
                showWarning('Путь до ONU не найден — показан ближайший участок сети', 'Трассировка');
            }
        }
    }
    if (!displayPaths.length) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }
    var portLabel = getOltPortLabel(oltObj, portNumber);
    var bodyHtml = '<p class="trace-intro">OLT «' + escapeHtml(oltName) + '», ' + escapeHtml(formatOltPortDisplay(portNumber, portLabel)) + '</p>';
    if (displayPaths.length > 1 && window.FiberTrace && FiberTrace.renderPathsOverviewHtml) {
        bodyHtml += FiberTrace.renderPathsOverviewHtml(displayPaths);
    }
    var stepNum = 1;
    for (var pi = 0; pi < displayPaths.length; pi++) {
        if (displayPaths.length > 1 && pi > 0) {
            bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">' + escapeHtml(FiberTrace.getPathEndpointLabel(displayPaths[pi])) + '</div>';
        }
        var pathHtml = renderOnePathToTraceHtml(displayPaths[pi], stepNum);
        bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
        stepNum = pathHtml.nextStepNumber;
    }
    bodyHtml = (typeof appendFiberTraceExtrasHtml === 'function')
        ? appendFiberTraceExtrasHtml(bodyHtml, displayPaths)
        : bodyHtml + ((window.FiberTrace && FiberTrace.buildTraceActionsHtml) ? FiberTrace.buildTraceActionsHtml() : '');
    openFiberTraceModal({
        title: 'Трассировка от OLT',
        subtitle: formatOltPortDisplay(portNumber, portLabel, true) + ' · ' + oltName,
        bodyHtml: bodyHtml,
        paths: displayPaths
    });
}

function pathReachesPeerNode(path, startNodeUid) {
    if (!path || !startNodeUid) return false;
    for (var i = 0; i < path.length; i++) {
        var item = path[i];
        if (item.type === 'nodeConnection' && item.node) {
            if (item.fromNode) continue;
            var uid = getObjectUniqueId(item.node);
            if (uid && uid !== startNodeUid) return true;
        }
        if (item.type === 'splitterOutputToNode' && item.nodeObj) {
            var uidSp = getObjectUniqueId(item.nodeObj);
            if (uidSp && uidSp !== startNodeUid) return true;
        }
        if (item.type === 'object' && item.objectType === 'node' && item.object) {
            var uid2 = getObjectUniqueId(item.object);
            if (uid2 && uid2 !== startNodeUid) return true;
        }
    }
    return false;
}

function filterPathsToPeerNodes(paths, startNodeObj) {
    if (!startNodeObj || !paths || paths.length <= 1) return paths;
    var startUid = getObjectUniqueId(startNodeObj);
    var peerPaths = paths.filter(function(p) { return pathReachesPeerNode(p, startUid); });
    return peerPaths.length ? peerPaths : paths;
}

function nodeTracePathScore(path, startNodeUid) {
    if (!path || !path.length) return 0;
    for (var i = path.length - 1; i >= 0; i--) {
        var item = path[i];
        if (item.type === 'nodeConnection' && item.node) {
            if (item.fromNode) continue;
            var uid = getObjectUniqueId(item.node);
            if (uid && uid !== startNodeUid) return 1000 + path.length;
            return path.length;
        }
        if (item.type === 'splitterOutputToNode' && item.nodeObj) {
            var uidSp = getObjectUniqueId(item.nodeObj);
            if (uidSp && uidSp !== startNodeUid) return 1000 + path.length;
            return path.length;
        }
        if (item.type === 'object' && item.objectType === 'node' && item.object) {
            var uid2 = getObjectUniqueId(item.object);
            if (uid2 && uid2 !== startNodeUid) return 1000 + path.length;
            return path.length;
        }
    }
    return path.length;
}

function preferNodeTracePaths(paths, startNodeObj) {
    if (!startNodeObj || !paths || paths.length <= 1) return paths;
    var startUid = getObjectUniqueId(startNodeObj);
    return paths.slice().sort(function(a, b) {
        return nodeTracePathScore(b, startUid) - nodeTracePathScore(a, startUid);
    });
}

function showFiberTraceFromCross(startCrossObj, cableId, fiberNumber, startNodeObj = null, nodeConnMeta = null, traceOptions = null) {
    var res = traceAllFiberPathsFromObject(startCrossObj, cableId, fiberNumber, traceOptions);
    
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }

    var paths = res.paths ? res.paths.slice() : [];
    if (traceOptions && traceOptions.originNodeId && startCrossObj) {
        var peerPaths = tracePeerNodePathsOnSharedCable(startCrossObj, cableId, fiberNumber, traceOptions.originNodeId);
        if (peerPaths.length) {
            // Два узла на одной жиле — один прямой маршрут по кабелю, без лишних веток обхода
            paths = peerPaths;
        }
    }
    
    if (!paths.length) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }

    var nodePaths = startNodeObj ? filterPathsToPeerNodes(paths, startNodeObj) : paths;
    var sortedPaths = startNodeObj ? preferNodeTracePaths(nodePaths, startNodeObj) : nodePaths;
    var displayPaths = sortedPaths;
    var highlightPaths = sortedPaths;
    if (startNodeObj && window.FiberTrace && FiberTrace.prependNodePrefixToPath) {
        displayPaths = sortedPaths.map(function(p) {
            return FiberTrace.prependNodePrefixToPath(p, startNodeObj, startCrossObj, cableId, fiberNumber, nodeConnMeta);
        });
        highlightPaths = displayPaths;
    }

    var traceSubtitle = 'Жила ' + fiberNumber;
    if (startNodeObj) {
        traceSubtitle = 'От узла «' + (startNodeObj.properties.get('name') || 'Узел') + '» · жила ' + fiberNumber;
    }

    var bodyHtml = '';
    if (displayPaths.length > 1 && window.FiberTrace && FiberTrace.renderPathsOverviewHtml) {
        bodyHtml += FiberTrace.renderPathsOverviewHtml(displayPaths);
    }
    if (displayPaths.length > 1) {
        var stepNum = 1;
        for (var pi = 0; pi < displayPaths.length; pi++) {
            if (pi > 0) bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">' + escapeHtml(FiberTrace.getPathEndpointLabel(displayPaths[pi])) + '</div>';
            var pathHtml = renderOnePathToTraceHtml(displayPaths[pi], stepNum);
            bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
            stepNum = pathHtml.nextStepNumber;
        }
    } else {
        var pathHtmlSingle = renderOnePathToTraceHtml(displayPaths[0], 1);
        bodyHtml += pathHtmlSingle.html;
    }
    bodyHtml = (typeof appendFiberTraceExtrasHtml === 'function')
        ? appendFiberTraceExtrasHtml(bodyHtml, highlightPaths)
        : bodyHtml + ((window.FiberTrace && FiberTrace.buildTraceActionsHtml) ? FiberTrace.buildTraceActionsHtml() : '');
    openFiberTraceModal({
        title: 'Трассировка',
        subtitle: traceSubtitle,
        bodyHtml: bodyHtml,
        paths: highlightPaths
    });
}
