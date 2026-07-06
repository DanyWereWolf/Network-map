/**
 * Схема жил: canvas, встроенные сплиттеры, раскладка.
 */
function isObjectOnMap(obj) {
    if (obj && obj._embedded) return true;
    return !!(obj && objects && objects.indexOf(obj) !== -1);
}

function refreshFiberHostModal(hostObj) {
    if (!hostObj) return;
    if (typeof refreshObjectModal === 'function') refreshObjectModal(hostObj);
    else if (typeof showObjectInfo === 'function') showObjectInfo(hostObj);
}

function resolveSplitterObject(splitterId) {
    if (!splitterId) return null;
    if (window.EmbeddedSplitters) {
        var embedded = EmbeddedSplitters.resolve(splitterId);
        if (embedded) return embedded;
    }
    return objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'splitter' &&
            (getObjectUniqueId(o) === splitterId || o.properties.get('uniqueId') === splitterId);
    }) || null;
}

function isEmbeddedSplitterId(splitterId) {
    if (!splitterId || !window.EmbeddedSplitters || !EmbeddedSplitters.findRecord) return false;
    return !!EmbeddedSplitters.findRecord(splitterId);
}

function hasMapGeometry(obj) {
    return !!(obj && obj.geometry && typeof obj.geometry.getCoordinates === 'function');
}

/** Сплиттер на карте (не embedded в муфте/кроссе) с координатами для линии связи. */
function resolveMapSplitterForConnectionLine(splitterId) {
    if (!splitterId || isEmbeddedSplitterId(splitterId)) return null;
    var splitterObj = getMapObjectByUid(splitterId, 'splitter');
    if (!hasMapGeometry(splitterObj)) return null;
    return splitterObj;
}

var schemeSplitterWirePick = null;
var schemeSplitterOutputPick = null;
var schemeCrossPortPick = null;

function isSameSchemeHost(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var ua = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(a) : (a.properties && a.properties.get('uniqueId'));
    var ub = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(b) : (b.properties && b.properties.get('uniqueId'));
    return !!(ua && ub && ua === ub);
}

function resolveSchemePickHost(pick) {
    if (!pick) return null;
    if (pick.hostObj && pick.hostObj.properties) return pick.hostObj;
    var uid = pick.hostUid || (pick.hostObj && pick.hostObj.properties && pick.hostObj.properties.get('uniqueId'));
    if (!uid || !objects) return pick.hostObj || null;
    return objects.find(function(o) {
        return o && o.properties && getObjectUniqueId(o) === uid && isFiberHostType(o.properties.get('type'));
    }) || pick.hostObj || null;
}

function schemePickMatchesHost(pick, hostObj) {
    if (!pick || !hostObj) return false;
    var resolved = resolveSchemePickHost(pick);
    return isSameSchemeHost(resolved || pick.hostObj, hostObj);
}

function rememberSchemePickHost(pick, hostObj) {
    if (!pick || !hostObj) return pick;
    pick.hostObj = hostObj;
    pick.hostUid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(hostObj) : hostObj.properties.get('uniqueId');
    return pick;
}

function findSplitterOutputOnCrossPort(hostObj, portNumber, excludeSplitterId, excludeOutputIndex) {
    if (!hostObj || portNumber == null || !window.EmbeddedSplitters) return null;
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber)) return null;
    var hostUid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(hostObj) : null;
    var list = EmbeddedSplitters.getList(hostObj);
    for (var i = 0; i < list.length; i++) {
        var rec = list[i];
        if (!rec) continue;
        var outs = rec.outputConnections || [];
        for (var oi = 0; oi < outs.length; oi++) {
            var out = outs[oi];
            if (!out || out.crossPort == null) continue;
            if (parseInt(out.crossPort, 10) !== portNumber) continue;
            if (excludeSplitterId && rec.id === excludeSplitterId && excludeOutputIndex === oi) continue;
            if (out.hostId && hostUid && out.hostId !== hostUid) continue;
            return {
                splitterId: rec.id,
                splitterName: rec.name || 'Сплиттер',
                outputIndex: oi,
                rec: rec
            };
        }
    }
    return null;
}

/** Логическая жила на порту от выхода сплиттера (корневая входная жила сплиттера). */
function resolveSplitterCrossPortLogicalFiber(crossObj, portNumber) {
    if (!crossObj || portNumber == null) return null;
    var hit = findSplitterOutputOnCrossPort(crossObj, portNumber);
    if (!hit) return null;
    var facade = resolveSplitterObject(hit.splitterId);
    if (!facade) return null;
    syncSplitterInputFromHost(facade);
    var root = (hit.rec && typeof resolveSplitterTableRootFiber === 'function')
        ? resolveSplitterTableRootFiber(crossObj, hit.rec)
        : getSplitterRootInputFiber(facade);
    if (!root || !root.cableId || root.fiberNumber == null) return null;
    return {
        cableId: root.cableId,
        fiberNumber: root.fiberNumber,
        fiberKey: root.cableId + '-' + root.fiberNumber,
        splitterId: hit.splitterId,
        splitterName: hit.splitterName,
        outputIndex: hit.outputIndex,
        crossPort: parseInt(portNumber, 10),
        viaSplitter: true
    };
}

function findCrossPortForLogicalFiber(crossObj, cableId, fiberNumber, preferPort) {
    if (!crossObj || !cableId || fiberNumber == null) return null;
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    var direct = fiberPorts[cableId + '-' + fiberNumber];
    if (direct != null && String(direct).trim() !== '') {
        var portNum = parseInt(direct, 10);
        return isNaN(portNum) ? null : portNum;
    }
    preferPort = preferPort != null ? parseInt(preferPort, 10) : null;
    if (!isNaN(preferPort) && preferPort > 0) {
        var prefLogical = resolveSplitterCrossPortLogicalFiber(crossObj, preferPort);
        if (prefLogical && prefLogical.cableId === cableId && prefLogical.fiberNumber === fiberNumber) {
            return preferPort;
        }
    }
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    for (var p = 1; p <= crossPorts; p++) {
        var logical = resolveSplitterCrossPortLogicalFiber(crossObj, p);
        if (logical && logical.cableId === cableId && logical.fiberNumber === fiberNumber) return p;
    }
    return null;
}

function findSplitterOutputAtHostByLogicalFiber(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null || !isCrossLikeHostType(hostObj.properties.get('type'))) return null;
    if (!window.EmbeddedSplitters) return null;
    var crossPorts = Math.max(1, parseInt(hostObj.properties.get('crossPorts'), 10) || 24);
    for (var p = 1; p <= crossPorts; p++) {
        var hit = findSplitterOutputOnCrossPort(hostObj, p);
        if (!hit) continue;
        var logical = resolveSplitterCrossPortLogicalFiber(hostObj, p);
        if (!logical || logical.cableId !== cableId || logical.fiberNumber !== fiberNumber) continue;
        var facadeProbe = resolveSplitterObject(hit.splitterId);
        if (facadeProbe) {
            syncSplitterInputFromHost(facadeProbe);
            var rootProbe = getSplitterRootInputFiber(facadeProbe);
            if (rootProbe && rootProbe.cableId === cableId && rootProbe.fiberNumber === fiberNumber) continue;
        }
        var facade = resolveSplitterObject(hit.splitterId);
        if (!facade) continue;
        return {
            splitterObj: facade,
            splitterId: hit.splitterId,
            outputIndex: hit.outputIndex,
            conn: (facade.properties.get('outputConnections') || [])[hit.outputIndex],
            viaCrossPort: true,
            crossPort: p
        };
    }
    return null;
}

var EMBEDDED_SPLITTER_RATIOS = [2, 4, 8, 16, 32, 64];
var FIBER_SCHEME_CANVAS = {
    WIDTH_MIN: 760,
    WIDTH_MAX: 2400,
    HEIGHT_MIN: 280,
    HEIGHT_MAX: 3200
};
var FIBER_SCHEME_CANVAS_PRESETS = [
    { id: 's', label: 'S', width: 960, height: 520 },
    { id: 'm', label: 'M', width: 1200, height: 720 },
    { id: 'l', label: 'L', width: 1600, height: 960 },
    { id: 'xl', label: 'XL', width: 2000, height: 1200 }
];

function getFiberSchemeCanvasStored(hostObj) {
    if (!hostObj || !hostObj.properties) return { width: 0, height: 0 };
    if (hostObj.properties.get('fiberSchemeCanvasAuto')) return { width: 0, height: 0 };
    var w = parseInt(hostObj.properties.get('fiberSchemeCanvasWidth'), 10);
    var h = parseInt(hostObj.properties.get('fiberSchemeCanvasHeight'), 10);
    return {
        width: (!isNaN(w) && w > 0) ? w : 0,
        height: (!isNaN(h) && h > 0) ? h : 0
    };
}

function estimateFiberSchemeMainWidth() {
    var maxW = 1400;
    var modal = document.getElementById('infoModal');
    if (modal && modal.classList.contains('fiber-management-modal-open')) {
        var main = modal.querySelector('.fiber-ws-main');
        if (main && main.clientWidth > 240) return Math.min(maxW, main.clientWidth - 12);
    }
    if (window.innerWidth >= 901) {
        return Math.min(maxW, Math.max(480, window.innerWidth - 320 - 40));
    }
    return Math.min(maxW, Math.max(320, window.innerWidth - 20));
}

function getFiberSchemeLayoutOpts(cablesData, maxFibers) {
    var compact = maxFibers <= 16 && cablesData.length <= 4;
    return {
        rowHeight: compact ? 15 : 17,
        sidePad: compact ? 10 : 12,
        panelW: compact ? 176 : 192,
        fiberFanLen: compact ? 34 : 38,
        blockGap: compact ? 8 : 12,
        labelH: compact ? 22 : 24,
        minSvgHeight: compact ? 96 : 120
    };
}

function computeFiberSchemeFitZoom(viewport, svg) {
    var svgW = parseFloat(svg.getAttribute('width')) || 800;
    var svgH = parseFloat(svg.getAttribute('height')) || 400;
    var pad = 12;
    var vw = Math.max(120, viewport.clientWidth - pad);
    var vh = Math.max(120, viewport.clientHeight - pad);
    var scale = Math.min(vw / svgW, vh / svgH);
    return Math.max(0.3, Math.min(2, Math.round(scale * 20) / 20));
}

function resolveFiberSchemeCanvasSize(hostObj, autoWidth, layoutHeight, layoutMinWidth) {
    var stored = getFiberSchemeCanvasStored(hostObj);
    var minW = layoutMinWidth || FIBER_SCHEME_CANVAS.WIDTH_MIN;
    var w = Math.max(autoWidth, minW);
    var h = layoutHeight;
    if (stored.width > 0) w = Math.max(stored.width, minW);
    if (stored.height > 0) h = Math.max(stored.height, layoutHeight);
    w = Math.min(FIBER_SCHEME_CANVAS.WIDTH_MAX, Math.max(minW, w));
    var hFloor = stored.height > 0 ? FIBER_SCHEME_CANVAS.HEIGHT_MIN : Math.max(100, layoutHeight);
    h = Math.min(FIBER_SCHEME_CANVAS.HEIGHT_MAX, Math.max(hFloor, h));
    return { width: w, height: h, layoutHeight: layoutHeight, layoutWidth: autoWidth };
}

function applyFiberSchemeCanvasSize(hostObj, width, height) {
    if (!hostObj || !hostObj.properties) return;
    width = parseInt(width, 10);
    height = parseInt(height, 10);
    var autoWidth = isNaN(width) || width < FIBER_SCHEME_CANVAS.WIDTH_MIN;
    var autoHeight = isNaN(height) || height < FIBER_SCHEME_CANVAS.HEIGHT_MIN;
    if (autoWidth && autoHeight) {
        hostObj.properties.set('fiberSchemeCanvasAuto', true);
        hostObj.properties.unset('fiberSchemeCanvasWidth');
        hostObj.properties.unset('fiberSchemeCanvasHeight');
    } else {
        hostObj.properties.unset('fiberSchemeCanvasAuto');
        if (!autoWidth) {
            hostObj.properties.set('fiberSchemeCanvasWidth', Math.min(FIBER_SCHEME_CANVAS.WIDTH_MAX, width));
        } else {
            hostObj.properties.unset('fiberSchemeCanvasWidth');
        }
        if (!autoHeight) {
            hostObj.properties.set('fiberSchemeCanvasHeight', Math.min(FIBER_SCHEME_CANVAS.HEIGHT_MAX, height));
        } else {
            hostObj.properties.unset('fiberSchemeCanvasHeight');
        }
    }
    if (window.EmbeddedSplitters && typeof EmbeddedSplitters.ensureAllInBounds === 'function') {
        var svg = document.getElementById('fiber-connections-svg');
        var svgW = svg ? (parseFloat(svg.getAttribute('width')) || 800) : 800;
        var svgH = svg ? (parseFloat(svg.getAttribute('height')) || 400) : 400;
        EmbeddedSplitters.ensureAllInBounds(hostObj, svgW, svgH);
    }
    var pos = getFiberSchemeScrollPos();
    var z = readFiberSchemeZoomFromDom();
    if (z != null) hostObj.properties.set('fiberSchemeViewZoom', Math.round(Math.max(0.3, Math.min(2, z)) * 100) / 100);
    hostObj.properties.set('fiberSchemeScrollTop', Math.max(0, Math.round(pos.scheme) || 0));
    hostObj.properties.set('fiberSchemeScrollLeft', Math.max(0, Math.round(pos.schemeLeft) || 0));
    hostObj.properties.set('fiberSchemeTableScrollTop', Math.max(0, Math.round(pos.table) || 0));
    savedFiberConnectionsScrollPos = pos;
    saveData({ fiberSchemeViewOnly: true, object: hostObj, syncImmediate: true });
    refreshFiberHostModal(hostObj);
}

