document.addEventListener('DOMContentLoaded', function() {
    bindCableDeleteDelegation();

    if (!checkAuth()) return;

    if (typeof loadAppScripts === 'function') {
        var coreScripts = window.MAP_CORE_DEFERRED_SCRIPTS || ['js/catalog/device-catalog.js', 'js/history.js', 'js/ui/object-gallery.js'];
        var uiScripts = window.MAP_UI_DEFERRED_SCRIPTS || ['js/ui/help.js', 'js/ui/camera-player.js'];
        window._mapScriptsReadyPromise = loadAppScripts(coreScripts).catch(function() {});
        window._uiExtrasPromise = window._mapScriptsReadyPromise
            .then(function() { return loadAppScripts(uiScripts); })
            .catch(function() {});
    }

    startMapLoadSafetyTimeout();

    initUserUI();
    initWelcomeModal();
    resumeOnboardingTourIfNeeded();
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var wm = document.getElementById('welcomeModal');
        if (!wm || wm.style.display === 'none') return;
        closeWelcomeModal();
        e.preventDefault();
    });

    if (currentUser && currentUser.role === 'user') {
        try {
            if (!localStorage.getItem('networkMap_viewModeHintShown')) {
                localStorage.setItem('networkMap_viewModeHintShown', '1');
                if (typeof showInfo === 'function') showInfo('Включён режим просмотра. Редактирование карты доступно только администраторам.', 'Режим просмотра');
            }
        } catch (e) {}
    }

    function whenYmapsReady(cb) {
        function runCb() {
            if (window._mapScriptsReadyPromise) {
                window._mapScriptsReadyPromise.then(cb).catch(function() { cb(); });
            } else {
                cb();
            }
        }
        if (window.ymaps) { window.ymaps.ready(runCb); return; }
        var attempts = 0;
        var maxAttempts = 600;
        var t = setInterval(function() {
            attempts++;
            if (window.ymaps) {
                clearInterval(t);
                window.ymaps.ready(runCb);
            } else if (attempts >= maxAttempts) {
                clearInterval(t);
                if (typeof markMapDataReady === 'function') markMapDataReady();
                if (typeof markMapTilesReady === 'function') markMapTilesReady();
            }
        }, 50);
    }
    whenYmapsReady(init);
    refreshMapLimitsFromServer();

    (async function() {
        await new Promise(function(r) { setTimeout(r, 1500); });
        const result = await checkForUpdates(true);
        lastUpdateCheckResult = result;
        var updatesModal = document.getElementById('updatesModal');
        if (updatesModal && updatesModal.style.display === 'block') {
            renderUpdatesModalContent(result);
        }
    })();
});

setTimeout(function() {
    updateUIForMode();
    updateEditControls();
    updateStats();
    updateCableVisualization();
    scheduleConnectionLinesUpdate();
}, 100);
