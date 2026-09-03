/**
 * Подсветка статусов Zabbix на placemark (кольцо severity / OK).
 */
(function(global) {
    'use strict';

    var DEFAULT_POLL_MS = 45000;
    var pollMs = DEFAULT_POLL_MS;
    var statusByUid = Object.create(null);
    var pollTimer = null;
    var enabled = false;
    var lastError = '';
    var inFlight = false;

    function clampPollMs(ms) {
        var n = parseInt(ms, 10);
        if (isNaN(n)) return DEFAULT_POLL_MS;
        return Math.max(15000, Math.min(600000, n));
    }

    function setPollIntervalSec(sec) {
        var s = parseInt(sec, 10);
        if (isNaN(s)) s = 45;
        s = Math.max(15, Math.min(600, s));
        var next = clampPollMs(s * 1000);
        if (next === pollMs) return;
        pollMs = next;
        if (pollTimer) startPoll();
    }

    function getUid(obj) {
        if (!obj || !obj.properties) return '';
        var uid = obj.properties.get('uniqueId');
        return uid != null ? String(uid) : '';
    }

    function getForPlacemark(obj) {
        var uid = getUid(obj);
        if (!uid) return null;
        return statusByUid[uid] || null;
    }

    function applyHint(obj) {
        if (!obj || !obj.options) return;
        // Описание при наведении — кастомная карточка (#cursorIndicator), не нативный hint Яндекса
        try {
            obj.options.set({ hasHint: false });
        } catch (eOpt) {}
        if (obj.properties) {
            try {
                if (obj.properties.get('hintContent') != null) obj.properties.unset('hintContent');
            } catch (eUn) {
                try { obj.properties.set('hintContent', ''); } catch (e2) {}
            }
        }
        if (typeof refreshMapHoverCardIfNeeded === 'function') {
            try { refreshMapHoverCardIfNeeded(obj); } catch (eHover) {}
        }
    }

    function refreshPlacemarkIcon(obj) {
        if (!obj || !obj.properties) return;
        var type = obj.properties.get('type');
        if (!type || type === 'cable' || type === 'region' || type === 'cableLabel') return;
        var variant = 'normal';
        try {
            if (typeof selectedObjects !== 'undefined' && selectedObjects && selectedObjects.indexOf(obj) >= 0 && !isEditMode) {
                variant = 'selected';
            }
            if (typeof hoveredObject !== 'undefined' && hoveredObject === obj) variant = 'hover';
        } catch (e) {}
        if (typeof applyMapPlacemarkIcon === 'function') {
            applyMapPlacemarkIcon(obj, type, variant, obj);
        }
        applyHint(obj);
        if (typeof updateObjectLabel === 'function') {
            try { updateObjectLabel(obj, obj.properties.get('name')); } catch (eLbl) {}
        }
    }

    function applyAllPresentations() {
        var list = (typeof objects !== 'undefined' && Array.isArray(objects)) ? objects : [];
        list.forEach(function(obj) {
            if (!obj || !obj.properties) return;
            var type = obj.properties.get('type');
            if (!type || type === 'cable' || type === 'region') return;
            refreshPlacemarkIcon(obj);
        });
    }

    function setStatusesFromPayload(payload) {
        var next = Object.create(null);
        enabled = !!(payload && payload.enabled);
        lastError = (payload && payload.error) ? String(payload.error) : '';
        if (payload && payload.pollIntervalSec != null) {
            setPollIntervalSec(payload.pollIntervalSec);
        }
        try {
            if (typeof currentUser !== 'undefined' && currentUser) {
                if (!currentUser.organization) currentUser.organization = {};
                currentUser.organization.zabbixEnabled = enabled;
            }
        } catch (eOrg) {}
        if (payload && Array.isArray(payload.items)) {
            payload.items.forEach(function(it) {
                if (!it || !it.uniqueId) return;
                next[String(it.uniqueId)] = {
                    matched: true,
                    host: it.host || '',
                    hostid: it.hostid || '',
                    severity: it.severity != null ? Number(it.severity) : 0,
                    ok: !!it.ok,
                    problems: Array.isArray(it.problems) ? it.problems : []
                };
            });
        }
        statusByUid = next;
        applyAllPresentations();
    }

    function setEnabledHint(on) {
        enabled = !!on;
    }

    function refresh(force) {
        if (typeof getApiBase !== 'function' || !getApiBase()) return Promise.resolve();
        if (typeof getAuthToken !== 'function' || !getAuthToken()) return Promise.resolve();
        if (inFlight && !force) return Promise.resolve();
        inFlight = true;
        var url = getApiBase() + '/api/zabbix/status';
        if (force) url += (url.indexOf('?') >= 0 ? '&' : '?') + '_=' + Date.now();
        return fetch(url, {
            headers: { 'Authorization': 'Bearer ' + getAuthToken() },
            cache: 'no-store'
        }).then(function(r) {
            return r.json().then(function(body) {
                return { ok: r.ok, body: body || {} };
            });
        }).then(function(res) {
            if (!res.ok && res.body && res.body.error) {
                setStatusesFromPayload({
                    enabled: true,
                    items: [],
                    error: res.body.error,
                    pollIntervalSec: res.body.pollIntervalSec
                });
                return;
            }
            setStatusesFromPayload(res.body);
        }).catch(function() {
            /* сеть — оставляем прошлый статус */
        }).then(function() {
            inFlight = false;
        });
    }

    function stopPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function startPoll() {
        stopPoll();
        refresh(true);
        pollTimer = setInterval(function() {
            refresh(false);
        }, pollMs);
    }

    function init() {
        if (typeof getAuthToken !== 'function' || !getAuthToken()) return;
        startPoll();
    }

    global.ZabbixStatus = {
        init: init,
        refresh: refresh,
        getForPlacemark: getForPlacemark,
        applyAllPresentations: applyAllPresentations,
        refreshPlacemarkIcon: refreshPlacemarkIcon,
        isEnabled: function() { return enabled; },
        setEnabledHint: setEnabledHint,
        setPollIntervalSec: setPollIntervalSec,
        getPollIntervalSec: function() { return Math.round(pollMs / 1000); },
        getLastError: function() { return lastError; },
        stop: stopPoll
    };
    global.refreshZabbixStatuses = function(force) {
        return refresh(!!force);
    };
    global.refreshZabbixStatusPresentation = applyAllPresentations;
})(typeof window !== 'undefined' ? window : this);
