// ==================== Система авторизации ====================

// Простая хэш-функция для паролей (для демо, не для продакшена!)
function hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    // Добавляем соль и конвертируем в строку
    return 'hash_' + Math.abs(hash).toString(16) + '_' + password.length;
}

// Инициализация системы пользователей (только при работе с API — пользователи с сервера)
function initUserSystem() {
    if (!getApiBase()) return;
    refreshUsersFromApi();
}

// Получить список пользователей (кэш из sessionStorage при работе с API)
function getUsers() {
    try {
        const usersJson = sessionStorage.getItem('networkMap_users');
        return usersJson ? JSON.parse(usersJson) : [];
    } catch (e) { return []; }
}

// Сохранить список пользователей в кэш (только при API)
function saveUsers(users) {
    try { sessionStorage.setItem('networkMap_users', JSON.stringify(users)); } catch (e) {}
}

// Генерация уникального ID
function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Найти пользователя по имени
function findUserByUsername(username) {
    const users = getUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

var REMEMBER_EXPIRY_DAYS = 30;

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

// Авторизация пользователя (только через API). rememberMe — сохранить в localStorage на 30 дней
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

// Регистрация нового пользователя (создание заявки, только через API)
function registerUser(username, password, fullName) {
    if (username.length < 3) return Promise.resolve({ success: false, error: 'Имя пользователя должно быть не менее 3 символов' });
    if (password.length < 6) return Promise.resolve({ success: false, error: 'Пароль должен быть не менее 6 символов' });
    if (!getApiBase()) return Promise.resolve({ success: false, error: 'Запустите сервер: npm run api, затем откройте http://localhost:3000' });
    return fetch(getApiBase() + '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, fullName: fullName || username })
    }).then(function(r) { return r.json(); }).then(function(body) {
        return body.success ? { success: true, pending: true } : { success: false, error: body.error || 'Ошибка' };
    }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
}

// Одобрить заявку пользователя (только через API)
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

// Отклонить заявку пользователя (только через API)
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

// Обновить кэш пользователей с сервера
function refreshUsersFromApi() {
    if (!getApiBase()) return Promise.resolve();
    var token = getAuthToken();
    return fetch(getApiBase() + '/api/users', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            if (body.users) sessionStorage.setItem('networkMap_users', JSON.stringify(body.users));
        })
        .catch(function() {});
}

// Получить заявки на рассмотрении
function getPendingUsers() {
    const users = getUsers();
    return users.filter(u => u.status === 'pending');
}

// Получить текущую сессию (из sessionStorage или localStorage при «запомнить меня»)
function getCurrentSession() {
    return getStoredSession();
}

// Проверка, авторизован ли пользователь
function isAuthenticated() {
    return getCurrentSession() !== null;
}

// Проверка, является ли пользователь администратором
function isAdmin() {
    const session = getCurrentSession();
    return session && session.role === 'admin';
}

// Выход из системы
function logout() {
    if (getApiBase()) {
        var token = getAuthToken();
        if (token) fetch(getApiBase() + '/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(function() {});
    }
    sessionStorage.removeItem('networkMap_session');
    sessionStorage.removeItem('networkMap_token');
    sessionStorage.removeItem('networkMap_users');
    localStorage.removeItem('networkMap_token');
    localStorage.removeItem('networkMap_session');
    localStorage.removeItem('networkMap_tokenExpiry');
    window.location.href = 'auth.html';
}

// ==================== UI функции ====================

// Переключение между формами входа и регистрации
function switchForm(formType) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const message = document.getElementById('authMessage');
    
    message.className = 'auth-message';
    message.textContent = '';
    
    if (formType === 'login') {
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        loginForm.classList.remove('active');
        registerForm.classList.add('active');
    }
}

// Показать сообщение
function showMessage(text, type) {
    const message = document.getElementById('authMessage');
    message.textContent = text;
    message.className = 'auth-message ' + type;
}

// Переключение видимости пароля
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ==================== Инициализация ====================

document.addEventListener('DOMContentLoaded', function() {
    initUserSystem();
    const isAuthPage = document.getElementById('loginForm') !== null;

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
                    setTimeout(function() { window.location.href = 'index.html'; }, 1000);
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
            var password = document.getElementById('regPassword').value;
            var passwordConfirm = document.getElementById('regPasswordConfirm').value;
            if (password !== passwordConfirm) { showMessage('Пароли не совпадают', 'error'); return; }
            Promise.resolve(registerUser(username, password, fullName)).then(function(result) {
                if (result.success) {
                    showMessage('Заявка на регистрацию отправлена! Ожидайте одобрения администратором.', 'success');
                    setTimeout(function() { switchForm('login'); }, 2500);
                } else {
                    showMessage(result.error, 'error');
                }
            });
        });
    }
});

// Экспортируем функции для использования в других файлах
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
    hashPassword,
    findUserByUsername,
    refreshUsersFromApi
};