function bindFiberSchemeCanvasHandlers(hostObj) {
    if (!hostObj || !isEditMode) return;
    var widthEl = document.getElementById('fiber-scheme-canvas-width');
    var heightEl = document.getElementById('fiber-scheme-canvas-height');
    var applyBtn = document.getElementById('fiber-scheme-canvas-apply');
    var autoBtn = document.getElementById('fiber-scheme-canvas-auto');
    function readAndApply() {
        applyFiberSchemeCanvasSize(hostObj, widthEl ? widthEl.value : 0, heightEl ? heightEl.value : 0);
    }
    if (applyBtn) applyBtn.addEventListener('click', readAndApply);
    if (autoBtn) {
        autoBtn.addEventListener('click', function() {
            if (widthEl) widthEl.value = '';
            if (heightEl) heightEl.value = '';
            applyFiberSchemeCanvasSize(hostObj, 0, 0);
        });
    }
    document.querySelectorAll('.fiber-scheme-canvas-preset').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var w = parseInt(btn.getAttribute('data-canvas-w'), 10);
            var h = parseInt(btn.getAttribute('data-canvas-h'), 10);
            if (widthEl) widthEl.value = String(w);
            if (heightEl) heightEl.value = String(h);
            applyFiberSchemeCanvasSize(hostObj, w, h);
        });
    });
    [widthEl, heightEl].forEach(function(el) {
        if (!el) return;
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); readAndApply(); }
        });
    });
}

function switchFiberWorkspaceToSchemeTab() {
    var root = document.querySelector('.fiber-workspace');
    if (!root) return;
    var tab = root.querySelector('.fiber-ws-tab[data-tab="scheme"]');
    if (tab) tab.click();
}

function clearSchemeSplitterWirePick() {
    schemeSplitterWirePick = null;
    updateSchemeSplitterPickUI();
}

function clearSchemeSplitterOutputPick() {
    schemeSplitterOutputPick = null;
    updateSchemeSplitterPickUI();
}

function clearSchemeCrossPortPick() {
    schemeCrossPortPick = null;
    updateSchemeCrossPortPickUI();
}

function clearAllSchemeSplitterPicks() {
    var hadFiberPick = schemeSplitterWirePick && schemeSplitterWirePick.cableId;
    schemeSplitterWirePick = null;
    schemeSplitterOutputPick = null;
    schemeCrossPortPick = null;
    if (typeof setSchemeCrossPortLinkMode === 'function') setSchemeCrossPortLinkMode(false);
    updateSchemeSplitterPickUI();
    updateSchemeCrossPortPickUI();
    if (hadFiberPick && selectedFiberForConnection) {
        selectedFiberForConnection = null;
        updateFiberSelectionUI();
    }
}

function findFiberKeysByCrossPort(fiberPorts, portNumber) {
    if (!fiberPorts || portNumber == null) return [];
    var portStr = String(portNumber);
    return Object.keys(fiberPorts).filter(function(key) {
        return String(fiberPorts[key]) === portStr;
    });
}

function findFiberKeyByCrossPort(fiberPorts, portNumber) {
    var keys = findFiberKeysByCrossPort(fiberPorts, portNumber);
    return keys.length ? keys[0] : null;
}

function parseFiberKey(fiberKey) {
    if (!fiberKey) return null;
    var lastDash = fiberKey.lastIndexOf('-');
    if (lastDash < 0) return null;
    var fiberNumber = parseInt(fiberKey.substring(lastDash + 1), 10);
    if (isNaN(fiberNumber)) return null;
    return { cableId: fiberKey.substring(0, lastDash), fiberNumber: fiberNumber };
}

function tryAssignFiberToCrossPort(crossObj, cableId, fiberNumber, portNumber) {
    if (!crossObj || !isCrossLikeHostType(crossObj.properties.get('type')) || !cableId || fiberNumber == null) return false;
    if (typeof isFiberSplicedAtHost === 'function' && isFiberSplicedAtHost(crossObj, cableId, fiberNumber)) {
        if (typeof showWarning === 'function') showWarning('Сращённые жилы не занимают порты кросса.', 'Порт недоступен');
        return false;
    }
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > crossPorts) return false;
    if (typeof isCrossPortPatched === 'function' && isCrossPortPatched(crossObj, portNumber)) {
        if (typeof showWarning === 'function') showWarning('Порт занят кроссировкой с другим кроссом.', 'Порт недоступен');
        return false;
    }
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    var fiberKey = cableId + '-' + fiberNumber;
    var occupiedKey = findFiberKeyByCrossPort(fiberPorts, portNumber);
    if (occupiedKey && occupiedKey !== fiberKey) {
        var prev = parseFiberKey(occupiedKey);
        if (prev) updateFiberPort(crossObj, prev.cableId, prev.fiberNumber, null);
    }
    updateFiberPort(crossObj, cableId, fiberNumber, String(portNumber));
    saveData();
    if (typeof showSuccess === 'function') {
        showSuccess('Жила ' + fiberNumber + ' помещена в порт ' + portNumber + '.', 'Кросс');
    }
    refreshFiberHostModal(crossObj);
    return true;
}

function tryDisconnectCrossPort(crossObj, portNumber) {
    if (!crossObj || !isCrossLikeHostType(crossObj.properties.get('type'))) return false;
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    var fiberKey = findFiberKeyByCrossPort(fiberPorts, portNumber);
    if (!fiberKey) return false;
    var parsed = parseFiberKey(fiberKey);
    if (parsed) updateFiberPort(crossObj, parsed.cableId, parsed.fiberNumber, null);
    saveData();
    if (typeof showSuccess === 'function') {
        showSuccess('Порт ' + portNumber + ' освобождён.', 'Кросс');
    }
    refreshFiberHostModal(crossObj);
    return true;
}

function startSchemeCrossPortPick(hostObj, portNumber) {
    if (!hostObj || !isCrossLikeHostType(hostObj.properties.get('type')) || portNumber == null) return;
    clearSchemeSplitterWirePick();
    clearSchemeSplitterOutputPick();
    resetFiberSelection();
    schemeCrossPortPick = { hostObj: hostObj, portNumber: parseInt(portNumber, 10) };
    updateSchemeCrossPortPickUI();
    updateSchemeSplitterPickUI();
    switchFiberWorkspaceToSchemeTab();
}

function handleSchemeCrossPortClick(crossObj, portNumber) {
    if (!crossObj || !isEditMode || portNumber == null) return;
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber)) return;
    if (schemeSplitterOutputPick && schemePickMatchesHost(schemeSplitterOutputPick, crossObj)) {
        rememberSchemePickHost(schemeSplitterOutputPick, crossObj);
        tryConnectSchemeSplitterOutputToCrossPort(crossObj, portNumber);
        return;
    }
    if (typeof isCrossPortPatched === 'function' && isCrossPortPatched(crossObj, portNumber)) {
        var fiberPortsPatch = crossObj.properties.get('fiberPorts') || {};
        if (findFiberKeysByCrossPort(fiberPortsPatch, portNumber).length) {
            tryDisconnectCrossPort(crossObj, portNumber);
            if (typeof setSchemeCrossPortLinkMode === 'function') setSchemeCrossPortLinkMode(false);
            return;
        }
        if (typeof disconnectCrossPort === 'function' && disconnectCrossPort(crossObj, portNumber)) {
            if (typeof showSuccess === 'function') showSuccess('Кроссировка порта ' + portNumber + ' отключена.', 'Кроссировка');
            if (typeof refreshFiberHostModal === 'function') refreshFiberHostModal(crossObj);
        }
        if (typeof setSchemeCrossPortLinkMode === 'function') setSchemeCrossPortLinkMode(false);
        return;
    }
    if (typeof schemeCrossPortLinkMode !== 'undefined' && schemeCrossPortLinkMode) {
        if (findSplitterOutputOnCrossPort(crossObj, portNumber)) {
            if (typeof showWarning === 'function') {
                showWarning('Порт ' + portNumber + ' подключён через сплиттер. Кроссировку настройте кнопкой «⇄ Кросс» в таблице.', 'Порт сплиттера');
            }
            return;
        }
        if (typeof startCrossPortPatchFromScheme === 'function') startCrossPortPatchFromScheme(crossObj, portNumber);
        return;
    }
    if (selectedFiberForConnection) {
        if (tryAssignFiberToCrossPort(crossObj, selectedFiberForConnection.cableId, selectedFiberForConnection.fiberNumber, portNumber)) {
            resetFiberSelection();
            clearSchemeCrossPortPick();
        }
        return;
    }
    if (schemeCrossPortPick && schemePickMatchesHost(schemeCrossPortPick, crossObj) && schemeCrossPortPick.portNumber === portNumber) {
        clearSchemeCrossPortPick();
        return;
    }
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    if (!findFiberKeysByCrossPort(fiberPorts, portNumber).length) {
        var spOnPort = findSplitterOutputOnCrossPort(crossObj, portNumber);
        if (spOnPort) {
            if (typeof showWarning === 'function') {
                showWarning('Порт ' + portNumber + ' — выход сплиттера. Кроссировку настройте кнопкой «⇄ Кросс» в таблице. Отключение — ✕ у выхода.', 'Порт сплиттера');
            }
            clearSchemeCrossPortPick();
            return;
        }
    }
    if (findFiberKeysByCrossPort(fiberPorts, portNumber).length) {
        tryDisconnectCrossPort(crossObj, portNumber);
        clearSchemeCrossPortPick();
        return;
    }
    startSchemeCrossPortPick(crossObj, portNumber);
}

function updateSchemeCrossPortPickUI() {
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--pick').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--pick');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--wire-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--wire-target');
    });
    document.querySelectorAll('.fiber-connections-container .fiber-item.fiber-item--cross-port-target').forEach(function(el) {
        el.classList.remove('fiber-item--cross-port-target');
    });
    var bar = document.getElementById('fiber-scheme-wire-bar');
    var crossObj = currentModalObject && isCrossLikeHostType(currentModalObject.properties.get('type')) ? currentModalObject : null;
    if (schemeCrossPortPick && schemeCrossPortPick.hostObj && !schemeSplitterWirePick && !schemeSplitterOutputPick) {
        if (bar) {
            bar.style.display = 'flex';
            bar.innerHTML = '<span class="fiber-selection-text fiber-scheme-wire-bar-text">Порт <strong>' + schemeCrossPortPick.portNumber + '</strong>: кликните <strong>жилу на схеме или в таблице</strong> для назначения на порт.</span>' +
                '<button type="button" class="fiber-selection-cancel" id="fiberSchemeCrossPortCancelBtn">Отмена</button>';
            var cancelBtn = document.getElementById('fiberSchemeCrossPortCancelBtn');
            if (cancelBtn) cancelBtn.addEventListener('click', clearSchemeCrossPortPick);
        }
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port[data-cross-port="' + schemeCrossPortPick.portNumber + '"]').forEach(function(el) {
            el.classList.add('fiber-scheme-cross-port--pick');
        });
        document.querySelectorAll('.fiber-connections-container .cross-fiber-table .fiber-item[data-cable-id]').forEach(function(el) {
            var cId = el.getAttribute('data-cable-id');
            var fNum = parseInt(el.getAttribute('data-fiber-number'), 10);
            var eligible = cId && !isNaN(fNum) && el.getAttribute('data-fiber-connected') !== 'true';
            el.classList.toggle('fiber-item--cross-port-target', !!eligible);
        });
        return;
    }
    if (crossObj && selectedFiberForConnection && !schemeSplitterWirePick && !schemeSplitterOutputPick) {
        var sel = selectedFiberForConnection;
        if (typeof isFiberSplicedAtHost !== 'function' || !isFiberSplicedAtHost(crossObj, sel.cableId, sel.fiberNumber)) {
            document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port').forEach(function(el) {
                el.classList.add('fiber-scheme-cross-port--wire-target');
            });
        }
    }
}

function isSchemeFiberEligibleForAnySplitterInput(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    var splitters = getAvailableSplitters(hostObj);
    if (!splitters.length) return false;
    return splitters.some(function(sp) {
        var sid = sp.properties.get('uniqueId');
        return !getSplitterHostInputFiber(sp) && isSchemeFiberEligibleForSplitterInput(hostObj, cableId, fiberNumber, sid);
    });
}

function getSplitterRoutingAnchor(splitterObj) {
    if (!splitterObj) return null;
    if (splitterObj._embedded && splitterObj._host) return splitterObj._host;
    if (splitterObj.geometry) return splitterObj;
    return splitterObj._host || null;
}

function getSplitterRoutingAnchorCoords(splitterObj) {
    var anchor = getSplitterRoutingAnchor(splitterObj);
    if (!anchor || !anchor.geometry) return null;
    return anchor.geometry.getCoordinates();
}

function startSchemeSplitterFiberWirePick(hostObj, cableId, fiberNumber) {
    if (!hostObj || !cableId || fiberNumber == null) return;
    if (!isSchemeFiberEligibleForAnySplitterInput(hostObj, cableId, fiberNumber)) return;
    clearSchemeSplitterOutputPick();
    schemeSplitterWirePick = {
        hostObj: hostObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        splitterId: null
    };
    updateSchemeSplitterPickUI();
}

function startSchemeSplitterWirePick(hostObj, pick) {
    if (!hostObj || !pick) return;
    resetFiberSelection();
    clearSchemeSplitterOutputPick();
    schemeSplitterWirePick = {
        hostObj: hostObj,
        cableId: pick.cableId || null,
        fiberNumber: pick.fiberNumber != null ? pick.fiberNumber : null,
        splitterId: pick.splitterId || null
    };
    updateSchemeSplitterPickUI();
    switchFiberWorkspaceToSchemeTab();
}

function startSchemeSplitterOutputPick(hostObj, splitterId, outputIndex) {
    if (!hostObj || !splitterId || outputIndex == null) return;
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return;
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return;
    }
    var outputs = facade.properties.get('outputConnections') || [];
    if (outputs[outputIndex]) {
        if (typeof showWarning === 'function') showWarning('Этот выход уже подключён. Отключите его в колонке «Сплиттер».', 'Выход занят');
        return;
    }
    resetFiberSelection();
    clearSchemeSplitterWirePick();
    schemeSplitterOutputPick = rememberSchemePickHost({
        hostObj: hostObj,
        splitterId: splitterId,
        outputIndex: outputIndex
    }, hostObj);
    updateSchemeSplitterPickUI();
    switchFiberWorkspaceToSchemeTab();
}

function isSchemeFiberEligibleForSplitterInput(hostObj, cableId, fiberNumber, splitterId) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    var t = hostObj.properties.get('type');
    var placeId = hostObj.properties.get('uniqueId');
    var opts = { type: 'splitterInput', splitterId: splitterId };
    if (isCrossLikeHostType(t)) opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    var usage = getFiberUsage(cableId, fiberNumber, opts);
    return !usage.used;
}

