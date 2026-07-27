/**
 * UI регионов: рисование, боковая панель.
 */
function getNextRegionDefaultName() {
    var n = 1;
    if (window.MapRegions) {
        n = MapRegions.getAllRegions(objects).length + 1;
    }
    return 'Регион ' + n;
}

function removeRegionDrawPreview() {
    if (regionDrawPreview && myMap) {
        try { myMap.geoObjects.remove(regionDrawPreview); } catch (e) {}
    }
    regionDrawPreview = null;
}

function updateRegionDrawPreview() {
    if (!myMap || !regionDrawMode) return;
    removeRegionDrawPreview();
    if (!regionDrawCoords.length) return;
    var fillEl = document.getElementById('regionDrawFillColor');
    var fillColor = MapRegions.DEFAULT_FILL;
    if (regionEditTarget && regionEditTarget.properties) {
        fillColor = regionEditTarget.properties.get('fillColor') || fillColor;
    } else if (fillEl && fillEl.value) {
        fillColor = fillEl.value;
    }
    var coords = regionDrawCoords.slice();
    if (coords.length >= 3) {
        regionDrawPreview = new ymaps.Polygon([coords], {}, MapRegions.getPolygonOptions(fillColor, MapRegions.DEFAULT_STROKE, 0.18));
    } else if (coords.length >= 2) {
        regionDrawPreview = new ymaps.Polyline(coords, {}, {
            strokeColor: fillColor,
            strokeWidth: 2,
            strokeOpacity: 0.85,
            strokeStyle: 'dash',
            zIndex: 1000,
            interactive: false
        });
    } else {
        regionDrawPreview = new ymaps.Placemark(coords[0], {}, {
            preset: 'islands#blueCircleDotIcon',
            zIndex: 1000,
            interactive: false
        });
    }
    myMap.geoObjects.add(regionDrawPreview);
}

function updateRegionDrawBar() {
    var pointsEl = document.getElementById('regionDrawBarPoints');
    var doneBtn = document.getElementById('regionDrawDone');
    var n = regionDrawCoords.length;
    if (pointsEl) pointsEl.textContent = String(n);
    if (doneBtn) doneBtn.disabled = n < 3;
}

function showRegionDrawBar(mode) {
    mode = mode || 'create';
    var bar = document.getElementById('regionDrawBar');
    if (bar) {
        bar.hidden = false;
        bar.classList.toggle('region-draw-card--edit', mode === 'edit');
    }
    document.body.classList.add('underground-draw-active');
    var fields = bar ? bar.querySelector('.region-draw-fields') : null;
    var titleEl = document.getElementById('regionDrawBarTitle');
    var modeEl = bar ? bar.querySelector('.underground-draw-card__mode') : null;
    var hintEl = document.getElementById('regionDrawBarText');
    if (mode === 'edit') {
        if (fields) fields.hidden = true;
        var rname = regionEditTarget && regionEditTarget.properties ? (regionEditTarget.properties.get('name') || '') : '';
        if (titleEl) titleEl.textContent = rname ? ('«' + rname + '»') : 'Контур региона';
        if (modeEl) modeEl.textContent = 'Новый контур';
        if (hintEl) hintEl.textContent = 'Кликайте по карте — новые вершины. «Готово» сохранит контур, «Отмена» вернёт прежний.';
    } else {
        if (fields) fields.hidden = false;
        if (titleEl) titleEl.textContent = 'Новый регион';
        if (modeEl) modeEl.textContent = 'Рисование';
        if (hintEl) hintEl.textContent = 'Кликайте по карте — вершины контура. Минимум 3 точки. Двойной клик или «Готово» — завершить.';
        var nameEl = document.getElementById('regionDrawName');
        if (nameEl && !nameEl.value.trim()) nameEl.value = getNextRegionDefaultName();
    }
    updateRegionDrawBar();
    updateRegionDrawPreview();
}

function hideRegionDrawBar() {
    var bar = document.getElementById('regionDrawBar');
    if (bar) {
        bar.hidden = true;
        bar.classList.remove('region-draw-card--edit');
    }
    document.body.classList.remove('underground-draw-active');
}

function resetRegionDrawUi() {
    regionDrawMode = false;
    regionDrawCoords = [];
    removeRegionDrawPreview();
    hideRegionDrawBar();
    var btn = document.getElementById('drawRegionBtn');
    if (btn) {
        btn.classList.remove('btn-add-object--placement');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"></polygon></svg><span class="btn-draw-region-text">Нарисовать регион</span>';
    }
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = '';
        mapEl.classList.remove('map-crosshair-active');
    }
    syncMapPanLockForEditTools();
}

