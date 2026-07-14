/**
 * Рабочее место жил: SVG-схема, sidebar, раскладка.
 */
function updateCableVisualization() {
    const groups = getCableGroups();

    const labelsToRemove = objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'cableLabel'
    );

    if (labelsToRemove.length) {
        labelsToRemove.forEach(function(label) {
            mapGeoRemove(label);
        });
        var labelSet = new Set(labelsToRemove);
        objects = objects.filter(function(o) { return !labelSet.has(o); });
    }

    groups.forEach((group, key) => {
        if (group.cables.length > 1) {
            
            const midLat = (group.fromCoords[0] + group.toCoords[0]) / 2;
            const midLon = (group.fromCoords[1] + group.toCoords[1]) / 2;
            const midCoords = [midLat, midLon];

            const label = new ymaps.Placemark(midCoords, {}, {
                iconLayout: 'default#imageWithContent',
                iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
                iconImageSize: [1, 1],
                iconImageOffset: [0, 0],
                iconContent: `<div style="background: rgba(255, 255, 255, 0.95); border: 2px solid #3b82f6; border-radius: 12px; padding: 4px 8px; font-size: 11px; font-weight: bold; color: #1e40af; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2); white-space: nowrap;">${group.cables.length} каб.</div>`,
                iconContentOffset: [0, 0],
                zIndex: 500,
                zIndexHover: 500,
                cursor: 'default',
                hasBalloon: false,
                hasHint: false
            });
            
            label.properties.set('type', 'cableLabel');
            label.properties.set('cables', group.cables);
            
            objects.push(label);
            mapPerfRegister(label);
            mapGeoAdd(label);
        }
    });
    if (typeof applyMapFilter === 'function') applyMapFilter();
}

function getUsedFibers(obj, cableUniqueId) {
    
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
        obj.properties.set('usedFibers', usedFibersData);
    }
    
    return usedFibersData[cableUniqueId] || [];
}

/** Занятая жила: проходная, сращена или выведена на узел/OLT/ONU и т.д. — нельзя выбрать для нового сращивания. */
function computeFiberOccupancy(cableUniqueId, fiberNumber, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections, hostObj) {
    const fiberKey = cableUniqueId + '-' + fiberNumber;
    const isUsed = cableData ? cableData.usedFibers.includes(fiberNumber) : false;
    const isDirectSpliced = (fiberConnections || []).some(function(conn) {
        return (conn.from.cableId === cableUniqueId && conn.from.fiberNumber === fiberNumber) ||
            (conn.to.cableId === cableUniqueId && conn.to.fiberNumber === fiberNumber);
    });
    const isConnected = isDirectSpliced;
    const nodeConn = hostObj ? getHostAssignment(hostObj, 'nodeConnections', cableUniqueId, fiberNumber) : (nodeConnections && nodeConnections[fiberKey]);
    const realOltAssign = hostObj ? getFiberOltRealAssignment(hostObj, cableUniqueId, fiberNumber) : null;
    const oltConnDisplay = hostObj ? getFiberOltAssignment(hostObj, cableUniqueId, fiberNumber) : (oltConnections && oltConnections[fiberKey]);
    const onuConn = hostObj ? getHostAssignment(hostObj, 'onuConnections', cableUniqueId, fiberNumber) : (onuConnections && onuConnections[fiberKey]);
    const mcConn = hostObj ? getHostAssignment(hostObj, 'mediaConverterConnections', cableUniqueId, fiberNumber) : (mediaConverterConnections && mediaConverterConnections[fiberKey]);
    const rbConn = hostObj ? getHostAssignment(hostObj, 'radioBridgeConnections', cableUniqueId, fiberNumber) : null;
    const spConn = hostObj ? getHostAssignment(hostObj, 'splitterConnections', cableUniqueId, fiberNumber) : (splitterConnections && splitterConnections[fiberKey]);
    const hasNodeConnection = !!nodeConn;
    const hasDirectOltConnection = !!realOltAssign;
    const hasOltConnection = !!oltConnDisplay;
    const hasOnuConnection = !!onuConn;
    const hasMcConnection = !!(mcConn && mcConn.mediaConverterId);
    const hasRbConnection = !!(rbConn && rbConn.radioBridgeId);
    const hasSplitterConnection = !!(spConn && spConn.splitterId);
    const splitterOutputAtHost = hostObj ? findSplitterOutputAtHost(hostObj, cableUniqueId, fiberNumber) : null;
    const hasSplitterOutputAtHost = !!splitterOutputAtHost;
    const oltBlocksSplice = hostObj ? isFiberOltSpliceBlocked(hostObj, cableUniqueId, fiberNumber) : !!(realOltAssign && realOltAssign.incoming);
    const hasAnyOutConnection = hasNodeConnection || hasDirectOltConnection || hasOnuConnection || hasMcConnection || hasRbConnection || hasSplitterConnection || hasSplitterOutputAtHost;
    const isGponFeeder = hasDirectOltConnection && (hasOnuConnection || hasSplitterConnection);
    const isGponUpstreamOnly = hasDirectOltConnection && !hasOnuConnection && !hasSplitterConnection && !hasNodeConnection && !hasMcConnection && !hasRbConnection;
    const isOltCableEnd = !!(cableData && cableData.isFromOlt) && !hasDirectOltConnection && !oltBlocksSplice;
    const isOccupied = isUsed || isConnected || hasAnyOutConnection;
    return {
        isUsed: isUsed,
        isConnected: isConnected,
        hasAnyOutConnection: hasAnyOutConnection,
        hasOltConnection: hasOltConnection,
        hasDirectOltConnection: hasDirectOltConnection,
        oltBlocksSplice: oltBlocksSplice,
        isOltCableEnd: isOltCableEnd,
        hasOnuConnection: hasOnuConnection,
        hasSplitterConnection: hasSplitterConnection,
        hasNodeConnection: hasNodeConnection,
        hasMcConnection: hasMcConnection,
        hasRbConnection: hasRbConnection,
        isGponFeeder: isGponFeeder,
        isGponUpstreamOnly: isGponUpstreamOnly,
        isOccupied: isOccupied
    };
}

function setUsedFibers(obj, cableUniqueId, fiberNumbers) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
        obj.properties.set('usedFibers', usedFibersData);
    }
    
    usedFibersData[cableUniqueId] = fiberNumbers;
    obj.properties.set('usedFibers', usedFibersData);
    saveData();
}

function buildFiberSidebarSplittersHtml(sleeveObj, isEditMode) {
    if (!window.EmbeddedSplitters) return '';
    var list = EmbeddedSplitters.getList(sleeveObj);
    if (!list.length) return '';
    var h = '<div class="fiber-ws-card fiber-ws-splitters-block">';
    h += '<div class="fiber-ws-scheme-size-head">';
    h += '<h4 class="fiber-ws-subsection-title">Сплиттеры</h4>';
    h += '<span class="fiber-ws-scheme-size-current">' + list.length + '</span>';
    h += '</div>';
    h += '<ul class="fiber-ws-splitter-list">';
    list.forEach(function(rec) {
        var ratio = parseInt(rec.splitRatio, 10) || 8;
        var hasIn = !!(rec.inputCableId && rec.inputFiberNumber != null);
        var outs = (rec.outputConnections || []).filter(function(o) { return o && (o.cableId || o.onuId || o.splitterId || o.hostId); }).length;
        h += '<li class="fiber-ws-splitter-item">';
        h += '<button type="button" class="fiber-ws-splitter-locate" data-splitter-id="' + escapeHtml(rec.id) + '" title="Показать на схеме">';
        h += '<span class="fiber-ws-splitter-item-name">' + escapeHtml(rec.name || 'Сплиттер') + '</span>';
        h += '<span class="fiber-ws-splitter-item-meta">1:' + ratio + (hasIn ? ' · вх.' + rec.inputFiberNumber : ' · нет вх.') + ' · ' + outs + '/' + ratio + '</span>';
        h += '</button>';
        if (isEditMode) {
            h += '<button type="button" class="fiber-ws-splitter-edit" data-splitter-id="' + escapeHtml(rec.id) + '" title="Изменить название и число выходов">✎</button>';
        }
        h += '</li>';
    });
    h += '</ul>';
    if (isEditMode) {
        h += '<button type="button" class="btn-secondary fiber-ws-splitter-reset" id="fiber-scheme-reset-splitters" title="Вернуть все сплиттеры в центр схемы">↺ Позиции</button>';
    }
    h += '</div>';
    return h;
}

function scrollSchemeToSplitter(hostObj, splitterId) {
    if (!window.EmbeddedSplitters || !splitterId) return;
    var rec = EmbeddedSplitters.findInHost(hostObj, splitterId);
    if (!rec || rec.schemeX == null || rec.schemeY == null) return;
    var root = document.querySelector('.fiber-workspace');
    if (root) {
        var tab = root.querySelector('.fiber-ws-tab[data-tab="scheme"]');
        if (tab) tab.click();
    }
    var viewport = document.getElementById('fiber-scheme-viewport');
    var inner = document.getElementById('fiber-scheme-zoom-inner');
    if (!viewport || !inner) return;
    var zoom = parseFloat(sessionStorage.getItem('fiberSchemeZoom') || '1');
    if (isNaN(zoom)) zoom = 1;
    var x = rec.schemeX * zoom;
    var y = rec.schemeY * zoom;
    viewport.scrollTo({
        left: Math.max(0, x - viewport.clientWidth / 2),
        top: Math.max(0, y - viewport.clientHeight / 2),
        behavior: 'smooth'
    });
    var g = document.querySelector('#fiber-connections-svg .fiber-scheme-splitter[data-splitter-id="' + splitterId + '"]');
    if (g) {
        g.classList.add('fiber-scheme-splitter--highlight');
        setTimeout(function() { g.classList.remove('fiber-scheme-splitter--highlight'); }, 1600);
    }
}

function fitSchemeViewToSplitters(hostObj) {
    if (!window.EmbeddedSplitters) return;
    var list = EmbeddedSplitters.getList(hostObj);
    if (!list.length) return;
    var svg = document.getElementById('fiber-connections-svg');
    var viewport = document.getElementById('fiber-scheme-viewport');
    if (!svg || !viewport) return;
    var root = document.querySelector('.fiber-workspace');
    if (root) {
        var tab = root.querySelector('.fiber-ws-tab[data-tab="scheme"]');
        if (tab) tab.click();
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    list.forEach(function(rec) {
        if (rec.schemeX == null || rec.schemeY == null) return;
        var spBox = EmbeddedSplitters.computeSchemeSplitterBox
            ? EmbeddedSplitters.computeSchemeSplitterBox(rec.splitRatio, EmbeddedSplitters.getSchemeOrientation ? EmbeddedSplitters.getSchemeOrientation(rec) : 'horizontal')
            : { w: EmbeddedSplitters.DEFAULT_W, h: EmbeddedSplitters.splitterHeight ? EmbeddedSplitters.splitterHeight(rec.splitRatio) : 52 };
        var hw = spBox.w / 2 + 8;
        var hh = spBox.h / 2 + 8;
        minX = Math.min(minX, rec.schemeX - hw);
        maxX = Math.max(maxX, rec.schemeX + hw);
        minY = Math.min(minY, rec.schemeY - hh);
        maxY = Math.max(maxY, rec.schemeY + hh);
    });
    if (!isFinite(minX)) return;
    var zoom = parseFloat(sessionStorage.getItem('fiberSchemeZoom') || '1');
    if (isNaN(zoom)) zoom = 1;
    var cx = ((minX + maxX) / 2) * zoom;
    var cy = ((minY + maxY) / 2) * zoom;
    viewport.scrollTo({
        left: Math.max(0, cx - viewport.clientWidth / 2),
        top: Math.max(0, cy - viewport.clientHeight / 2),
        behavior: 'smooth'
    });
}

function buildFiberSchemeCanvasSizeHtml(sleeveObj, isEditMode, schemeSize) {
    if (!isEditMode) return '';
    schemeSize = schemeSize || {};
    var stored = getFiberSchemeCanvasStored(sleeveObj);
    var curW = schemeSize.svgWidth || 0;
    var curH = schemeSize.svgHeight || 0;
    var layoutH = schemeSize.layoutHeight || 0;
    var extraH = (layoutH && curH > layoutH) ? (curH - layoutH) : 0;
    var h = '<div class="fiber-ws-card fiber-ws-scheme-size-block">';
    h += '<div class="fiber-ws-scheme-size-head">';
    h += '<h4 class="fiber-ws-subsection-title">Размер схемы</h4>';
    h += '<span class="fiber-ws-scheme-size-current" title="Текущий размер холста">' + curW + '×' + curH + '</span>';
    h += '</div>';
    if (extraH) {
        h += '<p class="fiber-ws-scheme-size-hint">+ ' + extraH + ' px под сплиттеры</p>';
    }
    h += '<div class="fiber-ws-scheme-size-edit">';
    h += '<div class="fiber-ws-scheme-size-dims">';
    h += '<div class="fiber-ws-scheme-size-row"><label class="fiber-ws-label" for="fiber-scheme-canvas-width">Ширина</label>';
    h += '<input type="number" id="fiber-scheme-canvas-width" class="form-input" min="' + FIBER_SCHEME_CANVAS.WIDTH_MIN + '" max="' + FIBER_SCHEME_CANVAS.WIDTH_MAX + '" step="20" placeholder="Авто" value="' + (stored.width > 0 ? stored.width : '') + '"></div>';
    h += '<div class="fiber-ws-scheme-size-row"><label class="fiber-ws-label" for="fiber-scheme-canvas-height">Высота</label>';
    h += '<input type="number" id="fiber-scheme-canvas-height" class="form-input" min="' + FIBER_SCHEME_CANVAS.HEIGHT_MIN + '" max="' + FIBER_SCHEME_CANVAS.HEIGHT_MAX + '" step="20" placeholder="Авто" value="' + (stored.height > 0 ? stored.height : '') + '"></div>';
    h += '</div>';
    h += '<div class="fiber-ws-scheme-size-toolbar">';
    h += '<div class="fiber-ws-scheme-size-presets" role="group" aria-label="Пресеты размера">';
    FIBER_SCHEME_CANVAS_PRESETS.forEach(function(p) {
        h += '<button type="button" class="btn-secondary fiber-scheme-canvas-preset" data-canvas-w="' + p.width + '" data-canvas-h="' + p.height + '" title="' + p.width + '×' + p.height + '">' + p.label + '</button>';
    });
    h += '</div>';
    h += '<div class="fiber-ws-scheme-size-actions">';
    h += '<button type="button" class="btn-primary" id="fiber-scheme-canvas-apply">ОК</button>';
    h += '<button type="button" class="btn-secondary" id="fiber-scheme-canvas-auto" title="Размер по кабелям">Авто</button>';
    h += '</div></div>';
    h += '<p class="fiber-ws-scheme-size-hint fiber-ws-scheme-size-hint--muted">Пусто = авто · не меньше зоны жил</p>';
    h += '</div></div>';
    return h;
}

function buildFiberSchemeCrossGridHtml(sleeveObj, isEditMode, crossLayout) {
    if (!isEditMode || !sleeveObj || !isCrossLikeHostType(sleeveObj.properties.get('type'))) return '';
    var crossPorts = Math.max(1, parseInt(sleeveObj.properties.get('crossPorts'), 10) || 24);
    var storedRows = typeof getFiberSchemeCrossRows === 'function' ? getFiberSchemeCrossRows(sleeveObj) : 0;
    var curPpr = crossLayout && crossLayout.portsPerRow ? crossLayout.portsPerRow : 0;
    var curRows = crossLayout && crossLayout.numRows ? crossLayout.numRows : 0;
    var maxRows = Math.min(24, crossPorts);
    var h = '<div class="fiber-ws-card fiber-ws-scheme-size-block fiber-ws-cross-grid-block">';
    h += '<div class="fiber-ws-scheme-size-head">';
    h += '<h4 class="fiber-ws-subsection-title">Сетка портов</h4>';
    if (curPpr && curRows) {
        h += '<span class="fiber-ws-scheme-size-current" title="портов в ряду × строк">' + curPpr + '×' + curRows + ' · ' + crossPorts + '</span>';
    } else {
        h += '<span class="fiber-ws-scheme-size-current">' + crossPorts + ' порт.</span>';
    }
    h += '</div>';
    h += '<div class="fiber-ws-scheme-size-edit">';
    h += '<div class="fiber-ws-scheme-size-row fiber-ws-scheme-size-row--inline"><label class="fiber-ws-label" for="fiber-scheme-cross-rows">Строк</label>';
    h += '<input type="number" id="fiber-scheme-cross-rows" class="form-input" min="1" max="' + maxRows + '" step="1" placeholder="Авто" value="' + (storedRows > 0 ? storedRows : '') + '"></div>';
    h += '<div class="fiber-ws-scheme-size-toolbar">';
    h += '<div class="fiber-ws-scheme-size-presets" role="group" aria-label="Число строк панели кросса">';
    [0, 1, 2, 3, 4, 6].forEach(function(r) {
        var label = r === 0 ? 'Авт' : String(r);
        var active = (r === 0 && !storedRows) || (r > 0 && storedRows === r);
        h += '<button type="button" class="btn-secondary fiber-scheme-cross-rows-preset' + (active ? ' is-active' : '') + '" data-cross-rows="' + r + '" title="' + (r === 0 ? 'По ширине схемы' : r + ' строк') + '">' + label + '</button>';
    });
    h += '</div>';
    h += '<div class="fiber-ws-scheme-size-actions">';
    h += '<button type="button" class="btn-primary" id="fiber-scheme-cross-rows-apply">ОК</button>';
    h += '<button type="button" class="btn-secondary" id="fiber-scheme-cross-rows-auto">Авто</button>';
    h += '</div></div>';
    h += '<p class="fiber-ws-scheme-size-hint fiber-ws-scheme-size-hint--muted">3 строки × 48 порт. → по 16 в ряду</p>';
    h += '</div></div>';
    return h;
}

function buildFiberSchemeCableSidesHtml(sleeveObj, isEditMode, cablesData) {
    if (!isEditMode || !cablesData || cablesData.length < 1) return '';
    var h = '<div class="fiber-ws-card fiber-ws-cable-sides-block">';
    h += '<div class="fiber-ws-scheme-size-head">';
    h += '<h4 class="fiber-ws-subsection-title">Стороны кабелей</h4>';
    h += '<span class="fiber-ws-scheme-size-hint fiber-ws-scheme-size-hint--inline" title="← ↑ → сторона · ⇄ зеркало жил">←↑→ · ⇄</span>';
    h += '</div>';
    h += '<ul class="fiber-ws-cable-side-list">';
    cablesData.forEach(function(cableData, index) {
        var title = cableData.cableName || ('Кабель ' + cableData.index);
        var side = resolveCableSchemeSide(sleeveObj, cableData.cableUniqueId, index, cablesData.length);
        var sideLabel = getCableSchemeSideLabel(side);
        var mirrored = typeof isCableSchemeMirrored === 'function' && isCableSchemeMirrored(sleeveObj, cableData.cableUniqueId);
        h += '<li class="fiber-ws-cable-side-item">';
        h += '<span class="fiber-ws-cable-side-name" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</span>';
        h += '<span class="fiber-ws-cable-side-label">' + sideLabel + (mirrored ? ' · зерк.' : '') + '</span>';
        h += '<div class="fiber-ws-cable-side-btns" role="group" aria-label="Сторона кабеля">';
        FIBER_SCHEME_CABLE_SIDES.forEach(function(sideId) {
            var icon = sideId === 'left' ? '←' : (sideId === 'top' ? '↑' : '→');
            var active = side === sideId ? ' is-active' : '';
            h += '<button type="button" class="fiber-ws-cable-side-btn' + active + '" data-cable-id="' + escapeHtml(cableData.cableUniqueId) + '" data-cable-side="' + sideId + '" title="' + getCableSchemeSideLabel(sideId) + '">' + icon + '</button>';
        });
        h += '<button type="button" class="fiber-ws-cable-mirror-btn' + (mirrored ? ' is-active' : '') + '" data-cable-id="' + escapeHtml(cableData.cableUniqueId) + '" title="Зеркалировать жилы (подписи не переворачиваются)">⇄</button>';
        h += '</div></li>';
    });
    h += '</ul></div>';
    return h;
}

function buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode, schemeSize, crossLayout) {
    const name = sleeveObj.properties.get('name') || '';
    const hostType = sleeveObj.properties.get('type');
    const isCassette = hostType === 'spliceCassette';
    const typeBadgeClass = isCross ? 'fiber-ws-type-badge--cross' : (isCassette ? 'fiber-ws-type-badge--cassette' : 'fiber-ws-type-badge--sleeve');
    const typeLabel = isCross ? 'Оптический кросс' : (isCassette ? 'Сплайс-кассета' : 'Кабельная муфта');
    const objType = isCross ? 'cross' : (isCassette ? 'spliceCassette' : 'sleeve');
    let iconBlock = '';
    if (window.MapIcons) {
        const nodeKind = !isCross && sleeveObj.properties ? (sleeveObj.properties.get('nodeKind') || 'network') : 'network';
        iconBlock = '<div class="fiber-ws-head-icon">' + MapIcons.buildIconSvg(objType, { variant: 'normal', nodeKind: nodeKind }) + '</div>';
    }

    var mainHtml = '<div class="fiber-ws-card fiber-ws-card-head fiber-ws-card-head--' + objType + '">';
    mainHtml += '<div class="fiber-ws-card-head-row">';
    if (iconBlock) mainHtml += iconBlock;
    mainHtml += '<div class="fiber-ws-card-head-text">';
    mainHtml += '<span class="fiber-ws-type-badge ' + typeBadgeClass + '">' + typeLabel + '</span>';
    const defaultTitle = isCross ? 'Кросс' : (isCassette ? 'Сплайс-кассета' : 'Муфта');
    mainHtml += '<div class="fiber-ws-side-title">' + escapeHtml(name || defaultTitle) + '</div>';
    mainHtml += '</div></div>';
    var coordsStatsHtml = buildObjectCoordsInlineHtml(sleeveObj, { compact: true });
    if (coordsStatsHtml) {
        mainHtml += coordsStatsHtml;
    }
    mainHtml += '</div>';

    if (isEditMode) {
        mainHtml += buildFiberWorkspaceActionsHtml();
        mainHtml += '<div class="fiber-ws-card fiber-ws-card--edit"><div class="fiber-ws-side-edit">';
        if (isCross) {
            const storedCrossType = sleeveObj.properties.get('crossType');
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCrossName">Название</label>';
            mainHtml += '<input type="text" id="editCrossName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название кросса"></div>';
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCrossType">Тип</label>';
            mainHtml += '<select id="editCrossType" class="form-select">' + getCrossTypeSelectOptionsHtml(storedCrossType ? String(storedCrossType) : '') + '</select></div>';
        } else if (isCassette) {
            const storedCassetteType = sleeveObj.properties.get('cassetteType') || sleeveObj.properties.get('sleeveType');
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCassetteName">Название</label>';
            mainHtml += '<input type="text" id="editCassetteName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название сплайс-кассеты"></div>';
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCassetteType">Тип</label>';
            mainHtml += '<select id="editCassetteType" class="form-select">' + (typeof getSpliceCassetteTypeSelectOptionsHtml === 'function' ? getSpliceCassetteTypeSelectOptionsHtml(storedCassetteType ? String(storedCassetteType) : '') : '') + '</select></div>';
        } else {
            const storedSleeveType = sleeveObj.properties.get('sleeveType');
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveName">Название</label>';
            mainHtml += '<input type="text" id="editSleeveName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название муфты"></div>';
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveType">Тип</label>';
            mainHtml += '<select id="editSleeveType" class="form-select">' + getSleeveTypeSelectOptionsHtml(storedSleeveType ? String(storedSleeveType) : '') + '</select></div>';
        }
        mainHtml += '</div></div>';
    }

    mainHtml += '<div class="fiber-ws-card fiber-ws-card--stats"><div class="fiber-ws-stats">';
    mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + cablesData.length + '</span><span class="fiber-ws-stat-lbl">каб.</span></div>';
    mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + fiberConnections.length + '</span><span class="fiber-ws-stat-lbl">сращ.</span></div>';
    if (window.EmbeddedSplitters) {
        var spCount = EmbeddedSplitters.getList(sleeveObj).length;
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + spCount + '</span><span class="fiber-ws-stat-lbl">спл.</span></div>';
    }
    if (isCross) {
        const crossPorts = Math.max(1, parseInt(sleeveObj.properties.get('crossPorts'), 10) || 24);
        const usedPorts = getTotalUsedPortsInCross(sleeveObj);
        const pct = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedPorts + '/' + crossPorts + '</span><span class="fiber-ws-stat-lbl">порт. ' + pct + '%</span></div>';
    } else {
        const usedFibers = getTotalUsedFibersInSleeve(sleeveObj);
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedFibers + '</span><span class="fiber-ws-stat-lbl">волок.</span></div>';
    }
    mainHtml += '</div></div>';

    var toolsHtml = buildFiberWorkspaceSidebarToolsHtml(sleeveObj, isEditMode, schemeSize, cablesData, crossLayout);
    var helpHtml = buildFiberWorkspaceSidebarHelpHtml(isEditMode);
    var hasToolsTab = isEditMode || toolsHtml.indexOf('fiber-ws-splitters-block') >= 0 || toolsHtml.indexOf('fiber-ws-scheme-size-block') >= 0 || toolsHtml.indexOf('fiber-ws-cable-sides-block') >= 0;
    var toolsTabLabel = isEditMode ? 'Схема' : 'Сплиттеры';

    var h = '<nav class="fiber-ws-side-tabs" role="tablist" aria-label="Разделы панели">';
    h += '<button type="button" class="fiber-ws-side-tab active" role="tab" aria-selected="true" data-side-tab="main">Основное</button>';
    if (hasToolsTab) {
        h += '<button type="button" class="fiber-ws-side-tab" role="tab" aria-selected="false" data-side-tab="tools">' + toolsTabLabel + '</button>';
    }
    h += '<button type="button" class="fiber-ws-side-tab" role="tab" aria-selected="false" data-side-tab="help">Справка</button>';
    h += '</nav>';
    h += '<div class="fiber-ws-side-panels">';
    h += '<div class="fiber-ws-side-panel active" role="tabpanel" data-side-panel="main">' + mainHtml + '</div>';
    if (hasToolsTab) {
        h += '<div class="fiber-ws-side-panel" role="tabpanel" data-side-panel="tools" hidden>' + toolsHtml + '</div>';
    }
    h += '<div class="fiber-ws-side-panel" role="tabpanel" data-side-panel="help" hidden>' + helpHtml + '</div>';
    h += '</div>';
    return h;
}