function tryConnectSchemeFiberToSplitter(hostObj, cableId, fiberNumber, splitterId) {
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return false;
    if (getSplitterHostInputFiber(facade)) {
        if (typeof showWarning === 'function') showWarning('У этого сплиттера уже подключён вход.', 'Вход занят');
        return false;
    }
    if (!isSchemeFiberEligibleForSplitterInput(hostObj, cableId, fiberNumber, splitterId)) {
        var t = hostObj.properties.get('type');
        var placeId = hostObj.properties.get('uniqueId');
        var opts = { type: 'splitterInput', splitterId: splitterId };
        if (isCrossLikeHostType(t)) opts.atCrossId = placeId; else opts.atSleeveId = placeId;
        var usage = getFiberUsage(cableId, fiberNumber, opts);
        if (typeof showError === 'function') showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '.', 'Жила занята');
        return false;
    }
    if (!connectFiberToSplitterWithRoute(hostObj, cableId, fiberNumber, facade, [])) return false;
    clearSchemeSplitterWirePick();
    resetFiberSelection();
    if (typeof showSuccess === 'function') showSuccess('Жила ' + fiberNumber + ' подключена ко входу сплиттера.', 'Сплиттер');
    refreshSplitterUiAfterChange(facade);
    return true;
}

function isSchemeFiberEligibleForSplitterOutput(hostObj, cableId, fiberNumber, splitterId, outputIndex) {
    if (!hostObj || !cableId || fiberNumber == null) return false;
    var t = hostObj.properties.get('type');
    if (isCrossLikeHostType(t)) {
        var fiberPorts = hostObj.properties.get('fiberPorts') || {};
        if (fiberPorts[cableId + '-' + fiberNumber]) return false;
    }
    var placeId = hostObj.properties.get('uniqueId');
    var opts = { type: 'splitterOutput', splitterId: splitterId, outputIndex: outputIndex };
    if (isCrossLikeHostType(t)) opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    var usage = getFiberUsage(cableId, fiberNumber, opts);
    return !usage.used;
}

function isSchemeCrossPortOpenForSplitterOutput(crossObj, portNumber) {
    if (!crossObj || !isCrossLikeHostType(crossObj.properties.get('type')) || portNumber == null) return false;
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber) || portNumber < 1) return false;
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    if (portNumber > crossPorts) return false;
    if (typeof isCrossPortPatched === 'function' && isCrossPortPatched(crossObj, portNumber)) return false;
    if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(crossObj, portNumber)) return false;
    return true;
}

function isSchemeCrossPortEligibleForSplitterOutput(crossObj, portNumber, splitterId, outputIndex) {
    if (!isSchemeCrossPortOpenForSplitterOutput(crossObj, portNumber)) return false;
    var fiberPorts = crossObj.properties.get('fiberPorts') || {};
    if (findFiberKeyByCrossPort(fiberPorts, portNumber)) return false;
    if (findSplitterOutputOnCrossPort(crossObj, portNumber, splitterId, outputIndex)) return false;
    return true;
}

function showSplitterCrossPortConnectError(hostObj, portNumber, splitterId, outputIndex) {
    if (typeof isCrossPortPatched === 'function' && isCrossPortPatched(hostObj, portNumber)) {
        if (typeof showWarning === 'function') showWarning('Порт занят кроссировкой с другим кроссом.', 'Порт недоступен');
    } else if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(hostObj, portNumber)) {
        if (typeof showWarning === 'function') showWarning('Порт занят PON-портом OLT.', 'Порт недоступен');
    } else {
        var fiberPortsErr = hostObj.properties.get('fiberPorts') || {};
        if (findFiberKeyByCrossPort(fiberPortsErr, portNumber)) {
            if (typeof showWarning === 'function') {
                showWarning('Порт занят жилой кабеля. Выход сплиттера подключается только к свободному порту.', 'Порт недоступен');
            }
        } else if (findSplitterOutputOnCrossPort(hostObj, portNumber, splitterId, outputIndex)) {
            if (typeof showWarning === 'function') showWarning('Порт уже занят выходом другого сплиттера.', 'Порт недоступен');
        } else if (typeof showWarning === 'function') {
            showWarning('Порт недоступен для выхода сплиттера.', 'Порт недоступен');
        }
    }
}

function connectSplitterOutputToCrossPort(hostObj, splitterId, outputIndex, portNumber, opts) {
    opts = opts || {};
    var facade = resolveSplitterObject(splitterId);
    if (!facade || !hostObj) return false;
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber) || portNumber < 1) return false;
    if (!isSchemeCrossPortEligibleForSplitterOutput(hostObj, portNumber, splitterId, outputIndex)) {
        showSplitterCrossPortConnectError(hostObj, portNumber, splitterId, outputIndex);
        return false;
    }
    var hostUid = getObjectUniqueId(hostObj);
    var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
    var outputs = (facade.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    outputs[outputIndex] = mergeSplitterOutputConnection(outputs[outputIndex], { hostId: hostUid, crossPort: portNumber, routeIds: [] });
    applySplitterOutputLabelToConnection(facade, outputIndex);
    facade.properties.set('outputConnections', outputs);
    if (facade._embedded && facade._host) {
        persistEmbeddedSplittersOnHost(facade._host, { skipSync: true });
    }
    if (!opts.skipSave) saveData();
    if (!opts.keepPick) clearSchemeSplitterOutputPick();
    if (!opts.skipSuccess && typeof showSuccess === 'function') {
        var successMsg = opts.successMessage || ('Выход ' + (outputIndex + 1) + ' подключён к порту ' + portNumber + ' кросса.');
        showSuccess(successMsg, 'Сплиттер');
    }
    if (!opts.skipRefresh) refreshSplitterUiAfterChange(facade);
    return true;
}

function tryConnectSchemeSplitterOutputToCrossPort(crossObj, portNumber) {
    if (!schemeSplitterOutputPick || !schemePickMatchesHost(schemeSplitterOutputPick, crossObj)) return false;
    if (!isCrossLikeHostType(crossObj.properties.get('type'))) return false;
    var pick = rememberSchemePickHost(schemeSplitterOutputPick, crossObj);
    portNumber = parseInt(portNumber, 10);
    if (isNaN(portNumber)) return false;
    return connectSplitterOutputToCrossPort(crossObj, pick.splitterId, pick.outputIndex, portNumber);
}

function tryConnectSchemeSplitterOutputToFiber(hostObj, cableId, fiberNumber) {
    if (!schemeSplitterOutputPick || !schemePickMatchesHost(schemeSplitterOutputPick, hostObj)) return false;
    var pick = rememberSchemePickHost(schemeSplitterOutputPick, hostObj);
    if (!connectSplitterOutputToLocalFiber(hostObj, pick.splitterId, pick.outputIndex, cableId, fiberNumber)) return false;
    return true;
}

function isSplitterUpstreamOf(hostObj, fromSplitterId, toSplitterId) {
    if (!hostObj || !fromSplitterId || !toSplitterId || !window.EmbeddedSplitters) return false;
    if (fromSplitterId === toSplitterId) return true;
    var visited = new Set();
    var queue = [fromSplitterId];
    while (queue.length) {
        var cur = queue.shift();
        if (cur === toSplitterId) return true;
        if (visited.has(cur)) continue;
        visited.add(cur);
        var rec = EmbeddedSplitters.findInHost(hostObj, cur);
        if (!rec) continue;
        (rec.outputConnections || []).forEach(function(o) {
            if (o && o.splitterId) queue.push(o.splitterId);
        });
    }
    return false;
}

function getAvailableSplitterTargetsForOutput(hostObj, sourceSplitterId) {
    if (!hostObj || !sourceSplitterId || !window.EmbeddedSplitters) return [];
    return EmbeddedSplitters.getAvailableForOutput(sourceSplitterId).filter(function(sp) {
        var tid = sp.properties.get('uniqueId');
        return tid && !isSplitterUpstreamOf(hostObj, tid, sourceSplitterId);
    });
}

function tryConnectSchemeSplitterOutputToSplitter(hostObj, targetSplitterId) {
    if (!schemeSplitterOutputPick || !schemePickMatchesHost(schemeSplitterOutputPick, hostObj)) return false;
    var pick = rememberSchemePickHost(schemeSplitterOutputPick, hostObj);
    if (!connectSplitterOutputToSplitter(hostObj, pick.splitterId, pick.outputIndex, targetSplitterId)) return false;
    return true;
}

