/**
 * Вспомогательные функции кабелей и меди.
 */
function markFiberAsUsed(obj, cableId, fiberNumber) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
    }
    
    if (!usedFibersData[cableId]) {
        usedFibersData[cableId] = [];
    }
    
    if (!usedFibersData[cableId].includes(fiberNumber)) {
        usedFibersData[cableId].push(fiberNumber);
    }
    
    obj.properties.set('usedFibers', usedFibersData);
    saveData();
}

function getFiberRoutingTargetLabel(targetType, targetObj) {
    var n = targetObj && targetObj.properties && targetObj.properties.get('name');
    if (n) return n;
    if (targetType === 'onu') return 'ONU';
    if (targetType === 'mediaConverter') return 'Медиаконвертер';
    if (targetType === 'radioBridge') return 'Радиомост';
    if (targetType === 'olt') return 'OLT';
    if (targetType === 'host') return 'Муфта/кросс';
    return 'Сплиттер';
}

function getFiberRoutingPreviewStroke(targetType) {
    if (targetType === 'onu') return '#22c55e';
    if (targetType === 'mediaConverter') return '#14b8a6';
    if (targetType === 'radioBridge') return '#06b6d4';
    if (targetType === 'olt') return '#0ea5e9';
    return '#f97316';
}

/**
 * Проверяет, занята ли жила (cableId + fiberNumber) где-либо: порт OLT, подключение к узлу/ONU/медиаконвертеру,
 * вход/выход сплиттера. exclude — контекст текущего назначения (чтобы не считать «занятой» ту же жилу при замене).
 * atCrossId/atSleeveId — проверять использование только в этом кроссе/муфте (жила имеет два конца,
 * подключение на одном конце не блокирует использование другого).
 * Назначение на OLT (oltPort / oltIncoming) не блокируется ответвлениями GPON (ONU, сплиттер) на той же жиле.
 * Назначение ONU/сплиттера (onuConn / splitterInput) не блокируется OLT на той же жиле (GPON feeder).
 * @param {string} cableId
 * @param {number} fiberNumber
 * @param {{ type?: string, oltId?: string, portNumber?: number, splitterId?: string, outputIndex?: number, crossId?: string, sleeveId?: string, atCrossId?: string, atSleeveId?: string }} exclude
 * @returns {{ used: boolean, where?: string }}
 */
function isOltFiberAssignmentExclude(exclude) {
    return !!(exclude && (exclude.type === 'oltPort' || exclude.type === 'oltIncoming'));
}

function isGponBranchAssignmentExclude(exclude) {
    return !!(exclude && (exclude.type === 'onuConn' || exclude.type === 'splitterInput'));
}

function isSplitterInputAssignmentExclude(exclude, hostUid, conn) {
    if (!exclude || exclude.type !== 'splitterInput' || !hostUid) return false;
    if (exclude.atSleeveId !== hostUid && exclude.atCrossId !== hostUid) return false;
    if (!exclude.splitterId) return true;
    return !!(conn && conn.splitterId === exclude.splitterId);
}