function buildFiberWorkspaceHelpHtml() {
    var h = '';
    h += '<p>1. Вкладка <strong>Схема</strong> — клик по жиле, затем по жиле другого кабеля (сращивание).</p>';
    h += '<p>2. Вкладка <strong>Таблица</strong> — сращивание и кнопки OLT, ONU, узел, МК. Колонка <strong>Сплиттер</strong> — входы и выходы.</p>';
    h += '<p>3. <strong>Размер схемы</strong> — ширина/высота рабочей области (S/M/L/XL или своё). Ниже жил — место для сплиттеров.</p>';
    h += '<p>4. <strong>Стороны кабелей</strong>: ← ↑ → — расположение; ⇄ — зеркало жил (подписи остаются читаемыми).</p>';
    h += '<p>5. <strong>Сплиттер</strong>: 🔀 на схеме → число выходов. <strong>Вход</strong>: клик по жиле → клик по сплиттеру (карточка или «вх»), либо наоборот — «вх» → жила.</p>';
    h += '<p>6. <strong>Выход</strong>: клик по точке выхода → жила на схеме/в таблице (сращивание), <strong>свободный порт кросса</strong> на схеме (без жилы) или вход другого сплиттера.</p>';
    h += '<p>7. <strong>Сплиттер</strong>: ↻ — поворот (вход сверху / сбоку), ⇄ — зеркало, ⇅ — порядок выходов. Также в окне ✎.</p>';
    h += '<p>8. Сплиттеры только в <strong>центральной зоне</strong> схемы. Список слева → клик для прокрутки. «↺ Сбросить позиции» — вернуть в зону.</p>';
    h += '<p>9. <strong>Оранжевая линия</strong> сплиттера: клик → подпись или удаление (как у сращиваний). Также ✕ в колонке «Сплиттер».</p>';
    h += '<p>10. <strong>Изменить</strong> сплиттер: ✎ на карточке, двойной клик по карточке или ✎ в списке слева (название, число выходов, зеркало).</p>';
    h += '<p>11. Удаление сплиттера целиком — × на карточке на схеме.</p>';
    h += '<p>12. <strong>Кроссировка</strong> (только кросс): кнопка ⇄ → клик по свободному порту → выбор другого кросса и порта. Клик по линии жила→порт — подпись и снятие с порта; клик по порту — назначить/освободить.</p>';
    h += '<p>13. <strong>Кросс на схеме</strong>: перетащите панель за корпус (не за порты) — позиция сохраняется. В инструментах — <strong>сетка портов</strong> (число строк, напр. 3 для 48 портов).</p>';
    return h;
}

function buildFiberWorkspaceSidebarToolsHtml(sleeveObj, isEditMode, schemeSize, cablesData, crossLayout) {
    var schemeSizeHtml = buildFiberSchemeCanvasSizeHtml(sleeveObj, isEditMode, schemeSize);
    var crossGridHtml = buildFiberSchemeCrossGridHtml(sleeveObj, isEditMode, crossLayout);
    var cableSidesHtml = buildFiberSchemeCableSidesHtml(sleeveObj, isEditMode, cablesData);
    var splittersHtml = buildFiberSidebarSplittersHtml(sleeveObj, isEditMode);
    var h = '';
    if (schemeSizeHtml) h += schemeSizeHtml;
    if (crossGridHtml) h += crossGridHtml;
    if (cableSidesHtml) h += cableSidesHtml;
    if (splittersHtml) h += splittersHtml;
    if (!h) {
        h = '<p class="fiber-ws-hint fiber-ws-panel-empty">' + (isEditMode
            ? 'Здесь настраивается размер рабочей области и список сплиттеров на схеме.'
            : 'Сплиттеры на схеме не добавлены.') + '</p>';
    }
    return h;
}

function buildFiberWorkspaceSidebarHelpHtml(isEditMode) {
    var h = '<div class="fiber-ws-card fiber-ws-card--legend"><h4 class="fiber-ws-subsection-title">Обозначения</h4>' + buildFiberWorkspaceLegendHtml() + '</div>';
    if (isEditMode) {
        h += '<div class="fiber-ws-card fiber-ws-card--help"><h4 class="fiber-ws-subsection-title">Как работать</h4><div class="fiber-ws-help-body">' + buildFiberWorkspaceHelpHtml() + '</div></div>';
    }
    return h;
}

function buildFiberSchemeDefsHtml(isDark, withCrossGrad) {
    var gridStroke = isDark ? 'rgba(148,163,184,0.07)' : 'rgba(15,23,42,0.05)';
    var h1 = isDark ? '#ea580c' : '#f97316';
    var h2 = isDark ? '#c2410c' : '#ea580c';
    var defs = '<defs>' +
        '<pattern id="fiberSchemeGrid" width="24" height="24" patternUnits="userSpaceOnUse">' +
        '<path d="M 24 0 L 0 0 0 24" fill="none" stroke="' + gridStroke + '" stroke-width="1"/></pattern>' +
        '<filter id="fiberSplitterShadow" x="-25%" y="-25%" width="150%" height="150%">' +
        '<feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.22"/></filter>' +
        '<linearGradient id="splitterHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
        '<stop offset="0%" stop-color="' + h1 + '"/><stop offset="100%" stop-color="' + h2 + '"/></linearGradient>';
    if (withCrossGrad) {
        var ch1 = isDark ? '#7c3aed' : '#8b5cf6';
        var ch2 = isDark ? '#5b21b6' : '#6d28d9';
        defs += '<linearGradient id="crossHeaderGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
            '<stop offset="0%" stop-color="' + ch1 + '"/><stop offset="100%" stop-color="' + ch2 + '"/></linearGradient>';
    }
    defs += '</defs>';
    return defs;
}

function buildFiberWorkspaceActionsHtml() {
    var saveSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    var dupSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var delSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    return '<div class="fiber-ws-card fiber-ws-sidebar-actions object-actions-section">' +
        '<div class="fiber-ws-sidebar-actions-grid">' +
        '<button type="button" id="saveChangesBtn" class="btn-primary fiber-ws-action-btn fiber-ws-action-btn--save" title="Сохранить">' + saveSvg + '<span>Сохранить</span></button>' +
        '<button type="button" id="duplicateCurrentObject" class="btn-secondary fiber-ws-action-btn" title="Дублировать">' + dupSvg + '<span>Дубль</span></button>' +
        '<button type="button" id="deleteCurrentObject" class="btn-danger fiber-ws-action-btn" title="Удалить">' + delSvg + '<span>Удал.</span></button>' +
        '</div></div>';
}

function buildFiberWorkspaceLegendHtml() {
    var h = '<div class="fiber-ws-legend">';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-splice"></span> сращивание</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-cross-link"></span> жила → порт кросса</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-splitter-link"></span> сплиттер → жила</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-connected"></span> на порту кросса</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-used"></span> занята</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-gpon-feeder"></span> GPON feeder</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-gpon-upstream"></span> приход OLT</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-free"></span> свободна</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-splitter"></span> сплиттер · вх / вых</div>';
    h += '</div>';
    return h;
}

