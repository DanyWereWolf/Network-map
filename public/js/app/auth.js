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

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
var authCaptchaEnabled = false;
var authTurnstileSiteKey = '';
var turnstileWidgets = { login: null, register: null };
var pendingLoginId = null;
var pendingLoginRememberMe = false;

function loadAuthPublicConfig() {
    if (!getApiBase()) return Promise.resolve(null);
    return fetch(getApiBase() + '/api/public-config', { cache: 'no-store' })
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
            authPublicConfig = cfg || {};
            authCaptchaEnabled = !!(cfg && cfg.captchaEnabled && cfg.turnstileSiteKey);
            authTurnstileSiteKey = authCaptchaEnabled ? String(cfg.turnstileSiteKey) : '';
            return cfg;
        })
        .catch(function() { return null; });
}

function whenTurnstileReady(cb) {
    if (window.turnstile) { cb(); return; }
    var attempts = 0;
    var timer = setInterval(function() {
        attempts++;
        if (window.turnstile) {
            clearInterval(timer);
            cb();
        } else if (attempts > 80) {
            clearInterval(timer);
        }
    }, 100);
}

function renderAuthCaptcha(formKey, containerId, wrapId) {
    if (!authCaptchaEnabled || !authTurnstileSiteKey) return;
    var wrap = document.getElementById(wrapId);
    var el = document.getElementById(containerId);
    if (!wrap || !el) return;
    wrap.style.display = 'block';
    whenTurnstileReady(function() {
        if (turnstileWidgets[formKey]) {
            try { window.turnstile.remove(turnstileWidgets[formKey]); } catch (e) {}
            turnstileWidgets[formKey] = null;
        }
        el.innerHTML = '';
        turnstileWidgets[formKey] = window.turnstile.render('#' + containerId, {
            sitekey: authTurnstileSiteKey,
            theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
        });
    });
}

function resetAuthCaptcha(formKey) {
    if (turnstileWidgets[formKey] && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgets[formKey]); } catch (e) {}
    }
}

function getCaptchaToken(formKey) {
    if (!authCaptchaEnabled) return '';
    if (!turnstileWidgets[formKey] || !window.turnstile) return '';
    try {
        return window.turnstile.getResponse(turnstileWidgets[formKey]) || '';
    } catch (e) {
        return '';
    }
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

function loginUser(username, password, rememberMe, captchaToken) {
    if (!getApiBase()) {
        return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    }
    var payload = { username: username, password: password };
    if (captchaToken) payload.captchaToken = captchaToken;
    return fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

function registerUser(username, password, fullName, organizationName, contactEmail, mapStart, captchaToken) {
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
    if (captchaToken) body.captchaToken = captchaToken;
    return fetch(getApiBase() + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success) return { success: false, error: res.error || 'Ошибка' };
        return { success: true, pending: res.pending, organizationId: res.organizationId };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
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

function switchForm(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const message = document.getElementById('authMessage');
    const authContainer = document.querySelector('.auth-container');
    
    message.className = 'auth-message';
    message.textContent = '';
    
    var totpForm = document.getElementById('totpForm');
    if (totpForm) totpForm.classList.remove('active');
    pendingLoginId = null;

    if (formType === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        if (authContainer) authContainer.classList.remove('auth-register-active');
        destroyRegisterMapPicker();
        renderAuthCaptcha('login', 'loginCaptcha', 'loginCaptchaWrap');
    } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
        if (authContainer) authContainer.classList.add('auth-register-active');
        initRegisterMapPicker();
        renderAuthCaptcha('register', 'registerCaptcha', 'registerCaptchaWrap');
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

    // Открыть форму регистрации по ссылке с лендинга (?register=1)
    if (isAuthPage) {
        try {
            var search = window.location.search.replace(/^\?/, '').split('&').reduce(function(acc, part) {
                if (!part) return acc;
                var kv = part.split('=');
                acc[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
                return acc;
            }, {});
            if (search.register === '1' || search.register === 'true') {
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
        var registerForm = document.getElementById('registerForm');
        if (registerForm && registerForm.classList.contains('active')) {
            renderAuthCaptcha('register', 'registerCaptcha', 'registerCaptchaWrap');
        } else {
            renderAuthCaptcha('login', 'loginCaptcha', 'loginCaptchaWrap');
        }
    });

    var totpBackBtn = document.getElementById('totpBackBtn');
    if (totpBackBtn) {
        totpBackBtn.addEventListener('click', function() {
            hideTotpStep();
            resetAuthCaptcha('login');
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
            var captchaToken = getCaptchaToken('login');
            if (authCaptchaEnabled && !captchaToken) {
                showMessage('Подтвердите, что вы не робот', 'error');
                return;
            }
            Promise.resolve(loginUser(username, password, rememberMe, captchaToken)).then(function(result) {
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
                    resetAuthCaptcha('login');
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
            var captchaToken = getCaptchaToken('register');
            if (authCaptchaEnabled && !captchaToken) {
                showMessage('Подтвердите, что вы не робот', 'error');
                return;
            }
            var regChain = registerUser(username, password, fullName, organizationName, contactEmail, mapStart, captchaToken);
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
                    resetAuthCaptcha('register');
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
