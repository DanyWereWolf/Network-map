/**
 * Группы кроссов/узлов на карте, подписи.
 */
function getCableGroups() {
    const groups = new Map();
    
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            if (fromObj && toObj) {
                var fromCoords, toCoords;
                try {
                    fromCoords = fromObj.geometry && fromObj.geometry.getCoordinates();
                    toCoords = toObj.geometry && toObj.geometry.getCoordinates();
                } catch (e) { return; }
                if (!fromCoords || !toCoords || fromCoords.length < 2 || toCoords.length < 2) return;

                const sorted = [fromCoords, toCoords].sort((a, b) => {
                    if (Math.abs(a[0] - b[0]) > 0.000001) return a[0] - b[0];
                    return a[1] - b[1];
                });
                
                const key = `${sorted[0][0].toFixed(8)},${sorted[0][1].toFixed(8)}|${sorted[1][0].toFixed(8)},${sorted[1][1].toFixed(8)}`;
                
                if (!groups.has(key)) {
                    groups.set(key, {
                        from: fromObj,
                        to: toObj,
                        fromCoords: fromCoords,
                        toCoords: toCoords,
                        cables: []
                    });
                }
                groups.get(key).cables.push(obj);
            }
        }
    });
    
    return groups;
}

function getCrossGroups() {
    const crosses = objects.filter(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'cross') return false;
        return !(typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj));
    });
    if (crosses.length === 0) return [];
    return clusterPlacemarksByProximity(crosses, 'crosses');
}

function parseGroupKeyToCoords(key) {
    if (!key || typeof key !== 'string') return null;
    var parts = key.split(',');
    if (parts.length < 2) return null;
    var lat = parseFloat(parts[0]);
    var lon = parseFloat(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lat, lon];
}

function collectTypedObjectsNearGroupKeys(type, keys) {
    var out = [];
    var seen = typeof Set !== 'undefined' ? new Set() : null;
    var keySet = Object.create(null);
    for (var ki = 0; ki < keys.length; ki++) keySet[keys[ki]] = true;
    function consider(obj) {
        if (!obj || !obj.properties || obj.properties.get('type') !== type) return;
        if (typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj)) return;
        var uid = obj.properties.get('uniqueId');
        if (seen) {
            if (uid && seen.has(uid)) return;
            if (uid) seen.add(uid);
        } else if (out.indexOf(obj) >= 0) {
            return;
        }
        out.push(obj);
    }
    function considerIfKeyMatch(obj) {
        if (!obj || !obj.geometry) return;
        try {
            if (!keySet[groupKey(obj.geometry.getCoordinates())]) return;
        } catch (e) { return; }
        consider(obj);
    }
    var usedSpatial = false;
    if (typeof MapPerf !== 'undefined' && MapPerf.querySpatialNearCoords) {
        for (var i = 0; i < keys.length; i++) {
            var coords = parseGroupKeyToCoords(keys[i]);
            if (!coords) continue;
            var near = MapPerf.querySpatialNearCoords(coords, 2);
            if (!near) continue;
            usedSpatial = true;
            for (var j = 0; j < near.length; j++) consider(near[j]);
        }
    }
    if (!usedSpatial || !out.length) {
        objects.forEach(considerIfKeyMatch);
    }
    return out;
}

function getCrossGroupsForKeys(keys) {
    if (!keys || !keys.length) return [];
    var keySet = Object.create(null);
    for (var i = 0; i < keys.length; i++) keySet[keys[i]] = true;
    var crosses = collectTypedObjectsNearGroupKeys('cross', keys);
    if (!crosses.length) return [];
    return clusterPlacemarksByProximity(crosses, 'crosses').filter(function(g) {
        return !!keySet[groupKey(g.coords)];
    });
}

function getNodeGroupsForKeys(keys) {
    if (!keys || !keys.length) return [];
    var keySet = Object.create(null);
    for (var i = 0; i < keys.length; i++) keySet[keys[i]] = true;
    var nodes = collectTypedObjectsNearGroupKeys('node', keys);
    if (!nodes.length) return [];
    return clusterPlacemarksByProximity(nodes, 'nodes').filter(function(g) {
        return !!keySet[groupKey(g.coords)];
    });
}

