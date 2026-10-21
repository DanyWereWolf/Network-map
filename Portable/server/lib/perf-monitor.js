'use strict';

/**
 * Мониторинг нагрузки для админки (вкладка «Нагрузка»).
 * Всё хранится только в памяти процесса: счётчики, кольцевая история за ~1 час,
 * последние замеры от браузеров. После рестарта сервера статистика начинается заново.
 */
const os = require('os');
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const SAMPLE_INTERVAL_MS = 10 * 1000;
const HISTORY_LEN = 360;
const ROUTE_SAMPLE_LEN = 200;
const MINUTE_MS = 60 * 1000;
const WINDOW_MINUTES = 15;
const MAP_ANALYSIS_TTL_MS = 60 * 1000;
const CLIENT_REPORT_TTL_MS = 30 * 60 * 1000;
const CLIENT_REPORT_MIN_INTERVAL_MS = 20 * 1000;
const MAX_ROUTES = 300;
const MAX_CLIENT_REPORTS = 500;

var startedAt = Date.now();
var eld = null;
try {
    eld = monitorEventLoopDelay({ resolution: 20 });
    eld.enable();
} catch (e) {
    eld = null;
}
var lastCpu = process.cpuUsage();
var lastCpuAt = performance.now();
var lastElu = typeof performance.eventLoopUtilization === 'function' ? performance.eventLoopUtilization() : null;
var history = [];
var gauges = Object.create(null);

var httpRoutes = new Map();
var httpTotals = { count: 0, errors: 0, bytes: 0 };
var httpPerMinute = createWindowCounter();
var intervalCounters = { http: 0, wsIn: 0, wsOut: 0, wsInBytes: 0, wsOutBytes: 0 };

var wsTypes = new Map();
var orgStats = new Map();
var mapAnalysisCache = new Map();
var clientReports = new Map();

function createWindowCounter() {
    return { buckets: new Map(), total: 0 };
}

function counterAdd(counter, n) {
    var v = n == null ? 1 : n;
    var minute = Math.floor(Date.now() / MINUTE_MS);
    counter.buckets.set(minute, (counter.buckets.get(minute) || 0) + v);
    counter.total += v;
    if (counter.buckets.size > WINDOW_MINUTES + 2) {
        var minKeep = minute - WINDOW_MINUTES;
        counter.buckets.forEach(function(_val, key) {
            if (key < minKeep) counter.buckets.delete(key);
        });
    }
}

/** Сумма за последние `minutes` минут (текущая неполная минута включается). */
function counterSum(counter, minutes) {
    var minute = Math.floor(Date.now() / MINUTE_MS);
    var from = minute - Math.max(1, minutes) + 1;
    var sum = 0;
    counter.buckets.forEach(function(val, key) {
        if (key >= from) sum += val;
    });
    return sum;
}

function round(n, digits) {
    if (!isFinite(n)) return 0;
    var p = Math.pow(10, digits == null ? 1 : digits);
    return Math.round(n * p) / p;
}

function percentile(values, p) {
    if (!values || !values.length) return 0;
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
}

function registerGauge(name, fn) {
    if (typeof fn === 'function') gauges[name] = fn;
}

function readGauges() {
    var out = {};
    Object.keys(gauges).forEach(function(name) {
        try { out[name] = gauges[name](); } catch (e) { out[name] = null; }
    });
    return out;
}

