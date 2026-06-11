(function (global) {
    var loaded = Object.create(null);
    var loading = Object.create(null);

    function loadAppScript(src) {
        if (loaded[src]) return Promise.resolve();
        if (loading[src]) return loading[src];
        loading[src] = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () {
                loaded[src] = true;
                delete loading[src];
                resolve();
            };
            s.onerror = function () {
                delete loading[src];
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(s);
        });
        return loading[src];
    }

    function loadAppScripts(urls) {
        if (!urls || !urls.length) return Promise.resolve();
        return Promise.all(urls.map(loadAppScript));
    }

    global.loadAppScript = loadAppScript;
    global.loadAppScripts = loadAppScripts;

    global.MAP_CORE_DEFERRED_SCRIPTS = [
        'js/catalog/device-catalog.js',
        'js/history.js',
        'js/ui/object-gallery.js'
    ];
    global.MAP_UI_DEFERRED_SCRIPTS = [
        'js/ui/help.js',
        'js/ui/camera-player.js'
    ];
    global.MAP_BACKGROUND_SCRIPTS = [
        'js/org-chat.js',
        'js/core/cookie-consent.js',
        'js/core/maintenance-notice.js',
        'js/core/page-bg-plexus.js',
        'js/ui/modal-glass.js'
    ];
})(typeof window !== 'undefined' ? window : this);
