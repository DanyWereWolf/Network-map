/**
 * Маршруты кабелей, подземные участки, разрез ВОЛС.
 */
function getCablesThroughObject(obj) {
    if (!objects || !obj) return [];
    var uid = getObjectUniqueId(obj);
    return objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        if (cable.properties.get('from') === obj || cable.properties.get('to') === obj) return true;
        var points = cable.properties.get('points');
        if (!Array.isArray(points)) return false;
        for (var i = 0; i < points.length; i++) {
            if (points[i] === obj) return true;
            if (uid && points[i] && getObjectUniqueId(points[i]) === uid) return true;
        }
        return false;
    });
}

function getFiberCablesThroughWaypoint(obj) {
    return getCablesThroughSupport(obj).filter(function(cable) {
        var ct = cable.properties.get('cableType');
        return !isCopperCableType(ct);
    });
}

function getCableRoutePoints(cable) {
    var points = cable.properties.get('points');
    if (Array.isArray(points) && points.length >= 2) return points.slice();
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    if (fromObj && toObj) return [fromObj, toObj];
    return null;
}

function getPointIndexOnCableRoute(points, obj) {
    if (!Array.isArray(points) || !obj) return -1;
    if (typeof traceRouteObjectsMatch === 'function') {
        for (var i = 0; i < points.length; i++) {
            if (traceRouteObjectsMatch(points[i], obj)) return i;
        }
        return -1;
    }
    var uid = getObjectUniqueId(obj);
    for (var j = 0; j < points.length; j++) {
        if (points[j] === obj) return j;
        if (uid && points[j] && getObjectUniqueId(points[j]) === uid) return j;
    }
    return -1;
}

function polylineLength(coords) {
    var sum = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        sum += calculateDistance(coords[i], coords[i + 1]);
    }
    return sum;
}

function projectPointOntoPolyline(point, coords) {
    if (!coords || coords.length < 2) return null;
    var best = null;
    var traversed = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        var segLen = calculateDistance(coords[i], coords[i + 1]);
        var r = pointToLineDistance(point, coords[i], coords[i + 1]);
        var param = Math.max(0, Math.min(1, r.param));
        var px = coords[i][0] + param * (coords[i + 1][0] - coords[i][0]);
        var py = coords[i][1] + param * (coords[i + 1][1] - coords[i][1]);
        var distAlong = traversed + segLen * param;
        if (!best || r.distance < best.distance) {
            best = {
                distance: r.distance,
                point: [px, py],
                lengthAlong: distAlong,
                segmentIndex: i,
                segmentParam: param
            };
        }
        traversed += segLen;
    }
    if (!best) return null;
    var total = polylineLength(coords);
    best.totalLength = total;
    best.fraction = total > 0 ? best.lengthAlong / total : 0;
    return best;
}

function splitPolylineCoords(coords, splitPoint, proj) {
    if (!coords || coords.length < 2 || !splitPoint) return { coordsA: null, coordsB: null };
    var i = proj.segmentIndex;
    var param = proj.segmentParam;
    var coordsA = coords.slice(0, i + 1);
    coordsA.push(splitPoint);
    var coordsB = [splitPoint];
    if (param < 0.999) {
        coordsB = coordsB.concat(coords.slice(i + 1));
    } else if (i + 1 < coords.length) {
        coordsB = coordsB.concat(coords.slice(i + 2));
        if (coordsB.length < 2) coordsB = [splitPoint, coords[coords.length - 1]];
    }
    if (coordsA.length < 2 || coordsB.length < 2) return { coordsA: null, coordsB: null };
    return { coordsA: coordsA, coordsB: coordsB };
}

function resolveSplitAfterIndex(points, fraction) {
    if (!points || points.length < 2) return -1;
    var geom = points.map(function(p) {
        return p && p.geometry ? p.geometry.getCoordinates() : null;
    }).filter(function(c) { return c && c.length >= 2; });
    if (geom.length < 2) return -1;
    var total = polylineLength(geom);
    if (total <= 0) return -1;
    var target = fraction * total;
    var traversed = 0;
    var pointTs = [0];
    for (var i = 0; i < geom.length - 1; i++) {
        traversed += calculateDistance(geom[i], geom[i + 1]);
        pointTs.push(traversed / total);
    }
    var splitAfter = -1;
    for (var pi = 0; pi < points.length - 1; pi++) {
        if (pointTs[pi] <= fraction + 0.0001) splitAfter = pi;
    }
    if (splitAfter < 0) splitAfter = 0;
    if (splitAfter >= points.length - 1) splitAfter = points.length - 2;
    return splitAfter;
}

function remapCableIdForSegment(oldId, idA, idB, segment) {
    if (segment === 'A') return idA;
    if (segment === 'B') return idB;
    return oldId;
}

function getCableSegmentForRouteIndex(points, index, splitAfterIndex) {
    if (!points || index < 0) return null;
    if (index <= splitAfterIndex) return 'A';
    return 'B';
}

function getCableSegmentForPlace(placeObj, cable, splitAfterIndex) {
    var points = getCableRoutePoints(cable);
    if (!points) return null;
    var idx = getPointIndexOnCableRoute(points, placeObj);
    if (idx < 0) return null;
    return getCableSegmentForRouteIndex(points, idx, splitAfterIndex);
}