function takeSample() {
    var now = performance.now();
    var cpu = process.cpuUsage(lastCpu);
    var elapsedMs = Math.max(1, now - lastCpuAt);
    lastCpu = process.cpuUsage();
    lastCpuAt = now;
    var cpuPercent = ((cpu.user + cpu.system) / 1000) / elapsedMs * 100;

    var eluPercent = null;
    if (lastElu && typeof performance.eventLoopUtilization === 'function') {
        var eluNow = performance.eventLoopUtilization();
        var diff = performance.eventLoopUtilization(eluNow, lastElu);
        lastElu = eluNow;
        eluPercent = diff.utilization * 100;
    }

    var loop = { meanMs: 0, p99Ms: 0, maxMs: 0 };
    if (eld) {
        loop.meanMs = eld.mean / 1e6;
        loop.p99Ms = eld.percentile(99) / 1e6;
        loop.maxMs = eld.max / 1e6;
        eld.reset();
    }

    var mem = process.memoryUsage();
    var g = readGauges();
    var sample = {
        at: Date.now(),
        cpuPercent: round(cpuPercent, 1),
        eluPercent: eluPercent == null ? null : round(eluPercent, 1),
        loopMeanMs: round(loop.meanMs, 2),
        loopP99Ms: round(loop.p99Ms, 2),
        loopMaxMs: round(loop.maxMs, 2),
        rssMb: round(mem.rss / 1048576, 1),
        heapUsedMb: round(mem.heapUsed / 1048576, 1),
        heapTotalMb: round(mem.heapTotal / 1048576, 1),
        externalMb: round((mem.external || 0) / 1048576, 1),
        httpPerMin: round(intervalCounters.http * (MINUTE_MS / elapsedMs), 1),
        wsInPerMin: round(intervalCounters.wsIn * (MINUTE_MS / elapsedMs), 1),
        wsOutPerMin: round(intervalCounters.wsOut * (MINUTE_MS / elapsedMs), 1),
        wsInKbPerMin: round(intervalCounters.wsInBytes / 1024 * (MINUTE_MS / elapsedMs), 1),
        wsOutKbPerMin: round(intervalCounters.wsOutBytes / 1024 * (MINUTE_MS / elapsedMs), 1),
        wsClients: g.wsClients != null ? g.wsClients : null
    };
    intervalCounters.http = 0;
    intervalCounters.wsIn = 0;
    intervalCounters.wsOut = 0;
    intervalCounters.wsInBytes = 0;
    intervalCounters.wsOutBytes = 0;
    history.push(sample);
    if (history.length > HISTORY_LEN) history.splice(0, history.length - HISTORY_LEN);
    pruneClientReports();
    return sample;
}

var sampleTimer = setInterval(takeSample, SAMPLE_INTERVAL_MS);
if (sampleTimer && typeof sampleTimer.unref === 'function') sampleTimer.unref();

/* ---------- HTTP ---------- */

var ID_SEGMENT_RE = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|(tk|emb|id|org|u|usr)_[\w-]+|[\w-]{24,})$/i;

function normalizePath(p) {
    return String(p || '/')
        .split('/')
        .map(function(seg) { return seg && ID_SEGMENT_RE.test(seg) ? ':id' : seg; })
        .join('/');
}

function routeKeyFor(req) {
    var routePath = req.route && req.route.path;
    if (typeof routePath === 'string') return req.method + ' ' + (req.baseUrl || '') + routePath;
    return req.method + ' ' + normalizePath(req.path);
}

function recordHttp(key, ms, status, bytes) {
    httpTotals.count++;
    intervalCounters.http++;
    counterAdd(httpPerMinute, 1);
    if (status >= 500) httpTotals.errors++;
    httpTotals.bytes += bytes || 0;
    var r = httpRoutes.get(key);
    if (!r) {
        if (httpRoutes.size >= MAX_ROUTES) key = 'OTHER';
        r = httpRoutes.get(key);
        if (!r) {
            r = { key: key, count: 0, errors: 0, totalMs: 0, maxMs: 0, bytes: 0, samples: [], perMin: createWindowCounter() };
            httpRoutes.set(key, r);
        }
    }
    r.count++;
    r.totalMs += ms;
    if (ms > r.maxMs) r.maxMs = ms;
    if (status >= 500) r.errors++;
    r.bytes += bytes || 0;
    r.samples.push(ms);
    if (r.samples.length > ROUTE_SAMPLE_LEN) r.samples.shift();
    counterAdd(r.perMin, 1);
}

function httpMiddleware(req, res, next) {
    if (!req.path || req.path.indexOf('/api/') !== 0) return next();
    var t0 = process.hrtime.bigint();
    res.on('finish', function() {
        try {
            var ms = Number(process.hrtime.bigint() - t0) / 1e6;
            var len = parseInt(res.getHeader('content-length'), 10) || 0;
            recordHttp(routeKeyFor(req), ms, res.statusCode, len);
        } catch (e) {}
    });
    next();
}

