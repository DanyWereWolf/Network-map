/**
 * Доп. трассировка: узлы, OLT, show-on-map.
 */
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
        if (ht !== 'cross' && ht !== 'sleeve') return;
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
            bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">Ветвь ' + (pi + 1) + '</div>';
        }
        var pathHtml = renderOnePathToTraceHtml(paths[pi], stepNum);
        bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
        stepNum = pathHtml.nextStepNumber;
    }
    if (window.FiberTrace && FiberTrace.buildTraceActionsHtml) {
        bodyHtml += FiberTrace.buildTraceActionsHtml();
    }
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
        (obj.properties.get('type') === 'cross' || obj.properties.get('type') === 'sleeve') &&
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
        showWarning('На этот порт не назначена жила. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
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
    const otherEnd = getOtherEndOfCable(cable, oltObj);
    if (!otherEnd) {
        showError('Не найден противоположный конец кабеля. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    const oltName = oltObj.properties.get('name') || 'OLT';
    showFiberTraceFromOLTPort(oltObj, oltName, portNumber, oltObj, ass.cableId, ass.fiberNumber);
}

function getObjectMapCoordinates(obj) {
    if (!obj || !obj.geometry) return null;
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
    var displayPath = (window.FiberTrace && FiberTrace.compressPathForDisplay) ? FiberTrace.compressPathForDisplay(path) : path;
    if (window.FiberTrace && FiberTrace.renderPathStatusHtml) {
        html += FiberTrace.renderPathStatusHtml(path);
    }
    displayPath.forEach(function(item) {
        var objUniqueId = item.object ? getObjectUniqueId(item.object) : null;
        var showOnMapBtn = objUniqueId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(objUniqueId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
        var traceIcon = (window.FiberTrace && FiberTrace.getObjectIcon) ? FiberTrace.getObjectIcon(item.objectType) : '📍';
        
        if (item.type === 'start') {
            var portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-start">' + stepNumber + '</span><div class="trace-path-block trace-path-start"><div><span>' + traceIcon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'object') {
            portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            var wpMuted = (window.FiberTrace && FiberTrace.isWaypointType(item.objectType)) ? ' trace-path-block--waypoint' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">' + stepNumber + '</span><div class="trace-path-block trace-path-object' + wpMuted + '"><div><span>' + traceIcon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
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
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-cable">➡</span><div class="trace-path-block trace-path-cable" style="border-left-color: ' + fiberColor + ';"><div style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;"><span>📡 ' + escapeHtml(item.cableName) + '</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 16px; height: 16px; border-radius: 50%; background: ' + fiberColor + '; border: 1px solid #333; display: inline-block;"></span><span style="background: ' + fiberColor + '; color: ' + fiberTextColor + '; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Жила ' + item.fiberNumber + (fiberName ? ': ' + fiberName : '') + '</span></span>' + waypointsHtml + '</div>' + cableShowBtn + '</div></div>';
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
        } else if (item.type === 'oltPortConnection') {
            var oltObjId = item.olt ? getObjectUniqueId(item.olt) : null;
            var oltShowBtn = oltObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(oltObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var oltPortText = item.incoming ? 'приход' : formatOltPortDisplay(item.portNumber, item.portLabel || (item.olt ? getOltPortLabel(item.olt, item.portNumber) : ''));
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-olt">🔌</span><div class="trace-path-block trace-path-olt"><div><span>📶 Подключено к OLT «' + escapeHtml(item.oltName || 'OLT') + '», ' + escapeHtml(String(oltPortText)) + '</span><span class="trace-path-muted">(жила ' + item.fiberNumber + ')</span></div>' + oltShowBtn + '</div></div>';
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

function showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startObj, cableId, fiberNumber) {
    const res = traceAllFiberPathsFromObject(startObj, cableId, fiberNumber);
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }
    if (!res.paths.length) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }
    var portLabel = getOltPortLabel(oltObj, portNumber);
    var bodyHtml = '<p class="trace-intro">OLT «' + escapeHtml(oltName) + '», ' + escapeHtml(formatOltPortDisplay(portNumber, portLabel)) + '</p>';
    if (res.paths.length > 1 && window.FiberTrace && FiberTrace.renderPathsOverviewHtml) {
        bodyHtml += FiberTrace.renderPathsOverviewHtml(res.paths);
    }
    var stepNum = 1;
    for (var pi = 0; pi < res.paths.length; pi++) {
        if (res.paths.length > 1 && pi > 0) {
            bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">Ветвь ' + (pi + 1) + '</div>';
        }
        var pathHtml = renderOnePathToTraceHtml(res.paths[pi], stepNum);
        bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
        stepNum = pathHtml.nextStepNumber;
    }
    if (window.FiberTrace && FiberTrace.buildTraceActionsHtml) {
        bodyHtml += FiberTrace.buildTraceActionsHtml();
    }
    openFiberTraceModal({
        title: 'Трассировка от OLT',
        subtitle: formatOltPortDisplay(portNumber, portLabel, true) + ' · ' + oltName,
        bodyHtml: bodyHtml,
        paths: res.paths
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
            if (pi > 0) bodyHtml += '<div class="trace-branch-separator" data-branch-index="' + pi + '">Ветвь ' + (pi + 1) + '</div>';
            var pathHtml = renderOnePathToTraceHtml(displayPaths[pi], stepNum);
            bodyHtml += '<div class="trace-branch-block" data-branch-index="' + pi + '">' + pathHtml.html + '</div>';
            stepNum = pathHtml.nextStepNumber;
        }
    } else {
        var pathHtmlSingle = renderOnePathToTraceHtml(displayPaths[0], 1);
        bodyHtml += pathHtmlSingle.html;
    }
    if (window.FiberTrace && FiberTrace.buildTraceActionsHtml) {
        bodyHtml += FiberTrace.buildTraceActionsHtml();
    }
    openFiberTraceModal({
        title: 'Трассировка',
        subtitle: traceSubtitle,
        bodyHtml: bodyHtml,
        paths: highlightPaths
    });
}
