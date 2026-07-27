/**
 * Диагностика долгих задач (INP / Long Tasks) на карте.
 *
 * Включение:
 *   ?perf=1 в URL
 *   localStorage.setItem('mapPerfLog', '1')
 *   MapPerfLog.enable()
 *
 * В консоли фильтр: [MapPerf]
 * Отчёт: MapPerfLog.report()
 */
(function(global) {
    var STORAGE_KEY = 'mapPerfLog';
    var enabled = false;
    var entries = [];
    var MAX_ENTRIES = 400;
    var longTaskObserver = null;
    var markSeq = 0;

    function nowMs() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    function isEnabledByDefault() {
        try {
            if (typeof location !== 'undefined' && /(?:\?|&)perf=1(?:&|$)/.test(location.search || '')) return true;
            if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1') return true;
        } catch (e) {}
        return false;
    }

    function pushEntry(entry) {
        entries.push(entry);
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    }

    function logLine(level, msg, detail) {
        if (!enabled) return;
        var args = ['%c[MapPerf]%c ' + msg, 'color:#2563eb;font-weight:700', 'color:inherit'];
        if (detail !== undefined) args.push(detail);
        if (level === 'warn') console.warn.apply(console, args);
        else if (level === 'error') console.error.apply(console, args);
        else console.log.apply(console, args);
    }

    function startLongTaskObserver() {
        if (longTaskObserver || typeof PerformanceObserver === 'undefined') return;
        try {
            longTaskObserver = new PerformanceObserver(function(list) {
                if (!enabled) return;
                var items = list.getEntries();
                for (var i = 0; i < items.length; i++) {
                    var e = items[i];
                    var dur = Math.round(e.duration);
                    var row = {
                        kind: 'longtask',
                        name: e.name || 'longtask',
                        duration: dur,
                        start: Math.round(e.startTime),
                        at: Date.now()
                    };
                    pushEntry(row);
                    var level = dur >= 1000 ? 'error' : (dur >= 200 ? 'warn' : 'log');
                    logLine(level, 'Long Task ' + dur + 'ms @' + row.start + 'ms', row);
                }
            });
            longTaskObserver.observe({ entryTypes: ['longtask'] });
        } catch (eObs) {
            longTaskObserver = null;
        }
    }

    function stopLongTaskObserver() {
        if (!longTaskObserver) return;
        try { longTaskObserver.disconnect(); } catch (e) {}
        longTaskObserver = null;
    }

    function enable() {
        if (enabled) return;
        enabled = true;
        try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
        startLongTaskObserver();
        logLine('log', 'enabled — смотрите Long Tasks и measure(). Отчёт: MapPerfLog.report()');
        snapshotMap();
    }

    function disable() {
        enabled = false;
        stopLongTaskObserver();
        try { localStorage.setItem(STORAGE_KEY, '0'); } catch (e) {}
        logLine('log', 'disabled');
    }

    function clear() {
        entries = [];
        logLine('log', 'entries cleared');
    }

    function snapshotMap() {
        if (!enabled) return null;
        var n = (typeof objects !== 'undefined' && Array.isArray(objects)) ? objects.length : 0;
        var mounted = (global.MapPerf && global.MapPerf.isMounted) ? 'MapPerf on' : 'MapPerf n/a';
        var snap = {
            kind: 'snapshot',
            objects: n,
            bulkImport: typeof isMapBulkImportActive === 'function' ? !!isMapBulkImportActive() : false,
            note: mounted,
            at: Date.now()
        };
        pushEntry(snap);
        logLine('log', 'snapshot objects=' + n + (snap.bulkImport ? ' (bulk import)' : ''), snap);
        return snap;
    }

    function measure(name, fn) {
        if (typeof fn !== 'function') return;
        if (!enabled) return fn();
        var id = ++markSeq;
        var t0 = nowMs();
        var ok = true;
        var result;
        try {
            result = fn();
            return result;
        } catch (err) {
            ok = false;
            throw err;
        } finally {
            var dur = Math.round(nowMs() - t0);
            var row = {
                kind: 'measure',
                name: String(name || 'anon'),
                duration: dur,
                ok: ok,
                id: id,
                objects: (typeof objects !== 'undefined' && Array.isArray(objects)) ? objects.length : null,
                at: Date.now()
            };
            pushEntry(row);
            var level = dur >= 1000 ? 'error' : (dur >= 100 ? 'warn' : 'log');
            logLine(level, name + ' → ' + dur + 'ms' + (ok ? '' : ' (threw)'), row);
        }
    }

    function measureAsync(name, promiseOrFn) {
        if (!enabled) {
            return typeof promiseOrFn === 'function' ? Promise.resolve(promiseOrFn()) : Promise.resolve(promiseOrFn);
        }
        var t0 = nowMs();
        var p = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
        return Promise.resolve(p).then(function(res) {
            var dur = Math.round(nowMs() - t0);
            var row = { kind: 'measure-async', name: String(name), duration: dur, ok: true, at: Date.now() };
            pushEntry(row);
            var level = dur >= 1000 ? 'error' : (dur >= 100 ? 'warn' : 'log');
            logLine(level, name + ' (async) → ' + dur + 'ms', row);
            return res;
        }, function(err) {
            var dur = Math.round(nowMs() - t0);
            pushEntry({ kind: 'measure-async', name: String(name), duration: dur, ok: false, at: Date.now() });
            logLine('error', name + ' (async) failed after ' + dur + 'ms', err);
            throw err;
        });
    }

    function mark(name, detail) {
        if (!enabled) return;
        var row = { kind: 'mark', name: String(name), detail: detail || null, at: Date.now(), t: Math.round(nowMs()) };
        pushEntry(row);
        logLine('log', 'mark: ' + name, detail);
    }

    function report() {
        var measures = entries.filter(function(e) { return e.kind === 'measure' || e.kind === 'measure-async'; });
        var longs = entries.filter(function(e) { return e.kind === 'longtask'; });
        measures.sort(function(a, b) { return (b.duration || 0) - (a.duration || 0); });
        longs.sort(function(a, b) { return (b.duration || 0) - (a.duration || 0); });
        var topMeasures = measures.slice(0, 15);
        var topLong = longs.slice(0, 15);
        var summary = {
            enabled: enabled,
            totalEntries: entries.length,
            longTasks: longs.length,
            measures: measures.length,
            topSlowMeasures: topMeasures,
            topLongTasks: topLong,
            objects: (typeof objects !== 'undefined' && Array.isArray(objects)) ? objects.length : null
        };
        console.log('%c[MapPerf] REPORT', 'color:#2563eb;font-weight:700', summary);
        if (topMeasures.length) {
            console.table(topMeasures.map(function(m) {
                return { name: m.name, ms: m.duration, objects: m.objects, ok: m.ok };
            }));
        }
        if (topLong.length) {
            console.table(topLong.map(function(m) {
                return { name: m.name, ms: m.duration, start: m.start };
            }));
        }
        return summary;
    }

    function getEntries() {
        return entries.slice();
    }

    global.MapPerfLog = {
        enable: enable,
        disable: disable,
        clear: clear,
        measure: measure,
        measureAsync: measureAsync,
        mark: mark,
        snapshot: snapshotMap,
        report: report,
        getEntries: getEntries,
        isEnabled: function() { return enabled; }
    };

    if (isEnabledByDefault()) {
        // Defer enable until after scripts parse — still early enough for load.
        setTimeout(enable, 0);
    }
})(typeof window !== 'undefined' ? window : this);
