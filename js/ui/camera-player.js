/**
 * Просмотр и настройка видеопотока камеры (HLS, HTTP, MJPEG, iframe, RTSP).
 */
(function (global) {
    var STREAM_TYPES = [
        { id: 'none', label: 'Без видео' },
        { id: 'hls', label: 'HLS (.m3u8)' },
        { id: 'http', label: 'HTTP (MP4 / WebM)' },
        { id: 'mjpeg', label: 'MJPEG / JPEG-поток' },
        { id: 'iframe', label: 'Страница / iframe' },
        { id: 'rtsp', label: 'RTSP (ссылка)' }
    ];

    var HLS_SCRIPT = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js';
    var hlsLoadPromise = null;
    var SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
    var SNAPSHOT_MAX_DIM = 1920;
    var SNAPSHOT_JPEG_QUALITY = 0.82;

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function normalizeStreamType(t) {
        var id = (t || 'none').toLowerCase();
        for (var i = 0; i < STREAM_TYPES.length; i++) {
            if (STREAM_TYPES[i].id === id) return id;
        }
        return 'none';
    }

    function guessStreamTypeFromUrl(url) {
        if (!url) return 'none';
        var u = url.trim();
        if (/^rtsp:/i.test(u)) return 'rtsp';
        if (/\.m3u8(\?|$)/i.test(u) || /\/hls\//i.test(u)) return 'hls';
        if (/\.mjpe?g(\?|$)/i.test(u) || /\/video\.cgi|action=stream|\/stream/i.test(u)) return 'mjpeg';
        if (/^https?:\/\//i.test(u)) return 'http';
        return 'http';
    }

    function hasActiveStream(cfg) {
        cfg = cfg || {};
        return cfg.streamType !== 'none' && !!(cfg.streamUrl || '').trim();
    }

    function setCameraStreamLive(obj, live) {
        if (!obj || !obj.properties) return;
        var prev = obj.properties.get('streamLive');
        if (live === true) {
            if (prev === true) return;
            obj.properties.set('streamLive', true);
        } else if (live === false) {
            if (prev === false) return;
            obj.properties.set('streamLive', false);
        } else {
            if (prev === undefined || prev === null) return;
            obj.properties.unset('streamLive');
        }
        notifyCameraPresentationChanged(obj);
    }

    function isCameraOnline(obj) {
        if (!obj || !obj.properties) return false;
        if (!hasActiveStream(getCameraStreamConfig(obj))) return false;
        return obj.properties.get('streamLive') === true;
    }

    function getCameraStatusTitle(obj) {
        if (!obj || !obj.properties) return 'Офлайн — видеопоток не настроен';
        if (!hasActiveStream(getCameraStreamConfig(obj))) return 'Офлайн — видеопоток не настроен';
        if (isCameraOnline(obj)) return 'Онлайн — видеопоток доступен';
        if (obj.properties.get('streamLive') === undefined || obj.properties.get('streamLive') === null) {
            return 'Проверка потока…';
        }
        return 'Офлайн — поток недоступен';
    }

    function buildStatusBadgeHtml(isOnline, statusTitle) {
        var online = !!isOnline;
        var title = statusTitle || (online ? 'Онлайн — видеопоток доступен' : 'Офлайн — видеопоток не настроен');
        return '<span class="camera-status-badge camera-status-badge--' + (online ? 'online' : 'offline') + '" title="' + escapeHtml(title) + '">' +
            '<span class="camera-status-badge-dot" aria-hidden="true"></span>' +
            '<span class="camera-status-badge-text">' + (online ? 'Онлайн' : 'Офлайн') + '</span></span>';
    }

    function buildMapLabelHtml(displayName, isOnline, statusTitle) {
        var online = !!isOnline;
        var title = statusTitle || (online ? 'Онлайн' : 'Офлайн');
        return '<div class="map-label map-label--camera">' +
            '<span class="map-label-status map-label-status--' + (online ? 'online' : 'offline') + '" title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"></span>' +
            displayName + '</div>';
    }

    function notifyCameraPresentationChanged(obj) {
        if (typeof global.refreshCameraMapPresentation === 'function') {
            global.refreshCameraMapPresentation(obj);
        }
    }

    function getCameraSnapshot(obj) {
        if (!obj || !obj.properties) return '';
        var url = (obj.properties.get('snapshotPhoto') || '').trim();
        return isValidSnapshotDataUrl(url) ? url : '';
    }

    function isValidSnapshotDataUrl(url) {
        return /^data:image\/(jpeg|png|webp|gif);base64,/i.test(url || '');
    }

    function applyCameraSnapshot(obj, dataUrl) {
        if (!obj || !obj.properties) return;
        var url = (dataUrl || '').trim();
        if (url) {
            if (!isValidSnapshotDataUrl(url)) return;
            obj.properties.set('snapshotPhoto', url);
        } else {
            obj.properties.unset('snapshotPhoto');
        }
    }

    function getCameraStreamConfig(obj) {
        if (!obj || !obj.properties) {
            return {
                streamType: 'none',
                streamUrl: '',
                streamUser: '',
                streamPass: '',
                streamAutoplay: true,
                streamMuted: true
            };
        }
        return {
            streamType: normalizeStreamType(obj.properties.get('streamType')),
            streamUrl: (obj.properties.get('streamUrl') || '').trim(),
            streamUser: (obj.properties.get('streamUser') || '').trim(),
            streamPass: (obj.properties.get('streamPass') || '').trim(),
            streamAutoplay: obj.properties.get('streamAutoplay') !== false,
            streamMuted: obj.properties.get('streamMuted') !== false
        };
    }

    function applyCameraStreamConfig(obj, cfg) {
        if (!obj || !obj.properties || !cfg) return;
        obj.properties.set('streamType', normalizeStreamType(cfg.streamType));
        obj.properties.set('streamUrl', (cfg.streamUrl || '').trim());
        obj.properties.set('streamUser', (cfg.streamUser || '').trim());
        obj.properties.set('streamPass', (cfg.streamPass || '').trim());
        obj.properties.set('streamAutoplay', cfg.streamAutoplay !== false);
        obj.properties.set('streamMuted', cfg.streamMuted !== false);
        obj.properties.unset('streamLive');
    }

    function readStreamConfigFromForm(idPrefix) {
        idPrefix = idPrefix || 'editCamera';
        var typeEl = document.getElementById(idPrefix + 'StreamType');
        var urlEl = document.getElementById(idPrefix + 'StreamUrl');
        var userEl = document.getElementById(idPrefix + 'StreamUser');
        var passEl = document.getElementById(idPrefix + 'StreamPass');
        var autoplayEl = document.getElementById(idPrefix + 'StreamAutoplay');
        var mutedEl = document.getElementById(idPrefix + 'StreamMuted');
        var url = urlEl ? urlEl.value.trim() : '';
        var streamType = typeEl ? normalizeStreamType(typeEl.value) : 'none';
        if (streamType === 'none' && url) {
            streamType = guessStreamTypeFromUrl(url);
        }
        return {
            streamType: streamType,
            streamUrl: url,
            streamUser: userEl ? userEl.value.trim() : '',
            streamPass: passEl ? passEl.value : '',
            streamAutoplay: autoplayEl ? autoplayEl.checked : true,
            streamMuted: mutedEl ? mutedEl.checked : true
        };
    }

    function resolvePlaybackUrl(cfg) {
        var url = (cfg.streamUrl || '').trim();
        if (!url || cfg.streamType === 'none' || cfg.streamType === 'rtsp') return url;
        if (!cfg.streamUser) return url;
        try {
            var parsed = new URL(url, window.location.href);
            parsed.username = cfg.streamUser;
            parsed.password = cfg.streamPass || '';
            return parsed.href;
        } catch (e) {
            return url;
        }
    }

    function streamTypeLabel(id) {
        for (var i = 0; i < STREAM_TYPES.length; i++) {
            if (STREAM_TYPES[i].id === id) return STREAM_TYPES[i].label;
        }
        return id;
    }

    function buildStreamSettingsHtml(cfg, options) {
        options = options || {};
        var idPrefix = options.idPrefix || 'editCamera';
        var isEditMode = options.isEditMode !== false;
        var cfgSafe = cfg || getCameraStreamConfig(null);
        var obj = options.obj;

        if (!hasActiveStream(cfgSafe)) {
            if (!isEditMode) return '';
            if (obj && getCameraSnapshot(obj)) return '';
        }

        var html = '<section class="object-card-section object-card-section--stream camera-stream-settings">';
        html += '<h4 class="object-card-section-title">Видеопоток</h4>';

        if (!isEditMode) {
            if (!hasActiveStream(cfgSafe)) {
                html += '<p class="object-card-hint">Поток не настроен. Включите режим редактирования, чтобы указать адрес или загрузить снимок обзора.</p>';
            } else {
                html += '<p class="object-card-hint camera-stream-view-meta"><strong>' + escapeHtml(streamTypeLabel(cfgSafe.streamType)) + '</strong>';
                if (cfgSafe.streamUser) html += ' · авторизация задана';
                html += '</p>';
            }
            html += '</section>';
            return html;
        }

        html += '<p class="object-card-hint">HLS и HTTP работают в браузере при доступе по CORS. RTSP напрямую не воспроизводится — укажите HLS-прокси (go2rtc, Frigate) или откройте ссылку во внешнем плеере.</p>';
        html += '<div class="camera-stream-fields">';
        html += '<div class="form-group"><label for="' + idPrefix + 'StreamType" class="object-card-label">Тип потока</label>';
        html += '<select id="' + idPrefix + 'StreamType" class="form-select camera-stream-type-select">';
        STREAM_TYPES.forEach(function(st) {
            html += '<option value="' + st.id + '"' + (cfgSafe.streamType === st.id ? ' selected' : '') + '>' + escapeHtml(st.label) + '</option>';
        });
        html += '</select></div>';
        html += '<div class="form-group"><label for="' + idPrefix + 'StreamUrl" class="object-card-label">URL потока</label>';
        html += '<input type="url" id="' + idPrefix + 'StreamUrl" class="form-input" value="' + escapeHtml(cfgSafe.streamUrl) + '" placeholder="https://…/stream.m3u8 или rtsp://…">';
        html += '</div>';
        html += '<div class="camera-stream-auth-grid">';
        html += '<div class="form-group"><label for="' + idPrefix + 'StreamUser" class="object-card-label">Логин</label>';
        html += '<input type="text" id="' + idPrefix + 'StreamUser" class="form-input" value="' + escapeHtml(cfgSafe.streamUser) + '" placeholder="Необязательно" autocomplete="off">';
        html += '</div>';
        html += '<div class="form-group"><label for="' + idPrefix + 'StreamPass" class="object-card-label">Пароль</label>';
        html += '<input type="password" id="' + idPrefix + 'StreamPass" class="form-input" value="' + escapeHtml(cfgSafe.streamPass) + '" placeholder="Необязательно" autocomplete="new-password">';
        html += '</div></div>';
        html += '<div class="camera-stream-toggles">';
        html += '<label class="camera-stream-toggle"><input type="checkbox" id="' + idPrefix + 'StreamAutoplay"' + (cfgSafe.streamAutoplay ? ' checked' : '') + '> Автовоспроизведение</label>';
        html += '<label class="camera-stream-toggle"><input type="checkbox" id="' + idPrefix + 'StreamMuted"' + (cfgSafe.streamMuted ? ' checked' : '') + '> Без звука</label>';
        html += '</div>';
        html += '<div class="camera-stream-actions">';
        html += '<button type="button" class="btn-secondary btn-camera-stream-detect">Определить тип по URL</button>';
        html += '<button type="button" class="btn-primary btn-camera-stream-apply">Применить и обновить просмотр</button>';
        html += '</div></div></section>';
        return html;
    }

    function buildSnapshotPreviewInner(snapshot, emptyText) {
        if (snapshot) {
            return '<img src="' + snapshot + '" alt="Снимок обзора камеры" class="camera-snapshot-img">';
        }
        return '<div class="camera-snapshot-empty">' + escapeHtml(emptyText || 'Снимок не загружен') + '</div>';
    }

    function buildSnapshotSectionHtml(obj, options) {
        options = options || {};
        var isEditMode = options.isEditMode !== false;
        var cfg = getCameraStreamConfig(obj);
        var hasStream = hasActiveStream(cfg);
        if (!isEditMode && hasStream) return '';
        var snapshot = getCameraSnapshot(obj);
        var isFallback = isEditMode && hasStream;

        var html = '<section class="object-card-section object-card-section--snapshot camera-snapshot-section' +
            (isFallback ? ' camera-snapshot-section--fallback' : '') + '">';
        html += '<h4 class="object-card-section-title">' + (isFallback ? 'Запасной снимок' : 'Обзор камеры') + '</h4>';

        if (!isEditMode) {
            if (snapshot) {
                html += '<div class="camera-snapshot-view">' + buildSnapshotPreviewInner(snapshot) + '</div>';
            } else {
                html += '<p class="object-card-hint">Снимок не загружен. В режиме редактирования можно добавить фото — куда смотрит камера.</p>';
            }
            html += '</section>';
            return html;
        }

        if (isFallback) {
            html += '<p class="object-card-hint">Показывается, если видеопоток недоступен. Загрузите фото — куда смотрит камера.</p>';
        } else {
            html += '<p class="object-card-hint">Без видеопотока загрузите фото, чтобы было понятно, куда смотрит камера.</p>';
        }
        html += '<div class="camera-snapshot-preview" data-camera-snapshot-preview>';
        html += buildSnapshotPreviewInner(snapshot, 'Выберите изображение');
        html += '</div>';
        html += '<input type="file" id="editCameraSnapshotInput" class="camera-snapshot-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden>';
        html += '<div class="camera-snapshot-actions">';
        html += '<button type="button" class="btn-secondary btn-camera-snapshot-upload">Загрузить фото</button>';
        html += '<button type="button" class="btn-secondary btn-camera-snapshot-remove"' + (snapshot ? '' : ' hidden') + '>Удалить</button>';
        html += '</div></section>';
        return html;
    }

    function resizeImageToDataUrl(dataUrl) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() {
                var w = img.naturalWidth;
                var h = img.naturalHeight;
                if (!w || !h) {
                    reject(new Error('Пустое изображение'));
                    return;
                }
                var scale = 1;
                if (w > SNAPSHOT_MAX_DIM || h > SNAPSHOT_MAX_DIM) {
                    scale = SNAPSHOT_MAX_DIM / Math.max(w, h);
                }
                var cw = Math.max(1, Math.round(w * scale));
                var ch = Math.max(1, Math.round(h * scale));
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, cw, ch);
                resolve(canvas.toDataURL('image/jpeg', SNAPSHOT_JPEG_QUALITY));
            };
            img.onerror = function() { reject(new Error('Не удалось прочитать изображение')); };
            img.src = dataUrl;
        });
    }

    function processSnapshotFile(file) {
        if (!file || !/^image\//i.test(file.type)) {
            return Promise.reject(new Error('Выберите файл изображения (JPEG, PNG, WebP)'));
        }
        if (file.size > SNAPSHOT_MAX_BYTES) {
            return Promise.reject(new Error('Файл больше 2 МБ'));
        }
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                resizeImageToDataUrl(reader.result).then(resolve).catch(reject);
            };
            reader.onerror = function() { reject(new Error('Не удалось прочитать файл')); };
            reader.readAsDataURL(file);
        });
    }

    function refreshSnapshotUi(root, obj) {
        if (!root || !obj) return;
        var preview = root.querySelector('[data-camera-snapshot-preview]');
        if (!preview) return;
        var snapshot = getCameraSnapshot(obj);
        preview.innerHTML = buildSnapshotPreviewInner(snapshot, 'Выберите изображение');
        var removeBtn = root.querySelector('.btn-camera-snapshot-remove');
        if (removeBtn) removeBtn.hidden = !snapshot;
    }

    function bindSnapshotHandlers(root, getObj) {
        if (!root || !getObj) return;
        var uploadBtn = root.querySelector('.btn-camera-snapshot-upload');
        var removeBtn = root.querySelector('.btn-camera-snapshot-remove');
        var input = root.querySelector('#editCameraSnapshotInput');
        if (!uploadBtn || !input) return;

        if (!uploadBtn._cameraSnapshotBound) {
            uploadBtn._cameraSnapshotBound = true;
            uploadBtn.addEventListener('click', function() { input.click(); });
        }
        if (!input._cameraSnapshotBound) {
            input._cameraSnapshotBound = true;
            input.addEventListener('change', function() {
                var file = input.files && input.files[0];
                input.value = '';
                if (!file) return;
                var obj = getObj();
                if (!obj || obj.properties.get('type') !== 'camera') return;
                processSnapshotFile(file).then(function(dataUrl) {
                    applyCameraSnapshot(obj, dataUrl);
                    refreshSnapshotUi(root, obj);
                    if (typeof saveData === 'function') saveData();
                    notifyCameraPresentationChanged(obj);
                    if (typeof showSuccess === 'function') showSuccess('Снимок сохранён');
                }).catch(function(err) {
                    if (typeof showError === 'function') showError(err.message || 'Ошибка загрузки');
                });
            });
        }
        if (removeBtn && !removeBtn._cameraSnapshotBound) {
            removeBtn._cameraSnapshotBound = true;
            removeBtn.addEventListener('click', function() {
                var obj = getObj();
                if (!obj || obj.properties.get('type') !== 'camera') return;
                applyCameraSnapshot(obj, '');
                refreshSnapshotUi(root, obj);
                if (typeof saveData === 'function') saveData();
                notifyCameraPresentationChanged(obj);
                if (typeof showInfo === 'function') showInfo('Снимок удалён');
            });
        }
    }

    function buildPlayerSectionHtml(cfg) {
        cfg = cfg || {};
        if (!hasActiveStream(cfg)) return '';
        return '<section class="object-card-section object-card-section--player camera-player-section">' +
            '<div class="camera-player-section-head">' +
            '<h4 class="object-card-section-title">Просмотр</h4>' +
            '<button type="button" class="btn-secondary btn-camera-player-reload" title="Перезагрузить поток">↻</button>' +
            '</div>' +
            '<div class="camera-player-mount" data-camera-player-mount></div>' +
            '</section>';
    }

    function loadHlsJs() {
        if (global.Hls) return Promise.resolve(global.Hls);
        if (hlsLoadPromise) return hlsLoadPromise;
        hlsLoadPromise = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = HLS_SCRIPT;
            s.async = true;
            s.onload = function() { resolve(global.Hls); };
            s.onerror = function() { reject(new Error('hls.js load failed')); };
            document.head.appendChild(s);
        });
        return hlsLoadPromise;
    }

    function showPlayerMessage(mount, text, isError) {
        mount.innerHTML = '<div class="camera-player-message' + (isError ? ' camera-player-message--error' : '') + '">' + escapeHtml(text) + '</div>';
    }

    function showSnapshotFallback(mount, snapshotUrl) {
        if (!mount || !isValidSnapshotDataUrl(snapshotUrl)) return false;
        destroyPlayerState(mount);
        mount.innerHTML =
            '<div class="camera-player-fallback">' +
            '<img src="' + snapshotUrl + '" alt="Запасной снимок обзора" class="camera-snapshot-img camera-player-fallback-img">' +
            '<p class="camera-player-fallback-caption">Поток недоступен · запасной снимок</p>' +
            '</div>';
        mount._cameraPlayerState = { type: 'snapshot' };
        return true;
    }

    function showPlaybackError(mount, message, snapshotUrl, obj) {
        if (!obj && mount) obj = mount._cameraPlayerObj;
        if (obj) setCameraStreamLive(obj, false);
        if (showSnapshotFallback(mount, snapshotUrl)) return;
        showPlayerMessage(mount, message, true);
    }

    function bindStreamLiveEvents(mediaEl, obj, onError) {
        if (!mediaEl || !obj) return;
        function markLive() { setCameraStreamLive(obj, true); }
        function markDead() {
            setCameraStreamLive(obj, false);
            if (typeof onError === 'function') onError();
        }
        mediaEl.addEventListener('load', markLive);
        mediaEl.addEventListener('playing', markLive);
        mediaEl.addEventListener('error', markDead);
    }

    function destroyPlayerState(mount) {
        if (!mount) return;
        var state = mount._cameraPlayerState;
        if (!state) return;
        if (state.hls) {
            try { state.hls.destroy(); } catch (e) {}
        }
        if (state.video) {
            try {
                state.video.pause();
                state.video.removeAttribute('src');
                state.video.load();
            } catch (e2) {}
        }
        if (state.iframe) {
            try { state.iframe.src = 'about:blank'; } catch (e3) {}
        }
        mount._cameraPlayerState = null;
        mount.innerHTML = '';
    }

    function mountPlayer(mount, cfg, snapshotUrl, obj) {
        if (!mount) return;
        destroyPlayerState(mount);
        mount._cameraPlayerObj = obj || null;
        cfg = cfg || {};
        snapshotUrl = isValidSnapshotDataUrl(snapshotUrl) ? snapshotUrl : '';
        var type = normalizeStreamType(cfg.streamType);
        var url = (cfg.streamUrl || '').trim();
        if (type === 'none' || !url) {
            if (obj) setCameraStreamLive(obj, false);
            if (!showSnapshotFallback(mount, snapshotUrl)) {
                showPlayerMessage(mount, 'Укажите URL и тип потока в настройках.');
            }
            return;
        }

        if (obj) setCameraStreamLive(obj, false);

        if (type === 'rtsp') {
            var rtspEsc = escapeHtml(url);
            mount.innerHTML = '<div class="camera-player-message camera-player-message--rtsp">' +
                '<p>Браузер не воспроизводит RTSP напрямую. Используйте VLC или прокси с HLS.</p>' +
                '<p class="camera-player-rtsp-url"><code>' + rtspEsc + '</code></p>' +
                '<a class="btn-secondary camera-player-external-link" href="' + rtspEsc + '" target="_blank" rel="noopener noreferrer">Открыть ссылку</a>' +
                '</div>';
            return;
        }

        var playUrl = resolvePlaybackUrl(cfg);
        var state = { type: type };

        function onPlaybackFail(message) {
            showPlaybackError(mount, message, snapshotUrl, obj);
        }

        if (type === 'iframe') {
            var iframe = document.createElement('iframe');
            iframe.className = 'camera-player-iframe';
            iframe.src = playUrl;
            iframe.title = 'Видеопоток камеры';
            iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
            iframe.setAttribute('loading', 'lazy');
            iframe.addEventListener('load', function() { if (obj) setCameraStreamLive(obj, true); });
            mount.appendChild(iframe);
            state.iframe = iframe;
            mount._cameraPlayerState = state;
            return;
        }

        if (type === 'mjpeg') {
            var img = document.createElement('img');
            img.className = 'camera-player-mjpeg';
            img.alt = 'Видеопоток камеры';
            img.src = playUrl;
            bindStreamLiveEvents(img, obj, function() {
                onPlaybackFail('Не удалось загрузить MJPEG/JPEG. Проверьте URL и доступность.');
            });
            mount.appendChild(img);
            state.img = img;
            mount._cameraPlayerState = state;
            return;
        }

        var video = document.createElement('video');
        video.className = 'camera-player-video';
        video.controls = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        if (cfg.streamMuted) video.muted = true;
        if (cfg.streamAutoplay) video.autoplay = true;
        mount.appendChild(video);
        state.video = video;

        bindStreamLiveEvents(video, obj, function() {
            onPlaybackFail('Ошибка воспроизведения. Проверьте URL, CORS и тип потока.');
        });

        if (type === 'hls') {
            loadHlsJs().then(function(Hls) {
                if (Hls && Hls.isSupported()) {
                    var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                    hls.loadSource(playUrl);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.ERROR, function(ev, data) {
                        if (data && data.fatal) onPlaybackFail('Ошибка воспроизведения. Проверьте URL, CORS и тип потока.');
                    });
                    state.hls = hls;
                    mount._cameraPlayerState = state;
                    if (cfg.streamAutoplay) {
                        video.play().catch(function() {});
                    }
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = playUrl;
                    mount._cameraPlayerState = state;
                    video.play().catch(function() {});
                } else {
                    onPlaybackFail('HLS не поддерживается в этом браузере.');
                }
            }).catch(function() {
                onPlaybackFail('Не удалось загрузить модуль HLS.');
            });
            return;
        }

        video.src = playUrl;
        mount._cameraPlayerState = state;
        if (cfg.streamAutoplay) video.play().catch(function() {});
    }

    function refreshPlayerInRoot(root, obj) {
        if (!root) return;
        var mount = root.querySelector('[data-camera-player-mount]');
        if (!mount) return;
        mountCameraPlayer(mount, getCameraStreamConfig(obj), obj);
    }

    function mountCameraPlayer(mount, cfg, obj) {
        var snapshotUrl = obj ? getCameraSnapshot(obj) : '';
        mountPlayer(mount, cfg, snapshotUrl, obj);
    }

    function destroyPlayersInRoot(root) {
        if (!root) return;
        root.querySelectorAll('[data-camera-player-mount]').forEach(function(m) {
            destroyPlayerState(m);
        });
    }

    function bindStreamForm(root, getObj, onUpdated, idPrefix) {
        if (!root || !getObj) return;
        idPrefix = idPrefix || 'editCamera';

        function refreshPreview() {
            var obj = getObj();
            if (!obj) return;
            var preview = root.querySelector('[data-camera-player-preview]');
            if (!preview) return;
            var cfg = readStreamConfigFromForm(idPrefix);
            if (cfg.streamType === 'none' || !cfg.streamUrl) {
                destroyPlayerState(preview);
                preview.innerHTML = '<div class="camera-player-message">Укажите URL и тип потока.</div>';
                return;
            }
            mountPlayer(preview, cfg, getCameraSnapshot(obj), obj);
        }

        function persistAndRefresh() {
            var obj = getObj();
            if (!obj || obj.properties.get('type') !== 'camera') return;
            var cfg = readStreamConfigFromForm(idPrefix);
            applyCameraStreamConfig(obj, cfg);
            if (typeof onUpdated === 'function') onUpdated(obj, cfg);
            refreshPlayerInRoot(root, obj);
            refreshPreview();
            if (typeof saveData === 'function') saveData();
            notifyCameraPresentationChanged(obj);
        }

        var fields = ['StreamType', 'StreamUrl', 'StreamUser', 'StreamPass', 'StreamAutoplay', 'StreamMuted'];
        fields.forEach(function(suffix) {
            var el = document.getElementById(idPrefix + suffix);
            if (!el || el._cameraStreamBound) return;
            el._cameraStreamBound = true;
            var ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(ev, function() {
                var obj = getObj();
                if (!obj) return;
                applyCameraStreamConfig(obj, readStreamConfigFromForm(idPrefix));
                if (typeof saveData === 'function') saveData();
                notifyCameraPresentationChanged(obj);
                refreshPreview();
            });
        });

        var detectBtn = root.querySelector('.btn-camera-stream-detect');
        if (detectBtn && !detectBtn._cameraStreamBound) {
            detectBtn._cameraStreamBound = true;
            detectBtn.addEventListener('click', function() {
                var urlEl = document.getElementById(idPrefix + 'StreamUrl');
                var typeEl = document.getElementById(idPrefix + 'StreamType');
                if (!urlEl || !typeEl) return;
                var guessed = guessStreamTypeFromUrl(urlEl.value.trim());
                typeEl.value = guessed;
                if (typeof showInfo === 'function') showInfo('Тип: ' + streamTypeLabel(guessed), 'Определено');
            });
        }

        var applyBtn = root.querySelector('.btn-camera-stream-apply');
        if (applyBtn && !applyBtn._cameraStreamBound) {
            applyBtn._cameraStreamBound = true;
            applyBtn.addEventListener('click', persistAndRefresh);
        }

        var reloadBtn = root.querySelector('.btn-camera-player-reload');
        if (reloadBtn && !reloadBtn._cameraStreamBound) {
            reloadBtn._cameraStreamBound = true;
            reloadBtn.addEventListener('click', function() {
                refreshPlayerInRoot(root, getObj());
            });
        }
    }

    function initCameraCard(root, obj, options) {
        options = options || {};
        if (!root || !obj) return;
        var cfg = getCameraStreamConfig(obj);
        var isEdit = !!options.isEditMode;
        var getObj = options.getObj || function() { return obj; };
        if (!isEdit && hasActiveStream(cfg)) {
            refreshPlayerInRoot(root, getObj());
        }
        if (isEdit) {
            var preview = root.querySelector('[data-camera-player-preview]');
            if (preview) {
                if (hasActiveStream(cfg)) mountPlayer(preview, cfg, getCameraSnapshot(getObj()), getObj());
                else showPlayerMessage(preview, 'Укажите URL и тип потока.');
            }
            bindSnapshotHandlers(root, getObj);
        }
        bindStreamForm(root, getObj, options.onUpdated, 'editCamera');
    }

    function getPlacementStreamOptions() {
        var typeEl = document.getElementById('cameraStreamType');
        var urlEl = document.getElementById('cameraStreamUrl');
        if (!urlEl) return {};
        var url = urlEl.value.trim();
        var streamType = typeEl ? normalizeStreamType(typeEl.value) : 'none';
        if (streamType === 'none' && url) streamType = guessStreamTypeFromUrl(url);
        return {
            streamType: streamType,
            streamUrl: url,
            streamUser: (document.getElementById('cameraStreamUser') && document.getElementById('cameraStreamUser').value.trim()) || '',
            streamPass: (document.getElementById('cameraStreamPass') && document.getElementById('cameraStreamPass').value) || ''
        };
    }

    var STREAM_CHECK_INTERVAL_MS = 90000;
    var STREAM_PROBE_TIMEOUT_MS = 12000;
    var STREAM_PROBE_STAGGER_MS = 600;
    var streamMonitorTimer = null;
    var streamMonitorRunning = false;
    var streamMonitorVisibilityBound = false;

    function getMapObjects() {
        if (typeof objects !== 'undefined' && Array.isArray(objects)) return objects;
        if (global.objects && Array.isArray(global.objects)) return global.objects;
        return [];
    }

    function probeUrlWithImage(url) {
        return new Promise(function(resolve) {
            var img = new Image();
            var settled = false;
            function finish(ok) {
                if (settled) return;
                settled = true;
                img.onload = img.onerror = null;
                resolve(!!ok);
            }
            var timer = setTimeout(function() { finish(false); }, STREAM_PROBE_TIMEOUT_MS);
            img.onload = function() { clearTimeout(timer); finish(true); };
            img.onerror = function() { clearTimeout(timer); finish(false); };
            try {
                var parsed = new URL(url, global.location.href);
                parsed.searchParams.set('_ncprobe', String(Date.now()));
                img.src = parsed.href;
            } catch (e) {
                img.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_ncprobe=' + Date.now();
            }
        });
    }

    function probeUrlWithFetch(url) {
        return new Promise(function(resolve) {
            if (typeof fetch !== 'function') {
                resolve(false);
                return;
            }
            var settled = false;
            function finish(ok) {
                if (settled) return;
                settled = true;
                resolve(!!ok);
            }
            var timer = setTimeout(function() { finish(false); }, STREAM_PROBE_TIMEOUT_MS);
            fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit' }).then(function(res) {
                clearTimeout(timer);
                finish(res && res.ok);
            }).catch(function() {
                clearTimeout(timer);
                finish(false);
            });
        });
    }

    function isCameraStreamCheckedInModal(obj) {
        if (typeof currentModalObject === 'undefined' || currentModalObject !== obj) return false;
        var modal = document.getElementById('infoModal');
        if (!modal) return false;
        return modal.style.display === 'flex';
    }

    function getCamerasForMonitor() {
        return getMapObjects().filter(function(o) {
            return o && o.properties && o.properties.get('type') === 'camera' &&
                hasActiveStream(getCameraStreamConfig(o));
        });
    }

    function probeCameraStream(obj) {
        if (!obj || !obj.properties) return Promise.resolve(false);
        var cfg = getCameraStreamConfig(obj);
        if (!hasActiveStream(cfg)) {
            setCameraStreamLive(obj, false);
            return Promise.resolve(false);
        }
        var type = normalizeStreamType(cfg.streamType);
        if (type === 'rtsp' || type === 'iframe') {
            setCameraStreamLive(obj, false);
            return Promise.resolve(false);
        }
        var playUrl = resolvePlaybackUrl(cfg);
        if (!playUrl) {
            setCameraStreamLive(obj, false);
            return Promise.resolve(false);
        }
        if (type === 'mjpeg' || /\.(jpe?g|png|gif|webp)(\?|$)/i.test(playUrl)) {
            return probeUrlWithImage(playUrl).then(function(ok) {
                setCameraStreamLive(obj, ok);
                return ok;
            });
        }
        if (type === 'hls') {
            return probeUrlWithFetch(playUrl).then(function(ok) {
                if (ok) {
                    setCameraStreamLive(obj, true);
                    return true;
                }
                return probeUrlWithImage(playUrl).then(function(imgOk) {
                    setCameraStreamLive(obj, imgOk);
                    return imgOk;
                });
            });
        }
        return probeUrlWithFetch(playUrl).then(function(ok) {
            setCameraStreamLive(obj, ok);
            return ok;
        });
    }

    function runStreamMonitorCycle() {
        if (streamMonitorRunning) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        var cameras = getCamerasForMonitor();
        if (!cameras.length) return;
        streamMonitorRunning = true;
        var index = 0;
        function next() {
            if (index >= cameras.length) {
                streamMonitorRunning = false;
                return;
            }
            var cam = cameras[index++];
            if (isCameraStreamCheckedInModal(cam)) {
                setTimeout(next, 50);
                return;
            }
            probeCameraStream(cam).finally(function() {
                setTimeout(next, STREAM_PROBE_STAGGER_MS);
            });
        }
        next();
    }

    function startStreamMonitor() {
        stopStreamMonitor();
        setTimeout(runStreamMonitorCycle, 2000);
        streamMonitorTimer = setInterval(runStreamMonitorCycle, STREAM_CHECK_INTERVAL_MS);
        if (!streamMonitorVisibilityBound && typeof document !== 'undefined') {
            streamMonitorVisibilityBound = true;
            document.addEventListener('visibilitychange', function() {
                if (!document.hidden) runStreamMonitorCycle();
            });
        }
    }

    function stopStreamMonitor() {
        if (streamMonitorTimer) {
            clearInterval(streamMonitorTimer);
            streamMonitorTimer = null;
        }
        streamMonitorRunning = false;
    }

    global.CameraPlayer = {
        STREAM_TYPES: STREAM_TYPES,
        normalizeStreamType: normalizeStreamType,
        guessStreamTypeFromUrl: guessStreamTypeFromUrl,
        hasActiveStream: hasActiveStream,
        isCameraOnline: isCameraOnline,
        setCameraStreamLive: setCameraStreamLive,
        getCameraStatusTitle: getCameraStatusTitle,
        buildStatusBadgeHtml: buildStatusBadgeHtml,
        buildMapLabelHtml: buildMapLabelHtml,
        notifyCameraPresentationChanged: notifyCameraPresentationChanged,
        getCameraStreamConfig: getCameraStreamConfig,
        getCameraSnapshot: getCameraSnapshot,
        applyCameraSnapshot: applyCameraSnapshot,
        applyCameraStreamConfig: applyCameraStreamConfig,
        readStreamConfigFromForm: readStreamConfigFromForm,
        buildStreamSettingsHtml: buildStreamSettingsHtml,
        buildSnapshotSectionHtml: buildSnapshotSectionHtml,
        buildPlayerSectionHtml: buildPlayerSectionHtml,
        mountCameraPlayer: mountCameraPlayer,
        destroyPlayersInRoot: destroyPlayersInRoot,
        refreshPlayerInRoot: refreshPlayerInRoot,
        bindStreamForm: bindStreamForm,
        initCameraCard: initCameraCard,
        getPlacementStreamOptions: getPlacementStreamOptions,
        probeCameraStream: probeCameraStream,
        startStreamMonitor: startStreamMonitor,
        stopStreamMonitor: stopStreamMonitor,
        runStreamMonitorCycle: runStreamMonitorCycle
    };
})(typeof window !== 'undefined' ? window : this);
