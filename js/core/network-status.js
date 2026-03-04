/**
 * Показ ошибки сети и кнопка «Повторить».
 */
(function() {
    var banner = null;
    var retryBtn = null;
    var textEl = null;
    var onRetryCallback = null;
    function getBanner() {
        if (banner) return banner;
        banner = document.getElementById('networkErrorBanner');
        if (!banner) return null;
        textEl = document.getElementById('networkErrorText');
        retryBtn = document.getElementById('networkErrorRetry');
        if (retryBtn) {
            retryBtn.addEventListener('click', function() {
                if (typeof onRetryCallback === 'function') onRetryCallback();
                else if (typeof window.syncConnect === 'function') window.syncConnect();
            });
        }
        return banner;
    }
    function showNetworkError(message, onRetry) {
        var b = getBanner();
        if (!b) return;
        if (textEl) textEl.textContent = message || 'Нет связи с сервером';
        onRetryCallback = onRetry || null;
        b.style.display = 'flex';
    }
    function hideNetworkError() {
        var b = getBanner();
        if (b) b.style.display = 'none';
    }
    window.showNetworkError = showNetworkError;
    window.hideNetworkError = hideNetworkError;
})();
