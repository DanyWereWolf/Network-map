/**
 * Настройки производительности карты: пресеты и флаги отрисовки.
 * Хранятся локально по userId и синхронизируются в /api/settings (perfSettings).
 */
(function (global) {
    var STORAGE_PREFIX = 'networkMap_perfSettings';
    var syncTimer = null;

    var PRESETS = {
        auto: {
            mode: 'auto',
            animations: true,
            connectionLines: true,
            radioCoverage: true,
            plexus: true,
            virtMin: 400,
            cullMin: 120
        },
        economy: {
            mode: 'economy',
            animations: false,
            connectionLines: false,
            radioCoverage: false,
            plexus: false,
            virtMin: 100,
            cullMin: 50
        },
        max: {
            mode: 'max',
            animations: true,
            connectionLines: true,
            radioCoverage: true,
            plexus: true,
            virtMin: 800,
            cullMin: 250
        }
    };

    var settings = {
        mode: 'auto',
        animations: true,
        lofi: true,
        connectionLines: true,
        radioCoverage: true,
        plexus: true,
        virtMin: 400,
        cullMin: 120
    };

    var syncingUi = false;
    var controlsBound = false;

    function getPerfUserId() {
        try {
            var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
            if (!raw) return null;
            var u = JSON.parse(raw);
            if (u && u.userId != null && String(u.userId).trim() !== '') return String(u.userId).trim();
            if (u && u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
        } catch (e) {}
        return null;
    }

    function getStorageKey() {
        var uid = getPerfUserId();
        return uid ? STORAGE_PREFIX + '_' + uid : STORAGE_PREFIX;
    }

    function clampInt(value, min, max, fallback) {
        var n = parseInt(value, 10);
        if (isNaN(n)) n = fallback;
        return Math.max(min, Math.min(max, n));
    }

    function readBool(raw, key, fallback) {
        if (!raw || raw[key] === undefined || raw[key] === null) return fallback;
        if (raw[key] === false || raw[key] === 0 || raw[key] === '0') return false;
        if (raw[key] === true || raw[key] === 1 || raw[key] === '1') return true;
        return fallback;
    }

    function clonePresetFlags(preset, keepLofi) {
        return {
            mode: preset.mode,
            animations: !!preset.animations,
            lofi: keepLofi !== false,
            connectionLines: !!preset.connectionLines,
            radioCoverage: !!preset.radioCoverage,
            plexus: !!preset.plexus,
            virtMin: clampInt(preset.virtMin, 50, 2000, 400),
            cullMin: clampInt(preset.cullMin, 20, 1000, 120)
        };
    }

    function normalizeSettings(raw) {
        var mode = raw && typeof raw.mode === 'string' ? raw.mode : 'auto';
        if (mode !== 'auto' && mode !== 'economy' && mode !== 'max' && mode !== 'custom') mode = 'auto';
        var base = PRESETS[mode] || PRESETS.auto;
        return {
            mode: mode,
            animations: readBool(raw, 'animations', !!base.animations),
            lofi: readBool(raw, 'lofi', true),
            connectionLines: readBool(raw, 'connectionLines', !!base.connectionLines),
            radioCoverage: readBool(raw, 'radioCoverage', !!base.radioCoverage),
            plexus: readBool(raw, 'plexus', !!base.plexus),
            virtMin: clampInt(raw && raw.virtMin, 50, 2000, base.virtMin),
            cullMin: clampInt(raw && raw.cullMin, 20, 1000, base.cullMin)
        };
    }

    function readFromStorage() {
        var key = getStorageKey();
        try {
            var raw = localStorage.getItem(key);
            if (!raw && key !== STORAGE_PREFIX) raw = localStorage.getItem(STORAGE_PREFIX);
            if (!raw) return null;
            return normalizeSettings(JSON.parse(raw));
        } catch (e) {}
        return null;
    }

    function syncPerfSettingsToServer() {
        if (typeof global.getApiBase !== 'function' || typeof global.getAuthToken !== 'function') return;
        var base = global.getApiBase();
        var token = global.getAuthToken();
        if (!base || !token) return;
        try {
            fetch(base + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ perfSettings: getPerfSettings() })
            }).catch(function () {});
        } catch (e) {}
    }

    function scheduleServerSync() {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(function () {
            syncTimer = null;
            syncPerfSettingsToServer();
        }, 250);
    }

    function persist(options) {
        options = options || {};
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(settings));
        } catch (e) {}
        if (options.syncServer !== false) scheduleServerSync();
    }

    function getPerfSettings() {
        return {
            mode: settings.mode,
            animations: !!settings.animations,
            lofi: !!settings.lofi,
            connectionLines: !!settings.connectionLines,
            radioCoverage: !!settings.radioCoverage,
            plexus: !!settings.plexus,
            virtMin: settings.virtMin,
            cullMin: settings.cullMin
        };
    }

    function areConnectionLinesEnabled() {
        return settings.connectionLines !== false;
    }

    function isRadioCoverageEnabled() {
        return settings.radioCoverage !== false;
    }

    function isPlexusEnabled() {
        return settings.plexus !== false;
    }

    function getPerfVirtualizationThresholds() {
        return {
            virtMin: settings.virtMin,
            cullMin: settings.cullMin
        };
    }

    function detectModeFromFlags(next) {
        var keys = ['auto', 'economy', 'max'];
        for (var i = 0; i < keys.length; i++) {
            var p = PRESETS[keys[i]];
            if (next.animations === p.animations &&
                next.connectionLines === p.connectionLines &&
                next.radioCoverage === p.radioCoverage &&
                next.plexus === p.plexus &&
                next.virtMin === p.virtMin &&
                next.cullMin === p.cullMin) {
                return keys[i];
            }
        }
        return 'custom';
    }

    function applyPlexusPreference(enabled) {
        document.documentElement.classList.toggle('perf-plexus-off', !enabled);
        if (typeof global.setPlexusEnabled === 'function') {
            try { global.setPlexusEnabled(!!enabled); } catch (e) {}
        }
    }

    function applyAnimationsPreference(enabled) {
        document.documentElement.classList.toggle('map-animations-off', !enabled);
        if (typeof global.setMapAnimationsEnabled === 'function') {
            try { global.setMapAnimationsEnabled(!!enabled); } catch (e) {}
        }
    }

    function applyLofiPreference(enabled) {
        if (typeof global.setLofiRadioEnabled === 'function') {
            try { global.setLofiRadioEnabled(!!enabled); } catch (e) {}
        }
    }

    function rebuildRadioCoveragesIfNeeded() {
        if (!Array.isArray(global.objects)) return;
        if (!isRadioCoverageEnabled()) {
            global.objects.forEach(function (obj) {
                if (!obj || !obj.properties || obj.properties.get('type') !== 'radioBridge') return;
                if (typeof global.removeRadioBridgeCoverage === 'function') {
                    try { global.removeRadioBridgeCoverage(obj); } catch (eRm) {}
                }
            });
            if (typeof global.pauseRadioBridgeCoveragePulseAnimation === 'function') {
                try { global.pauseRadioBridgeCoveragePulseAnimation(); } catch (e2) {}
            }
            return;
        }
        global.objects.forEach(function (obj) {
            if (!obj || !obj.properties || obj.properties.get('type') !== 'radioBridge') return;
            if (!obj.properties.get('showCoverage')) return;
            if (typeof global.updateRadioBridgeCoverage === 'function') {
                try { global.updateRadioBridgeCoverage(obj); } catch (e3) {}
            }
        });
        if (typeof global.startRadioBridgeCoveragePulseAnimation === 'function' &&
            typeof global.areMapAnimationsEnabled === 'function' && global.areMapAnimationsEnabled()) {
            try { global.startRadioBridgeCoveragePulseAnimation(); } catch (e4) {}
        }
    }

    function applyConnectionLinesPreference() {
        if (typeof global.applyConnectionLinesVisibility === 'function') {
            try { global.applyConnectionLinesVisibility(); return; } catch (e) {}
        }
        if (typeof global.setAllConnectionLinesVisible === 'function') {
            try { global.setAllConnectionLinesVisible(areConnectionLinesEnabled()); } catch (e2) {}
        }
    }

    function applyPerfSideEffects() {
        applyAnimationsPreference(!!settings.animations);
        applyLofiPreference(!!settings.lofi);
        applyPlexusPreference(isPlexusEnabled());
        applyConnectionLinesPreference();
        rebuildRadioCoveragesIfNeeded();
        try {
            if (typeof global.applyMapViewportUpdate === 'function') global.applyMapViewportUpdate();
            else if (typeof global.applyMapFilter === 'function') global.applyMapFilter();
        } catch (e2) {}
    }

    function setCheckbox(id, checked) {
        var el = document.getElementById(id);
        if (el && el.checked !== !!checked) el.checked = !!checked;
    }

    function syncPerfSettingsUi() {
        var mode = settings.mode;
        ['auto', 'economy', 'max'].forEach(function (name) {
            var btn = document.getElementById('perfMode' + name.charAt(0).toUpperCase() + name.slice(1));
            if (!btn) return;
            var active = mode === name;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        setCheckbox('mapAnimationsToggle', !!settings.animations);
        setCheckbox('lofiRadioEnabledToggle', !!settings.lofi);
        setCheckbox('perfConnectionLinesToggle', areConnectionLinesEnabled());
        setCheckbox('perfRadioCoverageToggle', isRadioCoverageEnabled());
        setCheckbox('perfPlexusToggle', isPlexusEnabled());
    }

    function setPerfSettings(partial, options) {
        options = options || {};
        var next = normalizeSettings({
            mode: partial && partial.mode != null ? partial.mode : settings.mode,
            animations: partial && partial.animations != null ? partial.animations : settings.animations,
            lofi: partial && partial.lofi != null ? partial.lofi : settings.lofi,
            connectionLines: partial && partial.connectionLines != null ? partial.connectionLines : settings.connectionLines,
            radioCoverage: partial && partial.radioCoverage != null ? partial.radioCoverage : settings.radioCoverage,
            plexus: partial && partial.plexus != null ? partial.plexus : settings.plexus,
            virtMin: partial && partial.virtMin != null ? partial.virtMin : settings.virtMin,
            cullMin: partial && partial.cullMin != null ? partial.cullMin : settings.cullMin
        });
        if (options.recomputeMode) {
            next.mode = detectModeFromFlags(next);
        }
        settings = next;
        if (options.persist !== false) persist({ syncServer: options.syncServer !== false });
        syncingUi = true;
        try {
            if (options.apply !== false) applyPerfSideEffects();
            syncPerfSettingsUi();
        } finally {
            syncingUi = false;
        }
        return getPerfSettings();
    }

    function applyPerfPreset(name, options) {
        options = options || {};
        var key = name === 'economy' || name === 'max' || name === 'auto' ? name : 'auto';
        var preset = PRESETS[key];
        var keepLofi = settings.lofi !== false;
        settings = clonePresetFlags(preset, keepLofi);
        if (options.persist !== false) persist({ syncServer: options.syncServer !== false });
        syncingUi = true;
        try {
            if (options.apply !== false) applyPerfSideEffects();
            syncPerfSettingsUi();
        } finally {
            syncingUi = false;
        }
        return getPerfSettings();
    }

    function applyPerfSettingsFromServer(raw, options) {
        options = options || {};
        if (!raw || typeof raw !== 'object') return getPerfSettings();
        settings = normalizeSettings(raw);
        if (options.persist !== false) persist({ syncServer: false });
        syncingUi = true;
        try {
            if (options.apply !== false) applyPerfSideEffects();
            syncPerfSettingsUi();
        } finally {
            syncingUi = false;
        }
        return getPerfSettings();
    }

    function onPerfToggleChange(key, checked) {
        if (syncingUi) return;
        var patch = {};
        patch[key] = !!checked;
        setPerfSettings(patch, {
            persist: true,
            recomputeMode: key !== 'lofi'
        });
    }

    function bindPerfControls() {
        if (controlsBound) return;
        var root = document.getElementById('settings-perf-content');
        if (!root) return;
        controlsBound = true;

        root.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('[data-perf-mode]') : null;
            if (!btn || !root.contains(btn)) return;
            e.preventDefault();
            applyPerfPreset(btn.getAttribute('data-perf-mode'), { persist: true, apply: true });
        });

        root.addEventListener('change', function (e) {
            var t = e.target;
            if (!t || t.tagName !== 'INPUT' || t.type !== 'checkbox') return;
            if (syncingUi) return;
            var id = t.id;
            if (id === 'mapAnimationsToggle') onPerfToggleChange('animations', t.checked);
            else if (id === 'lofiRadioEnabledToggle') onPerfToggleChange('lofi', t.checked);
            else if (id === 'perfConnectionLinesToggle') onPerfToggleChange('connectionLines', t.checked);
            else if (id === 'perfRadioCoverageToggle') onPerfToggleChange('radioCoverage', t.checked);
            else if (id === 'perfPlexusToggle') onPerfToggleChange('plexus', t.checked);
        });
    }

    function initPerfSettingsControls() {
        var saved = readFromStorage();
        if (saved) settings = saved;
        else settings = clonePresetFlags(PRESETS.auto, true);

        if (typeof global.areMapAnimationsEnabled === 'function' && saved && saved.animations === undefined) {
            settings.animations = !!global.areMapAnimationsEnabled();
        }
        if (typeof global.isLofiRadioEnabled === 'function' && (saved == null || saved.lofi === undefined)) {
            settings.lofi = !!global.isLofiRadioEnabled();
        }

        try {
            if (!localStorage.getItem('networkMap_perfLofiIndependent')) {
                localStorage.setItem('networkMap_perfLofiIndependent', '1');
                if (settings.lofi === false) {
                    settings.lofi = true;
                    persist({ syncServer: false });
                }
            }
        } catch (eMig) {}

        bindPerfControls();
        syncingUi = true;
        try {
            applyPerfSideEffects();
            syncPerfSettingsUi();
        } finally {
            syncingUi = false;
        }
    }

    (function bootstrap() {
        var saved = readFromStorage();
        if (saved) settings = saved;
    })();

    global.getPerfSettings = getPerfSettings;
    global.setPerfSettings = setPerfSettings;
    global.applyPerfPreset = applyPerfPreset;
    global.applyPerfSettingsFromServer = applyPerfSettingsFromServer;
    global.areConnectionLinesEnabled = areConnectionLinesEnabled;
    global.isRadioCoverageEnabled = isRadioCoverageEnabled;
    global.isPlexusEnabled = isPlexusEnabled;
    global.getPerfVirtualizationThresholds = getPerfVirtualizationThresholds;
    global.initPerfSettingsControls = initPerfSettingsControls;
})(typeof window !== 'undefined' ? window : this);