/* ---------- WebSocket ---------- */

function getOrgStats(orgId) {
    var key = orgId == null ? '' : String(orgId);
    var s = orgStats.get(key);
    if (!s) {
        s = {
            ops: createWindowCounter(),
            states: createWindowCounter(),
            wsInBytes: createWindowCounter(),
            wsOutBytes: createWindowCounter(),
            wsOutMessages: createWindowCounter(),
            saves: { count: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastAt: 0, lastItems: 0, samples: [] }
        };
        orgStats.set(key, s);
    }
    return s;
}

function recordWsMessage(orgId, type, bytes, ms) {
    var t = String(type || 'unknown').slice(0, 40);
    intervalCounters.wsIn++;
    intervalCounters.wsInBytes += bytes || 0;
    var w = wsTypes.get(t);
    if (!w) {
        if (wsTypes.size >= 60) t = 'other';
        w = wsTypes.get(t);
        if (!w) {
            w = { type: t, count: 0, bytes: 0, totalMs: 0, maxMs: 0, perMin: createWindowCounter() };
            wsTypes.set(t, w);
        }
    }
    w.count++;
    w.bytes += bytes || 0;
    w.totalMs += ms || 0;
    if ((ms || 0) > w.maxMs) w.maxMs = ms;
    counterAdd(w.perMin, 1);
    if (orgId == null) return;
    var s = getOrgStats(orgId);
    counterAdd(s.wsInBytes, bytes || 0);
    if (t === 'op') counterAdd(s.ops, 1);
    else if (t === 'state') counterAdd(s.states, 1);
}

/** Считает исходящий трафик сокета; орг берётся на момент отправки (после hello). */
function instrumentWs(ws) {
    if (!ws || ws.__perfInstrumented) return;
    ws.__perfInstrumented = true;
    var origSend = ws.send;
    ws.send = function(data) {
        try {
            var len = data == null ? 0 : (typeof data === 'string' ? data.length : (data.byteLength || data.length || 0));
            intervalCounters.wsOut++;
            intervalCounters.wsOutBytes += len;
            if (ws.orgId != null) {
                var s = getOrgStats(ws.orgId);
                counterAdd(s.wsOutBytes, len);
                counterAdd(s.wsOutMessages, 1);
            }
        } catch (e) {}
        return origSend.apply(ws, arguments);
    };
}

/* ---------- Сохранения карты ---------- */

function recordMapSave(orgId, ms, items) {
    if (orgId == null) return;
    var sv = getOrgStats(orgId).saves;
    sv.count++;
    sv.totalMs += ms;
    if (ms > sv.maxMs) sv.maxMs = ms;
    sv.lastMs = ms;
    sv.lastAt = Date.now();
    sv.lastItems = items || 0;
    sv.samples.push(ms);
    if (sv.samples.length > 100) sv.samples.shift();
}

/** Оборачивает db.setMapData, чтобы мерить время записи карты (синхронную часть или промис). */
function wrapMapSave(db) {
    if (!db || typeof db.setMapData !== 'function' || db.setMapData.__perfWrapped) return;
    var orig = db.setMapData;
    var wrapped = function(orgId, data) {
        var t0 = performance.now();
        var items = Array.isArray(data) ? data.length : 0;
        var result;
        try {
            result = orig.apply(this, arguments);
        } catch (e) {
            recordMapSave(orgId, performance.now() - t0, items);
            throw e;
        }
        if (result && typeof result.then === 'function') {
            result.then(function() {
                recordMapSave(orgId, performance.now() - t0, items);
            }, function() {
                recordMapSave(orgId, performance.now() - t0, items);
            });
        } else {
            recordMapSave(orgId, performance.now() - t0, items);
        }
        return result;
    };
    wrapped.__perfWrapped = true;
    db.setMapData = wrapped;
}

/* ---------- Анализ состава карты ---------- */

