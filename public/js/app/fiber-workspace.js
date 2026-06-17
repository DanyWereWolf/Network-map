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
            myMap.geoObjects.remove(label);
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
            myMap.geoObjects.add(label);
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
    const isConnected = (fiberConnections || []).some(function(conn) {
        return (conn.from.cableId === cableUniqueId && conn.from.fiberNumber === fiberNumber) ||
            (conn.to.cableId === cableUniqueId && conn.to.fiberNumber === fiberNumber);
    });
    const nodeConn = hostObj ? getHostAssignment(hostObj, 'nodeConnections', cableUniqueId, fiberNumber) : (nodeConnections && nodeConnections[fiberKey]);
    const realOltAssign = hostObj ? getFiberOltRealAssignment(hostObj, cableUniqueId, fiberNumber) : null;
    const oltConnDisplay = hostObj ? getFiberOltAssignment(hostObj, cableUniqueId, fiberNumber) : (oltConnections && oltConnections[fiberKey]);
    const onuConn = hostObj ? getHostAssignment(hostObj, 'onuConnections', cableUniqueId, fiberNumber) : (onuConnections && onuConnections[fiberKey]);
    const mcConn = hostObj ? getHostAssignment(hostObj, 'mediaConverterConnections', cableUniqueId, fiberNumber) : (mediaConverterConnections && mediaConverterConnections[fiberKey]);
    const spConn = hostObj ? getHostAssignment(hostObj, 'splitterConnections', cableUniqueId, fiberNumber) : (splitterConnections && splitterConnections[fiberKey]);
    const hasNodeConnection = !!nodeConn;
    const hasDirectOltConnection = !!realOltAssign;
    const hasOltConnection = !!oltConnDisplay;
    const hasOnuConnection = !!onuConn;
    const hasMcConnection = !!(mcConn && mcConn.mediaConverterId);
    const hasSplitterConnection = !!(spConn && spConn.splitterId);
    const splitterOutputAtHost = hostObj ? findSplitterOutputAtHost(hostObj, cableUniqueId, fiberNumber) : null;
    const hasSplitterOutputAtHost = !!splitterOutputAtHost;
    const oltBlocksSplice = hostObj ? isFiberOltSpliceBlocked(hostObj, cableUniqueId, fiberNumber) : !!(realOltAssign && realOltAssign.incoming);
    const hasAnyOutConnection = hasNodeConnection || hasDirectOltConnection || hasOnuConnection || hasMcConnection || hasSplitterConnection || hasSplitterOutputAtHost;
    const isGponFeeder = hasDirectOltConnection && (hasOnuConnection || hasSplitterConnection);
    const isGponUpstreamOnly = hasDirectOltConnection && !hasOnuConnection && !hasSplitterConnection && !hasNodeConnection && !hasMcConnection;
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
    var h = '<div class="fiber-ws-splitters-block"><h4 class="fiber-ws-subsection-title">Сплиттеры на схеме</h4>';
    h += '<ul class="fiber-ws-splitter-list">';
    list.forEach(function(rec) {
        var ratio = parseInt(rec.splitRatio, 10) || 8;
        var hasIn = !!(rec.inputCableId && rec.inputFiberNumber != null);
        var outs = (rec.outputConnections || []).filter(function(o) { return o && (o.cableId || o.onuId || o.splitterId || o.hostId); }).length;
        h += '<li class="fiber-ws-splitter-item">';
        h += '<button type="button" class="fiber-ws-splitter-locate" data-splitter-id="' + escapeHtml(rec.id) + '" title="Показать на схеме">';
        h += '<span class="fiber-ws-splitter-item-name">🔀 ' + escapeHtml(rec.name || 'Сплиттер') + '</span>';
        h += '<span class="fiber-ws-splitter-item-meta">1:' + ratio + (hasIn ? ' · вх. ж.' + rec.inputFiberNumber : ' · нет входа') + ' · ' + outs + '/' + ratio + ' вых.</span>';
        h += '</button>';
        if (isEditMode) {
            h += '<button type="button" class="fiber-ws-splitter-edit" data-splitter-id="' + escapeHtml(rec.id) + '" title="Изменить название и число выходов">✎</button>';
        }
        h += '</li>';
    });
    h += '</ul>';
    if (isEditMode) {
        h += '<button type="button" class="btn-secondary fiber-ws-splitter-reset" id="fiber-scheme-reset-splitters" title="Вернуть все сплиттеры в центр схемы">↺ Сбросить позиции</button>';
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
            ? EmbeddedSplitters.computeSchemeSplitterBox(rec.splitRatio)
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
    var h = '<div class="fiber-ws-scheme-size-block">';
    h += '<h4 class="fiber-ws-subsection-title">Размер схемы</h4>';
    h += '<p class="fiber-ws-scheme-size-current">Сейчас: <strong>' + curW + ' × ' + curH + '</strong> px</p>';
    if (layoutH && curH > layoutH) {
        h += '<p class="fiber-ws-scheme-size-hint">Ниже пунктира — доп. область для сплиттеров (' + (curH - layoutH) + ' px).</p>';
    }
    h += '<div class="fiber-ws-scheme-size-edit">';
    h += '<div class="fiber-ws-scheme-size-row"><label class="fiber-ws-label" for="fiber-scheme-canvas-width">Ширина, px</label>';
    h += '<input type="number" id="fiber-scheme-canvas-width" class="form-input" min="' + FIBER_SCHEME_CANVAS.WIDTH_MIN + '" max="' + FIBER_SCHEME_CANVAS.WIDTH_MAX + '" step="20" placeholder="Авто" value="' + (stored.width > 0 ? stored.width : '') + '"></div>';
    h += '<div class="fiber-ws-scheme-size-row"><label class="fiber-ws-label" for="fiber-scheme-canvas-height">Высота, px</label>';
    h += '<input type="number" id="fiber-scheme-canvas-height" class="form-input" min="' + FIBER_SCHEME_CANVAS.HEIGHT_MIN + '" max="' + FIBER_SCHEME_CANVAS.HEIGHT_MAX + '" step="20" placeholder="Авто" value="' + (stored.height > 0 ? stored.height : '') + '"></div>';
    h += '<div class="fiber-ws-scheme-size-presets">';
    FIBER_SCHEME_CANVAS_PRESETS.forEach(function(p) {
        h += '<button type="button" class="btn-secondary fiber-scheme-canvas-preset" data-canvas-w="' + p.width + '" data-canvas-h="' + p.height + '" title="' + p.width + '×' + p.height + '">' + p.label + '</button>';
    });
    h += '</div>';
    h += '<div class="fiber-ws-scheme-size-actions">';
    h += '<button type="button" class="btn-primary" id="fiber-scheme-canvas-apply">Применить</button>';
    h += '<button type="button" class="btn-secondary" id="fiber-scheme-canvas-auto">Авто</button>';
    h += '</div>';
    h += '<p class="fiber-ws-scheme-size-hint">Пустое поле — размер по кабелям. Значение не меньше области жил.</p>';
    h += '</div></div>';
    return h;
}

