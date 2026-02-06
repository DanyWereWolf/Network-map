/**
 * Синхронизация карты между несколькими пользователями (WebSocket).
 * При изменении карты состояние отправляется на сервер и рассылается остальным.
 */
(function() {
    var ws = null;
    var myClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var reconnectTimer = null;
    var reconnectAttempts = 0;
    var maxReconnectAttempts = 5;

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

    function connect() {
        var urlInput = document.getElementById('syncServerUrl');
        var url = (urlInput && urlInput.value) ? urlInput.value.trim() : '';
        if (!url) {
            if (typeof showWarning === 'function') showWarning('Введите адрес сервера синхронизации (например ws://localhost:8765)', 'Синхронизация');
            return;
        }
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
            reconnectAttempts = 0;
            updateSyncUIStatus(true);
            if (typeof getSerializedData === 'function') {
                var data = getSerializedData();
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: data }));
            }
        };
        ws.onclose = function() {
            ws = null;
            updateSyncUIStatus(false);
            if (btn) btn.disabled = false;
        };
        ws.onerror = function() {
            updateSyncUIStatus(false, 'Ошибка соединения');
        };
        ws.onmessage = function(event) {
            try {
                var msg = JSON.parse(event.data);
                if (msg.type === 'state' && msg.clientId !== myClientId && Array.isArray(msg.data) && typeof applyRemoteState === 'function') {
                    applyRemoteState(msg.data);
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
        if (ws && ws.readyState === WebSocket.OPEN && data) {
            try {
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: data }));
            } catch (e) {}
        }
    }

    window.syncSendState = sendState;
    window.syncConnect = connect;
    window.syncDisconnect = disconnect;
})();
