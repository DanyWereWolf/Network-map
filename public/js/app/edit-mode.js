/**
 * Режим просмотра/редактирования, иконки объектов, импорт файла.
 */
function isNedImportFile(file) {
    if (!file || !file.name) return false;
    return /\.ned$/i.test(file.name);
}

async function convertNedFileViaApi(file) {
    var base = typeof getApiBase === 'function' ? getApiBase() : '';
    var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    if (!base || !token) {
        throw new Error('Для импорта .ned нужна авторизация (API).');
    }
    var res = await fetch(base.replace(/\/$/, '') + '/api/import/ned', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/octet-stream',
            'X-Filename': encodeURIComponent(file.name || 'project.ned')
        },
        body: file
    });
    var body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    if (!res.ok) {
        throw new Error((body && body.error) || ('Ошибка конвертации NeD (HTTP ' + res.status + ')'));
    }
    if (!body || !Array.isArray(body.data)) {
        throw new Error('Сервер вернул неожиданный ответ конвертера NeD');
    }
    return body.data;
}

/** Новые uniqueId для merge-импорта; обновляет все ссылки внутри массива. */
function remapImportUniqueIds(data) {
    if (!Array.isArray(data)) return data;
    var seq = 0;
    function freshUid(prefix) {
        seq++;
        if (typeof generateUniqueId === 'function') {
            return generateUniqueId(prefix) + '-' + seq.toString(36);
        }
        return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '-' + seq.toString(36);
    }
    var idMap = Object.create(null);
    data.forEach(function(item) {
        if (!item || item.uniqueId == null || item.uniqueId === '') return;
        var oldId = String(item.uniqueId);
        if (idMap[oldId]) return;
        var prefix = item.type === 'cable' ? 'cable' : 'obj';
        idMap[oldId] = freshUid(prefix);
    });
    data.forEach(function(item) {
        if (!item || !Array.isArray(item.embeddedSplitters)) return;
        item.embeddedSplitters.forEach(function(esp) {
            if (!esp || esp.id == null || esp.id === '') return;
            var oldEsp = String(esp.id);
            if (idMap[oldEsp]) return;
            idMap[oldEsp] = freshUid('esp');
        });
    });
    function mapId(id) {
        if (id == null || id === '') return id;
        var key = String(id);
        return idMap[key] != null ? idMap[key] : id;
    }
    function remapKeyedObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        var out = {};
        Object.keys(obj).forEach(function(k) {
            var nk = k;
            if (idMap[k] != null) {
                nk = idMap[k];
            } else {
                // usedFibers: cableId → [...]; fiberLabels: cableId-fiberN → text
                for (var oldId in idMap) {
                    if (Object.prototype.hasOwnProperty.call(idMap, oldId) &&
                        k.length > oldId.length && k.indexOf(oldId + '-') === 0) {
                        nk = idMap[oldId] + k.slice(oldId.length);
                        break;
                    }
                }
            }
            out[nk] = obj[k];
        });
        return out;
    }
    data.forEach(function(item) {
        if (!item) return;
        if (item.uniqueId != null && item.uniqueId !== '') {
            item.uniqueId = mapId(item.uniqueId);
        }
        if (item.fromUniqueId != null) item.fromUniqueId = mapId(item.fromUniqueId);
        if (item.toUniqueId != null) item.toUniqueId = mapId(item.toUniqueId);
        if (Array.isArray(item.routeUniqueIds)) {
            item.routeUniqueIds = item.routeUniqueIds.map(mapId);
        }
        if (Array.isArray(item.fiberConnections)) {
            item.fiberConnections.forEach(function(conn) {
                if (!conn) return;
                if (conn.from && conn.from.cableId != null) conn.from.cableId = mapId(conn.from.cableId);
                if (conn.to && conn.to.cableId != null) conn.to.cableId = mapId(conn.to.cableId);
            });
        }
        if (Array.isArray(item.embeddedSplitters)) {
            item.embeddedSplitters.forEach(function(esp) {
                if (!esp) return;
                if (esp.id != null) esp.id = mapId(esp.id);
                if (esp.inputCableId != null) esp.inputCableId = mapId(esp.inputCableId);
                if (esp.inputFiber && esp.inputFiber.cableId != null) {
                    esp.inputFiber.cableId = mapId(esp.inputFiber.cableId);
                }
                if (Array.isArray(esp.outputConnections)) {
                    esp.outputConnections.forEach(function(oc) {
                        if (!oc) return;
                        if (oc.cableId != null) oc.cableId = mapId(oc.cableId);
                        if (oc.hostId != null) oc.hostId = mapId(oc.hostId);
                        if (oc.mediaConverterId != null) oc.mediaConverterId = mapId(oc.mediaConverterId);
                        if (oc.splitterId != null) oc.splitterId = mapId(oc.splitterId);
                        if (Array.isArray(oc.routeIds)) oc.routeIds = oc.routeIds.map(mapId);
                    });
                }
            });
        }
        if (item.usedFibers) item.usedFibers = remapKeyedObject(item.usedFibers);
        if (item.fiberLabels) item.fiberLabels = remapKeyedObject(item.fiberLabels);
        ['nodeConnections', 'oltConnections', 'onuConnections', 'mediaConverterConnections',
            'radioBridgeConnections', 'splitterConnections', 'crossPortPatches'].forEach(function(field) {
            if (item[field]) item[field] = remapKeyedObject(item[field]);
        });
    });
    return data;
}

