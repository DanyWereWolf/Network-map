/**
 * Синхронизация карты между несколькими пользователями (WebSocket).
 * Адрес сервера сохраняется; отправка состояния с задержкой (debounce), чтобы не лагало при двух пользователях.
 */
(function() {
    var ws = null;
    var myClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var SYNC_URL_KEY = 'networkMap_syncUrl';
    var SEND_DEBOUNCE_MS = 2000;
    var sendTimer = null;
    var pendingState = null;

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
            try { sessionStorage.setItem(SYNC_URL_KEY, url); } catch (e) {}
            updateSyncUIStatus(true);
            if (typeof getSerializedData === 'function') {
                var data = getSerializedData();
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: data }));
            }
            if (btn) btn.disabled = false;
        };
        ws.onclose = function() {
            ws = null;
            updateSyncUIStatus(false);
            if (btn) btn.disabled = false;
            if (typeof window.showSyncRequiredOverlay === 'function') window.showSyncRequiredOverlay();
        };
        ws.onerror = function() {
            updateSyncUIStatus(false, 'Ошибка соединения');
        };
        ws.onmessage = function(event) {
            try {
                var msg = JSON.parse(event.data);
                if (msg.type === 'state' && Array.isArray(msg.data) && typeof applyRemoteState === 'function') {
                    var data = msg.data;
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

    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
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

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSavedSyncUrl);
    } else {
        loadSavedSyncUrl();
    }

    window.syncSendState = sendState;
    window.syncConnect = connect;
    window.syncDisconnect = disconnect;
})();