function migrateCableIdReferences(cable, oldId, idA, idB, splitAfterIndex) {
    var points = getCableRoutePoints(cable);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');

    function segForPlace(placeObj) {
        return getCableSegmentForPlace(placeObj, cable, splitAfterIndex);
    }

    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        var usedFibers = slot.properties.get('usedFibers');
        if (usedFibers && usedFibers[oldId]) {
            var seg = segForPlace(slot);
            if (seg) {
                var newId = remapCableIdForSegment(oldId, idA, idB, seg);
                usedFibers[newId] = usedFibers[oldId].slice();
                delete usedFibers[oldId];
                slot.properties.set('usedFibers', usedFibers);
            }
        }

        if (isFiberHostType(t)) {
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'splitterConnections', 'nodeConnections'].forEach(function(prop) {
                var conn = slot.properties.get(prop);
                if (!conn) return;
                var changed = false;
                Object.keys(conn).forEach(function(key) {
                    if (key.indexOf(oldId + '-') !== 0) return;
                    var seg = segForPlace(slot);
                    if (!seg) return;
                    var newKey = remapCableIdForSegment(oldId, idA, idB, seg) + key.slice(oldId.length);
                    conn[newKey] = conn[key];
                    delete conn[key];
                    changed = true;
                });
                if (changed) slot.properties.set(prop, conn);
            });

            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                var fcChanged = false;
                fiberConn.forEach(function(conn) {
                    if (!conn) return;
                    var segSlot = segForPlace(slot);
                    if (conn.from && conn.from.cableId === oldId && segSlot) {
                        conn.from.cableId = remapCableIdForSegment(oldId, idA, idB, segSlot);
                        fcChanged = true;
                    }
                    if (conn.to && conn.to.cableId === oldId && segSlot) {
                        conn.to.cableId = remapCableIdForSegment(oldId, idA, idB, segSlot);
                        fcChanged = true;
                    }
                });
                if (fcChanged) slot.properties.set('fiberConnections', fiberConn);
            }
        }

        if (t === 'olt') {
            var portAssignments = slot.properties.get('portAssignments') || {};
            var incomingFiber = slot.properties.get('incomingFiber');
            var paChanged = false;
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === oldId) {
                    var seg = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                    if (fromObj && slot === fromObj) seg = 'A';
                    if (toObj && slot === toObj) seg = 'B';
                    a.cableId = remapCableIdForSegment(oldId, idA, idB, seg);
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignments);
            if (incomingFiber && incomingFiber.cableId === oldId) {
                var segIn = segForPlace(fromObj) || 'A';
                if (toObj && getObjectUniqueId(slot) === getObjectUniqueId(toObj)) segIn = 'B';
                incomingFiber.cableId = remapCableIdForSegment(oldId, idA, idB, segIn);
                slot.properties.set('incomingFiber', incomingFiber);
            }
        }

        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === oldId) {
                var segSp = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                inputFiber.cableId = remapCableIdForSegment(oldId, idA, idB, segSp);
                slot.properties.set('inputFiber', inputFiber);
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                var outChanged = false;
                outputConnections.forEach(function(conn) {
                    if (conn && conn.cableId === oldId) {
                        conn.cableId = remapCableIdForSegment(oldId, idA, idB, segForPlace(fromObj) || 'A');
                        outChanged = true;
                    }
                });
                if (outChanged) slot.properties.set('outputConnections', outputConnections);
            }
        }

        if (t === 'onu' || t === 'mediaConverter') {
            var inc = slot.properties.get('incomingFiber');
            if (inc && inc.cableId === oldId) {
                var segOnu = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                inc.cableId = remapCableIdForSegment(oldId, idA, idB, segOnu);
                slot.properties.set('incomingFiber', inc);
            }
        }
    });

    scheduleConnectionLinesUpdate();
}

function buildRoutePointsForSplit(points, splitAfterIndex, newSleeve, coordsA, coordsB) {
    var pointsA = points.slice(0, splitAfterIndex + 1).concat([newSleeve]);
    var pointsB = [newSleeve].concat(points.slice(splitAfterIndex + 1));
    if (coordsA && coordsA.length >= 2) {
        try {
            var linA = coordsA;
            if (linA.length >= 2 && pointsA.length >= 2) {
                pointsA[0] = points[0];
                pointsA[pointsA.length - 1] = newSleeve;
            }
        } catch (eA) {}
    }
    if (coordsB && coordsB.length >= 2) {
        try {
            pointsB[0] = newSleeve;
            pointsB[pointsB.length - 1] = points[points.length - 1];
        } catch (eB) {}
    }
    return { pointsA: pointsA, pointsB: pointsB };
}

function applyCableGeometryFromCoords(cable, coords) {
    if (!cable || !cable.geometry || !coords || coords.length < 2) return;
    cable.geometry.setCoordinates(coords);
    var dist = polylineLength(coords);
    cable.properties.set('distance', dist);
}

function syncCableGeometryFromRoutePoints(cable) {
    if (!cable || !cable.properties) return;
    var points = cable.properties.get('points');
    if (!Array.isArray(points) || points.length < 2) return;
    if (window.CableUnderground) {
        CableUnderground.applyCableRouteGeometry(cable, points);
        CableUnderground.refreshCableUndergroundOverlays(cable);
        return;
    }
    var coords = [];
    for (var i = 0; i < points.length; i++) {
        if (points[i] && points[i].geometry) {
            var c = points[i].geometry.getCoordinates();
            if (c && c.length >= 2) coords.push(c);
        }
    }
    if (coords.length >= 2) applyCableGeometryFromCoords(cable, coords);
}

function isCableIntermediateWaypoint(type) {
    return type === 'support' || type === 'attachment' || type === 'manhole';
}

function routingWaypointAlreadyExists(waypoints, obj) {
    if (!obj || !Array.isArray(waypoints) || !waypoints.length) return false;
    var uid = getObjectUniqueId(obj);
    for (var i = 0; i < waypoints.length; i++) {
        var wp = waypoints[i];
        if (!wp) continue;
        if (wp === obj) return true;
        if (uid && getObjectUniqueId(wp) === uid) return true;
    }
    return false;
}

