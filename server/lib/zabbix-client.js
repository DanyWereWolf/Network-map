/**
 * Минимальный клиент Zabbix JSON-RPC API (токен Bearer, Zabbix 6+).
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

var rpcId = 1;

function normalizeApiUrl(url) {
    var u = String(url || '').trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
        var parsed = new URL(u);
        if (/\/api_jsonrpc\.php$/i.test(parsed.pathname)) return parsed.href;
        var path = parsed.pathname.replace(/\/$/, '');
        return parsed.origin + path + '/api_jsonrpc.php';
    } catch (e) {
        return null;
    }
}

function jsonRpc(config, method, params) {
    return new Promise(function(resolve, reject) {
        var apiUrl = normalizeApiUrl(config.url);
        if (!apiUrl) return reject(new Error('Некорректный URL Zabbix'));
        if (!config.apiToken) return reject(new Error('API-токен не задан'));
        var body = JSON.stringify({
            jsonrpc: '2.0',
            method: method,
            params: params || {},
            id: rpcId++
        });
        var parsed = new URL(apiUrl);
        var lib = parsed.protocol === 'https:' ? https : http;
        var opts = {
            method: 'POST',
            hostname: parsed.hostname,
            port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path: parsed.pathname + parsed.search,
            headers: {
                'Content-Type': 'application/json-rpc',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': 'Bearer ' + String(config.apiToken)
            },
            timeout: 20000
        };
        var req = lib.request(opts, function(res) {
            var data = '';
            res.on('data', function(chunk) { data += chunk; });
            res.on('end', function() {
                try {
                    var j = JSON.parse(data || '{}');
                    if (j.error) {
                        var msg = (j.error.data && String(j.error.data)) || j.error.message || 'Ошибка Zabbix API';
                        return reject(new Error(msg));
                    }
                    resolve(j.result);
                } catch (e) {
                    reject(new Error('Некорректный ответ Zabbix'));
                }
            });
        });
        req.on('error', function(e) { reject(e); });
        req.on('timeout', function() {
            req.destroy();
            reject(new Error('Таймаут подключения к Zabbix'));
        });
        req.write(body);
        req.end();
    });
}

function aggregateInterfaceAvailable(interfaces) {
    if (!interfaces || !interfaces.length) return { found: false, up: false };
    var best = 0;
    interfaces.forEach(function(iface) {
        var a = parseInt(iface.available, 10);
        if (a === 2) best = 2;
        else if (a === 1 && best !== 2) best = 1;
    });
    if (best === 0) return { found: true, up: false, unknown: true };
    return { found: true, up: best === 1, unknown: false };
}

function checkTargetAvailability(config, target) {
    var hostId = target.zabbixHostId ? String(target.zabbixHostId).trim() : '';
    var hostName = target.zabbixHost ? String(target.zabbixHost).trim() : '';
    var ip = target.ip ? String(target.ip).trim() : '';

    if (hostId) {
        return jsonRpc(config, 'host.get', {
            output: ['hostid', 'status'],
            hostids: [hostId],
            selectInterfaces: ['available', 'ip', 'main']
        }).then(function(rows) {
            if (!rows || !rows.length) return { up: false, error: 'host_not_found' };
            if (String(rows[0].status) === '1') return { up: false, error: 'host_disabled' };
            var agg = aggregateInterfaceAvailable(rows[0].interfaces || []);
            if (!agg.found) return { up: false, error: 'no_interface' };
            return { up: agg.up, error: agg.up ? null : (agg.unknown ? 'unknown' : 'unavailable') };
        });
    }

    if (hostName) {
        return jsonRpc(config, 'host.get', {
            output: ['hostid', 'status'],
            filter: { host: [hostName] },
            selectInterfaces: ['available', 'ip', 'main'],
            limit: 1
        }).then(function(rows) {
            if (!rows || !rows.length) return { up: false, error: 'host_not_found' };
            if (String(rows[0].status) === '1') return { up: false, error: 'host_disabled' };
            var agg = aggregateInterfaceAvailable(rows[0].interfaces || []);
            if (!agg.found) return { up: false, error: 'no_interface' };
            return { up: agg.up, error: agg.up ? null : (agg.unknown ? 'unknown' : 'unavailable') };
        });
    }

    if (ip) {
        return jsonRpc(config, 'hostinterface.get', {
            output: ['available', 'interfaceid'],
            filter: { ip: ip },
            limit: 10
        }).then(function(rows) {
            if (!rows || !rows.length) return { up: false, error: 'ip_not_found' };
            var agg = aggregateInterfaceAvailable(rows);
            return { up: agg.up, error: agg.up ? null : (agg.unknown ? 'unknown' : 'unavailable') };
        });
    }

    return Promise.resolve({ up: false, error: 'no_target' });
}

function testConnection(config) {
    return jsonRpc(config, 'apiinfo.version', {}).then(function(version) {
        return { ok: true, version: version || '' };
    });
}

module.exports = {
    normalizeApiUrl: normalizeApiUrl,
    jsonRpc: jsonRpc,
    testConnection: testConnection,
    checkTargetAvailability: checkTargetAvailability
};
