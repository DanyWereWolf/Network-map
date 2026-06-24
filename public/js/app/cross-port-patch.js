/**
 * Кроссировка портов панели между оптическими кроссами (логический патч-корд).
 */
var schemeCrossPortLinkMode = false;
var schemeCrossPortLinkSource = null;

function getCrossPortPatches(crossObj) {
    if (!crossObj || !crossObj.properties || !isCrossLikeHostType(crossObj.properties.get('type'))) return {};
    var patches = crossObj.properties.get('crossPortPatches');
    return patches && typeof patches === 'object' ? patches : {};
}

function getCrossPortPatch(crossObj, portNum) {
    if (!crossObj || portNum == null) return null;
    var entry = getCrossPortPatches(crossObj)[String(portNum)];
    if (!entry || entry.crossId == null || entry.port == null) return null;
    var targetPort = parseInt(entry.port, 10);
    if (isNaN(targetPort) || targetPort < 1) return null;
    return { crossId: String(entry.crossId), port: targetPort };
}

function isCrossPortPatched(crossObj, portNum) {
    return !!getCrossPortPatch(crossObj, portNum);
}

/** Жила на порту, который кроссирован с другим кроссом — только трассировка через патч. */
function isFiberCrossPatchLocked(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    if (typeof getCrossPortForFiber !== 'function') return false;
    var port = getCrossPortForFiber(crossObj, cableId, fiberNumber);
    if (port == null) return false;
    return isCrossPortPatched(crossObj, port);
}

function blockIfFiberCrossPatchLocked(crossObj, cableId, fiberNumber) {
    if (!isFiberCrossPatchLocked(crossObj, cableId, fiberNumber)) return false;
    if (typeof showToast === 'function') {
        showToast('Жила на кроссированном порту — подключение к узлу, OLT, ONU и МК недоступно', 'warning');
    }
    return true;
}

function getCrossPortVisualMeta(crossObj, portNum, opts) {
    opts = opts || {};
    if (!crossObj || portNum == null || isNaN(parseInt(portNum, 10))) {
        return { state: 'none', stateLabel: '', shortLabel: '', optionSuffix: '', selectDisabled: false };
    }
    portNum = parseInt(portNum, 10);
    var patch = getCrossPortPatch(crossObj, portNum);
    if (patch) {
        var mate = resolveCrossPortPatchHost(patch.crossId);
        var mateName = mate ? (mate.properties.get('name') || 'Кросс') : 'Кросс';
        return {
            state: 'patched',
            stateLabel: '⇄ «' + mateName + '» п.' + patch.port,
            shortLabel: 'кроссировка',
            optionSuffix: '(кросс.)',
            selectDisabled: isCrossPortOptionDisabledForFiber(crossObj, portNum, opts.cableId, opts.fiberNumber)
        };
    }
    if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(crossObj, portNum)) {
        return {
            state: 'olt',
            stateLabel: 'занят PON OLT',
            shortLabel: 'PON',
            optionSuffix: '(PON)',
            selectDisabled: true
        };
    }
    var fiberKeys = typeof getCrossPortFiberKeys === 'function' ? getCrossPortFiberKeys(crossObj, portNum) : [];
    var spOnPort = typeof findSplitterOutputOnCrossPort === 'function' ? findSplitterOutputOnCrossPort(crossObj, portNum) : null;
    if (fiberKeys.length) {
        var fiberLabel = fiberKeys.length > 1 ? ('жил: ' + fiberKeys.length) : 'жила на порту';
        if (spOnPort) fiberLabel = 'сплиттер → ' + fiberLabel;
        return {
            state: 'fiber',
            stateLabel: fiberLabel,
            shortLabel: spOnPort ? 'сплиттер' : 'жила',
            optionSuffix: '',
            selectDisabled: isCrossPortOptionDisabledForFiber(crossObj, portNum, opts.cableId, opts.fiberNumber)
        };
    }
    if (spOnPort) {
        return {
            state: 'splitter',
            stateLabel: '«' + (spOnPort.splitterName || 'Сплиттер') + '» вых.' + (spOnPort.outputIndex + 1),
            shortLabel: 'сплиттер',
            optionSuffix: '',
            selectDisabled: false
        };
    }
    return {
        state: 'free',
        stateLabel: 'свободен',
        shortLabel: 'свободен',
        optionSuffix: '',
        selectDisabled: false
    };
}

function isCrossPortOptionDisabledForFiber(crossObj, portNum, cableId, fiberNumber) {
    if (!crossObj || portNum == null) return false;
    if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(crossObj, portNum)) return true;
    if (!isCrossPortPatched(crossObj, portNum)) return false;
    if (!cableId || fiberNumber == null) return true;
    var selfKey = cableId + '-' + fiberNumber;
    var keys = typeof getCrossPortFiberKeys === 'function' ? getCrossPortFiberKeys(crossObj, portNum) : [];
    if (!keys.length) return false;
    return keys.indexOf(selfKey) === -1;
}