function connectSplitterOutputToSplitter(hostObj, sourceSplitterId, outputIndex, targetSplitterId) {
    if (!hostObj || !sourceSplitterId || outputIndex == null || !targetSplitterId) return false;
    if (sourceSplitterId === targetSplitterId) {
        if (typeof showWarning === 'function') showWarning('Нельзя подключить сплиттер к самому себе.', 'Ошибка');
        return false;
    }
    var source = resolveSplitterObject(sourceSplitterId);
    var target = resolveSplitterObject(targetSplitterId);
    if (!source || !target) return false;
    syncSplitterInputFromHost(source);
    if (!getSplitterRootInputFiber(source)) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    if (getSplitterHostInputFiber(target) || target.properties.get('inputFiber')) {
        if (typeof showWarning === 'function') showWarning('У целевого сплиттера уже подключён вход.', 'Вход занят');
        return false;
    }
    if (isSplitterUpstreamOf(hostObj, targetSplitterId, sourceSplitterId)) {
        if (typeof showWarning === 'function') showWarning('Нельзя создать циклическое соединение сплиттеров.', 'Цикл');
        return false;
    }
    var ratio = parseInt(source.properties.get('splitRatio'), 10) || 8;
    var outputs = (source.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    if (outputs[outputIndex]) {
        if (typeof showWarning === 'function') showWarning('Этот выход уже подключён. Отключите его в колонке «Сплиттер» или по линии связи.', 'Выход занят');
        return false;
    }
    var rootInput = getSplitterRootInputFiber(source);
    outputs[outputIndex] = { splitterId: targetSplitterId, routeIds: [] };
    applySplitterOutputLabelToConnection(source, outputIndex);
    withSuppressedMapSave(function() {
        if (source._embedded && source._record) {
            source._record.outputConnections = outputs;
        } else {
            source.properties.set('outputConnections', outputs);
        }
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            if (target._embedded && target._record) {
                applyEmbeddedSplitterInputFiber(target._record, rootInput.cableId, rootInput.fiberNumber);
            } else {
                target.properties.set('inputFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
            }
        }
    });
    if (source._embedded && source._host) persistEmbeddedSplittersOnHost(source._host, { skipSync: true });
    if (target._embedded && target._host) persistEmbeddedSplittersOnHost(target._host);
    saveData();
    clearSchemeSplitterOutputPick();
    var targetName = target.properties.get('name') || 'Сплиттер';
    if (typeof showSuccess === 'function') showSuccess('Выход ' + (outputIndex + 1) + ' подключён ко входу «' + targetName + '».', 'Сплиттер');
    refreshSplitterUiAfterChange(source);
    return true;
}

function connectSplitterOutputToLocalFiber(hostObj, splitterId, outputIndex, cableId, fiberNumber, opts) {
    opts = opts || {};
    var facade = resolveSplitterObject(splitterId);
    if (!facade || !hostObj) return false;
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    if (!isSchemeFiberEligibleForSplitterOutput(hostObj, cableId, fiberNumber, splitterId, outputIndex)) {
        var t = hostObj.properties.get('type');
        var placeId = hostObj.properties.get('uniqueId');
        var usageOpts = { type: 'splitterOutput', splitterId: splitterId, outputIndex: outputIndex };
        if (isCrossLikeHostType(t)) usageOpts.atCrossId = placeId; else usageOpts.atSleeveId = placeId;
        var usage = getFiberUsage(cableId, fiberNumber, usageOpts);
        if (typeof showError === 'function') showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '.', 'Жила занята');
        return false;
    }
    var hostUid = getObjectUniqueId(hostObj);
    var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
    var outputs = (facade.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    outputs[outputIndex] = mergeSplitterOutputConnection(outputs[outputIndex], { hostId: hostUid, cableId: cableId, fiberNumber: fiberNumber, routeIds: [] });
    applySplitterOutputLabelToConnection(facade, outputIndex);
    facade.properties.set('outputConnections', outputs);
    if (facade._embedded && facade._host) {
        persistEmbeddedSplittersOnHost(facade._host, { skipSync: true });
    }
    if (!opts.skipSave) saveData();
    if (!opts.keepPick) clearSchemeSplitterOutputPick();
    if (!opts.skipSuccess && typeof showSuccess === 'function') {
        var successMsg = opts.successMessage || ('Выход ' + (outputIndex + 1) + ' сплиттера сращен с жилой ' + fiberNumber + '.');
        showSuccess(successMsg, 'Сплиттер');
    }
    if (!opts.skipRefresh) refreshSplitterUiAfterChange(facade);
    return true;
}

function updateSchemeSplitterPickUI() {
    var bar = document.getElementById('fiber-scheme-wire-bar');
    if (!bar) return;
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter--wire-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-splitter--wire-target');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-input-port--pick').forEach(function(el) {
        el.classList.remove('fiber-scheme-splitter-input-port--pick');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-port--pick').forEach(function(el) {
        el.classList.remove('fiber-scheme-splitter-port--pick');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-port--wire-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-port--wire-target');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-port--wire-source').forEach(function(el) {
        el.classList.remove('fiber-scheme-port--wire-source');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-port--wire-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-port--wire-target');
    });
    document.querySelectorAll('.fiber-connections-container .fiber-item.fiber-item--wire-target').forEach(function(el) {
        el.classList.remove('fiber-item--wire-target');
    });
    document.querySelectorAll('.fiber-connections-container .fiber-item.fiber-item--splitter-pick').forEach(function(el) {
        el.classList.remove('fiber-item--splitter-pick');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--wire-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--wire-target');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--pick').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--pick');
    });
    if (!schemeSplitterWirePick && !schemeSplitterOutputPick && !schemeCrossPortPick) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        updateSchemeCrossPortPickUI();
        return;
    }
    bar.style.display = 'flex';
    var msg = '';
    if (schemeSplitterOutputPick) {
        var op = schemeSplitterOutputPick;
        var recOut = window.EmbeddedSplitters ? EmbeddedSplitters.findInHost(op.hostObj, op.splitterId) : null;
        var spNameOut = recOut ? (recOut.name || 'Сплиттер') : 'сплиттер';
        var crossPortHint = isCrossLikeHostType(op.hostObj.properties.get('type'))
            ? ' · для вывода на кросс кликните <strong>свободный порт</strong> на схеме'
            : '';
        msg = 'Выход ' + (op.outputIndex + 1) + ' «' + escapeHtml(spNameOut) + '»: кликните по <strong>жиле</strong> (сращивание)' + crossPortHint + ' или по <strong>входу другого сплиттера</strong>.';
        if (isCrossLikeHostType(op.hostObj.properties.get('type'))) {
            document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port').forEach(function(el) {
                var portNum = parseInt(el.getAttribute('data-cross-port'), 10);
                var portEligible = !isNaN(portNum) && isSchemeCrossPortEligibleForSplitterOutput(op.hostObj, portNum, op.splitterId, op.outputIndex);
                el.classList.toggle('fiber-scheme-cross-port--wire-target', portEligible);
            });
        }
        document.querySelectorAll('.fiber-connections-container .fiber-item[data-cable-id]').forEach(function(el) {
            var cId = el.getAttribute('data-cable-id');
            var fNum = parseInt(el.getAttribute('data-fiber-number'), 10);
            var eligible = cId && !isNaN(fNum) && isSchemeFiberEligibleForSplitterOutput(op.hostObj, cId, fNum, op.splitterId, op.outputIndex);
            el.classList.toggle('fiber-item--wire-target', !!eligible);
        });
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-port').forEach(function(el) {
            var cId = el.getAttribute('data-cable-id');
            var fNum = parseInt(el.getAttribute('data-fiber-number'), 10);
            var portEligible = cId && !isNaN(fNum) && isSchemeFiberEligibleForSplitterOutput(op.hostObj, cId, fNum, op.splitterId, op.outputIndex);
            el.classList.toggle('fiber-scheme-port--wire-target', !!portEligible);
        });
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-port').forEach(function(el) {
            var sid = el.getAttribute('data-splitter-id');
            var oi = parseInt(el.getAttribute('data-output-index'), 10);
            el.classList.toggle('fiber-scheme-splitter-port--pick', sid === op.splitterId && oi === op.outputIndex);
        });
        document.querySelectorAll('.fiber-connections-container .fiber-item[data-splitter-fiber-kind="output"]').forEach(function(el) {
            var sid = el.getAttribute('data-splitter-id');
            var oi = parseInt(el.getAttribute('data-output-index'), 10);
            el.classList.toggle('fiber-item--splitter-pick', sid === op.splitterId && oi === op.outputIndex);
        });
        var targetIds = getAvailableSplitterTargetsForOutput(op.hostObj, op.splitterId).map(function(sp) {
            return sp.properties.get('uniqueId');
        });
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-input-port').forEach(function(el) {
            var sid = el.getAttribute('data-splitter-id');
            el.classList.toggle('fiber-scheme-splitter-input-port--pick', targetIds.indexOf(sid) !== -1);
        });
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter').forEach(function(el) {
            var sid = el.getAttribute('data-splitter-id');
            el.classList.toggle('fiber-scheme-splitter--wire-target', targetIds.indexOf(sid) !== -1);
        });
    } else if (schemeSplitterWirePick) {
        var pick = schemeSplitterWirePick;
        if (pick.splitterId && !pick.cableId) {
            var rec = window.EmbeddedSplitters ? EmbeddedSplitters.findInHost(pick.hostObj, pick.splitterId) : null;
            var spName = rec ? (rec.name || 'Сплиттер') : 'сплиттер';
            msg = 'Подключение входа «' + escapeHtml(spName) + '»: кликните по <strong>жиле на схеме</strong> или по точке «вх» у сплиттера.';
            document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter').forEach(function(el) {
                el.classList.toggle('fiber-scheme-splitter--wire-target', el.getAttribute('data-splitter-id') === pick.splitterId);
            });
            document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter-input-port').forEach(function(el) {
                el.classList.toggle('fiber-scheme-splitter-input-port--pick', el.getAttribute('data-splitter-id') === pick.splitterId);
            });
            document.querySelectorAll('.fiber-connections-container .fiber-item[data-splitter-fiber-kind="input"]').forEach(function(el) {
                el.classList.toggle('fiber-item--splitter-pick', el.getAttribute('data-splitter-id') === pick.splitterId);
            });
        } else if (pick.cableId && pick.fiberNumber != null) {
            var shortId = pick.cableId.length > 10 ? pick.cableId.substring(0, 8) + '…' : pick.cableId;
            msg = 'Жила ' + pick.fiberNumber + ' (' + escapeHtml(shortId) + '): кликните по <strong>сплиттеру на схеме</strong> (карточка или точка «вх») или по строке <strong>«вх»</strong> в таблице. Либо выберите вторую жилу для сращивания.';
            document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
                var cId = el.getAttribute('data-cable-id');
                var fNum = parseInt(el.getAttribute('data-fiber-number'), 10);
                el.classList.toggle('fiber-scheme-port--wire-source', cId === pick.cableId && fNum === pick.fiberNumber);
            });
            document.querySelectorAll('#fiber-connections-svg .fiber-scheme-splitter').forEach(function(el) {
                var sid = el.getAttribute('data-splitter-id');
                var rec2 = sid && window.EmbeddedSplitters ? EmbeddedSplitters.findInHost(pick.hostObj, sid) : null;
                var can = rec2 && !getEmbeddedSplitterInputSource(pick.hostObj, rec2);
                el.classList.toggle('fiber-scheme-splitter--wire-target', !!can);
            });
            document.querySelectorAll('.fiber-connections-container .fiber-item[data-splitter-fiber-kind="input"]').forEach(function(el) {
                var sid = el.getAttribute('data-splitter-id');
                var rec3 = sid && window.EmbeddedSplitters ? EmbeddedSplitters.findInHost(pick.hostObj, sid) : null;
                var canIn = rec3 && !getEmbeddedSplitterInputSource(pick.hostObj, rec3);
                el.classList.toggle('fiber-item--wire-target', !!canIn);
            });
        }
    } else if (schemeCrossPortPick) {
        updateSchemeCrossPortPickUI();
        return;
    }
    if (!msg) {
        updateSchemeCrossPortPickUI();
        return;
    }
    bar.innerHTML = '<span class="fiber-selection-text fiber-scheme-wire-bar-text">' + msg + '</span>' +
        '<button type="button" class="fiber-selection-cancel" id="fiberSchemeWireCancelBtn">Отмена</button>';
    var cancelBtn = document.getElementById('fiberSchemeWireCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', clearAllSchemeSplitterPicks);
    updateSchemeCrossPortPickUI();
}

function getFiberSchemeScrollPos() {
    var schemeWrap = document.getElementById('fiber-scheme-viewport');
    var tableWrap = document.querySelector('.cross-fiber-table-wrap');
    return {
        scheme: schemeWrap ? schemeWrap.scrollTop : 0,
        schemeLeft: schemeWrap ? schemeWrap.scrollLeft : 0,
        table: tableWrap ? tableWrap.scrollTop : 0
    };
}

function readFiberSchemeZoomFromDom() {
    var inner = document.getElementById('fiber-scheme-zoom-inner');
    if (!inner || !inner.style.transform) return null;
    var m = inner.style.transform.match(/scale\(([\d.]+)\)/);
    var z = m ? parseFloat(m[1]) : NaN;
    return (!isNaN(z) && z >= 0.3 && z <= 2) ? z : null;
}

function getFiberSchemeViewState(hostObj) {
    if (!hostObj || !hostObj.properties) return null;
    var ls = loadFiberSchemeViewStateLocal(hostObj);
    var z = parseFloat(hostObj.properties.get('fiberSchemeViewZoom'));
    var st = parseInt(hostObj.properties.get('fiberSchemeScrollTop'), 10);
    var sl = parseInt(hostObj.properties.get('fiberSchemeScrollLeft'), 10);
    var tt = parseInt(hostObj.properties.get('fiberSchemeTableScrollTop'), 10);
    var zoom = (!isNaN(z) && z >= 0.3 && z <= 2) ? z : null;
    if (zoom == null && ls && ls.zoom != null && !isNaN(ls.zoom)) zoom = ls.zoom;
    var schemeTop = (!isNaN(st) && st >= 0) ? st : null;
    if (schemeTop == null && ls && ls.schemeTop != null) schemeTop = ls.schemeTop;
    var schemeLeft = (!isNaN(sl) && sl >= 0) ? sl : null;
    if (schemeLeft == null && ls && ls.schemeLeft != null) schemeLeft = ls.schemeLeft;
    var tableTop = (!isNaN(tt) && tt >= 0) ? tt : null;
    if (tableTop == null && ls && ls.tableTop != null) tableTop = ls.tableTop;
    return { zoom: zoom, schemeTop: schemeTop, schemeLeft: schemeLeft, tableTop: tableTop };
}

var fiberSchemeViewSaveTimer = null;
var pendingFiberSchemeSessionScroll = null;
var FIBER_SCHEME_VIEW_LS_PREFIX = 'fiberSchemeView:';

function fiberSchemeViewLsKey(hostObj) {
    var uid = hostObj && typeof getObjectUniqueId === 'function' ? getObjectUniqueId(hostObj) : '';
    return uid ? FIBER_SCHEME_VIEW_LS_PREFIX + uid : '';
}

function saveFiberSchemeViewStateLocal(hostObj, state) {
    var key = fiberSchemeViewLsKey(hostObj);
    if (!key || !state) return;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) {}
}

function loadFiberSchemeViewStateLocal(hostObj) {
    var key = fiberSchemeViewLsKey(hostObj);
    if (!key) return null;
    try {
        var raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function buildFiberSchemeViewStatePayload(hostObj, zoom) {
    var pos = getFiberSchemeScrollPos();
    if (zoom == null || isNaN(zoom)) zoom = readFiberSchemeZoomFromDom();
    return {
        zoom: (zoom != null && !isNaN(zoom))
            ? Math.round(Math.max(0.3, Math.min(2, zoom)) * 100) / 100
            : null,
        schemeTop: Math.max(0, Math.round(pos.scheme) || 0),
        schemeLeft: Math.max(0, Math.round(pos.schemeLeft) || 0),
        tableTop: Math.max(0, Math.round(pos.table) || 0)
    };
}

function persistFiberSchemeViewStateToObject(hostObj, zoom) {
    if (!hostObj || !hostObj.properties) return;
    var objType = hostObj.properties.get('type');
    if (!isFiberHostType(objType)) return;
    var state = buildFiberSchemeViewStatePayload(hostObj, zoom);
    saveFiberSchemeViewStateLocal(hostObj, state);
    if (state.zoom != null) hostObj.properties.set('fiberSchemeViewZoom', state.zoom);
    hostObj.properties.set('fiberSchemeScrollTop', state.schemeTop);
    hostObj.properties.set('fiberSchemeScrollLeft', state.schemeLeft);
    hostObj.properties.set('fiberSchemeTableScrollTop', state.tableTop);
    if (typeof saveData === 'function') {
        saveData({ fiberSchemeViewOnly: true, object: hostObj, syncImmediate: true });
    }
}

function schedulePersistFiberSchemeViewState(hostObj, zoom) {
    if (!hostObj) return;
    clearTimeout(fiberSchemeViewSaveTimer);
    fiberSchemeViewSaveTimer = setTimeout(function() {
        fiberSchemeViewSaveTimer = null;
        persistFiberSchemeViewStateToObject(hostObj, zoom);
    }, 250);
}

function flushPendingFiberSchemeViewState(hostObj) {
    if (fiberSchemeViewSaveTimer) {
        clearTimeout(fiberSchemeViewSaveTimer);
        fiberSchemeViewSaveTimer = null;
    }
    if (hostObj) persistFiberSchemeViewStateToObject(hostObj, readFiberSchemeZoomFromDom());
}

function appendFiberSchemeCanvasPropsToResult(props, result) {
    if (props.fiberSchemeCanvasAuto) {
        result.fiberSchemeCanvasAuto = true;
        result.fiberSchemeCanvasWidth = null;
        result.fiberSchemeCanvasHeight = null;
        return;
    }
    var w = props.fiberSchemeCanvasWidth;
    var h = props.fiberSchemeCanvasHeight;
    if ((w != null && w !== '') || (h != null && h !== '')) {
        result.fiberSchemeCanvasAuto = false;
        if (w != null && w !== '') result.fiberSchemeCanvasWidth = w;
        if (h != null && h !== '') result.fiberSchemeCanvasHeight = h;
    }
}

function loadFiberSchemeCanvasPropsFromData(data, placemark) {
    if (!placemark || !placemark.properties || !data) return;
    if (data.fiberSchemeCanvasAuto) {
        placemark.properties.set('fiberSchemeCanvasAuto', true);
        placemark.properties.unset('fiberSchemeCanvasWidth');
        placemark.properties.unset('fiberSchemeCanvasHeight');
        return;
    }
    placemark.properties.unset('fiberSchemeCanvasAuto');
    if (data.fiberSchemeCanvasWidth != null && data.fiberSchemeCanvasWidth !== '') {
        placemark.properties.set('fiberSchemeCanvasWidth', data.fiberSchemeCanvasWidth);
    } else {
        placemark.properties.unset('fiberSchemeCanvasWidth');
    }
    if (data.fiberSchemeCanvasHeight != null && data.fiberSchemeCanvasHeight !== '') {
        placemark.properties.set('fiberSchemeCanvasHeight', data.fiberSchemeCanvasHeight);
    } else {
        placemark.properties.unset('fiberSchemeCanvasHeight');
    }
}

function appendFiberSchemeViewPropsToResult(props, result) {
    if (props.fiberSchemeViewZoom !== undefined && props.fiberSchemeViewZoom !== null && props.fiberSchemeViewZoom !== '') {
        result.fiberSchemeViewZoom = props.fiberSchemeViewZoom;
    }
    if (props.fiberSchemeScrollTop !== undefined && props.fiberSchemeScrollTop !== null) {
        result.fiberSchemeScrollTop = props.fiberSchemeScrollTop;
    }
    if (props.fiberSchemeScrollLeft !== undefined && props.fiberSchemeScrollLeft !== null) {
        result.fiberSchemeScrollLeft = props.fiberSchemeScrollLeft;
    }
    if (props.fiberSchemeTableScrollTop !== undefined && props.fiberSchemeTableScrollTop !== null) {
        result.fiberSchemeTableScrollTop = props.fiberSchemeTableScrollTop;
    }
}

function loadFiberSchemeViewPropsFromData(data, placemark) {
    if (data.fiberSchemeViewZoom != null && data.fiberSchemeViewZoom !== '') {
        placemark.properties.set('fiberSchemeViewZoom', data.fiberSchemeViewZoom);
    }
    if (data.fiberSchemeScrollTop != null) placemark.properties.set('fiberSchemeScrollTop', data.fiberSchemeScrollTop);
    if (data.fiberSchemeScrollLeft != null) placemark.properties.set('fiberSchemeScrollLeft', data.fiberSchemeScrollLeft);
    if (data.fiberSchemeTableScrollTop != null) placemark.properties.set('fiberSchemeTableScrollTop', data.fiberSchemeTableScrollTop);
}

function getFiberSchemeCableSides(hostObj) {
    if (!hostObj || !hostObj.properties) return {};
    var sides = hostObj.properties.get('fiberSchemeCableSides');
    return (sides && typeof sides === 'object') ? sides : {};
}

function getDefaultCableSchemeSide(cableIndex, totalCount) {
    if (totalCount <= 0) return 'left';
    return cableIndex < Math.ceil(totalCount / 2) ? 'left' : 'right';
}

function resolveCableSchemeSide(hostObj, cableUniqueId, cableIndex, totalCount) {
    var stored = getFiberSchemeCableSides(hostObj)[cableUniqueId];
    if (stored === 'left' || stored === 'right') return stored;
    return getDefaultCableSchemeSide(cableIndex, totalCount);
}

function partitionCablesBySchemeSide(hostObj, cablesData) {
    var left = [];
    var right = [];
    var total = cablesData.length;
    cablesData.forEach(function(cableData, index) {
        var side = resolveCableSchemeSide(hostObj, cableData.cableUniqueId, index, total);
        if (side === 'right') right.push(cableData);
        else left.push(cableData);
    });
    return { left: left, right: right };
}

function toggleFiberSchemeCableSide(hostObj, cableUniqueId) {
    if (!hostObj || !cableUniqueId) return false;
    var cables = typeof getConnectedCables === 'function' ? getConnectedCables(hostObj) : [];
    var cableIds = cables.map(function(c) {
        return (c.properties && c.properties.get('uniqueId')) || '';
    });
    var idx = cableIds.indexOf(cableUniqueId);
    var total = cables.length;
    var sides = Object.assign({}, getFiberSchemeCableSides(hostObj));
    var current = resolveCableSchemeSide(hostObj, cableUniqueId, idx >= 0 ? idx : 0, total);
    sides[cableUniqueId] = current === 'left' ? 'right' : 'left';
    hostObj.properties.set('fiberSchemeCableSides', sides);
    if (typeof saveData === 'function') saveData({ fiberSchemeViewOnly: true, object: hostObj, syncImmediate: true });
    return true;
}

function appendFiberSchemeCableSidesToResult(props, result) {
    var sides = props.fiberSchemeCableSides;
    if (sides && typeof sides === 'object' && Object.keys(sides).length) {
        result.fiberSchemeCableSides = sides;
    }
}

function loadFiberSchemeCableSidesFromData(data, placemark) {
    if (!placemark || !placemark.properties || !data) return;
    if (data.fiberSchemeCableSides && typeof data.fiberSchemeCableSides === 'object') {
        placemark.properties.set('fiberSchemeCableSides', data.fiberSchemeCableSides);
    }
}

if (!window._fiberSchemeViewUnloadBound) {
    window._fiberSchemeViewUnloadBound = true;
    window.addEventListener('beforeunload', function() {
        if (!currentModalObject || !currentModalObject.properties) return;
        var t = currentModalObject.properties.get('type');
        if (isFiberHostType(t)) flushPendingFiberSchemeViewState(currentModalObject);
    });
}

function restoreFiberSchemeViewportState(hostObj, sessionOverride) {
    var fromObj = hostObj ? getFiberSchemeViewState(hostObj) : null;
    function applyScroll() {
        var schemeWrap = document.getElementById('fiber-scheme-viewport');
        var tableWrap = document.querySelector('.cross-fiber-table-wrap');
        if (schemeWrap) {
            var top = sessionOverride && sessionOverride.scheme != null
                ? sessionOverride.scheme
                : (fromObj ? fromObj.schemeTop : null);
            var left = sessionOverride && sessionOverride.schemeLeft != null
                ? sessionOverride.schemeLeft
                : (fromObj ? fromObj.schemeLeft : null);
            if (top != null) schemeWrap.scrollTop = top;
            if (left != null) schemeWrap.scrollLeft = left;
        }
        if (tableWrap) {
            var tableTop = sessionOverride && sessionOverride.table != null
                ? sessionOverride.table
                : (fromObj ? fromObj.tableTop : null);
            if (tableTop != null) tableWrap.scrollTop = tableTop;
        }
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            applyScroll();
            requestAnimationFrame(applyScroll);
        });
    });
}

