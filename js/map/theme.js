/**
 * Тема (светлая/тёмная).
 */
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    var saved = null;
    try {
        saved = localStorage.getItem('networkMap_theme') || localStorage.getItem('networkMap_landingTheme');
    } catch (e) {}
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = (saved === 'dark' || saved === 'light') ? saved : (prefersDark ? 'dark' : 'light');
    setTheme(theme);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!getApiBase()) {
            document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            if (typeof refreshMapPlacemarkIcons === 'function') refreshMapPlacemarkIcons();
        }
    });
    window.addEventListener('blur', function() {
        window.syncDragInProgress = false;
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('networkMap_theme', theme); } catch (e) {}
    if (getApiBase() && getAuthToken()) {
        fetch(getApiBase() + '/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
            body: JSON.stringify({ theme: theme })
        }).catch(function() {});
    }
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

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}