var MAP_FOCUS_ONCE_KEY = 'volsmap.mapFocusOnce';

/**
 * Охват координат импорта: центр и границы по 2–98 перцентилям (без выбросов).
 * null, если координаты не похожи на реальные WGS84.
 */
function getImportGeoExtent(data) {
    if (!Array.isArray(data)) return null;
    var lats = [], lons = [];
    function walk(geom) {
        if (!Array.isArray(geom) || geom.length === 0) return;
        if (typeof geom[0] === 'number') {
            var lat = Number(geom[0]), lon = Number(geom[1]);
            if (isFinite(lat) && isFinite(lon)) { lats.push(lat); lons.push(lon); }
            return;
        }
        for (var i = 0; i < geom.length; i++) walk(geom[i]);
    }
    data.forEach(function(item) { if (item) walk(item.geometry); });
    if (lats.length === 0) return null;
    lats.sort(function(a, b) { return a - b; });
    lons.sort(function(a, b) { return a - b; });
    function q(arr, p) { return arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]; }
    var south = q(lats, 0.02), north = q(lats, 0.98), west = q(lons, 0.02), east = q(lons, 0.98);
    if (south < -85 || north > 85 || west < -180 || east > 180) return null;
    if (Math.abs(q(lats, 0.5)) < 0.5 && Math.abs(q(lons, 0.5)) < 0.5) return null;
    // Крупный город / область: до ~10° (~1100 км). Больше — скорее битые координаты.
    if (north - south > 10 || east - west > 10) return null;
    return {
        center: [(south + north) / 2, (west + east) / 2],
        bounds: [[south, west], [north, east]]
    };
}

/** Сдвинуть все geometry так, чтобы центроид совпал с targetCenter [lat, lon]. */
function shiftMapDataToCenter(data, targetCenter) {
    if (!Array.isArray(data) || !targetCenter || targetCenter.length < 2) return data;
    var sumLat = 0, sumLon = 0, n = 0;
    function visitPoint(pt) {
        if (!Array.isArray(pt) || pt.length < 2) return;
        var lat = Number(pt[0]), lon = Number(pt[1]);
        if (!isFinite(lat) || !isFinite(lon)) return;
        sumLat += lat;
        sumLon += lon;
        n++;
    }
    function walkGeom(geom) {
        if (!Array.isArray(geom) || geom.length === 0) return;
        if (typeof geom[0] === 'number') {
            visitPoint(geom);
            return;
        }
        for (var i = 0; i < geom.length; i++) walkGeom(geom[i]);
    }
    data.forEach(function(item) {
        if (!item) return;
        walkGeom(item.geometry);
        if (Array.isArray(item.undergroundSpans)) {
            item.undergroundSpans.forEach(function(sp) {
                if (sp && sp.pathCoords) walkGeom(sp.pathCoords);
            });
        }
    });
    if (n === 0) return data;
    var dLat = Number(targetCenter[0]) - (sumLat / n);
    var dLon = Number(targetCenter[1]) - (sumLon / n);
    if (!isFinite(dLat) || !isFinite(dLon)) return data;
    if (Math.abs(dLat) < 1e-12 && Math.abs(dLon) < 1e-12) return data;

    function shiftPoint(pt) {
        if (!Array.isArray(pt) || pt.length < 2) return pt;
        if (typeof pt[0] !== 'number') return pt;
        pt[0] = Number(pt[0]) + dLat;
        pt[1] = Number(pt[1]) + dLon;
        return pt;
    }
    function shiftGeom(geom) {
        if (!Array.isArray(geom) || geom.length === 0) return;
        if (typeof geom[0] === 'number') {
            shiftPoint(geom);
            return;
        }
        for (var i = 0; i < geom.length; i++) shiftGeom(geom[i]);
    }
    data.forEach(function(item) {
        if (!item) return;
        shiftGeom(item.geometry);
        if (Array.isArray(item.undergroundSpans)) {
            item.undergroundSpans.forEach(function(sp) {
                if (sp && sp.pathCoords) shiftGeom(sp.pathCoords);
            });
        }
    });
    return data;
}