function buildCrossPortTableRowHtml(crossObj, crossPorts, cableId, fiberNumber, currentPort, isEditMode, isDirectSpliced) {
    if (!crossPorts || !crossObj) return '';
    if (isDirectSpliced) {
        return '<div class="fiber-port-row fiber-port-row--view fiber-port-row--spliced">' +
            '<span class="fiber-port-row__lbl">Порт</span>' +
            '<span class="fiber-port-row__val">—</span>' +
            '<span class="fiber-port-row__hint">сращена</span></div>';
    }
    var portNum = currentPort ? parseInt(currentPort, 10) : null;
    var meta = portNum && !isNaN(portNum)
        ? getCrossPortVisualMeta(crossObj, portNum, { cableId: cableId, fiberNumber: fiberNumber })
        : getCrossPortVisualMeta(crossObj, null);
    var rowState = portNum && !isNaN(portNum) ? meta.state : 'none';
    var rowClass = 'fiber-port-row fiber-port-row--' + rowState;
    if (!isEditMode) {
        var viewBadge = portNum ? '<span class="fiber-port-badge fiber-port-badge--' + meta.state + '">' + portNum + '</span>' : '<span class="fiber-port-row__val">—</span>';
        var viewState = portNum && meta.stateLabel
            ? '<span class="fiber-port-state fiber-port-state--' + meta.state + '">' + escapeHtml(meta.stateLabel) + '</span>'
            : '';
        return '<div class="' + rowClass + ' fiber-port-row--view">' +
            '<span class="fiber-port-row__lbl">Порт</span>' + viewBadge + viewState + '</div>';
    }
    var options = '<option value="">—</option>';
    for (var p = 1; p <= crossPorts; p++) {
        var pm = getCrossPortVisualMeta(crossObj, p, { cableId: cableId, fiberNumber: fiberNumber });
        var dis = pm.selectDisabled ? ' disabled' : '';
        var sel = currentPort === String(p) ? ' selected' : '';
        var suffix = pm.optionSuffix ? ' ' + pm.optionSuffix : '';
        options += '<option value="' + p + '"' + sel + dis + '>Порт ' + p + suffix + '</option>';
    }
    var badgeHtml = portNum && !isNaN(portNum)
        ? '<span class="fiber-port-badge fiber-port-badge--' + meta.state + '" title="' + escapeHtml(meta.stateLabel || '') + '">' + portNum + '</span>'
        : '';
    var stateHtml = portNum && meta.stateLabel
        ? '<span class="fiber-port-state fiber-port-state--' + meta.state + '">' + escapeHtml(meta.stateLabel) + '</span>'
        : '';
    var portDisc = (isEditMode && portNum && !isNaN(portNum))
        ? '<button type="button" class="fiber-port-row__disconnect btn-disconnect-fiber-port" data-cable-id="' + escapeHtml(cableId) + '" data-fiber-number="' + fiberNumber + '" title="Снять жилу с порта">✕</button>'
        : '';
    return '<div class="' + rowClass + '">' +
        '<span class="fiber-port-row__lbl">Порт</span>' +
        '<div class="fiber-port-row__controls">' + badgeHtml +
        '<select class="fiber-port-select form-select" data-cable-id="' + escapeHtml(cableId) + '" data-fiber-number="' + fiberNumber + '" title="Порт кросса">' + options + '</select>' +
        stateHtml + portDisc + '</div></div>';
}

function resolveCrossPortPatchHost(crossId) {
    if (!crossId) return null;
    if (typeof resolveOltCrossForConnect === 'function') {
        var resolved = resolveOltCrossForConnect(crossId);
        if (resolved) return resolved;
    }
    return objects.find(function(o) {
        return o && o.properties && o.properties.get('uniqueId') === crossId &&
            isCrossLikeHostType(o.properties.get('type'));
    }) || null;
}

function isCrossPortAvailableForPatch(crossObj, portNum) {
    if (!crossObj || portNum == null) return false;
    var port = parseInt(portNum, 10);
    if (isNaN(port) || port < 1) return false;
    var maxPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    if (port > maxPorts) return false;
    if (isCrossPortPatched(crossObj, port)) return false;
    if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(crossObj, port)) return false;
    if (typeof isCrossPortOltIncomingOccupied === 'function' && isCrossPortOltIncomingOccupied(crossObj, port)) return false;
    return true;
}

