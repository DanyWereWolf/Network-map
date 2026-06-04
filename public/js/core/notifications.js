var TOAST_HIDE_MS = 100;
var TOAST_DEFAULT_MS = 1500;
var TOAST_MAX_STACK = 2;

function dismissToastElement(toast) {
    if (!toast || !toast.parentElement || toast.classList.contains('toast-hiding')) return;
    toast.classList.add('toast-hiding');
    setTimeout(function() { toast.remove(); }, TOAST_HIDE_MS);
}

function trimToastStack(container) {
    var stack = container.querySelectorAll('.toast:not(.toast-hiding)');
    for (var i = 0; i < stack.length - TOAST_MAX_STACK; i++) {
        dismissToastElement(stack[i]);
    }
}

function showToast(message, type, title, duration) {
    type = type || 'info';
    duration = duration !== undefined ? duration : TOAST_DEFAULT_MS;
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
    trimToastStack(container);

    var hideTimer = null;
    function scheduleAutoHide() {
        hideTimer = setTimeout(function() {
            hideTimer = null;
            dismissToastElement(toast);
        }, duration);
    }
    function closeToast() {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        dismissToastElement(toast);
    }
    scheduleAutoHide();
    toast.querySelector('.toast-close').addEventListener('click', closeToast);
}

function showSuccess(message, title) { showToast(message, 'success', title || null); }
function showError(message, title) { showToast(message, 'error', title || null, 2400); }
function showWarning(message, title) { showToast(message, 'warning', title || null, 2000); }
function showInfo(message, title) { showToast(message, 'info', title || null); }
