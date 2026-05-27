(function() {
    var CHAT_POLL_MS = 5000;
    var STICKER_MAX_BYTES = 2 * 1024 * 1024;
    var GIF_MAX_BYTES = 8 * 1024 * 1024;
    var FILE_MAX_BYTES = 15 * 1024 * 1024;
    var panelOpen = false;
    var attachPickerOpen = false;
    var activeAttachTab = 'emoji';
    var knownMessageIds = {};
    var pollTimer = null;
    var unreadCount = 0;
    var mediaCache = { sticker: null, gif: null };

    function getChatSeenStorageKey() {
        var orgId = (typeof currentUser !== 'undefined' && currentUser && currentUser.organizationId != null)
            ? String(currentUser.organizationId) : 'default';
        return 'networkMap:orgChatLastSeenAt:' + orgId;
    }

    function getLastChatSeenAt() {
        try {
            if (typeof localStorage === 'undefined') return null;
            var raw = localStorage.getItem(getChatSeenStorageKey());
            if (!raw) return null;
            var dt = new Date(raw);
            return isNaN(dt.getTime()) ? null : dt;
        } catch (e) {
            return null;
        }
    }

    function setLastChatSeenAt(date) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(getChatSeenStorageKey(), (date || new Date()).toISOString());
        } catch (e) {}
    }

    function isMessageUnread(msg) {
        if (!msg || !msg.createdAt) return false;
        var uid = getCurrentUserId();
        if (uid && msg.userId != null && String(msg.userId) === uid) return false;
        var lastSeen = getLastChatSeenAt();
        if (!lastSeen) return false;
        var created = new Date(msg.createdAt);
        return !isNaN(created.getTime()) && created > lastSeen;
    }

    function recalcUnreadFromMessages(messages) {
        if (panelOpen) {
            unreadCount = 0;
            updateUnreadBadge();
            return;
        }
        if (!Array.isArray(messages)) return;
        unreadCount = messages.filter(isMessageUnread).length;
        updateUnreadBadge();
    }

    /** Первый визит: не помечаем всю историю непрочитанной, фиксируем «уже видел». */
    function ensureChatSeenBaseline(messages) {
        if (getLastChatSeenAt()) return;
        if (!Array.isArray(messages) || !messages.length) {
            setLastChatSeenAt(new Date());
            return;
        }
        var latest = 0;
        messages.forEach(function(m) {
            if (!m || !m.createdAt) return;
            var t = new Date(m.createdAt).getTime();
            if (!isNaN(t) && t > latest) latest = t;
        });
        setLastChatSeenAt(latest ? new Date(latest) : new Date());
    }

    var CHAT_EMOJIS = [
        '😀', '😊', '🙂', '😉', '😍', '🥳', '😎', '🤔', '😅', '😢', '😮', '🙏', '👍', '👎', '👏', '🙌', '💪', '✅', '❌', '⚠️',
        '❤️', '🔥', '⭐', '💡', '🎉', '☕', '📌', '📎', '📝', '📞', '📧', '📅', '⏰', '🔔', '🔍', '💬', '🗺️', '📡', '🛰️',
        '🖥️', '💻', '📱', '🔌', '🔗', '⚡', '🌐', '🏢', '🏠', '🚧', '🔧', '🔨', '🛠️', '📦', '🚀', '✨', '💯', '❓', '❗', '🆗'
    ];

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getCurrentUserId() {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.userId != null) {
            return String(currentUser.userId);
        }
        return null;
    }

    function isOrgAdmin() {
        return typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin';
    }

    function getAuthMediaSrc(url) {
        if (!url) return '';
        var base = (typeof getApiBase === 'function' ? getApiBase() : '') || '';
        var path = url.charAt(0) === '/' ? url : '/' + url;
        var full = base ? (base.replace(/\/$/, '') + path) : path;
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (token) full += (full.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
        return full;
    }

    function formatFileSize(bytes) {
        var n = Number(bytes);
        if (!n || n < 0 || isNaN(n)) return '';
        if (n < 1024) return n + ' Б';
        if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.0', '') + ' КБ';
        return (n / (1024 * 1024)).toFixed(1).replace('.0', '') + ' МБ';
    }

    function isImageMessage(msg) {
        if (!msg || !msg.mediaId) return false;
        if (msg.mediaKind === 'sticker' || msg.mediaKind === 'gif') return true;
        if (msg.mediaKind === 'file') {
            if (msg.mediaMime && String(msg.mediaMime).indexOf('image/') === 0) return true;
            if (msg.mediaExt && /\.(jpe?g|png|gif|webp)$/i.test(msg.mediaExt)) return true;
        }
        return false;
    }

    function getFileIcon(ext) {
        var e = String(ext || '').toLowerCase();
        if (e === '.pdf') return '📄';
        if (e === '.doc' || e === '.docx') return '📝';
        if (e === '.xls' || e === '.xlsx') return '📊';
        if (e === '.ppt' || e === '.pptx') return '📽️';
        if (e === '.zip' || e === '.rar' || e === '.7z') return '🗜️';
        if (e === '.txt' || e === '.csv' || e === '.rtf') return '📃';
        return '📎';
    }

    function formatChatTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var now = new Date();
        var time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === now.toDateString()) return time;
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + time;
    }

    function scrollMessagesToBottom() {
        var list = document.getElementById('orgChatMessages');
        if (list) list.scrollTop = list.scrollHeight;
    }

    function buildMessageBodyHtml(msg) {
        var html = '';
        if (msg.mediaId || msg.mediaUrl) {
            var src = getAuthMediaSrc(msg.mediaUrl || ('/api/chat/media/file/' + encodeURIComponent(msg.mediaId)));
            if (isImageMessage(msg)) {
                var imgClass = 'org-chat-message-img';
                if (msg.mediaKind === 'gif') imgClass += ' org-chat-message-img--gif';
                else if (msg.mediaKind === 'sticker') imgClass += ' org-chat-message-img--sticker';
                else imgClass += ' org-chat-message-img--file-image';
                html += '<div class="org-chat-message-media"><img src="' + escapeHtml(src) + '" alt="" loading="lazy" class="' + imgClass + '"></div>';
            } else {
                var fileName = escapeHtml(msg.mediaName || ('Файл' + (msg.mediaExt || '')));
                var sizeStr = msg.mediaSize != null ? formatFileSize(msg.mediaSize) : '';
                var icon = getFileIcon(msg.mediaExt);
                html += '<a class="org-chat-file-card" href="' + escapeHtml(src) + '" download target="_blank" rel="noopener noreferrer">' +
                    '<span class="org-chat-file-card-icon" aria-hidden="true">' + icon + '</span>' +
                    '<span class="org-chat-file-card-info">' +
                        '<span class="org-chat-file-card-name">' + fileName + '</span>' +
                        (sizeStr ? '<span class="org-chat-file-card-size">' + escapeHtml(sizeStr) + '</span>' : '') +
                    '</span>' +
                '</a>';
            }
        }
        if (msg.text) {
            html += '<div class="org-chat-message-text">' + escapeHtml(msg.text) + '</div>';
        }
        return html || '<div class="org-chat-message-text org-chat-message-text--empty">—</div>';
    }

    function renderMessage(msg, options) {
        options = options || {};
        if (!msg || !msg.id) return;
        if (knownMessageIds[msg.id] && !options.force) return;
        knownMessageIds[msg.id] = true;

        var list = document.getElementById('orgChatMessages');
        if (!list) return;

        var empty = list.querySelector('.org-chat-empty');
        if (empty) empty.remove();

        var isOwn = getCurrentUserId() && msg.userId != null && String(msg.userId) === getCurrentUserId();
        var el = document.createElement('div');
        el.className = 'org-chat-message' + (isOwn ? ' org-chat-message--own' : '');
        if (msg.mediaId) el.classList.add('org-chat-message--media');
        el.dataset.messageId = msg.id;
        el.innerHTML =
            '<div class="org-chat-message-meta">' +
                '<span class="org-chat-message-author">' + escapeHtml(msg.userName || 'Участник') + '</span>' +
                '<time class="org-chat-message-time" datetime="' + escapeHtml(msg.createdAt || '') + '">' +
                    escapeHtml(formatChatTime(msg.createdAt)) +
                '</time>' +
            '</div>' +
            buildMessageBodyHtml(msg);
        list.appendChild(el);

        if (options.scroll !== false) scrollMessagesToBottom();
    }

    function renderMessages(messages, replace) {
        if (!Array.isArray(messages)) return;
        if (replace) {
            knownMessageIds = {};
            var list = document.getElementById('orgChatMessages');
            if (list) list.innerHTML = '';
        }
        messages.forEach(function(m) { renderMessage(m, { scroll: false }); });
        scrollMessagesToBottom();
    }

    function updateUnreadBadge() {
        var badge = document.getElementById('orgChatBadge');
        if (!badge) return;
        if (unreadCount > 0 && !panelOpen) {
            badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
            badge.textContent = '';
        }
    }

    function onIncomingMessage(msg) {
        var wasKnown = msg && msg.id && knownMessageIds[msg.id];
        renderMessage(msg);
        if (!wasKnown && !panelOpen && isMessageUnread(msg)) {
            unreadCount++;
            updateUnreadBadge();
        }
    }

    function loadHistory() {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') return Promise.resolve();
        return fetch(getApiBase() + '/api/chat?limit=100', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                if (body && Array.isArray(body.messages)) {
                    renderMessages(body.messages, true);
                }
            })
            .catch(function() {});
    }

    function setSendEnabled(enabled) {
        var input = document.getElementById('orgChatInput');
        var btn = document.getElementById('orgChatSend');
        if (input) input.disabled = !enabled;
        if (btn) btn.disabled = !enabled;
    }

    function sendChatPayload(payload) {
        setSendEnabled(false);
        var sent = false;
        if (typeof window.syncSendChat === 'function') {
            sent = window.syncSendChat(payload);
        }
        if (sent) {
            setSendEnabled(true);
            return Promise.resolve({ ok: true });
        }

        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        return fetch(getApiBase() + '/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify(payload)
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                if (body && body.message) onIncomingMessage(body.message);
                else if (body && body.error && typeof window.showWarning === 'function') {
                    window.showWarning(body.error, 'Чат');
                }
                return body;
            })
            .catch(function() {
                if (typeof window.showWarning === 'function') {
                    window.showWarning('Не удалось отправить сообщение', 'Чат');
                }
            })
            .finally(function() {
                setSendEnabled(true);
            });
    }

    function sendMessage() {
        var input = document.getElementById('orgChatInput');
        if (!input) return;
        var text = input.value.trim();
        if (!text) return;

        sendChatPayload({ text: text }).then(function() {
            input.value = '';
            input.focus();
        });
    }

    function sendMediaMessage(mediaId, optionalText) {
        if (!mediaId) return;
        closeAttachPicker();
        var payload = { mediaId: mediaId };
        if (optionalText) payload.text = optionalText;
        sendChatPayload(payload);
    }

    function uploadFileAndSend(file) {
        if (!file) return;
        if (file.size > FILE_MAX_BYTES) {
            if (typeof window.showWarning === 'function') {
                window.showWarning('Файл слишком большой (макс. 15 МБ)', 'Чат');
            }
            return;
        }

        var input = document.getElementById('orgChatInput');
        var caption = input && input.value ? input.value.trim() : '';
        setSendEnabled(false);

        readFileAsDataUrl(file).then(function(dataUrl) {
            var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            return fetch(getApiBase() + '/api/chat/media', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    kind: 'file',
                    name: file.name.slice(0, 120),
                    dataUrl: dataUrl
                })
            });
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                if (body && body.ok && body.media) {
                    if (input) input.value = '';
                    return sendChatPayload({
                        mediaId: body.media.id,
                        text: caption || undefined
                    });
                }
                if (body && body.error && typeof window.showWarning === 'function') {
                    window.showWarning(body.error, 'Чат');
                }
            })
            .catch(function() {
                if (typeof window.showWarning === 'function') {
                    window.showWarning('Не удалось прикрепить файл', 'Чат');
                }
            })
            .finally(function() {
                setSendEnabled(true);
                if (input) input.focus();
            });
    }

    function startPolling() {
        stopPolling();
        if (window.syncIsConnected) return;
        pollTimer = setInterval(function() {
            if (panelOpen && !window.syncIsConnected) loadHistory();
        }, CHAT_POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function openPanel() {
        var panel = document.getElementById('orgChatPanel');
        var btn = document.getElementById('orgChatBtn');
        if (!panel) return;
        panel.classList.add('org-chat-panel--open');
        panel.setAttribute('aria-hidden', 'false');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        panelOpen = true;
        setLastChatSeenAt(new Date());
        unreadCount = 0;
        updateUnreadBadge();
        loadHistory().then(function() {
            scrollMessagesToBottom();
            startPolling();
        });
        var input = document.getElementById('orgChatInput');
        if (input) setTimeout(function() { input.focus(); }, 80);
    }

    function closePanel() {
        closeAttachPicker();
        var panel = document.getElementById('orgChatPanel');
        var btn = document.getElementById('orgChatBtn');
        if (!panel) return;
        if (panelOpen) setLastChatSeenAt(new Date());
        panel.classList.remove('org-chat-panel--open');
        panel.setAttribute('aria-hidden', 'true');
        if (btn) btn.setAttribute('aria-expanded', 'false');
        panelOpen = false;
        unreadCount = 0;
        updateUnreadBadge();
        stopPolling();
    }

    function insertEmojiAtCursor(emoji) {
        var input = document.getElementById('orgChatInput');
        if (!input || !emoji) return;
        var start = input.selectionStart != null ? input.selectionStart : input.value.length;
        var end = input.selectionEnd != null ? input.selectionEnd : start;
        var before = input.value.slice(0, start);
        var after = input.value.slice(end);
        var next = before + emoji + after;
        if (next.length > input.maxLength) next = next.slice(0, input.maxLength);
        input.value = next;
        var pos = Math.min(before.length + emoji.length, next.length);
        input.setSelectionRange(pos, pos);
        input.focus();
    }

    function closeAttachPicker() {
        var picker = document.getElementById('orgChatEmojiPicker');
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        if (picker) picker.hidden = true;
        if (attachBtn) attachBtn.setAttribute('aria-expanded', 'false');
        attachPickerOpen = false;
    }

    function toggleAttachPicker() {
        var picker = document.getElementById('orgChatEmojiPicker');
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        if (!picker) return;
        attachPickerOpen = !attachPickerOpen;
        picker.hidden = !attachPickerOpen;
        if (attachBtn) attachBtn.setAttribute('aria-expanded', attachPickerOpen ? 'true' : 'false');
        if (attachPickerOpen) {
            if (activeAttachTab === 'sticker') loadMediaLibrary('sticker');
            else if (activeAttachTab === 'gif') loadMediaLibrary('gif');
            var input = document.getElementById('orgChatInput');
            if (input) input.focus();
        }
    }

    function switchAttachTab(tab) {
        activeAttachTab = tab;
        var tabs = document.querySelectorAll('.org-chat-attach-tab');
        tabs.forEach(function(btn) {
            var isActive = btn.getAttribute('data-tab') === tab;
            btn.classList.toggle('org-chat-attach-tab--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        ['emoji', 'sticker', 'gif'].forEach(function(name) {
            var panel = document.getElementById('orgChatAttach' + name.charAt(0).toUpperCase() + name.slice(1));
            if (panel) panel.hidden = name !== tab;
        });
        if (tab === 'sticker') loadMediaLibrary('sticker');
        if (tab === 'gif') loadMediaLibrary('gif');
    }

    function getMediaGridId(kind) {
        return kind === 'gif' ? 'orgChatGifGrid' : 'orgChatStickerGrid';
    }

    function canDeleteMedia(item) {
        if (!item) return false;
        var uid = getCurrentUserId();
        if (uid && item.uploadedBy != null && String(item.uploadedBy) === uid) return true;
        return isOrgAdmin();
    }

    function renderMediaGrid(kind, items) {
        var grid = document.getElementById(getMediaGridId(kind));
        if (!grid) return;
        grid.innerHTML = '';
        if (!items || !items.length) {
            grid.innerHTML = '<p class="org-chat-media-empty">Пока нет файлов. Загрузите свой.</p>';
            return;
        }
        items.forEach(function(item) {
            var wrap = document.createElement('div');
            wrap.className = 'org-chat-media-item-wrap';

            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'org-chat-media-item';
            btn.setAttribute('aria-label', 'Отправить ' + (kind === 'gif' ? 'GIF' : 'стикер'));
            var img = document.createElement('img');
            img.src = getAuthMediaSrc(item.url);
            img.alt = item.name || '';
            img.loading = 'lazy';
            btn.appendChild(img);
            btn.addEventListener('click', function() {
                sendMediaMessage(item.id);
            });

            wrap.appendChild(btn);

            if (canDeleteMedia(item)) {
                var del = document.createElement('button');
                del.type = 'button';
                del.className = 'org-chat-media-delete';
                del.title = 'Удалить';
                del.setAttribute('aria-label', 'Удалить');
                del.textContent = '×';
                del.addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteMedia(item.id, kind);
                });
                wrap.appendChild(del);
            }

            grid.appendChild(wrap);
        });
    }

    function loadMediaLibrary(kind, force) {
        if (!force && mediaCache[kind]) {
            renderMediaGrid(kind, mediaCache[kind]);
            return Promise.resolve();
        }
        var grid = document.getElementById(getMediaGridId(kind));
        if (grid) grid.innerHTML = '<p class="org-chat-media-empty">Загрузка…</p>';

        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') return Promise.resolve();

        return fetch(getApiBase() + '/api/chat/media?kind=' + encodeURIComponent(kind), {
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                var items = (body && Array.isArray(body.media)) ? body.media : [];
                mediaCache[kind] = items;
                renderMediaGrid(kind, items);
            })
            .catch(function() {
                if (grid) grid.innerHTML = '<p class="org-chat-media-empty">Не удалось загрузить</p>';
            });
    }

    function readFileAsDataUrl(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function uploadMediaFile(file, kind) {
        if (!file) return;
        var maxBytes = kind === 'gif' ? GIF_MAX_BYTES : STICKER_MAX_BYTES;
        if (file.size > maxBytes) {
            var mb = kind === 'gif' ? '8' : '2';
            if (typeof window.showWarning === 'function') {
                window.showWarning('Файл слишком большой (макс. ' + mb + ' МБ)', 'Чат');
            }
            return;
        }
        if (kind === 'gif' && file.type !== 'image/gif') {
            if (typeof window.showWarning === 'function') window.showWarning('Для GIF нужен файл .gif', 'Чат');
            return;
        }

        readFileAsDataUrl(file).then(function(dataUrl) {
            var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
            return fetch(getApiBase() + '/api/chat/media', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({
                    kind: kind,
                    name: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
                    dataUrl: dataUrl
                })
            });
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                if (body && body.ok && body.media) {
                    mediaCache[kind] = null;
                    loadMediaLibrary(kind, true);
                    if (typeof window.showSuccess === 'function') {
                        window.showSuccess(kind === 'gif' ? 'GIF добавлен' : 'Стикер добавлен', 'Чат');
                    }
                } else if (body && body.error && typeof window.showWarning === 'function') {
                    window.showWarning(body.error, 'Чат');
                }
            })
            .catch(function() {
                if (typeof window.showWarning === 'function') {
                    window.showWarning('Не удалось загрузить файл', 'Чат');
                }
            });
    }

    function deleteMedia(mediaId, kind) {
        if (!mediaId) return;
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        fetch(getApiBase() + '/api/chat/media/' + encodeURIComponent(mediaId), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                if (body && body.ok) {
                    mediaCache[kind] = null;
                    loadMediaLibrary(kind, true);
                } else if (body && body.error && typeof window.showWarning === 'function') {
                    window.showWarning(body.error, 'Чат');
                }
            })
            .catch(function() {
                if (typeof window.showWarning === 'function') {
                    window.showWarning('Не удалось удалить', 'Чат');
                }
            });
    }

    function buildEmojiGrid() {
        var grid = document.getElementById('orgChatEmojiGrid');
        if (!grid || grid.childElementCount > 0) return;
        CHAT_EMOJIS.forEach(function(emoji) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'org-chat-emoji-item';
            btn.textContent = emoji;
            btn.setAttribute('aria-label', 'Вставить ' + emoji);
            btn.addEventListener('click', function() {
                insertEmojiAtCursor(emoji);
            });
            grid.appendChild(btn);
        });
    }

    function togglePanel() {
        if (panelOpen) closePanel();
        else openPanel();
    }

    function init() {
        var btn = document.getElementById('orgChatBtn');
        var closeBtn = document.getElementById('orgChatClose');
        var sendBtn = document.getElementById('orgChatSend');
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        var input = document.getElementById('orgChatInput');
        var stickerUpload = document.getElementById('orgChatStickerUpload');
        var gifUpload = document.getElementById('orgChatGifUpload');
        var fileAttach = document.getElementById('orgChatFileAttach');

        buildEmojiGrid();

        document.querySelectorAll('.org-chat-attach-tab').forEach(function(tabBtn) {
            tabBtn.addEventListener('click', function() {
                switchAttachTab(tabBtn.getAttribute('data-tab') || 'emoji');
            });
        });

        if (btn) btn.addEventListener('click', togglePanel);
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        if (attachBtn) attachBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleAttachPicker();
        });
        if (input) {
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
        }
        if (stickerUpload) {
            stickerUpload.addEventListener('change', function() {
                var file = stickerUpload.files && stickerUpload.files[0];
                uploadMediaFile(file, 'sticker');
                stickerUpload.value = '';
            });
        }
        if (gifUpload) {
            gifUpload.addEventListener('change', function() {
                var file = gifUpload.files && gifUpload.files[0];
                uploadMediaFile(file, 'gif');
                gifUpload.value = '';
            });
        }
        if (fileAttach) {
            fileAttach.addEventListener('change', function() {
                var file = fileAttach.files && fileAttach.files[0];
                uploadFileAndSend(file);
                fileAttach.value = '';
            });
        }

        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape') return;
            if (attachPickerOpen) {
                e.preventDefault();
                closeAttachPicker();
                return;
            }
            if (panelOpen) closePanel();
        });

        document.addEventListener('click', function(e) {
            if (!attachPickerOpen) return;
            var picker = document.getElementById('orgChatEmojiPicker');
            if (picker && picker.contains(e.target)) return;
            if (attachBtn && attachBtn.contains(e.target)) return;
            closeAttachPicker();
        });
    }

    window.orgChatOnMessage = onIncomingMessage;
    window.orgChatOnHistory = function(messages) {
        if (panelOpen) {
            renderMessages(messages, true);
            return;
        }
        if (Array.isArray(messages)) {
            messages.forEach(function(m) {
                if (m && m.id) knownMessageIds[m.id] = true;
            });
            ensureChatSeenBaseline(messages);
            recalcUnreadFromMessages(messages);
        }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
