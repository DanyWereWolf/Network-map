var MAX_HISTORY_ENTRIES = Infinity;

var ActionTypes = {
    CREATE_OBJECT: 'create_object',
    DELETE_OBJECT: 'delete_object',
    EDIT_OBJECT: 'edit_object',
    MOVE_OBJECT: 'move_object',
    CREATE_CABLE: 'create_cable',
    DELETE_CABLE: 'delete_cable',
    EDIT_CABLE: 'edit_cable',
    MERGE_CABLES: 'merge_cables',
    CONNECT_FIBERS: 'connect_fibers',
    DISCONNECT_FIBERS: 'disconnect_fibers',
    CONNECT_TO_NODE: 'connect_to_node',
    DISCONNECT_FROM_NODE: 'disconnect_from_node',
    IMPORT_DATA: 'import_data',
    EXPORT_DATA: 'export_data',
    CLEAR_MAP: 'clear_map',
    USER_LOGIN: 'user_login',
    USER_CREATED: 'user_created',
    USER_APPROVED: 'user_approved',
    USER_REJECTED: 'user_rejected',
    USER_DELETED: 'user_deleted'
};

var ActionNames = {};
ActionNames[ActionTypes.CREATE_OBJECT] = 'Создание объекта';
ActionNames[ActionTypes.DELETE_OBJECT] = 'Удаление объекта';
ActionNames[ActionTypes.EDIT_OBJECT] = 'Редактирование объекта';
ActionNames[ActionTypes.MOVE_OBJECT] = 'Перемещение объекта';
ActionNames[ActionTypes.CREATE_CABLE] = 'Прокладка кабеля';
ActionNames[ActionTypes.DELETE_CABLE] = 'Удаление кабеля';
ActionNames[ActionTypes.EDIT_CABLE] = 'Редактирование кабеля';
ActionNames[ActionTypes.MERGE_CABLES] = 'Объединение кабелей';
ActionNames[ActionTypes.CONNECT_FIBERS] = 'Соединение жил';
ActionNames[ActionTypes.DISCONNECT_FIBERS] = 'Разъединение жил';
ActionNames[ActionTypes.CONNECT_TO_NODE] = 'Подключение к узлу';
ActionNames[ActionTypes.DISCONNECT_FROM_NODE] = 'Отключение от узла';
ActionNames[ActionTypes.IMPORT_DATA] = 'Импорт данных';
ActionNames[ActionTypes.EXPORT_DATA] = 'Экспорт данных';
ActionNames[ActionTypes.CLEAR_MAP] = 'Очистка карты';
ActionNames[ActionTypes.USER_LOGIN] = 'Вход в систему';
ActionNames[ActionTypes.USER_CREATED] = 'Создание пользователя';
ActionNames[ActionTypes.USER_APPROVED] = 'Одобрение заявки';
ActionNames[ActionTypes.USER_REJECTED] = 'Отклонение заявки';
ActionNames[ActionTypes.USER_DELETED] = 'Удаление пользователя';

var ActionIcons = {};
ActionIcons[ActionTypes.CREATE_OBJECT] = '➕';
ActionIcons[ActionTypes.DELETE_OBJECT] = '🗑️';
ActionIcons[ActionTypes.EDIT_OBJECT] = '✏️';
ActionIcons[ActionTypes.MOVE_OBJECT] = '📍';
ActionIcons[ActionTypes.CREATE_CABLE] = '🔗';
ActionIcons[ActionTypes.DELETE_CABLE] = '✂️';
ActionIcons[ActionTypes.EDIT_CABLE] = '✏️';
ActionIcons[ActionTypes.MERGE_CABLES] = '🔀';
ActionIcons[ActionTypes.CONNECT_FIBERS] = '🔌';
ActionIcons[ActionTypes.DISCONNECT_FIBERS] = '⚡';
ActionIcons[ActionTypes.CONNECT_TO_NODE] = '🖥️';
ActionIcons[ActionTypes.DISCONNECT_FROM_NODE] = '🔓';
ActionIcons[ActionTypes.IMPORT_DATA] = '📥';
ActionIcons[ActionTypes.EXPORT_DATA] = '📤';
ActionIcons[ActionTypes.CLEAR_MAP] = '🧹';
ActionIcons[ActionTypes.USER_LOGIN] = '🔑';
ActionIcons[ActionTypes.USER_CREATED] = '👤';
ActionIcons[ActionTypes.USER_APPROVED] = '✅';
ActionIcons[ActionTypes.USER_REJECTED] = '❌';
ActionIcons[ActionTypes.USER_DELETED] = '🚫';

