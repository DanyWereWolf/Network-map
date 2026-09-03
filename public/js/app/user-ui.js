/**
 * Авторизация сессии, профиль, пользователи, организации, лимиты карты.
 */
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
    const filesSection = document.getElementById('filesAccordionSection');
    if (filesSection) {
        filesSection.style.display = currentUser.role === 'admin' ? 'block' : 'none';
    }
    const deviceCatalogBtn = document.getElementById('deviceCatalogBtn');
    if (deviceCatalogBtn) {
        deviceCatalogBtn.style.display = currentUser.role === 'admin' ? 'flex' : 'none';
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

    setupUsersModalHandlers();

    function bindDeferredMapUiHandlers() {
        if (deviceCatalogBtn && typeof openDeviceCatalogModal === 'function' && !deviceCatalogBtn._deferredClickBound) {
            deviceCatalogBtn._deferredClickBound = true;
            deviceCatalogBtn.addEventListener('click', openDeviceCatalogModal);
        }
        var historyBtn = document.getElementById('historyBtn');
        if (historyBtn && typeof openHistoryModal === 'function' && !historyBtn._deferredClickBound) {
            historyBtn._deferredClickBound = true;
            historyBtn.addEventListener('click', openHistoryModal);
        }
        if (typeof setupHistoryModalHandlers === 'function') setupHistoryModalHandlers();
        if (typeof setupDeviceCatalogModalHandlers === 'function') setupDeviceCatalogModalHandlers();
        if (typeof updateHistoryBadge === 'function') updateHistoryBadge();
    }

    function bindDeferredHelpHandlers() {
        var infoHelpBtn = document.getElementById('infoHelpBtn');
        if (infoHelpBtn && typeof openHelpModal === 'function' && !infoHelpBtn._deferredClickBound) {
            infoHelpBtn._deferredClickBound = true;
            infoHelpBtn.addEventListener('click', openHelpModal);
        }
        if (typeof setupHelpModalHandlers === 'function') setupHelpModalHandlers();
    }

    if (window._mapScriptsReadyPromise) {
        window._mapScriptsReadyPromise.then(bindDeferredMapUiHandlers);
    } else {
        bindDeferredMapUiHandlers();
    }
    if (window._uiExtrasPromise) {
        window._uiExtrasPromise.then(bindDeferredHelpHandlers);
    } else {
        bindDeferredHelpHandlers();
    }

    setupUndergroundEditBar();
    setupBackupsSection();

    setupSidebarToggle();
    setupStatsToggle();
    setupProfileAvatarHandlers();
}

var mapLimitsCache = { count: 0, limit: 20000, unlocked: false, remaining: 20000, defaultFreeLimit: 20000 };
var MAP_LIMIT_WARN_RATIO = 0.98;
var MAP_LIMIT_BANNER_DISMISS_KEY = 'mapLimitBannerDismissedCount';
var mapLimitBannerCloseBound = false;
var OWNER_CONTACT_EMAIL = 'support@volsmap.ru';
var OWNER_CONTACT_MAILTO = 'mailto:' + OWNER_CONTACT_EMAIL + '?subject=' + encodeURIComponent('Снятие лимита объектов — Карта оптической сети');

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
        el.classList.add('map-limit-banner--hidden');
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
    el.classList.remove('map-limit-banner--hidden');
}

