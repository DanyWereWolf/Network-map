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
    var CURSOR_THROTTLE_MS = 120;
    var lastCursorSend = 0;
    var lastCursorPos = null;
    var cursorFlushIntervalId = null;
    var lastCursorsUiUpdate = 0;
    var pendingCursorsUi = null;
    var CURSORS_UI_THROTTLE_MS = 100;
    var applyStateTimer = null;
    var pendingApplyState = null;
    var APPLY_STATE_DEBOUNCE_MS = 120;
    var lastOpSendTime = 0;
    var SUPPRESS_STATE_AFTER_OP_MS = 1200;
    var renderUsersListTimer = null;
    var RENDER_USERS_DEBOUNCE_MS = 80;

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

    function forceSendState(optionalData) {
        if (sendTimer) clearTimeout(sendTimer);
        sendTimer = null;
        lastOpSendTime = 0;
        var toSend = optionalData !== undefined && optionalData !== null ? optionalData : pendingState;
        pendingState = null;
        if (ws && ws.readyState === WebSocket.OPEN && toSend) {
            try {
                ws.send(JSON.stringify({ type: 'state', clientId: myClientId, data: toSend }));
            } catch (e) {}
        }
    }

    function doApplyPendingState() {
        if (!pendingApplyState || !Array.isArray(pendingApplyState)) return;
        if (typeof window.syncDragInProgress !== 'undefined' && window.syncDragInProgress) return;
        if (window.syncMapIsApplying) {
            applyStateTimer = setTimeout(doApplyPendingState, 80);
            return;
        }
        var data = pendingApplyState;
        pendingApplyState = null;
        var runApply = function() {
            window.syncMapIsApplying = true;
            try {
                if (data.length > 0 && typeof window.setMapLoadingOverlayText === 'function') {
                    window.setMapLoadingOverlayText('Загрузка объектов…');
                }
                var applyFn = typeof applyRemoteState === 'function' ? applyRemoteState
                    : (typeof window.applyRemoteState === 'function' ? window.applyRemoteState : null);
                if (applyFn) applyFn(data);
                else if (typeof window.markMapDataReady === 'function') window.markMapDataReady();
                updateSyncUIStatus(true);
                if (typeof window.hideSyncRequiredOverlay === 'function') window.hideSyncRequiredOverlay();
            } catch (e) {
                updateSyncUIStatus(true);
                if (typeof window.markMapDataReady === 'function') window.markMapDataReady();
            }
            window.syncMapIsApplying = false;
        };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(runApply, { timeout: 50 });
        } else {
            (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function(f) { setTimeout(f, 0); })(runApply);
        }
    }

    function applyPendingStateAfterDrag() {
        if (applyStateTimer) {
            clearTimeout(applyStateTimer);
            applyStateTimer = null;
        }
        doApplyPendingState();
    }

    function getSyncUrl() {
        var urlInput = document.getElementById('syncServerUrl');
        var url = (urlInput && urlInput.value) ? urlInput.value.trim() : '';
        if (!url) {
            try {
                var saved = sessionStorage.getItem(SYNC_URL_KEY);
                if (saved && saved.trim()) url = saved.trim();
            } catch (e) {}
        }
        if (!url) url = getDefaultSyncUrl();
        return url;
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
        var url = getSyncUrl();
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
            if (typeof window.hideNetworkError === 'function') window.hideNetworkError();
            try { sessionStorage.setItem(SYNC_URL_KEY, url); } catch (e) {}
            window.syncIsConnected = true;
            if (!cursorFlushIntervalId) {
                cursorFlushIntervalId = setInterval(flushCursorIfPending, CURSOR_THROTTLE_MS);
            }
            updateSyncUIStatus(true);
            if (typeof window.hideSyncRequiredOverlay === 'function') window.hideSyncRequiredOverlay();
            var displayName = 'Участник';
            var userId = null;
            var token = (typeof getAuthToken === 'function' ? getAuthToken() : null) || null;
            if (typeof currentUser !== 'undefined' && currentUser) {
                displayName = (currentUser.fullName || currentUser.username || displayName).toString().trim().slice(0, 100) || displayName;
                userId = currentUser.userId != null ? currentUser.userId : null;
            }
            try {
                ws.send(JSON.stringify({ type: 'hello', displayName: displayName, userId: userId, token: token }));
            } catch (e) {}
            if (btn) btn.disabled = false;
            setTimeout(function() {
                if (!ws || ws.readyState !== 1) return;
                if (typeof getSerializedData === 'function') {
                    try {
                        var data = getSerializedData();
                        var initPayload = { type: 'state', clientId: myClientId, data: data };
                        if (typeof window.getGroupNamesForSync === 'function') {
                            var gn = window.getGroupNamesForSync();
                            if (gn && (gn.cross || gn.node)) initPayload.groupNames = gn;
                        }
                        ws.send(JSON.stringify(initPayload));
                    } catch (e) {}
                }
            }, 50);
        };
        ws.onclose = function() {
            ws = null;
            window.syncIsConnected = false;
            if (applyStateTimer) { clearTimeout(applyStateTimer); applyStateTimer = null; }
            pendingApplyState = null;
            if (cursorFlushIntervalId) {
                clearInterval(cursorFlushIntervalId);
                cursorFlushIntervalId = null;
            }
            pendingCursorsUi = null;
            window.syncOnlineUserIds = [];
            if (typeof window.updateCollaboratorCursors === 'function') window.updateCollaboratorCursors([]);
            updateSyncUIStatus(false);
            updateSyncOnlineList([]);
            if (btn) btn.disabled = false;
            if (typeof window.showSyncRequiredOverlay === 'function') window.showSyncRequiredOverlay();
            if (!userRequestedDisconnect) {
                setTimeout(function() {
                    if (typeof window.showNetworkError === 'function') window.showNetworkError('Нет связи с сервером');
                }, 600);
                scheduleReconnect();
            }
        };
        ws.onerror = function() {
            updateSyncUIStatus(false, 'Ошибка соединения');
        };
        ws.onmessage = function(event) {
            var raw = event.data;
            var tick = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : function(f) { setTimeout(f, 0); };
            tick(function() {
            try {
                var msg = JSON.parse(raw);
                if (msg.type === 'yourId' && msg.clientId) {
                    myClientId = msg.clientId;
                    return;
                }
                if (msg.type === 'clients' && Array.isArray(msg.clients)) {
                    var userIds = [];
                    msg.clients.forEach(function(c) {
                        if (c.userId != null && userIds.indexOf(c.userId) === -1) userIds.push(c.userId);
                    });
                    window.syncOnlineUserIds = userIds;
                    updateSyncOnlineList(msg.clients);
                    if (renderUsersListTimer) clearTimeout(renderUsersListTimer);
                    renderUsersListTimer = setTimeout(function() {
                        renderUsersListTimer = null;
                        if (typeof window.renderUsersList === 'function') window.renderUsersList();
                    }, RENDER_USERS_DEBOUNCE_MS);
                    return;
                }
                if (msg.type === 'cursors' && Array.isArray(msg.cursors)) {
                    var others = msg.cursors.filter(function(c) { return c.id !== myClientId; });
                    var now = Date.now();
                    if (now - lastCursorsUiUpdate >= CURSORS_UI_THROTTLE_MS) {
                        lastCursorsUiUpdate = now;
                        pendingCursorsUi = null;
                        if (typeof window.updateCollaboratorCursors === 'function') window.updateCollaboratorCursors(others);
                    } else {
                        pendingCursorsUi = others;
                    }
                    return;
                }
                if (msg.type === 'limit_error') {
                    if (typeof window.onMapObjectLimitError === 'function') {
                        window.onMapObjectLimitError(msg.error, msg.mapLimits);
                    } else if (typeof window.showWarning === 'function') {
                        window.showWarning(msg.error || 'Достигнут лимит объектов на карте', 'Лимит');
                    }
                    return;
                }
                if (msg.type === 'op' && msg.op && typeof window.applyOperationToMap === 'function') {
                    var op = msg.op;
                    setTimeout(function() {
                        try {
                            window.applyOperationToMap(op);
                            updateSyncUIStatus(true);
                        } catch (e) {}
                    }, 0);
                    return;
                }
                if (msg.type === 'groupNames' && msg.groupNames && typeof window.applyGroupNames === 'function') {
                    try { window.applyGroupNames(msg.groupNames); } catch (e) {}
                    return;
                }
                if (msg.type === 'chat' && msg.message && typeof window.orgChatOnMessage === 'function') {
                    try { window.orgChatOnMessage(msg.message); } catch (e) {}
                    return;
                }
                if (msg.type === 'chat_history' && Array.isArray(msg.messages) && typeof window.orgChatOnHistory === 'function') {
                    try { window.orgChatOnHistory(msg.messages); } catch (e) {}
                    return;
                }
                if (msg.type === 'state' && Array.isArray(msg.data) && typeof applyRemoteState === 'function') {
                    var data = msg.data;
                    if (sendTimer) { clearTimeout(sendTimer); sendTimer = null; }
                    pendingState = null;
                    pendingApplyState = data;
                    if (applyStateTimer) clearTimeout(applyStateTimer);
                    applyStateTimer = setTimeout(function() {
                        applyStateTimer = null;
                        doApplyPendingState();
                    }, APPLY_STATE_DEBOUNCE_MS);
                    if (msg.groupNames && typeof window.applyGroupNames === 'function') {
                        try { window.applyGroupNames(msg.groupNames); } catch (e) {}
                    }
                }
            } catch (e) {}
            });
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
        sendTimer = setTimeout(function flushSendState() {
            sendTimer = null;
            var toSend = pendingState;
            pendingState = null;
            if (!toSend) return;
            if (lastOpSendTime && (Date.now() - lastOpSendTime) < SUPPRESS_STATE_AFTER_OP_MS) {
                pendingState = toSend;
                var wait = SUPPRESS_STATE_AFTER_OP_MS - (Date.now() - lastOpSendTime);
                if (wait < 50) wait = 50;
                sendTimer = setTimeout(flushSendState, wait);
                return;
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    var payload = { type: 'state', clientId: myClientId, data: toSend };
                    if (typeof window.getGroupNamesForSync === 'function') {
                        var gn = window.getGroupNamesForSync();
                        if (gn && (gn.cross || gn.node)) payload.groupNames = gn;
                    }
                    ws.send(JSON.stringify(payload));
                } catch (e) {}
            }
        }, SEND_DEBOUNCE_MS);
    }

    function sendGroupNames(groupNames) {
        if (!ws || ws.readyState !== WebSocket.OPEN || !groupNames) return;
        try {
            ws.send(JSON.stringify({ type: 'groupNames', groupNames: groupNames }));
        } catch (e) {}
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

    function sendCursorPosition(position) {
        if (!position || !Array.isArray(position) || position.length < 2) return;
        var now = Date.now();
        if (now - lastCursorSend < CURSOR_THROTTLE_MS) {
            lastCursorPos = position;
            return;
        }
        lastCursorSend = now;
        lastCursorPos = null;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'cursor', position: position }));
            } catch (e) {}
        }
    }
    function flushCursorIfPending() {
        if (lastCursorPos && ws && ws.readyState === WebSocket.OPEN) {
            var now = Date.now();
            if (now - lastCursorSend >= CURSOR_THROTTLE_MS) {
                lastCursorSend = now;
                try {
                    ws.send(JSON.stringify({ type: 'cursor', position: lastCursorPos }));
                } catch (e) {}
                lastCursorPos = null;
            }
        }
        if (pendingCursorsUi && typeof window.updateCollaboratorCursors === 'function') {
            var t = Date.now();
            if (t - lastCursorsUiUpdate >= CURSORS_UI_THROTTLE_MS) {
                lastCursorsUiUpdate = t;
                window.updateCollaboratorCursors(pendingCursorsUi);
                pendingCursorsUi = null;
            }
        }
    }

    function sendOp(op) {
        if (!op || !op.type) return;
        lastOpSendTime = Date.now();
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: 'op', op: op, clientId: myClientId }));
            } catch (e) {}
        }
    }

    function sendChat(payload) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        var text = '';
        var mediaId = null;
        if (payload != null && typeof payload === 'object') {
            text = payload.text != null ? String(payload.text).trim() : '';
            mediaId = payload.mediaId != null ? String(payload.mediaId).trim() : null;
        } else if (payload != null) {
            text = String(payload).trim();
        }
        if (!text && !mediaId) return false;
        try {
            var msg = { type: 'chat' };
            if (text) msg.text = text;
            if (mediaId) msg.mediaId = mediaId;
            ws.send(JSON.stringify(msg));
            return true;
        } catch (e) {
            return false;
        }
    }

    window.syncShouldSendFullState = function() {
        return !lastOpSendTime || (Date.now() - lastOpSendTime) >= SUPPRESS_STATE_AFTER_OP_MS;
    };

    window.syncSendState = sendState;
    window.syncSendGroupNames = sendGroupNames;
    window.syncSendOp = sendOp;
    window.syncSendChat = sendChat;
    window.syncSendCursor = sendCursorPosition;
    window.syncConnect = connect;
    window.syncDisconnect = disconnect;
    window.syncAutoConnectIfSaved = autoConnectIfSaved;
    window.syncForceSendState = forceSendState;
    window.syncApplyPendingState = applyPendingStateAfterDrag;
})();