function addRoutingWaypoint(waypoints, obj) {
    if (!obj || !Array.isArray(waypoints) || routingWaypointAlreadyExists(waypoints, obj)) return false;
    waypoints.push(obj);
    return true;
}

function cableWaypointAlreadyExists(obj) {
    return routingWaypointAlreadyExists(cableWaypoints, obj);
}

function addCableWaypoint(obj) {
    return addRoutingWaypoint(cableWaypoints, obj);
}

function addSplitterFiberWaypoint(obj) {
    return addRoutingWaypoint(splitterFiberWaypoints, obj);
}

function addFiberRoutingWaypoint(obj) {
    return addRoutingWaypoint(fiberRoutingWaypoints, obj);
}

function dedupeRouteIds(routeIds) {
    if (!routeIds || !routeIds.length) return routeIds || [];
    var seen = new Set();
    var out = [];
    for (var i = 0; i < routeIds.length; i++) {
        var id = routeIds[i];
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

function resolveGponRouteIds(routeIds) {
    return dedupeRouteIds(routeIds);
}

function gponRouteWaypointCoords(routeIds) {
    var coords = [];
    resolveGponRouteIds(routeIds).forEach(function(wpId) {
        var wpObj = getMapObjectByUid(wpId);
        if (wpObj && wpObj.geometry) {
            coords.push(wpObj.geometry.getCoordinates());
        }
    });
    return coords;
}

function dedupeSupportAttachmentInCablePoints(points) {
    if (!points || points.length < 3) return points;
    var seen = new Set();
    var startUid = getObjectUniqueId(points[0]);
    if (startUid) seen.add(startUid);
    var out = [points[0]];
    for (var i = 1; i < points.length - 1; i++) {
        var obj = points[i];
        var t = obj && obj.properties ? obj.properties.get('type') : null;
        var uid = getObjectUniqueId(obj);
        if ((t === 'support' || t === 'attachment') && uid && seen.has(uid)) continue;
        out.push(obj);
        if (uid) seen.add(uid);
    }
    out.push(points[points.length - 1]);
    return out;
}

function resetCableUndergroundLayingState(popManholeFromRoute) {
    if (popManholeFromRoute && cableUndergroundManhole && Array.isArray(cableWaypoints) && cableWaypoints.length) {
        var lastWp = cableWaypoints[cableWaypoints.length - 1];
        if (lastWp === cableUndergroundManhole) cableWaypoints.pop();
    }
    cableUndergroundActive = false;
    cableUndergroundManhole = null;
    cableUndergroundCoords = [];
}

function resetCableUndergroundPendingSpans() {
    cableUndergroundPendingSpans = [];
}

function startUndergroundRoutingFromManhole(manholeObj) {
    if (!manholeObj || !manholeObj.geometry) return;
    cableUndergroundActive = true;
    cableUndergroundManhole = manholeObj;
    cableUndergroundCoords = [];
    showUndergroundDrawBar('lay');
}

function commitUndergroundSpanToManhole(exitManholeObj) {
    if (!cableUndergroundActive || !cableUndergroundManhole || !exitManholeObj) return false;
    var entryId = getObjectUniqueId(cableUndergroundManhole);
    var exitId = getObjectUniqueId(exitManholeObj);
    if (!entryId || !exitId) return false;
    if (entryId === exitId) {
        if (typeof showError === 'function') showError('Выберите другой колодец для выхода из подземного участка.', 'Колодец');
        return false;
    }
    if (!Array.isArray(cableUndergroundPendingSpans)) cableUndergroundPendingSpans = [];
    cableUndergroundPendingSpans.push({
        entryManholeId: entryId,
        exitManholeId: exitId,
        pathCoords: window.CableUnderground
            ? CableUnderground.normalizePathCoords(cableUndergroundCoords)
            : (cableUndergroundCoords || []).slice()
    });
    var lastWp = cableWaypoints.length ? cableWaypoints[cableWaypoints.length - 1] : null;
    if (lastWp !== exitManholeObj) cableWaypoints.push(exitManholeObj);
    resetCableUndergroundLayingState(false);
    hideUndergroundEditBar();
    return true;
}

function findObjectByUniqueId(uid) {
    if (!uid || !objects) return null;
    for (var i = 0; i < objects.length; i++) {
        var o = objects[i];
        if (o && o.properties && o.properties.get('uniqueId') === uid) return o;
    }
    return null;
}

function getManholeDisplayLabel(uid) {
    var o = findObjectByUniqueId(uid);
    if (!o) return 'колодец';
    var name = o.properties.get('name');
    return name ? name : getObjectTypeName('manhole');
}

function removeUndergroundEditPreview() {
    if (cableUndergroundEditPreviewLine && myMap) {
        try { myMap.geoObjects.remove(cableUndergroundEditPreviewLine); } catch (e) {}
        cableUndergroundEditPreviewLine = null;
    }
}

function getUndergroundEditSpanEndpoints(cable, spanIndex) {
    if (!cable || !cable.properties) return null;
    var spans = cable.properties.get('undergroundSpans') || [];
    var sp = spans[spanIndex];
    if (!sp || !window.CableUnderground) return null;
    var n = CableUnderground.normalizeSpanRecord(sp);
    if (!n || !n.entryManholeId || !n.exitManholeId) return null;
    return {
        norm: n,
        entry: findObjectByUniqueId(n.entryManholeId),
        exit: findObjectByUniqueId(n.exitManholeId)
    };
}

function updateUndergroundEditPreview(cursorCoords) {
    if (!cableUndergroundEditMode || !cableUndergroundEditCable) return;
    var ep = getUndergroundEditSpanEndpoints(cableUndergroundEditCable, cableUndergroundEditSpanIndex);
    if (!ep || !ep.entry || !ep.exit || !ep.entry.geometry || !ep.exit.geometry) return;
    var c0 = ep.entry.geometry.getCoordinates();
    var c1 = ep.exit.geometry.getCoordinates();
    if (!c0 || !c1) return;
    var coords = [c0];
    for (var i = 0; i < cableUndergroundCoords.length; i++) coords.push(cableUndergroundCoords[i]);
    if (cursorCoords && cursorCoords.length >= 2) coords.push(cursorCoords);
    coords.push(c1);
    var color = window.CableUnderground ? CableUnderground.UNDERGROUND_COLOR : '#dc2626';
    if (cableUndergroundEditPreviewLine) {
        cableUndergroundEditPreviewLine.geometry.setCoordinates(coords);
    } else if (myMap) {
        cableUndergroundEditPreviewLine = new ymaps.Polyline(coords, {}, {
            strokeColor: color,
            strokeWidth: 3,
            strokeStyle: '10 6',
            strokeOpacity: 0.92,
            zIndex: 1001,
            interactive: false
        });
        myMap.geoObjects.add(cableUndergroundEditPreviewLine);
    }
}

function cancelUndergroundSpanEdit() {
    var cable = cableUndergroundEditCable;
    var idx = cableUndergroundEditSpanIndex;
    if (cable && idx >= 0 && cableUndergroundRelayoutBackup) {
        applyUndergroundSpanDraft(cable, idx, cableUndergroundRelayoutBackup, false);
    }
    cableUndergroundRelayoutBackup = null;
    cableUndergroundEditMode = false;
    cableUndergroundEditCable = null;
    cableUndergroundEditSpanIndex = -1;
    cableUndergroundCoords = [];
    removeUndergroundEditPreview();
    hideUndergroundEditBar();
}

function findUndergroundRelayoutForManhole(manholeObj) {
    if (!manholeObj || !objects) return null;
    var uid = getObjectUniqueId(manholeObj);
    if (!uid) return null;
    var cables = getCablesThroughObject(manholeObj);
    for (var ci = 0; ci < cables.length; ci++) {
        var cable = cables[ci];
        if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
        if (isCopperCableType(cable.properties.get('cableType'))) continue;
        var spans = cable.properties.get('undergroundSpans') || [];
        for (var si = 0; si < spans.length; si++) {
            var n = window.CableUnderground ? CableUnderground.normalizeSpanRecord(spans[si]) : spans[si];
            if (!n) continue;
            if (n.entryManholeId === uid || n.exitManholeId === uid) {
                return { cable: cable, spanIndex: si };
            }
        }
    }
    return null;
}

function updateUndergroundEditBarText() {
    var titleEl = document.getElementById('undergroundEditBarTitle');
    var modeEl = document.getElementById('undergroundEditBarMode');
    var hintEl = document.getElementById('undergroundEditBarText');
    var pointsEl = document.getElementById('undergroundEditBarPoints');
    var n = cableUndergroundCoords.length;
    if (pointsEl) pointsEl.textContent = String(n);

    if (cableUndergroundActive && cableUndergroundManhole) {
        var entryLabelLay = getManholeDisplayLabel(getObjectUniqueId(cableUndergroundManhole));
        if (titleEl) titleEl.textContent = '«' + entryLabelLay + '» → …';
        if (modeEl) modeEl.textContent = 'Прокладка кабеля';
        if (hintEl) {
            hintEl.textContent = n
                ? 'Добавляйте точки кликами по карте. Завершите выбором второго колодца (выход).'
                : 'Кликайте по карте — трасса под землёй. Завершение: второй колодец.';
        }
        return;
    }
    if (!cableUndergroundEditCable) return;
    var ep = getUndergroundEditSpanEndpoints(cableUndergroundEditCable, cableUndergroundEditSpanIndex);
    var routeLabel = ep
        ? (getManholeDisplayLabel(ep.norm.entryManholeId) + ' → ' + getManholeDisplayLabel(ep.norm.exitManholeId))
        : 'Подземный участок';
    if (titleEl) titleEl.textContent = routeLabel;
    if (modeEl) modeEl.textContent = 'Перепрокладка';
    if (hintEl) {
        hintEl.textContent = n
            ? 'Трасса сохраняется автоматически. «Заново» — сбросить клики. Завершение: второй колодец или «Готово».'
            : 'Кликайте по карте — новая трасса между теми же колодцами. «Заново» сбрасывает точки.';
    }
}

function showUndergroundDrawBar(mode) {
    var bar = document.getElementById('undergroundEditBar');
    var done = document.getElementById('undergroundEditDone');
    var deleteCableBtn = document.getElementById('undergroundEditDeleteCable');
    if (done) done.hidden = mode !== 'relayout';
    if (deleteCableBtn) deleteCableBtn.hidden = mode !== 'relayout';
    if (bar) {
        bar.hidden = false;
        bar.classList.toggle('underground-draw-card--lay', mode === 'lay');
        bar.classList.toggle('underground-draw-card--relayout', mode === 'relayout');
        document.body.classList.add('underground-draw-active');
        updateUndergroundEditBarText();
    }
}

function hideUndergroundEditBar() {
    var bar = document.getElementById('undergroundEditBar');
    if (bar) {
        bar.hidden = true;
        bar.classList.remove('underground-draw-card--lay', 'underground-draw-card--relayout');
    }
    document.body.classList.remove('underground-draw-active');
}

function clearUndergroundDrawCoords() {
    cableUndergroundCoords = [];
    if (cableUndergroundEditMode && cableUndergroundEditCable) {
        applyUndergroundSpanDraft(cableUndergroundEditCable, cableUndergroundEditSpanIndex, [], false);
        updateUndergroundEditPreview(null);
        updateUndergroundEditBarText();
    } else if (cableUndergroundActive && cableSource) {
        var previewTarget = (cableUndergroundManhole && cableUndergroundManhole.geometry)
            ? cableUndergroundManhole.geometry.getCoordinates()
            : null;
        if (previewTarget) updateCablePreview(cableSource, cableWaypoints, previewTarget);
        updateUndergroundEditBarText();
    }
}

function setupUndergroundEditBar() {
    var done = document.getElementById('undergroundEditDone');
    var relayout = document.getElementById('undergroundEditRelayout');
    var cancel = document.getElementById('undergroundEditCancelBar');
    var deleteCable = document.getElementById('undergroundEditDeleteCable');
    if (done) {
        done.addEventListener('click', function() {
            if (!cableUndergroundEditMode) return;
            saveUndergroundSpanEdit();
        });
    }
    if (relayout) {
        relayout.addEventListener('click', function() {
            if (!cableUndergroundEditMode && !cableUndergroundActive) return;
            clearUndergroundDrawCoords();
        });
    }
    if (cancel) {
        cancel.addEventListener('click', function() {
            if (cableUndergroundEditMode) {
                cancelUndergroundSpanEdit();
                return;
            }
            if (cableUndergroundActive) {
                resetCableUndergroundLayingState(true);
                if (cableSource) {
                    clearSelection();
                    selectObject(cableSource);
                }
                removeCablePreview();
                hideUndergroundEditBar();
            }
        });
    }
    if (deleteCable) {
        deleteCable.addEventListener('click', function() {
            if (!cableUndergroundEditMode || !cableUndergroundEditCable) return;
            var cable = cableUndergroundEditCable;
            var uid = cable.properties ? cable.properties.get('uniqueId') : null;
            cableUndergroundRelayoutBackup = null;
            cableUndergroundEditMode = false;
            cableUndergroundEditCable = null;
            cableUndergroundEditSpanIndex = -1;
            cableUndergroundCoords = [];
            removeUndergroundEditPreview();
            hideUndergroundEditBar();
            if (uid && typeof confirmAndDeleteCable === 'function') confirmAndDeleteCable(uid);
        });
    }
    window.onUndergroundSpanClick = function(cable, spanIndex) {
        if (!isEditMode) {
            if (typeof showWarning === 'function') showWarning('Включите режим редактирования.', 'Карта');
            return;
        }
        if (typeof closeInfoModal === 'function') closeInfoModal();
        startUndergroundSpanRelayout(cable, spanIndex);
    };
}

window.setupUndergroundEditBar = setupUndergroundEditBar;

/** Записать черновик pathCoords подземного участка на кабель и сохранить на диск. */
function applyUndergroundSpanDraft(cable, spanIndex, pathCoords, skipSave) {
    if (!cable || !cable.properties || spanIndex < 0) return false;
    var spans = (cable.properties.get('undergroundSpans') || []).slice();
    if (!spans[spanIndex]) return false;
    var n = window.CableUnderground ? CableUnderground.normalizeSpanRecord(spans[spanIndex]) : spans[spanIndex];
    if (!n) return false;
    var normPath = window.CableUnderground
        ? CableUnderground.normalizePathCoords(pathCoords)
        : (pathCoords || []).slice();
    spans[spanIndex] = {
        entryManholeId: n.entryManholeId,
        exitManholeId: n.exitManholeId,
        pathCoords: normPath
    };
    cable.properties.set('undergroundSpans', spans);
    applyCableRouteAndOverlays(cable);
    if (!skipSave) {
        saveData({ cable: cable, syncImmediate: true });
    }
    return true;
}

function persistUndergroundRelayoutDraft() {
    if (!cableUndergroundEditMode || !cableUndergroundEditCable) return;
    applyUndergroundSpanDraft(
        cableUndergroundEditCable,
        cableUndergroundEditSpanIndex,
        cableUndergroundCoords,
        false
    );
}

function saveUndergroundSpanEdit() {
    if (!cableUndergroundEditCable || cableUndergroundEditSpanIndex < 0) return false;
    persistUndergroundRelayoutDraft();
    cableUndergroundRelayoutBackup = null;
    cancelUndergroundSpanEdit();
    return true;
}

/** Перепрокладка подземного участка заново (колодцы те же, трасса с нуля). */
function startUndergroundSpanRelayout(cable, spanIndex) {
    if (!cable || !cable.properties || !canEdit()) return;
    if (isCopperCableType(cable.properties.get('cableType'))) return;
    var spans = cable.properties.get('undergroundSpans');
    if (!Array.isArray(spans) || !spans[spanIndex]) return;
    if (currentCableTool) {
        var cableBtn = document.getElementById('addCable');
        if (cableBtn) cableBtn.click();
    }
    removeUndergroundEditPreview();
    var normStart = window.CableUnderground ? CableUnderground.normalizeSpanRecord(spans[spanIndex]) : spans[spanIndex];
    cableUndergroundRelayoutBackup = normStart && normStart.pathCoords ? normStart.pathCoords.slice() : [];
    cableUndergroundEditMode = true;
    cableUndergroundEditCable = cable;
    cableUndergroundEditSpanIndex = spanIndex;
    cableUndergroundCoords = [];
    applyUndergroundSpanDraft(cable, spanIndex, [], true);
    updateUndergroundEditPreview(null);
    showUndergroundDrawBar('relayout');
}

function handleManholeCableLayClick(manholeObj) {
    if (!manholeObj || !cableSource) return false;
    if (cableUndergroundActive) {
        if (!commitUndergroundSpanToManhole(manholeObj)) return false;
        clearSelection();
        selectObject(cableSource);
        removeCablePreview();
        return true;
    }
    var lastWp = cableWaypoints.length ? cableWaypoints[cableWaypoints.length - 1] : null;
    if (lastWp !== manholeObj) cableWaypoints.push(manholeObj);
    startUndergroundRoutingFromManhole(manholeObj);
    clearSelection();
    selectObject(cableSource);
    return true;
}

function mergeUndergroundSpansForCreate(extraSpans) {
    var base = Array.isArray(cableUndergroundPendingSpans) ? cableUndergroundPendingSpans.slice() : [];
    if (Array.isArray(extraSpans) && extraSpans.length) {
        return base.concat(extraSpans);
    }
    return base;
}

function applyCableRouteAndOverlays(cable, points, undergroundSpans) {
    if (!cable || !cable.properties) return;
    if (undergroundSpans != null) cable.properties.set('undergroundSpans', undergroundSpans);
    if (window.CableUnderground) {
        CableUnderground.applyCableRouteGeometry(cable, points, undergroundSpans);
        CableUnderground.refreshCableUndergroundOverlays(cable);
    } else {
        syncCableGeometryFromRoutePoints(cable);
    }
}

function refreshAllCableUndergroundOverlays() {
    if (!window.CableUnderground || !objects) return;
    objects.forEach(function (o) {
        if (o.properties && o.properties.get('type') === 'cable') {
            var spans = o.properties.get('undergroundSpans') || [];
            if (spans.length) {
                CableUnderground.applyCableRouteGeometry(o);
            }
            CableUnderground.refreshCableUndergroundOverlays(o);
        }
    });
}

function getCableSplitLabel(cable) {
    if (!cable || !cable.properties) return 'Кабель';
    var name = cable.properties.get('cableName') || '';
    var desc = getCableDescription(cable.properties.get('cableType'));
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    var fn = from ? (from.properties.get('name') || getObjectTypeName(from.properties.get('type'))) : '?';
    var tn = to ? (to.properties.get('name') || getObjectTypeName(to.properties.get('type'))) : '?';
    return (name ? name + ' — ' : '') + desc + ' (' + fn + ' → ' + tn + ')';
}

function getSplittableFiberCablesAtWaypoint(waypointObj) {
    return getFiberCablesThroughWaypoint(waypointObj).filter(function(cable) {
        var pts = getCableRoutePoints(cable);
        if (!pts) return false;
        var idx = getPointIndexOnCableRoute(pts, waypointObj);
        return idx > 0 && idx < pts.length - 1;
    });
}

function findFiberCablesNearPoint(coords, maxDistance) {
    maxDistance = maxDistance != null ? maxDistance : 0.0004;
    var found = [];
    objects.forEach(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return;
        if (isCopperCableType(cable.properties.get('cableType'))) return;
        var geom = cable.geometry && cable.geometry.getCoordinates();
        if (!geom || geom.length < 2) return;
        var proj = projectPointOntoPolyline(coords, geom);
        if (!proj || proj.distance > maxDistance) return;
        if (proj.fraction < 0.03 || proj.fraction > 0.97) return;
        found.push({ cable: cable, distance: proj.distance });
    });
    found.sort(function(a, b) { return a.distance - b.distance; });
    return found.map(function(x) { return x.cable; });
}

function getCableSplitPreviewStroke() {
    try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--cable-split-preview');
        if (v && v.trim()) return v.trim();
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') === 'dark' ? '#f87171' : '#ef4444';
}

function getCableSplitPreviewOpacity() {
    try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--cable-split-preview-opacity');
        if (v && v.trim()) return parseFloat(v.trim()) || 0.38;
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 0.52 : 0.38;
}

function showCableSplitSelectionDialog(cables, waypointObj, clickCoords, presetSleeveOptions) {
    if (!cables || !cables.length) return;
    var modal = document.getElementById('infoModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalContent = document.getElementById('modalInfo');
    if (!modal || !modalContent) return;
    modalTitle.textContent = 'Выбор кабеля для разреза';
    var html = '<div class="info-section cable-split-dialog">';
    html += buildCableSplitSleeveFieldsHtml(presetSleeveOptions && presetSleeveOptions.sleeveType ? presetSleeveOptions.sleeveType : undefined);
    html += '<p class="cable-split-dialog__lead">Несколько кабелей рядом с точкой клика. Выберите, какой разделить:</p>';
    html += '<div class="cable-split-pick-list">';
    cables.forEach(function(cable) {
        var cid = cable.properties.get('uniqueId');
        html += '<button type="button" class="btn-secondary btn-cable-split-pick btn-pick-cable-split" data-cable-id="' + escapeHtml(cid) + '">';
        html += escapeHtml(getCableSplitLabel(cable));
        html += '</button>';
    });
    html += '</div>';
    html += '<button type="button" id="cancelCableSplitPick" class="btn-secondary cable-split-dialog-cancel">Отмена</button>';
    html += '</div>';
    modalContent.innerHTML = html;
    modal.style.display = 'block';
    bindCableSplitSleeveFields(modalContent);
    if (presetSleeveOptions && presetSleeveOptions.sleeveName) {
        var presetNameEl = modalContent.querySelector('.cable-split-sleeve-name');
        if (presetNameEl) presetNameEl.value = presetSleeveOptions.sleeveName;
    }
    modalContent.querySelectorAll('.btn-pick-cable-split').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var cableId = btn.getAttribute('data-cable-id');
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
            });
            var sleeveOpts = readCableSplitSleeveOptions(modalContent);
            modal.style.display = 'none';
            if (!cable) return;
            if (waypointObj) {
                splitCableAt(cable, mergeCableSplitSleeveOptions({ waypointObj: waypointObj }, sleeveOpts));
            } else if (clickCoords) {
                splitCableAt(cable, mergeCableSplitSleeveOptions({ clickCoords: clickCoords }, sleeveOpts));
            }
        });
    });
    var cancelBtn = document.getElementById('cancelCableSplitPick');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            if (waypointObj && (waypointObj.properties.get('type') === 'support' || waypointObj.properties.get('type') === 'attachment')) {
                showSupportInfo(waypointObj);
            }
        });
    }
}