function buildFiberSchemeCableSidesHtml(sleeveObj, isEditMode, cablesData) {
    if (!isEditMode || !cablesData || cablesData.length < 1) return '';
    var h = '<div class="fiber-ws-cable-sides-block">';
    h += '<h4 class="fiber-ws-subsection-title">Стороны кабелей</h4>';
    h += '<p class="fiber-ws-scheme-size-hint">Расположение кабелей слева и справа на схеме. Кнопка ⇄ на схеме делает то же.</p>';
    h += '<ul class="fiber-ws-cable-side-list">';
    cablesData.forEach(function(cableData, index) {
        var title = cableData.cableName || ('Кабель ' + cableData.index);
        var side = resolveCableSchemeSide(sleeveObj, cableData.cableUniqueId, index, cablesData.length);
        var sideLabel = side === 'left' ? 'Слева' : 'Справа';
        h += '<li class="fiber-ws-cable-side-item">';
        h += '<span class="fiber-ws-cable-side-name" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</span>';
        h += '<span class="fiber-ws-cable-side-label">' + sideLabel + '</span>';
        h += '<button type="button" class="fiber-ws-cable-side-flip" data-cable-id="' + escapeHtml(cableData.cableUniqueId) + '" title="Перенести на ' + (side === 'left' ? 'правую' : 'левую') + ' сторону">⇄</button>';
        h += '</li>';
    });
    h += '</ul></div>';
    return h;
}

function buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode, schemeSize) {
    const name = sleeveObj.properties.get('name') || '';
    const typeBadgeClass = isCross ? 'fiber-ws-type-badge--cross' : 'fiber-ws-type-badge--sleeve';
    const typeLabel = isCross ? 'Оптический кросс' : 'Кабельная муфта';
    const objType = isCross ? 'cross' : 'sleeve';
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
    mainHtml += '<div class="fiber-ws-side-title">' + escapeHtml(name || (isCross ? 'Кросс' : 'Муфта')) + '</div>';
    mainHtml += '</div></div>';
    var coordsStatsHtml = buildObjectCoordsInlineHtml(sleeveObj, { compact: true });
    if (coordsStatsHtml) {
        mainHtml += coordsStatsHtml;
    }
    mainHtml += '</div>';

    if (isEditMode) {
        mainHtml += buildFiberWorkspaceActionsHtml();
        mainHtml += '<div class="fiber-ws-card fiber-ws-card--edit"><h4 class="fiber-ws-section-title">Редактирование</h4><div class="fiber-ws-side-edit">';
        if (isCross) {
            const storedCrossType = sleeveObj.properties.get('crossType');
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCrossName">Название</label>';
            mainHtml += '<input type="text" id="editCrossName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название кросса"></div>';
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editCrossType">Тип кросса</label>';
            mainHtml += '<select id="editCrossType" class="form-select">' + getCrossTypeSelectOptionsHtml(storedCrossType ? String(storedCrossType) : '') + '</select></div>';
        } else {
            const storedSleeveType = sleeveObj.properties.get('sleeveType');
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveName">Название</label>';
            mainHtml += '<input type="text" id="editSleeveName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название муфты"></div>';
            mainHtml += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveType">Тип муфты</label>';
            mainHtml += '<select id="editSleeveType" class="form-select">' + getSleeveTypeSelectOptionsHtml(storedSleeveType ? String(storedSleeveType) : '') + '</select></div>';
        }
        mainHtml += '</div></div>';
    }

    mainHtml += '<div class="fiber-ws-card fiber-ws-card--stats"><h4 class="fiber-ws-section-title">Сводка</h4><div class="fiber-ws-stats">';
    mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + cablesData.length + '</span><span class="fiber-ws-stat-lbl">кабелей</span></div>';
    mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + fiberConnections.length + '</span><span class="fiber-ws-stat-lbl">сращений</span></div>';
    if (window.EmbeddedSplitters) {
        var spCount = EmbeddedSplitters.getList(sleeveObj).length;
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + spCount + '</span><span class="fiber-ws-stat-lbl">сплиттеров</span></div>';
    }
    if (isCross) {
        const crossPorts = Math.max(1, parseInt(sleeveObj.properties.get('crossPorts'), 10) || 24);
        const usedPorts = getTotalUsedPortsInCross(sleeveObj);
        const pct = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedPorts + '/' + crossPorts + '</span><span class="fiber-ws-stat-lbl">портов (' + pct + '%)</span></div>';
    } else {
        const usedFibers = getTotalUsedFibersInSleeve(sleeveObj);
        mainHtml += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedFibers + '</span><span class="fiber-ws-stat-lbl">волокон</span></div>';
    }
    mainHtml += '</div></div>';

    var toolsHtml = buildFiberWorkspaceSidebarToolsHtml(sleeveObj, isEditMode, schemeSize, cablesData);
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
    h += '<p>4. <strong>Стороны кабелей</strong>: кнопка ⇄ у кабеля на схеме или в панели «Схема» — перенести кабель на другую сторону.</p>';
    h += '<p>5. <strong>Сплиттер</strong>: 🔀 на схеме → число выходов. <strong>Вход</strong>: клик по жиле → клик по сплиттеру (карточка или «вх»), либо наоборот — «вх» → жила.</p>';
    h += '<p>6. <strong>Выход</strong>: клик по точке выхода справа (или слева в зеркальном режиме) → клик по жиле на схеме или в таблице.</p>';
    h += '<p>7. <strong>Зеркало</strong>: кнопка ⇄ на карточке — отразить сплиттер (вход справа, выходы слева). Также в окне ✎.</p>';
    h += '<p>8. Сплиттеры только в <strong>центральной зоне</strong> схемы. Список слева → клик для прокрутки. «↺ Сбросить позиции» — вернуть в зону.</p>';
    h += '<p>9. <strong>Оранжевая линия</strong> сплиттера: клик → подпись или удаление (как у сращиваний). Также ✕ в колонке «Сплиттер».</p>';
    h += '<p>10. <strong>Изменить</strong> сплиттер: ✎ на карточке, двойной клик по карточке или ✎ в списке слева (название, число выходов, зеркало).</p>';
    h += '<p>11. Удаление сплиттера целиком — × на карточке на схеме.</p>';
    return h;
}