function handleFileImport(e) {
    if (typeof requireAdmin === 'function' && !requireAdmin()) {
        if (e.target) e.target.value = '';
        return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const fileInput = e.target;
    const nedMode = isNedImportFile(file);

    async function persistImportedMapToApi(serialized) {
        var base = typeof getApiBase === 'function' ? getApiBase() : '';
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!base || !token) {
            throw new Error('Для сохранения импорта нужна авторизация (API).');
        }
        var regionId = (typeof getCurrentMapRegionId === 'function' && getCurrentMapRegionId())
            || (typeof window !== 'undefined' && window.currentMapRegionId) || '';
        var payload = { data: serialized };
        if (regionId) {
            payload.regionId = String(regionId);
            serialized.forEach(function (it) {
                if (it && typeof it === 'object' && !it.mapRegionId) it.mapRegionId = String(regionId);
            });
        } else {
            payload.replaceAll = true;
        }
        var res = await fetch(base.replace(/\/$/, '') + '/api/map', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        });
        var body = null;
        try { body = await res.json(); } catch (eJson) { body = null; }
        if (!res.ok) {
            throw new Error((body && body.error) ? body.error : ('Ошибка сохранения карты (HTTP ' + res.status + ')'));
        }
        return body;
    }

    async function runImportData(data, importOpts, successMsg, logSource) {
        var overlayShown = false;
        function hideImportOverlay() {
            if (!overlayShown) return;
            overlayShown = false;
            if (typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay();
        }
        var bulkImport = data.length >= (typeof MAP_BULK_IMPORT_MIN_ITEMS === 'number' ? MAP_BULK_IMPORT_MIN_ITEMS : 350);
        if (bulkImport && typeof showUndoRedoLoadingOverlay === 'function') {
            showUndoRedoLoadingOverlay(importOpts && importOpts.merge ? 'Вставка NeD…' : 'Импорт карты…');
            overlayShown = true;
            await new Promise(function(resolve) {
                requestAnimationFrame(function() { requestAnimationFrame(resolve); });
            });
        }
        var opts = Object.assign({ skipSave: true, skipHistory: true }, importOpts || {});
        if (bulkImport) opts.bulkImport = true;
        await new Promise(function(resolve, reject) {
            importData(data, opts, function(err) {
                if (err) {
                    hideImportOverlay();
                    reject(err);
                    return;
                }
                if (bulkImport && typeof setMapLoadingOverlayText === 'function') {
                    setMapLoadingOverlayText('Сохранение…');
                }
                requestAnimationFrame(function() {
                    (async function() {
                        try {
                            // skipSync: полный state уйдёт через POST /api/map (как восстановление),
                            // иначе debounce WS + reload может сохранить/прочитать устаревший кэш.
                            if (typeof saveData === 'function') {
                                saveData({ syncFull: true, skipSync: true });
                            }
                            var serialized = (typeof lastSavedState !== 'undefined' && Array.isArray(lastSavedState))
                                ? lastSavedState
                                : (typeof getSerializedData === 'function' ? getSerializedData() : null);
                            if (!Array.isArray(serialized)) {
                                throw new Error('Не удалось сериализовать карту для сохранения');
                            }
                            if (typeof setMapLoadingOverlayText === 'function') {
                                setMapLoadingOverlayText('Сохранение на сервер…');
                            }
                            try { window._skipMapRefreshUntilReload = true; } catch (eSkip) {}
                            await persistImportedMapToApi(serialized);
                            logAction(ActionTypes.IMPORT_DATA, { count: data.length, source: logSource || 'json' });
                            if (typeof setMapLoadingOverlayText === 'function') {
                                setMapLoadingOverlayText('Перезагрузка карты…');
                            }
                            showSuccess(
                                (successMsg || ('Карта импортирована (' + data.length + ' объектов)')) +
                                '. Перезагрузка карты организации…',
                                'Импорт'
                            );
                            setTimeout(function() { window.location.reload(); }, 600);
                            resolve();
                        } catch (saveErr) {
                            try { window._skipMapRefreshUntilReload = false; } catch (eClear) {}
                            hideImportOverlay();
                            reject(saveErr);
                        }
                    })();
                });
            });
        });
    }

    async function applyImportedMapData(data) {
        try {
            if (!Array.isArray(data)) {
                showError('Файл должен содержать массив объектов карты (JSON-массив).', 'Импорт');
                return;
            }

            if (objects.length > 0 && !(await showConfirm('Текущая карта будет полностью заменена импортируемыми данными. Продолжить?', 'Импорт', { confirmText: 'Продолжить' }))) {
                return;
            }

            // replace: importData сам вызовет clearMap
            await runImportData(data, {}, 'Карта импортирована (' + data.length + ' объектов)', 'json');
        } catch (error) {
            console.error('Ошибка при импорте файла:', error);
            showError(
                error && error.message
                    ? ('Ошибка импорта: ' + error.message)
                    : 'Ошибка при чтении файла. Проверьте, что выбран корректный JSON или .ned файл.',
                'Импорт'
            );
        } finally {
            fileInput.value = '';
        }
    }

    async function applyNedImportedMapData(data) {
        try {
            if (!Array.isArray(data) || data.length === 0) {
                showError('Конвертер NeD не вернул объектов.', 'Импорт NeD');
                return;
            }
            var extent = getImportGeoExtent(data);
            var useOriginalCoords;
            if (extent) {
                var choice = await showConfirm(
                    'Вставить ' + data.length + ' объектов? Существующие объекты не будут удалены.\n\n' +
                    'По координатам NeD — объекты встанут на свои реальные места (центр: ' +
                    extent.center[0].toFixed(4) + ', ' + extent.center[1].toFixed(4) + ').\n' +
                    'В центр вида — вся схема будет перенесена в центр текущего вида карты.',
                    'Импорт NeD',
                    { confirmText: 'По координатам NeD', cancelText: 'В центр вида', dismissValue: null, avatarEmotion: 'question' }
                );
                if (choice === null) return;
                useOriginalCoords = choice === true;
            } else {
                if (!(await showConfirm(
                    'В файле нет географических координат, поэтому ' + data.length +
                    ' объектов будут вставлены в центр текущего вида карты. Существующие объекты не будут удалены.',
                    'Импорт NeD',
                    { confirmText: 'Вставить' }
                ))) {
                    return;
                }
                useOriginalCoords = false;
            }
            if (!useOriginalCoords && (typeof myMap === 'undefined' || !myMap || typeof myMap.getCenter !== 'function')) {
                throw new Error('Карта не готова. Откройте карту и повторите импорт.');
            }
            remapImportUniqueIds(data);
            if (useOriginalCoords) {
                try {
                    sessionStorage.setItem(MAP_FOCUS_ONCE_KEY, JSON.stringify({ bounds: extent.bounds }));
                } catch (eStore) { /* без фокуса карта откроется на начальной точке */ }
            } else {
                shiftMapDataToCenter(data, myMap.getCenter());
            }
            await runImportData(
                data,
                { merge: true },
                'NeD вставлено: ' + data.length + ' объектов' + (useOriginalCoords ? ' (по координатам NeD)' : ' (центр вида)'),
                'ned'
            );
        } catch (error) {
            try { sessionStorage.removeItem(MAP_FOCUS_ONCE_KEY); } catch (eClear) { /* ignore */ }
            console.error('Ошибка импорта NeD:', error);
            showError(
                error && error.message ? error.message : 'Не удалось импортировать .ned',
                'Импорт NeD'
            );
        } finally {
            fileInput.value = '';
        }
    }

    if (nedMode) {
        (async function() {
            var overlayShown = false;
            try {
                if (typeof showUndoRedoLoadingOverlay === 'function') {
                    showUndoRedoLoadingOverlay('Конвертация NeD…');
                    overlayShown = true;
                }
                var data = await convertNedFileViaApi(file);
                if (overlayShown && typeof hideMapLoadingOverlay === 'function') {
                    hideMapLoadingOverlay();
                    overlayShown = false;
                }
                await applyNedImportedMapData(data);
            } catch (error) {
                if (overlayShown && typeof hideMapLoadingOverlay === 'function') hideMapLoadingOverlay();
                console.error('Ошибка импорта NeD:', error);
                showError(
                    error && error.message ? error.message : 'Не удалось импортировать .ned',
                    'Импорт NeD'
                );
                fileInput.value = '';
            }
        })();
        return;
    }

    const reader = new FileReader();
    reader.onload = function(ev) {
        (async function() {
        try {
            const raw = ev.target.result;
            const data = JSON.parse(raw);
            await applyImportedMapData(data);
        } catch (error) {
            console.error('Ошибка при импорте файла:', error);
            showError(
                error && error.message
                    ? ('Ошибка импорта: ' + error.message)
                    : 'Ошибка при чтении файла. Проверьте, что выбран корректный JSON-файл экспорта карты.',
                'Импорт'
            );
            fileInput.value = '';
        }
        })();
    };
    reader.readAsText(file);
}

