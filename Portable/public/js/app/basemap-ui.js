/**
 * Админ-UI загрузки / обновления ортофото-подложки (GeoTIFF).
 * Дизайн: panel-glass + form-select / form-input, как у остальных модалок карты.
 */
(function (global) {
    'use strict';

    var pollTimer = null;
    var escapeHandler = null;
    var prefsNetBound = false;
    // Онлайн по умолчанию — Яндекс; без сети — ортофото (GeoTIFF) или пустая подложка.
    var cachedPreferredType = 'yandex#map';
    var cachedOfflineType = 'leaflet#orthophoto';
    var ALLOWED_TYPES = {
        'yandex#map': 1,
        'yandex#satellite': 1,
        'yandex#hybrid': 1,
        'leaflet#orthophoto': 1,
        'leaflet#osm': 1,
        'leaflet#none': 1
    };
    var ALLOWED_OFFLINE = {
        'leaflet#orthophoto': 1,
        'leaflet#none': 1
    };

    function authHeaders() {
        var h = {};
        try {
            var t = typeof getAuthToken === 'function' ? getAuthToken() : '';
            if (t) h.Authorization = 'Bearer ' + t;
        } catch (e) {}
        return h;
    }

    function apiBase() {
        return typeof getApiBase === 'function' ? getApiBase() : '';
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function isOrgAdmin() {
        try {
            return !!(typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin');
        } catch (e) {
            return false;
        }
    }

    /** Конфиг сервера — leaflet (dual), а не текущий runtime. */
    function isLeafletEngine() {
        try {
            if (typeof MapEngine !== 'undefined' && MapEngine.isDualMode && MapEngine.isDualMode()) return true;
            if (typeof MapEngine !== 'undefined' && MapEngine.getConfiguredEngine) {
                return MapEngine.getConfiguredEngine() === 'leaflet';
            }
        } catch (e) {}
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var eng = String(cfg.mapEngine || global.VolsmapConfiguredEngine || '').toLowerCase();
            return eng === 'leaflet' || eng === 'offline' || eng === 'orthophoto';
        } catch (e2) {
            return typeof MapEngine !== 'undefined' && MapEngine.isLeaflet && MapEngine.isLeaflet();
        }
    }

    function normalizePreferredType(value) {
        var s = value == null ? '' : String(value).trim();
        if (ALLOWED_TYPES[s]) return s;
        // Dual (mapEngine=leaflet): при наличии сети предпочитаем Яндекс.
        return 'yandex#map';
    }

    function normalizeOfflineType(value) {
        var s = value == null ? '' : String(value).trim();
        if (ALLOWED_OFFLINE[s]) return s;
        return 'leaflet#orthophoto';
    }

    function basemapNeedsInternet(type) {
        var t = String(type || '');
        return t === 'leaflet#osm' || t.indexOf('yandex#') === 0;
    }

    function hasOrthophotoReady() {
        if (global._volsmapHasActiveBasemap) return true;
        try {
            if (typeof myMap !== 'undefined' && myMap) {
                if (myMap._packId) return true;
                if (myMap._lastManifest && myMap._lastManifest.packId) return true;
            }
        } catch (e) {}
        return false;
    }

    function isBrowserOffline() {
        try {
            return typeof navigator !== 'undefined' && navigator.onLine === false;
        } catch (e) {
            return false;
        }
    }

    function hasYandexKey() {
        try {
            var cfg = global.__volsmapPublicConfig || {};
            var k = String(cfg.yandexMapsApiKey || '').trim();
            return !!(k && k !== 'YOUR_YANDEX_MAPS_API_KEY');
        } catch (e) {
            return false;
        }
    }

    function resolveOfflineFallback(offlineType) {
        offlineType = normalizeOfflineType(offlineType);
        if (offlineType === 'leaflet#none') return 'leaflet#none';
        return hasOrthophotoReady() ? 'leaflet#orthophoto' : 'leaflet#none';
    }

    /** Итоговый слой: онлайн → Яндекс (если ключ есть); офлайн / без ключа → GeoTIFF или пустая. */
    function resolveBasemapType(preferred, offlineType) {
        preferred = normalizePreferredType(preferred);
        offlineType = normalizeOfflineType(offlineType);
        if (!isLeafletEngine()) {
            return preferred.indexOf('yandex#') === 0 ? preferred : 'yandex#map';
        }
        var needsNet = basemapNeedsInternet(preferred);
        if (needsNet && (isBrowserOffline() || (preferred.indexOf('yandex#') === 0 && !hasYandexKey()))) {
            return resolveOfflineFallback(offlineType);
        }
        if (!needsNet || !isBrowserOffline()) {
            return preferred;
        }
        return resolveOfflineFallback(offlineType);
    }

    function applyResolvedBasemapType(type, opts) {
        opts = opts || {};
        if (typeof myMap === 'undefined' || !myMap || typeof myMap.setType !== 'function') return false;
        var next = resolveBasemapType(
            type != null ? type : cachedPreferredType,
            opts.offlineType != null ? opts.offlineType : cachedOfflineType
        );
        try {
            // Личный выбор важнее орг. дефолта / offline fallback
            if (typeof MapRuntime !== 'undefined' && MapRuntime.hasUserBasemapPreference &&
                MapRuntime.hasUserBasemapPreference()) {
                var userType = MapRuntime.readUserBasemapType && MapRuntime.readUserBasemapType();
                if (userType) next = userType;
            }
            if (myMap.getType && myMap.getType() === next) return true;
            if (typeof MapRuntime !== 'undefined' && MapRuntime.applyBasemapType) {
                MapRuntime.applyBasemapType(next, null, { asUserChoice: false });
                return true;
            }
            myMap.setType(next);
            return true;
        } catch (e) {
            return false;
        }
    }

    function applyOrgBasemapSettings(settings, opts) {
        if (!settings) return;
        // Личный выбор с сервера (пользователь уже выбирал слой)
        if (settings.userBasemapType && typeof MapRuntime !== 'undefined' && MapRuntime.persistUserBasemapType) {
            try {
                MapRuntime.persistUserBasemapType(normalizePreferredType(settings.userBasemapType));
            } catch (eUser) {}
        }
        if (settings.defaultBasemapType !== undefined) {
            cachedPreferredType = normalizePreferredType(settings.defaultBasemapType);
            if (typeof MapRuntime !== 'undefined' && MapRuntime.persistOrgDefaultBasemapType) {
                try { MapRuntime.persistOrgDefaultBasemapType(cachedPreferredType); } catch (eP) {}
            }
        }
        if (settings.defaultBasemapOfflineType !== undefined) {
            cachedOfflineType = normalizeOfflineType(settings.defaultBasemapOfflineType);
        }
        syncDefaultLayerControls();
        if (opts && opts.apply === false) return;
        // Не навязывать орг. слой тем, кто уже выбрал свой
        if (typeof MapRuntime !== 'undefined' && MapRuntime.hasUserBasemapPreference &&
            MapRuntime.hasUserBasemapPreference()) {
            var userType = MapRuntime.readUserBasemapType && MapRuntime.readUserBasemapType();
            if (userType && typeof MapRuntime.applyBasemapType === 'function') {
                MapRuntime.applyBasemapType(userType, null, { asUserChoice: false });
            }
            return;
        }
        applyResolvedBasemapType(cachedPreferredType, { offlineType: cachedOfflineType, force: !!(opts && opts.force) });
    }

    function bindNetworkBasemapWatchers() {
        if (prefsNetBound) return;
        prefsNetBound = true;
        try {
            window.addEventListener('offline', function () {
                applyResolvedBasemapType(cachedPreferredType, { force: true });
            });
            window.addEventListener('online', function () {
                applyResolvedBasemapType(cachedPreferredType, { force: true });
            });
        } catch (e) {}
    }

    function syncDefaultLayerControls() {
        var pref = document.getElementById('basemapDefaultType');
        var off = document.getElementById('basemapOfflineType');
        var admin = isOrgAdmin();
        if (pref) {
            pref.value = cachedPreferredType;
            pref.disabled = !admin;
        }
        if (off) {
            off.value = cachedOfflineType;
            off.disabled = !admin;
        }
        var hint = document.getElementById('basemapDefaultHint');
        if (hint) {
            hint.textContent = admin
                ? 'Без интернета слои Яндекса/OSM недоступны — сработает запасной вариант ниже.'
                : 'Меняет администратор организации. Без интернета: ортофото или пустой фон.';
        }
    }

    function saveDefaultBasemapPrefs() {
        if (!isOrgAdmin()) return;
        var prefEl = document.getElementById('basemapDefaultType');
        var offEl = document.getElementById('basemapOfflineType');
        var preferred = normalizePreferredType(prefEl && prefEl.value);
        var offline = normalizeOfflineType(offEl && offEl.value);
        cachedPreferredType = preferred;
        cachedOfflineType = offline;
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || !apiBase()) {
            applyResolvedBasemapType(preferred, { force: true });
            return;
        }
        fetch(apiBase() + '/api/settings', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
            body: JSON.stringify({
                defaultBasemapType: preferred,
                defaultBasemapOfflineType: offline
            })
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (typeof showSuccess === 'function') showSuccess('Слой для всех сохранён');
            applyResolvedBasemapType(preferred, { force: true });
            closeBasemapDefaultModal();
        }).catch(function (e) {
            if (typeof showError === 'function') showError('Не удалось сохранить слой: ' + (e && e.message ? e.message : e));
        });
    }

    function loadDefaultBasemapPrefsIntoForm() {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || !apiBase()) {
            syncDefaultLayerControls();
            return Promise.resolve();
        }
        return fetch(apiBase() + '/api/settings', { headers: authHeaders(), cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (s) {
                applyOrgBasemapSettings(s || {}, { apply: false });
                syncDefaultLayerControls();
            })
            .catch(function () {
                syncDefaultLayerControls();
            });
    }

    function ensureModal() {
        var el = document.getElementById('basemapAdminModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'basemapAdminModal';
        el.className = 'modal modal--centered basemap-admin-modal';
        el.style.display = 'none';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'basemapAdminTitle');
        el.innerHTML =
            '<div class="modal-content panel-glass panel-glass--lite basemap-admin-content">' +
            '  <div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>' +
            '  <div class="modal-header basemap-admin-header">' +
            '    <div class="basemap-admin-header__main">' +
            '      <div class="basemap-admin-header__icon" aria-hidden="true">' +
            '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>' +
            '          <polyline points="2 17 12 22 22 17"></polyline>' +
            '          <polyline points="2 12 12 17 22 12"></polyline>' +
            '        </svg>' +
            '      </div>' +
            '      <div class="basemap-admin-header__text">' +
            '        <h2 id="basemapAdminTitle">Ортофото-подложка</h2>' +
            '        <p class="basemap-admin-header__sub">Загрузка GeoTIFF и управление пакетами тайлов</p>' +
            '      </div>' +
            '    </div>' +
            '    <span class="close" id="basemapAdminClose" role="button" tabindex="0" aria-label="Закрыть">&times;</span>' +
            '  </div>' +
            '  <div class="modal-body basemap-admin-body">' +
            '    <div class="basemap-admin-status-card" id="basemapAdminStatusCard">' +
            '      <div class="basemap-admin-status-card__row">' +
            '        <span class="basemap-admin-status-card__label">Статус</span>' +
            '        <span class="basemap-admin-status-card__value" id="basemapAdminStatus">Загрузка…</span>' +
            '      </div>' +
            '      <div class="basemap-admin-status-card__row">' +
            '        <span class="basemap-admin-status-card__label">Движок</span>' +
            '        <span class="basemap-admin-status-card__value" id="basemapAdminGdal">—</span>' +
            '      </div>' +
            '      <div class="basemap-admin-status-card__row">' +
            '        <span class="basemap-admin-status-card__label">Квота</span>' +
            '        <span class="basemap-admin-status-card__value" id="basemapAdminQuota">—</span>' +
            '      </div>' +
            '    </div>' +
            '    <div class="basemap-admin-section">' +
            '      <h3 class="basemap-admin-section__title">Загрузить GeoTIFF</h3>' +
            '      <div class="form-group">' +
            '        <label for="basemapUploadMode">Режим</label>' +
            '        <select id="basemapUploadMode" class="form-select">' +
            '          <option value="full">Основная карта (новый пакет)</option>' +
            '          <option value="patch">Обновить участок (поверх активного)</option>' +
            '        </select>' +
            '      </div>' +
            '      <div class="form-group">' +
            '        <label for="basemapFileInput">Файл (.tif / .tiff)</label>' +
            '        <input type="file" id="basemapFileInput" class="form-input basemap-admin-file" accept=".tif,.tiff,image/tiff">' +
            '      </div>' +
            '      <div class="basemap-admin-zoom-row">' +
            '        <div class="form-group">' +
            '          <label for="basemapMinZoom">Мин. зум</label>' +
            '          <input type="number" id="basemapMinZoom" class="form-input" value="13" min="0" max="18">' +
            '        </div>' +
            '        <div class="form-group">' +
            '          <label for="basemapMaxZoom">Макс. зум</label>' +
            '          <input type="number" id="basemapMaxZoom" class="form-input" value="15" min="1" max="18">' +
            '        </div>' +
            '      </div>' +
            '      <p class="basemap-admin-hint">Обычно хватает 14–16. Выше 17 — миллионы тайлов и риск зависания сервера.</p>' +
            '      <div id="basemapJobProgress" class="basemap-admin-progress" hidden>' +
            '        <div class="basemap-admin-progress__track" aria-hidden="true">' +
            '          <div id="basemapJobBar" class="basemap-admin-progress__bar"></div>' +
            '        </div>' +
            '        <div id="basemapJobText" class="basemap-admin-progress__text"></div>' +
            '      </div>' +
            '    </div>' +
            '    <div class="basemap-admin-section">' +
            '      <h3 class="basemap-admin-section__title">Пакеты на сервере</h3>' +
            '      <div id="basemapPacksList" class="basemap-admin-packs" role="list"></div>' +
            '    </div>' +
            '    <div class="basemap-admin-actions">' +
            '      <button type="button" class="btn-secondary" id="basemapAdminCancel">Закрыть</button>' +
            '      <button type="button" class="btn-primary" id="basemapAdminUpload">Загрузить</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', function (e) {
            if (e.target === el) closeBasemapAdminModal();
        });
        document.getElementById('basemapAdminClose').addEventListener('click', closeBasemapAdminModal);
        document.getElementById('basemapAdminClose').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeBasemapAdminModal();
            }
        });
        document.getElementById('basemapAdminCancel').addEventListener('click', closeBasemapAdminModal);
        document.getElementById('basemapAdminUpload').addEventListener('click', startBasemapUpload);
        return el;
    }

    function ensureDefaultLayerModal() {
        var el = document.getElementById('basemapDefaultModal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'basemapDefaultModal';
        el.className = 'modal modal--centered basemap-admin-modal basemap-default-modal';
        el.style.display = 'none';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-labelledby', 'basemapDefaultTitle');
        el.innerHTML =
            '<div class="modal-content panel-glass panel-glass--lite basemap-admin-content basemap-default-content">' +
            '  <div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>' +
            '  <div class="modal-header basemap-admin-header">' +
            '    <div class="basemap-admin-header__main">' +
            '      <div class="basemap-admin-header__icon" aria-hidden="true">' +
            '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '          <rect x="3" y="3" width="7" height="7" rx="1"></rect>' +
            '          <rect x="14" y="3" width="7" height="7" rx="1"></rect>' +
            '          <rect x="3" y="14" width="7" height="7" rx="1"></rect>' +
            '          <rect x="14" y="14" width="7" height="7" rx="1"></rect>' +
            '        </svg>' +
            '      </div>' +
            '      <div class="basemap-admin-header__text">' +
            '        <h2 id="basemapDefaultTitle">Слой для всех по умолчанию</h2>' +
            '        <p class="basemap-admin-header__sub">Какую подложку видят пользователи организации при входе</p>' +
            '      </div>' +
            '    </div>' +
            '    <span class="close" id="basemapDefaultClose" role="button" tabindex="0" aria-label="Закрыть">&times;</span>' +
            '  </div>' +
            '  <div class="modal-body basemap-admin-body">' +
            '    <p class="basemap-admin-hint" id="basemapDefaultHint">Настройка только для администратора организации.</p>' +
            '    <div class="form-group">' +
            '      <label for="basemapDefaultType">Базовый слой при входе</label>' +
            '      <select id="basemapDefaultType" class="form-select">' +
            '        <option value="leaflet#orthophoto">Ортофото</option>' +
            '        <option value="yandex#map">Яндекс · Схема</option>' +
            '        <option value="yandex#satellite">Яндекс · Спутник</option>' +
            '        <option value="yandex#hybrid">Яндекс · Гибрид</option>' +
            '        <option value="leaflet#osm">OpenStreetMap</option>' +
            '        <option value="leaflet#none">Без подложки</option>' +
            '      </select>' +
            '    </div>' +
            '    <div class="form-group">' +
            '      <label for="basemapOfflineType">Если нет интернета</label>' +
            '      <select id="basemapOfflineType" class="form-select">' +
            '        <option value="leaflet#orthophoto">Ортофото (если загружено)</option>' +
            '        <option value="leaflet#none">Без подложки</option>' +
            '      </select>' +
            '    </div>' +
            '    <div class="basemap-admin-actions">' +
            '      <button type="button" class="btn-secondary" id="basemapDefaultCancel">Отмена</button>' +
            '      <button type="button" class="btn-primary" id="basemapDefaultSave">Сохранить для всех</button>' +
            '    </div>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(el);
        el.addEventListener('click', function (e) {
            if (e.target === el) closeBasemapDefaultModal();
        });
        document.getElementById('basemapDefaultClose').addEventListener('click', closeBasemapDefaultModal);
        document.getElementById('basemapDefaultClose').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closeBasemapDefaultModal();
            }
        });
        document.getElementById('basemapDefaultCancel').addEventListener('click', closeBasemapDefaultModal);
        document.getElementById('basemapDefaultSave').addEventListener('click', function () {
            saveDefaultBasemapPrefs();
        });
        return el;
    }

    var defaultEscapeHandler = null;

    function openBasemapDefaultModal() {
        if (!isLeafletEngine()) {
            if (typeof showInfo === 'function') {
                showInfo('Доступно при mapEngine=leaflet в server-config.json', 'Слой по умолчанию');
            }
            return;
        }
        if (!isOrgAdmin()) {
            if (typeof showInfo === 'function') {
                showInfo('Слой для всех задаёт администратор организации', 'Слой по умолчанию');
            }
            return;
        }
        var modal = ensureDefaultLayerModal();
        modal.style.display = 'flex';
        modal.classList.add('basemap-admin-modal--open');
        if (!defaultEscapeHandler) {
            defaultEscapeHandler = function (e) {
                if (e.key === 'Escape') closeBasemapDefaultModal();
            };
            document.addEventListener('keydown', defaultEscapeHandler);
        }
        loadDefaultBasemapPrefsIntoForm();
    }

    function closeBasemapDefaultModal() {
        var modal = document.getElementById('basemapDefaultModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('basemap-admin-modal--open');
        }
        if (defaultEscapeHandler) {
            document.removeEventListener('keydown', defaultEscapeHandler);
            defaultEscapeHandler = null;
        }
    }

    function setStatus(text) {
        var el = document.getElementById('basemapAdminStatus');
        if (el) el.textContent = text || '—';
    }

    function setQuota(text) {
        var el = document.getElementById('basemapAdminQuota');
        if (el) el.textContent = text || '—';
    }

    function refreshStatus() {
        return fetch(apiBase() + '/api/basemap/status', { headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.error) {
                    setStatus(data.error);
                    setQuota('—');
                    return data;
                }
                var active = data.active && data.active.packId
                    ? (data.active.sourceName || data.active.packId)
                    : 'не задана';
                global._volsmapHasActiveBasemap = !!(data.active && data.active.packId);
                setStatus(active);
                setQuota((data.usedLabel || '?') + ' из ' + (data.quotaLabel || '?'));
                var gdalEl = document.getElementById('basemapAdminGdal');
                if (gdalEl) {
                    if (data.gdal && data.gdal.gdal) {
                        gdalEl.textContent = 'GDAL · быстрая нарезка';
                        gdalEl.className = 'basemap-admin-status-card__value is-ok';
                    } else if (data.gdal && data.gdal.nodeFallback) {
                        gdalEl.textContent = 'Встроенный · без GDAL (медленнее)';
                        gdalEl.className = 'basemap-admin-status-card__value is-warn';
                    } else {
                        gdalEl.textContent = 'Не определён';
                        gdalEl.className = 'basemap-admin-status-card__value';
                    }
                }
                return data;
            })
            .catch(function (e) {
                setStatus('Ошибка: ' + (e && e.message ? e.message : e));
                setQuota('—');
            });
    }

    function formatPackDate(iso) {
        if (!iso) return '';
        try {
            var d = new Date(iso);
            if (isNaN(d.getTime())) return String(iso).slice(0, 19).replace('T', ' ');
            return d.toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            return String(iso).slice(0, 19).replace('T', ' ');
        }
    }

    function refreshPacks() {
        return fetch(apiBase() + '/api/basemap/packs', { headers: authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                var box = document.getElementById('basemapPacksList');
                if (!box) return;
                var packs = (data && data.packs) || [];
                if (!packs.length) {
                    box.innerHTML = '<div class="basemap-admin-packs__empty">Пакетов пока нет — загрузите GeoTIFF выше.</div>';
                    return;
                }
                box.innerHTML = packs.map(function (p) {
                    var id = p.id || p.packId || '';
                    var active = data.activePackId === id || p.packId === data.activePackId;
                    var name = escapeHtml(p.sourceName || id);
                    var when = escapeHtml(formatPackDate(p.createdAt || p.updatedAt));
                    var zoom = '';
                    if (p.minZoom != null || p.maxZoom != null) {
                        zoom = 'z' + (p.minZoom != null ? p.minZoom : '?') + '–' + (p.maxZoom != null ? p.maxZoom : '?');
                    }
                    return (
                        '<div class="basemap-admin-pack' + (active ? ' is-active' : '') + '" role="listitem" data-pack-id="' + escapeHtml(id) + '">' +
                        '  <div class="basemap-admin-pack__main">' +
                        '    <div class="basemap-admin-pack__title">' +
                        (active ? '<span class="basemap-admin-pack__badge">Активен</span>' : '') +
                        '      <span class="basemap-admin-pack__name">' + name + '</span>' +
                        '    </div>' +
                        '    <div class="basemap-admin-pack__meta">' +
                        (when ? '<span>' + when + '</span>' : '') +
                        (zoom ? '<span>' + escapeHtml(zoom) + '</span>' : '') +
                        '    </div>' +
                        '  </div>' +
                        '  <div class="basemap-admin-pack__actions">' +
                        (active ? '' : '<button type="button" class="btn-secondary basemap-admin-pack__btn" data-activate="' + escapeHtml(id) + '">Включить</button>') +
                        '    <button type="button" class="btn-secondary basemap-admin-pack__btn basemap-admin-pack__btn--danger" data-delete="' + escapeHtml(id) + '">Удалить</button>' +
                        '  </div>' +
                        '</div>'
                    );
                }).join('');
                box.querySelectorAll('[data-activate]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        activatePack(btn.getAttribute('data-activate'));
                    });
                });
                box.querySelectorAll('[data-delete]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        deletePack(btn.getAttribute('data-delete'));
                    });
                });
            })
            .catch(function () {});
    }

    function activatePack(packId) {
        fetch(apiBase() + '/api/basemap/' + encodeURIComponent(packId) + '/activate', {
            method: 'POST',
            headers: authHeaders()
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.error) {
                if (typeof showError === 'function') showError(data.error);
                return;
            }
            if (typeof showSuccess === 'function') showSuccess('Подложка активирована');
            refreshStatus();
            refreshPacks();
            reloadMapBasemap(data.active || data);
            try {
                if (typeof MapRuntime !== 'undefined' && MapRuntime.applyBasemapType) {
                    MapRuntime.applyBasemapType('leaflet#orthophoto');
                } else if (typeof myMap !== 'undefined' && myMap && typeof myMap.setType === 'function') {
                    myMap.setType('leaflet#orthophoto');
                }
            } catch (eType) {}
        });
    }

    function deletePack(packId) {
        var ask = (typeof showConfirm === 'function')
            ? showConfirm('Удалить пакет подложки «' + packId + '»? Тайлы будут стёрты с диска.', 'Удаление подложки', {
                confirmText: 'Удалить',
                cancelText: 'Отмена',
                avatarEmotion: 'question'
            })
            : Promise.resolve(window.confirm('Удалить пакет подложки ' + packId + '?'));

        ask.then(function (ok) {
            if (!ok) return;
            fetch(apiBase() + '/api/basemap/' + encodeURIComponent(packId), {
                method: 'DELETE',
                headers: authHeaders()
            }).then(function (r) { return r.json(); }).then(function (data) {
                if (data.error) {
                    if (typeof showError === 'function') showError(data.error);
                    return;
                }
                if (typeof showSuccess === 'function') showSuccess('Пакет удалён');
                refreshStatus();
                refreshPacks();
            });
        });
    }

    function reloadMapBasemap(manifest) {
        try {
            if (typeof myMap !== 'undefined' && myMap && typeof myMap.setBasemapPack === 'function' && manifest && manifest.packId) {
                myMap.setBasemapPack(manifest);
            } else if (typeof myMap !== 'undefined' && myMap && typeof myMap._loadBasemap === 'function') {
                myMap._loadBasemap();
            }
        } catch (e) {}
    }

    function startBasemapUpload() {
        var input = document.getElementById('basemapFileInput');
        var file = input && input.files && input.files[0];
        if (!file) {
            if (typeof showError === 'function') showError('Выберите файл GeoTIFF');
            return;
        }
        var mode = (document.getElementById('basemapUploadMode') || {}).value || 'full';
        var minZoom = (document.getElementById('basemapMinZoom') || {}).value || '13';
        var maxZoom = (document.getElementById('basemapMaxZoom') || {}).value || '15';
        if (Number(maxZoom) > 18) maxZoom = '18';
        if (Number(minZoom) > Number(maxZoom)) minZoom = maxZoom;
        var fd = new FormData();
        fd.append('file', file);
        fd.append('mode', mode);
        fd.append('sourceName', file.name || '');
        fd.append('minZoom', String(minZoom));
        fd.append('maxZoom', String(maxZoom));

        var btn = document.getElementById('basemapAdminUpload');
        if (btn) btn.disabled = true;
        var prog = document.getElementById('basemapJobProgress');
        if (prog) {
            prog.hidden = false;
            prog.style.display = '';
        }
        setJobProgress(5, 'Загрузка файла…');

        fetch(apiBase() + '/api/basemap/upload', {
            method: 'POST',
            headers: authHeaders(),
            body: fd
        }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
            .then(function (res) {
                if (!res.ok || res.body.error) {
                    throw new Error(res.body.error || ('HTTP ' + res.status));
                }
                pollJob(res.body.jobId);
            })
            .catch(function (e) {
                if (btn) btn.disabled = false;
                setJobProgress(0, '');
                if (prog) prog.hidden = true;
                if (typeof showError === 'function') showError(String(e.message || e));
            });
    }

    function setJobProgress(pct, text) {
        var bar = document.getElementById('basemapJobBar');
        var t = document.getElementById('basemapJobText');
        if (bar) bar.style.width = Math.max(0, Math.min(100, Number(pct) || 0)) + '%';
        if (t) t.textContent = text || '';
    }

    function pollJob(jobId) {
        if (pollTimer) clearInterval(pollTimer);
        function tick() {
            fetch(apiBase() + '/api/basemap/jobs/' + encodeURIComponent(jobId), { headers: authHeaders() })
                .then(function (r) { return r.json(); })
                .then(function (job) {
                    if (job.error && job.status === 'error') {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        var btn = document.getElementById('basemapAdminUpload');
                        if (btn) btn.disabled = false;
                        setJobProgress(100, 'Ошибка: ' + job.error);
                        if (typeof showError === 'function') showError(job.error);
                        return;
                    }
                    setJobProgress(job.progress || 0, (job.message || job.status || '') + (job.packId ? ' · ' + job.packId : ''));
                    if (job.status === 'ready') {
                        clearInterval(pollTimer);
                        pollTimer = null;
                        var btn2 = document.getElementById('basemapAdminUpload');
                        if (btn2) btn2.disabled = false;
                        if (typeof showSuccess === 'function') showSuccess('Подложка обработана');
                        refreshStatus();
                        refreshPacks();
                        fetch(apiBase() + '/api/basemap/active', { headers: authHeaders() })
                            .then(function (r) { return r.json(); })
                            .then(function (active) {
                                reloadMapBasemap(active);
                                try {
                                    if (typeof MapRuntime !== 'undefined' && MapRuntime.applyBasemapType) {
                                        MapRuntime.applyBasemapType('leaflet#orthophoto');
                                    } else if (typeof myMap !== 'undefined' && myMap && typeof myMap.setType === 'function') {
                                        myMap.setType('leaflet#orthophoto');
                                    }
                                } catch (eType) {}
                            });
                    }
                })
                .catch(function () {});
        }
        tick();
        pollTimer = setInterval(tick, 1500);
    }

    function openBasemapAdminModal() {
        if (!isLeafletEngine()) {
            if (typeof showInfo === 'function') {
                showInfo('Управление ортофото доступно при mapEngine=leaflet в server-config.json', 'Подложка');
            }
            return;
        }
        var modal = ensureModal();
        modal.style.display = 'flex';
        modal.classList.add('basemap-admin-modal--open');
        if (!escapeHandler) {
            escapeHandler = function (e) {
                if (e.key === 'Escape') closeBasemapAdminModal();
            };
            document.addEventListener('keydown', escapeHandler);
        }
        refreshStatus();
        refreshPacks();
    }

    function closeBasemapAdminModal() {
        var modal = document.getElementById('basemapAdminModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('basemap-admin-modal--open');
        }
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    global.openBasemapAdminModal = openBasemapAdminModal;
    global.closeBasemapAdminModal = closeBasemapAdminModal;
    global.openBasemapDefaultModal = openBasemapDefaultModal;
    global.closeBasemapDefaultModal = closeBasemapDefaultModal;
    global.applyOrgBasemapSettings = applyOrgBasemapSettings;
    global.resolveBasemapType = resolveBasemapType;
    global.applyResolvedBasemapType = applyResolvedBasemapType;
    global.isOrgBasemapAdmin = isOrgAdmin;
    bindNetworkBasemapWatchers();
})(typeof window !== 'undefined' ? window : this);
