/**
 * Модальное окно подтверждения (замена confirm).
 */
(function() {
    var modal = null;
    var resolveFn = null;
    var escapeHandler = null;
    function getModal() {
        if (modal) return modal;
        modal = document.getElementById('confirmModal');
        if (!modal) return null;
        var cancelBtn = document.getElementById('confirmModalCancel');
        var confirmBtn = document.getElementById('confirmModalConfirm');
        var closeBtn = document.querySelector('.close-confirm-modal');
        if (cancelBtn) cancelBtn.addEventListener('click', function() { hide(true); });
        if (confirmBtn) confirmBtn.addEventListener('click', function() { hide(false); });
        if (closeBtn) closeBtn.addEventListener('click', function() { hide(true); });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) hide(true);
        });
        return modal;
    }
    function hide(cancelled) {
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
        var m = getModal();
        if (m) m.style.display = 'none';
        if (resolveFn) {
            var r = resolveFn;
            resolveFn = null;
            r(!cancelled);
        }
    }
    function showConfirm(message, title, options) {
        options = options || {};
        var m = getModal();
        if (!m) return Promise.resolve(false);
        var titleEl = document.getElementById('confirmModalTitle');
        var msgEl = document.getElementById('confirmModalMessage');
        var confirmBtn = document.getElementById('confirmModalConfirm');
        if (titleEl) titleEl.textContent = title || 'Подтверждение';
        if (msgEl) msgEl.textContent = message || 'Продолжить?';
        if (confirmBtn) confirmBtn.textContent = options.confirmText || 'Удалить';
        m.style.display = 'block';
        escapeHandler = function(e) {
            if (e.key === 'Escape') hide(true);
        };
        document.addEventListener('keydown', escapeHandler);
        return new Promise(function(resolve) {
            resolveFn = function(ok) { resolve(ok); };
        });
    }
    window.showConfirm = showConfirm;
})();