function renderFiberConnectionsVisualization(sleeveObj, connectedCables) {
    const objType = sleeveObj.properties.get('type');
    const isCross = isCrossLikeHostType(objType);
    const isCassette = objType === 'spliceCassette';
    const wsKind = isCross ? 'cross' : (isCassette ? 'cassette' : 'sleeve');
    const isEditMode = typeof modalIsEditMode === 'function' ? modalIsEditMode() : !!window.isEditMode;

    var containerClass = 'fiber-connections-container fiber-workspace-root fiber-workspace-root--' + wsKind + (isEditMode ? ' fiber-workspace-root--edit' : ' fiber-workspace-root--view');
    let html = '<div class="' + containerClass + '">';

    let fiberConnections = sleeveObj.properties.get('fiberConnections');
    if (!fiberConnections) {
        fiberConnections = [];
        sleeveObj.properties.set('fiberConnections', fiberConnections);
    }

    let fiberLabels = sleeveObj.properties.get('fiberLabels');
    if (!fiberLabels) {
        fiberLabels = {};
        sleeveObj.properties.set('fiberLabels', fiberLabels);
    }
    syncFiberConnectionLabelsFromLegacy(sleeveObj);
    fiberLabels = sleeveObj.properties.get('fiberLabels') || {};

    let nodeConnections = sleeveObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
        sleeveObj.properties.set('nodeConnections', nodeConnections);
    }
    const oltConnections = sleeveObj.properties.get('oltConnections') || {};
    const onuConnections = sleeveObj.properties.get('onuConnections') || {};
    const mediaConverterConnections = sleeveObj.properties.get('mediaConverterConnections') || {};
    const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
    const crossPorts = isCross ? (sleeveObj.properties.get('crossPorts') || 24) : 24;
    let fiberPorts = isCross ? sleeveObj.properties.get('fiberPorts') : null;
    if (isCross && !fiberPorts) {
        fiberPorts = {};
        sleeveObj.properties.set('fiberPorts', fiberPorts);
    }
    if (isCross && typeof sanitizeCrossFiberPorts === 'function' && sanitizeCrossFiberPorts(sleeveObj)) {
        fiberPorts = sleeveObj.properties.get('fiberPorts') || {};
        saveData();
    }

    const cablesData = connectedCables.map((cable, index) => {
        const cableType = cable.properties.get('cableType');
        const cableDescription = getCableDescription(cableType, cable);
        const cableName = cable.properties.get('cableName') || '';
        const fibers = getFiberColors(cable);
        let cableUniqueId = cable.properties.get('uniqueId');
        if (!cableUniqueId) {
            cableUniqueId = `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            cable.properties.set('uniqueId', cableUniqueId);
        }
        const usedFibers = getUsedFibers(sleeveObj, cableUniqueId);

        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        const isFromSleeve = fromObj === sleeveObj;
        const otherEnd = getOtherEndOfCable(cable, sleeveObj);
        const isFromOlt = otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'olt';
        
        return {
            cable,
            cableUniqueId,
            cableType,
            cableDescription,
            cableName,
            fibers,
            usedFibers,
            index: index + 1,
            isFromSleeve,
            isFromOlt
        };
    });
    
    const maxFibers = Math.max(...cablesData.map(function(c) { return c.fibers.length; }), 1);
    const cableSidePartition = partitionCablesBySchemeSide(sleeveObj, cablesData);
    const schemeLayoutBase = getFiberSchemeLayoutOpts(cablesData, maxFibers);
    const sidePad = schemeLayoutBase.sidePad;
    const panelW = schemeLayoutBase.panelW;
    const mainAvailW = estimateFiberSchemeMainWidth();
    const centerGapMin = Math.max(140, Math.min(260, Math.floor(mainAvailW * 0.2)));
    const rowHeight = schemeLayoutBase.rowHeight;
    const fiberFanLen = schemeLayoutBase.fiberFanLen;
    const blockGap = schemeLayoutBase.blockGap;
    const labelH = schemeLayoutBase.labelH;
    const cableLabelW = schemeLayoutBase.cableLabelW;
    const nodeR = 4;
    const badgeW = 22;
    const badgeH = 16;
    const topStripMinW = typeof estimateFiberSchemeTopStripMinWidth === 'function'
        ? estimateFiberSchemeTopStripMinWidth(cableSidePartition.top, {
            badgeW: badgeW,
            topFiberGap: schemeLayoutBase.topFiberGap,
            sidePad: sidePad
        })
        : 0;
    const layoutMinWidth = Math.max(
        sidePad * 2 + panelW * 2 + centerGapMin,
        topStripMinW
    );
    const schemeMaxW = Math.max(1400, Math.min(
        (typeof FIBER_SCHEME_CANVAS !== 'undefined' && FIBER_SCHEME_CANVAS.WIDTH_MAX) || 2400,
        layoutMinWidth
    ));
    const autoSvgWidth = Math.min(schemeMaxW, Math.max(layoutMinWidth, mainAvailW));
    const schemeLayoutOpts = {
        rowHeight: rowHeight, sideFiberGap: schemeLayoutBase.sideFiberGap, topFiberGap: schemeLayoutBase.topFiberGap,
        sidePad: sidePad, panelW: panelW, fiberFanLen: fiberFanLen, cableLabelW: cableLabelW,
        blockGap: blockGap, labelH: labelH, minSvgHeight: schemeLayoutBase.minSvgHeight
    };
    var canvasSize = resolveFiberSchemeCanvasSize(sleeveObj, autoSvgWidth, schemeLayoutBase.minSvgHeight, layoutMinWidth);
    var svgWidth = canvasSize.width;
    const schemeLayout = layoutFiberSchemeReference(sleeveObj, cablesData, svgWidth, schemeLayoutOpts, cableSidePartition, isEditMode);
    let layoutHeight = schemeLayout.svgHeight;
    let crossPanelLayout = null;
    if (isCross && crossPorts > 0) {
        var storedCrossPos = typeof getFiberSchemeCrossPanelPos === 'function'
            ? getFiberSchemeCrossPanelPos(sleeveObj) : { x: null, y: null };
        var storedCrossRows = typeof getFiberSchemeCrossRows === 'function'
            ? getFiberSchemeCrossRows(sleeveObj) : 0;
        var topLanePad = typeof estimateTopCrossLinkLanePad === 'function'
            ? estimateTopCrossLinkLanePad(fiberPorts, schemeLayout.fiberPositions, crossPorts, sleeveObj)
            : 0;
        crossPanelLayout = layoutCrossSchemePanel(svgWidth, crossPorts, layoutHeight, {
            sidePad: sidePad,
            gap: 18 + topLanePad,
            crossName: sleeveObj.properties.get('name') || 'Кросс',
            panelX: storedCrossPos.x,
            panelTop: storedCrossPos.y,
            rows: storedCrossRows > 0 ? storedCrossRows : null
        });
        layoutHeight = crossPanelLayout.contentBottom;
    }
    canvasSize = resolveFiberSchemeCanvasSize(sleeveObj, svgWidth, layoutHeight, layoutMinWidth);
    const svgHeight = canvasSize.height;

    const canConnectFibers = cablesData.length >= 2;
    var sidebarClass = 'fiber-ws-sidebar' + (isEditMode ? '' : ' fiber-ws-sidebar--view-compact');
    html += '<div class="fiber-workspace fiber-workspace--' + wsKind + (isEditMode ? ' fiber-workspace--edit' : ' fiber-workspace--view') + '"><aside class="' + sidebarClass + '">' + buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode, { svgWidth: svgWidth, svgHeight: svgHeight, layoutHeight: layoutHeight }, crossPanelLayout) + '</aside><main class="fiber-ws-main"><div class="fiber-ws-toolbar"><nav class="fiber-ws-tabs"><button type="button" class="fiber-ws-tab active" data-tab="scheme">Схема</button><button type="button" class="fiber-ws-tab" data-tab="table">Таблица</button>';
    if (cablesData.length >= 2) html += '<button type="button" class="fiber-ws-tab" data-tab="connections">Соединения<span class="fiber-ws-tab-badge">' + fiberConnections.length + '</span></button>';
    if (isEditMode) {
        html += '<div id="fiber-scheme-wire-bar" class="fiber-selection-bar fiber-scheme-wire-bar" style="display: none;"></div>';
    }
    if (isEditMode && (canConnectFibers || isCross)) {
        html += '<div id="fiber-selection-bar" class="fiber-selection-bar" style="display: none;"></div>';
    }
    html += '</nav><div class="fiber-ws-toolbar-zoom" id="fiber-ws-toolbar-zoom">';
    html += '<div class="fiber-scheme-zoom-controls" title="Масштаб (Ctrl + колёсико в области схемы)">';
    html += '<button type="button" class="fiber-scheme-zoom-btn" id="fiber-scheme-zoom-out" title="Уменьшить">−</button>';
    html += '<input type="range" class="fiber-scheme-zoom-slider" id="fiber-scheme-zoom-slider" min="30" max="200" value="100" step="5" aria-label="Масштаб схемы">';
    html += '<span class="fiber-scheme-zoom-label" id="fiber-scheme-zoom-label">100%</span>';
    html += '<button type="button" class="fiber-scheme-zoom-btn" id="fiber-scheme-zoom-in" title="Увеличить">+</button>';
    html += '<button type="button" class="fiber-scheme-zoom-btn fiber-scheme-zoom-fit" id="fiber-scheme-zoom-fit" title="Вписать схему в область">⊡</button>';
    html += '<button type="button" class="fiber-scheme-zoom-btn fiber-scheme-zoom-reset" id="fiber-scheme-zoom-reset" title="Сбросить масштаб">100%</button>';
    html += '</div>';
    if (isEditMode) {
        html += '<button type="button" class="fiber-scheme-toolbar-btn" id="fiber-scheme-add-splitter" title="Добавить сплиттер в центральную зону">🔀 Сплиттер</button>';
    }
    if (window.EmbeddedSplitters && EmbeddedSplitters.getList(sleeveObj).length) {
        html += '<button type="button" class="fiber-scheme-toolbar-btn fiber-scheme-toolbar-btn--secondary" id="fiber-scheme-fit-splitters" title="Прокрутить схему к сплиттерам">◎ Найти</button>';
    }
    html += '</div>';
    html += '<div class="fiber-ws-toolbar-export" id="fiber-ws-toolbar-export">';
    html += '<button type="button" class="fiber-scheme-toolbar-btn fiber-scheme-toolbar-btn--secondary" id="fiber-scheme-export-pdf" title="Скачать схему сварки жил в PDF">⤓ PDF</button>';
    html += '</div></div>';
    html += '<div class="fiber-ws-panels"><div class="fiber-ws-panel fiber-ws-panel-scheme active" data-panel="scheme">';
    html += '<div class="fiber-scheme-viewport" id="fiber-scheme-viewport">';
    html += '<div class="fiber-scheme-zoom-inner" id="fiber-scheme-zoom-inner">';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const svgBgColor = isDark ? '#1e293b' : '#ffffff';
    const svgBorderColor = isDark ? '#334155' : '#dee2e6';
    const svgTextColor = isDark ? '#f1f5f9' : '#2c3e50';
    const svgTextMuted = isDark ? '#94a3b8' : '#6c757d';
    html += '<svg id="fiber-connections-svg" class="fiber-scheme-svg' + (isEditMode ? '' : ' fiber-scheme-svg--view') + '" width="' + svgWidth + '" height="' + svgHeight + '" viewBox="0 0 ' + svgWidth + ' ' + svgHeight + '">';
    html += buildFiberSchemeDefsHtml(isDark, isCross && crossPorts > 0);
    html += '<rect class="fiber-scheme-bg" width="' + svgWidth + '" height="' + svgHeight + '" fill="url(#fiberSchemeGrid)"/>';
    if (crossPanelLayout) {
        var crossBoundStroke = isDark ? 'rgba(139, 92, 246, 0.35)' : 'rgba(109, 40, 217, 0.3)';
        html += '<line class="fiber-scheme-cross-boundary" x1="' + (crossPanelLayout.panelX - 8) + '" y1="' + (crossPanelLayout.panelTop - 10) + '" x2="' + (crossPanelLayout.panelX + crossPanelLayout.panelW + 8) + '" y2="' + (crossPanelLayout.panelTop - 10) + '" stroke="' + crossBoundStroke + '" stroke-width="1" stroke-dasharray="5 4" pointer-events="none"/>';
    }
    if (svgHeight > layoutHeight + 24) {
        var boundStroke = isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.45)';
        html += '<line class="fiber-scheme-content-boundary" x1="0" y1="' + layoutHeight + '" x2="' + svgWidth + '" y2="' + layoutHeight + '" stroke="' + boundStroke + '" stroke-width="1" stroke-dasharray="6 5" pointer-events="none"/>';
    }

    // Кросс рисуем до жил — жилы/бейджи остаются поверх панели.
    if (crossPanelLayout && fiberPorts) {
        html += buildCrossSchemePanelSvg(crossPanelLayout, fiberPorts, schemeLayout.fiberPositions, schemeLayout.blocks, isDark, badgeH, isEditMode, sleeveObj, nodeR, badgeW, fiberLabels, svgWidth, layoutHeight);
    }

    const connectedFibers = new Set();
    fiberConnections.forEach(conn => {
        connectedFibers.add(`${conn.from.cableId}-${conn.from.fiberNumber}`);
        connectedFibers.add(`${conn.to.cableId}-${conn.to.fiberNumber}`);
    });

    const fiberPositions = schemeLayout.fiberPositions;
    const schemeBlocks = schemeLayout.blocks;
    const splitterObstacles = window.EmbeddedSplitters && EmbeddedSplitters.getSchemeSplitterObstacles
        ? EmbeddedSplitters.getSchemeSplitterObstacles(sleeveObj, svgWidth, svgHeight)
        : [];
    const cableBarStroke = isDark ? '#64748b' : '#9ca3af';

    function fiberSchemeFiberExit(pos) {
        if (window.EmbeddedSplitters && EmbeddedSplitters.fiberSchemeFiberExitPoint) {
            return EmbeddedSplitters.fiberSchemeFiberExitPoint(pos, badgeW, badgeH, nodeR);
        }
        if (pos && pos.isTop) return fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
        var pt = fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
        return { x: pt.x, y: pt.y };
    }
    function fiberSchemeLinkExit(pos) {
        return fiberSchemeFiberLinkAnchor(pos, badgeW, badgeH, nodeR);
    }
    function fiberSchemeExitX(pos) {
        return fiberSchemeFiberExit(pos).x;
    }
    function fiberSchemeExitY(pos) {
        return fiberSchemeFiberExit(pos).y;
    }
    const linkColorDefault = isDark ? '#facc15' : '#ffcc00';
    const badgeStroke = isDark ? '#60a5fa' : '#2563eb';
    const badgeFill = isDark ? '#1e3a5f' : '#eff6ff';

    const linkPaint = [];
    fiberConnections.forEach((connection, connIndex) => {
        const fromKey = `${connection.from.cableId}-${connection.from.fiberNumber}`;
        const toKey = `${connection.to.cableId}-${connection.to.fiberNumber}`;
        const fromPos = fiberPositions.get(fromKey);
        const toPos = fiberPositions.get(toKey);
        if (!fromPos || !toPos) return;
        const fromExit = fiberSchemeLinkExit(fromPos);
        const toExit = fiberSchemeLinkExit(toPos);
        const sameSide = (fromPos.isTop && toPos.isTop) || (!fromPos.isTop && !toPos.isTop && fromPos.isLeft === toPos.isLeft);
        const pathD = buildFiberSchemeConnectionPath(
            fromExit.x, fromExit.y,
            toExit.x, toExit.y,
            nodeR + 2,
            {
                sameSide: sameSide,
                isLeft: fromPos.isLeft,
                isTop: !!fromPos.isTop,
                toTop: !!toPos.isTop,
                svgWidth: svgWidth,
                obstacles: splitterObstacles
            }
        );
        const connLabel = resolveFiberConnectionLabel(connection, fiberLabels);
        const fromFiber = lookupSchemeFiber(schemeBlocks, connection.from.cableId, connection.from.fiberNumber);
        const toFiber = lookupSchemeFiber(schemeBlocks, connection.to.cableId, connection.to.fiberNumber);
        const fromRawColor = fromFiber && fromFiber.color ? String(fromFiber.color).toUpperCase() : '';
        const toRawColor = toFiber && toFiber.color ? String(toFiber.color).toUpperCase() : '';
        const sameFiberColor = !fromRawColor || !toRawColor || fromRawColor === toRawColor;
        const stripeA = fiberSchemeLinkStrokeColor(fromFiber ? fromFiber.color : null, isDark);
        const stripeB = fiberSchemeLinkStrokeColor(toFiber ? toFiber.color : (fromFiber ? fromFiber.color : null), isDark);
        const hasBlackRing = !!((fromFiber && fromFiber.hasBlackRing) || (toFiber && toFiber.hasBlackRing));
        linkPaint.push({
            connIndex: connIndex, pathD: pathD, fromKey: fromKey, toKey: toKey, label: connLabel,
            fromExitX: fromExit.x, fromY: fromExit.y, toExitX: toExit.x, toY: toExit.y,
            sameSide: sameSide, isLeft: fromPos.isLeft, isTop: !!fromPos.isTop, toTop: !!toPos.isTop,
            stripeA: stripeA,
            stripeB: stripeB,
            sameFiberColor: sameFiberColor,
            hasBlackRing: hasBlackRing
        });
    });

    html += '<g class="fiber-scheme-cables">';
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        const isLeft = block.isLeft;
        const isTop = !!block.isTop;
        const title = cableData.cableName || ('Кабель ' + cableData.index);
        const subLine = cableData.cableDescription + (cableData.isFromSleeve ? ' · ← вход' : ' · → выход');
        var titleText = title;
        var subText = subLine;
        var subLineTop = subLine;
        if (isTop) {
            var topLabelW = Math.max(70, (block.barX2 - block.barX1) - 8);
            var topChars = Math.max(12, Math.floor(topLabelW / 4.8));
            if (subLineTop.length > topChars) subLineTop = subLineTop.slice(0, Math.max(9, topChars - 1)) + '…';
            var topTitleChars = Math.max(10, Math.floor(topLabelW / 5.5));
            titleText = truncateFiberSchemeCableText(title, topTitleChars);
        }
        const labelAnchorX = block.labelX;
        const labelAnchorY = block.labelY != null ? block.labelY : (block.blockTop + 12);
        const sideAttr = isTop ? 'top' : (isLeft ? 'left' : 'right');
        const isMirrored = typeof isCableSchemeMirrored === 'function' && isCableSchemeMirrored(sleeveObj, cableData.cableUniqueId);
        if (!isTop) {
            var sideTitleW = Math.max(80, block.barX2 - block.barX1 - 8);
            var sideSubW = Math.max(60, sideTitleW - (isEditMode ? 88 : 0));
            var sideTitleChars = Math.max(16, Math.floor(sideTitleW / 5.0));
            var sideSubChars = Math.max(12, Math.floor(sideSubW / 5.0));
            titleText = truncateFiberSchemeCableText(title, sideTitleChars);
            subText = truncateFiberSchemeCableText(subLine, sideSubChars);
        }

        html += `<g class="fiber-cable-block fiber-cable-block--${sideAttr}" data-cable-id="${cableData.cableUniqueId}" data-cable-side="${sideAttr}" data-cable-mirrored="${isMirrored ? '1' : '0'}">`;
        if (isTop) {
            if (isEditMode) {
                html += renderFiberCableActionButtons(block, cableData.cableUniqueId, sideAttr, isMirrored, isLeft, isDark);
            }
            html += `<text x="${labelAnchorX}" y="${labelAnchorY}" text-anchor="middle" style="font-size: 9px; font-weight: 700; fill: ${svgTextColor};">${escapeHtml(titleText)}</text>`;
            html += `<line x1="${block.barX1}" y1="${block.cableBarY}" x2="${block.barX2}" y2="${block.cableBarY}" stroke="${cableBarStroke}" stroke-width="5" stroke-linecap="round"/>`;
            if (block.descY != null) {
                html += `<text x="${labelAnchorX}" y="${block.descY}" text-anchor="middle" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(subLineTop)}</text>`;
            }
        } else {
            const sideAnchor = block.labelAnchor || 'middle';
            const sideTitleY = block.labelY != null ? block.labelY : (block.cableBarY - 34);
            const sideSubX = block.descLabelX != null ? block.descLabelX : labelAnchorX;
            const sideSubAnchor = block.descLabelAnchor || sideAnchor;
            const sideSubY = block.descLabelY != null ? block.descLabelY : (block.cableBarY - 5);
            if (isEditMode) {
                html += renderFiberCableActionButtons(block, cableData.cableUniqueId, sideAttr, isMirrored, isLeft, isDark);
            }
            html += `<text x="${labelAnchorX}" y="${sideTitleY}" text-anchor="${sideAnchor}" style="font-size: 10px; font-weight: 700; fill: ${svgTextColor};">${escapeHtml(titleText)}</text>`;
            html += `<text x="${sideSubX}" y="${sideSubY}" text-anchor="${sideSubAnchor}" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(subText)}</text>`;
            html += `<line x1="${block.barX1}" y1="${block.cableBarY}" x2="${block.barX2}" y2="${block.cableBarY}" stroke="${cableBarStroke}" stroke-width="5" stroke-linecap="round"/>`;
        }
        html += '</g>';
    });
    html += '</g>';

    const spliceDash = FIBER_SPLICE_STRIPE_LEN + ' ' + FIBER_SPLICE_STRIPE_LEN;
    html += '<g class="fiber-scheme-links" fill="none">';
    linkPaint.forEach(function(link) {
        const stripeA = link.stripeA || linkColorDefault;
        const stripeB = link.stripeB || stripeA;
        html += `<g class="fiber-scheme-link-group" data-connection-index="${link.connIndex}">`;
        html += `<path class="fiber-scheme-link-shadow" d="${link.pathD}" stroke="${isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)'}" stroke-width="7" stroke-linecap="round" opacity="0.35" data-connection-index="${link.connIndex}"/>`;
        if (link.hasBlackRing) {
            html += `<path class="fiber-scheme-link-outline" d="${link.pathD}" stroke="#000" stroke-width="5.5" stroke-linecap="round" data-connection-index="${link.connIndex}"/>`;
        }
        const clickable = isEditMode ? 'cursor: pointer;' : 'cursor: default;';
        if (link.sameFiberColor) {
            html += `<path id="connection-${link.connIndex}" class="fiber-scheme-link" d="${link.pathD}" stroke="${stripeA}" stroke-width="4.5" stroke-linecap="round" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" data-from-exit-x="${link.fromExitX}" data-from-y="${link.fromY}" data-to-exit-x="${link.toExitX}" data-to-y="${link.toY}" data-same-side="${link.sameSide ? '1' : '0'}" data-from-left="${link.isLeft ? '1' : '0'}" data-from-top="${link.isTop ? '1' : '0'}" data-to-top="${link.toTop ? '1' : '0'}" data-conn-label="${escapeHtml(link.label || '')}" style="${clickable}">`;
        } else {
            html += `<path id="connection-${link.connIndex}" class="fiber-scheme-link fiber-scheme-link-stripe-a" d="${link.pathD}" stroke="${stripeA}" stroke-width="4.5" stroke-linecap="butt" stroke-dasharray="${spliceDash}" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" data-from-exit-x="${link.fromExitX}" data-from-y="${link.fromY}" data-to-exit-x="${link.toExitX}" data-to-y="${link.toY}" data-same-side="${link.sameSide ? '1' : '0'}" data-from-left="${link.isLeft ? '1' : '0'}" data-from-top="${link.isTop ? '1' : '0'}" data-to-top="${link.toTop ? '1' : '0'}" data-conn-label="${escapeHtml(link.label || '')}" style="${clickable}">`;
        }
        if (link.label) html += `<title>${escapeHtml(link.label)}</title>`;
        html += '</path>';
        if (!link.sameFiberColor) {
            html += `<path class="fiber-scheme-link-stripe-b" d="${link.pathD}" stroke="${stripeB}" stroke-width="4.5" stroke-linecap="butt" stroke-dasharray="${spliceDash}" stroke-dashoffset="${FIBER_SPLICE_STRIPE_LEN}" data-connection-index="${link.connIndex}" pointer-events="none"/>`;
        }
        html += '</g>';
    });
    html += '</g>';

    html += '<g class="fiber-scheme-ports">';
    html += '<g class="fiber-scheme-port-bodies">';
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        const isLeft = block.isLeft;
        const isTop = !!block.isTop;
        cableData.fibers.forEach(function(fiber) {
            const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
            const pos = fiberPositions.get(fiberKey);
            if (!pos) return;
            const occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections, sleeveObj);
            const isUsed = occ.isUsed;
            const isDirectSpliced = fiberConnections.some(function(c) {
                return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                    (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
            });
            const isConnected = isDirectSpliced;
            const isOccupied = occ.isOccupied;
            const isGponFeeder = occ.isGponFeeder;
            const isGponUpstreamOnly = occ.isGponUpstreamOnly;
            var nodeAssScheme = getHostAssignment(sleeveObj, 'nodeConnections', cableData.cableUniqueId, fiber.number);
            var mcAssScheme = getHostAssignment(sleeveObj, 'mediaConverterConnections', cableData.cableUniqueId, fiber.number);
            var rbAssScheme = getHostAssignment(sleeveObj, 'radioBridgeConnections', cableData.cableUniqueId, fiber.number);
            var oltBlocksSpliceScheme = occ.oltBlocksSplice;
            var onuAssScheme = getHostAssignment(sleeveObj, 'onuConnections', cableData.cableUniqueId, fiber.number);
            var spAssScheme = getHostAssignment(sleeveObj, 'splitterConnections', cableData.cableUniqueId, fiber.number);
            const isCrossAssigned = isCross && fiberPorts && fiberPorts[fiberKey];
            const isFiberLinked = isConnected || isCrossAssigned;
            const isSpliceSelectable = !isUsed && !isConnected && !isCrossAssigned && !nodeAssScheme && !(mcAssScheme && mcAssScheme.mediaConverterId) && !(rbAssScheme && rbAssScheme.radioBridgeId) && !oltBlocksSpliceScheme && !onuAssScheme && !(spAssScheme && spAssScheme.splitterId);
            const clickable = isEditMode && isSpliceSelectable ? 'cursor: pointer;' : (!isSpliceSelectable && isOccupied ? 'cursor: not-allowed;' : '');
            const portClass = 'fiber-scheme-port' +
                (isFiberLinked ? ' fiber-scheme-port--cross-linked' : '') +
                (isGponFeeder ? ' fiber-scheme-port--gpon-feeder' : (oltBlocksSpliceScheme ? ' fiber-scheme-port--gpon-upstream' : (occ.isOltCableEnd ? ' fiber-scheme-port--olt-cable' : (isOccupied && !isSpliceSelectable ? ' fiber-scheme-port--occupied' : ''))));
            const badgeX = pos.x - badgeW / 2;
            const badgeY = pos.y - badgeH / 2;

            const fiberLabelKey = cableData.cableUniqueId + '-' + fiber.number;
            const spliceConn = isDirectSpliced ? fiberConnections.find(function(c) {
                return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                    (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
            }) : null;
            const connLabelOnLine = spliceConn ? resolveFiberConnectionLabel(spliceConn, fiberLabels) : '';
            const directLabel = !isConnected ? (fiberLabels[fiberLabelKey] || '') : '';
            const statusText = isConnected ? ' (соед.)' : (isUsed ? ' (исп.)' : '');
            const labelText = connLabelOnLine ? ' ' + connLabelOnLine : (directLabel ? ' ' + directLabel : '');
            const portText = isCross && fiberPorts && fiberPorts[fiberLabelKey] && !isDirectSpliced
                ? (', порт ' + fiberPorts[fiberLabelKey])
                : '';
            const occHint = isGponFeeder ? ' (GPON feeder)' : (oltBlocksSpliceScheme ? ' (приход OLT)' : (occ.isOltCableEnd ? ' (кабель от OLT)' : (occ.hasDirectOltConnection ? ' (от OLT)' : (isOccupied ? ' (занята)' : ''))));
            const tooltipText = escapeHtml(fiber.name + labelText + statusText + portText + occHint);

            const fanPath = buildFiberSchemeFanPath(pos.block, pos, isLeft, nodeR, badgeW, isTop);
            const fanColor = fiberSchemeLinkStrokeColor(fiber.color, isDark);

            const directLabelAttr = directLabel ? ' data-direct-label="' + escapeHtml(directLabel) + '"' : '';
            html += `<g id="fiber-${fiberKey}" class="${portClass}" data-fiber-key="${fiberKey}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-is-left="${isLeft ? '1' : '0'}" data-is-top="${isTop ? '1' : '0'}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}" data-fiber-occupied="${isOccupied}" data-fiber-selectable="${isSpliceSelectable}"${directLabelAttr} style="${clickable}">`;
            html += `<title>${tooltipText}</title>`;
            html += `<path class="fiber-fan-path" data-fiber-key="${fiberKey}" d="${fanPath}" stroke="${fanColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
            html += `<rect class="fiber-port-hit" x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="transparent" style="pointer-events: all"/>`;
            html += '</g>';
        });
    });
    html += '</g></g>';

    if (linkPaint.length > 0) {
        html += '<g class="fiber-scheme-link-hits" fill="none">';
        linkPaint.forEach(function(link) {
            const hitCursor = isEditMode ? 'cursor: pointer;' : 'cursor: default;';
            html += `<path class="fiber-scheme-link-hit" d="${link.pathD}" stroke="transparent" stroke-width="14" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" style="${hitCursor}">`;
            if (link.label) html += `<title>${escapeHtml(link.label)}</title>`;
            html += '</path>';
        });
        html += '</g>';
    }

    const connLabelBg = isCross
        ? (isDark ? 'rgba(30, 27, 75, 0.92)' : 'rgba(255, 255, 255, 0.94)')
        : (isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.92)');
    const connLabelFill = isCross
        ? (isDark ? '#e9d5ff' : '#4c1d95')
        : (isDark ? '#f1f5f9' : '#1e293b');
    const connLabelBorder = isCross
        ? (isDark ? 'rgba(167, 139, 250, 0.35)' : 'rgba(109, 40, 217, 0.25)')
        : svgBorderColor;

    if (window.EmbeddedSplitters) {
        var wirePickSplitterId = (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === sleeveObj &&
            schemeSplitterWirePick.splitterId) ? schemeSplitterWirePick.splitterId : null;
        var outputPick = (schemeSplitterOutputPick && schemePickMatchesHost(schemeSplitterOutputPick, sleeveObj)) ? schemeSplitterOutputPick : null;
        html += EmbeddedSplitters.renderSchemeSplitters(sleeveObj, {
            svgWidth: svgWidth,
            svgHeight: svgHeight,
            fiberPositions: fiberPositions,
            splitterConnections: splitterConnections,
            isEditMode: isEditMode,
            wirePickSplitterId: wirePickSplitterId,
            outputPickSplitterId: outputPick ? outputPick.splitterId : null,
            outputPickIndex: outputPick ? outputPick.outputIndex : null,
            buildConnectionPath: buildFiberSchemeConnectionPath,
            buildBendPath: buildFiberSchemeBendAtPointPath,
            pathMidpoint: fiberSchemePathMidpoint,
            nodeR: nodeR,
            badgeW: badgeW,
            badgeH: badgeH
        });
    }

    html += '<g class="fiber-scheme-link-labels">';
    linkPaint.forEach(function(link) {
        const mid = fiberSchemePathMidpoint(link.pathD);
        const labelFoW = 148;
        const hasLabel = !!(link.label && String(link.label).trim());
        if (!hasLabel) return;
        html += `<g class="fiber-scheme-conn-label" data-connection-index="${link.connIndex}">`;
        const tw = Math.min(labelFoW, Math.max(40, link.label.length * 6.5 + 16));
        const tx = mid.x - tw / 2;
        html += `<rect class="fiber-scheme-conn-label-bg" x="${tx}" y="${mid.y - 11}" width="${tw}" height="21" rx="5" fill="${connLabelBg}" stroke="${connLabelBorder}" stroke-width="0.75"/>`;
        html += `<text class="fiber-scheme-conn-label-text" x="${mid.x}" y="${mid.y + 5}" text-anchor="middle" style="font-size: 10px; font-weight: 600; fill: ${connLabelFill}; pointer-events: none;">${escapeHtml(link.label)}</text>`;
        html += '</g>';
    });
    html += '</g>';

    html += '<g class="fiber-scheme-fiber-labels">';
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        cableData.fibers.forEach(function(fiber) {
            const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
            const pos = fiberPositions.get(fiberKey);
            if (!pos) return;
            const isConnected = fiberConnections.some(function(conn) {
                return (conn.from.cableId === cableData.cableUniqueId && conn.from.fiberNumber === fiber.number) ||
                    (conn.to.cableId === cableData.cableUniqueId && conn.to.fiberNumber === fiber.number);
            });
            if (isConnected) return;
            if (isCross && fiberPorts && fiberPorts[fiberKey]) return;
            const directLabel = (fiberLabels[cableData.cableUniqueId + '-' + fiber.number] || '').trim();
            if (!directLabel) return;
            const labelLayout = fiberSchemeFiberLabelLayout(pos, directLabel, badgeW, badgeH, nodeR);
            html += `<g class="fiber-scheme-fiber-label" data-fiber-key="${fiberKey}">`;
            html += `<rect class="fiber-scheme-fiber-label-bg" x="${labelLayout.tx}" y="${labelLayout.ty}" width="${labelLayout.tw}" height="${labelLayout.th}" rx="4" fill="${connLabelBg}" stroke="${svgBorderColor}" stroke-width="0.75"/>`;
            html += `<text class="fiber-scheme-fiber-label-text" x="${labelLayout.textX}" y="${labelLayout.textY}" text-anchor="${labelLayout.anchor}" style="font-size: 9px; font-weight: 600; fill: ${connLabelFill}; pointer-events: none;">${escapeHtml(directLabel)}</text>`;
            html += '</g>';
        });
    });
    html += '</g>';

    html += buildFiberSchemePortNumsSvg(schemeBlocks, fiberPositions, {
        badgeW: badgeW,
        badgeH: badgeH,
        badgeFill: badgeFill,
        badgeStroke: badgeStroke,
        nodeR: nodeR,
        sleeveObj: sleeveObj,
        fiberConnections: fiberConnections,
        nodeConnections: nodeConnections,
        oltConnections: oltConnections,
        onuConnections: onuConnections,
        mediaConverterConnections: mediaConverterConnections,
        splitterConnections: splitterConnections
    });

    html += '</svg>';
    html += '</div></div></div>';

    if (cablesData.length >= 2) {
        function cableNameById(id) {
            if (typeof resolveCableDisplayNameById === 'function') {
                return resolveCableDisplayNameById(id, { hostObj: sleeveObj });
            }
            const d = cablesData.find(function(c) { return c.cableUniqueId === id; });
            return d ? (d.cableName || ('Кабель ' + d.index)) : id.substring(0, 8) + '…';
        }
        html += '<div class="fiber-ws-panel fiber-ws-panel-connections" data-panel="connections"><div class="fiber-connections-list-wrap" id="fiber-connections-list-wrap">';
        if (fiberConnections.length > 0) {
            html += '<div class="fiber-connections-list-toolbar">';
            html += '<input type="search" id="fiber-connections-search" class="form-input fiber-connections-search" placeholder="Поиск по кабелю, № жилы или подписи" autocomplete="off">';
            html += '</div>';
        }
        html += '<div class="fiber-connections-list">';
        if (isEditMode && fiberConnections.length > 0) html += '<p class="fiber-connections-list-sub">Подписи сращений — в полях ниже. Клик по линии соединения на схеме открывает окно по центру.</p>';
        if (fiberConnections.length === 0) {
            html += '<p class="fiber-connections-list-empty">Нет соединений между жилами.</p>';
            if (isEditMode) html += '<p class="fiber-connections-list-hint">Переключитесь на «Схема» или кликайте по жилам в таблице ниже: первая жила → вторая жила из другого кабеля.</p>';
        } else {
            fiberConnections.forEach(function(conn, idx) {
                const fromName = cableNameById(conn.from.cableId);
                const toName = cableNameById(conn.to.cableId);
                const connLabel = resolveFiberConnectionLabel(conn, fiberLabels);
                const searchHay = (fromName + ' ' + toName + ' ' + conn.from.fiberNumber + ' ' + conn.to.fiberNumber + ' ' + (connLabel || '')).toLowerCase();
                html += '<div class="fiber-connection-row" data-connection-index="' + idx + '" data-search="' + escapeHtml(searchHay) + '">';
                html += '<div class="fiber-connection-row__head">';
                html += '<span class="fiber-conn-from">' + escapeHtml(fromName) + ', ж.' + conn.from.fiberNumber + '</span>';
                html += '<span class="fiber-conn-arrow">↔</span>';
                html += '<span class="fiber-conn-to">' + escapeHtml(toName) + ', ж.' + conn.to.fiberNumber + '</span>';
                if (isEditMode) {
                    html += '<button type="button" class="fiber-conn-delete" data-connection-index="' + idx + '" title="Удалить соединение">✕</button>';
                }
                html += '</div>';
                if (isEditMode) {
                    html += '<label class="fiber-connection-label-wrap"><span class="fiber-connection-label-wrap__lbl">Подпись</span>';
                    html += '<input type="text" class="fiber-connection-label-input form-input" data-connection-index="' + idx + '" value="' + escapeHtml(connLabel) + '" placeholder="Например: до узла А" title="Подпись на линии сращивания">';
                    html += '</label>';
                } else if (connLabel) {
                    html += '<div class="fiber-conn-label-view">📝 ' + escapeHtml(connLabel) + '</div>';
                }
                html += '</div>';
            });
        }
        html += '</div></div></div>';
    }

    html += '<div class="fiber-ws-panel fiber-ws-panel-table" data-panel="table">';
    html += '<div class="fiber-table-toolbar"><label class="fiber-table-filter-label"><span class="fiber-table-filter-lbl">Фильтр</span><select id="fiber-table-filter" class="form-select fiber-table-filter-select"><option value="all">Все жилы</option><option value="connected">Сращённые</option><option value="free">Свободные</option><option value="used">Занятые</option></select></label><input type="search" id="fiber-table-search" class="form-input fiber-table-search" placeholder="Поиск по № жилы…" autocomplete="off"></div>';

    var oltReachCache = {};

    function buildFiberChip(className, cableId, fiberNumber, title, label) {
        return '<button type="button" class="fiber-chip ' + className + '" data-cable-id="' + cableId + '" data-fiber-number="' + fiberNumber + '" title="' + escapeHtml(title) + '">' + label + '</button>';
    }

    function buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, fiberPorts, crossPorts, oltReachCache, renderOpts) {
        renderOpts = renderOpts || {};
        const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
        const occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections, sleeveObj);
        const isUsed = occ.isUsed;
        const isOccupied = occ.isOccupied;
        const directLabel = fiberLabels[fiberLabelKey] || '';
        const isDirectSpliced = fiberConnections.some(conn =>
            (conn.from.cableId === cableData.cableUniqueId && conn.from.fiberNumber === fiber.number) ||
            (conn.to.cableId === cableData.cableUniqueId && conn.to.fiberNumber === fiber.number)
        );
        const isConnected = isDirectSpliced;
        const spliceConn = isDirectSpliced ? fiberConnections.find(function(c) {
            return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
        }) : null;
        const spliceConnLabel = spliceConn ? resolveFiberConnectionLabel(spliceConn, fiberLabels) : '';
        const crossPortNum = isCross && fiberPorts ? (fiberPorts[fiberLabelKey] || '') : '';
        const nodeConnection = getHostAssignment(sleeveObj, 'nodeConnections', cableData.cableUniqueId, fiber.number);
        const realOltAssign = getFiberOltRealAssignment(sleeveObj, cableData.cableUniqueId, fiber.number);
        const oltConnection = realOltAssign;
        const hasDirectOltConnection = !!realOltAssign;
        const isOltCableEnd = occ.isOltCableEnd;
        const oltOnCableEnd = getOltAtHostCableEnd(sleeveObj, cableData.cableUniqueId);
        const onuConnection = getHostAssignment(sleeveObj, 'onuConnections', cableData.cableUniqueId, fiber.number);
        const mcConnection = getHostAssignment(sleeveObj, 'mediaConverterConnections', cableData.cableUniqueId, fiber.number);
        const rbConnection = getHostAssignment(sleeveObj, 'radioBridgeConnections', cableData.cableUniqueId, fiber.number);
        const splitterConnection = getHostAssignment(sleeveObj, 'splitterConnections', cableData.cableUniqueId, fiber.number);
        const hasDirectSplitterConnection = isFiberSplitterAssignmentDirect(sleeveObj, cableData.cableUniqueId, fiber.number);
        const hasSplitterConnection = !!splitterConnection && !!splitterConnection.splitterId;
        const splitterOutputAtHost = findSplitterOutputAtHost(sleeveObj, cableData.cableUniqueId, fiber.number);
        const hasSplitterOutputAtHost = !!splitterOutputAtHost;
        let splitterName = '';
        if (hasSplitterConnection) {
            const spObj = resolveSplitterObject(splitterConnection.splitterId);
            splitterName = spObj ? (spObj.properties.get('name') || 'Сплиттер') : 'Сплиттер';
        }
        let splitterOutputName = '';
        if (hasSplitterOutputAtHost && splitterOutputAtHost.splitterObj) {
            splitterOutputName = splitterOutputAtHost.splitterObj.properties.get('name') || 'Сплиттер';
        }
        const hasNodeConnection = !!nodeConnection;
        const hasOltConnection = !!oltConnection;
        const hasOnuConnection = !!onuConnection;
        const hasMcConnection = !!mcConnection && !!mcConnection.mediaConverterId;
        const hasRbConnection = !!rbConnection && !!rbConnection.radioBridgeId;
        const hasAnyOutConnection = occ.hasAnyOutConnection;
        var oltReachKey = (getObjectUniqueId(sleeveObj) || '') + ':' + fiberConnKey(cableData.cableUniqueId, fiber.number);
        if (!Object.prototype.hasOwnProperty.call(oltReachCache, oltReachKey)) {
            oltReachCache[oltReachKey] = isFiberReachableToOlt(sleeveObj, cableData.cableUniqueId, fiber.number);
        }
        const canConnectToOlt = oltReachCache[oltReachKey];
        const oltBlocksSplice = occ.oltBlocksSplice;
        const currentPort = isCross && fiberPorts && !isDirectSpliced ? (fiberPorts[fiberLabelKey] || '') : '';
        var crossPatchPort = null;
        var crossPatchInfo = null;
        if (isCross && currentPort && typeof getCrossPortPatch === 'function') {
            crossPatchPort = parseInt(currentPort, 10);
            if (!isNaN(crossPatchPort)) crossPatchInfo = getCrossPortPatch(sleeveObj, crossPatchPort);
        }
        const isCrossPatchLocked = !!(isCross && crossPatchInfo && crossPatchPort != null);
        const canAssignBase = isEditMode && !isConnected && !isUsed && !hasNodeConnection && !hasMcConnection && !hasRbConnection &&
            !hasOnuConnection && !hasSplitterConnection && !hasSplitterOutputAtHost && !oltBlocksSplice && !isCrossPatchLocked;
        const isSpliceSelectable = !isUsed && !isConnected && !hasNodeConnection && !hasMcConnection && !hasRbConnection && !oltBlocksSplice && !hasOnuConnection && !hasSplitterConnection && !isCrossPatchLocked;
        const hasOltRelation = hasDirectOltConnection || isOltCableEnd || canConnectToOlt;
        const canConnectGponBranch = isEditMode && !isConnected && !isUsed && canConnectToOlt && !isCrossPatchLocked;
        const canShowOltIncoming = isEditMode && !isUsed && !isConnected && !hasOltRelation && !oltBlocksSplice &&
            !hasDirectOltConnection && !hasNodeConnection && !hasMcConnection && !hasRbConnection && !hasOnuConnection &&
            !hasSplitterConnection && !hasSplitterOutputAtHost && !isCrossPatchLocked;
        const canOfferOnuChip = canConnectGponBranch && !hasOnuConnection && !hasMcConnection && !hasRbConnection;
        const showGponBranchButtons = canAssignBase && (hasDirectOltConnection || (canConnectToOlt && !isOltCableEnd));
        const oltBlocksNode = isFiberLocalOltNodeBlocked(sleeveObj, cableData.cableUniqueId, fiber.number);
        const canConnectNodeOnHost = isEditMode && !isConnected && !isUsed && !hasNodeConnection &&
            !hasMcConnection && !hasRbConnection && !hasOnuConnection && !hasSplitterConnection && !hasSplitterOutputAtHost && !oltBlocksNode && !isCrossPatchLocked;
        const showFullConnectButtons = canAssignBase && !hasAnyOutConnection && !showGponBranchButtons;
        const canOfferRbChip = typeof canOfferRadioBridgeFiberConnectFromHost === 'function' &&
            canOfferRadioBridgeFiberConnectFromHost(sleeveObj);
        const canRestoreTakenFiber = isEditMode && isUsed && !isConnected && !hasAnyOutConnection;
        const isGponFeeder = occ.isGponFeeder;
        const isGponUpstreamOnly = occ.isGponUpstreamOnly;
        const fiberTextColor = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') ? '#000' : '#fff';
        let statusText = isUsed ? '(исп.)' : (isGponFeeder ? 'GPON feeder' : (hasNodeConnection ? '(на узел)' : (hasOnuConnection ? '(на ONU)' : (hasMcConnection ? '(на МК)' : (hasRbConnection ? '(на РМ)' : (hasSplitterConnection ? '(на сплит.)' : (hasDirectOltConnection ? '(от OLT)' : (isOltCableEnd ? '(→ OLT)' : '(своб.)'))))))));
        if (!isGponFeeder && realOltAssign && realOltAssign.oltId) {
            const oltObj = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === realOltAssign.oltId);
            const oltName = oltObj ? (oltObj.properties.get('name') || 'OLT') : (realOltAssign.oltName || 'OLT');
            if (realOltAssign.physicalCableOnly) {
                const physSuffix = realOltAssign.inheritedFromNetwork ? ' (по сети)' : (realOltAssign.viaSplice ? ' (через сращ.)' : '');
                statusText = '→ OLT ' + escapeHtml(oltName) + physSuffix;
            } else if (realOltAssign.incoming) {
                statusText = 'приход OLT ' + escapeHtml(oltName) + (realOltAssign.inheritedFromNetwork ? ' (по сети)' : '');
            } else {
                const ponSuffix = realOltAssign.inheritedFromNetwork ? ' (по сети)' : (realOltAssign.viaSplice ? ' (через сращ.)' : '');
                const portLabelStatus = oltObj ? getOltPortLabel(oltObj, realOltAssign.portNumber) : '';
                statusText = 'OLT ' + escapeHtml(oltName) + ', ' + escapeHtml(formatOltPortDisplay(realOltAssign.portNumber || '?', portLabelStatus, true)) + ponSuffix;
            }
        } else if (isOltCableEnd && oltOnCableEnd) {
            const oltNameEnd = oltOnCableEnd.oltName || 'OLT';
            statusText = '→ OLT ' + escapeHtml(oltNameEnd);
        }
        if (isGponFeeder) {
            const parts = [];
            if (hasDirectOltConnection && oltConnection && oltConnection.oltId) {
                const oltObjG = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltConnection.oltId);
                const oltNameG = oltObjG ? (oltObjG.properties.get('name') || 'OLT') : 'OLT';
                parts.push(oltConnection.incoming ? ('приход ' + oltNameG) : ('OLT ' + oltNameG + ' ' + formatOltPortDisplay(oltConnection.portNumber || '?', oltObjG ? getOltPortLabel(oltObjG, oltConnection.portNumber) : '', true)));
            }
            if (hasOnuConnection) parts.push('ONU ' + (onuConnection.onuName || 'ONU'));
            if (hasSplitterConnection) parts.push(splitterName);
            statusText = 'GPON feeder · ' + escapeHtml(parts.join(' · '));
        } else if (hasOnuConnection) {
            statusText = '→ ONU ' + escapeHtml(onuConnection.onuName || 'ONU');
        }
        if (hasMcConnection) statusText = '→ МК ' + escapeHtml(mcConnection.mediaConverterName || 'Медиаконвертер');
        if (hasRbConnection) statusText = '→ РМ ' + escapeHtml(rbConnection.radioBridgeName || 'Радиомост');
        if (hasSplitterConnection && !isGponFeeder) statusText = '→ ' + escapeHtml(splitterName);
        if (hasSplitterOutputAtHost) {
            if (realOltAssign && realOltAssign.oltId) {
                const oltObjSpOut = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === realOltAssign.oltId);
                const oltNameSpOut = oltObjSpOut ? (oltObjSpOut.properties.get('name') || 'OLT') : (realOltAssign.oltName || 'OLT');
                const spOltSuffix = realOltAssign.viaSplitter ? ' (через сплит.)' : (realOltAssign.inheritedFromNetwork ? ' (по сети)' : (realOltAssign.viaSplice ? ' (через сращ.)' : ''));
                statusText = '← «' + escapeHtml(splitterOutputName) + '» · OLT ' + escapeHtml(oltNameSpOut) + spOltSuffix;
            } else {
                statusText = '← от «' + escapeHtml(splitterOutputName) + '»';
            }
        }
        if (!hasDirectOltConnection && !isOltCableEnd && canConnectToOlt && !hasOnuConnection && !hasSplitterConnection && !hasSplitterOutputAtHost && !hasNodeConnection && !hasMcConnection && !isUsed && !isGponFeeder) {
            statusText = 'до OLT по сети';
        }
        if (isCrossPatchLocked && crossPatchInfo) {
            var patchMateSt = typeof resolveCrossPortPatchHost === 'function' ? resolveCrossPortPatchHost(crossPatchInfo.crossId) : null;
            var patchMateNameSt = patchMateSt ? (patchMateSt.properties.get('name') || 'Кросс') : 'Кросс';
            statusText = '⇄ «' + escapeHtml(patchMateNameSt) + '» п.' + crossPatchInfo.port;
        }
        let statusKind = 'free';
        if (isUsed) statusKind = 'used';
        else if (isGponFeeder) statusKind = 'gpon-feeder';
        else if (oltBlocksSplice || isGponUpstreamOnly) statusKind = 'gpon-upstream';
        else if (isOltCableEnd) statusKind = 'olt-cable';
        else if (hasNodeConnection) statusKind = 'node';
        else if (hasOnuConnection) statusKind = 'onu';
        else if (hasMcConnection) statusKind = 'mc';
        else if (hasRbConnection) statusKind = 'rb';
        else if (hasSplitterConnection) statusKind = 'splitter-in';
        else if (hasSplitterOutputAtHost) statusKind = 'splitter-out';
        else if (hasDirectOltConnection || canConnectToOlt) statusKind = 'olt';
        else if (isCrossPatchLocked) statusKind = 'cross-patch';
        const isUpstreamReachable = canConnectToOlt && !hasDirectOltConnection && !isOltCableEnd && !hasOnuConnection && !hasSplitterConnection;
        const isStrictOccupied = isOccupied && !isGponFeeder && !isGponUpstreamOnly && !isOltCableEnd && !isUpstreamReachable && !hasSplitterOutputAtHost;
        const usedClass = isGponFeeder ? ' fiber-gpon-feeder' : (oltBlocksSplice ? ' fiber-gpon-upstream' : (isOltCableEnd ? ' fiber-olt-cable' : (isUpstreamReachable ? ' fiber-gpon-upstream' : (isStrictOccupied ? ' fiber-used cross-fiber-used fiber-occupied' : (hasSplitterConnection ? ' fiber-splitter-connected' : (isCrossPatchLocked ? ' fiber-cross-patch-locked' : ''))))));
        const itemClasses = 'fiber-item fiber-item--' + statusKind + usedClass;
        var cellTitle = '';
        if (spliceConnLabel) cellTitle = 'Подпись сращивания: ' + spliceConnLabel;
        if (isGponFeeder || oltBlocksSplice) cellTitle = (cellTitle ? cellTitle + '. ' : '') + (isGponFeeder ? 'GPON feeder — сращивание недоступно' : 'Приход OLT — сращивание недоступно');
        else if (realOltAssign && realOltAssign.portNumber != null && !realOltAssign.incoming && isSpliceSelectable) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'PON-порт назначен — жилу можно сращивать';
        else if (isStrictOccupied || isUsed || isConnected) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Жила занята — выбор для сращивания недоступен';
        else if (isOltCableEnd && isSpliceSelectable) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Кабель от OLT — жилу можно сращивать с другим кабелем';
        else if (isEditMode && isSpliceSelectable) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Клик: выбрать жилу, затем клик по жиле в другом кабеле — создать соединение';
        else if (hasSplitterOutputAtHost && isEditMode && !isConnected && !isUsed) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Жила от выхода сплиттера — можно сращивать с жилой другого кабеля';
        else if (directLabel && !isConnected) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Подпись: ' + directLabel;
        else if (isCrossPatchLocked) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Порт кроссирован с другим кроссом — подключение к узлу/OLT/ONU недоступно';
        const portRow = isCross && typeof buildCrossPortTableRowHtml === 'function'
            ? buildCrossPortTableRowHtml(sleeveObj, crossPorts, cableData.cableUniqueId, fiber.number, currentPort, isEditMode, isDirectSpliced)
            : '';
        var disconnect = function(cls, title) {
            return isEditMode ? '<button type="button" class="fiber-assign__disconnect ' + cls + '" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" title="' + escapeHtml(title) + '">✕</button>' : '';
        };
        var assignRows = '';
        if (!isCrossPatchLocked) {
            if (hasNodeConnection) assignRows += buildFiberAssignRow('node', '🖥️', '→ ' + escapeHtml(nodeConnection.nodeName) + (nodeConnection.switchPort != null ? ' · SFP ' + nodeConnection.switchPort : ''), disconnect('btn-disconnect-node', 'Отключить от узла'));
            if (hasOnuConnection) assignRows += buildFiberAssignRow('onu', '📡', '→ ' + escapeHtml(onuConnection.onuName || 'ONU'), disconnect('btn-disconnect-onu', 'Отключить от ONU'));
            if (hasMcConnection) assignRows += buildFiberAssignRow('mc', '⇄', '→ ' + escapeHtml(mcConnection.mediaConverterName || 'МК'), disconnect('btn-disconnect-mc', 'Отключить от МК'));
            if (hasRbConnection) {
                var rbDisc = disconnect('btn-disconnect-rb', 'Отключить от радиомоста');
                if (typeof canDeleteRadioBridgeFeederCableOnDisconnect === 'function' &&
                    canDeleteRadioBridgeFeederCableOnDisconnect(sleeveObj, cableData.cableUniqueId, fiber.number)) {
                    rbDisc += '<button type="button" class="fiber-assign__disconnect fiber-assign__disconnect--delete-cable btn-disconnect-rb-delete-cable" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" title="Отключить и удалить кабель до радиомоста">🗑</button>';
                }
                assignRows += buildFiberAssignRow('rb', '◎', '→ ' + escapeHtml(rbConnection.radioBridgeName || 'Радиомост'), rbDisc);
            }
            if (hasSplitterConnection) {
                assignRows += buildFiberAssignRow('splitter', '🔀', '→ ' + escapeHtml(splitterName), disconnect('btn-disconnect-splitter', 'Отключить от сплиттера'));
            }
            if (hasSplitterOutputAtHost) {
                var outSpDisc = isEditMode ? '<button type="button" class="fiber-assign__disconnect btn-disconnect-splitter-output" data-splitter-id="' + escapeHtml(splitterOutputAtHost.splitterId) + '" data-output-index="' + splitterOutputAtHost.outputIndex + '" title="Отключить выход сплиттера">✕</button>' : '';
                assignRows += buildFiberAssignRow('splitter', '🔀', '← ' + escapeHtml(splitterOutputName) + ' вых.' + (splitterOutputAtHost.outputIndex + 1), outSpDisc);
            }
            if (realOltAssign && realOltAssign.oltId) {
                var oltObjCell = objects.find(function(obj) { return obj.properties && obj.properties.get('type') === 'olt' && obj.properties.get('uniqueId') === realOltAssign.oltId; });
                var oltNameCell = oltObjCell ? (oltObjCell.properties.get('name') || 'OLT') : (realOltAssign.oltName || 'OLT');
                var inhSuf = realOltAssign.inheritedFromNetwork ? ' (сеть)' : (realOltAssign.viaSplice ? ' (сращ.)' : '');
                var portLblCell = oltObjCell ? getOltPortLabel(oltObjCell, realOltAssign.portNumber) : '';
                var oltLbl = realOltAssign.physicalCableOnly ? ('→ OLT ' + escapeHtml(oltNameCell) + inhSuf) : (realOltAssign.incoming ? ('приход ' + escapeHtml(oltNameCell) + inhSuf) : ('OLT ' + escapeHtml(oltNameCell) + ' ' + escapeHtml(formatOltPortDisplay(realOltAssign.portNumber || '?', portLblCell, true)) + inhSuf));
                var canDiscOlt = isEditMode && getHostFiberMapEntry(sleeveObj, 'oltConnections', cableData.cableUniqueId, fiber.number);
                assignRows += buildFiberAssignRow('olt', '📶', oltLbl, canDiscOlt ? disconnect('btn-disconnect-olt', 'Отключить от OLT') : '');
            }
        }
        if (crossPatchInfo && crossPatchPort != null) {
            var patchMateCell = typeof resolveCrossPortPatchHost === 'function' ? resolveCrossPortPatchHost(crossPatchInfo.crossId) : null;
            var patchMateNameCell = patchMateCell ? (patchMateCell.properties.get('name') || 'Кросс') : 'Кросс';
            var patchDisc = isEditMode ? '<button type="button" class="fiber-assign__disconnect btn-disconnect-cross-patch" data-cross-port="' + crossPatchPort + '" title="Отключить кроссировку">✕</button>' : '';
            assignRows += buildFiberAssignRow('cross-patch', '⇄', 'п.' + crossPatchPort + ' → «' + escapeHtml(patchMateNameCell) + '» п.' + crossPatchInfo.port, patchDisc);
        }
        var actionChips = '';
        var suppressOtherChips = !!renderOpts.suppressActionChips;
        if (canConnectNodeOnHost) {
            actionChips += buildFiberChip('btn-connect-node fiber-chip--node', cableData.cableUniqueId, fiber.number, 'Подключить к узлу', 'Узел');
        }
        if (!suppressOtherChips) {
            if (canShowOltIncoming) {
                actionChips += buildFiberChip('btn-connect-olt fiber-chip--olt', cableData.cableUniqueId, fiber.number, 'Приход OLT', 'OLT');
            }
            if (showFullConnectButtons) {
                if (canOfferOnuChip) {
                    actionChips += buildFiberChip('btn-connect-onu fiber-chip--onu', cableData.cableUniqueId, fiber.number, 'Подключить к ONU', 'ONU');
                }
                actionChips += buildFiberChip('btn-connect-mc fiber-chip--mc', cableData.cableUniqueId, fiber.number, 'Медиаконвертер', 'МК');
                if (canOfferRbChip) {
                    actionChips += buildFiberChip('btn-connect-rb fiber-chip--rb', cableData.cableUniqueId, fiber.number, 'Прокладка кабеля к радиомосту', 'РМ');
                }
            }
            if (showGponBranchButtons && canOfferOnuChip) {
                actionChips += buildFiberChip('btn-connect-onu fiber-chip--onu', cableData.cableUniqueId, fiber.number, 'GPON на ONU', 'ONU');
            }
            if (isCross && crossPatchPort != null && !crossPatchInfo && isEditMode && !hasAnyOutConnection &&
                typeof isCrossPortAvailableForPatch === 'function' && isCrossPortAvailableForPatch(sleeveObj, crossPatchPort)) {
                actionChips += '<button type="button" class="fiber-chip btn-cross-port-patch fiber-chip--cross-patch" data-cross-port="' + crossPatchPort + '" title="Соединить порт ' + crossPatchPort + ' с другим кроссом">⇄ Кросс</button>';
            }
        }
        var actionsBlock = actionChips ? '<div class="fiber-item__actions">' + actionChips + '</div>' : '';
        var labelBlock = '';
        var showFiberLabel = !isConnected && !isDirectSpliced;
        if (showFiberLabel) {
            if (isEditMode) {
                labelBlock = '<input type="text" class="fiber-label-input form-input" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" value="' + escapeHtml(directLabel) + '" placeholder="Подпись…" title="Подпись жилы">';
            } else if (directLabel) {
                labelBlock = '<div class="fiber-item__label">📝 ' + escapeHtml(directLabel) + '</div>';
            }
        }
        var labelBeforeAssigns = !!(labelBlock && isCross && currentPort);
        var showStatusInHead = !assignRows;
        if (isConnected && !assignRows) {
            statusText = spliceConnLabel ? escapeHtml(spliceConnLabel) : 'Сращена';
            showStatusInHead = true;
        }
        var restoreBlock = canRestoreTakenFiber ? '<button type="button" class="fiber-chip fiber-chip--restore btn-restore-fiber" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" title="Снять отметку «взята»">Восстановить</button>' : '';
        return '<div class="' + itemClasses + '" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" data-fiber-connected="' + isConnected + '" data-fiber-used="' + isUsed + '" data-fiber-occupied="' + isOccupied + '" data-fiber-selectable="' + isSpliceSelectable + '" data-fiber-assigned="' + hasAnyOutConnection + '"' + (cellTitle ? ' title="' + cellTitle.replace(/"/g, '&quot;') + '"' : '') + '>' +
            '<div class="fiber-item__head">' +
            '<div class="fiber-color" style="background-color:' + fiber.color + ';--fiber-num-color:' + fiberTextColor + ';border-color:' + (fiber.hasBlackRing ? '#000' : 'rgba(0,0,0,0.35)') + '"><span class="fiber-num">' + fiber.number + '</span></div>' +
            '<span class="fiber-item__name">' + escapeHtml(fiber.name) + '</span>' +
            (showStatusInHead ? '<span class="fiber-item__status">' + statusText + '</span>' : '') +
            '</div>' +
            portRow +
            (labelBeforeAssigns ? labelBlock : '') +
            (assignRows ? '<div class="fiber-item__assigns">' + assignRows + '</div>' : '') +
            actionsBlock +
            (restoreBlock ? '<div class="fiber-item__restore">' + restoreBlock + '</div>' : '') +
            (!labelBeforeAssigns ? labelBlock : '') +
            '</div>';
    }

    const splittersData = buildSplittersTableData(sleeveObj);
    const cableDelBtnSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    const maxSplitterRows = splittersData.length ? Math.max.apply(null, splittersData.map(function(s) { return s.fibers.length; })) : 0;
    const maxRows = Math.max(1, maxFibers, maxSplitterRows);
    html += '<div class="cross-fiber-table-section">';
    html += '<h4 class="fiber-ws-panel-title fiber-ws-panel-title--table">Жилы и подключения</h4>';
    html += '<div class="cross-fiber-table-wrap">';
    html += '<table class="cross-fiber-table">';
    html += '<thead><tr>';
    cablesData.forEach((cableData) => {
        const cableTitle = cableData.cableName ? cableData.cableName : ('Кабель ' + cableData.index);
        html += '<th><div class="cross-fiber-th">';
        html += '<div class="cross-fiber-th-info">';
        html += `<div class="cross-fiber-th-title">${escapeHtml(cableTitle)}</div>`;
        html += `<div class="cross-fiber-th-meta"><span class="cross-fiber-th-desc">${cableData.cableDescription}</span><span class="cross-fiber-th-sep" aria-hidden="true">·</span><span class="cross-fiber-th-dir">${cableData.isFromSleeve ? '← от муфты' : '→ к муфте'}</span></div>`;
        html += '</div>';
        if (isEditMode) {
            var crossFiberN = getFiberCount(cableData.cable);
            var palBtnHtml = window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета';
            html += `<div class="cross-fiber-th-actions"><input type="number" class="cable-fiber-count-input cross-cable-fiber-count form-input" data-cable-id="${cableData.cableUniqueId}" min="1" max="96" value="${crossFiberN}" title="Число жил" aria-label="Число жил"><button type="button" class="btn-secondary btn-cable-palette-edit" data-cable-id="${cableData.cableUniqueId}" title="Цвета жил">${palBtnHtml}</button><button type="button" class="btn-delete-cable btn-delete-cable--toolbar" data-action="delete-cable" data-cable-id="${cableData.cableUniqueId}" title="Удалить кабель" aria-label="Удалить кабель">${cableDelBtnSvg}</button></div>`;
        }
        html += '</div></th>';
    });
    splittersData.forEach(function(spData) {
        html += '<th class="cross-fiber-th--splitter"><div class="cross-fiber-th">';
        html += '<div class="cross-fiber-th-info">';
        html += '<div class="cross-fiber-th-title">🔀 ' + escapeHtml(spData.name) + '</div>';
        html += '<div class="cross-fiber-th-meta"><span class="cross-fiber-th-desc">1:' + spData.ratio + '</span><span class="cross-fiber-th-sep" aria-hidden="true">·</span><span class="cross-fiber-th-dir">сплиттер</span></div>';
        html += '</div>';
        if (isEditMode) {
            html += '<div class="cross-fiber-th-actions cross-fiber-th-actions--splitter">';
            html += '<button type="button" class="btn-secondary fiber-ws-splitter-col-locate" data-splitter-id="' + escapeHtml(spData.splitterId) + '" title="Показать на схеме">◎</button>';
            html += '<button type="button" class="btn-secondary fiber-ws-splitter-col-edit" data-splitter-id="' + escapeHtml(spData.splitterId) + '" title="Изменить">✎</button>';
            html += '</div>';
        }
        html += '</div></th>';
    });
    html += '</tr></thead><tbody>';
    for (let row = 0; row < maxRows; row++) {
        html += '<tr>';
        cablesData.forEach((cableData) => {
            const fiber = cableData.fibers[row];
            html += '<td>';
            if (fiber) {
                html += buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, fiberPorts, crossPorts, oltReachCache);
            } else {
                html += '<div class="cross-fiber-empty">—</div>';
            }
            html += '</td>';
        });
        splittersData.forEach(function(spData) {
            var vf = spData.fibers[row];
            html += '<td class="cross-fiber-td--splitter">';
            if (vf) {
                html += buildSplitterFiberCell(spData, vf, sleeveObj, isEditMode, cablesData, {
                    isCross: isCross,
                    oltReachCache: oltReachCache,
                    renderCableCell: function(cd, fiber) {
                        return buildFiberCell(cd, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, fiberPorts, crossPorts, oltReachCache, { suppressActionChips: true });
                    }
                });
            } else {
                html += '<div class="cross-fiber-empty">—</div>';
            }
            html += '</td>';
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div></div></div></div>';
    html += '</main></div>';
    if (isEditMode) {
        html += buildFiberSchemeSplitterPanelsHtml();
    }
    if (isEditMode) {
        html += '<div id="fiber-conn-label-bar" class="fiber-conn-label-modal" hidden aria-hidden="true" role="dialog" aria-labelledby="fiber-conn-label-modal-title">';
        html += '<div class="fiber-conn-label-modal__backdrop" id="fiber-conn-label-bar-backdrop"></div>';
        html += '<div class="fiber-conn-label-modal__panel panel-glass panel-glass--lite">';
        html += '<div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>';
        html += '<div class="fiber-conn-label-modal__header">';
        html += '<h3 id="fiber-conn-label-modal-title" class="fiber-conn-label-modal__title">Подпись соединения</h3>';
        html += '<button type="button" id="fiber-conn-label-bar-close" class="fiber-conn-label-modal__close" title="Закрыть" aria-label="Закрыть">×</button>';
        html += '</div>';
        html += '<div class="fiber-conn-label-modal__body">';
        html += '<p id="fiber-conn-label-bar-desc" class="fiber-conn-label-bar-desc"></p>';
        html += '<label class="fiber-conn-label-modal__label" for="fiber-conn-label-bar-input">Подпись на линии</label>';
        html += '<input type="text" id="fiber-conn-label-bar-input" class="form-input fiber-conn-label-bar-input" placeholder="Подпись на линии…" autocomplete="off" data-link-mode="splice">';
        html += '<div class="fiber-conn-label-modal__actions">';
        html += '<button type="button" id="fiber-conn-label-bar-goto" class="btn-secondary fiber-conn-label-bar-goto">Список соединений</button>';
        html += '<button type="button" id="fiber-conn-label-bar-delete" class="btn-danger fiber-conn-label-bar-delete">Удалить соединение</button>';
        html += '</div></div></div></div>';
    }
    html += '</div>';

    html += `<div id="fiber-connections-data" data-sleeve-obj-id="${sleeveObj.properties.get('uniqueId') || 'temp'}" style="display: none;"></div>`;
    
    return html;
}

function captureFiberWorkspaceUiState() {
    var root = document.querySelector('.fiber-workspace');
    if (root) {
        var activeMain = root.querySelector('.fiber-ws-tab.active');
        if (activeMain) {
            try { sessionStorage.setItem('fiberWorkspaceTab', activeMain.getAttribute('data-tab') || 'scheme'); } catch (e) {}
        }
    }
    var sidebar = document.querySelector('.fiber-ws-sidebar');
    if (sidebar) {
        var activeSide = sidebar.querySelector('.fiber-ws-side-tab.active');
        if (activeSide) {
            try { sessionStorage.setItem('fiberWorkspaceSideTab', activeSide.getAttribute('data-side-tab') || 'main'); } catch (e) {}
        }
    }
    if (typeof getFiberSchemeScrollPos === 'function') {
        savedFiberConnectionsScrollPos = getFiberSchemeScrollPos();
    }
}

function setupFiberSidebarTabs() {
    var sidebar = document.querySelector('.fiber-ws-sidebar');
    if (!sidebar) return;
    var sideTabs = sidebar.querySelectorAll('.fiber-ws-side-tab');
    var sidePanels = sidebar.querySelectorAll('.fiber-ws-side-panel');
    if (!sideTabs.length) return;
    function showSideTab(tabName) {
        var exists = false;
        sideTabs.forEach(function(t) {
            if (t.getAttribute('data-side-tab') === tabName) exists = true;
        });
        if (!exists) tabName = 'main';
        sideTabs.forEach(function(t) {
            var on = t.getAttribute('data-side-tab') === tabName;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        sidePanels.forEach(function(p) {
            var on = p.getAttribute('data-side-panel') === tabName;
            p.classList.toggle('active', on);
            if (on) p.removeAttribute('hidden');
            else p.setAttribute('hidden', '');
        });
        try { sessionStorage.setItem('fiberWorkspaceSideTab', tabName); } catch (e) {}
    }
    sideTabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
            showSideTab(this.getAttribute('data-side-tab'));
        });
    });
    var savedSideTab = 'main';
    try { savedSideTab = sessionStorage.getItem('fiberWorkspaceSideTab') || 'main'; } catch (e) {}
    showSideTab(savedSideTab);
}

