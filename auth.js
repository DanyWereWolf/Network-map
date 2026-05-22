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
    // Панель главного администратора (`site-admin.html`) управляет организациями/тарифами,
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

function loginUser(username, password, rememberMe) {
    if (!getApiBase()) {
        return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    }
    return fetch(getApiBase() + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    }).then(function(r) { return r.json(); }).then(function(body) {
        if (body.success && body.token && body.user) {
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
            return { success: true, user: body.user };
        }
        return { success: false, error: body.error || 'Ошибка входа' };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
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

/** Устаревшие параметры URL регистрации с лендинга (?trial=1, ?plan=…) — игнорируются. */
var registerPlanFromLanding = {
    wantsTrialLink: false,
    planQuery: '',
    resolvedCatalogPlanId: null,
    prefetchPromise: null
};

function ensureRegisterPlanPrefetchFromLanding() {
    if (registerPlanFromLanding.prefetchPromise) return registerPlanFromLanding.prefetchPromise;
    if (!getApiBase()) {
        registerPlanFromLanding.prefetchPromise = Promise.resolve();
        return registerPlanFromLanding.prefetchPromise;
    }
    registerPlanFromLanding.prefetchPromise = fetch(getApiBase() + '/api/pricing')
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            var plans = (data && data.plans) || [];
            var trialPlans = plans.filter(function(p) {
                return String(p.kind || '').toLowerCase() === 'trial';
            });
            var pick = null;
            if (registerPlanFromLanding.planQuery) {
                var low = registerPlanFromLanding.planQuery.toLowerCase();
                pick = plans.find(function(p) { return String(p.id).toLowerCase() === low; }) || null;
            } else if (registerPlanFromLanding.wantsTrialLink && trialPlans.length) {
                pick = trialPlans[0];
            }
            registerPlanFromLanding.resolvedCatalogPlanId = pick ? String(pick.id) : null;
            var msgEl = document.getElementById('authMessage');
            if (msgEl && (registerPlanFromLanding.wantsTrialLink || registerPlanFromLanding.planQuery)) {
                if (pick) {
                    var title = (pick.title && String(pick.title).trim()) ? pick.title : pick.id;
                    var isTrial = String(pick.kind || '').toLowerCase() === 'trial';
                    msgEl.className = 'auth-message info';
                    if (isTrial) {
                        var d = 14;
                        if (pick.subscriptionDays != null && pick.subscriptionDays !== '') {
                            var pn = parseInt(pick.subscriptionDays, 10);
                            if (!isNaN(pn) && pn >= 1) d = pn;
                        }
                        var dw = (d % 10 === 1 && d % 100 !== 11) ? 'день' : ((d % 10 >= 2 && d % 10 <= 4 && (d % 100 < 10 || d % 100 >= 20)) ? 'дня' : 'дней');
                        msgEl.textContent = 'Пробный период ' + d + ' ' + dw + '. Тариф «' + title + '» будет назначен организации. После окончания выберите платный план.';
                    } else {
                        msgEl.textContent = 'Выбран тариф «' + title + '». После регистрации он будет указан для организации.';
                    }
                } else if (registerPlanFromLanding.planQuery) {
                    msgEl.className = 'auth-message error';
                    msgEl.textContent = 'Тариф с таким кодом на сайте не найден. Регистрация без выбора — будет назначен стандартный план.';
                } else if (registerPlanFromLanding.wantsTrialLink) {
                    msgEl.className = 'auth-message info';
                    msgEl.textContent = 'Пробный доступ: 14 дней. В каталоге нет пробного тарифа — при регистрации может быть назначен стандартный план; уточните у администратора.';
                }
            }
        })
        .catch(function() {});
    return registerPlanFromLanding.prefetchPromise;
}

function resolvePlanIdToSendForRegister() {
    if (!registerPlanFromLanding.wantsTrialLink && !registerPlanFromLanding.planQuery) return null;
    if (registerPlanFromLanding.resolvedCatalogPlanId) return registerPlanFromLanding.resolvedCatalogPlanId;
    if (registerPlanFromLanding.planQuery) return registerPlanFromLanding.planQuery;
    if (registerPlanFromLanding.wantsTrialLink) return 'trial';
    return null;
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
    
    if (formType === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
        if (authContainer) authContainer.classList.remove('auth-register-active');
        destroyRegisterMapPicker();
    } else {
        loginForm.classList.remove('active');
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
    
    // Обработка параметров URL (например, trial=1)
    if (isAuthPage) {
        try {
            var search = window.location.search.replace(/^\?/, '').split('&').reduce(function(acc, part) {
                if (!part) return acc;
                var kv = part.split('=');
                acc[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
                return acc;
            }, {});
            registerPlanFromLanding.wantsTrialLink = search.trial === '1';
            registerPlanFromLanding.planQuery = search.plan ? String(search.plan).trim() : '';
            var openRegister = search.register === '1' || search.register === 'true' ||
                registerPlanFromLanding.wantsTrialLink || !!registerPlanFromLanding.planQuery;
            if (openRegister) {
                switchForm('register');
                if (registerPlanFromLanding.planQuery || registerPlanFromLanding.wantsTrialLink) {
                    ensureRegisterPlanPrefetchFromLanding();
                }
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
