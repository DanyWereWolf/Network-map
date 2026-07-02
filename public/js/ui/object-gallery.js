/**
 * Галерея фото для объектов карты (кроме кабелей).
 */
(function (global) {
    var MAX_PHOTOS = 20;
    var MAX_FILE_BYTES = 5 * 1024 * 1024;
    var OBJECT_MAX_BYTES = 5 * 1024 * 1024;
    var MAX_DIM = 1280;
    var JPEG_QUALITY = 0.72;
    var JPEG_QUALITY_MIN = 0.55;
    var TARGET_BYTES = 450 * 1024;
    var EXCLUDED_TYPES = { cable: true, cableLabel: true, camera: true };
    var lightboxEl = null;
    var lightboxIndex = 0;
    var lightboxPhotos = [];

    function isVolsmapAndroidApp() {
        try {
            if (global.__VOLSMAP_ANDROID__ === true) return true;
            if (global.VolsmapAndroid && typeof global.VolsmapAndroid.isApp === 'function' && global.VolsmapAndroid.isApp()) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    function canUploadGalleryPhotos(isEditMode) {
        if (isEditMode) return true;
        if (!isVolsmapAndroidApp()) return false;
        try {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') return true;
            if (typeof isAdmin === 'function' && isAdmin()) return true;
        } catch (e) {}
        return false;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getObjectType(obj) {
        return obj && obj.properties ? obj.properties.get('type') : '';
    }

    function canHaveGallery(obj) {
        var type = getObjectType(obj);
        return !!type && !EXCLUDED_TYPES[type];
    }

    function normalizePhotos(raw) {
        if (!Array.isArray(raw)) return [];
        var out = [];
        for (var i = 0; i < raw.length && out.length < MAX_PHOTOS; i++) {
            var p = raw[i];
            if (!p || !p.id) continue;
            var entry = {
                id: String(p.id),
                ext: p.ext ? String(p.ext) : '.jpg',
                name: p.name ? String(p.name).slice(0, 120) : '',
                createdAt: p.createdAt || null
            };
            if (p.size != null && p.size > 0) entry.size = Number(p.size);
            out.push(entry);
        }
        return out;
    }

    function getObjectPhotos(obj) {
        if (!obj || !obj.properties) return [];
        return normalizePhotos(obj.properties.get('photos'));
    }

    function setObjectPhotos(obj, photos) {
        if (!obj || !obj.properties) return;
        var list = normalizePhotos(photos);
        if (list.length) obj.properties.set('photos', list);
        else obj.properties.unset('photos');
    }

    function applyPhotosFromData(obj, data) {
        if (!obj || !obj.properties || !data) return;
        if (Array.isArray(data.photos)) {
            setObjectPhotos(obj, data.photos);
        }
    }

    function formatBytes(bytes) {
        var n = Number(bytes) || 0;
        if (n < 1024) return n + ' Б';
        if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' КБ';
        if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' МБ';
        return (n / (1024 * 1024 * 1024)).toFixed(1) + ' ГБ';
    }

    function getPhotosBytes(photos) {
        if (!Array.isArray(photos)) return 0;
        var total = 0;
        for (var i = 0; i < photos.length; i++) {
            var s = photos[i] && photos[i].size;
            if (s != null && s > 0) total += Number(s);
        }
        return total;
    }

    function estimateDataUrlBytes(dataUrl) {
        if (!dataUrl || typeof dataUrl !== 'string') return 0;
        var comma = dataUrl.indexOf(',');
        if (comma < 0) return 0;
        return Math.max(0, Math.round((dataUrl.length - comma - 1) * 3 / 4));
    }

    function resolveObjectUniqueId(obj) {
        if (typeof getObjectUniqueId === 'function') return getObjectUniqueId(obj) || '';
        if (obj && obj.properties) return obj.properties.get('uniqueId') || '';
        return '';
    }

    function ensureObjectUniqueId(obj) {
        if (!obj || !obj.properties) return '';
        var uid = resolveObjectUniqueId(obj);
        if (uid) return uid;
        if (typeof ensurePlacemarkUniqueIdForSync === 'function') {
            ensurePlacemarkUniqueIdForSync(obj);
            return resolveObjectUniqueId(obj);
        }
        return '';
    }

    function getAuthMediaSrc(url) {
        if (!url) return '';
        var base = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
        var path = url.charAt(0) === '/' ? url : '/' + url;
        var full = base ? (base.replace(/\/$/, '') + path) : path;
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token) return full;
        var sep = full.indexOf('?') >= 0 ? '&' : '?';
        return full + sep + 'token=' + encodeURIComponent(token);
    }

    function photoUrl(photo) {
        if (!photo || !photo.id) return '';
        var ext = photo.ext || '.jpg';
        if (ext.charAt(0) !== '.') ext = '.' + ext;
        return getAuthMediaSrc('/api/object-media/file/' + encodeURIComponent(photo.id) + ext);
    }

    function readFileAsDataUrl(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(new Error('Не удалось прочитать файл')); };
            reader.readAsDataURL(file);
        });
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
                if (w > MAX_DIM || h > MAX_DIM) {
                    scale = MAX_DIM / Math.max(w, h);
                }
                var cw = Math.max(1, Math.round(w * scale));
                var ch = Math.max(1, Math.round(h * scale));
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, cw, ch);
                ctx.drawImage(img, 0, 0, cw, ch);
                try {
                    var quality = JPEG_QUALITY;
                    var result = canvas.toDataURL('image/jpeg', quality);
                    while (estimateDataUrlBytes(result) > TARGET_BYTES && quality > JPEG_QUALITY_MIN) {
                        quality = Math.max(JPEG_QUALITY_MIN, quality - 0.07);
                        result = canvas.toDataURL('image/jpeg', quality);
                    }
                    resolve(result);
                } catch (e) {
                    resolve(dataUrl);
                }
            };
            img.onerror = function() { reject(new Error('Не удалось прочитать изображение')); };
            img.src = dataUrl;
        });
    }

    function processImageFile(file) {
        if (!file || !/^image\//i.test(file.type)) {
            return Promise.reject(new Error('Выберите изображение (JPEG, PNG, WebP, GIF)'));
        }
        if (file.size > MAX_FILE_BYTES) {
            return Promise.reject(new Error('Файл больше 5 МБ'));
        }
        return readFileAsDataUrl(file).then(function(dataUrl) {
            return resizeImageToDataUrl(dataUrl);
        });
    }

    function uploadPhoto(dataUrl, name, objectUniqueId) {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') {
            return Promise.reject(new Error('Требуется авторизация'));
        }
        if (!objectUniqueId) {
            return Promise.reject(new Error('У объекта нет идентификатора — сохраните карту и попробуйте снова'));
        }
        return fetch(getApiBase() + '/api/object-media', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ dataUrl: dataUrl, name: name || '', objectUniqueId: objectUniqueId })
        }).then(function(r) {
            return r.json().then(function(body) {
                if (!r.ok) throw new Error((body && body.error) || 'Ошибка загрузки');
                return body.media;
            });
        });
    }

    function deletePhotoFile(mediaId, ext) {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') return Promise.resolve();
        var extPart = ext || '.jpg';
        if (extPart.charAt(0) !== '.') extPart = '.' + extPart;
        var url = getApiBase() + '/api/object-media/' + encodeURIComponent(mediaId) + extPart;
        return fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        }).catch(function() {});
    }

    function ensureLightbox() {
        if (lightboxEl) return lightboxEl;
        lightboxEl = document.createElement('div');
        lightboxEl.className = 'object-gallery-lightbox';
        lightboxEl.hidden = true;
        lightboxEl.innerHTML =
            '<button type="button" class="object-gallery-lightbox-close" aria-label="Закрыть">&times;</button>' +
            '<button type="button" class="object-gallery-lightbox-prev" aria-label="Предыдущее">&#8249;</button>' +
            '<button type="button" class="object-gallery-lightbox-next" aria-label="Следующее">&#8250;</button>' +
            '<div class="object-gallery-lightbox-stage">' +
                '<img class="object-gallery-lightbox-img" alt="">' +
                '<div class="object-gallery-lightbox-caption"></div>' +
                '<div class="object-gallery-lightbox-counter"></div>' +
            '</div>';
        document.body.appendChild(lightboxEl);

        lightboxEl.querySelector('.object-gallery-lightbox-close').addEventListener('click', closeLightbox);
        lightboxEl.querySelector('.object-gallery-lightbox-prev').addEventListener('click', function() { showLightboxAt(lightboxIndex - 1); });
        lightboxEl.querySelector('.object-gallery-lightbox-next').addEventListener('click', function() { showLightboxAt(lightboxIndex + 1); });
        lightboxEl.addEventListener('click', function(e) {
            if (e.target === lightboxEl) closeLightbox();
        });
        document.addEventListener('keydown', function(e) {
            if (!lightboxEl || lightboxEl.hidden) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') showLightboxAt(lightboxIndex - 1);
            else if (e.key === 'ArrowRight') showLightboxAt(lightboxIndex + 1);
        });
        return lightboxEl;
    }

    function showLightboxAt(index) {
        if (!lightboxPhotos.length) return;
        ensureLightbox();
        if (index < 0) index = lightboxPhotos.length - 1;
        if (index >= lightboxPhotos.length) index = 0;
        lightboxIndex = index;
        var photo = lightboxPhotos[index];
        var img = lightboxEl.querySelector('.object-gallery-lightbox-img');
        var caption = lightboxEl.querySelector('.object-gallery-lightbox-caption');
        var counter = lightboxEl.querySelector('.object-gallery-lightbox-counter');
        img.src = photoUrl(photo);
        img.alt = photo.name || ('Фото ' + (index + 1));
        caption.textContent = photo.name || '';
        caption.hidden = !photo.name;
        counter.textContent = (index + 1) + ' / ' + lightboxPhotos.length;
        lightboxEl.hidden = false;
        document.body.classList.add('object-gallery-lightbox-open');
        var prevBtn = lightboxEl.querySelector('.object-gallery-lightbox-prev');
        var nextBtn = lightboxEl.querySelector('.object-gallery-lightbox-next');
        if (prevBtn) prevBtn.hidden = lightboxPhotos.length <= 1;
        if (nextBtn) nextBtn.hidden = lightboxPhotos.length <= 1;
    }

    function closeLightbox() {
        if (!lightboxEl) return;
        lightboxEl.hidden = true;
        document.body.classList.remove('object-gallery-lightbox-open');
        var img = lightboxEl.querySelector('.object-gallery-lightbox-img');
        if (img) img.removeAttribute('src');
    }

    function openLightbox(photos, startIndex) {
        lightboxPhotos = photos.slice();
        showLightboxAt(startIndex || 0);
    }

    function isObjectQuotaFull(photos) {
        return getPhotosBytes(photos) >= OBJECT_MAX_BYTES || photos.length >= MAX_PHOTOS;
    }

    function buildUsageHint(photos) {
        var used = getPhotosBytes(photos);
        return formatBytes(used) + ' / ' + formatBytes(OBJECT_MAX_BYTES) + ' на объект · файл до ' + formatBytes(MAX_FILE_BYTES);
    }

    function buildGallerySummaryMeta(photos, isEditMode) {
        if (isEditMode) return buildUsageHint(photos) + ' · JPEG ' + MAX_DIM + 'px';
        if (photos.length) return photos.length + ' фото';
        return 'раскрыть';
    }

    function buildGallerySectionHtml(obj, isEditMode, opts) {
        opts = opts || {};
        if (!canHaveGallery(obj)) return '';
        var photos = getObjectPhotos(obj);
        var allowUpload = canUploadGalleryPhotos(isEditMode);
        if (!photos.length && !isEditMode && !allowUpload) return '';
        var quotaFull = isObjectQuotaFull(photos);
        var detailsOpen = opts.open === true ? ' open' : '';
        var sectionClass = 'object-card-section object-card-section--gallery object-gallery-section';
        if (opts.compact) sectionClass += ' object-gallery-section--compact';
        var html = '<section class="' + sectionClass + '" data-object-gallery>';
        html += '<details class="object-gallery-details"' + detailsOpen + '>';
        html += '<summary class="object-gallery-summary">';
        html += '<span class="object-gallery-summary-title">Фотогалерея</span>';
        if (photos.length) {
            html += '<span class="object-card-badge object-gallery-summary-badge" title="Число фото">' + photos.length + '</span>';
        }
        html += '<span class="object-gallery-summary-meta" data-gallery-summary-meta>' + escapeHtml(buildGallerySummaryMeta(photos, isEditMode || allowUpload)) + '</span>';
        html += '</summary>';
        html += '<div class="object-gallery-body">';

        if (!photos.length && (isEditMode || allowUpload)) {
            html += '<p class="object-card-hint object-gallery-empty">Прикрепите фото объекта — опора, шкаф, фасад, маркировка.</p>';
        }
        if (photos.length) {
            html += '<div class="object-gallery-grid" data-gallery-grid>';
            photos.forEach(function(photo, idx) {
                html += '<div class="object-gallery-item-wrap" data-photo-id="' + escapeHtml(photo.id) + '">';
                html += '<button type="button" class="object-gallery-item" data-gallery-index="' + idx + '" title="' + escapeHtml(photo.name || ('Фото ' + (idx + 1))) + '">';
                html += '<img data-src="' + escapeHtml(photoUrl(photo)) + '" alt="" loading="lazy">';
                html += '</button>';
                if (isEditMode) {
                    html += '<button type="button" class="object-gallery-delete" data-photo-id="' + escapeHtml(photo.id) + '" title="Удалить" aria-label="Удалить фото">&times;</button>';
                }
                html += '</div>';
            });
            html += '</div>';
        }

        if (allowUpload) {
            html += '<div class="object-gallery-toolbar">';
            html += '<input type="file" class="object-gallery-input" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>';
            if (isVolsmapAndroidApp()) {
                html += '<button type="button" class="btn-secondary object-gallery-camera-btn"' + (quotaFull ? ' disabled' : '') + '>';
                html += '<span class="object-gallery-upload-icon" aria-hidden="true">📷</span> Снять фото</button>';
                html += '<button type="button" class="btn-secondary object-gallery-upload-btn"' + (quotaFull ? ' disabled' : '') + '>';
                html += '<span class="object-gallery-upload-icon" aria-hidden="true">🖼</span> Из галереи</button>';
            } else {
                html += '<button type="button" class="btn-secondary object-gallery-upload-btn"' + (quotaFull ? ' disabled' : '') + '>';
                html += '<span class="object-gallery-upload-icon" aria-hidden="true">📷</span> Добавить фото</button>';
            }
            html += '<span class="object-gallery-hint" data-gallery-usage>' + escapeHtml(buildUsageHint(photos)) + ' · JPEG ' + MAX_DIM + 'px</span>';
            html += '</div>';
        }
        html += '</div></details></section>';
        return html;
    }

    function loadGalleryImages(section) {
        if (!section) return;
        section.querySelectorAll('.object-gallery-grid img[data-src]').forEach(function(img) {
            var src = img.getAttribute('data-src');
            if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
        });
    }

    function refreshGalleryGrid(root, obj, isEditMode, opts) {
        if (!root) return;
        var section = root.querySelector('[data-object-gallery]') || root.closest('[data-object-gallery]');
        if (!section) return;
        var parent = section.parentNode;
        if (!parent) return;
        var details = section.querySelector('.object-gallery-details');
        var wasOpen = details ? details.open : false;
        if (opts && opts.open) wasOpen = true;
        var tmp = document.createElement('div');
        tmp.innerHTML = buildGallerySectionHtml(obj, isEditMode, { open: wasOpen });
        var newSection = tmp.firstElementChild;
        if (newSection) {
            parent.replaceChild(newSection, section);
            if (wasOpen) loadGalleryImages(newSection);
            return newSection;
        }
        return section;
    }

    function initGallery(root, obj, options) {
        if (!root || !obj || !canHaveGallery(obj)) return;
        options = options || {};
        var isEditMode = options.isEditMode !== false;
        var allowUpload = canUploadGalleryPhotos(isEditMode);
        var getObj = options.getObj || function() { return obj; };
        var onChanged = options.onChanged || function() {};

        function updateUploadControls(section, o) {
            if (!section || !o) return;
            var list = getObjectPhotos(o);
            var btn = section.querySelector('.object-gallery-upload-btn');
            var hint = section.querySelector('[data-gallery-usage]');
            var summaryMeta = section.querySelector('[data-gallery-summary-meta]');
            var summaryBadge = section.querySelector('.object-gallery-summary-badge');
            if (hint) hint.textContent = buildUsageHint(list) + ' · JPEG ' + MAX_DIM + 'px';
            if (summaryMeta) summaryMeta.textContent = buildGallerySummaryMeta(list, isEditMode || allowUpload);
            if (summaryBadge) {
                if (list.length) summaryBadge.textContent = String(list.length);
                else summaryBadge.remove();
            } else if (list.length) {
                var title = section.querySelector('.object-gallery-summary-title');
                if (title && title.nextElementSibling && !title.nextElementSibling.classList.contains('object-gallery-summary-badge')) {
                    var badge = document.createElement('span');
                    badge.className = 'object-card-badge object-gallery-summary-badge';
                    badge.title = 'Число фото';
                    badge.textContent = String(list.length);
                    title.after(badge);
                }
            }
            if (btn) {
                btn.disabled = isObjectQuotaFull(list);
                if (btn.textContent.indexOf('Загрузка') >= 0) {
                    btn.innerHTML = isVolsmapAndroidApp()
                        ? '<span class="object-gallery-upload-icon" aria-hidden="true">🖼</span> Из галереи'
                        : '<span class="object-gallery-upload-icon" aria-hidden="true">📷</span> Добавить фото';
                }
            }
            var cameraBtn = section.querySelector('.object-gallery-camera-btn');
            if (cameraBtn) {
                cameraBtn.disabled = isObjectQuotaFull(list);
                if (cameraBtn.textContent.indexOf('Загрузка') >= 0) {
                    cameraBtn.innerHTML = '<span class="object-gallery-upload-icon" aria-hidden="true">📷</span> Снять фото';
                }
            }
        }

        function bindSection(section) {
            if (!section) return;
            var photos = getObjectPhotos(getObj());
            var details = section.querySelector('.object-gallery-details');

            if (details) {
                details.addEventListener('toggle', function() {
                    if (details.open) loadGalleryImages(section);
                });
                if (details.open) loadGalleryImages(section);
            }

            section.querySelectorAll('.object-gallery-item').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var idx = parseInt(btn.getAttribute('data-gallery-index'), 10);
                    if (isNaN(idx)) idx = 0;
                    openLightbox(getObjectPhotos(getObj()), idx);
                });
            });

            var uploadBtn = section.querySelector('.object-gallery-upload-btn');
            var cameraBtn = section.querySelector('.object-gallery-camera-btn');
            var fileInput = section.querySelector('.object-gallery-input');

            function resetFileInputMode() {
                if (!fileInput) return;
                fileInput.removeAttribute('capture');
                if (!isVolsmapAndroidApp()) {
                    fileInput.setAttribute('multiple', '');
                }
            }

            function runUploadFromFiles(files, activeBtn) {
                if (!files || !files.length) return;
                var o = getObj();
                var hadUid = !!resolveObjectUniqueId(o);
                var objectUniqueId = ensureObjectUniqueId(o);
                if (!objectUniqueId) {
                    if (typeof showWarning === 'function') showWarning('Нет ID объекта', 'Сохраните карту и повторите загрузку');
                    fileInput.value = '';
                    return;
                }
                if (!hadUid) onChanged(o);
                var current = getObjectPhotos(o);
                if (isObjectQuotaFull(current)) {
                    if (typeof showWarning === 'function') showWarning('Лимит объекта', 'На объект можно загрузить не более ' + formatBytes(OBJECT_MAX_BYTES));
                    fileInput.value = '';
                    return;
                }
                if (uploadBtn) uploadBtn.disabled = true;
                if (cameraBtn) cameraBtn.disabled = true;
                if (activeBtn) activeBtn.textContent = 'Загрузка…';
                var queue = Array.prototype.slice.call(files, 0, MAX_PHOTOS);
                var chain = Promise.resolve();
                var added = [];
                var usedBytes = getPhotosBytes(current);
                queue.forEach(function(file) {
                    chain = chain.then(function() {
                        if (current.length + added.length >= MAX_PHOTOS) return;
                        if (usedBytes >= OBJECT_MAX_BYTES) return;
                        return processImageFile(file).then(function(dataUrl) {
                            var est = estimateDataUrlBytes(dataUrl);
                            if (est > MAX_FILE_BYTES) {
                                throw new Error('Файл после обработки больше ' + formatBytes(MAX_FILE_BYTES));
                            }
                            if (usedBytes + est > OBJECT_MAX_BYTES) {
                                throw new Error('Превышен лимит ' + formatBytes(OBJECT_MAX_BYTES) + ' на объект');
                            }
                            return uploadPhoto(dataUrl, file.name, objectUniqueId).then(function(media) {
                                var photoSize = media.size != null ? Number(media.size) : est;
                                usedBytes += photoSize;
                                added.push({
                                    id: media.id,
                                    ext: media.ext || '.jpg',
                                    name: media.name || file.name || '',
                                    size: photoSize,
                                    createdAt: media.createdAt || new Date().toISOString()
                                });
                            });
                        });
                    });
                });
                chain.then(function() {
                    if (!added.length) return;
                    var objRef = getObj();
                    var next = getObjectPhotos(objRef).concat(added);
                    setObjectPhotos(objRef, next);
                    onChanged(objRef);
                    var newSection = refreshGalleryGrid(root, objRef, isEditMode, { open: true });
                    bindSection(newSection);
                }).catch(function(err) {
                    if (typeof showWarning === 'function') showWarning('Не удалось загрузить', err.message || 'Ошибка');
                }).finally(function() {
                    fileInput.value = '';
                    resetFileInputMode();
                    var objRef = getObj();
                    var sec = root.querySelector('[data-object-gallery]');
                    updateUploadControls(sec, objRef);
                });
            }

            if (allowUpload && fileInput) {
                fileInput.addEventListener('change', function() {
                    var files = fileInput.files;
                    var activeBtn = cameraBtn && cameraBtn.textContent.indexOf('Загрузка') >= 0 ? cameraBtn : uploadBtn;
                    runUploadFromFiles(files, activeBtn);
                });

                if (cameraBtn) {
                    cameraBtn.addEventListener('click', function() {
                        if (cameraBtn.disabled) return;
                        fileInput.removeAttribute('multiple');
                        fileInput.setAttribute('capture', 'environment');
                        fileInput.click();
                    });
                }

                if (uploadBtn) {
                    uploadBtn.addEventListener('click', function() {
                        if (uploadBtn.disabled) return;
                        resetFileInputMode();
                        if (isVolsmapAndroidApp()) {
                            fileInput.setAttribute('multiple', '');
                        }
                        fileInput.click();
                    });
                }
            }

            if (isEditMode) {
                section.querySelectorAll('.object-gallery-delete').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var mediaId = btn.getAttribute('data-photo-id');
                    if (!mediaId) return;
                    var o = getObj();
                    var list = getObjectPhotos(o);
                    var photo = list.find(function(p) { return p.id === mediaId; });
                    setObjectPhotos(o, list.filter(function(p) { return p.id !== mediaId; }));
                    onChanged(o);
                    deletePhotoFile(mediaId, photo && photo.ext);
                    var newSection = refreshGalleryGrid(root, o, isEditMode);
                    bindSection(newSection);
                    updateUploadControls(newSection, o);
                });
            });
            }
        }

        var section = root.querySelector('[data-object-gallery]');
        bindSection(section);
    }

    function cleanupObjectPhotos(obj) {
        if (!obj) return;
        var photos = getObjectPhotos(obj);
        photos.forEach(function(p) {
            deletePhotoFile(p.id, p.ext);
        });
    }

    global.ObjectGallery = {
        canHaveGallery: canHaveGallery,
        getObjectPhotos: getObjectPhotos,
        setObjectPhotos: setObjectPhotos,
        applyPhotosFromData: applyPhotosFromData,
        buildGallerySectionHtml: buildGallerySectionHtml,
        initGallery: initGallery,
        cleanupObjectPhotos: cleanupObjectPhotos,
        getAuthMediaSrc: getAuthMediaSrc,
        photoUrl: photoUrl
    };
})(typeof window !== 'undefined' ? window : this);