function detachRegionFromMapForEdit(regionObj) {
    if (!regionObj || !myMap || !regionObj.properties) return;
    if (regionObj.properties.get('_detachedForGeometryEdit')) return;
    try { myMap.geoObjects.remove(regionObj); } catch (e) {}
    regionObj.properties.set('_detachedForGeometryEdit', true);
}

function attachRegionToMapAfterEdit(regionObj) {
    if (!regionObj || !myMap || !regionObj.properties) return;
    if (!regionObj.properties.get('_detachedForGeometryEdit')) return;
    try {
        myMap.geoObjects.add(regionObj, 0);
        if (window.MapRegions && MapRegions.sendRegionToMapBack) MapRegions.sendRegionToMapBack(regionObj, myMap);
    } catch (e) {}
    regionObj.properties.set('_detachedForGeometryEdit', false);
}

function cancelRegionDraw() {
    if (regionEditTarget) {
        if (regionEditGeometryBackup && regionEditTarget.geometry) {
            try { regionEditTarget.geometry.setCoordinates([regionEditGeometryBackup]); } catch (e) {}
        }
        attachRegionToMapAfterEdit(regionEditTarget);
        var restored = regionEditTarget;
        regionEditTarget = null;
        regionEditGeometryBackup = null;
        resetRegionDrawUi();
        if (typeof applyMapFilter === 'function') applyMapFilter();
        if (restored && isEditMode && canEdit()) showRegionEditModal(restored);
        return;
    }
    resetRegionDrawUi();
}

function startRegionGeometryEdit(regionObj) {
    if (!regionObj || !isEditMode || !canEdit()) return;
    if (typeof closeInfoModal === 'function') closeInfoModal();
    if (regionDrawMode) cancelRegionDraw();
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (currentCableTool) {
        currentCableTool = false;
        removeCablePreview();
        cableSource = null;
        cableWaypoints = [];
    }
    if (cableUndergroundEditMode && typeof cancelUndergroundSpanEdit === 'function') cancelUndergroundSpanEdit();
    if (fiberRoutingMode) cancelFiberRouting();
    if (splitterFiberRoutingMode) cancelSplitterFiberRouting();
    if (cableSplitMode) cancelCableSplitMode();

    regionEditTarget = regionObj;
    regionEditGeometryBackup = MapRegions.getRegionRing(regionObj).slice();
    regionDrawMode = true;
    regionDrawCoords = [];
    removeRegionDrawPreview();
    detachRegionFromMapForEdit(regionObj);
    showRegionDrawBar('edit');
    focusRegionOnMap(regionObj);
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = 'crosshair';
        mapEl.classList.add('map-crosshair-active');
    }
    syncMapPanLockForEditTools();
}

function startRegionDraw() {
    if (!isEditMode || !canEdit()) return;
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (currentCableTool) {
        currentCableTool = false;
        var cableBtn = document.getElementById('addCable');
        if (cableBtn) {
            cableBtn.classList.remove('btn-add-object--placement');
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span class="btn-lay-cable-text">Проложить кабель</span>';
        }
        removeCablePreview();
        cableSource = null;
        cableWaypoints = [];
    }
    if (cableUndergroundEditMode && typeof cancelUndergroundSpanEdit === 'function') cancelUndergroundSpanEdit();
    if (fiberRoutingMode) cancelFiberRouting();
    if (splitterFiberRoutingMode) cancelSplitterFiberRouting();
    if (cableSplitMode) cancelCableSplitMode();

    regionDrawMode = true;
    regionEditTarget = null;
    regionEditGeometryBackup = null;
    regionDrawCoords = [];
    removeRegionDrawPreview();
    showRegionDrawBar('create');
    var btn = document.getElementById('drawRegionBtn');
    if (btn) {
        btn.classList.add('btn-add-object--placement');
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="btn-draw-region-text">Завершить рисование</span>';
    }
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = 'crosshair';
        mapEl.classList.add('map-crosshair-active');
    }
    syncMapPanLockForEditTools();
}

