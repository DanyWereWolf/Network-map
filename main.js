let myMap;
let objects = [];
let selectedObjects = [];
let isEditMode = false;
let currentModalObject = null; 
let hoveredObject = null; 
let hoveredObjectOriginalIcon = null; 
let hoverCircle = null; 
let cursorIndicator = null; 
let phantomPlacemark = null; 
let currentCableTool = false; 
let cableSource = null; 
let cableWaypoints = []; 
let cablePreviewLine = null; 
let selectedFiberForConnection = null; 
let splitterFiberRoutingMode = false;
let splitterFiberRoutingData = null;
let splitterFiberWaypoints = [];
let splitterFiberPreviewLine = null;
let fiberRoutingMode = false;
let fiberRoutingData = null;
let fiberRoutingWaypoints = [];
let fiberRoutingPreviewLine = null;
let netboxConfig = {
    url: '',
    token: '',
    ignoreSSL: false
};
let netboxDevices = []; 
let currentUser = null; 
let crossGroupPlacemarks = []; 
let nodeGroupPlacemarks = []; 
let crossGroupNames = new Map(); 
let nodeGroupNames = new Map(); 
let collaboratorCursorsPlacemarks = []; 
let mapFilter = { node: true, nodeAggregationOnly: false, cross: true, sleeve: true, support: true, attachment: true, olt: true, splitter: true, onu: true }; 
let lastDraggedPlacemark = null; 
var UNDO_MAX = 20;
var undoStack = [];
var redoStack = [];
var lastSavedState = null;
var inUndoRedo = false;
var showOnMapHighlightState = null;

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

function groupKey(coords) {
    return coords[0].toFixed(5) + ',' + coords[1].toFixed(5);
}
function getCrossGroupName(coords) {
    return crossGroupNames.get(groupKey(coords)) || '';
}
function setCrossGroupName(coords, name) {
    const key = groupKey(coords);
    if (name && name.trim()) crossGroupNames.set(key, name.trim());
    else crossGroupNames.delete(key);
    saveGroupNames();
    updateCrossDisplay();
}
function getNodeGroupName(coords) {
    return nodeGroupNames.get(groupKey(coords)) || '';
}
function setNodeGroupName(coords, name) {
    const key = groupKey(coords);
    if (name && name.trim()) nodeGroupNames.set(key, name.trim());
    else nodeGroupNames.delete(key);
    saveGroupNames();
    updateNodeDisplay();
}
var GROUP_NAMES_STORAGE_KEY = 'networkmap_groupNames';
function saveGroupNames() {
    var payload = { cross: Object.fromEntries(crossGroupNames), node: Object.fromEntries(nodeGroupNames) };
    try {
        localStorage.setItem(GROUP_NAMES_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
    if (getApiBase()) {
        try {
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ groupNames: payload })
            }).catch(function() {});
        } catch (e) {}
    }
    if (typeof window.syncSendGroupNames === 'function' && window.syncIsConnected) {
        try { window.syncSendGroupNames(payload); } catch (e) {}
    }
}
function loadGroupNamesFromStorage() {
    try {
        var raw = localStorage.getItem(GROUP_NAMES_STORAGE_KEY);
        if (!raw) return;
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if (parsed.cross && typeof parsed.cross === 'object') Object.keys(parsed.cross).forEach(function(k) { crossGroupNames.set(k, parsed.cross[k]); });
            if (parsed.node && typeof parsed.node === 'object') Object.keys(parsed.node).forEach(function(k) { nodeGroupNames.set(k, parsed.node[k]); });
        }
    } catch (e) {}
}
window.getGroupNamesForSync = function() {
    if (typeof crossGroupNames === 'undefined' || typeof nodeGroupNames === 'undefined') return null;
    var cross = Object.fromEntries(crossGroupNames);
    var node = Object.fromEntries(nodeGroupNames);
    if (!Object.keys(cross).length && !Object.keys(node).length) return null;
    return { cross: cross, node: node };
};
window.applyGroupNames = function(gn) {
    if (!gn || typeof crossGroupNames === 'undefined' || typeof nodeGroupNames === 'undefined') return;
    try {
        if (gn.cross && typeof gn.cross === 'object') Object.keys(gn.cross).forEach(function(k) { crossGroupNames.set(k, gn.cross[k]); });
        if (gn.node && typeof gn.node === 'object') Object.keys(gn.node).forEach(function(k) { nodeGroupNames.set(k, gn.node[k]); });
        if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
        if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    } catch (e) {}
};

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

