/**
 * Вкладка «Нагрузка» в site-admin.html: данные из GET /api/admin/perf.
 */
(function() {
    'use strict';

    var REFRESH_MS = 10000;
    var TYPE_COLORS = {
        cable: '#0ea5e9', cableLabel: '#7dd3fc', support: '#94a3b8', sleeve: '#f59e0b',
        spliceCassette: '#fbbf24', cross: '#8b5cf6', olt: '#ef4444', splitter: '#ec4899',
        onu: '#f472b6', camera: '#10b981', mediaConverter: '#14b8a6', radioBridge: '#22c55e',
        node: '#6366f1', switch: '#a78bfa', attachment: '#cbd5e1', manhole: '#78716c',
        signalPost: '#a3a3a3', cabinet: '#d97706', region: '#84cc16'
    };
    var FALLBACK_COLORS = ['#f97316', '#06b6d4', '#e11d48', '#65a30d', '#7c3aed', '#0891b2'];

    var active = false;
    var timer = null;
    var loading = false;
    var lastData = null;
    var expandedOrgs = new Set();

    function $(id) { return document.getElementById(id); }

    function getToken() {
        try {
            var exp = localStorage.getItem('networkMap_tokenExpiry');
            if (exp && Date.now() <= parseInt(exp, 10)) {
                var t = localStorage.getItem('networkMap_token');
                if (t) return t;
            }
            return sessionStorage.getItem('networkMap_token') || '';
        } catch (e) { return ''; }
    }

    function esc(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function typeColor(type) {
        if (TYPE_COLORS[type]) return TYPE_COLORS[type];
        var h = 0;
        for (var i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
        return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
    }

    function fmtBytes(bytes) {
        var b = Number(bytes) || 0;
        if (b < 1024) return b + ' Б';
        if (b < 1048576) return (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' КБ';
        return (b / 1048576).toFixed(b < 10485760 ? 2 : 1) + ' МБ';
    }

    function fmtKb(kb) {
        return fmtBytes((Number(kb) || 0) * 1024);
    }

    function fmtMs(ms) {
        if (ms == null || !isFinite(ms)) return '—';
        if (ms >= 1000) return (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + ' с';
        return (ms >= 10 ? Math.round(ms) : Math.round(ms * 10) / 10) + ' мс';
    }

    function fmtNum(n) {
        if (n == null || !isFinite(n)) return '—';
        return Number(n).toLocaleString('ru-RU');
    }

    function fmtUptime(sec) {
        var s = Number(sec) || 0;
        var d = Math.floor(s / 86400);
        var h = Math.floor((s % 86400) / 3600);
        var m = Math.floor((s % 3600) / 60);
        if (d) return d + ' д ' + h + ' ч';
        if (h) return h + ' ч ' + m + ' мин';
        return m + ' мин';
    }

    function fmtAgo(at) {
        if (!at) return '—';
        var sec = Math.max(0, Math.round((Date.now() - at) / 1000));
        if (sec < 60) return sec + ' с назад';
        if (sec < 3600) return Math.round(sec / 60) + ' мин назад';
        return Math.round(sec / 3600) + ' ч назад';
    }

    function level(value, warn, danger) {
        if (value == null || !isFinite(value)) return '';
        if (value >= danger) return 'danger';
        if (value >= warn) return 'warn';
        return 'ok';
    }

    function lowLevel(value, warn, danger) {
        if (value == null || !isFinite(value)) return '';
        if (value <= danger) return 'danger';
        if (value <= warn) return 'warn';
        return 'ok';
    }

    function lvlSpan(text, lvl) {
        return '<span class="perf-lvl perf-lvl--' + (lvl || 'none') + '">' + text + '</span>';
    }

    /* ---------- Загрузка ---------- */

    function load(force) {
        if (loading) return;
        loading = true;
        var status = $('perfStatus');
        if (status && !lastData) status.textContent = 'Загрузка…';
        var headers = {};
        var token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        fetch('api/admin/perf' + (force ? '?force=1' : ''), { credentials: 'include', headers: headers })
            .then(function(r) {
                if (r.status === 403) throw new Error('Нет доступа');
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function(data) {
                lastData = data;
                render(data);
                if (status) {
                    status.textContent = 'Обновлено ' + new Date(data.generatedAt || Date.now())
                        .toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }
            })
            .catch(function(err) {
                if (status) status.textContent = 'Ошибка: ' + (err && err.message ? err.message : err);
            })
            .finally(function() { loading = false; });
    }

    function schedule() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        var auto = $('perfAutoRefresh');
        if (!active || (auto && !auto.checked)) return;
        timer = setInterval(function() {
            if (!document.hidden) load(false);
        }, REFRESH_MS);
    }

    window.adminPerfSetActive = function(on) {
        var was = active;
        active = !!on;
        if (active && !was) load(false);
        schedule();
    };

    /* ---------- Рендер ---------- */

    function render(data) {
        var alerts = collectAlerts(data);
        renderAlerts(alerts);
        renderServerCards(data.server, data.http);
        renderCharts(data.history || []);
        renderServerMeta(data.server);
        renderMaps(data.maps || []);
        renderClients(data.clients || []);
        renderHttp(data.http);
        renderWs(data.wsTypes || [], data);
        var badge = $('perfTabBadge');
        if (badge) {
            var dangers = alerts.filter(function(a) { return a.level === 'danger'; }).length;
            badge.classList.toggle('visible', dangers > 0);
        }
    }

    function collectAlerts(data) {
        var out = [];
        var s = data.server || {};
        if (s.loopP99Ms >= 100) out.push({ level: 'danger', text: 'Event loop задерживается до ' + fmtMs(s.loopP99Ms) + ' (p99): сервер не успевает обрабатывать запросы' });
        else if (s.loopP99Ms >= 40) out.push({ level: 'warn', text: 'Повышенная задержка event loop: ' + fmtMs(s.loopP99Ms) + ' (p99)' });
        if (s.cpuPercent >= 85) out.push({ level: 'danger', text: 'Процесс сервера загружает ядро CPU на ' + s.cpuPercent + '%' });
        else if (s.cpuPercent >= 60) out.push({ level: 'warn', text: 'Высокая загрузка CPU процессом: ' + s.cpuPercent + '%' });
        if (s.system && s.system.totalMemMb) {
            var usedSys = 1 - s.system.freeMemMb / s.system.totalMemMb;
            if (usedSys >= 0.92) out.push({ level: 'danger', text: 'На сервере почти закончилась память: свободно ' + fmtNum(s.system.freeMemMb) + ' МБ' });
            else if (usedSys >= 0.8) out.push({ level: 'warn', text: 'Память сервера занята на ' + Math.round(usedSys * 100) + '%' });
        }
        var pool = s.gauges && s.gauges.cpuPool;
        if (pool && pool.queue > 2) out.push({ level: 'warn', text: 'Очередь пула потоков: ' + pool.queue + ' задач ждут обработки' });
        var mp = s.gauges && s.gauges.mysqlPersist;
        if (mp && mp.enabled) {
            if (mp.errors > 0) out.push({ level: 'danger', text: 'Ошибки записи в MySQL: ' + mp.errors + (mp.lastError ? ' (' + mp.lastError + ')' : '') });
            if (mp.lastMs >= 2000) out.push({ level: 'warn', text: 'Последняя запись в MySQL заняла ' + (mp.lastMs / 1000).toFixed(1) + ' с' });
        }
        (data.maps || []).forEach(function(m) {
            (m.warnings || []).forEach(function(w) {
                if (w.level === 'danger') out.push({ level: 'danger', text: m.name + ': ' + w.text });
            });
        });
        var slowClients = (data.clients || []).filter(function(c) { return c.fpsAvg != null && c.fpsAvg < 20; });
        if (slowClients.length) {
            out.push({
                level: 'warn',
                text: 'Карта тормозит у ' + slowClients.length + ' польз. (FPS < 20): ' +
                    slowClients.slice(0, 3).map(function(c) { return c.username || ('#' + c.userId); }).join(', ') +
                    (slowClients.length > 3 ? '…' : '')
            });
        }
        return out;
    }

    function renderAlerts(alerts) {
        var el = $('perfAlerts');
        if (!el) return;
        if (!alerts.length) {
            el.innerHTML = '<div class="perf-alert perf-alert--ok">Явных проблем с нагрузкой не обнаружено.</div>';
            return;
        }
        el.innerHTML = alerts.map(function(a) {
            return '<div class="perf-alert perf-alert--' + a.level + '">' + esc(a.text) + '</div>';
        }).join('');
    }

    function card(label, value, extra, lvl) {
        return '<div class="stat-card">' +
            '<div class="stat-label">' + esc(label) + '</div>' +
            '<div class="stat-value perf-lvl--' + (lvl || 'none') + '">' + value + '</div>' +
            '<div class="stat-extra">' + extra + '</div>' +
            '</div>';
    }

    function persistCard(mp) {
        if (!mp || !mp.enabled) return '';
        var lvl = mp.errors > 0 ? 'danger' : (mp.lastMs >= 2000 ? 'warn' : 'ok');
        return card('Запись в MySQL', mp.count ? fmtMs(mp.lastMs) : '—',
            'среднее ' + fmtMs(mp.avgMs) + ' · макс ' + fmtMs(mp.maxMs) + ' · записей ' + fmtNum(mp.count) +
            (mp.errors ? ' · ошибок ' + fmtNum(mp.errors) : ''), lvl);
    }

    function renderServerCards(s, http) {
        var el = $('perfServerCards');
        if (!el || !s) return;
        var mem = s.memory || {};
        var sys = s.system || {};
        var g = s.gauges || {};
        var pool = g.cpuPool || {};
        el.innerHTML = [
            card('CPU процесса', (s.cpuPercent != null ? s.cpuPercent : '—') + '%',
                'от одного ядра · ядер: ' + s.cpus, level(s.cpuPercent, 60, 85)),
            card('Event loop (p99)', fmtMs(s.loopP99Ms),
                'сред. ' + fmtMs(s.loopMeanMs) + ' · макс. ' + fmtMs(s.loopMaxMs), level(s.loopP99Ms, 40, 100)),
            card('Загрузка event loop', s.eluPercent != null ? s.eluPercent + '%' : '—',
                'доля времени, когда сервер занят', level(s.eluPercent, 60, 85)),
            card('Память процесса', fmtNum(mem.rssMb) + ' МБ',
                'heap ' + fmtNum(mem.heapUsedMb) + ' / ' + fmtNum(mem.heapTotalMb) + ' МБ',
                sys.totalMemMb ? level(mem.rssMb / sys.totalMemMb * 100, 50, 75) : ''),
            card('Память сервера', sys.totalMemMb ? fmtNum(sys.totalMemMb - sys.freeMemMb) + ' МБ' : '—',
                'из ' + fmtNum(sys.totalMemMb) + ' МБ' + (sys.loadavg && sys.loadavg[0] ? ' · load ' + sys.loadavg.join(' / ') : ''),
                sys.totalMemMb ? level((1 - sys.freeMemMb / sys.totalMemMb) * 100, 80, 92) : ''),
            card('WebSocket-подключения', fmtNum(g.wsClients), 'карт в памяти: ' + fmtNum(g.syncStatesInMemory), ''),
            card('Запросов API в минуту', http ? fmtNum(http.perMin) : '—',
                http ? 'всего ' + fmtNum(http.total) + ' · ошибок 5xx ' + fmtNum(http.errors) : '', ''),
            card('Пул потоков', pool.size ? (pool.busy + ' / ' + pool.size) : 'выкл.',
                'занято · очередь ' + fmtNum(pool.queue || 0) +
                (pool.cores ? ' · ядер ' + pool.cores + ', потоков создано ' + fmtNum(pool.workers || 0) : ''),
                pool.queue > 2 ? 'warn' : ''),
            card('Работает без перезапуска', fmtUptime(s.uptimeSec), 'хранилище: ' + esc(g.storageMode || '—'), ''),
            persistCard(g.mysqlPersist)
        ].join('');
    }

    function sparkline(values, color, unit) {
        var w = 300;
        var h = 70;
        var clean = values.map(function(v) { return v == null || !isFinite(v) ? 0 : Number(v); });
        if (clean.length < 2) return '<div class="hint">Недостаточно данных — точка добавляется каждые 10 с</div>';
        var max = Math.max.apply(null, clean);
        var top = max > 0 ? max * 1.15 : 1;
        var step = w / (clean.length - 1);
        var pts = clean.map(function(v, i) {
            return (i * step).toFixed(1) + ',' + (h - (v / top) * h).toFixed(1);
        });
        var current = clean[clean.length - 1];
        var avg = clean.reduce(function(a, b) { return a + b; }, 0) / clean.length;
        return '<svg class="perf-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<polygon points="0,' + h + ' ' + pts.join(' ') + ' ' + w + ',' + h + '" fill="' + color + '" fill-opacity="0.14"></polygon>' +
            '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.6" vector-effect="non-scaling-stroke"></polyline>' +
            '</svg>' +
            '<div class="perf-spark-meta"><span>сейчас <strong>' + fmtNum(Math.round(current * 10) / 10) + unit + '</strong></span>' +
            '<span>сред. ' + fmtNum(Math.round(avg * 10) / 10) + unit + '</span>' +
            '<span>макс. ' + fmtNum(Math.round(max * 10) / 10) + unit + '</span></div>';
    }

    function renderCharts(history) {
        var el = $('perfCharts');
        if (!el) return;
        function col(key) { return history.map(function(s) { return s[key]; }); }
        var minutes = Math.round(history.length * 10 / 60);
        var charts = [
            { title: 'CPU процесса', key: 'cpuPercent', color: '#0f766e', unit: '%' },
            { title: 'Задержка event loop (p99)', key: 'loopP99Ms', color: '#dc2626', unit: ' мс' },
            { title: 'Heap (память JS сервера)', key: 'heapUsedMb', color: '#7c3aed', unit: ' МБ' },
            { title: 'Запросы API', key: 'httpPerMin', color: '#0ea5e9', unit: '/мин' },
            { title: 'Входящие WS-сообщения', key: 'wsInPerMin', color: '#d97706', unit: '/мин' },
            { title: 'Исходящий WS-трафик', key: 'wsOutKbPerMin', color: '#16a34a', unit: ' КБ/мин' }
        ];
        el.innerHTML = charts.map(function(c) {
            return '<div class="analytics-card perf-chart">' +
                '<div class="analytics-title">' + esc(c.title) + ' <span class="hint">за ' + minutes + ' мин</span></div>' +
                sparkline(col(c.key), c.color, c.unit) +
                '</div>';
        }).join('');
    }

    function renderServerMeta(s) {
        var el = $('perfServerMeta');
        if (!el || !s) return;
        el.textContent = 'Node ' + s.node + ' · ' + s.platform + ' · PID ' + s.pid +
            (s.cpuModel ? ' · ' + s.cpuModel : '') +
            ' · запущен ' + new Date(s.startedAt).toLocaleString('ru-RU');
    }

    function typeBar(byType, total) {
        if (!byType || !byType.length || !total) return '<span class="hint">пусто</span>';
        var segs = byType.slice(0, 8).map(function(t) {
            var pct = t.bytes / total * 100;
            if (pct < 0.5) return '';
            return '<span class="perf-bar-seg" style="width:' + pct.toFixed(2) + '%;background:' + typeColor(t.type) + '" title="' +
                esc(t.label + ': ' + fmtNum(t.count) + ' шт., ' + fmtBytes(t.bytes) + ' (' + Math.round(pct) + '%)') + '"></span>';
        }).join('');
        var legend = byType.slice(0, 3).map(function(t) {
            return '<span class="perf-legend-item"><i style="background:' + typeColor(t.type) + '"></i>' +
                esc(t.label) + ' ' + Math.round(t.bytes / total * 100) + '%</span>';
        }).join('');
        return '<div class="perf-bar">' + segs + '</div><div class="perf-legend">' + legend + '</div>';
    }

    function renderMapDetails(m) {
        var a = m.analysis;
        var rows = a.byType.map(function(t) {
            var pct = a.bytes ? (t.bytes / a.bytes * 100) : 0;
            return '<tr><td><i class="perf-dot" style="background:' + typeColor(t.type) + '"></i>' + esc(t.label) + '</td>' +
                '<td>' + fmtNum(t.count) + '</td><td>' + fmtBytes(t.bytes) + '</td>' +
                '<td>' + fmtBytes(t.count ? Math.round(t.bytes / t.count) : 0) + '</td>' +
                '<td><div class="perf-mini-bar"><span style="width:' + pct.toFixed(1) + '%;background:' + typeColor(t.type) + '"></span></div> ' + Math.round(pct) + '%</td></tr>';
        }).join('');
        var largest = (a.largest || []).map(function(o) {
            return '<tr><td>' + esc(o.label) + '</td><td>' + esc(o.name || '—') + '</td><td>' + fmtBytes(o.bytes) + '</td></tr>';
        }).join('');
        var warnings = (m.warnings || []).map(function(w) {
            return '<li class="perf-warn perf-warn--' + w.level + '">' + esc(w.text) + '</li>';
        }).join('');
        var sv = m.load.saves;
        return '<div class="perf-details">' +
            '<div class="perf-details-col">' +
                '<div class="analytics-title">Вес по типам объектов</div>' +
                '<table class="perf-subtable"><thead><tr><th>Тип</th><th>Кол-во</th><th>Объём</th><th>На 1 шт.</th><th>Доля</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            '</div>' +
            '<div class="perf-details-col">' +
                '<div class="analytics-title">Самые тяжёлые объекты</div>' +
                '<table class="perf-subtable"><thead><tr><th>Тип</th><th>Название</th><th>Объём</th></tr></thead><tbody>' +
                    (largest || '<tr><td colspan="3" class="hint">—</td></tr>') + '</tbody></table>' +
                '<div class="analytics-title" style="margin-top:12px;">Сложность данных</div>' +
                '<ul class="fact-list perf-facts">' +
                    '<li>Точек в трассах кабелей: <strong>' + fmtNum(a.cablePoints) + '</strong>, в регионах: <strong>' + fmtNum(a.regionPoints) + '</strong></li>' +
                    '<li>Сварок волокон: <strong>' + fmtNum(a.fiberSplices) + '</strong>, патчей в кроссах: <strong>' + fmtNum(a.crossPatches) + '</strong></li>' +
                    '<li>Фото: <strong>' + fmtNum(a.photos) + '</strong> (' + fmtBytes(a.photosBytes) + ' в данных карты)</li>' +
                    '<li>Коммутаторов внутри узлов: <strong>' + fmtNum(a.nestedSwitches) + '</strong></li>' +
                    '<li>Сохранений: <strong>' + fmtNum(sv.count) + '</strong>, сред. ' + fmtMs(sv.avgMs) + ', p95 ' + fmtMs(sv.p95Ms) + ', макс. ' + fmtMs(sv.maxMs) +
                        (sv.lastAt ? ', последнее ' + fmtAgo(sv.lastAt) : '') + '</li>' +
                    '<li>Полных перезаписей карты за 15 мин: <strong>' + fmtNum(m.load.statesPer15m) + '</strong>, операций за 15 мин: <strong>' + fmtNum(m.load.ops15m) + '</strong></li>' +
                    '<li>Анализ карты занял ' + fmtMs(a.analyzedMs) + (m.inMemory ? ' · карта загружена в память сервера' : '') + '</li>' +
                '</ul>' +
                (warnings ? '<div class="analytics-title" style="margin-top:12px;">Проблемы</div><ul class="perf-warn-list">' + warnings + '</ul>' : '') +
            '</div>' +
        '</div>';
    }

    function renderMaps(maps) {
        var body = $('perfMapsBody');
        if (!body) return;
        if (!maps.length) {
            body.innerHTML = '<tr><td colspan="10" class="hint">Организаций нет</td></tr>';
            return;
        }
        var maxBytes = maps.reduce(function(mx, m) { return Math.max(mx, m.analysis.bytes); }, 0);
        body.innerHTML = maps.map(function(m) {
            var a = m.analysis;
            var l = m.load;
            var id = String(m.orgId);
            var open = expandedOrgs.has(id);
            var sizeLvl = level(a.bytes / 1048576, 8, 20);
            var dangerCount = (m.warnings || []).filter(function(w) { return w.level === 'danger'; }).length;
            var warnCount = (m.warnings || []).length - dangerCount;
            var problems = dangerCount || warnCount
                ? (dangerCount ? lvlSpan('● ' + dangerCount, 'danger') + ' ' : '') + (warnCount ? lvlSpan('● ' + warnCount, 'warn') : '')
                : lvlSpan('нет', 'ok');
            var share = maxBytes ? Math.max(2, a.bytes / maxBytes * 100) : 0;
            var row = '<tr class="perf-map-row' + (open ? ' is-open' : '') + '" data-org="' + esc(id) + '" tabindex="0">' +
                '<td><span class="perf-caret">' + (open ? '▾' : '▸') + '</span> <strong>' + esc(m.name) + '</strong>' +
                    (m.status !== 'active' ? ' <span class="hint">(' + esc(m.status) + ')</span>' : '') + '</td>' +
                '<td>' + lvlSpan(fmtBytes(a.bytes), sizeLvl) +
                    '<div class="perf-mini-bar"><span style="width:' + share.toFixed(1) + '%"></span></div></td>' +
                '<td>' + fmtNum(a.items) + '</td>' +
                '<td class="perf-type-cell">' + typeBar(a.byType, a.bytes) + '</td>' +
                '<td>' + lvlSpan(fmtNum(a.cablePoints), level(a.cablePoints, 30000, 100000)) + '</td>' +
                '<td>' + fmtNum(m.online) + ' / ' + fmtNum(m.wsClients) + '</td>' +
                '<td>' + lvlSpan(fmtNum(l.opsPerMin), level(l.opsPerMin, 60, 120)) + '</td>' +
                '<td>' + (l.saves.count ? lvlSpan(fmtMs(l.saves.p95Ms), level(l.saves.p95Ms, 150, 500)) +
                    '<div class="hint">' + fmtNum(l.saves.count) + ' раз</div>' : '<span class="hint">—</span>') + '</td>' +
                '<td><span title="входящий / исходящий">↓' + fmtKb(l.wsInKb5m) + '<br>↑' + fmtKb(l.wsOutKb5m) + '</span></td>' +
                '<td>' + problems + '</td>' +
                '</tr>';
            if (open) row += '<tr class="perf-map-details-row"><td colspan="10">' + renderMapDetails(m) + '</td></tr>';
            return row;
        }).join('');
    }

    function shortUa(ua) {
        if (!ua) return '';
        var m = ua.match(/(YaBrowser|Edg|OPR|Firefox|Chrome|Safari)\/(\d+)/);
        var os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
        var name = m ? ({ Edg: 'Edge', OPR: 'Opera', YaBrowser: 'Яндекс' }[m[1]] || m[1]) + ' ' + m[2] : '';
        return [name, os].filter(Boolean).join(', ');
    }

    function renderClients(clients) {
        var body = $('perfClientsBody');
        if (!body) return;
        if (!clients.length) {
            body.innerHTML = '<tr><td colspan="11" class="hint">Пока нет замеров. Браузер присылает первый отчёт через минуту после открытия карты.</td></tr>';
            return;
        }
        var presetNames = { auto: 'Авто', economy: 'Эконом', max: 'Максимум' };
        body.innerHTML = clients.map(function(c) {
            var heap = c.heapUsedMb != null ? fmtNum(c.heapUsedMb) + ' МБ' + (c.heapLimitMb ? ' <span class="hint">/ ' + fmtNum(c.heapLimitMb) + '</span>' : '') : '—';
            var heapLvl = c.heapUsedMb != null && c.heapLimitMb ? level(c.heapUsedMb / c.heapLimitMb * 100, 50, 75) : '';
            var device = [c.cores ? c.cores + ' ядер' : '', c.deviceMemoryGb ? c.deviceMemoryGb + ' ГБ' : '', c.screen || ''].filter(Boolean).join(' · ');
            var topTypes = Object.keys(c.objectsByType || {}).map(function(k) { return [k, c.objectsByType[k]]; })
                .sort(function(x, y) { return y[1] - x[1]; }).slice(0, 4)
                .map(function(p) { return p[0] + ': ' + p[1]; }).join(', ');
            var steps = Array.isArray(c.loadSteps) ? c.loadSteps : [];
            var stepsTitle = steps.map(function(s) { return s.name + ': ' + fmtMs(s.ms); }).join('\n');
            var topSteps = steps.slice().sort(function(x, y) { return y.ms - x.ms; })
                .filter(function(s) { return s.ms >= 300; }).slice(0, 2)
                .map(function(s) { return s.name + ' ' + fmtMs(s.ms); }).join(', ');
            return '<tr>' +
                '<td>' + esc(c.username || ('#' + c.userId)) + '</td>' +
                '<td>' + esc(c.organizationName || '—') + '</td>' +
                '<td>' + lvlSpan(c.fpsAvg != null ? fmtNum(c.fpsAvg) : '—', lowLevel(c.fpsAvg, 40, 20)) + ' / ' +
                    lvlSpan(c.fpsMin != null ? fmtNum(c.fpsMin) : '—', lowLevel(c.fpsMin, 30, 15)) + '</td>' +
                '<td>' + lvlSpan(fmtNum(c.longTasksPerMin) + '/мин', level(c.longTasksPerMin, 10, 30)) +
                    '<div class="hint">' + fmtMs(c.longTaskMsPerMin) + '/мин</div></td>' +
                '<td>' + lvlSpan(heap, heapLvl) + '</td>' +
                '<td title="' + esc(topTypes) + '">' + fmtNum(c.objects) + ' / ' + (c.mounted != null ? fmtNum(c.mounted) : '—') +
                    (c.virtualization ? '<div class="hint">виртуализация вкл.</div>' : '') + '</td>' +
                '<td>' + lvlSpan(fmtNum(c.domNodes), level(c.domNodes, 15000, 40000)) + '</td>' +
                '<td' + (stepsTitle ? ' title="' + esc(stepsTitle) + '"' : '') + '>' +
                    lvlSpan(fmtMs(c.mapLoadMs), level(c.mapLoadMs, 8000, 20000)) +
                    (c.lastImportMs ? '<div class="hint">импорт ' + fmtMs(c.lastImportMs) + '</div>' : '') +
                    (topSteps ? '<div class="hint">' + esc(topSteps) + '</div>' : '') + '</td>' +
                '<td>' + esc(presetNames[c.perfPreset] || c.perfPreset || '—') + '</td>' +
                '<td><span title="' + esc(c.userAgent || '') + '">' + esc(shortUa(c.userAgent)) + '</span>' +
                    (device ? '<div class="hint">' + esc(device) + '</div>' : '') + '</td>' +
                '<td>' + fmtAgo(c.at) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderHttp(http) {
        var body = $('perfHttpBody');
        var meta = $('perfHttpMeta');
        if (!body || !http) return;
        if (meta) meta.textContent = 'Отсортировано по суммарному времени обработки. Всего запросов: ' + fmtNum(http.total) + ', отдано ' + fmtNum(http.mb) + ' МБ.';
        if (!http.routes.length) {
            body.innerHTML = '<tr><td colspan="8" class="hint">Нет данных</td></tr>';
            return;
        }
        body.innerHTML = http.routes.map(function(r) {
            return '<tr>' +
                '<td><code class="perf-code">' + esc(r.key) + '</code></td>' +
                '<td>' + fmtNum(r.count) + '</td>' +
                '<td>' + fmtNum(r.perMin) + '</td>' +
                '<td>' + lvlSpan(fmtMs(r.avgMs), level(r.avgMs, 200, 1000)) + '</td>' +
                '<td>' + lvlSpan(fmtMs(r.p95Ms), level(r.p95Ms, 500, 2000)) + '</td>' +
                '<td>' + fmtMs(r.maxMs) + '</td>' +
                '<td>' + fmtNum(r.totalSec) + ' с</td>' +
                '<td>' + (r.errors ? lvlSpan(fmtNum(r.errors), 'danger') : '0') + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderWs(types, data) {
        var body = $('perfWsBody');
        var meta = $('perfWsMeta');
        if (!body) return;
        var g = data.server && data.server.gauges || {};
        if (meta) {
            meta.textContent = 'Подключений: ' + fmtNum(g.wsClients) + (data.wsUnassigned ? ' (без организации: ' + data.wsUnassigned + ')' : '') +
                '. Обработка — время разбора и применения сообщения на сервере, включая рассылку остальным.';
        }
        if (!types.length) {
            body.innerHTML = '<tr><td colspan="6" class="hint">Нет данных</td></tr>';
            return;
        }
        var names = {
            cursor: 'Курсоры', op: 'Изменения (op)', state: 'Полная карта (state)', hello: 'Подключение',
            chat: 'Чат', lock_object: 'Блокировка', unlock_object: 'Разблокировка', lock_touch: 'Продление блокировки',
            groupNames: 'Имена групп', invalid: 'Некорректные'
        };
        body.innerHTML = types.map(function(t) {
            return '<tr>' +
                '<td>' + esc(names[t.type] || t.type) + ' <span class="hint">' + esc(t.type) + '</span></td>' +
                '<td>' + fmtNum(t.count) + '</td>' +
                '<td>' + fmtNum(t.perMin) + '</td>' +
                '<td>' + fmtKb(t.kb) + '</td>' +
                '<td>' + lvlSpan(fmtMs(t.avgMs), level(t.avgMs, 20, 100)) + '</td>' +
                '<td>' + fmtMs(t.maxMs) + '</td>' +
                '</tr>';
        }).join('');
    }

    /* ---------- События ---------- */

    function toggleOrg(row) {
        var id = row.getAttribute('data-org');
        if (!id) return;
        if (expandedOrgs.has(id)) expandedOrgs.delete(id);
        else expandedOrgs.add(id);
        if (lastData) renderMaps(lastData.maps || []);
    }

    document.addEventListener('click', function(e) {
        var row = e.target.closest && e.target.closest('.perf-map-row');
        if (row) toggleOrg(row);
    });
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var row = e.target.closest && e.target.closest('.perf-map-row');
        if (!row) return;
        e.preventDefault();
        toggleOrg(row);
    });

    var refreshBtn = $('perfRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function() { load(false); });
    var forceBtn = $('perfForceBtn');
    if (forceBtn) forceBtn.addEventListener('click', function() { load(true); });
    var auto = $('perfAutoRefresh');
    if (auto) auto.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && active) load(false);
    });

    var section = $('tab-perf');
    if (section && section.classList.contains('active')) window.adminPerfSetActive(true);
})();
