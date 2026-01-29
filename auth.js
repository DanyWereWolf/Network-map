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

// Инициализация системы пользователей
function initUserSystem() {
    const users = getUsers();
    
    // Если нет пользователей, создаём администратора по умолчанию
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

// Авторизация пользователя
function loginUser(username, password) {
    const user = findUserByUsername(username);
    
    if (!user) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    if (user.password !== hashPassword(password)) {
        return { success: false, error: 'Неверный пароль' };
    }
    
    // Проверяем статус заявки
    if (user.status === 'pending') {
        return { success: false, error: 'Ваша заявка на регистрацию ожидает одобрения администратором' };
    }
    
    if (user.status === 'rejected') {
        return { success: false, error: 'Ваша заявка на регистрацию была отклонена' };
    }
    
    // Сохраняем сессию
    const session = {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        loginAt: new Date().toISOString()
    };
    localStorage.setItem('networkMap_session', JSON.stringify(session));
    
    return { success: true, user: session };
}

// Регистрация нового пользователя (создание заявки)
function registerUser(username, password, fullName) {
    // Проверки
    if (username.length < 3) {
        return { success: false, error: 'Имя пользователя должно быть не менее 3 символов' };
    }
    
    if (password.length < 6) {
        return { success: false, error: 'Пароль должен быть не менее 6 символов' };
    }
    
    if (findUserByUsername(username)) {
        return { success: false, error: 'Пользователь с таким именем уже существует' };
    }
    
    const users = getUsers();
    
    const newUser = {
        id: generateUserId(),
        username: username,
        password: hashPassword(password),
        fullName: fullName || username,
        role: 'user',
        status: 'pending', // Новые пользователи ожидают одобрения
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    saveUsers(users);
    
    return { success: true, user: newUser, pending: true };
}

// Одобрить заявку пользователя
function approveUser(userId) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    users[userIndex].status = 'approved';
    saveUsers(users);
    
    return { success: true };
}

// Отклонить заявку пользователя
function rejectUser(userId) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
        return { success: false, error: 'Пользователь не найден' };
    }
    
    users[userIndex].status = 'rejected';
    saveUsers(users);
    
    return { success: true };
}

// Получить заявки на рассмотрении
function getPendingUsers() {
    const users = getUsers();
    return users.filter(u => u.status === 'pending');
}

// Получить текущую сессию
function getCurrentSession() {
    const sessionJson = localStorage.getItem('networkMap_session');
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
    localStorage.removeItem('networkMap_session');
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
    
    // Обработчик формы входа (только на странице auth.html)
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            
            const result = loginUser(username, password);
            
            if (result.success) {
                showMessage('Вход выполнен успешно! Перенаправление...', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1000);
            } else {
                showMessage(result.error, 'error');
            }
        });
    }
    
    // Обработчик формы регистрации
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('regUsername').value.trim();
            const fullName = document.getElementById('regFullName').value.trim();
            const password = document.getElementById('regPassword').value;
            const passwordConfirm = document.getElementById('regPasswordConfirm').value;
            
            if (password !== passwordConfirm) {
                showMessage('Пароли не совпадают', 'error');
                return;
            }
            
            const result = registerUser(username, password, fullName);
            
            if (result.success) {
                showMessage('Заявка на регистрацию отправлена! Ожидайте одобрения администратором.', 'success');
                setTimeout(() => {
                    switchForm('login');
                }, 2500);
            } else {
                showMessage(result.error, 'error');
            }
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
    findUserByUsername
};