document.addEventListener('DOMContentLoaded', function() {
    
    if (!checkAuth()) return;

    initUserUI();
    
    ymaps.ready(init);
    
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

function initUserUI() {
    if (!currentUser) return;

    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    
    if (userAvatar) {
        userAvatar.textContent = (currentUser.fullName || currentUser.username).charAt(0).toUpperCase();
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

    const editModeBtn = document.getElementById('editMode');
    if (editModeBtn && currentUser.role !== 'admin') {
        editModeBtn.style.display = 'none';
    }
    
    if (currentUser.role !== 'admin') {
        hideAdminOnlyElements();
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
    if (historyBtn) {
        historyBtn.addEventListener('click', openHistoryModal);
    }

    const infoHelpBtn = document.getElementById('infoHelpBtn');
    if (infoHelpBtn) infoHelpBtn.addEventListener('click', openHelpModal);
    const updatesBtn = document.getElementById('updatesBtn');
    if (updatesBtn) updatesBtn.addEventListener('click', openUpdatesModal);

    setupUsersModalHandlers();

    setupHistoryModalHandlers();

    setupHelpModalHandlers();
    setupUpdatesModalHandlers();
    setupBackupsSection();

    setupSidebarToggle();

    updateHistoryBadge();
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
}

function closeUsersModal() {
    const modal = document.getElementById('usersModal');
    modal.style.display = 'none';
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
                const initial = (user.fullName || user.username).charAt(0).toUpperCase();
                const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
                
                pendingHtml += `
                    <div class="pending-user-item">
                        <div class="user-item-avatar">${initial}</div>
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
        const initial = (user.fullName || user.username).charAt(0).toUpperCase();
        const roleClass = user.role === 'admin' ? 'admin' : 'user';
        const roleText = user.role === 'admin' ? 'Администратор' : 'Пользователь';
        const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
        const isCurrentUser = user.id === currentUser.userId;
        const isOnline = onlineIds.some(id => id == user.id);
        
        html += `
            <div class="user-item">
                <div class="user-item-avatar ${roleClass}">${initial}</div>
                <div class="user-item-info">
                    <div class="user-item-name">${escapeHtml(user.fullName || user.username)}${isCurrentUser ? ' (вы)' : ''}${isOnline ? ' <span class="user-item-online">В сети</span>' : ''}</div>
                    <div class="user-item-username">@${escapeHtml(user.username)}</div>
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
        const initial = (user.fullName || user.username).charAt(0).toUpperCase();
        const createdDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '';
        
        html += `
            <div class="user-item" style="opacity: 0.6;">
                <div class="user-item-avatar" style="background: #9ca3af;">${initial}</div>
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
    if (!confirm('Вы уверены, что хотите отклонить эту заявку?')) return;
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
}

function openUserEditModal(userId = null) {
    const modal = document.getElementById('userEditModal');
    const title = document.getElementById('userEditTitle');
    const userIdInput = document.getElementById('editUserId');
    const usernameInput = document.getElementById('editUsername');
    const fullNameInput = document.getElementById('editFullName');
    const passwordInput = document.getElementById('editPassword');
    const roleSelect = document.getElementById('editRole');
    
    if (userId) {
        
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
    } else {
        
        title.textContent = 'Добавить пользователя';
        userIdInput.value = '';
        usernameInput.value = '';
        usernameInput.disabled = false;
        fullNameInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'user';
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
        var payload = { fullName: fullName || users[userIndex].username, role: role };
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
        if (getApiBase()) {
            fetch(getApiBase() + '/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ username: username, password: password, fullName: fullName || username, role: role || 'user' })
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
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    
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
}

function init() {
    myMap = new ymaps.Map('map', {
        center: [54.663609, 86.162243],
        zoom: 15
    });
    
    try { myMap.controls.remove('searchControl'); } catch (e) {}
    try { myMap.controls.remove('trafficControl'); } catch (e) {}
    try { myMap.controls.remove('geolocationControl'); } catch (e) {}
    try { myMap.behaviors.disable('rightMouseButtonMagnifier'); } catch (e) {}

    createCursorIndicator();

    window.lastMouseX = 0;
    window.lastMouseY = 0;

    myMap.options.set('suppressMapOpenBlock', true);
    
    loadData();
    setupEventListeners();
    setupRectSelection();
    if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    
    setTimeout(function() {
        if (lastSavedState === null && typeof getSerializedData === 'function') lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        if (typeof updateUndoRedoButtons === 'function') updateUndoRedoButtons();
    }, 0);
    switchToViewMode();
    if (getApiBase() && typeof AuthSystem !== 'undefined' && AuthSystem.refreshSessionFromApi) {
        setInterval(AuthSystem.refreshSessionFromApi, 60000);
    }
}

function setupEventListeners() {
    
    document.getElementById('viewMode').addEventListener('click', switchToViewMode);
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
        
        currentCableTool = !currentCableTool;
        const cableBtn = this;
        
        if (currentCableTool) {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Завершить прокладку</span>';
            cableBtn.style.background = '#e74c3c';
            clearShowOnMapHighlight();
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableWaypoints = [];
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = 'crosshair';
            mapEl.classList.add('map-crosshair-active');
        } else {
            cableBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><line x1="12" y1="2" x2="12" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg><span>Проложить кабель</span>';
            cableBtn.style.background = '#3498db';
            clearSelection();
            removeCablePreview();
            cableSource = null;
            cableWaypoints = [];
            const mapEl = myMap.container.getElement();
            mapEl.style.cursor = '';
            mapEl.classList.remove('map-crosshair-active');
        }
    });

    document.getElementById('importBtn').addEventListener('click', function() {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', handleFileImport);
    document.getElementById('exportData').addEventListener('click', exportData);

    const syncConnectBtn = document.getElementById('syncConnectBtn');
    if (syncConnectBtn && typeof syncConnect === 'function') {
        syncConnectBtn.addEventListener('click', function() { syncConnect(); });
    }

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

    ['mapFilterNode', 'mapFilterNodeAggregationOnly', 'mapFilterCross', 'mapFilterSleeve', 'mapFilterSupport', 'mapFilterAttachment', 'mapFilterOlt', 'mapFilterSplitter', 'mapFilterOnu'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', function() {
            if (typeof applyMapFilter === 'function') applyMapFilter();
            if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
        });
    });

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
            
            var modalIds = ['infoModal', 'nodeSelectionModal', 'onuSelectionModal', 'splitterSelectionModal', 'splitterOutputOnuModal', 'splitterOutputSplitterModal', 'oltSelectionModal', 'usersModal', 'userEditModal', 'updatesModal'];
            for (var i = 0; i < modalIds.length; i++) {
                var m = document.getElementById(modalIds[i]);
                if (m && m.style && m.style.display === 'block') {
                    m.style.display = 'none';
                    e.preventDefault();
                    return;
                }
            }
            if (splitterFiberRoutingMode) { cancelSplitterFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
            if (fiberRoutingMode) { cancelFiberRouting(); showInfo('Прокладка жилы отменена.', 'Отмена'); e.preventDefault(); return; }
            if (objectPlacementMode) { cancelObjectPlacement(); e.preventDefault(); return; }
            if (currentCableTool) {
                var cableBtn = document.getElementById('addCable');
                if (cableBtn) cableBtn.click();
                e.preventDefault();
            }
            return;
        }
    });

    const objectTypeSelect = document.getElementById('objectType');
    if (objectTypeSelect) {
        objectTypeSelect.addEventListener('change', function() {
            const nameInputGroup = document.getElementById('objectNameGroup');
            const sleeveSettingsGroup = document.getElementById('sleeveSettingsGroup');
            const crossSettingsGroup = document.getElementById('crossSettingsGroup');
            const nodeSettingsGroup = document.getElementById('nodeSettingsGroup');
            const oltSettingsGroup = document.getElementById('oltSettingsGroup');
            const splitterSettingsGroup = document.getElementById('splitterSettingsGroup');
            const type = this.value;

            const showName = ['node', 'cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu'].indexOf(type) !== -1;
            if (nameInputGroup) nameInputGroup.style.display = showName ? 'block' : 'none';
            if (sleeveSettingsGroup) sleeveSettingsGroup.style.display = type === 'sleeve' ? 'block' : 'none';
            if (crossSettingsGroup) crossSettingsGroup.style.display = type === 'cross' ? 'block' : 'none';
            if (nodeSettingsGroup) nodeSettingsGroup.style.display = type === 'node' ? 'block' : 'none';
            if (oltSettingsGroup) oltSettingsGroup.style.display = type === 'olt' ? 'block' : 'none';
            if (splitterSettingsGroup) splitterSettingsGroup.style.display = type === 'splitter' ? 'block' : 'none';

            if (nameInputGroup) {
                const nameLabel = nameInputGroup.querySelector('label');
                if (nameLabel) {
                    const labels = { cross: 'Имя кросса', sleeve: 'Название муфты', support: 'Подпись опоры', attachment: 'Название', node: 'Имя узла', olt: 'Имя OLT', splitter: 'Имя сплиттера', onu: 'Имя ONU' };
                    nameLabel.textContent = labels[type] || 'Имя';
                }
            }

        if (type === 'sleeve') {
            updateSleeveMaxFibers();
        }

        if (objectPlacementMode) {
            const newType = this.value;
            currentPlacementType = newType;
            
            if (['node', 'cross', 'sleeve', 'olt', 'splitter', 'onu'].indexOf(newType) !== -1) {
                const nameInput = document.getElementById('objectName');
                currentPlacementName = nameInput ? nameInput.value.trim() : '';
            } else {
                currentPlacementName = '';
            }
            
            if (newType === 'node') {
                const nodeKindSelect = document.getElementById('nodeKind');
                currentPlacementNodeKind = nodeKindSelect ? nodeKindSelect.value : 'network';
            }
        }
        });
        if (objectTypeSelect.value) objectTypeSelect.dispatchEvent(new Event('change'));
    }

    const objectNameInput = document.getElementById('objectName');
    if (objectNameInput) {
        objectNameInput.addEventListener('input', function() {
            if (objectPlacementMode && (currentPlacementType === 'node' || currentPlacementType === 'sleeve')) {
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

    const sleeveTypeSelect = document.getElementById('sleeveType');
    if (sleeveTypeSelect) {
        sleeveTypeSelect.addEventListener('change', function() {
            updateSleeveMaxFibers();
        });
    }

    function updateSleeveMaxFibers() {
        const sleeveType = document.getElementById('sleeveType').value;
        const maxFibersInput = document.getElementById('sleeveMaxFibers');

        const sleeveMaxFibersMap = {
            'SNR-FOSC-04': 4,
            'SNR-FOSC-X': 12,
            'SNR-FOSC-12': 12,
            'SNR-FOSC-D': 24,
            'SNR-FOSC-M': 48,
            'SNR-FOSC-G': 72,
            'SNR-FOSC-L': 96,
            'SNR-FOSC-B': 144,
            'SNR-FOSC-UF2': 144,
            'SNR-FOSC-CV018': 36,
            'SNR-FOSC-CV019': 36,
            'SNR-FOSC-CV021': 96,
            'SNR-FOSC-CV028A': 36,
            'SNR-FOSC-CV037': 36,
            'SNR-FOSC-Q-T': 36,
            'SNR-FOSC-D-T': 24,
            'SNR-FOSC-CH009': 24,
            'SNR-FOSC-CH018': 36,
            'SNR-FOSC-CH019': 36,
            'SNR-FOSC-CH025': 24,
            'SNR-FT-E': 12,
            'МВОТ-108-3-Т-1-36': 108,
            'МВОТ-216-4-Т-1-36': 216,
            'МВОТ-3611-22-32-2К16': 32,
            'МОГ-У-33-1К4845': 33,
            'МКО-Ц8/С09-5SC': 18,
            'МТОК-Ф3/216-1КТ3645-К': 216,
            'KSC-MURR': 12,
            '101-01-18': 18,
            'custom': 0
        };
        
        const maxFibers = sleeveMaxFibersMap[sleeveType] || 0;
        if (maxFibersInput) {
            maxFibersInput.value = maxFibers;
        }
    }

    setupAccordions();

    initNodeSelectionModal();
    initOnuSelectionModal();
    initSplitterSelectionModal();
    initSplitterOutputOnuModal();
    initSplitterOutputSplitterModal();
    initOltSelectionModal();

    myMap.events.add('click', handleMapClick);

    myMap.events.add('mousemove', handleMapMouseMove);

    document.addEventListener('mousemove', function(e) {
        window.lastMouseX = e.clientX;
        window.lastMouseY = e.clientY;
    });

    const modal = document.getElementById('infoModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        };
    }
    
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };

    setupMapSearch();

    initTheme();
}

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!getApiBase()) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });
    window.addEventListener('blur', function() {
        window.syncDragInProgress = false;
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (getApiBase()) {
        fetch(getApiBase() + '/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
            body: JSON.stringify({ theme: theme })
        }).catch(function() {});
    }
    var lightIcon = document.querySelector('.theme-icon-light');
    var darkIcon = document.querySelector('.theme-icon-dark');
    if (theme === 'dark') {
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'block';
    } else {
        if (lightIcon) lightIcon.style.display = 'block';
        if (darkIcon) darkIcon.style.display = 'none';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

function setupMapSearch() {
    const searchInput = document.getElementById('mapSearch');
    const searchResults = document.getElementById('searchResults');
    const clearBtn = document.getElementById('clearSearch');
    
    if (!searchInput || !searchResults) return;
    
    let searchTimeout = null;

    searchInput.addEventListener('input', function() {
        const query = this.value.trim();

        clearBtn.style.display = query ? 'flex' : 'none';

        if (searchTimeout) clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            searchResults.style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(() => {
            const results = searchObjects(query);
            renderSearchResults(results, query);
        }, 200);
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        searchResults.style.display = 'none';
        clearBtn.style.display = 'none';
        searchInput.focus();
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.header-search')) {
            searchResults.style.display = 'none';
        }
    });

    searchInput.addEventListener('focus', function() {
        if (this.value.trim().length >= 2) {
            const results = searchObjects(this.value.trim());
            renderSearchResults(results, this.value.trim());
        }
    });

    searchInput.addEventListener('keydown', function(e) {
        const items = searchResults.querySelectorAll('.search-result-item');
        const activeItem = searchResults.querySelector('.search-result-item.active');
        let activeIndex = Array.from(items).indexOf(activeItem);
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeIndex < items.length - 1) {
                items[activeIndex]?.classList.remove('active');
                items[activeIndex + 1]?.classList.add('active');
                items[activeIndex + 1]?.scrollIntoView({ block: 'nearest' });
            } else if (activeIndex === -1 && items.length > 0) {
                items[0].classList.add('active');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeIndex > 0) {
                items[activeIndex]?.classList.remove('active');
                items[activeIndex - 1]?.classList.add('active');
                items[activeIndex - 1]?.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeItem) {
                activeItem.click();
            } else if (items.length > 0) {
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            searchResults.style.display = 'none';
            searchInput.blur();
        }
    });
}

function searchObjects(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    
    objects.forEach(obj => {
        if (!obj.properties) return;
        
        const type = obj.properties.get('type');
        const name = obj.properties.get('name') || '';
        const cableName = obj.properties.get('cableName') || '';

        const searchName = type === 'cable' ? cableName : name;
        if (searchName && searchName.toLowerCase().includes(lowerQuery)) {
            results.push({
                object: obj,
                type: type,
                name: searchName,
                matchType: 'name'
            });
            return;
        }

        const typeName = getObjectTypeName(type);
        if (typeName.toLowerCase().includes(lowerQuery)) {
            results.push({
                object: obj,
                type: type,
                name: searchName || typeName,
                matchType: 'type'
            });
        }
    });

    results.sort((a, b) => {
        if (a.matchType === 'name' && b.matchType !== 'name') return -1;
        if (a.matchType !== 'name' && b.matchType === 'name') return 1;
        return a.name.localeCompare(b.name);
    });
    
    return results.slice(0, 20); 
}

function renderSearchResults(results, query) {
    const searchResults = document.getElementById('searchResults');
    
    if (results.length === 0) {
        searchResults.innerHTML = `
            <div class="search-no-results">
                <div style="font-size: 24px; margin-bottom: 8px;">🔍</div>
                Ничего не найдено по запросу "${escapeHtml(query)}"
            </div>
        `;
        searchResults.style.display = 'block';
        return;
    }
    
    const getIcon = (type) => {
        switch(type) {
            case 'node': return '🖥️';
            case 'cross': return '📦';
            case 'sleeve': return '🔴';
            case 'support': return '📍';
            case 'attachment': return '🔗';
            case 'cable': return '🔌';
            default: return '📍';
        }
    };
    
    let html = `<div class="search-results-header">Найдено: ${results.length}</div>`;
    
    results.forEach((result, index) => {
        const typeName = getObjectTypeName(result.type);
        const icon = getIcon(result.type);
        const uniqueId = result.object.properties.get('uniqueId') || index;
        
        html += `
            <div class="search-result-item" data-index="${index}" data-id="${escapeHtml(String(uniqueId))}">
                <div class="search-result-icon ${result.type}">${icon}</div>
                <div class="search-result-info">
                    <div class="search-result-name">${escapeHtml(result.name)}</div>
                    <div class="search-result-type">${typeName}</div>
                </div>
            </div>
        `;
    });
    
    searchResults.innerHTML = html;
    searchResults.style.display = 'block';

    searchResults.querySelectorAll('.search-result-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            goToSearchResult(results[index]);
        });
        
        item.addEventListener('mouseenter', () => {
            searchResults.querySelector('.search-result-item.active')?.classList.remove('active');
            item.classList.add('active');
        });
    });
}

function goToSearchResult(result) {
    const obj = result.object;
    const searchResults = document.getElementById('searchResults');
    const searchInput = document.getElementById('mapSearch');

    searchResults.style.display = 'none';

    let coords;
    if (result.type === 'cable') {
        
        const geometry = obj.geometry.getCoordinates();
        if (geometry && geometry.length >= 2) {
            const midIndex = Math.floor(geometry.length / 2);
            coords = geometry[midIndex];
        }
    } else {
        coords = obj.geometry.getCoordinates();
    }
    
    if (!coords) return;

    myMap.setCenter(coords, 21, { duration: 500 });

    setTimeout(() => {
        if (result.type === 'cable') {
            showCableInfo(obj);
        } else if (result.type === 'support') {
            showSupportInfo(obj);
        } else if (result.type === 'node' || result.type === 'cross' || result.type === 'sleeve') {
            showObjectInfo(obj);
        }
    }, 600);

    searchInput.value = '';
    document.getElementById('clearSearch').style.display = 'none';
}

let objectPlacementMode = false;
let currentPlacementType = null;
let currentPlacementName = null;
let currentPlacementNodeKind = 'network';

function handleAddObject() {
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
        cableWaypoints = [];
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
        const addBtn = document.getElementById('addObject');
        if (addBtn) {
            addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Завершить размещение</span>';
            addBtn.style.background = '#e74c3c';
            addBtn.onclick = cancelObjectPlacement;
        }
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
        const addBtn = document.getElementById('addObject');
        if (addBtn) {
            addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg><span>Завершить размещение</span>';
            addBtn.style.background = '#e74c3c';
            addBtn.onclick = cancelObjectPlacement;
        }
    }
}

function cancelObjectPlacement() {
    objectPlacementMode = false;
    currentPlacementType = null;
    currentPlacementName = null;
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
    
    const addBtn = document.getElementById('addObject');
    if (addBtn) {
        addBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>Добавить на карту</span>';
        addBtn.style.background = '#3498db';
        addBtn.onclick = null;
    }
}

function handleMapClick(e) {
    clearShowOnMapHighlight();
    const coords = e.get('coords');

    const target = e.get('target');
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

    if (clickedCable) {
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

        const type = currentPlacementType || document.getElementById('objectType').value;
        
        if (type === 'node') {
            
            const name = currentPlacementName || document.getElementById('objectName').value.trim();
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
            const sleeveName = currentPlacementName || (document.getElementById('objectName') && document.getElementById('objectName').value.trim()) || '';
            const sleeveType = document.getElementById('sleeveType').value;
            const maxFibers = parseInt(document.getElementById('sleeveMaxFibers').value) || 0;
            createObject(type, sleeveName || '', coords, { sleeveType: sleeveType, maxFibers: maxFibers });
        } else if (type === 'cross') {
            const name = currentPlacementName || document.getElementById('objectName').value.trim();
            const crossPorts = parseInt(document.getElementById('crossPorts').value) || 24;
            createObject(type, name || '', coords, { crossPorts: crossPorts });
            currentPlacementName = name || '';
        } else if (type === 'support') {
            const name = document.getElementById('objectName').value.trim();
            createObject(type, name || '', coords);
        } else if (type === 'attachment') {
            const name = document.getElementById('objectName').value.trim();
            createObject(type, name || '', coords);
        } else if (type === 'olt') {
            const nameInput = document.getElementById('objectName');
            const name = currentPlacementName || (nameInput ? nameInput.value.trim() : '');
            const oltPortsEl = document.getElementById('oltPonPorts');
            const ponPorts = oltPortsEl ? (parseInt(oltPortsEl.value, 10) || 8) : 8;
            createObject(type, name || '', coords, { ponPorts: ponPorts });
            currentPlacementName = name || '';
        } else if (type === 'splitter') {
            const nameInput = document.getElementById('objectName');
            const name = currentPlacementName || (nameInput ? nameInput.value.trim() : '');
            const ratioEl = document.getElementById('splitterRatio');
            const splitRatio = ratioEl ? (parseInt(ratioEl.value, 10) || 8) : 8;
            createObject(type, name || '', coords, { splitRatio: splitRatio });
            currentPlacementName = name || '';
        } else if (type === 'onu') {
            const nameInput = document.getElementById('objectName');
            const name = currentPlacementName || (nameInput ? nameInput.value.trim() : '');
            createObject(type, name || '', coords);
            currentPlacementName = name || '';
        } else {
            createObject(type, '', coords);
        }
        removePhantomPlacemark();
        saveData();
        return;
    }

    if (currentCableTool && isEditMode) {
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
        
        if (clickedCable) {
            showCableInfo(clickedCable);
            return;
        }

        const clickedObject = findObjectAtCoords(coords);
        const cableType = document.getElementById('cableType') ? document.getElementById('cableType').value : 'fiber4';
        var cableEndpoints = ['cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu'];
        
        if (clickedObject && clickedObject.geometry) {
            var objType = clickedObject.properties ? clickedObject.properties.get('type') : null;
            
            if (cableEndpoints.indexOf(objType) !== -1) {
                if (!cableSource) {
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
                var startEndpoints = ['sleeve', 'cross', 'attachment', 'olt', 'splitter', 'onu'];
                if (startEndpoints.indexOf(objType) === -1) {
                    showError('Начало кабеля должно быть муфтой, кроссом, креплением, OLT, сплиттером или ONU. Выберите один из этих объектов.', 'Недопустимое действие');
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
            var finishEndpoints = ['sleeve', 'cross', 'attachment', 'olt', 'splitter', 'onu'];
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
            showError('Кабель прокладывается между муфтой, кроссом, креплением, OLT, сплиттером или ONU. Промежуточными точками могут быть опоры или крепления.', 'Недопустимое действие');
        } else {
            
            if (cableSource) {
                const currentCableType = document.getElementById('cableType') ? document.getElementById('cableType').value : 'fiber4';
                const autoSelectTolerance = zoom < 12 ? 0.0015 : (zoom < 15 ? 0.001 : 0.0005);
                let nearestObject = null;
                let minDist = Infinity;
                var validCableEndpoints = ['cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu'];
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
                        const cableTypeVal = document.getElementById('cableType').value;
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
            var snapObj = findObjectAtCoords(coords);
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

    let iconSvg, color;
    let nodeKind = 'network';
    if (type === 'node') {
        const nodeKindSelect = document.getElementById('nodeKind');
        nodeKind = currentPlacementNodeKind || (nodeKindSelect ? nodeKindSelect.value : 'network');
    }
    
    switch(type) {
        case 'support':
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.5"/>
            </svg>`;
            break;
        case 'sleeve':
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.5"/>
            </svg>`;
            break;
        case 'node':
            color = (nodeKind === 'aggregation') ? '#ef4444' : '#22c55e';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5" opacity="0.6"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.5"/>
                <circle cx="16" cy="16" r="3" fill="${color}" opacity="0.8"/>
            </svg>`;
            break;
        case 'cross':
            color = '#8b5cf6';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white" opacity="0.7"/>
                <circle cx="16" cy="12" r="2" fill="white" opacity="0.7"/>
                <circle cx="22" cy="12" r="2" fill="white" opacity="0.7"/>
            </svg>`;
            break;
        case 'attachment':
            color = '#f59e0b';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <path d="M10 14 L14 10 L18 14 L14 18 Z" fill="white" opacity="0.6"/>
            </svg>`;
            break;
        case 'olt':
            color = '#0ea5e9';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="24" height="20" rx="3" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <rect x="6" y="8" width="4" height="3" rx="1" fill="white" opacity="0.6"/>
                <rect x="12" y="8" width="4" height="3" rx="1" fill="white" opacity="0.6"/>
                <rect x="18" y="8" width="4" height="3" rx="1" fill="white" opacity="0.6"/>
                <line x1="8" y1="16" x2="20" y2="16" stroke="white" stroke-width="1.5" opacity="0.7"/>
            </svg>`;
            break;
        case 'splitter':
            color = '#a855f7';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="8" r="5" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <path d="M14 13 L14 20 M8 20 L20 20 M14 20 L10 24 M14 20 L18 24" stroke="white" stroke-width="1.5" fill="none" opacity="0.7"/>
                <circle cx="10" cy="24" r="2" fill="white" opacity="0.6"/>
                <circle cx="14" cy="24" r="2" fill="white" opacity="0.6"/>
                <circle cx="18" cy="24" r="2" fill="white" opacity="0.6"/>
            </svg>`;
            break;
        case 'onu':
            color = '#10b981';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="6" width="20" height="16" rx="2" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
                <circle cx="14" cy="14" r="3" fill="white" opacity="0.7"/>
                <rect x="10" y="18" width="8" height="2" rx="1" fill="white" opacity="0.6"/>
            </svg>`;
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2" opacity="0.6"/>
            </svg>`;
    }
    
    const clickableSize = 44;
    const iconSize = (type === 'node' || type === 'cross' || type === 'olt' || type === 'splitter' || type === 'onu') ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    phantomPlacemark = new ymaps.Placemark(coords, {
        type: 'phantom',
        phantomType: type,
        balloonContent: 'Предпросмотр объекта'
    }, {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
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

    let iconSvg;
    
    switch(type) {
        case 'support':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="#3b82f6" stroke="#60a5fa" stroke-width="3"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'sleeve':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="#ef4444" stroke="#f87171" stroke-width="3"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'node':
            iconSvg = `<svg width="36" height="36" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="#4ade80" stroke-width="3"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="#22c55e"/>
            </svg>`;
            break;
        case 'nodeGroup': {
            const nodeGroup = obj.properties.get('nodeGroup');
            const nCount = nodeGroup ? nodeGroup.length : 1;
            iconSvg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="#22c55e" stroke="#4ade80" stroke-width="3"/>
                <text x="20" y="24" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${nCount}</text>
            </svg>`;
            break;
        }
        case 'crossGroup': {
            const crossGroup = obj.properties.get('crossGroup');
            const count = crossGroup ? crossGroup.length : 1;
            iconSvg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="36" height="32" rx="4" fill="#8b5cf6" stroke="#a78bfa" stroke-width="3"/>
                <text x="20" y="24" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${count}</text>
            </svg>`;
            break;
        }
        case 'cross':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="#8b5cf6" stroke="#a78bfa" stroke-width="3"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white"/>
                <circle cx="16" cy="12" r="2" fill="white"/>
                <circle cx="22" cy="12" r="2" fill="white"/>
                <circle cx="10" cy="20" r="2" fill="white"/>
                <circle cx="16" cy="20" r="2" fill="white"/>
                <circle cx="22" cy="20" r="2" fill="white"/>
            </svg>`;
            break;
        default:
            return;
    }

    const clickableSize = 44;
    const iconSize = (type === 'node' || type === 'cross') ? 32 : (type === 'crossGroup' || type === 'nodeGroup') ? 40 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    hoveredObjectOriginalIcon = {
        href: obj.options.get('iconImageHref'),
        size: obj.options.get('iconImageSize'),
        offset: obj.options.get('iconImageOffset')
    };
    
    obj.options.set({
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
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
    if (confirm(`Удалить ${selectedObjects.length} объектов?`)) {
        selectedObjects.slice().forEach(obj => deleteObject(obj, { fromBatch: true }));
        clearSelection();
    }
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fileInput = e.target;
    const reader = new FileReader();
    reader.onload = function(ev) {
        try {
            const raw = ev.target.result;
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) {
                showError('Файл должен содержать массив объектов карты (JSON-массив).', 'Импорт');
                fileInput.value = '';
                return;
            }
            
            if (objects.length > 0 && !confirm('Текущая карта будет полностью заменена импортируемыми данными. Продолжить?')) {
                fileInput.value = '';
                return;
            }
            clearMap();
            importData(data);
            showSuccess(`Карта импортирована (${data.length} объектов)`, 'Импорт');
            logAction(ActionTypes.IMPORT_DATA, { count: data.length });
        } catch (error) {
            console.error('Ошибка при импорте файла:', error);
            showError('Ошибка при чтении файла. Проверьте, что выбран корректный JSON-файл экспорта карты.', 'Импорт');
        }
        fileInput.value = '';
    };
    reader.readAsText(file);
}

function switchToViewMode() {
    const wasEditMode = isEditMode;
    isEditMode = false;
    currentCableTool = false;
    cableSource = null;
    cableWaypoints = [];

    if (objectPlacementMode) {
        cancelObjectPlacement();
    }
    
    if (splitterFiberRoutingMode) {
        cancelSplitterFiberRouting();
    }
    
    if (fiberRoutingMode) {
        cancelFiberRouting();
    }
    
    if (wasEditMode) {
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
}

function switchToEditMode() {
    
    if (!canEdit()) {
        showWarning('Редактирование доступно только администраторам', 'Нет доступа');
        return;
    }
    
    isEditMode = true;
    updateUIForMode();
    updateEditControls();
    makeObjectsDraggable();
    showInfo('Переключено в режим редактирования', 'Режим');
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
    let iconSvg, color, balloonContent;
    
    switch(type) {
        case 'support':
            
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Опора связи: ' + name : 'Опора связи';
            break;
        case 'sleeve':
            
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Кабельная муфта: ' + name : 'Кабельная муфта';
            break;
        case 'cross':
            
            color = '#8b5cf6';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white"/>
                <circle cx="16" cy="12" r="2" fill="white"/>
                <circle cx="22" cy="12" r="2" fill="white"/>
                <circle cx="10" cy="20" r="2" fill="white"/>
                <circle cx="16" cy="20" r="2" fill="white"/>
                <circle cx="22" cy="20" r="2" fill="white"/>
            </svg>`;
            balloonContent = `Оптический кросс: ${name}`;
            break;
        case 'node':
            
            const nodeKind = options.nodeKind || 'network';
            color = getNodeColorByKind(nodeKind);
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="${color}"/>
            </svg>`;
            balloonContent = `Узел сети: ${name}`;
            break;
        case 'attachment':
            
            color = '#f59e0b';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
                <path d="M10 14 L14 10 L18 14 L14 18 Z" fill="white" opacity="0.95"/>
                <circle cx="14" cy="14" r="2" fill="${color}"/>
            </svg>`;
            balloonContent = name ? 'Крепление узлов: ' + name : 'Крепление узлов';
            break;
        case 'olt':
            color = '#0ea5e9';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="24" height="20" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="6" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <rect x="12" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <rect x="18" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <line x1="8" y1="16" x2="20" y2="16" stroke="white" stroke-width="1.5" opacity="0.8"/>
            </svg>`;
            balloonContent = name ? 'OLT: ' + name : 'OLT (GPON)';
            break;
        case 'splitter':
            color = '#a855f7';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="8" r="5" fill="${color}" stroke="white" stroke-width="2"/>
                <path d="M14 13 L14 20 M8 20 L20 20 M14 20 L10 24 M14 20 L18 24" stroke="white" stroke-width="1.5" fill="none"/>
                <circle cx="10" cy="24" r="2" fill="white" opacity="0.9"/>
                <circle cx="14" cy="24" r="2" fill="white" opacity="0.9"/>
                <circle cx="18" cy="24" r="2" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Сплиттер: ' + name : 'Сплиттер';
            break;
        case 'onu':
            color = '#10b981';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="6" width="20" height="16" rx="2" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="14" r="3" fill="white" opacity="0.95"/>
                <rect x="10" y="18" width="8" height="2" rx="1" fill="white" opacity="0.7"/>
            </svg>`;
            balloonContent = name ? 'ONU: ' + name : 'ONU';
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>`;
            balloonContent = 'Объект';
    }

    const clickableSize = 44; 
    const iconSize = (type === 'node' || type === 'cross') ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;

    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
        draggable: isEditMode
    };
    
    const placemarkProperties = {
        type: type,
        name: name,
        balloonContent: balloonContent
    };

    if (type === 'node') {
        placemarkProperties.nodeKind = (options.nodeKind || 'network');
    }

    if (type === 'sleeve' && options.sleeveType) {
        placemarkProperties.sleeveType = options.sleeveType;
        placemarkProperties.maxFibers = options.maxFibers || 0;
    }

    if (type === 'cross') {
        placemarkProperties.crossPorts = options.crossPorts || 24;
    }
    if (type === 'olt') {
        placemarkProperties.ponPorts = options.ponPorts || 8;
        placemarkProperties.incomingFiber = null;
        placemarkProperties.portAssignments = {};
    }
    if (type === 'splitter') {
        placemarkProperties.splitRatio = options.splitRatio || 8;
        placemarkProperties.inputFiber = null;
        placemarkProperties.outputConnections = [];
    }
    if (type === 'onu') {
        placemarkProperties.incomingFiber = null;
    }

    if (!placemarkProperties.uniqueId) {
        placemarkProperties.uniqueId = 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    const placemark = new ymaps.Placemark(coords, placemarkProperties, placemarkOptions);

    updateObjectLabel(placemark, name);
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
            
            var targetName = fiberRoutingData.targetObj.properties.get('name') || (fiberRoutingData.targetType === 'onu' ? 'ONU' : 'Сплиттер');
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (currentCableTool && isEditMode) {
            var cableTypeVal = document.getElementById('cableType') ? document.getElementById('cableType').value : 'fiber4';
            var cableEndpointsPlacemark = ['cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu'];
            if (cableEndpointsPlacemark.indexOf(type) !== -1) {
                if (!cableSource) {
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
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
                }
                return;
            }
            if (type === 'node') {
                showError('Узел сети нельзя использовать для прокладки кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            return;
        }

        if ((type === 'node' || type === 'sleeve' || type === 'cross' || type === 'attachment' || type === 'olt' || type === 'splitter' || type === 'onu')) {
            showObjectInfo(placemark);
            return;
        }

        if (type === 'support') {
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
        var uid = placemark.properties.get('uniqueId');
        if (typeof window.syncSendOp === 'function' && uid) {
            window.syncSendOp({ type: 'update_object', uniqueId: uid, data: { geometry: placemark.geometry.getCoordinates(), name: placemark.properties.get('name') } });
        }
        saveData();
        updateConnectedCables(placemark);
        const label = placemark.properties.get('label');
        if (label) label.geometry.setCoordinates(placemark.geometry.getCoordinates());
        updateAllConnectionLines();
        updateSelectionPulsePosition(placemark);
        if (type === 'cross') updateCrossDisplay(); 
        if (type === 'node') updateNodeDisplay();
    });
    
    placemark.events.add('drag', function() {
        if (!window.syncDragInProgress) window.syncDragInProgress = true;
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} } 
        scheduleDragUpdate(placemark);
    });

    attachHoverEventsToObject(placemark);
    objects.push(placemark);
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
    if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
    updateStats();
    logAction(ActionTypes.CREATE_OBJECT, {
        objectType: type,
        name: name || ''
    });
}

function getCablesThroughObject(obj) {
    if (!objects || !obj) return [];
    return objects.filter(function(cable) {
        if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
        if (cable.properties.get('from') === obj || cable.properties.get('to') === obj) return true;
        var points = cable.properties.get('points');
        return Array.isArray(points) && points.indexOf(obj) !== -1;
    });
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
        if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
        logAction(ActionTypes.DELETE_OBJECT, {
            objectType: objType,
            name: objName
        });
    }
    updateStats();
    
    var infoModal = document.getElementById('infoModal');
    if (infoModal && infoModal.style.display === 'block') {
        var modalTitleEl = document.getElementById('modalTitle');
        var isTraceModal = modalTitleEl && modalTitleEl.textContent && modalTitleEl.textContent.toLowerCase().indexOf('трассировка') !== -1;
        if (currentModalObject === obj || isTraceModal) {
            infoModal.style.display = 'none';
            currentModalObject = null;
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

        const clickableSize = 50;
        const iconSize = (type === 'node' || type === 'cross') ? 38 : (type === 'crossGroup' || type === 'nodeGroup') ? 40 : 34;
        const iconOffset = (clickableSize - iconSize) / 2;
        
        let iconSvg;
        switch(type) {
            case 'support':
                iconSvg = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="30" height="30" rx="5" fill="#3b82f6" stroke="white" stroke-width="2"/>
                    <rect x="11" y="6" width="12" height="22" rx="2" fill="white" opacity="0.95"/>
                </svg>`;
                break;
            case 'sleeve':
                iconSvg = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="17,2 31,9 31,25 17,32 3,25 3,9" fill="#ef4444" stroke="white" stroke-width="2"/>
                    <circle cx="17" cy="17" r="5" fill="white" opacity="0.95"/>
                </svg>`;
                break;
            case 'node':
                iconSvg = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="19" cy="19" r="17" fill="#22c55e" stroke="white" stroke-width="2.5"/>
                    <circle cx="19" cy="19" r="7" fill="white" opacity="0.95"/>
                    <circle cx="19" cy="19" r="4" fill="#22c55e"/>
                </svg>`;
                break;
            case 'cross':
                iconSvg = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="2" width="34" height="34" rx="5" fill="#f59e0b" stroke="white" stroke-width="2"/>
                    <rect x="8" y="15" width="22" height="5" rx="1" fill="white" opacity="0.95"/>
                    <rect x="15" y="7" width="8" height="24" rx="1" fill="white" opacity="0.95"/>
                </svg>`;
                break;
            case 'nodeGroup': {
                const nodeGroup = obj.properties.get('nodeGroup');
                const nCount = nodeGroup ? nodeGroup.length : 1;
                iconSvg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="20" cy="20" r="18" fill="#22c55e" stroke="white" stroke-width="3"/>
                    <text x="20" y="24" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${nCount}</text>
                </svg>`;
                break;
            }
            case 'crossGroup': {
                const crossGroup = obj.properties.get('crossGroup');
                const count = crossGroup ? crossGroup.length : 1;
                iconSvg = `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="4" width="36" height="32" rx="4" fill="#8b5cf6" stroke="white" stroke-width="3"/>
                    <text x="20" y="24" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${count}</text>
                </svg>`;
                break;
            }
            default:
                iconSvg = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="15" cy="15" r="13" fill="#94a3b8" stroke="white" stroke-width="2"/>
                </svg>`;
        }
        
        const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
        const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
            <g transform="translate(${iconOffset}, ${iconOffset})">
                ${svgContent}
            </g>
        </svg>`;
        
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
        
        obj.options.set({
            iconImageHref: svgDataUrl,
            iconImageSize: [clickableSize, clickableSize],
            iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
        });
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

    let iconSvg;
    
    switch(type) {
        case 'support':
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="#3b82f6" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'sleeve':
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="#ef4444" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            break;
        case 'node':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="#22c55e" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="#22c55e"/>
            </svg>`;
            break;
        case 'cross':
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="28" height="28" rx="4" fill="#f59e0b" stroke="white" stroke-width="2"/>
                <rect x="7" y="12" width="18" height="4" rx="1" fill="white" opacity="0.95"/>
                <rect x="13" y="6" width="6" height="20" rx="1" fill="white" opacity="0.95"/>
            </svg>`;
            break;
        case 'crossGroup': {
            const crossGroup = obj.properties.get('crossGroup');
            const count = crossGroup ? crossGroup.length : 1;
            iconSvg = `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="32" height="28" rx="4" fill="#8b5cf6" stroke="#a78bfa" stroke-width="2"/>
                <text x="18" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${count}</text>
            </svg>`;
            break;
        }
        case 'nodeGroup': {
            const nodeGroup = obj.properties.get('nodeGroup');
            const nCount = nodeGroup ? nodeGroup.length : 1;
            iconSvg = `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="16" fill="#22c55e" stroke="#4ade80" stroke-width="2"/>
                <text x="18" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${nCount}</text>
            </svg>`;
            break;
        }
        default:
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="#94a3b8" stroke="white" stroke-width="2"/>
            </svg>`;
    }

    const clickableSize = 44;
    const iconSize = (type === 'node' || type === 'cross') ? 32 : (type === 'crossGroup' || type === 'nodeGroup') ? 36 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    obj.options.set({
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2]
    });
}

function clearSelection() {
    clearShowOnMapHighlight();
    while (selectedObjects.length > 0) {
        deselectObject(selectedObjects[0]);
    }

}

function addCable(fromObj, toObj, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false) {
    
    if (Array.isArray(toObj)) {
        return createCableFromPoints(toObj, cableType, existingCableId, null, skipHistoryLog, skipSync);
    }

    return createCableFromPoints([fromObj, toObj], cableType, existingCableId, fiberNumber, skipHistoryLog, skipSync);
}

function createCableFromPoints(points, cableType, existingCableId = null, fiberNumber = null, skipHistoryLog = false, skipSync = false) {
    if (!points || points.length < 2) return false;
    
    var firstType = points[0] && points[0].properties ? points[0].properties.get('type') : null;
    var lastType = points[points.length - 1] && points[points.length - 1].properties ? points[points.length - 1].properties.get('type') : null;

    if (firstType === 'node' || lastType === 'node') {
        if (!skipSync) showError('Нельзя прокладывать кабель напрямую к узлу сети. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
        return false;
    }
    const validEndpoints = ['sleeve', 'cross', 'attachment', 'olt', 'splitter', 'onu'];
    if (validEndpoints.indexOf(firstType) === -1) {
        if (!skipSync) showError('Кабель можно прокладывать от муфты, кросса, крепления, OLT, сплиттера или ONU. Начальная точка должна быть одним из этих объектов.', 'Недопустимое действие');
        return false;
    }
    if (validEndpoints.indexOf(lastType) === -1) {
        if (!skipSync) showError('Кабель можно прокладывать до муфты, кросса, крепления, OLT, сплиттера или ONU. Конечная точка должна быть одним из этих объектов.', 'Недопустимое действие');
        return false;
    }

    for (var idx = 0; idx < points.length; idx++) {
        var obj = points[idx];
        if (obj && obj.properties && obj.properties.get('type') === 'node') {
            if (!skipSync) showError('Узел сети не может быть промежуточной точкой кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
            return false;
        }
    }

    {
        const fiberCount = getFiberCount(cableType);
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
        strokeOpacity: 0.8
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
        showCableInfo(polyline);
        return false;
    });
    
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
        if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
        if (typeof window.syncSendOp === 'function') {
            const fromUid = points[0].properties.get('uniqueId');
            const toUid = points[points.length - 1].properties.get('uniqueId');
            window.syncSendOp({
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
            });
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

/**
 * Проверяет, занята ли жила (cableId + fiberNumber) где-либо: порт OLT, подключение к узлу/ONU,
 * вход/выход сплиттера. exclude — контекст текущего назначения (чтобы не считать «занятой» ту же жилу при замене).
 * @param {string} cableId
 * @param {number} fiberNumber
 * @param {{ type: string, oltId?: string, portNumber?: number, splitterId?: string, outputIndex?: number, crossId?: string, sleeveId?: string }} exclude
 * @returns {{ used: boolean, where?: string }}
 */
function getFiberUsage(cableId, fiberNumber, exclude) {
    if (!objects) return { used: false };
    const key = cableId + '-' + fiberNumber;

    for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        if (!obj.properties) continue;
        const t = obj.properties.get('type');
        const uid = obj.properties.get('uniqueId');

        if (t === 'cross' || t === 'sleeve') {
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
                return { used: true, where: 'подключение к узлу (кросс)' };
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
    switch(type) {
        case 'fiber4': return '#00FF00'; 
        case 'fiber8': return '#00AA00'; 
        case 'fiber16': return '#008800'; 
        case 'fiber24': return '#006600'; 
        default: return '#64748b'; 
    }
}

function getCableWidth(type) {
    switch(type) {
        case 'fiber4': return 2;
        case 'fiber8': return 3;
        case 'fiber16': return 4;
        case 'fiber24': return 5;
        default: return 2;
    }
}

function getCableDescription(type) {
    switch(type) {
        case 'fiber4': return 'ВОЛС 4 жилы';
        case 'fiber8': return 'ВОЛС 8 жил';
        case 'fiber16': return 'ВОЛС 16 жил';
        case 'fiber24': return 'ВОЛС 24 жилы';
        default: return 'Кабель';
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

function showCableInfo(cable) {
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
    const fiberCount = getFiberCount(cableType);
    const fibers = getFiberColors(cableType);
    
    const cableDescription = getCableDescription(cableType);

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

    modalTitle.textContent = '🔌 Информация о кабеле';

    let cableColor = '#00AA00';
    if (cableType === 'fiber4') cableColor = '#e74c3c';
    else if (cableType === 'fiber8') cableColor = '#e67e22';
    else if (cableType === 'fiber16') cableColor = '#9b59b6';
    else if (cableType === 'fiber24') cableColor = '#1abc9c';
    
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
            onchange="updateCableName('${uniqueId}', this.value)">`;
    } else {
        html += `<div style="padding: 10px 12px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-primary);">${cableName ? escapeHtml(cableName) : '<span style="color: var(--text-muted); font-style: italic;">Не задано</span>'}</div>`;
    }
    html += '</div>';

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
            const pDesc = getCableDescription(pType);
            const pFibers = getFiberCount(pType);
            const pId = pCable.properties.get('uniqueId');
            
            let pColor = '#00AA00';
            if (pType === 'fiber4') pColor = '#e74c3c';
            else if (pType === 'fiber8') pColor = '#e67e22';
            else if (pType === 'fiber16') pColor = '#9b59b6';
            else if (pType === 'fiber24') pColor = '#1abc9c';
            
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
        html += `<div style="width: 14px; height: 14px; border-radius: 50%; background: ${fiber.color}; border: 1px solid rgba(0,0,0,0.2);"></div>`;
        html += `<span style="color: var(--text-primary); font-weight: 500;">${fiber.number}</span>`;
        html += `<span style="color: var(--text-muted); font-size: 0.7rem;">${fiber.name}</span>`;
        html += `</div>`;
    });
    html += '</div></div>';

    if (isEditMode) {
        html += '<div style="padding-top: 16px; border-top: 1px solid var(--border-color); display: flex; flex-wrap: wrap; gap: 8px;">';
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
    var saveCableBtn = modalContent.querySelector('#saveCableChangesBtn');
    if (saveCableBtn) {
        saveCableBtn.addEventListener('click', function() {
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
            showInfo('Изменения сохранены', 'Сохранено');
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
    const cableType = document.getElementById('cableType').value;
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

        var typeNames = { cross: 'Кроссов', node: 'Узлов', sleeve: 'Муфт', support: 'Опар', attachment: 'Креплений', olt: 'OLT', splitter: 'Сплиттеров', onu: 'ONU', cable: 'Кабелей' };
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

function findRefClosestToCoord(refs, coord, tolerance, preferCableEndpoint) {
    if (!Array.isArray(refs) || !coord || coord.length < 2) return null;
    tolerance = tolerance || 0.0005;
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
        if (preferCableEndpoint && (t === 'sleeve' || t === 'cross' || t === 'attachment' || t === 'olt' || t === 'splitter' || t === 'onu')) {
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
            if (props.nodeConnections) result.nodeConnections = props.nodeConnections;
            if (props.fiberPorts) result.fiberPorts = props.fiberPorts;
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
            if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
        }
        if (props.type === 'sleeve') {
            if (props.oltConnections) result.oltConnections = props.oltConnections;
            if (props.onuConnections) result.onuConnections = props.onuConnections;
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
        if (props.type === 'node') {
            if (props.nodeKind) result.nodeKind = props.nodeKind;
        }
        if (props.netboxId) result.netboxId = props.netboxId;
        if (props.netboxUrl) result.netboxUrl = props.netboxUrl;
        if (props.netboxDeviceType) result.netboxDeviceType = props.netboxDeviceType;
        if (props.netboxSite) result.netboxSite = props.netboxSite;
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

function loadData() {
    loadGroupNamesFromStorage();
    if (typeof updateCrossDisplay === 'function') updateCrossDisplay();
    if (typeof updateNodeDisplay === 'function') updateNodeDisplay();
    if (!getApiBase()) {
        showNoApiMessage();
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
            if (s.mapStart && typeof myMap !== 'undefined' && myMap && Array.isArray(s.mapStart.center) && s.mapStart.center.length >= 2) {
                try { myMap.setCenter(s.mapStart.center, s.mapStart.zoom || 15); } catch (e) {}
            }
        }).catch(function() {});
    })();
    showSyncRequiredOverlay();
}

function showSyncRequiredOverlay() {
    if (window.syncIsConnected) return;
    var el = document.getElementById('syncRequiredOverlay');
    if (el) { el.style.display = 'flex'; return; }
    var wrapper = document.getElementById('mapAreaWrapper');
    if (!wrapper) return;
    el = document.createElement('div');
    el.id = 'syncRequiredOverlay';
    el.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.75);color:#fff;display:flex;align-items:center;justify-content:center;z-index:99998;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box;';
    el.innerHTML = '<div><h2 style="margin:0 0 12px;">Общая карта</h2><p style="margin:0 0 8px;">Подключитесь к синхронизации в боковой панели слева,<br>чтобы работать с картой (одна карта на всех).</p><p style="margin:0;font-size:14px;opacity:0.9;">Блок «Синхронизация» → Подключиться</p></div>';
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
    if (!Array.isArray(data)) return;
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
            return;
        }
        importData(data, opts);
        lastSavedState = JSON.parse(JSON.stringify(getSerializedData()));
        updateStats();
    } catch (e) {
        updateStats();
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
                fromObj = fromObj || findRefClosestToCoord(refs, coords[0], undefined, true);
                toObj = toObj || findRefClosestToCoord(refs, coords[coords.length - 1], undefined, true);
            }
        }
        if (!fromObj || !toObj) return;
        var existingCable = objects.find(function(o) {
            return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
        });
        if (existingCable) {
            var pointsArr = (item.geometry && item.geometry.length > 2)
                ? findObjectsAtGeometry(refs, item.geometry)
                : null;
            if (!pointsArr || pointsArr.length < 2) pointsArr = [fromObj, toObj];
            else {
                
                if (fromObj) pointsArr[0] = fromObj;
                if (toObj) pointsArr[pointsArr.length - 1] = toObj;
            }
            existingCable.properties.set('from', fromObj);
            existingCable.properties.set('to', toObj);
            existingCable.properties.set('points', pointsArr);
            if (existingCable.geometry) {
                if (coords && coords.length >= 2) {
                    existingCable.geometry.setCoordinates(coords);
                } else if (pointsArr.length >= 2) {
                    try {
                        existingCable.geometry.setCoordinates(pointsArr.map(function(p) { return p.geometry.getCoordinates(); }));
                    } catch (e) {}
                }
            }
            if (item.distance !== undefined) existingCable.properties.set('distance', item.distance);
            if (item.cableName != null) existingCable.properties.set('cableName', item.cableName);
        } else {
            var points = (item.geometry && item.geometry.length > 2)
                ? findObjectsAtGeometry(refs, item.geometry)
                : null;
            if (points && points.length >= 2) {
                
                if (fromObj) points[0] = fromObj;
                if (toObj) points[points.length - 1] = toObj;
                addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true);
            } else {
                addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true);
            }
            var cable = objects.find(function(o) {
                return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId;
            });
            if (cable) {
                if (cable.geometry && coords && coords.length >= 2) cable.geometry.setCoordinates(coords);
                if (item.distance !== undefined) cable.properties.set('distance', item.distance);
                if (item.cableName != null) cable.properties.set('cableName', item.cableName);
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
            var geom = normalizeCableGeometry(item.geometry);
            if (geom && geom.length >= 2) {
                cable.geometry.setCoordinates(geom);
            } else {
                var pts = cable.properties.get('points');
                if (Array.isArray(pts) && pts.length >= 2) {
                    try {
                        cable.geometry.setCoordinates(pts.map(function(p) { return p && p.geometry ? p.geometry.getCoordinates() : null; }).filter(Boolean));
                    } catch (e) {}
                }
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
            if (op.data.name != null) obj.properties.set('name', op.data.name);
            var lbl = obj.properties.get('label');
            if (lbl && lbl.geometry && op.data.geometry) lbl.geometry.setCoordinates(op.data.geometry);
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
        var existingByOp = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
        if (existingByOp) {
            var opCoords = op.data.geometry && normalizeCableGeometry(op.data.geometry);
            if (existingByOp.geometry && opCoords && opCoords.length >= 2) existingByOp.geometry.setCoordinates(opCoords);
            if (op.data.distance !== undefined) existingByOp.properties.set('distance', op.data.distance);
            if (op.data.cableName != null) existingByOp.properties.set('cableName', op.data.cableName);
            updateCableVisualization();
            updateAllConnectionLines();
            updateStats();
            return;
        }
        var fromUid = op.data.fromUniqueId, toUid = op.data.toUniqueId;
        var fromObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === fromUid; });
        var toObj = objects.find(function(o) { return o.properties && o.properties.get('type') !== 'cable' && o.properties.get('uniqueId') === toUid; });
        if (fromObj && toObj) {
            addCable(fromObj, toObj, op.data.cableType, op.data.uniqueId, undefined, true, true);
            var cable = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === op.data.uniqueId; });
            if (cable) {
                if (op.data.distance !== undefined) cable.properties.set('distance', op.data.distance);
                if (op.data.cableName != null) cable.properties.set('cableName', op.data.cableName);
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
                    fromObj = fromObj || findRefClosestToCoord(refsOnly, coords[0], undefined, true);
                    toObj = toObj || findRefClosestToCoord(refsOnly, coords[coords.length - 1], undefined, true);
                }
            }
            if (!fromObj || !toObj) {
                if (item.from === undefined || item.to === undefined || item.from >= objectRefs.length || item.to >= objectRefs.length) return;
                fromObj = objectRefs[item.from];
                toObj = objectRefs[item.to];
            }
            if (!fromObj || !toObj) return;
            var existingCableImport = objects.find(function(o) { return o.properties && o.properties.get('type') === 'cable' && o.properties.get('uniqueId') === item.uniqueId; });
            if (existingCableImport) {
                var ptsArr = (coords && coords.length > 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : [fromObj, toObj];
                if (ptsArr && ptsArr.length >= 2) {
                    if (fromObj) ptsArr[0] = fromObj;
                    if (toObj) ptsArr[ptsArr.length - 1] = toObj;
                    existingCableImport.properties.set('from', ptsArr[0]);
                    existingCableImport.properties.set('to', ptsArr[ptsArr.length - 1]);
                    existingCableImport.properties.set('points', ptsArr);
                    if (existingCableImport.geometry && coords && coords.length >= 2) existingCableImport.geometry.setCoordinates(coords);
                }
                if (item && 'cableName' in item) existingCableImport.properties.set('cableName', item.cableName);
                if (item.distance !== undefined) existingCableImport.properties.set('distance', item.distance);
                return;
            }
            var points = (coords && coords.length > 2) ? findObjectsAtGeometry(refsOnly, item.geometry) : null;
            if (points && points.length >= 2) {
                if (fromObj) points[0] = fromObj;
                if (toObj) points[points.length - 1] = toObj;
                addCable(points[0], points, item.cableType, item.uniqueId, undefined, true, true);
            } else {
                addCable(fromObj, toObj, item.cableType, item.uniqueId, undefined, true, true);
            }
            const cable = objects.find(obj =>
                obj.properties &&
                obj.properties.get('type') === 'cable' &&
                obj.properties.get('uniqueId') === item.uniqueId
            );
            if (cable) {
                if (cable.geometry && coords && coords.length >= 2) cable.geometry.setCoordinates(coords);
                if (!cable.properties.get('distance')) {
                    const fromCoords = fromObj.geometry.getCoordinates();
                    const toCoords = toObj.geometry.getCoordinates();
                    const distance = calculateDistance(fromCoords, toCoords);
                    cable.properties.set('distance', distance);
                }
                if (item && 'cableName' in item) cable.properties.set('cableName', item.cableName);
            }
    });

    validateAndFixCableGeometryOnLoad();
    ensureNodeLabelsVisible();
    updateCableVisualization();
    updateCrossDisplay();
    updateNodeDisplay();
    updateAllConnectionLines();
}