function getFiberUsage(cableId, fiberNumber, exclude) {
    if (!objects) return { used: false };
    const key = cableId + '-' + fiberNumber;
    const atCrossId = exclude && exclude.atCrossId;
    const atSleeveId = exclude && exclude.atSleeveId;
    const onlyAtLocation = atCrossId || atSleeveId;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj.properties) continue;
        const t = obj.properties.get('type');
        const uid = obj.properties.get('uniqueId');

        if (isFiberHostType(t)) {
            if (onlyAtLocation) {
                var matchLoc = (atCrossId && uid === atCrossId) || (atSleeveId && uid === atSleeveId);
                if (!matchLoc) continue;
            }
            if (t === 'cross' && typeof isFiberCrossPatchLocked === 'function' &&
                isFiberCrossPatchLocked(obj, cableId, fiberNumber)) {
                if (exclude && exclude.type === 'fiberConnection' && exclude.crossId === uid) continue;
                if (exclude && exclude.type === 'crossPortPatch' && exclude.crossId === uid) continue;
                return { used: true, where: 'жила на кроссированном порту' };
            }
            const fiberConnections = obj.properties.get('fiberConnections') || [];
            const isConnected = fiberConnections.some(conn =>
                (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
            );
            if (isConnected) {
                if (exclude && exclude.type === 'fiberConnection' && (exclude.crossId === uid || exclude.sleeveId === uid)) continue;
                if (exclude && exclude.type === 'oltPort') continue;
                if (isGponBranchAssignmentExclude(exclude)) continue;
                return { used: true, where: 'соединение жил в ' + (t === 'cross' ? 'кроссе' : (t === 'spliceCassette' ? 'сплайс-кассете' : 'муфте')) };
            }
            
            var nodeAss = getHostAssignment(obj, 'nodeConnections', cableId, fiberNumber);
            if (nodeAss) {
                if (exclude && exclude.type === 'nodeConn' && (exclude.crossId === uid || exclude.sleeveId === uid)) continue;
                return { used: true, where: 'подключение к узлу' };
            }
            var oltAss = getHostAssignment(obj, 'oltConnections', cableId, fiberNumber);
            if (oltAss) {
                if (exclude && exclude.type === 'oltPort') continue;
                if (exclude && exclude.type === 'splitterInput') continue;
                if (isGponBranchAssignmentExclude(exclude)) continue;
                if (exclude && exclude.type === 'fiberConnection') continue;
                return { used: true, where: 'порт OLT' };
            }
            var onuAss = getHostAssignment(obj, 'onuConnections', cableId, fiberNumber);
            if (onuAss) {
                if (exclude && exclude.type === 'onuConn' && exclude.sleeveId === uid) continue;
                if (isOltFiberAssignmentExclude(exclude)) continue;
                return { used: true, where: 'подключение к ONU' };
            }
            var mcAss = getHostAssignment(obj, 'mediaConverterConnections', cableId, fiberNumber);
            if (mcAss) {
                if (exclude && exclude.type === 'mediaConverterConn' && ((exclude.sleeveId && exclude.sleeveId === uid) || (exclude.crossId && exclude.crossId === uid))) continue;
                return { used: true, where: 'подключение к медиаконвертеру' };
            }
            var rbAss = getHostAssignment(obj, 'radioBridgeConnections', cableId, fiberNumber);
            if (rbAss) {
                if (exclude && exclude.type === 'radioBridgeConn' && ((exclude.sleeveId && exclude.sleeveId === uid) || (exclude.crossId && exclude.crossId === uid))) continue;
                return { used: true, where: 'подключение к радиомосту' };
            }
            var splitterAss = getHostAssignment(obj, 'splitterConnections', cableId, fiberNumber);
            if (splitterAss) {
                if (isSplitterInputAssignmentExclude(exclude, uid, splitterAss)) continue;
                if (isOltFiberAssignmentExclude(exclude)) continue;
                return { used: true, where: 'вход сплиттера' };
            }
            if (window.EmbeddedSplitters && EmbeddedSplitters.isHost(obj)) {
                var embList = EmbeddedSplitters.getList(obj);
                for (var esi = 0; esi < embList.length; esi++) {
                    var er = embList[esi];
                    if (!er) continue;
                    var erIn = er.inputFiber;
                    if (!erIn && er.inputCableId && er.inputFiberNumber != null) {
                        erIn = { cableId: er.inputCableId, fiberNumber: er.inputFiberNumber };
                    }
                    if (!erIn || erIn.cableId !== cableId || erIn.fiberNumber !== fiberNumber) continue;
                    if (exclude && exclude.type === 'splitterInput' && exclude.splitterId === er.id) continue;
                    if (isOltFiberAssignmentExclude(exclude)) continue;
                    return { used: true, where: 'вход сплиттера' };
                }
            }
            var spOutAtHost = findSplitterOutputAtHost(obj, cableId, fiberNumber);
            if (spOutAtHost) {
                if (exclude && exclude.type === 'splitterOutput' &&
                    exclude.splitterId === spOutAtHost.splitterId &&
                    exclude.outputIndex === spOutAtHost.outputIndex) continue;
                return { used: true, where: 'выход сплиттера' };
            }
        }
        if (t === 'olt') {
            const incomingFiber = obj.properties.get('incomingFiber');
            if (incomingFiber && incomingFiber.cableId === cableId && incomingFiber.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'oltIncoming' && exclude.oltId === uid) continue;
                if (exclude && exclude.type === 'oltPort') continue;
                if (isGponBranchAssignmentExclude(exclude)) continue;
                return { used: true, where: 'приход OLT' };
            }
            const portAssignments = obj.properties.get('portAssignments') || {};
            for (const portKey in portAssignments) {
                const a = portAssignments[portKey];
                if (a && a.cableId === cableId && a.fiberNumber === fiberNumber) {
                    if (exclude && exclude.type === 'oltPort' && exclude.oltId === uid && exclude.portNumber === parseInt(portKey, 10)) continue;
                    if (exclude && exclude.type === 'oltPort' && (a.crossId == null || a.crossPort == null)) continue;
                    if (exclude && exclude.type === 'splitterInput') continue;
                    if (isGponBranchAssignmentExclude(exclude)) continue;
                    var portLblUsed = getOltPortLabel(obj, parseInt(portKey, 10));
                    return { used: true, where: portLblUsed ? formatOltPortDisplay(parseInt(portKey, 10), portLblUsed) : 'порт OLT' };
                }
            }
        }
        if (t === 'onu') {
            const onuIncoming = obj.properties.get('incomingFiber');
            if (onuIncoming && onuIncoming.cableId === cableId && onuIncoming.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'onuConn' && exclude.onuId === uid) continue;
                if (isOltFiberAssignmentExclude(exclude)) continue;
                return { used: true, where: 'подключение к ONU' };
            }
        }
        if (t === 'mediaConverter') {
            const mcIncoming = obj.properties.get('incomingFiber');
            if (mcIncoming && mcIncoming.cableId === cableId && mcIncoming.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'mediaConverterConn' && exclude.mediaConverterId === uid) continue;
                return { used: true, where: 'подключение к медиаконвертеру' };
            }
        }
        if (t === 'radioBridge') {
            const rbIncoming = obj.properties.get('incomingFiber');
            if (rbIncoming && rbIncoming.cableId === cableId && rbIncoming.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'radioBridgeConn' && exclude.radioBridgeId === uid) continue;
                return { used: true, where: 'подключение к радиомосту' };
            }
        }
        if (t === 'splitter') {
            const inputFiber = obj.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === cableId && inputFiber.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'splitterInput' && exclude.splitterId === uid) continue;
                if (exclude && exclude.type === 'oltPort') continue;
                if (isGponBranchAssignmentExclude(exclude)) continue;
                return { used: true, where: 'вход сплиттера' };
            }
            const outputConnections = obj.properties.get('outputConnections') || [];
            for (let oi = 0; oi < outputConnections.length; oi++) {
                const out = outputConnections[oi];
                if (out && out.cableId === cableId && out.fiberNumber === fiberNumber) {
                    if (exclude && exclude.type === 'splitterOutput' && exclude.splitterId === uid && exclude.outputIndex === oi) continue;
                    return { used: true, where: 'выход сплиттера' };
                }
            }
        }
    }
    return { used: false };
}

