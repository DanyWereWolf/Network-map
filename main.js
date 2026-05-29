function clearShowOnMapHighlight() {
    if (!showOnMapHighlightState) return;
    var s = showOnMapHighlightState;
    showOnMapHighlightState = null;
    if (s.timeoutId) clearTimeout(s.timeoutId);
    if (s.obj && s.obj.options) {
        try {
            if (s.isCable) {
                s.obj.options.set('strokeColor', s.originalOptions.strokeColor || '#3b82f6');
                s.obj.options.set('strokeWidth', s.originalOptions.strokeWidth != null ? s.originalOptions.strokeWidth : 3);
            } else {
                if (s.originalOptions.preset) s.obj.options.set('preset', s.originalOptions.preset);
            }
        } catch (e) {}
    }
}

/** Поля выбора типа муфты при разрезе кабеля (опора / линия кабеля). */
function buildCableSplitSleeveFieldsHtml(selectedType) {
    var sel = selectedType || 'SNR-FOSC-L';
    var html = '<div class="cable-split-sleeve-fields">';
    html += '<div class="form-group cable-split-sleeve-fields__type">';
    html += '<label class="cable-split-sleeve-fields__label">Тип муфты</label>';
    html += '<select class="form-select cable-split-sleeve-type">' + getSleeveTypeSelectOptionsHtml(sel) + '</select>';
    html += '</div>';
    html += '<div class="form-group cable-split-sleeve-fields__name">';
    html += '<label class="cable-split-sleeve-fields__label">Название муфты</label>';
    html += '<input type="text" class="form-input cable-split-sleeve-name" placeholder="Необязательно">';
    html += '</div>';
    html += '<div class="form-group cable-split-sleeve-max-wrap" style="display: none;">';
    html += '<label class="cable-split-sleeve-fields__label">Макс. волокон</label>';
    html += '<input type="number" class="form-input cable-split-sleeve-max" min="0" max="288" value="0">';
    html += '<small class="cable-split-sleeve-fields__hint">0 — без лимита</small>';
    html += '</div>';
    html += '</div>';
    return html;
}

function bindCableSplitSleeveFields(container) {
    var root = container && container.querySelector ? container : document;
    var blocks = root.querySelectorAll ? root.querySelectorAll('.cable-split-sleeve-fields') : [];
    for (var bi = 0; bi < blocks.length; bi++) {
        var block = blocks[bi];
        if (block._cableSplitSleeveBound) continue;
        block._cableSplitSleeveBound = true;
        var typeEl = block.querySelector('.cable-split-sleeve-type');
        var maxWrap = block.querySelector('.cable-split-sleeve-max-wrap');
        var maxInput = block.querySelector('.cable-split-sleeve-max');
        if (!typeEl) continue;
        function syncMaxFibersField() {
            var t = typeEl.value;
            if (t === 'custom') {
                if (maxWrap) maxWrap.style.display = '';
                if (maxInput && (!maxInput.value || maxInput.value === '0')) maxInput.value = '96';
            } else {
                if (maxWrap) maxWrap.style.display = 'none';
                if (maxInput) maxInput.value = String(getDefaultMaxFibersForSleeveType(t));
            }
        }
        typeEl.addEventListener('change', syncMaxFibersField);
        syncMaxFibersField();
    }
}

function readCableSplitSleeveOptions(container) {
    var root = container && container.querySelector ? container : document;
    var block = root.querySelector ? root.querySelector('.cable-split-sleeve-fields') : null;
    var sleeveType = 'SNR-FOSC-L';
    var sleeveName = '';
    var maxFibers = getDefaultMaxFibersForSleeveType(sleeveType);
    if (!block) return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: maxFibers };
    var typeEl = block.querySelector('.cable-split-sleeve-type');
    var nameEl = block.querySelector('.cable-split-sleeve-name');
    var maxEl = block.querySelector('.cable-split-sleeve-max');
    if (typeEl && typeEl.value) sleeveType = typeEl.value;
    if (nameEl && nameEl.value) sleeveName = String(nameEl.value).trim();
    if (sleeveType === 'custom') {
        maxFibers = maxEl ? parseInt(maxEl.value, 10) : 0;
        if (isNaN(maxFibers)) maxFibers = 0;
    } else {
        maxFibers = getDefaultMaxFibersForSleeveType(sleeveType);
    }
    return { sleeveType: sleeveType, sleeveName: sleeveName, maxFibers: maxFibers };
}

function mergeCableSplitSleeveOptions(splitBase, sleeveOpts) {
    var out = Object.assign({}, splitBase || {});
    if (!sleeveOpts) return out;
    if (sleeveOpts.sleeveType) out.sleeveType = sleeveOpts.sleeveType;
    if (sleeveOpts.sleeveName) out.sleeveName = sleeveOpts.sleeveName;
    if (sleeveOpts.maxFibers !== undefined && sleeveOpts.maxFibers !== null) out.maxFibers = sleeveOpts.maxFibers;
    return out;
}

function checkAuth() {
    if (typeof AuthSystem === 'undefined') {
        console.warn('AuthSystem не загружен');
        return true; 
    }
    
    const session = AuthSystem.getCurrentSession();
    if (!session) {
        window.location.href = 'auth.html';
        return false;
    }
    
    currentUser = session;
    if (session.organization && session.organization.mapLimits) {
        applyMapLimitsCache(session.organization.mapLimits);
    } else {
        refreshMapLimitsFromServer();
    }
    return true;
}

function requireAdmin() {
    if (!currentUser || currentUser.role !== 'admin') {
        showWarning('Это действие доступно только администраторам', 'Нет доступа');
        return false;
    }
    return true;
}

function canEdit() {
    return currentUser && currentUser.role === 'admin';
}

var WELCOME_DISMISSED_KEY = 'networkMap_welcomeDismissed';

function getWelcomeDismissedKeyForCurrentUser() {
    var suffix = 'guest';
    if (currentUser) {
        if (currentUser.userId != null && String(currentUser.userId).trim() !== '') {
            suffix = String(currentUser.userId).trim();
        } else if (currentUser.username) {
            suffix = String(currentUser.username).trim().toLowerCase();
        }
    }
    return WELCOME_DISMISSED_KEY + '_' + suffix;
}

function closeWelcomeModal() {
    var wm = document.getElementById('welcomeModal');
    if (!wm) return;
    wm.style.display = 'none';
    wm.classList.remove('modal--centered');
    wm.setAttribute('aria-hidden', 'true');
    try { localStorage.setItem(getWelcomeDismissedKeyForCurrentUser(), '1'); } catch (e) {}
}

function initWelcomeModal() {
    var wm = document.getElementById('welcomeModal');
    if (!wm) return;
    try {
        if (localStorage.getItem(getWelcomeDismissedKeyForCurrentUser())) return;
    } catch (e) {}
    wm.style.display = 'flex';
    wm.classList.add('modal--centered');
    wm.setAttribute('aria-hidden', 'false');
    function onClose() {
        closeWelcomeModal();
    }
    wm.addEventListener('click', function(e) {
        if (e.target === wm) onClose();
    });
    var closeBtn = document.getElementById('welcomeModalCloseBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', onClose);
        closeBtn.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
            }
        });
    }
    var okBtn = document.getElementById('welcomeModalOk');
    if (okBtn) okBtn.addEventListener('click', onClose);
}

document.addEventListener('DOMContentLoaded', function() {
    
    if (!checkAuth()) return;

    startMapLoadSafetyTimeout();

    initUserUI();
    initWelcomeModal();
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var wm = document.getElementById('welcomeModal');
        if (!wm || wm.style.display === 'none') return;
        closeWelcomeModal();
        e.preventDefault();
    });
    
    if (currentUser && currentUser.role === 'user') {
        try {
            if (!localStorage.getItem('networkMap_viewModeHintShown')) {
                localStorage.setItem('networkMap_viewModeHintShown', '1');
                if (typeof showInfo === 'function') showInfo('Включён режим просмотра. Редактирование карты доступно только администраторам.', 'Режим просмотра');
            }
        } catch (e) {}
    }
    
    function whenYmapsReady(cb) {
        if (window.ymaps) { window.ymaps.ready(cb); return; }
        var attempts = 0;
        var maxAttempts = 600;
        var t = setInterval(function() {
            attempts++;
            if (window.ymaps) {
                clearInterval(t);
                window.ymaps.ready(cb);
            } else if (attempts >= maxAttempts) {
                clearInterval(t);
                if (typeof markMapDataReady === 'function') markMapDataReady();
                if (typeof markMapTilesReady === 'function') markMapTilesReady();
            }
        }, 50);
    }
    whenYmapsReady(init);
    refreshMapLimitsFromServer();

    // Авто‑подключение к синхронизации для организации при входе на карту,
    // только если ещё нет сохранённого адреса sync-сервера
    try {
        var hasSavedSyncUrl = false;
        try {
            hasSavedSyncUrl = !!sessionStorage.getItem('networkMap_syncUrl');
        } catch (e) {}
        if (!hasSavedSyncUrl && typeof window.syncConnect === 'function') {
            setTimeout(function() {
                try {
                    window.syncConnect();
                } catch (e) {}
            }, 2000);
        }
    } catch (e) {}
    
    (async function() {
        await new Promise(function(r) { setTimeout(r, 1500); });
        const result = await checkForUpdates(true);
        lastUpdateCheckResult = result;
        var updatesModal = document.getElementById('updatesModal');
        if (updatesModal && updatesModal.style.display === 'block') {
            renderUpdatesModalContent(result);
        }
    })();
});

function getAvatarImageSrc(avatarUrl) {
    if (!avatarUrl) return '';
    var base = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
    var path = avatarUrl.charAt(0) === '/' ? avatarUrl : '/' + avatarUrl;
    var url = base ? (base.replace(/\/$/, '') + path) : path;
    var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    if (token) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
    return url;
}

function getUserDisplayInitial(user) {
    if (!user) return '?';
    return String(user.fullName || user.username || '?').charAt(0).toUpperCase() || '?';
}

function applyAvatarToElement(el, user) {
    if (!el) return;
    var initial = getUserDisplayInitial(user);
    var avatarUrl = user && user.avatarUrl;
    var img = el.querySelector('.avatar-img');
    if (avatarUrl && getApiBase() && getAuthToken()) {
        if (!img) {
            img = document.createElement('img');
            img.className = 'avatar-img';
            img.alt = '';
            el.textContent = '';
            el.appendChild(img);
        }
        img.onerror = function() {
            img.remove();
            el.classList.remove('has-avatar-image');
            el.textContent = initial;
            el.removeAttribute('aria-label');
        };
        img.src = getAvatarImageSrc(avatarUrl);
        el.classList.add('has-avatar-image');
        el.setAttribute('aria-label', 'Аватар');
    } else {
        if (img) img.remove();
        el.classList.remove('has-avatar-image');
        el.textContent = initial;
        el.removeAttribute('aria-label');
    }
}

function buildUserAvatarHtml(user, extraClass) {
    var initial = getUserDisplayInitial(user);
    var cls = 'user-item-avatar' + (extraClass ? ' ' + extraClass : '');
    if (user && user.avatarUrl && getApiBase() && getAuthToken()) {
        var src = escapeHtml(getAvatarImageSrc(user.avatarUrl));
        return '<div class="' + cls + ' has-avatar-image"><img class="avatar-img" src="' + src + '" alt=""></div>';
    }
    return '<div class="' + cls + '">' + escapeHtml(initial) + '</div>';
}

function updateCurrentUserAvatarUrl(avatarUrl) {
    if (!currentUser) return;
    if (avatarUrl) currentUser.avatarUrl = avatarUrl;
    else delete currentUser.avatarUrl;
    try {
        var raw = sessionStorage.getItem('networkMap_session');
        var stored = raw ? JSON.parse(raw) : null;
        if (stored) {
            if (avatarUrl) stored.avatarUrl = avatarUrl;
            else delete stored.avatarUrl;
            sessionStorage.setItem('networkMap_session', JSON.stringify(stored));
        }
        if (localStorage.getItem('networkMap_session')) {
            if (avatarUrl) currentUser.avatarUrl = avatarUrl;
            localStorage.setItem('networkMap_session', JSON.stringify(currentUser));
        }
    } catch (e) {}
}

function setupProfileAvatarHandlers() {
    var input = document.getElementById('profileAvatarInput');
    var removeBtn = document.getElementById('profileAvatarRemoveBtn');
    if (!input || input._avatarBound) return;
    input._avatarBound = true;
    input.addEventListener('change', function() {
        var file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        if (!getApiBase() || !getAuthToken()) {
            if (typeof showWarning === 'function') showWarning('Загрузка аватара доступна только при работе с сервером.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            if (typeof showError === 'function') showError('Файл больше 2 МБ');
            return;
        }
        var reader = new FileReader();
        reader.onload = function() {
            var dataUrl = reader.result;
            fetch(getApiBase() + '/api/users/me/avatar', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + getAuthToken(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ dataUrl: dataUrl })
            }).then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
              .then(function(res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Не удалось загрузить');
                updateCurrentUserAvatarUrl(res.body.avatarUrl);
                applyAvatarToElement(document.getElementById('userAvatar'), currentUser);
                renderProfileUserInfo();
                if (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) {
                    AuthSystem.refreshUsersFromApi().then(function() {
                        if (typeof renderUsersList === 'function') renderUsersList();
                    });
                }
                if (typeof showSuccess === 'function') showSuccess('Фото обновлено');
              })
              .catch(function(err) {
                if (typeof showError === 'function') showError(err.message || 'Ошибка загрузки');
              });
        };
        reader.readAsDataURL(file);
    });
    if (removeBtn) {
        removeBtn.addEventListener('click', function() {
            if (!getApiBase() || !getAuthToken()) return;
            fetch(getApiBase() + '/api/users/me/avatar', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + getAuthToken() }
            }).then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
              .then(function(res) {
                if (!res.ok) throw new Error((res.body && res.body.error) || 'Не удалось удалить');
                updateCurrentUserAvatarUrl(null);
                applyAvatarToElement(document.getElementById('userAvatar'), currentUser);
                renderProfileUserInfo();
                if (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) {
                    AuthSystem.refreshUsersFromApi().then(function() {
                        if (typeof renderUsersList === 'function') renderUsersList();
                    });
                }
                if (typeof showSuccess === 'function') showSuccess('Фото удалено');
              })
              .catch(function(err) {
                if (typeof showError === 'function') showError(err.message || 'Ошибка');
              });
        });
    }
}

function initUserUI() {
    if (!currentUser) return;

    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    if (userAvatar) {
        applyAvatarToElement(userAvatar, currentUser);
        userAvatar.addEventListener('click', openProfileModal);
        userAvatar.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openProfileModal();
            }
        });
    }
    if (userName) {
        userName.textContent = currentUser.fullName || currentUser.username;
    }
    if (userRole) {
        userRole.textContent = currentUser.role === 'admin' ? 'Администратор' : 'Пользователь';
        userRole.className = 'user-role ' + currentUser.role;
    }

    const usersManageBtn = document.getElementById('usersManageBtn');
    if (usersManageBtn) {
        usersManageBtn.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
    }

    const backupsSection = document.getElementById('backupsAccordionSection');
    if (backupsSection) {
        backupsSection.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    }
    const deviceCatalogBtn = document.getElementById('deviceCatalogBtn');
    if (deviceCatalogBtn) {
        deviceCatalogBtn.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
        deviceCatalogBtn.addEventListener('click', openDeviceCatalogModal);
    }

    const editModeBtn = document.getElementById('editMode');
    if (editModeBtn && currentUser.role !== 'admin') {
        editModeBtn.style.display = 'none';
    }
    
    if (currentUser.role !== 'admin') {
        hideAdminOnlyElements();
        if (typeof switchToViewMode === 'function') switchToViewMode(false);
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            if (typeof AuthSystem !== 'undefined') {
                AuthSystem.logout();
            }
        });
    }
    
    if (usersManageBtn) {
        usersManageBtn.addEventListener('click', openUsersModal);
    }

    const historyBtn = document.getElementById('historyBtn');
    if (historyBtn && typeof openHistoryModal === 'function') {
        historyBtn.addEventListener('click', openHistoryModal);
    }

    const infoHelpBtn = document.getElementById('infoHelpBtn');
    if (infoHelpBtn) infoHelpBtn.addEventListener('click', openHelpModal);
    setupUsersModalHandlers();

    if (typeof setupHistoryModalHandlers === 'function') setupHistoryModalHandlers();

    setupHelpModalHandlers();
    setupUpdatesModalHandlers();
    setupBackupsSection();
    setupDeviceCatalogModalHandlers();

    setupSidebarToggle();
    setupStatsToggle();
    setupProfileAvatarHandlers();

    if (typeof updateHistoryBadge === 'function') updateHistoryBadge();
}

var mapLimitsCache = { count: 0, limit: 2000, unlocked: false, remaining: 2000, defaultFreeLimit: 2000 };
var MAP_LIMIT_WARN_RATIO = 0.98;
var MAP_LIMIT_BANNER_DISMISS_KEY = 'mapLimitBannerDismissedCount';
var mapLimitBannerCloseBound = false;
var OWNER_CONTACT_EMAIL = 'danil.sechin3@gmail.com';
var OWNER_CONTACT_MAILTO = 'mailto:' + OWNER_CONTACT_EMAIL + '?subject=' + encodeURIComponent('Снятие лимита объектов — Карта оптической сети');

function getOwnerContactPageUrl() {
    try {
        var origin = window.location && window.location.origin ? window.location.origin : '';
        if (origin && origin.indexOf('localhost') === -1 && origin.indexOf('127.0.0.1') === -1) {
            return origin.replace(/\/$/, '') + '/#contacts';
        }
    } catch (e) {}
    return '/#contacts';
}

function applyMapLimitsCache(limits) {
    if (!limits || typeof limits !== 'object') return;
    mapLimitsCache.count = limits.count != null ? limits.count : mapLimitsCache.count;
    mapLimitsCache.limit = limits.limit != null ? limits.limit : (limits.unlocked ? null : mapLimitsCache.limit);
    mapLimitsCache.unlocked = !!limits.unlocked;
    mapLimitsCache.remaining = limits.remaining != null ? limits.remaining : mapLimitsCache.remaining;
    if (limits.defaultFreeLimit != null) mapLimitsCache.defaultFreeLimit = limits.defaultFreeLimit;
    updateMapLimitBanner();
}

function refreshMapLimitsFromServer() {
    if (!getApiBase() || !getAuthToken()) return Promise.resolve();
    return fetch(getApiBase() + '/api/map-limits', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) { return r.ok ? r.json() : null; })
        .then(function(body) {
            if (body && body.mapLimits) applyMapLimitsCache(body.mapLimits);
        })
        .catch(function() {});
}

function isMapLimitNearlyFull() {
    if (mapLimitsCache.unlocked || mapLimitsCache.limit == null) return false;
    var limit = mapLimitsCache.limit;
    if (!limit || limit <= 0) return false;
    var count = mapLimitsCache.count != null ? mapLimitsCache.count : 0;
    return count / limit >= MAP_LIMIT_WARN_RATIO;
}

function isMapLimitBannerDismissed() {
    try {
        var raw = sessionStorage.getItem(MAP_LIMIT_BANNER_DISMISS_KEY);
        if (raw == null || raw === '') return false;
        var data = JSON.parse(raw);
        if (!data || data.limit !== mapLimitsCache.limit) return false;
        var count = mapLimitsCache.count != null ? mapLimitsCache.count : 0;
        return count <= (data.count || 0);
    } catch (e) {
        return false;
    }
}

function dismissMapLimitBanner() {
    try {
        sessionStorage.setItem(MAP_LIMIT_BANNER_DISMISS_KEY, JSON.stringify({
            count: mapLimitsCache.count != null ? mapLimitsCache.count : 0,
            limit: mapLimitsCache.limit
        }));
    } catch (e) {}
    updateMapLimitBanner();
}

function bindMapLimitBannerClose() {
    if (mapLimitBannerCloseBound) return;
    var el = document.getElementById('mapLimitBanner');
    if (!el) return;
    var btn = el.querySelector('.map-limit-banner__close');
    if (!btn) return;
    mapLimitBannerCloseBound = true;
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        dismissMapLimitBanner();
    });
}

function updateMapLimitBanner() {
    var el = document.getElementById('mapLimitBanner');
    if (!el) return;
    bindMapLimitBannerClose();
    var msgEl = el.querySelector('.map-limit-banner__message');
    if (!isMapLimitNearlyFull() || isMapLimitBannerDismissed()) {
        el.style.display = 'none';
        if (msgEl) msgEl.textContent = '';
        return;
    }
    var count = mapLimitsCache.count != null ? mapLimitsCache.count : 0;
    var limit = mapLimitsCache.limit;
    var remaining = mapLimitsCache.remaining != null ? mapLimitsCache.remaining : Math.max(0, limit - count);
    var text = 'Почти исчерпан лимит объектов на карте: ' + count + ' из ' + limit + ' (осталось ' + remaining + '). ';
    if (msgEl) {
        msgEl.innerHTML = text + '<a href="' + OWNER_CONTACT_MAILTO + '" style="color:inherit;text-decoration:underline;">Связаться с владельцем</a>';
    }
    el.style.display = 'flex';
}

function onMapObjectLimitError(message, limits) {
    if (limits) applyMapLimitsCache(limits);
    var text = message || 'Достигнут лимит объектов на карте. Чтобы снять ограничение, напишите владельцу программы.';
    if (typeof showWarning === 'function') {
        showWarning(text + ' <a href="' + OWNER_CONTACT_MAILTO + '" style="color:inherit;">Написать владельцу</a>', 'Лимит объектов');
    } else {
        alert(text);
    }
}
window.onMapObjectLimitError = onMapObjectLimitError;

function wouldExceedMapObjectLimit(extraCount) {
    extraCount = extraCount || 1;
    if (mapLimitsCache.unlocked || mapLimitsCache.limit == null) return false;
    var count = mapLimitsCache.count != null ? mapLimitsCache.count : 0;
    return (count + extraCount) > mapLimitsCache.limit;
}

function notifyMapObjectLimitBlocked() {
    onMapObjectLimitError('Достигнут лимит объектов на карте (' + mapLimitsCache.limit + ').');
    return false;
}

function setProfileModalField(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value != null && value !== '' ? String(value) : '—';
}

function setProfileStatusBadge(status) {
    var el = document.getElementById('profileStatus');
    if (!el) return;
    el.classList.remove('profile-status-badge--active', 'profile-status-badge--suspended', 'profile-status-badge--neutral');
    if (status === 'suspended') {
        el.textContent = 'Приостановлена';
        el.classList.add('profile-status-badge--suspended');
    } else if (status === 'active') {
        el.textContent = 'Активна';
        el.classList.add('profile-status-badge--active');
    } else {
        el.textContent = status || '—';
        el.classList.add('profile-status-badge--neutral');
    }
}

function setProfileMetricBar(fillId, barId, active, limit, unlimited) {
    var fill = document.getElementById(fillId);
    var bar = document.getElementById(barId);
    if (!fill || !bar) return;
    fill.classList.remove('profile-metric-bar-fill--warn', 'profile-metric-bar-fill--danger');
    if (unlimited || limit == null || limit <= 0) {
        bar.hidden = true;
        fill.style.width = '0';
        return;
    }
    bar.hidden = false;
    var a = Number(active) || 0;
    var l = Number(limit) || 1;
    var pct = Math.min(100, Math.round((a / l) * 100));
    fill.style.width = pct + '%';
    if (pct >= 98) fill.classList.add('profile-metric-bar-fill--danger');
    else if (pct >= 85) fill.classList.add('profile-metric-bar-fill--warn');
}

function renderProfileUserInfo() {
    var u = currentUser;
    var nameEl = document.getElementById('profileUserName');
    var roleEl = document.getElementById('profileUserRole');
    var avatarEl = document.getElementById('profileUserAvatar');
    if (!u) {
        setProfileModalField('profileUserName', '—');
        if (roleEl) { roleEl.textContent = '—'; roleEl.className = 'profile-user-role'; }
        if (avatarEl) avatarEl.textContent = '?';
        return;
    }
    var displayName = u.fullName || u.username || '—';
    setProfileModalField('profileUserName', displayName);
    if (roleEl) {
        roleEl.textContent = u.role === 'admin' ? 'Администратор' : 'Пользователь';
        roleEl.className = 'profile-user-role' + (u.role === 'admin' ? ' admin' : '');
    }
    if (avatarEl) applyAvatarToElement(avatarEl, u);
    var removeBtn = document.getElementById('profileAvatarRemoveBtn');
    var uploadWrap = document.querySelector('.profile-avatar-controls');
    if (uploadWrap) uploadWrap.style.display = (getApiBase() && getAuthToken()) ? '' : 'none';
    if (removeBtn) removeBtn.style.display = (u && u.avatarUrl) ? '' : 'none';
}

function renderProfileOrganizationInfo(org) {
    renderProfileUserInfo();
    if (!org) {
        setProfileModalField('profileOrgName', 'Не привязана');
        setProfileStatusBadge('—');
        setProfileModalField('profileMapObjects', '—');
        setProfileModalField('profileMapLimit', '');
        setProfileModalField('profileConcurrentUsers', '—');
        var cuLimitEmpty = document.getElementById('profileConcurrentLimit');
        if (cuLimitEmpty) cuLimitEmpty.textContent = '';
        setProfileMetricBar('profileMapLimitFill', 'profileMapLimitBar', 0, 0, true);
        setProfileMetricBar('profileConcurrentFill', 'profileConcurrentBar', 0, 0, true);
        return;
    }
    var limits = org.mapLimits || mapLimitsCache;
    if (limits) applyMapLimitsCache(limits);
    var count = limits && limits.count != null ? limits.count : null;
    setProfileModalField('profileOrgName', org.name || '—');
    setProfileStatusBadge(org.status === 'suspended' ? 'suspended' : 'active');
    setProfileModalField('profileMapObjects', count != null ? String(count) : '—');
    if (limits && limits.unlocked) {
        setProfileModalField('profileMapLimit', '∞');
        setProfileMetricBar('profileMapLimitFill', 'profileMapLimitBar', count, 0, true);
    } else if (limits && limits.limit != null) {
        setProfileModalField('profileMapLimit', String(limits.limit));
        setProfileMetricBar('profileMapLimitFill', 'profileMapLimitBar', count, limits.limit, false);
    } else {
        setProfileModalField('profileMapLimit', '');
        setProfileMetricBar('profileMapLimitFill', 'profileMapLimitBar', 0, 0, true);
    }
    var cu = org.concurrentUsers;
    var cuLimitEl = document.getElementById('profileConcurrentLimit');
    if (cu && cu.unlimited) {
        setProfileModalField('profileConcurrentUsers', String(cu.active != null ? cu.active : 0));
        if (cuLimitEl) cuLimitEl.textContent = '∞';
        setProfileMetricBar('profileConcurrentFill', 'profileConcurrentBar', cu.active, 0, true);
    } else if (cu && cu.limit != null) {
        setProfileModalField('profileConcurrentUsers', String(cu.active != null ? cu.active : 0));
        if (cuLimitEl) cuLimitEl.textContent = String(cu.limit);
        setProfileMetricBar('profileConcurrentFill', 'profileConcurrentBar', cu.active, cu.limit, false);
    } else {
        setProfileModalField('profileConcurrentUsers', '—');
        if (cuLimitEl) cuLimitEl.textContent = '';
        setProfileMetricBar('profileConcurrentFill', 'profileConcurrentBar', 0, 0, true);
    }
}

function openProfileModal() {
    var modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.style.display = 'block';
    renderProfileUserInfo();
    setProfileModalField('profileOrgName', 'Загрузка…');
    setProfileStatusBadge('…');
    setProfileModalField('profileMapObjects', '…');
    setProfileModalField('profileMapLimit', '');
    setProfileModalField('profileConcurrentUsers', '…');

    if (!getApiBase() || !getAuthToken()) {
        renderProfileOrganizationInfo(currentUser && currentUser.organization ? currentUser.organization : null);
        return;
    }
    fetch(getApiBase() + '/api/organizations/me', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) {
        return r.ok ? r.json() : null;
    }).then(function(body) {
        var org = body && body.organization ? body.organization : (currentUser && currentUser.organization ? currentUser.organization : null);
        renderProfileOrganizationInfo(org);
    }).catch(function() {
        renderProfileOrganizationInfo(currentUser && currentUser.organization ? currentUser.organization : null);
        if (typeof showWarning === 'function') showWarning('Не удалось загрузить актуальные данные организации.', 'Личный кабинет');
    });
}

function closeProfileModal() {
    var modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

function hideAdminOnlyElements() {
    
    const objectsAccordion = document.querySelector('[data-accordion="objects"]');
    if (objectsAccordion) {
        objectsAccordion.parentElement.style.display = 'none';
    }

    const cablesAccordion = document.querySelector('[data-accordion="cables"]');
    if (cablesAccordion) {
        cablesAccordion.parentElement.style.display = 'none';
    }

    const actionsSection = document.querySelector('.actions-section');
    if (actionsSection) actionsSection.style.display = 'none';
    const dangerSection = document.querySelector('.accordion-section-danger');
    if (dangerSection) dangerSection.style.display = 'none';

    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
        const warning = document.createElement('div');
        warning.className = 'readonly-warning';
        warning.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>Режим просмотра. Редактирование доступно только администраторам.</span>
        `;
        sidebarContent.insertBefore(warning, sidebarContent.firstChild);
    }
}

function openUsersModal() {
    if (!requireAdmin()) return;
    
    const modal = document.getElementById('usersModal');
    modal.style.display = 'block';
    renderUsersList();
    loadOrgSecurityPanel();
}

var orgSecurityPendingSecret = '';

function isOrgMapAdmin() {
    return !!(currentUser && currentUser.role === 'admin' && currentUser.organizationId);
}

function loadOrgSecurityPanel() {
    var section = document.getElementById('orgSecuritySection');
    if (!section) return;
    if (!isOrgMapAdmin() || !getApiBase()) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    var statusEl = document.getElementById('orgSecurityStatus');
    if (statusEl) statusEl.textContent = 'Загрузка…';
    fetch(getApiBase() + '/api/organizations/me/security', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        renderOrgSecurityPanel(!!body.twoFactorEnabled);
    }).catch(function(e) {
        if (statusEl) statusEl.textContent = e.message || 'Не удалось загрузить настройки';
    });
}

function renderOrgSecurityPanel(enabled) {
    var statusEl = document.getElementById('orgSecurityStatus');
    var setupBtn = document.getElementById('org2faSetupBtn');
    var disableBtn = document.getElementById('org2faDisableBtn');
    var setupPanel = document.getElementById('orgSecuritySetup');
    var disablePanel = document.getElementById('org2faDisablePanel');
    orgSecurityPendingSecret = '';
    if (setupPanel) setupPanel.style.display = 'none';
    if (disablePanel) disablePanel.style.display = 'none';
    if (statusEl) {
        statusEl.textContent = enabled
            ? '2FA включена: при входе все пользователи организации вводят код из общего приложения-аутентификатора.'
            : '2FA выключена.';
        statusEl.className = 'org-security-status' + (enabled ? ' is-on' : '');
    }
    if (setupBtn) setupBtn.style.display = enabled ? 'none' : 'inline-flex';
    if (disableBtn) disableBtn.style.display = enabled ? 'inline-flex' : 'none';
}

function startOrg2faSetup() {
    if (!getApiBase()) return;
    fetch(getApiBase() + '/api/organizations/me/security/2fa/setup', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' }
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        orgSecurityPendingSecret = body.secret || '';
        var setupPanel = document.getElementById('orgSecuritySetup');
        var qr = document.getElementById('org2faQr');
        var secretEl = document.getElementById('org2faSecret');
        if (setupPanel) setupPanel.style.display = 'block';
        if (qr) {
            qr.src = body.qrCodeUrl || '';
            qr.style.display = body.qrCodeUrl ? 'block' : 'none';
        }
        if (secretEl) secretEl.textContent = orgSecurityPendingSecret;
        var codeEl = document.getElementById('org2faEnableCode');
        if (codeEl) { codeEl.value = ''; codeEl.focus(); }
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Ошибка настройки 2FA');
    });
}

function enableOrg2fa() {
    var code = (document.getElementById('org2faEnableCode') && document.getElementById('org2faEnableCode').value || '').replace(/\s/g, '');
    if (!orgSecurityPendingSecret || !/^\d{6,8}$/.test(code)) {
        if (typeof showWarning === 'function') showWarning('Введите код из приложения после сканирования QR', '2FA');
        return;
    }
    fetch(getApiBase() + '/api/organizations/me/security/2fa/enable', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: orgSecurityPendingSecret, totpCode: code })
    }).then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
    .then(function(res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка');
        if (typeof showSuccess === 'function') showSuccess('Двухфакторная аутентификация включена');
        renderOrgSecurityPanel(true);
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Не удалось включить 2FA');
    });
}

function disableOrg2fa() {
    var panel = document.getElementById('org2faDisablePanel');
    if (panel) panel.style.display = 'block';
    var codeEl = document.getElementById('org2faDisableCode');
    if (codeEl) { codeEl.value = ''; codeEl.focus(); }
}

function confirmDisableOrg2fa() {
    var code = (document.getElementById('org2faDisableCode') && document.getElementById('org2faDisableCode').value || '').replace(/\s/g, '');
    if (!/^\d{6,8}$/.test(code)) {
        if (typeof showWarning === 'function') showWarning('Введите текущий код 2FA', '2FA');
        return;
    }
    fetch(getApiBase() + '/api/organizations/me/security/2fa/disable', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode: code })
    }).then(function(r) { return r.json().then(function(b) { return { ok: r.ok, body: b }; }); })
    .then(function(res) {
        if (!res.ok) throw new Error((res.body && res.body.error) || 'Ошибка');
        if (typeof showSuccess === 'function') showSuccess('2FA отключена');
        renderOrgSecurityPanel(false);
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Не удалось отключить 2FA');
    });
}

function closeUsersModal() {
    const modal = document.getElementById('usersModal');
    modal.style.display = 'none';
}

var cachedOrganizationsList = null;
function openOrganizationsModal() {
    if (!requireAdmin()) return;
    var modal = document.getElementById('organizationsModal');
    if (modal) modal.style.display = 'block';
    fetchOrganizationsAndRender();
}
function closeOrganizationsModal() {
    var modal = document.getElementById('organizationsModal');
    if (modal) modal.style.display = 'none';
}
function fetchOrganizationsAndRender() {
    if (!getApiBase()) return;
    fetch(getApiBase() + '/api/organizations', { headers: { 'Authorization': 'Bearer ' + getAuthToken() } })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            if (body && body.organizations) {
                cachedOrganizationsList = body.organizations;
                renderOrganizationsList(body.organizations);
            }
        })
        .catch(function() {});
}
function renderOrganizationsList(organizations) {
    var container = document.getElementById('organizationsList');
    if (!container) return;
    if (!organizations || organizations.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px;">Нет организаций. Создайте первую.</div>';
        return;
    }
    var html = '';
    organizations.forEach(function(org) {
        var limitText = org.mapObjectLimitUnlocked ? 'Без лимита' :
            ((org.mapObjectCount != null ? org.mapObjectCount : 0) + ' / ' + (org.mapObjectLimit != null ? org.mapObjectLimit : '—'));
        var statusClass = org.status === 'suspended' ? 'rejected' : 'approved';
        html += '<div class="user-item">';
        html += '<div class="user-item-info" style="flex: 1;">';
        html += '<div class="user-item-name">' + escapeHtml(org.name) + '</div>';
        html += '<div class="user-item-username">Объекты: ' + escapeHtml(limitText) + ' · Сессий: ' + (org.activeSessions != null ? org.activeSessions : '—') + '</div>';
        html += '</div>';
        html += '<span class="user-item-role ' + statusClass + '">' + (org.status === 'suspended' ? 'Приостановлена' : 'Активна') + '</span>';
        html += '<div class="user-item-actions"><button class="user-item-btn" title="Редактировать" onclick="editOrganization(\'' + escapeHtml(org.id) + '\')">Изменить</button></div>';
        html += '</div>';
    });
    container.innerHTML = html;
}
function editOrganization(orgId) {
    var org = (cachedOrganizationsList || []).find(function(o) { return o.id === orgId; });
    if (!org) return;
    document.getElementById('editOrgId').value = org.id;
    document.getElementById('organizationEditTitle').textContent = 'Редактировать организацию';
    document.getElementById('editOrgName').value = org.name || '';
    document.getElementById('editOrgMapLimitUnlocked').checked = !!org.mapObjectLimitUnlocked;
    document.getElementById('editOrgCustomMapLimit').value = org.customMapObjectLimit != null ? org.customMapObjectLimit : '';
    document.getElementById('editOrgStatus').value = org.status || 'active';
    document.getElementById('organizationEditModal').style.display = 'block';
}
function openAddOrganizationForm() {
    document.getElementById('editOrgId').value = '';
    document.getElementById('organizationEditTitle').textContent = 'Добавить организацию';
    document.getElementById('editOrgName').value = '';
    document.getElementById('editOrgMapLimitUnlocked').checked = false;
    document.getElementById('editOrgCustomMapLimit').value = '';
    document.getElementById('editOrgStatus').value = 'active';
    document.getElementById('organizationEditModal').style.display = 'block';
}
function saveOrganizationFromModal() {
    var id = document.getElementById('editOrgId').value;
    var name = document.getElementById('editOrgName').value.trim() || 'Организация';
    var unlocked = document.getElementById('editOrgMapLimitUnlocked').checked;
    var customLimitRaw = document.getElementById('editOrgCustomMapLimit').value.trim();
    var customLimit = customLimitRaw === '' ? null : parseInt(customLimitRaw, 10);
    if (customLimit != null && isNaN(customLimit)) customLimit = null;
    var status = document.getElementById('editOrgStatus').value;
    var payload = {
        name: name,
        mapObjectLimitUnlocked: unlocked,
        customMapObjectLimit: customLimit,
        status: status
    };
    if (id) {
        fetch(getApiBase() + '/api/organizations/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
            body: JSON.stringify(payload)
        }).then(function(r) {
            if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка'); });
            return fetchOrganizationsAndRender();
        }).then(function() {
            if (typeof showSuccess === 'function') showSuccess('Организация обновлена');
            document.getElementById('organizationEditModal').style.display = 'none';
        }).catch(function(e) { if (typeof showError === 'function') showError(e.message || 'Не удалось обновить'); });
    } else {
        fetch(getApiBase() + '/api/organizations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
            body: JSON.stringify(payload)
        }).then(function(r) {
            if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка'); });
            return fetchOrganizationsAndRender();
        }).then(function() {
            if (typeof showSuccess === 'function') showSuccess('Организация создана');
            document.getElementById('organizationEditModal').style.display = 'none';
        }).catch(function(e) { if (typeof showError === 'function') showError(e.message || 'Не удалось создать'); });
    }
}

function renderUsersList() {
    const container = document.getElementById('usersList');
    const pendingContainer = document.getElementById('pendingUsersList');
    const pendingSection = document.getElementById('pendingUsersSection');
    const pendingCountBadge = document.getElementById('pendingCount');
    
    if (!container || typeof AuthSystem === 'undefined') return;
    
    const users = AuthSystem.getUsers();

    const pendingUsers = users.filter(u => u.status === 'pending');
    const activeUsers = users.filter(u => u.status !== 'pending' && u.status !== 'rejected');
    const rejectedUsers = users.filter(u => u.status === 'rejected');

    if (pendingSection && pendingContainer) {
        if (pendingUsers.length > 0) {
            pendingSection.style.display = 'block';
            pendingCountBadge.textContent = pendingUsers.length;
            
            let pendingHtml = '';
            pendingUsers.forEach(user => {
                const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
                
                pendingHtml += `
                    <div class="pending-user-item">
                        ${buildUserAvatarHtml(user, '')}
                        <div class="user-item-info">
                            <div class="user-item-name">${escapeHtml(user.fullName || user.username)}</div>
                            <div class="user-item-username">@${escapeHtml(user.username)}</div>
                            <div class="user-item-date">Заявка: ${createdDate}</div>
                        </div>
                        <div class="pending-user-actions">
                            <button class="btn-approve" onclick="approveUserRequest('${user.id}')">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Одобрить
                            </button>
                            <button class="btn-reject" onclick="rejectUserRequest('${user.id}')">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                                Отклонить
                            </button>
                        </div>
                    </div>
                `;
            });
            
            pendingContainer.innerHTML = pendingHtml;
        } else {
            pendingSection.style.display = 'none';
        }
    }

    if (activeUsers.length === 0 && rejectedUsers.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Нет пользователей</div>';
        return;
    }
    
    let html = '';
    
    const onlineIds = (typeof window.syncOnlineUserIds !== 'undefined' && Array.isArray(window.syncOnlineUserIds)) ? window.syncOnlineUserIds : [];
    
    activeUsers.forEach(user => {
        const roleClass = user.role === 'admin' ? 'admin' : 'user';
        const roleText = user.role === 'admin' ? 'Администратор' : 'Пользователь';
        const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
        const isCurrentUser = user.id === currentUser.userId;
        const isOnline = onlineIds.some(id => id == user.id);
        
        var orgLine = (user.organizationName ? ' · ' + escapeHtml(user.organizationName) : '');
        html += `
            <div class="user-item">
                ${buildUserAvatarHtml(user, roleClass)}
                <div class="user-item-info">
                    <div class="user-item-name">${escapeHtml(user.fullName || user.username)}${isCurrentUser ? ' (вы)' : ''}${isOnline ? ' <span class="user-item-online">В сети</span>' : ''}</div>
                    <div class="user-item-username">@${escapeHtml(user.username)}${orgLine}</div>
                    <div class="user-item-date">Создан: ${createdDate}</div>
                </div>
                <span class="user-item-role ${roleClass}">${roleText}</span>
                <div class="user-item-actions">
                    <button class="user-item-btn" title="Редактировать" onclick="editUser('${user.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    ${!isCurrentUser ? `
                    <button class="user-item-btn delete" title="Удалить" onclick="deleteUser('${user.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    rejectedUsers.forEach(user => {
        const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
        
        html += `
            <div class="user-item" style="opacity: 0.6;">
                ${buildUserAvatarHtml(user, '')}
                <div class="user-item-info">
                    <div class="user-item-name">${escapeHtml(user.fullName || user.username)}</div>
                    <div class="user-item-username">@${escapeHtml(user.username)}</div>
                    <div class="user-item-date">Отклонён: ${createdDate}</div>
                </div>
                <span class="user-item-role rejected">Отклонён</span>
                <div class="user-item-actions">
                    <button class="user-item-btn" title="Одобрить" onclick="approveUserRequest('${user.id}')" style="color: #22c55e;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                    <button class="user-item-btn delete" title="Удалить" onclick="deleteUser('${user.id}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}
window.renderUsersList = renderUsersList;

function approveUserRequest(userId) {
    if (typeof AuthSystem === 'undefined') return;
    var users = AuthSystem.getUsers();
    var user = users.find(function(u) { return u.id === userId; });
    var username = user ? user.username : '';
    Promise.resolve(AuthSystem.approveUser(userId)).then(function(result) {
        if (result.success) {
            showSuccess('Заявка одобрена. Пользователь получил доступ.', 'Заявка');
            renderUsersList();
            logAction(ActionTypes.USER_APPROVED, { username: username });
        } else {
            showError(result.error, 'Ошибка');
        }
    });
}

function rejectUserRequest(userId) {
    (async function() {
        if (!(await showConfirm('Вы уверены, что хотите отклонить эту заявку?', 'Отклонить заявку', { confirmText: 'Отклонить' }))) return;
        if (typeof AuthSystem === 'undefined') return;
        var users = AuthSystem.getUsers();
        var user = users.find(function(u) { return u.id === userId; });
        var username = user ? user.username : '';
        Promise.resolve(AuthSystem.rejectUser(userId)).then(function(result) {
            if (result.success) {
                showWarning('Заявка отклонена.', 'Заявка');
                renderUsersList();
                logAction(ActionTypes.USER_REJECTED, { username: username });
            } else {
                showError(result.error, 'Ошибка');
            }
        });
    })();
}

function openUserEditModal(userId = null) {
    const modal = document.getElementById('userEditModal');
    const title = document.getElementById('userEditTitle');
    const userIdInput = document.getElementById('editUserId');
    const usernameInput = document.getElementById('editUsername');
    const fullNameInput = document.getElementById('editFullName');
    const passwordInput = document.getElementById('editPassword');
    const roleSelect = document.getElementById('editRole');
    const orgSelect = document.getElementById('editOrganizationId');
    var orgs = (typeof AuthSystem !== 'undefined' && AuthSystem.getOrganizations) ? AuthSystem.getOrganizations() : [];
    if (orgSelect) {
        orgSelect.innerHTML = '<option value="">— Без организации —</option>';
        orgs.forEach(function(o) {
            var opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name || o.id;
            orgSelect.appendChild(opt);
        });
    }
    if (userId) {
        if (orgSelect) {
            var orgGroup = orgSelect.closest('.form-group');
            if (orgGroup) orgGroup.style.display = '';
        }
        const users = AuthSystem.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return;
        title.textContent = 'Редактировать пользователя';
        userIdInput.value = user.id;
        usernameInput.value = user.username;
        usernameInput.disabled = true;
        fullNameInput.value = user.fullName || '';
        passwordInput.value = '';
        roleSelect.value = user.role;
        if (orgSelect && user.organizationId) orgSelect.value = user.organizationId || '';
    } else {
        title.textContent = 'Добавить пользователя';
        userIdInput.value = '';
        usernameInput.value = '';
        usernameInput.disabled = false;
        fullNameInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'user';
        // При добавлении пользователь "наследует" организацию текущего админа.
        // Поэтому выпадающий список организации не нужен (скрываем), кроме случая глобального админа.
        if (orgSelect) {
            var orgGroup = orgSelect.closest('.form-group');
            if (currentUser && currentUser.organizationId != null) {
                if (orgGroup) orgGroup.style.display = 'none';
                orgSelect.value = currentUser.organizationId;
            } else {
                if (orgGroup) orgGroup.style.display = '';
                orgSelect.value = '';
            }
        }
    }
    modal.style.display = 'block';
}

function closeUserEditModal() {
    const modal = document.getElementById('userEditModal');
    modal.style.display = 'none';
}

function saveUser() {
    const userIdInput = document.getElementById('editUserId');
    const usernameInput = document.getElementById('editUsername');
    const fullNameInput = document.getElementById('editFullName');
    const passwordInput = document.getElementById('editPassword');
    const roleSelect = document.getElementById('editRole');
    
    const userId = userIdInput.value;
    const username = usernameInput.value.trim();
    const fullName = fullNameInput.value.trim();
    const password = passwordInput.value;
    const role = roleSelect.value;
    
    const users = AuthSystem.getUsers();
    
    if (userId) {
        
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            showError('Пользователь не найден');
            return;
        }
        if (users[userIndex].username === 'admin' && role !== 'admin') {
            showError('Нельзя снять роль администратора с главного администратора');
            return;
        }
        var orgSelect = document.getElementById('editOrganizationId');
        var organizationId = (orgSelect && orgSelect.value) ? orgSelect.value : null;
        var payload = { fullName: fullName || users[userIndex].username, role: role, organizationId: organizationId };
        if (password && password.length >= 6) payload.password = password;
        if (getApiBase()) {
            fetch(getApiBase() + '/api/users/' + encodeURIComponent(userId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify(payload)
            }).then(function(r) {
                if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка'); });
                if (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) return AuthSystem.refreshUsersFromApi();
            }).then(function() {
                showSuccess('Пользователь обновлён');
                closeUserEditModal();
                renderUsersList();
            }).catch(function(e) {
                showError(e.message || 'Не удалось обновить пользователя');
            });
            return;
        }
        users[userIndex].fullName = payload.fullName;
        users[userIndex].role = role;
        if (password) users[userIndex].password = AuthSystem.hashPassword(password);
        AuthSystem.saveUsers(users);
        showSuccess('Пользователь обновлён');
    } else {
        
        if (!username) { showError('Введите имя пользователя'); return; }
        if (!password) { showError('Введите пароль'); return; }
        if (password.length < 6) { showError('Пароль должен быть не менее 6 символов'); return; }
        if (AuthSystem.findUserByUsername(username)) { showError('Пользователь с таким именем уже существует'); return; }
        var orgSelect = document.getElementById('editOrganizationId');
        // В режиме добавления организация наследуется текущим админом.
        // Для глобального админа (organizationId === null) оставляем поведение с select.
        var organizationId = (currentUser && currentUser.organizationId != null)
            ? currentUser.organizationId
            : ((orgSelect && orgSelect.value) ? orgSelect.value : null);
        if (getApiBase()) {
            fetch(getApiBase() + '/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ username: username, password: password, fullName: fullName || username, role: role || 'user', organizationId: organizationId })
            }).then(function(r) {
                if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка'); });
                return (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) ? AuthSystem.refreshUsersFromApi() : Promise.resolve();
            }).then(function() {
                showSuccess('Пользователь создан');
                logAction(ActionTypes.USER_CREATED, { username: username });
                closeUserEditModal();
                renderUsersList();
            }).catch(function(e) { showError(e.message || 'Не удалось создать пользователя'); });
            return;
        }
        const newUser = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            username: username,
            password: AuthSystem.hashPassword(password),
            fullName: fullName || username,
            role: role,
            status: 'approved',
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        AuthSystem.saveUsers(users);
        showSuccess('Пользователь создан');
        logAction(ActionTypes.USER_CREATED, { username: username });
    }
    closeUserEditModal();
    renderUsersList();
}

function editUser(userId) {
    openUserEditModal(userId);
}

function deleteUser(userId) {
    (async function() {
        if (!(await showConfirm('Вы уверены, что хотите удалить этого пользователя?', 'Удалить пользователя', { confirmText: 'Удалить' }))) return;
    
    const users = AuthSystem.getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        showError('Пользователь не найден');
        return;
    }

    if (userId === currentUser.userId) {
        showError('Нельзя удалить свой аккаунт');
        return;
    }

    if (users[userIndex].username === 'admin') {
        showError('Нельзя удалить главного администратора');
        return;
    }
    
    const username = users[userIndex].username;

    if (getApiBase()) {
        fetch(getApiBase() + '/api/users/' + encodeURIComponent(userId), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        }).then(function(r) {
            if (!r.ok) return r.json().then(function(b) { throw new Error((b && b.error) || 'Ошибка удаления'); });
            return (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) ? AuthSystem.refreshUsersFromApi() : Promise.resolve();
        }).then(function() {
            showSuccess('Пользователь удалён');
            renderUsersList();
            logAction(ActionTypes.USER_DELETED, { username: username });
        }).catch(function(e) {
            showError(e.message || 'Не удалось удалить пользователя');
        });
        return;
    }

    users.splice(userIndex, 1);
    AuthSystem.saveUsers(users);
    showSuccess('Пользователь удалён');
    renderUsersList();
    logAction(ActionTypes.USER_DELETED, { username: username });
    })();
}

function setupUsersModalHandlers() {
    
    const closeUsersBtn = document.querySelector('.close-users');
    if (closeUsersBtn) {
        closeUsersBtn.addEventListener('click', closeUsersModal);
    }
    
    const usersModal = document.getElementById('usersModal');
    if (usersModal) {
        usersModal.addEventListener('click', function(e) {
            if (e.target === usersModal) closeUsersModal();
        });
    }

    const addUserBtn = document.getElementById('addUserBtn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', function() {
            openUserEditModal(null);
        });
    }

    const closeUserEditBtn = document.querySelector('.close-user-edit');
    if (closeUserEditBtn) {
        closeUserEditBtn.addEventListener('click', closeUserEditModal);
    }
    
    const userEditModal = document.getElementById('userEditModal');
    if (userEditModal) {
        userEditModal.addEventListener('click', function(e) {
            if (e.target === userEditModal) closeUserEditModal();
        });
    }

    const saveUserBtn = document.getElementById('saveUserBtn');
    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', saveUser);
    }
    
    const cancelUserEditBtn = document.getElementById('cancelUserEditBtn');
    if (cancelUserEditBtn) {
        cancelUserEditBtn.addEventListener('click', closeUserEditModal);
    }

    var org2faSetupBtn = document.getElementById('org2faSetupBtn');
    if (org2faSetupBtn) org2faSetupBtn.addEventListener('click', startOrg2faSetup);
    var org2faEnableBtn = document.getElementById('org2faEnableBtn');
    if (org2faEnableBtn) org2faEnableBtn.addEventListener('click', enableOrg2fa);
    var org2faCancelSetupBtn = document.getElementById('org2faCancelSetupBtn');
    if (org2faCancelSetupBtn) {
        org2faCancelSetupBtn.addEventListener('click', function() {
            orgSecurityPendingSecret = '';
            var setupPanel = document.getElementById('orgSecuritySetup');
            if (setupPanel) setupPanel.style.display = 'none';
        });
    }
    var org2faDisableBtn = document.getElementById('org2faDisableBtn');
    if (org2faDisableBtn) org2faDisableBtn.addEventListener('click', disableOrg2fa);
    var org2faConfirmDisableBtn = document.getElementById('org2faConfirmDisableBtn');
    if (org2faConfirmDisableBtn) org2faConfirmDisableBtn.addEventListener('click', confirmDisableOrg2fa);
    var org2faCopySecretBtn = document.getElementById('org2faCopySecretBtn');
    if (org2faCopySecretBtn) {
        org2faCopySecretBtn.addEventListener('click', function() {
            var secret = orgSecurityPendingSecret || (document.getElementById('org2faSecret') && document.getElementById('org2faSecret').textContent) || '';
            if (!secret) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(secret).then(function() {
                    if (typeof showSuccess === 'function') showSuccess('Секрет скопирован');
                }).catch(function() {});
            }
        });
    }

    var closeOrganizationsBtn = document.querySelector('.close-organizations');
    if (closeOrganizationsBtn) closeOrganizationsBtn.addEventListener('click', closeOrganizationsModal);
    var organizationsModalEl = document.getElementById('organizationsModal');
    if (organizationsModalEl) organizationsModalEl.addEventListener('click', function(e) { if (e.target === organizationsModalEl) closeOrganizationsModal(); });
    var addOrganizationBtn = document.getElementById('addOrganizationBtn');
    if (addOrganizationBtn) addOrganizationBtn.addEventListener('click', openAddOrganizationForm);
    var closeOrganizationEditBtn = document.querySelector('.close-organization-edit');
    if (closeOrganizationEditBtn) closeOrganizationEditBtn.addEventListener('click', function() { document.getElementById('organizationEditModal').style.display = 'none'; });
    var organizationEditModalEl = document.getElementById('organizationEditModal');
    if (organizationEditModalEl) organizationEditModalEl.addEventListener('click', function(e) { if (e.target === organizationEditModalEl) organizationEditModalEl.style.display = 'none'; });
    var saveOrganizationBtn = document.getElementById('saveOrganizationBtn');
    if (saveOrganizationBtn) saveOrganizationBtn.addEventListener('click', saveOrganizationFromModal);
    var cancelOrganizationEditBtn = document.getElementById('cancelOrganizationEditBtn');
    if (cancelOrganizationEditBtn) cancelOrganizationEditBtn.addEventListener('click', function() { document.getElementById('organizationEditModal').style.display = 'none'; });

    var closeProfileBtn = document.querySelector('.close-profile');
    if (closeProfileBtn) closeProfileBtn.addEventListener('click', closeProfileModal);
    var profileModalEl = document.getElementById('profileModal');
    if (profileModalEl) profileModalEl.addEventListener('click', function(e) { if (e.target === profileModalEl) closeProfileModal(); });
}

var _mapInitialLoadPending = true;
var _mapTilesReady = false;
var _mapDataReady = false;
var _mapStateReceived = false;
var _mapLoadSafetyTimer = null;

function hideMapLoadingOverlay() {
    var el = document.getElementById('mapLoadingOverlay');
    if (!el || el.classList.contains('is-hidden')) return;
    el.classList.add('is-hidden');
    el.setAttribute('aria-busy', 'false');
    setTimeout(function() {
        el.setAttribute('hidden', '');
    }, 400);
}
window.hideMapLoadingOverlay = hideMapLoadingOverlay;

function setMapLoadingOverlayText(text) {
    var el = document.querySelector('#mapLoadingOverlay .map-loading-text');
    if (el && text) el.textContent = text;
}
window.setMapLoadingOverlayText = setMapLoadingOverlayText;

function markMapTilesReady() {
    if (_mapTilesReady) return;
    _mapTilesReady = true;
    tryCompleteMapInitialLoad();
}

function markMapDataReady() {
    if (_mapDataReady) return;
    _mapDataReady = true;
    tryCompleteMapInitialLoad();
}
window.markMapDataReady = markMapDataReady;

function tryCompleteMapInitialLoad() {
    if (!_mapInitialLoadPending) return;
    if (!_mapTilesReady || !_mapDataReady) return;
    _mapInitialLoadPending = false;
    if (_mapLoadSafetyTimer) {
        clearTimeout(_mapLoadSafetyTimer);
        _mapLoadSafetyTimer = null;
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            hideMapLoadingOverlay();
            if (!window.syncIsConnected && typeof showSyncRequiredOverlay === 'function') {
                showSyncRequiredOverlay();
            }
        });
    });
}

function startMapLoadSafetyTimeout() {
    if (_mapLoadSafetyTimer) return;
    _mapLoadSafetyTimer = setTimeout(function() {
        _mapLoadSafetyTimer = null;
        if (!_mapDataReady) markMapDataReady();
        if (!_mapTilesReady) markMapTilesReady();
    }, 45000);
}

function setupMapTilesReady() {
    if (!myMap || !myMap.events) {
        markMapTilesReady();
        return;
    }
    var done = false;
    function mark() {
        if (done) return;
        done = true;
        markMapTilesReady();
    }
    myMap.events.add('actionend', mark);
    setTimeout(mark, 800);
}

function hidePanoramaLayerMenuItem() {
    var mapEl = document.getElementById('map');
    if (!mapEl) return;
    var items = mapEl.querySelectorAll('[class*="listbox__list-item"]');
    for (var i = 0; i < items.length; i++) {
        var text = (items[i].textContent || '').trim();
        if (text === 'Панорамы' || text === 'Panoramas') {
            items[i].style.display = 'none';
        }
    }
}

function init() {
    var initialCenter = [54.663609, 86.162243];
    var initialZoom = 15;
    if (window._pendingMapStart && Array.isArray(window._pendingMapStart.center)) {
        initialCenter = window._pendingMapStart.center;
        initialZoom = window._pendingMapStart.zoom || 15;
    }
    myMap = new ymaps.Map('map', {
        center: initialCenter,
        zoom: initialZoom,
        controls: ['zoomControl']
    });
    if (window._pendingMapStart) {
        window._mapStartApplied = true;
        window._pendingMapStart = null;
    }
    
    try { myMap.controls.remove('searchControl'); } catch (e) {}
    try { myMap.controls.remove('trafficControl'); } catch (e) {}
    try { myMap.controls.remove('geolocationControl'); } catch (e) {}
    try { myMap.controls.remove('rulerControl'); } catch (e) {}
    try { myMap.controls.remove('fullscreenControl'); } catch (e) {}
    try { myMap.controls.remove('typeSelector'); } catch (e) {}
    try {
        var mapLayerSelector = new ymaps.control.TypeSelector(
            ['yandex#map', 'yandex#satellite', 'yandex#hybrid'],
            {
                panoramas: 'off',
                panoramasItemMode: 'off'
            }
        );
        myMap.controls.add(mapLayerSelector, { float: 'right' });
        if (mapLayerSelector.events) {
            mapLayerSelector.events.add(['click', 'expand'], hidePanoramaLayerMenuItem);
        }
        hidePanoramaLayerMenuItem();
        setTimeout(hidePanoramaLayerMenuItem, 300);
    } catch (e) {}
    try { myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e) {}

    createCursorIndicator();

    window.lastMouseX = 0;
    window.lastMouseY = 0;

    myMap.options.set('suppressMapOpenBlock', true);
    
    loadData();
    setupEventListeners();
    setupObjectPlacementPanDrag();
    setupRectSelection();
    if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    
    setTimeout(function() {
        if (lastSavedState === null && typeof getSerializedData === 'function') lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    }, 0);
    switchToViewMode(false);
    syncMapPanLockForEditTools();

    (function setupMobileReadonlyResizeGuard() {
        var resizeTimer = null;
        window.addEventListener('resize', function() {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (typeof isNetworkMapMobileViewOnly === 'function' && isNetworkMapMobileViewOnly() && isEditMode) {
                    switchToViewMode(true);
                }
            }, 200);
        });
    })();

    if (getApiBase() && typeof AuthSystem !== 'undefined' && AuthSystem.refreshSessionFromApi) {
        setInterval(AuthSystem.refreshSessionFromApi, 60000);
    }

    setupMapTilesReady();
}

function setupEventListeners() {
    
    document.getElementById('viewMode').addEventListener('click', function() { switchToViewMode(false); });
    document.getElementById('editMode').addEventListener('click', switchToEditMode);

    const addObjectBtn = document.getElementById('addObject');
    addObjectBtn.addEventListener('click', function(e) {
        
        if (this.onclick && typeof this.onclick === 'function' && this.onclick === cancelObjectPlacement) {
            this.onclick(e);
        } else {
            
            handleAddObject();
        }
    });

    document.getElementById('addCable').addEventListener('click', function() {
        try {
        if (isNetworkMapMobileViewOnly()) {
            return;
        }
        if (!isEditMode) {
            return;
        }

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
        
        currentCableTool = !currentCableTool;
        const cableBtn = this;
        
        if (currentCableTool) {
            cableBtn.classList.add('btn-add-object--placement');
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span class="btn-lay-cable-text">Завершить прокладку</span>';
            cableBtn.style.background = '';
            copperCableLayingActive = false;
            if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
            clearShowOnMapHighlight();
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableSourceCopperSwitchId = null;
            cableWaypoints = [];
            pendingCopperPortPreset = null;
            pendingCopperRouteFinish = null;
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = 'crosshair';
            mapEl.classList.add('map-crosshair-active');
        } else {
            cableBtn.classList.remove('btn-add-object--placement');
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span class="btn-lay-cable-text">Проложить кабель</span>';
            cableBtn.style.background = '';
            copperCableLayingActive = false;
            if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableSourceCopperSwitchId = null;
            cableWaypoints = [];
            pendingCopperPortPreset = null;
            pendingCopperRouteFinish = null;
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
        } finally {
            syncMapPanLockForEditTools();
        }
    });

    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('exportData').addEventListener('click', exportData);

    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.addEventListener('click', function() { performUndo(); });
    if (redoBtn) redoBtn.addEventListener('click', function() { performRedo(); });
    document.addEventListener('keydown', function(e) {
        var tag = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            performUndo();
        }
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            performRedo();
        }
    });

    setupMapFilterControls();

    var saveMapStartBtn = document.getElementById('saveMapStartBtn');
    if (saveMapStartBtn) {
        saveMapStartBtn.addEventListener('click', function() {
            if (!myMap || !getApiBase() || !getAuthToken()) {
                if (typeof showWarning === 'function') showWarning('Нужно быть авторизованным для сохранения начальной позиции.', 'Настройка');
                return;
            }
            var center = myMap.getCenter();
            if (!center) return;
            var lat = Array.isArray(center) ? center[0] : (center[0] != null ? center[0] : (center.lat && center.lat()));
            var lon = Array.isArray(center) ? center[1] : (center[1] != null ? center[1] : (center.lng && center.lng()));
            if (typeof lat !== 'number' || typeof lon !== 'number') return;
            var zoom = myMap.getZoom();
            if (typeof zoom !== 'number') zoom = 15;
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ mapStart: { center: [lat, lon], zoom: zoom } })
            }).then(function(r) {
                if (!r.ok) throw new Error('Ошибка сохранения');
                if (typeof showInfo === 'function') showInfo('Текущий вид сохранён. При следующем открытии карта откроется здесь.', 'Начальная точка');
            }).catch(function() {
                if (typeof showWarning === 'function') showWarning('Не удалось сохранить начальную позицию.', 'Ошибка');
            });
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (typeof window.isConfirmModalBlockingEscape === 'function' && window.isConfirmModalBlockingEscape()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                return;
            }
            if (typeof window.isConfirmModalOpen === 'function' && window.isConfirmModalOpen()) {
                if (typeof window.cancelConfirmModal === 'function') window.cancelConfirmModal();
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            var modalIds = ['deviceCatalogEntryModal', 'infoModal', 'nodeSelectionModal', 'onuSelectionModal', 'splitterSelectionModal', 'splitterOutputOnuModal', 'splitterOutputSplitterModal', 'oltSelectionModal', 'usersModal', 'userEditModal', 'organizationsModal', 'organizationEditModal', 'updatesModal', 'profileModal', 'deviceCatalogModal'];
            for (var i = 0; i < modalIds.length; i++) {
                var m = document.getElementById(modalIds[i]);
                var modalOpen = m && m.style && m.style.display && m.style.display !== 'none';
                if (modalOpen) {
                    if (modalIds[i] === 'infoModal' && typeof closeInfoModal === 'function') {
                        closeInfoModal();
                    } else if (modalIds[i] === 'deviceCatalogEntryModal' && typeof closeDeviceCatalogEntryModal === 'function') {
                        closeDeviceCatalogEntryModal();
                    } else if (modalIds[i] === 'deviceCatalogModal' && typeof closeDeviceCatalogModal === 'function') {
                        closeDeviceCatalogModal();
                    } else {
                        m.style.display = 'none';
                    }
                    e.preventDefault();
                    return;
                }
            }
            if (splitterFiberRoutingMode) { cancelSplitterFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
            if (fiberRoutingMode) { cancelFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
            if (cableSplitMode) { cancelCableSplitMode(); showInfo('Установка муфты отменена.', 'Отмена'); e.preventDefault(); return; }
            if (objectPlacementMode) { cancelObjectPlacement(); e.preventDefault(); return; }
            if (currentCableTool) {
                var cableBtn = document.getElementById('addCable');
                if (cableBtn) cableBtn.click();
                e.preventDefault();
            }
            return;
        }
    });

    setupObjectTypePicker();
    setupCableTypePicker();

    const objectTypeSelect = document.getElementById('objectType');
    if (objectTypeSelect) {
        objectTypeSelect.addEventListener('change', function() {
            if (typeof syncObjectTypePickerUI === 'function') syncObjectTypePickerUI();
            try { localStorage.setItem(OBJECT_TYPE_STORAGE_KEY, this.value); } catch (e) {}
            const nameInputGroup = document.getElementById('objectNameGroup');
            const sleeveSettingsGroup = document.getElementById('sleeveSettingsGroup');
            const crossSettingsGroup = document.getElementById('crossSettingsGroup');
            const nodeSettingsGroup = document.getElementById('nodeSettingsGroup');
            const oltSettingsGroup = document.getElementById('oltSettingsGroup');
            const splitterSettingsGroup = document.getElementById('splitterSettingsGroup');
            const type = this.value;

            const showName = ['node', 'cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter'].indexOf(type) !== -1;
            if (nameInputGroup) nameInputGroup.style.display = showName ? 'block' : 'none';
            if (sleeveSettingsGroup) sleeveSettingsGroup.style.display = type === 'sleeve' ? 'block' : 'none';
            if (crossSettingsGroup) crossSettingsGroup.style.display = type === 'cross' ? 'block' : 'none';
            if (nodeSettingsGroup) nodeSettingsGroup.style.display = type === 'node' ? 'block' : 'none';
            if (oltSettingsGroup) oltSettingsGroup.style.display = type === 'olt' ? 'block' : 'none';
            if (splitterSettingsGroup) splitterSettingsGroup.style.display = type === 'splitter' ? 'block' : 'none';
            const onuSettingsGroup = document.getElementById('onuSettingsGroup');
            if (onuSettingsGroup) onuSettingsGroup.style.display = type === 'onu' ? 'block' : 'none';
            const cameraSettingsGroup = document.getElementById('cameraSettingsGroup');
            if (cameraSettingsGroup) cameraSettingsGroup.style.display = type === 'camera' ? 'block' : 'none';
            const mediaConverterSettingsGroup = document.getElementById('mediaConverterSettingsGroup');
            if (mediaConverterSettingsGroup) mediaConverterSettingsGroup.style.display = type === 'mediaConverter' ? 'block' : 'none';

            if (nameInputGroup) {
                const nameLabel = nameInputGroup.querySelector('label');
                if (nameLabel) {
                    const labels = { cross: 'Имя кросса', sleeve: 'Название муфты', support: 'Подпись опоры', attachment: 'Название', node: 'Имя узла', olt: 'Имя OLT', splitter: 'Имя сплиттера', onu: 'Имя ONU', camera: 'Имя камеры', mediaConverter: 'Название медиаконвертера' };
                    nameLabel.textContent = labels[type] || 'Имя';
                }
            }

        if (type === 'sleeve') {
            updateSleeveMaxFibers();
        }

        if (objectPlacementMode) {
            const newType = this.value;
            currentPlacementType = newType;
            
            if (['node', 'cross', 'sleeve', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter'].indexOf(newType) !== -1) {
                const nameInput = document.getElementById('objectName');
                currentPlacementName = nameInput ? nameInput.value.trim() : '';
            } else {
                currentPlacementName = '';
            }
            
            if (newType === 'node') {
                const nodeKindSelect = document.getElementById('nodeKind');
                currentPlacementNodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
            }
            if (['olt', 'onu', 'camera', 'mediaConverter'].indexOf(newType) !== -1) {
                populateDeviceDatalists();
                var mInp = newType === 'olt' ? document.getElementById('oltManufacturer') : (newType === 'onu' ? document.getElementById('onuManufacturer') : (newType === 'camera' ? document.getElementById('cameraManufacturer') : document.getElementById('mediaConverterManufacturer')));
                var cat = 'node';
                if (newType === 'camera') cat = 'camera';
                else if (newType === 'olt') cat = 'olt';
                else if (newType === 'onu') cat = 'onu';
                populateModelDatalistForManufacturer(mInp ? mInp.value.trim() : '', 'deviceModelsList', cat);
            }
        }
        });
        if (objectTypeSelect.value) objectTypeSelect.dispatchEvent(new Event('change'));
    }

    const objectNameInput = document.getElementById('objectName');
    if (objectNameInput) {
        objectNameInput.addEventListener('input', function() {
            if (!objectPlacementMode || !currentPlacementType) return;
            var typesWithPlacementName = ['node', 'cross', 'sleeve', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter'];
            if (typesWithPlacementName.indexOf(currentPlacementType) !== -1) {
                currentPlacementName = this.value.trim();
            }
        });
    }

    const nodeKindSelect = document.getElementById('nodeKind');
    if (nodeKindSelect) {
        nodeKindSelect.addEventListener('change', function() {
            if (objectPlacementMode && currentPlacementType === 'node') {
                currentPlacementNodeKind = this.value || 'network';
            }
        });
    }

    function setupDeviceManufacturerChangeHandlers(manufacturerId, catalogKind) {
        catalogKind = catalogKind || 'node';
        var mInp = document.getElementById(manufacturerId);
        if (mInp) {
            mInp.addEventListener('change', function() {
                if (typeof populateModelDatalistForManufacturer === 'function') populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', catalogKind);
            });
        }
    }
    setupDeviceManufacturerChangeHandlers('oltManufacturer', 'olt');
    setupDeviceManufacturerChangeHandlers('onuManufacturer', 'onu');
    setupDeviceManufacturerChangeHandlers('cameraManufacturer', 'camera');
    setupDeviceManufacturerChangeHandlers('mediaConverterManufacturer', 'node');

    function preventPasswordSuggestions(inputEl) {
        if (!inputEl || inputEl.tagName !== 'INPUT') return;
        inputEl.readOnly = true;
        inputEl.addEventListener('focus', function() { this.readOnly = false; }, { once: true });
    }
    function setupDeviceFieldsNoPasswordSuggestions() {
        return;
    }
    setupDeviceFieldsNoPasswordSuggestions();

    const sleeveTypeSelect = document.getElementById('sleeveType');
    if (sleeveTypeSelect) {
        sleeveTypeSelect.addEventListener('change', function() {
            updateSleeveMaxFibers();
        });
    }

    function updateSleeveMaxFibers() {
        const sleeveTypeEl = document.getElementById('sleeveType');
        const maxFibersInput = document.getElementById('sleeveMaxFibers');
        if (!maxFibersInput) return;
        const sleeveType = sleeveTypeEl ? sleeveTypeEl.value : '';
        maxFibersInput.value = String(getDefaultMaxFibersForSleeveType(sleeveType));
    }

    setupAccordions();

    if (typeof loadCustomDeviceOptionsFromStorage === 'function') loadCustomDeviceOptionsFromStorage();
    if (typeof refreshAllSleeveTypeSelects === 'function') refreshAllSleeveTypeSelects();

    initDeviceComboboxes(document);

    initNodeSelectionModal();
    initOnuSelectionModal();
    initSplitterSelectionModal();
    initSplitterOutputOnuModal();
    initSplitterOutputSplitterModal();
    initOltSelectionModal();

    myMap.events.add('click', handleMapClick);

    myMap.events.add('mousemove', handleMapMouseMove);

    // Обновляем видимость "как в vols expert" при изменении зума.
    // Событие `boundschange` срабатывает на панорамирование тоже, поэтому ограничиваемся изменением zoom.
    let expertLastZoom = (typeof myMap.getZoom === 'function') ? myMap.getZoom() : null;
    let expertZoomTimer = null;
    myMap.events.add('boundschange', function() {
        try {
            if (!myMap || typeof myMap.getZoom !== 'function') return;
            const z = myMap.getZoom();
            if (typeof z !== 'number') return;

            if (expertLastZoom != null && Math.abs(z - expertLastZoom) < 0.01) return;
            expertLastZoom = z;

            if (expertZoomTimer) return;
            expertZoomTimer = setTimeout(function() {
                expertZoomTimer = null;
                if (typeof applyMapFilter === 'function') applyMapFilter();
            }, 80);
        } catch (e) {}
    });

    document.addEventListener('mousemove', function(e) {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
    });

    const modal = document.getElementById('infoModal');
    const closeBtn = modal ? modal.querySelector('.close') : null;
    
    if (closeBtn && modal) {
        closeBtn.onclick = function() {
            closeInfoModal();
        };
    }
    
    window.onclick = function(event) {
        if (modal && event.target === modal) {
            closeInfoModal();
        }
    };

    setupMapSearch();

    initTheme();
}

let objectPlacementMode = false;
let currentPlacementType = null;
let currentPlacementName = null;
let currentPlacementNodeKind = 'network';

/** Имя из поля боковой панели (актуальное), иначе кэш при старте режима размещения. */
function getPlacementObjectName() {
    var inp = document.getElementById('objectName');
    return (inp ? inp.value.trim() : '') || currentPlacementName || '';
}
let placementPanBlockClickUntil = 0;
const placementPanPointer = { down: false, startX: 0, startY: 0, moved: false };
const PLACEMENT_PAN_DRAG_THRESHOLD_PX = 5;
/** Короткое окно после pan — только чтобы не поставить объект «хвостом» жеста перетаскивания. */
const PLACEMENT_PAN_CLICK_BLOCK_MS = 40;

function handleAddObject() {
    try {
    if (isNetworkMapMobileViewOnly()) {
        return;
    }
    if (!isEditMode) {
        return;
    }
    clearShowOnMapHighlight();

    if (currentCableTool) {
        currentCableTool = false;
        const cableBtn = document.getElementById('addCable');
        if (cableBtn) {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
            cableBtn.style.background = '#3498db';
        }
        clearSelection();
        removeCablePreview();
        cableSource = null;
        cableSourceCopperSwitchId = null;
        cableWaypoints = [];
        pendingCopperPortPreset = null;
        pendingCopperRouteFinish = null;
        copperCableLayingActive = false;
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
    }

    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }

    const objectTypeEl = document.getElementById('objectType');
    if (!objectTypeEl) return;
    const type = objectTypeEl.value;

    if (type === 'node' || type === 'cross') {
        const name = document.getElementById('objectName').value.trim();
        if (!name) {
            
            if (objectPlacementMode) {
                cancelObjectPlacement();
            }
            showWarning(type === 'cross' ? 'Введите имя кросса' : 'Введите имя узла', 'Требуется имя');
            return;
        }

        if (type === 'node') {
            const nodeKindSelect = document.getElementById('nodeKind');
            currentPlacementNodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
        }
        
        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = name;
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            if (mapEl) {
                mapEl.style.cursor = 'crosshair';
                mapEl.classList.add('map-crosshair-active');
            }
        }
        setAddObjectButtonPlacementMode(true);
    } else {
        objectPlacementMode = true;
        currentPlacementType = type;
        currentPlacementName = '';
        if (myMap && myMap.container) {
            const mapEl = myMap.container.getElement();
            if (mapEl) {
                mapEl.style.cursor = 'crosshair';
                mapEl.classList.add('map-crosshair-active');
            }
        }
        setAddObjectButtonPlacementMode(true);
    }
    } finally {
        syncMapPanLockForEditTools();
    }
}

function cancelObjectPlacement() {
    objectPlacementMode = false;
    currentPlacementType = null;
    currentPlacementName = null;
    placementPanBlockClickUntil = 0;
    placementPanPointer.down = false;
    placementPanPointer.moved = false;
    removePhantomPlacemark();
    if (cursorIndicator) cursorIndicator.style.display = 'none';
    if (hoveredObject) clearHoverHighlight();
    if (myMap && myMap.container) {
        const mapEl = myMap.container.getElement();
        if (!currentCableTool) {
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
    }
    
    setAddObjectButtonPlacementMode(false);
    syncMapPanLockForEditTools();
}

var OBJECT_TYPE_STORAGE_KEY = 'networkMap_objectType';
var CABLE_TYPE_STORAGE_KEY = 'networkMap_cableType';
var OBJECT_TYPE_LABELS = {
    support: 'Опоры',
    sleeve: 'Муфты',
    cross: 'Кроссы',
    attachment: 'Крепления',
    olt: 'OLT',
    splitter: 'Сплиттер',
    onu: 'ONU',
    node: 'Узел',
    camera: 'Камера',
    mediaConverter: 'Медиаконв.'
};

function getObjectTypeLabel(type) {
    return OBJECT_TYPE_LABELS[type] || type || '';
}

function syncObjectTypePickerUI() {
    var select = document.getElementById('objectType');
    if (!select) return;
    var val = select.value;
    document.querySelectorAll('.object-type-chip').forEach(function(chip) {
        var active = chip.getAttribute('data-type') === val;
        chip.classList.toggle('object-type-chip--active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var badge = document.getElementById('objectTypeBadge');
    if (badge) badge.textContent = getObjectTypeLabel(val);
}

function setupObjectTypePicker() {
    var select = document.getElementById('objectType');
    if (!select) return;
    try {
        var stored = localStorage.getItem(OBJECT_TYPE_STORAGE_KEY);
        if (stored && select.querySelector('option[value="' + stored + '"]')) {
            select.value = stored;
        }
    } catch (e) {}
    document.querySelectorAll('.object-type-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            var type = chip.getAttribute('data-type');
            if (!type || select.value === type) return;
            select.value = type;
            select.dispatchEvent(new Event('change'));
        });
    });
    syncObjectTypePickerUI();
}

function getCableTypeLabel(type) {
    if (window.FiberCableConfig && window.FiberCableConfig.isOpticalCableType(type)) {
        var n = window.FiberCableConfig.getLayFiberCount();
        return 'ВОЛС, ' + n + ' ж.';
    }
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var m = window.MapLegendConfig.getCableMeta(type);
        if (m) return m.short;
    }
    return getCableDescription(type);
}

function syncCableTypePickerUI() {
    var select = document.getElementById('cableType');
    var badge = document.getElementById('cableTypeBadge');
    var copperActive = typeof copperCableLayingActive !== 'undefined' && copperCableLayingActive;
    if (badge) {
        badge.textContent = copperActive ? 'Медь' : getCableTypeLabel(select ? select.value : 'fiber4');
    }
    if (!select || copperActive) return;
    var val = select.value;
    document.querySelectorAll('.cable-type-chip').forEach(function(chip) {
        chip.classList.toggle('cable-type-chip--active', chip.getAttribute('data-cable') === val);
    });
}

function setupCableTypePicker() {
    if (window.MapLegendConfig) {
        if (window.MapLegendConfig.renderSidebarLegend) {
            window.MapLegendConfig.renderSidebarLegend('legend-content');
        }
        if (window.MapLegendConfig.renderCableTypePicker) {
            window.MapLegendConfig.renderCableTypePicker('cableTypePicker');
        }
    }
    if (window.FiberCableConfig && window.FiberCableConfig.setupLayFiberControls) {
        window.FiberCableConfig.setupLayFiberControls();
    }
    var select = document.getElementById('cableType');
    if (!select) return;
    if (!select.querySelector('option[value="fiber"]')) {
        select.innerHTML = '<option value="fiber">ВОЛС</option>';
    }
    select.value = 'fiber';
    syncCableTypePickerUI();
    if (!select._cableSelectBound) {
        select._cableSelectBound = true;
        select.addEventListener('change', function() {
            syncCableTypePickerUI();
        });
    }
    var layCount = document.getElementById('layFiberCount');
    if (layCount && !layCount._badgeSyncBound) {
        layCount._badgeSyncBound = true;
        layCount.addEventListener('change', syncCableTypePickerUI);
        layCount.addEventListener('input', syncCableTypePickerUI);
    }
}

function setAddObjectButtonPlacementMode(active) {
    var addBtn = document.getElementById('addObject');
    if (!addBtn) return;
    var iconCancel = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    var iconAdd = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    if (active) {
        addBtn.classList.add('btn-add-object--placement');
        addBtn.innerHTML = iconCancel + '<span class="btn-add-object-text">Завершить размещение</span>';
        addBtn.onclick = cancelObjectPlacement;
    } else {
        addBtn.classList.remove('btn-add-object--placement');
        addBtn.innerHTML = iconAdd + '<span class="btn-add-object-text">Добавить на карту</span>';
        addBtn.onclick = null;
    }
}

/** На touch при размещении объектов pan отключён — иначе не двигается «фантом». На мыши pan включён. */
function isMapPanLockedForObjectPlacement() {
    if (!objectPlacementMode) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

function isCableLayingWithSource() {
    return !!(currentCableTool && cableSource && isEditMode);
}

/** На touch при прокладке кабеля (есть начальная точка) pan отключён; на мыши — ЛКМ перетаскивает карту. */
function isMapPanLockedForCableTool() {
    if (!isCableLayingWithSource()) return false;
    try {
        if (window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia('(hover: none)').matches) return true;
    } catch (e) {}
    return false;
}

function isMapPanDragTrackingActive() {
    return objectPlacementMode || isCableLayingWithSource();
}

/**
 * На сенсорных экранах поведение «перетаскивание» карты перехватывает движение пальца,
 * из‑за чего не срабатывает предпросмотр кабеля / «фантом» при размещении объектов.
 * Пока активны эти режимы, отключаем pan (drag); масштаб жестами и кнопками зума сохраняется.
 * На мыши в размещении объектов и прокладке кабеля pan (ЛКМ + перетаскивание) включён; клик после pan не ставит точку.
 */
function syncMapPanLockForEditTools() {
    if (!myMap || !myMap.behaviors) return;
    var lockPan = !!(isMapPanLockedForObjectPlacement() || isMapPanLockedForCableTool() ||
        fiberRoutingMode || splitterFiberRoutingMode || cableSplitMode);
    try {
        if (lockPan) myMap.behaviors.disable('drag');
        else myMap.behaviors.enable('drag');
    } catch (err) {}
}

function setupObjectPlacementPanDrag() {
    if (!myMap || !myMap.container) return;
    var el = myMap.container.getElement();
    if (!el || el.dataset.placementPanDragBound) return;
    el.dataset.placementPanDragBound = '1';

    el.addEventListener('mousedown', function(e) {
        if (e.button !== 0 || !isMapPanDragTrackingActive()) return;
        placementPanBlockClickUntil = 0;
        placementPanPointer.down = true;
        placementPanPointer.startX = e.clientX;
        placementPanPointer.startY = e.clientY;
        placementPanPointer.moved = false;
    });

    document.addEventListener('mousemove', function(e) {
        if (!placementPanPointer.down || !isMapPanDragTrackingActive()) return;
        if (!placementPanPointer.moved) {
            var dx = e.clientX - placementPanPointer.startX;
            var dy = e.clientY - placementPanPointer.startY;
            if (dx * dx + dy * dy > PLACEMENT_PAN_DRAG_THRESHOLD_PX * PLACEMENT_PAN_DRAG_THRESHOLD_PX) {
                placementPanPointer.moved = true;
            }
        }
    });

    document.addEventListener('mouseup', function() {
        if (!placementPanPointer.down) return;
        placementPanPointer.down = false;
        if (placementPanPointer.moved && isMapPanDragTrackingActive()) {
            placementPanBlockClickUntil = Date.now() + PLACEMENT_PAN_CLICK_BLOCK_MS;
        }
    });
}

function handleMapClick(e) {
    try {
    clearShowOnMapHighlight();
    const coords = e.get('coords');
    window.lastMapClickCoords = coords;

    const target = e.get('target');
    if (cableSplitMode && cableSplitData) {
        var splitTargetCable = (target && target.properties && target.properties.get('type') === 'cable') ? target : null;
        handleCableSplitMapClick(coords, splitTargetCable);
        return;
    }
    if (target && target.properties) {
        const type = target.properties.get('type');
        if (type === 'cable') {
            showCableInfo(target);
            return;
        }
    }

    let clickedCable = null;
    let minDistance = Infinity;

    const zoom = myMap.getZoom();

    let baseTolerance;
    if (zoom < 10) {
        
        baseTolerance = 0.000003;
    } else if (zoom < 13) {
        
        baseTolerance = 0.000005;
    } else if (zoom < 15) {
        
        baseTolerance = 0.000003;
    } else {
        
        baseTolerance = 0.000002;
    }
    
    objects.forEach(obj => {
        if (obj && obj.geometry && obj.properties) {
            const type = obj.properties.get('type');
            if (type === 'cable') {
                try {
                    
                    const cableCoords = obj.geometry.getCoordinates();
                    if (cableCoords && cableCoords.length >= 2) {
                        const fromCoords = cableCoords[0];
                        const toCoords = cableCoords[cableCoords.length - 1];

                        const result = pointToLineDistance(coords, fromCoords, toCoords);
                        const distanceToLine = result.distance;
                        const param = result.param;

                        const segmentTolerance = zoom < 10 ? 0.005 : 0.01;
                        const isWithinSegment = param >= -segmentTolerance && param <= 1 + segmentTolerance;

                        const cableType = obj.properties.get('cableType');
                        const cableWidthPixels = getCableWidth(cableType);

                        let pixelToDegree;
                        if (zoom < 10) {
                            
                            pixelToDegree = 0.000002;
                        } else if (zoom < 13) {
                            
                            pixelToDegree = 0.000005;
                        } else if (zoom < 15) {
                            
                            pixelToDegree = 0.000004;
                        } else {
                            
                            pixelToDegree = 0.000003;
                        }
                        
                        const cableWidthInDegrees = (cableWidthPixels / 2) * pixelToDegree;

                        const widthMultiplier = zoom < 10 ? 1.1 : 1.2;
                        const cableTolerance = Math.max(baseTolerance, cableWidthInDegrees * widthMultiplier);

                        if (isWithinSegment && distanceToLine < cableTolerance && distanceToLine < minDistance) {
                            minDistance = distanceToLine;
                            clickedCable = obj;
                        }
                    }
                } catch (error) {
                    
                }
            }
        }
    });

    if (clickedCable && !(cableSplitMode && cableSplitData)) {
        showCableInfo(clickedCable);
        return;
    }

    if (splitterFiberRoutingMode && splitterFiberRoutingData) {
        handleSplitterFiberRoutingClick(coords);
        return;
    }
    
    if (fiberRoutingMode && fiberRoutingData) {
        handleFiberRoutingClick(coords);
        return;
    }

    if (!isEditMode) {
        return;
    }

    if (objectPlacementMode) {
        const coords = e.get('coords');

        let shouldBlock = false;
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const objType = obj.properties.get('type');
                if (objType !== 'cable' && objType !== 'cableLabel') {
                    try {
                        const objCoords = obj.geometry.getCoordinates();
                        const latDiff = Math.abs(objCoords[0] - coords[0]);
                        const lonDiff = Math.abs(objCoords[1] - coords[1]);

                        if (latDiff < 0.00001 && lonDiff < 0.00001) {
                            shouldBlock = true;
                        }
                    } catch (error) {
                        
                    }
                }
            }
        });

        if (shouldBlock) {
            return;
        }

        if (Date.now() < placementPanBlockClickUntil) {
            return;
        }

        const type = currentPlacementType || document.getElementById('objectType').value;
        
        if (type === 'node') {
            const name = getPlacementObjectName();
            if (name && findNodeByName(name)) {
                if (typeof showError === 'function') showError('Узел сети с таким названием уже существует. Задайте другое название.', 'Дубликат узла');
                else alert('Узел сети с таким названием уже существует. Задайте другое название.');
                return;
            }
            const nodeKindSelect = document.getElementById('nodeKind');
            const nodeKind = currentPlacementNodeKind || (nodeKindSelect ? nodeKindSelect.value : 'network');
            createObject(type, name || '', coords, { nodeKind: nodeKind });
            
            currentPlacementName = name || '';
            currentPlacementNodeKind = nodeKind;
        } else if (type === 'sleeve') {
            const sleeveName = getPlacementObjectName();
            const sleeveType = document.getElementById('sleeveType').value;
            const maxFibers = parseInt(document.getElementById('sleeveMaxFibers').value) || 0;
            createObject(type, sleeveName || '', coords, { sleeveType: sleeveType, maxFibers: maxFibers });
        } else if (type === 'cross') {
            const name = getPlacementObjectName();
            const crossPorts = parseInt(document.getElementById('crossPorts').value) || 24;
            var ccpElPl = document.getElementById('crossCopperPorts');
            var crossCopperPortsPl = ccpElPl ? (parseInt(ccpElPl.value, 10) || 0) : 0;
            createObject(type, name || '', coords, { crossPorts: crossPorts, crossCopperPorts: crossCopperPortsPl });
            currentPlacementName = name || '';
        } else if (type === 'support') {
            const name = document.getElementById('objectName').value.trim();
            createObject(type, name || '', coords);
        } else if (type === 'attachment') {
            const name = document.getElementById('objectName').value.trim();
            createObject(type, name || '', coords);
        } else if (type === 'olt') {
            const name = getPlacementObjectName();
            const oltPortsEl = document.getElementById('oltPonPorts');
            const ponPorts = oltPortsEl ? (parseInt(oltPortsEl.value, 10) || 8) : 8;
            const manufacturer = (document.getElementById('oltManufacturer') && document.getElementById('oltManufacturer').value) ? document.getElementById('oltManufacturer').value.trim() : '';
            const model = (document.getElementById('oltModel') && document.getElementById('oltModel').value) ? document.getElementById('oltModel').value.trim() : '';
            createObject(type, name || '', coords, { ponPorts: ponPorts, manufacturer: manufacturer, model: model });
            currentPlacementName = name || '';
        } else if (type === 'splitter') {
            const name = getPlacementObjectName();
            const ratioEl = document.getElementById('splitterRatio');
            const splitRatio = ratioEl ? (parseInt(ratioEl.value, 10) || 8) : 8;
            createObject(type, name || '', coords, { splitRatio: splitRatio });
            currentPlacementName = name || '';
        } else if (type === 'onu') {
            const name = getPlacementObjectName();
            const manufacturer = (document.getElementById('onuManufacturer') && document.getElementById('onuManufacturer').value) ? document.getElementById('onuManufacturer').value.trim() : '';
            const model = (document.getElementById('onuModel') && document.getElementById('onuModel').value) ? document.getElementById('onuModel').value.trim() : '';
            createObject(type, name || '', coords, { manufacturer: manufacturer, model: model });
            currentPlacementName = name || '';
        } else if (type === 'camera') {
            const name = getPlacementObjectName();
            const manufacturer = (document.getElementById('cameraManufacturer') && document.getElementById('cameraManufacturer').value) ? document.getElementById('cameraManufacturer').value.trim() : '';
            const model = (document.getElementById('cameraModel') && document.getElementById('cameraModel').value) ? document.getElementById('cameraModel').value.trim() : '';
            var camOpts = { manufacturer: manufacturer, model: model };
            if (window.CameraPlayer && typeof CameraPlayer.getPlacementStreamOptions === 'function') {
                Object.assign(camOpts, CameraPlayer.getPlacementStreamOptions());
            }
            createObject(type, name || '', coords, camOpts);
            currentPlacementName = name || '';
        } else if (type === 'mediaConverter') {
            const nameMc = getPlacementObjectName();
            const manufacturerMc = (document.getElementById('mediaConverterManufacturer') && document.getElementById('mediaConverterManufacturer').value) ? document.getElementById('mediaConverterManufacturer').value.trim() : '';
            const modelMc = (document.getElementById('mediaConverterModel') && document.getElementById('mediaConverterModel').value) ? document.getElementById('mediaConverterModel').value.trim() : '';
            createObject(type, nameMc || '', coords, { manufacturer: manufacturerMc, model: modelMc });
            currentPlacementName = nameMc || '';
        } else {
            createObject(type, '', coords);
        }
        removePhantomPlacemark();
        saveData();
        return;
    }

    if (currentCableTool && isEditMode) {
        if (Date.now() < placementPanBlockClickUntil) {
            return;
        }
        const coords = e.get('coords');

        let clickedCable = null;
        let minDistance = Infinity;
        const zoom = myMap.getZoom();
        const cableTolerance = zoom < 12 ? 0.000008 : (zoom < 15 ? 0.000005 : 0.000003);
        
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const type = obj.properties.get('type');
                if (type === 'cable') {
                    try {
                        const cableCoords = obj.geometry.getCoordinates();
                        if (cableCoords && cableCoords.length >= 2) {
                            const fromCoords = cableCoords[0];
                            const toCoords = cableCoords[cableCoords.length - 1];
                            const result = pointToLineDistance(coords, fromCoords, toCoords);
                            if (result.distance < cableTolerance && result.param >= -0.01 && result.param <= 1.01 && result.distance < minDistance) {
                                minDistance = result.distance;
                                clickedCable = obj;
                            }
                        }
                    } catch (error) {
                        
                    }
                }
            }
        });
        
        if (clickedCable && !(cableSplitMode && cableSplitData)) {
            showCableInfo(clickedCable);
            return;
        }

        if (cableSplitMode && cableSplitData) {
            handleCableSplitMapClick(coords);
            return;
        }

        const clickedObject = findObjectAtCoords(coords, getCableSnapTolerance(zoom));
        const cableType = getEffectiveCableLayingType();
        if (isCopperCableType(cableType)) {
            if (clickedObject && clickedObject.geometry) {
                var otc = clickedObject.properties.get('type');
                if (handleCopperCablePlacemarkStep(clickedObject, otc, cableType)) return;
            } else if (cableSource) {
                const autoSelectTolerance = getCableAutoSelectTolerance(zoom);
                var nearestCu = null;
                var minDCu = Infinity;
                objects.forEach(function(obj) {
                    if (!obj || !obj.geometry || !obj.properties) return;
                    var tc = obj.properties.get('type');
                    if (tc === 'node' && getNodeAttachedSwitches(obj).length === 0) return;
                    if (['switch', 'node', 'support', 'attachment', 'camera', 'mediaConverter'].indexOf(tc) === -1) return;
                    if (obj === cableSource) return;
                    try {
                        var oc = obj.geometry.getCoordinates();
                        var latD = Math.abs(oc[0] - coords[0]);
                        var lonD = Math.abs(oc[1] - coords[1]);
                        var dist = Math.sqrt(latD * latD + lonD * lonD);
                        if (dist < autoSelectTolerance && dist < minDCu) {
                            minDCu = dist;
                            nearestCu = obj;
                        }
                    } catch (eCu) {}
                });
                if (nearestCu) {
                    var tnc = nearestCu.properties.get('type');
                    if (tnc === 'support' || tnc === 'attachment') {
                        cableWaypoints.push(nearestCu);
                        clearSelection();
                        selectObject(cableSource);
                    } else {
                        var toSwNearest = null;
                        if (tnc === 'node') {
                            toSwNearest = resolveSwitchIdForCopperNodeClick(nearestCu);
                            if (!toSwNearest) return;
                        }
                        var copperMetaNear = {
                            copperSwitchFromId: cableSource.properties.get('type') === 'node' ? cableSourceCopperSwitchId : null,
                            copperSwitchToId: tnc === 'node' ? toSwNearest : null
                        };
                        var ptsCu = [cableSource].concat(cableWaypoints).concat([nearestCu]);
                        openCopperEndPortModal(ptsCu, cableType, copperMetaNear);
                    }
                }
            }
            return;
        }
        var cableEndpoints = ['cross', 'sleeve', 'support', 'attachment', 'olt'];
        
        if (clickedObject && clickedObject.geometry) {
            var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;

            if (objType === 'splitter' || objType === 'onu' || objType === 'camera' || objType === 'mediaConverter') {
                showError('Нельзя прокладывать кабель ВОЛС от сплиттера, ONU, камеры или медиаконвертера. Кабель прокладывается между муфтой, кроссом, креплением или OLT.', 'Недопустимое действие');
                return;
            }
            
            if (cableEndpoints.indexOf(objType) !== -1) {
                if (!cableSource) {
                    if (objType === 'support' || objType === 'attachment') {
                        showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
                        return;
                    }
                    cableSource = clickedObject;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (clickedObject === cableSource) {
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (objType === 'support' || objType === 'attachment') {
                    cableWaypoints.push(clickedObject);
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                var points = [cableSource].concat(cableWaypoints).concat([clickedObject]);
                var success = createCableFromPoints(points, cableType);
                if (success) {
                    cableSource = clickedObject;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                }
                return;
            }
            if (objType === 'node') {
                showError('Нельзя прокладывать кабель к узлу сети. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            
            if (!cableSource) {
                var startEndpoints = ['sleeve', 'cross', 'olt'];
                if (startEndpoints.indexOf(objType) === -1) {
                    showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
                    return;
                }
                cableSource = clickedObject;
                cableWaypoints = [];
                clearSelection();
                selectObject(cableSource);
                return;
            }
            
            if (clickedObject === cableSource) {
                cableWaypoints = [];
                clearSelection();
                selectObject(cableSource);
                return;
            }
            if (objType === 'support' || objType === 'attachment') {
                cableWaypoints.push(clickedObject);
                clearSelection();
                selectObject(cableSource);
                return;
            }
            var finishEndpoints = ['sleeve', 'cross', 'olt'];
            if (finishEndpoints.indexOf(objType) !== -1) {
                const points = [cableSource].concat(cableWaypoints).concat([clickedObject]);
                const success = createCableFromPoints(points, cableType);
                if (success) {
                    cableSource = clickedObject;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                }
                return;
            }
            showError('Кабель прокладывается между муфтой, кроссом или OLT. Промежуточными точками могут быть опоры и крепления.', 'Недопустимое действие');
        } else {
            
            if (cableSource) {
                const currentCableType = getEffectiveCableLayingType();
                const autoSelectTolerance = getCableAutoSelectTolerance(zoom);
                let nearestObject = null;
                let minDist = Infinity;
                var validCableEndpoints = ['cross', 'sleeve', 'support', 'attachment', 'olt'];
                objects.forEach(obj => {
                    if (obj && obj.geometry && obj.properties) {
                        const t = obj.properties.get('type');
                        if (validCableEndpoints.indexOf(t) === -1) return;
                        if (obj === cableSource) return;
                        try {
                            const objCoords = obj.geometry.getCoordinates();
                            const latDiff = Math.abs(objCoords[0] - coords[0]);
                            const lonDiff = Math.abs(objCoords[1] - coords[1]);
                            const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
                            if (distance < autoSelectTolerance && distance < minDist) {
                                minDist = distance;
                                nearestObject = obj;
                            }
                        } catch (error) {}
                    }
                });
                if (nearestObject) {
                    const t = nearestObject.properties.get('type');
                    if (t === 'support' || t === 'attachment') {
                        cableWaypoints.push(nearestObject);
                        clearSelection();
                        selectObject(cableSource);
                    } else {
                        const points = [cableSource].concat(cableWaypoints).concat([nearestObject]);
                        const cableTypeVal = getEffectiveCableLayingType();
                        const success = createCableFromPoints(points, cableTypeVal);
                        if (success) {
                            cableSource = nearestObject;
                            cableWaypoints = [];
                            clearSelection();
                            selectObject(cableSource);
                            removeCablePreview();
                        }
                    }
                }
            }
        }
        return;
    }
    
    } finally {
        try { syncMapPanLockForEditTools(); } catch (eLock) {}
    }
}

var mapMouseMoveRafId = null;
function handleMapMouseMove(e) {
    try {
        if (e.originalEvent) {
            window.lastMouseX = e.originalEvent.clientX || 0;
            window.lastMouseY = e.originalEvent.clientY || 0;
        } else if (e.get) {
            const domEvent = e.get('domEvent');
            if (domEvent) {
                window.lastMouseX = domEvent.clientX || 0;
                window.lastMouseY = domEvent.clientY || 0;
            }
        }
    } catch (err) {}
    
    const mapCoords = e.get('coords');
    if (mapCoords && typeof window.syncSendCursor === 'function') window.syncSendCursor(mapCoords);

    if (!isEditMode) {
        return;
    }

    if (objectPlacementMode) {
        const type = currentPlacementType;
        updatePhantomPlacemark(type, mapCoords);
        if (type) updateCursorIndicator(e, type);
        return;
    }

    if (currentCableTool && cableSource && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        var ev = e;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(coords, getCableSnapTolerance());
            var previewCoords = coords;
            if (snapObj && snapObj !== cableSource) {
                var t = snapObj.properties.get('type');
                if (t !== 'cable' && t !== 'cableLabel') {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateCablePreview(cableSource, cableWaypoints, previewCoords);
        });
    }

    if (splitterFiberRoutingMode && splitterFiberRoutingData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(coords);
            var previewCoords = coords;
            if (snapObj) {
                var t = snapObj.properties.get('type');
                if (t === 'support' || t === 'attachment' || getObjectUniqueId(snapObj) === splitterFiberRoutingData.targetId) {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateSplitterFiberPreviewWithCursor(previewCoords);
        });
    }
    
    if (fiberRoutingMode && fiberRoutingData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coords = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            var snapObj = findObjectAtCoords(coords);
            var previewCoords = coords;
            if (snapObj) {
                var t = snapObj.properties.get('type');
                if (t === 'support' || t === 'attachment' || getObjectUniqueId(snapObj) === fiberRoutingData.targetId) {
                    previewCoords = snapObj.geometry.getCoordinates();
                }
            }
            updateFiberRoutingPreviewWithCursor(previewCoords);
        });
    }

    if (cableSplitMode && cableSplitData && mapCoords) {
        if (mapMouseMoveRafId != null) cancelAnimationFrame(mapMouseMoveRafId);
        var coordsSplit = mapCoords;
        mapMouseMoveRafId = requestAnimationFrame(function() {
            mapMouseMoveRafId = null;
            updateCableSplitPreview(coordsSplit);
        });
    }
}

function createCursorIndicator() {
    cursorIndicator = document.createElement('div');
    cursorIndicator.id = 'cursorIndicator';
    cursorIndicator.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 10000;
        background: rgba(59, 130, 246, 0.9);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        display: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(cursorIndicator);
}

function updateCursorIndicator(e, objectType, objectCoord) {
    if (!cursorIndicator) return;
    
    if (objectType && e) {
        let text = '';
        switch(objectType) {
            case 'support':
                text = 'Опора связи';
                break;
            case 'sleeve':
                text = 'Кабельная муфта';
                break;
            case 'cross':
                text = 'Оптический кросс';
                break;
            case 'node':
                text = 'Узел сети';
                break;
            case 'cross':
                text = 'Оптический кросс';
                break;
            case 'attachment':
                text = 'Крепление узлов';
                break;
            case 'olt':
                text = 'OLT (GPON)';
                break;
            case 'splitter':
                text = 'Сплиттер';
                break;
            case 'onu':
                text = 'ONU';
                break;
            case 'camera':
                text = 'Камера';
                break;
            case 'mediaConverter':
                text = 'Медиаконвертер';
                break;
            case 'cable':
                text = 'Кабель';
                break;
            case 'crossGroup':
                text = 'Группа кроссов';
                break;
            case 'nodeGroup':
                text = 'Группа узлов';
                break;
            default:
                text = 'Объект';
        }
        cursorIndicator.textContent = text;
        cursorIndicator.style.display = 'block';
        
        let clientX = window.lastMouseX || 0;
        let clientY = window.lastMouseY || 0;
        if (objectCoord && (objectCoord.length >= 2)) {
            const pt = geoToClient(objectCoord);
            if (pt) {
                clientX = pt[0];
                clientY = pt[1];
            }
        }
        if (clientX > 0 || clientY > 0) {
            cursorIndicator.style.left = clientX + 'px';
            cursorIndicator.style.top = (clientY + 14) + 'px';
            cursorIndicator.style.transform = 'translate(-50%, 0)';
        }
    } else {
        cursorIndicator.style.display = 'none';
        cursorIndicator.style.transform = '';
    }
}

function updatePhantomPlacemark(type, coords) {
    if (!type || !coords) {
        removePhantomPlacemark();
        return;
    }

    var currentPhantomType = phantomPlacemark && phantomPlacemark.properties ? phantomPlacemark.properties.get('phantomType') : null;
    if (phantomPlacemark && currentPhantomType === type) {
        phantomPlacemark.geometry.setCoordinates(coords);
        return;
    }
    removePhantomPlacemark();

    var phantomIcon = buildMapPlacemarkIcon(type, 'phantom', type === 'node' ? { nodeKind: currentPlacementNodeKind } : null);
    if (!phantomIcon) return;

    phantomPlacemark = new ymaps.Placemark(coords, {
        type: 'phantom',
        phantomType: type,
        balloonContent: 'Предпросмотр объекта'
    }, {
        iconLayout: 'default#image',
        iconImageHref: phantomIcon.href,
        iconImageSize: phantomIcon.iconImageSize,
        iconImageOffset: phantomIcon.iconImageOffset,
        iconImageOpacity: 0.7, 
        zIndex: 9999, 
        interactive: false, 
        cursor: 'crosshair'
    });
    
    myMap.geoObjects.add(phantomPlacemark);
}

function removePhantomPlacemark() {
    if (phantomPlacemark) {
        myMap.geoObjects.remove(phantomPlacemark);
        phantomPlacemark = null;
    }
}

function attachHoverEventsToObject(obj) {
    if (!obj || !obj.events) return;
    const objType = obj.properties ? obj.properties.get('type') : null;
    if (!objType || objType === 'cableLabel') return;
    
    function onMouseEnter(e) {
        const domEvent = e.get && e.get('domEvent');
        if (domEvent) {
            window.lastMouseX = domEvent.clientX || 0;
            window.lastMouseY = domEvent.clientY || 0;
        }
        if (objectPlacementMode && phantomPlacemark) {
            myMap.geoObjects.remove(phantomPlacemark);
            phantomPlacemark = null;
        }
        if (hoveredObject && hoveredObject !== obj) clearHoverHighlight();
        highlightObjectOnHover(obj, e);
    }
    function onMouseLeave() {
        if (hoveredObject === obj) clearHoverHighlight();
    }
    obj.events.add('mouseenter', onMouseEnter);
    obj.events.add('mouseleave', onMouseLeave);
    obj.events.add('mouseover', onMouseEnter);
    obj.events.add('mouseout', onMouseLeave);
}

function highlightObjectOnHover(obj, e) {
    if (!obj || !obj.properties) {
        return;
    }

    if (selectedObjects.includes(obj)) {
        return;
    }
    
    hoveredObject = obj;
    
    const type = obj.properties.get('type');

    const objCoord = (type === 'cable' || type === 'cableLabel') ? (e && e.get('coords') ? e.get('coords') : null) : (obj.geometry ? obj.geometry.getCoordinates() : null);
    updateCursorIndicator(e, type, objCoord);

    if (type === 'cable' || type === 'cableLabel') {
        
        showHoverCircle(obj, e);
        
        highlightCableOnHover(obj);
        return;
    }

    if (type === 'node') {
        showHoverCircle(obj, e);
        return;
    }

    var hoverIconTypes = ['support', 'sleeve', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment'];
    if (hoverIconTypes.indexOf(type) < 0) return;

    var hoverIcon = buildMapPlacemarkIcon(type, 'hover', obj);
    if (!hoverIcon) return;

    hoveredObjectOriginalIcon = {
        href: obj.options.get('iconImageHref'),
        size: obj.options.get('iconImageSize'),
        offset: obj.options.get('iconImageOffset')
    };

    obj.options.set({
        iconImageHref: hoverIcon.href,
        iconImageSize: hoverIcon.iconImageSize,
        iconImageOffset: hoverIcon.iconImageOffset
    });
    
    showHoverCircle(obj, e);
}

function showHoverCircle(obj, e) {
    if (!obj || !obj.geometry) return;

    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
    
    const type = obj.properties ? obj.properties.get('type') : null;

    if (type === 'cable') {
        if (!e) return;
        
        const coords = e.get('coords');
        const cableCoords = obj.geometry.getCoordinates();
        
        if (cableCoords && cableCoords.length >= 2) {
            const fromCoords = cableCoords[0];
            const toCoords = cableCoords[cableCoords.length - 1];

            const result = pointToLineDistance(coords, fromCoords, toCoords);
            const param = Math.max(0, Math.min(1, result.param));

            const nearestPoint = [
                fromCoords[0] + param * (toCoords[0] - fromCoords[0]),
                fromCoords[1] + param * (toCoords[1] - fromCoords[1])
            ];

            const zoom = myMap.getZoom();
            const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00015 : 0.0001);
            
            hoverCircle = new ymaps.Circle([nearestPoint, radius], {}, {
                fillColor: 'rgba(59, 130, 246, 0.2)',
                strokeColor: '#3b82f6',
                strokeWidth: 2,
                strokeStyle: 'solid',
                zIndex: 999
            });
            
            myMap.geoObjects.add(hoverCircle);
        }
    } else {
        
        const coords = obj.geometry.getCoordinates();

        const zoom = myMap.getZoom();
        const radius = zoom < 12 ? 0.00025 : (zoom < 15 ? 0.00018 : 0.00012);

        let fillColor = 'rgba(59, 130, 246, 0.15)';
        let strokeColor = '#3b82f6';
        let strokeWidth = 2.5;
        const isGroup = type === 'crossGroup' || type === 'nodeGroup';
        
        if (type === 'node') {
            const nodeKind = obj.properties.get('nodeKind') || 'network';
            if (nodeKind === 'aggregation') {
                strokeColor = '#ef4444';
                fillColor = 'rgba(239, 68, 68, 0.18)';
            } else {
                strokeColor = '#22c55e';
                fillColor = 'rgba(34, 197, 94, 0.18)';
            }
        } else if (isGroup) {
            fillColor = 'rgba(59, 130, 246, 0.25)';
            strokeWidth = 4;
        }
        
        hoverCircle = new ymaps.Circle([coords, radius], {}, {
            fillColor: fillColor,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
            strokeStyle: 'solid',
            zIndex: isGroup ? 9999 : 999
        });
        
        myMap.geoObjects.add(hoverCircle);
    }
}

function removeHoverCircle() {
    if (hoverCircle) {
        myMap.geoObjects.remove(hoverCircle);
        hoverCircle = null;
    }
}

function highlightCableOnHover(cable) {
    if (!cable || !cable.properties) return;

    if (!cable.properties.get('originalCableOptions')) {
        const originalOptions = {
            strokeWidth: cable.options.get('strokeWidth'),
            strokeColor: cable.options.get('strokeColor'),
            strokeOpacity: cable.options.get('strokeOpacity')
        };
        cable.properties.set('originalCableOptions', originalOptions);
    }

    const cableType = cable.properties.get('cableType');
    const normalWidth = getCableWidth(cableType);
    const normalColor = getCableColor(cableType);
    
    cable.options.set({
        strokeWidth: normalWidth * 1.8,
        strokeColor: '#60a5fa', 
        strokeOpacity: 0.95,
        zIndex: 998
    });
}

function clearCableHoverHighlight(cable) {
    if (!cable || !cable.properties) return;
    
    const originalOptions = cable.properties.get('originalCableOptions');
    if (originalOptions) {
        cable.options.set({
            strokeWidth: originalOptions.strokeWidth,
            strokeColor: originalOptions.strokeColor,
            strokeOpacity: originalOptions.strokeOpacity,
            zIndex: 0
        });
        cable.properties.unset('originalCableOptions');
    }
}

function clearHoverHighlight() {
    if (hoveredObject) {
        const type = hoveredObject.properties ? hoveredObject.properties.get('type') : null;
        
        if (type === 'cable') {
            
            clearCableHoverHighlight(hoveredObject);
        } else if (hoveredObjectOriginalIcon) {
            
            hoveredObject.options.set({
                iconImageHref: hoveredObjectOriginalIcon.href,
                iconImageSize: hoveredObjectOriginalIcon.size,
                iconImageOffset: hoveredObjectOriginalIcon.offset
            });
        }
    }
    
    hoveredObject = null;
    hoveredObjectOriginalIcon = null;
    removeHoverCircle();
    updateCursorIndicator(null, null);
}

function handleDeleteSelected() {
    if (!isEditMode) return;
    if (selectedObjects.length === 0) return;
    (async function() {
        if (!(await showConfirm('Удалить ' + selectedObjects.length + ' объектов?', 'Удаление', { confirmText: 'Удалить' }))) return;
        selectedObjects.slice().forEach(obj => deleteObject(obj, { fromBatch: true }));
        clearSelection();
    })();
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fileInput = e.target;
    const reader = new FileReader();
    reader.onload = function(ev) {
        (async function() {
        try {
            const raw = ev.target.result;
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) {
                showError('Файл должен содержать массив объектов карты (JSON-массив).', 'Импорт');
                fileInput.value = '';
                return;
            }
            
            if (objects.length > 0 && !(await showConfirm('Текущая карта будет полностью заменена импортируемыми данными. Продолжить?', 'Импорт', { confirmText: 'Продолжить' }))) {
                fileInput.value = '';
                return;
            }
            clearMap();
            importData(data);
            // После импорта фиксируем состояние, чтобы оно не терялось при перезагрузке.
            saveData();
            if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
            showSuccess('Карта импортирована (' + data.length + ' объектов)', 'Импорт');
            logAction(ActionTypes.IMPORT_DATA, { count: data.length });
        } catch (error) {
            console.error('Ошибка при импорте файла:', error);
            showError('Ошибка при чтении файла. Проверьте, что выбран корректный JSON-файл экспорта карты.', 'Импорт');
        }
        fileInput.value = '';
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
    pendingCopperPortPreset = null;
    pendingCopperRouteFinish = null;

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
}

function switchToEditMode() {
    
    if (!canEdit()) {
        showWarning('Редактирование доступно только администраторам', 'Нет доступа');
        return;
    }

    if (isNetworkMapMobileViewOnly()) {
        showInfo('На этом экране доступен только просмотр. Редактирование карты — с компьютера или планшета (ширина окна больше 768px).', 'Режим');
        return;
    }
    
    isEditMode = true;
    updateUIForMode();
    updateEditControls();
    makeObjectsDraggable();
    showInfo('Переключено в режим редактирования', 'Режим');
    syncMapPanLockForEditTools();
}

function updateUIForMode() {
    const viewBtn = document.getElementById('viewMode');
    const editBtn = document.getElementById('editMode');
    
    if (viewBtn) viewBtn.classList.toggle('active', !isEditMode);
    if (editBtn) editBtn.classList.toggle('active', isEditMode);
}

function updateEditControls() {
    const editControls = document.querySelectorAll('#addObject, #addCable');
    editControls.forEach(control => {
        control.style.opacity = isEditMode ? '1' : '0.5';
        control.style.pointerEvents = isEditMode ? 'all' : 'none';
    });
}

function makeObjectsDraggable() {
    objects.forEach(obj => {
        if (obj.options && obj.properties.get('type') !== 'cable') {
            obj.options.set('draggable', true);
        }
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', true); });
}

function makeObjectsNonDraggable() {
    objects.forEach(obj => {
        if (obj.options && obj.properties.get('type') !== 'cable') {
            obj.options.set('draggable', false);
        }
    });
    crossGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
    nodeGroupPlacemarks.forEach(pm => { if (pm.options) pm.options.set('draggable', false); });
}

function getNodeColorByKind(nodeKind) {
    return nodeKind === 'aggregation' ? '#ef4444' : '#22c55e';
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

    var hoverIconTypes = ['support', 'sleeve', 'cross', 'crossGroup', 'nodeGroup', 'olt', 'splitter', 'onu', 'switch', 'camera', 'mediaConverter', 'attachment'];

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
        updateInfoModalChrome(modalType, modalName);
        var modalBody = document.getElementById('modalInfo');
        if (modalBody && window.MapIcons) {
            modalBody.querySelectorAll('.camera-card-hero-icon, .olt-card-hero-icon, .support-card-hero-icon, .node-card-hero-icon, .fiber-ws-head-icon').forEach(function(el) {
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

function findNodeByName(name, excludePlacemark) {
    if (!name || typeof name !== 'string') return null;
    var n = (name || '').trim().toLowerCase();
    if (!n) return null;
    return objects.find(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'node') return false;
        if (obj === excludePlacemark) return false;
        var objName = (obj.properties.get('name') || '').trim().toLowerCase();
        return objName === n;
    }) || null;
}

function createObject(type, name, coords, options = {}) {
    if (!options.skipAddToObjects && wouldExceedMapObjectLimit(1)) {
        notifyMapObjectLimitBlocked();
        return null;
    }
    var balloonContent;
    switch (type) {
        case 'support': balloonContent = name ? 'Опора связи: ' + name : 'Опора связи'; break;
        case 'sleeve': balloonContent = name ? 'Кабельная муфта: ' + name : 'Кабельная муфта'; break;
        case 'cross': balloonContent = 'Оптический кросс: ' + name; break;
        case 'node': balloonContent = 'Узел сети: ' + name; break;
        case 'attachment': balloonContent = name ? 'Крепление узлов: ' + name : 'Крепление узлов'; break;
        case 'olt': balloonContent = name ? 'OLT: ' + name : 'OLT (GPON)'; break;
        case 'splitter': balloonContent = name ? 'Сплиттер: ' + name : 'Сплиттер'; break;
        case 'onu': balloonContent = name ? 'ONU: ' + name : 'ONU'; break;
        case 'camera': balloonContent = name ? 'Камера: ' + name : 'Камера'; break;
        case 'mediaConverter': balloonContent = name ? 'Медиаконвертер: ' + name : 'Медиаконвертер'; break;
        case 'switch': balloonContent = name ? 'Коммутатор: ' + name : 'Коммутатор'; break;
        default: balloonContent = 'Объект';
    }

    var mapIcon = buildMapPlacemarkIcon(type, 'normal', type === 'node' ? { nodeKind: options.nodeKind || 'network' } : null);
    if (!mapIcon) return null;

    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: mapIcon.href,
        iconImageSize: mapIcon.iconImageSize,
        iconImageOffset: mapIcon.iconImageOffset,
        draggable: isEditMode
    };
    
    const placemarkProperties = {
        type: type,
        name: name,
        balloonContent: balloonContent
    };

    if (type === 'node') {
        placemarkProperties.nodeKind = (options.nodeKind || 'network');
        placemarkProperties.comment = options.comment || '';
        if (Array.isArray(options.attachedSwitches) && options.attachedSwitches.length) {
            placemarkProperties.attachedSwitches = JSON.parse(JSON.stringify(options.attachedSwitches));
        } else {
            placemarkProperties.attachedSwitches = [];
        }
    }

    if (type === 'sleeve' && options.sleeveType) {
        placemarkProperties.sleeveType = options.sleeveType;
        placemarkProperties.maxFibers = options.maxFibers || 0;
    }

    if (type === 'cross') {
        placemarkProperties.crossPorts = options.crossPorts || 24;
        var ccp = options.crossCopperPorts !== undefined && options.crossCopperPorts !== null ? parseInt(options.crossCopperPorts, 10) : 0;
        placemarkProperties.crossCopperPorts = isNaN(ccp) ? 0 : Math.max(0, ccp);
        placemarkProperties.copperPortUsage = {};
    }
    if (type === 'olt') {
        placemarkProperties.ponPorts = options.ponPorts || 8;
        placemarkProperties.incomingFiber = null;
        placemarkProperties.portAssignments = {};
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
    }
    if (type === 'splitter') {
        placemarkProperties.splitRatio = options.splitRatio || 8;
        placemarkProperties.inputFiber = null;
        placemarkProperties.outputConnections = [];
    }
    if (type === 'onu') {
        placemarkProperties.incomingFiber = null;
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
    }
    if (type === 'camera') {
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        placemarkProperties.streamType = (options.streamType && window.CameraPlayer)
            ? CameraPlayer.normalizeStreamType(options.streamType) : (options.streamType || 'none');
        placemarkProperties.streamUrl = options.streamUrl || '';
        placemarkProperties.streamUser = options.streamUser || '';
        placemarkProperties.streamPass = options.streamPass || '';
        placemarkProperties.streamAutoplay = options.streamAutoplay !== false;
        placemarkProperties.streamMuted = options.streamMuted !== false;
        if (options.snapshotPhoto) placemarkProperties.snapshotPhoto = options.snapshotPhoto;
    }
    if (type === 'mediaConverter') {
        if (options.manufacturer) placemarkProperties.manufacturer = options.manufacturer;
        if (options.model) placemarkProperties.model = options.model;
        placemarkProperties.comment = options.comment || '';
        placemarkProperties.incomingFiber = null;
    }
    if (!placemarkProperties.uniqueId) {
        placemarkProperties.uniqueId = 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    const placemark = new ymaps.Placemark(coords, placemarkProperties, placemarkOptions);

    updateObjectLabel(placemark, name);
    if (type === 'camera') refreshCameraMapPresentation(placemark);
    var objLabel = placemark.properties.get('label');
    if (objLabel) {
        myMap.geoObjects.add(objLabel);
    }
    placemark.events.add('dragend', function() {
        var c = placemark.geometry.getCoordinates();
        var lbl = placemark.properties.get('label');
        if (lbl && lbl.geometry) lbl.geometry.setCoordinates(c);
    });

    placemark.events.add('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); 

        if (objectPlacementMode) {
            return;
        }

        if (splitterFiberRoutingMode && splitterFiberRoutingData) {
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === splitterFiberRoutingData.targetId) {
                completeSplitterFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                splitterFiberWaypoints.push(placemark);
                updateSplitterFiberPreview();
                return;
            }
            
            if (objId === getObjectUniqueId(splitterFiberRoutingData.splitterObj)) {
                splitterFiberWaypoints = [];
                updateSplitterFiberPreview();
                return;
            }
            
            var targetName = splitterFiberRoutingData.targetObj.properties.get('name') || (splitterFiberRoutingData.targetType === 'onu' ? 'ONU' : 'Сплиттер');
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }
        
        if (fiberRoutingMode && fiberRoutingData) {
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === fiberRoutingData.targetId) {
                completeFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                fiberRoutingWaypoints.push(placemark);
                updateFiberRoutingPreview();
                return;
            }
            
            if (objId === getObjectUniqueId(fiberRoutingData.sleeveObj)) {
                fiberRoutingWaypoints = [];
                updateFiberRoutingPreview();
                return;
            }
            
            var targetName = getFiberRoutingTargetLabel(fiberRoutingData.targetType, fiberRoutingData.targetObj);
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (currentCableTool && isEditMode) {
            if (Date.now() < placementPanBlockClickUntil) {
                return;
            }
            var cableTypeVal = getEffectiveCableLayingType();
            if (handleCopperCablePlacemarkStep(placemark, type, cableTypeVal)) return;
            if (type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter') {
                showError('Нельзя прокладывать кабель ВОЛС от сплиттера, ONU, камеры или медиаконвертера. Кабель прокладывается между муфтой, кроссом, креплением или OLT.', 'Недопустимое действие');
                return;
            }
            var cableEndpointsPlacemark = ['cross', 'sleeve', 'support', 'attachment', 'olt'];
            if (cableEndpointsPlacemark.indexOf(type) !== -1) {
                if (!cableSource) {
                    if (type === 'support' || type === 'attachment') {
                        showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
                        return;
                    }
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    syncMapPanLockForEditTools();
                    return;
                }
                if (placemark === cableSource) {
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (type === 'support' || type === 'attachment') {
                    cableWaypoints.push(placemark);
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                var points = [cableSource].concat(cableWaypoints).concat([placemark]);
                var success = createCableFromPoints(points, cableTypeVal);
                if (success) {
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                    syncMapPanLockForEditTools();
                }
                return;
            }
            if (type === 'node') {
                showError('Узел сети нельзя использовать для прокладки кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            return;
        }

        if ((type === 'node' || type === 'sleeve' || type === 'cross' || type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'switch')) {
            showObjectInfo(placemark);
            return;
        }

        if (type === 'support' || type === 'attachment') {
            if (isEditMode) {
                clearSelection();
                selectObject(placemark);
            }
            showSupportInfo(placemark);
            return;
        }

        if (!isEditMode) {
            return;
        }
        
        if (selectedObjects.includes(placemark)) {
            deselectObject(placemark);
        } else {
            selectObject(placemark);
        }
    });

    placemark.events.add('dragend', function() {
        window.syncDragInProgress = false;
        if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
        ensurePlacemarkUniqueIdForSync(placemark);
        var uid = placemark.properties.get('uniqueId');
        if (typeof window.syncSendOp === 'function' && uid) {
            window.syncSendOp({ type: 'update_object', uniqueId: uid, data: { geometry: placemark.geometry.getCoordinates(), name: placemark.properties.get('name') } });
        }
        updateConnectedCables(placemark);
        const label = placemark.properties.get('label');
        if (label) label.geometry.setCoordinates(placemark.geometry.getCoordinates());
        updateAllConnectionLines();
        updateSelectionPulsePosition(placemark);
        if (type === 'cross') updateCrossDisplay(); 
        if (type === 'node') updateNodeDisplay();
        saveData();
        if (typeof window.syncForceSendState === 'function' && typeof getSerializedData === 'function') {
            window.syncForceSendState(getSerializedData());
        }
    });
    
    placemark.events.add('drag', function() {
        if (!window.syncDragInProgress) window.syncDragInProgress = true;
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} } 
        scheduleDragUpdate(placemark);
    });

    attachHoverEventsToObject(placemark);
    objects.push(placemark);
    if (!options.skipAddToObjects) {
        mapLimitsCache.count = (mapLimitsCache.count || 0) + 1;
        if (mapLimitsCache.limit != null) {
            mapLimitsCache.remaining = Math.max(0, mapLimitsCache.limit - mapLimitsCache.count);
        }
        updateMapLimitBanner();
    }
    if (type === 'cross') {
        updateCrossDisplay();
    } else if (type === 'node') {
        updateNodeDisplay();
    } else {
        myMap.geoObjects.add(placemark);
        if (typeof applyMapFilter === 'function') applyMapFilter();
    }
    if (typeof window.syncSendOp === 'function') {
        var data = serializeOneObject(placemark);
        if (data) window.syncSendOp({ type: 'add_object', data: data });
    }
    saveData();
    updateStats();
    logAction(ActionTypes.CREATE_OBJECT, {
        objectType: type,
        name: name || ''
    });
    return placemark;
}

function getCablesThroughObject(obj) {
    if (!objects || !obj) return [];
    var uid = getObjectUniqueId(obj);
    return objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        if (cable.properties.get('from') === obj || cable.properties.get('to') === obj) return true;
        var points = cable.properties.get('points');
        if (!Array.isArray(points)) return false;
        for (var i = 0; i < points.length; i++) {
            if (points[i] === obj) return true;
            if (uid && points[i] && getObjectUniqueId(points[i]) === uid) return true;
        }
        return false;
    });
}

function getFiberCablesThroughWaypoint(obj) {
    return getCablesThroughSupport(obj).filter(function(cable) {
        var ct = cable.properties.get('cableType');
        return !isCopperCableType(ct);
    });
}

function getCableRoutePoints(cable) {
    var points = cable.properties.get('points');
    if (Array.isArray(points) && points.length >= 2) return points.slice();
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    if (fromObj && toObj) return [fromObj, toObj];
    return null;
}

function getPointIndexOnCableRoute(points, obj) {
    if (!Array.isArray(points) || !obj) return -1;
    var uid = getObjectUniqueId(obj);
    for (var i = 0; i < points.length; i++) {
        if (points[i] === obj) return i;
        if (uid && points[i] && getObjectUniqueId(points[i]) === uid) return i;
    }
    return -1;
}

function polylineLength(coords) {
    var sum = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        sum += calculateDistance(coords[i], coords[i + 1]);
    }
    return sum;
}

function projectPointOntoPolyline(point, coords) {
    if (!coords || coords.length < 2) return null;
    var best = null;
    var traversed = 0;
    for (var i = 0; i < coords.length - 1; i++) {
        var segLen = calculateDistance(coords[i], coords[i + 1]);
        var r = pointToLineDistance(point, coords[i], coords[i + 1]);
        var param = Math.max(0, Math.min(1, r.param));
        var px = coords[i][0] + param * (coords[i + 1][0] - coords[i][0]);
        var py = coords[i][1] + param * (coords[i + 1][1] - coords[i][1]);
        var distAlong = traversed + segLen * param;
        if (!best || r.distance < best.distance) {
            best = {
                distance: r.distance,
                point: [px, py],
                lengthAlong: distAlong,
                segmentIndex: i,
                segmentParam: param
            };
        }
        traversed += segLen;
    }
    if (!best) return null;
    var total = polylineLength(coords);
    best.totalLength = total;
    best.fraction = total > 0 ? best.lengthAlong / total : 0;
    return best;
}

function splitPolylineCoords(coords, splitPoint, proj) {
    if (!coords || coords.length < 2 || !splitPoint) return { coordsA: null, coordsB: null };
    var i = proj.segmentIndex;
    var param = proj.segmentParam;
    var coordsA = coords.slice(0, i + 1);
    coordsA.push(splitPoint);
    var coordsB = [splitPoint];
    if (param < 0.999) {
        coordsB = coordsB.concat(coords.slice(i + 1));
    } else if (i + 1 < coords.length) {
        coordsB = coordsB.concat(coords.slice(i + 2));
        if (coordsB.length < 2) coordsB = [splitPoint, coords[coords.length - 1]];
    }
    if (coordsA.length < 2 || coordsB.length < 2) return { coordsA: null, coordsB: null };
    return { coordsA: coordsA, coordsB: coordsB };
}

function resolveSplitAfterIndex(points, fraction) {
    if (!points || points.length < 2) return -1;
    var geom = points.map(function(p) {
        return p && p.geometry ? p.geometry.getCoordinates() : null;
    }).filter(function(c) { return c && c.length >= 2; });
    if (geom.length < 2) return -1;
    var total = polylineLength(geom);
    if (total <= 0) return -1;
    var target = fraction * total;
    var traversed = 0;
    var pointTs = [0];
    for (var i = 0; i < geom.length - 1; i++) {
        traversed += calculateDistance(geom[i], geom[i + 1]);
        pointTs.push(traversed / total);
    }
    var splitAfter = -1;
    for (var pi = 0; pi < points.length - 1; pi++) {
        if (pointTs[pi] <= fraction + 0.0001) splitAfter = pi;
    }
    if (splitAfter < 0) splitAfter = 0;
    if (splitAfter >= points.length - 1) splitAfter = points.length - 2;
    return splitAfter;
}

function remapCableIdForSegment(oldId, idA, idB, segment) {
    if (segment === 'A') return idA;
    if (segment === 'B') return idB;
    return oldId;
}

function getCableSegmentForRouteIndex(points, index, splitAfterIndex) {
    if (!points || index < 0) return null;
    if (index <= splitAfterIndex) return 'A';
    return 'B';
}

function getCableSegmentForPlace(placeObj, cable, splitAfterIndex) {
    var points = getCableRoutePoints(cable);
    if (!points) return null;
    var idx = getPointIndexOnCableRoute(points, placeObj);
    if (idx < 0) return null;
    return getCableSegmentForRouteIndex(points, idx, splitAfterIndex);
}

function migrateCableIdReferences(cable, oldId, idA, idB, splitAfterIndex) {
    var points = getCableRoutePoints(cable);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');

    function segForPlace(placeObj) {
        return getCableSegmentForPlace(placeObj, cable, splitAfterIndex);
    }

    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        var usedFibers = slot.properties.get('usedFibers');
        if (usedFibers && usedFibers[oldId]) {
            var seg = segForPlace(slot);
            if (seg) {
                var newId = remapCableIdForSegment(oldId, idA, idB, seg);
                usedFibers[newId] = usedFibers[oldId].slice();
                delete usedFibers[oldId];
                slot.properties.set('usedFibers', usedFibers);
            }
        }

        if (t === 'cross' || t === 'sleeve') {
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'splitterConnections', 'nodeConnections'].forEach(function(prop) {
                var conn = slot.properties.get(prop);
                if (!conn) return;
                var changed = false;
                Object.keys(conn).forEach(function(key) {
                    if (key.indexOf(oldId + '-') !== 0) return;
                    var seg = segForPlace(slot);
                    if (!seg) return;
                    var newKey = remapCableIdForSegment(oldId, idA, idB, seg) + key.slice(oldId.length);
                    conn[newKey] = conn[key];
                    delete conn[key];
                    changed = true;
                });
                if (changed) slot.properties.set(prop, conn);
            });

            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                var fcChanged = false;
                fiberConn.forEach(function(conn) {
                    if (!conn) return;
                    var segSlot = segForPlace(slot);
                    if (conn.from && conn.from.cableId === oldId && segSlot) {
                        conn.from.cableId = remapCableIdForSegment(oldId, idA, idB, segSlot);
                        fcChanged = true;
                    }
                    if (conn.to && conn.to.cableId === oldId && segSlot) {
                        conn.to.cableId = remapCableIdForSegment(oldId, idA, idB, segSlot);
                        fcChanged = true;
                    }
                });
                if (fcChanged) slot.properties.set('fiberConnections', fiberConn);
            }
        }

        if (t === 'olt') {
            var portAssignments = slot.properties.get('portAssignments') || {};
            var incomingFiber = slot.properties.get('incomingFiber');
            var paChanged = false;
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === oldId) {
                    var seg = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                    if (fromObj && slot === fromObj) seg = 'A';
                    if (toObj && slot === toObj) seg = 'B';
                    a.cableId = remapCableIdForSegment(oldId, idA, idB, seg);
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignments);
            if (incomingFiber && incomingFiber.cableId === oldId) {
                var segIn = segForPlace(fromObj) || 'A';
                if (toObj && getObjectUniqueId(slot) === getObjectUniqueId(toObj)) segIn = 'B';
                incomingFiber.cableId = remapCableIdForSegment(oldId, idA, idB, segIn);
                slot.properties.set('incomingFiber', incomingFiber);
            }
        }

        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === oldId) {
                var segSp = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                inputFiber.cableId = remapCableIdForSegment(oldId, idA, idB, segSp);
                slot.properties.set('inputFiber', inputFiber);
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                var outChanged = false;
                outputConnections.forEach(function(conn) {
                    if (conn && conn.cableId === oldId) {
                        conn.cableId = remapCableIdForSegment(oldId, idA, idB, segForPlace(fromObj) || 'A');
                        outChanged = true;
                    }
                });
                if (outChanged) slot.properties.set('outputConnections', outputConnections);
            }
        }

        if (t === 'onu' || t === 'mediaConverter') {
            var inc = slot.properties.get('incomingFiber');
            if (inc && inc.cableId === oldId) {
                var segOnu = segForPlace(fromObj) || segForPlace(toObj) || 'A';
                inc.cableId = remapCableIdForSegment(oldId, idA, idB, segOnu);
                slot.properties.set('incomingFiber', inc);
            }
        }
    });

    updateAllConnectionLines();
}

function buildRoutePointsForSplit(points, splitAfterIndex, newSleeve, coordsA, coordsB) {
    var pointsA = points.slice(0, splitAfterIndex + 1).concat([newSleeve]);
    var pointsB = [newSleeve].concat(points.slice(splitAfterIndex + 1));
    if (coordsA && coordsA.length >= 2) {
        try {
            var linA = coordsA;
            if (linA.length >= 2 && pointsA.length >= 2) {
                pointsA[0] = points[0];
                pointsA[pointsA.length - 1] = newSleeve;
            }
        } catch (eA) {}
    }
    if (coordsB && coordsB.length >= 2) {
        try {
            pointsB[0] = newSleeve;
            pointsB[pointsB.length - 1] = points[points.length - 1];
        } catch (eB) {}
    }
    return { pointsA: pointsA, pointsB: pointsB };
}

function applyCableGeometryFromCoords(cable, coords) {
    if (!cable || !cable.geometry || !coords || coords.length < 2) return;
    cable.geometry.setCoordinates(coords);
    var dist = polylineLength(coords);
    cable.properties.set('distance', dist);
}

function syncCableGeometryFromRoutePoints(cable) {
    if (!cable || !cable.properties) return;
    var points = cable.properties.get('points');
    if (!Array.isArray(points) || points.length < 2) return;
    var coords = [];
    for (var i = 0; i < points.length; i++) {
        if (points[i] && points[i].geometry) {
            var c = points[i].geometry.getCoordinates();
            if (c && c.length >= 2) coords.push(c);
        }
    }
    if (coords.length >= 2) applyCableGeometryFromCoords(cable, coords);
}

function getCableSplitLabel(cable) {
    if (!cable || !cable.properties) return 'Кабель';
    var name = cable.properties.get('cableName') || '';
    var desc = getCableDescription(cable.properties.get('cableType'));
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    var fn = from ? (from.properties.get('name') || getObjectTypeName(from.properties.get('type'))) : '?';
    var tn = to ? (to.properties.get('name') || getObjectTypeName(to.properties.get('type'))) : '?';
    return (name ? name + ' — ' : '') + desc + ' (' + fn + ' → ' + tn + ')';
}

function getSplittableFiberCablesAtWaypoint(waypointObj) {
    return getFiberCablesThroughWaypoint(waypointObj).filter(function(cable) {
        var pts = getCableRoutePoints(cable);
        if (!pts) return false;
        var idx = getPointIndexOnCableRoute(pts, waypointObj);
        return idx > 0 && idx < pts.length - 1;
    });
}

function findFiberCablesNearPoint(coords, maxDistance) {
    maxDistance = maxDistance != null ? maxDistance : 0.0004;
    var found = [];
    objects.forEach(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return;
        if (isCopperCableType(cable.properties.get('cableType'))) return;
        var geom = cable.geometry && cable.geometry.getCoordinates();
        if (!geom || geom.length < 2) return;
        var proj = projectPointOntoPolyline(coords, geom);
        if (!proj || proj.distance > maxDistance) return;
        if (proj.fraction < 0.03 || proj.fraction > 0.97) return;
        found.push({ cable: cable, distance: proj.distance });
    });
    found.sort(function(a, b) { return a.distance - b.distance; });
    return found.map(function(x) { return x.cable; });
}

function getCableSplitPreviewStroke() {
    try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--cable-split-preview');
        if (v && v.trim()) return v.trim();
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') === 'dark' ? '#f87171' : '#ef4444';
}

function getCableSplitPreviewOpacity() {
    try {
        var v = getComputedStyle(document.documentElement).getPropertyValue('--cable-split-preview-opacity');
        if (v && v.trim()) return parseFloat(v.trim()) || 0.38;
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 0.52 : 0.38;
}

function showCableSplitSelectionDialog(cables, waypointObj, clickCoords, presetSleeveOptions) {
    if (!cables || !cables.length) return;
    var modal = document.getElementById('infoModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalContent = document.getElementById('modalInfo');
    if (!modal || !modalContent) return;
    modalTitle.textContent = 'Выбор кабеля для разреза';
    var html = '<div class="info-section cable-split-dialog">';
    html += buildCableSplitSleeveFieldsHtml(presetSleeveOptions && presetSleeveOptions.sleeveType ? presetSleeveOptions.sleeveType : undefined);
    html += '<p class="cable-split-dialog__lead">Несколько кабелей рядом с точкой клика. Выберите, какой разделить:</p>';
    html += '<div class="cable-split-pick-list">';
    cables.forEach(function(cable) {
        var cid = cable.properties.get('uniqueId');
        html += '<button type="button" class="btn-secondary btn-cable-split-pick btn-pick-cable-split" data-cable-id="' + escapeHtml(cid) + '">';
        html += escapeHtml(getCableSplitLabel(cable));
        html += '</button>';
    });
    html += '</div>';
    html += '<button type="button" id="cancelCableSplitPick" class="btn-secondary cable-split-dialog-cancel">Отмена</button>';
    html += '</div>';
    modalContent.innerHTML = html;
    modal.style.display = 'block';
    bindCableSplitSleeveFields(modalContent);
    if (presetSleeveOptions && presetSleeveOptions.sleeveName) {
        var presetNameEl = modalContent.querySelector('.cable-split-sleeve-name');
        if (presetNameEl) presetNameEl.value = presetSleeveOptions.sleeveName;
    }
    modalContent.querySelectorAll('.btn-pick-cable-split').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var cableId = btn.getAttribute('data-cable-id');
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
            });
            var sleeveOpts = readCableSplitSleeveOptions(modalContent);
            modal.style.display = 'none';
            if (!cable) return;
            if (waypointObj) {
                splitCableAt(cable, mergeCableSplitSleeveOptions({ waypointObj: waypointObj }, sleeveOpts));
            } else if (clickCoords) {
                splitCableAt(cable, mergeCableSplitSleeveOptions({ clickCoords: clickCoords }, sleeveOpts));
            }
        });
    });
    var cancelBtn = document.getElementById('cancelCableSplitPick');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            if (waypointObj && (waypointObj.properties.get('type') === 'support' || waypointObj.properties.get('type') === 'attachment')) {
                showSupportInfo(waypointObj);
            }
        });
    }
}

function splitCableAt(cable, splitOptions) {
    splitOptions = splitOptions || {};
    if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
    var cableType = cable.properties.get('cableType');
    if (isCopperCableType(cableType)) {
        showError('Медный кабель нельзя разрезать этой командой.', 'Разрез кабеля');
        return false;
    }

    var points = getCableRoutePoints(cable);
    if (!points || points.length < 2) {
        showError('Не удалось определить маршрут кабеля.', 'Разрез кабеля');
        return false;
    }

    var oldId = cable.properties.get('uniqueId');
    var cableName = cable.properties.get('cableName') || '';
    var geom = cable.geometry ? cable.geometry.getCoordinates() : null;
    if (!geom || geom.length < 2) {
        geom = points.map(function(p) { return p.geometry.getCoordinates(); });
    }

    var splitAfterIndex;
    var splitCoords;
    var coordsA;
    var coordsB;
    var waypointIndex = -1;

    if (splitOptions.waypointObj) {
        var wpIdx = getPointIndexOnCableRoute(points, splitOptions.waypointObj);
        if (wpIdx <= 0 || wpIdx >= points.length - 1) {
            showError('Муфту можно установить только на промежуточной точке маршрута (опора или крепление), не на концах кабеля.', 'Разрез кабеля');
            return false;
        }
        waypointIndex = wpIdx;
        splitAfterIndex = wpIdx - 1;
        splitCoords = splitOptions.waypointObj.geometry.getCoordinates();
        var projWp = projectPointOntoPolyline(splitCoords, geom);
        if (projWp) {
            var splitRes = splitPolylineCoords(geom, splitCoords, projWp);
            coordsA = splitRes.coordsA;
            coordsB = splitRes.coordsB;
        }
    } else if (splitOptions.clickCoords) {
        var proj = projectPointOntoPolyline(splitOptions.clickCoords, geom);
        if (!proj || proj.distance > 0.0004) {
            showError('Кликните ближе к линии кабеля.', 'Разрез кабеля');
            return false;
        }
        if (proj.fraction < 0.03 || proj.fraction > 0.97) {
            showError('Слишком близко к концу кабеля. Выберите точку ближе к середине маршрута или используйте опору на маршруте.', 'Разрез кабеля');
            return false;
        }
        splitCoords = proj.point;
        splitAfterIndex = resolveSplitAfterIndex(points, proj.fraction);
        var splitResClick = splitPolylineCoords(geom, splitCoords, proj);
        coordsA = splitResClick.coordsA;
        coordsB = splitResClick.coordsB;
    } else {
        return false;
    }

    if (splitAfterIndex < 0 || splitAfterIndex >= points.length - 1) {
        showError('Не удалось определить точку разреза на маршруте.', 'Разрез кабеля');
        return false;
    }

    var sleeveType = splitOptions.sleeveType || 'SNR-FOSC-L';
    var maxFibers = splitOptions.maxFibers !== undefined && splitOptions.maxFibers !== null
        ? splitOptions.maxFibers
        : getDefaultMaxFibersForSleeveType(sleeveType);
    var newSleeve = createObject('sleeve', splitOptions.sleeveName || '', splitCoords, {
        sleeveType: sleeveType,
        maxFibers: maxFibers
    });
    if (!newSleeve) {
        showError('Не удалось создать муфту.', 'Разрез кабеля');
        return false;
    }

    var fiberCount = getFiberCount(cableType);
    if (maxFibers > 0) {
        var usedAtNew = getTotalUsedFibersInSleeve(newSleeve);
        if (usedAtNew + fiberCount * 2 > maxFibers) {
            deleteObject(newSleeve, { skipSync: true });
            showError('Вместимости выбранного типа муфты недостаточно для двух кабельных сегментов (' + (fiberCount * 2) + ' волокон).', 'Переполнение муфты');
            return false;
        }
    }

    var routes;
    if (waypointIndex > 0) {
        routes = {
            pointsA: points.slice(0, waypointIndex + 1).concat([newSleeve]),
            pointsB: [newSleeve].concat(points.slice(waypointIndex))
        };
    } else {
        routes = buildRoutePointsForSplit(points, splitAfterIndex, newSleeve, coordsA, coordsB);
    }
    var idA = 'cable-' + Date.now() + '-a-' + Math.random().toString(36).substr(2, 9);
    var idB = 'cable-' + Date.now() + '-b-' + Math.random().toString(36).substr(2, 9);

    migrateCableIdReferences(cable, oldId, idA, idB, splitAfterIndex);
    deleteCableByUniqueId(oldId, { skipSync: true });
    if (typeof window.syncSendOp === 'function') {
        window.syncSendOp({ type: 'delete_cable', uniqueId: oldId });
    }

    var okA = createCableFromPoints(routes.pointsA, cableType, idA, null, true, true);
    var okB = createCableFromPoints(routes.pointsB, cableType, idB, null, true, true);
    if (!okA || !okB) {
        showError('Ошибка при создании сегментов кабеля после разреза.', 'Разрез кабеля');
        return false;
    }

    var cableA = objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === idA; });
    var cableB = objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === idB; });
    if (waypointIndex > 0) {
        if (cableA) syncCableGeometryFromRoutePoints(cableA);
        if (cableB) syncCableGeometryFromRoutePoints(cableB);
    } else {
        if (cableA && coordsA) applyCableGeometryFromCoords(cableA, coordsA);
        else if (cableA) syncCableGeometryFromRoutePoints(cableA);
        if (cableB && coordsB) applyCableGeometryFromCoords(cableB, coordsB);
        else if (cableB) syncCableGeometryFromRoutePoints(cableB);
    }
    if (cableA && cableName) cableA.properties.set('cableName', cableName);
    if (cableB && cableName) cableB.properties.set('cableName', cableName);

    if (typeof window.syncSendOp === 'function') {
        var opA = cableA ? buildAddCableSyncOp(cableA, routes.pointsA) : null;
        var opB = cableB ? buildAddCableSyncOp(cableB, routes.pointsB) : null;
        if (opA) window.syncSendOp(opA);
        if (opB) window.syncSendOp(opB);
    }

    saveData();
    if (typeof window.syncForceSendState === 'function' && typeof getSerializedData === 'function') {
        window.syncForceSendState(getSerializedData());
    } else if (typeof window.syncSendState === 'function') {
        window.syncSendState(getSerializedData());
    }

    updateCableVisualization();
    updateAllConnectionLines();
    updateStats();

    var fromName = routes.pointsA[0].properties.get('name') || getObjectTypeName(routes.pointsA[0].properties.get('type'));
    var toName = routes.pointsB[routes.pointsB.length - 1].properties.get('name') || getObjectTypeName(routes.pointsB[routes.pointsB.length - 1].properties.get('type'));
    logAction(ActionTypes.CREATE_CABLE, {
        cableType: getCableDescription(cableType),
        from: fromName,
        to: toName,
        note: 'Разрез кабеля, муфта на маршруте'
    });

    showSuccess('Кабель разделён на два сегмента. Муфта установлена на маршруте.', 'Разрез кабеля');
    showObjectInfo(newSleeve);
    return true;
}

function cancelCableSplitMode() {
    cableSplitMode = false;
    cableSplitData = null;
    if (cableSplitPreviewLine) {
        try { myMap.geoObjects.remove(cableSplitPreviewLine); } catch (e) {}
        cableSplitPreviewLine = null;
    }
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = '';
        mapEl.classList.remove('map-crosshair-active');
    }
    document.documentElement.classList.remove('cable-split-mode-active');
    syncMapPanLockForEditTools();
}

function startCableSplitPickOnCable(cable, sleeveOptions) {
    if (!isEditMode) return;
    if (splitterFiberRoutingMode) cancelSplitterFiberRouting();
    if (fiberRoutingMode) cancelFiberRouting();
    if (objectPlacementMode) cancelObjectPlacement();
    if (currentCableTool) {
        var cableBtn = document.getElementById('addCable');
        if (cableBtn && currentCableTool) cableBtn.click();
    }
    sleeveOptions = sleeveOptions || null;
    cableSplitMode = true;
    cableSplitData = {
        mode: 'pickOnCable',
        cable: cable,
        cableUniqueId: cable.properties.get('uniqueId'),
        sleeveOptions: sleeveOptions
    };
    var modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    var typeHint = sleeveOptions && sleeveOptions.sleeveType ? sleeveOptions.sleeveType : 'SNR-FOSC-L';
    showInfo('Кликните по линии кабеля в месте установки муфты. Тип муфты: ' + typeHint + '. Escape — отмена.', 'Установка муфты');
    if (myMap && myMap.container) {
        var mapEl = myMap.container.getElement();
        mapEl.style.cursor = 'crosshair';
        mapEl.classList.add('map-crosshair-active');
    }
    document.documentElement.classList.add('cable-split-mode-active');
    syncMapPanLockForEditTools();
}

function splitCableAtWaypoint(waypointObj, cable, sleeveOptions) {
    if (!isEditMode || !waypointObj || !cable) return false;
    return splitCableAt(cable, mergeCableSplitSleeveOptions({ waypointObj: waypointObj }, sleeveOptions));
}

function handleCableSplitMapClick(coords, clickedCableObj) {
    if (!cableSplitMode || !cableSplitData) return false;
    cableSplitSuppressInfoUntil = Date.now() + 600;
    var splitData = cableSplitData;
    var savedSleeveOpts = splitData.sleeveOptions;
    if (splitData.mode !== 'pickOnCable') {
        cancelCableSplitMode();
        return false;
    }
    var preferId = splitData.cableUniqueId;
    if (clickedCableObj && clickedCableObj.properties) {
        var clickedId = clickedCableObj.properties.get('uniqueId');
        if (!preferId || clickedId === preferId) {
            cancelCableSplitMode();
            splitCableAt(clickedCableObj, mergeCableSplitSleeveOptions({ clickCoords: coords }, savedSleeveOpts));
            return true;
        }
    }
    var candidates = findFiberCablesNearPoint(coords);
    if (preferId && candidates.length > 1) {
        var preferIdx = -1;
        for (var ci = 0; ci < candidates.length; ci++) {
            if (candidates[ci].properties.get('uniqueId') === preferId) {
                preferIdx = ci;
                break;
            }
        }
        if (preferIdx > 0) {
            var pref = candidates.splice(preferIdx, 1)[0];
            candidates.unshift(pref);
        }
    }
    cancelCableSplitMode();
    if (!candidates.length) {
        showError('Рядом с точкой клика не найден кабель ВОЛС. Кликните ближе к линии кабеля.', 'Разрез кабеля');
        return true;
    }
    if (candidates.length === 1) {
        splitCableAt(candidates[0], mergeCableSplitSleeveOptions({ clickCoords: coords }, savedSleeveOpts));
    } else {
        showCableSplitSelectionDialog(candidates, null, coords, savedSleeveOpts);
    }
    return true;
}

function updateCableSplitPreview(cursorCoords) {
    if (!cableSplitMode || !cableSplitData || cableSplitData.mode !== 'pickOnCable') return;
    var cable = cableSplitData.cable;
    if (!cable || !cable.geometry) return;
    var geom = cable.geometry.getCoordinates();
    if (!geom || geom.length < 2) return;
    var proj = projectPointOntoPolyline(cursorCoords, geom);
    if (!proj) return;
    if (cableSplitPreviewLine) {
        try { myMap.geoObjects.remove(cableSplitPreviewLine); } catch (e) {}
    }
    cableSplitPreviewLine = new ymaps.Polyline([proj.point], {}, {
        strokeColor: getCableSplitPreviewStroke(),
        strokeWidth: 10,
        strokeOpacity: getCableSplitPreviewOpacity()
    });
    myMap.geoObjects.add(cableSplitPreviewLine);
}

function deleteObject(obj, opts) {
    
    const objType = obj.properties.get('type');
    const objName = obj.properties.get('name') || '';
    const objUniqueId = obj.properties.get('uniqueId');

    if (objType === 'node' && objUniqueId) {
        objects.forEach(function(crossObj) {
            if (!crossObj.properties || crossObj.properties.get('type') !== 'cross') return;
            var nodeConnections = crossObj.properties.get('nodeConnections');
            if (!nodeConnections) return;
            var changed = false;
            Object.keys(nodeConnections).forEach(function(key) {
                var conn = nodeConnections[key];
                if (conn && conn.nodeId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        if (conn.switchId != null && conn.switchPort != null) {
                            clearNodeSwitchFiberPortOccupied(obj, conn.switchId, conn.switchPort);
                        }
                        removeNodeConnectionLine(crossObj, cableId, fiberNum);
                        delete nodeConnections[key];
                        changed = true;
                    }
                }
            });
            if (changed) crossObj.properties.set('nodeConnections', nodeConnections);
        });
    }
    if (objType === 'olt' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var oltConn = slot.properties.get('oltConnections');
            if (!oltConn) return;
            var changed = false;
            Object.keys(oltConn).forEach(function(key) {
                if (oltConn[key] && oltConn[key].oltId === objUniqueId) {
                    delete oltConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('oltConnections', oltConn);
        });
    }
    if (objType === 'onu' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var onuConn = slot.properties.get('onuConnections');
            if (!onuConn) return;
            var changed = false;
            Object.keys(onuConn).forEach(function(key) {
                if (onuConn[key] && onuConn[key].onuId === objUniqueId) {
                    delete onuConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('onuConnections', onuConn);
        });
    }
    if (objType === 'mediaConverter' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var mcConn = slot.properties.get('mediaConverterConnections');
            if (!mcConn) return;
            var changed = false;
            Object.keys(mcConn).forEach(function(key) {
                if (mcConn[key] && mcConn[key].mediaConverterId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        removeOnuConnectionLine(slot, cableId, fiberNum);
                    }
                    delete mcConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('mediaConverterConnections', mcConn);
        });
    }
    if (objType === 'splitter' && objUniqueId) {
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var splitterConn = slot.properties.get('splitterConnections');
            if (!splitterConn) return;
            var changed = false;
            Object.keys(splitterConn).forEach(function(key) {
                if (splitterConn[key] && splitterConn[key].splitterId === objUniqueId) {
                    var parts = key.split('-');
                    var fiberNum = parseInt(parts.pop(), 10);
                    var cableId = parts.join('-');
                    if (!isNaN(fiberNum) && cableId) {
                        removeSplitterConnectionLine(slot, cableId, fiberNum);
                    }
                    delete splitterConn[key];
                    changed = true;
                }
            });
            if (changed) slot.properties.set('splitterConnections', splitterConn);
        });
    }

    const label = obj.properties.get('label');
    if (label) {
        myMap.geoObjects.remove(label);
    }
    
    if (objType === 'support' || objType === 'attachment') {
        objects.forEach(cable => {
            if (!cable.properties || cable.properties.get('type') !== 'cable') return;
            var points = cable.properties.get('points');
            if (!Array.isArray(points)) return;
            
            var objIdx = points.indexOf(obj);
            if (objIdx === -1) {
                var objUid = getObjectUniqueId(obj);
                for (var pi = 0; pi < points.length; pi++) {
                    if (points[pi] && getObjectUniqueId(points[pi]) === objUid) {
                        objIdx = pi;
                        break;
                    }
                }
            }
            
            if (objIdx !== -1 && objIdx > 0 && objIdx < points.length - 1) {
                var newPoints = points.filter((p, idx) => idx !== objIdx);
                cable.properties.set('points', newPoints);
                
                var newGeometry = newPoints.map(p => {
                    if (p && p.geometry) {
                        return p.geometry.getCoordinates();
                    }
                    return null;
                }).filter(c => c !== null);
                
                if (newGeometry.length >= 2 && cable.geometry) {
                    cable.geometry.setCoordinates(newGeometry);
                }
            }
        });
    }

    let cablesToRemove = objects.filter(cable => {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        if (cable.properties.get('from') === obj || cable.properties.get('to') === obj) return true;
        return false;
    });
    
    cablesToRemove.forEach(cable => {
        var cableUniqueId = cable.properties.get('uniqueId');
        if (cableUniqueId) {
            deleteCableByUniqueId(cableUniqueId, { skipSync: true });
        } else {
            myMap.geoObjects.remove(cable);
            objects = objects.filter(o => o !== cable);
        }
    });
    
    myMap.geoObjects.remove(obj);
    const hadLabel = obj.properties && obj.properties.get('label');
    if (hadLabel) try { myMap.geoObjects.remove(hadLabel); } catch (e) {}
    objects = objects.filter(o => o !== obj);
    
    updateCableVisualization();
    if (objType === 'cross') updateCrossDisplay();
    if (objType === 'node') updateNodeDisplay();
    updateAllConnectionLines();

    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function' && objUniqueId) {
            window.syncSendOp({ type: 'delete_object', uniqueId: objUniqueId });
        }
        saveData();
        logAction(ActionTypes.DELETE_OBJECT, {
            objectType: objType,
            name: objName
        });
    }
    updateStats();
    
    var infoModal = document.getElementById('infoModal');
    if (isInfoModalVisible(infoModal)) {
        var modalTitleEl = document.getElementById('modalTitle');
        var isTraceModal = modalTitleEl && modalTitleEl.textContent && modalTitleEl.textContent.toLowerCase().indexOf('трассировка') !== -1;
        if (currentModalObject === obj || isTraceModal) {
            closeInfoModal();
        }
    }
}

function selectObject(obj) {
    clearShowOnMapHighlight();
    if (!selectedObjects.includes(obj)) {
        selectedObjects.push(obj);
        
        const type = obj.properties.get('type');
        
        if (isEditMode && type !== 'crossGroup' && type !== 'nodeGroup') {
            return;
        }

        applyMapPlacemarkIcon(obj, type, 'selected', obj);
    }
}

function addSelectionPulse(obj) {
    
    return;
}

var dragUpdateRafId = null;
var dragUpdatePlacemark = null;
function scheduleDragUpdate(pm) {
    dragUpdatePlacemark = pm;
    if (dragUpdateRafId != null) return;
    dragUpdateRafId = requestAnimationFrame(function() {
        dragUpdateRafId = null;
        var placemark = dragUpdatePlacemark;
        dragUpdatePlacemark = null;
        if (placemark) {
            updateSelectionPulsePosition(placemark);
            updateConnectedCables(placemark);
        }
    });
}

function updateSelectionPulsePosition(obj) {
    const pulse = obj.properties.get('selectionPulse');
    if (pulse && obj.geometry) {
        const coords = obj.geometry.getCoordinates();
        pulse.geometry.setCoordinates(coords);
    }
}

function removeSelectionPulse(obj) {
    const pulse = obj.properties.get('selectionPulse');
    if (pulse) {
        myMap.geoObjects.remove(pulse);
        obj.properties.set('selectionPulse', null);
    }
}

function deselectObject(obj) {
    selectedObjects = selectedObjects.filter(o => o !== obj);

    removeSelectionPulse(obj);
    
    const type = obj.properties.get('type');
    
    if (isEditMode && type !== 'crossGroup' && type !== 'nodeGroup') {
        return;
    }

    applyMapPlacemarkIcon(obj, type, 'normal', obj);
}

function clearSelection() {
    clearShowOnMapHighlight();
    while (selectedObjects.length > 0) {
        deselectObject(selectedObjects[0]);
    }

}

function addCable(fromObj, toObj, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false, copperMeta = null) {
    
    if (Array.isArray(toObj)) {
        return createCableFromPoints(toObj, cableType, existingCableId, null, skipHistoryLog, skipSync, copperMeta);
    }

    return createCableFromPoints([fromObj, toObj], cableType, existingCableId, fiberNumber, skipHistoryLog, skipSync, copperMeta);
}

/** Метаданные меди из JSON / op.data для createCableFromPoints */
function copperSerializedMetaFromItem(item) {
    if (!item || item.cableType !== 'copper') return null;
    var m = {};
    if (item.copperSwitchFromId) m.copperSwitchFromId = item.copperSwitchFromId;
    if (item.copperSwitchToId) m.copperSwitchToId = item.copperSwitchToId;
    if (item.copperPortFrom != null && item.copperPortFrom !== '') {
        var x = parseInt(item.copperPortFrom, 10);
        if (!isNaN(x)) m.copperPortFrom = x;
    }
    if (item.copperPortTo != null && item.copperPortTo !== '') {
        var y = parseInt(item.copperPortTo, 10);
        if (!isNaN(y)) m.copperPortTo = y;
    }
    return Object.keys(m).length ? m : null;
}

/** Восстановление полей меди и занятости портов из сохранённого элемента (импорт / merge). */
function applySerializedCopperMetadataToCable(cable, item) {
    if (!cable || !cable.properties || !item || item.cableType !== 'copper') return;
    if (item.copperPortFrom != null && item.copperPortFrom !== '') {
        var cpf = parseInt(item.copperPortFrom, 10);
        cable.properties.set('copperPortFrom', isNaN(cpf) ? null : cpf);
    } else cable.properties.set('copperPortFrom', null);
    if (item.copperPortTo != null && item.copperPortTo !== '') {
        var cpt = parseInt(item.copperPortTo, 10);
        cable.properties.set('copperPortTo', isNaN(cpt) ? null : cpt);
    } else cable.properties.set('copperPortTo', null);
    cable.properties.set('copperSwitchFromId', item.copperSwitchFromId || null);
    cable.properties.set('copperSwitchToId', item.copperSwitchToId || null);
    applyCopperCableOccupancyFromCable(cable);
}

function getEffectiveCableLayingType() {
    if (typeof copperCableLayingActive !== 'undefined' && copperCableLayingActive) return 'copper';
    return 'fiber';
}

function applyNewCableFiberProps(cable) {
    if (!cable || !cable.properties || !window.FiberCableConfig) return;
    if (!window.FiberCableConfig.isOpticalCableType(cable.properties.get('cableType'))) return;
    var count = window.FiberCableConfig.getLayFiberCount();
    cable.properties.set('fiberCount', count);
    cable.properties.set('cableType', 'fiber');
    var pal = window.FiberCableConfig.getLayFiberPalette();
    if (pal && pal.length) cable.properties.set('fiberPalette', pal);
    else cable.properties.unset('fiberPalette');
    window.FiberCableConfig.applyOpticalMapStyle(cable);
}

function applyImportedCableFiberProps(cable, item) {
    if (!cable || !cable.properties || !item || item.cableType === 'copper') return;
    if (!window.FiberCableConfig) return;
    if (item.fiberCount != null && item.fiberCount !== '') {
        cable.properties.set('fiberCount', parseInt(item.fiberCount, 10));
    } else if (window.FiberCableConfig.LEGACY_TYPE_COUNTS[item.cableType]) {
        cable.properties.set('fiberCount', window.FiberCableConfig.LEGACY_TYPE_COUNTS[item.cableType]);
    }
    if (Array.isArray(item.fiberPalette) && item.fiberPalette.length) {
        cable.properties.set('fiberPalette', item.fiberPalette);
    }
    if (window.FiberCableConfig.isOpticalCableType(cable.properties.get('cableType'))) {
        window.FiberCableConfig.applyOpticalMapStyle(cable);
    }
}

function disableCableMapBalloon(cable) {
    if (!cable) return;
    if (cable.properties) {
        cable.properties.unset('balloonContent');
        cable.properties.unset('hintContent');
    }
    if (cable.options) {
        cable.options.set({ hasBalloon: false, hasHint: false });
    }
}

function parseFiberConnectionKey(key) {
    if (!key || typeof key !== 'string') return null;
    var parts = key.split('-');
    var fiberNumber = parseInt(parts.pop(), 10);
    if (isNaN(fiberNumber)) return null;
    var cableId = parts.join('-');
    if (!cableId) return null;
    return { cableId: cableId, fiberNumber: fiberNumber };
}

function isCableFiberBeyondMax(cableId, fiberNumber, targetCableId, maxFiber) {
    return cableId === targetCableId && fiberNumber > maxFiber;
}

function countConnectionsLostOnCableFiberReduction(cableUniqueId, maxFiber) {
    var stats = { splices: 0, assignments: 0, external: 0 };
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        if (t === 'cross' || t === 'sleeve') {
            ['oltConnections', 'onuConnections', 'mediaConverterConnections', 'splitterConnections', 'nodeConnections'].forEach(function(prop) {
                var conn = slot.properties.get(prop);
                if (!conn) return;
                Object.keys(conn).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        stats.assignments++;
                    }
                });
            });
            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                fiberConn.forEach(function(conn) {
                    if (!conn) return;
                    var fromHit = conn.from && isCableFiberBeyondMax(conn.from.cableId, conn.from.fiberNumber, cableUniqueId, maxFiber);
                    var toHit = conn.to && isCableFiberBeyondMax(conn.to.cableId, conn.to.fiberNumber, cableUniqueId, maxFiber);
                    if (fromHit || toHit) stats.splices++;
                });
            }
        }
        if (t === 'olt') {
            var incomingFiber = slot.properties.get('incomingFiber');
            if (incomingFiber && incomingFiber.cableId === cableUniqueId && incomingFiber.fiberNumber > maxFiber) {
                stats.external++;
            }
            var portAssignments = slot.properties.get('portAssignments') || {};
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === cableUniqueId && a.fiberNumber > maxFiber) stats.external++;
            });
        }
        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === cableUniqueId && inputFiber.fiberNumber > maxFiber) {
                stats.external++;
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                outputConnections.forEach(function(conn) {
                    if (conn && conn.cableId === cableUniqueId && conn.fiberNumber > maxFiber) stats.external++;
                });
            }
        }
        if (t === 'onu' || t === 'mediaConverter') {
            var inc = slot.properties.get('incomingFiber');
            if (inc && inc.cableId === cableUniqueId && inc.fiberNumber > maxFiber) stats.external++;
        }
    });
    stats.total = stats.splices + stats.assignments + stats.external;
    return stats;
}

function formatCableFiberReductionLossMessage(oldCount, newCount, lost) {
    var lines = [
        'Число жил будет уменьшено с ' + oldCount + ' до ' + newCount + '.',
        'Жилы ' + (newCount + 1) + '–' + oldCount + ' исчезнут с схемы кросса и муфты.'
    ];
    var parts = [];
    if (lost.splices) parts.push(lost.splices + ' сращивани' + (lost.splices === 1 ? 'е' : (lost.splices < 5 ? 'я' : 'й')));
    if (lost.assignments) parts.push(lost.assignments + ' подключени' + (lost.assignments === 1 ? 'е' : (lost.assignments < 5 ? 'я' : 'й')) + ' жил');
    if (lost.external) parts.push(lost.external + ' назначени' + (lost.external === 1 ? 'е' : (lost.external < 5 ? 'я' : 'й')) + ' на OLT/ONU/сплиттер');
    if (parts.length) lines.push('Будут сброшены: ' + parts.join(', ') + '.');
    lines.push('Продолжить?');
    return lines.join('\n\n');
}

function pruneConnectionsForRemovedCableFibers(cableUniqueId, maxFiber) {
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');

        if (t === 'cross' || t === 'sleeve') {
            var nodeConn = slot.properties.get('nodeConnections');
            if (nodeConn) {
                Object.keys(nodeConn).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = nodeConn[key];
                    if (conn && conn.nodeId && conn.switchId != null && conn.switchPort != null) {
                        var nodeObj = objects.find(function(n) {
                            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === conn.nodeId;
                        });
                        if (nodeObj) clearNodeSwitchFiberPortOccupied(nodeObj, conn.switchId, conn.switchPort);
                    }
                    removeNodeConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete nodeConn[key];
                });
                slot.properties.set('nodeConnections', nodeConn);
            }

            var oltConn = slot.properties.get('oltConnections');
            if (oltConn) {
                Object.keys(oltConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = oltConn[key];
                    if (conn && conn.oltId) {
                        var oltObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === conn.oltId;
                        });
                        if (oltObj) {
                            if (conn.incoming) {
                                oltObj.properties.set('incomingFiber', null);
                            } else if (conn.portNumber != null) {
                                var portAssignments = oltObj.properties.get('portAssignments') || {};
                                delete portAssignments[String(conn.portNumber)];
                                oltObj.properties.set('portAssignments', portAssignments);
                            }
                        }
                    }
                    removeOltConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete oltConn[key];
                });
                slot.properties.set('oltConnections', oltConn);
            }

            var onuConn = slot.properties.get('onuConnections');
            if (onuConn) {
                Object.keys(onuConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = onuConn[key];
                    if (conn && conn.onuId) {
                        var onuObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === conn.onuId;
                        });
                        if (onuObj) {
                            var if_ = onuObj.properties.get('incomingFiber');
                            if (if_ && if_.cableId === cableUniqueId && if_.fiberNumber === parsed.fiberNumber) {
                                onuObj.properties.set('incomingFiber', null);
                            }
                        }
                    }
                    removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete onuConn[key];
                });
                slot.properties.set('onuConnections', onuConn);
            }

            var mcConn = slot.properties.get('mediaConverterConnections');
            if (mcConn) {
                Object.keys(mcConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = mcConn[key];
                    if (conn && conn.mediaConverterId) {
                        var mcObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === conn.mediaConverterId;
                        });
                        if (mcObj) {
                            var ifMc = mcObj.properties.get('incomingFiber');
                            if (ifMc && ifMc.cableId === cableUniqueId && ifMc.fiberNumber === parsed.fiberNumber) {
                                mcObj.properties.set('incomingFiber', null);
                            }
                        }
                    }
                    removeOnuConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete mcConn[key];
                });
                slot.properties.set('mediaConverterConnections', mcConn);
            }

            var splitterConn = slot.properties.get('splitterConnections');
            if (splitterConn) {
                Object.keys(splitterConn).slice().forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (!parsed || !isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) return;
                    var conn = splitterConn[key];
                    if (conn && conn.splitterId) {
                        var splitterObj = objects.find(function(o) {
                            return o.properties && o.properties.get('type') === 'splitter' && o.properties.get('uniqueId') === conn.splitterId;
                        });
                        if (splitterObj) {
                            var inputFiber = splitterObj.properties.get('inputFiber');
                            if (inputFiber && inputFiber.cableId === cableUniqueId && inputFiber.fiberNumber === parsed.fiberNumber) {
                                splitterObj.properties.set('inputFiber', null);
                            }
                        }
                    }
                    removeSplitterConnectionLine(slot, parsed.cableId, parsed.fiberNumber);
                    delete splitterConn[key];
                });
                slot.properties.set('splitterConnections', splitterConn);
            }

            var fiberConn = slot.properties.get('fiberConnections');
            if (Array.isArray(fiberConn)) {
                var newFiberConn = fiberConn.filter(function(conn) {
                    if (!conn) return false;
                    var fromHit = conn.from && isCableFiberBeyondMax(conn.from.cableId, conn.from.fiberNumber, cableUniqueId, maxFiber);
                    var toHit = conn.to && isCableFiberBeyondMax(conn.to.cableId, conn.to.fiberNumber, cableUniqueId, maxFiber);
                    return !fromHit && !toHit;
                });
                if (newFiberConn.length !== fiberConn.length) {
                    slot.properties.set('fiberConnections', newFiberConn);
                }
            }

            var fiberLabels = slot.properties.get('fiberLabels');
            if (fiberLabels) {
                Object.keys(fiberLabels).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        delete fiberLabels[key];
                    }
                });
                slot.properties.set('fiberLabels', fiberLabels);
            }

            var fiberPorts = slot.properties.get('fiberPorts');
            if (fiberPorts) {
                Object.keys(fiberPorts).forEach(function(key) {
                    var parsed = parseFiberConnectionKey(key);
                    if (parsed && isCableFiberBeyondMax(parsed.cableId, parsed.fiberNumber, cableUniqueId, maxFiber)) {
                        delete fiberPorts[key];
                    }
                });
                slot.properties.set('fiberPorts', fiberPorts);
            }
        }

        if (t === 'olt') {
            var incomingFiberOlt = slot.properties.get('incomingFiber');
            if (incomingFiberOlt && incomingFiberOlt.cableId === cableUniqueId && incomingFiberOlt.fiberNumber > maxFiber) {
                slot.properties.set('incomingFiber', null);
            }
            var portAssignmentsOlt = slot.properties.get('portAssignments') || {};
            var paChanged = false;
            Object.keys(portAssignmentsOlt).forEach(function(portKey) {
                var a = portAssignmentsOlt[portKey];
                if (a && a.cableId === cableUniqueId && a.fiberNumber > maxFiber) {
                    delete portAssignmentsOlt[portKey];
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignmentsOlt);
        }
        if (t === 'splitter') {
            var inputFiberSp = slot.properties.get('inputFiber');
            if (inputFiberSp && inputFiberSp.cableId === cableUniqueId && inputFiberSp.fiberNumber > maxFiber) {
                slot.properties.set('inputFiber', null);
            }
            var outputConnections = slot.properties.get('outputConnections');
            if (outputConnections && Array.isArray(outputConnections)) {
                var outChanged = false;
                var newOutputConn = outputConnections.map(function(conn) {
                    if (conn && conn.cableId === cableUniqueId && conn.fiberNumber > maxFiber) {
                        outChanged = true;
                        return { onuId: conn.onuId, splitterId: conn.splitterId };
                    }
                    return conn;
                });
                if (outChanged) slot.properties.set('outputConnections', newOutputConn);
            }
        }
        if (t === 'onu' || t === 'mediaConverter') {
            var incEnd = slot.properties.get('incomingFiber');
            if (incEnd && incEnd.cableId === cableUniqueId && incEnd.fiberNumber > maxFiber) {
                slot.properties.set('incomingFiber', null);
            }
        }

        var usedFibersData = slot.properties.get('usedFibers');
        if (usedFibersData && usedFibersData[cableUniqueId]) {
            usedFibersData[cableUniqueId] = usedFibersData[cableUniqueId].filter(function(n) { return n <= maxFiber; });
            slot.properties.set('usedFibers', usedFibersData);
        }
    });
    updateAllConnectionLines();
    updateOltConnectionLines();
    updateSplitterConnectionLines();
}

function revertCableFiberCountInputs(cableUniqueId) {
    var cable = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cable' && obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable) return;
    var count = String(getFiberCount(cable));
    document.querySelectorAll('.cable-fiber-count-input').forEach(function(inp) {
        if (inp.getAttribute('data-cable-id') === cableUniqueId) inp.value = count;
    });
    var mainInput = document.getElementById('cableFiberCountInput');
    if (mainInput && cable === currentModalObject) mainInput.value = count;
}

async function updateCableFiberSettings(cableUniqueId, fiberCount, fiberPalette) {
    var cable = objects.find(function(obj) {
        return obj.properties && obj.properties.get('type') === 'cable' && obj.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cable || !window.FiberCableConfig) return false;
    var oldCount = getFiberCount(cable);
    var newCount = Math.max(1, Math.min(window.FiberCableConfig.MAX_FIBERS, parseInt(fiberCount, 10) || 1));
    var removedConnections = 0;
    if (newCount < oldCount) {
        var lost = countConnectionsLostOnCableFiberReduction(cableUniqueId, newCount);
        var ok = await showConfirm(
            formatCableFiberReductionLossMessage(oldCount, newCount, lost),
            'Изменение числа жил',
            {
                confirmText: 'Применить',
                cancelText: 'Отмена',
                closeOnBackdrop: false,
                closeOnEscape: false,
                allowCloseButton: false
            }
        );
        if (!ok) {
            revertCableFiberCountInputs(cableUniqueId);
            return false;
        }
        removedConnections = lost.total;
        pruneConnectionsForRemovedCableFibers(cableUniqueId, newCount);
    }
    window.FiberCableConfig.applyCableFiberSettings(cable, newCount, fiberPalette);
    disableCableMapBalloon(cable);
    saveData();
    if (currentModalObject) {
        if (currentModalObject === cable) showCableInfo(cable);
        else refreshObjectModal(currentModalObject);
    }
    return true;
}

/** Без uniqueId op add_cable на сервере не находит концы — кабель не попадает в сохранённое состояние. */
function ensurePlacemarkUniqueIdForSync(pm) {
    if (!pm || !pm.properties) return;
    var uid = pm.properties.get('uniqueId');
    if (uid != null && uid !== '') return;
    var t = pm.properties.get('type') || 'obj';
    pm.properties.set('uniqueId', generateUniqueId(t));
}

function createCableFromPoints(points, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false, copperMeta = null) {
    if (!points || points.length < 2) return false;
    
    var firstType = points[0] && points[0].properties ? points[0].properties.get('type') : null;
    var lastType = points[points.length - 1] && points[points.length - 1].properties ? points[points.length - 1].properties.get('type') : null;

    if (isCopperCableType(cableType)) {
        if (!validateCopperCableRoute(points, skipSync, copperMeta || {})) return false;
    } else {
        if (firstType === 'node' || lastType === 'node') {
            if (!skipSync) showError('Нельзя прокладывать кабель напрямую к узлу сети. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
            return false;
        }
        const validEndpoints = ['sleeve', 'cross', 'olt'];
        if (validEndpoints.indexOf(firstType) === -1) {
            if (!skipSync) showError('Кабель можно прокладывать от муфты, кросса или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return false;
        }
        if (validEndpoints.indexOf(lastType) === -1) {
            if (!skipSync) showError('Кабель можно прокладывать до муфты, кросса или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return false;
        }

        for (var idx = 0; idx < points.length; idx++) {
            var obj = points[idx];
            var pt = obj && obj.properties ? obj.properties.get('type') : null;
            if (pt === 'node') {
                if (!skipSync) showError('Узел сети не может быть промежуточной точкой кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return false;
            }
            if (pt === 'splitter' || pt === 'onu' || pt === 'camera' || pt === 'mediaConverter') {
                if (!skipSync) showError('Сплиттер, ONU, камера и медиаконвертер не могут быть началом, концом или промежуточной точкой кабеля ВОЛС. Кабель прокладывается между муфтой, кроссом или OLT.', 'Недопустимое действие');
                return false;
            }
        }
    }

    {
        const fiberCount = getFiberCount(cableType);
        if (!isCopperCableType(cableType) && fiberCount > 0) {
            for (let i = 0; i < points.length; i++) {
                const obj = points[i];
                if (obj && obj.properties && obj.properties.get('type') === 'sleeve') {
                    const maxFibers = obj.properties.get('maxFibers');
                    if (maxFibers && maxFibers > 0) {
                        const usedFibersCount = getTotalUsedFibersInSleeve(obj);
                        const segmentsCount = (i === 0 || i === points.length - 1) ? 1 : 2;
                        if (usedFibersCount + (fiberCount * segmentsCount) > maxFibers) {
                            if (!skipSync) showError(`Превышена максимальная вместимость муфты! Использовано: ${usedFibersCount}/${maxFibers} волокон. Попытка добавить: ${fiberCount * segmentsCount} волокон`, 'Переполнение муфты');
                            return false;
                        }
                    }
                }
            }
        }
    }
    
    const fiberCount = getFiberCount(cableType);
    
    const coords = points.map(obj => obj.geometry.getCoordinates());

    let totalDistance = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        totalDistance += calculateDistance(coords[i], coords[i + 1]);
    }
    
    const cableColor = getCableColor(cableType);
    const cableWidth = getCableWidth(cableType);
    const cableDescription = getCableDescription(cableType);

    const cableUniqueId = existingCableId || `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const polyline = new ymaps.Polyline(coords, {}, {
        strokeColor: cableColor,
        strokeWidth: cableWidth,
        strokeOpacity: 0.8,
        hasBalloon: false,
        hasHint: false
    });
    
    polyline.properties.set({
        type: 'cable',
        cableType: cableType,
        from: points[0],
        to: points[points.length - 1],
        uniqueId: cableUniqueId,
        distance: totalDistance,
        points: points 
    });
    if (isCopperCableType(cableType)) {
        polyline.properties.set('copperPortFrom', null);
        polyline.properties.set('copperPortTo', null);
        var cm = copperMeta || {};
        polyline.properties.set('copperSwitchFromId', cm.copperSwitchFromId || null);
        polyline.properties.set('copperSwitchToId', cm.copperSwitchToId || null);
        if (pendingCopperPortPreset) {
            var pp = pendingCopperPortPreset;
            var firstPt = points[0];
            var fUid = firstPt && firstPt.properties && firstPt.properties.get('uniqueId');
            var fType = firstPt && firstPt.properties && firstPt.properties.get('type');
            if (pp.kind === 'node' && fType === 'node' && fUid === pp.nodeUid) {
                polyline.properties.set('copperSwitchFromId', pp.switchId);
                polyline.properties.set('copperPortFrom', pp.port);
            }
            pendingCopperPortPreset = null;
        }
        var cpToMeta = cm.copperPortTo;
        if (cpToMeta != null && cpToMeta !== '' && !isNaN(parseInt(cpToMeta, 10))) {
            polyline.properties.set('copperPortTo', parseInt(cpToMeta, 10));
        }
        var cpFromMeta = cm.copperPortFrom;
        if (cpFromMeta != null && cpFromMeta !== '' && !isNaN(parseInt(cpFromMeta, 10))) {
            polyline.properties.set('copperPortFrom', parseInt(cpFromMeta, 10));
        }
        applyCopperCableOccupancyFromCable(polyline);
    } else if (isOpticalCableType(cableType) && !existingCableId) {
        applyNewCableFiberProps(polyline);
    }

    polyline.events.add('click', function(e) {
        try {
            if (e.originalEvent && typeof e.originalEvent.stopPropagation === 'function') {
                e.originalEvent.stopPropagation();
            }
            if (e.stopPropagation && typeof e.stopPropagation === 'function') {
                e.stopPropagation();
            }
        } catch (error) {
            
        }
        if (cableSplitMode && cableSplitData) {
            var splitCoords = e.get && e.get('coords');
            if (splitCoords) {
                window.lastMapClickCoords = splitCoords;
                handleCableSplitMapClick(splitCoords, polyline);
                return false;
            }
        }
        if (cableSplitSuppressInfoUntil && Date.now() < cableSplitSuppressInfoUntil) {
            return false;
        }
        showCableInfo(polyline);
        return false;
    });
    
    disableCableMapBalloon(polyline);
    attachHoverEventsToObject(polyline);
    objects.push(polyline);
    myMap.geoObjects.add(polyline);
    if (typeof applyMapFilter === 'function') applyMapFilter();

    if (fiberNumber !== null && points.length >= 2) {
        markFiberAsUsed(points[0], cableUniqueId, fiberNumber);
        markFiberAsUsed(points[points.length - 1], cableUniqueId, fiberNumber);
    }

    updateCableVisualization();
    
    if (!skipSync) {
        saveData();
        if (typeof window.syncSendOp === 'function') {
            var addCableOp = buildAddCableSyncOp(polyline, points);
            if (addCableOp) window.syncSendOp(addCableOp);
        }
        if (!skipHistoryLog) {
            const fromName = points[0].properties.get('name') || getObjectTypeName(points[0].properties.get('type'));
            const toName = points[points.length - 1].properties.get('name') || getObjectTypeName(points[points.length - 1].properties.get('type'));
            logAction(ActionTypes.CREATE_CABLE, {
                cableType: cableDescription,
                from: fromName,
                to: toName
            });
        }
    }
    updateStats();
    return true;
}

function buildAddCableSyncOp(polyline, points) {
    if (!polyline || !points || points.length < 2) return null;
    for (var pUi = 0; pUi < points.length; pUi++) {
        ensurePlacemarkUniqueIdForSync(points[pUi]);
    }
    var cableType = polyline.properties.get('cableType');
    var cableUniqueId = polyline.properties.get('uniqueId');
    var coords = polyline.geometry ? polyline.geometry.getCoordinates() : null;
    if (!coords) coords = points.map(function(obj) { return obj.geometry.getCoordinates(); });
    coords = normalizeCableGeometry(coords) || coords;
    var totalDistance = polyline.properties.get('distance');
    if (totalDistance === undefined) {
        totalDistance = 0;
        for (var i = 0; i < coords.length - 1; i++) {
            totalDistance += calculateDistance(coords[i], coords[i + 1]);
        }
    }
    var fromUid = points[0].properties.get('uniqueId');
    var toUid = points[points.length - 1].properties.get('uniqueId');
    if (!fromUid || !toUid) return null;
    var addCableOp = {
        type: 'add_cable',
        data: {
            fromUniqueId: fromUid,
            toUniqueId: toUid,
            cableType: cableType,
            uniqueId: cableUniqueId,
            geometry: coords,
            distance: totalDistance,
            cableName: polyline.properties.get('cableName') || null
        }
    };
    if (!isCopperCableType(cableType)) {
        var fcOp = polyline.properties.get('fiberCount');
        if (fcOp != null && fcOp !== '') addCableOp.data.fiberCount = parseInt(fcOp, 10);
        var fpOp = polyline.properties.get('fiberPalette');
        if (Array.isArray(fpOp) && fpOp.length) addCableOp.data.fiberPalette = fpOp;
    }
    if (points.length > 2) {
        var ridAdd = [];
        for (var piAdd = 0; piAdd < points.length; piAdd++) {
            var uAdd = points[piAdd] && points[piAdd].properties && points[piAdd].properties.get('uniqueId');
            if (!uAdd) {
                ridAdd = null;
                break;
            }
            ridAdd.push(uAdd);
        }
        if (ridAdd && ridAdd.length === points.length) addCableOp.data.routeUniqueIds = ridAdd;
    }
    if (isCopperCableType(cableType)) {
        var cfs = polyline.properties.get('copperSwitchFromId');
        var cts = polyline.properties.get('copperSwitchToId');
        var cpfS = polyline.properties.get('copperPortFrom');
        var cptS = polyline.properties.get('copperPortTo');
        if (cfs) addCableOp.data.copperSwitchFromId = cfs;
        if (cts) addCableOp.data.copperSwitchToId = cts;
        if (cpfS != null && cpfS !== '') addCableOp.data.copperPortFrom = cpfS;
        if (cptS != null && cptS !== '') addCableOp.data.copperPortTo = cptS;
    }
    return addCableOp;
}

function markFiberAsUsed(obj, cableId, fiberNumber) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (!usedFibersData) {
        usedFibersData = {};
    }
    
    if (!usedFibersData[cableId]) {
        usedFibersData[cableId] = [];
    }
    
    if (!usedFibersData[cableId].includes(fiberNumber)) {
        usedFibersData[cableId].push(fiberNumber);
    }
    
    obj.properties.set('usedFibers', usedFibersData);
    saveData();
}

function getFiberRoutingTargetLabel(targetType, targetObj) {
    var n = targetObj && targetObj.properties && targetObj.properties.get('name');
    if (n) return n;
    if (targetType === 'onu') return 'ONU';
    if (targetType === 'mediaConverter') return 'Медиаконвертер';
    return 'Сплиттер';
}

function getFiberRoutingPreviewStroke(targetType) {
    if (targetType === 'onu') return '#22c55e';
    if (targetType === 'mediaConverter') return '#14b8a6';
    return '#3b82f6';
}

/**
 * Проверяет, занята ли жила (cableId + fiberNumber) где-либо: порт OLT, подключение к узлу/ONU/медиаконвертеру,
 * вход/выход сплиттера. exclude — контекст текущего назначения (чтобы не считать «занятой» ту же жилу при замене).
 * atCrossId/atSleeveId — проверять использование только в этом кроссе/муфте (жила имеет два конца,
 * подключение на одном конце не блокирует использование другого).
 * @param {string} cableId
 * @param {number} fiberNumber
 * @param {{ type?: string, oltId?: string, portNumber?: number, splitterId?: string, outputIndex?: number, crossId?: string, sleeveId?: string, atCrossId?: string, atSleeveId?: string }} exclude
 * @returns {{ used: boolean, where?: string }}
 */
function getFiberUsage(cableId, fiberNumber, exclude) {
    if (!objects) return { used: false };
    const key = cableId + '-' + fiberNumber;
    const atCrossId = exclude && exclude.atCrossId;
    const atSleeveId = exclude && exclude.atSleeveId;
    const onlyAtLocation = atCrossId || atSleeveId;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj.properties) continue;
        const t = obj.properties.get('type');
        const uid = obj.properties.get('uniqueId');

        if (t === 'cross' || t === 'sleeve') {
            if (onlyAtLocation) {
                var matchLoc = (atCrossId && uid === atCrossId) || (atSleeveId && uid === atSleeveId);
                if (!matchLoc) continue;
            }
            const fiberConnections = obj.properties.get('fiberConnections') || [];
            const isConnected = fiberConnections.some(conn =>
                (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
            );
            if (isConnected) {
                if (exclude && exclude.type === 'fiberConnection' && (exclude.crossId === uid || exclude.sleeveId === uid)) continue;
                if (exclude && exclude.type === 'oltPort') continue;
                return { used: true, where: 'соединение жил в ' + (t === 'cross' ? 'кроссе' : 'муфте') };
            }
            
            const nodeConn = obj.properties.get('nodeConnections');
            if (nodeConn && nodeConn[key]) {
                if (exclude && exclude.type === 'nodeConn' && (exclude.crossId === uid || exclude.sleeveId === uid)) continue;
                return { used: true, where: 'подключение к узлу' };
            }
            const oltConn = obj.properties.get('oltConnections') || {};
            if (oltConn[key]) {
                if (exclude && exclude.type === 'splitterInput') continue;
                return { used: true, where: 'порт OLT' };
            }
            const onuConn = obj.properties.get('onuConnections') || {};
            if (onuConn[key]) {
                if (exclude && exclude.type === 'onuConn' && exclude.sleeveId === uid) continue;
                return { used: true, where: 'подключение к ONU' };
            }
            const mcConn = obj.properties.get('mediaConverterConnections') || {};
            if (mcConn[key]) {
                if (exclude && exclude.type === 'mediaConverterConn' && ((exclude.sleeveId && exclude.sleeveId === uid) || (exclude.crossId && exclude.crossId === uid))) continue;
                return { used: true, where: 'подключение к медиаконвертеру' };
            }
            const splitterConn = obj.properties.get('splitterConnections') || {};
            if (splitterConn[key]) {
                if (exclude && exclude.type === 'splitterInput' && exclude.sleeveId === uid) continue;
                return { used: true, where: 'вход сплиттера' };
            }
        }
        if (t === 'olt') {
            const incomingFiber = obj.properties.get('incomingFiber');
            if (incomingFiber && incomingFiber.cableId === cableId && incomingFiber.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'oltIncoming' && exclude.oltId === uid) continue;
                return { used: true, where: 'приход OLT' };
            }
            const portAssignments = obj.properties.get('portAssignments') || {};
            for (const portKey in portAssignments) {
                const a = portAssignments[portKey];
                if (a && a.cableId === cableId && a.fiberNumber === fiberNumber) {
                    if (exclude && exclude.type === 'oltPort' && exclude.oltId === uid && exclude.portNumber === parseInt(portKey, 10)) continue;
                    if (exclude && exclude.type === 'splitterInput') continue;
                    return { used: true, where: 'порт OLT' };
                }
            }
        }
        if (t === 'onu') {
            const onuIncoming = obj.properties.get('incomingFiber');
            if (onuIncoming && onuIncoming.cableId === cableId && onuIncoming.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'onuConn' && exclude.onuId === uid) continue;
                return { used: true, where: 'подключение к ONU' };
            }
        }
        if (t === 'mediaConverter') {
            const mcIncoming = obj.properties.get('incomingFiber');
            if (mcIncoming && mcIncoming.cableId === cableId && mcIncoming.fiberNumber === fiberNumber) {
                if (exclude && exclude.type === 'mediaConverterConn' && exclude.mediaConverterId === uid) continue;
                return { used: true, where: 'подключение к медиаконвертеру' };
            }
        }
        if (t === 'splitter') {
            const inputFiber = obj.properties.get('inputFiber');
            if (inputFiber && inputFiber.cableId === cableId && inputFiber.fiberNumber === fiberNumber) {
                if (exclude && (exclude.type === 'splitterInput' && exclude.splitterId === uid)) continue;
                if (exclude && exclude.type === 'oltPort') continue;
                return { used: true, where: 'вход сплиттера' };
            }
            const outputConnections = obj.properties.get('outputConnections') || [];
            for (let oi = 0; oi < outputConnections.length; oi++) {
                const out = outputConnections[oi];
                if (out && out.cableId === cableId && out.fiberNumber === fiberNumber) {
                    if (exclude && exclude.type === 'splitterOutput' && exclude.splitterId === uid && exclude.outputIndex === oi) continue;
                    return { used: true, where: 'выход сплиттера' };
                }
            }
        }
    }
    return { used: false };
}

function isFiberUsed(cableId, fiberNumber, exclude) {
    return getFiberUsage(cableId, fiberNumber, exclude).used;
}

function validateAndFixCableGeometryOnLoad() {
    if (!objects || !objects.length) return;
    var cables = objects.filter(function(o) {
        return o.properties && o.properties.get('type') === 'cable' && o.geometry;
    });
    cables.forEach(function(cable) {
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        var points = cable.properties.get('points');
        var coords = [];
        if (Array.isArray(points) && points.length >= 2) {
            coords = points
                .map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; })
                .filter(function(c) { return c && Array.isArray(c) && c.length >= 2; });
        }
        if (coords.length < 2 && fromObj && toObj && fromObj.geometry && toObj.geometry) {
            try {
                var fc = fromObj.geometry.getCoordinates();
                var tc = toObj.geometry.getCoordinates();
                if (fc && tc) coords = [fc, tc];
            } catch (e) {}
        }
        if (coords.length >= 2) {
            try {
                cable.geometry.setCoordinates(coords);
            } catch (e) {}
        }
    });
}

function updateConnectedCables(obj) {
    const cables = objects.filter(cable => {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === obj || to === obj) return true;
        var points = cable.properties.get('points');
        return Array.isArray(points) && points.indexOf(obj) !== -1;
    });
    
    cables.forEach(cable => {
        if (!cable.geometry) return;
        var points = cable.properties.get('points');
        if (Array.isArray(points) && points.length > 2) {
            try {
                var coords = points
                    .map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; })
                    .filter(function(c) { return c && Array.isArray(c) && c.length >= 2; });
                if (coords.length >= 2) cable.geometry.setCoordinates(coords);
            } catch (e) {}
        } else {
            var fromObj = cable.properties.get('from');
            var toObj = cable.properties.get('to');
            if (!fromObj || !toObj || !fromObj.geometry || !toObj.geometry) return;
            try {
                var fromCoords = fromObj.geometry.getCoordinates();
                var toCoords = toObj.geometry.getCoordinates();
                if (fromCoords && toCoords) cable.geometry.setCoordinates([fromCoords, toCoords]);
            } catch (e) {}
        }
    });
}

function getCableColor(type) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getCableMapColor(type);
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var meta = window.MapLegendConfig.getCableMeta(type);
        if (meta) return meta.color;
    }
    return '#64748b';
}

function getCableWidth(type) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getCableMapWidth(type);
    return 2;
}

function getCableDescription(type, cable) {
    if (cable && cable.properties && window.FiberCableConfig) {
        return window.FiberCableConfig.getCableLabel(cable);
    }
    if (window.FiberCableConfig && window.FiberCableConfig.isOpticalCableType(type)) {
        return window.FiberCableConfig.getCableLabel(type);
    }
    if (window.MapLegendConfig && window.MapLegendConfig.getCableMeta) {
        var metaD = window.MapLegendConfig.getCableMeta(type);
        if (metaD) return metaD.label;
    }
    if (type === 'copper') return 'Медный кабель';
    return 'Кабель';
}

function isCopperCableType(cableType) {
    return cableType === 'copper';
}

function isOpticalCableType(cableType) {
    return window.FiberCableConfig
        ? window.FiberCableConfig.isOpticalCableType(cableType)
        : (cableType && cableType !== 'copper');
}

function buildSwitchPortTypesArray(count, defaultKind) {
    var arr = [];
    var k = defaultKind || 'RJ45 10/100/1000';
    for (var i = 0; i < count; i++) arr.push(k);
    return arr;
}

function getNodeAttachedSwitches(node) {
    if (!node || !node.properties || node.properties.get('type') !== 'node') return [];
    var a = node.properties.get('attachedSwitches');
    return Array.isArray(a) ? a : [];
}

function getAttachedSwitchPortStats(swRow) {
    var pts = (swRow && swRow.switchPortTypes) ? swRow.switchPortTypes : [];
    var usageN = (swRow && swRow.copperPortUsage) ? swRow.copperPortUsage : {};
    var fiberUsageN = (swRow && swRow.fiberPortUsage) ? swRow.fiberPortUsage : {};
    var total = pts.length;
    var busy = 0;
    for (var i = 1; i <= total; i++) {
        if (usageN[String(i)] || fiberUsageN[String(i)]) busy++;
    }
    return { total: total, busy: busy, free: Math.max(0, total - busy) };
}

function getNodeSwitchesSummary(node) {
    var list = getNodeAttachedSwitches(node);
    var totalPorts = 0;
    var busyPorts = 0;
    list.forEach(function(sw) {
        var s = getAttachedSwitchPortStats(sw);
        totalPorts += s.total;
        busyPorts += s.busy;
    });
    return { swCount: list.length, totalPorts: totalPorts, busyPorts: busyPorts };
}

function buildNodeCardContent(obj, isEditMode, name) {
    var html = '';
    var nodeKind = obj.properties.get('nodeKind') || 'network';
    var comment = obj.properties.get('comment') || '';
    var nodeKindLabel = nodeKind === 'aggregation' ? 'Узел агрегации' : 'Узел сети';
    var attachedList = getNodeAttachedSwitches(obj);
    var swSummary = getNodeSwitchesSummary(obj);
    var kindOptsNodeSw = ['RJ45 10/100/1000', 'RJ45 PoE', 'SFP', 'SFP+', 'Комбо RJ45/SFP', 'Консоль', 'Uplink/stack'];
    var nodeUniqueId = getObjectUniqueId(obj);
    var connectedFibers = getNodeConnectedFibers(nodeUniqueId);
    var kindMod = nodeKind === 'aggregation' ? 'node-card--aggregation' : 'node-card--network';

    html += '<div class="node-card ' + kindMod + '">';

    html += '<section class="object-card-section node-card-hero">';
    html += '<div class="node-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="node-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('node', { variant: 'normal', nodeKind: nodeKind }) + '</div>';
    }
    html += '<div class="node-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="node-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        html += '<div class="node-card-view-meta"><span class="node-kind-pill node-kind-pill--' + (nodeKind === 'aggregation' ? 'aggregation' : 'network') + '">' + escapeHtml(nodeKindLabel) + '</span></div>';
        if (comment) {
            html += '<div class="node-card-comment">' + escapeHtml(comment) + '</div>';
        }
    } else {
        html += '<div class="node-card-view-name">' + escapeHtml(name || 'Новый узел') + '</div>';
        html += '<p class="object-card-hint node-card-hero-hint">Коммутаторы внутри узла, оптика с кросса на порты <strong>SFP</strong>, медь — на RJ45.</p>';
    }
    html += '</div></div>';
    html += '<dl class="node-card-stats">';
    html += '<div class="node-card-stat"><dt>Жил с кросса</dt><dd>' + connectedFibers.length + '</dd></div>';
    html += '<div class="node-card-stat"><dt>Коммутаторов</dt><dd>' + attachedList.length + '</dd></div>';
    html += '<div class="node-card-stat node-card-stat--wide"><dt>Порты занято</dt><dd>' + (swSummary.swCount > 0 ? (swSummary.busyPorts + ' / ' + swSummary.totalPorts) : '—') + '</dd></div>';
    html += '</dl></section>';

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Параметры узла</h4>';
        html += '<div class="node-card-fields-grid">';
        html += '<div class="form-group"><label for="editNodeName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editNodeName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название узла">';
        html += '</div>';
        html += '<div class="form-group"><label for="editNodeKind" class="object-card-label">Тип на карте</label>';
        html += '<select id="editNodeKind" class="form-select">';
        html += '<option value="network"' + (nodeKind === 'network' ? ' selected' : '') + '>Сеть (зелёный)</option>';
        html += '<option value="aggregation"' + (nodeKind === 'aggregation' ? ' selected' : '') + '>Агрегация (красный)</option>';
        html += '</select></div></div>';
        html += '<div class="form-group" style="margin-top:12px;margin-bottom:0;"><label for="editNodeComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editNodeComment" class="form-input" rows="2" placeholder="Необязательно">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--fibers">';
    html += '<h4 class="object-card-section-title">Оптика <span class="object-card-badge">' + connectedFibers.length + '</span></h4>';
    if (connectedFibers.length > 0) {
        html += '<div class="node-fiber-list">';
        connectedFibers.forEach(function(conn) {
            html += '<div class="node-fiber-item">';
            html += '<div class="node-fiber-item-main">';
            html += '<span class="node-fiber-num">Жила ' + conn.fiberNumber + '</span>';
            html += '<span class="node-fiber-cross">' + escapeHtml(conn.crossName) + '</span>';
            if (conn.fiberLabel) {
                html += '<span class="node-fiber-label">' + escapeHtml(conn.fiberLabel) + '</span>';
            }
            html += '</div>';
            html += '<button type="button" class="btn-trace-from-node btn-node-trace" data-cross-id="' + escapeHtml(conn.crossUniqueId) + '" data-cable-id="' + escapeHtml(conn.cableId) + '" data-fiber-number="' + conn.fiberNumber + '">Трассировка</button>';
            html += '</div>';
        });
        html += '</div>';
    } else {
        html += '<div class="object-card-callout object-card-callout--warn"><p>Жил с кросса нет — подключите через оптический кросс (порты SFP коммутатора в узле).</p></div>';
    }
    html += '</section>';

    html += '<section class="object-card-section object-card-section--switches">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Коммутаторы</h4>';
    if (swSummary.swCount > 0) {
        html += '<span class="object-card-badge" title="Занято медных/SFP портов">' + swSummary.busyPorts + '/' + swSummary.totalPorts + ' портов</span>';
    }
    html += '</div>';

    if (isEditMode) {
        var addOpen = attachedList.length === 0 ? ' open' : '';
        html += '<details class="node-card-add-switch"' + addOpen + '>';
        html += '<summary class="node-card-add-switch-summary">Добавить коммутатор</summary>';
        html += '<div class="node-card-add-switch-body">';
        html += '<div class="node-card-fields-grid node-card-fields-grid--add">';
        html += '<div class="form-group"><label for="newNodeSwitchName" class="object-card-label">Подпись</label>';
        html += '<input type="text" id="newNodeSwitchName" class="form-input" placeholder="Необязательно"></div>';
        html += '<div class="form-group"><label for="newNodeSwitchPortCount" class="object-card-label">Портов</label>';
        html += '<input type="number" id="newNodeSwitchPortCount" class="form-input" min="1" max="96" value="24"></div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="switch" data-type="manufacturer" data-value-id="newNodeSwitchManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">Выберите</button><input type="hidden" id="newNodeSwitchManufacturer" value=""><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="switch" data-type="model" data-value-id="newNodeSwitchModel" data-manufacturer-id="newNodeSwitchManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">Выберите</button><input type="hidden" id="newNodeSwitchModel" value=""><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group node-card-add-portkind"><label for="newNodeSwitchPortKind" class="object-card-label">Тип порта по умолчанию</label>';
        html += '<select id="newNodeSwitchPortKind" class="form-select">';
        kindOptsNodeSw.forEach(function(kk) {
            html += '<option value="' + escapeHtml(kk) + '"' + (kk === 'RJ45 10/100/1000' ? ' selected' : '') + '>' + escapeHtml(kk) + '</option>';
        });
        html += '</select></div></div>';
        html += '<p class="object-card-hint">Число портов подставится из справочника при выборе модели.</p>';
        html += '<button type="button" id="btnAddNodeSwitch" class="btn-primary node-card-add-btn">Добавить</button>';
        html += '</div></details>';
    }

    if (attachedList.length === 0) {
        html += '<p class="object-card-hint">Нет коммутаторов — добавьте для медных кабелей и выбора порта при прокладке.</p>';
    }

    attachedList.forEach(function(swRow, six) {
        var usageN = swRow.copperPortUsage || {};
        var pts = swRow.switchPortTypes || [];
        var swMfr = (swRow.manufacturer || '').trim();
        var swMod = (swRow.model || '').trim();
        var uidEsc = escapeHtml(swRow.uniqueId);
        var portStats = getAttachedSwitchPortStats(swRow);
        var swTitle = swRow.name || ('Коммутатор ' + (six + 1));
        var deviceLine = [swMfr, swMod].filter(Boolean).join(' · ');
        var swOpen = attachedList.length === 1 || portStats.total <= 8 ? ' open' : '';
        html += '<details class="node-card-switch-item"' + swOpen + '>';
        html += '<summary class="node-card-switch-summary">';
        html += '<span class="node-card-switch-title">' + escapeHtml(swTitle) + '</span>';
        if (deviceLine) {
            html += '<span class="node-card-switch-device">' + escapeHtml(deviceLine) + '</span>';
        }
        html += '<span class="object-card-badge object-card-badge--inline">' + portStats.busy + '/' + portStats.total + '</span>';
        html += '</summary>';
        html += '<div class="node-card-switch-body">';
        if (isEditMode) {
            html += '<div class="node-card-switch-toolbar">';
            html += '<div class="form-group node-card-switch-label-field"><label class="object-card-label">Подпись</label>';
            html += '<input type="text" class="form-input edit-node-switch-name" data-switch-id="' + uidEsc + '" value="' + escapeHtml(swRow.name || '') + '" placeholder="Коммутатор ' + (six + 1) + '">';
            html += '</div>';
            html += '<div class="node-card-switch-delete-wrap"><button type="button" class="btn-remove-node-switch btn-danger" data-switch-id="' + uidEsc + '">Удалить</button></div>';
            html += '</div>';
            html += '<div class="node-card-fields-grid">';
            html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
            html += '<div class="device-combobox" data-catalog="switch" data-type="manufacturer" data-value-id="editNodeSwMfr_' + uidEsc + '"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (swMfr ? escapeHtml(swMfr) : 'Выберите') + '</button><input type="hidden" id="editNodeSwMfr_' + uidEsc + '" value="' + escapeHtml(swMfr) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group"><label class="object-card-label">Модель</label>';
            html += '<div class="device-combobox" data-catalog="switch" data-type="model" data-value-id="editNodeSwMod_' + uidEsc + '" data-manufacturer-id="editNodeSwMfr_' + uidEsc + '"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (swMod ? escapeHtml(swMod) : 'Выберите') + '</button><input type="hidden" id="editNodeSwMod_' + uidEsc + '" value="' + escapeHtml(swMod) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '</div>';
        } else if (deviceLine) {
            html += '<div class="node-card-switch-device-view">' + escapeHtml(deviceLine) + '</div>';
        }
        html += '<div class="node-ports-table-wrap"><table class="node-ports-table"><thead><tr><th>#</th><th>Тип</th><th>Назначение</th>';
        if (isEditMode) html += '<th class="node-ports-table-actions"></th>';
        html += '</tr></thead><tbody>';
        for (var swi = 0; swi < pts.length; swi++) {
            var pnumSw = swi + 1;
            var fiberUsageN = swRow.fiberPortUsage || {};
            var cableUidSw = usageN[String(pnumSw)];
            var fiberKeySw = fiberUsageN[String(pnumSw)];
            var cblSw = cableUidSw ? objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableUidSw; }) : null;
            var cnameSw = cblSw ? (cblSw.properties.get('cableName') || getCableDescription(cblSw.properties.get('cableType'))) : '';
            var isSfpPortRow = isSwitchPortSfpFiberType(pts[swi] || '');
            var assignParts = [];
            if (cnameSw) assignParts.push('Медь: ' + cnameSw);
            if (fiberKeySw) assignParts.push('ВОЛС');
            var displayAssign = assignParts.length ? assignParts.join(' · ') : '—';
            var rowBusy = !!(cableUidSw || fiberKeySw);
            html += '<tr class="' + (rowBusy ? 'node-port-row--busy' : 'node-port-row--free') + '">';
            html += '<td>' + pnumSw + '</td><td>';
            if (isEditMode) {
                html += '<select class="edit-node-switch-port-kind form-select form-select-compact" data-switch-id="' + escapeHtml(swRow.uniqueId) + '" data-idx="' + swi + '">';
                kindOptsNodeSw.forEach(function(ko) {
                    html += '<option value="' + escapeHtml(ko) + '"' + ((pts[swi] || '') === ko ? ' selected' : '') + '>' + escapeHtml(ko) + '</option>';
                });
                html += '</select>';
            } else {
                html += escapeHtml(pts[swi] || '—');
            }
            html += '</td><td class="node-port-assign">' + escapeHtml(displayAssign) + '</td>';
            if (isEditMode) {
                html += '<td class="node-ports-table-actions">';
                if (isSfpPortRow) {
                    if (fiberKeySw) {
                        html += '<span class="node-port-status node-port-status--ok">SFP</span>';
                    } else {
                        html += '<span class="node-port-status node-port-status--muted" title="Жила с кросса">—</span>';
                    }
                } else if (!cableUidSw) {
                    html += '<button type="button" class="btn-secondary btn-copper-connect-from-node-port btn-compact" data-switch-id="' + escapeHtml(swRow.uniqueId) + '" data-copper-port="' + pnumSw + '">Подключить</button>';
                }
                html += '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table></div></div></details>';
    });

    html += '</section>';
    if (isEditMode) {
        html += buildNodeCardActionsHtml();
    }
    html += '</div>';
    return html;
}

function buildNodeCardActionsHtml() {
    var saveSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    var dupSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    return '<div class="node-card-actions object-actions-section">' +
        '<button type="button" id="saveChangesBtn" class="btn-primary node-card-save-btn">' + saveSvg + ' Сохранить</button>' +
        '<button type="button" id="duplicateCurrentObject" class="btn-secondary">' + dupSvg + ' Дублировать</button>' +
        '<button type="button" id="deleteCurrentObject" class="btn-danger">' + delSvg + ' Удалить</button>' +
        '</div>';
}

function findAttachedSwitchOnNode(node, switchId) {
    if (!switchId) return null;
    var arr = getNodeAttachedSwitches(node);
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].uniqueId === switchId) return arr[i];
    }
    return null;
}

/** Порт коммутатора под оптику с кросса: SFP, SFP+, комбо с SFP */
function isSwitchPortSfpFiberType(portTypeLabel) {
    if (!portTypeLabel || typeof portTypeLabel !== 'string') return false;
    var L = portTypeLabel.trim();
    return L === 'SFP' || L === 'SFP+' || L.indexOf('Комбо') === 0;
}

function collectFreeSfpPortOptionsOnNode(nodeObj) {
    var out = [];
    if (!nodeObj || !nodeObj.properties || nodeObj.properties.get('type') !== 'node') return out;
    getNodeAttachedSwitches(nodeObj).forEach(function(sw) {
        if (!sw || !sw.uniqueId) return;
        var types = sw.switchPortTypes || [];
        var fus = sw.fiberPortUsage || {};
        var swLabel = (sw.name || '').trim() || 'Коммутатор';
        for (var pi = 0; pi < types.length; pi++) {
            var portNum = pi + 1;
            if (!isSwitchPortSfpFiberType(types[pi])) continue;
            if (fus[String(portNum)]) continue;
            out.push({
                switchId: sw.uniqueId,
                switchLabel: swLabel,
                port: portNum,
                portTypeLabel: types[pi]
            });
        }
    });
    return out;
}

function markNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum, fiberUsageKey) {
    if (!nodeObj || !switchId || portNum == null) return false;
    var arr = getNodeAttachedSwitches(nodeObj).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return false;
    var sw = Object.assign({}, arr[ix]);
    var fu = Object.assign({}, sw.fiberPortUsage || {});
    fu[String(portNum)] = fiberUsageKey;
    sw.fiberPortUsage = fu;
    arr[ix] = sw;
    nodeObj.properties.set('attachedSwitches', arr);
    return true;
}

function clearNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum) {
    if (!nodeObj || !switchId || portNum == null) return false;
    var arr = getNodeAttachedSwitches(nodeObj).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return false;
    var sw = Object.assign({}, arr[ix]);
    var fu = Object.assign({}, sw.fiberPortUsage || {});
    delete fu[String(portNum)];
    sw.fiberPortUsage = fu;
    arr[ix] = sw;
    nodeObj.properties.set('attachedSwitches', arr);
    return true;
}

function resolveSwitchIdForCopperNodeClick(node) {
    var arr = getNodeAttachedSwitches(node);
    if (arr.length === 0) return null;
    if (arr.length === 1) return arr[0].uniqueId;
    var lines = arr.map(function(s, i) { return (i + 1) + ') ' + (s.name || 'Коммутатор'); });
    var r = typeof window.prompt === 'function' ? window.prompt('Выберите коммутатор (введите номер 1–' + arr.length + '):\n' + lines.join('\n'), '1') : '1';
    var n = parseInt(r, 10);
    if (isNaN(n) || n < 1 || n > arr.length) return null;
    return arr[n - 1].uniqueId;
}

/** Переносит manufacturer/model с узла (устаревшее) в attachedSwitches и очищает поля узла. */
function migrateNodeLevelSwitchMetaToAttached() {
    if (!Array.isArray(objects)) return;
    var changed = false;
    objects.forEach(function(node) {
        if (!node || !node.properties || node.properties.get('type') !== 'node') return;
        var mfr = (node.properties.get('manufacturer') || '').trim();
        var mod = (node.properties.get('model') || '').trim();
        if (!mfr && !mod) return;
        var arr = getNodeAttachedSwitches(node).slice();
        if (arr.length === 0) {
            addAttachedSwitchToNode(node, '', 24, 'RJ45 10/100/1000', mfr, mod);
        } else {
            var sw = Object.assign({}, arr[0]);
            if (mfr && !(sw.manufacturer || '').trim()) sw.manufacturer = mfr;
            if (mod && !(sw.model || '').trim()) sw.model = mod;
            arr[0] = sw;
            node.properties.set('attachedSwitches', arr);
        }
        node.properties.unset('manufacturer');
        node.properties.unset('model');
        changed = true;
    });
    return changed;
}

function migrateStandaloneSwitchesIntoNodes() {
    if (!Array.isArray(objects) || !myMap) return;
    var switches = objects.filter(function(o) { return o && o.properties && o.properties.get('type') === 'switch'; });
    if (switches.length === 0) return;
    switches.forEach(function(sw) {
        var pid = sw.properties.get('parentNodeId');
        var node = objects.find(function(n) {
            return n && n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === pid;
        });
        if (!node) return;
        var swUid = sw.properties.get('uniqueId') || ('sw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6));
        var arr = getNodeAttachedSwitches(node).slice();
        var swEntry = {
            uniqueId: swUid,
            name: sw.properties.get('name') || '',
            switchPortTypes: Array.isArray(sw.properties.get('switchPortTypes')) && sw.properties.get('switchPortTypes').length
                ? sw.properties.get('switchPortTypes').slice()
                : buildSwitchPortTypesArray(24, 'RJ45 10/100/1000'),
            copperPortUsage: Object.assign({}, sw.properties.get('copperPortUsage') || {}),
            fiberPortUsage: Object.assign({}, sw.properties.get('fiberPortUsage') || {})
        };
        var mMig = (sw.properties.get('manufacturer') || '').trim();
        var moMig = (sw.properties.get('model') || '').trim();
        if (mMig) swEntry.manufacturer = mMig;
        if (moMig) swEntry.model = moMig;
        arr.push(swEntry);
        node.properties.set('attachedSwitches', arr);
        objects.forEach(function(c) {
            if (!c || !c.properties || c.properties.get('type') !== 'cable') return;
            if (c.properties.get('from') === sw) {
                c.properties.set('from', node);
                c.properties.set('copperSwitchFromId', swUid);
            }
            if (c.properties.get('to') === sw) {
                c.properties.set('to', node);
                c.properties.set('copperSwitchToId', swUid);
            }
        });
        try { myMap.geoObjects.remove(sw); } catch (eR) {}
        var lbl = sw.properties.get('label');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (eL) {}
        var idx = objects.indexOf(sw);
        if (idx !== -1) objects.splice(idx, 1);
    });
}

function isCopperCableUsingNodeSwitch(cable, nodeUid, switchId) {
    if (!cable || !cable.properties || cable.properties.get('type') !== 'cable') return false;
    if (!isCopperCableType(cable.properties.get('cableType'))) return false;
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    if (from && from.properties && from.properties.get('uniqueId') === nodeUid && cable.properties.get('copperSwitchFromId') === switchId) return true;
    if (to && to.properties && to.properties.get('uniqueId') === nodeUid && cable.properties.get('copperSwitchToId') === switchId) return true;
    return false;
}

function updateAttachedSwitchMeta(node, switchId, field, value) {
    if (!node || !node.properties || node.properties.get('type') !== 'node' || !switchId || !field) return;
    var arr = getNodeAttachedSwitches(node).slice();
    var ix = arr.findIndex(function(s) { return s && s.uniqueId === switchId; });
    if (ix < 0) return;
    var sw = Object.assign({}, arr[ix]);
    sw[field] = value;
    arr[ix] = sw;
    node.properties.set('attachedSwitches', arr);
}

function addAttachedSwitchToNode(node, name, portCount, defaultKind, manufacturer, model) {
    if (!node || !node.properties || node.properties.get('type') !== 'node') return null;
    var arr = getNodeAttachedSwitches(node).slice();
    var uid = 'sw-' + Date.now() + '-' + Math.random().toString(36).substr(2, 8);
    var nPorts = Math.max(1, parseInt(portCount, 10) || 24);
    var dk = defaultKind || 'RJ45 10/100/1000';
    var mfr = (manufacturer || '').trim();
    var mod = (model || '').trim();
    var entry = {
        uniqueId: uid,
        name: (name || '').trim(),
        switchPortTypes: buildSwitchPortTypesArray(nPorts, dk),
        copperPortUsage: {},
        fiberPortUsage: {}
    };
    if (mfr) entry.manufacturer = mfr;
    if (mod) entry.model = mod;
    arr.push(entry);
    node.properties.set('attachedSwitches', arr);
    return uid;
}

function removeAttachedSwitchFromNode(node, switchId) {
    if (!node || !switchId) return false;
    var nodeUid = node.properties.get('uniqueId');
    var used = objects.some(function(c) { return isCopperCableUsingNodeSwitch(c, nodeUid, switchId); });
    if (used) {
        if (typeof showError === 'function') showError('К этому коммутатору подключены медные кабели. Сначала удалите или переназначьте кабели.', 'Нельзя удалить');
        return false;
    }
    var swDel = findAttachedSwitchOnNode(node, switchId);
    if (swDel && swDel.fiberPortUsage && Object.keys(swDel.fiberPortUsage).length) {
        if (typeof showError === 'function') showError('К этому коммутатору с кросса подключены оптические жилы (порты SFP). Сначала отключите их в карточке кросса.', 'Нельзя удалить');
        return false;
    }
    var arr = getNodeAttachedSwitches(node).filter(function(s) { return s.uniqueId !== switchId; });
    node.properties.set('attachedSwitches', arr);
    return true;
}

function isCopperLanEndDeviceType(t) {
    return t === 'camera' || t === 'mediaConverter';
}

function cameraHasCopperCable(camObj) {
    if (!camObj || !camObj.properties || !isCopperLanEndDeviceType(camObj.properties.get('type'))) return false;
    return objects.some(function(c) {
        if (!c || !c.properties || c.properties.get('type') !== 'cable') return false;
        if (!isCopperCableType(c.properties.get('cableType'))) return false;
        return c.properties.get('from') === camObj || c.properties.get('to') === camObj;
    });
}

/** Для карточки камеры: медный аплинк и узел, по которому искать жилы кросса для трассировки. */
function getCameraCopperUpstreamTraceContext(cameraObj) {
    if (!cameraObj || !cameraObj.properties || cameraObj.properties.get('type') !== 'camera') return { kind: 'none' };
    var cable = null;
    for (var ci = 0; ci < objects.length; ci++) {
        var c = objects[ci];
        if (!c || !c.properties || c.properties.get('type') !== 'cable') continue;
        if (!isCopperCableType(c.properties.get('cableType'))) continue;
        if (c.properties.get('from') === cameraObj || c.properties.get('to') === cameraObj) {
            cable = c;
            break;
        }
    }
    if (!cable) return { kind: 'none' };
    var from = cable.properties.get('from');
    var to = cable.properties.get('to');
    var other = from === cameraObj ? to : (to === cameraObj ? from : null);
    if (!other || !other.properties) return { kind: 'none', cable: cable };
    var ot = other.properties.get('type');
    if (ot === 'node') {
        var swId = null;
        if (from === cameraObj && to === other) {
            swId = cable.properties.get('copperSwitchToId');
        } else if (to === cameraObj && from === other) {
            swId = cable.properties.get('copperSwitchFromId');
        }
        return { kind: 'node', nodeObj: other, cable: cable, copperSwitchId: swId || null };
    }
    if (ot === 'switch') {
        var pid = other.properties.get('parentNodeId') || '';
        if (!pid) return { kind: 'switch_no_parent', cable: cable };
        var parentNode = objects.find(function(n) {
            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === pid;
        });
        if (!parentNode) return { kind: 'switch_no_parent', cable: cable };
        return { kind: 'node', nodeObj: parentNode, cable: cable, copperSwitchId: other.properties.get('uniqueId') || null };
    }
    if (ot === 'mediaConverter') {
        var inc = other.properties.get('incomingFiber');
        return { kind: 'media_converter', mcObj: other, incomingFiber: inc && inc.cableId ? inc : null, cable: cable };
    }
    return { kind: 'unknown', cable: cable };
}

/** Порт коммутатора на медном кабеле со стороны камеры (RJ45). */
function getCopperSwitchPortForCameraOnCable(cable, cameraObj) {
    if (!cable || !cameraObj || !cable.properties) return null;
    var from = cable.properties.get('from');
    if (from === cameraObj) {
        var pt = cable.properties.get('copperPortTo');
        return pt != null && pt !== '' ? parseInt(pt, 10) : null;
    }
    var pf = cable.properties.get('copperPortFrom');
    return pf != null && pf !== '' ? parseInt(pf, 10) : null;
}

/**
 * Контекст медного «хвоста» камеры для окна трассировки жилы с кросса:
 * коммутатор (объект на карте или в составе узла), медный кабель, камера.
 */
function buildCameraLanTailTraceContext(cameraObj) {
    var ctx = getCameraCopperUpstreamTraceContext(cameraObj);
    if (!cameraObj || !cameraObj.properties || ctx.kind === 'none' || ctx.kind === 'unknown' || ctx.kind === 'switch_no_parent') return null;
    if (ctx.kind === 'media_converter') return null;
    if (ctx.kind !== 'node' || !ctx.nodeObj || !ctx.cable) return null;
    var swId = ctx.copperSwitchId;
    if (!swId) return null;
    var copperPort = getCopperSwitchPortForCameraOnCable(ctx.cable, cameraObj);
    if (copperPort != null && isNaN(copperPort)) copperPort = null;
    var swPlacemark = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'switch' && o.properties.get('uniqueId') === swId;
    });
    var attached = findAttachedSwitchOnNode(ctx.nodeObj, swId);
    var switchName = 'Коммутатор';
    if (swPlacemark) switchName = (swPlacemark.properties.get('name') || '').trim() || switchName;
    else if (attached) switchName = (attached.name || '').trim() || switchName;
    return {
        cameraObj: cameraObj,
        copperCable: ctx.cable,
        nodeObj: ctx.nodeObj,
        switchPlacemark: swPlacemark || null,
        switchName: switchName,
        copperPort: copperPort
    };
}

function cameraTraceMapBtn(obj) {
    if (!obj || !getObjectUniqueId(obj)) return '';
    return '<button type="button" class="trace-show-on-map-btn btn-map-pin" data-object-id="' + escapeHtml(getObjectUniqueId(obj)) + '" title="Показать на карте">На карте</button>';
}

function buildCameraLanTailTraceSectionHtml(tailCtx, opts) {
    opts = opts || {};
    if (!tailCtx || !tailCtx.cameraObj || !tailCtx.copperCable) return '';
    var cableName = tailCtx.copperCable.properties.get('cableName') || getCableDescription(tailCtx.copperCable.properties.get('cableType'));
    var camName = tailCtx.cameraObj.properties.get('name') || 'Камера';
    var portPart = (tailCtx.copperPort != null && !isNaN(tailCtx.copperPort))
        ? '<span class="trace-path-muted"> · порт ' + tailCtx.copperPort + '</span>'
        : '';
    var swUidForBtn = tailCtx.switchPlacemark ? tailCtx.switchPlacemark : tailCtx.nodeObj;
    var swRow = '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object" aria-hidden="true">🔌</span><div class="trace-path-block trace-path-object"><div><span class="trace-path-label">' + escapeHtml(tailCtx.switchName) + '</span><span class="trace-path-muted">коммутатор</span>' + portPart + '</div>' + cameraTraceMapBtn(swUidForBtn) + '</div></div>';
    var cableRow = '<div class="trace-step-row"><span class="trace-step-num trace-step-num-cable" aria-hidden="true">➡</span><div class="trace-path-block trace-path-cable trace-path-cable--copper"><div><span class="trace-path-label">' + escapeHtml(cableName) + '</span><span class="trace-path-muted">медный кабель</span></div>' + cameraTraceMapBtn(tailCtx.copperCable) + '</div></div>';
    var camRow = '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object" aria-hidden="true">📷</span><div class="trace-path-block trace-path-object"><div><span class="trace-path-label">' + escapeHtml(camName) + '</span><span class="trace-path-muted">камера</span></div>' + cameraTraceMapBtn(tailCtx.cameraObj) + '</div></div>';
    var introP = opts.skipIntro ? '' : '<p class="object-card-hint camera-lan-intro">Медная линия от коммутатора до камеры (не оптическая жила с кросса).</p>';
    return '<div class="camera-lan-trace' + (opts.skipIntro ? ' camera-lan-trace--nested' : '') + '">' +
        '<h4 class="camera-lan-trace-title">Медный участок до камеры</h4>' +
        introP +
        '<div class="camera-lan-trace-steps">' + swRow + cableRow + camRow + '</div></div>';
}

function filterNodeFibersBySwitchIfPossible(nodeUniqueId, preferSwitchId) {
    var list = getNodeConnectedFibers(nodeUniqueId);
    if (!preferSwitchId || list.length === 0) return list;
    var filtered = list.filter(function(conn) {
        var nc = conn.crossObj && conn.crossObj.properties ? conn.crossObj.properties.get('nodeConnections') : null;
        if (!nc) return false;
        var key = conn.cableId + '-' + conn.fiberNumber;
        var row = nc[key];
        return row && row.switchId === preferSwitchId;
    });
    return filtered.length ? filtered : list;
}

function buildCameraTraceSectionHtml(cameraObj) {
    var ctx = getCameraCopperUpstreamTraceContext(cameraObj);
    var html = '<section class="object-card-section object-card-section--trace camera-trace-section">';
    html += '<h4 class="object-card-section-title">Подключение и трассировка</h4>';

    if (ctx.kind === 'none') {
        html += '<div class="object-card-callout object-card-callout--warn">';
        html += '<p>Подключите камеру <strong>медным кабелем</strong> к коммутатору узла, к коммутатору на карте или к медиаконвертеру с оптикой — здесь появятся маршрут и кнопки трассировки.</p>';
        html += '</div></section>';
        return html;
    }
    if (ctx.kind === 'switch_no_parent' || ctx.kind === 'unknown') {
        html += '<div class="object-card-callout object-card-callout--warn">';
        html += '<p>Медный кабель найден, но узел сети для оптических жил не определён. Проверьте привязку коммутатора к узлу.</p>';
        html += '</div></section>';
        return html;
    }
    if (ctx.kind === 'media_converter') {
        html += '<p class="object-card-hint">Камера на <strong>меди</strong> к медиаконвертеру. Оптика — с входной жилы МК (муфта или кросс).</p>';
        if (ctx.incomingFiber && ctx.incomingFiber.cableId != null && ctx.incomingFiber.fiberNumber != null) {
            var cid = escapeHtml(String(ctx.incomingFiber.cableId));
            var fn = parseInt(ctx.incomingFiber.fiberNumber, 10);
            html += '<button type="button" class="btn-primary btn-trace-camera-mc-incoming camera-trace-action" data-cable-id="' + cid + '" data-fiber-number="' + fn + '">Трассировка по жиле МК</button>';
        } else {
            html += '<div class="object-card-callout object-card-callout--warn"><p>Сначала подключите к медиаконвертеру оптическую жилу с муфты или кросса.</p></div>';
        }
        html += '</section>';
        return html;
    }
    if (ctx.kind === 'node' && ctx.nodeObj) {
        var nodeUid = getObjectUniqueId(ctx.nodeObj);
        var nodeTitle = ctx.nodeObj.properties.get('name') || 'Узел сети';
        var fibers = filterNodeFibersBySwitchIfPossible(nodeUid, ctx.copperSwitchId);
        var lanTail = buildCameraLanTailTraceContext(cameraObj);

        if (lanTail) {
            html += '<p class="object-card-hint">Медь к узлу «' + escapeHtml(nodeTitle) + '». Ниже — коммутатор, порт и оптические жилы с кросса (если заведены).</p>';
            html += buildCameraLanTailTraceSectionHtml(lanTail, { skipIntro: false });
        } else {
            html += '<p class="object-card-hint">Оптические жилы с кроссов на узел «' + escapeHtml(nodeTitle) + '».</p>';
        }

        if (fibers.length > 0) {
            if (lanTail) {
                html += '<h5 class="camera-trace-subtitle">Оптика с кроссов</h5>';
            }
            html += '<div class="camera-fiber-list">';
            fibers.forEach(function(conn) {
                html += '<div class="camera-fiber-item">';
                html += '<div class="camera-fiber-item-main">';
                html += '<span class="camera-fiber-num">Жила ' + conn.fiberNumber + '</span>';
                html += '<span class="camera-fiber-cross">' + escapeHtml(conn.crossName) + '</span>';
                if (conn.fiberLabel) {
                    html += '<span class="camera-fiber-label">' + escapeHtml(conn.fiberLabel) + '</span>';
                }
                html += '</div>';
                html += '<button type="button" class="btn-trace-from-node btn-trace-compact" data-cross-id="' + escapeHtml(conn.crossUniqueId) + '" data-cable-id="' + escapeHtml(conn.cableId) + '" data-fiber-number="' + conn.fiberNumber + '">Трассировка</button>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div class="object-card-callout object-card-callout--warn' + (lanTail ? ' object-card-callout--spaced' : '') + '">';
            if (lanTail) {
                html += '<p>Жил с кросса на этот коммутатор нет — трассировка оптики недоступна. Для камеры только по Ethernet маршрут указан выше.</p>';
            } else {
                html += '<p>К узлу не подключены жилы с кросса. При SFP заведите порт в карточке кросса; при чистой меди — укажите коммутатор при прокладке кабеля.</p>';
            }
            html += '</div>';
        }
        html += '</section>';
        return html;
    }
    html += '</section>';
    return html;
}

function buildCameraCardContent(obj, isEditMode, name) {
    var manufacturer = obj.properties.get('manufacturer') || '';
    var model = obj.properties.get('model') || '';
    var comment = obj.properties.get('comment') || '';
    var deviceLine = [manufacturer, model].filter(Boolean).join(' · ');
    var streamCfg = window.CameraPlayer ? CameraPlayer.getCameraStreamConfig(obj) : { streamType: 'none', streamUrl: '' };
    var cameraOnline = window.CameraPlayer ? CameraPlayer.isCameraOnline(obj) : false;
    var html = '<div class="camera-card">';

    html += '<section class="object-card-section camera-card-hero">';
    html += '<div class="camera-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="camera-card-hero-icon" aria-hidden="true">' +
            MapIcons.buildIconSvg('camera', { variant: 'normal', cameraOnline: cameraOnline }) + '</div>';
    }
    html += '<div class="camera-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="camera-card-view-name-row">';
        html += '<div class="camera-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        if (window.CameraPlayer) html += CameraPlayer.buildStatusBadgeHtml(cameraOnline, CameraPlayer.getCameraStatusTitle(obj));
        html += '</div>';
        html += '<div class="camera-card-view-meta">' + escapeHtml(deviceLine || 'Камера видеонаблюдения') + '</div>';
        if (comment) {
            html += '<div class="camera-card-comment">' + escapeHtml(comment) + '</div>';
        }
    } else {
        html += '<div class="camera-card-view-name-row">';
        html += '<div class="camera-card-view-name">' + escapeHtml(name || 'Новая камера') + '</div>';
        if (window.CameraPlayer) html += CameraPlayer.buildStatusBadgeHtml(cameraOnline, CameraPlayer.getCameraStatusTitle(obj));
        html += '</div>';
        html += '<p class="object-card-hint camera-card-hero-hint">На карте подключайте только <strong>медным кабелем</strong> к коммутатору узла, отдельному коммутатору или медиаконвертеру с оптикой.</p>';
    }
    html += '</div></div></section>';

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Устройство</h4>';
        html += '<div class="form-group"><label for="editCameraName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editCameraName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: Камера подъезд 1">';
        html += '</div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="camera" data-type="manufacturer" data-value-id="editCameraManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editCameraManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="camera" data-type="model" data-value-id="editCameraModel" data-manufacturer-id="editCameraManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editCameraModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editCameraComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editCameraComment" class="form-input" rows="2" placeholder="Необязательно">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    }

    if (window.CameraPlayer) {
        html += CameraPlayer.buildStreamSettingsHtml(streamCfg, { idPrefix: 'editCamera', isEditMode: isEditMode, obj: obj });
        html += CameraPlayer.buildSnapshotSectionHtml(obj, { isEditMode: isEditMode });
        if (isEditMode && CameraPlayer.hasActiveStream(streamCfg)) {
            html += '<section class="object-card-section object-card-section--player camera-player-section camera-player-section--preview">';
            html += '<h4 class="object-card-section-title">Предпросмотр</h4>';
            html += '<div class="camera-player-mount" data-camera-player-preview></div>';
            html += '</section>';
        }
        if (!isEditMode) {
            html += CameraPlayer.buildPlayerSectionHtml(streamCfg);
        }
    }

    html += buildCameraTraceSectionHtml(obj);
    html += '</div>';
    return html;
}

function buildOltIncomingFiberLabel(incomingFiber, cables) {
    if (!incomingFiber || !incomingFiber.cableId) return '— не задан';
    var c = cables.find(function(cab) { return (cab.properties.get('uniqueId') || '') === incomingFiber.cableId; });
    var desc = c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) : incomingFiber.cableId;
    return desc + ', жила ' + incomingFiber.fiberNumber;
}

function buildOltPortFiberLabel(ass, cables) {
    if (!ass || ass.cableId == null) return '—';
    var c = cables.find(function(cab) { return (cab.properties.get('uniqueId') || '') === ass.cableId; });
    return c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) + ', ж.' + ass.fiberNumber : ass.cableId + '-' + ass.fiberNumber;
}

function buildOltCardContent(obj, isEditMode, name) {
    var ponPorts = Math.max(1, parseInt(obj.properties.get('ponPorts'), 10) || 8);
    var incomingFiber = obj.properties.get('incomingFiber') || null;
    var portAssignments = obj.properties.get('portAssignments') || {};
    var manufacturer = obj.properties.get('manufacturer') || '';
    var model = obj.properties.get('model') || '';
    var comment = obj.properties.get('comment') || '';
    var deviceLine = [manufacturer, model].filter(Boolean).join(' · ');
    var cables = getConnectedCables(obj);
    var assignedCount = Object.keys(portAssignments).filter(function(k) {
        var a = portAssignments[k];
        return a && a.cableId != null && a.fiberNumber != null;
    }).length;
    var incomingLabel = buildOltIncomingFiberLabel(incomingFiber, cables);

    var fiberOptions = [];
    cables.forEach(function(cable) {
        var cid = cable.properties.get('uniqueId') || ('cable-' + Date.now());
        if (!cable.properties.get('uniqueId')) cable.properties.set('uniqueId', cid);
        var cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
        var n = getFiberCount(cable);
        for (var f = 1; f <= n; f++) {
            fiberOptions.push({ cableId: cid, fiberNumber: f, label: cableName + ', жила ' + f, value: cid + '-' + f });
        }
    });

    var html = '<div class="olt-card">';

    html += '<section class="object-card-section olt-card-hero">';
    html += '<div class="olt-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="olt-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg('olt', { variant: 'normal' }) + '</div>';
    }
    html += '<div class="olt-card-hero-text">';
    if (!isEditMode) {
        html += '<div class="olt-card-view-name">' + escapeHtml(name || 'Без названия') + '</div>';
        html += '<div class="olt-card-view-meta">' + escapeHtml(deviceLine || 'OLT · GPON') + '</div>';
        if (comment) {
            html += '<div class="olt-card-comment">' + escapeHtml(comment) + '</div>';
        }
    } else {
        html += '<div class="olt-card-view-name">' + escapeHtml(name || 'Новый OLT') + '</div>';
        html += '<p class="object-card-hint olt-card-hero-hint">Приход от кросса или муфты задаётся кнопкой <strong>«OLT»</strong> у жилы. PON-порты — жилами подключённых кабелей.</p>';
    }
    html += '</div></div>';
    html += '<dl class="olt-card-stats">';
    html += '<div class="olt-card-stat"><dt>PON-портов</dt><dd>' + ponPorts + '</dd></div>';
    html += '<div class="olt-card-stat"><dt>Назначено</dt><dd>' + assignedCount + ' / ' + ponPorts + '</dd></div>';
    html += '<div class="olt-card-stat olt-card-stat--wide"><dt>Приход</dt><dd>' + escapeHtml(incomingLabel) + '</dd></div>';
    html += '</dl></section>';

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Устройство</h4>';
        html += '<div class="form-group"><label for="editOltName" class="object-card-label">Название</label>';
        html += '<input type="text" id="editOltName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Например: OLT Центральная">';
        html += '</div>';
        html += '<div class="form-group"><label class="object-card-label">Производитель</label>';
        html += '<div class="device-combobox" data-catalog="olt" data-type="manufacturer" data-value-id="editOltManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editOltManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group"><label class="object-card-label">Модель</label>';
        html += '<div class="device-combobox" data-catalog="olt" data-type="model" data-value-id="editOltModel" data-manufacturer-id="editOltManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editOltModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
        html += '<div class="form-group" style="margin-bottom:0;"><label for="editOltComment" class="object-card-label">Комментарий</label>';
        html += '<textarea id="editOltComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(comment) + '</textarea></div>';
        html += '</section>';
    } else if (manufacturer || model || comment) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">Устройство</h4>';
        if (manufacturer || model) {
            html += '<p class="olt-card-device-line">' + escapeHtml(deviceLine || '—') + '</p>';
        }
        if (comment) {
            html += '<p class="olt-card-device-comment">' + escapeHtml(comment) + '</p>';
        }
        html += '</section>';
    }

    html += '<section class="object-card-section object-card-section--gpon">';
    html += '<h4 class="object-card-section-title">GPON</h4>';
    html += '<p class="object-card-hint olt-card-gpon-hint">Приход от кросса задаётся с кросса или муфты (кнопка «OLT» у жилы). Порты задаются жилами подключённых кабелей.</p>';
    html += '<div class="olt-card-incoming"><span class="olt-card-incoming-label">Приход от кросса</span><span class="olt-card-incoming-value">' + escapeHtml(incomingLabel) + '</span></div>';
    html += '<h5 class="olt-card-ports-title">PON-порты</h5>';
    if (!fiberOptions.length && isEditMode) {
        html += '<div class="object-card-callout object-card-callout--warn"><p>Подключите кабели к OLT, чтобы назначить жилы на PON-порты.</p></div>';
    }
    html += '<div class="olt-ports-table-wrap"><table class="olt-ports-table"><thead><tr><th scope="col">Порт</th><th scope="col">Жила</th><th scope="col" class="olt-ports-table-actions-col"></th></tr></thead><tbody>';
    for (var p = 1; p <= ponPorts; p++) {
        var ass = portAssignments[String(p)] || null;
        var assVal = ass ? (ass.cableId + '-' + ass.fiberNumber) : '';
        var assLabel = buildOltPortFiberLabel(ass, cables);
        html += '<tr data-port="' + p + '">';
        html += '<td class="olt-ports-table-port">' + p + '</td>';
        if (isEditMode && fiberOptions.length) {
            html += '<td><select class="olt-port-assign form-input" data-port="' + p + '">';
            html += '<option value="">—</option>';
            fiberOptions.forEach(function(opt) {
                var taken = Object.keys(portAssignments).some(function(k) {
                    if (k === String(p)) return false;
                    var a = portAssignments[k];
                    return a && a.cableId != null && a.fiberNumber != null && (a.cableId + '-' + a.fiberNumber) === opt.value;
                });
                html += '<option value="' + escapeHtml(opt.value) + '"' + (opt.value === assVal ? ' selected' : '') + (taken ? ' disabled' : '') + '>' + escapeHtml(opt.label) + (taken ? ' (занято)' : '') + '</option>';
            });
            html += '</select></td>';
        } else {
            html += '<td class="olt-ports-table-fiber">' + escapeHtml(assLabel) + '</td>';
        }
        html += '<td class="olt-ports-table-actions"><button type="button" class="btn-trace-olt-port btn-olt-trace" data-port="' + p + '"' + (ass ? '' : ' disabled') + '>Трассировка</button></td>';
        html += '</tr>';
    }
    html += '</tbody></table></div></section>';

    html += '</div>';
    return html;
}

function validateCopperCableRoute(points, skipSync, copperMeta) {
    copperMeta = copperMeta || {};
    if (!points || points.length < 2) return false;
    if (skipSync) {
        return true;
    }
    var mid = ['support', 'attachment'];
    for (var mi = 0; mi < points.length; mi++) {
        var ptMid = points[mi].properties.get('type');
        if (mi > 0 && mi < points.length - 1) {
            if (mid.indexOf(ptMid) === -1) {
                if (!skipSync) showError('Медный кабель: промежуточные точки — только опоры связи и крепления узлов.', 'Недопустимое действие');
                return false;
            }
        }
    }
    var p0 = points[0];
    var pL = points[points.length - 1];
    var t0 = p0.properties.get('type');
    var tL = pL.properties.get('type');
    var cam0 = isCopperLanEndDeviceType(t0);
    var camL = isCopperLanEndDeviceType(tL);
    if (cam0 && camL) {
        var mcCamPair = (t0 === 'mediaConverter' && tL === 'camera') || (t0 === 'camera' && tL === 'mediaConverter');
        if (mcCamPair) {
            var mcPm = t0 === 'mediaConverter' ? p0 : pL;
            var camPm = t0 === 'camera' ? p0 : pL;
            var incMc = mcPm.properties.get('incomingFiber');
            if (!incMc || !incMc.cableId) {
                if (!skipSync) showError('Медный кабель к камере от медиаконвертера возможен только после подключения оптической жилы с муфты или кросса.', 'Недопустимое действие');
                return false;
            }
            if (cameraHasCopperCable(mcPm) || cameraHasCopperCable(camPm)) {
                if (!skipSync) showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return false;
            }
            return true;
        }
        if (!skipSync) showError('Нельзя соединить два конечных устройства (камера или медиаконвертер) одним медным кабелем.', 'Недопустимое действие');
        return false;
    }
    if (cam0 || camL) {
        var camPm = cam0 ? p0 : pL;
        var otherPm = cam0 ? pL : p0;
        var ot = otherPm.properties.get('type');
        if (ot !== 'node' && ot !== 'switch') {
            if (!skipSync) showError('Камеру или медиаконвертер можно подключить только медным кабелем от коммутатора (узел сети или отдельный коммутатор на карте).', 'Недопустимое действие');
            return false;
        }
        var sidNeed = cam0 ? copperMeta.copperSwitchToId : copperMeta.copperSwitchFromId;
        if (ot === 'node') {
            if (!sidNeed || !findAttachedSwitchOnNode(otherPm, sidNeed)) {
                if (!skipSync) showError('Для линии к камере или медиаконвертеру выберите коммутатор в узле сети.', 'Недопустимое действие');
                return false;
            }
        }
        if (cameraHasCopperCable(camPm)) {
            if (!skipSync) showError('К этому устройству уже подключён медный кабель.', 'Подключение');
            return false;
        }
        return true;
    }
    function endOk(obj, isFirst) {
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        if (t === 'switch') return true;
        if (t === 'mediaConverter') {
            var incMc = obj.properties.get('incomingFiber');
            return !!(incMc && incMc.cableId);
        }
        if (t === 'node') {
            var sid = isFirst ? copperMeta.copperSwitchFromId : copperMeta.copperSwitchToId;
            return !!sid && !!findAttachedSwitchOnNode(obj, sid);
        }
        return false;
    }
    if (!endOk(points[0], true)) {
        if (!skipSync) showError('Медный кабель: начало маршрута — узел сети с коммутатором, отдельный коммутатор на карте или медиаконвертер с подключённой оптической жилой.', 'Недопустимое действие');
        return false;
    }
    if (!endOk(points[points.length - 1], false)) {
        if (!skipSync) showError('Медный кабель: конец маршрута — узел сети с коммутатором, отдельный коммутатор на карте или медиаконвертер с подключённой оптической жилой.', 'Недопустимое действие');
        return false;
    }
    if (t0 === 'switch' && tL === 'switch') {
        var n1 = p0.properties.get('parentNodeId') || '';
        var n2 = pL.properties.get('parentNodeId') || '';
        if (!n1 || n1 !== n2) {
            if (!skipSync) showError('Два коммутатора на концах медного кабеля должны быть привязаны к одному и тому же узлу сети.', 'Недопустимое действие');
            return false;
        }
    }
    if (t0 === 'node' && tL === 'node' && getObjectUniqueId(p0) === getObjectUniqueId(pL)) {
        var sf = copperMeta.copperSwitchFromId;
        var st = copperMeta.copperSwitchToId;
        if (!sf || !st || sf === st) {
            if (!skipSync) showError('Для медного кабеля между двумя коммутаторами одного узла выберите два разных коммутатора.', 'Недопустимое действие');
            return false;
        }
    }
    return true;
}

function clearCopperCableOccupancyForCableId(cableUniqueId) {
    objects.forEach(function(o) {
        if (!o.properties) return;
        var t = o.properties.get('type');
        if (t === 'cross' || t === 'switch') {
            var usage = o.properties.get('copperPortUsage') || {};
            var changed = false;
            Object.keys(usage).forEach(function(k) {
                if (usage[k] === cableUniqueId) {
                    delete usage[k];
                    changed = true;
                }
            });
            if (changed) o.properties.set('copperPortUsage', usage);
        } else if (t === 'node') {
            var arr = getNodeAttachedSwitches(o);
            var ch = false;
            var narr = arr.map(function(sw) {
                var u = sw.copperPortUsage || {};
                var u2 = Object.assign({}, u);
                Object.keys(u2).forEach(function(k) {
                    if (u2[k] === cableUniqueId) {
                        delete u2[k];
                        ch = true;
                    }
                });
                return Object.assign({}, sw, { copperPortUsage: u2 });
            });
            if (ch) o.properties.set('attachedSwitches', narr);
        }
    });
}

function applyCopperCableOccupancyFromCable(cable) {
    var uid = cable.properties.get('uniqueId');
    if (!uid) return;
    clearCopperCableOccupancyForCableId(uid);
    var fromObj = cable.properties.get('from');
    var toObj = cable.properties.get('to');
    var pf = cable.properties.get('copperPortFrom');
    var pt = cable.properties.get('copperPortTo');
    var sf = cable.properties.get('copperSwitchFromId');
    var st = cable.properties.get('copperSwitchToId');
    function mark(obj, portNum, switchId) {
        if (portNum == null || portNum === '') return;
        var pn = parseInt(portNum, 10);
        if (isNaN(pn) || pn < 1) return;
        if (!obj || !obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cross') {
            var usageC = obj.properties.get('copperPortUsage') || {};
            usageC[String(pn)] = uid;
            obj.properties.set('copperPortUsage', usageC);
        } else if (t === 'switch') {
            var usageS = obj.properties.get('copperPortUsage') || {};
            usageS[String(pn)] = uid;
            obj.properties.set('copperPortUsage', usageS);
        } else if (t === 'node' && switchId) {
            var arr = getNodeAttachedSwitches(obj).slice();
            var ix = arr.findIndex(function(s) { return s.uniqueId === switchId; });
            if (ix < 0) return;
            var sw = Object.assign({}, arr[ix]);
            var uu = Object.assign({}, sw.copperPortUsage || {});
            uu[String(pn)] = uid;
            sw.copperPortUsage = uu;
            arr[ix] = sw;
            obj.properties.set('attachedSwitches', arr);
        }
    }
    mark(fromObj, pf, sf);
    mark(toObj, pt, st);
}

function rebuildAllCopperPortUsageFromCables() {
    objects.forEach(function(o) {
        if (!o.properties) return;
        var t = o.properties.get('type');
        if (t === 'cross' || t === 'switch') o.properties.set('copperPortUsage', {});
        if (t === 'node') {
            var arr = getNodeAttachedSwitches(o).map(function(sw) {
                return Object.assign({}, sw, { copperPortUsage: {} });
            });
            o.properties.set('attachedSwitches', arr);
        }
    });
    objects.forEach(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return;
        if (!isCopperCableType(cable.properties.get('cableType'))) return;
        applyCopperCableOccupancyFromCable(cable);
    });
}

/**
 * HTML <option> для выбора медного порта на коммутаторе (в т.ч. в узле).
 * @param {'optional'|'required'} placeholderMode optional — строка «не назначено»; required — обязательный выбор
 */
function buildCopperPortOptionsHtml(obj, selected, switchIdForNode, excludeCableUniqueId, placeholderMode) {
    placeholderMode = placeholderMode || 'optional';
    if (!obj || !obj.properties) return '<option value="">—</option>';
    var t = obj.properties.get('type');
    if (t === 'camera' || t === 'mediaConverter') {
        return '<option value="" selected>— (порт не задаётся) —</option>';
    }
    var max = 0;
    var usage = {};
    if (t === 'cross') {
        max = Math.max(0, parseInt(obj.properties.get('crossCopperPorts'), 10) || 0);
        usage = obj.properties.get('copperPortUsage') || {};
    } else if (t === 'switch') {
        var stSw = obj.properties.get('switchPortTypes') || [];
        max = Array.isArray(stSw) ? stSw.length : 0;
        usage = obj.properties.get('copperPortUsage') || {};
    } else if (t === 'node') {
        if (!switchIdForNode) return '<option value="">Нет привязки к коммутатору</option>';
        var swN = findAttachedSwitchOnNode(obj, switchIdForNode);
        if (!swN) return '<option value="">Коммутатор не найден</option>';
        var stn = swN.switchPortTypes || [];
        max = Array.isArray(stn) ? stn.length : 0;
        usage = swN.copperPortUsage || {};
    }
    if (max === 0) return '<option value="">Нет портов (настройте кросс или коммутатор)</option>';
    var html = '';
    if (placeholderMode === 'required') {
        html += '<option value="" disabled selected>— выберите порт —</option>';
    } else {
        html += '<option value="">— не назначено —</option>';
    }
    for (var pi = 1; pi <= max; pi++) {
        var occup = usage[String(pi)];
        var dis = !!(occup && (!excludeCableUniqueId || occup !== excludeCableUniqueId));
        var sel = selected != null && selected !== '' && parseInt(selected, 10) === pi;
        html += '<option value="' + pi + '"' + (sel ? ' selected' : '') + (dis ? ' disabled' : '') + '>Порт ' + pi + (dis ? ' (занят)' : '') + '</option>';
    }
    return html;
}

function isCopperPortAvailableForNewLay(obj, portNum, switchIdForNode) {
    if (!obj || !obj.properties) return false;
    var p = parseInt(portNum, 10);
    if (isNaN(p) || p < 1) return false;
    var t = obj.properties.get('type');
    if (t === 'cross') {
        var u = obj.properties.get('copperPortUsage') || {};
        return !u[String(p)];
    }
    if (t === 'switch') {
        var us = obj.properties.get('copperPortUsage') || {};
        return !us[String(p)];
    }
    if (t === 'node') {
        if (!switchIdForNode) return false;
        var sw = findAttachedSwitchOnNode(obj, switchIdForNode);
        if (!sw) return false;
        var un = sw.copperPortUsage || {};
        return !un[String(p)];
    }
    return false;
}

function finishCopperCableToolSession() {
    currentCableTool = false;
    copperCableLayingActive = false;
    pendingCopperRouteFinish = null;
    var cableBtn = document.getElementById('addCable');
    if (cableBtn) {
        cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
        cableBtn.style.background = '#3498db';
    }
    cableSource = null;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    pendingCopperPortPreset = null;
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (myMap && myMap.container) {
        try {
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        } catch (eM) {}
    }
}

function tryCreateCopperToCameraWithPendingPort(points, cableTypeVal, copperMeta) {
    var pp = pendingCopperPortPreset;
    if (!pp || pp.kind !== 'node') return false;
    var startObj = points[0];
    if (!startObj || !startObj.properties || startObj.properties.get('type') !== 'node') return false;
    if (startObj.properties.get('uniqueId') !== pp.nodeUid) return false;
    var cm = Object.assign({}, copperMeta || {}, {
        copperSwitchFromId: pp.switchId,
        copperPortFrom: pp.port,
        copperPortTo: null,
        copperSwitchToId: null
    });
    if (!createCableFromPoints(points, cableTypeVal, null, null, false, false, cm)) return false;
    finishCopperCableToolSession();
    var last = objects[objects.length - 1];
    if (last && last.properties && last.properties.get('type') === 'cable' && isCopperCableType(last.properties.get('cableType'))) {
        if (typeof showCableInfo === 'function') showCableInfo(last);
    }
    return true;
}

function openCopperEndPortModal(points, cableTypeVal, copperMeta) {
    if (!points || points.length < 2 || !isCopperCableType(cableTypeVal)) return;
    copperMeta = copperMeta || {};
    var endObj = points[points.length - 1];
    var startObj = points[0];
    if (!endObj || !endObj.properties || !startObj || !startObj.properties) return;
    var endType = endObj.properties.get('type');

    if (isCopperLanEndDeviceType(endType)) {
        if (cameraHasCopperCable(endObj)) {
            if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
            return;
        }
        if (tryCreateCopperToCameraWithPendingPort(points, cableTypeVal, copperMeta)) return;

        var startType = startObj.properties.get('type');
        if (startType === 'cross' || startType === 'sleeve') {
            if (typeof showError === 'function') showError('Камеру или медиаконвертер можно подключить только от коммутатора.', 'Недопустимое действие');
            return;
        }
        if (startType === 'camera' && endType === 'mediaConverter') {
            var incEndMc = endObj.properties.get('incomingFiber');
            if (!incEndMc || !incEndMc.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
            if (cameraHasCopperCable(startObj) || cameraHasCopperCable(endObj)) {
                if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return;
            }
            var cmCamMc = Object.assign({}, copperMeta, { copperPortFrom: null, copperPortTo: null, copperSwitchFromId: null, copperSwitchToId: null });
            if (createCableFromPoints(points, cableTypeVal, null, null, false, false, cmCamMc)) {
                finishCopperCableToolSession();
                var lastCmMc = objects[objects.length - 1];
                if (lastCmMc && lastCmMc.properties && lastCmMc.properties.get('type') === 'cable' && isCopperCableType(lastCmMc.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(lastCmMc);
                }
            }
            return;
        }
        if (startType === 'mediaConverter' && endType === 'camera') {
            var incStartMc = startObj.properties.get('incomingFiber');
            if (!incStartMc || !incStartMc.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
            if (cameraHasCopperCable(startObj) || cameraHasCopperCable(endObj)) {
                if (typeof showError === 'function') showError('К этому устройству уже подключён медный кабель.', 'Подключение');
                return;
            }
            var cmMcCam = Object.assign({}, copperMeta, { copperPortFrom: null, copperPortTo: null, copperSwitchFromId: null, copperSwitchToId: null });
            if (createCableFromPoints(points, cableTypeVal, null, null, false, false, cmMcCam)) {
                finishCopperCableToolSession();
                var lastMcCam = objects[objects.length - 1];
                if (lastMcCam && lastMcCam.properties && lastMcCam.properties.get('type') === 'cable' && isCopperCableType(lastMcCam.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(lastMcCam);
                }
            }
            return;
        }
        if (startType === 'mediaConverter' && endType === 'mediaConverter') {
            if (typeof showError === 'function') showError('Нельзя соединять медным кабелем два медиаконвертера. От медиаконвертера прокладывайте кабель к узлу сети с коммутатором или к камере.', 'Недопустимое действие');
            return;
        }
        if (startType === 'mediaConverter') {
            var incMcStart = startObj.properties.get('incomingFiber');
            if (!incMcStart || !incMcStart.cableId) {
                if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Недопустимое действие');
                return;
            }
        }
        if (startType !== 'node' && startType !== 'switch' && startType !== 'mediaConverter') {
            if (typeof showError === 'function') showError('Камеру или медиаконвертер можно подключить только от коммутатора.', 'Недопустимое действие');
            return;
        }
        var swStartId = startType === 'node' ? (copperMeta.copperSwitchFromId || cableSourceCopperSwitchId) : null;
        if (startType === 'node' && !swStartId) {
            if (typeof showError === 'function') showError('Коммутатор для начала линии к устройству не выбран.', 'Недопустимое действие');
            return;
        }

        var pointsCopyCam = points.slice();
        pendingCopperRouteFinish = { points: pointsCopyCam, cableTypeVal: cableTypeVal, copperMeta: Object.assign({}, copperMeta, { copperPortTo: null, copperSwitchToId: null }), copperCameraEnd: true };

        var modalCam = document.getElementById('infoModal');
        var modalTitleCam = document.getElementById('modalTitle');
        var modalContentCam = document.getElementById('modalInfo');
        if (!modalCam || !modalTitleCam || !modalContentCam) return;

        modalTitleCam.textContent = 'Медный кабель: порт коммутатора';
        var labelFromCam = startType === 'switch' ? 'Порт на коммутаторе (начало маршрута)' : 'Порт на коммутаторе в узле (начало маршрута)';
        var htmlCam = '<div class="info-section"><p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:12px;">На камере и медиаконвертере порт не задаётся. Выберите свободный порт коммутатора на <strong>начале</strong> линии. После прокладки режим «Проложить кабель» выключится.</p>';
        htmlCam += '<div class="form-group" style="margin-bottom:12px;"><label for="copperEndPortSel" style="font-size:0.8125rem;">' + escapeHtml(labelFromCam) + '</label>';
        htmlCam += '<select id="copperEndPortSel" class="form-select">' + buildCopperPortOptionsHtml(startObj, null, swStartId, null, 'required') + '</select></div>';
        htmlCam += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
        htmlCam += '<button type="button" id="copperEndPortCancel" class="btn-secondary">Отмена</button>';
        htmlCam += '<button type="button" id="copperEndPortOk" class="btn-primary">Проложить</button></div></div>';
        modalContentCam.innerHTML = htmlCam;
        modalCam.style.display = 'block';
        currentModalObject = null;

        var btnCancelCam = document.getElementById('copperEndPortCancel');
        var btnOkCam = document.getElementById('copperEndPortOk');
        if (btnCancelCam) {
            btnCancelCam.onclick = function() {
                pendingCopperRouteFinish = null;
                modalCam.style.display = 'none';
            };
        }
        if (btnOkCam) {
            btnOkCam.onclick = function() {
                var selCam = document.getElementById('copperEndPortSel');
                var vCam = selCam && selCam.value ? parseInt(selCam.value, 10) : NaN;
                if (isNaN(vCam) || vCam < 1) {
                    if (typeof showError === 'function') showError('Выберите свободный порт на коммутаторе.', 'Порт');
                    return;
                }
                if (!isCopperPortAvailableForNewLay(startObj, vCam, swStartId)) {
                    if (typeof showError === 'function') showError('Этот порт занят. Выберите другой.', 'Порт занят');
                    return;
                }
                var prCam = pendingCopperRouteFinish;
                pendingCopperRouteFinish = null;
                modalCam.style.display = 'none';
                if (!prCam) return;
                var cmCam = Object.assign({}, prCam.copperMeta, {
                    copperPortFrom: vCam,
                    copperSwitchFromId: startType === 'node' ? (swStartId || prCam.copperMeta.copperSwitchFromId) : null,
                    copperPortTo: null,
                    copperSwitchToId: null
                });
                var okCam = createCableFromPoints(prCam.points, prCam.cableTypeVal, null, null, false, false, cmCam);
                if (okCam) {
                    finishCopperCableToolSession();
                    var lastCam = objects[objects.length - 1];
                    if (lastCam && lastCam.properties && lastCam.properties.get('type') === 'cable' && isCopperCableType(lastCam.properties.get('cableType'))) {
                        if (typeof showCableInfo === 'function') showCableInfo(lastCam);
                    }
                } else {
                    if (typeof showError === 'function') showError('Не удалось создать кабель. Проверьте маршрут и порты.', 'Ошибка');
                }
            };
        }
        return;
    }

    if (endType !== 'node' && endType !== 'switch') return;
    var toSw = endType === 'node' ? copperMeta.copperSwitchToId : null;
    if (endType === 'node' && !toSw) return;

    var pointsCopy = points.slice();
    pendingCopperRouteFinish = { points: pointsCopy, cableTypeVal: cableTypeVal, copperMeta: Object.assign({}, copperMeta) };

    var modal = document.getElementById('infoModal');
    var modalTitle = document.getElementById('modalTitle');
    var modalContent = document.getElementById('modalInfo');
    if (!modal || !modalTitle || !modalContent) return;

    modalTitle.textContent = 'Медный кабель: порт на конце';
    var labelTo = endType === 'switch' ? 'Порт на коммутаторе (конец маршрута)' : 'Порт на коммутаторе в узле (конец маршрута)';
    var htmlM = '<div class="info-section"><p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:12px;">Выберите порт для подключения на <strong>конце</strong> линии. После прокладки режим «Проложить кабель» выключится — следующий медный кабель начните снова с кнопки на панели или «Подключить» у порта коммутатора.</p>';
    htmlM += '<div class="form-group" style="margin-bottom:12px;"><label for="copperEndPortSel" style="font-size:0.8125rem;">' + escapeHtml(labelTo) + '</label>';
    htmlM += '<select id="copperEndPortSel" class="form-select">' + buildCopperPortOptionsHtml(endObj, null, toSw, null, 'required') + '</select></div>';
    htmlM += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">';
    htmlM += '<button type="button" id="copperEndPortCancel" class="btn-secondary">Отмена</button>';
    htmlM += '<button type="button" id="copperEndPortOk" class="btn-primary">Проложить</button></div></div>';
    modalContent.innerHTML = htmlM;
    modal.style.display = 'block';
    currentModalObject = null;

    var btnCancel = document.getElementById('copperEndPortCancel');
    var btnOk = document.getElementById('copperEndPortOk');
    if (btnCancel) {
        btnCancel.onclick = function() {
            pendingCopperRouteFinish = null;
            modal.style.display = 'none';
        };
    }
    if (btnOk) {
        btnOk.onclick = function() {
            var sel = document.getElementById('copperEndPortSel');
            var v = sel && sel.value ? parseInt(sel.value, 10) : NaN;
            if (isNaN(v) || v < 1) {
                if (typeof showError === 'function') showError('Выберите свободный порт на конце маршрута.', 'Порт');
                return;
            }
            if (!isCopperPortAvailableForNewLay(endObj, v, toSw)) {
                if (typeof showError === 'function') showError('Этот порт занят. Выберите другой.', 'Порт занят');
                return;
            }
            var pr = pendingCopperRouteFinish;
            pendingCopperRouteFinish = null;
            modal.style.display = 'none';
            if (!pr) return;
            var cm = Object.assign({}, pr.copperMeta, { copperPortTo: v });
            var ok = createCableFromPoints(pr.points, pr.cableTypeVal, null, null, false, false, cm);
            if (ok) {
                finishCopperCableToolSession();
                var last = objects[objects.length - 1];
                if (last && last.properties && last.properties.get('type') === 'cable' && isCopperCableType(last.properties.get('cableType'))) {
                    if (typeof showCableInfo === 'function') showCableInfo(last);
                }
            } else {
                if (typeof showError === 'function') showError('Не удалось создать кабель. Проверьте маршрут и порты.', 'Ошибка');
            }
        };
    }
}

/** Обработка клика по объекту в режиме прокладки медного кабеля. Возвращает true, если клик обработан (в т.ч. ошибка). */
function handleCopperCablePlacemarkStep(placemark, type, cableTypeVal) {
    if (!isCopperCableType(cableTypeVal)) return false;
    if (type === 'splitter' || type === 'onu') {
        showError('Для медного кабеля используйте узел с коммутатором, камеру, медиаконвертер, опору или крепление узла.', 'Недопустимое действие');
        return true;
    }
    if (type === 'sleeve' || type === 'cross' || type === 'olt') {
        showError('Медный кабель не прокладывается к муфте, кроссу или OLT. Концы маршрута — узел сети с коммутатором, камера или медиаконвертер (с подключённой оптической жилой).', 'Недопустимое действие');
        return true;
    }
    if (type === 'node' && getNodeAttachedSwitches(placemark).length === 0) {
        showError('У этого узла нет коммутаторов. Добавьте коммутатор в карточке узла.', 'Недопустимое действие');
        return true;
    }
    var ep = ['switch', 'node', 'support', 'attachment', 'camera', 'mediaConverter'];
    if (ep.indexOf(type) === -1) {
        showError('Медный кабель: доступны только узел с коммутатором, камера, медиаконвертер, опора и крепление узла.', 'Недопустимое действие');
        return true;
    }
    if (!cableSource) {
        if (type === 'support' || type === 'attachment') {
            showError('Начало медного кабеля должно быть узлом с коммутатором или медиаконвертером (кнопка в карточке при наличии оптической жилы). Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
            return true;
        }
        if (type === 'mediaConverter') {
            var incMc = placemark.properties.get('incomingFiber');
            if (!incMc || !incMc.cableId) {
                showError('Медный кабель от медиаконвертера доступен только после подключения оптической жилы с муфты или кросса.', 'Недопустимое действие');
                return true;
            }
        }
        if (isCopperLanEndDeviceType(type)) {
            showError('Сначала укажите начало медной линии на узле с коммутатором или на медиаконвертере (после подключения жилы), затем кликните по камере, медиаконвертеру или второму узлу (или используйте «Подключить» на порту коммутатора).', 'Недопустимое действие');
            return true;
        }
        cableSource = placemark;
        if (type === 'node') {
            cableSourceCopperSwitchId = resolveSwitchIdForCopperNodeClick(placemark);
            if (!cableSourceCopperSwitchId) {
                cableSource = null;
                cableSourceCopperSwitchId = null;
                showError('Коммутатор не выбран или у узла нет коммутаторов.', 'Недопустимое действие');
                return true;
            }
        } else {
            cableSourceCopperSwitchId = null;
        }
        cableWaypoints = [];
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (placemark === cableSource) {
        cableWaypoints = [];
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (type === 'support' || type === 'attachment') {
        cableWaypoints.push(placemark);
        clearSelection();
        selectObject(cableSource);
        return true;
    }
    if (isCopperLanEndDeviceType(type)) {
        var srcT = cableSource.properties.get('type');
        if (srcT === 'cross' || srcT === 'sleeve') {
            showError('Камеру или медиаконвертер можно подключить только от коммутатора или от медиаконвертера с оптической жилой.', 'Недопустимое действие');
            return true;
        }
    }
    var toSwitchId = null;
    if (type === 'node') {
        toSwitchId = resolveSwitchIdForCopperNodeClick(placemark);
        if (!toSwitchId) {
            showError('Коммутатор не выбран.', 'Недопустимое действие');
            return true;
        }
    }
    var points = [cableSource].concat(cableWaypoints).concat([placemark]);
    var copperMeta = {
        copperSwitchFromId: cableSource.properties.get('type') === 'node' ? cableSourceCopperSwitchId : null,
        copperSwitchToId: type === 'node' ? toSwitchId : null
    };
    openCopperEndPortModal(points, cableTypeVal, copperMeta);
    return true;
}

function startCopperCableFromMediaConverter(mcObj) {
    if (!isEditMode || !mcObj || !mcObj.properties || mcObj.properties.get('type') !== 'mediaConverter') return;
    var inc = mcObj.properties.get('incomingFiber');
    if (!inc || !inc.cableId) {
        if (typeof showError === 'function') showError('Сначала подключите оптическую жилу к медиаконвертеру с муфты или кросса.', 'Нет входной жилы');
        return;
    }
    if (cameraHasCopperCable(mcObj)) {
        if (typeof showError === 'function') showError('К этому медиаконвертеру уже подключён медный кабель.', 'Подключение');
        return;
    }
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (splitterFiberRoutingMode && typeof cancelSplitterFiberRouting === 'function') cancelSplitterFiberRouting();
    if (fiberRoutingMode && typeof cancelFiberRouting === 'function') cancelFiberRouting();
    if (!currentCableTool) {
        var cableBtnMc = document.getElementById('addCable');
        if (cableBtnMc) cableBtnMc.click();
    }
    copperCableLayingActive = true;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    pendingCopperPortPreset = null;
    cableSource = mcObj;
    cableSourceCopperSwitchId = null;
    cableWaypoints = [];
    if (typeof removePhantomPlacemark === 'function') removePhantomPlacemark();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof selectObject === 'function') selectObject(cableSource);
    var modalMc = document.getElementById('infoModal');
    if (modalMc) modalMc.style.display = 'none';
    currentModalObject = null;
    if (typeof showInfo === 'function') {
        showInfo('Укажите на карте второй конец: узел сети с коммутатором, отдельный коммутатор или камера. Опоры и крепления — только промежуточные точки.', 'Медный кабель');
    }
}

function startCopperCableFromNodeSwitchPort(nodeObj, switchId, portNum) {
    if (!isEditMode || !nodeObj || !nodeObj.properties || nodeObj.properties.get('type') !== 'node') return;
    if (!switchId) return;
    var p = parseInt(portNum, 10);
    if (isNaN(p) || p < 1) {
        if (typeof showError === 'function') showError('Некорректный номер порта коммутатора.', 'Порт');
        return;
    }
    var sw = findAttachedSwitchOnNode(nodeObj, switchId);
    if (!sw) {
        if (typeof showError === 'function') showError('Коммутатор не найден в узле.', 'Ошибка');
        return;
    }
    var pts = sw.switchPortTypes || [];
    if (p > pts.length) {
        if (typeof showError === 'function') showError('Номер порта больше числа портов коммутатора.', 'Порт');
        return;
    }
    if (isSwitchPortSfpFiberType(pts[p - 1] || '')) {
        if (typeof showError === 'function') showError('Медный кабель не подключается к порту SFP, SFP+ или Комбо — для оптики используйте жилу с кросса.', 'Недопустимое действие');
        return;
    }
    var fusStart = sw.fiberPortUsage || {};
    if (fusStart[String(p)]) {
        if (typeof showError === 'function') showError('Порт занят оптической жилой с кросса. Для меди выберите другой порт.', 'Порт занят');
        return;
    }
    var usageN = sw.copperPortUsage || {};
    if (usageN[String(p)]) {
        if (typeof showError === 'function') showError('Этот порт коммутатора уже занят медным кабелем.', 'Порт занят');
        return;
    }
    if (objectPlacementMode && typeof cancelObjectPlacement === 'function') cancelObjectPlacement();
    if (splitterFiberRoutingMode && typeof cancelSplitterFiberRouting === 'function') cancelSplitterFiberRouting();
    if (fiberRoutingMode && typeof cancelFiberRouting === 'function') cancelFiberRouting();
    if (!currentCableTool) {
        var cableBtn2 = document.getElementById('addCable');
        if (cableBtn2) cableBtn2.click();
    }
    copperCableLayingActive = true;
    if (typeof syncCableTypePickerUI === 'function') syncCableTypePickerUI();
    pendingCopperPortPreset = { kind: 'node', nodeUid: nodeObj.properties.get('uniqueId'), switchId: switchId, port: p };
    cableSource = nodeObj;
    cableSourceCopperSwitchId = switchId;
    cableWaypoints = [];
    if (typeof removePhantomPlacemark === 'function') removePhantomPlacemark();
    if (typeof removeCablePreview === 'function') removeCablePreview();
    if (typeof clearSelection === 'function') clearSelection();
    if (typeof selectObject === 'function') selectObject(cableSource);
    var modal2 = document.getElementById('infoModal');
    if (modal2) modal2.style.display = 'none';
    currentModalObject = null;
    if (typeof showInfo === 'function') {
        showInfo('Укажите на карте второй конец: узел сети с коммутатором, отдельный коммутатор или камера. Опоры и крепления — только промежуточные точки.', 'Медный кабель');
    }
}

function calculateDistance(coords1, coords2) {
    const R = 6371000; 
    const lat1 = coords1[0] * Math.PI / 180;
    const lat2 = coords2[0] * Math.PI / 180;
    const deltaLat = (coords2[0] - coords1[0]) * Math.PI / 180;
    const deltaLon = (coords2[1] - coords1[1]) * Math.PI / 180;
    
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance = R * c;
    return Math.round(distance);
}

function pointToLineDistance(point, lineStart, lineEnd) {
    const A = point[0] - lineStart[0];
    const B = point[1] - lineStart[1];
    const C = lineEnd[0] - lineStart[0];
    const D = lineEnd[1] - lineStart[1];
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq != 0) {
        param = dot / lenSq;
    }
    
    let xx, yy;
    
    if (param < 0) {
        xx = lineStart[0];
        yy = lineStart[1];
    } else if (param > 1) {
        xx = lineEnd[0];
        yy = lineEnd[1];
    } else {
        xx = lineStart[0] + param * C;
        yy = lineStart[1] + param * D;
    }
    
    const dx = point[0] - xx;
    const dy = point[1] - yy;
    return {
        distance: Math.sqrt(dx * dx + dy * dy),
        param: param 
    };
}

window.applyCopperCablePortSelection = function(cableUniqueId, fromPort, toPort) {
    var cab = objects.find(function(o) {
        return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableUniqueId;
    });
    if (!cab || !isCopperCableType(cab.properties.get('cableType'))) return;
    var fromO = cab.properties.get('from');
    var toO = cab.properties.get('to');
    var swFrom = cab.properties.get('copperSwitchFromId');
    var swTo = cab.properties.get('copperSwitchToId');
    function portFree(obj, port, switchIdForNode) {
        if (port == null || isNaN(port)) return true;
        if (!obj || !obj.properties) return false;
        var t = obj.properties.get('type');
        if (t === 'cross' || t === 'switch') {
            var usage = obj.properties.get('copperPortUsage') || {};
            var oc = usage[String(port)];
            return !oc || oc === cableUniqueId;
        }
        if (t === 'node') {
            if (!switchIdForNode) return false;
            var sw = findAttachedSwitchOnNode(obj, switchIdForNode);
            if (!sw) return false;
            var usageN = sw.copperPortUsage || {};
            var ocN = usageN[String(port)];
            return !ocN || ocN === cableUniqueId;
        }
        if (t === 'camera' || t === 'mediaConverter') return true;
        return false;
    }
    if (!portFree(fromO, fromPort, swFrom) || !portFree(toO, toPort, swTo)) {
        if (typeof showError === 'function') showError('Один из выбранных портов уже занят другим кабелем.', 'Порт занят');
        return;
    }
    cab.properties.set('copperPortFrom', fromPort == null || isNaN(fromPort) ? null : fromPort);
    cab.properties.set('copperPortTo', toPort == null || isNaN(toPort) ? null : toPort);
    applyCopperCableOccupancyFromCable(cab);
    saveData();
    if (typeof showInfo === 'function') showInfo('Назначение портов сохранено', 'Сохранено');
    showCableInfo(cab);
};

function resetInfoModalFiberLayout() {
    var modal = document.getElementById('infoModal');
    if (!modal) return;
    var modalContent = modal.querySelector('.modal-content');
    if (modalContent) modalContent.classList.remove('fiber-management-modal');
    modal.classList.remove('fiber-management-modal-open');
    modal.removeAttribute('data-fiber-workspace');
    modal.removeAttribute('data-device-card');
    updateInfoModalChrome(null, '');
}

var INFO_MODAL_DEVICE_SUBTITLES = {
    camera: 'Видеопоток · медь · трассировка оптики',
    node: 'Коммутаторы, оптика и медные порты',
    olt: 'GPON · приход и порты',
    onu: 'Подключение по оптике',
    mediaConverter: 'Оптика и медь к коммутатору',
    support: 'Промежуточная точка маршрута ВОЛС',
    attachment: 'Крепление кабеля на маршруте'
};

function updateInfoModalChrome(type, name) {
    var modal = document.getElementById('infoModal');
    var header = document.getElementById('fiberModalHeader');
    var headerMain = header ? header.querySelector('.fiber-modal-header-main') : null;
    var headerText = headerMain ? headerMain.querySelector('.fiber-modal-header-text') : null;
    var iconEl = document.getElementById('fiberModalHeaderIcon');
    var subEl = document.getElementById('modalTitleSub');
    var modalContent = modal ? modal.querySelector('.modal-content') : null;
    if (!modal || !header) return;

    var isWorkspace = type === 'cross' || type === 'sleeve';
    var isDeviceCard = !!(type && INFO_MODAL_DEVICE_SUBTITLES[type]);
    var showHeaderIcon = (isWorkspace || isDeviceCard) && window.MapIcons;

    modal.setAttribute('data-fiber-workspace', isWorkspace ? type : '');
    modal.setAttribute('data-device-card', isDeviceCard && !isWorkspace ? type : '');
    header.classList.toggle('fiber-modal-header--workspace', isWorkspace);
    header.classList.toggle('fiber-modal-header--device', isDeviceCard && !isWorkspace);
    if (modalContent) {
        modalContent.classList.toggle('modal-content--device-card', isDeviceCard && !isWorkspace);
    }

    if (showHeaderIcon && headerMain && headerText) {
        if (!iconEl) {
            iconEl = document.createElement('div');
            iconEl.id = 'fiberModalHeaderIcon';
            iconEl.setAttribute('aria-hidden', 'true');
            headerMain.insertBefore(iconEl, headerText);
        }
        iconEl.className = 'fiber-modal-header-icon fiber-modal-header-icon--' + type;
        var iconOpts = { variant: 'normal' };
        if (type === 'node' && currentModalObject && currentModalObject.properties) {
            iconOpts.nodeKind = currentModalObject.properties.get('nodeKind') || 'network';
        }
        iconEl.innerHTML = MapIcons.buildIconSvg(type, iconOpts);
    } else if (iconEl) {
        iconEl.remove();
    }

    if (subEl) {
        var sub = isWorkspace
            ? (type === 'cross' ? 'Схема, таблица и соединения жил' : 'Схема, таблица и сращивания волокон')
            : (INFO_MODAL_DEVICE_SUBTITLES[type] || '');
        if (sub) {
            subEl.hidden = false;
            subEl.textContent = sub;
        } else {
            subEl.hidden = true;
            subEl.textContent = '';
        }
    }

    if ((isWorkspace || isDeviceCard) && typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function () {
            window.initPanelPlexusCanvases(modal);
        });
    }
}

function isInfoModalVisible(modal) {
    if (!modal) return false;
    var display = modal.style.display;
    return display === 'flex' || display === 'block';
}

function closeInfoModal() {
    if (typeof window.isConfirmModalOpen === 'function' && window.isConfirmModalOpen()) {
        return;
    }
    var modal = document.getElementById('infoModal');
    if (!modal) return;
    var modalInfo = document.getElementById('modalInfo');
    if (window.CameraPlayer && modalInfo) CameraPlayer.destroyPlayersInRoot(modalInfo);
    resetInfoModalFiberLayout();
    if (typeof pendingCopperRouteFinish !== 'undefined' && pendingCopperRouteFinish) {
        pendingCopperRouteFinish = null;
    }
    modal.style.display = 'none';
    currentModalObject = null;
    if (typeof clearFiberConnectionLabelSelection === 'function') clearFiberConnectionLabelSelection();
}

function showCableInfo(cable) {
    resetInfoModalFiberLayout();
    if (cableSplitSuppressInfoUntil && Date.now() < cableSplitSuppressInfoUntil) {
        return;
    }
    if (cableSplitMode && cableSplitData) {
        if (cable && cable.geometry) {
            var splitCoords = null;
            try {
                if (typeof window.lastMapClickCoords !== 'undefined' && window.lastMapClickCoords) {
                    splitCoords = window.lastMapClickCoords;
                }
            } catch (eSc) {}
            if (!splitCoords) {
                var gc = cable.geometry.getCoordinates();
                if (gc && gc.length) splitCoords = gc[Math.floor(gc.length / 2)];
            }
            if (splitCoords) {
                handleCableSplitMapClick(splitCoords, cable);
                return;
            }
        }
        return;
    }

    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }
    
    const cableType = cable.properties.get('cableType');
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    const uniqueId = cable.properties.get('uniqueId');
    const cableName = cable.properties.get('cableName') || '';
    const fiberCount = getFiberCount(cable);
    const fibers = getFiberColors(cable);
    
    const cableDescription = getCableDescription(cableType, cable);

    const fromUniqueId = fromObj ? fromObj.properties.get('uniqueId') : null;
    const toUniqueId = toObj ? toObj.properties.get('uniqueId') : null;
    
    const parallelCables = objects.filter(obj => {
        if (!obj.properties || obj.properties.get('type') !== 'cable') return false;
        if (obj.properties.get('uniqueId') === uniqueId) return false; 
        
        const objFrom = obj.properties.get('from');
        const objTo = obj.properties.get('to');
        if (!objFrom || !objTo) return false;
        
        const objFromId = objFrom.properties.get('uniqueId');
        const objToId = objTo.properties.get('uniqueId');

        return (objFromId === fromUniqueId && objToId === toUniqueId) ||
               (objFromId === toUniqueId && objToId === fromUniqueId);
    });

    const getObjInfo = (obj) => {
        if (!obj || !obj.properties) return { type: 'Объект', name: '', icon: '📍' };
        const type = obj.properties.get('type');
        const name = obj.properties.get('name') || '';
        let typeName = 'Объект';
        let icon = '📍';
        if (type === 'support') { typeName = 'Опора связи'; icon = '📍'; }
        else if (type === 'sleeve') { typeName = 'Кабельная муфта'; icon = '🔴'; }
        else if (type === 'cross') { typeName = 'Оптический кросс'; icon = '📦'; }
        else if (type === 'node') { typeName = 'Узел сети'; icon = '🖥️'; }
        else if (type === 'attachment') { typeName = 'Крепление узлов'; icon = '🔗'; }
        else if (type === 'switch') { typeName = 'Коммутатор'; icon = '🔀'; }
        else if (type === 'olt') { typeName = 'OLT (GPON)'; icon = '📶'; }
        else if (type === 'onu') { typeName = 'ONU'; icon = '📟'; }
        else if (type === 'splitter') { typeName = 'Сплиттер'; icon = '🔀'; }
        else if (type === 'camera') { typeName = 'Камера'; icon = '📷'; }
        else if (type === 'mediaConverter') { typeName = 'Медиаконвертер'; icon = '⇄'; }
        return { type: typeName, name, icon };
    };
    
    const fromInfo = getObjInfo(fromObj);
    const toInfo = getObjInfo(toObj);
    
    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalInfo');
    
    if (!modal || !modalContent) {
        console.error('Модальное окно не найдено!');
        return;
    }

    if (isCopperCableType(cableType)) {
        modalTitle.textContent = '🔌 Медный кабель';
        const copperColor = '#b45309';
        const pf = cable.properties.get('copperPortFrom');
        const pt = cable.properties.get('copperPortTo');
        const swFromCable = cable.properties.get('copperSwitchFromId');
        const swToCable = cable.properties.get('copperSwitchToId');
        function buildCopperPortOptions(obj, selected, switchIdForNode) {
            return buildCopperPortOptionsHtml(obj, selected, switchIdForNode, uniqueId, 'optional');
        }
        const fromInfoCu = getObjInfo(fromObj);
        const toInfoCu = getObjInfo(toObj);
        var distCu = cable.properties.get('distance');
        if (distCu == null && cable.geometry) {
            try {
                var gc = cable.geometry.getCoordinates();
                if (gc && gc.length >= 2) {
                    var sum = 0;
                    for (var di = 0; di < gc.length - 1; di++) sum += calculateDistance(gc[di], gc[di + 1]);
                    distCu = sum;
                }
            } catch (eD) {}
        }
        var htmlCu = '<div class="info-section">';
        htmlCu += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Один медный кабель — одна линия. Назначьте порты на коммутаторах на концах (в узле или отдельная точка на карте). У камеры и медиаконвертера порт не задаётся. Занятые порты нельзя выбрать для другого кабеля.</p>';
        htmlCu += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-color);">';
        htmlCu += '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;"><span>' + fromInfoCu.icon + '</span><div><strong>' + escapeHtml(fromInfoCu.type) + '</strong>' + (fromInfoCu.name ? '<br><span style="font-size: 0.8rem; color: var(--text-secondary);">' + escapeHtml(fromInfoCu.name) + '</span>' : '') + '</div></div>';
        htmlCu += '<div style="margin-left: 14px; padding-left: 14px; border-left: 2px dashed ' + copperColor + '; margin-bottom: 8px;"><span style="font-size: 0.75rem; color: var(--text-muted);">↓</span></div>';
        htmlCu += '<div style="display: flex; align-items: center; gap: 8px;"><span>' + toInfoCu.icon + '</span><div><strong>' + escapeHtml(toInfoCu.type) + '</strong>' + (toInfoCu.name ? '<br><span style="font-size: 0.8rem; color: var(--text-secondary);">' + escapeHtml(toInfoCu.name) + '</span>' : '') + '</div></div></div>';
        if (isEditMode) {
            htmlCu += '<div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.8125rem;">Порт на начале маршрута (' + escapeHtml(fromInfoCu.type) + ')</label>';
            htmlCu += '<select id="copperPortFromSel" class="form-select">' + buildCopperPortOptions(fromObj, pf, swFromCable) + '</select></div>';
            htmlCu += '<div class="form-group" style="margin-bottom: 12px;"><label style="font-size: 0.8125rem;">Порт на конце маршрута (' + escapeHtml(toInfoCu.type) + ')</label>';
            htmlCu += '<select id="copperPortToSel" class="form-select">' + buildCopperPortOptions(toObj, pt, swToCable) + '</select></div>';
            htmlCu += '<button type="button" class="btn-primary" id="saveCopperPortsBtn">Сохранить назначение портов</button>';
        } else {
            htmlCu += '<div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 8px;"><strong>Порт «от»:</strong> ' + (pf != null && pf !== '' ? String(pf) : '—') + '</div>';
            htmlCu += '<div style="font-size: 0.875rem; color: var(--text-secondary);"><strong>Порт «до»:</strong> ' + (pt != null && pt !== '' ? String(pt) : '—') + '</div>';
        }
        htmlCu += '<div style="margin-top: 12px; font-size: 0.8125rem; color: var(--text-muted);">Длина по маршруту: ' + (distCu != null ? distCu + ' м' : '—') + '</div>';
        htmlCu += '</div>';
        if (isEditMode) {
            htmlCu += '<div style="padding-top: 16px; border-top: 1px solid var(--border-color);"><button class="btn-danger" onclick="deleteCableByUniqueId(\'' + uniqueId + '\')">Удалить кабель</button></div>';
        }
        modalContent.innerHTML = htmlCu;
        var saveCuBtn = modalContent.querySelector('#saveCopperPortsBtn');
        if (saveCuBtn) {
            saveCuBtn.addEventListener('click', function() {
                var sf = document.getElementById('copperPortFromSel');
                var st = document.getElementById('copperPortToSel');
                var vf = sf && sf.value ? parseInt(sf.value, 10) : null;
                var vt = st && st.value ? parseInt(st.value, 10) : null;
                if (window.applyCopperCablePortSelection) window.applyCopperCablePortSelection(uniqueId, vf, vt);
            });
        }
        modal.style.display = 'block';
        currentModalObject = cable;
        return;
    }

    modalTitle.textContent = '🔌 Информация о кабеле';

    var cableColor = getCableColor(cableType);
    
    let html = '<div class="info-section">';

    html += `<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding: 12px; background: linear-gradient(135deg, ${cableColor}15, ${cableColor}05); border-radius: 8px; border-left: 4px solid ${cableColor};">`;
    html += `<div style="width: 40px; height: 40px; background: ${cableColor}; border-radius: 8px; display: flex; align-items: center; justify-content: center;">`;
    html += `<span style="color: white; font-size: 18px;">🔌</span></div>`;
    html += `<div><h3 style="margin: 0; color: var(--text-primary); font-size: 1rem;">${cableDescription}</h3>`;
    html += `<span style="font-size: 0.8rem; color: var(--text-muted);">${fiberCount} жил</span></div></div>`;

    html += '<div class="form-group" style="margin-bottom: 16px;">';
    html += '<label style="display: block; margin-bottom: 6px; font-weight: 600; color: var(--text-primary); font-size: 0.8125rem;">Название кабеля</label>';
    if (isEditMode) {
        html += `<input type="text" id="cableNameInput" class="form-input" value="${escapeHtml(cableName)}" placeholder="Введите название кабеля" 
            oninput="updateCableName('${uniqueId}', this.value)" onchange="updateCableName('${uniqueId}', this.value)">`;
    } else {
        html += `<div style="padding: 10px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-primary);">${cableName ? escapeHtml(cableName) : '<span style="color: var(--text-muted); font-style: italic;">Не задано</span>'}</div>`;
    }
    html += '</div>';

    if (isEditMode) {
        html += '<div class="cable-fiber-settings-row form-group">';
        html += '<label>Число жил и цвета</label>';
        html += '<div class="cable-fiber-settings-toolbar">';
        html += '<input type="number" id="cableFiberCountInput" class="form-input cable-fiber-count-input" min="1" max="96" value="' + fiberCount + '" aria-label="Число жил">';
        html += '<button type="button" class="btn-secondary btn-cable-palette-edit" id="cableFiberPaletteBtn">' + (window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета') + '</button>';
        html += '<button type="button" class="btn-primary btn-inline" id="cableFiberCountSaveBtn">Применить</button>';
        html += '</div></div>';
    }

    html += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; border: 1px solid var(--border-color);">';
    html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.875rem; font-weight: 600;">📍 Маршрут</h4>';
    
    html += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">`;
    html += `<span style="font-size: 1.1rem;">${fromInfo.icon}</span>`;
    html += `<div><strong style="color: var(--text-primary);">${fromInfo.type}</strong>`;
    if (fromInfo.name) html += `<br><span style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(fromInfo.name)}</span>`;
    html += `</div></div>`;
    
    html += `<div style="margin-left: 14px; padding-left: 14px; border-left: 2px dashed ${cableColor}; margin-bottom: 8px;">`;
    html += `<span style="font-size: 0.75rem; color: var(--text-muted);">↓ кабель</span></div>`;
    
    html += `<div style="display: flex; align-items: center; gap: 8px;">`;
    html += `<span style="font-size: 1.1rem;">${toInfo.icon}</span>`;
    html += `<div><strong style="color: var(--text-primary);">${toInfo.type}</strong>`;
    if (toInfo.name) html += `<br><span style="font-size: 0.8rem; color: var(--text-secondary);">${escapeHtml(toInfo.name)}</span>`;
    html += `</div></div>`;
    html += '</div>';

    let displayDistance = 'неизвестно';
    if (fromObj && toObj && fromObj.geometry && toObj.geometry) {
        const fromCoords = fromObj.geometry.getCoordinates();
        const toCoords = toObj.geometry.getCoordinates();
        displayDistance = calculateDistance(fromCoords, toCoords);
        cable.properties.set('distance', displayDistance);
        saveData();
    }

    const totalCablesOnSegment = parallelCables.length + 1; 
    
    html += '<div style="display: flex; gap: 10px; margin-bottom: 16px;">';
    html += `<div style="flex: 1; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">`;
    html += `<div style="font-size: 0.7rem; color: var(--accent-primary); margin-bottom: 2px;">Расстояние</div>`;
    if (typeof displayDistance === 'number') {
        html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${displayDistance} м</div>`;
    } else {
        html += `<div style="font-size: 0.9rem; color: var(--text-muted);">${displayDistance}</div>`;
    }
    html += `</div>`;
    html += `<div style="flex: 1; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; text-align: center; border: 1px solid var(--border-color);">`;
    html += `<div style="font-size: 0.7rem; color: var(--accent-success); margin-bottom: 2px;">Жил</div>`;
    html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${fiberCount}</div>`;
    html += `</div>`;
    html += `<div style="flex: 1; padding: 10px; background: ${totalCablesOnSegment > 1 ? 'var(--bg-accent)' : 'var(--bg-tertiary)'}; border-radius: 8px; text-align: center; border: 1px solid ${totalCablesOnSegment > 1 ? 'var(--accent-warning)' : 'var(--border-color)'};">`;
    html += `<div style="font-size: 0.7rem; color: ${totalCablesOnSegment > 1 ? 'var(--accent-warning)' : 'var(--text-muted)'}; margin-bottom: 2px;">На участке</div>`;
    html += `<div style="font-size: 1rem; font-weight: 600; color: var(--text-primary);">${totalCablesOnSegment} каб.</div>`;
    html += `</div></div>`;

    if (parallelCables.length > 0) {
        html += '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-accent); border-radius: 8px; border: 1px solid var(--accent-warning);">';
        html += `<h4 style="margin: 0 0 10px 0; color: var(--accent-warning); font-size: 0.8rem; font-weight: 600;">📦 Другие кабели на этом участке (${parallelCables.length})</h4>`;
        html += '<div style="display: flex; flex-direction: column; gap: 6px;">';
        
        parallelCables.forEach((pCable, idx) => {
            const pType = pCable.properties.get('cableType');
            const pName = pCable.properties.get('cableName') || '';
            const pDesc = getCableDescription(pType, pCable);
            const pFibers = getFiberCount(pCable);
            const pId = pCable.properties.get('uniqueId');
            const pColor = getCableColor(pType);
            
            html += `<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: var(--bg-card); border-radius: 6px; border-left: 3px solid ${pColor}; cursor: pointer;" onclick="showCableInfoById('${pId}')">`;
            html += `<div style="width: 8px; height: 8px; border-radius: 50%; background: ${pColor};"></div>`;
            html += `<div style="flex: 1; min-width: 0;">`;
            html += `<div style="font-size: 0.8rem; font-weight: 500; color: var(--text-primary);">${pName ? escapeHtml(pName) : pDesc}</div>`;
            if (pName) html += `<div style="font-size: 0.7rem; color: var(--text-muted);">${pDesc}</div>`;
            html += `</div>`;
            html += `<div style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap;">${pFibers} жил</div>`;
            html += `</div>`;
        });
        
        html += '</div></div>';
    }

    html += '<div style="margin-bottom: 16px;">';
    html += '<h4 style="margin: 0 0 10px 0; color: var(--text-primary); font-size: 0.875rem; font-weight: 600;">🌈 Жилы кабеля</h4>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
    fibers.forEach(fiber => {
        html += `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: var(--bg-card); border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.8rem;">`;
        html += `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${fiber.color}; border: ${fiber.hasBlackRing ? '2px solid #000' : '1px solid rgba(0,0,0,0.2)'};"></div>`;
        html += `<span style="color: var(--text-primary); font-weight: 500;">${fiber.number}</span>`;
        html += `<span style="color: var(--text-muted); font-size: 0.7rem;">${fiber.name}</span>`;
        html += `</div>`;
    });
    html += '</div></div>';

    if (isEditMode) {
        html += '<div class="cable-split-toolbar">';
        html += '<div class="cable-split-toolbar__sleeve">' + buildCableSplitSleeveFieldsHtml() + '</div>';
        html += '<button type="button" id="btnSplitCableSleeve" class="btn-cable-split-start">🔴 Установить муфту на кабеле</button>';
        html += '<button id="saveCableChangesBtn" class="btn-primary" style="flex: 1; min-width: 140px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Сохранить</button>';
        html += `<button class="btn-danger" onclick="deleteCableByUniqueId('${uniqueId}')" style="flex: 1; min-width: 120px;">`;
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">';
        html += '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>';
        html += '</svg>Удалить кабель</button>';
        html += '</div>';
    }
    
    html += '</div>';
    
    modalContent.innerHTML = html;
    bindCableSplitSleeveFields(modalContent);
    var fiberCountSaveBtn = modalContent.querySelector('#cableFiberCountSaveBtn');
    var fiberCountInput = modalContent.querySelector('#cableFiberCountInput');
    var fiberPaletteBtn = modalContent.querySelector('#cableFiberPaletteBtn');
    if (fiberCountSaveBtn && fiberCountInput) {
        fiberCountSaveBtn.addEventListener('click', async function() {
            await updateCableFiberSettings(uniqueId, fiberCountInput.value, undefined);
        });
    }
    if (fiberPaletteBtn && window.FiberCableConfig) {
        fiberPaletteBtn.addEventListener('click', function() {
            window.FiberCableConfig.openFiberPaletteEditor({
                title: 'Цвета жил кабеля',
                fiberCount: getFiberCount(cable),
                palette: window.FiberCableConfig.getFiberPaletteForCable(cable),
                onSave: async function(r) {
                    await updateCableFiberSettings(uniqueId, r.fiberCount, r.palette);
                }
            });
        });
    }
    var saveCableBtn = modalContent.querySelector('#saveCableChangesBtn');
    if (saveCableBtn) {
        saveCableBtn.addEventListener('click', function() {
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
            showInfo('Изменения сохранены', 'Сохранено');
        });
    }
    var splitCableBtn = modalContent.querySelector('#btnSplitCableSleeve');
    if (splitCableBtn) {
        splitCableBtn.addEventListener('click', function() {
            var sleeveOpts = readCableSplitSleeveOptions(modalContent);
            startCableSplitPickOnCable(cable, sleeveOpts);
        });
    }
    modal.style.display = 'block';
    currentModalObject = cable;
}

function showCableInfoById(cableUniqueId) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (cable) {
        showCableInfo(cable);
    }
}

function updateCableName(cableUniqueId, newName) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (cable) {
        cable.properties.set('cableName', newName);
        saveData();
    }
}

function updateCablePreview(sourceObj, waypoints, targetCoords) {
    if (!sourceObj || !sourceObj.geometry) {
        return;
    }
    waypoints = waypoints || [];
    const sourceCoords = sourceObj.geometry.getCoordinates();
    const waypointCoords = waypoints.map(function(w) { return w && w.geometry ? w.geometry.getCoordinates() : null; }).filter(Boolean);
    const allCoords = [sourceCoords].concat(waypointCoords).concat([targetCoords]);
    var last = allCoords[allCoords.length - 1];
    if (sourceCoords[0] === last[0] && sourceCoords[1] === last[1] && waypointCoords.length === 0) {
        const zoom = myMap.getZoom();
        const offset = zoom < 12 ? 0.0001 : (zoom < 15 ? 0.00005 : 0.00002);
        allCoords[allCoords.length - 1] = [sourceCoords[0] + offset, sourceCoords[1] + offset];
    }
    const cableType = getEffectiveCableLayingType();
    const cableWidth = getCableWidth(cableType);
    if (cablePreviewLine) {
        cablePreviewLine.geometry.setCoordinates(allCoords);
        cablePreviewLine.options.set({
            strokeColor: '#3b82f6',
            strokeWidth: Math.max(cableWidth, 5),
            strokeOpacity: 0.9
        });
    } else {
        cablePreviewLine = new ymaps.Polyline(allCoords, {}, {
            strokeColor: '#3b82f6',
            strokeWidth: Math.max(cableWidth, 5),
            strokeOpacity: 0.9,
            strokeStyle: '12 6',
            zIndex: 1000,
            interactive: false
        });
        myMap.geoObjects.add(cablePreviewLine);
    }
}

function removeCablePreview() {
    if (cablePreviewLine) {
        myMap.geoObjects.remove(cablePreviewLine);
        cablePreviewLine = null;
    }
    
    if (hoveredObject) {
        clearHoverHighlight();
    }
}

function geoToClient(geoCoord) {
    if (!myMap || !geoCoord || geoCoord.length < 2) return null;
    try {
        const bounds = myMap.getBounds();
        if (!bounds || bounds.length < 2) return null;
        const rect = myMap.container.getElement().getBoundingClientRect();
        const minLat = Math.min(bounds[0][0], bounds[1][0]);
        const maxLat = Math.max(bounds[0][0], bounds[1][0]);
        const minLon = Math.min(bounds[0][1], bounds[1][1]);
        const maxLon = Math.max(bounds[0][1], bounds[1][1]);
        const lat = geoCoord[0];
        const lon = geoCoord[1];
        if (maxLat === minLat || maxLon === minLon) return null;
        const x = rect.left + (lon - minLon) / (maxLon - minLon) * rect.width;
        const y = rect.top + (maxLat - lat) / (maxLat - minLat) * rect.height;
        return [x, y];
    } catch (e) {
        return null;
    }
}

function clientToGeo(clientX, clientY) {
    if (!myMap) return null;
    try {
        const bounds = myMap.getBounds();
        if (!bounds || bounds.length < 2) return null;
        const rect = myMap.container.getElement().getBoundingClientRect();
        const minLat = Math.min(bounds[0][0], bounds[1][0]);
        const maxLat = Math.max(bounds[0][0], bounds[1][0]);
        const minLon = Math.min(bounds[0][1], bounds[1][1]);
        const maxLon = Math.max(bounds[0][1], bounds[1][1]);
        if (maxLat === minLat || maxLon === minLon) return null;
        const propX = (clientX - rect.left) / rect.width;
        const propY = (clientY - rect.top) / rect.height;
        const lon = minLon + propX * (maxLon - minLon);
        const lat = maxLat - propY * (maxLat - minLat);
        return [lat, lon];
    } catch (e) {
        return null;
    }
}

var rectSelectStart = null;
var rectSelectEnd = null;
var rectSelectOverlay = null;
var rectSelectPanel = null;

function setupRectSelection() {
    if (!myMap || !myMap.container) return;
    var container = myMap.container.getElement();
    var overlay = document.createElement('div');
    overlay.id = 'rectSelectOverlay';
    overlay.style.cssText = 'position:absolute;pointer-events:none;border:2px solid #3b82f6;background:rgba(59,130,246,0.15);display:none;z-index:1000;';
    container.style.position = 'relative';
    container.appendChild(overlay);
    rectSelectOverlay = overlay;

    var panel = document.createElement('div');
    panel.id = 'rectSelectPanel';
    panel.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:12px 16px;box-shadow:var(--shadow-md);z-index:1001;display:none;flex-direction:column;gap:8px;pointer-events:auto;';
    var mapArea = document.getElementById('mapAreaWrapper') || document.getElementById('map');
    if (mapArea) {
        mapArea.style.position = 'relative';
        mapArea.appendChild(panel);
    }
    rectSelectPanel = panel;

    container.addEventListener('mousedown', function(e) {
        if (e.button !== 2) return;
        e.preventDefault();
        if (objectPlacementMode || currentCableTool || splitterFiberRoutingMode || fiberRoutingMode) return;
        var geo = clientToGeo(e.clientX, e.clientY);
        if (!geo) return;
        rectSelectStart = { x: e.clientX, y: e.clientY, geo: geo };
        rectSelectEnd = null;
        overlay.style.left = (e.clientX - container.getBoundingClientRect().left) + 'px';
        overlay.style.top = (e.clientY - container.getBoundingClientRect().top) + 'px';
        overlay.style.width = '0';
        overlay.style.height = '0';
        overlay.style.display = 'block';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('wheel', onRectSelectWheel, { passive: false, capture: true });
    });

    var onRectSelectWheel = function(e) {
        if (rectSelectStart) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    var onMouseMove = function(e) {
        if (!rectSelectStart) return;
        e.preventDefault();
        var rect = container.getBoundingClientRect();
        var x1 = Math.min(rectSelectStart.x, e.clientX);
        var x2 = Math.max(rectSelectStart.x, e.clientX);
        var y1 = Math.min(rectSelectStart.y, e.clientY);
        var y2 = Math.max(rectSelectStart.y, e.clientY);
        overlay.style.left = (x1 - rect.left) + 'px';
        overlay.style.top = (y1 - rect.top) + 'px';
        overlay.style.width = (x2 - x1) + 'px';
        overlay.style.height = (y2 - y1) + 'px';
        rectSelectEnd = { x: e.clientX, y: e.clientY, geo: clientToGeo(e.clientX, e.clientY) };
    };

    var onMouseUp = function(e) {
        if (e.button !== 2) return;
        if (!rectSelectStart) return;
        e.preventDefault();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('wheel', onRectSelectWheel, { passive: false, capture: true });
        var geo2 = rectSelectEnd && rectSelectEnd.geo ? rectSelectEnd.geo : rectSelectStart.geo;
        var minLat = Math.min(rectSelectStart.geo[0], geo2[0]);
        var maxLat = Math.max(rectSelectStart.geo[0], geo2[0]);
        var minLon = Math.min(rectSelectStart.geo[1], geo2[1]);
        var maxLon = Math.max(rectSelectStart.geo[1], geo2[1]);
        var selected = getObjectsInRect(minLat, maxLat, minLon, maxLon);
        rectSelectStart = null;
        rectSelectEnd = null;
        overlay.style.display = 'none';

        if (selected.placemarks.length === 0 && selected.cables.length === 0) {
            return;
        }

        var counts = {};
        selected.placemarks.forEach(function(obj) {
            var t = obj.properties.get('type');
            if (t && t !== 'cableLabel') counts[t] = (counts[t] || 0) + 1;
        });
        counts.cable = selected.cables.length;

        var typeNames = { cross: 'Кроссов', node: 'Узлов', sleeve: 'Муфт', support: 'Опар', attachment: 'Креплений', olt: 'OLT', splitter: 'Сплиттеров', onu: 'ONU', camera: 'Камер', mediaConverter: 'Медиаконв.', cable: 'Кабелей' };
        var parts = [];
        Object.keys(counts).sort().forEach(function(k) {
            if (counts[k] > 0) parts.push(counts[k] + ' ' + (typeNames[k] || k));
        });
        panel.innerHTML = '<div style="font-size:0.875rem;color:var(--text-primary);margin-bottom:8px;">В выделенной области: ' + (parts.length ? parts.join(', ') : '—') + '</div>' +
            (isEditMode ? '<button type="button" class="btn-danger" id="rectSelectDeleteBtn" style="padding:8px 16px;font-size:0.875rem;">Удалить выделенное</button>' : '') +
            '<button type="button" class="btn-secondary" id="rectSelectCloseBtn" style="padding:8px 16px;font-size:0.875rem;">Закрыть</button>';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';

        var deleteBtn = document.getElementById('rectSelectDeleteBtn');
        if (deleteBtn && isEditMode) {
            deleteBtn.addEventListener('click', function() {
                var toDelete = selected.placemarks.concat(selected.cables);
                toDelete.forEach(function(obj) {
                    var t = obj.properties ? obj.properties.get('type') : null;
                    if (t === 'cable') {
                        var uid = obj.properties.get('uniqueId');
                        if (uid) deleteCableByUniqueId(uid);
                        else {
                            myMap.geoObjects.remove(obj);
                            objects = objects.filter(function(o) { return o !== obj; });
                        }
                    } else {
                        deleteObject(obj);
                    }
                });
                if (toDelete.length) {
                    saveData();
                    if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
                    if (typeof showInfo === 'function') showInfo('Удалено объектов: ' + toDelete.length, 'Удаление');
                }
                panel.style.display = 'none';
            });
        }

        var closeBtn = document.getElementById('rectSelectCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                panel.style.display = 'none';
            });
        }
    };

    container.addEventListener('contextmenu', function(e) {
        if (rectSelectStart) e.preventDefault();
    });
}

function getObjectsInRect(minLat, maxLat, minLon, maxLon) {
    var placemarks = [];
    var cables = [];
    if (!objects || !Array.isArray(objects)) return { placemarks: placemarks, cables: cables };

    function inRect(lat, lon) {
        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    }

    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel') {
            if (type === 'cableLabel') return;
            var geom = obj.geometry && obj.geometry.getCoordinates ? obj.geometry.getCoordinates() : null;
            if (!geom) return;
            var flat = normalizeCableGeometry(geom);
            if (!flat) return;
            var anyIn = flat.some(function(p) { return inRect(p[0], p[1]); });
            if (anyIn) cables.push(obj);
        } else {
            var coords = obj.geometry && obj.geometry.getCoordinates ? obj.geometry.getCoordinates() : null;
            if (coords && coords.length >= 2 && inRect(coords[0], coords[1])) {
                placemarks.push(obj);
            }
        }
    });

    return { placemarks: placemarks, cables: cables };
}

function normalizeCableGeometry(geom) {
    if (!Array.isArray(geom) || geom.length < 2) return null;
    var flat = [];
    function add(c) {
        if (Array.isArray(c) && c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
            flat.push([c[0], c[1]]);
        }
    }
    for (var i = 0; i < geom.length; i++) {
        var p = geom[i];
        if (Array.isArray(p) && p.length >= 2) {
            if (typeof p[0] === 'number') add(p);
            else if (Array.isArray(p[0])) for (var j = 0; j < p.length; j++) add(p[j]);
        }
    }
    return flat.length >= 2 ? flat : null;
}

function findRefClosestToCoord(refs, coord, tolerance, preferCableEndpoint, preferredUniqueId) {
    if (!Array.isArray(refs) || !coord || coord.length < 2) return null;
    tolerance = tolerance || 0.0005;
    if (preferredUniqueId) {
        for (var rp = 0; rp < refs.length; rp++) {
            var op = refs[rp];
            if (!op || !op.geometry || !op.properties) continue;
            if (op.properties.get('uniqueId') !== preferredUniqueId) continue;
            var cp = op.geometry.getCoordinates();
            if (!cp || cp.length < 2) continue;
            var dp = Math.sqrt(Math.pow(cp[0] - coord[0], 2) + Math.pow(cp[1] - coord[1], 2));
            if (dp < tolerance) return op;
        }
    }
    var best = null, bestDist = tolerance;
    var bestEndpoint = null, bestEndpointDist = tolerance;
    for (var r = 0; r < refs.length; r++) {
        var o = refs[r];
        if (!o || !o.geometry) continue;
        var c = o.geometry.getCoordinates();
        if (!c || c.length < 2) continue;
        var d = Math.sqrt(Math.pow(c[0] - coord[0], 2) + Math.pow(c[1] - coord[1], 2));
        if (d >= tolerance) continue;
        var t = o.properties && o.properties.get('type');
        if (preferCableEndpoint && (t === 'sleeve' || t === 'cross' || t === 'olt')) {
            if (d < bestEndpointDist) { bestEndpointDist = d; bestEndpoint = o; }
        }
        if (d < bestDist) { bestDist = d; best = o; }
    }
    if (preferCableEndpoint && bestEndpoint) return bestEndpoint;
    return best;
}

function findObjectsAtGeometry(refs, geometry, tolerance) {
    var geom = normalizeCableGeometry(geometry) || (Array.isArray(geometry) ? geometry : null);
    if (!Array.isArray(refs) || !geom || geom.length < 2) return null;
    tolerance = tolerance || 0.0003;
    var points = [];
    var last = null;
    for (var g = 0; g < geom.length; g++) {
        var coord = geom[g];
        if (!coord || coord.length < 2) continue;
        var best = null, bestDist = tolerance;
        for (var r = 0; r < refs.length; r++) {
            var o = refs[r];
            if (!o || !o.geometry) continue;
            var c = o.geometry.getCoordinates();
            if (!c || c.length < 2) continue;
            var d = Math.sqrt(Math.pow(c[0] - coord[0], 2) + Math.pow(c[1] - coord[1], 2));
            if (d < bestDist) { bestDist = d; best = o; }
        }
        if (best && best !== last) {
            points.push(best);
            last = best;
        }
    }
    return points.length >= 2 ? points : null;
}

/** Восстанавливает цепочку объектов маршрута кабеля: приоритет у routeUniqueIds (опоры/крепления), иначе по вершинам геометрии. */
function buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords) {
    if (!Array.isArray(refs) || !item) return null;
    if (Array.isArray(item.routeUniqueIds) && item.routeUniqueIds.length >= 2) {
        var route = [];
        for (var ri = 0; ri < item.routeUniqueIds.length; ri++) {
            var ruid = item.routeUniqueIds[ri];
            var found = null;
            for (var r = 0; r < refs.length; r++) {
                var o = refs[r];
                if (o && o.properties && o.properties.get('uniqueId') === ruid) {
                    found = o;
                    break;
                }
            }
            if (!found) return null;
            route.push(found);
        }
        if (fromObj) route[0] = fromObj;
        if (toObj) route[route.length - 1] = toObj;
        return route;
    }
    if (coords && coords.length > 2 && item.geometry != null) {
        var fg = findObjectsAtGeometry(refs, item.geometry);
        if (fg && fg.length >= 2) {
            if (fromObj) fg[0] = fromObj;
            if (toObj) fg[fg.length - 1] = toObj;
            return fg;
        }
    }
    return null;
}

function getCableSnapTolerance(zoom) {
    if (zoom == null) zoom = myMap.getZoom();
    return zoom < 12 ? 0.00025 : (zoom < 15 ? 0.000125 : 0.0000625);
}

function getCableAutoSelectTolerance(zoom) {
    if (zoom == null) zoom = myMap.getZoom();
    return zoom < 12 ? 0.000375 : (zoom < 15 ? 0.00025 : 0.000125);
}

function findObjectAtCoords(coords, tolerance = null) {
    
    if (tolerance === null) {
        
        const zoom = myMap.getZoom();
        
        tolerance = zoom < 12 ? 0.001 : (zoom < 15 ? 0.0005 : 0.00025);
    }

    let foundObject = objects.find(obj => {
        if (obj && obj.geometry && obj.properties) {
            const objType = obj.properties.get('type');
            if (objType !== 'cable' && objType !== 'cableLabel') {
                try {
                    const objCoords = obj.geometry.getCoordinates();
                    const latDiff = Math.abs(objCoords[0] - coords[0]);
                    const lonDiff = Math.abs(objCoords[1] - coords[1]);
                    return latDiff < tolerance && lonDiff < tolerance;
                } catch (error) {
                    return false;
                }
            }
        }
        return false;
    });

    if (!foundObject) {
        let minDistance = Infinity;
        objects.forEach(obj => {
            if (obj && obj.geometry && obj.properties) {
                const objType = obj.properties.get('type');
                if (objType !== 'cable' && objType !== 'cableLabel') {
                    try {
                        const objCoords = obj.geometry.getCoordinates();
                        const latDiff = Math.abs(objCoords[0] - coords[0]);
                        const lonDiff = Math.abs(objCoords[1] - coords[1]);
                        const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);

                        if (distance < tolerance * 2 && distance < minDistance) {
                            minDistance = distance;
                            foundObject = obj;
                        }
                    } catch (error) {
                        
                    }
                }
            }
        });
    }
    
    return foundObject || null;
}

function serializeOneObject(obj) {
    var idx = objects.indexOf(obj);
    if (idx < 0) return null;
    var arr = getSerializedData();
    return arr[idx] || null;
}

function getSerializedData() {
    return objects.map(obj => {
        if (obj.properties) {
            var t0 = obj.properties.get('type');
            if (t0 && t0 !== 'cable' && t0 !== 'cableLabel') ensurePlacemarkUniqueIdForSync(obj);
        }
        const props = obj.properties.getAll();
        var geometry = obj.geometry.getCoordinates();
        if (props.type === 'cable') {
            var cableGeom = normalizeCableGeometry(geometry) || geometry;
            const fromObj = props.from, toObj = props.to;
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: objects.indexOf(fromObj),
                to: objects.indexOf(toObj),
                geometry: cableGeom
            };
            if (fromObj && toObj && fromObj.properties && toObj.properties) {
                const fu = fromObj.properties.get('uniqueId');
                const tu = toObj.properties.get('uniqueId');
                if (fu) result.fromUniqueId = fu;
                if (tu) result.toUniqueId = tu;
            }
            if (props.uniqueId) result.uniqueId = props.uniqueId;
            if (props.distance !== undefined) result.distance = props.distance;
            result.cableName = props.cableName ?? null;
            if (!isCopperCableType(props.cableType)) {
                var fcSer = props.fiberCount;
                if (fcSer != null && fcSer !== '') result.fiberCount = parseInt(fcSer, 10);
                var fpSer = props.fiberPalette;
                if (Array.isArray(fpSer) && fpSer.length) result.fiberPalette = fpSer;
            }
            var ptsRoute = props.points;
            if (Array.isArray(ptsRoute) && ptsRoute.length > 2) {
                var routeIds = [];
                for (var pri = 0; pri < ptsRoute.length; pri++) {
                    var ptm = ptsRoute[pri];
                    var puid = ptm && ptm.properties && ptm.properties.get('uniqueId');
                    if (!puid) {
                        routeIds = null;
                        break;
                    }
                    routeIds.push(puid);
                }
                if (routeIds && routeIds.length === ptsRoute.length) result.routeUniqueIds = routeIds;
            }
            if (props.cableType === 'copper') {
                if (props.copperPortFrom != null && props.copperPortFrom !== '') result.copperPortFrom = props.copperPortFrom;
                if (props.copperPortTo != null && props.copperPortTo !== '') result.copperPortTo = props.copperPortTo;
                if (props.copperSwitchFromId) result.copperSwitchFromId = props.copperSwitchFromId;
                if (props.copperSwitchToId) result.copperSwitchToId = props.copperSwitchToId;
            }
            return result;
        }
        const result = {
            type: props.type,
            name: props.name,
            geometry: geometry
        };
        if (props.uniqueId) result.uniqueId = props.uniqueId;
        if (props.usedFibers) result.usedFibers = props.usedFibers;
        if (props.fiberConnections) result.fiberConnections = props.fiberConnections;
        if (props.fiberLabels) result.fiberLabels = props.fiberLabels;
        if (props.type === 'sleeve') {
            if (props.sleeveType) result.sleeveType = props.sleeveType;
            if (props.maxFibers !== undefined) result.maxFibers = props.maxFibers;
        }
        if (props.type === 'cross') {
            if (props.crossPorts) result.crossPorts = props.crossPorts;
            if (props.crossCopperPorts !== undefined && props.crossCopperPorts !== null) result.crossCopperPorts = props.crossCopperPorts;
            if (props.nodeConnections) result.nodeConnections = props.nodeConnections;
            if (props.fiberPorts) result.fiberPorts = props.fiberPorts;
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
            if (props.mediaConverterConnections) result.mediaConverterConnections = props.mediaConverterConnections;
            if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
        }
        if (props.type === 'sleeve') {
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
            if (props.mediaConverterConnections) result.mediaConverterConnections = props.mediaConverterConnections;
            if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
        }
        if (props.type === 'olt') {
            if (props.ponPorts !== undefined) result.ponPorts = props.ponPorts;
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            if (props.portAssignments) result.portAssignments = props.portAssignments;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
        }
        if (props.type === 'splitter') {
            if (props.splitRatio !== undefined) result.splitRatio = props.splitRatio;
            if (props.inputFiber) result.inputFiber = props.inputFiber;
            if (props.outputConnections) result.outputConnections = props.outputConnections;
        }
        if (props.type === 'onu') {
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
        }
        if (props.type === 'camera') {
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
            if (props.streamType && props.streamType !== 'none') result.streamType = props.streamType;
            else if (props.streamUrl) result.streamType = props.streamType || 'none';
            if (props.streamUrl) result.streamUrl = props.streamUrl;
            if (props.streamUser) result.streamUser = props.streamUser;
            if (props.streamPass) result.streamPass = props.streamPass;
            if (props.streamAutoplay === false) result.streamAutoplay = false;
            if (props.streamMuted === false) result.streamMuted = false;
            if (props.snapshotPhoto) result.snapshotPhoto = props.snapshotPhoto;
        }
        if (props.type === 'mediaConverter') {
            if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
            if (props.comment) result.comment = props.comment;
        }
        if (props.type === 'node') {
            if (props.nodeKind) result.nodeKind = props.nodeKind;
            if (props.comment) result.comment = props.comment;
            var attSw = props.attachedSwitches;
            if (Array.isArray(attSw) && attSw.length) result.attachedSwitches = JSON.parse(JSON.stringify(attSw));
        }
        if (props.type === 'switch') {
            if (props.parentNodeId) result.parentNodeId = props.parentNodeId;
            if (props.switchPortTypes) result.switchPortTypes = props.switchPortTypes;
            if (props.manufacturer) result.manufacturer = props.manufacturer;
            if (props.model) result.model = props.model;
        }
        return result;
    });
}

function saveData() {
    if (!inUndoRedo && lastSavedState !== null) {
        undoStack.push(JSON.parse(JSON.stringify(lastSavedState)));
        if (undoStack.length > UNDO_MAX) undoStack.shift();
        redoStack = [];
    }
    var data = getSerializedData();
    lastSavedState = JSON.parse(JSON.stringify(data));
    if (typeof window.syncSendState === 'function') window.syncSendState(data);
    if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
}

function performUndo() {
    if (!canEdit()) return;
    if (undoStack.length === 0) return;
    inUndoRedo = true;
    try {
        var stateToRestore = undoStack.pop();
        redoStack.push(JSON.parse(JSON.stringify(getSerializedData())));
        clearMap({ skipSave: true, skipHistory: true });
        importData(stateToRestore, { skipSave: true, skipHistory: true });
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        if (typeof window.syncSendState === 'function') window.syncSendState(lastSavedState);
        updateUndoRedoButtons();
        if (typeof showSuccess === 'function') showSuccess('Действие отменено', 'Отмена');
    } finally {
        inUndoRedo = false;
    }
}

function performRedo() {
    if (!canEdit()) return;
    if (redoStack.length === 0) return;
    inUndoRedo = true;
    try {
        var stateToRestore = redoStack.pop();
        undoStack.push(JSON.parse(JSON.stringify(getSerializedData())));
        clearMap({ skipSave: true, skipHistory: true });
        importData(stateToRestore, { skipSave: true, skipHistory: true });
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        if (typeof window.syncSendState === 'function') window.syncSendState(lastSavedState);
        updateUndoRedoButtons();
        if (typeof showSuccess === 'function') showSuccess('Действие повторено', 'Повтор');
    } finally {
        inUndoRedo = false;
    }
}

function updateUndoRedoButtons() {
    var undoBtn = document.getElementById('undoBtn');
    var redoBtn = document.getElementById('redoBtn');
    if (undoBtn) {
        undoBtn.disabled = undoStack.length === 0;
        undoBtn.title = undoStack.length === 0 ? 'Отмена (Ctrl+Z)' : 'Отменить (Ctrl+Z)';
    }
    if (redoBtn) {
        redoBtn.disabled = redoStack.length === 0;
        redoBtn.title = redoStack.length === 0 ? 'Повтор (Ctrl+Y)' : 'Повторить (Ctrl+Y)';
    }
}

function loadDataFromStorage() {
    
}

function applyMapStartFromSettings(mapStart, force) {
    if (!mapStart || !Array.isArray(mapStart.center) || mapStart.center.length < 2) return false;
    if (!force && window._mapStartApplied) return false;
    if (typeof myMap === 'undefined' || !myMap) {
        window._pendingMapStart = mapStart;
        return false;
    }
    try {
        myMap.setCenter(mapStart.center, mapStart.zoom || 15);
        window._mapStartApplied = true;
        window._pendingMapStart = null;
        return true;
    } catch (e) {
        return false;
    }
}
window.applyMapStartFromSettings = applyMapStartFromSettings;

function loadData() {
    loadGroupNamesFromStorage();
    loadCustomDeviceOptionsFromStorage();
    if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (!getApiBase()) {
        showNoApiMessage();
        markMapDataReady();
        return;
    }
    
    (function() {
        if (typeof AuthSystem !== 'undefined' && AuthSystem.refreshUsersFromApi) AuthSystem.refreshUsersFromApi();
        var token = getAuthToken();
        fetch(getApiBase() + '/api/history', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); }).then(function(b) {
            if (b && Array.isArray(b.history) && typeof window.setHistoryFromApi === 'function') window.setHistoryFromApi(b.history);
        }).catch(function() {});
        fetch(getApiBase() + '/api/settings', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r) { return r.json(); }).then(function(s) {
            if (!s) return;
            if (s.theme) try { document.documentElement.setAttribute('data-theme', s.theme); setTheme(s.theme); } catch (e) {}
            if (s.groupNames && typeof crossGroupNames !== 'undefined' && typeof nodeGroupNames !== 'undefined') {
                try {
                    if (s.groupNames.cross && typeof s.groupNames.cross === 'object') Object.keys(s.groupNames.cross).forEach(function(k) { crossGroupNames.set(k, s.groupNames.cross[k]); });
                    if (s.groupNames.node && typeof s.groupNames.node === 'object') Object.keys(s.groupNames.node).forEach(function(k) { nodeGroupNames.set(k, s.groupNames.node[k]); });
                    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
                    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
                } catch (e) {}
            }
            if (s.customDeviceOptions && typeof loadCustomDeviceOptions === 'function') loadCustomDeviceOptions(s.customDeviceOptions);
            if (typeof ensureDeviceCatalogsNonEmpty === 'function') ensureDeviceCatalogsNonEmpty();
            if (s.mapStart) {
                window._savedMapStart = s.mapStart;
                applyMapStartFromSettings(s.mapStart, true);
            }
        }).catch(function() {});
    })();
    setTimeout(function() {
        if (!_mapDataReady && !_mapStateReceived) markMapDataReady();
    }, 15000);
}

function showSyncRequiredOverlay() {
    if (_mapInitialLoadPending) return;
    if (window.syncIsConnected) return;
    var el = document.getElementById('syncRequiredOverlay');
    if (el) { el.style.display = 'flex'; return; }
    var wrapper = document.getElementById('mapAreaWrapper');
    if (!wrapper) return;
    el = document.createElement('div');
    el.id = 'syncRequiredOverlay';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.75);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99998;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;';
    el.innerHTML = '<div><h2 style="margin:0 0 12px;">Общая карта</h2><p style="margin:0 0 8px;">Подключение к совместной карте организации…</p><p style="margin:0;font-size:14px;opacity:0.9;">Подождите несколько секунд или обновите страницу.</p></div>';
    wrapper.appendChild(el);
}
function hideSyncRequiredOverlay() {
    var el = document.getElementById('syncRequiredOverlay');
    if (el) el.style.display = 'none';
}
window.showSyncRequiredOverlay = showSyncRequiredOverlay;
window.hideSyncRequiredOverlay = hideSyncRequiredOverlay;

var COLLABORATOR_CURSOR_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899'];

function updateCollaboratorCursors(cursors) {
    if (!myMap || !myMap.geoObjects) return;
    if (!cursors || cursors.length === 0) {
        collaboratorCursorsPlacemarks.forEach(function(pm) {
            try { myMap.geoObjects.remove(pm); } catch (e) {}
        });
        collaboratorCursorsPlacemarks = [];
        return;
    }
    var ids = cursors.map(function(c) { return c.id; }).join(',');
    var prevIds = collaboratorCursorsPlacemarks.length ? (collaboratorCursorsPlacemarks._ids || '') : '';
    if (ids === prevIds && collaboratorCursorsPlacemarks.length === cursors.length) {
        cursors.forEach(function(c, idx) {
            var pos = c.position;
            if (!Array.isArray(pos) || pos.length < 2) return;
            var pm = collaboratorCursorsPlacemarks[idx];
            if (pm && pm.geometry) try { pm.geometry.setCoordinates(pos); } catch (e) {}
        });
        return;
    }
    collaboratorCursorsPlacemarks.forEach(function(pm) {
        try { myMap.geoObjects.remove(pm); } catch (e) {}
    });
    collaboratorCursorsPlacemarks = [];
    collaboratorCursorsPlacemarks._ids = ids;
    cursors.forEach(function(c, idx) {
        var pos = c.position;
        if (!Array.isArray(pos) || pos.length < 2) return;
        var color = COLLABORATOR_CURSOR_COLORS[idx % COLLABORATOR_CURSOR_COLORS.length];
        var name = (c.displayName || 'Участник').toString().trim();
        var initial = name.charAt(0).toUpperCase();
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">' +
            '<circle cx="14" cy="14" r="12" fill="' + color + '" stroke="white" stroke-width="2"/>' +
            '<text x="14" y="18" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="sans-serif">' + initial + '</text>' +
            '</svg>';
        var dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
        var pm = new ymaps.Placemark(pos, {
            balloonContent: name,
            hintContent: name
        }, {
            iconLayout: 'default#image',
            iconImageHref: dataUrl,
            iconImageSize: [28, 28],
            iconImageOffset: [-14, -14],
            zIndex: 9998,
            cursor: 'default',
            interactive: true
        });
        myMap.geoObjects.add(pm);
        collaboratorCursorsPlacemarks.push(pm);
    });
}
window.updateCollaboratorCursors = updateCollaboratorCursors;

function showNoApiMessage() {
    var overlay = document.getElementById('noApiOverlay');
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'noApiOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;text-align:center;padding:20px;box-sizing:border-box;';
    overlay.innerHTML = '<div><h2 style="margin:0 0 12px;">Приложение работает только с сервером</h2><p style="margin:0 0 8px;">Запустите сервер: <code style="background:#333;padding:4px 8px;">npm run api</code></p><p style="margin:0;">Затем откройте <a href="http://localhost:3000" style="color:#6eb8ff;">http://localhost:3000</a></p></div>';
    document.body.appendChild(overlay);
}

function postHistoryToApi(history) {
    if (!getApiBase() || !Array.isArray(history)) return;
    fetch(getApiBase() + '/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
        body: JSON.stringify({ history: history })
    }).catch(function() {});
}

function applyRemoteState(data) {
    if (!Array.isArray(data)) {
        markMapDataReady();
        return;
    }
    _mapStateReceived = true;
    if (_mapInitialLoadPending && data.length > 0 && typeof setMapLoadingOverlayText === 'function') {
        setMapLoadingOverlayText('Загрузка объектов…');
    }
    try {
        collaboratorCursorsPlacemarks.forEach(function(pm) {
            try { if (myMap && myMap.geoObjects) myMap.geoObjects.remove(pm); } catch (e) {}
        });
        collaboratorCursorsPlacemarks = [];
        var opts = { skipSave: true, skipHistory: true };
        if (data.length === 0) {
            clearMap(opts);
            updateStats();
            lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
            if (window._savedMapStart && typeof applyMapStartFromSettings === 'function') {
                applyMapStartFromSettings(window._savedMapStart, true);
            }
            return;
        }
        importData(data, opts);
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        updateStats();
    } catch (e) {
        updateStats();
    } finally {
        markMapDataReady();
    }
}

function applyRemoteStateMerged(data) {
    var incomingCables = data.filter(function(i) { return i.type === 'cable'; });
    var incomingCableIds = {};
    incomingCables.forEach(function(c) { if (c.uniqueId != null) incomingCableIds[c.uniqueId] = true; });

    var refs = [];
    var refIndexByDataIndex = {};
    var i, item, existing, created, label;
    for (i = 0; i < data.length; i++) {
        item = data[i];
        if (item.type === 'cable') continue;
        existing = objects.find(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === item.uniqueId;
        });
        if (existing) {
            if (existing.geometry && item.geometry) existing.geometry.setCoordinates(item.geometry);
            if (item.name != null) existing.properties.set('name', item.name);
            label = existing.properties.get('label');
            if (label && label.geometry && item.geometry) label.geometry.setCoordinates(item.geometry);
            refs.push(existing);
        } else {
            created = createObjectFromData(item);
            if (created) refs.push(created);
        }
        refIndexByDataIndex[i] = refs.length - 1;
    }

    var toRemoveObjs = objects.filter(function(o) {
        var t = o.properties && o.properties.get('type');
        if (!t || t === 'cable' || t === 'cableLabel') return false;
        return refs.indexOf(o) === -1;
    });
    var toRemoveCables = objects.filter(function(o) {
        if (!o.properties || o.properties.get('type') !== 'cable') return false;
        if (!incomingCableIds[o.properties.get('uniqueId')]) return true;
        var from = o.properties.get('from');
        var to = o.properties.get('to');
        return toRemoveObjs.indexOf(from) !== -1 || toRemoveObjs.indexOf(to) !== -1;
    });

    toRemoveCables.forEach(function(cable) {
        myMap.geoObjects.remove(cable);
        objects = objects.filter(function(o) { return o !== cable; });
    });
    toRemoveObjs.forEach(function(obj) {
        label = obj.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} }
        var cablesToRemove = objects.filter(function(c) {
            return c.properties && c.properties.get('type') === 'cable' &&
                (c.properties.get('from') === obj || c.properties.get('to') === obj);
        });
        cablesToRemove.forEach(function(c) {
            myMap.geoObjects.remove(c);
            objects = objects.filter(function(o) { return o !== c; });
        });
        myMap.geoObjects.remove(obj);
        objects = objects.filter(function(o) { return o !== obj; });
    });

    incomingCables.forEach(function(item) {
        var coords = normalizeCableGeometry(item.geometry);
        var fromObj = null, toObj = null;
        
        if (item.fromUniqueId && item.toUniqueId) {
            fromObj = refs.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.fromUniqueId; });
            toObj = refs.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.toUniqueId; });
        }
        if (!fromObj || !toObj) {
            if (item.from != null && item.to != null) {
                var fromIdx = refIndexByDataIndex[item.from];
                var toIdx = refIndexByDataIndex[item.to];
                if (fromIdx != null && toIdx != null && fromIdx < refs.length && toIdx < refs.length) {
                    fromObj = fromObj || refs[fromIdx];
                    toObj = toObj || refs[toIdx];
                }
            }
        }
        if (!fromObj || !toObj) {
            if (coords && coords.length >= 2) {
                // Для ВОЛС при коллизии координат предпочитаем кросс/муфту/OLT; для меди концы —
                // узел, коммутатор, камера, МК. Иначе МК у кросса ошибочно привязывается к кроссу.
                var preferFiberEndpoint = item.cableType !== 'copper';
                fromObj = fromObj || findRefClosestToCoord(refs, coords[0], undefined, preferFiberEndpoint, item.fromUniqueId);
                toObj = toObj || findRefClosestToCoord(refs, coords[coords.length - 1], undefined, preferFiberEndpoint, item.toUniqueId);
            }
        }
        if (!fromObj || !toObj) return;
        var itemCuMetaMerge = copperSerializedMetaFromItem(item);
        var existingCable = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
        });
        if (existingCable) {
            var routeMerged = buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords);
            var pointsArr = routeMerged;
            if (!pointsArr || pointsArr.length < 2) {
                pointsArr = (coords && coords.length > 2) ? findObjectsAtGeometry(refs, item.geometry) : null;
            }
            if (!pointsArr || pointsArr.length < 2) pointsArr = [fromObj, toObj];
            else {
                if (fromObj) pointsArr[0] = fromObj;
                if (toObj) pointsArr[pointsArr.length - 1] = toObj;
            }
            existingCable.properties.set('from', pointsArr[0]);
            existingCable.properties.set('to', pointsArr[pointsArr.length - 1]);
            existingCable.properties.set('points', pointsArr);
            if (existingCable.geometry) {
                try {
                    var lineM = pointsArr.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (lineM.length >= 2) existingCable.geometry.setCoordinates(lineM);
                    else if (coords && coords.length >= 2) existingCable.geometry.setCoordinates(coords);
                } catch (eM) {}
            }
            if (item.distance !== undefined) existingCable.properties.set('distance', item.distance);
            if (item.cableName != null) existingCable.properties.set('cableName', item.cableName);
            applySerializedCopperMetadataToCable(existingCable, item);
            applyImportedCableFiberProps(existingCable, item);
        } else {
            var points = buildCableRoutePointsFromData(refs, item, fromObj, toObj, coords);
            if (!points || points.length < 2) {
                points = (coords && coords.length > 2) ? findObjectsAtGeometry(refs, item.geometry) : null;
            }
            if (points && points.length >= 2) {
                if (fromObj) points[0] = fromObj;
                if (toObj) points[points.length - 1] = toObj;
                addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true, itemCuMetaMerge);
            } else {
                addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true, itemCuMetaMerge);
            }
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
            });
            if (cable) {
                var ptNew = cable.properties.get('points');
                if (Array.isArray(ptNew) && ptNew.length >= 2) {
                    try {
                        var lineN = ptNew.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (cable.geometry && lineN.length >= 2) cable.geometry.setCoordinates(lineN);
                    } catch (eN) {}
                } else if (cable.geometry && coords && coords.length >= 2) cable.geometry.setCoordinates(coords);
                if (item.distance !== undefined) cable.properties.set('distance', item.distance);
                if (item.cableName != null) cable.properties.set('cableName', item.cableName);
                applyImportedCableFiberProps(cable, item);
            }
        }
    });

    updateCableVisualization();
    updateCrossDisplay();
    updateNodeDisplay();
    ensureNodeLabelsVisible();
    updateAllConnectionLines();
    updateStats();

    setTimeout(function() {
        incomingCables.forEach(function(item) {
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
            });
            if (!cable || !cable.geometry) return;
            var pts = cable.properties.get('points');
            if (Array.isArray(pts) && pts.length >= 2) {
                try {
                    var fromPts = pts.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (fromPts.length >= 2) cable.geometry.setCoordinates(fromPts);
                    return;
                } catch (eP) {}
            }
            var geom = normalizeCableGeometry(item.geometry);
            if (geom && geom.length >= 2) {
                cable.geometry.setCoordinates(geom);
            }
        });
        validateAndFixCableGeometryOnLoad();
        updateCableVisualization();
        
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
    }, 0);

    selectedObjects = selectedObjects.filter(function(o) { return objects.indexOf(o) !== -1; });
    selectedObjects.forEach(function(o) {
        var pulse = o.properties && o.properties.get('selectionPulse');
        if (!pulse && o.geometry) updateSelectionPulsePosition(o);
    });
}

function applyOperationToMap(op) {
    if (!op || !op.type) return;
    var objCount = 0;
    objects.forEach(function(o) {
        if (o.properties && o.properties.get('type') !== 'cable' && o.properties.get('type') !== 'cableLabel') objCount++;
    });
    if (op.type === 'add_object' && op.data) {
        var addUid = op.data.uniqueId;
        if (addUid != null && addUid !== '') {
            var existingAdd = objects.find(function(o) {
                var t = o.properties && o.properties.get('type');
                return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === addUid;
            });
            if (existingAdd) {
                if (op.data.geometry && existingAdd.geometry) existingAdd.geometry.setCoordinates(op.data.geometry);
                if (op.data.name != null) existingAdd.properties.set('name', op.data.name);
                var lblAdd = existingAdd.properties.get('label');
                if (lblAdd && lblAdd.geometry && op.data.geometry) lblAdd.geometry.setCoordinates(op.data.geometry);
                updateConnectedCables(existingAdd);
                updateCrossDisplay();
                updateNodeDisplay();
                updateAllConnectionLines();
                return;
            }
        }
        var newObj = createObjectFromData(op.data, { skipAddToObjects: true });
        if (!newObj) return;
        objects.splice(objCount, 0, newObj);
        if (newObj.properties.get('type') !== 'cross' && newObj.properties.get('type') !== 'node') myMap.geoObjects.add(newObj);
        updateCrossDisplay();
        updateNodeDisplay();
        ensureNodeLabelsVisible();
        updateAllConnectionLines();
        updateStats();
        return;
    }
    if (op.type === 'update_object' && op.uniqueId != null && op.data) {
        var obj = objects.find(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === op.uniqueId;
        });
        if (obj) {
            if (op.data.geometry && obj.geometry) obj.geometry.setCoordinates(op.data.geometry);
            if (op.data.name != null) {
                var opName = op.data.name;
                obj.properties.set('name', opName);
                var opType = obj.properties.get('type');
                if (opType === 'cross') {
                    obj.properties.set('balloonContent', opName ? 'Оптический кросс: ' + opName : 'Оптический кросс');
                } else if (opType === 'sleeve') {
                    obj.properties.set('balloonContent', opName ? 'Кабельная муфта: ' + opName : 'Кабельная муфта');
                } else if (opType === 'node') {
                    obj.properties.set('balloonContent', opName ? 'Узел сети: ' + opName : 'Узел сети');
                }
                if (typeof updateObjectLabel === 'function') updateObjectLabel(obj, opName);
            }
            var lbl = obj.properties.get('label');
            if (lbl && lbl.geometry && op.data.geometry) lbl.geometry.setCoordinates(op.data.geometry);
            updateConnectedCables(obj);
            updateCrossDisplay();
            updateNodeDisplay();
            updateAllConnectionLines();
            updateStats();
        }
        return;
    }
    if (op.type === 'delete_object' && op.uniqueId != null) {
        var toDel = objects.find(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel' && o.properties.get('uniqueId') === op.uniqueId;
        });
        if (toDel) deleteObject(toDel, { skipSync: true });
        return;
    }
    if (op.type === 'add_cable' && op.data) {
        var opCuMeta = copperSerializedMetaFromItem(op.data);
        var refsOpMap = objects.filter(function(o) {
            var t = o.properties && o.properties.get('type');
            return t && t !== 'cable' && t !== 'cableLabel';
        });
        var existingByOp = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
        var opCoordsNorm = op.data.geometry && normalizeCableGeometry(op.data.geometry);
        if (existingByOp) {
            var fromUidOp = op.data.fromUniqueId, toUidOp = op.data.toUniqueId;
            var fE = fromUidOp ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUidOp; }) : existingByOp.properties.get('from');
            var tE = toUidOp ? objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUidOp; }) : existingByOp.properties.get('to');
            if (!fE) fE = existingByOp.properties.get('from');
            if (!tE) tE = existingByOp.properties.get('to');
            var rE = buildCableRoutePointsFromData(refsOpMap, op.data, fE, tE, opCoordsNorm);
            if (rE && rE.length >= 2) {
                existingByOp.properties.set('from', rE[0]);
                existingByOp.properties.set('to', rE[rE.length - 1]);
                existingByOp.properties.set('points', rE);
                try {
                    var linE = rE.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                    if (existingByOp.geometry && linE.length >= 2) existingByOp.geometry.setCoordinates(linE);
                } catch (eExOp) {}
            } else if (existingByOp.geometry && opCoordsNorm && opCoordsNorm.length >= 2) {
                existingByOp.geometry.setCoordinates(opCoordsNorm);
            }
            if (op.data.distance !== undefined) existingByOp.properties.set('distance', op.data.distance);
            if (op.data.cableName != null) existingByOp.properties.set('cableName', op.data.cableName);
            if (op.data.cableType === 'copper' && opCuMeta) {
                if (opCuMeta.copperSwitchFromId) existingByOp.properties.set('copperSwitchFromId', opCuMeta.copperSwitchFromId);
                else existingByOp.properties.set('copperSwitchFromId', null);
                if (opCuMeta.copperSwitchToId) existingByOp.properties.set('copperSwitchToId', opCuMeta.copperSwitchToId);
                else existingByOp.properties.set('copperSwitchToId', null);
                existingByOp.properties.set('copperPortFrom', opCuMeta.copperPortFrom != null ? opCuMeta.copperPortFrom : null);
                existingByOp.properties.set('copperPortTo', opCuMeta.copperPortTo != null ? opCuMeta.copperPortTo : null);
                applyCopperCableOccupancyFromCable(existingByOp);
            }
            applyImportedCableFiberProps(existingByOp, op.data);
            updateCableVisualization();
            updateAllConnectionLines();
            updateStats();
            return;
        }
        var fromUid = op.data.fromUniqueId, toUid = op.data.toUniqueId;
        var fromObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUid; });
        var toObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUid; });
        if (fromObj && toObj) {
            var routeOp = buildCableRoutePointsFromData(refsOpMap, op.data, fromObj, toObj, opCoordsNorm);
            if (routeOp && routeOp.length >= 2) {
                addCable(routeOp[0], routeOp, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
            } else if (opCoordsNorm && opCoordsNorm.length > 2) {
                var ptsOp = findObjectsAtGeometry(refsOpMap, op.data.geometry);
                if (ptsOp && ptsOp.length >= 2) {
                    if (fromObj) ptsOp[0] = fromObj;
                    if (toObj) ptsOp[ptsOp.length - 1] = toObj;
                    addCable(ptsOp[0], ptsOp, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
                } else {
                    addCable(fromObj, toObj, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
                }
            } else {
                addCable(fromObj, toObj, op.data.cableType, op.data.uniqueId, undefined, true, true, opCuMeta);
            }
            var cable = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
            if (cable) {
                var ptOp = cable.properties.get('points');
                if (Array.isArray(ptOp) && ptOp.length >= 2) {
                    try {
                        var lOp = ptOp.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (cable.geometry && lOp.length >= 2) cable.geometry.setCoordinates(lOp);
                    } catch (eImpOp) {}
                } else if (cable.geometry && opCoordsNorm && opCoordsNorm.length >= 2) cable.geometry.setCoordinates(opCoordsNorm);
                if (op.data.distance !== undefined) cable.properties.set('distance', op.data.distance);
                if (op.data.cableName != null) cable.properties.set('cableName', op.data.cableName);
                applyImportedCableFiberProps(cable, op.data);
            }
            updateCableVisualization();
            updateAllConnectionLines();
            updateStats();
        }
        return;
    }
    if (op.type === 'update_cable' && op.uniqueId != null && op.data) {
        var cable = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.uniqueId; });
        if (cable) {
            var opCoords = normalizeCableGeometry(op.data.geometry);
            if (cable.geometry && opCoords && opCoords.length >= 2) cable.geometry.setCoordinates(opCoords);
            if (op.data.distance !== undefined) cable.properties.set('distance', op.data.distance);
            if (op.data.cableName != null) cable.properties.set('cableName', op.data.cableName);
            applyImportedCableFiberProps(cable, op.data);
            updateAllConnectionLines();
            updateStats();
        }
        return;
    }
    if (op.type === 'delete_cable' && op.uniqueId != null) {
        deleteCableByUniqueId(op.uniqueId, { skipSync: true });
    }
}
window.applyOperationToMap = applyOperationToMap;

function ensureNodeLabelsVisible() {
    objects.forEach(obj => {
        if (obj.properties) {
            const type = obj.properties.get('type');
            if (type && type !== 'cable' && type !== 'cableLabel') {
                const name = obj.properties.get('name') || '';
                updateObjectLabel(obj, name);
                var label = obj.properties.get('label');
                if (label && !myMap.geoObjects.indexOf || myMap.geoObjects.indexOf(label) === -1) {
                    try { myMap.geoObjects.add(label); } catch(e) {}
                }
            }
        }
    });
}

function importData(data, opts) {
    clearMap(opts || {});
    if (Array.isArray(data)) {
        data.forEach(function(item) {
            if (item && item.type && item.type !== 'cable' && (item.uniqueId == null || item.uniqueId === '')) {
                item.uniqueId = generateUniqueId(item.type);
            }
        });
    }
    
    const objectRefs = [];
    data.forEach(item => {
        if (item.type === 'cable') {
            objectRefs.push(null);
            return;
        }
        const obj = createObjectFromData(item);
        objectRefs.push(obj);
    });
    
    data.forEach((item, index) => {
            if (item.type !== 'cable') return;
            var refsOnly = objectRefs.filter(function(r) { return r != null; });
            var coords = normalizeCableGeometry(item.geometry);
            var fromObj = null, toObj = null;
            
            if (item.fromUniqueId && item.toUniqueId) {
                fromObj = refsOnly.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.fromUniqueId; });
                toObj = refsOnly.find(function(r) { return r.properties && r.properties.get('uniqueId') === item.toUniqueId; });
            }
            if (!fromObj || !toObj) {
                if (coords && coords.length >= 2) {
                    var preferFiberEpImp = item.cableType !== 'copper';
                    fromObj = fromObj || findRefClosestToCoord(refsOnly, coords[0], undefined, preferFiberEpImp, item.fromUniqueId);
                    toObj = toObj || findRefClosestToCoord(refsOnly, coords[coords.length - 1], undefined, preferFiberEpImp, item.toUniqueId);
                }
            }
            if (!fromObj || !toObj) {
                if (item.from === undefined || item.to === undefined || item.from >= objectRefs.length || item.to >= objectRefs.length) return;
                fromObj = objectRefs[item.from];
                toObj = objectRefs[item.to];
            }
            if (!fromObj || !toObj) return;
            var itemCuMeta = copperSerializedMetaFromItem(item);
            var existingCableImport = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId; });
            if (existingCableImport) {
                var routeExisting = buildCableRoutePointsFromData(refsOnly, item, fromObj, toObj, coords);
                var ptsArr = routeExisting;
                if (!ptsArr || ptsArr.length < 2) {
                    ptsArr = (coords && coords.length > 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : [fromObj, toObj];
                }
                if (ptsArr && ptsArr.length >= 2) {
                    if (fromObj) ptsArr[0] = fromObj;
                    if (toObj) ptsArr[ptsArr.length - 1] = toObj;
                    existingCableImport.properties.set('from', ptsArr[0]);
                    existingCableImport.properties.set('to', ptsArr[ptsArr.length - 1]);
                    existingCableImport.properties.set('points', ptsArr);
                    try {
                        var lineExisting = ptsArr.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (existingCableImport.geometry && lineExisting.length >= 2) existingCableImport.geometry.setCoordinates(lineExisting);
                        else if (existingCableImport.geometry && coords && coords.length >= 2) existingCableImport.geometry.setCoordinates(coords);
                    } catch (eEx) {}
                }
                if (item && 'cableName' in item) existingCableImport.properties.set('cableName', item.cableName);
                if (item.distance !== undefined) existingCableImport.properties.set('distance', item.distance);
                applySerializedCopperMetadataToCable(existingCableImport, item);
                applyImportedCableFiberProps(existingCableImport, item);
                return;
            }
            var routePts = buildCableRoutePointsFromData(refsOnly, item, fromObj, toObj, coords);
            if (routePts && routePts.length >= 2) {
                addCable(routePts[0], routePts, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
            } else {
                var points = (coords && coords.length > 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : null;
                if (points && points.length >= 2) {
                    if (fromObj) points[0] = fromObj;
                    if (toObj) points[points.length - 1] = toObj;
                    addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
                } else {
                    addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true, itemCuMeta);
                }
            }
            const cable = objects.find(obj =>
                obj.properties &&
                obj.properties.get('type') === 'cable' &&
                obj.properties.get('uniqueId') === item.uniqueId
            );
            if (cable) {
                var ptList = cable.properties.get('points');
                if (Array.isArray(ptList) && ptList.length >= 2) {
                    try {
                        var lineFromPts = ptList.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(function(c) { return c && c.length >= 2; });
                        if (cable.geometry && lineFromPts.length >= 2) cable.geometry.setCoordinates(lineFromPts);
                    } catch (eImp) {}
                } else if (cable.geometry && coords && coords.length >= 2) {
                    cable.geometry.setCoordinates(coords);
                }
                if (!cable.properties.get('distance')) {
                    const fromCoords = fromObj.geometry.getCoordinates();
                    const toCoords = toObj.geometry.getCoordinates();
                    const distance = calculateDistance(fromCoords, toCoords);
                    cable.properties.set('distance', distance);
                }
                if (item && 'cableName' in item) cable.properties.set('cableName', item.cableName);
                applyImportedCableFiberProps(cable, item);
            }
    });

    validateAndFixCableGeometryOnLoad();
    applyAllOpticalCableMapStyles();
    ensureNodeLabelsVisible();
    updateCableVisualization();
    updateCrossDisplay();
    updateNodeDisplay();
    updateAllConnectionLines();
    migrateStandaloneSwitchesIntoNodes();
    if (migrateNodeLevelSwitchMetaToAttached()) saveData();
    rebuildAllCopperPortUsageFromCables();
    if (window.CameraPlayer && CameraPlayer.startStreamMonitor) CameraPlayer.startStreamMonitor();
}

function createObjectFromData(data, opts) {
    const { type, name, geometry, usedFibers, fiberConnections, fiberLabels, fiberPorts, sleeveType, maxFibers, crossPorts, crossCopperPorts, copperPortUsage, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, uniqueId, nodeKind, manufacturer, model, comment, ponPorts, splitRatio, splitterConnections, incomingFiber, portAssignments, inputFiber, outputConnections, parentNodeId, switchPortTypes, attachedSwitches, streamType, streamUrl, streamUser, streamPass, streamAutoplay, streamMuted, snapshotPhoto } = data;
    
    var balloonContent;
    switch (type) {
        case 'support': balloonContent = name ? 'Опора связи: ' + name : 'Опора связи'; break;
        case 'sleeve': balloonContent = name ? 'Кабельная муфта: ' + name : 'Кабельная муфта'; break;
        case 'cross': balloonContent = 'Оптический кросс: ' + name; break;
        case 'node': balloonContent = 'Узел сети: ' + name; break;
        case 'attachment': balloonContent = name ? 'Крепление узлов: ' + name : 'Крепление узлов'; break;
        case 'olt': balloonContent = name ? 'OLT: ' + name : 'OLT (GPON)'; break;
        case 'splitter': balloonContent = name ? 'Сплиттер: ' + name : 'Сплиттер'; break;
        case 'onu': balloonContent = name ? 'ONU: ' + name : 'ONU'; break;
        case 'camera': balloonContent = name ? 'Камера: ' + name : 'Камера'; break;
        case 'mediaConverter': balloonContent = name ? 'Медиаконвертер: ' + name : 'Медиаконвертер'; break;
        case 'switch': balloonContent = name ? 'Коммутатор: ' + name : 'Коммутатор'; break;
        default: balloonContent = 'Объект';
    }

    var mapIcon = buildMapPlacemarkIcon(type, 'normal', { nodeKind: nodeKind || 'network' });
    if (!mapIcon) return null;

    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: mapIcon.href,
        iconImageSize: mapIcon.iconImageSize,
        iconImageOffset: mapIcon.iconImageOffset,
        draggable: isEditMode
    };
    
    const placemark = new ymaps.Placemark(geometry, {
        type: type,
        name: name,
        balloonContent: balloonContent
    }, placemarkOptions);
    
    if (type === 'node') {
        placemark.properties.set('nodeKind', nodeKind || 'network');
        if (comment) placemark.properties.set('comment', comment);
        if (Array.isArray(attachedSwitches) && attachedSwitches.length) {
            placemark.properties.set('attachedSwitches', JSON.parse(JSON.stringify(attachedSwitches)));
        } else {
            placemark.properties.set('attachedSwitches', []);
        }
    }

    if (type === 'node' || type === 'cross' || type === 'switch') {
        placemark.events.add('dragend', function() {
            const label = placemark.properties.get('label');
            const coords = placemark.geometry.getCoordinates();
            if (label && label.geometry) {
                label.geometry.setCoordinates(coords);
            }
            if (type === 'cross') updateCrossDisplay();
            if (type === 'node') updateNodeDisplay();
        });
    }

    if (uniqueId) {
        placemark.properties.set('uniqueId', uniqueId);
    } else {
        ensurePlacemarkUniqueIdForSync(placemark);
    }

    if (usedFibers) {
        placemark.properties.set('usedFibers', usedFibers);
    }

    if (fiberConnections) {
        placemark.properties.set('fiberConnections', fiberConnections);
    }

    if (fiberLabels) {
        placemark.properties.set('fiberLabels', fiberLabels);
    }

    if (type === 'sleeve') {
        if (sleeveType) {
            placemark.properties.set('sleeveType', sleeveType);
        }
        if (maxFibers !== undefined) {
            placemark.properties.set('maxFibers', maxFibers);
        }
    }

    if (type === 'cross') {
        if (crossPorts) {
            placemark.properties.set('crossPorts', crossPorts);
        }
        var ccpImp = crossCopperPorts !== undefined && crossCopperPorts !== null ? parseInt(crossCopperPorts, 10) : 0;
        placemark.properties.set('crossCopperPorts', isNaN(ccpImp) ? 0 : Math.max(0, ccpImp));
        if (copperPortUsage && typeof copperPortUsage === 'object') {
            placemark.properties.set('copperPortUsage', copperPortUsage);
        } else {
            placemark.properties.set('copperPortUsage', {});
        }
        if (nodeConnections) {
            placemark.properties.set('nodeConnections', nodeConnections);
        }
        if (fiberPorts) {
            placemark.properties.set('fiberPorts', fiberPorts);
        }
        if (oltConnections) {
            placemark.properties.set('oltConnections', oltConnections);
        }
        if (onuConnections) {
            placemark.properties.set('onuConnections', onuConnections);
        }
        if (mediaConverterConnections) {
            placemark.properties.set('mediaConverterConnections', mediaConverterConnections);
        }
        if (splitterConnections) {
            placemark.properties.set('splitterConnections', splitterConnections);
        }
    }
    if (type === 'sleeve') {
        if (oltConnections) {
            placemark.properties.set('oltConnections', oltConnections);
        }
        if (onuConnections) {
            placemark.properties.set('onuConnections', onuConnections);
        }
        if (mediaConverterConnections) {
            placemark.properties.set('mediaConverterConnections', mediaConverterConnections);
        }
        if (splitterConnections) {
            placemark.properties.set('splitterConnections', splitterConnections);
        }
    }
    if (type === 'olt') {
        placemark.properties.set('ponPorts', ponPorts || 8);
        placemark.properties.set('incomingFiber', incomingFiber || null);
        placemark.properties.set('portAssignments', portAssignments || {});
        if (manufacturer) placemark.properties.set('manufacturer', manufacturer);
        if (model) placemark.properties.set('model', model);
        if (comment) placemark.properties.set('comment', comment);
    }
    if (type === 'splitter') {
        placemark.properties.set('splitRatio', splitRatio || 8);
        placemark.properties.set('inputFiber', inputFiber || null);
        placemark.properties.set('outputConnections', outputConnections || []);
    }
    if (type === 'onu') {
        placemark.properties.set('incomingFiber', incomingFiber || null);
        if (manufacturer) placemark.properties.set('manufacturer', manufacturer);
        if (model) placemark.properties.set('model', model);
        if (comment) placemark.properties.set('comment', comment);
    }
    if (type === 'camera') {
        if (manufacturer) placemark.properties.set('manufacturer', manufacturer);
        if (model) placemark.properties.set('model', model);
        if (comment) placemark.properties.set('comment', comment);
        if (window.CameraPlayer) {
            CameraPlayer.applyCameraStreamConfig(placemark, {
                streamType: streamType || 'none',
                streamUrl: streamUrl || '',
                streamUser: streamUser || '',
                streamPass: streamPass || '',
                streamAutoplay: streamAutoplay !== false,
                streamMuted: streamMuted !== false
            });
        } else {
            placemark.properties.set('streamType', streamType || 'none');
            if (streamUrl) placemark.properties.set('streamUrl', streamUrl);
        }
        if (snapshotPhoto) {
            if (window.CameraPlayer) CameraPlayer.applyCameraSnapshot(placemark, snapshotPhoto);
            else if (/^data:image\/(jpeg|png|webp|gif);base64,/i.test(snapshotPhoto)) {
                placemark.properties.set('snapshotPhoto', snapshotPhoto);
            }
        }
    }
    if (type === 'mediaConverter') {
        placemark.properties.set('incomingFiber', incomingFiber || null);
        if (manufacturer) placemark.properties.set('manufacturer', manufacturer);
        if (model) placemark.properties.set('model', model);
        if (comment) placemark.properties.set('comment', comment);
    }
    if (type === 'switch') {
        placemark.properties.set('parentNodeId', parentNodeId || '');
        placemark.properties.set('switchPortTypes', Array.isArray(switchPortTypes) && switchPortTypes.length
            ? switchPortTypes.slice()
            : buildSwitchPortTypesArray(24, 'RJ45 10/100/1000'));
        placemark.properties.set('copperPortUsage', copperPortUsage && typeof copperPortUsage === 'object' ? copperPortUsage : {});
        if (manufacturer) placemark.properties.set('manufacturer', manufacturer);
        if (model) placemark.properties.set('model', model);
    }

    placemark.events.add('click', function(e) {
        e.preventDefault();
        e.stopPropagation(); 

        if (objectPlacementMode) {
            return;
        }

        if (splitterFiberRoutingMode && splitterFiberRoutingData) {
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === splitterFiberRoutingData.targetId) {
                completeSplitterFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                splitterFiberWaypoints.push(placemark);
                updateSplitterFiberPreview();
                return;
            }
            
            if (objId === getObjectUniqueId(splitterFiberRoutingData.splitterObj)) {
                splitterFiberWaypoints = [];
                updateSplitterFiberPreview();
                return;
            }
            
            var targetName = splitterFiberRoutingData.targetObj.properties.get('name') || (splitterFiberRoutingData.targetType === 'onu' ? 'ONU' : 'Сплиттер');
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }
        
        if (fiberRoutingMode && fiberRoutingData) {
            var objId = getObjectUniqueId(placemark);
            var objType = type;
            
            if (objId === fiberRoutingData.targetId) {
                completeFiberRouting();
                return;
            }
            
            if (objType === 'support' || objType === 'attachment') {
                fiberRoutingWaypoints.push(placemark);
                updateFiberRoutingPreview();
                return;
            }
            
            if (objId === getObjectUniqueId(fiberRoutingData.sleeveObj)) {
                fiberRoutingWaypoints = [];
                updateFiberRoutingPreview();
                return;
            }
            
            var targetName = getFiberRoutingTargetLabel(fiberRoutingData.targetType, fiberRoutingData.targetObj);
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (currentCableTool && isEditMode) {
            if (Date.now() < placementPanBlockClickUntil) {
                return;
            }
            var cableTypeVal = getEffectiveCableLayingType();
            if (handleCopperCablePlacemarkStep(placemark, type, cableTypeVal)) return;
            if (type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter') {
                showError('Нельзя прокладывать кабель ВОЛС от сплиттера, ONU, камеры или медиаконвертера. Кабель прокладывается между муфтой, кроссом, креплением или OLT.', 'Недопустимое действие');
                return;
            }
            var cableEndpointsPlacemark = ['cross', 'sleeve', 'support', 'attachment', 'olt'];
            if (cableEndpointsPlacemark.indexOf(type) !== -1) {
                if (!cableSource) {
                    if (type === 'support' || type === 'attachment') {
                        showError('Начало кабеля должно быть муфтой, кроссом или OLT. Опоры и крепления — только промежуточные точки.', 'Недопустимое действие');
                        return;
                    }
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    syncMapPanLockForEditTools();
                    return;
                }
                if (placemark === cableSource) {
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                if (type === 'support' || type === 'attachment') {
                    cableWaypoints.push(placemark);
                    clearSelection();
                    selectObject(cableSource);
                    return;
                }
                var points = [cableSource].concat(cableWaypoints).concat([placemark]);
                var success = createCableFromPoints(points, cableTypeVal);
                if (success) {
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
                    removeCablePreview();
                    syncMapPanLockForEditTools();
                }
                return;
            }
            if (type === 'node') {
                showError('Узел сети нельзя использовать для прокладки кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            return;
        }

        if ((type === 'node' || type === 'sleeve' || type === 'cross' || type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter' || type === 'switch')) {
            showObjectInfo(placemark);
            return;
        }

        if (type === 'support' || type === 'attachment') {
            if (isEditMode) {
                clearSelection();
                selectObject(placemark);
            }
            showSupportInfo(placemark);
            return;
        }

        if (!isEditMode) {
            return;
        }
        
        if (selectedObjects.includes(placemark)) {
            deselectObject(placemark);
        } else {
            selectObject(placemark);
        }
    });

    placemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            ensurePlacemarkUniqueIdForSync(placemark);
            var uid = placemark.properties.get('uniqueId');
            if (typeof window.syncSendOp === 'function' && uid) {
                window.syncSendOp({ type: 'update_object', uniqueId: uid, data: { geometry: placemark.geometry.getCoordinates(), name: placemark.properties.get('name') } });
            }
            updateConnectedCables(placemark);
            const label = placemark.properties.get('label');
            if (label) {
                label.geometry.setCoordinates(placemark.geometry.getCoordinates());
                try { myMap.geoObjects.add(label); } catch (e) {} 
            }
            updateAllConnectionLines();
            updateSelectionPulsePosition(placemark);
            saveData();
            if (typeof window.syncForceSendState === 'function' && typeof getSerializedData === 'function') {
                window.syncForceSendState(getSerializedData());
            }
        });

    placemark.events.add('drag', function() {
        if (!window.syncDragInProgress) window.syncDragInProgress = true;
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} }
        scheduleDragUpdate(placemark);
    });

    updateObjectLabel(placemark, name);
    if (type === 'camera') refreshCameraMapPresentation(placemark);

    attachHoverEventsToObject(placemark);
    if (!(opts && opts.skipAddToObjects)) {
        objects.push(placemark);
        if (type !== 'cross' && type !== 'node') {
            myMap.geoObjects.add(placemark);
        }
        var objLabel = placemark.properties.get('label');
        if (objLabel) {
            try { myMap.geoObjects.add(objLabel); } catch(e) {}
        }
        updateStats();
    }
    return placemark;
}

function exportData() {
    const data = objects.map(obj => {
        const props = obj.properties.getAll();
        const geometry = obj.geometry.getCoordinates();
        
        if (props.type === 'cable') {
            const fromObj = props.from, toObj = props.to;
            const result = {
                type: 'cable',
                cableType: props.cableType,
                from: objects.indexOf(fromObj),
                to: objects.indexOf(toObj),
                geometry: geometry
            };
            if (fromObj && toObj && fromObj.properties && toObj.properties) {
                const fu = fromObj.properties.get('uniqueId');
                const tu = toObj.properties.get('uniqueId');
                if (fu) result.fromUniqueId = fu;
                if (tu) result.toUniqueId = tu;
            }
            if (props.uniqueId) result.uniqueId = props.uniqueId;
            
            if (props.distance !== undefined) {
                result.distance = props.distance;
            }
            
            result.cableName = props.cableName ?? null;
            var ptsRouteEx = props.points;
            if (Array.isArray(ptsRouteEx) && ptsRouteEx.length > 2) {
                var routeIdsEx = [];
                for (var pxi = 0; pxi < ptsRouteEx.length; pxi++) {
                    var pex = ptsRouteEx[pxi];
                    var uidEx = pex && pex.properties && pex.properties.get('uniqueId');
                    if (!uidEx) {
                        routeIdsEx = null;
                        break;
                    }
                    routeIdsEx.push(uidEx);
                }
                if (routeIdsEx && routeIdsEx.length === ptsRouteEx.length) result.routeUniqueIds = routeIdsEx;
            }
            if (props.cableType === 'copper') {
                if (props.copperPortFrom != null && props.copperPortFrom !== '') result.copperPortFrom = props.copperPortFrom;
                if (props.copperPortTo != null && props.copperPortTo !== '') result.copperPortTo = props.copperPortTo;
                if (props.copperSwitchFromId) result.copperSwitchFromId = props.copperSwitchFromId;
                if (props.copperSwitchToId) result.copperSwitchToId = props.copperSwitchToId;
            }
            return result;
        } else {
            const result = {
                type: props.type,
                name: props.name,
                geometry: geometry
            };
            
            if (props.uniqueId) {
                result.uniqueId = props.uniqueId;
            }
            
            if (props.usedFibers) {
                result.usedFibers = props.usedFibers;
            }
            
            if (props.fiberConnections) {
                result.fiberConnections = props.fiberConnections;
            }
            
            if (props.fiberLabels) {
                result.fiberLabels = props.fiberLabels;
            }
            
            if (props.type === 'sleeve') {
                if (props.sleeveType) {
                    result.sleeveType = props.sleeveType;
                }
                if (props.maxFibers !== undefined) {
                    result.maxFibers = props.maxFibers;
                }
            }
            
            if (props.type === 'cross') {
                if (props.crossPorts) {
                    result.crossPorts = props.crossPorts;
                }
                if (props.crossCopperPorts !== undefined && props.crossCopperPorts !== null) {
                    result.crossCopperPorts = props.crossCopperPorts;
                }
                if (props.nodeConnections) {
                    result.nodeConnections = props.nodeConnections;
                }
                if (props.fiberPorts) {
                    result.fiberPorts = props.fiberPorts;
                }
                if (props.oltConnections) {
                    result.oltConnections = props.oltConnections;
                }
                if (props.onuConnections) {
                    result.onuConnections = props.onuConnections;
                }
                if (props.mediaConverterConnections) {
                    result.mediaConverterConnections = props.mediaConverterConnections;
                }
                if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
            }
            if (props.type === 'sleeve') {
                if (props.oltConnections) result.oltConnections = props.oltConnections;
                if (props.onuConnections) result.onuConnections = props.onuConnections;
                if (props.mediaConverterConnections) result.mediaConverterConnections = props.mediaConverterConnections;
                if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
            }
            if (props.type === 'olt') {
                if (props.ponPorts !== undefined) result.ponPorts = props.ponPorts;
                if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
                if (props.portAssignments) result.portAssignments = props.portAssignments;
            }
            if (props.type === 'splitter') {
                if (props.splitRatio !== undefined) result.splitRatio = props.splitRatio;
                if (props.inputFiber) result.inputFiber = props.inputFiber;
                if (props.outputConnections) result.outputConnections = props.outputConnections;
            }
            if (props.type === 'onu') {
                if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
            }
            if (props.type === 'camera') {
                if (props.manufacturer) result.manufacturer = props.manufacturer;
                if (props.model) result.model = props.model;
                if (props.comment) result.comment = props.comment;
            }
            if (props.type === 'mediaConverter') {
                if (props.incomingFiber) result.incomingFiber = props.incomingFiber;
                if (props.manufacturer) result.manufacturer = props.manufacturer;
                if (props.model) result.model = props.model;
                if (props.comment) result.comment = props.comment;
            }
            if (props.type === 'node') {
                var asEx = props.attachedSwitches;
                if (Array.isArray(asEx) && asEx.length) result.attachedSwitches = JSON.parse(JSON.stringify(asEx));
            }
            if (props.type === 'switch') {
                if (props.parentNodeId) result.parentNodeId = props.parentNodeId;
                if (props.switchPortTypes) result.switchPortTypes = props.switchPortTypes;
                if (props.manufacturer) result.manufacturer = props.manufacturer;
                if (props.model) result.model = props.model;
            }
            return result;
        }
    });
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'network-map-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showSuccess(`Карта экспортирована (${objects.length} объектов)`, 'Экспорт');
    logAction(ActionTypes.EXPORT_DATA, { count: objects.length });
}

function clearMap(opts) {
    opts = opts || {};
    if (window.CameraPlayer && CameraPlayer.stopStreamMonitor) CameraPlayer.stopStreamMonitor();
    const count = objects.length;
    myMap.geoObjects.removeAll();
    objects = [];
    selectedObjects = [];
    crossGroupPlacemarks = [];
    nodeGroupPlacemarks = [];
    if (!opts.skipSave) {
        saveData();
        if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
    }
    updateStats();
    
    if (count > 0 && !opts.skipHistory) {
        logAction(ActionTypes.CLEAR_MAP, { count: count });
    }
}

function setStatCount(el, value) {
    if (!el) return;
    var n = Number(value) || 0;
    el.textContent = String(n);
    var item = el.closest('.stat-item');
    if (item) item.classList.toggle('stat-item--empty', n === 0);
}

function updateStats() {
    const networkNodeCount = objects.filter(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'node') return false;
        return (obj.properties.get('nodeKind') || 'network') !== 'aggregation';
    }).length;
    const aggregationNodeCount = objects.filter(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'node') return false;
        return obj.properties.get('nodeKind') === 'aggregation';
    }).length;
    const supportCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'support').length;
    const sleeveCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'sleeve').length;
    const crossCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross').length;
    const oltCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'olt').length;
    const splitterCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'splitter').length;
    const onuCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'onu').length;
    const cameraCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'camera').length;
    const mediaConverterCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'mediaConverter').length;
    var switchCount = 0;
    objects.forEach(function(obj) {
        if (!obj || !obj.properties) return;
        if (obj.properties.get('type') === 'switch') switchCount++;
        if (obj.properties.get('type') === 'node') switchCount += getNodeAttachedSwitches(obj).length;
    });
    const cableCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cable').length;

    setStatCount(document.getElementById('networkNodeCount'), networkNodeCount);
    setStatCount(document.getElementById('aggregationNodeCount'), aggregationNodeCount);
    setStatCount(document.getElementById('supportCount'), supportCount);
    setStatCount(document.getElementById('sleeveCount'), sleeveCount);
    setStatCount(document.getElementById('crossCount'), crossCount);
    setStatCount(document.getElementById('oltCount'), oltCount);
    setStatCount(document.getElementById('splitterCount'), splitterCount);
    setStatCount(document.getElementById('onuCount'), onuCount);
    setStatCount(document.getElementById('cameraCount'), cameraCount);
    setStatCount(document.getElementById('mediaConverterCount'), mediaConverterCount);
    setStatCount(document.getElementById('switchCount'), switchCount);
    setStatCount(document.getElementById('cableCount'), cableCount);

    var statsTotalEl = document.getElementById('statsTotal');
    if (statsTotalEl) {
        var total = networkNodeCount + aggregationNodeCount + supportCount + sleeveCount + crossCount
            + oltCount + splitterCount + onuCount + cameraCount + mediaConverterCount + switchCount + cableCount;
        statsTotalEl.textContent = String(total);
    }
}

function showObjectInfo(obj) {
    var objType = obj && obj.properties ? obj.properties.get('type') : '';
    if (['node', 'olt', 'onu', 'camera', 'mediaConverter'].indexOf(objType) !== -1) {
        if (typeof populateDeviceDatalists === 'function') populateDeviceDatalists();
        if (objType !== 'node') {
            var mfr = obj.properties.get('manufacturer') || '';
            if (typeof populateModelDatalistForManufacturer === 'function') {
                var cat = 'node';
                if (objType === 'camera') cat = 'camera';
                else if (objType === 'mediaConverter') cat = 'node';
                else if (objType === 'olt') cat = 'olt';
                else if (objType === 'onu') cat = 'onu';
                populateModelDatalistForManufacturer(mfr, 'deviceModelsList', cat);
            }
        }
    }
    if (splitterFiberRoutingMode && splitterFiberRoutingData) {
        var objId = getObjectUniqueId(obj);
        var isSourceOrTarget = (objId === getObjectUniqueId(splitterFiberRoutingData.splitterObj)) ||
                               (objId === splitterFiberRoutingData.targetId);
        if (!isSourceOrTarget) {
            cancelSplitterFiberRouting();
        }
    }
    
    if (fiberRoutingMode && fiberRoutingData) {
        var objId = getObjectUniqueId(obj);
        var isSourceOrTarget = (objId === getObjectUniqueId(fiberRoutingData.sleeveObj)) ||
                               (objId === fiberRoutingData.targetId);
        if (!isSourceOrTarget) {
            cancelFiberRouting();
        }
    }
    
    currentModalObject = obj;
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';

    const connectedCables = getConnectedCables(obj);

    let title = '';
    if (type === 'node') {
        title = name ? `Узел сети: ${name}` : 'Узел сети';
    } else if (type === 'sleeve') {
        title = name ? `Кабельная муфта: ${name}` : 'Кабельная муфта';
    } else if (type === 'cross') {
        title = name ? `Оптический кросс: ${name}` : 'Оптический кросс';
    } else if (type === 'olt') {
        title = name ? `OLT: ${name}` : 'OLT (GPON)';
    } else if (type === 'splitter') {
        title = name ? `Сплиттер: ${name}` : 'Сплиттер';
    } else if (type === 'onu') {
        title = name ? `ONU: ${name}` : 'ONU';
    } else if (type === 'camera') {
        title = name ? `Камера: ${name}` : 'Камера';
    } else if (type === 'mediaConverter') {
        title = name ? `Медиаконвертер: ${name}` : 'Медиаконвертер';
    } else {
        title = 'Объект';
    }
    
    document.getElementById('modalTitle').textContent = title;
    updateInfoModalChrome(type, name);

    let html = '';

    if (type === 'olt') {
        html += buildOltCardContent(obj, isEditMode, name);
    }

    if (type === 'splitter') {
        const splitRatio = parseInt(obj.properties.get('splitRatio'), 10) || 8;
        const inputFiber = obj.properties.get('inputFiber') || null;
        const outputConnections = obj.properties.get('outputConnections') || [];
        const splitterCables = getConnectedCables(obj);
        const splitterFiberOptions = [];
        splitterCables.forEach(function(cable) {
            const cid = cable.properties.get('uniqueId') || ('cable-' + Date.now());
            if (!cable.properties.get('uniqueId')) cable.properties.set('uniqueId', cid);
            const cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
            const n = getFiberCount(cable);
            for (var fi = 1; fi <= n; fi++) {
                splitterFiberOptions.push({ cableId: cid, fiberNumber: fi, label: cableName + ', жила ' + fi, value: cid + '-' + fi });
            }
        });
        if (inputFiber && inputFiber.cableId && !splitterFiberOptions.some(function(o) { return o.value === (inputFiber.cableId + '-' + inputFiber.fiberNumber); })) {
            var inputCable = objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && getObjectUniqueId(c) === inputFiber.cableId; });
            if (inputCable) {
                var cid = getObjectUniqueId(inputCable);
                var cableName = inputCable.properties.get('cableName') || getCableDescription(inputCable.properties.get('cableType'));
                var n = getFiberCount(inputCable.properties.get('cableType'));
                for (var fi = 1; fi <= n; fi++) {
                    splitterFiberOptions.push({ cableId: cid, fiberNumber: fi, label: cableName + ', жила ' + fi + ' (вход)', value: cid + '-' + fi });
                }
            }
        }
        var effectiveInputFiber = obj.properties.get('inputFiber') || inputFiber || getSplitterRootInputFiber(obj) || null;
        var outputsPadded = (outputConnections || []).slice();
        while (outputsPadded.length < splitRatio) outputsPadded.push(null);
        if (outputsPadded.length > splitRatio) outputsPadded = outputsPadded.slice(0, splitRatio);
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Сплиттер</h4>';
        if (isEditMode) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editSplitterName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название сплиттера</label>';
            html += '<input type="text" id="editSplitterName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Введите название сплиттера">';
            html += '</div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Название:</strong> ' + escapeHtml(name) + '</div>';
        }
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem;">Коэффициент деления: 1:' + splitRatio + '</div>';
        if (effectiveInputFiber) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 6px;"><strong>Входная жила:</strong> кабель ' + escapeHtml(String(effectiveInputFiber.cableId).substring(0, 12)) + '…, жила ' + effectiveInputFiber.fiberNumber + '</div>';
        html += '</div>';
        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Вход и выходы</h4>';
            if (effectiveInputFiber) {
                html += '<div style="margin-bottom: 12px;"><span style="font-size: 0.8125rem; color: var(--text-secondary);">Входная жила задаётся с муфты/кросса (кнопка «Сплиттер» у жилы).</span>';
                html += '<div style="font-size: 0.875rem; color: var(--text-primary); margin-top: 4px;">' + escapeHtml(String(effectiveInputFiber.cableId).substring(0, 12)) + '…, жила ' + effectiveInputFiber.fiberNumber + '</div></div>';
            } else {
                html += '<div style="margin-bottom: 12px; font-size: 0.8125rem; color: var(--text-secondary);">Вход не задан. Подключите жилу с муфты или кросса — кнопка «Сплиттер» у нужной жилы.</div>';
            }
            if (effectiveInputFiber) {
                html += '<div style="margin-bottom: 8px; font-size: 0.8125rem; color: var(--text-secondary);">Одна жила делится на ' + splitRatio + ' — для каждого выхода выберите муфту/кросс и жилу, затем направьте на ONU или сплиттер.</div>';
                html += '<div id="splitterOutputsList">';
                for (var oi = 0; oi < splitRatio; oi++) {
                    var out = outputsPadded[oi] || null;
                    var destLabel = '';
                    var hasConnection = false;
                    if (out) {
                        var routeInfo = '';
                        var routeLen = (out.routeIds && out.routeIds.length) || (out.route && out.route.length) || 0;
                        if (routeLen > 0) {
                            routeInfo = ' (' + routeLen + ' точ.)';
                        }
                        if (out.onuId) {
                            var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out.onuId; });
                            destLabel = onuObj ? '→ ONU ' + escapeHtml(onuObj.properties.get('name') || 'ONU') + routeInfo : '';
                            hasConnection = !!onuObj;
                        } else if (out.splitterId) {
                            var spObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === out.splitterId; });
                            destLabel = spObj ? '→ Сплиттер ' + escapeHtml(spObj.properties.get('name') || '') + routeInfo : '';
                            hasConnection = !!spObj;
                        }
                    }
                    html += '<div class="splitter-output-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">';
                    html += '<span style="min-width: 72px; font-size: 0.8125rem; color: var(--text-primary);">Выход ' + (oi + 1) + '</span>';
                    if (!hasConnection) {
                        html += '<button type="button" class="btn-splitter-output-to-onu" data-output-index="' + oi + '" title="Пустить на ONU" style="padding: 4px 8px; background: #a855f7; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">📡 ONU</button>';
                        html += '<button type="button" class="btn-splitter-output-to-splitter" data-output-index="' + oi + '" title="Пустить на сплиттер" style="padding: 4px 8px; background: #f97316; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">🔀 Сплиттер</button>';
                    } else {
                        html += '<span style="font-size: 0.8rem; color: var(--text-secondary); padding: 4px 8px; background: var(--bg-tertiary); border-radius: 4px;">' + destLabel + '</span>';
                        html += '<button type="button" class="btn-splitter-output-delete" data-output-index="' + oi + '" title="Удалить соединение" style="padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">✕</button>';
                    }
                    html += '</div>';
                }
                html += '</div>';
            } else {
                html += '<div style="padding: 12px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a; color: #92400e; font-size: 0.8125rem;">⚠️ Сначала подключите входную жилу к сплиттеру с муфты или кросса, чтобы настроить выходы.</div>';
            }
            html += '</div>';
        }
    }

    if (type === 'onu') {
        const onuIncoming = obj.properties.get('incomingFiber') || null;
        const manufacturer = obj.properties.get('manufacturer') || '';
        const model = obj.properties.get('model') || '';
        const comment = obj.properties.get('comment') || '';
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">ONU</h4>';
        if (isEditMode) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editOnuName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название ONU</label>';
            html += '<input type="text" id="editOnuName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Введите название ONU">';
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Производитель</label><div class="device-combobox" data-catalog="onu" data-type="manufacturer" data-value-id="editOnuManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturer ? escapeHtml(manufacturer) : 'Выберите производителя') + '</button><input type="hidden" id="editOnuManufacturer" value="' + escapeHtml(manufacturer) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Модель</label><div class="device-combobox" data-catalog="onu" data-type="model" data-value-id="editOnuModel" data-manufacturer-id="editOnuManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (model ? escapeHtml(model) : 'Выберите модель') + '</button><input type="hidden" id="editOnuModel" value="' + escapeHtml(model) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Комментарий</label>';
            html += '<textarea id="editOnuComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(comment) + '</textarea></div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">Название: ' + escapeHtml(name) + '</div>';
        }
        if (manufacturer || model) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Устройство: ' + escapeHtml([manufacturer, model].filter(Boolean).join(' ') || '—') + '</div>';
        if (comment) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; white-space: pre-wrap; margin-top: 6px;">' + escapeHtml(comment) + '</div>';
        if (onuIncoming) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 6px;">Подключена жила: кабель ' + escapeHtml(String(onuIncoming.cableId).substring(0, 12)) + '…, жила ' + onuIncoming.fiberNumber + '</div>';
        html += '</div>';
    }

    if (type === 'camera') {
        html += buildCameraCardContent(obj, isEditMode, name);
    }

    if (type === 'mediaConverter') {
        const manufacturerMc = obj.properties.get('manufacturer') || '';
        const modelMc = obj.properties.get('model') || '';
        const commentMc = obj.properties.get('comment') || '';
        const mcIncoming = obj.properties.get('incomingFiber') || null;
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Медиаконвертер</h4>';
        html += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Оптический медиаконвертер на карте. Медный кабель к коммутатору — кнопка ниже (доступна после подключения оптической жилы с муфты или кросса). Волокно — кнопка «⇄ МК» у жилы в карточке муфты или кросса.</p>';
        if (isEditMode) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editMediaConverterName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название</label>';
            html += '<input type="text" id="editMediaConverterName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название медиаконвертера">';
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Производитель</label><div class="device-combobox" data-catalog="node" data-type="manufacturer" data-value-id="editMediaConverterManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (manufacturerMc ? escapeHtml(manufacturerMc) : 'Выберите производителя') + '</button><input type="hidden" id="editMediaConverterManufacturer" value="' + escapeHtml(manufacturerMc) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group" style="margin-bottom: 8px;"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Модель</label><div class="device-combobox" data-catalog="node" data-type="model" data-value-id="editMediaConverterModel" data-manufacturer-id="editMediaConverterManufacturer"><button type="button" class="device-combobox-trigger" aria-expanded="false" aria-haspopup="listbox">' + (modelMc ? escapeHtml(modelMc) : 'Выберите модель') + '</button><input type="hidden" id="editMediaConverterModel" value="' + escapeHtml(modelMc) + '"><div class="device-combobox-panel" role="listbox"><input type="text" class="device-combobox-search" placeholder="Поиск..." autocomplete="off"><ul class="device-combobox-list"></ul></div></div></div>';
            html += '<div class="form-group"><label style="font-size: 0.8125rem; color: var(--text-secondary);">Комментарий</label>';
            html += '<textarea id="editMediaConverterComment" class="form-input" rows="2" placeholder="Дополнительные сведения">' + escapeHtml(commentMc) + '</textarea></div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">Название: ' + escapeHtml(name) + '</div>';
        }
        if (manufacturerMc || modelMc) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 6px;">Устройство: ' + escapeHtml([manufacturerMc, modelMc].filter(Boolean).join(' ') || '—') + '</div>';
        if (commentMc) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; white-space: pre-wrap; margin-top: 6px;">' + escapeHtml(commentMc) + '</div>';
        if (mcIncoming) {
            const cMc = objects.find(function(c) {
                return c.properties && c.properties.get('type') === 'cable' && (c.properties.get('uniqueId') || '') === mcIncoming.cableId;
            });
            const mcDesc = cMc ? (cMc.properties.get('cableName') || getCableDescription(cMc.properties.get('cableType'))) : String(mcIncoming.cableId).substring(0, 12) + '…';
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 8px;">Входная жила (от муфты/кросса): ' + escapeHtml(mcDesc) + ', жила ' + mcIncoming.fiberNumber + '</div>';
        }
        if (isEditMode && mcIncoming && mcIncoming.cableId && !cameraHasCopperCable(obj)) {
            html += '<div style="margin-top: 16px; padding: 14px; background: linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #2dd4bf 100%); border-radius: 10px; border: 2px solid #0f766e; box-shadow: 0 4px 14px rgba(20, 184, 166, 0.45);">';
            html += '<div style="font-size: 0.8125rem; color: #ecfdf5; margin-bottom: 10px; font-weight: 600;">Медный кабель к коммутатору или камере</div>';
            html += '<button type="button" class="btn-copper-connect-from-media-converter" style="width: 100%; padding: 12px 16px; font-size: 0.9375rem; font-weight: 700; color: #0f172a; background: #f0fdfa; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.12);">🔌 Начать прокладку медного кабеля</button>';
            html += '</div>';
        }
        html += '</div>';
    }

    const fiberUsesWorkspace = (type === 'sleeve' || type === 'cross') && connectedCables.length >= 1;

    if (type === 'sleeve' && !fiberUsesWorkspace) {
        const storedSleeveType = obj.properties.get('sleeveType');
        const sleeveTypeLabel = storedSleeveType ? String(storedSleeveType) : 'Не указан';
        const maxFibers = obj.properties.get('maxFibers');
        const usedFibers = getTotalUsedFibersInSleeve(obj);
        
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация о муфте</h4>';
        if (name) html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Название:</strong> ${escapeHtml(name)}</div>`;
        html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Тип муфты:</strong> ${escapeHtml(sleeveTypeLabel)}</div>`;
        
        if (maxFibers !== undefined && maxFibers !== null && maxFibers > 0) {
            const usagePercent = Math.round((usedFibers / maxFibers) * 100);
            const isOverloaded = usedFibers > maxFibers;
            const statusColor = isOverloaded ? '#dc2626' : (usagePercent >= 80 ? '#f59e0b' : '#22c55e');
            
            html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">`;
            html += `<strong>Вместимость:</strong> <span style="color: ${statusColor}; font-weight: 600;">${usedFibers}/${maxFibers} волокон</span> (${usagePercent}%)`;
            if (isOverloaded) {
                html += ` <span style="color: #dc2626; font-weight: 600;">⚠ Превышена вместимость!</span>`;
            }
            html += `</div>`;
        } else {
            html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Использовано волокон:</strong> ${usedFibers}</div>`;
        }
        
        html += '</div>';
        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Редактирование муфты</h4>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editSleeveName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название муфты</label>';
            html += `<input type="text" id="editSleeveName" class="form-input" value="${escapeHtml(name)}" placeholder="Введите название муфты">`;
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editSleeveType" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Тип муфты</label>';
            html += '<select id="editSleeveType" class="form-select">' + getSleeveTypeSelectOptionsHtml(storedSleeveType ? String(storedSleeveType) : '') + '</select>';
            html += '<p style="font-size: 0.7rem; color: var(--text-muted); margin: 8px 0 0 0;">Вместимость пересчитывается по выбранному типу; для «Пользовательская» лимита нет (как при добавлении муфты).</p>';
            html += '</div>';
            html += '</div>';
        }
    }

    if (type === 'node') {
        html += buildNodeCardContent(obj, isEditMode, name);
    }

    if (type === 'cross' && !fiberUsesWorkspace) {
        const crossPorts = Math.max(1, parseInt(obj.properties.get('crossPorts'), 10) || 24);
        const usedPorts = getTotalUsedPortsInCross(obj);
        const usagePercent = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
        const statusColor = usedPorts > crossPorts ? '#dc2626' : (usagePercent >= 80 ? '#f59e0b' : '#22c55e');

        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация о кроссе</h4>';
        html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Количество портов:</strong> ${crossPorts}</div>`;
        html += `<div style="color: var(--text-secondary); font-size: 0.875rem;"><strong>Использовано:</strong> <span style="color: ${statusColor}; font-weight: 600;">${usedPorts}/${crossPorts} портов</span> (${usagePercent}%)</div>`;
        html += '</div>';

        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Редактирование кросса</h4>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editCrossName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название кросса</label>';
            html += `<input type="text" id="editCrossName" class="form-input" value="${escapeHtml(name)}" placeholder="Введите название кросса">`;
            html += '</div>';
            html += '</div>';
        }
    }

    if (isEditMode && !fiberUsesWorkspace && type !== 'node') {
        html += '<div class="object-actions-section" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 8px;">';
        html += '<button id="saveChangesBtn" class="btn-primary" style="flex: 1; min-width: 140px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
        html += ' Сохранить</button>';
        html += '<button id="duplicateCurrentObject" class="btn-secondary" style="flex: 1; min-width: 120px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button id="deleteCurrentObject" class="btn-danger" style="flex: 1; min-width: 120px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }

    if (type !== 'camera' && type !== 'olt' && type !== 'node') {
    if (connectedCables.length === 0) {
        const noCablesText = 'К этому объекту не подключено кабелей';
        html += '<div class="no-cables" style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.875rem;">' + noCablesText + '</div>';
    } else {
        
        if ((type === 'sleeve' || type === 'cross') && connectedCables.length >= 1) {
            html += renderFiberConnectionsVisualization(obj, connectedCables);
        } else {
            
            connectedCables.forEach((cable, index) => {
                const cableType = cable.properties.get('cableType');
                const cableDescription = getCableDescription(cableType, cable);
                const fibers = getFiberColors(cable);
                const cableFiberN = getFiberCount(cable);
                
                let cableUniqueId = cable.properties.get('uniqueId');
                if (!cableUniqueId) {
                    cableUniqueId = `cable-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    cable.properties.set('uniqueId', cableUniqueId);
                }
                
                html += `
                    <div class="cable-info" data-cable-id="${cableUniqueId}">
                        <div class="cable-header">
                            <h4>Кабель ${index + 1}: ${cableDescription}</h4>
                            <div class="cable-actions">
                                ${isEditMode ? (cableType === 'copper' ? `<span class="cable-type-label-muted">${escapeHtml(cableDescription)}</span>` : `<span class="cable-actions-toolbar"><input type="number" class="cable-fiber-count-input form-input" data-cable-id="${cableUniqueId}" min="1" max="96" value="${cableFiberN}" title="Число жил" aria-label="Число жил"><button type="button" class="btn-secondary btn-cable-palette-edit" data-cable-id="${cableUniqueId}" title="Цвета жил">${window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета'}</button></span>`) : `<span class="cable-type-label-muted">${escapeHtml(cableDescription)}</span>`}
                                ${isEditMode ? `<button class="btn-delete-cable" data-cable-id="${cableUniqueId}" title="Удалить кабель">✕</button>` : ''}
                            </div>
                        </div>
                        <div class="fibers-list">
                `;

                const usedFibers = getUsedFibers(obj, cableUniqueId);
                
                fibers.forEach((fiber, fiberIndex) => {
                    const isUsed = usedFibers.includes(fiber.number);
                    html += `
                        <div class="fiber-item ${isUsed ? 'fiber-used' : 'fiber-free'}" 
                             data-cable-id="${cableUniqueId}" 
                             data-fiber-number="${fiber.number}">
                            <div class="fiber-item-content">
                                <div class="fiber-color" style="background-color: ${fiber.color}; ${isUsed ? 'opacity: 0.5; border: 2px dashed #dc2626;' : (fiber.hasBlackRing ? 'border: 2px solid #000;' : '')}"></div>
                                <span class="fiber-label">Жила ${fiber.number}: ${fiber.name} ${isUsed ? '<span class="fiber-status">(используется)</span>' : '<span class="fiber-status fiber-free-text">(свободна)</span>'}</span>
                            </div>
                            ${!isUsed && isEditMode && type !== 'sleeve' && type !== 'cross' && type !== 'olt' && type !== 'splitter' && type !== 'onu' && type !== 'camera' && type !== 'mediaConverter' ? `<button class="btn-continue-cable" data-cable-id="${cableUniqueId}" data-fiber-number="${fiber.number}" title="Продолжить кабель с этой жилой">→</button>` : ''}
                        </div>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });
        }
    }
    }

    document.getElementById('modalInfo').innerHTML = html;

    const modal = document.getElementById('infoModal');
    const modalContent = modal && modal.querySelector('.modal-content');
    if (modalContent) {
        if (type === 'cross' || type === 'sleeve') modalContent.classList.add('fiber-management-modal');
        else modalContent.classList.remove('fiber-management-modal');
    }
    if (modal) {
        if (type === 'cross' || type === 'sleeve') modal.classList.add('fiber-management-modal-open');
        else modal.classList.remove('fiber-management-modal-open');
    }
    
    setupModalEventListeners();
    setupEditAndDeleteListeners();
    var modalInfo = document.getElementById('modalInfo');
    if (modalInfo) initDeviceComboboxes(modalInfo);
    if (type === 'camera' && modalInfo) {
        if (modalInfo.querySelector('.trace-show-on-map-btn')) attachTraceShowOnMapHandlers(modalInfo);
        if (window.CameraPlayer) {
            CameraPlayer.initCameraCard(modalInfo, obj, {
                isEditMode: isEditMode,
                getObj: function() { return currentModalObject; }
            });
        }
    }
    modal.style.display = 'flex';
    modal.classList.add('modal--centered');
    if (typeof window.initPanelPlexusCanvases === 'function') {
        requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
    }

    if ((type === 'sleeve' || type === 'cross') && savedFiberConnectionsScrollPos) {
        var saved = savedFiberConnectionsScrollPos;
        savedFiberConnectionsScrollPos = null;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                var schemeWrap = document.getElementById('fiber-scheme-viewport');
                var tableWrap = document.querySelector('.cross-fiber-table-wrap');
                if (schemeWrap && saved.scheme != null) schemeWrap.scrollTop = saved.scheme;
                if (tableWrap && saved.table != null) tableWrap.scrollTop = saved.table;
            });
        });
    }
}

function getSupportWaypointCopy(isAttachment) {
    return {
        typeLabel: isAttachment ? 'Крепление узлов' : 'Опора связи',
        heroHint: isAttachment
            ? 'Точка крепления на линии кабеля. Можно разрезать ВОЛС и установить муфту.'
            : 'Промежуточная точка линии ВОЛС. Можно разрезать кабель и установить муфту на маршруте.',
        nameLabel: isAttachment ? 'Название' : 'Подпись',
        editPlaceholder: isAttachment ? 'Например: стена А' : 'Например: № 15',
        noCablesMsg: isAttachment ? 'Через это крепление не проходит ни один кабель' : 'Через эту опору не проходит ни один кабель',
        splitWaypoint: isAttachment ? 'Крепление' : 'Опора'
    };
}

function buildSupportCardContent(supportObj, isEditMode) {
    var connectedCables = getCablesThroughSupport(supportObj);
    var supportName = supportObj.properties.get('name') || '';
    var waypointType = supportObj.properties.get('type');
    var isAttachment = waypointType === 'attachment';
    var copy = getSupportWaypointCopy(isAttachment);
    var mapType = isAttachment ? 'attachment' : 'support';
    var coords = supportObj.geometry.getCoordinates();
    var html = '<div class="support-card support-card--' + mapType + '">';

    html += '<section class="object-card-section support-card-hero">';
    html += '<div class="support-card-hero-row">';
    if (window.MapIcons) {
        html += '<div class="support-card-hero-icon" aria-hidden="true">' + MapIcons.buildIconSvg(mapType, { variant: 'normal' }) + '</div>';
    }
    html += '<div class="support-card-hero-text">';
    html += '<div class="support-card-view-name">' + escapeHtml(supportName || (isAttachment ? 'Без названия' : 'Без подписи')) + '</div>';
    html += '<div class="support-card-view-meta">' + escapeHtml(copy.typeLabel) + '</div>';
    html += '<p class="object-card-hint support-card-hero-hint">' + copy.heroHint + '</p>';
    html += '</div></div>';
    html += '<dl class="support-card-stats">';
    html += '<div class="support-card-stat"><dt>Широта</dt><dd>' + coords[0].toFixed(6) + '</dd></div>';
    html += '<div class="support-card-stat"><dt>Долгота</dt><dd>' + coords[1].toFixed(6) + '</dd></div>';
    html += '<div class="support-card-stat"><dt>Кабелей</dt><dd>' + connectedCables.length + '</dd></div>';
    html += '</dl></section>';

    if (isEditMode) {
        html += '<section class="object-card-section">';
        html += '<h4 class="object-card-section-title">' + (isAttachment ? 'Редактирование' : 'Подпись опоры') + '</h4>';
        html += '<div class="form-group"><label for="editSupportName" class="object-card-label">' + copy.nameLabel + '</label>';
        html += '<input type="text" id="editSupportName" class="form-input" value="' + escapeHtml(supportName) + '" placeholder="' + escapeHtml(copy.editPlaceholder) + '">';
        html += '</div>';
        html += '<button type="button" id="saveSupportEdit" class="btn-primary support-card-save-btn">Сохранить</button>';
        html += '</section>';
    }

    var splittableAtSupport = isEditMode ? getSplittableFiberCablesAtWaypoint(supportObj) : [];
    if (splittableAtSupport.length) {
        html += '<section class="object-card-section object-card-section--split cable-split-section">';
        html += '<h4 class="object-card-section-title cable-split-section__title">Муфта на маршруте</h4>';
        html += '<p class="object-card-hint cable-split-section__desc">Выберите тип муфты и кабель для разделения. ' + copy.splitWaypoint + ' останется в маршруте обоих сегментов.</p>';
        html += buildCableSplitSleeveFieldsHtml();
        html += '<div class="cable-split-pick-list">';
        splittableAtSupport.forEach(function(cable) {
            var cid = cable.properties.get('uniqueId');
            html += '<button type="button" class="btn-secondary btn-cable-split-pick btn-split-cable-at-waypoint" data-cable-id="' + escapeHtml(cid) + '">';
            html += 'Разделить: ' + escapeHtml(getCableSplitLabel(cable));
            html += '</button>';
        });
        html += '</div></section>';
    }

    html += '<section class="object-card-section object-card-section--cables">';
    html += '<div class="object-card-section-head">';
    html += '<h4 class="object-card-section-title">Проходящие кабели</h4>';
    html += '<span class="object-card-badge">' + connectedCables.length + '</span>';
    html += '</div>';

    if (connectedCables.length === 0) {
        html += '<p class="object-card-hint object-card-hint--warn">' + copy.noCablesMsg + '</p>';
    } else {
        html += '<div class="support-cable-list">';
        connectedCables.forEach(function(cable, index) {
            var cableType = cable.properties.get('cableType');
            var cableDescription = getCableDescription(cableType, cable);
            var cableName = cable.properties.get('cableName') || '';
            var cableColor = getCableColor(cableType);
            var isCopper = cableType === 'copper';
            var fibers = isCopper ? [] : getFiberColors(cable);
            var distance = cable.properties.get('distance');
            var fromObj = cable.properties.get('from');
            var toObj = cable.properties.get('to');
            var fromName = fromObj ? (fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type'))) : '—';
            var toName = toObj ? (toObj.properties.get('name') || getObjectTypeName(toObj.properties.get('type'))) : '—';
            var title = (cableName ? escapeHtml(cableName) : ('Кабель ' + (index + 1))) + ': ' + escapeHtml(cableDescription);

            html += '<article class="support-cable-item" style="--cable-accent:' + escapeHtml(cableColor) + '">';
            html += '<div class="support-cable-item-head"><h5 class="support-cable-item-title">' + title + '</h5></div>';
            html += '<div class="support-cable-route"><span class="support-cable-route-label">Маршрут</span> ';
            html += '<span class="support-cable-route-path">' + escapeHtml(fromName) + ' → ' + escapeHtml(toName);
            if (distance) html += ' <span class="support-cable-route-dist">(' + distance + ' м)</span>';
            html += '</span></div>';
            if (isCopper) {
                html += '<p class="support-cable-copper-note">Медный кабель · жилы не отображаются</p>';
            } else if (fibers.length) {
                html += '<div class="support-fiber-chips">';
                fibers.forEach(function(fiber) {
                    var chipClass = 'support-fiber-chip';
                    if (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') {
                        chipClass += ' support-fiber-chip--light';
                    }
                    html += '<span class="' + chipClass + '" title="' + escapeHtml(fiber.name || '') + '">';
                    html += '<span class="support-fiber-chip-dot" style="background:' + fiber.color + ';border-color:' + (fiber.hasBlackRing ? '#000' : 'rgba(0,0,0,0.25)') + '"></span>';
                    html += '<span class="support-fiber-chip-num">' + fiber.number + '</span>';
                    html += '</span>';
                });
                html += '</div>';
            }
            html += '</article>';
        });
        html += '</div>';
    }
    html += '</section>';

    if (isEditMode) {
        html += '<div class="object-actions-section support-card-actions">';
        html += '<button type="button" id="duplicateCurrentObject" class="btn-secondary">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button type="button" id="deleteCurrentObject" class="btn-danger">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function showSupportInfo(supportObj) {
    currentModalObject = supportObj;

    var supportName = supportObj.properties.get('name') || '';
    var waypointType = supportObj.properties.get('type');
    var isAttachment = waypointType === 'attachment';
    var copy = getSupportWaypointCopy(isAttachment);

    document.getElementById('modalTitle').textContent = supportName ? (copy.typeLabel + ': ' + supportName) : copy.typeLabel;
    updateInfoModalChrome(waypointType, supportName);

    var modalInfoEl = document.getElementById('modalInfo');
    modalInfoEl.innerHTML = buildSupportCardContent(supportObj, isEditMode);
    bindCableSplitSleeveFields(modalInfoEl);

    resetInfoModalFiberLayout();
    var modal = document.getElementById('infoModal');
    setupEditAndDeleteListeners();
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('modal--centered');
        if (typeof window.initPanelPlexusCanvases === 'function') {
            requestAnimationFrame(function () { window.initPanelPlexusCanvases(modal); });
        }
    }
}

/** Обновить карточку объекта: опора и крепление — через showSupportInfo, остальные — showObjectInfo. */
function refreshObjectModal(obj) {
    if (!obj || !obj.properties) return;
    var t = obj.properties.get('type');
    if (t === 'support' || t === 'attachment') showSupportInfo(obj);
    else showObjectInfo(obj);
}

function setupEditAndDeleteListeners() {
    bindModalObjectNameEditors();
    if (!window._modalSwitchCatalogDelegates) {
        var modalRoot = document.getElementById('infoModal');
        if (modalRoot) {
            window._modalSwitchCatalogDelegates = true;
            modalRoot.addEventListener('input', function(e) {
                var t = e.target;
                if (!t || !t.id) return;
                var co = currentModalObject;
                if (!co || !co.properties || co.properties.get('type') !== 'node') return;
                if (t.classList && t.classList.contains('edit-node-switch-name')) {
                    var swIdNm = t.getAttribute('data-switch-id');
                    if (swIdNm) {
                        updateAttachedSwitchMeta(co, swIdNm, 'name', t.value.trim());
                        saveData();
                        if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
                    }
                    return;
                }
                var mfrM = /^editNodeSwMfr_(.+)$/.exec(t.id);
                if (mfrM) {
                    updateAttachedSwitchMeta(co, mfrM[1], 'manufacturer', t.value || '');
                    if (typeof populateModelDatalistForManufacturer === 'function') populateModelDatalistForManufacturer((t.value || '').trim(), 'deviceModelsList', 'switch');
                    saveData();
                    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
                    return;
                }
                var modM = /^editNodeSwMod_(.+)$/.exec(t.id);
                if (modM) {
                    updateAttachedSwitchMeta(co, modM[1], 'model', t.value || '');
                    saveData();
                    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
                }
            });
            modalRoot.addEventListener('change', function(e) {
                var t = e.target;
                if (!t || t.id !== 'newNodeSwitchModel') return;
                var mfrH = document.getElementById('newNodeSwitchManufacturer');
                var pcEl = document.getElementById('newNodeSwitchPortCount');
                var mfr = mfrH ? (mfrH.value || '').trim() : '';
                var mod = (t.value || '').trim();
                var n = typeof getSwitchModelDefaultPortCount === 'function' ? getSwitchModelDefaultPortCount(mfr, mod) : null;
                if (n != null && n >= 1 && n <= 96 && pcEl) pcEl.value = String(n);
            }, true);
        }
    }

    const editNodeKindSelect = document.getElementById('editNodeKind');
    if (editNodeKindSelect) {
        editNodeKindSelect.addEventListener('change', function() {
            if (!currentModalObject) return;
            const newNodeKind = this.value || 'network';
            currentModalObject.properties.set('nodeKind', newNodeKind);
            updateNodeIcon(currentModalObject);
            updateNodeDisplay();
            saveData();
            if (typeof updateInfoModalChrome === 'function') {
                updateInfoModalChrome('node', currentModalObject.properties.get('name') || '');
            }
            var nodeCard = document.querySelector('.node-card');
            if (nodeCard) {
                nodeCard.classList.remove('node-card--network', 'node-card--aggregation');
                nodeCard.classList.add(newNodeKind === 'aggregation' ? 'node-card--aggregation' : 'node-card--network');
            }
            var heroIcon = document.querySelector('.node-card-hero-icon');
            if (heroIcon && window.MapIcons) {
                heroIcon.innerHTML = MapIcons.buildIconSvg('node', { variant: 'normal', nodeKind: newNodeKind });
            }
        });
    }

    const editNodeCommentInput = document.getElementById('editNodeComment');
    if (editNodeCommentInput) {
        editNodeCommentInput.addEventListener('input', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            currentModalObject.properties.set('comment', this.value || '');
            saveData();
        });
    }

    var editOltManufacturer = document.getElementById('editOltManufacturer');
    if (editOltManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOltManufacturer);
        editOltManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'olt') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'olt'); });
        editOltManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'olt'); });
    }
    var editOltModel = document.getElementById('editOltModel');
    if (editOltModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOltModel);
        editOltModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'olt') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editOltComment = document.getElementById('editOltComment');
    if (editOltComment) editOltComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'olt') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });
    var editOnuManufacturer = document.getElementById('editOnuManufacturer');
    if (editOnuManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOnuManufacturer);
        editOnuManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'onu'); });
        editOnuManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'onu'); });
    }
    var editOnuModel = document.getElementById('editOnuModel');
    if (editOnuModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editOnuModel);
        editOnuModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editOnuComment = document.getElementById('editOnuComment');
    if (editOnuComment) editOnuComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'onu') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editCameraManufacturer = document.getElementById('editCameraManufacturer');
    if (editCameraManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editCameraManufacturer);
        editCameraManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'camera'); });
        editCameraManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'camera'); });
    }
    var editCameraModel = document.getElementById('editCameraModel');
    if (editCameraModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editCameraModel);
        editCameraModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editCameraComment = document.getElementById('editCameraComment');
    if (editCameraComment) editCameraComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'camera') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editMediaConverterManufacturer = document.getElementById('editMediaConverterManufacturer');
    if (editMediaConverterManufacturer) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editMediaConverterManufacturer);
        editMediaConverterManufacturer.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('manufacturer', this.value || ''); saveData(); } populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'node'); });
        editMediaConverterManufacturer.addEventListener('change', function() { populateModelDatalistForManufacturer(this.value.trim(), 'deviceModelsList', 'node'); });
    }
    var editMediaConverterModel = document.getElementById('editMediaConverterModel');
    if (editMediaConverterModel) {
        if (typeof preventPasswordSuggestions === 'function') preventPasswordSuggestions(editMediaConverterModel);
        editMediaConverterModel.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('model', this.value || ''); saveData(); } });
    }
    var editMediaConverterComment = document.getElementById('editMediaConverterComment');
    if (editMediaConverterComment) editMediaConverterComment.addEventListener('input', function() { if (currentModalObject && currentModalObject.properties.get('type') === 'mediaConverter') { currentModalObject.properties.set('comment', this.value || ''); saveData(); } });

    var editCrossCopperPortsEl = document.getElementById('editCrossCopperPorts');
    if (editCrossCopperPortsEl) {
        editCrossCopperPortsEl.addEventListener('change', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'cross') return;
            var newVal = parseInt(this.value, 10);
            if (isNaN(newVal)) newVal = 0;
            newVal = Math.max(0, newVal);
            var usage = currentModalObject.properties.get('copperPortUsage') || {};
            var maxUsed = 0;
            Object.keys(usage).forEach(function(k) {
                var n = parseInt(k, 10);
                if (!isNaN(n) && n > maxUsed) maxUsed = n;
            });
            if (newVal < maxUsed) {
                if (typeof showError === 'function') showError('На медных портах есть кабели (до порта ' + maxUsed + '). Уменьшить число портов нельзя.', 'Медные порты');
                var curCcp = Math.max(0, parseInt(currentModalObject.properties.get('crossCopperPorts'), 10) || 0);
                this.value = String(curCcp);
                return;
            }
            currentModalObject.properties.set('crossCopperPorts', newVal);
            saveData();
            if (typeof rebuildAllCopperPortUsageFromCables === 'function') rebuildAllCopperPortUsageFromCables();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
        });
    }

    var editSleeveTypeSelect = document.getElementById('editSleeveType');
    if (editSleeveTypeSelect) {
        editSleeveTypeSelect.addEventListener('change', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'sleeve') return;
            var newType = this.value;
            var newMax = getDefaultMaxFibersForSleeveType(newType);
            var used = typeof getTotalUsedFibersInSleeve === 'function' ? getTotalUsedFibersInSleeve(currentModalObject) : 0;
            if (newMax > 0 && used > newMax) {
                if (typeof showError === 'function') {
                    showError('Для выбранного типа допускается не более ' + newMax + ' волокон, а в муфте уже задействовано ' + used + '. Снимите соединения или выберите другой тип.', 'Вместимость муфты');
                }
                var prev = currentModalObject.properties.get('sleeveType');
                this.value = prev ? String(prev) : '';
                return;
            }
            if (!newType) {
                try {
                    currentModalObject.properties.unset('sleeveType');
                } catch (eUnset) {}
                currentModalObject.properties.set('maxFibers', 0);
            } else {
                currentModalObject.properties.set('sleeveType', newType);
                currentModalObject.properties.set('maxFibers', newMax);
            }
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
            refreshObjectModal(currentModalObject);
        });
    }
    
    var btnAddNodeSwitch = document.getElementById('btnAddNodeSwitch');
    if (btnAddNodeSwitch) {
        btnAddNodeSwitch.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            var nmEl = document.getElementById('newNodeSwitchName');
            var pcEl = document.getElementById('newNodeSwitchPortCount');
            var pkEl = document.getElementById('newNodeSwitchPortKind');
            var mfrEl = document.getElementById('newNodeSwitchManufacturer');
            var modEl = document.getElementById('newNodeSwitchModel');
            var nm = nmEl ? nmEl.value.trim() : '';
            var pcRaw = pcEl ? pcEl.value : '24';
            var pc = Math.max(1, Math.min(96, parseInt(pcRaw, 10) || 24));
            var pk = pkEl ? pkEl.value : 'RJ45 10/100/1000';
            var mfr = mfrEl ? mfrEl.value.trim() : '';
            var mod = modEl ? modEl.value.trim() : '';
            addAttachedSwitchToNode(currentModalObject, nm, pc, pk, mfr, mod);
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
            refreshObjectModal(currentModalObject);
        });
    }
    document.querySelectorAll('.btn-remove-node-switch').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
            var sid = this.getAttribute('data-switch-id');
            if (!sid) return;
            if (removeAttachedSwitchFromNode(currentModalObject, sid)) {
                saveData();
                if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
                refreshObjectModal(currentModalObject);
            }
        });
    });
    var modalInfoNodeSw = document.getElementById('modalInfo');
    if (modalInfoNodeSw) {
        modalInfoNodeSw.querySelectorAll('.edit-node-switch-port-kind').forEach(function(sel) {
            sel.addEventListener('change', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
                var swId = this.getAttribute('data-switch-id');
                var idx = parseInt(this.getAttribute('data-idx'), 10);
                if (!swId || isNaN(idx) || idx < 0) return;
                var arr = getNodeAttachedSwitches(currentModalObject).slice();
                var ix = arr.findIndex(function(s) { return s.uniqueId === swId; });
                if (ix < 0) return;
                var sw = Object.assign({}, arr[ix]);
                var pt = (sw.switchPortTypes || []).slice();
                while (pt.length <= idx) pt.push('RJ45 10/100/1000');
                pt[idx] = this.value;
                sw.switchPortTypes = pt;
                arr[ix] = sw;
                currentModalObject.properties.set('attachedSwitches', arr);
                saveData();
            });
        });
    }
    
    var saveSupportBtn = document.getElementById('saveSupportEdit');
    if (saveSupportBtn) {
        saveSupportBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var wt = currentModalObject.properties.get('type');
            if (wt !== 'support' && wt !== 'attachment') return;
            flushNameFieldIfChanged('editSupportName', applySupportNameChange);
            showSupportInfo(currentModalObject);
        });
    }

    const saveChangesBtn = document.getElementById('saveChangesBtn');
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', function() {
            flushModalNamesFromEditor();
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
            showInfo('Изменения сохранены', 'Сохранено');
        });
    }

    const duplicateBtn = document.getElementById('duplicateCurrentObject');
    if (duplicateBtn) {
        duplicateBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            
            duplicateObject(currentModalObject);
        });
    }

    document.querySelectorAll('.btn-split-cable-at-waypoint').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var t = currentModalObject.properties.get('type');
            if (t !== 'support' && t !== 'attachment') return;
            var cableId = btn.getAttribute('data-cable-id');
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === cableId;
            });
            if (cable) {
                var sleeveOpts = readCableSplitSleeveOptions(document.getElementById('modalInfo'));
                splitCableAtWaypoint(currentModalObject, cable, sleeveOpts);
            }
        });
    });

    const deleteBtn = document.getElementById('deleteCurrentObject');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var obj = currentModalObject;
            var msg = 'Вы уверены, что хотите удалить этот объект?';
            if (obj.properties && obj.properties.get('type') === 'support') {
                var cablesOnSupport = getCablesThroughSupport(obj);
                if (cablesOnSupport.length > 0) {
                    msg = cablesOnSupport.length === 1
                        ? 'На этой опоре проложен кабель. Удалить опору и кабель?'
                        : 'На этой опоре проложено кабелей: ' + cablesOnSupport.length + '. Удалить опору и все эти кабели?';
                }
            }
            if (obj.properties && obj.properties.get('type') === 'attachment') {
                var cablesOnAttachment = getCablesThroughSupport(obj);
                if (cablesOnAttachment.length > 0) {
                    msg = cablesOnAttachment.length === 1
                        ? 'Через это крепление проходит кабель. Удалить крепление и кабель?'
                        : 'Через это крепление проходит кабелей: ' + cablesOnAttachment.length + '. Удалить крепление и все эти кабели?';
                }
            }
            (async function() {
                if (!(await showConfirm(msg, 'Удаление объекта', { confirmText: 'Удалить' }))) return;
                var objToDelete = currentModalObject;
                deleteObject(objToDelete);
                if (currentModalObject === objToDelete) {
                    closeInfoModal();
                }
            })();
        });
    }

}

function duplicateObject(obj) {
    if (!obj || !obj.geometry) return;
    
    const type = obj.properties.get('type');
    const name = obj.properties.get('name') || '';
    const coords = obj.geometry.getCoordinates();
    const offset = 0.0002; 
    const newCoords = [coords[0] + offset, coords[1] + offset];

    var newName = name;
    if (type === 'node' && name) {
        newName = name + ' (копия)';
        var copyNum = 2;
        while (findNodeByName(newName)) {
            newName = name + ' (копия ' + copyNum + ')';
            copyNum++;
        }
    }
    if (type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter') {
        if (name) newName = name + ' (копия)';
    }
    
    var opts = {};
    if (type === 'node') {
        opts.nodeKind = obj.properties.get('nodeKind') || 'network';
        opts.comment = obj.properties.get('comment') || '';
    }
    if (type === 'camera' || type === 'mediaConverter') {
        opts.manufacturer = obj.properties.get('manufacturer') || '';
        opts.model = obj.properties.get('model') || '';
        opts.comment = obj.properties.get('comment') || '';
    }
    if (type === 'camera' && window.CameraPlayer) {
        var sc = CameraPlayer.getCameraStreamConfig(obj);
        opts.streamType = sc.streamType;
        opts.streamUrl = sc.streamUrl;
        opts.streamUser = sc.streamUser;
        opts.streamPass = sc.streamPass;
        opts.streamAutoplay = sc.streamAutoplay;
        opts.streamMuted = sc.streamMuted;
        var snap = CameraPlayer.getCameraSnapshot(obj);
        if (snap) opts.snapshotPhoto = snap;
    }

    createObject(type, newName, newCoords, Object.keys(opts).length ? opts : undefined);

    const newObj = objects[objects.length - 1];
    if (!newObj) return;

    if (type === 'olt') {
        newObj.properties.set('ponPorts', obj.properties.get('ponPorts') || 8);
        newObj.properties.set('incomingFiber', null);
        newObj.properties.set('portAssignments', {});
    }
    if (type === 'splitter') {
        newObj.properties.set('splitRatio', obj.properties.get('splitRatio') || 8);
        newObj.properties.set('inputFiber', null);
        newObj.properties.set('outputConnections', []);
    }
    if (type === 'onu') {
        newObj.properties.set('incomingFiber', null);
    }
    if (type === 'mediaConverter') {
        newObj.properties.set('incomingFiber', null);
    }
    if (type === 'node' && newObj) {
        var attSrc = obj.properties.get('attachedSwitches');
        if (Array.isArray(attSrc) && attSrc.length) {
            var t0 = Date.now();
            newObj.properties.set('attachedSwitches', attSrc.map(function (sw, idx) {
                var o = {
                    uniqueId: 'sw-' + t0 + '-' + idx + '-' + Math.random().toString(36).substr(2, 9),
                    name: (sw && sw.name) ? String(sw.name) : 'Коммутатор',
                    switchPortTypes: Array.isArray(sw && sw.switchPortTypes) ? sw.switchPortTypes.slice() : [],
                    copperPortUsage: {}
                };
                if (sw && sw.manufacturer) o.manufacturer = String(sw.manufacturer);
                if (sw && sw.model) o.model = String(sw.model);
                return o;
            }));
        }
    }

    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    currentModalObject = null;
    saveData();
}

function updateNodeLabel(placemark, name) {
    updateObjectLabel(placemark, name);
}

function syncObjectNameOp(obj, trimmed) {
    if (!obj || !obj.properties) return;
    var uid = typeof getObjectUniqueId === 'function' ? getObjectUniqueId(obj) : obj.properties.get('uniqueId');
    if (uid && typeof window.syncSendOp === 'function') {
        window.syncSendOp({ type: 'update_object', uniqueId: uid, data: { name: trimmed } });
    }
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
}

function flushNameFieldIfChanged(inputId, applyFn) {
    var inp = document.getElementById(inputId);
    if (!inp || !currentModalObject || !currentModalObject.properties) return;
    var trimmed = (inp.value || '').trim();
    var cur = (currentModalObject.properties.get('name') || '').trim();
    if (trimmed !== cur) applyFn(trimmed);
}

function applyCrossNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'cross') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Оптический кросс: ' + trimmed : 'Оптический кросс');
    updateObjectLabel(currentModalObject, trimmed);
    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Оптический кросс: ' + trimmed : 'Оптический кросс';
    var sideTitle = document.querySelector('.fiber-ws-side-title');
    if (sideTitle) sideTitle.textContent = trimmed || 'Кросс';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySleeveNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'sleeve') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Кабельная муфта: ' + trimmed : 'Кабельная муфта');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Кабельная муфта: ' + trimmed : 'Кабельная муфта';
    var sideTitle = document.querySelector('.fiber-ws-side-title');
    if (sideTitle) sideTitle.textContent = trimmed || 'Муфта';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyNodeNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
    var trimmed = (newName || '').trim();
    if (trimmed && typeof findNodeByName === 'function' && findNodeByName(trimmed, currentModalObject)) return;
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Узел сети: ' + trimmed : 'Узел сети');
    updateNodeLabel(currentModalObject, trimmed);
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Узел сети: ' + trimmed : 'Узел сети';
    var cardName = document.querySelector('.node-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новый узел';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyOltNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'OLT: ' + trimmed : 'OLT (GPON)');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'OLT: ' + trimmed : 'OLT (GPON)';
    var cardName = document.querySelector('.olt-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новый OLT';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySplitterNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Сплиттер: ' + trimmed : 'Сплиттер');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Сплиттер: ' + trimmed : 'Сплиттер';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyOnuNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'onu') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'ONU: ' + trimmed : 'ONU');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'ONU: ' + trimmed : 'ONU';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyCameraNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'camera') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Камера: ' + trimmed : 'Камера');
    updateObjectLabel(currentModalObject, trimmed);
    if (typeof refreshCameraMapPresentation === 'function') refreshCameraMapPresentation(currentModalObject);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Камера: ' + trimmed : 'Камера';
    var cardName = document.querySelector('.camera-card-view-name');
    if (cardName) cardName.textContent = trimmed || 'Новая камера';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applyMediaConverterNameChange(newName) {
    if (!currentModalObject || currentModalObject.properties.get('type') !== 'mediaConverter') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    currentModalObject.properties.set('balloonContent', trimmed ? 'Медиаконвертер: ' + trimmed : 'Медиаконвертер');
    updateObjectLabel(currentModalObject, trimmed);
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? 'Медиаконвертер: ' + trimmed : 'Медиаконвертер';
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function applySupportNameChange(newName) {
    if (!currentModalObject) return;
    var wt = currentModalObject.properties.get('type');
    if (wt !== 'support' && wt !== 'attachment') return;
    var trimmed = (newName || '').trim();
    currentModalObject.properties.set('name', trimmed);
    if (wt === 'attachment') {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Крепление узлов: ' + trimmed : 'Крепление узлов');
    } else {
        currentModalObject.properties.set('balloonContent', trimmed ? 'Опора связи: ' + trimmed : 'Опора связи');
    }
    updateSupportLabel(currentModalObject, trimmed);
    var lbl = currentModalObject.properties.get('label');
    if (lbl && trimmed) {
        try { myMap.geoObjects.add(lbl); } catch (e) {}
    } else if (lbl && !trimmed) {
        try { myMap.geoObjects.remove(lbl); } catch (e) {}
    }
    var copy = typeof getSupportWaypointCopy === 'function' ? getSupportWaypointCopy(wt === 'attachment') : { typeLabel: 'Объект' };
    var modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = trimmed ? (copy.typeLabel + ': ' + trimmed) : copy.typeLabel;
    saveData();
    syncObjectNameOp(currentModalObject, trimmed);
}

function bindModalNameField(inputId, applyFn) {
    var el = document.getElementById(inputId);
    if (!el) return;
    el.oninput = function() { applyFn(this.value); };
    el.onchange = function() { applyFn(this.value); };
}

function bindModalObjectNameEditors() {
    bindModalNameField('editCrossName', applyCrossNameChange);
    bindModalNameField('editSleeveName', applySleeveNameChange);
    bindModalNameField('editNodeName', applyNodeNameChange);
    bindModalNameField('editOltName', applyOltNameChange);
    bindModalNameField('editSplitterName', applySplitterNameChange);
    bindModalNameField('editOnuName', applyOnuNameChange);
    bindModalNameField('editCameraName', applyCameraNameChange);
    bindModalNameField('editMediaConverterName', applyMediaConverterNameChange);
    bindModalNameField('editSupportName', applySupportNameChange);
}

function flushCrossNameFromEditor() {
    flushNameFieldIfChanged('editCrossName', applyCrossNameChange);
}

function flushSleeveNameFromEditor() {
    flushNameFieldIfChanged('editSleeveName', applySleeveNameChange);
}

function flushModalNamesFromEditor() {
    if (!currentModalObject || !currentModalObject.properties) return;
    var t = currentModalObject.properties.get('type');
    if (t === 'cross') flushCrossNameFromEditor();
    else if (t === 'sleeve') flushSleeveNameFromEditor();
    else if (t === 'node') flushNameFieldIfChanged('editNodeName', applyNodeNameChange);
    else if (t === 'olt') flushNameFieldIfChanged('editOltName', applyOltNameChange);
    else if (t === 'splitter') flushNameFieldIfChanged('editSplitterName', applySplitterNameChange);
    else if (t === 'onu') flushNameFieldIfChanged('editOnuName', applyOnuNameChange);
    else if (t === 'camera') flushNameFieldIfChanged('editCameraName', applyCameraNameChange);
    else if (t === 'mediaConverter') flushNameFieldIfChanged('editMediaConverterName', applyMediaConverterNameChange);
    else if (t === 'support' || t === 'attachment') flushNameFieldIfChanged('editSupportName', applySupportNameChange);
}

function getObjectDefaultName(type) {
    switch(type) {
        case 'node': return 'Узел сети';
        case 'cross': return 'Кросс';
        case 'sleeve': return 'Муфта';
        case 'support': return 'Опора';
        case 'attachment': return 'Крепление';
        case 'olt': return 'OLT';
        case 'splitter': return 'Сплиттер';
        case 'onu': return 'ONU';
        case 'camera': return 'Камера';
        case 'mediaConverter': return 'Медиаконвертер';
        case 'switch': return 'Коммутатор';
        default: return 'Объект';
    }
}

function getObjectLabelHtml(type, displayName, placemark) {
    if (type === 'camera' && window.CameraPlayer && placemark) {
        return CameraPlayer.buildMapLabelHtml(
            displayName,
            CameraPlayer.isCameraOnline(placemark),
            CameraPlayer.getCameraStatusTitle(placemark)
        );
    }
    return '<div class="map-label">' + displayName + '</div>';
}

function refreshCameraMapPresentation(cameraObj) {
    if (!cameraObj || !cameraObj.properties || cameraObj.properties.get('type') !== 'camera') return;
    var variant = 'normal';
    if (selectedObjects.indexOf(cameraObj) >= 0) {
        if (!isEditMode) variant = 'selected';
    }
    if (hoveredObject === cameraObj) variant = 'hover';
    applyMapPlacemarkIcon(cameraObj, 'camera', variant, cameraObj);
    updateObjectLabel(cameraObj, cameraObj.properties.get('name'));
    if (typeof refreshMapPlacemarkIcons === 'function' &&
        currentModalObject === cameraObj &&
        typeof isInfoModalVisible === 'function' &&
        isInfoModalVisible(document.getElementById('infoModal'))) {
        var modalBody = document.getElementById('modalInfo');
        if (modalBody && window.MapIcons && window.CameraPlayer) {
            var heroIcon = modalBody.querySelector('.camera-card-hero-icon');
            if (heroIcon) {
                heroIcon.innerHTML = MapIcons.buildIconSvg('camera', {
                    variant: 'normal',
                    cameraOnline: CameraPlayer.isCameraOnline(cameraObj)
                });
            }
            modalBody.querySelectorAll('.camera-status-badge').forEach(function(badge) {
                var online = CameraPlayer.isCameraOnline(cameraObj);
                badge.className = 'camera-status-badge camera-status-badge--' + (online ? 'online' : 'offline');
                badge.title = CameraPlayer.getCameraStatusTitle(cameraObj);
                var text = badge.querySelector('.camera-status-badge-text');
                if (text) text.textContent = online ? 'Онлайн' : 'Офлайн';
            });
        }
    }
}
window.refreshCameraMapPresentation = refreshCameraMapPresentation;

function updateObjectLabel(placemark, name) {
    if (!placemark || !placemark.properties) return;
    
    const type = placemark.properties.get('type');
    if (type === 'cable' || type === 'cableLabel') return;
    
    let label = placemark.properties.get('label');
    const displayName = name ? escapeHtml(name) : getObjectDefaultName(type);
    const labelHtml = getObjectLabelHtml(type, displayName, placemark);
    const coords = placemark.geometry.getCoordinates();
    
    if (!label) {
        label = new ymaps.Placemark(coords, {}, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: labelHtml,
            iconContentOffset: type === 'support' ? [0, 14] : [0, 18],
            zIndex: 1000,
            zIndexHover: 1000,
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        placemark.properties.set('label', label);
    } else {
        label.properties.set({
            iconContent: labelHtml
        });
        label.geometry.setCoordinates(coords);
    }
}

function updateSupportLabel(placemark, name) {
    updateObjectLabel(placemark, name);
}

function updateSupportLabelLegacy(placemark, name) {
    if (!placemark || !placemark.properties) return;
    if (placemark.properties.get('type') !== 'support') return;
    
    var label = placemark.properties.get('label');
    var coords = placemark.geometry.getCoordinates();
    
    if (!name || name.trim() === '') {
        if (label) {
            try { myMap.geoObjects.remove(label); } catch (e) {}
            placemark.properties.unset('label');
        }
        return;
    }
    
    var displayName = escapeHtml(name.trim());
    var labelContent = '<div class="map-label">' + displayName + '</div>';
    
    if (!label) {
        label = new ymaps.Placemark(coords, {}, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: labelContent,
            iconContentOffset: [0, 14],
            zIndex: 1000,
            zIndexHover: 1000,
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        placemark.properties.set('label', label);
    } else {
        label.properties.set({ iconContent: labelContent });
        label.geometry.setCoordinates(coords);
    }
}

function updateNodeIcon(placemark) {
    if (!placemark || !placemark.properties) return;
    if (placemark.properties.get('type') !== 'node') return;
    if (selectedObjects.indexOf(placemark) >= 0) {
        applyMapPlacemarkIcon(placemark, 'node', 'selected', placemark);
    } else {
        applyMapPlacemarkIcon(placemark, 'node', 'normal', placemark);
    }
}

var STATS_COLLAPSED_STORAGE_KEY = 'networkMap_statsCollapsed';

function setStatsSectionCollapsed(collapsed) {
    var section = document.getElementById('statsSection');
    var toggleBtn = document.getElementById('statsToggleBtn');
    if (!section) return;
    section.classList.toggle('stats-section--collapsed', collapsed);
    if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggleBtn.setAttribute('title', collapsed ? 'Показать статистику' : 'Скрыть статистику');
        toggleBtn.setAttribute('aria-label', collapsed ? 'Показать статистику' : 'Скрыть статистику');
    }
    try {
        localStorage.setItem(STATS_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch (e) {}
}

function setupStatsToggle() {
    var toggleBtn = document.getElementById('statsToggleBtn');
    var section = document.getElementById('statsSection');
    if (!toggleBtn || !section) return;

    var initiallyCollapsed = true;
    try {
        var stored = localStorage.getItem(STATS_COLLAPSED_STORAGE_KEY);
        if (stored === '0') initiallyCollapsed = false;
        else if (stored === '1') initiallyCollapsed = true;
    } catch (e) {}
    if (initiallyCollapsed) setStatsSectionCollapsed(true);

    toggleBtn.addEventListener('click', function() {
        setStatsSectionCollapsed(!section.classList.contains('stats-section--collapsed'));
    });
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    if (!toggleBtn) return;
    
    toggleBtn.addEventListener('click', function() {
        const body = document.body;
        const collapsed = body.classList.toggle('sidebar-collapsed');
        
        toggleBtn.setAttribute('aria-label', collapsed ? 'Показать панель' : 'Скрыть панель');
        toggleBtn.setAttribute('title', collapsed ? 'Показать панель' : 'Скрыть панель');
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');

        if (typeof myMap !== 'undefined' && myMap && myMap.container) {
            setTimeout(function() {
                try {
                    myMap.container.fitToViewport();
                } catch (e) {}
            }, 300);
        }
    });
}

function setupModalEventListeners() {
    
    if (isEditMode) {
        document.querySelectorAll('.btn-delete-cable').forEach(btn => {
            btn.addEventListener('click', function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                deleteCableByUniqueId(cableUniqueId);
            });
        });

        document.querySelectorAll('.cable-type-select').forEach(select => {
            select.addEventListener('change', async function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                await changeCableType(cableUniqueId, this.value);
            });
        });

        document.querySelectorAll('.cable-fiber-count-input').forEach(function(inp) {
            inp.addEventListener('change', async function() {
                await changeCableType(inp.getAttribute('data-cable-id'), inp.value);
            });
        });

        document.querySelectorAll('.btn-cable-palette-edit').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var uid = btn.getAttribute('data-cable-id');
                var cableObj = objects.find(function(o) {
                    return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === uid;
                });
                if (!cableObj || !window.FiberCableConfig) return;
                window.FiberCableConfig.openFiberPaletteEditor({
                    title: 'Цвета жил кабеля',
                    fiberCount: getFiberCount(cableObj),
                    palette: window.FiberCableConfig.getFiberPaletteForCable(cableObj),
                    onSave: async function(r) {
                        await updateCableFiberSettings(uid, r.fiberCount, r.palette);
                    }
                });
            });
        });

        document.querySelectorAll('.fiber-item.fiber-used').forEach(item => {
            item.addEventListener('click', function(e) {
                
                if (e.target.classList.contains('btn-continue-cable')) {
                    return;
                }
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
                toggleFiberUsage(cableUniqueId, fiberNumber);
            });
        });

        document.querySelectorAll('.btn-continue-cable').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const cableUniqueId = this.getAttribute('data-cable-id');
                const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));

                const modal = document.getElementById('infoModal');
                modal.style.display = 'none';

            });
        });
        
        document.querySelectorAll('.btn-copper-connect-from-media-converter').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'mediaConverter') return;
                startCopperCableFromMediaConverter(currentModalObject);
            });
        });
        document.querySelectorAll('.btn-copper-connect-from-node-port').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'node') return;
                var swId = this.getAttribute('data-switch-id');
                var portN = parseInt(this.getAttribute('data-copper-port'), 10);
                startCopperCableFromNodeSwitchPort(currentModalObject, swId, portN);
            });
        });
        
    }

    setupFiberConnectionHandlers();

    document.querySelectorAll('.btn-trace-from-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const crossId = this.getAttribute('data-cross-id');
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            traceFromNode(crossId, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-trace-camera-mc-incoming').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var mcCableId = btn.getAttribute('data-cable-id');
            var mcFiber = parseInt(btn.getAttribute('data-fiber-number'), 10);
            if (!mcCableId || !mcFiber) return;
            showFiberTrace(mcCableId, mcFiber);
        });
    });

    const modalInfo = document.getElementById('modalInfo');
    if (modalInfo) {
        modalInfo.querySelectorAll('.olt-port-assign').forEach(select => {
            select.addEventListener('change', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                const portNum = parseInt(this.getAttribute('data-port'), 10);
                const oltId = getObjectUniqueId(currentModalObject);
                let portAssignments = currentModalObject.properties.get('portAssignments') || {};
                const oldAss = portAssignments[String(portNum)];
                if (oldAss && oldAss.cableId != null && oldAss.fiberNumber != null) {
                    const oldCable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === oldAss.cableId);
                    if (oldCable) {
                        const oldOther = getOtherEndOfCable(oldCable, currentModalObject);
                        if (oldOther && (oldOther.properties.get('type') === 'cross' || oldOther.properties.get('type') === 'sleeve')) {
                            let oltConn = oldOther.properties.get('oltConnections') || {};
                            const oldKey = oldAss.cableId + '-' + oldAss.fiberNumber;
                            delete oltConn[oldKey];
                            oldOther.properties.set('oltConnections', oltConn);
                        }
                    }
                }
                const val = this.value;
                if (!val) {
                    delete portAssignments[String(portNum)];
                } else {
                    const idx = val.lastIndexOf('-');
                    const cableId = idx >= 0 ? val.substring(0, idx) : val;
                    const fiberNumber = parseInt(val.substring(idx + 1), 10);
                    const usage = getFiberUsage(cableId, fiberNumber, { type: 'oltPort', oltId: oltId, portNumber: portNum });
                    if (usage.used) {
                        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
                        this.value = oldAss ? (oldAss.cableId + '-' + oldAss.fiberNumber) : '';
                        return;
                    }
                    portAssignments[String(portNum)] = { cableId: cableId, fiberNumber: fiberNumber };
                    const cable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId);
                    if (cable) {
                        const otherEnd = getOtherEndOfCable(cable, currentModalObject);
                        if (otherEnd && (otherEnd.properties.get('type') === 'cross' || otherEnd.properties.get('type') === 'sleeve')) {
                            let oltConn = otherEnd.properties.get('oltConnections') || {};
                            oltConn[cableId + '-' + fiberNumber] = { oltId: oltId, portNumber: portNum };
                            otherEnd.properties.set('oltConnections', oltConn);
                        }
                    }
                }
                currentModalObject.properties.set('portAssignments', portAssignments);
                saveData();
                if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
                updateAllConnectionLines();
                const traceBtn = modalInfo.querySelector('.btn-trace-olt-port[data-port="' + portNum + '"]');
                if (traceBtn) traceBtn.disabled = !val;
            });
        });
        modalInfo.querySelectorAll('.btn-trace-olt-port').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const port = parseInt(this.getAttribute('data-port'), 10);
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'olt') return;
                traceFromOLTPort(currentModalObject, port);
            });
        });

        modalInfo.querySelectorAll('.btn-splitter-output-to-onu').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                showSplitterOutputOnuDialog(currentModalObject, outIdx);
            });
        });
        modalInfo.querySelectorAll('.btn-splitter-output-to-splitter').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                showSplitterOutputSplitterDialog(currentModalObject, outIdx);
            });
        });

        modalInfo.querySelectorAll('.btn-splitter-output-delete').forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (!currentModalObject || currentModalObject.properties.get('type') !== 'splitter') return;
                var outIdx = parseInt(this.getAttribute('data-output-index'), 10);
                deleteSplitterOutput(currentModalObject, outIdx);
            });
        });
    }
}

function setupFiberConnectionHandlers() {
    const objType = currentModalObject ? currentModalObject.properties.get('type') : null;
    if (!currentModalObject || (objType !== 'sleeve' && objType !== 'cross')) {
        return;
    }
    
    const sleeveObj = currentModalObject;
    let fiberConnections = sleeveObj.properties.get('fiberConnections');
    if (!fiberConnections) {
        fiberConnections = [];
        sleeveObj.properties.set('fiberConnections', fiberConnections);
    }

    selectedFiberForConnection = null;
    selectedFiberConnectionIndex = null;

    document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            if (this.getAttribute('data-fiber-selectable') === 'false') return;
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);
            
            if (!selectedFiberForConnection) {
                
                const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                const onuConnections = sleeveObj.properties.get('onuConnections') || {};
                const mediaConverterConnections = sleeveObj.properties.get('mediaConverterConnections') || {};
                const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
                const fiberKey = `${cableId}-${fiberNumber}`;
                
                if (nodeConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[fiberKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (onuConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к ONU "${onuConnections[fiberKey].onuName || 'ONU'}". Отключите её от ONU, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (mediaConverterConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к медиаконвертеру "${mediaConverterConnections[fiberKey].mediaConverterName || 'Медиаконвертер'}". Отключите её, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                if (splitterConnections[fiberKey]) {
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} уже подключена к сплиттеру. Отключите её от сплиттера, чтобы соединить с другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }
                const fiberAlreadyConnected = fiberConnections.find(conn => 
                    (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                    (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                );
                
                if (fiberAlreadyConnected) {
                    
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                        const hint = document.createElement('div');
                        hint.className = 'connection-hint';
                        hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                        hint.textContent = `Жила ${fiberNumber} кабеля ${cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                        instruction.appendChild(hint);
                    }
                    return;
                }

                selectedFiberForConnection = { cableId, fiberNumber };
                updateFiberSelectionUI();
            } else {
                if (selectedFiberForConnection.cableId === cableId && selectedFiberForConnection.fiberNumber === fiberNumber) {
                    resetFiberSelection();
                    const instruction = document.querySelector('.fiber-connections-container');
                    if (instruction) {
                        const existingMsg = instruction.querySelector('.connection-hint');
                        if (existingMsg) existingMsg.remove();
                    }
                    return;
                }
                
                if (selectedFiberForConnection.cableId !== cableId || selectedFiberForConnection.fiberNumber !== fiberNumber) {
                    
                    if (selectedFiberForConnection.cableId === cableId) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Нельзя соединить жилы одного кабеля. Выберите жилу из другого кабеля.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }

                    const existingConn = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber &&
                         conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) ||
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber &&
                         conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );

                    const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                    const onuConnections = sleeveObj.properties.get('onuConnections') || {};
                    const mediaConverterConnections = sleeveObj.properties.get('mediaConverterConnections') || {};
                    const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
                    const secondKey = `${cableId}-${fiberNumber}`;
                    const firstKey = `${selectedFiberForConnection.cableId}-${selectedFiberForConnection.fiberNumber}`;
                    
                    if (nodeConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к узлу "${nodeConnections[secondKey].nodeName}". Отключите её от узла, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (onuConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к ONU "${onuConnections[secondKey].onuName || 'ONU'}". Отключите её от ONU, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (mediaConverterConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к медиаконвертеру "${mediaConverterConnections[secondKey].mediaConverterName || 'Медиаконвертер'}". Отключите её, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (splitterConnections[secondKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} уже подключена к сплиттеру. Отключите её от сплиттера, чтобы соединить с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (nodeConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к узлу "${nodeConnections[firstKey].nodeName}". Отключите её от узла для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (onuConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к ONU "${onuConnections[firstKey].onuName || 'ONU'}". Отключите её от ONU для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (mediaConverterConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к медиаконвертеру "${mediaConverterConnections[firstKey].mediaConverterName || 'Медиаконвертер'}". Отключите её для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    if (splitterConnections[firstKey]) {
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Выбранная жила уже подключена к сплиттеру. Отключите её от сплиттера для соединения с другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    const firstFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === selectedFiberForConnection.cableId && conn.from.fiberNumber === selectedFiberForConnection.fiberNumber) ||
                        (conn.to.cableId === selectedFiberForConnection.cableId && conn.to.fiberNumber === selectedFiberForConnection.fiberNumber)
                    );

                    const secondFiberAlreadyConnected = fiberConnections.find(conn => 
                        (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) ||
                        (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber)
                    );
                    
                    if (firstFiberAlreadyConnected) {
                        
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${selectedFiberForConnection.fiberNumber} кабеля ${selectedFiberForConnection.cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    if (secondFiberAlreadyConnected) {
                        
                        const instruction = document.querySelector('.fiber-connections-container');
                        if (instruction) {
                            const existingMsg = instruction.querySelector('.connection-hint');
                            if (existingMsg) existingMsg.remove();
                            const hint = document.createElement('div');
                            hint.className = 'connection-hint';
                            hint.style.cssText = 'padding: 8px; background: #fee2e2; border-radius: 4px; margin-top: 10px; font-size: 0.875rem; color: #dc2626;';
                            hint.textContent = `Жила ${fiberNumber} кабеля ${cableId.substring(0, 8)}... уже соединена с другой жилой. Одна жила может быть соединена только с одной другой жилой.`;
                            instruction.appendChild(hint);
                        }
                        resetFiberSelection();
                        return;
                    }
                    
                    if (!existingConn) {
                        
                        fiberConnections.push({
                            from: { cableId: selectedFiberForConnection.cableId, fiberNumber: selectedFiberForConnection.fiberNumber },
                            to: { cableId: cableId, fiberNumber: fiberNumber }
                        });
                        sleeveObj.properties.set('fiberConnections', fiberConnections);
                        saveData();

                        var schemeWrap = document.getElementById('fiber-scheme-viewport');
                        var tableWrap = document.querySelector('.cross-fiber-table-wrap');
                        savedFiberConnectionsScrollPos = {
                            scheme: schemeWrap ? schemeWrap.scrollTop : 0,
                            table: tableWrap ? tableWrap.scrollTop : 0
                        };
                        showObjectInfo(sleeveObj);
                        return;
                    }
                }

                resetFiberSelection();
            }
        });
    });

    document.querySelectorAll('.fiber-connections-container .cross-fiber-table .fiber-item').forEach(function(tableItem) {
        tableItem.addEventListener('click', function(e) {
            if (e.target.closest('button, input, select')) return;
            if (!isEditMode) return;
            if (tableItem.getAttribute('data-fiber-selectable') === 'false') return;
            const cableId = tableItem.getAttribute('data-cable-id');
            const fiberNumber = tableItem.getAttribute('data-fiber-number');
            if (!cableId || !fiberNumber) return;
            const portEls = document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]');
            for (var i = 0; i < portEls.length; i++) {
                if (portEls[i].getAttribute('data-cable-id') === cableId && portEls[i].getAttribute('data-fiber-number') === String(fiberNumber)) {
                    portEls[i].click();
                    break;
                }
            }
        });
    });

    document.querySelectorAll('#fiber-connections-svg path[id^="connection-"], #fiber-connections-svg path.fiber-scheme-link-hit, #fiber-connections-svg polygon[data-connection-index]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            if (connIndex >= 0 && connIndex < fiberConnections.length) {
                selectFiberConnectionForLabel(sleeveObj, connIndex, { focusInput: true });
            }
        });
    });

    document.querySelectorAll('.fiber-conn-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            deleteFiberConnectionByIndex(sleeveObj, connIndex);
        });
    });

    document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
        row.addEventListener('click', function(e) {
            if (e.target.closest('input, button')) return;
            if (!isEditMode) return;
            const connIndex = parseInt(row.getAttribute('data-connection-index'), 10);
            if (!isNaN(connIndex)) selectFiberConnectionForLabel(sleeveObj, connIndex, { focusInput: false });
        });
    });

    var barInput = document.getElementById('fiber-conn-label-bar-input');
    if (barInput) {
        function saveBarLabel() {
            const connIndex = parseInt(barInput.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            updateFiberConnectionLabel(sleeveObj, connIndex, barInput.value.trim());
        }
        barInput.addEventListener('input', function() {
            const connIndex = parseInt(barInput.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            document.querySelectorAll('.fiber-connection-label-input[data-connection-index="' + connIndex + '"]').forEach(function(inp) {
                if (document.activeElement !== inp) inp.value = barInput.value;
            });
        });
        barInput.addEventListener('change', saveBarLabel);
        barInput.addEventListener('blur', saveBarLabel);
    }
    var barGoto = document.getElementById('fiber-conn-label-bar-goto');
    if (barGoto) {
        barGoto.addEventListener('click', function() {
            var connIndex = selectedFiberConnectionIndex;
            closeFiberConnLabelModal(sleeveObj, true, true);
            var root = document.querySelector('.fiber-workspace');
            if (root) {
                var tab = root.querySelector('.fiber-ws-tab[data-tab="connections"]');
                if (tab) tab.click();
            }
            if (connIndex != null) {
                document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
                    row.classList.toggle('fiber-connection-row--selected', row.getAttribute('data-connection-index') === String(connIndex));
                    if (row.getAttribute('data-connection-index') === String(connIndex)) {
                        try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(false); }
                    }
                });
            }
        });
    }
    var barDelete = document.getElementById('fiber-conn-label-bar-delete');
    if (barDelete) {
        barDelete.addEventListener('click', function() {
            if (selectedFiberConnectionIndex == null) return;
            deleteFiberConnectionByIndex(sleeveObj, selectedFiberConnectionIndex);
        });
    }
    var barClose = document.getElementById('fiber-conn-label-bar-close');
    if (barClose) {
        barClose.addEventListener('click', function() {
            closeFiberConnLabelModal(sleeveObj, true);
        });
    }
    var barBackdrop = document.getElementById('fiber-conn-label-bar-backdrop');
    if (barBackdrop) {
        barBackdrop.addEventListener('click', function() {
            closeFiberConnLabelModal(sleeveObj, true);
        });
    }
    var barModal = document.getElementById('fiber-conn-label-bar');
    if (barModal) {
        barModal.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeFiberConnLabelModal(sleeveObj, true);
            }
        });
        var barPanel = barModal.querySelector('.fiber-conn-label-modal__panel');
        if (barPanel) {
            barPanel.addEventListener('click', function(e) { e.stopPropagation(); });
        }
    }

    var connSearch = document.getElementById('fiber-connections-search');
    if (connSearch) {
        connSearch.addEventListener('input', function() {
            const q = connSearch.value.trim().toLowerCase();
            document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
                const hay = row.getAttribute('data-search') || '';
                row.hidden = !!(q && hay.indexOf(q) < 0);
            });
        });
    }

    document.querySelectorAll('.fiber-label-input').forEach(input => {
        function saveLabel() {
            const cableId = input.getAttribute('data-cable-id');
            const fiberNumber = parseInt(input.getAttribute('data-fiber-number'), 10);
            if (!cableId || isNaN(fiberNumber)) return;
            const newLabel = input.value.trim();
            updateFiberLabel(sleeveObj, cableId, fiberNumber, newLabel);
        }
        input.addEventListener('click', function(e) { e.stopPropagation(); });
        input.addEventListener('change', function(e) { e.stopPropagation(); saveLabel(); });
        input.addEventListener('blur', function(e) { e.stopPropagation(); saveLabel(); });
    });

    document.querySelectorAll('.fiber-connection-label-input, .fiber-scheme-connection-label-input').forEach(function(input) {
        function saveConnLabel() {
            const connIndex = parseInt(input.getAttribute('data-connection-index'), 10);
            if (isNaN(connIndex)) return;
            updateFiberConnectionLabel(sleeveObj, connIndex, input.value.trim());
        }
        input.addEventListener('click', function(e) { e.stopPropagation(); });
        input.addEventListener('change', function(e) { e.stopPropagation(); saveConnLabel(); });
        input.addEventListener('blur', function(e) { e.stopPropagation(); saveConnLabel(); });
    });

    document.querySelectorAll('.btn-connect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showNodeSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-node').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromNode(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-onu').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showOnuSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-mc').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showMediaConverterSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-splitter').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showSplitterSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-connect-olt').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            showOltSelectionDialog(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-olt').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromOlt(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-onu').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromOnu(sleeveObj, cableId, fiberNumber);
        });
    });

    document.querySelectorAll('.btn-disconnect-mc').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromMediaConverter(sleeveObj, cableId, fiberNumber);
        });
    });
    
    document.querySelectorAll('.btn-disconnect-splitter').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'));
            disconnectFiberFromSplitter(sleeveObj, cableId, fiberNumber);
        });
    });
    
    document.querySelectorAll('.fiber-port-select').forEach(select => {
        select.addEventListener('change', function(e) {
            e.stopPropagation();
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);
            if (!cableId || isNaN(fiberNumber)) return;
            const portValue = this.value;
            updateFiberPort(sleeveObj, cableId, fiberNumber, portValue);
        });
    });

    setupFiberWorkspaceUI();
    bindModalObjectNameEditors();

    document.querySelectorAll('.fiber-conn-delete').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'), 10);
            const conns = sleeveObj.properties.get('fiberConnections') || [];
            if (connIndex >= 0 && connIndex < conns.length) {
                conns.splice(connIndex, 1);
                sleeveObj.properties.set('fiberConnections', conns);
                saveData();
                showObjectInfo(sleeveObj);
            }
        });
    });

    setupFiberSchemeHoverHandlers();
    setupFiberSchemeZoomHandlers();
}

function setupFiberSchemeZoomHandlers() {
    var viewport = document.getElementById('fiber-scheme-viewport');
    var inner = document.getElementById('fiber-scheme-zoom-inner');
    var slider = document.getElementById('fiber-scheme-zoom-slider');
    var label = document.getElementById('fiber-scheme-zoom-label');
    var btnIn = document.getElementById('fiber-scheme-zoom-in');
    var btnOut = document.getElementById('fiber-scheme-zoom-out');
    var btnReset = document.getElementById('fiber-scheme-zoom-reset');
    if (!viewport || !inner) return;

    var zoom = parseFloat(sessionStorage.getItem('fiberSchemeZoom') || '1');
    if (isNaN(zoom)) zoom = 1;
    zoom = Math.max(0.5, Math.min(2, zoom));

    function applyZoom(z) {
        zoom = Math.max(0.5, Math.min(2, Math.round(z * 20) / 20));
        inner.style.transform = 'scale(' + zoom + ')';
        inner.style.transformOrigin = 'top center';
        if (slider) slider.value = String(Math.round(zoom * 100));
        if (label) label.textContent = Math.round(zoom * 100) + '%';
        try { sessionStorage.setItem('fiberSchemeZoom', String(zoom)); } catch (e) {}
    }
    applyZoom(zoom);

    if (btnIn) btnIn.addEventListener('click', function() { applyZoom(zoom + 0.1); });
    if (btnOut) btnOut.addEventListener('click', function() { applyZoom(zoom - 0.1); });
    if (btnReset) btnReset.addEventListener('click', function() { applyZoom(1); });
    if (slider) slider.addEventListener('input', function() { applyZoom(parseInt(this.value, 10) / 100); });
    viewport.addEventListener('wheel', function(e) {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            applyZoom(zoom + (e.deltaY < 0 ? 0.08 : -0.08));
        }
    }, { passive: false });
}

function setupFiberSchemeHoverHandlers() {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg) return;

    let activeFiberKey = null;
    let activeConnIndex = null;

    function setConnLabelVisible(connIndex, visible) {
        svg.querySelectorAll('.fiber-scheme-conn-label').forEach(function(el) {
            const idx = el.getAttribute('data-connection-index');
            el.classList.toggle('is-visible', visible && connIndex != null && idx === String(connIndex));
        });
    }

    function setFiberLabelVisible(fiberKey, visible) {
        svg.querySelectorAll('.fiber-scheme-fiber-label').forEach(function(el) {
            const fk = el.getAttribute('data-fiber-key');
            el.classList.toggle('is-visible', visible && fiberKey != null && fk === fiberKey);
        });
    }

    function clearHover() {
        if (!activeFiberKey && activeConnIndex == null) return;
        activeFiberKey = null;
        activeConnIndex = null;
        svg.classList.remove('fiber-scheme-hover-active');
        svg.querySelectorAll('.fiber-scheme-hovered, .fiber-scheme-dimmed, .fiber-scheme-link-hovered, .fiber-scheme-link-dimmed, .fiber-cable-block-hovered').forEach(function(el) {
            el.classList.remove('fiber-scheme-hovered', 'fiber-scheme-dimmed', 'fiber-scheme-link-hovered', 'fiber-scheme-link-dimmed', 'fiber-cable-block-hovered');
        });
        setConnLabelVisible(null, false);
        setFiberLabelVisible(null, false);
    }

    function applyConnHover(connIndex, fiberKeyForHighlight) {
        if (connIndex == null) return;
        activeConnIndex = connIndex;
        if (fiberKeyForHighlight) activeFiberKey = fiberKeyForHighlight;
        svg.classList.add('fiber-scheme-hover-active');
        setConnLabelVisible(connIndex, true);
        setFiberLabelVisible(null, false);

        var linkEl = svg.querySelector('.fiber-scheme-link[data-connection-index="' + connIndex + '"]');
        var fromKey = linkEl ? linkEl.getAttribute('data-from-fiber') : null;
        var toKey = linkEl ? linkEl.getAttribute('data-to-fiber') : null;

        svg.querySelectorAll('.fiber-scheme-port').forEach(function(el) {
            var fk = el.getAttribute('data-fiber-key');
            var hit = fk === fromKey || fk === toKey;
            el.classList.toggle('fiber-scheme-hovered', hit);
            el.classList.toggle('fiber-scheme-dimmed', !hit);
        });
        svg.querySelectorAll('.fiber-scheme-link').forEach(function(el) {
            var hit = el.getAttribute('data-connection-index') === String(connIndex);
            el.classList.toggle('fiber-scheme-link-hovered', hit);
            el.classList.toggle('fiber-scheme-link-dimmed', !hit);
        });
        if (fromKey || toKey) {
            var port = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + (fromKey || toKey) + '"]');
            var cableId = port ? port.getAttribute('data-cable-id') : null;
            svg.querySelectorAll('.fiber-cable-block').forEach(function(el) {
                el.classList.toggle('fiber-cable-block-hovered', cableId && el.getAttribute('data-cable-id') === cableId);
            });
        }
    }

    function applyHover(fiberKey) {
        if (!fiberKey) return;
        var linkEl = svg.querySelector('.fiber-scheme-link[data-from-fiber="' + fiberKey + '"], .fiber-scheme-link[data-to-fiber="' + fiberKey + '"]');
        var connIndex = linkEl ? parseInt(linkEl.getAttribute('data-connection-index'), 10) : null;
        if (connIndex != null && !isNaN(connIndex)) {
            applyConnHover(connIndex, fiberKey);
            return;
        }
        activeFiberKey = fiberKey;
        activeConnIndex = null;
        setConnLabelVisible(null, false);
        const portEl = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
        const hasDirectLabel = portEl && portEl.getAttribute('data-direct-label');
        setFiberLabelVisible(fiberKey, !!hasDirectLabel);
        svg.classList.add('fiber-scheme-hover-active');
        const port = svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
        const cableId = port ? port.getAttribute('data-cable-id') : null;

        svg.querySelectorAll('.fiber-scheme-port').forEach(function(el) {
            el.classList.toggle('fiber-scheme-hovered', el.getAttribute('data-fiber-key') === fiberKey);
            el.classList.toggle('fiber-scheme-dimmed', el.getAttribute('data-fiber-key') !== fiberKey);
        });
        svg.querySelectorAll('.fiber-scheme-link').forEach(function(el) {
            const hit = el.getAttribute('data-from-fiber') === fiberKey || el.getAttribute('data-to-fiber') === fiberKey;
            el.classList.toggle('fiber-scheme-link-hovered', hit);
            el.classList.toggle('fiber-scheme-link-dimmed', !hit);
            if (hit) {
                var ci = parseInt(el.getAttribute('data-connection-index'), 10);
                if (!isNaN(ci)) setConnLabelVisible(ci, true);
            }
        });
        svg.querySelectorAll('.fiber-cable-block').forEach(function(el) {
            el.classList.toggle('fiber-cable-block-hovered', cableId && el.getAttribute('data-cable-id') === cableId);
        });
    }

    svg.addEventListener('mouseover', function(e) {
        const connLabelEl = e.target.closest('.fiber-scheme-conn-label, .fiber-scheme-connection-label-input');
        if (connLabelEl) {
            var ciLbl = parseInt(connLabelEl.getAttribute('data-connection-index') ||
                (connLabelEl.closest('.fiber-scheme-conn-label') && connLabelEl.closest('.fiber-scheme-conn-label').getAttribute('data-connection-index')), 10);
            if (!isNaN(ciLbl)) applyConnHover(ciLbl, null);
            return;
        }
        const linkHit = e.target.closest('.fiber-scheme-link-hit, .fiber-scheme-link');
        if (linkHit && linkHit.getAttribute('data-connection-index') != null) {
            var ci = parseInt(linkHit.getAttribute('data-connection-index'), 10);
            if (!isNaN(ci)) applyConnHover(ci, null);
            return;
        }
        const port = e.target.closest('.fiber-scheme-port');
        if (port) applyHover(port.getAttribute('data-fiber-key'));
    });
    svg.addEventListener('mouseleave', function(e) {
        const rt = e.relatedTarget;
        if (!rt || !svg.contains(rt)) clearHover();
    });
}

function resolveFiberConnectionLabel(conn, fiberLabels) {
    if (!conn) return '';
    if (conn.label) return String(conn.label);
    const fiberLabelsMap = fiberLabels || {};
    const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
    const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
    const fromL = fiberLabelsMap[fromKey];
    const toL = fiberLabelsMap[toKey];
    if (fromL && toL && fromL !== toL) return fromL + ' / ' + toL;
    return fromL || toL || '';
}

/** Перенос подписей с жил на объекты сращиваний (старые данные). */
function syncFiberConnectionLabelsFromLegacy(sleeveObj) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    const fiberLabels = sleeveObj.properties.get('fiberLabels') || {};
    let changed = false;
    fiberConnections.forEach(function(conn) {
        if (conn.label) return;
        const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
        const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
        const fromL = fiberLabels[fromKey];
        const toL = fiberLabels[toKey];
        let label = '';
        if (fromL && toL && fromL !== toL) label = fromL + ' / ' + toL;
        else label = fromL || toL || '';
        if (!label) return;
        conn.label = label;
        delete fiberLabels[fromKey];
        delete fiberLabels[toKey];
        changed = true;
    });
    if (changed) {
        sleeveObj.properties.set('fiberConnections', fiberConnections);
        sleeveObj.properties.set('fiberLabels', fiberLabels);
    }
}

function syncFiberConnectionLabelInputs(connIndex, label) {
    const v = label || '';
    const bar = document.getElementById('fiber-conn-label-bar-input');
    if (bar && parseInt(bar.getAttribute('data-connection-index'), 10) === connIndex && document.activeElement !== bar) {
        bar.value = v;
    }
    document.querySelectorAll('.fiber-connection-label-input[data-connection-index="' + connIndex + '"]').forEach(function(inp) {
        if (document.activeElement !== inp) inp.value = v;
    });
}

function getFiberSchemeLabelColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        bg: isDark ? 'rgba(30, 41, 59, 0.92)' : 'rgba(255, 255, 255, 0.92)',
        fill: isDark ? '#f1f5f9' : '#1e293b',
        border: isDark ? '#334155' : '#dee2e6'
    };
}

function setSvgTitle(parent, text) {
    if (!parent) return;
    let titleEl = parent.querySelector('title');
    const trimmed = text ? String(text).trim() : '';
    if (!trimmed) {
        if (titleEl) titleEl.remove();
        return;
    }
    if (!titleEl) {
        titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        parent.appendChild(titleEl);
    }
    titleEl.textContent = trimmed;
}

function refreshFiberSchemeConnectionLabelDom(connIndex, labelText) {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg || connIndex == null || isNaN(connIndex)) return;
    const trimmed = labelText ? String(labelText).trim() : '';
    const link = svg.querySelector('#connection-' + connIndex) || svg.querySelector('.fiber-scheme-link[data-connection-index="' + connIndex + '"]');
    const linkHit = svg.querySelector('.fiber-scheme-link-hit[data-connection-index="' + connIndex + '"]');
    if (link) {
        link.setAttribute('data-conn-label', trimmed);
        setSvgTitle(link, trimmed);
    }
    setSvgTitle(linkHit, trimmed);

    let labelG = svg.querySelector('.fiber-scheme-conn-label[data-connection-index="' + connIndex + '"]');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    if (!link) return;
    const pathD = link.getAttribute('d');
    if (!pathD) return;
    const mid = fiberSchemePathMidpoint(pathD);
    const colors = getFiberSchemeLabelColors();
    const labelFoW = 148;
    const tw = Math.min(labelFoW, Math.max(40, trimmed.length * 6.5 + 16));
    const tx = mid.x - tw / 2;
    const ty = mid.y - 11;

    if (!labelG) {
        const container = svg.querySelector('.fiber-scheme-link-labels');
        if (!container) return;
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-conn-label');
        labelG.setAttribute('data-connection-index', String(connIndex));
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-conn-label-bg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-conn-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 10px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        container.appendChild(labelG);
    }
    const rect = labelG.querySelector('.fiber-scheme-conn-label-bg');
    const text = labelG.querySelector('.fiber-scheme-conn-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(ty));
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
    const linkHovered = link && link.classList.contains('fiber-scheme-link-hovered');
    if (selectedFiberConnectionIndex === connIndex || linkHovered || labelG.classList.contains('is-visible')) {
        labelG.classList.add('is-visible');
    }
}

function refreshFiberSchemeFiberLabelDom(fiberKey, labelText) {
    const svg = document.getElementById('fiber-connections-svg');
    if (!svg || !fiberKey) return;
    const trimmed = labelText ? String(labelText).trim() : '';
    const port = svg.querySelector('#fiber-' + fiberKey) || svg.querySelector('.fiber-scheme-port[data-fiber-key="' + fiberKey + '"]');
    if (port) {
        if (trimmed) port.setAttribute('data-direct-label', trimmed);
        else port.removeAttribute('data-direct-label');
    }
    let labelG = svg.querySelector('.fiber-scheme-fiber-label[data-fiber-key="' + fiberKey + '"]');
    if (!trimmed) {
        if (labelG) labelG.remove();
        return;
    }
    const lastDash = fiberKey.lastIndexOf('-');
    const fiberNumber = lastDash >= 0 ? fiberKey.slice(lastDash + 1) : '';
    const cableId = lastDash >= 0 ? fiberKey.slice(0, lastDash) : fiberKey;
    const portEl = port || svg.querySelector('.fiber-scheme-port[data-cable-id="' + cableId + '"][data-fiber-number="' + fiberNumber + '"]');
    if (!portEl) return;
    const badge = portEl.querySelector('.fiber-port-badge');
    if (!badge) return;
    const bx = parseFloat(badge.getAttribute('x')) || 0;
    const by = parseFloat(badge.getAttribute('y')) || 0;
    const bw = parseFloat(badge.getAttribute('width')) || 22;
    const bh = parseFloat(badge.getAttribute('height')) || 16;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    const colors = getFiberSchemeLabelColors();
    const tw = Math.min(120, Math.max(36, trimmed.length * 6.5 + 14));
    const tx = cx - tw / 2;
    const ty = cy - 22;
    if (!labelG) {
        const container = svg.querySelector('.fiber-scheme-fiber-labels');
        if (!container) return;
        labelG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        labelG.setAttribute('class', 'fiber-scheme-fiber-label');
        labelG.setAttribute('data-fiber-key', fiberKey);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'fiber-scheme-fiber-label-bg');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'fiber-scheme-fiber-label-text');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('style', 'font-size: 9px; font-weight: 600; fill: ' + colors.fill + '; pointer-events: none;');
        labelG.appendChild(rect);
        labelG.appendChild(text);
        container.appendChild(labelG);
    }
    const rect = labelG.querySelector('.fiber-scheme-fiber-label-bg');
    const text = labelG.querySelector('.fiber-scheme-fiber-label-text');
    if (rect) {
        rect.setAttribute('x', String(tx));
        rect.setAttribute('y', String(ty));
        rect.setAttribute('width', String(tw));
        rect.setAttribute('height', '18');
        rect.setAttribute('rx', '4');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '0.75');
    }
    if (text) {
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(ty + 13));
        text.textContent = trimmed;
    }
    if (labelG.classList.contains('is-visible')) {
        labelG.classList.add('is-visible');
    }
}

function updateFiberConnectionLabel(sleeveObj, connIndex, label) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    const conn = fiberConnections[connIndex];
    const trimmed = label ? String(label).trim() : '';
    if (trimmed) conn.label = trimmed;
    else delete conn.label;
    const fiberLabels = sleeveObj.properties.get('fiberLabels') || {};
    const fromKey = conn.from.cableId + '-' + conn.from.fiberNumber;
    const toKey = conn.to.cableId + '-' + conn.to.fiberNumber;
    delete fiberLabels[fromKey];
    delete fiberLabels[toKey];
    sleeveObj.properties.set('fiberConnections', fiberConnections);
    sleeveObj.properties.set('fiberLabels', fiberLabels);
    saveData();
    syncFiberConnectionLabelInputs(connIndex, trimmed);
    refreshFiberSchemeConnectionLabelDom(connIndex, trimmed);
    const row = document.querySelector('.fiber-connection-row[data-connection-index="' + connIndex + '"]');
    if (row) {
        const fromEl = row.querySelector('.fiber-conn-from');
        const toEl = row.querySelector('.fiber-conn-to');
        if (fromEl && toEl) {
            row.setAttribute('data-search', (fromEl.textContent + ' ' + toEl.textContent + ' ' + trimmed).toLowerCase());
        }
    }
}

function formatFiberConnectionDesc(conn, cableNameById) {
    if (!conn) return '';
    const fromName = cableNameById ? cableNameById(conn.from.cableId) : conn.from.cableId;
    const toName = cableNameById ? cableNameById(conn.to.cableId) : conn.to.cableId;
    return fromName + ', ж.' + conn.from.fiberNumber + ' ↔ ' + toName + ', ж.' + conn.to.fiberNumber;
}


function closeFiberConnLabelModal(sleeveObj, save, keepSelection) {
    if (save) {
        var inp = document.getElementById('fiber-conn-label-bar-input');
        if (inp) {
            var connIndex = parseInt(inp.getAttribute('data-connection-index'), 10);
            if (!isNaN(connIndex)) updateFiberConnectionLabel(sleeveObj, connIndex, inp.value.trim());
        }
    }
    if (keepSelection) {
        var bar = document.getElementById('fiber-conn-label-bar');
        if (bar) {
            bar.hidden = true;
            bar.setAttribute('aria-hidden', 'true');
        }
    } else {
        clearFiberConnectionLabelSelection();
    }
}

function clearFiberConnectionLabelSelection() {
    selectedFiberConnectionIndex = null;
    var bar = document.getElementById('fiber-conn-label-bar');
    if (bar) {
        bar.hidden = true;
        bar.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('.fiber-connection-row.fiber-connection-row--selected').forEach(function(el) {
        el.classList.remove('fiber-connection-row--selected');
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-link-selected').forEach(function(el) {
        el.classList.remove('fiber-scheme-link-selected');
    });
    document.querySelectorAll('.fiber-scheme-conn-label.is-visible, .fiber-scheme-fiber-label.is-visible').forEach(function(el) {
        el.classList.remove('is-visible');
    });
}

function selectFiberConnectionForLabel(sleeveObj, connIndex, opts) {
    opts = opts || {};
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    selectedFiberConnectionIndex = connIndex;
    const conn = fiberConnections[connIndex];

    function cableNameById(id) {
        const cables = getConnectedCables(sleeveObj);
        const c = cables.find(function(x) { return x.properties && x.properties.get('uniqueId') === id; });
        if (!c) return id.substring(0, 8) + '…';
        const n = c.properties.get('cableName');
        return n || getCableDescription(c.properties.get('cableType'));
    }

    const desc = formatFiberConnectionDesc(conn, cableNameById);
    const label = resolveFiberConnectionLabel(conn, sleeveObj.properties.get('fiberLabels') || {});

    var bar = document.getElementById('fiber-conn-label-bar');
    var descEl = document.getElementById('fiber-conn-label-bar-desc');
    var inputEl = document.getElementById('fiber-conn-label-bar-input');
    if (bar) {
        bar.hidden = false;
        bar.setAttribute('aria-hidden', 'false');
    }
    if (descEl) descEl.textContent = desc;
    if (inputEl) {
        inputEl.value = label || '';
        inputEl.setAttribute('data-connection-index', String(connIndex));
        if (opts.focusInput) {
            try { inputEl.focus(); inputEl.select(); } catch (e) {}
        }
    }

    document.querySelectorAll('.fiber-connection-row').forEach(function(row) {
        var on = row.getAttribute('data-connection-index') === String(connIndex);
        row.classList.toggle('fiber-connection-row--selected', on);
        if (on && opts.scrollToRow) {
            try { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { row.scrollIntoView(false); }
        }
    });
    document.querySelectorAll('#fiber-connections-svg .fiber-scheme-link, #fiber-connections-svg .fiber-scheme-link-hit').forEach(function(el) {
        el.classList.toggle('fiber-scheme-link-selected', el.getAttribute('data-connection-index') === String(connIndex));
    });
    document.querySelectorAll('.fiber-scheme-conn-label').forEach(function(el) {
        el.classList.toggle('is-visible', el.getAttribute('data-connection-index') === String(connIndex));
    });
}

function deleteFiberConnectionByIndex(sleeveObj, connIndex) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    if (connIndex < 0 || connIndex >= fiberConnections.length) return;
    fiberConnections.splice(connIndex, 1);
    sleeveObj.properties.set('fiberConnections', fiberConnections);
    clearFiberConnectionLabelSelection();
    saveData();
    var schemeWrap = document.getElementById('fiber-scheme-viewport');
    var tableWrap = document.querySelector('.cross-fiber-table-wrap');
    savedFiberConnectionsScrollPos = {
        scheme: schemeWrap ? schemeWrap.scrollTop : 0,
        table: tableWrap ? tableWrap.scrollTop : 0
    };
    showObjectInfo(sleeveObj);
}

function fiberSchemePathMidpoint(pathD) {
    const m = pathD.match(/M\s*([\d.-]+)\s+([\d.-]+)\s+C\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+),\s*([\d.-]+)\s+([\d.-]+)/);
    if (!m) return { x: 0, y: 0 };
    const p0 = { x: parseFloat(m[1]), y: parseFloat(m[2]) };
    const p1 = { x: parseFloat(m[3]), y: parseFloat(m[4]) };
    const p2 = { x: parseFloat(m[5]), y: parseFloat(m[6]) };
    const p3 = { x: parseFloat(m[7]), y: parseFloat(m[8]) };
    const t = 0.5;
    const u = 1 - t;
    return {
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
    };
}

function updateFiberPort(crossObj, cableId, fiberNumber, portValue) {
    let fiberPorts = crossObj.properties.get('fiberPorts');
    if (!fiberPorts) {
        fiberPorts = {};
        crossObj.properties.set('fiberPorts', fiberPorts);
    }
    const key = `${cableId}-${fiberNumber}`;
    const value = (portValue !== undefined && portValue !== null && String(portValue).trim() !== '') ? String(portValue).trim() : null;
    if (value) {
        fiberPorts[key] = value;
    } else {
        delete fiberPorts[key];
    }
    crossObj.properties.set('fiberPorts', fiberPorts);
}

function updateFiberLabel(sleeveObj, cableId, fiberNumber, label) {
    let fiberLabels = sleeveObj.properties.get('fiberLabels');
    if (!fiberLabels) {
        fiberLabels = {};
    }
    
    const key = `${cableId}-${fiberNumber}`;
    
    if (label) {
        fiberLabels[key] = label;
    } else {
        
        delete fiberLabels[key];
    }
    
    sleeveObj.properties.set('fiberLabels', fiberLabels);
    saveData();
    refreshFiberSchemeFiberLabelDom(key, label ? String(label).trim() : '');
}

function inheritFiberLabels(sleeveObj, fromCableId, fromFiberNumber, toCableId, toFiberNumber) {
    let fiberLabels = sleeveObj.properties.get('fiberLabels');
    if (!fiberLabels) {
        fiberLabels = {};
    }
    
    const fromKey = `${fromCableId}-${fromFiberNumber}`;
    const toKey = `${toCableId}-${toFiberNumber}`;

    const fromInherited = getInheritedFiberLabel(sleeveObj, fromCableId, fromFiberNumber);
    const toInherited = getInheritedFiberLabel(sleeveObj, toCableId, toFiberNumber);

    let labelToSpread = '';
    if (fromInherited.label && !toInherited.label) {
        labelToSpread = fromInherited.label;
    } else if (toInherited.label && !fromInherited.label) {
        labelToSpread = toInherited.label;
    } else if (fromInherited.label && toInherited.label) {
        
        if (fromInherited.label !== toInherited.label) {
            labelToSpread = `${fromInherited.label} / ${toInherited.label}`;
        } else {
            labelToSpread = fromInherited.label;
        }
    }
    
    if (labelToSpread) {
        
        spreadLabelToConnectedFibers(sleeveObj, fromCableId, fromFiberNumber, labelToSpread, fiberLabels);
        spreadLabelToConnectedFibers(sleeveObj, toCableId, toFiberNumber, labelToSpread, fiberLabels);
        sleeveObj.properties.set('fiberLabels', fiberLabels);
    }
}

function spreadLabelToConnectedFibers(sleeveObj, startCableId, startFiberNumber, label, fiberLabels) {
    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    const visited = new Set();
    const queue = [{ cableId: startCableId, fiberNumber: startFiberNumber }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        const currentKey = `${current.cableId}-${current.fiberNumber}`;
        
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        if (!fiberLabels[currentKey]) {
            fiberLabels[currentKey] = label;
        }

        for (const conn of fiberConnections) {
            if (conn.from.cableId === current.cableId && conn.from.fiberNumber === current.fiberNumber) {
                queue.push({ cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber });
            } else if (conn.to.cableId === current.cableId && conn.to.fiberNumber === current.fiberNumber) {
                queue.push({ cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber });
            }
        }
    }
}

function getInheritedFiberLabel(sleeveObj, cableId, fiberNumber) {
    const fiberLabels = sleeveObj.properties.get('fiberLabels') || {};
    const key = `${cableId}-${fiberNumber}`;

    if (fiberLabels[key]) {
        return { label: fiberLabels[key], inherited: false };
    }

    const fiberConnections = sleeveObj.properties.get('fiberConnections') || [];
    const visited = new Set();
    const queue = [{ cableId, fiberNumber }];
    
    while (queue.length > 0) {
        const current = queue.shift();
        const currentKey = `${current.cableId}-${current.fiberNumber}`;
        
        if (visited.has(currentKey)) continue;
        visited.add(currentKey);

        if (currentKey !== key && fiberLabels[currentKey]) {
            return { label: fiberLabels[currentKey], inherited: true };
        }

        for (const conn of fiberConnections) {
            if (conn.label && (conn.from.cableId === current.cableId && conn.from.fiberNumber === current.fiberNumber ||
                conn.to.cableId === current.cableId && conn.to.fiberNumber === current.fiberNumber)) {
                return { label: conn.label, inherited: currentKey !== key };
            }
            if (conn.from.cableId === current.cableId && conn.from.fiberNumber === current.fiberNumber) {
                queue.push({ cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber });
            } else if (conn.to.cableId === current.cableId && conn.to.fiberNumber === current.fiberNumber) {
                queue.push({ cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber });
            }
        }
    }

    const globalLabel = getGlobalFiberLabel(cableId, fiberNumber);
    if (globalLabel) {
        return { label: globalLabel, inherited: true };
    }
    
    return { label: '', inherited: false };
}

function getGlobalFiberLabel(startCableId, startFiberNumber) {
    const visited = new Set();
    const visitedObjects = new Set();

    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }

    function searchLabel(cableId, fiberNumber, currentObject) {
        const fiberKey = `${cableId}-${fiberNumber}`;
        if (visited.has(fiberKey)) return null;
        visited.add(fiberKey);

        if (currentObject) {
            const fiberLabels = currentObject.properties.get('fiberLabels') || {};
            if (fiberLabels[fiberKey]) {
                return fiberLabels[fiberKey];
            }

            const fiberConnections = currentObject.properties.get('fiberConnections') || [];
            for (const conn of fiberConnections) {
                let nextCableId = null;
                let nextFiberNumber = null;
                
                if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                    nextCableId = conn.to.cableId;
                    nextFiberNumber = conn.to.fiberNumber;
                } else if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                    nextCableId = conn.from.cableId;
                    nextFiberNumber = conn.from.fiberNumber;
                }
                
                if (nextCableId) {
                    
                    const connKey = `${nextCableId}-${nextFiberNumber}`;
                    if (fiberLabels[connKey]) {
                        return fiberLabels[connKey];
                    }

                    const nextCable = findCableById(nextCableId);
                    if (nextCable) {
                        const result = searchAlongCable(nextCable, nextFiberNumber, currentObject);
                        if (result) return result;
                    }
                }
            }
        }
        
        return null;
    }

    function searchAlongCable(cable, fiberNumber, excludeObject) {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        const cableId = cable.properties.get('uniqueId');

        let nextObject = null;
        if (excludeObject) {
            const excludeId = getObjectUniqueId(excludeObject);
            const fromId = fromObj ? getObjectUniqueId(fromObj) : null;
            const toId = toObj ? getObjectUniqueId(toObj) : null;
            
            if (fromId === excludeId) {
                nextObject = toObj;
            } else if (toId === excludeId) {
                nextObject = fromObj;
            }
        } else {
            
            if (fromObj) {
                const result = searchInObject(fromObj, cableId, fiberNumber);
                if (result) return result;
            }
            if (toObj) {
                const result = searchInObject(toObj, cableId, fiberNumber);
                if (result) return result;
            }
            return null;
        }
        
        if (nextObject) {
            return searchInObject(nextObject, cableId, fiberNumber);
        }
        
        return null;
    }

    function searchInObject(obj, cableId, fiberNumber) {
        if (!obj || !obj.properties) return null;
        
        const objId = getObjectUniqueId(obj);
        if (visitedObjects.has(objId)) return null;
        visitedObjects.add(objId);
        
        const objType = obj.properties.get('type');
        if (objType !== 'sleeve' && objType !== 'cross') return null;
        
        return searchLabel(cableId, fiberNumber, obj);
    }

    const startCable = findCableById(startCableId);
    if (!startCable) return null;

    const fromObj = startCable.properties.get('from');
    const toObj = startCable.properties.get('to');
    
    if (fromObj) {
        const result = searchInObject(fromObj, startCableId, startFiberNumber);
        if (result) return result;
    }
    
    if (toObj) {
        const result = searchInObject(toObj, startCableId, startFiberNumber);
        if (result) return result;
    }
    
    return null;
}

function getObjectUniqueId(obj) {
    if (!obj || !obj.properties) return null;
    let id = obj.properties.get('uniqueId');
    if (!id) {
        const type = obj.properties.get('type') || 'obj';
        id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        obj.properties.set('uniqueId', id);
    }
    return id;
}

function traceFiberPathFromObject(startObject, startCableId, startFiberNumber) {
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();

    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }

    function findFiberConnection(cableId, fiberNumber, sleeveObj) {
        const connections = sleeveObj.properties.get('fiberConnections') || [];
        
        for (const conn of connections) {
            if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                return { cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber };
            }
            if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                return { cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber };
            }
        }
        return null;
    }

    function getOtherEnd(cable, currentObj, previousObj) {
        var pts = cable.properties.get('points');
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (pts && pts.length > 2) {
            var currentId = getObjectUniqueId(currentObj);
            var previousId = previousObj ? getObjectUniqueId(previousObj) : null;
            var idx = -1;
            for (var i = 0; i < pts.length; i++) {
                if (pts[i] === currentObj || (pts[i] && getObjectUniqueId(pts[i]) === currentId)) { idx = i; break; }
            }
            if (idx === -1) return null;
            
            var nextIdx = idx + 1;
            var prevIdx = idx - 1;
            
            if (previousId) {
                var prevPtId = (prevIdx >= 0 && pts[prevIdx]) ? getObjectUniqueId(pts[prevIdx]) : null;
                var nextPtId = (nextIdx < pts.length && pts[nextIdx]) ? getObjectUniqueId(pts[nextIdx]) : null;
                
                if (prevPtId === previousId && nextIdx < pts.length) {
                    return pts[nextIdx];
                }
                if (nextPtId === previousId && prevIdx >= 0) {
                    return pts[prevIdx];
                }
            }
            
            if (nextIdx < pts.length) return pts[nextIdx];
            if (prevIdx >= 0) return pts[prevIdx];
            return null;
        }
        if (!fromObj || !toObj) return null;
        if (fromObj === currentObj) return toObj;
        if (toObj === currentObj) return fromObj;
        var currentId2 = getObjectUniqueId(currentObj);
        var fromId = getObjectUniqueId(fromObj);
        var toId = getObjectUniqueId(toObj);
        if (fromId === currentId2) return toObj;
        if (toId === currentId2) return fromObj;
        var currentCoords = currentObj.geometry ? currentObj.geometry.getCoordinates() : null;
        var fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
        var toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
        if (currentCoords && fromCoords && Math.abs(currentCoords[0] - fromCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - fromCoords[1]) < 0.0001) return toObj;
        if (currentCoords && toCoords && Math.abs(currentCoords[0] - toCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - toCoords[1]) < 0.0001) return fromObj;
        return null;
    }

    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };
    
    const startObjectId = getObjectUniqueId(startObject);
    const startObjType = startObject.properties.get('type');
    const startObjName = startObject.properties.get('name') || getObjectTypeName(startObjType);

    const startPort = (startObjType === 'cross') ? ((startObject.properties.get('fiberPorts') || {})[`${startCableId}-${startFiberNumber}`] || null) : null;
    path.push({
        type: 'start',
        objectType: startObjType,
        objectName: startObjName,
        object: startObject,
        port: startPort
    });
    
    visitedObjects.add(startObjectId);

    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    let currentObject = startObject;
    let previousObject = null;
    
    const maxIterations = 100;
    let iterations = 0;
    var afterSplitterInputBranch = false;
    var nextObject;
    
    while (iterations < maxIterations) {
        iterations++;

        if (afterSplitterInputBranch) {
            afterSplitterInputBranch = false;
            nextObject = currentObject;
        } else {
            const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
            path.push({
                type: 'cable',
                cableId: currentCableId,
                cableName: cableName,
                fiberNumber: currentFiberNumber,
                cable: currentCable
            });

            nextObject = getOtherEnd(currentCable, currentObject, previousObject);
            
            if (!nextObject) break;
            
            path.push({
                type: 'object',
                objectType: nextObject.properties.get('type'),
                objectName: nextObject.properties.get('name') || getObjectTypeName(nextObject.properties.get('type')),
                object: nextObject,
                port: (nextObject.properties.get('type') === 'cross') ? ((nextObject.properties.get('fiberPorts') || {})[currentCableId + '-' + currentFiberNumber] || null) : null
            });
        }
        
        const nextObjectId = getObjectUniqueId(nextObject);
        if (visitedObjects.has(nextObjectId)) break;
        visitedObjects.add(nextObjectId);
        
        const objType = nextObject.properties.get('type');
        const objName = nextObject.properties.get('name') || getObjectTypeName(objType);

        if (objType === 'splitter') {
            const inputFiber = nextObject.properties.get('inputFiber') || getSplitterRootInputFiber(nextObject) || null;
            const outputConnections = nextObject.properties.get('outputConnections') || [];
            const isInputFiber = inputFiber && currentCableId === inputFiber.cableId && currentFiberNumber === inputFiber.fiberNumber;
            const outputIndexByCable = outputConnections.findIndex(function(o) { return o && o.cableId === currentCableId && o.fiberNumber === currentFiberNumber; });
            if (isInputFiber && outputConnections.length > 0) {
                const firstOutWithCable = outputConnections.find(function(o) { return o && o.cableId; });
                if (firstOutWithCable) {
                    const outCable = findCableById(firstOutWithCable.cableId);
                    if (outCable) {
                        const otherEnd = getOtherEndOfCable(outCable, nextObject);
                        if (otherEnd) {
                            path.push({ type: 'cable', cableId: firstOutWithCable.cableId, cableName: outCable.properties.get('cableName') || getCableDescription(outCable.properties.get('cableType')), fiberNumber: firstOutWithCable.fiberNumber, cable: outCable });
                            path.push({ type: 'object', objectType: otherEnd.properties.get('type'), objectName: otherEnd.properties.get('name') || getObjectTypeName(otherEnd.properties.get('type')), object: otherEnd, port: null });
                            currentCableId = firstOutWithCable.cableId;
                            currentFiberNumber = firstOutWithCable.fiberNumber;
                            currentCable = outCable;
                            currentObject = otherEnd;
                            afterSplitterInputBranch = true;
                        }
                    }
                } else {
                    var inCable = findCableById(inputFiber.cableId);
                    var inputOtherEnd = inCable ? getOtherEndOfCable(inCable, nextObject) : null;
                    if (inputOtherEnd) {
                        path.push({ type: 'cable', cableId: inputFiber.cableId, cableName: inCable.properties.get('cableName') || getCableDescription(inCable.properties.get('cableType')), fiberNumber: inputFiber.fiberNumber, cable: inCable });
                        path.push({ type: 'object', objectType: inputOtherEnd.properties.get('type'), objectName: inputOtherEnd.properties.get('name') || getObjectTypeName(inputOtherEnd.properties.get('type')), object: inputOtherEnd, port: null });
                        currentCableId = inputFiber.cableId;
                        currentFiberNumber = inputFiber.fiberNumber;
                        currentCable = inCable;
                        currentObject = inputOtherEnd;
                        afterSplitterInputBranch = true;
                    } else {
                        var firstOutOnu = outputConnections.find(function(o) { return o && o.onuId; });
                        var firstOutSplitter = outputConnections.find(function(o) { return o && o.splitterId; });
                        if (firstOutOnu) {
                            var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === firstOutOnu.onuId; });
                            if (onuObj) {
                                path.push({ type: 'splitterOutputToOnu', splitter: nextObject, onuObj: onuObj, onuName: onuObj.properties.get('name') || 'ONU' });
                                path.push({ type: 'object', objectType: 'onu', objectName: onuObj.properties.get('name') || 'ONU', object: onuObj, port: null });
                                break;
                            }
                        }
                        if (firstOutSplitter) {
                            var childSplitter = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === firstOutSplitter.splitterId; });
                            if (childSplitter) {
                                var childInput = childSplitter.properties.get('inputFiber') || getSplitterRootInputFiber(childSplitter);
                                if (childInput && childInput.cableId) {
                                    path.push({ type: 'splitterOutputToSplitter', fromSplitter: nextObject, toSplitter: childSplitter });
                                    path.push({ type: 'object', objectType: 'splitter', objectName: childSplitter.properties.get('name') || 'Сплиттер', object: childSplitter, port: null });
                                    currentObject = childSplitter;
                                    currentCableId = childInput.cableId;
                                    currentFiberNumber = childInput.fiberNumber;
                                    currentCable = findCableById(childInput.cableId);
                                    afterSplitterInputBranch = true;
                                } else {
                                    currentObject = null;
                                    break;
                                }
                            } else {
                                currentObject = null;
                                break;
                            }
                        } else {
                            currentObject = null;
                            break;
                        }
                    }
                }
            } else if (inputFiber && outputIndexByCable >= 0) {
                const inCable = findCableById(inputFiber.cableId);
                if (inCable) {
                    const inputOtherEnd = getOtherEndOfCable(inCable, nextObject);
                    if (inputOtherEnd) {
                        path.push({
                            type: 'cable',
                            cableId: inputFiber.cableId,
                            cableName: inCable.properties.get('cableName') || getCableDescription(inCable.properties.get('cableType')),
                            fiberNumber: inputFiber.fiberNumber,
                            cable: inCable
                        });
                        path.push({
                            type: 'object',
                            objectType: inputOtherEnd.properties.get('type'),
                            objectName: inputOtherEnd.properties.get('name') || getObjectTypeName(inputOtherEnd.properties.get('type')),
                            object: inputOtherEnd,
                            port: null
                        });
                        currentCableId = inputFiber.cableId;
                        currentFiberNumber = inputFiber.fiberNumber;
                        currentCable = inCable;
                        currentObject = inputOtherEnd;
                        afterSplitterInputBranch = true;
                    }
                }
            } else {
                break;
            }
            continue;
        }

        if (objType === 'olt') {
            const portAssignments = nextObject.properties.get('portAssignments') || {};
            let foundPort = null;
            for (const portKey in portAssignments) {
                const pa = portAssignments[portKey];
                if (pa && pa.cableId === currentCableId && pa.fiberNumber === currentFiberNumber) {
                    foundPort = parseInt(portKey, 10);
                    break;
                }
            }
            if (foundPort !== null) {
                path.push({
                    type: 'oltPortConnection',
                    cableId: currentCableId,
                    fiberNumber: currentFiberNumber,
                    oltName: nextObject.properties.get('name') || 'OLT',
                    portNumber: foundPort,
                    olt: nextObject
                });
            }
            break;
        }
        if (objType === 'onu') {
            break;
        }
        if (objType === 'mediaConverter') {
            break;
        }
        if (objType === 'sleeve' || objType === 'cross') {
            const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
            if (objType === 'cross') {
                const onuConnections = nextObject.properties.get('onuConnections') || {};
                const onuConn = onuConnections[nodeConnKey];
                if (onuConn) {
                    const connectedOnu = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'onu' && obj.properties.get('uniqueId') === onuConn.onuId
                    );
                    if (connectedOnu) {
                        path.push({ type: 'onuConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, onuName: onuConn.onuName || 'ONU', cross: nextObject, onu: connectedOnu });
                        path.push({ type: 'object', objectType: 'onu', objectName: connectedOnu.properties.get('name') || 'ONU', object: connectedOnu });
                    }
                    break;
                }
                const mediaConverterConnections = nextObject.properties.get('mediaConverterConnections') || {};
                const mcConn = mediaConverterConnections[nodeConnKey];
                if (mcConn && mcConn.mediaConverterId) {
                    const connectedMc = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'mediaConverter' && obj.properties.get('uniqueId') === mcConn.mediaConverterId
                    );
                    if (connectedMc) {
                        path.push({ type: 'mediaConverterConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, mediaConverterName: mcConn.mediaConverterName || 'Медиаконвертер', cross: nextObject, mediaConverter: connectedMc });
                        path.push({ type: 'object', objectType: 'mediaConverter', objectName: connectedMc.properties.get('name') || 'Медиаконвертер', object: connectedMc, port: null });
                    }
                    break;
                }
                const nodeConnections = nextObject.properties.get('nodeConnections') || {};
                let nodeConn = nodeConnections[nodeConnKey];
                let nodeConnCableId = currentCableId;
                let nodeConnFiberNumber = currentFiberNumber;
                
                if (!nodeConn) {
                    const crossFiberConns = nextObject.properties.get('fiberConnections') || [];
                    for (var cfi = 0; cfi < crossFiberConns.length; cfi++) {
                        var cfc = crossFiberConns[cfi];
                        var linkedKey = null;
                        if (cfc.from && cfc.from.cableId === currentCableId && cfc.from.fiberNumber === currentFiberNumber) {
                            linkedKey = cfc.to.cableId + '-' + cfc.to.fiberNumber;
                            nodeConnCableId = cfc.to.cableId;
                            nodeConnFiberNumber = cfc.to.fiberNumber;
                        } else if (cfc.to && cfc.to.cableId === currentCableId && cfc.to.fiberNumber === currentFiberNumber) {
                            linkedKey = cfc.from.cableId + '-' + cfc.from.fiberNumber;
                            nodeConnCableId = cfc.from.cableId;
                            nodeConnFiberNumber = cfc.from.fiberNumber;
                        }
                        if (linkedKey && nodeConnections[linkedKey]) {
                            nodeConn = nodeConnections[linkedKey];
                            break;
                        }
                    }
                }
                
                if (nodeConn) {
                    const connectedNode = objects.find(obj => 
                        obj.properties && obj.properties.get('type') === 'node' && obj.properties.get('uniqueId') === nodeConn.nodeId
                    );
                    if (connectedNode) {
                        if (nodeConnCableId !== currentCableId || nodeConnFiberNumber !== currentFiberNumber) {
                            const crossFiberConnsForLabel = nextObject.properties.get('fiberConnections') || [];
                            const fiberLabels = nextObject.properties.get('fiberLabels') || {};
                            const fromLabel = fiberLabels[nodeConnKey] || '';
                            const toLabel = fiberLabels[nodeConnCableId + '-' + nodeConnFiberNumber] || '';
                            path.push({
                                type: 'connection',
                                fromCableId: currentCableId,
                                fromFiberNumber: currentFiberNumber,
                                fromLabel: fromLabel,
                                fromCableType: currentCable ? currentCable.properties.get('cableType') : null,
                                toCableId: nodeConnCableId,
                                toFiberNumber: nodeConnFiberNumber,
                                toLabel: toLabel,
                                toCableType: null,
                                sleeve: nextObject
                            });
                        }
                        path.push({ type: 'nodeConnection', cableId: nodeConnCableId, fiberNumber: nodeConnFiberNumber, nodeName: nodeConn.nodeName, cross: nextObject, node: connectedNode });
                        path.push({ type: 'object', objectType: 'node', objectName: connectedNode.properties.get('name') || 'Узел сети', object: connectedNode });
                    }
                    break;
                }
            }
            if (objType === 'sleeve') {
                const onuConnectionsS = nextObject.properties.get('onuConnections') || {};
                const onuConnS = onuConnectionsS[nodeConnKey];
                if (onuConnS) {
                    const connectedOnuS = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'onu' && obj.properties.get('uniqueId') === onuConnS.onuId
                    );
                    if (connectedOnuS) {
                        path.push({ type: 'onuConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, onuName: onuConnS.onuName || 'ONU', cross: nextObject, onu: connectedOnuS });
                        path.push({ type: 'object', objectType: 'onu', objectName: connectedOnuS.properties.get('name') || 'ONU', object: connectedOnuS });
                    }
                    break;
                }
                const mcConnSleeve = (nextObject.properties.get('mediaConverterConnections') || {})[nodeConnKey];
                if (mcConnSleeve && mcConnSleeve.mediaConverterId) {
                    const connectedMcS = objects.find(obj =>
                        obj.properties && obj.properties.get('type') === 'mediaConverter' && obj.properties.get('uniqueId') === mcConnSleeve.mediaConverterId
                    );
                    if (connectedMcS) {
                        path.push({ type: 'mediaConverterConnection', cableId: currentCableId, fiberNumber: currentFiberNumber, mediaConverterName: mcConnSleeve.mediaConverterName || 'Медиаконвертер', cross: nextObject, mediaConverter: connectedMcS });
                        path.push({ type: 'object', objectType: 'mediaConverter', objectName: connectedMcS.properties.get('name') || 'Медиаконвертер', object: connectedMcS, port: null });
                    }
                    break;
                }
            }
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);

            var nextFiber = findFiberConnection(currentCableId, currentFiberNumber, nextObject);
            if (!nextFiber) {
                var splitterConns = nextObject.properties.get('splitterConnections') || {};
                var scEntry = splitterConns[nodeConnKey];
                if (scEntry && scEntry.splitterId) {
                    var spObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === scEntry.splitterId; });
                    if (spObj) {
                        var cableToSplitter = findCableById(currentCableId);
                        var splitterEnd = cableToSplitter ? getOtherEnd(cableToSplitter, nextObject) : null;
                        var isPhysicalLink = splitterEnd && getObjectUniqueId(splitterEnd) === getObjectUniqueId(spObj);
                        if (cableToSplitter) {
                            if (isPhysicalLink) {
                                path.push({ type: 'cable', cableId: currentCableId, cableName: cableToSplitter.properties.get('cableName') || getCableDescription(cableToSplitter.properties.get('cableType')), fiberNumber: currentFiberNumber, cable: cableToSplitter });
                            } else {
                                path.push({ type: 'splitterConnection', sleeve: nextObject, splitter: spObj, cableId: currentCableId, fiberNumber: currentFiberNumber });
                            }
                        } else {
                            path.push({ type: 'splitterConnection', sleeve: nextObject, splitter: spObj, cableId: currentCableId, fiberNumber: currentFiberNumber });
                        }
                        path.push({ type: 'object', objectType: 'splitter', objectName: spObj.properties.get('name') || 'Сплиттер', object: spObj, port: null });
                        currentObject = spObj;
                        currentCableId = currentCableId;
                        currentFiberNumber = currentFiberNumber;
                        currentCable = cableToSplitter || currentCable;
                        afterSplitterInputBranch = true;
                        continue;
                    }
                }
                break;
            }

            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;

            const fiberLabels = nextObject.properties.get('fiberLabels') || {};
            const fromLabel = fiberLabels[`${currentCableId}-${currentFiberNumber}`] || '';
            const toLabel = fiberLabels[`${nextFiber.cableId}-${nextFiber.fiberNumber}`] || '';

            const fromCableType = currentCable ? currentCable.properties.get('cableType') : null;
            const toCableType = nextCable ? nextCable.properties.get('cableType') : null;
            
            path.push({
                type: 'connection',
                fromCableId: currentCableId,
                fromFiberNumber: currentFiberNumber,
                fromLabel: fromLabel,
                fromCableType: fromCableType,
                toCableId: nextFiber.cableId,
                toFiberNumber: nextFiber.fiberNumber,
                toLabel: toLabel,
                toCableType: toCableType,
                sleeve: nextObject
            });

            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;
            previousObject = currentObject;
            currentObject = nextObject;
            
        } else if (objType === 'support' || objType === 'attachment') {
            var pts = currentCable.properties.get('points');
            if (pts && Array.isArray(pts) && pts.length > 2) {
                var currentIdx = -1;
                var nextObjId = getObjectUniqueId(nextObject);
                for (var pi = 0; pi < pts.length; pi++) {
                    if (pts[pi] === nextObject || (pts[pi] && getObjectUniqueId(pts[pi]) === nextObjId)) {
                        currentIdx = pi;
                        break;
                    }
                }
                if (currentIdx !== -1) {
                    var prevObjId = previousObject ? getObjectUniqueId(previousObject) : null;
                    var nextPointIdx = -1;
                    
                    if (prevObjId) {
                        var prevIdx = currentIdx - 1;
                        var nextIdx = currentIdx + 1;
                        var prevPtId = (prevIdx >= 0 && pts[prevIdx]) ? getObjectUniqueId(pts[prevIdx]) : null;
                        var nextPtId = (nextIdx < pts.length && pts[nextIdx]) ? getObjectUniqueId(pts[nextIdx]) : null;
                        
                        if (prevPtId === prevObjId && nextIdx < pts.length) {
                            nextPointIdx = nextIdx;
                        } else if (nextPtId === prevObjId && prevIdx >= 0) {
                            nextPointIdx = prevIdx;
                        }
                    }
                    
                    if (nextPointIdx === -1) {
                        if (currentIdx < pts.length - 1) nextPointIdx = currentIdx + 1;
                        else if (currentIdx > 0) nextPointIdx = currentIdx - 1;
                    }
                    
                    if (nextPointIdx !== -1 && nextPointIdx >= 0 && nextPointIdx < pts.length) {
                        previousObject = currentObject;
                        currentObject = nextObject;
                        continue;
                    }
                }
            }
            break;
        } else {
            
            break;
        }
    }

    function findNextCableThroughObject(obj, excludeCable) {
        const objCoords = obj.geometry ? obj.geometry.getCoordinates() : null;
        const objId = getObjectUniqueId(obj);
        const excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;

        for (const cable of objects) {
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            
            const cableId = cable.properties.get('uniqueId');
            if (excludeId && cableId === excludeId) continue;
            
            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            
            if (!fromObj || !toObj) continue;

            if (fromObj === obj || toObj === obj) {
                return cable;
            }

            const fromId = getObjectUniqueId(fromObj);
            const toId = getObjectUniqueId(toObj);
            
            if (objId && (fromId === objId || toId === objId)) {
                return cable;
            }

            if (objCoords) {
                const fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
                const toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
                
                if (fromCoords && Math.abs(fromCoords[0] - objCoords[0]) < 0.0001 && Math.abs(fromCoords[1] - objCoords[1]) < 0.0001) {
                    return cable;
                }
                if (toCoords && Math.abs(toCoords[0] - objCoords[0]) < 0.0001 && Math.abs(toCoords[1] - objCoords[1]) < 0.0001) {
                    return cable;
                }
            }
        }
        
        return null;
    }
    
    return { path, error: null };
}

function traceAllFiberPathsFromObject(startObject, startCableId, startFiberNumber) {
    const first = traceFiberPathFromObject(startObject, startCableId, startFiberNumber);
    if (first.error) return { paths: [], error: first.error };
    var paths = [ first.path ];
    var startType = startObject.properties ? startObject.properties.get('type') : '';
    if (startType === 'sleeve' || startType === 'cross') {
        var conns = startObject.properties.get('fiberConnections') || [];
        for (var ci = 0; ci < conns.length; ci++) {
            var c = conns[ci];
            var otherCable = null, otherFiber = null;
            if (c.from && c.from.cableId === startCableId && c.from.fiberNumber === startFiberNumber) { otherCable = c.to.cableId; otherFiber = c.to.fiberNumber; }
            else if (c.to && c.to.cableId === startCableId && c.to.fiberNumber === startFiberNumber) { otherCable = c.from.cableId; otherFiber = c.from.fiberNumber; }
            if (otherCable && otherFiber) {
                var alt = traceFiberPathFromObject(startObject, otherCable, otherFiber);
                if (!alt.error && alt.path.length > 0) paths.push(alt.path);
            }
        }
    }
    const maxExpand = 100;
    var expandedKeys = new Set();
    function expandKey(prefix, sp) { return (prefix.length ? prefix.length + '-' : '') + getObjectUniqueId(sp); }
    var anyExpanded = true;
    while (anyExpanded) {
        anyExpanded = false;
        for (var pi = 0; pi < paths.length && paths.length < maxExpand; pi++) {
            var path = paths[pi];
            var splitterIdx = -1;
            var splitterObj = null;
            for (var i = path.length - 1; i >= 0; i--) {
                if (path[i].type === 'object' && path[i].objectType === 'splitter') {
                    splitterIdx = i;
                    splitterObj = path[i].object;
                    break;
                }
            }
            if (splitterIdx < 0 || !splitterObj) continue;
            var prefix = path.slice(0, splitterIdx + 1);
            var key = expandKey(prefix, splitterObj);
            if (expandedKeys.has(key)) continue;
            expandedKeys.add(key);
            var inputFiber = splitterObj.properties.get('inputFiber') || getSplitterRootInputFiber(splitterObj);
            var outputConnections = splitterObj.properties.get('outputConnections') || [];
            if (!inputFiber) continue;
            var hasCableOutputs = outputConnections.some(function(o) { return o && o.cableId; });
            if (hasCableOutputs) {
                for (var oi = 0; oi < outputConnections.length; oi++) {
                    var out = outputConnections[oi];
                    if (!out || !out.cableId) continue;
                    var outCable = objects.find(function(c) { return c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === out.cableId; });
                    if (!outCable) continue;
                    var otherEnd = getOtherEndOfCable(outCable, splitterObj);
                    if (!otherEnd) continue;
                    var sub = traceFiberPathFromObject(otherEnd, out.cableId, out.fiberNumber);
                    if (sub.error || !sub.path.length) continue;
                    paths.push(prefix.concat(sub.path.slice(1)));
                    anyExpanded = true;
                }
            }
            for (var oi2 = 0; oi2 < outputConnections.length; oi2++) {
                var out2 = outputConnections[oi2];
                if (!out2) continue;
                if (out2.onuId) {
                    var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out2.onuId; });
                    if (onuObj) {
                        var suffix = [
                            { type: 'splitterOutputToOnu', splitter: splitterObj, onuObj: onuObj, onuName: onuObj.properties.get('name') || 'ONU' },
                            { type: 'object', objectType: 'onu', objectName: onuObj.properties.get('name') || 'ONU', object: onuObj, port: null }
                        ];
                        paths.push(prefix.concat(suffix));
                        anyExpanded = true;
                    }
                } else if (out2.splitterId) {
                    var targetSplitter = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === out2.splitterId; });
                    if (targetSplitter) {
                        var targetOutputs = targetSplitter.properties.get('outputConnections') || [];
                        var midSuffix = [
                            { type: 'splitterOutputToSplitter', fromSplitter: splitterObj, toSplitter: targetSplitter },
                            { type: 'object', objectType: 'splitter', objectName: targetSplitter.properties.get('name') || 'Сплиттер', object: targetSplitter, port: null }
                        ];
                        paths.push(prefix.concat(midSuffix));
                        anyExpanded = true;
                        for (var toi = 0; toi < targetOutputs.length; toi++) {
                            var tout = targetOutputs[toi];
                            if (tout && tout.onuId) {
                                var onuObj2 = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === tout.onuId; });
                                if (onuObj2) {
                                    paths.push(prefix.concat(midSuffix, [
                                        { type: 'splitterOutputToOnu', splitter: targetSplitter, onuObj: onuObj2, onuName: onuObj2.properties.get('name') || 'ONU' },
                                        { type: 'object', objectType: 'onu', objectName: onuObj2.properties.get('name') || 'ONU', object: onuObj2, port: null }
                                    ]));
                                    anyExpanded = true;
                                }
                            } else if (tout && tout.splitterId) {
                                var sp3 = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === tout.splitterId; });
                                if (sp3) {
                                    var mid2 = midSuffix.concat([
                                        { type: 'splitterOutputToSplitter', fromSplitter: targetSplitter, toSplitter: sp3 },
                                        { type: 'object', objectType: 'splitter', objectName: sp3.properties.get('name') || 'Сплиттер', object: sp3, port: null }
                                    ]);
                                    var out3 = sp3.properties.get('outputConnections') || [];
                                    for (var t2 = 0; t2 < out3.length; t2++) {
                                        if (out3[t2] && out3[t2].onuId) {
                                            var onu3 = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out3[t2].onuId; });
                                            if (onu3) {
                                                paths.push(prefix.concat(mid2, [
                                                    { type: 'splitterOutputToOnu', splitter: sp3, onuObj: onu3, onuName: onu3.properties.get('name') || 'ONU' },
                                                    { type: 'object', objectType: 'onu', objectName: onu3.properties.get('name') || 'ONU', object: onu3, port: null }
                                                ]));
                                                anyExpanded = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return { paths: paths, error: null };
}

function isFiberConnectedToOlt(sleeveObj, cableId, fiberNumber) {
    var key = cableId + '-' + fiberNumber;
    var oltConn = sleeveObj.properties ? sleeveObj.properties.get('oltConnections') : null;
    if (oltConn && oltConn[key]) return true;
    var oltFiberKeys = new Set();
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var t = obj.properties.get('type');
        if (t === 'cross' || t === 'sleeve') {
            var oc = obj.properties.get('oltConnections') || {};
            Object.keys(oc).forEach(function(k) { oltFiberKeys.add(k); });
        }
        if (t === 'olt') {
            var pa = obj.properties.get('portAssignments') || {};
            Object.keys(pa).forEach(function(k) {
                var a = pa[k];
                if (a && a.cableId && a.fiberNumber != null) oltFiberKeys.add(a.cableId + '-' + a.fiberNumber);
            });
        }
    });
    if (oltFiberKeys.has(key)) return true;
    try {
        var res = traceAllFiberPathsFromObject(sleeveObj, cableId, fiberNumber);
        if (res.error || !res.paths) return false;
        return res.paths.some(function(p) {
            if (p.some(function(item) { return item.type === 'object' && item.objectType === 'olt'; })) return true;
            for (var i = 0; i < p.length; i++) {
                var item = p[i];
                if (item.type === 'object' && item.object && (item.objectType === 'cross' || item.objectType === 'sleeve')) {
                    var cid = null, fn = null;
                    if (i > 0 && p[i - 1].type === 'cable') { cid = p[i - 1].cableId; fn = p[i - 1].fiberNumber; }
                    if (cid && fn != null) {
                        var oc2 = item.object.properties.get('oltConnections') || {};
                        if (oc2[cid + '-' + fn]) return true;
                    }
                }
                if (item.type === 'cable' && item.cableId && item.fiberNumber != null && oltFiberKeys.has(item.cableId + '-' + item.fiberNumber)) return true;
            }
            return false;
        });
    } catch (e) { return false; }
}

function traceFiberPath(startCableId, startFiberNumber) {
    const path = [];
    const visitedFibers = new Set();
    const visitedObjects = new Set();

    function findFiberConnection(cableId, fiberNumber, sleeveObj) {
        const connections = sleeveObj.properties.get('fiberConnections') || [];
        
        for (const conn of connections) {
            if (conn.from.cableId === cableId && conn.from.fiberNumber === fiberNumber) {
                return { cableId: conn.to.cableId, fiberNumber: conn.to.fiberNumber };
            }
            if (conn.to.cableId === cableId && conn.to.fiberNumber === fiberNumber) {
                return { cableId: conn.from.cableId, fiberNumber: conn.from.fiberNumber };
            }
        }
        return null;
    }

    function findCableById(cableId) {
        return objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'cable' &&
            obj.properties.get('uniqueId') === cableId
        );
    }

    function getOtherEnd(cable, currentObj, previousObj) {
        var pts = cable.properties.get('points');
        var fromObj = cable.properties.get('from');
        var toObj = cable.properties.get('to');
        if (pts && pts.length > 2) {
            var currentId = getObjectUniqueId(currentObj);
            var previousId = previousObj ? getObjectUniqueId(previousObj) : null;
            var idx = -1;
            for (var i = 0; i < pts.length; i++) {
                if (pts[i] === currentObj || (pts[i] && getObjectUniqueId(pts[i]) === currentId)) { idx = i; break; }
            }
            if (idx === -1) return null;
            
            var nextIdx = idx + 1;
            var prevIdx = idx - 1;
            
            if (previousId) {
                var prevPtId = (prevIdx >= 0 && pts[prevIdx]) ? getObjectUniqueId(pts[prevIdx]) : null;
                var nextPtId = (nextIdx < pts.length && pts[nextIdx]) ? getObjectUniqueId(pts[nextIdx]) : null;
                
                if (prevPtId === previousId && nextIdx < pts.length) {
                    return pts[nextIdx];
                }
                if (nextPtId === previousId && prevIdx >= 0) {
                    return pts[prevIdx];
                }
            }
            
            if (nextIdx < pts.length) return pts[nextIdx];
            if (prevIdx >= 0) return pts[prevIdx];
            return null;
        }
        if (!fromObj || !toObj) return null;
        if (fromObj === currentObj) return toObj;
        if (toObj === currentObj) return fromObj;
        var currentId2 = getObjectUniqueId(currentObj);
        var fromId = getObjectUniqueId(fromObj);
        var toId = getObjectUniqueId(toObj);
        if (fromId === currentId2) return toObj;
        if (toId === currentId2) return fromObj;
        var currentCoords = currentObj.geometry ? currentObj.geometry.getCoordinates() : null;
        var fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
        var toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
        if (currentCoords && fromCoords && Math.abs(currentCoords[0] - fromCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - fromCoords[1]) < 0.0001) return toObj;
        if (currentCoords && toCoords && Math.abs(currentCoords[0] - toCoords[0]) < 0.0001 && Math.abs(currentCoords[1] - toCoords[1]) < 0.0001) return fromObj;
        return null;
    }

    const startCable = findCableById(startCableId);
    if (!startCable) return { path: [], error: 'Кабель не найден' };

    let currentCableId = startCableId;
    let currentFiberNumber = startFiberNumber;
    let currentCable = startCable;
    let previousObject = null;

    const fromObj = currentCable.properties.get('from');
    const toObj = currentCable.properties.get('to');
    const cableName = currentCable.properties.get('cableName') || getCableDescription(currentCable.properties.get('cableType'));
    
    const fromObjType = fromObj.properties.get('type');
    const fromPort = (fromObjType === 'cross') ? ((fromObj.properties.get('fiberPorts') || {})[`${startCableId}-${startFiberNumber}`] || null) : null;
    path.push({
        type: 'start',
        objectType: fromObjType,
        objectName: fromObj.properties.get('name') || getObjectTypeName(fromObjType),
        object: fromObj,
        port: fromPort
    });
    
    path.push({
        type: 'cable',
        cableId: currentCableId,
        cableName: cableName,
        fiberNumber: currentFiberNumber,
        cable: currentCable
    });

    let currentObject = toObj;
    const maxIterations = 100;
    let iterations = 0;
    
    while (iterations < maxIterations) {
        iterations++;
        
        if (!currentObject) break;
        
        const currentObjectId = getObjectUniqueId(currentObject);

        if (visitedObjects.has(currentObjectId)) break;
        visitedObjects.add(currentObjectId);
        
        const objType = currentObject.properties.get('type');
        const objName = currentObject.properties.get('name') || getObjectTypeName(objType);
        const objPort = (objType === 'cross') ? ((currentObject.properties.get('fiberPorts') || {})[`${currentCableId}-${currentFiberNumber}`] || null) : null;
        
        path.push({
            type: 'object',
            objectType: objType,
            objectName: objName,
            object: currentObject,
            port: objPort
        });

        if (objType === 'sleeve' || objType === 'cross') {
            const nodeConnKey = `${currentCableId}-${currentFiberNumber}`;
            if (objType === 'cross') {
                const nodeConnections = currentObject.properties.get('nodeConnections') || {};
                let nodeConn = nodeConnections[nodeConnKey];
                let nodeConnCableId = currentCableId;
                let nodeConnFiberNumber = currentFiberNumber;
                
                if (!nodeConn) {
                    const crossFiberConns = currentObject.properties.get('fiberConnections') || [];
                    for (var cfi2 = 0; cfi2 < crossFiberConns.length; cfi2++) {
                        var cfc2 = crossFiberConns[cfi2];
                        var linkedKey2 = null;
                        if (cfc2.from && cfc2.from.cableId === currentCableId && cfc2.from.fiberNumber === currentFiberNumber) {
                            linkedKey2 = cfc2.to.cableId + '-' + cfc2.to.fiberNumber;
                            nodeConnCableId = cfc2.to.cableId;
                            nodeConnFiberNumber = cfc2.to.fiberNumber;
                        } else if (cfc2.to && cfc2.to.cableId === currentCableId && cfc2.to.fiberNumber === currentFiberNumber) {
                            linkedKey2 = cfc2.from.cableId + '-' + cfc2.from.fiberNumber;
                            nodeConnCableId = cfc2.from.cableId;
                            nodeConnFiberNumber = cfc2.from.fiberNumber;
                        }
                        if (linkedKey2 && nodeConnections[linkedKey2]) {
                            nodeConn = nodeConnections[linkedKey2];
                            break;
                        }
                    }
                }
                
                if (nodeConn) {
                    const connectedNode = objects.find(obj => 
                        obj.properties && obj.properties.get('type') === 'node' && obj.properties.get('uniqueId') === nodeConn.nodeId
                    );
                    if (connectedNode) {
                        if (nodeConnCableId !== currentCableId || nodeConnFiberNumber !== currentFiberNumber) {
                            const fiberLabels2 = currentObject.properties.get('fiberLabels') || {};
                            const fromLabel2 = fiberLabels2[nodeConnKey] || '';
                            const toLabel2 = fiberLabels2[nodeConnCableId + '-' + nodeConnFiberNumber] || '';
                            path.push({
                                type: 'connection',
                                fromCableId: currentCableId,
                                fromFiberNumber: currentFiberNumber,
                                fromLabel: fromLabel2,
                                fromCableType: currentCable ? currentCable.properties.get('cableType') : null,
                                toCableId: nodeConnCableId,
                                toFiberNumber: nodeConnFiberNumber,
                                toLabel: toLabel2,
                                toCableType: null,
                                sleeve: currentObject
                            });
                        }
                        path.push({ type: 'nodeConnection', cableId: nodeConnCableId, fiberNumber: nodeConnFiberNumber, nodeName: nodeConn.nodeName, cross: currentObject, node: connectedNode });
                        path.push({ type: 'object', objectType: 'node', objectName: connectedNode.properties.get('name') || 'Узел сети', object: connectedNode });
                    }
                    break;
                }
            }
            const fiberKey = `${currentCableId}-${currentFiberNumber}`;
            if (visitedFibers.has(fiberKey)) break;
            visitedFibers.add(fiberKey);

            const nextFiber = findFiberConnection(currentCableId, currentFiberNumber, currentObject);
            
            if (!nextFiber) {
                
                break;
            }

            const nextCable = findCableById(nextFiber.cableId);
            if (!nextCable) break;

            const fiberLabels = currentObject.properties.get('fiberLabels') || {};
            const fromLabel = fiberLabels[`${currentCableId}-${currentFiberNumber}`] || '';
            const toLabel = fiberLabels[`${nextFiber.cableId}-${nextFiber.fiberNumber}`] || '';

            const fromCableType = currentCable ? currentCable.properties.get('cableType') : null;
            const toCableType = nextCable ? nextCable.properties.get('cableType') : null;
            
            path.push({
                type: 'connection',
                fromCableId: currentCableId,
                fromFiberNumber: currentFiberNumber,
                fromLabel: fromLabel,
                fromCableType: fromCableType,
                toCableId: nextFiber.cableId,
                toFiberNumber: nextFiber.fiberNumber,
                toLabel: toLabel,
                toCableType: toCableType,
                sleeve: currentObject
            });

            currentCableId = nextFiber.cableId;
            currentFiberNumber = nextFiber.fiberNumber;
            currentCable = nextCable;

            const nextCableName = nextCable.properties.get('cableName') || getCableDescription(nextCable.properties.get('cableType'));
            path.push({
                type: 'cable',
                cableId: currentCableId,
                cableName: nextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCable
            });

            const nextObject = getOtherEnd(nextCable, currentObject, previousObject);
            
            if (!nextObject) {
                
                break;
            }
            
            previousObject = currentObject;
            currentObject = nextObject;
        } else if (objType === 'support') {
            
            const nextCableForSupport = findNextCableThroughSupport(currentObject, currentCable);
            
            if (!nextCableForSupport) {
                
                break;
            }

            const supportNextCableName = nextCableForSupport.properties.get('cableName') || getCableDescription(nextCableForSupport.properties.get('cableType'));
            const supportNextCableId = nextCableForSupport.properties.get('uniqueId');
            
            path.push({
                type: 'cable',
                cableId: supportNextCableId,
                cableName: supportNextCableName,
                fiberNumber: currentFiberNumber,
                cable: nextCableForSupport
            });

            const nextObjectAfterSupport = getOtherEnd(nextCableForSupport, currentObject, previousObject);
            
            if (!nextObjectAfterSupport) {
                break;
            }
            
            currentCable = nextCableForSupport;
            currentCableId = supportNextCableId;
            previousObject = currentObject;
            currentObject = nextObjectAfterSupport;

        } else {
            
            break;
        }
    }

    function findNextCableThroughSupport(supportObj, excludeCable) {
        const supportCoords = supportObj.geometry ? supportObj.geometry.getCoordinates() : null;
        const supportId = getObjectUniqueId(supportObj);
        const excludeId = excludeCable ? excludeCable.properties.get('uniqueId') : null;
        
        for (const cable of objects) {
            if (!cable.properties || cable.properties.get('type') !== 'cable') continue;
            
            const cableId = cable.properties.get('uniqueId');
            if (excludeId && cableId === excludeId) continue;
            
            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            
            if (!fromObj || !toObj) continue;

            if (fromObj === supportObj || toObj === supportObj) {
                return cable;
            }

            const fromId = getObjectUniqueId(fromObj);
            const toId = getObjectUniqueId(toObj);
            
            if (supportId && (fromId === supportId || toId === supportId)) {
                return cable;
            }

            if (supportCoords) {
                const fromCoords = fromObj.geometry ? fromObj.geometry.getCoordinates() : null;
                const toCoords = toObj.geometry ? toObj.geometry.getCoordinates() : null;
                
                if (fromCoords && Math.abs(fromCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(fromCoords[1] - supportCoords[1]) < 0.0001) {
                    return cable;
                }
                if (toCoords && Math.abs(toCoords[0] - supportCoords[0]) < 0.0001 && Math.abs(toCoords[1] - supportCoords[1]) < 0.0001) {
                    return cable;
                }
            }
        }
        
        return null;
    }
    
    return { path, iterations };
}

function showFiberTrace(cableId, fiberNumber) {
    const result = traceFiberPath(cableId, fiberNumber);
    
    if (result.error) {
        showError('Ошибка трассировки: ' + result.error, 'Трассировка');
        return;
    }
    
    const path = result.path;

    const modal = document.getElementById('infoModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalInfo');
    
    if (!modal || !modalContent) return;
    
    modalTitle.textContent = 'Трассировка жилы';
    resetInfoModalFiberLayout();
    updateInfoModalChrome(null, '');

    let html = '<div class="trace-result" style="padding: 10px;">';
    html += '<div style="background: #e0f2fe; padding: 12px; border-radius: 8px; margin-bottom: 15px;">';
    html += '<strong>Маршрут жилы:</strong>';
    html += '</div>';
    
    html += '<div class="trace-path" style="position: relative; padding-left: 20px;">';

    path.forEach((item, index) => {
        const isLast = index === path.length - 1;
        
        if (item.type === 'start' || item.type === 'object') {
            
            let icon = '📍';
            let color = '#6b7280';
            if (item.objectType === 'sleeve') {
                icon = '🔗';
                color = '#ef4444';
            } else if (item.objectType === 'cross') {
                icon = '📦';
                color = '#8b5cf6';
            } else if (item.objectType === 'node') {
                icon = '🖥️';
                color = '#22c55e';
            } else if (item.objectType === 'support') {
                icon = '📡';
                color = '#3b82f6';
            }
            
            const portText = (item.objectType === 'cross' && item.port) ? ` <span style="font-size: 0.8rem; color: #7c3aed; font-weight: 600;">· Порт ${escapeHtml(String(item.port))}</span>` : '';
            html += `<div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: ${isLast ? '0' : '8px'};">`;
            html += `<div style="width: 32px; height: 32px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px;">${icon}</div>`;
            html += `<div style="flex: 1; padding-top: 4px;">`;
            html += `<strong style="color: ${color};">${item.objectName}</strong>${portText}`;
            html += `<div style="font-size: 0.8rem; color: #6b7280;">${getObjectTypeName(item.objectType)}</div>`;
            html += `</div></div>`;
        } else if (item.type === 'nodeConnection') {
            html += `<div style="display: flex; align-items: center; gap: 4px; margin: 4px 0 4px 24px; font-size: 0.8rem; color: #22c55e;">`;
            html += `<span>🔌 Вывод на узел:</span>`;
            html += `<span style="background: #dcfce7; padding: 2px 6px; border-radius: 4px;">Жила ${item.fiberNumber} → ${item.nodeName}</span>`;
            html += `</div>`;
        } else if (item.type === 'cable') {
            
            const fiberColors = getFiberColors(item.cable);
            const fiber = fiberColors.find(f => f.number === item.fiberNumber);
            const fiberColor = fiber ? fiber.color : '#888';
            const fiberName = fiber ? fiber.name : `Жила ${item.fiberNumber}`;
            
            html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0 4px 12px; padding: 8px 12px; background: var(--bg-tertiary); border-radius: 6px; border-left: 4px solid ${fiberColor};">`;
            html += `<span style="font-size: 0.875rem;">📦 <strong>${item.cableName}</strong></span>`;
            html += `<span style="background: ${fiberColor}; color: ${fiberColor === '#FFFFFF' || fiberColor === '#FFFACD' ? '#000' : '#fff'}; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">Жила ${item.fiberNumber}: ${fiberName}</span>`;
            html += `</div>`;
        } else if (item.type === 'splitterConnection') {
            var spName = (item.splitter && item.splitter.properties) ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
            html += `<div style="display: flex; align-items: center; gap: 8px; margin: 4px 0 4px 12px; padding: 8px 12px; background: #fffbeb; border-radius: 6px; border-left: 4px solid #f59e0b;">`;
            html += `<span style="font-size: 0.875rem; font-weight: 600; color: #92400e;">→ Жила идёт на сплиттер «${escapeHtml(spName)}»</span><span style="color: #78716c; font-size: 0.8rem;"> (жила ${item.fiberNumber})</span>`;
            html += `</div>`;
        } else if (item.type === 'connection') {
            
            const fromCableObj = item.fromCable || (item.fromCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.fromCableId; }) : null);
            const toCableObj = item.toCable || (item.toCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.toCableId; }) : null);
            const fromFiberColors = fromCableObj ? getFiberColors(fromCableObj) : (item.fromCableType ? getFiberColors(item.fromCableType) : []);
            const toFiberColors = toCableObj ? getFiberColors(toCableObj) : (item.toCableType ? getFiberColors(item.toCableType) : []);
            const fromFiber = fromFiberColors.find(f => f.number === item.fromFiberNumber);
            const toFiber = toFiberColors.find(f => f.number === item.toFiberNumber);
            const fromColor = fromFiber ? fromFiber.color : '#6366f1';
            const toColor = toFiber ? toFiber.color : '#6366f1';
            const fromTextColor = (fromColor === '#FFFFFF' || fromColor === '#FFFACD' || fromColor === '#FFFF00') ? '#000' : '#fff';
            const toTextColor = (toColor === '#FFFFFF' || toColor === '#FFFACD' || toColor === '#FFFF00') ? '#000' : '#fff';
            const fromFiberName = fromFiber ? fromFiber.name : '';
            const toFiberName = toFiber ? toFiber.name : '';
            
            html += `<div style="display: flex; align-items: center; gap: 6px; margin: 4px 0 4px 24px; font-size: 0.8rem; color: #6366f1; flex-wrap: wrap;">`;
            html += `<span>↔️ Соединение:</span>`;
            html += `<div style="display: flex; align-items: center; gap: 4px;">`;
            html += `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${fromColor}; border: 1px solid #333;"></div>`;
            html += `<span style="background: ${fromColor}; color: ${fromTextColor}; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Ж${item.fromFiberNumber}${fromFiberName ? ` (${fromFiberName})` : ''}</span>`;
            html += `</div>`;
            if (item.fromLabel) html += `<span style="color: #8b5cf6; font-weight: 500;">[${item.fromLabel}]</span>`;
            html += `<span style="font-size: 1.1rem;">⟷</span>`;
            html += `<div style="display: flex; align-items: center; gap: 4px;">`;
            html += `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${toColor}; border: 1px solid #333;"></div>`;
            html += `<span style="background: ${toColor}; color: ${toTextColor}; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Ж${item.toFiberNumber}${toFiberName ? ` (${toFiberName})` : ''}</span>`;
            html += `</div>`;
            if (item.toLabel) html += `<span style="color: #8b5cf6; font-weight: 500;">[${item.toLabel}]</span>`;
            html += `</div>`;
        }
    });
    
    html += '</div>';

    html += '<div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">';
    html += `<button onclick="highlightTracePath()" class="btn-primary" style="width: 100%;">`;
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">';
    html += '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    html += '</svg>Показать на карте</button>';
    html += '</div>';
    
    html += '</div>';
    
    modalContent.innerHTML = html;
    modal.style.display = 'flex';
    modal.classList.add('modal--centered');

    window.currentTracePath = path;
}

let traceHighlightObjects = [];

function highlightTracePath() {
    
    clearTraceHighlight();
    
    const path = window.currentTracePath;
    if (!path || path.length === 0) return;

    path.forEach(item => {
        if (item.type === 'cable' && item.cable) {
            
            const coords = item.cable.geometry.getCoordinates();
            const highlightLine = new ymaps.Polyline(coords, {}, {
                strokeColor: '#f59e0b',
                strokeWidth: 8,
                strokeOpacity: 0.7,
                zIndex: 1500
            });
            traceHighlightObjects.push(highlightLine);
            myMap.geoObjects.add(highlightLine);
        } else if ((item.type === 'start' || item.type === 'object') && item.object) {
            
            const coords = item.object.geometry.getCoordinates();
            const highlightCircle = new ymaps.Circle([coords, 30], {}, {
                fillColor: '#f59e0b',
                fillOpacity: 0.5,
                strokeColor: '#f59e0b',
                strokeWidth: 3,
                zIndex: 1500
            });
            traceHighlightObjects.push(highlightCircle);
            myMap.geoObjects.add(highlightCircle);
        } else if (item.type === 'splitterConnection') {
            if (item.sleeve && item.sleeve.geometry) {
                const sc = item.sleeve.geometry.getCoordinates();
                const hc = new ymaps.Circle([sc, 30], {}, { fillColor: '#f59e0b', fillOpacity: 0.5, strokeColor: '#f59e0b', strokeWidth: 3, zIndex: 1500 });
                traceHighlightObjects.push(hc);
                myMap.geoObjects.add(hc);
            }
            if (item.splitter && item.splitter.geometry) {
                const spc = item.splitter.geometry.getCoordinates();
                const hc2 = new ymaps.Circle([spc, 30], {}, { fillColor: '#f59e0b', fillOpacity: 0.5, strokeColor: '#f59e0b', strokeWidth: 3, zIndex: 1500 });
                traceHighlightObjects.push(hc2);
                myMap.geoObjects.add(hc2);
            }
        }
    });

    if (traceHighlightObjects.length > 0) {
        const bounds = [];
        path.forEach(item => {
            if (item.object && item.object.geometry) {
                bounds.push(item.object.geometry.getCoordinates());
            } else if (item.type === 'splitterConnection') {
                if (item.sleeve && item.sleeve.geometry) bounds.push(item.sleeve.geometry.getCoordinates());
                if (item.splitter && item.splitter.geometry) bounds.push(item.splitter.geometry.getCoordinates());
            } else if (item.cable && item.cable.geometry) {
                const coords = item.cable.geometry.getCoordinates();
                if (Array.isArray(coords[0])) {
                    coords.forEach(c => bounds.push(c));
                } else {
                    bounds.push(coords);
                }
            }
        });
        
        if (bounds.length > 0) {
            myMap.setBounds(ymaps.util.bounds.fromPoints(bounds), {
                checkZoomRange: true,
                zoomMargin: 50
            });
        }
    }

    setTimeout(clearTraceHighlight, 10000);
}

function clearTraceHighlight() {
    traceHighlightObjects.forEach(obj => {
        myMap.geoObjects.remove(obj);
    });
    traceHighlightObjects = [];
}

let nodeConnectionLines = [];
let onuConnectionLines = [];
let oltConnectionLines = [];
let splitterConnectionLines = [];
let splitterOutputConnectionLines = [];

let nodeSelectionModalData = null;
let onuSelectionModalData = null;
let splitterSelectionModalData = null;
let splitterOutputOnuModalData = null;
let splitterOutputSplitterModalData = null;
var scrollToFiberAfterSleeveRender = null;
var savedFiberConnectionsScrollPos = null;

function getAvailableNodes() {
    return objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'node'
    );
}

function showNodeSelectionDialog(crossObj, cableId, fiberNumber) {
    const nodes = getAvailableNodes();
    
    if (nodes.length === 0) {
        showWarning('Нет доступных узлов для подключения. Сначала создайте узел сети.', 'Нет узлов');
        return;
    }

    nodeSelectionModalData = {
        crossObj: crossObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        nodes: nodes,
        phase: 'list'
    };

    const modal = document.getElementById('nodeSelectionModal');
    const fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    const searchInput = document.getElementById('nodeSearchInput');

    fiberInfo.textContent = `Подключение жилы #${fiberNumber} к узлу: выберите узел, затем свободный порт SFP/SFP+/Комбо на коммутаторе.`;

    searchInput.value = '';

    renderNodeList(nodes, '');

    modal.style.display = 'block';

    setTimeout(() => searchInput.focus(), 100);
}

function renderNodeList(nodes, searchQuery) {
    const nodeListContainer = document.getElementById('nodeListContainer');
    
    if (nodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Нет доступных узлов</p>
            </div>
        `;
        return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filteredNodes = query 
        ? nodes.filter(node => {
            const name = (node.properties.get('name') || 'Узел без имени').toLowerCase();
            return name.includes(query);
        })
        : nodes;
    
    if (filteredNodes.length === 0) {
        nodeListContainer.innerHTML = `
            <div class="node-list-no-results">
                Узлы не найдены по запросу "${searchQuery}"
            </div>
        `;
        return;
    }

    let html = '';
    filteredNodes.forEach((node, index) => {
        const name = node.properties.get('name') || 'Узел без имени';
        const coords = node.geometry.getCoordinates();
        const coordsStr = `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
        const nodeIndex = nodes.indexOf(node);

        let displayName = escapeHtml(name);
        if (query) {
            const regex = new RegExp(`(${escapeRegExpForSearch(query)})`, 'gi');
            displayName = name.replace(regex, '<mark>$1</mark>');
        }
        
        html += `
            <div class="node-list-item" data-node-index="${nodeIndex}" onclick="selectNodeFromList(${nodeIndex})">
                <div class="node-list-item-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                        <line x1="6" y1="6" x2="6.01" y2="6"></line>
                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                </div>
                <div class="node-list-item-info">
                    <div class="node-list-item-name">${displayName}</div>
                    <div class="node-list-item-coords">${coordsStr}</div>
                </div>
            </div>
        `;
    });
    
    nodeListContainer.innerHTML = html;
}

function escapeRegExpForSearch(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function selectNodeFromList(nodeIndex) {
    if (!nodeSelectionModalData) return;

    const { nodes } = nodeSelectionModalData;
    if (nodeIndex < 0 || nodeIndex >= nodes.length) return;
    const nodeObj = nodes[nodeIndex];
    const opts = collectFreeSfpPortOptionsOnNode(nodeObj);
    if (!opts.length) {
        if (typeof showError === 'function') {
            showError('В этом узле нет коммутатора со свободным портом SFP, SFP+ или Комбо RJ45/SFP. Добавьте коммутатор в карточке узла и укажите типы портов.', 'Нет SFP-порта');
        }
        return;
    }
    nodeSelectionModalData.phase = 'sfp';
    nodeSelectionModalData.selectedNode = nodeObj;
    nodeSelectionModalData.sfpOptions = opts;
    renderNodeSfpPortSelectionUI();
}

function renderNodeSfpPortSelectionUI() {
    var d = nodeSelectionModalData;
    if (!d || d.phase !== 'sfp' || !d.selectedNode || !d.sfpOptions) return;
    var container = document.getElementById('nodeListContainer');
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = 'none';
    var nodeName = escapeHtml(d.selectedNode.properties.get('name') || 'Узел');
    var opts = d.sfpOptions;
    var selOpts = opts.map(function(o, idx) {
        return '<option value="' + idx + '">' + escapeHtml(o.switchLabel) + ' — порт ' + o.port + ' (' + escapeHtml(o.portTypeLabel) + ')</option>';
    }).join('');
    var htmlSfp = '<div style="padding: 8px 0;">';
    htmlSfp += '<p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">Узел: <strong>' + nodeName + '</strong>. Жила с кросса занимает выбранный SFP-порт на коммутаторе.</p>';
    htmlSfp += '<div class="form-group" style="margin-bottom: 12px;"><label for="nodeFiberSfpSelect" style="font-size: 0.8125rem;">Порт коммутатора (SFP)</label>';
    htmlSfp += '<select id="nodeFiberSfpSelect" class="form-select">' + selOpts + '</select></div>';
    htmlSfp += '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">';
    htmlSfp += '<button type="button" id="nodeFiberBackBtn" class="btn-secondary">Назад</button>';
    htmlSfp += '<button type="button" id="nodeFiberConfirmBtn" class="btn-primary">Подключить</button></div></div>';
    if (container) container.innerHTML = htmlSfp;
}

function backNodeSelectionToList() {
    var d = nodeSelectionModalData;
    if (!d) return;
    d.phase = 'list';
    d.selectedNode = null;
    d.sfpOptions = null;
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = '';
    if (typeof renderNodeList === 'function') renderNodeList(d.nodes, searchInput ? searchInput.value : '');
}

function confirmNodeFiberToSfpPort() {
    var d = nodeSelectionModalData;
    if (!d || d.phase !== 'sfp' || !d.selectedNode) return;
    var sel = document.getElementById('nodeFiberSfpSelect');
    var idx = sel && sel.value !== '' ? parseInt(sel.value, 10) : NaN;
    if (isNaN(idx) || !d.sfpOptions || idx < 0 || idx >= d.sfpOptions.length) {
        if (typeof showError === 'function') showError('Выберите порт SFP на коммутаторе.', 'Порт');
        return;
    }
    var opt = d.sfpOptions[idx];
    var crossObj = d.crossObj;
    var cableId = d.cableId;
    var fiberNumber = d.fiberNumber;
    var nodeObj = d.selectedNode;
    closeNodeSelectionModal();
    connectFiberToNode(crossObj, cableId, fiberNumber, nodeObj, opt.switchId, opt.port);
}

function closeNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    if (modal) modal.style.display = 'none';
    var searchInput = document.getElementById('nodeSearchInput');
    var searchGroup = searchInput && searchInput.closest('.form-group');
    if (searchGroup) searchGroup.style.display = '';
    nodeSelectionModalData = null;
}

function getAvailableOnus() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'onu'
    );
}

function getAvailableMediaConverters() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'mediaConverter'
    );
}

function setFiberTargetSelectionModalMode(mode) {
    var modal = document.getElementById('onuSelectionModal');
    if (!modal) return;
    var title = modal.querySelector('.group-balloon-title');
    var labels = modal.querySelectorAll('.modal-body .form-group > label');
    var searchInput = document.getElementById('onuSearchInput');
    if (title) title.textContent = mode === 'mediaConverter' ? 'Подключение жилы к медиаконвертеру' : 'Подключение жилы к ONU';
    if (labels[0]) labels[0].textContent = mode === 'mediaConverter' ? 'Поиск медиаконвертера' : 'Поиск ONU';
    if (labels[1]) labels[1].textContent = mode === 'mediaConverter' ? 'Выберите медиаконвертер' : 'Выберите ONU';
    if (searchInput) searchInput.placeholder = mode === 'mediaConverter' ? 'Введите название медиаконвертера...' : 'Введите имя ONU...';
}

function showOnuSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const onus = getAvailableOnus();
    if (onus.length === 0) {
        showWarning('Нет доступных ONU для подключения. Сначала создайте ONU на карте.', 'Нет ONU');
        return;
    }
    onuSelectionModalData = { mode: 'onu', sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, targets: onus };
    const modal = document.getElementById('onuSelectionModal');
    const fiberInfo = document.getElementById('onuSelectionFiberInfo');
    const searchInput = document.getElementById('onuSearchInput');
    setFiberTargetSelectionModalMode('onu');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к ONU';
    if (searchInput) searchInput.value = '';
    renderOnuList('');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function showMediaConverterSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const placeId = sleeveObj.properties.get('uniqueId');
    const stMcDlg = sleeveObj.properties.get('type');
    const usageOptsMcDlg = stMcDlg === 'cross' ? { atCrossId: placeId } : { atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, usageOptsMcDlg);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const mcs = getAvailableMediaConverters();
    if (mcs.length === 0) {
        showWarning('Нет доступных медиаконвертеров. Сначала создайте медиаконвертер на карте.', 'Нет медиаконвертеров');
        return;
    }
    onuSelectionModalData = { mode: 'mediaConverter', sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, targets: mcs };
    const modal = document.getElementById('onuSelectionModal');
    const fiberInfo = document.getElementById('onuSelectionFiberInfo');
    const searchInput = document.getElementById('onuSearchInput');
    setFiberTargetSelectionModalMode('mediaConverter');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к медиаконвертеру';
    if (searchInput) searchInput.value = '';
    renderOnuList('');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function renderOnuList(searchQuery) {
    if (!onuSelectionModalData) return;
    const mode = onuSelectionModalData.mode || 'onu';
    const targets = onuSelectionModalData.targets || [];
    const container = document.getElementById('onuListContainer');
    if (!container) return;
    if (targets.length === 0) {
        container.innerHTML = '<div class="node-list-empty"><p>' + (mode === 'mediaConverter' ? 'Нет доступных медиаконвертеров' : 'Нет доступных ONU') + '</p></div>';
        return;
    }
    const query = (searchQuery || '').toLowerCase().trim();
    const defaultName = mode === 'mediaConverter' ? 'Медиаконвертер' : 'ONU';
    const filtered = query ? targets.filter(function(o) {
        var name = (o.properties.get('name') || defaultName).toLowerCase();
        return name.indexOf(query) !== -1;
    }) : targets;
    if (filtered.length === 0) {
        container.innerHTML = '<div class="node-list-no-results">' + (mode === 'mediaConverter' ? 'Медиаконвертеры не найдены по запросу' : 'ONU не найдены по запросу') + '</div>';
        return;
    }
    var html = '';
    filtered.forEach(function(obj) {
        var name = obj.properties.get('name') || defaultName;
        var idx = targets.indexOf(obj);
        html += '<div class="node-list-item" data-onu-index="' + idx + '" onclick="selectOnuFromList(' + idx + ')">';
        html += '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div></div>';
    });
    container.innerHTML = html;
}

function selectOnuFromList(onuIndex) {
    if (!onuSelectionModalData) return;
    var data = onuSelectionModalData;
    var targets = data.targets || [];
    if (onuIndex < 0 || onuIndex >= targets.length) return;
    var mode = data.mode || 'onu';
    closeOnuSelectionModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    if (mode === 'mediaConverter') {
        startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'mediaConverter', targets[onuIndex]);
    } else {
        startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'onu', targets[onuIndex]);
    }
}

function closeOnuSelectionModal() {
    var modal = document.getElementById('onuSelectionModal');
    if (modal) modal.style.display = 'none';
    onuSelectionModalData = null;
}

function initNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    if (!modal) return;
    
    const closeBtn = modal.querySelector('.close-node-selection');
    const cancelBtn = document.getElementById('cancelNodeSelection');
    const searchInput = document.getElementById('nodeSearchInput');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeNodeSelectionModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeNodeSelectionModal);
    }

    modal.addEventListener('click', function(e) {
        if (e.target.id === 'nodeFiberBackBtn') {
            e.stopPropagation();
            backNodeSelectionToList();
            return;
        }
        if (e.target.id === 'nodeFiberConfirmBtn') {
            e.stopPropagation();
            confirmNodeFiberToSfpPort();
            return;
        }
        if (e.target === modal) {
            closeNodeSelectionModal();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (nodeSelectionModalData && nodeSelectionModalData.phase === 'list') {
                renderNodeList(nodeSelectionModalData.nodes, this.value);
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            if (nodeSelectionModalData && nodeSelectionModalData.phase === 'sfp') {
                backNodeSelectionToList();
            } else {
                closeNodeSelectionModal();
            }
        }
    });
}

function initOnuSelectionModal() {
    var modal = document.getElementById('onuSelectionModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-onu-selection');
    var cancelBtn = document.getElementById('cancelOnuSelection');
    var searchInput = document.getElementById('onuSearchInput');
    if (closeBtn) closeBtn.addEventListener('click', closeOnuSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeOnuSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeOnuSelectionModal(); });
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (onuSelectionModalData) renderOnuList(this.value);
        });
    }
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeOnuSelectionModal();
    });
}

function getAvailableSplitters() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'splitter'
    );
}

function showSplitterSelectionDialog(sleeveObj, cableId, fiberNumber, excludeSplitterId) {
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = t === 'cross' ? { type: 'splitterInput', atCrossId: placeId } : { type: 'splitterInput', atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    var splitters = getAvailableSplitters();
    if (excludeSplitterId) splitters = splitters.filter(function(s) { return getObjectUniqueId(s) !== excludeSplitterId; });
    if (splitters.length === 0) {
        showWarning('Нет доступных сплиттеров для выбора. Создайте ещё один сплиттер на карте.', 'Нет сплиттеров');
        return;
    }
    splitterSelectionModalData = { sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, splitters: splitters };
    const modal = document.getElementById('splitterSelectionModal');
    const fiberInfo = document.getElementById('splitterSelectionFiberInfo');
    const splitterSelect = document.getElementById('splitterSelect');
    const confirmBtn = document.getElementById('confirmSplitterSelection');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к входу сплиттера';
    if (splitterSelect) {
        splitterSelect.innerHTML = '<option value="">— выберите сплиттер</option>';
        splitters.forEach((sp, idx) => {
            const name = sp.properties.get('name') || ('Сплиттер ' + (idx + 1));
            const uid = getObjectUniqueId(sp);
            splitterSelect.innerHTML += '<option value="' + escapeHtml(uid) + '">' + escapeHtml(name) + '</option>';
        });
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (modal) modal.style.display = 'block';
}

function closeSplitterSelectionModal() {
    const modal = document.getElementById('splitterSelectionModal');
    if (modal) modal.style.display = 'none';
    splitterSelectionModalData = null;
}

function connectFiberToSplitter(sleeveObj, cableId, fiberNumber, splitterObj) {
    const splitterId = getObjectUniqueId(splitterObj);
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = { type: 'splitterInput', splitterId: splitterId };
    if (t === 'cross') opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const key = cableId + '-' + fiberNumber;
    const prevInput = splitterObj.properties.get('inputFiber');
    if (prevInput) {
        const prevKey = prevInput.cableId + '-' + prevInput.fiberNumber;
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            const t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            let sc = slot.properties.get('splitterConnections');
            if (sc && sc[prevKey] && sc[prevKey].splitterId === splitterId) {
                delete sc[prevKey];
                slot.properties.set('splitterConnections', sc);
            }
        });
    }
    splitterObj.properties.set('inputFiber', { cableId: cableId, fiberNumber: fiberNumber });
    let splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
    splitterConnections[key] = { splitterId: splitterId };
    sleeveObj.properties.set('splitterConnections', splitterConnections);
    createSplitterConnectionLine(sleeveObj, splitterObj, cableId, fiberNumber);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    showObjectInfo(sleeveObj);
}

function disconnectFiberFromSplitter(sleeveObj, cableId, fiberNumber) {
    let splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
    const key = cableId + '-' + fiberNumber;
    const conn = splitterConnections[key];
    if (!conn || !conn.splitterId) {
        delete splitterConnections[key];
        sleeveObj.properties.set('splitterConnections', splitterConnections);
        saveData();
        updateSplitterConnectionLines();
        showObjectInfo(sleeveObj);
        return;
    }
    const splitterObj = objects.find(o => o.properties && o.properties.get('type') === 'splitter' && o.properties.get('uniqueId') === conn.splitterId);
    if (splitterObj) {
        const inputFiber = splitterObj.properties.get('inputFiber');
        if (inputFiber && inputFiber.cableId === cableId && inputFiber.fiberNumber === fiberNumber) {
            splitterObj.properties.set('inputFiber', null);
        }
    }
    removeSplitterConnectionLine(sleeveObj, cableId, fiberNumber);
    delete splitterConnections[key];
    sleeveObj.properties.set('splitterConnections', splitterConnections);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    showObjectInfo(sleeveObj);
}

function connectFiberToSplitterWithRoute(sleeveObj, cableId, fiberNumber, splitterObj, routeIds) {
    const splitterId = getObjectUniqueId(splitterObj);
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = { type: 'splitterInput', splitterId: splitterId };
    if (t === 'cross') opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const key = cableId + '-' + fiberNumber;
    const prevInput = splitterObj.properties.get('inputFiber');
    if (prevInput) {
        const prevKey = prevInput.cableId + '-' + prevInput.fiberNumber;
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            const t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            let sc = slot.properties.get('splitterConnections');
            if (sc && sc[prevKey] && sc[prevKey].splitterId === splitterId) {
                delete sc[prevKey];
                slot.properties.set('splitterConnections', sc);
            }
        });
    }
    splitterObj.properties.set('inputFiber', { cableId: cableId, fiberNumber: fiberNumber });
    let splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
    splitterConnections[key] = { splitterId: splitterId, routeIds: routeIds || [] };
    sleeveObj.properties.set('splitterConnections', splitterConnections);
    createSplitterConnectionLine(sleeveObj, splitterObj, cableId, fiberNumber, routeIds);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
}

function initSplitterSelectionModal() {
    const modal = document.getElementById('splitterSelectionModal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-splitter-selection');
    const cancelBtn = document.getElementById('cancelSplitterSelection');
    const splitterSelect = document.getElementById('splitterSelect');
    const confirmBtn = document.getElementById('confirmSplitterSelection');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterSelectionModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterSelectionModal();
    });
    if (splitterSelect) {
        splitterSelect.addEventListener('change', function() {
            if (confirmBtn) confirmBtn.disabled = !this.value;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (!splitterSelectionModalData) return;
            const splitterVal = splitterSelect && splitterSelect.value;
            if (!splitterVal) return;
            const splitterObj = objects.find(o => o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === splitterVal);
            if (!splitterObj) return;
            const data = splitterSelectionModalData;
            closeSplitterSelectionModal();
            var infoModal = document.getElementById('infoModal');
            if (infoModal) infoModal.style.display = 'none';
            startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'splitter', splitterObj);
        });
    }
}

function getOnuIdsUsedBySplitterOutputs() {
    var used = [];
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
        var outputs = obj.properties.get('outputConnections') || [];
        outputs.forEach(function(o) {
            if (o && o.onuId) used.push(o.onuId);
        });
    });
    return used;
}

function getSplitterIdsUsedBySplitterOutputs() {
    var used = [];
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
        var outputs = obj.properties.get('outputConnections') || [];
        outputs.forEach(function(o) {
            if (o && o.splitterId) used.push(o.splitterId);
        });
    });
    return used;
}

function getSplitterRootInputFiber(splitterObj, visited) {
    if (!splitterObj || !splitterObj.properties) return null;
    visited = visited || new Set();
    var myId = getObjectUniqueId(splitterObj);
    if (visited.has(myId)) return null;
    visited.add(myId);
    var input = splitterObj.properties.get('inputFiber');
    if (input && input.cableId && input.fiberNumber != null) return input;
    for (var i = 0; i < objects.length; i++) {
        var o = objects[i];
        if (!o.properties || o.properties.get('type') !== 'splitter') continue;
        var outs = o.properties.get('outputConnections') || [];
        for (var j = 0; j < outs.length; j++) {
            if (outs[j] && outs[j].splitterId === myId) {
                var parentInput = getSplitterRootInputFiber(o, visited);
                if (parentInput) return parentInput;
            }
        }
    }
    return null;
}

function getAvailableOnusForSplitterOutput(excludeSplitterId) {
    var usedOnuIds = getOnuIdsUsedBySplitterOutputs();
    return objects.filter(function(o) {
        if (!o.properties || o.properties.get('type') !== 'onu') return false;
        var uid = getObjectUniqueId(o);
        return usedOnuIds.indexOf(uid) === -1;
    });
}

function getAvailableSplittersForSplitterOutput(sourceSplitterId) {
    var usedSplitterIds = getSplitterIdsUsedBySplitterOutputs();
    return objects.filter(function(o) {
        if (!o.properties || o.properties.get('type') !== 'splitter') return false;
        var uid = getObjectUniqueId(o);
        if (uid === sourceSplitterId) return false;
        if (usedSplitterIds.indexOf(uid) !== -1) return false;
        var inputFiber = o.properties.get('inputFiber');
        return !inputFiber;
    });
}

function showSplitterOutputOnuDialog(splitterObj, outIdx) {
    var effectiveInput = splitterObj.properties.get('inputFiber') || getSplitterRootInputFiber(splitterObj);
    if (!effectiveInput) {
        showWarning('Сначала подключите входную жилу к сплиттеру с муфты или кросса.', 'Нет входа');
        return;
    }
    var onus = getAvailableOnusForSplitterOutput();
    if (onus.length === 0) {
        showWarning('Нет свободных ONU. Все ONU уже подключены к выходам сплиттеров.', 'Нет ONU');
        return;
    }
    splitterOutputOnuModalData = { splitterObj: splitterObj, outIdx: outIdx, onus: onus };
    var modal = document.getElementById('splitterOutputOnuModal');
    var listEl = document.getElementById('splitterOutputOnuList');
    if (listEl) {
        listEl.innerHTML = '';
        onus.forEach(function(onu, idx) {
            var name = onu.properties.get('name') || ('ONU ' + (idx + 1));
            var uid = getObjectUniqueId(onu);
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div>';
            div.addEventListener('click', function() { selectSplitterOutputOnu(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
    }
    if (modal) modal.style.display = 'block';
}

function closeSplitterOutputOnuModal() {
    var modal = document.getElementById('splitterOutputOnuModal');
    if (modal) modal.style.display = 'none';
    splitterOutputOnuModalData = null;
}

function selectSplitterOutputOnu(onuIndex) {
    if (!splitterOutputOnuModalData) return;
    var data = splitterOutputOnuModalData;
    if (onuIndex < 0 || onuIndex >= data.onus.length) return;
    var onuObj = data.onus[onuIndex];
    var onuId = getObjectUniqueId(onuObj);
    closeSplitterOutputOnuModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'onu', onuObj, onuId);
}

function startSplitterFiberRouting(splitterObj, outIdx, targetType, targetObj, targetId) {
    splitterFiberRoutingMode = true;
    splitterFiberRoutingData = {
        splitterObj: splitterObj,
        outIdx: outIdx,
        targetType: targetType,
        targetObj: targetObj,
        targetId: targetId
    };
    splitterFiberWaypoints = [];
    var splitterName = splitterObj.properties.get('name') || 'Сплиттер';
    var targetName = targetObj.properties.get('name') || (targetType === 'onu' ? 'ONU' : 'Сплиттер');
    showInfo('Режим прокладки жилы: ' + splitterName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(splitterObj);
    syncMapPanLockForEditTools();
}

function cancelSplitterFiberRouting() {
    splitterFiberRoutingMode = false;
    splitterFiberRoutingData = null;
    splitterFiberWaypoints = [];
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    clearSelection();
    syncMapPanLockForEditTools();
}

function completeSplitterFiberRouting() {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    var data = splitterFiberRoutingData;
    var sp = data.splitterObj;
    var ratio = parseInt(sp.properties.get('splitRatio'), 10) || 8;
    var outputs = (sp.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    
    var routeIds = splitterFiberWaypoints.map(function(wp) {
        if (wp.properties) {
            var wpId = getObjectUniqueId(wp);
            if (!wpId) {
                wpId = generateUniqueId(wp.properties.get('type') || 'waypoint');
                wp.properties.set('uniqueId', wpId);
            }
            return wpId;
        }
        return null;
    }).filter(function(id) { return id !== null; });
    
    if (data.targetType === 'onu') {
        outputs[data.outIdx] = { onuId: data.targetId, routeIds: routeIds };
    } else if (data.targetType === 'splitter') {
        outputs[data.outIdx] = { splitterId: data.targetId, routeIds: routeIds };
        var rootInput = getSplitterRootInputFiber(sp);
        if (rootInput && rootInput.cableId && rootInput.fiberNumber != null) {
            data.targetObj.properties.set('inputFiber', { cableId: rootInput.cableId, fiberNumber: rootInput.fiberNumber });
        }
    }
    
    sp.properties.set('outputConnections', outputs);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    splitterFiberRoutingMode = false;
    splitterFiberRoutingData = null;
    splitterFiberWaypoints = [];
    
    updateSplitterOutputConnectionLines();
    clearSelection();
    showObjectInfo(sp);
    syncMapPanLockForEditTools();
}

function handleSplitterFiberRoutingClick(coords) {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    var data = splitterFiberRoutingData;
    var clickedObject = findObjectAtCoords(coords);
    
    if (clickedObject && clickedObject.geometry) {
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        var objId = getObjectUniqueId(clickedObject);
        
        if (objId === data.targetId) {
            completeSplitterFiberRouting();
            return;
        }
        
        if (objType === 'support' || objType === 'attachment') {
            splitterFiberWaypoints.push(clickedObject);
            updateSplitterFiberPreview();
            return;
        }
        
        if (objId === getObjectUniqueId(data.splitterObj)) {
            splitterFiberWaypoints = [];
            updateSplitterFiberPreview();
            return;
        }
        
        var targetName = data.targetObj.properties.get('name') || (data.targetType === 'onu' ? 'ONU' : 'Сплиттер');
        showWarning('Кликните по опоре или креплению для добавления промежуточной точки, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
    } else {
        var targetName = data.targetObj.properties.get('name') || (data.targetType === 'onu' ? 'ONU' : 'Сплиттер');
        showWarning('Кликните по опоре, креплению или целевому объекту (' + escapeHtml(targetName) + ').', 'Режим прокладки');
    }
}

function updateSplitterFiberPreview() {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    var data = splitterFiberRoutingData;
    var points = [];
    
    var splitterCoords = data.splitterObj.geometry.getCoordinates();
    points.push(splitterCoords);
    
    splitterFiberWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    if (points.length >= 1) {
        var targetCoords = data.targetObj.geometry.getCoordinates();
        points.push(targetCoords);
        
        splitterFiberPreviewLine = new ymaps.Polyline(points, {}, {
            strokeColor: data.targetType === 'onu' ? '#a855f7' : '#f97316',
            strokeWidth: 2,
            strokeStyle: 'shortdash',
            strokeOpacity: 0.5
        });
        myMap.geoObjects.add(splitterFiberPreviewLine);
    }
}

function updateSplitterFiberPreviewWithCursor(cursorCoords) {
    if (!splitterFiberRoutingMode || !splitterFiberRoutingData) return;
    
    if (splitterFiberPreviewLine) {
        myMap.geoObjects.remove(splitterFiberPreviewLine);
        splitterFiberPreviewLine = null;
    }
    
    var data = splitterFiberRoutingData;
    var points = [];
    
    var splitterCoords = data.splitterObj.geometry.getCoordinates();
    points.push(splitterCoords);
    
    splitterFiberWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    points.push(cursorCoords);
    
    splitterFiberPreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: data.targetType === 'onu' ? '#a855f7' : '#f97316',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.4
    });
    myMap.geoObjects.add(splitterFiberPreviewLine);
}

function getFiberRoutingTargetLabel(targetType, targetObj) {
    var n = targetObj && targetObj.properties && targetObj.properties.get('name');
    if (n) return n;
    if (targetType === 'onu') return 'ONU';
    if (targetType === 'mediaConverter') return 'Медиаконвертер';
    return 'Сплиттер';
}

function getFiberRoutingPreviewStroke(targetType) {
    if (targetType === 'onu') return '#22c55e';
    if (targetType === 'mediaConverter') return '#14b8a6';
    return '#3b82f6';
}

function startFiberRouting(sleeveObj, cableId, fiberNumber, targetType, targetObj) {
    fiberRoutingMode = true;
    var targetId = getObjectUniqueId(targetObj);
    if (!targetId) {
        targetId = generateUniqueId(targetType);
        targetObj.properties.set('uniqueId', targetId);
    }
    fiberRoutingData = {
        sleeveObj: sleeveObj,
        cableId: cableId,
        fiberNumber: fiberNumber,
        targetType: targetType,
        targetObj: targetObj,
        targetId: targetId
    };
    fiberRoutingWaypoints = [];
    var sleeveName = sleeveObj.properties.get('name') || (sleeveObj.properties.get('type') === 'cross' ? 'Кросс' : 'Муфта');
    var targetName = getFiberRoutingTargetLabel(targetType, targetObj);
    showInfo('Режим прокладки жилы: ' + sleeveName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(sleeveObj);
    syncMapPanLockForEditTools();
}

function cancelFiberRouting() {
    fiberRoutingMode = false;
    fiberRoutingData = null;
    fiberRoutingWaypoints = [];
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    clearSelection();
    syncMapPanLockForEditTools();
}

function completeFiberRouting() {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    var data = fiberRoutingData;
    
    var routeIds = fiberRoutingWaypoints.map(function(wp) {
        if (wp.properties) {
            var wpId = getObjectUniqueId(wp);
            if (!wpId) {
                wpId = generateUniqueId(wp.properties.get('type') || 'waypoint');
                wp.properties.set('uniqueId', wpId);
            }
            return wpId;
        }
        return null;
    }).filter(function(id) { return id !== null; });
    
    if (data.targetType === 'onu') {
        connectFiberToOnuWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
    } else if (data.targetType === 'mediaConverter') {
        connectFiberToMediaConverterWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
    } else if (data.targetType === 'splitter') {
        connectFiberToSplitterWithRoute(data.sleeveObj, data.cableId, data.fiberNumber, data.targetObj, routeIds);
    }
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    fiberRoutingMode = false;
    fiberRoutingData = null;
    fiberRoutingWaypoints = [];
    
    clearSelection();
    showObjectInfo(data.sleeveObj);
    syncMapPanLockForEditTools();
}

function handleFiberRoutingClick(coords) {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    var data = fiberRoutingData;
    var clickedObject = findObjectAtCoords(coords);
    
    if (clickedObject && clickedObject.geometry) {
        var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
        var objId = getObjectUniqueId(clickedObject);
        
        if (objId === data.targetId) {
            completeFiberRouting();
            return;
        }
        
        if (objType === 'support' || objType === 'attachment') {
            fiberRoutingWaypoints.push(clickedObject);
            updateFiberRoutingPreview();
            return;
        }
        
        if (objId === getObjectUniqueId(data.sleeveObj)) {
            fiberRoutingWaypoints = [];
            updateFiberRoutingPreview();
            return;
        }
        
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре или креплению для добавления промежуточной точки, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
    } else {
        var targetName = getFiberRoutingTargetLabel(data.targetType, data.targetObj);
        showWarning('Кликните по опоре, креплению или целевому объекту (' + escapeHtml(targetName) + ').', 'Режим прокладки');
    }
}

function updateFiberRoutingPreview() {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    var data = fiberRoutingData;
    var points = [];
    
    var sleeveCoords = data.sleeveObj.geometry.getCoordinates();
    points.push(sleeveCoords);
    
    fiberRoutingWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    if (points.length >= 1) {
        var targetCoords = data.targetObj.geometry.getCoordinates();
        points.push(targetCoords);
        
        fiberRoutingPreviewLine = new ymaps.Polyline(points, {}, {
            strokeColor: getFiberRoutingPreviewStroke(data.targetType),
            strokeWidth: 2,
            strokeStyle: 'shortdash',
            strokeOpacity: 0.5
        });
        myMap.geoObjects.add(fiberRoutingPreviewLine);
    }
}

function updateFiberRoutingPreviewWithCursor(cursorCoords) {
    if (!fiberRoutingMode || !fiberRoutingData) return;
    
    if (fiberRoutingPreviewLine) {
        myMap.geoObjects.remove(fiberRoutingPreviewLine);
        fiberRoutingPreviewLine = null;
    }
    
    var data = fiberRoutingData;
    var points = [];
    
    var sleeveCoords = data.sleeveObj.geometry.getCoordinates();
    points.push(sleeveCoords);
    
    fiberRoutingWaypoints.forEach(function(wp) {
        if (wp.geometry) {
            points.push(wp.geometry.getCoordinates());
        }
    });
    
    points.push(cursorCoords);
    
    fiberRoutingPreviewLine = new ymaps.Polyline(points, {}, {
        strokeColor: getFiberRoutingPreviewStroke(data.targetType),
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.4
    });
    myMap.geoObjects.add(fiberRoutingPreviewLine);
}

function showSplitterOutputSplitterDialog(splitterObj, outIdx) {
    var effectiveInput = splitterObj.properties.get('inputFiber') || getSplitterRootInputFiber(splitterObj);
    if (!effectiveInput) {
        showWarning('Сначала подключите входную жилу к сплиттеру с муфты или кросса.', 'Нет входа');
        return;
    }
    var splitters = getAvailableSplittersForSplitterOutput(getObjectUniqueId(splitterObj));
    if (splitters.length === 0) {
        showWarning('Нет свободных сплиттеров. Все сплиттеры уже имеют вход или подключены к выходам.', 'Нет сплиттеров');
        return;
    }
    splitterOutputSplitterModalData = { splitterObj: splitterObj, outIdx: outIdx, splitters: splitters };
    var modal = document.getElementById('splitterOutputSplitterModal');
    var listEl = document.getElementById('splitterOutputSplitterList');
    if (listEl) {
        listEl.innerHTML = '';
        splitters.forEach(function(sp, idx) {
            var name = sp.properties.get('name') || ('Сплиттер ' + (idx + 1));
            var uid = getObjectUniqueId(sp);
            var div = document.createElement('div');
            div.className = 'node-list-item';
            div.style.cssText = 'padding: 10px 12px; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; background: var(--bg-tertiary);';
            div.dataset.index = String(idx);
            div.innerHTML = '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div>';
            div.addEventListener('click', function() { selectSplitterOutputSplitter(parseInt(this.dataset.index, 10)); });
            listEl.appendChild(div);
        });
    }
    if (modal) modal.style.display = 'block';
}

function closeSplitterOutputSplitterModal() {
    var modal = document.getElementById('splitterOutputSplitterModal');
    if (modal) modal.style.display = 'none';
    splitterOutputSplitterModalData = null;
}

function selectSplitterOutputSplitter(splitterIndex) {
    if (!splitterOutputSplitterModalData) return;
    var data = splitterOutputSplitterModalData;
    if (splitterIndex < 0 || splitterIndex >= data.splitters.length) return;
    var targetSplitter = data.splitters[splitterIndex];
    var splitterId = getObjectUniqueId(targetSplitter);
    closeSplitterOutputSplitterModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startSplitterFiberRouting(data.splitterObj, data.outIdx, 'splitter', targetSplitter, splitterId);
}

function deleteSplitterOutput(splitterObj, outIdx) {
    if (!splitterObj || splitterObj.properties.get('type') !== 'splitter') return;
    var ratio = parseInt(splitterObj.properties.get('splitRatio'), 10) || 8;
    var outputs = (splitterObj.properties.get('outputConnections') || []).slice();
    while (outputs.length < ratio) outputs.push(null);
    if (outputs.length > ratio) outputs = outputs.slice(0, ratio);
    
    var oldOutput = outputs[outIdx];
    if (!oldOutput) return;
    
    if (oldOutput.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === oldOutput.onuId; });
        if (onuObj) {
            onuObj.properties.set('incomingFiber', null);
        }
    } else if (oldOutput.splitterId) {
        var targetSplitter = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === oldOutput.splitterId; });
        if (targetSplitter) {
            targetSplitter.properties.set('inputFiber', null);
        }
    }
    
    outputs[outIdx] = null;
    splitterObj.properties.set('outputConnections', outputs);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    updateSplitterOutputConnectionLines();
    if (currentModalObject && currentModalObject.properties.get('type') === 'splitter') showObjectInfo(currentModalObject);
}

function initSplitterOutputOnuModal() {
    var modal = document.getElementById('splitterOutputOnuModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-splitter-output-onu');
    var cancelBtn = document.getElementById('cancelSplitterOutputOnu');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterOutputOnuModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterOutputOnuModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterOutputOnuModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterOutputOnuModal();
    });
}

function initSplitterOutputSplitterModal() {
    var modal = document.getElementById('splitterOutputSplitterModal');
    if (!modal) return;
    var closeBtn = modal.querySelector('.close-splitter-output-splitter');
    var cancelBtn = document.getElementById('cancelSplitterOutputSplitter');
    if (closeBtn) closeBtn.addEventListener('click', closeSplitterOutputSplitterModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeSplitterOutputSplitterModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeSplitterOutputSplitterModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeSplitterOutputSplitterModal();
    });
}

let oltSelectionModalData = null;

function getAvailableOlts() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'olt'
    );
}

function showOltSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = t === 'cross' ? { atCrossId: placeId } : { atSleeveId: placeId };
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    const olts = getAvailableOlts();
    if (olts.length === 0) {
        showWarning('Нет доступных OLT. Сначала создайте OLT на карте.', 'Нет OLT');
        return;
    }
    oltSelectionModalData = { sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, olts: olts };
    const modal = document.getElementById('oltSelectionModal');
    const fiberInfo = document.getElementById('oltSelectionFiberInfo');
    const oltSelect = document.getElementById('oltSelectSelect');
    const confirmBtn = document.getElementById('confirmOltSelection');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' как приход от кросса к OLT';
    if (oltSelect) {
        oltSelect.innerHTML = '<option value="">— выберите OLT</option>';
        olts.forEach((olt, idx) => {
            const name = olt.properties.get('name') || ('OLT ' + (idx + 1));
            const uid = olt.properties.get('uniqueId');
            oltSelect.innerHTML += '<option value="' + escapeHtml(uid) + '">' + escapeHtml(name) + '</option>';
        });
    }
    if (confirmBtn) confirmBtn.disabled = true;
    if (modal) modal.style.display = 'block';
}

function closeOltSelectionModal() {
    const modal = document.getElementById('oltSelectionModal');
    if (modal) modal.style.display = 'none';
    oltSelectionModalData = null;
}

function connectFiberToOlt(sleeveObj, cableId, fiberNumber, oltObj) {
    const t = sleeveObj.properties.get('type');
    const placeId = sleeveObj.properties.get('uniqueId');
    const opts = { type: 'oltIncoming', oltId: getObjectUniqueId(oltObj) };
    if (t === 'cross') opts.atCrossId = placeId; else opts.atSleeveId = placeId;
    const usage = getFiberUsage(cableId, fiberNumber, opts);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    var prevIncoming = oltObj.properties.get('incomingFiber');
    var currentPlaceId = sleeveObj.properties.get('uniqueId');
    if (prevIncoming) {
        var prevKey = prevIncoming.cableId + '-' + prevIncoming.fiberNumber;
        var existingPlace = null;
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var oltConn = slot.properties.get('oltConnections');
            if (oltConn && oltConn[prevKey] && oltConn[prevKey].incoming && oltConn[prevKey].oltId === getObjectUniqueId(oltObj)) {
                existingPlace = slot;
            }
        });
        if (existingPlace && getObjectUniqueId(existingPlace) !== currentPlaceId) {
            var placeName = existingPlace.properties.get('name') || (existingPlace.properties.get('type') === 'cross' ? 'кросс' : 'муфта');
            showError('Приход для этого OLT уже задан с другого места («' + escapeHtml(placeName) + '»). Подключение приходящей жилы возможно только с одного кросса или муфты.', 'OLT уже подключён');
            return;
        }
    }
    const oltId = getObjectUniqueId(oltObj);
    const key = cableId + '-' + fiberNumber;
    if (prevIncoming) {
        var prevKey = prevIncoming.cableId + '-' + prevIncoming.fiberNumber;
        objects.forEach(function(slot) {
            if (!slot.properties) return;
            var t = slot.properties.get('type');
            if (t !== 'cross' && t !== 'sleeve') return;
            var oltConn = slot.properties.get('oltConnections');
            if (oltConn && oltConn[prevKey] && oltConn[prevKey].incoming) {
                delete oltConn[prevKey];
                slot.properties.set('oltConnections', oltConn);
            }
        });
    }
    oltObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    var oltConnections = sleeveObj.properties.get('oltConnections') || {};
    oltConnections[key] = { oltId: oltId, incoming: true };
    sleeveObj.properties.set('oltConnections', oltConnections);
    createOltConnectionLine(sleeveObj, oltObj, cableId, fiberNumber);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    showObjectInfo(sleeveObj);
}

function disconnectFiberFromOlt(sleeveObj, cableId, fiberNumber) {
    var oltConnections = sleeveObj.properties.get('oltConnections') || {};
    var key = cableId + '-' + fiberNumber;
    var conn = oltConnections[key];
    if (!conn || !conn.oltId) {
        delete oltConnections[key];
        sleeveObj.properties.set('oltConnections', oltConnections);
        saveData();
        updateOltConnectionLines();
        showObjectInfo(sleeveObj);
        return;
    }
    var oltObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === conn.oltId; });
    if (conn.incoming && oltObj) {
        oltObj.properties.set('incomingFiber', null);
    } else if (oltObj && conn.portNumber != null) {
        var portAssignments = oltObj.properties.get('portAssignments') || {};
        delete portAssignments[String(conn.portNumber)];
        oltObj.properties.set('portAssignments', portAssignments);
    }
    removeOltConnectionLine(sleeveObj, cableId, fiberNumber);
    delete oltConnections[key];
    sleeveObj.properties.set('oltConnections', oltConnections);
    saveData();
    if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
    showObjectInfo(sleeveObj);
}

function initOltSelectionModal() {
    const modal = document.getElementById('oltSelectionModal');
    if (!modal) return;
    const closeBtn = modal.querySelector('.close-olt-selection');
    const cancelBtn = document.getElementById('cancelOltSelection');
    const oltSelect = document.getElementById('oltSelectSelect');
    const confirmBtn = document.getElementById('confirmOltSelection');
    if (closeBtn) closeBtn.addEventListener('click', closeOltSelectionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeOltSelectionModal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeOltSelectionModal(); });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') closeOltSelectionModal();
    });
    if (oltSelect) {
        oltSelect.addEventListener('change', function() {
            if (confirmBtn) confirmBtn.disabled = !this.value;
        });
    }
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            if (!oltSelectionModalData) return;
            const oltVal = oltSelect && oltSelect.value;
            if (!oltVal) return;
            const oltObj = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltVal);
            if (!oltObj) return;
            const data = oltSelectionModalData;
            closeOltSelectionModal();
            connectFiberToOlt(data.sleeveObj, data.cableId, data.fiberNumber, oltObj);
        });
    }
}

function connectFiberToNode(crossObj, cableId, fiberNumber, nodeObj, switchId, switchPort) {
    const crossId = crossObj.properties.get('uniqueId');
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'nodeConn', crossId: crossId, atCrossId: crossId });
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    if (!switchId || switchPort == null || isNaN(parseInt(switchPort, 10))) {
        showError('Выберите коммутатор и порт SFP/SFP+/Комбо для оптического подключения.', 'Порт');
        return;
    }
    var portNum = parseInt(switchPort, 10);
    var swAtt = findAttachedSwitchOnNode(nodeObj, switchId);
    if (!swAtt) {
        showError('Коммутатор не найден в узле.', 'Ошибка');
        return;
    }
    var typesAtt = swAtt.switchPortTypes || [];
    if (portNum < 1 || portNum > typesAtt.length) {
        showError('Некорректный номер порта коммутатора.', 'Порт');
        return;
    }
    if (!isSwitchPortSfpFiberType(typesAtt[portNum - 1])) {
        showError('К кроссу можно подключить жилу только в порт типа SFP, SFP+ или Комбо RJ45/SFP.', 'Тип порта');
        return;
    }
    var fusAtt = swAtt.fiberPortUsage || {};
    if (fusAtt[String(portNum)]) {
        showError('Выбранный SFP-порт уже занят другой жилой. Выберите другой порт.', 'Порт занят');
        return;
    }
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
    }

    const key = `${cableId}-${fiberNumber}`;
    const nodeUniqueId = nodeObj.properties.get('uniqueId') || generateUniqueId('node');
    const crossUniqueId = crossObj.properties.get('uniqueId') || generateUniqueId('cross');

    if (!nodeObj.properties.get('uniqueId')) {
        nodeObj.properties.set('uniqueId', nodeUniqueId);
    }
    if (!crossObj.properties.get('uniqueId')) {
        crossObj.properties.set('uniqueId', crossUniqueId);
    }

    nodeConnections[key] = {
        nodeId: nodeUniqueId,
        nodeName: nodeObj.properties.get('name') || 'Узел',
        switchId: switchId,
        switchPort: portNum,
        switchPortType: typesAtt[portNum - 1]
    };

    crossObj.properties.set('nodeConnections', nodeConnections);
    markNodeSwitchFiberPortOccupied(nodeObj, switchId, portNum, key);

    createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber);

    saveData();

    showObjectInfo(crossObj);
}

function disconnectFiberFromNode(crossObj, cableId, fiberNumber) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;

    const key = `${cableId}-${fiberNumber}`;
    const conn = nodeConnections[key];

    removeNodeConnectionLine(crossObj, cableId, fiberNumber);

    if (conn && conn.nodeId && conn.switchId != null && conn.switchPort != null) {
        var nodeObjDisc = objects.find(function(n) {
            return n.properties && n.properties.get('type') === 'node' && n.properties.get('uniqueId') === conn.nodeId;
        });
        if (nodeObjDisc) {
            clearNodeSwitchFiberPortOccupied(nodeObjDisc, conn.switchId, conn.switchPort);
        }
    }

    delete nodeConnections[key];

    crossObj.properties.set('nodeConnections', nodeConnections);
    saveData();

    showObjectInfo(crossObj);
}

function connectFiberToOnu(sleeveObj, cableId, fiberNumber, onuObj) {
    const sleeveId = sleeveObj.properties.get('uniqueId');
    const onuId = getObjectUniqueId(onuObj);
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'onuConn', sleeveId: sleeveId, onuId: onuId, atSleeveId: sleeveId });
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    let onuConnections = sleeveObj.properties.get('onuConnections');
    if (!onuConnections) {
        onuConnections = {};
    }
    const key = cableId + '-' + fiberNumber;
    const onuUniqueId = onuObj.properties.get('uniqueId') || generateUniqueId('onu');
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId') || generateUniqueId('cross');
    if (!onuObj.properties.get('uniqueId')) onuObj.properties.set('uniqueId', onuUniqueId);
    if (!sleeveObj.properties.get('uniqueId')) sleeveObj.properties.set('uniqueId', sleeveUniqueId);
    onuConnections[key] = { onuId: onuUniqueId, onuName: onuObj.properties.get('name') || 'ONU' };
    sleeveObj.properties.set('onuConnections', onuConnections);
    onuObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    createOnuConnectionLine(sleeveObj, onuObj, cableId, fiberNumber);
    saveData();
    showObjectInfo(sleeveObj);
}

function disconnectFiberFromOnu(sleeveObj, cableId, fiberNumber) {
    let onuConnections = sleeveObj.properties.get('onuConnections');
    if (!onuConnections) return;
    const key = cableId + '-' + fiberNumber;
    const conn = onuConnections[key];
    if (conn && conn.onuId) {
        var onuObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === conn.onuId; });
        if (onuObj) {
            var if_ = onuObj.properties.get('incomingFiber');
            if (if_ && if_.cableId === cableId && if_.fiberNumber === fiberNumber) {
                onuObj.properties.set('incomingFiber', null);
            }
        }
    }
    removeOnuConnectionLine(sleeveObj, cableId, fiberNumber);
    delete onuConnections[key];
    sleeveObj.properties.set('onuConnections', onuConnections);
    saveData();
    showObjectInfo(sleeveObj);
}

function connectFiberToOnuWithRoute(sleeveObj, cableId, fiberNumber, onuObj, routeIds) {
    const sleeveId = sleeveObj.properties.get('uniqueId');
    const onuId = getObjectUniqueId(onuObj);
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'onuConn', sleeveId: sleeveId, onuId: onuId, atSleeveId: sleeveId });
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    let onuConnections = sleeveObj.properties.get('onuConnections');
    if (!onuConnections) {
        onuConnections = {};
    }
    const key = cableId + '-' + fiberNumber;
    const onuUniqueId = onuObj.properties.get('uniqueId') || generateUniqueId('onu');
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId') || generateUniqueId('cross');
    if (!onuObj.properties.get('uniqueId')) onuObj.properties.set('uniqueId', onuUniqueId);
    if (!sleeveObj.properties.get('uniqueId')) sleeveObj.properties.set('uniqueId', sleeveUniqueId);
    onuConnections[key] = { onuId: onuUniqueId, onuName: onuObj.properties.get('name') || 'ONU', routeIds: routeIds || [] };
    sleeveObj.properties.set('onuConnections', onuConnections);
    onuObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    createOnuConnectionLine(sleeveObj, onuObj, cableId, fiberNumber, routeIds);
    saveData();
}

function connectFiberToMediaConverterWithRoute(sleeveObj, cableId, fiberNumber, mcObj, routeIds) {
    const placeId = sleeveObj.properties.get('uniqueId');
    const mcId = getObjectUniqueId(mcObj);
    const slotTypeMc = sleeveObj.properties.get('type');
    const usageOptsMc = { type: 'mediaConverterConn', mediaConverterId: mcId };
    if (slotTypeMc === 'cross') {
        usageOptsMc.crossId = placeId;
        usageOptsMc.atCrossId = placeId;
    } else {
        usageOptsMc.sleeveId = placeId;
        usageOptsMc.atSleeveId = placeId;
    }
    const usage = getFiberUsage(cableId, fiberNumber, usageOptsMc);
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
        return;
    }
    let mcConnections = sleeveObj.properties.get('mediaConverterConnections');
    if (!mcConnections) {
        mcConnections = {};
    }
    const key = cableId + '-' + fiberNumber;
    const mcUniqueId = mcObj.properties.get('uniqueId') || generateUniqueId('mediaConverter');
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId') || generateUniqueId('cross');
    if (!mcObj.properties.get('uniqueId')) mcObj.properties.set('uniqueId', mcUniqueId);
    if (!sleeveObj.properties.get('uniqueId')) sleeveObj.properties.set('uniqueId', sleeveUniqueId);
    mcConnections[key] = { mediaConverterId: mcUniqueId, mediaConverterName: mcObj.properties.get('name') || 'Медиаконвертер', routeIds: routeIds || [] };
    sleeveObj.properties.set('mediaConverterConnections', mcConnections);
    mcObj.properties.set('incomingFiber', { cableId: cableId, fiberNumber: fiberNumber });
    createMediaConverterConnectionLine(sleeveObj, mcObj, cableId, fiberNumber, routeIds);
    saveData();
}

function disconnectFiberFromMediaConverter(sleeveObj, cableId, fiberNumber) {
    let mcConnections = sleeveObj.properties.get('mediaConverterConnections');
    if (!mcConnections) return;
    const key = cableId + '-' + fiberNumber;
    const conn = mcConnections[key];
    if (conn && conn.mediaConverterId) {
        var mcObj = objects.find(function(o) { return o.properties && o.properties.get('type') === 'mediaConverter' && getObjectUniqueId(o) === conn.mediaConverterId; });
        if (mcObj) {
            var ifMc = mcObj.properties.get('incomingFiber');
            if (ifMc && ifMc.cableId === cableId && ifMc.fiberNumber === fiberNumber) {
                mcObj.properties.set('incomingFiber', null);
            }
        }
    }
    removeOnuConnectionLine(sleeveObj, cableId, fiberNumber);
    delete mcConnections[key];
    sleeveObj.properties.set('mediaConverterConnections', mcConnections);
    saveData();
    showObjectInfo(sleeveObj);
}

function createOnuConnectionLine(sleeveObj, onuObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const onuCoords = onuObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOnuConnectionLineByKey(key);
    const onuName = onuObj.properties.get('name') || 'ONU';
    
    var points = [sleeveCoords];
    if (routeIds && routeIds.length > 0) {
        routeIds.forEach(function(wpId) {
            var wpObj = objects.find(function(o) { return o.properties && getObjectUniqueId(o) === wpId; });
            if (wpObj && wpObj.geometry) {
                points.push(wpObj.geometry.getCoordinates());
            }
        });
    }
    points.push(onuCoords);
    
    const line = new ymaps.Polyline(points, {}, {
        strokeColor: '#22c55e',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    line.properties.set('type', 'onuConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('onuName', onuName);
    line.properties.set('routeIds', routeIds || []);
    onuConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function createMediaConverterConnectionLine(sleeveObj, mcObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const mcCoords = mcObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOnuConnectionLineByKey(key);
    const mcName = mcObj.properties.get('name') || 'Медиаконвертер';
    var points = [sleeveCoords];
    if (routeIds && routeIds.length > 0) {
        routeIds.forEach(function(wpId) {
            var wpObj = objects.find(function(o) { return o.properties && getObjectUniqueId(o) === wpId; });
            if (wpObj && wpObj.geometry) {
                points.push(wpObj.geometry.getCoordinates());
            }
        });
    }
    points.push(mcCoords);
    const line = new ymaps.Polyline(points, {}, {
        strokeColor: '#14b8a6',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    line.properties.set('type', 'mediaConverterConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('mediaConverterName', mcName);
    line.properties.set('routeIds', routeIds || []);
    onuConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeOnuConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeOnuConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeOnuConnectionLineByKey(key) {
    const idx = onuConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(onuConnectionLines[idx]);
        onuConnectionLines.splice(idx, 1);
    }
}

function createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber) {
    const crossCoords = crossObj.geometry.getCoordinates();
    const nodeCoords = nodeObj.geometry.getCoordinates();
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;

    removeNodeConnectionLineByKey(key);
    
    const nodeName = nodeObj.properties.get('name') || 'Узел';
    const line = new ymaps.Polyline([crossCoords, nodeCoords], {}, {
        strokeColor: '#22c55e',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    
    line.properties.set('type', 'nodeConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('crossId', crossUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('nodeName', nodeName);

    line.events.add('click', function (e) {
        const coords = e.get('coords');
        const fiberNum = line.properties.get('fiberNumber');
        const name = line.properties.get('nodeName') || 'Узел';
        const balloonHtml = '<div class="network-map-balloon">' +
            '<div class="group-balloon-header">' +
            '<span class="group-balloon-title">Соединение кросс-узел</span>' +
            '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
            '</div>' +
            '<div class="node-selection-body" style="padding: 16px 14px;">' +
            'Жила ' + fiberNum + '<br>→ ' + escapeHtml(name) +
            '</div></div>';
        myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
    });
    
    nodeConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeNodeConnectionLine(crossObj, cableId, fiberNumber) {
    const crossUniqueId = crossObj.properties.get('uniqueId');
    const key = `${crossUniqueId}-${cableId}-${fiberNumber}`;
    removeNodeConnectionLineByKey(key);
}

function removeNodeConnectionLineByKey(key) {
    const lineIndex = nodeConnectionLines.findIndex(line => 
        line.properties.get('connectionKey') === key
    );
    
    if (lineIndex !== -1) {
        myMap.geoObjects.remove(nodeConnectionLines[lineIndex]);
        nodeConnectionLines.splice(lineIndex, 1);
    }
}

function updateAllConnectionLines() {
    updateAllNodeConnectionLines();
    updateOnuConnectionLines();
    updateOltConnectionLines();
    updateSplitterConnectionLines();
    updateSplitterOutputConnectionLines();
}

function createSplitterOutputConnectionLine(splitterObj, targetObj, outIdx, routeIds) {
    if (!splitterObj || !targetObj || !splitterObj.geometry || !targetObj.geometry) return;
    var splitterId = getObjectUniqueId(splitterObj);
    var key = splitterId + '-out-' + outIdx;
    var idx = splitterOutputConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(splitterOutputConnectionLines[idx]);
        splitterOutputConnectionLines.splice(idx, 1);
    }
    var splitterCoords = splitterObj.geometry.getCoordinates();
    var targetCoords = targetObj.geometry.getCoordinates();
    var targetType = targetObj.properties ? targetObj.properties.get('type') : '';
    
    var lineCoords = [splitterCoords];
    if (routeIds && Array.isArray(routeIds) && routeIds.length > 0) {
        routeIds.forEach(function(wpId) {
            var wpObj = objects.find(function(o) { 
                return o.properties && getObjectUniqueId(o) === wpId; 
            });
            if (wpObj && wpObj.geometry) {
                lineCoords.push(wpObj.geometry.getCoordinates());
            }
        });
    }
    lineCoords.push(targetCoords);
    
    var line = new ymaps.Polyline(lineCoords, {}, {
        strokeColor: targetType === 'onu' ? '#a855f7' : '#f97316',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    line.properties.set('type', 'splitterOutputConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('splitterId', splitterId);
    line.properties.set('outputIndex', outIdx);
    line.properties.set('routeIds', routeIds || []);
    splitterOutputConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function updateSplitterOutputConnectionLines() {
    splitterOutputConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    splitterOutputConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties || obj.properties.get('type') !== 'splitter') return;
        var outputs = obj.properties.get('outputConnections') || [];
        for (var oi = 0; oi < outputs.length; oi++) {
            var out = outputs[oi];
            if (!out) continue;
            var target = null;
            if (out.onuId) {
                target = objects.find(function(o) { return o.properties && o.properties.get('type') === 'onu' && getObjectUniqueId(o) === out.onuId; });
            } else if (out.splitterId) {
                target = objects.find(function(o) { return o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === out.splitterId; });
            }
            if (target) createSplitterOutputConnectionLine(obj, target, oi, out.routeIds || out.route || []);
        }
    });
}

function updateOnuConnectionLines() {
    onuConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    onuConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const onuConnections = obj.properties.get('onuConnections');
        if (onuConnections) {
            Object.keys(onuConnections).forEach(function(key) {
                const conn = onuConnections[key];
                const parts = key.split('-');
                const fiberNumberParsed = parseInt(parts.pop(), 10);
                const cableIdParsed = parts.join('-');
                if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
                const onuObj = objects.find(function(n) {
                    return n.properties && n.properties.get('type') === 'onu' && n.properties.get('uniqueId') === conn.onuId;
                });
                if (onuObj) createOnuConnectionLine(obj, onuObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
            });
        }
        const mcConnections = obj.properties.get('mediaConverterConnections');
        if (mcConnections) {
            Object.keys(mcConnections).forEach(function(key) {
                const conn = mcConnections[key];
                const parts = key.split('-');
                const fiberNumberParsed = parseInt(parts.pop(), 10);
                const cableIdParsed = parts.join('-');
                if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
                const mcObj = objects.find(function(n) {
                    return n.properties && n.properties.get('type') === 'mediaConverter' && n.properties.get('uniqueId') === conn.mediaConverterId;
                });
                if (mcObj) createMediaConverterConnectionLine(obj, mcObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
            });
        }
    });
}

function createOltConnectionLine(sleeveObj, oltObj, cableId, fiberNumber) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const oltCoords = oltObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeOltConnectionLineByKey(key);
    const oltName = oltObj.properties.get('name') || 'OLT';
    const line = new ymaps.Polyline([sleeveCoords, oltCoords], {}, {
        strokeColor: '#0ea5e9',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    line.properties.set('type', 'oltConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('oltName', oltName);
    oltConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeOltConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeOltConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeOltConnectionLineByKey(key) {
    const idx = oltConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(oltConnectionLines[idx]);
        oltConnectionLines.splice(idx, 1);
    }
}

function updateOltConnectionLines() {
    oltConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    oltConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const oltConnections = obj.properties.get('oltConnections');
        if (!oltConnections) return;
        Object.keys(oltConnections).forEach(function(key) {
            const conn = oltConnections[key];
            if (!conn || !conn.oltId) return;
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const oltObj = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === conn.oltId;
            });
            if (oltObj) createOltConnectionLine(obj, oltObj, cableIdParsed, fiberNumberParsed);
        });
    });
}

function createSplitterConnectionLine(sleeveObj, splitterObj, cableId, fiberNumber, routeIds) {
    const sleeveCoords = sleeveObj.geometry.getCoordinates();
    const splitterCoords = splitterObj.geometry.getCoordinates();
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    const key = sleeveUniqueId + '-' + cableId + '-' + fiberNumber;
    removeSplitterConnectionLineByKey(key);
    const splitterName = splitterObj.properties.get('name') || 'Сплиттер';
    
    var points = [sleeveCoords];
    if (routeIds && routeIds.length > 0) {
        routeIds.forEach(function(wpId) {
            var wpObj = objects.find(function(o) { return o.properties && getObjectUniqueId(o) === wpId; });
            if (wpObj && wpObj.geometry) {
                points.push(wpObj.geometry.getCoordinates());
            }
        });
    }
    points.push(splitterCoords);
    
    const line = new ymaps.Polyline(points, {}, {
        strokeColor: '#3b82f6',
        strokeWidth: 2,
        strokeStyle: 'shortdash',
        strokeOpacity: 0.8
    });
    line.properties.set('type', 'splitterConnectionLine');
    line.properties.set('connectionKey', key);
    line.properties.set('sleeveId', sleeveUniqueId);
    line.properties.set('cableId', cableId);
    line.properties.set('fiberNumber', fiberNumber);
    line.properties.set('splitterName', splitterName);
    line.properties.set('routeIds', routeIds || []);
    splitterConnectionLines.push(line);
    myMap.geoObjects.add(line);
}

function removeSplitterConnectionLine(sleeveObj, cableId, fiberNumber) {
    const sleeveUniqueId = sleeveObj.properties.get('uniqueId');
    removeSplitterConnectionLineByKey(sleeveUniqueId + '-' + cableId + '-' + fiberNumber);
}

function removeSplitterConnectionLineByKey(key) {
    const idx = splitterConnectionLines.findIndex(function(l) { return l.properties.get('connectionKey') === key; });
    if (idx !== -1) {
        myMap.geoObjects.remove(splitterConnectionLines[idx]);
        splitterConnectionLines.splice(idx, 1);
    }
}

function updateSplitterConnectionLines() {
    splitterConnectionLines.forEach(function(line) { myMap.geoObjects.remove(line); });
    splitterConnectionLines = [];
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        const type = obj.properties.get('type');
        if (type !== 'cross' && type !== 'sleeve') return;
        const splitterConnections = obj.properties.get('splitterConnections');
        if (!splitterConnections) return;
        Object.keys(splitterConnections).forEach(function(key) {
            const conn = splitterConnections[key];
            if (!conn || !conn.splitterId) return;
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const splitterObj = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'splitter' && o.properties.get('uniqueId') === conn.splitterId;
            });
            if (splitterObj) createSplitterConnectionLine(obj, splitterObj, cableIdParsed, fiberNumberParsed, conn.routeIds || []);
        });
    });
}

function updateAllNodeConnectionLines() {
    
    nodeConnectionLines.forEach(line => {
        myMap.geoObjects.remove(line);
    });
    nodeConnectionLines = [];

    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') !== 'cross') return;
        const nodeConnections = obj.properties.get('nodeConnections');
        if (!nodeConnections) return;
        Object.keys(nodeConnections).forEach(key => {
            const conn = nodeConnections[key];
            const parts = key.split('-');
            const fiberNumberParsed = parseInt(parts.pop(), 10);
            const cableIdParsed = parts.join('-');
            if (!crossHasFiberForConnection(obj, cableIdParsed, fiberNumberParsed)) return;
            const nodeObj = objects.find(n =>
                n.properties &&
                n.properties.get('type') === 'node' &&
                n.properties.get('uniqueId') === conn.nodeId
            );
            if (nodeObj) createNodeConnectionLine(obj, nodeObj, cableIdParsed, fiberNumberParsed);
        });
    });
}

function generateUniqueId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getNodeConnectedFibers(nodeUniqueId) {
    const connectedFibers = [];
    
    if (!nodeUniqueId) return connectedFibers;

    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cross') {
            const nodeConnections = obj.properties.get('nodeConnections');
            const fiberLabels = obj.properties.get('fiberLabels') || {};
            const crossName = obj.properties.get('name') || 'Кросс без имени';
            const crossUniqueId = obj.properties.get('uniqueId');
            
            if (nodeConnections) {
                Object.keys(nodeConnections).forEach(key => {
                    const conn = nodeConnections[key];
                    if (conn.nodeId !== nodeUniqueId) return;
                    const parts = key.split('-');
                    const fiberNumber = parseInt(parts.pop(), 10);
                    const cableId = parts.join('-');
                    if (!crossHasFiberForConnection(obj, cableId, fiberNumber)) return;
                    connectedFibers.push({
                        crossObj: obj,
                        crossName: crossName,
                        crossUniqueId: crossUniqueId,
                        cableId: cableId,
                        fiberNumber: fiberNumber,
                        fiberLabel: fiberLabels[key] || ''
                    });
                });
            }
        }
    });
    
    return connectedFibers;
}

function traceFromNode(crossUniqueId, cableId, fiberNumber) {
    
    const crossObj = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cross' &&
        obj.properties.get('uniqueId') === crossUniqueId
    );
    
    if (!crossObj) {
        showError('Кросс был удалён. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    const cable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === cableId);
    if (!cable) {
        showError('Кабель был удалён. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    const nodeConnections = crossObj.properties.get('nodeConnections') || {};
    const key = `${cableId}-${fiberNumber}`;
    const nodeConn = nodeConnections[key];
    
    if (!nodeConn) {
        showError('Соединение было удалено. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties) {
            var currentType = currentModalObject.properties.get('type');
            if (currentType === 'node' || currentType === 'camera') {
                showObjectInfo(currentModalObject);
            }
        }
        return;
    }

    let nodeObj = null;
    if (nodeConn) {
        nodeObj = objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('uniqueId') === nodeConn.nodeId
        );
    }

    var lanTailContext = null;
    if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'camera') {
        lanTailContext = buildCameraLanTailTraceContext(currentModalObject);
    }

    showFiberTraceFromCross(crossObj, cableId, fiberNumber, nodeObj, lanTailContext);
}

function traceFromOLTPort(oltObj, portNumber) {
    const portAssignments = oltObj.properties.get('portAssignments') || {};
    const ass = portAssignments[String(portNumber)];
    if (!ass) {
        showWarning('На этот порт не назначена жила. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    const cable = objects.find(c => c.properties && c.properties.get('type') === 'cable' && c.properties.get('uniqueId') === ass.cableId);
    if (!cable) {
        showError('Кабель был удалён. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    const otherEnd = getOtherEndOfCable(cable, oltObj);
    if (!otherEnd) {
        showError('Не найден противоположный конец кабеля. Информация обновлена.', 'Данные устарели');
        if (currentModalObject && currentModalObject.properties && currentModalObject.properties.get('type') === 'olt') {
            showObjectInfo(currentModalObject);
        }
        return;
    }
    const oltName = oltObj.properties.get('name') || 'OLT';
    showFiberTraceFromOLTPort(oltObj, oltName, portNumber, oltObj, ass.cableId, ass.fiberNumber);
}

function showObjectOnMap(uniqueId) {
    clearShowOnMapHighlight();
    var obj = objects.find(function(o) {
        return o.properties && o.properties.get('uniqueId') === uniqueId;
    });
    if (!obj) {
        showWarning('Объект не найден на карте', 'Навигация');
        return;
    }
    var coords = null;
    var objType = obj.properties.get('type');
    if (objType === 'cable') {
        var geometry = obj.geometry;
        if (geometry && geometry.getCoordinates) {
            var cableCoords = geometry.getCoordinates();
            if (cableCoords && cableCoords.length > 0) {
                var midIdx = Math.floor(cableCoords.length / 2);
                coords = cableCoords[midIdx];
            }
        }
    } else {
        coords = obj.geometry.getCoordinates();
    }
    if (!coords) {
        showWarning('Не удалось получить координаты объекта', 'Навигация');
        return;
    }
    myMap.setCenter(coords, 21, { duration: 300 });
    if (objType !== 'cable') {
        var originalPreset = obj.options.get('preset');
        obj.options.set('preset', 'islands#redCircleDotIcon');
        var tid = setTimeout(function() {
            clearShowOnMapHighlight();
        }, 2000);
        showOnMapHighlightState = { obj: obj, originalOptions: { preset: originalPreset }, timeoutId: tid, isCable: false };
    } else {
        var originalColor = obj.options.get('strokeColor');
        var originalWidth = obj.options.get('strokeWidth');
        obj.options.set('strokeColor', '#ff0000');
        obj.options.set('strokeWidth', 5);
        var tid = setTimeout(function() {
            clearShowOnMapHighlight();
        }, 2000);
        showOnMapHighlightState = { obj: obj, originalOptions: { strokeColor: originalColor, strokeWidth: originalWidth }, timeoutId: tid, isCable: true };
    }
}

function attachTraceShowOnMapHandlers(container) {
    var buttons = container.querySelectorAll('.trace-show-on-map-btn');
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            var objId = btn.getAttribute('data-object-id');
            if (objId) {
                showObjectOnMap(objId);
            }
        });
    });
}

function renderOnePathToTraceHtml(path, startStepNumber) {
    var stepNumber = startStepNumber;
    var html = '';
    path.forEach(function(item) {
        var objUniqueId = item.object ? getObjectUniqueId(item.object) : null;
        var showOnMapBtn = objUniqueId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(objUniqueId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
        
        if (item.type === 'start') {
            var icon = item.objectType === 'cross' ? '📦' : (item.objectType === 'sleeve' ? '🔴' : (item.objectType === 'olt' ? '📶' : (item.objectType === 'onu' ? '📟' : (item.objectType === 'mediaConverter' ? '⇄' : (item.objectType === 'splitter' ? '🔀' : '📍')))));
            var portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-start">' + stepNumber + '</span><div class="trace-path-block trace-path-start"><div><span>' + icon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'object') {
            icon = item.objectType === 'cross' ? '📦' : (item.objectType === 'sleeve' ? '🔴' : (item.objectType === 'node' ? '🖥️' : (item.objectType === 'olt' ? '📶' : (item.objectType === 'onu' ? '📟' : (item.objectType === 'mediaConverter' ? '⇄' : (item.objectType === 'splitter' ? '🔀' : '📍'))))));
            portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">' + stepNumber + '</span><div class="trace-path-block trace-path-object"><div><span>' + icon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'onuConnection') {
            var onuConnObjId = item.onu ? getObjectUniqueId(item.onu) : null;
            var onuConnShowBtn = onuConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(onuConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🔌</span><div class="trace-path-block trace-path-object"><span>🔌 Вывод на ONU: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.onuName) + '</span>' + onuConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'mediaConverterConnection') {
            var mcConnObjId = item.mediaConverter ? getObjectUniqueId(item.mediaConverter) : null;
            var mcConnShowBtn = mcConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(mcConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">⇄</span><div class="trace-path-block trace-path-object"><span>⇄ Вывод на медиаконвертер: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.mediaConverterName || 'Медиаконвертер') + '</span>' + mcConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'cable') {
            var cableObjId = item.cable ? getObjectUniqueId(item.cable) : null;
            var cableShowBtn = cableObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(cableObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var cableType = item.cable ? item.cable.properties.get('cableType') : null;
            var traceCableObj = item.cable || null;
            var fiberColors = traceCableObj ? getFiberColors(traceCableObj) : (cableType ? getFiberColors(cableType) : []);
            var fiber = fiberColors.find(function(f) { return f.number === item.fiberNumber; });
            var fiberColor = fiber ? fiber.color : '#3b82f6';
            var fiberName = fiber ? fiber.name : '';
            var fiberTextColor = (fiberColor === '#FFFFFF' || fiberColor === '#FFFACD' || fiberColor === '#FFFF00') ? '#000' : '#fff';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-cable">➡</span><div class="trace-path-block trace-path-cable" style="border-left-color: ' + fiberColor + ';"><div style="display: flex; align-items: center; flex-wrap: wrap;"><span>📡 ' + escapeHtml(item.cableName) + '</span><span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;"><span style="width: 16px; height: 16px; border-radius: 50%; background: ' + fiberColor + '; border: 1px solid #333; display: inline-block;"></span><span style="background: ' + fiberColor + '; color: ' + fiberTextColor + '; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Жила ' + item.fiberNumber + (fiberName ? ': ' + fiberName : '') + '</span></span></div>' + cableShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'connection') {
            var fromCableTrace = item.fromCable || (item.fromCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.fromCableId; }) : null);
            var toCableTrace = item.toCable || (item.toCableId ? objects.find(function(o) { return o.properties && o.properties.get('uniqueId') === item.toCableId; }) : null);
            var fromFiberColors = fromCableTrace ? getFiberColors(fromCableTrace) : (item.fromCableType ? getFiberColors(item.fromCableType) : []);
            var toFiberColors = toCableTrace ? getFiberColors(toCableTrace) : (item.toCableType ? getFiberColors(item.toCableType) : []);
            var fromFiber = fromFiberColors.find(function(f) { return f.number === item.fromFiberNumber; });
            var toFiber = toFiberColors.find(function(f) { return f.number === item.toFiberNumber; });
            var fromColor = fromFiber ? fromFiber.color : '#f59e0b';
            var toColor = toFiber ? toFiber.color : '#f59e0b';
            var fromTextColor = (fromColor === '#FFFFFF' || fromColor === '#FFFACD' || fromColor === '#FFFF00') ? '#000' : '#fff';
            var toTextColor = (toColor === '#FFFFFF' || toColor === '#FFFACD' || toColor === '#FFFF00') ? '#000' : '#fff';
            var fromFiberName = fromFiber ? fromFiber.name : '';
            var toFiberName = toFiber ? toFiber.name : '';
            var fromLabelText = item.fromLabel ? ' [' + escapeHtml(item.fromLabel) + ']' : '';
            var toLabelText = item.toLabel ? ' [' + escapeHtml(item.toLabel) + ']' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-connection">⚡</span><div class="trace-path-block trace-path-connection"><div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;"><span>🔗 Соединение:</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 14px; height: 14px; border-radius: 50%; background: ' + fromColor + '; border: 1px solid #333;"></span><span style="background: ' + fromColor + '; color: ' + fromTextColor + '; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Ж' + item.fromFiberNumber + (fromFiberName ? ' (' + fromFiberName + ')' : '') + '</span></span>' + (fromLabelText ? '<span style="color: var(--accent-primary); font-weight: 500; font-size: 0.8rem;">' + fromLabelText + '</span>' : '') + '<span style="font-size: 1rem;">→</span><span style="display: inline-flex; align-items: center; gap: 4px;"><span style="width: 14px; height: 14px; border-radius: 50%; background: ' + toColor + '; border: 1px solid #333;"></span><span style="background: ' + toColor + '; color: ' + toTextColor + '; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 0.8rem;">Ж' + item.toFiberNumber + (toFiberName ? ' (' + toFiberName + ')' : '') + '</span></span>' + (toLabelText ? '<span style="color: var(--accent-primary); font-weight: 500; font-size: 0.8rem;">' + toLabelText + '</span>' : '') + '</div></div></div>';
            stepNumber++;
        } else if (item.type === 'nodeConnection') {
            var nodeConnObjId = item.node ? getObjectUniqueId(item.node) : null;
            var nodeConnShowBtn = nodeConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(nodeConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🔌</span><div class="trace-path-block trace-path-object"><span>🔌 Вывод на узел: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.nodeName) + '</span>' + nodeConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterConnection') {
            var spObjId = item.splitter ? getObjectUniqueId(item.splitter) : null;
            var spShowBtn = spObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(spObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var spName = item.splitter && item.splitter.properties ? (item.splitter.properties.get('name') || 'Сплиттер') : 'Сплиттер';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-connection">🔀</span><div class="trace-path-block trace-path-connection"><div><span>→ Жила идёт на сплиттер «' + escapeHtml(spName) + '»</span><span class="trace-path-muted">(жила ' + item.fiberNumber + ')</span></div>' + spShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToOnu') {
            var spOutOnuId = item.onuObj ? getObjectUniqueId(item.onuObj) : null;
            var spOutOnuBtn = spOutOnuId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(spOutOnuId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-onu">📡</span><div class="trace-path-block trace-path-object"><span>🔀 Выход сплиттера → ONU ' + escapeHtml(item.onuName || 'ONU') + '</span>' + spOutOnuBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'splitterOutputToSplitter') {
            var toSpObjId = item.toSplitter ? getObjectUniqueId(item.toSplitter) : null;
            var toSpShowBtn = toSpObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(toSpObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var toName = item.toSplitter && item.toSplitter.properties ? item.toSplitter.properties.get('name') || 'Сплиттер' : 'Сплиттер';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-splitter">🔀</span><div class="trace-path-block trace-path-splitter"><span>🔀 Выход сплиттера → ' + escapeHtml(toName) + '</span>' + toSpShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'oltPortConnection') {
            var oltObjId = item.olt ? getObjectUniqueId(item.olt) : null;
            var oltShowBtn = oltObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(oltObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-olt">🔌</span><div class="trace-path-block trace-path-olt"><div><span>📶 Подключено к OLT «' + escapeHtml(item.oltName || 'OLT') + '», порт ' + item.portNumber + '</span><span class="trace-path-muted">(жила ' + item.fiberNumber + ')</span></div>' + oltShowBtn + '</div></div>';
            stepNumber++;
        }
    });
    var cablesCount = path.filter(function(p) { return p.type === 'cable'; }).length;
    var connectionsCount = path.filter(function(p) { return p.type === 'connection'; }).length;
    var oltCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'olt'; }).length;
    var splitterCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'splitter'; }).length;
    var onuCount = path.filter(function(p) { return p.type === 'object' && p.objectType === 'onu'; }).length;
    html += '<div style="margin-top: 8px; font-size: 0.8rem; color: var(--text-secondary);">📡 Кабелей: ' + cablesCount + ', 🔗 соединений: ' + connectionsCount + (oltCount + splitterCount + onuCount > 0 ? ', 📶 OLT: ' + oltCount + ', 🔀 Сплиттеров: ' + splitterCount + ', 📟 ONU: ' + onuCount : '') + '</div>';
    return { html: html, nextStepNumber: stepNumber };
}

function showFiberTraceFromOLTPort(oltObj, oltName, portNumber, startObj, cableId, fiberNumber) {
    const res = traceAllFiberPathsFromObject(startObj, cableId, fiberNumber);
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }
    if (!res.paths.length) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }
    const modal = document.getElementById('infoModal');
    const title = document.getElementById('modalTitle');
    const content = document.getElementById('modalInfo');
    if (!modal || !content) return;
    title.textContent = 'Трассировка от OLT, порт ' + portNumber;
    var header = '<div class="trace-path" style="padding: 10px;"><h4 class="trace-path-title">Трасса от OLT</h4><div class="trace-path-block trace-path-olt"><span>OLT: ' + escapeHtml(oltName) + ', порт ' + portNumber + '</span></div>';
    if (res.paths.length > 1) {
        var stepNum = 1;
        for (var pi = 0; pi < res.paths.length; pi++) {
            if (pi > 0) header += '<div style="margin: 12px 0 8px 0; padding: 6px 12px; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">—— Ветвь ' + (pi + 1) + ' ——</div>';
            var pathHtml = renderOnePathToTraceHtml(res.paths[pi], stepNum);
            header += pathHtml.html;
            stepNum = pathHtml.nextStepNumber;
        }
        header += '</div>';
    } else {
        showFiberTraceFromCross(startObj, cableId, fiberNumber, null);
        var wrap = content.querySelector('.trace-path');
        if (wrap) wrap.insertAdjacentHTML('afterbegin', header);
        return;
    }
    content.innerHTML = header;
    attachTraceShowOnMapHandlers(content);
    modal.style.display = 'block';
}

function showFiberTraceFromCross(startCrossObj, cableId, fiberNumber, startNodeObj = null, lanTailContext = null) {
    var res = traceAllFiberPathsFromObject(startCrossObj, cableId, fiberNumber);
    
    if (res.error) {
        showError('Ошибка трассировки: ' + res.error, 'Трассировка');
        return;
    }
    
    if (!res.paths || res.paths.length === 0) {
        showWarning('Путь не найден', 'Трассировка');
        return;
    }

    var modal = document.getElementById('infoModal');
    var title = document.getElementById('modalTitle');
    var content = document.getElementById('modalInfo');
    
    title.textContent = '🔍 Трассировка жилы ' + fiberNumber;
    
    var header = '<div class="trace-path" style="padding: 10px;"><h4 class="trace-path-title">📍 Трасса жилы по всей линии</h4>';
    if (startNodeObj && !lanTailContext) {
        var nodeName = startNodeObj.properties.get('name') || 'Узел сети';
        header += '<div class="trace-path-block trace-path-start"><span>🖥️ ' + escapeHtml(nodeName) + '</span><span class="trace-path-muted">(Узел сети — начало)</span></div>';
        header += '<div class="trace-path-block trace-path-info"><span>🔌 Подключение к кроссу через жилу ' + fiberNumber + '</span></div>';
    } else if (lanTailContext) {
        header += '<div class="trace-path-block trace-path-info" style="margin-bottom: 8px;"><span>Оптический путь от кросса; ниже — медный участок от коммутатора до камеры.</span></div>';
    }
    if (res.paths.length > 1) {
        var stepNum = 1;
        for (var pi = 0; pi < res.paths.length; pi++) {
            if (pi > 0) header += '<div style="margin: 12px 0 8px 0; padding: 6px 12px; background: var(--bg-tertiary); border-radius: 4px; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">—— Ветвь ' + (pi + 1) + ' ——</div>';
            var pathHtml = renderOnePathToTraceHtml(res.paths[pi], stepNum);
            header += pathHtml.html;
            stepNum = pathHtml.nextStepNumber;
        }
    } else {
        var pathHtml = renderOnePathToTraceHtml(res.paths[0], 1);
        header += pathHtml.html;
    }
    if (lanTailContext) {
        header += buildCameraLanTailTraceSectionHtml(lanTailContext);
    }
    header += '</div>';
    
    content.innerHTML = header;
    attachTraceShowOnMapHandlers(content);
    modal.style.display = 'block';
}

function updateFiberSelectionUI() {
    const bar = document.getElementById('fiber-selection-bar');
    if (bar) {
        bar.style.display = selectedFiberForConnection ? 'block' : 'none';
        bar.innerHTML = '';
        if (selectedFiberForConnection) {
            const sc = selectedFiberForConnection;
            const shortId = sc.cableId.length > 10 ? sc.cableId.substring(0, 8) + '…' : sc.cableId;
            bar.className = 'fiber-selection-bar';
            bar.innerHTML = '<span class="fiber-selection-text">Выбрана жила: кабель ' + escapeHtml(shortId) + ', жила ' + sc.fiberNumber + '. Выберите вторую жилу в другом кабеле (в таблице или в схеме).</span> ' +
                '<button type="button" class="fiber-selection-cancel" id="fiberSelectionCancelBtn">Отменить выбор</button>';
            const cancelBtn = document.getElementById('fiberSelectionCancelBtn');
            if (cancelBtn) cancelBtn.addEventListener('click', function() { resetFiberSelection(); });
        }
    }
    document.querySelectorAll('.fiber-connections-container .fiber-item.fiber-selected').forEach(function(el) { el.classList.remove('fiber-selected'); });
    if (selectedFiberForConnection) {
        const sel = selectedFiberForConnection;
        document.querySelectorAll('.fiber-connections-container .fiber-item').forEach(function(el) {
            if (el.getAttribute('data-cable-id') === sel.cableId && parseInt(el.getAttribute('data-fiber-number'), 10) === sel.fiberNumber) el.classList.add('fiber-selected');
        });
    }
    document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
        const rect = el.querySelector && el.querySelector('rect');
        const target = rect || el;
        const isUsed = el.getAttribute('data-fiber-used') === 'true';
        const isConnected = el.getAttribute('data-fiber-connected') === 'true';
        const cId = el.getAttribute('data-cable-id');
        const fNum = el.getAttribute('data-fiber-number');
        const isSelected = selectedFiberForConnection && selectedFiberForConnection.cableId === cId && selectedFiberForConnection.fiberNumber === parseInt(fNum, 10);
        if (isSelected) {
            target.setAttribute('stroke', '#f59e0b');
            target.setAttribute('stroke-width', '3');
        } else if (isConnected) {
            target.setAttribute('stroke', '#3b82f6');
            target.setAttribute('stroke-width', '3');
        } else if (isUsed) {
            target.setAttribute('stroke', '#dc2626');
            target.setAttribute('stroke-width', '2');
        } else {
            target.setAttribute('stroke', '#333');
            target.setAttribute('stroke-width', '1');
        }
    });
    const hint = document.querySelector('.connection-hint');
    if (hint) hint.remove();
}

function resetFiberSelection() {
    selectedFiberForConnection = null;
    updateFiberSelectionUI();
}

function deleteCableByUniqueId(cableUniqueId, opts) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (!cable) return;

    clearCopperCableOccupancyForCableId(cableUniqueId);

    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    const cableType = getCableDescription(cable.properties.get('cableType'));
    const fromName = fromObj ? (fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type'))) : '?';
    const toName = toObj ? (toObj.properties.get('name') || getObjectTypeName(toObj.properties.get('type'))) : '?';

    if (fromObj) {
        removeCableFromUsedFibers(fromObj, cableUniqueId);
    }
    if (toObj) {
        removeCableFromUsedFibers(toObj, cableUniqueId);
    }
    objects.forEach(function(slot) {
        if (!slot.properties) return;
        var t = slot.properties.get('type');
        if (t === 'cross' || t === 'sleeve') {
            var oltConn = slot.properties.get('oltConnections');
            var onuConn = slot.properties.get('onuConnections');
            var mcConn = slot.properties.get('mediaConverterConnections');
            var splitterConn = slot.properties.get('splitterConnections');
            var nodeConn = slot.properties.get('nodeConnections');
            var fiberConn = slot.properties.get('fiberConnections');
            var changed = false;
            if (oltConn) {
                Object.keys(oltConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete oltConn[key];
                        changed = true;
                    }
                });
            }
            if (onuConn) {
                Object.keys(onuConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete onuConn[key];
                        changed = true;
                    }
                });
            }
            if (mcConn) {
                Object.keys(mcConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete mcConn[key];
                        changed = true;
                    }
                });
            }
            if (splitterConn) {
                Object.keys(splitterConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete splitterConn[key];
                        changed = true;
                    }
                });
            }
            if (nodeConn) {
                Object.keys(nodeConn).forEach(function(key) {
                    if (key.indexOf(cableUniqueId + '-') === 0) {
                        delete nodeConn[key];
                        changed = true;
                    }
                });
            }
            if (fiberConn && Array.isArray(fiberConn)) {
                var newFiberConn = fiberConn.filter(function(conn) {
                    if (!conn) return false;
                    var fromMatch = conn.from && conn.from.cableId === cableUniqueId;
                    var toMatch = conn.to && conn.to.cableId === cableUniqueId;
                    return !fromMatch && !toMatch;
                });
                if (newFiberConn.length !== fiberConn.length) {
                    slot.properties.set('fiberConnections', newFiberConn);
                    changed = true;
                }
            }
            if (changed) {
                if (oltConn) slot.properties.set('oltConnections', oltConn);
                if (onuConn) slot.properties.set('onuConnections', onuConn);
                if (mcConn) slot.properties.set('mediaConverterConnections', mcConn);
                if (splitterConn) slot.properties.set('splitterConnections', splitterConn);
                if (nodeConn) slot.properties.set('nodeConnections', nodeConn);
            }
        }
        if (t === 'olt') {
            var portAssignments = slot.properties.get('portAssignments') || {};
            var incomingFiber = slot.properties.get('incomingFiber');
            var paChanged = false;
            Object.keys(portAssignments).forEach(function(portKey) {
                var a = portAssignments[portKey];
                if (a && a.cableId === cableUniqueId) {
                    delete portAssignments[portKey];
                    paChanged = true;
                }
            });
            if (paChanged) slot.properties.set('portAssignments', portAssignments);
            if (incomingFiber && incomingFiber.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
        if (t === 'splitter') {
            var inputFiber = slot.properties.get('inputFiber');
            var outputConnections = slot.properties.get('outputConnections');
            if (inputFiber && inputFiber.cableId === cableUniqueId) {
                slot.properties.set('inputFiber', null);
            }
            if (outputConnections && Array.isArray(outputConnections)) {
                var newOutputConn = outputConnections.map(function(conn) {
                    if (conn && conn.cableId === cableUniqueId) {
                        return { onuId: conn.onuId, splitterId: conn.splitterId };
                    }
                    return conn;
                });
                slot.properties.set('outputConnections', newOutputConn);
            }
        }
        if (t === 'onu') {
            var onuIncoming = slot.properties.get('incomingFiber');
            if (onuIncoming && onuIncoming.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
        if (t === 'mediaConverter') {
            var mcIncomingDel = slot.properties.get('incomingFiber');
            if (mcIncomingDel && mcIncomingDel.cableId === cableUniqueId) {
                slot.properties.set('incomingFiber', null);
            }
        }
    });

    myMap.geoObjects.remove(cable);
    objects = objects.filter(o => o !== cable);
    
    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function') {
            window.syncSendOp({ type: 'delete_cable', uniqueId: cableUniqueId });
        }
        saveData();
        logAction(ActionTypes.DELETE_CABLE, {
            cableType: cableType,
            from: fromName,
            to: toName
        });
    }

    updateCableVisualization();
    updateAllConnectionLines();

    const modal = document.getElementById('infoModal');
    if (isInfoModalVisible(modal)) {
        var modalTitleEl = document.getElementById('modalTitle');
        var isTraceModal = modalTitleEl && modalTitleEl.textContent && modalTitleEl.textContent.toLowerCase().indexOf('трассировка') !== -1;
        if (currentModalObject === cable || isTraceModal) {
            closeInfoModal();
        }
    }
    
    updateStats();

    if (currentModalObject && currentModalObject !== cable) {
        if (currentModalObject.properties) {
            const objType = currentModalObject.properties.get('type');
            if (objType !== 'cable') {
                refreshObjectModal(currentModalObject);
            }
        }
    }
}

function removeCableFromUsedFibers(obj, cableUniqueId) {
    let usedFibersData = obj.properties.get('usedFibers');
    if (usedFibersData && usedFibersData[cableUniqueId]) {
        delete usedFibersData[cableUniqueId];
        obj.properties.set('usedFibers', usedFibersData);
        saveData();
    }
}

async function changeCableType(cableUniqueId, newValue) {
    var count = parseInt(newValue, 10);
    if (isNaN(count)) count = getFiberCount(newValue);
    return updateCableFiberSettings(cableUniqueId, count, undefined);
}

function getFiberCount(arg) {
    if (window.FiberCableConfig) return window.FiberCableConfig.getFiberCount(arg);
    if (arg === 'copper') return 1;
    return 0;
}

/** Кабели через опору или крепление: концы маршрута (from/to) или промежуточная точка (points / геометрия). */
function getCablesThroughSupport(supportObj) {
    if (!supportObj || !supportObj.geometry) return [];
    var supportCoords = supportObj.geometry.getCoordinates();
    if (!supportCoords || supportCoords.length < 2) return [];
    var supportId = getObjectUniqueId(supportObj);
    var tol = 1e-6;
    function coordsMatch(a, b) {
        if (!a || !b || a.length < 2 || b.length < 2) return false;
        return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
    }
    var direct = objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === supportObj || to === supportObj) return true;
        if (from && getObjectUniqueId(from) === supportId) return true;
        if (to && getObjectUniqueId(to) === supportId) return true;
        var points = cable.properties.get('points');
        if (Array.isArray(points) && points.some(function(p) { return p === supportObj || (p && getObjectUniqueId(p) === supportId); })) return true;
        var geom = cable.geometry && cable.geometry.getCoordinates && cable.geometry.getCoordinates();
        if (!geom || !Array.isArray(geom)) return false;
        return geom.some(function(c) { return coordsMatch(c, supportCoords); });
    });
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getConnectedCables(obj) {
    var objUid = obj && obj.properties ? getObjectUniqueId(obj) : null;
    var direct = objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        var from = cable.properties.get('from');
        var to = cable.properties.get('to');
        if (from === obj || to === obj) return true;
        if (!objUid) return false;
        return (from && getObjectUniqueId(from) === objUid) || (to && getObjectUniqueId(to) === objUid);
    });
    // Стабильная сортировка по uniqueId кабеля, чтобы порядок не «прыгал» при обновлении (опоры, муфта, кросс)
    direct = direct.slice().sort(function(a, b) {
        var idA = a.properties && a.properties.get('uniqueId');
        var idB = b.properties && b.properties.get('uniqueId');
        if (!idA) idA = '';
        if (!idB) idB = '';
        return (idA || '').localeCompare(idB || '', undefined, { numeric: true });
    });
    return direct;
}

function getOtherEndOfCable(cable, oneEnd) {
    if (!cable || !oneEnd) return null;
    const fromObj = cable.properties.get('from');
    const toObj = cable.properties.get('to');
    if (fromObj === oneEnd) return toObj;
    if (toObj === oneEnd) return fromObj;
    const oneId = getObjectUniqueId(oneEnd);
    if (fromObj && getObjectUniqueId(fromObj) === oneId) return toObj;
    if (toObj && getObjectUniqueId(toObj) === oneId) return fromObj;
    return null;
}

function crossHasFiberForConnection(crossObj, cableId, fiberNumber) {
    if (!crossObj || !cableId || fiberNumber == null) return false;
    const cables = getConnectedCables(crossObj);
    const cable = cables.find(c => c.properties && c.properties.get('uniqueId') === cableId);
    if (!cable) return false;
    const n = getFiberCount(cable);
    return fiberNumber >= 1 && fiberNumber <= n;
}

function getTotalUsedPortsInCross(crossObj) {
    if (!crossObj || !crossObj.properties || crossObj.properties.get('type') !== 'cross') {
        return 0;
    }
    const keys = new Set();
    const nodeConnections = crossObj.properties.get('nodeConnections') || {};
    const fiberConnections = crossObj.properties.get('fiberConnections') || [];
    Object.keys(nodeConnections).forEach(function(k) { keys.add(k); });
    fiberConnections.forEach(function(conn) {
        if (conn.from && conn.from.cableId != null) keys.add(conn.from.cableId + '-' + conn.from.fiberNumber);
        if (conn.to && conn.to.cableId != null) keys.add(conn.to.cableId + '-' + conn.to.fiberNumber);
    });
    return keys.size;
}

function getTotalUsedFibersInSleeve(sleeveObj) {
    if (!sleeveObj || !sleeveObj.properties || sleeveObj.properties.get('type') !== 'sleeve') {
        return 0;
    }

    let totalFibers = 0;
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');

            if ((fromObj && fromObj === sleeveObj) || (toObj && toObj === sleeveObj)) {
                const cableType = obj.properties.get('cableType');
                const fiberCount = getFiberCount(cableType);
                totalFibers += fiberCount;
            }
        }
    });
    
    return totalFibers;
}

function getCableGroups() {
    const groups = new Map();
    
    objects.forEach(obj => {
        if (obj.properties && obj.properties.get('type') === 'cable') {
            const fromObj = obj.properties.get('from');
            const toObj = obj.properties.get('to');
            
            if (fromObj && toObj) {
                var fromCoords, toCoords;
                try {
                    fromCoords = fromObj.geometry && fromObj.geometry.getCoordinates();
                    toCoords = toObj.geometry && toObj.geometry.getCoordinates();
                } catch (e) { return; }
                if (!fromCoords || !toCoords || fromCoords.length < 2 || toCoords.length < 2) return;

                const sorted = [fromCoords, toCoords].sort((a, b) => {
                    if (Math.abs(a[0] - b[0]) > 0.000001) return a[0] - b[0];
                    return a[1] - b[1];
                });
                
                const key = `${sorted[0][0].toFixed(8)},${sorted[0][1].toFixed(8)}|${sorted[1][0].toFixed(8)},${sorted[1][1].toFixed(8)}`;
                
                if (!groups.has(key)) {
                    groups.set(key, {
                        from: fromObj,
                        to: toObj,
                        fromCoords: fromCoords,
                        toCoords: toCoords,
                        cables: []
                    });
                }
                groups.get(key).cables.push(obj);
            }
        }
    });
    
    return groups;
}

const CROSS_SAME_PLACE_EPS = 0.00002;

function getCrossGroups() {
    const crosses = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross');
    if (crosses.length === 0) return [];
    const groups = new Map();
    crosses.forEach(cross => {
        const coords = cross.geometry.getCoordinates();
        const key = `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;
        if (!groups.has(key)) groups.set(key, { coords: coords, crosses: [] });
        groups.get(key).crosses.push(cross);
    });
    return Array.from(groups.values());
}

function updateCrossDisplay() {
    crossGroupPlacemarks.forEach(pm => {
        const lbl = pm.properties && pm.properties.get('crossGroupLabel');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
        try { myMap.geoObjects.remove(pm); } catch (e) {}
    });
    crossGroupPlacemarks = [];
    const allCrosses = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross');
    allCrosses.forEach(cross => {
        try { myMap.geoObjects.remove(cross); } catch (e) {}
        const label = cross.properties.get('label');
        if (label) try { myMap.geoObjects.remove(label); } catch (e) {}
    });
    const groups = getCrossGroups();
    groups.forEach(group => {
        if (group.crosses.length === 1) {
            const cross = group.crosses[0];
            myMap.geoObjects.add(cross);
            const label = cross.properties.get('label');
            if (label) myMap.geoObjects.add(label);
            return;
        }
        const coords = group.coords;
        const n = group.crosses.length;
        const crossGroupName = getCrossGroupName(coords);
        const crossLabelText = crossGroupName || (group.crosses.length + ' кр.');
        const groupIcon = buildMapPlacemarkIcon('crossGroup', 'normal', { groupCount: n });
        const svgDataUrl = groupIcon ? groupIcon.href : '';
        const crossLabelHtml = '<div class="map-label map-label-group">' + escapeHtml(crossLabelText) + '</div>';
        const crossLabel = new ymaps.Placemark(coords, { iconContent: crossLabelHtml }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: crossLabelHtml,
            iconContentOffset: [0, 22],
            zIndex: 1999,
            hasBalloon: false,
            hasHint: false,
            cursor: 'default'
        });
        const groupPlacemark = new ymaps.Placemark(coords, {
            type: 'crossGroup',
            crossGroup: group.crosses,
            crossGroupLabel: crossLabel,
            balloonContent: ''
        }, {
            iconLayout: 'default#image',
            iconImageHref: svgDataUrl,
            iconImageSize: groupIcon ? groupIcon.iconImageSize : [36, 36],
            iconImageOffset: groupIcon ? groupIcon.iconImageOffset : [-18, -18],
            zIndex: 2000,
            zIndexHover: 2000,
            hasBalloon: false,
            hasHint: true,
            hintContent: crossGroupName || `Группа кроссов (${n})`,
            draggable: isEditMode,
            syncOverlayInit: true,
            cursor: 'pointer'
        });
        groupPlacemark.properties.set('labelContent', crossLabelText);
        groupPlacemark.events.add('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (objectPlacementMode) return;
            const crosses = groupPlacemark.properties.get('crossGroup');
            if (crosses.length === 1) {
                if (currentCableTool && isEditMode) {
                    if (cableSource && cableSource !== crosses[0]) {
                        const cableType = getEffectiveCableLayingType();
                        const points = [cableSource].concat(cableWaypoints).concat([crosses[0]]);
                        if (createCableFromPoints(points, cableType)) {
                            cableSource = crosses[0];
                            cableWaypoints = [];
                            clearSelection();
                            selectObject(cableSource);
                            removeCablePreview();
                        }
                    } else {
                        cableSource = crosses[0];
                        clearSelection();
                        selectObject(cableSource);
                    }
                } else {
                    showObjectInfo(crosses[0]);
                }
                return;
            }
            const crossesWithCableCount = crosses.map((c, originalIndex) => {
                const cableCount = objects.filter(cable => {
                    if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
                    var from = cable.properties.get('from');
                    var to = cable.properties.get('to');
                    return from === c || to === c;
                }).length;
                return { cross: c, originalIndex, cableCount, name: c.properties.get('name') || 'Без имени' };
            });
            crossesWithCableCount.sort((a, b) => b.cableCount - a.cableCount);
            const listHtml = crossesWithCableCount.map((item, displayIndex) =>
                `<div class="cross-group-item" data-index="${item.originalIndex}" data-display-index="${displayIndex}">` +
                `<span class="group-item-name">${escapeHtml(item.name)}</span>` +
                `<span class="group-item-cables" style="margin-left: 8px; font-size: 0.75rem; color: ${item.cableCount > 0 ? '#22c55e' : '#9ca3af'};">(${item.cableCount} каб.)</span>` +
                (isEditMode ? `<button type="button" class="group-item-move" title="Вынести и переместить">Переместить</button>` : '') +
                `</div>`
            ).join('');
            const groupNameRow = isEditMode
                ? ('<div class="group-name-row">' +
                    '<label class="group-name-label">Название группы</label>' +
                    '<div class="group-name-controls">' +
                    '<input type="text" class="group-name-input" value="' + escapeHtml(crossGroupName) + '" placeholder="' + escapeHtml(n + ' кр.') + '">' +
                    '<button type="button" class="group-name-save">Сохранить</button>' +
                    '</div></div>')
                : (crossGroupName ? '<div class="group-name-row"><label class="group-name-label">Название группы</label><div class="group-name-controls"><span class="group-name-readonly">' + escapeHtml(crossGroupName) + '</span></div></div>' : '');
            const balloonHtml = '<div class="cross-group-list network-map-balloon" data-lat="' + coords[0] + '" data-lon="' + coords[1] + '" data-group-type="cross">' +
                '<div class="group-balloon-header">' +
                '<span class="group-balloon-title">' + escapeHtml(crossGroupName || 'Выберите кросс') + '</span>' +
                '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
                '</div>' +
                groupNameRow +
                '<div class="group-balloon-list">' + listHtml + '</div></div>';
            myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
            setTimeout(() => {
                const saveBtn = document.querySelector('.cross-group-list .group-name-save');
                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        const c = document.querySelector('.cross-group-list.network-map-balloon');
                        if (c) {
                            const lat = parseFloat(c.getAttribute('data-lat')), lon = parseFloat(c.getAttribute('data-lon'));
                            const inp = c.querySelector('.group-name-input');
                            if (!isNaN(lat) && !isNaN(lon) && inp) {
                                setCrossGroupName([lat, lon], inp.value);
                                if (typeof showInfo === 'function') showInfo('Название группы сохранено', 'Сохранено');
                            }
                            myMap.balloon.close();
                        }
                    });
                }
                document.querySelectorAll('.cross-group-item').forEach((el) => {
                    const crossIndex = parseInt(el.getAttribute('data-index'), 10);
                    if (isNaN(crossIndex) || crossIndex < 0 || crossIndex >= crosses.length) return;
                    const crossObj = crosses[crossIndex];
                    const moveBtn = el.querySelector('.group-item-move');
                    if (moveBtn) {
                        moveBtn.addEventListener('click', function(ev) { ev.stopPropagation(); ev.preventDefault();
                            const offsetCoords = [coords[0] + 0.00008, coords[1]];
                            crossObj.geometry.setCoordinates(offsetCoords);
                            const lbl = crossObj.properties.get('label');
                            if (lbl && lbl.geometry) lbl.geometry.setCoordinates(offsetCoords);
                            updateConnectedCables(crossObj);
                            updateAllConnectionLines();
                            ensurePlacemarkUniqueIdForSync(crossObj);
                            var moveUid = crossObj.properties.get('uniqueId');
                            if (typeof window.syncSendOp === 'function' && moveUid) {
                                window.syncSendOp({ type: 'update_object', uniqueId: moveUid, data: { geometry: offsetCoords, name: crossObj.properties.get('name') } });
                            }
                            saveData();
                            myMap.balloon.close();
                            updateCrossDisplay();
                        });
                    }
                    el.addEventListener('click', (e) => {
                        if (e.target && e.target.closest('.group-item-move')) return;
                        myMap.balloon.close();
                        if (currentCableTool && isEditMode) {
                            if (cableSource && cableSource !== crossObj) {
                                const cableType = getEffectiveCableLayingType();
                                const points = [cableSource].concat(cableWaypoints).concat([crossObj]);
                                if (createCableFromPoints(points, cableType)) {
                                    cableSource = crossObj;
                                    cableWaypoints = [];
                                    clearSelection();
                                    selectObject(cableSource);
                                    removeCablePreview();
                                }
                            } else {
                                cableSource = crossObj;
                                clearSelection();
                                selectObject(cableSource);
                            }
                        } else {
                            showObjectInfo(crossObj);
                        }
                    });
                });
            }, 50);
        });
        groupPlacemark.events.add('drag', function() {
            if (!window.syncDragInProgress) window.syncDragInProgress = true;
            const crossLbl = groupPlacemark.properties.get('crossGroupLabel');
            if (crossLbl && crossLbl.geometry) crossLbl.geometry.setCoordinates(groupPlacemark.geometry.getCoordinates());
        });
        groupPlacemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            const newCoords = groupPlacemark.geometry.getCoordinates();
            const crossLbl = groupPlacemark.properties.get('crossGroupLabel');
            if (crossLbl && crossLbl.geometry) crossLbl.geometry.setCoordinates(newCoords);
            const crosses = groupPlacemark.properties.get('crossGroup');
            const oldCoords = crosses[0].geometry.getCoordinates();
            const oldKey = groupKey(oldCoords);
            const savedName = crossGroupNames.get(oldKey);
            crosses.forEach(c => {
                c.geometry.setCoordinates(newCoords);
                const lbl = c.properties.get('label');
                if (lbl && lbl.geometry) lbl.geometry.setCoordinates(newCoords);
                updateConnectedCables(c);
                ensurePlacemarkUniqueIdForSync(c);
                var cuid = c.properties.get('uniqueId');
                if (typeof window.syncSendOp === 'function' && cuid) {
                    window.syncSendOp({ type: 'update_object', uniqueId: cuid, data: { geometry: newCoords, name: c.properties.get('name') } });
                }
            });
            updateAllConnectionLines();
            if (savedName) {
                crossGroupNames.delete(oldKey);
                crossGroupNames.set(groupKey(newCoords), savedName);
                saveGroupNames();
            }
            saveData();
            updateCrossDisplay();
        });
        attachHoverEventsToObject(groupPlacemark);
        myMap.geoObjects.add(crossLabel);
        myMap.geoObjects.add(groupPlacemark);
        crossGroupPlacemarks.push(groupPlacemark);
    });
    
    allCrosses.forEach(function(cross) {
        updateConnectedCables(cross);
    });
    if (typeof applyMapFilter === 'function') applyMapFilter();
}

function getNodeGroups() {
    const nodes = objects.filter(obj => obj.properties && obj.properties.get('type') === 'node');
    if (nodes.length === 0) return [];
    const groups = new Map();
    nodes.forEach(node => {
        const coords = node.geometry.getCoordinates();
        const key = `${coords[0].toFixed(5)},${coords[1].toFixed(5)}`;
        if (!groups.has(key)) groups.set(key, { coords: coords, nodes: [] });
        groups.get(key).nodes.push(node);
    });
    return Array.from(groups.values());
}

function updateNodeDisplay() {
    nodeGroupPlacemarks.forEach(pm => {
        const lbl = pm.properties && pm.properties.get('nodeGroupLabel');
        if (lbl) try { myMap.geoObjects.remove(lbl); } catch (e) {}
        try { myMap.geoObjects.remove(pm); } catch (e) {}
    });
    nodeGroupPlacemarks = [];
    const allNodes = objects.filter(obj => obj.properties && obj.properties.get('type') === 'node');
    allNodes.forEach(node => {
        try { myMap.geoObjects.remove(node); } catch (e) {}
        const label = node.properties.get('label');
        if (label) try { myMap.geoObjects.remove(label); } catch (e) {}
    });
    const mapFilterState = typeof getMapFilterState === 'function' ? getMapFilterState() : {};
    const aggregationOnly = !!mapFilterState.nodeAggregationOnly;
    const groups = getNodeGroups();
    groups.forEach(group => {
        const displayNodes = aggregationOnly
            ? group.nodes.filter(function(nd) { return (nd.properties && nd.properties.get('nodeKind')) === 'aggregation'; })
            : group.nodes;
        if (displayNodes.length === 0) return;
        if (displayNodes.length === 1) {
            const node = displayNodes[0];
            myMap.geoObjects.add(node);
            const label = node.properties.get('label');
            if (label) myMap.geoObjects.add(label);
            return;
        }
        const coords = group.coords;
        const n = displayNodes.length;
        const hasAggregation = displayNodes.some(function(nd) { return (nd.properties && nd.properties.get('nodeKind')) === 'aggregation'; });
        const nodeGroupName = getNodeGroupName(coords);
        const displayName = nodeGroupName || (n + ' уз.');
        const nodeLabelHtml = '<div class="map-label map-label-group">' + escapeHtml(displayName) + '</div>';
        const nodeLabel = new ymaps.Placemark(coords, { iconContent: nodeLabelHtml }, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: nodeLabelHtml,
            iconContentOffset: [0, 22],
            zIndex: 1999,
            hasBalloon: false,
            hasHint: false,
            cursor: 'default'
        });
        const nodeGroupIcon = buildMapPlacemarkIcon('nodeGroup', 'normal', { groupCount: n, hasAggregation: hasAggregation });
        const svgDataUrl = nodeGroupIcon ? nodeGroupIcon.href : '';
        const groupPlacemark = new ymaps.Placemark(coords, {
            type: 'nodeGroup',
            nodeGroup: group.nodes,
            displayNodes: displayNodes,
            nodeGroupLabel: nodeLabel,
            balloonContent: ''
        }, {
            iconLayout: 'default#image',
            iconImageHref: svgDataUrl,
            iconImageSize: nodeGroupIcon ? nodeGroupIcon.iconImageSize : [36, 36],
            iconImageOffset: nodeGroupIcon ? nodeGroupIcon.iconImageOffset : [-18, -18],
            zIndex: 2000,
            zIndexHover: 2000,
            hasBalloon: false,
            hasHint: true,
            hintContent: nodeGroupName || (n === 1 ? 'Узел' : `Группа узлов (${n})`),
            draggable: isEditMode,
            syncOverlayInit: true,
            cursor: 'pointer'
        });
        groupPlacemark.properties.set('labelContent', displayName);
        groupPlacemark.events.add('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (objectPlacementMode) return;
            const nodes = groupPlacemark.properties.get('displayNodes') || groupPlacemark.properties.get('nodeGroup');
            if (nodes.length === 1) {
                showObjectInfo(nodes[0]);
                return;
            }
            const names = nodes.map(c => c.properties.get('name') || 'Без имени');
            const listHtml = nodes.map((c, i) => {
                const kind = c.properties.get('nodeKind') || 'network';
                const color = getNodeColorByKind(kind);
                return `<div class="node-group-item" data-index="${i}">` +
                `<span class="group-item-color-dot" style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${color};margin-right:6px;border:1px solid rgba(0,0,0,0.1);vertical-align:middle;"></span>` +
                `<span class="group-item-name">${escapeHtml(names[i])}</span>` +
                (isEditMode ? `<button type="button" class="group-item-move" title="Вынести и переместить">Переместить</button>` : '') +
                `</div>`;
            }).join('');
            const nodeGroupNameRow = isEditMode
                ? ('<div class="group-name-row">' +
                    '<label class="group-name-label">Название группы</label>' +
                    '<div class="group-name-controls">' +
                    '<input type="text" class="group-name-input" value="' + escapeHtml(nodeGroupName) + '" placeholder="' + escapeHtml(n + ' уз.') + '">' +
                    '<button type="button" class="group-name-save">Сохранить</button>' +
                    '</div></div>')
                : (nodeGroupName ? '<div class="group-name-row"><label class="group-name-label">Название группы</label><div class="group-name-controls"><span class="group-name-readonly">' + escapeHtml(nodeGroupName) + '</span></div></div>' : '');
            const balloonHtml = '<div class="node-group-list network-map-balloon" data-lat="' + coords[0] + '" data-lon="' + coords[1] + '" data-group-type="node">' +
                '<div class="group-balloon-header">' +
                '<span class="group-balloon-title">' + escapeHtml(nodeGroupName || 'Выберите узел') + '</span>' +
                '<button type="button" class="group-balloon-close" title="Закрыть" onclick="myMap.balloon.close()">&times;</button>' +
                '</div>' +
                nodeGroupNameRow +
                '<div class="group-balloon-list">' + listHtml + '</div></div>';
            myMap.balloon.open(coords, balloonHtml, { maxWidth: 320, closeButton: false });
            setTimeout(() => {
                const saveBtn = document.querySelector('.node-group-list .group-name-save');
                if (saveBtn) {
                    saveBtn.addEventListener('click', function() {
                        const c = document.querySelector('.node-group-list.network-map-balloon');
                        if (c) {
                            const lat = parseFloat(c.getAttribute('data-lat')), lon = parseFloat(c.getAttribute('data-lon'));
                            const inp = c.querySelector('.group-name-input');
                            if (!isNaN(lat) && !isNaN(lon) && inp) {
                                setNodeGroupName([lat, lon], inp.value);
                                if (typeof showInfo === 'function') showInfo('Название группы сохранено', 'Сохранено');
                            }
                            myMap.balloon.close();
                            updateNodeDisplay();
                        }
                    });
                }
                document.querySelectorAll('.node-group-item').forEach((el, i) => {
                    const moveBtn = el.querySelector('.group-item-move');
                    if (moveBtn) {
                        moveBtn.addEventListener('click', function(ev) { ev.stopPropagation(); ev.preventDefault();
                            const offsetCoords = [coords[0] + 0.00008, coords[1]];
                            nodes[i].geometry.setCoordinates(offsetCoords);
                            const lbl = nodes[i].properties.get('label');
                            if (lbl && lbl.geometry) lbl.geometry.setCoordinates(offsetCoords);
                            updateConnectedCables(nodes[i]);
                            updateAllConnectionLines();
                            ensurePlacemarkUniqueIdForSync(nodes[i]);
                            var nodeMoveUid = nodes[i].properties.get('uniqueId');
                            if (typeof window.syncSendOp === 'function' && nodeMoveUid) {
                                window.syncSendOp({ type: 'update_object', uniqueId: nodeMoveUid, data: { geometry: offsetCoords, name: nodes[i].properties.get('name') } });
                            }
                            saveData();
                            myMap.balloon.close();
                            updateNodeDisplay();
                        });
                    }
                    el.addEventListener('click', (e) => {
                        if (e.target && e.target.closest('.group-item-move')) return;
                        myMap.balloon.close();
                        showObjectInfo(nodes[i]);
                    });
                });
            }, 50);
        });
        groupPlacemark.events.add('drag', function() {
            if (!window.syncDragInProgress) window.syncDragInProgress = true;
            const nodeLbl = groupPlacemark.properties.get('nodeGroupLabel');
            if (nodeLbl && nodeLbl.geometry) nodeLbl.geometry.setCoordinates(groupPlacemark.geometry.getCoordinates());
        });
        groupPlacemark.events.add('dragend', function() {
            window.syncDragInProgress = false;
            if (typeof window.syncApplyPendingState === 'function') window.syncApplyPendingState();
            const newCoords = groupPlacemark.geometry.getCoordinates();
            const nodeLbl = groupPlacemark.properties.get('nodeGroupLabel');
            if (nodeLbl && nodeLbl.geometry) nodeLbl.geometry.setCoordinates(newCoords);
            const nodes = groupPlacemark.properties.get('nodeGroup');
            const oldCoords = nodes[0].geometry.getCoordinates();
            const oldKey = groupKey(oldCoords);
            const savedName = nodeGroupNames.get(oldKey);
            nodes.forEach(n => {
                n.geometry.setCoordinates(newCoords);
                const lbl = n.properties.get('label');
                if (lbl && lbl.geometry) lbl.geometry.setCoordinates(newCoords);
                updateConnectedCables(n);
                ensurePlacemarkUniqueIdForSync(n);
                var nuid = n.properties.get('uniqueId');
                if (typeof window.syncSendOp === 'function' && nuid) {
                    window.syncSendOp({ type: 'update_object', uniqueId: nuid, data: { geometry: newCoords, name: n.properties.get('name') } });
                }
            });
            updateAllConnectionLines();
            if (savedName) {
                nodeGroupNames.delete(oldKey);
                nodeGroupNames.set(groupKey(newCoords), savedName);
                saveGroupNames();
            }
            saveData();
            updateNodeDisplay();
        });
        attachHoverEventsToObject(groupPlacemark);
        myMap.geoObjects.add(nodeLabel);
        myMap.geoObjects.add(groupPlacemark);
        nodeGroupPlacemarks.push(groupPlacemark);
    });
    
    allNodes.forEach(function(node) {
        updateConnectedCables(node);
    });
    if (typeof applyMapFilter === 'function') applyMapFilter();
}

var MAP_FILTER_STORAGE_KEY = 'networkMap_mapFilter';
var MAP_FILTER_INPUT_IDS = [
    'mapFilterNode', 'mapFilterNodeAggregationOnly', 'mapFilterCross', 'mapFilterSleeve',
    'mapFilterSupport', 'mapFilterAttachment', 'mapFilterOlt', 'mapFilterSplitter',
    'mapFilterOnu', 'mapFilterCamera', 'mapFilterMediaConverter'
];
var MAP_FILTER_MAIN_KEYS = ['node', 'cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu', 'camera', 'mediaConverter'];

function syncMapFilterChipVisual(el) {
    if (!el) return;
    var chip = el.closest('.map-filter-chip');
    if (!chip) return;
    chip.classList.toggle('map-filter-chip--off', !el.checked);
    chip.classList.toggle('map-filter-chip--disabled', !!el.disabled);
}

function syncMapFilterAggregationOnlyState() {
    var nodeEl = document.getElementById('mapFilterNode');
    var aggEl = document.getElementById('mapFilterNodeAggregationOnly');
    if (!aggEl) return;
    var nodeOn = nodeEl ? nodeEl.checked : true;
    aggEl.disabled = !nodeOn;
    if (!nodeOn) aggEl.checked = false;
    syncMapFilterChipVisual(aggEl);
}

function updateMapFilterBadge() {
    var badge = document.getElementById('mapFilterBadge');
    if (!badge) return;
    var state = typeof getMapFilterState === 'function' ? getMapFilterState() : {};
    var enabled = 0;
    MAP_FILTER_MAIN_KEYS.forEach(function(key) {
        if (state[key]) enabled++;
    });
    var total = MAP_FILTER_MAIN_KEYS.length;
    badge.textContent = enabled + '/' + total;
    badge.classList.remove('map-filter-badge--partial', 'map-filter-badge--none');
    if (enabled === 0) badge.classList.add('map-filter-badge--none');
    else if (enabled < total) badge.classList.add('map-filter-badge--partial');
}

function saveMapFilterToStorage() {
    try {
        localStorage.setItem(MAP_FILTER_STORAGE_KEY, JSON.stringify(getMapFilterState()));
    } catch (e) {}
}

var MAP_FILTER_KEY_TO_ID = {
    node: 'mapFilterNode',
    nodeAggregationOnly: 'mapFilterNodeAggregationOnly',
    cross: 'mapFilterCross',
    sleeve: 'mapFilterSleeve',
    support: 'mapFilterSupport',
    attachment: 'mapFilterAttachment',
    olt: 'mapFilterOlt',
    splitter: 'mapFilterSplitter',
    onu: 'mapFilterOnu',
    camera: 'mapFilterCamera',
    mediaConverter: 'mapFilterMediaConverter'
};

function loadMapFilterFromStorage() {
    try {
        var raw = localStorage.getItem(MAP_FILTER_STORAGE_KEY);
        if (!raw) return false;
        var saved = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return false;
        Object.keys(MAP_FILTER_KEY_TO_ID).forEach(function(key) {
            var el = document.getElementById(MAP_FILTER_KEY_TO_ID[key]);
            if (el && typeof saved[key] === 'boolean') el.checked = saved[key];
        });
        return true;
    } catch (e) {
        return false;
    }
}

function setMapFilterAll(enabled) {
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (id === 'mapFilterNodeAggregationOnly') {
            if (!enabled) el.checked = false;
            return;
        }
        el.checked = !!enabled;
        syncMapFilterChipVisual(el);
    });
    syncMapFilterAggregationOnlyState();
    updateMapFilterBadge();
    saveMapFilterToStorage();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
}

function onMapFilterChange(changedEl) {
    if (changedEl && changedEl.id === 'mapFilterNode') syncMapFilterAggregationOnlyState();
    syncMapFilterChipVisual(changedEl);
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        syncMapFilterChipVisual(document.getElementById(id));
    });
    updateMapFilterBadge();
    saveMapFilterToStorage();
    if (typeof applyMapFilter === 'function') applyMapFilter();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
}

function setupMapFilterControls() {
    loadMapFilterFromStorage();
    MAP_FILTER_INPUT_IDS.forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        syncMapFilterChipVisual(el);
        el.addEventListener('change', function() {
            onMapFilterChange(el);
        });
    });
    syncMapFilterAggregationOnlyState();
    updateMapFilterBadge();

    var showAllBtn = document.getElementById('mapFilterShowAll');
    var hideAllBtn = document.getElementById('mapFilterHideAll');
    if (showAllBtn) showAllBtn.addEventListener('click', function() { setMapFilterAll(true); });
    if (hideAllBtn) hideAllBtn.addEventListener('click', function() { setMapFilterAll(false); });

    if (typeof applyMapFilter === 'function') applyMapFilter();
}

function getMapFilterState() {
    var nodeEl = document.getElementById('mapFilterNode');
    var nodeAggEl = document.getElementById('mapFilterNodeAggregationOnly');
    var crossEl = document.getElementById('mapFilterCross');
    var sleeveEl = document.getElementById('mapFilterSleeve');
    var supportEl = document.getElementById('mapFilterSupport');
    var attachmentEl = document.getElementById('mapFilterAttachment');
    var oltEl = document.getElementById('mapFilterOlt');
    var splitterEl = document.getElementById('mapFilterSplitter');
    var onuEl = document.getElementById('mapFilterOnu');
    var cameraEl = document.getElementById('mapFilterCamera');
    var mediaConverterEl = document.getElementById('mapFilterMediaConverter');
    return {
        node: nodeEl ? nodeEl.checked : true,
        nodeAggregationOnly: nodeAggEl ? nodeAggEl.checked : false,
        cross: crossEl ? crossEl.checked : true,
        sleeve: sleeveEl ? sleeveEl.checked : true,
        support: supportEl ? supportEl.checked : true,
        attachment: attachmentEl ? attachmentEl.checked : true,
        olt: oltEl ? oltEl.checked : true,
        splitter: splitterEl ? splitterEl.checked : true,
        onu: onuEl ? onuEl.checked : true,
        camera: cameraEl ? cameraEl.checked : true,
        mediaConverter: mediaConverterEl ? mediaConverterEl.checked : true
    };
}

// "Vols expert" style: при отдалении сначала скрываются подписи, потом сами объекты.
// Настройка порогов: при уменьшении зума значение растет к "ближе" и скрытие уходит обратно.
const EXPERT_ZOOM_HIDE_LABELS_BELOW = 17;
const EXPERT_ZOOM_HIDE_OBJECTS_BELOW = 16;

function forEachConnectionLine(callback) {
    [nodeConnectionLines, onuConnectionLines, oltConnectionLines, splitterConnectionLines, splitterOutputConnectionLines].forEach(function(arr) {
        if (!Array.isArray(arr)) return;
        arr.forEach(function(line) {
            if (line && line.options) callback(line);
        });
    });
}

function setAllConnectionLinesVisible(visible) {
    forEachConnectionLine(function(line) {
        try { line.options.set('visible', !!visible); } catch (e) {}
    });
}

function applyExpertZoomVisibility() {
    if (!myMap || typeof myMap.getZoom !== 'function') return;
    if (!Array.isArray(objects)) return;

    const zoom = myMap.getZoom();
    if (typeof zoom !== 'number') return;

    const hideLabels = zoom < EXPERT_ZOOM_HIDE_LABELS_BELOW;
    const hideObjects = zoom < EXPERT_ZOOM_HIDE_OBJECTS_BELOW;
    if (!hideLabels && !hideObjects) return;

    // Скрываем "подписи":
    // - отдельные label-placemark'и, хранящиеся в obj.properties.get('label')
    // - отдельные cableLabel-объекты (тип 'cableLabel')
    if (hideLabels) {
        objects.forEach(function(obj) {
            if (!obj || !obj.properties || !obj.options) return;
            const type = obj.properties.get('type');

            if (type === 'cableLabel') {
                try { obj.options.set('visible', false); } catch (e) {}
            }

            const label = obj.properties.get('label');
            if (label && label.options) {
                try { label.options.set('visible', false); } catch (e) {}
            }
        });
    }

    // Скрываем "объекты":
    // - все placemark'и из массива objects (включая кабели)
    // - group-placemark'и (nodeGroup/crossGroup)
    if (hideObjects) {
        objects.forEach(function(obj) {
            if (!obj || !obj.options) return;
            try { obj.options.set('visible', false); } catch (e) {}
        });
        setAllConnectionLinesVisible(false);
    }

    const crossPlacemarks = (typeof crossGroupPlacemarks !== 'undefined' && Array.isArray(crossGroupPlacemarks))
        ? crossGroupPlacemarks
        : [];
    const nodePlacemarks = (typeof nodeGroupPlacemarks !== 'undefined' && Array.isArray(nodeGroupPlacemarks))
        ? nodeGroupPlacemarks
        : [];

    if (hideLabels) {
        crossPlacemarks.forEach(function(pm) {
            try {
                const lbl = pm && pm.properties && pm.properties.get('crossGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            } catch (e) {}
        });
        nodePlacemarks.forEach(function(pm) {
            try {
                const lbl = pm && pm.properties && pm.properties.get('nodeGroupLabel');
                if (lbl && lbl.options) lbl.options.set('visible', false);
            } catch (e) {}
        });
    }

    if (hideObjects) {
        crossPlacemarks.forEach(function(pm) {
            try { if (pm && pm.options) pm.options.set('visible', false); } catch (e) {}
        });
        nodePlacemarks.forEach(function(pm) {
            try { if (pm && pm.options) pm.options.set('visible', false); } catch (e) {}
        });
    }
}

function applyMapFilter() {
    if (!myMap || !objects) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    if (typeof updateMapFilterBadge === 'function') updateMapFilterBadge();
    function isObjVisible(obj) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel') return false;
        if (type === 'node') {
            if (!filter.node) return false;
            if (filter.nodeAggregationOnly) return obj.properties.get('nodeKind') === 'aggregation';
            return true;
        }
        if (type === 'olt' || type === 'splitter' || type === 'onu' || type === 'camera' || type === 'mediaConverter') return filter[type] !== false;
        return filter[type] === true;
    }
    var visibleCables = new Set();
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        if (type === 'cable') {
            var from = obj.properties.get('from');
            var to = obj.properties.get('to');
            var points = obj.properties.get('points');
            var visible = from && to && isObjVisible(from) && isObjVisible(to) &&
                (!Array.isArray(points) || points.length === 0 || points.every(function(p) { return isObjVisible(p); }));
            if (visible) visibleCables.add(obj);
        }
    });
    objects.forEach(function(obj) {
        if (!obj.properties) return;
        var type = obj.properties.get('type');
        var visible = false;
        if (type === 'cable') {
            visible = visibleCables.has(obj);
        } else if (type === 'cableLabel') {
            var cables = obj.properties.get('cables');
            visible = Array.isArray(cables) && cables.some(function(c) { return visibleCables.has(c); });
        } else {
            visible = filter[type] === true || (['olt', 'splitter', 'onu', 'camera', 'mediaConverter'].indexOf(type) !== -1 && filter[type] !== false);
        }
        try {
            if (obj.options) obj.options.set('visible', visible);
            var label = obj.properties.get('label');
            if (label && label.options) label.options.set('visible', visible);
        } catch (e) {}
    });
    crossGroupPlacemarks.forEach(function(pm) {
        var v = filter.cross;
        try { if (pm.options) pm.options.set('visible', v); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('crossGroupLabel');
        try { if (lbl && lbl.options) lbl.options.set('visible', v); } catch (e) {}
    });
    nodeGroupPlacemarks.forEach(function(pm) {
        var visible = filter.node;
        if (visible && filter.nodeAggregationOnly) {
            var group = pm.properties && pm.properties.get('nodeGroup');
            visible = Array.isArray(group) && group.some(function(nd) { return nd.properties && nd.properties.get('nodeKind') === 'aggregation'; });
        }
        try { if (pm.options) pm.options.set('visible', visible); } catch (e) {}
        var lbl = pm.properties && pm.properties.get('nodeGroupLabel');
        try { if (lbl && lbl.options) lbl.options.set('visible', visible); } catch (e) {}
    });

    // Линии связи (ONU, медиаконвертер, OLT, сплиттер, кросс–узел) — отдельные polyline, не в objects.
    try { setAllConnectionLinesVisible(true); } catch (e) {}

    // Доп. скрытие по зуму (поверх фильтра).
    try { applyExpertZoomVisibility(); } catch (e) {}
}

function updateCableVisualization() {
    const groups = getCableGroups();

    const labelsToRemove = objects.filter(obj => 
        obj.properties && obj.properties.get('type') === 'cableLabel'
    );
    
    labelsToRemove.forEach(label => {
        myMap.geoObjects.remove(label);
        objects = objects.filter(o => o !== label);
    });

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
function computeFiberOccupancy(cableUniqueId, fiberNumber, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections) {
    const fiberKey = cableUniqueId + '-' + fiberNumber;
    const isUsed = cableData ? cableData.usedFibers.includes(fiberNumber) : false;
    const isConnected = (fiberConnections || []).some(function(conn) {
        return (conn.from.cableId === cableUniqueId && conn.from.fiberNumber === fiberNumber) ||
            (conn.to.cableId === cableUniqueId && conn.to.fiberNumber === fiberNumber);
    });
    const hasNodeConnection = !!(nodeConnections && nodeConnections[fiberKey]);
    const hasOltConnection = !!(oltConnections && oltConnections[fiberKey]);
    const hasOnuConnection = !!(onuConnections && onuConnections[fiberKey]);
    const mcConn = mediaConverterConnections && mediaConverterConnections[fiberKey];
    const hasMcConnection = !!(mcConn && mcConn.mediaConverterId);
    const spConn = splitterConnections && splitterConnections[fiberKey];
    const hasSplitterConnection = !!(spConn && spConn.splitterId);
    const hasAnyOutConnection = hasNodeConnection || hasOltConnection || hasOnuConnection || hasMcConnection || hasSplitterConnection;
    const isOccupied = isUsed || isConnected || hasAnyOutConnection;
    return { isUsed: isUsed, isConnected: isConnected, hasAnyOutConnection: hasAnyOutConnection, isOccupied: isOccupied };
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

function buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode) {
    const name = sleeveObj.properties.get('name') || '';
    const typeBadgeClass = isCross ? 'fiber-ws-type-badge--cross' : 'fiber-ws-type-badge--sleeve';
    const typeLabel = isCross ? 'Оптический кросс' : 'Кабельная муфта';
    const objType = isCross ? 'cross' : 'sleeve';
    let iconBlock = '';
    if (window.MapIcons) {
        const nodeKind = !isCross && sleeveObj.properties ? (sleeveObj.properties.get('nodeKind') || 'network') : 'network';
        iconBlock = '<div class="fiber-ws-head-icon">' + MapIcons.buildIconSvg(objType, { variant: 'normal', nodeKind: nodeKind }) + '</div>';
    }
    let h = '<div class="fiber-ws-card fiber-ws-card-head fiber-ws-card-head--' + objType + '">';
    h += '<div class="fiber-ws-card-head-row">';
    if (iconBlock) h += iconBlock;
    h += '<div class="fiber-ws-card-head-text">';
    h += '<span class="fiber-ws-type-badge ' + typeBadgeClass + '">' + typeLabel + '</span>';
    h += '<div class="fiber-ws-side-title">' + escapeHtml(name || (isCross ? 'Кросс' : 'Муфта')) + '</div>';
    h += '</div></div></div>';

    if (isEditMode) {
        h += '<div class="fiber-ws-card"><h4 class="fiber-ws-section-title">Редактирование</h4><div class="fiber-ws-side-edit">';
        if (isCross) {
            h += '<div class="form-group"><label class="fiber-ws-label" for="editCrossName">Название</label>';
            h += '<input type="text" id="editCrossName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название кросса"></div>';
        } else {
            const storedSleeveType = sleeveObj.properties.get('sleeveType');
            h += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveName">Название</label>';
            h += '<input type="text" id="editSleeveName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Название муфты"></div>';
            h += '<div class="form-group"><label class="fiber-ws-label" for="editSleeveType">Тип муфты</label>';
            h += '<select id="editSleeveType" class="form-select">' + getSleeveTypeSelectOptionsHtml(storedSleeveType ? String(storedSleeveType) : '') + '</select></div>';
        }
        h += '</div></div>';
    }

    h += '<div class="fiber-ws-card"><h4 class="fiber-ws-section-title">Сводка</h4><div class="fiber-ws-stats">';
    h += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + cablesData.length + '</span><span class="fiber-ws-stat-lbl">кабелей</span></div>';
    h += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + fiberConnections.length + '</span><span class="fiber-ws-stat-lbl">сращений</span></div>';
    if (isCross) {
        const crossPorts = Math.max(1, parseInt(sleeveObj.properties.get('crossPorts'), 10) || 24);
        const usedPorts = getTotalUsedPortsInCross(sleeveObj);
        const pct = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
        h += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedPorts + '/' + crossPorts + '</span><span class="fiber-ws-stat-lbl">портов (' + pct + '%)</span></div>';
    } else {
        const maxFibers = sleeveObj.properties.get('maxFibers');
        const usedFibers = getTotalUsedFibersInSleeve(sleeveObj);
        if (maxFibers && maxFibers > 0) {
            const pct = Math.round((usedFibers / maxFibers) * 100);
            h += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedFibers + '/' + maxFibers + '</span><span class="fiber-ws-stat-lbl">волокон (' + pct + '%)</span></div>';
        } else {
            h += '<div class="fiber-ws-stat"><span class="fiber-ws-stat-val">' + usedFibers + '</span><span class="fiber-ws-stat-lbl">волокон</span></div>';
        }
    }
    h += '</div></div>';

    h += '<div class="fiber-ws-card"><h4 class="fiber-ws-section-title">Обозначения</h4><div class="fiber-ws-legend">';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-line fiber-ws-leg-splice"></span> сращивание</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-connected"></span> жила сращена</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-used"></span> жила занята</div>';
    h += '<div class="fiber-ws-legend-item"><span class="fiber-ws-leg-dot fiber-ws-leg-free"></span> свободна</div>';
    h += '</div></div>';

    if (isEditMode) {
        h += '<details class="fiber-ws-card fiber-ws-help"><summary class="fiber-ws-section-title fiber-ws-help-summary">Как работать</summary><div class="fiber-ws-help-body">';
        h += '<p>1. Вкладка <strong>Схема</strong> — клик по жиле, затем по жиле другого кабеля.</p>';
        h += '<p>2. Вкладка <strong>Таблица</strong> — то же + кнопки OLT, ONU, узел.</p>';
        h += '<p>3. <strong>Подпись сращения</strong>: клик по жёлтой линии → окно по центру (закрыть ×, фон или Esc); также вкладка <strong>Соединения</strong>.</p>';
        h += '<p>4. Занятые жилы (красная рамка) нельзя выбрать для сращивания.</p>';
        h += '<p>5. Удаление сращивания — кнопка ✕ в списке соединений.</p>';
        h += '<p>6. Масштаб: ползунок или Ctrl+колёсико в схеме.</p>';
        h += '</div></details>';
    }
    return h;
}

function buildFiberWorkspaceActionsHtml() {
    var saveSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>';
    var dupSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    var delSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    return '<div class="fiber-ws-actions object-actions-section">' +
        '<button type="button" id="saveChangesBtn" class="btn-primary" style="flex:1;min-width:140px;margin-bottom:0;">' + saveSvg + ' Сохранить</button>' +
        '<button type="button" id="duplicateCurrentObject" class="btn-secondary" style="flex:1;min-width:120px;margin-bottom:0;">' + dupSvg + ' Дублировать</button>' +
        '<button type="button" id="deleteCurrentObject" class="btn-danger" style="flex:1;min-width:120px;margin-bottom:0;">' + delSvg + ' Удалить</button>' +
        '</div>';
}

function renderFiberConnectionsVisualization(sleeveObj, connectedCables) {
    const objType = sleeveObj.properties.get('type');
    const isCross = objType === 'cross';
    
    var containerClass = 'fiber-connections-container fiber-workspace-root fiber-workspace-root--' + (isCross ? 'cross' : 'sleeve');
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
    const leftCableCount = Math.ceil(cablesData.length / 2);
    const rightCableCount = cablesData.length - leftCableCount;
    const schemeMaxW = 1400;
    const schemeMinW = Math.min(900, Math.max(760, window.innerWidth - 120));
    const sidePad = 12;
    const panelW = 200;
    const centerGapMin = 140;
    const rowHeight = 18;
    const fiberFanLen = 40;
    const blockGap = 14;
    const labelH = 26;
    const nodeR = 4;
    const badgeW = 22;
    const badgeH = 16;
    const svgWidth = Math.min(schemeMaxW, Math.max(schemeMinW, window.innerWidth - 100, sidePad * 2 + panelW * 2 + centerGapMin));
    const schemeLayoutOpts = { rowHeight: rowHeight, sidePad: sidePad, panelW: panelW, fiberFanLen: fiberFanLen, blockGap: blockGap, labelH: labelH };
    const schemeLayout = layoutFiberSchemeReference(cablesData, svgWidth, schemeLayoutOpts);
    const svgHeight = schemeLayout.svgHeight;

    const canConnectFibers = cablesData.length >= 2;
    if (isEditMode) html += buildFiberWorkspaceActionsHtml();
    html += '<div class="fiber-workspace fiber-workspace--' + (isCross ? 'cross' : 'sleeve') + '"><aside class="fiber-ws-sidebar">' + buildFiberWorkspaceSidebarHtml(sleeveObj, isCross, cablesData, fiberConnections, isEditMode) + '</aside><main class="fiber-ws-main"><div class="fiber-ws-toolbar"><nav class="fiber-ws-tabs"><button type="button" class="fiber-ws-tab active" data-tab="scheme">Схема</button><button type="button" class="fiber-ws-tab" data-tab="table">Таблица</button>';
    if (cablesData.length >= 2) html += '<button type="button" class="fiber-ws-tab" data-tab="connections">Соединения<span class="fiber-ws-tab-badge">' + fiberConnections.length + '</span></button>';
    if (isEditMode && (canConnectFibers || isCross)) {
        html += '<div id="fiber-selection-bar" class="fiber-selection-bar" style="display: none;"></div>';
    }
    html += '</nav><div class="fiber-ws-toolbar-zoom" id="fiber-ws-toolbar-zoom">';
    html += '<div class="fiber-scheme-zoom-controls" title="Масштаб (Ctrl + колёсико в области схемы)">';
    html += '<button type="button" class="fiber-scheme-zoom-btn" id="fiber-scheme-zoom-out" title="Уменьшить">−</button>';
    html += '<input type="range" class="fiber-scheme-zoom-slider" id="fiber-scheme-zoom-slider" min="50" max="200" value="100" step="5" aria-label="Масштаб схемы">';
    html += '<span class="fiber-scheme-zoom-label" id="fiber-scheme-zoom-label">100%</span>';
    html += '<button type="button" class="fiber-scheme-zoom-btn" id="fiber-scheme-zoom-in" title="Увеличить">+</button>';
    html += '<button type="button" class="fiber-scheme-zoom-btn fiber-scheme-zoom-reset" id="fiber-scheme-zoom-reset" title="Сбросить">100%</button>';
    html += '</div></div></div>';
    html += '<div class="fiber-ws-panels"><div class="fiber-ws-panel fiber-ws-panel-scheme active" data-panel="scheme">';
    html += '<div class="fiber-scheme-viewport" id="fiber-scheme-viewport">';
    html += '<div class="fiber-scheme-zoom-inner" id="fiber-scheme-zoom-inner">';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const svgBgColor = isDark ? '#1e293b' : '#ffffff';
    const svgBorderColor = isDark ? '#334155' : '#dee2e6';
    const svgTextColor = isDark ? '#f1f5f9' : '#2c3e50';
    const svgTextMuted = isDark ? '#94a3b8' : '#6c757d';
    html += `<svg id="fiber-connections-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="border: 1px solid ${svgBorderColor}; border-radius: 6px; background: ${svgBgColor}; display: block;">`;

    const connectedFibers = new Set();
    fiberConnections.forEach(conn => {
        connectedFibers.add(`${conn.from.cableId}-${conn.from.fiberNumber}`);
        connectedFibers.add(`${conn.to.cableId}-${conn.to.fiberNumber}`);
    });

    const fiberPositions = schemeLayout.fiberPositions;
    const schemeBlocks = schemeLayout.blocks;
    const cableBarStroke = isDark ? '#64748b' : '#9ca3af';

    function fiberSchemeExitX(pos) {
        return pos.isLeft ? pos.x + badgeW / 2 : pos.x - badgeW / 2;
    }
    const linkColor = isDark ? '#facc15' : '#ffcc00';
    const linkShadow = isDark ? '#a16207' : '#ca8a04';
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
            { sameSide: sameSide, isLeft: fromPos.isLeft, svgWidth: svgWidth }
        );
        const connLabel = resolveFiberConnectionLabel(connection, fiberLabels);
        linkPaint.push({ connIndex: connIndex, pathD: pathD, fromKey: fromKey, toKey: toKey, label: connLabel });
    });

    html += '<g class="fiber-scheme-cables">';
    schemeBlocks.forEach(function(block) {
        const cableData = block.cableData;
        const isLeft = block.isLeft;
        const anchor = isLeft ? anchorLeft : anchorRight;
        const title = cableData.cableName || ('Кабель ' + cableData.index);
        const subLine = cableData.cableDescription + (cableData.isFromSleeve ? ' · ← вход' : ' · → выход');
        const labelAnchorX = block.labelX;

        html += `<g class="fiber-cable-block" data-cable-id="${cableData.cableUniqueId}">`;
        html += `<text x="${labelAnchorX}" y="${block.blockTop + 12}" text-anchor="${anchor}" style="font-size: 9px; font-weight: 700; fill: ${svgTextColor};">${escapeHtml(title)}</text>`;
        html += `<text x="${labelAnchorX}" y="${block.blockTop + 22}" text-anchor="${anchor}" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(subLine)}</text>`;
        html += `<line x1="${block.barX1}" y1="${block.cableBarY}" x2="${block.barX2}" y2="${block.cableBarY}" stroke="${cableBarStroke}" stroke-width="5" stroke-linecap="round"/>`;
        html += `<text x="${labelAnchorX}" y="${block.cableBarY + 14}" text-anchor="${anchor}" style="font-size: 7px; fill: ${svgTextMuted};">${escapeHtml(cableData.isFromSleeve ? 'от муфты/кросса' : 'к муфте/кроссу')}</text>`;
        html += '</g>';
    });
    html += '</g>';

    html += '<g class="fiber-scheme-links" fill="none">';
    linkPaint.forEach(function(link) {
        html += `<path class="fiber-scheme-link-shadow" d="${link.pathD}" stroke="${linkShadow}" stroke-width="6" stroke-linecap="round" opacity="0.35"/>`;
    });
    linkPaint.forEach(function(link) {
        const clickable = isEditMode ? 'cursor: pointer;' : 'cursor: default;';
        html += `<path id="connection-${link.connIndex}" class="fiber-scheme-link" d="${link.pathD}" stroke="${linkColor}" stroke-width="3.5" stroke-linecap="round" data-connection-index="${link.connIndex}" data-from-fiber="${link.fromKey}" data-to-fiber="${link.toKey}" data-conn-label="${escapeHtml(link.label || '')}" style="${clickable}">`;
        if (link.label) html += `<title>${escapeHtml(link.label)}</title>`;
        html += '</path>';
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
            const occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections);
            const isUsed = occ.isUsed;
            const isConnected = occ.isConnected;
            const isOccupied = occ.isOccupied;
            const clickable = isEditMode && !isOccupied ? 'cursor: pointer;' : (isOccupied ? 'cursor: not-allowed;' : '');
            const portClass = 'fiber-scheme-port' + (isOccupied ? ' fiber-scheme-port--occupied' : '');
            const badgeX = isLeft ? pos.x - badgeW / 2 : pos.x - badgeW / 2;
            const badgeY = pos.y - badgeH / 2;
            const circleX = isLeft ? badgeX - nodeR - 2 : badgeX + badgeW + nodeR + 2;
            let circleStroke = isConnected ? linkColor : (isUsed ? '#dc2626' : '#333');
            if (fiber.hasBlackRing && !isConnected && !isUsed) circleStroke = '#000';
            const badgeStrokeOcc = isOccupied ? '#dc2626' : badgeStroke;

            const fiberLabelKey = cableData.cableUniqueId + '-' + fiber.number;
            const spliceConn = isConnected ? fiberConnections.find(function(c) {
                return (c.from.cableId === cableData.cableUniqueId && c.from.fiberNumber === fiber.number) ||
                    (c.to.cableId === cableData.cableUniqueId && c.to.fiberNumber === fiber.number);
            }) : null;
            const connLabelOnLine = spliceConn ? resolveFiberConnectionLabel(spliceConn, fiberLabels) : '';
            const directLabel = !isConnected ? (fiberLabels[fiberLabelKey] || '') : '';
            const statusText = isConnected ? ' (соед.)' : (isUsed ? ' (исп.)' : '');
            const labelText = connLabelOnLine ? ' ' + connLabelOnLine : (directLabel ? ' ' + directLabel : '');
            const portText = isCross && fiberPorts && fiberPorts[fiberLabelKey] ? ', порт ' + fiberPorts[fiberLabelKey] : '';
            const tooltipText = escapeHtml(fiber.name + labelText + statusText + portText + (isOccupied ? ' (занята)' : ''));
            const textFill = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') ? '#000' : '#fff';

            const fanPath = buildFiberSchemeFanPath(pos.block, pos, isLeft, nodeR, badgeW);
            const fanColor = fiberSchemeLinkStrokeColor(fiber.color, isDark);

            const directLabelAttr = directLabel ? ' data-direct-label="' + escapeHtml(directLabel) + '"' : '';
            html += `<g id="fiber-${fiberKey}" class="${portClass}" data-fiber-key="${fiberKey}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}" data-fiber-occupied="${isOccupied}" data-fiber-selectable="${!isOccupied}"${directLabelAttr} style="${clickable}">`;
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
        const isLeft = block.isLeft;
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
    html += '<div class="fiber-table-toolbar"><label class="fiber-table-filter-label">Показать <select id="fiber-table-filter" class="form-select fiber-table-filter-select"><option value="all">Все</option><option value="connected">Сращённые</option><option value="free">Свободные</option><option value="used">Занятые</option></select></label><input type="search" id="fiber-table-search" class="form-input fiber-table-search" placeholder="№ жилы" autocomplete="off"></div>';

    function buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, fiberPorts, crossPorts) {
        const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
        const occ = computeFiberOccupancy(cableData.cableUniqueId, fiber.number, cableData, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, splitterConnections);
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
        const nodeConnection = nodeConnections[fiberLabelKey];
        const oltConnection = oltConnections[fiberLabelKey];
        const onuConnection = onuConnections[fiberLabelKey];
        const mcConnection = mediaConverterConnections[fiberLabelKey];
        const splitterConnection = splitterConnections[fiberLabelKey];
        const hasSplitterConnection = !!splitterConnection && !!splitterConnection.splitterId;
        let splitterName = '';
        if (hasSplitterConnection) {
            const spObj = objects.find(o => o.properties && o.properties.get('type') === 'splitter' && getObjectUniqueId(o) === splitterConnection.splitterId);
            splitterName = spObj ? (spObj.properties.get('name') || 'Сплиттер') : 'Сплиттер';
        }
        const hasNodeConnection = !!nodeConnection;
        const hasOltConnection = !!oltConnection;
        const hasOnuConnection = !!onuConnection;
        const hasMcConnection = !!mcConnection && !!mcConnection.mediaConverterId;
        const hasAnyOutConnection = hasNodeConnection || hasOltConnection || hasOnuConnection || hasMcConnection || hasSplitterConnection;
        const canConnectToOnu = isFiberConnectedToOlt(sleeveObj, cableData.cableUniqueId, fiber.number);
        const fiberTextColor = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00' || fiber.color === '#FFC0CB') ? '#000' : '#fff';
        let statusText = isUsed ? '(исп.)' : (hasNodeConnection ? '(на узел)' : (hasOnuConnection ? '(на ONU)' : (hasMcConnection ? '(на МК)' : (hasSplitterConnection ? '(на сплит.)' : (hasOltConnection ? '(от OLT)' : '(своб.)')))));
        if (hasOltConnection && oltConnection.oltId) {
            const oltObj = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltConnection.oltId);
            const oltName = oltObj ? (oltObj.properties.get('name') || 'OLT') : 'OLT';
            statusText = oltConnection.incoming ? ('приход OLT ' + escapeHtml(oltName)) : ('OLT ' + escapeHtml(oltName) + ', порт ' + (oltConnection.portNumber || '?'));
        }
        if (hasOnuConnection) statusText = '→ ONU ' + escapeHtml(onuConnection.onuName || 'ONU');
        if (hasMcConnection) statusText = '→ МК ' + escapeHtml(mcConnection.mediaConverterName || 'Медиаконвертер');
        if (hasSplitterConnection) statusText = '→ ' + escapeHtml(splitterName);
        const statusColor = isUsed ? '#b91c1c' : (hasNodeConnection ? '#22c55e' : (hasOnuConnection ? '#a855f7' : (hasMcConnection ? '#0f766e' : (hasSplitterConnection ? '#f97316' : (hasOltConnection ? '#0ea5e9' : '#22c55e')))));
        const itemBorder = isUsed ? '#dc2626' : (hasNodeConnection ? '#22c55e' : (hasOnuConnection ? '#a855f7' : (hasMcConnection ? '#14b8a6' : (hasSplitterConnection ? '#f97316' : (hasOltConnection ? '#0ea5e9' : 'var(--border-color)')))));
        const usedClass = isOccupied ? ' fiber-used cross-fiber-used fiber-occupied' : (hasSplitterConnection ? ' fiber-splitter-connected' : '');
        var cellTitle = '';
        if (spliceConnLabel) cellTitle = 'Подпись сращивания: ' + spliceConnLabel;
        if (isOccupied) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Жила занята — выбор для сращивания недоступен';
        else if (isEditMode && !hasAnyOutConnection && !isConnected) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Клик: выбрать жилу, затем клик по жиле в другом кабеле — создать соединение';
        else if (directLabel && !isConnected) cellTitle = (cellTitle ? cellTitle + '. ' : '') + 'Подпись: ' + directLabel;
        const currentPort = isCross && fiberPorts ? (fiberPorts[fiberLabelKey] || '') : '';
        const portOptions = [];
        if (isCross && crossPorts) {
            portOptions.push('<option value="">—</option>');
            for (let p = 1; p <= crossPorts; p++) portOptions.push(`<option value="${p}"${currentPort === String(p) ? ' selected' : ''}>${p}</option>`);
        }
        const portRow = isCross
            ? (isEditMode && crossPorts
                ? `<div class="fiber-port-row" style="display: flex; align-items: center; gap: 6px; margin-left: 18px; margin-top: 2px;"><span style="font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap;">Порт:</span><select class="fiber-port-select" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Порт кросса, в котором находится жила" style="padding: 2px 4px; font-size: 0.7rem; min-width: 48px;">${portOptions.join('')}</select></div>`
                : `<div class="fiber-port-row" style="margin-left: 18px; margin-top: 2px; font-size: 0.7rem; color: var(--text-secondary);">Порт: ${currentPort ? currentPort : '—'}</div>`)
            : '';
        return `
            <div class="fiber-item${usedClass}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}" data-fiber-occupied="${isOccupied}" data-fiber-selectable="${!isOccupied}" data-fiber-assigned="${hasAnyOutConnection}"${cellTitle ? ' title="' + cellTitle.replace(/"/g, '&quot;') + '"' : ''}
                 style="display: flex; flex-direction: column; gap: 2px; padding: 4px 5px; border-radius: 3px; border: 1px solid ${itemBorder}; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 5px;">
                    <div class="fiber-color" style="position: relative; width: 18px; height: 18px; border-radius: 50%; background-color: ${fiber.color}; border: 2px solid ${fiber.hasBlackRing ? '#000' : '#333'}; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                        <span class="fiber-num" style="font-size: 8px; font-weight: 700; color: ${fiberTextColor};">${fiber.number}</span>
                    </div>
                    <span class="fiber-name" style="font-size: 0.7rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>${fiber.name}</strong></span>
                    <span style="font-size: 0.65rem; color: ${statusColor}; font-weight: 600; white-space: nowrap;">${statusText}</span>
                </div>
                ${portRow}
                ${hasNodeConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #f0fdf4; border-radius: 3px; font-size: 0.75rem;"><span style="color: #166534;">🖥️ → ${escapeHtml(nodeConnection.nodeName)}${nodeConnection.switchPort != null ? ' · SFP п. ' + nodeConnection.switchPort : ''}</span>${isEditMode ? `<button class="btn-disconnect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от узла" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasOnuConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #f5f3ff; border-radius: 3px; font-size: 0.75rem;"><span style="color: #6d28d9;">📡 → ${escapeHtml(onuConnection.onuName || 'ONU')}${onuConnection.routeIds && onuConnection.routeIds.length > 0 ? ' (' + onuConnection.routeIds.length + ' точ.)' : ''}</span>${isEditMode ? `<button class="btn-disconnect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от ONU" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasMcConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #ecfeff; border-radius: 3px; font-size: 0.75rem;"><span style="color: #0f766e;">⇄ → ${escapeHtml(mcConnection.mediaConverterName || 'Медиаконвертер')}${mcConnection.routeIds && mcConnection.routeIds.length > 0 ? ' (' + mcConnection.routeIds.length + ' точ.)' : ''}</span>${isEditMode ? `<button class="btn-disconnect-mc" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от медиаконвертера" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasSplitterConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #fff7ed; border-radius: 3px; font-size: 0.75rem;"><span style="color: #c2410c;">🔀 → ${escapeHtml(splitterName)}${splitterConnection.routeIds && splitterConnection.routeIds.length > 0 ? ' (' + splitterConnection.routeIds.length + ' точ.)' : ''}</span>${isEditMode ? `<button class="btn-disconnect-splitter" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от сплиттера" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasOltConnection && oltConnection.oltId ? (function() { const o = objects.find(obj => obj.properties && obj.properties.get('type') === 'olt' && obj.properties.get('uniqueId') === oltConnection.oltId); const n = o ? (o.properties.get('name') || 'OLT') : 'OLT'; const label = oltConnection.incoming ? ('приход OLT ' + escapeHtml(n)) : ('OLT ' + escapeHtml(n) + ', порт ' + (oltConnection.portNumber || '?')); return `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #e0f2fe; border-radius: 3px; font-size: 0.75rem;"><span style="color: #0369a1;">📶 ${label}</span>${isEditMode ? `<button class="btn-disconnect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от OLT" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>`; }()) : ''}
                ${(!isConnected && !hasAnyOutConnection && isEditMode && isCross) ? `<div style="margin-left: 30px; display: flex; gap: 4px; flex-wrap: wrap;"><button class="btn-connect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к узлу" style="padding: 4px 6px; background: #22c55e; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">🖥️ Узел</button><button class="btn-connect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к OLT" style="padding: 4px 6px; background: #0ea5e9; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📶 OLT</button>${canConnectToOnu ? `<button class="btn-connect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к ONU" style="padding: 4px 6px; background: #a855f7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📡 ONU</button>` : ''}<button class="btn-connect-mc" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к медиаконвертеру" style="padding: 4px 6px; background: #14b8a6; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">⇄ МК</button></div>` : ''}
                ${(!isConnected && !hasAnyOutConnection && isEditMode && !isCross) ? `<div style="margin-left: 30px; display: flex; gap: 4px; flex-wrap: wrap;"><button class="btn-connect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к OLT" style="padding: 4px 6px; background: #0ea5e9; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📶 OLT</button>${(cableData.isFromOlt || canConnectToOnu) ? `<button class="btn-connect-splitter" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к входу сплиттера" style="padding: 4px 6px; background: #f97316; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">🔀 Сплиттер</button>` : ''}${canConnectToOnu ? `<button class="btn-connect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к ONU" style="padding: 4px 6px; background: #a855f7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📡 ONU</button>` : ''}<button class="btn-connect-mc" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к медиаконвертеру" style="padding: 4px 6px; background: #14b8a6; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">⇄ МК</button></div>` : ''}
                ${!isConnected && (isEditMode ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 18px;"><input type="text" class="fiber-label-input" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" value="${directLabel}" placeholder="Подпись…" title="Подпись жилы (не сращена)" style="flex: 1; min-width: 0; padding: 4px 6px; border: 1px solid #ced4da; border-radius: 3px; font-size: 0.7rem;"></div>` : (directLabel ? `<div style="margin-left: 18px; font-size: 0.7rem; color: #6366f1; overflow: hidden; text-overflow: ellipsis;">📝 ${escapeHtml(directLabel)}</div>` : ''))}
            </div>`;
    }

    const maxRows = Math.max(1, maxFibers);
    html += '<div class="cross-fiber-table-section">';
    html += '<h4 class="fiber-ws-panel-title">Таблица кабелей и жил</h4>';
    html += '<div class="cross-fiber-table-wrap">';
    html += '<table class="cross-fiber-table">';
    html += '<thead><tr>';
    cablesData.forEach((cableData) => {
        const cableTitle = cableData.cableName ? cableData.cableName : ('Кабель ' + cableData.index);
        html += '<th><div class="cross-fiber-th">';
        html += `<span class="cross-fiber-th-title">${escapeHtml(cableTitle)}</span><span class="cross-fiber-th-desc">${cableData.cableDescription}</span>${cableData.isFromSleeve ? ' <span class="cross-fiber-th-dir">← от муфты</span>' : ' <span class="cross-fiber-th-dir">→ к муфте</span>'}`;
        if (isEditMode) {
            var crossFiberN = getFiberCount(cableData.cable);
            var palBtnHtml = window.FiberCableConfig && window.FiberCableConfig.cablePaletteButtonHtml ? window.FiberCableConfig.cablePaletteButtonHtml() : 'Цвета';
            html += `<div class="cross-fiber-th-actions"><input type="number" class="cable-fiber-count-input cross-cable-fiber-count form-input" data-cable-id="${cableData.cableUniqueId}" min="1" max="96" value="${crossFiberN}" title="Число жил" aria-label="Число жил"><button type="button" class="btn-secondary btn-cable-palette-edit" data-cable-id="${cableData.cableUniqueId}" title="Цвета жил">${palBtnHtml}</button><button type="button" class="btn-delete-cable" data-cable-id="${cableData.cableUniqueId}" title="Удалить кабель" aria-label="Удалить кабель">✕</button></div>`;
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
                html += buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, mediaConverterConnections, fiberPorts, crossPorts);
            } else {
                html += '<div class="cross-fiber-empty">—</div>';
            }
            html += '</td>';
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div></div></div></div></main>';
    html += '</div>';
    if (isEditMode && fiberConnections.length > 0) {
        html += '<div id="fiber-conn-label-bar" class="fiber-conn-label-modal" hidden aria-hidden="true" role="dialog" aria-labelledby="fiber-conn-label-modal-title">';
        html += '<div class="fiber-conn-label-modal__backdrop" id="fiber-conn-label-bar-backdrop"></div>';
        html += '<div class="fiber-conn-label-modal__panel panel-glass panel-glass--lite">';
        html += '<div class="panel-glass-bg" aria-hidden="true"><div class="panel-glass-gradient"></div></div>';
        html += '<div class="fiber-conn-label-modal__header">';
        html += '<h3 id="fiber-conn-label-modal-title" class="fiber-conn-label-modal__title">Подпись сращивания</h3>';
        html += '<button type="button" id="fiber-conn-label-bar-close" class="fiber-conn-label-modal__close" title="Закрыть" aria-label="Закрыть">×</button>';
        html += '</div>';
        html += '<div class="fiber-conn-label-modal__body">';
        html += '<p id="fiber-conn-label-bar-desc" class="fiber-conn-label-bar-desc"></p>';
        html += '<label class="fiber-conn-label-modal__label" for="fiber-conn-label-bar-input">Подпись на линии</label>';
        html += '<input type="text" id="fiber-conn-label-bar-input" class="form-input fiber-conn-label-bar-input" placeholder="Подпись сращивания…" autocomplete="off">';
        html += '<div class="fiber-conn-label-modal__actions">';
        html += '<button type="button" id="fiber-conn-label-bar-goto" class="btn-secondary fiber-conn-label-bar-goto">Список соединений</button>';
        html += '<button type="button" id="fiber-conn-label-bar-delete" class="btn-danger fiber-conn-label-bar-delete">Удалить сращивание</button>';
        html += '</div></div></div></div>';
    }
    html += '</div>';

    html += `<div id="fiber-connections-data" data-sleeve-obj-id="${sleeveObj.properties.get('uniqueId') || 'temp'}" style="display: none;"></div>`;
    
    return html;
}

function setupFiberWorkspaceUI() {
    var root = document.querySelector('.fiber-workspace');
    if (!root) return;
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

function showMergeCablesDialog(sleeveObj) {
    const connectedCables = getConnectedCables(sleeveObj);
    
    if (connectedCables.length < 2) {
        showWarning('Для объединения нужно минимум 2 кабеля', 'Объединение кабелей');
        return;
    }

    let totalFibers = 0;
    const cablesInfo = connectedCables.map(cable => {
        const cableType = cable.properties.get('cableType');
        const fiberCount = getFiberCount(cable);
        totalFibers += fiberCount;
        const cableDescription = getCableDescription(cableType, cable);
        return { cable, cableType, fiberCount, cableDescription };
    });

    var maxMergeFibers = window.FiberCableConfig ? window.FiberCableConfig.MAX_FIBERS : 96;
    if (totalFibers > maxMergeFibers) {
        showError('Общее количество жил (' + totalFibers + ') превышает максимум (' + maxMergeFibers + '). Невозможно объединить.', 'Объединение кабелей');
        return;
    }

    const maxFibers = sleeveObj.properties.get('maxFibers');
    if (maxFibers && maxFibers > 0) {
        const usedFibersCount = getTotalUsedFibersInSleeve(sleeveObj);
        if (usedFibersCount - totalFibers + totalFibers > maxFibers) {
            showError('Объединение невозможно: новый кабель превысит максимальную вместимость муфты!', 'Переполнение муфты');
            return;
        }
    }

    const cablesList = cablesInfo.map(c => `- ${c.cableDescription} (${c.fiberCount} жил)`).join('\n');
    const confirmMsg = 'Объединить кабели в один?\n\n' + cablesList + '\n\nИтого: ' + totalFibers + ' жил';
    
    (async function() {
        if (!(await showConfirm(confirmMsg, 'Объединить кабели', { confirmText: 'Объединить' }))) return;

    const targetObjects = new Set();
    cablesInfo.forEach(info => {
        const fromObj = info.cable.properties.get('from');
        const toObj = info.cable.properties.get('to');
        if (fromObj !== sleeveObj) targetObjects.add(fromObj);
        if (toObj !== sleeveObj) targetObjects.add(toObj);
    });
    
    if (targetObjects.size !== 1) {
        showWarning('Объединение возможно только для кабелей, идущих от одной муфты к одному объекту', 'Объединение кабелей');
        return;
    }
    
    const targetObj = Array.from(targetObjects)[0];

    const success = addCable(sleeveObj, targetObj, 'fiber');
    if (!success) {
        return;
    }

    const newCable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        ((obj.properties.get('from') === sleeveObj && obj.properties.get('to') === targetObj) ||
         (obj.properties.get('from') === targetObj && obj.properties.get('to') === sleeveObj))
    );
    
    if (!newCable) {
        showError('Ошибка при создании объединённого кабеля', 'Объединение кабелей');
        return;
    }

    updateCableFiberSettings(newCable.properties.get('uniqueId'), totalFibers, undefined);

    cablesInfo.forEach(info => {
        deleteCableByUniqueId(info.cable.properties.get('uniqueId'));
    });

    document.getElementById('infoModal').style.display = 'none';
    showObjectInfo(sleeveObj);
    
    showSuccess('Кабели успешно объединены: ВОЛС, ' + totalFibers + ' жил', 'Объединение кабелей');
    })();
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

/** Плавная кубическая кривая между портами жил. При сращении в одном столбце — дуга к центру схемы. */
function buildFiberSchemeConnectionPath(x1, y1, x2, y2, portHalf, opts) {
    opts = opts || {};
    const goRight = x2 >= x1;
    const sx = x1 + (goRight ? portHalf : -portHalf);
    const ex = x2 + (goRight ? -portHalf : portHalf);
    const dy = y2 - y1;
    const absDy = Math.abs(dy);
    const sameSide = opts.sameSide || Math.abs(x2 - x1) < 10;

    if (sameSide) {
        const isLeft = opts.isLeft != null ? opts.isLeft : x1 < (opts.svgWidth || 800) / 2;
        const bowX = Math.max(48, Math.min(160, absDy * 0.5 + 40)) * (isLeft ? 1 : -1);
        const bowY = Math.max(8, Math.min(32, absDy * 0.1));
        const c1x = sx + bowX;
        const c2x = ex + bowX;
        const c1y = y1 + (dy >= 0 ? bowY : -bowY);
        const c2y = y2 + (dy >= 0 ? -bowY : bowY);
        return 'M ' + sx + ' ' + y1 + ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + ex + ' ' + y2;
    }
    const dx = Math.abs(x2 - x1);
    const bow = Math.max(18, Math.min(64, dx * 0.45));
    const c1x = sx + (goRight ? bow : -bow);
    const c2x = ex + (goRight ? -bow : bow);
    return 'M ' + sx + ' ' + y1 + ' C ' + c1x + ' ' + y1 + ', ' + c2x + ' ' + y2 + ', ' + ex + ' ' + y2;
}

/** Раскладка по образцу: слева/справа столбцы кабелей (гориз. магистраль + подписи), жилы веером к центру. */
function layoutFiberSchemeReference(cablesData, svgWidth, opts) {
    const rowHeight = opts.rowHeight;
    const sidePad = opts.sidePad;
    const panelW = opts.panelW;
    const fiberFanLen = opts.fiberFanLen;
    const blockGap = opts.blockGap;
    const labelH = opts.labelH;
    const fiberPositions = new Map();
    const blocks = [];
    const leftCount = Math.ceil(cablesData.length / 2);
    const leftCables = cablesData.slice(0, leftCount);
    const rightCables = cablesData.slice(leftCount);

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
    const svgHeight = Math.max(leftBottom, rightBottom, 180) + sidePad;
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
    });
}

function setupBackupsSection() {
    const refreshBtn = document.getElementById('backupsRefreshBtn');
    const listEl = document.getElementById('backupsList');
    if (!refreshBtn || !listEl) return;

    refreshBtn.addEventListener('click', loadBackupsList);

    document.querySelectorAll('.accordion-header').forEach(header => {
        if (header.getAttribute('data-accordion') === 'backups') {
            header.addEventListener('click', function() {
                setTimeout(loadBackupsList, 150);
            });
        }
    });
}

var MONTH_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function groupBackupsByMonth(backups) {
    var groups = {};
    backups.forEach(function(b) {
        var dateStr = b.date || '';
        var parts = dateStr.split('-');
        var key = parts.length >= 2 ? parts[0] + '-' + parts[1] : dateStr;
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
    });
    var keys = Object.keys(groups).sort().reverse();
    return keys.map(function(k) {
        var items = groups[k];
        var first = items[0].date || '';
        var y = first.substring(0, 4), m = first.substring(5, 7);
        var monthNum = parseInt(m, 10) || 0;
        var monthLabel = (monthNum >= 1 && monthNum <= 12 ? MONTH_NAMES[monthNum - 1] : m) + ' ' + y;
        return { key: k, label: monthLabel, items: items };
    });
}

function loadBackupsList() {
    const listEl = document.getElementById('backupsList');
    if (!listEl || !getApiBase() || !getAuthToken()) return;
    listEl.innerHTML = '<div class="backups-loading">Загрузка…</div>';
    listEl.removeEventListener('click', handleBackupListClick);
    fetch(getApiBase() + '/api/backups', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) {
        if (!r.ok) throw new Error(r.status === 401 ? 'Требуется авторизация' : 'Ошибка загрузки');
        return r.json();
    }).then(function(data) {
        const backups = data.backups || [];
        if (backups.length === 0) {
            listEl.innerHTML = '<p class="backups-empty">Нет резервных копий</p>';
            return;
        }
        var groups = groupBackupsByMonth(backups);
        var html = '<div class="backups-list-scroll">';
        groups.forEach(function(gr, idx) {
            var isFirst = idx === 0;
            var openClass = isFirst ? ' backup-month-open' : '';
            html += '<div class="backup-month' + openClass + '" data-month="' + escapeHtml(gr.key) + '">';
            html += '<button type="button" class="backup-month-header" aria-expanded="' + isFirst + '">';
            html += '<span class="backup-month-label">' + escapeHtml(gr.label) + '</span>';
            html += '<span class="backup-month-count">' + gr.items.length + '</span>';
            html += '<svg class="backup-month-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            html += '</button>';
            html += '<div class="backup-month-items">';
            gr.items.forEach(function(b) {
                if (!b || !b.filename) return;
                var d = (b.date || '').split('-');
                var day = d.length >= 3 ? d[2] : b.date || '';
                var m = d.length >= 2 ? parseInt(d[1], 10) : 0;
                var shortMonth = (m >= 1 && m <= 12 ? MONTH_NAMES[m - 1].substring(0, 3) : '') || d[1];
                var rowLabel = day + ' ' + shortMonth;
                html += '<div class="backup-item">';
                html += '<span class="backup-date">' + escapeHtml(rowLabel) + '</span>';
                html += '<button type="button" class="btn-restore-backup" data-filename="' + escapeHtml(b.filename) + '" title="Восстановить на эту дату">Восстановить</button>';
                html += '</div>';
            });
            html += '</div></div>';
        });
        html += '</div>';
        listEl.innerHTML = html;
        listEl.addEventListener('click', handleBackupListClick);
        listEl.querySelectorAll('.backup-month-header').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var block = this.closest('.backup-month');
                if (block) {
                    block.classList.toggle('backup-month-open');
                    this.setAttribute('aria-expanded', block.classList.contains('backup-month-open'));
                }
            });
        });
    }).catch(function(e) {
        listEl.innerHTML = '<p class="backups-error">' + escapeHtml(e.message || 'Ошибка загрузки') + '</p>';
    });
}

function handleBackupListClick(e) {
    var btn = e.target && e.target.closest('.btn-restore-backup');
    if (!btn) return;
    var filename = btn.getAttribute('data-filename');
    if (!filename || !getApiBase() || !getAuthToken()) return;
    e.preventDefault();
    var dateLabel = filename.replace(/backup-|\.json/g, '');
    (async function() {
        if (!(await showConfirm('Восстановить данные от ' + dateLabel + '? Текущие данные будут заменены, все учётные записи организации будут отключены. После восстановления потребуется войти снова.', 'Восстановление бэкапа', { confirmText: 'Восстановить' }))) return;
    btn.disabled = true;
    fetch(getApiBase() + '/api/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
        body: JSON.stringify({ filename: filename })
    }).then(function(res) { return res.json().then(function(j) { return { ok: res.ok, body: j }; }); }).then(function(r) {
        if (r.ok) {
            try {
                sessionStorage.removeItem('networkMap_session');
                sessionStorage.removeItem('networkMap_token');
                localStorage.removeItem('networkMap_token');
                localStorage.removeItem('networkMap_session');
                localStorage.removeItem('networkMap_tokenExpiry');
            } catch (e) {}
            if (typeof showSuccess === 'function') showSuccess('Данные восстановлены. Все учётные записи организации отключены. Войдите снова.');
            else alert('Данные восстановлены. Все учётные записи организации отключены. Войдите снова.');
            setTimeout(function() { window.location.href = 'auth.html'; }, 800);
        } else {
            btn.disabled = false;
            var errMsg = (r.body && r.body.error) ? r.body.error : 'Ошибка восстановления';
            if (typeof showError === 'function') showError(errMsg);
            else alert(errMsg);
        }
    }).catch(function(err) {
        btn.disabled = false;
        var msg = (err && err.message) ? err.message : 'Ошибка сети';
        if (typeof showError === 'function') showError(msg);
        else alert(msg);
    });
    })();
}

setTimeout(() => {
    updateUIForMode();
    updateEditControls();
    updateStats();
    updateCableVisualization();
    updateAllConnectionLines();
}, 100);
