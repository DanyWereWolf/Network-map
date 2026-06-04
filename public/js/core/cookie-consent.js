/**
 * Согласие на cookie: баннер при первом визите, хранение выбора в localStorage и cookie nm_consent.
 */
(function() {
    var STORAGE_KEY = 'networkMap_cookieConsent_v1';
    var COOKIE_NAME = 'nm_consent';

    function getStored() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || o.version !== 1) return null;
            if (o.choice !== 'all' && o.choice !== 'necessary') return null;
            return o;
        } catch (e) {
            return null;
        }
    }

    function setConsentCookie(choice) {
        var maxAge = 60 * 60 * 24 * 400;
        var secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = COOKIE_NAME + '=' + encodeURIComponent(choice) + '; path=/; max-age=' + maxAge + '; SameSite=Lax' + secure;
    }

    function saveChoice(choice) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                version: 1,
                choice: choice,
                ts: Date.now()
            }));
        } catch (e) {}
        setConsentCookie(choice);
        try {
            window.dispatchEvent(new CustomEvent('cookieConsent', { detail: { choice: choice } }));
        } catch (e) {}
    }

    function removeBanner(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function showBanner() {
        if (document.getElementById('cookieConsentBanner')) return;

        var wrap = document.createElement('div');
        wrap.id = 'cookieConsentBanner';
        wrap.className = 'cookie-consent';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-labelledby', 'cookieConsentTitle');
        wrap.setAttribute('aria-live', 'polite');

        wrap.innerHTML =
            '<div class="cookie-consent-inner">' +
                '<div class="cookie-consent-text">' +
                    '<strong id="cookieConsentTitle">Файлы cookie и локальные данные</strong>' +
                    '<p>Мы используем cookie и локальное хранилище браузера для входа, сессии, настроек темы и запоминания вашего выбора. ' +
                    'Дополнительные инструменты аналитики могут подключаться только после согласия на все cookie.</p>' +
                '</div>' +
                '<div class="cookie-consent-actions">' +
                    '<button type="button" class="cookie-consent-btn cookie-consent-btn-ghost" id="cookieConsentNecessary">Только необходимые</button>' +
                    '<button type="button" class="cookie-consent-btn cookie-consent-btn-primary" id="cookieConsentAll">Принять все</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(wrap);

        document.getElementById('cookieConsentNecessary').addEventListener('click', function() {
            saveChoice('necessary');
            removeBanner(wrap);
        });
        document.getElementById('cookieConsentAll').addEventListener('click', function() {
            saveChoice('all');
            removeBanner(wrap);
        });
    }

    function init() {
        var stored = getStored();
        if (stored) {
            setConsentCookie(stored.choice);
            try {
                window.dispatchEvent(new CustomEvent('cookieConsent', { detail: { choice: stored.choice, restored: true } }));
            } catch (e) {}
            return;
        }
        showBanner();
    }

    window.getCookieConsent = function() {
        return getStored();
    };

    window.setCookieConsent = function(choice) {
        if (choice !== 'all' && choice !== 'necessary') return;
        saveChoice(choice);
        var b = document.getElementById('cookieConsentBanner');
        if (b) removeBanner(b);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