function geometryPointCount(geometry) {
    if (!Array.isArray(geometry) || !geometry.length) return 0;
    if (typeof geometry[0] === 'number') return 1;
    var n = 0;
    for (var i = 0; i < geometry.length; i++) n += geometryPointCount(geometry[i]);
    return n;
}

function safeJsonLength(value) {
    try {
        var s = JSON.stringify(value);
        return s ? s.length : 0;
    } catch (e) {
        return 0;
    }
}

function analyzeMapData(arr, labelFn) {
    var res = {
        items: 0,
        bytes: 0,
        byType: [],
        cablePoints: 0,
        regionPoints: 0,
        fiberSplices: 0,
        crossPatches: 0,
        photos: 0,
        photosBytes: 0,
        nestedSwitches: 0,
        largest: [],
        analyzedMs: 0
    };
    if (!Array.isArray(arr)) return res;
    var t0 = performance.now();
    var types = Object.create(null);
    var largest = [];
    res.items = arr.length;
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item || typeof item !== 'object') continue;
        var type = item.type ? String(item.type) : 'unknown';
        var size = safeJsonLength(item);
        res.bytes += size;
        var bucket = types[type];
        if (!bucket) bucket = types[type] = { type: type, count: 0, bytes: 0 };
        bucket.count++;
        bucket.bytes += size;
        if (type === 'cable') res.cablePoints += geometryPointCount(item.geometry);
        if (type === 'region') res.regionPoints += geometryPointCount(item.geometry);
        if (Array.isArray(item.fiberConnections)) res.fiberSplices += item.fiberConnections.length;
        if (Array.isArray(item.crossPortPatches)) res.crossPatches += item.crossPortPatches.length;
        if (Array.isArray(item.photos) && item.photos.length) {
            res.photos += item.photos.length;
            res.photosBytes += safeJsonLength(item.photos);
        }
        if (type === 'node' && Array.isArray(item.attachedSwitches)) res.nestedSwitches += item.attachedSwitches.length;
        if (largest.length < 8 || size > largest[largest.length - 1].bytes) {
            largest.push({
                type: type,
                label: labelFn ? labelFn(type) : type,
                name: String(item.name || item.cableName || item.uniqueId || '').slice(0, 80),
                uniqueId: item.uniqueId != null ? String(item.uniqueId) : null,
                bytes: size
            });
            largest.sort(function(a, b) { return b.bytes - a.bytes; });
            if (largest.length > 8) largest.length = 8;
        }
    }
    res.byType = Object.keys(types).map(function(k) {
        var b = types[k];
        return { type: b.type, label: labelFn ? labelFn(b.type) : b.type, count: b.count, bytes: b.bytes };
    }).sort(function(a, b) { return b.bytes - a.bytes; });
    res.largest = largest;
    res.analyzedMs = round(performance.now() - t0, 1);
    return res;
}

/** Кэш анализа: пересчёт не чаще раза в минуту и только если массив карты сменился. */
function getMapAnalysis(orgId, arr, labelFn, force) {
    var key = String(orgId);
    var cached = mapAnalysisCache.get(key);
    var len = Array.isArray(arr) ? arr.length : 0;
    if (!force && cached && cached.arr === arr && cached.len === len && (Date.now() - cached.at) < MAP_ANALYSIS_TTL_MS) {
        return cached.result;
    }
    var result = analyzeMapData(arr, labelFn);
    mapAnalysisCache.set(key, { arr: arr, len: len, at: Date.now(), result: result });
    return result;
}

function forgetOrg(orgId) {
    var key = String(orgId);
    mapAnalysisCache.delete(key);
    orgStats.delete(key);
}

