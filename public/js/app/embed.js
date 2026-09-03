/**
 * Режим встраивания карты (Zabbix URL widget и др.): ?embed=1&embedToken=emb_…
 */
(function(global) {
    'use strict';

    function parseQuery() {
        var out = {};
        try {
            var search = (global.location && global.location.search) ? String(global.location.search).replace(/^\?/, '') : '';
            search.split('&').forEach(function(part) {
                if (!part) return;
                var kv = part.split('=');
                var key = decodeURIComponent(kv[0] || '');
                var val = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
                out[key] = val;
            });
        } catch (e) {}
        return out;
    }

    function detectEmbedMode(q) {
        q = q || parseQuery();
        if (q.embed === '1' || q.embed === 'true' || q.embed === 'yes') return true;
        if (q.embedToken || q.embed_token) return true;
        try {
            if (document.documentElement.classList.contains('volsmap-embed')) return true;
        } catch (e) {}
        return false;
    }

    function getEmbedTokenFromUrl(q) {
        q = q || parseQuery();
        return String(q.embedToken || q.embed_token || '').trim();
    }

    function applyEmbedChrome() {
        try {
            document.documentElement.classList.add('volsmap-embed');
            if (document.body) document.body.classList.add('volsmap-embed');
        } catch (e) {}
        try {
            var meta = document.querySelector('meta[name="robots"]');
            if (meta) meta.setAttribute('content', 'noindex, nofollow');
        } catch (e2) {}
        try {
            var wm = document.getElementById('welcomeModal');
            if (wm) wm.style.display = 'none';
        } catch (e3) {}
        try {
            sessionStorage.setItem('networkMap_welcomeSeen', '1');
            sessionStorage.setItem('networkMap_viewModeHintShown', '1');
        } catch (e4) {}
    }

    function storeEmbedSession(body) {
        if (!body || !body.token || !body.user) return;
        try {
            sessionStorage.setItem('networkMap_token', body.token);
            sessionStorage.setItem('networkMap_session', JSON.stringify(body.user));
            localStorage.removeItem('networkMap_token');
            localStorage.removeItem('networkMap_session');
            localStorage.removeItem('networkMap_tokenExpiry');
        } catch (e) {}
    }

    /**
     * @returns {Promise<boolean>} false — не продолжать загрузку карты (ошибка / редирект)
     */
    function bootstrapAuth() {
        var q = parseQuery();
        var isEmbed = detectEmbedMode(q);
        var embedToken = getEmbedTokenFromUrl(q);

        if (isEmbed) {
            applyEmbedChrome();
            global.__VOLSMAP_EMBED__ = true;
        }

        if (!embedToken) {
            return Promise.resolve(true);
        }

        var apiBase = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
        if (!apiBase) {
            showEmbedFatal('Сервер недоступен. Откройте карту через адрес API (например https://volsmap.ru).');
            return Promise.resolve(false);
        }

        return fetch(apiBase + '/api/auth/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embedToken: embedToken }),
            cache: 'no-store'
        }).then(function(r) {
            return r.json().then(function(body) {
                return { status: r.status, body: body || {} };
            });
        }).then(function(res) {
            var body = res.body;
            if (!body.success || !body.token || !body.user) {
                showEmbedFatal(body.error || 'Ссылка встраивания недействительна');
                return false;
            }
            storeEmbedSession(body);
            applyEmbedChrome();
            return true;
        }).catch(function() {
            showEmbedFatal('Не удалось подключить режим встраивания');
            return false;
        });
    }

    function showEmbedFatal(message) {
        applyEmbedChrome();
        try {
            var overlay = document.getElementById('appEntranceOverlay');
            if (overlay) {
                overlay.removeAttribute('hidden');
                overlay.style.display = '';
                overlay.setAttribute('aria-busy', 'false');
                var status = overlay.querySelector('.map-loading-text, .app-entrance__status');
                if (status) status.textContent = message || 'Ошибка встраивания';
                var bar = overlay.querySelector('.app-entrance__bar');
                if (bar) bar.style.display = 'none';
            } else if (typeof showError === 'function') {
                showError(message);
            } else {
                alert(message);
            }
        } catch (e) {}
    }

    function isEmbed() {
        return !!(global.__VOLSMAP_EMBED__ || detectEmbedMode());
    }

    global.VolsmapEmbed = {
        parseQuery: parseQuery,
        detectEmbedMode: detectEmbedMode,
        bootstrapAuth: bootstrapAuth,
        applyEmbedChrome: applyEmbedChrome,
        isEmbed: isEmbed
    };

    try {
        if (detectEmbedMode()) {
            document.documentElement.classList.add('volsmap-embed');
            global.__VOLSMAP_EMBED__ = true;
        }
    } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