function parseGroupDisplayScope(scope) {
    if (scope == null || scope === true) return { full: true, keys: null };
    if (typeof scope === 'string') return { full: false, keys: [scope] };
    if (Array.isArray(scope)) return { full: false, keys: scope };
    if (typeof scope === 'object' && scope.keys) return { full: !!scope.full, keys: scope.keys };
    return { full: true, keys: null };
}

function detachCrossesAtGroupKey(key) {
    var pm = crossGroupPlacemarkByKey.get(key);
    if (pm) {
        var lbl = pm.properties && pm.properties.get('crossGroupLabel');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
        try { myMap.geoObjects.remove(pm); } catch (e) {}
        crossGroupPlacemarks = crossGroupPlacemarks.filter(function(p) { return p !== pm; });
        crossGroupPlacemarkByKey.delete(key);
    }
    var scan = collectTypedObjectsNearGroupKeys('cross', [key]);
    scan.forEach(function(obj) {
        if (!obj.geometry) return;
        try {
            if (groupKey(obj.geometry.getCoordinates()) !== key) return;
            try { myMap.geoObjects.remove(obj); } catch (e2) {}
            var label = obj.properties.get('label');
            if (label) try { myMap.geoObjects.remove(label); } catch (e3) {}
        } catch (e4) {}
    });
}

function detachNodesAtGroupKey(key) {
    var pm = nodeGroupPlacemarkByKey.get(key);
    if (pm) {
        var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
        try { myMap.geoObjects.remove(pm); } catch (e) {}
        nodeGroupPlacemarks = nodeGroupPlacemarks.filter(function(p) { return p !== pm; });
        nodeGroupPlacemarkByKey.delete(key);
    }
    var scan = collectTypedObjectsNearGroupKeys('node', [key]);
    scan.forEach(function(obj) {
        if (!obj.geometry) return;
        try {
            if (groupKey(obj.geometry.getCoordinates()) !== key) return;
            try { myMap.geoObjects.remove(obj); } catch (e2) {}
            var label = obj.properties.get('label');
            if (label) try { myMap.geoObjects.remove(label); } catch (e3) {}
        } catch (e4) {}
    });
}