function getOrgLoad(orgId) {
    var s = orgStats.get(orgId == null ? '' : String(orgId));
    if (!s) {
        return {
            opsPerMin: 0, ops15m: 0, statesPer15m: 0,
            wsInKb5m: 0, wsOutKb5m: 0, wsOutMessages5m: 0,
            saves: { count: 0, avgMs: 0, p95Ms: 0, maxMs: 0, lastMs: 0, lastAt: 0, lastItems: 0 }
        };
    }
    var sv = s.saves;
    return {
        opsPerMin: round(counterSum(s.ops, 5) / 5, 1),
        ops15m: counterSum(s.ops, 15),
        statesPer15m: counterSum(s.states, 15),
        wsInKb5m: round(counterSum(s.wsInBytes, 5) / 1024, 1),
        wsOutKb5m: round(counterSum(s.wsOutBytes, 5) / 1024, 1),
        wsOutMessages5m: counterSum(s.wsOutMessages, 5),
        saves: {
            count: sv.count,
            avgMs: sv.count ? round(sv.totalMs / sv.count, 1) : 0,
            p95Ms: round(percentile(sv.samples, 95), 1),
            maxMs: round(sv.maxMs, 1),
            lastMs: round(sv.lastMs, 1),
            lastAt: sv.lastAt,
            lastItems: sv.lastItems
        }
    };
}

/* ---------- Замеры из браузеров ---------- */

function num(v, max) {
    var n = Number(v);
    if (!isFinite(n) || n < 0) return null;
    return max != null && n > max ? max : n;
}

