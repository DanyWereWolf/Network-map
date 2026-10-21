/**
 * Замеры производительности карты в браузере для вкладки «Нагрузка» в админке.
 * FPS меряется короткими окнами (5 с раз в 30 с), отчёт уходит раз в 2 минуты
 * и только когда вкладка видима — чтобы сам мониторинг не нагружал устройство.
 */
(function(global) {
    'use strict';

    var FIRST_REPORT_DELAY_MS = 60 * 1000;
    var REPORT_INTERVAL_MS = 2 * 60 * 1000;
    var FPS_SAMPLE_MS = 5000;
    var FPS_SAMPLE_EVERY_MS = 30 * 1000;
    var MAX_FPS_SAMPLES = 8;

    var clientKey = Math.random().toString(36).slice(2, 10);
    var fpsSamples = [];
    var longTasks = { count: 0, ms: 0, since: Date.now() };
    var wsMessages = { count: 0, since: Date.now() };
    var mapLoadMs = null;
    var lastImport = { ms: null, items: null };
    var fpsSampling = false;

    function sampleFps() {
        if (fpsSampling || document.hidden || typeof requestAnimationFrame !== 'function') return;
        fpsSampling = true;
        var frames = 0;
        var start = performance.now();
        function frame(now) {
            frames++;
            var elapsed = now - start;
            if (elapsed < FPS_SAMPLE_MS && !document.hidden) {
                requestAnimationFrame(frame);
                return;
            }
            fpsSampling = false;
            if (document.hidden || elapsed < 1000) return;
            fpsSamples.push(frames * 1000 / elapsed);
            if (fpsSamples.length > MAX_FPS_SAMPLES) fpsSamples.shift();
        }
        requestAnimationFrame(frame);
    }

    function observeLongTasks() {
        if (typeof PerformanceObserver !== 'function') return;
        try {
            var po = new PerformanceObserver(function(list) {
                list.getEntries().forEach(function(entry) {
                    longTasks.count++;
                    longTasks.ms += entry.duration || 0;
                });
            });
            po.observe({ type: 'longtask', buffered: true });
        } catch (e) {}
    }

    function wrapGlobal(name, factory) {
        var orig = global[name];
        if (typeof orig !== 'function' || orig.__perfWrapped) return;
        var wrapped = factory(orig);
        wrapped.__perfWrapped = true;
        global[name] = wrapped;
    }

    wrapGlobal('markMapDataReady', function(orig) {
        return function() {
            if (mapLoadMs == null) mapLoadMs = Math.round(performance.now());
            return orig.apply(this, arguments);
        };
    });

    wrapGlobal('importData', function(orig) {
        return function(data, opts, done) {
            var t0 = performance.now();
            var items = Array.isArray(data) ? data.length : 0;
            return orig.call(this, data, opts, function() {
                lastImport = { ms: Math.round(performance.now() - t0), items: items };
                if (typeof done === 'function') return done.apply(this, arguments);
            });
        };
    });

    function countObjectsByType() {
        var out = {};
        var list = typeof objects !== 'undefined' && Array.isArray(objects) ? objects : [];
        for (var i = 0; i < list.length; i++) {
            var obj = list[i];
            var type = 'unknown';
            try {
                if (obj && obj.properties && typeof obj.properties.get === 'function') type = obj.properties.get('type') || 'unknown';
            } catch (e) {}
            out[type] = (out[type] || 0) + 1;
        }
        return { total: list.length, byType: out };
    }

    function perMinute(counter) {
        var minutes = Math.max(0.5, (Date.now() - counter.since) / 60000);
        return Math.round(counter.count / minutes * 10) / 10;
    }

    function buildReport() {
        var counts = countObjectsByType();
        var mem = performance && performance.memory;
        var perf = typeof getPerfSettings === 'function' ? getPerfSettings() : null;
        var fpsAvg = null;
        var fpsMin = null;
        if (fpsSamples.length) {
            var sum = 0;
            fpsMin = Infinity;
            fpsSamples.forEach(function(f) {
                sum += f;
                if (f < fpsMin) fpsMin = f;
            });
            fpsAvg = Math.round(sum / fpsSamples.length * 10) / 10;
            fpsMin = Math.round(fpsMin * 10) / 10;
        }
        var report = {
            clientKey: clientKey,
            fpsAvg: fpsAvg,
            fpsMin: fpsMin,
            longTasksPerMin: perMinute(longTasks),
            longTaskMsPerMin: Math.round(longTasks.ms / Math.max(0.5, (Date.now() - longTasks.since) / 60000)),
            heapUsedMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
            heapLimitMb: mem ? Math.round(mem.jsHeapSizeLimit / 1048576) : null,
            domNodes: document.getElementsByTagName('*').length,
            objects: counts.total,
            mounted: typeof MapPerf !== 'undefined' && typeof MapPerf.getMountedCount === 'function' ? MapPerf.getMountedCount() : null,
            objectsByType: counts.byType,
            mapLoadMs: mapLoadMs,
            lastImportMs: lastImport.ms,
            lastImportItems: lastImport.items,
            loadSteps: Array.isArray(global.__mapLoadSteps) ? global.__mapLoadSteps : [],
            wsMessagesPerMin: perMinute(wsMessages),
            perfPreset: perf ? perf.mode : null,
            virtualization: typeof MapPerf !== 'undefined' && typeof MapPerf.shouldUseVirtualization === 'function' ? !!MapPerf.shouldUseVirtualization() : false,
            cores: navigator.hardwareConcurrency || null,
            deviceMemoryGb: navigator.deviceMemory || null,
            screen: (global.screen ? global.screen.width + 'x' + global.screen.height : '')
        };
        longTasks = { count: 0, ms: 0, since: Date.now() };
        wsMessages = { count: 0, since: Date.now() };
        return report;
    }

    function sendReport() {
        if (document.hidden) return;
        if (global.VolsmapEmbed && VolsmapEmbed.isEmbed && VolsmapEmbed.isEmbed()) return;
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof fetch !== 'function') return;
        var base = typeof getApiBase === 'function' ? getApiBase() : '';
        try {
            fetch(base + '/api/perf/client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify(buildReport()),
                keepalive: true
            }).catch(function() {});
        } catch (e) {}
    }

    observeLongTasks();
    setTimeout(sampleFps, 5000);
    setInterval(sampleFps, FPS_SAMPLE_EVERY_MS);
    setTimeout(function() {
        sendReport();
        setInterval(sendReport, REPORT_INTERVAL_MS);
    }, FIRST_REPORT_DELAY_MS);

    global.PerfReporter = {
        countWsMessage: function() { wsMessages.count++; }
    };
})(window);
