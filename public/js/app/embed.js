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
        if (q.share === '1' || q.share === 'true' || q.share === 'yes') return true;
        if (q.shareToken || q.share_token) return true;
        try {
            if (document.documentElement.classList.contains('volsmap-embed')) return true;
        } catch (e) {}
        return false;
    }

    function detectShareMode(q) {
        q = q || parseQuery();
        if (q.share === '1' || q.share === 'true' || q.share === 'yes') return true;
        if (q.shareToken || q.share_token) return true;
        return false;
    }

    function getEmbedTokenFromUrl(q) {
        q = q || parseQuery();
        return String(q.embedToken || q.embed_token || '').trim();
    }

    function getShareTokenFromUrl(q) {
        q = q || parseQuery();
        return String(q.shareToken || q.share_token || '').trim();
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

    function applyShareViewHints(user) {
        if (!user || !user.shareView) return;
        try {
            global.__VOLSMAP_SHARE_VIEW__ = user.shareView;
            if (user.shareView.regionId) {
                global.__VOLSMAP_SHARE_REGION_ID__ = String(user.shareView.regionId);
            }
        } catch (e) {}
    }

    function bootstrapAuth() {
        var q = parseQuery();
        var isEmbed = detectEmbedMode(q);
        var embedToken = getEmbedTokenFromUrl(q);
        var shareToken = getShareTokenFromUrl(q);

        if (isEmbed) {
            applyEmbedChrome();
            global.__VOLSMAP_EMBED__ = true;
        }
        if (detectShareMode(q)) {
            global.__VOLSMAP_SHARE__ = true;
        }

        if (!embedToken && !shareToken) {
            return Promise.resolve(true);
        }

        var apiBase = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
        if (!apiBase) {
            showEmbedFatal('Сервер недоступен. Откройте карту через адрес API (например https://volsmap.ru).');
            return Promise.resolve(false);
        }

        var url = shareToken ? (apiBase + '/api/auth/share') : (apiBase + '/api/auth/embed');
        var payload = shareToken ? { shareToken: shareToken } : { embedToken: embedToken };

        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store'
        }).then(function(r) {
            return r.json().then(function(body) {
                return { status: r.status, body: body || {} };
            });
        }).then(function(res) {
            var body = res.body;
            if (!body.success || !body.token || !body.user) {
                showEmbedFatal(body.error || (shareToken ? 'Ссылка просмотра недействительна' : 'Ссылка встраивания недействительна'));
                return false;
            }
            storeEmbedSession(body);
            applyEmbedChrome();
            if (shareToken || body.user.share) {
                global.__VOLSMAP_SHARE__ = true;
                applyShareViewHints(body.user);
            }
            return true;
        }).catch(function() {
            showEmbedFatal(shareToken ? 'Не удалось открыть ссылку просмотра' : 'Не удалось подключить режим встраивания');
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

    function isShare() {
        return !!(global.__VOLSMAP_SHARE__ || detectShareMode());
    }

    function applyShareMapViewIfNeeded() {
        var view = global.__VOLSMAP_SHARE_VIEW__;
        if (!view || !global.myMap) return;
        try {
            if (Array.isArray(view.center) && view.center.length >= 2) {
                var zoom = view.zoom != null ? Number(view.zoom) : (myMap.getZoom ? myMap.getZoom() : 12);
                if (myMap.setCenter) myMap.setCenter(view.center, isNaN(zoom) ? undefined : zoom);
            } else if (view.zoom != null && myMap.setZoom) {
                myMap.setZoom(Number(view.zoom));
            }
        } catch (e) {}
    }

    global.VolsmapEmbed = {
        parseQuery: parseQuery,
        detectEmbedMode: detectEmbedMode,
        detectShareMode: detectShareMode,
        bootstrapAuth: bootstrapAuth,
        applyEmbedChrome: applyEmbedChrome,
        applyShareMapViewIfNeeded: applyShareMapViewIfNeeded,
        isEmbed: isEmbed,
        isShare: isShare
    };

    try {
        if (detectEmbedMode()) {
            document.documentElement.classList.add('volsmap-embed');
            global.__VOLSMAP_EMBED__ = true;
        }
        if (detectShareMode()) {
            global.__VOLSMAP_SHARE__ = true;
        }
    } catch (e) {}
})(typeof window !== 'undefined' ? window : this);