function getConnectableCrossPortsForPatch(crossObj, sourceCross, sourcePort) {
    if (!crossObj || !sourceCross) return [];
    var crossPorts = Math.max(1, parseInt(crossObj.properties.get('crossPorts'), 10) || 24);
    var sourceUid = getObjectUniqueId(sourceCross);
    var targetUid = getObjectUniqueId(crossObj);
    if (!targetUid || targetUid === sourceUid) return [];
    var options = [];
    for (var p = 1; p <= crossPorts; p++) {
        if (!isCrossPortAvailableForPatch(crossObj, p)) continue;
        var fiberKeys = typeof getCrossPortFiberKeys === 'function' ? getCrossPortFiberKeys(crossObj, p) : [];
        var fiberHint = fiberKeys.length ? ' · жила на порту' : '';
        options.push({
            portNumber: p,
            label: 'Порт ' + p + fiberHint
        });
    }
    return options;
}

function connectCrossPorts(crossA, portA, crossB, portB) {
    if (!crossA || !crossB || portA == null || portB == null) return false;
    portA = parseInt(portA, 10);
    portB = parseInt(portB, 10);
    if (isNaN(portA) || isNaN(portB) || portA < 1 || portB < 1) return false;
    var uidA = getObjectUniqueId(crossA);
    var uidB = getObjectUniqueId(crossB);
    if (!uidA || !uidB || uidA === uidB) {
        if (typeof showError === 'function') showError('Выберите порты на разных кроссах.', 'Кроссировка');
        return false;
    }
    if (!isCrossPortAvailableForPatch(crossA, portA)) {
        if (typeof showError === 'function') showError('Исходный порт ' + portA + ' занят или недоступен для кроссировки.', 'Порт занят');
        return false;
    }
    if (!isCrossPortAvailableForPatch(crossB, portB)) {
        if (typeof showError === 'function') showError('Целевой порт ' + portB + ' занят или недоступен для кроссировки.', 'Порт занят');
        return false;
    }
    var patchesA = Object.assign({}, getCrossPortPatches(crossA));
    var patchesB = Object.assign({}, getCrossPortPatches(crossB));
    patchesA[String(portA)] = { crossId: uidB, port: portB };
    patchesB[String(portB)] = { crossId: uidA, port: portA };
    crossA.properties.set('crossPortPatches', patchesA);
    crossB.properties.set('crossPortPatches', patchesB);
    if (typeof saveData === 'function') saveData();
    return true;
}

function disconnectCrossPort(crossObj, portNum) {
    if (!crossObj || portNum == null) return false;
    portNum = parseInt(portNum, 10);
    if (isNaN(portNum)) return false;
    var patch = getCrossPortPatch(crossObj, portNum);
    if (!patch) return false;
    var patchesA = Object.assign({}, getCrossPortPatches(crossObj));
    delete patchesA[String(portNum)];
    crossObj.properties.set('crossPortPatches', patchesA);
    var crossB = resolveCrossPortPatchHost(patch.crossId);
    if (crossB) {
        var patchesB = Object.assign({}, getCrossPortPatches(crossB));
        delete patchesB[String(patch.port)];
        crossB.properties.set('crossPortPatches', patchesB);
    }
    if (typeof saveData === 'function') saveData();
    return true;
}

function removeCrossPortPatchesReferencingCross(deletedCrossUid) {
    if (!deletedCrossUid) return;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties || !isCrossLikeHostType(obj.properties.get('type'))) return;
        if (getObjectUniqueId(obj) === deletedCrossUid) return;
        var patches = getCrossPortPatches(obj);
        var keys = Object.keys(patches);
        if (!keys.length) return;
        var changed = false;
        var next = Object.assign({}, patches);
        keys.forEach(function(portKey) {
            var entry = patches[portKey];
            if (entry && String(entry.crossId) === String(deletedCrossUid)) {
                delete next[portKey];
                changed = true;
            }
        });
        if (changed) obj.properties.set('crossPortPatches', next);
    });
}

function clearSchemeCrossPortLinkPick() {
    schemeCrossPortLinkSource = null;
    updateSchemeCrossPortLinkUI();
}

function setSchemeCrossPortLinkMode(active) {
    schemeCrossPortLinkMode = !!active;
    if (!schemeCrossPortLinkMode) clearSchemeCrossPortLinkPick();
    updateSchemeCrossPortLinkUI();
}

