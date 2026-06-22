function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return 'hash_' + Math.abs(hash).toString(16) + '_' + password.length;
}

function initUserSystem() {
    if (typeof getApiBase !== 'function' || !getApiBase()) return;
    // Панель главного администратора (`site-admin.html`) управляет организациями и витриной,
    // а эндпоинт `/api/users` может давать 403 в случаях, когда пользователь не является глобальным админом.
    // Чтобы не спамить запросами и ошибками, отключаем загрузку пользователей на этой странице.
    if (document.getElementById('adminContent')) return;
    refreshUsersFromApi();
}

function getUsers() {
    try {
        const usersJson = sessionStorage.getItem('networkMap_users');
        return usersJson ? JSON.parse(usersJson) : [];
    } catch (e) { return []; }
}

function saveUsers(users) {
    try { sessionStorage.setItem('networkMap_users', JSON.stringify(users)); } catch (e) {}
}

function findUserByUsername(username) {
    const users = getUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

var REMEMBER_EXPIRY_DAYS = 30;
// Авто-выход при отсутствии активности (1 ч)
var INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
var ACTIVITY_EVENT_THROTTLE_MS = 1000;
var inactivityLogoutTimerId = null;
var lastUserActivityAt = 0;
var lastActivityEventAt = 0;

function clearExpiredRememberAuth() {
    try {
        var exp = localStorage.getItem('networkMap_tokenExpiry');
        if (exp && Date.now() > parseInt(exp, 10)) {
            localStorage.removeItem('networkMap_token');
            localStorage.removeItem('networkMap_session');
            localStorage.removeItem('networkMap_tokenExpiry');
        }
    } catch (e) {}
}

function getAuthToken() {
    clearExpiredRememberAuth();
    try {
        var exp = localStorage.getItem('networkMap_tokenExpiry');
        if (exp && Date.now() <= parseInt(exp, 10)) {
            var t = localStorage.getItem('networkMap_token');
            if (t) return t;
        }
        return sessionStorage.getItem('networkMap_token') || '';
    } catch (e) { return ''; }
}

function getStoredSession() {
    clearExpiredRememberAuth();
    try {
        var exp = localStorage.getItem('networkMap_tokenExpiry');
        if (exp && Date.now() <= parseInt(exp, 10)) {
            var s = localStorage.getItem('networkMap_session');
            if (s) return JSON.parse(s);
        }
        var s = sessionStorage.getItem('networkMap_session');
        return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
}

var authPublicConfig = null;
var pendingLoginId = null;
var pendingLoginRememberMe = false;
var activeResetToken = null;

function loadAuthPublicConfig() {
    if (!getApiBase()) return Promise.resolve(null);
    return fetch(getApiBase() + '/api/public-config', { cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            authPublicConfig = cfg || {};
            return cfg;
        })
        .catch(function() { return null; });
}

function storeAuthSession(body, rememberMe) {
    if (rememberMe) {
        var expiry = Date.now() + REMEMBER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        localStorage.setItem('networkMap_token', body.token);
        localStorage.setItem('networkMap_session', JSON.stringify(body.user));
        localStorage.setItem('networkMap_tokenExpiry', String(expiry));
        sessionStorage.removeItem('networkMap_token');
        sessionStorage.removeItem('networkMap_session');
    } else {
        sessionStorage.setItem('networkMap_token', body.token);
        sessionStorage.setItem('networkMap_session', JSON.stringify(body.user));
        localStorage.removeItem('networkMap_token');
        localStorage.removeItem('networkMap_session');
        localStorage.removeItem('networkMap_tokenExpiry');
    }
}

function loginUser(username, password, rememberMe) {
    if (!getApiBase()) {
        return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    }
    return fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    }).then(function(r) { return r.json().then(function(body) { return { status: r.status, body: body }; }); })
    .then(function(res) {
        var body = res.body || {};
        if (body.success && body.token && body.user) {
            storeAuthSession(body, rememberMe);
            return { success: true, user: body.user };
        }
        if (body.requiresTotp && body.pendingLoginId) {
            return {
                success: false,
                requiresTotp: true,
                pendingLoginId: body.pendingLoginId,
                organizationName: body.organizationName || ''
            };
        }
        return { success: false, error: body.error || 'Ошибка входа', status: res.status };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function verifyLoginTotp(pendingId, totpCode, rememberMe) {
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Сервер недоступен' });
    return fetch(getApiBase() + '/api/auth/verify-totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingLoginId: pendingId, totpCode: totpCode })
    }).then(function(r) { return r.json(); }).then(function(body) {
        if (body.success && body.token && body.user) {
            storeAuthSession(body, rememberMe);
            return { success: true, user: body.user };
        }
        return { success: false, error: body.error || 'Неверный код' };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function showTotpStep(organizationName) {
    var loginForm = document.getElementById('loginForm');
    var registerForm = document.getElementById('registerForm');
    var totpForm = document.getElementById('totpForm');
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.remove('active');
    if (totpForm) totpForm.classList.add('active');
    var hint = document.getElementById('totpOrgHint');
    if (hint) {
        hint.textContent = organizationName
            ? ('Организация «' + organizationName + '». Введите 6-значный код из приложения-аутентификатора.')
            : 'Введите 6-значный код из приложения-аутентификатора вашей организации.';
    }
    var codeEl = document.getElementById('loginTotpCode');
    if (codeEl) { codeEl.value = ''; codeEl.focus(); }
}

function hideTotpStep() {
    pendingLoginId = null;
    var totpForm = document.getElementById('totpForm');
    var loginForm = document.getElementById('loginForm');
    if (totpForm) totpForm.classList.remove('active');
    if (loginForm) loginForm.classList.add('active');
}

var REGISTER_MAP_DEFAULT = { center: [54.663609, 86.162243], zoom: 15 };
var registerMapInstance = null;
var registerMapPlacemark = null;
var registerMapSyncFromPan = false;
var registerMapCoordsTimer = null;

function whenYmapsReady(cb) {
    if (window.ymaps) { window.ymaps.ready(cb); return; }
    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (window.ymaps) {
            clearInterval(timer);
            window.ymaps.ready(cb);
        } else if (attempts > 100) {
            clearInterval(timer);
        }
    }, 100);
}

function normalizeMapCoords(center) {
    if (!center) return null;
    var lat = Array.isArray(center) ? center[0] : (center.lat != null ? (typeof center.lat === 'function' ? center.lat() : center.lat) : center[0]);
    var lon = Array.isArray(center) ? center[1] : (center.lng != null ? (typeof center.lng === 'function' ? center.lng() : center.lng) : center[1]);
    lat = Number(lat);
    lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return [lat, lon];
}

function setRegisterMapCoords(coords, zoom) {
    var normalized = normalizeMapCoords(coords);
    if (!normalized) return;
    var latEl = document.getElementById('regMapLat');
    var lonEl = document.getElementById('regMapLon');
    var zoomEl = document.getElementById('regMapZoom');
    var labelEl = document.getElementById('regMapCoordsLabel');
    if (latEl) latEl.value = String(normalized[0]);
    if (lonEl) lonEl.value = String(normalized[1]);
    if (zoomEl && typeof zoom === 'number' && Number.isFinite(zoom)) zoomEl.value = String(Math.max(1, Math.min(21, Math.round(zoom))));
    if (labelEl) labelEl.textContent = normalized[0].toFixed(5) + ', ' + normalized[1].toFixed(5);
}

function syncRegisterMapCoordsFromMap() {
    if (!registerMapInstance) return getRegisterMapStart();
    var coords = normalizeMapCoords(registerMapInstance.getCenter());
    var zoom = registerMapInstance.getZoom();
    if (coords) {
        if (registerMapPlacemark) registerMapPlacemark.geometry.setCoordinates(coords);
        setRegisterMapCoords(coords, zoom);
    }
    return getRegisterMapStart();
}

function getRegisterMapStart() {
    if (registerMapInstance) {
        var coords = normalizeMapCoords(registerMapInstance.getCenter());
        var zoom = registerMapInstance.getZoom();
        if (coords) {
            setRegisterMapCoords(coords, zoom);
            return { center: coords, zoom: typeof zoom === 'number' && Number.isFinite(zoom) ? Math.max(1, Math.min(21, zoom)) : 15 };
        }
    }
    var lat = parseFloat(document.getElementById('regMapLat') && document.getElementById('regMapLat').value);
    var lon = parseFloat(document.getElementById('regMapLon') && document.getElementById('regMapLon').value);
    var zoomVal = parseInt(document.getElementById('regMapZoom') && document.getElementById('regMapZoom').value, 10);
    var coordsFromInput = normalizeMapCoords([lat, lon]);
    if (!coordsFromInput) coordsFromInput = REGISTER_MAP_DEFAULT.center.slice();
    return {
        center: coordsFromInput,
        zoom: Number.isFinite(zoomVal) && zoomVal >= 1 && zoomVal <= 21 ? zoomVal : REGISTER_MAP_DEFAULT.zoom
    };
}

function destroyRegisterMapPicker() {
    if (registerMapInstance) {
        try { registerMapInstance.destroy(); } catch (e) {}
        registerMapInstance = null;
        registerMapPlacemark = null;
    }
}

function initRegisterMapPicker() {
    var container = document.getElementById('regMapPicker');
    if (!container) return;
    setRegisterMapCoords(REGISTER_MAP_DEFAULT.center, REGISTER_MAP_DEFAULT.zoom);
    whenYmapsReady(function() {
        if (!document.getElementById('regMapPicker') || registerMapInstance) return;
        var start = getRegisterMapStart();
        registerMapInstance = new ymaps.Map('regMapPicker', {
            center: start.center,
            zoom: start.zoom,
            controls: ['zoomControl', 'searchControl']
        });
        try { registerMapInstance.behaviors.disable('scrollZoom'); } catch (e) {}
        registerMapPlacemark = new ymaps.Placemark(start.center, {}, {
            preset: 'islands#blueCircleDotIcon',
            draggable: true
        });
        registerMapInstance.geoObjects.add(registerMapPlacemark);
        registerMapPlacemark.events.add('dragend', function() {
            registerMapSyncFromPan = true;
            var coords = normalizeMapCoords(registerMapPlacemark.geometry.getCoordinates());
            if (coords) {
                setRegisterMapCoords(coords, registerMapInstance.getZoom());
                registerMapInstance.setCenter(coords, registerMapInstance.getZoom(), { duration: 200 });
            }
            setTimeout(function() { registerMapSyncFromPan = false; }, 300);
        });
        registerMapInstance.events.add('click', function(e) {
            var coords = normalizeMapCoords(e.get('coords'));
            if (!coords) return;
            registerMapPlacemark.geometry.setCoordinates(coords);
            setRegisterMapCoords(coords, registerMapInstance.getZoom());
        });
        registerMapInstance.events.add('actionend', function() {
            if (registerMapSyncFromPan) return;
            var coords = normalizeMapCoords(registerMapInstance.getCenter());
            if (!coords) return;
            registerMapPlacemark.geometry.setCoordinates(coords);
            setRegisterMapCoords(coords, registerMapInstance.getZoom());
        });
        registerMapInstance.events.add('boundschange', function() {
            if (registerMapSyncFromPan) return;
            if (registerMapCoordsTimer) clearTimeout(registerMapCoordsTimer);
            registerMapCoordsTimer = setTimeout(function() {
                registerMapCoordsTimer = null;
                var coords = normalizeMapCoords(registerMapInstance.getCenter());
                if (!coords) return;
                if (registerMapPlacemark) registerMapPlacemark.geometry.setCoordinates(coords);
                setRegisterMapCoords(coords, registerMapInstance.getZoom());
            }, 200);
        });
        setTimeout(function() {
            try { registerMapInstance.container.fitToViewport(); } catch (e) {}
        }, 200);
    });
}

function moveRegisterMapTo(coords, zoom) {
    var normalized = normalizeMapCoords(coords);
    if (!normalized) return;
    var z = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : (registerMapInstance ? registerMapInstance.getZoom() : REGISTER_MAP_DEFAULT.zoom);
    setRegisterMapCoords(normalized, z);
    if (!registerMapInstance || !registerMapPlacemark) {
        whenYmapsReady(function() {
            if (!registerMapInstance) initRegisterMapPicker();
            var attempts = 0;
            var wait = setInterval(function() {
                attempts++;
                if (registerMapInstance && registerMapPlacemark) {
                    clearInterval(wait);
                    registerMapPlacemark.geometry.setCoordinates(normalized);
                    registerMapInstance.setCenter(normalized, z, { duration: 300 });
                } else if (attempts > 80) {
                    clearInterval(wait);
                }
            }, 50);
        });
        return;
    }
    registerMapPlacemark.geometry.setCoordinates(normalized);
    registerMapInstance.setCenter(normalized, z, { duration: 300 });
}

function tryRegisterMapGeolocation() {
    if (!navigator.geolocation) {
        showMessage('Геолокация недоступна в этом браузере', 'error');
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        moveRegisterMapTo([pos.coords.latitude, pos.coords.longitude], 14);
    }, function() {
        showMessage('Не удалось определить местоположение', 'error');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
}

function registerUser(username, password, fullName, organizationName, contactEmail, mapStart) {
    if (username.length < 3) return Promise.resolve({ success: false, error: 'Имя пользователя должно быть не менее 3 символов' });
    if (!organizationName || organizationName.trim().length < 3) return Promise.resolve({ success: false, error: 'Укажите название организации (не менее 3 символов)' });
    if (password.length < 6) return Promise.resolve({ success: false, error: 'Пароль должен быть не менее 6 символов' });
    var email = (contactEmail && String(contactEmail).trim()) || '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.resolve({ success: false, error: 'Укажите корректный e-mail для связи' });
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    var body = { username: username, password: password, fullName: fullName || username, organizationName: String(organizationName).trim(), contactEmail: email };
    var start = mapStart && Array.isArray(mapStart.center) && mapStart.center.length >= 2 ? mapStart : null;
    if (!start) start = getRegisterMapStart();
    body.mapStart = start;
    return fetch(getApiBase() + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) return { success: false, error: res.error || 'Ошибка' };
        return { success: true, pending: res.pending, organizationId: res.organizationId };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function requestPasswordReset(usernameOrEmail) {
    if (!getApiBase()) {
        return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    }
    var input = (usernameOrEmail && String(usernameOrEmail).trim()) || '';
    if (!input) return Promise.resolve({ success: false, error: 'Укажите имя пользователя или e-mail' });
    return fetch(getApiBase() + '/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: input })
    }).then(function(r) { return r.json().then(function(body) { return { status: r.status, body: body }; }); })
    .then(function(res) {
        var body = res.body || {};
        if (body.success) return { success: true, message: body.message || 'Письмо отправлено' };
        return { success: false, error: body.error || 'Ошибка запроса', status: res.status };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function submitPasswordReset(token, password, passwordConfirm) {
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Сервер недоступен' });
    if (!token) return Promise.resolve({ success: false, error: 'Недействительная ссылка восстановления' });
    if (!password || password.length < 6) return Promise.resolve({ success: false, error: 'Пароль не менее 6 символов' });
    if (password !== passwordConfirm) return Promise.resolve({ success: false, error: 'Пароли не совпадают' });
    return fetch(getApiBase() + '/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token, password: password, passwordConfirm: passwordConfirm })
    }).then(function(r) { return r.json().then(function(body) { return { status: r.status, body: body }; }); })
    .then(function(res) {
        var body = res.body || {};
        if (body.success) return { success: true, message: body.message || 'Пароль изменён' };
        return { success: false, error: body.error || 'Ошибка', status: res.status };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function validateResetToken(token) {
    if (!getApiBase() || !token) return Promise.resolve({ valid: false });
    return fetch(getApiBase() + '/api/auth/reset-token/' + encodeURIComponent(token), { cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            if (body && body.valid) return { valid: true, username: body.username || '' };
            return { valid: false };
        })
        .catch(function() { return { valid: false }; });
}

function approveUser(userId) {
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Сервер недоступен' });
    var token = getAuthToken();
    return fetch(getApiBase() + '/api/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ userId: userId })
    }).then(function(r) { return r.json(); }).then(function(body) {
        if (body.error) return { success: false, error: body.error };
        return refreshUsersFromApi().then(function() { return { success: true }; });
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function rejectUser(userId) {
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Сервер недоступен' });
    var token = getAuthToken();
    return fetch(getApiBase() + '/api/users/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ userId: userId })
    }).then(function(r) { return r.json(); }).then(function(body) {
        if (body.error) return { success: false, error: body.error };
        return refreshUsersFromApi().then(function() { return { success: true }; });
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

function refreshUsersFromApi() {
    if (!getApiBase()) return Promise.resolve();
    var token = getAuthToken();
    if (!token) return Promise.resolve();
    return fetch(getApiBase() + '/api/users', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            if (body && body.users) sessionStorage.setItem('networkMap_users', JSON.stringify(body.users));
            if (body && body.organizations) try { sessionStorage.setItem('networkMap_organizations', JSON.stringify(body.organizations)); } catch (e) {}
        })
        .catch(function() {});
}

function getOrganizations() {
    try {
        var raw = sessionStorage.getItem('networkMap_organizations');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
}

function getPendingUsers() {
    const users = getUsers();
    return users.filter(u => u.status === 'pending');
}

function refreshSessionFromApi() {
    if (!getApiBase()) return Promise.resolve();
    var token = getAuthToken();
    if (!token) return Promise.resolve();
    return fetch(getApiBase() + '/api/auth/session', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) {
            if (r.status === 401) {
                // Clear invalid token so we don't keep spamming /api/auth/session in background.
                try {
                    sessionStorage.removeItem('networkMap_session');
                    sessionStorage.removeItem('networkMap_token');
                    localStorage.removeItem('networkMap_token');
                    localStorage.removeItem('networkMap_session');
                    localStorage.removeItem('networkMap_tokenExpiry');
                } catch (e) {}
                return null;
            }
            return r.ok ? r.json() : null;
        })
        .then(function(body) {
            if (body && body.user) {
                var session = body.user;
                try {
                    sessionStorage.setItem('networkMap_session', JSON.stringify(session));
                    if (localStorage.getItem('networkMap_tokenExpiry')) localStorage.setItem('networkMap_session', JSON.stringify(session));
                } catch (e) {}
            }
        })
        .catch(function() {});
}

function getCurrentSession() {
    return getStoredSession();
}

function isAuthenticated() {
    return getCurrentSession() !== null;
}

function isAdmin() {
    const session = getCurrentSession();
    return session && session.role === 'admin';
}

function logout() {
    stopInactivityLogoutWatcher();
    function clearClientAndRedirect() {
        try {
            sessionStorage.removeItem('networkMap_session');
            sessionStorage.removeItem('networkMap_token');
            sessionStorage.removeItem('networkMap_users');
            localStorage.removeItem('networkMap_token');
            localStorage.removeItem('networkMap_session');
            localStorage.removeItem('networkMap_tokenExpiry');
        } catch (e) {}
        window.location.href = 'auth.html';
    }
    var api = typeof getApiBase === 'function' ? getApiBase() : '';
    var token = getAuthToken();
    if (api && token) {
        // Раньше редирект сразу после fetch — запрос обрывался, сессия на сервере не удалялась.
        // keepalive + ожидание (с таймаутом) гарантируют вызов DELETE на сервере до очистки клиента.
        var logoutUrl = api + '/api/auth/logout';
        var timeoutMs = 2500;
        var serverLogout = fetch(logoutUrl, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            keepalive: true
        }).catch(function() {});
        var timeout = new Promise(function(resolve) { setTimeout(resolve, timeoutMs); });
        Promise.race([serverLogout, timeout]).finally(clearClientAndRedirect);
        return;
    }
    clearClientAndRedirect();
}

function stopInactivityLogoutWatcher() {
    if (inactivityLogoutTimerId) {
        clearTimeout(inactivityLogoutTimerId);
        inactivityLogoutTimerId = null;
    }
}

function scheduleInactivityLogoutCheck() {
    stopInactivityLogoutWatcher();
    inactivityLogoutTimerId = setTimeout(function() {
        if (!isAuthenticated()) return;
        var now = Date.now();
        if (now - lastUserActivityAt >= INACTIVITY_TIMEOUT_MS) {
            logout();
            return;
        }
        scheduleInactivityLogoutCheck();
    }, INACTIVITY_TIMEOUT_MS);
}

function registerUserActivity() {
    if (!isAuthenticated()) return;
    var now = Date.now();
    if (now - lastActivityEventAt < ACTIVITY_EVENT_THROTTLE_MS) return;
    lastActivityEventAt = now;
    lastUserActivityAt = now;
    scheduleInactivityLogoutCheck();
}

function initInactivityLogoutWatcher() {
    var isAuthPage = document.getElementById('loginForm') !== null;
    if (isAuthPage || !isAuthenticated()) return;
    lastUserActivityAt = Date.now();
    lastActivityEventAt = 0;
    scheduleInactivityLogoutCheck();
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(function(eventName) {
        document.addEventListener(eventName, registerUserActivity, { passive: true });
    });
}

function hideAllAuthForms() {
    ['loginForm', 'registerForm', 'totpForm', 'forgotPasswordForm', 'resetPasswordForm'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });
}

function switchForm(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const forgotForm = document.getElementById('forgotPasswordForm');
    const resetForm = document.getElementById('resetPasswordForm');
    const message = document.getElementById('authMessage');
    const authContainer = document.querySelector('.auth-container');
    
    message.className = 'auth-message';
    message.textContent = '';
    
    var totpForm = document.getElementById('totpForm');
    hideAllAuthForms();
    pendingLoginId = null;

    if (formType === 'login') {
        loginForm.classList.add('active');
        if (authContainer) authContainer.classList.remove('auth-register-active');
        destroyRegisterMapPicker();
    } else if (formType === 'forgot') {
        if (forgotForm) forgotForm.classList.add('active');
        if (authContainer) authContainer.classList.remove('auth-register-active');
        destroyRegisterMapPicker();
    } else if (formType === 'reset') {
        if (resetForm) resetForm.classList.add('active');
        if (authContainer) authContainer.classList.remove('auth-register-active');
        destroyRegisterMapPicker();
    } else {
        registerForm.classList.add('active');
        if (authContainer) authContainer.classList.add('auth-register-active');
        initRegisterMapPicker();
    }
}

function showMessage(text, type) {
    const message = document.getElementById('authMessage');
    message.textContent = text;
    message.className = 'auth-message ' + type;
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

document.addEventListener('DOMContentLoaded', function() {
    initUserSystem();
    const isAuthPage = document.getElementById('loginForm') !== null;
    initInactivityLogoutWatcher();

    if (isAuthPage && !getApiBase()) {
        var msg = document.getElementById('authMessage');
        if (msg) {
            msg.className = 'auth-message error';
            msg.textContent = 'Для работы приложения запустите сервер (npm run api) и откройте http://localhost:3000';
        }
    }

    if (isAuthPage && isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }

    // Открыть форму регистрации по ссылке с лендинга (?register=1) или сброс пароля (?reset=...)
    if (isAuthPage) {
        try {
            var search = window.location.search.replace(/^\?/, '').split('&').reduce(function(acc, part) {
                if (!part) return acc;
                var kv = part.split('=');
                acc[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
                return acc;
            }, {});
            if (search.reset) {
                activeResetToken = String(search.reset).trim();
                var tokenInput = document.getElementById('resetPasswordToken');
                if (tokenInput) tokenInput.value = activeResetToken;
            } else if (search.register === '1' || search.register === 'true') {
                switchForm('register');
            }
        } catch (e) {}
    }

    var regMapGeolocateBtn = document.getElementById('regMapGeolocateBtn');
    if (regMapGeolocateBtn) {
        regMapGeolocateBtn.addEventListener('click', function() {
            if (!registerMapInstance) initRegisterMapPicker();
            tryRegisterMapGeolocation();
        });
    }

    loadAuthPublicConfig().then(function() {
        if (activeResetToken) {
            validateResetToken(activeResetToken).then(function(result) {
                if (result.valid) {
                    switchForm('reset');
                    var hint = document.getElementById('resetPasswordHint');
                    if (hint && result.username) {
                        hint.textContent = 'Задайте новый пароль для учётной записи «' + result.username + '».';
                    }
                } else {
                    showMessage('Ссылка восстановления недействительна или истекла. Запросите новую.', 'error');
                    switchForm('forgot');
                }
            });
        }
    });

    var totpBackBtn = document.getElementById('totpBackBtn');
    if (totpBackBtn) {
        totpBackBtn.addEventListener('click', function() {
            hideTotpStep();
            showMessage('', '');
        });
    }

    var totpForm = document.getElementById('totpForm');
    if (totpForm) {
        totpForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (!pendingLoginId) {
                showMessage('Сессия входа истекла. Введите логин и пароль снова.', 'error');
                hideTotpStep();
                return;
            }
            var code = (document.getElementById('loginTotpCode') && document.getElementById('loginTotpCode').value || '').replace(/\s/g, '');
            if (!/^\d{6,8}$/.test(code)) {
                showMessage('Введите 6-значный код', 'error');
                return;
            }
            Promise.resolve(verifyLoginTotp(pendingLoginId, code, pendingLoginRememberMe)).then(function(result) {
                if (result.success) {
                    showMessage('Вход выполнен успешно! Перенаправление...', 'success');
                    setTimeout(function() {
                        var u = result.user || {};
                        if (u.role === 'admin' && (u.username || '').toLowerCase() === 'admin') {
                            window.location.href = 'site-admin.html';
                        } else {
                            window.location.href = 'index.html';
                        }
                    }, 1000);
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var username = document.getElementById('loginUsername').value.trim();
            var password = document.getElementById('loginPassword').value;
            var rememberMe = document.getElementById('loginRememberMe') ? document.getElementById('loginRememberMe').checked : false;
            Promise.resolve(loginUser(username, password, rememberMe)).then(function(result) {
                if (result.success) {
                    showMessage('Вход выполнен успешно! Перенаправление...', 'success');
                    setTimeout(function() {
                        var u = result.user || {};
                        if (u.role === 'admin' && (u.username || '').toLowerCase() === 'admin') {
                            window.location.href = 'site-admin.html';
                        } else {
                            window.location.href = 'index.html';
                        }
                    }, 1000);
                } else if (result.requiresTotp && result.pendingLoginId) {
                    pendingLoginId = result.pendingLoginId;
                    pendingLoginRememberMe = rememberMe;
                    showTotpStep(result.organizationName);
                    showMessage('', '');
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var username = document.getElementById('regUsername').value.trim();
            var fullName = document.getElementById('regFullName').value.trim();
            var organizationName = document.getElementById('regOrganizationName') ? document.getElementById('regOrganizationName').value.trim() : '';
            var contactEmail = document.getElementById('regContactEmail') ? document.getElementById('regContactEmail').value.trim() : '';
            var password = document.getElementById('regPassword').value;
            var passwordConfirm = document.getElementById('regPasswordConfirm').value;
            if (password !== passwordConfirm) { showMessage('Пароли не совпадают', 'error'); return; }
            var mapStart = syncRegisterMapCoordsFromMap();
            var regChain = registerUser(username, password, fullName, organizationName, contactEmail, mapStart);
            Promise.resolve(regChain).then(function(result) {
                if (result.success) {
                    if (result.organizationId) {
                        showMessage('Организация создана. Вы можете войти.', 'success');
                    } else {
                        showMessage('Заявка на регистрацию отправлена! Ожидайте одобрения администратором.', 'success');
                    }
                    setTimeout(function() { switchForm('login'); }, 2500);
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }

    var forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var input = document.getElementById('forgotUsernameOrEmail').value.trim();
            Promise.resolve(requestPasswordReset(input)).then(function(result) {
                if (result.success) {
                    showMessage(result.message || 'Если аккаунт найден, письмо отправлено.', 'success');
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }

    var resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var token = (document.getElementById('resetPasswordToken') && document.getElementById('resetPasswordToken').value) || activeResetToken || '';
            var password = document.getElementById('resetPassword').value;
            var passwordConfirm = document.getElementById('resetPasswordConfirm').value;
            Promise.resolve(submitPasswordReset(token, password, passwordConfirm)).then(function(result) {
                if (result.success) {
                    showMessage(result.message || 'Пароль изменён. Перенаправление на вход...', 'success');
                    activeResetToken = null;
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, '', 'auth.html');
                    }
                    setTimeout(function() { switchForm('login'); }, 2500);
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }
});

window.AuthSystem = {
    getCurrentSession,
    isAuthenticated,
    isAdmin,
    logout,
    approveUser,
    rejectUser,
    getPendingUsers,
    getUsers,
    saveUsers,
    getOrganizations,
    hashPassword,
    findUserByUsername,
    refreshUsersFromApi,
    refreshSessionFromApi
};