function applySerializedUndergroundToCable(cable, item, pointsArr) {
    if (!cable || !item || !cable.properties) return;
    if (isCopperCableType(cable.properties.get('cableType'))) return;
    if (!Array.isArray(item.undergroundSpans) || !item.undergroundSpans.length) return;
    cable.properties.set('undergroundSpans', window.CableUnderground
        ? CableUnderground.cloneSpans(item.undergroundSpans)
        : item.undergroundSpans);
    var pts = pointsArr || cable.properties.get('points');
    if (window.CableUnderground && Array.isArray(pts) && pts.length >= 2) {
        pts = CableUnderground.ensureRouteIncludesUndergroundManholes(pts, item.undergroundSpans);
        cable.properties.set('points', pts);
        cable.properties.set('from', pts[0]);
        cable.properties.set('to', pts[pts.length - 1]);
    }
    applyCableRouteAndOverlays(cable, pts);
}

function repairCablesAfterImport() {
    if (!objects || !objects.length || !myMap) return;
    objects.forEach(function (cable) {
        if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return;
        try {
            if (myMap.geoObjects.indexOf(cable) === -1) myMap.geoObjects.add(cable);
        } catch (eAdd) {}
        var points = cable.properties.get('points');
        var spans = cable.properties.get('undergroundSpans') || [];
        if (window.CableUnderground && spans.length && Array.isArray(points) && points.length >= 2) {
            points = CableUnderground.ensureRouteIncludesUndergroundManholes(points, spans);
            cable.properties.set('points', points);
            cable.properties.set('from', points[0]);
            cable.properties.set('to', points[points.length - 1]);
            applyCableRouteAndOverlays(cable, points);
        } else if (cable.geometry && Array.isArray(points) && points.length >= 2) {
            try {
                var lin = points.map(function (p) {
                    return p && p.geometry ? p.geometry.getCoordinates() : null;
                }).filter(function (c) { return c && c.length >= 2; });
                if (lin.length >= 2) cable.geometry.setCoordinates(lin);
            } catch (eLin) {}
        }
        if (cable.options) {
            try {
                var op = cable.options.get('strokeOpacity');
                if (op === 0 || op == null) cable.options.set('strokeOpacity', 0.8);
            } catch (eOp) {}
        }
        if (window.CableUnderground) {
            try { CableUnderground.syncAerialOverlayStroke(cable); } catch (eSyn) {}
        }
    });
}