function updateSchemeCrossPortLinkUI() {
    var btn = document.getElementById('fiber-scheme-cross-port-link');
    if (btn) btn.classList.toggle('fiber-scheme-toolbar-btn--active', !!schemeCrossPortLinkMode);
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--link-source').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--link-source');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port--link-target').forEach(function(el) {
        el.classList.remove('fiber-scheme-cross-port--link-target');
    });
    if (schemeCrossPortLinkSource && schemeCrossPortLinkSource.hostObj) {
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port[data-cross-port="' + schemeCrossPortLinkSource.portNumber + '"]').forEach(function(el) {
            el.classList.add('fiber-scheme-cross-port--link-source');
        });
    } else if (schemeCrossPortLinkMode) {
        document.querySelectorAll('#fiber-connections-svg .fiber-scheme-cross-port').forEach(function(el) {
            el.classList.add('fiber-scheme-cross-port--link-target');
        });
    }
    var bar = document.getElementById('fiber-scheme-wire-bar');
    if (!bar || !schemeCrossPortLinkMode) return;
    bar.style.display = 'flex';
    if (schemeCrossPortLinkSource && schemeCrossPortLinkSource.hostObj) {
        bar.innerHTML = '<span class="fiber-selection-text fiber-scheme-wire-bar-text">Порт <strong>' + schemeCrossPortLinkSource.portNumber +
            '</strong>: выберите <strong>целевой кросс и порт</strong> в окне или нажмите «Выбрать кросс».</span>' +
            '<button type="button" class="fiber-selection-cancel" id="fiberSchemeCrossPortLinkOpenBtn">Выбрать кросс</button>' +
            '<button type="button" class="fiber-selection-cancel" id="fiberSchemeCrossPortLinkCancelBtn">Отмена</button>';
        var openBtn = document.getElementById('fiberSchemeCrossPortLinkOpenBtn');
        if (openBtn) openBtn.addEventListener('click', function() {
            if (schemeCrossPortLinkSource) showCrossPortPatchDialog(schemeCrossPortLinkSource.hostObj, schemeCrossPortLinkSource.portNumber);
        });
        var cancelBtn = document.getElementById('fiberSchemeCrossPortLinkCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { setSchemeCrossPortLinkMode(false); });
    } else {
        bar.innerHTML = '<span class="fiber-selection-text fiber-scheme-wire-bar-text">Режим <strong>кроссировки</strong>: кликните <strong>свободный порт</strong> на панели кросса.</span>' +
            '<button type="button" class="fiber-selection-cancel" id="fiberSchemeCrossPortLinkCancelBtn">Отмена</button>';
        var cancelBtn2 = document.getElementById('fiberSchemeCrossPortLinkCancelBtn');
        if (cancelBtn2) cancelBtn2.addEventListener('click', function() { setSchemeCrossPortLinkMode(false); });
    }
}

function startCrossPortPatchFromScheme(crossObj, portNumber) {
    if (!crossObj || portNumber == null || !isEditMode) return;
    if (!isCrossPortAvailableForPatch(crossObj, portNumber)) {
        if (typeof showError === 'function') showError('Порт ' + portNumber + ' занят (кроссировка, PON или жила).', 'Порт недоступен');
        return;
    }
    if (typeof clearAllSchemeSplitterPicks === 'function') clearAllSchemeSplitterPicks();
    schemeCrossPortLinkSource = { hostObj: crossObj, portNumber: parseInt(portNumber, 10) };
    updateSchemeCrossPortLinkUI();
    if (typeof switchFiberWorkspaceToSchemeTab === 'function') switchFiberWorkspaceToSchemeTab();
    showCrossPortPatchDialog(crossObj, portNumber);
}

function getCrossPortPatchTargetCrosses(sourceCross) {
    if (!sourceCross || !sourceCross.geometry) return [];
    var sourceCoords = sourceCross.geometry.getCoordinates && sourceCross.geometry.getCoordinates();
    if (!sourceCoords || sourceCoords.length < 2) return [];
    if (typeof groupKey !== 'function') return [];
    var sourceUid = getObjectUniqueId(sourceCross);
    var mapCrosses = typeof getMapCrossObjects === 'function' ? getMapCrossObjects() : [];
    return mapCrosses.filter(function(c) {
        if (getObjectUniqueId(c) === sourceUid) return false;
        var coords = c.geometry && c.geometry.getCoordinates ? c.geometry.getCoordinates() : null;
        if (!coords || coords.length < 2) return false;
        return typeof coordsInSameObjectGroup === 'function'
            ? coordsInSameObjectGroup(coords, sourceCoords)
            : groupKey(coords) === groupKey(sourceCoords);
    });
}

