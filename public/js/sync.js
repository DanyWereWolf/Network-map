(function() {
    var ws = null;
    var myClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var SYNC_URL_KEY = 'networkMap_syncUrl';
    var SEND_DEBOUNCE_MS = 400;
    var sendTimer = null;
    var pendingState = null;
    var reconnectTimer = null;
    var reconnectAttempts = 0;
    var reconnectDelayBaseMs = 2000;
    var reconnectDelayMaxMs = 30000;
    var userRequestedDisconnect = false;
    var CURSOR_THROTTLE_MS = 120;
    var lastCursorSend = 0;
    var lastCursorPos = null;
    var cursorFlushIntervalId = null;
    var lastCursorsUiUpdate = 0;
    var pendingCursorsUi = null;
    var CURSORS_UI_THROTTLE_MS = 200;
    var applyStateTimer = null;
    var pendingApplyState = null;
    var APPLY_STATE_DEBOUNCE_MS = 120;
    var lastOpSendTime = 0;
    var SUPPRESS_STATE_AFTER_OP_MS = 1200;
    var renderUsersListTimer = null;
    var RENDER_USERS_DEBOUNCE_MS = 80;
    var remoteOpQueue = [];
    var remoteOpFlushTimer = null;
    var REMOTE_OP_BATCH_MS = 48;
    var pendingLockRequests = {};
    var remoteObjectLocks = {};
    var lockHeartbeatTimer = null;
    var LOCK_HEARTBEAT_MS = 45000;

    function getDefaultSyncUrl() {
        if (typeof window !== 'undefined' && window.location && window.location.host) {
            var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return protocol + '//' + window.location.host + '/sync';
        }
        return 'ws://localhost:3000/sync';
    }

    function escapeSyncHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getAvatarInitials(name) {
        var raw = String(name || 'У').trim();
        if (!raw) return 'У';
        var parts = raw.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
        }
        return raw.slice(0, 2).toUpperCase();
    }

    function updateSyncUIStatus(connected, errorText) {
        var statusEl = document.getElementById('syncStatus');
        var btn = document.getElementById('syncConnectBtn');
        var btnLabel = btn ? btn.querySelector('.sidebar-sync-reconnect-label') : null;
        var card = document.getElementById('syncPresenceCard');
        var connecting = !connected && errorText === 'Подключение…';
        var label = connected ? 'Подключено' : (errorText || 'Отключено');
        if (statusEl) {
            statusEl.className = 'sync-status ' + (connected ? 'sync-connected' : (connecting ? 'sync-connecting' : 'sync-disconnected'));
            var textNode = statusEl.querySelector('.sync-status-text');
            var dot = statusEl.querySelector('.sync-status-dot');
            if (!textNode || !dot) {
                statusEl.innerHTML = '<span class="sync-status-dot" aria-hidden="true"></span>' +
                    '<span class="sync-status-text">' + escapeSyncHtml(label) + '</span>';
            } else {
                textNode.textContent = label;
            }
        }
        if (card) {
            card.classList.toggle('sync-presence--online', !!connected);
            card.classList.toggle('sync-presence--connecting', !!connecting);
            card.classList.toggle('sync-presence--offline', !connected && !connecting);
        }
        if (btnLabel) btnLabel.textContent = connected ? 'Обновить' : 'Подключить';
        if (btn) {
            btn.disabled = false;
            btn.title = connected ? 'Переподключить синхронизацию' : 'Подключить синхронизацию';
        }
    }

    var lastSyncClients = [];

    function getClientEditingLabel(clientId) {
        if (!clientId) return null;
        var locks = remoteObjectLocks || {};
        var uids = Object.keys(locks);
        for (var i = 0; i < uids.length; i++) {
            var lock = locks[uids[i]];
            if (!lock || lock.clientId !== clientId) continue;
            if (typeof window.describeObjectForCollab === 'function') {
                var desc = window.describeObjectForCollab(uids[i]);
                if (desc) return desc;
            }
            return 'объект';
        }
        return null;
    }

    function resolveClientAvatarUrl(client) {
        if (!client) return '';
        var url = client.avatarUrl;
        if (!url && client.id === myClientId && typeof currentUser !== 'undefined' && currentUser && currentUser.avatarUrl) {
            url = currentUser.avatarUrl;
        }
        if (!url) return '';
        if (typeof getAvatarImageSrc === 'function') return getAvatarImageSrc(url) || '';
        return url;
    }

    function renderSyncPersonAvatarHtml(name, client) {
        var src = resolveClientAvatarUrl(client);
        if (src) {
            return '<span class="sidebar-sync-avatar has-image" aria-hidden="true">' +
                '<img class="sidebar-sync-avatar-img" src="' + escapeSyncHtml(src) + '" alt="">' +
                '<span class="sidebar-sync-avatar-fallback">' + escapeSyncHtml(getAvatarInitials(name)) + '</span>' +
                '</span>';
        }
        return '<span class="sidebar-sync-avatar" aria-hidden="true">' + escapeSyncHtml(getAvatarInitials(name)) + '</span>';
    }

    function updateSyncOnlineList(clients) {
        var el = document.getElementById('syncOnlineList');
        var emptyHint = document.getElementById('syncTeamEmptyHint');
        if (!el) return;
        if (clients) lastSyncClients = clients;
        else clients = lastSyncClients;
        if (!clients || clients.length === 0) {
            el.hidden = true;
            el.innerHTML = '';
            if (emptyHint) emptyHint.hidden = false;
            return;
        }
        var rows = clients.map(function(c) {
            var isSelf = c.id === myClientId;
            var name = isSelf ? 'Вы' : (c.displayName || 'Участник');
            var editing = getClientEditingLabel(c.id);
            var classes = 'sidebar-sync-person' + (isSelf ? ' is-self' : '') + (editing ? ' is-editing' : '');
            var editingHtml = editing
                ? ('<span class="sidebar-sync-person-editing" title="' + escapeSyncHtml(editing) + '">' +
                    '<span class="sidebar-sync-person-editing-dot" aria-hidden="true"></span>' +
                    '<span class="sidebar-sync-person-editing-text">' + escapeSyncHtml(editing) + '</span></span>')
                : '';
            return '<li class="' + classes + '">' +
                renderSyncPersonAvatarHtml(name, c) +
                '<span class="sidebar-sync-person-body">' +
                '<span class="sidebar-sync-person-name">' + escapeSyncHtml(name) + '</span>' +
                editingHtml +
                '</span></li>';
        }).join('');
        el.innerHTML =
            '<div class="sidebar-sync-online-head">' +
            '<span class="sidebar-sync-online-title">Сейчас на карте</span>' +
            '<span class="sidebar-sync-online-count">' + clients.length + '</span></div>' +
            '<ul class="sidebar-sync-people">' + rows + '</ul>';
        el.hidden = false;
        if (emptyHint) emptyHint.hidden = true;
        Array.prototype.forEach.call(el.querySelectorAll('.sidebar-sync-avatar-img'), function(img) {
            if (img._syncAvatarBound) return;
            img._syncAvatarBound = true;
            img.addEventListener('error', function() {
                var wrap = img.closest('.sidebar-sync-avatar');
                if (wrap) wrap.classList.remove('has-image');
            });
        });
    }
    window.refreshSyncOnlineListPresence = function() {
        updateSyncOnlineList(null);
    };

    function flushRemoteOpQueue() {
        remoteOpFlushTimer = null;
        var queue = remoteOpQueue;
        remoteOpQueue = [];
        if (!queue.length) return;
        var run = function() {
            for (var i = 0; i < queue.length; i++) {
                try {
                    if (typeof window.applyOperationToMap === 'function') window.applyOperationToMap(queue[i]);
                } catch (eOp) {}
            }
            if (typeof window.invalidateUndoAfterRemoteChange === 'function') {
                try { window.invalidateUndoAfterRemoteChange(); } catch (eInv) {}
            }
            updateSyncUIStatus(true);
        };
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function enqueueRemoteOp(op) {
        if (!op) return;
        remoteOpQueue.push(op);
        if (!remoteOpFlushTimer) {
            remoteOpFlushTimer = setTimeout(flushRemoteOpQueue, REMOTE_OP_BATCH_MS);
        }
    }

    function shouldDeferRemoteFullState() {
        if (typeof window.syncDragInProgress !== 'undefined' && window.syncDragInProgress) return true;
        if (typeof window.infoModalEditModeSession !== 'undefined' && window.infoModalEditModeSession) return true;
        return false;
    }

    function doApplyPendingState() {
        if (!pendingApplyState) return;
        var payload = pendingApplyState;
        var data = Array.isArray(payload) ? payload : payload.data;
        if (!Array.isArray(data)) return;
        if (typeof myMap === 'undefined' || !myMap) {
            applyStateTimer = setTimeout(function() {
                applyStateTimer = null;
                doApplyPendingState();
            }, 50);
            return;
        }
        if (shouldDeferRemoteFullState()) {
            applyStateTimer = setTimeout(function() {
                applyStateTimer = null;
                doApplyPendingState();
            }, 400);
            return;
        }
        if (window.syncMapIsApplying) {
            applyStateTimer = setTimeout(doApplyPendingState, 80);
            return;
        }
        pendingApplyState = null;
        var applyMeta = Array.isArray(payload) ? {} : { organizationId: payload.organizationId };
        var runApply = function() {
            window.syncMapIsApplying = true;
            try {
                if (data.length > 0 && typeof window.setMapLoadingOverlayText === 'function') {
                    window.setMapLoadingOverlayText('Загрузка объектов…');
                }
                var applyFn = typeof applyRemoteState === 'function' ? applyRemoteState
                    : (typeof window.applyRemoteState === 'function' ? window.applyRemoteState : null);
                if (applyFn) applyFn(data, applyMeta);
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

    function touchObjectLock(uniqueId) {
        if (!uniqueId || !ws || ws.readyState !== WebSocket.OPEN) return;
        try {
            ws.send(JSON.stringify({ type: 'lock_touch', uniqueId: uniqueId }));
        } catch (e) {}
    }

    function lockHeartbeatTick() {
        var uid = typeof window.getActiveObjectLockId === 'function'
            ? window.getActiveObjectLockId()
            : null;
        if (uid) touchObjectLock(uid);
    }

    function startLockHeartbeat() {
        if (lockHeartbeatTimer) return;
        lockHeartbeatTimer = setInterval(lockHeartbeatTick, LOCK_HEARTBEAT_MS);
    }

    function stopLockHeartbeat() {
        if (!lockHeartbeatTimer) return;
        clearInterval(lockHeartbeatTimer);
        lockHeartbeatTimer = null;
    }

    function getReconnectDelayMs() {
        var exp = Math.min(reconnectAttempts, 4);
        var base = Math.min(reconnectDelayMaxMs, reconnectDelayBaseMs * Math.pow(2, exp));
        var jitter = Math.floor(Math.random() * 400);
        return base + jitter;
    }

    function scheduleReconnect() {
        if (reconnectTimer || userRequestedDisconnect) return;
        reconnectAttempts++;
        var delay = getReconnectDelayMs();
        reconnectTimer = setTimeout(function() {
            reconnectTimer = null;
            if (userRequestedDisconnect) return;
            connect();
        }, delay);
    }

    function clearReconnectTimer() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    }

    function forceReconnect() {
        userRequestedDisconnect = false;
        reconnectAttempts = 0;
        clearReconnectTimer();
        var btn = document.getElementById('syncConnectBtn');
        if (btn) btn.disabled = true;
        updateSyncUIStatus(false, 'Подключение…');
        if (ws) {
            var old = ws;
            ws = null;
            try {
                old.onclose = null;
                old.onerror = null;
                old.onmessage = null;
                old.close();
            } catch (eClose) {}
        }
        window.syncIsConnected = false;
        stopLockHeartbeat();
        connect();
    }

    function connect() {
        var url = getSyncUrl();
        if (ws && ws.readyState === WebSocket.CONNECTING) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            forceReconnect();
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
            if (!userRequestedDisconnect) scheduleReconnect();
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
            startLockHeartbeat();
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
            lockHeartbeatTick();
        };
        ws.onclose = function() {
            ws = null;
            window.syncIsConnected = false;
            stopLockHeartbeat();
            if (remoteOpFlushTimer) { clearTimeout(remoteOpFlushTimer); remoteOpFlushTimer = null; }
            remoteOpQueue = [];
            if (applyStateTimer) { clearTimeout(applyStateTimer); applyStateTimer = null; }
            pendingApplyState = null;
            if (cursorFlushIntervalId) {
                clearInterval(cursorFlushIntervalId);
                cursorFlushIntervalId = null;
            }
            pendingCursorsUi = null;
            window.syncOnlineUserIds = [];
            remoteObjectLocks = {};
            window.syncRemoteObjectLocks = remoteObjectLocks;
            Object.keys(pendingLockRequests).forEach(function(uid) {
                var cb = pendingLockRequests[uid];
                delete pendingLockRequests[uid];
                if (cb) cb(false, null);
            });
            if (typeof window.onSyncObjectLocks === 'function') window.onSyncObjectLocks(remoteObjectLocks);
            if (typeof window.updateCollaboratorCursors === 'function') window.updateCollaboratorCursors([]);
            updateSyncUIStatus(false);
            updateSyncOnlineList([]);
            lastSyncClients = [];
            if (btn) btn.disabled = false;
            if (typeof window.showSyncRequiredOverlay === 'function') window.showSyncRequiredOverlay();
            if (!userRequestedDisconnect) {
                setTimeout(function() {
                    if (typeof window.showNetworkError === 'function') {
                        window.showNetworkError('Нет связи с сервером', function() {
                            forceReconnect();
                        });
                    }
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
                if (msg.type === 'session_revoked') {
                    if (typeof AuthSystem !== 'undefined' && AuthSystem.handleSessionExpired) {
                        AuthSystem.handleSessionExpired(msg.reason || 'Сессия завершена: выполнен вход с другого устройства.');
                    }
                    return;
                }
                if (msg.type === 'yourId' && msg.clientId) {
                    myClientId = msg.clientId;
                    window.syncMyClientId = myClientId;
                    return;
                }
                if (msg.type === 'object_locks' && Array.isArray(msg.locks)) {
                    remoteObjectLocks = {};
                    msg.locks.forEach(function(lock) {
                        if (lock && lock.uniqueId) remoteObjectLocks[lock.uniqueId] = lock;
                    });
                    window.syncRemoteObjectLocks = remoteObjectLocks;
                    if (typeof window.onSyncObjectLocks === 'function') window.onSyncObjectLocks(remoteObjectLocks);
                    updateSyncOnlineList(null);
                    return;
                }
                if (msg.type === 'lock_result' && msg.uniqueId != null) {
                    var lockCb = pendingLockRequests[msg.uniqueId];
                    if (lockCb) {
                        delete pendingLockRequests[msg.uniqueId];
                        lockCb(!!msg.ok, msg.lockedBy || null);
                    }
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
                if (msg.type === 'sync_error') {
                    if (typeof window.showWarning === 'function') {
                        window.showWarning(msg.error || 'Ошибка синхронизации карты', 'Синхронизация');
                    }
                    return;
                }
                if (msg.type === 'op_conflict' && msg.conflict && typeof window.onSyncOpConflict === 'function') {
                    try { window.onSyncOpConflict(msg.conflict); } catch (eCf) {}
                    return;
                }
                if (msg.type === 'op' && msg.op && typeof window.applyOperationToMap === 'function') {
                    enqueueRemoteOp(msg.op);
                    return;
                }
                if (msg.type === 'groupNames' && msg.groupNames && typeof window.applyGroupNames === 'function') {
                    try { window.applyGroupNames(msg.groupNames); } catch (e) {}
                    return;
                }
                if (msg.type === 'org_settings' && msg.settings && typeof window.applyOrgDisplaySettings === 'function') {
                    try { window.applyOrgDisplaySettings(msg.settings); } catch (e) {}
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
                if (msg.type === 'chat_deleted' && msg.messageId && typeof window.orgChatOnDeleted === 'function') {
                    try { window.orgChatOnDeleted(msg.messageId); } catch (e) {}
                    return;
                }
                if (msg.type === 'chat_updated' && msg.message && typeof window.orgChatOnUpdated === 'function') {
                    try { window.orgChatOnUpdated(msg.message); } catch (e) {}
                    return;
                }
                if (msg.type === 'map_refresh') {
                    if (msg.organizationId != null && typeof currentUser !== 'undefined' && currentUser &&
                        currentUser.organizationId != null &&
                        String(msg.organizationId) !== String(currentUser.organizationId)) {
                        return;
                    }
                    if (msg.groupNames && typeof window.applyGroupNames === 'function') {
                        try { window.applyGroupNames(msg.groupNames); } catch (e) {}
                    }
                    if (typeof window.shouldSkipSyncMapRefresh === 'function' &&
                        window.shouldSkipSyncMapRefresh(msg.organizationId)) {
                        return;
                    }
                    if (typeof window.reloadMapFromApi === 'function') {
                        window.reloadMapFromApi({ organizationId: msg.organizationId, immediate: true });
                    }
                    return;
                }
                if (msg.type === 'state' && Array.isArray(msg.data)) {
                    if (sendTimer) { clearTimeout(sendTimer); sendTimer = null; }
                    pendingState = null;
                    pendingApplyState = null;
                    if (applyStateTimer) { clearTimeout(applyStateTimer); applyStateTimer = null; }
                    if (msg.groupNames && typeof window.applyGroupNames === 'function') {
                        try { window.applyGroupNames(msg.groupNames); } catch (e) {}
                    }
                    if (typeof window.shouldSkipSyncMapRefresh === 'function' &&
                        window.shouldSkipSyncMapRefresh(msg.organizationId)) {
                        return;
                    }
                    if (typeof window.reloadMapFromApi === 'function') {
                        window.reloadMapFromApi({ organizationId: msg.organizationId });
                    }
                    return;
                }
            } catch (e) {}
            });
        };
    }

    function disconnect() {
        userRequestedDisconnect = true;
        clearReconnectTimer();
        stopLockHeartbeat();
        if (ws) {
            ws.close();
            ws = null;
        }
        window.syncIsConnected = false;
        updateSyncUIStatus(false);
    }

    function stopReconnect() {
        userRequestedDisconnect = true;
        clearReconnectTimer();
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

    function autoConnectOnMapPage() {
        if (typeof getApiBase === 'function' && !getApiBase()) return;
        try {
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
        } catch (eWs) {}
        connect();
    }

    function bindSyncConnectButton() {
        var btn = document.getElementById('syncConnectBtn');
        if (!btn || btn._syncBound) return;
        btn._syncBound = true;
        btn.addEventListener('click', function() {
            forceReconnect();
        });
    }

    if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            loadSavedSyncUrl();
            bindSyncConnectButton();
            autoConnectOnMapPage();
        });
    } else {
        loadSavedSyncUrl();
        bindSyncConnectButton();
        autoConnectOnMapPage();
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

    function requestObjectLock(uniqueId, callback) {
        if (!uniqueId || typeof callback !== 'function') return;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            callback(true, null);
            return;
        }
        var existing = remoteObjectLocks[uniqueId];
        if (existing && existing.clientId && existing.clientId !== myClientId) {
            callback(false, existing.displayName || 'Участник');
            return;
        }
        pendingLockRequests[uniqueId] = callback;
        try {
            ws.send(JSON.stringify({ type: 'lock_object', uniqueId: uniqueId }));
        } catch (e) {
            delete pendingLockRequests[uniqueId];
            callback(false, null);
        }
        setTimeout(function() {
            if (!pendingLockRequests[uniqueId]) return;
            delete pendingLockRequests[uniqueId];
            callback(false, null);
        }, 8000);
    }

    function releaseObjectLock(uniqueId) {
        if (!uniqueId || !ws || ws.readyState !== WebSocket.OPEN) return;
        try {
            ws.send(JSON.stringify({ type: 'unlock_object', uniqueId: uniqueId }));
        } catch (e) {}
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
    window.syncRequestObjectLock = requestObjectLock;
    window.syncReleaseObjectLock = releaseObjectLock;
    window.syncTouchObjectLock = touchObjectLock;
    window.syncRemoteObjectLocks = remoteObjectLocks;
    window.syncMyClientId = myClientId;
    window.syncConnect = forceReconnect;
    window.syncStopReconnect = stopReconnect;
    window.syncDisconnect = disconnect;
    window.syncApplyPendingState = applyPendingStateAfterDrag;
})();
