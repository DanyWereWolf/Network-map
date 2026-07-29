/**
 * Тема (светлая/тёмная + акцент), анимации карты и LOD-пороги масштаба.
 */
var THEME_STORAGE_PREFIX = 'networkMap_theme';
var THEME_ACCENT_STORAGE_PREFIX = 'networkMap_themeAccent';
var THEME_TRANSITION_MS = 450;

var THEME_ACCENT_PRESETS = {
    blue: '#2563eb',
    teal: '#0d9488',
    violet: '#7c3aed',
    rose: '#e11d48',
    amber: '#d97706',
    emerald: '#059669'
};

var DEFAULT_THEME_ACCENT = { id: 'blue', color: THEME_ACCENT_PRESETS.blue };

function getThemeUserIdFromSession() {
    try {
        var raw = localStorage.getItem('networkMap_session') || sessionStorage.getItem('networkMap_session');
        if (!raw) return null;
        var u = JSON.parse(raw);
        if (u && u.userId != null && String(u.userId).trim() !== '') return String(u.userId).trim();
        if (u && u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
    } catch (e) {}
    return null;
}

function getThemeStorageKey() {
    var uid = getThemeUserIdFromSession();
    return uid ? THEME_STORAGE_PREFIX + '_' + uid : THEME_STORAGE_PREFIX;
}

function getThemeAccentStorageKey() {
    var uid = getThemeUserIdFromSession();
    return uid ? THEME_ACCENT_STORAGE_PREFIX + '_' + uid : THEME_ACCENT_STORAGE_PREFIX;
}

function getSystemPreferredTheme() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readSavedThemeFromStorage() {
    var key = getThemeStorageKey();
    try {
        var saved = localStorage.getItem(key);
        if (saved !== 'dark' && saved !== 'light' && key !== THEME_STORAGE_PREFIX) {
            saved = localStorage.getItem(THEME_STORAGE_PREFIX);
        }
        if (saved !== 'dark' && saved !== 'light') {
            saved = localStorage.getItem('networkMap_landingTheme');
        }
        if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return null;
}

function userHasExplicitThemePreference() {
    return readSavedThemeFromStorage() !== null;
}

function resolveInitialTheme() {
    var saved = readSavedThemeFromStorage();
    return saved || getSystemPreferredTheme();
}

function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

var MAP_ANIMATIONS_STORAGE_KEY = 'networkMap_mapAnimations';

function readMapAnimationsPreference() {
    try {
        var saved = localStorage.getItem(MAP_ANIMATIONS_STORAGE_KEY);
        if (saved === '0' || saved === 'false') return false;
        if (saved === '1' || saved === 'true') return true;
    } catch (e) {}
    return null;
}

/** Анимации на карте: пульсации, плавный pan/zoom. Без явной настройки — как prefers-reduced-motion. */
function areMapAnimationsEnabled() {
    var pref = readMapAnimationsPreference();
    if (pref !== null) return pref;
    return !prefersReducedMotion();
}

function mapMotionDuration(ms) {
    var n = typeof ms === 'number' && ms > 0 ? ms : 0;
    return areMapAnimationsEnabled() ? n : 0;
}

function applyMapAnimationsPreference(enabled) {
    document.documentElement.classList.toggle('map-animations-off', !enabled);
    if (enabled) {
        if (typeof startRadioBridgeCoveragePulseAnimation === 'function') {
            startRadioBridgeCoveragePulseAnimation();
        }
        if (typeof restartGponRoutingPulseAnimationIfNeeded === 'function') {
            restartGponRoutingPulseAnimationIfNeeded();
        }
    } else {
        if (typeof pauseRadioBridgeCoveragePulseAnimation === 'function') {
            pauseRadioBridgeCoveragePulseAnimation();
        }
        if (typeof freezeRadioBridgeCoveragePulses === 'function') {
            freezeRadioBridgeCoveragePulses();
        }
        if (typeof freezeGponRoutingPulseAnimation === 'function') {
            freezeGponRoutingPulseAnimation();
        }
    }
}

function setMapAnimationsEnabled(enabled) {
    enabled = !!enabled;
    try { localStorage.setItem(MAP_ANIMATIONS_STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
    applyMapAnimationsPreference(enabled);
    var el = document.getElementById('mapAnimationsToggle');
    if (el && el.checked !== enabled) el.checked = enabled;
    return enabled;
}

function initMapAnimationsToggle() {
    var enabled = areMapAnimationsEnabled();
    document.documentElement.classList.toggle('map-animations-off', !enabled);
    var el = document.getElementById('mapAnimationsToggle');
    if (!el) return;
    el.checked = enabled;
    // В настройках производительности переключатель биндится отдельно.
    if (document.getElementById('perfModeAuto')) return;
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('change', function() {
        setMapAnimationsEnabled(el.checked);
    });
}

function normalizeHexColor(value) {
    if (!value || typeof value !== 'string') return null;
    var hex = value.trim();
    if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
        hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    return hex.toLowerCase();
}

function hexToRgbParts(hex) {
    var n = normalizeHexColor(hex);
    if (!n) return null;
    return {
        r: parseInt(n.slice(1, 3), 16),
        g: parseInt(n.slice(3, 5), 16),
        b: parseInt(n.slice(5, 7), 16)
    };
}

function mixHexToward(hex, towardHex, amount) {
    var a = hexToRgbParts(hex);
    var b = hexToRgbParts(towardHex);
    if (!a || !b) return hex;
    var t = Math.max(0, Math.min(1, amount));
    function ch(x, y) { return Math.round(x + (y - x) * t); }
    function toHex(n) { return ('0' + n.toString(16)).slice(-2); }
    return '#' + toHex(ch(a.r, b.r)) + toHex(ch(a.g, b.g)) + toHex(ch(a.b, b.b));
}

function accentSoftRgba(hex, alpha) {
    var rgb = hexToRgbParts(hex);
    if (!rgb) return 'rgba(37, 99, 235, ' + alpha + ')';
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + alpha + ')';
}

function buildHeaderGradient(accentHex, isDark) {
    var deep = mixHexToward(accentHex, '#0f172a', isDark ? 0.55 : 0.42);
    var mid = mixHexToward(accentHex, '#1e3a8a', isDark ? 0.28 : 0.18);
    var bright = mixHexToward(accentHex, '#ffffff', isDark ? 0.12 : 0.18);
    if (isDark) {
        return 'linear-gradient(135deg, #0f172a 0%, ' + deep + ' 48%, ' + mid + ' 100%)';
    }
    return 'linear-gradient(122deg, ' + deep + ' 0%, ' + mid + ' 42%, ' + accentHex + ' 78%, ' + bright + ' 100%)';
}

function readSavedThemeAccent() {
    var key = getThemeAccentStorageKey();
    try {
        var raw = localStorage.getItem(key);
        if (!raw && key !== THEME_ACCENT_STORAGE_PREFIX) {
            raw = localStorage.getItem(THEME_ACCENT_STORAGE_PREFIX);
        }
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        var color = normalizeHexColor(parsed.color);
        if (!color) return null;
        var id = typeof parsed.id === 'string' ? parsed.id : 'custom';
        if (THEME_ACCENT_PRESETS[id] && THEME_ACCENT_PRESETS[id] === color) {
            return { id: id, color: color };
        }
        return { id: 'custom', color: color };
    } catch (e) {}
    return null;
}

function getThemeAccent() {
    return readSavedThemeAccent() || DEFAULT_THEME_ACCENT;
}

function applyThemeAccentToDocument(accent) {
    accent = accent || getThemeAccent();
    var color = normalizeHexColor(accent.color) || DEFAULT_THEME_ACCENT.color;
    var id = accent.id || 'custom';
    var root = document.documentElement;
    var isDark = root.getAttribute('data-theme') === 'dark';
    root.style.setProperty('--accent-primary', color);
    root.style.setProperty('--accent-primary-soft', accentSoftRgba(color, isDark ? 0.18 : 0.12));
    root.style.setProperty('--header-bg', buildHeaderGradient(color, isDark));
    root.style.setProperty('--header-border', accentSoftRgba(color, isDark ? 0.28 : 0.4));
    root.style.setProperty('--sidebar-card-accent-hi', mixHexToward(color, '#ffffff', 0.35));
    syncThemeAccentUi({ id: id, color: color });
    if (typeof window.refreshPlexusAccentColors === 'function') {
        window.refreshPlexusAccentColors();
    }
}

function persistThemeAccent(accent) {
    try {
        localStorage.setItem(getThemeAccentStorageKey(), JSON.stringify({
            id: accent.id || 'custom',
            color: accent.color
        }));
    } catch (e) {}
}

function syncThemeAccentToServer(accent) {
    if (typeof getApiBase !== 'function' || typeof getAuthToken !== 'function') return;
    var base = getApiBase();
    var token = getAuthToken();
    if (!base || !token) return;
    try {
        fetch(base + '/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ themeAccent: {
                id: accent.id || 'custom',
                color: accent.color
            }})
        }).catch(function () {});
    } catch (e) {}
}