function validateAndFixCableGeometryOnLoad() {
    if (!objects || !objects.length) return;
    var cables = objects.filter(function(o) {
        return o.properties && o.properties.get('type') === 'cable' && o.geometry;
    });
    cables.forEach(function(cable) {
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        var points = cable.properties.get('points');
        var ugSpans = cable.properties.get('undergroundSpans') || [];
        if (window.CableUnderground && ugSpans.length && Array.isArray(points) && points.length >= 2) {
            try {
                points = CableUnderground.ensureRouteIncludesUndergroundManholes(points, ugSpans);
                cable.properties.set('points', points);
                cable.properties.set('from', points[0]);
                cable.properties.set('to', points[points.length - 1]);
                CableUnderground.applyCableRouteGeometry(cable, points);
                CableUnderground.refreshCableUndergroundOverlays(cable);
            } catch (eUg) {}
            return;
        }
        var coords = [];
        if (Array.isArray(points) && points.length >= 2) {
            coords = points
                .map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; })
                .filter(function(c) { return c && Array.isArray(c) && c.length >= 2; });
        }
        if (coords.length < 2 && fromObj && toObj && fromObj.geometry && toObj.geometry) {
            try {
                var fc = fromObj.geometry.getCoordinates();
                var tc = toObj.geometry.getCoordinates();
                if (fc && tc) coords = [fc, tc];
            } catch (e) {}
        }
        if (coords.length >= 2) {
            try {
                cable.geometry.setCoordinates(coords);
            } catch (e) {}
        }
    });
}

function getCablesTouchingObject(obj) {
    if (!obj) return [];
    var out = [];
    var uid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(obj) : null;
    var scan = objects;
    if (typeof MapPerf !== 'undefined' && MapPerf.getObjectsByType) {
        var typed = MapPerf.getObjectsByType('cable');
        if (Array.isArray(typed)) scan = typed;
    }
    for (var i = 0; i < scan.length; i++) {
        var cable = scan[i];
        if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') continue;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === obj || to === obj) {
            out.push(cable);
            continue;
        }
        if (uid && ((from && getObjectUniqueId(from) === uid) || (to && getObjectUniqueId(to) === uid))) {
            out.push(cable);
            continue;
        }
        var points = cable.properties.get('points');
        if (!Array.isArray(points)) continue;
        if (points.indexOf(obj) !== -1) {
            out.push(cable);
            continue;
        }
        if (uid) {
            for (var pi = 0; pi < points.length; pi++) {
                if (points[pi] && getObjectUniqueId(points[pi]) === uid) {
                    out.push(cable);
                    break;
                }
            }
        }
    }
    return out;
}

