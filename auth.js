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

// Инициализация системы пользователей (только для режима без API — с API админ создаётся на сервере)
function initUserSystem() {
    if (typeof API_BASE !== 'undefined' && API_BASE) return;
    const users = getUsers();
    if (users.length === 0) {
        const defaultAdmin = {
            id: generateUserId(),
            username: 'admin',
            password: hashPassword('admin123'),
            fullName: 'Администратор',
            role: 'admin',
            createdAt: new Date().toISOString()
        };
        users.push(defaultAdmin);
        saveUsers(users);
        console.log('Создан администратор по умолчанию: admin / admin123');
    }
}

// Получить список пользователей
function getUsers() {
    const usersJson = localStorage.getItem('networkMap_users');
    return usersJson ? JSON.parse(usersJson) : [];
}

// Сохранить список пользователей
function saveUsers(users) {
    localStorage.setItem('networkMap_users', JSON.stringify(users));
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

// Авторизация пользователя (при API_BASE возвращает Promise)
function loginUser(username, password) {
    if (typeof API_BASE !== 'undefined' && API_BASE) {
        return fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        }).then(function(r) { return r.json(); }).then(function(body) {
            if (body.success && body.token && body.user) {
                localStorage.setItem('networkMap_token', body.token);
                localStorage.setItem('networkMap_session', JSON.stringify(body.user));
                return { success: true, user: body.user };
            }
            return { success: false, error: body.error || 'Ошибка входа' };
        }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
    }
    const user = findUserByUsername(username);
    if (!user) return { success: false, error: 'Пользователь не найден' };
    if (user.password !== hashPassword(password)) return { success: false, error: 'Неверный пароль' };
    if (user.status === 'pending') return { success: false, error: 'Ваша заявка на регистрацию ожидает одобрения администратором' };
    if (user.status === 'rejected') return { success: false, error: 'Ваша заявка на регистрацию была отклонена' };
    var session = { userId: user.id, username: user.username, fullName: user.fullName, role: user.role, loginAt: new Date().toISOString() };
    localStorage.setItem('networkMap_session', JSON.stringify(session));
    return { success: true, user: session };
}

// Регистрация нового пользователя (создание заявки)
function registerUser(username, password, fullName) {
    if (username.length < 3) return { success: false, error: 'Имя пользователя должно быть не менее 3 символов' };
    if (password.length < 6) return { success: false, error: 'Пароль должен быть не менее 6 символов' };
    if (typeof API_BASE !== 'undefined' && API_BASE) {
        return fetch(API_BASE + '/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password, fullName: fullName || username })
        }).then(function(r) { return r.json(); }).then(function(body) {
            return body.success ? { success: true, pending: true } : { success: false, error: body.error || 'Ошибка' };
        }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
    }
    if (findUserByUsername(username)) return { success: false, error: 'Пользователь с таким именем уже существует' };
    var users = getUsers();
    var newUser = { id: generateUserId(), username: username, password: hashPassword(password), fullName: fullName || username, role: 'user', status: 'pending', createdAt: new Date().toISOString() };
    users.push(newUser);
    saveUsers(users);
    return { success: true, user: newUser, pending: true };
}

// Одобрить заявку пользователя
function approveUser(userId) {
    if (typeof API_BASE !== 'undefined' && API_BASE) {
        var token = localStorage.getItem('networkMap_token') || '';
        return fetch(API_BASE + '/api/users/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ userId: userId })
        }).then(function(r) { return r.json(); }).then(function(body) {
            if (body.error) return { success: false, error: body.error };
            return refreshUsersFromApi().then(function() { return { success: true }; });
        }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
    }
    var users = getUsers();
    var i = users.findIndex(function(u) { return u.id === userId; });
    if (i === -1) return { success: false, error: 'Пользователь не найден' };
    users[i].status = 'approved';
    saveUsers(users);
    return { success: true };
}

// Отклонить заявку пользователя
function rejectUser(userId) {
    if (typeof API_BASE !== 'undefined' && API_BASE) {
        var token = localStorage.getItem('networkMap_token') || '';
        return fetch(API_BASE + '/api/users/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ userId: userId })
        }).then(function(r) { return r.json(); }).then(function(body) {
            if (body.error) return { success: false, error: body.error };
            return refreshUsersFromApi().then(function() { return { success: true }; });
        }).catch(function() { return { success: false, error: 'Сервер недоступен' }; });
    }
    var users = getUsers();
    var i = users.findIndex(function(u) { return u.id === userId; });
    if (i === -1) return { success: false, error: 'Пользователь не найден' };
    if (users[i].username === 'admin') return { success: false, error: 'Нельзя отклонить главного администратора' };
    users[i].status = 'rejected';
    saveUsers(users);
    return { success: true };
}

// Обновить кэш пользователей с сервера (при работе с API)
function refreshUsersFromApi() {
    if (typeof API_BASE === 'undefined' || !API_BASE) return Promise.resolve();
    var token = localStorage.getItem('networkMap_token') || '';
    return fetch(API_BASE + '/api/users', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { return r.json(); })
        .then(function(body) {
            if (body.users) localStorage.setItem('networkMap_users', JSON.stringify(body.users));
        })
        .catch(function() {});
}

// Получить заявки на рассмотрении
function getPendingUsers() {
    const users = getUsers();
    return users.filter(u => u.status === 'pending');
}

// Получить текущую сессию (при API токен хранится отдельно в networkMap_token)
function getCurrentSession() {
    var sessionJson = localStorage.getItem('networkMap_session');
    return sessionJson ? JSON.parse(sessionJson) : null;
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
    if (typeof API_BASE !== 'undefined' && API_BASE) {
        var token = localStorage.getItem('networkMap_token');
        if (token) fetch(API_BASE + '/api/auth/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(function() {});
    }
    localStorage.removeItem('networkMap_session');
    localStorage.removeItem('networkMap_token');
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
    // Инициализируем систему пользователей
    initUserSystem();
    
    // Проверяем, находимся ли мы на странице авторизации
    const isAuthPage = document.getElementById('loginForm') !== null;
    
    // Перенаправление только со страницы авторизации
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
            Promise.resolve(loginUser(username, password)).then(function(result) {
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
