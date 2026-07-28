/**
 * Rich-text редактор новостей (Quill) для site-admin.
 */
(function() {
    var quillInstance = null;
    var uploadInProgress = false;
    var htmlModalEl = null;

    function getApiRoot() {
        var base = '';
        try {
            if (typeof getApiBase === 'function') base = getApiBase();
        } catch (e) {}
        if (!base && typeof location !== 'undefined') base = location.origin || '';
        return base ? base.replace(/\/$/, '') : '';
    }

    function getAuthHeaders() {
        var headers = { 'Content-Type': 'application/json' };
        try {
            if (typeof getAuthToken === 'function') {
                var token = getAuthToken();
                if (token) headers['Authorization'] = 'Bearer ' + token;
            }
        } catch (e) {}
        return headers;
    }

    function readFileAsDataUrl(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function uploadMedia(file, kind) {
        if (uploadInProgress) return Promise.reject(new Error('Подождите, идёт загрузка…'));
        uploadInProgress = true;
        return readFileAsDataUrl(file).then(function(dataUrl) {
            return fetch(getApiRoot() + '/api/admin/news-media', {
                method: 'POST',
                credentials: 'include',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    dataUrl: dataUrl,
                    name: file.name,
                    kind: kind
                })
            });
        }).then(function(r) {
            if (!r.ok) return r.json().then(function(b) { throw new Error(b.error || 'Ошибка загрузки'); });
            return r.json();
        }).finally(function() {
            uploadInProgress = false;
        });
    }

    function pickFile(accept, kind) {
        return new Promise(function(resolve, reject) {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', function() {
                var file = input.files && input.files[0];
                document.body.removeChild(input);
                if (!file) {
                    reject(new Error('cancel'));
                    return;
                }
                uploadMedia(file, kind).then(resolve).catch(reject);
            });
            input.click();
        });
    }

    function insertImage(url, alt) {
        if (!quillInstance) return;
        var range = quillInstance.getSelection(true);
        quillInstance.insertEmbed(range.index, 'image', url, 'user');
        if (alt) {
            quillInstance.formatText(range.index, 1, 'alt', alt);
        }
        quillInstance.setSelection(range.index + 1);
    }

    function insertVideoFile(url) {
        if (!quillInstance) return;
        var range = quillInstance.getSelection(true);
        var html = '<video controls class="news-video" src="' + url.replace(/"/g, '&quot;') + '" playsinline></video>';
        quillInstance.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
        quillInstance.setSelection(range.index + 1);
    }

    function insertFileLink(url, name) {
        if (!quillInstance) return;
        var range = quillInstance.getSelection(true);
        var label = name || 'Скачать файл';
        var html = '<p class="news-attachment"><a href="' + url.replace(/"/g, '&quot;') + '" class="news-file-link" target="_blank" rel="noopener noreferrer">' +
            String(label).replace(/</g, '&lt;') + '</a></p>';
        quillInstance.clipboard.dangerouslyPasteHTML(range.index, html, 'user');
        quillInstance.setSelection(range.index + 1);
    }

    function imageHandler() {
        pickFile('image/jpeg,image/png,image/webp,image/gif', 'image')
            .then(function(res) { insertImage(res.url, res.name); })
            .catch(function(err) { if (err && err.message !== 'cancel') alert(err.message || err); });
    }

    function videoFileHandler() {
        pickFile('video/mp4,video/webm,video/ogg', 'video')
            .then(function(res) { insertVideoFile(res.url); })
            .catch(function(err) { if (err && err.message !== 'cancel') alert(err.message || err); });
    }

    function fileHandler() {
        pickFile('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z', 'file')
            .then(function(res) { insertFileLink(res.url, res.name); })
            .catch(function(err) { if (err && err.message !== 'cancel') alert(err.message || err); });
    }

    function decodeBasicEntities(text) {
        return String(text || '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
    }

    /** Текст похож на HTML-разметку (а не на обычный абзац). */
    function looksLikeHtmlSource(text) {
        var t = String(text || '').trim();
        if (!t) return false;
        if (/^<!DOCTYPE/i.test(t) || /^<html[\s>]/i.test(t)) return true;
        if (/^<(p|div|h[1-6]|ul|ol|li|br|strong|em|b|i|blockquote|figure|img|video|span|a|hr)\b/i.test(t)) {
            return true;
        }
        var openTags = t.match(/<(p|div|h[1-6]|ul|ol|li|strong|em|blockquote|img|video|a|span)\b[^>]*>/gi);
        return !!(openTags && openTags.length >= 2);
    }

    /**
     * Если в Quill уже лежит экранированный HTML (&lt;h3&gt;…),
     * достаём исходную разметку для повторной вставки.
     */
    function extractEscapedHtmlFromQuillHtml(quillHtml) {
        var raw = String(quillHtml || '').trim();
        if (!raw) return '';
        if (!/&lt;\/?(?:p|h[1-6]|ul|ol|li|div|strong|em|b|i)\b/i.test(raw)) return '';
        try {
            var tmp = document.createElement('div');
            tmp.innerHTML = raw;
            var plain = (tmp.textContent || tmp.innerText || '').trim();
            if (looksLikeHtmlSource(plain)) return plain;
            if (looksLikeHtmlSource(decodeBasicEntities(plain))) return decodeBasicEntities(plain);
        } catch (e) {}
        return '';
    }

    function plainTextToHtml(text) {
        var trimmed = String(text || '').trim();
        if (!trimmed) return '';
        if (looksLikeHtmlSource(trimmed)) return trimmed;
        if (trimmed.indexOf('&lt;') >= 0 && looksLikeHtmlSource(decodeBasicEntities(trimmed))) {
            return decodeBasicEntities(trimmed);
        }
        if (trimmed.indexOf('<') >= 0) return trimmed;
        return trimmed.split(/\n\n+/).map(function(block) {
            return '<p>' + block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }

    function setEditorHtml(html, source) {
        if (!quillInstance) return;
        var content = plainTextToHtml(html || '');
        var escaped = extractEscapedHtmlFromQuillHtml(content);
        if (escaped) content = escaped;
        if (quillInstance.clipboard && quillInstance.clipboard.dangerouslyPasteHTML) {
            quillInstance.setText('');
            if (content) {
                quillInstance.clipboard.dangerouslyPasteHTML(0, content, source || 'silent');
            }
        } else {
            quillInstance.root.innerHTML = content || '';
        }
    }

    function insertHtmlAtCursor(html) {
        if (!quillInstance) return;
        var content = plainTextToHtml(html || '');
        if (!content) return;
        var range = quillInstance.getSelection(true) || { index: quillInstance.getLength(), length: 0 };
        quillInstance.clipboard.dangerouslyPasteHTML(range.index, content, 'user');
        quillInstance.setSelection(Math.min(quillInstance.getLength(), range.index + 1));
    }

    function ensureHtmlModal() {
        if (htmlModalEl) return htmlModalEl;
        var overlay = document.createElement('div');
        overlay.id = 'newsHtmlSourceModal';
        overlay.className = 'news-html-modal';
        overlay.hidden = true;
        overlay.innerHTML =
            '<div class="news-html-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="newsHtmlModalTitle">' +
                '<div class="news-html-modal__head">' +
                    '<h3 id="newsHtmlModalTitle" class="news-html-modal__title">Вставить HTML</h3>' +
                    '<button type="button" class="news-html-modal__close" data-html-modal-close aria-label="Закрыть">×</button>' +
                '</div>' +
                '<p class="news-html-modal__hint">Вставьте разметку поста (&lt;p&gt;, &lt;h3&gt;, &lt;ul&gt;…). Она будет распознана как форматирование, а не как текст.</p>' +
                '<textarea id="newsHtmlSourceInput" class="news-html-modal__textarea" rows="14" spellcheck="false" placeholder="<p>Текст…</p>&#10;<h3>Раздел</h3>&#10;<ul><li>Пункт</li></ul>"></textarea>' +
                '<div class="news-html-modal__actions">' +
                    '<button type="button" class="btn-sm" data-html-modal-close>Отмена</button>' +
                    '<button type="button" class="btn-sm" id="newsHtmlInsertBtn">Вставить в позицию курсора</button>' +
                    '<button type="button" class="btn-sm-primary" id="newsHtmlReplaceBtn">Заменить весь текст</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.addEventListener('click', function(e) {
            if (e.target === overlay || (e.target && e.target.getAttribute('data-html-modal-close') != null)) {
                closeHtmlModal();
            }
        });
        var insertBtn = overlay.querySelector('#newsHtmlInsertBtn');
        var replaceBtn = overlay.querySelector('#newsHtmlReplaceBtn');
        if (insertBtn) {
            insertBtn.addEventListener('click', function() {
                var val = (overlay.querySelector('#newsHtmlSourceInput') || {}).value || '';
                insertHtmlAtCursor(val);
                closeHtmlModal();
            });
        }
        if (replaceBtn) {
            replaceBtn.addEventListener('click', function() {
                var val = (overlay.querySelector('#newsHtmlSourceInput') || {}).value || '';
                setEditorHtml(val, 'user');
                closeHtmlModal();
            });
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && htmlModalEl && !htmlModalEl.hidden) closeHtmlModal();
        });

        htmlModalEl = overlay;
        return overlay;
    }

    function openHtmlModal(prefill) {
        var modal = ensureHtmlModal();
        var input = modal.querySelector('#newsHtmlSourceInput');
        if (input) {
            var current = '';
            try { current = quillInstance ? String(quillInstance.root.innerHTML || '').trim() : ''; } catch (e) {}
            var recovered = extractEscapedHtmlFromQuillHtml(current);
            input.value = prefill != null ? String(prefill) : (recovered || '');
        }
        modal.hidden = false;
        if (input) {
            setTimeout(function() {
                input.focus();
                input.select();
            }, 0);
        }
    }

    function closeHtmlModal() {
        if (!htmlModalEl) return;
        htmlModalEl.hidden = true;
    }

    function bindHtmlPasteSupport(quill) {
        if (!quill || !quill.root) return;
        quill.root.addEventListener('paste', function(e) {
            try {
                var cd = e.clipboardData;
                if (!cd) return;
                var htmlClip = cd.getData('text/html');
                var textClip = cd.getData('text/plain');
                // Копирование из браузера/Word даёт text/html — оставляем стандартный paste Quill.
                if (htmlClip && /<[a-z][\s\S]*>/i.test(htmlClip)) return;
                var candidate = String(textClip || '').trim();
                if (!candidate) return;
                if (candidate.indexOf('&lt;') >= 0 && looksLikeHtmlSource(decodeBasicEntities(candidate))) {
                    candidate = decodeBasicEntities(candidate);
                }
                if (!looksLikeHtmlSource(candidate)) return;
                e.preventDefault();
                e.stopPropagation();
                var range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
                if (range.length) quill.deleteText(range.index, range.length, 'user');
                quill.clipboard.dangerouslyPasteHTML(range.index, candidate, 'user');
            } catch (err) {}
        }, true);
    }

    function initQuill() {
        var container = document.getElementById('productUpdateBodyEditor');
        if (!container || typeof Quill === 'undefined') return null;

        var toolbarOptions = [
            [{ header: [1, 2, 3, false] }],
            [{ size: ['small', false, 'large', 'huge'] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['blockquote', 'link'],
            ['image', 'video'],
            ['clean']
        ];

        quillInstance = new Quill(container, {
            theme: 'snow',
            placeholder: 'Текст новости: форматирование, картинки, видео, файлы… Или кнопка «HTML».',
            modules: {
                toolbar: {
                    container: toolbarOptions,
                    handlers: {
                        image: imageHandler,
                        video: function() {
                            var url = window.prompt('Ссылка на видео (YouTube, Vimeo, Rutube):');
                            if (!url) return;
                            var range = quillInstance.getSelection(true);
                            quillInstance.insertEmbed(range.index, 'video', url.trim(), 'user');
                            quillInstance.setSelection(range.index + 1);
                        }
                    }
                }
            }
        });

        bindHtmlPasteSupport(quillInstance);

        var videoBtn = document.getElementById('newsEditorUploadVideoBtn');
        var fileBtn = document.getElementById('newsEditorUploadFileBtn');
        var htmlBtn = document.getElementById('newsEditorHtmlBtn');
        if (videoBtn) videoBtn.addEventListener('click', videoFileHandler);
        if (fileBtn) fileBtn.addEventListener('click', fileHandler);
        if (htmlBtn) htmlBtn.addEventListener('click', function() { openHtmlModal(); });

        return quillInstance;
    }

    window.NewsEditor = {
        init: function() {
            if (!quillInstance) initQuill();
            return quillInstance;
        },
        getHtml: function() {
            if (!quillInstance) {
                var legacy = document.getElementById('productUpdateBody');
                return legacy ? legacy.value.trim() : '';
            }
            var html = String(quillInstance.root.innerHTML || '').trim();
            var recovered = extractEscapedHtmlFromQuillHtml(html);
            // Если пользователь вставил HTML как текст — при сохранении
            // автоматически превращаем в настоящую разметку.
            if (recovered) {
                setEditorHtml(recovered, 'silent');
                html = String(quillInstance.root.innerHTML || '').trim();
            }
            return html;
        },
        setHtml: function(html) {
            if (!quillInstance) {
                var legacy = document.getElementById('productUpdateBody');
                if (legacy) legacy.value = html || '';
                return;
            }
            setEditorHtml(html, 'silent');
        },
        openHtmlSource: function(prefill) {
            if (!quillInstance) this.init();
            openHtmlModal(prefill);
        },
        clear: function() {
            this.setHtml('');
        },
        isReady: function() {
            return !!quillInstance;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { window.NewsEditor.init(); });
    } else {
        window.NewsEditor.init();
    }
})();