function createObjectFromData(data, opts) {
    const { type, name, geometry, usedFibers, fiberConnections, fiberLabels, fiberPorts, netboxId, netboxUrl, netboxDeviceType, netboxSite, sleeveType, maxFibers, crossPorts, nodeConnections, oltConnections, onuConnections, uniqueId, nodeKind, ponPorts, splitRatio, splitterConnections, incomingFiber, portAssignments, inputFiber, outputConnections } = data;
    
    let iconSvg, color, balloonContent;
    
    switch(type) {
        case 'support':
            
            color = '#3b82f6';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="24" height="24" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="10" y="6" width="8" height="16" rx="1" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Опора связи: ' + name : 'Опора связи';
            break;
        case 'sleeve':
            
            color = '#ef4444';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="14,2 24,7 24,17 14,22 4,17 4,7" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="12" r="3" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Кабельная муфта: ' + name : 'Кабельная муфта';
            break;
        case 'cross':
            
            color = '#8b5cf6';
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="28" height="24" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <line x1="10" y1="4" x2="10" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="16" y1="4" x2="16" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <line x1="22" y1="4" x2="22" y2="28" stroke="white" stroke-width="1.5" opacity="0.7"/>
                <circle cx="10" cy="12" r="2" fill="white"/>
                <circle cx="16" cy="12" r="2" fill="white"/>
                <circle cx="22" cy="12" r="2" fill="white"/>
                <circle cx="10" cy="20" r="2" fill="white"/>
                <circle cx="16" cy="20" r="2" fill="white"/>
                <circle cx="22" cy="20" r="2" fill="white"/>
            </svg>`;
            balloonContent = `Оптический кросс: ${name}`;
            break;
        case 'node':
            
            const effectiveNodeKind = nodeKind || 'network';
            color = getNodeColorByKind(effectiveNodeKind);
            iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
                <circle cx="16" cy="16" r="3" fill="${color}"/>
            </svg>`;
            balloonContent = `Узел сети: ${name}`;
            break;
        case 'attachment':
            color = '#f59e0b';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="14" r="12" fill="${color}" stroke="white" stroke-width="2"/>
                <path d="M10 14 L14 10 L18 14 L14 18 Z" fill="white" opacity="0.95"/>
                <circle cx="14" cy="14" r="2" fill="${color}"/>
            </svg>`;
            balloonContent = name ? 'Крепление узлов: ' + name : 'Крепление узлов';
            break;
        case 'olt':
            color = '#0ea5e9';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="24" height="20" rx="3" fill="${color}" stroke="white" stroke-width="2"/>
                <rect x="6" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <rect x="12" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <rect x="18" y="8" width="4" height="3" rx="1" fill="white" opacity="0.9"/>
                <line x1="8" y1="16" x2="20" y2="16" stroke="white" stroke-width="1.5" opacity="0.8"/>
            </svg>`;
            balloonContent = name ? 'OLT: ' + name : 'OLT (GPON)';
            break;
        case 'splitter':
            color = '#a855f7';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <circle cx="14" cy="8" r="5" fill="${color}" stroke="white" stroke-width="2"/>
                <path d="M14 13 L14 20 M8 20 L20 20 M14 20 L10 24 M14 20 L18 24" stroke="white" stroke-width="1.5" fill="none"/>
                <circle cx="10" cy="24" r="2" fill="white" opacity="0.9"/>
                <circle cx="14" cy="24" r="2" fill="white" opacity="0.9"/>
                <circle cx="18" cy="24" r="2" fill="white" opacity="0.9"/>
            </svg>`;
            balloonContent = name ? 'Сплиттер: ' + name : 'Сплиттер';
            break;
        case 'onu':
            color = '#10b981';
            iconSvg = `<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="6" width="20" height="16" rx="2" fill="${color}" stroke="white" stroke-width="2"/>
                <circle cx="14" cy="14" r="3" fill="white" opacity="0.95"/>
                <rect x="10" y="18" width="8" height="2" rx="1" fill="white" opacity="0.7"/>
            </svg>`;
            balloonContent = name ? 'ONU: ' + name : 'ONU';
            break;
        default:
            color = '#94a3b8';
            iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
            </svg>`;
            balloonContent = 'Объект';
    }

    const clickableSize = 44; 
    const iconSize = (type === 'node' || type === 'cross' || type === 'olt' || type === 'splitter' || type === 'onu') ? 32 : 28;
    const iconOffset = (clickableSize - iconSize) / 2;

    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    const placemarkOptions = {
        iconLayout: 'default#image',
        iconImageHref: svgDataUrl,
        iconImageSize: [clickableSize, clickableSize],
        iconImageOffset: [-clickableSize / 2, -clickableSize / 2],
        draggable: isEditMode
    };
    
    const placemark = new ymaps.Placemark(geometry, {
        type: type,
        name: name,
        balloonContent: balloonContent
    }, placemarkOptions);
    
    if (type === 'node') {
        placemark.properties.set('nodeKind', nodeKind || 'network');
    }

    if (type === 'node' || type === 'cross') {
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
        if (splitterConnections) {
            placemark.properties.set('splitterConnections', splitterConnections);
        }
    }
    if (type === 'olt') {
        placemark.properties.set('ponPorts', ponPorts || 8);
        placemark.properties.set('incomingFiber', incomingFiber || null);
        placemark.properties.set('portAssignments', portAssignments || {});
    }
    if (type === 'splitter') {
        placemark.properties.set('splitRatio', splitRatio || 8);
        placemark.properties.set('inputFiber', inputFiber || null);
        placemark.properties.set('outputConnections', outputConnections || []);
    }
    if (type === 'onu') {
        placemark.properties.set('incomingFiber', incomingFiber || null);
    }

    if (netboxId) {
        placemark.properties.set('netboxId', netboxId);
    }
    if (netboxUrl) {
        placemark.properties.set('netboxUrl', netboxUrl);
    }
    if (netboxDeviceType) {
        placemark.properties.set('netboxDeviceType', netboxDeviceType);
    }
    if (netboxSite) {
        placemark.properties.set('netboxSite', netboxSite);
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
            
            var targetName = fiberRoutingData.targetObj.properties.get('name') || (fiberRoutingData.targetType === 'onu' ? 'ONU' : 'Сплиттер');
            showWarning('Кликните по опоре или креплению для добавления точки маршрута, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
            return;
        }

        if (currentCableTool && isEditMode) {
            var cableTypeVal = document.getElementById('cableType') ? document.getElementById('cableType').value : 'fiber4';
            var cableEndpointsPlacemark = ['cross', 'sleeve', 'support', 'attachment', 'olt', 'splitter', 'onu'];
            if (cableEndpointsPlacemark.indexOf(type) !== -1) {
                if (!cableSource) {
                    cableSource = placemark;
                    cableWaypoints = [];
                    clearSelection();
                    selectObject(cableSource);
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
                }
                return;
            }
            if (type === 'node') {
                showError('Узел сети нельзя использовать для прокладки кабеля. Узлы подключаются только через жилы оптического кросса.', 'Недопустимое действие');
                return;
            }
            return;
        }

        if ((type === 'node' || type === 'sleeve' || type === 'cross' || type === 'attachment' || type === 'olt' || type === 'splitter' || type === 'onu')) {
            showObjectInfo(placemark);
            return;
        }

        if (type === 'support') {
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
            var uid = placemark.properties.get('uniqueId');
            if (typeof window.syncSendOp === 'function' && uid) {
                window.syncSendOp({ type: 'update_object', uniqueId: uid, data: { geometry: placemark.geometry.getCoordinates(), name: placemark.properties.get('name') } });
            }
            saveData();
            updateConnectedCables(placemark);
            const label = placemark.properties.get('label');
            if (label) {
                label.geometry.setCoordinates(placemark.geometry.getCoordinates());
                try { myMap.geoObjects.add(label); } catch (e) {} 
            }
            updateAllConnectionLines();
            updateSelectionPulsePosition(placemark);
        });

    placemark.events.add('drag', function() {
        if (!window.syncDragInProgress) window.syncDragInProgress = true;
        const label = placemark.properties.get('label');
        if (label) { try { myMap.geoObjects.remove(label); } catch (e) {} }
        scheduleDragUpdate(placemark);
    });

    updateObjectLabel(placemark, name);
    
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
                if (props.splitterConnections) result.splitterConnections = props.splitterConnections;
            }
            if (props.type === 'sleeve') {
                if (props.oltConnections) result.oltConnections = props.oltConnections;
                if (props.onuConnections) result.onuConnections = props.onuConnections;
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
            
            if (props.netboxId) {
                result.netboxId = props.netboxId;
            }
            if (props.netboxUrl) {
                result.netboxUrl = props.netboxUrl;
            }
            if (props.netboxDeviceType) {
                result.netboxDeviceType = props.netboxDeviceType;
            }
            if (props.netboxSite) {
                result.netboxSite = props.netboxSite;
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

function updateStats() {
    const nodeCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'node').length;
    const supportCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'support').length;
    const sleeveCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'sleeve').length;
    const crossCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cross').length;
    const oltCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'olt').length;
    const splitterCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'splitter').length;
    const onuCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'onu').length;
    const cableCount = objects.filter(obj => obj.properties && obj.properties.get('type') === 'cable').length;

    const nodeEl = document.getElementById('nodeCount');
    const supportEl = document.getElementById('supportCount');
    const sleeveEl = document.getElementById('sleeveCount');
    const crossEl = document.getElementById('crossCount');
    const oltEl = document.getElementById('oltCount');
    const splitterEl = document.getElementById('splitterCount');
    const onuEl = document.getElementById('onuCount');
    const cableEl = document.getElementById('cableCount');
    if (nodeEl) nodeEl.textContent = nodeCount;
    if (supportEl) supportEl.textContent = supportCount;
    if (sleeveEl) sleeveEl.textContent = sleeveCount;
    if (crossEl) crossEl.textContent = crossCount;
    if (oltEl) oltEl.textContent = oltCount;
    if (splitterEl) splitterEl.textContent = splitterCount;
    if (onuEl) onuEl.textContent = onuCount;
    if (cableEl) cableEl.textContent = cableCount;
}