function setupFiberWorkspaceUI() {
    var root = document.querySelector('.fiber-workspace');
    if (!root) return;
    setupFiberSidebarTabs();
    var tabs = root.querySelectorAll('.fiber-ws-tab');
    var panels = root.querySelectorAll('.fiber-ws-panel');
    var zoomToolbar = document.getElementById('fiber-ws-toolbar-zoom');
    var savedTab = sessionStorage.getItem('fiberWorkspaceTab') || 'scheme';
    function showTab(tabName) {
        tabs.forEach(function(t) {
            var on = t.getAttribute('data-tab') === tabName;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panels.forEach(function(p) {
            p.classList.toggle('active', p.getAttribute('data-panel') === tabName);
        });
        if (zoomToolbar) zoomToolbar.style.display = tabName === 'scheme' ? '' : 'none';
        sessionStorage.setItem('fiberWorkspaceTab', tabName);
    }
    tabs.forEach(function(tab) {
        tab.addEventListener('click', function() { showTab(this.getAttribute('data-tab')); });
    });
    showTab(['scheme', 'table', 'connections'].indexOf(savedTab) >= 0 ? savedTab : 'scheme');
    var filterEl = document.getElementById('fiber-table-filter');
    var searchEl = document.getElementById('fiber-table-search');
    function applyTableFilter() {
        var filter = filterEl ? filterEl.value : 'all';
        var q = searchEl ? searchEl.value.trim() : '';
        document.querySelectorAll('.cross-fiber-table .fiber-item').forEach(function(el) {
            var connected = el.getAttribute('data-fiber-connected') === 'true';
            var occupied = el.getAttribute('data-fiber-occupied') === 'true';
            var used = el.getAttribute('data-fiber-used') === 'true';
            var assigned = el.getAttribute('data-fiber-assigned') === 'true';
            var num = el.getAttribute('data-fiber-number') || '';
            var show = true;
            if (filter === 'connected') show = connected;
            else if (filter === 'free') show = !occupied;
            else if (filter === 'used') show = occupied;
            if (show && q && num.indexOf(q) === -1) show = false;
            el.style.display = show ? '' : 'none';
        });
    }
    if (filterEl) filterEl.addEventListener('change', applyTableFilter);
    if (searchEl) searchEl.addEventListener('input', applyTableFilter);
}

function toggleFiberUsage(cableUniqueId, fiberNumber) {
    if (!currentModalObject) return;
    
    const usedFibers = getUsedFibers(currentModalObject, cableUniqueId);
    const index = usedFibers.indexOf(fiberNumber);
    
    if (index > -1) {
        
        usedFibers.splice(index, 1);
    } else {
        
        usedFibers.push(fiberNumber);
    }
    
    setUsedFibers(currentModalObject, cableUniqueId, usedFibers);

    refreshObjectModal(currentModalObject);
}

function restoreFiberInSleeve(sleeveObj, cableId, fiberNumber) {
    if (!sleeveObj || !cableId || fiberNumber == null) return;
    var usedFibers = getUsedFibers(sleeveObj, cableId);
    var idx = usedFibers.indexOf(fiberNumber);
    if (idx < 0) {
        if (typeof showInfo === 'function') showInfo('Жила уже свободна в муфте.', 'Восстановление');
        return;
    }
    usedFibers.splice(idx, 1);
    setUsedFibers(sleeveObj, cableId, usedFibers);
    saveData();
    if (typeof showSuccess === 'function') showSuccess('Жила ' + fiberNumber + ' восстановлена в муфте — можно сращивать и подключать.', 'Восстановление');
    showObjectInfo(sleeveObj);
}

function lookupSchemeFiber(schemeBlocks, cableId, fiberNumber) {
    if (!schemeBlocks || !cableId || fiberNumber == null) return null;
    for (var i = 0; i < schemeBlocks.length; i++) {
        var cd = schemeBlocks[i].cableData;
        if (!cd || cd.cableUniqueId !== cableId) continue;
        var fibers = cd.fibers || [];
        for (var j = 0; j < fibers.length; j++) {
            if (fibers[j].number === fiberNumber) return fibers[j];
        }
    }
    return null;
}

function lookupSchemeFiberColor(schemeBlocks, cableId, fiberNumber) {
    var fiber = lookupSchemeFiber(schemeBlocks, cableId, fiberNumber);
    return fiber ? fiber.color : null;
}

/** Бейджи и номера жил — верхний слой поверх линий кросса/сращений. */
function buildFiberSchemePortNumsSvg(schemeBlocks, fiberPositions, opts) {
    opts = opts || {};
    var badgeW = opts.badgeW || 22;
    var badgeH = opts.badgeH || 16;
    var nodeR = opts.nodeR || 4;
    var badgeFill = opts.badgeFill || '#eff6ff';
    var badgeStroke = opts.badgeStroke || '#2563eb';
    var sleeveObj = opts.sleeveObj;
    var html = '<g class="fiber-scheme-port-nums">';
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        cableData.fibers.forEach(function(fiber) {
            const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
            const pos = fiberPositions.get(fiberKey);
            if (!pos) return;
            var badgeX = pos.x - badgeW / 2;
            var badgeY = pos.y - badgeH / 2;
            var strokeW = 1.5;
            var strokeCol = badgeStroke;
            var isUsed = false;
            if (sleeveObj) {
                var occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData,
                    opts.fiberConnections || [], opts.nodeConnections || {}, opts.oltConnections || {},
                    opts.onuConnections || {}, opts.mediaConverterConnections || {},
                    opts.splitterConnections || {}, sleeveObj);
                isUsed = occ.isUsed;
                if (occ.isGponFeeder) strokeCol = '#0284c7';
                else if (occ.isGponUpstreamOnly) strokeCol = '#0ea5e9';
                else if (occ.isOccupied) { strokeCol = '#dc2626'; strokeW = 2.5; }
            }
            var nodePt = fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
            var numPt = fiberSchemeFiberNumLabelPoint(pos, badgeW);
            var circleStroke = isUsed ? '#dc2626' : '#333';
            if (fiber.hasBlackRing) circleStroke = '#000';
            html += '<rect class="fiber-port-badge fiber-port-badge--top" data-fiber-key="' + fiberKey + '" x="' + badgeX + '" y="' + badgeY + '" width="' + badgeW + '" height="' + badgeH + '" rx="2" fill="' + badgeFill + '" stroke="' + strokeCol + '" stroke-width="' + strokeW + '"/>';
            html += '<text class="fiber-port-num" data-fiber-key="' + fiberKey + '" x="' + numPt.x + '" y="' + numPt.y + '" text-anchor="' + numPt.anchor + '" style="font-size: 8px; font-weight: 700; fill: ' + badgeStroke + '; pointer-events: none;">' + fiber.number + '</text>';
            html += '<circle class="fiber-port-node" data-fiber-key="' + fiberKey + '" cx="' + nodePt.x + '" cy="' + nodePt.y + '" r="' + nodeR + '" fill="' + fiber.color + '" stroke="' + circleStroke + '" stroke-width="1.5"/>';
        });
    });
    html += '</g>';
    return html;
}