function showCrossPortPatchDialog(sourceCross, sourcePort) {
    if (!sourceCross || sourcePort == null) return;
    var targets = getCrossPortPatchTargetCrosses(sourceCross);
    if (!targets.length) {
        if (typeof showWarning === 'function') showWarning('В этой группе нет других кроссов для кроссировки.', 'Нет кроссов');
        return;
    }
    nodeSelectionModalData = {
        mode: 'crossPortPatch',
        sourceCross: sourceCross,
        sourcePort: parseInt(sourcePort, 10),
        crosses: targets,
        phase: 'crossList'
    };
    var modal = document.getElementById('nodeSelectionModal');
    var fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    var searchInput = document.getElementById('nodeSearchInput');
    var sourceName = sourceCross.properties.get('name') || 'Кросс';
    setCrossPortPatchModalChrome('Кроссировка портов кроссов', 'Выберите целевой кросс', 'Введите имя кросса...');
    if (fiberInfo) {
        fiberInfo.textContent = 'Кросс «' + sourceName + '», порт ' + sourcePort + ': выберите кросс и свободный порт назначения.';
    }
    if (searchInput) searchInput.value = '';
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = targets.length > 1 ? '' : 'none';
    renderCrossPortPatchCrossList(targets, '');
    if (modal) modal.style.display = 'block';
    if (targets.length === 1) {
        selectCrossPortPatchTargetByUid(targets[0].properties.get('uniqueId'));
    } else {
        setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
    }
}

function setCrossPortPatchModalChrome(titleText, listLabel, searchPlaceholder) {
    var modal = document.getElementById('nodeSelectionModal');
    if (!modal) return;
    var title = modal.querySelector('.group-balloon-title');
    if (title) title.textContent = titleText || 'Кроссировка портов';
    var labels = modal.querySelectorAll('.modal-body .form-group > label');
    if (labels[0]) labels[0].textContent = 'Поиск кросса';
    if (labels[1]) labels[1].textContent = listLabel || 'Выберите кросс';
    var searchInput = document.getElementById('nodeSearchInput');
    if (searchInput) searchInput.placeholder = searchPlaceholder || 'Введите имя кросса...';
}

function renderCrossPortPatchCrossList(crosses, searchQuery) {
    var nodeListContainer = document.getElementById('nodeListContainer');
    if (!nodeListContainer) return;
    if (!crosses || !crosses.length) {
        nodeListContainer.innerHTML = '<div class="node-list-empty"><p>Нет доступных кроссов</p></div>';
        return;
    }
    var query = (searchQuery || '').toLowerCase().trim();
    var filtered = query ? crosses.filter(function(cross) {
        var name = (cross.properties.get('name') || 'Кросс').toLowerCase();
        return name.indexOf(query) !== -1;
    }) : crosses;
    if (!filtered.length) {
        nodeListContainer.innerHTML = '<div class="node-list-no-results">Кроссы не найдены по запросу «' + escapeHtml(searchQuery) + '»</div>';
        return;
    }
    var html = '';
    filtered.forEach(function(cross) {
        var crossUid = cross.properties.get('uniqueId') || '';
        var name = cross.properties.get('name') || 'Кросс';
        var coords = cross.geometry && cross.geometry.getCoordinates ? cross.geometry.getCoordinates() : null;
        var coordsStr = coords ? (coords[0].toFixed(6) + ', ' + coords[1].toFixed(6)) : '';
        var displayName = escapeHtml(name);
        if (query) {
            var regex = new RegExp('(' + escapeRegExpForSearch(query) + ')', 'gi');
            displayName = name.replace(regex, '<mark>$1</mark>');
        }
        html += '<div class="node-list-item" data-cross-uid="' + escapeHtml(crossUid) + '" onclick="selectCrossPortPatchTargetByUid(\'' + escapeHtml(crossUid) + '\')">';
        html += '<div class="node-list-item-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line></svg></div>';
        html += '<div class="node-list-item-info"><div class="node-list-item-name">' + displayName + '</div>';
        if (coordsStr) html += '<div class="node-list-item-coords">' + coordsStr + '</div>';
        html += '</div></div>';
    });
    nodeListContainer.innerHTML = html;
}

function selectCrossPortPatchTargetByUid(crossUid) {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'crossPortPatch') return;
    var crossObj = resolveCrossPortPatchHost(crossUid);
    if (!crossObj) {
        showError('Кросс не найден. Обновите список и повторите.', 'Кросс');
        return;
    }
    var sourceCross = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(d.sourceCross)
        : d.sourceCross;
    crossObj = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(crossObj)
        : crossObj;
    var options = getConnectableCrossPortsForPatch(crossObj, sourceCross, d.sourcePort);
    if (!options.length) {
        var crossName = crossObj.properties.get('name') || 'Кросс';
        showError('На кроссе «' + crossName + '» нет свободных портов для кроссировки.', 'Нет портов');
        return;
    }
    d.phase = 'crossPort';
    d.selectedCross = crossObj;
    d.crossPortOptions = options;
    renderCrossPortPatchPortSelectionUI();
}

