document.addEventListener('DOMContentLoaded', function() {
    var boot = (window.VolsmapEmbed && typeof VolsmapEmbed.bootstrapAuth === 'function')
        ? VolsmapEmbed.bootstrapAuth()
        : Promise.resolve(true);

    boot.then(function(ok) {
        if (ok === false) return;
        startMapApp();
    }).catch(function() {
        startMapApp();
    });
});

function startMapApp() {
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

    initUserUI();
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
                if (!(window.VolsmapEmbed && VolsmapEmbed.isEmbed && VolsmapEmbed.isEmbed()) && typeof showInfo === 'function') {
                    showInfo('Включён режим просмотра. Редактирование карты доступно только администраторам.', 'Режим просмотра');
                }
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
        if (typeof MapEngine !== 'undefined' && MapEngine.whenReady) {
            MapEngine.whenReady(runCb);
            return;
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

    function proceedWithMapInit() {
        if (typeof setMapLoadingOverlayText === 'function') {
            setMapLoadingOverlayText('Загрузка карты…');
        }
        // Не сбрасываем entrance-таймер: иначе после выбора региона снова ждём min MS.
        startMapLoadSafetyTimeout();
        whenYmapsReady(init);
    }

    // Регион — до создания карты и загрузки объектов (пикер поверх экрана входа).
    var chooseRegion = (typeof chooseMapRegionBeforeLoad === 'function')
        ? chooseMapRegionBeforeLoad()
        : Promise.resolve(window.currentMapRegionId || null);

    if (typeof setMapLoadingOverlayText === 'function') {
        setMapLoadingOverlayText('Выбор региона…');
    }

    chooseRegion.then(function(regionId) {
        if (!regionId) {
            if (typeof setMapLoadingOverlayText === 'function') {
                setMapLoadingOverlayText('Регион не выбран');
            }
            if (typeof showError === 'function') {
                showError('Не удалось выбрать регион карты. Обновите страницу или войдите снова.', 'Регион');
            }
            if (typeof markMapDataReady === 'function') markMapDataReady();
            if (typeof markMapTilesReady === 'function') markMapTilesReady();
            return;
        }
        if (typeof setCurrentMapRegionId === 'function') setCurrentMapRegionId(regionId);
        else window.currentMapRegionId = String(regionId);
        proceedWithMapInit();
    }).catch(function(err) {
        var msg = (err && err.message) ? String(err.message) : 'Не удалось получить список регионов';
        if (typeof setMapLoadingOverlayText === 'function') {
            setMapLoadingOverlayText('Ошибка загрузки');
        }
        // Без токена/регионов карту не поднимаем — иначе пустой «Готово».
        if (!getAuthToken()) {
            try { window.location.href = 'auth.html'; } catch (eLoc) {}
            return;
        }
        if (typeof showError === 'function') showError(msg, 'Регион');
        if (typeof markMapDataReady === 'function') markMapDataReady();
        if (typeof markMapTilesReady === 'function') markMapTilesReady();
    });

    refreshMapLimitsFromServer();
}

// ===== ЭКСПОРТЫ ДЛЯ OPTICAL-CALCULATOR.JS =====
if (typeof getOtherEndOfCable === 'function') window.getOtherEndOfCable = getOtherEndOfCable;
if (typeof traceFiberPathFromObject === 'function') window.traceFiberPathFromObject = traceFiberPathFromObject;
if (typeof traceFromOLTPort === 'function') window.traceFromOLTPort = traceFromOLTPort;
if (typeof deleteObject === 'function') window.deleteObject = deleteObject;
if (typeof createCableFromPoints === 'function') window.createCableFromPoints = createCableFromPoints;
if (typeof findObjectAtCoords === 'function') window.findObjectAtCoords = findObjectAtCoords;

setTimeout(function() {
    updateUIForMode();
    updateEditControls();
    updateStats();
    updateCableVisualization();
    scheduleConnectionLinesUpdate();
}, 100);
