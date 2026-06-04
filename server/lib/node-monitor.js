/**
 * Доступность узлов сети: Zabbix API (на организацию) или ICMP ping (fallback).
 */
const { execFile } = require('child_process');
const db = require('../database');
const zabbixClient = require('./zabbix-client');

const DEFAULT_INTERVAL_SEC = 60;
const DEFAULT_MAX_HOSTS = 200;
const DEFAULT_CONCURRENCY = 8;
const PING_TIMEOUT_MS = 5000;

/** @type {Record<string, Record<string, { status: string, rttMs: number|null, checkedAt: string, error?: string, source?: string }>>} */
var statusByOrg = Object.create(null);
/** @type {Record<string, object[]>} */
var targetsByOrg = Object.create(null);
var schedulerTimer = null;
var runningOrgs = Object.create(null);

function loadConfig(serverConfig) {
    var raw = (serverConfig && serverConfig.nodeMonitor) || {};
    var intervalSec = parseInt(raw.intervalSec, 10);
    if (isNaN(intervalSec) || intervalSec < 15) intervalSec = DEFAULT_INTERVAL_SEC;
    if (intervalSec > 600) intervalSec = 600;
    var maxHosts = parseInt(raw.maxHostsPerOrg, 10);
    if (isNaN(maxHosts) || maxHosts < 1) maxHosts = DEFAULT_MAX_HOSTS;
    var concurrency = parseInt(raw.concurrency, 10);
    if (isNaN(concurrency) || concurrency < 1) concurrency = DEFAULT_CONCURRENCY;
    if (concurrency > 32) concurrency = 32;
    return {
        enabled: raw.enabled !== false,
        intervalSec: intervalSec,
        maxHostsPerOrg: maxHosts,
        concurrency: concurrency
    };
}

var config = loadConfig({});

function setConfig(serverConfig) {
    config = loadConfig(serverConfig || {});
}

function normalizeMonitorIp(raw) {
    if (raw == null) return '';
    var s = String(raw).trim();
    if (!s) return '';
    return s.slice(0, 253);
}

function normalizeZabbixHost(raw) {
    if (raw == null) return '';
    return String(raw).trim().slice(0, 128);
}

function normalizeZabbixHostId(raw) {
    if (raw == null) return '';
    return String(raw).trim().slice(0, 32);
}

function hasMonitorTarget(item) {
    if (!item || item.type !== 'node') return false;
    if (item.monitorEnabled === false) return false;
    var ip = normalizeMonitorIp(item.monitorIp);
    var host = normalizeZabbixHost(item.monitorZabbixHost);
    var hostId = normalizeZabbixHostId(item.monitorZabbixHostId);
    return !!(ip || host || hostId);
}

function isMonitoringEnabled(item) {
    return hasMonitorTarget(item);
}