function splitCableAt(cable, splitOptions) {
    splitOptions = splitOptions || {};
    if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
    var cableType = cable.properties.get('cableType');
    if (isCopperCableType(cableType)) {
        showError('Медный кабель нельзя разрезать этой командой.', 'Разрез кабеля');
        return false;
    }

    var points = getCableRoutePoints(cable);
    if (!points || points.length < 2) {
        showError('Не удалось определить маршрут кабеля.', 'Разрез кабеля');
        return false;
    }

    var oldId = cable.properties.get('uniqueId');
    var cableName = cable.properties.get('cableName') || '';
    var geom = cable.geometry ? cable.geometry.getCoordinates() : null;
    if (!geom || geom.length < 2) {
        geom = points.map(function(p) { return p.geometry.getCoordinates(); });
    }

    var splitAfterIndex;
    var splitCoords;
    var coordsA;
    var coordsB;
    var waypointIndex = -1;

    if (splitOptions.waypointObj) {
        var wpIdx = getPointIndexOnCableRoute(points, splitOptions.waypointObj);
        if (wpIdx <= 0 || wpIdx >= points.length - 1) {
            showError('Муфту можно установить только на промежуточной точке маршрута (опора или крепление), не на концах кабеля.', 'Разрез кабеля');
            return false;
        }
        waypointIndex = wpIdx;
        splitAfterIndex = wpIdx - 1;
        splitCoords = splitOptions.waypointObj.geometry.getCoordinates();
        var projWp = projectPointOntoPolyline(splitCoords, geom);
        if (projWp) {
            var splitRes = splitPolylineCoords(geom, splitCoords, projWp);
            coordsA = splitRes.coordsA;
            coordsB = splitRes.coordsB;
        }
    } else if (splitOptions.clickCoords) {
        var proj = projectPointOntoPolyline(splitOptions.clickCoords, geom);
        if (!proj || proj.distance > 0.0004) {
            showError('Кликните ближе к линии кабеля.', 'Разрез кабеля');
            return false;
        }
        if (proj.fraction < 0.03 || proj.fraction > 0.97) {
            showError('Слишком близко к концу кабеля. Выберите точку ближе к середине маршрута или используйте опору на маршруте.', 'Разрез кабеля');
            return false;
        }
        splitCoords = proj.point;
        splitAfterIndex = resolveSplitAfterIndex(points, proj.fraction);
        var splitResClick = splitPolylineCoords(geom, splitCoords, proj);
        coordsA = splitResClick.coordsA;
        coordsB = splitResClick.coordsB;
    } else {
        return false;
    }

    if (splitAfterIndex < 0 || splitAfterIndex >= points.length - 1) {
        showError('Не удалось определить точку разреза на маршруте.', 'Разрез кабеля');
        return false;
    }

    var sleeveType = splitOptions.sleeveType || 'SNR-FOSC-L';
    var newSleeve = createObject('sleeve', splitOptions.sleeveName || '', splitCoords, {
        sleeveType: sleeveType,
        maxFibers: 0
    });
    if (!newSleeve) {
        showError('Не удалось создать муфту.', 'Разрез кабеля');
        return false;
    }

    var routes;
    if (waypointIndex > 0) {
        routes = {
            pointsA: points.slice(0, waypointIndex + 1).concat([newSleeve]),
            pointsB: [newSleeve].concat(points.slice(waypointIndex))
        };
    } else {
        routes = buildRoutePointsForSplit(points, splitAfterIndex, newSleeve, coordsA, coordsB);
    }
    var idA = 'cable-' + Date.now() + '-a-' + Math.random().toString(36).substr(2, 9);
    var idB = 'cable-' + Date.now() + '-b-' + Math.random().toString(36).substr(2, 9);

    migrateCableIdReferences(cable, oldId, idA, idB, splitAfterIndex);
    deleteCableByUniqueId(oldId, { skipSync: true });
    if (typeof window.syncSendOp === 'function') {
        window.syncSendOp({ type: 'delete_cable', uniqueId: oldId });
    }

    var oldSpans = cable.properties.get('undergroundSpans') || [];
    var splitSpans = window.CableUnderground
        ? CableUnderground.splitSpansForRoute(oldSpans, routes.pointsA, routes.pointsB)
        : { spansA: [], spansB: [] };
    var okA = createCableFromPoints(routes.pointsA, cableType, idA, null, true, true, null, splitSpans.spansA);
    var okB = createCableFromPoints(routes.pointsB, cableType, idB, null, true, true, null, splitSpans.spansB);
    if (!okA || !okB) {
        showError('Ошибка при создании сегментов кабеля после разреза.', 'Разрез кабеля');
        return false;
    }

    var cableA = objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === idA; });
    var cableB = objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === idB; });
    if (waypointIndex > 0) {
        if (cableA) syncCableGeometryFromRoutePoints(cableA);
        if (cableB) syncCableGeometryFromRoutePoints(cableB);
    } else {
        if (cableA && coordsA) applyCableGeometryFromCoords(cableA, coordsA);
        else if (cableA) syncCableGeometryFromRoutePoints(cableA);
        if (cableB && coordsB) applyCableGeometryFromCoords(cableB, coordsB);
        else if (cableB) syncCableGeometryFromRoutePoints(cableB);
    }
    if (cableA && cableName) cableA.properties.set('cableName', cableName);
    if (cableB && cableName) cableB.properties.set('cableName', cableName);

    if (typeof window.syncSendOp === 'function') {
        var opA = cableA ? buildAddCableSyncOp(cableA, routes.pointsA) : null;
        var opB = cableB ? buildAddCableSyncOp(cableB, routes.pointsB) : null;
        if (opA) window.syncSendOp(opA);
        if (opB) window.syncSendOp(opB);
    }

    saveData({ syncFull: true });

    updateCableVisualization();
    scheduleConnectionLinesUpdate();
    updateStats();

    var fromName = routes.pointsA[0].properties.get('name') || getObjectTypeName(routes.pointsA[0].properties.get('type'));
    var toName = routes.pointsB[routes.pointsB.length - 1].properties.get('name') || getObjectTypeName(routes.pointsB[routes.pointsB.length - 1].properties.get('type'));
    logAction(ActionTypes.CREATE_CABLE, {
        cableType: getCableDescription(cableType),
        from: fromName,
        to: toName,
        note: 'Разрез кабеля, муфта на маршруте'
    });

    showSuccess('Кабель разделён на два сегмента. Муфта установлена на маршруте.', 'Разрез кабеля');
    showObjectInfo(newSleeve);
    return true;
}