function withSuppressedMapSave(fn) {
    window._suppressMapSave = (window._suppressMapSave || 0) + 1;
    try {
        return fn();
    } finally {
        window._suppressMapSave--;
        if (window._suppressMapSave < 0) window._suppressMapSave = 0;
    }
}

function cloneHostFiberAssignmentMap(map) {
    return Object.assign({}, map || {});
}

function setHostFiberAssignment(hostObj, propName, cableId, fiberNumber, value) {
    if (!hostObj || !hostObj.properties) return;
    var map = cloneHostFiberAssignmentMap(hostObj.properties.get(propName));
    var key = fiberConnKey(cableId, fiberNumber);
    if (value == null) delete map[key];
    else map[key] = value;
    hostObj.properties.set(propName, map);
}

function applyEmbeddedSplitterInputFiber(rec, cableId, fiberNumber) {
    if (!rec) return;
    if (cableId && fiberNumber != null) {
        rec.inputFiber = { cableId: cableId, fiberNumber: fiberNumber };
        rec.inputCableId = cableId;
        rec.inputFiberNumber = fiberNumber;
    } else {
        rec.inputFiber = null;
        rec.inputCableId = null;
        rec.inputFiberNumber = null;
    }
}

function persistEmbeddedSplittersOnHost(hostObj, opts) {
    if (!hostObj || !window.EmbeddedSplitters) return;
    if (!(opts && opts.skipSync)) {
        EmbeddedSplitters.syncAllInputs(hostObj);
    }
    var list = EmbeddedSplitters.getList(hostObj);
    hostObj.properties.set('embeddedSplitters', list.slice());
}

function refreshSplitterUiAfterChange(splitterObj) {
    if (!splitterObj) return;
    var hostObj = splitterObj._embedded && splitterObj._host ? splitterObj._host : splitterObj;
    if (splitterObj._embedded && splitterObj._host) {
        persistEmbeddedSplittersOnHost(splitterObj._host);
    }
    savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
    refreshFiberHostModal(hostObj);
}

function buildEmbeddedSplitterRatioOptionsHtml(selected) {
    selected = parseInt(selected, 10) || 8;
    return EMBEDDED_SPLITTER_RATIOS.map(function(r) {
        return '<option value="' + r + '"' + (r === selected ? ' selected' : '') + '>1:' + r + ' (' + r + ' выходных жил)</option>';
    }).join('');
}

function buildFiberAssignRow(kind, icon, text, disconnectBtn) {
    return '<div class="fiber-assign fiber-assign--' + kind + '"><span class="fiber-assign__text">' + icon + ' ' + text + '</span>' + (disconnectBtn || '') + '</div>';
}

function resolveCableDisplayName(cablesData, cableId) {
    if (!cableId || !cablesData) return cableId ? cableId.substring(0, 8) + '…' : '';
    var cd = cablesData.find(function(c) { return c.cableUniqueId === cableId; });
    return cd ? (cd.cableName || ('К' + cd.index)) : cableId.substring(0, 8) + '…';
}

function getEmbeddedSplitterInputSource(hostObj, rec) {
    if (!hostObj || !rec) return null;
    var sc = hostObj.properties.get('splitterConnections') || {};
    for (var key in sc) {
        if (!sc[key] || sc[key].splitterId !== rec.id) continue;
        var parsed = typeof parseFiberConnectionKey === 'function' ? parseFiberConnectionKey(key) : null;
        if (parsed) return { type: 'fiber', cableId: parsed.cableId, fiberNumber: parsed.fiberNumber, direct: true };
    }
    if (window.EmbeddedSplitters) {
        var list = EmbeddedSplitters.getList(hostObj);
        for (var i = 0; i < list.length; i++) {
            var parent = list[i];
            if (!parent || parent.id === rec.id) continue;
            var outs = parent.outputConnections || [];
            for (var oi = 0; oi < outs.length; oi++) {
                if (outs[oi] && outs[oi].splitterId === rec.id) {
                    return {
                        type: 'splitter',
                        splitterId: parent.id,
                        splitterName: parent.name || 'Сплиттер',
                        outputIndex: oi
                    };
                }
            }
        }
    }
    if (rec.inputCableId && rec.inputFiberNumber != null) {
        return { type: 'fiber', cableId: rec.inputCableId, fiberNumber: rec.inputFiberNumber, direct: false };
    }
    return null;
}

function buildSplittersTableData(hostObj) {
    if (!window.EmbeddedSplitters || !hostObj) return [];
    EmbeddedSplitters.syncAllInputs(hostObj);
    return EmbeddedSplitters.getList(hostObj).map(function(rec, idx) {
        var ratio = parseInt(rec.splitRatio, 10) || 8;
        var fibers = [{
            kind: 'input',
            number: 0,
            name: 'Вход',
            color: '#ea580c',
            hasBlackRing: false
        }];
        for (var oi = 0; oi < ratio; oi++) {
            fibers.push({
                kind: 'output',
                number: oi + 1,
                outputIndex: oi,
                name: 'Вых. ' + (oi + 1),
                color: '#f97316',
                hasBlackRing: false
            });
        }
        return {
            rec: rec,
            splitterId: rec.id,
            name: rec.name || ('Сплиттер ' + (idx + 1)),
            ratio: ratio,
            fibers: fibers,
            index: idx + 1
        };
    });
}

function connectSplitterOutputToOnuDirect(hostObj, splitterId, outputIndex, onuObj) {
    var facade = resolveSplitterObject(splitterId);
    if (!facade || !hostObj || !onuObj) return false;
    syncSplitterInputFromHost(facade);
    var rootInput = getSplitterRootInputFiber(facade);
    if (!rootInput || !rootInput.cableId || rootInput.fiberNumber == null) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    if (!isFiberReachableToOlt(hostObj, rootInput.cableId, rootInput.fiberNumber)) {
        if (typeof showWarning === 'function') showWarning('ONU можно подключить только к ветке, связанной с OLT.', 'Нет OLT');
        return false;
    }
    var onuId = getObjectUniqueId(onuObj);
    if (isOnuUsedInNetwork(onuId)) {
        if (typeof showError === 'function') showError('Это ONU уже подключено к сети.', 'ONU занято');
        return false;
    }
    var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
    var outputs = (facade.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    if (outputs[outputIndex] && outputs[outputIndex].splitterId) {
        if (typeof showWarning === 'function') showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].onuId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключено ONU.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].mediaConverterId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
        return false;
    }
    outputs[outputIndex] = mergeSplitterOutputConnection(outputs[outputIndex], { onuId: onuId, routeIds: [] });
    applySplitterOutputLabelToConnection(facade, outputIndex);
    facade.properties.set('outputConnections', outputs);
    onuObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
    saveData();
    if (typeof showSuccess === 'function') showSuccess('Выход ' + (outputIndex + 1) + ' подключён к ONU «' + (onuObj.properties.get('name') || 'ONU') + '».', 'Сплиттер');
    refreshSplitterUiAfterChange(facade);
    return true;
}

function connectSplitterOutputToNode(hostObj, splitterId, outputIndex, nodeObj, switchId, switchPort) {
    var facade = resolveSplitterObject(splitterId);
    if (!facade || !hostObj || !nodeObj) return false;
    var hostType = hostObj.properties.get('type');
    if (!isFiberHostType(hostType)) {
        if (typeof showWarning === 'function') showWarning('Подключение к узлу доступно только с кросса или муфты.', 'Ошибка');
        return false;
    }
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    if (!switchId || switchPort == null || isNaN(parseInt(switchPort, 10))) {
        if (typeof showError === 'function') showError('Выберите коммутатор и оптический порт (SFP, SFP+, QSFP, Комбо).', 'Порт');
        return false;
    }
    var portNum = parseInt(switchPort, 10);
    var swAtt = findAttachedSwitchOnNode(nodeObj, switchId);
    if (!swAtt) {
        if (typeof showError === 'function') showError('Коммутатор не найден в узле.', 'Ошибка');
        return false;
    }
    var typesAtt = swAtt.switchPortTypes || [];
    if (portNum < 1 || portNum > typesAtt.length || !isSwitchPortSfpFiberType(typesAtt[portNum - 1])) {
        if (typeof showError === 'function') showError('К кроссу или муфте можно подключить жилу только в оптический порт коммутатора (SFP, SFP+, QSFP, Комбо).', 'Тип порта');
        return false;
    }
    var fusAtt = swAtt.fiberPortUsage || {};
    if (fusAtt[String(portNum)]) {
        if (typeof showError === 'function') showError('Выбранный SFP-порт уже занят. Выберите другой порт.', 'Порт занят');
        return false;
    }
    var cupAtt = swAtt.copperPortUsage || {};
    if (cupAtt[String(portNum)]) {
        if (typeof showError === 'function') showError('На этом порту уже подключён медный кабель. Для оптики выберите другой порт или отключите медь.', 'Порт занят');
        return false;
    }
    var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
    var outputs = (facade.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    if (outputs[outputIndex] && outputs[outputIndex].splitterId) {
        if (typeof showWarning === 'function') showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].onuId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключено ONU.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].mediaConverterId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
        return false;
    }
    var nodeId = getObjectUniqueId(nodeObj);
    var usageKey = 'sp-out-' + getObjectUniqueId(facade) + '-' + outputIndex;
    outputs[outputIndex] = mergeSplitterOutputConnection(outputs[outputIndex], {
        nodeId: nodeId,
        switchId: switchId,
        switchPort: portNum,
        routeIds: []
    });
    applySplitterOutputLabelToConnection(facade, outputIndex);
    facade.properties.set('outputConnections', outputs);
    markNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum, usageKey);
    if (facade._embedded && facade._host) {
        persistEmbeddedSplittersOnHost(facade._host);
    }
    saveData();
    updateSplitterOutputConnectionLines();
    if (typeof showSuccess === 'function') {
        showSuccess('Выход ' + (outputIndex + 1) + ' подключён к узлу «' + (nodeObj.properties.get('name') || 'Узел') + '».', 'Сплиттер');
    }
    refreshSplitterUiAfterChange(facade);
    return true;
}