function renderCrossPortPatchPortSelectionUI() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'crossPortPatch' || d.phase !== 'crossPort' || !d.selectedCross || !d.crossPortOptions) return;
    var container = document.getElementById('nodeListContainer');
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = 'none';
    var crossName = escapeHtml(d.selectedCross.properties.get('name') || 'Кросс');
    var sourceName = escapeHtml((d.sourceCross && d.sourceCross.properties.get('name')) || 'Кросс');
    var selOpts = d.crossPortOptions.map(function(o, idx) {
        return '<option value="' + idx + '">' + escapeHtml(o.label) + '</option>';
    }).join('');
    var html = '<div style="padding: 8px 0;">';
    html += '<p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">«' + sourceName + '» порт <strong>' + d.sourcePort + '</strong> → кросс <strong>' + crossName + '</strong>. Выберите свободный порт.</p>';
    html += '<div class="form-group" style="margin-bottom: 12px;"><label for="crossPortPatchSelect" style="font-size: 0.8125rem;">Порт кросса</label>';
    html += '<select id="crossPortPatchSelect" class="form-select">' + selOpts + '</select></div>';
    html += '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">';
    html += '<button type="button" id="nodeFiberBackBtn" class="btn-secondary">Назад</button>';
    html += '<button type="button" id="nodeFiberConfirmBtn" class="btn-primary">Соединить</button></div></div>';
    if (container) container.innerHTML = html;
}

function backCrossPortPatchToList() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'crossPortPatch') return;
    d.phase = 'crossList';
    d.selectedCross = null;
    d.crossPortOptions = null;
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    var crosses = d.crosses || [];
    if (searchGroup) searchGroup.style.display = crosses.length > 1 ? '' : 'none';
    setCrossPortPatchModalChrome('Кроссировка портов кроссов', 'Выберите целевой кросс', 'Введите имя кросса...');
    renderCrossPortPatchCrossList(crosses, searchInput ? searchInput.value : '');
}

function confirmCrossPortPatchConnect() {
    var d = nodeSelectionModalData;
    if (!d || d.mode !== 'crossPortPatch' || d.phase !== 'crossPort' || !d.selectedCross) return;
    var sel = document.getElementById('crossPortPatchSelect');
    var idx = sel && sel.value !== '' ? parseInt(sel.value, 10) : NaN;
    if (isNaN(idx) || !d.crossPortOptions || idx < 0 || idx >= d.crossPortOptions.length) {
        showError('Выберите порт кросса.', 'Порт');
        return;
    }
    var opt = d.crossPortOptions[idx];
    var sourceCross = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(d.sourceCross)
        : d.sourceCross;
    var targetCross = typeof rehydrateCrossConnectHost === 'function'
        ? rehydrateCrossConnectHost(d.selectedCross)
        : d.selectedCross;
    if (!connectCrossPorts(sourceCross, d.sourcePort, targetCross, opt.portNumber)) return;
    if (typeof closeNodeSelectionModal === 'function') closeNodeSelectionModal();
    setSchemeCrossPortLinkMode(false);
    var srcName = sourceCross.properties.get('name') || 'Кросс';
    var tgtName = targetCross.properties.get('name') || 'Кросс';
    if (typeof showSuccess === 'function') {
        showSuccess('Порт ' + d.sourcePort + ' («' + srcName + '») соединён с портом ' + opt.portNumber + ' («' + tgtName + '»).', 'Кроссировка');
    }
    if (typeof refreshFiberHostModal === 'function') refreshFiberHostModal(sourceCross);
    else if (typeof refreshObjectModal === 'function') refreshObjectModal(sourceCross);
}

function setupCrossPortPatchHandlers(hostObj) {
    if (!hostObj || !isEditMode || !isCrossLikeHostType(hostObj.properties.get('type'))) return;
    document.querySelectorAll('.btn-cross-port-patch').forEach(function(btn) {
        if (btn.dataset.crossPatchBound) return;
        btn.dataset.crossPatchBound = '1';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var portNum = parseInt(this.getAttribute('data-cross-port'), 10);
            if (isNaN(portNum)) return;
            if (typeof startCrossPortPatchFromScheme === 'function') {
                startCrossPortPatchFromScheme(hostObj, portNum);
            } else if (typeof showCrossPortPatchDialog === 'function') {
                showCrossPortPatchDialog(hostObj, portNum);
            }
        });
    });
    document.querySelectorAll('.btn-disconnect-cross-patch').forEach(function(btn) {
        if (btn.dataset.crossPatchBound) return;
        btn.dataset.crossPatchBound = '1';
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var portNum = parseInt(this.getAttribute('data-cross-port'), 10);
            if (isNaN(portNum) || typeof disconnectCrossPort !== 'function') return;
            if (!disconnectCrossPort(hostObj, portNum)) return;
            if (typeof showSuccess === 'function') showSuccess('Кроссировка порта ' + portNum + ' отключена.', 'Кроссировка');
            if (typeof refreshObjectModal === 'function') refreshObjectModal(hostObj);
            else if (typeof showObjectInfo === 'function') showObjectInfo(hostObj);
        });
    });
}