function ensureFiberSchemePortNumsOnTop(svg) {
    if (!svg) return;
    var nums = svg.querySelector('.fiber-scheme-port-nums');
    if (nums) svg.appendChild(nums);
}

/** Раскладка подписи свободной жилы относительно точки подключения. */
function fiberSchemeFiberLabelLayout(pos, text, badgeW, badgeH, nodeR) {
    badgeW = badgeW || 22;
    badgeH = badgeH || 16;
    nodeR = nodeR || 4;
    var trimmed = text ? String(text).trim() : '';
    var tw = Math.min(120, Math.max(36, trimmed.length * 6.5 + 14));
    var th = 18;
    var nodePt = fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
    var tx, ty, textX, anchor;
    if (pos && pos.isTop) {
        tx = nodePt.x - tw / 2;
        ty = nodePt.y + 6;
        textX = nodePt.x;
        anchor = 'middle';
    } else if (pos && pos.isLeft) {
        tx = nodePt.x + 8;
        ty = nodePt.y - th / 2 + 1;
        textX = tx;
        anchor = 'start';
    } else {
        tx = nodePt.x - tw - 8;
        ty = nodePt.y - th / 2 + 1;
        textX = nodePt.x - 8;
        anchor = 'end';
    }
    return { tx: tx, ty: ty, tw: tw, th: th, textX: textX, textY: ty + 13, anchor: anchor };
}

/** Центр цветной точки жилы — снаружи бейджа, после номера (со стороны схемы). */
function fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR) {
    badgeW = badgeW || 22;
    badgeH = badgeH || 16;
    nodeR = nodeR || 4;
    var gap = 2;
    if (pos && pos.isTop) {
        return { x: pos.x, y: pos.y + badgeH / 2 + nodeR + gap };
    }
    if (pos && pos.isLeft) {
        return { x: pos.x + badgeW / 2 + nodeR + gap, y: pos.y };
    }
    return { x: pos.x - badgeW / 2 - nodeR - gap, y: pos.y };
}

/** Позиция номера жилы — смещён к кабелю, точка идёт после номера. */
function fiberSchemeFiberNumLabelPoint(pos, badgeW) {
    badgeW = badgeW || 22;
    if (pos && pos.isTop) {
        return { x: pos.x, y: pos.y + 3, anchor: 'middle' };
    }
    if (pos && pos.isLeft) {
        return { x: pos.x - 5, y: pos.y + 3, anchor: 'middle' };
    }
    return { x: pos.x + 5, y: pos.y + 3, anchor: 'middle' };
}

/** Точка выхода линии соединения (к кроссу или к другой жиле) — с цветной точки жилы. */
function fiberSchemeFiberLinkAnchor(pos, badgeW, badgeH, nodeR) {
    return fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
}

var FIBER_SPLICE_STRIPE_LEN = 9;

/** Цвет линии соединения в схеме кросса/муфты (контраст на светлом/тёмном фоне). */
function fiberSchemeLinkStrokeColor(fiberColor, isDark) {
    if (!fiberColor) return isDark ? '#fbbf24' : '#d97706';
    const c = String(fiberColor).toUpperCase();
    if (c === '#FFFFFF' || c === '#FFFF00' || c === '#FFFACD' || c === '#FFC0CB') {
        return isDark ? '#fde047' : '#ca8a04';
    }
    if (c === '#00FF00') return isDark ? '#4ade80' : '#15803d';
    if (c === '#000000') return isDark ? '#cbd5e1' : '#374151';
    if (c === '#0000FF' && isDark) return '#60a5fa';
    return fiberColor;
}

/** Кнопки стороны/зеркала кабеля на схеме. */
function renderFiberCableActionButtons(block, cableId, sideAttr, isMirrored, isLeft, isDark) {
    var actionBtnW = 18;
    var actionGap = 2;
    var actionsW = (FIBER_SCHEME_CABLE_SIDES.length + 1) * actionBtnW + FIBER_SCHEME_CABLE_SIDES.length * actionGap;
    var isTop = !!block.isTop;
    var actionsX;
    var actionsY;
    if (block.actionsX != null && block.actionsY != null) {
        actionsX = block.actionsX;
        actionsY = block.actionsY;
    } else if (isTop) {
        actionsX = block.barX1;
        actionsY = block.actionsY != null ? block.actionsY : block.blockTop;
    } else {
        actionsX = isLeft ? block.barX2 - actionsW : block.barX1;
        actionsY = block.cableBarY - 34;
    }
    var actionBg = isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.96)';
    var actionIcon = isDark ? '#94a3b8' : '#475569';
    var html = '<g class="fiber-cable-side-btns-svg" data-cable-id="' + cableId + '">';
    FIBER_SCHEME_CABLE_SIDES.forEach(function(sideId, si) {
        var bx = actionsX + si * (actionBtnW + actionGap);
        var icon = sideId === 'left' ? '←' : (sideId === 'top' ? '↑' : '→');
        var activeStroke = sideAttr === sideId ? '#f97316' : 'rgba(148,163,184,0.45)';
        html += '<rect class="fiber-cable-side-btn-hit" data-cable-id="' + cableId + '" data-cable-side="' + sideId + '" x="' + bx + '" y="' + actionsY + '" width="' + actionBtnW + '" height="' + actionBtnW + '" rx="4" fill="' + actionBg + '" stroke="' + activeStroke + '" stroke-width="1"><title>' + getCableSchemeSideLabel(sideId) + '</title></rect>';
        html += '<text class="fiber-cable-side-btn-icon" x="' + (bx + actionBtnW / 2) + '" y="' + (actionsY + 13) + '" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">' + icon + '</text>';
    });
    var mirrorX = actionsX + FIBER_SCHEME_CABLE_SIDES.length * (actionBtnW + actionGap);
    var mirrorStroke = isMirrored ? '#f97316' : 'rgba(148,163,184,0.45)';
    html += '<rect class="fiber-cable-mirror-hit" data-cable-id="' + cableId + '" x="' + mirrorX + '" y="' + actionsY + '" width="' + actionBtnW + '" height="' + actionBtnW + '" rx="4" fill="' + actionBg + '" stroke="' + mirrorStroke + '" stroke-width="1"><title>Зеркалировать жилы</title></rect>';
    html += '<text class="fiber-cable-mirror-icon" x="' + (mirrorX + actionBtnW / 2) + '" y="' + (actionsY + 13) + '" text-anchor="middle" style="font-size:10px;fill:' + actionIcon + ';pointer-events:none;">⇄</text>';
    html += '</g>';
    return html;
}

var FIBER_SCHEME_FILLET_K = 0.5522847498;

function fiberSchemeFilletRadius(adx, ady, dist) {
    var r = Math.max(16, Math.min(36, Math.min(adx, ady, dist * 0.28) + 16));
    if (r * 2.4 > adx) r = Math.max(10, adx * 0.4);
    if (r * 2.4 > ady) r = Math.max(10, ady * 0.4);
    return r;
}

/** Плавный ортогональный путь с кубическими скруглениями углов. */
function buildFiberSchemeBendAtPointPath(x1, y1, x2, y2, opts) {
    opts = opts || {};
    var bendStart = !!opts.bendStart;
    var bendEnd = !!opts.bendEnd;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    if (adx < 3 && ady < 3) {
        return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    }
    var dist = Math.sqrt(dx * dx + dy * dy);
    var r = fiberSchemeFilletRadius(adx, ady, dist);
    var k = FIBER_SCHEME_FILLET_K;
    var hx = dx >= 0 ? 1 : -1;
    var hxIn = -hx;
    var hy = dy >= 0 ? 1 : -1;
    var parts = ['M ' + x1 + ' ' + y1];

    if (bendStart && bendEnd) {
        if (ady > r * 1.5) {
            parts.push('L ' + x1 + ' ' + (y2 - hy * r));
        }
        if (adx > r * 1.5) {
            if (ady > r * 1.5) {
                parts.push('C ' + x1 + ' ' + (y2 - hy * r + hy * r * k) + ', ' +
                    (x1 + hx * r * (1 - k)) + ' ' + y2 + ', ' + (x1 + hx * r) + ' ' + y2);
            }
            parts.push('L ' + (x2 + hxIn * r) + ' ' + y2);
            parts.push('C ' + (x2 + hxIn * r + hx * r * k) + ' ' + y2 + ', ' +
                x2 + ' ' + (y2 - hy * r + hy * r * k) + ', ' + x2 + ' ' + y2);
        } else {
            parts.push('L ' + x2 + ' ' + y2);
        }
        return parts.join(' ');
    }

    if (bendStart) {
        if (ady < 3) {
            parts.push('C ' + x1 + ' ' + (y1 + r * k * 0.45) + ', ' +
                (x1 + hx * r * (1 - k)) + ' ' + y1 + ', ' + (x1 + hx * r) + ' ' + y1);
            parts.push('L ' + x2 + ' ' + y2);
        } else {
            if (ady > r * 1.5) {
                parts.push('L ' + x1 + ' ' + (y2 - hy * r));
            }
            if (adx > r * 1.5) {
                if (ady > r * 1.5) {
                    parts.push('C ' + x1 + ' ' + (y2 - hy * r + hy * r * k) + ', ' +
                        (x1 + hx * r * (1 - k)) + ' ' + y2 + ', ' + (x1 + hx * r) + ' ' + y2);
                }
                parts.push('L ' + x2 + ' ' + y2);
            } else {
                parts.push('L ' + x1 + ' ' + y2);
            }
        }
        return parts.join(' ');
    }

    if (bendEnd) {
        var inX = x2 + hxIn * r;
        if (adx > r * 1.5) {
            parts.push('L ' + inX + ' ' + y1);
        }
        if (ady > r * 1.5) {
            if (adx > r * 1.5) {
                parts.push('C ' + (inX + hx * r * k) + ' ' + y1 + ', ' +
                    x2 + ' ' + (y1 + hy * r * (1 - k)) + ', ' + x2 + ' ' + (y1 + hy * r));
            }
            parts.push('L ' + x2 + ' ' + (y2 - hy * r));
            parts.push('C ' + x2 + ' ' + (y2 - hy * r + hy * r * k) + ', ' +
                x2 + ' ' + (y2 - hy * r + hy * r * k) + ', ' + x2 + ' ' + y2);
        } else {
            parts.push('L ' + x2 + ' ' + y2);
        }
        return parts.join(' ');
    }

    return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
}

/** Изогнутый отвод жилы: от магистрали кабеля S-образной кривой к порту жилы (виден веер при нескольких кабелях). */
function buildFiberSchemeFanPath(block, pos, isLeft, nodeR, badgeW, isTop) {
    var badgeH = 16;
    var exitPt = fiberSchemeFiberNodePoint(pos, badgeW, badgeH, nodeR);
    if (isTop || block.isTop) {
        return 'M ' + pos.x + ' ' + block.cableBarY + ' L ' + exitPt.x + ' ' + exitPt.y;
    }
    const sx = block.fanOriginX;
    const sy = block.cableBarY;
    const ex = exitPt.x;
    const ey = exitPt.y;
    const dy = ey - sy;
    const absDy = Math.abs(dy);
    const dx = Math.abs(ex - sx);
    const bowV = Math.max(22, Math.min(90, absDy * 0.9 + dx * 0.12 + 16));
    const bowH = Math.max(16, Math.min(48, dx * 0.35 + 12));
    let c1x, c1y, c2x, c2y;
    if (isLeft) {
        c1x = sx + bowH * 0.2;
        c1y = sy + (dy >= 0 ? bowV * 0.5 : -bowV * 0.5);
        c2x = ex - bowH;
        c2y = ey - (dy >= 0 ? bowV * 0.25 : -bowV * 0.25);
    } else {
        c1x = sx - bowH * 0.2;
        c1y = sy + (dy >= 0 ? bowV * 0.5 : -bowV * 0.5);
        c2x = ex + bowH;
        c2y = ey - (dy >= 0 ? bowV * 0.25 : -bowV * 0.25);
    }
    if (absDy < 10) {
        c1y = sy - bowV * 0.42;
        c2y = ey + bowV * 0.42;
    }
    return 'M ' + sx + ' ' + sy + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + ex + ' ' + ey;
}

function splicePathHitsObstacle(sx, y1, ex, y2, obs, pad) {
    pad = pad != null ? pad : 12;
    const rx = obs.x - pad;
    const ry = obs.y - pad;
    const rw = obs.w + pad * 2;
    const rh = obs.h + pad * 2;
    const minX = Math.min(sx, ex);
    const maxX = Math.max(sx, ex);
    if (maxX < rx || minX > rx + rw) return false;
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (maxY < ry || minY > ry + rh) return false;
    const midX = (sx + ex) * 0.5;
    const midY = (y1 + y2) * 0.5;
    return midX >= rx && midX <= rx + rw && midY >= ry && midY <= ry + rh;
}

function updateFiberSchemeSplicePaths(svg, hostObj, svgWidth, svgHeight, portHalf) {
    if (!svg || !hostObj) return;
    portHalf = portHalf != null ? portHalf : 6;
    var obstacles = window.EmbeddedSplitters && EmbeddedSplitters.getSchemeSplitterObstacles
        ? EmbeddedSplitters.getSchemeSplitterObstacles(hostObj, svgWidth, svgHeight)
        : [];
    svg.querySelectorAll('.fiber-scheme-link[data-connection-index]').forEach(function(link) {
        var fromX = parseFloat(link.getAttribute('data-from-exit-x'));
        var fromY = parseFloat(link.getAttribute('data-from-y'));
        var toX = parseFloat(link.getAttribute('data-to-exit-x'));
        var toY = parseFloat(link.getAttribute('data-to-y'));
        if (isNaN(fromX) || isNaN(fromY) || isNaN(toX) || isNaN(toY)) return;
        var pathD = buildFiberSchemeConnectionPath(fromX, fromY, toX, toY, portHalf, {
            sameSide: link.getAttribute('data-same-side') === '1',
            isLeft: link.getAttribute('data-from-left') === '1',
            isTop: link.getAttribute('data-from-top') === '1',
            toTop: link.getAttribute('data-to-top') === '1',
            svgWidth: svgWidth,
            obstacles: obstacles
        });
        link.setAttribute('d', pathD);
        var connIndex = link.getAttribute('data-connection-index');
        var shadow = svg.querySelector('.fiber-scheme-link-shadow[data-connection-index="' + connIndex + '"]');
        if (shadow) shadow.setAttribute('d', pathD);
        var outline = svg.querySelector('.fiber-scheme-link-outline[data-connection-index="' + connIndex + '"]');
        if (outline) outline.setAttribute('d', pathD);
        var stripeB = svg.querySelector('.fiber-scheme-link-stripe-b[data-connection-index="' + connIndex + '"]');
        if (stripeB) stripeB.setAttribute('d', pathD);
        var hit = svg.querySelector('.fiber-scheme-link-hit[data-connection-index="' + connIndex + '"]');
        if (hit) hit.setAttribute('d', pathD);
        var labelG = svg.querySelector('.fiber-scheme-conn-label[data-connection-index="' + connIndex + '"]');
        if (labelG) {
            var labelText = link.getAttribute('data-conn-label') || '';
            if (labelG.classList.contains('is-visible') || selectedFiberConnectionIndex != null && String(selectedFiberConnectionIndex) === connIndex) {
                refreshFiberSchemeConnectionLabelDom(parseInt(connIndex, 10), labelText);
            }
        }
    });
}

function avoidObstaclesForSplicePath(sx, y1, ex, y2, c1x, c1y, c2x, c2y, obstacles) {
    (obstacles || []).forEach(function(obs) {
        if (!splicePathHitsObstacle(sx, y1, ex, y2, obs)) return;
        const routeAbove = (y1 + y2) * 0.5 >= obs.cy;
        const avoidY = routeAbove ? obs.y - 24 : obs.y + obs.h + 24;
        const midY = (y1 + y2) * 0.5;
        const shift = avoidY - midY;
        c1y += shift * 0.92;
        c2y += shift * 0.92;
    });
    return { c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y };
}

/** Плавная кубическая кривая между портами жил. При сращении в одном столбце — дуга к центру схемы. */
function buildFiberSchemeConnectionPath(x1, y1, x2, y2, portHalf, opts) {
    opts = opts || {};
    const sameSide = opts.sameSide || Math.abs(x2 - x1) < 10;
    const obstacles = opts.obstacles || [];

    if (!sameSide && (opts.isTop || opts.toTop)) {
        return buildFiberSchemeBendAtPointPath(x1, y1, x2, y2, {
            bendStart: !!opts.isTop,
            bendEnd: !!opts.toTop
        });
    }

    const goRight = x2 >= x1;
    const sx = x1 + (goRight ? portHalf : -portHalf);
    const ex = x2 + (goRight ? -portHalf : portHalf);
    const dy = y2 - y1;
    const absDy = Math.abs(dy);
    let c1x, c1y, c2x, c2y;

    if (sameSide) {
        if (opts.isTop) {
            const bowY = Math.max(48, Math.min(160, Math.abs(x2 - x1) * 0.45 + 40));
            c1x = sx;
            c2x = ex;
            c1y = y1 + bowY;
            c2y = y2 + bowY;
        } else {
            const isLeft = opts.isLeft != null ? opts.isLeft : x1 < (opts.svgWidth || 800) / 2;
            const bowX = Math.max(48, Math.min(160, absDy * 0.5 + 40)) * (isLeft ? 1 : -1);
            const bowY = Math.max(8, Math.min(32, absDy * 0.1));
            c1x = sx + bowX;
            c2x = ex + bowX;
            c1y = y1 + (dy >= 0 ? bowY : -bowY);
            c2y = y2 + (dy >= 0 ? -bowY : bowY);
        }
    } else {
        const dx = Math.abs(x2 - x1);
        const bow = Math.max(18, Math.min(64, dx * 0.45));
        c1x = sx + (goRight ? bow : -bow);
        c2x = ex + (goRight ? -bow : bow);
        c1y = y1;
        c2y = y2;
    }
    const adjusted = avoidObstaclesForSplicePath(sx, y1, ex, y2, c1x, c1y, c2x, c2y, obstacles);
    return 'M ' + sx + ' ' + y1 + ' C ' + adjusted.c1x + ' ' + adjusted.c1y + ', ' + adjusted.c2x + ' ' + adjusted.c2y + ', ' + ex + ' ' + y2;
}

/** Вертикальный шаг «дорожек» подхода линий от верхнего кабеля к портам кросса. */
var FIBER_SCHEME_TOP_CROSS_LANE_GAP = 10;
/** Мин. горизонтальный сдвиг, при котором жиле нужна отдельная горизонтальная дорожка. */
var FIBER_SCHEME_TOP_CROSS_MIN_DX = 12;

/**
 * Назначает разным жилам верхнего кабеля разный approachY,
 * чтобы горизонтальные сегменты перед изгибом вниз не наслаивались.
 * entries: [{ fiberKey, fx, px, fy? }]
 * @returns {Map<string, number>} fiberKey → approachY
 */
function assignTopCrossLinkApproachYs(entries, baseApproachY, opts) {
    opts = opts || {};
    var laneGap = opts.laneGap != null ? opts.laneGap : FIBER_SCHEME_TOP_CROSS_LANE_GAP;
    var minDx = opts.minDx != null ? opts.minDx : FIBER_SCHEME_TOP_CROSS_MIN_DX;
    var result = new Map();
    if (!entries || !entries.length) return result;

    var routed = [];
    var minFiberFloor = null;
    entries.forEach(function(e) {
        if (!e || !e.fiberKey) return;
        if (e.fy != null && !isNaN(e.fy)) {
            var floor = e.fy + 18;
            minFiberFloor = minFiberFloor == null ? floor : Math.max(minFiberFloor, floor);
        }
        if (Math.abs(e.px - e.fx) < minDx) {
            result.set(e.fiberKey, baseApproachY);
            return;
        }
        routed.push({
            fiberKey: e.fiberKey,
            fx: e.fx,
            px: e.px,
            x0: Math.min(e.fx, e.px),
            x1: Math.max(e.fx, e.px)
        });
    });

    // По левому краю span — корректный greedy packing пересекающихся горизонталей.
    routed.sort(function(a, b) {
        if (a.x0 !== b.x0) return a.x0 - b.x0;
        if (a.px !== b.px) return a.px - b.px;
        if (a.fx !== b.fx) return a.fx - b.fx;
        return String(a.fiberKey).localeCompare(String(b.fiberKey));
    });

    var laneEnds = [];
    var laneByKey = new Map();
    var maxLane = 0;
    routed.forEach(function(e) {
        var lane = -1;
        for (var i = 0; i < laneEnds.length; i++) {
            if (laneEnds[i] <= e.x0 + 1) {
                lane = i;
                break;
            }
        }
        if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(e.x1);
        } else {
            laneEnds[lane] = e.x1;
        }
        laneByKey.set(e.fiberKey, lane);
        if (lane > maxLane) maxLane = lane;
    });

    var gap = laneGap;
    if (minFiberFloor != null && maxLane > 0) {
        var available = baseApproachY - minFiberFloor;
        var needed = maxLane * laneGap;
        if (available > 4 && needed > available) {
            gap = Math.max(2.5, available / maxLane);
        }
    }

    laneByKey.forEach(function(lane, fiberKey) {
        result.set(fiberKey, baseApproachY - lane * gap);
    });
    return result;
}

/** Сколько вертикального запаса нужно под дорожки подхода верхних жил (для gap панели). */
function estimateTopCrossLinkLanePad(fiberPorts, fiberPositions, crossPorts, hostObj) {
    if (!fiberPorts || !fiberPositions || !crossPorts) return 0;
    var assignments = buildCrossPortAssignments(fiberPorts, crossPorts, hostObj);
    var n = 0;
    Object.keys(assignments).forEach(function(portKey) {
        (assignments[portKey] || []).forEach(function(assign) {
            var fp = fiberPositions.get(assign.fiberKey);
            if (fp && fp.isTop) n += 1;
        });
    });
    if (n <= 1) return 0;
    return Math.min(160, (n - 1) * FIBER_SCHEME_TOP_CROSS_LANE_GAP + 8);
}

