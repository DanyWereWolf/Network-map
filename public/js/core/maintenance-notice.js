/**
 * Уведомление о технических работах: загрузка с сервера и баннер вверху страницы.
 */
(function() {
    var STORAGE_KEY = 'networkMap_maintenanceDismissed_v1';
    var bannerEl = null;

    function getApiBaseUrl() {
        if (typeof window.getApiBase === 'function') {
            try { return window.getApiBase(); } catch (e) {}
        }
        var o = typeof window !== 'undefined' && window.location && window.location.origin;
        return (o && (o.indexOf('http://') === 0 || o.indexOf('https://') === 0)) ? o : '';
    }

    function getDismissedId() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            return o && o.id ? String(o.id) : null;
        } catch (e) {
            return null;
        }
    }

    function setDismissed(id) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: String(id), ts: Date.now() }));
        } catch (e) {}
    }

    function formatDateRange(startsAt, endsAt) {
        var parts = [];
        var opts = { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' };
        try {
            if (startsAt) {
                var s = new Date(startsAt);
                if (!isNaN(s.getTime())) parts.push('с ' + s.toLocaleString('ru-RU', opts));
            }
            if (endsAt) {
                var e = new Date(endsAt);
                if (!isNaN(e.getTime())) parts.push('до ' + e.toLocaleString('ru-RU', opts));
            }
        } catch (err) {}
        return parts.join(' ');
    }

    function updateBodyOffset() {
        if (!bannerEl || !document.body) return;
        document.documentElement.style.setProperty('--maintenance-notice-offset', (bannerEl.offsetHeight || 52) + 'px');
        document.body.classList.add('maintenance-notice-visible');
    }

    function removeBanner() {
        if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
        bannerEl = null;
        if (document.body) document.body.classList.remove('maintenance-notice-visible');
        document.documentElement.style.removeProperty('--maintenance-notice-offset');
    }

    function showBanner(data) {
        if (!data || !data.active || !data.message) return;
        if (data.id && getDismissedId() === String(data.id)) return;
        if (document.getElementById('maintenanceNoticeBanner')) return;

        var meta = formatDateRange(data.startsAt, data.endsAt);
        var title = (data.title && String(data.title).trim()) || 'Технические работы';

        bannerEl = document.createElement('div');
        bannerEl.id = 'maintenanceNoticeBanner';
        bannerEl.className = 'maintenance-notice';
        bannerEl.setAttribute('role', 'status');
        bannerEl.setAttribute('aria-live', 'polite');

        var inner = document.createElement('div');
        inner.className = 'maintenance-notice-inner';

        var icon = document.createElement('div');
        icon.className = 'maintenance-notice-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '!';

        var textWrap = document.createElement('div');
        textWrap.className = 'maintenance-notice-text';

        var titleEl = document.createElement('strong');
        titleEl.textContent = title;

        var msgEl = document.createElement('p');
        msgEl.textContent = data.message;

        textWrap.appendChild(titleEl);
        textWrap.appendChild(msgEl);

        if (meta) {
            var metaEl = document.createElement('div');
            metaEl.className = 'maintenance-notice-meta';
            metaEl.textContent = meta;
            textWrap.appendChild(metaEl);
        }

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'maintenance-notice-close';
        closeBtn.textContent = 'Понятно';
        closeBtn.addEventListener('click', function() {
            if (data.id) setDismissed(data.id);
            removeBanner();
        });

        inner.appendChild(icon);
        inner.appendChild(textWrap);
        inner.appendChild(closeBtn);
        bannerEl.appendChild(inner);
        document.body.appendChild(bannerEl);

        updateBodyOffset();
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function() { updateBodyOffset(); });
            ro.observe(bannerEl);
        }
    }

    function fetchAndShow() {
        fetch(getApiBaseUrl() + '/api/maintenance-notice', { credentials: 'include' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.active) showBanner(data);
            })
            .catch(function() {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchAndShow);
    } else {
        fetchAndShow();
    }
})();
