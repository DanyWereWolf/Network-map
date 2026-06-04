/**
 * Тема (светлая/тёмная): персонально на пользователя, при первом запуске — из ОС.
 */
var THEME_STORAGE_PREFIX = 'networkMap_theme';

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

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    setTheme(resolveInitialTheme(), { syncServer: false });
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
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
}

function setTheme(theme, options) {
    options = options || {};
    if (theme !== 'dark' && theme !== 'light') theme = resolveInitialTheme();
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
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme, { syncServer: true });
}

window.getThemeStorageKey = getThemeStorageKey;
window.resolveInitialTheme = resolveInitialTheme;