function isValidMonitorHost(host) {
    if (!host || host.length > 253) return false;
    if (/[\s;|&$`<>]/.test(host)) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
        var parts = host.split('.');
        for (var i = 0; i < parts.length; i++) {
            var n = parseInt(parts[i], 10);
            if (isNaN(n) || n < 0 || n > 255) return false;
        }
        return true;
    }
    return /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host) && host.length <= 253;
}

function getOrgProvider(orgId) {
    var z = db.getZabbixConfigForMonitor(orgId);
    return z ? 'zabbix' : 'ping';
}

function extractTargetsFromMapData(data) {
    var out = [];
    if (!Array.isArray(data)) return out;
    data.forEach(function(item) {
        if (!hasMonitorTarget(item)) return;
        var uid = item.uniqueId != null ? String(item.uniqueId) : '';
        if (!uid) return;
        var ip = normalizeMonitorIp(item.monitorIp);
        var zHost = normalizeZabbixHost(item.monitorZabbixHost);
        var zHostId = normalizeZabbixHostId(item.monitorZabbixHostId);
        if (ip && !isValidMonitorHost(ip) && !zHost && !zHostId) return;
        out.push({
            uniqueId: uid,
            name: (item.name || '').trim() || 'Узел',
            ip: ip,
            zabbixHost: zHost,
            zabbixHostId: zHostId
        });
    });
    return out;
}

function refreshTargetsForOrg(orgId) {
    if (!orgId) return [];
    var data = db.getMapData(orgId) || [];
    var targets = extractTargetsFromMapData(data);
    if (targets.length > config.maxHostsPerOrg) {
        targets = targets.slice(0, config.maxHostsPerOrg);
    }
    targetsByOrg[String(orgId)] = targets;
    if (!statusByOrg[String(orgId)]) statusByOrg[String(orgId)] = Object.create(null);
    var orgStatus = statusByOrg[String(orgId)];
    var activeIds = Object.create(null);
    targets.forEach(function(t) { activeIds[t.uniqueId] = true; });
    Object.keys(orgStatus).forEach(function(uid) {
        if (!activeIds[uid]) delete orgStatus[uid];
    });
    targets.forEach(function(t) {
        if (!orgStatus[t.uniqueId]) {
            orgStatus[t.uniqueId] = {
                status: 'unknown',
                rttMs: null,
                checkedAt: new Date().toISOString(),
                source: getOrgProvider(orgId)
            };
        }
    });
    return targets;
}

function pingHost(host) {
    return new Promise(function(resolve) {
        if (!isValidMonitorHost(host)) {
            resolve({ up: false, rttMs: null, error: 'invalid_host' });
            return;
        }
        var args = process.platform === 'win32'
            ? ['-n', '1', '-w', '2000', host]
            : ['-c', '1', '-W', '2', host];
        execFile('ping', args, { timeout: PING_TIMEOUT_MS, windowsHide: true }, function(err, stdout) {
            if (err) {
                resolve({ up: false, rttMs: null, error: 'unreachable' });
                return;
            }
            var rttMs = null;
            var text = String(stdout || '');
            if (process.platform === 'win32') {
                var mWin = /(?:time[=<])\s*(\d+)\s*ms/i.exec(text) || /(\d+)\s*ms/i.exec(text);
                if (mWin) rttMs = parseInt(mWin[1], 10);
            } else {
                var mLin = /time[=<]?\s*([\d.]+)\s*ms/i.exec(text);
                if (mLin) rttMs = Math.round(parseFloat(mLin[1]));
            }
            resolve({ up: true, rttMs: rttMs != null && !isNaN(rttMs) ? rttMs : null });
        });
    });
}

function runPool(items, concurrency, worker) {
    return new Promise(function(resolve) {
        var i = 0;
        var active = 0;
        function next() {
            if (i >= items.length && active === 0) {
                resolve();
                return;
            }
            while (active < concurrency && i < items.length) {
                var item = items[i++];
                active++;
                worker(item).then(function() {
                    active--;
                    next();
                }).catch(function() {
                    active--;
                    next();
                });
            }
        }
        next();
    });
}

async function runOrgCheckPing(orgId, targets, orgStatus) {
    await runPool(targets, config.concurrency, async function(t) {
        var host = t.ip;
        if (!host) {
            orgStatus[t.uniqueId] = {
                status: 'unknown',
                rttMs: null,
                checkedAt: new Date().toISOString(),
                error: 'no_ip',
                source: 'ping'
            };
            return;
        }
        var result = await pingHost(host);
        orgStatus[t.uniqueId] = {
            status: result.up ? 'up' : 'down',
            rttMs: result.rttMs,
            checkedAt: new Date().toISOString(),
            error: result.error || null,
            source: 'ping'
        };
    });
}

async function runOrgCheckZabbix(orgId, zcfg, targets, orgStatus) {
    var hadError = false;
    var lastErr = '';
    await runPool(targets, config.concurrency, async function(t) {
        try {
            var result = await zabbixClient.checkTargetAvailability(zcfg, t);
            orgStatus[t.uniqueId] = {
                status: result.up ? 'up' : 'down',
                rttMs: null,
                checkedAt: new Date().toISOString(),
                error: result.error || null,
                source: 'zabbix'
            };
        } catch (e) {
            hadError = true;
            lastErr = String(e.message || e);
            orgStatus[t.uniqueId] = {
                status: 'unknown',
                rttMs: null,
                checkedAt: new Date().toISOString(),
                error: 'zabbix_error',
                source: 'zabbix'
            };
        }
    });
    if (hadError) {
        db.setZabbixConfig(orgId, { lastError: lastErr });
    } else {
        db.setZabbixConfig(orgId, { lastError: '', lastOkAt: new Date().toISOString() });
    }
}

function runOrgCheck(orgId) {
    var key = String(orgId);
    if (runningOrgs[key]) return runningOrgs[key];
    runningOrgs[key] = (async function() {
        try {
            if (!config.enabled) return;
            var targets = refreshTargetsForOrg(orgId);
            var orgStatus = statusByOrg[key] || (statusByOrg[key] = Object.create(null));
            if (!targets.length) return;
            var zcfg = db.getZabbixConfigForMonitor(orgId);
            if (zcfg) {
                await runOrgCheckZabbix(orgId, zcfg, targets, orgStatus);
            } else {
                await runOrgCheckPing(orgId, targets, orgStatus);
            }
        } finally {
            delete runningOrgs[key];
        }
    })();
    return runningOrgs[key];
}

function getAllOrgIds() {
    try {
        var orgs = db.getOrganizations() || [];
        return orgs.map(function(o) { return o && o.id; }).filter(Boolean);
    } catch (e) {
        return [];
    }
}

async function runAllOrganizations() {
    if (!config.enabled) return;
    var orgIds = getAllOrgIds();
    for (var i = 0; i < orgIds.length; i++) {
        try {
            await runOrgCheck(orgIds[i]);
        } catch (e) {}
    }
}

function notifyMapSaved(orgId) {
    if (!orgId || !config.enabled) return;
    refreshTargetsForOrg(orgId);
    runOrgCheck(orgId).catch(function() {});
}

function getStatusPayload(orgId) {
    var key = String(orgId);
    refreshTargetsForOrg(orgId);
    var targets = targetsByOrg[key] || [];
    var orgStatus = statusByOrg[key] || {};
    var provider = getOrgProvider(orgId);
    var zabbixPublic = db.getZabbixConfigPublic(orgId);
    var nodes = {};
    targets.forEach(function(t) {
        var st = orgStatus[t.uniqueId];
        nodes[t.uniqueId] = {
            status: st ? st.status : 'unknown',
            rttMs: st && st.rttMs != null ? st.rttMs : null,
            checkedAt: st ? st.checkedAt : null,
            ip: t.ip,
            name: t.name,
            zabbixHost: t.zabbixHost || '',
            source: st && st.source ? st.source : provider
        };
    });
    return {
        enabled: config.enabled,
        intervalSec: config.intervalSec,
        provider: provider,
        zabbix: zabbixPublic,
        serverCanPing: provider === 'ping',
        nodes: nodes
    };
}

function startScheduler(serverConfig) {
    setConfig(serverConfig);
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
    if (!config.enabled) return;
    runAllOrganizations().catch(function() {});
    schedulerTimer = setInterval(function() {
        runAllOrganizations().catch(function() {});
    }, config.intervalSec * 1000);
    if (schedulerTimer.unref) schedulerTimer.unref();
}

function stopScheduler() {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

function invalidateOrgZabbix(orgId) {
    if (!orgId) return;
    runOrgCheck(orgId).catch(function() {});
}

module.exports = {
    setConfig: setConfig,
    startScheduler: startScheduler,
    stopScheduler: stopScheduler,
    notifyMapSaved: notifyMapSaved,
    getStatusPayload: getStatusPayload,
    runOrgCheck: runOrgCheck,
    refreshTargetsForOrg: refreshTargetsForOrg,
    invalidateOrgZabbix: invalidateOrgZabbix,
    isValidMonitorHost: isValidMonitorHost,
    normalizeMonitorIp: normalizeMonitorIp,
    getOrgProvider: getOrgProvider
};
