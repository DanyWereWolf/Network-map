/**
 * Синхронизация карты между несколькими пользователями (WebSocket).
 * Отправка только при изменениях на карте (вызов saveData); короткий debounce только для объединения быстрых правок.
 */
(function() {
    var ws = null;
    var myClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var SYNC_URL_KEY = 'networkMap_syncUrl';
    var SEND_DEBOUNCE_MS = 400;
    var sendTimer = null;
    var pendingState = null;
    var reconnectTimer = null;
    var reconnectAttempts = 0;
    var maxReconnectAttempts = 10;
    var reconnectDelayMs = 2000;
    var userRequestedDisconnect = false;

    function getDefaultSyncUrl() {
        if (typeof window !== 'undefined' && window.location && window.location.host) {
            var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return protocol + '//' + window.location.host + '/sync';
        }
        return 'ws://localhost:3000/sync';
    }

    function updateSyncUIStatus(connected, errorText) {
        var statusEl = document.getElementById('syncStatus');
        var btn = document.getElementById('syncConnectBtn');
        if (statusEl) {
            statusEl.textContent = connected ? 'Подключено' : (errorText || 'Отключено');
            statusEl.className = 'sync-status ' + (connected ? 'sync-connected' : 'sync-disconnected');
        }
        if (btn) {
            btn.textContent = connected ? 'Отключиться' : 'Подключиться';
            btn.disabled = false;
        }
    }

    function updateSyncOnlineList(clients) {
        var el = document.getElementById('syncOnlineList');
        if (!el) return;
        if (!clients || clients.length === 0) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        var parts = clients.map(function(c) {
            return c.id === myClientId ? 'вы' : (c.displayName || 'Участник');
        });
        el.textContent = 'В сети: ' + parts.length + ' — ' + parts.join(', ');
        el.style.display = 'block';
    }

    function forceSendState() {
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = null;
        var toSend = pendingState;
        pendingState = null;
        if (ws && ws.readyState === WebSocket.OPEN && toSend) {
            try {
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: toSend }));
            } catch (e) {}
        }
    }

    function loadSavedSyncUrl() {
        var urlInput = document.getElementById('syncServerUrl');
        if (!urlInput) return;
        try {
            var saved = sessionStorage.getItem(SYNC_URL_KEY);
            if (saved && saved.trim()) urlInput.value = saved.trim();
            else urlInput.placeholder = getDefaultSyncUrl();
        } catch (e) {}
    }

    function connect() {
        var urlInput = document.getElementById('syncServerUrl');
        var url = (urlInput && urlInput.value) ? urlInput.value.trim() : '';
        if (!url) url = getDefaultSyncUrl();
        if (ws && ws.readyState === WebSocket.OPEN) {
            disconnect();
            return;
        }
        userRequestedDisconnect = false;
        var btn = document.getElementById('syncConnectBtn');
        if (btn) btn.disabled = true;
        updateSyncUIStatus(false, 'Подключение…');
        try {
            ws = new WebSocket(url);
        } catch (e) {
            updateSyncUIStatus(false, 'Ошибка: ' + (e.message || e));
            if (btn) btn.disabled = false;
            return;
        }
        ws.onopen = function() {
            reconnectAttempts = 0;
            try { sessionStorage.setItem(SYNC_URL_KEY, url); } catch (e) {}
            window.syncIsConnected = true;
            updateSyncUIStatus(true);
            if (typeof window.hideSyncRequiredOverlay === 'function') window.hideSyncRequiredOverlay();
            if (typeof getSerializedData === 'function') {
                var data = getSerializedData();
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: data }));
            }
            var displayName = 'Участник';
            if (typeof currentUser !== 'undefined' && currentUser) {
                displayName = (currentUser.fullName || currentUser.username || displayName).toString().trim().slice(0, 100) || displayName;
            }
            try {
                ws.send(JSON.stringify({ type: 'hello', displayName: displayName }));
            } catch (e) {}
            if (btn) btn.disabled = false;
        };
        ws.onclose = function() {
            ws = null;
            window.syncIsConnected = false;
            updateSyncUIStatus(false);
            updateSyncOnlineList([]);
            if (btn) btn.disabled = false;
            if (typeof window.showSyncRequiredOverlay === 'function') window.showSyncRequiredOverlay();
            if (!userRequestedDisconnect) scheduleReconnect();
        };
        ws.onerror = function() {
            updateSyncUIStatus(false, 'Ошибка соединения');
        };
        ws.onmessage = function(event) {
            try {
                var msg = JSON.parse(event.data);
                if (msg.type === 'clients' && Array.isArray(msg.clients)) {
                    updateSyncOnlineList(msg.clients);
                    return;
                }
                if (msg.type === 'state' && Array.isArray(msg.data) && typeof applyRemoteState === 'function') {
                    var data = msg.data;
                    var hasPending = !!pendingState;
                    if (hasPending) {
                        var applyServer = confirm('Карта обновлена с сервера. Применить изменения с сервера?\n(Ваши несохранённые правки будут заменены.)');
                        if (applyServer) {
                            if (sendTimer) { clearTimeout(sendTimer); sendTimer = null; }
                            pendingState = null;
                            applyRemoteState(data);
                            updateSyncUIStatus(true);
                            if (typeof window.hideSyncRequiredOverlay === 'function') window.hideSyncRequiredOverlay();
                        } else {
                            forceSendState();
                        }
                        return;
                    }
                    updateSyncUIStatus(true, 'Обновление карты…');
                    setTimeout(function() {
                        try {
                            applyRemoteState(data);
                            updateSyncUIStatus(true);
                            if (typeof window.hideSyncRequiredOverlay === 'function') window.hideSyncRequiredOverlay();
                        } catch (e) { updateSyncUIStatus(true); }
                    }, 0);
                }
            } catch (e) {}
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer || !sessionStorage.getItem(SYNC_URL_KEY)) return;
        if (reconnectAttempts >= maxReconnectAttempts) return;
        reconnectAttempts++;
        reconnectTimer = setTimeout(function() {
            reconnectTimer = null;
            connect();
        }, reconnectDelayMs);
    }

    function disconnect() {
        userRequestedDisconnect = true;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        reconnectAttempts = maxReconnectAttempts;
        if (ws) {
            ws.close();
            ws = null;
        }
        updateSyncUIStatus(false);
    }

    function sendState(data) {
        if (!data) return;
        pendingState = data;
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = setTimeout(function() {
            sendTimer = null;
            var toSend = pendingState;
            pendingState = null;
            if (ws && ws.readyState === WebSocket.OPEN && toSend) {
                try {
                    ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: toSend }));
                } catch (e) {}
            }
        }, SEND_DEBOUNCE_MS);
    }

    function autoConnectIfSaved() {
        try {
            var saved = sessionStorage.getItem(SYNC_URL_KEY);
            if (saved && saved.trim()) connect();
        } catch (e) {}
    }

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            loadSavedSyncUrl();
            setTimeout(autoConnectIfSaved, 1200);
        });
    } else {
        loadSavedSyncUrl();
        setTimeout(autoConnectIfSaved, 1200);
    }

    window.syncSendState = sendState;
    window.syncConnect = connect;
    window.syncDisconnect = disconnect;
    window.syncAutoConnectIfSaved = autoConnectIfSaved;
    window.syncForceSendState = forceSendState;
})();