function showObjectInfo(obj) {
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
    } else if (type === 'attachment') {
        title = name ? `Крепление узлов: ${name}` : 'Крепление узлов';
    } else if (type === 'olt') {
        title = name ? `OLT: ${name}` : 'OLT (GPON)';
    } else if (type === 'splitter') {
        title = name ? `Сплиттер: ${name}` : 'Сплиттер';
    } else if (type === 'onu') {
        title = name ? `ONU: ${name}` : 'ONU';
    } else {
        title = 'Объект';
    }
    
    document.getElementById('modalTitle').textContent = title;

    let html = '';

    if (type === 'attachment') {
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация о креплении</h4>';
        if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Название:</strong> ' + escapeHtml(name) + '</div>';
        }
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem;">Через крепление можно прокладывать кабель (как через опору).</div>';
        html += '</div>';
    }

    if (type === 'olt') {
        const oltId = getObjectUniqueId(obj);
        const ponPorts = Math.max(1, parseInt(obj.properties.get('ponPorts'), 10) || 8);
        const incomingFiber = obj.properties.get('incomingFiber') || null;
        const portAssignments = obj.properties.get('portAssignments') || {};
        const cables = getConnectedCables(obj);
        const fiberOptions = [];
        cables.forEach(cable => {
            const cid = cable.properties.get('uniqueId') || ('cable-' + Date.now());
            if (!cable.properties.get('uniqueId')) cable.properties.set('uniqueId', cid);
            const cableName = cable.properties.get('cableName') || getCableDescription(cable.properties.get('cableType'));
            const n = getFiberCount(cable.properties.get('cableType'));
            for (let f = 1; f <= n; f++) {
                fiberOptions.push({ cableId: cid, fiberNumber: f, label: cableName + ', жила ' + f, value: cid + '-' + f });
            }
        });
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">GPON</h4>';
        html += '<p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 12px;">Приход от кросса задаётся с кросса или муфты (кнопка «OLT» у жилы). Порты задаются жилами подключённых кабелей.</p>';
        const incomingLabel = incomingFiber ? (function() {
            const c = cables.find(c => (c.properties.get('uniqueId') || '') === incomingFiber.cableId);
            const desc = c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) : incomingFiber.cableId;
            return desc + ', жила ' + incomingFiber.fiberNumber;
        }()) : '— не задан';
        html += '<div style="margin-bottom: 12px;"><strong>Приход от кросса:</strong> ' + escapeHtml(incomingLabel) + '</div>';
        html += '<h5 style="margin: 12px 0 8px 0; font-size: 0.875rem;">PON-порты</h5>';
        html += '<div class="olt-ports-table-wrap" style="overflow-x: auto;"><table class="olt-ports-table" style="width: 100%; border-collapse: collapse; font-size: 0.8125rem;">';
        html += '<thead><tr><th style="text-align: left; padding: 6px 8px;">Порт</th><th style="text-align: left; padding: 6px 8px;">Жила</th>' + (isEditMode ? '' : '') + '<th style="padding: 6px 8px;"></th></tr></thead><tbody>';
        for (let p = 1; p <= ponPorts; p++) {
            const ass = portAssignments[String(p)] || null;
            const assVal = ass ? (ass.cableId + '-' + ass.fiberNumber) : '';
            const assLabel = ass ? (function() {
                const c = cables.find(c => (c.properties.get('uniqueId') || '') === ass.cableId);
                return c ? (c.properties.get('cableName') || getCableDescription(c.properties.get('cableType'))) + ', ж.' + ass.fiberNumber : ass.cableId + '-' + ass.fiberNumber;
            }()) : '—';
            html += '<tr data-port="' + p + '">';
            html += '<td style="padding: 6px 8px;">' + p + '</td>';
            if (isEditMode && fiberOptions.length) {
                html += '<td style="padding: 6px 8px;"><select class="olt-port-assign" data-port="' + p + '" style="min-width: 140px;">';
                html += '<option value="">—</option>';
                fiberOptions.forEach(opt => {
                    const taken = Object.keys(portAssignments).some(k => {
                        if (k === String(p)) return false;
                        const a = portAssignments[k];
                        return a && a.cableId != null && a.fiberNumber != null && (a.cableId + '-' + a.fiberNumber) === opt.value;
                    });
                    html += '<option value="' + escapeHtml(opt.value) + '"' + (opt.value === assVal ? ' selected' : '') + (taken ? ' disabled' : '') + '>' + escapeHtml(opt.label) + (taken ? ' (занято)' : '') + '</option>';
                });
                html += '</select></td>';
            } else {
                html += '<td style="padding: 6px 8px;">' + escapeHtml(assLabel) + '</td>';
            }
            html += '<td style="padding: 6px 8px;"><button type="button" class="btn-trace-olt-port" data-port="' + p + '" ' + (ass ? '' : 'disabled') + ' style="padding: 4px 10px; font-size: 0.75rem; background: #0ea5e9; color: white; border: none; border-radius: 4px; cursor: pointer;">Трассировка</button></td>';
            html += '</tr>';
        }
        html += '</tbody></table></div></div>';
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
            const n = getFiberCount(cable.properties.get('cableType'));
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
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">ONU</h4>';
        if (isEditMode) {
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editOnuName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название ONU</label>';
            html += '<input type="text" id="editOnuName" class="form-input" value="' + escapeHtml(name) + '" placeholder="Введите название ONU">';
            html += '</div>';
        } else if (name) {
            html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;">Название: ' + escapeHtml(name) + '</div>';
        }
        if (onuIncoming) html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 6px;">Подключена жила: кабель ' + escapeHtml(String(onuIncoming.cableId).substring(0, 12)) + '…, жила ' + onuIncoming.fiberNumber + '</div>';
        html += '</div>';
    }

    if (type === 'sleeve') {
        const sleeveType = obj.properties.get('sleeveType') || 'Не указан';
        const maxFibers = obj.properties.get('maxFibers');
        const usedFibers = getTotalUsedFibersInSleeve(obj);
        
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация о муфте</h4>';
        if (name) html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Название:</strong> ${escapeHtml(name)}</div>`;
        html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Тип муфты:</strong> ${escapeHtml(sleeveType)}</div>`;
        
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
            html += '</div>';
        }
    }

    if (type === 'node') {
        const netboxId = obj.properties.get('netboxId');
        const netboxUrl = obj.properties.get('netboxUrl');
        const netboxDeviceType = obj.properties.get('netboxDeviceType');
        const netboxSite = obj.properties.get('netboxSite');
        const nodeKind = obj.properties.get('nodeKind') || 'network';

        if (isEditMode) {
            html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Редактирование узла</h4>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editNodeName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Название узла</label>';
            html += `<input type="text" id="editNodeName" class="form-input" value="${escapeHtml(name)}" placeholder="Введите название узла">`;
            html += '</div>';
            html += '<div class="form-group" style="margin-bottom: 12px;">';
            html += '<label for="editNodeKind" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Тип узла</label>';
            html += '<select id="editNodeKind" class="form-select">';
            html += `<option value="network"${nodeKind === 'network' ? ' selected' : ''}>Узел сети (зелёный)</option>`;
            html += `<option value="aggregation"${nodeKind === 'aggregation' ? ' selected' : ''}>Узел агрегации (красный)</option>`;
            html += '</select>';
            html += '</div>';
            html += '</div>';
        } else {
            
            html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
            html += '<h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация</h4>';
            html += `<div style="color: var(--text-secondary); font-size: 0.875rem;"><strong>Название узла:</strong> ${escapeHtml(name || 'Не указано')}</div>`;
            html += '</div>';
        }

        const nodeUniqueId = getObjectUniqueId(obj);
        const connectedFibers = getNodeConnectedFibers(nodeUniqueId);
        
        if (connectedFibers.length > 0) {
            html += '<div class="connected-fibers-section" style="margin-bottom: 20px; padding: 16px; background: #f0fdf4; border-radius: 6px; border: 1px solid #bbf7d0;">';
            html += '<h4 style="margin: 0 0 12px 0; color: #166534; font-size: 0.9375rem; font-weight: 600;">🔌 Подключенные жилы</h4>';
            html += '<div style="display: flex; flex-direction: column; gap: 8px;">';
            
            connectedFibers.forEach((conn, index) => {
                html += `<div class="fiber-connection-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: var(--bg-card); border-radius: 4px; border: 1px solid #dcfce7;">`;
                html += `<div style="flex: 1;">`;
                html += `<div style="font-weight: 600; color: #166534;">Жила ${conn.fiberNumber}</div>`;
                html += `<div style="font-size: 0.8rem; color: var(--text-secondary);">От кросса: ${escapeHtml(conn.crossName)}</div>`;
                if (conn.fiberLabel) {
                    html += `<div style="font-size: 0.75rem; color: #8b5cf6;">📝 ${escapeHtml(conn.fiberLabel)}</div>`;
                }
                html += `</div>`;
                html += `<button class="btn-trace-from-node" data-cross-id="${conn.crossUniqueId}" data-cable-id="${conn.cableId}" data-fiber-number="${conn.fiberNumber}" style="padding: 8px 12px; background: #f59e0b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.8rem; font-weight: 600;">🔍 Трассировка</button>`;
                html += `</div>`;
            });
            
            html += '</div></div>';
        } else {
            html += '<div style="margin-bottom: 20px; padding: 16px; background: #fef3c7; border-radius: 6px; border: 1px solid #fde68a;">';
            html += '<div style="color: #92400e; font-size: 0.875rem;">⚠️ К этому узлу не подключено ни одной жилы.</div>';
            html += '<div style="color: #a16207; font-size: 0.8rem; margin-top: 4px;">Подключите жилу через оптический кросс.</div>';
            html += '</div>';
        }
    }

    if (type === 'cross') {
        const crossPorts = Math.max(1, parseInt(obj.properties.get('crossPorts'), 10) || 24);
        
        html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация о кроссе</h4>';
        html += `<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Количество портов:</strong> ${crossPorts}</div>`;

        const usedPorts = getTotalUsedPortsInCross(obj);
        const usagePercent = crossPorts > 0 ? Math.round((usedPorts / crossPorts) * 100) : 0;
        const statusColor = usedPorts > crossPorts ? '#dc2626' : (usagePercent >= 80 ? '#f59e0b' : '#22c55e');
        
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

    if (isEditMode) {
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

    if (connectedCables.length === 0) {
        const noCablesText = (type === 'attachment') ? 'К этому креплению не подключено кабелей' : 'К этому объекту не подключено кабелей';
        html += '<div class="no-cables" style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.875rem;">' + noCablesText + '</div>';
    } else {
        
        if ((type === 'sleeve' || type === 'cross') && connectedCables.length >= 1) {
            html += renderFiberConnectionsVisualization(obj, connectedCables);
        } else {
            
            connectedCables.forEach((cable, index) => {
                const cableType = cable.properties.get('cableType');
                const cableDescription = getCableDescription(cableType);
                const fibers = getFiberColors(cableType);
                
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
                                ${isEditMode ? `<select class="cable-type-select" data-cable-id="${cableUniqueId}">
                                    <option value="fiber4" ${cableType === 'fiber4' ? 'selected' : ''}>ВОЛС 4 жилы</option>
                                    <option value="fiber8" ${cableType === 'fiber8' ? 'selected' : ''}>ВОЛС 8 жил</option>
                                    <option value="fiber16" ${cableType === 'fiber16' ? 'selected' : ''}>ВОЛС 16 жил</option>
                                    <option value="fiber24" ${cableType === 'fiber24' ? 'selected' : ''}>ВОЛС 24 жилы</option>
                                </select>` : `<span style="font-size: 0.875rem; color: var(--text-secondary);">${cableDescription}</span>`}
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
                                <div class="fiber-color" style="background-color: ${fiber.color}; ${isUsed ? 'opacity: 0.5; border: 2px dashed #dc2626;' : ''}"></div>
                                <span class="fiber-label">Жила ${fiber.number}: ${fiber.name} ${isUsed ? '<span class="fiber-status">(используется)</span>' : '<span class="fiber-status fiber-free-text">(свободна)</span>'}</span>
                            </div>
                            ${!isUsed && isEditMode && type !== 'sleeve' && type !== 'cross' && type !== 'olt' && type !== 'splitter' && type !== 'onu' ? `<button class="btn-continue-cable" data-cable-id="${cableUniqueId}" data-fiber-number="${fiber.number}" title="Продолжить кабель с этой жилой">→</button>` : ''}
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
    
    document.getElementById('modalInfo').innerHTML = html;

    const modal = document.getElementById('infoModal');
    const modalContent = modal && modal.querySelector('.modal-content');
    if (modalContent) {
        if (type === 'cross' || type === 'sleeve') modalContent.classList.add('fiber-management-modal');
        else modalContent.classList.remove('fiber-management-modal');
    }
    
    setupModalEventListeners();
    setupEditAndDeleteListeners();
    modal.style.display = 'block';
}

function showSupportInfo(supportObj) {
    currentModalObject = supportObj;
    
    const connectedCables = getConnectedCables(supportObj);
    const supportName = supportObj.properties.get('name') || '';
    
    document.getElementById('modalTitle').textContent = supportName ? '📡 Опора связи: ' + supportName : '📡 Опора связи';
    
    let html = '';
    
    html += '<div class="info-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
    html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Информация об опоре</h4>';
    
    if (supportName) {
        html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Подпись:</strong> ' + escapeHtml(supportName) + '</div>';
    }
    
    const coords = supportObj.geometry.getCoordinates();
    html += '<div style="color: var(--text-secondary); font-size: 0.875rem; margin-bottom: 8px;"><strong>Координаты:</strong> ' + coords[0].toFixed(6) + ', ' + coords[1].toFixed(6) + '</div>';
    html += '<div style="color: var(--text-secondary); font-size: 0.875rem;"><strong>Кабелей проходит:</strong> ' + connectedCables.length + '</div>';
    html += '</div>';
    
    if (isEditMode) {
        html += '<div class="edit-section" style="margin-bottom: 20px; padding: 16px; background: var(--bg-tertiary); border-radius: 6px; border: 1px solid var(--border-color);">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">Редактирование опоры</h4>';
        html += '<div class="form-group" style="margin-bottom: 12px;">';
        html += '<label for="editSupportName" style="display: block; margin-bottom: 6px; color: var(--text-secondary); font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Подпись опоры</label>';
        html += '<input type="text" id="editSupportName" class="form-input" value="' + escapeHtml(supportName) + '" placeholder="Например: № 15">';
        html += '</div>';
        html += '<button id="saveSupportEdit" class="btn-primary" style="width: 100%; padding: 10px 14px; margin-top: 8px;">Сохранить</button>';
        html += '</div>';
    }

    if (isEditMode) {
        html += '<div class="object-actions-section" style="margin-bottom: 20px; display: flex; flex-wrap: wrap; gap: 8px;">';
        html += '<button id="duplicateCurrentObject" class="btn-secondary" style="flex: 1; min-width: 120px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        html += ' Дублировать</button>';
        html += '<button id="deleteCurrentObject" class="btn-danger" style="flex: 1; min-width: 120px;">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        html += ' Удалить</button>';
        html += '</div>';
    }

    if (connectedCables.length === 0) {
        html += '<div class="no-cables" style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.875rem;">Через эту опору не проходит ни один кабель</div>';
    } else {
        html += '<div class="cables-section">';
        html += '<h4 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 0.9375rem; font-weight: 600;">📦 Проходящие кабели</h4>';
        
        connectedCables.forEach((cable, index) => {
            const cableType = cable.properties.get('cableType');
            const cableDescription = getCableDescription(cableType);
            const cableName = cable.properties.get('cableName') || '';
            const cableUniqueId = cable.properties.get('uniqueId') || `cable-${index}`;
            const fiberCount = getFiberCount(cableType);
            const fibers = getFiberColors(cableType);
            const distance = cable.properties.get('distance');

            const fromObj = cable.properties.get('from');
            const toObj = cable.properties.get('to');
            const fromName = fromObj ? (fromObj.properties.get('name') || getObjectTypeName(fromObj.properties.get('type'))) : 'Неизвестно';
            const toName = toObj ? (toObj.properties.get('name') || getObjectTypeName(toObj.properties.get('type'))) : 'Неизвестно';

            let cableColor = '#00AA00';
            if (cableType === 'fiber4') cableColor = '#00FF00';
            else if (cableType === 'fiber8') cableColor = '#00AA00';
            else if (cableType === 'fiber16') cableColor = '#008800';
            else if (cableType === 'fiber24') cableColor = '#006600';
            
            html += `<div class="cable-info" style="margin-bottom: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: 8px; border-left: 4px solid ${cableColor};">`;
            html += `<div class="cable-header" style="margin-bottom: 10px;">`;
            html += `<h4 style="margin: 0; color: var(--text-primary); font-size: 0.9375rem;">${cableName ? escapeHtml(cableName) : `Кабель ${index + 1}`}: ${cableDescription}</h4>`;
            html += `</div>`;

            html += `<div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">`;
            html += `<strong>Маршрут:</strong> ${escapeHtml(fromName)} → ${escapeHtml(toName)}`;
            if (distance) {
                html += ` <span style="color: var(--text-muted);">(${distance} м)</span>`;
            }
            html += `</div>`;

            html += `<div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;">`;
            fibers.forEach(fiber => {
                const textColor = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00') ? '#000' : '#fff';
                html += `<div style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border-color);">`;
                html += `<div style="width: 12px; height: 12px; border-radius: 50%; background: ${fiber.color}; border: 1px solid #333;"></div>`;
                html += `<span style="font-size: 0.75rem; color: var(--text-primary);">${fiber.number}</span>`;
                html += `</div>`;
            });
            html += `</div>`;
            
            html += `</div>`;
        });
        
        html += '</div>';
    }
    
    document.getElementById('modalInfo').innerHTML = html;

    const modal = document.getElementById('infoModal');
    const modalContent = modal && modal.querySelector('.modal-content');
    if (modalContent) modalContent.classList.remove('fiber-management-modal');
    
    setupEditAndDeleteListeners();
    modal.style.display = 'block';
}

function setupEditAndDeleteListeners() {
    
    const editNodeNameInput = document.getElementById('editNodeName');
    if (editNodeNameInput) {
        editNodeNameInput.addEventListener('input', function() {
            if (!currentModalObject) return;
            const newName = this.value.trim();
            if (newName && findNodeByName(newName, currentModalObject)) {
                return;
            }
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? `Узел сети: ${newName}` : 'Узел сети');
            updateNodeLabel(currentModalObject, newName);
            saveData();
        });
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
        });
    }

    const editCrossNameInput = document.getElementById('editCrossName');
    if (editCrossNameInput) {
        editCrossNameInput.addEventListener('input', function() {
            if (!currentModalObject) return;
            const newName = this.value.trim();
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? `Оптический кросс: ${newName}` : 'Оптический кросс');
            updateNodeLabel(currentModalObject, newName);
            saveData();
        });
    }

    const editSleeveNameInput = document.getElementById('editSleeveName');
    if (editSleeveNameInput) {
        editSleeveNameInput.addEventListener('input', function() {
            if (!currentModalObject) return;
            if (currentModalObject.properties.get('type') !== 'sleeve') return;
            const newName = this.value.trim();
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? 'Кабельная муфта: ' + newName : 'Кабельная муфта');
            updateObjectLabel(currentModalObject, newName);
            saveData();
            if (typeof window.syncSendState === 'function') window.syncSendState(getSerializedData());
        });
    }
    
    const editSplitterNameInput = document.getElementById('editSplitterName');
    if (editSplitterNameInput) {
        editSplitterNameInput.addEventListener('input', function() {
            if (!currentModalObject) return;
            if (currentModalObject.properties.get('type') !== 'splitter') return;
            const newName = this.value.trim();
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? 'Сплиттер: ' + newName : 'Сплиттер');
            updateObjectLabel(currentModalObject, newName);
            saveData();
        });
    }
    
    const editOnuNameInput = document.getElementById('editOnuName');
    if (editOnuNameInput) {
        editOnuNameInput.addEventListener('input', function() {
            if (!currentModalObject) return;
            if (currentModalObject.properties.get('type') !== 'onu') return;
            const newName = this.value.trim();
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? 'ONU: ' + newName : 'ONU');
            updateObjectLabel(currentModalObject, newName);
            saveData();
        });
    }
    
    var saveSupportBtn = document.getElementById('saveSupportEdit');
    if (saveSupportBtn) {
        saveSupportBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            if (currentModalObject.properties.get('type') !== 'support') return;
            var newName = (document.getElementById('editSupportName') && document.getElementById('editSupportName').value) ? document.getElementById('editSupportName').value.trim() : '';
            currentModalObject.properties.set('name', newName);
            currentModalObject.properties.set('balloonContent', newName ? 'Опора связи: ' + newName : 'Опора связи');
            updateSupportLabel(currentModalObject, newName);
            var lbl = currentModalObject.properties.get('label');
            if (lbl && newName) {
                try { myMap.geoObjects.add(lbl); } catch (e) {}
            } else if (lbl && !newName) {
                try { myMap.geoObjects.remove(lbl); } catch (e) {}
            }
            saveData();
            showSupportInfo(currentModalObject);
        });
    }

    const saveChangesBtn = document.getElementById('saveChangesBtn');
    if (saveChangesBtn) {
        saveChangesBtn.addEventListener('click', function() {
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

    const deleteBtn = document.getElementById('deleteCurrentObject');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            if (!currentModalObject) return;
            var obj = currentModalObject;
            var msg = 'Вы уверены, что хотите удалить этот объект?';
            if (obj.properties && obj.properties.get('type') === 'support') {
                var cablesOnSupport = getCablesThroughObject(obj);
                if (cablesOnSupport.length > 0) {
                    msg = cablesOnSupport.length === 1
                        ? 'На этой опоре проложен кабель. Удалить опору и кабель?'
                        : 'На этой опоре проложено кабелей: ' + cablesOnSupport.length + '. Удалить опору и все эти кабели?';
                }
            }
            if (confirm(msg)) {
                deleteObject(currentModalObject);

                const modal = document.getElementById('infoModal');
                modal.style.display = 'none';
                currentModalObject = null;
            }
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
    if (type === 'olt' || type === 'splitter' || type === 'onu') {
        if (name) newName = name + ' (копия)';
    }
    
    createObject(type, newName, newCoords);

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

    const netboxId = obj.properties.get('netboxId');
    if (netboxId && newObj) {
        newObj.properties.set('netboxId', null); 
        newObj.properties.set('netboxUrl', null);
    }

    const modal = document.getElementById('infoModal');
    if (modal) modal.style.display = 'none';
    currentModalObject = null;
    saveData();
}

function updateNodeLabel(placemark, name) {
    updateObjectLabel(placemark, name);
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
        default: return 'Объект';
    }
}

function updateObjectLabel(placemark, name) {
    if (!placemark || !placemark.properties) return;
    
    const type = placemark.properties.get('type');
    if (type === 'cable' || type === 'cableLabel') return;
    
    let label = placemark.properties.get('label');
    const displayName = name ? escapeHtml(name) : getObjectDefaultName(type);
    const coords = placemark.geometry.getCoordinates();
    
    if (!label) {
        label = new ymaps.Placemark(coords, {}, {
            iconLayout: 'default#imageWithContent',
            iconImageHref: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
            iconImageSize: [1, 1],
            iconImageOffset: [0, 0],
            iconContent: '<div class="map-label">' + displayName + '</div>',
            iconContentOffset: [0, 18],
            zIndex: 1000,
            zIndexHover: 1000,
            cursor: 'default',
            hasBalloon: false,
            hasHint: false
        });
        placemark.properties.set('label', label);
    } else {
        label.properties.set({
            iconContent: '<div class="map-label">' + displayName + '</div>'
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
            iconContentOffset: [0, 18],
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
    const type = placemark.properties.get('type');
    if (type !== 'node') return;
    
    const nodeKind = placemark.properties.get('nodeKind') || 'network';
    const color = getNodeColorByKind(nodeKind);
    
    const iconSvg = `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
        <circle cx="16" cy="16" r="6" fill="white" opacity="0.95"/>
        <circle cx="16" cy="16" r="3" fill="${color}"/>
    </svg>`;
    
    const clickableSize = 44;
    const iconSize = 32;
    const iconOffset = (clickableSize - iconSize) / 2;
    
    const svgContent = iconSvg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
    const clickableSvg = `<svg width="${clickableSize}" height="${clickableSize}" viewBox="0 0 ${clickableSize} ${clickableSize}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${clickableSize}" height="${clickableSize}" fill="transparent"/>
        <g transform="translate(${iconOffset}, ${iconOffset})">
            ${svgContent}
        </g>
    </svg>`;
    
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(clickableSvg)));
    
    placemark.options.set('iconImageHref', svgDataUrl);
    placemark.options.set('iconImageSize', [clickableSize, clickableSize]);
    placemark.options.set('iconImageOffset', [-clickableSize / 2, -clickableSize / 2]);
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('sidebarToggle');
    if (!toggleBtn) return;
    
    toggleBtn.addEventListener('click', function() {
        const body = document.body;
        const collapsed = body.classList.toggle('sidebar-collapsed');
        
        toggleBtn.setAttribute('aria-label', collapsed ? 'Показать панель' : 'Скрыть панель');
        toggleBtn.setAttribute('title', collapsed ? 'Показать панель' : 'Скрыть панель');

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
            select.addEventListener('change', function() {
                const cableUniqueId = this.getAttribute('data-cable-id');
                const newCableType = this.value;
                changeCableType(cableUniqueId, newCableType);
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

    document.querySelectorAll('#fiber-connections-svg g[id^="fiber-"], #fiber-connections-svg circle[id^="fiber-"]').forEach(function(el) {
        el.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const cableId = this.getAttribute('data-cable-id');
            const fiberNumber = parseInt(this.getAttribute('data-fiber-number'), 10);
            
            if (!selectedFiberForConnection) {
                
                const nodeConnections = sleeveObj.properties.get('nodeConnections') || {};
                const onuConnections = sleeveObj.properties.get('onuConnections') || {};
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

                        inheritFiberLabels(sleeveObj, selectedFiberForConnection.cableId, selectedFiberForConnection.fiberNumber, cableId, fiberNumber);
                        
                        saveData();

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

    document.querySelectorAll('#fiber-connections-svg path[id^="connection-"], #fiber-connections-svg polygon[data-connection-index]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!isEditMode) return;
            const connIndex = parseInt(this.getAttribute('data-connection-index'));
            if (connIndex >= 0 && connIndex < fiberConnections.length) {
                fiberConnections.splice(connIndex, 1);
                sleeveObj.properties.set('fiberConnections', fiberConnections);
                saveData();
                showObjectInfo(sleeveObj);
            }
        });
    });

    document.querySelectorAll('.fiber-label-input').forEach(input => {
        function saveLabel() {
            const cableId = input.getAttribute('data-cable-id');
            const fiberNumber = parseInt(input.getAttribute('data-fiber-number'), 10);
            if (!cableId || isNaN(fiberNumber)) return;
            const newLabel = input.value.trim();
            updateFiberLabel(sleeveObj, cableId, fiberNumber, newLabel);
        }
        input.addEventListener('change', function(e) { e.stopPropagation(); saveLabel(); });
        input.addEventListener('blur', function(e) { e.stopPropagation(); saveLabel(); });
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

    const schemeVisibilityBtn = document.getElementById('fiber-scheme-visibility-btn');
    const diagramBlock = document.getElementById('fiber-diagram-block');
    const container = document.querySelector('.fiber-connections-container');
    if (schemeVisibilityBtn && diagramBlock) {
        schemeVisibilityBtn.addEventListener('click', function() {
            const hidden = diagramBlock.style.display === 'none';
            diagramBlock.style.display = hidden ? 'block' : 'none';
            schemeVisibilityBtn.textContent = hidden ? '▼ Скрыть схему' : '▶ Показать схему';
            schemeVisibilityBtn.title = hidden ? 'Скрыть схему' : 'Показать схему';
            if (container) container.classList.toggle('scheme-hidden', !hidden);
            if (hidden) {
                var schemeWrap = document.getElementById('fiber-scheme-wrap');
                var listWrap = document.getElementById('fiber-connections-list-wrap');
                if (schemeWrap) schemeWrap.style.display = 'block';
                if (listWrap) listWrap.style.display = 'none';
                var schemeBtn = document.querySelector('.fiber-view-btn[data-view="scheme"]');
                var listBtn = document.querySelector('.fiber-view-btn[data-view="list"]');
                if (schemeBtn) schemeBtn.classList.add('active');
                if (listBtn) listBtn.classList.remove('active');
            }
        });
    }
    
    document.querySelectorAll('.fiber-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const view = this.getAttribute('data-view');
            const schemeWrap = document.getElementById('fiber-scheme-wrap');
            const listWrap = document.getElementById('fiber-connections-list-wrap');
            document.querySelectorAll('.fiber-view-btn').forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');
            if (view === 'list') {
                if (schemeWrap) schemeWrap.style.display = 'none';
                if (listWrap) listWrap.style.display = 'block';
            } else {
                if (schemeWrap) schemeWrap.style.display = 'block';
                if (listWrap) listWrap.style.display = 'none';
            }
        });
    });

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
        spreadLabelToConnectedFibers(sleeveObj, cableId, fiberNumber, label, fiberLabels);
    } else {
        
        delete fiberLabels[key];
    }
    
    sleeveObj.properties.set('fiberLabels', fiberLabels);
    saveData();
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
            
            const fiberColors = getFiberColors(item.cable.properties.get('cableType'));
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
            
            const fromFiberColors = item.fromCableType ? getFiberColors(item.fromCableType) : [];
            const toFiberColors = item.toCableType ? getFiberColors(item.toCableType) : [];
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
    modal.style.display = 'block';

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
        nodes: nodes
    };

    const modal = document.getElementById('nodeSelectionModal');
    const fiberInfo = document.getElementById('nodeSelectionFiberInfo');
    const searchInput = document.getElementById('nodeSearchInput');

    fiberInfo.textContent = `Подключение жилы #${fiberNumber} к узлу сети`;

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
    
    const { crossObj, cableId, fiberNumber, nodes } = nodeSelectionModalData;
    
    if (nodeIndex >= 0 && nodeIndex < nodes.length) {
        
        closeNodeSelectionModal();

        connectFiberToNode(crossObj, cableId, fiberNumber, nodes[nodeIndex]);
    }
}

function closeNodeSelectionModal() {
    const modal = document.getElementById('nodeSelectionModal');
    modal.style.display = 'none';
    nodeSelectionModalData = null;
}

function getAvailableOnus() {
    return objects.filter(obj =>
        obj.properties && obj.properties.get('type') === 'onu'
    );
}

function showOnuSelectionDialog(sleeveObj, cableId, fiberNumber) {
    const onus = getAvailableOnus();
    if (onus.length === 0) {
        showWarning('Нет доступных ONU для подключения. Сначала создайте ONU на карте.', 'Нет ONU');
        return;
    }
    onuSelectionModalData = { sleeveObj: sleeveObj, cableId: cableId, fiberNumber: fiberNumber, onus: onus };
    const modal = document.getElementById('onuSelectionModal');
    const fiberInfo = document.getElementById('onuSelectionFiberInfo');
    const searchInput = document.getElementById('onuSearchInput');
    if (fiberInfo) fiberInfo.textContent = 'Подключение жилы #' + fiberNumber + ' к ONU';
    if (searchInput) searchInput.value = '';
    renderOnuList(onus, '');
    if (modal) modal.style.display = 'block';
    setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
}

function renderOnuList(onus, searchQuery) {
    const container = document.getElementById('onuListContainer');
    if (!container) return;
    if (onus.length === 0) {
        container.innerHTML = '<div class="node-list-empty"><p>Нет доступных ONU</p></div>';
        return;
    }
    const query = (searchQuery || '').toLowerCase().trim();
    const filtered = query ? onus.filter(function(o) {
        var name = (o.properties.get('name') || 'ONU').toLowerCase();
        return name.indexOf(query) !== -1;
    }) : onus;
    if (filtered.length === 0) {
        container.innerHTML = '<div class="node-list-no-results">ONU не найдены по запросу</div>';
        return;
    }
    var html = '';
    filtered.forEach(function(onu) {
        var name = onu.properties.get('name') || 'ONU';
        var idx = onus.indexOf(onu);
        html += '<div class="node-list-item" data-onu-index="' + idx + '" onclick="selectOnuFromList(' + idx + ')">';
        html += '<div class="node-list-item-info"><div class="node-list-item-name">' + escapeHtml(name) + '</div></div></div>';
    });
    container.innerHTML = html;
}

function selectOnuFromList(onuIndex) {
    if (!onuSelectionModalData) return;
    var data = onuSelectionModalData;
    if (onuIndex < 0 || onuIndex >= data.onus.length) return;
    closeOnuSelectionModal();
    var infoModal = document.getElementById('infoModal');
    if (infoModal) infoModal.style.display = 'none';
    startFiberRouting(data.sleeveObj, data.cableId, data.fiberNumber, 'onu', data.onus[onuIndex]);
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
        if (e.target === modal) {
            closeNodeSelectionModal();
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (nodeSelectionModalData) {
                renderNodeList(nodeSelectionModalData.nodes, this.value);
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeNodeSelectionModal();
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
            if (onuSelectionModalData) renderOnuList(onuSelectionModalData.onus, this.value);
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
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'splitterInput' });
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
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'splitterInput', splitterId: splitterId });
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
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'splitterInput', splitterId: splitterId });
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
    var targetName = targetObj.properties.get('name') || (targetType === 'onu' ? 'ONU' : 'Сплиттер');
    showInfo('Режим прокладки жилы: ' + sleeveName + ' → ' + targetName + '. Кликайте по опорам и креплениям для маршрута, затем кликните по целевому объекту для завершения. Нажмите Escape для отмены.', 'Прокладка жилы');
    selectObject(sleeveObj);
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
        
        var targetName = data.targetObj.properties.get('name') || (data.targetType === 'onu' ? 'ONU' : 'Сплиттер');
        showWarning('Кликните по опоре или креплению для добавления промежуточной точки, или по целевому объекту (' + escapeHtml(targetName) + ') для завершения.', 'Режим прокладки');
    } else {
        var targetName = data.targetObj.properties.get('name') || (data.targetType === 'onu' ? 'ONU' : 'Сплиттер');
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
            strokeColor: data.targetType === 'onu' ? '#22c55e' : '#3b82f6',
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
        strokeColor: data.targetType === 'onu' ? '#22c55e' : '#3b82f6',
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
    const usage = getFiberUsage(cableId, fiberNumber);
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
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'oltIncoming', oltId: getObjectUniqueId(oltObj) });
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