/** Узкая ширина как у телефона: только просмотр (согласовано с app-mobile.css, 768px). */
function isNetworkMapMobileViewOnly() {
    try {
        return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
    } catch (e) {
        return false;
    }
}

function switchToViewMode(silent) {
    const wasEditMode = isEditMode;
    isEditMode = false;
    currentCableTool = false;
    copperCableLayingActive = false;
    cableSource = null;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    if (typeof clearCabinetCableSourceHighlight === 'function') clearCabinetCableSourceHighlight();
    cancelUndergroundSpanEdit();
    resetCableUndergroundLayingState(false);
    resetCableUndergroundPendingSpans();
    pendingCopperPortPreset = null;
    pendingCopperRouteFinish = null;
    if (typeof finishOltPortCableLayingSession === 'function') finishOltPortCableLayingSession();
    if (typeof finishRadioBridgePortCableLayingSession === 'function') finishRadioBridgePortCableLayingSession();

    if (objectPlacementMode) {
        cancelObjectPlacement();
    }
    
    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }

    if (cableSplitMode) {
        cancelCableSplitMode();
    }

    if (regionDrawMode && typeof cancelRegionDraw === 'function') cancelRegionDraw();
    
    if (wasEditMode && !silent) {
        showInfo('Переключено в режим просмотра', 'Режим');
    }
    
    removeCablePreview();
    updateUIForMode();
    
    clearSelection();

    if (hoveredObject) {
        clearHoverHighlight();
    }
    if (myMap && myMap.container) {
        const mapEl = myMap.container.getElement();
        mapEl.style.cursor = '';
        mapEl.classList.remove('map-crosshair-active');
    }
    
    updateEditControls();
    makeObjectsNonDraggable();
    syncMapPanLockForEditTools();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
    if (infoModalEditModeSession && currentModalObject) {
        infoModalEditMode = false;
        if (typeof releaseHeldObjectLock === 'function') releaseHeldObjectLock();
        if (typeof refreshObjectModal === 'function') refreshObjectModal(currentModalObject);
    }
}

