/**
 * Система уведомлений (toast)
 */
function showToast(message, type, title, duration) {
    type = type || 'info';
    duration = duration !== undefined ? duration : 4000;
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Информация' };

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML = '<div class="toast-icon">' + (icons[type] || icons.info) + '</div>' +
        '<div class="toast-content">' +
        '<div class="toast-title">' + (title || titles[type] || titles.info) + '</div>' +
        '<div class="toast-message">' + message + '</div>' +
        '</div>' +
        '<button class="toast-close" onclick="this.parentElement.remove()">✕</button>';
    container.appendChild(toast);

    setTimeout(function() {
        toast.classList.add('toast-hiding');
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

function showSuccess(message, title) { showToast(message, 'success', title || null); }
function showError(message, title) { showToast(message, 'error', title || null, 6000); }
function showWarning(message, title) { showToast(message, 'warning', title || null, 5000); }
function showInfo(message, title) { showToast(message, 'info', title || null); }
