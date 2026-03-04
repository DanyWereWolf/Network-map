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
    var dateFilter = 'all';
    var activeBtn = document.querySelector('.history-filter-btn.active');
    if (activeBtn) dateFilter = activeBtn.getAttribute('data-filter') || 'all';
    return {
        user: userEl ? userEl.value : '',
        actionType: actionEl ? actionEl.value : '',
        dateFilter: dateFilter,
        dateFrom: dateFromEl && dateFromEl.value ? dateFromEl.value : null,
        dateTo: dateToEl && dateToEl.value ? dateToEl.value : null
    };
}

function applyHistoryFiltersToList(history, state) {
    var list = history;
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
        Object.keys(ActionNames).forEach(function(type) {
            var opt = document.createElement('option');
            opt.value = type;
            opt.textContent = ActionNames[type];
            if (type === curAction) opt.selected = true;
            actionSelect.appendChild(opt);
        });
    }
}

function renderHistoryList(filter) {
    var container = document.getElementById('historyList');
    if (!container) return;
    var history = getHistory();
    var state;
    if (typeof filter === 'string') {
        state = { dateFilter: filter || 'all', user: '', actionType: '', dateFrom: null, dateTo: null };
    } else {
        state = filter && typeof filter === 'object' ? filter : getHistoryFilterState();
    }
    history = applyHistoryFiltersToList(history, state);
    history = history.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    if (history.length === 0) {
        container.innerHTML = '<div class="history-empty">' +
            '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
            '<p>История пуста</p></div>';
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
        html += '<div class="history-item">' +
            '<div class="history-item-icon">' + escapeHtml(entry.icon) + '</div>' +
            '<div class="history-item-content">' +
            '<div class="history-item-action">' + escapeHtml(entry.actionName) + '</div>' +
            '<div class="history-item-details">' + escapeHtml(detailsText) + '</div>' +
            '<div class="history-item-meta">' +
            '<span class="history-item-user">' + escapeHtml(userName) + '</span>' +
            '<span class="history-item-time">' + formatHistoryTime(entry.timestamp) + '</span>' +
            '</div></div></div>';
    });
    container.innerHTML = html;
}

function setupHistoryModalHandlers() {
    var closeBtn = document.querySelector('.close-history');
    if (closeBtn) closeBtn.addEventListener('click', closeHistoryModal);
    var modal = document.getElementById('historyModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) closeHistoryModal(); });
    var filterBtns = document.querySelectorAll('.history-filter-btn');
    for (var i = 0; i < filterBtns.length; i++) {
        (function(btn) {
            btn.addEventListener('click', function() {
                for (var j = 0; j < filterBtns.length; j++) filterBtns[j].classList.remove('active');
                btn.classList.add('active');
                var dateFromEl = document.getElementById('historyFilterDateFrom');
                var dateToEl = document.getElementById('historyFilterDateTo');
                if (dateFromEl) dateFromEl.value = '';
                if (dateToEl) dateToEl.value = '';
                renderHistoryList();
            });
        })(filterBtns[i]);
    }
    var userSelect = document.getElementById('historyFilterUser');
    if (userSelect) userSelect.addEventListener('change', function() { renderHistoryList(); });
    var actionSelect = document.getElementById('historyFilterAction');
    if (actionSelect) actionSelect.addEventListener('change', function() { renderHistoryList(); });
    var dateFromEl = document.getElementById('historyFilterDateFrom');
    if (dateFromEl) dateFromEl.addEventListener('change', function() { renderHistoryList(); });
    var dateToEl = document.getElementById('historyFilterDateTo');
    if (dateToEl) dateToEl.addEventListener('change', function() { renderHistoryList(); });
    var clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            (async function() {
                if (!(await showConfirm('Очистить всю историю изменений?', 'Очистка истории', { confirmText: 'Очистить' }))) return;
                clearHistory();
                buildHistoryFilterOptions();
                renderHistoryList();
            })();
        });
    }
}

if (typeof window !== 'undefined') window.setHistoryFromApi = setHistoryFromApi;
