/**
 * Модальное окно подтверждения (замена confirm).
 */
(function() {
    var modal = null;
    var resolveFn = null;
    var escapeHandler = null;
    var activeOptions = null;
    var bound = false;
    var blockEscapeCaptureHandler = null;

    function isEscapeBlockActive() {
        return isConfirmOpen() && activeOptions && activeOptions.closeOnEscape === false;
    }

    function attachEscapeBlock() {
        if (blockEscapeCaptureHandler) return;
        blockEscapeCaptureHandler = function(e) {
            if (e.key !== 'Escape' && e.key !== 'Esc') return;
            if (!isEscapeBlockActive()) return;
            e.preventDefault();
            e.stopImmediatePropagation();
        };
        document.addEventListener('keydown', blockEscapeCaptureHandler, true);
    }

    function detachEscapeBlock() {
        if (!blockEscapeCaptureHandler) return;
        document.removeEventListener('keydown', blockEscapeCaptureHandler, true);
        blockEscapeCaptureHandler = null;
    }

    function getModal() {
        if (modal) return modal;
        modal = document.getElementById('confirmModal');
        if (!modal) return null;
        if (!bound) {
            bound = true;
            var cancelBtn = document.getElementById('confirmModalCancel');
            var confirmBtn = document.getElementById('confirmModalConfirm');
            var closeBtn = document.querySelector('.close-confirm-modal');
            if (cancelBtn) cancelBtn.addEventListener('click', function() { hide(true); });
            if (confirmBtn) confirmBtn.addEventListener('click', function() { hide(false); });
            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    if (activeOptions && activeOptions.allowCloseButton === false) return;
                    hide(true);
                });
            }
            modal.addEventListener('click', function(e) {
                if (e.target !== modal) return;
                if (activeOptions && activeOptions.closeOnBackdrop === false) return;
                hide(true);
            });
        }
        return modal;
    }

    function isConfirmOpen() {
        var m = getModal();
        return !!(m && m.style.display && m.style.display !== 'none');
    }

    function hide(cancelled) {
        detachEscapeBlock();
        if (escapeHandler) {
            document.removeEventListener('keydown', escapeHandler);
            escapeHandler = null;
        }
        var m = getModal();
        if (m) {
            m.style.display = 'none';
            m.classList.remove('confirm-modal--open');
        }
        activeOptions = null;
        if (resolveFn) {
            var r = resolveFn;
            resolveFn = null;
            r(!cancelled);
        }
    }

    function showConfirm(message, title, options) {
        options = options || {};
        if (isConfirmOpen()) {
            return Promise.resolve(false);
        }
        var m = getModal();
        if (!m) return Promise.resolve(false);

        activeOptions = options;
        var titleEl = document.getElementById('confirmModalTitle');
        var msgEl = document.getElementById('confirmModalMessage');
        var confirmBtn = document.getElementById('confirmModalConfirm');
        var cancelBtn = document.getElementById('confirmModalCancel');
        var closeBtn = document.querySelector('.close-confirm-modal');

        if (titleEl) titleEl.textContent = title || 'Подтверждение';
        if (msgEl) msgEl.textContent = message || 'Продолжить?';
        if (confirmBtn) confirmBtn.textContent = options.confirmText || 'Удалить';
        if (cancelBtn) cancelBtn.textContent = options.cancelText || 'Отмена';
        if (closeBtn) {
            closeBtn.style.display = options.allowCloseButton === false ? 'none' : '';
        }

        m.style.display = 'block';
        m.classList.add('confirm-modal--open');

        var closeOnEscape = options.closeOnEscape !== false;
        if (closeOnEscape) {
            escapeHandler = function(e) {
                if (e.key === 'Escape') hide(true);
            };
            document.addEventListener('keydown', escapeHandler);
        } else {
            attachEscapeBlock();
        }

        return new Promise(function(resolve) {
            resolveFn = resolve;
        });
    }

    window.showConfirm = showConfirm;
    window.isConfirmModalOpen = isConfirmOpen;
    window.isConfirmModalBlockingEscape = isEscapeBlockActive;
    window.cancelConfirmModal = function() {
        if (isConfirmOpen()) hide(true);
    };
})();