function finishRegionDraw() {
    if (!regionDrawMode) return;
    var ring = MapRegions.normalizeRing(regionDrawCoords);
    if (ring.length < 3) {
        if (typeof showWarning === 'function') showWarning('Нужно минимум 3 точки контура.', 'Регион');
        return;
    }
    if (regionEditTarget) {
        try { regionEditTarget.geometry.setCoordinates([ring]); } catch (e) {}
        MapRegions.applyRegionStyle(regionEditTarget);
        attachRegionToMapAfterEdit(regionEditTarget);
        if (window.MapRegions && MapRegions.updateRegionLabel) {
            MapRegions.updateRegionLabel(regionEditTarget, myMap);
        }
        var edited = regionEditTarget;
        regionEditTarget = null;
        regionEditGeometryBackup = null;
        resetRegionDrawUi();
        saveData();
        if (typeof applyMapFilter === 'function') applyMapFilter();
        renderRegionsSidebarList();
        if (typeof showSuccess === 'function') showSuccess('Контур региона обновлён', 'Регион');
        if (edited) showRegionEditModal(edited);
        return;
    }
    var nameEl = document.getElementById('regionDrawName');
    var fillEl = document.getElementById('regionDrawFillColor');
    var name = nameEl ? nameEl.value.trim() : '';
    var fillColor = (fillEl && fillEl.value) ? fillEl.value : MapRegions.DEFAULT_FILL;
    resetRegionDrawUi();
    var region = createRegion(name || getNextRegionDefaultName(), ring, { fillColor: fillColor, strokeColor: MapRegions.DEFAULT_STROKE });
    if (region) {
        if (typeof showSuccess === 'function') showSuccess('Регион создан', 'Регион');
        focusRegionOnMap(region);
    }
}

function createRegion(name, ringCoords, options) {
    options = options || {};
    if (wouldExceedMapObjectLimit(1)) {
        notifyMapObjectLimitBlocked();
        return null;
    }
    var ring = MapRegions.normalizeRing(ringCoords);
    if (ring.length < 3) return null;
    var fillColor = options.fillColor || MapRegions.DEFAULT_FILL;
    var strokeColor = options.strokeColor || MapRegions.DEFAULT_STROKE;
    var fillOpacity = options.fillOpacity != null ? options.fillOpacity : MapRegions.DEFAULT_FILL_OPACITY;
    var props = {
        type: 'region',
        name: name || '',
        regionVisible: options.regionVisible !== false,
        fillColor: fillColor,
        strokeColor: strokeColor,
        fillOpacity: fillOpacity,
        balloonContent: name ? ('Регион: ' + name) : 'Регион'
    };
    props.uniqueId = options.uniqueId || generateUniqueId('region');
    var polygon = new ymaps.Polygon([ring], props, MapRegions.getPolygonOptions(fillColor, strokeColor, fillOpacity));
    try { polygon.options.set('draggable', false); } catch (eDr) {}
    try { polygon.options.set('interactive', false); } catch (eInt) {}
    objects.push(polygon);
    mapPerfRegister(polygon);
    myMap.geoObjects.add(polygon, 0);
    if (window.MapRegions && MapRegions.sendRegionToMapBack) MapRegions.sendRegionToMapBack(polygon, myMap);
    if (window.MapRegions && MapRegions.updateRegionLabel) MapRegions.updateRegionLabel(polygon, myMap);
    if (!(options && options.skipLimitCount)) {
        mapLimitsCache.count = (mapLimitsCache.count || 0) + 1;
        if (mapLimitsCache.limit != null) {
            mapLimitsCache.remaining = Math.max(0, mapLimitsCache.limit - mapLimitsCache.count);
        }
        updateMapLimitBanner();
    }
    if (options && options.data && options.data.revision != null) setMapRevision(polygon, options.data.revision);
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (!(options && options.skipSync) && typeof window.syncSendOp === 'function') {
        var dataSer = serializeOneObject(polygon);
        if (dataSer) {
            window.syncSendOp({ type: 'add_object', data: dataSer });
            if (typeof bumpMapRevisionAfterSyncAdd === 'function') bumpMapRevisionAfterSyncAdd(polygon);
        }
    }
    if (!(options && options.skipSave)) saveData({ skipSync: true });
    renderRegionsSidebarList();
    if (!(options && options.skipLog)) {
        logAction(ActionTypes.CREATE_OBJECT, { objectType: 'region', name: name || '' });
    }
    return polygon;
}

function createRegionFromData(data) {
    if (!data || !data.geometry) return null;
    var ring = MapRegions.normalizeRing(data.geometry);
    if (ring.length < 3) return null;
    return createRegion(data.name || '', ring, {
        uniqueId: data.uniqueId,
        fillColor: data.fillColor,
        strokeColor: data.strokeColor,
        fillOpacity: data.fillOpacity,
        regionVisible: data.regionVisible !== false,
        skipSync: true,
        skipSave: true,
        skipLog: true,
        data: data
    });
}