function showSplitterOutputNodeDialog(hostObj, splitterId, outputIndex) {
    var hostType = hostObj && hostObj.properties ? hostObj.properties.get('type') : null;
    if (!hostObj || (!isFiberHostType(hostType))) {
        showWarning('Подключение к узлу доступно только с кросса или муфты.', 'Ошибка');
        return;
    }
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return;
    syncSplitterInputFromHost(facade);
    if (!getSplitterRootInputFiber(facade)) {
        showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return;
    }
    var outsNode = facade.properties.get('outputConnections') || [];
    var outNode = outsNode[outputIndex];
    if (outNode && outNode.nodeId) {
        showWarning('На выходе уже подключён узел.', 'Выход занят');
        return;
    }
    if (outNode && (outNode.onuId || outNode.mediaConverterId || outNode.splitterId)) {
        showWarning('Этот выход уже подключён.', 'Выход занят');
        return;
    }
    var nodes = getAvailableNodes();
    if (nodes.length === 0) {
        showWarning('Нет доступных узлов для подключения. Сначала создайте узел сети.', 'Нет узлов');
        return;
    }
    var spName = facade.properties.get('name') || 'Сплиттер';
    nodeSelectionModalData = {
        mode: 'splitterOutputNode',
        hostObj: hostObj,
        splitterId: splitterId,
        outputIndex: outputIndex,
        nodes: nodes,
        phase: 'list'
    };
    var modal = document.getElementById('nodeSelectionModal');
    var fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    var searchInput = document.getElementById('nodeSearchInput');
    if (fiberInfo) {
        fiberInfo.textContent = 'Выход ' + (outputIndex + 1) + ' «' + spName + '»: выберите узел, затем свободный оптический порт на коммутаторе.';
    }
    if (searchInput) searchInput.value = '';
    renderNodeList(nodes, '');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function connectSplitterOutputToMediaConverterDirect(hostObj, splitterId, outputIndex, mcObj) {
    var facade = resolveSplitterObject(splitterId);
    if (!facade || !hostObj || !mcObj) return false;
    syncSplitterInputFromHost(facade);
    var rootInput = getSplitterRootInputFiber(facade);
    if (!rootInput || !rootInput.cableId || rootInput.fiberNumber == null) {
        if (typeof showWarning === 'function') showWarning('Сначала подключите входную жилу к сплиттеру.', 'Нет входа');
        return false;
    }
    var mcId = getObjectUniqueId(mcObj);
    var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
    var outputs = (facade.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    if (outputs[outputIndex] && outputs[outputIndex].splitterId) {
        if (typeof showWarning === 'function') showWarning('Этот выход уже подключён к другому сплиттеру.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].onuId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключено ONU.', 'Выход занят');
        return false;
    }
    if (outputs[outputIndex] && outputs[outputIndex].mediaConverterId) {
        if (typeof showWarning === 'function') showWarning('На выходе уже подключён медиаконвертер.', 'Выход занят');
        return false;
    }
    outputs[outputIndex] = mergeSplitterOutputConnection(outputs[outputIndex], { mediaConverterId: mcId, routeIds: [] });
    applySplitterOutputLabelToConnection(facade, outputIndex);
    facade.properties.set('outputConnections', outputs);
    mcObj.properties.set('incomingFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
    saveData();
    if (typeof showSuccess === 'function') showSuccess('Выход ' + (outputIndex + 1) + ' подключён к медиаконвертеру.', 'Сплиттер');
    refreshSplitterUiAfterChange(facade);
    return true;
}

function resolveSplitterTableRootFiber(hostObj, rec, visited) {
    if (!hostObj || !rec) return null;
    visited = visited || new Set();
    if (visited.has(rec.id)) return null;
    visited.add(rec.id);
    if (window.EmbeddedSplitters) EmbeddedSplitters.syncInputFromConnections(hostObj, rec);
    var facade = window.EmbeddedSplitters ? EmbeddedSplitters.createFacade(hostObj, rec) : null;
    if (facade) syncSplitterInputFromHost(facade);
    var root = facade ? getSplitterRootInputFiber(facade) : null;
    if (root && root.cableId && root.fiberNumber != null) return root;
    var inSrc = getEmbeddedSplitterInputSource(hostObj, rec);
    if (inSrc && inSrc.type === 'fiber' && inSrc.cableId && inSrc.fiberNumber != null) {
        return { cableId: inSrc.cableId, fiberNumber: inSrc.fiberNumber };
    }
    if (inSrc && inSrc.type === 'splitter' && inSrc.splitterId && window.EmbeddedSplitters) {
        var parentRec = EmbeddedSplitters.getList(hostObj).find(function(r) { return r && r.id === inSrc.splitterId; });
        if (parentRec) return resolveSplitterTableRootFiber(hostObj, parentRec, visited);
    }
    return null;
}

function getSplitterOutputRootReach(hostObj, rec, oltReachCache) {
    var root = resolveSplitterTableRootFiber(hostObj, rec);
    if (!root || !root.cableId || root.fiberNumber == null) return { root: null, canConnectToOlt: false };
    var key = (getObjectUniqueId(hostObj) || '') + ':' + fiberConnKey(root.cableId, root.fiberNumber);
    if (oltReachCache && !Object.prototype.hasOwnProperty.call(oltReachCache, key)) {
        oltReachCache[key] = isFiberReachableToOlt(hostObj, root.cableId, root.fiberNumber);
    }
    var canConnectToOlt = oltReachCache ? oltReachCache[key] : isFiberReachableToOlt(hostObj, root.cableId, root.fiberNumber);
    return { root: root, canConnectToOlt: !!canConnectToOlt };
}

function buildSplitterFiberChip(className, splitterId, outputIndex, title, label) {
    return '<button type="button" class="fiber-chip ' + className + '" data-splitter-id="' + escapeHtml(splitterId) + '" data-output-index="' + outputIndex + '" title="' + escapeHtml(title) + '">' + label + '</button>';
}

function ensureSplitterOutputLabels(rec, ratio) {
    if (!rec) return;
    ratio = ratio || parseInt(rec.splitRatio, 10) || 8;
    if (!Array.isArray(rec.outputLabels)) rec.outputLabels = [];
    while (rec.outputLabels.length < ratio) rec.outputLabels.push('');
    if (rec.outputLabels.length > ratio) rec.outputLabels = rec.outputLabels.slice(0, ratio);
    var outs = rec.outputConnections || [];
    for (var i = 0; i < ratio; i++) {
        if (!rec.outputLabels[i] && outs[i] && outs[i].label && String(outs[i].label).trim()) {
            rec.outputLabels[i] = String(outs[i].label).trim();
        }
    }
}

function getSplitterOutputLabelFromRec(rec, outputIndex) {
    if (!rec || outputIndex == null || isNaN(parseInt(outputIndex, 10))) return '';
    ensureSplitterOutputLabels(rec);
    var fromArr = rec.outputLabels[parseInt(outputIndex, 10)];
    return fromArr && String(fromArr).trim() ? String(fromArr).trim() : '';
}

function getMapSplitterOutputLabels(splitterObj) {
    if (!splitterObj || !splitterObj.properties) return [];
    var ratio = parseInt(splitterObj.properties.get('splitRatio'), 10) || 8;
    var labels = (splitterObj.properties.get('outputLabels') || []).slice();
    while (labels.length < ratio) labels.push('');
    if (labels.length > ratio) labels = labels.slice(0, ratio);
    var outs = splitterObj.properties.get('outputConnections') || [];
    for (var i = 0; i < ratio; i++) {
        if (!labels[i] && outs[i] && outs[i].label && String(outs[i].label).trim()) {
            labels[i] = String(outs[i].label).trim();
        }
    }
    return labels;
}

function getSplitterOutputLabel(splitterId, outputIndex, hostObj) {
    outputIndex = parseInt(outputIndex, 10);
    if (isNaN(outputIndex)) return '';
    if (window.EmbeddedSplitters && hostObj) {
        var rec = EmbeddedSplitters.findInHost(hostObj, splitterId);
        if (rec) return getSplitterOutputLabelFromRec(rec, outputIndex);
    }
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return '';
    if (facade._record) return getSplitterOutputLabelFromRec(facade._record, outputIndex);
    var labels = getMapSplitterOutputLabels(facade);
    return labels[outputIndex] ? String(labels[outputIndex]).trim() : '';
}

function syncSplitterOutputConnLabel(rec, outputIndex) {
    if (!rec || outputIndex == null) return;
    outputIndex = parseInt(outputIndex, 10);
    var outs = rec.outputConnections || [];
    var out = outs[outputIndex];
    if (!out) return;
    var label = getSplitterOutputLabelFromRec(rec, outputIndex);
    if (label) out.label = label;
    else delete out.label;
}

function applySplitterOutputLabelToConnection(facade, outputIndex) {
    if (!facade) return;
    if (facade._record) {
        syncSplitterOutputConnLabel(facade._record, outputIndex);
        return;
    }
    var labels = getMapSplitterOutputLabels(facade);
    var label = labels[outputIndex] ? String(labels[outputIndex]).trim() : '';
    var outs = (facade.properties.get('outputConnections') || []).slice();
    if (!outs[outputIndex]) return;
    if (label) outs[outputIndex] = Object.assign({}, outs[outputIndex], { label: label });
    else if (outs[outputIndex].label) {
        var copy = Object.assign({}, outs[outputIndex]);
        delete copy.label;
        outs[outputIndex] = copy;
    }
    facade.properties.set('outputConnections', outs);
}

function refreshSplitterCrossPortLinkLabelDom(splitterId, outputIndex, label) {
    var svg = document.getElementById('fiber-connections-svg');
    if (!svg || !splitterId || outputIndex == null) return;
    var trimmed = label ? String(label).trim() : '';
    var group = svg.querySelector('.fiber-scheme-splitter-cross-link-group[data-splitter-id="' + splitterId + '"][data-output-index="' + outputIndex + '"]');
    if (!group) return;
    var labelG = group.querySelector('.fiber-scheme-splitter-cross-link-label');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    var path = group.querySelector('.fiber-scheme-splitter-cross-link');
    if (!path) return;
    var pathD = path.getAttribute('d');
    if (!pathD || typeof fiberSchemePathMidpoint !== 'function') return;
    var mid = fiberSchemePathMidpoint(pathD);
    var colors = typeof getFiberSchemeLabelColors === 'function' ? getFiberSchemeLabelColors() : { bg: '#fff', border: '#cbd5e1', fill: '#0f172a' };
    var tw = Math.min(148, Math.max(40, trimmed.length * 6.5 + 16));
    var tx = mid.x - tw / 2;
    if (!labelG) {
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-splitter-cross-link-label');
        labelG.setAttribute('data-link-key', 'out-cross:' + splitterId + ':' + outputIndex);
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-splitter-cross-link-label-bg');
        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-splitter-cross-link-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 10px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        group.appendChild(labelG);
    }
    var rect = labelG.querySelector('.fiber-scheme-splitter-cross-link-label-bg');
    var text = labelG.querySelector('.fiber-scheme-splitter-cross-link-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(mid.y - 11));
        rect.setAttribute('width', String(tw));
        rect.setAttribute('height', '21');
        rect.setAttribute('rx', '5');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '0.75');
    }
    if (text) {
        text.setAttribute('x', String(mid.x));
        text.setAttribute('y', String(mid.y + 5));
        text.textContent = trimmed;
    }
    if (typeof selectedSplitterLink !== 'undefined' && selectedSplitterLink &&
        selectedSplitterLink.kind === 'output-cross' &&
        selectedSplitterLink.splitterId === splitterId &&
        selectedSplitterLink.outputIndex === outputIndex) {
        labelG.classList.add('is-visible');
    }
}

function refreshSplitterOutputLabelDom(hostObj, splitterId, outputIndex, label) {
    if (!splitterId || outputIndex == null) return;
    outputIndex = parseInt(outputIndex, 10);
    var trimmed = label ? String(label).trim() : '';
    var selector = '.fiber-item--splitter[data-splitter-id="' + splitterId + '"][data-splitter-fiber-kind="output"][data-output-index="' + outputIndex + '"]';
    document.querySelectorAll(selector).forEach(function(cell) {
        var inp = cell.querySelector('.splitter-output-label-input');
        if (inp && document.activeElement !== inp) inp.value = trimmed;
    });
    document.querySelectorAll('.map-splitter-output-label-input[data-output-index="' + outputIndex + '"]').forEach(function(inp) {
        if (document.activeElement !== inp) inp.value = trimmed;
    });
    var linkKey = 'out:' + splitterId + ':' + outputIndex;
    if (typeof refreshSplitterLinkLabelDom === 'function') refreshSplitterLinkLabelDom(linkKey, trimmed);
    refreshSplitterCrossPortLinkLabelDom(splitterId, outputIndex, trimmed);
}

function setSplitterOutputLabel(hostObj, splitterId, outputIndex, label) {
    if (!splitterId || outputIndex == null || isNaN(parseInt(outputIndex, 10))) return;
    outputIndex = parseInt(outputIndex, 10);
    var trimmed = label ? String(label).trim() : '';
    var facade = resolveSplitterObject(splitterId);
    if (!facade) return;
    var saveHost = hostObj || facade._host || null;
    if (facade._record && facade._host) {
        ensureSplitterOutputLabels(facade._record);
        facade._record.outputLabels[outputIndex] = trimmed;
        syncSplitterOutputConnLabel(facade._record, outputIndex);
        persistEmbeddedSplittersOnHost(facade._host, { skipSync: true });
        saveHost = facade._host;
    } else {
        var ratio = parseInt(facade.properties.get('splitRatio'), 10) || 8;
        var labels = getMapSplitterOutputLabels(facade);
        labels[outputIndex] = trimmed;
        facade.properties.set('outputLabels', labels);
        applySplitterOutputLabelToConnection(facade, outputIndex);
    }
    if (typeof saveData === 'function') {
        saveData(saveHost ? { fiberSchemeViewOnly: true, object: saveHost, syncImmediate: true } : {});
    }
    refreshSplitterOutputLabelDom(saveHost, splitterId, outputIndex, trimmed);
}

function buildSplitterOutputLabelBlock(splitterId, outputIndex, label, isEditMode) {
    if (isEditMode) {
        return '<input type="text" class="splitter-output-label-input form-input" data-splitter-id="' + escapeHtml(splitterId) + '" data-output-index="' + outputIndex + '" value="' + escapeHtml(label || '') + '" placeholder="Подпись выхода…" title="Подпись выхода сплиттера">';
    }
    if (label) {
        return '<div class="fiber-item__label fiber-item__label--splitter-out">📝 ' + escapeHtml(label) + '</div>';
    }
    return '';
}

window.getSplitterOutputLabelFromRec = getSplitterOutputLabelFromRec;
window.ensureSplitterOutputLabels = ensureSplitterOutputLabels;

/** Объединяет назначение выхода сплиттера: маршрут (порт/жила) и конечные устройства (ONU/МК/узел) сохраняются вместе. */
function mergeSplitterOutputConnection(existing, patch, opts) {
    opts = opts || {};
    if (patch && patch.splitterId != null) {
        var childOut = { splitterId: patch.splitterId, routeIds: patch.routeIds || [] };
        if (existing && existing.label) childOut.label = existing.label;
        return childOut;
    }
    var out = existing ? Object.assign({}, existing) : {};
    if (!patch) return out;
    if (patch.crossPort != null) {
        delete out.cableId;
        delete out.fiberNumber;
        out.crossPort = patch.crossPort;
    }
    if (patch.cableId != null) {
        if (!opts.preserveCrossPort) delete out.crossPort;
        out.cableId = patch.cableId;
        out.fiberNumber = patch.fiberNumber;
    }
    if (patch.hostId != null) out.hostId = patch.hostId;
    if (patch.routeIds) out.routeIds = patch.routeIds;
    if (patch.onuId != null) out.onuId = patch.onuId;
    if (patch.mediaConverterId != null) out.mediaConverterId = patch.mediaConverterId;
    if (patch.nodeId != null) {
        out.nodeId = patch.nodeId;
        out.switchId = patch.switchId;
        out.switchPort = patch.switchPort;
    }
    if (patch.label != null) {
        if (patch.label) out.label = patch.label;
        else delete out.label;
    } else if (existing && existing.label) {
        out.label = existing.label;
    }
    return out;
}

function buildSplitterOutputMcAssignRow(outConn, outDisc) {
    if (!outConn || !outConn.mediaConverterId) return '';
    var mcObj = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === outConn.mediaConverterId;
    });
    var mcName = mcObj ? (mcObj.properties.get('name') || 'МК') : 'МК';
    return buildFiberAssignRow('mc', '⇄', '→ ' + escapeHtml(mcName), outDisc);
}