function switchToEditMode() {
    
    if (!canEdit()) {
        showWarning('Редактирование доступно только администраторам', 'Нет доступа');
        return;
    }

    if (isNetworkMapMobileViewOnly()) {
        var inApp = false;
        try {
            inApp = window.__VOLSMAP_ANDROID__ === true
                || (window.VolsmapAndroid && typeof window.VolsmapAndroid.isApp === 'function' && window.VolsmapAndroid.isApp());
        } catch (e) {}
        showInfo(
            inApp
                ? 'В мобильном приложении доступен просмотр. Редактирование карты — с компьютера.'
                : 'На этом экране доступен только просмотр. Редактирование карты — с компьютера или планшета (ширина окна больше 768px).',
            'Режим'
        );
        return;
    }
    
    isEditMode = true;
    updateUIForMode();
    updateEditControls();
    makeObjectsDraggable();
    showInfo('Переключено в режим редактирования', 'Режим');
    syncMapPanLockForEditTools();
    if (typeof renderRegionsSidebarList === 'function') renderRegionsSidebarList();
}

function updateUIForMode() {
    const viewBtn = document.getElementById('viewMode');
    const editBtn = document.getElementById('editMode');
    const badge = document.getElementById('mapEditModeBadge');
    
    if (viewBtn) viewBtn.classList.toggle('active', !isEditMode);
    if (editBtn) editBtn.classList.toggle('active', isEditMode);

    document.body.classList.toggle('edit-mode-active', !!isEditMode);
    if (badge) {
        if (isEditMode) badge.removeAttribute('hidden');
        else badge.setAttribute('hidden', '');
    }
    if (typeof syncEditToolbarVisibility === 'function') syncEditToolbarVisibility();

    if (myMap && myMap.container) {
        const mapEl = myMap.container.getElement();
        if (mapEl) {
            mapEl.classList.toggle('map-edit-mode', !!isEditMode);
            if (!isEditMode) {
                mapEl.classList.remove('map-crosshair-active');
                mapEl.style.cursor = '';
            }
        }
    }
}