function focusRegionOnMap(regionObj) {
    if (!regionObj || !myMap || !window.MapRegions) return;
    var ring = MapRegions.getRegionRing(regionObj);
    if (ring.length < 3) return;
    var lats = ring.map(function(c) { return c[0]; });
    var lons = ring.map(function(c) { return c[1]; });
    myMap.setBounds(
        [[Math.min.apply(null, lats), Math.min.apply(null, lons)], [Math.max.apply(null, lats), Math.max.apply(null, lons)]],
        { checkZoomRange: true, duration: 300 }
    );
}


function setRegionVisible(regionObj, visible, opts) {
    if (!regionObj || !regionObj.properties) return;
    regionObj.properties.set('regionVisible', !!visible);
    if (window.MapRegions && MapRegions.invalidateHiddenRegionsCache) {
        try { MapRegions.invalidateHiddenRegionsCache(); } catch (eInv) {}
    }
    if (!(opts && opts.skipSave)) saveData();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    renderRegionsSidebarList();
}

function renderRegionsSidebarList() {
    var root = document.getElementById('regionsList');
    var badge = document.getElementById('regionsCountBadge');
    if (!root || !window.MapRegions) return;
    var regions = MapRegions.getAllRegions(objects);
    var editable = isEditMode && canEdit();
    if (badge) badge.textContent = regions.length ? String(regions.length) : '';
    if (!regions.length) {
        root.innerHTML = '<p class="regions-list-empty">Регионов пока нет. Нарисуйте первый контур на карте.</p>';
        return;
    }
    var html = '';
    regions.forEach(function(region) {
        var uid = region.properties.get('uniqueId') || '';
        var name = region.properties.get('name') || 'Без названия';
        var fill = region.properties.get('fillColor') || MapRegions.DEFAULT_FILL;
        var stats = MapRegions.collectObjectsInRegion(region, objects);
        var summary = stats.total + ' объект.' + (stats.total === 1 ? '' : (stats.total >= 2 && stats.total <= 4 ? 'а' : 'ов'));
        var hidden = !MapRegions.isRegionVisible(region);
        html += '<div class="region-list-item' + (hidden ? ' region-list-item--hidden' : '') + '" style="border-left-color:' + escapeHtml(fill) + '" data-region-id="' + escapeHtml(uid) + '">';
        html += '<span class="region-list-item__swatch" style="background:' + escapeHtml(fill) + '"></span>';
        html += '<div class="region-list-item__body">';
        html += '<button type="button" class="region-list-item__name" data-action="focus">' + escapeHtml(name) + '</button>';
        html += '<div class="region-list-item__meta">' + escapeHtml(summary) + '</div>';
        html += '</div>';
        html += '<div class="region-list-item__actions">';
        html += '<button type="button" class="region-list-item__icon-btn" data-action="toggle" title="' + (hidden ? 'Показать' : 'Скрыть') + '" aria-label="' + (hidden ? 'Показать регион' : 'Скрыть регион') + '">';
        html += hidden
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        html += '</button>';
        if (editable) {
            html += '<button type="button" class="region-list-item__icon-btn region-list-item__icon-btn--edit" data-action="edit" title="Редактировать" aria-label="Редактировать регион">';
            html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
            html += '</button>';
        }
        html += '</div></div>';
    });
    root.innerHTML = html;
    root.querySelectorAll('.region-list-item').forEach(function(item) {
        var uid = item.getAttribute('data-region-id');
        var region = objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === uid; });
        if (!region) return;
        var focusBtn = item.querySelector('[data-action="focus"]');
        if (focusBtn) focusBtn.addEventListener('click', function() { focusRegionOnMap(region); });
        var toggleBtn = item.querySelector('[data-action="toggle"]');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                setRegionVisible(region, !MapRegions.isRegionVisible(region));
            });
        }
        var editBtn = item.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                showRegionEditModal(region);
            });
        }
    });
}

function buildRegionEditCardContent(regionObj) {
    var name = regionObj.properties.get('name') || '';
    var fill = regionObj.properties.get('fillColor') || MapRegions.DEFAULT_FILL;
    var stroke = regionObj.properties.get('strokeColor') || MapRegions.DEFAULT_STROKE;
    var visible = MapRegions.isRegionVisible(regionObj);
    var stats = MapRegions.collectObjectsInRegion(regionObj, objects);
    var html = '<div class="region-edit-card">';
    html += '<p class="region-edit-card__stats">' + escapeHtml(MapRegions.countSummaryText(stats.counts, stats.total)) + '</p>';
    html += '<label class="region-edit-card__field"><span>Название</span><input type="text" id="editRegionName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название"></label>';
    html += '<div class="region-edit-card__colors">';
    html += '<label class="region-edit-card__color"><span>Заливка</span><input type="color" id="editRegionFillColor" value="' + escapeHtml(fill) + '"></label>';
    html += '<label class="region-edit-card__color"><span>Обводка</span><input type="color" id="editRegionStrokeColor" value="' + escapeHtml(stroke) + '"></label>';
    html += '</div>';
    html += buildObjectGallerySectionHtml(regionObj, true);
    html += '<div class="region-edit-card__actions">';
    html += '<button type="button" id="regionRedrawBtn" class="btn-secondary btn-compact">Перерисовать контур</button>';
    html += '<button type="button" id="toggleRegionVisibleBtn" class="btn-secondary btn-compact">' + (visible ? 'Скрыть' : 'Показать') + '</button>';
    html += '<button type="button" id="deleteCurrentObject" class="btn-danger btn-compact">Удалить</button>';
    html += '</div></div>';
    return html;
}

