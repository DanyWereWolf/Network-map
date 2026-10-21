/**
 * Живость UI/карты: вспышки при CRUD, звуки, HUD длины кабеля,
 * пульс трассы, анимация модалок, empty-state helper.
 * Учитывает areMapAnimationsEnabled / prefers-reduced-motion.
 */
(function (global) {
    var SOUND_KEY = 'networkMap_uiSounds';
    var PREFS_KEY = 'networkMap_mapMotionPrefs';
    var DEFAULT_PREFS = {
        createRipple: true,
        selectionPulse: true,
        snapHint: true,
        cableHud: true,
        traceFlow: true
    };
    var prefs = {
        createRipple: true,
        selectionPulse: true,
        snapHint: true,
        cableHud: true,
        traceFlow: true
    };
    var audioCtx = null;
    var cableHudEl = null;
    var cableHudShown = 0;
    var tracePulseTimer = null;
    var tracePulseLines = [];

    function readPrefs() {
        try {
            var raw = localStorage.getItem(PREFS_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            Object.keys(DEFAULT_PREFS).forEach(function (key) {
                if (parsed[key] === false || parsed[key] === 0 || parsed[key] === '0') prefs[key] = false;
                else if (parsed[key] === true || parsed[key] === 1 || parsed[key] === '1') prefs[key] = true;
            });
        } catch (e) {}
    }

    function persistPrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
    }

    function isPrefEnabled(key) {
        if (!Object.prototype.hasOwnProperty.call(prefs, key)) return true;
        return prefs[key] !== false;
    }

    function setPref(key, enabled) {
        if (!Object.prototype.hasOwnProperty.call(prefs, key)) return false;
        prefs[key] = !!enabled;
        persistPrefs();
        syncPrefToggles();
        if (key === 'snapHint' && !prefs.snapHint) hideSnapHint();
        if (key === 'cableHud' && !prefs.cableHud) hideCableLengthHud();
        if (key === 'traceFlow' && !prefs.traceFlow) stopTraceFlow();
        return prefs[key];
    }

    function getPrefs() {
        return {
            createRipple: !!prefs.createRipple,
            selectionPulse: !!prefs.selectionPulse,
            snapHint: !!prefs.snapHint,
            cableHud: !!prefs.cableHud,
            traceFlow: !!prefs.traceFlow
        };
    }

    function syncPrefToggles() {
        var map = {
            createRipple: 'motionCreateRippleToggle',
            selectionPulse: 'motionSelectionPulseToggle',
            snapHint: 'motionSnapHintToggle',
            cableHud: 'motionCableHudToggle',
            traceFlow: 'motionTraceFlowToggle'
        };
        Object.keys(map).forEach(function (key) {
            var el = document.getElementById(map[key]);
            if (el && el.checked !== !!prefs[key]) el.checked = !!prefs[key];
        });
    }

    function bindPrefToggles() {
        var map = {
            motionCreateRippleToggle: 'createRipple',
            motionSelectionPulseToggle: 'selectionPulse',
            motionSnapHintToggle: 'snapHint',
            motionCableHudToggle: 'cableHud',
            motionTraceFlowToggle: 'traceFlow'
        };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el.dataset.bound === '1') return;
            el.dataset.bound = '1';
            el.checked = isPrefEnabled(map[id]);
            el.addEventListener('change', function () {
                setPref(map[id], el.checked);
            });
        });
    }

    function motionOn() {
        if (typeof global.areMapAnimationsEnabled === 'function') {
            return !!global.areMapAnimationsEnabled();
        }
        try {
            return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (e) {
            return true;
        }
    }

    function soundsOn() {
        try {
            var v = localStorage.getItem(SOUND_KEY);
            if (v === '1') return true;
            if (v === '0') return false;
        } catch (e) {}
        return false;
    }

    function setSoundsEnabled(enabled) {
        enabled = !!enabled;
        try { localStorage.setItem(SOUND_KEY, enabled ? '1' : '0'); } catch (e) {}
        var el = document.getElementById('uiSoundsToggle');
        if (el && el.checked !== enabled) el.checked = enabled;
        return enabled;
    }

    function isSoundsEnabled() {
        return soundsOn();
    }

    function ensureAudio() {
        if (audioCtx) return audioCtx;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { audioCtx = new AC(); } catch (e) { return null; }
        return audioCtx;
    }

    function playTone(freq, dur, type, gain) {
        if (!soundsOn()) return;
        var ctx = ensureAudio();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            try { ctx.resume(); } catch (e) {}
        }
        try {
            var osc = ctx.createOscillator();
            var g = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.value = freq;
            g.gain.value = gain == null ? 0.035 : gain;
            osc.connect(g);
            g.connect(ctx.destination);
            var t0 = ctx.currentTime;
            g.gain.setValueAtTime(g.gain.value, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
            osc.start(t0);
            osc.stop(t0 + dur + 0.02);
        } catch (e2) {}
    }

    function play(kind) {
        if (!soundsOn()) return;
        if (kind === 'success') {
            playTone(520, 0.07, 'sine', 0.028);
            setTimeout(function () { playTone(720, 0.09, 'sine', 0.022); }, 55);
        } else if (kind === 'remove') {
            playTone(280, 0.08, 'triangle', 0.02);
        } else if (kind === 'click') {
            playTone(640, 0.035, 'sine', 0.018);
        } else {
            playTone(440, 0.05, 'sine', 0.02);
        }
    }

    function getMap() {
        return global.myMap || null;
    }

    function colorForObject(obj, fallback) {
        if (!obj || !obj.properties) return fallback || '#0f766e';
        var type = obj.properties.get('type') || '';
        if (type === 'cable') {
            var cableType = obj.properties.get('cableType');
            if (typeof global.getCableColor === 'function') {
                try { return global.getCableColor(cableType) || fallback || '#0891b2'; } catch (e) {}
            }
            return fallback || '#0891b2';
        }
        if (global.MapIcons) {
            if (type === 'node' && typeof MapIcons.getNodeColor === 'function') {
                return MapIcons.getNodeColor(obj.properties.get('nodeKind')) || fallback || '#2fbf66';
            }
            if (MapIcons.COLORS && MapIcons.COLORS[type]) return MapIcons.COLORS[type];
        }
        return fallback || '#0f766e';
    }

    /** Одна аура: расширение + затухание заливки (без частой ряби). */
    function dropRippleAt(coords, options) {
        options = options || {};
        if (!isPrefEnabled('createRipple') && !options.force) {
            if (options.sound) play(options.sound);
            return;
        }
        var map = getMap();
        if (!map || !coords || !window.ymaps) return;
        if (!motionOn() && !options.force) {
            play(options.sound || 'success');
            return;
        }
        var color = options.color || '#0f766e';
        var life = options.life || 700;
        var startR = options.radius || 10;
        var expand = options.expand || 48;
        var circle = null;
        try {
            circle = new ymaps.Circle([coords, startR], {}, {
                fillColor: color,
                fillOpacity: 0.34,
                strokeColor: color,
                strokeWidth: 1.5,
                strokeOpacity: 0.55,
                zIndex: 2800,
                interactive: false
            });
            map.geoObjects.add(circle);
        } catch (e) {
            play(options.sound || 'success');
            return;
        }
        var t0 = performance.now();
        function tick(now) {
            var p = Math.min(1, (now - t0) / life);
            // плавный ease-out — как прежний burst, без повторных волн
            var ease = 1 - Math.pow(1 - p, 2.4);
            var fade = 1 - ease;
            try {
                circle.geometry.setRadius(startR + ease * expand);
                circle.options.set({
                    fillOpacity: 0.34 * fade,
                    strokeOpacity: 0.5 * fade,
                    strokeWidth: Math.max(0.6, 1.5 * (1 - ease * 0.4))
                });
            } catch (e2) {}
            if (p < 1) requestAnimationFrame(tick);
            else {
                try { map.geoObjects.remove(circle); } catch (e3) {}
            }
        }
        requestAnimationFrame(tick);
        play(options.sound || 'success');
    }

    function burstAt(coords, options) {
        options = options || {};
        if (options.ripple !== false && !options.solid) {
            dropRippleAt(coords, options);
            return;
        }
        var map = getMap();
        if (!map || !coords || !window.ymaps) return;
        if (!motionOn() && !options.force) {
            play(options.sound || 'success');
            return;
        }
        var color = options.color || '#0f766e';
        var radius = options.radius || 18;
        var life = options.life || 520;
        var circle = null;
        try {
            circle = new ymaps.Circle([coords, radius], {}, {
                fillColor: color,
                fillOpacity: 0.28,
                strokeColor: color,
                strokeWidth: 2,
                strokeOpacity: 0.85,
                zIndex: 2800,
                interactive: false
            });
            map.geoObjects.add(circle);
        } catch (e) {
            play(options.sound || 'success');
            return;
        }
        var t0 = performance.now();
        function tick(now) {
            var p = Math.min(1, (now - t0) / life);
            var ease = 1 - Math.pow(1 - p, 3);
            try {
                circle.geometry.setRadius(radius + ease * (options.expand || 42));
                circle.options.set({
                    fillOpacity: 0.28 * (1 - ease),
                    strokeOpacity: 0.85 * (1 - ease)
                });
            } catch (e2) {}
            if (p < 1) requestAnimationFrame(tick);
            else {
                try { map.geoObjects.remove(circle); } catch (e3) {}
            }
        }
        requestAnimationFrame(tick);
        play(options.sound || 'success');
    }

    function celebrateCreate(obj, options) {
        options = options || {};
        if (!obj || !obj.geometry) return;
        var coords = null;
        try { coords = obj.geometry.getCoordinates(); } catch (e) {}
        if (!coords) return;
        var type = obj.properties && obj.properties.get ? obj.properties.get('type') : '';
        if (type === 'cable' && Array.isArray(coords) && coords.length && Array.isArray(coords[0])) {
            coords = coords[Math.floor(coords.length / 2)];
        }
        dropRippleAt(coords, {
            color: options.color || colorForObject(obj),
            sound: options.sound || 'success',
            expand: options.expand || 48,
            life: options.life || 700
        });
    }

    function celebrateRemove(obj, options) {
        options = options || {};
        if (!obj || !obj.geometry) {
            play('remove');
            return;
        }
        var coords = null;
        try { coords = obj.geometry.getCoordinates(); } catch (e) {}
        if (coords && Array.isArray(coords[0])) {
            coords = coords[Math.floor(coords.length / 2)];
        }
        if (coords) {
            dropRippleAt(coords, {
                color: options.color || colorForObject(obj, '#c2410c'),
                expand: 36,
                life: 520,
                sound: 'remove'
            });
        } else {
            play('remove');
        }
    }

    function markButtonBusy(btn, busyText) {
        if (!btn) return;
        if (btn.dataset.motionBusy === '1') return;
        btn.dataset.motionBusy = '1';
        btn.dataset.motionLabel = btn.textContent || '';
        btn.classList.add('app-btn-busy');
        btn.disabled = true;
        if (busyText) btn.textContent = busyText;
    }

    function markButtonDone(btn, doneText) {
        if (!btn) return;
        btn.classList.remove('app-btn-busy');
        btn.classList.add('app-btn-done');
        if (doneText) btn.textContent = doneText;
        else if (btn.dataset.motionLabel) btn.textContent = btn.dataset.motionLabel;
        setTimeout(function () {
            btn.classList.remove('app-btn-done');
            btn.disabled = false;
            btn.dataset.motionBusy = '0';
            if (btn.dataset.motionLabel) btn.textContent = btn.dataset.motionLabel;
        }, 700);
        play('success');
    }

    function haversineM(a, b) {
        if (!a || !b) return 0;
        var R = 6371000;
        var toRad = Math.PI / 180;
        var dLat = (b[0] - a[0]) * toRad;
        var dLon = (b[1] - a[1]) * toRad;
        var lat1 = a[0] * toRad;
        var lat2 = b[0] * toRad;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function pathLengthM(coords) {
        if (!coords || coords.length < 2) return 0;
        var sum = 0;
        for (var i = 1; i < coords.length; i++) sum += haversineM(coords[i - 1], coords[i]);
        return sum;
    }

    function ensureCableHud() {
        if (cableHudEl) return cableHudEl;
        cableHudEl = document.createElement('div');
        cableHudEl.id = 'cableLayLengthHud';
        cableHudEl.className = 'cable-lay-length-hud';
        cableHudEl.hidden = true;
        cableHudEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(cableHudEl);
        return cableHudEl;
    }

    function updateCableLengthHud(coords) {
        if (!isPrefEnabled('cableHud')) {
            hideCableLengthHud();
            return;
        }
        var el = ensureCableHud();
        if (!coords || coords.length < 2) {
            hideCableLengthHud();
            return;
        }
        var meters = pathLengthM(coords);
        cableHudShown = meters;
        var label = meters < 1000
            ? (Math.round(meters * 10) / 10).toLocaleString('ru-RU') + ' м'
            : (Math.round(meters / 10) / 100).toLocaleString('ru-RU') + ' км';
        el.textContent = label;
        el.hidden = false;
        el.classList.add('is-visible');
    }

    function hideCableLengthHud() {
        if (!cableHudEl) return;
        cableHudEl.classList.remove('is-visible');
        cableHudEl.hidden = true;
    }

    function startTraceFlow(lines) {
        stopTraceFlow();
        if (!isPrefEnabled('traceFlow') || !motionOn() || !lines || !lines.length) return;
        tracePulseLines = lines.slice();
        var t0 = performance.now();
        function tick(now) {
            if (!tracePulseLines.length) return;
            var phase = ((now - t0) % 1400) / 1400;
            var opacity = 0.45 + 0.35 * Math.sin(phase * Math.PI * 2);
            for (var i = 0; i < tracePulseLines.length; i++) {
                try {
                    tracePulseLines[i].options.set('strokeOpacity', opacity);
                } catch (e) {}
            }
            tracePulseTimer = requestAnimationFrame(tick);
        }
        tracePulseTimer = requestAnimationFrame(tick);
    }

    function stopTraceFlow() {
        if (tracePulseTimer) {
            cancelAnimationFrame(tracePulseTimer);
            tracePulseTimer = null;
        }
        tracePulseLines = [];
    }

    function emptyStateHtml(opts) {
        opts = opts || {};
        var emotion = opts.emotion || 'shy';
        var title = opts.title || 'Пока пусто';
        var text = opts.text || '';
        var cta = opts.cta || '';
        var ctaHref = opts.ctaHref || '';
        var ctaAction = opts.ctaAction || '';
        var avatar = (global.AssistantAvatars && typeof AssistantAvatars.imgHtml === 'function')
            ? AssistantAvatars.imgHtml(emotion, 'app-empty-avatar')
            : '<img class="app-empty-avatar" src="icons/assistant/vola-' + emotion + '.png" alt="" aria-hidden="true" decoding="async">';
        var html = '<div class="app-empty-state" role="status">' + avatar +
            '<div class="app-empty-copy"><p class="app-empty-title">' + title + '</p>';
        if (text) html += '<p class="app-empty-text">' + text + '</p>';
        html += '</div>';
        if (cta && (ctaHref || ctaAction)) {
            if (ctaHref) {
                html += '<a class="app-empty-cta" href="' + ctaHref + '">' + cta + '</a>';
            } else {
                html += '<button type="button" class="app-empty-cta" data-empty-action="' + ctaAction + '">' + cta + '</button>';
            }
        }
        html += '</div>';
        return html;
    }

    function bindModalMotion() {
        /* Модалки: класс/звук вешает modal-glass.js (onModalShown). */
    }

    function initUiSoundsToggle() {
        var el = document.getElementById('uiSoundsToggle');
        if (!el) return;
        el.checked = soundsOn();
        if (el.dataset.bound === '1') return;
        el.dataset.bound = '1';
        el.addEventListener('change', function () {
            setSoundsEnabled(el.checked);
            if (el.checked) play('success');
        });
    }

    function init() {
        readPrefs();
        initUiSoundsToggle();
        bindPrefToggles();
        syncPrefToggles();
        bindModalMotion();
        document.documentElement.classList.toggle('ui-sounds-on', soundsOn());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    var snapHint = null;
    var snapHintColor = '';

    function showSnapHint(coords, objOrColor) {
        var map = getMap();
        if (!map || !coords || !window.ymaps) return;
        if (!isPrefEnabled('snapHint') || !motionOn()) {
            hideSnapHint();
            return;
        }
        var color = '#14b8a6';
        if (typeof objOrColor === 'string' && objOrColor) {
            color = objOrColor;
        } else if (objOrColor) {
            color = colorForObject(objOrColor, color);
        }
        var radius = 8;
        try {
            if (snapHint) {
                snapHint.geometry.setCoordinates(coords);
                snapHint.geometry.setRadius(radius);
                if (color !== snapHintColor) {
                    snapHintColor = color;
                    snapHint.options.set({
                        fillColor: color,
                        strokeColor: color
                    });
                }
                return;
            }
            snapHintColor = color;
            snapHint = new ymaps.Circle([coords, radius], {}, {
                fillColor: color,
                fillOpacity: 0.18,
                strokeColor: color,
                strokeWidth: 1.4,
                strokeOpacity: 0.75,
                zIndex: 2600,
                interactive: false
            });
            map.geoObjects.add(snapHint);
        } catch (e) {}
    }

    function hideSnapHint() {
        var map = getMap();
        if (!snapHint) return;
        try {
            if (map) map.geoObjects.remove(snapHint);
        } catch (e) {}
        snapHint = null;
        snapHintColor = '';
    }

    global.AppMotion = {
        motionOn: motionOn,
        play: play,
        setSoundsEnabled: setSoundsEnabled,
        isSoundsEnabled: isSoundsEnabled,
        getPrefs: getPrefs,
        setPref: setPref,
        isPrefEnabled: isPrefEnabled,
        burstAt: burstAt,
        celebrateCreate: celebrateCreate,
        celebrateRemove: celebrateRemove,
        markButtonBusy: markButtonBusy,
        markButtonDone: markButtonDone,
        updateCableLengthHud: updateCableLengthHud,
        hideCableLengthHud: hideCableLengthHud,
        startTraceFlow: startTraceFlow,
        stopTraceFlow: stopTraceFlow,
        emptyStateHtml: emptyStateHtml,
        showSnapHint: showSnapHint,
        hideSnapHint: hideSnapHint
    };
})(typeof window !== 'undefined' ? window : this);