/** Собирает entries для assignTopCrossLinkApproachYs из assignments + позиций. */
function collectTopCrossLinkApproachEntries(assignments, fiberPositions, getPortXY) {
    var entries = [];
    if (!assignments || !fiberPositions || typeof getPortXY !== 'function') return entries;
    Object.keys(assignments).forEach(function(portKey) {
        var portNum = parseInt(portKey, 10);
        var portXY = getPortXY(portNum);
        if (!portXY) return;
        (assignments[portKey] || []).forEach(function(assign) {
            var fp = fiberPositions.get(assign.fiberKey);
            if (!fp || !fp.isTop) return;
            var fx = fp.x;
            var fy = fp.y;
            if (typeof fiberSchemeFiberLinkAnchor === 'function') {
                var anch = fiberSchemeFiberLinkAnchor(fp, 22, 16, 4);
                if (anch) { fx = anch.x; fy = anch.y; }
            }
            entries.push({ fiberKey: assign.fiberKey, fx: fx, px: portXY.x, fy: fy, py: portXY.y });
        });
    });
    return entries;
}

/** Раскладка панели кросса с портами (по умолчанию под кабелями, позиция может быть сохранена). */
function layoutCrossSchemePanel(svgWidth, crossPorts, cablesBottomY, opts) {
    opts = opts || {};
    const gap = opts.gap != null ? opts.gap : 18;
    const headerH = 22;
    const portW = 14;
    const portH = 12;
    const portR = portH / 2;
    const portSpacing = 26;
    const rowGap = 14;
    const padX = 14;
    const padY = 8;
    const sidePad = opts.sidePad || 12;
    const autoPortsPerRow = Math.min(crossPorts, Math.max(4, Math.floor((svgWidth - padX * 2 - 48) / portSpacing)));
    var portsPerRow = autoPortsPerRow;
    var forcedRows = opts.rows != null ? parseInt(opts.rows, 10) : 0;
    var forcedPpr = opts.portsPerRow != null ? parseInt(opts.portsPerRow, 10) : 0;
    if (!isNaN(forcedRows) && forcedRows > 0) {
        portsPerRow = Math.max(1, Math.ceil(crossPorts / Math.min(forcedRows, crossPorts)));
    } else if (!isNaN(forcedPpr) && forcedPpr > 0) {
        portsPerRow = Math.min(crossPorts, Math.max(1, forcedPpr));
    }
    const numRows = Math.ceil(crossPorts / portsPerRow);
    const panelW = portsPerRow * portSpacing + padX * 2;
    const panelH = headerH + padY + numRows * (portH + rowGap) + padY;
    const defaultX = Math.max(sidePad, (svgWidth - panelW) / 2);
    const defaultTop = cablesBottomY + gap;
    var panelX = opts.panelX != null ? opts.panelX : defaultX;
    var panelTop = opts.panelTop != null ? opts.panelTop : defaultTop;
    if (typeof clampFiberSchemeCrossPanelPos === 'function') {
        // Allow placing above the default slot, but keep panel inside the SVG.
        var svgHHint = Math.max(cablesBottomY + gap + panelH + sidePad, opts.svgHeight || 0, panelTop + panelH + sidePad);
        var clamped = clampFiberSchemeCrossPanelPos(panelX, panelTop, panelW, panelH, svgWidth, svgHHint, sidePad);
        panelX = clamped.x;
        panelTop = clamped.y;
    }
    const portPositions = new Map();
    const portRowStartY = panelTop + headerH + padY + portH / 2;
    for (let p = 1; p <= crossPorts; p++) {
        const idx = p - 1;
        const col = idx % portsPerRow;
        const row = Math.floor(idx / portsPerRow);
        const x = panelX + padX + col * portSpacing + portSpacing / 2;
        const y = portRowStartY + row * (portH + rowGap);
        portPositions.set(p, { x: x, y: y, portR: portR, portW: portW, portH: portH });
    }
    return {
        panelX: panelX,
        panelTop: panelTop,
        panelW: panelW,
        panelH: panelH,
        defaultPanelX: defaultX,
        defaultPanelTop: defaultTop,
        portPositions: portPositions,
        contentBottom: Math.max(cablesBottomY, panelTop + panelH) + sidePad,
        portsPerRow: portsPerRow,
        numRows: numRows,
        portR: portR,
        crossName: opts.crossName || 'Кросс'
    };
}

function buildCrossPortAssignments(fiberPorts, crossPorts, hostObj) {
    const assignments = {};
    if (!fiberPorts) return assignments;
    Object.keys(fiberPorts).forEach(function(key) {
        const portNum = parseInt(fiberPorts[key], 10);
        if (isNaN(portNum) || portNum < 1 || portNum > crossPorts) return;
        const lastDash = key.lastIndexOf('-');
        if (lastDash < 0) return;
        const cableId = key.substring(0, lastDash);
        const fiberNumber = parseInt(key.substring(lastDash + 1), 10);
        if (hostObj && typeof isFiberSplicedAtHost === 'function' && isFiberSplicedAtHost(hostObj, cableId, fiberNumber)) return;
        if (!assignments[portNum]) assignments[portNum] = [];
        assignments[portNum].push({
            fiberKey: key,
            cableId: cableId,
            fiberNumber: fiberNumber
        });
    });
    return assignments;
}

/** Линия жилы к конкретному порту кросса: ортогонально к колонке порта, без размазывания по панели. */
function buildCrossFiberPortLinkPath(fx, fy, px, py, opts) {
    opts = opts || {};
    var dx = px - fx;
    var dy = py - fy;
    var adx = Math.abs(dx);
    var ady = Math.abs(dy);
    if (adx < 4 && ady < 4) {
        return 'M ' + fx + ' ' + fy + ' L ' + px + ' ' + py;
    }
    var dist = Math.sqrt(dx * dx + dy * dy);
    var r = fiberSchemeFilletRadius(adx, ady, dist);
    var k = FIBER_SCHEME_FILLET_K;
    var hx = dx >= 0 ? 1 : -1;
    var hy = dy >= 0 ? 1 : -1;
    var parts = ['M ' + fx + ' ' + fy];

    if (opts.isTop) {
        var approachY = opts.approachY != null ? opts.approachY : (py - Math.max(28, r * 2));
        approachY = Math.max(fy + r * 1.5, Math.min(py - r * 1.5, approachY));
        if (ady > r * 1.5) {
            parts.push('L ' + fx + ' ' + (approachY - r));
        }
        if (adx > r * 1.5) {
            if (ady > r * 1.5) {
                parts.push('C ' + fx + ' ' + (approachY - r + r * k) + ', ' +
                    (fx + hx * r * (1 - k)) + ' ' + approachY + ', ' + (fx + hx * r) + ' ' + approachY);
            }
            parts.push('L ' + (px - hx * r) + ' ' + approachY);
            parts.push('C ' + (px - hx * r + hx * r * k) + ' ' + approachY + ', ' +
                px + ' ' + (approachY + r * (1 - k)) + ', ' + px + ' ' + (approachY + r));
            if (Math.abs((approachY + r) - py) > 2) {
                parts.push('L ' + px + ' ' + py);
            }
        } else {
            if (ady > r * 1.5) {
                parts.push('L ' + px + ' ' + (py - r));
                parts.push('C ' + px + ' ' + (py - r + r * k) + ', ' + px + ' ' + (py - r + r * k) + ', ' + px + ' ' + py);
            } else {
                parts.push('L ' + px + ' ' + py);
            }
        }
    } else {
        var approachX = px - hx * r;
        if (adx > r * 1.5) {
            parts.push('L ' + approachX + ' ' + fy);
        }
        if (ady > r * 1.5) {
            if (adx > r * 1.5) {
                parts.push('C ' + (approachX + hx * r * k) + ' ' + fy + ', ' +
                    px + ' ' + (fy + hy * r * (1 - k)) + ', ' + px + ' ' + (fy + hy * r));
            }
            parts.push('L ' + px + ' ' + py);
        } else {
            parts.push('L ' + px + ' ' + py);
        }
    }
    return parts.join(' ');
}

function getCrossPanelTransformOffset(svgOrPanel) {
    var panel = svgOrPanel;
    if (panel && panel.querySelector) {
        panel = panel.classList && panel.classList.contains('fiber-scheme-cross-panel')
            ? panel
            : panel.querySelector('.fiber-scheme-cross-panel');
    }
    if (!panel) return { x: 0, y: 0 };
    var t = panel.getAttribute('transform') || '';
    var m = /translate\(\s*([-\d.]+)(?:[,\s]+|\s+)([-\d.]+)\s*\)/.exec(t);
    if (!m) return { x: 0, y: 0 };
    return { x: parseFloat(m[1]) || 0, y: parseFloat(m[2]) || 0 };
}

function getCrossPortAnchorFromSvg(svg, portNum) {
    if (!svg || portNum == null) return null;
    var g = svg.querySelector('.fiber-scheme-cross-port[data-cross-port="' + portNum + '"]');
    if (!g) return null;
    var node = g.querySelector('.fiber-scheme-cross-port-node');
    if (!node) return null;
    var off = getCrossPanelTransformOffset(svg);
    var px;
    var topY;
    if (node.tagName && node.tagName.toLowerCase() === 'rect') {
        var x = parseFloat(node.getAttribute('x'));
        var y = parseFloat(node.getAttribute('y'));
        var w = parseFloat(node.getAttribute('width'));
        if (isNaN(x) || isNaN(y) || isNaN(w)) return null;
        px = x + w / 2;
        topY = y;
    } else {
        px = parseFloat(node.getAttribute('cx'));
        var py = parseFloat(node.getAttribute('cy'));
        var r = parseFloat(node.getAttribute('r')) || 7;
        if (isNaN(px) || isNaN(py)) return null;
        topY = py - r;
    }
    return { x: px + off.x, y: topY + off.y };
}

function getFiberSchemeNodePointFromSvg(svg, fiberKey) {
    if (!svg || !fiberKey) return null;
    var nodes = svg.querySelectorAll('.fiber-port-node[data-fiber-key]');
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('data-fiber-key') === fiberKey) {
            var x = parseFloat(nodes[i].getAttribute('cx'));
            var y = parseFloat(nodes[i].getAttribute('cy'));
            if (isNaN(x) || isNaN(y)) return null;
            return { x: x, y: y };
        }
    }
    return null;
}

function updateSchemeCrossPanelBoundary(svg) {
    if (!svg) return;
    var root = svg.querySelector('.fiber-scheme-cross');
    var line = svg.querySelector('.fiber-scheme-cross-boundary');
    if (!root || !line) return;
    var off = getCrossPanelTransformOffset(svg);
    var baseX = parseFloat(root.getAttribute('data-panel-x')) || 0;
    var baseY = parseFloat(root.getAttribute('data-panel-top')) || 0;
    var panelW = parseFloat(root.getAttribute('data-panel-w')) || 0;
    var x = baseX + off.x;
    var y = baseY + off.y - 10;
    line.setAttribute('x1', String(x - 8));
    line.setAttribute('x2', String(x + panelW + 8));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
}