function recordClientReport(user, body, meta) {
    if (!user || !body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
    var key = String(user.userId) + '|' + String(body.clientKey || '').slice(0, 40);
    var prev = clientReports.get(key);
    var now = Date.now();
    if (prev && now - prev.at < CLIENT_REPORT_MIN_INTERVAL_MS) return { ok: true, throttled: true };
    var byType = {};
    if (body.objectsByType && typeof body.objectsByType === 'object') {
        Object.keys(body.objectsByType).slice(0, 40).forEach(function(k) {
            var n = num(body.objectsByType[k], 1e7);
            if (n != null) byType[String(k).slice(0, 40)] = n;
        });
    }
    var loadSteps = [];
    if (Array.isArray(body.loadSteps)) {
        body.loadSteps.slice(0, 30).forEach(function(s) {
            if (!s || typeof s !== 'object') return;
            var ms = num(s.ms, 1e8);
            if (ms == null) return;
            loadSteps.push({ name: String(s.name || '').slice(0, 60), ms: ms });
        });
    }
    var report = {
        at: now,
        loadSteps: loadSteps,
        userId: user.userId,
        username: meta && meta.username ? String(meta.username) : null,
        organizationId: user.organizationId || null,
        organizationName: meta && meta.organizationName ? String(meta.organizationName) : null,
        fpsAvg: num(body.fpsAvg, 1000),
        fpsMin: num(body.fpsMin, 1000),
        longTasksPerMin: num(body.longTasksPerMin, 1e5),
        longTaskMsPerMin: num(body.longTaskMsPerMin, 1e7),
        heapUsedMb: num(body.heapUsedMb, 1e6),
        heapLimitMb: num(body.heapLimitMb, 1e6),
        domNodes: num(body.domNodes, 1e8),
        objects: num(body.objects, 1e8),
        mounted: num(body.mounted, 1e8),
        objectsByType: byType,
        mapLoadMs: num(body.mapLoadMs, 1e8),
        lastImportMs: num(body.lastImportMs, 1e8),
        lastImportItems: num(body.lastImportItems, 1e8),
        wsMessagesPerMin: num(body.wsMessagesPerMin, 1e7),
        perfPreset: body.perfPreset ? String(body.perfPreset).slice(0, 20) : null,
        virtualization: !!body.virtualization,
        cores: num(body.cores, 1024),
        deviceMemoryGb: num(body.deviceMemoryGb, 1024),
        screen: body.screen ? String(body.screen).slice(0, 20) : null,
        userAgent: meta && meta.userAgent ? String(meta.userAgent).slice(0, 300) : null
    };
    clientReports.set(key, report);
    if (clientReports.size > MAX_CLIENT_REPORTS) pruneClientReports(true);
    return { ok: true };
}

function pruneClientReports(force) {
    var now = Date.now();
    clientReports.forEach(function(r, key) {
        if (now - r.at > CLIENT_REPORT_TTL_MS) clientReports.delete(key);
    });
    if (force && clientReports.size > MAX_CLIENT_REPORTS) {
        var list = Array.from(clientReports.entries()).sort(function(a, b) { return a[1].at - b[1].at; });
        for (var i = 0; i < list.length - MAX_CLIENT_REPORTS; i++) clientReports.delete(list[i][0]);
    }
}

function listClientReports() {
    pruneClientReports();
    return Array.from(clientReports.values()).sort(function(a, b) {
        return (a.fpsAvg == null ? 999 : a.fpsAvg) - (b.fpsAvg == null ? 999 : b.fpsAvg);
    });
}

/* ---------- Сводка ---------- */

function getServerSnapshot() {
    var mem = process.memoryUsage();
    var last = history.length ? history[history.length - 1] : takeSample();
    var cpus = 1;
    var cpuModel = '';
    try {
        var list = os.cpus();
        if (list && list.length) {
            cpus = list.length;
            cpuModel = String(list[0].model || '').trim();
        }
    } catch (e) {}
    return {
        startedAt: startedAt,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        node: process.version,
        platform: process.platform + ' ' + os.release(),
        pid: process.pid,
        cpus: cpus,
        cpuModel: cpuModel,
        cpuPercent: last.cpuPercent,
        eluPercent: last.eluPercent,
        loopMeanMs: last.loopMeanMs,
        loopP99Ms: last.loopP99Ms,
        loopMaxMs: last.loopMaxMs,
        memory: {
            rssMb: round(mem.rss / 1048576, 1),
            heapUsedMb: round(mem.heapUsed / 1048576, 1),
            heapTotalMb: round(mem.heapTotal / 1048576, 1),
            externalMb: round((mem.external || 0) / 1048576, 1),
            arrayBuffersMb: round((mem.arrayBuffers || 0) / 1048576, 1)
        },
        system: {
            totalMemMb: round(os.totalmem() / 1048576, 0),
            freeMemMb: round(os.freemem() / 1048576, 0),
            loadavg: os.loadavg().map(function(v) { return round(v, 2); })
        },
        gauges: readGauges(),
        sampleIntervalMs: SAMPLE_INTERVAL_MS
    };
}

function getHttpSnapshot(limit) {
    var routes = Array.from(httpRoutes.values()).map(function(r) {
        return {
            key: r.key,
            count: r.count,
            errors: r.errors,
            avgMs: r.count ? round(r.totalMs / r.count, 1) : 0,
            p95Ms: round(percentile(r.samples, 95), 1),
            maxMs: round(r.maxMs, 1),
            totalSec: round(r.totalMs / 1000, 1),
            kb: round(r.bytes / 1024, 0),
            perMin: round(counterSum(r.perMin, 5) / 5, 1)
        };
    }).sort(function(a, b) { return b.totalSec - a.totalSec; });
    return {
        total: httpTotals.count,
        errors: httpTotals.errors,
        mb: round(httpTotals.bytes / 1048576, 1),
        perMin: round(counterSum(httpPerMinute, 5) / 5, 1),
        routes: routes.slice(0, limit || 30)
    };
}

function getWsSnapshot() {
    return Array.from(wsTypes.values()).map(function(w) {
        return {
            type: w.type,
            count: w.count,
            kb: round(w.bytes / 1024, 0),
            avgMs: w.count ? round(w.totalMs / w.count, 2) : 0,
            maxMs: round(w.maxMs, 1),
            perMin: round(counterSum(w.perMin, 5) / 5, 1)
        };
    }).sort(function(a, b) { return b.count - a.count; });
}

function getHistory() {
    return history.slice();
}

module.exports = {
    registerGauge: registerGauge,
    httpMiddleware: httpMiddleware,
    instrumentWs: instrumentWs,
    recordWsMessage: recordWsMessage,
    wrapMapSave: wrapMapSave,
    getMapAnalysis: getMapAnalysis,
    getOrgLoad: getOrgLoad,
    forgetOrg: forgetOrg,
    recordClientReport: recordClientReport,
    listClientReports: listClientReports,
    getServerSnapshot: getServerSnapshot,
    getHttpSnapshot: getHttpSnapshot,
    getWsSnapshot: getWsSnapshot,
    getHistory: getHistory
};
