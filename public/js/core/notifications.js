var TOAST_HIDE_MS = 180;
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

function getToastAvatarEmotion(type) {
    if (type === 'success') return 'thumbs';
    if (type === 'error') return 'panic';
    if (type === 'warning') return 'surprise';
    return 'think';
}

function getToastAvatarHtml(emotion) {
    if (window.AssistantAvatars && typeof AssistantAvatars.imgHtml === 'function') {
        return AssistantAvatars.imgHtml(emotion, 'toast-avatar');
    }
    var file = 'vola-' + emotion + '.png';
    return '<img class="toast-avatar" src="icons/assistant/' + file + '" alt="" aria-hidden="true" decoding="async">';
}

function getToastCloseHtml() {
    return '<svg viewBox="0 0 14 14" fill="none" aria-hidden="true" focusable="false">' +
        '<path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '</svg>';
}

function showToast(message, type, title, duration, allowHtml, emotion) {
    type = type || 'info';
    duration = duration !== undefined ? duration : TOAST_DEFAULT_MS;
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const msg = (message == null || message === '') ? 'Произошла ошибка' : String(message);
    const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Внимание', info: 'Информация' };
    const titleText = title || titles[type] || titles.info;
    var avatarEmotion = emotion || getToastAvatarEmotion(type);
    var durationMs = Math.max(0, Number(duration) || 0);

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
    toast.style.setProperty('--toast-duration', durationMs + 'ms');
    toast.innerHTML = '<div class="toast-icon toast-icon--avatar">' + getToastAvatarHtml(avatarEmotion) + '</div>' +
        '<div class="toast-content">' +
        '<div class="toast-title"></div>' +
        '<div class="toast-message"></div>' +
        '</div>' +
        '<button class="toast-close" type="button" aria-label="Закрыть">' + getToastCloseHtml() + '</button>' +
        (durationMs > 0
            ? '<div class="toast-progress" aria-hidden="true"><span class="toast-progress-bar"></span></div>'
            : '');
    toast.querySelector('.toast-title').textContent = titleText;
    var msgEl = toast.querySelector('.toast-message');
    if (allowHtml) msgEl.innerHTML = msg;
    else msgEl.textContent = msg;
    container.appendChild(toast);
    trimToastStack(container);

    var hideTimer = null;
    var remaining = durationMs;
    var startedAt = 0;

    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    function scheduleAutoHide(ms) {
        clearHideTimer();
        if (ms <= 0) return;
        startedAt = Date.now();
        hideTimer = setTimeout(function() {
            hideTimer = null;
            dismissToastElement(toast);
        }, ms);
    }

    function pauseAutoHide() {
        if (!hideTimer || remaining <= 0) return;
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
        clearHideTimer();
        toast.classList.add('is-paused');
    }

    function resumeAutoHide() {
        if (remaining <= 0 || toast.classList.contains('toast-hiding')) return;
        toast.classList.remove('is-paused');
        scheduleAutoHide(remaining);
    }

    function closeToast() {
        clearHideTimer();
        dismissToastElement(toast);
    }

    if (durationMs > 0) {
        scheduleAutoHide(remaining);
        toast.addEventListener('mouseenter', pauseAutoHide);
        toast.addEventListener('mouseleave', resumeAutoHide);
        toast.addEventListener('focusin', pauseAutoHide);
        toast.addEventListener('focusout', function(e) {
            if (!toast.contains(e.relatedTarget)) resumeAutoHide();
        });
    }
    toast.querySelector('.toast-close').addEventListener('click', closeToast);
}

function showSuccess(message, title) { showToast(message, 'success', title || null); }
function showError(message, title) { showToast(message, 'error', title || null, 2400); }
function showWarning(message, title, allowHtml, emotion) {
    showToast(message, 'warning', title || null, allowHtml ? 12000 : 2000, !!allowHtml, emotion || null);
}
function showInfo(message, title) { showToast(message, 'info', title || null); }
