/**
 * Мониторинг узлов сети: статус ping с сервера, индикаторы на карте.
 */
(function (global) {
    var POLL_INTERVAL_MS = 30000;
    var statusByUniqueId = Object.create(null);
    var serverEnabled = false;
    var serverIntervalSec = 60;
    var pollTimer = null;
    var fetchInFlight = false;
    var saveRefreshTimer = null;
    var monitorProvider = 'ping';
    var zabbixPublic = null;

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeMonitorIp(raw) {
        if (raw == null) return '';
        return String(raw).trim().slice(0, 253);
    }

    function isMonitoringConfigured(obj) {
        if (!obj || !obj.properties || obj.properties.get('type') !== 'node') return false;
        if (obj.properties.get('monitorEnabled') === false) return false;
        var ip = normalizeMonitorIp(obj.properties.get('monitorIp'));
        var zHost = (obj.properties.get('monitorZabbixHost') || '').trim();
        var zHostId = (obj.properties.get('monitorZabbixHostId') || '').trim();
        return !!(ip || zHost || zHostId);
    }

    function getMonitorProvider() {
        return monitorProvider === 'zabbix' ? 'zabbix' : 'ping';
    }

    function getCachedStatus(uniqueId) {
        if (!uniqueId) return null;
        return statusByUniqueId[String(uniqueId)] || null;
    }

    function setPingLive(obj, live) {
        if (!obj || !obj.properties) return;
        var prev = obj.properties.get('pingLive');
        if (live === true) {
            if (prev === true) return;
            obj.properties.set('pingLive', true);
        } else if (live === false) {
            if (prev === false) return;
            obj.properties.set('pingLive', false);
        } else {
            if (prev === undefined || prev === null) return;
            obj.properties.unset('pingLive');
        }
        notifyNodePresentationChanged(obj);
    }

    function applyStatusEntry(uniqueId, entry) {
        if (!uniqueId || !entry) return;
        statusByUniqueId[String(uniqueId)] = entry;
        if (typeof objects === 'undefined' || !Array.isArray(objects)) return;
        objects.forEach(function(obj) {
            if (!obj || !obj.properties || obj.properties.get('type') !== 'node') return;
            var uid = obj.properties.get('uniqueId');
            if (String(uid) !== String(uniqueId)) return;
            if (!isMonitoringConfigured(obj)) {
                setPingLive(obj, null);
                return;
            }
            if (entry.status === 'up') setPingLive(obj, true);
            else if (entry.status === 'down') setPingLive(obj, false);
            else setPingLive(obj, null);
        });
    }

    function isNodeOnline(obj) {
        if (!isMonitoringConfigured(obj)) return false;
        return obj.properties.get('pingLive') === true;
    }

    function isNodeOffline(obj) {
        if (!isMonitoringConfigured(obj)) return false;
        return obj.properties.get('pingLive') === false;
    }

    function getNodeStatusTitle(obj) {
        if (!obj || !obj.properties) return '';
        if (!isMonitoringConfigured(obj)) return 'Мониторинг не настроен — укажите IP или имя хоста Zabbix';
        var uid = obj.properties.get('uniqueId');
        var cached = getCachedStatus(uid);
        var viaZabbix = getMonitorProvider() === 'zabbix' || (cached && cached.source === 'zabbix');
        var srcLabel = viaZabbix ? 'Zabbix' : 'ping';
        if (obj.properties.get('pingLive') === true) {
            var rtt = !viaZabbix && cached && cached.rttMs != null ? ' · ' + cached.rttMs + ' ms' : '';
            return 'Активен — доступен (' + srcLabel + ')' + rtt;
        }
        if (obj.properties.get('pingLive') === false) {
            return 'Не активен — недоступен (' + srcLabel + ')';
        }
        return 'Проверка доступности (' + srcLabel + ')…';
    }

    function getNodeStatusLabel(obj) {
        if (!isMonitoringConfigured(obj)) return '';
        if (obj.properties.get('pingLive') === true) return 'Активен';
        if (obj.properties.get('pingLive') === false) return 'Не активен';
        return 'Проверка…';
    }

    function buildStatusBadgeHtml(obj) {
        if (!isMonitoringConfigured(obj)) return '';
        var online = isNodeOnline(obj);
        var offline = isNodeOffline(obj);
        var cls = online ? 'online' : (offline ? 'offline' : 'pending');
        var text = getNodeStatusLabel(obj);
        var title = getNodeStatusTitle(obj);
        return '<span class="node-status-badge node-status-badge--' + cls + '" title="' + escapeHtml(title) + '">' +
            '<span class="node-status-badge-dot" aria-hidden="true"></span>' +
            '<span class="node-status-badge-text">' + escapeHtml(text) + '</span></span>';
    }

    function buildMapLabelHtml(displayName, obj) {
        if (!isMonitoringConfigured(obj)) {
            return '<div class="map-label">' + displayName + '</div>';
        }
        var online = isNodeOnline(obj);
        var offline = isNodeOffline(obj);
        var cls = online ? 'online' : (offline ? 'offline' : 'pending');
        var title = getNodeStatusTitle(obj);
        return '<div class="map-label map-label--node-monitor">' +
            '<span class="map-label-status map-label-status--' + cls + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"></span>' +
            displayName + '</div>';
    }

    function notifyNodePresentationChanged(obj) {
        if (typeof global.refreshNodeMapPresentation === 'function') {
            global.refreshNodeMapPresentation(obj);
        }
    }

    function applyPayload(body) {
        if (!body || typeof body !== 'object') return;
        serverEnabled = !!body.enabled;
        if (body.intervalSec) serverIntervalSec = body.intervalSec;
        if (body.provider) monitorProvider = body.provider;
        if (body.zabbix) zabbixPublic = body.zabbix;
        var nodes = body.nodes || {};
        var nextIds = Object.create(null);
        Object.keys(nodes).forEach(function(uid) {
            nextIds[uid] = true;
            applyStatusEntry(uid, nodes[uid]);
        });
        if (typeof objects !== 'undefined' && Array.isArray(objects)) {
            objects.forEach(function(obj) {
                if (!obj || !obj.properties || obj.properties.get('type') !== 'node') return;
                var id = obj.properties.get('uniqueId');
                if (!id || nextIds[String(id)]) return;
                if (isMonitoringConfigured(obj)) setPingLive(obj, null);
                else setPingLive(obj, null);
            });
        }
    }

    function fetchStatus() {
        if (typeof getApiBase !== 'function' || !getApiBase()) return Promise.resolve();
        if (typeof getAuthToken !== 'function' || !getAuthToken()) return Promise.resolve();
        if (fetchInFlight) return Promise.resolve();
        fetchInFlight = true;
        return fetch(getApiBase() + '/api/node-monitor/status', {
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        }).then(function(r) {
            if (!r.ok) return null;
            return r.json();
        }).then(function(body) {
            if (body) applyPayload(body);
        }).catch(function() {})
            .finally(function() { fetchInFlight = false; });
    }

    function requestRefresh() {
        if (typeof getApiBase !== 'function' || !getApiBase()) return Promise.resolve();
        if (typeof getAuthToken !== 'function' || !getAuthToken()) return Promise.resolve();
        return fetch(getApiBase() + '/api/node-monitor/refresh', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getAuthToken() }
        }).then(function(r) {
            if (!r.ok) return fetchStatus();
            return r.json();
        }).then(function(body) {
            if (body) applyPayload(body);
        }).catch(function() {
            return fetchStatus();
        });
    }

    function scheduleRefreshAfterSave() {
        if (saveRefreshTimer) clearTimeout(saveRefreshTimer);
        saveRefreshTimer = setTimeout(function() {
            saveRefreshTimer = null;
            requestRefresh();
        }, 2500);
    }

    function refreshAllNodeLabels() {
        if (typeof objects === 'undefined' || !Array.isArray(objects)) return;
        objects.forEach(function(obj) {
            if (!obj || !obj.properties || obj.properties.get('type') !== 'node') return;
            if (typeof global.updateObjectLabel === 'function') {
                global.updateObjectLabel(obj, obj.properties.get('name'));
            }
        });
    }

    function startPolling() {
        stopPolling();
        if (typeof getApiBase !== 'function' || !getApiBase()) return;
        if (typeof getAuthToken !== 'function' || !getAuthToken()) return;
        fetchStatus().then(refreshAllNodeLabels);
        pollTimer = setInterval(function() {
            fetchStatus();
        }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function onMapLoaded() {
        startPolling();
    }

    function clearRuntimeState() {
        statusByUniqueId = Object.create(null);
        if (typeof objects !== 'undefined' && Array.isArray(objects)) {
            objects.forEach(function(obj) {
                if (obj && obj.properties && obj.properties.get('type') === 'node') {
                    obj.properties.unset('pingLive');
                }
            });
        }
    }

    global.NodeMonitor = {
        isMonitoringConfigured: isMonitoringConfigured,
        normalizeMonitorIp: normalizeMonitorIp,
        isNodeOnline: isNodeOnline,
        isNodeOffline: isNodeOffline,
        getNodeStatusTitle: getNodeStatusTitle,
        getNodeStatusLabel: getNodeStatusLabel,
        buildStatusBadgeHtml: buildStatusBadgeHtml,
        buildMapLabelHtml: buildMapLabelHtml,
        getCachedStatus: getCachedStatus,
        fetchStatus: fetchStatus,
        requestRefresh: requestRefresh,
        scheduleRefreshAfterSave: scheduleRefreshAfterSave,
        startPolling: startPolling,
        stopPolling: stopPolling,
        onMapLoaded: onMapLoaded,
        clearRuntimeState: clearRuntimeState,
        refreshAllNodeLabels: refreshAllNodeLabels,
        isServerEnabled: function() { return serverEnabled; },
        getServerIntervalSec: function() { return serverIntervalSec; },
        getMonitorProvider: getMonitorProvider,
        getZabbixPublic: function() { return zabbixPublic; }
    };
})(typeof window !== 'undefined' ? window : this);