function onMapObjectLimitError(message, limits) {
    if (limits) applyMapLimitsCache(limits);
    var text = message || 'Достигнут лимит объектов на карте. Чтобы снять ограничение, напишите владельцу программы.';
    if (typeof showWarning === 'function') {
        showWarning(
            text + ' <a href="' + OWNER_CONTACT_MAILTO + '" style="color:inherit;text-decoration:underline;">Написать владельцу</a>',
            'Лимит объектов',
            true,
            'angry'
        );
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
    loadOrgDisplayPanel();
    loadOrgSecurityPanel();
    loadOrgEmbedPanel();
}

var orgSecurityPendingSecret = '';

function isOrgMapAdmin() {
    return !!(currentUser && currentUser.role === 'admin' && currentUser.organizationId);
}

function updateOrgAdminSettingsVisibility() {
    var wrap = document.getElementById('orgAdminSettings');
    var display = document.getElementById('orgDisplaySection');
    var security = document.getElementById('orgSecuritySection');
    var embed = document.getElementById('orgEmbedSection');
    if (!wrap) return;
    var anyVisible = (display && display.style.display !== 'none') ||
        (security && security.style.display !== 'none') ||
        (embed && embed.style.display !== 'none');
    wrap.style.display = anyVisible ? 'flex' : 'none';
}

function getOrgCollaboratorCursorStyleValue() {
    var checked = document.querySelector('input[name="orgCollaboratorCursorStyle"]:checked');
    return checked && checked.value === 'circle' ? 'circle' : 'pointer';
}

function setOrgCollaboratorCursorStyleValue(style) {
    var value = style === 'circle' ? 'circle' : 'pointer';
    var inputs = document.querySelectorAll('input[name="orgCollaboratorCursorStyle"]');
    inputs.forEach(function(input) {
        input.checked = input.value === value;
    });
}

function loadOrgDisplayPanel() {
    var section = document.getElementById('orgDisplaySection');
    if (!section) return;
    if (!isOrgMapAdmin() || !getApiBase()) {
        section.style.display = 'none';
        updateOrgAdminSettingsVisibility();
        return;
    }
    section.style.display = 'block';
    setOrgCollaboratorCursorStyleValue(typeof window.getCollaboratorCursorStyle === 'function'
        ? window.getCollaboratorCursorStyle()
        : 'pointer');
    fetch(getApiBase() + '/api/settings', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        var style = body.collaboratorCursorStyle === 'circle' ? 'circle' : 'pointer';
        setOrgCollaboratorCursorStyleValue(style);
        if (typeof window.applyCollaboratorCursorStyle === 'function') window.applyCollaboratorCursorStyle(style);
    }).catch(function() {})
    .finally(function() { updateOrgAdminSettingsVisibility(); });
}

function saveOrgCollaboratorCursorStyle() {
    if (!getApiBase()) return;
    var style = getOrgCollaboratorCursorStyleValue();
    fetch(getApiBase() + '/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getAuthToken()
        },
        body: JSON.stringify({ collaboratorCursorStyle: style })
    }).then(function(r) {
        if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка'); });
        if (typeof window.applyCollaboratorCursorStyle === 'function') window.applyCollaboratorCursorStyle(style);
        if (typeof showSuccess === 'function') showSuccess('Настройка отображения сохранена');
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Не удалось сохранить настройку');
    });
}

function loadOrgSecurityPanel() {
    var section = document.getElementById('orgSecuritySection');
    if (!section) return;
    if (!isOrgMapAdmin() || !getApiBase()) {
        section.style.display = 'none';
        updateOrgAdminSettingsVisibility();
        return;
    }
    section.style.display = 'block';
    updateOrgAdminSettingsVisibility();
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

function loadOrgEmbedPanel() {
    var section = document.getElementById('orgEmbedSection');
    if (!section) return;
    if (!isOrgMapAdmin() || !getApiBase()) {
        section.style.display = 'none';
        updateOrgAdminSettingsVisibility();
        return;
    }
    section.style.display = 'block';
    updateOrgAdminSettingsVisibility();
    var statusEl = document.getElementById('orgEmbedStatus');
    if (statusEl) statusEl.textContent = 'Загрузка…';
    fetch(getApiBase() + '/api/organizations/me/embed', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        renderOrgEmbedPanel(body);
    }).catch(function(e) {
        if (statusEl) statusEl.textContent = e.message || 'Не удалось загрузить настройки';
    });
}

