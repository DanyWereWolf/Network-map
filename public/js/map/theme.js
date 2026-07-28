/**
 * Тема (светлая/тёмная): персонально на пользователя, при первом запуске — из ОС.
 */
var THEME_STORAGE_PREFIX = 'networkMap_theme';
var THEME_TRANSITION_MS = 450;

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
    if (el.dataset.bound === '1') return;
    el.dataset.bound = '1';
    el.addEventListener('change', function() {
        setMapAnimationsEnabled(el.checked);
    });
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
    initMapAnimationsToggle();
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