function updateCrossDisplay(scope) {
    var parsed = parseGroupDisplayScope(scope);
    var keysOnly = !parsed.full && parsed.keys && parsed.keys.length && !isMapBulkImportActive();
    if (keysOnly) {
        parsed.keys.forEach(function(k) { detachCrossesAtGroupKey(k); });
    } else {
        crossGroupPlacemarks.forEach(pm => {
            const lbl = pm.properties && pm.properties.get('crossGroupLabel');
            if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
            try { myMap.geoObjects.remove(pm); } catch (e) {}
        });
        crossGroupPlacemarks = [];
        crossGroupPlacemarkByKey.clear();
        const allCrosses = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross');
        allCrosses.forEach(cross => {
            try { myMap.geoObjects.remove(cross); } catch (e) {}
            const label = cross.properties.get('label');
            if (label) try { myMap.geoObjects.remove(label); } catch (e) {}
        });
    }
    const groupsToRender = keysOnly ? getCrossGroupsForKeys(parsed.keys) : getCrossGroups();
    groupsToRender.forEach(group => {
        const gKey = groupKey(group.coords);
        if (group.crosses.length === 1) {
            const cross = group.crosses[0];
            crossGroupPlacemarkByKey.delete(gKey);
            if (typeof updateObjectLabel === 'function') {
                updateObjectLabel(cross, cross.properties.get('name') || '');
            }
            myMap.geoObjects.add(cross);
            const label = cross.properties.get('label');
            if (label) myMap.geoObjects.add(label);
            return;
        }
        const coords = group.coords;
        const n = group.crosses.length;
        const crossGroupName = getCrossGroupName(coords);
        const crossLabelText = crossGroupName || (group.crosses.length + ' кр.');
        const groupIcon = buildMapPlacemarkIcon('crossGroup', 'normal', { groupCount: n });
        const svgDataUrl = groupIcon ? groupIcon.href : '';
        const crossLabelHtml = '<div class="map-label map-label-group">' + escapeHtml(crossLabelText) + '</div>';
        const crossLabel = new ymaps.Placemark(coords, { iconContent: crossLabelHtml }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: crossLabelHtml,
            iconContentOffset: [0, 22],
            zIndex: 1999,
            hasBalloon: false,
            hasHint: false,
            cursor: 'default'
        });
        const groupPlacemark = new ymaps.Placemark(coords, {
            type: 'crossGroup',
            crossGroup: group.crosses,
            crossGroupLabel: crossLabel,
            balloonContent: ''
        }, {
            iconLayout: 'default#image',
            iconImageHref: svgDataUrl,
            iconImageSize: groupIcon ? groupIcon.iconImageSize : [36, 36],
            iconImageOffset: groupIcon ? groupIcon.iconImageOffset : [-18, -18],
            zIndex: 2000,
            zIndexHover: 2000,
            hasBalloon: false,
            hasHint: true,
            hintContent: crossGroupName || `Группа кроссов (${n})`,
            draggable: isEditMode,
            syncOverlayInit: true,
            cursor: 'pointer'
        });
        groupPlacemark.properties.set('labelContent', crossLabelText);
        groupPlacemark.events.add('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (objectPlacementMode) return;
            const crosses = groupPlacemark.properties.get('crossGroup');
            if (crosses.length === 1) {
                if (currentCableTool && isEditMode) {
                    if (cableSource && cableSource !== crosses[0]) {
                        const cableType = getEffectiveCableLayingType();
                        const points = [cableSource].concat(cableWaypoints).concat([crosses[0]]);
                        if (createCableFromPoints(points, cableType)) {
                            cableSource = crosses[0];
                            cableWaypoints = [];
                            clearSelection();
                            selectObject(cableSource);
                            removeCablePreview();
                        }
                    } else {
                        cableSource = crosses[0];
                        clearSelection();
                        selectObject(cableSource);
                    }
                } else {
                    showObjectInfo(crosses[0]);
                }
                return;
            }
            const crossesWithCableCount = crosses.map((c, originalIndex) => {
                const cableCount = objects.filter(cable => {
                    if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
                    var from = cable.properties.get('from');
                    var to = cable.properties.get('to');
                    return from === c || to === c;
                }).length;
                return { cross: c, originalIndex, cableCount, name: c.properties.get('name') || 'Без имени' };
            });
            crossesWithCableCount.sort((a, b) => b.cableCount - a.cableCount);
            const listHtml = crossesWithCableCount.map((item, displayIndex) =>
                `<div class="cross-group-item" data-index="${item.originalIndex}" data-display-index="${displayIndex}">` +
                `<span class="group-item-name">${escapeHtml(item.name)}</span>` +
                `<span class="group-item-cables" style="margin-left: 8px; font-size: 0.75rem; color: ${item.cableCount > 0 ? '#22c55e' : '#9ca3af'};">(${item.cableCount} каб.)</span>` +
                (isEditMode ? `<button type="button" class="group-item-move" title="Вынести и переместить">Переместить</button>` : '') +
                `</div>`
            ).join('');
            const groupNameRow = isEditMode
                ? ('<div class="group-name-row">' +
                    '<label class="group-name-label">Название группы</label>' +
                    '<div class="group-name-controls">' +
                    '<input type="text" class="group-name-input" value="' + escapeHtml(crossGroupName) + '" placeholder="' + escapeHtml(n + ' кр.') + '">' +
                    '<button type="button" class="group-name-save">Сохранить</button>' +
                    '</div></div>')
                : (crossGroupName ? '<div class="group-name-row"><label class="group-name-label">Название группы</label><div class="group-name-controls"><span class="group-name-readonly">' + escapeHtml(crossGroupName) + '</span></div></div>' : '');
            const balloonHtml = '<div class="cross-group-list network-map-balloon" data-lat="' + coords[0] + '" data-lon="' + coords[1] + '" data-group-type="cross">' +
                '<div class="group-balloon-header">' +
                '<span class="group-balloon-title">' + escapeHtml(crossGroupName || 'Выберите кросс') + '</span>' +
                '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
                '</div>' +
                groupNameRow +
                '<div class="group-balloon-list">' + listHtml + '</div></div>';
            myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
            setTimeout(() => {
                const saveBtn = document.querySelector('.cross-group-list .group-name-save');
                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        const c = document.querySelector('.cross-group-list.network-map-balloon');
                        if (c) {
                            const lat = parseFloat(c.getAttribute('data-lat')), lon = parseFloat(c.getAttribute('data-lon'));
                            const inp = c.querySelector('.group-name-input');
                            if (!isNaN(lat) && !isNaN(lon) && inp) {
                                setCrossGroupName([lat, lon], inp.value);
                                if (typeof showInfo === 'function') showInfo('Название группы сохранено', 'Сохранено');
                            }
                            myMap.balloon.close();
                        }
                    });
                }
                document.querySelectorAll('.cross-group-item').forEach((el) => {
                    const crossIndex = parseInt(el.getAttribute('data-index'), 10);
                    if (isNaN(crossIndex) || crossIndex < 0 || crossIndex >= crosses.length) return;
                    const crossObj = crosses[crossIndex];
                    const moveBtn = el.querySelector('.group-item-move');
                    if (moveBtn) {
                        moveBtn.addEventListener('click', function(ev) { ev.stopPropagation(); ev.preventDefault();
                            const offsetCoords = [coords[0] + 0.00008, coords[1]];
                            crossObj.geometry.setCoordinates(offsetCoords);
                            const lbl = crossObj.properties.get('label');
                            if (lbl && lbl.geometry) lbl.geometry.setCoordinates(offsetCoords);
                            updateConnectedCables(crossObj);
                            scheduleConnectionLinesUpdate();
                            ensurePlacemarkUniqueIdForSync(crossObj);
                            if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(crossObj);
                            else saveData({ object: crossObj, syncImmediate: true });
                            myMap.balloon.close();
                            updateCrossDisplay([groupKey(coords), groupKey(offsetCoords)]);
                        });
                    }
                    el.addEventListener('click', (e) => {
                        if (e.target && e.target.closest('.group-item-move')) return;
                        myMap.balloon.close();
                        if (currentCableTool && isEditMode) {
                            if (cableSource && cableSource !== crossObj) {
                                const cableType = getEffectiveCableLayingType();
                                const points = [cableSource].concat(cableWaypoints).concat([crossObj]);
                                if (createCableFromPoints(points, cableType)) {
                                    cableSource = crossObj;
                                    cableWaypoints = [];
                                    clearSelection();
                                    selectObject(cableSource);
                                    removeCablePreview();
                                }
                            } else {
                                cableSource = crossObj;
                                clearSelection();
                                selectObject(cableSource);
                            }
                        } else {
                            showObjectInfo(crossObj);
                        }
                    });
                });
            }, 50);
        });
        groupPlacemark.events.add('drag', function() {
            if (!window.syncDragInProgress) window.syncDragInProgress = true;
            const crossLbl = groupPlacemark.properties.get('crossGroupLabel');
            if (crossLbl && crossLbl.geometry) crossLbl.geometry.setCoordinates(groupPlacemark.geometry.getCoordinates());
        });
        groupPlacemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            const newCoords = groupPlacemark.geometry.getCoordinates();
            const crossLbl = groupPlacemark.properties.get('crossGroupLabel');
            if (crossLbl && crossLbl.geometry) crossLbl.geometry.setCoordinates(newCoords);
            const crosses = groupPlacemark.properties.get('crossGroup');
            const oldCoords = crosses[0].geometry.getCoordinates();
            const oldKey = groupKey(oldCoords);
            const savedName = crossGroupNames.get(oldKey);
            var movedGroupObjects = [];
            crosses.forEach(c => {
                c.geometry.setCoordinates(newCoords);
                const lbl = c.properties.get('label');
                if (lbl && lbl.geometry) lbl.geometry.setCoordinates(newCoords);
                updateConnectedCables(c);
                ensurePlacemarkUniqueIdForSync(c);
                movedGroupObjects.push(c);
                if (typeof getCablesTouchingObject === 'function') {
                    getCablesTouchingObject(c).forEach(function(cable) {
                        if (movedGroupObjects.indexOf(cable) === -1) movedGroupObjects.push(cable);
                    });
                }
            });
            scheduleConnectionLinesUpdate();
            if (savedName) {
                crossGroupNames.delete(oldKey);
                crossGroupNames.set(groupKey(newCoords), savedName);
                saveGroupNames();
            }
            if (typeof saveLinkedMapObjects === 'function') saveLinkedMapObjects(movedGroupObjects);
            else saveData({ skipSync: true });
            updateCrossDisplay([oldKey, groupKey(newCoords)]);
        });
        attachHoverEventsToObject(groupPlacemark);
        myMap.geoObjects.add(crossLabel);
        myMap.geoObjects.add(groupPlacemark);
        crossGroupPlacemarks.push(groupPlacemark);
        crossGroupPlacemarkByKey.set(gKey, groupPlacemark);
    });
    
    var crossesForCables = keysOnly ? groupsToRender.reduce(function(acc, g) {
        return acc.concat(g.crosses);
    }, []) : objects.filter(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cross';
    });
    crossesForCables.forEach(function(cross) {
        updateConnectedCables(cross);
    });
    if (keysOnly) {
        if (typeof applyMapFilterForObject === 'function') {
            crossesForCables.forEach(function(cross) { applyMapFilterForObject(cross); });
        }
        if (typeof applyGroupPlacemarkFilterVisibility === 'function') {
            applyGroupPlacemarkFilterVisibility(
                typeof getMapFilterState === 'function' ? getMapFilterState() : {},
                typeof getExpertZoomFlags === 'function' ? getExpertZoomFlags() : null
            );
        }
    } else if (typeof applyMapFilter === 'function') {
        applyMapFilter();
    }
}