function renderOrgEmbedPanel(body) {
    body = body || {};
    var enabled = !!body.enabled;
    var statusEl = document.getElementById('orgEmbedStatus');
    var linkWrap = document.getElementById('orgEmbedLinkWrap');
    var urlInput = document.getElementById('orgEmbedUrl');
    var enableBtn = document.getElementById('orgEmbedEnableBtn');
    var rotateBtn = document.getElementById('orgEmbedRotateBtn');
    var disableBtn = document.getElementById('orgEmbedDisableBtn');
    if (statusEl) {
        statusEl.textContent = enabled
            ? 'Ссылка активна. Вставьте URL в виджет URL дашборда Zabbix.'
            : 'Ссылка не создана. После создания карта откроется во встраивании без входа.';
        statusEl.className = 'org-security-status' + (enabled ? ' is-on' : '');
    }
    if (linkWrap) linkWrap.style.display = enabled ? 'block' : 'none';
    if (urlInput) urlInput.value = body.embedUrl || '';
    if (enableBtn) enableBtn.style.display = enabled ? 'none' : 'inline-flex';
    if (rotateBtn) rotateBtn.style.display = enabled ? 'inline-flex' : 'none';
    if (disableBtn) disableBtn.style.display = enabled ? 'inline-flex' : 'none';
}

function enableOrgEmbed(rotate) {
    if (!getApiBase()) return;
    fetch(getApiBase() + '/api/organizations/me/embed', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getAuthToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotate: !!rotate })
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        renderOrgEmbedPanel(body);
        if (typeof showSuccess === 'function') {
            showSuccess(rotate ? 'Токен обновлён — обновите URL в Zabbix' : 'Ссылка для встраивания создана');
        }
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Не удалось создать ссылку');
    });
}

function disableOrgEmbed() {
    if (!getApiBase()) return;
    var ask = window.confirm('Отключить ссылку встраивания? Виджет в Zabbix перестанет открывать карту.');
    if (!ask) return;
    fetch(getApiBase() + '/api/organizations/me/embed', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
    }).then(function(r) { return r.json(); })
    .then(function(body) {
        if (body.error) throw new Error(body.error);
        renderOrgEmbedPanel({ enabled: false });
        if (typeof showSuccess === 'function') showSuccess('Встраивание отключено');
    }).catch(function(e) {
        if (typeof showError === 'function') showError(e.message || 'Не удалось отключить');
    });
}

function copyOrgEmbedUrl() {
    var urlInput = document.getElementById('orgEmbedUrl');
    var url = urlInput ? String(urlInput.value || '').trim() : '';
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
            if (typeof showSuccess === 'function') showSuccess('URL скопирован');
        }).catch(function() {});
    } else {
        urlInput.select();
        try { document.execCommand('copy'); } catch (e) {}
        if (typeof showSuccess === 'function') showSuccess('URL скопирован');
    }
}

function closeUsersModal() {
    const modal = document.getElementById('usersModal');
    modal.style.display = 'none';
}

var cachedOrganizationsList = null;
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

function isGlobalMapAdmin() {
    return !!(currentUser && currentUser.role === 'admin' && currentUser.organizationId == null);
}

