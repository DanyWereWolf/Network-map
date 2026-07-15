/**
 * Ловушка DevTools: запрос пароля главного админа.
 * Неверный пароль → полноэкранное изображение. На localhost выключено.
 */
(function () {
    var STORAGE_KEY = 'networkMap_devtoolsUnlocked';
    var DENIED_KEY = 'networkMap_devtoolsDenied';
    var IMAGE_SRC = 'img/devtools-denied.png';
    var THRESHOLD_PX = 160;
    var CHECK_MS = 800;

    var unlocked = false;
    var denied = false;
    var promptOpen = false;
    var enabled = true;
    var overlayEl = null;
    var promptEl = null;

    function isLocalHost() {
        var h = (location.hostname || '').toLowerCase();
        return h === 'localhost' || h === '127.0.0.1' || h === '::1';
    }

    function readUnlockFlags() {
        try {
            if (sessionStorage.getItem(STORAGE_KEY) === '1') unlocked = true;
            if (sessionStorage.getItem(DENIED_KEY) === '1') denied = true;
        } catch (e) {}
    }

    function setUnlocked() {
        unlocked = true;
        denied = false;
        try {
            sessionStorage.setItem(STORAGE_KEY, '1');
            sessionStorage.removeItem(DENIED_KEY);
        } catch (e) {}
        hidePrompt();
        hideDenied();
    }

    function setDenied() {
        denied = true;
        try {
            sessionStorage.setItem(DENIED_KEY, '1');
        } catch (e) {}
        hidePrompt();
        showDenied();
    }

    function isGlobalAdminSession() {
        try {
            var raw =
                sessionStorage.getItem('networkMap_session') ||
                localStorage.getItem('networkMap_session');
            if (!raw) return false;
            var s = JSON.parse(raw);
            if (!s || s.role !== 'admin') return false;
            return s.organizationId == null || s.organizationId === '';
        } catch (e) {
            return false;
        }
    }

    function apiBase() {
        if (typeof getApiBase === 'function') {
            var b = getApiBase();
            if (b) return String(b).replace(/\/$/, '');
        }
        return location.origin || '';
    }

    function isDevtoolsOpen() {
        var widthGap = Math.abs(window.outerWidth - window.innerWidth) > THRESHOLD_PX;
        var heightGap = Math.abs(window.outerHeight - window.innerHeight) > THRESHOLD_PX;
        return widthGap || heightGap;
    }

    function showDenied() {
        if (overlayEl) return;
        overlayEl = document.createElement('div');
        overlayEl.id = 'devtools-denied-overlay';
        overlayEl.setAttribute('role', 'presentation');
        overlayEl.style.cssText =
            'position:fixed;inset:0;z-index:2147483647;background:#000;' +
            'display:flex;align-items:center;justify-content:center;cursor:default;';
        var img = document.createElement('img');
        img.src = IMAGE_SRC;
        img.alt = '';
        img.draggable = false;
        img.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;user-select:none;';
        overlayEl.appendChild(img);
        overlayEl.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
        (document.body || document.documentElement).appendChild(overlayEl);
    }

    function hideDenied() {
        if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
        overlayEl = null;
    }

    function showPrompt() {
        if (promptOpen || unlocked || denied) return;
        promptOpen = true;
        promptEl = document.createElement('div');
        promptEl.id = 'devtools-guard-prompt';
        promptEl.style.cssText =
            'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.72);' +
            'display:flex;align-items:center;justify-content:center;padding:16px;';
        promptEl.innerHTML =
            '<form id="devtools-guard-form" style="width:100%;max-width:360px;background:#111827;color:#f9fafb;' +
            'border-radius:12px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.45);font-family:system-ui,sans-serif;">' +
            '<div style="font-size:1.05rem;font-weight:600;margin-bottom:8px;">Режим разработчика</div>' +
            '<div style="font-size:0.875rem;color:#9ca3af;margin-bottom:16px;">Введите логин и пароль главного администратора.</div>' +
            '<label style="display:block;font-size:0.8rem;margin-bottom:4px;">Логин</label>' +
            '<input name="username" autocomplete="username" required ' +
            'style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px 12px;border-radius:8px;' +
            'border:1px solid #374151;background:#0b1220;color:#fff;" />' +
            '<label style="display:block;font-size:0.8rem;margin-bottom:4px;">Пароль</label>' +
            '<input name="password" type="password" autocomplete="current-password" required ' +
            'style="width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px 12px;border-radius:8px;' +
            'border:1px solid #374151;background:#0b1220;color:#fff;" />' +
            '<div id="devtools-guard-error" style="display:none;color:#f87171;font-size:0.85rem;margin-bottom:12px;"></div>' +
            '<button type="submit" style="width:100%;padding:10px 14px;border:0;border-radius:8px;' +
            'background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Разблокировать</button>' +
            '</form>';
        (document.body || document.documentElement).appendChild(promptEl);
        var form = promptEl.querySelector('#devtools-guard-form');
        var errEl = promptEl.querySelector('#devtools-guard-error');
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var user = (form.username.value || '').trim();
            var pass = form.password.value || '';
            errEl.style.display = 'none';
            verifyAdmin(user, pass).then(function (ok) {
                if (ok) setUnlocked();
                else setDenied();
            }).catch(function () {
                setDenied();
            });
        });
        setTimeout(function () {
            var input = form.querySelector('input[name="username"]');
            if (input) input.focus();
        }, 50);
    }

    function hidePrompt() {
        promptOpen = false;
        if (promptEl && promptEl.parentNode) promptEl.parentNode.removeChild(promptEl);
        promptEl = null;
    }

    function verifyAdmin(username, password) {
        var url = apiBase() + '/api/auth/devtools-unlock';
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ username: username, password: password })
        }).then(function (res) {
            return res.json().then(function (data) {
                return !!(res.ok && data && data.success);
            }).catch(function () {
                return false;
            });
        });
    }

    function challenge() {
        if (!enabled || unlocked || denied) return;
        if (isGlobalAdminSession()) {
            setUnlocked();
            return;
        }
        showPrompt();
    }

    function onDevtoolsAttempt(e) {
        if (!enabled || unlocked) return;
        if (denied) {
            if (e) e.preventDefault();
            showDenied();
            return;
        }
        if (e) e.preventDefault();
        challenge();
    }

    function onKeyDown(e) {
        if (!enabled || unlocked) return;
        var key = e.key || '';
        var ctrl = e.ctrlKey || e.metaKey;
        var shift = e.shiftKey;
        var isF12 = key === 'F12';
        var isI = ctrl && shift && (key === 'I' || key === 'i');
        var isJ = ctrl && shift && (key === 'J' || key === 'j');
        var isC = ctrl && shift && (key === 'C' || key === 'c');
        var isU = ctrl && (key === 'U' || key === 'u');
        if (isF12 || isI || isJ || isC || isU) {
            onDevtoolsAttempt(e);
        }
    }

    function tick() {
        if (!enabled) return;
        if (denied) {
            showDenied();
            return;
        }
        if (unlocked) return;
        if (isDevtoolsOpen()) challenge();
    }

    function bootFromConfig() {
        if (isLocalHost()) {
            enabled = false;
            return;
        }
        var base = apiBase();
        if (!base) {
            enabled = true;
            return;
        }
        fetch(base + '/api/public-config', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (cfg) {
                if (cfg && cfg.devtoolsGuard === false) enabled = false;
            })
            .catch(function () {});
    }

    function init() {
        readUnlockFlags();
        bootFromConfig();
        if (isLocalHost()) return;
        if (denied) {
            showDenied();
            return;
        }
        if (isGlobalAdminSession()) {
            setUnlocked();
            return;
        }
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('contextmenu', function (e) {
            if (!enabled || unlocked) return;
            // Не блокируем обычное меню; только если уже denied
            if (denied) e.preventDefault();
        }, true);
        setInterval(tick, CHECK_MS);
        setTimeout(tick, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
