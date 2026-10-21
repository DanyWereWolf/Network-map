/**
 * Режим нативного приложения Volsmap (WebView, User-Agent VolsmapAndroid).
 */
(function(global) {
    'use strict';

    function detectAndroidApp() {
        try {
            if (global.__VOLSMAP_ANDROID__) return true;
            var ua = String(navigator.userAgent || '');
            if (ua.indexOf('VolsmapAndroid') >= 0) return true;
            if (document.documentElement.classList.contains('volsmap-android-app')) return true;
            var search = global.location && global.location.search ? global.location.search : '';
            if (search.indexOf('app=android') >= 0 || search.indexOf('source=android') >= 0) return true;
        } catch (e) {}
        return false;
    }

    function markRoot() {
        try {
            document.documentElement.classList.add('volsmap-android-app');
        } catch (e) {}
    }

    function hideLandingLinks() {
        try {
            document.querySelectorAll('.auth-main-link').forEach(function(el) {
                el.style.display = 'none';
            });
            document.querySelectorAll('a[href]').forEach(function(a) {
                var href = String(a.getAttribute('href') || '').toLowerCase();
                if (href === '/' || href === '../' || href.indexOf('pricing') >= 0 || href.indexOf('news.html') >= 0) {
                    a.style.display = 'none';
                }
            });
        } catch (e) {}
    }

    function updateMetaTheme() {
        try {
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', '#0f172a');
        } catch (e) {}
    }

    function isMobileView() {
        try {
            return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches;
        } catch (e) {
            return true;
        }
    }

    function ensureReadonlyBar() {
        if (!document.querySelector('.map-area-wrapper')) return;
        if (document.getElementById('volsmapAndroidReadonlyBar')) return;
        if (!isMobileView()) return;

        var bar = document.createElement('div');
        bar.id = 'volsmapAndroidReadonlyBar';
        bar.className = 'volsmap-android-readonly-bar';
        bar.setAttribute('role', 'status');
        bar.textContent = 'Режим просмотра — правки карты доступны с компьютера';

        var header = document.querySelector('.top-header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(bar, header.nextSibling);
        }
    }

    function initAuthPage() {
        if (!document.body || !document.body.classList.contains('auth-page')) return;
        hideLandingLinks();
        var subtitle = document.querySelector('.auth-subtitle');
        if (subtitle) {
            subtitle.textContent = 'Мобильное приложение Volsmap — вход в карту вашей организации';
        }
    }

    function init() {
        if (!detectAndroidApp()) return;
        global.__VOLSMAP_ANDROID__ = true;
        markRoot();
        updateMetaTheme();
        hideLandingLinks();
        initAuthPage();
        ensureReadonlyBar();
        if (typeof syncNativeAndroidSession === 'function') {
            syncNativeAndroidSession();
        }
        try {
            global.dispatchEvent(new CustomEvent('volsmap-android-ready'));
        } catch (e) {}
    }

    global.VolsmapAndroid = {
        isApp: detectAndroidApp,
        init: init,
        hideLandingLinks: hideLandingLinks
    };

    if (detectAndroidApp()) {
        markRoot();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);