function updateConnectedCables(obj) {
    const cables = getCablesTouchingObject(obj);

    cables.forEach(cable => {
        if (!cable.geometry) return;
        var points = cable.properties.get('points');
        if (Array.isArray(points) && points.length > 2) {
            try {
                if (window.CableUnderground) {
                    CableUnderground.applyCableRouteGeometry(cable, points);
                    CableUnderground.refreshCableUndergroundOverlays(cable);
                } else {
                    var coords = points
                        .map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; })
                        .filter(function(c) { return c && Array.isArray(c) && c.length >= 2; });
                    if (coords.length >= 2) cable.geometry.setCoordinates(coords);
                }
            } catch (e) {}
        } else {
            var fromObj = cable.properties.get('from');
            var toObj = cable.properties.get('to');
            if (!fromObj || !toObj || !fromObj.geometry || !toObj.geometry) return;
            try {
                var fromCoords = fromObj.geometry.getCoordinates();
                var toCoords = toObj.geometry.getCoordinates();
                if (fromCoords && toCoords) cable.geometry.setCoordinates([fromCoords, toCoords]);
            } catch (e) {}
        }
    });
}

function getCableColor(type) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getCableMapColor(type);
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var meta = window.MapLegendConfig.getCableMeta(type);
        if (meta) return meta.color;
    }
    return '#64748b';
}

function getCableWidth(type) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getCableMapWidth(type);
    return 2;
}

function getCableDescription(type, cable) {
    if (cable && cable.properties && window.FiberCableConfig) {
        return window.FiberCableConfig.getCableLabel(cable);
    }
    if (window.FiberCableConfig && window.FiberCableConfig.isOpticalCableType(type)) {
        return window.FiberCableConfig.getCableLabel(type);
    }
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var metaD = window.MapLegendConfig.getCableMeta(type);
        if (metaD) return metaD.label;
    }
    if (type === 'copper') return 'Медный кабель';
    return 'Кабель';
}

function getCableEndpointDisplayName(obj) {
    if (!obj || !obj.properties) return '';
    var name = String(obj.properties.get('name') || '').trim();
    if (name) return name;
    var type = obj.properties.get('type');
    if (typeof getObjectTypeLabel === 'function') {
        var typeLabel = getObjectTypeLabel(type);
        if (typeLabel) return typeLabel;
    }
    return 'Объект';
}

function buildCableRouteDisplayName(cable) {
    if (!cable || !cable.properties) return '';
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    if (!from || !to) return '';
    var fromLabel = getCableEndpointDisplayName(from);
    var toLabel = getCableEndpointDisplayName(to);
    if (!fromLabel && !toLabel) return '';
    return fromLabel + ' → ' + toLabel;
}

/** Человекочитаемое имя кабеля: своё название, «Кабель N» в кроссе/муфте, маршрут или тип ВОЛС. */
function resolveCableDisplayNameById(cableId, opts) {
    opts = opts || {};
    if (!cableId) return 'Кабель';
    var cable = typeof objects !== 'undefined' ? objects.find(function(o) {
        return o && o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
    }) : null;
    if (!cable) {
        return opts.allowUidFallback ? String(cableId) : String(cableId).substring(0, 12) + '…';
    }
    var cableName = cable.properties.get('cableName');
    if (cableName && String(cableName).trim()) return String(cableName).trim();

    if (opts.hostObj && typeof getConnectedCables === 'function') {
        var connected = getConnectedCables(opts.hostObj);
        for (var i = 0; i < connected.length; i++) {
            if (connected[i].properties.get('uniqueId') === cableId) {
                if (opts.shortIndex) return 'К' + (i + 1);
                return 'Кабель ' + (i + 1);
            }
        }
    }

    if (opts.preferRoute !== false) {
        var route = buildCableRouteDisplayName(cable);
        if (route) return route;
    }

    return getCableDescription(cable.properties.get('cableType'), cable);
}

