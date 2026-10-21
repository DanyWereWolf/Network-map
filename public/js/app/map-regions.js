/**
 * Логические регионы-разделы карты: выбор при загрузке, переключение, перенос выделенных.
 */
(function (global) {
    var MAP_REGION_SOFT_LIMIT = 10000;
    var MAP_REGION_SOFT_WARN_AT = 9000;
    var _regionsCache = null;
    var _pickerResolve = null;
    var _lastSoftWarnKey = '';

    function getAuthHeaders() {
        var h = { 'Content-Type': 'application/json' };
        var token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        if (token) h.Authorization = 'Bearer ' + token;
        return h;
    }

    function apiBase() {
        return typeof getApiBase === 'function' ? getApiBase() : '';
    }

    function getCurrentMapRegionId() {
        return global.currentMapRegionId ? String(global.currentMapRegionId) : '';
    }

    function setCurrentMapRegionId(id) {
        global.currentMapRegionId = id ? String(id) : null;
        try {
            updateMapRegionChip();
        } catch (e) {}
    }

    function softWarnForCount(count) {
        var n = count | 0;
        if (n >= MAP_REGION_SOFT_LIMIT) {
            return {
                level: 'danger',
                text: 'В регионе уже ' + n + ' объектов (рекомендуемый максимум ' + MAP_REGION_SOFT_LIMIT + '). Создайте ещё один регион и перенесите часть объектов.'
            };
        }
        if (n >= MAP_REGION_SOFT_WARN_AT) {
            return {
                level: 'warn',
                text: 'В регионе почти ' + MAP_REGION_SOFT_LIMIT + ' объектов (' + n + '). Рекомендуем создать ещё один регион.'
            };
        }
        return null;
    }

    function maybeShowSoftWarn(warn, force) {
        if (!warn || !warn.text) return;
        var key = (warn.level || '') + ':' + warn.text;
        if (!force && key === _lastSoftWarnKey) return;
        _lastSoftWarnKey = key;
        if (typeof showNotification === 'function') {
            showNotification(warn.text, warn.level === 'danger' ? 'error' : 'warning');
        }
    }

    function fetchMapRegions() {
        var base = apiBase();
        if (!base) return Promise.resolve(null);
        return fetch(base.replace(/\/$/, '') + '/api/map-regions', { headers: getAuthHeaders() })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                if (body && Array.isArray(body.regions)) {
                    _regionsCache = body;
                }
                return body;
            });
    }

    function getCachedRegions() {
        return _regionsCache;
    }

    function ensurePickerDom() {
        var el = document.getElementById('mapRegionPickerModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'mapRegionPickerModal';
        el.className = 'modal map-region-picker-modal';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'mapRegionPickerTitle');
        el.style.display = 'none';
        el.innerHTML =
            '<div class="modal-content map-region-picker-content">' +
            '  <div class="modal-header"><h2 id="mapRegionPickerTitle">Выберите регион</h2></div>' +
            '  <div class="modal-body">' +
            '    <p class="map-region-picker-hint">Карта загружается по регионам (до ~10&nbsp;000 объектов в каждом). Выберите регион для работы.</p>' +
            '    <div id="mapRegionPickerList" class="map-region-picker-list" role="listbox" aria-label="Регионы карты"></div>' +
            '    <div class="map-region-picker-create" id="mapRegionPickerCreateWrap" hidden>' +
            '      <input type="text" id="mapRegionPickerNewName" class="modal-input" maxlength="80" placeholder="Имя нового региона" />' +
            '      <button type="button" id="mapRegionPickerCreateBtn" class="btn-secondary">Создать</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="modal-footer map-region-picker-actions">' +
            '    <label class="map-region-picker-default"><input type="checkbox" id="mapRegionPickerSetDefault" /> Сделать выбранный регионом по умолчанию</label>' +
            '    <button type="button" id="mapRegionPickerOpenBtn" class="btn-primary" disabled>Открыть</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(el);
        var selectedId = null;
        function renderList(payload) {
            var list = document.getElementById('mapRegionPickerList');
            if (!list) return;
            list.innerHTML = '';
            var regions = (payload && payload.regions) || [];
            var defId = payload && payload.defaultMapRegionId;
            if (!selectedId && defId) selectedId = String(defId);
            if (!selectedId && regions[0]) selectedId = String(regions[0].id);
            regions.forEach(function (r) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'map-region-picker-item' + (String(r.id) === String(selectedId) ? ' is-selected' : '');
                btn.setAttribute('role', 'option');
                btn.setAttribute('aria-selected', String(r.id) === String(selectedId) ? 'true' : 'false');
                btn.dataset.regionId = r.id;
                var count = r.objectCount != null ? r.objectCount : 0;
                var warn = r.softWarn ? ' <span class="map-region-picker-warn">⚠️</span>' : '';
                btn.innerHTML = '<span class="map-region-picker-name"></span><span class="map-region-picker-count">' + count + ' объект.</span>' + warn;
                btn.querySelector('.map-region-picker-name').textContent = r.name || 'Регион';
                btn.addEventListener('click', function () {
                    selectedId = String(r.id);
                    renderList(payload);
                    var openBtn = document.getElementById('mapRegionPickerOpenBtn');
                    if (openBtn) openBtn.disabled = !selectedId;
                });
                list.appendChild(btn);
            });
            var openBtn = document.getElementById('mapRegionPickerOpenBtn');
            if (openBtn) openBtn.disabled = !selectedId;
        }
        el._renderList = renderList;
        el._getSelectedId = function () { return selectedId; };
        el._setSelectedId = function (id) { selectedId = id; };

        document.getElementById('mapRegionPickerOpenBtn').addEventListener('click', function () {
            var id = selectedId;
            if (!id) return;
            var setDef = document.getElementById('mapRegionPickerSetDefault');
            var wantDefault = !!(setDef && setDef.checked);
            var finish = function () {
                hidePicker();
                if (_pickerResolve) {
                    var resolve = _pickerResolve;
                    _pickerResolve = null;
                    resolve(id);
                }
            };
            if (wantDefault) {
                fetch(apiBase().replace(/\/$/, '') + '/api/map-regions/' + encodeURIComponent(id), {
                    method: 'PATCH',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ setAsDefault: true })
                }).then(function () { finish(); }).catch(function () { finish(); });
            } else {
                finish();
            }
        });

        var createBtn = document.getElementById('mapRegionPickerCreateBtn');
        if (createBtn) {
            createBtn.addEventListener('click', function () {
                var input = document.getElementById('mapRegionPickerNewName');
                var name = input ? String(input.value || '').trim() : '';
                fetch(apiBase().replace(/\/$/, '') + '/api/map-regions', {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ name: name || undefined })
                }).then(function (r) { return r.json(); }).then(function (body) {
                    if (body && body.regions) {
                        _regionsCache = body.regions.regions ? body.regions : body;
                        if (body.regions && body.regions.regions) _regionsCache = body.regions;
                        else if (body.region && body.regions) {
                            _regionsCache = body.regions;
                            if (body.region.id) selectedId = String(body.region.id);
                        }
                        fetchMapRegions().then(function (p) {
                            renderList(p);
                            if (input) input.value = '';
                        });
                    }
                }).catch(function () {});
            });
        }
        return el;
    }

    function showPicker(payload, opts) {
        opts = opts || {};
        var el = ensurePickerDom();
        var createWrap = document.getElementById('mapRegionPickerCreateWrap');
        var isAdmin = false;
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') isAdmin = true;
        } catch (e) {}
        if (createWrap) {
            if (isAdmin && !opts.hideCreate) createWrap.removeAttribute('hidden');
            else createWrap.setAttribute('hidden', '');
        }
        var title = document.getElementById('mapRegionPickerTitle');
        if (title) title.textContent = opts.title || 'Выберите регион';
        if (payload && payload.defaultMapRegionId) el._setSelectedId(String(payload.defaultMapRegionId));
        el._renderList(payload || { regions: [] });
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
    }

    function hidePicker() {
        var el = document.getElementById('mapRegionPickerModal');
        if (!el) return;
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    /** Обязательный выбор региона перед загрузкой карты. */
    function chooseMapRegionBeforeLoad() {
        return fetchMapRegions().then(function (payload) {
            if (!payload || !Array.isArray(payload.regions) || !payload.regions.length) {
                return Promise.reject(new Error('Не удалось получить список регионов'));
            }
            return new Promise(function (resolve) {
                _pickerResolve = resolve;
                showPicker(payload, { title: 'Выберите регион для работы' });
            });
        });
    }

    function updateMapRegionChip() {
        var chip = document.getElementById('mapRegionCurrentChip');
        if (!chip) return;
        var id = getCurrentMapRegionId();
        var name = 'Регион';
        var cache = _regionsCache;
        var regions = cache && cache.regions ? cache.regions : [];
        for (var i = 0; i < regions.length; i++) {
            if (String(regions[i].id) === id) {
                name = regions[i].name || name;
                break;
            }
        }
        chip.textContent = name;
        chip.title = 'Текущий регион: ' + name + ' (нажмите, чтобы сменить)';
        chip.hidden = !id;
    }

    function switchMapRegionInteractive() {
        return fetchMapRegions().then(function (payload) {
            return new Promise(function (resolve) {
                _pickerResolve = function (id) {
                    if (String(id) === getCurrentMapRegionId()) {
                        resolve(false);
                        return;
                    }
                    switchToMapRegion(id).then(function () { resolve(true); }).catch(function () { resolve(false); });
                };
                showPicker(payload, { title: 'Сменить регион' });
            });
        });
    }

    function clearLocalMapForRegionSwitch() {
        if (typeof clearSelection === 'function') {
            try { clearSelection(); } catch (e) {}
        }
        if (typeof clearMap === 'function') {
            try { clearMap({ skipSave: true }); } catch (e2) {
                // fallback: снять объекты с карты вручную
                if (typeof objects !== 'undefined' && Array.isArray(objects) && typeof myMap !== 'undefined' && myMap) {
                    while (objects.length) {
                        var o = objects.pop();
                        try { myMap.geoObjects.remove(o); } catch (e3) {}
                    }
                }
            }
        }
    }

    function switchToMapRegion(regionId) {
        var rid = regionId != null ? String(regionId) : '';
        if (!rid) return Promise.reject(new Error('regionId required'));
        if (typeof saveData === 'function') {
            try { saveData({ skipSync: false, syncFull: true }); } catch (eSave) {}
        }
        clearLocalMapForRegionSwitch();
        setCurrentMapRegionId(rid);
        _lastSoftWarnKey = '';
        return loadMapDataForCurrentRegion({ forceFull: true });
    }

    function loadMapDataForCurrentRegion(meta) {
        meta = meta || {};
        var token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        var rid = getCurrentMapRegionId();
        if (!rid) return Promise.resolve(false);
        var url = apiBase().replace(/\/$/, '') + '/api/map?regionId=' + encodeURIComponent(rid);
        return fetch(url, { headers: { Authorization: 'Bearer ' + token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                if (!body || !Array.isArray(body.data)) return false;
                if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                    global._mapOrgIdLoaded = String(currentUser.organizationId);
                }
                if (body.softWarn) maybeShowSoftWarn(body.softWarn, true);
                else maybeShowSoftWarn(softWarnForCount(body.objectCount || body.data.length), true);
                if (typeof applyRemoteState === 'function') {
                    applyRemoteState(body.data, {
                        fromApi: true,
                        organizationId: body.organizationId,
                        forceFull: !!meta.forceFull,
                        mapRegionId: rid
                    });
                }
                return true;
            });
    }

    function tagObjectWithCurrentRegion(obj) {
        if (!obj || !obj.properties) return;
        var rid = getCurrentMapRegionId();
        if (!rid) return;
        try {
            if (!obj.properties.get('mapRegionId')) {
                obj.properties.set('mapRegionId', rid);
            }
        } catch (e) {}
    }

    function applyMapRegionIdToSerialized(item) {
        if (!item || typeof item !== 'object') return item;
        var rid = getCurrentMapRegionId();
        if (rid && !item.mapRegionId) item.mapRegionId = rid;
        return item;
    }

    function moveSelectedObjectsToRegion(targetRegionId) {
        var tid = targetRegionId != null ? String(targetRegionId) : '';
        if (!tid) return Promise.reject(new Error('Укажите регион'));
        if (typeof selectedObjects === 'undefined' || !selectedObjects || !selectedObjects.length) {
            return Promise.reject(new Error('Нет выделенных объектов'));
        }
        var uniqueIds = [];
        var objs = selectedObjects.slice();
        objs.forEach(function (o) {
            if (!o || !o.properties) return;
            var t = o.properties.get('type');
            if (t === 'cableLabel' || t === 'zoneLabel' || t === 'regionLabel') return;
            var uid = o.properties.get('uniqueId');
            if (uid != null && uid !== '') uniqueIds.push(String(uid));
        });
        if (!uniqueIds.length) return Promise.reject(new Error('Нет объектов для переноса'));
        return fetch(apiBase().replace(/\/$/, '') + '/api/map/move-to-region', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ uniqueIds: uniqueIds, targetRegionId: tid })
        }).then(function (r) { return r.json().then(function (b) { return { ok: r.ok, body: b }; }); })
            .then(function (res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Не удалось перенести');
                // Убрать с текущей карты объекты, ушедшие в другой регион
                objs.forEach(function (o) {
                    if (!o || !o.properties) return;
                    var uid = o.properties.get('uniqueId');
                    if (uid == null || uniqueIds.indexOf(String(uid)) < 0) return;
                    if (typeof deselectObject === 'function') {
                        try { deselectObject(o); } catch (eD) {}
                    }
                    if (typeof myMap !== 'undefined' && myMap) {
                        try { myMap.geoObjects.remove(o); } catch (eR) {}
                    }
                    if (typeof objects !== 'undefined' && Array.isArray(objects)) {
                        var ix = objects.indexOf(o);
                        if (ix >= 0) objects.splice(ix, 1);
                    }
                });
                if (typeof saveData === 'function') {
                    try { saveData({ skipSync: false, syncFull: true }); } catch (eS) {}
                }
                if (res.body && res.body.result && res.body.result.softWarn) {
                    maybeShowSoftWarn(res.body.result.softWarn, true);
                }
                if (typeof showNotification === 'function') {
                    showNotification('Перенесено объектов: ' + (res.body.result && res.body.result.moved != null ? res.body.result.moved : uniqueIds.length), 'success');
                }
                return res.body;
            });
    }

    function showMoveSelectedToRegionModal() {
        if (typeof selectedObjects === 'undefined' || !selectedObjects || !selectedObjects.length) {
            if (typeof showNotification === 'function') showNotification('Сначала выделите объекты', 'warning');
            return;
        }
        fetchMapRegions().then(function (payload) {
            var regions = (payload && payload.regions) || [];
            var cur = getCurrentMapRegionId();
            var others = regions.filter(function (r) { return String(r.id) !== String(cur); });
            if (!others.length) {
                if (typeof showNotification === 'function') {
                    showNotification('Создайте ещё один регион, чтобы переносить объекты', 'warning');
                }
                return;
            }
            var existing = document.getElementById('mapRegionMoveModal');
            if (existing) existing.remove();
            var modal = document.createElement('div');
            modal.id = 'mapRegionMoveModal';
            modal.className = 'modal';
            modal.style.display = 'flex';
            modal.setAttribute('role', 'dialog');
            var options = others.map(function (r) {
                return '<option value="' + String(r.id).replace(/"/g, '&quot;') + '">' +
                    String(r.name || 'Регион').replace(/</g, '&lt;') +
                    ' (' + (r.objectCount || 0) + ')</option>';
            }).join('');
            modal.innerHTML =
                '<div class="modal-content">' +
                '  <div class="modal-header"><h2>Перенести в регион</h2><span class="close" id="mapRegionMoveClose">&times;</span></div>' +
                '  <div class="modal-body"><p>Выделено: ' + selectedObjects.length + '</p>' +
                '  <label>Регион назначения<select id="mapRegionMoveSelect" class="modal-input">' + options + '</select></label></div>' +
                '  <div class="modal-footer"><button type="button" class="btn-secondary" id="mapRegionMoveCancel">Отмена</button>' +
                '  <button type="button" class="btn-primary" id="mapRegionMoveOk">Перенести</button></div>' +
                '</div>';
            document.body.appendChild(modal);
            function close() { modal.remove(); }
            document.getElementById('mapRegionMoveClose').onclick = close;
            document.getElementById('mapRegionMoveCancel').onclick = close;
            document.getElementById('mapRegionMoveOk').onclick = function () {
                var sel = document.getElementById('mapRegionMoveSelect');
                var tid = sel ? sel.value : '';
                close();
                moveSelectedObjectsToRegion(tid).catch(function (err) {
                    if (typeof showNotification === 'function') {
                        showNotification(err && err.message ? err.message : 'Ошибка переноса', 'error');
                    }
                });
            };
        });
    }

    function initMapRegionUi() {
        var chip = document.getElementById('mapRegionCurrentChip');
        if (chip) {
            chip.addEventListener('click', function () {
                switchMapRegionInteractive();
            });
        }
        var moveBtn = document.getElementById('moveSelectedToRegionBtn');
        if (moveBtn) {
            moveBtn.addEventListener('click', function () {
                showMoveSelectedToRegionModal();
            });
        }
        updateMapRegionChip();
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMapRegionUi);
        } else {
            setTimeout(initMapRegionUi, 0);
        }
    }

    global.MapRegionsPartition = {
        MAP_REGION_SOFT_LIMIT: MAP_REGION_SOFT_LIMIT,
        getCurrentMapRegionId: getCurrentMapRegionId,
        setCurrentMapRegionId: setCurrentMapRegionId,
        fetchMapRegions: fetchMapRegions,
        getCachedRegions: getCachedRegions,
        chooseMapRegionBeforeLoad: chooseMapRegionBeforeLoad,
        switchToMapRegion: switchToMapRegion,
        switchMapRegionInteractive: switchMapRegionInteractive,
        loadMapDataForCurrentRegion: loadMapDataForCurrentRegion,
        tagObjectWithCurrentRegion: tagObjectWithCurrentRegion,
        applyMapRegionIdToSerialized: applyMapRegionIdToSerialized,
        moveSelectedObjectsToRegion: moveSelectedObjectsToRegion,
        showMoveSelectedToRegionModal: showMoveSelectedToRegionModal,
        maybeShowSoftWarn: maybeShowSoftWarn,
        softWarnForCount: softWarnForCount,
        updateMapRegionChip: updateMapRegionChip
    };
    global.getCurrentMapRegionId = getCurrentMapRegionId;
    global.setCurrentMapRegionId = setCurrentMapRegionId;
    global.chooseMapRegionBeforeLoad = chooseMapRegionBeforeLoad;
    global.switchMapRegionInteractive = switchMapRegionInteractive;
    global.showMoveSelectedToRegionModal = showMoveSelectedToRegionModal;
})(typeof window !== 'undefined' ? window : this);