function populateUserOrganizationSelect(orgSelect, options) {
    options = options || {};
    if (!orgSelect) return;
    var orgs = (typeof AuthSystem !== 'undefined' && AuthSystem.getOrganizations) ? AuthSystem.getOrganizations() : [];
    orgSelect.innerHTML = '';
    if (options.includePlaceholder !== false) {
        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = options.placeholderText || 'Выберите организацию…';
        orgSelect.appendChild(placeholder);
    }
    orgs.forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.name || o.id;
        orgSelect.appendChild(opt);
    });
    if (options.selectedId) orgSelect.value = options.selectedId;
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
    const deleteUserBtn = document.getElementById('deleteUserBtn');
    if (userId) {
        const users = AuthSystem.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return;
        var isMainAdminUser = user.username === 'admin';
        var showOrgField = isGlobalMapAdmin() && !isMainAdminUser;
        if (orgSelect) {
            var orgGroup = orgSelect.closest('.form-group');
            if (orgGroup) orgGroup.style.display = showOrgField ? '' : 'none';
            if (showOrgField) {
                populateUserOrganizationSelect(orgSelect, {
                    selectedId: user.organizationId || '',
                    placeholderText: 'Выберите организацию…'
                });
            }
        }
        title.textContent = 'Редактировать пользователя';
        userIdInput.value = user.id;
        usernameInput.value = user.username;
        usernameInput.disabled = true;
        fullNameInput.value = user.fullName || '';
        passwordInput.value = '';
        roleSelect.value = user.role;
        if (deleteUserBtn) {
            var canDelete = user.id !== currentUser.userId && !isMainAdminUser;
            deleteUserBtn.style.display = canDelete ? '' : 'none';
            deleteUserBtn.onclick = canDelete ? function() { deleteUser(user.id); } : null;
        }
    } else {
        if (deleteUserBtn) deleteUserBtn.style.display = 'none';
        title.textContent = 'Добавить пользователя';
        userIdInput.value = '';
        usernameInput.value = '';
        usernameInput.disabled = false;
        fullNameInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'user';
        if (orgSelect) {
            var orgGroupAdd = orgSelect.closest('.form-group');
            if (currentUser && currentUser.organizationId != null) {
                if (orgGroupAdd) orgGroupAdd.style.display = 'none';
                orgSelect.value = currentUser.organizationId;
            } else if (isGlobalMapAdmin()) {
                if (orgGroupAdd) orgGroupAdd.style.display = '';
                populateUserOrganizationSelect(orgSelect, { placeholderText: 'Выберите организацию…' });
            } else {
                if (orgGroupAdd) orgGroupAdd.style.display = 'none';
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
        var organizationId = null;
        if (users[userIndex].username === 'admin') {
            organizationId = null;
        } else if (currentUser && currentUser.organizationId != null) {
            organizationId = currentUser.organizationId;
        } else if (isGlobalMapAdmin()) {
            organizationId = (orgSelect && orgSelect.value) ? orgSelect.value : null;
            if (!organizationId) {
                showError('Выберите организацию');
                return;
            }
        } else {
            organizationId = users[userIndex].organizationId || null;
        }
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
        var organizationId = (currentUser && currentUser.organizationId != null)
            ? currentUser.organizationId
            : ((orgSelect && orgSelect.value) ? orgSelect.value : null);
        if (!organizationId) {
            showError('Выберите организацию');
            return;
        }
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
            closeUserEditModal();
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
    closeUserEditModal();
    renderUsersList();
    logAction(ActionTypes.USER_DELETED, { username: username });
    })();
}

window.deleteUser = deleteUser;
window.editUser = editUser;
window.openUsersModal = openUsersModal;

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
    var orgCollaboratorCursorStyleSaveBtn = document.getElementById('orgCollaboratorCursorStyleSaveBtn');
    if (orgCollaboratorCursorStyleSaveBtn) orgCollaboratorCursorStyleSaveBtn.addEventListener('click', saveOrgCollaboratorCursorStyle);
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

    var orgEmbedEnableBtn = document.getElementById('orgEmbedEnableBtn');
    if (orgEmbedEnableBtn) orgEmbedEnableBtn.addEventListener('click', function() { enableOrgEmbed(false); });
    var orgEmbedRotateBtn = document.getElementById('orgEmbedRotateBtn');
    if (orgEmbedRotateBtn) orgEmbedRotateBtn.addEventListener('click', function() { enableOrgEmbed(true); });
    var orgEmbedDisableBtn = document.getElementById('orgEmbedDisableBtn');
    if (orgEmbedDisableBtn) orgEmbedDisableBtn.addEventListener('click', disableOrgEmbed);
    var orgEmbedCopyBtn = document.getElementById('orgEmbedCopyBtn');
    if (orgEmbedCopyBtn) orgEmbedCopyBtn.addEventListener('click', copyOrgEmbedUrl);

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