function setThemeAccent(accent, options) {
    options = options || {};
    var color = normalizeHexColor(accent && accent.color);
    if (!color) color = DEFAULT_THEME_ACCENT.color;
    var id = (accent && accent.id) || 'custom';
    if (THEME_ACCENT_PRESETS[id] && THEME_ACCENT_PRESETS[id] !== color) id = 'custom';
    if (!THEME_ACCENT_PRESETS[id]) id = 'custom';
    var next = { id: id, color: color };
    if (options.persist !== false) persistThemeAccent(next);
    applyThemeAccentToDocument(next);
    syncThemeAccentUi(next);
    if (options.syncServer && getApiBase() && getAuthToken()) {
        syncThemeAccentToServer(next);
    }
    return next;
}

function syncThemeAccentUi(accent) {
    accent = accent || getThemeAccent();
    var color = accent.color || DEFAULT_THEME_ACCENT.color;
    var id = accent.id || 'custom';
    document.querySelectorAll('.theme-accent-swatch').forEach(function(btn) {
        var presetId = btn.getAttribute('data-accent');
        var active = id !== 'custom' && presetId === id;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    var customInput = document.getElementById('themeAccentCustom');
    if (customInput && customInput.value.toLowerCase() !== color) {
        customInput.value = color;
    }
}

function initThemeAccentControls() {
    applyThemeAccentToDocument(getThemeAccent());
    document.querySelectorAll('.theme-accent-swatch').forEach(function(btn) {
        if (btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        btn.addEventListener('click', function() {
            var presetId = btn.getAttribute('data-accent');
            var color = THEME_ACCENT_PRESETS[presetId];
            if (!color) return;
            setThemeAccent({ id: presetId, color: color }, { persist: true, syncServer: true });
        });
    });
    var customInput = document.getElementById('themeAccentCustom');
    if (customInput && customInput.dataset.bound !== '1') {
        customInput.dataset.bound = '1';
        customInput.addEventListener('input', function() {
            var color = normalizeHexColor(customInput.value);
            if (!color) return;
            setThemeAccent({ id: 'custom', color: color }, { persist: true, syncServer: true });
        });
    }
}

function formatMapZoomValue(zoom) {
    if (typeof zoom !== 'number' || isNaN(zoom)) return '—';
    var rounded = Math.round(zoom * 10) / 10;
    return (Math.abs(rounded - Math.round(rounded)) < 0.05)
        ? String(Math.round(rounded))
        : rounded.toFixed(1);
}

function updateSettingsCurrentZoom(zoom) {
    var el = document.getElementById('appSettingsCurrentZoom');
    if (!el) return;
    if (zoom == null && typeof myMap !== 'undefined' && myMap && typeof myMap.getZoom === 'function') {
        try { zoom = myMap.getZoom(); } catch (e) { zoom = null; }
    }
    el.textContent = formatMapZoomValue(zoom);
}

function syncLodControlsUi(thresholds) {
    thresholds = thresholds || (typeof getLodThresholds === 'function' ? getLodThresholds() : null);
    if (!thresholds) return;
    var objectsEl = document.getElementById('lodObjectsZoom');
    var labelsEl = document.getElementById('lodLabelsZoom');
    var regionsEl = document.getElementById('lodRegionsZoom');
    var objectsVal = document.getElementById('lodObjectsZoomValue');
    var labelsVal = document.getElementById('lodLabelsZoomValue');
    var regionsVal = document.getElementById('lodRegionsZoomValue');
    if (objectsEl) objectsEl.value = String(thresholds.objects);
    if (labelsEl) labelsEl.value = String(thresholds.labels);
    if (regionsEl) regionsEl.value = String(thresholds.regions);
    if (objectsVal) objectsVal.textContent = String(thresholds.objects);
    if (labelsVal) labelsVal.textContent = String(thresholds.labels);
    if (regionsVal) regionsVal.textContent = String(thresholds.regions);
}

function applyLodThresholdChange(partial) {
    if (typeof setLodThresholds !== 'function') return;
    var next = setLodThresholds(partial, { syncServer: true });
    syncLodControlsUi(next);
    try {
        if (typeof applyMapViewportUpdate === 'function') applyMapViewportUpdate();
        else if (typeof applyMapFilter === 'function') applyMapFilter();
        else if (typeof applyLowZoomMapUpdate === 'function') applyLowZoomMapUpdate();
    } catch (e) {}
}

function initLodThresholdControls() {
    if (typeof getLodThresholds === 'function') {
        syncLodControlsUi(getLodThresholds());
    }
    updateSettingsCurrentZoom();

    var objectsEl = document.getElementById('lodObjectsZoom');
    var labelsEl = document.getElementById('lodLabelsZoom');
    var regionsEl = document.getElementById('lodRegionsZoom');
    var resetBtn = document.getElementById('lodResetBtn');

    function bindRange(el, key) {
        if (!el || el.dataset.bound === '1') return;
        el.dataset.bound = '1';
        el.addEventListener('input', function() {
            var value = parseInt(el.value, 10);
            if (isNaN(value)) return;
            var patch = {};
            patch[key] = value;
            applyLodThresholdChange(patch);
        });
    }

    bindRange(objectsEl, 'objects');
    bindRange(labelsEl, 'labels');
    bindRange(regionsEl, 'regions');

    if (resetBtn && resetBtn.dataset.bound !== '1') {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', function() {
            if (typeof resetLodThresholds === 'function') {
                syncLodControlsUi(resetLodThresholds({ syncServer: true }));
                try {
                    if (typeof applyMapViewportUpdate === 'function') applyMapViewportUpdate();
                    else if (typeof applyMapFilter === 'function') applyMapFilter();
                } catch (e) {}
            }
        });
    }
}

function runThemeTransition(applyFn) {
    if (prefersReducedMotion()) {
        applyFn();
        return;
    }
    var root = document.documentElement;
    root.classList.add('theme-changing');
    void root.offsetHeight;
    applyFn();
    window.setTimeout(function() {
        root.classList.remove('theme-changing');
    }, THEME_TRANSITION_MS + 40);
}

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    setTheme(resolveInitialTheme(), { syncServer: false });
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    try { initMapAnimationsToggle(); } catch (eAnim) {}
    try { initThemeAccentControls(); } catch (eAccent) {}
    try { initLodThresholdControls(); } catch (eLod) {}
    try {
        if (typeof initPerfSettingsControls === 'function') initPerfSettingsControls();
    } catch (ePerf) {}
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (userHasExplicitThemePreference()) return;
        applyThemeToDocument(e.matches ? 'dark' : 'light');
        if (typeof refreshMapPlacemarkIcons === 'function') refreshMapPlacemarkIcons();
    });
    window.addEventListener('blur', function() {
        window.syncDragInProgress = false;
    });
}