/** Пересчёт линий жила→порт и сплиттер→порт после сдвига панели кросса. */
function updateSchemeCrossPanelLinkPaths(svg, hostObj) {
    if (!svg) return;
    var root = svg.querySelector('.fiber-scheme-cross');
    if (!root) return;
    var off = getCrossPanelTransformOffset(svg);
    var baseX = parseFloat(root.getAttribute('data-panel-x')) || 0;
    var baseTop = parseFloat(root.getAttribute('data-panel-top')) || 0;
    var panelW = parseFloat(root.getAttribute('data-panel-w')) || 0;
    var baseApproachY = baseTop + off.y - 10;
    var crossCenterX = baseX + off.x + panelW / 2;

    var topApproachEntries = [];
    svg.querySelectorAll('.fiber-scheme-cross-link').forEach(function(pathEl) {
        var fiberKey = pathEl.getAttribute('data-fiber-key');
        var portNum = parseInt(pathEl.getAttribute('data-cross-port'), 10);
        if (!fiberKey || isNaN(portNum)) return;
        var fiberG = document.getElementById('fiber-' + fiberKey);
        if (!(fiberG && fiberG.getAttribute('data-is-top') === '1')) return;
        var fiberPt = getFiberSchemeNodePointFromSvg(svg, fiberKey);
        var portAnchor = getCrossPortAnchorFromSvg(svg, portNum);
        if (!fiberPt || !portAnchor) return;
        topApproachEntries.push({ fiberKey: fiberKey, fx: fiberPt.x, px: portAnchor.x, fy: fiberPt.y });
    });
    var topApproachMap = typeof assignTopCrossLinkApproachYs === 'function'
        ? assignTopCrossLinkApproachYs(topApproachEntries, baseApproachY)
        : new Map();

    svg.querySelectorAll('.fiber-scheme-cross-link').forEach(function(pathEl) {
        var fiberKey = pathEl.getAttribute('data-fiber-key');
        var portNum = parseInt(pathEl.getAttribute('data-cross-port'), 10);
        if (!fiberKey || isNaN(portNum)) return;
        var fiberPt = getFiberSchemeNodePointFromSvg(svg, fiberKey);
        var portAnchor = getCrossPortAnchorFromSvg(svg, portNum);
        if (!fiberPt || !portAnchor) return;
        var fiberG = document.getElementById('fiber-' + fiberKey);
        var isTop = !!(fiberG && fiberG.getAttribute('data-is-top') === '1');
        var isLeft = !!(fiberG && fiberG.getAttribute('data-is-left') === '1');
        var approachY = isTop
            ? (topApproachMap.has(fiberKey) ? topApproachMap.get(fiberKey) : baseApproachY)
            : undefined;
        var d = buildCrossFiberPortLinkPath(fiberPt.x, fiberPt.y, portAnchor.x, portAnchor.y, {
            isTop: isTop,
            isLeft: isLeft,
            approachY: approachY
        });
        pathEl.setAttribute('d', d);
        var group = pathEl.closest('.fiber-scheme-cross-link-group');
        var hit = group ? group.querySelector('.fiber-scheme-cross-link-hit') : pathEl.nextElementSibling;
        if (hit && hit.classList.contains('fiber-scheme-cross-link-hit')) hit.setAttribute('d', d);
        var label = fiberKey ? svg.querySelector('.fiber-scheme-cross-link-label[data-link-key="' + fiberKey.replace(/"/g, '') + '"]') : null;
        if (!label) {
            var labels = svg.querySelectorAll('.fiber-scheme-cross-link-label[data-link-key]');
            for (var li = 0; li < labels.length; li++) {
                if (labels[li].getAttribute('data-link-key') === fiberKey) { label = labels[li]; break; }
            }
        }
        if (label && typeof fiberSchemeCrossLinkLabelPoint === 'function') {
            var mid = fiberSchemeCrossLinkLabelPoint(fiberPt.x, fiberPt.y, portAnchor.x, portAnchor.y, {
                isTop: isTop,
                approachY: approachY
            });
            var bg = label.querySelector('.fiber-scheme-cross-link-label-bg');
            var txt = label.querySelector('.fiber-scheme-cross-link-label-text');
            var tw = bg ? parseFloat(bg.getAttribute('width')) || 40 : 40;
            if (bg) {
                bg.setAttribute('x', String(mid.x - tw / 2));
                bg.setAttribute('y', String(mid.y - 11));
            }
            if (txt) {
                txt.setAttribute('x', String(mid.x));
                txt.setAttribute('y', String(mid.y + 5));
            }
        }
        pathEl.setAttribute('data-label-x', String((fiberPt.x + portAnchor.x) / 2));
        pathEl.setAttribute('data-label-y', String((fiberPt.y + portAnchor.y) / 2));
    });

    if (hostObj && window.EmbeddedSplitters) {
        var list = EmbeddedSplitters.getList(hostObj) || [];
        list.forEach(function(rec) {
            if (!rec || !rec.id) return;
            var cx = rec.schemeX != null ? rec.schemeX : (parseFloat(svg.getAttribute('width')) || 800) / 2;
            var cy = rec.schemeY != null ? rec.schemeY : (parseFloat(svg.getAttribute('height')) || 400) * 0.42;
            var g = svg.querySelector('.fiber-scheme-splitter[data-splitter-id="' + rec.id + '"]');
            if (g) {
                var spOff = /translate\(\s*([-\d.]+)(?:[,\s]+|\s+)([-\d.]+)\s*\)/.exec(g.getAttribute('transform') || '');
                if (spOff) {
                    // splitter transform is top-left; schemeX/Y is center — prefer stored center
                }
            }
            updateSchemeSplitterCrossPortLinks(svg, rec.id, cx, cy, rec.splitRatio, hostObj);
        });
    }
    updateSchemeCrossPanelBoundary(svg);
}

function buildSplitterCrossPortLinksHtml(hostObj, crossLayout, isDark, isEditMode, svgWidth, svgHeight) {
    if (!hostObj || !crossLayout || !crossLayout.portPositions || !window.EmbeddedSplitters) return '';
    EmbeddedSplitters.syncAllInputs(hostObj);
    var list = EmbeddedSplitters.getList(hostObj);
    if (!list.length) return '';
    var hostUid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(hostObj) : null;
    var strokeColor = isDark ? 'rgba(251, 146, 60, 0.9)' : 'rgba(234, 88, 12, 0.9)';
    var svgW = svgWidth || 800;
    var svgH = svgHeight || 400;
    var crossCenterX = crossLayout.panelX + crossLayout.panelW / 2;
    var buf = '';
    list.forEach(function(rec) {
        if (!rec) return;
        var ratio = parseInt(rec.splitRatio, 10) || 8;
        var outs = rec.outputConnections || [];
        var x = rec.schemeX != null ? rec.schemeX : svgW / 2;
        var y = rec.schemeY != null ? rec.schemeY : svgH * 0.42;
        var isMirrored = EmbeddedSplitters.isSchemeMirrored(rec);
        var isFlipV = EmbeddedSplitters.isSchemeFlipVertical ? EmbeddedSplitters.isSchemeFlipVertical(rec) : false;
        var orient = EmbeddedSplitters.getSchemeOrientation ? EmbeddedSplitters.getSchemeOrientation(rec) : 'horizontal';
        var box = EmbeddedSplitters.computeSchemeSplitterBox(ratio, orient);
        for (var cpi = 0; cpi < ratio; cpi++) {
            var crossOut = outs[cpi];
            if (!crossOut || crossOut.crossPort == null) continue;
            if (crossOut.hostId && hostUid && crossOut.hostId !== hostUid) continue;
            var crossPortNum = parseInt(crossOut.crossPort, 10);
            var portPos = crossLayout.portPositions.get(crossPortNum);
            if (!portPos) continue;
            var srcPt = EmbeddedSplitters.schemeSplitterPortPos(x, y, box, 'output', cpi, ratio, isMirrored, isFlipV, orient);
            var portY = portPos.y - portPos.portR;
            var pathD = buildCrossFiberPortLinkPath(srcPt.x, srcPt.y, portPos.x, portY, {
                isLeft: srcPt.x < crossCenterX
            });
            var spTitle = 'Сплиттер «' + (rec.name || 'Сплиттер') + '» вых.' + (cpi + 1) + ' → порт ' + crossPortNum;
            var outLabel = typeof getSplitterOutputLabelFromRec === 'function'
                ? getSplitterOutputLabelFromRec(rec, cpi) : '';
            if (outLabel) spTitle += ' · ' + outLabel;
            var crossLinkKey = 'out-cross:' + rec.id + ':' + cpi;
            buf += '<g class="fiber-scheme-splitter-cross-link-group" data-splitter-id="' + escapeHtml(rec.id) + '" data-output-index="' + cpi + '" data-cross-port="' + crossPortNum + '" data-link-key="' + escapeHtml(crossLinkKey) + '">';
            buf += '<title>' + escapeHtml(spTitle) + '</title>';
            buf += '<path class="fiber-scheme-splitter-cross-link" data-link-key="' + escapeHtml(crossLinkKey) + '" data-link-kind="output-cross" data-splitter-id="' + escapeHtml(rec.id) + '" data-output-index="' + cpi + '" data-cross-port="' + crossPortNum + '" data-conn-label="' + escapeHtml(outLabel) + '" d="' + pathD + '" stroke="' + strokeColor + '" stroke-width="2.5" stroke-linecap="round" opacity="0.9" pointer-events="none"/>';
            buf += '<path class="fiber-scheme-splitter-cross-link-hit" data-link-key="' + escapeHtml(crossLinkKey) + '" data-link-kind="output-cross" data-splitter-id="' + escapeHtml(rec.id) + '" data-output-index="' + cpi + '" data-cross-port="' + crossPortNum + '" d="' + pathD + '" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="round" style="pointer-events:stroke;' + (isEditMode ? 'cursor:pointer' : 'cursor:default') + '"/>';
            if (outLabel && typeof fiberSchemePathMidpoint === 'function' && typeof escapeHtml === 'function') {
                var crossMid = fiberSchemePathMidpoint(pathD);
                var crossLabelColors = typeof getFiberSchemeLabelColors === 'function' ? getFiberSchemeLabelColors() : { bg: '#fff', border: '#cbd5e1', fill: '#0f172a' };
                var crossTw = Math.min(148, Math.max(40, outLabel.length * 6.5 + 16));
                var crossTx = crossMid.x - crossTw / 2;
                buf += '<g class="fiber-scheme-splitter-cross-link-label" data-link-key="' + escapeHtml(crossLinkKey) + '">';
                buf += '<rect class="fiber-scheme-splitter-cross-link-label-bg" x="' + crossTx + '" y="' + (crossMid.y - 11) + '" width="' + crossTw + '" height="21" rx="5" fill="' + crossLabelColors.bg + '" stroke="' + crossLabelColors.border + '" stroke-width="0.75"/>';
                buf += '<text class="fiber-scheme-splitter-cross-link-label-text" x="' + crossMid.x + '" y="' + (crossMid.y + 5) + '" text-anchor="middle" style="font-size:10px;font-weight:600;fill:' + crossLabelColors.fill + ';pointer-events:none;">' + escapeHtml(outLabel) + '</text>';
                buf += '</g>';
            }
            buf += '</g>';
        }
    });
    return buf;
}

function updateSchemeSplitterCrossPortLinks(svg, splitterId, cx, cy, splitRatio, hostObj) {
    if (!svg || !splitterId || !hostObj || !window.EmbeddedSplitters) return;
    var rec = EmbeddedSplitters.findInHost(hostObj, splitterId);
    if (!rec) return;
    var ratio = parseInt(splitRatio, 10) || parseInt(rec.splitRatio, 10) || 8;
    var mirrored = EmbeddedSplitters.isSchemeMirrored(rec);
    var isFlipV = EmbeddedSplitters.isSchemeFlipVertical ? EmbeddedSplitters.isSchemeFlipVertical(rec) : false;
    var orient = EmbeddedSplitters.getSchemeOrientation ? EmbeddedSplitters.getSchemeOrientation(rec) : 'horizontal';
    var box = EmbeddedSplitters.computeSchemeSplitterBox(ratio, orient);
    var crossBody = svg.querySelector('.fiber-scheme-cross-body');
    var off = typeof getCrossPanelTransformOffset === 'function' ? getCrossPanelTransformOffset(svg) : { x: 0, y: 0 };
    var crossCenterX = crossBody
        ? parseFloat(crossBody.getAttribute('x')) + off.x + parseFloat(crossBody.getAttribute('width')) / 2
        : cx;
    svg.querySelectorAll('.fiber-scheme-splitter-cross-link[data-splitter-id="' + splitterId + '"]').forEach(function(pathEl) {
        var oi = parseInt(pathEl.getAttribute('data-output-index'), 10);
        var portNum = parseInt(pathEl.getAttribute('data-cross-port'), 10);
        if (isNaN(oi) || isNaN(portNum)) return;
        var anchor = getCrossPortAnchorFromSvg(svg, portNum);
        if (!anchor) return;
        var srcPt = EmbeddedSplitters.schemeSplitterPortPos(cx, cy, box, 'output', oi, ratio, mirrored, isFlipV, orient);
        var d = buildCrossFiberPortLinkPath(srcPt.x, srcPt.y, anchor.x, anchor.y, {
            isLeft: srcPt.x < crossCenterX
        });
        pathEl.setAttribute('d', d);
        pathEl.setAttribute('data-conn-label', typeof getSplitterOutputLabelFromRec === 'function'
            ? getSplitterOutputLabelFromRec(rec, oi) : '');
        var hit = pathEl.nextElementSibling;
        if (hit && hit.classList.contains('fiber-scheme-splitter-cross-link-hit')) {
            hit.setAttribute('d', d);
        }
        if (typeof refreshSplitterCrossPortLinkLabelDom === 'function') {
            refreshSplitterCrossPortLinkLabelDom(splitterId, oi, typeof getSplitterOutputLabelFromRec === 'function'
                ? getSplitterOutputLabelFromRec(rec, oi) : '');
        }
    });
}

function buildCrossSchemePanelSvg(crossLayout, fiberPorts, fiberPositions, schemeBlocks, isDark, badgeH, isEditMode, hostObj, nodeR, badgeW, fiberLabels, svgWidth, svgHeight) {
    if (!crossLayout || !crossLayout.portPositions) return '';
    fiberLabels = fiberLabels || {};
    const crossPorts = crossLayout.portPositions.size;
    const assignments = buildCrossPortAssignments(fiberPorts, crossPorts, hostObj);
    const bodyFill = isDark ? '#1e1b4b' : '#faf5ff';
    const bodyStroke = isDark ? 'rgba(139, 92, 246, 0.55)' : 'rgba(109, 40, 217, 0.35)';
    const portIdle = isDark ? '#4c1d95' : '#ddd6fe';
    const portIdleStroke = isDark ? '#6d28d9' : '#a78bfa';
    const portActiveStroke = isDark ? '#a78bfa' : '#6d28d9';
    const portSplitterFill = isDark ? '#9a3412' : '#fed7aa';
    const portSplitterStroke = isDark ? '#fb923c' : '#ea580c';
    const portTextIdle = isDark ? '#c4b5fd' : '#7c3aed';
    const linkStroke = isDark ? 'rgba(167, 139, 250, 0.55)' : 'rgba(109, 40, 217, 0.4)';
    const connLabelBg = isDark ? 'rgba(30, 27, 75, 0.92)' : 'rgba(255, 255, 255, 0.94)';
    const connLabelFill = isDark ? '#e9d5ff' : '#4c1d95';
    const svgBorderColor = isDark ? 'rgba(167, 139, 250, 0.35)' : 'rgba(109, 40, 217, 0.25)';
    const title = escapeHtml(crossLayout.crossName || 'Кросс');
    const crossLinkApproachY = crossLayout.panelTop - 10;
    const topApproachEntries = typeof collectTopCrossLinkApproachEntries === 'function'
        ? collectTopCrossLinkApproachEntries(assignments, fiberPositions, function(portNum) {
            var pp = crossLayout.portPositions.get(portNum);
            if (!pp) return null;
            return { x: pp.x, y: pp.y - pp.portR };
        })
        : [];
    const topApproachMap = typeof assignTopCrossLinkApproachYs === 'function'
        ? assignTopCrossLinkApproachYs(topApproachEntries, crossLinkApproachY)
        : new Map();
    const shortTitle = title.length > 28 ? title.substring(0, 27) + '…' : title;
    let html = '<g class="fiber-scheme-cross" data-panel-x="' + crossLayout.panelX + '" data-panel-top="' + crossLayout.panelTop + '" data-panel-w="' + crossLayout.panelW + '" data-panel-h="' + crossLayout.panelH + '">';
    // Корпус → линии → порты: линии видны поверх панели и доходят до портов.
    html += '<g class="fiber-scheme-cross-panel" transform="translate(0,0)">';
    html += '<rect class="fiber-scheme-cross-body" x="' + crossLayout.panelX + '" y="' + crossLayout.panelTop + '" width="' + crossLayout.panelW + '" height="' + crossLayout.panelH + '" rx="10" fill="' + bodyFill + '" stroke="' + bodyStroke + '" stroke-width="1.5"/>';
    html += '<rect class="fiber-scheme-cross-header" x="' + crossLayout.panelX + '" y="' + crossLayout.panelTop + '" width="' + crossLayout.panelW + '" height="22" rx="10" fill="url(#crossHeaderGrad)"/>';
    html += '<rect x="' + crossLayout.panelX + '" y="' + (crossLayout.panelTop + 16) + '" width="' + crossLayout.panelW + '" height="6" fill="url(#crossHeaderGrad)"/>';
    html += '<text class="fiber-scheme-cross-title" x="' + (crossLayout.panelX + crossLayout.panelW / 2) + '" y="' + (crossLayout.panelTop + 15) + '" text-anchor="middle" style="font-size:10px;font-weight:600;fill:#fff;pointer-events:none;">' + shortTitle + '</text>';
    html += '</g>';
    html += '<g class="fiber-scheme-cross-links" fill="none">';
    Object.keys(assignments).forEach(function(portKey) {
        const portNum = parseInt(portKey, 10);
        const assignList = assignments[portNum] || [];
        const portPos = crossLayout.portPositions.get(portNum);
        if (!portPos || !assignList.length) return;
        assignList.forEach(function(assign) {
            const fiberPos = fiberPositions.get(assign.fiberKey);
            if (!fiberPos) return;
            const fiber = lookupSchemeFiber(schemeBlocks, assign.cableId, assign.fiberNumber);
            const bh = badgeH || 16;
            const dotR = nodeR || 4;
            const bw = badgeW || 22;
            const fiberAnchor = fiberSchemeFiberLinkAnchor(fiberPos, bw, bh, dotR);
            const portAnchorY = portPos.y - portPos.portR;
            const approachY = fiberPos.isTop
                ? (topApproachMap.has(assign.fiberKey) ? topApproachMap.get(assign.fiberKey) : crossLinkApproachY)
                : undefined;
            const pathD = buildCrossFiberPortLinkPath(fiberAnchor.x, fiberAnchor.y, portPos.x, portAnchorY, {
                isTop: !!fiberPos.isTop,
                isLeft: fiberPos.isLeft,
                approachY: approachY
            });
            const labelPt = typeof fiberSchemeCrossLinkLabelPoint === 'function'
                ? fiberSchemeCrossLinkLabelPoint(fiberAnchor.x, fiberAnchor.y, portPos.x, portAnchorY, {
                    isTop: !!fiberPos.isTop,
                    approachY: approachY
                })
                : fiberSchemePathMidpoint(pathD);
            const strokeColor = fiber && fiber.color ? fiberSchemeLinkStrokeColor(fiber.color, isDark) : linkStroke;
            const directLabel = (fiberLabels[assign.fiberKey] || '').trim();
            const linkTitle = 'Ж.' + assign.fiberNumber + (directLabel ? ': ' + directLabel : '') + ' → порт ' + portNum + (isEditMode ? ' · клик — подпись / снять с порта' : '');
            html += '<g class="fiber-scheme-cross-link-group" data-link-key="' + escapeHtml(assign.fiberKey) + '" data-cross-port="' + portNum + '">';
            html += '<title>' + escapeHtml(linkTitle) + '</title>';
            html += '<path class="fiber-scheme-cross-link" data-link-key="' + escapeHtml(assign.fiberKey) + '" data-fiber-key="' + escapeHtml(assign.fiberKey) + '" data-cable-id="' + escapeHtml(assign.cableId) + '" data-fiber-number="' + assign.fiberNumber + '" data-cross-port="' + portNum + '" data-conn-label="' + escapeHtml(directLabel) + '" data-label-x="' + labelPt.x + '" data-label-y="' + labelPt.y + '" d="' + pathD + '" stroke="' + strokeColor + '" stroke-width="2.5" stroke-linecap="round" opacity="0.85" pointer-events="none"/>';
            html += '<path class="fiber-scheme-cross-link-hit" data-link-key="' + escapeHtml(assign.fiberKey) + '" data-fiber-key="' + escapeHtml(assign.fiberKey) + '" data-cable-id="' + escapeHtml(assign.cableId) + '" data-fiber-number="' + assign.fiberNumber + '" data-cross-port="' + portNum + '" d="' + pathD + '" fill="none" stroke="transparent" stroke-width="14" stroke-linecap="round" style="pointer-events:stroke;' + (isEditMode ? 'cursor:pointer' : 'cursor:default') + '"/>';
            html += '</g>';
        });
    });
    html += '</g>';
    const splitterCrossLinks = buildSplitterCrossPortLinksHtml(hostObj, crossLayout, isDark, isEditMode, svgWidth, svgHeight);
    if (splitterCrossLinks) {
        html += '<g class="fiber-scheme-cross-splitter-links" fill="none">' + splitterCrossLinks + '</g>';
    }
    html += '<g class="fiber-scheme-cross-link-labels">';
    Object.keys(assignments).forEach(function(portKey) {
        const portNum = parseInt(portKey, 10);
        const assignList = assignments[portNum] || [];
        const portPos = crossLayout.portPositions.get(portNum);
        if (!portPos || !assignList.length) return;
        assignList.forEach(function(assign) {
            const fiberPos = fiberPositions.get(assign.fiberKey);
            if (!fiberPos) return;
            const directLabel = (fiberLabels[assign.fiberKey] || '').trim();
            if (!directLabel) return;
            const fiberAnchorLbl = fiberSchemeFiberLinkAnchor(fiberPos, badgeW || 22, badgeH || 16, nodeR || 4);
            const portAnchorY = portPos.y - portPos.portR;
            const approachYLbl = fiberPos.isTop
                ? (topApproachMap.has(assign.fiberKey) ? topApproachMap.get(assign.fiberKey) : crossLinkApproachY)
                : undefined;
            const pathD = buildCrossFiberPortLinkPath(fiberAnchorLbl.x, fiberAnchorLbl.y, portPos.x, portAnchorY, {
                isTop: !!fiberPos.isTop,
                isLeft: fiberPos.isLeft,
                approachY: approachYLbl
            });
            const mid = typeof fiberSchemeCrossLinkLabelPoint === 'function'
                ? fiberSchemeCrossLinkLabelPoint(fiberAnchorLbl.x, fiberAnchorLbl.y, portPos.x, portAnchorY, {
                    isTop: !!fiberPos.isTop,
                    approachY: approachYLbl
                })
                : fiberSchemePathMidpoint(pathD);
            const tw = Math.min(148, Math.max(40, directLabel.length * 6.5 + 16));
            const tx = mid.x - tw / 2;
            html += '<g class="fiber-scheme-cross-link-label" data-link-key="' + escapeHtml(assign.fiberKey) + '">';
            html += '<rect class="fiber-scheme-cross-link-label-bg" x="' + tx + '" y="' + (mid.y - 11) + '" width="' + tw + '" height="21" rx="5" fill="' + connLabelBg + '" stroke="' + svgBorderColor + '" stroke-width="0.75"/>';
            html += '<text class="fiber-scheme-cross-link-label-text" x="' + mid.x + '" y="' + (mid.y + 5) + '" text-anchor="middle" style="font-size:10px;font-weight:600;fill:' + connLabelFill + ';pointer-events:none;">' + escapeHtml(directLabel) + '</text>';
            html += '</g>';
        });
    });
    html += '</g>';
    html += '<g class="fiber-scheme-cross-ports-layer" transform="translate(0,0)">';
    html += '<g class="fiber-scheme-cross-ports">';
    crossLayout.portPositions.forEach(function(portPos, portNum) {
        const assignList = assignments[portNum] || [];
        const isAssigned = assignList.length > 0;
        const spOnPort = !isAssigned && typeof findSplitterOutputOnCrossPort === 'function' && hostObj
            ? findSplitterOutputOnCrossPort(hostObj, portNum) : null;
        const hasSplitterOut = !!spOnPort;
        const isPatched = typeof isCrossPortPatched === 'function' && hostObj && isCrossPortPatched(hostObj, portNum);
        const patchInfo = isPatched && typeof getCrossPortPatch === 'function' ? getCrossPortPatch(hostObj, portNum) : null;
        const primaryAssign = assignList[0] || null;
        const fiber = primaryAssign ? lookupSchemeFiber(schemeBlocks, primaryAssign.cableId, primaryAssign.fiberNumber) : null;
        const fill = isAssigned && fiber && fiber.color ? fiber.color : (hasSplitterOut ? portSplitterFill : (isPatched ? (isDark ? '#7c2d12' : '#fed7aa') : portIdle));
        const stroke = isAssigned ? portActiveStroke : (hasSplitterOut ? portSplitterStroke : (isPatched ? (isDark ? '#fb923c' : '#ea580c') : portIdleStroke));
        const textFill = isAssigned ? ((fiber && (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB')) ? '#000' : '#fff') : (hasSplitterOut ? (isDark ? '#fff7ed' : '#9a3412') : (isPatched ? (isDark ? '#fff7ed' : '#9a3412') : portTextIdle));
        let tooltip = 'Порт ' + portNum;
        if (hasSplitterOut) {
            tooltip += ' · выход «' + spOnPort.splitterName + '» вых.' + (spOnPort.outputIndex + 1);
            if (isEditMode) {
                tooltip += ' · кроссировка — в таблице';
            }
        } else if (isPatched && patchInfo) {
            var mateCross = typeof resolveCrossPortPatchHost === 'function' ? resolveCrossPortPatchHost(patchInfo.crossId) : null;
            var mateName = mateCross ? (mateCross.properties.get('name') || 'Кросс') : 'кросс';
            tooltip += ' · кроссировка → «' + mateName + '» п.' + patchInfo.port;
            if (isAssigned && isEditMode) {
                tooltip += ' · клик — снять жилу с порта';
            } else if (isEditMode) {
                tooltip += ' · клик — отключить кроссировку';
            }
        } else if (isAssigned && fiber) {
            tooltip += ' · ж.' + primaryAssign.fiberNumber + (fiber.name ? ' (' + fiber.name + ')' : '');
            if (isEditMode) tooltip += ' · клик — освободить';
        } else if (isEditMode) {
            tooltip += ' · свободен · клик — выбрать жилу';
        } else {
            tooltip += ' · свободен';
        }
        html += '<g class="fiber-scheme-cross-port' + (isAssigned ? ' fiber-scheme-cross-port--assigned' : '') + (hasSplitterOut ? ' fiber-scheme-cross-port--splitter-out' : '') + (isPatched ? ' fiber-scheme-cross-port--patched' : '') + '" data-cross-port="' + portNum + '">';
        html += '<title>' + escapeHtml(tooltip) + '</title>';
        var pw = portPos.portW != null ? portPos.portW : (portPos.portR * 2);
        var ph = portPos.portH != null ? portPos.portH : (portPos.portR * 2);
        var rx = Math.min(2.5, Math.max(1.5, Math.min(pw, ph) * 0.2));
        html += '<rect class="fiber-scheme-cross-port-node" x="' + (portPos.x - pw / 2) + '" y="' + (portPos.y - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="' + rx + '" ry="' + rx + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isAssigned ? 2 : 1.5) + '"' + (isEditMode ? '' : ' pointer-events="none"') + '/>';
        html += '<text class="fiber-scheme-cross-port-num" x="' + portPos.x + '" y="' + (portPos.y + 3) + '" text-anchor="middle" style="font-size:7px;font-weight:700;fill:' + textFill + ';pointer-events:none;">' + portNum + '</text>';
        if (isEditMode) {
            html += '<rect class="fiber-scheme-cross-port-hit" data-cross-port="' + portNum + '" x="' + (portPos.x - 14) + '" y="' + (portPos.y - 14) + '" width="28" height="28" rx="4" fill="transparent" style="cursor:pointer;pointer-events:all"/>';
        }
        html += '</g>';
    });
    html += '</g></g></g>';
    return html;
}

/** Раскладка по образцу: слева/справа столбцы кабелей, сверху — в ширину; жилы веером к центру. */
function truncateFiberSchemeCableText(text, maxChars) {
    if (!text) return '';
    var t = String(text).trim();
    if (t.length <= maxChars) return t;
    return t.slice(0, Math.max(1, maxChars - 1)) + '…';
}

function layoutFiberSchemeReference(hostObj, cablesData, svgWidth, opts, sidePartition, isEditMode) {
    const rowHeight = opts.rowHeight;
    const sideFiberGap = opts.sideFiberGap != null ? opts.sideFiberGap : 9;
    const sideFiberPitch = rowHeight + sideFiberGap;
    const topFiberGap = opts.topFiberGap != null ? opts.topFiberGap : 8;
    const sidePad = opts.sidePad;
    const panelW = opts.panelW;
    const fiberFanLen = opts.fiberFanLen;
    const blockGap = opts.blockGap;
    const labelH = opts.labelH;
    const fiberPositions = new Map();
    const blocks = [];
    const leftCables = sidePartition ? sidePartition.left : cablesData.slice(0, Math.ceil(cablesData.length / 2));
    const rightCables = sidePartition ? sidePartition.right : cablesData.slice(leftCables.length);
    const topCables = sidePartition && sidePartition.top ? sidePartition.top : [];
    const badgeH = 16;
    const badgeW = 22;
    const topActionH = isEditMode ? 20 : 0;
    const topTitleH = 14;
    const topStemLen = 30;
    const topDescH = 12;
    const topZoneH = topCables.length
        ? topActionH + topTitleH + topStemLen + badgeH + topDescH + blockGap + sidePad + 6
        : 0;
    const sideStartY = sidePad + topZoneH;

    function addTopSide(cables) {
        if (!cables.length) return 0;
        const zoneW = svgWidth - sidePad * 2;
        const topGap = 8;
        const sideInset = 8;
        let maxBottom = sidePad;
        var widths = cables.map(function(cableData) {
            var n = Math.max(cableData.fibers.length, 1);
            var pitch = badgeW + topFiberGap;
            return Math.max(120, n * pitch + 20);
        });
        var totalW = widths.reduce(function(sum, w) { return sum + w; }, 0) + Math.max(0, cables.length - 1) * topGap;
        var startX = sidePad + sideInset;
        if (totalW < zoneW - sideInset * 2) {
            startX = sidePad + (zoneW - totalW) / 2;
        }

        cables.forEach(function(cableData, ci) {
            const prevW = widths.slice(0, ci).reduce(function(sum, w) { return sum + w; }, 0);
            const slotLeft = startX + prevW + ci * topGap;
            const slotRight = slotLeft + widths[ci];
            const n = Math.max(cableData.fibers.length, 1);
            const slotInnerW = Math.max(120, (slotRight - slotLeft) - sideInset * 2);
            const desiredW = Math.max(120, Math.min(slotInnerW, widths[ci]));
            const barX1 = (slotLeft + slotRight - desiredW) / 2;
            const barX2 = barX1 + desiredW;
            const colWidth = desiredW / n;
            const blockTop = sidePad;
            const actionsY = blockTop;
            const labelY = blockTop + topActionH + 10;
            const cableBarY = blockTop + topActionH + topTitleH + 2;
            const portY = cableBarY + topStemLen;
            const descY = portY + badgeH + 8;
            const labelX = (barX1 + barX2) / 2;
            const blockH = topActionH + topTitleH + topStemLen + badgeH + topDescH + blockGap;
            const block = {
                cableData, side: 'top', isTop: true, isLeft: false,
                fanOriginX: labelX, fanOriginY: cableBarY, portX: 0, labelX: labelX, labelY: labelY,
                actionsY: actionsY, descY: descY,
                barX1: barX1, barX2: barX2, cableBarY: cableBarY,
                fiberZoneTop: cableBarY, blockTop: blockTop, blockH: blockH
            };
            blocks.push(block);
            var mirrored = typeof isCableSchemeMirrored === 'function' && isCableSchemeMirrored(hostObj, cableData.cableUniqueId);
            cableData.fibers.forEach(function(fiber, fi) {
                var posIdx = mirrored ? (n - 1 - fi) : fi;
                const fx = barX1 + posIdx * colWidth + colWidth / 2;
                const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
                fiberPositions.set(fiberKey, {
                    x: fx, y: portY, cableData: cableData, fiber: fiber, side: 'top',
                    fanOriginX: fx, fanOriginY: cableBarY, portX: fx, isTop: true, isLeft: false, block: block
                });
            });
            maxBottom = Math.max(maxBottom, blockTop + blockH);
        });
        return maxBottom;
    }

    function addSide(cables, side) {
        let y = sideStartY;
        const isLeft = side === 'left';
        const barSpan = panelW - 12;
        const barInset = 4;
        const barX1 = isLeft ? (sidePad + barInset) : (svgWidth - sidePad - barInset - barSpan);
        const barX2 = barX1 + barSpan;
        const fanOriginX = isLeft ? barX2 : barX1;
        const portX = isLeft ? fanOriginX + fiberFanLen : fanOriginX - fiberFanLen;
        const actionBtnW = 18;
        const actionGap = 2;
        const actionsW = (FIBER_SCHEME_CABLE_SIDES.length + 1) * actionBtnW + FIBER_SCHEME_CABLE_SIDES.length * actionGap;
        /** Место над полосой: название выше кнопок, подпись у кнопок. */
        const labelBand = isEditMode ? 36 : 22;

        cables.forEach(function(cableData) {
            const n = Math.max(cableData.fibers.length, 1);
            const fibersH = n * sideFiberPitch;
            const half = fibersH / 2;
            const blockTop = y;
            const fiberZoneTop = blockTop + Math.max(0, labelBand - half);
            const cableBarY = fiberZoneTop + half;
            const blockH = (cableBarY + half - blockTop) + blockGap;
            const actionsY = cableBarY - 22;
            const actionsX = isLeft ? (barX2 - actionsW) : barX1;
            // Название — выше кнопок на всю ширину полосы; подпись — у кнопок над полосой.
            const labelX = (barX1 + barX2) / 2;
            const labelAnchor = 'middle';
            const labelY = cableBarY - 34;
            var descLabelX;
            var descLabelAnchor;
            if (isEditMode) {
                descLabelX = isLeft ? (barX1 + 6) : (barX2 - 6);
                descLabelAnchor = isLeft ? 'start' : 'end';
            } else {
                descLabelX = labelX;
                descLabelAnchor = 'middle';
            }
            const descLabelY = cableBarY - 5;
            const block = {
                cableData, side, fanOriginX, portX, labelX, barX1, barX2, cableBarY,
                labelY: labelY, descLabelY: descLabelY, labelAnchor: labelAnchor,
                descLabelX: descLabelX, descLabelAnchor: descLabelAnchor,
                actionsX: actionsX, actionsY: actionsY, actionsW: actionsW,
                fiberZoneTop, blockTop, blockH, isLeft, isTop: false
            };
            blocks.push(block);
            var mirrored = typeof isCableSchemeMirrored === 'function' && isCableSchemeMirrored(hostObj, cableData.cableUniqueId);
            cableData.fibers.forEach(function(fiber, fi) {
                var posIdx = mirrored ? (n - 1 - fi) : fi;
                const fy = fiberZoneTop + posIdx * sideFiberPitch + sideFiberPitch / 2;
                const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
                fiberPositions.set(fiberKey, {
                    x: portX, y: fy, cableData: cableData, fiber: fiber, side: side,
                    fanOriginX: fanOriginX, portX: portX, isLeft: isLeft, isTop: false, block: block
                });
            });
            y += blockH;
        });
        return y;
    }

    const topBottom = addTopSide(topCables);
    const leftBottom = addSide(leftCables, 'left');
    const rightBottom = addSide(rightCables, 'right');
    const minH = opts.minSvgHeight || 120;
    const svgHeight = Math.max(topBottom, leftBottom, rightBottom, minH) + sidePad;
    return { fiberPositions: fiberPositions, blocks: blocks, svgHeight: svgHeight, topZoneH: topZoneH };
}

function resolveFiberExportCableName(cableId, hostObj) {
    if (typeof resolveCableDisplayNameById === 'function') {
        return resolveCableDisplayNameById(cableId, { hostObj: hostObj });
    }
    if (!cableId) return 'Кабель';
    var found = objects.find(function(o) {
        return o && o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
    });
    if (!found) return 'Кабель';
    return found.properties.get('cableName') || getCableDescription(found.properties.get('cableType'), found);
}

function buildFiberSchemePdfFilename(hostObj) {
    var name = hostObj && hostObj.properties ? String(hostObj.properties.get('name') || 'obekt').trim() : 'obekt';
    var safe = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '-').replace(/\.+$/g, '').slice(0, 80);
    if (!safe) safe = 'obekt';
    return 'shema-zhil-' + safe + '.pdf';
}

function removeSchemeLabelsFromSvgClone(clone) {
    var labelSelectors = [
        '.fiber-scheme-link-labels',
        '.fiber-scheme-conn-label',
        '.fiber-scheme-fiber-labels',
        '.fiber-scheme-fiber-label',
        '.fiber-scheme-cross-link-labels',
        '.fiber-scheme-cross-link-label',
        '.fiber-scheme-splitter-conn-label',
        '.fiber-scheme-splitter-cross-link-label',
        '.fiber-scheme-splitter-link-labels'
    ].join(', ');
    clone.querySelectorAll(labelSelectors).forEach(function(el) {
        el.remove();
    });
}

function resetFiberSchemeSvgHoverState(svg) {
    if (!svg) return;
    svg.classList.remove('fiber-scheme-hover-active');
    var hoverClasses = [
        'fiber-scheme-hovered', 'fiber-scheme-dimmed', 'fiber-scheme-link-hovered', 'fiber-scheme-link-dimmed',
        'fiber-scheme-splitter-link-hovered', 'fiber-scheme-splitter-link-dimmed',
        'fiber-scheme-splitter-cross-link-hovered', 'fiber-scheme-splitter-cross-link-dimmed',
        'fiber-cable-block-hovered', 'fiber-scheme-cross-link-hovered', 'fiber-scheme-cross-link-dimmed',
        'fiber-scheme-cross-port-hovered', 'fiber-scheme-link-selected', 'fiber-scheme-splitter-link-selected',
        'fiber-scheme-cross-link-selected', 'fiber-scheme-splitter-cross-link-selected'
    ];
    hoverClasses.forEach(function(cls) {
        svg.querySelectorAll('.' + cls).forEach(function(el) {
            el.classList.remove(cls);
        });
    });
}

function ensureFiberSchemePathExportAttrs(pathEl, fallbackStroke, fallbackWidth) {
    if (!pathEl || pathEl.tagName !== 'path') return;
    var stroke = pathEl.getAttribute('stroke');
    if (!stroke || stroke === 'transparent' || stroke === 'none') {
        if (!fallbackStroke) return;
        pathEl.setAttribute('stroke', fallbackStroke);
    }
    if (!pathEl.getAttribute('stroke-width') && fallbackWidth) {
        pathEl.setAttribute('stroke-width', String(fallbackWidth));
    }
    if (!pathEl.getAttribute('stroke-linecap')) {
        pathEl.setAttribute('stroke-linecap', 'round');
    }
    pathEl.setAttribute('fill', 'none');
    pathEl.removeAttribute('style');
    pathEl.setAttribute('opacity', pathEl.classList.contains('fiber-scheme-link-shadow') ? '0.35' : '1');
}

function promoteFiberSchemeConnectionsForExport(clone) {
    var topLayer = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
    topLayer.setAttribute('class', 'fiber-scheme-export-connections-top');
    topLayer.setAttribute('fill', 'none');
    topLayer.setAttribute('pointer-events', 'none');

    function moveAll(selector) {
        var nodes = clone.querySelectorAll(selector);
        for (var i = 0; i < nodes.length; i++) {
            topLayer.appendChild(nodes[i]);
        }
    }

    moveAll('.fiber-scheme-link-group');
    moveAll('.fiber-scheme-cross-link-group');
    moveAll('.fiber-scheme-splitter-links');
    moveAll('.fiber-scheme-cross-splitter-links');

    if (topLayer.childNodes.length) {
        clone.appendChild(topLayer);
    }
    ensureFiberSchemePortNumsOnTop(clone);
}

function prepareFiberSchemeSvgCloneForExport(clone) {
    removeSchemeLabelsFromSvgClone(clone);
    [
        '.fiber-scheme-link-hits',
        '.fiber-scheme-link-hit',
        '.fiber-scheme-cross-link-hit',
        '.fiber-scheme-splitter-link-hit',
        '.fiber-cable-side-flip-hit',
        '.fiber-cable-side-flip-icon',
        '.fiber-cable-side-btn-hit',
        '.fiber-cable-side-btn-icon',
        '.fiber-cable-mirror-hit',
        '.fiber-cable-mirror-icon',
        '.fiber-scheme-splitter-edit-hit',
        '.fiber-scheme-splitter-delete-hit',
        '.fiber-scheme-splitter-orient-hit',
        '.fiber-scheme-splitter-mirror-hit',
        '.fiber-scheme-splitter-flipv-hit',
        '.fiber-scheme-cross-port-hit'
    ].forEach(function(sel) {
        clone.querySelectorAll(sel).forEach(function(el) { el.remove(); });
    });

    resetFiberSchemeSvgHoverState(clone);

    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var defaultLinkStroke = isDark ? '#fbbf24' : '#d97706';
    var defaultCrossStroke = isDark ? 'rgba(167, 139, 250, 0.85)' : 'rgba(109, 40, 217, 0.75)';
    var defaultSplitterStroke = isDark ? '#4ade80' : '#16a34a';

    clone.querySelectorAll('.fiber-scheme-link, .fiber-scheme-link-stripe-a, .fiber-scheme-link-stripe-b').forEach(function(el) {
        if (el.classList.contains('fiber-scheme-cross-link')) return;
        ensureFiberSchemePathExportAttrs(el, el.getAttribute('stroke') || defaultLinkStroke, 4.5);
    });
    clone.querySelectorAll('.fiber-scheme-link-shadow').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)', 7);
    });
    clone.querySelectorAll('.fiber-scheme-link-outline').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, '#000000', 5.5);
    });
    clone.querySelectorAll('.fiber-scheme-cross-link').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, el.getAttribute('stroke') || defaultCrossStroke, 2.5);
    });
    clone.querySelectorAll('.fiber-scheme-splitter-link').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, el.getAttribute('stroke') || defaultSplitterStroke, 4.5);
    });
    clone.querySelectorAll('.fiber-scheme-splitter-cross-link').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, el.getAttribute('stroke') || defaultCrossStroke, 2.5);
    });
    clone.querySelectorAll('.fiber-scheme-splitter-link-shadow').forEach(function(el) {
        ensureFiberSchemePathExportAttrs(el, isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.2)', 6);
    });

    promoteFiberSchemeConnectionsForExport(clone);

    var defs = clone.querySelector('defs');
    if (!defs) {
        defs = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'defs');
        clone.insertBefore(defs, clone.firstChild);
    }
    var exportStyle = clone.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
    exportStyle.setAttribute('type', 'text/css');
    exportStyle.textContent = [
        '.fiber-scheme-export-connections-top, .fiber-scheme-link-group, .fiber-scheme-cross-link-group { opacity: 1 !important; }',
        '.fiber-scheme-link, .fiber-scheme-link-stripe-a, .fiber-scheme-link-stripe-b,',
        '.fiber-scheme-cross-link, .fiber-scheme-splitter-link, .fiber-scheme-splitter-cross-link {',
        'opacity: 1; visibility: visible; fill: none; }'
    ].join(' ');
    defs.appendChild(exportStyle);
}