function buildFiberWorkspaceSidebarToolsHtml(sleeveObj, isEditMode, schemeSize, cablesData) {
    var schemeSizeHtml = buildFiberSchemeCanvasSizeHtml(sleeveObj, isEditMode, schemeSize);
    var cableSidesHtml = buildFiberSchemeCableSidesHtml(sleeveObj, isEditMode, cablesData);
    var splittersHtml = buildFiberSidebarSplittersHtml(sleeveObj, isEditMode);
    var h = '';
    if (schemeSizeHtml) h += schemeSizeHtml;
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
        '<button type="button" id="saveChangesBtn" class="btn-primary fiber-ws-action-btn fiber-ws-action-btn--save">' + saveSvg + '<span>Сохранить</span></button>' +
        '<button type="button" id="duplicateCurrentObject" class="btn-secondary fiber-ws-action-btn">' + dupSvg + '<span>Дублировать</span></button>' +
        '<button type="button" id="deleteCurrentObject" class="btn-danger fiber-ws-action-btn">' + delSvg + '<span>Удалить</span></button>' +
        '</div></div>';
}

function buildFiberWorkspaceLegendHtml() {
    var h = '<div class="fiber-ws-legend">';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-splice"></span> сращивание</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-splitter-link"></span> сплиттер → жила</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-connected"></span> сращена</div>';
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
    const isEditMode = typeof modalIsEditMode === 'function' ? modalIsEditMode() : !!window.isEditMode;

    var containerClass = 'fiber-connections-container fiber-workspace-root fiber-workspace-root--' + (isCross ? 'cross' : 'sleeve') + (isEditMode ? ' fiber-workspace-root--edit' : ' fiber-workspace-root--view');
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
    const schemeMaxW = 1400;
    const schemeLayoutBase = getFiberSchemeLayoutOpts(cablesData, maxFibers);
    const sidePad = schemeLayoutBase.sidePad;
    const panelW = schemeLayoutBase.panelW;
    const mainAvailW = estimateFiberSchemeMainWidth();
    const centerGapMin = Math.max(140, Math.min(260, Math.floor(mainAvailW * 0.2)));
    const rowHeight = schemeLayoutBase.rowHeight;
    const fiberFanLen = schemeLayoutBase.fiberFanLen;
    const blockGap = schemeLayoutBase.blockGap;
    const labelH = schemeLayoutBase.labelH;
    const nodeR = 4;
    const badgeW = 22;
    const badgeH = 16;
    const layoutMinWidth = sidePad * 2 + panelW * 2 + centerGapMin;
    const autoSvgWidth = Math.min(schemeMaxW, Math.max(layoutMinWidth, mainAvailW));
    const schemeLayoutOpts = {
        rowHeight: rowHeight, sidePad: sidePad, panelW: panelW, fiberFanLen: fiberFanLen,
        blockGap: blockGap, labelH: labelH, minSvgHeight: schemeLayoutBase.minSvgHeight
    };
    const schemeLayout = layoutFiberSchemeReference(cablesData, autoSvgWidth, schemeLayoutOpts, cableSidePartition);
    let layoutHeight = schemeLayout.svgHeight;
    let crossPanelLayout = null;
    if (isCross && crossPorts > 0) {
        crossPanelLayout = layoutCrossSchemePanel(autoSvgWidth, crossPorts, layoutHeight, {
            sidePad: sidePad,
            crossName: sleeveObj.properties.get('name') || 'Кросс'
        });
        layoutHeight = crossPanelLayout.contentBottom;
    }
    const canvasSize = resolveFiberSchemeCanvasSize(sleeveObj, autoSvgWidth, layoutHeight, layoutMinWidth);
    const svgWidth = canvasSize.width;
    const svgHeight = canvasSize.height;

    const canConnectFibers = cablesData.length >= 2;
    var sidebarClass = 'fiber-ws-sidebar' + (isEditMode ? '' : ' fiber-ws-sidebar--view-compact');
    html += '<div class="fiber-workspace fiber-workspace--' + (isCross ? 'cross' : 'sleeve') + (isEditMode ? ' fiber-workspace--edit' : ' fiber-workspace--view') + '"><aside class="' + sidebarClass + '">' + buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode, { svgWidth: svgWidth, svgHeight: svgHeight, layoutHeight: layoutHeight }) + '</aside><main class="fiber-ws-main"><div class="fiber-ws-toolbar"><nav class="fiber-ws-tabs"><button type="button" class="fiber-ws-tab active" data-tab="scheme">Схема</button><button type="button" class="fiber-ws-tab" data-tab="table">Таблица</button>';
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

    function fiberSchemeExitX(pos) {
        return pos.isLeft ? pos.x + badgeW / 2 : pos.x - badgeW / 2;
    }
    const linkColorDefault = isDark ? '#facc15' : '#ffcc00';
    const linkShadowDefault = isDark ? '#a16207' : '#ca8a04';
    const badgeStroke = isDark ? '#60a5fa' : '#2563eb';
    const badgeFill = isDark ? '#1e3a5f' : '#eff6ff';
    const anchorLeft = 'start';
    const anchorRight = 'end';

    const linkPaint = [];
    fiberConnections.forEach((connection, connIndex) => {
        const fromKey = `${connection.from.cableId}-${connection.from.fiberNumber}`;
        const toKey = `${connection.to.cableId}-${connection.to.fiberNumber}`;
        const fromPos = fiberPositions.get(fromKey);
        const toPos = fiberPositions.get(toKey);
        if (!fromPos || !toPos) return;
        const sameSide = fromPos.isLeft === toPos.isLeft;
        const pathD = buildFiberSchemeConnectionPath(
            fiberSchemeExitX(fromPos), fromPos.y,
            fiberSchemeExitX(toPos), toPos.y,
            nodeR + 2,
            { sameSide: sameSide, isLeft: fromPos.isLeft, svgWidth: svgWidth, obstacles: splitterObstacles }
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
            fromExitX: fiberSchemeExitX(fromPos), fromY: fromPos.y, toExitX: fiberSchemeExitX(toPos), toY: toPos.y,
            sameSide: sameSide, isLeft: fromPos.isLeft,
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
        const anchor = isLeft ? anchorLeft : anchorRight;
        const title = cableData.cableName || ('Кабель ' + cableData.index);
        const subLine = cableData.cableDescription + (cableData.isFromSleeve ? ' · ← вход' : ' · → выход');
        const labelAnchorX = block.labelX;

        html += `<g class="fiber-cable-block" data-cable-id="${cableData.cableUniqueId}" data-cable-side="${isLeft ? 'left' : 'right'}">`;
        html += `<text x="${labelAnchorX}" y="${block.blockTop + 12}" text-anchor="${anchor}" style="font-size: 9px; font-weight: 700; fill: ${svgTextColor};">${escapeHtml(title)}</text>`;
        html += `<text x="${labelAnchorX}" y="${block.blockTop + 22}" text-anchor="${anchor}" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(subLine)}</text>`;
        html += `<line x1="${block.barX1}" y1="${block.cableBarY}" x2="${block.barX2}" y2="${block.cableBarY}" stroke="${cableBarStroke}" stroke-width="5" stroke-linecap="round"/>`;
        html += `<text x="${labelAnchorX}" y="${block.cableBarY + 14}" text-anchor="${anchor}" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(cableData.isFromSleeve ? 'от муфты/кросса' : 'к муфте/кроссу')}</text>`;
        if (isEditMode) {
            var flipX = isLeft ? block.barX2 - 18 : block.barX1;
            var flipY = block.blockTop;
            var actionBg = isDark ? 'rgba(30,41,59,0.9)' : 'rgba(255,255,255,0.94)';
            var actionIcon = isDark ? '#94a3b8' : '#475569';
            var flipTitle = isLeft ? 'Перенести на правую сторону' : 'Перенести на левую сторону';
            html += `<rect class="fiber-cable-side-flip-hit" data-cable-id="${cableData.cableUniqueId}" x="${flipX}" y="${flipY}" width="18" height="18" rx="4" fill="${actionBg}"><title>${flipTitle}</title></rect>`;
            html += `<text class="fiber-cable-side-flip-icon" x="${flipX + 9}" y="${flipY + 13}" text-anchor="middle" style="font-size:10px;fill:${actionIcon};pointer-events:none;">⇄</text>`;
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
            html += `<path id="connection-${link.connIndex}" class="fiber-scheme-link" d="${link.pathD}" stroke="${stripeA}" stroke-width="4.5" stroke-linecap="round" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" data-from-exit-x="${link.fromExitX}" data-from-y="${link.fromY}" data-to-exit-x="${link.toExitX}" data-to-y="${link.toY}" data-same-side="${link.sameSide ? '1' : '0'}" data-from-left="${link.isLeft ? '1' : '0'}" data-conn-label="${escapeHtml(link.label || '')}" style="${clickable}">`;
        } else {
            html += `<path id="connection-${link.connIndex}" class="fiber-scheme-link fiber-scheme-link-stripe-a" d="${link.pathD}" stroke="${stripeA}" stroke-width="4.5" stroke-linecap="butt" stroke-dasharray="${spliceDash}" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" data-from-exit-x="${link.fromExitX}" data-from-y="${link.fromY}" data-to-exit-x="${link.toExitX}" data-to-y="${link.toY}" data-same-side="${link.sameSide ? '1' : '0'}" data-from-left="${link.isLeft ? '1' : '0'}" data-conn-label="${escapeHtml(link.label || '')}" style="${clickable}">`;
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
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        const isLeft = block.isLeft;
        cableData.fibers.forEach(function(fiber) {
            const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
            const pos = fiberPositions.get(fiberKey);
            if (!pos) return;
            const occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections, sleeveObj);
            const isUsed = occ.isUsed;
            const isConnected = occ.isConnected;
            const isOccupied = occ.isOccupied;
            const isGponFeeder = occ.isGponFeeder;
            const isGponUpstreamOnly = occ.isGponUpstreamOnly;
            var nodeAssScheme = getHostAssignment(sleeveObj, 'nodeConnections', cableData.cableUniqueId, fiber.number);
            var mcAssScheme = getHostAssignment(sleeveObj, 'mediaConverterConnections', cableData.cableUniqueId, fiber.number);
            var oltBlocksSpliceScheme = occ.oltBlocksSplice;
            var onuAssScheme = getHostAssignment(sleeveObj, 'onuConnections', cableData.cableUniqueId, fiber.number);
            var spAssScheme = getHostAssignment(sleeveObj, 'splitterConnections', cableData.cableUniqueId, fiber.number);
            const isSpliceSelectable = !isUsed && !isConnected && !nodeAssScheme && !(mcAssScheme && mcAssScheme.mediaConverterId) && !oltBlocksSpliceScheme && !onuAssScheme && !(spAssScheme && spAssScheme.splitterId);
            const clickable = isEditMode && isSpliceSelectable ? 'cursor: pointer;' : (!isSpliceSelectable && isOccupied ? 'cursor: not-allowed;' : '');
            const portClass = 'fiber-scheme-port' + (isGponFeeder ? ' fiber-scheme-port--gpon-feeder' : (oltBlocksSpliceScheme ? ' fiber-scheme-port--gpon-upstream' : (occ.isOltCableEnd ? ' fiber-scheme-port--olt-cable' : (isOccupied && !isSpliceSelectable ? ' fiber-scheme-port--occupied' : ''))));
            const badgeX = isLeft ? pos.x - badgeW / 2 : pos.x - badgeW / 2;
            const badgeY = pos.y - badgeH / 2;
            const circleX = isLeft ? badgeX - nodeR - 2 : badgeX + badgeW + nodeR + 2;
            let circleStroke = isConnected ? fiberSchemeLinkStrokeColor(fiber.color, isDark) : (isUsed ? '#dc2626' : '#333');
            if (fiber.hasBlackRing) circleStroke = '#000';
            const badgeStrokeOcc = isGponFeeder ? '#0284c7' : (isGponUpstreamOnly ? '#0ea5e9' : (isOccupied ? '#dc2626' : badgeStroke));

            const fiberLabelKey = cableData.cableUniqueId + '-' + fiber.number;
            const spliceConn = isConnected ? fiberConnections.find(function(c) {
                return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                    (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
            }) : null;
            const connLabelOnLine = spliceConn ? resolveFiberConnectionLabel(spliceConn, fiberLabels) : '';
            const directLabel = !isConnected ? (fiberLabels[fiberLabelKey] || '') : '';
            const statusText = isConnected ? ' (соед.)' : (isUsed ? ' (исп.)' : '');
            const labelText = connLabelOnLine ? ' ' + connLabelOnLine : (directLabel ? ' ' + directLabel : '');
            const portText = isCross && fiberPorts && fiberPorts[fiberLabelKey] && !isConnected ? ', порт ' + fiberPorts[fiberLabelKey] : '';
            const occHint = isGponFeeder ? ' (GPON feeder)' : (oltBlocksSpliceScheme ? ' (приход OLT)' : (occ.isOltCableEnd ? ' (кабель от OLT)' : (occ.hasDirectOltConnection ? ' (от OLT)' : (isOccupied ? ' (занята)' : ''))));
            const tooltipText = escapeHtml(fiber.name + labelText + statusText + portText + occHint);
            const textFill = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') ? '#000' : '#fff';

            const fanPath = buildFiberSchemeFanPath(pos.block, pos, isLeft, nodeR, badgeW);
            const fanColor = fiberSchemeLinkStrokeColor(fiber.color, isDark);

            const directLabelAttr = directLabel ? ' data-direct-label="' + escapeHtml(directLabel) + '"' : '';
            html += `<g id="fiber-${fiberKey}" class="${portClass}" data-fiber-key="${fiberKey}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}" data-fiber-occupied="${isOccupied}" data-fiber-selectable="${isSpliceSelectable}"${directLabelAttr} style="${clickable}">`;
            html += `<title>${tooltipText}</title>`;
            html += `<path class="fiber-fan-path" data-fiber-key="${fiberKey}" d="${fanPath}" stroke="${fanColor}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
            html += `<circle class="fiber-port-node" cx="${circleX}" cy="${pos.y}" r="${nodeR}" fill="${fiber.color}" stroke="${circleStroke}" stroke-width="1.5"/>`;
            html += `<rect class="fiber-port-badge" x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="2" fill="${badgeFill}" stroke="${badgeStrokeOcc}" stroke-width="${isOccupied ? 2.5 : 1.5}"/>`;
            html += `<text class="fiber-port-num" x="${pos.x}" y="${pos.y + 3}" text-anchor="middle" style="font-size: 8px; font-weight: 700; fill: ${badgeStroke}; pointer-events: none;">${fiber.number}</text>`;
            html += '</g>';
        });
    });
    html += '</g>';

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

    const connLabelBg = isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.92)';
    const connLabelFill = isDark ? '#f1f5f9' : '#1e293b';

    if (window.EmbeddedSplitters) {
        var wirePickSplitterId = (schemeSplitterWirePick && schemeSplitterWirePick.hostObj === sleeveObj &&
            schemeSplitterWirePick.splitterId) ? schemeSplitterWirePick.splitterId : null;
        var outputPick = (schemeSplitterOutputPick && schemeSplitterOutputPick.hostObj === sleeveObj) ? schemeSplitterOutputPick : null;
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
            pathMidpoint: fiberSchemePathMidpoint,
            nodeR: nodeR,
            badgeW: badgeW
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
        html += `<rect class="fiber-scheme-conn-label-bg" x="${tx}" y="${mid.y - 11}" width="${tw}" height="21" rx="5" fill="${connLabelBg}" stroke="${svgBorderColor}" stroke-width="0.75"/>`;
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
            const directLabel = (fiberLabels[cableData.cableUniqueId + '-' + fiber.number] || '').trim();
            if (!directLabel) return;
            const tw = Math.min(120, Math.max(36, directLabel.length * 6.5 + 14));
            const tx = pos.x - tw / 2;
            const ty = pos.y - 22;
            html += `<g class="fiber-scheme-fiber-label" data-fiber-key="${fiberKey}">`;
            html += `<rect class="fiber-scheme-fiber-label-bg" x="${tx}" y="${ty}" width="${tw}" height="18" rx="4" fill="${connLabelBg}" stroke="${svgBorderColor}" stroke-width="0.75"/>`;
            html += `<text class="fiber-scheme-fiber-label-text" x="${pos.x}" y="${ty + 13}" text-anchor="middle" style="font-size: 9px; font-weight: 600; fill: ${connLabelFill}; pointer-events: none;">${escapeHtml(directLabel)}</text>`;
            html += '</g>';
        });
    });
    html += '</g>';

    if (crossPanelLayout && fiberPorts) {
        html += buildCrossSchemePanelSvg(crossPanelLayout, fiberPorts, fiberPositions, schemeBlocks, isDark, badgeH, isEditMode, sleeveObj);
    }

    html += '</svg>';
    html += '</div></div></div>';

    if (cablesData.length >= 2) {
        function cableNameById(id) {
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
        if (isEditMode && fiberConnections.length > 0) html += '<p class="fiber-connections-list-sub">Подписи сращений — в полях ниже. Клик по жёлтой линии на схеме открывает окно по центру.</p>';
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
        const isConnected = fiberConnections.some(conn =>
            (conn.from.cableId === cableData.cableUniqueId && conn.from.fiberNumber === fiber.number) ||
            (conn.to.cableId === cableData.cableUniqueId && conn.to.fiberNumber === fiber.number)
        );
        const spliceConn = isConnected ? fiberConnections.find(function(c) {
            return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
        }) : null;
        const spliceConnLabel = spliceConn ? resolveFiberConnectionLabel(spliceConn, fiberLabels) : '';
        const nodeConnection = getHostAssignment(sleeveObj, 'nodeConnections', cableData.cableUniqueId, fiber.number);
        const realOltAssign = getFiberOltRealAssignment(sleeveObj, cableData.cableUniqueId, fiber.number);
        const oltConnection = realOltAssign;
        const hasDirectOltConnection = !!realOltAssign;
        const isOltCableEnd = occ.isOltCableEnd;
        const oltOnCableEnd = getOltAtHostCableEnd(sleeveObj, cableData.cableUniqueId);
        const onuConnection = getHostAssignment(sleeveObj, 'onuConnections', cableData.cableUniqueId, fiber.number);
        const mcConnection = getHostAssignment(sleeveObj, 'mediaConverterConnections', cableData.cableUniqueId, fiber.number);
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
        const hasAnyOutConnection = occ.hasAnyOutConnection;
        var oltReachKey = (getObjectUniqueId(sleeveObj) || '') + ':' + fiberConnKey(cableData.cableUniqueId, fiber.number);
        if (!Object.prototype.hasOwnProperty.call(oltReachCache, oltReachKey)) {
            oltReachCache[oltReachKey] = isFiberReachableToOlt(sleeveObj, cableData.cableUniqueId, fiber.number);
        }
        const canConnectToOlt = oltReachCache[oltReachKey];
        const oltBlocksSplice = occ.oltBlocksSplice;
        const canAssignBase = isEditMode && !isConnected && !isUsed && !hasNodeConnection && !hasMcConnection &&
            !hasOnuConnection && !hasSplitterConnection && !hasSplitterOutputAtHost && !oltBlocksSplice;
        const isSpliceSelectable = !isUsed && !isConnected && !hasNodeConnection && !hasMcConnection && !oltBlocksSplice && !hasOnuConnection && !hasSplitterConnection;
        const hasOltRelation = hasDirectOltConnection || isOltCableEnd || canConnectToOlt;
        const canShowOltIncoming = isEditMode && !isUsed && !isConnected && !hasOltRelation && !oltBlocksSplice &&
            !hasNodeConnection && !hasMcConnection && !hasSplitterOutputAtHost;
        const showGponBranchButtons = canAssignBase && (hasDirectOltConnection || (canConnectToOlt && !isOltCableEnd));
        const canConnectGponBranch = isEditMode && !isConnected && !isUsed && canConnectToOlt;
        const oltBlocksNode = isFiberLocalOltNodeBlocked(sleeveObj, cableData.cableUniqueId, fiber.number);
        const canConnectNodeOnHost = isEditMode && !isConnected && !isUsed && !hasNodeConnection &&
            !hasMcConnection && !hasOnuConnection && !hasSplitterConnection && !hasSplitterOutputAtHost && !oltBlocksNode;
        const showFullConnectButtons = canAssignBase && !hasAnyOutConnection && !showGponBranchButtons;
        const canRestoreTakenFiber = isEditMode && isUsed && !isConnected && !hasAnyOutConnection;
        const isGponFeeder = occ.isGponFeeder;
        const isGponUpstreamOnly = occ.isGponUpstreamOnly;
        const fiberTextColor = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') ? '#000' : '#fff';
        let statusText = isUsed ? '(исп.)' : (isGponFeeder ? 'GPON feeder' : (hasNodeConnection ? '(на узел)' : (hasOnuConnection ? '(на ONU)' : (hasMcConnection ? '(на МК)' : (hasSplitterConnection ? '(на сплит.)' : (hasDirectOltConnection ? '(от OLT)' : (isOltCableEnd ? '(→ OLT)' : '(своб.)')))))));
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
        let statusKind = 'free';
        if (isUsed) statusKind = 'used';
        else if (isGponFeeder) statusKind = 'gpon-feeder';
        else if (oltBlocksSplice || isGponUpstreamOnly) statusKind = 'gpon-upstream';
        else if (isOltCableEnd) statusKind = 'olt-cable';
        else if (hasNodeConnection) statusKind = 'node';
        else if (hasOnuConnection) statusKind = 'onu';
        else if (hasMcConnection) statusKind = 'mc';
        else if (hasSplitterConnection) statusKind = 'splitter-in';
        else if (hasSplitterOutputAtHost) statusKind = 'splitter-out';
        else if (hasDirectOltConnection || canConnectToOlt) statusKind = 'olt';
        const isUpstreamReachable = canConnectToOlt && !hasDirectOltConnection && !isOltCableEnd && !hasOnuConnection && !hasSplitterConnection;
        const isStrictOccupied = isOccupied && !isGponFeeder && !isGponUpstreamOnly && !isOltCableEnd && !isUpstreamReachable && !hasSplitterOutputAtHost;
        const usedClass = isGponFeeder ? ' fiber-gpon-feeder' : (oltBlocksSplice ? ' fiber-gpon-upstream' : (isOltCableEnd ? ' fiber-olt-cable' : (isUpstreamReachable ? ' fiber-gpon-upstream' : (isStrictOccupied ? ' fiber-used cross-fiber-used fiber-occupied' : (hasSplitterConnection ? ' fiber-splitter-connected' : '')))));
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
        const currentPort = isCross && fiberPorts && !isConnected ? (fiberPorts[fiberLabelKey] || '') : '';
        const portOptions = [];
        if (isCross && crossPorts && !isConnected) {
            portOptions.push('<option value="">—</option>');
            for (let p = 1; p <= crossPorts; p++) portOptions.push(`<option value="${p}"${currentPort === String(p) ? ' selected' : ''}>${p}</option>`);
        }
        const portRow = isCross
            ? (isConnected
                ? '<div class="fiber-port-row fiber-port-row--view"><span class="fiber-port-row__lbl">Порт</span><span class="fiber-port-row__val">—</span><span class="fiber-port-row__hint">сращена</span></div>'
                : (isEditMode && crossPorts
                    ? '<div class="fiber-port-row"><span class="fiber-port-row__lbl">Порт</span><select class="fiber-port-select form-select" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" title="Порт кросса">' + portOptions.join('') + '</select></div>'
                    : '<div class="fiber-port-row fiber-port-row--view"><span class="fiber-port-row__lbl">Порт</span><span class="fiber-port-row__val">' + (currentPort || '—') + '</span></div>'))
            : '';
        var disconnect = function(cls, title) {
            return isEditMode ? '<button type="button" class="fiber-assign__disconnect ' + cls + '" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" title="' + escapeHtml(title) + '">✕</button>' : '';
        };
        var assignRows = '';
        if (hasNodeConnection) assignRows += buildFiberAssignRow('node', '🖥️', '→ ' + escapeHtml(nodeConnection.nodeName) + (nodeConnection.switchPort != null ? ' · SFP ' + nodeConnection.switchPort : ''), disconnect('btn-disconnect-node', 'Отключить от узла'));
        if (hasOnuConnection) assignRows += buildFiberAssignRow('onu', '📡', '→ ' + escapeHtml(onuConnection.onuName || 'ONU'), disconnect('btn-disconnect-onu', 'Отключить от ONU'));
        if (hasMcConnection) assignRows += buildFiberAssignRow('mc', '⇄', '→ ' + escapeHtml(mcConnection.mediaConverterName || 'МК'), disconnect('btn-disconnect-mc', 'Отключить от МК'));
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
        var actionChips = '';
        var suppressOtherChips = !!renderOpts.suppressActionChips;
        if (canConnectNodeOnHost) {
            actionChips += buildFiberChip('btn-connect-node fiber-chip--node', cableData.cableUniqueId, fiber.number, 'Подключить к узлу', 'Узел');
        }
        if (!suppressOtherChips) {
            if (canShowOltIncoming) {
                actionChips += buildFiberChip('btn-connect-olt fiber-chip--olt', cableData.cableUniqueId, fiber.number, 'Приход OLT', 'OLT');
            }
            if (showFullConnectButtons && isCross) {
                if (canConnectGponBranch) actionChips += buildFiberChip('btn-connect-onu fiber-chip--onu', cableData.cableUniqueId, fiber.number, 'Подключить к ONU', 'ONU');
                actionChips += buildFiberChip('btn-connect-mc fiber-chip--mc', cableData.cableUniqueId, fiber.number, 'Медиаконвертер', 'МК');
            }
            if (showFullConnectButtons && !isCross) {
                if (canConnectGponBranch) actionChips += buildFiberChip('btn-connect-onu fiber-chip--onu', cableData.cableUniqueId, fiber.number, 'Подключить к ONU', 'ONU');
                actionChips += buildFiberChip('btn-connect-mc fiber-chip--mc', cableData.cableUniqueId, fiber.number, 'Медиаконвертер', 'МК');
            }
            if (showGponBranchButtons && canConnectGponBranch) {
                actionChips += buildFiberChip('btn-connect-onu fiber-chip--onu', cableData.cableUniqueId, fiber.number, 'GPON на ONU', 'ONU');
            }
        }
        var actionsBlock = actionChips ? '<div class="fiber-item__actions">' + actionChips + '</div>' : '';
        var labelBlock = '';
        if (!isConnected) {
            if (isEditMode) {
                labelBlock = '<input type="text" class="fiber-label-input form-input" data-cable-id="' + cableData.cableUniqueId + '" data-fiber-number="' + fiber.number + '" value="' + escapeHtml(directLabel) + '" placeholder="Подпись…" title="Подпись жилы">';
            } else if (directLabel) {
                labelBlock = '<div class="fiber-item__label">📝 ' + escapeHtml(directLabel) + '</div>';
            }
        }
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
            (assignRows ? '<div class="fiber-item__assigns">' + assignRows + '</div>' : '') +
            actionsBlock +
            (restoreBlock ? '<div class="fiber-item__restore">' + restoreBlock + '</div>' : '') +
            labelBlock +
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

/** Изогнутый отвод жилы: от магистрали кабеля S-образной кривой к порту жилы (виден веер при нескольких кабелях). */
function buildFiberSchemeFanPath(block, pos, isLeft, nodeR, badgeW) {
    const sx = block.fanOriginX;
    const sy = block.cableBarY;
    const ex = isLeft ? pos.x - badgeW / 2 - nodeR * 2 - 1 : pos.x + badgeW / 2 + nodeR * 2 + 1;
    const ey = pos.y;
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
    const goRight = x2 >= x1;
    const sx = x1 + (goRight ? portHalf : -portHalf);
    const ex = x2 + (goRight ? -portHalf : portHalf);
    const dy = y2 - y1;
    const absDy = Math.abs(dy);
    const sameSide = opts.sameSide || Math.abs(x2 - x1) < 10;
    const obstacles = opts.obstacles || [];
    let c1x, c1y, c2x, c2y;

    if (sameSide) {
        const isLeft = opts.isLeft != null ? opts.isLeft : x1 < (opts.svgWidth || 800) / 2;
        const bowX = Math.max(48, Math.min(160, absDy * 0.5 + 40)) * (isLeft ? 1 : -1);
        const bowY = Math.max(8, Math.min(32, absDy * 0.1));
        c1x = sx + bowX;
        c2x = ex + bowX;
        c1y = y1 + (dy >= 0 ? bowY : -bowY);
        c2y = y2 + (dy >= 0 ? -bowY : bowY);
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

/** Раскладка панели кросса с портами внизу схемы. */
function layoutCrossSchemePanel(svgWidth, crossPorts, cablesBottomY, opts) {
    opts = opts || {};
    const gap = 18;
    const headerH = 22;
    const portR = 7;
    const portSpacing = 26;
    const rowGap = 16;
    const padX = 14;
    const padY = 8;
    const portsPerRow = Math.min(crossPorts, Math.max(4, Math.floor((svgWidth - padX * 2 - 48) / portSpacing)));
    const numRows = Math.ceil(crossPorts / portsPerRow);
    const panelW = portsPerRow * portSpacing + padX * 2;
    const panelH = headerH + padY + numRows * (portR * 2 + rowGap) + padY;
    const panelX = Math.max(opts.sidePad || 12, (svgWidth - panelW) / 2);
    const panelTop = cablesBottomY + gap;
    const portPositions = new Map();
    const portRowStartY = panelTop + headerH + padY + portR;
    for (let p = 1; p <= crossPorts; p++) {
        const idx = p - 1;
        const col = idx % portsPerRow;
        const row = Math.floor(idx / portsPerRow);
        const x = panelX + padX + col * portSpacing + portSpacing / 2;
        const y = portRowStartY + row * (portR * 2 + rowGap);
        portPositions.set(p, { x: x, y: y, portR: portR });
    }
    return {
        panelX: panelX,
        panelTop: panelTop,
        panelW: panelW,
        panelH: panelH,
        portPositions: portPositions,
        contentBottom: panelTop + panelH + (opts.sidePad || 12),
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
        assignments[portNum] = {
            fiberKey: key,
            cableId: cableId,
            fiberNumber: fiberNumber
        };
    });
    return assignments;
}

function buildCrossFiberPortLinkPath(fx, fy, px, py, opts) {
    opts = opts || {};
    const dy = py - fy;
    const dx = px - fx;
    const towardCenter = opts.isLeft === true ? 1 : (opts.isLeft === false ? -1 : (dx >= 0 ? 1 : -1));
    const startBend = Math.max(22, Math.min(72, Math.abs(dx) * 0.3 + 18));
    const c1x = fx + towardCenter * startBend;
    const c1y = fy + Math.max(5, Math.min(20, dy * 0.04));
    const c2x = px + (fx - px) * 0.06;
    const c2y = py - Math.max(16, Math.min(52, dy * 0.2));
    return 'M ' + fx + ' ' + fy + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + px + ' ' + py;
}

function buildCrossSchemePanelSvg(crossLayout, fiberPorts, fiberPositions, schemeBlocks, isDark, badgeH, isEditMode, hostObj) {
    if (!crossLayout || !crossLayout.portPositions) return '';
    const crossPorts = crossLayout.portPositions.size;
    const assignments = buildCrossPortAssignments(fiberPorts, crossPorts, hostObj);
    const bodyFill = isDark ? '#1e1b4b' : '#faf5ff';
    const bodyStroke = isDark ? 'rgba(139, 92, 246, 0.55)' : 'rgba(109, 40, 217, 0.35)';
    const portIdle = isDark ? '#4c1d95' : '#ddd6fe';
    const portIdleStroke = isDark ? '#6d28d9' : '#a78bfa';
    const portActiveStroke = isDark ? '#a78bfa' : '#6d28d9';
    const portTextIdle = isDark ? '#c4b5fd' : '#7c3aed';
    const linkStroke = isDark ? 'rgba(167, 139, 250, 0.55)' : 'rgba(109, 40, 217, 0.4)';
    const title = escapeHtml(crossLayout.crossName || 'Кросс');
    const shortTitle = title.length > 28 ? title.substring(0, 27) + '…' : title;
    let html = '<g class="fiber-scheme-cross">';
    html += '<rect class="fiber-scheme-cross-body" x="' + crossLayout.panelX + '" y="' + crossLayout.panelTop + '" width="' + crossLayout.panelW + '" height="' + crossLayout.panelH + '" rx="10" fill="' + bodyFill + '" stroke="' + bodyStroke + '" stroke-width="1.5"/>';
    html += '<rect class="fiber-scheme-cross-header" x="' + crossLayout.panelX + '" y="' + crossLayout.panelTop + '" width="' + crossLayout.panelW + '" height="22" rx="10" fill="url(#crossHeaderGrad)"/>';
    html += '<rect x="' + crossLayout.panelX + '" y="' + (crossLayout.panelTop + 16) + '" width="' + crossLayout.panelW + '" height="6" fill="url(#crossHeaderGrad)"/>';
    html += '<text x="' + (crossLayout.panelX + crossLayout.panelW / 2) + '" y="' + (crossLayout.panelTop + 15) + '" text-anchor="middle" style="font-size:10px;font-weight:600;fill:#fff;pointer-events:none;">' + shortTitle + '</text>';
    html += '<g class="fiber-scheme-cross-links" fill="none">';
    Object.keys(assignments).forEach(function(portKey) {
        const portNum = parseInt(portKey, 10);
        const assign = assignments[portNum];
        const portPos = crossLayout.portPositions.get(portNum);
        const fiberPos = fiberPositions.get(assign.fiberKey);
        if (!portPos || !fiberPos) return;
        const fiber = lookupSchemeFiber(schemeBlocks, assign.cableId, assign.fiberNumber);
        const fiberAnchorY = fiberPos.y + (badgeH || 16) / 2 + 3;
        const pathD = buildCrossFiberPortLinkPath(fiberPos.x, fiberAnchorY, portPos.x, portPos.y - portPos.portR, {
            isLeft: fiberPos.isLeft
        });
        const strokeColor = fiber && fiber.color ? fiberSchemeLinkStrokeColor(fiber.color, isDark) : linkStroke;
        html += '<path class="fiber-scheme-cross-link" data-fiber-key="' + escapeHtml(assign.fiberKey) + '" data-cross-port="' + portNum + '" d="' + pathD + '" stroke="' + strokeColor + '" stroke-width="2" stroke-linecap="round" opacity="0.75"/>';
    });
    html += '</g>';
    html += '<g class="fiber-scheme-cross-ports">';
    crossLayout.portPositions.forEach(function(portPos, portNum) {
        const assign = assignments[portNum];
        const fiber = assign ? lookupSchemeFiber(schemeBlocks, assign.cableId, assign.fiberNumber) : null;
        const isAssigned = !!assign;
        const fill = isAssigned && fiber && fiber.color ? fiber.color : portIdle;
        const stroke = isAssigned ? portActiveStroke : portIdleStroke;
        const textFill = isAssigned ? ((fiber && (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB')) ? '#000' : '#fff') : portTextIdle;
        let tooltip = 'Порт ' + portNum;
        if (isAssigned && fiber) {
            tooltip += ' · ж.' + assign.fiberNumber + (fiber.name ? ' (' + fiber.name + ')' : '');
            if (isEditMode) tooltip += ' · клик — освободить';
        } else if (isEditMode) {
            tooltip += ' · свободен · клик — выбрать жилу';
        } else {
            tooltip += ' · свободен';
        }
        html += '<g class="fiber-scheme-cross-port' + (isAssigned ? ' fiber-scheme-cross-port--assigned' : '') + '" data-cross-port="' + portNum + '">';
        html += '<title>' + escapeHtml(tooltip) + '</title>';
        html += '<circle class="fiber-scheme-cross-port-node" cx="' + portPos.x + '" cy="' + portPos.y + '" r="' + portPos.portR + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (isAssigned ? 2 : 1.5) + '"' + (isEditMode ? '' : ' pointer-events="none"') + '/>';
        html += '<text class="fiber-scheme-cross-port-num" x="' + portPos.x + '" y="' + (portPos.y + 3.5) + '" text-anchor="middle" style="font-size:7px;font-weight:700;fill:' + textFill + ';pointer-events:none;">' + portNum + '</text>';
        if (isEditMode) {
            html += '<circle class="fiber-scheme-cross-port-hit" data-cross-port="' + portNum + '" cx="' + portPos.x + '" cy="' + portPos.y + '" r="12" fill="transparent" style="cursor:pointer"/>';
        }
        html += '</g>';
    });
    html += '</g></g>';
    return html;
}

/** Раскладка по образцу: слева/справа столбцы кабелей (гориз. магистраль + подписи), жилы веером к центру. */
function layoutFiberSchemeReference(cablesData, svgWidth, opts, sidePartition) {
    const rowHeight = opts.rowHeight;
    const sidePad = opts.sidePad;
    const panelW = opts.panelW;
    const fiberFanLen = opts.fiberFanLen;
    const blockGap = opts.blockGap;
    const labelH = opts.labelH;
    const fiberPositions = new Map();
    const blocks = [];
    const leftCables = sidePartition ? sidePartition.left : cablesData.slice(0, Math.ceil(cablesData.length / 2));
    const rightCables = sidePartition ? sidePartition.right : cablesData.slice(leftCables.length);

    function addSide(cables, side) {
        let y = sidePad;
        const isLeft = side === 'left';
        const fanOriginX = isLeft ? sidePad + panelW - 12 : svgWidth - sidePad - panelW + 12;
        const portX = isLeft ? fanOriginX + fiberFanLen : fanOriginX - fiberFanLen;
        const labelX = isLeft ? sidePad + 4 : svgWidth - sidePad - 4;
        const barX1 = isLeft ? sidePad : fanOriginX;
        const barX2 = isLeft ? fanOriginX : svgWidth - sidePad;

        cables.forEach(function(cableData) {
            const n = Math.max(cableData.fibers.length, 1);
            const zoneH = n * rowHeight;
            const blockH = labelH * 2 + zoneH + blockGap;
            const fiberZoneTop = y + labelH;
            const cableBarY = fiberZoneTop + zoneH / 2;
            const block = {
                cableData, side, fanOriginX, portX, labelX, barX1, barX2, cableBarY,
                fiberZoneTop, blockTop: y, blockH, isLeft
            };
            blocks.push(block);
            cableData.fibers.forEach(function(fiber, fi) {
                const fy = fiberZoneTop + fi * rowHeight + rowHeight / 2;
                const fiberKey = cableData.cableUniqueId + '-' + fiber.number;
                fiberPositions.set(fiberKey, {
                    x: portX, y: fy, cableData: cableData, fiber: fiber, side: side,
                    fanOriginX: fanOriginX, portX: portX, isLeft: isLeft, block: block
                });
            });
            y += blockH;
        });
        return y;
    }

    const leftBottom = addSide(leftCables, 'left');
    const rightBottom = addSide(rightCables, 'right');
    const minH = opts.minSvgHeight || 120;
    const svgHeight = Math.max(leftBottom, rightBottom, minH) + sidePad;
    return { fiberPositions: fiberPositions, blocks: blocks, svgHeight: svgHeight };
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
