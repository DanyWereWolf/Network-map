(function() {
    var CHAT_POLL_MS = 5000;
    var CHAT_POLL_HIDDEN_MS = 12000;
    var CHAT_POLL_BACKGROUND_MS = 15000;
    var STICKER_MAX_BYTES = 2 * 1024 * 1024;
    var GIF_MAX_BYTES = 8 * 1024 * 1024;
    var FILE_MAX_BYTES = 15 * 1024 * 1024;
    var panelOpen = false;
    var attachPickerOpen = false;
    var activeAttachTab = 'emoji';
    var knownMessageIds = {};
    var pollTimer = null;
    var backgroundWatchTimer = null;
    var unreadCount = 0;
    var mediaCache = { sticker: null, gif: null };
    var chatMembers = [];
    var membersLoading = false;
    var mentionQuery = '';
    var mentionActiveIndex = 0;
    var MENTION_LIST_LIMIT = 15;
    var mentionedNotifiedIds = {};
    var MOBILE_CHAT_MQ = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(max-width: 768px)')
        : null;

    function isMobileChat() {
        return MOBILE_CHAT_MQ ? MOBILE_CHAT_MQ.matches : false;
    }

    function syncChatMobileUi() {
        var panel = document.getElementById('orgChatPanel');
        if (panel) panel.classList.toggle('org-chat-panel--mobile', isMobileChat());
        syncChatInputPlaceholder();
    }

    function syncChatInputPlaceholder() {
        var input = document.getElementById('orgChatInput');
        if (!input) return;
        input.placeholder = isMobileChat()
            ? 'Сообщение…'
            : 'Сообщение… Enter — отправить';
    }

    function updateChatBackdrop() {
        var backdrop = document.getElementById('orgChatBackdrop');
        if (!backdrop) return;
        var show = isMobileChat() && panelOpen;
        backdrop.hidden = !show;
        backdrop.setAttribute('aria-hidden', show ? 'false' : 'true');
        backdrop.classList.toggle('org-chat-backdrop--visible', show);
    }

    function updateChatBodyLock() {
        if (typeof document === 'undefined' || !document.body) return;
        if (isMobileChat() && panelOpen) {
            document.body.classList.add('org-chat-mobile-open');
        } else {
            document.body.classList.remove('org-chat-mobile-open');
        }
    }

    function syncChatOpenState() {
        updateChatBackdrop();
        updateChatBodyLock();
    }

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

    function getMemberById(userId) {
        if (userId == null) return null;
        return chatMembers.find(function(m) { return m && String(m.id) === String(userId); }) || null;
    }

    function getAvatarSrc(avatarUrl) {
        if (!avatarUrl) return '';
        if (typeof getAvatarImageSrc === 'function') return getAvatarImageSrc(avatarUrl);
        return getAuthMediaSrc(avatarUrl);
    }

    function getDisplayInitial(name) {
        return String(name || '?').charAt(0).toUpperCase() || '?';
    }

    function buildAvatarHtml(msg) {
        var member = getMemberById(msg.userId);
        var avatarUrl = msg.avatarUrl || (member && member.avatarUrl);
        var name = msg.userName || (member && (member.fullName || member.username)) || '?';
        if (avatarUrl && getAvatarSrc(avatarUrl)) {
            return '<div class="org-chat-message-avatar"><img src="' + escapeHtml(getAvatarSrc(avatarUrl)) + '" alt=""></div>';
        }
        return '<div class="org-chat-message-avatar" aria-hidden="true">' + escapeHtml(getDisplayInitial(name)) + '</div>';
    }

    function isMentionedInMessage(msg) {
        var uid = getCurrentUserId();
        if (!uid || !msg || !Array.isArray(msg.mentions)) return false;
        return msg.mentions.some(function(m) { return m && String(m.userId) === uid; });
    }

    function getChatNotifAskedStorageKey() {
        return 'networkMap:chatNotifPermissionAsked';
    }

    function canUseChatBrowserNotifications() {
        return typeof Notification !== 'undefined' && Notification.permission === 'granted';
    }

    function getChatNotificationIcon() {
        var origin = (typeof window !== 'undefined' && window.location && window.location.origin)
            ? window.location.origin
            : '';
        if (origin) return origin + '/icons/chat-notification-192.png';
        return '/icons/chat-notification-192.png';
    }

    function buildMentionPreview(msg) {
        if (!msg) return 'Сообщение';
        if (msg.text) return String(msg.text).trim().slice(0, 120);
        if (msg.mediaKind === 'sticker') return 'Стикер';
        if (msg.mediaKind === 'gif') return 'GIF';
        if (msg.mediaId || msg.mediaUrl) return 'Вложение';
        return 'Сообщение';
    }

    function wasMentionNotified(msg) {
        return !!(msg && msg.id && mentionedNotifiedIds[msg.id]);
    }

    function markMentionNotified(msg) {
        if (msg && msg.id) mentionedNotifiedIds[msg.id] = true;
    }

    function storeChatNotificationPermissionResult(result) {
        try {
            if (typeof localStorage !== 'undefined' && result) {
                localStorage.setItem(getChatNotifAskedStorageKey(), result);
            }
        } catch (e) {}
    }

    function requestChatNotificationPermission() {
        if (typeof Notification === 'undefined') {
            return Promise.resolve('unsupported');
        }
        if (Notification.permission !== 'default') {
            return Promise.resolve(Notification.permission);
        }
        try {
            return Notification.requestPermission().then(function(result) {
                storeChatNotificationPermissionResult(result);
                return result;
            });
        } catch (e) {
            return Promise.resolve('denied');
        }
    }

    /** @param {{ force?: boolean }} opts — force: запрос по клику (открытие чата) */
    function ensureChatNotificationPermission(opts) {
        opts = opts || {};
        if (typeof Notification === 'undefined') {
            return Promise.resolve('unsupported');
        }
        if (Notification.permission !== 'default') {
            return Promise.resolve(Notification.permission);
        }
        if (!opts.force) {
            try {
                var stored = typeof localStorage !== 'undefined'
                    ? localStorage.getItem(getChatNotifAskedStorageKey())
                    : null;
                if (stored === 'denied') return Promise.resolve('denied');
            } catch (e) {}
        }
        return requestChatNotificationPermission();
    }

    function showMentionBrowserNotification(msg, title, body) {
        if (!canUseChatBrowserNotifications()) return false;
        if (wasMentionNotified(msg)) return false;
        var opts = {
            body: body || buildMentionPreview(msg),
            icon: getChatNotificationIcon(),
            badge: getChatNotificationIcon(),
            tag: 'networkmap-org-chat-mention',
            renotify: true,
            requireInteraction: false
        };
        try {
            var notification = new Notification(title || 'Упоминание в чате', opts);
            notification.onclick = function() {
                try {
                    window.focus();
                    notification.close();
                    openPanel();
                } catch (e) {}
            };
            markMentionNotified(msg);
            return true;
        } catch (e) {
            return false;
        }
    }

    function deliverMentionNotification(msg, title, body) {
        if (!msg || panelOpen) return;
        if (showMentionBrowserNotification(msg, title, body)) return;
        if (typeof showInfo === 'function') {
            showInfo((body || buildMentionPreview(msg)), title || 'Чат');
            markMentionNotified(msg);
        }
    }

    function notifyIfMentioned(msg) {
        if (!msg || !isMentionedInMessage(msg)) return;
        var uid = getCurrentUserId();
        if (uid && msg.userId != null && String(msg.userId) === uid) return;
        if (panelOpen) return;
        if (wasMentionNotified(msg)) return;

        var who = msg.userName || 'Участник';
        var title = who + ' упомянул(а) вас';
        var body = buildMentionPreview(msg);

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            ensureChatNotificationPermission().then(function() {
                if (!wasMentionNotified(msg)) deliverMentionNotification(msg, title, body);
            });
            return;
        }
        deliverMentionNotification(msg, title, body);
    }

    /** Уведомление об упоминаниях, пока пользователь был офлайн. */
    function notifyPendingMentions(messages) {
        if (panelOpen || !Array.isArray(messages) || !messages.length) return;
        var uid = getCurrentUserId();
        if (!uid) return;
        var pending = messages.filter(function(m) {
            if (!m || !isMentionedInMessage(m)) return false;
            if (m.userId != null && String(m.userId) === uid) return false;
            if (!isMessageUnread(m)) return false;
            return !wasMentionNotified(m);
        });
        if (!pending.length) return;

        var latest = pending[pending.length - 1];
        var who = latest.userName || 'Участник';
        var title = 'Чат команды';
        var body = pending.length === 1
            ? who + ' упомянул(а) вас: ' + buildMentionPreview(latest)
            : who + ' и ещё ' + (pending.length - 1) + ' — упоминания в чате';

        function send() {
            if (!showMentionBrowserNotification(latest, title, body) && typeof showInfo === 'function') {
                showInfo(body, title);
            }
            pending.forEach(markMentionNotified);
        }

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            ensureChatNotificationPermission().then(send);
            return;
        }
        send();
    }

    function formatMessageTextHtml(msg) {
        if (!msg || !msg.text) return '';
        var text = escapeHtml(msg.text);
        var tokens = {};
        if (Array.isArray(msg.mentions)) {
            msg.mentions.forEach(function(m) {
                if (m && m.username) tokens[String(m.username).toLowerCase()] = true;
            });
        }
        return text.replace(/@([a-zA-Z0-9_.\u0400-\u04FF-]+)/g, function(match, name) {
            if (tokens[name.toLowerCase()]) {
                return '<span class="org-chat-mention">' + match + '</span>';
            }
            return match;
        });
    }

    function loadChatMembers() {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') return Promise.resolve();
        if (membersLoading) {
            return new Promise(function(resolve) {
                var t = setInterval(function() {
                    if (!membersLoading) { clearInterval(t); resolve(); }
                }, 50);
            });
        }
        membersLoading = true;
        return fetch(getApiBase() + '/api/chat/members', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                chatMembers = (body && Array.isArray(body.members)) ? body.members : [];
            })
            .catch(function() { chatMembers = []; })
            .finally(function() {
                membersLoading = false;
            });
    }

    function setMentionListExpanded(open) {
        var input = document.getElementById('orgChatInput');
        if (input) input.setAttribute('aria-expanded', open ? 'true' : 'false');
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
            html += '<div class="org-chat-message-text">' + formatMessageTextHtml(msg) + '</div>';
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
        if (isMentionedInMessage(msg)) el.classList.add('org-chat-message--mention-me');
        el.dataset.messageId = msg.id;
        var timeStr = escapeHtml(formatChatTime(msg.createdAt));
        var timeIso = escapeHtml(msg.createdAt || '');
        var metaHtml = isOwn
            ? ''
            : '<div class="org-chat-message-meta"><span class="org-chat-message-author">' +
                escapeHtml(msg.userName || 'Участник') + '</span></div>';
        el.innerHTML =
            buildAvatarHtml(msg) +
            '<div class="org-chat-message-col">' +
                metaHtml +
                '<div class="org-chat-message-bubble">' +
                    buildMessageBodyHtml(msg) +
                    '<time class="org-chat-message-time" datetime="' + timeIso + '">' + timeStr + '</time>' +
                '</div>' +
            '</div>';
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
        if (replace) {
            var listEl = document.getElementById('orgChatMessages');
            if (listEl && !listEl.querySelector('.org-chat-message')) {
                listEl.innerHTML =
                    '<div class="org-chat-empty">' +
                        '<span class="org-chat-empty-icon" aria-hidden="true">💬</span>' +
                        '<p class="org-chat-empty-title">Пока тихо</p>' +
                        '<p class="org-chat-empty-hint">Напишите первым или упомяните коллегу через @</p>' +
                    '</div>';
            }
        }
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
        if (!wasKnown) notifyIfMentioned(msg);
        if (!wasKnown && !panelOpen && isMessageUnread(msg)) {
            unreadCount++;
            updateUnreadBadge();
        }
    }

    function loadHistory() {
        return fetchChatMessages()
            .then(function(messages) {
                if (Array.isArray(messages)) renderMessages(messages, true);
            });
    }

    function fetchChatMessages() {
        var token = typeof getAuthToken === 'function' ? getAuthToken() : '';
        if (!token || typeof getApiBase !== 'function') return Promise.resolve(null);
        return fetch(getApiBase() + '/api/chat?limit=100', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
            .then(function(r) { return r.json(); })
            .then(function(body) {
                return (body && Array.isArray(body.messages)) ? body.messages : null;
            })
            .catch(function() { return null; });
    }

    function processChatMessagesFromPoll(messages) {
        if (!Array.isArray(messages)) return;
        if (panelOpen) {
            renderMessages(messages, true);
            return;
        }
        var hadNew = false;
        messages.forEach(function(m) {
            if (!m || !m.id) return;
            var known = !!knownMessageIds[m.id];
            knownMessageIds[m.id] = true;
            if (!known) {
                hadNew = true;
                notifyIfMentioned(m);
                if (isMessageUnread(m)) unreadCount++;
            }
        });
        if (hadNew) updateUnreadBadge();
    }

    function fetchChatForNotifications() {
        return fetchChatMessages().then(function(messages) {
            if (messages) processChatMessagesFromPoll(messages);
            return messages;
        });
    }

    function getBackgroundPollIntervalMs() {
        if (typeof document !== 'undefined' && document.hidden) return CHAT_POLL_HIDDEN_MS;
        if (panelOpen && !window.syncIsConnected) return CHAT_POLL_MS;
        return CHAT_POLL_BACKGROUND_MS;
    }

    function shouldRunBackgroundChatWatch() {
        return typeof getAuthToken === 'function' && !!getAuthToken();
    }

    function backgroundChatWatchTick() {
        if (!shouldRunBackgroundChatWatch()) return;
        if (panelOpen && window.syncIsConnected) return;
        fetchChatForNotifications();
    }

    function startBackgroundChatWatch() {
        stopBackgroundChatWatch();
        if (!shouldRunBackgroundChatWatch()) return;
        backgroundChatWatchTick();
        backgroundWatchTimer = setInterval(backgroundChatWatchTick, getBackgroundPollIntervalMs());
    }

    function stopBackgroundChatWatch() {
        if (backgroundWatchTimer) {
            clearInterval(backgroundWatchTimer);
            backgroundWatchTimer = null;
        }
    }

    function restartBackgroundChatWatch() {
        if (!shouldRunBackgroundChatWatch()) {
            stopBackgroundChatWatch();
            return;
        }
        startBackgroundChatWatch();
    }

    function setSendEnabled(enabled) {
        var input = document.getElementById('orgChatInput');
        if (input) input.disabled = !enabled;
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
        restartBackgroundChatWatch();
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
        syncChatOpenState();
        ensureChatNotificationPermission({ force: true });
        setLastChatSeenAt(new Date());
        unreadCount = 0;
        updateUnreadBadge();
        loadChatMembers();
        loadHistory().then(function() {
            scrollMessagesToBottom();
            startPolling();
        });
        if (!isMobileChat()) {
            var input = document.getElementById('orgChatInput');
            if (input) setTimeout(function() { input.focus(); }, 80);
        }
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
        syncChatOpenState();
        unreadCount = 0;
        updateUnreadBadge();
        restartBackgroundChatWatch();
    }

    function getMentionContext() {
        var input = document.getElementById('orgChatInput');
        if (!input) return null;
        var pos = input.selectionStart != null ? input.selectionStart : input.value.length;
        var before = input.value.slice(0, pos);
        var at = before.lastIndexOf('@');
        if (at < 0) return null;
        if (at > 0 && !/\s/.test(before.charAt(at - 1))) return null;
        var query = before.slice(at + 1);
        if (/\s/.test(query)) return null;
        return { start: at, end: pos, query: query };
    }

    function getFilteredMentionMembers() {
        var q = mentionQuery.toLowerCase();
        var uid = getCurrentUserId();
        return chatMembers.filter(function(m) {
            if (!m || uid && String(m.id) === uid) return false;
            if (!q) return true;
            var un = String(m.username || '').toLowerCase();
            var fn = String(m.fullName || '').toLowerCase();
            return un.indexOf(q) >= 0 || fn.indexOf(q) >= 0;
        });
    }

    function hideMentionList() {
        var list = document.getElementById('orgChatMentionList');
        if (list) list.hidden = true;
        mentionQuery = '';
        mentionActiveIndex = 0;
        setMentionListExpanded(false);
    }

    function renderMentionList() {
        var listEl = document.getElementById('orgChatMentionList');
        if (!listEl) return;

        if (membersLoading) {
            listEl.hidden = false;
            setMentionListExpanded(true);
            listEl.innerHTML = '<p class="org-chat-mention-hint">Загрузка участников…</p>';
            return;
        }

        var items = getFilteredMentionMembers().slice(0, MENTION_LIST_LIMIT);
        if (!chatMembers.length) {
            listEl.hidden = false;
            setMentionListExpanded(true);
            listEl.innerHTML = '<p class="org-chat-mention-hint">Участники не найдены</p>';
            return;
        }
        if (!items.length) {
            listEl.hidden = false;
            setMentionListExpanded(true);
            listEl.innerHTML = '<p class="org-chat-mention-hint">Никого не найдено. Уточните имя или логин.</p>';
            return;
        }

        listEl.hidden = false;
        setMentionListExpanded(true);
        listEl.innerHTML = '<p class="org-chat-mention-hint org-chat-mention-hint--title">Упомянуть участника</p>';
        items.forEach(function(m, idx) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'org-chat-mention-option' + (idx === mentionActiveIndex ? ' org-chat-mention-option--active' : '');
            btn.setAttribute('role', 'option');
            var ava = m.avatarUrl && getAvatarSrc(m.avatarUrl)
                ? '<img src="' + escapeHtml(getAvatarSrc(m.avatarUrl)) + '" alt="">'
                : escapeHtml(getDisplayInitial(m.fullName || m.username));
            btn.innerHTML =
                '<span class="org-chat-mention-option-avatar">' + ava + '</span>' +
                '<span><span class="org-chat-mention-option-name">' + escapeHtml(m.fullName || m.username) + '</span>' +
                '<span class="org-chat-mention-option-user">@' + escapeHtml(m.username) + '</span></span>';
            btn.addEventListener('mousedown', function(e) {
                e.preventDefault();
                insertMention(m);
            });
            listEl.appendChild(btn);
        });
    }

    function insertMention(member) {
        var input = document.getElementById('orgChatInput');
        var ctx = getMentionContext();
        if (!input || !ctx || !member) return;
        var insert = '@' + member.username + ' ';
        var next = input.value.slice(0, ctx.start) + insert + input.value.slice(ctx.end);
        if (next.length > input.maxLength) next = next.slice(0, input.maxLength);
        input.value = next;
        var pos = ctx.start + insert.length;
        input.setSelectionRange(pos, pos);
        hideMentionList();
        input.focus();
    }

    function updateMentionAutocomplete() {
        var ctx = getMentionContext();
        if (!ctx) {
            hideMentionList();
            return;
        }
        mentionQuery = ctx.query;
        mentionActiveIndex = 0;
        if (!chatMembers.length && !membersLoading) {
            loadChatMembers().then(function() { renderMentionList(); });
        } else {
            renderMentionList();
        }
    }

    function ensureMembersThenShowMentionList() {
        if (chatMembers.length) {
            updateMentionAutocomplete();
            return;
        }
        loadChatMembers().then(function() {
            updateMentionAutocomplete();
        });
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

    function syncAttachPickerLayout() {
        var compose = document.querySelector('.org-chat-compose');
        if (compose) compose.classList.toggle('org-chat-compose--picker-open', attachPickerOpen);
    }

    function closeAttachPicker() {
        var picker = document.getElementById('orgChatEmojiPicker');
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        if (picker) picker.hidden = true;
        if (attachBtn) attachBtn.setAttribute('aria-expanded', 'false');
        attachPickerOpen = false;
        syncAttachPickerLayout();
    }

    function toggleAttachPicker() {
        var picker = document.getElementById('orgChatEmojiPicker');
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        if (!picker) return;
        attachPickerOpen = !attachPickerOpen;
        picker.hidden = !attachPickerOpen;
        if (attachBtn) attachBtn.setAttribute('aria-expanded', attachPickerOpen ? 'true' : 'false');
        syncAttachPickerLayout();
        if (attachPickerOpen) {
            if (activeAttachTab === 'sticker') loadMediaLibrary('sticker');
            else if (activeAttachTab === 'gif') loadMediaLibrary('gif');
            if (!isMobileChat()) {
                var input = document.getElementById('orgChatInput');
                if (input) input.focus();
            }
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
        var attachBtn = document.getElementById('orgChatEmojiBtn');
        var input = document.getElementById('orgChatInput');
        var stickerUpload = document.getElementById('orgChatStickerUpload');
        var gifUpload = document.getElementById('orgChatGifUpload');
        var fileAttach = document.getElementById('orgChatFileAttach');

        buildEmojiGrid();
        syncChatMobileUi();
        if (MOBILE_CHAT_MQ) {
            var onMqChange = function() {
                syncChatMobileUi();
                syncChatOpenState();
            };
            if (typeof MOBILE_CHAT_MQ.addEventListener === 'function') {
                MOBILE_CHAT_MQ.addEventListener('change', onMqChange);
            } else if (typeof MOBILE_CHAT_MQ.addListener === 'function') {
                MOBILE_CHAT_MQ.addListener(onMqChange);
            }
        }

        var backdrop = document.getElementById('orgChatBackdrop');
        if (backdrop) {
            backdrop.addEventListener('click', function() {
                if (isMobileChat() && panelOpen) closePanel();
            });
        }

        document.querySelectorAll('.org-chat-attach-tab').forEach(function(tabBtn) {
            tabBtn.addEventListener('click', function() {
                switchAttachTab(tabBtn.getAttribute('data-tab') || 'emoji');
            });
        });

        if (btn) {
            btn.addEventListener('click', function() {
                if (!panelOpen && typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    ensureChatNotificationPermission({ force: true });
                }
                togglePanel();
            });
        }
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        if (attachBtn) attachBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleAttachPicker();
        });
        if (typeof getAuthToken === 'function' && getAuthToken()) {
            loadChatMembers();
            checkOfflineMentions();
            startBackgroundChatWatch();
        }

        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                fetchChatForNotifications();
                if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                    ensureChatNotificationPermission({ force: false });
                }
            }
            restartBackgroundChatWatch();
        });

        window.addEventListener('focus', function() {
            fetchChatForNotifications();
        });
        if (input) {
            input.addEventListener('input', updateMentionAutocomplete);
            input.addEventListener('keydown', function(e) {
                if (e.key === '@' || (e.key === '2' && e.shiftKey) || (e.code === 'Digit2' && e.shiftKey)) {
                    setTimeout(ensureMembersThenShowMentionList, 0);
                }
                var listEl = document.getElementById('orgChatMentionList');
                var mentionOpen = listEl && !listEl.hidden;
                if (mentionOpen) {
                    var items = getFilteredMentionMembers().slice(0, MENTION_LIST_LIMIT);
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        mentionActiveIndex = Math.min(mentionActiveIndex + 1, items.length - 1);
                        renderMentionList();
                        return;
                    }
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        mentionActiveIndex = Math.max(mentionActiveIndex - 1, 0);
                        renderMentionList();
                        return;
                    }
                    if (e.key === 'Enter' && items[mentionActiveIndex]) {
                        e.preventDefault();
                        insertMention(items[mentionActiveIndex]);
                        return;
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        hideMentionList();
                        return;
                    }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    hideMentionList();
                    sendMessage();
                }
            });
            input.addEventListener('blur', function() {
                setTimeout(hideMentionList, 150);
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

    window.orgChatRequestNotificationPermission = requestChatNotificationPermission;
    window.orgChatStartBackgroundWatch = startBackgroundChatWatch;
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
            notifyPendingMentions(messages);
        }
    };

    function checkOfflineMentions() {
        if (panelOpen) return;
        if (!shouldRunBackgroundChatWatch()) return;
        fetchChatMessages().then(function(messages) {
            if (!messages) return;
            messages.forEach(function(m) {
                if (m && m.id) knownMessageIds[m.id] = true;
            });
            ensureChatSeenBaseline(messages);
            notifyPendingMentions(messages);
            recalcUnreadFromMessages(messages);
        });
    }

    window.orgChatRefreshNotifications = fetchChatForNotifications;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
