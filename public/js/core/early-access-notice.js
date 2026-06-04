/**
 * Баннер: программа в раннем доступе, нужна обратная связь.
 */
(function() {
    var STORAGE_KEY = 'networkMap_earlyAccessDismissed_v1';
    var bannerEl = null;

    var BANNER = {
        id: 'ea_v1_2026',
        title: 'Ранний доступ',
        message: 'Программа активно развивается. Если есть предложения — что добавить или изменить — напишите через чат в углу экрана или владельцу в разделе «Контакты».'
    };

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

    function updateBodyOffset() {
        if (!bannerEl || !document.body) return;
        document.documentElement.style.setProperty('--early-access-notice-offset', (bannerEl.offsetHeight || 56) + 'px');
        document.body.classList.add('early-access-notice-visible');
    }

    function removeBanner() {
        if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
        bannerEl = null;
        if (document.body) document.body.classList.remove('early-access-notice-visible');
        document.documentElement.style.removeProperty('--early-access-notice-offset');
    }

    function showBanner() {
        if (BANNER.id && getDismissedId() === String(BANNER.id)) return;
        if (document.getElementById('earlyAccessNoticeBanner')) return;

        bannerEl = document.createElement('div');
        bannerEl.id = 'earlyAccessNoticeBanner';
        bannerEl.className = 'early-access-notice';
        bannerEl.setAttribute('role', 'status');

        var inner = document.createElement('div');
        inner.className = 'early-access-notice-inner';

        var icon = document.createElement('div');
        icon.className = 'early-access-notice-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'β';

        var textWrap = document.createElement('div');
        textWrap.className = 'early-access-notice-text';
        var titleEl = document.createElement('strong');
        titleEl.textContent = BANNER.title;
        var msgEl = document.createElement('p');
        msgEl.textContent = BANNER.message;
        textWrap.appendChild(titleEl);
        textWrap.appendChild(msgEl);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'early-access-notice-close';
        closeBtn.textContent = 'Понятно';
        closeBtn.addEventListener('click', function() {
            if (BANNER.id) setDismissed(BANNER.id);
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showBanner);
    } else {
        showBanner();
    }
})();
