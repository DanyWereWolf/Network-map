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
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token) {
            return Promise.reject(new Error('Нет токена авторизации — войдите снова'));
        }
        return fetch(base.replace(/\/$/, '') + '/api/map-regions', { headers: getAuthHeaders() })
            .then(function (r) {
                if (r.status === 401) {
                    if (typeof handleSessionExpired === 'function') {
                        handleSessionExpired('Сессия истекла. Войдите снова.');
                    }
                    throw new Error('Сессия истекла. Войдите снова.');
                }
                if (!r.ok) return null;
                return r.json();
            })
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

    function enhanceDynamicModal(modal) {
        if (!modal) return;
        if (typeof window.refreshModalGlass === 'function') {
            try { window.refreshModalGlass(modal); } catch (eGlass) {}
        } else if (typeof window.initPanelPlexusCanvases === 'function') {
            try { window.initPanelPlexusCanvases(modal); } catch (ePlexus) {}
        }
    }

    function ensurePickerDom() {
        var el = document.getElementById('mapRegionPickerModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'mapRegionPickerModal';
        el.className = 'modal modal--centered map-region-picker-modal';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'mapRegionPickerTitle');
        el.style.display = 'none';
        el.innerHTML =
            '<div class="modal-content panel-glass panel-glass--lite map-region-picker-content">' +
            '  <div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>' +
            '  <div class="modal-header map-region-picker-header">' +
            '    <div class="map-region-picker-header__main">' +
            '      <div class="map-region-picker-header__icon" aria-hidden="true">' +
            '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon>' +
            '          <line x1="9" y1="3" x2="9" y2="18"></line>' +
            '          <line x1="15" y1="6" x2="15" y2="21"></line>' +
            '        </svg>' +
            '      </div>' +
            '      <div class="map-region-picker-header__text">' +
            '        <h2 id="mapRegionPickerTitle">Выберите регион</h2>' +
            '        <p class="map-region-picker-header__sub" id="mapRegionPickerSub">Карта загружается по регионам</p>' +
            '      </div>' +
            '    </div>' +
            '    <span class="close" id="mapRegionPickerClose" role="button" tabindex="0" aria-label="Закрыть" hidden>&times;</span>' +
            '  </div>' +
            '  <div class="modal-body map-region-picker-body">' +
            '    <p class="map-region-picker-hint">До ~10&nbsp;000 объектов в каждом. Выберите регион — карта откроется только с его данными.</p>' +
            '    <div id="mapRegionPickerList" class="map-region-picker-list" role="listbox" aria-label="Регионы карты"></div>' +
            '    <div class="map-region-picker-create" id="mapRegionPickerCreateWrap" hidden>' +
            '      <div class="map-region-picker-create__label">Новый регион</div>' +
            '      <div class="map-region-picker-create__row">' +
            '        <input type="text" id="mapRegionPickerNewName" class="form-input" maxlength="80" placeholder="Название региона" autocomplete="off" />' +
            '        <button type="button" id="mapRegionPickerCreateBtn" class="btn-secondary map-region-picker-create__btn">Создать</button>' +
            '      </div>' +
            '    </div>' +
            '    <label class="map-region-picker-default" title="При следующем входе этот регион откроется сразу">' +
            '      <input type="checkbox" id="mapRegionPickerSetDefault" />' +
            '      <span class="map-region-picker-default__box" aria-hidden="true">' +
            '        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
            '      </span>' +
            '      <span class="map-region-picker-default__text">' +
            '        <span class="map-region-picker-default__title">Регион по умолчанию</span>' +
            '        <span class="map-region-picker-default__hint">открывать выбранный при входе</span>' +
            '      </span>' +
            '    </label>' +
            '  </div>' +
            '  <div class="map-region-picker-actions">' +
            '    <button type="button" id="mapRegionPickerOpenBtn" class="btn-primary map-region-picker-open" disabled>' +
            '      <span>Открыть карту</span>' +
            '      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M5 12h14"></path><path d="M13 5l7 7-7 7"></path></svg>' +
            '    </button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(el);
        var selectedId = null;
        function pluralObjects(n) {
            var mod10 = n % 10;
            var mod100 = n % 100;
            if (mod10 === 1 && mod100 !== 11) return n + ' объект';
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return n + ' объекта';
            return n + ' объектов';
        }
        function renderList(payload) {
            var list = document.getElementById('mapRegionPickerList');
            if (!list) return;
            list.innerHTML = '';
            var regions = (payload && payload.regions) || [];
            var defId = payload && payload.defaultMapRegionId;
            if (!selectedId && defId) selectedId = String(defId);
            if (!selectedId && regions[0]) selectedId = String(regions[0].id);
            regions.forEach(function (r, idx) {
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'map-region-picker-item' + (String(r.id) === String(selectedId) ? ' is-selected' : '');
                btn.setAttribute('role', 'option');
                btn.setAttribute('aria-selected', String(r.id) === String(selectedId) ? 'true' : 'false');
                btn.dataset.regionId = r.id;
                btn.style.setProperty('--item-i', String(idx));
                var count = r.objectCount != null ? r.objectCount : 0;
                var isDefault = defId && String(r.id) === String(defId);
                var badges = '';
                if (isDefault) {
                    badges += '<span class="map-region-picker-badge map-region-picker-badge--default">по умолчанию</span>';
                }
                if (r.softWarn) {
                    badges += '<span class="map-region-picker-badge map-region-picker-badge--warn">почти лимит</span>';
                    btn.classList.add('map-region-picker-item--warn');
                }
                btn.innerHTML =
                    '<span class="map-region-picker-item__icon" aria-hidden="true">' +
                    '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon>' +
                    '    <line x1="9" y1="3" x2="9" y2="18"></line>' +
                    '    <line x1="15" y1="6" x2="15" y2="21"></line>' +
                    '  </svg>' +
                    '</span>' +
                    '<span class="map-region-picker-item__info">' +
                    '  <span class="map-region-picker-name"></span>' +
                    '  <span class="map-region-picker-meta-row">' +
                    '    <span class="map-region-picker-count"></span>' +
                    badges +
                    '  </span>' +
                    '</span>' +
                    '<span class="map-region-picker-item__check" aria-hidden="true">' +
                    '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
                    '</span>';
                btn.querySelector('.map-region-picker-name').textContent = r.name || 'Регион';
                btn.querySelector('.map-region-picker-count').textContent = pluralObjects(count);
                btn.addEventListener('click', function () {
                    selectedId = String(r.id);
                    renderList(payload);
                    var openBtn = document.getElementById('mapRegionPickerOpenBtn');
                    if (openBtn) openBtn.disabled = !selectedId;
                });
                btn.addEventListener('dblclick', function () {
                    selectedId = String(r.id);
                    var openBtn = document.getElementById('mapRegionPickerOpenBtn');
                    if (openBtn && !openBtn.disabled) openBtn.click();
                });
                list.appendChild(btn);
            });
            var openBtn = document.getElementById('mapRegionPickerOpenBtn');
            if (openBtn) openBtn.disabled = !selectedId;
        }
        el._renderList = renderList;
        el._getSelectedId = function () { return selectedId; };
        el._setSelectedId = function (id) { selectedId = id; };
        el._allowDismiss = false;

        function dismissPicker() {
            if (!el._allowDismiss) return;
            hidePicker();
            if (_pickerResolve) {
                var resolve = _pickerResolve;
                _pickerResolve = null;
                var cur = getCurrentMapRegionId();
                resolve(cur || selectedId);
            }
        }
        el._dismissPicker = dismissPicker;

        var closeBtn = document.getElementById('mapRegionPickerClose');
        if (closeBtn) {
            closeBtn.addEventListener('click', dismissPicker);
            closeBtn.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dismissPicker();
                }
            });
        }
        el.addEventListener('click', function (e) {
            if (e.target === el) dismissPicker();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!el || el.style.display === 'none') return;
            dismissPicker();
        });

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
        var sub = document.getElementById('mapRegionPickerSub');
        if (sub) {
            sub.textContent = opts.subtitle || 'Карта загружается по регионам';
        }
        var allowDismiss = !!opts.allowDismiss;
        el._allowDismiss = allowDismiss;
        var closeBtn = document.getElementById('mapRegionPickerClose');
        if (closeBtn) {
            if (allowDismiss) closeBtn.removeAttribute('hidden');
            else closeBtn.setAttribute('hidden', '');
        }
        if (payload && payload.defaultMapRegionId) el._setSelectedId(String(payload.defaultMapRegionId));
        el._renderList(payload || { regions: [] });
        global._mapRegionPickerAwaiting = true;
        if (typeof setMapLoadingOverlayText === 'function') {
            try { setMapLoadingOverlayText('Выбор региона…'); } catch (eTxt) {}
        }
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
        enhanceDynamicModal(el);
    }

    function hidePicker() {
        var el = document.getElementById('mapRegionPickerModal');
        global._mapRegionPickerAwaiting = false;
        if (!el) return;
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }

    /** Обязательный выбор региона перед загрузкой карты. */
    function chooseMapRegionBeforeLoad() {
        var existing = getCurrentMapRegionId();
        if (existing) return Promise.resolve(existing);
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token) {
            return Promise.reject(new Error('Требуется вход в аккаунт'));
        }
        return fetchMapRegions().then(function (payload) {
            if (!payload || !Array.isArray(payload.regions) || !payload.regions.length) {
                return Promise.reject(new Error('Не удалось получить список регионов'));
            }
            if (payload.regions.length === 1 && payload.regions[0] && payload.regions[0].id) {
                var onlyId = String(payload.regions[0].id);
                setCurrentMapRegionId(onlyId);
                return onlyId;
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
        var label = chip.querySelector('.map-region-current-chip__label');
        if (label) label.textContent = name;
        else chip.textContent = name;
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
                showPicker(payload, {
                    title: 'Сменить регион',
                    subtitle: 'Откроется карта выбранного региона',
                    allowDismiss: true
                });
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
            modal.className = 'modal modal--centered map-region-move-modal';
            modal.style.display = 'none';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'mapRegionMoveTitle');
            var options = others.map(function (r) {
                return '<option value="' + String(r.id).replace(/"/g, '&quot;') + '">' +
                    String(r.name || 'Регион').replace(/</g, '&lt;') +
                    ' (' + (r.objectCount || 0) + ')</option>';
            }).join('');
            modal.innerHTML =
                '<div class="modal-content panel-glass panel-glass--lite map-region-move-content">' +
                '  <div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>' +
                '  <div class="modal-header map-region-picker-header">' +
                '    <div class="map-region-picker-header__main">' +
                '      <div class="map-region-picker-header__icon" aria-hidden="true">' +
                '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '          <path d="M5 12h14"></path><path d="M13 5l7 7-7 7"></path>' +
                '        </svg>' +
                '      </div>' +
                '      <div class="map-region-picker-header__text">' +
                '        <h2 id="mapRegionMoveTitle">Перенести в регион</h2>' +
                '        <p class="map-region-picker-header__sub">Выделено объектов: ' + selectedObjects.length + '</p>' +
                '      </div>' +
                '    </div>' +
                '    <span class="close" id="mapRegionMoveClose" role="button" tabindex="0" aria-label="Закрыть">&times;</span>' +
                '  </div>' +
                '  <div class="modal-body map-region-picker-body">' +
                '    <div class="form-group">' +
                '      <label for="mapRegionMoveSelect">Регион назначения</label>' +
                '      <select id="mapRegionMoveSelect" class="form-select">' + options + '</select>' +
                '    </div>' +
                '    <div class="map-region-picker-actions map-region-picker-actions--end">' +
                '      <button type="button" class="btn-secondary" id="mapRegionMoveCancel">Отмена</button>' +
                '      <button type="button" class="btn-primary" id="mapRegionMoveOk">Перенести</button>' +
                '    </div>' +
                '  </div>' +
                '</div>';
            document.body.appendChild(modal);
            function close() { modal.remove(); }
            modal.addEventListener('click', function (e) {
                if (e.target === modal) close();
            });
            document.getElementById('mapRegionMoveClose').onclick = close;
            document.getElementById('mapRegionMoveClose').addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    close();
                }
            });
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
            modal.style.display = 'flex';
            enhanceDynamicModal(modal);
        });
    }

    function initMapRegionUi() {
        var chip = document.getElementById('mapRegionCurrentChip');
        if (chip) {
            if (!chip.querySelector('.map-region-current-chip__icon')) {
                chip.innerHTML =
                    '<span class="map-region-current-chip__icon" aria-hidden="true">' +
                    '  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon>' +
                    '    <line x1="9" y1="3" x2="9" y2="18"></line>' +
                    '    <line x1="15" y1="6" x2="15" y2="21"></line>' +
                    '  </svg>' +
                    '</span>' +
                    '<span class="map-region-current-chip__label">Регион</span>' +
                    '<span class="map-region-current-chip__chevron" aria-hidden="true">' +
                    '  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
                    '    <polyline points="6 9 12 15 18 9"></polyline>' +
                    '  </svg>' +
                    '</span>';
            }
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
