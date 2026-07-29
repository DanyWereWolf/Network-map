/**
 * LoFi Radio dock (edge tab + popover), stream via /api/lofi-radio/lofi.
 */
(function () {
    var STORAGE_KEY = 'networkMap_lofiRadio';
    var STATION = {
        name: 'LoFi Radio',
        url: '/api/lofi-radio/lofi',
        fallback: 'https://live.lofiradio.ru/lofi_mp3_128'
    };

    var card, audio, playBtn, pauseBtn, statusEl, volumeEl, dockBtn, popover, enabledToggle;
    var wantedPlaying = false;
    var usingFallback = false;
    var prefs = { volume: 35, enabled: true };

    function loadPrefs() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            if (typeof parsed.volume === 'number' && !isNaN(parsed.volume)) {
                prefs.volume = Math.max(0, Math.min(100, Math.round(parsed.volume)));
            }
            if (parsed.enabled === false || parsed.enabled === 0 || parsed.enabled === '0') {
                prefs.enabled = false;
            } else if (parsed.enabled === true || parsed.enabled === 1 || parsed.enabled === '1') {
                prefs.enabled = true;
            }
        } catch (e) {}
    }

    function savePrefs() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                volume: prefs.volume,
                enabled: !!prefs.enabled
            }));
        } catch (e) {}
    }

    function isEnabled() {
        return prefs.enabled !== false;
    }

    function setStatus(text) {
        if (statusEl) statusEl.textContent = text;
        if (dockBtn && text) dockBtn.title = 'Lo-fi: ' + text;
    }

    function setPlayingUi(playing) {
        if (!card || !playBtn || !pauseBtn) return;
        card.classList.toggle('is-playing', !!playing);
        playBtn.disabled = !!playing;
        pauseBtn.disabled = !playing;
        playBtn.setAttribute('aria-label', playing ? 'Уже играет' : 'Включить lo-fi радио');
        playBtn.setAttribute('title', playing ? 'Играет' : 'Включить');
        pauseBtn.setAttribute('aria-label', playing ? 'Пауза lo-fi радио' : 'Пауза недоступна');
        pauseBtn.setAttribute('title', playing ? 'Пауза' : 'Пауза');
    }

    var popoverCloseTimer = null;

    function setPopoverOpen(open) {
        if (!card || !dockBtn || !popover) return;
        if (popoverCloseTimer) {
            clearTimeout(popoverCloseTimer);
            popoverCloseTimer = null;
        }
        dockBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            popover.hidden = false;
            popover.setAttribute('aria-hidden', 'false');
            void popover.offsetWidth;
            card.classList.add('is-open');
            return;
        }
        card.classList.remove('is-open');
        popover.setAttribute('aria-hidden', 'true');
        popoverCloseTimer = setTimeout(function () {
            if (!card.classList.contains('is-open')) popover.hidden = true;
            popoverCloseTimer = null;
        }, 280);
    }

    function applyVolume() {
        if (!audio) return;
        audio.volume = prefs.volume / 100;
        if (volumeEl) volumeEl.value = String(prefs.volume);
    }

    function applyEnabledUi() {
        var on = isEnabled();
        if (card) {
            card.classList.toggle('is-disabled', !on);
            card.hidden = !on;
            card.setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        if (enabledToggle && enabledToggle.checked !== on) {
            enabledToggle.checked = on;
        }
        if (!on) {
            setPopoverOpen(false);
            pause();
        }
    }

    function setEnabled(enabled) {
        prefs.enabled = !!enabled;
        savePrefs();
        applyEnabledUi();
        return prefs.enabled;
    }

    function streamUrl(useFallback) {
        return useFallback ? STATION.fallback : STATION.url;
    }

    function bindStream(useFallback) {
        usingFallback = !!useFallback;
        var url = streamUrl(usingFallback);
        audio.removeAttribute('src');
        audio.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
        try { audio.load(); } catch (eLoad) {}
    }

    function play() {
        if (!audio || !isEnabled()) return;
        wantedPlaying = true;
        setPlayingUi(true);
        setStatus('Подключение…');
        var p = audio.play();
        if (p && typeof p.then === 'function') {
            p.then(function () {
                setPlayingUi(true);
                setStatus('Играет');
            }).catch(function (err) {
                var name = err && err.name ? String(err.name) : '';
                if (name === 'NotAllowedError') {
                    setPlayingUi(false);
                    setStatus('Разрешите звук');
                    wantedPlaying = false;
                    return;
                }
                if (!usingFallback) {
                    setStatus('Прямой поток…');
                    bindStream(true);
                    var p2 = audio.play();
                    if (p2 && typeof p2.then === 'function') {
                        p2.then(function () {
                            setPlayingUi(true);
                            setStatus('Играет');
                        }).catch(function () {
                            wantedPlaying = false;
                            setPlayingUi(false);
                            setStatus('Недоступно');
                        });
                    }
                    return;
                }
                wantedPlaying = false;
                setPlayingUi(false);
                setStatus('Недоступно');
            });
        }
    }

    function pause() {
        wantedPlaying = false;
        if (audio) {
            try { audio.pause(); } catch (ePause) {}
            try {
                audio.removeAttribute('src');
                audio.load();
            } catch (eClear) {}
        }
        setPlayingUi(false);
        setStatus('Выкл.');
    }

    function startPlay() {
        if (!audio || !isEnabled() || wantedPlaying) return;
        usingFallback = false;
        bindStream(false);
        play();
    }

    function initEnabledToggle() {
        enabledToggle = document.getElementById('lofiRadioEnabledToggle');
        if (!enabledToggle) return;
        enabledToggle.checked = isEnabled();
        // В настройках производительности переключатель биндится отдельно.
        if (document.getElementById('perfModeAuto')) return;
        if (enabledToggle.dataset.bound === '1') return;
        enabledToggle.dataset.bound = '1';
        enabledToggle.addEventListener('change', function () {
            setEnabled(enabledToggle.checked);
        });
    }

    function init() {
        card = document.getElementById('lofiRadioCard');
        audio = document.getElementById('lofiRadioAudio');
        playBtn = document.getElementById('lofiRadioPlayBtn');
        pauseBtn = document.getElementById('lofiRadioPauseBtn');
        statusEl = document.getElementById('lofiRadioStatus');
        volumeEl = document.getElementById('lofiRadioVolume');
        dockBtn = document.getElementById('lofiRadioDockBtn');
        popover = document.getElementById('lofiRadioPopover');
        if (!card || !audio || !playBtn || !pauseBtn || !dockBtn || !popover) return;

        audio.removeAttribute('crossorigin');

        loadPrefs();
        applyVolume();
        setStatus('Выкл.');
        setPlayingUi(false);
        setPopoverOpen(false);
        initEnabledToggle();
        applyEnabledUi();

        dockBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!isEnabled()) return;
            setPopoverOpen(!card.classList.contains('is-open'));
        });

        playBtn.addEventListener('click', function (e) {
            e.preventDefault();
            startPlay();
        });

        pauseBtn.addEventListener('click', function (e) {
            e.preventDefault();
            pause();
        });

        if (volumeEl) {
            volumeEl.addEventListener('input', function () {
                prefs.volume = Math.max(0, Math.min(100, parseInt(volumeEl.value, 10) || 0));
                applyVolume();
            });
            volumeEl.addEventListener('change', savePrefs);
        }

        document.addEventListener('click', function (e) {
            if (!card.classList.contains('is-open')) return;
            if (card.contains(e.target)) return;
            setPopoverOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && card.classList.contains('is-open')) {
                setPopoverOpen(false);
            }
        });

        audio.addEventListener('playing', function () {
            setPlayingUi(true);
            setStatus('Играет');
        });
        audio.addEventListener('pause', function () {
            if (!wantedPlaying) {
                setPlayingUi(false);
                setStatus('Выкл.');
            }
        });
        audio.addEventListener('waiting', function () {
            if (wantedPlaying) setStatus('Буфер…');
        });
        audio.addEventListener('stalled', function () {
            if (wantedPlaying) setStatus('Буфер…');
        });
        audio.addEventListener('error', function () {
            if (!wantedPlaying) return;
            if (!usingFallback) {
                setStatus('Прямой поток…');
                bindStream(true);
                play();
                return;
            }
            setPlayingUi(false);
            wantedPlaying = false;
            setStatus('Недоступно');
        });
    }

    window.setLofiRadioEnabled = setEnabled;
    window.isLofiRadioEnabled = isEnabled;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
