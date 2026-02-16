/**
 * Система уведомлений (toast)
 */
function showToast(message, type, title, duration) {
    type = type || 'info';
    duration = duration !== undefined ? duration : 4000;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const msg = (message == null || message === '') ? 'Произошла ошибка' : String(message);
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Информация' };
    const titleText = title || titles[type] || titles.info;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<div class="toast-icon">' + (icons[type] || icons.info) + '</div>' +
        '<div class="toast-content">' +
        '<div class="toast-title"></div>' +
        '<div class="toast-message"></div>' +
        '</div>' +
        '<button class="toast-close" type="button" aria-label="Закрыть">✕</button>';
    toast.querySelector('.toast-title').textContent = titleText;
    toast.querySelector('.toast-message').textContent = msg;
    container.appendChild(toast);

    var hideTimer = null;
    var removeTimer = null;
    function scheduleAutoHide() {
        hideTimer = setTimeout(function() {
            hideTimer = null;
            toast.classList.add('toast-hiding');
            removeTimer = setTimeout(function() {
                removeTimer = null;
                toast.remove();
            }, 300);
        }, duration);
    }
    function closeToast() {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
        if (toast.parentElement) {
            toast.classList.add('toast-hiding');
            setTimeout(function() { toast.remove(); }, 300);
        }
    }
    scheduleAutoHide();
    toast.querySelector('.toast-close').addEventListener('click', closeToast);
}

function showSuccess(message, title) { showToast(message, 'success', title || null); }
function showError(message, title) { showToast(message, 'error', title || null, 6000); }
function showWarning(message, title) { showToast(message, 'warning', title || null, 5000); }
function showInfo(message, title) { showToast(message, 'info', title || null); }