function connectFiberToNode(crossObj, cableId, fiberNumber, nodeObj) {
    const crossId = crossObj.properties.get('uniqueId');
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'nodeConn', crossId: crossId });
    if (usage.used) {
        showError('Эта жила уже используется: ' + (usage.where || 'другое назначение') + '. Выберите свободную жилу.', 'Жила занята');
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
        nodeName: nodeObj.properties.get('name') || 'Узел'
    };
    
    crossObj.properties.set('nodeConnections', nodeConnections);

    createNodeConnectionLine(crossObj, nodeObj, cableId, fiberNumber);
    
    saveData();

    showObjectInfo(crossObj);
}

function disconnectFiberFromNode(crossObj, cableId, fiberNumber) {
    let nodeConnections = crossObj.properties.get('nodeConnections');
    if (!nodeConnections) return;
    
    const key = `${cableId}-${fiberNumber}`;

    removeNodeConnectionLine(crossObj, cableId, fiberNumber);
    
    delete nodeConnections[key];
    
    crossObj.properties.set('nodeConnections', nodeConnections);
    saveData();

    showObjectInfo(crossObj);
}

function connectFiberToOnu(sleeveObj, cableId, fiberNumber, onuObj) {
    const sleeveId = sleeveObj.properties.get('uniqueId');
    const onuId = getObjectUniqueId(onuObj);
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'onuConn', sleeveId: sleeveId, onuId: onuId });
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
    const usage = getFiberUsage(cableId, fiberNumber, { type: 'onuConn', sleeveId: sleeveId, onuId: onuId });
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
        if (!onuConnections) return;
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
            if (currentType === 'node') {
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
            if (currentType === 'node') {
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
            if (currentType === 'node') {
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

    showFiberTraceFromCross(crossObj, cableId, fiberNumber, nodeObj);
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
            var icon = item.objectType === 'cross' ? '📦' : (item.objectType === 'sleeve' ? '🔴' : (item.objectType === 'olt' ? '📶' : (item.objectType === 'onu' ? '📟' : (item.objectType === 'splitter' ? '🔀' : '📍'))));
            var portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-start">' + stepNumber + '</span><div class="trace-path-block trace-path-start"><div><span>' + icon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'object') {
            icon = item.objectType === 'cross' ? '📦' : (item.objectType === 'sleeve' ? '🔴' : (item.objectType === 'node' ? '🖥️' : (item.objectType === 'olt' ? '📶' : (item.objectType === 'onu' ? '📟' : (item.objectType === 'splitter' ? '🔀' : '📍')))));
            portBadge = (item.objectType === 'cross' && item.port) ? ' <span class="trace-port-badge">Порт ' + escapeHtml(String(item.port)) + '</span>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">' + stepNumber + '</span><div class="trace-path-block trace-path-object"><div><span>' + icon + ' ' + escapeHtml(item.objectName) + '</span>' + portBadge + '<span class="trace-path-muted"> (' + getObjectTypeName(item.objectType) + ')</span></div>' + showOnMapBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'onuConnection') {
            var onuConnObjId = item.onu ? getObjectUniqueId(item.onu) : null;
            var onuConnShowBtn = onuConnObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(onuConnObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-object">🔌</span><div class="trace-path-block trace-path-object"><span>🔌 Вывод на ONU: Жила ' + item.fiberNumber + ' → ' + escapeHtml(item.onuName) + '</span>' + onuConnShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'cable') {
            var cableObjId = item.cable ? getObjectUniqueId(item.cable) : null;
            var cableShowBtn = cableObjId ? '<button type="button" class="trace-show-on-map-btn" data-object-id="' + escapeHtml(cableObjId) + '" style="margin-left: 8px; padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.7rem; font-weight: 600; white-space: nowrap;" title="Показать на карте">📍</button>' : '';
            var cableType = item.cable ? item.cable.properties.get('cableType') : null;
            var fiberColors = cableType ? getFiberColors(cableType) : [];
            var fiber = fiberColors.find(function(f) { return f.number === item.fiberNumber; });
            var fiberColor = fiber ? fiber.color : '#3b82f6';
            var fiberName = fiber ? fiber.name : '';
            var fiberTextColor = (fiberColor === '#FFFFFF' || fiberColor === '#FFFACD' || fiberColor === '#FFFF00') ? '#000' : '#fff';
            html += '<div class="trace-step-row"><span class="trace-step-num trace-step-num-cable">➡</span><div class="trace-path-block trace-path-cable" style="border-left-color: ' + fiberColor + ';"><div style="display: flex; align-items: center; flex-wrap: wrap;"><span>📡 ' + escapeHtml(item.cableName) + '</span><span style="display: inline-flex; align-items: center; gap: 4px; margin-left: 8px;"><span style="width: 16px; height: 16px; border-radius: 50%; background: ' + fiberColor + '; border: 1px solid #333; display: inline-block;"></span><span style="background: ' + fiberColor + '; color: ' + fiberTextColor + '; padding: 2px 8px; border-radius: 4px; font-weight: 600;">Жила ' + item.fiberNumber + (fiberName ? ': ' + fiberName : '') + '</span></span></div>' + cableShowBtn + '</div></div>';
            stepNumber++;
        } else if (item.type === 'connection') {
            var fromFiberColors = item.fromCableType ? getFiberColors(item.fromCableType) : [];
            var toFiberColors = item.toCableType ? getFiberColors(item.toCableType) : [];
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

function showFiberTraceFromCross(startCrossObj, cableId, fiberNumber, startNodeObj = null) {
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
    if (startNodeObj) {
        var nodeName = startNodeObj.properties.get('name') || 'Узел сети';
        header += '<div class="trace-path-block trace-path-start"><span>🖥️ ' + escapeHtml(nodeName) + '</span><span class="trace-path-muted">(Узел сети — начало)</span></div>';
        header += '<div class="trace-path-block trace-path-info"><span>🔌 Подключение к кроссу через жилу ' + fiberNumber + '</span></div>';
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
    });

    myMap.geoObjects.remove(cable);
    objects = objects.filter(o => o !== cable);
    
    if (!(opts && opts.skipSync)) {
        if (typeof window.syncSendOp === 'function') {
            window.syncSendOp({ type: 'delete_cable', uniqueId: cableUniqueId });
        }
        saveData();
        if (typeof window.syncForceSendState === 'function') window.syncForceSendState();
        logAction(ActionTypes.DELETE_CABLE, {
            cableType: cableType,
            from: fromName,
            to: toName
        });
    }

    updateCableVisualization();
    updateAllConnectionLines();

    const modal = document.getElementById('infoModal');
    if (modal && modal.style.display === 'block') {
        var modalTitleEl = document.getElementById('modalTitle');
        var isTraceModal = modalTitleEl && modalTitleEl.textContent && modalTitleEl.textContent.toLowerCase().indexOf('трассировка') !== -1;
        if (currentModalObject === cable || isTraceModal) {
            modal.style.display = 'none';
            currentModalObject = null;
        }
    }
    
    updateStats();

    if (currentModalObject && currentModalObject !== cable) {
        if (currentModalObject.properties) {
            const objType = currentModalObject.properties.get('type');
            if (objType !== 'cable') {
                showObjectInfo(currentModalObject);
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

function changeCableType(cableUniqueId, newCableType) {
    const cable = objects.find(obj => 
        obj.properties && 
        obj.properties.get('type') === 'cable' &&
        obj.properties.get('uniqueId') === cableUniqueId
    );
    
    if (!cable) return;
    
    const oldCableType = cable.properties.get('cableType');
    const oldFiberCount = getFiberCount(oldCableType);
    const newFiberCount = getFiberCount(newCableType);

    if (newFiberCount < oldFiberCount) {
        const fromObj = cable.properties.get('from');
        const toObj = cable.properties.get('to');
        
        [fromObj, toObj].forEach(obj => {
            if (obj) {
                let usedFibersData = obj.properties.get('usedFibers');
                if (usedFibersData && usedFibersData[cableUniqueId]) {
                    
                    usedFibersData[cableUniqueId] = usedFibersData[cableUniqueId].filter(
                        fiberNum => fiberNum <= newFiberCount
                    );
                    obj.properties.set('usedFibers', usedFibersData);
                }
            }
        });
    }

    cable.properties.set('cableType', newCableType);

    const cableColor = getCableColor(newCableType);
    const cableWidth = getCableWidth(newCableType);
    
    cable.options.set({
        strokeColor: cableColor,
        strokeWidth: cableWidth,
        strokeOpacity: 0.8
    });

    const cableDescription = getCableDescription(newCableType);
    cable.properties.set('balloonContent', cableDescription);
    
    saveData();

    if (currentModalObject) {
        showObjectInfo(currentModalObject);
    }
}

function getFiberCount(cableType) {
    switch(cableType) {
        case 'fiber4': return 4;
        case 'fiber8': return 8;
        case 'fiber16': return 16;
        case 'fiber24': return 24;
        default: return 0;
    }
}

function getCrossesAtSameLocation(cross) {
    if (!cross || !cross.geometry || !cross.properties || cross.properties.get('type') !== 'cross') return [cross];
    try {
        const coords = cross.geometry.getCoordinates();
        const k = groupKey(coords);
        const groups = getCrossGroups();
        const group = groups.find(g => groupKey(g.coords) === k);
        return group ? group.crosses : [cross];
    } catch (e) { return [cross]; }
}

function getConnectedCables(obj) {
    var direct = objects.filter(cable => 
        cable.properties && 
        cable.properties.get('type') === 'cable' &&
        (cable.properties.get('from') === obj || cable.properties.get('to') === obj)
    );
    if (obj && obj.properties && obj.properties.get('type') === 'cross') {
        var sameLocation = getCrossesAtSameLocation(obj);
        if (sameLocation.length > 1) {
            sameLocation.forEach(function(other) {
                if (other === obj) return;
                objects.filter(function(cable) {
                    if (!cable.properties || cable.properties.get('type') !== 'cable') return false;
                    return cable.properties.get('from') === other || cable.properties.get('to') === other;
                }).forEach(function(c) {
                    if (direct.indexOf(c) === -1) direct.push(c);
                });
            });
        }
    }
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
    const n = getFiberCount(cable.properties.get('cableType'));
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
        const iconSvg = `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="32" height="28" rx="4" fill="#8b5cf6" stroke="#a78bfa" stroke-width="2"/>
            <text x="18" y="22" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${n}</text>
        </svg>`;
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(iconSvg)));
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
            iconImageSize: [36, 36],
            iconImageOffset: [-18, -18],
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
                        const cableType = document.getElementById('cableType').value;
                        if (addCable(cableSource, crosses[0], cableType)) {
                            cableSource = crosses[0];
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
            const groupNameRow = '<div class="group-name-row">' +
                '<label class="group-name-label">Название группы</label>' +
                '<div class="group-name-controls">' +
                '<input type="text" class="group-name-input" value="' + escapeHtml(crossGroupName) + '" placeholder="' + escapeHtml(n + ' кр.') + '">' +
                '<button type="button" class="group-name-save">Сохранить</button>' +
                '</div></div>';
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
                                const cableType = document.getElementById('cableType').value;
                                if (addCable(cableSource, crossObj, cableType)) {
                                    cableSource = crossObj;
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
        const groupColor = hasAggregation ? '#ef4444' : '#22c55e';
        const groupStroke = hasAggregation ? '#f87171' : '#4ade80';
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
        const iconSvg = '<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">' +
            '<circle cx="18" cy="18" r="16" fill="' + groupColor + '" stroke="' + groupStroke + '" stroke-width="2"/>' +
            '<text x="18" y="23" text-anchor="middle" fill="white" font-size="14" font-weight="bold">' + n + '</text>' +
            '</svg>';
        const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(iconSvg)));
        const groupPlacemark = new ymaps.Placemark(coords, {
            type: 'nodeGroup',
            nodeGroup: group.nodes,
            displayNodes: displayNodes,
            nodeGroupLabel: nodeLabel,
            balloonContent: ''
        }, {
            iconLayout: 'default#image',
            iconImageHref: svgDataUrl,
            iconImageSize: [36, 36],
            iconImageOffset: [-18, -18],
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
            const nodeGroupNameRow = '<div class="group-name-row">' +
                '<label class="group-name-label">Название группы</label>' +
                '<div class="group-name-controls">' +
                '<input type="text" class="group-name-input" value="' + escapeHtml(nodeGroupName) + '" placeholder="' + escapeHtml(n + ' уз.') + '">' +
                '<button type="button" class="group-name-save">Сохранить</button>' +
                '</div></div>';
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
    return {
        node: nodeEl ? nodeEl.checked : true,
        nodeAggregationOnly: nodeAggEl ? nodeAggEl.checked : false,
        cross: crossEl ? crossEl.checked : true,
        sleeve: sleeveEl ? sleeveEl.checked : true,
        support: supportEl ? supportEl.checked : true,
        attachment: attachmentEl ? attachmentEl.checked : true,
        olt: oltEl ? oltEl.checked : true,
        splitter: splitterEl ? splitterEl.checked : true,
        onu: onuEl ? onuEl.checked : true
    };
}

function applyMapFilter() {
    if (!myMap || !objects) return;
    var filter = getMapFilterState();
    mapFilter = filter;
    function isObjVisible(obj) {
        if (!obj || !obj.properties) return false;
        var type = obj.properties.get('type');
        if (type === 'cable' || type === 'cableLabel') return false;
        if (type === 'node') {
            if (!filter.node) return false;
            if (filter.nodeAggregationOnly) return obj.properties.get('nodeKind') === 'aggregation';
            return true;
        }
        if (type === 'olt' || type === 'splitter' || type === 'onu') return filter[type] !== false;
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
            visible = filter[type] === true || (['olt', 'splitter', 'onu'].indexOf(type) !== -1 && filter[type] !== false);
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

function renderFiberConnectionsVisualization(sleeveObj, connectedCables) {
    const objType = sleeveObj.properties.get('type');
    const isCross = objType === 'cross';
    
    var containerClass = 'fiber-connections-container';
    if (isCross && isEditMode) containerClass += ' cross-edit-mode';
    let html = '<div class="' + containerClass + '" style="margin-top: 20px;">';
    html += `<h4 style="margin: 0 0 15px 0; color: var(--text-primary); font-size: 1rem; font-weight: 600;">${isCross ? 'Управление жилами в кроссе' : 'Объединение жил в муфте'}</h4>`;

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

    let nodeConnections = sleeveObj.properties.get('nodeConnections');
    if (!nodeConnections) {
        nodeConnections = {};
        sleeveObj.properties.set('nodeConnections', nodeConnections);
    }
    const oltConnections = sleeveObj.properties.get('oltConnections') || {};
    const onuConnections = sleeveObj.properties.get('onuConnections') || {};
    const crossPorts = isCross ? (sleeveObj.properties.get('crossPorts') || 24) : 24;
    let fiberPorts = isCross ? sleeveObj.properties.get('fiberPorts') : null;
    if (isCross && !fiberPorts) {
        fiberPorts = {};
        sleeveObj.properties.set('fiberPorts', fiberPorts);
    }

    const cablesData = connectedCables.map((cable, index) => {
        const cableType = cable.properties.get('cableType');
        const cableDescription = getCableDescription(cableType);
        const cableName = cable.properties.get('cableName') || '';
        const fibers = getFiberColors(cableType);
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
    
    const maxFibers = Math.max(...cablesData.map(c => c.fibers.length));
    
    const schemeMaxW = 1100;
    const schemeMinW = 720;
    const svgWidth = Math.min(schemeMaxW, Math.max(schemeMinW, window.innerWidth - 100));
    const rowHeight = 36;
    const svgHeight = Math.max(420, maxFibers * rowHeight + 90);
    const cableColumnWidth = svgWidth / (cablesData.length + 1);

    if (isEditMode) {
        const canConnectFibers = cablesData.length >= 2;
        html += '<details class="cross-instruction-details" style="margin-bottom: 10px;">';
        html += '<summary style="cursor: pointer; padding: 8px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.875rem; color: var(--text-secondary); list-style: none; user-select: none;">';
        html += '▸ Краткая инструкция';
        html += '</summary>';
        html += '<div style="padding: 10px 12px; background: #e0f2fe; border-radius: 6px; margin-top: 4px; font-size: 0.8125rem; color: #0369a1;">';
        if (isCross) {
            html += '• <strong>Соединение жил:</strong> клик по жиле в таблице или в схеме → затем по жиле в <u>другом</u> кабеле.<br>';
            html += '• <strong>На узел:</strong> кнопка «Узел» у свободной жилы.<br>';
            if (canConnectFibers) html += '• Уже соединённые жилы — синяя обводка в схеме; занятые — красным в таблице.';
        } else if (canConnectFibers) {
            html += '• Клик по жиле первого кабеля, затем по жиле второго. Клик по линии соединения в схеме — удалить соединение.';
        }
        html += '</div></details>';
        if (canConnectFibers || isCross) {
            html += '<div id="fiber-selection-bar" class="fiber-selection-bar" style="display: none;"></div>';
        }
    }

    html += '<div class="fiber-scheme-toggle-row">';
    html += '<button type="button" class="fiber-scheme-visibility-btn" id="fiber-scheme-visibility-btn" title="Скрыть схему и список соединений. Таблица ниже станет выше.">▼ Скрыть схему</button>';
    html += '</div>';
    html += '<div class="fiber-diagram-block" id="fiber-diagram-block">';
    if (cablesData.length >= 2) {
        html += '<div class="fiber-view-toggle">';
        html += '<button type="button" class="fiber-view-btn active" data-view="scheme">Схема</button>';
        html += '<button type="button" class="fiber-view-btn" data-view="list">Список соединений</button>';
        html += '</div>';
    }
    html += '<div class="fiber-scheme-wrap" id="fiber-scheme-wrap">';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const svgBgColor = isDark ? '#1e293b' : '#ffffff';
    const svgBorderColor = isDark ? '#334155' : '#dee2e6';
    const svgTextColor = isDark ? '#f1f5f9' : '#2c3e50';
    const svgTextMuted = isDark ? '#94a3b8' : '#6c757d';
    const svgLabelColor = isDark ? '#cbd5e1' : '#495057';
    
    html += `<svg id="fiber-connections-svg" width="${svgWidth}" height="${svgHeight}" style="border: 1px solid ${svgBorderColor}; border-radius: 6px; background: ${svgBgColor}; display: block; min-width: 100%;">`;

    const fiberPositions = new Map();

    const connectedFibers = new Set();
    fiberConnections.forEach(conn => {
        connectedFibers.add(`${conn.from.cableId}-${conn.from.fiberNumber}`);
        connectedFibers.add(`${conn.to.cableId}-${conn.to.fiberNumber}`);
    });
    
    cablesData.forEach((cableData, cableIndex) => {
        const x = cableColumnWidth * (cableIndex + 1);
        const startY = 52;
        const fiberSpacing = rowHeight;

        const svgCableTitle = cableData.cableName || `Кабель ${cableData.index}`;
        html += `<text x="${x}" y="25" text-anchor="middle" style="font-size: 11px; font-weight: 600; fill: ${svgTextColor};">${svgCableTitle}</text>`;
        html += `<text x="${x}" y="38" text-anchor="middle" style="font-size: 9px; fill: ${svgTextMuted};">${cableData.cableDescription}</text>`;

        cableData.fibers.forEach((fiber, fiberIndex) => {
            const y = startY + fiberIndex * fiberSpacing;
            const isUsed = cableData.usedFibers.includes(fiber.number);
            const fiberKey = `${cableData.cableUniqueId}-${fiber.number}`;
            const isConnected = connectedFibers.has(fiberKey);

            fiberPositions.set(fiberKey, { x, y, cableIndex, fiberIndex, cableData, fiber });

            let strokeColor = '#333';
            let strokeWidth = '1';
            let strokeDasharray = 'none';
            let opacity = '1';
            
            if (isConnected) {
                strokeColor = '#3b82f6'; 
                strokeWidth = '3';
                strokeDasharray = 'none';
            } else if (isUsed) {
                strokeColor = '#dc2626';
                strokeWidth = '2';
                strokeDasharray = '3,3';
                opacity = '0.7';
            }

            const portW = 26;
            const portH = 20;
            const portX = x - portW / 2;
            const portY = y - portH / 2;
            const clickable = isEditMode ? 'cursor: pointer;' : '';
            const textFill = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00') ? '#000' : '#fff';
            html += `<g id="fiber-${fiberKey}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" data-fiber-connected="${isConnected}" data-fiber-used="${isUsed}" style="${clickable}">`;
            html += `<rect x="${portX}" y="${portY}" width="${portW}" height="${portH}" rx="4" fill="${fiber.color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" opacity="${opacity}" style="pointer-events: inherit;"/>`;
            html += `<text x="${x}" y="${y + 3}" text-anchor="middle" style="font-size: 10px; font-weight: 600; fill: ${textFill}; pointer-events: none;">${fiber.number}</text>`;
            html += '</g>';
            
            const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
            const directLabel = fiberLabels[fiberLabelKey] || '';
            const inheritedInfo = getInheritedFiberLabel(sleeveObj, cableData.cableUniqueId, fiber.number);
            const displayLabel = directLabel || inheritedInfo.label;
            const isInherited = !directLabel && inheritedInfo.inherited;
            const statusText = isConnected ? ' (соед.)' : '';
            let labelText = '';
            if (displayLabel) labelText = isInherited ? ` [← ${displayLabel}]` : ` [${displayLabel}]`;
            const portText = isCross && fiberPorts && fiberPorts[fiberLabelKey] ? ` · порт ${fiberPorts[fiberLabelKey]}` : '';
            const labelColor = isInherited ? '#8b5cf6' : (isConnected ? '#3b82f6' : svgLabelColor);
            html += `<text x="${x + portW / 2 + 6}" y="${y + 3}" style="font-size: 10px; fill: ${labelColor};">${fiber.name}${labelText}${statusText}${portText}</text>`;
        });
    });

    fiberConnections.forEach((connection, connIndex) => {
        const fromKey = `${connection.from.cableId}-${connection.from.fiberNumber}`;
        const toKey = `${connection.to.cableId}-${connection.to.fiberNumber}`;
        
        const fromPos = fiberPositions.get(fromKey);
        const toPos = fiberPositions.get(toKey);
        
        if (fromPos && toPos) {
            const x1 = fromPos.x;
            const y1 = fromPos.y;
            const x2 = toPos.x;
            const y2 = toPos.y;
            
            const portHalf = 13;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 10;
            const clickable = isEditMode ? 'cursor: pointer;' : '';
            html += `<path id="connection-${connIndex}" d="M ${x1 + portHalf} ${y1} Q ${midX} ${midY} ${x2 - portHalf} ${y2}" 
                stroke="#3b82f6" stroke-width="2" fill="none" opacity="0.8" stroke-dasharray="5,3" style="${clickable}" data-connection-index="${connIndex}"/>`;
            html += `<polygon points="${midX - 3},${midY - 2} ${midX},${midY + 2} ${midX + 3},${midY - 2}" 
                fill="#3b82f6" opacity="0.8" style="${clickable}" data-connection-index="${connIndex}"/>`;
        }
    });
    
    html += '</svg>';
    html += '</div></div>';

    if (cablesData.length >= 2) {
        function cableNameById(id) {
            const d = cablesData.find(function(c) { return c.cableUniqueId === id; });
            return d ? (d.cableName || ('Кабель ' + d.index)) : id.substring(0, 8) + '…';
        }
        html += '<div class="fiber-connections-list-wrap" id="fiber-connections-list-wrap" style="display: none;">';
        html += '<div class="fiber-connections-list">';
        if (isEditMode && fiberConnections.length > 0) html += '<p class="fiber-connections-list-sub">Удаление: клик по линии в схеме или кнопка ✕ в строке.</p>';
        if (fiberConnections.length === 0) {
            html += '<p class="fiber-connections-list-empty">Нет соединений между жилами.</p>';
            if (isEditMode) html += '<p class="fiber-connections-list-hint">Переключитесь на «Схема» или кликайте по жилам в таблице ниже: первая жила → вторая жила из другого кабеля.</p>';
        } else {
            fiberConnections.forEach(function(conn, idx) {
                const fromName = cableNameById(conn.from.cableId);
                const toName = cableNameById(conn.to.cableId);
                html += '<div class="fiber-connection-row" data-connection-index="' + idx + '">';
                html += '<span class="fiber-conn-from">' + escapeHtml(fromName) + ', ж.' + conn.from.fiberNumber + '</span>';
                html += '<span class="fiber-conn-arrow">↔</span>';
                html += '<span class="fiber-conn-to">' + escapeHtml(toName) + ', ж.' + conn.to.fiberNumber + '</span>';
                if (isEditMode) html += '<button type="button" class="fiber-conn-delete" data-connection-index="' + idx + '" title="Удалить соединение">✕</button>';
                html += '</div>';
            });
        }
        html += '</div></div>';
    }
    html += '</div>';

    function buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, fiberPorts, crossPorts) {
        const isUsed = cableData.usedFibers.includes(fiber.number);
        const fiberLabelKey = `${cableData.cableUniqueId}-${fiber.number}`;
        const directLabel = fiberLabels[fiberLabelKey] || '';
        const inheritedInfo = getInheritedFiberLabel(sleeveObj, cableData.cableUniqueId, fiber.number);
        const displayLabel = directLabel || inheritedInfo.label;
        const isInheritedLabel = !directLabel && inheritedInfo.inherited;
        const isConnected = fiberConnections.some(conn =>
            (conn.from.cableId === cableData.cableUniqueId && conn.from.fiberNumber === fiber.number) ||
            (conn.to.cableId === cableData.cableUniqueId && conn.to.fiberNumber === fiber.number)
        );
        const nodeConnection = nodeConnections[fiberLabelKey];
        const oltConnection = oltConnections[fiberLabelKey];
        const onuConnection = onuConnections[fiberLabelKey];
        const splitterConnections = sleeveObj.properties.get('splitterConnections') || {};
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
        const hasAnyOutConnection = hasNodeConnection || hasOltConnection || hasOnuConnection || hasSplitterConnection;
        const canConnectToOnu = isFiberConnectedToOlt(sleeveObj, cableData.cableUniqueId, fiber.number);
        const fiberTextColor = (fiber.color === '#FFFFFF' || fiber.color === '#FFFACD' || fiber.color === '#FFFF00') ? '#000' : '#fff';
        let statusText = isUsed ? '(исп.)' : (hasNodeConnection ? '(на узел)' : (hasOnuConnection ? '(на ONU)' : (hasSplitterConnection ? '(на сплит.)' : (hasOltConnection ? '(от OLT)' : '(своб.)'))));
        if (hasOltConnection && oltConnection.oltId) {
            const oltObj = objects.find(o => o.properties && o.properties.get('type') === 'olt' && o.properties.get('uniqueId') === oltConnection.oltId);
            const oltName = oltObj ? (oltObj.properties.get('name') || 'OLT') : 'OLT';
            statusText = oltConnection.incoming ? ('приход OLT ' + escapeHtml(oltName)) : ('OLT ' + escapeHtml(oltName) + ', порт ' + (oltConnection.portNumber || '?'));
        }
        if (hasOnuConnection) statusText = '→ ONU ' + escapeHtml(onuConnection.onuName || 'ONU');
        if (hasSplitterConnection) statusText = '→ ' + escapeHtml(splitterName);
        const statusColor = isUsed ? '#b91c1c' : (hasNodeConnection ? '#22c55e' : (hasOnuConnection ? '#a855f7' : (hasSplitterConnection ? '#f97316' : (hasOltConnection ? '#0ea5e9' : '#22c55e'))));
        const itemBorder = isUsed ? '#dc2626' : (hasNodeConnection ? '#22c55e' : (hasOnuConnection ? '#a855f7' : (hasSplitterConnection ? '#f97316' : (hasOltConnection ? '#0ea5e9' : 'var(--border-color)'))));
        const usedClass = isUsed ? ' fiber-used cross-fiber-used' : (hasSplitterConnection ? ' fiber-splitter-connected' : '');
        var cellTitle = '';
        if (isEditMode && !hasAnyOutConnection && !isConnected) cellTitle = 'Клик: выбрать жилу, затем клик по жиле в другом кабеле — создать соединение';
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
            <div class="fiber-item${usedClass}" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}"${cellTitle ? ' title="' + cellTitle.replace(/"/g, '&quot;') + '"' : ''}
                 style="display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 4px; border: 1px solid ${itemBorder}; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="fiber-color" style="width: 22px; height: 22px; border-radius: 50%; background-color: ${fiber.color}; border: 2px solid #333; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 9px; font-weight: 700; color: ${fiberTextColor};">${fiber.number}</span>
                    </div>
                    <span class="fiber-name" style="font-size: 0.8125rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;"><strong>${fiber.name}</strong></span>
                    <span style="font-size: 0.7rem; color: ${statusColor}; font-weight: 600; white-space: nowrap;">${statusText}</span>
                </div>
                ${portRow}
                ${hasNodeConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #f0fdf4; border-radius: 3px; font-size: 0.75rem;"><span style="color: #166534;">🖥️ → ${escapeHtml(nodeConnection.nodeName)}</span>${isEditMode ? `<button class="btn-disconnect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от узла" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasOnuConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #f5f3ff; border-radius: 3px; font-size: 0.75rem;"><span style="color: #6d28d9;">📡 → ${escapeHtml(onuConnection.onuName || 'ONU')}${onuConnection.routeIds && onuConnection.routeIds.length > 0 ? ' (' + onuConnection.routeIds.length + ' точ.)' : ''}</span>${isEditMode ? `<button class="btn-disconnect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от ONU" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasSplitterConnection ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #fff7ed; border-radius: 3px; font-size: 0.75rem;"><span style="color: #c2410c;">🔀 → ${escapeHtml(splitterName)}${splitterConnection.routeIds && splitterConnection.routeIds.length > 0 ? ' (' + splitterConnection.routeIds.length + ' точ.)' : ''}</span>${isEditMode ? `<button class="btn-disconnect-splitter" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от сплиттера" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>` : ''}
                ${hasOltConnection && oltConnection.oltId ? (function() { const o = objects.find(obj => obj.properties && obj.properties.get('type') === 'olt' && obj.properties.get('uniqueId') === oltConnection.oltId); const n = o ? (o.properties.get('name') || 'OLT') : 'OLT'; const label = oltConnection.incoming ? ('приход OLT ' + escapeHtml(n)) : ('OLT ' + escapeHtml(n) + ', порт ' + (oltConnection.portNumber || '?')); return `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px; padding: 4px 6px; background: #e0f2fe; border-radius: 3px; font-size: 0.75rem;"><span style="color: #0369a1;">📶 ${label}</span>${isEditMode ? `<button class="btn-disconnect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Отключить от OLT" style="padding: 2px 5px; background: #dc2626; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem; margin-left: auto;">✕</button>` : ''}</div>`; }()) : ''}
                ${(!isConnected && !hasAnyOutConnection && isEditMode && isCross) ? `<div style="margin-left: 30px; display: flex; gap: 4px; flex-wrap: wrap;"><button class="btn-connect-node" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к узлу" style="padding: 4px 6px; background: #22c55e; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">🖥️ Узел</button><button class="btn-connect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к OLT" style="padding: 4px 6px; background: #0ea5e9; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📶 OLT</button>${canConnectToOnu ? `<button class="btn-connect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к ONU" style="padding: 4px 6px; background: #a855f7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📡 ONU</button>` : ''}</div>` : ''}
                ${(!isConnected && !hasAnyOutConnection && isEditMode && !isCross) ? `<div style="margin-left: 30px; display: flex; gap: 4px; flex-wrap: wrap;"><button class="btn-connect-olt" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к OLT" style="padding: 4px 6px; background: #0ea5e9; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📶 OLT</button>${(cableData.isFromOlt || canConnectToOnu) ? `<button class="btn-connect-splitter" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к входу сплиттера" style="padding: 4px 6px; background: #f97316; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">🔀 Сплиттер</button>` : ''}${canConnectToOnu ? `<button class="btn-connect-onu" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" title="Подключить к ONU" style="padding: 4px 6px; background: #a855f7; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 0.65rem;">📡 ONU</button>` : ''}</div>` : ''}
                ${isEditMode ? `<div style="display: flex; align-items: center; gap: 4px; margin-left: 30px;"><input type="text" class="fiber-label-input" data-cable-id="${cableData.cableUniqueId}" data-fiber-number="${fiber.number}" value="${directLabel}" placeholder="${isInheritedLabel ? '← ' + displayLabel : 'Подпись...'}" style="flex: 1; min-width: 0; padding: 4px 6px; border: 1px solid ${isInheritedLabel ? '#8b5cf6' : '#ced4da'}; border-radius: 3px; font-size: 0.7rem; ${isInheritedLabel ? 'background: #f5f3ff;' : ''}">${isInheritedLabel ? '<span style="font-size: 0.65rem; color: #8b5cf6;">⬅️</span>' : ''}</div>` : (displayLabel ? `<div style="margin-left: 30px; font-size: 0.7rem; color: ${isInheritedLabel ? '#8b5cf6' : '#6366f1'}; overflow: hidden; text-overflow: ellipsis;">${isInheritedLabel ? '⬅️ ' : '📝 '}${displayLabel}</div>` : '')}
            </div>`;
    }

    const maxRows = Math.max(1, maxFibers);
    html += '<div class="cross-fiber-table-section">';
    html += '<h4 class="cross-fiber-table-caption">Таблица кабелей и жил</h4>';
    html += '<div class="cross-fiber-table-wrap">';
    html += '<table class="cross-fiber-table">';
    html += '<thead><tr>';
    cablesData.forEach((cableData) => {
        const cableTitle = cableData.cableName ? cableData.cableName : ('Кабель ' + cableData.index);
        html += '<th><div class="cross-fiber-th">';
        html += `<span class="cross-fiber-th-title">${escapeHtml(cableTitle)}</span><span class="cross-fiber-th-desc">${cableData.cableDescription}</span>${cableData.isFromSleeve ? ' <span class="cross-fiber-th-dir">← от муфты</span>' : ' <span class="cross-fiber-th-dir">→ к муфте</span>'}`;
        if (isEditMode) {
            html += `<div class="cross-fiber-th-actions"><select class="cable-type-select form-input" data-cable-id="${cableData.cableUniqueId}" style="padding: 4px 6px; font-size: 0.75rem;"><option value="fiber4" ${cableData.cableType === 'fiber4' ? 'selected' : ''}>4 жилы</option><option value="fiber8" ${cableData.cableType === 'fiber8' ? 'selected' : ''}>8</option><option value="fiber16" ${cableData.cableType === 'fiber16' ? 'selected' : ''}>16</option><option value="fiber24" ${cableData.cableType === 'fiber24' ? 'selected' : ''}>24</option></select><button class="btn-delete-cable" data-cable-id="${cableData.cableUniqueId}" title="Удалить кабель" style="padding: 4px 8px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem;">✕</button></div>`;
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
                html += buildFiberCell(cableData, fiber, sleeveObj, isCross, isEditMode, fiberLabels, fiberConnections, nodeConnections, oltConnections, onuConnections, fiberPorts, crossPorts);
            } else {
                html += '<div class="cross-fiber-empty">—</div>';
            }
            html += '</td>';
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    html += '</div></div></div>';

    html += `<div id="fiber-connections-data" data-sleeve-obj-id="${sleeveObj.properties.get('uniqueId') || 'temp'}" style="display: none;"></div>`;
    
    return html;
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
        const fiberCount = getFiberCount(cableType);
        totalFibers += fiberCount;
        const cableDescription = getCableDescription(cableType);
        return { cable, cableType, fiberCount, cableDescription };
    });

    let newCableType = 'fiber4';
    if (totalFibers <= 4) newCableType = 'fiber4';
    else if (totalFibers <= 8) newCableType = 'fiber8';
    else if (totalFibers <= 16) newCableType = 'fiber16';
    else if (totalFibers <= 24) newCableType = 'fiber24';
    else {
        showError(`Общее количество жил (${totalFibers}) превышает максимальную вместимость кабеля (24). Невозможно объединить.`, 'Объединение кабелей');
        return;
    }

    const maxFibers = sleeveObj.properties.get('maxFibers');
    if (maxFibers && maxFibers > 0) {
        const usedFibersCount = getTotalUsedFibersInSleeve(sleeveObj);
        if (usedFibersCount - totalFibers + getFiberCount(newCableType) > maxFibers) {
            showError('Объединение невозможно: новый кабель превысит максимальную вместимость муфты!', 'Переполнение муфты');
            return;
        }
    }

    const cablesList = cablesInfo.map(c => `- ${c.cableDescription} (${c.fiberCount} жил)`).join('\n');
    const confirmMsg = `Объединить кабели в один?\n\n${cablesList}\n\nИтого: ${totalFibers} жил → ${getCableDescription(newCableType)}`;
    
    if (!confirm(confirmMsg)) {
        return;
    }

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

    const success = addCable(sleeveObj, targetObj, newCableType);
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

    cablesInfo.forEach(info => {
        deleteCableByUniqueId(info.cable.properties.get('uniqueId'));
    });

    document.getElementById('infoModal').style.display = 'none';
    showObjectInfo(sleeveObj);
    
    showSuccess(`Кабели успешно объединены в ${getCableDescription(newCableType)}`, 'Объединение кабелей');
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

    showObjectInfo(currentModalObject);
}

function getFiberColors(cableType) {
    const fiberColors = [
        { number: 1, name: 'Синий', color: '#0000FF' },
        { number: 2, name: 'Оранжевый', color: '#FF8C00' },
        { number: 3, name: 'Зеленый', color: '#00FF00' },
        { number: 4, name: 'Коричневый', color: '#8B4513' },
        { number: 5, name: 'Серый', color: '#808080' },
        { number: 6, name: 'Белый', color: '#FFFFFF' },
        { number: 7, name: 'Красный', color: '#FF0000' },
        { number: 8, name: 'Черный', color: '#000000' },
        { number: 9, name: 'Желтый', color: '#FFFF00' },
        { number: 10, name: 'Фиолетовый', color: '#800080' },
        { number: 11, name: 'Розовый', color: '#FFC0CB' },
        { number: 12, name: 'Голубой', color: '#00CED1' },
        { number: 13, name: 'Оливковый', color: '#808000' },
        { number: 14, name: 'Темно-синий', color: '#00008B' },
        { number: 15, name: 'Бирюзовый', color: '#40E0D0' },
        { number: 16, name: 'Темно-зеленый', color: '#006400' },
        { number: 17, name: 'Малиновый', color: '#DC143C' },
        { number: 18, name: 'Коричневый', color: '#A52A2A' },
        { number: 19, name: 'Лимонный', color: '#FFFACD' },
        { number: 20, name: 'Темно-красный', color: '#8B0000' },
        { number: 21, name: 'Лазурный', color: '#007FFF' },
        { number: 22, name: 'Золотой', color: '#FFD700' },
        { number: 23, name: 'Медный', color: '#B87333' },
        { number: 24, name: 'Серебряный', color: '#C0C0C0' }
    ];
    
    let fiberCount = 0;
    switch(cableType) {
        case 'fiber4': fiberCount = 4; break;
        case 'fiber8': fiberCount = 8; break;
        case 'fiber16': fiberCount = 16; break;
        case 'fiber24': fiberCount = 24; break;
        default: return [];
    }
    
    return fiberColors.slice(0, fiberCount);
}

function setupNetBoxEventListeners() {
    
    document.getElementById('netboxConfigBtn').addEventListener('click', function() {
        const modal = document.getElementById('netboxConfigModal');
        document.getElementById('netboxUrl').value = netboxConfig.url || '';
        document.getElementById('netboxToken').value = netboxConfig.token || '';
        document.getElementById('netboxIgnoreSSL').checked = netboxConfig.ignoreSSL || false;
        document.getElementById('netboxStatus').textContent = '';
        modal.style.display = 'block';
    });

    document.querySelector('.close-netbox').addEventListener('click', function() {
        document.getElementById('netboxConfigModal').style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        const modal = document.getElementById('netboxConfigModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    document.getElementById('testNetboxConnection').addEventListener('click', testNetBoxConnection);

    document.getElementById('saveNetboxConfig').addEventListener('click', function() {
        const url = document.getElementById('netboxUrl').value.trim();
        const token = document.getElementById('netboxToken').value.trim();
        const ignoreSSL = document.getElementById('netboxIgnoreSSL').checked;

        if (!url || !token) {
            showNetBoxStatus('Заполните все поля', 'error');
            return;
        }

        netboxConfig.url = url.replace(/\/$/, ''); 
        netboxConfig.token = token;
        netboxConfig.ignoreSSL = ignoreSSL;
        saveNetBoxConfig();
        showNetBoxStatus('Конфигурация сохранена', 'success');
        
        setTimeout(() => {
            document.getElementById('netboxConfigModal').style.display = 'none';
        }, 1500);
    });

    document.getElementById('netboxImportBtn').addEventListener('click', function() {
        if (!netboxConfig.url || !netboxConfig.token) {
            return;
        }
        openNetBoxImportModal();
    });

    document.querySelector('.close-import').addEventListener('click', function() {
        document.getElementById('netboxImportModal').style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        const modal = document.getElementById('netboxImportModal');
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });

    document.getElementById('selectAllDevices').addEventListener('click', function() {
        document.querySelectorAll('#netboxDevicesList input[type="checkbox"]').forEach(cb => {
            cb.checked = true;
        });
    });

    document.getElementById('deselectAllDevices').addEventListener('click', function() {
        document.querySelectorAll('#netboxDevicesList input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    });

    document.getElementById('importSelectedDevices').addEventListener('click', importSelectedNetBoxDevices);
}

function loadNetBoxConfig() {
    try {
        var saved = sessionStorage.getItem('netboxConfig');
        if (saved) netboxConfig = JSON.parse(saved);
    } catch (e) { console.error('Ошибка загрузки конфигурации NetBox:', e); }
}

function saveNetBoxConfig() {
    try { sessionStorage.setItem('netboxConfig', JSON.stringify(netboxConfig)); } catch (e) {}
}

function showNetBoxStatus(message, type) {
    const statusEl = document.getElementById('netboxStatus');
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    if (type === 'success') {
        statusEl.style.color = '#22c55e';
    } else if (type === 'error') {
        statusEl.style.color = '#ef4444';
    } else {
        statusEl.style.color = '#3b82f6';
    }
}

async function netboxFetch(url, options = {}) {

    if (netboxConfig.ignoreSSL) {

        try {
            
            return await fetch(url, options);
        } catch (error) {
            
            if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
                console.warn('SSL ошибка обнаружена. В браузере нельзя отключить проверку SSL. Используйте Electron или настройте сертификат.');
                throw new Error('Ошибка SSL сертификата. В браузере нельзя отключить проверку SSL. Для работы с самоподписанными сертификатами используйте Electron или настройте браузер.');
            }
            throw error;
        }
    } else {
        return await fetch(url, options);
    }
}

async function testNetBoxConnection() {
    const url = document.getElementById('netboxUrl').value.trim();
    const token = document.getElementById('netboxToken').value.trim();
    const ignoreSSL = document.getElementById('netboxIgnoreSSL').checked;

    if (!url || !token) {
        showNetBoxStatus('Заполните все поля', 'error');
        return;
    }

    showNetBoxStatus('Проверка подключения...', 'info');

    try {
        
        const originalIgnoreSSL = netboxConfig.ignoreSSL;
        netboxConfig.ignoreSSL = ignoreSSL;
        
        const response = await netboxFetch(`${url}/api/dcim/devices/?limit=1`, {
            method: 'GET',
            headers: {
                'Authorization': `Token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        netboxConfig.ignoreSSL = originalIgnoreSSL;

        if (response.ok) {
            showNetBoxStatus('Подключение успешно!', 'success');
        } else if (response.status === 401) {
            showNetBoxStatus('Ошибка: Неверный токен API', 'error');
        } else if (response.status === 404) {
            showNetBoxStatus('Ошибка: Сервер не найден. Проверьте URL', 'error');
        } else {
            showNetBoxStatus(`Ошибка: ${response.status} ${response.statusText}`, 'error');
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.message && (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('TLS'))) {
            errorMessage = 'Ошибка SSL сертификата. В браузере нельзя отключить проверку SSL. Для работы с самоподписанными сертификатами используйте Electron или настройте браузер.';
        }
        showNetBoxStatus(`Ошибка подключения: ${errorMessage}`, 'error');
        console.error('NetBox connection error:', error);
    }
}

async function openNetBoxImportModal() {
    const modal = document.getElementById('netboxImportModal');
    const devicesList = document.getElementById('netboxDevicesList');
    
    devicesList.innerHTML = '<div style="text-align: center; padding: 20px;">Загрузка устройств...</div>';
    modal.style.display = 'block';

    try {
        await fetchNetBoxDevices();
        showNetBoxDevices();
    } catch (error) {
        const errMsg = (error && error.message) ? String(error.message) : 'Неизвестная ошибка';
        devicesList.innerHTML = '<div style="color: #ef4444; padding: 20px;">Ошибка загрузки устройств: ' + escapeHtml(errMsg) + '</div>';
    }
}

async function fetchNetBoxDevices() {
    netboxDevices = [];
    let nextUrl = `${netboxConfig.url}/api/dcim/devices/?limit=100`;

    try {
        while (nextUrl) {
            const response = await netboxFetch(nextUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Token ${netboxConfig.token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.results && Array.isArray(data.results)) {
                netboxDevices = netboxDevices.concat(data.results);
            }

            nextUrl = data.next || null;
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств из NetBox:', error);
        throw error;
    }
}

function showNetBoxDevices() {
    const devicesList = document.getElementById('netboxDevicesList');

    if (netboxDevices.length === 0) {
        devicesList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">Устройства не найдены</div>';
        return;
    }

    let html = '<div style="max-height: 400px; overflow-y: auto; margin-bottom: 15px;">';
    html += '<table style="width: 100%; border-collapse: collapse;">';
    html += '<thead><tr style="background: var(--bg-tertiary); position: sticky; top: 0;">';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border-color); width: 40px; color: var(--text-primary);"><input type="checkbox" id="selectAllCheckbox"></th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border-color); color: var(--text-primary);">Имя</th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border-color); color: var(--text-primary);">Тип</th>';
    html += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid var(--border-color); color: var(--text-primary);">Местоположение</th>';
    html += '</tr></thead><tbody>';

    netboxDevices.forEach((device, index) => {
        const name = device.name || device.display || `Устройство #${device.id}`;
        const deviceType = device.device_type?.model || 'Не указан';
        const location = device.site?.name || device.location?.name || 'Не указано';
        const hasCoords = device.site?.latitude && device.site?.longitude;

        html += `<tr style="border-bottom: 1px solid #dee2e6;">`;
        const disabledAttr = hasCoords ? '' : 'disabled title="У устройства нет координат"';
        html += `<td style="padding: 10px;"><input type="checkbox" class="device-checkbox" data-index="${index}" ${disabledAttr}></td>`;
        html += `<td style="padding: 10px;">${escapeHtml(name)}</td>`;
        html += `<td style="padding: 10px;">${escapeHtml(deviceType)}</td>`;
        html += `<td style="padding: 10px;">${escapeHtml(location)}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table></div>';

    devicesList.innerHTML = html;

    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            document.querySelectorAll('.device-checkbox:not(:disabled)').forEach(cb => {
                cb.checked = this.checked;
            });
        });
    }
}

function importSelectedNetBoxDevices() {
    if (!isEditMode) {
        return;
    }

    const selectedCheckboxes = document.querySelectorAll('.device-checkbox:checked:not(:disabled)');
    
    if (selectedCheckboxes.length === 0) {
        return;
    }

    let importedCount = 0;
    let skippedCount = 0;

    selectedCheckboxes.forEach(checkbox => {
        const index = parseInt(checkbox.getAttribute('data-index'));
        const device = netboxDevices[index];

        if (!device) return;

        const site = device.site;
        if (!site || !site.latitude || !site.longitude) {
            skippedCount++;
            return;
        }

        const coords = [parseFloat(site.latitude), parseFloat(site.longitude)];
        const deviceName = device.name || device.display || `NetBox-${device.id}`;

        const existingNode = objects.find(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('name') === deviceName
        );

        if (existingNode) {
            skippedCount++;
            return;
        }

        createObject('node', deviceName, coords);

        const nodeObj = objects[objects.length - 1];
        if (nodeObj && nodeObj.properties) {
            nodeObj.properties.set('netboxId', device.id);
            nodeObj.properties.set('netboxUrl', `${netboxConfig.url}/dcim/devices/${device.id}/`);
            nodeObj.properties.set('netboxDeviceType', device.device_type?.model || '');
            nodeObj.properties.set('netboxSite', site.name || '');
        }

        importedCount++;
    });

    document.getElementById('netboxImportModal').style.display = 'none';

    if (importedCount > 0) {
        const importedNodes = objects.filter(obj => 
            obj.properties && 
            obj.properties.get('type') === 'node' &&
            obj.properties.get('netboxId')
        );
        
        if (importedNodes.length > 0) {
            const bounds = importedNodes.map(node => node.geometry.getCoordinates());
            myMap.setBounds(myMap.geoObjects.getBounds(), {
                checkZoomRange: true
            });
        }
    }
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
    if (!confirm('Восстановить данные от ' + dateLabel + '? Текущие данные будут заменены. После восстановления обновите страницу.')) return;
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
            if (typeof showSuccess === 'function') showSuccess('Данные восстановлены. Войдите снова.');
            else alert('Данные восстановлены. Войдите снова.');
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
}

function setupAccordions() {
    const accordionHeaders = document.querySelectorAll('.accordion-header');
    
    accordionHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const accordionSection = this.parentElement;
            const isActive = accordionSection.classList.contains('active');

            document.querySelectorAll('.accordion-section').forEach(section => {
                section.classList.remove('active');
            });

            if (!isActive) {
                accordionSection.classList.add('active');
            }
        });
    });

    const firstAccordion = document.querySelector('.accordion-section');
    if (firstAccordion) {
        firstAccordion.classList.add('active');
    }
}

setTimeout(() => {
    updateUIForMode();
    updateEditControls();
    updateStats();
    updateCableVisualization();
    updateAllConnectionLines();
}, 100);
