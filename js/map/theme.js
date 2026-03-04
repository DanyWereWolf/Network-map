/**
 * Тема (светлая/тёмная).
 */
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!getApiBase()) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    });
    window.addEventListener('blur', function() {
        window.syncDragInProgress = false;
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (getApiBase()) {
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
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}