function buildCrossPortPatchRowHtml(hostObj, portNum, isEditMode) {
    if (!hostObj || portNum == null) return '';
    var patch = typeof getCrossPortPatch === 'function' ? getCrossPortPatch(hostObj, portNum) : null;
    var patched = !!patch;
    var fiberKeys = typeof getCrossPortFiberKeys === 'function' ? getCrossPortFiberKeys(hostObj, portNum) : [];
    var fiberHint = '—';
    if (fiberKeys.length) {
        var parts = fiberKeys.map(function(key) {
            var parsed = typeof parseFiberPortKey === 'function' ? parseFiberPortKey(key) : null;
            return parsed ? ('ж.' + parsed.fiberNumber) : null;
        }).filter(Boolean);
        if (parts.length) fiberHint = parts.join(', ');
    }
    var spOnPort = typeof findSplitterOutputOnCrossPort === 'function' ? findSplitterOutputOnCrossPort(hostObj, portNum) : null;
    if (spOnPort && !fiberKeys.length) {
        fiberHint = 'спл. «' + (spOnPort.splitterName || 'Сплиттер') + '» вых.' + (spOnPort.outputIndex + 1);
    } else if (spOnPort && fiberHint !== '—') {
        fiberHint += ' · спл. вых.' + (spOnPort.outputIndex + 1);
    }
    var patchText = '—';
    var statusText = 'свободен';
    var statusClass = 'cross-port-patch-status--free';
    if (patched && patch) {
        var mate = typeof resolveCrossPortPatchHost === 'function' ? resolveCrossPortPatchHost(patch.crossId) : null;
        var mateName = mate ? (mate.properties.get('name') || 'Кросс') : 'Кросс';
        patchText = '→ «' + escapeHtml(mateName) + '» п.' + patch.port;
        statusText = 'кроссировка';
        statusClass = 'cross-port-patch-status--patched';
    } else if (typeof isCrossPortLinkedToOlt === 'function' && isCrossPortLinkedToOlt(hostObj, portNum)) {
        statusText = 'PON OLT';
        statusClass = 'cross-port-patch-status--busy';
    } else if (fiberKeys.length) {
        statusText = spOnPort ? 'сплиттер → порт' : 'жила на порту';
        statusClass = 'cross-port-patch-status--fiber';
    } else if (spOnPort) {
        statusText = 'сплиттер → порт';
        statusClass = 'cross-port-patch-status--fiber';
    }
    var actionHtml = '';
    var actionTd = '';
    if (isEditMode) {
        if (patched) {
            actionHtml = '<button type="button" class="btn-secondary btn-disconnect-cross-patch" data-cross-port="' + portNum + '" title="Отключить кроссировку">Отключить</button>';
        } else if (typeof isCrossPortAvailableForPatch === 'function' && isCrossPortAvailableForPatch(hostObj, portNum)) {
            actionHtml = '<button type="button" class="btn-primary btn-cross-port-patch" data-cross-port="' + portNum + '" title="Соединить с портом другого кросса">Соединить</button>';
        } else {
            actionHtml = '<span class="cross-port-patch-muted">недоступен</span>';
        }
        actionTd = '<td class="cross-port-patch-td-action">' + actionHtml + '</td>';
    }
    return '<tr class="cross-port-patch-row' + (patched ? ' cross-port-patch-row--patched' : '') + '">' +
        '<td class="cross-port-patch-td-num">' + portNum + '</td>' +
        '<td><span class="cross-port-patch-status ' + statusClass + '">' + escapeHtml(statusText) + '</span></td>' +
        '<td class="cross-port-patch-td-fiber">' + escapeHtml(fiberHint) + '</td>' +
        '<td class="cross-port-patch-td-target">' + patchText + '</td>' +
        actionTd +
        '</tr>';
}

