/**
 * Rich-text редактор новостей (Quill) для site-admin.
 */
(function() {
    var quillInstance = null;
    var uploadInProgress = false;

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

    function plainTextToHtml(text) {
        var trimmed = String(text || '').trim();
        if (!trimmed) return '';
        if (trimmed.indexOf('<') >= 0) return trimmed;
        return trimmed.split(/\n\n+/).map(function(block) {
            return '<p>' + block.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') + '</p>';
        }).join('');
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
            placeholder: 'Текст новости: форматирование, картинки, видео, файлы…',
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

        var videoBtn = document.getElementById('newsEditorUploadVideoBtn');
        var fileBtn = document.getElementById('newsEditorUploadFileBtn');
        if (videoBtn) videoBtn.addEventListener('click', videoFileHandler);
        if (fileBtn) fileBtn.addEventListener('click', fileHandler);

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
            return String(quillInstance.root.innerHTML || '').trim();
        },
        setHtml: function(html) {
            if (!quillInstance) {
                var legacy = document.getElementById('productUpdateBody');
                if (legacy) legacy.value = html || '';
                return;
            }
            var content = plainTextToHtml(html || '');
            if (quillInstance.clipboard && quillInstance.clipboard.dangerouslyPasteHTML) {
                quillInstance.setText('');
                quillInstance.clipboard.dangerouslyPasteHTML(0, content, 'silent');
            } else {
                quillInstance.root.innerHTML = content;
            }
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