function buildSplitterOutputAssignRows(outConn, outDisc, hostObj, cellCtx) {
    if (!outConn) return '';
    var rows = '';
    if (outConn.splitterId) {
        var childName = window.EmbeddedSplitters ? EmbeddedSplitters.resolveName(outConn.splitterId) : 'Сплиттер';
        rows += buildFiberAssignRow('splitter', '🔀', '→ ' + escapeHtml(childName), outDisc);
        return rows;
    }
    if (outConn.cableId && outConn.fiberNumber != null) {
        var outCable = resolveCableDisplayName((cellCtx && cellCtx.cablesData) || [], outConn.cableId);
        rows += buildFiberAssignRow('fiber', '🔗', '→ ' + escapeHtml(outCable) + ', ж.' + outConn.fiberNumber, outDisc);
    }
    if (outConn.crossPort != null) {
        var outCrossPort = parseInt(outConn.crossPort, 10);
        var outCrossLabel = '→ порт ' + outCrossPort;
        if (cellCtx && cellCtx.isCross && typeof getCrossPortPatch === 'function') {
            var outCrossPatch = getCrossPortPatch(hostObj, outCrossPort);
            if (outCrossPatch) {
                var outPatchMate = typeof resolveCrossPortPatchHost === 'function'
                    ? resolveCrossPortPatchHost(outCrossPatch.crossId) : null;
                var outPatchMateName = outPatchMate ? (outPatchMate.properties.get('name') || 'Кросс') : 'Кросс';
                outCrossLabel = '⇄ п.' + outCrossPort + ' → «' + escapeHtml(outPatchMateName) + '» п.' + outCrossPatch.port;
            }
        }
        rows += buildFiberAssignRow('cross-port', '🔌', outCrossLabel, outDisc);
    }
    if (outConn.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === outConn.onuId; });
        var onuName = onuObj ? (onuObj.properties.get('name') || 'ONU') : 'ONU';
        rows += buildFiberAssignRow('onu', '📡', '→ ' + escapeHtml(onuName), outDisc);
    }
    if (outConn.mediaConverterId) {
        rows += buildSplitterOutputMcAssignRow(outConn, outDisc);
    }
    if (outConn.nodeId) {
        var nodeOut = objects.find(function(o) { return o.properties && o.properties.get('type') === 'node' && getObjectUniqueId(o) === outConn.nodeId; });
        var nodeName = nodeOut ? (nodeOut.properties.get('name') || 'Узел') : 'Узел';
        var portLbl = outConn.switchPort != null ? ' · SFP ' + outConn.switchPort : '';
        rows += buildFiberAssignRow('node', '🖥️', '→ ' + escapeHtml(nodeName) + portLbl, outDisc);
    }
    return rows;
}

function buildSplitterOutputStatusText(outConn) {
    if (!outConn) return '(своб.)';
    if (outConn.splitterId) {
        var childName = window.EmbeddedSplitters ? EmbeddedSplitters.resolveName(outConn.splitterId) : 'Сплиттер';
        return '→ ' + escapeHtml(childName);
    }
    var parts = [];
    if (outConn.cableId && outConn.fiberNumber != null) parts.push('ж.' + outConn.fiberNumber);
    if (outConn.crossPort != null) parts.push('порт ' + parseInt(outConn.crossPort, 10));
    if (outConn.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === outConn.onuId; });
        parts.push('ONU ' + escapeHtml(onuObj ? (onuObj.properties.get('name') || 'ONU') : 'ONU'));
    }
    if (outConn.mediaConverterId) {
        var mcObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === outConn.mediaConverterId; });
        parts.push('МК ' + escapeHtml(mcObj ? (mcObj.properties.get('name') || 'МК') : 'МК'));
    }
    if (outConn.nodeId) {
        var nodeOut = objects.find(function(o) { return o.properties && o.properties.get('type') === 'node' && getObjectUniqueId(o) === outConn.nodeId; });
        var nodeName = nodeOut ? (nodeOut.properties.get('name') || 'Узел') : 'Узел';
        parts.push(escapeHtml(nodeName) + (outConn.switchPort != null ? ' · SFP ' + outConn.switchPort : ''));
    }
    return parts.length ? parts.join(' · ') : '(зан.)';
}

function splitterOutputHasEndpoint(outConn) {
    return !!(outConn && (outConn.onuId || outConn.mediaConverterId || outConn.nodeId || outConn.splitterId));
}

function shouldShowSplitterOutputActionChips(outConn) {
    if (!outConn) return true;
    if (splitterOutputHasEndpoint(outConn)) return false;
    return outConn.crossPort != null || !!(outConn.cableId && outConn.fiberNumber != null);
}

function appendSplitterOutputActionChips(html, splitterId, outputIndex, hostObj, rec, cellCtx, opts, outConn) {
    opts = opts || {};
    outConn = outConn || null;
    if (outConn && splitterOutputHasEndpoint(outConn)) return html;
    var reach = getSplitterOutputRootReach(hostObj, rec, (cellCtx && cellCtx.oltReachCache) || {});
    if (!reach.root) return html;
    var root = reach.root;
    var realOlt = typeof getFiberOltRealAssignment === 'function'
        ? getFiberOltRealAssignment(hostObj, root.cableId, root.fiberNumber) : null;
    var oltBlocks = typeof isFiberOltSpliceBlocked === 'function'
        ? isFiberOltSpliceBlocked(hostObj, root.cableId, root.fiberNumber) : false;
    var isOltCableEnd = typeof getOltAtHostCableEnd === 'function' && !!getOltAtHostCableEnd(hostObj, root.cableId);
    var canConnectToOlt = !!reach.canConnectToOlt;
    var hasOltRelation = !!realOlt || isOltCableEnd || canConnectToOlt;
    var canShowOltIncoming = !hasOltRelation && !oltBlocks;
    var hasOnu = !!(outConn && outConn.onuId);
    var hasMc = !!(outConn && outConn.mediaConverterId);
    var hasNode = !!(outConn && outConn.nodeId);
    var hasCrossPort = outConn && outConn.crossPort != null;

    if (canShowOltIncoming) {
        html += buildSplitterFiberChip('btn-connect-splitter-olt fiber-chip--olt', splitterId, outputIndex, 'Приход OLT (входная жила сплиттера)', 'OLT');
        if (!hasMc) {
            html += buildSplitterFiberChip('btn-connect-splitter-mc fiber-chip--mc', splitterId, outputIndex, 'Медиаконвертер', '⇄ МК');
        }
    } else if (canConnectToOlt && !hasOnu) {
        html += buildSplitterFiberChip('btn-connect-splitter-onu fiber-chip--onu', splitterId, outputIndex, 'GPON на ONU', '📡 ONU');
    } else if (!hasMc && !hasOnu) {
        html += buildSplitterFiberChip('btn-connect-splitter-mc fiber-chip--mc', splitterId, outputIndex, 'Медиаконвертер', '⇄ МК');
    }
    if (!hasNode) {
        html += buildSplitterFiberChip('btn-connect-splitter-node fiber-chip--node', splitterId, outputIndex, 'Подключить к узлу', '🖥️ Узел');
    }
    if (opts.showCrossPortPick && cellCtx && cellCtx.isCross && !hasCrossPort) {
        html += buildSplitterFiberChip('btn-splitter-output-cross-port fiber-chip--cross-port', splitterId, outputIndex, 'Вывести на порт кросса', '🔌 Порт');
    }
    return html;
}