var HistoryCategories = {
    map: [
        ActionTypes.CREATE_OBJECT, ActionTypes.DELETE_OBJECT, ActionTypes.EDIT_OBJECT,
        ActionTypes.MOVE_OBJECT, ActionTypes.CLEAR_MAP, ActionTypes.IMPORT_DATA, ActionTypes.EXPORT_DATA
    ],
    cable: [
        ActionTypes.CREATE_CABLE, ActionTypes.DELETE_CABLE, ActionTypes.EDIT_CABLE, ActionTypes.MERGE_CABLES
    ],
    fiber: [
        ActionTypes.CONNECT_FIBERS, ActionTypes.DISCONNECT_FIBERS,
        ActionTypes.CONNECT_TO_NODE, ActionTypes.DISCONNECT_FROM_NODE
    ],
    users: [
        ActionTypes.USER_LOGIN, ActionTypes.USER_CREATED, ActionTypes.USER_APPROVED,
        ActionTypes.USER_REJECTED, ActionTypes.USER_DELETED
    ]
};

var HistoryActionGroups = [
    { label: 'Объекты на карте', types: HistoryCategories.map },
    { label: 'Кабели', types: HistoryCategories.cable },
    { label: 'Жилы и подключения', types: HistoryCategories.fiber },
    { label: 'Пользователи', types: HistoryCategories.users }
];

var _historyMemory = [];
var HISTORY_SEEN_STORAGE_KEY = 'networkMap:lastHistorySeenAt';

function getLastHistorySeenAt() {
    try {
        if (typeof localStorage === 'undefined') return null;
        var raw = localStorage.getItem(HISTORY_SEEN_STORAGE_KEY);
        if (!raw) return null;
        var dt = new Date(raw);
        return isNaN(dt.getTime()) ? null : dt;
    } catch (e) {
        return null;
    }
}

function setLastHistorySeenAt(date) {
    try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(HISTORY_SEEN_STORAGE_KEY, date.toISOString());
    } catch (e) {}
}

function getHistory() {
    return _historyMemory.slice ? _historyMemory.slice() : [];
}

function saveHistory(history) {
    if (history.length > MAX_HISTORY_ENTRIES) {
        history = history.slice(-MAX_HISTORY_ENTRIES);
    }
    _historyMemory = history;
    if (typeof window.postHistoryToApi === 'function') window.postHistoryToApi(history);
    updateHistoryBadge();
}

function setHistoryFromApi(arr) {
    _historyMemory = Array.isArray(arr) ? arr.slice() : [];
    updateHistoryBadge();
}

function logAction(actionType, details) {
    details = details || {};
    var history = getHistory();
    var userInfo = (typeof currentUser !== 'undefined' && currentUser) ? {
        id: currentUser.userId,
        username: currentUser.username,
        fullName: currentUser.fullName
    } : null;
    var entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        actionType: actionType,
        actionName: ActionNames[actionType] || actionType,
        icon: ActionIcons[actionType] || '📝',
        user: userInfo,
        details: details
    };
    history.push(entry);
    saveHistory(history);
    return entry;
}

function clearHistory() {
    _historyMemory = [];
    if (typeof window.postHistoryToApi === 'function') window.postHistoryToApi([]);
    updateHistoryBadge();
}