function buildCrossPortPatchTableHtml(hostObj, crossPorts, isEditMode) {
    if (!hostObj || !crossPorts || crossPorts < 1) return '';
    var rows = '';
    for (var p = 1; p <= crossPorts; p++) {
        rows += buildCrossPortPatchRowHtml(hostObj, p, isEditMode);
    }
    var hint = isEditMode
        ? 'Соедините порт этого кросса с портом другого кросса. Трассировка жилы пройдёт через кроссировку.'
        : 'Логические соединения портов панели с другими кроссами.';
    return '<div class="cross-port-patch-section">' +
        '<h4 class="fiber-ws-panel-title fiber-ws-panel-title--table">Кроссировка портов</h4>' +
        '<p class="cross-port-patch-hint">' + hint + '</p>' +
        '<div class="cross-port-patch-table-wrap">' +
        '<table class="cross-port-patch-table">' +
        '<thead><tr>' +
        '<th>Порт</th><th>Статус</th><th>Жила</th><th>Соединение</th>' + (isEditMode ? '<th></th>' : '') +
        '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

/**
 * Продолжение трассировки через кроссировку портов.
 * Возвращает { outFiber, targetCross } или { ended: true } или null.
 */
function tryTraverseCrossPortPatch(path, crossObj, cableId, fiberNumber, visitedPatchKeys, portNumOverride) {
    if (!crossObj || !path || !visitedPatchKeys) return null;
    if (crossObj.properties.get('type') !== 'cross') return null;
    var portNum = portNumOverride != null ? parseInt(portNumOverride, 10) : null;
    if (portNum == null || isNaN(portNum)) {
        if (typeof getCrossPortForFiber !== 'function') return null;
        portNum = getCrossPortForFiber(crossObj, cableId, fiberNumber);
    }
    if (portNum == null) return null;
    var patch = getCrossPortPatch(crossObj, portNum);
    if (!patch) return null;
    var visitKey = getObjectUniqueId(crossObj) + '|' + portNum + '>' + patch.crossId + '|' + patch.port;
    if (visitedPatchKeys.has(visitKey)) return null;
    visitedPatchKeys.add(visitKey);
    var targetCross = resolveCrossPortPatchHost(patch.crossId);
    if (!targetCross) return null;
    var fromName = crossObj.properties.get('name') || 'Кросс';
    var toName = targetCross.properties.get('name') || 'Кросс';
    path.push({
        type: 'crossPortPatch',
        fromCross: crossObj,
        fromPort: portNum,
        fromCrossName: fromName,
        toCross: targetCross,
        toPort: patch.port,
        toCrossName: toName
    });
    path.push({
        type: 'object',
        objectType: 'cross',
        objectName: toName,
        object: targetCross,
        port: patch.port
    });
    var fiberKeys = typeof getCrossPortFiberKeys === 'function' ? getCrossPortFiberKeys(targetCross, patch.port) : [];
    if (!fiberKeys.length) return { ended: true };
    var selfKey = cableId + '-' + fiberNumber;
    var outFiber = null;
    for (var i = 0; i < fiberKeys.length; i++) {
        var parsed = typeof parseFiberPortKey === 'function' ? parseFiberPortKey(fiberKeys[i]) : null;
        if (!parsed) continue;
        var tk = parsed.cableId + '-' + parsed.fiberNumber;
        if (tk !== selfKey) {
            outFiber = parsed;
            break;
        }
    }
    if (!outFiber) {
        var first = typeof parseFiberPortKey === 'function' ? parseFiberPortKey(fiberKeys[0]) : null;
        if (first) outFiber = first;
    }
    if (!outFiber) return { ended: true };
    return { outFiber: outFiber, targetCross: targetCross, fromCross: crossObj };
}

function applyCrossPortPatchTraceContinuation(path, crossObj, cableId, fiberNumber, currentCable, visitedPatchKeys, portNumOverride) {
    var hop = tryTraverseCrossPortPatch(path, crossObj, cableId, fiberNumber, visitedPatchKeys, portNumOverride);
    if (!hop) return null;
    if (hop.ended) return { break: true };
    if (!hop.outFiber || !hop.targetCross) return { break: true };
    var fiberLabels = crossObj.properties.get('fiberLabels') || {};
    var targetLabels = hop.targetCross.properties.get('fiberLabels') || {};
    path.push({
        type: 'connection',
        fromCableId: cableId,
        fromFiberNumber: fiberNumber,
        fromLabel: fiberLabels[cableId + '-' + fiberNumber] || '',
        fromCableType: currentCable ? currentCable.properties.get('cableType') : null,
        toCableId: hop.outFiber.cableId,
        toFiberNumber: hop.outFiber.fiberNumber,
        toLabel: targetLabels[hop.outFiber.cableId + '-' + hop.outFiber.fiberNumber] || '',
        toCableType: null,
        crossPortPatch: true
    });
    return {
        currentCableId: hop.outFiber.cableId,
        currentFiberNumber: hop.outFiber.fiberNumber,
        currentObject: hop.targetCross,
        previousObject: crossObj
    };
}