function updateEditControls() {
    const editControls = document.querySelectorAll('#addObject, #addCable, #drawRegionBtn');
    const hint = 'Включите режим «Редактирование»';
    editControls.forEach(control => {
        const locked = !isEditMode;
        control.classList.toggle('is-edit-locked', locked);
        control.style.opacity = '';
        control.style.pointerEvents = '';
        if (locked) {
            control.setAttribute('title', hint);
            control.setAttribute('aria-disabled', 'true');
        } else {
            control.removeAttribute('aria-disabled');
            if (control.getAttribute('title') === hint) control.removeAttribute('title');
        }
    });
}

function makeObjectsDraggable() {
    objects.forEach(obj => {
        if (!obj.options || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cable' || t === 'region') return;
        obj.options.set('draggable', true);
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
}

function makeObjectsNonDraggable() {
    objects.forEach(obj => {
        if (!obj.options || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cable' || t === 'region') return;
        obj.options.set('draggable', false);
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
}

function getNodeColorByKind(nodeKind) {
    if (window.MapIcons && typeof MapIcons.getNodeColor === 'function') {
        return MapIcons.getNodeColor(nodeKind);
    }
    return nodeKind === 'aggregation' ? '#e85d5d' : '#2fbf66';
}

function buildMapPlacemarkIcon(type, variant, source) {
    if (!window.MapIcons) return null;
    var opts = { variant: variant || 'normal' };
    if (type === 'node') {
        if (source && source.properties) {
            opts.nodeKind = source.properties.get('nodeKind') || 'network';
        } else if (source && source.nodeKind) {
            opts.nodeKind = source.nodeKind;
        } else if (typeof currentPlacementNodeKind === 'string') {
            opts.nodeKind = currentPlacementNodeKind;
        } else {
            var nodeKindSelect = document.getElementById('nodeKind');
            opts.nodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
        }
    }
    if (type === 'crossGroup') {
        if (source && source.properties) {
            var crossGroup = source.properties.get('crossGroup');
            opts.groupCount = crossGroup ? crossGroup.length : 1;
        } else if (source && source.groupCount != null) {
            opts.groupCount = source.groupCount;
        }
    }
    if (type === 'nodeGroup') {
        if (source && source.properties) {
            var nodeGroup = source.properties.get('nodeGroup');
            opts.groupCount = nodeGroup ? nodeGroup.length : 1;
            var displayNodes = source.properties.get('displayNodes');
            if (displayNodes && displayNodes.length) {
                opts.hasAggregation = displayNodes.some(function (nd) {
                    return nd.properties && nd.properties.get('nodeKind') === 'aggregation';
                });
            }
        } else if (source) {
            if (source.groupCount != null) opts.groupCount = source.groupCount;
            if (source.hasAggregation) opts.hasAggregation = true;
        }
    }
    if (type === 'camera' && source && source.properties && window.CameraPlayer) {
        opts.cameraOnline = CameraPlayer.isCameraOnline(source);
    }
    if (source && source.properties && window.ZabbixStatus && typeof ZabbixStatus.getForPlacemark === 'function') {
        var zx = ZabbixStatus.getForPlacemark(source);
        if (zx && zx.matched) opts.zabbixSeverity = zx.severity;
    }
    return MapIcons.buildPlacemarkIcon(type, opts);
}

function applyMapPlacemarkIcon(target, type, variant, source) {
    var icon = buildMapPlacemarkIcon(type, variant, source);
    if (!icon) return null;
    if (target && target.options) {
        target.options.set({
            iconImageHref: icon.href,
            iconImageSize: icon.iconImageSize,
            iconImageOffset: icon.iconImageOffset
        });
    }
    return icon;
}

/** Пересобрать SVG-иконки на карте после смены светлой/тёмной темы. */
function refreshMapPlacemarkIcons() {
    if (!window.MapIcons || typeof objects === 'undefined') return;

    var hoverIconTypes = ['support', 'sleeve', 'spliceCassette', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment', 'manhole', 'signalPost', 'cabinet'];

    objects.forEach(function(obj) {
        if (!obj || !obj.properties || !obj.options) return;
        var type = obj.properties.get('type');
        if (!type || type === 'cable' || type === 'cableLabel') return;
        var variant = 'normal';
        if (selectedObjects.indexOf(obj) >= 0) {
            if (!(isEditMode && type !== 'crossGroup' && type !== 'nodeGroup')) {
                variant = 'selected';
            }
        }
        if (hoveredObject === obj && hoverIconTypes.indexOf(type) >= 0) {
            variant = 'hover';
        }
        applyMapPlacemarkIcon(obj, type, variant, obj);
    });

    if (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks)) {
        crossGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            var variant = selectedObjects.indexOf(pm) >= 0 ? 'selected' : 'normal';
            if (hoveredObject === pm) variant = 'hover';
            applyMapPlacemarkIcon(pm, 'crossGroup', variant, pm);
        });
    }
    if (typeof nodeGroupPlacemarks !== 'undefined' && Array.isArray(nodeGroupPlacemarks)) {
        nodeGroupPlacemarks.forEach(function(pm) {
            if (!pm || !pm.options) return;
            var variant = selectedObjects.indexOf(pm) >= 0 ? 'selected' : 'normal';
            if (hoveredObject === pm) variant = 'hover';
            applyMapPlacemarkIcon(pm, 'nodeGroup', variant, pm);
        });
    }

    if (phantomPlacemark && phantomPlacemark.properties && phantomPlacemark.options) {
        var phantomType = phantomPlacemark.properties.get('phantomType');
        if (phantomType) {
            var phantomIcon = buildMapPlacemarkIcon(phantomType, 'phantom', phantomType === 'node' ? { nodeKind: currentPlacementNodeKind } : null);
            if (phantomIcon) {
                phantomPlacemark.options.set({
                    iconImageHref: phantomIcon.href,
                    iconImageSize: phantomIcon.iconImageSize,
                    iconImageOffset: phantomIcon.iconImageOffset
                });
            }
        }
    }

    var infoModal = document.getElementById('infoModal');
    if (currentModalObject && isInfoModalVisible(infoModal) && typeof updateInfoModalChrome === 'function') {
        var modalType = currentModalObject.properties.get('type');
        var modalName = currentModalObject.properties.get('name') || '';
        var fiberWs = false;
        if (isFiberHostType(modalType) && typeof getConnectedCables === 'function') {
            fiberWs = getConnectedCables(currentModalObject).length >= 1;
        }
        updateInfoModalChrome(modalType, modalName, { fiberWorkspace: fiberWs });
        var modalBody = document.getElementById('modalInfo');
        if (modalBody && window.MapIcons) {
            modalBody.querySelectorAll('.camera-card-hero-icon, .olt-card-hero-icon, .cassette-card-hero-icon, .support-card-hero-icon, .node-card-hero-icon, .fiber-ws-head-icon').forEach(function(el) {
                var card = el.closest('.camera-card, .olt-card, .support-card, .fiber-workspace-sidebar');
                if (!card) return;
                var iconType = modalType;
                if (card.classList.contains('support-card--attachment')) iconType = 'attachment';
                else if (card.classList.contains('fiber-workspace-sidebar')) {
                    iconType = currentModalObject.properties.get('type');
                }
                var iconOpts = { variant: 'normal' };
                if (iconType === 'node' && currentModalObject.properties) {
                    iconOpts.nodeKind = currentModalObject.properties.get('nodeKind') || 'network';
                }
                if (iconType === 'camera' && window.CameraPlayer) {
                    iconOpts.cameraOnline = CameraPlayer.isCameraOnline(currentModalObject);
                }
                el.innerHTML = MapIcons.buildIconSvg(iconType, iconOpts);
            });
        }
    }
}