function cancelCableSplitMode() {
    cableSplitMode = false;
    cableSplitData = null;
    if (cableSplitPreviewLine) {
        try { myMap.geoObjects.remove(cableSplitPreviewLine); } catch (e) {}
        cableSplitPreviewLine = null;
    }
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = '';
        mapEl.classList.remove('map-crosshair-active');
    }
    document.documentElement.classList.remove('cable-split-mode-active');
    syncMapPanLockForEditTools();
}

function startCableSplitPickOnCable(cable, sleeveOptions) {
    if (!isEditMode) return;
    if (splitterFiberRoutingMode) cancelSplitterFiberRouting();
    if (fiberRoutingMode) cancelFiberRouting();
    if (objectPlacementMode) cancelObjectPlacement();
    if (currentCableTool) {
        var cableBtn = document.getElementById('addCable');
        if (cableBtn && currentCableTool) cableBtn.click();
    }
    sleeveOptions = sleeveOptions || null;
    cableSplitMode = true;
    cableSplitData = {
        mode: 'pickOnCable',
        cable: cable,
        cableUniqueId: cable.properties.get('uniqueId'),
        sleeveOptions: sleeveOptions
    };
    var modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    var typeHint = sleeveOptions && sleeveOptions.sleeveType ? sleeveOptions.sleeveType : 'SNR-FOSC-L';
    showInfo('Кликните по линии кабеля в месте установки муфты. Тип муфты: ' + typeHint + '. Escape — отмена.', 'Установка муфты');
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = 'crosshair';
        mapEl.classList.add('map-crosshair-active');
    }
    document.documentElement.classList.add('cable-split-mode-active');
    syncMapPanLockForEditTools();
}