function getNodeGroups() {
    const nodes = objects.filter(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'node') return false;
        return !(typeof getObjectCabinetId === 'function' && getObjectCabinetId(obj));
    });
    if (nodes.length === 0) return [];
    return clusterPlacemarksByProximity(nodes, 'nodes');
}

function updateNodeDisplay(scope) {
    var parsed = parseGroupDisplayScope(scope);
    var keysOnly = !parsed.full && parsed.keys && parsed.keys.length && !isMapBulkImportActive();
    if (keysOnly) {
        parsed.keys.forEach(function(k) { detachNodesAtGroupKey(k); });
    } else {
        nodeGroupPlacemarks.forEach(pm => {
            const lbl = pm.properties && pm.properties.get('nodeGroupLabel');
            if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
            try { myMap.geoObjects.remove(pm); } catch (e) {}
        });
        nodeGroupPlacemarks = [];
        nodeGroupPlacemarkByKey.clear();
        const allNodes = objects.filter(obj => obj.properties && obj.properties.get('type') === 'node');
        allNodes.forEach(node => {
            try { myMap.geoObjects.remove(node); } catch (e) {}
            const label = node.properties.get('label');
            if (label) try { myMap.geoObjects.remove(label); } catch (e) {}
        });
    }
    const mapFilterState = typeof getMapFilterState === 'function' ? getMapFilterState() : {};
    const aggregationOnly = !!mapFilterState.nodeAggregationOnly;
    const groupsToRender = keysOnly ? getNodeGroupsForKeys(parsed.keys) : getNodeGroups();
    groupsToRender.forEach(group => {
        const displayNodes = aggregationOnly
            ? group.nodes.filter(function(nd) { return (nd.properties && nd.properties.get('nodeKind')) === 'aggregation'; })
            : group.nodes;
        if (displayNodes.length === 0) return;
        const nKey = groupKey(group.coords);
        if (displayNodes.length === 1) {
            const node = displayNodes[0];
            nodeGroupPlacemarkByKey.delete(nKey);
            if (typeof updateObjectLabel === 'function') {
                updateObjectLabel(node, node.properties.get('name') || '');
            }
            myMap.geoObjects.add(node);
            const label = node.properties.get('label');
            if (label) myMap.geoObjects.add(label);
            return;
        }
        const coords = group.coords;
        const n = displayNodes.length;
        const hasAggregation = displayNodes.some(function(nd) { return (nd.properties && nd.properties.get('nodeKind')) === 'aggregation'; });
        const nodeGroupName = getNodeGroupName(coords);
        const displayName = nodeGroupName || (n + ' уз.');
        const nodeLabelHtml = '<div class="map-label map-label-group">' + escapeHtml(displayName) + '</div>';
        const nodeLabel = new ymaps.Placemark(coords, { iconContent: nodeLabelHtml }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: nodeLabelHtml,
            iconContentOffset: [0, 22],
            zIndex: 1999,
            hasBalloon: false,
            hasHint: false,
            cursor: 'default'
        });
        const nodeGroupIcon = buildMapPlacemarkIcon('nodeGroup', 'normal', { groupCount: n, hasAggregation: hasAggregation });
        const svgDataUrl = nodeGroupIcon ? nodeGroupIcon.href : '';
        const groupPlacemark = new ymaps.Placemark(coords, {
            type: 'nodeGroup',
            nodeGroup: group.nodes,
            displayNodes: displayNodes,
            nodeGroupLabel: nodeLabel,
            balloonContent: ''
        }, {
            iconLayout: 'default#image',
            iconImageHref: svgDataUrl,
            iconImageSize: nodeGroupIcon ? nodeGroupIcon.iconImageSize : [36, 36],
            iconImageOffset: nodeGroupIcon ? nodeGroupIcon.iconImageOffset : [-18, -18],
            zIndex: 2000,
            zIndexHover: 2000,
            hasBalloon: false,
            hasHint: true,
            hintContent: nodeGroupName || (n === 1 ? 'Узел' : `Группа узлов (${n})`),
            draggable: isEditMode,
            syncOverlayInit: true,
            cursor: 'pointer'
        });
        groupPlacemark.properties.set('labelContent', displayName);
        groupPlacemark.events.add('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (objectPlacementMode) return;
            const nodes = groupPlacemark.properties.get('displayNodes') || groupPlacemark.properties.get('nodeGroup');
            if (nodes.length === 1) {
                showObjectInfo(nodes[0]);
                return;
            }
            const names = nodes.map(c => c.properties.get('name') || 'Без имени');
            const listHtml = nodes.map((c, i) => {
                const kind = c.properties.get('nodeKind') || 'network';
                const color = getNodeColorByKind(kind);
                return `<div class="node-group-item" data-index="${i}">` +
                `<span class="group-item-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${color};margin-right:6px;border:1px solid rgba(0,0,0,0.1);vertical-align:middle;"></span>` +
                `<span class="group-item-name">${escapeHtml(names[i])}</span>` +
                (isEditMode ? `<button type="button" class="group-item-move" title="Вынести и переместить">Переместить</button>` : '') +
                `</div>`;
            }).join('');
            const nodeGroupNameRow = isEditMode
                ? ('<div class="group-name-row">' +
                    '<label class="group-name-label">Название группы</label>' +
                    '<div class="group-name-controls">' +
                    '<input type="text" class="group-name-input" value="' + escapeHtml(nodeGroupName) + '" placeholder="' + escapeHtml(n + ' уз.') + '">' +
                    '<button type="button" class="group-name-save">Сохранить</button>' +
                    '</div></div>')
                : (nodeGroupName ? '<div class="group-name-row"><label class="group-name-label">Название группы</label><div class="group-name-controls"><span class="group-name-readonly">' + escapeHtml(nodeGroupName) + '</span></div></div>' : '');
            const balloonHtml = '<div class="node-group-list network-map-balloon" data-lat="' + coords[0] + '" data-lon="' + coords[1] + '" data-group-type="node">' +
                '<div class="group-balloon-header">' +
                '<span class="group-balloon-title">' + escapeHtml(nodeGroupName || 'Выберите узел') + '</span>' +
                '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
                '</div>' +
                nodeGroupNameRow +
                '<div class="group-balloon-list">' + listHtml + '</div></div>';
            myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
            setTimeout(() => {
                const saveBtn = document.querySelector('.node-group-list .group-name-save');
                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        const c = document.querySelector('.node-group-list.network-map-balloon');
                        if (c) {
                            const lat = parseFloat(c.getAttribute('data-lat')), lon = parseFloat(c.getAttribute('data-lon'));
                            const inp = c.querySelector('.group-name-input');
                            if (!isNaN(lat) && !isNaN(lon) && inp) {
                                setNodeGroupName([lat, lon], inp.value);
                                if (typeof showInfo === 'function') showInfo('Название группы сохранено', 'Сохранено');
                            }
                            myMap.balloon.close();
                            updateNodeDisplay();
                        }
                    });
                }
                document.querySelectorAll('.node-group-item').forEach((el, i) => {
                    const moveBtn = el.querySelector('.group-item-move');
                    if (moveBtn) {
                        moveBtn.addEventListener('click', function(ev) { ev.stopPropagation(); ev.preventDefault();
                            const offsetCoords = [coords[0] + 0.00008, coords[1]];
                            nodes[i].geometry.setCoordinates(offsetCoords);
                            const lbl = nodes[i].properties.get('label');
                            if (lbl && lbl.geometry) lbl.geometry.setCoordinates(offsetCoords);
                            updateConnectedCables(nodes[i]);
                            scheduleConnectionLinesUpdate();
                            ensurePlacemarkUniqueIdForSync(nodes[i]);
                            if (typeof saveObjectWithConnectedCables === 'function') saveObjectWithConnectedCables(nodes[i]);
                            else saveData({ object: nodes[i], syncImmediate: true });
                            myMap.balloon.close();
                            updateNodeDisplay();
                        });
                    }
                    el.addEventListener('click', (e) => {
                        if (e.target && e.target.closest('.group-item-move')) return;
                        myMap.balloon.close();
                        showObjectInfo(nodes[i]);
                    });
                });
            }, 50);
        });
        groupPlacemark.events.add('drag', function() {
            if (!window.syncDragInProgress) window.syncDragInProgress = true;
            const nodeLbl = groupPlacemark.properties.get('nodeGroupLabel');
            if (nodeLbl && nodeLbl.geometry) nodeLbl.geometry.setCoordinates(groupPlacemark.geometry.getCoordinates());
        });
        groupPlacemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            const newCoords = groupPlacemark.geometry.getCoordinates();
            const nodeLbl = groupPlacemark.properties.get('nodeGroupLabel');
            if (nodeLbl && nodeLbl.geometry) nodeLbl.geometry.setCoordinates(newCoords);
            const nodes = groupPlacemark.properties.get('nodeGroup');
            const oldCoords = nodes[0].geometry.getCoordinates();
            const oldKey = groupKey(oldCoords);
            const savedName = nodeGroupNames.get(oldKey);
            var movedNodeGroupObjects = [];
            nodes.forEach(n => {
                n.geometry.setCoordinates(newCoords);
                const lbl = n.properties.get('label');
                if (lbl && lbl.geometry) lbl.geometry.setCoordinates(newCoords);
                updateConnectedCables(n);
                ensurePlacemarkUniqueIdForSync(n);
                movedNodeGroupObjects.push(n);
                if (typeof getCablesTouchingObject === 'function') {
                    getCablesTouchingObject(n).forEach(function(cable) {
                        if (movedNodeGroupObjects.indexOf(cable) === -1) movedNodeGroupObjects.push(cable);
                    });
                }
            });
            scheduleConnectionLinesUpdate();
            if (savedName) {
                nodeGroupNames.delete(oldKey);
                nodeGroupNames.set(groupKey(newCoords), savedName);
                saveGroupNames();
            }
            if (typeof saveLinkedMapObjects === 'function') saveLinkedMapObjects(movedNodeGroupObjects);
            else saveData({ skipSync: true });
            updateNodeDisplay([oldKey, groupKey(newCoords)]);
        });
        attachHoverEventsToObject(groupPlacemark);
        myMap.geoObjects.add(nodeLabel);
        myMap.geoObjects.add(groupPlacemark);
        nodeGroupPlacemarks.push(groupPlacemark);
        nodeGroupPlacemarkByKey.set(nKey, groupPlacemark);
    });
    
    var nodesForCables = keysOnly ? groupsToRender.reduce(function(acc, g) {
        return acc.concat(g.nodes);
    }, []) : objects.filter(function(obj) {
        return obj.properties && obj.properties.get('type') === 'node';
    });
    nodesForCables.forEach(function(node) {
        updateConnectedCables(node);
    });
    if (keysOnly) {
        if (typeof applyMapFilterForObject === 'function') {
            nodesForCables.forEach(function(node) { applyMapFilterForObject(node); });
        }
        if (typeof applyGroupPlacemarkFilterVisibility === 'function') {
            applyGroupPlacemarkFilterVisibility(
                typeof getMapFilterState === 'function' ? getMapFilterState() : {},
                typeof getExpertZoomFlags === 'function' ? getExpertZoomFlags() : null
            );
        }
    } else if (typeof applyMapFilter === 'function') {
        applyMapFilter();
    }
}