function applyRegionCardEdits(regionObj) {
    if (!regionObj || !regionObj.properties) return;
    var nameEl = document.getElementById('editRegionName');
    var fillEl = document.getElementById('editRegionFillColor');
    var strokeEl = document.getElementById('editRegionStrokeColor');
    if (nameEl) {
        var nm = nameEl.value.trim();
        regionObj.properties.set('name', nm);
        regionObj.properties.set('balloonContent', nm ? ('Регион: ' + nm) : 'Регион');
    }
    if (fillEl) regionObj.properties.set('fillColor', fillEl.value);
    if (strokeEl) regionObj.properties.set('strokeColor', strokeEl.value);
    MapRegions.applyRegionStyle(regionObj);
    saveData();
    renderRegionsSidebarList();
}

function showRegionEditModal(regionObj) {
    if (!regionObj || !isEditMode || !canEdit()) return;
    applyModalEditModeForObject(regionObj, function() {
        showRegionEditModalBody(regionObj);
    });
}

function showRegionEditModalBody(regionObj) {
    currentModalObject = regionObj;
    var name = regionObj.properties.get('name') || '';
    document.getElementById('modalTitle').textContent = name ? ('Регион: ' + name) : 'Регион';
    updateInfoModalChrome(null, name);
    var modalInfoEl = document.getElementById('modalInfo');
    modalInfoEl.innerHTML = buildRegionEditCardContent(regionObj);
    resetInfoModalFiberLayout();
    var modal = document.getElementById('infoModal');
    setupEditAndDeleteListeners();
    bindObjectGalleryModal(modalInfoEl, regionObj);
    var toggleBtn = document.getElementById('toggleRegionVisibleBtn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            setRegionVisible(regionObj, !MapRegions.isRegionVisible(regionObj));
            showRegionEditModalBody(regionObj);
        });
    }
    var redrawBtn = document.getElementById('regionRedrawBtn');
    if (redrawBtn) {
        redrawBtn.addEventListener('click', function() {
            startRegionGeometryEdit(regionObj);
        });
    }
    var nameEl = document.getElementById('editRegionName');
    if (nameEl) {
        var saveName = function() { applyRegionCardEdits(regionObj); };
        nameEl.addEventListener('change', saveName);
        nameEl.addEventListener('blur', saveName);
    }
    ['editRegionFillColor', 'editRegionStrokeColor'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function() { applyRegionCardEdits(regionObj); });
    });
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
        updateModalLockBanner(getObjectUniqueId(regionObj));
    }
}

function setupRegionControls() {
    var drawBtn = document.getElementById('drawRegionBtn');
    if (drawBtn) {
        drawBtn.addEventListener('click', function() {
            if (regionDrawMode) finishRegionDraw();
            else startRegionDraw();
        });
    }
    var doneBtn = document.getElementById('regionDrawDone');
    if (doneBtn) doneBtn.addEventListener('click', finishRegionDraw);
    var undoBtn = document.getElementById('regionDrawUndo');
    if (undoBtn) {
        undoBtn.addEventListener('click', function() {
            if (!regionDrawCoords.length) return;
            regionDrawCoords.pop();
            updateRegionDrawBar();
            updateRegionDrawPreview();
        });
    }
    var cancelBtn = document.getElementById('regionDrawCancel');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelRegionDraw);
    var fillColorInput = document.getElementById('regionDrawFillColor');
    if (fillColorInput) fillColorInput.addEventListener('input', updateRegionDrawPreview);
    if (myMap && !myMap._regionDblClickBound) {
        myMap._regionDblClickBound = true;
        myMap.events.add('dblclick', function(e) {
            if (!regionDrawMode) return;
            try { e.stopPropagation(); } catch (err) {}
            finishRegionDraw();
        });
    }
    renderRegionsSidebarList();
}