function updateHistoryBadge() {
    var badge = document.getElementById('historyBadge');
    if (badge) {
        var history = getHistory();
        var lastSeenAt = getLastHistorySeenAt();
        var unreadCount = lastSeenAt
            ? history.filter(function(h) { return new Date(h.timestamp) > lastSeenAt; }).length
            : history.length;
        var displayCount = unreadCount > 999 ? '999+' : unreadCount;
        badge.textContent = displayCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
}

function formatHistoryTime(isoString) {
    var date = new Date(isoString);
    var now = new Date();
    var diff = now - date;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' мин. назад';
    if (date.toDateString() === now.toDateString()) {
        return 'сегодня в ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'вчера в ' + date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function getHistoryActionTone(actionType) {
    switch (actionType) {
        case ActionTypes.CREATE_OBJECT:
        case ActionTypes.CREATE_CABLE:
        case ActionTypes.CONNECT_FIBERS:
        case ActionTypes.CONNECT_TO_NODE:
        case ActionTypes.USER_CREATED:
        case ActionTypes.USER_APPROVED:
        case ActionTypes.IMPORT_DATA:
            return 'success';
        case ActionTypes.DELETE_OBJECT:
        case ActionTypes.DELETE_CABLE:
        case ActionTypes.DISCONNECT_FIBERS:
        case ActionTypes.DISCONNECT_FROM_NODE:
        case ActionTypes.USER_REJECTED:
        case ActionTypes.USER_DELETED:
        case ActionTypes.CLEAR_MAP:
            return 'danger';
        case ActionTypes.MOVE_OBJECT:
        case ActionTypes.MERGE_CABLES:
        case ActionTypes.USER_LOGIN:
            return 'warn';
        default:
            return 'info';
    }
}

function getHistoryCategoryLabel(category) {
    if (category === 'map') return 'Карта';
    if (category === 'cable') return 'Кабели';
    if (category === 'fiber') return 'Жилы';
    if (category === 'users') return 'Пользователи';
    return '';
}

function historyAvatarSrcFromUrl(avatarUrl) {
    if (!avatarUrl || typeof getApiBase !== 'function' || typeof getAuthToken !== 'function') return '';
    var base = getApiBase() || '';
    var path = avatarUrl.charAt(0) === '/' ? avatarUrl : '/' + avatarUrl;
    var url = base ? (base.replace(/\/$/, '') + path) : path;
    var token = getAuthToken();
    if (token) url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
    return url;
}

function buildHistoryMetaAvatarHtml(entry) {
    if (!entry.user) {
        return '<span class="history-meta-avatar history-meta-avatar--system" aria-hidden="true">С</span>';
    }
    var initial = String(entry.user.fullName || entry.user.username || '?').charAt(0).toUpperCase();
    var avatarUrl = null;
    if (entry.user.id && typeof AuthSystem !== 'undefined' && AuthSystem.getUsers) {
        var users = AuthSystem.getUsers();
        var u = users.find(function(x) { return String(x.id) === String(entry.user.id); });
        if (u && u.avatarUrl) avatarUrl = u.avatarUrl;
    }
    if (avatarUrl && typeof getApiBase === 'function' && getApiBase() && typeof getAuthToken === 'function' && getAuthToken()) {
        var src = escapeHtml(historyAvatarSrcFromUrl(avatarUrl));
        return '<span class="history-meta-avatar has-avatar-image"><img class="avatar-img" src="' + src + '" alt=""></span>';
    }
    return '<span class="history-meta-avatar" aria-hidden="true">' + escapeHtml(initial) + '</span>';
}

function countActiveHistoryFilters(state) {
    var n = 0;
    if (!state) return 0;
    if (state.search) n++;
    if (state.user) n++;
    if (state.actionType) n++;
    if (state.category) n++;
    if (state.dateFilter && state.dateFilter !== 'all') n++;
    if (state.dateFrom || state.dateTo) n++;
    return n;
}

function updateHistoryModalSummary(totalCount, filteredCount, state) {
    var totalEl = document.getElementById('historyTotalCount');
    var metaEl = document.getElementById('historyFilteredMeta');
    var badgeEl = document.getElementById('historyFilterBadge');
    if (totalEl) totalEl.textContent = String(totalCount);
    if (metaEl) {
        if (filteredCount === totalCount) {
            metaEl.textContent = totalCount ? 'Показаны все записи' : 'Пока нет событий на карте';
        } else {
            metaEl.textContent = 'Показано ' + filteredCount + ' из ' + totalCount;
        }
    }
    var activeFilters = countActiveHistoryFilters(state);
    if (badgeEl) {
        if (activeFilters > 0) {
            badgeEl.textContent = String(activeFilters);
            badgeEl.hidden = false;
        } else {
            badgeEl.hidden = true;
        }
    }
    var clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        var isAdmin = typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
        clearBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }
}

function openHistoryModal() {
    var modal = document.getElementById('historyModal');
    if (modal) {
        modal.style.display = 'block';
        buildHistoryFilterOptions();
        renderHistoryList();
        setLastHistorySeenAt(new Date());
        updateHistoryBadge();
    }
}

function closeHistoryModal() {
    var modal = document.getElementById('historyModal');
    if (modal) modal.style.display = 'none';
}

function formatHistoryDetails(entry) {
    var d = entry.details || {};
    switch (entry.actionType) {
        case ActionTypes.CREATE_OBJECT:
        case ActionTypes.DELETE_OBJECT:
        case ActionTypes.EDIT_OBJECT:
            return (getObjectTypeName(d.objectType) || d.objectType) + ': "' + (d.name || 'без имени') + '"';
        case ActionTypes.CREATE_CABLE:
        case ActionTypes.DELETE_CABLE:
            return (d.cableType || 'Кабель') + ': ' + (d.from || '?') + ' → ' + (d.to || '?');
        case ActionTypes.CONNECT_FIBERS:
            return 'Жила ' + (d.fromFiber || '?') + ' → Жила ' + (d.toFiber || '?');
        case ActionTypes.DISCONNECT_FIBERS:
            return 'Жила ' + (d.fromFiber || '?') + ' ↔ Жила ' + (d.toFiber || '?');
        case ActionTypes.CONNECT_TO_NODE:
            return 'Жила ' + (d.fiberNumber || '?') + ' → ' + (d.nodeName || 'узел');
        case ActionTypes.DISCONNECT_FROM_NODE:
            return 'Жила ' + (d.fiberNumber || '?') + ' от ' + (d.nodeName || 'узла');
        case ActionTypes.IMPORT_DATA:
        case ActionTypes.EXPORT_DATA:
            return (d.count || 0) + ' объектов';
        case ActionTypes.CLEAR_MAP:
            return 'Удалено ' + (d.count || 0) + ' объектов';
        case ActionTypes.USER_CREATED:
        case ActionTypes.USER_APPROVED:
        case ActionTypes.USER_REJECTED:
        case ActionTypes.USER_DELETED:
            return d.username || '';
        case ActionTypes.USER_LOGIN:
            return '';
        default:
            return d.description || '';
    }
}

function getHistoryFilterState() {
    var userEl = document.getElementById('historyFilterUser');
    var actionEl = document.getElementById('historyFilterAction');
    var dateFromEl = document.getElementById('historyFilterDateFrom');
    var dateToEl = document.getElementById('historyFilterDateTo');
    var searchEl = document.getElementById('historyFilterSearch');
    var dateFilter = 'all';
    var activeBtn = document.querySelector('.history-period-chips .history-filter-btn.active');
    if (activeBtn) dateFilter = activeBtn.getAttribute('data-filter') || 'all';
    var category = '';
    var catBtn = document.querySelector('.history-category-chip.active');
    if (catBtn) category = catBtn.getAttribute('data-category') || '';
    return {
        user: userEl ? userEl.value : '',
        actionType: actionEl ? actionEl.value : '',
        category: category,
        search: searchEl ? String(searchEl.value || '').trim().toLowerCase() : '',
        dateFilter: dateFilter,
        dateFrom: dateFromEl && dateFromEl.value ? dateFromEl.value : null,
        dateTo: dateToEl && dateToEl.value ? dateToEl.value : null
    };
}

function applyHistoryFiltersToList(history, state) {
    var list = history;
    if (state.category && HistoryCategories[state.category]) {
        var allowed = HistoryCategories[state.category];
        list = list.filter(function(h) { return allowed.indexOf(h.actionType) >= 0; });
    }
    if (state.user) {
        list = list.filter(function(h) {
            var u = h.user;
            if (!u) return state.user === '__system__';
            return (u.username === state.user) || ((u.fullName || u.username) === state.user);
        });
    }
    if (state.actionType) {
        list = list.filter(function(h) { return h.actionType === state.actionType; });
    }
    if (state.search) {
        var q = state.search;
        list = list.filter(function(h) {
            var userName = h.user ? (h.user.fullName || h.user.username || '') : 'Система';
            var details = formatHistoryDetails(h);
            var blob = (h.actionName + ' ' + details + ' ' + userName).toLowerCase();
            return blob.indexOf(q) >= 0;
        });
    }
    var today = new Date();
    if (state.dateFilter === 'today') {
        list = list.filter(function(h) { return new Date(h.timestamp).toDateString() === today.toDateString(); });
    } else if (state.dateFilter === 'week') {
        var weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        list = list.filter(function(h) { return new Date(h.timestamp) >= weekAgo; });
    }
    if (state.dateFrom) {
        var from = new Date(state.dateFrom);
        from.setHours(0, 0, 0, 0);
        list = list.filter(function(h) { return new Date(h.timestamp) >= from; });
    }
    if (state.dateTo) {
        var to = new Date(state.dateTo);
        to.setHours(23, 59, 59, 999);
        list = list.filter(function(h) { return new Date(h.timestamp) <= to; });
    }
    return list;
}

function buildHistoryFilterOptions() {
    var history = getHistory();
    var usersMap = {};
    history.forEach(function(h) {
        var key, label;
        if (h.user) {
            key = h.user.username || '';
            label = h.user.fullName || h.user.username || 'Пользователь';
        } else {
            key = '__system__';
            label = 'Система';
        }
        if (key) usersMap[key] = label;
    });
    var userSelect = document.getElementById('historyFilterUser');
    if (userSelect) {
        var cur = userSelect.value;
        userSelect.innerHTML = '<option value="">Все</option>';
        Object.keys(usersMap).sort().forEach(function(key) {
            var opt = document.createElement('option');
            opt.value = key;
            opt.textContent = usersMap[key];
            if (key === cur) opt.selected = true;
            userSelect.appendChild(opt);
        });
    }
    var actionSelect = document.getElementById('historyFilterAction');
    if (actionSelect) {
        var curAction = actionSelect.value;
        actionSelect.innerHTML = '<option value="">Все</option>';
        HistoryActionGroups.forEach(function(group) {
            var og = document.createElement('optgroup');
            og.label = group.label;
            group.types.forEach(function(type) {
                if (!ActionNames[type]) return;
                var opt = document.createElement('option');
                opt.value = type;
                opt.textContent = ActionNames[type];
                if (type === curAction) opt.selected = true;
                og.appendChild(opt);
            });
            actionSelect.appendChild(og);
        });
    }
}

function renderHistoryList(filter) {
    var container = document.getElementById('historyList');
    if (!container) return;
    var allHistory = getHistory();
    var state;
    if (typeof filter === 'string') {
        state = { dateFilter: filter || 'all', user: '', actionType: '', category: '', search: '', dateFrom: null, dateTo: null };
    } else {
        state = filter && typeof filter === 'object' ? filter : getHistoryFilterState();
    }
    var history = applyHistoryFiltersToList(allHistory, state);
    history = history.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    updateHistoryModalSummary(allHistory.length, history.length, state);
    if (history.length === 0) {
        var emptyMsg = allHistory.length === 0
            ? 'Здесь появятся действия на карте и в учётных записях'
            : 'Нет записей по выбранным фильтрам';
        container.innerHTML = '<div class="history-empty">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
            '<p class="history-empty-title">' + (allHistory.length === 0 ? 'Журнал пуст' : 'Ничего не найдено') + '</p>' +
            '<p>' + escapeHtml(emptyMsg) + '</p></div>';
        return;
    }
    var html = '';
    var currentDate = '';
    history.forEach(function(entry) {
        var entryDate = new Date(entry.timestamp).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
        if (entryDate !== currentDate) {
            currentDate = entryDate;
            html += '<div class="history-date-divider">' + escapeHtml(entryDate) + '</div>';
        }
        var userName = entry.user ? (entry.user.fullName || entry.user.username) : 'Система';
        var detailsText = formatHistoryDetails(entry);
        var tone = getHistoryActionTone(entry.actionType);
        var catLabel = '';
        Object.keys(HistoryCategories).forEach(function(key) {
            if (HistoryCategories[key].indexOf(entry.actionType) >= 0) catLabel = getHistoryCategoryLabel(key);
        });
        html += '<div class="history-item history-item--tone-' + tone + '">' +
            '<div class="history-item-icon" aria-hidden="true">' + escapeHtml(entry.icon) + '</div>' +
            '<div class="history-item-main">' +
            '<div class="history-item-head">' +
            '<div class="history-item-action">' + escapeHtml(entry.actionName) + '</div>' +
            '<time class="history-item-time" datetime="' + escapeHtml(entry.timestamp) + '">' + escapeHtml(formatHistoryTime(entry.timestamp)) + '</time>' +
            '</div>' +
            (detailsText ? '<div class="history-item-details">' + escapeHtml(detailsText) + '</div>' : '') +
            '<div class="history-item-meta">' +
            buildHistoryMetaAvatarHtml(entry) +
            '<span class="history-item-user">' + escapeHtml(userName) + '</span>' +
            (catLabel ? '<span class="history-item-tag">' + escapeHtml(catLabel) + '</span>' : '') +
            '</div></div></div>';
    });
    container.innerHTML = html;
}

function setupHistoryModalHandlers() {
    if (window._historyModalHandlersBound) return;
    window._historyModalHandlersBound = true;
    var closeBtn = document.querySelector('.close-history');
    if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
    var modal = document.getElementById('historyModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeHistoryModal(); });
    var periodBtns = document.querySelectorAll('.history-period-chips .history-filter-btn');
    for (var i = 0; i < periodBtns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                for (var j = 0; j < periodBtns.length; j++) periodBtns[j].classList.remove('active');
                btn.classList.add('active');
                var dateFromEl = document.getElementById('historyFilterDateFrom');
                var dateToEl = document.getElementById('historyFilterDateTo');
                if (dateFromEl) dateFromEl.value = '';
                if (dateToEl) dateToEl.value = '';
                renderHistoryList();
            });
        })(periodBtns[i]);
    }
    var categoryBtns = document.querySelectorAll('.history-category-chip');
    for (var c = 0; c < categoryBtns.length; c++) {
        (function(chip) {
            chip.addEventListener('click', function() {
                for (var k = 0; k < categoryBtns.length; k++) categoryBtns[k].classList.remove('active');
                chip.classList.add('active');
                var actionSelect = document.getElementById('historyFilterAction');
                if (actionSelect) actionSelect.value = '';
                renderHistoryList();
            });
        })(categoryBtns[c]);
    }
    var userSelect = document.getElementById('historyFilterUser');
    if (userSelect) userSelect.addEventListener('change', function() { renderHistoryList(); });
    var actionSelect = document.getElementById('historyFilterAction');
    if (actionSelect) actionSelect.addEventListener('change', function() { renderHistoryList(); });
    var dateFromEl = document.getElementById('historyFilterDateFrom');
    if (dateFromEl) dateFromEl.addEventListener('change', function() {
        periodBtns.forEach(function(b) { b.classList.remove('active'); });
        var allBtn = document.querySelector('.history-period-chips .history-filter-btn[data-filter="all"]');
        if (allBtn) allBtn.classList.remove('active');
        renderHistoryList();
    });
    var dateToEl = document.getElementById('historyFilterDateTo');
    if (dateToEl) dateToEl.addEventListener('change', function() {
        periodBtns.forEach(function(b) { b.classList.remove('active'); });
        renderHistoryList();
    });
    var searchEl = document.getElementById('historyFilterSearch');
    if (searchEl) {
        var searchTimer;
        searchEl.addEventListener('input', function() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() { renderHistoryList(); }, 200);
        });
    }
    var clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            (async function() {
                if (!(await showConfirm('Очистить весь журнал изменений?', 'Очистка журнала', { confirmText: 'Очистить' }))) return;
                clearHistory();
                buildHistoryFilterOptions();
                renderHistoryList();
            })();
        });
    }
}

if (typeof window !== 'undefined') window.setHistoryFromApi = setHistoryFromApi;
