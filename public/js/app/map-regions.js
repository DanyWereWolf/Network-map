(function (global) {
    var MAP_REGION_SOFT_LIMIT = 10000;
    var MAP_REGION_SOFT_WARN_AT = 9000;
    var _regionsCache = null;
    var _pickerResolve = null;
    var _lastSoftWarnKey = '';
    var _regionSwitchGen = 0;

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
            var currentOpenId = getCurrentMapRegionId();
            function regionListed(id) {
                if (!id) return false;
                for (var ri = 0; ri < regions.length; ri++) {
                    if (regions[ri] && String(regions[ri].id) === String(id)) return true;
                }
                return false;
            }
            if (!regionListed(selectedId)) {
                if (regionListed(currentOpenId)) selectedId = String(currentOpenId);
                else if (defId && regionListed(defId)) selectedId = String(defId);
                else if (regions[0]) selectedId = String(regions[0].id);
                else selectedId = null;
            }
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
                var isCurrent = currentOpenId && String(r.id) === String(currentOpenId);
                var badges = '';
                if (isCurrent) {
                    badges += '<span class="map-region-picker-badge map-region-picker-badge--current">текущий</span>';
                }
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
            var selectedBtn = list.querySelector('.map-region-picker-item.is-selected');
            if (selectedBtn && selectedBtn.scrollIntoView) {
                try { selectedBtn.scrollIntoView({ block: 'nearest' }); } catch (eScroll) {}
            }
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
                hidePicker({ replayEntrance: true });
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
        var preferId = opts.selectedId != null ? String(opts.selectedId) : getCurrentMapRegionId();
        if (preferId) el._setSelectedId(preferId);
        else if (payload && payload.defaultMapRegionId) el._setSelectedId(String(payload.defaultMapRegionId));
        else el._setSelectedId(null);
        el._renderList(payload || { regions: [] });
        global._mapRegionPickerAwaiting = true;
        if (typeof setMapLoadingOverlayText === 'function') {
            try { setMapLoadingOverlayText('Выбор региона…'); } catch (eTxt) {}
        }
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
        enhanceDynamicModal(el);
    }

    function hidePicker(opts) {
        opts = opts || {};
        var el = document.getElementById('mapRegionPickerModal');
        global._mapRegionPickerAwaiting = false;
        if (el) {
            el.style.display = 'none';
            el.setAttribute('aria-hidden', 'true');
        }
        var stillInitial = typeof _mapInitialLoadPending !== 'undefined' && _mapInitialLoadPending;
        if (opts.replayEntrance && stillInitial && typeof resetAppEntranceTimer === 'function') {
            try { resetAppEntranceTimer(); } catch (eReset) {}
        }
        if (typeof tryCompleteMapInitialLoad === 'function') {
            try { tryCompleteMapInitialLoad(); } catch (eComplete) {}
        }
    }

    function regionIdFromList(payload, id) {
        if (!payload || !id || !Array.isArray(payload.regions)) return '';
        var want = String(id);
        for (var i = 0; i < payload.regions.length; i++) {
            var region = payload.regions[i];
            if (region && region.id != null && String(region.id) === want) return want;
        }
        return '';
    }

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
            var shareRegionPref = '';
            try {
                shareRegionPref = global.__VOLSMAP_SHARE_REGION_ID__
                    ? String(global.__VOLSMAP_SHARE_REGION_ID__)
                    : (global.__VOLSMAP_SHARE_VIEW__ && global.__VOLSMAP_SHARE_VIEW__.regionId
                        ? String(global.__VOLSMAP_SHARE_VIEW__.regionId) : '');
            } catch (eShareReg) {}
            if (shareRegionPref) {
                var shareId = regionIdFromList(payload, shareRegionPref);
                if (shareId) {
                    setCurrentMapRegionId(shareId);
                    return shareId;
                }
            }
            if (payload.regions.length === 1 && payload.regions[0] && payload.regions[0].id) {
                var onlyId = String(payload.regions[0].id);
                setCurrentMapRegionId(onlyId);
                return onlyId;
            }
            var defId = regionIdFromList(payload, payload.defaultMapRegionId);
            if (defId) {
                setCurrentMapRegionId(defId);
                return defId;
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
        var badge = document.getElementById('mapRegionCurrentName');
        if (badge) {
            badge.textContent = name;
            badge.title = id ? name : '';
            if (id) badge.removeAttribute('hidden');
            else badge.setAttribute('hidden', '');
        }
        var value = chip.querySelector('.map-region-current-chip__value');
        var label = chip.querySelector('.map-region-current-chip__label');
        if (value) value.textContent = name;
        else if (label && !chip.classList.contains('map-region-change-btn')) label.textContent = name;
        chip.title = id ? ('Текущий регион: ' + name + ' (нажмите, чтобы сменить)') : 'Регион';
        if (id) chip.removeAttribute('hidden');
        else chip.setAttribute('hidden', '');
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
                if (typeof objects !== 'undefined' && Array.isArray(objects) && typeof myMap !== 'undefined' && myMap) {
                    while (objects.length) {
                        var o = objects.pop();
                        try { myMap.geoObjects.remove(o); } catch (e3) {}
                    }
                }
            }
        }
    }

    function objectLodZoom() {
        var z = 16;
        if (typeof getLodThresholds === 'function') {
            try {
                var thr = getLodThresholds();
                if (thr && typeof thr.objects === 'number') z = thr.objects;
            } catch (eThr) {}
        }
        return z;
    }

    function boundsFromSerializedRegion(data) {
        var list = Array.isArray(data) ? data : [];
        var minLat = Infinity;
        var minLon = Infinity;
        var maxLat = -Infinity;
        var maxLon = -Infinity;
        var any = false;
        var anchor = null;
        function visit(value) {
            if (!Array.isArray(value) || value.length < 2) return;
            if (Array.isArray(value[0])) {
                for (var i = 0; i < value.length; i++) visit(value[i]);
                return;
            }
            var lat = Number(value[0]);
            var lon = Number(value[1]);
            if (!isFinite(lat) || !isFinite(lon)) return;
            any = true;
            if (!anchor) anchor = [lat, lon];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
        }
        var pass;
        for (pass = 0; pass < 2 && !any; pass++) {
            for (var n = 0; n < list.length; n++) {
                var item = list[n];
                if (!item || item.geometry == null) continue;
                var t = item.type;
                if (t === 'cableLabel' || t === 'regionLabel' || t === 'zoneLabel') continue;
                if (pass === 0 && (t === 'region' || t === 'zone')) continue;
                visit(item.geometry);
            }
        }
        if (!any) return null;
        return { bounds: [[minLat, minLon], [maxLat, maxLon]], anchor: anchor };
    }

    function focusMapOnSerializedRegion(data) {
        if (typeof myMap === 'undefined' || !myMap) return false;
        var frame = boundsFromSerializedRegion(data);
        if (!frame || !frame.bounds) return false;
        var bounds = frame.bounds;
        var sw = bounds[0];
        var ne = bounds[1];
        var anchor = frame.anchor || [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2];
        var minZoom = objectLodZoom();
        var samePoint = Math.abs(sw[0] - ne[0]) < 1e-5 && Math.abs(sw[1] - ne[1]) < 1e-5;
        try {
            if (samePoint) {
                myMap.setCenter(anchor, minZoom);
            } else if (typeof myMap.setBounds === 'function') {
                myMap.setBounds(bounds, { checkZoomRange: true, duration: 0, zoomMargin: 48 });
                var zoom = (typeof myMap.getZoom === 'function') ? myMap.getZoom() : null;
                if (typeof zoom === 'number' && zoom < minZoom) {
                    myMap.setCenter(anchor, minZoom);
                }
            } else {
                myMap.setCenter(anchor, minZoom);
            }
        } catch (eFocus) {
            return false;
        }
        return true;
    }

    function revealRegionObjects() {
        try {
            if (typeof applyMapViewportUpdate === 'function') applyMapViewportUpdate();
        } catch (eVp) {}
        try {
            if (typeof myMap !== 'undefined' && myMap && myMap.container && typeof myMap.container.fitToViewport === 'function') {
                myMap.container.fitToViewport();
            }
        } catch (eFit) {}
    }

    function settleRegionSwitchView(gen) {
        return new Promise(function (resolve) {
            var started = Date.now();
            function tick() {
                if (gen !== _regionSwitchGen) {
                    resolve();
                    return;
                }
                var busy = (typeof isMapBulkImportActive === 'function' && isMapBulkImportActive())
                    || (typeof _mapApplyInProgress !== 'undefined' && _mapApplyInProgress);
                if (busy && (Date.now() - started) < 20000) {
                    setTimeout(tick, 60);
                    return;
                }
                revealRegionObjects();
                if (typeof hideMapLoadingOverlay === 'function') {
                    try { hideMapLoadingOverlay(); } catch (eHide) {}
                }
                global.__mapRegionSwitching = false;
                try { updateMapRegionChip(); } catch (eChip) {}
                resolve();
            }
            setTimeout(tick, 0);
        });
    }

    function applyRegionSliceWhenIdle(body, rid, gen, forceFull) {
        return new Promise(function (resolve) {
            var tries = 0;
            function attempt() {
                if (gen != null && gen !== _regionSwitchGen) {
                    resolve(false);
                    return;
                }
                if (typeof _mapApplyInProgress !== 'undefined' && _mapApplyInProgress && tries < 50) {
                    tries++;
                    setTimeout(attempt, 40);
                    return;
                }
                if (typeof applyRemoteState === 'function') {
                    applyRemoteState(body.data, {
                        fromApi: true,
                        organizationId: body.organizationId,
                        forceFull: !!forceFull,
                        mapRegionId: rid
                    });
                }
                resolve(true);
            }
            attempt();
        });
    }

    function switchToMapRegion(regionId) {
        var rid = regionId != null ? String(regionId) : '';
        if (!rid) return Promise.reject(new Error('regionId required'));
        var gen = ++_regionSwitchGen;
        if (typeof saveData === 'function') {
            try { saveData({ skipSync: false, syncFull: true }); } catch (eSave) {}
        }
        global.__mapRegionSwitching = true;
        if (typeof showUndoRedoLoadingOverlay === 'function') {
            try { showUndoRedoLoadingOverlay('Загрузка региона…'); } catch (eOv) {}
        }
        clearLocalMapForRegionSwitch();
        setCurrentMapRegionId(rid);
        _lastSoftWarnKey = '';
        return loadMapDataForCurrentRegion({ forceFull: true, focus: true, switchGen: gen })
            .then(function (ok) {
                if (!ok && gen === _regionSwitchGen && typeof showNotification === 'function') {
                    showNotification('Не удалось загрузить регион', 'error');
                }
                return !!ok;
            })
            .catch(function (err) {
                if (gen === _regionSwitchGen && typeof showNotification === 'function') {
                    showNotification(err && err.message ? err.message : 'Не удалось открыть регион', 'error');
                }
                return false;
            })
            .then(function (ok) {
                if (gen !== _regionSwitchGen) return ok;
                return settleRegionSwitchView(gen).then(function () { return ok; });
            });
    }

    function loadMapDataForCurrentRegion(meta) {
        meta = meta || {};
        var token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        var rid = getCurrentMapRegionId();
        if (!rid) return Promise.resolve(false);
        var gen = meta.switchGen;
        var url = apiBase().replace(/\/$/, '') + '/api/map?regionId=' + encodeURIComponent(rid);
        return fetch(url, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (body) {
                if (gen != null && gen !== _regionSwitchGen) return false;
                if (!body || !Array.isArray(body.data)) return false;
                if (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null) {
                    global._mapOrgIdLoaded = String(currentUser.organizationId);
                }
                if (body.softWarn) maybeShowSoftWarn(body.softWarn, true);
                else maybeShowSoftWarn(softWarnForCount(body.objectCount || body.data.length), true);
                if (meta.focus) focusMapOnSerializedRegion(body.data);
                if (!body.data.length && typeof showNotification === 'function') {
                    showNotification('В этом регионе пока нет объектов', 'info');
                }
                return applyRegionSliceWhenIdle(body, rid, gen, meta.forceFull);
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
            if (!chip.classList.contains('map-region-change-btn') && !chip.querySelector('.map-region-current-chip__icon')) {
                chip.innerHTML =
                    '<span class="map-region-current-chip__icon" aria-hidden="true">' +
                    '  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon>' +
                    '    <line x1="9" y1="3" x2="9" y2="18"></line>' +
                    '    <line x1="15" y1="6" x2="15" y2="21"></line>' +
                    '  </svg>' +
                    '</span>' +
                    '<span class="map-region-current-chip__text">' +
                    '  <span class="map-region-current-chip__label">Регион</span>' +
                    '  <span class="map-region-current-chip__hint">Текущий раздел карты</span>' +
                    '</span>' +
                    '<span class="map-region-current-chip__value">Регион</span>' +
                    '<span class="map-region-current-chip__chevron" aria-hidden="true">' +
                    '  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
                    '    <polyline points="9 18 15 12 9 6"></polyline>' +
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