function buildSplitterFiberCell(splitterData, vf, hostObj, isEditMode, cablesData, cellCtx) {
    cellCtx = cellCtx || {};
    var rec = splitterData.rec;
    var spName = splitterData.name;
    var assignRows = '';
    var statusText = '(своб.)';
    var statusKind = 'free';
    var isOccupied = false;
    var isSelectable = false;
    var cellTitle = '';
    var actionChips = '';

    if (vf.kind === 'input') {
        var inSrc = getEmbeddedSplitterInputSource(hostObj, rec);
        isOccupied = !!inSrc;
        isSelectable = isEditMode && !inSrc;
        if (inSrc) {
            statusKind = 'splitter-in';
            if (inSrc.type === 'fiber') {
                var inCable = resolveCableDisplayName(cablesData, inSrc.cableId);
                statusText = '← ' + escapeHtml(inCable) + ' ж.' + inSrc.fiberNumber;
                var inDisc = isEditMode && inSrc.direct ? '<button type="button" class="fiber-assign__disconnect btn-disconnect-splitter" data-cable-id="' + escapeHtml(inSrc.cableId) + '" data-fiber-number="' + inSrc.fiberNumber + '" title="Отключить вход">✕</button>' : '';
                assignRows = buildFiberAssignRow('splitter', '🔀', '← ' + escapeHtml(inCable) + ', ж.' + inSrc.fiberNumber, inDisc);
            } else {
                statusText = '← ' + escapeHtml(inSrc.splitterName) + ' вых.' + (inSrc.outputIndex + 1);
                var parDisc = isEditMode ? '<button type="button" class="fiber-assign__disconnect btn-disconnect-splitter-output" data-splitter-id="' + escapeHtml(inSrc.splitterId) + '" data-output-index="' + inSrc.outputIndex + '" title="Отключить выход родительского сплиттера">✕</button>' : '';
                assignRows = buildFiberAssignRow('splitter', '🔀', '← ' + escapeHtml(inSrc.splitterName) + ' вых.' + (inSrc.outputIndex + 1), parDisc);
            }
        } else if (isEditMode) {
            cellTitle = 'Клик: подключить вход «' + spName + '» (жила на схеме или в таблице кабелей)';
        }
    } else {
        var outs = rec.outputConnections || [];
        var outConn = outs[vf.outputIndex];
        isOccupied = !!outConn;
        isSelectable = isEditMode && !outConn;

        if (outConn && outConn.cableId && outConn.fiberNumber != null &&
            !outConn.mediaConverterId && !outConn.onuId && !outConn.nodeId &&
            typeof cellCtx.renderCableCell === 'function') {
            var proxyCd = cablesData.find(function(c) { return c.cableUniqueId === outConn.cableId; });
            var proxyFiber = proxyCd ? proxyCd.fibers.find(function(f) { return f.number === outConn.fiberNumber; }) : null;
            if (proxyCd && proxyFiber) {
                var proxyHtml = cellCtx.renderCableCell(proxyCd, proxyFiber);
                var outCable = resolveCableDisplayName(cablesData, outConn.cableId);
                var outLabelProxy = getSplitterOutputLabelFromRec(rec, vf.outputIndex);
                var hint = '<div class="fiber-item__splitter-proxy-hint">→ ' + escapeHtml(outCable) + ' · ж.' + outConn.fiberNumber + '</div>';
                var labelBlockProxy = buildSplitterOutputLabelBlock(splitterData.splitterId, vf.outputIndex, outLabelProxy, isEditMode);
                return proxyHtml
                    .replace('class="fiber-item ', 'class="fiber-item fiber-item--splitter fiber-item--splitter-output-proxy ')
                    .replace('<div class="fiber-item', '<div data-splitter-id="' + escapeHtml(splitterData.splitterId) + '" data-output-index="' + vf.outputIndex + '" data-splitter-fiber-kind="output" class="fiber-item fiber-item--splitter fiber-item--splitter-output-proxy')
                    .replace('<div class="fiber-item__head">', hint + '<div class="fiber-item__head">')
                    + (labelBlockProxy ? labelBlockProxy : '');
            }
        }

        if (outConn) {
            statusKind = 'splitter-out';
            var outDisc = isEditMode ? '<button type="button" class="fiber-assign__disconnect btn-disconnect-splitter-output" data-splitter-id="' + escapeHtml(splitterData.splitterId) + '" data-output-index="' + vf.outputIndex + '" title="Отключить выход">✕</button>' : '';
            statusText = buildSplitterOutputStatusText(outConn);
            assignRows = buildSplitterOutputAssignRows(outConn, outDisc, hostObj, Object.assign({}, cellCtx, { cablesData: cablesData }));
            var outCrossPortNum = outConn.crossPort != null ? parseInt(outConn.crossPort, 10) : NaN;
            if (isEditMode && shouldShowSplitterOutputActionChips(outConn)) {
                if (cellCtx.isCross && !isNaN(outCrossPortNum) && !outConn.splitterId) {
                    actionChips = appendSplitterOutputActionChips(actionChips, splitterData.splitterId, vf.outputIndex, hostObj, rec, cellCtx, { showCrossPortPick: false }, outConn);
                    var outCanPatch = typeof isCrossPortAvailableForPatch === 'function' && isCrossPortAvailableForPatch(hostObj, outCrossPortNum);
                    if (outCanPatch) {
                        actionChips += '<button type="button" class="fiber-chip btn-cross-port-patch fiber-chip--cross-patch" data-cross-port="' + outCrossPortNum + '" title="Кроссировать порт ' + outCrossPortNum + ' с другим кроссом">⇄ Кросс</button>';
                    }
                    cellTitle = 'Выход на порт ' + outCrossPortNum + '. Подключите ONU, узел или МК. Отключить — ✕.';
                } else if (!outConn.crossPort && outConn.cableId) {
                    actionChips = appendSplitterOutputActionChips(actionChips, splitterData.splitterId, vf.outputIndex, hostObj, rec, cellCtx, { showCrossPortPick: !!cellCtx.isCross }, outConn);
                    cellTitle = 'Выход сращен с жилой. Подключите ONU, узел или МК. Отключить — ✕.';
                }
            }
        } else if (isEditMode) {
            if (!getSplitterOutputRootReach(hostObj, rec, cellCtx.oltReachCache).root) {
                cellTitle = 'Сначала подключите вход сплиттера';
            } else {
                cellTitle = cellCtx.isCross
                    ? 'Клик: сращивание с жилой, свободный порт кросса или подключение к объекту'
                    : 'Клик: сращивание с жилой кабеля или подключение к объекту';
                actionChips = appendSplitterOutputActionChips(actionChips, splitterData.splitterId, vf.outputIndex, hostObj, rec, cellCtx, { showCrossPortPick: true }, null);
            }
        }
    }

    var fiberTextColor = '#fff';
    var numLabel = vf.kind === 'input' ? 'вх' : String(vf.number);
    var displayName = vf.name;
    var labelBlock = vf.kind === 'output'
        ? buildSplitterOutputLabelBlock(splitterData.splitterId, vf.outputIndex, getSplitterOutputLabelFromRec(rec, vf.outputIndex), isEditMode)
        : '';
    var itemClasses = 'fiber-item fiber-item--splitter fiber-item--splitter-' + vf.kind + ' fiber-item--' + statusKind + (isOccupied ? ' fiber-occupied' : '');
    var actionsBlock = actionChips ? '<div class="fiber-item__actions">' + actionChips + '</div>' : '';
    return '<div class="' + itemClasses + '" data-splitter-id="' + escapeHtml(splitterData.splitterId) + '" data-splitter-fiber-kind="' + vf.kind + '"' +
        (vf.kind === 'output' ? ' data-output-index="' + vf.outputIndex + '"' : '') +
        ' data-fiber-number="' + vf.number + '" data-fiber-occupied="' + isOccupied + '" data-fiber-selectable="' + isSelectable + '"' +
        (cellTitle ? ' title="' + cellTitle.replace(/"/g, '&quot;') + '"' : '') + '>' +
        '<div class="fiber-item__head">' +
        '<div class="fiber-color fiber-color--splitter" style="background-color:' + vf.color + ';--fiber-num-color:' + fiberTextColor + ';border-color:rgba(234,88,12,0.55)"><span class="fiber-num">' + numLabel + '</span></div>' +
        '<span class="fiber-item__name">' + escapeHtml(displayName) + '</span>' +
        '<span class="fiber-item__status">' + statusText + '</span>' +
        '</div>' +
        labelBlock +
        (assignRows ? '<div class="fiber-item__assigns">' + assignRows + '</div>' : '') +
        actionsBlock +
        '</div>';
}

var schemeSplitterEditId = null;

function buildFiberSchemeSplitterPanelsHtml() {
    var html = '';
    html += '<div id="fiber-scheme-splitter-edit-panel" class="fiber-conn-label-modal" hidden aria-hidden="true" role="dialog">';
    html += '<div class="fiber-conn-label-modal__backdrop" id="fiber-scheme-splitter-edit-backdrop"></div>';
    html += '<div class="fiber-conn-label-modal__panel panel-glass panel-glass--lite fiber-scheme-splitter-edit-panel">';
    html += '<div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>';
    html += '<div class="fiber-conn-label-modal__header">';
    html += '<h3 class="fiber-conn-label-modal__title">Сплиттер на схеме</h3>';
    html += '<button type="button" id="fiber-scheme-splitter-edit-close" class="fiber-conn-label-modal__close" title="Закрыть">×</button>';
    html += '</div>';
    html += '<div class="fiber-conn-label-modal__body">';
    html += '<label class="fiber-conn-label-modal__label" for="fiber-scheme-splitter-edit-name">Название</label>';
    html += '<input type="text" id="fiber-scheme-splitter-edit-name" class="form-input" placeholder="Сплиттер" autocomplete="off" maxlength="64">';
    html += '<label class="fiber-conn-label-modal__label" for="fiber-scheme-splitter-edit-ratio">Количество выходных жил</label>';
    html += '<select id="fiber-scheme-splitter-edit-ratio" class="form-select">' + buildEmbeddedSplitterRatioOptionsHtml(8) + '</select>';
    html += '<label class="fiber-scheme-splitter-orient-label"><input type="checkbox" id="fiber-scheme-splitter-edit-mirrored"> Зеркально (вход справа, выходы слева)</label>';
    html += '<p id="fiber-scheme-splitter-edit-warn" class="fiber-scheme-splitter-panel-hint fiber-scheme-splitter-panel-hint--warn" hidden></p>';
    html += '<p class="fiber-scheme-splitter-panel-hint">Уменьшение числа выходов отключит лишние соединения.</p>';
    html += '<div class="fiber-conn-label-modal__actions">';
    html += '<button type="button" id="fiber-scheme-splitter-edit-confirm" class="btn-primary">Сохранить</button>';
    html += '<button type="button" id="fiber-scheme-splitter-edit-cancel" class="btn-secondary">Отмена</button>';
    html += '</div></div></div></div>';
    html += '<div id="fiber-scheme-splitter-add-panel" class="fiber-conn-label-modal" hidden aria-hidden="true" role="dialog">';
    html += '<div class="fiber-conn-label-modal__backdrop" id="fiber-scheme-splitter-add-backdrop"></div>';
    html += '<div class="fiber-conn-label-modal__panel panel-glass panel-glass--lite fiber-scheme-splitter-add-panel">';
    html += '<div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>';
    html += '<div class="fiber-conn-label-modal__header">';
    html += '<h3 class="fiber-conn-label-modal__title">Новый сплиттер</h3>';
    html += '<button type="button" id="fiber-scheme-splitter-add-close" class="fiber-conn-label-modal__close" title="Закрыть">×</button>';
    html += '</div>';
    html += '<div class="fiber-conn-label-modal__body">';
    html += '<label class="fiber-conn-label-modal__label" for="fiber-scheme-splitter-ratio">Количество выходных жил</label>';
    html += '<select id="fiber-scheme-splitter-ratio" class="form-select">' + buildEmbeddedSplitterRatioOptionsHtml(8) + '</select>';
    html += '<p class="fiber-scheme-splitter-panel-hint">Одна входная жила делится на выбранное число выходов (1:N). Выходы сращиваются с жилами или подключаются ко входу другого сплиттера.</p>';
    html += '<div class="fiber-conn-label-modal__actions">';
    html += '<button type="button" id="fiber-scheme-splitter-add-confirm" class="btn-primary">Добавить на схему</button>';
    html += '<button type="button" id="fiber-scheme-splitter-add-cancel" class="btn-secondary">Отмена</button>';
    html += '</div></div></div></div>';
    return html;
}

function closeFiberSchemeSplitterAddPanel() {
    var panel = document.getElementById('fiber-scheme-splitter-add-panel');
    if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
}

function openFiberSchemeSplitterAddPanel() {
    closeFiberSchemeSplitterEditPanel();
    var panel = document.getElementById('fiber-scheme-splitter-add-panel');
    if (panel) { panel.hidden = false; panel.setAttribute('aria-hidden', 'false'); }
    var ratioEl = document.getElementById('fiber-scheme-splitter-ratio');
    if (ratioEl) ratioEl.focus();
}

function closeFiberSchemeSplitterEditPanel() {
    schemeSplitterEditId = null;
    var panel = document.getElementById('fiber-scheme-splitter-edit-panel');
    if (panel) { panel.hidden = true; panel.setAttribute('aria-hidden', 'true'); }
    var warn = document.getElementById('fiber-scheme-splitter-edit-warn');
    if (warn) { warn.hidden = true; warn.textContent = ''; }
}

function countSplitterOutputsBeyond(rec, newRatio) {
    if (!rec) return 0;
    var outs = rec.outputConnections || [];
    var n = 0;
    for (var i = newRatio; i < outs.length; i++) {
        var o = outs[i];
        if (o && (o.cableId || o.onuId || o.splitterId || o.hostId)) n++;
    }
    return n;
}

function refreshSplitterEditWarn(hostObj, splitterId) {
    var warnEl = document.getElementById('fiber-scheme-splitter-edit-warn');
    var ratioEl = document.getElementById('fiber-scheme-splitter-edit-ratio');
    if (!warnEl || !hostObj || !splitterId || !window.EmbeddedSplitters) return;
    var rec = EmbeddedSplitters.findInHost(hostObj, splitterId);
    if (!rec) return;
    var newRatio = ratioEl ? (parseInt(ratioEl.value, 10) || 8) : parseInt(rec.splitRatio, 10) || 8;
    var oldRatio = parseInt(rec.splitRatio, 10) || 8;
    var lost = countSplitterOutputsBeyond(rec, newRatio);
    if (newRatio < oldRatio && lost > 0) {
        warnEl.textContent = 'Будет отключено соединений: ' + lost + '.';
        warnEl.hidden = false;
    } else {
        warnEl.hidden = true;
        warnEl.textContent = '';
    }
}

function openFiberSchemeSplitterEditPanel(hostObj, splitterId) {
    if (!hostObj || !splitterId || !window.EmbeddedSplitters) return;
    var rec = EmbeddedSplitters.findInHost(hostObj, splitterId);
    if (!rec) return;
    closeFiberSchemeSplitterAddPanel();
    schemeSplitterEditId = splitterId;
    var panel = document.getElementById('fiber-scheme-splitter-edit-panel');
    var nameEl = document.getElementById('fiber-scheme-splitter-edit-name');
    var ratioEl = document.getElementById('fiber-scheme-splitter-edit-ratio');
    if (nameEl) nameEl.value = rec.name || '';
    if (ratioEl) ratioEl.value = String(parseInt(rec.splitRatio, 10) || 8);
    var mirrorEl = document.getElementById('fiber-scheme-splitter-edit-mirrored');
    if (mirrorEl) mirrorEl.checked = EmbeddedSplitters.isSchemeMirrored ? EmbeddedSplitters.isSchemeMirrored(rec) : !!rec.schemeMirrored;
    refreshSplitterEditWarn(hostObj, splitterId);
    if (panel) { panel.hidden = false; panel.setAttribute('aria-hidden', 'false'); }
    if (nameEl) {
        try { nameEl.focus(); nameEl.select(); } catch (e) {}
    }
}

function confirmFiberSchemeSplitterEdit(hostObj) {
    if (!hostObj || !schemeSplitterEditId || !window.EmbeddedSplitters) return;
    var rec = EmbeddedSplitters.findInHost(hostObj, schemeSplitterEditId);
    if (!rec) { closeFiberSchemeSplitterEditPanel(); return; }
    var nameEl = document.getElementById('fiber-scheme-splitter-edit-name');
    var ratioEl = document.getElementById('fiber-scheme-splitter-edit-ratio');
    var mirrorEl = document.getElementById('fiber-scheme-splitter-edit-mirrored');
    var name = nameEl ? String(nameEl.value).trim() : '';
    var newRatio = ratioEl ? (parseInt(ratioEl.value, 10) || 8) : parseInt(rec.splitRatio, 10) || 8;
    var schemeMirrored = mirrorEl ? !!mirrorEl.checked : (EmbeddedSplitters.isSchemeMirrored ? EmbeddedSplitters.isSchemeMirrored(rec) : !!rec.schemeMirrored);
    if (!name) {
        if (typeof showWarning === 'function') showWarning('Укажите название сплиттера.', 'Сплиттер');
        else if (nameEl) nameEl.focus();
        return;
    }
    if (EMBEDDED_SPLITTER_RATIOS.indexOf(newRatio) === -1) {
        if (typeof showWarning === 'function') showWarning('Выберите допустимое число выходных жил.', 'Сплиттер');
        return;
    }
    var oldRatio = parseInt(rec.splitRatio, 10) || 8;
    var lost = countSplitterOutputsBeyond(rec, newRatio);
    var doSave = function() {
        var svg = document.getElementById('fiber-connections-svg');
        var svgW = svg ? (parseFloat(svg.getAttribute('width')) || 800) : 800;
        var svgH = svg ? (parseFloat(svg.getAttribute('height')) || 400) : 400;
        EmbeddedSplitters.update(hostObj, schemeSplitterEditId, {
            name: name,
            splitRatio: newRatio,
            schemeMirrored: schemeMirrored,
            svgWidth: svgW,
            svgHeight: svgH
        });
        closeFiberSchemeSplitterEditPanel();
        refreshFiberHostModal(hostObj);
        if (typeof showSuccess === 'function') showSuccess('Сплиттер обновлён.', 'Схема');
    };
    if (newRatio < oldRatio && lost > 0) {
        var msg = 'Число выходов уменьшится с ' + oldRatio + ' до ' + newRatio + '. Будет отключено соединений: ' + lost + '. Продолжить?';
        if (typeof showConfirm === 'function') {
            showConfirm(msg, 'Изменение сплиттера', { confirmText: 'Сохранить' }).then(function(ok) {
                if (ok) doSave();
            });
        } else if (window.confirm(msg)) doSave();
        return;
    }
    doSave();
}