function splitCableAtWaypoint(waypointObj, cable, sleeveOptions) {
    if (!isEditMode || !waypointObj || !cable) return false;
    return splitCableAt(cable, mergeCableSplitSleeveOptions({ waypointObj: waypointObj }, sleeveOptions));
}

function handleCableSplitMapClick(coords, clickedCableObj) {
    if (!cableSplitMode || !cableSplitData) return false;
    cableSplitSuppressInfoUntil = Date.now() + 600;
    var splitData = cableSplitData;
    var savedSleeveOpts = splitData.sleeveOptions;
    if (splitData.mode !== 'pickOnCable') {
        cancelCableSplitMode();
        return false;
    }
    var preferId = splitData.cableUniqueId;
    if (clickedCableObj && clickedCableObj.properties) {
        var clickedId = clickedCableObj.properties.get('uniqueId');
        if (!preferId || clickedId === preferId) {
            cancelCableSplitMode();
            splitCableAt(clickedCableObj, mergeCableSplitSleeveOptions({ clickCoords: coords }, savedSleeveOpts));
            return true;
        }
    }
    var candidates = findFiberCablesNearPoint(coords);
    if (preferId && candidates.length > 1) {
        var preferIdx = -1;
        for (var ci = 0; ci < candidates.length; ci++) {
            if (candidates[ci].properties.get('uniqueId') === preferId) {
                preferIdx = ci;
                break;
            }
        }
        if (preferIdx > 0) {
            var pref = candidates.splice(preferIdx, 1)[0];
            candidates.unshift(pref);
        }
    }
    cancelCableSplitMode();
    if (!candidates.length) {
        showError('Рядом с точкой клика не найден кабель ВОЛС. Кликните ближе к линии кабеля.', 'Разрез кабеля');
        return true;
    }
    if (candidates.length === 1) {
        splitCableAt(candidates[0], mergeCableSplitSleeveOptions({ clickCoords: coords }, savedSleeveOpts));
    } else {
        showCableSplitSelectionDialog(candidates, null, coords, savedSleeveOpts);
    }
    return true;
}

function updateCableSplitPreview(cursorCoords) {
    if (!cableSplitMode || !cableSplitData || cableSplitData.mode !== 'pickOnCable') return;
    var cable = cableSplitData.cable;
    if (!cable || !cable.geometry) return;
    var geom = cable.geometry.getCoordinates();
    if (!geom || geom.length < 2) return;
    var proj = projectPointOntoPolyline(cursorCoords, geom);
    if (!proj) return;
    if (cableSplitPreviewLine) {
        try { myMap.geoObjects.remove(cableSplitPreviewLine); } catch (e) {}
    }
    cableSplitPreviewLine = new ymaps.Polyline([proj.point], {}, {
        strokeColor: getCableSplitPreviewStroke(),
        strokeWidth: 10,
        strokeOpacity: getCableSplitPreviewOpacity()
    });
    myMap.geoObjects.add(cableSplitPreviewLine);
}