function applyThemeToDocument(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var lightIcon = document.querySelector('.theme-icon-light');
    var darkIcon = document.querySelector('.theme-icon-dark');
    if (theme === 'dark') {
        if (lightIcon) lightIcon.style.display = 'none';
        if (darkIcon) darkIcon.style.display = 'block';
    } else {
        if (lightIcon) lightIcon.style.display = 'block';
        if (darkIcon) darkIcon.style.display = 'none';
    }
    applyThemeAccentToDocument(getThemeAccent());
    if (typeof refreshMapPlacemarkIcons === 'function') {
        refreshMapPlacemarkIcons();
    }
    if (typeof window.refreshCollaboratorCursorsForTheme === 'function') {
        window.refreshCollaboratorCursorsForTheme();
    }
}

function setTheme(theme, options) {
    options = options || {};
    if (theme !== 'dark' && theme !== 'light') theme = resolveInitialTheme();

    var doApply = function() {
        applyThemeToDocument(theme);
        if (options.persist !== false) {
            try { localStorage.setItem(getThemeStorageKey(), theme); } catch (e) {}
        }
        if (options.syncServer && getApiBase() && getAuthToken()) {
            fetch(getApiBase() + '/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
                body: JSON.stringify({ theme: theme })
            }).catch(function() {});
        }
    };

    if (options.animate) {
        runThemeTransition(doApply);
    } else {
        doApply();
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme, { syncServer: true, animate: true });
}

window.getThemeStorageKey = getThemeStorageKey;
window.resolveInitialTheme = resolveInitialTheme;
window.prefersReducedMotion = prefersReducedMotion;
window.areMapAnimationsEnabled = areMapAnimationsEnabled;
window.mapMotionDuration = mapMotionDuration;
window.setMapAnimationsEnabled = setMapAnimationsEnabled;
window.initMapAnimationsToggle = initMapAnimationsToggle;
window.getThemeAccent = getThemeAccent;
window.setThemeAccent = setThemeAccent;
window.updateSettingsCurrentZoom = updateSettingsCurrentZoom;
window.syncLodControlsUi = syncLodControlsUi;