function parseFiberConnKey(key) {
    if (!key || typeof key !== 'string') return null;
    var lastDash = key.lastIndexOf('-');
    if (lastDash < 0) return null;
    var fiberNumber = parseInt(key.substring(lastDash + 1), 10);
    if (isNaN(fiberNumber)) return null;
    return {
        cableId: key.substring(0, lastDash),
        fiberNumber: fiberNumber,
        fiberKey: key
    };
}

function formatFiberSchemeExportCableFiber(cableId, fiberNumber, hostObj) {
    return resolveFiberExportCableName(cableId, hostObj) + ', ж.' + fiberNumber;
}

function resolveFiberSchemeExportObjectName(uid, type, fallback) {
    if (!uid || typeof objects === 'undefined' || !objects) return fallback || String(uid);
    var found = objects.find(function(o) {
        return o && o.properties && o.properties.get('type') === type && getObjectUniqueId(o) === uid;
    });
    if (!found || !found.properties) return fallback || String(uid);
    return found.properties.get('name') || fallback || type;
}

function collectFiberSchemeExportSplices(hostObj) {
    if (!hostObj || !hostObj.properties) return [];
    var fiberConnections = hostObj.properties.get('fiberConnections') || [];
    var fiberLabels = hostObj.properties.get('fiberLabels') || {};
    var lines = [];
    fiberConnections.forEach(function(conn) {
        if (!conn || !conn.from || !conn.to) return;
        var fromName = resolveFiberExportCableName(conn.from.cableId, hostObj);
        var toName = resolveFiberExportCableName(conn.to.cableId, hostObj);
        var label = typeof resolveFiberConnectionLabel === 'function'
            ? resolveFiberConnectionLabel(conn, fiberLabels)
            : '';
        var line = fromName + ', ж.' + conn.from.fiberNumber +
            ' ↔ ' + toName + ', ж.' + conn.to.fiberNumber;
        if (label) line += ' — ' + label;
        lines.push(line);
    });
    return lines;
}

function formatFiberNumberRanges(numbers) {
    if (!numbers || !numbers.length) return '';
    var sorted = numbers.slice().sort(function(a, b) { return a - b; });
    var parts = [];
    var rangeStart = sorted[0];
    var rangeEnd = sorted[0];
    for (var i = 1; i < sorted.length; i++) {
        if (sorted[i] === rangeEnd + 1) {
            rangeEnd = sorted[i];
        } else {
            parts.push(rangeStart === rangeEnd ? String(rangeStart) : (rangeStart + '\u2013' + rangeEnd));
            rangeStart = rangeEnd = sorted[i];
        }
    }
    parts.push(rangeStart === rangeEnd ? String(rangeStart) : (rangeStart + '\u2013' + rangeEnd));
    return parts.join(', ');
}

function isFiberFreeForSchemeExport(hostObj, cableId, fiberNumber, cableData, ctx) {
    var occ = computeFiberOccupancy(
        cableId, fiberNumber, cableData,
        ctx.fiberConnections, ctx.nodeConnections, ctx.oltConnections, ctx.onuConnections,
        ctx.mediaConverterConnections, ctx.splitterConnections, hostObj
    );
    if (occ.isOccupied) return false;
    if (ctx.isCross) {
        var fiberKey = cableId + '-' + fiberNumber;
        var portVal = ctx.fiberPorts[fiberKey];
        if (portVal != null && portVal !== '') {
            if (!(typeof isFiberSplicedAtHost === 'function' && isFiberSplicedAtHost(hostObj, cableId, fiberNumber))) {
                return false;
            }
        }
    }
    return true;
}

function collectFiberSchemeExportFreeFibers(hostObj) {
    if (!hostObj || !hostObj.properties) return { lines: [], totalFree: 0 };
    var cables = typeof getConnectedCables === 'function' ? getConnectedCables(hostObj) : [];
    if (!cables.length) return { lines: [], totalFree: 0 };

    var hostType = hostObj.properties.get('type');
    var isCross = typeof isCrossLikeHostType === 'function' && isCrossLikeHostType(hostType);
    var ctx = {
        isCross: isCross,
        fiberConnections: hostObj.properties.get('fiberConnections') || [],
        fiberPorts: hostObj.properties.get('fiberPorts') || {},
        nodeConnections: hostObj.properties.get('nodeConnections') || {},
        oltConnections: hostObj.properties.get('oltConnections') || {},
        onuConnections: hostObj.properties.get('onuConnections') || {},
        mediaConverterConnections: hostObj.properties.get('mediaConverterConnections') || {},
        splitterConnections: hostObj.properties.get('splitterConnections') || {}
    };
    var entries = [];
    var totalFree = 0;

    cables.forEach(function(cable) {
        if (!cable || !cable.properties) return;
        var cableId = cable.properties.get('uniqueId');
        if (!cableId) return;
        var cableName = resolveFiberExportCableName(cableId, hostObj);
        var otherEnd = typeof getOtherEndOfCable === 'function' ? getOtherEndOfCable(cable, hostObj) : null;
        var cableData = {
            cableUniqueId: cableId,
            usedFibers: getUsedFibers(hostObj, cableId),
            isFromOlt: !!(otherEnd && otherEnd.properties && otherEnd.properties.get('type') === 'olt')
        };
        var freeNums = [];
        getFiberColors(cable).forEach(function(fiber) {
            if (isFiberFreeForSchemeExport(hostObj, cableId, fiber.number, cableData, ctx)) {
                freeNums.push(fiber.number);
            }
        });
        if (!freeNums.length) return;
        totalFree += freeNums.length;
        entries.push({
            sortName: cableName,
            text: '\u00ab' + cableName + '\u00bb: ж. ' + formatFiberNumberRanges(freeNums) +
                ' (' + freeNums.length + ' ' + (freeNums.length === 1 ? 'свободна' : 'свободны') + ')'
        });
    });

    entries.sort(function(a, b) {
        return a.sortName.localeCompare(b.sortName, 'ru');
    });
    return {
        lines: entries.map(function(entry) { return entry.text; }),
        totalFree: totalFree
    };
}

function collectFiberSchemeExportConnectionKeys(hostObj, isCross) {
    var keys = {};
    function noteKey(key) {
        if (key) keys[key] = true;
    }
    ['nodeConnections', 'oltConnections', 'onuConnections', 'mediaConverterConnections',
        'radioBridgeConnections', 'splitterConnections'].forEach(function(prop) {
        var map = hostObj.properties.get(prop) || {};
        Object.keys(map).forEach(noteKey);
    });
    if (isCross) {
        var fiberPorts = hostObj.properties.get('fiberPorts') || {};
        Object.keys(fiberPorts).forEach(noteKey);
    }
    if (typeof getConnectedCables === 'function' && typeof findSplitterOutputAtHost === 'function') {
        getConnectedCables(hostObj).forEach(function(cable) {
            if (!cable || !cable.properties) return;
            var cableId = cable.properties.get('uniqueId');
            if (!cableId) return;
            getFiberColors(cable).forEach(function(fiber) {
                if (findSplitterOutputAtHost(hostObj, cableId, fiber.number)) {
                    noteKey(cableId + '-' + fiber.number);
                }
            });
        });
    }
    return Object.keys(keys);
}

function buildFiberSchemeExportConnectionLine(hostObj, cableId, fiberNumber, ctx) {
    var fiberKey = cableId + '-' + fiberNumber;
    var chain = [];
    var portNum = null;

    if (ctx.isCross) {
        var portVal = ctx.fiberPorts[fiberKey];
        if (portVal != null && portVal !== '') {
            portNum = parseInt(portVal, 10);
            if (isNaN(portNum)) portNum = null;
            else if (typeof isFiberSplicedAtHost === 'function' &&
                isFiberSplicedAtHost(hostObj, cableId, fiberNumber)) {
                portNum = null;
            }
        }
    }

    if (typeof findSplitterOutputAtHost === 'function') {
        var spOut = findSplitterOutputAtHost(hostObj, cableId, fiberNumber);
        if (spOut) {
            var spName = 'Сплиттер';
            if (spOut.splitterObj && spOut.splitterObj.properties) {
                spName = spOut.splitterObj.properties.get('name') || spName;
            } else if (spOut.splitterName) {
                spName = spOut.splitterName;
            }
            chain.push('вых.' + (spOut.outputIndex + 1) + ' сплиттера «' + spName + '»');
        }
    }

    if (portNum != null) {
        chain.push('порт ' + portNum);
        if (typeof getCrossPortPatch === 'function') {
            var patch = getCrossPortPatch(hostObj, portNum);
            if (patch) {
                var mate = typeof resolveCrossPortPatchHost === 'function'
                    ? resolveCrossPortPatchHost(patch.crossId) : null;
                var mateName = mate ? (mate.properties.get('name') || 'Кросс') : 'Кросс';
                chain.push('кроссировка с «' + mateName + '» п.' + patch.port);
            }
        }
    }

    if (typeof getHostAssignment === 'function') {
        var nodeConn = getHostAssignment(hostObj, 'nodeConnections', cableId, fiberNumber);
        if (nodeConn && nodeConn.nodeId) {
            var nodeName = nodeConn.nodeName || resolveFiberSchemeExportObjectName(nodeConn.nodeId, 'node', 'Узел');
            var nodePart = 'узел «' + nodeName + '»';
            if (nodeConn.switchPort != null) nodePart += ', порт свитча ' + nodeConn.switchPort;
            chain.push(nodePart);
        } else {
            var oltConn = getHostAssignment(hostObj, 'oltConnections', cableId, fiberNumber);
            if (oltConn && oltConn.oltId) {
                var oltName = oltConn.oltName || resolveFiberSchemeExportObjectName(oltConn.oltId, 'olt', 'OLT');
                if (oltConn.incoming) {
                    chain.push('приход OLT «' + oltName + '»');
                } else if (oltConn.physicalCableOnly) {
                    chain.push('OLT «' + oltName + '»');
                } else {
                    var oltObj = objects && objects.find(function(o) {
                        return o && o.properties && o.properties.get('type') === 'olt' &&
                            getObjectUniqueId(o) === oltConn.oltId;
                    });
                    var portLbl = oltObj && typeof getOltPortLabel === 'function'
                        ? getOltPortLabel(oltObj, oltConn.portNumber) : '';
                    var portText = typeof formatOltPortDisplay === 'function'
                        ? formatOltPortDisplay(oltConn.portNumber || '?', portLbl, true)
                        : ('порт ' + (oltConn.portNumber || '?'));
                    chain.push('OLT «' + oltName + '», ' + portText);
                }
            } else {
                var onuConn = getHostAssignment(hostObj, 'onuConnections', cableId, fiberNumber);
                if (onuConn && onuConn.onuId) {
                    var onuName = onuConn.onuName || resolveFiberSchemeExportObjectName(onuConn.onuId, 'onu', 'ONU');
                    chain.push('ONU «' + onuName + '»');
                } else {
                    var mcConn = getHostAssignment(hostObj, 'mediaConverterConnections', cableId, fiberNumber);
                    if (mcConn && mcConn.mediaConverterId) {
                        var mcName = mcConn.mediaConverterName ||
                            resolveFiberSchemeExportObjectName(mcConn.mediaConverterId, 'mediaConverter', 'Медиаконвертер');
                        chain.push('МК «' + mcName + '»');
                    } else {
                        var rbConn = getHostAssignment(hostObj, 'radioBridgeConnections', cableId, fiberNumber);
                        if (rbConn && rbConn.radioBridgeId) {
                            var rbName = rbConn.radioBridgeName ||
                                resolveFiberSchemeExportObjectName(rbConn.radioBridgeId, 'radioBridge', 'Радиомост');
                            chain.push('РМ «' + rbName + '»');
                        } else {
                            var spConn = getHostAssignment(hostObj, 'splitterConnections', cableId, fiberNumber);
                            if (spConn && spConn.splitterId) {
                                var spInName = spConn.splitterName || 'Сплиттер';
                                chain.push('сплиттер «' + spInName + '» (вход)');
                            }
                        }
                    }
                }
            }
        }
    }

    if (!chain.length) return null;
    var line = formatFiberSchemeExportCableFiber(cableId, fiberNumber, hostObj) + ' → ' + chain.join(' → ');
    var directLabel = (ctx.fiberLabels[fiberKey] || '').trim();
    if (directLabel) line += ' — ' + directLabel;
    return line;
}

function collectFiberSchemeExportConnections(hostObj) {
    if (!hostObj || !hostObj.properties) return [];
    var lines = [];
    var hostType = hostObj.properties.get('type');
    var isCross = typeof isCrossLikeHostType === 'function' && isCrossLikeHostType(hostType);
    var ctx = {
        isCross: isCross,
        fiberPorts: hostObj.properties.get('fiberPorts') || {},
        fiberLabels: hostObj.properties.get('fiberLabels') || {}
    };

    function pushLine(text) {
        if (text) lines.push(text);
    }

    var fiberKeys = collectFiberSchemeExportConnectionKeys(hostObj, isCross);
    var entries = [];
    fiberKeys.forEach(function(key) {
        var parsed = parseFiberConnKey(key);
        if (!parsed) return;
        var line = buildFiberSchemeExportConnectionLine(hostObj, parsed.cableId, parsed.fiberNumber, ctx);
        if (!line) return;
        entries.push({
            sortCable: resolveFiberExportCableName(parsed.cableId, hostObj),
            sortFiber: parsed.fiberNumber,
            text: line
        });
    });
    entries.sort(function(a, b) {
        var byCable = a.sortCable.localeCompare(b.sortCable, 'ru');
        if (byCable !== 0) return byCable;
        return a.sortFiber - b.sortFiber;
    });
    entries.forEach(function(entry) { pushLine(entry.text); });

    if (isCross) {
        var crossPortPatches = hostObj.properties.get('crossPortPatches') || {};
        var patchedPorts = {};
        Object.keys(ctx.fiberPorts).forEach(function(key) {
            var portVal = parseInt(ctx.fiberPorts[key], 10);
            if (!isNaN(portVal)) patchedPorts[portVal] = true;
        });
        Object.keys(crossPortPatches).sort(function(a, b) {
            return parseInt(a, 10) - parseInt(b, 10);
        }).forEach(function(portKey) {
            var patch = crossPortPatches[portKey];
            if (!patch || patch.crossId == null || patch.port == null) return;
            var portNum = parseInt(portKey, 10);
            if (patchedPorts[portNum]) return;
            var mate = typeof resolveCrossPortPatchHost === 'function' ? resolveCrossPortPatchHost(patch.crossId) : null;
            var mateName = mate ? (mate.properties.get('name') || 'Кросс') : 'Кросс';
            pushLine('Порт ' + portKey + ' ⇄ «' + mateName + '» п.' + patch.port);
        });
    }

    if (window.EmbeddedSplitters) {
        EmbeddedSplitters.getList(hostObj).forEach(function(rec) {
            var spName = rec.name || 'Сплиттер';
            (rec.outputConnections || []).forEach(function(out, outputIndex) {
                if (!out) return;
                var outNo = outputIndex + 1;
                var prefix = 'Сплиттер «' + spName + '» вых.' + outNo + ' → ';
                if (out.cableId != null && out.fiberNumber != null) {
                    pushLine(prefix + formatFiberSchemeExportCableFiber(out.cableId, out.fiberNumber, hostObj));
                } else if (out.onuId) {
                    pushLine(prefix + 'ONU «' + resolveFiberSchemeExportObjectName(out.onuId, 'onu', 'ONU') + '»');
                } else if (out.mediaConverterId) {
                    pushLine(prefix + 'МК «' + resolveFiberSchemeExportObjectName(out.mediaConverterId, 'mediaConverter', 'Медиаконвертер') + '»');
                } else if (out.splitterId) {
                    var targetSp = EmbeddedSplitters.findInHost(hostObj, out.splitterId);
                    var targetName = targetSp ? (targetSp.name || 'Сплиттер') : 'Сплиттер';
                    pushLine(prefix + 'сплиттер «' + targetName + '» (вход)');
                } else if (out.crossPort != null) {
                    pushLine(prefix + 'порт ' + out.crossPort);
                } else if (out.hostId && out.cableId != null && out.fiberNumber != null) {
                    var remoteHost = typeof getFiberHostByUid === 'function' ? getFiberHostByUid(out.hostId) : null;
                    var remoteName = remoteHost ? (remoteHost.properties.get('name') || 'Объект') : 'Объект';
                    pushLine(prefix + '«' + remoteName + '» / ' + formatFiberSchemeExportCableFiber(out.cableId, out.fiberNumber, hostObj));
                }
            });
        });
    }

    return lines;
}

function svgElementToCanvas(svgEl, scale, opts) {
    opts = opts || {};
    scale = scale || 1;
    var svgW = parseFloat(svgEl.getAttribute('width')) || svgEl.clientWidth || 800;
    var svgH = parseFloat(svgEl.getAttribute('height')) || svgEl.clientHeight || 600;
    resetFiberSchemeSvgHoverState(svgEl);
    var clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(svgW));
    clone.setAttribute('height', String(svgH));
    if (opts.hideSchemeLabels !== false) {
        prepareFiberSchemeSvgCloneForExport(clone);
    }
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var bg = isDark ? '#1e293b' : '#ffffff';
    var bgRect = clone.querySelector('.fiber-scheme-bg');
    if (bgRect) bgRect.setAttribute('fill', bg);
    var svgData = new XMLSerializer().serializeToString(clone);
    var sources = [
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData)
    ];
    var svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    var blobUrl = URL.createObjectURL(svgBlob);
    sources.push(blobUrl);
    return new Promise(function(resolve, reject) {
        function renderFromSource(index) {
            if (index >= sources.length) {
                URL.revokeObjectURL(blobUrl);
                reject(new Error('svg-render-failed'));
                return;
            }
            var img = new Image();
            img.onload = function() {
                var canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(svgW * scale));
                canvas.height = Math.max(1, Math.round(svgH * scale));
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(blobUrl);
                resolve(canvas);
            };
            img.onerror = function() {
                renderFromSource(index + 1);
            };
            img.src = sources[index];
        }
        renderFromSource(0);
    });
}

async function exportFiberSchemeToPdf(hostObj) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        if (typeof showError === 'function') showError('PDF-библиотеки не загружены. Обновите страницу и попробуйте снова.', 'Экспорт');
        return false;
    }
    if (!hostObj || !hostObj.properties) {
        if (typeof showError === 'function') showError('Объект недоступен для экспорта.', 'Экспорт');
        return false;
    }
    var svg = document.getElementById('fiber-connections-svg');
    if (!svg) {
        if (typeof showError === 'function') showError('Схема сварки жил не найдена. Откройте кросс или муфту.', 'Экспорт');
        return false;
    }

    var exportBtn = document.getElementById('fiber-scheme-export-pdf');
    var exportBtnHtml = exportBtn ? exportBtn.innerHTML : '';
    if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Формирование…';
    }

    try {
        var hostType = hostObj.properties.get('type');
        var isCross = typeof isCrossLikeHostType === 'function' && isCrossLikeHostType(hostType);
        var typeLabel = isCross ? 'Оптический кросс' : (hostType === 'spliceCassette' ? 'Сплайс-кассета' : 'Кабельная муфта');
        var hostName = hostObj.properties.get('name') || (isCross ? 'Кросс' : 'Муфта');
        var exportSplices = collectFiberSchemeExportSplices(hostObj);
        var exportConnections = collectFiberSchemeExportConnections(hostObj);
        var exportFreeFibers = collectFiberSchemeExportFreeFibers(hostObj);
        var cables = typeof getConnectedCables === 'function' ? getConnectedCables(hostObj) : [];
        var scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1.5));
        var schemeCanvas = await svgElementToCanvas(svg, scale, { hideSchemeLabels: true });
        var svgW = parseFloat(svg.getAttribute('width')) || schemeCanvas.width / scale;
        var svgH = parseFloat(svg.getAttribute('height')) || schemeCanvas.height / scale;
        var orientation = svgW >= svgH ? 'l' : 'p';
        var doc = new window.jspdf.jsPDF({ orientation: orientation, unit: 'pt', format: 'a4' });
        var unicodeFontReady = typeof ensurePdfUnicodeFont === 'function' ? await ensurePdfUnicodeFont(doc) : false;
        if (!unicodeFontReady && typeof showWarning === 'function') {
            showWarning('Не удалось загрузить шрифт для кириллицы. Текст в PDF может отображаться некорректно.', 'Экспорт');
        }
        var pageW = doc.internal.pageSize.getWidth();
        var pageH = doc.internal.pageSize.getHeight();
        var margin = 28;
        var schemeMargin = 12;
        var y = margin;
        var schemeImgData = canvasToPngDataUrl(schemeCanvas);
        if (!schemeImgData) throw new Error('scheme-canvas-export-failed');
        var exportDate = new Date().toLocaleString();
        var statsLine = 'Кабелей: ' + cables.length + ' | Сращений: ' + exportSplices.length +
            ' | Подключений: ' + exportConnections.length +
            ' | Свободных жил: ' + exportFreeFibers.totalFree;
        function pdfText(value) {
            return unicodeFontReady ? String(value == null ? '' : value) : String(value == null ? '' : value);
        }
        function startTextPage() {
            doc.addPage();
            y = margin;
        }
        function ensureSpace(heightNeeded) {
            if (y + heightNeeded > pageH - margin) {
                doc.addPage();
                y = margin;
            }
        }
        function writeLine(text, size, gap) {
            doc.setFontSize(size || 9);
            ensureSpace((size || 9) + 4);
            doc.text(pdfText(text), margin, y);
            y += gap || 11;
        }
        function writeSectionTitle(text) {
            if (y > margin + 4) y += 4;
            writeLine(text, 10, 10);
        }
        function writeWrappedListItem(index, text, size, gap) {
            var lineSize = size || 8;
            var prefix = (index + 1) + '. ';
            var maxW = pageW - margin * 2;
            doc.setFontSize(lineSize);
            var lines = doc.splitTextToSize(pdfText(prefix + text), maxW);
            for (var li = 0; li < lines.length; li++) {
                ensureSpace(lineSize + 3);
                doc.text(lines[li], margin, y);
                y += gap || 10;
            }
        }

        // Страница 1: схема на весь лист + краткая подпись снизу
        var schemeFooterH = 14;
        doc.setFontSize(8);
        doc.text(pdfText(hostName + ' · ' + typeLabel), schemeMargin, schemeMargin + 7);
        var schemeTop = schemeMargin + 10;
        var availW = pageW - schemeMargin * 2;
        var availH = pageH - schemeTop - schemeMargin - schemeFooterH;
        var imgW = availW;
        var imgH = schemeCanvas.height * (imgW / schemeCanvas.width);
        if (imgH > availH) {
            imgH = availH;
            imgW = schemeCanvas.width * (imgH / schemeCanvas.height);
        }
        var imgX = schemeMargin + (availW - imgW) / 2;
        var imgY = schemeTop + (availH - imgH) / 2;
        doc.addImage(schemeImgData, 'PNG', imgX, imgY, imgW, imgH);
        doc.setFontSize(7);
        doc.text(pdfText(statsLine + ' · ' + exportDate), schemeMargin, pageH - schemeMargin);

        // Страница 2+ только если есть что перечислить; всё на одном потоке
        if (exportSplices.length || exportConnections.length || exportFreeFibers.lines.length) {
            startTextPage();
            writeLine(hostName + ' · ' + typeLabel, 9, 10);
            writeLine(statsLine + ' · ' + exportDate, 8, 12);

            if (exportFreeFibers.lines.length) {
                writeSectionTitle('Свободные жилы');
                exportFreeFibers.lines.forEach(function(line, index) {
                    writeWrappedListItem(index, line, 8, 10);
                });
            }

            if (exportSplices.length) {
                writeSectionTitle('Сращения');
                exportSplices.forEach(function(line, index) {
                    writeWrappedListItem(index, line, 8, 10);
                });
            }

            if (exportConnections.length) {
                writeSectionTitle('Подключения');
                exportConnections.forEach(function(line, index) {
                    writeWrappedListItem(index, line, 8, 10);
                });
            }
        }

        doc.save(buildFiberSchemePdfFilename(hostObj));
        if (typeof showSuccess === 'function') showSuccess('PDF со схемой сварки жил сформирован', 'Экспорт');
        if (typeof logAction === 'function' && typeof ActionTypes !== 'undefined' && ActionTypes.EXPORT_DATA) {
            logAction(ActionTypes.EXPORT_DATA, {
                format: 'fiber-scheme-pdf',
                hostType: hostType,
                hostName: hostName,
                splices: exportSplices.length,
                connections: exportConnections.length,
                freeFibers: exportFreeFibers.totalFree
            });
        }
        return true;
    } catch (eExport) {
        console.error('Fiber scheme PDF export failed:', eExport);
        if (typeof showError === 'function') showError('Не удалось сформировать PDF схемы сварки жил.', 'Экспорт');
        return false;
    } finally {
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.innerHTML = exportBtnHtml || '⤓ PDF';
        }
    }
}

function getFiberColors(arg) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getFiberColors(arg);
    return [];
}

function applyAllOpticalCableMapStyles() {
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'cable') return;
        disableCableMapBalloon(obj);
        if (window.FiberCableConfig) window.FiberCableConfig.applyOpticalMapStyle(obj);
        if (window.CableUnderground && CableUnderground.syncAerialOverlayStroke) {
            CableUnderground.syncAerialOverlayStroke(obj);
        }
    });
}