function isCopperCableType(cableType) {
    return cableType === 'copper';
}

function isOpticalCableType(cableType) {
    return window.FiberCableConfig
        ? window.FiberCableConfig.isOpticalCableType(cableType)
        : (cableType && cableType !== 'copper');
}

function buildSwitchPortTypesArray(count, defaultKind) {
    var arr = [];
    var k = defaultKind || (typeof getSwitchPortDefaultKind === 'function' ? getSwitchPortDefaultKind() : 'RJ45 1000Base-T (Gigabit, порт G)');
    for (var i = 0; i < count; i++) arr.push(k);
    return arr;
}

/** Порт коммутатора под оптику с кросса: SFP/QSFP/CFP/FC/Комбо и т.п. */
function isSwitchPortSfpFiberType(portTypeLabel) {
    if (typeof isSwitchPortOpticalFiberType === 'function') {
        return isSwitchPortOpticalFiberType(portTypeLabel);
    }
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    var L = portTypeLabel.trim();
    if (!L || L === 'Консоль' || L === 'Uplink/stack') return false;
    if (L.indexOf('Комбо') === 0) return true;
    if (L.indexOf('RJ45') === 0) return false;
    if (L.indexOf('GBIC') === 0) return true;
    if (L.indexOf('SFP') === 0) return true;
    if (L.indexOf('XFP') === 0) return true;
    if (L.indexOf('X2') === 0) return true;
    if (L.indexOf('XENPAK') === 0) return true;
    if (L.indexOf('CFP') === 0) return true;
    if (L.indexOf('QSFP') === 0) return true;
    if (L.indexOf('OSFP') === 0) return true;
    if (L.indexOf('FC') === 0 || L.indexOf('Fibre Channel') !== -1) return true;
    return false;
}

/** Медный кабель: RJ45 и комбо RJ45/SFP. */
function isSwitchPortCopperCapable(portTypeLabel) {
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    var L = portTypeLabel.trim();
    if (!L || L === 'Консоль' || L === 'Uplink/stack') return false;
    if (L.indexOf('Комбо') === 0) return true;
    if (L.indexOf('RJ45') === 0) return true;
    return false;
}

function getNodeAttachedSwitches(node) {
    if (!node || !node.properties || node.properties.get('type') !== 'node') return [];
    var a = node.properties.get('attachedSwitches');
    return Array.isArray(a) ? a : [];
}

function getAttachedSwitchPortStats(swRow) {
    var pts = (swRow && swRow.switchPortTypes) ? swRow.switchPortTypes : [];
    var total = pts.length;
    var busy = 0;
    for (var i = 1; i <= total; i++) {
        if (isAttachedSwitchPortOccupied(swRow, i)) busy++;
    }
    return { total: total, busy: busy, free: Math.max(0, total - busy) };
}

function getAttachedSwitchPortLabels(swRow) {
    var pl = swRow && swRow.portLabels;
    return (pl && typeof pl === 'object') ? pl : {};
}

function isAttachedSwitchPortManuallyBusy(swRow, portNum) {
    var mu = swRow && swRow.manualPortUsage;
    return !!(mu && mu[String(portNum)]);
}

function isAttachedSwitchPortOccupied(swRow, portNum) {
    if (!swRow || portNum == null) return false;
    var p = String(portNum);
    var usageN = swRow.copperPortUsage || {};
    var fiberUsageN = swRow.fiberPortUsage || {};
    return !!(usageN[p] || fiberUsageN[p] || isAttachedSwitchPortManuallyBusy(swRow, portNum));
}

function getNodeSwitchesSummary(node) {
    var list = getNodeAttachedSwitches(node);
    var totalPorts = 0;
    var busyPorts = 0;
    list.forEach(function(sw) {
        var s = getAttachedSwitchPortStats(sw);
        totalPorts += s.total;
        busyPorts += s.busy;
    });
    return { swCount: list.length, totalPorts: totalPorts, busyPorts: busyPorts };
}
