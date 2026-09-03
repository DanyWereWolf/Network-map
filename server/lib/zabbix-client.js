'use strict';

/**
 * Minimal Zabbix JSON-RPC client (API token / Bearer).
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

function normalizeApiUrl(raw) {
    var s = String(raw || '').trim().replace(/\/$/, '');
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    if (!/api_jsonrpc\.php$/i.test(s)) {
        s = s.replace(/\/$/, '') + '/api_jsonrpc.php';
    }
    return s;
}

function rpcCall(apiUrl, token, method, params, options) {
    options = options || {};
    return new Promise(function(resolve, reject) {
        var endpoint = normalizeApiUrl(apiUrl);
        if (!endpoint) return reject(new Error('Не указан URL API Zabbix'));
        if (!token) return reject(new Error('Не указан API-токен Zabbix'));

        var payloadObj = {
            jsonrpc: '2.0',
            method: method,
            params: params || {},
            id: 1
        };
        if (options.authInBody) {
            payloadObj.auth = token;
        }
        var body = JSON.stringify(payloadObj);
        var url;
        try {
            url = new URL(endpoint);
        } catch (e) {
            return reject(new Error('Некорректный URL API Zabbix'));
        }

        var transport = url.protocol === 'http:' ? http : https;
        var req = transport.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (url.protocol === 'http:' ? 80 : 443),
            path: url.pathname + (url.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json-rpc',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': 'Bearer ' + token,
                'User-Agent': 'Volsmap-ZabbixClient/1.0'
            },
            timeout: options.timeoutMs || 20000
        }, function(res) {
            var chunks = [];
            res.on('data', function(c) { chunks.push(c); });
            res.on('end', function() {
                var text = Buffer.concat(chunks).toString('utf8');
                var parsed;
                try {
                    parsed = JSON.parse(text);
                } catch (e) {
                    return reject(new Error('Zabbix вернул не-JSON (HTTP ' + res.statusCode + ')'));
                }
                if (parsed.error) {
                    var msg = (parsed.error.data || parsed.error.message || 'Ошибка Zabbix API');
                    return reject(new Error(String(msg)));
                }
                resolve(parsed.result);
            });
        });
        req.on('timeout', function() {
            req.destroy();
            reject(new Error('Таймаут запроса к Zabbix'));
        });
        req.on('error', function(err) {
            reject(new Error(err && err.message ? err.message : 'Сеть: ошибка запроса к Zabbix'));
        });
        req.write(body);
        req.end();
    });
}

async function callWithFallback(apiUrl, token, method, params, options) {
    try {
        return await rpcCall(apiUrl, token, method, params, options);
    } catch (e) {
        var msg = String(e && e.message || '');
        // Старые Zabbix / прокси без Bearer — повторяем с auth в body
        if (/auth|token|unauthorized|permission|not authorized/i.test(msg) || /HTTP 401/.test(msg)) {
            return rpcCall(apiUrl, token, method, params, Object.assign({}, options, { authInBody: true }));
        }
        throw e;
    }
}

async function testConnection(apiUrl, token) {
    var version = '';
    try {
        var v = await callWithFallback(apiUrl, token, 'apiinfo.version', {});
        version = v != null ? String(v) : '';
    } catch (e) { /* optional */ }
    await callWithFallback(apiUrl, token, 'host.get', {
        output: ['hostid'],
        limit: 1
    });
    return { ok: true, version: version };
}

async function fetchHostsWithInterfaces(apiUrl, token) {
    return callWithFallback(apiUrl, token, 'host.get', {
        output: ['hostid', 'host', 'name', 'status'],
        selectInterfaces: ['interfaceid', 'ip', 'dns', 'main', 'type'],
        filter: { status: 0 }
    });
}

async function fetchActiveProblems(apiUrl, token) {
    return callWithFallback(apiUrl, token, 'problem.get', {
        output: ['eventid', 'objectid', 'name', 'severity', 'clock'],
        source: 0,
        object: 0,
        recent: false,
        severities: [1, 2, 3, 4, 5],
        sortfield: ['eventid'],
        sortorder: 'DESC'
    });
}

async function fetchTriggerHostMap(apiUrl, token, triggerIds) {
    var ids = (triggerIds || []).filter(Boolean);
    if (!ids.length) return {};
    var unique = [];
    var seen = Object.create(null);
    ids.forEach(function(id) {
        var k = String(id);
        if (!seen[k]) { seen[k] = 1; unique.push(k); }
    });
    var triggers = await callWithFallback(apiUrl, token, 'trigger.get', {
        output: ['triggerid'],
        triggerids: unique,
        selectHosts: ['hostid']
    });
    var map = Object.create(null);
    (triggers || []).forEach(function(t) {
        var hosts = t.hosts || [];
        if (!hosts.length) return;
        map[String(t.triggerid)] = String(hosts[0].hostid);
    });
    return map;
}

module.exports = {
    normalizeApiUrl: normalizeApiUrl,
    testConnection: testConnection,
    fetchHostsWithInterfaces: fetchHostsWithInterfaces,
    fetchActiveProblems: fetchActiveProblems,
    fetchTriggerHostMap: fetchTriggerHostMap,
    callWithFallback: callWithFallback
};
